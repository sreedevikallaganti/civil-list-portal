'use client';

/* ================================================================
   UpdateMeetingPanel — shared "Update Meeting" off-canvas
   Moved out of meetings/page.tsx (v25 InlineUpdateStatusPanel) with
   NO changes to its UI or behaviour, so every page that opens the
   Update panel (Meetings, Dashboard, Calendar, …) renders the exact
   same component. Change it here once and it changes everywhere.

   Usage:
     import UpdateMeetingPanel from '@/components/UpdateMeetingPanel';
     {updateMeeting && (
       <UpdateMeetingPanel
         meeting={updateMeeting}
         onClose={() => setUpdateMeeting(null)}
         onSaved={() => { setUpdateMeeting(null); reload(); }}
       />
     )}
   Always pass a fresh record: pb.collection('meetings').getOne(id)
================================================================ */

import { useEffect, useRef, useState } from 'react';
import {
  X, RotateCcw, Clock, Timer, Check, CalendarDays, ChevronLeft, ChevronRight,
  Upload, FileText, Trash2, Loader2, CheckCircle2,
} from 'lucide-react';
import pb from '@/lib/pocketbase';
import {
  WeekStrip, TimeSlotPicker, clampInt, PRESET_DURATIONS, formatDuration,
} from '@/components/CreateMeetingPanel';
import { showToast } from '@/components/Toaster';
import { completedTooEarly } from '@/lib/meetingRules';
import MeetingPhotos from '@/components/memories/MeetingPhotos';

/* ----------------------------- Scoped CSS ----------------------------- */
/* Same animations the Meetings page uses, under panel-only class names so
   the panel looks identical no matter which page renders it. */

const PANEL_CSS = `
@keyframes umpFadeIn  { from { opacity: 0; } to { opacity: 1; } }
@keyframes umpScaleIn { from { opacity: 0; transform: scale(0.94) translateY(10px); } to { opacity: 1; transform: scale(1) translateY(0); } }
@keyframes umpPanelIn { from { opacity: 0; transform: translateX(64px); } to { opacity: 1; transform: translateX(0); } }
@keyframes umpShimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }
.ump-fade-in  { animation: umpFadeIn 0.4s ease both; }
.ump-overlay  { animation: umpFadeIn 0.25s ease both; }
.ump-scale-in { animation: umpScaleIn 0.3s cubic-bezier(0.22, 1, 0.36, 1) both; }
.ump-panel    { animation: umpPanelIn 0.38s cubic-bezier(0.22, 1, 0.36, 1) both; }
.ump-scroll::-webkit-scrollbar { width: 8px; }
.ump-scroll::-webkit-scrollbar-track { background: transparent; }
.ump-scroll::-webkit-scrollbar-thumb { background: #e2e8f0; border-radius: 999px; }
.ump-scroll::-webkit-scrollbar-thumb:hover { background: #cbd5e1; }
.ump-progress { background: linear-gradient(90deg,#a78bfa 25%,#7c3aed 40%,#a78bfa 55%); background-size: 200% 100%; animation: umpShimmer 1.2s linear infinite; }
`;

/* ----------------------------- Status Styling ----------------------------- */

export const STATUS_STYLES: Record<string, { label: string; dot: string; badge: string }> = {
  scheduled:   { label: 'Scheduled',   dot: 'bg-violet-400',  badge: 'bg-violet-50 text-violet-700 ring-1 ring-inset ring-violet-600/20' },
  completed:   { label: 'Completed',   dot: 'bg-emerald-400', badge: 'bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-600/20' },
  rescheduled: { label: 'Rescheduled', dot: 'bg-amber-400',   badge: 'bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-600/20' },
  cancelled:   { label: 'Cancelled',   dot: 'bg-rose-400',    badge: 'bg-rose-50 text-rose-700 ring-1 ring-inset ring-rose-600/20' },
  rejected:    { label: 'Rejected',    dot: 'bg-slate-400',   badge: 'bg-slate-100 text-slate-600 ring-1 ring-inset ring-slate-500/20' },
};

/* "Rejected" is display-only, never selectable */
export const STATUS_ORDER = ['scheduled', 'completed', 'rescheduled', 'cancelled'];

/* ----------------------------- Date helpers ----------------------------- */

function pad2(n: number) { return String(n).padStart(2, '0'); }
function toISO(d: Date) { return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; }
function startOfDay(d: Date) { const c = new Date(d); c.setHours(0, 0, 0, 0); return c; }
const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const WEEKDAY_LETTERS = ['S','M','T','W','T','F','S'];

/* --------------------------- status_history helpers --------------------------- */

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
/* PocketBase silently drops unknown fields, so success is verified by
   checking the returned record actually holds the value. */

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

/* --------------------------- FollowUpCalendar --------------------------- */

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
        <div className="ump-scale-in absolute left-0 top-[calc(100%+6px)] z-30 w-72 rounded-2xl border border-slate-200 bg-white p-3 shadow-xl">
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

/* =================================================================================
   UpdateMeetingPanel — MANUAL ONLY, zero automations.
   Pass `__forceStatus: 'rescheduled'` on the meeting object to open it
   pre-selected on Rescheduled (used by quick status / keyboard shortcuts).
================================================================================= */

export default function UpdateMeetingPanel({ meeting, onClose, onSaved }: { meeting: any; onClose: () => void; onSaved: () => void }) {
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

      await syncDocuments(meeting.id);

      const trimmedNote = note.trim();
      if (trimmedNote) {
        const savedField = await saveFollowUpNote(meeting.id, trimmedNote);
        if (!savedField) {
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
      <style dangerouslySetInnerHTML={{ __html: PANEL_CSS }} />
      <div className="ump-overlay absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={() => !saving && onClose()} />

      <aside className="ump-panel absolute right-0 top-0 flex h-full w-full flex-col bg-white shadow-2xl sm:max-w-xl lg:max-w-2xl">
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
        <div className="ump-scroll flex-1 space-y-5 overflow-y-auto px-5 py-5">

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

          {/* Reschedule fields */}
          {status === 'rescheduled' && (
            <div className="ump-fade-in space-y-3 rounded-2xl border border-amber-200 bg-amber-50/60 p-4">
              <p className="flex items-center gap-1.5 text-[11px] font-semibold text-amber-700">
                <RotateCcw className="h-3.5 w-3.5" />
                Rescheduling needs a new date, time & duration
              </p>

              <div>
                <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-amber-700">New Date</label>
                <WeekStrip value={newDate} onChange={setNewDate} />
              </div>

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
                <div className="ump-progress h-full w-1/3 rounded-full" />
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