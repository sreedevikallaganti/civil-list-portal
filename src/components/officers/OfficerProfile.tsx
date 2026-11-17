'use client';

/* An officer's profile — the same everywhere it is shown (Officers directory panel and a meeting participant's
   history): Occasions (birthday, work anniversary, retirement) and every filled-in detail of their record. */

import Link from 'next/link';
import { Award, Cake, Sunset } from 'lucide-react';
import { personMilestones, type Milestone } from '@/lib/occasions';

/** Fields left out of the details grid (system fields, and aliases added for older screens). */
const HIDDEN_DETAIL_FIELDS = new Set([
  'id', 'type', 'collectionId', 'collectionName', 'expand', 'created', 'updated',
  'batch_year', 'current_position', 'state',
]);

export const formatLabel = (key: string) => key.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase());

export function formatValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return 'N/A';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (Array.isArray(value)) return value.length ? value.join(', ') : 'N/A';
  if (typeof value === 'object') return JSON.stringify(value, null, 2);
  return String(value);
}

/** The record's fields worth showing, in record order. */
export function detailFieldsOf(officer: Record<string, unknown>): string[] {
  return Object.keys(officer).filter((key) => {
    if (HIDDEN_DETAIL_FIELDS.has(key)) return false;
    const v = officer[key];
    if (typeof v === 'object' && v !== null && !Array.isArray(v)) return false;
    return formatValue(v) !== 'N/A';
  });
}

const dayLabel = (iso: string) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
const inLabel = (m: Milestone) => (m.inDays === 0 ? 'today' : m.inDays === 1 ? 'tomorrow' : `in ${m.inDays} days`);

/** The officer's birthday, work anniversary and retirement — the same dates the Occasions page reminds about. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function OfficerOccasions({ officer }: { officer: any }) {
  const dob = String(officer.date_of_birth || '').slice(0, 10);
  const joined = String(officer.date_of_joining || '').slice(0, 10);
  const m = personMilestones({ dob, serviceStart: joined, kind: officer.type });
  const rows: { icon: typeof Cake; tint: string; label: string; value: string; note: string }[] = [];
  if (m.birthday) rows.push({ icon: Cake, tint: 'bg-pink-50 text-pink-600', label: 'Birthday', value: dayLabel(m.birthday.date), note: `Turns ${m.birthday.years} ${inLabel(m.birthday)}` });
  if (m.service) rows.push({ icon: Award, tint: 'bg-amber-50 text-amber-600', label: 'Work anniversary', value: dayLabel(m.service.date), note: `${m.service.years} year${m.service.years === 1 ? '' : 's'} of service ${inLabel(m.service)}` });
  if (m.retirement) rows.push({
    icon: Sunset, tint: 'bg-slate-100 text-slate-600', label: m.retired ? 'Retired' : 'Retirement', value: dayLabel(m.retirement.date),
    note: m.retired ? 'Superannuation (age 60) has passed' : `Superannuation ${inLabel(m.retirement)}`,
  });
  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white p-4">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Occasions</p>
        <Link href="/occasions" className="text-[11px] font-semibold text-violet-600 hover:underline">Open Occasions</Link>
      </div>
      {rows.length === 0 ? (
        <p className="text-xs text-slate-500">Add a date of birth to get birthday and retirement reminders.</p>
      ) : (
        <ul className="space-y-2">
          {rows.map(({ icon: Icon, tint, label, value, note }) => (
            <li key={label} className="flex items-center gap-3">
              <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${tint}`}><Icon className="h-4 w-4" /></span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-slate-900">{label} · {value}</span>
                <span className="block text-[11px] text-slate-500">{note}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
      {!joined && !m.retired && (
        <p className="mt-2 text-[11px] text-slate-400">No date of joining yet — add it (Edit) to get work-anniversary reminders.</p>
      )}
    </div>
  );
}

/** Every filled-in field of the record, as cards. */
export function OfficerDetailsGrid({ officer }: { officer: Record<string, unknown> }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      {detailFieldsOf(officer).map((key) => (
        <div key={key} className={`rounded-2xl border border-slate-200/80 bg-white p-4 ${formatValue(officer[key]).length > 24 ? 'col-span-2' : ''}`}>
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{formatLabel(key)}</p>
          <p className="mt-1.5 break-words text-sm font-semibold text-slate-900">{formatValue(officer[key])}</p>
        </div>
      ))}
    </div>
  );
}
