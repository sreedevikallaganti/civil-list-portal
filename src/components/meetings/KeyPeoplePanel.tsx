'use client';

/* "Key persons" — every starred officer (star on their profile in the Officers directory), with when they were
   last met and their next meeting. Opened from the Meetings page and the Officers directory header.
     Meetings page:  "Meetings & details" opens the participant history (occasions, meetings, details)
     Officers page:  "Open profile" opens their record (occasions, meeting history, details) */

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { CalendarClock, History, Search, Star, UserPlus, UserRound, X } from 'lucide-react';
import pb from '@/lib/pocketbase';
import { isEmployeeRef, refsOf, useKeyPeople } from '@/lib/keyPeople';
import type { Participant } from '@/lib/participants';
import { useNow } from '@/lib/useNow';

const DAY = 86_400_000;
const DUE_DAYS = 90;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Meeting = Record<string, any>;
const dateOf = (m: Meeting) => {
  const d = String(m?.meeting_date || '').slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(d) ? new Date(`${d}T00:00:00`) : null;
};
const isOff = (m: Meeting) => /cancel|reject/i.test(String(m?.status_flag || m?.status || ''));
const short = (d: Date) => d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

export function useKeyPeopleCount() {
  return useKeyPeople().people?.length ?? 0;
}

/** The meetings, when the page hasn't loaded them itself (Officers directory). */
function useMeetings(given?: Meeting[]) {
  const [loaded, setLoaded] = useState<Meeting[] | null>(null);
  useEffect(() => {
    if (given) return;
    let alive = true;
    pb.collection('meetings').getFullList<Meeting>({
      batch: 1000, requestKey: null, fields: 'id,meeting_date,status,status_flag,officer_id,officer_type,participants',
    }).then((l) => alive && setLoaded(l), () => alive && setLoaded([]));
    return () => { alive = false; };
  }, [given]);
  return given ?? loaded;
}

