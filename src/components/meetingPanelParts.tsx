'use client';

import { useState, useEffect } from 'react';
import {
  X, Calendar, ChevronLeft, ChevronRight, AlertCircle, Flag,
  Sunrise, Sun, Sunset, Feather, Activity, Zap, Building2, Globe, Users,
} from 'lucide-react';

/* ================================================================
   Types & theme kit
================================================================ */

export interface Officer {
  id: string;
  name: string;
  designation?: string;
  type: 'IAS' | 'IPS' | 'Other';
  cadre?: string;
  state?: string;
  contact_number?: string;
  email?: string;
  department?: string;
  current_position?: string;
  batch_year?: string;
}

export interface ThemeKit {
  name: 'dark' | 'light';
  panel: string; heading: string; text: string; sub: string;
  muted: string; faint: string; card: string; cardHover: string;
  input: string; chipIdle: string; kbd: string;
}

export const DARK: ThemeKit = {
  name: 'dark',
  panel: 'bg-[#0b1120] text-slate-100',
  heading: 'text-white', text: 'text-slate-100', sub: 'text-slate-300',
  muted: 'text-slate-400', faint: 'text-slate-500',
  card: 'bg-white/[0.045] ring-1 ring-white/10',
  cardHover: 'hover:bg-white/[0.08] hover:ring-white/20',
  input: 'bg-white/[0.05] ring-1 ring-white/10 text-slate-100 placeholder:text-slate-500 outline-none focus:ring-2 focus:ring-indigo-400',
  chipIdle: 'bg-white/[0.05] text-slate-300 ring-1 ring-white/10 hover:ring-indigo-400/70 hover:text-white',
  kbd: 'bg-white/10 ring-1 ring-white/15 text-slate-400',
};

export const LIGHT: ThemeKit = {
  name: 'light',
  panel: 'bg-white text-slate-900',
  heading: 'text-slate-900', text: 'text-slate-900', sub: 'text-slate-600',
  muted: 'text-slate-500', faint: 'text-slate-400',
  card: 'bg-slate-50 ring-1 ring-slate-200',
  cardHover: 'hover:bg-slate-100 hover:ring-slate-300',
  input: 'bg-white ring-1 ring-slate-200 text-slate-900 placeholder:text-slate-400 outline-none focus:ring-2 focus:ring-indigo-500',
  chipIdle: 'bg-slate-50 text-slate-600 ring-1 ring-slate-200 hover:ring-indigo-300 hover:text-indigo-700',
  kbd: 'bg-slate-100 ring-1 ring-slate-200 text-slate-500',
};

export const ACCENT = 'from-indigo-500 via-violet-500 to-fuchsia-500';
export const ACCENT_SOFT = 'from-indigo-500/25 via-violet-500/15 to-fuchsia-500/10';

/* ================================================================
   Constants
================================================================ */

export const OFFICER_TYPE_STYLES: Record<string, { gradient: string; badge: string }> = {
  IAS: { gradient: 'from-blue-500 to-indigo-600', badge: 'bg-blue-500/15 text-blue-300 ring-blue-400/30' },
  IPS: { gradient: 'from-indigo-500 to-violet-600', badge: 'bg-indigo-500/15 text-indigo-300 ring-indigo-400/30' },
  Other: { gradient: 'from-slate-500 to-slate-700', badge: 'bg-slate-500/15 text-slate-300 ring-slate-400/30' },
};

export const PRIORITIES = [
  { value: 'Low', icon: Feather, dot: 'bg-emerald-400', bg: 'bg-emerald-50', bgDark: 'bg-emerald-500/10', text: 'text-emerald-700', textDark: 'text-emerald-300', ring: 'ring-emerald-300', ringDark: 'ring-emerald-400/40', bar: 'from-emerald-400 to-teal-500' },
  { value: 'Medium', icon: Activity, dot: 'bg-amber-400', bg: 'bg-amber-50', bgDark: 'bg-amber-500/10', text: 'text-amber-700', textDark: 'text-amber-300', ring: 'ring-amber-300', ringDark: 'ring-amber-400/40', bar: 'from-amber-400 to-orange-500' },
  { value: 'High', icon: Zap, dot: 'bg-rose-400', bg: 'bg-rose-50', bgDark: 'bg-rose-500/10', text: 'text-rose-700', textDark: 'text-rose-300', ring: 'ring-rose-300', ringDark: 'ring-rose-400/40', bar: 'from-rose-400 to-red-500' },
];

