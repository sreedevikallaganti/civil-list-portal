'use client';

/* ================================================================
   CreateMeetingPanel — v7 (UI refresh)
   PERF: save closes instantly; Google automations run in background
         (with 12s timeout). Officer directory cached 60s.
   UI: app-window design language — dark pill CTAs, violet accents,
       rounded-2xl surfaces. LOGIC IDENTICAL to v6/v4.
================================================================ */

import { useState, useEffect, useRef, useMemo } from 'react';
import {
  X, Calendar, CalendarDays, Clock, Timer, MapPin, Check, Search,
  ChevronDown, ChevronLeft, ChevronRight, Loader2, Users, Mail, Phone, User,
  Sparkles, ArrowLeft, ArrowRight, AlertCircle, RefreshCw, Building2, Flag,
  Video, Globe, Plus, Zap, Activity, Feather, Edit2,
} from 'lucide-react';
import pb from '@/lib/pocketbase';
import { showToast } from '@/components/Toaster';

/* ------------------------------- CSS ------------------------------- */

const CUSTOM_CSS = `
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
.cmp-root { font-family:'Inter',ui-sans-serif,system-ui,-apple-system,'Segoe UI',Roboto,sans-serif; -webkit-font-smoothing:antialiased; }
@keyframes cFadeIn { from{opacity:0} to{opacity:1} }
@keyframes cFadeUp { from{opacity:0; transform:translateY(10px)} to{opacity:1; transform:translateY(0)} }
@keyframes cPanel  { from{opacity:0; transform:translateX(56px)} to{opacity:1; transform:translateX(0)} }
@keyframes cShimmer{ 0%{background-position:200% 0} 100%{background-position:-200% 0} }
.c-fade-in { animation:cFadeIn .25s ease both }
.c-fade-up { animation:cFadeUp .35s cubic-bezier(.22,1,.36,1) both }
.c-panel   { animation:cPanel  .32s cubic-bezier(.22,1,.36,1) both }
.c-overlay { animation:cFadeIn .2s ease both }
.c-sk { background:linear-gradient(90deg,#f1effc 25%,#e5e1f5 40%,#f1effc 55%); background-size:200% 100%; animation:cShimmer 1.5s linear infinite }
.nice-scroll::-webkit-scrollbar{width:8px}
.nice-scroll::-webkit-scrollbar-thumb{background:#e5e1f5;border-radius:999px}
`;
const Styles = () => <style dangerouslySetInnerHTML={{ __html: CUSTOM_CSS }} />;

/* ------------------------------- Types ------------------------------- */

interface CreateMeetingPanelProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  meetingToEdit?: any;
  editingMeeting?: any;
  defaultDate?: string;
  initialDate?: string;
  markedDates?: string[];
}

interface Officer {
  id: string; name: string; designation?: string;
  type: 'IAS' | 'IPS' | 'Other';
  cadre?: string; state?: string; contact_number?: string; email?: string;
  department?: string; current_position?: string; batch_year?: string;
}

/* --------------------------- Constants (colors refreshed) --------------------------- */

const OFFICER_BADGE: Record<string, { chip: string; avatar: string }> = {
  IAS:   { chip: 'bg-sky-50 text-sky-700 border-sky-200',     avatar: 'bg-sky-100 text-sky-700' },
  IPS:   { chip: 'bg-violet-50 text-violet-700 border-violet-200', avatar: 'bg-violet-100 text-violet-700' },
  Other: { chip: 'bg-slate-100 text-slate-600 border-slate-200',  avatar: 'bg-slate-200 text-slate-600' },
};

const PRIORITIES = [
  { value: 'Low',    icon: Feather,  bg: 'bg-emerald-50 border-emerald-300', text: 'text-emerald-700', dot: 'bg-emerald-500' },
  { value: 'Medium', icon: Activity, bg: 'bg-amber-50 border-amber-300',     text: 'text-amber-700',   dot: 'bg-amber-500' },
  { value: 'High',   icon: Zap,      bg: 'bg-rose-50 border-rose-300',       text: 'text-rose-700',    dot: 'bg-rose-500' },
];

const PLACE_OPTIONS = [
  { value: 'Office',  icon: Building2, hint: 'At your office' },
  { value: 'Outside', icon: Globe,     hint: 'External venue' },
];

const MEETING_TYPES = [
  { value: 'Internal', icon: Users, hint: 'Within your team',
    sel: 'bg-violet-50 border-violet-300', txt: 'text-violet-700' },
  { value: 'External', icon: Globe, hint: 'Outside participants',
    sel: 'bg-sky-50 border-sky-300', txt: 'text-sky-700' },
];

const STATUS_FLAGS = [
  { value: 'Scheduled',   dot: 'bg-violet-500' },
  { value: 'Completed',   dot: 'bg-emerald-500' },
  { value: 'Cancelled',   dot: 'bg-rose-500' },
  { value: 'Rescheduled', dot: 'bg-amber-500' },
];

const PRESET_DURATIONS = [15, 30, 45, 60, 90, 120, 180];

const QUICK_TIME_SLOTS = ['09:30','10:00','11:00','12:00','14:00','15:00','16:30','18:00'];
const HOUR_OPTIONS = Array.from({ length: 12 }, (_, i) => String(i + 1));
const MINUTE_OPTIONS = ['00','05','10','15','20','25','30','35','40','45','50','55'];

const OFFICER_EDIT_FIELDS = [
  { key: 'officer_name', label: 'Name' },
  { key: 'designation', label: 'Designation' },
  { key: 'contact_number', label: 'Phone' },
  { key: 'email', label: 'Email' },
  { key: 'department', label: 'Department' },
  { key: 'current_position', label: 'Position' },
  { key: 'cadre', label: 'Cadre' },
  { key: 'batch_year', label: 'Batch' },
];

const EMPTY_FORM = {
  agenda: '', meeting_date: '', meeting_time: '', duration: '', location: '',
  status: '', officer_type: '', officer_name: '', officer_id: '', designation: '',
  department: '', officer_category: '', contact_number: '', email: '', address: '',
  website: '', cadre: '', state: '', batch_year: '', current_position: '',
  previous_postings: '', date_of_birth: '', priority: '', meeting_type: '',
  meeting_place: '', status_flag: '', follow_up_date: '', attendees: '',
  send_invite: false, sync_gcal: false, add_meet: false,
  created_by: '', meet_link: '', gcal_event_id: '', gcal_link: '',
};

/* --------------------------- Helpers (unchanged) --------------------------- */

const toLocalISODate = (d: Date) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

const prettyDate = (s: string) => {
  if (!s) return 'Pick a date';
  const today = toLocalISODate(new Date());
  const tomorrow = toLocalISODate(new Date(Date.now() + 86400000));
  if (s === today) return 'Today';
  if (s === tomorrow) return 'Tomorrow';
  return new Date(`${s}T00:00:00`).toLocaleDateString('en-IN', {
    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
  });
};

const to12Hour = (t: string) => {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
};

const splitTo12 = (t: string) => {
  if (!t) return { hour: '', minute: '00', ampm: 'AM' as 'AM' | 'PM' };
  const [h, m] = t.split(':').map(Number);
  return { hour: String(h % 12 || 12), minute: String(m).padStart(2, '0'),
    ampm: (h >= 12 ? 'PM' : 'AM') as 'AM' | 'PM' };
};

const to24Hour = (h12: string, min: string, ap: string) => {
  let h = Number(h12) % 12;
  if (ap === 'PM') h += 12;
  return `${String(h).padStart(2, '0')}:${min}`;
};

const formatDuration = (m: number) => {
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60), mm = m % 60;
  return mm === 0 ? `${h} hr` : `${h}h ${mm}m`;
};

const clampInt = (v: string, max: number) => {
  if (v === '') return '';
  const n = parseInt(v, 10);
  return isNaN(n) || n < 0 ? '' : String(Math.min(n, max));
};

const isPastISODate = (iso: string) => !!iso && iso < toLocalISODate(new Date());
const isTodayISO = (iso: string) => !!iso && iso === toLocalISODate(new Date());

const PAST_DATE_MSG = 'The selected date has already passed. Please choose today or a future date.';
const PAST_TIME_MSG = 'This time has already passed today. Please pick a later time.';

const nowHHMM = () => {
  const n = new Date();
  return `${String(n.getHours()).padStart(2, '0')}:${String(n.getMinutes()).padStart(2, '0')}`;
};

const isPastTimeToday = (iso: string, time: string) =>
  !!iso && !!time && isTodayISO(iso) && time <= nowHHMM();

const addDays = (d: Date, n: number) => {
  const x = new Date(d); x.setDate(x.getDate() + n); return x;
};

