'use client';

import { useState, useEffect, useRef, useMemo, type FormEvent } from 'react';
import {
  X, Calendar, CalendarDays, Clock, MapPin, Trash2, Check, Search, ChevronDown,
  ChevronLeft, ChevronRight, Loader2, Users, Mail, Phone, User,
  Sparkles, ArrowLeft, AlertCircle, RefreshCw, Building2, Flag,
  Video, Globe, Plus, Zap, Activity, Feather, Sun
} from 'lucide-react';
import pb from '@/lib/pocketbase';
import { showToast } from '@/components/Toaster';

/* ================================================================
   Types
================================================================ */

interface CreateMeetingPanelProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  meetingToEdit?: any;
  defaultDate?: string;
  markedDates?: string[];
}

interface Officer {
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

/* ================================================================
   Constants & helpers
================================================================ */

const OFFICER_TYPE_STYLES: Record<string, { gradient: string; badge: string }> = {
  IAS: { gradient: 'from-blue-500 to-indigo-600', badge: 'bg-blue-50 text-blue-700 ring-blue-200' },
  IPS: { gradient: 'from-indigo-500 to-violet-600', badge: 'bg-indigo-50 text-indigo-700 ring-indigo-200' },
  Other: { gradient: 'from-slate-500 to-slate-700', badge: 'bg-slate-100 text-slate-600 ring-slate-200' },
};

const PRIORITIES = [
  { value: 'Low', icon: Feather, bg: 'bg-emerald-50', text: 'text-emerald-700', ring: 'ring-emerald-300' },
  { value: 'Medium', icon: Activity, bg: 'bg-amber-50', text: 'text-amber-700', ring: 'ring-amber-300' },
  { value: 'High', icon: Zap, bg: 'bg-rose-50', text: 'text-rose-700', ring: 'ring-rose-300' },
];

const PLACE_OPTIONS = [
  { value: 'Office', icon: Building2, hint: 'At your office' },
  { value: 'Outside', icon: Globe, hint: 'External venue' },
];

const MEETING_TYPES = [
  { value: 'Internal', icon: Users, hint: 'Within your team' },
  { value: 'External', icon: Globe, hint: 'Outside participants' },
];

const STATUS_FLAGS = [
  { value: 'Scheduled', dot: 'bg-blue-500' },
  { value: 'Completed', dot: 'bg-emerald-500' },
  { value: 'Cancelled', dot: 'bg-rose-500' },
  { value: 'Rescheduled', dot: 'bg-amber-500' },
];

const PRESET_DURATIONS = [15, 30, 45, 60, 90, 120, 180];

const QUICK_TIME_SLOTS = [
  '09:30', '10:00', '11:00', '12:00',
  '14:00', '15:00', '16:30', '18:00',
];

const HOUR_OPTIONS = Array.from({ length: 12 }, (_, i) => String(i + 1));
const MINUTE_OPTIONS = ['00', '05', '10', '15', '20', '25', '30', '35', '40', '45', '50', '55'];

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

/* notes & follow_up_date REMOVED — managed in MeetingUpdatePanel */
const EMPTY_FORM = {
  agenda: '',
  meeting_date: '',
  meeting_time: '',
  duration: '',
  location: '',
  status: '',
  officer_type: '',
  officer_name: '',
  officer_id: '',
  designation: '',
  department: '',
  officer_category: '',
  contact_number: '',
  email: '',
  address: '',
  website: '',
  cadre: '',
  state: '',
  batch_year: '',
  current_position: '',
  previous_postings: '',
  date_of_birth: '',
  priority: '',
  meeting_type: '',
  meeting_place: '',
  status_flag: '',
  attendees: '',
  send_invite: false,
  sync_gcal: false,
  add_meet: false,
  created_by: '',
  meet_link: '',
  gcal_event_id: '',
  gcal_link: '',
};

const toLocalISODate = (d: Date) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

const prettyDate = (dateStr: string) => {
  if (!dateStr) return 'Pick a date';
  const today = toLocalISODate(new Date());
  const tomorrow = toLocalISODate(new Date(Date.now() + 86400000));
  if (dateStr === today) return 'Today';
  if (dateStr === tomorrow) return 'Tomorrow';
  return new Date(`${dateStr}T00:00:00`).toLocaleDateString('en-IN', {
    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
  });
};

const to12Hour = (t: string) => {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const hr = h % 12 || 12;
  return `${hr}:${String(m).padStart(2, '0')} ${ampm}`;
};

const splitTo12 = (t: string) => {
  if (!t) return { hour: '', minute: '00', ampm: 'AM' as 'AM' | 'PM' };
  const [h, m] = t.split(':').map(Number);
  return {
    hour: String(h % 12 || 12),
    minute: String(m).padStart(2, '0'),
    ampm: (h >= 12 ? 'PM' : 'AM') as 'AM' | 'PM',
  };
};

const to24Hour = (h12: string, min: string, ap: string) => {
  let h = Number(h12) % 12;
  if (ap === 'PM') h += 12;
  return `${String(h).padStart(2, '0')}:${min}`;
};

const formatDuration = (m: number) => {
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const mm = m % 60;
  if (mm === 0) return `${h} hr`;
  return `${h}h ${mm}m`;
};

const typeStyle = (t?: string) => OFFICER_TYPE_STYLES[t || 'Other'] ?? OFFICER_TYPE_STYLES.Other;

const clampInt = (v: string, max: number) => {
  if (v === '') return '';
  const n = parseInt(v, 10);
  if (isNaN(n) || n < 0) return '';
  return String(Math.min(n, max));
};

const isPastISODate = (iso: string) => !!iso && iso < toLocalISODate(new Date());

const PAST_DATE_MSG = 'The selected date has already passed. Please choose today or a future date.';
const PAST_TIME_MSG = 'This time has already passed today. Please pick a later time.';

const isTodayISO = (iso: string) => !!iso && iso === toLocalISODate(new Date());

const nowHHMM = () => {
  const n = new Date();
  return `${String(n.getHours()).padStart(2, '0')}:${String(n.getMinutes()).padStart(2, '0')}`;
};

const isPastTimeToday = (iso: string, time: string) =>
  !!iso && !!time && isTodayISO(iso) && time <= nowHHMM();

const addDays = (d: Date, n: number) => {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
};

const startOfWeekMonday = (d: Date) => {
  const s = new Date(d);
  s.setHours(0, 0, 0, 0);
  s.setDate(s.getDate() - ((s.getDay() + 6) % 7));
  return s;
};

/* ================================================================
   Small presentational pieces
================================================================ */

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p className="flex items-center gap-1.5 text-xs text-rose-600 mt-1.5 animate-in fade-in duration-200">
      <AlertCircle className="w-3.5 h-3.5 shrink-0" /> {message}
    </p>
  );
}

