/**
 * Verifies AdMob rewarded-ad server-side verification (SSV) callbacks. Google signs everything
 * in the query string before "&signature=" with ECDSA P-256 / SHA-256; the public keys are
 * published as JSON and rotate, so they are cached and re-fetched when a key id is unknown.
 * Uses only WebCrypto, so it runs the same in Deno and in the Jest tests.
 */

export const ADMOB_KEYS_URL = 'https://www.gstatic.com/admob/reward/verifier-keys.json';

export type VerifierKey = { keyId: number | string; base64: string };

const b64 = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(s.length / 4) * 4, '=')), (c) => c.charCodeAt(0));

/** DER-encoded ECDSA signature → the 64-byte r||s form WebCrypto expects. */
export function derToRaw(der: Uint8Array): Uint8Array<ArrayBuffer> | null {
  if (der[0] !== 0x30) return null;
  let i = 2;
  const out = new Uint8Array(new ArrayBuffer(64));
  for (let part = 0; part < 2; part++) {
    if (der[i] !== 0x02) return null;
    let len = der[i + 1];
    let start = i + 2;
    i = start + len;
    // Strip the sign padding and left-pad to 32 bytes.
    while (len > 32 && der[start] === 0) {
      start++;
      len--;
    }
    if (len > 32) return null;
    out.set(der.subarray(start, start + len), part * 32 + (32 - len));
  }
  return out;
}

export function createAdRewardVerifier(fetchKeys: () => Promise<VerifierKey[]>, cacheMs = 3_600_000) {
  let cached: { at: number; keys: VerifierKey[] } | null = null;
  const keys = async (fresh = false) => {
    if (!fresh && cached && Date.now() - cached.at < cacheMs) return cached.keys;
    cached = { at: Date.now(), keys: await fetchKeys() };
    return cached.keys;
  };

  return async function verifyAdReward(rawQuery: string): Promise<boolean> {
    const at = rawQuery.indexOf('&signature=');
    if (at < 0) return false;
    const message = new TextEncoder().encode(rawQuery.slice(0, at));
    const params = new URLSearchParams(rawQuery);
    const signature = params.get('signature');
    const keyId = params.get('key_id');
    if (!signature || !keyId) return false;
    let key = (await keys()).find((k) => String(k.keyId) === keyId);
    if (!key) key = (await keys(true)).find((k) => String(k.keyId) === keyId);
    if (!key) return false;
    const raw = derToRaw(b64(signature));
    if (!raw) return false;
    try {
      const pub = await crypto.subtle.importKey('spki', b64(key.base64), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
      return await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, pub, raw, message);
    } catch {
      return false;
    }
  };
}

/** Google's published keys. */
export async function fetchAdMobKeys(): Promise<VerifierKey[]> {
  const res = await fetch(ADMOB_KEYS_URL, { signal: AbortSignal.timeout(8_000) });
  if (!res.ok) throw new Error(`AdMob keys ${res.status}`);
  const body = (await res.json()) as { keys?: VerifierKey[] };
  return body.keys ?? [];
}
