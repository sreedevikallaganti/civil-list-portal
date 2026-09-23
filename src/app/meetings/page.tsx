'use client';

/* ================================================================
   MeetingsPage — v25
   NEW (v25):
     (1) Clicking a KPI/stat card (Total, Scheduled, Completed,
         Rescheduled, Cancelled) now also smooth-scrolls down to the
         meetings table, in addition to setting the status filter it
         already set — same scroll-into-view behavior the overdue
         banner's "Review now" button uses.
   v24 NEW:
     (1) "Review now" on the overdue banner now smooth-scrolls down to
         the meetings table instead of leaving the user to scroll past
         the KPI cards manually.
     (2) Extra spacing between the Type and Status badge columns in the
         desktop row (and whitespace-nowrap on both) so combinations
         like "Rescheduled" next to "External" no longer crowd/collapse
         into each other.
     (3) The status badge itself is now the click target for the quick
         status dropdown (same popover as before), with a chevron built
         into the badge and always visible, instead of a separate,
         easy-to-miss chevron-only icon button next to it.
   v23 NEW:
     (1) Reschedule time picker now hides quick-slot times (and "Other"
         hours) that have already passed whenever the new date is today —
         a completed time can no longer be picked, instead of just being
         shown and silently rejected. If the date changes to today after
         a past time was already picked, that time is cleared. Saving a
         reschedule for today with a past time now also fails with a
         clear inline error as a last-resort guard.
     (2) Follow-up note save failures now log the attempted field names
         and the record's actual field names to the console, to make it
         obvious which field name your PocketBase "meetings" collection
         actually needs (see saveFollowUpNote for details — PocketBase
         silently drops unknown fields instead of erroring, so guessing
         wrong looks identical to "nothing happened").
   v22 NEW:
     (1) Quick-status chevron is now visible by default (was opacity-0
         and effectively invisible against most row backgrounds) —
         it now has a border/background at baseline and pops fully
         on hover.
     (2) Reschedule fields (date/time/duration) in the Update panel
         now use the same quick-slot / chip UI as CreateMeetingPanel's
         Step 2 (Time & Duration), instead of native <input type=date/time>.
     (3) Fixed a status-button rendering bug: the selected state used
         `ring-2 ring-slate-900` stacked ON TOP of the badge's own
         `ring-1 ring-inset` — two competing ring box-shadows on
         adjacent buttons could visually bleed into each other. Now
         uses a plain border for the selected state.
     (4) Follow-up notes can now be edited inline from the detail
         panel (Edit button on the Follow-up Notes card) without
         opening the full Update panel.
   v17 (kept): quick status popover, notes popover, keyboard shortcuts,
         bulk selection, overdue banner, command palette, status-history
         trail, drag-and-drop/paste document picker.
   All prior functionality (search, filters, sort, pagination, the
   detail panel, edit/update/delete flows) is unchanged.
================================================================ */

import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  Calendar, CalendarClock, CheckCircle2, RotateCcw, XCircle,
  Clock, MapPin, Search, Plus, Edit2, Trash2, X, ChevronRight, ChevronLeft,
  ChevronDown, User, Briefcase, Tag, AlignLeft, FileText, Phone, Mail,
  ArrowUpDown, Loader2, RefreshCw, CalendarDays, Building2, Globe, StickyNote, Upload,
  Check, AlertTriangle, Command, History, Timer,
} from 'lucide-react';
import pb from '@/lib/pocketbase';
import CreateMeetingPanel, {
  WeekStrip, TimeSlotPicker, clampInt,
} from '@/components/CreateMeetingPanel';
import { showToast } from '@/components/Toaster';

/* ----------------------------- Global CSS / Animations ----------------------------- */

