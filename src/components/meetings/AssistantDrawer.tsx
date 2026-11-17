'use client';

/* ================================================================
   AssistantDrawer — "Ask AI" on the Meetings page (also from Ctrl/Cmd+K).

   A side drawer chat with the scheduling assistant (/api/ai/assistant):
     • people it finds show as cards — Schedule opens a New Meeting with them
     • a scheduling request comes back as a DRAFT card — "Open in form"
       opens the New Meeting form pre-filled; nothing is saved until the
       MD saves it there
   The conversation lives only as long as the page (no storage).
================================================================ */

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  Sparkles, X, Send, Loader2, CalendarPlus, Video, MapPin, Users, Clock, AlertTriangle, RotateCcw,
} from 'lucide-react';
import pb from '@/lib/pocketbase';
import { apiJSON, orgHeader } from '@/lib/apiClient';
import type { MeetingDraft, PersonCard } from '@/lib/ai/assistantTools';

type ChatMessage = {
  role: 'user' | 'assistant'; content: string; people?: PersonCard[]; drafts?: MeetingDraft[]; error?: boolean;
  provider?: string;   // which AI service answered (Gemini / Groq / Ollama …)
};

const EXAMPLES = [
  'Who have I met before in Tamil Nadu?',
  'Show IPS officers of Rajasthan cadre',
  'Which 1990 batch IAS officers have I already met?',
  'Schedule an online meeting with 1988 batch IAS officers next Tuesday at 4 pm',
  'Am I free on Friday afternoon?',
];

const SERVICE_CHIP: Record<string, string> = {
  IAS: 'bg-sky-50 text-sky-700 ring-sky-500/20',
  IPS: 'bg-violet-50 text-violet-700 ring-violet-500/20',
};

/** Whether the server has an Anthropic key (null while checking). */
export function useAssistantEnabled(active = true): boolean | null {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  useEffect(() => {
    if (!active) return;
    let live = true;
    fetch('/api/ai/assistant', { headers: { Authorization: pb.authStore.token || '', ...orgHeader() } })
      .then((r) => (r.ok ? r.json() : { enabled: false }))
      .then((d) => {
        if (!live) return;
        setEnabled(!!d.enabled);
        if (!d.enabled) {
          console.info('[Ask AI] off — add GEMINI_API_KEY, GROQ_API_KEY, OPENROUTER_API_KEY or OLLAMA_URL to .env.local and restart the app (steps in .env.example).');
        }
      })
      .catch(() => { if (live) setEnabled(false); });
    return () => { live = false; };
  }, [active]);
  return enabled;
}

const fmtDay = (iso: string) =>
  iso ? new Date(`${iso}T00:00:00`).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' }) : 'Date to pick';

function PersonCards({ people, onNavigate }: { people: PersonCard[]; onNavigate: () => void }) {
  const [all, setAll] = useState(false);
  const shown = all ? people : people.slice(0, 6);
  return (
    <div className="mt-2 space-y-1.5">
      {shown.map((p) => (
        <div key={p.ref || p.name} className="flex items-center gap-2.5 rounded-xl bg-white px-3 py-2 ring-1 ring-slate-200/70">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <p className="truncate text-[12.5px] font-semibold text-slate-800">{p.name}</p>
              {p.service && p.service !== 'Other' && (
                <span className={`rounded-full px-1.5 py-0.5 text-[9.5px] font-bold ring-1 ring-inset ${SERVICE_CHIP[p.service] || 'bg-slate-100 text-slate-600 ring-slate-500/15'}`}>{p.service}</span>
              )}
            </div>
            {p.subtitle && <p className="truncate text-[11px] text-slate-500" title={p.subtitle}>{p.subtitle}</p>}
            {p.badge && <p className="mt-0.5 text-[10.5px] font-semibold text-emerald-700">{p.badge}</p>}
          </div>
          {p.ref && (
            <Link href={`/meetings?person=${encodeURIComponent(p.ref)}`} title={`New meeting with ${p.name}`} onClick={onNavigate}
              className="inline-flex shrink-0 items-center gap-1 rounded-full bg-slate-900 px-2.5 py-1 text-[11px] font-semibold text-white transition hover:bg-slate-800">
              <CalendarPlus className="h-3 w-3" /> Schedule
            </Link>
          )}
        </div>
      ))}
      {people.length > 6 && (
        <button type="button" onClick={() => setAll((v) => !v)} className="text-[11.5px] font-semibold text-violet-600 hover:text-violet-700">
          {all ? 'Show fewer' : `Show all ${people.length}`}
        </button>
      )}
    </div>
  );
}

