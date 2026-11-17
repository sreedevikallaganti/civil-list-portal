import { afterEach, describe, expect, it } from 'vitest';
import { ASSISTANT_TOOLS } from '@/lib/ai/assistantTools';
import { configuredProviders, ProviderError, runChatCompletions, stripReasoning, toOpenAITools, type ChatProvider } from '@/lib/ai/providers';

const KEYS = ['AI_PROVIDERS', 'GEMINI_API_KEY', 'GEMINI_MODEL', 'GROQ_API_KEY', 'GROQ_MODEL', 'OPENROUTER_API_KEY', 'OPENROUTER_MODEL', 'APP_URL', 'OLLAMA_URL', 'OLLAMA_MODEL', 'ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN'];
const ids = () => Array.from(new Set(configuredProviders().map((p) => p.id)));
const saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
afterEach(() => { for (const k of KEYS) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; } });
const setEnv = (vars: Record<string, string>) => { for (const k of KEYS) delete process.env[k]; Object.assign(process.env, vars); };

describe('configuredProviders', () => {
  it('uses Gemini → Groq → OpenRouter → Ollama by default, skipping ones without settings', () => {
    setEnv({ GROQ_API_KEY: 'g', OLLAMA_URL: 'http://box:11434/', GEMINI_API_KEY: 'k', OPENROUTER_API_KEY: 'o' });
    expect(ids()).toEqual(['gemini', 'groq', 'openrouter', 'ollama']);
    expect(configuredProviders().at(-1)!.url).toBe('http://box:11434/v1/chat/completions');
    setEnv({ GROQ_API_KEY: 'g' });
    expect(ids()).toEqual(['groq']);
  });
  it('tries every listed model of a provider before the next provider', () => {
    setEnv({ GEMINI_API_KEY: 'k', GROQ_API_KEY: 'g' });
    expect(configuredProviders().map((p) => `${p.id}:${p.model}`)).toEqual([
      'gemini:gemini-3.5-flash-lite', 'gemini:gemini-3.8-flash', 'groq:openai/gpt-oss-120b', 'groq:qwen/qwen3.8-27b',
    ]);
    setEnv({ GEMINI_API_KEY: 'k', GEMINI_MODEL: ' a , b,a ' });
    expect(configuredProviders().map((p) => p.model)).toEqual(['a', 'b']);
  });
  it('follows AI_PROVIDERS and only adds Claude when listed', () => {
    setEnv({ ANTHROPIC_API_KEY: 'a', GEMINI_API_KEY: 'k' });
    expect(ids()).toEqual(['gemini']);
    setEnv({ AI_PROVIDERS: 'claude, gemini', ANTHROPIC_API_KEY: 'a', GEMINI_API_KEY: 'k' });
    expect(ids()).toEqual(['claude', 'gemini']);
  });
  it('sets OpenRouter up with a free model and app headers', () => {
    setEnv({ OPENROUTER_API_KEY: 'o', APP_URL: 'http://meetings.local:3000' });
    const [p] = configuredProviders();
    expect(p).toMatchObject({ id: 'openrouter', url: 'https://openrouter.ai/api/v1/chat/completions' });
    expect(p.model).toMatch(/:free$/);
    expect(p.headers).toEqual({ 'X-Title': 'Civillist Meetings', 'HTTP-Referer': 'http://meetings.local:3000' });
    setEnv({ OPENROUTER_API_KEY: 'o', OPENROUTER_MODEL: 'qwen/some-model:free' });
    expect(configuredProviders()[0].model).toBe('qwen/some-model:free');
  });
  it('is empty when nothing is set up', () => {
    setEnv({});
    expect(configuredProviders()).toEqual([]);
  });
});

