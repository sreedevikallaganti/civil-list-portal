'use client';

/* VisitPlannerCard — dashboard card: for every upcoming visit outside the home
   city, who else to meet there. "Met before here" comes from past meetings,
   "Also based in <city>" from the officer / contact directory. */

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Plane, MapPin, UserPlus, History, Building2, Loader2, AlertTriangle } from 'lucide-react';
import type { DirectoryPerson } from '@/lib/memories/directory';
import { metBeforeFor, scheduleHref, suggestionsFor, tripDates, upcomingTrips, type Trip } from '@/lib/trips';
import { cityLabel, HOME_CITY } from '@/lib/cities';

const SHOW = 4;

function TripBlock({ trip, meetings, highlight }: { trip: Trip; meetings: any[]; highlight: boolean }) {
  const metBefore = useMemo(() => metBeforeFor(trip, meetings), [trip, meetings]);
  const [basedThere, setBasedThere] = useState<DirectoryPerson[] | null>(null);
  const [showAll, setShowAll] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let alive = true;
    suggestionsFor(trip, meetings).then((s) => alive && setBasedThere(s.basedThere)).catch(() => alive && setBasedThere([]));
    return () => { alive = false; };
  }, [trip, meetings]);

  useEffect(() => {
    if (highlight) ref.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [highlight]);

  const limit = showAll ? 50 : SHOW;
  return (
    <div ref={ref} className={`rounded-2xl p-4 ring-1 ring-inset transition-colors ${highlight ? 'bg-sky-50 ring-sky-300' : 'bg-slate-50/70 ring-slate-100'}`}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-white text-sky-600"><MapPin className="h-4 w-4" /></span>
        <p className="text-sm font-bold text-slate-900">{trip.label}</p>
        {trip.ongoing && (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500 px-2.5 py-0.5 text-[11px] font-bold text-white">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" /> You’re here now
          </span>
        )}
        <span className="rounded-full bg-white px-2.5 py-0.5 text-[11px] font-semibold text-slate-600 ring-1 ring-inset ring-slate-200">{tripDates(trip)}</span>
        <span className="text-[11px] text-slate-400">
          {trip.meetings.length} booked: {trip.meetings.map((m) => m.officer_name || m.agenda).filter(Boolean).slice(0, 3).join(', ')}
          {trip.meetings.length > 3 ? '…' : ''}
        </span>
      </div>

      {/* met before here */}
      <p className="mb-1.5 mt-3 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">
        <History className="h-3 w-3" /> Met before in {trip.label}
      </p>
      {metBefore.length === 0 ? (
        <p className="text-xs text-slate-400">No earlier meetings here that aren’t already booked.</p>
      ) : (
        <ul className="space-y-1.5">
          {metBefore.slice(0, limit).map((p) => (
            <li key={p.key} className="flex items-center gap-3 rounded-xl bg-white px-3 py-2 ring-1 ring-slate-100">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-slate-800">{p.name}</span>
                <span className="block truncate text-[11px] text-slate-500">
                  {p.designation ? `${p.designation} · ` : ''}met {p.timesMet}×
                  {p.lastMetAt ? `, last ${p.lastMetAt.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}` : ''}
                </span>
                {(p.followUpOverdue || p.pendingFollowUp) && (
                  <span className={`mt-0.5 inline-flex items-center gap-1 text-[10px] font-bold ${p.followUpOverdue ? 'text-rose-600' : 'text-amber-600'}`}>
                    <AlertTriangle className="h-3 w-3" /> {p.followUpOverdue ? 'Follow-up overdue' : 'Follow-up pending'}
                  </span>
                )}
              </span>
              <Link href={scheduleHref(trip, { meetingId: p.lastMeeting?.id })}
                className="inline-flex shrink-0 items-center gap-1 rounded-full bg-slate-900 px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-slate-800">
                <UserPlus className="h-3.5 w-3.5" /> Schedule
              </Link>
            </li>
          ))}
        </ul>
      )}

      {/* based there (directory) */}
      <p className="mb-1.5 mt-3 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">
        <Building2 className="h-3 w-3" /> Also based in {trip.label}
      </p>
      {basedThere === null ? (
        <p className="flex items-center gap-1.5 text-xs text-slate-400"><Loader2 className="h-3 w-3 animate-spin" /> Searching the directory…</p>
      ) : basedThere.length === 0 ? (
        <p className="text-xs text-slate-400">No officers or contacts in the directory mention {trip.label}.</p>
      ) : (
        <ul className="space-y-1.5">
          {basedThere.slice(0, limit).map((p) => (
            <li key={`${p.kind}-${p.id}`} className="flex items-center gap-3 rounded-xl bg-white px-3 py-2 ring-1 ring-slate-100">
              <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-500">{p.kind}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-slate-800">{p.name}</span>
                <span className="block truncate text-[11px] text-slate-500">{p.role || p.org || '—'}</span>
              </span>
              <Link href={scheduleHref(trip, { directory: p })}
                className="inline-flex shrink-0 items-center gap-1 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-semibold text-slate-700 hover:border-violet-200 hover:text-violet-700">
                <UserPlus className="h-3.5 w-3.5" /> Schedule
              </Link>
            </li>
          ))}
        </ul>
      )}

      {(metBefore.length > SHOW || (basedThere?.length ?? 0) > SHOW) && (
        <button onClick={() => setShowAll((v) => !v)} className="mt-2 text-[11px] font-semibold text-violet-600 hover:underline">
          {showAll ? 'Show fewer' : 'Show everyone'}
        </button>
      )}
    </div>
  );
}

export default function VisitPlannerCard({ meetings, loading, delay = 0 }: { meetings: any[]; loading?: boolean; delay?: number }) {
  const trips = useMemo(() => upcomingTrips(meetings, { withinDays: 45 }).slice(0, 3), [meetings]);
  /* ?visit=<key> (from a notification) scrolls to and highlights that visit.
     This card is loaded client-only (ssr: false), so no Suspense boundary is needed. */
  const focus = useSearchParams().get('visit');

  return (
    <section className="anim-fade-up rounded-3xl border border-violet-100 bg-white p-5 shadow-sm" style={{ animationDelay: `${delay}ms` }}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-slate-900">Upcoming visits</h2>
          <p className="mt-0.5 text-xs text-slate-500">
            People worth meeting while you’re there · a visit stays here until the day after its last meeting
          </p>
        </div>
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-sky-50 text-sky-600"><Plane className="h-4 w-4" /></span>
      </div>

      <div className="mt-4 space-y-3">
        {loading ? (
          <div className="h-24 animate-pulse rounded-2xl bg-slate-100" />
        ) : trips.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-sky-200 bg-sky-50/40 px-4 py-6 text-center text-xs leading-relaxed text-slate-500">
            No visits outside {cityLabel(HOME_CITY)} in the next 45 days. When you book a meeting in another city
            (fill in its <b>City</b>), people you could also meet there will appear here.
          </p>
        ) : (
          trips.map((t) => <TripBlock key={t.key} trip={t} meetings={meetings} highlight={focus === t.key} />)
        )}
      </div>
    </section>
  );
}
