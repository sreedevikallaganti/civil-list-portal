/* lib/ai/providers.ts — which AI services answer the assistant, and in what order.

   Order comes from AI_PROVIDERS (default "gemini,groq,openrouter,ollama"). The first configured
   provider is tried first; if it fails — free quota used up (429), service down, timeout, bad key —
   the next one is tried. Gemini, Groq, OpenRouter and Ollama all speak the OpenAI "chat completions"
   format with tool calling, so one loop (runChatCompletions) drives them all. Claude (paid) is
   optional and only used when "claude" is listed in AI_PROVIDERS and ANTHROPIC_API_KEY is set (route.ts).

   Each *_MODEL setting may list several models, comma-separated: they are tried in order before
   moving on to the next provider (a busy model — "503 high demand" — often has a free sibling).

   Env:
     GEMINI_API_KEY   (aistudio.google.com)      GEMINI_MODEL  (default gemini-3.5-flash-lite,gemini-3.8-flash)
     GROQ_API_KEY     (console.groq.com)         GROQ_MODEL    (default openai/gpt-oss-120b,qwen/qwen3.8-27b)
     OPENROUTER_API_KEY (openrouter.ai/keys)     OPENROUTER_MODEL (default meta-llama/llama-3.3-70b-instruct:free)
     OLLAMA_URL       (e.g. http://localhost:11434) OLLAMA_MODEL (default llama3.1:8b)          */

import type Anthropic from '@anthropic-ai/sdk';

export type ProviderId = 'gemini' | 'groq' | 'openrouter' | 'ollama' | 'claude';

export type ChatProvider = {
  id: ProviderId;
  label: string;
  url: string;          // chat completions endpoint (unused for claude)
  apiKey: string;
  model: string;
  timeoutMs: number;
  headers?: Record<string, string>; // extra request headers (OpenRouter app attribution)
};

export const PROVIDER_LABEL: Record<ProviderId, string> = {
  gemini: 'Google Gemini', groq: 'Groq', openrouter: 'OpenRouter', ollama: 'Ollama (local)', claude: 'Claude',
};

const env = (k: string) => (process.env[k] || '').trim();

/** "a, b ,a" → ["a", "b"] — a *_MODEL setting may list fallback models */
const modelList = (value: string, fallback: string) =>
  Array.from(new Set((value || fallback).split(',').map((s) => s.trim()).filter(Boolean)));

/** The providers (one entry per model) to try, in order — only those with their settings filled in. */
export function configuredProviders(): ChatProvider[] {
  const order = (env('AI_PROVIDERS') || 'gemini,groq,openrouter,ollama')
    .split(',').map((s) => s.trim().toLowerCase()).filter(Boolean) as ProviderId[];
  const out: ChatProvider[] = [];
  const add = (base: Omit<ChatProvider, 'model'>, models: string[]) => models.forEach((model) => out.push({ ...base, model }));
  for (const id of Array.from(new Set(order))) {
    if (id === 'gemini' && env('GEMINI_API_KEY')) {
      add({
        id, label: PROVIDER_LABEL.gemini, apiKey: env('GEMINI_API_KEY'),
        url: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
        // a busy Gemini often just hangs — give up sooner and let the next model answer
        timeoutMs: 30_000,
      }, modelList(env('GEMINI_MODEL'), 'gemini-3.5-flash-lite,gemini-3.8-flash'));
    } else if (id === 'groq' && env('GROQ_API_KEY')) {
      add({
        id, label: PROVIDER_LABEL.groq, apiKey: env('GROQ_API_KEY'),
        url: 'https://api.groq.com/openai/v1/chat/completions', timeoutMs: 60_000,
      }, modelList(env('GROQ_MODEL'), 'openai/gpt-oss-120b,qwen/qwen3.8-27b'));
    } else if (id === 'openrouter' && env('OPENROUTER_API_KEY')) {
      add({
        id, label: PROVIDER_LABEL.openrouter, apiKey: env('OPENROUTER_API_KEY'),
        url: 'https://openrouter.ai/api/v1/chat/completions', timeoutMs: 90_000,
        headers: { 'X-Title': 'Civillist Meetings', ...(env('APP_URL') && { 'HTTP-Referer': env('APP_URL') }) },
        // ":free" models cost nothing (daily limits); pick ones that support tool calling
      }, modelList(env('OPENROUTER_MODEL'), 'meta-llama/llama-3.3-70b-instruct:free'));
    } else if (id === 'ollama' && (env('OLLAMA_URL') || env('OLLAMA_MODEL'))) {
      const base = (env('OLLAMA_URL') || 'http://localhost:11434').replace(/\/+$/, '');
      add({
        id, label: PROVIDER_LABEL.ollama, apiKey: '',
        url: `${base}/v1/chat/completions`, timeoutMs: 180_000, // local models are slower
      }, modelList(env('OLLAMA_MODEL'), 'llama3.1:8b'));
    } else if (id === 'claude' && (env('ANTHROPIC_API_KEY') || env('ANTHROPIC_AUTH_TOKEN'))) {
      out.push({ id, label: PROVIDER_LABEL.claude, apiKey: '', url: '', model: env('ANTHROPIC_MODEL') || 'claude-opus-5-5', timeoutMs: 120_000 });
    }
  }
  return out;
}

