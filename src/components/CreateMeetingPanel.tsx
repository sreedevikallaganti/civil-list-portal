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
  ChevronLeft, ChevronRight, ChevronDown, Loader2, Users, Mail, Phone, User,
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
import TravelTimeNotice from '@/components/meetings/TravelTimeNotice';
import { useGoogleEnabled } from '@/contexts/OrgContext';
import { useSenders } from '@/lib/useSenders';
import SendAsPicker, { useSendAs } from '@/components/SendAsPicker';
import { useZoomEnabled } from '@/lib/useZoom';
import { removeZoomMeeting } from '@/lib/apiClient';
import { loadDirectoryEmployees } from '@/components/employees/employee-api';
import { associateSummary } from '@/lib/associates';
import { listAssociates, listFields } from '@/lib/associatesApi';
import AssociateDetails from '@/components/associates/AssociateDetails';
import { showShareMeeting } from '@/components/meetings/ShareMeetingHost';
import type { ManualShare } from '@/lib/meetingShare';
import { videoLabel, videoPlatform, type VideoPlatform } from '@/lib/videoCall';
import { CITIES, cityKey, cityLabel, findCity } from '@/lib/cities';
import { findPeopleToRevisit, personKey } from '@/lib/revisit';
import { AGENDA_MAX, cleanName, nameError, phoneError, textError } from '@/lib/validation';
import PhoneInput from '@/components/PhoneInput';
import { logActivity, meetingLabel } from '@/lib/activity';
import { parseParticipants, PARTICIPANTS_FIELD_HINT, PARTICIPANTS_FIELD_MISSING, type Participant } from '@/lib/participants';
import BatchmatesCard from '@/components/meetings/BatchmatesCard';
import CreateOfficerPanel from '@/components/CreateOfficerPanel';
import type { BatchOfficer } from '@/lib/batchmates';
import { OFFICER_COLLECTION, OFFICER_SERVICES, officerSearchFilter, serviceOf, toDirectoryOfficer, type OfficerService } from '@/lib/officerDirectory';

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
.c-progress { background:linear-gradient(90deg,var(--color-violet-400) 25%,var(--color-violet-600) 40%,var(--color-violet-400) 55%); background-size:200% 100%; animation:cShimmer 1.2s linear infinite }
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
  type: OfficerService | 'Other';
  cadre?: string; state?: string; contact_number?: string; email?: string;
  department?: string; current_position?: string; batch_year?: string;
  /* from the Associates list (lib/associates) — saved as participant type "Associate" */
  kind?: 'Associate';
  /* every filled-in detail of an associate, for "view details" */
  details?: { label: string; value: string }[];
}

/* --------------------------- Constants --------------------------- */

const OFFICER_BADGE: Record<string, { chip: string; avatar: string }> = {
  IAS:   { chip: 'bg-sky-50 text-sky-700 border-sky-200',     avatar: 'bg-sky-100 text-sky-700' },
  IPS:   { chip: 'bg-violet-50 text-violet-700 border-violet-200', avatar: 'bg-violet-100 text-violet-700' },
  IFS:   { chip: 'bg-emerald-50 text-emerald-700 border-emerald-200', avatar: 'bg-emerald-100 text-emerald-700' },
  IRS:   { chip: 'bg-rose-50 text-rose-700 border-rose-200', avatar: 'bg-rose-100 text-rose-700' },
  Other: { chip: 'bg-slate-100 text-slate-600 border-slate-200',  avatar: 'bg-slate-200 text-slate-600' },
};

const PRIORITIES = [
  { value: 'Low',    icon: Feather,  bg: 'bg-emerald-50 border-emerald-300', text: 'text-emerald-700', dot: 'bg-emerald-500' },
  { value: 'Medium', icon: Activity, bg: 'bg-amber-50 border-amber-300',     text: 'text-amber-700',   dot: 'bg-amber-500' },
  { value: 'High',   icon: Zap,      bg: 'bg-rose-50 border-rose-300',       text: 'text-rose-700',    dot: 'bg-rose-500' },
];

/* filter chips of the "Add more participants" list (external meetings) */
type ExtraFilter = 'All' | OfficerService | 'Other' | 'Associates' | 'Employees';
const EXTRA_FILTERS: ExtraFilter[] = ['All', ...OFFICER_SERVICES, 'Other', 'Associates', 'Employees'];

/* associates (directors and senior officials, /associates) get their own colour and label */
const ASSOCIATE_BADGE = { chip: 'bg-indigo-50 text-indigo-700 border-indigo-200', avatar: 'bg-indigo-100 text-indigo-700' };
const badgeOf = (o: Officer) => (o.kind === 'Associate' ? ASSOCIATE_BADGE : OFFICER_BADGE[o.type] ?? OFFICER_BADGE.Other);
const labelOf = (o: Officer) => (o.kind === 'Associate' ? 'Associate' : o.type);

