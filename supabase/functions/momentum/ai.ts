import Anthropic from 'npm:@anthropic-ai/sdk';
import type { FoodAnalysis } from './handlers.ts';

/**
 * Estimates the nutrition of a food photo with Claude. Structured output guarantees the JSON
 * shape; values are clamped to sane ranges before they reach the app, which always lets the
 * person correct them before logging. Errors that start with "IA:" are shown to the person.
 */

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['is_food', 'name', 'items', 'calories', 'protein', 'carbs', 'fat', 'fiber', 'confidence'],
  properties: {
    is_food: { type: 'boolean', description: 'false if the photo shows no food or drink' },
    name: { type: 'string', description: 'Nombre corto del plato en español rioplatense, p. ej. "Milanesa con puré"' },
    items: {
      type: 'array',
      description: 'Componentes visibles con su peso estimado en gramos',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'grams'],
        properties: { name: { type: 'string' }, grams: { type: 'integer' } },
      },
    },
    calories: { type: 'number', description: 'kcal totales de lo que se ve' },
    protein: { type: 'number', description: 'gramos de proteína' },
    carbs: { type: 'number', description: 'gramos de carbohidratos' },
    fat: { type: 'number', description: 'gramos de grasa' },
    fiber: { type: 'number', description: 'gramos de fibra' },
    confidence: { type: 'string', enum: ['alta', 'media', 'baja'] },
  },
} as const;

const SYSTEM =
  'Sos un nutricionista que estima calorías y macronutrientes a partir de una foto de comida. ' +
  'Estimá la porción completa que se ve (no por 100 g), usando tamaños de porción habituales en Uruguay y Argentina. ' +
  'Si hay elementos de referencia (plato, cubiertos, manos), usalos para estimar el tamaño. ' +
  'Escribí los nombres en español rioplatense. Si la foto es ambigua, da tu mejor estimación y bajá la confianza.';

const clamp = (v: unknown, max: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(0, v)) : 0);

export function createFoodAnalyzer(apiKey: string) {
  const client = new Anthropic({ apiKey });

  return async function analyzeFood(jpegBase64: string): Promise<FoodAnalysis> {
    let response;
    try {
      // `fallbacks: "default"` retries a safety decline on Anthropic's recommended model server-side.
      response = await client.beta.messages.create({
        model: 'claude-opus-5-5',
        max_tokens: 16000,
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        output_config: { effort: 'low', format: { type: 'json_schema', schema: SCHEMA } },
        system: SYSTEM,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: jpegBase64 } },
              { type: 'text', text: 'Estimá las calorías, la proteína, los carbohidratos, las grasas y la fibra de esta comida.' },
            ],
          },
        ],
        // deno-lint-ignore no-explicit-any
      } as any);
    } catch (e) {
      if (e instanceof Anthropic.RateLimitError) throw new Error('IA: El servicio de IA está ocupado. Probá de nuevo en un minuto.');
      if (e instanceof Anthropic.AuthenticationError) throw new Error('IA: La IA no está bien configurada en el servidor.');
      if (e instanceof Anthropic.BadRequestError) throw new Error('IA: No pudimos leer la foto. Probá con otra.');
      throw e;
    }

    if (response.stop_reason === 'refusal') throw new Error('IA: No pudimos analizar esta foto. Cargala a mano.');
    if (response.stop_reason === 'max_tokens') throw new Error('IA: La respuesta quedó incompleta. Probá de nuevo.');
    // deno-lint-ignore no-explicit-any
    const text = (response.content as any[]).find((b) => b.type === 'text')?.text;
    if (!text) throw new Error('IA: No pudimos analizar la foto. Probá de nuevo.');
    const raw = JSON.parse(text) as Record<string, unknown>;
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
  };
}
