'use client';

/* TodayFocusCard — the top of the dashboard: what's next (live countdown),
   today's schedule at a glance, and the items that need a decision
   (past meetings still "Scheduled", follow-ups due, minutes missing,
   back-to-back meetings in the next 2 weeks without enough time to travel). */

import { useMemo } from 'react';
import { AlertTriangle, ArrowRight, CalendarClock, CheckCircle2, Clock3, FileText, MapPin, PencilLine, Route, User } from 'lucide-react';
import { meetingStartsAt } from '@/lib/meetingRules';
import { isoDay } from '@/lib/trips';
import { useNow } from '@/lib/useNow';
import { fmtMinutes, travelIssues } from '@/lib/travelTime';

type M = { id: string; meeting_date?: any; meeting_time?: any; [key: string]: any };

const title = (m: M) => m.title || m.meeting_title || m.subject || m.agenda || 'Untitled meeting';
const status = (m: M) => String(m.status || 'scheduled').toLowerCase();
const isOpen = (m: M) => !/complete|done|cancel|reject/.test(status(m));
const durationMs = (m: M) => (Number(m.duration) || 30) * 60_000;
const hhmm = (d: Date) => d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false });

function countdown(ms: number) {
  const mins = Math.max(0, Math.round(ms / 60_000));
  if (mins < 1) return 'now';
  if (mins < 60) return `in ${mins} min`;
  const h = Math.floor(mins / 60);
  const rest = mins % 60;
  if (h < 24) return `in ${h}h${rest ? ` ${rest}m` : ''}`;
  const days = Math.round(h / 24);
  return `in ${days} day${days > 1 ? 's' : ''}`;
}

type Attention = { key: string; kind: 'status' | 'followup' | 'minutes' | 'travel'; meeting: M; text: string; urgent: boolean };

