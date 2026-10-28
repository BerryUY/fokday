/**
 * Public settings that ship inside the app. Everything here is meant to be public (it is visible
 * in any APK anyway): addresses and client ids, never secrets. Secret keys (Supabase service key,
 * Gemini, RevenueCat secret) live only in the Supabase function's secrets.
 */
export const PUBLIC_CONFIG = {
  /** FokDay API (Supabase Edge Function). */
  apiUrl: 'https://eqvyjnhkhyqzwurdtumh.supabase.co/functions/v1/momentum',
  supabaseUrl: 'https://eqvyjnhkhyqzwurdtumh.supabase.co',
  /** Supabase publishable key: public by design; every table is closed to it (RLS without policies). */
  supabasePublishableKey: 'sb_publishable_SwzPD8gg9vVtjNowByM_fw_x9DQ1KtF',
  /** Google OAuth "Web" client id (from Google Cloud); empty until Google sign-in is set up. */
  googleWebClientId: '',
  /** RevenueCat public Android SDK key (starts with goog_); empty until RevenueCat is set up. */
  revenueCatAndroidKey: '',
  /** AdMob rewarded ad unit (ca-app-pub-…/…); empty uses Google's test unit. */
  admobRewardedUnitAndroid: '',
} as const;
