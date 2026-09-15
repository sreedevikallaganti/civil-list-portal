'use client';

import { useEffect, useId, useRef, useState } from 'react';
import {
  X, Save, Loader2, AlertCircle, ChevronDown, UserPlus, Pencil,
  User, Briefcase, Phone, FileText, LogIn, LogOut,
} from 'lucide-react';
import { ClientResponseError } from 'pocketbase';
import pb from '@/lib/pocketbase';

type TypeKey = 'IAS' | 'IPS' | 'Other';

/* EDIT MODE — a PocketBase record (with `type` added by the directory page) */
interface EditOfficer {
  id: string;
  type: TypeKey;
  [key: string]: any;
}

interface CreateOfficerPanelProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  /** Lock the panel to a specific record type. Omit for "general" mode (user picks). */
  officerType?: TypeKey;
  /** EDIT MODE — pass the record (must include `id` and `type`). */
  editOfficer?: EditOfficer | null;
}

/* ------------------------------- Constants ------------------------------- */

/* Officer fields (ias_officers / ips_officers) — UNCHANGED */
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

/* Contact fields (other_contacts) — matches the real schema */
const INITIAL_CONTACT_FORM = {
  name: '',
  category: '',
  designation: '',
  organization: '',
  company_name: '',
  date_of_birth: '',
  appointment_date: '',
  status: 'Active',
  contact_number: '',
  email: '',
  address: '',
  website: '',
  twitter_x: '',
  linkedin: '',
  instagram: '',
  photo_url: '',
  remarks: '',
};

/* Full form shape = officer fields + contact fields (all strings).
   Only the keys that belong to the selected record type are ever submitted. */
type FormShape = typeof INITIAL_FORM & typeof INITIAL_CONTACT_FORM;

const INITIAL_ALL: FormShape = { ...INITIAL_FORM, ...INITIAL_CONTACT_FORM };
const OFFICER_KEYS = Object.keys(INITIAL_FORM) as (keyof FormShape)[];
const CONTACT_KEYS = Object.keys(INITIAL_CONTACT_FORM) as (keyof FormShape)[];

const TYPE_KEYS = ['IAS', 'IPS', 'Other'] as const;

const TYPE_META = {
  IAS:   { label: 'IAS',     dot: 'bg-blue-400',   collection: 'ias_officers',   desc: 'Indian Administrative Service' },
  IPS:   { label: 'IPS',     dot: 'bg-indigo-400', collection: 'ips_officers',   desc: 'Indian Police Service' },
  Other: { label: 'Contact', dot: 'bg-amber-400',  collection: 'other_contacts', desc: 'External / other contact' },
} as const;

const CADRE_OPTIONS = ['Andhra Pradesh', 'Telangana', 'Tamil Nadu', 'Karnataka', 'Kerala', 'Maharashtra', 'Gujarat', 'Rajasthan', 'Madhya Pradesh', 'Uttar Pradesh', 'Bihar', 'West Bengal', 'Odisha', 'Punjab', 'Haryana', 'Delhi', 'Central', 'Other'];
const STATE_OPTIONS = ['Andhra Pradesh', 'Telangana', 'Tamil Nadu', 'Karnataka', 'Kerala', 'Maharashtra', 'Gujarat', 'Rajasthan', 'Madhya Pradesh', 'Uttar Pradesh', 'Bihar', 'West Bengal', 'Odisha', 'Punjab', 'Haryana', 'Delhi', 'Other'];

const STATUS_OPTIONS = [
  { value: 'Active',    dot: 'bg-emerald-500' },
  { value: 'Retired',   dot: 'bg-slate-400' },
  { value: 'On Leave',  dot: 'bg-amber-500' },
  { value: 'Suspended', dot: 'bg-red-500' },
];

/* EDIT MODE — map a PocketBase record onto the form state.
   Works for both officer records and contact records (reads only known keys). */
function recordToForm(record: Record<string, any>): FormShape {
  const out = { ...INITIAL_ALL };
  (Object.keys(INITIAL_ALL) as (keyof FormShape)[]).forEach((key) => {
    const v = record[key];
    if (v === null || v === undefined) return;

    if (Array.isArray(v)) { out[key] = v.join(', '); return; }

    /* Date-ish fields: normalize to YYYY-MM-DD so <input type="date"> renders them.
       Handles PocketBase "1990-05-16 00:00:00.000Z" and text like "14-06-1984". */
    if ((key === 'date_of_birth' || key === 'appointment_date') && typeof v === 'string' && v) {
      const dateOnly = v.slice(0, 10);
      if (/^\d{4}-\d{2}-\d{2}$/.test(dateOnly)) { out[key] = dateOnly; return; }
      const dmy = /^(\d{2})-(\d{2})-(\d{4})/.exec(v); /* DD-MM-YYYY → ISO */
      if (dmy) { out[key] = `${dmy[3]}-${dmy[2]}-${dmy[1]}`; return; }
      const parsed = new Date(v);
      out[key] = Number.isNaN(parsed.getTime()) ? '' : parsed.toISOString().slice(0, 10);
      return;
    }

    out[key] = String(v);
  });
  return out;
}

/* ------------------------------- UI Atoms -------------------------------- */

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex h-5 min-w-[20px] items-center justify-center rounded border border-slate-200 bg-white px-1 font-sans text-[10px] font-semibold leading-none text-slate-500 shadow-[inset_0_-1px_0_rgb(0_0_0/0.06)]">
      {children}
    </kbd>
  );
}

