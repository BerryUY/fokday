import { handleRequest, MAX_PAYLOAD_BYTES, type Env } from './handlers.ts';
import { createFoodAnalyzer } from './ai.ts';
import { createGeminiAnalyzer } from './gemini.ts';
import { createSupabaseStore, readConfig } from './store.ts';

/**
 * Momentum backup API: https://<project>.supabase.co/functions/v1/momentum/api/<route>
 * Deployed with verify_jwt = false: the Authorization header carries the person's own
 * Momentum token, which handlers.ts checks against the stored hash.
 */

const url = Deno.env.get('SUPABASE_URL')!;
const secretKey = (() => {
  try {
    return JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') ?? '{}').default as string | undefined;
  } catch {
    return undefined;
  }
})() ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const store = createSupabaseStore(url, secretKey);
// The AI photo turns on once a key is set in the function's secrets: GEMINI_API_KEY (free tier
// in Google AI Studio) is preferred; ANTHROPIC_API_KEY (paid) is used only if there is no Gemini key.
const geminiKey = Deno.env.get('GEMINI_API_KEY');
const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY');
const analyzeFood = geminiKey ? createGeminiAnalyzer(geminiKey) : anthropicKey ? createFoodAnalyzer(anthropicKey) : undefined;

// Settings live in the momentum_config table; cached for a minute per instance.
let cached: { at: number; env: Env } | null = null;
async function loadEnv(): Promise<Env> {
  if (cached && Date.now() - cached.at < 60_000) return cached.env;
  const values = await readConfig(url, secretKey);
  const env: Env = {
    inviteCodeHash: values.invite_code_sha256,
    maxProfiles: Number(values.max_profiles) || 50,
    minUploadIntervalSeconds: Number(values.min_upload_interval_seconds) || 60,
    aiDailyLimit: Number(values.ai_daily_limit) || 30,
    analyzeFood,
  };
  cached = { at: Date.now(), env };
  return env;
}

const headers = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' };
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers });

Deno.serve(async (req) => {
  try {
    const requestUrl = new URL(req.url);
    const route = requestUrl.pathname.match(/\/api\/(.*)$/)?.[1] ?? '';
    let body: unknown = undefined;
    if (req.method === 'POST') {
      const text = await req.text();
      if (text.length > MAX_PAYLOAD_BYTES * 1.1) return json(413, { error: 'El respaldo supera el tamaño máximo aceptado.' });
      try {
        body = text ? JSON.parse(text) : {};
      } catch {
        return json(400, { error: 'Cuerpo inválido.' });
      }
    }
    const out = await handleRequest(route, { method: req.method, headers: { authorization: req.headers.get('authorization') ?? undefined }, body, query: Object.fromEntries(requestUrl.searchParams) }, store, await loadEnv());
    if (out.raw !== undefined) return new Response(out.raw, { status: out.status, headers });
    return json(out.status, out.json ?? {});
  } catch (e) {
    console.error(e);
    return json(500, { error: 'Error interno del servidor de respaldo.' });
  }
});
