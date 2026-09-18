'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  Calendar, CalendarClock, CheckCircle2, RotateCcw, XCircle,
  Clock, MapPin, Search, Plus, Edit2, Trash2, X, ChevronRight, ChevronLeft,
  ChevronDown, User, Briefcase, Tag, AlignLeft, FileText, Phone, Mail,
  ArrowUpDown, Loader2, RefreshCw, CalendarDays
} from 'lucide-react';
import pb from '@/lib/pocketbase';
import CreateMeetingPanel from '@/components/CreateMeetingPanel';
import MeetingUpdatePanel from '@/components/MeetingUpdatePanel';

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

const TYPE_STYLES: Record<string, string> = {
  internal: 'bg-violet-50 text-violet-700 ring-1 ring-inset ring-violet-600/15',
  external: 'bg-sky-50 text-sky-700 ring-1 ring-inset ring-sky-600/15',
};
const getTypeStyle = (t: any) =>
  TYPE_STYLES[String(t || '').toLowerCase()] || 'bg-gray-100 text-gray-600 ring-1 ring-inset ring-gray-500/15';

const PRIORITY_BADGE: Record<string, { badge: string; text: string; dot: string }> = {
  high:   { badge: 'bg-rose-50 text-rose-700 ring-1 ring-inset ring-rose-600/20',   text: 'text-rose-600',   dot: 'bg-rose-300' },
  medium: { badge: 'bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-600/20', text: 'text-amber-600', dot: 'bg-amber-300' },
  low:    { badge: 'bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-600/20', text: 'text-emerald-600', dot: 'bg-emerald-300' },
};

/* ---------------------------- KPI / Stat card config (pastel, reference style) ---------------------------- */

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
  { key: 'rejected',    label: 'Rejected',    bar: 'bg-slate-400' },
];

const PER_PAGE_OPTIONS = [8, 12, 24, 48];

/* ------------------------------- Sort options ------------------------------ */

const DEFAULT_SORT = 'created-desc';

const SORT_GROUPS: { group: string; options: { value: string; label: string }[] }[] = [
  {
    group: 'Created',
    options: [
      { value: 'created-desc', label: 'Newest Created' },
      { value: 'created-asc',  label: 'Oldest Created' },
    ],
  },
  {
    group: 'Meeting Date',
    options: [
      { value: 'date-desc', label: 'Newest Date' },
      { value: 'date-asc',  label: 'Oldest Date' },
    ],
  },
  {
    group: 'Meeting Time',
    options: [
      { value: 'time-asc',  label: 'Earliest Time' },
      { value: 'time-desc', label: 'Latest Time' },
    ],
  },
  {
    group: 'Duration',
    options: [
      { value: 'duration-desc', label: 'Longest First' },
      { value: 'duration-asc',  label: 'Shortest First' },
    ],
  },
  {
    group: 'Priority',
    options: [
      { value: 'priority-desc', label: 'High → Low' },
      { value: 'priority-asc',  label: 'Low → High' },
    ],
  },
  {
    group: 'Agenda',
    options: [
      { value: 'agenda-asc',  label: 'A → Z' },
      { value: 'agenda-desc', label: 'Z → A' },
    ],
  },
  {
    group: 'Officer',
    options: [
      { value: 'officer-asc',  label: 'A → Z' },
      { value: 'officer-desc', label: 'Z → A' },
    ],
  },
];

const ALL_SORT_OPTIONS = SORT_GROUPS.flatMap((g) => g.options);

const PRIORITY_WEIGHT: Record<string, number> = { high: 3, medium: 2, low: 1 };

function getPaginationRange(current: number, total: number): (number | 'dots')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  if (current <= 4) return [1, 2, 3, 4, 5, 'dots', total];
  if (current >= total - 3) return [1, 'dots', total - 4, total - 3, total - 2, total - 1, total];
  return [1, 'dots', current - 1, current, current + 1, 'dots', total];
}

/* --------------------------- Date helpers (module scope) --------------------------- */

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

/* ------------------------- Animated count-up number ------------------------- */

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