function Shortcut({ keys, label }: { keys: string[]; label: string }) {
  return (
    <span className="flex items-center gap-1.5 whitespace-nowrap">
      <span className="flex items-center gap-0.5">
        {keys.map((k) => <Kbd key={k}>{k}</Kbd>)}
      </span>
      <span className="text-[11px]">{label}</span>
    </span>
  );
}

function Field({
  id, label, required, error, className = '', children,
}: {
  id?: string;
  label: string;
  required?: boolean;
  error?: string | null;
  className?: string;
  children: React.ReactNode;
}) {
  const labelContent = (
    <>
      {label}
      {required && (
        <>
          <span className="ml-0.5 text-red-500" aria-hidden="true">*</span>
          <span className="sr-only"> (required)</span>
        </>
      )}
    </>
  );

  return (
    <div className={className}>
      {id ? (
        <label htmlFor={id} className="mb-1.5 block text-[13px] font-medium text-slate-700">
          {labelContent}
        </label>
      ) : (
        <span className="mb-1.5 block text-[13px] font-medium text-slate-700">{labelContent}</span>
      )}
      {children}
      {error && (
        <p id={id ? `${id}-error` : undefined} className="mt-1.5 flex items-center gap-1 text-xs font-medium text-red-600">
          <AlertCircle className="h-3 w-3 flex-shrink-0" />
          {error}
        </p>
      )}
    </div>
  );
}

function Section({
  id, icon: Icon, title, description, highlighted = false, children,
}: {
  id?: string;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  highlighted?: boolean;
  children: React.ReactNode;
}) {
  return (
    <>
      <div id={id} tabIndex={-1} className="col-span-full scroll-mt-6 pt-4 first:pt-0 focus:outline-none">
        <div
          className={`-mx-3 flex items-center gap-3 rounded-xl px-3 py-2 ring-1 transition-all duration-300 ${
            highlighted ? 'bg-slate-100/90 ring-slate-200' : 'bg-transparent ring-transparent'
          }`}
        >
          <span
            className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg shadow-sm ring-1 ring-inset transition-colors duration-300 ${
              highlighted ? 'bg-slate-900 ring-slate-900' : 'bg-white ring-slate-200'
            }`}
          >
            <Icon className={`h-4 w-4 transition-colors duration-300 ${highlighted ? 'text-white' : 'text-slate-500'}`} />
          </span>
          <div>
            <h3 className="text-sm font-semibold leading-none text-slate-900">{title}</h3>
            <p className="mt-1 text-xs leading-none text-slate-400">{description}</p>
          </div>
        </div>
      </div>
      {children}
    </>
  );
}

/* Shared status pill group (used by both the officer form and the contact form) */
function StatusPillGroup({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="group space-y-1.5">
      <div
        role="radiogroup"
        aria-label="Status"
        className="flex flex-wrap gap-2"
        onKeyDown={(e) => {
          if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
          e.preventDefault();
          const dir = e.key === 'ArrowRight' ? 1 : -1;
          const idx = Math.max(0, STATUS_OPTIONS.findIndex((s) => s.value === value));
          const next = STATUS_OPTIONS[(idx + dir + STATUS_OPTIONS.length) % STATUS_OPTIONS.length];
          onChange(next.value);
        }}
      >
        {/* saved value not in the preset list? still show it */}
        {value && !STATUS_OPTIONS.some((s) => s.value === value) && (
          <button
            type="button"
            role="radio"
            aria-checked={true}
            className="inline-flex items-center gap-2 rounded-full border border-slate-900 bg-slate-900 px-3.5 py-2 text-xs font-medium text-white shadow-sm"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-white" />
            {value}
          </button>
        )}
        {STATUS_OPTIONS.map((s) => {
          const selected = value === s.value;
          return (
            <button
              key={s.value}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onChange(s.value)}
              className={`inline-flex items-center gap-2 rounded-full border px-3.5 py-2 text-xs font-medium shadow-sm transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2 ${
                selected
                  ? 'border-slate-900 bg-slate-900 text-white'
                  : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-900'
              }`}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${selected ? 'bg-white' : s.dot}`} />
              {s.value}
            </button>
          );
        })}
      </div>
      <p className="text-[11px] text-slate-400 opacity-0 transition-opacity duration-200 group-focus-within:opacity-100">
        Tip: use ← / → arrow keys to change status
      </p>
    </div>
  );
}

/* ------------------------------- Main Panel ------------------------------- */

