import type { BarcodeProduct } from './handlers.ts';

/**
 * Open Food Facts (open database of packaged foods) for the barcode scanner. Plain fetch, so it
 * runs the same in Deno and in the Jest tests. Values are per 100 g; the app scales them to the
 * amount eaten.
 */

export const OFF_FIELDS = 'code,product_name,product_name_es,generic_name,brands,nutriments,serving_quantity';

type Nutriments = Record<string, unknown>;
type OffProduct = { code?: string; product_name?: string; product_name_es?: string; generic_name?: string; brands?: string; nutriments?: Nutriments; serving_quantity?: unknown };

const num = (v: unknown): number | null => {
  const n = typeof v === 'string' ? Number(v.replace(',', '.')) : v;
  return typeof n === 'number' && Number.isFinite(n) && n >= 0 ? n : null;
};
const round1 = (n: number) => Math.round(n * 10) / 10;

/** Picks name, brand and per-100 g nutrients; kcal come from kJ when only those are present. */
export function parseOffProduct(code: string, body: unknown): BarcodeProduct | null {
  const b = (body ?? {}) as { status?: unknown; product?: OffProduct };
  if (b.status !== 1 || !b.product) return null;
  const p = b.product;
  const n = p.nutriments ?? {};
  const kcal = num(n['energy-kcal_100g']) ?? (num(n['energy-kj_100g']) !== null ? num(n['energy-kj_100g'])! / 4.184 : null) ?? (num(n['energy_100g']) !== null ? num(n['energy_100g'])! / 4.184 : null);
  const protein = num(n['proteins_100g']);
  const name = [p.product_name_es, p.product_name, p.generic_name].map((x) => (typeof x === 'string' ? x.trim() : '')).find(Boolean);
  // Without a name or energy there is nothing useful to log.
  if (!name || kcal === null) return null;
  const opt = (k: string) => {
    const v = num(n[k]);
    return v === null ? null : round1(v);
  };
  const serving = num(p.serving_quantity);
  return {
    code,
    name: name.slice(0, 80),
    brand: typeof p.brands === 'string' && p.brands.trim() ? p.brands.split(',')[0].trim().slice(0, 60) : null,
    per100g: { calories: Math.round(kcal), protein: protein === null ? 0 : round1(protein), carbs: opt('carbohydrates_100g'), fat: opt('fat_100g'), fiber: opt('fiber_100g') },
    servingGrams: serving && serving > 0 && serving <= 2000 ? Math.round(serving) : null,
  };
}

type FetchFn = (url: string, init: { headers: Record<string, string>; signal?: AbortSignal }) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>;

/** Open Food Facts asks every app to identify itself with a User-Agent. */
export function createBarcodeLookup(userAgent: string, fetchFn: FetchFn = fetch as unknown as FetchFn) {
  return async function lookupBarcode(code: string): Promise<BarcodeProduct | null> {
    const res = await fetchFn(`https://world.openfoodfacts.org/api/v2/product/${code}?fields=${OFF_FIELDS}`, {
      headers: { 'User-Agent': userAgent, Accept: 'application/json' },
      signal: AbortSignal.timeout(12_000),
    });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`Open Food Facts respondió ${res.status}`);
    return parseOffProduct(code, await res.json());
  };
}
