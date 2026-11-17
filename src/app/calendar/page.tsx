'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Calendar as CalendarIcon, Clock, MapPin, Plus,
  ChevronLeft, ChevronRight, X, Edit3, Trash2,
  FileText, Users, Video, Phone, Mail, Link as LinkIcon,
  ChevronRight as ChevronRightIcon, AlertCircle,
  Briefcase, Lightbulb, TrendingUp, GraduationCap,
  Presentation, ClipboardList, FolderKanban, MoreVertical, CalendarCheck, User, Loader2,
  Sunrise, CalendarDays, CalendarRange, CalendarClock, History, Filter, RotateCcw,
  Columns3, Search, Download, Check, AlertTriangle, Keyboard, Flame, CheckCircle2, GripVertical
} from 'lucide-react';
import WeekView from '@/components/calendar/WeekView';
import { downloadIcs, findConflicts, isMovable, isoDate, startOfWeek } from '@/components/calendar/calendarTools';
import pb from '@/lib/pocketbase';
import CreateMeetingPanel from '@/components/CreateMeetingPanel';
import UpdateMeetingPanel from '@/components/UpdateMeetingPanel';
import MeetingDetailsPanel from '@/components/MeetingDetailsPanel';
import ProtectedRoute from '@/components/auth/ProtectedRoute';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { showToast } from '@/components/Toaster';
import { serviceOf } from '@/lib/officerDirectory';

type ViewMode = 'year' | 'month' | 'week' | 'day' | 'agenda';
type TypeFilter = 'all' | 'IAS' | 'IPS' | 'IFS' | 'IRS' | 'Other';

const VIEW_KEY = 'civillist:calendar-view';
const STATUS_FILTERS = ['Scheduled', 'Rescheduled', 'Completed', 'Cancelled'] as const;

/* IAS / IPS / IFS / IRS from officer_type, everything else (contacts, internal) is "Other" */
const officerKind = (m: any): TypeFilter => serviceOf(m?.officer_type) ?? 'Other';

/* "Completed" / "completed" / "Done" → the label used by STATUS_FILTERS */
const statusLabel = (m: any) => {
  const s = String(m?.status || 'Scheduled').toLowerCase();
  if (/complete|done/.test(s)) return 'Completed';
  if (/cancel|reject/.test(s)) return 'Cancelled';
  if (/reschedul/.test(s)) return 'Rescheduled';
  return 'Scheduled';
};
type OffCanvasMode = 'view' | 'day' | null;

const MEETING_TYPE_ICONS: Record<string, React.ReactNode> = {
  'review': <Briefcase className="w-3.5 h-3.5" />,
  'training': <GraduationCap className="w-3.5 h-3.5" />,
  'brainstorming': <Lightbulb className="w-3.5 h-3.5" />,
  'strategy': <TrendingUp className="w-3.5 h-3.5" />,
  'client': <Users className="w-3.5 h-3.5" />,
  'workshop': <Presentation className="w-3.5 h-3.5" />,
  'planning': <ClipboardList className="w-3.5 h-3.5" />,
  'general': <FolderKanban className="w-3.5 h-3.5" />,
  'internal': <Briefcase className="w-3.5 h-3.5" />,
  'external': <Users className="w-3.5 h-3.5" />,
};

const MEETING_TYPE_COLORS: Record<string, { bg: string; border: string; text: string; light: string }> = {
  'review': { bg: 'bg-emerald-500', border: 'border-emerald-300', text: 'text-emerald-700', light: 'bg-emerald-50' },
  'training': { bg: 'bg-violet-500', border: 'border-violet-300', text: 'text-violet-700', light: 'bg-violet-50' },
  'brainstorming': { bg: 'bg-sky-500', border: 'border-sky-300', text: 'text-sky-700', light: 'bg-sky-50' },
  'strategy': { bg: 'bg-indigo-500', border: 'border-indigo-300', text: 'text-indigo-700', light: 'bg-indigo-50' },
  'client': { bg: 'bg-cyan-500', border: 'border-cyan-300', text: 'text-cyan-700', light: 'bg-cyan-50' },
  'workshop': { bg: 'bg-amber-500', border: 'border-amber-300', text: 'text-amber-700', light: 'bg-amber-50' },
  'planning': { bg: 'bg-rose-500', border: 'border-rose-300', text: 'text-rose-700', light: 'bg-rose-50' },
  'general': { bg: 'bg-slate-500', border: 'border-slate-300', text: 'text-slate-700', light: 'bg-slate-100' },
  'internal': { bg: 'bg-indigo-500', border: 'border-indigo-300', text: 'text-indigo-700', light: 'bg-indigo-50' },
  'external': { bg: 'bg-cyan-500', border: 'border-cyan-300', text: 'text-cyan-700', light: 'bg-cyan-50' },
};

const STATUS_COLORS: Record<string, string> = {
  'Scheduled': 'bg-violet-50 text-violet-700 ring-violet-200',
  'Completed': 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  'Cancelled': 'bg-rose-50 text-rose-700 ring-rose-200',
  'Rescheduled': 'bg-amber-50 text-amber-700 ring-amber-200',
};

const STATUS_DOTS: Record<string, string> = {
  'Scheduled': 'bg-violet-500',
  'Completed': 'bg-emerald-500',
  'Cancelled': 'bg-rose-500',
  'Rescheduled': 'bg-amber-500',
};

/* ── Shared design tokens (app-window language) ── */
const CARD = 'rounded-3xl bg-white shadow-sm ring-1 ring-slate-100';
const CARD_HOVER = 'transition-all duration-300 hover:shadow-md hover:shadow-slate-900/[0.06]';

/* ── Animation stylesheet ── */
const ANIM_CSS = `
  @keyframes calFadeUp { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: translateY(0); } }
  @keyframes calFadeIn { from { opacity: 0; } to { opacity: 1; } }
  @keyframes calScaleIn { from { opacity: 0; transform: scale(.94) translateY(10px); } to { opacity: 1; transform: scale(1) translateY(0); } }
  @keyframes calDrawer { from { transform: translateX(100%); } to { transform: translateX(0); } }
  @keyframes calProgress { 0% { transform: translateX(-100%); } 100% { transform: translateX(400%); } }
  @keyframes calShimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }
  @keyframes calFloat { 0%,100% { transform: translate(0,0) scale(1); } 33% { transform: translate(26px,-20px) scale(1.06); } 66% { transform: translate(-18px,14px) scale(.96); } }
  @keyframes calPulseRing { 0% { box-shadow: 0 0 0 0 rgba(139,92,246,.30); } 70% { box-shadow: 0 0 0 8px rgba(139,92,246,0); } 100% { box-shadow: 0 0 0 0 rgba(139,92,246,0); } }
  .cal-fade-up { animation: calFadeUp .55s cubic-bezier(.16,1,.3,1) both; }
  .cal-fade-in { animation: calFadeIn .35s ease both; }
  .cal-scale-in { animation: calScaleIn .32s cubic-bezier(.16,1,.3,1) both; }
  .cal-drawer { animation: calDrawer .38s cubic-bezier(.16,1,.3,1) both; }
  .cal-progress { animation: calProgress 1.2s ease-in-out infinite; }
  .cal-float { animation: calFloat 20s ease-in-out infinite; }
  .cal-pulse-ring { animation: calPulseRing 2.4s ease-out infinite; }
  .cal-skeleton { background: linear-gradient(90deg,#f1effc 25%,#e5e1f5 40%,#f1effc 60%); background-size: 200% 100%; animation: calShimmer 1.5s linear infinite; }
  @media (prefers-reduced-motion: reduce) {
    .cal-fade-up,.cal-fade-in,.cal-scale-in,.cal-drawer,.cal-progress,.cal-float,.cal-pulse-ring { animation: none !important; }
  }
`;

/* ── Detail row for the off-canvas viewer ── */
function DetailRow({ icon: Icon, label, children }: { icon: any; label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 py-3 group/row">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-50 text-slate-400 ring-1 ring-slate-100 transition-colors group-hover/row:bg-violet-50 group-hover/row:text-violet-500 group-hover/row:ring-violet-100">
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">{label}</p>
        <div className="mt-0.5 break-words text-sm font-medium text-slate-800">{children}</div>
      </div>
    </div>
  );
}

