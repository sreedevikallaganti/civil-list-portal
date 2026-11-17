'use client';

/* "Meeting history" in an officer's details (Officers page): every meeting with this officer — as the main
   participant or one of the others — linked to their record, or saved under their name before the directory was
   reloaded. Each meeting opens on the Meetings page. */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { CalendarClock, CalendarDays, ChevronRight, History, Link2, Loader2 } from 'lucide-react';
import pb from '@/lib/pocketbase';
import { OFFICER_COLLECTION, pbQuote, serviceOf } from '@/lib/officerDirectory';
import { idsNamedLike, officerInMeeting, searchWord, type OfficerRef } from '@/lib/officerMerge';

type Row = { m: Record<string, any>; at: Date | null; role: 'main' | 'participant'; how: 'linked' | 'by name' };

function startOf(m: Record<string, any>): Date | null {
  const iso = String(m.meeting_date || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const [y, mo, d] = iso.split('-').map(Number);
  const t = /^(\d{1,2}):(\d{2})/.exec(String(m.meeting_time || ''));
  return new Date(y, mo - 1, d, t ? Number(t[1]) : 0, t ? Number(t[2]) : 0);
}
const fmt = (d: Date) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
const DOT: Record<string, string> = { scheduled: 'bg-violet-500', completed: 'bg-emerald-500', cancelled: 'bg-rose-400', rescheduled: 'bg-amber-400' };

export default function OfficerMeetings({ officer }: { officer: { id?: string; name?: string; type?: string } }) {
  const service = serviceOf(officer.type);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!service || !officer.id || !officer.name) return;
    const me: OfficerRef = { id: officer.id, name: officer.name, service };
    let alive = true;
    (async () => {
      try {
        // candidates: linked to this record, or naming them (the longest word of the name)
        const id = pbQuote(me.id);
        const word = searchWord(me.name);
        const filter = [`officer_id = "${id}"`, `participants ~ "${id}"`,
          ...(word ? [`officer_name ~ "${pbQuote(word)}"`, `participants ~ "${pbQuote(word)}"`] : [])].join(' || ');
        const found = await pb.collection('meetings').getFullList<Record<string, any>>({
          filter, sort: '-meeting_date', requestKey: null,
          fields: 'id,agenda,meeting_date,meeting_time,status,minutes,officer_id,officer_name,officer_type,participants,location',
        });
        // a same-named person linked to ANOTHER existing officer record is someone else
        const otherIds = [...new Set(found.flatMap((m) => idsNamedLike(m, me.name)).filter((x) => x !== me.id))];
        const others = new Set<string>();
        for (let i = 0; i < otherIds.length; i += 30) {
          const f = otherIds.slice(i, i + 30).map((x) => `id = "${pbQuote(x)}"`).join(' || ');
          const res = await pb.collection(OFFICER_COLLECTION[service]).getList(1, 30, { filter: f, fields: 'id', requestKey: null });
          res.items.forEach((r) => others.add(r.id));
        }
        const out: Row[] = [];
        for (const m of found) {
          const hit = officerInMeeting(m, me, (x) => others.has(x));
          if (hit) out.push({ m, at: startOf(m), ...hit });
        }
        if (alive) setRows(out);
      } catch (e: any) {
        if (alive) setError(e?.response?.message || e?.message || 'The meetings couldn’t be loaded.');
      }
    })();
    return () => { alive = false; };
  }, [officer.id, officer.name, service]);

  if (!service || !officer.id) return null;

  const now = new Date();
  const list = rows || [];
  const past = list.filter((r) => r.at && r.at <= now && String(r.m.status).toLowerCase() !== 'cancelled');
  const next = list.filter((r) => r.at && r.at > now && !['cancelled', 'completed'].includes(String(r.m.status).toLowerCase()))
    .sort((a, b) => a.at!.getTime() - b.at!.getTime())[0];
  const byName = list.filter((r) => r.how === 'by name').length;

  return (
    <section className="rounded-2xl border border-slate-200/80 bg-white p-4">
      <div className="mb-3 flex items-center gap-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-violet-50 text-violet-600"><History className="h-3.5 w-3.5" /></span>
        <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Meeting history</p>
        {rows && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold tabular-nums text-slate-500">{list.length}</span>}
      </div>

      {error ? (
        <p className="text-xs text-rose-600">{error}</p>
      ) : !rows ? (
        <p className="flex items-center gap-2 text-xs text-slate-400"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading meetings…</p>
      ) : !list.length ? (
        <p className="text-xs text-slate-400">No meetings with this officer yet.</p>
      ) : (
        <>
          <div className="mb-3 grid grid-cols-3 gap-2">
            <Stat label="Meetings" value={String(list.length)} />
            <Stat label="Last met" value={past[0]?.at ? fmt(past[0].at) : '—'} />
            <Stat label="Next" value={next?.at ? fmt(next.at) : '—'} />
          </div>
          {byName > 0 && (
            <p className="mb-2 flex items-start gap-1.5 rounded-lg bg-sky-50 px-2.5 py-1.5 text-[11px] text-sky-800">
              <Link2 className="mt-0.5 h-3 w-3 shrink-0" />
              {byName} {byName === 1 ? 'meeting was' : 'meetings were'} saved under this name without a link to this record.
            </p>
          )}
          <ol className="relative space-y-1 border-l border-slate-100 pl-4">
            {list.map(({ m, at, role, how }) => {
              const status = String(m.status || 'Scheduled').toLowerCase();
              return (
                <li key={m.id} className="relative">
                  <span className={`absolute -left-[21px] top-3 h-2.5 w-2.5 rounded-full ring-4 ring-white ${DOT[status] || 'bg-slate-300'}`} />
                  <Link href={`/meetings?open=${encodeURIComponent(m.id)}`} className="group flex items-center gap-3 rounded-xl px-2 py-2 hover:bg-slate-50">
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5">
                        <span className="truncate text-sm font-semibold text-slate-800 group-hover:text-violet-700">{m.agenda || 'Meeting'}</span>
                        {String(m.minutes || '').trim() && <span className="shrink-0 rounded-full bg-violet-50 px-1.5 py-0.5 text-[9px] font-bold text-violet-700">MoM</span>}
                      </span>
                      <span className="flex flex-wrap items-center gap-1 text-[11px] text-slate-400">
                        {at && at > now ? <CalendarClock className="h-3 w-3" /> : <CalendarDays className="h-3 w-3" />}
                        {at ? fmt(at) : '—'} · <span className="capitalize">{status}</span>
                        · {role === 'main' ? 'main participant' : `with ${m.officer_name || 'others'}`}
                        {how === 'by name' && <span className="rounded bg-sky-50 px-1 text-sky-700">by name</span>}
                      </span>
                    </span>
                    <ChevronRight className="h-4 w-4 text-slate-300 group-hover:text-violet-500" />
                  </Link>
                </li>
              );
            })}
          </ol>
        </>
      )}
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-slate-50 px-2.5 py-2 ring-1 ring-slate-100">
      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{label}</p>
      <p className="truncate text-sm font-bold text-slate-900">{value}</p>
    </div>
  );
}
