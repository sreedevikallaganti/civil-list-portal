'use client';

/* The frame of every Associates screen — the same look as the Officers directory and Meetings:
   gradient background, one white card with a slim app bar (title, count, date, actions), the People / Imports
   tabs, coloured stat cards (one colour per meaning) and white section cards. */

import type { ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Crown, FileSpreadsheet, Users, type LucideIcon } from 'lucide-react';

function FrameStyles() {
  return (
    <style>{`
      @keyframes ascFadeUp { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: translateY(0); } }
      @keyframes ascBlobA { 0%,100% { transform: translate(0,0) scale(1); } 50% { transform: translate(34px,26px) scale(1.06); } }
      @keyframes ascBlobB { 0%,100% { transform: translate(0,0) scale(1); } 50% { transform: translate(-28px,20px) scale(1.05); } }
      .asc-fade-up { opacity: 0; animation: ascFadeUp .6s cubic-bezier(.22,1,.36,1) forwards; }
      .asc-blob-a { animation: ascBlobA 18s ease-in-out infinite; }
      .asc-blob-b { animation: ascBlobB 22s ease-in-out infinite; }
      @media (prefers-reduced-motion: reduce) { .asc-fade-up { animation: none; opacity: 1; } .asc-blob-a, .asc-blob-b { animation: none; } }
    `}</style>
  );
}

const TABS = [
  { href: '/associates', label: 'People', icon: Users },
  { href: '/associates/imports', label: 'Imports', icon: FileSpreadsheet },
];

export default function AssociatesFrame({ count, countLabel, actions, draftCount = 0, children }: {
  /** shown in the chip next to the title */
  count?: number | string;
  /** a short line under the title (defaults to today's date) */
  countLabel?: string;
  actions?: ReactNode;
  /** imports waiting for review — a badge on the Imports tab */
  draftCount?: number;
  children: ReactNode;
}) {
  const pathname = usePathname();
  return (
    <div className="relative min-h-screen bg-gradient-to-br from-indigo-200 via-violet-100 to-purple-200 p-0 sm:p-5 lg:p-8">
      <FrameStyles />
      <div className="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden="true">
        <div className="asc-blob-a absolute -left-32 -top-32 h-96 w-96 rounded-full bg-violet-300/40 blur-3xl" />
        <div className="asc-blob-b absolute -right-32 top-1/4 h-96 w-96 rounded-full bg-sky-300/30 blur-3xl" />
      </div>

      <div className="relative mx-auto max-w-[1500px] overflow-hidden bg-white sm:rounded-[1.75rem] sm:shadow-2xl sm:shadow-violet-300/40 sm:ring-1 sm:ring-white/70">
        {/* app bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 bg-white px-4 py-3.5 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-900 text-white shadow-sm">
              <Crown className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="truncate text-sm font-bold text-slate-900">Associates</h1>
                {count !== undefined && (
                  <span className="rounded-full bg-violet-50 px-2 py-0.5 text-[10px] font-bold tabular-nums text-violet-600 ring-1 ring-inset ring-violet-500/15">{count}</span>
                )}
              </div>
              <p className="truncate text-[11px] text-slate-400">
                {countLabel || new Date().toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'long' })}
              </p>
            </div>
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </div>

        {/* content */}
        <div className="space-y-6 bg-[#f7f6fd] p-3 sm:p-6 lg:p-7">
          <nav className="asc-fade-up inline-flex gap-1 rounded-full bg-white p-1 shadow-sm ring-1 ring-slate-100" aria-label="Associates">
            {TABS.map(({ href, label, icon: Icon }) => {
              const active = pathname === href || (href !== '/associates' && pathname.startsWith(href));
              return (
                <Link key={href} href={href} aria-current={active ? 'page' : undefined}
                  className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
                    active ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'
                  }`}>
                  <Icon className="h-4 w-4" /> {label}
                  {href === '/associates/imports' && draftCount > 0 && (
                    <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${active ? 'bg-white/20 text-white' : 'bg-violet-50 text-violet-700'}`}>{draftCount}</span>
                  )}
                </Link>
              );
            })}
          </nav>
          {children}
        </div>
      </div>
    </div>
  );
}

/* ── stat cards: one colour per meaning, like the Officers directory ── */