/* ------------------------------ Info tile (panel) ----------------------------- */

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

/* ================================================================================= */

export default function MeetingsPage() {
  const [meetings, setMeetings] = useState<any[]>([]);
  const [selectedMeeting, setSelectedMeeting] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [priorityFilter, setPriorityFilter] = useState<string>('all');

  const [sortBy, setSortBy] = useState<string>(DEFAULT_SORT);

  /* Local create/edit panel state (global provider removed) */
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const [editingMeeting, setEditingMeeting] = useState<any>(null);

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [updateMeeting, setUpdateMeeting] = useState<any>(null);

  /* Pagination state */
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(8);

  /* Distribution-bar mount trigger (for width transition) */
  const [distMounted, setDistMounted] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setDistMounted(true), 150);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => { loadData(); }, []);

  useEffect(() => { setPage(1); }, [searchQuery, statusFilter, typeFilter, priorityFilter, sortBy, perPage]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'Escape' || isPanelOpen) return;
      if (showDeleteConfirm) setShowDeleteConfirm(false);
      else setSelectedMeeting(null);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedMeeting, showDeleteConfirm, isPanelOpen]);

  /* ------------------------- Create action ------------------------- */

  const openCreate = () => {
    setEditingMeeting(null);
    setIsPanelOpen(true);
  };

  /* Press "N" anywhere (outside inputs) to create a meeting */
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement;
      const typing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(t?.tagName) || t?.isContentEditable;
      if (typing || isPanelOpen || selectedMeeting || updateMeeting || showDeleteConfirm) return;
      if (e.key.toLowerCase() === 'n' && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        openCreate();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isPanelOpen, selectedMeeting, updateMeeting, showDeleteConfirm]);

  async function loadData() {
    try {
      setLoading(true);
      const meetingsData = await pb.collection('meetings').getFullList({ sort: '-created_date' });
      setMeetings(meetingsData);
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  }

  const handleEdit = () => {
    if (!selectedMeeting) return;
    const snapshot = selectedMeeting;
    setSelectedMeeting(null);
    setEditingMeeting(snapshot);
    setIsPanelOpen(true);
  };

  const handleOpenUpdate = () => {
    if (!selectedMeeting) return;
    const snapshot = selectedMeeting;
    setSelectedMeeting(null);
    setUpdateMeeting(snapshot);
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

  const confirmDelete = async () => {
    if (!selectedMeeting || deleting) return;
    setDeleting(true);
    try {
      await pb.collection('meetings').delete(selectedMeeting.id);
      setSelectedMeeting(null);
      setShowDeleteConfirm(false);
      loadData();
    } catch {
      alert('Failed to delete meeting');
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

  const getStatusKey = (meeting: any) => (meeting.status || 'scheduled').toLowerCase();
  const getStatusStyle = (key: string) =>
    STATUS_STYLES[key] || {
      label: key.replace(/\b\w/g, (c) => c.toUpperCase()),
      dot: 'bg-gray-400',
      badge: 'bg-gray-100 text-gray-600 ring-1 ring-inset ring-gray-500/20',
    };

  const statusCount = (key: string) => meetings.filter((m) => getStatusKey(m) === key).length;

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
          {/* App bar skeleton */}
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
            {/* Stats */}
            <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="skeleton h-[126px] rounded-3xl" style={{ animationDelay: `${i * 80}ms` }} />
              ))}
            </div>

            {/* Distribution */}
            <div className="space-y-2 rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-100">
              <div className="skeleton h-3 w-40 rounded-full" />
              <div className="skeleton h-2.5 w-full rounded-full" />
            </div>

            {/* Filter bar */}
            <div className="skeleton h-[74px] rounded-3xl" />

            {/* Table */}
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

      {/* ------------------------- Decorative background ------------------------ */}
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
              onClick={() => loadData()}
              aria-label="Refresh data"
              className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 transition-colors hover:border-violet-200 hover:text-violet-600"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </button>

            <button
              onClick={openCreate}
              className="group inline-flex items-center justify-center gap-2 rounded-full bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-slate-900/10 transition-all duration-300 hover:-translate-y-0.5 hover:bg-slate-800 active:scale-[0.98]"
            >
              <Plus className="h-4 w-4 transition-transform duration-300 group-hover:rotate-90" />
              New Meeting
              <kbd className="ml-1 hidden rounded-md bg-white/20 px-1.5 py-0.5 text-[10px] font-bold ring-1 ring-inset ring-white/30 sm:inline">
                N
              </kbd>
            </button>
          </div>
        </div>

        {/* ------------------------------- Content ------------------------------ */}
        <div className="space-y-6 bg-[#f7f6fd] p-4 sm:p-6 lg:p-7">

          {/* ------------------------------ Status Stats ---------------------------- */}
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5">
            {STAT_CARDS.map((stat, i) => {
              const Icon = stat.icon;
              const count = stat.key === 'all' ? meetings.length : statusCount(stat.key);
              const active = statusFilter === stat.key;
              return (
                <button
                  key={stat.key}
                  onClick={() => setStatusFilter(stat.key)}
                  style={{ animationDelay: `${120 + i * 70}ms` }}
                  className={`anim-fade-up group relative w-full overflow-hidden rounded-3xl bg-gradient-to-br p-5 text-left transition-all duration-300 hover:-translate-y-1 hover:shadow-lg hover:shadow-slate-900/[0.08] active:scale-[0.98] ${stat.card} ${
                    active ? 'ring-2 ring-slate-900 shadow-md shadow-slate-900/10' : 'ring-1 ring-white/70'
                  }`}
                >
                  <span
                    aria-hidden
                    className="pointer-events-none absolute -right-6 -top-6 h-20 w-20 rounded-full bg-white/50 transition-transform duration-300 group-hover:scale-125"
                  />

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

              {/* Search */}
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

              {/* Type */}
              <div className="relative">
                <Briefcase className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <select
                  value={typeFilter}
                  onChange={(e) => setTypeFilter(e.target.value)}
                  className="w-full cursor-pointer appearance-none rounded-full border border-slate-200 bg-slate-50/80 py-2.5 pl-11 pr-9 text-sm font-medium text-slate-700 transition-all duration-200 hover:border-slate-300 hover:bg-white focus:border-violet-400 focus:bg-white focus:outline-none focus:ring-4 focus:ring-violet-500/10 sm:w-44"
                >
                  <option value="all">All Types</option>
                  <option value="internal">Internal</option>
                  <option value="external">External</option>
                </select>
                <ChevronDown className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              </div>

              {/* Priority */}
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

              {/* Sort */}
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
          <div className="anim-fade-up overflow-hidden rounded-3xl bg-white shadow-sm ring-1 ring-slate-100" style={{ animationDelay: '300ms' }}>

            {/* Card header */}
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

            {/* Column headers */}
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
                /* Empty state */
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

                  const createdMs = dateToTime(meeting.created_date);
                  const createdDateStr = createdMs
                    ? new Date(createdMs).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' })
                    : '—';
                  const createdTimeStr = createdMs
                    ? new Date(createdMs).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
                    : '';

                  const priority = PRIORITY_BADGE[String(meeting.priority || '').toLowerCase()];

                  return (
                    <div
                      key={meeting.id}
                      onClick={() => setSelectedMeeting(meeting)}
                      className="anim-row cursor-pointer"
                      style={{ animationDelay: `${Math.min(i * 45, 360)}ms` }}
                    >
                      {/* Desktop row */}
                      <div
                        className="group relative hidden items-center gap-4 px-6 py-4 transition-colors duration-200 hover:bg-violet-50/50 md:grid md:grid-cols-12"
                        title={`Created ${createdDateStr} ${createdTimeStr}`}
                      >
                        <span className="absolute left-0 top-1/2 h-0 w-[3px] -translate-y-1/2 rounded-r bg-gradient-to-b from-violet-500 to-indigo-500 transition-all duration-300 group-hover:h-2/3" />

                        <div className="col-span-1 flex justify-center">
                          <div className="flex h-14 w-12 flex-col items-center justify-center rounded-2xl border border-slate-200 bg-gradient-to-b from-white to-slate-50 transition-all duration-300 group-hover:border-violet-200 group-hover:from-violet-50 group-hover:to-indigo-50 group-hover:shadow-sm">
                            <span className="text-lg font-bold leading-none tabular-nums text-slate-900">{dateInfo?.day}</span>
                            <span className="mt-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">{dateInfo?.month}</span>
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

                        <div className="col-span-1 text-center">
                          {meeting.meeting_type ? (
                            <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold capitalize ${getTypeStyle(meeting.meeting_type)}`}>
                              {meeting.meeting_type}
                            </span>
                          ) : (
                            <span className="text-sm text-slate-300">—</span>
                          )}
                        </div>

                        <div className="col-span-1 flex justify-center">
                          <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ${style.badge}`}>
                            <span className={`h-1.5 w-1.5 rounded-full ${style.dot} ${statusKey === 'scheduled' ? 'animate-pulse' : ''}`} />
                            {style.label}
                          </span>
                        </div>

                        <div className="col-span-1 flex justify-center">
                          <div className="flex h-8 w-8 items-center justify-center rounded-full text-slate-300 transition-all duration-300 group-hover:translate-x-1 group-hover:bg-violet-100 group-hover:text-violet-600">
                            <ChevronRight className="h-4 w-4" />
                          </div>
                        </div>
                      </div>

                      {/* Mobile card */}
                      <div className="p-4 transition-colors duration-200 hover:bg-violet-50/40 md:hidden">
                        <div className="flex items-start gap-3">
                          <div className="flex h-14 w-12 flex-shrink-0 flex-col items-center justify-center rounded-2xl border border-slate-200 bg-gradient-to-b from-white to-slate-50">
                            <span className="text-lg font-bold leading-none text-slate-900">{dateInfo?.day}</span>
                            <span className="mt-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">{dateInfo?.month}</span>
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-start justify-between gap-2">
                              <h3 className="line-clamp-2 text-sm font-semibold leading-snug text-slate-900">{title}</h3>
                              <div className="flex flex-shrink-0 items-center gap-1">
                                <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${style.badge}`}>
                                  <span className={`h-1 w-1 rounded-full ${style.dot}`} />
                                  {style.label}
                                </span>
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

                            <div className="mt-2 flex flex-wrap gap-x-3.5 gap-y-1 text-xs text-slate-500">
                              <span className="flex items-center gap-1">
                                <Clock className="h-3.5 w-3.5 text-slate-400" />
                                {formatTimeDisplay(time)}
                                {meeting.duration ? ` · ${meeting.duration} min` : ''}
                              </span>
                              <span className="flex items-center gap-1">
                                <MapPin className="h-3.5 w-3.5 text-slate-400" />
                                <span className="max-w-[140px] truncate">{meeting.location || '—'}</span>
                              </span>
                            </div>

                            <div className="mt-2 flex flex-wrap items-center gap-1.5">
                              {meeting.meeting_type && (
                                <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize ${getTypeStyle(meeting.meeting_type)}`}>
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

            {/* Pagination footer */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-5 py-3.5 lg:px-6">
              <div className="flex flex-wrap items-center gap-3">
                <p className="text-xs text-slate-500">
                  Showing{' '}
                  <span className="font-semibold text-slate-700">
                    {filteredMeetings.length === 0 ? 0 : startIndex + 1}–{endIndex}
                  </span>{' '}
                  of <span className="font-semibold text-slate-700">{filteredMeetings.length}</span>{' '}
                  {filteredMeetings.length === 1 ? 'meeting' : 'meetings'}
                </p>

                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-medium text-slate-400">Rows</span>
                  <select
                    value={perPage}
                    onChange={(e) => setPerPage(Number(e.target.value))}
                    className="cursor-pointer appearance-none rounded-full border border-slate-200 bg-white py-1.5 pl-3 pr-8 text-xs font-semibold text-slate-600 outline-none transition-colors hover:border-violet-300 focus:border-violet-400 focus:ring-4 focus:ring-violet-500/10"
                  >
                    {PER_PAGE_OPTIONS.map((opt) => (
                      <option key={opt} value={opt}>{opt}</option>
                    ))}
                  </select>
                  <ChevronDown className="pointer-events-none -ml-7 h-3.5 w-3.5 text-slate-400" />
                </div>
              </div>

              {totalPages > 1 && (
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setPage(currentPage - 1)}
                    disabled={currentPage <= 1}
                    aria-label="Previous page"
                    className="flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 text-slate-500 transition-colors hover:border-violet-300 hover:text-violet-600 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-slate-200 disabled:hover:text-slate-500"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>

                  {paginationRange.map((p, idx) =>
                    p === 'dots' ? (
                      <span key={`dots-${idx}`} className="px-1 text-xs font-bold text-slate-300">…</span>
                    ) : (
                      <button
                        key={p}
                        onClick={() => setPage(p)}
                        aria-current={p === currentPage ? 'page' : undefined}
                        className={`h-8 min-w-[2rem] rounded-full px-2 text-xs font-semibold transition-colors ${
                          p === currentPage
                            ? 'bg-slate-900 text-white shadow-sm'
                            : 'text-slate-600 hover:bg-slate-100'
                        }`}
                      >
                        {p}
                      </button>
                    )
                  )}

                  <button
                    onClick={() => setPage(currentPage + 1)}
                    disabled={currentPage >= totalPages}
                    aria-label="Next page"
                    className="flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 text-slate-500 transition-colors hover:border-violet-300 hover:text-violet-600 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-slate-200 disabled:hover:text-slate-500"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ------------------------- Details off-canvas ------------------------- */}
      {selectedMeeting && (() => {
        const dateInfo = formatDate(selectedMeeting.meeting_date || selectedMeeting.created_date);
        const time = selectedMeeting.meeting_time || '';
        const style = getStatusStyle(getStatusKey(selectedMeeting));
        const title = getMeetingTitle(selectedMeeting);
        const priority = PRIORITY_BADGE[String(selectedMeeting.priority || '').toLowerCase()];
        const officerInitials = selectedMeeting.officer_name
          ? selectedMeeting.officer_name
              .split(' ')
              .map((word: string) => word.charAt(0))
              .slice(0, 2)
              .join('')
              .toUpperCase()
          : '';

        return (
          <>
            <div className="anim-overlay fixed inset-0 z-40 bg-slate-900/50 backdrop-blur-sm" onClick={() => setSelectedMeeting(null)} />

            <div className="anim-panel fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col bg-white shadow-2xl">
              {/* Gradient header */}
              <div className="relative flex-shrink-0 overflow-hidden bg-gradient-to-br from-slate-900 via-slate-900 to-violet-900 px-6 pb-5 pt-6">
                <div className="absolute -right-20 -top-20 h-56 w-56 rounded-full bg-violet-500/25 blur-3xl" />
                <div className="absolute -bottom-24 -left-16 h-48 w-48 rounded-full bg-indigo-400/10 blur-3xl" />

                <div className="relative">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-2.5 py-1 text-[11px] font-semibold text-white ring-1 ring-inset ring-white/20">
                        <span className={`h-1.5 w-1.5 rounded-full ${style.dot}`} />
                        {style.label}
                      </span>
                      {selectedMeeting.meeting_type && (
                        <span className="inline-flex rounded-full bg-white/10 px-2.5 py-1 text-[11px] font-semibold capitalize text-white/70 ring-1 ring-inset ring-white/15">
                          {selectedMeeting.meeting_type}
                        </span>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => setSelectedMeeting(null)}
                      className="-mr-2 -mt-1 rounded-lg p-2 text-slate-400 transition-colors hover:bg-white/10 hover:text-white"
                    >
                      <X className="h-5 w-5" />
                    </button>
                  </div>

                  <h2 className="mt-3 line-clamp-3 text-xl font-bold leading-snug text-white">{title}</h2>

                  <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm text-slate-300">
                    <span className="flex items-center gap-1.5">
                      <Calendar className="h-4 w-4 text-slate-400" />
                      {dateInfo ? `${dateInfo.weekday}, ${dateInfo.full}` : '—'}
                    </span>
                    <span className="flex items-center gap-1.5">
                      <Clock className="h-4 w-4 text-slate-400" />
                      {formatTimeDisplay(time)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Scrollable body */}
              <div className="nice-scroll min-h-0 flex-1 space-y-4 overflow-y-auto bg-slate-50 p-5">
                <div className="grid grid-cols-2 gap-3">
                  <InfoTile icon={Calendar} tint="bg-violet-50 text-violet-500" label="Date">
                    {dateInfo?.full || '—'}
                  </InfoTile>
                  <InfoTile icon={Clock} tint="bg-violet-50 text-violet-500" label="Time">
                    {formatTimeDisplay(time)}
                    {selectedMeeting.duration && (
                      <span className="ml-1 text-xs font-normal text-slate-400">· {selectedMeeting.duration} min</span>
                    )}
                  </InfoTile>
                  <InfoTile icon={MapPin} tint="bg-violet-50 text-violet-500" label="Location">
                    <span className="truncate block">{selectedMeeting.location || 'Not specified'}</span>
                  </InfoTile>
                  {selectedMeeting.meeting_type && (
                    <InfoTile icon={Briefcase} tint="bg-sky-50 text-sky-500" label="Type">
                      <span className="capitalize">{selectedMeeting.meeting_type}</span>
                    </InfoTile>
                  )}
                  {selectedMeeting.priority && (
                    <InfoTile icon={Tag} tint="bg-amber-50 text-amber-500" label="Priority">
                      <span className={`capitalize ${priority?.text || 'text-slate-900'}`}>
                        {selectedMeeting.priority}
                      </span>
                    </InfoTile>
                  )}
                </div>

                {(selectedMeeting.officer_name || selectedMeeting.designation || selectedMeeting.officer_type) && (
                  <div className="rounded-2xl border border-slate-200/80 bg-white p-4">
                    <p className="mb-3 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                      <User className="h-3.5 w-3.5 text-violet-500" /> Officer
                    </p>
                    <div className="flex items-center gap-3">
                      {officerInitials && (
                        <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-indigo-600 text-sm font-bold text-white">
                          {officerInitials}
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        {selectedMeeting.officer_name && (
                          <p className="truncate text-sm font-semibold text-slate-900">{selectedMeeting.officer_name}</p>
                        )}
                        {selectedMeeting.designation && (
                          <p className="truncate text-xs text-slate-500">{selectedMeeting.designation}</p>
                        )}
                      </div>
                      {selectedMeeting.officer_type && (
                        <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-violet-50 px-2.5 py-1 text-[11px] font-bold text-violet-700">
                          {selectedMeeting.officer_type}
                        </span>
                      )}
                    </div>

                    {(selectedMeeting.officer_phone || selectedMeeting.officer_email) && (
                      <div className="mt-3 space-y-1.5 border-t border-slate-100 pt-3">
                        {selectedMeeting.officer_phone && (
                          <p className="flex items-center gap-2 text-xs text-slate-500">
                            <Phone className="h-3.5 w-3.5 text-slate-400" />
                            {selectedMeeting.officer_phone}
                          </p>
                        )}
                        {selectedMeeting.officer_email && (
                          <p className="flex items-center gap-2 text-xs text-slate-500">
                            <Mail className="h-3.5 w-3.5 text-slate-400" />
                            {selectedMeeting.officer_email}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {selectedMeeting.agenda && (
                  <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white">
                    <div className="flex items-center gap-2 border-b border-slate-100 bg-slate-50 px-4 py-3">
                      <AlignLeft className="h-4 w-4 text-violet-500" />
                      <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Agenda</p>
                    </div>
                    <p className="whitespace-pre-line px-4 py-3 text-sm leading-relaxed text-slate-600">
                      {selectedMeeting.agenda}
                    </p>
                  </div>
                )}

                {selectedMeeting.description && (
                  <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white">
                    <div className="flex items-center gap-2 border-b border-slate-100 bg-slate-50 px-4 py-3">
                      <FileText className="h-4 w-4 text-violet-500" />
                      <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Description</p>
                    </div>
                    <p className="whitespace-pre-line px-4 py-3 text-sm leading-relaxed text-slate-600">
                      {selectedMeeting.description}
                    </p>
                  </div>
                )}

                {(selectedMeeting.created_date || selectedMeeting.updated_date) && (
                  <div className="flex items-center justify-between rounded-2xl border border-slate-200/80 bg-white px-4 py-3 text-[11px] text-slate-400">
                    {selectedMeeting.created_date && (
                      <span>Created {formatDateTime(selectedMeeting.created_date)}</span>
                    )}
                    {selectedMeeting.updated_date && (
                      <span>Updated {formatDateTime(selectedMeeting.updated_date)}</span>
                    )}
                  </div>
                )}
              </div>

              {/* Footer actions */}
              <div className="flex flex-shrink-0 gap-2.5 border-t border-slate-200 bg-white p-4">
                <button
                  type="button"
                  onClick={handleEdit}
                  className="flex flex-1 items-center justify-center gap-2 rounded-full bg-slate-900 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-slate-800"
                >
                  <Edit2 className="h-4 w-4" />
                  Edit
                </button>
                <button
                  type="button"
                  onClick={handleOpenUpdate}
                  className="flex flex-1 items-center justify-center gap-2 rounded-full bg-violet-600 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-violet-700"
                >
                  <RotateCcw className="h-4 w-4" />
                  Update
                </button>
                <button
                  type="button"
                  onClick={() => setShowDeleteConfirm(true)}
                  className="flex items-center justify-center gap-2 rounded-full border border-rose-200 px-4 py-2.5 text-sm font-semibold text-rose-600 transition-colors hover:border-rose-300 hover:bg-rose-50"
                >
                  <Trash2 className="h-4 w-4" />
                  Delete
                </button>
              </div>
            </div>
          </>
        );
      })()}

      {/* ------------------------- Delete confirmation ------------------------- */}
      {showDeleteConfirm && selectedMeeting && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
          <div className="anim-overlay absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={() => !deleting && setShowDeleteConfirm(false)} />
          <div className="anim-scale-in relative w-full max-w-sm rounded-3xl bg-white p-6 shadow-2xl">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-rose-100">
              <Trash2 className="h-5 w-5 text-rose-600" />
            </div>
            <h3 className="mt-4 text-center text-lg font-bold text-slate-900">Delete meeting?</h3>
            <p className="mt-1.5 text-center text-sm leading-relaxed text-slate-500">
              &ldquo;{getMeetingTitle(selectedMeeting)}&rdquo; will be permanently removed. This action can&rsquo;t be undone.
            </p>
            <div className="mt-5 flex gap-3">
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(false)}
                disabled={deleting}
                className="flex-1 rounded-full border border-slate-200 py-2.5 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmDelete}
                disabled={deleting}
                className="flex flex-1 items-center justify-center gap-2 rounded-full bg-rose-600 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-rose-700 disabled:opacity-60"
              >
                {deleting && <Loader2 className="h-4 w-4 animate-spin" />}
                {deleting ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ------------------------------ Panels ------------------------------ */}
      <CreateMeetingPanel
        isOpen={isPanelOpen}
        onClose={handlePanelClosed}
        onSuccess={handlePanelSaved}
        editingMeeting={editingMeeting}
      />

      {updateMeeting && (
        <MeetingUpdatePanel
          isOpen={!!updateMeeting}
          meeting={updateMeeting}
          onClose={() => setUpdateMeeting(null)}
          onSuccess={() => { setUpdateMeeting(null); loadData(); }}
        />
      )}
    </div>
  );
}