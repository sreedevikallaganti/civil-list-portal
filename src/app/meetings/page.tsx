'use client';

/* ================================================================
   MeetingsPage — v29
   NEW (v29) — "met before" reminder:
     After a NEW meeting is saved in another city (not the home city),
     a popup lists the people the MD has met in that city before and
     isn't already meeting on this visit (±3 days): "You've met these
     4 people in Dubai before. Meet them again?" → Schedule (opens a
     pre-filled new meeting on the same date & city) or Not now.
     Scheduling one person and saving brings the popup back with the
     rest. "Maybe later" hides it for that visit.
   v28 — cleanup:
     (1) Action items REMOVED completely. No more `meeting_actions`
         requests (that collection never existed → the 404s in the
         console). useOpenActions / MinutesActions are no longer used.
     (2) Minutes of Meeting is now a simple built-in card in the
         detail panel (MinutesOfMeetingCard): write the MoM, Save, and
         optionally attach MoM files (stored in the meeting's existing
         `documents` field). Saving checks the value really landed —
         if the `minutes` field is missing you get a clear toast.
     (3) Unused TodayHero leftovers and old 12-hour helpers removed.
     (4) pb.files.getURL() used (getUrl kept as fallback).
   v27 (kept): participant history, duplicate, undo delete, empty state.
   v26 (kept): slot-conflict protection for Reschedule.
   v25 / v24 / v23 / v22 / v17 (kept): KPI-card scroll, overdue banner,
         badge-as-status-dropdown, past-time guard, follow-up note
         helpers, quick status / notes popovers, keyboard shortcuts,
         bulk selection, command palette, status-history trail,
         drag-and-drop/paste documents.
================================================================ */

import {
  Suspense, useEffect, useRef, useState,
} from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Calendar, CalendarClock, CheckCircle2, RotateCcw, XCircle, Clock, MapPin, Search, Plus, Edit2, Trash2, X, ChevronRight, ChevronLeft, ChevronDown, User, Briefcase, Tag, AlignLeft, FileText, Phone, Mail, ArrowUpDown, Loader2, RefreshCw, CalendarDays, StickyNote, Check, AlertTriangle, Command, History, Copy, MessageCircle,
} from 'lucide-react';
import pb from '@/lib/pocketbase';
import CreateMeetingPanel from '@/components/CreateMeetingPanel';
import {
  showToast,
} from '@/components/Toaster';

import ParticipantHistory from '@/components/meetings/ParticipantHistory';
import UndoBar, { UNDO_MS } from '@/components/meetings/UndoBar';
import RevisitPopup from '@/components/meetings/RevisitPopup';
import {
  findPeopleToRevisit, personKey, type RevisitPerson,
} from '@/lib/revisit';
import {
  cityKey, cityLabel, findCity, isHomeCity,
} from '@/lib/cities';
import {
  useAuth,
} from '@/contexts/AuthContext';
import {
  canEdit, canManageIntegrations,
} from '@/lib/roles';
import {
  reconnectGoogle, removeGoogleEvent,
} from '@/lib/apiClient';
import {
  completedTooEarly,
} from '@/lib/meetingRules';
import DayBriefPanel from '@/components/meetings/DayBriefPanel';

/* ----------------------------- Global CSS / Animations ----------------------------- */

import {
  CustomStyles, STATUS_STYLES, STATUS_ORDER, whatsappLink, getTypeConfig, PRIORITY_BADGE, STAT_CARDS, DIST_SEGMENTS, PER_PAGE_OPTIONS, ARCHIVE_COLLECTION, DEFAULT_SORT, SORT_GROUPS, ALL_SORT_OPTIONS, PRIORITY_WEIGHT, getPaginationRange, dayTag, parseHistory, appendStatusHistory, saveFollowUpNote, AnimatedNumber, InfoTile, MinutesOfMeetingCard, PopoverPos, popoverPosition, QuickStatusPopover, NotesPopover, CommandPalette, InlineUpdateStatusPanel,
} from '@/components/meetings/meetingsPageParts';


/* useSearchParams needs a Suspense boundary (links from notifications carry ?open= / ?schedule= …) */
export default function MeetingsPage() {
  return (
    <Suspense>
      <MeetingsPageContent />
    </Suspense>
  );
}

function MeetingsPageContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
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
  const [deleting] = useState(false);

  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false);

  const [updateMeeting, setUpdateMeeting] = useState<any>(null);

  /* Follow-up notes expand / inline edit state (detail panel) */
  const [followUpOpen, setFollowUpOpen] = useState(false);
  const [followUpEditing, setFollowUpEditing] = useState(false);
  const [followUpDraft, setFollowUpDraft] = useState('');
  const [followUpSaving, setFollowUpSaving] = useState(false);

  /* Pagination */
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(8);

  /* quick status popover */
const [quickStatus, setQuickStatus] = useState<{ id: string; pos: PopoverPos } | null>(null);
  const [hoveredRowId, setHoveredRowId] = useState<string | null>(null);
  /* synchronous mirror of hoveredRowId — source of truth for the 1-4 shortcut */
  const hoveredRowIdRef = useRef<string | null>(null);

  /* notes popover */
const [notesPopover, setNotesPopover] = useState<{ id: string; pos: PopoverPos; text: string } | null>(null);
  /* bulk selection */
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);

  /* overdue banner */
  const [overdueDismissed, setOverdueDismissed] = useState(false);

  /* command palette */
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);

  const tableRef = useRef<HTMLDivElement>(null);

  /* participant history / duplicate / undo delete */
  const [historyPerson, setHistoryPerson] = useState<{ id?: string; name: string } | null>(null);
  const [duplicateSource, setDuplicateSource] = useState<any>(null);
  const [pendingDelete, setPendingDelete] = useState<{ records: any[]; message: string; startedAt: number } | null>(null);
  const pendingDeleteRef = useRef<{ records: any[]; timer: ReturnType<typeof setTimeout> } | null>(null);

  /* ★ v29: "met before" popup — which visit it's for, and who was skipped */
  const [revisit, setRevisit] = useState<{ city: string; cityLabel: string; date: string; exclude: string[] } | null>(null);
  const [revisitSkips, setRevisitSkips] = useState<Record<string, string[]>>({});
  const [revisitClosed, setRevisitClosed] = useState<Set<string>>(new Set());

  /* day brief panel */
  const [dayBriefOpen, setDayBriefOpen] = useState(false);

  /* roles — viewers get a read-only page (PocketBase rules enforce the same on the server) */
  const { user } = useAuth();
  const editable = canEdit(user);
  const isAdmin = canManageIntegrations(user);
  const viewOnly = () => { showToast('Your account is view-only — ask an admin for edit access.', 'error'); return false; };

  const [distMounted, setDistMounted] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setDistMounted(true), 150);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => { loadData(); }, []);

  /* deep links from notifications / the visit planner:
       ?open=<meetingId>                         → open that meeting's details
       ?schedule=<meetingId>&date=&city=         → new meeting with that person, on that visit
       ?person=<IAS|IPS|Contact>:<id>&date=&city= → new meeting with a directory person
       ?filter=<status>                          → filter the list */
  useEffect(() => {
    if (loading || !searchParams.toString()) return;
    const q = new URLSearchParams(searchParams.toString());
    router.replace('/meetings', { scroll: false }); // handle once
    const prefill = {
      meeting_date: q.get('date') || '', city: q.get('city') || '', meeting_place: 'Outside',
      agenda: '', meeting_time: '', location: '', follow_up_date: '', follow_up_notes: '',
    };
    const byId = (id: string) => meetings.find((m) => m.id === id);

    if (q.get('open')) {
      const id = q.get('open')!;
      const m = byId(id);
      if (m) setSelectedMeeting(m);
      else fetchFreshMeeting(id).then((r) => r && setSelectedMeeting(r));
    } else if (q.get('schedule')) {
      const m = byId(q.get('schedule')!);
      if (m) openDuplicate(m, { __prefill: prefill });
    } else if (q.get('person')) {
      const [kind, id] = q.get('person')!.split(':');
      const col = kind === 'IAS' ? 'ias_officers' : kind === 'IPS' ? 'ips_officers' : 'other_contacts';
      pb.collection(col).getOne(id).then((o: any) => {
        openDuplicate({
          officer_name: o.name, officer_id: o.id, officer_type: kind === 'Contact' ? 'Other' : kind,
          designation: o.current_position || o.designation || '', current_position: o.current_position || o.designation || '',
          email: o.email || '', contact_number: o.contact_number || o.mobile_no || '',
          cadre: o.cadre || '', state: o.state || '', batch_year: o.batch_year || '', department: o.department || '',
          meeting_type: 'External',
        }, { __prefill: prefill });
      }).catch(() => showToast('Couldn’t load that person from the directory.', 'error'));
    } else if (q.get('filter')) {
      setStatusFilter(q.get('filter')!);
      requestAnimationFrame(() => tableRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, searchParams]);

  /* live updates — changes made by anyone (or another tab) show up without a refresh */
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    let unsub: (() => void) | null = null;
    let cancelled = false;
    pb.collection('meetings')
      .subscribe('*', () => {
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => loadData({ silent: true }), 400); // one reload per burst
      })
      .then((fn) => { if (cancelled) fn(); else unsub = fn; })
      // status 0 = the attempt was cancelled (dev mode mounts twice) — not a real failure
      .catch((e) => { if (e?.status !== 0 && !e?.isAbort) console.warn('[meetings] live updates unavailable:', e); });
    return () => { cancelled = true; if (timer) clearTimeout(timer); unsub?.(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { setPage(1); }, [searchQuery, statusFilter, typeFilter, priorityFilter, sortBy, perPage]);

  useEffect(() => {
    setFollowUpOpen(false);
    setFollowUpEditing(false);
    setFollowUpDraft('');
  }, [selectedMeeting?.id]);

  const anyModalOpen = isPanelOpen || !!updateMeeting || !!selectedMeeting || showDeleteConfirm || showBulkDeleteConfirm || commandPaletteOpen || !!historyPerson || !!revisit || dayBriefOpen;

  /* Esc closes the day brief */
  useEffect(() => {
    if (!dayBriefOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setDayBriefOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [dayBriefOpen]);

  async function handleReconnectGoogle() {
    try { await reconnectGoogle(); }
    catch (e: any) { showToast(e?.message || 'Could not start the Google connection', 'error'); }
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'Escape' || isPanelOpen || updateMeeting || historyPerson || revisit) return;
      if (showBulkDeleteConfirm) setShowBulkDeleteConfirm(false);
      else if (showDeleteConfirm) setShowDeleteConfirm(false);
      else if (commandPaletteOpen) setCommandPaletteOpen(false);
      else setSelectedMeeting(null);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedMeeting, showDeleteConfirm, showBulkDeleteConfirm, isPanelOpen, updateMeeting, commandPaletteOpen, historyPerson, revisit]);

  /* global shortcuts — Cmd/Ctrl+K, N, 1–4 */
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
    if (!editable) return viewOnly();
    setEditingMeeting(null);
    setDuplicateSource(null);
    setIsPanelOpen(true);
  };

  const openDuplicate = async (source: any, overrides: Record<string, any> = {}) => {
    if (!editable) return viewOnly();
    const fresh = source?.id ? await fetchFreshMeeting(source.id) : null;
    setSelectedMeeting(null);
    setHistoryPerson(null);
    setEditingMeeting(null);
    setDuplicateSource({ ...(fresh || source), ...overrides });
    setIsPanelOpen(true);
  };

async function loadData({ silent = false }: { silent?: boolean } = {}) {
  try {
    if (!silent) setLoading(true);
    // the meetings collection has no `created` field (sorting by it returns 400) — the client sort handles order
    const meetingsData: any[] = await pb.collection('meetings').getFullList();
    const pendingIds = new Set((pendingDeleteRef.current?.records || []).map((r: any) => r.id));
    setMeetings(meetingsData.filter((m: any) => !m.deleted && !pendingIds.has(m.id)));
  } catch (error) {
    console.error('Error loading data:', error);
  } finally {
    setLoading(false);
  }
}

  const fetchFreshMeeting = async (id: string) => {
    try {
      return await pb.collection('meetings').getOne(id);
    } catch {
      return null;
    }
  };

  const handleEdit = async () => {
    if (!selectedMeeting) return;
    if (!editable) return viewOnly();
    const snapshot = selectedMeeting;
    setSelectedMeeting(null);
    const fresh = await fetchFreshMeeting(snapshot.id);
    setEditingMeeting(fresh || snapshot);
    setIsPanelOpen(true);
  };

  const handleOpenUpdate = async () => {
    if (!selectedMeeting) return;
    if (!editable) return viewOnly();
    const snapshot = selectedMeeting;
    setSelectedMeeting(null);
    const fresh = await fetchFreshMeeting(snapshot.id);
    setUpdateMeeting(fresh || snapshot);
  };

  const handlePanelSaved = () => {
    setIsPanelOpen(false);
    setEditingMeeting(null);
    setDuplicateSource(null);
    loadData();
  };

  const handlePanelClosed = () => {
    setIsPanelOpen(false);
    setEditingMeeting(null);
    setDuplicateSource(null);
  };

  /* ------------------------------- v29: "met before" popup ------------------------------- */

  const visitKey = (city: string, date: string) => `${city}|${date}`;

  /* after a NEW meeting in another city → offer people met there before */
function handleMeetingSaved(rec: any) {
  /* only new, non-cancelled meetings in a recognised city other than home */
  if (!rec?.__isNew) return;
  if (String(rec.status || '').toLowerCase() === 'cancelled') return;

  const city = cityKey(rec.city) || findCity(rec.location)?.key || null;
  const date = String(rec.meeting_date || '').slice(0, 10);
  if (!city || isHomeCity(city) || !date) return;
  if (revisitClosed.has(visitKey(city, date))) return;

  const exclude = [
    personKey(rec),
    ...String(rec.attendees || '').split(',').map((e: string) => e.trim()).filter(Boolean).map((e: string) => `email:${e.toLowerCase()}`),
  ];

  setRevisit({
    city,
    cityLabel: cityLabel(city, String(rec.city || '').split(',')[0].trim()),
    date,
    exclude,
  });
}

  /* who to show — recomputed live, so it updates as meetings reload */
  const revisitPeople: RevisitPerson[] = revisit
    ? findPeopleToRevisit(meetings, {
        city: revisit.city,
        date: revisit.date,
        exclude: [...revisit.exclude, ...(revisitSkips[visitKey(revisit.city, revisit.date)] || [])],
      })
    : [];

  /* nobody left to suggest → drop the popup so shortcuts work again */
  useEffect(() => {
    if (revisit && !isPanelOpen && revisitPeople.length === 0) setRevisit(null);
  }, [revisit, isPanelOpen, revisitPeople.length]);

  /* Schedule → new meeting pre-filled with that person, same date & city */
  function scheduleRevisit(p: RevisitPerson) {
    if (!revisit) return;
    const { date, cityLabel: label } = revisit;
    setRevisit(null);
    openDuplicate(p.lastMeeting, {
      __prefill: {
        meeting_date: date, city: label, meeting_place: 'Outside',
        agenda: '', meeting_time: '', location: '', follow_up_date: '', follow_up_notes: '',
      },
    });
  }

  function skipRevisit(p: RevisitPerson) {
    if (!revisit) return;
    const k = visitKey(revisit.city, revisit.date);
    setRevisitSkips((prev) => ({ ...prev, [k]: [...(prev[k] || []), p.key] }));
  }

  function closeRevisit() {
    if (revisit) {
      const k = visitKey(revisit.city, revisit.date);
      setRevisitClosed((prev) => new Set(prev).add(k));
    }
    setRevisit(null);
  }

  /* archive one record into `deleted_records`, then delete it */
  async function archiveAndDelete(record: any, deletedAt: string) {
    const { id: originalId, ...recordData } = record;
    await pb.collection(ARCHIVE_COLLECTION).create({
      original_collection: 'meetings',
      original_id: originalId,
      record_type: 'Meeting',
      record_data: recordData,
      deleted_at: deletedAt,
    });
    await pb.collection('meetings').delete(originalId);
  }

  /* delete with Undo — real archive + delete runs after UNDO_MS */
  async function commitPendingDelete() {
    const pending = pendingDeleteRef.current;
    if (!pending) return;
    clearTimeout(pending.timer);
    pendingDeleteRef.current = null;
    setPendingDelete(null);
    const deletedAt = new Date().toISOString();
    const results = await Promise.allSettled(pending.records.map(async (r) => {
      await archiveAndDelete(r, deletedAt);
      removeGoogleEvent(r, { clearRecord: false }); // record is gone — just drop the calendar event
    }));
    const failed = results.filter((r) => r.status === 'rejected').length;
    if (failed) {
      showToast(`${failed} meeting${failed > 1 ? 's' : ''} could not be archived/deleted and ${failed > 1 ? 'were' : 'was'} restored.`, 'error');
      loadData();
    }
  }

  function scheduleDelete(records: any[]) {
    if (!records.length) return;
    if (!editable) { viewOnly(); return; }
    if (pendingDeleteRef.current) commitPendingDelete();
    const ids = new Set(records.map((r) => r.id));
    setMeetings((prev) => prev.filter((m) => !ids.has(m.id)));
    const timer = setTimeout(() => { commitPendingDelete(); }, UNDO_MS);
    pendingDeleteRef.current = { records, timer };
    setPendingDelete({
      records,
      startedAt: Date.now(),
      message: records.length === 1 ? 'Meeting deleted' : `${records.length} meetings deleted`,
    });
  }

  function undoDelete() {
    const pending = pendingDeleteRef.current;
    if (!pending) return;
    clearTimeout(pending.timer);
    pendingDeleteRef.current = null;
    setPendingDelete(null);
    setMeetings((prev) => {
      const have = new Set(prev.map((m) => m.id));
      return [...prev, ...pending.records.filter((r) => !have.has(r.id))];
    });
    showToast('Restored', 'success');
  }

  useEffect(() => {
    const flush = () => { if (pendingDeleteRef.current) commitPendingDelete(); };
    window.addEventListener('beforeunload', flush);
    return () => { window.removeEventListener('beforeunload', flush); flush(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const confirmDelete = async () => {
    if (!selectedMeeting || deleting) return;
    scheduleDelete([selectedMeeting]);
    setSelectedMeeting(null);
    setShowDeleteConfirm(false);
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
    return `${date.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' })} · ${date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })}`;
  };

  const formatDateShort = (value: any): string => {
    const raw = String(value || '');
    const iso = raw.length > 10 ? raw.slice(0, 10) : raw;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return '—';
    return new Date(`${iso}T00:00:00`).toLocaleDateString('en-US', { day: 'numeric', month: 'short' });
  };

  const meetingDateTs = (m: any) => dateToTime(m.meeting_date) || dateToTime(m.created_date);
/* creation time — custom created_date, else PocketBase's built-in `created` */
const createdRaw = (m: any) => m?.created_date || m?.created || m?.updated_date || m?.updated || '';
const createdTs = (m: any) => dateToTime(createdRaw(m));

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

  /* always 24-hour HH:mm (old "2:30 PM" values are converted) */
  const formatTimeDisplay = (timeString: string): string => {
    if (!timeString) return '—';
    const match = timeString.trim().match(/(\d{1,2}):(\d{2})(?:\s*(AM|PM))?/i);
    if (!match) return timeString.includes(':') ? timeString : '—';
    const hour = parseInt(match[1], 10);
    const minutes = match[2];
    const meridiem = match[3]?.toUpperCase();
    const h24 = meridiem ? (hour % 12) + (meridiem === 'PM' ? 12 : 0) : hour;
    return `${String(h24).padStart(2, '0')}:${minutes}`;
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

  /* ------------------------------- quick status / bulk / popovers ------------------------------- */

  /* Optimistic status update. "Rescheduled" opens the Update panel instead. */
  async function updateStatusInline(meeting: any, key: string) {
    setQuickStatus(null);
    if (!editable) { viewOnly(); return; }
    if (key === 'rescheduled') {
      const fresh = await fetchFreshMeeting(meeting.id);
      setUpdateMeeting({ ...(fresh || meeting), __forceStatus: 'rescheduled' });
      return;
    }
    const label = STATUS_STYLES[key]?.label || key;
    const tooEarly = completedTooEarly(meeting, label);
    if (tooEarly) { showToast(tooEarly, 'error'); return; }
    const prevSnapshot = meetings;
    setMeetings((prev) => prev.map((m) => (m.id === meeting.id ? { ...m, status: label, status_flag: label } : m)));
    try {
      await pb.collection('meetings').update(meeting.id, { status: label, status_flag: label });
      appendStatusHistory(meeting.id, meeting.status_history, label).catch(() => {});
      if (key === 'cancelled') removeGoogleEvent(meeting); // attendees get Google's cancellation notice
    } catch {
      setMeetings(prevSnapshot);
      showToast('Failed to update status. Please try again.', 'error');
    }
  }

function openQuickStatus(e: React.MouseEvent, meeting: any) {
  e.stopPropagation();
  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
  setQuickStatus({ id: meeting.id, pos: popoverPosition(rect, 210) });
}

function openNotesPopover(e: React.MouseEvent, meeting: any, text: string) {
  e.stopPropagation();
  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
  setNotesPopover({ id: meeting.id, pos: popoverPosition(rect, 260), text });
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
    if (!editable) { viewOnly(); return; }
    const label = STATUS_STYLES[key]?.label || key;
    const early = meetings.filter((m) => selectedIds.has(m.id) && completedTooEarly(m, label));
    if (early.length) {
      showToast(`${early.length} of the selected meeting${early.length > 1 ? 's haven’t' : ' hasn’t'} happened yet, so ${early.length > 1 ? 'they' : 'it'} can’t be marked Completed. Unselect ${early.length > 1 ? 'them' : 'it'} and try again.`, 'error');
      return;
    }
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
        if (key === 'cancelled' && m) removeGoogleEvent(m);
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

  async function performBulkDelete() {
    if (bulkBusy || selectedIds.size === 0) return;
    const records = meetings.filter((m) => selectedIds.has(m.id));
    scheduleDelete(records);
    clearSelection();
    setShowBulkDeleteConfirm(false);
  }

  /* ------------------------------- inline follow-up note edit ------------------------------- */

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
          'Couldn’t save the note — your "meetings" collection needs a text field named follow_up_notes. See the browser console for the field names actually on this record.',
          'error'
        );
        return;
      }
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

  const overdueMeetings = meetings.filter(
    (m) => getStatusKey(m) === 'scheduled' && dayTag(m.meeting_date || m.created_date, 'scheduled')?.label === 'Overdue'
  );

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

          <div className="flex flex-wrap items-center gap-2">
            {isAdmin && (
              <button
                onClick={handleReconnectGoogle}
                title="Re-authorise the Google account used for Calendar, Meet and invites"
                className="hidden items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3.5 py-2.5 text-xs font-semibold text-slate-500 transition-colors hover:border-violet-200 hover:text-violet-600 lg:inline-flex"
              >
                <RefreshCw className="h-3.5 w-3.5" /> Reconnect Google
              </button>
            )}

            <button
              onClick={() => setDayBriefOpen(true)}
              title="Printable prep sheet for a day"
              className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3.5 py-2.5 text-xs font-semibold text-slate-600 transition-colors hover:border-violet-200 hover:text-violet-600"
            >
              <FileText className="h-3.5 w-3.5" /> Day brief
            </button>

            <button
              onClick={() => setCommandPaletteOpen(true)}
              className="hidden items-center gap-2 rounded-full border border-slate-200 bg-white px-3.5 py-2.5 text-xs font-semibold text-slate-500 transition-colors hover:border-violet-200 hover:text-violet-600 sm:inline-flex"
            >
              <Command className="h-3.5 w-3.5" />
              Search
              <kbd className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-400">⌘K</kbd>
            </button>

            {editable ? (
              <button
                onClick={openCreate}
                className="group inline-flex items-center justify-center gap-2 rounded-full bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-slate-900/10 transition-all duration-300 hover:-translate-y-0.5 hover:bg-slate-800 active:scale-[0.98]"
              >
                <Plus className="h-4 w-4 transition-transform duration-300 group-hover:rotate-90" />
                New Meeting
                <kbd className="ml-1 hidden rounded-md bg-white/20 px-1.5 py-0.5 text-[10px] font-bold ring-1 ring-inset ring-white/30 sm:inline">N</kbd>
              </button>
            ) : (
              <span className="rounded-full bg-slate-100 px-3.5 py-2 text-xs font-semibold text-slate-500">View only</span>
            )}
          </div>
        </div>

        {/* ------------------------------- Content ------------------------------ */}
        <div className="space-y-6 bg-[#f7f6fd] p-4 sm:p-6 lg:p-7">

          {/* ------------------------- Overdue banner ------------------------ */}
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
                  <h3 className="mt-5 text-base font-bold text-slate-800">
                    {meetings.length === 0 ? 'Welcome! Let’s schedule your first meeting' : 'No meetings match these filters'}
                  </h3>
                  <p className="mt-1 max-w-xs text-sm text-slate-500">
                    {meetings.length === 0
                      ? 'Pick a participant, a date and a free time slot — it takes less than a minute.'
                      : 'Try a different search, or clear the filters to see everything.'}
                  </p>
                  {meetings.length > 0 && (searchQuery || statusFilter !== 'all' || typeFilter !== 'all' || priorityFilter !== 'all') && (
                    <button
                      onClick={() => { setSearchQuery(''); setStatusFilter('all'); setTypeFilter('all'); setPriorityFilter('all'); }}
                      className="mt-4 inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-50"
                    >
                      <X className="h-3.5 w-3.5" /> Clear filters
                    </button>
                  )}
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

                  const createdMs = createdTs(meeting);
                  const createdDateStr = createdMs
                    ? new Date(createdMs).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' })
                    : '—';
                  const createdTimeStr = createdMs
                    ? new Date(createdMs).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
                    : '';

                  const priority = PRIORITY_BADGE[String(meeting.priority || '').toLowerCase()];
                  const followUpText = String(meeting.follow_up_notes || meeting.followup_notes || meeting.follow_up || meeting.followup || '');
                  const hasFollowUp = !!followUpText;
                  const hasMinutes = !!String(meeting.minutes || '').trim();
                  const isSelected = selectedIds.has(meeting.id);
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
                            {hasMinutes && (
                              <span
                                className="inline-flex shrink-0 items-center gap-1 rounded-full bg-violet-50 px-1.5 py-0.5 text-[10px] font-bold text-violet-700 ring-1 ring-inset ring-violet-500/20"
                                title="Minutes of meeting recorded"
                              >
                                <FileText className="h-2.5 w-2.5" /> MoM
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
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); setHistoryPerson({ id: meeting.officer_id, name: meeting.officer_name }); }}
                              title="See all meetings with this person"
                              className="mt-1 flex max-w-full items-center gap-1.5 rounded-md text-left text-xs text-slate-500 transition-colors hover:text-violet-600 hover:underline"
                            >
                              <User className="h-3 w-3 shrink-0 text-slate-400" />
                              <span className="truncate">with {meeting.officer_name}</span>
                            </button>
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

                        <div className="col-span-1 flex items-center justify-center pl-3">
                          <button
                            onClick={(e) => openQuickStatus(e, meeting)}
                            className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-semibold transition-all duration-150 hover:-translate-y-0.5 hover:shadow-sm active:scale-95 ${style.badge}`}
                            title="Click to change status"
                          >
                            <span className={`h-1.5 w-1.5 rounded-full ${style.dot} ${statusKey === 'scheduled' ? 'animate-pulse' : ''}`} />
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
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); setHistoryPerson({ id: meeting.officer_id, name: meeting.officer_name }); }}
                                className="mt-1 flex max-w-full items-center gap-1.5 text-left text-xs text-slate-500 underline-offset-2 active:text-violet-600"
                              >
                                <User className="h-3 w-3 shrink-0 text-slate-400" />
                                <span className="truncate">with {meeting.officer_name}</span>
                              </button>
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
                              {hasMinutes && (
                                <span className="inline-flex items-center gap-1 rounded-full bg-violet-50 px-2 py-0.5 text-[10px] font-semibold text-violet-700 ring-1 ring-inset ring-violet-500/20">
                                  <FileText className="h-2.5 w-2.5" /> MoM
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

      {/* ------------------------------ Day brief ------------------------------ */}
      {dayBriefOpen && (
        <DayBriefPanel
          meetings={meetings}
          onClose={() => setDayBriefOpen(false)}
          onOpenMeeting={(m) => { setDayBriefOpen(false); setSelectedMeeting(m); }}
        />
      )}

      {/* ------------------------- Quick status popover ------------------------ */}
{quickStatus && (() => {
  const m = meetings.find((mm) => mm.id === quickStatus.id);
  if (!m) return null;
  return (
    <QuickStatusPopover
      pos={quickStatus.pos}
      current={getStatusKey(m)}
      onPick={(key) => updateStatusInline(m, key)}
      onClose={() => setQuickStatus(null)}
    />
  );
})()}

{notesPopover && (
  <NotesPopover
    pos={notesPopover.pos}
    text={notesPopover.text}
    onClose={() => setNotesPopover(null)}
    onOpenFull={() => {
      const m = meetings.find((mm) => mm.id === notesPopover.id);
      setNotesPopover(null);
      if (m) { setSelectedMeeting(m); setFollowUpOpen(true); }
    }}
  />
)}

      {/* ------------------------- Command palette ------------------------ */}
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

      {/* ------------------------- Bulk action bar (hidden while any panel is open) ------------------------ */}
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

        const followUpText = d.follow_up_notes || d.followup_notes || d.follow_up || d.followup || '';

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
                        <span className={`h-1.5 w-1.5 rounded-full ${st.dot} ${sk === 'scheduled' ? 'animate-pulse' : ''}`} />
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
                    onClick={() => setSelectedMeeting(null)}
                    className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-400 transition-all hover:border-rose-200 hover:bg-rose-50 hover:text-rose-500 active:scale-90"
                    aria-label="Close panel"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

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
                    onClick={() => openDuplicate(d)}
                    title="Duplicate — create a new meeting with the same details"
                    className="inline-flex items-center justify-center gap-1.5 rounded-full border border-slate-200 bg-white px-4 py-2.5 text-xs font-semibold text-slate-600 transition-all duration-200 hover:-translate-y-0.5 hover:border-violet-200 hover:text-violet-700 active:scale-[0.98]"
                  >
                    <Copy className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">Duplicate</span>
                  </button>
                  <button
                    onClick={() => setShowDeleteConfirm(true)}
                    title="Delete"
                    className="inline-flex items-center justify-center gap-1.5 rounded-full border border-rose-200 bg-rose-50 px-4 py-2.5 text-xs font-semibold text-rose-600 transition-all duration-200 hover:-translate-y-0.5 hover:bg-rose-100 active:scale-[0.98]"
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
                    {d.city && <span className="mt-0.5 block text-[11px] font-medium text-slate-400">{d.city}</span>}
                  </InfoTile>
                  <InfoTile icon={User} tint="bg-emerald-50 text-emerald-600" label="Officer">
                    <span className="break-words">{d.officer_name || '—'}</span>
                    {d.officer_name && (
                      <button
                        onClick={() => setHistoryPerson({ id: d.officer_id, name: d.officer_name })}
                        className="mt-1 block text-[11px] font-semibold text-violet-600 hover:underline"
                      >
                        View history →
                      </button>
                    )}
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

                {/* ★ v28: minutes of meeting (no action items) */}
                <MinutesOfMeetingCard
                  meeting={d}
                  onPatched={(patch) => {
                    setSelectedMeeting((prev: any) => (prev ? { ...prev, ...patch } : prev));
                    setMeetings((prev) => prev.map((m) => (m.id === d.id ? { ...m, ...patch } : m)));
                  }}
                />

                {notesText && (
                  <InfoTile icon={AlignLeft} tint="bg-indigo-50 text-indigo-600" label="Agenda / Notes">
                    <p className="whitespace-pre-wrap break-words font-normal leading-relaxed text-slate-700">
                      {notesText}
                    </p>
                  </InfoTile>
                )}

                {phoneVal && (
                  <InfoTile icon={Phone} tint="bg-rose-50 text-rose-600" label="Phone">
                    <span className="flex flex-wrap items-center gap-2">
                      {phoneVal}
                      {whatsappLink(phoneVal, d) && (
                        <a
                          href={whatsappLink(phoneVal, d)!}
                          target="_blank"
                          rel="noreferrer"
                          title="Opens WhatsApp with a reminder message ready to send"
                          className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-500/20 hover:bg-emerald-100"
                        >
                          <MessageCircle className="h-3.5 w-3.5" /> WhatsApp reminder
                        </a>
                      )}
                    </span>
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
                          return Number.isNaN(t) ? '' : new Date(t).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
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

      {/* ------------------------- Bulk delete confirmation ------------------------ */}
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
      {isPanelOpen && (
        <CreateMeetingPanel
          key={editingMeeting ? `edit-${editingMeeting.id}` : duplicateSource ? `dup-${duplicateSource.id || 'new'}` : 'create'}
          isOpen
          editingMeeting={editingMeeting}
          duplicateFrom={editingMeeting ? null : duplicateSource}
          onClose={handlePanelClosed}
          onSuccess={handlePanelSaved}
          pastMeetings={meetings}
          onSavedMeeting={handleMeetingSaved}
        />
      )}

      {/* -------- v29: "you've met these people here before" -------- */}
      {revisit && !isPanelOpen && revisitPeople.length > 0 && (
        <RevisitPopup
          cityLabel={revisit.cityLabel}
          date={revisit.date}
          people={revisitPeople}
          onSchedule={scheduleRevisit}
          onSkip={skipRevisit}
          onClose={closeRevisit}
        />
      )}

      {/* -------- participant history (no action items) -------- */}
      {historyPerson && (
        <ParticipantHistory
          person={historyPerson}
          meetings={meetings}
          onClose={() => setHistoryPerson(null)}
          onOpenMeeting={(m) => { setHistoryPerson(null); setSelectedMeeting(m); }}
          onScheduleWith={(m) => openDuplicate(m, {
            agenda: '', meeting_date: '', meeting_time: '', follow_up_date: '', follow_up_notes: '', minutes: '',
          })}
        />
      )}

      {/* -------- undo delete -------- */}
      {pendingDelete && (
        <UndoBar message={pendingDelete.message} startedAt={pendingDelete.startedAt} onUndo={undoDelete} />
      )}

      {/* -------- Update status panel -------- */}
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
