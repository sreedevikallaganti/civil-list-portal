'use client';

import { useEffect, useState } from 'react';
import { X, Loader2, AlertCircle } from 'lucide-react';
import { ClientResponseError } from 'pocketbase';
import pb from '@/lib/pocketbase';

type FieldDef = {
  key: string; label: string; section: string;
  required?: boolean; type?: string; textarea?: boolean; placeholder?: string;
};

const SECTIONS = ['Basic', 'Work', 'Contact', 'Dates', 'Social', 'Other'];

const FIELDS: FieldDef[] = [
  { key: 'name',             label: 'Full Name',        section: 'Basic', required: true, placeholder: 'e.g. Dinesh Kumar' },
  { key: 'category',         label: 'Category',         section: 'Basic', placeholder: 'e.g. Media, Politician, Lawyer' },
  { key: 'designation',      label: 'Designation',      section: 'Basic', placeholder: 'e.g. Senior Editor' },
  { key: 'organization',     label: 'Organization',     section: 'Work' },
  { key: 'company_name',     label: 'Company Name',     section: 'Work' },
  { key: 'contact_number',   label: 'Contact Number',   section: 'Contact', placeholder: '+91 98xxxxxx00' },
  { key: 'email',            label: 'Email',            section: 'Contact', type: 'email' },
  { key: 'address',          label: 'Address',          section: 'Contact' },
  { key: 'website',          label: 'Website',          section: 'Contact', placeholder: 'https://...' },
  { key: 'date_of_birth',    label: 'Date of Birth',    section: 'Dates', placeholder: 'YYYY-MM-DD' },
  { key: 'appointment_date', label: 'Appointment Date', section: 'Dates', placeholder: 'YYYY-MM-DD' },
  { key: 'twitter_x',        label: 'Twitter (X)',      section: 'Social' },
  { key: 'linkedin',         label: 'LinkedIn',         section: 'Social' },
  { key: 'instagram',        label: 'Instagram',        section: 'Social' },
  { key: 'status',           label: 'Status',           section: 'Other', placeholder: 'e.g. Active' },
  { key: 'photo_url',        label: 'Photo URL',        section: 'Other', placeholder: 'https://...' },
  { key: 'remarks',          label: 'Remarks',          section: 'Other', textarea: true },
];

