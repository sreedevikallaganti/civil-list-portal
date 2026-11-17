'use client';

/* Correct one row of an import draft. Shows the row's problems as you type, and — when the person
   is already in the Associates list — what the list has for them, to compare. */

import { useMemo, useState } from 'react';
import { AlertTriangle, Check, RotateCcw, Trash2, UserCheck, XCircle } from 'lucide-react';
import { coerceValue, displayValue, type Associate, type AssociateData, type AssociateField } from '@/lib/associates';
import type { RowCheck, StagedRow } from '@/lib/associateImport';
import { btn, Drawer, FieldControl, inputCls } from './ui';

export default function StagedRowPanel({
  row, check, fields, existing, readOnly, onClose, onApply, onRemove, onRestore,
}: {
  row: StagedRow;
  check?: RowCheck;
  /** the fields this import fills (mapped columns), in order */
  fields: AssociateField[];
  /** the person already in the list this row matches, if any */
  existing?: Associate;
  readOnly: boolean;
  onClose: () => void;
  onApply: (next: StagedRow) => void;
  onRemove: () => void;
  onRestore: () => void;
}) {
  // the parent gives this panel a new key per row, so the state starts from that row
  const [name, setName] = useState(row.name);
  const [values, setValues] = useState<Record<string, string>>(
    () => Object.fromEntries(fields.map((f) => [f.key, String(row.data?.[f.key] ?? '')])),
  );

  /* problems of what's typed now (the full check — duplicates included — runs when applied) */
  const problems = useMemo(() => {
    const out: Record<string, string> = {};
    if (!name.trim()) out.name = 'Name is missing';
    for (const f of fields) {
      const v = values[f.key];
      if (!v?.trim()) { if (f.required) out[f.key] = `${f.label} is required`; continue; }
      const { warning } = coerceValue(f.type, v);
      if (warning) out[f.key] = `${f.label} ${warning}`;
    }
    return out;
  }, [name, values, fields]);

  function apply() {
    const data: AssociateData = { ...row.data };
    for (const f of fields) {
      const { value } = coerceValue(f.type, values[f.key]);
      if (value === '') delete data[f.key];
      else data[f.key] = value;
    }
    onApply({ ...row, name: name.replace(/\s+/g, ' ').trim(), data, edited: true });
  }

  const dup = check?.duplicateOf;

  return (
    <Drawer
      open
      onClose={onClose}
      title={`Row ${row.row}`}
      subtitle={row.removed ? 'Removed from this import' : check?.status === 'invalid' ? 'Needs correcting' : check?.status === 'duplicate' ? 'Duplicate' : 'Ready'}
      footer={readOnly ? undefined : row.removed ? (
        <button type="button" onClick={onRestore} className={`${btn.primary} ml-auto`}><RotateCcw className="h-4 w-4" /> Put back in the import</button>
      ) : (
        <>
          <button type="button" onClick={onRemove} className={btn.danger}><Trash2 className="h-4 w-4" /> Remove</button>
          <button type="button" onClick={apply} className={`${btn.primary} ml-auto`}><Check className="h-4 w-4" /> Apply</button>
        </>
      )}
    >
      <div className="space-y-4">
        {dup && (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3.5 text-sm text-amber-900">
            <p className="flex items-center gap-2 font-semibold">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              {dup.kind === 'file' ? `Same person as row ${dup.row} of this file (${dup.reason})` : `Already in Associates (${dup.reason})`}
            </p>
            <p className="mt-1 text-amber-800">
              {dup.kind === 'file'
                ? 'Only the first one is imported. Remove this row, or correct it if it is a different person.'
                : 'This row is never added again. Choose “Update them” at the top to copy its values onto the existing person.'}
            </p>
            {existing && (
              <dl className="mt-3 divide-y divide-amber-100 rounded-xl bg-white/70">
                <div className="flex gap-3 px-3 py-2"><dt className="w-1/3 text-xs text-amber-700"><UserCheck className="mr-1 inline h-3.5 w-3.5" />In the list</dt><dd className="text-sm font-semibold">{existing.name}</dd></div>
                {fields.map((f) => {
                  const v = displayValue(f, existing.data?.[f.key]);
                  return v ? <div key={f.key} className="flex gap-3 px-3 py-2"><dt className="w-1/3 text-xs text-amber-700">{f.label}</dt><dd className="min-w-0 break-words text-sm">{v}</dd></div> : null;
                })}
              </dl>
            )}
          </div>
        )}

        <div>
          <label htmlFor="sr-name" className="mb-1.5 block text-sm font-semibold text-slate-700">Name <span className="text-rose-500">*</span></label>
          <input id="sr-name" value={name} disabled={readOnly || row.removed} onChange={(e) => setName(e.target.value)} maxLength={200}
            className={`${inputCls} ${problems.name ? 'border-rose-300' : ''}`} />
          {problems.name && <Problem text={problems.name} />}
        </div>

        {fields.map((f) => (
          <div key={f.key}>
            <label htmlFor={`sr-${f.key}`} className="mb-1.5 block text-sm font-semibold text-slate-700">
              {f.label} {f.required && <span className="text-rose-500">*</span>}
              {f.id.startsWith('new:') && <span className="ml-1.5 rounded-full bg-emerald-50 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700">NEW FIELD</span>}
            </label>
            {readOnly || row.removed ? (
              <p className="rounded-xl bg-slate-50 px-3 py-2.5 text-sm text-slate-800">{displayValue(f, row.data?.[f.key]) || <span className="text-slate-300">—</span>}</p>
            ) : (
              <FieldControl field={f} id={`sr-${f.key}`} value={values[f.key] || ''} invalid={!!problems[f.key]}
                onChange={(v) => setValues((s) => ({ ...s, [f.key]: v }))} />
            )}
            {problems[f.key] && <Problem text={problems[f.key]} />}
          </div>
        ))}
      </div>
    </Drawer>
  );
}

function Problem({ text }: { text: string }) {
  return <p className="mt-1 flex items-center gap-1 text-xs font-medium text-rose-600"><XCircle className="h-3.5 w-3.5" /> {text}</p>;
}