function DraftCard({ draft, onOpen }: { draft: MeetingDraft; onOpen: (d: MeetingDraft) => void }) {
  const count = draft.refs.length + draft.names.length;
  return (
    <div className="mt-2 rounded-2xl border border-violet-200 bg-violet-50/70 p-3">
      <p className="text-[10px] font-bold uppercase tracking-wider text-violet-500">Draft meeting · not saved</p>
      <p className="mt-0.5 text-[13.5px] font-bold text-slate-900">{draft.title}</p>
      <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[11.5px] text-slate-600">
        <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" />{fmtDay(draft.date)}{draft.time ? ` · ${draft.time}` : ''}{draft.duration ? ` · ${draft.duration} min` : ''}</span>
        <span className="inline-flex items-center gap-1">
          {draft.mode === 'online' ? <Video className="h-3 w-3" /> : <MapPin className="h-3 w-3" />}
          {draft.mode === 'online' ? 'Online' : draft.venue || draft.city || 'In person'}
        </span>
        <span className="inline-flex items-center gap-1"><Users className="h-3 w-3" />{count} {count === 1 ? 'person' : 'people'}</span>
      </div>
      {draft.names.length > 0 && (
        <p className="mt-1.5 text-[11px] text-amber-700">Not found in the directory, kept by name: {draft.names.join(', ')}</p>
      )}
      <button type="button" onClick={() => onOpen(draft)}
        className="mt-2.5 inline-flex items-center gap-1.5 rounded-full bg-slate-900 px-3.5 py-1.5 text-[12px] font-semibold text-white transition hover:bg-slate-800">
        <CalendarPlus className="h-3.5 w-3.5" /> Open in form
      </button>
    </div>
  );
}

