'use client';

/* ================================================================
   RevisitPopup — shown right after a meeting is created in another
   city: "You've met these people in Dubai before. Meet them again?"
   Per person: Schedule (opens a pre-filled new meeting) or Not now.
================================================================ */

import { useEffect, useState } from 'react';
import { Users, CalendarPlus, X, AlertCircle, MapPin } from 'lucide-react';
import type { RevisitPerson } from '@/lib/revisit';

const PREVIEW = 5;

const initialsOf = (name: string) =>
  name.split(' ').map((w) => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase() || '?';

const monthYear = (d: Date) => d.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });

export default function RevisitPopup({ cityLabel, date, people, onSchedule, onSkip, onClose }: {
  cityLabel: string;
  date: string;                       // YYYY-MM-DD of the meeting just created
  people: RevisitPerson[];
  onSchedule: (p: RevisitPerson) => void;
  onSkip: (p: RevisitPerson) => void;
  onClose: () => void;                // "Maybe later" / ✕ — hides for this visit
}) {
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  if (!people.length) return null;
  const visible = showAll ? people : people.slice(0, PREVIEW);
  const dayLabel = new Date(`${date}T00:00:00`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });

  return (
    <div className="fixed inset-0 z-[85] flex items-end justify-center p-4 sm:items-center">
      <div className="anim-overlay absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose} />
      <div className="anim-scale-in relative flex max-h-[85vh] w-full max-w-md flex-col overflow-hidden rounded-3xl bg-white shadow-2xl">
        <div className="h-1.5 w-full shrink-0 bg-gradient-to-r from-violet-500 to-sky-500" />

        {/* header */}
        <div className="flex items-start gap-3 px-5 pb-3 pt-4">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-violet-100 text-violet-600">
            <Users className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="text-base font-bold leading-snug text-slate-900">
              You’ve met {people.length === 1 ? 'this person' : `${people.length} people`} in {cityLabel} before
            </h3>
            <p className="mt-0.5 text-xs text-slate-500">
              Your meeting on {dayLabel} is in {cityLabel}. Want to meet any of them again while you’re there?
            </p>
          </div>
          <button onClick={onClose} aria-label="Close"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-slate-700">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* people */}
        <ul className="nice-scroll flex-1 space-y-2 overflow-y-auto px-5 pb-2">
          {visible.map((p) => (
            <li key={p.key} className="flex items-center gap-3 rounded-2xl border border-slate-200/80 p-3 transition-colors hover:border-violet-200">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-violet-100 to-sky-100 text-[11px] font-bold text-violet-700">
                {initialsOf(p.name)}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-slate-900">
                  {p.name}
                  {p.designation && <span className="ml-1.5 text-xs font-normal text-slate-400">{p.designation}</span>}
                </p>
                <p className="truncate text-[11px] text-slate-500">
                  {p.lastMetAt ? `Last met ${monthYear(p.lastMetAt)}` : 'Met before'}
                  {p.lastAgenda ? ` · “${p.lastAgenda}”` : ''}
                </p>
                <div className="mt-1 flex flex-wrap gap-1">
                  {p.pendingFollowUp && (
                    <span className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-bold ring-1 ring-inset ${
                      p.followUpOverdue ? 'bg-rose-50 text-rose-700 ring-rose-500/20' : 'bg-amber-50 text-amber-700 ring-amber-500/20'
                    }`}>
                      <AlertCircle className="h-2.5 w-2.5" /> {p.followUpOverdue ? 'Follow-up overdue' : 'Follow-up pending'}
                    </span>
                  )}
                  {p.timesMet > 1 && (
                    <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-500">Met {p.timesMet}× here</span>
                  )}
                  {p.priority.toLowerCase() === 'high' && (
                    <span className="rounded-full bg-rose-50 px-1.5 py-0.5 text-[10px] font-bold text-rose-700 ring-1 ring-inset ring-rose-500/20">High priority</span>
                  )}
                </div>
              </div>
              <div className="flex shrink-0 flex-col items-stretch gap-1 sm:flex-row sm:items-center">
                <button type="button" onClick={() => onSchedule(p)}
                  className="inline-flex items-center justify-center gap-1 rounded-full bg-slate-900 px-3 py-1.5 text-[11px] font-semibold text-white transition hover:bg-slate-800">
                  <CalendarPlus className="h-3.5 w-3.5" /> Schedule
                </button>
                <button type="button" onClick={() => onSkip(p)}
                  className="rounded-full px-2.5 py-1.5 text-[11px] font-semibold text-slate-400 transition hover:bg-slate-100 hover:text-slate-700">
                  Not now
                </button>
              </div>
            </li>
          ))}
        </ul>

        {/* footer */}
        <div className="flex items-center justify-between gap-2 border-t border-slate-100 px-5 py-3">
          {people.length > PREVIEW ? (
            <button type="button" onClick={() => setShowAll((v) => !v)} className="text-[11px] font-semibold text-violet-600 hover:underline">
              {showAll ? 'Show fewer' : `Show all ${people.length}`}
            </button>
          ) : (
            <span className="inline-flex items-center gap-1 text-[11px] text-slate-400"><MapPin className="h-3 w-3" /> {cityLabel}</span>
          )}
          <button type="button" onClick={onClose}
            className="rounded-full border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 transition hover:bg-slate-50">
            Maybe later
          </button>
        </div>
      </div>
    </div>
  );
}