describe('toOpenAITools', () => {
  it('turns every tool into a function without additionalProperties (Gemini rejects it)', () => {
    const tools = toOpenAITools(ASSISTANT_TOOLS);
    expect(tools.map((t) => t.function.name)).toEqual(ASSISTANT_TOOLS.map((t) => t.name));
    expect(JSON.stringify(tools)).not.toMatch(/additionalProperties/);
    expect(tools.find((t) => t.function.name === 'draft_meeting')!.function.parameters).toMatchObject({
      type: 'object', required: ['title', 'people', 'mode'],
    });
  });
  it('lets optional fields be null (Groq rejects `"city": null` otherwise) but keeps required ones strict', () => {
    const params = (name: string) => toOpenAITools(ASSISTANT_TOOLS).find((t) => t.function.name === name)!.function.parameters as any;
    expect(params('people_met_before').properties.city.type).toEqual(['string', 'null']);
    expect(params('search_officers').properties.service).toMatchObject({ type: ['string', 'null'], enum: ['IAS', 'IPS', 'IFS', 'IRS', 'any', null] });
    expect(params('check_availability').properties.date.type).toBe('string');
    expect(params('draft_meeting').properties.mode.type).toBe('string');
    expect(params('draft_meeting').properties.people.items.properties.id.type).toEqual(['string', 'null']);
    expect(params('draft_meeting').properties.people.items.properties.name.type).toBe('string');
  });
});

describe('stripReasoning', () => {
  it('keeps only the answer when a model leaks its <think> block', () => {
    expect(stripReasoning('<think>let me see</think>\n\nMD met Beena.')).toBe('MD met Beena.');
    expect(stripReasoning('MD met Beena.\n</think>\n\nMD met Beena Rao twice.')).toBe('MD met Beena Rao twice.');
    expect(stripReasoning('  Plain answer. ')).toBe('Plain answer.');
  });
});

const P: ChatProvider = { id: 'groq', label: 'Groq', url: 'https://x/chat', apiKey: 'key', model: 'm', timeoutMs: 1000 };
const reply = (message: unknown, status = 200) =>
  new Response(JSON.stringify({ choices: [{ message }] }), { status, headers: { 'Content-Type': 'application/json' } });

describe('runChatCompletions', () => {
  const base = { system: 'sys', history: [{ role: 'user' as const, content: 'Who is in the 1988 batch?' }], tools: ASSISTANT_TOOLS };

  it('runs the tools the model asks for, sends results back, and returns the final text', async () => {
    const bodies: any[] = [];
    const answers = [
      reply({ content: null, tool_calls: [{ id: 'c1', type: 'function', function: { name: 'search_officers', arguments: '{"batch_year":1988}' } }] }),
      reply({ content: 'Two officers.' }),
    ];
    const fakeFetch = (async (_url: string, init: RequestInit) => {
      bodies.push(JSON.parse(String(init.body)));
      expect((init.headers as Record<string, string>).Authorization).toBe('Bearer key');
      return answers.shift()!;
    }) as unknown as typeof fetch;
    const calls: unknown[] = [];
    const text = await runChatCompletions(P, { ...base, runTool: async (name, input) => { calls.push([name, input]); return { content: '{"ok":1}', isError: false }; } }, fakeFetch);

    expect(text).toBe('Two officers.');
    expect(calls).toEqual([['search_officers', { batch_year: 1988 }]]);
    expect(bodies[0].messages[0]).toEqual({ role: 'system', content: 'sys' });
    expect(bodies[1].messages.at(-1)).toEqual({ role: 'tool', tool_call_id: 'c1', content: '{"ok":1}' });
  });

  it('tells the model when its tool arguments are not JSON', async () => {
    const answers = [
      reply({ content: null, tool_calls: [{ id: 'c1', type: 'function', function: { name: 'find_officer', arguments: '{bad' } }] }),
      reply({ content: 'Done.' }),
    ];
    let sentBack = '';
    const fakeFetch = (async (_u: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body));
      if (body.messages.at(-1).role === 'tool') sentBack = body.messages.at(-1).content;
      return answers.shift()!;
    }) as unknown as typeof fetch;
    await runChatCompletions(P, { ...base, runTool: async () => ({ content: 'should not run', isError: false }) }, fakeFetch);
    expect(sentBack).toMatch(/not valid JSON/);
  });

  it('throws ProviderError on quota / server errors so the next provider is tried', async () => {
    const fakeFetch = (async () => new Response('rate limited', { status: 429 })) as unknown as typeof fetch;
    await expect(runChatCompletions(P, { ...base, runTool: async () => ({ content: '', isError: false }) }, fakeFetch))
      .rejects.toMatchObject({ provider: 'groq', status: 429 });
    const down = (async () => { throw new TypeError('fetch failed'); }) as unknown as typeof fetch;
    await expect(runChatCompletions(P, { ...base, runTool: async () => ({ content: '', isError: false }) }, down))
      .rejects.toBeInstanceOf(ProviderError);
  });
});
