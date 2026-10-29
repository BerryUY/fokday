import { createGeminiAnalyzer, createWeekSummarizer, GEMINI_MODELS, SUMMARY_MODELS } from '../supabase/functions/momentum/gemini';

/** The Gemini analyzer against a fake REST endpoint: request shape, parsing and friendly errors. */

type Call = { url: string; headers: Record<string, string>; body: Record<string, unknown> };

function fakeFetch(status: number, body: unknown, calls: Call[] = []) {
  return async (url: string, init: { headers: Record<string, string>; body: string }) => {
    calls.push({ url, headers: init.headers, body: JSON.parse(init.body) });
    return { ok: status >= 200 && status < 300, status, json: async () => body };
  };
}

const answer = (json: unknown, finishReason = 'STOP') => ({
  candidates: [{ finishReason, content: { parts: [{ text: 'pensando…', thought: true }, { text: JSON.stringify(json) }] } }],
});

const milanesa = {
  is_food: true,
  name: 'Milanesa con puré',
  items: [{ name: 'Milanesa', grams: 180 }, { name: 'Puré', grams: 200 }],
  calories: 812.4,
  protein: 48.26,
  carbs: 61,
  fat: 39.9,
  fiber: 4,
  confidence: 'media',
};

beforeEach(() => jest.spyOn(console, 'warn').mockImplementation(() => {}));
afterEach(() => jest.restoreAllMocks());

describe('Gemini food analyzer', () => {
  it('sends the photo with the key in a header and returns rounded values', async () => {
    const calls: Call[] = [];
    const analyze = createGeminiAnalyzer('test-key', fakeFetch(200, answer(milanesa), calls));
    const food = await analyze('BASE64');

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toContain(':generateContent');
    expect(calls[0].url).not.toContain('test-key');
    expect(calls[0].headers['x-goog-api-key']).toBe('test-key');
    const parts = (calls[0].body.contents as { parts: Record<string, unknown>[] }[])[0].parts;
    expect(parts).toContainEqual({ inlineData: { mimeType: 'image/jpeg', data: 'BASE64' } });
    expect((calls[0].body.generationConfig as Record<string, unknown>).responseMimeType).toBe('application/json');

    expect(food).toEqual({
      name: 'Milanesa con puré',
      items: [{ name: 'Milanesa', grams: 180 }, { name: 'Puré', grams: 200 }],
      calories: 812,
      protein: 48.3,
      carbs: 61,
      fat: 39.9,
      fiber: 4,
      confidence: 'media',
    });
  });

  it('clamps silly numbers', async () => {
    const analyze = createGeminiAnalyzer('k', fakeFetch(200, answer({ ...milanesa, calories: 99999, protein: -5 })));
    const food = await analyze('x');
    expect(food.calories).toBe(20000);
    expect(food.protein).toBe(0);
  });

  it('explains a photo without food', async () => {
    const analyze = createGeminiAnalyzer('k', fakeFetch(200, answer({ ...milanesa, is_food: false })));
    await expect(analyze('x')).rejects.toThrow('IA: No vemos comida');
  });

  it.each([
    [429, {}, 'IA: Se llenó el cupo gratis'],
    [400, { error: { status: 'INVALID_ARGUMENT', message: 'API key not valid. Please pass a valid API key.' } }, 'IA: La IA no está bien configurada'],
    [403, {}, 'IA: La IA no está bien configurada'],
    [400, { error: { status: 'INVALID_ARGUMENT', message: 'Unable to process input image.' } }, 'IA: No pudimos leer la foto'],
    [503, {}, 'IA: El servicio de IA está ocupado'],
  ])('maps HTTP %i to a message for the person', async (status, body, message) => {
    const analyze = createGeminiAnalyzer('k', fakeFetch(status, body));
    await expect(analyze('x')).rejects.toThrow(message);
  });

  it('falls back to the next free model when one is busy, out of quota or gone', async () => {
    const calls: string[] = [];
    const replies = [{ status: 503, body: { error: { status: 'UNAVAILABLE', message: 'The model is overloaded.' } } }, { status: 429, body: {} }, { status: 200, body: answer(milanesa) }];
    const fetchFn = async (url: string) => {
      calls.push(url.split('/models/')[1].split(':')[0]);
      const r = replies.shift()!;
      return { ok: r.status < 300, status: r.status, json: async () => r.body };
    };
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const food = await createGeminiAnalyzer('secret-key', fetchFn, ['a', 'b', 'c'])('x');
    expect(calls).toEqual(['a', 'b', 'c']);
    expect(food.name).toBe('Milanesa con puré');
    expect(warn).toHaveBeenCalledTimes(2);
    expect(String(warn.mock.calls[0][0])).toContain('The model is overloaded');
    expect(String(warn.mock.calls[0][0])).not.toContain('secret-key');
  });

  it('stops at errors another model would not fix', async () => {
    const calls: Call[] = [];
    const analyze = createGeminiAnalyzer('k', fakeFetch(403, {}, calls), ['a', 'b']);
    await expect(analyze('x')).rejects.toThrow('IA: La IA no está bien configurada');
    expect(calls).toHaveLength(1);
  });

  it('handles blocked and cut-off answers', async () => {
    await expect(createGeminiAnalyzer('k', fakeFetch(200, { promptFeedback: { blockReason: 'SAFETY' } }))('x')).rejects.toThrow('IA: No pudimos analizar esta foto');
    await expect(createGeminiAnalyzer('k', fakeFetch(200, answer(milanesa, 'MAX_TOKENS')))('x')).rejects.toThrow('IA: La respuesta quedó incompleta');
    await expect(createGeminiAnalyzer('k', fakeFetch(200, { candidates: [{ finishReason: 'STOP', content: { parts: [{ text: 'no es json' }] } }] }))('x')).rejects.toThrow('IA: No pudimos analizar la foto');
  });
});

