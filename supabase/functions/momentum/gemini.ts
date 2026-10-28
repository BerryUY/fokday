import { FIELD_DESCRIPTIONS as D, parseAnalysis, REQUIRED_FIELDS, SYSTEM_PROMPT, USER_PROMPT } from './analysis.ts';
import type { FoodAnalysis } from './handlers.ts';

/**
 * Estimates the nutrition of a food photo with Google Gemini (free tier in Google AI Studio).
 * Plain REST, so it needs no SDK and runs the same in Deno and in the Jest tests.
 */

export const GEMINI_MODEL = 'gemini-3.8-flash';

type FetchFn = (url: string, init: { method: string; headers: Record<string, string>; body: string; signal?: AbortSignal }) => Promise<{
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
}>;

// responseSchema uses the OpenAPI subset Gemini understands (upper-case types, no additionalProperties).
const SCHEMA = {
  type: 'OBJECT',
  required: REQUIRED_FIELDS,
  properties: {
    is_food: { type: 'BOOLEAN', description: D.is_food },
    name: { type: 'STRING', description: D.name },
    items: {
      type: 'ARRAY',
      description: D.items,
      items: { type: 'OBJECT', required: ['name', 'grams'], properties: { name: { type: 'STRING' }, grams: { type: 'INTEGER' } } },
    },
    calories: { type: 'NUMBER', description: D.calories },
    protein: { type: 'NUMBER', description: D.protein },
    carbs: { type: 'NUMBER', description: D.carbs },
    fat: { type: 'NUMBER', description: D.fat },
    fiber: { type: 'NUMBER', description: D.fiber },
    confidence: { type: 'STRING', enum: ['alta', 'media', 'baja'] },
  },
};

type GeminiResponse = {
  promptFeedback?: { blockReason?: string };
  candidates?: { finishReason?: string; content?: { parts?: { text?: string; thought?: boolean }[] } }[];
  error?: { status?: string; message?: string };
};

export function createGeminiAnalyzer(apiKey: string, fetchFn: FetchFn = fetch as unknown as FetchFn, model = GEMINI_MODEL) {
  return async function analyzeFood(jpegBase64: string): Promise<FoodAnalysis> {
    const res = await fetchFn(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents: [{ role: 'user', parts: [{ text: USER_PROMPT }, { inlineData: { mimeType: 'image/jpeg', data: jpegBase64 } }] }],
        generationConfig: { responseMimeType: 'application/json', responseSchema: SCHEMA, maxOutputTokens: 8192 },
      }),
      signal: AbortSignal.timeout(50_000),
    });
    const body = (await res.json().catch(() => ({}))) as GeminiResponse;

    if (!res.ok) {
      const reason = `${body.error?.status ?? ''} ${body.error?.message ?? ''}`;
      if (res.status === 429) throw new Error('IA: Se llenó el cupo gratis de la IA por ahora. Probá en un rato o cargala a mano.');
      if (res.status === 401 || res.status === 403 || /API_KEY|API key/i.test(reason)) throw new Error('IA: La IA no está bien configurada en el servidor.');
      if (res.status === 400) throw new Error('IA: No pudimos leer la foto. Probá con otra.');
      if (res.status >= 500) throw new Error('IA: El servicio de IA está ocupado. Probá de nuevo en un minuto.');
      throw new Error(`Gemini respondió ${res.status}: ${reason.trim()}`);
    }

    if (body.promptFeedback?.blockReason) throw new Error('IA: No pudimos analizar esta foto. Cargala a mano.');
    const candidate = body.candidates?.[0];
    if (candidate?.finishReason === 'MAX_TOKENS') throw new Error('IA: La respuesta quedó incompleta. Probá de nuevo.');
    if (candidate?.finishReason && candidate.finishReason !== 'STOP') throw new Error('IA: No pudimos analizar esta foto. Cargala a mano.');
    const text = (candidate?.content?.parts ?? [])
      .filter((p) => typeof p.text === 'string' && !p.thought)
      .map((p) => p.text)
      .join('');
    return parseAnalysis(text);
  };
}
