'use client';

/* SendAsPicker — "who is this email from?" before sending invites or greetings.
   Pick the account (the MD, Tejaswi…), optionally "on behalf of" the MD, and the name the
   recipient sees — "Tejaswi from Brihaspathi Technologies" by default, editable.
   The choice is remembered on this computer for next time. */

import { useEffect, useState } from 'react';
import { Send } from 'lucide-react';
import { useSenders, type SenderInfo } from '@/lib/useSenders';
import { defaultFromName } from '@/lib/emailTemplates';

/** What the email routes need (/api/invite, /api/google, /api/occasion-email). */
export type SendAsPayload = { sender?: string; onBehalf?: boolean; fromName?: string };

type Saved = { sender?: string; onBehalf?: boolean; custom?: string };
const KEY = 'civillist:send-as';
const read = (): Saved => { try { return JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch { return {}; } };

/** The remembered choice, for emails sent outside the meeting form (status changes…).
    The server fills in the default name when `fromName` is empty. */
export function savedSendAs(): SendAsPayload {
  const s = typeof window === 'undefined' ? {} : read();
  return { ...(s.sender && { sender: s.sender }), onBehalf: s.onBehalf !== false, ...(s.custom?.trim() && { fromName: s.custom.trim() }) };
}

export function useSendAs(enabled = true) {
  const s = useSenders(enabled);
  const [saved, setSaved] = useState<Saved>({});
  // read the remembered choice once on the client (localStorage isn't there during SSR)
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setSaved(read()); }, []);
  const update = (patch: Saved) => setSaved((prev) => {
    const next = { ...prev, ...patch };
    try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* storage blocked — not remembered */ }
    return next;
  });

  const senders = s.senders ?? [];
  const me = senders.find((x) => x.id === saved.sender)
    ?? senders.find((x) => x.id === (s.yourSender || s.defaultSender)) ?? senders[0] ?? null;
  const principal = senders.find((x) => x.id === s.principal) ?? null;
  const canBehalf = Boolean(me && principal && principal.id !== me.id);
  const onBehalf = canBehalf && saved.onBehalf !== false; // a PA sends on the MD's behalf unless switched off
  const signer = (x: { label: string; title?: string }) => ({ name: x.label, title: x.title });
  const autoName = me
    ? defaultFromName({ signer: signer(me), onBehalfOf: onBehalf && principal ? signer(principal) : null, org: s.org })
    : '';
  const custom = (saved.custom || '').trim();
  const payload: SendAsPayload = me ? { sender: me.id, onBehalf, fromName: custom || autoName } : {};

  return { loading: s.senders === null, senders, me, principal, canBehalf, onBehalf, autoName, custom, org: s.org, payload, update };
}

export type SendAsState = ReturnType<typeof useSendAs>;

/** One way to send: an account, and whether it writes on the principal's (MD's) behalf. */
type Choice = { key: string; sender: SenderInfo; onBehalf: boolean; who: string; how: string; shows: string };

/** Every way the configured accounts can send — built from the senders in .env.local:
    the MD himself first, then each other person on his behalf and in their own name. */
function choicesFor(senders: SenderInfo[], principal: SenderInfo | null, org: string): Choice[] {
  const signer = (x: SenderInfo) => ({ name: x.label, title: x.title });
  const shows = (x: SenderInfo, behalf: boolean) =>
    defaultFromName({ signer: signer(x), onBehalfOf: behalf && principal ? signer(principal) : null, org });
  const role = (x: SenderInfo) => (x.title ? ` (${x.title})` : '');
  const ordered = principal ? [principal, ...senders.filter((x) => x.id !== principal.id)] : senders;
  return ordered.flatMap((x): Choice[] => {
    if (!principal || x.id === principal.id) {
      return [{ key: `${x.id}:self`, sender: x, onBehalf: false, who: `${x.label}${role(x)}`, how: principal ? 'Sends it himself' : 'Sends it in their own name', shows: shows(x, false) }];
    }
    return [
      { key: `${x.id}:behalf`, sender: x, onBehalf: true, who: `${x.label}${role(x)}`, how: `On behalf of ${principal.label}`, shows: shows(x, true) },
      { key: `${x.id}:self`, sender: x, onBehalf: false, who: `${x.label}${role(x)}`, how: 'In their own name', shows: shows(x, false) },
    ];
  });
}

export default function SendAsPicker({ state, className = '' }: { state: SendAsState; className?: string }) {
  const { senders, me, principal, onBehalf, autoName, custom, payload, org, update } = state;
  const [editing, setEditing] = useState(false);
  if (!me) return null;
  const choices = choicesFor(senders, principal, org);
  const selected = `${me.id}:${onBehalf ? 'behalf' : 'self'}`;
  const input = 'w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 focus:border-violet-400 focus:outline-none focus:ring-4 focus:ring-violet-500/10';

  return (
    <div className={`rounded-2xl border border-slate-200 bg-white p-4 ${className}`}>
      <p className="mb-1 flex items-center gap-1.5 text-[13px] font-semibold text-slate-800">
        <Send className="h-4 w-4 text-violet-600" /> Who is sending this email?
      </p>
      <p className="mb-3 text-[11px] text-slate-400">The recipient sees the name and the signature of the person you choose.</p>

      <div role="radiogroup" aria-label="Who is sending this email" className="grid gap-2 sm:grid-cols-2">
        {choices.map((c) => {
          const on = c.key === selected;
          return (
            <button
              key={c.key}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => update({ sender: c.sender.id, onBehalf: c.onBehalf, custom: '' })}
              className={`flex items-start gap-3 rounded-xl border p-3 text-left transition-all ${
                on ? 'border-violet-400 bg-violet-50/70 ring-2 ring-violet-500/15' : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
              }`}
            >
              <span className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${on ? 'border-violet-600' : 'border-slate-300'}`}>
                {on && <span className="h-2 w-2 rounded-full bg-violet-600" />}
              </span>
              <span className="min-w-0">
                <span className="block truncate text-[13px] font-semibold text-slate-900">{c.who}</span>
                <span className="block text-[11px] font-medium text-violet-700">{c.how}</span>
                <span className="mt-0.5 block truncate text-[11px] text-slate-400">Shows as “{c.shows}”</span>
              </span>
            </button>
          );
        })}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-500">
        <span>From: <b className="font-semibold text-slate-700">{payload.fromName}</b></span>
        {!editing && !custom && (
          <button type="button" onClick={() => setEditing(true)} className="font-semibold text-violet-600 hover:underline">Change the name shown</button>
        )}
        {custom && (
          <button type="button" onClick={() => { update({ custom: '' }); setEditing(false); }} className="font-semibold text-violet-600 hover:underline">Use the default name</button>
        )}
        {!me.canEmail && me.email && <span className="text-slate-400">· replies go to {me.email}</span>}
      </div>
      {(editing || custom) && (
        <input
          value={custom}
          onChange={(e) => update({ custom: e.target.value.slice(0, 80) })}
          placeholder={autoName}
          aria-label="Name shown to the recipient"
          autoFocus={editing && !custom}
          className={`${input} mt-2`}
        />
      )}
    </div>
  );
}