export const PLACE_OPTIONS = [
  { value: 'Office', icon: Building2, hint: 'At your office' },
  { value: 'Outside', icon: Globe, hint: 'External venue' },
];

export const MEETING_TYPES = [
  { value: 'Internal', icon: Users, hint: 'Within your team' },
  { value: 'External', icon: Globe, hint: 'Outside participants' },
];

export const STATUS_FLAGS = [
  { value: 'Scheduled', dot: 'bg-blue-400' },
  { value: 'Completed', dot: 'bg-emerald-400' },
  { value: 'Cancelled', dot: 'bg-rose-400' },
  { value: 'Rescheduled', dot: 'bg-amber-400' },
];

export const PRESET_DURATIONS = [15, 30, 45, 60, 90, 120, 180];
export const AGENDA_MAX = 280;

export const QUICK_TIME_SLOTS = ['09:30', '10:00', '11:00', '12:00', '14:00', '15:00', '16:30', '18:00'];

export const SLOT_GROUPS = [
  { label: 'Morning', icon: Sunrise, hours: [8, 9, 10, 11] },
  { label: 'Afternoon', icon: Sun, hours: [12, 13, 14, 15, 16] },
  { label: 'Evening', icon: Sunset, hours: [17, 18, 19, 20, 21] },
];

export const OFFICER_EDIT_FIELDS = [
  { key: 'officer_name', label: 'Name' },
  { key: 'designation', label: 'Designation' },
  { key: 'contact_number', label: 'Phone' },
  { key: 'email', label: 'Email' },
  { key: 'department', label: 'Department' },
  { key: 'current_position', label: 'Position' },
  { key: 'cadre', label: 'Cadre' },
  { key: 'batch_year', label: 'Batch' },
];

export const EMPTY_FORM = {
  agenda: '', meeting_date: '', meeting_time: '', duration: '', location: '',
  status: '', officer_type: '', officer_name: '', officer_id: '', designation: '',
  department: '', officer_category: '', contact_number: '', email: '', address: '',
  website: '', cadre: '', state: '', batch_year: '', current_position: '',
  previous_postings: '', date_of_birth: '', priority: '', meeting_type: '',
  meeting_place: '', status_flag: '', attendees: '', notes: '', follow_up_date: '',
  send_invite: false, sync_gcal: false, add_meet: false, created_by: '',
  meet_link: '', gcal_event_id: '', gcal_link: '',
};

/* ================================================================
   Helpers
================================================================ */

export const toLocalISODate = (d: Date) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

export const prettyDate = (dateStr: string) => {
  if (!dateStr) return 'Pick a date';
  const today = toLocalISODate(new Date());
  const tomorrow = toLocalISODate(new Date(Date.now() + 86400000));
  if (dateStr === today) return 'Today';
  if (dateStr === tomorrow) return 'Tomorrow';
  return new Date(`${dateStr}T00:00:00`).toLocaleDateString('en-IN', {
    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
  });
};

export const to12Hour = (t: string) => {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const hr = h % 12 || 12;
  return `${hr}:${String(m).padStart(2, '0')} ${ampm}`;
};

export const formatDuration = (m: number) => {
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const mm = m % 60;
  if (mm === 0) return `${h} hr`;
  return `${h}h ${mm}m`;
};

export const typeStyle = (t?: string) => OFFICER_TYPE_STYLES[t || 'Other'] ?? OFFICER_TYPE_STYLES.Other;

export const toMinutes = (t: string) => {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
};

export const isPastISODate = (iso: string) => !!iso && iso < toLocalISODate(new Date());

export const PAST_DATE_MSG = 'The selected date has already passed. Please choose today or a future date.';
export const PAST_TIME_MSG = 'This time has already passed today. Please pick a later time.';

export const isTodayISO = (iso: string) => !!iso && iso === toLocalISODate(new Date());

export const nowHHMM = () => {
  const n = new Date();
  return `${String(n.getHours()).padStart(2, '0')}:${String(n.getMinutes()).padStart(2, '0')}`;
};

