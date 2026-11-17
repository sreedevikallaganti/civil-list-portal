'use client';

/* MeetingMapView — /map: where meetings are held and which places are visited most.
   A "visit" is a distinct day spent in a city (a 3-day trip with 5 meetings = 3 visits);
   ranking is by visits, then meetings. Cancelled meetings never count. */

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import {
  AlertTriangle, ArrowUpRight, CalendarDays, Home, Loader2, MapPinned, MapPin, Plane, Trophy, Users,
} from 'lucide-react';
import pb from '@/lib/pocketbase';
import { apiJSON } from '@/lib/apiClient';
import { HOME_PLACE, placeStats, type LatLng } from '@/lib/geo';

const LeafletMap = dynamic(() => import('@/components/map/LeafletMap'), {
  ssr: false,
  loading: () => (
    <div className="flex h-full min-h-[420px] items-center justify-center gap-2 rounded-2xl bg-slate-100 text-sm text-slate-500">
      <Loader2 className="h-4 w-4 animate-spin text-violet-500" /> Loading map…
    </div>
  ),
});

type Period = 'all' | 'year' | '12m';
type Scope = 'held' | 'all';

const PERIODS: { value: Period; label: string }[] = [
  { value: 'all', label: 'All time' },
  { value: 'year', label: `This year (${new Date().getFullYear()})` },
  { value: '12m', label: 'Last 12 months' },
];