export default function AssistantDrawer({ open, onClose, enabled, isAdmin, question, onOpenDraft }: {
  open: boolean;
  onClose: () => void;
  enabled: boolean | null;
  isAdmin: boolean;
  /* text to start with (e.g. typed in the command palette) — sent once when it changes */
  question?: string;
  onOpenDraft: (d: MeetingDraft) => void;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const lastQuestion = useRef('');

  useEffect(() => { if (open) setTimeout(() => inputRef.current?.focus(), 80); }, [open]);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [messages, sending]);

  useEffect(() => {
    if (!open) return;
    // capture phase + stopPropagation: Escape closes only the assistant, not the page's panels behind it
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [open, onClose]);

  async function send(text: string) {
    const q = text.trim();
    if (!q || sending || !enabled) return;
    const next: ChatMessage[] = [...messages, { role: 'user', content: q }];
    setMessages(next);
    setInput('');
    setSending(true);
    try {
      const res = await apiJSON<{ reply: string; people: PersonCard[]; drafts: MeetingDraft[]; provider?: string }>(
        '/api/ai/assistant',
        // failed turns are not sent back — only the real conversation
        { messages: next.filter((m) => !m.error).map(({ role, content }) => ({ role, content })) },
        { timeoutMs: 150_000 },
      );
      setMessages((m) => [...m, { role: 'assistant', content: res.reply, people: res.people, drafts: res.drafts, provider: res.provider }]);
    } catch (e: any) {
      setMessages((m) => [...m, { role: 'assistant', content: e?.name === 'AbortError' ? 'That took too long — please try again.' : e?.message || 'Something went wrong.', error: true }]);
    } finally {
      setSending(false);
    }
  }

  /* a question handed over from the command palette */
  useEffect(() => {
    if (open && enabled && question && question !== lastQuestion.current) {
      lastQuestion.current = question;
      send(question);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, enabled, question]);

  function openDraft(d: MeetingDraft) {
    onOpenDraft(d);
    // who asked the assistant for which draft — the server adds user / IP / device
    apiJSON('/api/activity', {
      action: 'ai draft opened', resource_type: 'meeting',
      details: `${d.title} · ${d.refs.length + d.names.length} people · ${d.date || 'no date'} ${d.time}`.trim(),
    }).catch(() => {});
  }

  return (
    <>
      <div onClick={onClose} aria-hidden
        className={`fixed inset-0 z-[80] bg-slate-900/30 backdrop-blur-[2px] transition-opacity duration-300 ${open ? 'opacity-100' : 'pointer-events-none opacity-0'}`} />
      <aside role="dialog" aria-modal="true" aria-label="Ask AI" aria-hidden={!open}
        className={`fixed inset-y-0 right-0 z-[85] flex w-full sm:max-w-xl lg:max-w-2xl flex-col bg-[#f7f6fd] shadow-2xl transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${open ? 'translate-x-0' : 'translate-x-full'}`}>
        <header className="flex items-center gap-3 border-b border-slate-100 bg-white px-5 py-4">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 text-white shadow-sm">
            <Sparkles className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-[15px] font-bold text-slate-900">Ask AI</h2>
            <p className="truncate text-[11.5px] text-slate-500">Find officers, see who you’ve met, draft meetings</p>
          </div>
          {messages.length > 0 && (
            <button type="button" onClick={() => setMessages([])} title="New conversation"
              className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700">
              <RotateCcw className="h-4 w-4" />
            </button>
          )}
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700">
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="nice-scroll flex-1 space-y-4 overflow-y-auto px-4 py-4">
          {enabled === false ? (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-[13px] text-amber-800">
              <p className="flex items-center gap-2 font-semibold"><AlertTriangle className="h-4 w-4" /> The AI assistant isn’t switched on yet</p>
              <p className="mt-1">
                {isAdmin
                  ? 'It needs an AI service to be connected. Your developer can find the steps in the browser console.'
                  : 'Please ask your administrator to switch it on.'}
              </p>
            </div>
          ) : messages.length === 0 ? (
            <div>
              <p className="text-[13px] text-slate-600">Ask in plain words. A few ideas:</p>
              <div className="mt-3 space-y-2">
                {EXAMPLES.map((ex) => (
                  <button key={ex} type="button" onClick={() => send(ex)} disabled={!enabled}
                    className="block w-full rounded-xl bg-white px-3.5 py-2.5 text-left text-[12.5px] text-slate-700 ring-1 ring-slate-200/70 transition hover:ring-violet-300 disabled:opacity-60">
                    {ex}
                  </button>
                ))}
              </div>
              <p className="mt-4 text-[11px] leading-relaxed text-slate-400">
                The assistant reads your directory and meetings. It never saves, changes or deletes anything — meetings it
                prepares open in the New Meeting form for you to check and save.
              </p>
            </div>
          ) : (
            messages.map((m, i) => (
              <div key={i} className={m.role === 'user' ? 'flex justify-end' : ''}>
                {m.role === 'user' ? (
                  <p className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-slate-900 px-3.5 py-2 text-[13px] text-white">{m.content}</p>
                ) : (
                  <div className="max-w-full">
                    <p className={`whitespace-pre-wrap rounded-2xl rounded-bl-md px-3.5 py-2.5 text-[13px] leading-relaxed ring-1 ${
                      m.error ? 'bg-rose-50 text-rose-700 ring-rose-200' : 'bg-white text-slate-700 ring-slate-200/70'}`}>
                      {m.content}
                    </p>
                    {m.drafts?.map((d, j) => <DraftCard key={j} draft={d} onOpen={openDraft} />)}
                    {!!m.people?.length && <PersonCards people={m.people} onNavigate={onClose} />}
                    {m.provider && <p className="mt-1 pl-1 text-[10px] text-slate-400">Answered by {m.provider}</p>}
                  </div>
                )}
              </div>
            ))
          )}
          {sending && (
            <div className="flex items-center gap-2 text-[12.5px] text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin text-violet-500" /> Looking that up…
            </div>
          )}
          <div ref={endRef} />
        </div>

        <form onSubmit={(e) => { e.preventDefault(); send(input); }} className="border-t border-slate-100 bg-white p-3">
          <div className="flex items-end gap-2">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input); } }}
              rows={1}
              disabled={!enabled}
              placeholder={enabled ? 'e.g. IPS officers of Rajasthan cadre' : 'AI isn’t available'}
              className="nice-scroll max-h-32 min-h-[40px] flex-1 resize-none rounded-xl border border-slate-200 bg-slate-50/80 px-3.5 py-2.5 text-[13px] text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-violet-400 focus:bg-white focus:ring-4 focus:ring-violet-500/10 disabled:opacity-60"
            />
            <button type="submit" disabled={!input.trim() || sending || !enabled} aria-label="Send"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-900 text-white transition hover:bg-slate-800 disabled:opacity-40">
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </button>
          </div>
        </form>
      </aside>
    </>
  );
}