const startOfWeekMonday = (d: Date) => {
  const s = new Date(d); s.setHours(0, 0, 0, 0);
  s.setDate(s.getDate() - ((s.getDay() + 6) % 7)); return s;
};

const addMinutesToTime = (time: string, mins: number): string => {
  if (!time || !mins) return '';
  const [h, m] = time.split(':').map(Number);
  const total = h * 60 + m + mins;
  return `${String(Math.floor(total / 60) % 24).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
};

const matchOption = (v: any, options: string[]): string => {
  if (!v) return '';
  const lv = String(v).trim().toLowerCase();
  return options.find((o) => o.toLowerCase() === lv) ?? '';
};

const extractDate = (m: any): string => String(m?.meeting_date ?? m?.date ?? '').slice(0, 10);

const extractTime = (m: any): string => {
  const t = String(m?.meeting_time ?? '').trim();
  if (t) {
    const match = t.match(/(\d{1,2}):(\d{2})/);
    if (match) return `${match[1].padStart(2, '0')}:${match[2]}`;
  }
  const raw = String(m?.meeting_date ?? '');
  if (raw.length > 10) {
    const match = raw.slice(11, 16).match(/(\d{1,2}):(\d{2})/);
    if (match) return `${match[1].padStart(2, '0')}:${match[2]}`;
  }
  return '';
};

const ERROR_SECTION_IDS: Record<string, string> = {
  officer: 'cmp-sec-officer', agenda: 'cmp-sec-agenda', date: 'cmp-sec-date',
  time: 'cmp-sec-time', duration: 'cmp-sec-time', place: 'cmp-sec-place',
  priority: 'cmp-sec-priority', follow_up: 'cmp-sec-followup',
};

const initialsOf = (name: string) =>
  name.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase();

/* Officer directory cache — avoids 3 collection fetches on every open */
let officerCache: { data: Officer[]; ts: number } | null = null;
const OFFICER_CACHE_TTL = 60_000;

/* fetch with hard timeout so a hanging automation never blocks forever */
async function postJSON(url: string, body: any, timeoutMs = 12_000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Automation failed');
    return data;
  } finally {
    clearTimeout(t);
  }
}

/* --------------------------- Small pieces --------------------------- */

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p className="c-fade-in mt-1.5 flex items-center gap-1.5 text-xs font-medium text-rose-600">
      <AlertCircle className="h-3.5 w-3.5 shrink-0" /> {message}
    </p>
  );
}

function SectionHead({ icon: Icon, title, sub, required, optional }: {
  icon: any; title: string; sub?: string; required?: boolean; optional?: boolean;
}) {
  return (
    <div className="mb-2.5 flex items-center gap-2.5">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-violet-50 text-violet-600">
        <Icon className="h-3.5 w-3.5" />
      </span>
      <div>
        <p className="text-[13px] font-semibold text-slate-800">
          {title}
          {required && <span className="ml-0.5 text-rose-500">*</span>}
          {optional && <span className="ml-1.5 text-[11px] font-normal text-slate-400">Optional</span>}
        </p>
        {sub && <p className="text-[11px] text-slate-400">{sub}</p>}
      </div>
    </div>
  );
}

function ToggleRow({ icon: Icon, title, description, checked, onChange }: {
  icon: any; title: string; description: string; checked: boolean; onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      role="switch"
      aria-checked={checked}
      className={`flex w-full items-center justify-between gap-3 rounded-2xl border p-3 text-left transition-all duration-150 ${
        checked ? 'border-violet-200 bg-violet-50/50' : 'border-slate-200 bg-white hover:border-slate-300'
      }`}
    >
      <div className="flex min-w-0 items-center gap-3">
        <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl transition-colors ${
          checked ? 'bg-violet-100 text-violet-600' : 'bg-slate-100 text-slate-400'
        }`}>
          <Icon className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <p className="text-[13px] font-semibold text-slate-800">{title}</p>
          <p className="truncate text-[11px] text-slate-400">{description}</p>
        </div>
      </div>
      <span className={`relative h-5 w-9 shrink-0 rounded-full transition-colors duration-200 ${
        checked ? 'bg-slate-900' : 'bg-slate-200'
      }`}>
        <span className={`absolute left-[2px] top-[2px] h-4 w-4 rounded-full bg-white shadow transition-transform duration-200 ${
          checked ? 'translate-x-4' : 'translate-x-0'
        }`} />
      </span>
    </button>
  );
}

function Pill({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-semibold tabular-nums text-slate-600">
      {children}
    </span>
  );
}

/* ----------------------------- WeekStrip ----------------------------- */