const isoToday = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const fmtDate = (iso: string) =>
  iso ? new Date(`${iso}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
const isCancelled = (m: any) => /cancel|reject/i.test(String(m.status || ''));

export default function MeetingMapView() {
  const [meetings, setMeetings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [period, setPeriod] = useState<Period>('all');
  const [scope, setScope] = useState<Scope>('all');
  const [includeHome, setIncludeHome] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);
  const [extraCoords, setExtraCoords] = useState<Record<string, LatLng>>({});

  useEffect(() => {
    pb.collection('meetings')
      .getFullList({ requestKey: null })
      .then((rows) => setMeetings(rows.filter((m: any) => !m.deleted)))
      .catch((e) => setError(e?.message || 'Could not load meetings.'))
      .finally(() => setLoading(false));
  }, []);

  /* meetings that count under the current filters */
  const counted = useMemo(() => {
    const today = isoToday();
    const now = new Date();
    const from = period === 'year' ? `${now.getFullYear()}-01-01`
      : period === '12m' ? `${now.getFullYear() - 1}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
      : '';
    return meetings.filter((m) => {
      if (isCancelled(m)) return false;
      const day = String(m.meeting_date || '').slice(0, 10);
      if (from && (!day || day < from)) return false;
      if (scope === 'held' && (!day || day > today)) return false;
      return true;
    });
  }, [meetings, period, scope]);

  const { places: allPlaces, unplaced } = useMemo(() => placeStats(counted, extraCoords), [counted, extraCoords]);
  const places = useMemo(() => (includeHome ? allPlaces : allPlaces.filter((p) => !p.isHome)), [allPlaces, includeHome]);

  /* look up coordinates for places the built-in table doesn't know */
  const missing = useMemo(
    () => allPlaces.filter((p) => !p.coords && !(p.city in extraCoords)).map((p) => p.city),
    [allPlaces, extraCoords],
  );
  useEffect(() => {
    if (!missing.length) return;
    apiJSON<{ coords: Record<string, LatLng | null> }>('/api/geocode', { names: missing }, { timeoutMs: 30_000 })
      .then(({ coords }) => {
        setExtraCoords((prev) => {
          const next = { ...prev };
          for (const name of missing) if (coords[name]) next[name] = coords[name]!;
          return next;
        });
      })
      .catch(() => { /* stays listed, just not on the map */ });
  }, [missing]);

  const away = allPlaces.filter((p) => !p.isHome);
  const topAway = away[0];
  const awayDays = away.reduce((n, p) => n + p.visits, 0);
  const sel = places.find((p) => p.city === selected) ?? null;
  const selMeetings = useMemo(
    () => (sel ? counted.filter((m) => sel.ids.includes(m.id)).sort((a, b) => String(b.meeting_date).localeCompare(String(a.meeting_date))) : []),
    [sel, counted],
  );
  const maxVisits = Math.max(1, ...places.map((p) => p.visits));
  const notOnMap = places.filter((p) => !p.coords).length;

  return (
    <div className="relative min-h-screen bg-gradient-to-br from-indigo-200 via-violet-100 to-purple-200 p-0 sm:p-5 lg:p-8">
      <div className="relative mx-auto max-w-[1500px] overflow-hidden bg-white sm:rounded-[1.75rem] sm:shadow-2xl sm:shadow-violet-300/40 sm:ring-1 sm:ring-white/70">
        {/* App bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 bg-white px-4 py-3.5 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-900 text-white shadow-sm"><MapPinned className="h-4 w-4" /></span>
            <div className="min-w-0">
              <p className="truncate text-sm font-bold text-slate-900">Meeting Map</p>
              <p className="truncate text-[11px] text-slate-400">Where meetings are held, and the places visited most</p>
            </div>
          </div>
          <Link href="/calendar" data-tooltip="Open the calendar"
            className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-600 hover:border-violet-200 hover:text-violet-700">
            <CalendarDays className="h-3.5 w-3.5" /> Calendar
          </Link>
        </div>

        <div className="space-y-6 bg-[#f7f6fd] p-3 sm:p-6 lg:p-7">
          {error && (
            <div className="flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {error}
            </div>
          )}

          {/* Title + filters */}
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 lg:text-3xl">
                Places <span className="bg-gradient-to-r from-violet-600 to-indigo-600 bg-clip-text text-transparent">visited</span>
              </h1>
              <p className="mt-1 text-sm text-slate-500">A visit is a day spent in a city — a 3-day trip counts as 3 visits.</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center rounded-full bg-white p-1 shadow-sm ring-1 ring-slate-200">
                {PERIODS.map((p) => (
                  <button key={p.value} type="button" onClick={() => setPeriod(p.value)} aria-pressed={period === p.value}
                    className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-all ${period === p.value ? 'bg-slate-900 text-white' : 'text-slate-500 hover:text-slate-800'}`}>
                    {p.label}
                  </button>
                ))}
              </div>
              <div className="flex items-center rounded-full bg-white p-1 shadow-sm ring-1 ring-slate-200">
                {([['all', 'Held + upcoming'], ['held', 'Held only']] as const).map(([v, label]) => (
                  <button key={v} type="button" onClick={() => setScope(v)} aria-pressed={scope === v}
                    data-tooltip={v === 'held' ? 'Only meetings on or before today' : 'Also count meetings that are planned'}
                    className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-all ${scope === v ? 'bg-violet-600 text-white' : 'text-slate-500 hover:text-slate-800'}`}>
                    {label}
                  </button>
                ))}
              </div>
              <button type="button" onClick={() => setIncludeHome((v) => !v)} aria-pressed={includeHome}
                data-tooltip={`${includeHome ? 'Hide' : 'Show'} ${HOME_PLACE}, the home office city`}
                className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-semibold ring-1 transition-all ${includeHome ? 'bg-white text-slate-700 ring-slate-200' : 'bg-slate-100 text-slate-400 ring-slate-200 line-through'}`}>
                <Home className="h-3.5 w-3.5" /> {HOME_PLACE}
              </button>
            </div>
          </div>

          {/* Summary */}
          <section className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
            <Stat icon={<MapPin className="h-5 w-5" />} label="Places" value={loading ? '…' : String(allPlaces.length)} sub={`${away.length} outside ${HOME_PLACE}`} tone="from-violet-100 to-purple-100 text-violet-600" />
            <Stat icon={<CalendarDays className="h-5 w-5" />} label="Meetings mapped" value={loading ? '…' : String(counted.length - unplaced.length)}
              sub={unplaced.length ? `${unplaced.length} without a place` : 'All have a place'} tone="from-sky-100 to-blue-100 text-sky-600" />
            <Stat icon={<Trophy className="h-5 w-5" />} label="Most visited outside home" value={loading ? '…' : topAway?.city ?? '—'}
              sub={topAway ? `${topAway.visits} visit day${topAway.visits === 1 ? '' : 's'} · ${topAway.meetings} meetings` : 'No trips yet'} tone="from-amber-100 to-orange-100 text-amber-600" />
            <Stat icon={<Plane className="h-5 w-5" />} label="Days away" value={loading ? '…' : String(awayDays)} sub={`in ${away.length} cit${away.length === 1 ? 'y' : 'ies'}`} tone="from-emerald-100 to-green-100 text-emerald-600" />
          </section>

          {/* Map + ranking */}
          <section className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
            <div className="rounded-3xl bg-white p-2 shadow-sm ring-1 ring-slate-100 sm:p-3">
              <div className="h-[460px] lg:h-[560px]">
                <LeafletMap places={places} selected={selected} onSelect={setSelected} />
              </div>
              <div className="flex flex-wrap items-center gap-x-5 gap-y-1 px-2 pb-1 pt-3 text-[11px] text-slate-500">
                <span className="inline-flex items-center gap-1.5"><span className="h-3 w-3 rounded-full bg-violet-600" /> Away</span>
                <span className="inline-flex items-center gap-1.5"><span className="h-3 w-3 rounded-full bg-slate-900" /> {HOME_PLACE} (home)</span>
                <span>Bigger circle = more visit days · click a circle for its meetings</span>
                {notOnMap > 0 && <span className="text-amber-600">{notOnMap} place{notOnMap === 1 ? '' : 's'} still being located</span>}
              </div>
            </div>

            <div className="flex min-h-0 flex-col rounded-3xl bg-white shadow-sm ring-1 ring-slate-100">
              <div className="border-b border-slate-100 px-5 py-4">
                <h2 className="text-base font-bold text-slate-900">Most visited</h2>
                <p className="mt-0.5 text-xs text-slate-500">Ranked by visit days, then meetings</p>
              </div>
              <ol className="nice-scroll max-h-[520px] flex-1 divide-y divide-slate-50 overflow-y-auto p-2">
                {loading && [0, 1, 2, 3].map((i) => <li key={i} className="m-2 h-12 animate-pulse rounded-xl bg-slate-100" />)}
                {!loading && places.length === 0 && (
                  <li className="px-4 py-10 text-center text-sm text-slate-500">No meetings with a place in this period.</li>
                )}
                {places.map((p, i) => (
                  <li key={p.city}>
                    <button type="button" onClick={() => setSelected(p.city)}
                      className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors ${selected === p.city ? 'bg-violet-50 ring-1 ring-violet-200' : 'hover:bg-slate-50'}`}>
                      <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold tabular-nums ${i === 0 ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-500'}`}>{i + 1}</span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-1.5">
                          <span className="truncate text-sm font-semibold text-slate-900">{p.city}</span>
                          {p.isHome && <span className="rounded bg-slate-900 px-1.5 text-[9px] font-bold uppercase tracking-wide text-white">Home</span>}
                        </span>
                        <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-slate-100">
                          <span className={`block h-full rounded-full ${p.isHome ? 'bg-slate-800' : 'bg-violet-500'}`} style={{ width: `${(p.visits / maxVisits) * 100}%` }} />
                        </span>
                        <span className="mt-1 block text-[11px] text-slate-500">Last {fmtDate(p.last)}</span>
                      </span>
                      <span className="shrink-0 text-right">
                        <span className="block text-sm font-bold tabular-nums text-slate-900">{p.visits}</span>
                        <span className="block text-[10px] text-slate-400">{p.meetings} mtg{p.meetings === 1 ? '' : 's'}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ol>
            </div>
          </section>

          {/* Selected city */}
          {sel && (
            <section className="rounded-3xl bg-white shadow-sm ring-1 ring-slate-100">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
                <div className="flex items-center gap-3">
                  <span className={`flex h-10 w-10 items-center justify-center rounded-2xl text-white ${sel.isHome ? 'bg-slate-900' : 'bg-violet-600'}`}>
                    {sel.isHome ? <Home className="h-5 w-5" /> : <MapPin className="h-5 w-5" />}
                  </span>
                  <div>
                    <h2 className="text-base font-bold text-slate-900">{sel.city}</h2>
                    <p className="text-xs text-slate-500">
                      {sel.visits} visit day{sel.visits === 1 ? '' : 's'} · {sel.meetings} meeting{sel.meetings === 1 ? '' : 's'} · first {fmtDate(sel.first)} · last {fmtDate(sel.last)}
                    </p>
                  </div>
                </div>
                <button type="button" onClick={() => setSelected(null)} className="rounded-full px-3 py-1.5 text-xs font-semibold text-slate-500 hover:bg-slate-100">Close</button>
              </div>
              {sel.people.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5 border-b border-slate-100 px-5 py-3">
                  <Users className="h-3.5 w-3.5 text-slate-400" />
                  <span className="text-[11px] font-semibold text-slate-500">Met most here:</span>
                  {sel.people.slice(0, 6).map((n) => (
                    <span key={n} className="rounded-full bg-violet-50 px-2.5 py-0.5 text-[11px] font-semibold text-violet-700">{n}</span>
                  ))}
                </div>
              )}
              <ul className="divide-y divide-slate-100">
                {selMeetings.map((m) => (
                  <li key={m.id}>
                    <Link href={`/meetings?open=${m.id}`} className="group flex items-center gap-4 px-5 py-3 transition-colors hover:bg-violet-50/40">
                      <span className="w-24 shrink-0 text-xs font-semibold tabular-nums text-slate-500">{fmtDate(String(m.meeting_date).slice(0, 10))}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-slate-900 group-hover:text-violet-700">{m.agenda || 'Meeting'}</span>
                        <span className="block truncate text-[11px] text-slate-500">
                          {[m.officer_name, m.location, m.meeting_time && `${String(m.meeting_time).slice(0, 5)} hrs`].filter(Boolean).join(' · ')}
                        </span>
                      </span>
                      <span className="hidden shrink-0 rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-semibold text-slate-600 sm:inline">{m.status || 'Scheduled'}</span>
                      <ArrowUpRight className="h-4 w-4 shrink-0 text-slate-300 group-hover:text-violet-500" />
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* Meetings without a place */}
          {!loading && unplaced.length > 0 && (
            <p className="flex items-start gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              {unplaced.length} meeting{unplaced.length === 1 ? ' has' : 's have'} no city or location, so {unplaced.length === 1 ? 'it isn’t' : 'they aren’t'} on the map.
              Fill in the <b>City</b> field when scheduling to include them.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function Stat({ icon, label, value, sub, tone }: { icon: ReactNode; label: string; value: string; sub: string; tone: string }) {
  const [gradient, text] = [tone.split(' ').slice(0, 2).join(' '), tone.split(' ').slice(2).join(' ')];
  return (
    <div className={`relative overflow-hidden rounded-3xl bg-gradient-to-br p-5 ${gradient}`}>
      <span aria-hidden className="pointer-events-none absolute -right-6 -top-6 h-20 w-20 rounded-full bg-white/50" />
      <div className="relative flex items-start justify-between gap-3">
        <p className="pt-1.5 text-sm font-semibold text-slate-600">{label}</p>
        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white shadow-sm ${text}`}>{icon}</span>
      </div>
      <p className="relative mt-4 truncate text-[1.6rem] font-extrabold leading-none tracking-tight text-slate-900">{value}</p>
      <p className="relative mt-2 text-xs font-medium text-slate-500">{sub}</p>
    </div>
  );
}