const CUSTOM_CSS = `
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

function CustomStyles() {
  return <style dangerouslySetInnerHTML={{ __html: CUSTOM_CSS }} />;
}

/* ----------------------------- Status Styling ----------------------------- */

const STATUS_STYLES: Record<string, { label: string; dot: string; badge: string }> = {
  scheduled:   { label: 'Scheduled',   dot: 'bg-violet-400',  badge: 'bg-violet-50 text-violet-700 ring-1 ring-inset ring-violet-600/20' },
  completed:   { label: 'Completed',   dot: 'bg-emerald-400', badge: 'bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-600/20' },
  rescheduled: { label: 'Rescheduled', dot: 'bg-amber-400',   badge: 'bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-600/20' },
  cancelled:   { label: 'Cancelled',   dot: 'bg-rose-400',    badge: 'bg-rose-50 text-rose-700 ring-1 ring-inset ring-rose-600/20' },
  rejected:    { label: 'Rejected',    dot: 'bg-slate-400',   badge: 'bg-slate-100 text-slate-600 ring-1 ring-inset ring-slate-500/20' },
};

/* v17: fixed order for the 1–5 keyboard shortcuts & the quick-status popover.
   v20: "Rejected" removed from the selectable set per request — STATUS_STYLES
   above is left intact so any existing "Rejected" records still render
   correctly everywhere else (badges, filters, history trail, etc.). */
const STATUS_ORDER = ['scheduled', 'completed', 'rescheduled', 'cancelled'];

/* ----------------------------- Follow-up date helpers (v20) ----------------------------- */

function pad2(n: number) { return String(n).padStart(2, '0'); }
function toISO(d: Date) { return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; }
function startOfDay(d: Date) { const c = new Date(d); c.setHours(0, 0, 0, 0); return c; }
const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const WEEKDAY_LETTERS = ['S','M','T','W','T','F','S'];

/* ---- v22: mirrors CreateMeetingPanel's Time & Duration UI (Step 2) ---- */
const QUICK_TIME_SLOTS = ['09:30','10:00','11:00','12:00','14:00','15:00','16:30','18:00'];
const PRESET_DURATIONS = [15, 30, 45, 60, 90, 120, 180];
const HOUR_OPTIONS = Array.from({ length: 12 }, (_, i) => String(i + 1));
const MINUTE_OPTIONS = ['00','05','10','15','20','25','30','35','40','45','50','55'];

function to12Hour(t: string) {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
}
function splitTo12(t: string) {
  if (!t) return { hour: '', minute: '00', ampm: 'AM' as 'AM' | 'PM' };
  const [h, m] = t.split(':').map(Number);
  return { hour: String(h % 12 || 12), minute: String(m).padStart(2, '0'), ampm: (h >= 12 ? 'PM' : 'AM') as 'AM' | 'PM' };
}
function to24Hour(h12: string, min: string, ap: string) {
  let h = Number(h12) % 12;
  if (ap === 'PM') h += 12;
  return `${String(h).padStart(2, '0')}:${min}`;
}
function formatDuration(m: number) {
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60), mm = m % 60;
  return mm === 0 ? `${h} hr` : `${h}h ${mm}m`;
}

/* Small app-styled calendar dropdown, future-and-today-only, used for the
   Update panel's Follow-up date instead of the native browser date input.
   v22: also reused for the reschedule "New Date" field. */
function FollowUpCalendar({
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
  const cells: { iso: string; day: number; isPast: boolean; isToday: boolean }[] = [];
  for (let i = 0; i < firstWeekday; i++) cells.push(null as any);
  for (let d = 1; d <= daysInMonth; d++) {
    const iso = `${year}-${pad2(month + 1)}-${pad2(d)}`;
    cells.push({ iso, day: d, isPast: iso < todayISO, isToday: iso === todayISO });
  }

  const isCurrentOrFutureMonth = year > new Date().getFullYear() ||
    (year === new Date().getFullYear() && month >= new Date().getMonth());

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
              disabled={isCurrentOrFutureMonth && month === new Date().getMonth() && year === new Date().getFullYear()}
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

const TYPE_CONFIG: Record<string, {
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

const getTypeConfig = (t: any) => TYPE_CONFIG[String(t || '').toLowerCase()] || null;

const PRIORITY_BADGE: Record<string, { badge: string; text: string; dot: string }> = {
  high:   { badge: 'bg-rose-50 text-rose-700 ring-1 ring-inset ring-rose-600/20',   text: 'text-rose-600',   dot: 'bg-rose-300' },
  medium: { badge: 'bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-600/20', text: 'text-amber-600', dot: 'bg-amber-300' },
  low:    { badge: 'bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-600/20', text: 'text-emerald-600', dot: 'bg-emerald-300' },
};

/* ---------------------------- KPI / Stat card config ---------------------------- */

const STAT_CARDS = [
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

const DIST_SEGMENTS = [
  { key: 'scheduled',   label: 'Scheduled',   bar: 'bg-violet-400' },
  { key: 'completed',   label: 'Completed',   bar: 'bg-emerald-400' },
  { key: 'rescheduled', label: 'Rescheduled', bar: 'bg-amber-400' },
  { key: 'cancelled',   label: 'Cancelled',   bar: 'bg-rose-400' },
];

const PER_PAGE_OPTIONS = [8, 12, 24, 48];

/* SOFT DELETE — collection that archives a full snapshot of a record before
   it's removed from its source collection, so it can be recovered later.
   Same archive collection used by the officers, employees and users pages. */
const ARCHIVE_COLLECTION = 'deleted_records';

/* ------------------------------- Sort options ------------------------------ */

const DEFAULT_SORT = 'created-desc';

const SORT_GROUPS: { group: string; options: { value: string; label: string }[] }[] = [
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

const ALL_SORT_OPTIONS = SORT_GROUPS.flatMap((g) => g.options);
const PRIORITY_WEIGHT: Record<string, number> = { high: 3, medium: 2, low: 1 };

function getPaginationRange(current: number, total: number): (number | 'dots')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  if (current <= 4) return [1, 2, 3, 4, 5, 'dots', total];
  if (current >= total - 3) return [1, 'dots', total - 4, total - 3, total - 2, total - 1, total];
  return [1, 'dots', current - 1, current, current + 1, 'dots', total];
}

/* --------------------------- Date helpers --------------------------- */

const toLocalISO = (d: Date) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

function dayTag(dateValue: any, statusKey: string): { label: string; cls: string } | null {
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
/* v17: best-effort activity trail. If the `status_history` field
   doesn't exist on your PocketBase schema, the write silently no-ops
   and everything else keeps working — exactly like the existing
   `status_note` / `notes` fallback pattern used elsewhere. */

function parseHistory(v: any): { status: string; date: string }[] {
  if (!v) return [];
  try {
    const parsed = typeof v === 'string' ? JSON.parse(v) : v;
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}

async function appendStatusHistory(id: string, existing: any, label: string) {
  try {
    const history = parseHistory(existing);
    history.push({ status: label, date: new Date().toISOString() });
    await pb.collection('meetings').update(id, { status_history: JSON.stringify(history.slice(-25)) });
  } catch { /* field may not exist on this schema — ignore */ }
}

/* --------------------------- follow-up note save helper (v23) --------------------------- */
/* Shared by the Update panel's Note field and the detail panel's inline
   editor — tries only field names that unambiguously mean "follow-up
   note" (never `notes` or `status_note`, which already mean something
   else on this schema — see the long comment in InlineUpdateStatusPanel
   for why that distinction matters). Returns the field name it
   succeeded on, or null if none worked.

   v23: PocketBase does NOT throw when you send a field that isn't in the
   collection's schema — it just silently drops it and still returns 200,
   so the try/catch below rarely fires. The real signal is whether the
   field comes back on the updated record with our value, which is what
   the `rec[field] === text` check does. If every candidate fails that
   check, none of those field names exist on this "meetings" collection —
   this logs the actual record keys to the console so it's easy to spot
   the real field name (or confirm one needs to be added) without
   guessing blind. */
async function saveFollowUpNote(meetingId: string, text: string): Promise<string | null> {
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
  } catch { /* ignore — the diagnostic itself failing shouldn't block anything */ }
  return null;
}

/* ------------------------- Animated count-up ------------------------- */

function AnimatedNumber({ value, duration = 900 }: { value: number; duration?: number }) {
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

function InfoTile({ icon: Icon, tint, label, children }: { icon: any; tint: string; label: string; children: ReactNode }) {
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
   ★ v17: QuickStatusPopover — fixed-position (escapes the table's overflow-hidden
   ancestor), opened by the small chevron next to a row's status badge. One click,
   optimistic update, no panel.
================================================================================= */

function QuickStatusPopover({ top, left, align, current, onPick, onClose }: {
  top: number; left: number; align: 'left' | 'right';
  current: string; onPick: (key: string) => void; onClose: () => void;
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
      style={{ top, [align]: left }}
      className="anim-scale-in fixed z-[75] w-48 rounded-2xl border border-slate-200 bg-white p-1.5 shadow-2xl shadow-slate-900/15"
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
   ★ v17: NotesPopover — quick preview of follow-up notes without opening the full
   detail panel. Fixed-position card with a link into the full panel.
================================================================================= */

function NotesPopover({ top, left, align, text, onOpenFull, onClose }: {
  top: number; left: number; align: 'left' | 'right';
  text: string; onOpenFull: () => void; onClose: () => void;
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
      style={{ top, [align]: left }}
      className="anim-scale-in fixed z-[75] w-72 rounded-2xl border border-amber-200 bg-white p-3.5 shadow-2xl shadow-slate-900/15"
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
   ★ v17: CommandPalette — Cmd/Ctrl+K. Fuzzy-search meetings by agenda/officer and
   jump to one, or start a new meeting.
================================================================================= */

function CommandPalette({ meetings, onClose, onSelectMeeting, onNewMeeting, getStatusStyle, getStatusKey, getMeetingTitle, formatDateShort }: {
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
   ★ Inline "Update Meeting" panel — MANUAL ONLY, zero automations.
   v22: reschedule Date/Time/Duration now use the same quick-slot UI as
   CreateMeetingPanel (FollowUpCalendar for date, RescheduleTimePicker for
   time, preset chips + custom input for duration) instead of native
   <input type=date/time/number>. Status-button selected state switched
   from a stacked ring to a plain border (fixes visual bleed onto
   neighboring buttons). Still: full "Follow up" section — Status,
   Follow-up date & Documents. Documents attach on Save.
================================================================================= */

function InlineUpdateStatusPanel({ meeting, onClose, onSaved }: { meeting: any; onClose: () => void; onSaved: () => void }) {
  /* v21: __forceStatus lets a caller (quick popover, keyboard shortcut) open
     this panel pre-selected on "Rescheduled" without having written that
     status yet, so the date/time/duration below are always asked for first. */
  const [status, setStatus] = useState<string>(() => String(meeting?.__forceStatus || meeting?.status || 'scheduled').toLowerCase());
  const [newDate, setNewDate] = useState<string>(() => String(meeting?.meeting_date || '').slice(0, 10) || '');
  const [newTime, setNewTime] = useState<string>(() => (String(meeting?.meeting_time || '').match(/\d{1,2}:\d{2}/)?.[0] || ''));
  const [newDuration, setNewDuration] = useState<string>(() => (meeting?.duration != null ? String(meeting.duration) : ''));
  /* v25: duration chip UI now matches CreateMeetingPanel's Step 2 exactly
     (preset chips + a custom hours/minutes mode), so this mirrors its
     isCustomMode/customHours/customMinutes state. */
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
  /* v23: if the new date is (or becomes) today and the already-picked time
     has since passed, clear it instead of silently keeping a "completed"
     time selected behind the scenes. */
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

  /* ── documents (same flow as CreateMeetingPanel v16) ──
     existingDocs → files already on the record
     pendingDocs  → newly picked files, uploaded on Save        */
  const [existingDocs, setExistingDocs] = useState<string[]>(() => {
    const v = meeting?.documents;
    if (!v) return [];
    try { return typeof v === 'string' ? JSON.parse(v) : v; } catch { return []; }
  });
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

  /* v17: drag & drop + paste, same behavior as CreateMeetingPanel's DocumentDropzone */
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

  const fileUrl = (filename: string) => {
    try {
      const anyPb = pb as any;
      if (anyPb.files?.getUrl) return anyPb.files.getUrl(meeting, filename);
      if (anyPb.getFileUrl) return anyPb.getFileUrl(meeting, filename);
    } catch { /* noop */ }
    return '';
  };

  /* PocketBase semantics: re-appending existing filenames KEEPS them;
     omitted names get deleted; File parts get added; '' clears all. */
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

    /* v21: Rescheduling always needs a new date, time & duration — this is
       what actually makes it a *reschedule* rather than just a label
       change, so all three are required before saving. */
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
    }

    setSaving(true);
    setError('');
    try {
      /* PocketBase select expects capitalized values ("Cancelled"),
      same as what CreateMeetingPanel saves — map key → label */
      const statusLabel = STATUS_STYLES[status]?.label || status;
      const payload: Record<string, any> = {
        status: statusLabel,
        status_flag: statusLabel,   // keep in sync — the create panel writes both
        follow_up_date: followUpDate,
      };

      if (status === 'rescheduled') {
        payload.meeting_date = newDate;
        payload.meeting_time = newTime;
        payload.duration = Number(newDuration) || newDuration;
      }
      await pb.collection('meetings').update(meeting.id, payload);

      /* v17: best-effort activity trail entry for this manual change */
      appendStatusHistory(meeting.id, meeting.status_history, statusLabel).catch(() => {});

      /* documents — attach now, same as the Create/Edit panel */
      await syncDocuments(meeting.id);

      /* Optional note — tried separately so an unknown field never blocks the
         status update. Only names that unambiguously mean "follow-up note"
         are tried (never `notes` or `status_note`, which already mean
         something else on this schema). If none of those exist, nothing
         is written — you get a clear toast instead of a silent, wrong-field
         save. */
      const trimmedNote = note.trim();
      if (trimmedNote) {
        const savedField = await saveFollowUpNote(meeting.id, trimmedNote);
        if (!savedField) {
          /* toast, not the inline `error` state — this panel closes via
             onSaved() right below, so an inline message would never be seen */
          showToast(
            'Status saved, but the note wasn’t stored — your "meetings" collection needs a text field named follow_up_notes (add one in PocketBase; followup_notes / follow_up / followup also work). See the browser console for the field names actually on this record.',
            'error'
          );
        }
      }
      onSaved();
    } catch (e: any) {
      setError(e?.message || 'Failed to update. Please try again.');
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

        {/* Body — everything here is manual */}
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
                      /* v22 FIX: was `${s.badge} ring-2 ring-slate-900` — stacking a
                         second ring on top of the badge's own `ring-1 ring-inset`
                         made two box-shadows compete, which could visually bleed
                         into the adjacent button at small gaps. A plain border
                         doesn't have that problem. */
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

          {/* Reschedule fields — only shown (and only saved) for Rescheduled.
              v25: Date/Time/Duration now reuse CreateMeetingPanel's own
              WeekStrip + TimeSlotPicker components and duration-chip layout
              (Step 2, "Date" / "Time & duration") verbatim, so the reschedule
              flow looks exactly like the create-meeting flow.
              v21: date/time/duration are all required to save a reschedule,
              and the new date can't be set in the past. */}
          {status === 'rescheduled' && (
            <div className="anim-fade-in space-y-3 rounded-2xl border border-amber-200 bg-amber-50/60 p-4">
              <p className="flex items-center gap-1.5 text-[11px] font-semibold text-amber-700">
                <RotateCcw className="h-3.5 w-3.5" />
                Rescheduling needs a new date, time & duration
              </p>

              {/* Date */}
              <div>
                <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-amber-700">New Date</label>
                <WeekStrip value={newDate} onChange={setNewDate} />
              </div>

              {/* Time & duration — side by side, exactly like CreateMeetingPanel Step 2 */}
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl border border-amber-200 bg-white p-3.5">
                  <label className="mb-2 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-amber-700">
                    <Clock className="h-3.5 w-3.5" /> New Time
                  </label>
                  <TimeSlotPicker value={newTime} onChange={setNewTime} meetingDate={newDate} />
                </div>

                <div className="rounded-2xl border border-amber-200 bg-white p-3.5">
                  <label className="mb-2 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-amber-700">
                    <Timer className="h-3.5 w-3.5" /> Duration
                  </label>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {PRESET_DURATIONS.map((m) => {
                      const active = !isCustomDuration && Number(newDuration) === m;
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
                </div>
              </div>
            </div>
          )}

          {/* Follow-up date (optional) */}
          <div>
            <label className="mb-2 block text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Follow-up date (optional)
            </label>
            <FollowUpCalendar value={followUpDate} onChange={setFollowUpDate} disabled={saving} />
            <p className="mt-1 text-[11px] text-slate-400">
              Only today or a future date can be chosen. Included in the Google Calendar sync when syncing is enabled.
            </p>
          </div>

          {/* Documents — attach before saving (v17: drag & drop / paste) */}
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
                  const url = fileUrl(name);
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

        {/* Footer — manual save only */}
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

export default function MeetingsPage() {
  const [meetings, setMeetings] = useState<any[]>([]);
  const [selectedMeeting, setSelectedMeeting] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [priorityFilter, setPriorityFilter] = useState<string>('all');

  const [sortBy, setSortBy] = useState<string>(DEFAULT_SORT);

  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const [editingMeeting, setEditingMeeting] = useState<any>(null);

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  /* proper modal for bulk (soft) delete */
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false);

  const [updateMeeting, setUpdateMeeting] = useState<any>(null);

  /* ★ Follow-up notes expand state for the detail panel */
  const [followUpOpen, setFollowUpOpen] = useState(false);

  /* ★ v22: inline follow-up note editor state (detail panel) */
  const [followUpEditing, setFollowUpEditing] = useState(false);
  const [followUpDraft, setFollowUpDraft] = useState('');
  const [followUpSaving, setFollowUpSaving] = useState(false);

  /* Pagination state */
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(8);

  /* ★ v17: quick status popover (row chevron) */
  const [quickStatus, setQuickStatus] = useState<{ id: string; top: number; left: number; align: 'left' | 'right' } | null>(null);
  const [hoveredRowId, setHoveredRowId] = useState<string | null>(null);
  /* ★ v24: mirrors hoveredRowId but updates synchronously (no re-render
     lag) and is the source of truth the 1-4 keyboard shortcut reads from —
     see the shortcut's useEffect below for why this fixes the "changes a
     different meeting" bug. */
  const hoveredRowIdRef = useRef<string | null>(null);

  /* ★ v17: notes popover (StickyNote badge) */
  const [notesPopover, setNotesPopover] = useState<{ id: string; top: number; left: number; align: 'left' | 'right'; text: string } | null>(null);

  /* ★ v17: bulk selection */
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);

  /* ★ v17: overdue banner */
  const [overdueDismissed, setOverdueDismissed] = useState(false);

  /* ★ v17: command palette */
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);

  /* ★ v24: the meetings table's DOM node, so the overdue banner's "Review
     now" button can smooth-scroll straight to it instead of leaving the
     user to scroll past the KPI cards manually. */
  const tableRef = useRef<HTMLDivElement>(null);

  const [distMounted, setDistMounted] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setDistMounted(true), 150);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => { loadData(); }, []);

  useEffect(() => { setPage(1); }, [searchQuery, statusFilter, typeFilter, priorityFilter, sortBy, perPage]);

  /* Reset the follow-up expansion/edit state whenever a different meeting is opened */
  useEffect(() => {
    setFollowUpOpen(false);
    setFollowUpEditing(false);
    setFollowUpDraft('');
  }, [selectedMeeting?.id]);

  const anyModalOpen = isPanelOpen || !!updateMeeting || !!selectedMeeting || showDeleteConfirm || showBulkDeleteConfirm || commandPaletteOpen;

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'Escape' || isPanelOpen || updateMeeting) return;
      if (showBulkDeleteConfirm) setShowBulkDeleteConfirm(false);
      else if (showDeleteConfirm) setShowDeleteConfirm(false);
      else if (commandPaletteOpen) setCommandPaletteOpen(false);
      else setSelectedMeeting(null);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedMeeting, showDeleteConfirm, showBulkDeleteConfirm, isPanelOpen, updateMeeting, commandPaletteOpen]);

  /* ★ v24: global shortcuts — Cmd/Ctrl+K for the command palette, N for
     new meeting, 1–4 to set status. All skipped while typing in an
     input/textarea/select, or while any modal is open.

     FIX for "pressing 1-4 changes a DIFFERENT meeting than the one I
     picked": this used to always target whichever row `hoveredRowId`
     last pointed at via onMouseEnter/onMouseLeave — state that can go
     stale (a re-render, a popover opening/closing, or a fast scroll can
     leave it pointing at a row the mouse isn't over anymore). Two
     changes fix it:
       1) If you've checkbox-SELECTED meeting(s) in the list, 1-4 now
          targets those selected meetings and ignores hover entirely —
          "selecting a particular meeting" now does what it sounds like.
       2) With nothing checkbox-selected, 1-4 still falls back to the
          hovered row, but reads it from `hoveredRowIdRef` (kept in sync
          live by onMouseMove, not just enter/leave — see the row
          handlers below) instead of the possibly-stale React state. */
  useEffect(() => {
    function isTypingTarget() {
      const tag = (document.activeElement?.tagName || '').toLowerCase();
      return tag === 'input' || tag === 'textarea' || tag === 'select';
    }
    function onKey(e: KeyboardEvent) {
      const meta = e.metaKey || e.ctrlKey;
      if (meta && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setCommandPaletteOpen((v) => !v);
        return;
      }
      if (anyModalOpen || isTypingTarget()) return;

      if (e.key.toLowerCase() === 'n' && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        openCreate();
        return;
      }

      const idx = ['1', '2', '3', '4'].indexOf(e.key);
      if (idx === -1 || !STATUS_ORDER[idx]) return;
      const targetStatus = STATUS_ORDER[idx];

      /* Checkbox selection always wins over hover — it's explicit, so it
         can never be confused with "whatever the mouse happens to be
         over right now". */
      if (selectedIds.size > 0) {
        e.preventDefault();
        bulkUpdateStatus(targetStatus);
        return;
      }

      const liveHoverId = hoveredRowIdRef.current;
      if (liveHoverId) {
        const m = meetings.find((mm) => mm.id === liveHoverId);
        if (m) {
          e.preventDefault();
          updateStatusInline(m, targetStatus);
        }
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meetings, anyModalOpen, selectedIds]);

  /* ★ v24: a scroll or a tab/window blur can move the row out from under
     the pointer without ever firing that row's onMouseLeave — the classic
     way `hoveredRowId` used to go stale and let 1-4 hit the wrong
     meeting. Clearing it on both events closes that gap. */
  useEffect(() => {
    function clearHover() {
      hoveredRowIdRef.current = null;
      setHoveredRowId(null);
    }
    window.addEventListener('scroll', clearHover, true);
    window.addEventListener('blur', clearHover);
    return () => {
      window.removeEventListener('scroll', clearHover, true);
      window.removeEventListener('blur', clearHover);
    };
  }, []);

  const openCreate = () => {
    setEditingMeeting(null);
    setIsPanelOpen(true);
  };

  async function loadData() {
    try {
      setLoading(true);
      const meetingsData = await pb.collection('meetings').getFullList({ sort: '-created_date' });
      /* Deleted meetings are archived into `deleted_records` and removed
         from this collection (see confirmDelete/performBulkDelete below),
         so nothing needs filtering here. The `!m.deleted` check is kept
         only so any meeting soft-deleted by the OLD flag-based approach
         (before this change) still stays hidden until it's cleaned up. */
      setMeetings(meetingsData.filter((m: any) => !m.deleted));
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  }

  /* Fetch the freshest FULL record before opening edit/update */
  const fetchFreshMeeting = async (id: string) => {
    try {
      return await pb.collection('meetings').getOne(id);
    } catch {
      return null;
    }
  };

  const handleEdit = async () => {
    if (!selectedMeeting) return;
    const snapshot = selectedMeeting;
    setSelectedMeeting(null);
    const fresh = await fetchFreshMeeting(snapshot.id);
    setEditingMeeting(fresh || snapshot);
    setIsPanelOpen(true);
  };

  const handleOpenUpdate = async () => {
    if (!selectedMeeting) return;
    const snapshot = selectedMeeting;
    setSelectedMeeting(null);
    const fresh = await fetchFreshMeeting(snapshot.id);
    setUpdateMeeting(fresh || snapshot);
  };

  const handlePanelSaved = () => {
    setIsPanelOpen(false);
    setEditingMeeting(null);
    loadData();
  };

  const handlePanelClosed = () => {
    setIsPanelOpen(false);
    setEditingMeeting(null);
  };

  /* Soft delete: a full snapshot of the record is archived into
     `deleted_records` first — the same archive collection the officers,
     employees and users pages use — and only then removed from `meetings`,
     so a meeting can never be permanently wiped out by an accidental (or
     malicious) click. If the archive step fails, the meeting is left
     untouched (nothing is lost). */
  const confirmDelete = async () => {
    if (!selectedMeeting || deleting) return;
    setDeleting(true);
    let failedStep: 'archive' | 'delete' = 'archive';
    try {
      const { id: originalId, ...recordData } = selectedMeeting;

      await pb.collection(ARCHIVE_COLLECTION).create({
        original_collection: 'meetings',
        original_id: originalId,
        record_type: 'Meeting',
        record_data: recordData,
        deleted_at: new Date().toISOString(),
      });

      failedStep = 'delete';
      await pb.collection('meetings').delete(selectedMeeting.id);

      showToast('Meeting deleted', 'success');
      setSelectedMeeting(null);
      setShowDeleteConfirm(false);
      loadData();
    } catch {
      showToast(
        failedStep === 'archive'
          ? 'Failed to archive this meeting before deleting it. Please try again.'
          : 'This meeting was archived, but the delete step failed. Please try again.',
        'error'
      );
    } finally {
      setDeleting(false);
    }
  };

  /* -------------------------------- Helpers -------------------------------- */

  const dateToTime = (value: any): number => {
    if (!value) return 0;
    const normalized = String(value).trim().replace(' ', 'T');
    const time = new Date(normalized).getTime();
    return Number.isNaN(time) ? 0 : time;
  };

  const formatDateTime = (value: any): string => {
    const ts = dateToTime(value);
    if (!ts) return '—';
    const date = new Date(ts);
    return `${date.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' })} · ${date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`;
  };

  const formatDateShort = (value: any): string => {
    const raw = String(value || '');
    const iso = raw.length > 10 ? raw.slice(0, 10) : raw;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return '—';
    return new Date(`${iso}T00:00:00`).toLocaleDateString('en-US', { day: 'numeric', month: 'short' });
  };

  const meetingDateTs = (m: any) => dateToTime(m.meeting_date) || dateToTime(m.created_date);
  const createdTs = (m: any) => dateToTime(m.created_date) || dateToTime(m.updated_date) || 0;

  const timeMinutes = (m: any): number | null => {
    const t = String(m.meeting_time || '');
    if (!t.includes(':')) return null;
    const [h, min] = t.split(':');
    const hNum = parseInt(h, 10);
    const mNum = parseInt(min, 10);
    if (Number.isNaN(hNum) || Number.isNaN(mNum)) return null;
    return hNum * 60 + mNum;
  };

  const priorityWeight = (m: any) => PRIORITY_WEIGHT[String(m.priority || '').toLowerCase()] || 0;

  const formatTimeDisplay = (timeString: string): string => {
    if (!timeString) return '—';
    const match = timeString.trim().match(/(\d{1,2}):(\d{2})(?:\s*(AM|PM))?/i);
    if (!match) return timeString.includes(':') ? timeString : '—';
    const hour = parseInt(match[1], 10);
    const minutes = match[2];
    const meridiem = match[3]?.toUpperCase();
    if (meridiem) return `${hour % 12 || 12}:${minutes} ${meridiem}`;
    const modifier = hour >= 12 ? 'PM' : 'AM';
    return `${hour % 12 || 12}:${minutes} ${modifier}`;
  };

  const formatDate = (dateString: any) => {
    if (!dateString) return null;
    try {
      const raw = String(dateString).trim();
      const isoDateOnly = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
      const normalized = raw.includes(' ') ? raw.replace(' ', 'T') : raw;
      const date = isoDateOnly
        ? new Date(Number(isoDateOnly[1]), Number(isoDateOnly[2]) - 1, Number(isoDateOnly[3]))
        : new Date(normalized);
      if (Number.isNaN(date.getTime())) return null;
      return {
        day: date.getDate(),
        month: date.toLocaleString('default', { month: 'short' }),
        year: date.getFullYear(),
        weekday: date.toLocaleDateString('en-US', { weekday: 'long' }),
        full: date.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' }),
      };
    } catch { return null; }
  };

  const getMeetingTitle = (meeting: any) => meeting.agenda || meeting.title || 'General Discussion';

  const getStatusKey = (meeting: any) => (meeting.status || 'Scheduled').toLowerCase();
  const getStatusStyle = (key: string) =>
    STATUS_STYLES[key] || {
      label: key.replace(/\b\w/g, (c) => c.toUpperCase()),
      dot: 'bg-gray-400',
      badge: 'bg-gray-100 text-gray-600 ring-1 ring-inset ring-gray-500/20',
    };

  const statusCount = (key: string) => meetings.filter((m) => getStatusKey(m) === key).length;

  const internalCount = meetings.filter((m) => String(m.meeting_type || '').toLowerCase() === 'internal').length;
  const externalCount = meetings.filter((m) => String(m.meeting_type || '').toLowerCase() === 'external').length;

  /* ------------------------------- v17: quick status / bulk / popovers ------------------------------- */

  /* Optimistic status update — flips the badge immediately, writes in the
     background, and rolls back with an alert if the write fails.
     v21: "Rescheduled" is the one status that always needs more input (a new
     date, time & duration), so a quick popover pick or a 1–4 keyboard
     shortcut never writes it blind — it opens the full Update panel,
     pre-selected on Rescheduled, instead. */
  async function updateStatusInline(meeting: any, key: string) {
    setQuickStatus(null);
    if (key === 'rescheduled') {
      const fresh = await fetchFreshMeeting(meeting.id);
      setUpdateMeeting({ ...(fresh || meeting), __forceStatus: 'rescheduled' });
      return;
    }
    const label = STATUS_STYLES[key]?.label || key;
    const prevSnapshot = meetings;
    setMeetings((prev) => prev.map((m) => (m.id === meeting.id ? { ...m, status: label, status_flag: label } : m)));
    try {
      await pb.collection('meetings').update(meeting.id, { status: label, status_flag: label });
      appendStatusHistory(meeting.id, meeting.status_history, label).catch(() => {});
    } catch {
      setMeetings(prevSnapshot);
      showToast('Failed to update status. Please try again.', 'error');
    }
  }

  function openQuickStatus(e: React.MouseEvent, meeting: any) {
    e.stopPropagation();
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const align: 'left' | 'right' = rect.left > window.innerWidth / 2 ? 'right' : 'left';
    setQuickStatus({
      id: meeting.id,
      top: rect.bottom + 6,
      left: align === 'right' ? window.innerWidth - rect.right : rect.left,
      align,
    });
  }

  function openNotesPopover(e: React.MouseEvent, meeting: any, text: string) {
    e.stopPropagation();
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const align: 'left' | 'right' = rect.left > window.innerWidth / 2 ? 'right' : 'left';
    setNotesPopover({
      id: meeting.id,
      top: rect.bottom + 6,
      left: align === 'right' ? window.innerWidth - rect.right : rect.left,
      align,
      text,
    });
  }

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function clearSelection() { setSelectedIds(new Set()); }

  async function bulkUpdateStatus(key: string) {
    if (bulkBusy || selectedIds.size === 0) return;
    const label = STATUS_STYLES[key]?.label || key;
    const count = selectedIds.size;
    const ids = Array.from(selectedIds);
    setBulkBusy(true);
    const prevSnapshot = meetings;
    setMeetings((prev) => prev.map((m) => (selectedIds.has(m.id) ? { ...m, status: label, status_flag: label } : m)));
    try {
      await Promise.all(ids.map((id) => pb.collection('meetings').update(id, { status: label, status_flag: label })));
      ids.forEach((id) => {
        const m = prevSnapshot.find((mm) => mm.id === id);
        appendStatusHistory(id, m?.status_history, label).catch(() => {});
      });
      clearSelection();
      showToast(`Marked ${count} meeting${count > 1 ? 's' : ''} as ${label}`, 'success');
    } catch {
      setMeetings(prevSnapshot);
      showToast('Some meetings could not be updated. Please try again.', 'error');
    } finally {
      setBulkBusy(false);
    }
  }

  /* Bulk soft delete: archives a full snapshot of every selected record
     into `deleted_records`, then removes it from `meetings` — same
     reasoning and same archive collection as the single-meeting delete
     above, so a bulk click can't wipe out records either. Each meeting is
     archived-then-deleted as one unit, so a meeting that fails to archive
     is simply left alone rather than deleted without a backup. */
  async function performBulkDelete() {
    if (bulkBusy || selectedIds.size === 0) return;
    const count = selectedIds.size;
    const ids = Array.from(selectedIds);
    setBulkBusy(true);
    try {
      const deletedAt = new Date().toISOString();
      const results = await Promise.allSettled(
        ids.map(async (id) => {
          const record = meetings.find((m) => m.id === id);
          if (!record) throw new Error('Meeting not found in current list');
          const { id: originalId, ...recordData } = record;

          await pb.collection(ARCHIVE_COLLECTION).create({
            original_collection: 'meetings',
            original_id: originalId,
            record_type: 'Meeting',
            record_data: recordData,
            deleted_at: deletedAt,
          });
          await pb.collection('meetings').delete(id);
          return id;
        })
      );

      const succeededIds = new Set(
        results
          .filter((r): r is PromiseFulfilledResult<string> => r.status === 'fulfilled')
          .map((r) => r.value)
      );
      const failedCount = results.length - succeededIds.size;

      setMeetings((prev) => prev.filter((m) => !succeededIds.has(m.id)));
      clearSelection();
      setShowBulkDeleteConfirm(false);

      if (failedCount === 0) {
        showToast(`Deleted ${count} meeting${count > 1 ? 's' : ''}`, 'success');
      } else {
        showToast(
          `Deleted ${succeededIds.size} of ${count} meetings — ${failedCount} could not be archived/deleted. Please try again.`,
          'error'
        );
      }
    } catch {
      showToast('Some meetings could not be deleted. Please try again.', 'error');
      loadData();
    } finally {
      setBulkBusy(false);
    }
  }

  /* ------------------------------- v22: inline follow-up note edit ------------------------------- */

  function startFollowUpEdit(currentText: string) {
    setFollowUpDraft(currentText);
    setFollowUpEditing(true);
    setFollowUpOpen(true);
  }

  async function saveFollowUpEdit() {
    if (!selectedMeeting?.id || followUpSaving) return;
    const trimmed = followUpDraft.trim();
    setFollowUpSaving(true);
    try {
      const savedField = await saveFollowUpNote(selectedMeeting.id, trimmed);
      if (!savedField) {
        showToast(
          'Couldn’t save the note — your "meetings" collection needs a text field named follow_up_notes (followup_notes / follow_up / followup also work). See the browser console for the field names actually on this record.',
          'error'
        );
        return;
      }
      /* reflect immediately in both the open detail panel and the list,
         under whichever field name actually accepted the write */
      setSelectedMeeting((prev: any) => (prev ? { ...prev, [savedField]: trimmed } : prev));
      setMeetings((prev) => prev.map((m) => (m.id === selectedMeeting.id ? { ...m, [savedField]: trimmed } : m)));
      setFollowUpEditing(false);
      showToast('Follow-up note saved', 'success');
    } catch {
      showToast('Failed to save the note. Please try again.', 'error');
    } finally {
      setFollowUpSaving(false);
    }
  }

  /* ------------------------------- Filtering ------------------------------- */

  const filteredMeetings = meetings
    .filter((meeting) => {
      const title = getMeetingTitle(meeting).toLowerCase();
      const matchesSearch =
        searchQuery === '' ||
        title.includes(searchQuery.toLowerCase()) ||
        (meeting.location || '').toLowerCase().includes(searchQuery.toLowerCase());
      const matchesStatus = statusFilter === 'all' || getStatusKey(meeting) === statusFilter;

      const matchesType =
        typeFilter === 'all' ||
        String(meeting.meeting_type || '').toLowerCase() === typeFilter;

      const matchesPriority =
        priorityFilter === 'all' ||
        String(meeting.priority || '').toLowerCase() === priorityFilter;

      return matchesSearch && matchesStatus && matchesType && matchesPriority;
    })
    .sort((a: any, b: any) => {
      switch (sortBy) {
        case 'created-asc': return createdTs(a) - createdTs(b);
        case 'date-desc': return meetingDateTs(b) - meetingDateTs(a) || createdTs(b) - createdTs(a);
        case 'date-asc':  return meetingDateTs(a) - meetingDateTs(b) || createdTs(b) - createdTs(a);
        case 'time-asc':
        case 'time-desc': {
          const aT = timeMinutes(a);
          const bT = timeMinutes(b);
          if (aT === null && bT === null) return createdTs(b) - createdTs(a);
          if (aT === null) return 1;
          if (bT === null) return -1;
          const diff = sortBy === 'time-asc' ? aT - bT : bT - aT;
          return diff !== 0 ? diff : createdTs(b) - createdTs(a);
        }
        case 'duration-desc': return (Number(b.duration) || 0) - (Number(a.duration) || 0) || createdTs(b) - createdTs(a);
        case 'duration-asc':  return (Number(a.duration) || 0) - (Number(b.duration) || 0) || createdTs(b) - createdTs(a);
        case 'priority-desc': return priorityWeight(b) - priorityWeight(a) || createdTs(b) - createdTs(a);
        case 'priority-asc':  return priorityWeight(a) - priorityWeight(b) || createdTs(b) - createdTs(a);
        case 'agenda-asc':  return getMeetingTitle(a).localeCompare(getMeetingTitle(b)) || createdTs(b) - createdTs(a);
        case 'agenda-desc': return getMeetingTitle(b).localeCompare(getMeetingTitle(a)) || createdTs(b) - createdTs(a);
        case 'officer-asc':  return String(a.officer_name || '').localeCompare(String(b.officer_name || '')) || createdTs(b) - createdTs(a);
        case 'officer-desc': return String(b.officer_name || '').localeCompare(String(a.officer_name || '')) || createdTs(b) - createdTs(a);
        default: return createdTs(b) - createdTs(a);
      }
    });

  /* ------------------------------- Pagination ------------------------------ */

  const totalPages = Math.max(1, Math.ceil(filteredMeetings.length / perPage));
  const currentPage = Math.min(page, totalPages);
  const startIndex = (currentPage - 1) * perPage;
  const endIndex = Math.min(startIndex + perPage, filteredMeetings.length);
  const paginatedMeetings = filteredMeetings.slice(startIndex, endIndex);
  const paginationRange = getPaginationRange(currentPage, totalPages);

  const activeSortLabel = ALL_SORT_OPTIONS.find((o) => o.value === sortBy)?.label ?? 'Newest Created';

  /* ------------------------------ Distribution ----------------------------- */

  const totalAll = meetings.length || 1;
  const distData = DIST_SEGMENTS
    .map((s) => ({ ...s, count: statusCount(s.key) }))
    .filter((s) => s.count > 0);

  /* ------------------------------ v17: overdue banner ----------------------------- */

  const overdueMeetings = meetings.filter(
    (m) => getStatusKey(m) === 'scheduled' && dayTag(m.meeting_date || m.created_date, 'scheduled')?.label === 'Overdue'
  );

  /* ------------------------------ v25: KPI card click ----------------------------- */
  /* Sets the status filter AND smooth-scrolls down to the meetings table,
     the same way the overdue banner's "Review now" button already does —
     so clicking a KPI card jumps straight to the filtered results instead
     of leaving the user to scroll down past the stat cards/search bar
     manually. */
  function handleStatCardClick(key: string) {
    setStatusFilter(key);
    requestAnimationFrame(() => {
      tableRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  /* ------------------------------ Skeleton View ----------------------------- */

  if (loading) {
    return (
      <div className="meetings-root relative min-h-screen bg-gradient-to-br from-indigo-200 via-violet-100 to-purple-200 p-2.5 sm:p-5 lg:p-8">
        <CustomStyles />
        <div aria-hidden className="pointer-events-none fixed inset-0 overflow-hidden">
          <div className="absolute -left-32 -top-32 h-96 w-96 rounded-full bg-violet-300/40 blur-3xl" />
          <div className="absolute -right-32 top-1/4 h-96 w-96 rounded-full bg-sky-300/30 blur-3xl" />
        </div>

        <div className="anim-fade-in relative mx-auto max-w-[1500px] overflow-hidden rounded-[1.75rem] bg-white shadow-2xl shadow-violet-300/40 ring-1 ring-white/70">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3.5 sm:px-6">
            <div className="flex items-center gap-3">
              <div className="skeleton h-9 w-9 rounded-xl" />
              <div className="space-y-2">
                <div className="skeleton h-4 w-32 rounded-full" />
                <div className="skeleton h-3 w-44 rounded-full" />
              </div>
            </div>
            <div className="skeleton h-10 w-36 rounded-full" />
          </div>

          <div className="space-y-6 bg-[#f7f6fd] p-4 sm:p-6 lg:p-7">
            <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="skeleton h-[126px] rounded-3xl" style={{ animationDelay: `${i * 80}ms` }} />
              ))}
            </div>
            <div className="space-y-2 rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-100">
              <div className="skeleton h-3 w-40 rounded-full" />
              <div className="skeleton h-2.5 w-full rounded-full" />
            </div>
            <div className="skeleton h-[74px] rounded-3xl" />
            <div className="rounded-3xl bg-white shadow-sm ring-1 ring-slate-100">
              <div className="skeleton h-[60px] rounded-t-3xl" />
              <div className="divide-y divide-slate-100">
                {[...Array(6)].map((_, i) => (
                  <div key={i} className="flex items-center gap-4 p-5">
                    <div className="skeleton h-14 w-12 rounded-2xl" />
                    <div className="flex-1 space-y-2.5">
                      <div className="skeleton h-4 w-2/3 rounded-full" />
                      <div className="skeleton h-3 w-1/3 rounded-full" />
                    </div>
                    <div className="skeleton h-6 w-24 rounded-full" />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  /* -------------------------------- Main View ------------------------------- */

  return (
    <div className="meetings-root relative min-h-screen bg-gradient-to-br from-indigo-200 via-violet-100 to-purple-200 p-2.5 sm:p-5 lg:p-8">
      <CustomStyles />

      <div aria-hidden className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="anim-blob absolute -left-32 -top-32 h-96 w-96 rounded-full bg-violet-300/40 blur-3xl" />
        <div className="anim-blob absolute -right-32 top-1/4 h-96 w-96 rounded-full bg-sky-300/30 blur-3xl" style={{ animationDelay: '-3s' }} />
        <div className="anim-blob absolute -bottom-32 left-1/3 h-96 w-96 rounded-full bg-fuchsia-300/25 blur-3xl" style={{ animationDelay: '-6s' }} />
      </div>

      <div className="relative mx-auto max-w-[1500px] overflow-hidden rounded-[1.75rem] bg-white shadow-2xl shadow-violet-300/40 ring-1 ring-white/70">

        {/* ------------------------------- App bar ------------------------------ */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 bg-white px-4 py-3.5 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-900 text-white shadow-sm">
              <CalendarClock className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <p className="truncate text-sm font-bold text-slate-900">Meetings</p>
                <span className="rounded-full bg-violet-50 px-2 py-0.5 text-[10px] font-bold tabular-nums text-violet-600 ring-1 ring-inset ring-violet-500/15">
                  {meetings.length}
                </span>
              </div>
              <p className="truncate text-[11px] text-slate-400">
                {new Date().toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'long' })}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setCommandPaletteOpen(true)}
              className="hidden items-center gap-2 rounded-full border border-slate-200 bg-white px-3.5 py-2.5 text-xs font-semibold text-slate-500 transition-colors hover:border-violet-200 hover:text-violet-600 sm:inline-flex"
            >
              <Command className="h-3.5 w-3.5" />
              Search
              <kbd className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-400">⌘K</kbd>
            </button>

            <button
              onClick={openCreate}
              className="group inline-flex items-center justify-center gap-2 rounded-full bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-slate-900/10 transition-all duration-300 hover:-translate-y-0.5 hover:bg-slate-800 active:scale-[0.98]"
            >
              <Plus className="h-4 w-4 transition-transform duration-300 group-hover:rotate-90" />
              New Meeting
              <kbd className="ml-1 hidden rounded-md bg-white/20 px-1.5 py-0.5 text-[10px] font-bold ring-1 ring-inset ring-white/30 sm:inline">N</kbd>
            </button>
          </div>
        </div>

        {/* ------------------------------- Content ------------------------------ */}
        <div className="space-y-6 bg-[#f7f6fd] p-4 sm:p-6 lg:p-7">

          {/* ------------------------- v17: Overdue banner ------------------------ */}
          {overdueMeetings.length > 0 && !overdueDismissed && (
            <div className="anim-fade-up flex items-center gap-3 rounded-3xl border border-rose-200 bg-rose-50 px-4 py-3.5 shadow-sm sm:px-5">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-rose-100 text-rose-600">
                <AlertTriangle className="h-4 w-4" />
              </span>
              <p className="min-w-0 flex-1 text-sm font-semibold text-rose-800">
                {overdueMeetings.length} meeting{overdueMeetings.length > 1 ? 's are' : ' is'} overdue — still marked Scheduled past their date.
              </p>
              <button
                onClick={() => {
                  setStatusFilter('scheduled');
                  setSortBy('date-asc');
                  /* v24: scroll the meetings table into view so overdue rows
                     (now filtered to the top) don't require a manual scroll
                     past the KPI cards to find. */
                  requestAnimationFrame(() => {
                    tableRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                  });
                }}
                className="shrink-0 rounded-full bg-rose-600 px-3.5 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-rose-700"
              >
                Review now
              </button>
              <button
                onClick={() => setOverdueDismissed(true)}
                aria-label="Dismiss"
                className="shrink-0 rounded-full p-1.5 text-rose-400 transition-colors hover:bg-rose-100 hover:text-rose-600"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          )}

          {/* ------------------------------ Status Stats ---------------------------- */}
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5">
            {STAT_CARDS.map((stat, i) => {
              const Icon = stat.icon;
              const count = stat.key === 'all' ? meetings.length : statusCount(stat.key);
              const active = statusFilter === stat.key;
              return (
                <button
                  key={stat.key}
                  onClick={() => handleStatCardClick(stat.key)}
                  style={{ animationDelay: `${120 + i * 70}ms` }}
                  className={`anim-fade-up group relative w-full overflow-hidden rounded-3xl bg-gradient-to-br p-5 text-left transition-all duration-300 hover:-translate-y-1 hover:shadow-lg hover:shadow-slate-900/[0.08] active:scale-[0.98] ${stat.card} ${
                    active ? 'shadow-md shadow-slate-900/10 -translate-y-0.5' : ''
                  }`}
                >
                  <span aria-hidden className="pointer-events-none absolute -right-6 -top-6 h-20 w-20 rounded-full bg-white/50 transition-transform duration-300 group-hover:scale-125" />
                  <div className="relative flex items-start justify-between">
                    <p className="pt-1.5 text-sm font-semibold text-slate-600">{stat.label}</p>
                    <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/80 shadow-sm transition-transform duration-300 group-hover:scale-110 ${stat.iconTint}`}>
                      <Icon className="h-5 w-5" />
                    </span>
                  </div>
                  <div className="relative mt-3 flex items-end justify-between gap-2">
                    <span className="text-[2rem] font-extrabold leading-none tracking-tight text-slate-900">
                      <AnimatedNumber value={count} />
                    </span>
                    <span className="pb-1 text-[10px] font-semibold text-slate-500/80">
                      {Math.round((count / totalAll) * 100)}% of total
                    </span>
                  </div>
                  <p className="relative mt-1.5 text-xs font-medium text-slate-500/80">{stat.caption}</p>
                </button>
              );
            })}
          </div>

          {/* --------------------------- Distribution bar --------------------------- */}
          {distData.length > 0 && (
            <div className="anim-fade-up rounded-3xl bg-white px-5 py-4 shadow-sm ring-1 ring-slate-100" style={{ animationDelay: '420ms' }}>
              <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  <span className="h-1.5 w-1.5 rounded-full bg-gradient-to-r from-violet-400 to-indigo-400" />
                  Status distribution
                </div>
                <div className="flex flex-wrap items-center gap-x-3.5 gap-y-1">
                  {distData.map((s) => (
                    <span key={s.key} className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-slate-500">
                      <span className={`h-2 w-2 rounded-full ${s.bar}`} />
                      {s.label}
                      <span className="tabular-nums text-slate-400">{s.count}</span>
                    </span>
                  ))}
                </div>
              </div>
              <div className="flex h-2 w-full gap-1 overflow-hidden rounded-full bg-slate-100">
                {distData.map((s, i) => (
                  <div
                    key={s.key}
                    title={`${s.label}: ${s.count}`}
                    className={`h-full rounded-full ${s.bar} transition-all duration-700 ease-out`}
                    style={{
                      width: distMounted ? `${(s.count / totalAll) * 100}%` : '0%',
                      transitionDelay: `${i * 90}ms`,
                    }}
                  />
                ))}
              </div>
            </div>
          )}

          {/* ------------------------------- Search Bar ----------------------------- */}
          <div className="anim-fade-up rounded-3xl bg-white p-4 shadow-sm ring-1 ring-slate-100 lg:p-5" style={{ animationDelay: '220ms' }}>
            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap lg:items-center">

              <div className="relative min-w-[180px] flex-1 lg:max-w-md">
                <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search by agenda, location..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full rounded-full border border-slate-200 bg-slate-50/80 py-2.5 pl-11 pr-10 text-sm text-slate-900 placeholder-slate-400 transition-all duration-200 hover:border-slate-300 hover:bg-white focus:border-violet-400 focus:bg-white focus:outline-none focus:ring-4 focus:ring-violet-500/10"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 rounded-full p-1 text-slate-400 transition-all hover:bg-slate-100 hover:text-slate-600 active:scale-90"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>

              <div className="relative">
                <Briefcase className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <select
                  value={typeFilter}
                  onChange={(e) => setTypeFilter(e.target.value)}
                  className="w-full cursor-pointer appearance-none rounded-full border border-slate-200 bg-slate-50/80 py-2.5 pl-11 pr-9 text-sm font-medium text-slate-700 transition-all duration-200 hover:border-slate-300 hover:bg-white focus:border-violet-400 focus:bg-white focus:outline-none focus:ring-4 focus:ring-violet-500/10 sm:w-44"
                >
                  <option value="all">All Types</option>
                  <option value="internal">🟣 Internal</option>
                  <option value="external">🔵 External</option>
                </select>
                <ChevronDown className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              </div>

              <div className="relative">
                <Tag className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <select
                  value={priorityFilter}
                  onChange={(e) => setPriorityFilter(e.target.value)}
                  className="w-full cursor-pointer appearance-none rounded-full border border-slate-200 bg-slate-50/80 py-2.5 pl-11 pr-9 text-sm font-medium text-slate-700 transition-all duration-200 hover:border-slate-300 hover:bg-white focus:border-violet-400 focus:bg-white focus:outline-none focus:ring-4 focus:ring-violet-500/10 sm:w-44"
                >
                  <option value="all">All Priorities</option>
                  <option value="high">High</option>
                  <option value="medium">Medium</option>
                  <option value="low">Low</option>
                </select>
                <ChevronDown className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              </div>

              <div className="relative">
                <ArrowUpDown className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value)}
                  className="w-full cursor-pointer appearance-none rounded-full border border-slate-200 bg-slate-50/80 py-2.5 pl-11 pr-9 text-sm font-medium text-slate-700 transition-all duration-200 hover:border-slate-300 hover:bg-white focus:border-violet-400 focus:bg-white focus:outline-none focus:ring-4 focus:ring-violet-500/10 sm:w-48"
                >
                  {SORT_GROUPS.map((g) => (
                    <optgroup key={g.group} label={g.group}>
                      {g.options.map((o) => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </optgroup>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              </div>
            </div>
          </div>

          {/* --------------------------------- Table -------------------------------- */}
          <div ref={tableRef} className="anim-fade-up overflow-hidden rounded-3xl bg-white shadow-sm ring-1 ring-slate-100" style={{ animationDelay: '300ms' }}>

            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4 lg:px-6">
              <div className="flex flex-wrap items-center gap-2.5">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-50 text-violet-600">
                  <CalendarDays className="h-4 w-4" />
                </span>
                <h3 className="text-sm font-bold text-slate-900">All Meetings</h3>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold tabular-nums text-slate-500">
                  {filteredMeetings.length}
                </span>
                <span className="hidden items-center gap-1 rounded-full bg-violet-50 px-2.5 py-1 text-[11px] font-bold text-violet-600 ring-1 ring-inset ring-violet-500/15 sm:inline-flex">
                  <ArrowUpDown className="h-3 w-3" />
                  {activeSortLabel}
                </span>

                <span className="inline-flex flex-wrap items-center gap-1.5">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-violet-100 px-2.5 py-1 text-[11px] font-bold text-violet-800 ring-1 ring-inset ring-violet-500/30">
                    <span className="h-2 w-2 rounded-full bg-violet-500" />
                    Internal
                    <span className="tabular-nums opacity-70">({internalCount})</span>
                  </span>
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-sky-100 px-2.5 py-1 text-[11px] font-bold text-sky-800 ring-1 ring-inset ring-sky-500/30">
                    <span className="h-2 w-2 rounded-full bg-sky-500" />
                    External
                    <span className="tabular-nums opacity-70">({externalCount})</span>
                  </span>
                </span>
              </div>
              {(searchQuery || statusFilter !== 'all' || typeFilter !== 'all' || priorityFilter !== 'all' || sortBy !== DEFAULT_SORT) && (
                <button
                  onClick={() => { setSearchQuery(''); setStatusFilter('all'); setTypeFilter('all'); setPriorityFilter('all'); setSortBy(DEFAULT_SORT); }}
                  className="inline-flex items-center gap-1.5 rounded-full bg-rose-50 px-3.5 py-1.5 text-xs font-semibold text-rose-600 transition-all duration-200 hover:bg-rose-100 active:scale-95"
                >
                  <X className="h-3.5 w-3.5" />
                  Clear filters
                </button>
              )}
            </div>

            <div className="hidden grid-cols-12 gap-4 border-b border-slate-200/80 bg-slate-50/70 px-6 py-3.5 text-[11px] font-bold uppercase tracking-wider text-slate-400 md:grid">
              <div className="col-span-1 text-center">Date</div>
              <div className="col-span-4">Agenda</div>
              <div className="col-span-2 text-center">Time</div>
              <div className="col-span-2">Location</div>
              <div className="col-span-1 text-center">Type</div>
              <div className="col-span-1 text-center">Status</div>
              <div className="col-span-1" />
            </div>

            <div className="divide-y divide-slate-100">
              {paginatedMeetings.length === 0 ? (
                <div className="anim-fade-up flex flex-col items-center justify-center py-20 text-center">
                  <div className="relative">
                    <div className="absolute inset-0 -m-3 rounded-3xl bg-violet-100/60 blur-xl" />
                    <div className="anim-bob relative flex h-16 w-16 items-center justify-center rounded-2xl border border-slate-200 bg-white shadow-sm">
                      <CalendarClock className="h-8 w-8 text-slate-300" />
                    </div>
                  </div>
                  <h3 className="mt-5 text-base font-bold text-slate-800">No meetings found</h3>
                  <p className="mt-1 max-w-xs text-sm text-slate-500">Try adjusting your search or filters, or create a new meeting.</p>
                  <button
                    onClick={openCreate}
                    className="mt-5 inline-flex items-center gap-2 rounded-full bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white shadow-md shadow-slate-900/10 transition-all duration-200 hover:-translate-y-0.5 hover:bg-slate-800 active:scale-[0.98]"
                  >
                    <Plus className="h-4 w-4" /> New Meeting
                  </button>
                </div>
              ) : (
                paginatedMeetings.map((meeting, i) => {
                  const dateInfo = formatDate(meeting.meeting_date || meeting.created_date);
                  const time = meeting.meeting_time || '';
                  const statusKey = getStatusKey(meeting);
                  const dateTag = dayTag(meeting.meeting_date || meeting.created_date, statusKey);
                  const style = getStatusStyle(statusKey);
                  const title = getMeetingTitle(meeting);

                  const typeCfg = getTypeConfig(meeting.meeting_type);
                  const TypeIcon = typeCfg?.icon;

                  const createdMs = dateToTime(meeting.created_date);
                  const createdDateStr = createdMs
                    ? new Date(createdMs).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' })
                    : '—';
                  const createdTimeStr = createdMs
                    ? new Date(createdMs).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
                    : '';

                  const priority = PRIORITY_BADGE[String(meeting.priority || '').toLowerCase()];
                  const followUpText = String(meeting.follow_up_notes || meeting.followup_notes || meeting.follow_up || meeting.followup || '');
                  const hasFollowUp = !!followUpText;
                  const isSelected = selectedIds.has(meeting.id);
                  /* ★ v24: only shown when nothing is checkbox-selected, so the
                     ring always matches whichever row 1-4 would actually act on
                     (see the shortcut's useEffect above). */
                  const isKeyboardTarget = selectedIds.size === 0 && hoveredRowId === meeting.id;

                  return (
                    <div
                      key={meeting.id}
                      onClick={() => setSelectedMeeting(meeting)}
                      onMouseEnter={() => { hoveredRowIdRef.current = meeting.id; setHoveredRowId(meeting.id); }}
                      onMouseMove={() => { if (hoveredRowIdRef.current !== meeting.id) { hoveredRowIdRef.current = meeting.id; setHoveredRowId(meeting.id); } }}
                      onMouseLeave={() => {
                        if (hoveredRowIdRef.current === meeting.id) hoveredRowIdRef.current = null;
                        setHoveredRowId((v) => (v === meeting.id ? null : v));
                      }}
                      className="anim-row cursor-pointer"
                      style={{ animationDelay: `${Math.min(i * 45, 360)}ms` }}
                    >
                      {/* Desktop row */}
                      <div
                        className={`group relative hidden items-center gap-4 px-6 py-4 transition-colors duration-200 md:grid md:grid-cols-12 ${
                          typeCfg ? `${typeCfg.rowBg} ${typeCfg.rowHover}` : 'hover:bg-violet-50/50'
                        } ${isSelected ? 'ring-2 ring-inset ring-violet-400' : isKeyboardTarget ? 'ring-1 ring-inset ring-violet-300' : ''}`}
                        title={`Created ${createdDateStr} ${createdTimeStr}`}
                      >
                        <span className={`absolute left-0 top-2 bottom-2 w-1 rounded-r-full transition-all duration-300 group-hover:top-1 group-hover:bottom-1 ${
                          typeCfg ? typeCfg.strip : 'bg-slate-200 group-hover:bg-violet-400'
                        }`} />

                        <div className="col-span-1 flex justify-center">
                          <div className="relative">
                            {/* v17: bulk-select checkbox — shows on row hover or when selected */}
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); toggleSelect(meeting.id); }}
                              aria-label="Select meeting"
                              className={`absolute -left-2 -top-2 z-10 flex h-5 w-5 items-center justify-center rounded-md border transition-all duration-150 ${
                                isSelected
                                  ? 'border-violet-600 bg-violet-600 text-white opacity-100'
                                  : 'border-slate-300 bg-white text-transparent opacity-0 hover:border-violet-400 group-hover:opacity-100'
                              }`}
                            >
                              <Check className="h-3 w-3" />
                            </button>
                            <div className={`flex h-14 w-12 flex-col items-center justify-center rounded-2xl border transition-all duration-300 group-hover:shadow-sm ${
                              typeCfg
                                ? typeCfg.dateCard
                                : 'border-slate-200 bg-gradient-to-b from-white to-slate-50 group-hover:border-violet-200 group-hover:from-violet-50 group-hover:to-indigo-50'
                            }`}>
                              <span className="text-lg font-bold leading-none tabular-nums text-slate-900">{dateInfo?.day}</span>
                              <span className={`mt-1 text-[10px] font-bold uppercase tracking-wider ${typeCfg ? typeCfg.monthText : 'text-slate-400'}`}>{dateInfo?.month}</span>
                            </div>
                          </div>
                        </div>

                        <div className="col-span-4 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <h3 className="truncate font-semibold text-slate-900 transition-colors duration-200 group-hover:text-violet-700">
                              {title}
                            </h3>
                            {dateTag && (
                              <span className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[10px] font-bold ring-1 ring-inset ${dateTag.cls}`}>
                                {dateTag.label}
                              </span>
                            )}
                            {hasFollowUp && (
                              <button
                                onClick={(e) => openNotesPopover(e, meeting, followUpText)}
                                className="inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-50 px-1.5 py-0.5 text-[10px] font-bold text-amber-700 ring-1 ring-inset ring-amber-500/20 transition-colors hover:bg-amber-100"
                                title="Preview follow-up notes"
                              >
                                <StickyNote className="h-2.5 w-2.5" />
                              </button>
                            )}
                          </div>
                          {meeting.officer_name && (
                            <p className="mt-1 flex items-center gap-1.5 text-xs text-slate-500">
                              <User className="h-3 w-3 text-slate-400" />
                              <span className="truncate">with {meeting.officer_name}</span>
                            </p>
                          )}
                        </div>

                        <div className="col-span-2 text-center">
                          <div className="flex items-center justify-center gap-1.5 text-sm font-medium text-slate-700">
                            <Clock className="h-3.5 w-3.5 text-slate-400" />
                            {formatTimeDisplay(time)}
                          </div>
                          {meeting.duration && <p className="mt-0.5 text-[11px] text-slate-400">{meeting.duration} min</p>}
                        </div>

                        <div className="col-span-2 flex min-w-0 items-center gap-1.5">
                          <MapPin className="h-3.5 w-3.5 flex-shrink-0 text-slate-400" />
                          <span className="truncate text-sm text-slate-600">{meeting.location || '—'}</span>
                        </div>

                        <div className="col-span-1 flex items-center justify-center pr-1.5 text-center">
                          {meeting.meeting_type ? (
                            <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-semibold capitalize ${typeCfg ? typeCfg.badge : 'bg-gray-100 text-gray-600 ring-1 ring-inset ring-gray-500/15'}`}>
                              {TypeIcon ? <TypeIcon className="h-3 w-3" /> : <span className="h-1.5 w-1.5 rounded-full bg-gray-400" />}
                              {meeting.meeting_type}
                            </span>
                          ) : (
                            <span className="text-sm text-slate-300">—</span>
                          )}
                        </div>

                        {/* v24: pl-3 (was pl-1.5) gives this column extra breathing
                            room from the Type badge to its left — they used to
                            visually crowd/collapse into each other, e.g.
                            "Rescheduled" next to "External". The status badge is
                            now itself the click target — the whole pill opens the
                            quick-status dropdown, with its chevron always visible
                            as part of the badge instead of a separate,
                            easy-to-miss icon-only button. */}
                        <div className="col-span-1 flex items-center justify-center pl-3">
                          <button
                            onClick={(e) => openQuickStatus(e, meeting)}
                            className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-semibold transition-all duration-150 hover:-translate-y-0.5 hover:shadow-sm active:scale-95 ${style.badge}`}
                            title="Click to change status"
                          >
                            <span className={`h-1.5 w-1.5 rounded-full ${style.dot} ${statusKey === 'Scheduled' ? 'animate-pulse' : ''}`} />
                            {style.label}
                            <ChevronDown className="h-3 w-3 opacity-70" />
                          </button>
                        </div>

                        <div className="col-span-1 flex justify-center">
                          <div className="flex h-8 w-8 items-center justify-center rounded-full text-slate-300 transition-all duration-300 group-hover:translate-x-1 group-hover:bg-violet-100 group-hover:text-violet-600">
                            <ChevronRight className="h-4 w-4" />
                          </div>
                        </div>
                      </div>

                      {/* Mobile card */}
                      <div className={`relative p-4 transition-colors duration-200 md:hidden ${
                        typeCfg
                          ? `${typeCfg.rowBg} ${typeCfg.mobileBorder}`
                          : 'hover:bg-violet-50/40 border-l-4 border-l-transparent'
                      } ${isSelected ? 'ring-2 ring-inset ring-violet-400' : ''}`}>
                        <div className="flex items-start gap-3">
                          <div className="relative shrink-0">
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); toggleSelect(meeting.id); }}
                              aria-label="Select meeting"
                              className={`absolute -left-1.5 -top-1.5 z-10 flex h-5 w-5 items-center justify-center rounded-md border transition-colors ${
                                isSelected ? 'border-violet-600 bg-violet-600 text-white' : 'border-slate-300 bg-white/90 text-transparent'
                              }`}
                            >
                              <Check className="h-3 w-3" />
                            </button>
                            <div className={`flex h-14 w-12 flex-col items-center justify-center rounded-2xl border ${
                              typeCfg ? typeCfg.dateCard : 'border-slate-200 bg-gradient-to-b from-white to-slate-50'
                            }`}>
                              <span className="text-lg font-bold leading-none text-slate-900">{dateInfo?.day}</span>
                              <span className={`mt-1 text-[10px] font-bold uppercase tracking-wider ${typeCfg ? typeCfg.monthText : 'text-slate-400'}`}>{dateInfo?.month}</span>
                            </div>
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-start justify-between gap-2">
                              <h3 className="line-clamp-2 text-sm font-semibold leading-snug text-slate-900">{title}</h3>
                              <div className="flex flex-shrink-0 items-center gap-1">
                                {hasFollowUp && (
                                  <button
                                    onClick={(e) => openNotesPopover(e, meeting, followUpText)}
                                    className="inline-flex items-center rounded-full bg-amber-50 p-1 text-amber-700 ring-1 ring-inset ring-amber-500/20"
                                  >
                                    <StickyNote className="h-3 w-3" />
                                  </button>
                                )}
                                <button
                                  onClick={(e) => openQuickStatus(e, meeting)}
                                  className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${style.badge}`}
                                >
                                  <span className={`h-1 w-1 rounded-full ${style.dot}`} />
                                  {style.label}
                                  <ChevronDown className="h-2.5 w-2.5" />
                                </button>
                                {dateTag && dateTag.label !== 'Overdue' && (
                                  <span className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-bold ring-1 ring-inset ${dateTag.cls}`}>
                                    {dateTag.label}
                                  </span>
                                )}
                              </div>
                            </div>
                            {meeting.officer_name && (
                              <p className="mt-1 flex items-center gap-1.5 text-xs text-slate-500">
                                <User className="h-3 w-3 text-slate-400" />
                                <span className="truncate">with {meeting.officer_name}</span>
                              </p>
                            )}

                            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                              <span className="flex items-center gap-1">
                                <Clock className="h-3 w-3 text-slate-400" />
                                {formatTimeDisplay(time)}
                              </span>
                              {meeting.location && (
                                <span className="flex items-center gap-1">
                                  <MapPin className="h-3 w-3 text-slate-400" />
                                  <span className="max-w-[120px] truncate">{meeting.location}</span>
                                </span>
                              )}
                            </div>

                            <div className="mt-2 flex flex-wrap items-center gap-1.5">
                              {meeting.meeting_type && (
                                <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize ${typeCfg ? typeCfg.badge : 'bg-gray-100 text-gray-600 ring-1 ring-inset ring-gray-500/15'}`}>
                                  {TypeIcon ? <TypeIcon className="h-2.5 w-2.5" /> : <span className="h-1.5 w-1.5 rounded-full bg-gray-400" />}
                                  {meeting.meeting_type}
                                </span>
                              )}
                              {priority && (
                                <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize ${priority.badge}`}>
                                  <span className={`h-1 w-1 rounded-full ${priority.dot}`} />
                                  {meeting.priority}
                                </span>
                              )}
                            </div>
                          </div>
                          <ChevronRight className="mt-1 h-4 w-4 flex-shrink-0 text-slate-300" />
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-5 py-3.5">
                <div className="flex items-center gap-2 text-xs font-medium text-slate-500">
                  <span>Rows per page</span>
                  <select
                    value={perPage}
                    onChange={(e) => setPerPage(Number(e.target.value))}
                    className="cursor-pointer rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-700 focus:border-violet-400 focus:outline-none"
                  >
                    {PER_PAGE_OPTIONS.map((o) => (
                      <option key={o} value={o}>{o}</option>
                    ))}
                  </select>
                  <span className="tabular-nums text-slate-400">
                    · {startIndex + 1}–{endIndex} of {filteredMeetings.length}
                  </span>
                </div>

                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-500 transition-colors hover:border-violet-200 hover:text-violet-600 disabled:cursor-not-allowed disabled:opacity-40"
                    aria-label="Previous page"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>

                  {paginationRange.map((p, idx) =>
                    p === 'dots' ? (
                      <span key={`dots-${idx}`} className="px-1 text-xs font-bold text-slate-400">…</span>
                    ) : (
                      <button
                        key={p}
                        onClick={() => setPage(p)}
                        className={`h-8 min-w-[2rem] rounded-lg px-2 text-xs font-bold tabular-nums transition-all duration-200 ${
                          p === currentPage
                            ? 'bg-slate-900 text-white shadow-sm'
                            : 'border border-slate-200 text-slate-600 hover:border-violet-200 hover:text-violet-600'
                        }`}
                      >
                        {p}
                      </button>
                    )
                  )}

                  <button
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                    className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-500 transition-colors hover:border-violet-200 hover:text-violet-600 disabled:cursor-not-allowed disabled:opacity-40"
                    aria-label="Next page"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ------------------------- v17: Quick status popover ------------------------ */}
      {quickStatus && (() => {
        const m = meetings.find((mm) => mm.id === quickStatus.id);
        if (!m) return null;
        return (
          <QuickStatusPopover
            top={quickStatus.top}
            left={quickStatus.left}
            align={quickStatus.align}
            current={getStatusKey(m)}
            onPick={(key) => updateStatusInline(m, key)}
            onClose={() => setQuickStatus(null)}
          />
        );
      })()}

      {/* ------------------------- v17: Notes popover ------------------------ */}
      {notesPopover && (
        <NotesPopover
          top={notesPopover.top}
          left={notesPopover.left}
          align={notesPopover.align}
          text={notesPopover.text}
          onClose={() => setNotesPopover(null)}
          onOpenFull={() => {
            const m = meetings.find((mm) => mm.id === notesPopover.id);
            setNotesPopover(null);
            if (m) { setSelectedMeeting(m); setFollowUpOpen(true); }
          }}
        />
      )}

      {/* ------------------------- v17: Command palette ------------------------ */}
      {commandPaletteOpen && (
        <CommandPalette
          meetings={meetings}
          onClose={() => setCommandPaletteOpen(false)}
          onSelectMeeting={(m) => { setCommandPaletteOpen(false); setSelectedMeeting(m); }}
          onNewMeeting={() => { setCommandPaletteOpen(false); openCreate(); }}
          getStatusStyle={getStatusStyle}
          getStatusKey={getStatusKey}
          getMeetingTitle={getMeetingTitle}
          formatDateShort={formatDateShort}
        />
      )}

      {/* ------------------------- v17: Bulk action bar ------------------------
          FIX: this used to render at z-[65], which sits ABOVE the detail
          panel (z-50). If a row's select-checkbox was clicked by accident
          (it overlaps the date card's corner) while a panel was later
          opened, this bar would silently intercept clicks meant for the
          panel's Edit/Update/Delete buttons. It's now (a) hidden whenever
          any panel/modal is open, and (b) kept below them (z-40) as a
          safety net even if that guard is ever bypassed. */}
      {selectedIds.size > 0 && !anyModalOpen && (
        <div className="fixed inset-x-0 bottom-5 z-40 flex justify-center px-4">
          <div className="anim-scale-in flex flex-wrap items-center gap-1.5 rounded-full bg-slate-900 px-3 py-2 shadow-2xl shadow-slate-900/30 sm:gap-2 sm:px-4 sm:py-2.5">
            <span className="px-1.5 text-xs font-bold text-white">{selectedIds.size} selected</span>
            <span className="hidden h-4 w-px bg-white/20 sm:block" />
            <button
              disabled={bulkBusy}
              onClick={() => bulkUpdateStatus('completed')}
              className="inline-flex items-center gap-1 rounded-full bg-white/10 px-3 py-1.5 text-xs font-semibold text-emerald-300 transition-colors hover:bg-white/20 disabled:opacity-50"
            >
              <CheckCircle2 className="h-3.5 w-3.5" /> Mark Completed
            </button>
            <button
              disabled={bulkBusy}
              onClick={() => bulkUpdateStatus('cancelled')}
              className="inline-flex items-center gap-1 rounded-full bg-white/10 px-3 py-1.5 text-xs font-semibold text-rose-300 transition-colors hover:bg-white/20 disabled:opacity-50"
            >
              <XCircle className="h-3.5 w-3.5" /> Cancel
            </button>
            <button
              disabled={bulkBusy}
              onClick={() => setShowBulkDeleteConfirm(true)}
              className="inline-flex items-center gap-1 rounded-full bg-white/10 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-rose-500/80 disabled:opacity-50"
            >
              {bulkBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />} Delete
            </button>
            <button
              onClick={clearSelection}
              aria-label="Clear selection"
              className="ml-0.5 flex h-6 w-6 items-center justify-center rounded-full text-white/60 transition-colors hover:bg-white/10 hover:text-white"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* --------------------- Off-canvas: Meeting detail --------------------- */}
      {selectedMeeting && (() => {
        const d = selectedMeeting;
        const sk = getStatusKey(d);
        const st = getStatusStyle(sk);
        const di = formatDate(d.meeting_date || d.created_date);
        const tc = getTypeConfig(d.meeting_type);
        const PanelTypeIcon = tc?.icon;
        const pr = PRIORITY_BADGE[String(d.priority || '').toLowerCase()];

        const notesText = d.agenda_notes || d.notes || d.description || d.details || '';
        const phoneVal = d.contact_phone || d.phone || '';
        const emailVal = d.contact_email || d.email || '';

        /* ★ Follow-up notes (checked across common field names) */
        const followUpText = d.follow_up_notes || d.followup_notes || d.follow_up || d.followup || '';

        /* ★ v17: activity trail from the best-effort status_history field */
        const history = parseHistory(d.status_history);

        return (
          <div className="fixed inset-0 z-50">
            <div
              className="anim-overlay absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
              onClick={() => setSelectedMeeting(null)}
            />

            <aside className="anim-panel nice-scroll absolute right-0 top-0 flex h-full w-full flex-col overflow-y-auto bg-white shadow-2xl sm:max-w-xl lg:max-w-2xl">
              <div className={`h-1.5 w-full ${tc ? tc.band : 'bg-gradient-to-r from-violet-500 to-indigo-500'}`} />

              {/* Header */}
              <div className={`border-b px-5 py-4 ${tc ? tc.headerBg : 'border-slate-100 bg-white'}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ${st.badge}`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${st.dot} ${sk === 'Scheduled' ? 'animate-pulse' : ''}`} />
                        {st.label}
                      </span>
                      {d.meeting_type && (
                        <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold capitalize ${tc ? tc.badge : 'bg-gray-100 text-gray-600 ring-1 ring-inset ring-gray-500/15'}`}>
                          {PanelTypeIcon && <PanelTypeIcon className="h-3 w-3" />}
                          {tc?.label || d.meeting_type}
                        </span>
                      )}

                      {/* ★ FOLLOW-UP SHORTCUT — visible only when follow-up notes exist */}
                      {followUpText && (
                        <button
                          onClick={() => setFollowUpOpen(true)}
                          className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-bold text-amber-800 ring-1 ring-inset ring-amber-500/30 transition-all duration-200 hover:-translate-y-0.5 hover:bg-amber-200 active:scale-95"
                          title="Open follow-up notes"
                        >
                          <StickyNote className="h-3 w-3" />
                          Follow-up
                          <ChevronDown className={`h-3 w-3 transition-transform duration-300 ${followUpOpen ? 'rotate-180' : ''}`} />
                        </button>
                      )}

                      {/* v22: when there's no follow-up note yet, offer to add one right here */}
                      {!followUpText && (
                        <button
                          onClick={() => startFollowUpEdit('')}
                          className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-amber-300 bg-white px-2.5 py-1 text-[11px] font-bold text-amber-600 transition-all duration-200 hover:bg-amber-50 active:scale-95"
                          title="Add a follow-up note"
                        >
                          <StickyNote className="h-3 w-3" />
                          Add follow-up
                        </button>
                      )}
                    </div>
                    <h2 className="mt-2 text-lg font-bold leading-snug text-slate-900">{getMeetingTitle(d)}</h2>
                    {di && (
                      <p className="mt-0.5 text-xs font-medium text-slate-400">
                        {di.weekday} · {di.full}
                      </p>
                    )}
                  </div>
                  <button
                    onClick={() => setSelectedMeeting(null)}
                    className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-400 transition-all hover:border-rose-200 hover:bg-rose-50 hover:text-rose-500 active:scale-90"
                    aria-label="Close panel"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                {/* Action buttons — moved up to the header, right under the
                    title, instead of a footer at the bottom of the panel. */}
                <div className="mt-3.5 flex items-center gap-2">
                  <button
                    onClick={handleEdit}
                    className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-full bg-slate-900 px-4 py-2.5 text-xs font-semibold text-white shadow-md shadow-slate-900/10 transition-all duration-200 hover:-translate-y-0.5 hover:bg-slate-800 active:scale-[0.98]"
                  >
                    <Edit2 className="h-3.5 w-3.5" /> Edit
                  </button>
                  <button
                    onClick={handleOpenUpdate}
                    className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs font-semibold text-amber-700 transition-all duration-200 hover:-translate-y-0.5 hover:bg-amber-100 active:scale-[0.98]"
                  >
                    <RotateCcw className="h-3.5 w-3.5" /> Update
                  </button>
                  <button
                    onClick={() => setShowDeleteConfirm(true)}
                    className="inline-flex items-center justify-center gap-1.5 rounded-full border border-rose-200 bg-rose-50 px-4 py-2.5 text-xs font-semibold text-rose-600 transition-all duration-200 hover:-translate-y-0.5 hover:bg-rose-100 active:scale-[0.98]"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              {/* Body */}
              <div className="flex-1 space-y-4 px-5 py-5">
                {/* Type highlight */}
                {d.meeting_type && (
                  <div className={`flex items-center gap-3 rounded-2xl border p-4 ${tc ? tc.highlightCard : 'border-slate-200 bg-slate-50'}`}>
                    <span className={`flex h-10 w-10 items-center justify-center rounded-xl text-white shadow-sm ${tc ? tc.strip : 'bg-slate-300'}`}>
                      {PanelTypeIcon && <PanelTypeIcon className="h-5 w-5" />}
                    </span>
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Meeting Type</p>
                      <p className="text-sm font-bold capitalize text-slate-900">{tc?.label || d.meeting_type}</p>
                    </div>
                    <span className={`ml-auto h-2.5 w-2.5 rounded-full ${tc ? tc.legendDot : 'bg-gray-400'}`} />
                  </div>
                )}

                {/* ★ FOLLOW-UP NOTES — expandable card, opened by the header shortcut or directly.
                    v22: now editable inline via an Edit button, no need to open the Update panel. */}
                {(followUpText || followUpOpen) && (
                  <div className="overflow-hidden rounded-2xl border border-amber-200 bg-amber-50/60">
                    <button
                      onClick={() => setFollowUpOpen((v) => !v)}
                      className="flex w-full items-center gap-3 p-4 text-left transition-colors hover:bg-amber-100/50"
                    >
                      <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-amber-400 text-white shadow-sm">
                        <StickyNote className="h-4 w-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-amber-700">Follow-up Notes</p>
                        <p className="truncate text-xs font-medium text-slate-600">
                          {followUpText ? String(followUpText).split('\n')[0] : 'No note yet'}
                        </p>
                      </div>
                      <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[10px] font-bold text-amber-800 ring-1 ring-inset ring-amber-500/30">
                        {followUpOpen ? 'Hide' : 'Open'}
                      </span>
                      <ChevronDown className={`h-4 w-4 flex-shrink-0 text-amber-600 transition-transform duration-300 ${followUpOpen ? 'rotate-180' : ''}`} />
                    </button>
                    {followUpOpen && (
                      <div className="anim-fade-in border-t border-amber-200 bg-white px-4 py-3">
                        {followUpEditing ? (
                          <div className="space-y-2">
                            <textarea
                              value={followUpDraft}
                              onChange={(e) => setFollowUpDraft(e.target.value)}
                              rows={4}
                              disabled={followUpSaving}
                              autoFocus
                              placeholder="Add a follow-up note..."
                              className="w-full resize-none rounded-xl border border-amber-200 bg-white px-3 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:border-amber-400 focus:outline-none focus:ring-4 focus:ring-amber-500/10"
                            />
                            <div className="flex items-center justify-end gap-2">
                              <button
                                onClick={() => setFollowUpEditing(false)}
                                disabled={followUpSaving}
                                className="rounded-full border border-slate-200 px-3.5 py-1.5 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-50 disabled:opacity-50"
                              >
                                Cancel
                              </button>
                              <button
                                onClick={saveFollowUpEdit}
                                disabled={followUpSaving}
                                className="inline-flex items-center gap-1.5 rounded-full bg-amber-500 px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-amber-600 disabled:opacity-60"
                              >
                                {followUpSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                                {followUpSaving ? 'Saving...' : 'Save'}
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="space-y-2">
                            <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-slate-700">
                              {followUpText || 'No follow-up note yet.'}
                            </p>
                            <button
                              onClick={() => startFollowUpEdit(String(followUpText || ''))}
                              className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-white px-3 py-1.5 text-xs font-semibold text-amber-700 transition-colors hover:bg-amber-50"
                            >
                              <Edit2 className="h-3 w-3" /> {followUpText ? 'Edit note' : 'Add note'}
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3">
                  <InfoTile icon={CalendarDays} tint="bg-violet-50 text-violet-600" label="Date">
                    {di ? di.full : '—'}
                    {di && <span className="mt-0.5 block text-[11px] font-medium text-slate-400">{di.weekday}</span>}
                  </InfoTile>
                  <InfoTile icon={Clock} tint="bg-violet-50 text-violet-600" label="Time">
                    {formatTimeDisplay(d.meeting_time || '')}
                    {d.duration ? <span className="ml-1 text-xs font-medium text-slate-400">({d.duration} min)</span> : null}
                  </InfoTile>
                  <InfoTile icon={MapPin} tint="bg-sky-50 text-sky-600" label="Location">
                    <span className="break-words">{d.location || '—'}</span>
                  </InfoTile>
                  <InfoTile icon={User} tint="bg-emerald-50 text-emerald-600" label="Officer">
                    <span className="break-words">{d.officer_name || '—'}</span>
                  </InfoTile>
                  <InfoTile icon={Tag} tint="bg-amber-50 text-amber-600" label="Priority">
                    {d.priority ? (
                      <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize ${pr?.badge || ''}`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${pr?.dot || 'bg-gray-300'}`} />
                        {d.priority}
                      </span>
                    ) : '—'}
                  </InfoTile>
                  <InfoTile icon={Briefcase} tint="bg-fuchsia-50 text-fuchsia-600" label="Type">
                    <span className="capitalize">{d.meeting_type || '—'}</span>
                  </InfoTile>
                </div>

                {notesText && (
                  <InfoTile icon={AlignLeft} tint="bg-indigo-50 text-indigo-600" label="Agenda / Notes">
                    <p className="whitespace-pre-wrap break-words font-normal leading-relaxed text-slate-700">
                      {notesText}
                    </p>
                  </InfoTile>
                )}

                {phoneVal && (
                  <InfoTile icon={Phone} tint="bg-rose-50 text-rose-600" label="Phone">
                    {phoneVal}
                  </InfoTile>
                )}
                {emailVal && (
                  <InfoTile icon={Mail} tint="bg-teal-50 text-teal-600" label="Email">
                    <span className="break-all">{emailVal}</span>
                  </InfoTile>
                )}

                {/* ★ v17: activity trail — best-effort, only shows if entries exist */}
                {history.length > 0 && (
                  <div className="rounded-2xl border border-slate-200/80 bg-white p-4">
                    <div className="mb-2.5 flex items-center gap-2">
                      <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-slate-100 text-slate-500">
                        <History className="h-3.5 w-3.5" />
                      </span>
                      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Activity trail</p>
                    </div>
                    <ul className="space-y-2">
                      {history.slice().reverse().map((h, idx) => {
                        const hs = STATUS_STYLES[String(h.status || '').toLowerCase()];
                        const when = (() => {
                          const t = new Date(h.date).getTime();
                          return Number.isNaN(t) ? '' : new Date(t).toLocaleString('en-US', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
                        })();
                        return (
                          <li key={idx} className="flex items-center gap-2 text-xs">
                            <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${hs?.dot || 'bg-slate-300'}`} />
                            <span className="font-semibold text-slate-700">{h.status}</span>
                            <span className="ml-auto text-slate-400">{when}</span>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                )}

                <InfoTile icon={Calendar} tint="bg-slate-100 text-slate-600" label="Created">
                  {formatDateTime(d.created_date)}
                </InfoTile>
                {d.updated_date && (
                  <InfoTile icon={RefreshCw} tint="bg-slate-100 text-slate-600" label="Last Updated">
                    {formatDateTime(d.updated_date)}
                  </InfoTile>
                )}
              </div>

            </aside>
          </div>
        );
      })()}

      {/* ------------------------- Delete confirmation ------------------------ */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div
            className="anim-overlay absolute inset-0 bg-slate-900/50 backdrop-blur-sm"
            onClick={() => !deleting && setShowDeleteConfirm(false)}
          />
          <div className="anim-scale-in relative w-full max-w-sm rounded-3xl bg-white p-6 shadow-2xl">
            <div className="flex items-start gap-4">
              <span className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-2xl bg-rose-50 text-rose-500">
                <Trash2 className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <h3 className="text-base font-bold text-slate-900">Delete meeting?</h3>
                <p className="mt-1 text-sm text-slate-500">
                  <span className="font-semibold text-slate-700">"{selectedMeeting ? getMeetingTitle(selectedMeeting) : ''}"</span> will be removed from the list and archived, so it can be recovered later if needed.
                </p>
              </div>
            </div>
            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                disabled={deleting}
                className="rounded-full border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                disabled={deleting}
                className="inline-flex items-center gap-1.5 rounded-full bg-rose-500 px-4 py-2 text-xs font-semibold text-white shadow-md shadow-rose-500/20 transition-all hover:bg-rose-600 active:scale-95 disabled:opacity-60"
              >
                {deleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                {deleting ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ------------------------- Bulk delete confirmation ------------------------
          Same visual pattern as the single-meeting delete modal above, and
          the same soft-delete behavior — records are archived, not removed
          without a backup. */}
      {showBulkDeleteConfirm && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div
            className="anim-overlay absolute inset-0 bg-slate-900/50 backdrop-blur-sm"
            onClick={() => !bulkBusy && setShowBulkDeleteConfirm(false)}
          />
          <div className="anim-scale-in relative w-full max-w-sm rounded-3xl bg-white p-6 shadow-2xl">
            <div className="flex items-start gap-4">
              <span className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-2xl bg-rose-50 text-rose-500">
                <Trash2 className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <h3 className="text-base font-bold text-slate-900">
                  Delete {selectedIds.size} meeting{selectedIds.size > 1 ? 's' : ''}?
                </h3>
                <p className="mt-1 text-sm text-slate-500">
                  <span className="font-semibold text-slate-700">{selectedIds.size} selected meeting{selectedIds.size > 1 ? 's' : ''}</span> will be removed from the list and archived, so they can be recovered later if needed.
                </p>
              </div>
            </div>
            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                onClick={() => setShowBulkDeleteConfirm(false)}
                disabled={bulkBusy}
                className="rounded-full border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={performBulkDelete}
                disabled={bulkBusy}
                className="inline-flex items-center gap-1.5 rounded-full bg-rose-500 px-4 py-2 text-xs font-semibold text-white shadow-md shadow-rose-500/20 transition-all hover:bg-rose-600 active:scale-95 disabled:opacity-60"
              >
                {bulkBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                {bulkBusy ? 'Deleting...' : `Delete ${selectedIds.size}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ---------------- Create / Edit panel ---------------- */}
      {isPanelOpen && (() => {
        const panelProps: any = {
          isOpen: true,
          isEdit: !!editingMeeting,
          mode: editingMeeting ? 'edit' : 'create',
          meeting: editingMeeting,
          editMeeting: editingMeeting,
          editingMeeting: editingMeeting,
          initialMeeting: editingMeeting,
          meetingData: editingMeeting,
          initialData: editingMeeting,
          onClose: handlePanelClosed,
          onSaved: handlePanelSaved,
          onSave: handlePanelSaved,
          onSuccess: handlePanelSaved,
        };
        return (
          <CreateMeetingPanel
            key={editingMeeting ? `edit-${editingMeeting.id}` : 'create'}
            {...panelProps}
          />
        );
      })()}

      {/* -------- Update status panel (inline, manual-only, no automations) -------- */}
      {updateMeeting && (
        <InlineUpdateStatusPanel
          meeting={updateMeeting}
          onClose={() => setUpdateMeeting(null)}
          onSaved={() => { setUpdateMeeting(null); loadData(); }}
        />
      )}
    </div>
  );
}