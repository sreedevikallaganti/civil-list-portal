'use client';

/* Building blocks of the Meetings page (moved out of app/meetings/page.tsx unchanged):
   styles, status/type constants, date & file helpers, popovers, command palette,
   the follow-up calendar, the minutes card and the inline Update panel. */

import {
  useEffect, useRef, useState, type ReactNode,
} from 'react';
import {
  Calendar, CalendarClock, CheckCircle2, RotateCcw, XCircle, Clock, Search, Plus, Trash2, X, ChevronRight, ChevronLeft, FileText, Loader2, CalendarDays, Building2, Globe, StickyNote, Upload, Check, Timer, Paperclip,
} from 'lucide-react';
import pb from '@/lib/pocketbase';
import MeetingPhotos from '@/components/memories/MeetingPhotos';
import {
  WeekStrip, TimeSlotPicker, clampInt,
} from '@/components/CreateMeetingPanel';
import {
  showToast,
} from '@/components/Toaster';
import {
  useBusySlots, isSlotConflictError, slotConflictMessage, blockLabel, toHHMM, durationBlockReason, type BusyBlock,
} from '@/lib/busySlots';
import ConflictCard from '@/components/ConflictCard';




import {
  apiJSON, removeGoogleEvent,
} from '@/lib/apiClient';
import {
  completedTooEarly,
} from '@/lib/meetingRules';

/* ----------------------------- Global CSS / Animations ----------------------------- */

export const CUSTOM_CSS = `
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');
.meetings-root { font-family: 'Inter', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif; -webkit-font-smoothing: antialiased; text-rendering: optimizeLegibility; }
::selection { background: rgba(139, 92, 246, 0.18); }
@keyframes mFadeUp   { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: translateY(0); } }
@keyframes mFadeIn   { from { opacity: 0; } to { opacity: 1; } }
@keyframes mScaleIn  { from { opacity: 0; transform: scale(0.94) translateY(10px); } to { opacity: 1; transform: scale(1) translateY(0); } }
@keyframes mPanelIn  { from { opacity: 0; transform: translateX(64px); } to { opacity: 1; transform: translateX(0); } }
@keyframes mRowIn    { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
@keyframes mShimmer  { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }
@keyframes mBob      { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-6px); } }
@keyframes mBlob     { 0%, 100% { transform: translate(0, 0) scale(1); } 50% { transform: translate(14px, -18px) scale(1.07); } }
.anim-fade-up  { animation: mFadeUp 0.55s cubic-bezier(0.22, 1, 0.36, 1) both; }
.anim-fade-in  { animation: mFadeIn 0.4s ease both; }
.anim-scale-in { animation: mScaleIn 0.3s cubic-bezier(0.22, 1, 0.36, 1) both; }
.anim-panel    { animation: mPanelIn 0.38s cubic-bezier(0.22, 1, 0.36, 1) both; }
.anim-overlay  { animation: mFadeIn 0.25s ease both; }
.anim-row      { animation: mRowIn 0.4s cubic-bezier(0.22, 1, 0.36, 1) both; }
.anim-bob      { animation: mBob 3.2s ease-in-out infinite; }
.anim-blob     { animation: mBlob 9s ease-in-out infinite; }
.skeleton { background: linear-gradient(90deg, #f1effc 25%, #e5e1f5 40%, #f1effc 55%); background-size: 200% 100%; animation: mShimmer 1.6s linear infinite; }
.nice-scroll::-webkit-scrollbar { width: 8px; }
.nice-scroll::-webkit-scrollbar-track { background: transparent; }
.nice-scroll::-webkit-scrollbar-thumb { background: #e2e8f0; border-radius: 999px; }
.nice-scroll::-webkit-scrollbar-thumb:hover { background: #cbd5e1; }
.progress-shimmer { background: linear-gradient(90deg,#a78bfa 25%,#7c3aed 40%,#a78bfa 55%); background-size: 200% 100%; animation: mShimmer 1.2s linear infinite; }
`;

export function CustomStyles() {
  return <style dangerouslySetInnerHTML={{ __html: CUSTOM_CSS }} />;
}

/* ----------------------------- Status Styling ----------------------------- */

export const STATUS_STYLES: Record<string, { label: string; dot: string; badge: string }> = {
  scheduled:   { label: 'Scheduled',   dot: 'bg-violet-400',  badge: 'bg-violet-50 text-violet-700 ring-1 ring-inset ring-violet-600/20' },
  completed:   { label: 'Completed',   dot: 'bg-emerald-400', badge: 'bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-600/20' },
  rescheduled: { label: 'Rescheduled', dot: 'bg-amber-400',   badge: 'bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-600/20' },
  cancelled:   { label: 'Cancelled',   dot: 'bg-rose-400',    badge: 'bg-rose-50 text-rose-700 ring-1 ring-inset ring-rose-600/20' },
  rejected:    { label: 'Rejected',    dot: 'bg-slate-400',   badge: 'bg-slate-100 text-slate-600 ring-1 ring-inset ring-slate-500/20' },
};

/* fixed order for the 1–4 keyboard shortcuts & the quick-status popover.
   "Rejected" is not selectable, but old records still render correctly. */
export const STATUS_ORDER = ['scheduled', 'completed', 'rescheduled', 'cancelled'];

/* ----------------------------- WhatsApp reminder ----------------------------- */

/** wa.me link with a ready-to-send reminder (no WhatsApp API needed — the user presses Send).
    10-digit Indian numbers get the +91 country code. */
export function whatsappLink(phone: string, m: any): string | null {
  let digits = String(phone || '').replace(/\D/g, '').replace(/^0+/, '');
  if (digits.length === 10) digits = `91${digits}`;
  if (digits.length < 11 || digits.length > 15) return null;
  const date = String(m?.meeting_date || '').slice(0, 10);
  const when = /^\d{4}-\d{2}-\d{2}$/.test(date)
    ? new Date(`${date}T00:00:00`).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })
    : '';
  const time = String(m?.meeting_time || '').match(/\d{1,2}:\d{2}/)?.[0] || '';
  const text = [
    `Namaste${m?.officer_name ? ` ${m.officer_name}` : ''},`,
    `A gentle reminder of our meeting${m?.agenda ? ` on “${m.agenda}”` : ''}${when ? ` on ${when}` : ''}${time ? ` at ${time} hrs` : ''}${m?.location ? `, ${m.location}` : ''}.`,
    m?.meet_link ? `Join: ${m.meet_link}` : '',
    'Kindly confirm your availability.',
  ].filter(Boolean).join('\n');
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}

/* ----------------------------- Date helpers ----------------------------- */

export function pad2(n: number) { return String(n).padStart(2, '0'); }
export function toISO(d: Date) { return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; }
export function startOfDay(d: Date) { const c = new Date(d); c.setHours(0, 0, 0, 0); return c; }
export const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];
export const WEEKDAY_LETTERS = ['S','M','T','W','T','F','S'];

export const PRESET_DURATIONS = [15, 30, 45, 60, 90, 120, 180];

export function formatDuration(m: number) {
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60), mm = m % 60;
  return mm === 0 ? `${h} hr` : `${h}h ${mm}m`;
}

