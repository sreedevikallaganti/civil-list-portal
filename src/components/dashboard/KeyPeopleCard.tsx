'use client';

/* KeyPeopleCard — officers starred as "key people" (star on their profile in the Officers
   directory) whom the MD hasn't met for DUE_DAYS or more and who have nothing booked.
   One click on "Schedule" opens the New Meeting form pre-filled with that officer. */

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Star, UserPlus, ChevronDown } from 'lucide-react';
import { isEmployeeRef, refsOf, useKeyPeople } from '@/lib/keyPeople';
import { useNow } from '@/lib/useNow';

const DUE_DAYS = 90;
const SHOW = 4;
const DAY = 86_400_000;

type Row = { ref: string; name: string; role: string; lastMet: Date | null; next: Date | null };

const dateOf = (m: any) => {
  const d = String(m?.meeting_date || '').slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(d) ? new Date(`${d}T00:00:00`) : null;
};
const isOff = (m: any) => /cancel|reject/i.test(String(m?.status_flag || m?.status || ''));

const short = (d: Date) => d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

export default function KeyPeopleCard({ meetings, loading, delay = 0 }: { meetings: any[]; loading?: boolean; delay?: number }) {
  const { people, error } = useKeyPeople();
  const [showAll, setShowAll] = useState(false);
  const now = useNow(); // ticks every minute

  const rows = useMemo<Row[]>(() => {
    if (!people?.length) return [];
    const today = new Date(now); today.setHours(0, 0, 0, 0);
    const last = new Map<string, Date>();
    const next = new Map<string, Date>();
    for (const m of meetings) {
      const d = dateOf(m);
      if (!d || isOff(m)) continue;
      for (const ref of refsOf(m)) {
        if (d <= today) { if (!last.has(ref) || last.get(ref)! < d) last.set(ref, d); }
        else if (!next.has(ref) || next.get(ref)! > d) next.set(ref, d);
      }
    }
    return people.map((p) => ({ ref: p.ref, name: p.name, role: p.role || '', lastMet: last.get(p.ref) ?? null, next: next.get(p.ref) ?? null }));
  }, [people, meetings, now]);

  const due = rows
    .filter((r) => !r.next && (!r.lastMet || now - +r.lastMet >= DUE_DAYS * DAY))
    .sort((a, b) => (a.lastMet ? +a.lastMet : 0) - (b.lastMet ? +b.lastMet : 0)); // never met / longest ago first
  const fine = rows.length - due.length;
  const list = showAll ? due : due.slice(0, SHOW);

  return (
    <section className="anim-fade-up rounded-3xl border border-violet-100 bg-white p-5 shadow-sm" style={{ animationDelay: `${delay}ms` }}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-slate-900">Key people to stay in touch with</h2>
          <p className="mt-0.5 text-xs text-slate-500">Starred officers and employees not met in {DUE_DAYS}+ days</p>
        </div>
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-50 text-amber-500"><Star className="h-4 w-4 fill-current" /></span>
      </div>

      <div className="mt-4">
        {loading || people === null ? (
          <div className="h-20 animate-pulse rounded-2xl bg-slate-100" />
        ) : error ? (
          <p className="rounded-2xl border border-dashed border-rose-200 bg-rose-50/40 px-4 py-5 text-center text-xs text-rose-600">
            Couldn’t load the key people list. Please refresh the page.
          </p>
        ) : people.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-amber-200 bg-amber-50/40 px-4 py-5 text-center text-xs leading-relaxed text-slate-500">
            No key people yet. Open an officer in the{' '}
            <Link href="/officers" className="font-semibold text-violet-600 hover:underline">Officers directory</Link>{' '}
            and click <b>Mark as key person</b>.
          </p>
        ) : due.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-emerald-200 bg-emerald-50/40 px-4 py-5 text-center text-xs text-slate-600">
            All {people.length} key {people.length === 1 ? 'person was' : 'people were'} met in the last {DUE_DAYS} days or have a meeting booked.
          </p>
        ) : (
          <>
            <ul className={`space-y-1.5 ${showAll ? 'max-h-80 overflow-y-auto pr-1' : ''}`}>
              {list.map((r) => (
                <li key={r.ref} className="flex items-center gap-2.5 rounded-xl bg-white px-3 py-2 ring-1 ring-slate-100">
                  <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-500">{isEmployeeRef(r.ref) ? 'EMP' : r.ref.split(':')[0]}</span>
                  <Link href={isEmployeeRef(r.ref) ? `/employees?open=${encodeURIComponent(r.ref.slice(9))}` : `/officers?open=${encodeURIComponent(r.ref)}`} className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-slate-800 hover:text-violet-700">{r.name}</span>
                    <span className="block truncate text-[11px] text-slate-500">
                      {r.lastMet ? `Last met ${short(r.lastMet)} · ${Math.floor((now - +r.lastMet) / DAY)} days ago` : 'Not met yet'}
                      {r.role ? ` · ${r.role}` : ''}
                    </span>
                  </Link>
                  <Link href={`/meetings?person=${encodeURIComponent(r.ref)}`} aria-label={`Schedule a meeting with ${r.name}`}
                    className="inline-flex shrink-0 items-center gap-1 rounded-full bg-slate-900 px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-slate-800">
                    <UserPlus className="h-3.5 w-3.5" /><span className="hidden sm:inline">Schedule</span>
                  </Link>
                </li>
              ))}
            </ul>
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-400">
              {due.length > SHOW ? (
                <button type="button" onClick={() => setShowAll((v) => !v)} className="inline-flex items-center gap-1 font-semibold text-violet-600 hover:underline">
                  {showAll ? 'Show fewer' : `Show ${due.length - SHOW} more`}
                  <ChevronDown className={`h-3.5 w-3.5 transition-transform ${showAll ? 'rotate-180' : ''}`} />
                </button>
              ) : <span />}
              {fine > 0 && <span>{fine} other{fine === 1 ? '' : 's'} met recently or booked</span>}
            </div>
          </>
        )}
      </div>
    </section>
  );
}
