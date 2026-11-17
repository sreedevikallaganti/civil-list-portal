'use client';

/* VisitPlannerCard — the dashboard's "Trips" card (it replaced the separate Reconnect card).
   For every upcoming visit outside the home city: who else to meet there. "Met here before"
   comes from past meetings, "Based in <city>" from the officer / contact directory.
   "Other city" answers the same question for any city you're thinking of travelling to.
   Compact by design: one visit at a time (tabs), one list at a time (toggle),
   a few people shown with the rest in a short scroll area. */

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Plane, UserPlus, History, Building2, Loader2, AlertTriangle, ChevronDown, CalendarCheck, Search, MapPin, Phone, Mail } from 'lucide-react';
import type { DirectoryPerson } from '@/lib/memories/directory';
import { isoDay, metBeforeFor, scheduleHref, suggestionsFor, tripDates, upcomingTrips, type Trip } from '@/lib/trips';
import { meetingCityKey } from '@/lib/revisit';
import { cityKey, cityLabel, CITIES, HOME_CITY, isHomeCity } from '@/lib/cities';

const SHOW = 3;
const OTHER = 'other';

type Tab = 'met' | 'based';

/** A visit to a city that isn't booked yet ("Other city"). */
type AnyTrip = Trip & { adhoc?: boolean };

function adhocTrip(text: string): AnyTrip | null {
  const key = cityKey(text);
  if (!key) return null;
  const today = isoDay(new Date());
  return { key: `${OTHER}|${key}`, city: key, label: cityLabel(key, text), from: today, to: today, meetings: [], ongoing: false, planDate: today, adhoc: true };
}

/** "Schedule" link — an unbooked city gets no date pre-filled. */
function hrefFor(trip: AnyTrip, who: { meetingId?: string; directory?: DirectoryPerson }) {
  const href = scheduleHref(trip, who);
  if (!trip.adhoc) return href;
  const [path, q] = href.split('?');
  const p = new URLSearchParams(q);
  p.delete('date');
  return `${path}?${p}`;
}

