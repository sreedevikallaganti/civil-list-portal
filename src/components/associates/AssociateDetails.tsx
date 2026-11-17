'use client';

/* "Details ▾" under an associate in the meeting participant pickers: every filled-in field, unfolded on demand. */

import { ChevronDown } from 'lucide-react';

export default function AssociateDetails({ id, details, open, onToggle }: {
  id: string;
  details: { label: string; value: string }[];
  open: boolean;
  /** opens this one (only one is open at a time), or closes it */
  onToggle: (id: string | null) => void;
}) {
  return (
    <span className="block">
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onToggle(open ? null : id); }}
        aria-expanded={open}
        className="mt-0.5 inline-flex items-center gap-0.5 text-[11px] font-semibold text-indigo-600 hover:text-indigo-800"
      >
        {open ? 'Hide details' : 'Details'}
        <ChevronDown className={`h-3 w-3 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <span className="mt-1.5 block rounded-xl border border-indigo-100 bg-white/80 px-2.5 py-1.5">
          {details.map((d) => (
            <span key={d.label} className="flex gap-2 py-0.5 text-[11px]">
              <span className="w-24 shrink-0 text-slate-400">{d.label}</span>
              <span className="min-w-0 break-words font-medium text-slate-700">{d.value}</span>
            </span>
          ))}
        </span>
      )}
    </span>
  );
}
