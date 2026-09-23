'use client';

import { useEffect, useId, useRef, useState } from 'react';
import {
  X, Save, Loader2, AlertCircle, ChevronDown, UserPlus, Pencil,
  User, Briefcase, Shield, Building2, Phone, FileText, LogIn, LogOut, Check,
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
  IAS: {
    label: 'IAS', dot: 'bg-sky-500', collection: 'ias_officers', desc: 'Indian Administrative Service',
    gradient: 'from-sky-600 via-blue-700 to-indigo-800', glow: 'shadow-blue-700/25',
    iconTint: 'bg-sky-100 text-sky-600 ring-sky-600/10', cardIcon: Briefcase,
    cardSelected: 'border-sky-300 bg-gradient-to-br from-sky-50/90 via-white to-white ring-2 ring-sky-400/40',
    checkBg: 'bg-sky-500',
    button: 'from-sky-500 to-blue-600', buttonGlow: 'shadow-blue-600/25',
  },
  IPS: {
    label: 'IPS', dot: 'bg-indigo-500', collection: 'ips_officers', desc: 'Indian Police Service',
    gradient: 'from-indigo-600 via-violet-700 to-purple-800', glow: 'shadow-indigo-700/25',
    iconTint: 'bg-indigo-100 text-indigo-600 ring-indigo-600/10', cardIcon: Shield,
    cardSelected: 'border-indigo-300 bg-gradient-to-br from-indigo-50/90 via-white to-white ring-2 ring-indigo-400/40',
    checkBg: 'bg-indigo-500',
    button: 'from-indigo-500 to-violet-600', buttonGlow: 'shadow-indigo-600/25',
  },
  Other: {
    label: 'Contact', dot: 'bg-amber-500', collection: 'other_contacts', desc: 'External / other contact',
    gradient: 'from-amber-500 via-orange-500 to-rose-600', glow: 'shadow-amber-600/25',
    iconTint: 'bg-amber-100 text-amber-600 ring-amber-600/10', cardIcon: Building2,
    cardSelected: 'border-amber-300 bg-gradient-to-br from-amber-50/90 via-white to-white ring-2 ring-amber-400/40',
    checkBg: 'bg-amber-500',
    button: 'from-amber-500 to-orange-600', buttonGlow: 'shadow-amber-600/25',
  },
} as const;

/* Neutral look while no type is chosen yet (general mode) */
const FALLBACK_META = {
  gradient: 'from-slate-800 via-slate-900 to-indigo-950',
  button: 'from-slate-800 to-slate-900', buttonGlow: 'shadow-slate-900/25',
};

const CADRE_OPTIONS = ['Andhra Pradesh', 'Telangana', 'Tamil Nadu', 'Karnataka', 'Kerala', 'Maharashtra', 'Gujarat', 'Rajasthan', 'Madhya Pradesh', 'Uttar Pradesh', 'Bihar', 'West Bengal', 'Odisha', 'Punjab', 'Haryana', 'Delhi', 'Central', 'Other'];
const STATE_OPTIONS = ['Andhra Pradesh', 'Telangana', 'Tamil Nadu', 'Karnataka', 'Kerala', 'Maharashtra', 'Gujarat', 'Rajasthan', 'Madhya Pradesh', 'Uttar Pradesh', 'Bihar', 'West Bengal', 'Odisha', 'Punjab', 'Haryana', 'Delhi', 'Other'];

