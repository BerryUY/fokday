import type { FoodAnalysis } from './handlers.ts';

/**
 * What every AI provider is asked, and how its answer is cleaned up. Values are clamped to sane
 * ranges before they reach the app, which always lets the person correct them before logging.
 * Errors that start with "IA:" are shown to the person.
 */

/**
 * An AI failure. busy: another try (or another provider) may well work: overloaded, out of quota,
 * timed out, or a garbled answer. Not busy: retrying won't help (no food in the photo, bad image).
 */
export class AiError extends Error {
  constructor(message: string, readonly busy = false) {
    super(message);
  }
}

export const isBusy = (e: unknown) => e instanceof AiError && e.busy;

/**
 * Tries each analyzer in order, moving on only when one is busy, so a photo reaches another
 * provider instead of an error.
 */
export function chainAnalyzers<A extends unknown[], R>(...steps: ((...args: A) => Promise<R>)[]) {
  return async (...args: A): Promise<R> => {
    let last: unknown = new AiError('IA: El servicio de IA está ocupado. Probá de nuevo en un minuto.', true);
    for (const step of steps) {
      try {
        return await step(...args);
      } catch (e) {
        if (!isBusy(e)) throw e;
        last = e;
      }
    }
    throw last;
  };
}

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
  if (!text) throw new AiError('IA: No pudimos analizar la foto. Probá de nuevo.', true);
  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new AiError('IA: No pudimos analizar la foto. Probá de nuevo.', true);
  }
  if (raw.is_food === false) throw new AiError('IA: No vemos comida en la foto. Probá con otra.');

  const items = Array.isArray(raw.items)
    ? (raw.items as { name?: unknown; grams?: unknown }[])
        .filter((i) => typeof i.name === 'string' && i.name)
        .slice(0, 12)
        .map((i) => ({ name: String(i.name).slice(0, 60), grams: Math.round(clamp(i.grams, 10000)) }))
    : [];
  const confidence = raw.confidence === 'alta' || raw.confidence === 'baja' ? raw.confidence : 'media';
  return {
    name: typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim().slice(0, 80) : 'Comida',
    items,
    calories: Math.round(clamp(raw.calories, 20000)),
    protein: Math.round(clamp(raw.protein, 1500) * 10) / 10,
    carbs: Math.round(clamp(raw.carbs, 3000) * 10) / 10,
    fat: Math.round(clamp(raw.fat, 2000) * 10) / 10,
    fiber: Math.round(clamp(raw.fiber, 300) * 10) / 10,
    confidence,
  };
}