export const nowPlusHHMM = (mins: number) => {
  const d = new Date(Date.now() + mins * 60000);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

export const isPastTimeToday = (iso: string, time: string) =>
  !!iso && !!time && isTodayISO(iso) && time <= nowHHMM();

/* ================================================================
   Presentational pieces
================================================================ */

export function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p className="flex items-center gap-1.5 text-xs text-rose-500 mt-1.5 animate-in fade-in duration-200">
      <AlertCircle className="w-3.5 h-3.5 shrink-0" /> {message}
    </p>
  );
}

export function SkeletonRows({ T }: { T: ThemeKit }) {
  const dark = T.name === 'dark';
  return (
    <div className="p-4 space-y-3.5">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 animate-pulse" style={{ animationDelay: `${i * 90}ms` }}>
          <div className={`w-10 h-10 rounded-full shrink-0 ${dark ? 'bg-white/10' : 'bg-slate-200'}`} />
          <div className="flex-1 space-y-2">
            <div className={`h-3 w-1/3 rounded ${dark ? 'bg-white/10' : 'bg-slate-200'}`} />
            <div className={`h-2.5 w-2/3 rounded ${dark ? 'bg-white/[0.06]' : 'bg-slate-100'}`} />
          </div>
        </div>
      ))}
    </div>
  );
}