export default function CreateOfficerPanel({ isOpen, onClose, onSuccess, officerType, editOfficer }: CreateOfficerPanelProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showErrors, setShowErrors] = useState(false);
  const [formData, setFormData] = useState<FormShape>(() => (editOfficer ? recordToForm(editOfficer) : INITIAL_ALL));

  /* null = not chosen yet (general mode only) */
  const [selectedType, setSelectedType] = useState<TypeKey | null>(officerType ?? editOfficer?.type ?? null);

  const [resetArmed, setResetArmed] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [jumpHighlight, setJumpHighlight] = useState<string | null>(null);
  const [modKey] = useState(() =>
    typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/i.test(navigator.userAgent) ? '⌘' : 'Ctrl'
  );

  /* Auth state — works for both users and superusers */
  const [auth, setAuth] = useState({ isValid: false, record: null as typeof pb.authStore.record });

  useEffect(() => {
    const sync = () => setAuth({ isValid: pb.authStore.isValid, record: pb.authStore.record });
    sync();
    const unsubscribe = pb.authStore.onChange(sync);
    return () => unsubscribe();
  }, []);

  const authRecord = auth.record as { id: string; email?: string; collectionName?: string } | null;
  const isSuperuser = authRecord?.collectionName === '_superusers';
  const authLabel = authRecord ? (authRecord.email ?? authRecord.id) : null;

  const scrollRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const jumpTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const uid = useId();

  /* ------------------------------ EDIT MODE ------------------------------- */

  const isEditMode = !!editOfficer;
  const activeType: TypeKey | null = isEditMode && editOfficer ? editOfficer.type : selectedType;
  const isGeneralMode = !officerType && !isEditMode;
  const baselineForm = editOfficer ? recordToForm(editOfficer) : INITIAL_ALL;

  const selectedMeta = activeType ? TYPE_META[activeType] : null;
  const isContact = activeType === 'Other';
  const heading = isEditMode
    ? (isContact ? 'Edit Contact' : 'Edit Officer')
    : !activeType
      ? 'Create New Record'
      : isContact
        ? 'Create New Contact'
        : 'Create New Officer';

  /* Reset form each time the panel opens + move focus into the panel */
  useEffect(() => {
    if (isOpen) {
      setFormData(editOfficer ? recordToForm(editOfficer) : INITIAL_ALL);
      setSelectedType(editOfficer ? editOfficer.type : officerType ?? null);
      setError(null);
      setShowErrors(false);
      setResetArmed(false);
      setNotice(null);
      setJumpHighlight(null);
      const t = setTimeout(() => panelRef.current?.focus(), 60);
      return () => clearTimeout(t);
    }
  }, [isOpen, officerType, editOfficer]);

  /* Lock body scroll while open */
  useEffect(() => {
    if (!isOpen) return;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, [isOpen]);

  /* Clean up timers on unmount */
  useEffect(() => () => {
    if (resetTimer.current) clearTimeout(resetTimer.current);
    if (jumpTimer.current) clearTimeout(jumpTimer.current);
  }, []);

  /* Auto-dismiss success notices */
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 2500);
    return () => clearTimeout(t);
  }, [notice]);

  /* --------------------------------- Logic --------------------------------- */

  const set = (key: keyof FormShape) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setFormData((f) => ({ ...f, [key]: e.target.value }));

  const typeError = isGeneralMode && showErrors && !selectedType
    ? 'Please select a record type.'
    : null;
  const nameError = showErrors && !formData.name.trim() ? 'Full name is required.' : null;
  /* Batch year is an OFFICER requirement — contacts never ask for it */
  const batchError = showErrors && !isContact && !formData.batch_year ? 'Batch year is required.' : null;

  const isDirty =
    (isGeneralMode && selectedType !== (officerType ?? null)) ||
    (Object.keys(INITIAL_ALL) as (keyof FormShape)[]).some(
      (k) => formData[k] !== baselineForm[k]
    );

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();

    if (!activeType) {
      setShowErrors(true);
      setError('Please select a record type before saving.');
      document.getElementById(`${uid}-type-IAS`)?.focus();
      return;
    }

    const trimmedName = formData.name.trim();
    const batchYear = Number.parseInt(formData.batch_year, 10);

    if (!trimmedName || (!isContact && !formData.batch_year)) {
      setShowErrors(true);
      setError('Please fill in the required fields highlighted below.');
      document.getElementById(!trimmedName ? `${uid}-name` : `${uid}-batch-year`)?.focus();
      return;
    }

    if (!isContact && (Number.isNaN(batchYear) || batchYear < 1900 || batchYear > new Date().getFullYear() + 1)) {
      setShowErrors(true);
      setError('Batch year must be a valid year (e.g., 2018).');
      document.getElementById(`${uid}-batch-year`)?.focus();
      return;
    }

    if (!pb.authStore.isValid) {
      setError(`You must be signed in as a user or superuser to ${isEditMode ? 'update' : 'create'} records.`);
      scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    const collection = TYPE_META[activeType].collection;

    try {
      setLoading(true);
      setError(null);

      /* Submit ONLY the keys that exist in the target collection's schema:
         officer fields for IAS/IPS, contact fields for Other. */
      const keys = isContact ? CONTACT_KEYS : OFFICER_KEYS;
      const payload: Record<string, unknown> = { name: trimmedName };
      for (const key of keys) {
        if (key === 'name') continue;
        const value = formData[key];
        if (value === '') {
          /* EDIT: only clear the field in PocketBase if it actually displayed a value */
          if (isEditMode && editOfficer && key in editOfficer && baselineForm[key] !== '') {
            payload[key] = isContact ? '' : null;
          }
          continue;
        }
        payload[key] = value;
      }
      if (!isContact) payload.batch_year = batchYear;

      if (isEditMode && editOfficer) {
        await pb.collection(collection).update(editOfficer.id, payload);
      } else {
        await pb.collection(collection).create(payload);
      }

      setLoading(false);
      onSuccess();
      onClose();
    } catch (err) {
      setLoading(false);
      console.error('[CreateOfficerPanel] Save failed:', err);

      let message = isEditMode ? 'Failed to save changes. Please try again.' : 'Failed to create record. Please try again.';

      if (err instanceof ClientResponseError) {
        const data = (err.response?.data ?? {}) as Record<string, { message?: string }>;

        if (err.status === 0) {
          message = 'Cannot reach the PocketBase server — is it running, and is NEXT_PUBLIC_POCKETBASE_URL correct?';
        } else if (err.status === 400) {
          message =
            Object.entries(data)
              .map(([field, d]) => `${field}: ${d.message ?? 'invalid value'}`)
              .join(' · ') || err.message;
        } else if (err.status === 401) {
          message = 'Your session has expired — please sign in again.';
        } else if (err.status === 403) {
          message = 'Permission denied (403) — open PocketBase Admin → Collections → ' + collection +
            ' → API Rules → set the ' + (isEditMode ? 'Update' : 'Create') + ' rule to @request.auth.id != "" (or sign in as a superuser).';
        } else if (err.status === 404) {
          message = isEditMode
            ? 'This record no longer exists — it may have been deleted already.'
            : 'Collection "' + collection + '" not found — check the collection name in PocketBase.';
        } else {
          message = err.message;
        }
      }

      setError(message);
      scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  /* Alt + R — clear form (press twice to confirm) */
  const disarmReset = () => {
    if (resetTimer.current) clearTimeout(resetTimer.current);
    setResetArmed(false);
  };

  const handleResetShortcut = () => {
    if (!isDirty) return;

    if (resetArmed) {
      disarmReset();
      setFormData(editOfficer ? recordToForm(editOfficer) : INITIAL_ALL);
      setSelectedType(editOfficer ? editOfficer.type : officerType ?? null);
      setError(null);
      setShowErrors(false);
      setNotice(isEditMode ? 'Reverted to saved values' : 'Form cleared');
      scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
      document.getElementById(isGeneralMode ? `${uid}-type-IAS` : `${uid}-name`)?.focus();
    } else {
      setResetArmed(true);
      if (resetTimer.current) clearTimeout(resetTimer.current);
      resetTimer.current = setTimeout(() => setResetArmed(false), 3000);
    }
  };

  /* Alt + 1–4 — jump to section */
  const jumpToSection = (n: number) => {
    const sectionId = `${uid}-section-${n}`;
    const el = document.getElementById(sectionId);
    if (!el) return;
    el.focus({ preventScroll: true });
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setJumpHighlight(sectionId);
    if (jumpTimer.current) clearTimeout(jumpTimer.current);
    jumpTimer.current = setTimeout(() => setJumpHighlight(null), 1500);
  };

  /* Alt + T — focus the record type selector (general mode) */
  const focusTypeSelector = () => {
    document.getElementById(`${uid}-type-${selectedType ?? 'IAS'}`)?.focus();
  };

  const handlersRef = useRef({ submit: handleSubmit, reset: handleResetShortcut, jump: jumpToSection, focusType: focusTypeSelector });
  useEffect(() => {
    handlersRef.current = { submit: handleSubmit, reset: handleResetShortcut, jump: jumpToSection, focusType: focusTypeSelector };
  });

  /* ------------------------- Keyboard shortcut map ------------------------- */
  useEffect(() => {
    if (!isOpen) return;

    const onKey = (e: KeyboardEvent) => {
      const h = handlersRef.current;

      if (e.key === 'Escape') {
        if (resetArmed) { disarmReset(); return; }
        if (!loading) onClose();
        return;
      }

      const mod = e.ctrlKey || e.metaKey;

      if (mod && (e.key === 'Enter' || e.key.toLowerCase() === 's')) {
        e.preventDefault();
        if (!loading) h.submit();
        return;
      }

      if (e.altKey && ['1', '2', '3', '4'].includes(e.key)) {
        e.preventDefault();
        h.jump(Number(e.key));
        return;
      }

      if (e.altKey && e.key.toLowerCase() === 't') {
        e.preventDefault();
        h.focusType();
        return;
      }

      if (e.altKey && e.key.toLowerCase() === 'r') {
        e.preventDefault();
        if (!loading) h.reset();
      }
    };

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, loading, onClose, resetArmed]);

  if (!isOpen) return null;

  /* ------------------------------ Input styling ----------------------------- */

  const inputCls = (invalid = false) =>
    `w-full rounded-lg border bg-white px-3.5 py-2.5 text-sm text-slate-900 shadow-sm outline-none transition-all duration-150 placeholder:text-slate-400 hover:border-slate-300 focus:ring-4 ${
      invalid
        ? 'border-red-300 focus:border-red-400 focus:ring-red-500/10'
        : 'border-slate-200 focus:border-slate-500 focus:ring-slate-900/5'
    }`;

  const selectCls = (invalid = false) => `${inputCls(invalid)} cursor-pointer appearance-none pr-9`;
  const areaCls = `${inputCls()} resize-none leading-relaxed`;

  const Chevron = () => (
    <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
  );

  /* --------------------------------- Render --------------------------------- */

  return (
    <>
      {/* Backdrop */}
      <div
        aria-hidden="true"
        className="fixed inset-0 z-40 bg-slate-900/40 backdrop-blur-[2px] animate-in fade-in duration-300"
        onClick={() => !loading && onClose()}
      />

      {/* Off-Canvas Panel */}
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${uid}-heading`}
        tabIndex={-1}
        className="fixed inset-y-0 right-0 z-50 flex w-full max-w-2xl flex-col bg-white shadow-2xl outline-none animate-in fade-in slide-in-from-right duration-300"
      >

        {/* ------------------------------- Header ------------------------------- */}
        <header className="relative flex-shrink-0 overflow-hidden border-b border-slate-800 bg-slate-900 px-6 py-5 lg:px-8">
          <div className="pointer-events-none absolute -top-28 -right-12 h-72 w-72 rounded-full bg-indigo-500/10 blur-3xl" />

          <div className="relative flex items-start justify-between gap-4">
            <div className="flex min-w-0 items-start gap-3.5">
              <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-white/10 ring-1 ring-inset ring-white/15">
                {isEditMode
                  ? <Pencil className="h-5 w-5 text-white" />
                  : <UserPlus className="h-5 w-5 text-white" />}
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2.5">
                  <h2 id={`${uid}-heading`} className="text-lg font-semibold tracking-tight text-white">
                    {heading}
                  </h2>
                  {selectedMeta ? (
                    <span className="inline-flex items-center gap-1.5 rounded-md bg-white/10 px-2 py-0.5 text-[11px] font-medium text-slate-200 ring-1 ring-inset ring-white/10">
                      <span className={`h-1.5 w-1.5 rounded-full ${selectedMeta.dot}`} />
                      {selectedMeta.label}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 rounded-md bg-amber-400/10 px-2 py-0.5 text-[11px] font-medium text-amber-300 ring-1 ring-inset ring-amber-400/20">
                      <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
                      Select type
                    </span>
                  )}
                </div>
                <p className="mt-1 text-[13px] text-slate-400">
                  Fields marked with <span className="font-medium text-red-400">*</span> are required
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              aria-label="Close panel"
              className="-mr-2 -mt-1 flex-shrink-0 rounded-lg p-2 text-slate-400 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </header>

        {/* ----------------------------- Form Body ----------------------------- */}
        <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto bg-slate-50">
          <form id="create-officer-form" onSubmit={handleSubmit}>
            <div className="px-6 py-6 lg:px-8 lg:py-7">
              <div className="grid grid-cols-1 gap-x-5 gap-y-4 md:grid-cols-2">

                {/* Error banner */}
                {error && (
                  <div
                    role="alert"
                    className="col-span-full flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 animate-in fade-in duration-200"
                  >
                    <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-red-500" />
                    <p className="text-[13px] leading-relaxed text-red-700">{error}</p>
                  </div>
                )}

                {/* Auth status */}
                <div
                  role="status"
                  className={`col-span-full flex items-center gap-2.5 rounded-xl border px-4 py-3 ${
                    auth.isValid ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50'
                  }`}
                >
                  {auth.isValid ? (
                    <>
                      <LogIn className="h-4 w-4 flex-shrink-0 text-emerald-600" />
                      <p className="text-[13px] text-emerald-800">
                        Signed in as <span className="font-semibold">{authLabel}</span> ({isSuperuser ? 'superuser' : 'user'}).
                      </p>
                      <button
                        type="button"
                        onClick={() => pb.authStore.clear()}
                        className="ml-auto inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-slate-500 hover:bg-white hover:text-slate-700"
                      >
                        <LogOut className="h-3.5 w-3.5" /> Sign out
                      </button>
                    </>
                  ) : (
                    <>
                      <AlertCircle className="h-4 w-4 flex-shrink-0 text-amber-600" />
                      <p className="text-[13px] text-amber-800">
                        You are not signed in. Sign in with a <span className="font-semibold">user</span> or{' '}
                        <span className="font-semibold">superuser</span> account to {isEditMode ? 'update' : 'create'} records.
                      </p>
                    </>
                  )}
                </div>

                {/* ---------------------- Record Type (general mode) ---------------------- */}
                {isGeneralMode && (
                  <div className="col-span-full">
                    <span id={`${uid}-type-label`} className="mb-1.5 flex items-center gap-0.5 text-[13px] font-medium text-slate-700">
                      Record Type
                      <span className="ml-0.5 text-red-500" aria-hidden="true">*</span>
                      <span className="sr-only"> (required)</span>
                    </span>

                    <div
                      role="radiogroup"
                      aria-labelledby={`${uid}-type-label`}
                      aria-describedby={typeError ? `${uid}-type-error` : undefined}
                      onKeyDown={(e) => {
                        if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
                        e.preventDefault();
                        const dir = e.key === 'ArrowRight' ? 1 : -1;
                        const idx = TYPE_KEYS.indexOf(selectedType ?? 'IAS');
                        const next = TYPE_KEYS[(idx + dir + TYPE_KEYS.length) % TYPE_KEYS.length];
                        setSelectedType(next);
                        document.getElementById(`${uid}-type-${next}`)?.focus();
                      }}
                      className="grid grid-cols-1 gap-2 sm:grid-cols-3"
                    >
                      {TYPE_KEYS.map((t) => {
                        const m = TYPE_META[t];
                        const selected = selectedType === t;
                        return (
                          <button
                            key={t}
                            id={`${uid}-type-${t}`}
                            type="button"
                            role="radio"
                            aria-checked={selected}
                            onClick={() => setSelectedType(t)}
                            className={`flex flex-col items-center gap-1 rounded-xl border px-3 py-3.5 shadow-sm transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2 ${
                              selected
                                ? 'border-slate-900 bg-slate-900 text-white'
                                : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                            }`}
                          >
                            <span className="flex items-center gap-2">
                              <span className={`h-2 w-2 rounded-full ${m.dot}`} />
                              <span className="text-sm font-semibold">{m.label}</span>
                            </span>
                            <span className={`text-[11px] ${selected ? 'text-slate-300' : 'text-slate-400'}`}>
                              {m.desc}
                            </span>
                          </button>
                        );
                      })}
                    </div>

                    {typeError ? (
                      <p id={`${uid}-type-error`} className="mt-1.5 flex items-center gap-1 text-xs font-medium text-red-600">
                        <AlertCircle className="h-3 w-3 flex-shrink-0" />
                        {typeError}
                      </p>
                    ) : (
                      <p className="mt-1.5 text-[11px] text-slate-400">
                        {selectedType
                          ? selectedType === 'Other'
                            ? 'The form below switches to contact fields (name, category, organization, etc.).'
                            : `This record will be added to the ${TYPE_META[selectedType].label} directory.`
                          : 'Choose where this record will be saved.'}
                      </p>
                    )}
                  </div>
                )}

                {/* ============================ OFFICER FORM (IAS / IPS) ============================ */}
                {!isContact && (
                  <>

                    {/* ------------------------ 01 Basic Information ------------------------ */}
                    <Section
                      id={`${uid}-section-1`}
                      icon={User}
                      title="Basic Information"
                      description="Identity and service details"
                      highlighted={jumpHighlight === `${uid}-section-1`}
                    >
                      <Field id={`${uid}-name`} label="Full Name" required error={nameError} className="col-span-full">
                        <input
                          id={`${uid}-name`}
                          type="text"
                          autoComplete="name"
                          value={formData.name}
                          onChange={set('name')}
                          placeholder="e.g., Dr. Pushpender Singh Poonia"
                          aria-invalid={!!nameError}
                          aria-describedby={nameError ? `${uid}-name-error` : undefined}
                          className={inputCls(!!nameError)}
                        />
                      </Field>

                      <Field id={`${uid}-officer-id`} label="Officer ID">
                        <input
                          id={`${uid}-officer-id`}
                          type="text"
                          value={formData.officer_id}
                          onChange={set('officer_id')}
                          placeholder="e.g., AS-2024-001"
                          className={inputCls()}
                        />
                      </Field>

                      <Field id={`${uid}-batch-year`} label="Batch Year" required error={batchError}>
                        <input
                          id={`${uid}-batch-year`}
                          type="number"
                          min={1900}
                          max={new Date().getFullYear() + 1}
                          value={formData.batch_year}
                          onChange={set('batch_year')}
                          placeholder="e.g., 2018"
                          aria-invalid={!!batchError}
                          aria-describedby={batchError ? `${uid}-batch-year-error` : undefined}
                          className={inputCls(!!batchError)}
                        />
                      </Field>

                      <Field id={`${uid}-cadre`} label="Cadre">
                        <div className="relative">
                          <select id={`${uid}-cadre`} value={formData.cadre} onChange={set('cadre')} className={selectCls()}>
                            <option value="">Select Cadre</option>
                            {formData.cadre && !CADRE_OPTIONS.includes(formData.cadre) && (
                              <option value={formData.cadre}>{formData.cadre}</option>
                            )}
                            {CADRE_OPTIONS.map((c) => <option key={c} value={c}>{c}</option>)}
                          </select>
                          <Chevron />
                        </div>
                      </Field>

                      <Field id={`${uid}-state`} label="State">
                        <div className="relative">
                          <select id={`${uid}-state`} value={formData.state} onChange={set('state')} className={selectCls()}>
                            <option value="">Select State</option>
                            {STATE_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
                          </select>
                          <Chevron />
                        </div>
                      </Field>

                      <Field id={`${uid}-dob`} label="Date of Birth">
                        <input
                          id={`${uid}-dob`}
                          type="date"
                          value={formData.date_of_birth}
                          onChange={set('date_of_birth')}
                          className={`${inputCls()} text-slate-600`}
                        />
                      </Field>
                    </Section>

                    {/* ------------------------ 02 Career Information ------------------------ */}
                    <Section
                      id={`${uid}-section-2`}
                      icon={Briefcase}
                      title="Career Information"
                      description="Position and professional history"
                      highlighted={jumpHighlight === `${uid}-section-2`}
                    >
                      <Field id={`${uid}-current-position`} label="Current Position" className="col-span-full">
                        <input
                          id={`${uid}-current-position`}
                          type="text"
                          value={formData.current_position}
                          onChange={set('current_position')}
                          placeholder="e.g., District Magistrate"
                          className={inputCls()}
                        />
                      </Field>

                      <Field id={`${uid}-designation`} label="Designation">
                        <input
                          id={`${uid}-designation`}
                          type="text"
                          value={formData.designation}
                          onChange={set('designation')}
                          placeholder="e.g., IAS Officer"
                          className={inputCls()}
                        />
                      </Field>

                      <Field id={`${uid}-department`} label="Department">
                        <input
                          id={`${uid}-department`}
                          type="text"
                          value={formData.department}
                          onChange={set('department')}
                          placeholder="e.g., Home Department"
                          className={inputCls()}
                        />
                      </Field>

                      <Field id={`${uid}-officer-category`} label="Officer Category" className="col-span-full">
                        <input
                          id={`${uid}-officer-category`}
                          type="text"
                          value={formData.officer_category}
                          onChange={set('officer_category')}
                          placeholder="e.g., Senior Administrative Grade"
                          className={inputCls()}
                        />
                      </Field>

                      <Field id={`${uid}-previous-postings`} label="Previous Postings" className="col-span-full">
                        <textarea
                          id={`${uid}-previous-postings`}
                          rows={2}
                          value={formData.previous_postings}
                          onChange={set('previous_postings')}
                          placeholder="List previous positions held..."
                          className={areaCls}
                        />
                      </Field>

                      <Field label="Status" className="col-span-full">
                        <StatusPillGroup
                          value={formData.status_flag}
                          onChange={(v) => setFormData((f) => ({ ...f, status_flag: v }))}
                        />
                      </Field>
                    </Section>

                    {/* ------------------------ 03 Contact Information ------------------------ */}
                    <Section
                      id={`${uid}-section-3`}
                      icon={Phone}
                      title="Contact Information"
                      description="How to reach this person"
                      highlighted={jumpHighlight === `${uid}-section-3`}
                    >
                      <Field id={`${uid}-contact-number`} label="Contact Number">
                        <input
                          id={`${uid}-contact-number`}
                          type="tel"
                          autoComplete="tel"
                          value={formData.contact_number}
                          onChange={set('contact_number')}
                          placeholder="+91 98765 43210"
                          className={inputCls()}
                        />
                      </Field>

                      <Field id={`${uid}-email`} label="Email Address">
                        <input
                          id={`${uid}-email`}
                          type="email"
                          autoComplete="email"
                          value={formData.email}
                          onChange={set('email')}
                          placeholder="officer@gov.in"
                          className={inputCls()}
                        />
                      </Field>

                      <Field id={`${uid}-address`} label="Address" className="col-span-full">
                        <textarea
                          id={`${uid}-address`}
                          rows={2}
                          value={formData.address}
                          onChange={set('address')}
                          placeholder="Official address..."
                          className={areaCls}
                        />
                      </Field>

                      <Field id={`${uid}-website`} label="Website / Profile URL" className="col-span-full">
                        <input
                          id={`${uid}-website`}
                          type="url"
                          autoComplete="url"
                          value={formData.website}
                          onChange={set('website')}
                          placeholder="https://..."
                          className={inputCls()}
                        />
                      </Field>
                    </Section>

                    {/* ------------------------ 04 Additional Information ------------------------ */}
                    <Section
                      id={`${uid}-section-4`}
                      icon={FileText}
                      title="Additional Information"
                      description="Any extra context worth noting"
                      highlighted={jumpHighlight === `${uid}-section-4`}
                    >
                      <Field id={`${uid}-notes`} label="Notes" className="col-span-full">
                        <textarea
                          id={`${uid}-notes`}
                          rows={3}
                          value={formData.notes}
                          onChange={set('notes')}
                          placeholder="Any additional information..."
                          className={areaCls}
                        />
                      </Field>
                    </Section>

                  </>
                )}

                {/* ============================ CONTACT FORM (Other) ============================ */}
                {isContact && (
                  <>

                    {/* ------------------------ 01 Basic Information ------------------------ */}
                    <Section
                      id={`${uid}-section-1`}
                      icon={User}
                      title="Basic Information"
                      description="Identity details"
                      highlighted={jumpHighlight === `${uid}-section-1`}
                    >
                      <Field id={`${uid}-c-name`} label="Full Name" required error={nameError} className="col-span-full">
                        <input
                          id={`${uid}-c-name`}
                          type="text"
                          autoComplete="name"
                          value={formData.name}
                          onChange={set('name')}
                          placeholder="e.g., John Doe"
                          aria-invalid={!!nameError}
                          aria-describedby={nameError ? `${uid}-c-name-error` : undefined}
                          className={inputCls(!!nameError)}
                        />
                      </Field>

                      <Field id={`${uid}-c-category`} label="Category">
                        <input
                          id={`${uid}-c-category`}
                          type="text"
                          value={formData.category}
                          onChange={set('category')}
                          placeholder="e.g., Media, Politician, Lawyer"
                          className={inputCls()}
                        />
                      </Field>

                      <Field id={`${uid}-c-designation`} label="Designation">
                        <input
                          id={`${uid}-c-designation`}
                          type="text"
                          value={formData.designation}
                          onChange={set('designation')}
                          placeholder="e.g., Senior Editor"
                          className={inputCls()}
                        />
                      </Field>

                      <Field id={`${uid}-c-dob`} label="Date of Birth">
                        <input
                          id={`${uid}-c-dob`}
                          type="date"
                          value={formData.date_of_birth}
                          onChange={set('date_of_birth')}
                          className={`${inputCls()} text-slate-600`}
                        />
                      </Field>
                    </Section>

                    {/* ------------------------ 02 Work Information ------------------------ */}
                    <Section
                      id={`${uid}-section-2`}
                      icon={Briefcase}
                      title="Work Information"
                      description="Organization and role"
                      highlighted={jumpHighlight === `${uid}-section-2`}
                    >
                      <Field id={`${uid}-c-organization`} label="Organization">
                        <input
                          id={`${uid}-c-organization`}
                          type="text"
                          value={formData.organization}
                          onChange={set('organization')}
                          placeholder="e.g., Ministry of External Affairs"
                          className={inputCls()}
                        />
                      </Field>

                      <Field id={`${uid}-c-company`} label="Company Name">
                        <input
                          id={`${uid}-c-company`}
                          type="text"
                          value={formData.company_name}
                          onChange={set('company_name')}
                          placeholder="e.g., Brihaspathi Technologies"
                          className={inputCls()}
                        />
                      </Field>

                      <Field id={`${uid}-c-appointment`} label="Appointment Date">
                        <input
                          id={`${uid}-c-appointment`}
                          type="date"
                          value={formData.appointment_date}
                          onChange={set('appointment_date')}
                          className={`${inputCls()} text-slate-600`}
                        />
                      </Field>

                      <Field label="Status" className="col-span-full">
                        <StatusPillGroup
                          value={formData.status}
                          onChange={(v) => setFormData((f) => ({ ...f, status: v }))}
                        />
                      </Field>
                    </Section>

                    {/* ------------------------ 03 Contact Information ------------------------ */}
                    <Section
                      id={`${uid}-section-3`}
                      icon={Phone}
                      title="Contact Information"
                      description="How to reach this contact"
                      highlighted={jumpHighlight === `${uid}-section-3`}
                    >
                      <Field id={`${uid}-c-phone`} label="Contact Number">
                        <input
                          id={`${uid}-c-phone`}
                          type="tel"
                          autoComplete="tel"
                          value={formData.contact_number}
                          onChange={set('contact_number')}
                          placeholder="+91 98765 43210"
                          className={inputCls()}
                        />
                      </Field>

                      <Field id={`${uid}-c-email`} label="Email Address">
                        <input
                          id={`${uid}-c-email`}
                          type="email"
                          autoComplete="email"
                          value={formData.email}
                          onChange={set('email')}
                          placeholder="contact@example.com"
                          className={inputCls()}
                        />
                      </Field>

                      <Field id={`${uid}-c-address`} label="Address" className="col-span-full">
                        <textarea
                          id={`${uid}-c-address`}
                          rows={2}
                          value={formData.address}
                          onChange={set('address')}
                          placeholder="Office or postal address..."
                          className={areaCls}
                        />
                      </Field>

                      <Field id={`${uid}-c-website`} label="Website" className="col-span-full">
                        <input
                          id={`${uid}-c-website`}
                          type="url"
                          autoComplete="url"
                          value={formData.website}
                          onChange={set('website')}
                          placeholder="https://..."
                          className={inputCls()}
                        />
                      </Field>
                    </Section>

                    {/* ------------------------ 04 Additional Information ------------------------ */}
                    <Section
                      id={`${uid}-section-4`}
                      icon={FileText}
                      title="Additional Information"
                      description="Social profiles, photo and notes"
                      highlighted={jumpHighlight === `${uid}-section-4`}
                    >
                      <Field id={`${uid}-c-twitter`} label="Twitter (X)">
                        <input
                          id={`${uid}-c-twitter`}
                          type="url"
                          value={formData.twitter_x}
                          onChange={set('twitter_x')}
                          placeholder="https://x.com/username"
                          className={inputCls()}
                        />
                      </Field>

                      <Field id={`${uid}-c-linkedin`} label="LinkedIn">
                        <input
                          id={`${uid}-c-linkedin`}
                          type="url"
                          value={formData.linkedin}
                          onChange={set('linkedin')}
                          placeholder="https://linkedin.com/in/username"
                          className={inputCls()}
                        />
                      </Field>

                      <Field id={`${uid}-c-instagram`} label="Instagram">
                        <input
                          id={`${uid}-c-instagram`}
                          type="url"
                          value={formData.instagram}
                          onChange={set('instagram')}
                          placeholder="https://instagram.com/username"
                          className={inputCls()}
                        />
                      </Field>

                      <Field id={`${uid}-c-photo`} label="Photo URL" className="col-span-full">
                        <input
                          id={`${uid}-c-photo`}
                          type="url"
                          value={formData.photo_url}
                          onChange={set('photo_url')}
                          placeholder="https://..."
                          className={inputCls()}
                        />
                      </Field>

                      <Field id={`${uid}-c-remarks`} label="Remarks" className="col-span-full">
                        <textarea
                          id={`${uid}-c-remarks`}
                          rows={3}
                          value={formData.remarks}
                          onChange={set('remarks')}
                          placeholder="Any additional notes..."
                          className={areaCls}
                        />
                      </Field>
                    </Section>

                  </>
                )}

              </div>
            </div>
          </form>
        </div>

        {/* ------------------------------- Footer ------------------------------- */}
        <footer className="flex-shrink-0 border-t border-slate-200 bg-white px-6 py-4 lg:px-8">

          {(resetArmed || notice) && (
            <div
              role="status"
              className={`mb-3 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border px-3.5 py-2.5 animate-in fade-in slide-in-from-bottom-1 duration-200 ${
                resetArmed ? 'border-amber-200 bg-amber-50' : 'border-emerald-200 bg-emerald-50'
              }`}
            >
              <p className={`text-xs font-medium ${resetArmed ? 'text-amber-800' : 'text-emerald-700'}`}>
                {resetArmed ? 'Clear all fields? This cannot be undone.' : notice}
              </p>
              {resetArmed && (
                <span className="flex items-center gap-1 text-[11px] text-amber-700">
                  Press <Kbd>Alt</Kbd><Kbd>R</Kbd> again to confirm · <Kbd>Esc</Kbd> to cancel
                </span>
              )}
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
            <div className="hidden flex-wrap items-center gap-x-4 gap-y-1 text-slate-400 lg:flex">
              <Shortcut keys={[modKey, '↵']} label="Save" />
              {isGeneralMode && <Shortcut keys={['Alt', 'T']} label="Record type" />}
              <Shortcut keys={['Alt', '1–4']} label="Jump to section" />
              <Shortcut keys={['Alt', 'R']} label={isEditMode ? 'Revert' : 'Clear'} />
              <Shortcut keys={['Esc']} label="Close" />
            </div>

            <div className="ml-auto flex items-center gap-2.5">
              <button
                type="button"
                onClick={onClose}
                disabled={loading}
                className="rounded-lg px-4 py-2.5 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                form="create-officer-form"
                disabled={loading || !auth.isValid}
                className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-slate-800 hover:shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none"
              >
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {isEditMode ? 'Saving Changes...' : 'Saving...'}
                  </>
                ) : (
                  <>
                    <Save className="h-4 w-4" />
                    {isEditMode
                      ? 'Save Changes'
                      : !activeType ? 'Create Record' : isContact ? 'Create Contact' : 'Create Officer'}
                  </>
                )}
              </button>
            </div>
          </div>
        </footer>

      </div>
    </>
  );
}