/* PocketBase file URL helper (getURL is current, getUrl deprecated) */
export function recordFileUrl(record: any, filename: string) {
  if (!record?.id || !filename) return '';
  try {
    const anyPb = pb as any;
    const stub = { collectionName: record.collectionName || 'meetings', collectionId: record.collectionId, id: record.id };
    if (anyPb.files?.getURL) return anyPb.files.getURL(stub, filename);
    if (anyPb.files?.getUrl) return anyPb.files.getUrl(stub, filename);
    if (anyPb.getFileUrl) return anyPb.getFileUrl(stub, filename);
  } catch { /* noop */ }
  return '';
}

export function parseDocs(v: any): string[] {
  if (!v) return [];
  if (Array.isArray(v)) return v.filter(Boolean).map(String);
  try {
    const p = JSON.parse(v);
    return Array.isArray(p) ? p : [String(v)];
  } catch { return [String(v)]; }
}

/* Small app-styled calendar dropdown, today-and-future only. */
export function FollowUpCalendar({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (iso: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const todayISO = toISO(startOfDay(new Date()));
  const [viewMonth, setViewMonth] = useState<Date>(() => {
    const base = value ? new Date(`${value}T00:00:00`) : new Date();
    return Number.isNaN(base.getTime()) ? new Date() : new Date(base.getFullYear(), base.getMonth(), 1);
  });
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const year = viewMonth.getFullYear();
  const month = viewMonth.getMonth();
  const firstWeekday = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: ({ iso: string; day: number; isPast: boolean; isToday: boolean } | null)[] = [];
  for (let i = 0; i < firstWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) {
    const iso = `${year}-${pad2(month + 1)}-${pad2(d)}`;
    cells.push({ iso, day: d, isPast: iso < todayISO, isToday: iso === todayISO });
  }

  const atCurrentMonth = month === new Date().getMonth() && year === new Date().getFullYear();

  const displayLabel = value
    ? new Date(`${value}T00:00:00`).toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
    : 'No date set';

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className={`flex w-full items-center justify-between gap-2 rounded-xl border bg-white px-3 py-2 text-left text-sm transition-all focus:outline-none focus:ring-4 focus:ring-violet-500/10 disabled:opacity-50 ${
          open ? 'border-violet-400 ring-4 ring-violet-500/10' : 'border-slate-200 hover:border-slate-300'
        }`}
      >
        <span className={`inline-flex items-center gap-2 ${value ? 'text-slate-900' : 'text-slate-400'}`}>
          <CalendarDays className="h-4 w-4 text-violet-500" />
          {displayLabel}
        </span>
        {value && !disabled && (
          <span
            role="button"
            tabIndex={0}
            onClick={(e) => { e.stopPropagation(); onChange(''); }}
            className="rounded-full p-1 text-slate-400 transition-colors hover:bg-rose-50 hover:text-rose-500"
            aria-label="Clear date"
          >
            <X className="h-3.5 w-3.5" />
          </span>
        )}
      </button>

      {open && (
        <div className="anim-scale-in absolute left-0 top-[calc(100%+6px)] z-30 w-72 rounded-2xl border border-slate-200 bg-white p-3 shadow-xl">
          <div className="mb-2 flex items-center justify-between">
            <button
              type="button"
              onClick={() => setViewMonth(new Date(year, month - 1, 1))}
              disabled={atCurrentMonth}
              className="flex h-7 w-7 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent"
              aria-label="Previous month"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <p className="text-xs font-bold text-slate-700">{MONTH_NAMES[month]} {year}</p>
            <button
              type="button"
              onClick={() => setViewMonth(new Date(year, month + 1, 1))}
              className="flex h-7 w-7 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
              aria-label="Next month"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          <div className="mb-1 grid grid-cols-7 gap-1">
            {WEEKDAY_LETTERS.map((w, i) => (
              <div key={i} className="flex h-6 items-center justify-center text-[10px] font-bold text-slate-400">{w}</div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {cells.map((c, i) =>
              c === null ? (
                <div key={i} />
              ) : (
                <button
                  key={c.iso}
                  type="button"
                  disabled={c.isPast}
                  onClick={() => { onChange(c.iso); setOpen(false); }}
                  className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold transition-all ${
                    c.iso === value
                      ? 'bg-violet-600 text-white shadow-sm'
                      : c.isPast
                      ? 'cursor-not-allowed text-slate-300'
                      : c.isToday
                      ? 'text-violet-700 ring-1 ring-inset ring-violet-300 hover:bg-violet-50'
                      : 'text-slate-700 hover:bg-violet-50 hover:text-violet-700'
                  }`}
                >
                  {c.day}
                </button>
              )
            )}
          </div>

          <button
            type="button"
            onClick={() => { onChange(todayISO); setOpen(false); }}
            className="mt-2 w-full rounded-xl border border-slate-200 py-1.5 text-[11px] font-bold text-slate-500 transition-colors hover:border-violet-300 hover:bg-violet-50 hover:text-violet-700"
          >
            Today
          </button>
        </div>
      )}
    </div>
  );
}

/* ---------------- Meeting-type color classification (light colors) ---------------- */

export const TYPE_CONFIG: Record<string, {
  label: string; badge: string; badgeDot: string; rowBg: string; rowHover: string;
  strip: string; dateCard: string; monthText: string; mobileBorder: string;
  band: string; headerBg: string; highlightCard: string; legendDot: string; icon: any;
}> = {
  internal: {
    label: 'Internal',
    badge:         'bg-violet-100 text-violet-800 ring-1 ring-inset ring-violet-500/30',
    badgeDot:      'bg-violet-500',
    rowBg:         'bg-violet-50/60',
    rowHover:      'hover:bg-violet-100/60',
    strip:         'bg-gradient-to-b from-violet-500 to-purple-500',
    dateCard:      'border-violet-300 bg-gradient-to-b from-violet-100 to-violet-50',
    monthText:     'text-violet-500',
    mobileBorder:  'border-l-4 border-l-violet-500',
    band:          'bg-gradient-to-r from-violet-500 to-purple-500',
    headerBg:      'border-violet-100 bg-violet-50/60',
    highlightCard: 'border-violet-200 bg-violet-50',
    legendDot:     'bg-violet-500',
    icon:          Building2,
  },
  external: {
    label: 'External',
    badge:         'bg-sky-100 text-sky-800 ring-1 ring-inset ring-sky-500/30',
    badgeDot:      'bg-sky-500',
    rowBg:         'bg-sky-50/60',
    rowHover:      'hover:bg-sky-100/60',
    strip:         'bg-gradient-to-b from-sky-500 to-cyan-500',
    dateCard:      'border-sky-300 bg-gradient-to-b from-sky-100 to-sky-50',
    monthText:     'text-sky-500',
    mobileBorder:  'border-l-4 border-l-sky-500',
    band:          'bg-gradient-to-r from-sky-500 to-cyan-500',
    headerBg:      'border-sky-100 bg-sky-50/60',
    highlightCard: 'border-sky-200 bg-sky-50',
    legendDot:     'bg-sky-500',
    icon:          Globe,
  },
};

export const getTypeConfig = (t: any) => TYPE_CONFIG[String(t || '').toLowerCase()] || null;

export const PRIORITY_BADGE: Record<string, { badge: string; text: string; dot: string }> = {
  high:   { badge: 'bg-rose-50 text-rose-700 ring-1 ring-inset ring-rose-600/20',   text: 'text-rose-600',   dot: 'bg-rose-300' },
  medium: { badge: 'bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-600/20', text: 'text-amber-600', dot: 'bg-amber-300' },
  low:    { badge: 'bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-600/20', text: 'text-emerald-600', dot: 'bg-emerald-300' },
};

/* ---------------------------- KPI / Stat card config ---------------------------- */

export const STAT_CARDS = [
  { key: 'all',          label: 'Total',        caption: 'All meetings',  icon: CalendarClock,
    card: 'from-violet-100 to-purple-100',  iconTint: 'text-violet-600' },
  { key: 'scheduled',    label: 'Scheduled',    caption: 'Upcoming',      icon: Calendar,
    card: 'from-sky-100 to-blue-100',       iconTint: 'text-sky-600' },
  { key: 'completed',    label: 'Completed',    caption: 'Finished',      icon: CheckCircle2,
    card: 'from-emerald-100 to-green-100',  iconTint: 'text-emerald-600' },
  { key: 'rescheduled',  label: 'Rescheduled',  caption: 'Moved dates',   icon: RotateCcw,
    card: 'from-amber-100 to-orange-100',   iconTint: 'text-amber-600' },
  { key: 'cancelled',    label: 'Cancelled',    caption: 'Called off',    icon: XCircle,
    card: 'from-rose-100 to-pink-100',      iconTint: 'text-rose-600' },
];

export const DIST_SEGMENTS = [
  { key: 'scheduled',   label: 'Scheduled',   bar: 'bg-violet-400' },
  { key: 'completed',   label: 'Completed',   bar: 'bg-emerald-400' },
  { key: 'rescheduled', label: 'Rescheduled', bar: 'bg-amber-400' },
  { key: 'cancelled',   label: 'Cancelled',   bar: 'bg-rose-400' },
];

export const PER_PAGE_OPTIONS = [8, 12, 24, 48];

/* SOFT DELETE — archive collection shared with officers/employees/users pages. */
export const ARCHIVE_COLLECTION = 'deleted_records';

/* ------------------------------- Sort options ------------------------------ */

export const DEFAULT_SORT = 'created-desc';

export const SORT_GROUPS: { group: string; options: { value: string; label: string }[] }[] = [
  { group: 'Created', options: [
    { value: 'created-desc', label: 'Newest Created' },
    { value: 'created-asc',  label: 'Oldest Created' },
  ]},
  { group: 'Meeting Date', options: [
    { value: 'date-desc', label: 'Newest Date' },
    { value: 'date-asc',  label: 'Oldest Date' },
  ]},
  { group: 'Meeting Time', options: [
    { value: 'time-asc',  label: 'Earliest Time' },
    { value: 'time-desc', label: 'Latest Time' },
  ]},
  { group: 'Duration', options: [
    { value: 'duration-desc', label: 'Longest First' },
    { value: 'duration-asc',  label: 'Shortest First' },
  ]},
  { group: 'Priority', options: [
    { value: 'priority-desc', label: 'High → Low' },
    { value: 'priority-asc',  label: 'Low → High' },
  ]},
  { group: 'Agenda', options: [
    { value: 'agenda-asc',  label: 'A → Z' },
    { value: 'agenda-desc', label: 'Z → A' },
  ]},
  { group: 'Officer', options: [
    { value: 'officer-asc',  label: 'A → Z' },
    { value: 'officer-desc', label: 'Z → A' },
  ]},
];

export const ALL_SORT_OPTIONS = SORT_GROUPS.flatMap((g) => g.options);
export const PRIORITY_WEIGHT: Record<string, number> = { high: 3, medium: 2, low: 1 };

export function getPaginationRange(current: number, total: number): (number | 'dots')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  if (current <= 4) return [1, 2, 3, 4, 5, 'dots', total];
  if (current >= total - 3) return [1, 'dots', total - 4, total - 3, total - 2, total - 1, total];
  return [1, 'dots', current - 1, current, current + 1, 'dots', total];
}

export const toLocalISO = (d: Date) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

export function dayTag(dateValue: any, statusKey: string): { label: string; cls: string } | null {
  if (!dateValue) return null;
  const raw = String(dateValue);
  const iso = raw.length > 10 ? raw.slice(0, 10) : raw;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const today = toLocalISO(new Date());
  const tomorrow = toLocalISO(new Date(Date.now() + 86400000));
  if (iso === today)    return { label: 'Today',    cls: 'bg-violet-50 text-violet-700 ring-violet-500/15' };
  if (iso === tomorrow) return { label: 'Tomorrow', cls: 'bg-sky-50 text-sky-700 ring-sky-500/15' };
  if (statusKey === 'scheduled' && iso < today)
    return { label: 'Overdue', cls: 'bg-rose-50 text-rose-700 ring-rose-500/15' };
  return null;
}

/* --------------------------- status_history helpers --------------------------- */
/* best-effort activity trail; silently no-ops if the field doesn't exist */

export function parseHistory(v: any): { status: string; date: string }[] {
  if (!v) return [];
  try {
    const parsed = typeof v === 'string' ? JSON.parse(v) : v;
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}

export async function appendStatusHistory(id: string, existing: any, label: string) {
  try {
    const history = parseHistory(existing);
    history.push({ status: label, date: new Date().toISOString() });
    await pb.collection('meetings').update(id, { status_history: JSON.stringify(history.slice(-25)) });
  } catch { /* field may not exist on this schema — ignore */ }
}

/* --------------------------- follow-up note save helper --------------------------- */
/* PocketBase silently drops unknown fields, so success = the value came back. */
export async function saveFollowUpNote(meetingId: string, text: string): Promise<string | null> {
  const candidates = ['follow_up_notes', 'followup_notes', 'follow_up', 'followup', 'follow_up_note', 'followUpNotes'];
  for (const field of candidates) {
    try {
      const rec: any = await pb.collection('meetings').update(meetingId, { [field]: text });
      if (rec && rec[field] === text) return field;
    } catch (e) {
      console.error(`[follow-up note] update rejected while trying field "${field}":`, e);
    }
  }
  try {
    const fresh: any = await pb.collection('meetings').getOne(meetingId);
    console.error(
      '[follow-up note] none of these field names stuck:', candidates,
      '— actual fields on this "meetings" record:', Object.keys(fresh || {})
    );
  } catch { /* ignore */ }
  return null;
}

/* ------------------------- Animated count-up ------------------------- */

export function AnimatedNumber({ value, duration = 900 }: { value: number; duration?: number }) {
  const [display, setDisplay] = useState(0);
  const prevRef = useRef(0);

  useEffect(() => {
    const from = prevRef.current;
    const to = value;
    if (from === to) return;
    let raf = 0;
    const start = performance.now();
    const step = (now: number) => {
      const p = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      const cur = Math.round(from + (to - from) * eased);
      prevRef.current = cur;
      setDisplay(cur);
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);

  return <span className="tabular-nums">{display}</span>;
}

/* ------------------------------ Info tile ----------------------------- */

export function InfoTile({ icon: Icon, tint, label, children }: { icon: any; tint: string; label: string; children: ReactNode }) {
  return (
    <div className="group/tile rounded-2xl border border-slate-200/80 bg-white p-4 transition-all duration-200 hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md hover:shadow-slate-900/[0.04]">
      <div className="flex items-center gap-2">
        <span className={`flex h-6 w-6 items-center justify-center rounded-lg ${tint} transition-transform duration-300 group-hover/tile:scale-110`}>
          <Icon className="h-3.5 w-3.5" />
        </span>
        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{label}</p>
      </div>
      <div className="mt-2 text-sm font-semibold text-slate-900">{children}</div>
    </div>
  );
}

/* =================================================================================
   ★ v28: MinutesOfMeetingCard — replaces MinutesActions (no action items).
   Writes to the `minutes` text field; MoM files go into `documents`.
================================================================================= */

export const MOM_MAX_FILE_MB = 10;
export const MOM_ACCEPTED = '.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.png,.jpg,.jpeg,.webp';

export function MinutesOfMeetingCard({ meeting, onPatched }: {
  meeting: any;
  onPatched: (patch: Record<string, any>) => void;
}) {
  const savedText = String(meeting?.minutes || '');
  const [text, setText] = useState(savedText);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  /* reset when a different meeting is opened */
  useEffect(() => { setText(String(meeting?.minutes || '')); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [meeting?.id]);

  const dirty = text.trim() !== savedText.trim();
  const docs = parseDocs(meeting?.documents);

async function save() {
  if (!meeting?.id || saving || !dirty) return;
  const value = text.trim();
  setSaving(true);
  try {
    const rec: any = await pb.collection('meetings').update(meeting.id, { minutes: value });

    /* field missing → PocketBase dropped it silently */
    if (!rec || !('minutes' in rec)) {
      console.error('[minutes] no "minutes" field on meetings. Fields on this record:', Object.keys(rec || {}));
      showToast('Minutes were not saved — add a "Plain text" field named minutes to the meetings collection in PocketBase.', 'error');
      return;
    }

    /* field exists but stored something slightly different (e.g. Editor field → HTML) */
    const stored = String(rec.minutes ?? '');
    if (stored.replace(/\r\n/g, '\n').trim() !== value) {
      console.warn('[minutes] stored value differs from what was sent', { sent: value, stored });
    }

    onPatched({ minutes: stored || value });
    showToast('Minutes saved', 'success');
  } catch (e: any) {
    console.error('[minutes] save failed:', e?.response || e);
    showToast(e?.response?.message || e?.message || 'Failed to save minutes. Please try again.', 'error');
  } finally {
    setSaving(false);
  }
}

  async function attach(files: FileList | null) {
    if (!meeting?.id || !files?.length) return;
    const list = Array.from(files);
    const tooBig = list.find((f) => f.size > MOM_MAX_FILE_MB * 1024 * 1024);
    if (tooBig) showToast(`"${tooBig.name}" is larger than ${MOM_MAX_FILE_MB} MB`, 'error');
    const ok = list.filter((f) => f.size <= MOM_MAX_FILE_MB * 1024 * 1024);
    if (fileRef.current) fileRef.current.value = '';
    if (!ok.length) return;

    /* PocketBase: re-sending existing names keeps them, File parts are added */
    const fd = new FormData();
    docs.forEach((n) => fd.append('documents', n));
    ok.forEach((f) => fd.append('documents', f));
    setUploading(true);
    try {
      const rec: any = await pb.collection('meetings').update(meeting.id, fd);
      onPatched({ documents: rec?.documents ?? docs });
      showToast(ok.length === 1 ? 'File attached' : `${ok.length} files attached`, 'success');
    } catch (e: any) {
      showToast(e?.message || 'Upload failed. Please try again.', 'error');
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="rounded-2xl border border-violet-200/70 bg-violet-50/40 p-4">
      <div className="mb-3 flex items-center gap-2.5">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-600 text-white shadow-sm">
          <FileText className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-bold uppercase tracking-wider text-violet-700">Minutes of Meeting</p>
          <p className="text-xs text-slate-500">What was discussed and decided</p>
        </div>
        {!dirty && savedText && (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700 ring-1 ring-inset ring-emerald-500/20">
            <Check className="h-3 w-3" /> Saved
          </span>
        )}
      </div>

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); save(); } }}
        rows={6}
        disabled={saving}
        placeholder={'1) Points discussed…\n2) Decisions taken…'}
        className="w-full resize-y rounded-xl border border-slate-200 bg-white px-3.5 py-3 text-sm leading-relaxed text-slate-900 placeholder-slate-400 focus:border-violet-400 focus:outline-none focus:ring-4 focus:ring-violet-500/10 disabled:opacity-60"
      />

      {docs.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {docs.map((name) => {
            const url = recordFileUrl(meeting, name);
            return (
              <a
                key={name}
                href={url || undefined}
                target="_blank"
                rel="noreferrer"
                className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-600 transition-colors hover:border-violet-300 hover:text-violet-700"
              >
                <FileText className="h-3 w-3 shrink-0 text-violet-500" />
                <span className="max-w-[160px] truncate">{name}</span>
              </a>
            );
          })}
        </div>
      )}

      {uploading && (
        <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-slate-100">
          <div className="progress-shimmer h-full w-1/3 rounded-full" />
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <input ref={fileRef} type="file" multiple accept={MOM_ACCEPTED} className="hidden" onChange={(e) => attach(e.target.files)} />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-violet-300 bg-white px-3 py-1.5 text-xs font-semibold text-violet-700 transition-colors hover:bg-violet-50 disabled:opacity-50"
        >
          {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Paperclip className="h-3.5 w-3.5" />}
          Attach MoM file
        </button>
        <div className="flex items-center gap-2">
          {dirty && (
            <button
              type="button"
              onClick={() => setText(savedText)}
              disabled={saving}
              className="rounded-full border border-slate-200 bg-white px-3.5 py-1.5 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-50 disabled:opacity-50"
            >
              Discard
            </button>
          )}
          <button
            type="button"
            onClick={save}
            disabled={saving || !dirty}
            className="inline-flex items-center gap-1.5 rounded-full bg-violet-600 px-4 py-1.5 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-violet-700 disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
            {saving ? 'Saving…' : 'Save minutes'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* where to place a fixed popover next to `rect` — flips up / left when it would overflow */
export type PopoverPos = { vert: 'top' | 'bottom'; y: number; align: 'left' | 'right'; x: number; maxH: number };

export function popoverPosition(rect: DOMRect, height: number): PopoverPos {
  const GAP = 6, MARGIN = 12;
  const vw = window.innerWidth, vh = window.innerHeight;
  const spaceBelow = vh - rect.bottom - GAP - MARGIN;
  const spaceAbove = rect.top - GAP - MARGIN;
  const openUp = spaceBelow < height && spaceAbove > spaceBelow;
  const align: 'left' | 'right' = rect.left > vw / 2 ? 'right' : 'left';
  return {
    vert: openUp ? 'bottom' : 'top',
    y: openUp ? vh - rect.top + GAP : rect.bottom + GAP,
    align,
    x: align === 'right' ? vw - rect.right : rect.left,
    maxH: Math.max(160, openUp ? spaceAbove : spaceBelow),
  };
}

/* =================================================================================
   QuickStatusPopover — fixed-position, opened by a row's status badge.
================================================================================= */

export function QuickStatusPopover({ pos, current, onPick, onClose }: {
  pos: PopoverPos; current: string; onPick: (key: string) => void; onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose(); }
    document.addEventListener('mousedown', onDocClick);
    window.addEventListener('keydown', onKey);
    window.addEventListener('scroll', onClose, true);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', onClose, true);
    };
  }, [onClose]);

  return (
    <div
      ref={ref}
      style={{ [pos.vert]: pos.y, [pos.align]: pos.x, maxHeight: pos.maxH }}
      className="anim-scale-in nice-scroll fixed z-[75] w-48 overflow-y-auto rounded-2xl border border-slate-200 bg-white p-1.5 shadow-2xl shadow-slate-900/15"
    >
      <p className="px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">Set status</p>
      {STATUS_ORDER.map((key, i) => {
        const s = STATUS_STYLES[key];
        const active = current === key;
        return (
          <button
            key={key}
            onClick={() => onPick(key)}
            className={`flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-left text-xs font-semibold transition-colors ${
              active ? 'bg-slate-100 text-slate-900' : 'text-slate-600 hover:bg-slate-50'
            }`}
          >
            <span className={`h-2 w-2 rounded-full ${s.dot}`} />
            {s.label}
            <kbd className="ml-auto rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-400">{i + 1}</kbd>
            {active && <Check className="h-3.5 w-3.5 text-violet-600" />}
          </button>
        );
      })}
    </div>
  );
}

/* =================================================================================
   NotesPopover — quick preview of follow-up notes.
================================================================================= */

export function NotesPopover({ pos, text, onOpenFull, onClose }: {
    pos: PopoverPos; text: string; onOpenFull: () => void; onClose: () => void;

}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose(); }
    document.addEventListener('mousedown', onDocClick);
    window.addEventListener('keydown', onKey);
    window.addEventListener('scroll', onClose, true);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', onClose, true);
    };
  }, [onClose]);

  return (
    <div
      ref={ref}
      style={{ [pos.vert]: pos.y, [pos.align]: pos.x, maxHeight: pos.maxH }}
      className="anim-scale-in nice-scroll fixed z-[75] w-72 overflow-y-auto rounded-2xl border border-amber-200 bg-white p-3.5 shadow-2xl shadow-slate-900/15"
    >
      <div className="mb-2 flex items-center gap-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-100 text-amber-700">
          <StickyNote className="h-3.5 w-3.5" />
        </span>
        <p className="text-[10px] font-bold uppercase tracking-wider text-amber-700">Follow-up note</p>
      </div>
      <p className="nice-scroll max-h-40 overflow-y-auto whitespace-pre-wrap break-words text-xs leading-relaxed text-slate-700">
        {text}
      </p>
      <button
        onClick={onOpenFull}
        className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-full bg-slate-900 px-3 py-2 text-[11px] font-semibold text-white transition-colors hover:bg-slate-800"
      >
        View full details <ChevronRight className="h-3 w-3" />
      </button>
    </div>
  );
}

/* =================================================================================
   CommandPalette — Cmd/Ctrl+K.
================================================================================= */

export function CommandPalette({ meetings, onClose, onSelectMeeting, onNewMeeting, getStatusStyle, getStatusKey, getMeetingTitle, formatDateShort }: {
  meetings: any[];
  onClose: () => void;
  onSelectMeeting: (m: any) => void;
  onNewMeeting: () => void;
  getStatusStyle: (key: string) => { label: string; dot: string; badge: string };
  getStatusKey: (m: any) => string;
  getMeetingTitle: (m: any) => string;
  formatDateShort: (v: any) => string;
}) {
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setTimeout(() => inputRef.current?.focus(), 30); }, []);

  const q = query.trim().toLowerCase();
  const results = q
    ? meetings.filter((m) =>
        getMeetingTitle(m).toLowerCase().includes(q) ||
        String(m.officer_name || '').toLowerCase().includes(q) ||
        String(m.location || '').toLowerCase().includes(q)
      ).slice(0, 8)
    : meetings.slice(0, 6);

  return (
    <div className="fixed inset-0 z-[90] flex items-start justify-center px-4 pt-[12vh]">
      <div className="anim-overlay absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={onClose} />
      <div className="anim-scale-in relative w-full max-w-lg overflow-hidden rounded-3xl bg-white shadow-2xl">
        <div className="flex items-center gap-2.5 border-b border-slate-100 px-4 py-3.5">
          <Search className="h-4 w-4 shrink-0 text-slate-400" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search meetings by agenda, officer, location…"
            className="w-full bg-transparent text-sm outline-none placeholder:text-slate-400"
          />
          <kbd className="shrink-0 rounded-md border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] font-bold text-slate-400">ESC</kbd>
        </div>

        <div className="nice-scroll max-h-80 overflow-y-auto p-2">
          <button
            onClick={onNewMeeting}
            className="flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left transition-colors hover:bg-violet-50"
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-slate-900 text-white">
              <Plus className="h-4 w-4" />
            </span>
            <span className="text-sm font-semibold text-slate-800">New meeting</span>
            <kbd className="ml-auto rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-400">N</kbd>
          </button>

          {results.length > 0 && (
            <p className="mb-1 mt-2 px-3 text-[10px] font-bold uppercase tracking-wider text-slate-400">
              {q ? `Results for "${query}"` : 'Recent meetings'}
            </p>
          )}

          {results.map((m) => {
            const sk = getStatusKey(m);
            const st = getStatusStyle(sk);
            return (
              <button
                key={m.id}
                onClick={() => onSelectMeeting(m)}
                className="flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left transition-colors hover:bg-violet-50"
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-400">
                  <CalendarDays className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-slate-800">{getMeetingTitle(m)}</span>
                  <span className="block truncate text-[11px] text-slate-400">
                    {formatDateShort(m.meeting_date || m.created_date)}
                    {m.officer_name ? ` · with ${m.officer_name}` : ''}
                  </span>
                </span>
                <span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${st.badge}`}>
                  <span className={`h-1.5 w-1.5 rounded-full ${st.dot}`} />
                  {st.label}
                </span>
              </button>
            );
          })}

          {q && results.length === 0 && (
            <p className="px-3 py-6 text-center text-xs text-slate-400">No meetings match “{query}”.</p>
          )}
        </div>
      </div>
    </div>
  );
}

/* =================================================================================
   Inline "Update Meeting" panel — MANUAL ONLY, zero automations.
================================================================================= */

export function InlineUpdateStatusPanel({ meeting, onClose, onSaved }: { meeting: any; onClose: () => void; onSaved: () => void }) {
  /* __forceStatus lets a caller open this panel pre-selected on "Rescheduled" */
  const [status, setStatus] = useState<string>(() => String(meeting?.__forceStatus || meeting?.status || 'scheduled').toLowerCase());
  const [newDate, setNewDate] = useState<string>(() => String(meeting?.meeting_date || '').slice(0, 10) || '');
  const [newTime, setNewTime] = useState<string>(() => (String(meeting?.meeting_time || '').match(/\d{1,2}:\d{2}/)?.[0] || ''));
  const [newDuration, setNewDuration] = useState<string>(() => (meeting?.duration != null ? String(meeting.duration) : ''));
  const [isCustomDuration, setIsCustomDuration] = useState(() => {
    const n = Number(meeting?.duration);
    return !!meeting?.duration && n > 0 && !PRESET_DURATIONS.includes(n);
  });
  const [customHours, setCustomHours] = useState(() => {
    const n = Number(meeting?.duration);
    return n > 0 && !PRESET_DURATIONS.includes(n) ? String(Math.floor(n / 60)) : '';
  });
  const [customMinutes, setCustomMinutes] = useState(() => {
    const n = Number(meeting?.duration);
    return n > 0 && !PRESET_DURATIONS.includes(n) ? String(n % 60) : '';
  });
  const handlePresetDuration = (minutes: number) => {
    setIsCustomDuration(false);
    setCustomHours(''); setCustomMinutes('');
    setNewDuration(String(minutes));
  };
  const handleOpenCustomDuration = () => {
    const n = Number(newDuration);
    if (n > 0 && !PRESET_DURATIONS.includes(n)) {
      setCustomHours(String(Math.floor(n / 60)));
      setCustomMinutes(String(n % 60));
    } else { setCustomHours(''); setCustomMinutes(''); }
    setIsCustomDuration(true);
  };
  const handleCustomDurationChange = (hours: string, minutes: string) => {
    setCustomHours(hours); setCustomMinutes(minutes);
    const h = parseInt(hours, 10) || 0;
    const m = parseInt(minutes, 10) || 0;
    const total = h * 60 + m;
    setNewDuration(total > 0 ? String(total) : '');
  };
  const customDurationTotal = (parseInt(customHours, 10) || 0) * 60 + (parseInt(customMinutes, 10) || 0);
  const handleCustomDurationDone = () => {
    if (customDurationTotal <= 0) {
      setIsCustomDuration(false);
      setCustomHours(''); setCustomMinutes('');
      setNewDuration('');
      return;
    }
    setIsCustomDuration(false);
  };
  const [followUpDate, setFollowUpDate] = useState<string>(() => String(meeting?.follow_up_date || meeting?.followup_date || '').slice(0, 10) || '');
  const todayISO = toISO(startOfDay(new Date()));
  const [note, setNote] = useState('');
  /* if the new date is today and the picked time has passed, clear it */
  useEffect(() => {
    if (newDate !== todayISO || !newTime) return;
    const now = new Date();
    const nowMinutes = now.getHours() * 60 + now.getMinutes();
    const [h, m] = newTime.split(':').map(Number);
    if (!Number.isNaN(h) && !Number.isNaN(m) && h * 60 + m <= nowMinutes) {
      setNewTime('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [newDate]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [dragOver, setDragOver] = useState(false);

  /* slot conflicts for the reschedule fields */
  const isReschedule = status === 'rescheduled';
  const busy = useBusySlots(newDate, meeting?.id, isReschedule);
  const newDurationNum = Number(newDuration) || 0;
  const rsBusyAt = (t: string) => busy.findConflicts(t, 1)[0];
  const rsConflicts: BusyBlock[] = isReschedule && newDate && newTime ? busy.findConflicts(newTime, newDurationNum || 15) : [];
  const rsSuggestions = rsConflicts.length ? busy.suggest(newTime, newDurationNum || 30) : [];
  const rsFreeAfter = isReschedule && newTime ? busy.freeMinutesFrom(newTime) : null;

  /* documents */
  const [existingDocs, setExistingDocs] = useState<string[]>(() => parseDocs(meeting?.documents));
  const [pendingDocs, setPendingDocs] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const docInputRef = useRef<HTMLInputElement>(null);
  const initialDocsRef = useRef<string[]>([]);

  useEffect(() => { initialDocsRef.current = existingDocs; /* eslint-disable-line react-hooks/exhaustive-deps */ }, []);

  const MAX_FILE_MB = 10;
  const ACCEPTED_DOCS = '.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.png,.jpg,.jpeg,.webp';

  const handlePickDocs = (files: FileList | null) => {
    if (!files?.length) return;
    const list = Array.from(files);
    const tooBig = list.find((f) => f.size > MAX_FILE_MB * 1024 * 1024);
    if (tooBig) showToast(`"${tooBig.name}" is larger than ${MAX_FILE_MB} MB`, 'error');
    const ok = list.filter((f) => f.size <= MAX_FILE_MB * 1024 * 1024);
    if (ok.length) {
      setPendingDocs((prev) => {
        const seen = new Set(prev.map((p) => `${p.name}:${p.size}`));
        return [...prev, ...ok.filter((f) => !seen.has(`${f.name}:${f.size}`))];
      });
    }
    if (docInputRef.current) docInputRef.current.value = '';
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (!saving) handlePickDocs(e.dataTransfer.files);
  };
  const handlePaste = (e: React.ClipboardEvent) => {
    if (saving) return;
    const files = Array.from(e.clipboardData?.items || [])
      .filter((i) => i.kind === 'file')
      .map((i) => i.getAsFile())
      .filter((f): f is File => !!f);
    if (!files.length) return;
    const dt = new DataTransfer();
    files.forEach((f) => dt.items.add(f));
    handlePickDocs(dt.files);
  };

  const removePendingDoc = (idx: number) =>
    setPendingDocs((prev) => prev.filter((_, i) => i !== idx));

  const removeExistingDoc = (name: string) =>
    setExistingDocs((prev) => prev.filter((n) => n !== name));

  const docsDirty =
    pendingDocs.length > 0 ||
    existingDocs.join('||') !== initialDocsRef.current.join('||');

  async function syncDocuments(recordId: string) {
    if (!docsDirty) return;
    const fd = new FormData();
    if (!existingDocs.length && !pendingDocs.length) {
      fd.append('documents', '');                              // clear all
    } else {
      existingDocs.forEach((n) => fd.append('documents', n));  // keep remaining
      pendingDocs.forEach((f) => fd.append('documents', f));   // add new
    }
    setUploading(true);
    try {
      await pb.collection('meetings').update(recordId, fd);
    } finally {
      setUploading(false);
    }
  }

  const handleSave = async () => {
    if (!meeting?.id || saving) return;

    if (status === 'rescheduled') {
      if (!newDate || !newTime || !newDuration) {
        setError('Please fill in the new date, time, and duration for the rescheduled meeting.');
        return;
      }
      if (newDate < todayISO) {
        setError('The rescheduled date can\'t be in the past — pick today or a future date.');
        return;
      }
      if (newDate === todayISO) {
        const now = new Date();
        const nowMinutes = now.getHours() * 60 + now.getMinutes();
        const [h, m] = newTime.split(':').map(Number);
        if (!Number.isNaN(h) && !Number.isNaN(m) && h * 60 + m <= nowMinutes) {
          setError('That time has already passed today — pick a later time or a future date.');
          return;
        }
      }
      if (rsConflicts.length) {
        setError(`That slot overlaps “${rsConflicts[0].agenda}” (${blockLabel(rsConflicts[0])}) — pick one of the free slots suggested above.`);
        return;
      }
    }

    const early = completedTooEarly(meeting, STATUS_STYLES[status]?.label || status);
    if (early) { setError(early); return; }

    setSaving(true);
    setError('');
    try {
      const statusLabel = STATUS_STYLES[status]?.label || status;
      const payload: Record<string, any> = {
        status: statusLabel,
        status_flag: statusLabel,
        follow_up_date: followUpDate,
      };

      if (status === 'rescheduled') {
        payload.meeting_date = newDate;
        payload.meeting_time = newTime;
        payload.duration = Number(newDuration) || newDuration;
      }
      await pb.collection('meetings').update(meeting.id, payload);

      appendStatusHistory(meeting.id, meeting.status_history, statusLabel).catch(() => {});

      /* keep Google Calendar in step: cancelled → remove the event, rescheduled → move it.
         (Emailed .ics invites update themselves only when the organiser re-sends them.) */
      if (status === 'cancelled') removeGoogleEvent(meeting);
      else if (status === 'rescheduled' && meeting.gcal_event_id) {
        apiJSON('/api/google', {
          meetingId: meeting.id, agenda: meeting.agenda, date: newDate, time: newTime,
          duration: Number(newDuration) || 30, location: meeting.location, officerName: meeting.officer_name,
          gcalEventId: meeting.gcal_event_id, existingMeetLink: meeting.meet_link || '',
          syncCalendar: true, includeMeet: false, sendInvite: false,
        }, { timeoutMs: 30_000 }).catch((e) => console.warn('[reschedule] calendar update failed:', e));
      }

      await syncDocuments(meeting.id);

      const trimmedNote = note.trim();
      if (trimmedNote) {
        const savedField = await saveFollowUpNote(meeting.id, trimmedNote);
        if (!savedField) {
          showToast(
            'Status saved, but the note wasn’t stored — your "meetings" collection needs a text field named follow_up_notes. See the browser console for the field names actually on this record.',
            'error'
          );
        }
      }
      onSaved();
    } catch (e: any) {
      if (isSlotConflictError(e)) {
        busy.refresh();
        setError(`${slotConflictMessage(e)} Someone may have just booked it — pick a free slot above.`);
      } else {
        setError(e?.message || 'Failed to update. Please try again.');
      }
    } finally {
      setSaving(false);
    }
  };

  const di = (() => {
    const raw = String(meeting?.meeting_date || '');
    if (!raw) return null;
    const d = new Date(raw.includes(' ') ? raw.replace(' ', 'T') : raw);
    return Number.isNaN(d.getTime()) ? null : d.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
  })();

  return (
    <div className="fixed inset-0 z-50">
      <div className="anim-overlay absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={() => !saving && onClose()} />

      <aside className="anim-panel absolute right-0 top-0 flex h-full w-full flex-col bg-white shadow-2xl sm:max-w-xl lg:max-w-2xl">
        <div className="h-1.5 w-full bg-gradient-to-r from-amber-400 to-orange-400" />

        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Update Meeting</p>
            <h2 className="mt-0.5 truncate text-base font-bold text-slate-900">{meeting?.agenda || meeting?.title || 'General Discussion'}</h2>
            <p className="mt-0.5 text-xs text-slate-400">
              {di || '—'}{meeting?.meeting_time ? ` · ${meeting.meeting_time}` : ''}
            </p>
          </div>
          <button
            onClick={() => !saving && onClose()}
            className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full border border-slate-200 text-slate-400 transition-all hover:border-rose-200 hover:bg-rose-50 hover:text-rose-500 active:scale-90"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="nice-scroll flex-1 space-y-5 overflow-y-auto px-5 py-5">

          {/* Status */}
          <div>
            <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">Status</p>
            <div className="grid grid-cols-2 gap-2">
              {STATUS_ORDER.map((key) => {
                const s = STATUS_STYLES[key];
                if (!s) return null;
                const selected = status === key;
                return (
                <button
                  key={key}
                  onClick={() => setStatus(key)}
                  disabled={saving}
                  className={`inline-flex items-center gap-2 rounded-xl px-3 py-2.5 text-xs font-semibold transition-all duration-200 active:scale-[0.97] disabled:opacity-50 ${
                    selected
                      ? `${s.badge} border-2 border-slate-900`
                      : 'border border-slate-200 bg-white text-slate-500 hover:border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  <span className={`h-2 w-2 rounded-full ${s.dot}`} />
                  {s.label}
                </button>
                );
              })}
            </div>
          </div>

          {/* Reschedule fields — only for Rescheduled */}
          {status === 'rescheduled' && (
            <div className="anim-fade-in space-y-3 rounded-2xl border border-amber-200 bg-amber-50/60 p-4">
              <p className="flex items-center gap-1.5 text-[11px] font-semibold text-amber-700">
                <RotateCcw className="h-3.5 w-3.5" />
                Rescheduling needs a new date, time & duration
              </p>

              <div>
                <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-amber-700">New Date</label>
                <WeekStrip value={newDate} onChange={(v) => { setNewDate(v); setError(''); }} />
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl border border-amber-200 bg-white p-3.5">
                  <label className="mb-2 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-amber-700">
                    <Clock className="h-3.5 w-3.5" /> New Time
                  </label>
                  <TimeSlotPicker
                    value={newTime}
                    onChange={(t) => { setNewTime(t); setError(''); }}
                    meetingDate={newDate}
                    busyAt={rsBusyAt}
                    accent="amber"
                  />
                </div>

                <div className="rounded-2xl border border-amber-200 bg-white p-3.5">
                  <label className="mb-2 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-amber-700">
                    <Timer className="h-3.5 w-3.5" /> Duration
                  </label>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {PRESET_DURATIONS.map((m) => {
                      const active = !isCustomDuration && Number(newDuration) === m;
                      const blocked = durationBlockReason(rsFreeAfter, m);
                      if (blocked && !active) {
                        return (
                          <button
                            key={m}
                            type="button"
                            disabled
                            title={blocked}
                            className="cursor-not-allowed rounded-full border border-dashed border-slate-200 bg-slate-50 px-3 py-1.5 text-[11px] font-semibold tabular-nums text-slate-300 line-through"
                          >
                            {formatDuration(m)}
                          </button>
                        );
                      }
                      return (
                        <button
                          key={m}
                          type="button"
                          disabled={saving}
                          onClick={() => handlePresetDuration(m)}
                          className={`rounded-full border px-3 py-1.5 text-[11px] font-semibold tabular-nums transition-all active:scale-95 disabled:opacity-50 ${
                            active
                              ? 'border-amber-500 bg-amber-500 text-white shadow-sm'
                              : 'border-slate-200 bg-white text-slate-600 hover:border-amber-300'
                          }`}
                        >
                          {formatDuration(m)}
                        </button>
                      );
                    })}
                    {!isCustomDuration && (
                      <button
                        type="button"
                        disabled={saving}
                        onClick={handleOpenCustomDuration}
                        className="rounded-full border border-dashed border-slate-300 px-3 py-1.5 text-[11px] font-semibold text-slate-500 transition-colors hover:border-amber-400 hover:text-amber-600 disabled:opacity-50"
                      >
                        Custom
                      </button>
                    )}
                  </div>
                  {isCustomDuration && (
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <input
                        type="number"
                        min={0}
                        max={23}
                        value={customHours}
                        disabled={saving}
                        onChange={(e) => handleCustomDurationChange(clampInt(e.target.value, 23), customMinutes)}
                        placeholder="H"
                        className="w-14 rounded-xl border border-amber-200 bg-white px-2 py-1.5 text-center text-sm font-semibold tabular-nums text-slate-800 outline-none transition focus:border-amber-400 focus:ring-2 focus:ring-amber-500/10 disabled:opacity-50"
                      />
                      <span className="text-xs font-semibold text-slate-400">hr</span>
                      <input
                        type="number"
                        min={0}
                        max={59}
                        value={customMinutes}
                        disabled={saving}
                        onChange={(e) => handleCustomDurationChange(customHours, clampInt(e.target.value, 59))}
                        placeholder="M"
                        className="w-14 rounded-xl border border-amber-200 bg-white px-2 py-1.5 text-center text-sm font-semibold tabular-nums text-slate-800 outline-none transition focus:border-amber-400 focus:ring-2 focus:ring-amber-500/10 disabled:opacity-50"
                      />
                      <span className="text-xs font-semibold text-slate-400">min</span>
                      <button
                        type="button"
                        disabled={saving}
                        onClick={handleCustomDurationDone}
                        className="ml-auto inline-flex items-center gap-1 rounded-xl bg-slate-900 px-3 py-1.5 text-[11px] font-semibold text-white transition hover:bg-slate-800 disabled:opacity-50"
                      >
                        <Check className="h-3.5 w-3.5" /> Done
                      </button>
                    </div>
                  )}
                  {rsFreeAfter?.next && rsFreeAfter.minutes > 0 && (
                    <p className="mt-2 text-[11px] text-slate-500">
                      Free for {formatDuration(rsFreeAfter.minutes)} — next: “{rsFreeAfter.next.agenda}” at {toHHMM(rsFreeAfter.next.start)}
                    </p>
                  )}
                </div>
              </div>

              <ConflictCard
                date={newDate}
                conflicts={rsConflicts}
                suggestions={rsSuggestions}
                onPick={(sug) => { setNewDate(sug.date); setNewTime(sug.time); setError(''); }}
              />
            </div>
          )}

          {/* Follow-up date */}
          <div>
            <label className="mb-2 block text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Follow-up date (optional)
            </label>
            <FollowUpCalendar value={followUpDate} onChange={setFollowUpDate} disabled={saving} />
            <p className="mt-1 text-[11px] text-slate-400">
              Only today or a future date can be chosen. Included in the Google Calendar sync when syncing is enabled.
            </p>
          </div>

          {/* Photos — moments from the meeting; saved as soon as they're added */}
          <div className="rounded-2xl border border-slate-200/80 bg-white p-4">
            <MeetingPhotos meeting={meeting} readOnly={saving} />
            <p className="mt-2 text-[11px] text-slate-400">Photos are saved as soon as you add them — no need to press Save.</p>
          </div>

          {/* Documents */}
          <div onPaste={handlePaste}>
            <div className="mb-2 flex items-center justify-between">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Documents</p>
              <span className="text-[10px] font-semibold text-slate-400">max {MAX_FILE_MB} MB each</span>
            </div>
            <input
              ref={docInputRef}
              type="file"
              multiple
              accept={ACCEPTED_DOCS}
              className="hidden"
              onChange={(e) => handlePickDocs(e.target.files)}
            />
            <button
              type="button"
              onClick={() => docInputRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); if (!saving) setDragOver(true); }}
              onDragEnter={(e) => { e.preventDefault(); if (!saving) setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              disabled={saving}
              className={`flex w-full flex-col items-center justify-center gap-1.5 rounded-2xl border-2 border-dashed px-3 py-4 text-xs font-semibold transition-all disabled:opacity-50 ${
                dragOver
                  ? 'scale-[1.01] border-violet-400 bg-violet-50/80 text-violet-700'
                  : 'border-slate-200 bg-slate-50/50 text-slate-600 hover:border-violet-300 hover:bg-violet-50/50 hover:text-violet-700'
              }`}
            >
              <Upload className={`h-4 w-4 ${dragOver ? 'animate-bounce' : ''}`} />
              {dragOver ? 'Drop to attach' : 'Attach documents'}
              <span className="text-[10px] font-normal text-slate-400">Drag &amp; drop, paste, or click · PDF, Word, Excel, images</span>
            </button>

            {uploading && (
              <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-slate-100">
                <div className="progress-shimmer h-full w-1/3 rounded-full" />
              </div>
            )}

            {existingDocs.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {existingDocs.map((name) => {
                  const url = recordFileUrl(meeting, name);
                  return (
                    <span key={name} className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-slate-200 bg-white py-1 pl-2.5 pr-1 text-[11px] font-medium text-slate-600">
                      <FileText className="h-3 w-3 shrink-0 text-violet-500" />
                      {url ? (
                        <a href={url} target="_blank" rel="noreferrer" className="max-w-[140px] truncate hover:text-violet-600 hover:underline">{name}</a>
                      ) : (
                        <span className="max-w-[140px] truncate">{name}</span>
                      )}
                      <button type="button" onClick={() => removeExistingDoc(name)} disabled={saving} className="rounded-full p-0.5 text-slate-400 transition-colors hover:bg-rose-50 hover:text-rose-500">
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </span>
                  );
                })}
              </div>
            )}

            {pendingDocs.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {pendingDocs.map((f, i) => (
                  <span key={`${f.name}-${i}`} className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-violet-200 bg-violet-50 py-1 pl-2.5 pr-1 text-[11px] font-medium text-violet-700">
                    <FileText className="h-3 w-3 shrink-0" />
                    <span className="max-w-[140px] truncate">{f.name}</span>
                    <button type="button" onClick={() => removePendingDoc(i)} disabled={saving} className="rounded-full p-0.5 text-violet-400 transition-colors hover:bg-violet-100 hover:text-rose-500">
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Note */}
          <div>
            <label className="mb-2 block text-[10px] font-bold uppercase tracking-wider text-slate-400">Note (optional)</label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={4}
              disabled={saving}
              placeholder="Add a short note about this status change..."
              className="w-full resize-none rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-3 text-sm text-slate-900 placeholder-slate-400 focus:border-violet-400 focus:bg-white focus:outline-none focus:ring-4 focus:ring-violet-500/10"
            />
          </div>

          {error && (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-semibold text-rose-600">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-slate-100 bg-white/95 px-5 py-4 backdrop-blur">
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              disabled={saving}
              className="flex-1 rounded-full border border-slate-200 px-4 py-2.5 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-50 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="inline-flex flex-[2] items-center justify-center gap-1.5 rounded-full bg-slate-900 px-4 py-2.5 text-xs font-semibold text-white shadow-md shadow-slate-900/10 transition-all duration-200 hover:-translate-y-0.5 hover:bg-slate-800 active:scale-[0.98] disabled:opacity-60"
            >
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </div>
      </aside>
    </div>
  );
}