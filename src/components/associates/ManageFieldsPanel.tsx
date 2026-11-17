'use client';

/* The list's columns: add, rename, change type, reorder, show / hide in the table, delete.
   Every change is saved straight away. */

import { useRef, useState } from 'react';
import { ArrowDown, ArrowUp, Loader2, Plus, Settings2, Sparkles, Trash2 } from 'lucide-react';
import { showToast } from '@/components/Toaster';
import {
  coreFieldOf, fieldInUse, FIELD_TYPE_LABEL, FIELD_TYPES, missingCoreFields, normalizeHeader, toKey,
  type Associate, type AssociateField, type FieldInput, type FieldType,
} from '@/lib/associates';
import { createField, deleteFieldAndValues, errorText, runPool, updateField } from '@/lib/associatesApi';
import { btn, Drawer, inputCls } from './ui';

/** Two-click confirm: true on the second click within 4 s (the first click only arms it). */
function confirmedTwice(ref: { current: { id: string; at: number } | null }, id: string): boolean {
  const a = ref.current;
  const now = Date.now();
  if (a && a.id === id && now - a.at <= 4000) { ref.current = null; return true; }
  ref.current = { id, at: now };
  return false;
}

export default function ManageFieldsPanel({
  open, onClose, fields, people, onFieldsChange, onReload,
}: {
  open: boolean;
  onClose: () => void;
  fields: AssociateField[];
  people: Associate[];
  onFieldsChange: (next: AssociateField[]) => void;
  onReload: () => void;
}) {
  const [label, setLabel] = useState('');
  const [type, setType] = useState<FieldType>('text');
  const [busy, setBusy] = useState<string | null>(null);
  const armed = useRef<{ id: string; at: number } | null>(null);

  const taken = (except?: string) => fields.filter((f) => f.id !== except).map((f) => normalizeHeader(f.label));
  const missingSuggested = missingCoreFields(fields);
  /* fields that aren't standard and that nobody has a value in — hidden everywhere else until data arrives */
  const unused = fields.filter((f) => !coreFieldOf(f) && !fieldInUse(f, people));
  const nextOrder = () => Math.max(-1, ...fields.map((f) => f.sort_order ?? 0)) + 1;

  async function add(input: Omit<FieldInput, 'key' | 'sort_order'> & { key?: string }) {
    const clean = input.label.trim();
    if (!clean) return;
    if (normalizeHeader(clean) === 'name' || taken().includes(normalizeHeader(clean))) {
      showToast(`There is already a field called "${clean}"`, 'error');
      return;
    }
    setBusy('new');
    try {
      const f = await createField({
        ...input,
        label: clean,
        key: input.key && !fields.some((x) => x.key === input.key) ? input.key : toKey(clean, fields.map((x) => x.key)),
        sort_order: nextOrder(),
      });
      onFieldsChange([...fields, f]);
      setLabel('');
      setType('text');
    } catch (err) {
      showToast(errorText(err), 'error');
    } finally {
      setBusy(null);
    }
  }

  async function addSuggested() {
    setBusy('suggested');
    let order = nextOrder();
    const made: AssociateField[] = [];
    const failed = await runPool(missingSuggested, async (s) => {
      const key = fields.some((f) => f.key === s.key) ? toKey(s.label, fields.map((f) => f.key)) : s.key;
      made.push(await createField({ ...s, key, sort_order: order++ }));
    }, undefined, 1);
    onFieldsChange([...fields, ...made].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)));
    if (failed.length) showToast(failed[0].error, 'error');
    setBusy(null);
  }

  /** Deletes every unused field at once (none of them holds a value, so nothing is lost). */
  async function removeUnused() {
    if (!confirmedTwice(armed, 'unused')) {
      showToast(`Click again to delete ${unused.length} empty ${unused.length === 1 ? 'field' : 'fields'}: ${unused.map((f) => f.label).join(', ')}`, 'error');
      return;
    }
    setBusy('unused');
    const gone = new Set<string>();
    const failed = await runPool(unused, async (f) => { await deleteFieldAndValues(f, people); gone.add(f.id); });
    onFieldsChange(fields.filter((f) => !gone.has(f.id)));
    setBusy(null);
    if (failed.length) showToast(failed[0].error, 'error');
    else showToast(`${gone.size} empty ${gone.size === 1 ? 'field' : 'fields'} deleted`, 'success');
  }

  /** optimistic: shows the change at once, puts it back if the server refuses */
  async function patch(f: AssociateField, change: Partial<FieldInput>) {
    const before = fields;
    onFieldsChange(fields.map((x) => (x.id === f.id ? { ...x, ...change } : x)));
    try {
      await updateField(f.id, change);
    } catch (err) {
      onFieldsChange(before);
      showToast(errorText(err), 'error');
    }
  }

  function rename(f: AssociateField, value: string) {
    const clean = value.trim();
    if (!clean || clean === f.label) return;
    if (normalizeHeader(clean) === 'name' || taken(f.id).includes(normalizeHeader(clean))) {
      showToast(`There is already a field called "${clean}"`, 'error');
      onFieldsChange([...fields]); // re-render puts the old label back
      return;
    }
    patch(f, { label: clean });
  }

  async function move(index: number, by: -1 | 1) {
    const j = index + by;
    if (j < 0 || j >= fields.length) return;
    const next = [...fields];
    [next[index], next[j]] = [next[j], next[index]];
    const renumbered = next.map((f, i) => ({ ...f, sort_order: i }));
    onFieldsChange(renumbered);
    const changed = renumbered.filter((f) => fields.find((x) => x.id === f.id)?.sort_order !== f.sort_order);
    const failed = await runPool(changed, (f) => updateField(f.id, { sort_order: f.sort_order }));
    if (failed.length) { showToast(failed[0].error, 'error'); onReload(); }
  }

  async function remove(f: AssociateField) {
    const used = people.filter((p) => p.data && p.data[f.key] !== undefined && p.data[f.key] !== '').length;
    const a = armed.current;
    if (!a || a.id !== f.id || Date.now() - a.at > 4000) {
      armed.current = { id: f.id, at: Date.now() };
      showToast(used ? `Click delete again to remove "${f.label}" and its values for ${used} ${used === 1 ? 'person' : 'people'}` : `Click delete again to remove "${f.label}"`, 'error');
      return;
    }
    armed.current = null;
    setBusy(f.id);
    try {
      await deleteFieldAndValues(f, people);
      onFieldsChange(fields.filter((x) => x.id !== f.id));
      onReload();
      showToast(`"${f.label}" deleted`, 'success');
    } catch (err) {
      showToast(errorText(err), 'error');
    } finally {
      setBusy(null);
    }
  }

  return (
    <Drawer
      open={open}
      onClose={onClose}
      icon={<Settings2 className="h-5 w-5" />}
      title="Fields"
      subtitle="The columns of your Associates list. Changes are saved straight away."
      footer={<button type="button" onClick={onClose} className={`${btn.primary} ml-auto`}>Done</button>}
    >
      <div className="space-y-5">
        <p className="rounded-xl bg-slate-50 px-3 py-2.5 text-xs leading-relaxed text-slate-600">
          Every field here is in the <strong>Add / Edit</strong> form, each person&apos;s details, the <strong>Excel template</strong>,
          the <strong>export</strong> and the <strong>import</strong>. The list table shows Name, Department, Cadre, Designation and Batch year.
          Delete a field you don&apos;t need and it disappears everywhere.
        </p>
        {unused.length > 0 && (
          <div className="flex flex-col gap-2 rounded-xl border border-slate-200 px-3 py-2.5 text-sm sm:flex-row sm:items-center">
            <p className="flex-1 text-slate-600">{unused.length} {unused.length === 1 ? 'field has' : 'fields have'} no values yet: {unused.map((f) => f.label).join(', ')}.</p>
            <button type="button" onClick={removeUnused} disabled={!!busy} className={btn.secondary}>
              {busy === 'unused' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />} Delete {unused.length === 1 ? 'it' : 'them'}
            </button>
          </div>
        )}
        <ul className="space-y-2">
          <li className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5">
            <span className="flex-1 text-sm font-semibold text-slate-700">Name</span>
            <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-500 ring-1 ring-slate-200">Always shown · required</span>
          </li>

          {fields.map((f, i) => (
            <li key={f.id} className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm shadow-slate-900/[0.02]">
              <div className="flex items-end gap-2">
                <div className="flex flex-col">
                  <button type="button" className="rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-25" onClick={() => move(i, -1)} disabled={i === 0} aria-label={`Move ${f.label} up`}>
                    <ArrowUp className="h-3.5 w-3.5" />
                  </button>
                  <button type="button" className="rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-25" onClick={() => move(i, 1)} disabled={i === fields.length - 1} aria-label={`Move ${f.label} down`}>
                    <ArrowDown className="h-3.5 w-3.5" />
                  </button>
                </div>
                <div className="grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)_8.5rem] gap-2">
                  <label className="min-w-0">
                    <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-400">Field name</span>
                    <input
                      key={`${f.id}:${f.label}`}
                      defaultValue={f.label}
                      maxLength={80}
                      onBlur={(e) => rename(f, e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                      className={`${inputCls} py-2 font-semibold`}
                    />
                  </label>
                  <label className="min-w-0">
                    <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-400">Type</span>
                    <select
                      value={f.type}
                      aria-label={`Type of ${f.label}`}
                      onChange={(e) => patch(f, { type: e.target.value as FieldType })}
                      className={`${inputCls} py-2`}
                    >
                      {FIELD_TYPES.map((t) => <option key={t} value={t}>{FIELD_TYPE_LABEL[t]}</option>)}
                    </select>
                  </label>
                </div>
              </div>

              <div className="mt-2 flex flex-wrap items-center gap-1 pl-7">
                {coreFieldOf(f) ? (
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-500">Standard</span>
                ) : !fieldInUse(f, people) && (
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-500" title="Nobody has a value in it yet">Not used yet</span>
                )}
                <label className={`${btn.ghost} cursor-pointer`}>
                  <input type="checkbox" checked={!!f.required} onChange={(e) => patch(f, { required: e.target.checked })} className="h-4 w-4 accent-violet-600" />
                  Required
                </label>
                <button type="button" onClick={() => remove(f)} disabled={busy === f.id} className={`${btn.ghost} ml-auto hover:bg-rose-50 hover:text-rose-600`} aria-label={`Delete ${f.label}`}>
                  {busy === f.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                </button>
              </div>

              {f.type === 'select' && (
                <div className="mt-2 pl-7">
                  <input
                    key={`${f.id}:${(f.options?.choices || []).join('|')}`}
                    defaultValue={(f.options?.choices || []).join(', ')}
                    aria-label={`Choices for ${f.label}`}
                    placeholder="Choices, separated by commas — e.g. VIP, High, Normal"
                    onBlur={(e) => {
                      const choices = [...new Set(e.target.value.split(',').map((s) => s.trim()).filter(Boolean))];
                      if (choices.join('|') !== (f.options?.choices || []).join('|')) patch(f, { options: { choices } });
                    }}
                    className={`${inputCls} py-2 text-xs`}
                  />
                </div>
              )}
            </li>
          ))}
        </ul>

        {/* add a field */}
        <form
          onSubmit={(e) => { e.preventDefault(); add({ label, type, required: false, show_in_table: fields.filter((f) => f.show_in_table).length < 6, options: type === 'select' ? { choices: [] } : null }); }}
          className="rounded-2xl border border-dashed border-violet-200 bg-violet-50/40 p-3"
        >
          <p className="mb-2 text-sm font-semibold text-slate-800">Add a field</p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Company, Batch, PA's number" aria-label="New field name" maxLength={80} className={`${inputCls} flex-1`} />
            <select value={type} onChange={(e) => setType(e.target.value as FieldType)} aria-label="New field type" className={`${inputCls} sm:w-32`}>
              {FIELD_TYPES.map((t) => <option key={t} value={t}>{FIELD_TYPE_LABEL[t]}</option>)}
            </select>
            <button type="submit" disabled={!label.trim() || busy === 'new'} className={btn.violet}>
              {busy === 'new' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Add
            </button>
          </div>
        </form>

        {missingSuggested.length > 0 && (
          <div>
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Standard fields not added yet</p>
              {missingSuggested.length > 1 && (
                <button type="button" onClick={addSuggested} disabled={!!busy} className={btn.ghost}>
                  {busy === 'suggested' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />} Add all
                </button>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {missingSuggested.map((s) => (
                <button key={s.key} type="button" disabled={!!busy} onClick={() => add(s)}
                  className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:border-violet-300 hover:text-violet-700 disabled:opacity-50">
                  <Plus className="h-3 w-3" /> {s.label}
                </button>
              ))}
            </div>
          </div>
        )}

        <p className="text-xs leading-relaxed text-slate-400">
          Changing a field&apos;s type keeps the values already entered. Deleting a field also clears its values.
        </p>
      </div>
    </Drawer>
  );
}
