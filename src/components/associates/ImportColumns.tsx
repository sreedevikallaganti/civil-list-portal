'use client';

/* The two column steps of an imported file:

   ColumnEditor  — the file's OWN columns: rename, add, remove, reorder, change type. Each file can have
                   different columns; nothing here touches the Associates list.
   SyncDialog    — the approval to sync the file into Associates: where each column goes (an existing
                   field, a new field, or left out), what will be added / updated / skipped. */

import { useMemo, useState } from 'react';
import {
  ArrowDown, ArrowUp, Columns3, Loader2, Plus, RefreshCw, Send, Trash2, X,
} from 'lucide-react';
import {
  FIELD_TYPE_LABEL, FIELD_TYPES, matchHeader, toKey, type Associate, type AssociateField, type FieldType,
} from '@/lib/associates';
import {
  checkImport, columnsProblem, submitPlan, type DuplicateAction, type FileColumn, type StagedRow, type SyncTarget,
} from '@/lib/associateImport';
import { btn, Drawer, inputCls, useEscape } from './ui';

/** The default target for a column with this name: a matching Associates field, else a new one. */
export function targetFor(label: string, fields: AssociateField[]): SyncTarget {
  const hit = matchHeader(label, fields);
  return hit && hit !== 'name' ? { kind: 'field', key: hit } : { kind: 'new' };
}

/* ── the file's own columns ───────────────────────────────────────────────────────────────────── */

type Draft = FileColumn & { original?: string };

export function ColumnEditor({ open, cols, rows, fields, onClose, onApply }: {
  open: boolean;
  cols: FileColumn[];
  rows: StagedRow[];
  fields: AssociateField[];
  onClose: () => void;
  onApply: (next: FileColumn[]) => void;
}) {
  const [list, setList] = useState<Draft[]>(() => cols.map((c) => ({ ...c, original: c.label })));
  const [newLabel, setNewLabel] = useState('');
  const [newType, setNewType] = useState<FieldType>('text');
  const [touched, setTouched] = useState(false);

  const filled = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of rows) for (const [k, v] of Object.entries(r.data || {})) if (v !== '' && v != null) m.set(k, (m.get(k) || 0) + 1);
    return m;
  }, [rows]);
  const byKey = useMemo(() => new Map(fields.map((f) => [f.key, f])), [fields]);
  const problem = columnsProblem(list);
  const removed = cols.filter((c) => !list.some((x) => x.key === c.key));
  const lostValues = removed.reduce((n, c) => n + (filled.get(c.key) || 0), 0);

  const patch = (key: string, change: Partial<Draft>) => setList((l) => l.map((c) => (c.key === key ? { ...c, ...change } : c)));
  const move = (i: number, d: -1 | 1) => setList((l) => {
    const n = [...l];
    const j = i + d;
    if (j < 0 || j >= n.length) return l;
    [n[i], n[j]] = [n[j], n[i]];
    return n;
  });

  function add() {
    const label = newLabel.replace(/\s+/g, ' ').trim();
    if (!label) return;
    const key = toKey(label, list.map((c) => c.key));
    setList((l) => [...l, { key, label: label.slice(0, 80), type: newType, target: targetFor(label, fields) }]);
    setNewLabel('');
    setNewType('text');
  }

  function apply() {
    setTouched(true);
    if (problem) return;
    // a renamed column follows its new name: it syncs to the field of that name, or becomes a new field
    onApply(list.map(({ original, ...c }) => (original !== undefined && original !== c.label ? { ...c, target: targetFor(c.label, fields) } : c)));
  }

  return (
    <Drawer open={open} onClose={onClose} icon={<Columns3 className="h-5 w-5" />}
      title="Columns of this file"
      subtitle="Rename, add, remove or reorder this file's columns. Other files keep their own columns."
      footer={
        <>
          {touched && problem
            ? <p className="flex-1 text-sm text-rose-700">{problem}</p>
            : <p className="flex-1 text-xs text-slate-500">{lostValues > 0 ? `${lostValues} values in removed columns will be dropped.` : 'Saved with the file when you click Save.'}</p>}
          <button type="button" onClick={onClose} className={btn.secondary}>Cancel</button>
          <button type="button" onClick={apply} className={btn.violet}>Apply</button>
        </>
      }>
      <div className="space-y-2">
        <div className="flex items-center gap-3 rounded-xl bg-slate-50 px-3 py-2.5 text-sm">
          <span className="flex-1 font-semibold text-slate-700">Name</span>
          <span className="text-xs text-slate-400">Always there · required</span>
        </div>
        {list.map((c, i) => {
          const field = c.target.kind === 'field' ? byKey.get(c.target.key) : undefined;
          return (
            <div key={c.key} className="rounded-xl border border-slate-200 p-3">
              <div className="flex items-start gap-2">
                <div className="flex flex-col">
                  <button type="button" onClick={() => move(i, -1)} disabled={i === 0} className="rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-30" aria-label={`Move ${c.label} up`}><ArrowUp className="h-3.5 w-3.5" /></button>
                  <button type="button" onClick={() => move(i, 1)} disabled={i === list.length - 1} className="rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-30" aria-label={`Move ${c.label} down`}><ArrowDown className="h-3.5 w-3.5" /></button>
                </div>
                <div className="grid min-w-0 flex-1 gap-2 sm:grid-cols-[1fr_9rem]">
                  <input value={c.label} onChange={(e) => patch(c.key, { label: e.target.value })} maxLength={80}
                    aria-label={`Column name (was ${c.original ?? c.label})`} className={`${inputCls} py-2`} />
                  <select value={c.type} onChange={(e) => patch(c.key, { type: e.target.value as FieldType })}
                    aria-label={`Type of ${c.label}`} className={`${inputCls} py-2`}>
                    {FIELD_TYPES.map((t) => <option key={t} value={t}>{FIELD_TYPE_LABEL[t]}</option>)}
                  </select>
                </div>
                <button type="button" onClick={() => setList((l) => l.filter((x) => x.key !== c.key))}
                  className={`${btn.icon} hover:text-rose-600`} aria-label={`Remove column ${c.label}`}><Trash2 className="h-4 w-4" /></button>
              </div>
              <p className="mt-1.5 pl-7 text-xs text-slate-400">
                {filled.get(c.key) || 0} {filled.get(c.key) === 1 ? 'value' : 'values'}
                {c.original !== undefined && c.original !== c.label && c.original ? <> · was “{c.original}”</> : null}
                {field && c.original === c.label && <> · syncs to <span className="font-medium text-slate-500">{field.label}</span> (uses its type)</>}
              </p>
            </div>
          );
        })}
        {!list.length && <p className="rounded-xl border border-dashed border-slate-200 p-4 text-center text-sm text-slate-400">Only the Name column is left.</p>}
      </div>

      <form onSubmit={(e) => { e.preventDefault(); add(); }} className="mt-5 rounded-2xl border border-dashed border-violet-200 bg-violet-50/40 p-3">
        <p className="mb-2 text-sm font-semibold text-slate-800">Add a column</p>
        <div className="grid gap-2 sm:grid-cols-[1fr_9rem_auto]">
          <input value={newLabel} onChange={(e) => setNewLabel(e.target.value)} placeholder="e.g. Cadre, Batch no." maxLength={80}
            aria-label="New column name" className={`${inputCls} py-2`} />
          <select value={newType} onChange={(e) => setNewType(e.target.value as FieldType)} aria-label="New column type" className={`${inputCls} py-2`}>
            {FIELD_TYPES.map((t) => <option key={t} value={t}>{FIELD_TYPE_LABEL[t]}</option>)}
          </select>
          <button type="submit" disabled={!newLabel.trim()} className={btn.secondary}><Plus className="h-4 w-4" /> Add</button>
        </div>
        <p className="mt-2 text-xs text-slate-500">A new column starts empty — fill it in by editing the rows.</p>
      </form>
    </Drawer>
  );
}