export const TONES = {
  violet: { card: 'from-violet-100 to-purple-100', icon: 'text-violet-600', bar: 'from-violet-400 to-purple-500' },
  sky: { card: 'from-sky-100 to-blue-100', icon: 'text-sky-600', bar: 'from-sky-400 to-blue-500' },
  indigo: { card: 'from-indigo-100 to-violet-100', icon: 'text-indigo-600', bar: 'from-indigo-400 to-violet-500' },
  emerald: { card: 'from-emerald-100 to-teal-100', icon: 'text-emerald-600', bar: 'from-emerald-400 to-teal-500' },
  rose: { card: 'from-rose-100 to-pink-100', icon: 'text-rose-600', bar: 'from-rose-400 to-pink-500' },
  amber: { card: 'from-amber-100 to-orange-100', icon: 'text-amber-600', bar: 'from-amber-400 to-orange-500' },
} as const;
export type Tone = keyof typeof TONES;

export function StatCard({ label, value, caption, icon: Icon, tone, pct, active, onClick, delay = 0 }: {
  label: string;
  value: number | string;
  caption: string;
  icon: LucideIcon;
  tone: Tone;
  /** 0–100: the bar at the bottom (share of the total) */
  pct?: number;
  active?: boolean;
  onClick?: () => void;
  delay?: number;
}) {
  const t = TONES[tone];
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag
      {...(onClick && { type: 'button' as const, onClick, 'aria-pressed': !!active })}
      style={{ animationDelay: `${delay}ms` }}
      className={`asc-fade-up group relative overflow-hidden rounded-3xl bg-gradient-to-br p-5 text-left ring-1 ring-white/70 transition-all duration-300 ${t.card} ${
        onClick ? 'hover:-translate-y-1 hover:shadow-lg hover:shadow-slate-900/[0.08] active:scale-[0.98]' : ''
      } ${active ? 'shadow-md shadow-slate-900/10 ring-2 ring-slate-900/10' : ''}`}
    >
      <span aria-hidden className="pointer-events-none absolute -right-6 -top-6 h-20 w-20 rounded-full bg-white/50 transition-transform duration-300 group-hover:scale-125" />
      <div className="relative flex items-start justify-between gap-3">
        <p className="pt-1.5 text-sm font-semibold text-slate-600">{label}</p>
        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/80 shadow-sm transition-transform duration-300 group-hover:scale-110 ${t.icon}`}>
          <Icon className="h-5 w-5" />
        </span>
      </div>
      <p className="relative mt-3 text-[2rem] font-extrabold leading-none tracking-tight text-slate-900 tabular-nums">{value}</p>
      <p className="relative mt-1.5 text-xs font-medium text-slate-500/80">{caption}</p>
      <div className="relative mt-3.5 h-1.5 overflow-hidden rounded-full bg-white/60">
        <div className={`h-full rounded-full bg-gradient-to-r ${t.bar} transition-all duration-700 ease-out`} style={{ width: `${Math.max(0, Math.min(100, pct ?? 100))}%` }} />
      </div>
    </Tag>
  );
}

/** A white section card (search bar, table …), like the Officers directory's. */
export function Section({ children, className = '', delay = 0 }: { children: ReactNode; className?: string; delay?: number }) {
  return (
    <section className={`asc-fade-up rounded-3xl bg-white shadow-sm ring-1 ring-slate-100 ${className}`} style={{ animationDelay: `${delay}ms` }}>
      {children}
    </section>
  );
}

/** The title row of a table card: gradient icon, title, count chip. */
export function SectionHeader({ icon: Icon, title, count, gradient = 'from-violet-500 to-indigo-600', badge, right }: {
  icon: LucideIcon; title: string; count?: number; gradient?: string; badge?: ReactNode; right?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4 lg:px-6">
      <div className="flex min-w-0 items-center gap-2.5">
        <span className={`flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br text-white shadow-sm ${gradient}`}>
          <Icon className="h-4 w-4" />
        </span>
        <h2 className="truncate text-sm font-bold text-slate-900">{title}</h2>
        {count !== undefined && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold tabular-nums text-slate-500">{count}</span>}
        {badge}
      </div>
      {right}
    </div>
  );
}
