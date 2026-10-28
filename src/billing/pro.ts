import { useSyncExternalStore } from 'react';
import { Linking, Platform } from 'react-native';
import type { CustomerInfo, PurchasesPackage } from 'react-native-purchases';
import { cloudApi, type Quota } from '@/backup/api';
import { getCloudConfig } from '@/backup/service';
import { PUBLIC_CONFIG } from '@/config';

/**
 * The Pro plan. Purchases go through Google Play (RevenueCat keeps track of them); the FokDay
 * server is the authority for what is limited (AI photos, barcodes, weekly summary), so the
 * phone only uses this state to show or lock screens.
 */

export const ENTITLEMENT = 'pro';
const ANDROID_PACKAGE = 'uy.santiago.momentum';
const storeAvailable = Platform.OS === 'android' && !!PUBLIC_CONFIG.revenueCatAndroidKey;

// Native SDKs load on first use, so a problem in one can never stop the app from opening.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const sdk = (): typeof import('react-native-purchases').default => require('react-native-purchases').default;

export type PlanState = {
  pro: boolean;
  /** Today's allowances from the server (null without an account or offline). */
  ai: Quota | null;
  barcode: Quota | null;
  loaded: boolean;
};

let state: PlanState = { pro: false, ai: null, barcode: null, loaded: false };
let storePro = false;
let serverPro = false;
const listeners = new Set<() => void>();
const set = (patch: Partial<PlanState>) => {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
};

export function usePlan(): PlanState {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
    () => state,
  );
}

export const usePro = () => usePlan().pro;

/** The current plan outside React (e.g. while waiting for a reward to be credited). */
export const getPlan = (): PlanState => state;

const activeIn = (info: CustomerInfo) => !!info.entitlements.active[ENTITLEMENT];
const applyStore = (info: CustomerInfo) => {
  storePro = activeIn(info);
  set({ pro: storePro || serverPro });
};

let configuredFor: string | null | undefined;

/** Ties purchases to the signed-in account, so Pro follows the person to another phone. */
export async function syncPurchasesAccount(accountId: string | null): Promise<void> {
  if (!storeAvailable || configuredFor === accountId) return;
  try {
    if (configuredFor === undefined) {
      sdk().configure({ apiKey: PUBLIC_CONFIG.revenueCatAndroidKey, appUserID: accountId ?? undefined });
      sdk().addCustomerInfoUpdateListener(applyStore);
    } else if (accountId) {
      await sdk().logIn(accountId);
    } else {
      await sdk().logOut().catch(() => {});
    }
    configuredFor = accountId;
    applyStore(await sdk().getCustomerInfo());
  } catch {
    // Without the store the app keeps working; Pro falls back to the server's answer.
  }
}

/** Refreshes Pro and today's allowances from the server (the source of truth for limits). */
export async function refreshPlan(): Promise<void> {
  const config = await getCloudConfig().catch(() => null);
  if (!config) {
    serverPro = false;
    set({ pro: storePro, ai: null, barcode: null, loaded: true });
    return;
  }
  try {
    const s = await cloudApi.status(config);
    serverPro = s.pro;
    set({ pro: s.pro || storePro, ai: s.ai, barcode: s.barcode, loaded: true });
  } catch {
    set({ loaded: true });
  }
}

/** Lets screens update a counter right after using it (e.g. a photo or a scan). */
export function setQuota(kind: 'ai' | 'barcode', quota: Quota): void {
  set({ [kind]: quota } as Partial<PlanState>);
}

export type PlanOption = { id: string; kind: 'monthly' | 'annual'; price: string; perMonth: string | null; pkg: PurchasesPackage };

/** Monthly and annual options with the store's local prices. */
export async function loadPlanOptions(): Promise<PlanOption[]> {
  if (!storeAvailable) return [];
  const offerings = await sdk().getOfferings();
  const current = offerings.current;
  if (!current) return [];
  const out: PlanOption[] = [];
  if (current.monthly) out.push({ id: current.monthly.identifier, kind: 'monthly', price: current.monthly.product.priceString, perMonth: null, pkg: current.monthly });
  if (current.annual) {
    const p = current.annual.product;
    const perMonth = p.pricePerMonthString ?? null;
    out.push({ id: current.annual.identifier, kind: 'annual', price: p.priceString, perMonth, pkg: current.annual });
  }
  return out;
}

export const storeReady = () => storeAvailable;

/** Buys a plan; false when the person cancelled the Play dialog. */
export async function buy(option: PlanOption): Promise<boolean> {
  try {
    const { customerInfo } = await sdk().purchasePackage(option.pkg);
    applyStore(customerInfo);
    await refreshPlan();
    return activeIn(customerInfo);
  } catch (e) {
    if ((e as { userCancelled?: boolean }).userCancelled) return false;
    throw new Error('No se pudo completar la compra. No se te cobró nada.');
  }
}

export async function restore(): Promise<boolean> {
  if (!storeAvailable) return false;
  const info = await sdk().restorePurchases();
  applyStore(info);
  await refreshPlan();
  return activeIn(info);
}

/** Cancelling or changing the plan happens in Google Play. */
export function manageSubscription(): void {
  void Linking.openURL(`https://play.google.com/store/account/subscriptions?package=${ANDROID_PACKAGE}`);
}
