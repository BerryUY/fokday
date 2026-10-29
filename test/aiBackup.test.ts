import { analyzeFoodPatiently, ApiError } from '@/backup/api';
import { AiError, chainAnalyzers } from '../supabase/functions/momentum/analysis';
import { createCloudflareAnalyzer, extractJson } from '../supabase/functions/momentum/cloudflare';

/** What keeps a food photo from ending in an error when one AI provider is overloaded. */

const milanesa = { is_food: true, name: 'Milanesa', items: [{ name: 'Milanesa', grams: 180 }], calories: 520, protein: 40, carbs: 20, fat: 30, fiber: 1, confidence: 'media' };

beforeEach(() => jest.spyOn(console, 'warn').mockImplementation(() => {}));
afterEach(() => jest.restoreAllMocks());

describe('provider chain', () => {
  it('moves to the next provider only when one is busy', async () => {
    const busy = async () => {
      throw new AiError('IA: ocupado', true);
    };
    const ok = async () => 'ok';
    expect(await chainAnalyzers(busy, ok)()).toBe('ok');
    const final = async () => {
      throw new AiError('IA: No vemos comida en la foto.');
    };
    const never = jest.fn(ok);
    await expect(chainAnalyzers(final, never)()).rejects.toThrow('No vemos comida');
    expect(never).not.toHaveBeenCalled();
    await expect(chainAnalyzers(busy, busy)()).rejects.toMatchObject({ busy: true });
  });
});

describe('Cloudflare backup', () => {
  it('sends the photo as an image part and reads JSON wrapped in prose', async () => {
    const calls: { url: string; body: { messages: { content: unknown }[] }; auth: string }[] = [];
    const analyze = createCloudflareAnalyzer({ accountId: 'acc', token: 'tok' }, async (url, init) => {
      calls.push({ url, body: JSON.parse(init.body), auth: init.headers.Authorization });
      return { ok: true, status: 200, json: async () => ({ success: true, result: { response: 'Acá va:\n```json\n' + JSON.stringify(milanesa) + '\n```' } }) };
    });
    expect(await analyze('BASE64')).toMatchObject({ name: 'Milanesa', calories: 520, protein: 40 });
    expect(calls[0].url).toBe('https://api.cloudflare.com/client/v4/accounts/acc/ai/run/@cf/meta/llama-4-scout-17b-16e-instruct');
    expect(calls[0].auth).toBe('Bearer tok');
    expect(calls[0].body.messages[1].content).toContainEqual({ type: 'image_url', image_url: { url: 'data:image/jpeg;base64,BASE64' } });
  });

  it('tries the next model on errors and garbled answers, and is busy when all fail', async () => {
    const replies = [
      { ok: false, status: 500, json: async () => ({ success: false, errors: [{ message: 'capacity' }] }) },
      { ok: true, status: 200, json: async () => ({ success: true, result: { response: 'no sé' } }) },
    ];
    const analyze = createCloudflareAnalyzer({ accountId: 'a', token: 't' }, async () => replies.shift()!, ['m1', 'm2']);
    await expect(analyze('x')).rejects.toMatchObject({ busy: true });
    expect(extractJson({ a: 1 })).toBe('{"a":1}');
  });
});

describe('patient photo analysis in the app', () => {
  const config = { url: 'https://api.test', token: 't'.repeat(40) };
  const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

  it('keeps trying while the AI is busy and tells the screen once per wait', async () => {
    const replies = [reply(503, { error: 'ocupado', busy: true }), reply(503, { error: 'ocupado', busy: true }), reply(200, { food: milanesa, remaining: 0, ai: {} })];
    const onBusy = jest.fn();
    const res = await analyzeFoodPatiently(config, 'x', onBusy, [1, 1, 1], async () => replies.shift()!);
    expect(res.food.name).toBe('Milanesa');
    expect(onBusy).toHaveBeenCalledTimes(2);
  });

  it('shows real problems right away and gives up after the last wait', async () => {
    const onBusy = jest.fn();
    await expect(analyzeFoodPatiently(config, 'x', onBusy, [1], async () => reply(502, { error: 'No vemos comida en la foto.' }))).rejects.toThrow('No vemos comida');
    expect(onBusy).not.toHaveBeenCalled();
    await expect(analyzeFoodPatiently(config, 'x', onBusy, [1], async () => reply(503, { error: 'ocupado' }))).rejects.toBeInstanceOf(ApiError);
    expect(onBusy).toHaveBeenCalledTimes(1);
  });
});
