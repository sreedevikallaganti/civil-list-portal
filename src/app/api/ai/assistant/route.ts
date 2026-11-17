// app/api/ai/assistant/route.ts — the "Ask AI" assistant (tool calling, several AI services with fallback).
//
// GET  → { enabled, providers } — which AI services are set up (the button is hidden when none is)
// POST → { messages: [{ role: 'user' | 'assistant', content: string }, …] }
//        ← { reply, people: PersonCard[], drafts: MeetingDraft[], provider }
//
// Providers (lib/ai/providers) are tried in order — by default Gemini → Groq → OpenRouter → Ollama; if one fails
// (free quota used up, down, timeout) the next answers. The tools (lib/ai/assistantTools) only READ
// PocketBase, with the caller's own session, so the collection rules and organisation scoping apply.
// A scheduling request ends in a DRAFT that the browser opens in the New Meeting form — the assistant
// never saves, changes or deletes anything.
import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { orgOfRequest, pbURL, requireUser } from '@/lib/serverAuth';
import { TENANT_COLLECTIONS, withOrgFilter } from '@/lib/tenancy';
import { APP_TIMEZONE, HOME_CITY } from '@/lib/appConfig';
import { cityLabel } from '@/lib/cities';
import { ASSISTANT_TOOLS, newToolContext, runAssistantTool, type PbReader, type ToolContext } from '@/lib/ai/assistantTools';
import { configuredProviders, ProviderError, runChatCompletions, type ChatProvider } from '@/lib/ai/providers';

export const runtime = 'nodejs';

const MAX_TOOL_ROUNDS = 8;
const MAX_HISTORY = 16;
const MAX_CHARS = 4000;

/* ── per-user rate limit: RATE_MAX questions per RATE_WINDOW ── */
const RATE_MAX = 20;
const RATE_WINDOW = 10 * 60_000;
const recent = new Map<string, number[]>();
function overLimit(userId: string) {
  const now = Date.now();
  const hits = (recent.get(userId) || []).filter((t) => now - t < RATE_WINDOW);
  if (hits.length >= RATE_MAX) { recent.set(userId, hits); return true; }
  hits.push(now);
  if (recent.size > 1000) recent.clear();
  recent.set(userId, hits);
  return false;
}

const TENANT = new Set<string>(TENANT_COLLECTIONS);

/** PocketBase reads with the caller's token (+ their organisation for platform owners). */
function pbReader(token: string, org: string): PbReader {
  return {
    async list(collection, { filter = '', sort = '', fields = '', perPage = 50, page = 1 }) {
      const f = org && TENANT.has(collection) ? withOrgFilter(filter, org) : filter;
      const q = new URLSearchParams({ perPage: String(perPage), page: String(page) });
      if (f) q.set('filter', f);
      if (sort) q.set('sort', sort);
      if (fields) q.set('fields', fields);
      const res = await fetch(`${pbURL()}/api/collections/${collection}/records?${q}`, {
        headers: { Authorization: token }, cache: 'no-store',
      });
      if (!res.ok) throw new Error(`${collection} returned ${res.status}`);
      return res.json();
    },
  };
}

const todayIn = (tz: string) => {
  try { return new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date()); } catch { return new Date().toISOString().slice(0, 10); }
};

function systemPrompt(today: string, userName: string) {
  const weekday = new Date(`${today}T12:00:00Z`).toLocaleDateString('en-IN', { weekday: 'long', timeZone: 'UTC' });
  return `You are the scheduling assistant inside Civillist, the meetings app used by the office of a Managing Director (the "MD") who meets IAS and IPS officers and other contacts across India.

Today is ${weekday}, ${today} (timezone ${APP_TIMEZONE}). The MD's home city is ${cityLabel(HOME_CITY, HOME_CITY)}. You are talking with ${userName || 'a member of the MD\'s office'}.

How to work:
- Answer only from the tools. Never invent officers, batch years, cadres, posts or past meetings; if a tool finds nothing, say so.
- "Batch" means the batch year (e.g. 1988). "Batchmates" are officers of the same batch year. "Cadre" is the officer's cadre (e.g. Rajasthan, AGMUT).
- For "same cadre / batch as <name>", look the person up with find_officer first.
- Resolve relative dates ("next Tuesday", "tomorrow") against today's date and state the actual date you used. Dates go to tools as YYYY-MM-DD and times as 24-hour HH:mm.
- Before drafting a meeting with a date and time, check_availability for that slot and mention any clash.
- To schedule, call draft_meeting. It only prepares a draft that the MD reviews in the New Meeting form; it never saves or sends anything, so do not claim a meeting was booked or that invites went out. Online meetings get a video link when saved; in-person ones need a venue.
- Contact details (phone, e-mail, date of birth) are not available to you; the MD sees them in the app.
- Keep replies short and scannable: a one-line answer, then a compact list if useful (name — post, cadre, met before or not). The app also shows the people you found as cards, so don't repeat long lists in full; summarise when there are many.`;
}

