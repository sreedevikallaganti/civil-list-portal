'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import {
  X, Calendar, Clock, MapPin, Trash2, Check, Search, ChevronDown,
  ChevronLeft, ChevronRight, Loader2, Users, Mail, Phone, User,
  Sparkles, ArrowLeft, AlertCircle, RefreshCw, Building2, Flag,
  Video, Globe, Minus, Plus, Zap, Activity, Feather, Sunrise, Sun, Moon
} from 'lucide-react';
import pb from '@/lib/pocketbase';

/* ================================================================
   Types
================================================================ */

interface CreateMeetingPanelProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  meetingToEdit?: any;
  /** Optional 'YYYY-MM-DD' — pre-fills the date when creating (e.g. calendar day click) */
  defaultDate?: string;
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
  { value: 'Low', icon: Feather, dot: 'bg-emerald-500', bg: 'bg-emerald-50', text: 'text-emerald-700', ring: 'ring-emerald-300', bar: 'from-emerald-400 to-teal-500' },
  { value: 'Medium', icon: Activity, dot: 'bg-amber-500', bg: 'bg-amber-50', text: 'text-amber-700', ring: 'ring-amber-300', bar: 'from-amber-400 to-orange-500' },
  { value: 'High', icon: Zap, dot: 'bg-rose-500', bg: 'bg-rose-50', text: 'text-rose-700', ring: 'ring-rose-300', bar: 'from-rose-400 to-red-500' },
];

const PLACE_OPTIONS = [
  { value: 'Office', icon: Building2, hint: 'At your office' },
  { value: 'Outside', icon: Globe, hint: 'External venue' },
];

const STATUS_FLAGS = [
  { value: 'Scheduled', dot: 'bg-blue-500' },
  { value: 'Completed', dot: 'bg-emerald-500' },
  { value: 'Cancelled', dot: 'bg-rose-500' },
  { value: 'Rescheduled', dot: 'bg-amber-500' },
];

const PRESET_DURATIONS = [15, 30, 45, 60, 90, 120, 180];

const TIME_PERIODS = [
  { label: 'Morning', icon: Sunrise, from: 7, to: 12 },
  { label: 'Afternoon', icon: Sun, from: 12, to: 17 },
  { label: 'Evening', icon: Moon, from: 17, to: 21 },
];

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
  agenda: '',
  meeting_date: '',
  meeting_time: '',
  duration: '30',
  location: '',
  status: 'Scheduled',
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
  priority: 'Medium',
  meeting_type: 'Internal',
  meeting_place: 'Office',
  status_flag: 'Scheduled',
  attendees: '',
  notes: '',
  follow_up_date: '',
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

const minutesToTime = (m: number) =>
  `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

const formatSlot = (m: number) => {
  const h = Math.floor(m / 60);
  const hr = h % 12 === 0 ? 12 : h % 12;
  return `${hr}:${String(m % 60).padStart(2, '0')}`;
};

const formatDuration = (m: number) => {
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const mm = m % 60;
  if (mm === 0) return `${h} hr`;
  return `${h}h ${mm}m`;
};

const typeStyle = (t?: string) => OFFICER_TYPE_STYLES[t || 'Other'] ?? OFFICER_TYPE_STYLES.Other;

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

function ToggleRow({ icon: Icon, title, description, checked, onChange }: {
  icon: any; title: string; description: string; checked: boolean; onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="w-full flex items-center justify-between gap-3 p-3 rounded-xl ring-1 ring-slate-200 hover:ring-slate-300 transition-all text-left"
    >
      <div className="flex items-center gap-3 min-w-0">
        <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 transition-colors ${checked ? 'bg-indigo-100 text-indigo-600' : 'bg-slate-100 text-slate-400'}`}>
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
   Premium pickers — calendar, time slots, duration
================================================================ */

