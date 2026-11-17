'use client';

/* ShareMeetingHost — the "Meeting ready — share it" window that opens after a meeting is
   saved and its Meet / Zoom link exists (the link is made in the background, after the form
   has closed — so this lives in the root layout, next to the Toaster).
   Open it from anywhere:  showShareMeeting({ meeting, manual })  */

import { useEffect, useState } from 'react';
import { CheckCircle2, X } from 'lucide-react';
import MeetingShareCard from '@/components/meetings/MeetingShareCard';
import type { ManualShare } from '@/lib/meetingShare';

const EVENT = 'civillist:share-meeting';
type Detail = { meeting: Record<string, any>; manual?: ManualShare[] };

export function showShareMeeting(detail: Detail) {
  window.dispatchEvent(new CustomEvent<Detail>(EVENT, { detail }));
}

export default function ShareMeetingHost() {
  const [open, setOpen] = useState<Detail | null>(null);

  useEffect(() => {
    const onShow = (e: Event) => setOpen((e as CustomEvent<Detail>).detail);
    window.addEventListener(EVENT, onShow);
    return () => window.removeEventListener(EVENT, onShow);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  if (!open) return null;
  const m = open.meeting;
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4" role="dialog" aria-label="Share the meeting">
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={() => setOpen(null)} />
      <div className="relative w-full max-w-md rounded-3xl bg-white p-5 shadow-2xl">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="flex items-start gap-2.5">
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-500" />
            <div>
              <h2 className="text-base font-bold text-slate-900">Meeting ready — share it</h2>
              <p className="text-xs text-slate-500">{m.agenda || 'Meeting'}{m.officer_name ? ` · with ${m.officer_name}` : ''}</p>
            </div>
          </div>
          <button onClick={() => setOpen(null)} aria-label="Close"
            className="rounded-full p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
            <X className="h-4 w-4" />
          </button>
        </div>
        <MeetingShareCard meeting={m} manual={open.manual} />
        <p className="mt-3 text-center text-[11px] text-slate-400">The link is also on the meeting — open it any time to copy or share again.</p>
      </div>
    </div>
  );
}
