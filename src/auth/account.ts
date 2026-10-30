import type { Session } from '@supabase/supabase-js';
import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { ApiError, cloudApi, type CloudBackupMeta } from '@/backup/api';
import { backupNow, clearLegacyConfig, getCloudConfig, getLegacyConfig, refreshSyncState } from '@/backup/service';
import { getSyncInfo, setLinked } from '@/backup/sync';
import { PUBLIC_CONFIG } from '@/config';
import type { Db } from '@/db/types';
import { authConfigured, supabase } from './supabase';

// Google's SDK loads on first use, so a problem in it can never stop the app from opening.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const google = (): typeof import('@react-native-google-signin/google-signin') => require('@react-native-google-signin/google-signin');

/**
 * Optional accounts: Google or email and password (Supabase Auth). An account is what unlocks
 * the cloud (backups, AI photo, barcode, shared library, Pro); everything else works without one.
 */

/** avatarUrl: the Google profile picture, used until the person picks their own. */
export type Account = { id: string; email: string | null; name: string | null; provider: string; avatarUrl: string | null };

const toAccount = (session: Session | null): Account | null => {
  const u = session?.user;
  if (!u) return null;
  const meta = (u.user_metadata ?? {}) as Record<string, unknown>;
  const name = [meta.full_name, meta.name].find((v) => typeof v === 'string' && v.trim()) as string | undefined;
  const picture = [meta.avatar_url, meta.picture].find((v) => typeof v === 'string' && v.startsWith('https://')) as string | undefined;
  return { id: u.id, email: u.email ?? null, name: name ?? null, provider: String(u.app_metadata?.provider ?? 'email'), avatarUrl: picture ?? null };
};

/** The signed-in account (null when signed out) and whether it is still loading. */
export function useAccount(): { account: Account | null; loading: boolean } {
  const [state, setState] = useState<{ account: Account | null; loading: boolean }>({ account: null, loading: authConfigured });
  useEffect(() => {
    if (!authConfigured) return;
    let alive = true;
    supabase.auth.getSession().then(({ data }) => alive && setState({ account: toAccount(data.session), loading: false }));
    const { data } = supabase.auth.onAuthStateChange((_event, session) => setState({ account: toAccount(session), loading: false }));
    return () => {
      alive = false;
      data.subscription.unsubscribe();
    };
  }, []);
  return state;
}

export async function currentAccount(): Promise<Account | null> {
  if (!authConfigured) return null;
  const { data } = await supabase.auth.getSession();
  return toAccount(data.session);
}

/** Supabase's answer when the email or the password is wrong (it doesn't say which). */
export const WRONG_CREDENTIALS = 'El email o la contraseña no coinciden.';

/** Supabase's English errors, in the app's words. */
function friendly(e: unknown): Error {
  const msg = e instanceof Error ? e.message : String(e);
  if (/invalid login credentials/i.test(msg)) return new Error(WRONG_CREDENTIALS);
  if (/already registered|already exists/i.test(msg)) return new Error('Ya hay una cuenta con ese email. Iniciá sesión con tu contraseña.');
  if (/password should be at least|weak password/i.test(msg)) return new Error('La contraseña tiene que tener al menos 8 caracteres.');
  if (/rate limit|too many/i.test(msg)) return new Error('Demasiados intentos. Esperá unos minutos y probá de nuevo.');
  if (/token has expired|invalid.*otp|otp.*invalid/i.test(msg)) return new Error('El código no es válido o venció. Pedí uno nuevo.');
  if (/email not confirmed/i.test(msg)) return new Error('Falta confirmar el email. Revisá tu correo.');
  if (/email address .* is invalid|invalid email/i.test(msg)) return new Error('Ese email no es válido. Usá uno real.');
  if (/not authorized|error sending/i.test(msg)) return new Error('No pudimos mandarte el email. Probá más tarde o entrá con Google.');
  if (/network|fetch/i.test(msg)) return new Error('Sin conexión. Probá de nuevo cuando tengas internet.');
  return new Error(msg || 'No pudimos completar el ingreso.');
}

function ensureConfigured() {
  if (!authConfigured) throw new Error('Las cuentas todavía no están activadas en esta versión.');
}

const googleWebClientId = (): string => PUBLIC_CONFIG.googleWebClientId;