/* Each status gets its own soft selected tint */
const STATUS_OPTIONS = [
  { value: 'Active',    dot: 'bg-emerald-500', selected: 'border-emerald-400 bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-500/30' },
  { value: 'Retired',   dot: 'bg-slate-400',   selected: 'border-slate-400 bg-slate-100 text-slate-700 ring-1 ring-inset ring-slate-500/25' },
  { value: 'On Leave',  dot: 'bg-amber-500',   selected: 'border-amber-400 bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-500/30' },
  { value: 'Suspended', dot: 'bg-rose-500',    selected: 'border-rose-400 bg-rose-50 text-rose-700 ring-1 ring-inset ring-rose-500/30' },
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

/* ------------------------------ Panel styles ------------------------------ */

function PanelStyles() {
  return (
    <style>{`
      @keyframes cofPanel   { from { transform: translateX(100%); } to { transform: translateX(0); } }
      @keyframes cofOverlay { from { opacity: 0; } to { opacity: 1; } }
      @keyframes cofFadeUp  { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
      @keyframes cofFadeIn  { from { opacity: 0; } to { opacity: 1; } }
      @keyframes cofPop     { from { opacity: 0; transform: scale(.9); } to { opacity: 1; transform: scale(1); } }
      @keyframes cofSlideUp { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
      @keyframes cofPulse   { 0%,100% { box-shadow: 0 0 0 0 rgba(14,165,233,.22); } 50% { box-shadow: 0 0 0 7px rgba(14,165,233,0); } }

      .cof-panel    { animation: cofPanel .45s cubic-bezier(.32,.72,0,1) both; }
      .cof-overlay  { animation: cofOverlay .3s ease both; }
      .cof-fade-up  { opacity: 0; animation: cofFadeUp .55s cubic-bezier(.22,1,.36,1) forwards; }
      .cof-fade-in  { opacity: 0; animation: cofFadeIn .3s ease forwards; }
      .cof-pop      { opacity: 0; animation: cofPop .45s cubic-bezier(.34,1.56,.64,1) forwards; }
      .cof-slide-up { opacity: 0; animation: cofSlideUp .25s ease forwards; }
      .cof-highlight{ animation: cofPulse 1.2s ease-in-out 1; }

      @media (prefers-reduced-motion: reduce) {
        .cof-panel, .cof-overlay, .cof-fade-up, .cof-fade-in, .cof-pop, .cof-slide-up, .cof-highlight { animation: none; opacity: 1; }
      }
    `}</style>
  );
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
          <span className="ml-0.5 text-rose-500" aria-hidden="true">*</span>
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
        <p id={id ? `${id}-error` : undefined} className="cof-fade-in mt-1.5 flex items-center gap-1 text-xs font-medium text-rose-600">
          <AlertCircle className="h-3 w-3 flex-shrink-0" />
          {error}
        </p>
      )}
    </div>
  );
}

