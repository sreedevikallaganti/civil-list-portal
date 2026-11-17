'use client';

/* One associate: read the details, or add / edit them. The form is built from the list's fields. */

import { useMemo, useState } from 'react';
import { CalendarPlus, Copy, Loader2, Mail, Pencil, Phone, Save, Settings2, Trash2, UserPlus, UserRound } from 'lucide-react';
import { showToast } from '@/components/Toaster';
import {
  coerceValue, displayValue, fieldError, identity, sameReason,
  type Associate, type AssociateData, type AssociateField,
} from '@/lib/associates';
import { createAssociate, errorText, updateAssociate } from '@/lib/associatesApi';
import { Avatar, btn, Drawer, FieldControl, inputCls } from './ui';

type Mode = 'view' | 'edit';

const formValues = (fields: AssociateField[], a: Associate | null) =>
  Object.fromEntries(fields.map((f) => [f.key, String(a?.data?.[f.key] ?? '')]));

export default function AssociatePanel({
  open, associate, fields, people, editable, onClose, onSaved, onDelete, onManageFields, onSchedule, startInEdit = false,
}: {
  open: boolean;
  /** null = a new associate */
  associate: Associate | null;
  fields: AssociateField[];
  people: Associate[];
  editable: boolean;
  onClose: () => void;
  onSaved: (a: Associate, isNew: boolean) => void;
  onDelete: (a: Associate) => void;
  onManageFields: () => void;
  /** start a new meeting with this associate */
  onSchedule?: (a: Associate) => void;
  /** open straight in the edit form (the row's Edit button) */
  startInEdit?: boolean;
}) {
  // the page gives this panel a new `key` each time it opens, so this state always starts fresh
  const [mode, setMode] = useState<Mode>(associate && !(startInEdit && editable) ? 'view' : 'edit');
  const [name, setName] = useState(associate?.name || '');
  const [values, setValues] = useState<Record<string, string>>(() => formValues(fields, associate));
  const [touched, setTouched] = useState(false);
  const [saving, setSaving] = useState(false);

  const startEditing = () => {
    setName(associate?.name || '');
    setValues(formValues(fields, associate));
    setTouched(false);
    setMode('edit');
  };

  const errors = useMemo(() => {
    const out: Record<string, string> = {};
    if (!name.trim()) out.name = 'Name is required';
    for (const f of fields) {
      const e = fieldError(f, values[f.key]);
      if (e) out[f.key] = e;
    }
    return out;
  }, [name, values, fields]);

  /* someone already in the list with the same email / phone / name */
  const lookalike = (() => {
    if (mode !== 'edit' || !name.trim()) return null;
    const me = identity(name, values, fields);
    for (const p of people) {
      if (p.id === associate?.id) continue;
      const why = sameReason(identity(p.name, p.data || {}, fields), me);
      if (why) return { person: p, why };
    }
    return null;
  })();

  async function save() {
    setTouched(true);
    // values that don't fit their type (an odd phone, say) are allowed; only missing required ones block
    const blocking = Object.entries(errors).filter(([k, msg]) => k === 'name' || msg.endsWith('is required'));
    if (blocking.length) return;
    const data: AssociateData = {};
    for (const f of fields) {
      const { value } = coerceValue(f.type, values[f.key]);
      if (value !== '') data[f.key] = value;
    }
    // keep values of fields that aren't on the form any more
    const kept = Object.fromEntries(Object.entries(associate?.data || {}).filter(([k]) => !fields.some((f) => f.key === k)));
    setSaving(true);
    try {
      const saved = associate
        ? await updateAssociate(associate.id, name.trim(), { ...kept, ...data })
        : await createAssociate(name.trim(), data);
      showToast(associate ? `${saved.name} updated` : `${saved.name} added`, 'success');
      onSaved(saved, !associate);
      if (associate) setMode('view');
    } catch (err) {
      showToast(errorText(err), 'error');
    } finally {
      setSaving(false);
    }
  }

  const copy = (text: string) => {
    navigator.clipboard?.writeText(text).then(() => showToast('Copied', 'success'), () => {});
  };

  const isNew = !associate;
  const phone = fields.find((f) => f.type === 'phone' && associate?.data?.[f.key]);
  const email = fields.find((f) => f.type === 'email' && associate?.data?.[f.key]);
  const subtitleField = fields.find((f) => f.show_in_table && f.type === 'text' && associate?.data?.[f.key]);

  return (
    <Drawer
      open={open}
      onClose={onClose}
      icon={isNew ? <UserPlus className="h-5 w-5" /> : undefined}
      title={isNew ? 'Add associate' : mode === 'edit' ? `Edit ${associate.name}` : associate.name}
      subtitle={isNew ? 'Directors, senior officials and other key people.' : mode === 'view' && subtitleField ? displayValue(subtitleField, associate.data?.[subtitleField.key]) : undefined}
      footer={
        mode === 'edit' ? (
          <>
            <button type="button" onClick={() => (isNew ? onClose() : setMode('view'))} className={btn.secondary}>Cancel</button>
            <button type="button" onClick={save} disabled={saving} className={`${btn.primary} ml-auto`}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {isNew ? 'Add associate' : 'Save changes'}
            </button>
          </>
        ) : editable ? (
          <>
            <button type="button" onClick={() => onDelete(associate!)} className={btn.danger} aria-label="Delete">
              <Trash2 className="h-4 w-4" />
            </button>
            <button type="button" onClick={startEditing} className={`${btn.primary} ml-auto`}>
              <Pencil className="h-4 w-4" /> Edit
            </button>
          </>
        ) : undefined
      }
    >
      {mode === 'view' && associate ? (
        <div className="space-y-5">
          <div className="flex items-center gap-3">
            <Avatar name={associate.name} size="lg" />
            <div className="flex flex-wrap gap-2">
              {editable && onSchedule && (
                <button type="button" onClick={() => onSchedule(associate)} className={btn.primary}>
                  <CalendarPlus className="h-4 w-4" /> Schedule meeting
                </button>
              )}
              {phone && (
                <a href={`tel:${String(associate.data?.[phone.key]).replace(/\s/g, '')}`} className={btn.secondary}>
                  <Phone className="h-4 w-4" /> Call
                </a>
              )}
              {email && (
                <a href={`mailto:${associate.data?.[email.key]}`} className={btn.secondary}>
                  <Mail className="h-4 w-4" /> Email
                </a>
              )}
            </div>
          </div>

          <dl className="divide-y divide-slate-100 rounded-2xl border border-slate-200">
            {fields.map((f) => {
              const raw = associate.data?.[f.key];
              const shown = displayValue(f, raw);
              return (
                <div key={f.key} className="group grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-3 px-4 py-3">
                  <dt className="text-sm text-slate-500">{f.label}</dt>
                  <dd className="flex min-w-0 items-start gap-1 text-sm font-medium text-slate-900">
                    {shown ? (
                      <>
                        {f.type === 'url' ? (
                          <a href={String(raw)} target="_blank" rel="noopener noreferrer" className="break-all text-violet-700 hover:underline">{shown}</a>
                        ) : (
                          <span className="whitespace-pre-wrap break-words">{shown}</span>
                        )}
                        <button type="button" onClick={() => copy(shown)} className="ml-auto shrink-0 rounded p-0.5 text-slate-300 opacity-0 transition hover:text-slate-600 group-hover:opacity-100" aria-label={`Copy ${f.label}`}>
                          <Copy className="h-3.5 w-3.5" />
                        </button>
                      </>
                    ) : (
                      <span className="text-slate-300">—</span>
                    )}
                  </dd>
                </div>
              );
            })}
            {!fields.length && <p className="px-4 py-6 text-center text-sm text-slate-500">No fields yet.</p>}
          </dl>
          {associate.updated && (
            <p className="text-xs text-slate-400">Last updated {new Date(associate.updated.replace(' ', 'T')).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}</p>
          )}
        </div>
      ) : (
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); save(); }} noValidate>
          <div>
            <label htmlFor="assoc-name" className="mb-1.5 block text-sm font-semibold text-slate-700">
              Name <span className="text-rose-500">*</span>
            </label>
            <input id="assoc-name" value={name} onChange={(e) => setName(e.target.value)} autoFocus={isNew}
              placeholder="e.g. Dr. A. K. Sharma" className={`${inputCls} ${touched && errors.name ? 'border-rose-300' : ''}`} />
            {touched && errors.name && <p className="mt-1 text-xs font-medium text-rose-600">{errors.name}</p>}
          </div>

          {fields.map((f) => {
            const id = `assoc-${f.key}`;
            const err = errors[f.key];
            const show = err && (touched || String(values[f.key] || '').trim() !== '');
            return (
              <div key={f.key}>
                <label htmlFor={id} className="mb-1.5 block text-sm font-semibold text-slate-700">
                  {f.label} {f.required && <span className="text-rose-500">*</span>}
                </label>
                <FieldControl field={f} id={id} value={values[f.key] || ''} invalid={!!show}
                  onChange={(v) => setValues((s) => ({ ...s, [f.key]: v }))} />
                {show && (
                  <p className={`mt-1 text-xs font-medium ${err.endsWith('is required') ? 'text-rose-600' : 'text-amber-600'}`}>
                    {err}{err.endsWith('is required') ? '' : ' (it will be saved as typed)'}
                  </p>
                )}
              </div>
            );
          })}

          {lookalike && (
            <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-800">
              <UserRound className="mt-0.5 h-4 w-4 shrink-0" />
              <span><strong>{lookalike.person.name}</strong> is already in the list with the same {lookalike.why}. Check this isn&apos;t the same person.</span>
            </div>
          )}

          {editable && (
            <button type="button" onClick={onManageFields} className={`${btn.ghost} -ml-2`}>
              <Settings2 className="h-4 w-4" /> Add or change fields
            </button>
          )}
        </form>
      )}
    </Drawer>
  );
}
