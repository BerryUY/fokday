import type { FoodAnalysis } from './handlers.ts';

/**
 * What every AI provider is asked, and how its answer is cleaned up. Values are clamped to sane
 * ranges before they reach the app, which always lets the person correct them before logging.
 * Errors that start with "IA:" are shown to the person.
 */

export const SYSTEM_PROMPT =
  'Sos un nutricionista que estima calorías y macronutrientes a partir de una foto de comida. ' +
  'Estimá la porción completa que se ve (no por 100 g), usando tamaños de porción habituales en Uruguay y Argentina. ' +
  'Si hay elementos de referencia (plato, cubiertos, manos), usalos para estimar el tamaño. ' +
  'Escribí los nombres en español rioplatense. Si la foto es ambigua, da tu mejor estimación y bajá la confianza.';

export const USER_PROMPT = 'Estimá las calorías, la proteína, los carbohidratos, las grasas y la fibra de esta comida.';

export const FIELD_DESCRIPTIONS = {
  is_food: 'false if the photo shows no food or drink',
  name: 'Nombre corto del plato en español rioplatense, p. ej. "Milanesa con puré"',
  items: 'Componentes visibles con su peso estimado en gramos',
  calories: 'kcal totales de lo que se ve',
  protein: 'gramos de proteína',
  carbs: 'gramos de carbohidratos',
  fat: 'gramos de grasa',
  fiber: 'gramos de fibra',
} as const;

export const REQUIRED_FIELDS = ['is_food', 'name', 'items', 'calories', 'protein', 'carbs', 'fat', 'fiber', 'confidence'];

const clamp = (v: unknown, max: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(0, v)) : 0);

/** Turns the model's JSON text into a FoodAnalysis, or throws an "IA:" error. */
export function parseAnalysis(text: string | undefined): FoodAnalysis {
  if (!text) throw new Error('IA: No pudimos analizar la foto. Probá de nuevo.');
  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new Error('IA: No pudimos analizar la foto. Probá de nuevo.');
  }
  if (raw.is_food === false) throw new Error('IA: No vemos comida en la foto. Probá con otra.');

  const items = Array.isArray(raw.items)
    ? (raw.items as { name?: unknown; grams?: unknown }[])
        .filter((i) => typeof i.name === 'string' && i.name)
        .slice(0, 12)
        .map((i) => ({ name: String(i.name).slice(0, 60), grams: Math.round(clamp(i.grams, 3000)) }))
    : [];
  const confidence = raw.confidence === 'alta' || raw.confidence === 'baja' ? raw.confidence : 'media';
  return {
    name: typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim().slice(0, 80) : 'Comida',
    items,
    calories: Math.round(clamp(raw.calories, 5000)),
    protein: Math.round(clamp(raw.protein, 500) * 10) / 10,
    carbs: Math.round(clamp(raw.carbs, 1000) * 10) / 10,
    fat: Math.round(clamp(raw.fat, 1000) * 10) / 10,
    fiber: Math.round(clamp(raw.fiber, 200) * 10) / 10,
    confidence,
  };
}
