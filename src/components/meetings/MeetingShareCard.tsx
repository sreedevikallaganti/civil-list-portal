'use client';

/* MeetingShareCard — the meeting's Meet / Zoom link with Copy link, Copy invitation and
   WhatsApp buttons, plus (optional) the people who did NOT get the invite email
   (no email / wrong email / not delivered), each with a WhatsApp button to their number.
   Used in the meeting detail panel and in the "Meeting ready" window after saving. */

import { useState } from 'react';
import { AlertCircle, Check, Copy, ExternalLink, MessageCircle, Video } from 'lucide-react';
import { videoLabel } from '@/lib/videoCall';
import { copyText, inviteText, REASON_TEXT, waLink, waPhone, type ManualShare } from '@/lib/meetingShare';
import { showToast } from '@/components/Toaster';

export default function MeetingShareCard({ meeting, manual = [] }: { meeting: Record<string, any>; manual?: ManualShare[] }) {
  const [copied, setCopied] = useState<'link' | 'invite' | null>(null);
  const link = String(meeting?.meet_link || '');
  if (!link && !manual.length) return null;

  const copy = async (what: 'link' | 'invite') => {
    const ok = await copyText(what === 'link' ? link : inviteText(meeting));
    if (!ok) { showToast('Couldn’t copy — select the text and copy it by hand', 'error'); return; }
    setCopied(what);
    setTimeout(() => setCopied((c) => (c === what ? null : c)), 1800);
  };
  const btn = 'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-all active:scale-95';

  return (
    <div className="rounded-2xl border border-violet-200 bg-violet-50/50 p-4">
      <div className="flex items-center gap-2">
        <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-violet-100 text-violet-600">
          <Video className="h-3.5 w-3.5" />
        </span>
        <p className="text-[10px] font-bold uppercase tracking-wider text-violet-700">
          {link ? `${videoLabel(link)} link` : 'Share the meeting'}
        </p>
      </div>

      {link ? (
        <a href={link} target="_blank" rel="noreferrer"
          className="mt-2 flex items-center gap-1.5 break-all rounded-xl bg-white px-3 py-2 text-sm font-semibold text-violet-700 ring-1 ring-inset ring-violet-100 hover:underline">
          {link} <ExternalLink className="h-3.5 w-3.5 shrink-0" />
        </a>
      ) : (
        <p className="mt-2 text-xs text-slate-500">No video link for this meeting — the invitation has the date, time and place.</p>
      )}
      <div className="mt-2.5 flex flex-wrap gap-2">
            {link && (
              <button type="button" onClick={() => copy('link')} className={`${btn} bg-slate-900 text-white hover:bg-slate-800`}>
                {copied === 'link' ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                {copied === 'link' ? 'Copied' : 'Copy link'}
              </button>
            )}
            <button type="button" onClick={() => copy('invite')} title="Agenda, date, time, place and the link — paste it anywhere"
              className={`${btn} border border-violet-200 bg-white text-violet-700 hover:bg-violet-50`}>
              {copied === 'invite' ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              {copied === 'invite' ? 'Copied' : 'Copy invitation'}
            </button>
            <a href={waLink(inviteText(meeting))} target="_blank" rel="noreferrer" title="Opens WhatsApp — pick who to send it to"
              className={`${btn} bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-500/20 hover:bg-emerald-100`}>
              <MessageCircle className="h-3.5 w-3.5" /> WhatsApp
            </a>
      </div>

      {manual.length > 0 && (
        <div className="mt-3.5 border-t border-violet-100 pt-3">
          <p className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold text-amber-800">
            <AlertCircle className="h-3.5 w-3.5" />
            {manual.length === 1 ? '1 person didn’t get the email' : `${manual.length} people didn’t get the email`} — send it to them yourself
          </p>
          <ul className="space-y-1.5">
            {manual.map((p, i) => (
              <li key={`${p.name}-${i}`} className="flex items-center gap-2 rounded-xl bg-white px-3 py-2 ring-1 ring-inset ring-amber-100">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-semibold text-slate-800">{p.name || 'Participant'}</span>
                  <span className="block truncate text-[10px] text-amber-700">
                    {REASON_TEXT[p.reason]}{p.email ? ` (${p.email})` : ''}
                  </span>
                </span>
                {waPhone(p.phone) ? (
                  <a href={waLink(inviteText(meeting, p.name), p.phone)} target="_blank" rel="noreferrer"
                    className={`${btn} shrink-0 bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-500/20 hover:bg-emerald-100`}>
                    <MessageCircle className="h-3.5 w-3.5" /> WhatsApp
                  </a>
                ) : (
                  <span className="shrink-0 text-[10px] text-slate-400">No phone — use Copy invitation</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