export default function OtherContactForm({
  isOpen, onClose, onSuccess, editing,
}: {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void | Promise<void>;
  editing: any | null;
}) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  /* Prefill when the panel opens */
  useEffect(() => {
    if (!isOpen) return;
    const initial: Record<string, string> = {};
    for (const f of FIELDS) initial[f.key] = editing?.[f.key] != null ? String(editing[f.key]) : '';
    setValues(initial);
    setError(null);
    setFieldErrors({});
  }, [isOpen, editing]);

  /* Escape to close */
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !saving) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, saving, onClose]);

  /* Lock body scroll while open */
  useEffect(() => {
    if (!isOpen) return;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, [isOpen]);

  if (!isOpen) return null;

  const set = (key: string) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setValues((v) => ({ ...v, [key]: e.target.value }));

  const inputCls = (hasError: boolean) =>
    `w-full px-3 py-2.5 bg-gray-50 border rounded-xl text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:bg-white focus:ring-2 transition-all ${
      hasError ? 'border-red-300 focus:ring-red-500/60 focus:border-red-500'
               : 'border-gray-200 focus:ring-blue-500/60 focus:border-blue-500'
    }`;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (saving) return;
    setError(null);
    setFieldErrors({});

    if (!values.name?.trim()) {
      setFieldErrors({ name: 'Full name is required.' });
      return;
    }

    /* Send ONLY keys that exist in the other_contacts schema */
    const payload: Record<string, string> = { name: values.name.trim() };
    for (const f of FIELDS) {
      if (f.key === 'name') continue;
      const v = values[f.key]?.trim();
      if (v) payload[f.key] = v;
    }

    try {
      setSaving(true);
      if (editing?.id) {
        await pb.collection('other_contacts').update(editing.id, payload);
      } else {
        await pb.collection('other_contacts').create(payload);
      }
      await onSuccess();
    } catch (err) {
      console.error('Save contact failed:', err);
      if (err instanceof ClientResponseError) {
        if (err.status === 403) {
          setError('Permission denied — check the Create/Update API rules on "other_contacts".');
        } else if (err.status === 401) {
          setError('Your session has expired — please sign in again.');
        } else {
          const data = (err.response?.data ?? {}) as Record<string, any>;
          const fe: Record<string, string> = {};
          for (const [field, detail] of Object.entries(data)) {
            fe[field] = detail?.message ?? 'Invalid value.';
          }
          if (Object.keys(fe).length > 0) {
            setFieldErrors(fe);
            setError('Please fix the highlighted fields.');
          } else {
            setError('Failed to save. Please try again.');
          }
        }
      } else {
        setError('Failed to save. Please try again.');
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div className="fixed inset-0 z-40 bg-slate-900/50 backdrop-blur-[2px] animate-in fade-in duration-300"
        onClick={() => !saving && onClose()} />

      <div className="fixed inset-y-0 right-0 w-full max-w-lg bg-white shadow-2xl z-50 flex flex-col animate-in slide-in-from-right duration-300">

        {/* Header */}
        <div className="relative bg-gradient-to-br from-amber-500 via-orange-600 to-rose-800 px-6 pt-6 pb-5 overflow-hidden flex-shrink-0">
          <div className="absolute -top-20 -right-20 w-56 h-56 bg-amber-300/25 rounded-full blur-3xl" />
          <div className="absolute -bottom-24 -left-16 w-48 h-48 bg-orange-400/20 rounded-full blur-3xl" />
          <div className="relative flex items-start justify-between gap-3">
            <div>
              <h2 className="text-xl font-bold text-white">{editing ? 'Edit Contact' : 'New Contact'}</h2>
              <p className="text-sm text-white/80 mt-0.5">
                {editing ? 'Update contact details' : 'Add a new contact to the directory'}
              </p>
            </div>
            <button onClick={() => !saving && onClose()}
              className="p-2 -mr-2 -mt-1 rounded-lg text-slate-300 hover:text-white hover:bg-white/10 transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
          <div className="flex-1 overflow-y-auto min-h-0 p-5 space-y-4 bg-slate-50/70">

            {error && (
              <div role="alert" className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5">
                <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
                <p className="text-xs text-red-700 leading-relaxed">{error}</p>
              </div>
            )}

            {SECTIONS.map((section) => (
              <div key={section} className="bg-white rounded-xl border border-gray-200 p-4">
                <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">{section} Information</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {FIELDS.filter((f) => f.section === section).map((f) => {
                    const hasError = !!fieldErrors[f.key];
                    return (
                      <div key={f.key} className={f.textarea ? 'sm:col-span-2' : ''}>
                        <label className="block text-[11px] font-bold uppercase tracking-wider text-gray-400 mb-1">
                          {f.label}
                          {f.required && <span className="text-red-500 ml-0.5">*</span>}
                        </label>
                        {f.textarea ? (
                          <textarea value={values[f.key] ?? ''} onChange={set(f.key)} rows={3}
                            placeholder={f.placeholder} className={inputCls(hasError)} />
                        ) : (
                          <input type={f.type ?? 'text'} value={values[f.key] ?? ''} onChange={set(f.key)}
                            placeholder={f.placeholder} className={inputCls(hasError)} />
                        )}
                        {hasError && <p className="mt-1 text-xs text-red-600">{fieldErrors[f.key]}</p>}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          {/* Footer */}
          <div className="flex items-center gap-3 p-5 border-t border-gray-200 bg-white/95 backdrop-blur flex-shrink-0">
            <button type="submit" disabled={saving}
              className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-amber-500 to-orange-600 text-white font-semibold rounded-xl shadow-lg shadow-amber-600/25 transition-all hover:shadow-xl hover:-translate-y-px disabled:opacity-60">
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              {saving ? 'Saving...' : editing ? 'Save Changes' : 'Create Contact'}
            </button>
            <button type="button" onClick={onClose} disabled={saving}
              className="px-4 py-3 rounded-xl border border-gray-200 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50 transition-colors">
              Cancel
            </button>
          </div>
        </form>
      </div>
    </>
  );
}