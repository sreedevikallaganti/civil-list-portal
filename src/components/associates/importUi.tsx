'use client';

/* Shared pieces of the associates bulk import screens. */

import type { ReactNode } from 'react';
import { CheckCircle2, CircleDashed, FileClock, FileWarning, Loader2, Send, UploadCloud } from 'lucide-react';
import { FIELD_TYPE_LABEL, FIELD_TYPES, guessType, type AssociateField, type Cell, type ColumnMap, type ColumnTarget, type FieldType } from '@/lib/associates';
import { STATUS_LABEL, type ImportStatus } from '@/lib/associateImport';
import { inputCls } from './ui';

const STATUS_STYLE: Record<ImportStatus, { cls: string; icon: ReactNode }> = {
  uploaded: { cls: 'bg-slate-100 text-slate-600', icon: <UploadCloud className="h-3.5 w-3.5" /> },
  validating: { cls: 'bg-sky-50 text-sky-700', icon: <Loader2 className="h-3.5 w-3.5 animate-spin" /> },
  draft: { cls: 'bg-amber-50 text-amber-800', icon: <FileClock className="h-3.5 w-3.5" /> },
  ready: { cls: 'bg-violet-50 text-violet-700', icon: <CircleDashed className="h-3.5 w-3.5" /> },
  submitted: { cls: 'bg-emerald-50 text-emerald-700', icon: <CheckCircle2 className="h-3.5 w-3.5" /> },
  failed: { cls: 'bg-rose-50 text-rose-700', icon: <FileWarning className="h-3.5 w-3.5" /> },
};

export function StatusBadge({ status }: { status: ImportStatus }) {
  const s = STATUS_STYLE[status] || STATUS_STYLE.draft;
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ${s.cls}`}>
      {s.icon} {STATUS_LABEL[status] || status}
    </span>
  );
}

export const SubmitIcon = Send;

/** "12 Nov 2026, 3:40 pm" from a PocketBase date. */
export function when(v?: string) {
  if (!v) return '';
  const d = new Date(v.replace(' ', 'T'));
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export function Count({ label, value, tone, active, onClick }: {
  label: string; value: number; tone: 'slate' | 'emerald' | 'rose' | 'amber' | 'sky'; active?: boolean; onClick?: () => void;
}) {
  // the same coloured cards as the Officers directory — one colour per meaning
  const tones = {
    slate: 'from-violet-100 to-purple-100', emerald: 'from-emerald-100 to-teal-100', rose: 'from-rose-100 to-pink-100',
    amber: 'from-amber-100 to-orange-100', sky: 'from-sky-100 to-blue-100',
  };
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag
      {...(onClick && { type: 'button' as const, onClick, 'aria-pressed': !!active })}
      className={`relative overflow-hidden rounded-3xl bg-gradient-to-br p-4 text-left ring-1 transition-all duration-200 ${tones[tone]} ${
        active ? 'shadow-md shadow-slate-900/10 ring-2 ring-slate-900/20' : 'ring-white/70'
      } ${onClick ? 'hover:-translate-y-0.5 hover:shadow-md' : ''}`}
    >
      <span aria-hidden className="pointer-events-none absolute -right-5 -top-5 h-14 w-14 rounded-full bg-white/50" />
      <p className="relative text-[1.75rem] font-extrabold leading-none tracking-tight tabular-nums text-slate-900">{value}</p>
      <p className="relative mt-1.5 text-xs font-semibold text-slate-600">{label}</p>
    </Tag>
  );
}

/* ── column choices ─────────────────────────────────────────────── */

export function samplesOf(body: Cell[][], index: number): string[] {
  const out: string[] = [];
  for (const r of body) {
    const v = r?.[index];
    if (v === null || v === undefined || String(v).trim() === '') continue;
    out.push(v instanceof Date ? v.toLocaleDateString('en-IN') : String(v).trim());
    if (out.length === 3) break;
  }
  return out;
}

/** One row per Excel column: where it goes (Name, an existing field, a new field, or nowhere). */
export function ColumnMapper({ columns, fields, samples, onChange, disabled }: {
  columns: ColumnMap[];
  fields: AssociateField[];
  /** a few example values per column index */
  samples: (index: number) => string[];
  onChange: (next: ColumnMap[]) => void;
  disabled?: boolean;
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200">
      <div className="hidden grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)_minmax(0,1.4fr)] gap-4 bg-slate-50 px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-slate-500 md:grid">
        <span>Excel column</span><span>Sample values</span><span>Goes into</span>
      </div>
      <ul className="divide-y divide-slate-100">
        {columns.map((c, i) => (
          <ColumnRow key={c.index} col={c} fields={fields} samples={samples(c.index)} disabled={disabled}
            onChange={(target) => onChange(columns.map((x, j) => (j === i ? { ...x, target } : x)))} />
        ))}
      </ul>
    </div>
  );
}

function ColumnRow({ col, fields, samples, onChange, disabled }: {
  col: ColumnMap;
  fields: AssociateField[];
  samples: string[];
  onChange: (t: ColumnTarget) => void;
  disabled?: boolean;
}) {
  const t = col.target;
  const value = t.kind === 'field' ? `field:${t.key}` : t.kind;
  const pick = (v: string) => {
    if (v === 'name') onChange({ kind: 'name' });
    else if (v === 'skip') onChange({ kind: 'skip' });
    else if (v === 'new') onChange({ kind: 'new', label: col.header, type: guessType(col.header, samples) });
    else onChange({ kind: 'field', key: v.slice(6) });
  };
  return (
    <li className={`grid gap-2 px-4 py-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)_minmax(0,1.4fr)] md:items-center md:gap-4 ${t.kind === 'skip' ? 'bg-slate-50/50' : ''}`}>
      <p className={`truncate text-sm font-semibold ${t.kind === 'skip' ? 'text-slate-400' : 'text-slate-900'}`} title={col.header}>{col.header}</p>
      <p className="truncate text-xs text-slate-500" title={samples.join(' · ')}>{samples.length ? samples.join(' · ') : <span className="italic text-slate-300">empty</span>}</p>
      <div className="flex flex-col gap-2 sm:flex-row">
        <select value={value} disabled={disabled} onChange={(e) => pick(e.target.value)} aria-label={`Where "${col.header}" goes`}
          className={`${inputCls} py-2 ${t.kind === 'name' ? 'border-violet-300 bg-violet-50 font-semibold text-violet-800' : t.kind === 'new' ? 'border-emerald-300 bg-emerald-50/50' : ''}`}>
          <option value="name">Name</option>
          {fields.length > 0 && (
            <optgroup label="Existing fields">
              {fields.map((f) => <option key={f.key} value={`field:${f.key}`}>{f.label}</option>)}
            </optgroup>
          )}
          <option value="new">+ New field</option>
          <option value="skip">Don&apos;t import</option>
        </select>
        {t.kind === 'new' && (
          <div className="flex gap-2 sm:w-[60%]">
            <input value={t.label} disabled={disabled} onChange={(e) => onChange({ ...t, label: e.target.value })} aria-label="New field name" maxLength={80} className={`${inputCls} min-w-0 py-2`} />
            <select value={t.type} disabled={disabled} onChange={(e) => onChange({ ...t, type: e.target.value as FieldType })} aria-label="New field type" className={`${inputCls} w-28 shrink-0 py-2`}>
              {FIELD_TYPES.map((x) => <option key={x} value={x}>{FIELD_TYPE_LABEL[x]}</option>)}
            </select>
          </div>
        )}
      </div>
    </li>
  );
}
