'use client';

import { useEffect, useRef, useState } from 'react';
import { X, Save, Loader2, AlertCircle, ChevronDown } from 'lucide-react';
import pb from '@/lib/pocketbase';

interface CreateOfficerPanelProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  officerType?: 'IAS' | 'IPS' | 'Other';
}

/* ------------------------------- Constants ------------------------------- */

const INITIAL_FORM = {
  name: '',
  officer_id: '',
  batch_year: '',
  cadre: '',
  state: '',
  date_of_birth: '',
  current_position: '',
  designation: '',
  department: '',
  officer_category: '',
  previous_postings: '',
  status_flag: 'Active',
  contact_number: '',
  email: '',
  address: '',
  website: '',
  notes: '',
};

const TOTAL_FIELDS = Object.keys(INITIAL_FORM).length;

const TYPE_META = {
  IAS:   { label: 'IAS',     dot: 'bg-blue-400',   collection: 'ias_officers' },
  IPS:   { label: 'IPS',     dot: 'bg-indigo-400', collection: 'ips_officers' },
  Other: { label: 'Contact', dot: 'bg-amber-400',  collection: 'other_contacts' },
} as const;

const CADRE_OPTIONS = ['Andhra Pradesh', 'Telangana', 'Tamil Nadu', 'Karnataka', 'Kerala', 'Maharashtra', 'Gujarat', 'Rajasthan', 'Madhya Pradesh', 'Uttar Pradesh', 'Bihar', 'West Bengal', 'Odisha', 'Punjab', 'Haryana', 'Delhi', 'Central', 'Other'];
const STATE_OPTIONS = ['Andhra Pradesh', 'Telangana', 'Tamil Nadu', 'Karnataka', 'Kerala', 'Maharashtra', 'Gujarat', 'Rajasthan', 'Madhya Pradesh', 'Uttar Pradesh', 'Bihar', 'West Bengal', 'Odisha', 'Punjab', 'Haryana', 'Delhi', 'Other'];
const STATUS_OPTIONS = ['Active', 'Retired', 'On Leave', 'Suspended'];

/* ----------------------------- Field & Section ---------------------------- */

function Field({ label, required, invalid, className = '', children }: {
  label: string; required?: boolean; invalid?: boolean; className?: string; children: React.ReactNode;
}) {
  return (
    <div className={className}>
      <label className="mb-1.5 block text-[13px] font-medium text-slate-700">
        {label}
        {required && <span className="ml-0.5 text-red-500">*</span>}
      </label>
      {children}
    </div>
  );
}

function Section({ index, title, description, children }: {
  index: string; title: string; description: string; children: React.ReactNode;
}) {
  return (
    <>
      <div className="col-span-full pt-5 first:pt-0">
        <div className="flex items-center gap-3">
          <span className="text-[11px] font-semibold tabular-nums text-slate-300">{index}</span>
          <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">{title}</h3>
          <div className="h-px flex-1 bg-slate-100" />
        </div>
        <p className="mt-1.5 text-xs text-slate-400">{description}</p>
      </div>
      {children}
    </>
  );
}

/* ------------------------------- Main Panel ------------------------------- */

