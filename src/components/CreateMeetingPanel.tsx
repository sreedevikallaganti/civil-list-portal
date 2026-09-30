'use client';

/* ================================================================
   CreateMeetingPanel — v22
   NEW (v22) — "met before" reminder:
     (1) City field in the Place section (suggestions for known cities;
         auto-filled from the address when it names one).
     (2) While creating a meeting in another city, a hint shows how many
         people the MD has met there before. After saving, the page
         shows a popup with those people (see onSavedMeeting).
     (3) duplicateFrom.__prefill lets callers pre-set fields (used by the
         popup's Schedule button).
   v21:
     (1) Repeat feature REMOVED completely (RepeatPicker, series
         creation, "Create N meetings" button label). Every save now
         creates / updates exactly one meeting.
     (2) duplicateFrom kept: opens a NEW meeting pre-filled from an
         existing one (date cleared so a new slot is picked) — this is
         the simple way to set up the "same meeting again".
   v19 — slot-conflict protection:
     (1) 24-hour clock everywhere (00:00–23:59), no AM/PM — works for
         India, Dubai and other regions.
     (2) Busy-aware time picker: quick-slot chips / hour-minute options
         that fall inside an existing meeting are striped + disabled,
         with a tooltip naming that meeting.
     (3) Duration chips that would run into the next meeting disable
         themselves ("Runs into 'X' at 11:45").
     (5) Conflict card with one-click "nearest free slot" suggestions.
     (6) Soft warning when the same participant already has a meeting
         that day.
     (7) Hard block on save + friendly handling of the PocketBase
         server-side guard (pb_hooks/meetings.pb.js).
   v18:
     (1) Automations call /api/google (Calendar + Meet + officer email)
         and /api/invite (email to additional officers / attendees).
     (2) Request bodies use the exact field names those routes read.
     (3) Google runs first, so the invite email carries the Meet link.
         Returned eventId / htmlLink / meetLink are saved back to the
         record, so editing a meeting updates the same calendar event.
     (4) Failures are shown as a red toast instead of being swallowed.
     (5) Additional officers' emails are kept in `attendees` on save.
     (6) pb.files.getUrl() → pb.files.getURL().
     (7) Follow-up date + follow-up notes go into the calendar event
         description.
   v16 (kept): drag & drop / paste documents, syncDocuments() on save,
         unified <DocumentDropzone />.
   v14 (kept): Time & Duration side-by-side; "Follow up" section
         with optional Status (Scheduled pre-selected) and optional
         follow-up date.
   v13 (kept): Meeting workspace removed totally.
   v12 (kept): Agenda lives in Step 1.
   v11 (kept): Meeting type first — Internal → employees,
         External → officers (IAS / IPS / other contacts).
   KEPT: v8 additional officers, officer cache, validation,
         edit-populate, follow-up rule, follow-up notes, all UI language.
================================================================ */

import { useState, useEffect, useRef, useMemo } from 'react';
import {
  X, Calendar, CalendarDays, Clock, Timer, MapPin, Check, Search,
  ChevronLeft, ChevronRight, Loader2, Users, Mail, Phone, User,
  Sparkles, ArrowLeft, ArrowRight, AlertCircle, Building2, Flag,
  Video, Globe, Plus, Zap, Activity, Feather, Edit2, Upload, Trash2,
  FileText,
} from 'lucide-react';
import pb from '@/lib/pocketbase';
import { showToast } from '@/components/Toaster';
import { completedTooEarly } from '@/lib/meetingRules';
import {
  useBusySlots, isSlotConflictError, slotConflictMessage, blockLabel, toHHMM, durationBlockReason,
  type BusyBlock, type SlotSuggestion,
} from '@/lib/busySlots';
import ConflictCard, { ParticipantNotice } from '@/components/ConflictCard';
import { CITIES, cityKey, cityLabel, findCity } from '@/lib/cities';
import { findPeopleToRevisit, personKey } from '@/lib/revisit';

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
.c-progress { background:linear-gradient(90deg,#a78bfa 25%,#7c3aed 40%,#a78bfa 55%); background-size:200% 100%; animation:cShimmer 1.2s linear infinite }
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
  /* create a new meeting pre-filled from this one */
  duplicateFrom?: any;
  /* all meetings — used for the "met before in this city" hint */
  pastMeetings?: any[];
  /* called after a successful save: saved fields + id + __isNew */
  onSavedMeeting?: (rec: any) => void;
}

interface Officer {
  id: string; name: string; designation?: string;
  type: 'IAS' | 'IPS' | 'Other';
  cadre?: string; state?: string; contact_number?: string; email?: string;
  department?: string; current_position?: string; batch_year?: string;
}

/* --------------------------- Constants --------------------------- */

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
  { value: 'Internal', icon: Users, hint: 'Within your team — pick employees',
    sel: 'bg-violet-50 border-violet-300', txt: 'text-violet-700' },
  { value: 'External', icon: Globe, hint: 'Outside participants — pick officers',
    sel: 'bg-sky-50 border-sky-300', txt: 'text-sky-700' },
];

const STATUS_FLAGS = [
  { value: 'Scheduled',   dot: 'bg-violet-500' },
  { value: 'Completed',   dot: 'bg-emerald-500' },
  { value: 'Cancelled',   dot: 'bg-rose-500' },
  { value: 'Rescheduled', dot: 'bg-amber-500' },
];

export const PRESET_DURATIONS = [15, 30, 45, 60, 90, 120, 180];

const QUICK_TIME_SLOTS = ['09:30','10:00','11:00','12:00','14:00','15:00','16:30','18:00'];
/* 24-hour clock — 00 … 23 */
const HOUR_OPTIONS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'));
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

/* status/status_flag default to "Scheduled" (auto-selected) */
const EMPTY_FORM = {
  agenda: '', meeting_date: '', meeting_time: '', duration: '', location: '',
  status: 'Scheduled', officer_type: '', officer_name: '', officer_id: '', designation: '',
  department: '', officer_category: '', contact_number: '', email: '', address: '',
  website: '', cadre: '', state: '', batch_year: '', current_position: '',
  previous_postings: '', date_of_birth: '', priority: '', meeting_type: '',
  meeting_place: '', status_flag: 'Scheduled', follow_up_date: '', follow_up_notes: '', attendees: '',
  /* Google integrations + send invite auto-selected for every new meeting */
  send_invite: true, sync_gcal: true, add_meet: true,
  created_by: '', meet_link: '', gcal_event_id: '', gcal_link: '',
  city: '',
};

const ACCEPTED_DOCS = '.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.png,.jpg,.jpeg,.webp';
const MAX_FILE_MB = 10;

/* the API routes that actually exist in app/api/ */
const GOOGLE_ROUTE = '/api/google';
const INVITE_ROUTE = '/api/invite';

/* --------------------------- Helpers --------------------------- */

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

/* 24-hour display (HH:mm) everywhere */
export const fmtTime24 = (t: string) => {
  const m = /^(\d{1,2}):(\d{2})/.exec(String(t || '').trim());
  return m ? `${m[1].padStart(2, '0')}:${m[2]}` : '';
};

const splitTime24 = (t: string) => {
  const v = fmtTime24(t);
  return v ? { hour: v.slice(0, 2), minute: v.slice(3, 5) } : { hour: '', minute: '00' };
};

export const formatDuration = (m: number) => {
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60), mm = m % 60;
  return mm === 0 ? `${h} hr` : `${h}h ${mm}m`;
};

export const clampInt = (v: string, max: number) => {
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
  officer: 'cmp-sec-officer', meeting_type: 'cmp-sec-type', agenda: 'cmp-sec-agenda',
  date: 'cmp-sec-date', time: 'cmp-sec-time', duration: 'cmp-sec-time',
  place: 'cmp-sec-place', priority: 'cmp-sec-priority', follow_up: 'cmp-sec-followup',
};

const initialsOf = (name: string) =>
  name.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase();

/* Officer directory cache — avoids 3 collection fetches on every open */
let officerCache: { data: Officer[]; ts: number } | null = null;
const OFFICER_CACHE_TTL = 60_000;

/* IAS officers loaded up front; everyone else is found by server-side search */
const IAS_PAGE = 40;

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

/** base list + extra records, de-duplicated by id (base wins, so fresh data replaces old) */
const mergeOfficers = (base: Officer[], extra: Officer[]) => {
  const seen = new Set(base.map((o) => o.id));
  return [...base, ...extra.filter((o) => !seen.has(o.id))];
};

/** PocketBase filter-safe string */
const pbq = (s: string) => s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');

/* fetch with hard timeout so a hanging automation never blocks forever */
async function postJSON(url: string, body: any, timeoutMs = 12_000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: pb.authStore.token || '' },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw Object.assign(new Error(data.error || `Automation failed (${res.status})`), data);
    return data;
  } finally {
    clearTimeout(t);
  }
}

const parseJsonField = (v: any, fallback: any) => {
  if (!v) return fallback;
  try { return typeof v === 'string' ? JSON.parse(v) : v; } catch { return fallback; }
};

/* --------------------------- Small pieces --------------------------- */

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p className="c-fade-in mt-1.5 flex items-center gap-1.5 text-xs font-medium text-rose-600">
      <AlertCircle className="h-3.5 w-3.5 shrink-0" /> {message}
    </p>
  );
}

function SectionHead({ icon: Icon, title, sub, required, optional, size = 'md' }: {
  icon: any; title: string; sub?: string; required?: boolean; optional?: boolean; size?: 'md' | 'lg';
}) {
  const iconBoxCls = size === 'lg' ? 'h-8 w-8' : 'h-7 w-7';
  const iconCls = size === 'lg' ? 'h-4 w-4' : 'h-3.5 w-3.5';
  const titleCls = size === 'lg' ? 'text-[15px]' : 'text-[13px]';
  const subCls = size === 'lg' ? 'text-xs' : 'text-[11px]';
  return (
    <div className="mb-2.5 flex items-center gap-2.5">
      <span className={`flex ${iconBoxCls} shrink-0 items-center justify-center rounded-lg bg-violet-50 text-violet-600`}>
        <Icon className={iconCls} />
      </span>
      <div>
        <p className={`${titleCls} font-semibold text-slate-800`}>
          {title}
          {required && <span className="ml-0.5 text-rose-500">*</span>}
          {optional && <span className="ml-1.5 text-[11px] font-normal text-slate-400">Optional</span>}
        </p>
        {sub && <p className={`${subCls} text-slate-400`}>{sub}</p>}
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
    <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold tabular-nums text-slate-600">
      {children}
    </span>
  );
}