function PersonRow({ name, sub, badge, warn, href, primary, phone, email }: {
  name: string; sub: string; badge?: string; warn?: { text: string; overdue: boolean }; href: string; primary?: boolean; phone?: string; email?: string;
}) {
  const icon = 'hidden h-7 w-7 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 hover:border-violet-200 hover:text-violet-600 sm:flex';
  return (
    <li className="flex items-center gap-2 rounded-xl bg-white px-2.5 py-2 ring-1 ring-slate-100 sm:gap-3 sm:px-3">
      {badge && <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-500">{badge}</span>}
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span className="truncate text-sm font-semibold text-slate-800">{name}</span>
          {warn && (
            <span title={warn.text} className={`inline-flex shrink-0 items-center gap-0.5 text-[10px] font-bold ${warn.overdue ? 'text-rose-600' : 'text-amber-600'}`}>
              <AlertTriangle className="h-3 w-3" /><span className="hidden sm:inline">{warn.text}</span>
            </span>
          )}
        </span>
        <span className="block truncate text-[11px] text-slate-500">{sub}</span>
      </span>
      {phone && <a href={`tel:${phone}`} title={phone} aria-label={`Call ${name}`} className={icon}><Phone className="h-3.5 w-3.5" /></a>}
      {email && <a href={`mailto:${email}`} title={email} aria-label={`Email ${name}`} className={icon}><Mail className="h-3.5 w-3.5" /></a>}
      <Link href={href} aria-label={`Schedule a meeting with ${name}`} title="Schedule"
        className={primary
          ? 'inline-flex shrink-0 items-center gap-1 rounded-full bg-slate-900 px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-slate-800'
          : 'inline-flex shrink-0 items-center gap-1 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-semibold text-slate-700 hover:border-violet-200 hover:text-violet-700'}>
        <UserPlus className="h-3.5 w-3.5" /><span className="hidden sm:inline">Schedule</span>
      </Link>
    </li>
  );
}

function TripPanel({ trip, meetings }: { trip: AnyTrip; meetings: any[] }) {
  const metBefore = useMemo(() => metBeforeFor(trip, meetings), [trip, meetings]);
  const [basedThere, setBasedThere] = useState<DirectoryPerson[] | null>(null);
  const [tab, setTab] = useState<Tab>(metBefore.length ? 'met' : 'based');
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    let alive = true;
    suggestionsFor(trip, meetings).then((s) => alive && setBasedThere(s.basedThere)).catch(() => alive && setBasedThere([]));
    return () => { alive = false; };
  }, [trip, meetings]);

  const booked = trip.meetings.map((m) => m.officer_name || m.agenda).filter(Boolean);
  const count = tab === 'met' ? metBefore.length : basedThere?.length ?? 0;
  const hidden = Math.max(0, count - SHOW);
  const limit = showAll ? 50 : SHOW;

  const tabBtn = (t: Tab, icon: ReactNode, label: string, n: number | null) => (
    <button type="button" role="tab" aria-selected={tab === t} onClick={() => { setTab(t); setShowAll(false); }}
      className={`flex min-w-0 flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-[11px] font-semibold transition-colors ${
        tab === t ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
      {icon}<span className="truncate">{label}</span>
      <span className={`rounded-full px-1.5 text-[10px] ${tab === t ? 'bg-violet-100 text-violet-700' : 'bg-slate-200/70 text-slate-500'}`}>
        {n === null ? '…' : n}
      </span>
    </button>
  );

  return (
    <div>
      {/* what's already booked */}
      {!trip.adhoc && (
        <p className="mb-3 flex items-start gap-1.5 text-[11px] text-slate-500">
          <CalendarCheck className="mt-px h-3.5 w-3.5 shrink-0 text-emerald-500" />
          <span className="line-clamp-1">
            <b className="text-slate-700">{trip.meetings.length} booked</b>
            {booked.length ? `: ${booked.slice(0, 3).join(', ')}${booked.length > 3 ? ` +${booked.length - 3}` : ''}` : ''}
          </span>
        </p>
      )}

      {/* which list */}
      <div role="tablist" className="flex gap-1 rounded-xl bg-slate-100 p-1">
        {tabBtn('met', <History className="h-3.5 w-3.5 shrink-0" />, 'Met here before', metBefore.length)}
        {tabBtn('based', <Building2 className="h-3.5 w-3.5 shrink-0" />, `Based in ${trip.label}`, basedThere === null ? null : basedThere.length)}
      </div>

      <div className={`mt-2 ${showAll ? 'max-h-72 overflow-y-auto pr-1' : ''}`}>
        {tab === 'met' ? (
          metBefore.length === 0 ? (
            <p className="px-1 py-3 text-xs text-slate-400">
              {trip.adhoc ? `No past meetings in ${trip.label} yet.` : `No earlier meetings in ${trip.label} that aren’t already booked.`}
            </p>
          ) : (
            <ul className="space-y-1.5">
              {metBefore.slice(0, limit).map((p) => (
                <PersonRow key={p.key} primary name={p.name} phone={p.phone} email={p.email}
                  href={hrefFor(trip, { meetingId: p.lastMeeting?.id })}
                  sub={`${p.designation ? `${p.designation} · ` : ''}met ${p.timesMet}×${p.lastMetAt ? `, last ${p.lastMetAt.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}` : ''}`}
                  warn={p.followUpOverdue || p.pendingFollowUp ? { text: p.followUpOverdue ? 'Follow-up overdue' : 'Follow-up pending', overdue: !!p.followUpOverdue } : undefined}
                />
              ))}
            </ul>
          )
        ) : basedThere === null ? (
          <p className="flex items-center gap-1.5 px-1 py-3 text-xs text-slate-400"><Loader2 className="h-3 w-3 animate-spin" /> Searching the directory…</p>
        ) : basedThere.length === 0 ? (
          <p className="px-1 py-3 text-xs text-slate-400">No officers or contacts in the directory mention {trip.label}.</p>
        ) : (
          <ul className="space-y-1.5">
            {basedThere.slice(0, limit).map((p) => (
              <PersonRow key={`${p.kind}-${p.id}`} badge={p.kind} name={p.name} sub={[p.role, p.org].filter(Boolean).join(' · ') || 'Not met yet'}
                phone={p.phone} email={p.email} href={hrefFor(trip, { directory: p })} />
            ))}
          </ul>
        )}
      </div>

      {hidden > 0 && (
        <button type="button" onClick={() => setShowAll((v) => !v)}
          className="mt-2 inline-flex items-center gap-1 text-[11px] font-semibold text-violet-600 hover:underline">
          {showAll ? 'Show fewer' : `Show ${hidden} more`}
          <ChevronDown className={`h-3.5 w-3.5 transition-transform ${showAll ? 'rotate-180' : ''}`} />
        </button>
      )}
    </div>
  );
}

/** "Other city": type or pick a city to see who you know there. */
function OtherCity({ meetings, city, onCity }: { meetings: any[]; city: AnyTrip | null; onCity: (t: AnyTrip | null) => void }) {
  const [query, setQuery] = useState(city?.label ?? '');
  /* cities visited before (most meetings first), for the quick picks */
  const visited = useMemo(() => {
    const counts = new Map<string, { label: string; n: number }>();
    for (const m of meetings) {
      const k = meetingCityKey(m);
      if (!k || isHomeCity(k)) continue;
      const c = counts.get(k) ?? { label: cityLabel(k, String(m.city || '').split(',')[0]), n: 0 };
      c.n++;
      counts.set(k, c);
    }
    return [...counts.entries()].sort((a, b) => b[1].n - a[1].n).slice(0, 10);
  }, [meetings]);

  const pick = (text: string) => { setQuery(text); onCity(text.trim() ? adhocTrip(text.trim()) : null); };

  return (
    <div className="mb-3">
      <form onSubmit={(e) => { e.preventDefault(); pick(query); }} className="relative">
        <MapPin className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          list="trips-cities"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            if (CITIES.some((c) => c.label === e.target.value) || visited.some(([, c]) => c.label === e.target.value)) pick(e.target.value);
          }}
          placeholder="Where are you travelling? e.g. Delhi, Dubai…"
          aria-label="City"
          className="h-10 w-full rounded-full border border-slate-200 bg-slate-50/80 pl-10 pr-20 text-sm text-slate-900 placeholder-slate-400 hover:border-slate-300 hover:bg-white focus:border-violet-400 focus:bg-white focus:outline-none focus:ring-4 focus:ring-violet-500/10"
        />
        <datalist id="trips-cities">
          {[...new Set([...visited.map(([, c]) => c.label), ...CITIES.filter((c) => !isHomeCity(c.key)).map((c) => c.label)])].map((c) => <option key={c} value={c} />)}
        </datalist>
        <button type="submit" className="absolute right-1 top-1/2 h-8 -translate-y-1/2 rounded-full bg-slate-900 px-4 text-xs font-semibold text-white hover:bg-slate-800">Find</button>
      </form>
      {visited.length > 0 && (
        <div className="mt-2 flex gap-1.5 overflow-x-auto pb-1">
          {visited.map(([k, c]) => (
            <button key={k} type="button" onClick={() => pick(c.label)}
              className={`shrink-0 rounded-full border px-3 py-1 text-[11px] font-semibold transition-colors ${
                city?.city === k ? 'border-violet-300 bg-violet-50 text-violet-700' : 'border-slate-200 bg-white text-slate-600 hover:border-violet-200 hover:text-violet-700'}`}>
              {c.label} <span className="tabular-nums text-slate-400">{c.n}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function VisitPlannerCard({ meetings, loading, delay = 0 }: { meetings: any[]; loading?: boolean; delay?: number }) {
  const trips = useMemo(() => upcomingTrips(meetings, { withinDays: 45 }).slice(0, 3), [meetings]);
  /* ?visit=<key> (from a notification) selects that visit and scrolls the card into view.
     This card is loaded client-only (ssr: false), so no Suspense boundary is needed. */
  const focus = useSearchParams().get('visit');
  const [selected, setSelected] = useState<string | null>(focus);
  const [other, setOther] = useState<AnyTrip | null>(null);
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    if (focus && trips.some((t) => t.key === focus)) {
      ref.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [focus, trips]);

  const otherOn = selected === OTHER || (!loading && trips.length === 0);
  const trip: AnyTrip | null = otherOn ? other : trips.find((t) => t.key === selected) ?? trips[0] ?? null;

  return (
    <section ref={ref} className="anim-fade-up rounded-3xl border border-violet-100 bg-white p-5 shadow-sm" style={{ animationDelay: `${delay}ms` }}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-slate-900">Trips</h2>
          <p className="mt-0.5 text-xs text-slate-500">People worth meeting in the cities you’re visiting</p>
        </div>
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-sky-50 text-sky-600"><Plane className="h-4 w-4" /></span>
      </div>

      <div className="mt-4">
        {loading ? (
          <div className="h-24 animate-pulse rounded-2xl bg-slate-100" />
        ) : (
          <>
            {/* one tab per visit, plus "Other city" */}
            <div role="tablist" aria-label="Visits" className="-mx-1 mb-3 flex gap-2 overflow-x-auto px-1 pb-1">
              {trips.map((t) => {
                const on = !otherOn && t.key === trip?.key;
                return (
                  <button key={t.key} type="button" role="tab" aria-selected={on} onClick={() => setSelected(t.key)}
                    className={`flex shrink-0 items-center gap-2 rounded-2xl px-3 py-2 text-left ring-1 ring-inset transition-colors ${
                      on ? 'bg-sky-50 ring-sky-300' : 'bg-white ring-slate-200 hover:bg-slate-50'}`}>
                    {t.ongoing && <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" title="You’re here now" />}
                    <span>
                      <span className={`block text-sm font-bold leading-tight ${on ? 'text-sky-900' : 'text-slate-800'}`}>{t.label}</span>
                      <span className="block text-[11px] text-slate-500">{t.ongoing ? 'Here now' : tripDates(t)}</span>
                    </span>
                  </button>
                );
              })}
              <button type="button" role="tab" aria-selected={otherOn} onClick={() => setSelected(OTHER)}
                className={`flex shrink-0 items-center gap-2 rounded-2xl px-3 py-2 text-left ring-1 ring-inset transition-colors ${
                  otherOn ? 'bg-sky-50 ring-sky-300' : 'bg-white ring-slate-200 hover:bg-slate-50'}`}>
                <Search className={`h-4 w-4 ${otherOn ? 'text-sky-600' : 'text-slate-400'}`} />
                <span>
                  <span className={`block text-sm font-bold leading-tight ${otherOn ? 'text-sky-900' : 'text-slate-800'}`}>{other && otherOn ? other.label : 'Other city'}</span>
                  <span className="block text-[11px] text-slate-500">Planning a trip?</span>
                </span>
              </button>
            </div>

            {otherOn && (
              <>
                {trips.length === 0 && (
                  <p className="mb-3 text-[11px] text-slate-500">
                    No visits outside {cityLabel(HOME_CITY)} in the next 45 days — booked visits appear here automatically when a meeting has another <b>City</b>.
                  </p>
                )}
                <OtherCity meetings={meetings} city={other} onCity={setOther} />
              </>
            )}

            {trip && <TripPanel key={trip.key} trip={trip} meetings={meetings} />}
          </>
        )}
      </div>
    </section>
  );
}
