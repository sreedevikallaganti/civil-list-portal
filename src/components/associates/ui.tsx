'use client';

/* Small building blocks shared by the Associates screens. */

import { useEffect, useId, type ReactNode } from 'react';
import { X } from 'lucide-react';
import type { AssociateField } from '@/lib/associates';

export const btn = {
  /* pills, like the Officers directory and Meetings */
  primary: 'inline-flex items-center justify-center gap-2 rounded-full bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-slate-900/10 transition-all duration-200 hover:-translate-y-0.5 hover:bg-slate-800 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0',
  violet: 'inline-flex items-center justify-center gap-2 rounded-full bg-violet-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-violet-600/20 transition-all duration-200 hover:-translate-y-0.5 hover:bg-violet-700 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0',
  secondary: 'inline-flex items-center justify-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:border-violet-200 hover:bg-violet-50 hover:text-violet-700 disabled:cursor-not-allowed disabled:opacity-50',
  ghost: 'inline-flex items-center justify-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800 disabled:opacity-40',
  danger: 'inline-flex items-center justify-center gap-2 rounded-full bg-rose-50 px-4 py-2.5 text-sm font-semibold text-rose-600 transition-colors hover:bg-rose-100 disabled:opacity-50',
  icon: 'inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 disabled:opacity-30',
};

export const inputCls = 'w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-violet-400 focus:ring-4 focus:ring-violet-100 disabled:bg-slate-50';

/** Escape closes whatever is on top. */
export function useEscape(onClose: () => void, active = true) {
  useEffect(() => {
    if (!active) return;
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose, active]);
}

/** A panel that slides in from the right (full screen on phones). */
export function Drawer({
  open, onClose, title, subtitle, icon, children, footer,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  subtitle?: ReactNode;
  icon?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const titleId = useId();
  useEscape(onClose, open);
  if (!open) return null;
  return (
    <>
      <div className="fixed inset-0 z-[70] bg-slate-900/30 backdrop-blur-[2px]" onClick={onClose} aria-hidden />
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={`fixed inset-y-0 right-0 z-[71] flex w-full flex-col bg-white shadow-2xl animate-in slide-in-from-right duration-200 sm:max-w-xl lg:max-w-2xl`}
      >
        <header className="flex items-start gap-3 border-b border-slate-100 px-5 py-4">
          {icon && <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-50 text-violet-600">{icon}</span>}
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="truncate text-lg font-bold text-slate-900">{title}</h2>
            {subtitle && <p className="mt-0.5 text-sm text-slate-500">{subtitle}</p>}
          </div>
          <button type="button" onClick={onClose} className={btn.icon} aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </header>
        <div className="flex-1 overflow-y-auto px-5 py-5">{children}</div>
        {footer && <footer className="flex items-center gap-2 border-t border-slate-100 bg-slate-50/60 px-5 py-3.5">{footer}</footer>}
      </section>
    </>
  );
}

/** The input that fits a field's type. Values travel as strings; the caller converts. */
export function FieldControl({
  field, id, value, onChange, invalid,
}: {
  field: AssociateField;
  id: string;
  value: string;
  onChange: (v: string) => void;
  invalid?: boolean;
}) {
  const cls = `${inputCls} ${invalid ? 'border-rose-300 focus:border-rose-400 focus:ring-rose-100' : ''}`;
  const common = { id, value, 'aria-invalid': invalid || undefined, className: cls };
  switch (field.type) {
    case 'longtext':
      return <textarea {...common} rows={3} onChange={(e) => onChange(e.target.value)} className={`${cls} resize-y`} />;
    case 'date':
      return <input {...common} type="date" onChange={(e) => onChange(e.target.value)} />;
    case 'number':
      return <input {...common} type="text" inputMode="decimal" onChange={(e) => onChange(e.target.value)} />;
    case 'email':
      return <input {...common} type="email" autoComplete="off" placeholder="name@example.com" onChange={(e) => onChange(e.target.value)} />;
    case 'phone':
      return <input {...common} type="tel" autoComplete="off" placeholder="+91 98765 43210" onChange={(e) => onChange(e.target.value)} />;
    case 'url':
      return <input {...common} type="url" placeholder="https://" onChange={(e) => onChange(e.target.value)} />;
    case 'select': {
      const choices = field.options?.choices || [];
      const extra = value && !choices.some((c) => c === value) ? [value] : [];
      return (
        <select {...common} onChange={(e) => onChange(e.target.value)}>
          <option value="">—</option>
          {[...choices, ...extra].map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      );
    }
    default:
      return <input {...common} type="text" onChange={(e) => onChange(e.target.value)} />;
  }
}

/** Two-letter initials for the avatar. */
export function initials(name: string) {
  const parts = name.replace(/\b(dr|mr|mrs|ms|shri|smt|sri|prof)\b\.?/gi, '').trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] || '?') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

const AVATAR = ['bg-violet-100 text-violet-700', 'bg-sky-100 text-sky-700', 'bg-emerald-100 text-emerald-700',
  'bg-amber-100 text-amber-800', 'bg-rose-100 text-rose-700', 'bg-indigo-100 text-indigo-700'];

export function Avatar({ name, size = 'md' }: { name: string; size?: 'md' | 'lg' }) {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return (
    <span className={`flex shrink-0 items-center justify-center rounded-full font-bold ${AVATAR[h % AVATAR.length]} ${size === 'lg' ? 'h-12 w-12 text-base' : 'h-9 w-9 text-xs'}`}>
      {initials(name)}
    </span>
  );
}
