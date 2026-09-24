'use client';

/* ================================================================
   MeetingDetailsPanel — shared meeting-details off-canvas
   An exact copy of the Meetings page detail panel (v25), so that
   clicking a meeting ANYWHERE (Dashboard, Calendar, …) opens the same
   off-canvas: status/type badges, Follow-up shortcut, Edit / Update /
   Delete buttons, follow-up notes card with inline editing, info
   tiles, activity trail, and the same archive-then-delete flow.

   Usage:
     {selectedMeeting && (
       <MeetingDetailsPanel
         meeting={selectedMeeting}
         onClose={() => setSelectedMeeting(null)}
         onEdit={(m) => openEdit(m)}        // parent re-fetches + opens CreateMeetingPanel
         onUpdate={(m) => openUpdate(m)}    // parent re-fetches + opens UpdateMeetingPanel
         onDeleted={() => { setSelectedMeeting(null); reload(); }}
         onMeetingChange={(m) => ...}       // optional: follow-up note saved
       />
     )}
================================================================ */

import { useEffect, useState, type ReactNode } from 'react';
import {
  Calendar, CalendarDays, Clock, MapPin, User, Tag, Briefcase, AlignLeft,
  Phone, Mail, History, RefreshCw, X, Edit2, RotateCcw, Trash2, StickyNote,
  ChevronDown, Loader2, Check, Building2, Globe,
} from 'lucide-react';
import pb from '@/lib/pocketbase';
import { showToast } from '@/components/Toaster';
import { STATUS_STYLES, parseHistory, saveFollowUpNote } from '@/components/UpdateMeetingPanel';

/* ----------------------------- Scoped CSS ----------------------------- */

const PANEL_CSS = `
@keyframes mdpFadeIn  { from { opacity: 0; } to { opacity: 1; } }
@keyframes mdpScaleIn { from { opacity: 0; transform: scale(0.94) translateY(10px); } to { opacity: 1; transform: scale(1) translateY(0); } }
@keyframes mdpPanelIn { from { opacity: 0; transform: translateX(64px); } to { opacity: 1; transform: translateX(0); } }
.mdp-fade-in  { animation: mdpFadeIn 0.4s ease both; }
.mdp-overlay  { animation: mdpFadeIn 0.25s ease both; }
.mdp-scale-in { animation: mdpScaleIn 0.3s cubic-bezier(0.22, 1, 0.36, 1) both; }
.mdp-panel    { animation: mdpPanelIn 0.38s cubic-bezier(0.22, 1, 0.36, 1) both; }
.mdp-scroll::-webkit-scrollbar { width: 8px; }
.mdp-scroll::-webkit-scrollbar-track { background: transparent; }
.mdp-scroll::-webkit-scrollbar-thumb { background: #e2e8f0; border-radius: 999px; }
.mdp-scroll::-webkit-scrollbar-thumb:hover { background: #cbd5e1; }
`;

/* ---------------- Meeting-type colours (same as Meetings page) ---------------- */

const TYPE_CONFIG: Record<string, {
  label: string; badge: string; strip: string; band: string; headerBg: string;
  highlightCard: string; legendDot: string; icon: any;
}> = {
  internal: {
    label: 'Internal',
    badge:         'bg-violet-100 text-violet-800 ring-1 ring-inset ring-violet-500/30',
    strip:         'bg-gradient-to-b from-violet-500 to-purple-500',
    band:          'bg-gradient-to-r from-violet-500 to-purple-500',
    headerBg:      'border-violet-100 bg-violet-50/60',
    highlightCard: 'border-violet-200 bg-violet-50',
    legendDot:     'bg-violet-500',
    icon:          Building2,
  },
  external: {
    label: 'External',
    badge:         'bg-sky-100 text-sky-800 ring-1 ring-inset ring-sky-500/30',
    strip:         'bg-gradient-to-b from-sky-500 to-cyan-500',
    band:          'bg-gradient-to-r from-sky-500 to-cyan-500',
    headerBg:      'border-sky-100 bg-sky-50/60',
    highlightCard: 'border-sky-200 bg-sky-50',
    legendDot:     'bg-sky-500',
    icon:          Globe,
  },
};

const getTypeConfig = (t: any) => TYPE_CONFIG[String(t || '').toLowerCase()] || null;

const PRIORITY_BADGE: Record<string, { badge: string; dot: string }> = {
  high:   { badge: 'bg-rose-50 text-rose-700 ring-1 ring-inset ring-rose-600/20',          dot: 'bg-rose-300' },
  medium: { badge: 'bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-600/20',       dot: 'bg-amber-300' },
  low:    { badge: 'bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-600/20', dot: 'bg-emerald-300' },
};

/* Same archive collection the Meetings page uses for soft delete */
const ARCHIVE_COLLECTION = 'deleted_records';

/* ------------------------------- Helpers ------------------------------- */

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
   MeetingDetailsPanel
================================================================================= */