/* ------------------------- DocumentDropzone ------------------------- */
/* Unified drag-and-drop + paste + click-to-browse dropzone, used
   for both create and edit mode. Files are staged locally and only
   uploaded when the parent calls syncDocuments() (on Save). */

function DocumentDropzone({
  existingDocs, pendingDocs, onPick, onRemoveExisting, onRemovePending,
  fileUrl, uploading, accept, maxMB,
}: {
  existingDocs: string[];
  pendingDocs: File[];
  onPick: (files: FileList | null) => void;
  onRemoveExisting: (name: string) => void;
  onRemovePending: (idx: number) => void;
  fileUrl: (name: string) => string;
  uploading?: boolean;
  accept: string;
  maxMB: number;
}) {
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    onPick(e.dataTransfer.files);
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const files = Array.from(e.clipboardData?.items || [])
      .filter((i) => i.kind === 'file')
      .map((i) => i.getAsFile())
      .filter((f): f is File => !!f);
    if (!files.length) return;
    const dt = new DataTransfer();
    files.forEach((f) => dt.items.add(f));
    onPick(dt.files);
  };

  return (
    <div className="pt-1" onPaste={handlePaste}>
      <input
        ref={inputRef}
        type="file"
        multiple
        accept={accept}
        className="hidden"
        onChange={(e) => onPick(e.target.files)}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragEnter={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        className={`flex w-full flex-col items-center justify-center gap-1.5 rounded-2xl border-2 border-dashed px-3 py-5 text-[13px] font-semibold transition-all duration-150 ${
          dragOver
            ? 'scale-[1.01] border-violet-400 bg-violet-50/80 text-violet-700'
            : 'border-slate-200 bg-slate-50/50 text-slate-600 hover:border-violet-300 hover:bg-violet-50/50 hover:text-violet-700'
        }`}
      >
        <Upload className={`h-4 w-4 ${dragOver ? 'animate-bounce' : ''}`} />
        {dragOver ? 'Drop to attach' : 'Attach documents'}
        <span className="text-[11px] font-normal text-slate-400">
          Drag &amp; drop, paste, or click · PDF, Word, Excel, images · max {maxMB} MB each
        </span>
      </button>

      {uploading && (
        <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-slate-100">
          <div className="c-progress h-full w-1/3 rounded-full" />
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
                <button type="button" onClick={() => onRemoveExisting(name)} className="rounded-full p-0.5 text-slate-400 transition-colors hover:bg-rose-50 hover:text-rose-500">
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
              <button type="button" onClick={() => onRemovePending(i)} className="rounded-full p-0.5 text-violet-400 transition-colors hover:bg-violet-100 hover:text-rose-500">
                <Trash2 className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/* ------------------------------- WeekStrip ------------------------------- */

export function WeekStrip({ value, onChange, markedDates = [] }: {
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

/* --------------------------- MiniDatePicker --------------------------- */
/* Compact popover calendar used for the "Follow up" date. */

function MiniDatePicker({ value, onChange, min }: {
  value: string; onChange: (v: string) => void; min?: string;
}) {
  const [open, setOpen] = useState(false);
  const [viewDate, setViewDate] = useState<Date>(() => {
    const seed = value || min;
    return seed ? new Date(`${seed}T00:00:00`) : new Date();
  });
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const seed = value || min;
    if (!seed) return;
    const d = new Date(`${seed}T00:00:00`);
    if (!isNaN(d.getTime())) setViewDate(d);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const y = viewDate.getFullYear();
  const mo = viewDate.getMonth();
  const monthLabel = new Date(y, mo, 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
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

  const minISO = min || '';
  const isDisabled = (iso: string) => !!minISO && iso < minISO;
  const canGoPrevMonth = !minISO || `${y}-${String(mo + 1).padStart(2, '0')}` > minISO.slice(0, 7);
  const shiftMonth = (delta: number) => {
    if (delta < 0 && !canGoPrevMonth) return;
    setViewDate((prev) => new Date(prev.getFullYear(), prev.getMonth() + delta, 1));
  };

  const navBtn = 'flex h-7 w-7 items-center justify-center rounded-full text-slate-500 transition-colors hover:bg-violet-50 hover:text-violet-600 active:scale-90 disabled:cursor-not-allowed disabled:text-slate-300 disabled:hover:bg-transparent';

  return (
    <div className="relative" ref={wrapRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-left text-sm outline-none transition hover:border-slate-300 focus:border-violet-400 focus:ring-4 focus:ring-violet-500/10"
      >
        <span className={value ? 'font-medium text-slate-800' : 'text-slate-400'}>
          {value ? prettyDate(value) : 'Pick a follow-up date'}
        </span>
        <CalendarDays className="h-4 w-4 shrink-0 text-violet-500" />
      </button>

      {open && (
        <div className="c-fade-in absolute z-10 mt-2 w-full min-w-[260px] rounded-2xl border border-slate-200 bg-white p-3 shadow-xl sm:w-72">
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
            {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => (
              <div key={i} className="py-1 text-center text-[10px] font-semibold text-slate-400">{d}</div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-y-0.5">
            {cells.map((c) => {
              const selected = c.iso === value;
              const disabled = isDisabled(c.iso);
              return (
                <button
                  key={c.iso} type="button"
                  disabled={disabled}
                  onClick={() => { onChange(c.iso); setOpen(false); }}
                  className={`relative flex h-8 w-full items-center justify-center rounded-xl text-xs font-semibold transition-all active:scale-90 ${
                    selected ? 'bg-violet-600 text-white shadow-md shadow-violet-500/25'
                    : disabled ? 'cursor-not-allowed text-slate-300'
                    : c.inMonth ? 'text-slate-700 hover:bg-violet-50'
                    : 'text-slate-300'
                  }`}
                >
                  {c.day}
                </button>
              );
            })}
          </div>
          {value && (
            <button
              type="button"
              onClick={() => { onChange(''); setOpen(false); }}
              className="mt-2 w-full rounded-xl border border-slate-200 py-1.5 text-[11px] font-semibold text-slate-500 transition hover:border-rose-300 hover:text-rose-600"
            >
              Clear date
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/* --------------------------- TimeSlotPicker --------------------------- */

/* 24-hour picker + busy awareness.
   `busyAt(t)` (optional) returns the meeting occupying time `t`, if any —
   those quick-slot chips / minute options are striped and can't be picked.
   Pages that don't pass it get the plain 24-hour picker. */
const BUSY_STRIPES = 'repeating-linear-gradient(135deg, rgba(244,63,94,.10) 0 5px, transparent 5px 10px)';

export function TimeSlotPicker({ value, onChange, meetingDate, busyAt, accent = 'violet' }: {
  value: string;
  onChange: (v: string) => void;
  meetingDate: string;
  busyAt?: (t: string) => BusyBlock | undefined;
  accent?: 'violet' | 'amber';
}) {
  const [hour, setHour] = useState(() => splitTime24(value).hour);
  const [minute, setMinute] = useState(() => splitTime24(value).minute);

  useEffect(() => {
    const p = splitTime24(value);
    setHour(p.hour); setMinute(p.minute);
  }, [value]);

  const isPast = (t: string) => isPastTimeToday(meetingDate, t);
  const isBusy = (t: string) => !!busyAt?.(t);
  const unavailable = (h: string, m: string) => isPast(`${h}:${m}`) || isBusy(`${h}:${m}`);
  const firstAvailableMinute = (h: string) => MINUTE_OPTIONS.find((m) => !unavailable(h, m)) ?? '';

  const pickHour = (h: string) => {
    setHour(h);
    if (!h) return;
    let m = minute;
    if (unavailable(h, m)) { m = firstAvailableMinute(h); setMinute(m || '00'); }
    if (m && !unavailable(h, m)) onChange(`${h}:${m}`);
  };
  const pickMinute = (m: string) => {
    setMinute(m);
    if (!hour) return;
    if (!unavailable(hour, m)) onChange(`${hour}:${m}`);
  };

  const visibleSlots = QUICK_TIME_SLOTS.filter((t) => !isPast(t));
  const selectCls = 'cursor-pointer bg-transparent px-1 py-1 text-xs font-semibold tabular-nums text-slate-700 outline-none';
  const sel = accent === 'amber'
    ? 'border-amber-500 bg-amber-500 text-white shadow-md shadow-amber-500/25'
    : 'border-violet-600 bg-violet-600 text-white shadow-md shadow-violet-500/25';
  const idle = accent === 'amber'
    ? 'border-slate-200 bg-white text-slate-600 hover:border-amber-300 hover:text-amber-700'
    : 'border-slate-200 bg-white text-slate-600 hover:border-violet-300 hover:text-violet-700';

  return (
    <div className="min-w-0 flex-1 space-y-2.5">
      {visibleSlots.length > 0 && (
        <div className="grid grid-cols-3 gap-1.5">
          {visibleSlots.map((t) => {
            const selected = value === t;
            const busy = busyAt?.(t);
            if (busy && !selected) {
              return (
                <button
                  key={t} type="button" disabled
                  title={`Busy · ${blockLabel(busy)} · ${busy.agenda}`}
                  className="relative cursor-not-allowed whitespace-nowrap rounded-full border border-rose-100 py-2 text-[11px] font-semibold tabular-nums text-rose-300 line-through decoration-rose-300/70"
                  style={{ backgroundImage: BUSY_STRIPES }}
                >
                  {t}
                  <span className="absolute -right-1 -top-1.5 rounded-full bg-rose-500 px-1 text-[8px] font-bold leading-[14px] text-white no-underline">Busy</span>
                </button>
              );
            }
            return (
              <button
                key={t} type="button" onClick={() => onChange(t)}
                className={`whitespace-nowrap rounded-full border py-2 text-[11px] font-semibold tabular-nums transition-all active:scale-95 ${
                  selected ? (busy ? 'border-rose-500 bg-rose-500 text-white shadow-md shadow-rose-500/25' : sel) : idle
                }`}
              >{t}</button>
            );
          })}
        </div>
      )}
      <div className="flex items-center justify-between gap-2 border-t border-slate-100 pt-2.5">
        <span className="shrink-0 text-[11px] text-slate-400">Other <span className="text-slate-300">(24h)</span></span>
        <div className={`flex items-center rounded-full border border-slate-200 bg-white p-1 transition focus-within:ring-4 ${
          accent === 'amber' ? 'focus-within:border-amber-400 focus-within:ring-amber-500/10' : 'focus-within:border-violet-400 focus-within:ring-violet-500/10'
        }`}>
          <select value={hour} onChange={(e) => pickHour(e.target.value)} aria-label="Hour" className={selectCls}>
            <option value="">HH</option>
            {HOUR_OPTIONS.map((h) => (
              <option key={h} value={h} disabled={firstAvailableMinute(h) === ''}>{h}</option>
            ))}
          </select>
          <span className="text-xs font-bold text-slate-300">:</span>
          <select value={minute} onChange={(e) => pickMinute(e.target.value)} aria-label="Minute" className={selectCls}>
            {MINUTE_OPTIONS.map((m) => {
              const busy = !!hour && isBusy(`${hour}:${m}`);
              return (
                <option key={m} value={m} disabled={!!hour && unavailable(hour, m)}>
                  {m}{busy ? ' · busy' : ''}
                </option>
              );
            })}
          </select>
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
  duplicateFrom,
  pastMeetings,
  onSavedMeeting,
}: CreateMeetingPanelProps) {
  /* Accept BOTH prop names so every page works */
  const editSource = meetingToEdit ?? editingMeeting ?? null;
  const resolvedDefaultDate = defaultDate ?? initialDate ?? '';

  const [step, setStep] = useState<1 | 2>(1);
  const [loading, setLoading] = useState(false);
  const [officerLoading, setOfficerLoading] = useState(false);

  const [officers, setOfficers] = useState<Officer[]>([]);
  const [officerSearch, setOfficerSearch] = useState('');
  const [iasTotal, setIasTotal] = useState(0);
  const [iasSearching, setIasSearching] = useState(false);
  const [typeFilter, setTypeFilter] = useState<'All' | 'IAS' | 'IPS' | 'Other'>('All');
  const [selectedOfficer, setSelectedOfficer] = useState<Officer | null>(null);
  const [showOfficerEdit, setShowOfficerEdit] = useState(false);

  /* employees pool for Internal meetings */
  const [employees, setEmployees] = useState<Officer[]>([]);
  const [employeeLoading, setEmployeeLoading] = useState(false);

  /* additional officers (More details) */
  const [extraOfficers, setExtraOfficers] = useState<Officer[]>([]);
  const [extraSearch, setExtraSearch] = useState('');

  const [showMoreDetails, setShowMoreDetails] = useState(false);

  /* documents — attach BEFORE saving:
     pendingDocs  → files picked/dropped/pasted before save (create + edit)
     existingDocs → files already on the record (edit mode only)      */
  const [existingDocs, setExistingDocs] = useState<string[]>([]);
  const [pendingDocs, setPendingDocs] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const initialDocsRef = useRef<string[]>([]);

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
  /* true once follow_up_notes for the record being edited is known */
  const notesReadyRef = useRef<boolean>(true);
  /* "date|time|duration" as loaded for edit — unchanged slot is never blocked */
  const originalSlotRef = useRef<string>('');

  const goStep = (s: 1 | 2) => { stepRef.current = s; setStep(s); };

  /* ---------------- data loading (with cache) ---------------- */

  async function fetchOfficers() {
    /* show the cached directory instantly, but always re-fetch so edits to
       officers/contacts (e.g. a corrected email) appear without a page reload */
    const cached = officerCache && Date.now() - officerCache.ts < OFFICER_CACHE_TTL;
    if (cached) setOfficers(officerCache!.data);
    else setOfficerLoading(true);
    try {
      /* IAS has thousands of officers — load one page now, the rest via search (searchIas) */
      const [ias, ips, others] = await Promise.all([
        pb.collection('ias_officers').getList(1, IAS_PAGE, { sort: 'name' }),
        pb.collection('ips_officers').getFullList({ sort: 'name' }),
        pb.collection('other_contacts').getFullList({ sort: 'name' }),
      ]);
      setIasTotal(ias.totalItems);
      const data = [
        ...ias.items.map((o: any) => mapOfficer(o, 'IAS')),
        ...ips.map((o: any) => mapOfficer(o, 'IPS')),
        ...others.map((o: any) => mapOfficer(o, 'Other')),
      ];
      officerCache = { data, ts: Date.now() };
      setOfficers((prev) => mergeOfficers(data, prev.filter((o) => o.type === 'IAS')));
    } catch (error) {
      console.error('Failed to load directory:', error);
    } finally {
      setOfficerLoading(false);
    }
  }

  async function fetchEmployees() {
    setEmployeeLoading(true);
    try {
      const rows = await pb.collection('employees').getFullList({ sort: 'name' });
      setEmployees(rows.map((e: any) => ({
        id: e.id,
        name: e.name || '',
        designation: e.designation || e.current_position || '',
        type: 'Other' as const,
        department: e.department || '',
        contact_number: e.contact_number || e.phone || '',
        email: e.email || '',
        cadre: '',
        state: '',
        current_position: e.current_position || e.designation || '',
        batch_year: '',
      })));
    } catch (error) {
      console.error('Failed to load employees:', error);
    } finally {
      setEmployeeLoading(false);
    }
  }

  /* ---------------- lifecycle ---------------- */

  useEffect(() => {
    if (!isOpen) { lastLoadedKeyRef.current = null; return; }
    const stamp = editSource?.updated ?? '';
    const key = editingId ? `edit:${editingId}:${stamp}`
      : duplicateFrom ? `dup:${duplicateFrom.id ?? ''}`
      : `create:${resolvedDefaultDate ?? ''}`;
    if (lastLoadedKeyRef.current === key) return;

    if (editingId) populateForEdit(editSource);
    else if (duplicateFrom) {
      /* same details, but a NEW meeting — pick a new date, fresh
         status, no calendar links / follow-up / documents of the original */
      populateForEdit(duplicateFrom);
      setFormData((prev) => ({
        ...prev,
        meeting_date: '',
        status: 'Scheduled', status_flag: 'Scheduled',
        follow_up_date: '', follow_up_notes: '',
        gcal_event_id: '', gcal_link: '', meet_link: '',
        /* caller-supplied fields, e.g. date + city from the "met before" popup */
        ...(duplicateFrom.__prefill || {}),
      }));
      loadedFollowUpRef.current = '';
      originalSlotRef.current = '';
      setExistingDocs([]); initialDocsRef.current = [];
    } else {
      resetForm();
      if (resolvedDefaultDate && !isPastISODate(resolvedDefaultDate)) {
        setFormData((prev) => ({ ...prev, meeting_date: resolvedDefaultDate }));
      }
    }
    lastLoadedKeyRef.current = key;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, editingId, editSource, resolvedDefaultDate, duplicateFrom]);

  /* follow_up_notes: load straight from PocketBase if the passed-in
     record doesn't carry it, so saving never wipes it. */
  useEffect(() => {
    if (!isOpen || !editingId) { notesReadyRef.current = true; return; }
    if (editSource && editSource.follow_up_notes !== undefined) { notesReadyRef.current = true; return; }
    notesReadyRef.current = false;
    let cancelled = false;
    pb.collection('meetings').getOne(editingId)
      .then((fresh: any) => {
        if (cancelled) return;
        const notes = fresh?.follow_up_notes || '';
        setFormData((prev) => (prev.follow_up_notes ? prev : { ...prev, follow_up_notes: notes }));
        if (notes) setShowMoreDetails(true);
        notesReadyRef.current = true;
      })
      .catch((err) => console.error('Failed to load follow-up notes:', err));
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, editingId]);

  /* load both pools when the panel opens */
  useEffect(() => { if (isOpen) { fetchOfficers(); fetchEmployees(); } }, [isOpen]);

  /* dev only: the API routes compile on first use (Google's library is large) —
     touch them when the form opens so they're ready by the time it's saved */
  useEffect(() => {
    if (!isOpen || process.env.NODE_ENV !== 'development') return;
    [GOOGLE_ROUTE, INVITE_ROUTE].forEach((u) => fetch(u, { method: 'HEAD' }).catch(() => {}));
  }, [isOpen]);

  /* IAS search on the server — adds matching officers to the pool as you type */
  async function searchIas(filter: string, limit = 50) {
    try {
      const res = await pb.collection('ias_officers').getList(1, limit, { filter, sort: 'name', requestKey: null });
      const found = res.items.map((o: any) => mapOfficer(o, 'IAS'));
      if (found.length) setOfficers((prev) => mergeOfficers(prev, found));
    } catch (e) {
      console.warn('[directory] IAS search failed', e);
    }
  }

  const iasQuery = (formData.meeting_type === 'Internal' ? '' : (officerSearch || extraSearch)).trim();
  useEffect(() => {
    if (!isOpen || iasQuery.length < 2) return;
    setIasSearching(true);
    const q = pbq(iasQuery);
    const t = setTimeout(() => {
      searchIas(['name', 'current_position', 'cadre', 'state', 'email'].map((f) => `${f} ~ "${q}"`).join(' || '))
        .finally(() => setIasSearching(false));
    }, 250);
    return () => { clearTimeout(t); setIasSearching(false); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [iasQuery, isOpen]);

  /* when editing: make sure the meeting's IAS officer + any IAS attendee emails are in the pool */
  useEffect(() => {
    if (!isOpen || !editingId) return;
    const parts: string[] = [];
    if (formData.officer_type === 'IAS' && formData.officer_id) parts.push(`id = "${pbq(formData.officer_id)}"`);
    attendeeList.map((a) => a.trim().toLowerCase()).filter((a) => a.includes('@')).slice(0, 20)
      .forEach((e) => parts.push(`email = "${pbq(e)}"`));
    if (parts.length) searchIas(parts.join(' || '), 30);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, editingId, formData.officer_id, attendeeList.length]);

  /* a saved meeting stores a snapshot of the officer's details — when editing,
     refresh email/phone/designation from the directory's current record */
  useEffect(() => {
    const id = selectedOfficer?.id;
    if (!id || !officers.length) return;
    const live = officers.find((o) => o.id === id);
    if (!live) return;
    const fresh = {
      email: live.email || selectedOfficer.email || '',
      contact_number: live.contact_number || selectedOfficer.contact_number || '',
      designation: live.designation || selectedOfficer.designation || '',
    };
    if (fresh.email === (selectedOfficer.email || '') &&
        fresh.contact_number === (selectedOfficer.contact_number || '') &&
        fresh.designation === (selectedOfficer.designation || '')) return;
    setSelectedOfficer((prev) => (prev && prev.id === id ? { ...prev, ...fresh } : prev));
    setFormData((prev) => (prev.officer_id === id ? { ...prev, ...fresh } : prev));
  }, [officers, selectedOfficer]);

  /* on edit, attendee emails matching the directory become extra participants */
  useEffect(() => {
    if ((!officers.length && !employees.length) || !editingId) return;
    setExtraOfficers((prev) => {
      if (prev.length) return prev;
      const pool = [...officers, ...employees];
      const emails = new Set(attendeeList.map((a) => a.trim().toLowerCase()).filter(Boolean));
      const matches = pool.filter((o) => o.email && emails.has(o.email.toLowerCase()));
      if (!matches.length) return prev;
      setAttendeeList((list) =>
        list.filter((a) => !matches.some((m) => (m.email || '').toLowerCase() === a.trim().toLowerCase()))
      );
      setShowMoreDetails(true);
      return matches;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [officers, employees, editingId]);

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
      follow_up_notes: m.follow_up_notes || '',
      send_invite: m.send_invite ?? EMPTY_FORM.send_invite,
      sync_gcal: m.sync_gcal ?? EMPTY_FORM.sync_gcal,
      add_meet: m.add_meet ?? EMPTY_FORM.add_meet,
      created_by: m.created_by || '',
      meet_link: m.meet_link || '',
      gcal_event_id: m.gcal_event_id || '',
      gcal_link: m.gcal_link || '',
      city: m.city || '',
    });

    syncDurationUI(String(m.duration ?? ''));
    originalSlotRef.current = `${formattedDate}|${formattedTime}|${Number(m.duration) || 0}`;
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
    setExtraOfficers([]);
    setExtraSearch('');
    setShowOfficerEdit(false);
    setShowMoreDetails(Boolean(
      m.attendees || m.follow_up_date || m.followup_date || m.follow_up_notes ||
      m.meet_link || m.gcal_link || m.send_invite || m.sync_gcal || m.add_meet,
    ));

    const loadedDocs = parseJsonField(m.documents, []);
    setExistingDocs(loadedDocs);
    initialDocsRef.current = loadedDocs;
    setPendingDocs([]);

    setErrors({});
    setSubmitError(null);
    goStep(1);
    setOfficerSearch('');
    setTypeFilter('All');
  }

  function resetForm() {
    setFormData(EMPTY_FORM);
    loadedFollowUpRef.current = '';
    originalSlotRef.current = '';
    setSelectedOfficer(null);
    setExtraOfficers([]);
    setExtraSearch('');
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
    setExistingDocs([]); setPendingDocs([]); initialDocsRef.current = [];
  }

  /* ---------------- derived ---------------- */

  const isInternal = formData.meeting_type === 'Internal';
  const isExternal = formData.meeting_type === 'External';

  const LIST_CAP = 40;
  const filteredOfficersAll = useMemo(() => {
    const pool = isInternal ? employees : officers;
    const q = officerSearch.trim().toLowerCase();
    return pool.filter((o) => {
      if (isExternal && typeFilter !== 'All' && o.type !== typeFilter) return false;
      if (!q) return true;
      return (
        o.name?.toLowerCase().includes(q) ||
        o.designation?.toLowerCase().includes(q) ||
        o.department?.toLowerCase().includes(q) ||
        o.cadre?.toLowerCase().includes(q) ||
        o.state?.toLowerCase().includes(q)
      );
    });
  }, [officers, employees, officerSearch, typeFilter, isInternal, isExternal]);

  const officerSearchActive = !!officerSearch.trim();
  const filteredOfficers = officerSearchActive ? filteredOfficersAll : filteredOfficersAll.slice(0, LIST_CAP);
  const officersTruncated = !officerSearchActive && (filteredOfficersAll.length > LIST_CAP || (!isInternal && iasTotal > IAS_PAGE));

  const extraCandidates = useMemo(() => {
    const q = extraSearch.trim().toLowerCase();
    if (!q) return [];
    const pool = isInternal ? employees : officers;
    const taken = new Set([selectedOfficer?.id, ...extraOfficers.map((o) => o.id)]);
    return pool
      .filter((o) => !taken.has(o.id))
      .filter((o) =>
        o.name?.toLowerCase().includes(q) ||
        o.designation?.toLowerCase().includes(q) ||
        o.department?.toLowerCase().includes(q) ||
        o.cadre?.toLowerCase().includes(q)
      )
      .slice(0, 8);
  }, [officers, employees, extraSearch, extraOfficers, selectedOfficer, isInternal]);

  const participantLoading = isInternal ? employeeLoading : officerLoading;

  const followUpMin = toLocalISODate(addDays(new Date(), 1));

  const customTotal = (parseInt(customHours, 10) || 0) * 60 + (parseInt(customMinutes, 10) || 0);

  const durationNum = Number(formData.duration) || 0;
  const endTime = formData.meeting_time && durationNum > 0
    ? addMinutesToTime(formData.meeting_time, durationNum) : '';
  const timeRangeLabel = formData.meeting_time && endTime
    ? `${fmtTime24(formData.meeting_time)} – ${fmtTime24(endTime)}` : '';
  const crossesMidnight = !!(formData.meeting_time && endTime && endTime < formData.meeting_time);

  /* ---------------- "met before" hint ---------------- */

  const formCityKey = cityKey(formData.city) || findCity(formData.location)?.key || null;
  const revisitCount = !isEditMode && pastMeetings?.length && formData.meeting_date
    ? findPeopleToRevisit(pastMeetings, {
        city: formCityKey,
        date: formData.meeting_date,
        exclude: [personKey(formData), ...extraOfficers.map((o) => `id:${o.id}`)],
      }).length
    : 0;

  /* fill City from the address when it names a known city */
  const handleLocationBlur = () => {
    if (formData.city.trim()) return;
    const found = findCity(formData.location);
    if (found) setFormData((prev) => ({ ...prev, city: found.label }));
  };

  /* ---------------- slot conflicts ---------------- */

  const busy = useBusySlots(formData.meeting_date, editingId, isOpen);
  /* a Cancelled meeting never occupies a slot (same rule as the server hook) */
  const slotBlocking = (formData.status_flag || 'Scheduled').toLowerCase() !== 'cancelled';
  /* edit mode: only hard-block when date/time/duration actually changed */
  const slotKey = `${formData.meeting_date}|${formData.meeting_time}|${durationNum}`;
  const slotChanged = !editingId || slotKey !== originalSlotRef.current;

  const busyAt = (t: string) => busy.findConflicts(t, 1)[0];
  const conflicts: BusyBlock[] = slotBlocking && formData.meeting_date && formData.meeting_time
    ? busy.findConflicts(formData.meeting_time, durationNum || 15) : [];
  const conflictIds = new Set(conflicts.map((c) => c.id));
  const suggestions = conflicts.length ? busy.suggest(formData.meeting_time, durationNum || 30) : [];
  const freeAfter = slotBlocking && formData.meeting_time ? busy.freeMinutesFrom(formData.meeting_time) : null;

  const participantClashes = formData.meeting_date
    ? busy.participantMeetings({
        officerIds: [formData.officer_id, ...extraOfficers.map((o) => o.id)],
        emails: [formData.email, ...extraOfficers.map((o) => o.email || '')],
      }).filter((m) => !conflictIds.has(m.id))
    : [];

  const applySuggestion = (s: SlotSuggestion) => {
    setFormData((prev) => ({ ...prev, meeting_date: s.date, meeting_time: s.time }));
    setErrors((p) => ({ ...p, date: '', time: '' }));
    setSubmitError(null);
  };

  /* ---------------- handlers ---------------- */

  const handleMeetingTypeChange = (v: string) => {
    if (formData.meeting_type === v) return;
    setSelectedOfficer(null);
    setShowOfficerEdit(false);
    setExtraOfficers([]);
    setOfficerSearch('');
    setTypeFilter('All');
    setFormData((prev) => ({
      ...prev,
      meeting_type: v,
      officer_name: '', officer_id: '', officer_type: '', designation: '',
      contact_number: '', email: '', department: '', current_position: '',
      batch_year: '', cadre: '', state: '',
    }));
    setErrors((p) => ({ ...p, officer: '', meeting_type: '' }));
  };

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

  const startManualOfficer = () => {
    setSelectedOfficer({ id: '', name: '', type: 'Other' });
    setFormData((prev) => ({ ...prev, officer_name: '', officer_id: '', officer_type: 'Other' }));
    setShowOfficerEdit(true);
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

  const handleAddExtraOfficer = (officer: Officer) => {
    setExtraOfficers((p) => (p.some((x) => x.id === officer.id) ? p : [...p, officer]));
    setExtraSearch('');
  };

  const handleRemoveExtraOfficer = (officer: Officer) =>
    setExtraOfficers((p) => p.filter((x) => x.id !== officer.id));

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
    setErrors((p) => ({ ...p, duration: '', time: p.time === PAST_TIME_MSG ? p.time : '' }));
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
    if (total > 0) setErrors((p) => ({ ...p, duration: '', time: p.time === PAST_TIME_MSG ? p.time : '' }));
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

  const meetingFileUrl = (filename: string) => {
    if (!filename || !editingId) return '';
    try {
      const stub: any = { collectionName: 'meetings', id: editingId };
      const anyPb = pb as any;
      if (anyPb.files?.getURL) return anyPb.files.getURL(stub, filename);
      if (anyPb.files?.getUrl) return anyPb.files.getUrl(stub, filename);
      if (anyPb.getFileUrl) return anyPb.getFileUrl(stub, filename);
    } catch { /* noop */ }
    return '';
  };

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
  };

  const removePendingDoc = (idx: number) =>
    setPendingDocs((prev) => prev.filter((_, i) => i !== idx));

  const removeExistingDoc = (name: string) =>
    setExistingDocs((prev) => prev.filter((n) => n !== name));

  /* PocketBase: re-appending existing filenames KEEPS those files;
     omitted names get deleted. New File parts get added. */
  const docsDirty =
    pendingDocs.length > 0 ||
    existingDocs.join('||') !== initialDocsRef.current.join('||');

  async function syncDocuments(recordId: string) {
    if (!docsDirty || !recordId) return;
    const fd = new FormData();
    if (editingId && !existingDocs.length && !pendingDocs.length) {
      fd.append('documents', '');               // clear all
    }
    if (editingId) existingDocs.forEach((n) => fd.append('documents', n)); // keep remaining
    pendingDocs.forEach((f) => fd.append('documents', f));                 // add new
    setUploading(true);
    try {
      await pb.collection('meetings').update(recordId, fd);
      setPendingDocs([]);
      initialDocsRef.current = [...existingDocs];
    } finally {
      setUploading(false);
    }
  }

  /* ---------------- automations ---------------- */
  /* Google runs first so the email can carry the Meet link.
     Returns a list of human-readable failures (empty = all OK). */
  async function runAutomations(recId: string, payload: Record<string, any>) {
    const failures: string[] = [];
    const wantInvite = formData.send_invite;

    const isEmail = (e: string) => /^\S+@\S+\.\S+$/.test(e);
    const primaryEmail = (formData.email || '').trim().toLowerCase();
    const allEmails = Array.from(new Set(
      [primaryEmail, ...extraOfficers.map((o) => o.email || ''), ...attendeeList]
        .map((e) => e.trim().toLowerCase())
        .filter(isEmail),
    ));

    const notes = [
      payload.follow_up_date && `Follow-up date: ${payload.follow_up_date}`,
      payload.follow_up_notes && `Follow-up notes: ${payload.follow_up_notes}`,
    ].filter(Boolean).join('\n');

    let meetLink = formData.meet_link || '';
    let primaryInvited = false;

    /* 1) Google Calendar / Meet (+ email to the primary officer) */
    if (formData.sync_gcal || formData.add_meet) {
      try {
        const r = await postJSON(GOOGLE_ROUTE, {
          meetingId: recId,
          agenda: payload.agenda,
          date: payload.meeting_date,
          time: payload.meeting_time,
          duration: Number(payload.duration) || 30,
          location: payload.location,
          notes,
          officerName: payload.officer_name,
          officerEmail: primaryEmail || allEmails[0] || '',
          includeMeet: formData.add_meet,
          sendInvite: wantInvite,
          syncCalendar: formData.sync_gcal,
          gcalEventId: formData.gcal_event_id || '',
          existingMeetLink: formData.meet_link || '',
        }, 45_000);

        if (r.meetLink) meetLink = r.meetLink;
        primaryInvited = !!r.emailSent;

        const update: Record<string, string> = {};
        if (r.eventId) update.gcal_event_id = r.eventId;
        if (r.htmlLink) update.gcal_link = r.htmlLink;
        if (r.meetLink) update.meet_link = r.meetLink;
        if (Object.keys(update).length) {
          try { await pb.collection('meetings').update(recId, update); }
          catch (e) { console.error('Saving Google links failed:', e); }
        }
        if (formData.add_meet && !r.meetLink) failures.push('Calendar saved, but no Meet link was created');
      } catch (err: any) {
        console.error(`${GOOGLE_ROUTE} failed:`, err);
        if (err?.needsReconnect) {
          failures.push('Calendar/Meet: Google connection expired — an admin must click “Reconnect Google” on the Meetings page');
        } else {
          failures.push(`Calendar/Meet: ${err?.name === 'AbortError' ? 'timed out' : err?.message}`);
        }
      }
    }

    /* 2) Invite email — skips the primary officer if /api/google already emailed them */
    if (wantInvite) {
      const recipients = primaryInvited ? allEmails.filter((e) => e !== primaryEmail) : allEmails;
      if (!allEmails.length) {
        failures.push('Invite skipped: no participant has an email address');
      } else if (recipients.length) {
        try {
          await postJSON(INVITE_ROUTE, {
            to: recipients.join(', '),
            name: recipients.length === 1 && recipients[0] === primaryEmail ? payload.officer_name : '',
            agenda: payload.agenda,
            date: new Date(`${payload.meeting_date}T00:00:00`).toLocaleDateString('en-IN', {
              weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
            }),
            time: `${fmtTime24(payload.meeting_time)} hrs (${formatDuration(Number(payload.duration) || 0)})`,
            location: payload.location,
            meetLink,
            // → calendar invite (.ics) attached, with Yes / No / Maybe
            isoDate: payload.meeting_date,
            isoTime: payload.meeting_time,
            duration: Number(payload.duration) || 30,
            meetingId: recId,
          }, 20_000);
        } catch (err: any) {
          console.error(`${INVITE_ROUTE} failed:`, err);
          failures.push(`Invite: ${err?.name === 'AbortError' ? 'timed out' : err?.message}`);
        }
      }
    }

    return failures;
  }

  /* ---------------- validation & submit ---------------- */

  function scrollToSection(key: string) {
    const secId = ERROR_SECTION_IDS[key];
    if (!secId) return;
    setTimeout(() => {
      document.getElementById(secId)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 60);
  }

  function handleNext() {
    const e: Record<string, string> = {};
    if (!formData.meeting_type) e.meeting_type = 'Please choose Internal or External.';
    if (!selectedOfficer?.name && !formData.officer_name) e.officer = 'Please choose a participant or add one manually.';
    if (!formData.agenda.trim()) e.agenda = 'Please enter the agenda.';
    if (Object.keys(e).length) {
      setErrors((p) => ({ ...p, ...e }));
      setSubmitError(null);
      scrollToSection(Object.keys(e)[0]);
      return;
    }
    setErrors({});
    setSubmitError(null);
    goStep(2);
  }

  async function handleSubmit() {
    if (savingRef.current) return;
    const e: Record<string, string> = {};
    if (!formData.meeting_type) e.meeting_type = 'Please choose Internal or External.';
    if (!selectedOfficer?.name && !formData.officer_name) e.officer = 'Please choose a participant or add one manually.';
    if (!formData.agenda.trim()) e.agenda = 'Please enter the agenda.';
    if (!formData.meeting_date) e.date = 'Please pick a date.';
    if (!formData.meeting_time) e.time = 'Please pick a time.';
    if (!formData.duration) e.duration = 'Please set a duration.';
    if (!formData.meeting_place) e.place = 'Please choose where this meeting happens.';
    if (!formData.priority) e.priority = 'Please set a priority.';
    if (
      formData.follow_up_date &&
      formData.follow_up_date !== loadedFollowUpRef.current &&
      formData.follow_up_date < followUpMin
    ) e.follow_up = 'Follow-up date must be tomorrow or later.';
    /* a future meeting can't already be Completed */
    const early = !e.date && !e.time && completedTooEarly(formData, formData.status_flag || '');
    if (early) e.time = early;
    /* hard block — the slot overlaps another meeting */
    if (!e.time && conflicts.length && slotChanged) {
      e.time = `This time overlaps “${conflicts[0].agenda}” (${blockLabel(conflicts[0])}). Pick a free slot below.`;
    }

    if (Object.keys(e).length) {
      setErrors(e);
      setSubmitError(e.time && conflicts.length && Object.keys(e).length === 1
        ? 'This time slot is already booked.'
        : 'Please fix the highlighted fields.');
      const firstKey = Object.keys(e)[0];
      if (firstKey === 'meeting_type' || firstKey === 'officer' || firstKey === 'agenda') goStep(1);
      scrollToSection(firstKey);
      return;
    }

    setSubmitError(null);
    savingRef.current = true;
    setLoading(true);
    try {
      const payload: Record<string, any> = {
        agenda: formData.agenda.trim(),
        meeting_date: formData.meeting_date,
        meeting_time: formData.meeting_time,
        duration: formData.duration,
        location: formData.location,
        status: formData.status_flag || 'Scheduled',
        status_flag: formData.status_flag || 'Scheduled',
        officer_type: formData.officer_type,
        officer_name: formData.officer_name,
        officer_id: formData.officer_id,
        designation: formData.designation,
        department: formData.department,
        officer_category: formData.officer_category,
        contact_number: formData.contact_number,
        email: formData.email,
        address: formData.address,
        website: formData.website,
        cadre: formData.cadre,
        state: formData.state,
        batch_year: formData.batch_year,
        current_position: formData.current_position,
        previous_postings: formData.previous_postings,
        date_of_birth: formData.date_of_birth,
        priority: formData.priority,
        meeting_type: formData.meeting_type,
        meeting_place: formData.meeting_place,
        follow_up_date: formData.follow_up_date,
        follow_up_notes: formData.follow_up_notes.trim(),
        attendees: Array.from(new Set([
          ...attendeeList,
          ...extraOfficers.map((o) => o.email || '').filter(Boolean),
        ])).join(', '),
        send_invite: formData.send_invite,
        sync_gcal: formData.sync_gcal,
        add_meet: formData.add_meet,
        created_by: formData.created_by,
        city: formData.city.trim(),
      };

      /* never overwrite saved notes with '' before they've loaded */
      if (editingId && !notesReadyRef.current && !payload.follow_up_notes) {
        delete payload.follow_up_notes;
      }

      let rec: any = editingId
        ? await pb.collection('meetings').update(editingId, payload)
        : await pb.collection('meetings').create(payload);

      /* follow_up_notes — make sure it actually landed on the record */
      if ('follow_up_notes' in payload && (rec?.follow_up_notes ?? '') !== payload.follow_up_notes) {
        rec = await pb.collection('meetings').update(rec.id, { follow_up_notes: payload.follow_up_notes });
        if ((rec?.follow_up_notes ?? '') !== payload.follow_up_notes) {
          showToast('Follow-up notes could not be saved — check the follow_up_notes field in the meetings collection', 'error');
        }
      }

      await syncDocuments(rec.id);

      /* The meeting is saved — close right away. Google Calendar / Meet and the
         invite emails can take several seconds, so they finish in the background
         and report back with a second toast (the list picks up the Meet link live). */
      const hasAutomations = formData.sync_gcal || formData.add_meet || formData.send_invite;
      showToast(
        `${editingId ? 'Meeting updated' : 'Meeting created'}${hasAutomations ? ' — calendar & invites are being sent in the background' : ''}`,
        'success',
      );
      onSavedMeeting?.({ ...payload, id: rec.id, __isNew: !editingId });
      onSuccess();
      onClose();

      if (hasAutomations) {
        runAutomations(rec.id, payload)
          .then((failures) => {
            if (failures.length) showToast(failures.join(' · '), 'error');
            else showToast(`Calendar & invites done — ${payload.agenda || 'meeting'}`, 'success');
          })
          .catch((e) => showToast(`Calendar / invites failed: ${e?.message || 'unknown error'}`, 'error'));
      }
    } catch (err: any) {
      /* the PocketBase hook rejected it — someone booked this slot
         moments ago. Reload busy slots so suggestions appear. */
      if (isSlotConflictError(err)) {
        busy.refresh();
        setErrors((p) => ({ ...p, time: slotConflictMessage(err) }));
        setSubmitError('Someone just booked this slot — pick one of the free slots below.');
        scrollToSection('time');
      } else {
        setSubmitError(err?.message || 'Something went wrong. Please try again.');
      }
    } finally {
      setLoading(false);
      savingRef.current = false;
    }
  }

  /* ---------------- render ---------------- */

  if (!isOpen) return null;

  return (
    <div className="cmp-root">
      <Styles />
      {/* overlay */}
      <div className="c-overlay fixed inset-0 z-[70] bg-slate-900/50 backdrop-blur-[2px]" onClick={onClose} />

      {/* panel */}
      <div className="c-panel fixed right-0 top-0 z-[80] flex h-full w-full flex-col bg-slate-50 shadow-2xl sm:max-w-xl lg:max-w-2xl">
        {/* header */}
        <div className="flex items-center gap-3 border-b border-slate-200 bg-white px-4 py-3.5 sm:px-5">
          {step === 2 ? (
            <button type="button" onClick={() => goStep(1)}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700">
              <ArrowLeft className="h-4 w-4" />
            </button>
          ) : (
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-violet-100 text-violet-600">
              <Sparkles className="h-4 w-4" />
            </span>
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-bold text-slate-900">
              {isEditMode ? 'Edit meeting' : duplicateFrom?.id ? 'New meeting (copy)' : 'Create meeting'}
            </p>
            <p className="truncate text-[11px] text-slate-400">
              {step === 1 ? 'Who is it with & what about?' : 'Date, time & details'}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {[1, 2].map((s) => (
              <span key={s} className={`h-1.5 rounded-full transition-all ${step === s ? 'w-5 bg-violet-600' : 'w-1.5 bg-slate-200'}`} />
            ))}
          </div>
          <button type="button" onClick={onClose}
            className="shrink-0 rounded-xl p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* scroll area */}
        <div ref={scrollRef} className="nice-scroll flex-1 overflow-y-auto px-4 py-4 sm:px-5">
          {submitError && (
            <div className="c-fade-in mb-4 flex items-start gap-2 rounded-2xl border border-rose-200 bg-rose-50 px-3.5 py-3">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-500" />
              <p className="text-xs font-medium text-rose-700">{submitError}</p>
            </div>
          )}

          {/* ============================ STEP 1 ============================ */}
          {step === 1 && (
            <div className="space-y-4">
              {/* meeting type FIRST — decides the participant list */}
              <div id="cmp-sec-type" className="c-fade-up">
                <SectionHead icon={Users} title="Who is this meeting with?" required
                  sub="Internal shows employees · External shows officers" />
                <div className="grid grid-cols-2 gap-2">
                  {MEETING_TYPES.map((t) => {
                    const active = formData.meeting_type === t.value;
                    return (
                      <button key={t.value} type="button"
                        onClick={() => handleMeetingTypeChange(t.value)}
                        className={`flex items-center gap-2.5 rounded-2xl border p-3 text-left transition-all duration-150 active:scale-[.98] ${
                          active ? `${t.sel} ring-2 ring-violet-500/20` : 'border-slate-200 bg-white hover:border-slate-300'
                        }`}>
                        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
                          active ? `${t.txt} bg-white` : 'bg-slate-100 text-slate-400'
                        }`}>
                          <t.icon className="h-4 w-4" />
                        </span>
                        <span className="min-w-0">
                          <span className={`block text-[13px] font-semibold ${active ? t.txt : 'text-slate-700'}`}>{t.value}</span>
                          <span className="block truncate text-[11px] text-slate-400">{t.hint}</span>
                        </span>
                        {active && <Check className={`ml-auto h-4 w-4 shrink-0 ${t.txt}`} />}
                      </button>
                    );
                  })}
                </div>
                <FieldError message={errors.meeting_type} />
              </div>

              {/* participant picker — pool depends on meeting type */}
              <div id="cmp-sec-officer" className="c-fade-up">
                <SectionHead icon={User}
                  title={!formData.meeting_type ? 'Participant' : isInternal ? 'Choose employee' : 'Choose officer'}
                  required
                  sub={!formData.meeting_type
                    ? 'Pick a meeting type above first'
                    : isInternal ? 'People in your office' : 'IAS, IPS and other contacts'} />

                {!formData.meeting_type ? (
                  <div className="c-fade-in flex flex-col items-center gap-2 rounded-2xl border border-dashed border-slate-200 py-8 text-center">
                    <Users className="h-5 w-5 text-slate-300" />
                    <p className="text-xs text-slate-400">Choose “Internal” or “External” above to see who you can add.</p>
                  </div>
                ) : !selectedOfficer ? (
                  <div key={`list-${formData.meeting_type}`} className="c-fade-in">
                    {isExternal && (
                      <div className="mb-2 flex flex-wrap gap-1.5">
                        {(['All', 'IAS', 'IPS', 'Other'] as const).map((t) => (
                          <button key={t} type="button" onClick={() => setTypeFilter(t)}
                            className={`rounded-full border px-3 py-1 text-[11px] font-semibold transition-all active:scale-95 ${
                              typeFilter === t ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300'
                            }`}>{t}</button>
                        ))}
                      </div>
                    )}

                    <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3.5 transition focus-within:border-violet-400 focus-within:ring-4 focus-within:ring-violet-500/10">
                      <Search className="h-4 w-4 shrink-0 text-slate-400" />
                      <input
                        ref={searchRef}
                        value={officerSearch}
                        onChange={(e) => setOfficerSearch(e.target.value)}
                        placeholder={`Search ${isInternal ? 'employees' : 'officers'} by name, designation…`}
                        className="w-full bg-transparent py-2.5 text-sm outline-none placeholder:text-slate-400"
                      />
                    </div>

                    <div className="mt-2">
                      {participantLoading ? (
                        <div className="flex items-center justify-center gap-2 py-8 text-sm text-slate-400">
                          <Loader2 className="h-4 w-4 animate-spin" /> Loading {isInternal ? 'employees' : 'directory'}…
                        </div>
                      ) : filteredOfficers.length === 0 ? (
                        <div className="rounded-2xl border border-dashed border-slate-200 py-8 text-center">
                          <User className="mx-auto h-5 w-5 text-slate-300" />
                          <p className="mt-1.5 text-xs text-slate-400">
                            No {isInternal ? 'employees' : 'officers'} found{officerSearch ? ` for “${officerSearch}”` : ''}
                          </p>
                        </div>
                      ) : (
                        <div className="nice-scroll max-h-72 space-y-1.5 overflow-y-auto pr-0.5">
                          {filteredOfficers.map((o) => (
                            <button key={o.id} type="button" onClick={() => handleSelectOfficer(o)}
                              className="flex w-full items-center gap-3 rounded-2xl border border-slate-200 bg-white p-2.5 text-left transition-all hover:border-violet-300 hover:bg-violet-50/40 active:scale-[.99]">
                              <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-[11px] font-bold ${OFFICER_BADGE[o.type]?.avatar ?? OFFICER_BADGE.Other.avatar}`}>
                                {initialsOf(o.name || '?')}
                              </span>
                              <span className="min-w-0 flex-1">
                                <span className="flex items-center gap-1.5">
                                  <span className="truncate text-[13px] font-semibold text-slate-800">{o.name}</span>
                                  {isExternal && (
                                    <span className={`shrink-0 rounded-full border px-1.5 py-0.5 text-[9px] font-bold ${OFFICER_BADGE[o.type]?.chip ?? OFFICER_BADGE.Other.chip}`}>
                                      {o.type}
                                    </span>
                                  )}
                                </span>
                                <span className="block truncate text-[11px] text-slate-400">
                                  {[o.designation, o.department].filter(Boolean).join(' · ') || '—'}
                                </span>
                              </span>
                              <ChevronRight className="h-4 w-4 shrink-0 text-slate-300" />
                            </button>
                          ))}
                        </div>
                      )}
                      {officersTruncated && (
                        <p className="mt-1.5 text-center text-[10px] text-slate-400">
                          {isInternal
                            ? `Showing first ${LIST_CAP} — type to search the full employee list`
                            : `Showing a few of ${iasTotal.toLocaleString('en-IN')} IAS officers — type a name, post, cadre or state to search them all`}
                        </p>
                      )}
                      {iasSearching && !isInternal && (
                        <p className="mt-1.5 flex items-center justify-center gap-1.5 text-[10px] text-slate-400">
                          <Loader2 className="h-3 w-3 animate-spin" /> Searching the IAS directory…
                        </p>
                      )}

                      <button type="button" onClick={startManualOfficer}
                        className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-2xl border border-dashed border-slate-300 py-2.5 text-xs font-semibold text-slate-500 transition-colors hover:border-violet-400 hover:text-violet-600">
                        <Plus className="h-3.5 w-3.5" /> Add manually
                      </button>
                    </div>
                  </div>
                ) : (
                  /* selected participant card */
                  <div className="rounded-2xl border border-violet-200 bg-violet-50/60 p-3">
                    <div className="flex items-start gap-3">
                      <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-xs font-bold ${OFFICER_BADGE[selectedOfficer.type]?.avatar ?? OFFICER_BADGE.Other.avatar}`}>
                        {initialsOf(selectedOfficer.name || '?')}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <p className="truncate text-sm font-bold text-slate-900">{selectedOfficer.name || 'New contact'}</p>
                          <span className={`shrink-0 rounded-full border px-1.5 py-0.5 text-[9px] font-bold ${OFFICER_BADGE[selectedOfficer.type]?.chip ?? OFFICER_BADGE.Other.chip}`}>
                            {selectedOfficer.type}
                          </span>
                        </div>
                        {formData.designation && <p className="truncate text-[11px] text-slate-500">{formData.designation}</p>}
                        {(formData.contact_number || formData.email) && (
                          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
                            {formData.contact_number && (
                              <span className="flex items-center gap-1 text-[11px] text-slate-500">
                                <Phone className="h-3 w-3" />{formData.contact_number}
                              </span>
                            )}
                            {formData.email && (
                              <span className="flex items-center gap-1 text-[11px] text-slate-500">
                                <Mail className="h-3 w-3" />{formData.email}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                      <div className="flex shrink-0 gap-1">
                        <button type="button" onClick={() => setShowOfficerEdit((v) => !v)} title="Edit details"
                          className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-white hover:text-violet-600">
                          <Edit2 className="h-3.5 w-3.5" />
                        </button>
                        <button type="button" onClick={handleClearOfficer} title="Remove"
                          className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-white hover:text-rose-600">
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                    {showOfficerEdit && (
                      <div className="mt-3 grid grid-cols-1 gap-2 border-t border-violet-100 pt-3 sm:grid-cols-2">
                        {OFFICER_EDIT_FIELDS.map((f) => (
                          <label key={f.key} className="block">
                            <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-400">{f.label}</span>
                            <input
                              value={(formData as any)[f.key] ?? ''}
                              onChange={(e) => handleOfficerField(f.key, e.target.value)}
                              className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-800 outline-none transition focus:border-violet-400 focus:ring-2 focus:ring-violet-500/10"
                            />
                          </label>
                        ))}
                      </div>
                    )}
                  </div>
                )}
                <FieldError message={errors.officer} />
              </div>

              {/* agenda lives in Step 1 */}
              <div id="cmp-sec-agenda" className="c-fade-up">
                <SectionHead icon={Edit2} title="Agenda" required />
                <textarea
                  value={formData.agenda}
                  onChange={(e) => {
                    setFormData((prev) => ({ ...prev, agenda: e.target.value }));
                    if (errors.agenda) setErrors((p) => ({ ...p, agenda: '' }));
                  }}
                  rows={3}
                  placeholder="What is this meeting about?"
                  className={`${inputCls} resize-y ${errors.agenda ? inputErr : ''}`}
                />
                <FieldError message={errors.agenda} />
              </div>
            </div>
          )}

          {/* ============================ STEP 2 ============================ */}
          {step === 2 && (
            <div className="space-y-4">
              {/* summary pills */}
              <div className="flex flex-wrap items-center gap-2">
                {selectedOfficer?.name && <Pill><User className="h-3.5 w-3.5" />{selectedOfficer.name}</Pill>}
                {formData.agenda.trim() && (
                  <Pill><Edit2 className="h-3.5 w-3.5" />{formData.agenda.length > 28 ? `${formData.agenda.slice(0, 28)}…` : formData.agenda}</Pill>
                )}
                {formData.meeting_date && <Pill><Calendar className="h-3.5 w-3.5" />{prettyDate(formData.meeting_date)}</Pill>}
                {timeRangeLabel && <Pill><Clock className="h-3.5 w-3.5" />{timeRangeLabel}</Pill>}
                {durationNum > 0 && <Pill><Timer className="h-3.5 w-3.5" />{formatDuration(durationNum)}</Pill>}
              </div>
              {crossesMidnight && (
                <p className="flex items-center gap-1.5 text-[11px] font-medium text-amber-600">
                  <AlertCircle className="h-3.5 w-3.5" /> This meeting crosses midnight.
                </p>
              )}

              {/* date */}
              <div id="cmp-sec-date" className="c-fade-up">
                <SectionHead icon={Calendar} title="Date" required size="lg" />
                <WeekStrip value={formData.meeting_date} onChange={handleDateChange} markedDates={dateMarks} />
                <FieldError message={errors.date} />
              </div>

              {/* time & duration SIDE-BY-SIDE */}
              <div id="cmp-sec-time" className="c-fade-up">
                <SectionHead icon={Clock} title="Time & duration" required size="lg" />
                <div className="grid gap-3 sm:grid-cols-2">
                  {/* Time */}
                  <div className="rounded-2xl border border-slate-200 bg-white p-3.5">
                    <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-slate-500">
                      <Clock className="h-4 w-4" /> Time
                    </p>
                    <TimeSlotPicker
                      value={formData.meeting_time}
                      onChange={handleTimeChange}
                      meetingDate={formData.meeting_date}
                      busyAt={slotBlocking ? busyAt : undefined}
                    />
                    <FieldError message={errors.time} />
                  </div>

                  {/* Duration */}
                  <div className="rounded-2xl border border-slate-200 bg-white p-3.5">
                    <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-slate-500">
                      <Timer className="h-4 w-4" /> Duration
                    </p>
                    <div className="flex flex-wrap items-center gap-1.5">
                      {PRESET_DURATIONS.map((m) => {
                        const active = !isCustomMode && Number(formData.duration) === m;
                        const blocked = durationBlockReason(freeAfter, m);
                        if (blocked && !active) {
                          return (
                            <button key={m} type="button" disabled title={blocked}
                              className="cursor-not-allowed rounded-full border border-dashed border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold tabular-nums text-slate-300 line-through">
                              {formatDuration(m)}
                            </button>
                          );
                        }
                        return (
                          <button key={m} type="button" onClick={() => handlePresetDuration(m)}
                            className={`rounded-full border px-3 py-1.5 text-xs font-semibold tabular-nums transition-all active:scale-95 ${
                              active
                                ? (blocked ? 'border-rose-500 bg-rose-500 text-white shadow-sm' : 'border-violet-600 bg-violet-600 text-white shadow-sm')
                                : 'border-slate-200 bg-white text-slate-600 hover:border-violet-300'
                            }`}>
                            {formatDuration(m)}
                          </button>
                        );
                      })}
                      {!isCustomMode && (
                        <button type="button" onClick={handleOpenCustom}
                          className="rounded-full border border-dashed border-slate-300 px-3 py-1.5 text-[11px] font-semibold text-slate-500 transition-colors hover:border-violet-400 hover:text-violet-600">
                          Custom
                        </button>
                      )}
                    </div>
                    {isCustomMode && (
                      <div className="c-fade-in mt-2 flex flex-wrap items-center gap-2">
                        <input type="number" min={0} max={23} value={customHours}
                          onChange={(e) => handleCustomDuration(clampInt(e.target.value, 23), customMinutes)}
                          placeholder="H" className={miniNumCls} />
                        <span className="text-xs font-semibold text-slate-400">hr</span>
                        <input type="number" min={0} max={59} value={customMinutes}
                          onChange={(e) => handleCustomDuration(customHours, clampInt(e.target.value, 59))}
                          placeholder="M" className={miniNumCls} />
                        <span className="text-xs font-semibold text-slate-400">min</span>
                        <button type="button" onClick={handleCustomDone}
                          className="ml-auto inline-flex items-center gap-1 rounded-xl bg-slate-900 px-3 py-1.5 text-[11px] font-semibold text-white transition hover:bg-slate-800">
                          <Check className="h-3.5 w-3.5" /> Done
                        </button>
                      </div>
                    )}
                    <FieldError message={errors.duration} />
                    {freeAfter?.next && freeAfter.minutes > 0 && (
                      <p className="mt-2 flex items-center gap-1 text-[11px] text-slate-500">
                        <Timer className="h-3 w-3 text-violet-400" />
                        Free for {formatDuration(freeAfter.minutes)} — next: “{freeAfter.next.agenda}” at {toHHMM(freeAfter.next.start)}
                      </p>
                    )}
                  </div>
                </div>

                {/* conflict card + participant heads-up */}
                <ConflictCard
                  date={formData.meeting_date}
                  conflicts={conflicts}
                  suggestions={suggestions}
                  onPick={applySuggestion}
                />
                <ParticipantNotice meetings={participantClashes} />
              </div>

              {/* place */}
              <div id="cmp-sec-place" className="c-fade-up">
                <SectionHead icon={MapPin} title="Place" required size="lg" />
                <div className="grid grid-cols-2 gap-2">
                  {PLACE_OPTIONS.map((p) => {
                    const active = formData.meeting_place === p.value;
                    return (
                      <button key={p.value} type="button" onClick={() => handlePlace(p.value)}
                        className={`flex items-center gap-2.5 rounded-2xl border p-3 text-left transition-all duration-150 active:scale-[.98] ${
                          active ? 'border-violet-300 bg-violet-50 ring-2 ring-violet-500/20' : 'border-slate-200 bg-white hover:border-slate-300'
                        }`}>
                        <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${
                          active ? 'bg-white text-violet-600' : 'bg-slate-100 text-slate-400'
                        }`}>
                          <p.icon className="h-4 w-4" />
                        </span>
                        <span className="min-w-0">
                          <span className={`block text-sm font-semibold ${active ? 'text-violet-700' : 'text-slate-700'}`}>{p.value}</span>
                          <span className="block truncate text-xs text-slate-400">{p.hint}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
                <input
                  value={formData.location}
                  onChange={(e) => setFormData((prev) => ({ ...prev, location: e.target.value }))}
                  onBlur={handleLocationBlur}
                  placeholder={formData.meeting_place === 'Outside' ? 'Venue / address' : 'Room / floor (optional)'}
                  className={`${inputCls} mt-2`}
                />
                <input
                  list="cmp-city-options"
                  value={formData.city}
                  onChange={(e) => setFormData((prev) => ({ ...prev, city: e.target.value }))}
                  placeholder="City (e.g. Hyderabad, Dubai)"
                  className={`${inputCls} mt-2`}
                />
                <datalist id="cmp-city-options">
                  {CITIES.map((c) => <option key={c.key} value={c.label} />)}
                </datalist>
                {revisitCount > 0 && (
                  <p className="c-fade-in mt-2 flex items-center gap-1.5 rounded-xl bg-violet-50 px-3 py-2 text-[11px] font-semibold text-violet-700 ring-1 ring-inset ring-violet-500/15">
                    <Users className="h-3.5 w-3.5 shrink-0" />
                    You’ve met {revisitCount} {revisitCount === 1 ? 'person' : 'people'} in {cityLabel(formCityKey ?? '', formData.city)} before — we’ll suggest them after you save.
                  </p>
                )}
                <FieldError message={errors.place} />
              </div>

              {/* priority */}
              <div id="cmp-sec-priority" className="c-fade-up">
                <SectionHead icon={Flag} title="Priority" required size="lg" />
                <div className="grid grid-cols-3 gap-2">
                  {PRIORITIES.map((p) => {
                    const active = formData.priority === p.value;
                    return (
                      <button key={p.value} type="button" onClick={() => handlePriority(p.value)}
                        className={`flex items-center justify-center gap-1.5 rounded-2xl border py-3 text-sm font-semibold transition-all active:scale-95 ${
                          active ? `${p.bg} ${p.text} shadow-sm` : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300'
                        }`}>
                        <p.icon className="h-4 w-4" />
                        {p.value}
                        {active && <span className={`h-1.5 w-1.5 rounded-full ${p.dot}`} />}
                      </button>
                    );
                  })}
                </div>
                <FieldError message={errors.priority} />
              </div>

              {/* Follow up — relative + z-20 so the mini calendar popover
                  paints above the "More details" card below it */}
              <div id="cmp-sec-followup" className="c-fade-up relative z-20 rounded-2xl border border-slate-200 bg-white p-3.5">
                <SectionHead icon={Flag} title="Follow up" optional size="lg"
                  sub="Status, follow-up date & documents" />

                <p className="mb-1.5 text-[11px] font-semibold text-slate-500">
                  Status <span className="font-normal text-slate-400">(optional — Scheduled pre-selected)</span>
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {STATUS_FLAGS.map((s) => {
                    const active = formData.status_flag === s.value;
                    return (
                      <button key={s.value} type="button" onClick={() => handleStatusChange(s.value)}
                        className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-all active:scale-95 ${
                          active ? 'border-slate-900 bg-slate-900 text-white shadow-sm' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                        }`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
                        {s.value}
                      </button>
                    );
                  })}
                </div>

                <p className="mb-1.5 mt-3 text-[11px] font-semibold text-slate-500">
                  Follow-up date <span className="font-normal text-slate-400">(optional)</span>
                </p>
                <MiniDatePicker
                  value={formData.follow_up_date}
                  onChange={handleFollowUpChange}
                  min={followUpMin}
                />
                <p className="mt-1 text-[10px] text-slate-400">
                  Included in the Google Calendar sync when syncing is enabled.
                </p>
                <FieldError message={errors.follow_up} />

                <p className="mb-1.5 mt-3 text-[11px] font-semibold text-slate-500">Documents</p>
                <DocumentDropzone
                  existingDocs={existingDocs}
                  pendingDocs={pendingDocs}
                  onPick={handlePickDocs}
                  onRemoveExisting={removeExistingDoc}
                  onRemovePending={removePendingDoc}
                  fileUrl={meetingFileUrl}
                  uploading={uploading}
                  accept={ACCEPTED_DOCS}
                  maxMB={MAX_FILE_MB}
                />
              </div>

              {/* more details */}
              <div className="c-fade-up">
                <button type="button" onClick={() => setShowMoreDetails((v) => !v)}
                  className="flex w-full items-center justify-between rounded-2xl border border-slate-200 bg-white p-3 text-left transition-colors hover:border-slate-300">
                  <span className="flex items-center gap-2.5">
                    <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-100 text-slate-500">
                      <Plus className="h-3.5 w-3.5" />
                    </span>
                    <span>
                      <span className="block text-[13px] font-semibold text-slate-800">More details</span>
                      <span className="block text-[11px] text-slate-400">Additional officers, attendees & integrations</span>
                    </span>
                  </span>
                  <ChevronRight className={`h-4 w-4 text-slate-400 transition-transform ${showMoreDetails ? 'rotate-90' : ''}`} />
                </button>

                {showMoreDetails && (
                  <div className="c-fade-in mt-2 space-y-3">
                    {/* follow-up notes */}
                    <div className="rounded-2xl border border-slate-200 bg-white p-3">
                      <p className="mb-2 text-[11px] font-semibold text-slate-500">
                        Follow-up notes <span className="font-normal text-slate-400">(optional)</span>
                      </p>
                      <textarea
                        value={formData.follow_up_notes}
                        onChange={(e) => setFormData((prev) => ({ ...prev, follow_up_notes: e.target.value }))}
                        rows={3}
                        placeholder="Next steps, things to follow up on…"
                        className={`${inputCls} resize-y`}
                      />
                    </div>

                    {/* additional officers */}
                    <div className="rounded-2xl border border-slate-200 bg-white p-3">
                      <p className="mb-2 text-[11px] font-semibold text-slate-500">
                        Additional {isInternal ? 'employees' : 'officers'}
                      </p>
                      {extraOfficers.length > 0 && (
                        <div className="mb-2 flex flex-wrap gap-1.5">
                          {extraOfficers.map((o) => (
                            <span key={o.id} className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 py-1 pl-2.5 pr-1 text-[11px] font-semibold text-slate-700">
                              {o.name}
                              <button type="button" onClick={() => handleRemoveExtraOfficer(o)}
                                className="rounded-full p-0.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600">
                                <X className="h-3 w-3" />
                              </button>
                            </span>
                          ))}
                        </div>
                      )}
                      <input
                        value={extraSearch}
                        onChange={(e) => setExtraSearch(e.target.value)}
                        placeholder="Search directory to add more…"
                        className={inputCls}
                      />
                      {extraCandidates.length > 0 && (
                        <div className="mt-1.5 space-y-1 rounded-xl border border-slate-200 bg-white p-1.5">
                          {extraCandidates.map((o) => (
                            <button key={o.id} type="button" onClick={() => handleAddExtraOfficer(o)}
                              className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-violet-50">
                              <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-lg text-[9px] font-bold ${OFFICER_BADGE[o.type].avatar}`}>
                                {initialsOf(o.name || '?')}
                              </span>
                              <span className="min-w-0 flex-1">
                                <span className="block truncate text-xs font-semibold text-slate-800">{o.name}</span>
                                <span className="block truncate text-[10px] text-slate-400">{o.designation}</span>
                              </span>
                              <Plus className="h-3.5 w-3.5 shrink-0 text-violet-500" />
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* attendees */}
                    <div className="rounded-2xl border border-slate-200 bg-white p-3">
                      <p className="mb-2 text-[11px] font-semibold text-slate-500">Other attendees (emails)</p>
                      {attendeeList.length > 0 && (
                        <div className="mb-2 flex flex-wrap gap-1.5">
                          {attendeeList.map((a) => (
                            <span key={a} className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 py-1 pl-2.5 pr-1 text-[11px] font-semibold text-slate-700">
                              {a}
                              <button type="button" onClick={() => removeAttendee(a)}
                                className="rounded-full p-0.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600">
                                <X className="h-3 w-3" />
                              </button>
                            </span>
                          ))}
                        </div>
                      )}
                      <div className="flex gap-1.5">
                        <input
                          value={attendeeInput}
                          onChange={(e) => setAttendeeInput(e.target.value)}
                          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addAttendee(); } }}
                          placeholder="name@example.com"
                          className={inputCls}
                        />
                        <button type="button" onClick={addAttendee}
                          className="shrink-0 rounded-xl bg-slate-900 px-3 text-xs font-semibold text-white transition hover:bg-slate-800">
                          Add
                        </button>
                      </div>
                    </div>

                    {/* toggles */}
                    <div className="space-y-2">
                      <ToggleRow icon={Mail} title="Send invite" description="Email the agenda to participants"
                        checked={formData.send_invite} onChange={(v) => setFormData((p) => ({ ...p, send_invite: v }))} />
                      <ToggleRow icon={Calendar} title="Sync to Google Calendar" description="Create / update the calendar event"
                        checked={formData.sync_gcal} onChange={(v) => setFormData((p) => ({ ...p, sync_gcal: v }))} />
                      <ToggleRow icon={Video} title="Add Google Meet link" description="Attach a Meet link to the event"
                        checked={formData.add_meet} onChange={(v) => setFormData((p) => ({ ...p, add_meet: v }))} />
                    </div>

                    {(formData.meet_link || formData.gcal_link) && (
                      <a href={formData.meet_link || formData.gcal_link} target="_blank" rel="noreferrer"
                        className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-semibold text-violet-600 transition-colors hover:bg-violet-50">
                        <Video className="h-4 w-4" /> Open meeting link
                      </a>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* footer */}
        <div className="border-t border-slate-200 bg-white px-4 py-3 sm:px-5">
          {step === 1 ? (
            <button type="button" onClick={handleNext}
              className="w-full inline-flex items-center justify-center gap-2 rounded-2xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white shadow-lg transition hover:bg-slate-800 active:scale-[.99]">
              Next: Details <ArrowRight className="h-4 w-4" />
            </button>
          ) : (
            <div className="flex gap-2">
              <button type="button" onClick={() => goStep(1)}
                className="inline-flex items-center justify-center gap-1.5 rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-600 transition hover:bg-slate-50">
                <ArrowLeft className="h-4 w-4" /> Back
              </button>
              <button type="button" onClick={handleSubmit} disabled={loading}
                className="flex-1 inline-flex items-center justify-center gap-2 rounded-2xl bg-violet-600 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-violet-500/25 transition hover:bg-violet-700 active:scale-[.99] disabled:opacity-60">
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                {isEditMode ? 'Save changes' : 'Create meeting'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