/* ── OpenAI-compatible chat with tools ── */

export type ChatMessage =
  | { role: 'system' | 'user'; content: string }
  | { role: 'assistant'; content: string | null; tool_calls?: ToolCall[] }
  | { role: 'tool'; tool_call_id: string; content: string };

type ToolCall = { id: string; type: 'function'; function: { name: string; arguments: string } };

/** Anthropic-style tool definitions → OpenAI "functions".
    • `additionalProperties` is dropped: Gemini's compatibility layer rejects it, and the handlers
      ignore unknown fields anyway.
    • optional fields also accept null: models often send `"city": null` for "not given", and Groq
      refuses the whole call when that doesn't match the schema. The handlers treat null as empty. */
export function toOpenAITools(tools: Anthropic.Beta.BetaTool[]) {
  const clean = (schema: unknown): unknown => {
    if (Array.isArray(schema)) return schema.map(clean);
    if (!schema || typeof schema !== 'object') return schema;
    const s = schema as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(s)) if (k !== 'additionalProperties' && k !== 'properties') out[k] = clean(v);
    if (s.properties && typeof s.properties === 'object') {
      const required = new Set(Array.isArray(s.required) ? (s.required as string[]) : []);
      out.properties = Object.fromEntries(Object.entries(s.properties as Record<string, unknown>).map(([name, prop]) => {
        const p = clean(prop) as Record<string, unknown>;
        if (!required.has(name) && typeof p?.type === 'string' && p.type !== 'object') {
          return [name, { ...p, type: [p.type, 'null'], ...(Array.isArray(p.enum) && { enum: [...p.enum, null] }) }];
        }
        return [name, p];
      }));
    }
    return out;
  };
  return tools.map((t) => ({
    type: 'function' as const,
    function: { name: t.name, description: t.description || '', parameters: clean(t.input_schema) },
  }));
}

/** Some open models (e.g. Qwen on Groq) put their reasoning in the reply as <think>…</think> —
    sometimes without the opening tag. Only the answer after it is shown. */
export function stripReasoning(text: string): string {
  let t = text.replace(/<think>[\s\S]*?<\/think>/gi, '');
  const close = t.lastIndexOf('</think>');
  if (close !== -1) t = t.slice(close + '</think>'.length);
  return t.trim();
}

/** A provider failure that should move on to the next provider. */
export class ProviderError extends Error {
  constructor(public provider: ProviderId, public status: number, message: string) {
    super(message);
  }
}

export type ToolRunner = (name: string, input: unknown) => Promise<{ content: string; isError: boolean }>;

/**
 * Ask one OpenAI-compatible provider, running tools until it answers in text.
 * Throws ProviderError when the provider can't be used (so the caller tries the next one).
 */
export async function runChatCompletions(
  p: ChatProvider,
  opts: { system: string; history: { role: 'user' | 'assistant'; content: string }[]; tools: Anthropic.Beta.BetaTool[]; runTool: ToolRunner; maxRounds?: number },
  fetchImpl: typeof fetch = fetch,
): Promise<string> {
  const messages: ChatMessage[] = [{ role: 'system', content: opts.system }, ...opts.history];
  const tools = toOpenAITools(opts.tools);

  for (let round = 0; round < (opts.maxRounds ?? 8); round++) {
    let res: Response;
    try {
      res = await fetchImpl(p.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...p.headers, ...(p.apiKey && { Authorization: `Bearer ${p.apiKey}` }) },
        body: JSON.stringify({ model: p.model, messages, tools, tool_choice: 'auto', temperature: 0.2 }),
        signal: AbortSignal.timeout(p.timeoutMs),
        cache: 'no-store',
      });
    } catch (e: any) {
      throw new ProviderError(p.id, 0, e?.name === 'TimeoutError' ? 'timed out' : `unreachable (${e?.message || e})`);
    }
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new ProviderError(p.id, res.status, `HTTP ${res.status} ${detail.slice(0, 200)}`);
    }
    const data: any = await res.json().catch(() => null);
    const msg = data?.choices?.[0]?.message;
    if (!msg) throw new ProviderError(p.id, 502, 'empty response');

    const calls: ToolCall[] = Array.isArray(msg.tool_calls) ? msg.tool_calls : [];
    if (!calls.length) {
      const text = typeof msg.content === 'string' ? stripReasoning(msg.content) : '';
      if (!text) throw new ProviderError(p.id, 502, 'no answer text');
      return text;
    }

    messages.push({ role: 'assistant', content: msg.content ?? null, tool_calls: calls });
    const results = await Promise.all(calls.map(async (c, i) => {
      let input: unknown;
      try { input = JSON.parse(c.function?.arguments || '{}'); } catch { input = null; }
      const r = input === null
        ? { content: 'The tool arguments were not valid JSON — call the tool again with a JSON object.', isError: true }
        : await opts.runTool(c.function?.name || '', input);
      return { role: 'tool' as const, tool_call_id: c.id || `call_${round}_${i}`, content: r.content };
    }));
    messages.push(...results);
  }
  throw new ProviderError(p.id, 508, 'too many tool rounds');
}