export default function CreateOfficerPanel({ isOpen, onClose, onSuccess, officerType = 'IAS' }: CreateOfficerPanelProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showErrors, setShowErrors] = useState(false);
  const [formData, setFormData] = useState(INITIAL_FORM);
  const formRef = useRef<HTMLDivElement>(null);

  const meta = TYPE_META[officerType];
  const isContact = officerType === 'Other';
  const heading = isContact ? 'Create New Contact' : 'Create New Officer';

  /* Reset form each time the panel opens */
  useEffect(() => {
    if (isOpen) {
      setFormData(INITIAL_FORM);
      setError(null);
      setShowErrors(false);
    }
  }, [isOpen]);

  /* Escape to close + lock body scroll */
  useEffect(() => {
    if (!isOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !loading) onClose();
    }
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [isOpen, onClose, loading]);

  /* --------------------------------- Logic --------------------------------- */

  const set = (key: keyof typeof INITIAL_FORM) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setFormData((f) => ({ ...f, [key]: e.target.value }));

  const filledCount = Object.values(formData).filter((v) => v !== '').length;
  const progress = Math.round((filledCount / TOTAL_FIELDS) * 100);

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();

    if (!formData.name.trim() || !formData.batch_year) {
      setShowErrors(true);
      setError('Please fill in the required fields: Full Name and Batch Year.');
      formRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    try {
      setLoading(true);
      setError(null);

      await pb.collection(meta.collection).create({
        ...formData,
        batch_year: parseInt(formData.batch_year) || 0,
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
      });

      setLoading(false);
      onSuccess();
      onClose();
    } catch (err) {
      console.error('Error creating officer:', err);
      setLoading(false);
      setError('Failed to create officer. Please check the fields and try again.');
      formRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  if (!isOpen) return null;

  /* ------------------------------ Input styling ----------------------------- */

  const inputCls = (invalid = false) =>
    `w-full px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 bg-white border rounded-lg transition-all duration-150 hover:border-slate-300 focus:outline-none focus:ring-4 ${
      invalid
        ? 'border-red-300 focus:border-red-400 focus:ring-red-500/10'
        : 'border-slate-200 focus:border-slate-500 focus:ring-slate-900/5'
    }`;

  const selectCls = (invalid = false) =>
    `${inputCls(invalid)} appearance-none cursor-pointer pr-9`;

  const areaCls = `${inputCls()} resize-none leading-relaxed`;

  const Chevron = () => (
    <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
  );

  /* --------------------------------- Render --------------------------------- */

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-slate-900/40 backdrop-blur-[2px] animate-in fade-in duration-300"
        onClick={() => !loading && onClose()}
      />

      {/* Off-Canvas Panel */}
      <div className="fixed inset-y-0 right-0 w-full max-w-2xl bg-white shadow-2xl z-50 flex flex-col animate-in slide-in-from-right duration-300">

        {/* ------------------------------- Header ------------------------------- */}
        <div className="relative flex-shrink-0 bg-slate-900 px-6 lg:px-8 pt-6 pb-5 overflow-hidden">
          <div className="absolute -top-32 right-0 w-80 h-80 bg-indigo-500/10 rounded-full blur-3xl" />

          <div className="relative flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2.5 flex-wrap">
                <h2 className="text-lg font-semibold text-white tracking-tight">{heading}</h2>
                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-white/10 ring-1 ring-inset ring-white/10 text-[11px] font-medium text-slate-200">
                  <span className={`w-1.5 h-1.5 rounded-full ${meta.dot}`} />
                  {meta.label}
                </span>
              </div>
              <p className="text-[13px] text-slate-400 mt-1">
                Add a new record to the directory — required fields are marked <span className="text-red-400 font-medium">*</span>
              </p>
            </div>
            <button
              onClick={onClose}
              className="p-2 -mr-2 -mt-1 rounded-lg text-slate-500 hover:text-white hover:bg-white/10 transition-colors flex-shrink-0"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Subtle completion indicator */}
          <div className="relative mt-5 flex items-center gap-3">
            <div className="flex-1 h-1 bg-white/10 rounded-full overflow-hidden">
              <div
                className="h-full bg-white/80 rounded-full transition-all duration-500"
                style={{ width: `${progress}%` }}
              />
            </div>
            <span className="text-[10px] font-medium text-slate-500 tabular-nums whitespace-nowrap">
              {filledCount} of {TOTAL_FIELDS} fields
            </span>
          </div>
        </div>

        {/* ----------------------------- Form Body ----------------------------- */}
        <div className="flex-1 overflow-y-auto min-h-0 bg-white">

          <form id="create-officer-form" onSubmit={handleSubmit}>
            <div ref={formRef} className="px-6 lg:px-8 py-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-5 gap-y-4">

                {/* Error banner */}
                {error && (
                  <div className="col-span-full flex items-start gap-2.5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 animate-in fade-in duration-200">
                    <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
                    <p className="text-[13px] text-red-700 leading-relaxed">{error}</p>
                  </div>
                )}

                {/* ------------------------ 01 Basic Information ------------------------ */}
                <Section index="01" title="Basic Information" description="Identity and service details">
                  <Field label="Full Name" required invalid={showErrors && !formData.name.trim()} className="col-span-full">
                    <input
                      type="text"
                      value={formData.name}
                      onChange={set('name')}
                      placeholder={isContact ? 'e.g., John Doe' : 'e.g., Dr. Pushpender Singh Poonia'}
                      className={inputCls(showErrors && !formData.name.trim())}
                    />
                  </Field>

                  <Field label="Officer ID">
                    <input
                      type="text"
                      value={formData.officer_id}
                      onChange={set('officer_id')}
                      placeholder="e.g., AS-2024-001"
                      className={inputCls()}
                    />
                  </Field>

                  <Field label="Batch Year" required invalid={showErrors && !formData.batch_year}>
                    <input
                      type="number"
                      min={1900}
                      max={new Date().getFullYear() + 1}
                      value={formData.batch_year}
                      onChange={set('batch_year')}
                      placeholder="e.g., 2018"
                      className={inputCls(showErrors && !formData.batch_year)}
                    />
                  </Field>

                  <Field label="Cadre">
                    <div className="relative">
                      <select value={formData.cadre} onChange={set('cadre')} className={selectCls()}>
                        <option value="">Select Cadre</option>
                        {CADRE_OPTIONS.map((c) => <option key={c} value={c}>{c}</option>)}
                      </select>
                      <Chevron />
                    </div>
                  </Field>

                  <Field label="State">
                    <div className="relative">
                      <select value={formData.state} onChange={set('state')} className={selectCls()}>
                        <option value="">Select State</option>
                        {STATE_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
                      </select>
                      <Chevron />
                    </div>
                  </Field>

                  <Field label="Date of Birth">
                    <input
                      type="date"
                      value={formData.date_of_birth}
                      onChange={set('date_of_birth')}
                      className={`${inputCls()} text-slate-600`}
                    />
                  </Field>
                </Section>

                {/* ------------------------ 02 Career Information ------------------------ */}
                <Section index="02" title="Career Information" description="Position and professional history">
                  <Field label="Current Position" className="col-span-full">
                    <input
                      type="text"
                      value={formData.current_position}
                      onChange={set('current_position')}
                      placeholder={isContact ? 'e.g., Manager' : 'e.g., District Magistrate'}
                      className={inputCls()}
                    />
                  </Field>

                  <Field label="Designation">
                    <input
                      type="text"
                      value={formData.designation}
                      onChange={set('designation')}
                      placeholder={isContact ? 'e.g., Senior Manager' : 'e.g., IAS Officer'}
                      className={inputCls()}
                    />
                  </Field>

                  <Field label="Department">
                    <input
                      type="text"
                      value={formData.department}
                      onChange={set('department')}
                      placeholder="e.g., Home Department"
                      className={inputCls()}
                    />
                  </Field>

                  <Field label="Officer Category" className="col-span-full">
                    <input
                      type="text"
                      value={formData.officer_category}
                      onChange={set('officer_category')}
                      placeholder="e.g., Senior Administrative Grade"
                      className={inputCls()}
                    />
                  </Field>

                  <Field label="Previous Postings" className="col-span-full">
                    <textarea
                      value={formData.previous_postings}
                      onChange={set('previous_postings')}
                      rows={2}
                      placeholder="List previous positions held..."
                      className={areaCls}
                    />
                  </Field>

                  <Field label="Status" className="col-span-full">
                    <div className="grid grid-cols-2 sm:grid-cols-4 border border-slate-200 rounded-lg overflow-hidden bg-white">
                      {STATUS_OPTIONS.map((status) => (
                        <button
                          key={status}
                          type="button"
                          onClick={() => setFormData((f) => ({ ...f, status_flag: status }))}
                          className={`py-2.5 text-xs font-medium transition-colors ${
                            formData.status_flag === status
                              ? 'bg-slate-900 text-white'
                              : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'
                          }`}
                        >
                          {status}
                        </button>
                      ))}
                    </div>
                  </Field>
                </Section>

                {/* ------------------------ 03 Contact Information ------------------------ */}
                <Section index="03" title="Contact Information" description="How to reach this person">
                  <Field label="Contact Number">
                    <input
                      type="tel"
                      value={formData.contact_number}
                      onChange={set('contact_number')}
                      placeholder="+91 98765 43210"
                      className={inputCls()}
                    />
                  </Field>

                  <Field label="Email Address">
                    <input
                      type="email"
                      value={formData.email}
                      onChange={set('email')}
                      placeholder="officer@gov.in"
                      className={inputCls()}
                    />
                  </Field>

                  <Field label="Address" className="col-span-full">
                    <textarea
                      value={formData.address}
                      onChange={set('address')}
                      rows={2}
                      placeholder="Official address..."
                      className={areaCls}
                    />
                  </Field>

                  <Field label="Website / Profile URL" className="col-span-full">
                    <input
                      type="url"
                      value={formData.website}
                      onChange={set('website')}
                      placeholder="https://..."
                      className={inputCls()}
                    />
                  </Field>
                </Section>

                {/* ------------------------ 04 Additional Information ------------------------ */}
                <Section index="04" title="Additional Information" description="Any extra context worth noting">
                  <Field label="Notes" className="col-span-full">
                    <textarea
                      value={formData.notes}
                      onChange={set('notes')}
                      rows={3}
                      placeholder="Any additional information..."
                      className={areaCls}
                    />
                  </Field>
                </Section>

              </div>
            </div>
          </form>
        </div>

        {/* ------------------------------- Footer ------------------------------- */}
        <div className="flex-shrink-0 flex items-center justify-between gap-3 px-6 lg:px-8 py-4 border-t border-slate-200 bg-white">
          <p className="hidden sm:flex items-center gap-1.5 text-xs text-slate-400">
            Press
            <kbd className="px-1.5 py-0.5 rounded border border-slate-200 bg-slate-50 text-[10px] font-semibold text-slate-500">Esc</kbd>
            to close
          </p>
          <div className="flex items-center gap-2.5 ml-auto">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-4 py-2.5 text-sm font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              form="create-officer-form"
              disabled={loading}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white text-sm font-semibold rounded-lg shadow-sm transition-all hover:shadow disabled:opacity-50 disabled:shadow-none"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  {isContact ? 'Create Contact' : 'Create Officer'}
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}