describe('Gemini weekly summary', () => {
  const week = { title: 'Semana firme', wins: ['Subiste 5 kg en sentadilla', 'Proteína 5 de 7 días'], improve: ['Agua: 1,4 L de 2 L'], tip: 'Sumá un huevo al desayuno.', focus: 'Proteína temprano', extra: 1 };

  it('returns the structured summary from the summary models, never the photo ones first', async () => {
    const calls: Call[] = [];
    const summarize = createWeekSummarizer('test-key', fakeFetch(200, answer(week), calls));
    expect(await summarize({ dias_de_gym: 3 })).toEqual({
      title: 'Semana firme',
      wins: ['Subiste 5 kg en sentadilla', 'Proteína 5 de 7 días'],
      improve: ['Agua: 1,4 L de 2 L'],
      tip: 'Sumá un huevo al desayuno.',
      focus: 'Proteína temprano',
    });
    expect(calls[0].url).toContain(SUMMARY_MODELS[0]);
    expect(SUMMARY_MODELS[0]).not.toBe(GEMINI_MODELS[0]);
  });

  it('moves to the next model when one is busy, and fails kindly when the answer is empty', async () => {
    const calls: Call[] = [];
    let n = 0;
    const flaky = async (url: string, init: { headers: Record<string, string>; body: string }) => {
      calls.push({ url, headers: init.headers, body: JSON.parse(init.body) });
      n += 1;
      return n === 1 ? { ok: false, status: 503, json: async () => ({ error: { status: 'UNAVAILABLE' } }) } : { ok: true, status: 200, json: async () => answer(week) };
    };
    expect((await createWeekSummarizer('k', flaky)({})).title).toBe('Semana firme');
    expect(calls.map((c) => c.url.split('/models/')[1].split(':')[0])).toEqual(SUMMARY_MODELS.slice(0, 2));
    await expect(createWeekSummarizer('k', fakeFetch(200, answer({ title: '', wins: [] })))({})).rejects.toThrow('IA:');
  });
});
