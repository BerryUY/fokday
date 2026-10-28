import Anthropic from 'npm:@anthropic-ai/sdk';
import { FIELD_DESCRIPTIONS as D, parseAnalysis, REQUIRED_FIELDS, SYSTEM_PROMPT, USER_PROMPT } from './analysis.ts';
import type { FoodAnalysis } from './handlers.ts';

/**
 * Estimates the nutrition of a food photo with Claude (paid alternative to gemini.ts).
 * Structured output guarantees the JSON shape.
 */

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: REQUIRED_FIELDS,
  properties: {
    is_food: { type: 'boolean', description: D.is_food },
    name: { type: 'string', description: D.name },
    items: {
      type: 'array',
      description: D.items,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'grams'],
        properties: { name: { type: 'string' }, grams: { type: 'integer' } },
      },
    },
    calories: { type: 'number', description: D.calories },
    protein: { type: 'number', description: D.protein },
    carbs: { type: 'number', description: D.carbs },
    fat: { type: 'number', description: D.fat },
    fiber: { type: 'number', description: D.fiber },
    confidence: { type: 'string', enum: ['alta', 'media', 'baja'] },
  },
} as const;

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
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: jpegBase64 } },
              { type: 'text', text: USER_PROMPT },
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
    return parseAnalysis((response.content as any[]).find((b) => b.type === 'text')?.text);
  };
}