function Section({
  id, icon: Icon, title, description, step, accent, highlighted = false, delay = 0, children,
}: {
  id?: string;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  step: number;
  /** Soft tint classes for the icon tile, e.g. "bg-sky-100 text-sky-600 ring-sky-600/10" */
  accent: string;
  highlighted?: boolean;
  delay?: number;
  children: React.ReactNode;
}) {
  return (
    <>
      <div
        id={id}
        tabIndex={-1}
        className="cof-fade-up col-span-full scroll-mt-6 pt-2 first:pt-0 focus:outline-none"
        style={{ animationDelay: `${delay}ms` }}
      >
        <div
          className={`-mx-3 flex items-center gap-3 rounded-xl px-3 py-2.5 ring-1 transition-all duration-300 ${
            highlighted ? 'cof-highlight bg-sky-50/90 ring-sky-200' : 'bg-transparent ring-transparent'
          }`}
        >
          <span
            className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl shadow-sm ring-1 ring-inset transition-all duration-300 ${
              highlighted ? 'scale-105 bg-sky-600 text-white ring-sky-600' : accent
            }`}
          >
            <Icon className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <div className="flex items-baseline gap-2">
              <span className="text-[10px] font-bold tracking-widest text-slate-300">{String(step).padStart(2, '0')}</span>
              <h3 className="text-sm font-semibold leading-none text-slate-900">{title}</h3>
            </div>
            <p className="mt-1 text-xs leading-none text-slate-400">{description}</p>
          </div>
          <div className="ml-2 hidden h-px flex-1 bg-gradient-to-r from-slate-200 to-transparent sm:block" />
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
                  ? `${s.selected} -translate-y-px`
                  : 'border-slate-200 bg-white text-slate-600 hover:-translate-y-0.5 hover:border-slate-300 hover:text-slate-900 hover:shadow-sm'
              }`}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
              {s.value}
              {selected && <Check className="h-3 w-3" strokeWidth={3} />}
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
  const headerMeta = selectedMeta ?? FALLBACK_META;
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

  /* Visual only — % of relevant fields that are filled (drives the header progress bar) */
  const trackedKeys: (keyof FormShape)[] = activeType
    ? (isContact ? CONTACT_KEYS : OFFICER_KEYS)
    : (Object.keys(INITIAL_ALL) as (keyof FormShape)[]);
  const completion = Math.round(
    (trackedKeys.filter((k) => (formData[k] || '').trim() !== '').length / trackedKeys.length) * 100
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
    `w-full rounded-xl border bg-white px-3.5 py-2.5 text-sm text-slate-900 shadow-sm outline-none transition-all duration-200 placeholder:text-slate-400 hover:border-slate-300 focus:ring-4 ${
      invalid
        ? 'border-rose-300 bg-rose-50/40 focus:border-rose-400 focus:ring-rose-500/10'
        : 'border-slate-200 focus:border-sky-400 focus:ring-sky-500/10'
    }`;

  const selectCls = (invalid = false) => `${inputCls(invalid)} cursor-pointer appearance-none pr-9`;
  const areaCls = `${inputCls()} resize-none leading-relaxed`;

  const Chevron = () => (
    <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
  );

  /* Section accents (soft tints) + stagger delays */
  const S1 = { accent: 'bg-sky-100 text-sky-600 ring-sky-600/10',     delay: 120 };
  const S2 = { accent: 'bg-indigo-100 text-indigo-600 ring-indigo-600/10', delay: 190 };
  const S3 = { accent: 'bg-emerald-100 text-emerald-600 ring-emerald-600/10', delay: 260 };
  const S4 = { accent: 'bg-amber-100 text-amber-600 ring-amber-600/10', delay: 330 };

  /* --------------------------------- Render --------------------------------- */

  return (
    <>
      <PanelStyles />

      {/* Backdrop */}
      <div
        aria-hidden="true"
        className="cof-overlay fixed inset-0 z-40 bg-slate-900/40 backdrop-blur-[2px]"
        onClick={() => !loading && onClose()}
      />

      {/* Off-Canvas Panel */}
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${uid}-heading`}
        tabIndex={-1}
        className="c-panel fixed right-0 top-0 z-[80] flex h-full w-full flex-col bg-slate-50 shadow-2xl sm:max-w-xl lg:max-w-2xl"
      >

        {/* ------------------------------- Header ------------------------------- */}
        <header className={`relative flex-shrink-0 overflow-hidden bg-gradient-to-br ${headerMeta.gradient} px-6 py-5 lg:px-8`}>
          {/* Decorative light */}
          <div className="pointer-events-none absolute -top-28 -right-12 h-72 w-72 rounded-full bg-white/10 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-24 -left-16 h-56 w-56 rounded-full bg-white/5 blur-3xl" />
          <div className="pointer-events-none absolute -top-12 left-1/3 h-32 w-32 rounded-full border border-white/10" />

          <div className="relative flex items-start justify-between gap-4">
            <div className="flex min-w-0 items-start gap-3.5">
              <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-2xl bg-white/10 ring-1 ring-inset ring-white/20 backdrop-blur-sm transition-transform duration-300 hover:scale-105">
                {isEditMode ? <Pencil className="h-5 w-5 text-white" /> : <UserPlus className="h-5 w-5 text-white" />}
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2.5">
                  <h2 id={`${uid}-heading`} className="text-lg font-semibold tracking-tight text-white">
                    {heading}
                  </h2>
                  {selectedMeta ? (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-2.5 py-0.5 text-[11px] font-semibold text-white ring-1 ring-inset ring-white/20 backdrop-blur-sm">
                      <span className={`h-1.5 w-1.5 rounded-full ${selectedMeta.dot}`} />
                      {selectedMeta.label}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-400/15 px-2.5 py-0.5 text-[11px] font-semibold text-amber-200 ring-1 ring-inset ring-amber-300/25 backdrop-blur-sm">
                      <span className="h-1.5 w-1.5 rounded-full bg-amber-300" />
                      Select type
                    </span>
                  )}
                </div>
                <p className="mt-1 text-[13px] text-white/60">
                  Fields marked with <span className="font-medium text-rose-300">*</span> are required
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              aria-label="Close panel"
              className="-mr-2 -mt-1 flex-shrink-0 rounded-lg p-2 text-white/60 transition-all duration-200 hover:rotate-90 hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Animated completion progress — purely visual */}
          <div className="relative mt-4 flex items-center gap-3" aria-hidden="true">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/15">
              <div
                className="h-full rounded-full bg-gradient-to-r from-white/95 to-white/60 transition-all duration-500 ease-out"
                style={{ width: `${completion}%` }}
              />
            </div>
            <span className="text-[11px] font-semibold tabular-nums text-white/70">{completion}% filled</span>
          </div>
        </header>

        {/* ----------------------------- Form Body ----------------------------- */}
        <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto bg-gradient-to-b from-slate-50 via-slate-50/60 to-blue-50/30">
          <form id="create-officer-form" onSubmit={handleSubmit}>
            <div className="px-6 py-6 lg:px-8 lg:py-7">
              <div className="grid grid-cols-1 gap-x-5 gap-y-4 md:grid-cols-2">

                {/* Error banner */}
                {error && (
                  <div
                    role="alert"
                    className="cof-fade-in col-span-full flex items-start gap-2.5 rounded-xl border border-rose-200 bg-rose-50/90 px-4 py-3 ring-1 ring-inset ring-rose-600/10"
                  >
                    <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-rose-500" />
                    <p className="text-[13px] leading-relaxed text-rose-700">{error}</p>
                  </div>
                )}

                {/* Auth status */}
                <div
                  role="status"
                  className={`cof-fade-up col-span-full flex flex-wrap items-center gap-2.5 rounded-xl border px-4 py-3 ${
                    auth.isValid
                      ? 'border-emerald-200/80 bg-emerald-50/80 ring-1 ring-inset ring-emerald-600/10'
                      : 'border-amber-200/80 bg-amber-50/80 ring-1 ring-inset ring-amber-600/10'
                  }`}
                  style={{ animationDelay: '60ms' }}
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
                        className="ml-auto inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-slate-500 transition-colors hover:bg-white hover:text-slate-700"
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
                  <div className="cof-fade-up col-span-full" style={{ animationDelay: '100ms' }}>
                    <span id={`${uid}-type-label`} className="mb-2 flex items-center justify-between text-[13px] font-medium text-slate-700">
                      <span className="flex items-center gap-0.5">
                        Record Type
                        <span className="ml-0.5 text-rose-500" aria-hidden="true">*</span>
                        <span className="sr-only"> (required)</span>
                      </span>
                      <span className="hidden items-center gap-1 text-[11px] font-normal text-slate-400 sm:flex">
                        <Kbd>Alt</Kbd><Kbd>T</Kbd> focus
                      </span>
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
                      className="grid grid-cols-1 gap-2.5 sm:grid-cols-3"
                    >
                      {TYPE_KEYS.map((t, i) => {
                        const m = TYPE_META[t];
                        const TypeIcon = m.cardIcon;
                        const selected = selectedType === t;
                        return (
                          <button
                            key={t}
                            id={`${uid}-type-${t}`}
                            type="button"
                            role="radio"
                            aria-checked={selected}
                            onClick={() => setSelectedType(t)}
                            style={{ animationDelay: `${140 + i * 70}ms` }}
                            className={`cof-fade-up group relative flex flex-col items-center gap-1.5 rounded-xl border px-3 py-4 shadow-sm transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2 ${
                              selected
                                ? `${m.cardSelected} -translate-y-0.5 shadow-md`
                                : 'border-slate-200 bg-white text-slate-700 hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-sm'
                            }`}
                          >
                            {selected && (
                              <span className={`cof-pop absolute right-2 top-2 flex h-4.5 w-4.5 h-[18px] w-[18px] items-center justify-center rounded-full ${m.checkBg}`}>
                                <Check className="h-2.5 w-2.5 text-white" strokeWidth={3} />
                              </span>
                            )}
                            <span className={`flex h-9 w-9 items-center justify-center rounded-xl ring-1 ring-inset ${m.iconTint} transition-transform duration-200 group-hover:scale-110`}>
                              <TypeIcon className="h-4 w-4" />
                            </span>
                            <span className="text-sm font-semibold">{m.label}</span>
                            <span className={`text-center text-[11px] leading-tight ${selected ? 'text-slate-500' : 'text-slate-400'}`}>
                              {m.desc}
                            </span>
                          </button>
                        );
                      })}
                    </div>

                    {typeError ? (
                      <p id={`${uid}-type-error`} className="cof-fade-in mt-1.5 flex items-center gap-1 text-xs font-medium text-rose-600">
                        <AlertCircle className="h-3 w-3 flex-shrink-0" />
                        {typeError}
                      </p>
                    ) : (
                      <p className="mt-2 text-[11px] text-slate-400">
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
                      id={`${uid}-section-1`} icon={User} step={1} accent={S1.accent} delay={S1.delay}
                      title="Basic Information" description="Identity and service details"
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
                      id={`${uid}-section-2`} icon={Briefcase} step={2} accent={S2.accent} delay={S2.delay}
                      title="Career Information" description="Position and professional history"
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
                      id={`${uid}-section-3`} icon={Phone} step={3} accent={S3.accent} delay={S3.delay}
                      title="Contact Information" description="How to reach this person"
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
                      id={`${uid}-section-4`} icon={FileText} step={4} accent={S4.accent} delay={S4.delay}
                      title="Additional Information" description="Any extra context worth noting"
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
                      id={`${uid}-section-1`} icon={User} step={1} accent={S1.accent} delay={S1.delay}
                      title="Basic Information" description="Identity details"
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
                      id={`${uid}-section-2`} icon={Briefcase} step={2} accent={S2.accent} delay={S2.delay}
                      title="Work Information" description="Organization and role"
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
                      id={`${uid}-section-3`} icon={Phone} step={3} accent={S3.accent} delay={S3.delay}
                      title="Contact Information" description="How to reach this contact"
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
                      id={`${uid}-section-4`} icon={FileText} step={4} accent={S4.accent} delay={S4.delay}
                      title="Additional Information" description="Social profiles, photo and notes"
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
        <footer className="flex-shrink-0 border-t border-slate-200/80 bg-white/95 px-6 py-4 lg:px-8">

          {(resetArmed || notice) && (
            <div
              role="status"
              className={`cof-slide-up mb-3 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xl border px-3.5 py-2.5 ${
                resetArmed
                  ? 'border-amber-200 bg-amber-50 ring-1 ring-inset ring-amber-600/10'
                  : 'border-emerald-200 bg-emerald-50 ring-1 ring-inset ring-emerald-600/10'
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
                className="rounded-xl px-4 py-2.5 text-sm font-medium text-slate-600 transition-all duration-200 hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2 active:scale-[.98] disabled:cursor-not-allowed disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                form="create-officer-form"
                disabled={loading || !auth.isValid}
                className={`inline-flex items-center gap-2 rounded-xl bg-gradient-to-r ${headerMeta.button} px-5 py-2.5 text-sm font-semibold text-white shadow-lg ${headerMeta.buttonGlow} ring-1 ring-inset ring-white/20 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2 active:translate-y-0 active:scale-[.98] disabled:cursor-not-allowed disabled:opacity-50 disabled:translate-y-0 disabled:shadow-none`}
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