export default function CalendarPage() {
  const router = useRouter();
  const { logout } = useAuth();

  const [currentDate, setCurrentDate] = useState(new Date());
  /* last-used view is remembered per browser */
  const [viewMode, setViewModeState] = useState<ViewMode>(() => {
    try {
      const v = typeof window !== 'undefined' ? localStorage.getItem(VIEW_KEY) : null;
      return v === 'year' || v === 'month' || v === 'week' || v === 'day' || v === 'agenda' ? v : 'month';
    } catch {
      return 'month';
    }
  });
  const setViewMode = (v: ViewMode) => {
    setViewModeState(v);
    try { localStorage.setItem(VIEW_KEY, v); } catch {}
  };

  /* search + filters — applied to every view */
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string[]>([]); // empty = all
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [showShortcuts, setShowShortcuts] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const [meetings, setMeetings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedMeeting, setSelectedMeeting] = useState<any>(null);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [offCanvasMode, setOffCanvasMode] = useState<OffCanvasMode>(null);

  const [panelOpen, setPanelOpen] = useState(false);
  const [editingMeeting, setEditingMeeting] = useState<any>(null);
  const [panelDate, setPanelDate] = useState<string>('');
  const [updateMeeting, setUpdateMeeting] = useState<any>(null);

  const [sectionPages, setSectionPages] = useState<Record<string, number>>({});
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const [showAllUpcoming, setShowAllUpcoming] = useState(false);

  const AGENDA_PAGE_SIZE = 5;
  const UPCOMING_PAGE_SIZE = 4;

  const VIEW_TABS: { value: ViewMode; label: string; icon: any; key: string }[] = [
    { value: 'day', label: 'Day', icon: CalendarClock, key: 'D' },
    { value: 'week', label: 'Week', icon: Columns3, key: 'W' },
    { value: 'month', label: 'Month', icon: CalendarIcon, key: 'M' },
    { value: 'year', label: 'Year', icon: CalendarRange, key: 'Y' },
    { value: 'agenda', label: 'Agenda', icon: CalendarDays, key: 'A' },
  ];

  /* meetings after search + filters — every view renders from this */
  const shown = useMemo(() => {
    const words = search.toLowerCase().trim().split(/\s+/).filter(Boolean);
    return meetings.filter((m) => {
      if (statusFilter.length && !statusFilter.includes(statusLabel(m))) return false;
      if (typeFilter !== 'all' && officerKind(m) !== typeFilter) return false;
      if (!words.length) return true;
      const text = [m.agenda, m.title, m.officer_name, m.designation, m.department, m.location, m.city, m.meeting_type]
        .filter(Boolean).join(' ').toLowerCase();
      return words.every((w) => text.includes(w));
    });
  }, [meetings, search, statusFilter, typeFilter]);

  const filtersActive = !!search.trim() || statusFilter.length > 0 || typeFilter !== 'all';
  const clearFilters = () => { setSearch(''); setStatusFilter([]); setTypeFilter('all'); };
  const toggleStatus = (s: string) =>
    setStatusFilter((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]));

  const conflicts = useMemo(() => findConflicts(meetings), [meetings]);

  const setSectionPage = (id: string, p: number) =>
    setSectionPages(prev => ({ ...prev, [id]: p }));

  const toggleSection = (id: string) =>
    setCollapsed(prev => ({ ...prev, [id]: !prev[id] }));

  useEffect(() => { setSectionPages({}); }, [shown, currentDate]);

  useEffect(() => { setShowAllUpcoming(false); }, [meetings]);

  useEffect(() => {
    if (offCanvasMode || panelOpen) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => { document.body.style.overflow = prev; };
    }
  }, [offCanvasMode, panelOpen]);

  /* Esc closes the day panel */
  useEffect(() => {
    if (offCanvasMode !== 'day') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setOffCanvasMode(null);
      setSelectedMeeting(null);
      setSelectedDate(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [offCanvasMode]);

  async function loadData() {
    try {
      setLoading(true);
      setError('');

      // no server-side sort — the meetings collection has no `created` field; the calendar orders by date itself
      const data = await pb.collection('meetings').getFullList({ requestKey: null });
      setMeetings(data.filter((m: any) => !m.deleted));
    } catch (err: any) {
      console.error('[calendar] load error:', JSON.stringify(
        { status: err?.status, message: err?.message, url: err?.url, response: err?.response },
        null, 2
      ));

      if (err?.status === 401) {
        logout();
        router.replace('/login');
        return;
      }

      // the full error is logged above; 400 is usually a broken API rule or sort/filter field in PocketBase
      if (err?.status === 403) {
        setError('You don’t have permission to view meetings. Please ask your administrator.');
      } else {
        setError('Couldn’t load the meetings — please try again.');
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadData(); }, []);

  /* ── Field normalizers ── */

  const getMeetingTitle = (m: any) => m.title || m.topic || m.agenda || 'Meeting';

  const getAttendeesArray = (attendees: any): string[] => {
    if (!attendees) return [];
    if (Array.isArray(attendees)) return attendees.filter(Boolean).map(String);
    if (typeof attendees === 'string') {
      try {
        const parsed = JSON.parse(attendees);
        return Array.isArray(parsed) ? parsed : [attendees];
      } catch {
        return attendees.trim() ? [attendees] : [];
      }
    }
    if (typeof attendees === 'object') {
      const inner = (attendees as any).attendees;
      if (Array.isArray(inner)) return inner.filter(Boolean).map(String);
      return Object.values(attendees).filter(Boolean).map(String);
    }
    return [];
  };

  const getMeetingTime = (m: any) => m.time || m.meeting_time || '09:00';

  const getMeetingDateStr = (m: any): string => {
    const raw = m.date || m.meeting_date || m.created || '';
    if (!raw) return '';
    const first = raw.split(' ')[0].split('T')[0];
    return /^\d{4}-\d{2}-\d{2}$/.test(first) ? first : '';
  };

  const getMeetingType = (m: any) => (m.type || m.meeting_type || 'general').toLowerCase();

  const formatDateForInput = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

  const formatTime12 = (t: string) => {
    if (!t || !t.includes(':')) return t || '—';
    const [h, m] = t.split(':').map(Number);
    return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
  };

  const hourToTime = (hour: number) => `${String(hour).padStart(2, '0')}:00`;

  const getMeetingColor = (type: string) => MEETING_TYPE_COLORS[type?.toLowerCase()] || MEETING_TYPE_COLORS['general'];

  const getMeetingVisualColor = (meeting: any) => {
    const palette = [
      { bg: 'bg-violet-50', light: 'bg-violet-50', text: 'text-violet-700', border: 'border-violet-400', dot: 'bg-violet-500' },
      { bg: 'bg-emerald-50', light: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-400', dot: 'bg-emerald-500' },
      { bg: 'bg-sky-50', light: 'bg-sky-50', text: 'text-sky-700', border: 'border-sky-400', dot: 'bg-sky-500' },
      { bg: 'bg-amber-50', light: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-400', dot: 'bg-amber-500' },
      { bg: 'bg-rose-50', light: 'bg-rose-50', text: 'text-rose-700', border: 'border-rose-400', dot: 'bg-rose-500' },
      { bg: 'bg-cyan-50', light: 'bg-cyan-50', text: 'text-cyan-700', border: 'border-cyan-400', dot: 'bg-cyan-500' },
      { bg: 'bg-indigo-50', light: 'bg-indigo-50', text: 'text-indigo-700', border: 'border-indigo-400', dot: 'bg-indigo-500' },
    ];
    const key = String(meeting?.id || getMeetingTitle(meeting));
    let hash = 0;
    for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
    return palette[hash % palette.length];
  };

  const getMeetingIcon = (type: string) => MEETING_TYPE_ICONS[type?.toLowerCase()] || MEETING_TYPE_ICONS['general'];

  /* ── Navigation ── */

  const navigate = (dir: 'prev' | 'next') => {
    const d = new Date(currentDate);
    const amount = dir === 'next' ? 1 : -1;
    if (viewMode === 'year') d.setFullYear(d.getFullYear() + amount);
    else if (viewMode === 'month' || viewMode === 'agenda') d.setMonth(d.getMonth() + amount, 1);
    else if (viewMode === 'week') d.setDate(d.getDate() + amount * 7);
    else if (viewMode === 'day') d.setDate(d.getDate() + amount);
    setCurrentDate(d);
  };

  const goToToday = () => setCurrentDate(new Date());

  const weekStart = startOfWeek(currentDate);

  const getHeaderLabel = () => {
    if (viewMode === 'year') return String(currentDate.getFullYear());
    if (viewMode === 'week') {
      const end = new Date(weekStart);
      end.setDate(end.getDate() + 6);
      const sameMonth = end.getMonth() === weekStart.getMonth();
      return `${weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${end.toLocaleDateString('en-US', sameMonth ? { day: 'numeric', year: 'numeric' } : { month: 'short', day: 'numeric', year: 'numeric' })}`;
    }
    if (viewMode === 'day') return currentDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
    return currentDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  };

  /* ── Shared panel wiring ── */

  /* A meeting can only be created for today or a future date — never a
     date that has already passed. Compared at day granularity (time of
     day doesn't matter here). */
  const isPastDate = (date: Date) => {
    const startOfDay = (d: Date) => { const c = new Date(d); c.setHours(0, 0, 0, 0); return c; };
    return startOfDay(date) < startOfDay(new Date());
  };

  const openCreateForDate = (date: Date) => {
    if (isPastDate(date)) {
      showToast("Can't schedule a meeting on a past date — pick today or a future date.", 'error');
      return;
    }
    setOffCanvasMode(null);
    setSelectedMeeting(null);
    setSelectedDate(null);
    setEditingMeeting(null);
    setPanelDate(formatDateForInput(date));
    setPanelOpen(true);
  };

  const openCreate = () => openCreateForDate(new Date());

  /* Always re-fetch the full record before editing/updating (same as Meetings page) */
  const fetchFreshMeeting = async (id: string) => {
    try {
      return await pb.collection('meetings').getOne(id, { requestKey: null });
    } catch {
      return null;
    }
  };

  const openEditMeeting = async (meeting: any) => {
    setOffCanvasMode(null);
    setSelectedMeeting(null);
    setSelectedDate(null);
    setPanelDate('');
    const fresh = await fetchFreshMeeting(meeting.id);
    setEditingMeeting(fresh || meeting);
    setPanelOpen(true);
  };

  const openUpdateMeeting = async (meeting: any) => {
    setOffCanvasMode(null);
    setSelectedMeeting(null);
    setSelectedDate(null);
    const fresh = await fetchFreshMeeting(meeting.id);
    setUpdateMeeting(fresh || meeting);
  };

  /* Drag-and-drop reschedule: opens the Update panel on "Rescheduled" with the new slot
     pre-filled, so the usual checks (past dates, clashes) still apply before saving. */
  const requestMove = async (meeting: any, date: string, time?: string) => {
    if (!isMovable(meeting)) {
      showToast('Completed or cancelled meetings can’t be moved.', 'error');
      return;
    }
    if (date < isoDate(new Date())) {
      showToast("Can't move a meeting to a past date — pick today or a future date.", 'error');
      return;
    }
    const sameDay = getMeetingDateStr(meeting) === date;
    const sameTime = !time || String(getMeetingTime(meeting)).slice(0, 5) === time;
    if (sameDay && sameTime) return;
    const fresh = await fetchFreshMeeting(meeting.id);
    setUpdateMeeting({
      ...(fresh || meeting),
      __forceStatus: 'rescheduled',
      __proposedDate: date,
      __proposedTime: time || getMeetingTime(fresh || meeting),
    });
  };

  const [dragMeetingId, setDragMeetingId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);

  const exportVisible = () => {
    let from = '', to = '', label = '';
    if (viewMode === 'day') { from = to = isoDate(currentDate); label = from; }
    else if (viewMode === 'week') {
      const end = new Date(weekStart); end.setDate(end.getDate() + 6);
      from = isoDate(weekStart); to = isoDate(end); label = `week-${from}`;
    } else if (viewMode === 'year') {
      from = `${currentDate.getFullYear()}-01-01`; to = `${currentDate.getFullYear()}-12-31`; label = String(currentDate.getFullYear());
    } else {
      const y = currentDate.getFullYear(), mo = currentDate.getMonth();
      from = isoDate(new Date(y, mo, 1)); to = isoDate(new Date(y, mo + 1, 0)); label = from.slice(0, 7);
    }
    const inRange = shown.filter((m) => { const d = getMeetingDateStr(m); return d >= from && d <= to; });
    const n = downloadIcs(inRange, `meetings-${label}.ics`);
    showToast(n ? `Exported ${n} meeting${n > 1 ? 's' : ''} — open the file to add them to Outlook / Google Calendar.` : 'No meetings to export in this period.', n ? 'success' : 'error');
  };

  /* Keyboard: ←/→ navigate · T today · D/W/M/Y/A views · N new · / search · ? help */
  const onShortcut = (e: KeyboardEvent) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (offCanvasMode || panelOpen || updateMeeting) return;
    const el = e.target as HTMLElement | null;
    if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable)) {
      if (e.key === 'Escape') (el as HTMLInputElement).blur();
      return;
    }
    const k = e.key;
    const views: Record<string, ViewMode> = { d: 'day', w: 'week', m: 'month', y: 'year', a: 'agenda' };
    if (k === 'ArrowLeft') navigate('prev');
    else if (k === 'ArrowRight') navigate('next');
    else if (k.toLowerCase() === 't') goToToday();
    else if (k.toLowerCase() === 'n') openCreate();
    else if (k === '/') searchRef.current?.focus();
    else if (k === '?') setShowShortcuts((v) => !v);
    else if (views[k.toLowerCase()]) setViewMode(views[k.toLowerCase()]);
    else return;
    e.preventDefault();
  };
  // re-subscribed every render so the handler always sees the current view / date
  useEffect(() => {
    window.addEventListener('keydown', onShortcut);
    return () => window.removeEventListener('keydown', onShortcut);
  });

  const closePanel = () => {
    setPanelOpen(false);
    setEditingMeeting(null);
    setPanelDate('');
  };

  const handlePanelSuccess = () => {
    loadData();
    closePanel();
  };

  /* ── Off-canvas (view / day) ── */

  const openDayDetails = (date: Date) => {
    setSelectedDate(date);
    setSelectedMeeting(null);
    setOffCanvasMode('day');
  };

  const openMeeting = (meeting: any) => {
    setSelectedMeeting(meeting);
    setOffCanvasMode('view');
  };

  const closeOffCanvas = () => {
    setOffCanvasMode(null);
    setSelectedMeeting(null);
    setSelectedDate(null);
  };

  /* ─── Upcoming Meetings — flat chronological list (next 7 days) ─── */

  const renderUpcoming = () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const items: {
      m: any; date: Date; offset: number;
      dayTag: string; isToday: boolean;
    }[] = [];

    for (let i = 0; i < 7; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() + i);
      const dateStr = formatDateForInput(d);
      shown
        .filter(m => getMeetingDateStr(m) === dateStr)
        .sort((a, b) => getMeetingTime(a).localeCompare(getMeetingTime(b)))
        .forEach(m => items.push({
          m,
          date: d,
          offset: i,
          dayTag: i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : d.toLocaleDateString('en-US', { weekday: 'short' }),
          isToday: i === 0,
        }));
    }

    const visible = showAllUpcoming ? items : items.slice(0, UPCOMING_PAGE_SIZE);

    return (
      <section className={`${CARD} ${CARD_HOVER} overflow-hidden cal-fade-up`} style={{ animationDelay: '140ms' }}>
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-50 text-violet-600">
              <Clock className="h-4 w-4" />
            </span>
            <div>
              <h3 className="text-sm font-bold text-slate-900">Upcoming Meetings</h3>
              <p className="mt-0.5 text-[11px] text-slate-400">Next 7 days · {items.length} scheduled</p>
            </div>
          </div>
          <button type="button" onClick={() => setViewMode('agenda')} className="group inline-flex items-center gap-1 text-xs font-bold text-violet-600 hover:text-violet-700">
            View all <ChevronRightIcon className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
          </button>
        </div>

        {items.length === 0 ? (
          <div className="p-12 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-violet-50 text-violet-400 ring-1 ring-violet-100">
              <CalendarCheck className="h-7 w-7" />
            </div>
            <p className="mt-3 text-sm font-semibold text-slate-700">Your week is clear</p>
            <p className="mt-0.5 text-xs text-slate-400">No meetings in the next 7 days.</p>
            <button type="button" onClick={openCreate} className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-slate-900 px-4 py-2 text-xs font-bold text-white transition-all hover:-translate-y-0.5 hover:bg-slate-800 active:scale-95">
              <Plus className="h-3.5 w-3.5" /> Schedule one
            </button>
          </div>
        ) : (
          <>
            <div className="divide-y divide-slate-100">
              {visible.map((item, i) => {
                const m = item.m;
                const color = getMeetingVisualColor(m);
                const statusDot = STATUS_DOTS[m.status] || STATUS_DOTS['Scheduled'];
                return (
                  <button
                    key={m.id || i}
                    type="button"
                    onClick={() => openMeeting(m)}
                    className="cal-fade-up group flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-violet-50/40 sm:gap-4 sm:px-5"
                    style={{ animationDelay: `${180 + i * 50}ms` }}
                  >
                    <div className={`flex w-12 shrink-0 flex-col items-center justify-center rounded-2xl py-1 transition-all duration-300 group-hover:scale-105 ${
                      item.isToday
                        ? 'bg-violet-600 text-white shadow-md shadow-violet-500/30'
                        : 'bg-slate-50 text-slate-500 ring-1 ring-slate-100 group-hover:bg-violet-50 group-hover:ring-violet-100'
                    }`}>
                      <span className={`text-[8px] font-bold uppercase leading-none tracking-wider ${item.isToday ? 'text-violet-100' : 'text-slate-400'}`}>
                        {item.date.toLocaleDateString('en-US', { month: 'short' })}
                      </span>
                      <span className="mt-0.5 text-[15px] font-extrabold leading-tight">{item.date.getDate()}</span>
                    </div>

                    <div className="w-[72px] shrink-0">
                      <p className="text-[11px] font-bold leading-none text-slate-900 tabular-nums">{formatTime12(getMeetingTime(m))}</p>
                      <p className={`mt-1 text-[9px] font-bold uppercase tracking-wide ${item.isToday ? 'text-violet-600' : 'text-slate-400'}`}>
                        {item.dayTag}
                      </p>
                    </div>

                    <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ring-1 ring-inset ring-white/60 transition-transform duration-200 group-hover:scale-110 ${color.light} ${color.text}`}>
                      {getMeetingIcon(getMeetingType(m))}
                    </div>

                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-slate-900 transition-colors group-hover:text-violet-700">
                        {getMeetingTitle(m)}
                      </p>
                      <p className="mt-0.5 truncate text-[11px] text-slate-400">
                        {m.officer_name ? `with ${m.officer_name}` : ''}
                        {m.officer_name && (m.location || m.venue) ? ' · ' : ''}
                        {(m.location || m.venue) || ''}
                      </p>
                    </div>

                    <span className={`hidden shrink-0 items-center rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide ring-1 md:inline-flex ${color.light} ${color.text} ${color.border}`}>
                      {getMeetingType(m)}
                    </span>

                    <span className={`h-2 w-2 shrink-0 rounded-full ring-2 ring-white ${statusDot}`} title={m.status || 'Scheduled'} />

                    <ChevronRightIcon className="h-4 w-4 shrink-0 text-slate-300 transition-all duration-200 group-hover:translate-x-1 group-hover:text-violet-500" />
                  </button>
                );
              })}
            </div>

            {items.length > UPCOMING_PAGE_SIZE && (
              <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50/60 px-4 py-2.5 sm:px-5">
                <p className="text-[11px] font-medium text-slate-400">
                  Showing {visible.length} of {items.length}
                </p>
                <button
                  type="button"
                  onClick={() => setShowAllUpcoming(v => !v)}
                  className="text-[11px] font-bold text-violet-600 transition-all hover:text-violet-700 active:scale-95"
                >
                  {showAllUpcoming ? 'Show less' : `Show all ${items.length}`}
                </button>
              </div>
            )}
          </>
        )}
      </section>
    );
  };

  /* ─── Month View ─── */
  const renderMonthView = () => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const firstDay = new Date(year, month, 1).getDay();
    const days: (number | null)[] = [];
    for (let i = 0; i < firstDay; i++) days.push(null);
    for (let i = 1; i <= daysInMonth; i++) days.push(i);
    while (days.length % 7 !== 0) days.push(null);

    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = formatDateForInput(today);

    const todayMeetings = shown
      .filter(m => getMeetingDateStr(m) === todayStr)
      .sort((a, b) => getMeetingTime(a).localeCompare(getMeetingTime(b)))
      .slice(0, 3);

    const miniDays: (number | null)[] = [...days];

    return (
      <div className="space-y-5">
        <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(0,1fr)_280px]">
          <section className={`${CARD} overflow-hidden cal-fade-up`} style={{ animationDelay: '60ms' }}>
            <div className="grid grid-cols-7 border-b border-slate-100 bg-slate-50/70">
              {dayNames.map(day => (
                <div key={day} className="py-3 text-center text-[11px] font-bold uppercase tracking-[0.15em] text-slate-400">
                  {day}
                </div>
              ))}
            </div>

            <div className="grid grid-cols-7">
              {days.map((day, index) => {
                if (!day) return <div key={index} className="min-h-[112px] border-b border-r border-slate-100 bg-slate-50/40 sm:min-h-[140px]" />;

                const cellDate = new Date(year, month, day);
                const dateStr = formatDateForInput(cellDate);
                const dayMeetings = shown
                  .filter(m => getMeetingDateStr(m) === dateStr)
                  .sort((a, b) => getMeetingTime(a).localeCompare(getMeetingTime(b)));
                const isToday = cellDate.toDateString() === new Date().toDateString();

                return (
                  <div
                    key={index}
                    onClick={() => openDayDetails(cellDate)}
                    onDragOver={(e) => {
                      if (!dragMeetingId) return;
                      e.preventDefault();
                      if (dropTarget !== dateStr) setDropTarget(dateStr);
                    }}
                    onDragLeave={() => setDropTarget((t) => (t === dateStr ? null : t))}
                    onDrop={(e) => {
                      e.preventDefault();
                      const m = meetings.find((x) => x.id === dragMeetingId);
                      setDropTarget(null);
                      setDragMeetingId(null);
                      if (m) requestMove(m, dateStr);
                    }}
                    className={`group relative min-h-[140px] cursor-pointer border-b border-r border-slate-100 p-2.5 transition-all duration-200 hover:bg-violet-50/30 ${
                      dropTarget === dateStr ? '!bg-violet-100/70' : isToday ? 'bg-violet-50/50' : 'bg-white'
                    }`}
                  >
                    {isToday && <span className="pointer-events-none absolute inset-0 ring-2 ring-inset ring-violet-500/40" />}
                    {dropTarget === dateStr && <span className="pointer-events-none absolute inset-1 rounded-xl border-2 border-dashed border-violet-400" />}

                    <div className="mb-2 flex items-center justify-between">
                      <span className={`flex h-8 w-8 items-center justify-center rounded-xl text-sm font-bold transition-all duration-200 ${
                        isToday
                          ? 'cal-pulse-ring bg-violet-600 text-white shadow-md shadow-violet-500/30'
                          : 'text-slate-700 group-hover:bg-violet-100 group-hover:text-violet-700'
                      }`}>
                        {day}
                      </span>
                      {dayMeetings.length > 0 && (
                        <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-400 transition-colors group-hover:bg-violet-100 group-hover:text-violet-600">
                          {dayMeetings.length}
                        </span>
                      )}
                    </div>

                    <div className="space-y-1.5">
                      {dayMeetings.slice(0, 3).map((m, i) => {
                        const color = getMeetingVisualColor(m);
                        return (
                          <button
                            key={m.id || i}
                            type="button"
                            draggable={isMovable(m)}
                            onDragStart={(e) => {
                              e.stopPropagation();
                              e.dataTransfer.setData('text/plain', m.id);
                              e.dataTransfer.effectAllowed = 'move';
                              setDragMeetingId(m.id);
                            }}
                            onDragEnd={() => { setDragMeetingId(null); setDropTarget(null); }}
                            onClick={(e) => { e.stopPropagation(); openMeeting(m); }}
                            title={`${getMeetingTitle(m)}${conflicts.has(m.id) ? ' · overlaps another meeting' : ''}${isMovable(m) ? '\nDrag to another day to reschedule' : ''}`}
                            className={`group/chip w-full overflow-hidden rounded-lg border-l-[3px] px-2.5 py-2 text-left transition-all duration-200 hover:translate-x-1 hover:shadow-md hover:shadow-slate-200/70 ${color.light} ${color.border} ${
                              isMovable(m) ? 'cursor-grab active:cursor-grabbing' : ''
                            } ${dragMeetingId === m.id ? 'opacity-40' : ''}`}
                          >
                            <div className={`flex items-center gap-1.5 ${color.text}`}>
                              <span className="shrink-0">
                                {conflicts.has(m.id) ? <AlertTriangle className="h-3.5 w-3.5 text-amber-500" /> : getMeetingIcon(getMeetingType(m))}
                              </span>
                              <span className="truncate text-[11px] font-semibold">{getMeetingTitle(m)}</span>
                            </div>
                            <p className="mt-1 pl-5 text-[10px] font-medium text-slate-500 tabular-nums">
                              {formatTime12(getMeetingTime(m))}
                            </p>
                          </button>
                        );
                      })}
                      {dayMeetings.length > 3 && (
                        <button type="button" onClick={(e) => { e.stopPropagation(); openDayDetails(cellDate); }} className="rounded-full bg-violet-50 px-2.5 py-1 text-[10px] font-bold text-violet-600 transition-colors hover:bg-violet-100">
                          +{dayMeetings.length - 3} more
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* Right sidebar */}
          <aside className="space-y-4">
            {/* Scheduled Today */}
            <div className={`${CARD} ${CARD_HOVER} overflow-hidden cal-fade-up`} style={{ animationDelay: '120ms' }}>
              <div className="flex items-center justify-between border-b border-slate-100 px-4 py-4">
                <div className="flex items-center gap-3">
                  <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-50 text-violet-600">
                    <CalendarCheck className="h-4 w-4" />
                  </span>
                  <div>
                    <h3 className="text-sm font-bold text-slate-900">Scheduled Today</h3>
                    <p className="mt-0.5 text-[11px] text-slate-400">{todayMeetings.length} meeting{todayMeetings.length === 1 ? '' : 's'} scheduled</p>
                  </div>
                </div>
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-900 text-[10px] font-extrabold text-white">{todayMeetings.length}</span>
              </div>
              <div className="space-y-1.5 p-3">
                {todayMeetings.length ? todayMeetings.map((m, i) => {
                  const color = getMeetingVisualColor(m);
                  return (
                    <button type="button" key={m.id || i} onClick={() => openMeeting(m)} className="group -mx-1 flex w-full gap-3 rounded-xl p-1.5 text-left transition-colors hover:bg-slate-50">
                      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-transform duration-200 group-hover:scale-105 ${color.light} ${color.text}`}>{getMeetingIcon(getMeetingType(m))}</div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-semibold text-slate-900 transition-colors group-hover:text-violet-700">{getMeetingTitle(m)}</p>
                        <p className="mt-1 text-[10px] tabular-nums text-slate-500">{formatTime12(getMeetingTime(m))}{m.duration ? ` – ${m.duration} min` : ''}</p>
                        {(m.location || m.venue) && <p className="mt-1 flex items-center gap-1 truncate text-[10px] text-slate-400"><MapPin className="h-3 w-3 shrink-0" />{m.location || m.venue}</p>}
                      </div>
                      <MoreVertical className="h-4 w-4 shrink-0 text-slate-300 opacity-0 transition-opacity group-hover:opacity-100" />
                    </button>
                  );
                }) : (
                  <div className="py-6 text-center">
                    <CalendarCheck className="mx-auto mb-2 h-7 w-7 text-slate-300" />
                    <p className="text-xs text-slate-500">No meetings today</p>
                  </div>
                )}
                <button type="button" onClick={() => setViewMode('agenda')} className="group flex w-full items-center justify-center gap-1 pt-2 text-xs font-semibold text-violet-600 hover:text-violet-700">
                  View full agenda <ChevronRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                </button>
              </div>
            </div>

            {/* Mini Calendar */}
            <div className={`${CARD} ${CARD_HOVER} cal-fade-up p-4`} style={{ animationDelay: '180ms' }}>
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-bold text-slate-900">Mini Calendar</h3>
                <div className="flex gap-1">
                  <button type="button" onClick={() => navigate('prev')} className="rounded-lg p-1.5 text-slate-500 transition-all hover:bg-violet-50 hover:text-violet-600 active:scale-90" aria-label="Previous month"><ChevronLeft className="h-3.5 w-3.5" /></button>
                  <button type="button" onClick={() => navigate('next')} className="rounded-lg p-1.5 text-slate-500 transition-all hover:bg-violet-50 hover:text-violet-600 active:scale-90" aria-label="Next month"><ChevronRight className="h-3.5 w-3.5" /></button>
                </div>
              </div>
              <p className="mb-3 text-center text-xs font-semibold text-slate-700">{currentDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</p>
              <div className="mb-1 grid grid-cols-7">
                {dayNames.map(d => <span key={d} className="text-center text-[8px] font-bold uppercase text-slate-400">{d.charAt(0)}</span>)}
              </div>
              <div className="grid grid-cols-7 gap-y-1">
                {miniDays.map((day, index) => {
                  if (!day) return <span key={index} className="h-7" />;
                  const d = new Date(year, month, day);
                  const dStr = formatDateForInput(d);
                  const hasMeeting = shown.some(m => getMeetingDateStr(m) === dStr);
                  const isToday = d.toDateString() === new Date().toDateString();
                  return (
                    <button type="button" key={index} onClick={() => { setCurrentDate(d); setViewMode('day'); }} className={`relative mx-auto h-7 w-7 rounded-full text-[10px] font-semibold transition-all duration-200 active:scale-90 ${isToday ? 'bg-slate-900 font-bold text-white shadow-md' : 'text-slate-600 hover:bg-violet-50 hover:text-violet-600'}`}>
                      {day}
                      {hasMeeting && !isToday && <span className="absolute bottom-0.5 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-violet-400" />}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Month insights */}
            {(() => {
              const prefix = `${year}-${String(month + 1).padStart(2, '0')}`;
              const inMonth = shown.filter((m) => getMeetingDateStr(m).startsWith(prefix));
              const done = inMonth.filter((m) => statusLabel(m) === 'Completed').length;
              const perDay = new Map<string, number>();
              inMonth.forEach((m) => perDay.set(getMeetingDateStr(m), (perDay.get(getMeetingDateStr(m)) ?? 0) + 1));
              const busiest = [...perDay.entries()].sort((a, b) => b[1] - a[1])[0];
              const clashes = inMonth.filter((m) => conflicts.has(m.id)).length;
              let freeDays = 0;
              for (let d = Math.max(1, today.getFullYear() === year && today.getMonth() === month ? today.getDate() : 1); d <= daysInMonth; d++) {
                const cd = new Date(year, month, d);
                if (cd < today || cd.getDay() === 0 || cd.getDay() === 6) continue;
                if (!perDay.has(formatDateForInput(cd))) freeDays++;
              }
              const busiestDate = busiest ? new Date(`${busiest[0]}T00:00:00`) : null;
              return (
                <div className={`${CARD} ${CARD_HOVER} cal-fade-up p-4`} style={{ animationDelay: '240ms' }}>
                  <h3 className="text-sm font-bold text-slate-900">This month</h3>
                  <p className="mt-0.5 text-[11px] text-slate-400">{currentDate.toLocaleDateString('en-US', { month: 'long' })}{filtersActive ? ' · filtered' : ''}</p>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <div className="rounded-2xl bg-violet-50/70 px-3 py-2.5">
                      <p className="text-lg font-extrabold leading-none text-slate-900 tabular-nums">{inMonth.length}</p>
                      <p className="mt-1 text-[10px] font-medium text-slate-500">Meetings</p>
                    </div>
                    <div className="rounded-2xl bg-emerald-50/70 px-3 py-2.5">
                      <p className="text-lg font-extrabold leading-none text-slate-900 tabular-nums">{done}</p>
                      <p className="mt-1 text-[10px] font-medium text-slate-500">Completed</p>
                    </div>
                  </div>
                  <ul className="mt-3 space-y-1">
                    <li>
                      <button type="button" disabled={!busiestDate} onClick={() => busiestDate && openDayDetails(busiestDate)}
                        className="-mx-2 flex w-[calc(100%+1rem)] items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-xs text-slate-600 transition-colors enabled:hover:bg-slate-50">
                        <Flame className="h-3.5 w-3.5 shrink-0 text-orange-500" />
                        <span className="flex-1">Busiest day</span>
                        <span className="font-semibold text-slate-800">
                          {busiestDate ? `${busiestDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} · ${busiest![1]}` : '—'}
                        </span>
                      </button>
                    </li>
                    <li className="-mx-2 flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-xs text-slate-600">
                      <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
                      <span className="flex-1">Free weekdays left</span>
                      <span className="font-semibold text-slate-800">{freeDays}</span>
                    </li>
                    <li className="-mx-2 flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-xs text-slate-600">
                      <AlertTriangle className={`h-3.5 w-3.5 shrink-0 ${clashes ? 'text-amber-500' : 'text-slate-300'}`} />
                      <span className="flex-1">Overlapping meetings</span>
                      <span className={`font-semibold ${clashes ? 'text-amber-600' : 'text-slate-800'}`}>{clashes}</span>
                    </li>
                  </ul>
                </div>
              );
            })()}
          </aside>
        </div>

        {renderUpcoming()}
      </div>
    );
  };

  /* ─── Year View ─── */
  const renderYearView = () => {
    const year = currentDate.getFullYear();
    const today = new Date();
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    const dayLetters = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
    const meetingDates = new Set(shown.map(m => getMeetingDateStr(m)).filter(Boolean));

    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {Array.from({ length: 12 }, (_, mi) => {
          const first = new Date(year, mi, 1);
          const daysIn = new Date(year, mi + 1, 0).getDate();
          const startBlank = first.getDay();
          const cells: (number | null)[] = [];
          for (let i = 0; i < startBlank; i++) cells.push(null);
          for (let d = 1; d <= daysIn; d++) cells.push(d);
          while (cells.length % 7 !== 0) cells.push(null);

          const isCurrentMonth = year === today.getFullYear() && mi === today.getMonth();
          const monthPrefix = `${year}-${String(mi + 1).padStart(2, '0')}`;
          const monthCount = shown.filter(m => getMeetingDateStr(m).startsWith(monthPrefix)).length;

          return (
            <div key={mi} className={`${CARD} ${CARD_HOVER} cal-fade-up p-4`} style={{ animationDelay: `${mi * 40}ms` }}>
              <button
                type="button"
                onClick={() => { setCurrentDate(new Date(year, mi, 1)); setViewMode('month'); }}
                className="group mb-3 flex w-full items-center justify-between"
              >
                <span className={`text-sm font-bold transition-colors ${isCurrentMonth ? 'text-violet-600' : 'text-slate-800 group-hover:text-violet-600'}`}>
                  {monthNames[mi]}
                  {isCurrentMonth && <span className="ml-2 inline-flex items-center rounded-full bg-violet-50 px-1.5 py-0.5 text-[9px] font-extrabold uppercase tracking-wider text-violet-600 ring-1 ring-violet-200">Now</span>}
                </span>
                {monthCount > 0 && (
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold tabular-nums text-slate-400">{monthCount}</span>
                )}
              </button>

              <div className="mb-1 grid grid-cols-7">
                {dayLetters.map((l, i) => <span key={i} className="text-center text-[8px] font-bold text-slate-300">{l}</span>)}
              </div>
              <div className="grid grid-cols-7 gap-y-0.5">
                {cells.map((day, ci) => {
                  if (!day) return <span key={ci} className="h-7" />;
                  const d = new Date(year, mi, day);
                  const dStr = formatDateForInput(d);
                  const hasMeeting = meetingDates.has(dStr);
                  const isToday = d.toDateString() === today.toDateString();
                  return (
                    <button
                      type="button"
                      key={ci}
                      onClick={() => openDayDetails(d)}
                      className={`relative mx-auto h-7 w-7 rounded-lg text-[10px] font-semibold transition-all duration-150 active:scale-90 ${
                        isToday
                          ? 'bg-slate-900 font-bold text-white shadow-sm'
                          : 'text-slate-600 hover:bg-violet-50 hover:text-violet-600'
                      }`}
                    >
                      {day}
                      {hasMeeting && !isToday && <span className="absolute bottom-0.5 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-violet-400" />}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  /* ─── Day View ─── */
  const renderDayView = () => {
    const dateStr = formatDateForInput(currentDate);
    const dayMeetings = shown.filter(m => getMeetingDateStr(m) === dateStr).sort((a, b) => getMeetingTime(a).localeCompare(getMeetingTime(b)));
    const hours = Array.from({ length: 12 }, (_, i) => i + 8);
    const isTodayView = currentDate.toDateString() === new Date().toDateString();
    const nowHour = new Date().getHours();
    const isPastDayView = isPastDate(currentDate);

    return (
      <div className={`${CARD} overflow-hidden cal-fade-up`}>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-50 text-violet-600">
              <CalendarClock className="h-5 w-5" />
            </span>
            <div>
              <p className="text-sm font-bold text-slate-900">{currentDate.toLocaleDateString('en-US', { weekday: 'long' })}</p>
              <p className="text-xs text-slate-400">{currentDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })} · {dayMeetings.length} meeting{dayMeetings.length === 1 ? '' : 's'}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => openCreateForDate(currentDate)}
            disabled={isPastDayView}
            title={isPastDayView ? "Can't schedule a meeting on a past date" : undefined}
            className={`group inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs font-semibold shadow-lg transition-all active:scale-[.97] ${
              isPastDayView
                ? 'cursor-not-allowed bg-slate-200 text-slate-400 shadow-none'
                : 'bg-slate-900 text-white shadow-slate-900/10 hover:-translate-y-0.5 hover:bg-slate-800'
            }`}
          >
            <Plus className="h-3.5 w-3.5 transition-transform duration-300 group-hover:rotate-90" /> New Meeting
          </button>
        </div>
        <div className="divide-y divide-slate-100">
          {hours.map(hour => {
            const time = hourToTime(hour);
            const hourMeetings = dayMeetings.filter(m => getMeetingTime(m).startsWith(String(hour).padStart(2, '0')));
            const isNow = isTodayView && hour === nowHour;
            return (
              <div key={hour} className={`grid min-h-[72px] grid-cols-[84px_1fr] transition-colors ${isNow ? 'bg-violet-50/40' : 'hover:bg-slate-50/50'}`}>
                <div className="flex flex-col items-center justify-center border-r border-slate-100 py-2">
                  <span className={`text-xs font-bold tabular-nums ${isNow ? 'text-violet-600' : 'text-slate-500'}`}>
                    {formatTime12(time)}
                  </span>
                  {isNow && <span className="mt-0.5 text-[9px] font-bold uppercase tracking-wide text-violet-500">Now</span>}
                </div>
                <div className="space-y-1.5 p-2.5">
                  {hourMeetings.length === 0 ? (
                    isNow ? (
                      <button type="button" onClick={() => openCreateForDate(currentDate)} className="flex w-full items-center gap-1.5 rounded-lg border border-dashed border-violet-200 px-3 py-2 text-[11px] font-semibold text-violet-500 transition-colors hover:bg-violet-50">
                        <Plus className="h-3.5 w-3.5" /> Schedule for this hour
                      </button>
                    ) : null
                  ) : (
                    hourMeetings.map((m, i) => {
                      const color = getMeetingVisualColor(m);
                      return (
                        <button
                          key={m.id || i}
                          type="button"
                          onClick={() => openMeeting(m)}
                          className={`group flex w-full items-center gap-3 rounded-xl border-l-[3px] px-3 py-2.5 text-left transition-all duration-200 hover:translate-x-1 hover:shadow-sm ${color.light} ${color.border}`}
                        >
                          <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/80 ${color.text}`}>{getMeetingIcon(getMeetingType(m))}</span>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-semibold text-slate-900">{getMeetingTitle(m)}</p>
                            <p className="mt-0.5 truncate text-[11px] text-slate-500">
                              {m.officer_name ? `with ${m.officer_name}` : ''}
                              {m.officer_name && (m.location || m.venue) ? ' · ' : ''}
                              {(m.location || m.venue) || ''}
                            </p>
                          </div>
                          <span className={`hidden shrink-0 items-center rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide ring-1 sm:inline-flex ${color.light} ${color.text} ${color.border}`}>
                            {getMeetingType(m)}
                          </span>
                          <ChevronRightIcon className="h-4 w-4 shrink-0 text-slate-300 transition-all group-hover:translate-x-0.5 group-hover:text-violet-500" />
                        </button>
                      );
                    })
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  /* ─── Agenda View ─── */
  const renderAgendaView = () => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const monthPrefix = `${year}-${String(month + 1).padStart(2, '0')}`;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1);

    const filtered = shown.filter(m => {
      const d = getMeetingDateStr(m);
      return d.startsWith(monthPrefix);
    });

    const byDate = new Map<string, any[]>();
    filtered.forEach(m => {
      const d = getMeetingDateStr(m);
      if (!byDate.has(d)) byDate.set(d, []);
      byDate.get(d)!.push(m);
    });
    const sortedDates = [...byDate.keys()].sort();

    return (
      <div className="space-y-4">
        {sortedDates.length === 0 ? (
          <div className={`${CARD} flex flex-col items-center justify-center py-16 text-center`}>
            <div className="relative">
              <div className="absolute inset-0 -m-3 rounded-3xl bg-violet-100/60 blur-xl" />
              <div className="relative flex h-16 w-16 items-center justify-center rounded-2xl bg-white shadow-sm ring-1 ring-slate-200">
                <CalendarDays className="h-8 w-8 text-slate-300" />
              </div>
            </div>
            <h3 className="mt-5 text-base font-bold text-slate-800">No meetings in this period</h3>
            <p className="mt-1 max-w-xs text-sm text-slate-500">
              Nothing matches the current filter for {currentDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}.
            </p>
            <button type="button" onClick={openCreate} className="mt-5 inline-flex items-center gap-2 rounded-full bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white shadow-md shadow-slate-900/10 transition-all hover:-translate-y-0.5 hover:bg-slate-800 active:scale-[0.98]">
              <Plus className="h-4 w-4" /> New Meeting
            </button>
          </div>
        ) : (
          sortedDates.map(dateKey => {
            const [y, mo, d] = dateKey.split('-').map(Number);
            const sectionDate = new Date(y, mo - 1, d);
            const isToday = sectionDate.toDateString() === today.toDateString();
            const isTomorrow = sectionDate.toDateString() === tomorrow.toDateString();
            const items = byDate.get(dateKey)!.sort((a, b) => getMeetingTime(a).localeCompare(getMeetingTime(b)));
            const id = dateKey;
            const isCollapsed = collapsed[id];
            const page = sectionPages[id] || 1;
            const totalPages = Math.max(1, Math.ceil(items.length / AGENDA_PAGE_SIZE));
            const safePage = Math.min(page, totalPages);
            const visible = items.slice((safePage - 1) * AGENDA_PAGE_SIZE, safePage * AGENDA_PAGE_SIZE);

            return (
              <section key={id} className={`${CARD} overflow-hidden cal-fade-up`}>
                <button
                  type="button"
                  onClick={() => toggleSection(id)}
                  className="flex w-full items-center justify-between gap-3 border-b border-slate-100 px-5 py-4 text-left transition-colors hover:bg-slate-50/60"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <div className={`flex h-11 w-11 shrink-0 flex-col items-center justify-center rounded-2xl ${
                      isToday ? 'bg-slate-900 text-white shadow-md' : 'bg-violet-50 text-violet-900'
                    }`}>
                      <span className="text-[9px] font-bold uppercase tracking-wide">{sectionDate.toLocaleDateString('en-US', { month: 'short' })}</span>
                      <span className="text-base font-extrabold leading-tight">{sectionDate.getDate()}</span>
                    </div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="truncate text-sm font-bold text-slate-900">
                          {sectionDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
                        </h3>
                        {isToday && <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-violet-700">Today</span>}
                        {isTomorrow && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">Tomorrow</span>}
                      </div>
                      <p className="mt-0.5 text-[11px] text-slate-400">{items.length} meeting{items.length === 1 ? '' : 's'}</p>
                    </div>
                  </div>
                  <ChevronRight className={`h-4 w-4 shrink-0 text-slate-300 transition-transform ${isCollapsed ? '' : 'rotate-90'}`} />
                </button>

                {!isCollapsed && (
                  <div className="divide-y divide-slate-100">
                    {visible.map((m, i) => {
                      const color = getMeetingVisualColor(m);
                      const statusKey = m.status || 'Scheduled';
                      const statusDot = STATUS_DOTS[statusKey] || STATUS_DOTS['Scheduled'];
                      return (
                        <button
                          key={m.id || i}
                          type="button"
                          onClick={() => openMeeting(m)}
                          className="group flex w-full items-center gap-3 px-5 py-3 text-left transition-colors hover:bg-violet-50/40"
                        >
                          <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ring-1 ring-inset ring-white/60 ${color.light} ${color.text}`}>
                            {getMeetingIcon(getMeetingType(m))}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-semibold text-slate-900 transition-colors group-hover:text-violet-700">{getMeetingTitle(m)}</p>
                            <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-slate-400">
                              <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" />{formatTime12(getMeetingTime(m))}</span>
                              {(m.location || m.venue) && <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" /><span className="max-w-[160px] truncate">{m.location || m.venue}</span></span>}
                              {m.officer_name && <span className="hidden items-center gap-1 lg:inline-flex"><User className="h-3 w-3" /><span className="max-w-[140px] truncate">{m.officer_name}</span></span>}
                            </p>
                          </div>
                          <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-semibold ring-1 ring-inset ${STATUS_COLORS[statusKey] || 'bg-slate-50 text-slate-600 ring-slate-200'}`}>
                            <span className={`h-1.5 w-1.5 rounded-full ${statusDot}`} />
                            {statusKey}
                          </span>
                          <ChevronRightIcon className="h-4 w-4 shrink-0 text-slate-300 transition-all group-hover:translate-x-0.5 group-hover:text-violet-500" />
                        </button>
                      );
                    })}

                    {items.length > AGENDA_PAGE_SIZE && (
                      <div className="flex items-center justify-between px-5 py-2.5">
                        <p className="text-[11px] font-medium text-slate-400">
                          Page {safePage} of {totalPages} · {items.length} meetings
                        </p>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => setSectionPage(id, safePage - 1)}
                            disabled={safePage <= 1}
                            className="flex h-7 w-7 items-center justify-center rounded-full border border-slate-200 text-slate-500 transition-colors hover:border-violet-300 hover:text-violet-600 disabled:cursor-not-allowed disabled:opacity-40"
                            aria-label="Previous page"
                          >
                            <ChevronLeft className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setSectionPage(id, safePage + 1)}
                            disabled={safePage >= totalPages}
                            className="flex h-7 w-7 items-center justify-center rounded-full border border-slate-200 text-slate-500 transition-colors hover:border-violet-300 hover:text-violet-600 disabled:cursor-not-allowed disabled:opacity-40"
                            aria-label="Next page"
                          >
                            <ChevronRight className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </section>
            );
          })
        )}
      </div>
    );
  };

  /* ─── Loading skeleton (app-window style) ─── */
  if (loading && meetings.length === 0) {
    return (
      <ProtectedRoute>
        <div className="relative min-h-screen bg-gradient-to-br from-indigo-200 via-violet-100 to-purple-200 p-0 sm:p-5 lg:p-8">
          <style>{ANIM_CSS}</style>
          <div aria-hidden className="pointer-events-none fixed inset-0 overflow-hidden">
            <div className="cal-float absolute -left-32 -top-32 h-96 w-96 rounded-full bg-violet-300/40 blur-3xl" />
            <div className="cal-float absolute -right-32 top-1/4 h-96 w-96 rounded-full bg-sky-300/30 blur-3xl" style={{ animationDelay: '-6s' }} />
          </div>

          <div className="relative mx-auto max-w-[1500px] overflow-hidden bg-white sm:rounded-[1.75rem] sm:shadow-2xl sm:shadow-violet-300/40 sm:ring-1 sm:ring-white/70">
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3.5 sm:px-6">
              <div className="flex items-center gap-3">
                <div className="cal-skeleton h-9 w-9 !rounded-xl" />
                <div className="space-y-2">
                  <div className="cal-skeleton h-4 w-28 !rounded-full" />
                  <div className="cal-skeleton h-3 w-44 !rounded-full" />
                </div>
              </div>
              <div className="cal-skeleton h-10 w-36 !rounded-full" />
            </div>

            <div className="space-y-6 bg-[#f7f6fd] p-3 sm:p-6 lg:p-7">
              <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
                {[...Array(4)].map((_, i) => (
                  <div key={i} className="cal-skeleton h-[130px] !rounded-3xl" style={{ animationDelay: `${i * 80}ms` }} />
                ))}
              </div>
              <div className="cal-skeleton h-14 !rounded-3xl" />
              <div className="cal-skeleton h-[520px] !rounded-3xl" />
            </div>
          </div>
        </div>
      </ProtectedRoute>
    );
  }

  /* ─── Main View ─── */
  return (
    <ProtectedRoute>
      <div className="relative min-h-screen bg-gradient-to-br from-indigo-200 via-violet-100 to-purple-200 p-0 sm:p-5 lg:p-8">
        <style>{ANIM_CSS}</style>

        <div aria-hidden className="pointer-events-none fixed inset-0 overflow-hidden">
          <div className="cal-float absolute -left-32 -top-32 h-96 w-96 rounded-full bg-violet-300/40 blur-3xl" />
          <div className="cal-float absolute -right-32 top-1/4 h-96 w-96 rounded-full bg-sky-300/30 blur-3xl" style={{ animationDelay: '-6s' }} />
          <div className="cal-float absolute -bottom-32 left-1/3 h-96 w-96 rounded-full bg-fuchsia-300/25 blur-3xl" style={{ animationDelay: '-12s' }} />
        </div>

        <div className="relative mx-auto max-w-[1500px] overflow-hidden bg-white sm:rounded-[1.75rem] sm:shadow-2xl sm:shadow-violet-300/40 sm:ring-1 sm:ring-white/70">

          {/* ── App bar ── */}
          <div className="relative z-30 flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 bg-white px-4 py-3.5 sm:px-6">
            <div className="flex min-w-0 items-center gap-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-900 text-white shadow-sm">
                <CalendarIcon className="h-4 w-4" />
              </span>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <p className="truncate text-sm font-bold text-slate-900">Calendar</p>
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
                <button type="button" onClick={exportVisible} title="Download the meetings in this view as an .ics file (Outlook, Google Calendar, Apple Calendar)"
                  className="inline-flex h-10 items-center gap-1.5 rounded-full border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-600 transition-all hover:-translate-y-0.5 hover:border-violet-200 hover:text-violet-700 active:scale-95">
                  <Download className="h-3.5 w-3.5" /> Export
                </button>
                <div className="relative">
                  <button type="button" onClick={() => setShowShortcuts((v) => !v)} aria-label="Keyboard shortcuts" title="Keyboard shortcuts (?)"
                    className={`flex h-10 w-10 items-center justify-center rounded-full border transition-all ${showShortcuts ? 'border-violet-200 bg-violet-50 text-violet-600' : 'border-slate-200 bg-white text-slate-500 hover:text-violet-600'}`}>
                    <Keyboard className="h-4 w-4" />
                  </button>
                  {showShortcuts && (
                    <div className="cal-scale-in absolute right-0 top-12 z-30 w-64 rounded-2xl bg-white p-3 shadow-xl ring-1 ring-slate-200">
                      <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">Keyboard shortcuts</p>
                      {[
                        ['← / →', 'Previous / next'],
                        ['T', 'Jump to today'],
                        ['D W M Y A', 'Day · Week · Month · Year · Agenda'],
                        ['N', 'New meeting'],
                        ['/', 'Search'],
                        ['?', 'Show / hide this'],
                      ].map(([k, label]) => (
                        <div key={k} className="flex items-center justify-between gap-3 py-1 text-xs">
                          <span className="text-slate-600">{label}</span>
                          <kbd className="shrink-0 rounded-md border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500">{k}</kbd>
                        </div>
                      ))}
                      <p className="mt-2 border-t border-slate-100 pt-2 text-[11px] leading-relaxed text-slate-400">Tip: drag a meeting to another day (or time, in Week view) to reschedule it.</p>
                    </div>
                  )}
                </div>
              <button
                type="button"
                onClick={openCreate}
                data-tooltip="Schedule a new meeting  ·  shortcut N"
                className="group inline-flex items-center justify-center gap-2 rounded-full bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-slate-900/10 transition-all duration-300 hover:-translate-y-0.5 hover:bg-slate-800 active:scale-[0.98]"
              >
                <Plus className="h-4 w-4 transition-transform duration-300 group-hover:rotate-90" />
                New Meeting
              </button>
            </div>
          </div>

          {/* ── Content ── */}
          <div className="space-y-6 bg-[#f7f6fd] p-3 sm:p-6 lg:p-7">

            {/* Error banner */}
            {error && (
              <div className="cal-fade-in flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-500" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-rose-700">Something went wrong</p>
                  <p className="mt-0.5 break-words text-xs text-rose-600">{error}</p>
                </div>
                <button
                  type="button"
                  onClick={() => loadData()}
                  className="shrink-0 rounded-full bg-white px-3.5 py-1.5 text-xs font-semibold text-rose-600 ring-1 ring-rose-200 transition-colors hover:bg-rose-100"
                >
                  Retry
                </button>
              </div>
            )}

            {/* Header: title + nav + view tabs */}
            <div className="cal-fade-up flex flex-wrap items-end justify-between gap-4">
              <div>
                <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 lg:text-3xl">
                  Meeting{' '}
                  <span className="bg-gradient-to-r from-violet-600 to-indigo-600 bg-clip-text text-transparent">
                    Calendar
                  </span>
                </h1>
                <p className="mt-1 text-sm text-slate-500">{getHeaderLabel()}</p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {/* Nav cluster */}
                <div className="flex items-center gap-1 rounded-full border border-slate-200 bg-white p-1 shadow-sm">
                  <button
                    type="button"
                    onClick={() => navigate('prev')}
                    aria-label="Previous"
                    data-tooltip={`Previous ${viewMode === "agenda" ? "month" : viewMode}  ·  shortcut ←`}
                    className="flex h-8 w-8 items-center justify-center rounded-full text-slate-500 transition-colors hover:bg-violet-50 hover:text-violet-600 active:scale-90"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={goToToday}
                    data-tooltip="Jump to today  ·  shortcut T"
                    className="rounded-full px-3.5 py-1.5 text-xs font-bold text-slate-700 transition-colors hover:bg-violet-50 hover:text-violet-600 active:scale-95"
                  >
                    Today
                  </button>
                  <button
                    type="button"
                    onClick={() => navigate('next')}
                    aria-label="Next"
                    data-tooltip={`Next ${viewMode === "agenda" ? "month" : viewMode}  ·  shortcut →`}
                    className="flex h-8 w-8 items-center justify-center rounded-full text-slate-500 transition-colors hover:bg-violet-50 hover:text-violet-600 active:scale-90"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>

                {/* View tabs (dark-pill segmented) */}
                <div className="flex items-center rounded-full bg-slate-100 p-1">
                  {VIEW_TABS.map(tab => {
                    const TabIcon = tab.icon;
                    const active = viewMode === tab.value;
                    return (
                      <button
                        key={tab.value}
                        type="button"
                        onClick={() => setViewMode(tab.value)}
                        aria-pressed={active}
                        data-tooltip={`${tab.label} view  ·  shortcut ${tab.key}`}
                        className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold transition-all duration-200 ${
                          active
                            ? 'bg-slate-900 text-white shadow-sm'
                            : 'text-slate-500 hover:text-slate-800'
                        }`}
                      >
                        <TabIcon className="h-3.5 w-3.5" />
                        <span className="hidden sm:inline">{tab.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Search · filters · export */}
            <div className={`${CARD} cal-fade-up flex flex-wrap items-center gap-2.5 p-3`} style={{ animationDelay: '30ms' }}>
              <div className="relative min-w-[200px] flex-1 sm:max-w-xs">
                <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  ref={searchRef}
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search meetings, officers, places…"
                  aria-label="Search meetings"
                  className="h-10 w-full rounded-full border border-slate-200 bg-slate-50/80 pl-10 pr-9 text-sm text-slate-900 placeholder-slate-400 transition-all hover:border-slate-300 focus:border-violet-400 focus:bg-white focus:outline-none focus:ring-4 focus:ring-violet-500/10"
                />
                {search ? (
                  <button type="button" onClick={() => setSearch('')} aria-label="Clear search"
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
                    <X className="h-3.5 w-3.5" />
                  </button>
                ) : (
                  <kbd className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 rounded-md border border-slate-200 bg-white px-1.5 text-[10px] font-semibold text-slate-400">/</kbd>
                )}
              </div>

              {/* status chips (multi-select) */}
              <div className="flex flex-wrap items-center gap-1.5">
                <Filter className="h-3.5 w-3.5 text-slate-400" />
                {STATUS_FILTERS.map((s) => {
                  const on = statusFilter.includes(s);
                  return (
                    <button key={s} type="button" onClick={() => toggleStatus(s)} aria-pressed={on}
                      data-tooltip={on ? `Showing ${s} meetings — click to remove this filter` : `Show only ${s} meetings (pick several to combine)`}
                      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold ring-1 ring-inset transition-all active:scale-95 ${
                        on ? `${STATUS_COLORS[s]} shadow-sm` : 'bg-white text-slate-400 ring-slate-200 hover:text-slate-600 hover:ring-slate-300'
                      }`}>
                      {on ? <Check className="h-3 w-3" strokeWidth={3} /> : <span className={`h-1.5 w-1.5 rounded-full opacity-50 ${STATUS_DOTS[s]}`} />}
                      {s}
                    </button>
                  );
                })}
              </div>

              {/* officer type */}
              <div className="flex items-center rounded-full bg-slate-100 p-1">
                {(['all', 'IAS', 'IPS', 'IFS', 'IRS', 'Other'] as TypeFilter[]).map((t) => (
                  <button key={t} type="button" onClick={() => setTypeFilter(t)} aria-pressed={typeFilter === t}
                    data-tooltip={t === 'all' ? 'Meetings with everyone' : t === 'Other' ? 'Meetings with contacts and employees' : `Meetings with ${t} officers`}
                    className={`rounded-full px-3 py-1 text-xs font-semibold transition-all ${typeFilter === t ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                    {t === 'all' ? 'All' : t}
                  </button>
                ))}
              </div>

              {filtersActive && (
                <button type="button" onClick={clearFilters}
                  className="inline-flex items-center gap-1 rounded-full px-2.5 py-1.5 text-xs font-semibold text-violet-600 hover:bg-violet-50">
                  <RotateCcw className="h-3.5 w-3.5" /> Reset · {shown.length} of {meetings.length}
                </button>
              )}

            </div>

            {/* View content */}
            {viewMode === 'week' && (
              <section className={`${CARD} overflow-hidden cal-fade-up`} style={{ animationDelay: '60ms' }}>
                <WeekView
                  weekStart={weekStart}
                  meetings={shown}
                  conflicts={conflicts}
                  getTitle={getMeetingTitle}
                  getColor={getMeetingVisualColor}
                  onOpen={openMeeting}
                  onCreate={openCreateForDate}
                  onMove={requestMove}
                />
                <div className="flex flex-wrap items-center gap-x-5 gap-y-1 border-t border-slate-100 bg-slate-50/60 px-5 py-2.5 text-[11px] text-slate-400">
                  <span className="inline-flex items-center gap-1.5"><span className="h-0.5 w-4 bg-rose-500" /> Now</span>
                  <span className="inline-flex items-center gap-1.5"><AlertTriangle className="h-3 w-3 text-amber-500" /> Overlaps another meeting</span>
                  <span className="inline-flex items-center gap-1.5"><GripVertical className="h-3 w-3" /> Drag to reschedule · click an empty slot to add</span>
                </div>
              </section>
            )}
            {viewMode === 'month' && renderMonthView()}
            {viewMode === 'year' && renderYearView()}
            {viewMode === 'day' && renderDayView()}
            {viewMode === 'agenda' && renderAgendaView()}
          </div>
        </div>

        {/* ── Off-canvas: meeting details — shared with Meetings & Dashboard ── */}
        {offCanvasMode === 'view' && selectedMeeting && (
          <MeetingDetailsPanel
            meeting={selectedMeeting}
            onClose={closeOffCanvas}
            onEdit={openEditMeeting}
            onUpdate={openUpdateMeeting}
            onDeleted={() => { closeOffCanvas(); loadData(); }}
            onMeetingChange={(updated) => {
              setSelectedMeeting(updated);
              setMeetings(prev => prev.map(x => (x.id === updated.id ? updated : x)));
            }}
          />
        )}

        {/* ── Off-canvas: day details ── */}
        {offCanvasMode === 'day' && selectedDate && (() => {
          const dateStr = formatDateForInput(selectedDate);
          const dayMeetings = shown
            .filter(m => getMeetingDateStr(m) === dateStr)
            .sort((a, b) => getMeetingTime(a).localeCompare(getMeetingTime(b)));
          const isPastSelectedDate = isPastDate(selectedDate);

          return (
            <>
              <div className="cal-fade-in fixed inset-0 z-40 bg-slate-900/50 backdrop-blur-sm" onClick={closeOffCanvas} />

<div className="cal-drawer fixed inset-y-0 right-0 z-50 flex h-full w-full flex-col bg-white shadow-2xl sm:max-w-xl lg:max-w-2xl">                <div className="relative flex-shrink-0 overflow-hidden bg-gradient-to-br from-slate-900 via-slate-900 to-violet-900 px-6 pb-5 pt-6">
                  <div className="absolute -right-20 -top-20 h-56 w-56 rounded-full bg-violet-500/25 blur-3xl" />

                  <div className="relative">
                    <div className="flex items-start justify-between gap-3">
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-2.5 py-1 text-[11px] font-semibold text-white ring-1 ring-inset ring-white/20">
                        <CalendarDays className="h-3.5 w-3.5" />
                        {dayMeetings.length} meeting{dayMeetings.length === 1 ? '' : 's'}
                      </span>
                      <button
                        type="button"
                        onClick={closeOffCanvas}
                        aria-label="Close" data-tooltip="Close  ·  Esc"
                        className="-mr-2 -mt-1 rounded-lg p-2 text-slate-400 transition-colors hover:bg-white/10 hover:text-white"
                      >
                        <X className="h-5 w-5" />
                      </button>
                    </div>

                    <h2 className="mt-3 text-xl font-bold leading-snug text-white">
                      {selectedDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
                    </h2>
                  </div>
                </div>

                <div className="min-h-0 flex-1 space-y-2.5 overflow-y-auto bg-slate-50 p-5">
                  {dayMeetings.length === 0 ? (
                    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-violet-200 bg-violet-50/40 px-6 py-10 text-center">
                      <CalendarCheck className="h-8 w-8 text-violet-300" />
                      <p className="mt-3 text-sm font-semibold text-slate-700">Nothing scheduled</p>
                      <p className="mt-1 text-xs text-slate-500">
                        {isPastSelectedDate ? "This date has passed — meetings can't be scheduled on it." : 'This day is wide open.'}
                      </p>
                      {!isPastSelectedDate && (
                        <button
                          type="button"
                          onClick={() => openCreateForDate(selectedDate)}
                          className="mt-4 inline-flex items-center gap-2 rounded-full bg-slate-900 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-slate-800"
                        >
                          <Plus className="h-3.5 w-3.5" /> Schedule one
                        </button>
                      )}
                    </div>
                  ) : (
                    dayMeetings.map((m, i) => {
                      const color = getMeetingVisualColor(m);
                      const statusKey = m.status || 'Scheduled';
                      return (
                        <button
                          key={m.id || i}
                          type="button"
                          onClick={() => openMeeting(m)}
                          className={`group flex w-full items-center gap-3 rounded-2xl border-l-[3px] bg-white p-3.5 text-left shadow-sm ring-1 ring-slate-100 transition-all hover:-translate-y-0.5 hover:shadow-md ${color.border}`}
                        >
                          <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${color.light} ${color.text}`}>
                            {getMeetingIcon(getMeetingType(m))}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-semibold text-slate-900 group-hover:text-violet-700">{getMeetingTitle(m)}</p>
                            <p className="mt-0.5 text-[11px] text-slate-400">
                              {formatTime12(getMeetingTime(m))}
                              {(m.location || m.venue) ? ` · ${m.location || m.venue}` : ''}
                            </p>
                          </div>
                          <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-semibold ring-1 ring-inset ${STATUS_COLORS[statusKey] || 'bg-slate-50 text-slate-600 ring-slate-200'}`}>
                            <span className={`h-1.5 w-1.5 rounded-full ${STATUS_DOTS[statusKey] || 'bg-slate-400'}`} />
                            {statusKey}
                          </span>
                          <ChevronRightIcon className="h-4 w-4 shrink-0 text-slate-300 transition-all group-hover:translate-x-0.5 group-hover:text-violet-500" />
                        </button>
                      );
                    })
                  )}
                </div>

                <div className="flex flex-shrink-0 gap-2.5 border-t border-slate-200 bg-white p-4">
                  <button
                    type="button"
                    onClick={() => openCreateForDate(selectedDate)}
                    disabled={isPastSelectedDate}
                    title={isPastSelectedDate ? "Can't schedule a meeting on a past date" : undefined}
                    className={`flex flex-1 items-center justify-center gap-2 rounded-full py-2.5 text-sm font-semibold transition-colors ${
                      isPastSelectedDate
                        ? 'cursor-not-allowed bg-slate-200 text-slate-400'
                        : 'bg-slate-900 text-white hover:bg-slate-800'
                    }`}
                  >
                    <Plus className="h-4 w-4" /> Add Meeting
                  </button>
                  <button
                    type="button"
                    onClick={closeOffCanvas}
                    className="rounded-full border border-slate-200 px-5 py-2.5 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-50"
                  >
                    Close
                  </button>
                </div>
              </div>
            </>
          );
        })()}

        {/* ── Create / Edit panel (same mounting as Meetings page) ── */}
        {panelOpen && (
          <CreateMeetingPanel
            key={editingMeeting ? `edit-${editingMeeting.id}` : `create-${panelDate}`}
            isOpen={panelOpen}
            onClose={closePanel}
            onSuccess={handlePanelSuccess}
            editingMeeting={editingMeeting}
            initialDate={panelDate}
          />
        )}

        {/* ── Update meeting panel — shared with Meetings & Dashboard ── */}
        {updateMeeting && (
          <UpdateMeetingPanel
            meeting={updateMeeting}
            onClose={() => setUpdateMeeting(null)}
            onSaved={() => { setUpdateMeeting(null); loadData(); }}
          />
        )}
      </div>
    </ProtectedRoute>
  );
}