export default function TodayFocusCard({
  meetings, loading, onOpen, onUpdate, onCreate, delay = 0,
}: {
  meetings: M[]; loading?: boolean; onOpen: (m: any) => void; onUpdate: (m: any) => void; onCreate: () => void; delay?: number;
}) {
  const now = useNow(30_000);

  const { next, inProgress, today, attention } = useMemo(() => {
    const nowDate = new Date(now);
    const todayIso = isoDay(nowDate);
    const timed = meetings
      .map((m) => ({ m, start: meetingStartsAt(m) }))
      .filter((x): x is { m: M; start: Date } => !!x.start);

    const open = timed.filter((x) => isOpen(x.m));
    const inProgress = open.find((x) => +x.start <= now && now < +x.start + durationMs(x.m)) ?? null;
    const next = open.filter((x) => +x.start > now).sort((a, b) => +a.start - +b.start)[0] ?? null;
    const today = timed
      .filter((x) => isoDay(x.start) === todayIso && !/cancel|reject/.test(status(x.m)))
      .sort((a, b) => +a.start - +b.start);

    const attention: Attention[] = [];
    for (const x of open) {
      if (+x.start + durationMs(x.m) < now) {
        attention.push({ key: `s-${x.m.id}`, kind: 'status', meeting: x.m, urgent: true,
          text: `Held ${x.start.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} — still marked Scheduled` });
      }
    }
    // follow-ups: latest meeting per person only (same rule as notifications)
    const latest = new Map<string, M>();
    for (const m of meetings) {
      const k = m.officer_id || m.officer_name;
      if (!k || /cancel|reject/.test(status(m))) continue;
      const prev = latest.get(k);
      if (!prev || String(m.meeting_date) > String(prev.meeting_date)) latest.set(k, m);
    }
    for (const m of latest.values()) {
      const fu = String(m.follow_up_date || '').slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(fu) || fu > todayIso) continue;
      attention.push({ key: `f-${m.id}`, kind: 'followup', meeting: m, urgent: fu < todayIso,
        text: `Follow-up ${fu < todayIso ? `overdue since ${new Date(`${fu}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}` : 'due today'}${m.follow_up_notes ? ` · ${m.follow_up_notes}` : ''}` });
    }
    for (const x of timed) {
      const age = (now - +x.start) / 86_400_000;
      if (!/complete/.test(status(x.m)) || String(x.m.minutes || '').trim() || age < 0 || age > 14) continue;
      attention.push({ key: `m-${x.m.id}`, kind: 'minutes', meeting: x.m, urgent: false, text: 'Completed — minutes not recorded yet' });
    }
    // travel: upcoming back-to-back meetings too far apart for the gap between them
    const soonIso = isoDay(new Date(now + 14 * 86_400_000));
    const upcoming = meetings.filter((m) => { const d = String(m.meeting_date || '').slice(0, 10); return d >= todayIso && d <= soonIso; });
    for (const t of travelIssues(upcoming)) {
      if (t.date === todayIso && (meetingStartsAt(t.to)?.getTime() ?? 0) < now) continue;
      const day = new Date(`${t.date}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
      const route = t.estimate.mode === 'city' ? 'Venue change' : `${t.estimate.from} → ${t.estimate.to}`;
      attention.push({ key: `t-${t.from.id}-${t.to.id}`, kind: 'travel', meeting: t.to, urgent: t.level === 'too-tight',
        text: `${day} · ${route}: needs ~${fmtMinutes(t.needMin)}, ${t.gapMin <= 0 ? 'no gap' : `only ${fmtMinutes(t.gapMin)} gap`}` });
    }
    attention.sort((a, b) => Number(b.urgent) - Number(a.urgent));
    return { next, inProgress, today, attention };
  }, [meetings, now]);

  const hero = inProgress ?? next;

  const pill = 'inline-flex cursor-pointer items-center gap-1.5 rounded-full px-4 py-2 text-xs font-semibold transition-all duration-200 hover:-translate-y-0.5 active:scale-95';

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-5 xl:grid-cols-3">
      {/* ── Next up — styled like the KPI cards ── */}
      <section
        className="anim-fade-up group relative overflow-hidden rounded-3xl bg-gradient-to-br from-violet-100 to-purple-100 p-5 lg:col-span-2 xl:col-span-1"
        style={{ animationDelay: `${delay}ms` }}
      >
        <span aria-hidden className="pointer-events-none absolute -right-6 -top-6 h-20 w-20 rounded-full bg-white/50 transition-transform duration-300 group-hover:scale-125" />

        <div className="relative flex items-start justify-between gap-3">
          <p className="flex items-center gap-2 pt-1.5 text-sm font-semibold text-slate-600">
            {inProgress ? <><span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" /> In progress</> : 'Next up'}
          </p>
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white text-violet-600 shadow-sm">
            <CalendarClock className="h-5 w-5" />
          </span>
        </div>

        {loading ? (
          <div className="relative mt-4 space-y-2">
            <div className="skeleton h-8 w-32 rounded-xl" />
            <div className="skeleton h-4 w-3/4 rounded-full" />
          </div>
        ) : hero ? (
          <div className="relative mt-3">
            <p className="text-[1.85rem] font-extrabold leading-none tracking-tight text-slate-900 tabular-nums">
              {inProgress ? `ends ${countdown(+inProgress.start + durationMs(inProgress.m) - now)}` : countdown(+hero.start - now)}
            </p>
            <h3 className="mt-3 line-clamp-2 text-sm font-bold leading-snug text-slate-800">{title(hero.m)}</h3>
            <div className="mt-1.5 flex flex-wrap gap-x-3.5 gap-y-1 text-xs font-medium text-slate-500">
              <span className="inline-flex items-center gap-1">
                <Clock3 className="h-3.5 w-3.5 text-violet-500" />
                {hero.start.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })}, {hhmm(hero.start)}
              </span>
              {hero.m.officer_name && <span className="inline-flex items-center gap-1"><User className="h-3.5 w-3.5 text-violet-500" />{hero.m.officer_name}</span>}
              {(hero.m.city || hero.m.location) && (
                <span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5 text-violet-500" />{hero.m.city || hero.m.location}</span>
              )}
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <button type="button" onClick={() => onOpen(hero.m)} className={`${pill} bg-slate-900 text-white shadow-lg shadow-slate-900/10 hover:bg-slate-800`}>
                Open brief <ArrowRight className="h-3.5 w-3.5" />
              </button>
              {inProgress && (
                <button type="button" onClick={() => onUpdate(inProgress.m)} className={`${pill} bg-white text-slate-700 shadow-sm hover:text-violet-700`}>
                  <PencilLine className="h-3.5 w-3.5" /> Record outcome
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="relative mt-3">
            <p className="text-lg font-extrabold text-slate-900">Nothing scheduled</p>
            <p className="mt-1 text-xs text-slate-500">Your calendar is clear.</p>
            <button type="button" onClick={onCreate} className={`${pill} mt-4 bg-slate-900 text-white hover:bg-slate-800`}>
              Schedule a meeting <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        {/* today's timeline */}
        {!loading && today.length > 0 && (
          <div className="relative mt-5 rounded-2xl bg-white/70 p-3">
            <p className="px-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">Today · {today.length}</p>
            <ul className="mt-1.5 space-y-0.5">
              {today.slice(0, 3).map(({ m, start }) => {
                const past = +start + durationMs(m) < now;
                return (
                  <li key={m.id}>
                    <button type="button" onClick={() => onOpen(m)}
                      className={`flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-1 py-1 text-left text-xs transition-colors hover:bg-violet-50 ${past ? 'text-slate-400' : 'text-slate-700'}`}>
                      <span className="w-10 shrink-0 font-bold tabular-nums">{hhmm(start)}</span>
                      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${past ? 'bg-slate-300' : 'bg-violet-500'}`} />
                      <span className={`truncate font-medium ${past ? 'line-through' : ''}`}>{title(m)}</span>
                    </button>
                  </li>
                );
              })}
              {today.length > 3 && <li className="px-1 pt-0.5 text-[11px] text-slate-400">+{today.length - 3} more today</li>}
            </ul>
          </div>
        )}
      </section>

      {/* ── Needs attention — styled like the other white section cards ── */}
      <section
        className="anim-fade-up flex flex-col overflow-hidden rounded-3xl border border-violet-100 bg-white shadow-sm lg:col-span-3 xl:col-span-2"
        style={{ animationDelay: `${delay + 40}ms` }}
      >
        <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div>
            <h2 className="text-base font-bold text-slate-900">Needs attention</h2>
            <p className="mt-0.5 text-xs text-slate-500">Statuses to update, follow-ups due, minutes to record and tight travel</p>
          </div>
          {attention.length > 0 && (
            <span className="rounded-full bg-violet-50 px-3 py-1 text-xs font-bold tabular-nums text-violet-700">{attention.length}</span>
          )}
        </div>

        <div className="flex-1 p-4">
          {loading ? (
            <div className="grid gap-2 sm:grid-cols-2">{[0, 1, 2, 3].map((i) => <div key={i} className="skeleton h-14 rounded-2xl" />)}</div>
          ) : attention.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center rounded-2xl border border-dashed border-violet-200 bg-violet-50/40 px-4 py-8 text-center">
              <span className="flex h-11 w-11 items-center justify-center rounded-full bg-white shadow-sm">
                <CheckCircle2 className="h-5 w-5 text-emerald-500" />
              </span>
              <p className="mt-3 text-sm font-semibold text-slate-700">All caught up</p>
              <p className="mt-0.5 text-xs text-slate-500">No pending statuses, follow-ups, minutes or travel clashes.</p>
            </div>
          ) : (
            <ul className="nice-scroll grid max-h-[14.5rem] gap-2 overflow-y-auto pr-1 sm:grid-cols-2">
              {attention.map((a, i) => {
                const Icon = a.kind === 'status' ? AlertTriangle : a.kind === 'followup' ? CalendarClock : a.kind === 'travel' ? Route : FileText;
                const tone = a.kind === 'status' || (a.kind === 'travel' && a.urgent) ? 'bg-rose-50 text-rose-600' : a.kind === 'travel' ? 'bg-amber-50 text-amber-600' : a.kind === 'followup' ? 'bg-amber-50 text-amber-600' : 'bg-violet-50 text-violet-600';
                return (
                  <li key={a.key} className="anim-row" style={{ animationDelay: `${Math.min(i * 30, 180)}ms` }}>
                    <div className="group flex h-full items-center gap-3 rounded-2xl border border-slate-100 bg-white p-2.5 transition-all duration-200 hover:border-violet-200 hover:bg-violet-50/40">
                      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${tone}`}>
                        <Icon className="h-4 w-4" />
                      </span>
                      <button type="button" onClick={() => onOpen(a.meeting)} className="min-w-0 flex-1 cursor-pointer text-left">
                        <span className="block truncate text-sm font-semibold text-slate-900 transition-colors group-hover:text-violet-700">
                          {a.meeting.officer_name || title(a.meeting)}
                        </span>
                        <span className="block truncate text-[11px] text-slate-500">{a.text}</span>
                      </button>
                      <button type="button" onClick={() => (a.kind === 'status' || a.kind === 'travel' ? onUpdate(a.meeting) : onOpen(a.meeting))}
                        className="shrink-0 cursor-pointer rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-600 transition-all hover:border-violet-200 hover:text-violet-700 active:scale-95">
                        {a.kind === 'status' ? 'Update' : a.kind === 'travel' ? 'Reschedule' : 'Open'}
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}