function MiniCalendar({ value, onChange }: { value: string; onChange: (v: string) => void }) {
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

  const firstDay = new Date(y, m, 1).getDay(); // 0 = Sunday
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
    const d = new Date(y, m + delta, 1);
    setView({ y: d.getFullYear(), m: d.getMonth() });
  };

  const monthLabel = new Date(y, m, 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });

  return (
    <div className="rounded-xl ring-1 ring-slate-200 bg-white p-3 w-full sm:w-[252px] shrink-0">
      <div className="flex items-center justify-between mb-2">
        <button type="button" onClick={() => shift(-1)} className="w-7 h-7 rounded-lg hover:bg-slate-100 flex items-center justify-center text-slate-500 transition-colors">
          <ChevronLeft className="w-4 h-4" />
        </button>
        <p className="text-xs font-bold text-slate-800">{monthLabel}</p>
        <button type="button" onClick={() => shift(1)} className="w-7 h-7 rounded-lg hover:bg-slate-100 flex items-center justify-center text-slate-500 transition-colors">
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      <div className="grid grid-cols-7 mb-0.5">
        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
          <div key={i} className="text-center text-[10px] font-bold text-slate-400 py-1">{d}</div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-y-0.5">
        {cells.map((c) => {
          const selected = c.iso === value;
          const isToday = c.iso === todayISO;
          return (
            <button
              key={c.iso}
              type="button"
              onClick={() => onChange(c.iso)}
              className={`relative w-full h-8 rounded-full text-xs font-semibold flex items-center justify-center transition-all
                ${selected
                  ? 'bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-md shadow-indigo-500/30 scale-105'
                  : c.inMonth
                    ? 'text-slate-700 hover:bg-indigo-50 hover:text-indigo-700'
                    : 'text-slate-300 hover:text-slate-500'}`}
            >
              {c.day}
              {isToday && !selected && (
                <span className="absolute bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-indigo-500" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function TimeSlotPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!value || !listRef.current) return;
    const el = listRef.current.querySelector(`[data-slot="${value}"]`);
    el?.scrollIntoView({ block: 'nearest' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-3 min-w-0">
      <div ref={listRef} className="max-h-52 overflow-y-auto pr-1 space-y-3">
        {TIME_PERIODS.map((p) => {
          const slots: number[] = [];
          for (let h = p.from; h < p.to; h++) slots.push(h * 60, h * 60 + 30);
          const Icon = p.icon;
          return (
            <div key={p.label}>
              <div className="flex items-center gap-1.5 mb-1.5 text-[10px] font-bold uppercase tracking-widest text-slate-400">
                <Icon className="w-3 h-3" /> {p.label}
              </div>
              <div className="grid grid-cols-4 gap-1.5">
                {slots.map((m) => {
                  const t = minutesToTime(m);
                  const selected = value === t;
                  return (
                    <button
                      key={t}
                      data-slot={t}
                      type="button"
                      onClick={() => onChange(t)}
                      className={`py-1.5 rounded-lg text-xs font-bold tabular-nums transition-all
                        ${selected
                          ? 'bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-md shadow-indigo-500/30 scale-[1.04]'
                          : 'bg-slate-50 text-slate-600 ring-1 ring-slate-200/70 hover:ring-indigo-300 hover:text-indigo-700 hover:bg-indigo-50/50'}`}
                    >
                      {formatSlot(m)}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex items-center justify-between pt-2.5 border-t border-slate-100">
        <span className="text-[11px] font-medium text-slate-400">Need a different time?</span>
        <input
          type="time"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="px-2.5 py-1.5 rounded-lg ring-1 ring-slate-200 text-xs font-bold text-slate-700 bg-white outline-none focus:ring-2 focus:ring-indigo-500 transition-shadow"
        />
      </div>
    </div>
  );
}

function DurationControl({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const total = Math.max(1, Math.min(600, Number(value) || 30));
  const [hrDraft, setHrDraft] = useState(String(Math.floor(total / 60)));
  const [minDraft, setMinDraft] = useState(String(total % 60));
  const editingRef = useRef(false); // true while either field is focused

  // Sync the fields when the value changes from outside
  // (preset chips, +/− buttons, form reset, edit-mode populate)
  useEffect(() => {
    if (!editingRef.current) {
      setHrDraft(String(Math.floor(total / 60)));
      setMinDraft(String(total % 60));
    }
  }, [total]);

  const clampTotal = (n: number) => Math.max(1, Math.min(600, n));

  // Commit: sum hr + min, clamp 1–600, carry anything ≥ 60 min into hours
  const commit = () => {
    editingRef.current = false;
    const h = parseInt(hrDraft, 10) || 0;
    const m = parseInt(minDraft, 10) || 0;
    const t = clampTotal(h * 60 + m);
    setHrDraft(String(Math.floor(t / 60)));
    setMinDraft(String(t % 60));
    onChange(String(t));
  };

  // Live update while typing (end time + preview follow along)
  const liveUpdate = (hStr: string, mStr: string) => {
    const h = parseInt(hStr, 10);
    const m = parseInt(mStr, 10);
    const hh = isNaN(h) ? 0 : h;
    const mm = isNaN(m) ? 0 : m;
    const t = hh * 60 + mm;
    if (t >= 1) onChange(String(Math.min(600, t)));
  };

  const step = (delta: number) => {
    const next = clampTotal(total + delta);
    editingRef.current = false;
    setHrDraft(String(Math.floor(next / 60)));
    setMinDraft(String(next % 60));
    onChange(String(next));
  };

  // One editable field (reused for hr & min)
  const durationField = (
    draft: string,
    setDraft: (v: string) => void,
    unit: string,
    arrowDelta: number,
  ) => (
    <input
      type="text"
      inputMode="numeric"
      value={draft}
      onFocus={() => { editingRef.current = true; }}
      onChange={(e) => {
        const raw = e.target.value.replace(/[^0-9]/g, '').slice(0, 3); // digits only, max 3
        setDraft(raw);
        // live-update using the *other* field's current draft too
        liveUpdate(unit === 'hr' ? raw : hrDraft, unit === 'hr' ? minDraft : raw);
      }}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        if (e.key === 'ArrowUp') { e.preventDefault(); step(arrowDelta); }
        if (e.key === 'ArrowDown') { e.preventDefault(); step(-arrowDelta); }
      }}
      placeholder="0"
      className="w-14 text-center text-xl font-extrabold text-slate-900 tabular-nums tracking-tight bg-transparent outline-none border-b-2 border-slate-300 focus:border-indigo-500 transition-colors placeholder:text-slate-300"
    />
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between rounded-2xl bg-slate-50 ring-1 ring-slate-200/70 p-2">
        <button
          type="button"
          onClick={() => step(-15)}
          disabled={total <= 1}
          className="w-10 h-10 rounded-xl bg-white ring-1 ring-slate-200 text-slate-600 hover:ring-slate-400 hover:text-slate-900 flex items-center justify-center transition-all disabled:opacity-40 disabled:cursor-not-allowed active:scale-95 shadow-sm"
        >
          <Minus className="w-4 h-4" />
        </button>

        {/* Typeable HR : MIN fields */}
        <div className="flex-1 flex items-center justify-center gap-1 min-w-0 px-1">
          {durationField(hrDraft, setHrDraft, 'hr', 60)}
          <span className="text-xs font-bold text-slate-400 mt-1.5">hr</span>
          <span className="text-xl font-extrabold text-slate-300 mt-1 mx-0.5">:</span>
          {durationField(minDraft, setMinDraft, 'min', 15)}
          <span className="text-xs font-bold text-slate-400 mt-1.5">min</span>
        </div>

        <button
          type="button"
          onClick={() => step(15)}
          disabled={total >= 600}
          className="w-10 h-10 rounded-xl bg-white ring-1 ring-slate-200 text-slate-600 hover:ring-slate-400 hover:text-slate-900 flex items-center justify-center transition-all disabled:opacity-40 disabled:cursor-not-allowed active:scale-95 shadow-sm"
        >
          <Plus className="w-4 h-4" />
        </button>
      </div>

      {/* Human-readable total */}
      <p className="text-center text-[10px] font-bold uppercase tracking-widest text-slate-400">
        {formatDuration(total)} total
      </p>

      <div className="flex flex-wrap gap-1.5 justify-center">
        {PRESET_DURATIONS.map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => {
              editingRef.current = false;
              setHrDraft(String(Math.floor(d / 60)));
              setMinDraft(String(d % 60));
              onChange(String(d));
            }}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all
              ${total === d
                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-500/30'
                : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:ring-indigo-300 hover:text-indigo-700'}`}
          >
            {formatDuration(d)}
          </button>
        ))}
      </div>

      <p className="text-[11px] text-slate-400 text-center">
        Type hours &amp; minutes directly — or pick a preset
      </p>
    </div>
  );
}

/* ================================================================
   Main component
================================================================ */

export default function CreateMeetingPanel({ isOpen, onClose, onSuccess, meetingToEdit, defaultDate }: CreateMeetingPanelProps) {
  const [step, setStep] = useState<1 | 2>(1);
  const [loading, setLoading] = useState(false);
  const [officerLoading, setOfficerLoading] = useState(false);

  const [officers, setOfficers] = useState<Officer[]>([]);
  const [officerSearch, setOfficerSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<'All' | 'IAS' | 'IPS' | 'Other'>('All');
  const [selectedOfficer, setSelectedOfficer] = useState<Officer | null>(null);
  const [showOfficerEdit, setShowOfficerEdit] = useState(false);

  const [showAdvanced, setShowAdvanced] = useState(false);
  const [attendeeInput, setAttendeeInput] = useState('');
  const [attendeeList, setAttendeeList] = useState<string[]>([]);

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [formData, setFormData] = useState(EMPTY_FORM);

  const searchRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const isEditMode = !!meetingToEdit;
  const inputCls = 'w-full px-3.5 py-2.5 rounded-xl ring-1 ring-slate-200 bg-white text-sm text-slate-900 placeholder:text-slate-400 outline-none transition-shadow focus:ring-2 focus:ring-indigo-500';

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
    if (!isOpen) return;
    if (meetingToEdit) {
      populateForEdit(meetingToEdit);
    } else {
      resetForm();
      if (defaultDate) {
        setFormData((prev) => ({ ...prev, meeting_date: defaultDate, meeting_time: prev.meeting_time || suggestTime(defaultDate) }));
      }
    }
    fetchOfficers();
  }, [isOpen, meetingToEdit, defaultDate]);

  useEffect(() => {
    if (!isOpen) return;
    const t = setTimeout(() => searchRef.current?.focus(), 250);
    return () => clearTimeout(t);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  /* ---------------- edit / reset ---------------- */

  function populateForEdit(m: any) {
    const rawDate: string = m.meeting_date || '';
    let formattedDate = '';
    let formattedTime = '';
    if (rawDate) {
      formattedDate = rawDate.split(' ')[0] || rawDate.split('T')[0];
      const timePart = rawDate.split(' ')[1] || rawDate.split('T')[1];
      if (timePart) formattedTime = timePart.substring(0, 5);
    }
    const followUp = m.follow_up_date ? String(m.follow_up_date).split(' ')[0] : '';

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
      duration: String(m.duration ?? '30'),
      location: m.location || '',
      status: m.status || 'Scheduled',
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
      priority: m.priority || 'Medium',
      meeting_type: m.meeting_type || 'Internal',
      meeting_place: m.meeting_place || 'Office',
      status_flag: m.status_flag || 'Scheduled',
      notes: m.notes || '',
      follow_up_date: followUp,
      send_invite: Boolean(m.send_invite),
      sync_gcal: Boolean(m.sync_gcal),
      add_meet: Boolean(m.add_meet),
      created_by: m.created_by || '',
      meet_link: m.meet_link || '',
      gcal_event_id: m.gcal_event_id || '',
      gcal_link: m.gcal_link || '',
    });
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
    setShowAdvanced(Boolean(m.notes || attendeesArr.length || m.meet_link || m.follow_up_date || m.send_invite || m.sync_gcal));
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
    setShowAdvanced(false);
    setShowOfficerEdit(false);
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

  const meetingEndTime = useMemo(() => {
    if (!formData.meeting_time) return '';
    const [h, m] = formData.meeting_time.split(':').map(Number);
    const total = (h * 60 + m + (Number(formData.duration) || 30)) % (24 * 60);
    return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
  }, [formData.meeting_time, formData.duration]);

  const todayISO = toLocalISODate(new Date());
  const tomorrowISO = toLocalISODate(new Date(Date.now() + 86400000));

  const priorityInfo = PRIORITIES.find((p) => p.value === formData.priority) || PRIORITIES[1];

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

  const suggestTime = (dateStr: string) => {
    if (dateStr === todayISO) {
      const now = new Date();
      const total = now.getHours() * 60 + now.getMinutes();
      const next = Math.floor(total / 30) * 30 + 30;
      return `${String(Math.floor(next / 60) % 24).padStart(2, '0')}:${String(next % 60).padStart(2, '0')}`;
    }
    return '10:00';
  };

  const applyQuickDate = (offset: number) => {
    const d = new Date();
    d.setDate(d.getDate() + offset);
    const dateStr = toLocalISODate(d);
    setFormData((prev) => ({
      ...prev,
      meeting_date: dateStr,
      meeting_time: prev.meeting_time || suggestTime(dateStr),
    }));
    setErrors((p) => ({ ...p, date: '', time: '' }));
  };

  const handleDateChange = (value: string) => {
    setFormData((prev) => ({
      ...prev,
      meeting_date: value,
      meeting_time: value ? prev.meeting_time || suggestTime(value) : prev.meeting_time,
    }));
    setErrors((p) => ({ ...p, date: '' }));
  };

  const handleTimeChange = (value: string) => {
    setFormData((prev) => ({ ...prev, meeting_time: value }));
    setErrors((p) => ({ ...p, time: '' }));
  };

  const addAttendee = (name: string) => {
    const trimmed = name.trim().replace(/,$/, '');
    if (trimmed && !attendeeList.includes(trimmed)) {
      setAttendeeList((list) => [...list, trimmed]);
    }
    setAttendeeInput('');
  };

  const goToSchedule = () => {
    if (!selectedOfficer) {
      setErrors({ officer: 'Please select a participant to continue' });
      return;
    }
    setErrors({});
    setStep(2);
  };

  const handleSubmit = async () => {
    if (!selectedOfficer) {
      setStep(1);
      setErrors({ officer: 'Please select a participant to continue' });
      return;
    }
    const e: Record<string, string> = {};
    if (!formData.agenda.trim()) e.agenda = 'Add a short agenda for this meeting';
    if (!formData.meeting_date) e.date = 'Pick a date';
    if (!formData.meeting_time) e.time = 'Pick a time';
    setErrors(e);
    if (Object.keys(e).length > 0) return;

    try {
      setLoading(true);
      setSubmitError(null);

      const formattedDateTime = `${formData.meeting_date} ${formData.meeting_time}:00.000Z`;

      const meetingData: any = {
        agenda: formData.agenda,
        meeting_date: formattedDateTime,
        meeting_time: formData.meeting_time,
        duration: Number(formData.duration) || 30,
        location: formData.location || '',
        status: formData.status || 'Scheduled',
        officer_type: formData.officer_type || '',
        officer_name: formData.officer_name || '',
        officer_id: formData.officer_id || '',
        designation: formData.designation || '',
        department: formData.department || '',
        officer_category: formData.officer_category || '',
        contact_number: formData.contact_number || '',
        email: formData.email || '',
        address: formData.address || '',
        website: formData.website || '',
        cadre: formData.cadre || '',
        state: formData.state || '',
        batch_year: formData.batch_year || '',
        current_position: formData.current_position || '',
        previous_postings: formData.previous_postings || '',
        date_of_birth: formData.date_of_birth || '',
        priority: formData.priority,
        meeting_type: formData.meeting_type,
        meeting_place: formData.meeting_place,
        status_flag: formData.status_flag,
        attendees: { attendees: attendeeList },
        notes: formData.notes || '',
        follow_up_date: formData.follow_up_date ? `${formData.follow_up_date} 00:00:00.000Z` : null,
        send_invite: Boolean(formData.send_invite),
        sync_gcal: Boolean(formData.sync_gcal),
        add_meet: Boolean(formData.add_meet),
        created_by: formData.created_by || '',
        meet_link: formData.meet_link || '',
        gcal_event_id: formData.gcal_event_id || '',
        gcal_link: formData.gcal_link || '',
        documents: [],
        mom_documents: [],
      };

      if (isEditMode && meetingToEdit) {
        await pb.collection('meetings').update(meetingToEdit.id, meetingData);
      } else {
        await pb.collection('meetings').create(meetingData);
      }

      setLoading(false);
      onSuccess();
      onClose();
    } catch (error: any) {
      console.error('Meeting save failed:', error?.response?.data || error);
      setLoading(false);

      let msg = 'Something went wrong while saving. Please try again.';
      const fieldErrors = error?.response?.data?.data;
      if (fieldErrors && typeof fieldErrors === 'object') {
        msg = 'Could not save — ' + Object.entries(fieldErrors).map(([k, v]: any) => `${k}: ${v?.message || v}`).join(' · ');
      } else if (error?.response?.data?.message) {
        msg = error.response.data.message;
      } else if (error?.message) {
        msg = error.message;
      }
      setSubmitError(msg);
      scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const handleDelete = async () => {
    if (!meetingToEdit) return;
    if (!window.confirm('Delete this meeting permanently?')) return;
    try {
      setLoading(true);
      await pb.collection('meetings').delete(meetingToEdit.id);
      setLoading(false);
      onSuccess();
      onClose();
    } catch {
      setLoading(false);
      setSubmitError('Failed to delete the meeting. Please try again.');
    }
  };

  if (!isOpen) return null;

  /* ================================================================
     Render — Step 1: Who
  ================================================================ */

  const renderStep1 = () => (
    <div className="p-6 space-y-5 animate-in fade-in slide-in-from-right-4 duration-300">
      <div>
        <div className="flex items-center gap-2.5">
          <span className="w-7 h-7 rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 text-white text-xs font-bold flex items-center justify-center shadow-md shadow-indigo-500/30">1</span>
          <h3 className="text-base font-bold text-slate-900">Who is the meeting with?</h3>
        </div>
        <p className="text-xs text-slate-500 mt-1 ml-9">Search the directory — their details auto-fill</p>
      </div>

      <FieldError message={errors.officer} />

      {!selectedOfficer ? (
        <div className="space-y-3">
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
            <input
              ref={searchRef}
              value={officerSearch}
              onChange={(e) => setOfficerSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && filteredOfficers.length > 0) {
                  e.preventDefault();
                  handleSelectOfficer(filteredOfficers[0]);
                }
              }}
              placeholder="Search by name, designation, department…"
              className="w-full pl-10 pr-10 py-3 rounded-xl ring-1 ring-slate-200 bg-white text-sm outline-none focus:ring-2 focus:ring-indigo-500 transition-shadow"
            />
            {officerSearch && (
              <button type="button" onClick={() => setOfficerSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600">
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          <div className="flex items-center gap-1.5 flex-wrap">
            {(['All', 'IAS', 'IPS', 'Other'] as const).map((t) => {
              const count = t === 'All' ? officers.length : officers.filter((o) => o.type === t).length;
              const active = typeFilter === t;
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTypeFilter(t)}
                  className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${active ? 'bg-slate-900 text-white shadow' : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:ring-slate-400'}`}
                >
                  {t === 'Other' ? 'Contacts' : t}
                  <span className="ml-1.5 text-slate-400">{count}</span>
                </button>
              );
            })}
          </div>

          <div className="rounded-2xl ring-1 ring-slate-200 bg-white overflow-hidden">
            <div className="max-h-[46vh] overflow-y-auto divide-y divide-slate-100/80">
              {officerLoading ? (
                <div className="p-8 flex flex-col items-center gap-2 text-slate-400">
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <p className="text-xs">Loading directory…</p>
                </div>
              ) : filteredOfficers.length === 0 ? (
                <div className="p-8 text-center">
                  <User className="w-6 h-6 mx-auto text-slate-300 mb-2" />
                  <p className="text-sm text-slate-500 font-medium">No matches found</p>
                  <p className="text-xs text-slate-400 mt-0.5">Try a different name or category</p>
                </div>
              ) : (
                filteredOfficers.slice(0, 60).map((officer) => (
                  <button
                    key={officer.id}
                    type="button"
                    onClick={() => handleSelectOfficer(officer)}
                    className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-indigo-50/70 transition-colors group"
                  >
                    <div className={`w-10 h-10 rounded-full bg-gradient-to-br ${typeStyle(officer.type).gradient} text-white text-sm font-bold flex items-center justify-center shrink-0`}>
                      {officer.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold text-slate-900 truncate group-hover:text-indigo-700">{officer.name}</p>
                        <span className={`px-1.5 py-0.5 rounded-md text-[10px] font-bold ring-1 shrink-0 ${typeStyle(officer.type).badge}`}>{officer.type}</span>
                      </div>
                      <p className="text-xs text-slate-500 truncate mt-0.5">{officer.designation || '—'}</p>
                    </div>
                    <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-indigo-500 group-hover:translate-x-0.5 transition-all shrink-0" />
                  </button>
                ))
              )}
            </div>
            {filteredOfficers.length > 60 && (
              <div className="px-4 py-2 bg-slate-50 text-[11px] text-slate-400 border-t border-slate-100">
                Showing 60 of {filteredOfficers.length} — refine your search to see more
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-4 animate-in fade-in zoom-in-95 duration-200">
          <div className="rounded-2xl ring-1 ring-indigo-100 bg-gradient-to-br from-indigo-50/80 via-white to-white p-4 shadow-sm">
            <div className="flex items-start gap-3">
              <div className={`w-12 h-12 rounded-2xl bg-gradient-to-br ${typeStyle(selectedOfficer.type).gradient} text-white text-base font-bold flex items-center justify-center shrink-0 shadow-md`}>
                {formData.officer_name?.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-bold text-slate-900 truncate">{formData.officer_name}</p>
                  <span className={`px-1.5 py-0.5 rounded-md text-[10px] font-bold ring-1 shrink-0 ${typeStyle(selectedOfficer.type).badge}`}>{selectedOfficer.type}</span>
                </div>
                <p className="text-xs text-slate-500 mt-0.5 truncate">{formData.designation || selectedOfficer.current_position || '—'}</p>
                <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-[11px] text-slate-500">
                  {formData.contact_number && (
                    <span className="inline-flex items-center gap-1"><Phone className="w-3 h-3" />{formData.contact_number}</span>
                  )}
                  {formData.email && (
                    <span className="inline-flex items-center gap-1 truncate"><Mail className="w-3 h-3" />{formData.email}</span>
                  )}
                  {formData.department && (
                    <span className="inline-flex items-center gap-1"><Building2 className="w-3 h-3" />{formData.department}</span>
                  )}
                </div>
              </div>
              <div className="flex flex-col gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={handleClearOfficer}
                  className="px-2.5 py-1.5 rounded-lg text-[11px] font-semibold text-indigo-600 bg-white ring-1 ring-indigo-200 hover:bg-indigo-50 transition-colors inline-flex items-center gap-1"
                >
                  <RefreshCw className="w-3 h-3" /> Change
                </button>
                <button
                  type="button"
                  onClick={() => setShowOfficerEdit((v) => !v)}
                  className="px-2.5 py-1.5 rounded-lg text-[11px] font-semibold text-slate-500 hover:bg-white transition-colors"
                >
                  {showOfficerEdit ? 'Hide details' : 'Edit details'}
                </button>
              </div>
            </div>

            {showOfficerEdit && (
              <div className="grid grid-cols-2 gap-3 mt-4 pt-4 border-t border-indigo-100/60 animate-in fade-in duration-200">
                {OFFICER_EDIT_FIELDS.map((f) => (
                  <div key={f.key}>
                    <label className="block text-[10px] font-bold uppercase tracking-wide text-slate-400 mb-1">{f.label}</label>
                    <input
                      value={(formData as any)[f.key] || ''}
                      onChange={(e) => setFormData((prev) => ({ ...prev, [f.key]: e.target.value }))}
                      className="w-full px-2.5 py-1.5 rounded-lg ring-1 ring-slate-200 text-xs outline-none focus:ring-2 focus:ring-indigo-500 transition-shadow"
                    />
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 text-[11px] text-indigo-600/80 px-1">
            <Sparkles className="w-3.5 h-3.5" />
            Contact details are attached automatically — no extra typing needed
          </div>
        </div>
      )}
    </div>
  );

  /* ================================================================
     Render — Step 2: When / Where / What
  ================================================================ */

  const renderStep2 = () => (
    <div className="p-6 space-y-5 animate-in fade-in slide-in-from-right-4 duration-300">
      <div>
        <div className="flex items-center gap-2.5">
          <span className="w-7 h-7 rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 text-white text-xs font-bold flex items-center justify-center shadow-md shadow-indigo-500/30">2</span>
          <h3 className="text-base font-bold text-slate-900">Schedule the meeting</h3>
        </div>
        <p className="text-xs text-slate-500 mt-1 ml-9">Just the essentials — everything else is optional</p>
      </div>

      {/* Agenda */}
      <div>
        <label className="block text-sm font-semibold text-slate-800 mb-1.5">
          Agenda <span className="text-rose-500">*</span>
        </label>
        <input
          value={formData.agenda}
          onChange={(e) => {
            setFormData((p) => ({ ...p, agenda: e.target.value }));
            if (errors.agenda) setErrors((p) => ({ ...p, agenda: '' }));
          }}
          placeholder="e.g. Quarterly infrastructure review"
          className={`${inputCls} font-medium`}
        />
        <FieldError message={errors.agenda} />
      </div>

      {/* When — calendar + time slots */}
      <div className="rounded-2xl ring-1 ring-slate-200 bg-white overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-400">
            <Calendar className="w-3.5 h-3.5" /> When
          </div>
          <div className="flex gap-1.5">
            {[
              { label: 'Today', offset: 0, match: todayISO },
              { label: 'Tomorrow', offset: 1, match: tomorrowISO },
              { label: 'Next week', offset: 7, match: '' },
            ].map((q) => (
              <button
                key={q.label}
                type="button"
                onClick={() => applyQuickDate(q.offset)}
                className={`px-2.5 py-1 rounded-full text-[11px] font-bold transition-all ${
                  q.match && formData.meeting_date === q.match
                    ? 'bg-indigo-600 text-white shadow-md shadow-indigo-500/30'
                    : 'text-indigo-600 bg-indigo-50 hover:bg-indigo-100'
                }`}
              >
                {q.label}
              </button>
            ))}
          </div>
        </div>

        <div className="p-4 grid grid-cols-1 sm:grid-cols-[252px_1fr] gap-4">
          <MiniCalendar value={formData.meeting_date} onChange={handleDateChange} />

          <div className="min-w-0">
            <div className="flex items-center gap-2.5 mb-3">
              <div className="w-9 h-9 rounded-xl bg-indigo-50 flex items-center justify-center shrink-0">
                <Clock className="w-4 h-4 text-indigo-600" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-bold text-slate-900 tabular-nums leading-tight">
                  {formData.meeting_time
                    ? `${to12Hour(formData.meeting_time)}${meetingEndTime ? ` – ${to12Hour(meetingEndTime)}` : ''}`
                    : 'Select a time'}
                </p>
                <p className="text-[10px] text-slate-400 font-medium mt-0.5">{prettyDate(formData.meeting_date)}</p>
              </div>
            </div>
            <TimeSlotPicker value={formData.meeting_time} onChange={handleTimeChange} />
          </div>
        </div>

        {(errors.date || errors.time) && (
          <div className="px-4 pb-3">
            <FieldError message={[errors.date, errors.time].filter(Boolean).join(' · ')} />
          </div>
        )}
      </div>

      {/* Duration */}
      <div className="rounded-2xl ring-1 ring-slate-200 bg-white overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-100 text-xs font-bold uppercase tracking-wider text-slate-400">
          <Clock className="w-3.5 h-3.5" /> Duration
        </div>
        <div className="p-4 space-y-3">
          <DurationControl
            value={formData.duration}
            onChange={(v) => setFormData((p) => ({ ...p, duration: v }))}
          />
          {formData.meeting_time && (
            <p className="text-[11px] text-slate-400 text-center">
              Meeting ends at <span className="font-bold text-slate-600">{to12Hour(meetingEndTime)}</span>
            </p>
          )}
        </div>
      </div>

      {/* Where */}
      <div className="rounded-2xl ring-1 ring-slate-200 bg-white overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-100 text-xs font-bold uppercase tracking-wider text-slate-400">
          <MapPin className="w-3.5 h-3.5" /> Where
        </div>
        <div className="p-4 space-y-3.5">
          <div className="relative">
            <MapPin className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
            <input
              value={formData.location}
              onChange={(e) => setFormData((p) => ({ ...p, location: e.target.value }))}
              placeholder="e.g. Conference Room A, Secretariat"
              className={`${inputCls} pl-10`}
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            {PLACE_OPTIONS.map((o) => {
              const Icon = o.icon;
              const selected = formData.meeting_place === o.value;
              return (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => setFormData((p) => ({ ...p, meeting_place: o.value }))}
                  className={`flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl ring-1 transition-all text-left ${
                    selected
                      ? 'bg-indigo-600 text-white ring-indigo-600 shadow-md shadow-indigo-500/25'
                      : 'bg-white text-slate-700 ring-slate-200 hover:ring-indigo-300'
                  }`}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  <span className="min-w-0">
                    <span className="block text-xs font-bold">{o.value}</span>
                    <span className={`block text-[10px] ${selected ? 'text-indigo-100' : 'text-slate-400'}`}>{o.hint}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Priority */}
      <div className="rounded-2xl ring-1 ring-slate-200 bg-white overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-100 text-xs font-bold uppercase tracking-wider text-slate-400">
          <Flag className="w-3.5 h-3.5" /> Priority
        </div>
        <div className="p-4 grid grid-cols-3 gap-2">
          {PRIORITIES.map((p) => {
            const Icon = p.icon;
            const selected = formData.priority === p.value;
            return (
              <button
                key={p.value}
                type="button"
                onClick={() => setFormData((f) => ({ ...f, priority: p.value }))}
                className={`flex flex-col items-center gap-1.5 py-3 rounded-xl ring-1 transition-all ${
                  selected ? `${p.bg} ${p.ring} shadow-sm` : 'bg-white ring-slate-200 hover:ring-slate-300'
                }`}
              >
                <Icon className={`w-[18px] h-[18px] ${selected ? p.text : 'text-slate-400'}`} />
                <span className={`text-xs font-bold ${selected ? p.text : 'text-slate-600'}`}>{p.value}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Live preview */}
      <div className="rounded-2xl ring-1 ring-slate-200 bg-white overflow-hidden">
        <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-100 flex items-center gap-2">
          <Calendar className="w-3.5 h-3.5 text-slate-400" />
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Preview</span>
        </div>
        <div className="p-4 flex gap-3.5">
          <div className={`w-1.5 rounded-full bg-gradient-to-b ${priorityInfo.bar} shrink-0`} />
          <div className="flex-1 min-w-0 space-y-1.5">
            <p className="text-sm font-bold text-slate-900 truncate">{formData.agenda || 'Untitled meeting'}</p>
            <div className="flex items-center gap-1.5 text-xs text-slate-600">
              <Clock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <span className="truncate">
                {prettyDate(formData.meeting_date)}
                {formData.meeting_time && ` · ${to12Hour(formData.meeting_time)} – ${to12Hour(meetingEndTime)}`}
              </span>
            </div>
            {formData.location && (
              <div className="flex items-center gap-1.5 text-xs text-slate-600">
                <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <span className="truncate">{formData.location}</span>
              </div>
            )}
            <div className="flex items-center gap-1.5 text-xs text-slate-600">
              <User className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <span className="truncate">{formData.officer_name || '—'}</span>
              {selectedOfficer && (
                <span className={`px-1.5 py-0.5 rounded-md text-[10px] font-bold ring-1 shrink-0 ${typeStyle(selectedOfficer.type).badge}`}>{selectedOfficer.type}</span>
              )}
            </div>
          </div>
          <div className="shrink-0 self-start">
            <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-[10px] font-bold ring-1 ${priorityInfo.bg} ${priorityInfo.text} ${priorityInfo.ring}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${priorityInfo.dot}`} />
              {formData.priority}
            </span>
          </div>
        </div>
      </div>

      {/* Advanced / optional */}
      <div className="rounded-2xl ring-1 ring-slate-200 overflow-hidden bg-white">
        <button
          type="button"
          onClick={() => setShowAdvanced((v) => !v)}
          className="w-full flex items-center justify-between px-4 py-3.5 hover:bg-slate-50 transition-colors"
        >
          <span className="text-sm font-semibold text-slate-700">More options</span>
          <span className="text-xs text-slate-400">
            {showAdvanced ? 'Hide' : 'Attendees, notes, invites…'}
            <ChevronDown className={`w-4 h-4 inline ml-1.5 -mt-0.5 transition-transform ${showAdvanced ? 'rotate-180' : ''}`} />
          </span>
        </button>

        {showAdvanced && (
          <div className="px-4 pb-4 pt-4 space-y-4 border-t border-slate-100 animate-in fade-in slide-in-from-top-1 duration-200">
            {/* Attendees — tag input */}
            <div>
              <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 mb-1.5">
                <Users className="w-3.5 h-3.5 text-slate-400" /> Attendees
              </label>
              <div className="rounded-xl ring-1 ring-slate-200 focus-within:ring-2 focus-within:ring-indigo-500 p-2 flex flex-wrap gap-1.5 min-h-[42px] bg-white transition-shadow">
                {attendeeList.map((a) => (
                  <span key={a} className="inline-flex items-center gap-1 px-2 py-1 bg-indigo-50 text-indigo-700 rounded-lg text-xs font-medium">
                    {a}
                    <button
                      type="button"
                      onClick={() => setAttendeeList((list) => list.filter((x) => x !== a))}
                      className="text-indigo-400 hover:text-indigo-700"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
                <input
                  value={attendeeInput}
                  onChange={(e) => setAttendeeInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ',') {
                      e.preventDefault();
                      addAttendee(attendeeInput);
                    } else if (e.key === 'Backspace' && !attendeeInput && attendeeList.length) {
                      setAttendeeList((list) => list.slice(0, -1));
                    }
                  }}
                  onBlur={() => attendeeInput && addAttendee(attendeeInput)}
                  placeholder={attendeeList.length ? '' : 'Type a name and press Enter…'}
                  className="flex-1 min-w-[120px] outline-none text-sm px-1 bg-transparent"
                />
              </div>
            </div>

            {/* Notes */}
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">Notes</label>
              <textarea
                value={formData.notes}
                onChange={(e) => setFormData((p) => ({ ...p, notes: e.target.value }))}
                rows={2}
                placeholder="Anything worth remembering…"
                className="w-full px-3.5 py-2.5 rounded-xl ring-1 ring-slate-200 text-sm outline-none focus:ring-2 focus:ring-indigo-500 resize-none transition-shadow"
              />
            </div>

            {/* Meeting type */}
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">Meeting type</label>
              <div className="flex gap-1.5">
                {['Internal', 'External'].map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setFormData((p) => ({ ...p, meeting_type: t }))}
                    className={`flex-1 py-2 rounded-xl text-xs font-semibold transition-all ring-1 ${
                      formData.meeting_type === t
                        ? 'bg-indigo-600 text-white ring-indigo-600 shadow-sm'
                        : 'bg-white text-slate-600 ring-slate-200 hover:ring-slate-400'
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>

            {/* Status */}
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">Status</label>
              <div className="flex gap-1.5 flex-wrap">
                {STATUS_FLAGS.map((s) => (
                  <button
                    key={s.value}
                    type="button"
                    onClick={() => setFormData((p) => ({ ...p, status_flag: s.value }))}
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold transition-all ring-1 ${
                      formData.status_flag === s.value
                        ? 'bg-slate-900 text-white ring-slate-900'
                        : 'bg-white text-slate-600 ring-slate-200 hover:ring-slate-400'
                    }`}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
                    {s.value}
                  </button>
                ))}
              </div>
            </div>

            {/* Follow-up + Meet link */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 mb-1.5">
                  <Calendar className="w-3.5 h-3.5 text-slate-400" /> Follow-up date
                </label>
                <input
                  type="date"
                  value={formData.follow_up_date}
                  onChange={(e) => setFormData((p) => ({ ...p, follow_up_date: e.target.value }))}
                  className={inputCls}
                />
              </div>
              <div>
                <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 mb-1.5">
                  <Video className="w-3.5 h-3.5 text-slate-400" /> Meet link
                </label>
                <input
                  value={formData.meet_link}
                  onChange={(e) => setFormData((p) => ({ ...p, meet_link: e.target.value }))}
                  placeholder="https://meet.google.com/…"
                  className={inputCls}
                />
              </div>
            </div>

            {/* Toggles */}
            <div className="space-y-2">
              <ToggleRow
                icon={Mail}
                title="Send email invite"
                description="Notify participants by email"
                checked={formData.send_invite}
                onChange={(v) => setFormData((p) => ({ ...p, send_invite: v }))}
              />
              <ToggleRow
                icon={Calendar}
                title="Sync with Google Calendar"
                description="Add this meeting to your calendar"
                checked={formData.sync_gcal}
                onChange={(v) => setFormData((p) => ({ ...p, sync_gcal: v }))}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );

  /* ================================================================
     Render — shell
  ================================================================ */

  return (
    <>
      <div className="fixed inset-0 bg-slate-950/40 backdrop-blur-sm z-40 animate-in fade-in duration-200" onClick={onClose} />

      <div className="fixed inset-y-0 right-0 w-full max-w-2xl bg-white shadow-2xl z-50 flex flex-col animate-in slide-in-from-right duration-300">
        {/* Header with gradient progress bar */}
        <div className="relative px-6 pt-5 pb-4">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-lg shadow-indigo-500/25">
                <Calendar className="w-5 h-5 text-white" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-slate-900 tracking-tight">{isEditMode ? 'Edit Meeting' : 'New Meeting'}</h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  {step === 1 ? 'Step 1 of 2 — pick who you\u2019re meeting' : 'Step 2 of 2 — set the when & where'}
                </p>
              </div>
            </div>
            <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="absolute bottom-0 left-0 right-0 h-[3px] bg-slate-100">
            <div
              className="h-full bg-gradient-to-r from-indigo-500 via-violet-500 to-fuchsia-500 transition-all duration-500 ease-out"
              style={{ width: step === 1 ? '50%' : '100%' }}
            />
          </div>
        </div>

        {/* Body */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto">
          {submitError && (
            <div className="mx-6 mt-5 flex items-start gap-2.5 p-3.5 rounded-xl bg-rose-50 ring-1 ring-rose-200 animate-in fade-in duration-200">
              <AlertCircle className="w-4 h-4 mt-0.5 text-rose-600 shrink-0" />
              <p className="text-xs leading-relaxed text-rose-700">{submitError}</p>
            </div>
          )}
          {step === 1 ? renderStep1() : renderStep2()}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-100 bg-white">
          <div className="min-w-0">
            {isEditMode ? (
              <button
                onClick={handleDelete}
                disabled={loading}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold text-rose-600 hover:bg-rose-50 transition-colors disabled:opacity-50"
              >
                <Trash2 className="w-3.5 h-3.5" /> Delete meeting
              </button>
            ) : (
              <p className="text-[11px] text-slate-400 hidden sm:flex items-center gap-1.5 pl-1">
                <span className="px-1.5 py-0.5 rounded border border-slate-200 text-[10px] font-semibold">Esc</span>
                to close
              </p>
            )}
          </div>

          <div className="flex items-center gap-2">
            {step === 2 && (
              <button
                onClick={() => setStep(1)}
                className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-semibold text-slate-600 hover:bg-slate-100 transition-colors"
              >
                <ArrowLeft className="w-4 h-4" /> Back
              </button>
            )}
            {step === 1 ? (
              <button
                onClick={goToSchedule}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold text-white bg-gradient-to-r from-indigo-600 to-violet-600 shadow-lg shadow-indigo-500/25 hover:shadow-indigo-500/40 hover:brightness-110 active:scale-[0.98] transition-all"
              >
                Continue <ChevronRight className="w-4 h-4" />
              </button>
            ) : (
              <button
                onClick={handleSubmit}
                disabled={loading}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold text-white bg-gradient-to-r from-indigo-600 to-violet-600 shadow-lg shadow-indigo-500/25 hover:shadow-indigo-500/40 hover:brightness-110 active:scale-[0.98] transition-all disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                {loading ? 'Saving…' : isEditMode ? 'Save changes' : 'Create meeting'}
              </button>
            )}
          </div>
        </div>
      </div>
    </>
  );
}