export default function KeyPeoplePanel({ meetings: given, editable, onClose, onHistory, onOpenOfficer, onOpenEmployee }: {
  meetings?: Meeting[];
  editable: boolean;
  onClose: () => void;
  /** Meetings page: open the participant history */
  onHistory?: (person: Participant) => void;
  /** Officers page: open the officer's record here (elsewhere: a link to the Officers page) */
  onOpenOfficer?: (ref: string) => void;
  /** Employees page: open the employee here (elsewhere: a link to the Employees page) */
  onOpenEmployee?: (id: string) => void;
}) {
  const { people, error, toggle } = useKeyPeople();
  const meetings = useMeetings(given);
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<'due' | 'name'>('due');
  const now = useNow(); // ticks every minute

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  const rows = useMemo(() => {
    const today = new Date(now); today.setHours(0, 0, 0, 0);
    const last = new Map<string, Date>();
    const next = new Map<string, Date>();
    const count = new Map<string, number>();
    for (const m of meetings || []) {
      const d = dateOf(m);
      if (!d || isOff(m)) continue;
      for (const ref of new Set(refsOf(m))) {
        count.set(ref, (count.get(ref) || 0) + 1);
        if (d <= today) { if (!last.has(ref) || last.get(ref)! < d) last.set(ref, d); }
        else if (!next.has(ref) || next.get(ref)! > d) next.set(ref, d);
      }
    }
    return (people || []).map((p) => ({
      ...p, lastMet: last.get(p.ref) ?? null, next: next.get(p.ref) ?? null, meetings: count.get(p.ref) || 0,
    }));
  }, [people, meetings, now]);

  const isDue = (r: (typeof rows)[number]) => !r.next && (!r.lastMet || now - +r.lastMet >= DUE_DAYS * DAY);
  const q = query.trim().toLowerCase();
  const shown = rows
    .filter((r) => !q || `${r.name} ${r.role || ''} ${r.ref}`.toLowerCase().includes(q))
    .sort((a, b) => sort === 'name'
      ? a.name.localeCompare(b.name)
      : Number(isDue(b)) - Number(isDue(a)) || (a.lastMet ? +a.lastMet : 0) - (b.lastMet ? +b.lastMet : 0));
  const due = rows.filter(isDue).length;
  const ready = people !== null && meetings !== null;
  const chip = 'inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-semibold text-slate-600 hover:bg-slate-50';

  return (
    <div className="fixed inset-0 z-[55]">
      <div className="anim-overlay off-overlay absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose} />
      <aside role="dialog" aria-modal="true" aria-labelledby="key-people-title"
        className="anim-panel off-panel nice-scroll absolute right-0 top-0 flex h-full w-full flex-col overflow-y-auto bg-white shadow-2xl sm:max-w-xl lg:max-w-2xl">
        <div className="h-1.5 w-full bg-gradient-to-r from-violet-500 via-indigo-500 to-sky-500" />

        <div className="border-b border-slate-100 px-5 py-4">
          <div className="flex items-start gap-3">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-slate-100 text-slate-600"><Star className="h-5 w-5" /></span>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Starred officers and employees</p>
              <h2 id="key-people-title" className="text-lg font-bold text-slate-900">Key persons</h2>
              <p className="text-xs text-slate-500">
                {!ready ? 'Loading…' : `${rows.length} ${rows.length === 1 ? 'person' : 'people'}${due ? ` · ${due} not met in ${DUE_DAYS}+ days` : ''}`}
              </p>
            </div>
            <button onClick={onClose} aria-label="Close"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-slate-200 text-slate-400 transition hover:bg-slate-50 hover:text-slate-700">
              <X className="h-4 w-4" />
            </button>
          </div>

          {rows.length > 0 && (
            <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
              <label className="relative flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <span className="sr-only">Search key persons</span>
                <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search key persons…"
                  className="w-full rounded-full border border-slate-200 py-2 pl-9 pr-3 text-sm outline-none focus:border-violet-300 focus:ring-4 focus:ring-violet-100" />
              </label>
              <div className="flex gap-1.5" role="radiogroup" aria-label="Sort">
                {([['due', 'Longest not met'], ['name', 'A–Z']] as const).map(([k, l]) => (
                  <button key={k} type="button" role="radio" aria-checked={sort === k} onClick={() => setSort(k)}
                    className={`rounded-full px-3 py-1.5 text-xs font-semibold ${sort === k ? 'bg-slate-900 text-white' : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50'}`}>{l}</button>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="flex-1 bg-slate-50/60 px-5 py-4">
          {!ready ? (
            <div className="space-y-2">{[0, 1, 2].map((i) => <div key={i} className="h-16 animate-pulse rounded-2xl bg-slate-100" />)}</div>
          ) : error ? (
            <p className="rounded-2xl border border-dashed border-rose-200 bg-rose-50/40 px-4 py-6 text-center text-sm text-rose-600">Couldn’t load the key persons. Please refresh the page.</p>
          ) : !rows.length ? (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-4 py-8 text-center text-sm text-slate-600">
              <p className="font-semibold text-slate-800">No key persons yet</p>
              <p className="mt-1">Click the ☆ next to an officer in the <Link href="/officers" className="font-semibold text-violet-600 hover:underline">Officers directory</Link> or an employee in <Link href="/employees" className="font-semibold text-violet-600 hover:underline">Employees</Link>.</p>
            </div>
          ) : !shown.length ? (
            <p className="py-10 text-center text-sm text-slate-400">No key person matches “{query}”.</p>
          ) : (
            <ul className="space-y-2">
              {shown.map((r) => {
                const [service, id] = r.ref.split(':');
                const employee = isEmployeeRef(r.ref);
                const overdue = isDue(r);
                return (
                  <li key={r.ref} className="rounded-2xl bg-white p-3.5 ring-1 ring-slate-200/80">
                    <div className="flex items-start gap-3">
                      <span className="mt-0.5 rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-600">{employee ? 'EMP' : service}</span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-slate-900">{r.name}</p>
                        {r.role && <p className="truncate text-xs text-slate-500">{r.role}</p>}
                        <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-slate-500">
                          <span className={overdue ? 'font-semibold text-slate-800' : ''}>
                            {r.lastMet ? `Last met ${short(r.lastMet)} · ${Math.floor((now - +r.lastMet) / DAY)} days ago` : 'Not met yet'}
                          </span>
                          {overdue && <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600">due</span>}
                          {r.next && <span className="inline-flex items-center gap-1 text-violet-700"><CalendarClock className="h-3 w-3" /> Next {short(r.next)}</span>}
                          <span className="text-slate-400">· {r.meetings} {r.meetings === 1 ? 'meeting' : 'meetings'}</span>
                        </p>
                      </div>
                      <button type="button" onClick={() => toggle({ ref: r.ref, name: r.name, role: r.role }).catch(() => {})}
                        title="Remove from key persons" aria-label={`Remove ${r.name} from key persons`}
                        className="rounded-full p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800"><Star className="h-4 w-4 fill-current" /></button>
                    </div>
                    <div className="mt-2.5 flex flex-wrap gap-1.5 pl-10">
                      {onHistory && (
                        <button type="button" onClick={() => onHistory({ id, name: r.name, type: service })} className={chip}>
                          <History className="h-3.5 w-3.5" /> Meetings &amp; details
                        </button>
                      )}
                      {employee ? (
                        onOpenEmployee ? (
                          <button type="button" onClick={() => onOpenEmployee(id)} className={chip}><UserRound className="h-3.5 w-3.5" /> Open profile</button>
                        ) : (
                          <Link href={`/employees?open=${encodeURIComponent(id)}`} className={chip}><UserRound className="h-3.5 w-3.5" /> Employee record</Link>
                        )
                      ) : onOpenOfficer ? (
                        <button type="button" onClick={() => onOpenOfficer(r.ref)} className={chip}><UserRound className="h-3.5 w-3.5" /> Open profile</button>
                      ) : (
                        <Link href={`/officers?open=${encodeURIComponent(r.ref)}`} className={chip}><UserRound className="h-3.5 w-3.5" /> Officer record</Link>
                      )}
                      {editable && (
                        <Link href={`/meetings?person=${encodeURIComponent(r.ref)}`} onClick={onClose}
                          className="inline-flex items-center gap-1 rounded-full bg-slate-900 px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-slate-800">
                          <UserPlus className="h-3.5 w-3.5" /> Schedule
                        </Link>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </aside>
    </div>
  );
}
