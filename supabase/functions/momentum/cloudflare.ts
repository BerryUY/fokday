import { AiError, FIELD_DESCRIPTIONS as D, parseAnalysis, REQUIRED_FIELDS, SYSTEM_PROMPT, USER_PROMPT } from './analysis.ts';
import type { FoodAnalysis } from './handlers.ts';

/**
 * Backup for food photos when Google is overloaded: open vision models on Cloudflare Workers AI
 * (free daily allowance on the Workers Free plan). Plain REST, so it runs the same in Deno and Jest.
 * The JSON shape is asked for in the prompt and read leniently, since not every model supports a
 * response schema.
 */
export const CLOUDFLARE_MODELS = ['@cf/meta/llama-4-scout-17b-16e-instruct', '@cf/mistralai/mistral-small-3.1-24b-instruct'];

export type CloudflareAccount = { accountId: string; token: string };

type FetchFn = (url: string, init: { method: string; headers: Record<string, string>; body: string; signal?: AbortSignal }) => Promise<{
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
}>;

const PER_MODEL_TIMEOUT_MS = 20_000;
export const CLOUDFLARE_BUDGET_MS = 25_000;

const JSON_RULES =
  'Respondé SOLO con un objeto JSON, sin texto antes ni después, con estas claves: ' +
  `is_food (${D.is_food}), name (${D.name}), items (${D.items}: lista de {name, grams}), calories (${D.calories}), ` +
  `protein (${D.protein}), carbs (${D.carbs}), fat (${D.fat}), fiber (${D.fiber}), confidence ("alta", "media" o "baja"). ` +
  `Claves obligatorias: ${REQUIRED_FIELDS.join(', ')}.`;

/** The first {...} block of a reply (models sometimes wrap JSON in prose or code fences). */
export function extractJson(reply: unknown): string | undefined {
  if (reply && typeof reply === 'object') return JSON.stringify(reply);
  if (typeof reply !== 'string') return undefined;
  const start = reply.indexOf('{');
  const end = reply.lastIndexOf('}');
  return start >= 0 && end > start ? reply.slice(start, end + 1) : undefined;
}

export function createCloudflareAnalyzer(account: CloudflareAccount, fetchFn: FetchFn = fetch as unknown as FetchFn, models = CLOUDFLARE_MODELS, budgetMs = CLOUDFLARE_BUDGET_MS) {
  return async function analyzeFood(jpegBase64: string): Promise<FoodAnalysis> {
    const deadline = Date.now() + budgetMs;
    let last: unknown = new AiError('IA: El servicio de IA está ocupado. Probá de nuevo en un minuto.', true);
    for (const model of models) {
      const left = deadline - Date.now();
      if (left < 4_000) break;
      try {
        const res = await fetchFn(`https://api.cloudflare.com/client/v4/accounts/${account.accountId}/ai/run/${model}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${account.token}` },
          body: JSON.stringify({
            messages: [
              { role: 'system', content: `${SYSTEM_PROMPT} ${JSON_RULES}` },
              {
                role: 'user',
                content: [
                  { type: 'text', text: USER_PROMPT },
                  { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${jpegBase64}` } },
                ],
              },
            ],
            max_tokens: 1500,
          }),
          signal: AbortSignal.timeout(Math.min(PER_MODEL_TIMEOUT_MS, left)),
        });
        const body = (await res.json().catch(() => ({}))) as { success?: boolean; result?: { response?: unknown }; errors?: { message?: string }[] };
        if (!res.ok || body.success === false) {
          console.warn(`Cloudflare ${model} → ${res.status}: ${body.errors?.map((e) => e.message).join('; ') ?? ''}`.slice(0, 500));
          continue;
        }
        return parseAnalysis(extractJson(body.result?.response));
      } catch (e) {
        // "No food" is final; a garbled answer or a timeout moves on to the next model.
        if (e instanceof AiError && !e.busy) throw e;
        console.warn(`Cloudflare ${model} → ${e instanceof Error ? e.message : String(e)}`.slice(0, 500));
        last = e instanceof AiError ? e : new AiError('IA: El servicio de IA está ocupado. Probá de nuevo en un minuto.', true);
      }
    }
    throw last;
  };
}