/* Claude (optional, paid) — only when "claude" is listed in AI_PROVIDERS. Same tools, Anthropic SDK loop. */
async function runClaude(p: ChatProvider, system: string, history: Anthropic.Beta.BetaMessageParam[], ctx: ToolContext): Promise<string> {
  const client = new Anthropic();
  const messages = [...history];
  try {
    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      const res = await client.beta.messages.create({
        model: p.model,
        max_tokens: 16000,
        // on a policy decline the API re-runs the request on a suitable fallback model
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        output_config: { effort: 'medium' },
        system,
        tools: ASSISTANT_TOOLS,
        messages,
      });
      if (res.stop_reason === 'refusal') return 'Sorry, I can’t help with that request.';
      if (res.stop_reason === 'tool_use') {
        messages.push({ role: 'assistant', content: res.content });
        const uses = res.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === 'tool_use');
        const results = await Promise.all(uses.map(async (u): Promise<Anthropic.Beta.BetaToolResultBlockParam> => {
          const r = await runAssistantTool(ctx, u.name, u.input);
          return { type: 'tool_result', tool_use_id: u.id, content: r.content, is_error: r.isError };
        }));
        messages.push({ role: 'user', content: results });
        continue;
      }
      const text = res.content
        .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text')
        .map((b) => b.text).join('\n').trim();
      return res.stop_reason === 'max_tokens' ? `${text}\n\n(The answer was cut short — ask me to continue.)` : text;
    }
    throw new ProviderError('claude', 508, 'too many tool rounds');
  } catch (e) {
    if (e instanceof ProviderError) throw e;
    if (e instanceof Anthropic.APIError) throw new ProviderError('claude', e.status ?? 0, e.message);
    throw new ProviderError('claude', 0, String((e as Error)?.message || e));
  }
}

export async function GET(req: NextRequest) {
  const user = await requireUser(req, 'viewer');
  if (user instanceof NextResponse) return user;
  const providers = configuredProviders();
  return NextResponse.json({ enabled: providers.length > 0, providers: providers.map((p) => p.label) });
}

export async function POST(req: NextRequest) {
  const user = await requireUser(req, 'editor');
  if (user instanceof NextResponse) return user;
  const providers = configuredProviders();
  if (!providers.length) {
    console.warn('[ai] no AI service configured — add GEMINI_API_KEY, GROQ_API_KEY, OPENROUTER_API_KEY or OLLAMA_URL to .env.local and restart (see .env.example)');
    return NextResponse.json({ error: 'The AI assistant isn’t switched on yet — please ask your administrator.' }, { status: 503 });
  }
  if (overLimit(user.id)) {
    return NextResponse.json({ error: 'That’s a lot of questions in a short time — please wait a few minutes.' }, { status: 429 });
  }

  const body = await req.json().catch(() => ({}));
  const history = (Array.isArray(body.messages) ? body.messages : [])
    .filter((m: any) => (m?.role === 'user' || m?.role === 'assistant') && typeof m.content === 'string' && m.content.trim())
    .slice(-MAX_HISTORY)
    .map((m: any) => ({ role: m.role as 'user' | 'assistant', content: String(m.content).slice(0, MAX_CHARS) }));
  while (history.length && history[0].role !== 'user') history.shift();
  if (!history.length || history[history.length - 1].role !== 'user') {
    return NextResponse.json({ error: 'Ask a question first.' }, { status: 400 });
  }

  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
  const today = todayIn(APP_TIMEZONE);
  const reader = pbReader(token, orgOfRequest(req, user));
  const system = systemPrompt(today, user.name || '');
  const failures: string[] = [];

  for (const p of providers) {
    // a fresh context per provider: if one fails half-way, its partial results are not mixed in
    const ctx = newToolContext(reader, today);
    try {
      const reply = p.id === 'claude'
        ? await runClaude(p, system, history, ctx)
        : await runChatCompletions(p, {
          system, history, tools: ASSISTANT_TOOLS, maxRounds: MAX_TOOL_ROUNDS,
          runTool: (name, input) => runAssistantTool(ctx, name, input),
        });
      return NextResponse.json({
        reply: reply || (ctx.drafts.length ? 'I’ve prepared a draft — open it to review.' : 'I couldn’t find an answer — try asking in a simpler way.'),
        people: ctx.people,
        drafts: ctx.drafts,
        provider: p.id === 'claude' ? p.label : `${p.label} · ${p.model}`,
        ...(failures.length && { fellBackFrom: failures }),
      });
    } catch (e) {
      const why = e instanceof ProviderError ? `${e.status || ''} ${e.message}`.trim() : String((e as Error)?.message || e);
      console.warn(`[ai] ${p.label} (${p.model}) failed — trying the next one:`, why);
      failures.push(`${p.label} (${p.model})`);
    }
  }

  return NextResponse.json(
    // which services / models failed, and why, is logged above for the developer
    { error: 'The AI assistant is busy right now — please try again in a few minutes.' },
    { status: 502 },
  );
}
