import { Platform } from 'react-native';
import { PUBLIC_CONFIG } from '@/config';

// The AdMob SDK loads on first use, so a problem in it can never stop the app from opening.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const ads = (): typeof import('react-native-google-mobile-ads') => require('react-native-google-mobile-ads');

/**
 * Optional rewarded videos: a free account watches a short video to earn one more AI photo
 * (2 videos) or barcode scan (1 video). No banners or interstitials anywhere. The reward is
 * credited by the FokDay server when AdMob calls it back (signed server-side verification); the
 * phone never grants it, it only waits for the server to confirm.
 */

export type RewardKind = 'photo' | 'barcode';

const unitId = () => PUBLIC_CONFIG.admobRewardedUnitAndroid || ads().TestIds.REWARDED;
let ready: Promise<boolean> | null = null;

/** Consent first (Google's UMP form when the law asks for it), then the SDK; once per launch. */
function ensureAds(): Promise<boolean> {
  if (!ready) {
    ready = (async () => {
      const { AdsConsent, default: mobileAds } = ads();
      try {
        await AdsConsent.gatherConsent();
      } catch {
        // The SDK keeps the previous session's consent; ads are still checked below.
      }
      const { canRequestAds } = await AdsConsent.getConsentInfo();
      if (canRequestAds) await mobileAds().initialize();
      return canRequestAds;
    })().catch(() => false);
  }
  return ready;
}

export const videosAvailable = () => Platform.OS === 'android';

/**
 * Loads and shows one rewarded video. Resolves true when the person watched it to the end.
 * userId (the account) and kind travel signed to the server, which credits the reward.
 */
export async function watchRewardedVideo(kind: RewardKind, accountId: string): Promise<boolean> {
  if (!videosAvailable()) throw new Error('Los videos funcionan desde el teléfono.');
  if (!(await ensureAds())) throw new Error('Sin permiso para mostrar videos. Podés cambiarlo en Ajustes → Privacidad de anuncios.');
  const { AdEventType, RewardedAd, RewardedAdEventType } = ads();
  const ad = RewardedAd.createForAdRequest(unitId(), {
    serverSideVerificationOptions: { userId: accountId, customData: kind },
  });
  return new Promise<boolean>((resolve, reject) => {
    let earned = false;
    let shown = false;
    const subs: (() => void)[] = [];
    const done = (fn: () => void) => {
      subs.forEach((u) => u());
      clearTimeout(timer);
      fn();
    };
    const timer = setTimeout(() => done(() => reject(new Error('No hay videos disponibles ahora. Probá en un rato.'))), 20_000);
    subs.push(
      ad.addAdEventListener(RewardedAdEventType.LOADED, () => {
        shown = true;
        clearTimeout(timer);
        ad.show().catch(() => done(() => reject(new Error('No se pudo mostrar el video.'))));
      }),
      ad.addAdEventListener(RewardedAdEventType.EARNED_REWARD, () => {
        earned = true;
      }),
      ad.addAdEventListener(AdEventType.CLOSED, () => done(() => resolve(earned))),
      ad.addAdEventListener(AdEventType.ERROR, () => done(() => reject(new Error(shown ? 'El video se cortó. Probá de nuevo.' : 'No hay videos disponibles ahora. Probá en un rato.')))),
    );
    ad.load();
  });
}

/** Lets the person review the ads consent choice (required where the law asks for it). */
export async function showAdsPrivacyOptions(): Promise<void> {
  if (!videosAvailable()) return;
  await ads().AdsConsent.showPrivacyOptionsForm().catch(() => {});
}
