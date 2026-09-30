'use client';

// TimeReport — where meeting hours go: hours by department for a chosen period,
// and a month-by-month table with cancellation and reschedule rates.
// Hours count meetings that weren't cancelled or rejected.

import { useMemo, useState } from 'react';
import { Building2, CalendarRange, Clock } from 'lucide-react';
import { cx, type RecordItem } from '@/lib/reports-utils';

type Period = 'month' | 'quarter' | 'year';
const PERIODS: { key: Period; label: string }[] = [
  { key: 'month', label: 'This month' },
  { key: 'quarter', label: 'Last 3 months' },
  { key: 'year', label: 'This year' },
];

const dayOf = (m: RecordItem) => {
  const s = String(m.meeting_date || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const [y, mo, d] = s.split('-').map(Number);
  return new Date(y, mo - 1, d);
};
const statusOf = (m: RecordItem) => String(m.status || '').toLowerCase();
const isOff = (m: RecordItem) => /cancel|reject/.test(statusOf(m));
const minutesOf = (m: RecordItem) => Math.max(0, parseInt(m.duration) || 0);
const hrs = (min: number) => (min / 60).toFixed(min % 60 === 0 ? 0 : 1);
const pct = (n: number, d: number) => (d ? `${Math.round((n / d) * 100)}%` : '—');

/** department, or a readable fallback for meetings that don't have one */
function groupOf(m: RecordItem) {
  const dept = String(m.department || '').trim();
  if (dept) return dept;
  const t = String(m.officer_type || '').toUpperCase();
  if (String(m.meeting_type || '').toLowerCase() === 'internal') return 'Internal (no department)';
  if (t.includes('IAS')) return 'IAS officers (no department)';
  if (t.includes('IPS')) return 'IPS officers (no department)';
  return 'Other contacts (no department)';
}

export default function TimeReport({ meetings }: { meetings: RecordItem[] }) {
  const [period, setPeriod] = useState<Period>('quarter');

  const byDept = useMemo(() => {
    const now = new Date();
    const from = period === 'month' ? new Date(now.getFullYear(), now.getMonth(), 1)
      : period === 'quarter' ? new Date(now.getFullYear(), now.getMonth() - 2, 1)
      : new Date(now.getFullYear(), 0, 1);
    const to = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const acc = new Map<string, { minutes: number; count: number }>();
    for (const m of meetings) {
      const d = dayOf(m);
      if (!d || d < from || d >= to || isOff(m)) continue;
      const g = groupOf(m);
      const row = acc.get(g) ?? { minutes: 0, count: 0 };
      row.minutes += minutesOf(m);
      row.count += 1;
      acc.set(g, row);
    }
    return [...acc.entries()].map(([name, v]) => ({ name, ...v })).sort((a, b) => b.minutes - a.minutes);
  }, [meetings, period]);

  const months = useMemo(() => {
    const now = new Date();
    return Array.from({ length: 6 }, (_, i) => {
      const start = new Date(now.getFullYear(), now.getMonth() - 5 + i, 1);
      const end = new Date(start.getFullYear(), start.getMonth() + 1, 1);
      const inMonth = meetings.filter((m) => { const d = dayOf(m); return d && d >= start && d < end; });
      const held = inMonth.filter((m) => !isOff(m));
      return {
        label: start.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' }),
        total: inMonth.length,
        minutes: held.reduce((s, m) => s + minutesOf(m), 0),
        cancelled: inMonth.filter((m) => statusOf(m).includes('cancel')).length,
        rescheduled: inMonth.filter((m) => statusOf(m).includes('reschedul')).length,
      };
    });
  }, [meetings]);

  const totalMin = byDept.reduce((s, r) => s + r.minutes, 0);
  const maxMin = Math.max(1, ...byDept.map((r) => r.minutes));

  return (
    <div className="grid grid-cols-1 gap-5 xl:grid-cols-5">
      {/* Hours by department */}
      <section className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-100 xl:col-span-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-base font-bold text-slate-900"><Building2 className="h-4 w-4 text-violet-600" /> Hours by department</h2>
            <p className="mt-0.5 text-xs text-slate-500">{hrs(totalMin)} h across {byDept.reduce((s, r) => s + r.count, 0)} meetings · cancelled meetings excluded</p>
          </div>
          <div className="inline-flex rounded-full bg-slate-100 p-1">
            {PERIODS.map((p) => (
              <button key={p.key} onClick={() => setPeriod(p.key)}
                className={cx('rounded-full px-3 py-1.5 text-xs font-semibold transition', period === p.key ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700')}>
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {byDept.length === 0 ? (
          <p className="mt-6 rounded-2xl border border-dashed border-slate-200 px-4 py-8 text-center text-sm text-slate-400">No meetings in this period.</p>
        ) : (
          <ul className="mt-5 space-y-3" aria-label="Hours by department">
            {byDept.map((r) => (
              <li key={r.name} className="group" title={`${r.name}: ${hrs(r.minutes)} h in ${r.count} meeting${r.count === 1 ? '' : 's'} (${pct(r.minutes, totalMin)} of the time)`}>
                <div className="mb-1 flex items-baseline justify-between gap-3 text-[12.5px]">
                  <span className="truncate font-medium text-slate-700">{r.name}</span>
                  <span className="shrink-0 tabular-nums text-slate-500">
                    <b className="text-slate-800">{hrs(r.minutes)} h</b> · {r.count} mtg · {pct(r.minutes, totalMin)}
                  </span>
                </div>
                <div className="h-2.5 w-full rounded-full bg-slate-100">
                  <div className="h-full rounded-full bg-violet-500 transition-[width] duration-500 group-hover:bg-violet-600"
                    style={{ width: `${Math.max(2, (r.minutes / maxMin) * 100)}%` }} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Month by month */}
      <section className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-100 xl:col-span-2">
        <h2 className="flex items-center gap-2 text-base font-bold text-slate-900"><CalendarRange className="h-4 w-4 text-violet-600" /> Last 6 months</h2>
        <p className="mt-0.5 text-xs text-slate-500">Hours held, and how often plans changed</p>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-[12.5px]">
            <thead>
              <tr className="border-b border-slate-100 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                <th className="py-2 pr-3">Month</th>
                <th className="py-2 pr-3 text-right">Meetings</th>
                <th className="py-2 pr-3 text-right"><Clock className="inline h-3 w-3" /> Hours</th>
                <th className="py-2 pr-3 text-right">Cancelled</th>
                <th className="py-2 text-right">Rescheduled</th>
              </tr>
            </thead>
            <tbody>
              {months.map((mo) => (
                <tr key={mo.label} className="border-b border-slate-50 last:border-0">
                  <td className="py-2 pr-3 font-medium text-slate-700">{mo.label}</td>
                  <td className="py-2 pr-3 text-right tabular-nums text-slate-600">{mo.total}</td>
                  <td className="py-2 pr-3 text-right tabular-nums font-semibold text-slate-800">{hrs(mo.minutes)}</td>
                  <td className="py-2 pr-3 text-right tabular-nums text-slate-600">{mo.cancelled} <span className="text-slate-400">({pct(mo.cancelled, mo.total)})</span></td>
                  <td className="py-2 text-right tabular-nums text-slate-600">{mo.rescheduled} <span className="text-slate-400">({pct(mo.rescheduled, mo.total)})</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
