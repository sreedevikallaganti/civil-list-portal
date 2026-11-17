'use client';

/* ================================================================
   BatchmatesCard — other IAS / IPS officers of the same batch year as
   the meeting's officer, so the MD can meet them too.

   mode "details" (meeting details panel):
     • Schedule — a New Meeting with that batchmate
     • tick several → "Plan batch meet" — ONE meeting with all of them,
       online (video link) or offline (venue), via /meetings?batch=…
   mode "form" (New Meeting form):
     • Add — adds the batchmate to this meeting's participants

   Order: posted where the meeting is → met before → A–Z.
   Rules live in lib/batchmates.ts, queries in lib/batchmatesData.ts.
================================================================ */

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  GraduationCap, ChevronDown, Loader2, Search, CalendarPlus, Plus, Check, Video, MapPin, Users,
} from 'lucide-react';
import {
  filterBatchmates, meetingPlaceCity, meetingPlaceState, metIndex, normBatch, rankBatchmates, statesOf,
  type BatchFilter, type BatchOfficer, type BatchmateRow, type MetInfo, type Service,
} from '@/lib/batchmates';
import { batchMeetHref, loadBatchOfficers, loadMeetingsForHistory, scheduleOneHref } from '@/lib/batchmatesData';
import type { Participant } from '@/lib/participants';
import { cityLabel } from '@/lib/cities';
import { serviceOf } from '@/lib/officerDirectory';

/* meetings are shared by every card on the page — read once a minute at most */
let meetingsCache: { at: number; rows: Promise<any[]> } | null = null;
function cachedMeetings(): Promise<any[]> {
  if (!meetingsCache || Date.now() - meetingsCache.at > 60_000) {
    meetingsCache = { at: Date.now(), rows: loadMeetingsForHistory().catch(() => []) };
  }
  return meetingsCache.rows;
}

const SERVICE_CHIP: Record<Service, string> = {
  IAS: 'bg-sky-50 text-sky-700 ring-sky-500/20',
  IPS: 'bg-violet-50 text-violet-700 ring-violet-500/20',
  IFS: 'bg-emerald-50 text-emerald-700 ring-emerald-500/20',
  IRS: 'bg-rose-50 text-rose-700 ring-rose-500/20',
};

const fmtDay = (iso: string) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

function MetBadge({ met }: { met: MetInfo }) {
  if (met.next) {
    return <span className="shrink-0 rounded-full bg-violet-50 px-2 py-0.5 text-[10px] font-bold text-violet-700">Booked · {fmtDay(met.next)}</span>;
  }
  if (met.count > 0) {
    return (
      <span className="shrink-0 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700"
        title={`Met ${met.count} time${met.count === 1 ? '' : 's'}`}>
        Met · {fmtDay(met.last)}
      </span>
    );
  }
  return <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500">Never met</span>;
}

