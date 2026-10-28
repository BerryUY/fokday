/**
 * Web build (previews): AdMob is native-only, so rewarded videos are simply unavailable here.
 * Same exports as rewarded.ts.
 */

export type RewardKind = 'photo' | 'barcode';

export const videosAvailable = () => false;

export async function watchRewardedVideo(_kind: RewardKind, _accountId: string): Promise<boolean> {
  throw new Error('Los videos funcionan desde el teléfono.');
}

export async function showAdsPrivacyOptions(): Promise<void> {}