export async function signInWithGoogle(): Promise<void> {
  ensureConfigured();
  if (Platform.OS === 'web') throw new Error('Iniciar sesión con Google funciona desde el teléfono.');
  if (!googleWebClientId()) throw new Error('Iniciar sesión con Google todavía no está activado. Usá tu email por ahora.');
  const { GoogleSignin, isErrorWithCode, isSuccessResponse, statusCodes } = google();
  GoogleSignin.configure({ webClientId: googleWebClientId() });
  try {
    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
    const res = await GoogleSignin.signIn();
    if (!isSuccessResponse(res)) throw new Error('cancelled');
    const token = res.data.idToken;
    if (!token) throw new Error('Google no devolvió la identificación. Probá de nuevo.');
    const { error } = await supabase.auth.signInWithIdToken({ provider: 'google', token });
    if (error) throw friendly(error);
  } catch (e) {
    if (e instanceof Error && e.message === 'cancelled') throw e;
    if (isErrorWithCode(e) && e.code === statusCodes.SIGN_IN_CANCELLED) throw new Error('cancelled');
    if (isErrorWithCode(e) && e.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) throw new Error('Este teléfono no tiene Google Play Services. Iniciá sesión con tu email.');
    throw friendly(e);
  }
}

export const validEmail = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim());

export async function signUpWithEmail(email: string, password: string, name: string): Promise<void> {
  ensureConfigured();
  if (!validEmail(email)) throw new Error('Revisá el email.');
  if (password.length < 8) throw new Error('La contraseña tiene que tener al menos 8 caracteres.');
  const { data, error } = await supabase.auth.signUp({ email: email.trim().toLowerCase(), password, options: { data: { full_name: name.trim() || undefined } } });
  if (error) throw friendly(error);
  if (!data.session) throw new Error('Te mandamos un email para confirmar la cuenta. Confirmala y después entrá.');
}

export async function signInWithEmail(email: string, password: string): Promise<void> {
  ensureConfigured();
  const { error } = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
  if (error) throw friendly(error);
}

/** Sends a 6-digit code to reset the password (no links to open: the code is typed in the app). */
export async function sendPasswordCode(email: string): Promise<void> {
  ensureConfigured();
  if (!validEmail(email)) throw new Error('Revisá el email.');
  const { error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase());
  if (error) throw friendly(error);
}

export async function resetPasswordWithCode(email: string, code: string, password: string): Promise<void> {
  ensureConfigured();
  if (password.length < 8) throw new Error('La contraseña tiene que tener al menos 8 caracteres.');
  const { error } = await supabase.auth.verifyOtp({ email: email.trim().toLowerCase(), token: code.trim(), type: 'recovery' });
  if (error) throw friendly(error);
  const { error: updateError } = await supabase.auth.updateUser({ password });
  if (updateError) throw friendly(updateError);
}

/** What to do with backups already in the account, when this phone also has its own data. */
export type LinkChoice = { count: number; latest: CloudBackupMeta };

/**
 * After signing in: an older install's profile moves into the account (its backups follow), and
 * automatic backups start. If the account already has backups and this phone was not using them,
 * the person decides (restore or keep this phone's data), so nothing is overwritten silently.
 */
export async function finishSignIn(db: Db): Promise<LinkChoice | null> {
  const legacy = await getLegacyConfig();
  const config = await getCloudConfig();
  if (!config) return null;
  if (legacy) {
    try {
      await cloudApi.linkProfile(config, legacy.token);
    } catch (e) {
      // 404: the old token no longer exists; anything else is shown to the person.
      if (!(e instanceof ApiError && e.status === 404)) throw e;
    }
    await clearLegacyConfig();
  }
  const status = await cloudApi.status(config);
  const info = await getSyncInfo(db);
  void refreshSyncState();
  if (status.count === 0 || !status.latest) {
    await setLinked(db, true);
    void backupNow(true);
    return null;
  }
  return info.linked ? null : { count: status.count, latest: status.latest };
}

export async function signOut(db: Db): Promise<void> {
  if (Platform.OS !== 'web' && googleWebClientId()) await Promise.resolve().then(() => google().GoogleSignin.signOut()).catch(() => {});
  await supabase.auth.signOut().catch(() => {});
  await clearLegacyConfig();
  await setLinked(db, false);
  void refreshSyncState();
}

/** Deletes the account, its profile and every cloud backup. This phone's data stays. */
export async function deleteAccount(db: Db): Promise<void> {
  const config = await getCloudConfig();
  if (config) await cloudApi.deleteProfile(config);
  await signOut(db);
}
