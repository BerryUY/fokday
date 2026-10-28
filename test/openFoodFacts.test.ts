import { createBarcodeLookup, parseOffProduct } from '../supabase/functions/momentum/openFoodFacts';

describe('Open Food Facts', () => {
  it('reads name, brand, nutrients per 100 g and the package serving', () => {
    const product = parseOffProduct('7790310984147', {
      status: 1,
      product: {
        product_name: 'Galletitas de agua',
        brands: 'Marca Uno, Marca Dos',
        serving_quantity: '30',
        nutriments: { 'energy-kcal_100g': 432.6, proteins_100g: 9.04, carbohydrates_100g: '70,5', fat_100g: 12, fiber_100g: 2.6 },
      },
    });
    expect(product).toEqual({
      code: '7790310984147',
      name: 'Galletitas de agua',
      brand: 'Marca Uno',
      per100g: { calories: 433, protein: 9, carbs: 70.5, fat: 12, fiber: 2.6 },
      servingGrams: 30,
    });
  });

  it('prefers the Spanish name and computes kcal from kJ when needed', () => {
    const product = parseOffProduct('123', { status: 1, product: { product_name: 'Milk', product_name_es: 'Leche', nutriments: { 'energy-kj_100g': 268 } } });
    expect(product).toMatchObject({ name: 'Leche', brand: null, per100g: { calories: 64, protein: 0, carbs: null }, servingGrams: null });
  });

  it('treats unknown products or products without energy as not found', () => {
    expect(parseOffProduct('1', { status: 0 })).toBeNull();
    expect(parseOffProduct('1', { status: 1, product: { product_name: 'Agua', nutriments: {} } })).toBeNull();
    expect(parseOffProduct('1', { status: 1, product: { nutriments: { 'energy-kcal_100g': 10 } } })).toBeNull();
  });

  it('identifies itself and maps a 404 to "not found"', async () => {
    const seen: { url: string; ua: string }[] = [];
    const lookup = createBarcodeLookup('FokDay/1.3', async (url, init) => {
      seen.push({ url, ua: init.headers['User-Agent'] });
      return { ok: false, status: 404, json: async () => ({}) };
    });
    expect(await lookup('7790310984147')).toBeNull();
    expect(seen[0].url).toContain('/api/v2/product/7790310984147');
    expect(seen[0].ua).toBe('FokDay/1.3');
  });
});
