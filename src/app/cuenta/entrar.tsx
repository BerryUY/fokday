import { useState } from 'react';
import { View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { finishSignIn, resetPasswordWithCode, sendPasswordCode, signInWithEmail, signInWithGoogle, signUpWithEmail, validEmail, WRONG_CREDENTIALS, type LinkChoice } from '@/auth/account';
import { cloudApi } from '@/backup/api';
import { defaultApiUrl } from '@/backup/service';
import { LinkChoiceSheet } from '@/components/CloudLink';
import { GoogleButton } from '@/components/GoogleButton';
import { Field } from '@/components/ui/form';
import { Screen } from '@/components/ui/layout';
import { Button, Card, Row, T } from '@/components/ui/primitives';
import { goBack } from '@/lib/nav';
import { useDb } from '@/state/db';
import { useToast } from '@/state/toast';
import { space } from '@/theme/tokens';

type Mode = 'start' | 'signin' | 'signup' | 'reset';
/** Why a sign-in failed, when we know more than "wrong email or password". */
type Hint = { text: string; action: 'signup' | 'google' | 'reset' };

/** Sign in or create an account (Google or email). Optional: the app works without one. */
export default function SignInScreen() {
  const db = useDb();
  const toast = useToast();
  const [mode, setMode] = useState<Mode>('start');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [choice, setChoice] = useState<LinkChoice | null>(null);
  const [hint, setHint] = useState<Hint | null>(null);

  /**
   * Email sign-in. Supabase answers the same for an unknown email and a wrong password, so on that
   * answer we ask the server which one it is and say it plainly.
   */
  const signIn = async () => {
    try {
      await signInWithEmail(email, password);
    } catch (e) {
      if (!(e instanceof Error) || e.message !== WRONG_CREDENTIALS) throw e;
      const kind = await cloudApi.accountKind(defaultApiUrl(), email).then((r) => r.kind, () => null);
      if (kind === 'none') setHint({ text: `No hay ninguna cuenta con ${email.trim()}. Podés crearla ahora con este email y esta contraseña.`, action: 'signup' });
      else if (kind === 'google') setHint({ text: 'Esa cuenta se creó con Google, así que no tiene contraseña. Iniciá sesión con Google.', action: 'google' });
      else if (kind === 'password') setHint({ text: 'La contraseña no es correcta. Si no te acordás, podés cambiarla con un código por email.', action: 'reset' });
      else throw e;
      return false;
    }
    return true;
  };

  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    try {
      await fn();
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Algo salió mal';
      if (msg !== 'cancelled') toast.show(msg, 'error');
    } finally {
      setBusy(null);
    }
  };

  /** Once signed in: move this phone's older profile into the account and start backups. */
  const done = async () => {
    const pending = await finishSignIn(db);
    toast.show('¡Listo! Tu progreso se guarda en tu cuenta');
    if (pending) setChoice(pending);
    else goBack();
  };

  const emailOk = validEmail(email);

  return (
    <Screen title={mode === 'signup' ? 'Crear cuenta' : mode === 'reset' ? 'Recuperar contraseña' : 'Iniciar sesión'}>
      <Animated.View key={mode} entering={FadeIn.duration(220)} style={{ gap: space.lg }}>
        {mode === 'start' ? (
          <>
            <Card tone="alt" style={{ gap: space.sm }}>
              <T variant="h3">Guardá tu progreso</T>
              <T variant="label" tone="muted">
                Con una cuenta tus datos se respaldan solos y los recuperás en otro teléfono. También activa la foto con IA, el escáner de códigos y las comidas de la Comunidad.
              </T>
            </Card>
            <GoogleButton loading={busy === 'google'} onPress={() => run('google', async () => { await signInWithGoogle(); await done(); })} />
            <Button label="Iniciar sesión con email" icon="mail" variant="secondary" size="lg" onPress={() => setMode('signin')} />
            <Button label="Crear cuenta con email" variant="ghost" onPress={() => setMode('signup')} />
          </>
        ) : null}

        {mode === 'signin' || mode === 'signup' ? (
          <>
            {mode === 'signup' ? <Field label="Tu nombre" value={name} onChangeText={setName} placeholder="Opcional" autoComplete="name" /> : null}
            <Field label="Email" value={email} onChangeText={setEmail} placeholder="tu@email.com" keyboardType="email-address" autoCapitalize="none" autoCorrect={false} autoComplete="email" error={email && !emailOk ? 'Revisá el email' : null} />
            <Field
              label="Contraseña"
              value={password}
              onChangeText={setPassword}
              placeholder={mode === 'signup' ? 'Al menos 8 caracteres' : ''}
              secureTextEntry
              autoCapitalize="none"
              autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
              error={mode === 'signup' && password && password.length < 8 ? 'Al menos 8 caracteres' : null}
            />
            <Button
              label={mode === 'signup' ? 'Crear cuenta' : 'Iniciar sesión'}
              icon="check"
              size="lg"
              loading={busy === 'email'}
              disabled={!emailOk || password.length < (mode === 'signup' ? 8 : 1)}
              onPress={() =>
                run('email', async () => {
                  setHint(null);
                  if (mode === 'signup') await signUpWithEmail(email, password, name);
                  else if (!(await signIn())) return;
                  await done();
                })
              }
            />
            {hint && mode === 'signin' ? (
              <Animated.View entering={FadeIn.duration(200)}>
                <Card tone="alt" style={{ gap: space.md }}>
                  <T variant="label">{hint.text}</T>
                  <Button
                    label={hint.action === 'signup' ? 'Crear mi cuenta' : hint.action === 'google' ? 'Iniciar sesión con Google' : 'Cambiar mi contraseña'}
                    icon={hint.action === 'signup' ? 'user-plus' : hint.action === 'google' ? 'log-in' : 'key'}
                    variant="secondary"
                    onPress={() => {
                      setHint(null);
                      setMode(hint.action === 'signup' ? 'signup' : hint.action === 'google' ? 'start' : 'reset');
                    }}
                  />
                </Card>
              </Animated.View>
            ) : null}
            <Row style={{ justifyContent: 'space-between' }}>
              <Button label={mode === 'signup' ? 'Ya tengo cuenta' : 'Crear cuenta'} variant="ghost" size="sm" onPress={() => setMode(mode === 'signup' ? 'signin' : 'signup')} />
              {mode === 'signin' ? <Button label="Olvidé mi contraseña" variant="ghost" size="sm" onPress={() => setMode('reset')} /> : null}
            </Row>
            <Button label="Volver" variant="ghost" size="sm" onPress={() => setMode('start')} />
          </>
        ) : null}

        {mode === 'reset' ? (
          <>
            <T variant="label" tone="muted">Te mandamos un código de 6 dígitos a tu email. Lo escribís acá junto con tu nueva contraseña.</T>
            <Field label="Email" value={email} onChangeText={setEmail} placeholder="tu@email.com" keyboardType="email-address" autoCapitalize="none" autoCorrect={false} autoComplete="email" />
            {!codeSent ? (
              <Button label="Mandarme el código" icon="send" loading={busy === 'code'} disabled={!emailOk} onPress={() => run('code', async () => { await sendPasswordCode(email); setCodeSent(true); toast.show('Te mandamos el código. Revisá tu correo.'); })} />
            ) : (
              <View style={{ gap: space.lg }}>
                <Field label="Código" value={code} onChangeText={(v) => setCode(v.replace(/\D/g, '').slice(0, 8))} placeholder="123456" keyboardType="number-pad" autoComplete="one-time-code" />
                <Field label="Nueva contraseña" value={password} onChangeText={setPassword} placeholder="Al menos 8 caracteres" secureTextEntry autoCapitalize="none" autoComplete="new-password" />
                <Button
                  label="Cambiar contraseña e iniciar sesión"
                  icon="check"
                  loading={busy === 'reset'}
                  disabled={code.length < 6 || password.length < 8}
                  onPress={() => run('reset', async () => { await resetPasswordWithCode(email, code, password); await done(); })}
                />
                <Button label="Mandar otro código" variant="ghost" size="sm" onPress={() => run('code', () => sendPasswordCode(email))} />
              </View>
            )}
            <Button label="Volver" variant="ghost" size="sm" onPress={() => setMode('signin')} />
          </>
        ) : null}
      </Animated.View>

      <LinkChoiceSheet
        choice={choice}
        onClose={() => {
          setChoice(null);
          goBack();
        }}
      />
    </Screen>
  );
}
