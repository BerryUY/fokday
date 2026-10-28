import { createClient, type SupportedStorage } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';
import { AppState, Platform } from 'react-native';
import { PUBLIC_CONFIG } from '@/config';

/**
 * The Supabase client for accounts (Google or email). Only the project URL and the publishable
 * key ship in the app; they are public by design and every table is closed to them (RLS with no
 * policies), so the account session is the only thing that reaches the FokDay API.
 */

export const SUPABASE_URL: string = PUBLIC_CONFIG.supabaseUrl;
const PUBLISHABLE_KEY: string = PUBLIC_CONFIG.supabasePublishableKey;

/**
 * Sessions go to SecureStore (Android Keystore), never to plain files, so the refresh token is
 * not readable from a backup. SecureStore holds ~2 KB per item, so long values are chunked.
 */
const CHUNK = 1800;
const safeKey = (key: string) => key.replace(/[^A-Za-z0-9._-]/g, '_');

const secureStorage: SupportedStorage = {
  async getItem(key) {
    const k = safeKey(key);
    const count = Number(await SecureStore.getItemAsync(`${k}.n`));
    if (!count) return SecureStore.getItemAsync(k);
    const parts = await Promise.all(Array.from({ length: count }, (_, i) => SecureStore.getItemAsync(`${k}.${i}`)));
    return parts.some((p) => p === null) ? null : parts.join('');
  },
  async setItem(key, value) {
    const k = safeKey(key);
    await secureStorage.removeItem(key);
    const parts = value.match(new RegExp(`[\\s\\S]{1,${CHUNK}}`, 'g')) ?? [''];
    await Promise.all(parts.map((p, i) => SecureStore.setItemAsync(`${k}.${i}`, p)));
    await SecureStore.setItemAsync(`${k}.n`, String(parts.length));
  },
  async removeItem(key) {
    const k = safeKey(key);
    const count = Number(await SecureStore.getItemAsync(`${k}.n`)) || 0;
    await Promise.all([
      SecureStore.deleteItemAsync(k),
      SecureStore.deleteItemAsync(`${k}.n`),
      ...Array.from({ length: count }, (_, i) => SecureStore.deleteItemAsync(`${k}.${i}`)),
    ]);
  },
};

export const authConfigured = !!SUPABASE_URL && !!PUBLISHABLE_KEY;

export const supabase = createClient(SUPABASE_URL || 'https://invalid.localhost', PUBLISHABLE_KEY || 'missing', {
  auth: {
    // Web previews use the browser's storage; phones use SecureStore.
    storage: Platform.OS === 'web' ? undefined : secureStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

// The refresh loop only runs while the app is in front (Expo's recommended setup).
if (Platform.OS !== 'web') {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') supabase.auth.startAutoRefresh();
    else supabase.auth.stopAutoRefresh();
  });
}
