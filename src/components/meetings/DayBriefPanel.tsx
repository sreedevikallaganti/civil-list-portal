'use client';

// DayBriefPanel — a one-page prep sheet for any day: who you're meeting, in what order,
// their role and contact details, when you last met them and what was discussed,
// open follow-ups, free gaps and back-to-back warnings. Printable.

import { useMemo, useState } from 'react';
import {
  X, Printer, ChevronLeft, ChevronRight, Clock, MapPin, Phone, Mail, History, Sparkles,
  AlertTriangle, Coffee, Video, FileText, ArrowRightLeft, Cake, Award,
} from 'lucide-react';
import { personKey } from '@/lib/revisit';
import { useLivePeople } from '@/lib/liveDirectory';

const pad = (n: number) => String(n).padStart(2, '0');
const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const dayOf = (m: any) => String(m?.meeting_date || '').slice(0, 10);
const toMin = (t: string) => { const m = /^(\d{1,2}):(\d{2})/.exec(t || ''); return m ? +m[1] * 60 + +m[2] : null; };
const hhmm = (min: number) => `${pad(Math.floor(min / 60) % 24)}:${pad(min % 60)}`;
const isOff = (m: any) => ['cancelled', 'rejected'].includes(String(m?.status || '').toLowerCase()) || m?.deleted;
const pretty = (d: string, opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' }) =>
  new Date(`${d}T00:00:00`).toLocaleDateString('en-IN', opts);
const snippet = (v: any, n = 220) => { const s = String(v || '').replace(/\s+/g, ' ').trim(); return s.length > n ? `${s.slice(0, n)}…` : s; };

const PRINT_CSS = `
@media print {
  body * { visibility: hidden !important; }
  #day-brief, #day-brief * { visibility: visible !important; }
  #day-brief { position: absolute !important; inset: 0 !important; max-height: none !important; overflow: visible !important; box-shadow: none !important; }
  #day-brief .no-print { display: none !important; }
  #day-brief .brief-card { break-inside: avoid; }
}`;

/** first day (from today) that has meetings, else today */
function defaultDay(meetings: any[]) {
  const today = iso(new Date());
  const days = meetings.filter((m) => !isOff(m)).map(dayOf).filter((d) => d >= today).sort();
  return days[0] || today;
}

export default function DayBriefPanel({ meetings, onClose, onOpenMeeting }: {
  meetings: any[];
  onClose: () => void;
  onOpenMeeting?: (m: any) => void;
}) {
  const [day, setDay] = useState(() => defaultDay(meetings));
  const shift = (n: number) => { const d = new Date(`${day}T00:00:00`); d.setDate(d.getDate() + n); setDay(iso(d)); };

  const items = useMemo(() => {
    const list = meetings
      .filter((m) => dayOf(m) === day && !isOff(m))
      .map((m) => {
        const start = toMin(m.meeting_time);
        const dur = Number(m.duration) || 30;
        const key = personKey(m);
        const past = key
          ? meetings
              .filter((p) => p.id !== m.id && personKey(p) === key && !isOff(p) && dayOf(p) && dayOf(p) < day)
              .sort((a, b) => dayOf(b).localeCompare(dayOf(a)))
          : [];
        const last = past[0];
        /* most recent earlier meeting with this person that set a follow-up */
        const openFollowUp = past.find((p) => /^\d{4}-\d{2}-\d{2}/.test(String(p.follow_up_date || '')));
        return { m, start, dur, past, last, openFollowUp };
      })
      .sort((a, b) => (a.start ?? 9999) - (b.start ?? 9999));
    return list;
  }, [meetings, day]);

  /* today's directory record for each person on this day — current post, birthday, anniversary */
  const { people } = useLivePeople(useMemo(() => items.map((i) => i.m), [items]));
  const liveOf = (m: any) => (m.officer_id ? people.get(String(m.officer_id)) : undefined);
  const mmdd = day.slice(5);

  /* totals, free gaps, back-to-back runs */
  const timed = items.filter((i) => i.start !== null) as (typeof items[number] & { start: number })[];
  const totalMin = items.reduce((s, i) => s + i.dur, 0);
  const firstTimeMet = items.filter((i) => !i.past.length && i.m.officer_name).length;
  const gapAfter = (idx: number) => {
    const a = timed[idx], b = timed[idx + 1];
    return a && b ? b.start - (a.start + a.dur) : null;
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <style dangerouslySetInnerHTML={{ __html: PRINT_CSS }} />
      <div className="anim-overlay no-print absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={onClose} />
      <div id="day-brief" className="anim-panel relative flex h-full w-full flex-col bg-[#f7f6fd] shadow-2xl sm:max-w-2xl">
        {/* header */}
        <div className="bg-gradient-to-br from-slate-900 to-violet-900 px-6 pb-5 pt-6 text-white">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-violet-200"><FileText className="h-3.5 w-3.5" /> Day brief</p>
              <h2 className="mt-1 text-xl font-bold">{pretty(day, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</h2>
            </div>
            <div className="no-print flex items-center gap-1">
              <button onClick={() => window.print()} className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1.5 text-xs font-semibold hover:bg-white/25">
                <Printer className="h-3.5 w-3.5" /> Print
              </button>
              <button onClick={onClose} aria-label="Close" className="rounded-lg p-2 text-white/70 hover:bg-white/10 hover:text-white"><X className="h-5 w-5" /></button>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <div className="no-print flex items-center rounded-full bg-white/10 p-0.5">
              <button onClick={() => shift(-1)} aria-label="Previous day" className="rounded-full p-1.5 hover:bg-white/15"><ChevronLeft className="h-4 w-4" /></button>
              <input type="date" value={day} onChange={(e) => e.target.value && setDay(e.target.value)}
                className="bg-transparent px-1 text-xs font-semibold text-white [color-scheme:dark] focus:outline-none" />
              <button onClick={() => shift(1)} aria-label="Next day" className="rounded-full p-1.5 hover:bg-white/15"><ChevronRight className="h-4 w-4" /></button>
            </div>
            <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold">{items.length} meeting{items.length === 1 ? '' : 's'}</span>
            {totalMin > 0 && <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold">{Math.floor(totalMin / 60)}h {totalMin % 60}m booked</span>}
            {timed.length > 0 && <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold">{hhmm(timed[0].start)} – {hhmm(timed[timed.length - 1].start + timed[timed.length - 1].dur)}</span>}
            {firstTimeMet > 0 && <span className="rounded-full bg-emerald-400/20 px-3 py-1 text-xs font-semibold text-emerald-200">{firstTimeMet} first-time</span>}
          </div>
        </div>

        {/* body */}
        <div className="nice-scroll flex-1 space-y-3 overflow-y-auto p-4 sm:p-6">
          {!items.length && (
            <div className="rounded-3xl bg-white p-10 text-center ring-1 ring-slate-100">
              <Coffee className="mx-auto h-8 w-8 text-slate-300" />
              <p className="mt-3 text-sm font-semibold text-slate-700">No meetings on this day</p>
              <p className="mt-1 text-xs text-slate-400">Use the arrows to look at another day.</p>
            </div>
          )}

          {items.map((it, idx) => {
            const { m, start, dur, past, last, openFollowUp } = it;
            const timedIdx = timed.findIndex((t) => t.m.id === m.id);
            const gap = timedIdx >= 0 ? gapAfter(timedIdx) : null;
            return (
              <div key={m.id}>
                <article className="brief-card rounded-3xl bg-white p-4 shadow-sm ring-1 ring-slate-100 sm:p-5">
                  <div className="flex items-start gap-4">
                    <div className="w-14 shrink-0 text-center">
                      <p className="text-lg font-extrabold tabular-nums text-slate-900">{start !== null ? hhmm(start) : '—'}</p>
                      <p className="text-[11px] font-semibold text-slate-400">{dur} min</p>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <button onClick={() => onOpenMeeting?.(m)} className="no-print-link text-left text-base font-bold text-slate-900 hover:text-violet-700">
                          {m.agenda || 'Meeting'}
                        </button>
                        {String(m.priority).toLowerCase() === 'high' && <span className="rounded-full bg-rose-50 px-2 py-0.5 text-[10px] font-bold text-rose-700 ring-1 ring-inset ring-rose-500/20">High priority</span>}
                        {!past.length && m.officer_name && <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700 ring-1 ring-inset ring-emerald-500/20"><Sparkles className="h-3 w-3" /> First meeting</span>}
                      </div>

                      {m.officer_name && (() => {
                        const live = liveOf(m);
                        const saved = m.designation || m.current_position || '';
                        const post = live?.designation || saved;
                        const moved = live?.designation && saved && live.designation.trim().toLowerCase() !== saved.trim().toLowerCase();
                        const birthday = live?.dob && live.dob.slice(5) === mmdd;
                        const service = live?.serviceStart && live.serviceStart.slice(5) === mmdd && live.serviceStart < day;
                        return (
                          <>
                            <p className="mt-1 text-sm text-slate-700">
                              <span className="font-semibold">{m.officer_name}</span>
                              {post && <span className="text-slate-500"> · {post}</span>}
                              {m.officer_type && <span className="ml-1.5 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-500">{m.officer_type}</span>}
                            </p>
                            {(moved || birthday || service) && (
                              <div className="mt-1.5 flex flex-wrap gap-1.5">
                                {moved && (
                                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-700 ring-1 ring-inset ring-amber-500/20">
                                    <ArrowRightLeft className="h-3 w-3" /> New posting — was {saved}
                                  </span>
                                )}
                                {birthday && (
                                  <span className="inline-flex items-center gap-1 rounded-full bg-fuchsia-50 px-2 py-0.5 text-[10px] font-bold text-fuchsia-700 ring-1 ring-inset ring-fuchsia-500/20">
                                    <Cake className="h-3 w-3" /> Birthday on this day
                                  </span>
                                )}
                                {service && (
                                  <span className="inline-flex items-center gap-1 rounded-full bg-sky-50 px-2 py-0.5 text-[10px] font-bold text-sky-700 ring-1 ring-inset ring-sky-500/20">
                                    <Award className="h-3 w-3" /> {Number(day.slice(0, 4)) - Number(live!.serviceStart.slice(0, 4))} years of service
                                  </span>
                                )}
                              </div>
                            )}
                          </>
                        );
                      })()}

                      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                        {m.location && <span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" /> {m.location}</span>}
                        {m.meet_link && <a href={m.meet_link} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-violet-600 hover:underline"><Video className="h-3.5 w-3.5" /> Google Meet</a>}
                        {(liveOf(m)?.phone || m.contact_number) && <span className="flex items-center gap-1"><Phone className="h-3.5 w-3.5" /> {liveOf(m)?.phone || m.contact_number}</span>}
                        {(liveOf(m)?.email || m.email) && <span className="flex items-center gap-1"><Mail className="h-3.5 w-3.5" /> {liveOf(m)?.email || m.email}</span>}
                      </div>

                      {last && (
                        <div className="mt-3 rounded-2xl bg-[#f7f6fd] p-3 ring-1 ring-inset ring-violet-100">
                          <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-violet-600">
                            <History className="h-3.5 w-3.5" /> Met {past.length} time{past.length === 1 ? '' : 's'} before · last on {pretty(dayOf(last))}
                          </p>
                          <p className="mt-1 text-sm text-slate-700">Last agenda: <span className="font-medium">{last.agenda || '—'}</span></p>
                          {last.minutes && <p className="mt-1 text-xs text-slate-600"><span className="font-semibold">Minutes:</span> {snippet(last.minutes)}</p>}
                          {last.follow_up_notes && <p className="mt-1 text-xs text-slate-600"><span className="font-semibold">Follow-up notes:</span> {snippet(last.follow_up_notes, 160)}</p>}
                        </div>
                      )}
                      {openFollowUp && (
                        <p className="mt-2 flex items-start gap-1.5 text-xs font-medium text-amber-700">
                          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                          <span>
                            Follow-up {String(openFollowUp.follow_up_date).slice(0, 10) < day ? 'was due' : 'due'} {pretty(String(openFollowUp.follow_up_date).slice(0, 10))}
                            {openFollowUp !== last && ` (from ${pretty(dayOf(openFollowUp))})`}
                            {openFollowUp.follow_up_notes && openFollowUp !== last && `: ${snippet(openFollowUp.follow_up_notes, 100)}`}
                          </span>
                        </p>
                      )}
                      {m.follow_up_notes && !last && (
                        <p className="mt-2 text-xs text-slate-500"><span className="font-semibold">Notes:</span> {snippet(m.follow_up_notes, 160)}</p>
                      )}
                    </div>
                  </div>
                </article>

                {gap !== null && idx < items.length - 1 && (
                  <div className="flex items-center gap-2 px-6 py-1.5 text-[11px] font-semibold">
                    {gap < 0 ? (
                      <span className="flex items-center gap-1 text-rose-600"><AlertTriangle className="h-3.5 w-3.5" /> Overlaps the next meeting by {-gap} min</span>
                    ) : gap === 0 ? (
                      <span className="flex items-center gap-1 text-amber-600"><Clock className="h-3.5 w-3.5" /> Back-to-back — no break</span>
                    ) : (
                      <span className="flex items-center gap-1 text-slate-400"><Coffee className="h-3.5 w-3.5" /> {gap >= 60 ? `${Math.floor(gap / 60)}h ${gap % 60}m` : `${gap} min`} free</span>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