/* "Create new …" in the participant picker → CreateOfficerPanel locked to that type */
const NEW_PERSON_OPTIONS: { type: OfficerService | 'Other'; label: string }[] = [
  { type: 'IAS', label: 'New IAS officer' },
  { type: 'IPS', label: 'New IPS officer' },
  { type: 'IFS', label: 'New IFS officer' },
  { type: 'IRS', label: 'New IRS officer' },
  { type: 'Other', label: 'New contact' },
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
  send_invite: true, sync_gcal: true,
  /* video call: Google Meet (needs Google) or Zoom (needs ZOOM_* keys) — the link is kept in meet_link */
  video_call: 'meet' as VideoPlatform,
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

/* a first page of each service is loaded up front; everyone else is found by server-side search */
const IAS_PAGE = 40;

const mapOfficer = (rec: any, type: Officer['type']): Officer => {
  const o = type === 'Other' ? rec : toDirectoryOfficer(rec, type);
  return {
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
  batch_year: o.batch_year ? String(o.batch_year) : '',
  };
};

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

/* Video call: none / Google Meet / Zoom — only the services that are set up are offered */
function VideoCallChoice({ value, meet, zoom, onChange }: {
  value: VideoPlatform; meet: boolean; zoom: boolean; onChange: (v: VideoPlatform) => void;
}) {
  const options: { v: VideoPlatform; label: string; hint: string }[] = [
    { v: 'none', label: 'None', hint: 'In person or phone' },
    ...(meet ? [{ v: 'meet' as const, label: 'Google Meet', hint: 'Link shown right after saving — copy or WhatsApp it' }] : []),
    ...(zoom ? [{ v: 'zoom' as const, label: 'Zoom', hint: 'Link shown right after saving — copy or WhatsApp it' }] : []),
  ];
  const current = options.find((o) => o.v === value) ?? options[0];
  return (
    <div className={`rounded-2xl border p-3 transition-all duration-150 ${current.v !== 'none' ? 'border-violet-200 bg-violet-50/50' : 'border-slate-200 bg-white'}`}>
      <div className="flex items-center gap-3">
        <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${current.v !== 'none' ? 'bg-violet-100 text-violet-600' : 'bg-slate-100 text-slate-400'}`}>
          <Video className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <p className="text-[13px] font-semibold text-slate-800">Video call</p>
          <p className="truncate text-[11px] text-slate-400">{current.hint}</p>
        </div>
      </div>
      <div role="radiogroup" aria-label="Video call" className="mt-2.5 grid gap-1.5" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
        {options.map((o) => (
          <button key={o.v} type="button" role="radio" aria-checked={current.v === o.v} onClick={() => onChange(o.v)}
            className={`rounded-xl px-2 py-1.5 text-xs font-semibold transition-colors ${
              current.v === o.v ? 'bg-slate-900 text-white' : 'bg-white text-slate-600 ring-1 ring-inset ring-slate-200 hover:text-violet-700'
            }`}>
            {o.label}
          </button>
        ))}
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
  const [typeFilter, setTypeFilter] = useState<'All' | OfficerService | 'Other' | 'Associates'>('All');
  const [selectedOfficer, setSelectedOfficer] = useState<Officer | null>(null);
  const [showOfficerEdit, setShowOfficerEdit] = useState(false);

  /* employees pool for Internal meetings */
  const [employees, setEmployees] = useState<Officer[]>([]);
  /* associates (the /associates list) — participants of External meetings */
  const [associates, setAssociates] = useState<Officer[]>([]);
  /* which associate's details are unfolded in the lists */
  const [openDetails, setOpenDetails] = useState<string | null>(null);
  const [employeeLoading, setEmployeeLoading] = useState(false);

  /* "Create new IAS / IPS / contact" opened from the picker — saved to the directory, then selected */
  const [newPersonType, setNewPersonType] = useState<Officer['type'] | null>(null);
  /* who the new person becomes: the main participant, or one more participant */
  const [newPersonFor, setNewPersonFor] = useState<'main' | 'extra'>('main');
  const createPerson = (type: Officer['type'], target: 'main' | 'extra') => { setNewPersonFor(target); setNewPersonType(type); };

  /* "Add more participants" list filter — like the main picker */
  const [extraFilter, setExtraFilter] = useState<ExtraFilter>('All');
  /* the "Add more participants" list is closed until clicked — keeps the form short */
  const [extrasOpen, setExtrasOpen] = useState(false);

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
  /* the status as loaded for edit — a change to Cancelled / Completed emails the participants */
  const originalStatusRef = useRef<string>('');

  const goStep = (s: 1 | 2) => { stepRef.current = s; setStep(s); };

  /* ---------------- data loading (with cache) ---------------- */

  async function fetchOfficers() {
    /* show the cached directory instantly, but always re-fetch so edits to
       officers/contacts (e.g. a corrected email) appear without a page reload */
    const cached = officerCache && Date.now() - officerCache.ts < OFFICER_CACHE_TTL;
    if (cached) setOfficers(officerCache!.data);
    else setOfficerLoading(true);
    try {
      /* each service has thousands of officers — load one page of each now, the rest via search (searchIas) */
      const [pages, others] = await Promise.all([
        Promise.all(OFFICER_SERVICES.map((s) => pb.collection(OFFICER_COLLECTION[s]).getList(1, IAS_PAGE, { sort: 'name' }))),
        pb.collection('other_contacts').getFullList({ sort: 'name' }),
      ]);
      setIasTotal(pages.reduce((n, p) => n + p.totalItems, 0));
      const data = [
        ...pages.flatMap((p, i) => p.items.map((o: any) => mapOfficer(o, OFFICER_SERVICES[i]))),
        ...others.map((o: any) => mapOfficer(o, 'Other')),
      ];
      officerCache = { data, ts: Date.now() };
      setOfficers((prev) => mergeOfficers(data, prev.filter((o) => o.type !== 'Other')));
    } catch (error) {
      console.error('Failed to load directory:', error);
    } finally {
      setOfficerLoading(false);
    }
  }

  async function fetchAssociates() {
    try {
      const [fields, people] = await Promise.all([listFields(), listAssociates()]);
      setAssociates(people.map((a) => {
        const s = associateSummary(a, fields);
        return {
          id: a.id, name: a.name, type: 'Other' as const, kind: 'Associate' as const,
          designation: s.designation, department: s.organization || s.department,
          email: s.email, contact_number: s.phone, cadre: s.cadre, state: s.state, batch_year: s.batch,
          current_position: s.designation, details: s.details,
        };
      }));
    } catch {
      setAssociates([]); // no Associates list on this server yet — the pickers simply don't show any
    }
  }

  async function fetchEmployees() {
    setEmployeeLoading(true);
    try {
      // the HRMS directory + employees added in the app (same list as the Employees page)
      const { employees: rows } = await loadDirectoryEmployees();
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
      originalStatusRef.current = '';
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
  useEffect(() => { if (isOpen) { fetchOfficers(); fetchEmployees(); fetchAssociates(); } }, [isOpen]);

  /* dev only: the API routes compile on first use (Google's library is large) —
     touch them when the form opens so they're ready by the time it's saved */
  useEffect(() => {
    if (!isOpen || process.env.NODE_ENV !== 'development') return;
    [GOOGLE_ROUTE, INVITE_ROUTE].forEach((u) => fetch(u, { method: 'HEAD' }).catch(() => {}));
  }, [isOpen]);

  /* directory search on the server (all four services) — adds matching officers to the pool as you type */
  async function searchIas(filter: string, limit = 50) {
    const lists = await Promise.all(OFFICER_SERVICES.map((s) =>
      pb.collection(OFFICER_COLLECTION[s]).getList(1, limit, { filter, sort: 'name', requestKey: null })
        .then((res) => res.items.map((o: any) => mapOfficer(o, s)))
        .catch((e) => { console.warn(`[directory] ${s} search failed`, e); return [] as Officer[]; })));
    const found = lists.flat();
    if (found.length) setOfficers((prev) => mergeOfficers(prev, found));
  }

  const iasQuery = (formData.meeting_type === 'Internal' ? '' : (officerSearch || extraSearch)).trim();
  useEffect(() => {
    if (!isOpen || iasQuery.length < 2) return;
    setIasSearching(true);
    const t = setTimeout(() => {
      searchIas(officerSearchFilter(iasQuery))
        .finally(() => setIasSearching(false));
    }, 250);
    return () => { clearTimeout(t); setIasSearching(false); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [iasQuery, isOpen]);

  /* when editing: make sure the meeting's IAS officer + any IAS attendee emails are in the pool */
  useEffect(() => {
    if (!isOpen || !editingId) return;
    const parts: string[] = [];
    if (serviceOf(formData.officer_type) && formData.officer_id) parts.push(`id = "${pbq(formData.officer_id)}"`);
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
      const pool = [...officers, ...associates, ...employees];
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
    // while the "create officer / contact" panel is on top, Escape belongs to it
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape' && !newPersonType) onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, onClose, newPersonType]);

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
      video_call: videoPlatform(m.meet_link) === 'zoom' ? 'zoom' : (m.add_meet ?? true) ? 'meet' : 'none',
      created_by: m.created_by || '',
      meet_link: m.meet_link || '',
      gcal_event_id: m.gcal_event_id || '',
      gcal_link: m.gcal_link || '',
      city: m.city || '',
    });

    /* the other participants saved by name (lib/participants) — their e-mails are not repeated as attendees */
    const savedExtras: Officer[] = parseParticipants(m.participants).map((p) => ({
      id: p.id || `walkin:${p.name.toLowerCase()}`, name: p.name, email: p.email, designation: p.designation,
      type: serviceOf(p.type) ?? 'Other',
      ...(p.type === 'Associate' && { kind: 'Associate' as const }),
    }));
    const extraEmails = new Set(savedExtras.map((o) => o.email).filter(Boolean));
    attendeesArr = attendeesArr.filter((a) => !extraEmails.has(a.trim().toLowerCase()));

    syncDurationUI(String(m.duration ?? ''));
    originalSlotRef.current = `${formattedDate}|${formattedTime}|${Number(m.duration) || 0}`;
    originalStatusRef.current = normalizedStatus;
    setAttendeeList(attendeesArr);
    setAttendeeInput('');

    if (m.officer_name) {
      setSelectedOfficer({
        id: m.officer_id || '', name: m.officer_name,
        designation: m.designation,
        type: serviceOf(m.officer_type) ?? 'Other',
        contact_number: m.contact_number, email: m.email,
        department: m.department, current_position: m.current_position,
        batch_year: m.batch_year, cadre: m.cadre, state: m.state,
        // "Schedule meeting" from the Associates list: keep it an associate (badge + Details)
        ...(m.__kind === 'Associate' && { kind: 'Associate' as const, details: Array.isArray(m.__details) ? m.__details : undefined }),
      });
    } else {
      setSelectedOfficer(null);
    }
    setExtraOfficers(savedExtras);
    setExtraSearch('');
    setShowOfficerEdit(false);
    setShowMoreDetails(Boolean(
      savedExtras.length || m.attendees || m.follow_up_date || m.followup_date || m.follow_up_notes ||
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
    setExtrasOpen(false);
    loadedFollowUpRef.current = '';
    originalSlotRef.current = '';
    originalStatusRef.current = '';
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
    const pool = isInternal ? employees : [...officers, ...associates];
    const q = officerSearch.trim().toLowerCase();
    return pool.filter((o) => {
      if (isExternal && typeFilter === 'Associates' && o.kind !== 'Associate') return false;
      if (isExternal && typeFilter !== 'All' && typeFilter !== 'Associates' && (o.type !== typeFilter || o.kind === 'Associate')) return false;
      if (!q) return true;
      return (
        o.name?.toLowerCase().includes(q) ||
        o.designation?.toLowerCase().includes(q) ||
        o.department?.toLowerCase().includes(q) ||
        o.cadre?.toLowerCase().includes(q) ||
        o.state?.toLowerCase().includes(q) ||
        o.email?.toLowerCase().includes(q) ||
        o.batch_year?.toLowerCase().includes(q)
      );
    });
  }, [officers, employees, associates, officerSearch, typeFilter, isInternal, isExternal]);

  const officerSearchActive = !!officerSearch.trim();
  const filteredOfficers = officerSearchActive ? filteredOfficersAll : filteredOfficersAll.slice(0, LIST_CAP);
  const officersTruncated = !officerSearchActive && (filteredOfficersAll.length > LIST_CAP || (!isInternal && iasTotal > IAS_PAGE));

  /* "Add more participants" — a browsable list like the main picker; people already added stay
     in it, marked Added (tap again to remove), like items in a cart.
     internal → employees; external → officers + your own employees (colleagues who also attend) */
  const extraPoolAll = useMemo(() => {
    const q = extraSearch.trim().toLowerCase();
    const tagged: { o: Officer; group: ExtraFilter }[] = isInternal
      ? employees.map((o) => ({ o, group: 'Employees' as const }))
      : [
          ...officers.map((o) => ({ o, group: o.type as ExtraFilter })),
          ...associates.map((o) => ({ o, group: 'Associates' as const })),
          ...employees.map((o) => ({ o, group: 'Employees' as const })),
        ];
    return tagged
      .filter(({ o }) => o.id !== selectedOfficer?.id)
      .filter(({ group }) => isInternal || extraFilter === 'All' || group === extraFilter)
      .filter(({ o }) => !q || (
        o.name?.toLowerCase().includes(q) ||
        o.designation?.toLowerCase().includes(q) ||
        o.department?.toLowerCase().includes(q) ||
        o.email?.toLowerCase().includes(q) ||
        o.cadre?.toLowerCase().includes(q) ||
        o.state?.toLowerCase().includes(q)
      ));
  }, [officers, employees, associates, extraSearch, extraFilter, selectedOfficer, isInternal]);
  const extraPool = extraSearch.trim() ? extraPoolAll.slice(0, 80) : extraPoolAll.slice(0, LIST_CAP);
  const isExtraAdded = (id: string) => extraOfficers.some((x) => x.id === id);
  // the search text stays, so several people can be added from one search
  const toggleExtra = (o: Officer) =>
    setExtraOfficers((p) => (p.some((x) => x.id === o.id) ? p.filter((x) => x.id !== o.id) : [...p, o]));

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
  // Google Calendar / Meet only for the organisation that owns the Google account
  const googleOn = useGoogleEnabled();
  // which account the calendar event, Meet link and invites come from (lib/senders)
  const senderInfo = useSenders(googleOn && isOpen).summary;
  // who invite emails come from and the name shown (SendAsPicker) — also organises the calendar event
  const sendAs = useSendAs(isOpen);
  // Zoom links — when ZOOM_* keys are set on the server (lib/zoom)
  const zoomOn = useZoomEnabled(isOpen);
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

  /* a record just created in the directory → add it to the list (and the cache) and select it */
  const handlePersonCreated = (rec: Record<string, any> | undefined, type: Officer['type'] | undefined) => {
    if (!rec?.id || !type) return;
    const officer = mapOfficer(rec, type);
    setOfficers((prev) => mergeOfficers([officer], prev));
    if (officerCache) officerCache = { ...officerCache, data: mergeOfficers([officer], officerCache.data) };
    if (type !== 'Other') setIasTotal((n) => n + 1);
    if (newPersonFor === 'extra') {
      setExtraOfficers((p) => (p.some((x) => x.id === officer.id) ? p : [...p, officer]));
      setExtraFilter('All');
      showToast(`${officer.name} added to the directory and to this meeting`, 'success');
      return;
    }
    handleSelectOfficer(officer);
    setTypeFilter('All');
    showToast(`${officer.name} added to the directory and selected`, 'success');
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

  /* a batchmate picked from the Batchmates card — load the full record so the invite has their e-mail */
  const handleAddBatchmate = async (b: BatchOfficer) => {
    const col = OFFICER_COLLECTION[b.service];
    const full = await pb.collection(col).getOne(b.id).catch(() => null);
    handleAddExtraOfficer(full ? mapOfficer(full, b.service) : {
      id: b.id, name: b.name, type: b.service, designation: b.position, current_position: b.position,
      cadre: b.cadre, state: b.state, batch_year: b.batch,
    });
  };

  /* names: letters only — invalid characters never reach the field */
  const handleOfficerField = (key: string, v: string) => {
    const clean = key === 'officer_name' ? cleanName(v) : v; // phone comes from <PhoneInput>
    setFormData((prev) => ({ ...prev, [key]: clean }));
    if (errors.officer) setErrors((p) => ({ ...p, officer: '' }));
  };

  /* participant details typed by hand are checked; picks from the directory are trusted */
  const participantProblem = () =>
    showOfficerEdit
      ? nameError(formData.officer_name || '', { label: 'Participant name' }) || phoneError(formData.contact_number || '')
      : '';

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
  async function runAutomations(recId: string, payload: Record<string, any>, before: { slot: string; status: string } | null = null) {
    const failures: string[] = [];
    /* Which email the participants get (lib/emailTemplates):
         status changed to Cancelled → cancellation · to Completed → thank-you
         date / time changed         → "meeting rescheduled" (with the old slot)
         otherwise                   → the invitation */
    const statusChanged = !!before && before.status !== payload.status;
    const statusMail = !formData.send_invite || !statusChanged ? null
      : /^cancel/i.test(payload.status) ? 'cancelled' as const
      : /^complet/i.test(payload.status) ? 'thanks' as const : null;
    const [prevDate = '', prevTime = ''] = (before?.slot || '').split('|');
    const rescheduled = !!before?.slot && (prevDate !== payload.meeting_date || prevTime !== payload.meeting_time);
    const mailTemplate = rescheduled ? { template: 'rescheduled', previous: { date: prevDate, time: prevTime } } : {};
    const wantInvite = formData.send_invite && !statusMail && !/^(cancel|complet)/i.test(payload.status);

    const isEmail = (e: string) => /^\S+@\S+\.\S+$/.test(e);
    const primaryEmail = (formData.email || '').trim().toLowerCase();
    /* everyone invited, each with their name — every one of them gets their own email
       (and their own Google Calendar invitation) */
    const people = new Map<string, string>(); // email → name
    for (const [email, name] of [
      [primaryEmail, payload.officer_name || ''],
      ...extraOfficers.map((o) => [o.email || '', o.name || '']),
      ...attendeeList.map((a) => [a, '']),
    ] as [string, string][]) {
      const e = email.trim().toLowerCase();
      if (isEmail(e) && !people.has(e)) people.set(e, name);
    }
    const allEmails = [...people.keys()];
    const otherParticipants = allEmails.filter((e) => e !== primaryEmail).map((email) => ({ email, name: people.get(email) || '' }));

    const notes = [
      payload.follow_up_date && `Follow-up date: ${payload.follow_up_date}`,
      payload.follow_up_notes && `Follow-up notes: ${payload.follow_up_notes}`,
    ].filter(Boolean).join('\n');

    const prevLink = formData.meet_link || '';
    const prevZoom = videoPlatform(prevLink) === 'zoom';
    const wantMeet = googleOn && formData.video_call === 'meet';
    let meetLink = formData.video_call !== 'none' && videoPlatform(prevLink) === formData.video_call ? prevLink : '';
    let primaryInvited = false;
    let gcalEvent: { uid?: string; organizer?: string; sequence?: number } | undefined; // the Google event the invites answer into
    const notDelivered: string[] = []; // invite emails that couldn't be sent

    /* 0) Zoom — create / move the Zoom meeting; switching away from Zoom removes it */
    if (formData.video_call === 'zoom' && zoomOn) {
      try {
        const r = await postJSON('/api/zoom', {
          agenda: payload.agenda,
          date: payload.meeting_date,
          time: payload.meeting_time,
          duration: Number(payload.duration) || 30,
          notes: [payload.officer_name && `With: ${payload.officer_name}`, notes].filter(Boolean).join('\n'),
          existingLink: prevZoom ? prevLink : '',
        }, 60_000); // no retry — a retried request could create a second Zoom meeting
        if (r.joinUrl) {
          meetLink = r.joinUrl;
          if (r.joinUrl !== prevLink) {
            try { await pb.collection('meetings').update(recId, { meet_link: r.joinUrl }); }
            catch (e) { console.error('Saving the Zoom link failed:', e); }
          }
        }
      } catch (err: any) {
        console.error('/api/zoom failed:', err);
        console.warn('[zoom]', err);
        failures.push(err?.name === 'AbortError' ? 'The Zoom link took too long — please try again' : (err?.message || 'The Zoom link couldn’t be created'));
      }
    } else if (prevZoom && formData.video_call !== 'zoom') {
      await removeZoomMeeting({ id: recId, meet_link: prevLink });
    }
    if (formData.video_call === 'none' && prevLink && !prevZoom) {
      await pb.collection('meetings').update(recId, { meet_link: '' }).catch(() => {});
    }
    const zoomLink = videoPlatform(meetLink) === 'zoom' ? meetLink : '';

    /* 1) Google Calendar / Meet (+ email to the primary officer) */
    if (googleOn && (formData.sync_gcal || wantMeet)) {
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
          includeMeet: wantMeet,
          sendInvite: wantInvite,
          syncCalendar: formData.sync_gcal,
          gcalEventId: formData.gcal_event_id || '',
          existingMeetLink: wantMeet ? meetLink : '',
          videoLink: zoomLink, // a Zoom link goes into the event and the email instead of Meet
          guests: otherParticipants, // the added participants are on the event too
          ...sendAs.payload, // sender account, "on behalf of", the From name
          ...mailTemplate, // after a date / time change → the "rescheduled" email
        // generous: this runs in the background, and in dev the route may still be compiling
        // (Google's library is large). No retry — a retried request could create a duplicate event.
        }, 120_000);

        if (wantMeet && r.meetLink) meetLink = r.meetLink;
        primaryInvited = !!r.emailSent;
        gcalEvent = r.calendar || undefined;

        const update: Record<string, string> = {};
        if (r.eventId) update.gcal_event_id = r.eventId;
        if (r.htmlLink) update.gcal_link = r.htmlLink;
        if (wantMeet && r.meetLink) update.meet_link = r.meetLink;
        if (Object.keys(update).length) {
          try { await pb.collection('meetings').update(recId, update); }
          catch (e) { console.error('Saving Google links failed:', e); }
        }
        if (wantMeet && !r.meetLink) failures.push('Calendar saved, but no Meet link was created');
      } catch (err: any) {
        if (err?.needsReconnect) {
          // expected & handled (shown to the user below) — a warning, not a red dev-overlay error
          console.warn(`${GOOGLE_ROUTE}: Google connection expired — renew GOOGLE_REFRESH_TOKEN in .env.local`);
          failures.push('The meeting is saved, but Google Calendar needs to be reconnected — please ask your administrator');
        } else {
          console.error(`${GOOGLE_ROUTE} failed:`, err);
          failures.push(err?.name === 'AbortError' ? 'Google Calendar took too long — the meeting is saved' : (err?.message || 'Couldn’t add the meeting to Google Calendar'));
        }
      }
    }

    /* 2) Invite email — skips the primary officer if /api/google already emailed them */
    if (wantInvite) {
      const recipients = primaryInvited ? allEmails.filter((e) => e !== primaryEmail) : allEmails;
      if (!allEmails.length) {
        failures.push('No invite sent — none of the participants has an email address');
      } else if (recipients.length) {
        try {
          const r = await postJSON(INVITE_ROUTE, {
            // one personal email each ("Dear <name>"), not one shared email
            recipients: recipients.map((email) => ({ email, name: people.get(email) || '' })),
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
            ...sendAs.payload, // sender account, "on behalf of", the From name
            ...mailTemplate, // after a date / time change → the "rescheduled" email
            ...(gcalEvent && { calendar: gcalEvent }), // Yes / No / Maybe → updates the Google event
          }, 180_000); // background, one email per person; no retry (would send the emails twice)
          if (r?.failed?.length) {
            failures.push(`Invite not delivered to ${r.failed.map((f: any) => f.email).join(', ')}`);
            notDelivered.push(...r.failed.map((f: any) => String(f.email || '').toLowerCase()));
          }
        } catch (err: any) {
          console.error(`${INVITE_ROUTE} failed:`, err);
          console.warn('[invite]', err);
          failures.push(err?.name === 'AbortError' ? 'The invite emails took too long — please try again' : (err?.message || 'The invite emails couldn’t be sent'));
          notDelivered.push(...recipients); // none of them got it
        }
      }
    }

    /* 2b) Cancelled / Completed → the cancellation or thank-you email to everyone with an email address */
    if (statusMail && allEmails.length) {
      try {
        const r = await postJSON('/api/meeting-email', {
          kind: statusMail,
          meeting: { ...payload, id: recId, meet_link: meetLink || formData.meet_link || '' },
          ...sendAs.payload,
        }, 120_000);
        if (r?.failed?.length) failures.push(`Not delivered to ${r.failed.join(', ')}`);
      } catch (err: any) {
        console.warn('[meeting-email]', err);
        failures.push(err?.message || (statusMail === 'cancelled' ? 'The cancellation email couldn’t be sent' : 'The thank-you email couldn’t be sent'));
      }
    }

    /* 3) "Meeting ready — share it": the Meet / Zoom link to copy, and everyone who did NOT get
          the email (no email, a malformed one, or not delivered) — each with a WhatsApp button */
    const manual: ManualShare[] = [];
    if (wantInvite) {
      const consider = (name: string, email: string, phone: string) => {
        const e = email.trim().toLowerCase();
        if (!e) manual.push({ name, phone, reason: 'no-email' });
        else if (!isEmail(e)) manual.push({ name, phone, email, reason: 'invalid-email' });
        else if (notDelivered.includes(e)) manual.push({ name, phone, email: e, reason: 'not-delivered' });
      };
      if (payload.officer_name) consider(payload.officer_name, formData.email || '', formData.contact_number || '');
      for (const o of extraOfficers) consider(o.name || '', o.email || '', o.contact_number || '');
      for (const a of attendeeList) if (!isEmail(a.trim().toLowerCase()) || notDelivered.includes(a.trim().toLowerCase())) consider(a, a, '');
    }
    if (meetLink || manual.length) {
      showShareMeeting({ meeting: { ...payload, id: recId, meet_link: meetLink }, manual });
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
    if (!e.officer && participantProblem()) e.officer = participantProblem();
    const agendaProblem = textError(formData.agenda, { label: 'Agenda' });
    if (agendaProblem) e.agenda = agendaProblem === 'Agenda is required.' ? 'Please enter the agenda.' : agendaProblem;
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
    if (!e.officer && participantProblem()) e.officer = participantProblem();
    const agendaProblem = textError(formData.agenda, { label: 'Agenda' });
    if (agendaProblem) e.agenda = agendaProblem === 'Agenda is required.' ? 'Please enter the agenda.' : agendaProblem;
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
        participants: extraOfficers.map((o): Participant => ({
          id: o.id.startsWith('walkin:') ? '' : o.id,
          name: o.name,
          type: employees.some((e) => e.id === o.id) ? 'Employee' : o.kind === 'Associate' ? 'Associate' : o.type,
          email: (o.email || '').toLowerCase(),
          designation: o.designation || '',
        })),
        send_invite: formData.send_invite,
        sync_gcal: googleOn && formData.sync_gcal,
        add_meet: googleOn && formData.video_call === 'meet',
        created_by: formData.created_by,
        city: formData.city.trim(),
      };

      /* never overwrite saved notes with '' before they've loaded */
      if (editingId && !notesReadyRef.current && !payload.follow_up_notes) {
        delete payload.follow_up_notes;
      }

      /* the creator gets this meeting's follow-up alerts (lib/creatorAlerts) — set once, never on edit */
      if (!editingId && pb.authStore.record?.email) {
        payload.owner_email = String(pb.authStore.record.email).toLowerCase();
      }

      let rec: any = editingId
        ? await pb.collection('meetings').update(editingId, payload)
        : await pb.collection('meetings').create(payload);
      logActivity(editingId ? 'updated' : 'created', 'meeting', meetingLabel(rec), rec?.id);
      if (payload.participants.length && rec && !('participants' in rec)) {
        console.warn(PARTICIPANTS_FIELD_HINT);
        showToast(PARTICIPANTS_FIELD_MISSING, 'error');
      }

      /* follow_up_notes — make sure it actually landed on the record */
      if ('follow_up_notes' in payload && (rec?.follow_up_notes ?? '') !== payload.follow_up_notes) {
        rec = await pb.collection('meetings').update(rec.id, { follow_up_notes: payload.follow_up_notes });
        if ((rec?.follow_up_notes ?? '') !== payload.follow_up_notes) {
          console.warn('[follow-up notes] not stored — check the follow_up_notes field in the meetings collection (PocketBase)', Object.keys(rec || {}));
          showToast('The meeting is saved, but the follow-up notes couldn’t be stored. Please ask your administrator.', 'error');
        }
      }

      await syncDocuments(rec.id);

      /* The meeting is saved — close right away. Google Calendar / Meet and the
         invite emails can take several seconds, so they finish in the background
         and report back with a second toast (the list picks up the Meet link live). */
      const hasAutomations = (googleOn && (formData.sync_gcal || formData.video_call === 'meet')) || formData.send_invite
        || formData.video_call !== 'meet' && !!formData.meet_link // switched the video call / removed it
        || (zoomOn && formData.video_call === 'zoom');
      showToast(
        `${editingId ? 'Meeting updated' : 'Meeting created'}${hasAutomations ? ' — calendar & invites are being sent in the background' : ''}`,
        'success',
      );
      // what the meeting was before this edit (slot + status) → which email the participants get
      const before = editingId ? { slot: originalSlotRef.current, status: originalStatusRef.current } : null;
      onSavedMeeting?.({ ...payload, id: rec.id, __isNew: !editingId });
      onSuccess();
      onClose();

      if (hasAutomations) {
        runAutomations(rec.id, payload, before)
          .then((failures) => {
            if (failures.length) showToast(failures.join(' · '), 'error');
            else showToast(`Calendar & invites done — ${payload.agenda || 'meeting'}`, 'success');
          })
          .catch((e) => { console.error('[automations]', e); showToast('The meeting is saved, but the calendar / invites step didn’t finish — please try again later.', 'error'); });
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
          <button type="button" onClick={onClose} aria-label="Close" data-tooltip="Close  ·  Esc"
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
                        {(['All', ...OFFICER_SERVICES, 'Other', ...(associates.length ? ['Associates' as const] : [])] as const).map((t) => (
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
                          {isExternal && (
                            <>
                              <p className="mt-3 text-[11px] font-semibold text-slate-600">Add them to the directory and continue:</p>
                              <div className="mt-2 flex flex-wrap justify-center gap-1.5">
                                {NEW_PERSON_OPTIONS
                                  .filter((p) => typeFilter === 'All' || p.type === typeFilter)
                                  .map((p) => (
                                    <button key={p.type} type="button" onClick={() => createPerson(p.type, 'main')}
                                      className="inline-flex items-center gap-1 rounded-full bg-slate-900 px-3 py-1.5 text-[11.5px] font-semibold text-white transition hover:bg-slate-800 active:scale-95">
                                      <Plus className="h-3 w-3" /> {p.label}
                                    </button>
                                  ))}
                              </div>
                            </>
                          )}
                        </div>
                      ) : (
                        <div className="nice-scroll max-h-72 space-y-1.5 overflow-y-auto pr-0.5">
                          {filteredOfficers.map((o) => (
                            <button key={o.id} type="button" onClick={() => handleSelectOfficer(o)}
                              className="flex w-full items-center gap-3 rounded-2xl border border-slate-200 bg-white p-2.5 text-left transition-all hover:border-violet-300 hover:bg-violet-50/40 active:scale-[.99]">
                              <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-[11px] font-bold ${badgeOf(o).avatar}`}>
                                {initialsOf(o.name || '?')}
                              </span>
                              <span className="min-w-0 flex-1">
                                <span className="flex items-center gap-1.5">
                                  <span className="truncate text-[13px] font-semibold text-slate-800">{o.name}</span>
                                  {isExternal && (
                                    <span className={`shrink-0 rounded-full border px-1.5 py-0.5 text-[9px] font-bold ${badgeOf(o).chip}`}>
                                      {labelOf(o)}
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
                            : `Showing a few of ${iasTotal.toLocaleString('en-IN')} officers — type a name, post, department or cadre to search them all`}
                        </p>
                      )}
                      {iasSearching && !isInternal && (
                        <p className="mt-1.5 flex items-center justify-center gap-1.5 text-[10px] text-slate-400">
                          <Loader2 className="h-3 w-3 animate-spin" /> Searching the IAS directory…
                        </p>
                      )}

                      {/* not in the list → create the officer / contact in the directory; it is selected on save */}
                      {isExternal && filteredOfficers.length > 0 && (
                        <div className="mt-2 flex flex-wrap items-center justify-center gap-1.5 rounded-2xl border border-dashed border-slate-300 px-3 py-2.5">
                          <span className="text-[11px] font-semibold text-slate-500">Not in the list?</span>
                          {NEW_PERSON_OPTIONS.map((p) => (
                            <button key={p.type} type="button" onClick={() => createPerson(p.type, 'main')}
                              className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-600 transition hover:border-violet-400 hover:text-violet-600 active:scale-95">
                              <Plus className="h-3 w-3" /> {p.label}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  /* selected participant card */
                  <div className="rounded-2xl border border-violet-200 bg-violet-50/60 p-3">
                    <div className="flex items-start gap-3">
                      <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-xs font-bold ${badgeOf(selectedOfficer).avatar}`}>
                        {initialsOf(selectedOfficer.name || '?')}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <p className="truncate text-sm font-bold text-slate-900">{selectedOfficer.name || 'New contact'}</p>
                          <span className={`shrink-0 rounded-full border px-1.5 py-0.5 text-[9px] font-bold ${badgeOf(selectedOfficer).chip}`}>
                            {labelOf(selectedOfficer)}
                          </span>
                        </div>
                        {formData.designation && <p className="truncate text-[11px] text-slate-500">{formData.designation}</p>}
                        {selectedOfficer.kind === 'Associate' && !!selectedOfficer.details?.length && (
                          <AssociateDetails id={selectedOfficer.id} details={selectedOfficer.details} open={openDetails === selectedOfficer.id} onToggle={setOpenDetails} />
                        )}
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
                        {OFFICER_EDIT_FIELDS.map((f) =>
                          f.key === 'contact_number' ? (
                            /* a div, not a label — PhoneInput has its own label for the country picker */
                            <div key={f.key}>
                              <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-400">{f.label}</span>
                              <PhoneInput
                                value={formData.contact_number ?? ''}
                                onChange={(v) => handleOfficerField('contact_number', v)}
                                className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-800"
                              />
                            </div>
                          ) : (
                            <label key={f.key} className="block">
                              <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-400">{f.label}</span>
                              <input
                                value={(formData as any)[f.key] ?? ''}
                                onChange={(e) => handleOfficerField(f.key, e.target.value)}
                                type={f.key === 'email' ? 'email' : 'text'}
                                className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-800 outline-none transition focus:border-violet-400 focus:ring-2 focus:ring-violet-500/10"
                              />
                            </label>
                          ),
                        )}
                      </div>
                    )}
                  </div>
                )}
                <FieldError message={errors.officer} />
                {selectedOfficer && (
                  <>
                    {/* same-batch IAS / IPS officers — add any of them to this meeting */}
                    {selectedOfficer.type !== 'Other' && (
                      <div className="mt-3">
                        <BatchmatesCard
                          mode="form"
                          officer={{ id: selectedOfficer.id, name: selectedOfficer.name, type: selectedOfficer.type, batch_year: formData.batch_year || selectedOfficer.batch_year }}
                          place={{ city: formData.city, location: formData.location, address: formData.address }}
                          onAdd={handleAddBatchmate}
                          addedIds={extraOfficers.map((o) => o.id)}
                        />
                      </div>
                    )}
                    {/* more participants — right under the main one; the list opens only when asked for, so the form stays short */}
                    <div className="mt-3 rounded-2xl border border-slate-200 bg-white p-3">
                      <button type="button" onClick={() => setExtrasOpen((o) => !o)} aria-expanded={extrasOpen}
                        className={`flex w-full items-center gap-2 text-left ${extrasOpen ? 'mb-2' : ''}`}>
                        <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-violet-50 text-violet-600">
                          <Plus className={`h-3.5 w-3.5 transition-transform duration-300 ${extrasOpen ? 'rotate-45' : ''}`} />
                        </span>
                        <span className="flex-1 text-[12px] font-semibold text-slate-700">
                          {extrasOpen ? 'Add more participants' : extraOfficers.length ? 'Add or remove participants' : 'Add more participants'}
                        </span>
                        {extraOfficers.length > 0 && (
                          <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700 ring-1 ring-inset ring-emerald-600/20">
                            {extraOfficers.length} added
                          </span>
                        )}
                        <ChevronDown className={`h-4 w-4 text-slate-400 transition-transform duration-300 ${extrasOpen ? 'rotate-180' : ''}`} />
                      </button>

                      {extrasOpen && (<>
                      {/* type chips + search — same as choosing the main participant */}
                      {!isInternal && (
                        <div className="mb-2 flex flex-wrap gap-1.5">
                          {EXTRA_FILTERS.map((t) => (
                            <button key={t} type="button" onClick={() => setExtraFilter(t)}
                              className={`rounded-full border px-3 py-1 text-[11px] font-semibold transition-all active:scale-95 ${
                                extraFilter === t ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300'
                              }`}>{t}</button>
                          ))}
                        </div>
                      )}
                      <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3.5 transition focus-within:border-violet-400 focus-within:ring-4 focus-within:ring-violet-500/10">
                        <Search className="h-4 w-4 shrink-0 text-slate-400" />
                        <input
                          value={extraSearch}
                          onChange={(e) => setExtraSearch(e.target.value)}
                          placeholder={isInternal ? 'Search employees by name, designation…' : 'Search officers or employees by name, designation…'}
                          className="w-full bg-transparent py-2.5 text-sm outline-none placeholder:text-slate-400"
                        />
                        {extraSearch && (
                          <button type="button" onClick={() => setExtraSearch('')} aria-label="Clear search"
                            className="rounded-full p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
                            <X className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>

                      {/* the list — ADD puts a person in the meeting, ADDED takes them out again */}
                      <div className="mt-2">
                        {participantLoading ? (
                          <div className="flex items-center justify-center gap-2 py-6 text-sm text-slate-400">
                            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
                          </div>
                        ) : extraPool.length === 0 ? (
                          <div className="rounded-2xl border border-dashed border-slate-200 py-6 text-center">
                            <User className="mx-auto h-5 w-5 text-slate-300" />
                            <p className="mt-1.5 text-xs text-slate-400">
                              Nobody found{extraSearch ? ` for “${extraSearch}”` : ''}
                            </p>
                          </div>
                        ) : (
                          <div className="nice-scroll max-h-72 space-y-1.5 overflow-y-auto pr-0.5">
                            {extraPool.map(({ o, group }) => {
                              const added = isExtraAdded(o.id);
                              return (
                                <div key={`${group}:${o.id}`}
                                  className={`flex items-center gap-3 rounded-2xl border p-2.5 transition-all ${
                                    added ? 'border-emerald-200 bg-emerald-50/50' : 'border-slate-200 bg-white hover:border-violet-200'
                                  }`}>
                                  <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-[11px] font-bold ${badgeOf(o).avatar}`}>
                                    {initialsOf(o.name || '?')}
                                  </span>
                                  <span className="min-w-0 flex-1">
                                    <span className="flex items-center gap-1.5">
                                      <span className="truncate text-[13px] font-semibold text-slate-800">{o.name}</span>
                                      {!isInternal && (
                                        <span className={`shrink-0 rounded-full border px-1.5 py-0.5 text-[9px] font-bold ${
                                          group === 'Employees' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : badgeOf(o).chip
                                        }`}>
                                          {group === 'Employees' ? 'Employee' : labelOf(o)}
                                        </span>
                                      )}
                                    </span>
                                    <span className="block truncate text-[11px] text-slate-400">
                                      {[o.designation, o.department].filter(Boolean).join(' · ') || '—'}
                                    </span>
                                    {o.kind === 'Associate' && !!o.details?.length && (
                                      <AssociateDetails id={o.id} details={o.details} open={openDetails === o.id} onToggle={setOpenDetails} />
                                    )}
                                  </span>
                                  <button type="button" onClick={() => toggleExtra(o)}
                                    title={added ? 'Remove from this meeting' : 'Add to this meeting'}
                                    className={`inline-flex w-[84px] shrink-0 items-center justify-center gap-1 rounded-lg py-1.5 text-[11px] font-extrabold tracking-wide shadow-sm transition-all active:scale-95 ${
                                      added
                                        ? 'bg-emerald-600 text-white hover:bg-rose-600'
                                        : 'border border-slate-300 bg-white text-emerald-700 hover:border-emerald-500 hover:bg-emerald-50'
                                    }`}>
                                    {added ? <><Check className="h-3.5 w-3.5" /> ADDED</> : <>ADD <Plus className="h-3.5 w-3.5" /></>}
                                  </button>
                                </div>
                              );
                            })}
                          </div>
                        )}
                        {!extraSearch.trim() && extraPoolAll.length > extraPool.length && (
                          <p className="mt-1.5 text-center text-[10px] text-slate-400">
                            Showing {extraPool.length} of {extraPoolAll.length}{!isInternal && iasTotal > IAS_PAGE ? ' (+ more officers)' : ''} — type to search everyone
                          </p>
                        )}
                        {iasSearching && !isInternal && extraSearch.trim() && (
                          <p className="mt-1.5 flex items-center justify-center gap-1.5 text-[10px] text-slate-400">
                            <Loader2 className="h-3 w-3 animate-spin" /> Searching the IAS directory…
                          </p>
                        )}
                        {/* not in the list → create them in the directory; they're added to this meeting on save */}
                        {!isInternal && (
                          <div className="mt-2 flex flex-wrap items-center justify-center gap-1.5 rounded-2xl border border-dashed border-slate-300 px-3 py-2.5">
                            <span className="text-[11px] font-semibold text-slate-500">Not in the list?</span>
                            {NEW_PERSON_OPTIONS.map((p) => (
                              <button key={p.type} type="button" onClick={() => createPerson(p.type, 'extra')}
                                className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-600 transition hover:border-violet-400 hover:text-violet-600 active:scale-95">
                                <Plus className="h-3 w-3" /> {p.label}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                      </>)}

                      {/* the "cart" — everyone added, with their invite status (shown even when the list is closed) */}
                      {extraOfficers.length > 0 && (
                        <div className="mt-3 rounded-xl bg-slate-50 p-2.5 ring-1 ring-slate-100">
                          <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                            In this meeting · {selectedOfficer.name || 'Main participant'} + {extraOfficers.length}
                          </p>
                        <div className="mb-2 flex flex-wrap gap-1.5">
                          {extraOfficers.map((o) => (
                            <span key={o.id}
                              title={o.email ? `Gets their own invite at ${o.email}` : 'No email address — won’t receive the invite'}
                              className={`inline-flex items-center gap-1 rounded-full border py-1 pl-2 pr-1 text-[11px] font-semibold ${
                                o.email ? 'border-slate-200 bg-slate-50 text-slate-700' : 'border-amber-200 bg-amber-50 text-amber-800'
                              }`}>
                              {o.email
                                ? <Mail className="h-3 w-3 shrink-0 text-violet-500" />
                                : <AlertCircle className="h-3 w-3 shrink-0 text-amber-500" />}
                              {o.name}
                              <button type="button" onClick={() => handleRemoveExtraOfficer(o)}
                                className="rounded-full p-0.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600">
                                <X className="h-3 w-3" />
                              </button>
                            </span>
                          ))}
                        </div>
                          <p className="flex items-center gap-1 text-[10px] text-slate-500">
                            <Mail className="h-3 w-3 text-violet-500" />
                            {formData.send_invite
                              ? `Everyone gets their own invite email${googleOn && formData.sync_gcal ? ' and calendar invitation' : ''}`
                              : 'Turn on “Send invite” in the next step to email them'}
                            {extraOfficers.some((o) => !o.email) && ' · ⚠ marked people have no email'}
                          </p>
                        </div>
                      )}
                    </div>
                  </>
                )}
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
                  maxLength={AGENDA_MAX}
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
                {/* everyone in the meeting: the main person, then the participants added to them */}
                {[selectedOfficer?.name, ...extraOfficers.map((o) => o.name)].filter(Boolean).map((name, i) => (
                  <Pill key={`${i}-${name}`}><User className="h-3.5 w-3.5" />{name}</Pill>
                ))}
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
                {/* enough time to travel from the previous meeting / to the next one? */}
                <TravelTimeNotice planned={formData} editingId={editingId} />
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

              {/* who the emails come from — the MD himself, or the PA (on his behalf / in her own name) */}
              {formData.send_invite && <SendAsPicker state={sendAs} className="c-fade-up" />}

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

                    {/* where invites come from / which calendars get the meeting (Settings → Google accounts) */}
                    {googleOn && senderInfo && (formData.sync_gcal || formData.video_call === 'meet' || formData.send_invite) && (
                      <p className="flex items-start gap-2 rounded-2xl bg-violet-50/60 px-3.5 py-2.5 text-[11px] leading-relaxed text-slate-600 ring-1 ring-inset ring-violet-100">
                        <Mail className="mt-0.5 h-3.5 w-3.5 shrink-0 text-violet-500" />
                        <span>
                          Invites are sent from <b>{sendAs.me?.email || senderInfo.from.email || senderInfo.from.label}</b>
                          {senderInfo.calendars.length > 1 && <> · the event is saved in <b>{senderInfo.calendars.length}</b> Google calendars ({senderInfo.calendars.join(', ')})</>}
                          {senderInfo.from.google.connected === false && <span className="block text-amber-700">{senderInfo.from.email} isn’t connected yet — the event goes from {senderInfo.calendars.find((c) => c !== senderInfo.from.email) || 'the other account'} until an admin connects it in Settings → Google accounts.</span>}
                        </span>
                      </p>
                    )}

                    {/* toggles */}
                    <div className="space-y-2">
                      <ToggleRow icon={Mail} title="Send invite" description="Email the agenda to participants"
                        checked={formData.send_invite} onChange={(v) => setFormData((p) => ({ ...p, send_invite: v }))} />
                      {googleOn && (
                        <>
                          <ToggleRow icon={Calendar} title="Sync to Google Calendar" description="Create / update the calendar event"
                            checked={formData.sync_gcal} onChange={(v) => setFormData((p) => ({ ...p, sync_gcal: v }))} />
                        </>
                      )}
                      {(googleOn || zoomOn) && (
                        <VideoCallChoice value={formData.video_call} meet={googleOn} zoom={zoomOn}
                          onChange={(v) => setFormData((p) => ({ ...p, video_call: v }))} />
                      )}
                    </div>


                    {(formData.meet_link || formData.gcal_link) && (
                      <a href={formData.meet_link || formData.gcal_link} target="_blank" rel="noreferrer"
                        className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-semibold text-violet-600 transition-colors hover:bg-violet-50">
                        <Video className="h-4 w-4" /> {formData.meet_link ? `Open ${videoLabel(formData.meet_link)} link` : 'Open calendar event'}
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

      {/* new IAS / IPS officer or contact — opens on top; once saved it is selected and the meeting continues */}
      <CreateOfficerPanel
        isOpen={!!newPersonType}
        stacked
        officerType={newPersonType ?? undefined}
        initialName={officerSearch}
        onClose={() => setNewPersonType(null)}
        onSuccess={handlePersonCreated}
      />
    </div>
  );
}