export function ToggleRow({ T, icon: Icon, title, description, checked, onChange }: {
  T: ThemeKit; icon: any; title: string; description: string; checked: boolean; onChange: (v: boolean) => void;
}) {
  const dark = T.name === 'dark';
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={`w-full flex items-center justify-between gap-3 p-3 rounded-xl transition-all text-left ${T.card} ${T.cardHover}`}
    >
      <div className="flex items-center gap-3 min-w-0">
        <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 transition-colors ${
          checked
            ? dark ? 'bg-indigo-500/20 text-indigo-300' : 'bg-indigo-100 text-indigo-600'
            : dark ? 'bg-white/[0.06] text-slate-500' : 'bg-slate-100 text-slate-400'
        }`}>
          <Icon className="w-4 h-4" />
        </div>
        <div className="min-w-0">
          <p className={`text-sm font-semibold ${T.text}`}>{title}</p>
          <p className={`text-xs truncate ${T.faint}`}>{description}</p>
        </div>
      </div>
      <span className={`relative w-10 h-[22px] rounded-full transition-colors shrink-0 ${checked ? 'bg-indigo-500' : dark ? 'bg-white/15' : 'bg-slate-200'}`}>
        <span className={`absolute top-[3px] left-[3px] w-4 h-4 bg-white rounded-full shadow transition-transform ${checked ? 'translate-x-[18px]' : 'translate-x-0'}`} />
      </span>
    </button>
  );
}

export function MiniCalendar({ T, value, onChange }: { T: ThemeKit; value: string; onChange: (v: string) => void }) {
  const dark = T.name === 'dark';
  const [view, setView] = useState(() => {
    const d = value ? new Date(`${value}T00:00:00`) : new Date();
    return { y: d.getFullYear(), m: d.getMonth() };
  });

  useEffect(() => {
    if (!value) return;
    const d = new Date(`${value}T00:00:00`);
    if (!isNaN(d.getTime())) setView({ y: d.getFullYear(), m: d.getMonth() });
  }, [value]);

  const todayISO = toLocalISODate(new Date());
  const { y, m } = view;

  const now = new Date();
  const canGoPrev = y > now.getFullYear() || (y === now.getFullYear() && m > now.getMonth());

  const firstDay = new Date(y, m, 1).getDay();
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  const prevDays = new Date(y, m, 0).getDate();

  const cells: { iso: string; day: number; inMonth: boolean }[] = [];
  for (let i = firstDay - 1; i >= 0; i--) {
    const d = new Date(y, m - 1, prevDays - i);
    cells.push({ iso: toLocalISODate(d), day: d.getDate(), inMonth: false });
  }
  for (let day = 1; day <= daysInMonth; day++) {
    cells.push({ iso: toLocalISODate(new Date(y, m, day)), day, inMonth: true });
  }
  let nextDay = 1;
  while (cells.length % 7 !== 0) {
    const d = new Date(y, m + 1, nextDay++);
    cells.push({ iso: toLocalISODate(d), day: d.getDate(), inMonth: false });
  }

  const shift = (delta: number) => {
    if (delta < 0 && !canGoPrev) return;
    const d = new Date(y, m + delta, 1);
    setView({ y: d.getFullYear(), m: d.getMonth() });
  };

  const monthLabel = new Date(y, m, 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });

  return (
    <div className={`rounded-xl p-3 w-full sm:w-[280px] shrink-0 ${T.card}`}>
      <div className="flex items-center justify-between mb-2">
        <button
          type="button"
          onClick={() => shift(-1)}
          disabled={!canGoPrev}
          className={`w-7 h-7 rounded-lg flex items-center justify-center transition-colors ${
            canGoPrev
              ? `${dark ? 'hover:bg-white/10 text-slate-400' : 'hover:bg-slate-100 text-slate-500'}`
              : dark ? 'text-slate-700 cursor-not-allowed' : 'text-slate-300 cursor-not-allowed'
          }`}
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <p className={`text-xs font-bold tracking-tight ${T.heading}`}>{monthLabel}</p>
        <button
          type="button"
          onClick={() => shift(1)}
          className={`w-7 h-7 rounded-lg flex items-center justify-center transition-colors ${dark ? 'hover:bg-white/10 text-slate-400' : 'hover:bg-slate-100 text-slate-500'}`}
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      <div className="grid grid-cols-7 mb-0.5">
        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
          <div key={i} className={`text-center text-[10px] font-bold py-1 ${T.faint}`}>{d}</div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-y-0.5">
        {cells.map((c) => {
          const selected = c.iso === value;
          const isToday = c.iso === todayISO;
          const isPast = c.iso < todayISO;
          return (
            <button
              key={c.iso}
              type="button"
              disabled={isPast && !selected}
              onClick={() => { if (isPast) return; onChange(c.iso); }}
              title={isPast ? 'Past date' : undefined}
              className={`relative w-full h-8 rounded-full text-xs font-semibold flex items-center justify-center transition-all
                ${selected
                  ? 'bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-md shadow-indigo-500/40 scale-105'
                  : isPast
                    ? dark ? 'text-slate-700 cursor-not-allowed' : 'text-slate-300/70 cursor-not-allowed'
                    : c.inMonth
                      ? dark ? 'text-slate-200 hover:bg-indigo-500/20 hover:text-white' : 'text-slate-700 hover:bg-indigo-50 hover:text-indigo-700'
                      : dark ? 'text-slate-600 hover:text-slate-400' : 'text-slate-300 hover:text-slate-500'}`}
            >
              {c.day}
              {isToday && !selected && (
                <span className="absolute bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-fuchsia-400" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ── Start time picker — redesigned UI (guards unchanged) ── */
function TimeSlotPicker({ value, onChange, meetingDate }: {
  value: string; onChange: (v: string) => void; meetingDate: string;
}) {
  const [customTime, setCustomTime] = useState(value);
  const [invalid, setInvalid] = useState(false);
  const [invalidMsg, setInvalidMsg] = useState('');

  useEffect(() => {
    setCustomTime(value);
    setInvalid(false);
    setInvalidMsg('');
  }, [value]);

  const normalizeTime24 = (raw: string): string | null => {
    const m = raw.trim().replace(/\s/g, '').match(/^(\d{1,2}):?(\d{2})$/);
    if (!m) return null;
    const h = Number(m[1]);
    const min = Number(m[2]);
    if (h > 23 || min > 59) return null;
    return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
  };

  const commitCustomTime = () => {
    const trimmed = customTime.trim();
    if (!trimmed) {
      setCustomTime(value);
      setInvalid(false);
      setInvalidMsg('');
      return;
    }
    const normalized = normalizeTime24(trimmed);
    if (!normalized) {
      setInvalid(true);
      setInvalidMsg('Enter a valid 24-hour time, e.g. 14:30');
      return;
    }
    if (isPastTimeToday(meetingDate, normalized)) {
      setInvalid(true);
      setInvalidMsg('That time has already passed today');
      return;
    }
    setInvalid(false);
    setInvalidMsg('');
    setCustomTime(normalized);
    onChange(normalized);
  };

  const dateIsToday = isTodayISO(meetingDate);
  const isCustomValue = !!value && !QUICK_TIME_SLOTS.includes(value);

  return (
    <div className="space-y-4 min-w-0">
      {/* ── live preview of chosen time ── */}
      <div className={`rounded-xl p-3.5 flex items-center gap-3 transition-all ${
        value
          ? 'bg-gradient-to-br from-indigo-50 to-violet-50 ring-1 ring-indigo-100'
          : 'bg-slate-50 ring-1 ring-slate-100'
      }`}>
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
          value
            ? 'bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-md shadow-indigo-500/30'
            : 'bg-white text-slate-300 ring-1 ring-slate-200'
        }`}>
          <Clock className="w-5 h-5" />
        </div>
        <div className="min-w-0">
          <p className={`text-lg font-extrabold tabular-nums leading-tight ${value ? 'text-slate-900' : 'text-slate-400'}`}>
            {value ? to12Hour(value) : 'No time selected'}
          </p>
          <p className="text-[11px] text-slate-400 truncate">
            {value ? prettyDate(meetingDate) : 'Pick a slot below or enter a custom time'}
          </p>
        </div>
      </div>

      {/* ── quick slots ── */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Quick pick</p>
          <p className="text-[10px] text-slate-400">Office starts <span className="font-bold text-indigo-500">9:30 AM</span></p>
        </div>
        <div className="grid grid-cols-4 gap-2">
          {QUICK_TIME_SLOTS.map((t) => {
            const selected = value === t;
            const passed = isPastTimeToday(meetingDate, t);
            return (
              <button
                key={t}
                type="button"
                disabled={passed}
                title={passed ? 'Already passed today' : undefined}
                onClick={() => onChange(t)}
                className={`py-2 rounded-xl text-xs font-bold tabular-nums whitespace-nowrap transition-all ${
                  selected
                    ? 'bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-md shadow-indigo-500/30 scale-[1.03]'
                    : passed
                      ? 'bg-slate-50 text-slate-300 ring-1 ring-slate-100 cursor-not-allowed line-through'
                      : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:ring-indigo-300 hover:text-indigo-700 hover:bg-indigo-50/50 hover:shadow-sm'
                }`}
              >
                {to12Hour(t)}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── today warning ── */}
      {dateIsToday && (
        <p className="flex items-center gap-1.5 text-[11px] text-amber-600 bg-amber-50 ring-1 ring-amber-100 rounded-lg px-2.5 py-2">
          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
          Meeting is today — times before {to12Hour(nowHHMM())} can't be picked.
        </p>
      )}

      {/* ── custom time card ── */}
      <div className="rounded-xl ring-1 ring-slate-200 bg-white p-3">
        <div className="flex items-center justify-between mb-2">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Custom time</p>
          <span className="text-[10px] font-medium text-slate-300">24-hour format</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Clock className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
            <input
              type="text"
              inputMode="numeric"
              placeholder="e.g. 14:30"
              value={customTime}
              onChange={(e) => { setCustomTime(e.target.value); setInvalid(false); setInvalidMsg(''); }}
              onBlur={commitCustomTime}
              onKeyDown={(e) => {
                if (e.key === 'Enter') { e.preventDefault(); commitCustomTime(); }
              }}
              aria-label="Custom time in 24-hour format"
              className={`w-full pl-9 pr-3 py-2 rounded-lg ring-1 text-sm font-bold bg-white outline-none focus:ring-2 focus:ring-indigo-500 transition-shadow tabular-nums ${
                invalid ? 'ring-rose-300 text-rose-600' : 'ring-slate-200 text-slate-700'
              }`}
            />
          </div>
          <button
            type="button"
            onClick={commitCustomTime}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all shrink-0 ${
              invalid
                ? 'bg-rose-50 text-rose-600 ring-1 ring-rose-200'
                : 'bg-slate-900 text-white hover:bg-slate-800 shadow-sm'
            }`}
          >
            Set
          </button>
        </div>
        {invalidMsg && <p className="text-[10px] text-rose-600 mt-1.5">{invalidMsg}</p>}
        {isCustomValue && !invalid && (
          <p className="text-[10px] text-emerald-600 mt-1.5 flex items-center gap-1">
            <Check className="w-3 h-3" /> Using custom time {to12Hour(value)}
          </p>
        )}
      </div>
    </div>
  );
}

export function DayTimeline({ T, dateISO, startTime, durationMin, events }: {
  T: ThemeKit;
  dateISO: string;
  startTime: string;
  durationMin: number;
  events: { id: string; start: number; end: number; label: string; conflict: boolean }[];
}) {
  const dark = T.name === 'dark';
  const toPct = (m: number) => `${Math.min(100, Math.max(0, (m / 1440) * 100))}%`;

  const isToday = isTodayISO(dateISO);
  const n = new Date();
  const nowMin = n.getHours() * 60 + n.getMinutes();

  const start = startTime ? toMinutes(startTime) : null;
  const end = start != null ? Math.min(1440, start + durationMin) : null;

  return (
    <div className={`rounded-xl p-3 ${T.card}`}>
      <div className="flex items-center justify-between mb-2">
        <p className={`text-[10px] font-bold uppercase tracking-widest ${T.muted}`}>Day view</p>
        {events.length > 0 && (
          <span className={`text-[10px] font-semibold ${T.faint}`}>{events.length} scheduled</span>
        )}
      </div>

      <div className={`relative h-9 rounded-lg overflow-hidden ${dark ? 'bg-white/[0.06]' : 'bg-slate-100'}`}>
        <div className="absolute inset-y-0 bg-indigo-500/10" style={{ left: toPct(570), width: toPct(1080 - 570) }} />
        {isToday && <div className="absolute inset-y-0 left-0 bg-rose-500/10" style={{ width: toPct(nowMin) }} />}
        {[0, 3, 6, 9, 12, 15, 18, 21, 24].map((h) => (
          <div key={h} className={`absolute inset-y-0 w-px ${dark ? 'bg-white/10' : 'bg-slate-200'}`} style={{ left: toPct(h * 60) }} />
        ))}
        {events.map((ev) => (
          <div
            key={ev.id}
            title={ev.label}
            className={`absolute inset-y-1 rounded-md transition-all ${ev.conflict ? 'bg-amber-400/90' : dark ? 'bg-slate-500/60' : 'bg-slate-300'}`}
            style={{ left: toPct(ev.start), width: toPct(Math.max(2, ev.end - ev.start)) }}
          />
        ))}
        {start != null && end != null && (
          <div
            className="absolute inset-y-[3px] rounded-md bg-gradient-to-r from-indigo-500 to-violet-500 shadow-lg shadow-indigo-500/40 ring-1 ring-white/40 animate-in fade-in zoom-in-95 duration-300"
            style={{ left: toPct(start), width: toPct(Math.max(2, end - start)) }}
          />
        )}
        {isToday && (
          <div className="absolute inset-y-0 w-0.5 bg-rose-500" style={{ left: toPct(nowMin) }}>
            <span className="absolute -top-0.5 -left-[3px] w-2 h-2 rounded-full bg-rose-500 ring-2 ring-white/60" />
          </div>
        )}
      </div>

      <div className="flex justify-between mt-1 text-[9px] font-semibold tabular-nums">
        {['00', '06', '12', '18', '24'].map((l) => <span key={l} className={T.faint}>{l}</span>)}
      </div>

      <div className="flex items-center gap-3 mt-2 flex-wrap text-[9px] font-semibold">
        <span className={`flex items-center gap-1 ${T.muted}`}>
          <span className="w-2 h-2 rounded-sm bg-gradient-to-r from-indigo-500 to-violet-500" /> Your slot
        </span>
        <span className={`flex items-center gap-1 ${T.muted}`}>
          <span className="w-2 h-2 rounded-sm bg-amber-400" /> Overlap
        </span>
        <span className={`flex items-center gap-1 ${T.muted}`}>
          <span className={`w-2 h-2 rounded-sm ${dark ? 'bg-slate-500' : 'bg-slate-300'}`} /> Existing
        </span>
        {isToday && (
          <span className={`flex items-center gap-1 ${T.muted}`}>
            <span className="w-2 h-2 rounded-sm bg-rose-500" /> Now
          </span>
        )}
      </div>
    </div>
  );
}

export function FollowUpOffCanvas({ T, open, initial, onClose, onSave }: {
  T: ThemeKit; open: boolean; initial: string; onClose: () => void; onSave: (iso: string) => void;
}) {
  const dark = T.name === 'dark';
  const [selected, setSelected] = useState(initial);

  useEffect(() => {
    if (open) setSelected(initial);
  }, [open, initial]);

  if (!open) return null;

  const QUICK = [
    { label: 'Tomorrow', days: 1 },
    { label: '3 days', days: 3 },
    { label: '1 week', days: 7 },
    { label: '2 weeks', days: 14 },
    { label: '1 month', days: 30 },
  ];
  const quickISO = (days: number) => toLocalISODate(new Date(Date.now() + days * 86400000));

  return (
    <>
      <div
        className="fixed inset-0 z-[65] bg-black/50 backdrop-blur-[2px] animate-in fade-in duration-200"
        onClick={onClose}
      />

      <div className={`fixed inset-y-0 right-0 z-[70] w-full sm:max-w-md shadow-2xl flex flex-col animate-in slide-in-from-right duration-300 ${T.panel}`}>
        <div className={`flex items-center gap-3 px-5 py-4 border-b shrink-0 ${dark ? 'border-white/10' : 'border-slate-100'}`}>
          <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${dark ? 'bg-amber-500/15 text-amber-300' : 'bg-amber-50 text-amber-600'}`}>
            <Flag className="w-4 h-4" />
          </div>
          <div className="min-w-0 flex-1">
            <h4 className={`text-sm font-bold ${T.heading}`}>Follow-up date</h4>
            <p className={`text-[11px] truncate ${T.faint}`}>Set when you'll continue after this meeting</p>
          </div>
          <button type="button" onClick={onClose} className={`p-2 rounded-xl transition-colors shrink-0 ${dark ? 'text-slate-400 hover:bg-white/10 hover:text-slate-200' : 'text-slate-400 hover:bg-slate-100 hover:text-slate-600'}`}>
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          <div className={`rounded-xl p-4 flex items-center gap-3 ${dark ? 'bg-gradient-to-br from-indigo-500/10 via-transparent to-transparent ring-1 ring-indigo-400/20' : 'bg-gradient-to-br from-indigo-50/80 via-white to-white ring-1 ring-indigo-100'}`}>
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 text-white flex items-center justify-center shadow-md shadow-indigo-500/40 shrink-0">
              <Calendar className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <p className={`text-sm font-bold truncate ${T.heading}`}>
                {selected ? prettyDate(selected) : 'No follow-up yet'}
              </p>
              <p className={`text-[11px] ${T.faint}`}>
                {selected ? 'A reminder will be attached to this meeting' : 'Pick a quick option or an exact date below'}
              </p>
            </div>
          </div>

          <div>
            <p className={`text-[10px] font-bold uppercase tracking-widest mb-2 ${T.faint}`}>Quick follow-up</p>
            <div className="flex flex-wrap gap-1.5">
              {QUICK.map((q) => {
                const iso = quickISO(q.days);
                const active = selected === iso;
                return (
                  <button
                    key={q.label}
                    type="button"
                    onClick={() => setSelected(iso)}
                    className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all ${
                      active
                        ? 'bg-gradient-to-r from-indigo-500 to-violet-600 text-white shadow-md shadow-indigo-500/40'
                        : T.chipIdle
                    }`}
                  >
                    {q.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <p className={`text-[10px] font-bold uppercase tracking-widest mb-2 ${T.faint}`}>Exact date</p>
            <input
              type="date"
              value={selected}
              min={toLocalISODate(new Date())}
              onChange={(e) => setSelected(e.target.value)}
              className={`w-full px-3.5 py-2.5 rounded-xl text-sm transition-shadow ${T.input}`}
            />
            {selected && isPastISODate(selected) && (
              <FieldError message="Follow-up date can't be in the past" />
            )}
          </div>
        </div>

        <div className={`shrink-0 border-t px-5 py-4 flex items-center gap-2 ${dark ? 'border-white/10' : 'border-slate-100'}`}>
          {initial && (
            <button
              type="button"
              onClick={() => onSave('')}
              className={`px-3 py-2.5 rounded-xl text-xs font-bold transition-colors ${dark ? 'text-rose-300 bg-rose-500/10 hover:bg-rose-500/20' : 'text-rose-600 bg-rose-50 hover:bg-rose-100'}`}
            >
              Clear
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className={`flex-1 px-3 py-2.5 rounded-xl text-xs font-bold transition-colors ${dark ? 'text-slate-300 ring-1 ring-white/15 hover:bg-white/5' : 'text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50'}`}
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!selected || isPastISODate(selected)}
            onClick={() => onSave(selected)}
            className="flex-1 px-3 py-2.5 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-indigo-500 via-violet-500 to-fuchsia-500 shadow-md shadow-indigo-500/40 disabled:opacity-40 disabled:shadow-none transition-all hover:brightness-110"
          >
            Set follow-up
          </button>
        </div>
      </div>
    </>
  );
}