export default function BatchmatesCard({
  officer, place, exclude = [], mode = 'details', onAdd, addedIds = [], date,
}: {
  /* the meeting's main officer */
  officer: { id?: string; name?: string; type?: string; batch_year?: unknown };
  /* where the meeting is (city / location / address text) */
  place?: { city?: string; location?: string; address?: string };
  /* people already in the meeting — not suggested again */
  exclude?: Participant[];
  mode?: 'details' | 'form';
  /* form mode: add a batchmate to the meeting being created */
  onAdd?: (o: BatchOfficer) => void;
  addedIds?: string[];
  /* date to pre-fill when scheduling from here */
  date?: string;
}) {
  const batch = normBatch(officer.batch_year);
  const service: Service | null = serviceOf(officer.type);

  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [officers, setOfficers] = useState<BatchOfficer[]>([]);
  const [meetings, setMeetings] = useState<any[]>([]);
  const [filter, setFilter] = useState<BatchFilter>({ service: service || 'all', state: '', metOnly: false, q: '' });
  const [picked, setPicked] = useState<string[]>([]);
  const [meetMode, setMeetMode] = useState<'online' | 'offline'>('online');

  useEffect(() => {
    if (!batch || !service) return;
    let live = true;
    setLoading(true);
    setFilter((f) => ({ ...f, service }));
    setPicked([]);
    Promise.all([loadBatchOfficers(batch), cachedMeetings()])
      .then(([o, m]) => { if (live) { setOfficers(o); setMeetings(m); } })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [batch, service]);

  const placeState = meetingPlaceState(place || {});
  const placeCity = meetingPlaceCity(place || {});
  const placeName = placeCity ? cityLabel(placeCity, place?.city || '') : placeState;

  const rows = useMemo(() => rankBatchmates(officers, {
    exclude: [...exclude, { id: officer.id, name: officer.name || '' }],
    placeState, placeCity, index: metIndex(meetings),
  }), [officers, meetings, exclude, officer.id, officer.name, placeState, placeCity]);

  const shown = useMemo(() => filterBatchmates(rows, filter), [rows, filter]);
  const states = useMemo(() => statesOf(rows), [rows]);
  const sameService = rows.filter((r) => r.service === service).length;
  const metCount = rows.filter((r) => r.met.count > 0).length;

  if (!batch || !service) return null;

  const pickedRows = rows.filter((r) => picked.includes(`${r.service}:${r.id}`));
  const togglePick = (r: BatchmateRow) => {
    const k = `${r.service}:${r.id}`;
    setPicked((p) => (p.includes(k) ? p.filter((x) => x !== k) : [...p, k]));
  };

  const count = filter.service === 'all' ? rows.length : sameService;

  return (
    <div className="col-span-2 rounded-2xl border border-slate-200/80 bg-white p-4 transition-all duration-200 hover:border-slate-300 hover:shadow-md hover:shadow-slate-900/[0.04]">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open}
        className="flex w-full items-center gap-2 text-left">
        <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">
          <GraduationCap className="h-3.5 w-3.5" />
        </span>
        <p className="flex-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
          Batchmates · {batch} batch {loading ? '' : `(${count})`}
        </p>
        {loading && <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-400" />}
        <ChevronDown className={`h-4 w-4 text-slate-400 transition-transform duration-300 ${open ? 'rotate-180' : ''}`} />
      </button>

      {!open && !loading && (
        <p className="mt-2 text-xs text-slate-500">
          {count === 0 ? `No other ${filter.service === 'all' ? '' : `${service} `}officers of the ${batch} batch in your directory.`
            : <>
                {count} other {filter.service === 'all' ? 'IAS / IPS / IFS / IRS' : service} officer{count === 1 ? '' : 's'} of the {batch} batch
                {metCount > 0 && <> · <b className="text-emerald-700">{metCount} met before</b></>}
                {placeName && rows.some((r) => r.samePlace) && <> · {rows.filter((r) => r.samePlace).length} in {placeName}</>}
              </>}
        </p>
      )}

      {open && (
        <div className="mt-3 space-y-3">
          {/* filters */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded-full bg-slate-100 p-0.5 text-[11px] font-semibold">
              {([[service, `${service} only`], ['all', 'All services']] as const).map(([v, label]) => (
                <button key={v} type="button" onClick={() => setFilter((f) => ({ ...f, service: v }))}
                  className={`rounded-full px-2.5 py-1 transition ${filter.service === v ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                  {label}
                </button>
              ))}
            </div>
            {states.length > 1 && (
              <select value={filter.state} onChange={(e) => setFilter((f) => ({ ...f, state: e.target.value }))}
                aria-label="State or cadre"
                className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-600 outline-none focus:border-violet-400">
                <option value="">All states</option>
                {states.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            )}
            <label className="inline-flex cursor-pointer items-center gap-1.5 text-[11px] font-semibold text-slate-600">
              <input type="checkbox" checked={filter.metOnly} onChange={(e) => setFilter((f) => ({ ...f, metOnly: e.target.checked }))}
                className="h-3.5 w-3.5 accent-violet-600" />
              Met before
            </label>
            <div className="relative min-w-[140px] flex-1">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <input value={filter.q} onChange={(e) => setFilter((f) => ({ ...f, q: e.target.value }))}
                placeholder="Search name, post, cadre…"
                className="w-full rounded-full border border-slate-200 bg-slate-50/80 py-1 pl-8 pr-3 text-[12px] text-slate-700 outline-none focus:border-violet-400 focus:bg-white" />
            </div>
          </div>

          {/* list */}
          {loading ? (
            <div className="flex items-center gap-2 py-4 text-xs text-slate-400"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading the {batch} batch…</div>
          ) : shown.length === 0 ? (
            <p className="rounded-xl bg-slate-50 px-3 py-4 text-center text-xs text-slate-400">
              {rows.length ? 'Nobody matches these filters.' : `No other officers of the ${batch} batch in your directory.`}
            </p>
          ) : (
            <ul className="nice-scroll max-h-72 space-y-1.5 overflow-y-auto pr-1">
              {shown.map((r) => {
                const key = `${r.service}:${r.id}`;
                const added = addedIds.includes(r.id);
                return (
                  <li key={key} className="flex items-center gap-2.5 rounded-xl bg-slate-50/70 px-2.5 py-2 ring-1 ring-slate-100">
                    {mode === 'details' && (
                      <input type="checkbox" checked={picked.includes(key)} onChange={() => togglePick(r)}
                        aria-label={`Pick ${r.name} for a batch meet`} className="h-3.5 w-3.5 shrink-0 accent-violet-600" />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <p className="truncate text-[13px] font-semibold text-slate-800">{r.name}</p>
                        <span className={`rounded-full px-1.5 py-0.5 text-[9.5px] font-bold ring-1 ring-inset ${SERVICE_CHIP[r.service]}`}>{r.service}</span>
                        {r.samePlace && placeName && (
                          <span className="inline-flex items-center gap-0.5 rounded-full bg-amber-50 px-1.5 py-0.5 text-[9.5px] font-bold text-amber-700">
                            <MapPin className="h-2.5 w-2.5" /> {placeName}
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 truncate text-[11px] text-slate-500" title={[r.position, r.cadre].filter(Boolean).join(' · ')}>
                        {[r.position, r.cadre && `${r.cadre} cadre`].filter(Boolean).join(' · ') || '—'}
                      </p>
                    </div>
                    <MetBadge met={r.met} />
                    {mode === 'form' ? (
                      <button type="button" disabled={added} onClick={() => onAdd?.(r)}
                        className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold transition ${
                          added ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-900 text-white hover:bg-slate-800'}`}>
                        {added ? <><Check className="h-3 w-3" /> Added</> : <><Plus className="h-3 w-3" /> Add</>}
                      </button>
                    ) : (
                      <Link href={scheduleOneHref(r, { city: place?.city, date })} title={`New meeting with ${r.name}`}
                        className="inline-flex shrink-0 items-center gap-1 rounded-full bg-slate-900 px-2.5 py-1 text-[11px] font-semibold text-white transition hover:bg-slate-800">
                        <CalendarPlus className="h-3 w-3" /> Schedule
                      </Link>
                    )}
                  </li>
                );
              })}
            </ul>
          )}

          {/* batch meet — one meeting with everyone picked */}
          {mode === 'details' && pickedRows.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 rounded-xl bg-indigo-50/70 px-3 py-2.5 ring-1 ring-indigo-100">
              <Users className="h-4 w-4 text-indigo-600" />
              <p className="text-[12px] font-semibold text-indigo-900">{pickedRows.length} picked for a {batch} batch meet</p>
              <div className="ml-auto inline-flex rounded-full bg-white p-0.5 text-[11px] font-semibold ring-1 ring-indigo-100">
                {(['online', 'offline'] as const).map((m) => (
                  <button key={m} type="button" onClick={() => setMeetMode(m)}
                    className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 transition ${meetMode === m ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:text-slate-700'}`}>
                    {m === 'online' ? <Video className="h-3 w-3" /> : <MapPin className="h-3 w-3" />}
                    {m === 'online' ? 'Online' : 'In person'}
                  </button>
                ))}
              </div>
              <Link href={batchMeetHref(pickedRows, { batch, mode: meetMode, city: meetMode === 'offline' ? place?.city : undefined })}
                className="inline-flex items-center gap-1 rounded-full bg-slate-900 px-3 py-1.5 text-[11.5px] font-semibold text-white transition hover:bg-slate-800">
                <CalendarPlus className="h-3.5 w-3.5" /> Plan batch meet
              </Link>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