/* ── the approval to sync into Associates ─────────────────────────────────────────────────────── */

export function SyncDialog({ cols, rows, fields, people, onDuplicate, dirty, busy, onCancel, onConfirm }: {
  cols: FileColumn[];
  rows: StagedRow[];
  fields: AssociateField[];
  people: Associate[];
  onDuplicate: DuplicateAction;
  dirty: boolean;
  busy: boolean;
  onCancel: () => void;
  onConfirm: (mapping: FileColumn[]) => void;
}) {
  const [mapping, setMapping] = useState<FileColumn[]>(cols);
  useEscape(onCancel, !busy);

  const dry = useMemo(() => checkImport(rows, mapping, fields, people), [rows, mapping, fields, people]);
  const plan = useMemo(() => submitPlan(rows, dry.checks, onDuplicate), [rows, dry.checks, onDuplicate]);
  const aimed = new Map<string, string>();
  for (const c of mapping) if (c.target.kind === 'field') aimed.set(c.target.key, c.key);
  const sample = (key: string) => rows.find((r) => !r.removed && r.data?.[key] !== undefined && r.data[key] !== '')?.data[key];
  const blocked = dry.counts.invalid > 0 || (!plan.creates.length && !plan.updates.length);

  const setTarget = (key: string, value: string) => setMapping((m) => m.map((c) => {
    if (c.key !== key) return c;
    const target: SyncTarget = value === 'new' ? { kind: 'new' } : value === 'skip' ? { kind: 'skip' } : { kind: 'field', key: value.slice(2) };
    return { ...c, target };
  }));
  const valueOf = (t: SyncTarget) => (t.kind === 'field' ? `f:${t.key}` : t.kind);

  return (
    <div className="fixed inset-0 z-[90] flex items-end justify-center bg-slate-900/40 backdrop-blur-[2px] sm:items-center sm:p-6" role="dialog" aria-modal="true" aria-labelledby="sync-title">
      <div className="flex max-h-[100dvh] w-full max-w-3xl flex-col overflow-hidden bg-white shadow-2xl sm:max-h-[92vh] sm:rounded-3xl">
        <header className="flex items-start gap-3 border-b border-slate-100 px-5 py-5 sm:px-7">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-50 text-violet-600"><RefreshCw className="h-5 w-5" /></span>
          <div className="min-w-0 flex-1">
            <h2 id="sync-title" className="text-lg font-bold text-slate-900">Sync this file into Associates?</h2>
            <p className="text-sm text-slate-500">Choose where each column of the file goes, then approve.</p>
          </div>
          <button type="button" onClick={onCancel} disabled={busy} className={btn.icon} aria-label="Close"><X className="h-5 w-5" /></button>
        </header>

        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-5 sm:px-7">
          <div className="overflow-hidden rounded-2xl border border-slate-200">
            <div className="hidden grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.3fr)] gap-3 bg-slate-50 px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-slate-500 sm:grid">
              <span>Column in the file</span><span>Example</span><span>Goes into Associates</span>
            </div>
            <ul className="divide-y divide-slate-100">
              <li className="grid gap-1 px-4 py-2.5 text-sm sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.3fr)] sm:items-center sm:gap-3">
                <span className="font-semibold text-slate-900">Name</span>
                <span className="truncate text-slate-500">{rows.find((r) => r.name)?.name || '—'}</span>
                <span className="text-slate-500">Name</span>
              </li>
              {mapping.map((c) => {
                const s = sample(c.key);
                return (
                  <li key={c.key} className="grid gap-1 px-4 py-2.5 text-sm sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.3fr)] sm:items-center sm:gap-3">
                    <span className="truncate font-semibold text-slate-900" title={c.label}>{c.label}</span>
                    <span className="truncate text-slate-500" title={s === undefined ? '' : String(s)}>{s === undefined ? '—' : String(s)}</span>
                    <select value={valueOf(c.target)} onChange={(e) => setTarget(c.key, e.target.value)} disabled={busy}
                      aria-label={`Where ${c.label} goes`}
                      className={`${inputCls} py-2 ${c.target.kind === 'skip' ? 'text-slate-400' : c.target.kind === 'new' ? 'text-emerald-700' : ''}`}>
                      <option value="new">＋ New field “{c.label}”</option>
                      <option value="skip">Don’t sync this column</option>
                      <optgroup label="Existing fields">
                        {fields.map((f) => (
                          <option key={f.key} value={`f:${f.key}`} disabled={aimed.has(f.key) && aimed.get(f.key) !== c.key}>
                            {f.label}{aimed.has(f.key) && aimed.get(f.key) !== c.key ? ' (used)' : ''}
                          </option>
                        ))}
                      </optgroup>
                    </select>
                  </li>
                );
              })}
            </ul>
          </div>

          <ul className="space-y-1.5 rounded-2xl bg-slate-50 p-4 text-sm text-slate-700">
            <li><strong className="text-slate-900">{plan.creates.length}</strong> {plan.creates.length === 1 ? 'associate' : 'associates'} will be added</li>
            {plan.updates.length > 0 && <li><strong className="text-slate-900">{plan.updates.length}</strong> existing {plan.updates.length === 1 ? 'associate' : 'associates'} will be updated</li>}
            {plan.skipped > 0 && <li><strong className="text-slate-900">{plan.skipped}</strong> duplicates will be skipped — never added twice</li>}
            {dry.counts.removed > 0 && <li><strong className="text-slate-900">{dry.counts.removed}</strong> removed rows are left out</li>}
            {dry.plan.newFields.length > 0 && <li>New fields in Associates: <span className="font-medium text-emerald-700">{dry.plan.newFields.map((f) => f.label).join(', ')}</span></li>}
          </ul>
          {dry.counts.invalid > 0 && (
            <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-800">
              With these choices {dry.counts.invalid} {dry.counts.invalid === 1 ? 'row is' : 'rows are'} invalid (for example a value that doesn’t fit the chosen field). Change the choices, or correct those rows first.
            </p>
          )}
          {dirty && <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800">Your unsaved changes are saved first.</p>}
          <p className="text-xs text-slate-500">Everything is checked again on the server. If anything is wrong, nothing is added.</p>
        </div>

        <footer className="flex justify-end gap-2 border-t border-slate-100 bg-slate-50/60 px-5 py-3.5 sm:px-7">
          <button type="button" onClick={onCancel} disabled={busy} className={btn.secondary}>Cancel</button>
          <button type="button" onClick={() => onConfirm(mapping)} disabled={busy || blocked} className={btn.violet}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Approve &amp; sync {plan.creates.length + plan.updates.length}
          </button>
        </footer>
      </div>
    </div>
  );
}