function WeekStrip({ value, onChange, markedDates = [] }: {
  value: string; onChange: (v: string) => void; markedDates?: string[];
}) {
  const [mode, setMode] = useState<'week' | 'month'>('week');
  const todayISO = toLocalISODate(new Date());
  const marked = useMemo(() => new Set(markedDates), [markedDates]);
  const [viewDate, setViewDate] = useState<Date>(() => value ? new Date(`${value}T00:00:00`) : new Date());

  useEffect(() => {
    if (!value) return;
    const d = new Date(`${value}T00:00:00`);
    if (!isNaN(d.getTime())) setViewDate(d);
  }, [value]);

  const weekStart = startOfWeekMonday(viewDate);
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const canGoPrevWeek = weekStart.getTime() > startOfWeekMonday(new Date()).getTime();
  const shiftWeek = (delta: number) => {
    if (delta < 0 && !canGoPrevWeek) return;
    setViewDate((prev) => addDays(prev, delta * 7));
  };
  const monthBadge = (() => {
    const m1 = days[0].toLocaleDateString('en', { month: 'short' }).toUpperCase();
    const m2 = days[6].toLocaleDateString('en', { month: 'short' }).toUpperCase();
    return m1 === m2 ? m1 : `${m1}–${m2}`;
  })();

  const y = viewDate.getFullYear();
  const mo = viewDate.getMonth();
  const canGoPrevMonth =
    y > new Date().getFullYear() ||
    (y === new Date().getFullYear() && mo > new Date().getMonth());
  const shiftMonth = (delta: number) => {
    if (delta < 0 && !canGoPrevMonth) return;
    setViewDate((prev) => new Date(prev.getFullYear(), prev.getMonth() + delta, 1));
  };

  const firstDow = (new Date(y, mo, 1).getDay() + 6) % 7;
  const daysInMonth = new Date(y, mo + 1, 0).getDate();
  const prevDays = new Date(y, mo, 0).getDate();
  const cells: { iso: string; day: number; inMonth: boolean }[] = [];
  for (let i = firstDow - 1; i >= 0; i--) {
    const d = new Date(y, mo - 1, prevDays - i);
    cells.push({ iso: toLocalISODate(d), day: d.getDate(), inMonth: false });
  }
  for (let day = 1; day <= daysInMonth; day++) {
    cells.push({ iso: toLocalISODate(new Date(y, mo, day)), day, inMonth: true });
  }
  let nd = 1;
  while (cells.length % 7 !== 0) {
    const d = new Date(y, mo + 1, nd++);
    cells.push({ iso: toLocalISODate(d), day: d.getDate(), inMonth: false });
  }
  const monthLabel = new Date(y, mo, 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });

  const navBtn = 'flex h-7 w-7 items-center justify-center rounded-full text-slate-500 transition-colors hover:bg-violet-50 hover:text-violet-600 active:scale-90 disabled:cursor-not-allowed disabled:text-slate-300 disabled:hover:bg-transparent';

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-3">
      <div className="mb-2.5 flex items-center justify-between">
        <div className="flex min-w-0 items-center gap-2">
          <button
            type="button" onClick={() => { setViewDate(new Date()); onChange(todayISO); }}
            title="Jump to today"
            className="flex shrink-0 flex-col items-center gap-0.5 rounded-xl px-2 py-1 text-slate-600 transition-colors hover:bg-violet-50 hover:text-violet-600"
          >
            <CalendarDays className="h-4 w-4" />
            <span className="text-[8px] font-bold leading-none tracking-widest">NOW</span>
          </button>
          {mode === 'week' && (
            <span className="shrink-0 rounded-full bg-amber-50 px-2.5 py-0.5 text-[10px] font-bold tracking-wider text-amber-700">
              {monthBadge}
            </span>
          )}
        </div>
        <div className="flex shrink-0 rounded-full bg-slate-100 p-0.5">
          {([['week', 'Weekly'], ['month', 'Monthly']] as const).map(([id, label]) => (
            <button
              key={id} type="button" onClick={() => setMode(id as 'week' | 'month')}
              className={`rounded-full px-3 py-1 text-[11px] font-semibold transition-all ${
                mode === id ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}
            >{label}</button>
          ))}
        </div>
        <div className="hidden w-[64px] sm:block" />
      </div>

      {mode === 'week' ? (
        <div className="flex items-center gap-1">
          <button type="button" className={navBtn} disabled={!canGoPrevWeek} onClick={() => shiftWeek(-1)}>
            <ChevronLeft className="h-4 w-4" />
          </button>
          <div className="grid flex-1 grid-cols-7 gap-0.5">
            {days.map((d) => {
              const iso = toLocalISODate(d);
              const selected = iso === value;
              const isToday = iso === todayISO;
              const isPast = iso < todayISO;
              return (
                <button
                  key={iso} type="button" disabled={isPast} onClick={() => onChange(iso)}
                  className={`flex flex-col items-center gap-0.5 rounded-2xl py-1.5 transition-all duration-150 ${
                    selected ? 'bg-violet-600 shadow-md shadow-violet-500/25'
                    : isPast ? 'cursor-not-allowed'
                    : 'hover:bg-violet-50 active:scale-95'
                  }`}
                >
                  <span className={`text-[10px] font-medium ${selected ? 'text-violet-200' : isPast ? 'text-slate-300' : 'text-slate-400'}`}>
                    {d.toLocaleDateString('en', { weekday: 'short' })}
                  </span>
                  <span className={`flex h-8 w-8 items-center justify-center rounded-xl text-[13px] font-semibold ${
                    selected ? 'text-white'
                    : isPast ? 'text-slate-300'
                    : isToday ? 'font-bold text-violet-600'
                    : 'text-slate-700'
                  }`}>{d.getDate()}</span>
                  <span className="flex h-1 items-center">
                    {marked.has(iso) && <span className={`h-1 w-1 rounded-full ${selected ? 'bg-white' : 'bg-amber-400'}`} />}
                  </span>
                </button>
              );
            })}
          </div>
          <button type="button" className={navBtn} onClick={() => shiftWeek(1)}>
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <div>
          <div className="mb-2 flex items-center justify-between">
            <button type="button" className={navBtn} disabled={!canGoPrevMonth} onClick={() => shiftMonth(-1)}>
              <ChevronLeft className="h-4 w-4" />
            </button>
            <p className="text-xs font-semibold text-slate-800">{monthLabel}</p>
            <button type="button" className={navBtn} onClick={() => shiftMonth(1)}>
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
          <div className="mb-0.5 grid grid-cols-7">
            {['M','T','W','T','F','S','S'].map((d, i) => (
              <div key={i} className="py-1 text-center text-[10px] font-semibold text-slate-400">{d}</div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-y-0.5">
            {cells.map((c) => {
              const selected = c.iso === value;
              const isToday = c.iso === todayISO;
              const isPast = c.iso < todayISO;
              return (
                <button
                  key={c.iso} type="button"
                  disabled={isPast && !selected}
                  onClick={() => { if (isPast) return; onChange(c.iso); }}
                  className={`relative flex h-8 w-full items-center justify-center rounded-xl text-xs font-semibold transition-all active:scale-90 ${
                    selected ? 'bg-violet-600 text-white shadow-md shadow-violet-500/25'
                    : isPast ? 'cursor-not-allowed text-slate-300'
                    : isToday ? 'font-bold text-violet-600 ring-1 ring-violet-200 hover:bg-violet-50'
                    : c.inMonth ? 'text-slate-700 hover:bg-violet-50'
                    : 'text-slate-300'
                  }`}
                >
                  {c.day}
                  {marked.has(c.iso) && !selected && (
                    <span className="absolute bottom-0.5 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-amber-400" />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

/* --------------------------- TimeSlotPicker --------------------------- */

function TimeSlotPicker({ value, onChange, meetingDate }: {
  value: string; onChange: (v: string) => void; meetingDate: string;
}) {
  const [hour, setHour] = useState(() => splitTo12(value).hour);
  const [minute, setMinute] = useState(() => splitTo12(value).minute);
  const [ampm, setAmpm] = useState<'AM' | 'PM'>(() => splitTo12(value).ampm);

  useEffect(() => {
    const p = splitTo12(value);
    setHour(p.hour); setMinute(p.minute); setAmpm(p.ampm);
  }, [value]);

  const isOptionPast = (h: string, m: string, ap: string) =>
    isPastTimeToday(meetingDate, to24Hour(h, m, ap));
  const firstAvailableMinute = (h: string, ap: string) =>
    MINUTE_OPTIONS.find((m) => !isOptionPast(h, m, ap)) ?? '';

  const pickHour = (h: string) => {
    setHour(h);
    if (!h) return;
    let m = minute;
    if (isOptionPast(h, m, ampm)) { m = firstAvailableMinute(h, ampm); setMinute(m || '00'); }
    if (m && !isOptionPast(h, m, ampm)) onChange(to24Hour(h, m, ampm));
  };
  const pickMinute = (m: string) => {
    setMinute(m);
    if (!hour) return;
    if (!isOptionPast(hour, m, ampm)) onChange(to24Hour(hour, m, ampm));
  };
  const pickAmpm = (ap: 'AM' | 'PM') => {
    setAmpm(ap);
    if (!hour) return;
    let m = minute;
    if (isOptionPast(hour, m, ap)) {
      m = firstAvailableMinute(hour, ap);
      if (!m) { setHour(''); setMinute('00'); return; }
      setMinute(m);
    }
    onChange(to24Hour(hour, m, ap));
  };

  const visibleSlots = QUICK_TIME_SLOTS.filter((t) => !isPastTimeToday(meetingDate, t));
  const selectCls = 'cursor-pointer bg-transparent px-1 py-1 text-xs font-semibold text-slate-700 outline-none';

  return (
    <div className="min-w-0 flex-1 space-y-2.5">
      {visibleSlots.length > 0 && (
        <div className="grid grid-cols-3 gap-1.5">
          {visibleSlots.map((t) => {
            const selected = value === t;
            return (
              <button
                key={t} type="button" onClick={() => onChange(t)}
                className={`whitespace-nowrap rounded-full border py-2 text-[11px] font-semibold tabular-nums transition-all active:scale-95 ${
                  selected ? 'border-violet-600 bg-violet-600 text-white shadow-md shadow-violet-500/25'
                  : 'border-slate-200 bg-white text-slate-600 hover:border-violet-300 hover:text-violet-700'
                }`}
              >{to12Hour(t)}</button>
            );
          })}
        </div>
      )}
      <div className="flex items-center justify-between gap-2 border-t border-slate-100 pt-2.5">
        <span className="shrink-0 text-[11px] text-slate-400">Different time?</span>
        <div className="flex items-center rounded-full border border-slate-200 bg-white p-1 transition focus-within:border-violet-400 focus-within:ring-4 focus-within:ring-violet-500/10">
          <select value={hour} onChange={(e) => pickHour(e.target.value)} aria-label="Hour" className={selectCls}>
            <option value="">HH</option>
            {HOUR_OPTIONS.map((h) => (
              <option key={h} value={h} disabled={firstAvailableMinute(h, ampm) === ''}>{h}</option>
            ))}
          </select>
          <span className="text-xs font-bold text-slate-300">:</span>
          <select value={minute} onChange={(e) => pickMinute(e.target.value)} aria-label="Minute" className={selectCls}>
            {MINUTE_OPTIONS.map((m) => (
              <option key={m} value={m} disabled={!!hour && isOptionPast(hour, m, ampm)}>{m}</option>
            ))}
          </select>
          <div className="ml-1 flex rounded-full bg-slate-100 p-0.5">
            {(['AM', 'PM'] as const).map((ap) => (
              <button
                key={ap} type="button" onClick={() => pickAmpm(ap)}
                className={`rounded-full px-2 py-0.5 text-[10px] font-bold transition-all ${
                  ampm === ap ? 'bg-white text-violet-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'
                }`}
              >{ap}</button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ============================= Main ============================= */

export default function CreateMeetingPanel({
  isOpen, onClose, onSuccess,
  meetingToEdit, editingMeeting,
  defaultDate, initialDate,
  markedDates,
}: CreateMeetingPanelProps) {
  /* Accept BOTH prop names so every page works */
  const editSource = meetingToEdit ?? editingMeeting ?? null;
  const resolvedDefaultDate = defaultDate ?? initialDate ?? '';

  const [step, setStep] = useState<1 | 2>(1);
  const [loading, setLoading] = useState(false);
  const [officerLoading, setOfficerLoading] = useState(false);

  const [officers, setOfficers] = useState<Officer[]>([]);
  const [officerSearch, setOfficerSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<'All' | 'IAS' | 'IPS' | 'Other'>('All');
  const [selectedOfficer, setSelectedOfficer] = useState<Officer | null>(null);
  const [showOfficerEdit, setShowOfficerEdit] = useState(false);

  const [showMoreDetails, setShowMoreDetails] = useState(false);
  const [attendeeInput, setAttendeeInput] = useState('');
  const [attendeeList, setAttendeeList] = useState<string[]>([]);

  const [isCustomMode, setIsCustomMode] = useState(false);
  const [customHours, setCustomHours] = useState('');
  const [customMinutes, setCustomMinutes] = useState('');

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [formData, setFormData] = useState(EMPTY_FORM);

  const searchRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

const isEditMode = !!editSource;
const editingId: string | null = editSource?.id ?? null;

  const inputCls = 'w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 hover:border-slate-300 focus:border-violet-400 focus:ring-4 focus:ring-violet-500/10';
  const inputErr = 'border-rose-300 focus:border-rose-400 focus:ring-rose-500/10';

  const miniNumCls = 'w-14 rounded-xl border border-slate-200 bg-white px-2 py-1.5 text-center text-sm font-semibold tabular-nums text-slate-800 outline-none transition focus:border-violet-400 focus:ring-2 focus:ring-violet-500/10';

const dateMarks = useMemo(() => {
  const s = new Set<string>(markedDates ?? []);
  if (editSource?.meeting_date) {
    const iso = String(editSource.meeting_date).slice(0, 10);
    if (iso) s.add(iso);
  }
  return Array.from(s);
}, [markedDates, editSource]);

  const stepRef = useRef<1 | 2>(1);
  const savingRef = useRef(false);
  const loadedFollowUpRef = useRef<string>('');
  const lastLoadedKeyRef = useRef<string | null>(null);

  const goStep = (s: 1 | 2) => { stepRef.current = s; setStep(s); };

  /* ---------------- data loading (with cache) — unchanged ---------------- */

  async function fetchOfficers() {
    if (officerCache && Date.now() - officerCache.ts < OFFICER_CACHE_TTL) {
      setOfficers(officerCache.data);
      return;
    }
    setOfficerLoading(true);
    try {
      const [ias, ips, others] = await Promise.all([
        pb.collection('ias_officers').getFullList({ sort: 'name' }),
        pb.collection('ips_officers').getFullList({ sort: 'name' }),
        pb.collection('other_contacts').getFullList({ sort: 'name' }),
      ]);
      const mapOfficer = (o: any, type: Officer['type']): Officer => ({
        id: o.id,
        name: o.name || '',
        designation: o.designation || o.current_position || o.occupation || '',
        type,
        cadre: o.cadre || '',
        state: o.state || '',
        contact_number: o.contact_number || o.phone || '',
        email: o.email || '',
        department: o.department || '',
        current_position: o.current_position || o.designation || '',
        batch_year: o.batch_year || '',
      });
      const data = [
        ...ias.map((o: any) => mapOfficer(o, 'IAS')),
        ...ips.map((o: any) => mapOfficer(o, 'IPS')),
        ...others.map((o: any) => mapOfficer(o, 'Other')),
      ];
      officerCache = { data, ts: Date.now() };
      setOfficers(data);
    } catch (error) {
      console.error('Failed to load directory:', error);
    } finally {
      setOfficerLoading(false);
    }
  }

  /* ---------------- lifecycle — unchanged ---------------- */

useEffect(() => {
  if (!isOpen) { lastLoadedKeyRef.current = null; return; }
  const stamp = editSource?.updated ?? '';
  const key = editingId ? `edit:${editingId}:${stamp}` : `create:${resolvedDefaultDate ?? ''}`;
  if (lastLoadedKeyRef.current === key) return;

  if (editingId) populateForEdit(editSource);
  else {
    resetForm();
    if (resolvedDefaultDate && !isPastISODate(resolvedDefaultDate)) {
      setFormData((prev) => ({ ...prev, meeting_date: resolvedDefaultDate }));
    }
  }
  lastLoadedKeyRef.current = key;
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [isOpen, editingId, editSource, resolvedDefaultDate]);

  useEffect(() => { if (isOpen) fetchOfficers(); }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const t = setTimeout(() => searchRef.current?.focus(), 250);
    return () => clearTimeout(t);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (!isOpen) return;
    const original = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = original; };
  }, [isOpen]);

  /* ---------------- edit / reset — unchanged ---------------- */

  const syncDurationUI = (durationValue: string) => {
    const n = Number(durationValue);
    if (durationValue && n > 0 && !PRESET_DURATIONS.includes(n)) {
      setIsCustomMode(true);
      setCustomHours(String(Math.floor(n / 60)));
      setCustomMinutes(String(n % 60));
    } else {
      setIsCustomMode(false);
      setCustomHours('');
      setCustomMinutes('');
    }
  };

  function populateForEdit(m: any) {
    const formattedDate = extractDate(m);
    const formattedTime = extractTime(m);
    const followUpRaw = String(m.follow_up_date || m.followup_date || '').slice(0, 10);
    loadedFollowUpRef.current = followUpRaw;

    let attendeesArr: string[] = [];
    if (m.attendees) {
      if (typeof m.attendees === 'object') {
        const arr = (m.attendees as any).attendees || Object.values(m.attendees);
        attendeesArr = Array.isArray(arr) ? arr.filter(Boolean).map(String) : [];
      } else if (typeof m.attendees === 'string') {
        attendeesArr = m.attendees.split(',').map((s: string) => s.trim()).filter(Boolean);
      }
    }

    const statusOpts = STATUS_FLAGS.map((s) => s.value);
    const priorityOpts = PRIORITIES.map((p) => p.value);
    const placeOpts = PLACE_OPTIONS.map((p) => p.value);
    const typeOpts = MEETING_TYPES.map((t) => t.value);
    const normalizedStatus = matchOption(m.status_flag || m.status, statusOpts) || 'Scheduled';

    setFormData({
      ...EMPTY_FORM,
      agenda: m.agenda || '',
      meeting_date: formattedDate,
      meeting_time: formattedTime,
      duration: String(m.duration ?? ''),
      location: m.location || '',
      status: normalizedStatus,
      officer_type: m.officer_type || '',
      officer_name: m.officer_name || '',
      officer_id: m.officer_id || '',
      designation: m.designation || '',
      department: m.department || '',
      officer_category: m.officer_category || '',
      contact_number: m.contact_number || '',
      email: m.email || '',
      address: m.address || '',
      website: m.website || '',
      cadre: m.cadre || '',
      state: m.state || '',
      batch_year: m.batch_year || '',
      current_position: m.current_position || '',
      previous_postings: m.previous_postings || '',
      date_of_birth: m.date_of_birth || '',
      priority: matchOption(m.priority, priorityOpts),
      meeting_type: matchOption(m.meeting_type, typeOpts),
      meeting_place: matchOption(m.meeting_place, placeOpts),
      status_flag: normalizedStatus,
      follow_up_date: followUpRaw,
      send_invite: Boolean(m.send_invite),
      sync_gcal: Boolean(m.sync_gcal),
      add_meet: Boolean(m.add_meet),
      created_by: m.created_by || '',
      meet_link: m.meet_link || '',
      gcal_event_id: m.gcal_event_id || '',
      gcal_link: m.gcal_link || '',
    });

    syncDurationUI(String(m.duration ?? ''));
    setAttendeeList(attendeesArr);
    setAttendeeInput('');

    if (m.officer_name) {
      setSelectedOfficer({
        id: m.officer_id || '', name: m.officer_name,
        designation: m.designation,
        type: (m.officer_type as 'IAS' | 'IPS' | 'Other') || 'Other',
        contact_number: m.contact_number, email: m.email,
        department: m.department, current_position: m.current_position,
        batch_year: m.batch_year, cadre: m.cadre, state: m.state,
      });
    } else {
      setSelectedOfficer(null);
    }
    setShowOfficerEdit(false);
    setShowMoreDetails(Boolean(
      m.meeting_type || m.status_flag || attendeesArr.length ||
      m.follow_up_date || m.followup_date ||
      m.meet_link || m.gcal_link || m.send_invite || m.sync_gcal || m.add_meet,
    ));
    setErrors({});
    setSubmitError(null);
    goStep(1);
    setOfficerSearch('');
    setTypeFilter('All');
  }

  function resetForm() {
    setFormData(EMPTY_FORM);
    loadedFollowUpRef.current = '';
    setSelectedOfficer(null);
    setOfficerSearch('');
    setTypeFilter('All');
    setAttendeeList([]);
    setAttendeeInput('');
    setShowMoreDetails(false);
    setShowOfficerEdit(false);
    syncDurationUI('');
    setErrors({});
    setSubmitError(null);
    goStep(1);
  }

  /* ---------------- derived — unchanged ---------------- */

  const filteredOfficers = useMemo(() => {
    const q = officerSearch.trim().toLowerCase();
    return officers.filter((o) => {
      if (typeFilter !== 'All' && o.type !== typeFilter) return false;
      if (!q) return true;
      return (
        o.name?.toLowerCase().includes(q) ||
        o.designation?.toLowerCase().includes(q) ||
        o.department?.toLowerCase().includes(q) ||
        o.cadre?.toLowerCase().includes(q) ||
        o.state?.toLowerCase().includes(q)
      );
    });
  }, [officers, officerSearch, typeFilter]);

  const todayISO = toLocalISODate(new Date());
  const followUpMin = toLocalISODate(addDays(new Date(), 1));

  const customTotal = (parseInt(customHours, 10) || 0) * 60 + (parseInt(customMinutes, 10) || 0);

  const durationNum = Number(formData.duration) || 0;
  const endTime = formData.meeting_time && durationNum > 0
    ? addMinutesToTime(formData.meeting_time, durationNum) : '';
  const timeRangeLabel = formData.meeting_time && endTime
    ? `${to12Hour(formData.meeting_time)} – ${to12Hour(endTime)}` : '';
  const crossesMidnight = !!(formData.meeting_time && endTime && endTime < formData.meeting_time);

  /* ---------------- handlers — unchanged ---------------- */

  const handleSelectOfficer = (officer: Officer) => {
    setSelectedOfficer(officer);
    setShowOfficerEdit(false);
    setFormData((prev) => ({
      ...prev,
      officer_name: officer.name || '', designation: officer.designation || '',
      officer_id: officer.id || '', officer_type: officer.type || '',
      contact_number: officer.contact_number || '', email: officer.email || '',
      department: officer.department || '', current_position: officer.current_position || '',
      batch_year: officer.batch_year || '', cadre: officer.cadre || '', state: officer.state || '',
    }));
    setOfficerSearch('');
    if (errors.officer) setErrors((p) => ({ ...p, officer: '' }));
  };

  const handleClearOfficer = () => {
    setSelectedOfficer(null);
    setShowOfficerEdit(false);
    setOfficerSearch('');
    setTypeFilter('All');
    setFormData((prev) => ({
      ...prev,
      officer_name: '', officer_id: '', officer_type: '', designation: '',
      contact_number: '', email: '', department: '', current_position: '',
      batch_year: '', cadre: '', state: '',
    }));
    setTimeout(() => searchRef.current?.focus(), 50);
  };

  const handleOfficerField = (key: string, v: string) =>
    setFormData((prev) => ({ ...prev, [key]: v }));

  const handleDateChange = (value: string) => {
    if (value && isPastISODate(value) && value !== formData.meeting_date) {
      setErrors((p) => ({ ...p, date: PAST_DATE_MSG }));
      return;
    }
    setFormData((prev) => ({ ...prev, meeting_date: value }));
    setErrors((p) => ({
      ...p, date: '',
      time: isPastTimeToday(value, formData.meeting_time) ? PAST_TIME_MSG : '',
    }));
  };

  const handleTimeChange = (value: string) => {
    setFormData((prev) => ({ ...prev, meeting_time: value }));
    setErrors((p) => ({
      ...p,
      time: isPastTimeToday(formData.meeting_date, value) ? PAST_TIME_MSG : '',
    }));
  };

  const handlePresetDuration = (minutes: number) => {
    setIsCustomMode(false);
    setCustomHours(''); setCustomMinutes('');
    setFormData((prev) => ({ ...prev, duration: String(minutes) }));
    if (errors.duration) setErrors((p) => ({ ...p, duration: '' }));
  };

  const handleOpenCustom = () => {
    const n = Number(formData.duration);
    if (n > 0 && !PRESET_DURATIONS.includes(n)) {
      setCustomHours(String(Math.floor(n / 60)));
      setCustomMinutes(String(n % 60));
    } else { setCustomHours(''); setCustomMinutes(''); }
    setIsCustomMode(true);
  };

  const handleCustomDuration = (hours: string, minutes: string) => {
    setCustomHours(hours); setCustomMinutes(minutes);
    const h = parseInt(hours, 10) || 0;
    const m = parseInt(minutes, 10) || 0;
    const total = h * 60 + m;
    setFormData((prev) => ({ ...prev, duration: total > 0 ? String(total) : '' }));
    if (total > 0 && errors.duration) setErrors((p) => ({ ...p, duration: '' }));
  };

  const handleCustomDone = () => {
    if (customTotal <= 0) {
      setIsCustomMode(false);
      setCustomHours(''); setCustomMinutes('');
      setFormData((prev) => ({ ...prev, duration: '' }));
      return;
    }
    setIsCustomMode(false);
  };

  const handlePriority = (v: string) => {
    setFormData((prev) => ({ ...prev, priority: v }));
    if (errors.priority) setErrors((p) => ({ ...p, priority: '' }));
  };

  const handlePlace = (v: string) => {
    setFormData((prev) => ({ ...prev, meeting_place: v }));
    if (errors.place) setErrors((p) => ({ ...p, place: '' }));
  };

  const handleStatusChange = (v: string) =>
    setFormData((prev) => ({ ...prev, status: v, status_flag: v }));

  const handleFollowUpChange = (v: string) => {
    setFormData((prev) => ({ ...prev, follow_up_date: v }));
    if (errors.follow_up) setErrors((p) => ({ ...p, follow_up: '' }));
  };

  const addAttendee = () => {
    const v = attendeeInput.trim();
    if (!v) return;
    if (!attendeeList.includes(v)) setAttendeeList((p) => [...p, v]);
    setAttendeeInput('');
  };

  const removeAttendee = (a: string) =>
    setAttendeeList((p) => p.filter((x) => x !== a));

  const scrollToFirstError = (errs: Record<string, string>) => {
    const first = Object.keys(ERROR_SECTION_IDS).find((k) => errs[k]);
    if (!first) return;
    if (first === 'follow_up' && !showMoreDetails) setShowMoreDetails(true);
    requestAnimationFrame(() => {
      document.getElementById(ERROR_SECTION_IDS[first])
        ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  };

  const handleContinue = () => {
    const e: Record<string, string> = {};
    if (!formData.officer_name.trim()) e.officer = 'Please select who the meeting is with';
    if (!formData.agenda.trim()) e.agenda = 'Agenda is required';
    if (Object.keys(e).length) { setErrors(e); scrollToFirstError(e); return; }
    setErrors({});
    goStep(2);
    scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  };

  /* ------------- background automations (non-blocking) — unchanged ------------- */

  function runAutomationsInBackground(record: any) {
    (async () => {
      try {
        const data = await postJSON('/api/google', {
          meetingId: record.id,
          gcalEventId: record.gcal_event_id || '',
          existingMeetLink: record.meet_link || '',
          agenda: formData.agenda,
          date: formData.meeting_date,
          time: formData.meeting_time,
          duration: durationNum || 30,
          location: formData.location,
          officerName: formData.officer_name,
          officerEmail: formData.email,
          includeMeet: formData.add_meet,
          sendInvite: formData.send_invite && !!formData.email,
          syncCalendar: formData.sync_gcal,
        });
        const patch: Record<string, any> = {};
        if (data.meetLink) patch.meet_link = data.meetLink;
        if (data.eventId) patch.gcal_event_id = data.eventId;
        if (data.htmlLink) patch.gcal_link = data.htmlLink;
        if (Object.keys(patch).length) {
          await pb.collection('meetings').update(record.id, patch);
        }
        showToast('Calendar & automations ready', 'success');
        onSuccess();
      } catch (err: any) {
        const msg = err?.name === 'AbortError'
          ? 'timed out' : err?.message || 'failed';
        showToast(`Meeting saved, but automations ${msg}`, 'error');
      }
    })();
  }

  /* ---------------- THE save: DB first, instant close — unchanged ---------------- */

  async function saveMeeting() {
    if (savingRef.current) return;
    if (stepRef.current !== 2) { handleContinue(); return; }

    const nextErrors: Record<string, string> = {};
    if (!formData.officer_name.trim()) nextErrors.officer = 'Please select who the meeting is with';
    if (!formData.agenda.trim()) nextErrors.agenda = 'Agenda is required';
    if (!formData.meeting_date) nextErrors.date = 'Meeting date is required';
    else if (isPastISODate(formData.meeting_date) && !isEditMode) nextErrors.date = PAST_DATE_MSG;
    if (!formData.meeting_time) nextErrors.time = 'Meeting time is required';
    if (!formData.duration || durationNum <= 0) nextErrors.duration = 'Please choose a duration';
    if (!formData.meeting_place) nextErrors.place = 'Please choose where the meeting will happen';
    if (!formData.priority) nextErrors.priority = 'Please set a priority';

    if (
      formData.follow_up_date &&
      formData.follow_up_date <= todayISO &&
      formData.follow_up_date !== loadedFollowUpRef.current
    ) {
      nextErrors.follow_up = 'Follow-up date must be a future date';
    }

    if (Object.keys(nextErrors).length) {
      if (nextErrors.officer || nextErrors.agenda) goStep(1);
      setErrors(nextErrors);
      scrollToFirstError(nextErrors);
      return;
    }

    setErrors({});
    savingRef.current = true;
    setLoading(true);
    setSubmitError(null);

    try {
      const payload: Record<string, any> = { ...formData, attendees: attendeeList };
      payload.duration = durationNum;

      if (!isEditMode) {
        payload.status = 'Scheduled';
        payload.status_flag = 'Scheduled';
        const auth: any = (pb as any).authStore;
        payload.created_by = auth?.record?.id || auth?.model?.id || '';
      }

      let record: any;
      if (isEditMode && editSource) {
        record = await pb.collection('meetings').update(editSource.id, payload);
      } else {
        record = await pb.collection('meetings').create(payload);
      }

      showToast(isEditMode ? 'Meeting updated' : 'Meeting created', 'success');
      onSuccess();
      onClose();

      const needsGoogle =
        (formData.send_invite && !!formData.email) ||
        formData.add_meet || formData.sync_gcal;
      if (needsGoogle) runAutomationsInBackground(record);
    } catch (err: any) {
      console.error('Failed to save meeting:', err);
      setSubmitError(err?.message || 'Something went wrong while saving. Please try again.');
    } finally {
      savingRef.current = false;
      setLoading(false);
    }
  }

  /* ---------------- render ---------------- */

  if (!isOpen) return null;

  const officerBadge = OFFICER_BADGE[selectedOfficer?.type || 'Other'];

  return (
    <div className="cmp-root fixed inset-0 z-[70] flex justify-end">
      <Styles />
      <div className="c-overlay absolute inset-0 bg-slate-900/40 backdrop-blur-[2px]" onClick={onClose} />

      <div className="c-panel relative z-10 flex h-full w-full flex-col bg-white shadow-2xl sm:max-w-xl">

        {/* progress */}
        <div className="h-0.5 w-full shrink-0 bg-slate-100">
          <div
            className="h-full bg-gradient-to-r from-violet-600 to-indigo-600 transition-all duration-500 ease-out"
            style={{ width: step === 1 ? '50%' : '100%' }}
          />
        </div>

        {/* header */}
        <div className="shrink-0 border-b border-slate-100 px-6 pb-4 pt-5">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-900 text-white shadow-md shadow-slate-900/20">
                {isEditMode ? <Edit2 className="h-4 w-4" /> : <Plus className="h-5 w-5" />}
              </span>
              <div>
                <h2 className="text-lg font-extrabold tracking-tight text-slate-900">
                  {isEditMode ? 'Edit Meeting' : 'New Meeting'}
                </h2>
                <p className="mt-0.5 text-xs text-slate-400">
                  {step === 1 ? 'Step 1 of 2 · Who & why' : 'Step 2 of 2 · When, where & priority'}
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="rounded-full p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* step tracker — dark pills */}
          <div className="mt-4 flex items-center gap-2">
            <button
              type="button"
              onClick={() => step === 2 && goStep(1)}
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-semibold transition-colors ${
                step === 1 ? 'bg-slate-900 text-white shadow-sm'
                : 'bg-violet-50 text-violet-700 hover:bg-violet-100 cursor-pointer'
              }`}
            >
              {step === 2 && <Check className="h-3 w-3" />} Step 1 · Details
            </button>
            <div className="h-px flex-1 bg-slate-200" />
            <div className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-semibold ${
              step === 2 ? 'bg-slate-900 text-white shadow-sm' : 'bg-slate-100 text-slate-400'
            }`}>
              Step 2 · Schedule
            </div>
          </div>
        </div>

        {/* body */}
        <div ref={scrollRef} className="nice-scroll min-h-0 flex-1 space-y-5 overflow-y-auto bg-[#f7f6fd] px-5 py-5 sm:px-6">

          {step === 1 && (
            <div key="s1" className="c-fade-up space-y-5">

              {/* Officer */}
              <section id="cmp-sec-officer" className="rounded-2xl border border-slate-200/80 bg-white p-4">
                <SectionHead icon={Users} title="Meeting with" required sub="Search the officer directory and pick a person" />

                {!selectedOfficer ? (
                  <>
                    {/* search */}
                    <div className="relative">
                      <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                      <input
                        ref={searchRef}
                        type="text"
                        value={officerSearch}
                        onChange={(e) => setOfficerSearch(e.target.value)}
                        placeholder="Search by name, designation, department…"
                        className={`${inputCls} pl-10 ${errors.officer ? inputErr : ''}`}
                      />
                    </div>
                    <FieldError message={errors.officer} />

                    {/* type filter pills */}
                    <div className="mt-3 flex flex-wrap items-center gap-1.5">
                      {(['All', 'IAS', 'IPS', 'Other'] as const).map((t) => (
                        <button
                          key={t} type="button" onClick={() => setTypeFilter(t)}
                          className={`rounded-full px-3 py-1 text-[11px] font-semibold transition-all ${
                            typeFilter === t
                              ? 'bg-slate-900 text-white shadow-sm'
                              : 'bg-slate-100 text-slate-500 hover:bg-slate-200 hover:text-slate-700'
                          }`}
                        >{t}</button>
                      ))}
                    </div>

                    {/* directory list */}
                    <div className="nice-scroll mt-3 max-h-64 space-y-1.5 overflow-y-auto pr-1">
                      {officerLoading ? (
                        Array.from({ length: 4 }).map((_, i) => (
                          <div key={i} className="flex items-center gap-3 rounded-2xl border border-slate-100 p-2.5">
                            <div className="c-sk h-9 w-9 rounded-full" />
                            <div className="flex-1 space-y-1.5">
                              <div className="c-sk h-3 w-1/3 rounded-full" />
                              <div className="c-sk h-2.5 w-1/2 rounded-full" />
                            </div>
                          </div>
                        ))
                      ) : filteredOfficers.length === 0 ? (
                        <div className="rounded-2xl border border-dashed border-violet-200 bg-violet-50/40 px-4 py-6 text-center">
                          <Users className="mx-auto h-6 w-6 text-violet-300" />
                          <p className="mt-2 text-xs font-semibold text-slate-600">No matches in the directory</p>
                          <p className="mt-0.5 text-[11px] text-slate-400">Try a different search or filter.</p>
                        </div>
                      ) : (
                        filteredOfficers.slice(0, 30).map((o) => (
                          <button
                            key={o.id} type="button" onClick={() => handleSelectOfficer(o)}
                            className="group flex w-full items-center gap-3 rounded-2xl border border-transparent p-2.5 text-left transition-all hover:border-violet-200 hover:bg-violet-50/50"
                          >
                            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-indigo-600 text-[11px] font-bold text-white shadow-sm">
                              {initialsOf(o.name || '?')}
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-[13px] font-semibold text-slate-900 group-hover:text-violet-700">
                                {o.name || 'Unnamed'}
                              </span>
                              <span className="block truncate text-[11px] text-slate-400">
                                {o.designation || o.current_position || o.department || '—'}
                              </span>
                            </span>
                            <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-bold ${OFFICER_BADGE[o.type].chip}`}>
                              {o.type}
                            </span>
                            <ChevronRight className="h-4 w-4 shrink-0 text-slate-300 transition-all group-hover:translate-x-0.5 group-hover:text-violet-500" />
                          </button>
                        ))
                      )}
                    </div>
                  </>
                ) : showOfficerEdit ? (
                  <>
                    {/* officer edit fields */}
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      {OFFICER_EDIT_FIELDS.map((f) => (
                        <div key={f.key} className={f.key === 'officer_name' ? 'sm:col-span-2' : ''}>
                          <label className="mb-1 block text-[11px] font-semibold text-slate-500">{f.label}</label>
                          <input
                            type="text"
                            value={formData[f.key as keyof typeof formData] as string || ''}
                            onChange={(e) => handleOfficerField(f.key, e.target.value)}
                            className={inputCls}
                          />
                        </div>
                      ))}
                    </div>
                    <div className="mt-3 flex items-center gap-2">
                      <button
                        type="button" onClick={() => setShowOfficerEdit(false)}
                        className="inline-flex items-center gap-1.5 rounded-full bg-slate-900 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-slate-800"
                      >
                        <Check className="h-3.5 w-3.5" /> Done
                      </button>
                      <button
                        type="button" onClick={handleClearOfficer}
                        className="rounded-full border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-500 transition-colors hover:bg-slate-50"
                      >
                        Remove officer
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    {/* selected officer card */}
                    <div className="flex items-center gap-3 rounded-2xl border border-violet-200 bg-violet-50/50 p-3.5">
                      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-indigo-600 text-sm font-bold text-white shadow-md shadow-violet-500/25">
                        {initialsOf(selectedOfficer.name || '?')}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="truncate text-sm font-bold text-slate-900">{selectedOfficer.name}</p>
                          <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-bold ${officerBadge.chip}`}>
                            {selectedOfficer.type}
                          </span>
                        </div>
                        <p className="mt-0.5 truncate text-[11px] text-slate-500">
                          {selectedOfficer.designation || selectedOfficer.current_position || '—'}
                          {selectedOfficer.department ? ` · ${selectedOfficer.department}` : ''}
                        </p>
                        {(selectedOfficer.contact_number || selectedOfficer.email) && (
                          <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-slate-400">
                            {selectedOfficer.contact_number && (
                              <span className="inline-flex items-center gap-1"><Phone className="h-3 w-3" />{selectedOfficer.contact_number}</span>
                            )}
                            {selectedOfficer.email && (
                              <span className="inline-flex items-center gap-1"><Mail className="h-3 w-3" /><span className="max-w-[180px] truncate">{selectedOfficer.email}</span></span>
                            )}
                          </p>
                        )}
                      </div>
                      <div className="flex shrink-0 flex-col gap-1.5">
                        <button
                          type="button" onClick={() => setShowOfficerEdit(true)}
                          className="inline-flex items-center gap-1 rounded-full bg-white px-3 py-1.5 text-[11px] font-semibold text-slate-600 ring-1 ring-slate-200 transition-colors hover:text-violet-600 hover:ring-violet-200"
                        >
                          <Edit2 className="h-3 w-3" /> Edit
                        </button>
                        <button
                          type="button" onClick={handleClearOfficer}
                          className="inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-[11px] font-semibold text-slate-400 transition-colors hover:bg-rose-50 hover:text-rose-600"
                        >
                          <X className="h-3 w-3" /> Clear
                        </button>
                      </div>
                    </div>
                    <FieldError message={errors.officer} />
                  </>
                )}
              </section>

              {/* Agenda */}
              <section id="cmp-sec-agenda" className="rounded-2xl border border-slate-200/80 bg-white p-4">
                <SectionHead icon={Calendar} title="Agenda" required sub="What is this meeting about?" />
                <textarea
                  rows={3}
                  value={formData.agenda}
                  onChange={(e) => {
                    setFormData((prev) => ({ ...prev, agenda: e.target.value }));
                    if (errors.agenda) setErrors((p) => ({ ...p, agenda: '' }));
                  }}
                  placeholder="e.g. Quarterly review of district development projects…"
                  className={`${inputCls} resize-y ${errors.agenda ? inputErr : ''}`}
                />
                <FieldError message={errors.agenda} />
              </section>
            </div>
          )}

          {step === 2 && (
            <div key="s2" className="c-fade-up space-y-5">

              {/* Date */}
              <section id="cmp-sec-date" className="rounded-2xl border border-slate-200/80 bg-white p-4">
                <SectionHead icon={CalendarDays} title="Meeting date" required sub="Pick a day — past dates are disabled" />
                <WeekStrip value={formData.meeting_date} onChange={handleDateChange} markedDates={dateMarks} />
                {formData.meeting_date && (
                  <p className="mt-2.5 flex items-center gap-1.5 text-xs font-semibold text-violet-600">
                    <CalendarDays className="h-3.5 w-3.5" /> {prettyDate(formData.meeting_date)}
                  </p>
                )}
                <FieldError message={errors.date} />
              </section>

              {/* Time + Duration */}
              <section id="cmp-sec-time" className="rounded-2xl border border-slate-200/80 bg-white p-4">
                <SectionHead icon={Clock} title="Time & duration" required sub="Quick slots or a custom time" />
                <div className="flex flex-col gap-3 sm:flex-row sm:items-stretch">
                  <TimeSlotPicker
                    value={formData.meeting_time}
                    onChange={handleTimeChange}
                    meetingDate={formData.meeting_date}
                  />
                  <div className="shrink-0 border-t border-slate-100 pt-3 sm:w-[150px] sm:border-l sm:border-t-0 sm:pl-3 sm:pt-0">
                    <p className="mb-1.5 text-[11px] font-semibold text-slate-500">Duration</p>
                    <div className="flex flex-wrap gap-1.5">
                      {PRESET_DURATIONS.map((m) => (
                        <button
                          key={m} type="button" onClick={() => handlePresetDuration(m)}
                          className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold tabular-nums transition-all active:scale-95 ${
                            formData.duration === String(m) && !isCustomMode
                              ? 'border-violet-600 bg-violet-600 text-white shadow-sm'
                              : 'border-slate-200 bg-white text-slate-600 hover:border-violet-300 hover:text-violet-700'
                          }`}
                        >{formatDuration(m)}</button>
                      ))}
                      {!isCustomMode ? (
                        <button
                          type="button" onClick={handleOpenCustom}
                          className="rounded-full border border-dashed border-slate-300 px-2.5 py-1 text-[11px] font-semibold text-slate-500 transition-colors hover:border-violet-300 hover:text-violet-600"
                        >Custom</button>
                      ) : (
                        <span className="flex items-center gap-1">
                          <input
                            type="text" inputMode="numeric" value={customHours}
                            onChange={(e) => handleCustomDuration(clampInt(e.target.value, 23), customMinutes)}
                            placeholder="h" aria-label="Hours" className={miniNumCls}
                          />
                          <input
                            type="text" inputMode="numeric" value={customMinutes}
                            onChange={(e) => handleCustomDuration(customHours, clampInt(e.target.value, 59))}
                            placeholder="m" aria-label="Minutes" className={miniNumCls}
                          />
                          <button
                            type="button" onClick={handleCustomDone}
                            className="rounded-full bg-slate-900 px-2.5 py-1.5 text-[11px] font-semibold text-white transition-colors hover:bg-slate-800"
                          ><Check className="h-3 w-3" /></button>
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {timeRangeLabel && (
                  <div className="mt-3 flex flex-wrap items-center gap-2 rounded-2xl bg-violet-50/60 px-3 py-2">
                    <Pill>{timeRangeLabel}</Pill>
                    <Pill>{formatDuration(durationNum)}</Pill>
                    {crossesMidnight && (
                      <span className="inline-flex items-center gap-1 text-[10.5px] font-semibold text-amber-600">
                        <AlertCircle className="h-3 w-3" /> Ends after midnight
                      </span>
                    )}
                  </div>
                )}
                <FieldError message={errors.time} />
                <FieldError message={errors.duration} />
              </section>

              {/* Place */}
              <section id="cmp-sec-place" className="rounded-2xl border border-slate-200/80 bg-white p-4">
                <SectionHead icon={MapPin} title="Where" required sub="Choose the meeting place" />
                <div className="grid grid-cols-2 gap-2">
                  {PLACE_OPTIONS.map((p) => {
                    const Icon = p.icon;
                    const selected = formData.meeting_place === p.value;
                    return (
                      <button
                        key={p.value} type="button" onClick={() => handlePlace(p.value)}
                        className={`flex items-center gap-2.5 rounded-2xl border p-3 text-left transition-all active:scale-[0.98] ${
                          selected ? 'border-violet-300 bg-violet-50/60 ring-1 ring-violet-200' : 'border-slate-200 hover:border-slate-300'
                        }`}
                      >
                        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
                          selected ? 'bg-violet-100 text-violet-600' : 'bg-slate-100 text-slate-400'
                        }`}>
                          <Icon className="h-4 w-4" />
                        </span>
                        <span className="min-w-0">
                          <span className={`block text-[13px] font-semibold ${selected ? 'text-violet-700' : 'text-slate-800'}`}>{p.value}</span>
                          <span className="block truncate text-[11px] text-slate-400">{p.hint}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>

                <div className="mt-3">
                  <label className="mb-1 block text-[11px] font-semibold text-slate-500">
                    {formData.meeting_place === 'Outside' ? 'Venue / address' : 'Room / details'} <span className="font-normal text-slate-400">(optional)</span>
                  </label>
                  <input
                    type="text"
                    value={formData.location}
                    onChange={(e) => setFormData((prev) => ({ ...prev, location: e.target.value }))}
                    placeholder={formData.meeting_place === 'Outside' ? 'e.g. Collectorate conference hall' : 'e.g. Cabin 3, Secretariat'}
                    className={inputCls}
                  />
                </div>
                <FieldError message={errors.place} />
              </section>

              {/* Priority */}
              <section id="cmp-sec-priority" className="rounded-2xl border border-slate-200/80 bg-white p-4">
                <SectionHead icon={Flag} title="Priority" required sub="How urgent is this meeting?" />
                <div className="grid grid-cols-3 gap-2">
                  {PRIORITIES.map((p) => {
                    const Icon = p.icon;
                    const selected = formData.priority === p.value;
                    return (
                      <button
                        key={p.value} type="button" onClick={() => handlePriority(p.value)}
                        className={`flex flex-col items-center gap-1.5 rounded-2xl border py-3 transition-all active:scale-[0.97] ${
                          selected ? `${p.bg} ring-1 ring-slate-900/10` : 'border-slate-200 hover:border-slate-300'
                        }`}
                      >
                        <Icon className={`h-4 w-4 ${selected ? p.text : 'text-slate-400'}`} />
                        <span className={`text-[12px] font-bold ${selected ? p.text : 'text-slate-500'}`}>{p.value}</span>
                        <span className={`h-1.5 w-1.5 rounded-full ${p.dot}`} />
                      </button>
                    );
                  })}
                </div>
                <FieldError message={errors.priority} />
              </section>

              {/* More details */}
              <section className="rounded-2xl border border-slate-200/80 bg-white p-4">
                <button
                  type="button" onClick={() => setShowMoreDetails((v) => !v)}
                  className="flex w-full items-center justify-between gap-2 text-left"
                >
                  <SectionHead icon={Sparkles} title="More details" optional sub="Type, attendees, follow-up & automations" />
                  <ChevronDown className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${showMoreDetails ? 'rotate-180' : ''}`} />
                </button>

                {showMoreDetails && (
                  <div className="c-fade-in mt-3 space-y-4 border-t border-slate-100 pt-4">

                    {/* Status — edit mode only */}
                    {isEditMode && (
                      <div>
                        <p className="mb-1.5 text-[11px] font-semibold text-slate-500">Status</p>
                        <div className="flex flex-wrap gap-1.5">
                          {STATUS_FLAGS.map((s) => {
                            const selected = formData.status === s.value;
                            return (
                              <button
                                key={s.value} type="button" onClick={() => handleStatusChange(s.value)}
                                className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11.5px] font-semibold transition-all active:scale-95 ${
                                  selected ? 'border-slate-900 bg-slate-900 text-white shadow-sm' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                                }`}
                              >
                                <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
                                {s.value}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Meeting type */}
                    <div>
                      <p className="mb-1.5 text-[11px] font-semibold text-slate-500">Meeting type <span className="font-normal text-slate-400">(optional)</span></p>
                      <div className="grid grid-cols-2 gap-2">
                        {MEETING_TYPES.map((t) => {
                          const Icon = t.icon;
                          const selected = formData.meeting_type === t.value;
                          return (
                            <button
                              key={t.value} type="button"
                              onClick={() => setFormData((prev) => ({ ...prev, meeting_type: selected ? '' : t.value }))}
                              className={`flex items-center gap-2.5 rounded-2xl border p-3 text-left transition-all active:scale-[0.98] ${
                                selected ? `${t.sel} ring-1 ring-slate-900/10` : 'border-slate-200 hover:border-slate-300'
                              }`}
                            >
                              <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${selected ? `bg-white ${t.txt}` : 'bg-slate-100 text-slate-400'}`}>
                                <Icon className="h-4 w-4" />
                              </span>
                              <span className="min-w-0">
                                <span className={`block text-[12.5px] font-semibold ${selected ? t.txt : 'text-slate-800'}`}>{t.value}</span>
                                <span className="block truncate text-[10.5px] text-slate-400">{t.hint}</span>
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Attendees */}
                    <div>
                      <p className="mb-1.5 text-[11px] font-semibold text-slate-500">Attendees <span className="font-normal text-slate-400">(optional, comma or enter to add)</span></p>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={attendeeInput}
                          onChange={(e) => setAttendeeInput(e.target.value)}
                          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addAttendee(); } }}
                          placeholder="name@example.com"
                          className={inputCls}
                        />
                        <button
                          type="button" onClick={addAttendee}
                          className="shrink-0 rounded-xl bg-slate-100 px-3.5 text-slate-600 transition-colors hover:bg-slate-200 hover:text-slate-800"
                          aria-label="Add attendee"
                        ><Plus className="h-4 w-4" /></button>
                      </div>
                      {attendeeList.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {attendeeList.map((a) => (
                            <span key={a} className="inline-flex items-center gap-1.5 rounded-full bg-violet-50 px-2.5 py-1 text-[11px] font-semibold text-violet-700 ring-1 ring-inset ring-violet-200">
                              {a}
                              <button type="button" onClick={() => removeAttendee(a)} className="text-violet-400 transition-colors hover:text-rose-500" aria-label={`Remove ${a}`}>
                                <X className="h-3 w-3" />
                              </button>
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Follow-up */}
                    <div id="cmp-sec-followup">
                      <p className="mb-1.5 text-[11px] font-semibold text-slate-500">Follow-up date <span className="font-normal text-slate-400">(must be a future date)</span></p>
                      <input
                        type="date"
                        min={followUpMin}
                        value={formData.follow_up_date}
                        onChange={(e) => handleFollowUpChange(e.target.value)}
                        className={`${inputCls} ${errors.follow_up ? inputErr : ''}`}
                      />
                      <FieldError message={errors.follow_up} />
                    </div>

                    {/* Automations */}
                    <div className="space-y-2">
                      <ToggleRow
                        icon={Video} checked={formData.add_meet}
                        onChange={(v) => setFormData((prev) => ({ ...prev, add_meet: v }))}
                        title="Generate Google Meet link"
                        description="A Meet link is created and saved to the meeting"
                      />
                      <ToggleRow
                        icon={Mail} checked={formData.send_invite}
                        onChange={(v) => setFormData((prev) => ({ ...prev, send_invite: v }))}
                        title="Email invite to officer"
                        description="Sends the invite to the officer's email address"
                      />
                      <ToggleRow
                        icon={RefreshCw} checked={formData.sync_gcal}
                        onChange={(v) => setFormData((prev) => ({ ...prev, sync_gcal: v }))}
                        title="Sync to Google Calendar"
                        description="Creates a matching event on Google Calendar"
                      />
                    </div>
                  </div>
                )}
              </section>
            </div>
          )}

          {/* submit error banner */}
          {submitError && (
            <div className="c-fade-in flex items-start gap-2.5 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-500" />
              <p className="text-xs font-medium leading-relaxed text-rose-700">{submitError}</p>
            </div>
          )}
        </div>

        {/* footer */}
        <div className="shrink-0 border-t border-slate-100 bg-white px-5 py-3.5 sm:px-6">
          <div className="flex items-center gap-2.5">
            {step === 2 && (
              <button
                type="button" onClick={() => goStep(1)}
                className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 px-4 py-2.5 text-[13px] font-semibold text-slate-600 transition-colors hover:bg-slate-50"
              >
                <ArrowLeft className="h-4 w-4" /> Back
              </button>
            )}

            <div className="ml-auto flex items-center gap-2.5">
              {step === 1 ? (
                <button
                  type="button" onClick={handleContinue}
                  className="group inline-flex items-center gap-1.5 rounded-full bg-slate-900 px-5 py-2.5 text-[13px] font-semibold text-white shadow-lg shadow-slate-900/15 transition-all hover:-translate-y-0.5 hover:bg-slate-800 active:scale-[0.98]"
                >
                  Continue <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                </button>
              ) : (
                <button
                  type="button" onClick={saveMeeting} disabled={loading}
                  className="inline-flex items-center gap-1.5 rounded-full bg-slate-900 px-5 py-2.5 text-[13px] font-semibold text-white shadow-lg shadow-slate-900/15 transition-all hover:-translate-y-0.5 hover:bg-slate-800 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0"
                >
                  {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                  {loading ? 'Saving…' : isEditMode ? 'Save changes' : 'Create meeting'}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}