export default function MeetingDetailsPanel({
  meeting,
  onClose,
  onEdit,
  onUpdate,
  onDeleted,
  onMeetingChange,
}: {
  meeting: any;
  onClose: () => void;
  onEdit: (meeting: any) => void;
  onUpdate: (meeting: any) => void;
  onDeleted: () => void;
  onMeetingChange?: (meeting: any) => void;
}) {
  /* local copy so an inline follow-up save shows immediately */
  const [d, setD] = useState<any>(meeting);
  useEffect(() => { setD(meeting); }, [meeting]);

  /* Follow-up notes expand / inline edit state */
  const [followUpOpen, setFollowUpOpen] = useState(false);
  const [followUpEditing, setFollowUpEditing] = useState(false);
  const [followUpDraft, setFollowUpDraft] = useState('');
  const [followUpSaving, setFollowUpSaving] = useState(false);

  /* Delete confirmation */
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  /* Reset follow-up state whenever a different meeting is opened */
  useEffect(() => {
    setFollowUpOpen(false);
    setFollowUpEditing(false);
    setFollowUpDraft('');
  }, [meeting?.id]);

  /* ESC closes the delete modal first, then the panel */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (showDeleteConfirm) { if (!deleting) setShowDeleteConfirm(false); }
      else onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [showDeleteConfirm, deleting, onClose]);

  function startFollowUpEdit(currentText: string) {
    setFollowUpDraft(currentText);
    setFollowUpEditing(true);
    setFollowUpOpen(true);
  }

  async function saveFollowUpEdit() {
    if (!d?.id || followUpSaving) return;
    const trimmed = followUpDraft.trim();
    setFollowUpSaving(true);
    try {
      const savedField = await saveFollowUpNote(d.id, trimmed);
      if (!savedField) {
        showToast(
          'Couldn’t save the note — your "meetings" collection needs a text field named follow_up_notes (followup_notes / follow_up / followup also work). See the browser console for the field names actually on this record.',
          'error'
        );
        return;
      }
      const next = { ...d, [savedField]: trimmed };
      setD(next);
      onMeetingChange?.(next);
      setFollowUpEditing(false);
      showToast('Follow-up note saved', 'success');
    } catch {
      showToast('Failed to save the note. Please try again.', 'error');
    } finally {
      setFollowUpSaving(false);
    }
  }

  /* Soft delete — archive a snapshot into `deleted_records`, then remove
     from `meetings` (identical to the Meetings page). */
  const confirmDelete = async () => {
    if (!d || deleting) return;
    setDeleting(true);
    let failedStep: 'archive' | 'delete' = 'archive';
    try {
      const { id: originalId, ...recordData } = d;

      await pb.collection(ARCHIVE_COLLECTION).create({
        original_collection: 'meetings',
        original_id: originalId,
        record_type: 'Meeting',
        record_data: recordData,
        deleted_at: new Date().toISOString(),
      });

      failedStep = 'delete';
      await pb.collection('meetings').delete(d.id);

      showToast('Meeting deleted', 'success');
      setShowDeleteConfirm(false);
      onDeleted();
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

  if (!d) return null;

  const sk = getStatusKey(d);
  const st = getStatusStyle(sk);
  const di = formatDate(d.meeting_date || d.created_date);
  const tc = getTypeConfig(d.meeting_type);
  const PanelTypeIcon = tc?.icon;
  const pr = PRIORITY_BADGE[String(d.priority || '').toLowerCase()];

  const notesText = d.agenda_notes || d.notes || d.description || d.details || '';
  const phoneVal = d.contact_phone || d.phone || '';
  const emailVal = d.contact_email || d.email || '';
  const followUpText = d.follow_up_notes || d.followup_notes || d.follow_up || d.followup || '';
  const history = parseHistory(d.status_history);

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: PANEL_CSS }} />

      <div className="fixed inset-0 z-50">
        <div
          className="mdp-overlay absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
          onClick={onClose}
        />

        <aside className="mdp-panel mdp-scroll absolute right-0 top-0 flex h-full w-full flex-col overflow-y-auto bg-white shadow-2xl sm:max-w-xl lg:max-w-2xl">
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
                onClick={onClose}
                className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-400 transition-all hover:border-rose-200 hover:bg-rose-50 hover:text-rose-500 active:scale-90"
                aria-label="Close panel"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Action buttons */}
            <div className="mt-3.5 flex items-center gap-2">
              <button
                onClick={() => onEdit(d)}
                className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-full bg-slate-900 px-4 py-2.5 text-xs font-semibold text-white shadow-md shadow-slate-900/10 transition-all duration-200 hover:-translate-y-0.5 hover:bg-slate-800 active:scale-[0.98]"
              >
                <Edit2 className="h-3.5 w-3.5" /> Edit
              </button>
              <button
                onClick={() => onUpdate(d)}
                className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs font-semibold text-amber-700 transition-all duration-200 hover:-translate-y-0.5 hover:bg-amber-100 active:scale-[0.98]"
              >
                <RotateCcw className="h-3.5 w-3.5" /> Update
              </button>
              <button
                onClick={() => setShowDeleteConfirm(true)}
                className="inline-flex items-center justify-center gap-1.5 rounded-full border border-rose-200 bg-rose-50 px-4 py-2.5 text-xs font-semibold text-rose-600 transition-all duration-200 hover:-translate-y-0.5 hover:bg-rose-100 active:scale-[0.98]"
                aria-label="Delete meeting"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          {/* Body */}
          <div className="flex-1 space-y-4 px-5 py-5">
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

            {/* Follow-up notes — expandable, editable inline */}
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
                  <div className="mdp-fade-in border-t border-amber-200 bg-white px-4 py-3">
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

      {/* Delete confirmation — same as Meetings page */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div
            className="mdp-overlay absolute inset-0 bg-slate-900/50 backdrop-blur-sm"
            onClick={() => !deleting && setShowDeleteConfirm(false)}
          />
          <div className="mdp-scale-in relative w-full max-w-sm rounded-3xl bg-white p-6 shadow-2xl">
            <div className="flex items-start gap-4">
              <span className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-2xl bg-rose-50 text-rose-500">
                <Trash2 className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <h3 className="text-base font-bold text-slate-900">Delete meeting?</h3>
                <p className="mt-1 text-sm text-slate-500">
                  <span className="font-semibold text-slate-700">"{getMeetingTitle(d)}"</span> will be removed from the list and archived, so it can be recovered later if needed.
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
    </>
  );
}