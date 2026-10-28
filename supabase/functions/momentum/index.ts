import { handleRequest, MAX_PAYLOAD_BYTES, type Env, type LimitSet, type QuotaKind } from './handlers.ts';
import { createFoodAnalyzer } from './ai.ts';
import { createAdRewardVerifier, fetchAdMobKeys } from './adReward.ts';
import { createGeminiAnalyzer, createWeekSummarizer } from './gemini.ts';
import { createBarcodeLookup } from './openFoodFacts.ts';
import { createAuthHelpers, createSupabaseStore, readConfig } from './store.ts';

/**
 * FokDay API: https://<project>.supabase.co/functions/v1/momentum/api/<route>
 * Deployed with verify_jwt = false: the Authorization header carries either the person's
 * Supabase session (checked with Supabase Auth) or an older install's own token (checked
 * against its stored hash) — see authenticate() in handlers.ts.
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
const auth = createAuthHelpers(url, secretKey);

// The AI turns on once a key is set in the function's secrets: GEMINI_API_KEY (free tier
// in Google AI Studio) is preferred; ANTHROPIC_API_KEY (paid) is used only if there is no Gemini key.
const geminiKey = Deno.env.get('GEMINI_API_KEY');
const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY');
const analyzeFood = geminiKey ? createGeminiAnalyzer(geminiKey) : anthropicKey ? createFoodAnalyzer(anthropicKey) : undefined;
const summarizeWeek = geminiKey ? createWeekSummarizer(geminiKey) : undefined;

const lookupBarcode = createBarcodeLookup('FokDay/1.3 (Android; app de hábitos)');
const verifyAdReward = createAdRewardVerifier(fetchAdMobKeys);

// Pro comes from RevenueCat (secret REVENUECAT_SECRET_KEY); answers are cached for 10 minutes per instance.
const revenueCatKey = Deno.env.get('REVENUECAT_SECRET_KEY');
const proCache = new Map<string, { at: number; pro: boolean }>();
async function checkPro(authUserId: string): Promise<boolean> {
  if (!revenueCatKey) return false;
  const hit = proCache.get(authUserId);
  if (hit && Date.now() - hit.at < 600_000) return hit.pro;
  const res = await fetch(`https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(authUserId)}`, {
    headers: { Authorization: `Bearer ${revenueCatKey}` },
    signal: AbortSignal.timeout(8_000),
  });
  if (!res.ok) throw new Error(`RevenueCat ${res.status}`);
  const body = (await res.json()) as { subscriber?: { entitlements?: Record<string, { expires_date: string | null }> } };
  const ent = body.subscriber?.entitlements?.pro;
  const pro = !!ent && (ent.expires_date === null || Date.parse(ent.expires_date) > Date.now());
  proCache.set(authUserId, { at: Date.now(), pro });
  return pro;
}

// Settings live in the momentum_config table; cached for a minute per instance.
const LIMIT_KEYS: Record<keyof LimitSet, string> = { free: 'free', bonusMax: 'bonus_max', videosPerExtra: 'videos_per_extra', pro: 'pro' };
function limitsFrom(values: Record<string, string>): Env['limits'] {
  const out: Env['limits'] = {};
  for (const kind of ['photo', 'barcode', 'summary'] as QuotaKind[]) {
    const set: Partial<LimitSet> = {};
    for (const [field, key] of Object.entries(LIMIT_KEYS) as [keyof LimitSet, string][]) {
      const n = Number(values[`${kind}_${key}`]);
      if (Number.isFinite(n) && n >= 0) set[field] = n;
    }
    out[kind] = set;
  }
  return out;
}

let cached: { at: number; env: Env } | null = null;
async function loadEnv(): Promise<Env> {
  if (cached && Date.now() - cached.at < 60_000) return cached.env;
  const values = await readConfig(url, secretKey);
  const env: Env = {
    inviteCodeHash: values.invite_code_sha256,
    maxProfiles: Number(values.max_profiles) || 50,
    minUploadIntervalSeconds: Number(values.min_upload_interval_seconds) || 60,
    limits: limitsFrom(values),
    analyzeFood,
    summarizeWeek,
    lookupBarcode,
    verifyAuthToken: auth.verifyAuthToken,
    deleteAuthUser: auth.deleteAuthUser,
    checkPro,
    verifyAdReward,
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
    const out = await handleRequest(
      route,
      {
        method: req.method,
        headers: { authorization: req.headers.get('authorization') ?? undefined },
        body,
        query: Object.fromEntries(requestUrl.searchParams),
        // AdMob signs the query exactly as sent, so the verifier needs it untouched.
        rawQuery: requestUrl.search.slice(1),
      },
      store,
      await loadEnv(),
    );
    if (out.raw !== undefined) return new Response(out.raw, { status: out.status, headers });
    return json(out.status, out.json ?? {});
  } catch (e) {
    console.error(e);
    return json(500, { error: 'Error interno del servidor.' });
  }
});