function SectionLabel({ icon: Icon, text, optional }: { icon: any; text: string; optional?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <div className="w-8 h-8 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
        <Icon className="w-4 h-4" />
      </div>
      <p className="text-sm font-bold text-slate-900">{text}</p>
      {optional && <span className="text-[10px] font-medium text-slate-400">(optional)</span>}
    </div>
  );
}

function SummaryPill({ children }: { children: React.ReactNode }) {
  return (
    <span className="px-2.5 py-1 rounded-full bg-indigo-50 text-indigo-700 text-[11px] font-bold tabular-nums ring-1 ring-indigo-100">
      {children}
    </span>
  );
}

function StepBadge({ n }: { n: number }) {
  return (
    <span className="w-7 h-7 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 text-white text-xs font-bold flex items-center justify-center shadow-md shadow-indigo-500/25 ring-4 ring-indigo-50 shrink-0">
      {n}
    </span>
  );
}

function ToggleRow({ icon: Icon, title, description, checked, onChange }: {
  icon: any; title: string; description: string; checked: boolean; onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={`w-full flex items-center justify-between gap-3 p-3 rounded-xl ring-1 transition-all text-left bg-white ${
        checked ? 'ring-indigo-200 bg-indigo-50/40' : 'ring-slate-200 hover:ring-slate-300'
      }`}
    >
      <div className="flex items-center gap-3 min-w-0">
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 transition-colors ${checked ? 'bg-indigo-100 text-indigo-600' : 'bg-slate-100 text-slate-400'}`}>
          <Icon className="w-4 h-4" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-800">{title}</p>
          <p className="text-xs text-slate-400 truncate">{description}</p>
        </div>
      </div>
      <span className={`relative w-10 h-[22px] rounded-full transition-colors shrink-0 ${checked ? 'bg-indigo-600' : 'bg-slate-200'}`}>
        <span className={`absolute top-[3px] left-[3px] w-4 h-4 bg-white rounded-full shadow transition-transform ${checked ? 'translate-x-[18px]' : 'translate-x-0'}`} />
      </span>
    </button>
  );
}

/* ================================================================
   WeekStrip
================================================================ */
function WeekStrip({ value, onChange, markedDates = [] }: {
  value: string; onChange: (v: string) => void; markedDates?: string[];
}) {
  const [mode, setMode] = useState<'week' | 'month'>('week');
  const todayISO = toLocalISODate(new Date());
  const marked = useMemo(() => new Set(markedDates), [markedDates]);

  const [viewDate, setViewDate] = useState<Date>(() =>
    value ? new Date(`${value}T00:00:00`) : new Date()
  );

  useEffect(() => {
    if (!value) return;
    const d = new Date(`${value}T00:00:00`);
    if (!isNaN(d.getTime())) setViewDate(d);
  }, [value]);

  const weekStart = startOfWeekMonday(viewDate);
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const canGoPrevWeek =
    weekStart.getTime() > startOfWeekMonday(new Date()).getTime();
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

  const monthLabel = new Date(y, mo, 1).toLocaleDateString('en-IN', {
    month: 'long', year: 'numeric',
  });

  const jumpToNow = () => {
    setViewDate(new Date());
    onChange(todayISO);
  };

  return (
    <div className="rounded-2xl ring-1 ring-slate-200 bg-white p-3 shadow-sm">
      <div className="flex items-center justify-between mb-2.5">
        <div className="flex items-center gap-2 min-w-0">
          <button
            type="button"
            onClick={jumpToNow}
            title="Jump to today"
            className="flex flex-col items-center gap-0.5 px-2 py-1 rounded-lg text-slate-700 hover:bg-slate-100 transition-colors shrink-0 active:scale-95"
          >
            <CalendarDays className="w-4 h-4" />
            <span className="text-[8px] font-extrabold tracking-widest leading-none">NOW</span>
          </button>
          {mode === 'week' && (
            <span className="px-2 py-0.5 rounded-lg bg-amber-50 ring-1 ring-amber-200 text-amber-700 text-[10px] font-extrabold tracking-wider shrink-0">
              {monthBadge}
            </span>
          )}
        </div>

        <div className="flex bg-slate-100 rounded-full p-1 shrink-0">
          {([
            { id: 'week' as const, label: 'Weekly' },
            { id: 'month' as const, label: 'Monthly' },
          ]).map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setMode(t.id)}
              className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all ${
                mode === t.id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="w-[76px] hidden sm:block" />
      </div>

      {mode === 'week' ? (
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => shiftWeek(-1)}
            disabled={!canGoPrevWeek}
            title="Previous week"
            className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 transition-colors ${
              canGoPrevWeek ? 'hover:bg-slate-100 text-slate-500 active:scale-90' : 'text-slate-300 cursor-not-allowed'
            }`}
          >
            <ChevronLeft className="w-4 h-4" />
          </button>

          <div className="flex-1 grid grid-cols-7 gap-0.5">
            {days.map((d) => {
              const iso = toLocalISODate(d);
              const selected = iso === value;
              const isToday = iso === todayISO;
              const isPast = iso < todayISO;
              const hasMark = marked.has(iso);
              return (
                <button
                  key={iso}
                  type="button"
                  disabled={isPast}
                  onClick={() => onChange(iso)}
                  className={`flex flex-col items-center gap-1 py-2 px-0.5 rounded-2xl transition-all
                    ${selected
                      ? 'bg-slate-900 shadow-lg shadow-slate-900/20 scale-[1.04]'
                      : isPast
                        ? 'cursor-not-allowed'
                        : 'hover:bg-slate-100 active:scale-95'}`}
                >
                  <span className={`text-[10px] font-semibold ${
                    selected ? 'text-slate-300' : isPast ? 'text-slate-300' : 'text-slate-400'
                  }`}>
                    {d.toLocaleDateString('en', { weekday: 'short' })}
                  </span>
                  <span className={`w-9 h-9 rounded-xl flex items-center justify-center text-sm font-bold ${
                    selected
                      ? 'bg-white/10 text-white'
                      : isPast
                        ? 'text-slate-300'
                        : isToday
                          ? 'text-indigo-600 font-extrabold'
                          : 'text-slate-800'
                  }`}>
                    {d.getDate()}
                  </span>
                  <span className="h-1 flex items-center justify-center">
                    {hasMark && (
                      <span className={`w-1 h-1 rounded-full ${selected ? 'bg-amber-300' : 'bg-amber-400'}`} />
                    )}
                  </span>
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={() => shiftWeek(1)}
            title="Next week"
            className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 hover:bg-slate-100 text-slate-500 transition-colors active:scale-90"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      ) : (
        <div>
          <div className="flex items-center justify-between mb-2">
            <button
              type="button"
              onClick={() => shiftMonth(-1)}
              disabled={!canGoPrevMonth}
              className={`w-7 h-7 rounded-lg flex items-center justify-center transition-colors ${
                canGoPrevMonth ? 'hover:bg-slate-100 text-slate-500 active:scale-90' : 'text-slate-300 cursor-not-allowed'
              }`}
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <p className="text-xs font-bold text-slate-800">{monthLabel}</p>
            <button
              type="button"
              onClick={() => shiftMonth(1)}
              className="w-7 h-7 rounded-lg hover:bg-slate-100 flex items-center justify-center text-slate-500 transition-colors active:scale-90"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-7 mb-0.5">
            {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => (
              <div key={i} className="text-center text-[10px] font-bold text-slate-400 py-1">{d}</div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-y-0.5">
            {cells.map((c) => {
              const selected = c.iso === value;
              const isToday = c.iso === todayISO;
              const isPast = c.iso < todayISO;
              const hasMark = marked.has(c.iso);
              return (
                <button
                  key={c.iso}
                  type="button"
                  disabled={isPast && !selected}
                  onClick={() => { if (isPast) return; onChange(c.iso); }}
                  className={`relative w-full h-9 rounded-xl text-xs font-bold flex items-center justify-center transition-all active:scale-90
                    ${selected
                      ? 'bg-slate-900 text-white shadow-md shadow-slate-900/25'
                      : isPast
                        ? 'text-slate-300/70 cursor-not-allowed'
                        : isToday
                          ? 'text-indigo-600 ring-1 ring-indigo-200 hover:bg-indigo-50'
                          : c.inMonth
                            ? 'text-slate-700 hover:bg-slate-100'
                            : 'text-slate-300 hover:text-slate-500'}`}
                >
                  {c.day}
                  {hasMark && !selected && (
                    <span className="absolute bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-amber-400" />
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

/* ================================================================
   TimeSlotPicker
================================================================ */

function TimeSlotPicker({ value, onChange, meetingDate }: {
  value: string; onChange: (v: string) => void; meetingDate: string;
}) {
  const [hour, setHour] = useState(() => splitTo12(value).hour);
  const [minute, setMinute] = useState(() => splitTo12(value).minute);
  const [ampm, setAmpm] = useState<'AM' | 'PM'>(() => splitTo12(value).ampm);

  useEffect(() => {
    const p = splitTo12(value);
    setHour(p.hour);
    setMinute(p.minute);
    setAmpm(p.ampm);
  }, [value]);

  const isOptionPast = (h: string, m: string, ap: string) =>
    isPastTimeToday(meetingDate, to24Hour(h, m, ap));

  const firstAvailableMinute = (h: string, ap: string) =>
    MINUTE_OPTIONS.find((m) => !isOptionPast(h, m, ap)) ?? '';

  const pickHour = (h: string) => {
    setHour(h);
    if (!h) return;
    let m = minute;
    if (isOptionPast(h, m, ampm)) {
      m = firstAvailableMinute(h, ampm);
      setMinute(m || '00');
    }
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

  const selectCls = 'bg-transparent text-xs font-bold text-slate-700 outline-none cursor-pointer py-1 px-1';

  return (
    <div className="flex-1 min-w-0 space-y-2.5">
      {visibleSlots.length > 0 && (
        <div className="grid grid-cols-3 gap-1.5">
          {visibleSlots.map((t) => {
            const selected = value === t;
            return (
              <button
                key={t}
                type="button"
                onClick={() => onChange(t)}
                className={`py-2.5 rounded-xl text-[11px] font-bold tabular-nums whitespace-nowrap transition-all active:scale-95
                  ${selected
                    ? 'bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-md shadow-indigo-500/30 scale-[1.02]'
                    : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:ring-indigo-300 hover:text-indigo-700 hover:bg-indigo-50/50 hover:-translate-y-px'}`}
              >
                {to12Hour(t)}
              </button>
            );
          })}
        </div>
      )}

      <div className="flex items-center justify-between gap-2 pt-2.5 border-t border-slate-100">
        <span className="text-[11px] font-medium text-slate-400 shrink-0">Different time?</span>
        <div className="flex items-center rounded-xl bg-white ring-1 ring-slate-200 p-1 shadow-sm focus-within:ring-2 focus-within:ring-indigo-500 transition-shadow">
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
          <div className="flex rounded-lg bg-slate-100 p-0.5 ml-1">
            {(['AM', 'PM'] as const).map((ap) => (
              <button
                key={ap}
                type="button"
                onClick={() => pickAmpm(ap)}
                className={`px-2 py-0.5 rounded-md text-[10px] font-bold transition-all ${
                  ampm === ap ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'
                }`}
              >
                {ap}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ================================================================
   Main component
================================================================ */

export default function CreateMeetingPanel({ isOpen, onClose, onSuccess, meetingToEdit, defaultDate, markedDates }: CreateMeetingPanelProps) {
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

  const isEditMode = !!meetingToEdit;
  const inputCls = 'w-full px-3.5 py-2.5 rounded-xl ring-1 ring-slate-200 bg-white text-sm text-slate-900 placeholder:text-slate-400 outline-none transition-shadow focus:ring-2 focus:ring-indigo-500';

  const miniNumCls = 'w-14 px-2 py-1.5 rounded-lg ring-1 ring-slate-200 bg-white text-sm font-bold text-slate-800 text-center outline-none focus:ring-2 focus:ring-indigo-500 transition-shadow tabular-nums';

  const dateMarks = useMemo(() => {
    const s = new Set<string>(markedDates ?? []);
    if (meetingToEdit?.meeting_date) {
      const iso = String(meetingToEdit.meeting_date).slice(0, 10);
      if (iso) s.add(iso);
    }
    return Array.from(s);
  }, [markedDates, meetingToEdit]);

  /* ═══════════════ FIX 1: populate ONLY once per record ═══════════════
     Old code: effect depended on the whole `meetingToEdit` object. Every
     parent re-render / refetch created a NEW object → effect re-ran →
     populateForEdit() → setStep(1) → user snapped back to step 1.
     Fix: depend on the record ID + a ref guard. Populate only fires when
     the panel opens or the user switches to a DIFFERENT meeting. */
  const lastLoadedIdRef = useRef<string | null>(null);
  const editingId: string | null = meetingToEdit?.id ?? null;

  /* ═══════════════ FIX 2: mirror `step` into a ref ═══════════════
     handleSubmit reads stepRef so it can never act on a stale closure.
     The ref is synced ONLY here — never set it manually in handleContinue,
     otherwise a mis-typed submit button could save on step 1. */
  const stepRef = useRef<1 | 2>(1);
  useEffect(() => { stepRef.current = step; }, [step]);

  /* ---------------- data loading ---------------- */

  async function fetchOfficers() {
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
      setOfficers([
        ...ias.map((o: any) => mapOfficer(o, 'IAS')),
        ...ips.map((o: any) => mapOfficer(o, 'IPS')),
        ...others.map((o: any) => mapOfficer(o, 'Other')),
      ]);
    } catch (error) {
      console.error('Failed to load directory:', error);
    } finally {
      setOfficerLoading(false);
    }
  }

  /* ---------------- lifecycle ---------------- */

  useEffect(() => {
    if (!isOpen) {
      lastLoadedIdRef.current = null; // reset so reopening repopulates fresh
      return;
    }
    if (editingId) {
      // Only populate when switching to a DIFFERENT meeting — never on re-render
      if (lastLoadedIdRef.current !== editingId) {
        populateForEdit(meetingToEdit);
        lastLoadedIdRef.current = editingId;
      }
    } else if (lastLoadedIdRef.current !== 'create') {
      resetForm();
      if (defaultDate && !isPastISODate(defaultDate)) {
        setFormData((prev) => ({ ...prev, meeting_date: defaultDate }));
      }
      lastLoadedIdRef.current = 'create';
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, editingId]);

  // Officers fetch is a SEPARATE effect so it can never re-trigger populate
  useEffect(() => {
    if (isOpen) fetchOfficers();
  }, [isOpen]);

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

  /* ---------------- edit / reset ---------------- */

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
    /* ═══════════════ FIX 3: robust datetime parsing ═══════════════
       Old code: rawDate.split(' ')[0] — for "2025-01-15T10:30:00.000Z"
       (no space) it returned the WHOLE string as the date.
       slice() works for every format PocketBase uses:
         "2025-01-15"               → date only
         "2025-01-15T10:30:00.000Z" → date + "10:30"
         "2025-01-15 10:30:00.000Z" → date + "10:30"                 */
    const rawDate: string = m.meeting_date || '';
    const formattedDate = rawDate ? rawDate.slice(0, 10) : '';
    const formattedTime = rawDate && rawDate.length > 10 ? rawDate.slice(11, 16) : '';

    let attendeesArr: string[] = [];
    if (m.attendees) {
      if (typeof m.attendees === 'object') {
        const arr = (m.attendees as any).attendees || Object.values(m.attendees);
        attendeesArr = Array.isArray(arr) ? arr.filter(Boolean).map(String) : [];
      } else if (typeof m.attendees === 'string') {
        attendeesArr = m.attendees.split(',').map((s: string) => s.trim()).filter(Boolean);
      }
    }

    setFormData({
      ...EMPTY_FORM,
      agenda: m.agenda || '',
      meeting_date: formattedDate,
      meeting_time: formattedTime,
      duration: String(m.duration ?? ''),
      location: m.location || '',
      status: m.status || '',
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
      priority: m.priority || '',
      meeting_type: m.meeting_type || '',
      meeting_place: m.meeting_place || '',
      status_flag: m.status_flag || '',
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
        id: m.officer_id || '',
        name: m.officer_name,
        designation: m.designation,
        type: (m.officer_type as 'IAS' | 'IPS' | 'Other') || 'Other',
        contact_number: m.contact_number,
        email: m.email,
        department: m.department,
        current_position: m.current_position,
        batch_year: m.batch_year,
        cadre: m.cadre,
        state: m.state,
      });
    } else {
      setSelectedOfficer(null);
    }
    setShowOfficerEdit(false);
    setShowMoreDetails(Boolean(m.meeting_type || m.status_flag || attendeesArr.length || m.meet_link || m.gcal_link || m.send_invite || m.sync_gcal || m.add_meet));
    setErrors({});
    setSubmitError(null);
    setStep(1);
    setOfficerSearch('');
    setTypeFilter('All');
  }

  function resetForm() {
    setFormData(EMPTY_FORM);
    setSelectedOfficer(null);
    setOfficers([]);
    setOfficerSearch('');
    setTypeFilter('All');
    setAttendeeList([]);
    setAttendeeInput('');
    setShowMoreDetails(false);
    setShowOfficerEdit(false);
    syncDurationUI('');
    setErrors({});
    setSubmitError(null);
    setStep(1);
  }

  /* ---------------- derived ---------------- */

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
  const tomorrowISO = toLocalISODate(new Date(Date.now() + 86400000));

  const customTotal =
    (parseInt(customHours, 10) || 0) * 60 + (parseInt(customMinutes, 10) || 0);

  /* ---------------- handlers ---------------- */

  const handleSelectOfficer = (officer: Officer) => {
    setSelectedOfficer(officer);
    setShowOfficerEdit(false);
    setFormData((prev) => ({
      ...prev,
      officer_name: officer.name || '',
      designation: officer.designation || '',
      officer_id: officer.id || '',
      officer_type: officer.type || '',
      contact_number: officer.contact_number || '',
      email: officer.email || '',
      department: officer.department || '',
      current_position: officer.current_position || '',
      batch_year: officer.batch_year || '',
      cadre: officer.cadre || '',
      state: officer.state || '',
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
      officer_name: '', officer_id: '', officer_type: '',
      designation: '', contact_number: '', email: '',
      department: '', current_position: '', batch_year: '',
      cadre: '', state: '',
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
      ...p,
      date: '',
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
    setCustomHours('');
    setCustomMinutes('');
    setFormData((prev) => ({ ...prev, duration: String(minutes) }));
    if (errors.duration) setErrors((p) => ({ ...p, duration: '' }));
  };

  const handleOpenCustom = () => {
    const n = Number(formData.duration);
    if (n > 0 && !PRESET_DURATIONS.includes(n)) {
      setCustomHours(String(Math.floor(n / 60)));
      setCustomMinutes(String(n % 60));
    } else {
      setCustomHours('');
      setCustomMinutes('');
    }
    setIsCustomMode(true);
  };

  const handleCustomDuration = (hours: string, minutes: string) => {
    setCustomHours(hours);
    setCustomMinutes(minutes);
    const h = parseInt(hours, 10) || 0;
    const m = parseInt(minutes, 10) || 0;
    const total = h * 60 + m;
    setFormData((prev) => ({ ...prev, duration: total > 0 ? String(total) : '' }));
    if (total > 0 && errors.duration) setErrors((p) => ({ ...p, duration: '' }));
  };

  const handleCustomDone = () => {
    if (customTotal <= 0) {
      setIsCustomMode(false);
      setCustomHours('');
      setCustomMinutes('');
      setFormData((prev) => ({ ...prev, duration: '' }));
      return;
    }
    setIsCustomMode(false);
  };

  const addAttendee = () => {
    const v = attendeeInput.trim();
    if (!v) return;
    if (!attendeeList.includes(v)) setAttendeeList((p) => [...p, v]);
    setAttendeeInput('');
  };

  const removeAttendee = (a: string) =>
    setAttendeeList((p) => p.filter((x) => x !== a));

  /* navigation — step 1 requires officer + agenda */
  const handleContinue = () => {
    const e: Record<string, string> = {};
    if (!formData.officer_name.trim()) e.officer = 'Please select who the meeting is with';
    if (!formData.agenda.trim()) e.agenda = 'Agenda is required';
    if (Object.keys(e).length) { setErrors(e); return; }
    setErrors({});
    setStep(2);
    scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  };

  /* ---------------- submit (with automations) ---------------- */

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (loading) return;

    /* ═══════════════ FIX 2 (hard lock) ═══════════════
       Saving is ONLY allowed from step 2. If a submit event somehow fires
       on step 1 (Enter key in an input, mis-typed button), treat it as
       "Continue" — it can NEVER save from step 1. This is why the edit
       mode was saving on Continue before: in edit mode every field is
       pre-filled, so validation passed and it saved immediately. */
    if (stepRef.current !== 2) {
      handleContinue();
      return;
    }

    const nextErrors: Record<string, string> = {};
    if (!formData.officer_name.trim()) nextErrors.officer = 'Please select who the meeting is with';
    if (!formData.agenda.trim()) nextErrors.agenda = 'Agenda is required';
    if (!formData.meeting_date) nextErrors.date = 'Please pick a date';
    if (!formData.meeting_time) nextErrors.time = 'Please pick a time';
    if (Object.keys(nextErrors).length) { setErrors(nextErrors); return; }

    setLoading(true);
    setSubmitError(null);

    try {
      const payload: Record<string, any> = { ...formData, attendees: attendeeList };
      if (!isEditMode) {
        const auth: any = (pb as any).authStore;
        payload.created_by = auth?.record?.id || auth?.model?.id || '';
      }

      const record = isEditMode
        ? await pb.collection('meetings').update(meetingToEdit.id, payload)
        : await pb.collection('meetings').create(payload);

      /* ── AUTOMATIONS: the toggles actually do things now ── */
      const wantsInvite = formData.send_invite && !!formData.email;
      const wantsMeet = formData.add_meet;
      const wantsCalendar = formData.sync_gcal;
      const needsGoogle = wantsInvite || wantsMeet || wantsCalendar;

      if (needsGoogle) {
        try {
          const res = await fetch('/api/google', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              meetingId: record.id,
              gcalEventId: record.gcal_event_id || '',
              existingMeetLink: record.meet_link || '',
              agenda: formData.agenda,
              date: formData.meeting_date,
              time: formData.meeting_time,
              duration: Number(formData.duration) || 30,
              location: formData.location,
              officerName: formData.officer_name,
              officerEmail: formData.email,
              includeMeet: wantsMeet,
              sendInvite: wantsInvite,
            }),
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || 'Automation failed');

          const patch: Record<string, any> = {};
          if (data.meetLink) patch.meet_link = data.meetLink;
          if (data.eventId) patch.gcal_event_id = data.eventId;
          if (data.htmlLink) patch.gcal_link = data.htmlLink;
          if (Object.keys(patch).length) {
            await pb.collection('meetings').update(record.id, patch);
          }
        } catch (err: any) {
          showToast(`Meeting saved, but automation failed: ${err.message}`, 'error');
          onSuccess();
          onClose();
          return;
        }
      }

      showToast(isEditMode ? 'Meeting updated' : 'Meeting created', 'success');
      onSuccess();
      onClose();
    } catch (err: any) {
      console.error('Save failed:', err);
      const pbError = err?.response?.data;
      const fieldMsg = pbError
        ? Object.entries(pbError)
            .map(([k, v]) => `${k}: ${(v as any)?.message || v}`)
            .join(' · ')
        : null;
      const msg = fieldMsg || err?.message || 'Something went wrong. Please try again.';
      setSubmitError(msg);
      showToast(msg, 'error');
    } finally {
      setLoading(false);
    }
  }

  /* ================================================================
     Render
  ================================================================ */

  if (!isOpen) return null;

  const st = typeStyle(selectedOfficer?.type);

  return (
    <>
      <div
        className="fixed inset-0 z-[60] bg-slate-900/40 backdrop-blur-[2px] animate-in fade-in duration-200"
        onClick={onClose}
      />

      <div className="fixed inset-y-0 right-0 z-[61] w-full sm:max-w-xl bg-white shadow-2xl flex flex-col animate-in slide-in-from-right duration-300">
        {/* header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-100 shrink-0">
          {step === 2 ? (
            <button
              type="button"
              onClick={() => setStep(1)}
              className="p-2 rounded-xl text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors shrink-0"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
          ) : (
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 text-white flex items-center justify-center shrink-0 shadow-md shadow-indigo-500/25">
              <Calendar className="w-4 h-4" />
            </div>
          )}
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-bold text-slate-900">
              {isEditMode ? 'Edit meeting' : 'Create meeting'}
            </h3>
            <p className="text-[11px] text-slate-400">
              {step === 1 ? 'Who & why' : 'When & where'}
            </p>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {[1, 2].map((s) => (
              <span
                key={s}
                className={`w-1.5 h-1.5 rounded-full transition-colors ${step >= s ? 'bg-indigo-500' : 'bg-slate-200'}`}
              />
            ))}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 flex flex-col min-h-0">
          <div ref={scrollRef} className="flex-1 overflow-y-auto p-5 space-y-7 nice-scroll">

            {/* ================= STEP 1 ================= */}
            {step === 1 && (
              <>
                {/* [1] who is this meeting with */}
                <section className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <StepBadge n={1} />
                      <p className="text-sm font-bold text-slate-900">Who is this meeting with?</p>
                    </div>
                    {selectedOfficer && !showOfficerEdit && (
                      <button
                        type="button"
                        onClick={() => setShowOfficerEdit(true)}
                        className="text-xs font-bold text-indigo-600 hover:text-indigo-700 transition-colors"
                      >
                        Edit details
                      </button>
                    )}
                  </div>

                  {!selectedOfficer || showOfficerEdit ? (
                    <div className="space-y-2.5">
                      <div className="flex items-center gap-2">
                        <div className="relative flex-1">
                          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                          <input
                            ref={searchRef}
                            value={officerSearch}
                            onChange={(e) => setOfficerSearch(e.target.value)}
                            /* ═══ FIX 5: Enter here must never submit the form ═══ */
                            onKeyDown={(e) => { if (e.key === 'Enter') e.preventDefault(); }}
                            placeholder="Search name, department, cadre…"
                            className={`${inputCls} pl-9`}
                          />
                        </div>
                        <div className="flex bg-slate-100 rounded-full p-1 shrink-0">
                          {(['All', 'IAS', 'IPS', 'Other'] as const).map((t) => (
                            <button
                              key={t}
                              type="button"
                              onClick={() => setTypeFilter(t)}
                              className={`px-2.5 py-1 rounded-full text-[10px] font-bold transition-all ${
                                typeFilter === t ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                              }`}
                            >
                              {t}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="max-h-64 overflow-y-auto rounded-2xl ring-1 ring-slate-200 divide-y divide-slate-100 nice-scroll">
                        {officerLoading ? (
                          <div className="flex items-center justify-center gap-2 py-10 text-xs text-slate-400">
                            <Loader2 className="w-4 h-4 animate-spin" /> Loading directory…
                          </div>
                        ) : filteredOfficers.length === 0 ? (
                          <div className="flex flex-col items-center gap-2 py-10 text-xs text-slate-400">
                            <span>No officers found</span>
                            <button
                              type="button"
                              onClick={fetchOfficers}
                              className="flex items-center gap-1.5 font-bold text-indigo-600 hover:text-indigo-700"
                            >
                              <RefreshCw className="w-3.5 h-3.5" /> Retry
                            </button>
                          </div>
                        ) : (
                          filteredOfficers.slice(0, 50).map((o) => {
                            const s = typeStyle(o.type);
                            return (
                              <button
                                key={o.id}
                                type="button"
                                onClick={() => handleSelectOfficer(o)}
                                className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-indigo-50/50 transition-colors text-left"
                              >
                                <div className={`w-9 h-9 rounded-xl bg-gradient-to-br ${s.gradient} text-white text-xs font-bold flex items-center justify-center shrink-0`}>
                                  {o.name?.slice(0, 2).toUpperCase() || '?'}
                                </div>
                                <div className="min-w-0 flex-1">
                                  <p className="text-sm font-semibold text-slate-800 truncate">{o.name}</p>
                                  <p className="text-[11px] text-slate-400 truncate">{o.designation || o.department || o.type}</p>
                                </div>
                                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ring-1 shrink-0 ${s.badge}`}>
                                  {o.type}
                                </span>
                              </button>
                            );
                          })
                        )}
                      </div>

                      {/* inline officer detail editor */}
                      {selectedOfficer && showOfficerEdit && (
                        <div className="rounded-2xl ring-1 ring-indigo-100 bg-indigo-50/40 p-3 space-y-2.5">
                          <div className="flex items-center justify-between">
                            <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wide">
                              Details saved with this meeting
                            </p>
                            <button
                              type="button"
                              onClick={() => setShowOfficerEdit(false)}
                              className="text-xs font-bold text-indigo-600 hover:text-indigo-700"
                            >
                              Done
                            </button>
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            {OFFICER_EDIT_FIELDS.map((f) => (
                              <div key={f.key} className={f.key === 'officer_name' ? 'col-span-2' : ''}>
                                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-1">
                                  {f.label}
                                </label>
                                <input
                                  type="text"
                                  value={(formData as any)[f.key] || ''}
                                  onChange={(e) => handleOfficerField(f.key, e.target.value)}
                                  className={inputCls}
                                />
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="rounded-2xl ring-1 ring-indigo-100 bg-gradient-to-br from-indigo-50/80 via-white to-white p-4">
                      <div className="flex items-center gap-3">
                        <div className={`w-11 h-11 rounded-2xl bg-gradient-to-br ${st.gradient} text-white text-sm font-bold flex items-center justify-center shrink-0 shadow-md`}>
                          {selectedOfficer.name?.slice(0, 2).toUpperCase() || '?'}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 min-w-0">
                            <p className="text-sm font-bold text-slate-900 truncate">{selectedOfficer.name}</p>
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ring-1 shrink-0 ${st.badge}`}>
                              {selectedOfficer.type}
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-500 truncate">
                            {selectedOfficer.designation || selectedOfficer.department || '—'}
                          </p>
                          <div className="flex items-center gap-3 mt-1 min-w-0">
                            {formData.contact_number && (
                              <span className="flex items-center gap-1 text-[11px] text-slate-400 shrink-0">
                                <Phone className="w-3 h-3" /> {formData.contact_number}
                              </span>
                            )}
                            {formData.email && (
                              <span className="flex items-center gap-1 text-[11px] text-slate-400 truncate">
                                <Mail className="w-3 h-3 shrink-0" /> {formData.email}
                              </span>
                            )}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={handleClearOfficer}
                          title="Choose someone else"
                          className="p-2 rounded-xl text-slate-300 hover:bg-rose-50 hover:text-rose-500 transition-colors shrink-0"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  )}
                  <FieldError message={errors.officer} />
                </section>

                {/* [2] agenda */}
                <section className="space-y-3">
                  <div className="flex items-center gap-2.5">
                    <StepBadge n={2} />
                    <p className="text-sm font-bold text-slate-900">What&apos;s the agenda?</p>
                  </div>
                  <textarea
                    value={formData.agenda}
                    onChange={(e) => {
                      setFormData((prev) => ({ ...prev, agenda: e.target.value }));
                      if (errors.agenda) setErrors((p) => ({ ...p, agenda: '' }));
                    }}
                    rows={3}
                    placeholder="e.g. Review of district development projects, fund allocation…"
                    className={`${inputCls} resize-none`}
                  />
                  <FieldError message={errors.agenda} />
                </section>

                {/* [3] more details (optional) */}
                <section className="space-y-3">
                  <button
                    type="button"
                    onClick={() => setShowMoreDetails((v) => !v)}
                    className="w-full flex items-center justify-between rounded-xl ring-1 ring-slate-200 bg-white px-3.5 py-2.5 hover:ring-slate-300 transition-all"
                  >
                    <span className="flex items-center gap-2.5">
                      <span className="w-8 h-8 rounded-xl bg-violet-50 text-violet-600 flex items-center justify-center">
                        <Sparkles className="w-4 h-4" />
                      </span>
                      <span className="text-sm font-bold text-slate-900">More details</span>
                      <span className="text-[10px] font-medium text-slate-400">(optional)</span>
                    </span>
                    <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${showMoreDetails ? 'rotate-180' : ''}`} />
                  </button>

                  {showMoreDetails && (
                    <div className="space-y-4 rounded-2xl ring-1 ring-slate-100 bg-slate-50/50 p-3.5">
                      {/* meeting type */}
                      <div className="space-y-2">
                        <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wide">Meeting type</p>
                        <div className="grid grid-cols-2 gap-2">
                          {MEETING_TYPES.map((t) => {
                            const selected = formData.meeting_type === t.value;
                            const Icon = t.icon;
                            return (
                              <button
                                key={t.value}
                                type="button"
                                onClick={() => setFormData((prev) => ({ ...prev, meeting_type: selected ? '' : t.value }))}
                                className={`flex items-center gap-2.5 p-3 rounded-xl ring-1 text-left transition-all ${
                                  selected ? 'ring-indigo-300 bg-indigo-50/60' : 'bg-white ring-slate-200 hover:ring-slate-300'
                                }`}
                              >
                                <Icon className={`w-4 h-4 shrink-0 ${selected ? 'text-indigo-600' : 'text-slate-400'}`} />
                                <span className="min-w-0">
                                  <span className={`block text-xs font-bold ${selected ? 'text-indigo-700' : 'text-slate-700'}`}>
                                    {t.value}
                                  </span>
                                  <span className="block text-[10px] text-slate-400 truncate">{t.hint}</span>
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* status flag */}
                      <div className="space-y-2">
                        <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wide">Status</p>
                        <div className="flex flex-wrap gap-1.5">
                          {STATUS_FLAGS.map((s) => {
                            const selected = formData.status_flag === s.value;
                            return (
                              <button
                                key={s.value}
                                type="button"
                                onClick={() => setFormData((prev) => ({ ...prev, status_flag: selected ? '' : s.value }))}
                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-bold ring-1 transition-all active:scale-95 ${
                                  selected
                                    ? 'bg-slate-900 text-white ring-slate-900'
                                    : 'bg-white text-slate-600 ring-slate-200 hover:ring-slate-300'
                                }`}
                              >
                                <span className={`w-1.5 h-1.5 rounded-full ${selected ? 'bg-white' : s.dot}`} />
                                {s.value}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* attendees */}
                      <div className="space-y-2">
                        <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wide">Attendees</p>
                        <div className="flex items-center gap-2">
                          <input
                            value={attendeeInput}
                            onChange={(e) => setAttendeeInput(e.target.value)}
                            /* ═══ FIX 5: Enter adds an attendee, never submits ═══ */
                            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addAttendee(); } }}
                            placeholder="name@example.com, press Enter to add"
                            className={inputCls}
                          />
                          <button
                            type="button"
                            onClick={addAttendee}
                            className="p-2.5 rounded-xl bg-indigo-600 text-white hover:bg-indigo-700 transition-colors shrink-0"
                          >
                            <Plus className="w-4 h-4" />
                          </button>
                        </div>
                        {attendeeList.length > 0 && (
                          <div className="flex flex-wrap gap-1.5">
                            {attendeeList.map((a) => (
                              <span
                                key={a}
                                className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-indigo-50 ring-1 ring-indigo-100 text-[11px] font-semibold text-indigo-700"
                              >
                                {a}
                                <button
                                  type="button"
                                  onClick={() => removeAttendee(a)}
                                  className="text-indigo-400 hover:text-rose-500 transition-colors"
                                >
                                  <X className="w-3 h-3" />
                                </button>
                              </span>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* meet link */}
                      <div className="space-y-2">
                        <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wide">Meeting link</p>
                        <input
                          value={formData.meet_link}
                          onChange={(e) => setFormData((prev) => ({ ...prev, meet_link: e.target.value }))}
                          placeholder="https://meet.google.com/…"
                          className={inputCls}
                        />
                      </div>

                      {/* automations */}
                      <div className="space-y-2">
                        <ToggleRow
                          icon={Mail}
                          title="Send invite"
                          description="Email a calendar invite to the officer"
                          checked={formData.send_invite}
                          onChange={(v) => setFormData((prev) => ({ ...prev, send_invite: v }))}
                        />
                        <ToggleRow
                          icon={Video}
                          title="Add Google Meet"
                          description="Generate and attach a Meet link"
                          checked={formData.add_meet}
                          onChange={(v) => setFormData((prev) => ({ ...prev, add_meet: v }))}
                        />
                        <ToggleRow
                          icon={RefreshCw}
                          title="Sync to Google Calendar"
                          description="Create / update the calendar event"
                          checked={formData.sync_gcal}
                          onChange={(v) => setFormData((prev) => ({ ...prev, sync_gcal: v }))}
                        />
                      </div>
                    </div>
                  )}
                </section>
              </>
            )}

            {/* ================= STEP 2 ================= */}
            {step === 2 && (
              <>
                {/* context summary */}
                <div className="flex items-center gap-2.5 rounded-xl bg-slate-50 ring-1 ring-slate-100 p-3">
                  <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${st.gradient} text-white text-[10px] font-bold flex items-center justify-center shrink-0`}>
                    {(formData.officer_name || '?').slice(0, 2).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-bold text-slate-800 truncate">{formData.officer_name}</p>
                    <p className="text-[11px] text-slate-400 truncate">{formData.agenda}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setStep(1)}
                    className="text-[11px] font-bold text-indigo-600 hover:text-indigo-700 shrink-0"
                  >
                    Edit
                  </button>
                </div>

                {/* when */}
                <section className="space-y-3">
                  <SectionLabel icon={Clock} text="When is it happening?" />
                  <WeekStrip
                    value={formData.meeting_date}
                    onChange={handleDateChange}
                    markedDates={dateMarks}
                  />
                  <div className="rounded-2xl ring-1 ring-slate-200 bg-white p-3 shadow-sm">
                    <div className="flex items-center gap-1.5 mb-2">
                      <Clock className="w-3.5 h-3.5 text-slate-400" />
                      <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wide">Time</p>
                      <div className="ml-auto flex items-center gap-1.5 min-w-0">
                        {formData.meeting_date && <SummaryPill>{prettyDate(formData.meeting_date)}</SummaryPill>}
                        {formData.meeting_time && <SummaryPill>{to12Hour(formData.meeting_time)}</SummaryPill>}
                      </div>
                    </div>
                    <TimeSlotPicker
                      value={formData.meeting_time}
                      onChange={handleTimeChange}
                      meetingDate={formData.meeting_date}
                    />
                  </div>
                  <FieldError message={errors.date} />
                  <FieldError message={errors.time} />
                </section>

                {/* duration */}
                <section className="space-y-3">
                  <SectionLabel icon={Activity} text="How long?" optional />
                  {isCustomMode ? (
                    <div className="flex items-center gap-2 rounded-xl ring-1 ring-indigo-200 bg-indigo-50/40 p-2.5">
                      <input
                        type="number"
                        min={0}
                        max={23}
                        inputMode="numeric"
                        value={customHours}
                        onChange={(e) => handleCustomDuration(clampInt(e.target.value, 23), customMinutes)}
                        placeholder="0"
                        className={miniNumCls}
                      />
                      <span className="text-xs font-bold text-slate-500">hr</span>
                      <input
                        type="number"
                        min={0}
                        max={59}
                        inputMode="numeric"
                        value={customMinutes}
                        onChange={(e) => handleCustomDuration(customHours, clampInt(e.target.value, 59))}
                        placeholder="0"
                        className={miniNumCls}
                      />
                      <span className="text-xs font-bold text-slate-500">min</span>
                      <div className="flex-1" />
                      <button
                        type="button"
                        onClick={handleCustomDone}
                        className="px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-bold hover:bg-indigo-700 transition-colors flex items-center gap-1"
                      >
                        <Check className="w-3.5 h-3.5" /> Done
                      </button>
                      <button
                        type="button"
                        onClick={() => { setIsCustomMode(false); setCustomHours(''); setCustomMinutes(''); }}
                        className="p-1.5 rounded-lg text-slate-400 hover:bg-white hover:text-rose-500 transition-colors"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {PRESET_DURATIONS.map((m) => {
                        const selected = Number(formData.duration) === m;
                        return (
                          <button
                            key={m}
                            type="button"
                            onClick={() => handlePresetDuration(m)}
                            className={`px-3 py-2 rounded-xl text-[11px] font-bold tabular-nums whitespace-nowrap transition-all active:scale-95 ${
                              selected
                                ? 'bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-md shadow-indigo-500/30'
                                : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:ring-indigo-300 hover:text-indigo-700'
                            }`}
                          >
                            {formatDuration(m)}
                          </button>
                        );
                      })}
                      <button
                        type="button"
                        onClick={handleOpenCustom}
                        className={`px-3 py-2 rounded-xl text-[11px] font-bold whitespace-nowrap transition-all active:scale-95 flex items-center gap-1 ${
                          Number(formData.duration) > 0 && !PRESET_DURATIONS.includes(Number(formData.duration))
                            ? 'bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-md shadow-indigo-500/30'
                            : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:ring-indigo-300 hover:text-indigo-700'
                        }`}
                      >
                        <Plus className="w-3 h-3" />
                        {Number(formData.duration) > 0 && !PRESET_DURATIONS.includes(Number(formData.duration))
                          ? formatDuration(Number(formData.duration))
                          : 'Custom'}
                      </button>
                    </div>
                  )}
                  <FieldError message={errors.duration} />
                </section>

                {/* where */}
                <section className="space-y-3">
                  <SectionLabel icon={MapPin} text="Where is it happening?" optional />
                  <div className="grid grid-cols-2 gap-2">
                    {PLACE_OPTIONS.map((p) => {
                      const selected = formData.meeting_place === p.value;
                      const Icon = p.icon;
                      return (
                        <button
                          key={p.value}
                          type="button"
                          onClick={() => setFormData((prev) => ({ ...prev, meeting_place: selected ? '' : p.value }))}
                          className={`flex items-center gap-2.5 p-3 rounded-xl ring-1 text-left transition-all ${
                            selected ? 'ring-indigo-300 bg-indigo-50/60' : 'bg-white ring-slate-200 hover:ring-slate-300'
                          }`}
                        >
                          <Icon className={`w-4 h-4 shrink-0 ${selected ? 'text-indigo-600' : 'text-slate-400'}`} />
                          <span className="min-w-0">
                            <span className={`block text-xs font-bold ${selected ? 'text-indigo-700' : 'text-slate-700'}`}>
                              {p.value}
                            </span>
                            <span className="block text-[10px] text-slate-400 truncate">{p.hint}</span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                  <input
                    value={formData.location}
                    onChange={(e) => setFormData((prev) => ({ ...prev, location: e.target.value }))}
                    placeholder="Venue, room or address…"
                    className={inputCls}
                  />
                </section>

                {/* priority */}
                <section className="space-y-3">
                  <SectionLabel icon={Flag} text="Priority" optional />
                  <div className="grid grid-cols-3 gap-2">
                    {PRIORITIES.map((p) => {
                      const selected = formData.priority === p.value;
                      const Icon = p.icon;
                      return (
                        <button
                          key={p.value}
                          type="button"
                          onClick={() => setFormData((prev) => ({ ...prev, priority: selected ? '' : p.value }))}
                          className={`flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-bold ring-1 transition-all active:scale-95 ${
                            selected
                              ? `${p.bg} ${p.text} ring-2 ${p.ring}`
                              : 'bg-white text-slate-500 ring-slate-200 hover:ring-slate-300'
                          }`}
                        >
                          <Icon className="w-3.5 h-3.5" /> {p.value}
                        </button>
                      );
                    })}
                  </div>
                </section>
              </>
            )}
          </div>

          {/* ═══════════════ FIX 4: footer buttons ═══════════════
              Step 1 → "Continue" is type="button" (CANNOT submit the form).
              Step 2 → the ONLY type="submit" button in the whole form.
              Combined with the stepRef hard lock in handleSubmit, it is now
              impossible to save while on step 1 — even in edit mode where
              every field is pre-filled. */}
          <div className="border-t border-slate-100 p-4 shrink-0 bg-white">
            {submitError && (
              <div className="mb-3 flex items-start gap-2 rounded-xl bg-rose-50 ring-1 ring-rose-200 p-3">
                <AlertCircle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
                <p className="text-xs text-rose-700 flex-1">{submitError}</p>
                <button
                  type="button"
                  onClick={() => setSubmitError(null)}
                  className="text-rose-400 hover:text-rose-600"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
            <div className="flex items-center gap-2.5">
              {step === 2 && (
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="px-4 py-3 rounded-xl ring-1 ring-slate-200 bg-white text-sm font-bold text-slate-600 hover:ring-slate-300 hover:text-slate-800 transition-all flex items-center gap-1.5 shrink-0 active:scale-[0.98]"
                >
                  <ChevronLeft className="w-4 h-4" /> Back
                </button>
              )}
              {step === 1 ? (
                <button
                  type="button"
                  onClick={handleContinue}
                  className="flex-1 py-3 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 text-white text-sm font-bold shadow-lg shadow-indigo-500/25 hover:shadow-indigo-500/40 hover:-translate-y-px transition-all flex items-center justify-center gap-2 active:scale-[0.98]"
                >
                  Continue <ChevronRight className="w-4 h-4" />
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 py-3 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 text-white text-sm font-bold shadow-lg shadow-indigo-500/25 hover:shadow-indigo-500/40 hover:-translate-y-px transition-all flex items-center justify-center gap-2 active:scale-[0.98] disabled:opacity-60 disabled:pointer-events-none"
                >
                  {loading ? (
                    <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</>
                  ) : (
                    <><Check className="w-4 h-4" /> {isEditMode ? 'Update meeting' : 'Create meeting'}</>
                  )}
                </button>
              )}
            </div>
          </div>
        </form>
      </div>
    </>
  );
}