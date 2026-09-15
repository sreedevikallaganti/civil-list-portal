'use client';

import React, { useEffect, useState } from 'react';
import {
  Calendar as CalendarIcon, Clock, MapPin, Plus,
  ChevronLeft, ChevronRight, X, Edit3, Trash2,
  FileText, Users, Video, Phone, Mail, Link as LinkIcon,
  ChevronRight as ChevronRightIcon, AlertCircle, RefreshCw,
  Briefcase, Lightbulb, TrendingUp, GraduationCap,
  Presentation, ClipboardList, FolderKanban, MoreVertical, CalendarCheck, User, Loader2,
  // ── agenda view additions ──
  Sunrise, CalendarDays, CalendarRange, CalendarClock, History, Filter
} from 'lucide-react';
import pb from '@/lib/pocketbase';
import CreateMeetingPanel from '@/components/CreateMeetingPanel';
import ProtectedRoute from '@/components/auth/ProtectedRoute';
// ── ✅ AUTH: needed for automatic sign-out when the session expires ──
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';

type ViewMode = 'year' | 'month' | 'day' | 'agenda';
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
  'review': { bg: 'bg-emerald-500', border: 'border-emerald-500', text: 'text-emerald-700', light: 'bg-emerald-50' },
  'training': { bg: 'bg-purple-500', border: 'border-purple-500', text: 'text-purple-700', light: 'bg-purple-50' },
  'brainstorming': { bg: 'bg-blue-500', border: 'border-blue-500', text: 'text-blue-700', light: 'bg-blue-50' },
  'strategy': { bg: 'bg-indigo-500', border: 'border-indigo-500', text: 'text-indigo-700', light: 'bg-indigo-50' },
  'client': { bg: 'bg-cyan-500', border: 'border-cyan-500', text: 'text-cyan-700', light: 'bg-cyan-50' },
  'workshop': { bg: 'bg-amber-500', border: 'border-amber-500', text: 'text-amber-700', light: 'bg-amber-50' },
  'planning': { bg: 'bg-pink-500', border: 'border-pink-500', text: 'text-pink-700', light: 'bg-pink-50' },
  'general': { bg: 'bg-slate-500', border: 'border-slate-500', text: 'text-slate-700', light: 'bg-slate-50' },
  'internal': { bg: 'bg-indigo-500', border: 'border-indigo-500', text: 'text-indigo-700', light: 'bg-indigo-50' },
  'external': { bg: 'bg-cyan-500', border: 'border-cyan-500', text: 'text-cyan-700', light: 'bg-cyan-50' },
};

const STATUS_COLORS: Record<string, string> = {
  'Scheduled': 'bg-blue-100 text-blue-700 border-blue-200',
  'Completed': 'bg-emerald-100 text-emerald-700 border-emerald-200',
  'Cancelled': 'bg-red-100 text-red-700 border-red-200',
  'Rescheduled': 'bg-amber-100 text-amber-700 border-amber-200',
};

const STATUS_DOTS: Record<string, string> = {
  'Scheduled': 'bg-blue-500',
  'Completed': 'bg-emerald-500',
  'Cancelled': 'bg-rose-500',
  'Rescheduled': 'bg-amber-500',
};

export default function CalendarPage() {
  // ── ✅ AUTH: router + logout for automatic sign-out on 401 ──
  const router = useRouter();
  const { logout } = useAuth();

  const [currentDate, setCurrentDate] = useState(new Date());
  const [viewMode, setViewMode] = useState<ViewMode>('month');
  const [meetings, setMeetings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedMeeting, setSelectedMeeting] = useState<any>(null);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [offCanvasMode, setOffCanvasMode] = useState<OffCanvasMode>(null);

// ── Delete confirmation (custom UI modal, replaces window.confirm) ──
const [confirmDelete, setConfirmDelete] = useState(false);
const [deleting, setDeleting] = useState(false);
const [deleteError, setDeleteError] = useState('');

const requestDelete = () => {
  setDeleteError('');
  setConfirmDelete(true);
};

const cancelDelete = () => {
  if (deleting) return;
  setConfirmDelete(false);
  setDeleteError('');
};

const confirmDeleteMeeting = async () => {
  if (!selectedMeeting || deleting) return;
  setDeleting(true);
  setDeleteError('');
  try {
    await pb.collection('meetings').delete(selectedMeeting.id);
    setConfirmDelete(false);
    closeOffCanvas();
    await loadData();
  } catch (err: any) {
    console.error('Delete error:', err);

    // ── ✅ AUTH: session expired → secure sign-out + redirect ──
    if (err?.status === 401) {
      logout();
      router.replace('/login');
      return;
    }
    setDeleteError(err?.message || 'Failed to delete the meeting. Please try again.');
  } finally {
    setDeleting(false);
  }
};



  // ── Shared CreateMeetingPanel state ──
  const [panelOpen, setPanelOpen] = useState(false);
  const [editingMeeting, setEditingMeeting] = useState<any>(null);
  const [panelDate, setPanelDate] = useState<string>('');

  // ── Agenda view: status filter, per-section pagination, collapsible sections ──
  const [agendaFilter, setAgendaFilter] = useState<string>('all');
  const [sectionPages, setSectionPages] = useState<Record<string, number>>({});
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  // ── Upcoming Meetings — list view expansion ──
  const [showAllUpcoming, setShowAllUpcoming] = useState(false);




  const AGENDA_PAGE_SIZE = 5;
  const UPCOMING_PAGE_SIZE = 4;

  const AGENDA_FILTERS = [
    { value: 'all', label: 'All' },
    { value: 'Scheduled', label: 'Scheduled' },
    { value: 'Completed', label: 'Completed' },
    { value: 'Cancelled', label: 'Cancelled' },
    { value: 'Rescheduled', label: 'Rescheduled' },
  ];

  const applyAgendaFilter = (value: string) => {
    setAgendaFilter(value);
    setSectionPages({});
  };

  const setSectionPage = (id: string, p: number) =>
    setSectionPages(prev => ({ ...prev, [id]: p }));

  const toggleSection = (id: string) =>
    setCollapsed(prev => ({ ...prev, [id]: !prev[id] }));

  // Reset agenda pagination whenever the underlying data refreshes
  useEffect(() => { setSectionPages({}); }, [meetings, currentDate]);

  // Collapse the upcoming list back to its first page on refresh
  useEffect(() => { setShowAllUpcoming(false); }, [meetings]);

 // ✅ Function declaration at component scope — hoisted, so it's
// available to the JSX refresh button, delete handler, and panel success.
async function loadData() {
  try {
    setLoading(true);
    setError('');

    console.log('[calendar] authStore valid?', pb.authStore.isValid);

    // Try progressively simpler queries — the first that succeeds wins.
    // 1) sort by -created (preferred)
    // 2) sort by -id (fallback: view collections / missing `created` field)
    // 3) no sort at all (last resort)
    const attempts = [{ sort: '-created' }, { sort: '-id' }, {}];

    let data: any[] = [];
    let lastError: any = null;

    for (const attempt of attempts) {
      try {
        data = await pb.collection('meetings').getFullList({
          requestKey: null,
          ...attempt,
        });
        console.log('[calendar] ✅ success with:', attempt, '→', data.length, 'records');
        lastError = null;
        break;
      } catch (e: any) {
        console.warn('[calendar] ❌ attempt failed:', attempt, '| status:', e?.status, '| msg:', e?.message);
        lastError = e;
        // Auth/permission errors won't be fixed by changing the sort — stop early
        if (e?.status === 401 || e?.status === 403) break;
      }
    }

    if (lastError) throw lastError;

    console.log('[calendar] loaded meetings:', data.length);
    if (data.length > 0) {
      console.log('[calendar] sample record:', data[0]); // shows real field names + date format
    } else {
      console.warn('[calendar] 0 records returned → likely the List/Search API rule is filtering everything out');
    }

    setMeetings(data);
  } catch (err: any) {
    // Full JSON dump — reveals the actual 400 response body from PocketBase
    console.error('[calendar] load error:', JSON.stringify(
      { status: err?.status, message: err?.message, url: err?.url, response: err?.response },
      null, 2
    ));

    if (err?.status === 401) {
      logout();
      router.replace('/login');
      return;
    }

    if (err?.status === 400) {
      setError('Server rejected the request (400). See browser console + PocketBase terminal for the exact cause — usually a broken API rule or an invalid sort/filter field.');
    } else if (err?.status === 403) {
      setError('You do not have permission to view meetings. Check the collection API rules.');
    } else {
      setError(err?.message || 'Failed to load meetings');
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
      { bg: 'bg-blue-50', light: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-400', dot: 'bg-blue-500' },
      { bg: 'bg-emerald-50', light: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-400', dot: 'bg-emerald-500' },
      { bg: 'bg-purple-50', light: 'bg-purple-50', text: 'text-purple-700', border: 'border-purple-400', dot: 'bg-purple-500' },
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

  /* ── Upcoming Meetings — flat chronological list (next 7 days) ── */

  const renderUpcoming = () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Gather every meeting in the next 7 days, in chronological order
    const items: {
      m: any; date: Date; offset: number;
      dayTag: string; isToday: boolean;
    }[] = [];

    for (let i = 0; i < 7; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() + i);
      const dateStr = formatDateForInput(d);
      meetings
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
      <section className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-900">
            Upcoming Meetings <span className="font-normal text-slate-400">(Next 7 Days)</span>
          </h3>
          <button type="button" onClick={() => setViewMode('agenda')} className="text-xs font-semibold text-blue-600 hover:text-blue-700">View all</button>
        </div>

        {items.length === 0 ? (
          <div className="p-10 text-center">
            <CalendarCheck className="w-8 h-8 mx-auto text-slate-300 mb-2" />
            <p className="text-xs text-slate-500">No meetings in the next 7 days.</p>
            <button type="button" onClick={openCreate} className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-blue-600 bg-blue-50 hover:bg-blue-100 transition-colors">
              <Plus className="w-3.5 h-3.5" /> Schedule one
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
                    className="w-full flex items-center gap-3 sm:gap-4 px-4 sm:px-5 py-3 text-left hover:bg-blue-50/40 transition-colors group"
                  >
                    {/* Date block */}
                    <div className={`w-12 shrink-0 rounded-xl flex flex-col items-center justify-center py-1 ${
                      item.isToday ? 'bg-blue-600 text-white shadow-sm shadow-blue-600/25' : 'bg-slate-50 text-slate-500'
                    }`}>
                      <span className={`text-[8px] font-bold uppercase tracking-wider leading-none ${item.isToday ? 'text-blue-100' : 'text-slate-400'}`}>
                        {item.date.toLocaleDateString('en-US', { month: 'short' })}
                      </span>
                      <span className="text-[15px] font-extrabold leading-tight mt-0.5">{item.date.getDate()}</span>
                    </div>

                    {/* Time + day tag */}
                    <div className="w-[72px] shrink-0">
                      <p className="text-[11px] font-bold text-slate-900 tabular-nums leading-none">{formatTime12(getMeetingTime(m))}</p>
                      <p className={`text-[9px] font-bold mt-1 uppercase tracking-wide ${item.isToday ? 'text-blue-600' : 'text-slate-400'}`}>
                        {item.dayTag}
                      </p>
                    </div>

                    {/* Type icon */}
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${color.light} ${color.text}`}>
                      {getMeetingIcon(getMeetingType(m))}
                    </div>

                    {/* Title + meta */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-slate-900 truncate group-hover:text-blue-600 transition-colors">
                        {getMeetingTitle(m)}
                      </p>
                      <p className="text-[11px] text-slate-400 truncate mt-0.5">
                        {m.officer_name ? `with ${m.officer_name}` : ''}
                        {m.officer_name && (m.location || m.venue) ? ' · ' : ''}
                        {(m.location || m.venue) || ''}
                      </p>
                    </div>

                    {/* Type badge (desktop) */}
                    <span className={`hidden md:inline-flex items-center px-2 py-0.5 rounded-md text-[9px] font-bold uppercase border shrink-0 ${color.light} ${color.text} ${color.border}`}>
                      {getMeetingType(m)}
                    </span>

                    {/* Status dot */}
                    <span className={`w-2 h-2 rounded-full shrink-0 ${statusDot}`} title={m.status || 'Scheduled'} />

                    <ChevronRightIcon className="w-4 h-4 text-slate-300 group-hover:text-blue-500 group-hover:translate-x-0.5 transition-all shrink-0" />
                  </button>
                );
              })}
            </div>

            {/* Show more / less */}
            {items.length > UPCOMING_PAGE_SIZE && (
              <div className="border-t border-slate-100 px-4 sm:px-5 py-2.5 flex items-center justify-between bg-slate-50/50">
                <p className="text-[11px] font-medium text-slate-400">
                  Showing {visible.length} of {items.length}
                </p>
                <button
                  type="button"
                  onClick={() => setShowAllUpcoming(v => !v)}
                  className="text-[11px] font-bold text-blue-600 hover:text-blue-700"
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

  /* ── Navigation ── */

  const navigate = (dir: 'prev' | 'next') => {
    const d = new Date(currentDate);
    const amount = dir === 'next' ? 1 : -1;
    if (viewMode === 'year') d.setFullYear(d.getFullYear() + amount);
    else if (viewMode === 'month' || viewMode === 'agenda') d.setMonth(d.getMonth() + amount);
    else if (viewMode === 'day') d.setDate(d.getDate() + amount);
    setCurrentDate(d);
  };

  const goToToday = () => setCurrentDate(new Date());

  const getHeaderLabel = () => {
    if (viewMode === 'year') return String(currentDate.getFullYear());
    if (viewMode === 'day') return currentDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
    return currentDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  };

  /* ── Shared panel wiring ── */

  const openCreateForDate = (date: Date) => {
    setOffCanvasMode(null);
    setSelectedMeeting(null);
    setSelectedDate(null);
    setEditingMeeting(null);
    setPanelDate(formatDateForInput(date));
    setPanelOpen(true);
  };

  const openCreate = () => openCreateForDate(new Date());

  const openEditMeeting = (meeting: any) => {
    setOffCanvasMode(null);
    setSelectedMeeting(null);
    setSelectedDate(null);
    setPanelDate('');
    setEditingMeeting(meeting);
    setPanelOpen(true);
  };

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

    const todayMeetings = meetings
      .filter(m => getMeetingDateStr(m) === todayStr)
      .sort((a, b) => getMeetingTime(a).localeCompare(getMeetingTime(b)))
      .slice(0, 3);

    const miniDays: (number | null)[] = [...days];

    return (
      <div className="space-y-3">
        <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_270px] gap-3 items-start">
          <section className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50/60">
              {dayNames.map(day => (
                <div key={day} className="py-3 text-center text-[11px] sm:text-xs font-semibold uppercase tracking-widest text-slate-500">
                  {day}
                </div>
              ))}
            </div>

            <div className="grid grid-cols-7">
              {days.map((day, index) => {
                if (!day) return <div key={index} className="min-h-[112px] border-b border-r border-slate-100 bg-slate-50/25" />;

                const cellDate = new Date(year, month, day);
                const dateStr = formatDateForInput(cellDate);
                const dayMeetings = meetings
                  .filter(m => getMeetingDateStr(m) === dateStr)
                  .sort((a, b) => getMeetingTime(a).localeCompare(getMeetingTime(b)));
                const isToday = cellDate.toDateString() === new Date().toDateString();

                return (
                  <div
                    key={index}
                    onClick={() => openDayDetails(cellDate)}
                    className={`min-h-[148px] border-b border-r border-slate-100 p-2.5 cursor-pointer transition-colors hover:bg-slate-50 ${isToday ? 'bg-blue-50/25' : 'bg-white'}`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className={`w-8 h-8 flex items-center justify-center rounded-full text-sm font-semibold ${isToday ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-700 hover:bg-slate-100'}`}>
                        {day}
                      </span>
                      {dayMeetings.length > 0 && <span className="text-[10px] font-bold text-slate-400">{dayMeetings.length}</span>}
                    </div>

                    <div className="space-y-1.5">
                      {dayMeetings.slice(0, 3).map((m, i) => {
                        const color = getMeetingVisualColor(m);
                        return (
                          <button
                            key={m.id || i}
                            type="button"
                            onClick={(e) => { e.stopPropagation(); openMeeting(m); }}
                            className={`w-full text-left rounded-lg px-2.5 py-2 border-l-[3px] ${color.light} ${color.border} hover:shadow-sm transition-all overflow-hidden`}
                          >
                            <div className={`flex items-center gap-1.5 ${color.text}`}>
                              <span className="shrink-0">{getMeetingIcon(getMeetingType(m))}</span>
                              <span className="truncate text-[11px] font-semibold">{getMeetingTitle(m)}</span>
                            </div>
                            <p className="text-[10px] font-medium text-slate-500 mt-1 pl-5 tabular-nums">
                              {formatTime12(getMeetingTime(m))}
                            </p>
                          </button>
                        );
                      })}
                      {dayMeetings.length > 3 && (
                        <button type="button" onClick={(e) => { e.stopPropagation(); openDayDetails(cellDate); }} className="text-[10px] font-bold text-blue-600 hover:underline px-1">
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
          <aside className="space-y-1">
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="px-4 py-4 border-b border-slate-200 flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Scheduled Today</h3>
                  <p className="text-[10px] text-slate-500 mt-0.5">{todayMeetings.length} meeting{todayMeetings.length === 1 ? '' : 's'} scheduled</p>
                </div>
                <span className="w-7 h-7 rounded-full bg-blue-50 text-blue-700 flex items-center justify-center text-[10px] font-bold">{todayMeetings.length}</span>
              </div>
              <div className="p-4 space-y-3">
                {todayMeetings.length ? todayMeetings.map((m, i) => {
                  const color = getMeetingVisualColor(m);
                  return (
                    <button type="button" key={m.id || i} onClick={() => openMeeting(m)} className="w-full text-left flex gap-3 group">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${color.light} ${color.text}`}>{getMeetingIcon(getMeetingType(m))}</div>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-semibold text-slate-900 truncate group-hover:text-blue-600">{getMeetingTitle(m)}</p>
                        <p className="text-[10px] text-slate-500 mt-1">{getMeetingTime(m)}{m.duration ? ` – ${m.duration} min` : ''}</p>
                        {(m.location || m.venue) && <p className="text-[10px] text-slate-400 mt-1 flex items-center gap-1 truncate"><MapPin className="w-3 h-3 shrink-0" />{m.location || m.venue}</p>}
                      </div>
                      <MoreVertical className="w-4 h-4 text-slate-400 shrink-0" />
                    </button>
                  );
                }) : (
                  <div className="py-5 text-center"><CalendarCheck className="w-7 h-7 mx-auto text-slate-300 mb-2" /><p className="text-xs text-slate-500">No meetings today</p></div>
                )}
                <button type="button" onClick={() => setViewMode('agenda')} className="w-full pt-2 text-xs font-semibold text-blue-600 hover:text-blue-700 flex items-center justify-center gap-1">
                  View full agenda <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-bold text-slate-900">Mini Calendar</h3>
                <div className="flex gap-1">
                  <button type="button" onClick={() => navigate('prev')} className="p-1.5 rounded-lg hover:bg-slate-100" aria-label="Previous month"><ChevronLeft className="w-3.5 h-3.5 text-slate-500" /></button>
                  <button type="button" onClick={() => navigate('next')} className="p-1.5 rounded-lg hover:bg-slate-100" aria-label="Next month"><ChevronRight className="w-3.5 h-3.5 text-slate-500" /></button>
                </div>
              </div>
              <p className="text-center text-xs font-semibold text-slate-700 mb-3">{currentDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</p>
              <div className="grid grid-cols-7 mb-1">
                {dayNames.map(d => <span key={d} className="text-center text-[8px] font-semibold text-slate-400">{d.charAt(0)}</span>)}
              </div>
              <div className="grid grid-cols-7 gap-y-1">
                {miniDays.map((day, index) => {
                  if (!day) return <span key={index} className="h-7" />;
                  const d = new Date(year, month, day);
                  const dStr = formatDateForInput(d);
                  const hasMeeting = meetings.some(m => getMeetingDateStr(m) === dStr);
                  const isToday = d.toDateString() === new Date().toDateString();
                  return (
                    <button type="button" key={index} onClick={() => { setCurrentDate(d); setViewMode('day'); }} className={`relative h-7 w-7 mx-auto rounded-full text-[10px] font-medium ${isToday ? 'bg-blue-600 text-white font-bold' : 'text-slate-600 hover:bg-slate-100'}`}>
                      {day}
                      {hasMeeting && !isToday && <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-blue-500" />}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
              <h3 className="text-sm font-bold text-slate-900 mb-2.5">Calendars</h3>
              <div className="space-y-1.5">
                {[
                  ['All Meetings', 'bg-blue-500'],
                  ['General', 'bg-purple-500'],
                  ['Official', 'bg-emerald-500'],
                  ['Personal', 'bg-amber-500'],
                ].map(([label, dot]) => (
                  <div key={label} className="flex items-center gap-2.5 text-xs text-slate-600">
                    <span className={`w-2 h-2 rounded-full shrink-0 ${dot}`} />
                    <span className="truncate">{label}</span>
                  </div>
                ))}
              </div>
            </div>
          </aside>
        </div>

        {/* Upcoming meetings — flat list */}
        {renderUpcoming()}
      </div>
    );
  };

  /* ─── Day View ─── */
  const renderDayView = () => {
    const dateStr = formatDateForInput(currentDate);
    const dayMeetings = meetings.filter(m => getMeetingDateStr(m) === dateStr).sort((a, b) => getMeetingTime(a).localeCompare(getMeetingTime(b)));
    const hours = Array.from({ length: 12 }, (_, i) => i + 8);

    return (
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
          <div>
            <p className="text-sm font-bold text-slate-900">{currentDate.toLocaleDateString('en-US', { weekday: 'long' })}</p>
            <p className="text-xs text-slate-500">{currentDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</p>
          </div>
          <button type="button" onClick={() => openCreateForDate(currentDate)} className="flex items-center gap-2 px-3 py-2 bg-blue-600 text-white rounded-lg text-xs font-semibold hover:bg-blue-700"><Plus className="w-3.5 h-3.5" /> New Meeting</button>
        </div>
        <div className="divide-y divide-slate-100">
          {hours.map(hour => {
            const time = hourToTime(hour);
            const hourMeetings = dayMeetings.filter(m => getMeetingTime(m).startsWith(String(hour).padStart(2, '0')));
            return (
              <div key={hour} className="grid grid-cols-[80px_1fr] min-h-[72px]">
                <div className="px-4 py-3 text-[10px] font-semibold text-slate-400 border-r border-slate-100">{time}</div>
                <div className="p-2 space-y-2">
                  {hourMeetings.map((m, i) => {
                    const color = getMeetingVisualColor(m);
                    return <button key={m.id || i} onClick={() => openMeeting(m)} className={`w-full text-left px-3 py-2 rounded-lg ${color.light} ${color.text} border-l-2 ${color.border}`}><p className="text-xs font-semibold">{getMeetingTitle(m)}</p><p className="text-[10px] opacity-75 mt-0.5">{getMeetingTime(m)} {m.location ? `· ${m.location}` : ''}</p></button>;
                  })}
                </div>
              </div>
            );
          })}
        </div>
        {dayMeetings.length === 0 && <div className="py-10 text-center text-xs text-slate-400">No meetings scheduled for this day.</div>}
      </div>
    );
  };

  /* ─── Agenda View — scoped to the selected month, sectioned + paginated ─── */
  const renderAgendaView = () => {
    const viewYear = currentDate.getFullYear();
    const viewMonth = currentDate.getMonth();
    const monthStart = new Date(viewYear, viewMonth, 1);
    const monthEnd = new Date(viewYear, viewMonth + 1, 0);
    const monthStartStr = formatDateForInput(monthStart);
    const monthEndStr = formatDateForInput(monthEnd);
    const monthLabel = monthStart.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    const shortMonthLabel = monthStart.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = formatDateForInput(today);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = formatDateForInput(tomorrow);
    const weekEnd = new Date(today);
    weekEnd.setDate(weekEnd.getDate() + 7);
    const weekEndStr = formatDateForInput(weekEnd);

    const isCurrentMonth = today.getFullYear() === viewYear && today.getMonth() === viewMonth;
    const isPastMonth = monthEnd < today;

    const goToCurrentMonth = () => setCurrentDate(new Date());

    const dated = meetings.filter(m => {
      const d = getMeetingDateStr(m);
      if (!d) return false;
      if (d < monthStartStr || d > monthEndStr) return false;
      return agendaFilter === 'all' || (m.status || 'Scheduled') === agendaFilter;
    });

    const monthSorted = [...dated].sort((a, b) =>
      `${getMeetingDateStr(a)} ${getMeetingTime(a)}`.localeCompare(`${getMeetingDateStr(b)} ${getMeetingTime(b)}`)
    );

    let sections: {
      id: string; label: string; sub: string; icon: any; iconBg: string;
      meetings: any[]; showDate: boolean; defaultCollapsed: boolean;
    }[];

    if (isCurrentMonth) {
      sections = [
        {
          id: 'today', label: 'Today',
          sub: today.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' }),
          icon: CalendarCheck,
          iconBg: 'bg-gradient-to-br from-blue-500 to-blue-600 text-white shadow-md shadow-blue-500/25',
          meetings: monthSorted.filter(m => getMeetingDateStr(m) === todayStr),
          showDate: false, defaultCollapsed: false,
        },
        {
          id: 'tomorrow', label: 'Tomorrow',
          sub: tomorrow.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' }),
          icon: Sunrise,
          iconBg: 'bg-gradient-to-br from-amber-400 to-orange-500 text-white shadow-md shadow-orange-400/25',
          meetings: monthSorted.filter(m => getMeetingDateStr(m) === tomorrowStr),
          showDate: false, defaultCollapsed: false,
        },
        {
          id: 'week', label: 'Rest of This Week',
          sub: `Until ${weekEnd.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}`,
          icon: CalendarDays,
          iconBg: 'bg-gradient-to-br from-violet-500 to-purple-600 text-white shadow-md shadow-purple-500/25',
          meetings: monthSorted.filter(m => {
            const d = getMeetingDateStr(m);
            return d > tomorrowStr && d <= weekEndStr;
          }),
          showDate: true, defaultCollapsed: false,
        },
        {
          id: 'later', label: 'Later This Month',
          sub: `After ${weekEnd.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`,
          icon: CalendarClock,
          iconBg: 'bg-gradient-to-br from-indigo-500 to-indigo-600 text-white shadow-md shadow-indigo-500/25',
          meetings: monthSorted.filter(m => getMeetingDateStr(m) > weekEndStr),
          showDate: true, defaultCollapsed: false,
        },
        {
          id: 'earlier', label: 'Earlier This Month',
          sub: 'Past meetings from this month',
          icon: History,
          iconBg: 'bg-slate-100 text-slate-500',
          meetings: monthSorted.filter(m => getMeetingDateStr(m) < todayStr),
          showDate: true, defaultCollapsed: true,
        },
      ];
    } else {
      sections = [
        {
          id: 'month', label: monthLabel,
          sub: isPastMonth ? 'Past month · most recent first' : 'Upcoming month',
          icon: isPastMonth ? History : CalendarRange,
          iconBg: isPastMonth
            ? 'bg-slate-100 text-slate-500'
            : 'bg-gradient-to-br from-indigo-500 to-indigo-600 text-white shadow-md shadow-indigo-500/25',
          meetings: isPastMonth ? [...monthSorted].reverse() : monthSorted,
          showDate: true, defaultCollapsed: false,
        },
      ];
    }

    sections = sections.filter(s => s.meetings.length > 0);

    const daysWithMeetings = new Set(monthSorted.map(m => getMeetingDateStr(m))).size;
    const upcomingCount = monthSorted.filter(m => getMeetingDateStr(m) >= todayStr).length;
    const stats = [
      { label: 'Meetings this month', value: monthSorted.length, icon: CalendarIcon, bubble: 'bg-blue-50 text-blue-600' },
      { label: 'Days with meetings', value: daysWithMeetings, icon: CalendarDays, bubble: 'bg-violet-50 text-violet-600' },
      { label: 'Upcoming', value: upcomingCount, icon: TrendingUp, bubble: 'bg-emerald-50 text-emerald-600' },
      { label: 'Past', value: monthSorted.length - upcomingCount, icon: History, bubble: 'bg-slate-100 text-slate-500' },
    ];

    const renderSection = (section: (typeof sections)[number]) => {
      const Icon = section.icon;
      const isCollapsed = collapsed[section.id] ?? section.defaultCollapsed;
      const page = sectionPages[section.id] ?? 0;
      const totalPages = Math.max(1, Math.ceil(section.meetings.length / AGENDA_PAGE_SIZE));
      const safePage = Math.min(page, totalPages - 1);
      const pageMeetings = section.meetings.slice(safePage * AGENDA_PAGE_SIZE, (safePage + 1) * AGENDA_PAGE_SIZE);

      return (
        <div key={section.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <button
            type="button"
            onClick={() => toggleSection(section.id)}
            className="w-full px-4 sm:px-5 py-3.5 flex items-center gap-3 sm:gap-4 text-left hover:bg-slate-50/70 transition-colors"
          >
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${section.iconBg}`}>
              <Icon className="w-4 h-4" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-slate-900">{section.label}</p>
              <p className="text-[11px] text-slate-400 truncate mt-0.5">{section.sub}</p>
            </div>
            <span className={`shrink-0 inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-bold ${
              section.id === 'today' ? 'bg-blue-50 text-blue-700' : 'bg-slate-100 text-slate-500'
            }`}>
              {section.meetings.length} meeting{section.meetings.length !== 1 ? 's' : ''}
            </span>
            <ChevronRight className={`w-4 h-4 text-slate-400 shrink-0 transition-transform ${isCollapsed ? '' : 'rotate-90'}`} />
          </button>

          {!isCollapsed && (
            <>
              <div className="divide-y divide-slate-100 border-t border-slate-100">
                {pageMeetings.map((m, i) => {
                  const color = getMeetingVisualColor(m);
                  const statusDot = STATUS_DOTS[m.status] || STATUS_DOTS['Scheduled'];
                  const dateStr = getMeetingDateStr(m);
                  const d = dateStr ? new Date(`${dateStr}T00:00:00`) : null;
                  return (
                    <button
                      key={m.id || `${section.id}-${i}`}
                      onClick={() => openMeeting(m)}
                      className="w-full flex items-center gap-3 sm:gap-4 px-4 sm:px-5 py-3.5 text-left hover:bg-blue-50/40 transition-colors group"
                    >
                      {section.showDate && d && (
                        <div className="w-11 shrink-0 text-center">
                          <p className="text-sm font-extrabold text-slate-900 leading-none">{d.getDate()}</p>
                          <p className="text-[9px] font-bold uppercase text-slate-400 mt-0.5">
                            {d.toLocaleDateString('en-US', { month: 'short' })}
                          </p>
                        </div>
                      )}

                      <span className="shrink-0 text-[11px] font-bold tabular-nums text-slate-700 bg-slate-100 group-hover:bg-blue-100 group-hover:text-blue-700 rounded-lg px-2 py-1.5 transition-colors">
                        {formatTime12(getMeetingTime(m))}
                      </span>

                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${color.light} ${color.text}`}>
                        {getMeetingIcon(getMeetingType(m))}
                      </div>

                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-slate-900 truncate group-hover:text-blue-600 transition-colors">
                          {getMeetingTitle(m)}
                        </p>
                        <p className="text-[11px] text-slate-400 truncate mt-0.5">
                          {m.officer_name ? `with ${m.officer_name}` : ''}
                          {m.officer_name && (m.location || m.venue) ? ' · ' : ''}
                          {(m.location || m.venue) || ''}
                        </p>
                      </div>

                      <span className={`hidden md:inline-flex items-center px-2 py-0.5 rounded-md text-[9px] font-bold uppercase border shrink-0 ${color.light} ${color.text} ${color.border}`}>
                        {getMeetingType(m)}
                      </span>

                      <span className={`w-2 h-2 rounded-full shrink-0 ${statusDot}`} title={m.status || 'Scheduled'} />

                      <ChevronRightIcon className="w-4 h-4 text-slate-300 group-hover:text-blue-500 group-hover:translate-x-0.5 transition-all shrink-0" />
                    </button>
                  );
                })}
              </div>

              {totalPages > 1 && (
                <div className="border-t border-slate-100 px-4 sm:px-5 py-2.5 flex items-center justify-between bg-slate-50/50">
                  <p className="text-[11px] font-medium text-slate-400">
                    Showing {safePage * AGENDA_PAGE_SIZE + 1}–{Math.min((safePage + 1) * AGENDA_PAGE_SIZE, section.meetings.length)} of {section.meetings.length}
                  </p>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setSectionPage(section.id, safePage - 1)}
                      disabled={safePage === 0}
                      className="w-7 h-7 rounded-lg bg-white ring-1 ring-slate-200 flex items-center justify-center text-slate-500 hover:ring-blue-300 hover:text-blue-600 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                      aria-label="Previous page"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    <span className="text-[11px] font-bold text-slate-600 tabular-nums px-1">{safePage + 1} / {totalPages}</span>
                    <button
                      type="button"
                      onClick={() => setSectionPage(section.id, safePage + 1)}
                      disabled={safePage === totalPages - 1}
                      className="w-7 h-7 rounded-lg bg-white ring-1 ring-slate-200 flex items-center justify-center text-slate-500 hover:ring-blue-300 hover:text-blue-600 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                      aria-label="Next page"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      );
    };

    return (
      <div className="space-y-4">
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            <div className="flex items-center gap-3 flex-wrap">
              <div>
                <h3 className="text-sm font-bold text-slate-900">Meeting Agenda</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  {isCurrentMonth ? 'Current month, organized by timeframe' : monthLabel}
                </p>
              </div>

              <div className="flex items-center gap-1 bg-slate-50 rounded-xl ring-1 ring-slate-200 p-1">
                <button
                  type="button"
                  onClick={() => navigate('prev')}
                  className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-500 hover:bg-white hover:text-blue-600 transition-colors"
                  aria-label="Previous month"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="text-xs font-bold text-slate-700 tabular-nums px-1.5 min-w-[70px] text-center">
                  {shortMonthLabel}
                </span>
                <button
                  type="button"
                  onClick={() => navigate('next')}
                  className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-500 hover:bg-white hover:text-blue-600 transition-colors"
                  aria-label="Next month"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>

              {!isCurrentMonth && (
                <button
                  type="button"
                  onClick={goToCurrentMonth}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-bold text-blue-600 bg-blue-50 hover:bg-blue-100 transition-colors"
                >
                  <CalendarCheck className="w-3 h-3" /> Current month
                </button>
              )}
            </div>

            <div className="flex items-center gap-1.5 flex-wrap">
              <Filter className="w-3.5 h-3.5 text-slate-400 mr-0.5" />
              {AGENDA_FILTERS.map(f => {
                const active = agendaFilter === f.value;
                const count = f.value === 'all'
                  ? meetings.filter(m => {
                      const d = getMeetingDateStr(m);
                      return d >= monthStartStr && d <= monthEndStr;
                    }).length
                  : meetings.filter(m => {
                      const d = getMeetingDateStr(m);
                      if (d < monthStartStr || d > monthEndStr) return false;
                      return (m.status || 'Scheduled') === f.value;
                    }).length;
                return (
                  <button
                    key={f.value}
                    type="button"
                    onClick={() => applyAgendaFilter(f.value)}
                    className={`px-2.5 py-1.5 rounded-full text-[11px] font-semibold transition-all ${
                      active ? 'bg-blue-600 text-white shadow-sm shadow-blue-500/30' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {f.label}
                    <span className={`ml-1 ${active ? 'text-blue-100' : 'text-slate-400'}`}>{count}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 divide-x divide-slate-100">
            {stats.map(s => {
              const Icon = s.icon;
              return (
                <div key={s.label} className="flex items-center gap-3 px-5 py-3.5">
                  <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${s.bubble}`}>
                    <Icon className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-lg font-extrabold text-slate-900 leading-none tabular-nums">{s.value}</p>
                    <p className="text-[10px] font-semibold text-slate-400 mt-1 truncate">{s.label}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {sections.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-16 text-center">
            <div className="w-16 h-16 rounded-2xl bg-slate-50 flex items-center justify-center mx-auto mb-4">
              <CalendarDays className="w-8 h-8 text-slate-300" />
            </div>
            <p className="text-sm font-semibold text-slate-700">
              {agendaFilter !== 'all'
                ? 'No meetings match this filter'
                : `No meetings in ${monthLabel}`}
            </p>
            <p className="text-xs text-slate-400 mt-1">
              {agendaFilter !== 'all' ? 'Try a different status filter' : 'Try another month or create a new meeting'}
            </p>
            <div className="flex items-center justify-center gap-2 mt-5 flex-wrap">
              {agendaFilter !== 'all' && (
                <button
                  onClick={() => applyAgendaFilter('all')}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 border border-slate-200 hover:bg-slate-50 transition-colors"
                >
                  Clear filter
                </button>
              )}
              {!isCurrentMonth && (
                <button
                  onClick={goToCurrentMonth}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-blue-600 bg-blue-50 hover:bg-blue-100 transition-colors"
                >
                  Go to current month
                </button>
              )}
              <button
                onClick={openCreate}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 shadow-sm shadow-blue-600/25 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" /> New Meeting
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {sections.map(renderSection)}
          </div>
        )}
      </div>
    );
  };

  /* ══════════════════════════════════════════════════════════════════════════
     ⚠️ RECONSTRUCTED SECTION — your paste was cut off here.
     Everything below (rest of Year view, off-canvas panels, CreateMeetingPanel
     rendering, main return) is rebuilt in your code style, wired to your
     existing state/handlers, and using the icons your imports already listed.
     Compare with your original before saving — especially the
     CreateMeetingPanel props. Keep your original JSX wherever it differs.
     ══════════════════════════════════════════════════════════════════════════ */

  /* ─── Year View ─── */
  const renderYearView = () => {
    const year = currentDate.getFullYear();
    const months = Array.from({ length: 12 }, (_, i) => i);
    const monthNames = Array.from({ length: 12 }, (_, i) =>
      new Date(year, i, 1).toLocaleDateString('en-US', { month: 'long' })
    );

    const isCurrentMonth = (monthIndex: number) =>
      new Date().getFullYear() === year && new Date().getMonth() === monthIndex;

    const yearMeetings = meetings.filter(m => getMeetingDateStr(m).startsWith(String(year)));

    const goToMonth = (monthIndex: number) => {
      setCurrentDate(new Date(year, monthIndex, 1));
      setViewMode('month');
    };

    return (
      <div className="space-y-3">
        {/* Year summary */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm px-5 py-4 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-slate-900">{year} Calendar</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              {yearMeetings.length} meeting{yearMeetings.length !== 1 ? 's' : ''} scheduled in {year}
            </p>
          </div>
          <button
            type="button"
            onClick={() => { goToToday(); setViewMode('month'); }}
            className="inline-flex items-center gap-1.5 px-3 py-2 bg-blue-600 text-white rounded-lg text-xs font-semibold hover:bg-blue-700 transition-colors"
          >
            <CalendarCheck className="w-3.5 h-3.5" /> Back to today
          </button>
        </div>

        {/* 12 month mini grids */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {months.map(monthIndex => {
            const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
            const firstDay = new Date(year, monthIndex, 1).getDay();
            const monthMeetings = yearMeetings.filter(m => {
              const d = getMeetingDateStr(m);
              const prefix = `${year}-${String(monthIndex + 1).padStart(2, '0')}`;
              return d >= `${prefix}-01` && d <= `${prefix}-${String(daysInMonth).padStart(2, '0')}`;
            });
            const meetingDates = new Set(monthMeetings.map(m => getMeetingDateStr(m)));

            return (
              <div key={monthIndex} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
                <button
                  type="button"
                  onClick={() => goToMonth(monthIndex)}
                  className={`w-full flex items-center justify-between mb-3 group transition-colors ${
                    isCurrentMonth(monthIndex) ? 'text-blue-600' : 'text-slate-900 hover:text-blue-600'
                  }`}
                >
                  <span className="text-sm font-bold">{monthNames[monthIndex]}</span>
                  {monthMeetings.length > 0 && (
                    <span className="text-[10px] font-bold text-slate-400 group-hover:text-blue-600 transition-colors">
                      {monthMeetings.length}
                    </span>
                  )}
                </button>

                <div className="grid grid-cols-7 mb-1">
                  {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
                    <span key={i} className="text-center text-[8px] font-semibold text-slate-400">{d}</span>
                  ))}
                </div>

                <div className="grid grid-cols-7 gap-y-1">
                  {Array.from({ length: firstDay }).map((_, i) => (
                    <span key={`pad-${i}`} className="h-6" />
                  ))}
                  {Array.from({ length: daysInMonth }, (_, i) => i + 1).map(day => {
                    const cellDate = new Date(year, monthIndex, day);
                    const dateStr = formatDateForInput(cellDate);
                    const hasMeeting = meetingDates.has(dateStr);
                    const isToday = cellDate.toDateString() === new Date().toDateString();
                    return (
                      <button
                        key={day}
                        type="button"
                        onClick={() => { setCurrentDate(cellDate); setViewMode('month'); }}
                        className={`relative h-6 w-6 mx-auto rounded-full text-[10px] font-medium transition-colors ${
                          isToday ? 'bg-blue-600 text-white font-bold' : 'text-slate-600 hover:bg-slate-100'
                        }`}
                      >
                        {day}
                        {hasMeeting && !isToday && (
                          <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-blue-500" />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  /* ─── Off-canvas: Meeting details (view mode) ─── */
  const renderMeetingDetails = () => {
    const m = selectedMeeting;
    if (!m) return null;
    const color = getMeetingVisualColor(m);
    const attendees = getAttendeesArray(m.attendees);
    const dateStr = getMeetingDateStr(m);
    const d = dateStr ? new Date(`${dateStr}T00:00:00`) : null;
    const statusClass = STATUS_COLORS[m.status] || STATUS_COLORS['Scheduled'];

    return (
      <>
        {/* Backdrop */}
        <div className="fixed inset-0 bg-slate-900/40 z-40" onClick={closeOffCanvas} />

        {/* Panel */}
        <div className="fixed top-0 right-0 h-full w-full sm:w-[440px] bg-white z-50 shadow-2xl flex flex-col">
          {/* Header */}
          <div className="px-5 py-4 border-b border-slate-200 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[9px] font-bold uppercase border ${color.light} ${color.text} ${color.border}`}>
                  {getMeetingIcon(getMeetingType(m))} {getMeetingType(m)}
                </span>
                <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[9px] font-bold uppercase border ${statusClass}`}>
                  {m.status || 'Scheduled'}
                </span>
              </div>
              <h3 className="text-base font-bold text-slate-900 leading-snug">{getMeetingTitle(m)}</h3>
            </div>
            <button type="button" onClick={closeOffCanvas} className="p-2 rounded-lg hover:bg-slate-100 transition-colors shrink-0" aria-label="Close">
              <X className="w-5 h-5 text-slate-400" />
            </button>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto p-5 space-y-5">
            {/* When & where */}
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                  <Clock className="w-4 h-4" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-slate-900">
                    {d ? d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }) : '—'}
                  </p>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    {formatTime12(getMeetingTime(m))}{m.duration ? ` · ${m.duration} min` : ''}
                  </p>
                </div>
              </div>

              {(m.location || m.venue) && (
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                    <MapPin className="w-4 h-4" />
                  </div>
                  <p className="text-xs font-semibold text-slate-900">{m.location || m.venue}</p>
                </div>
              )}

              {(m.meeting_link || m.link) && (
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-violet-50 text-violet-600 flex items-center justify-center shrink-0">
                    <Video className="w-4 h-4" />
                  </div>
                  <a
                    href={m.meeting_link || m.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs font-semibold text-blue-600 hover:text-blue-700 hover:underline truncate"
                  >
                    Join meeting link
                  </a>
                </div>
              )}

              {d && (
                <button
                  type="button"
                  onClick={() => openDayDetails(d)}
                  className="w-full flex items-center gap-3 group"
                >
                  <div className="w-9 h-9 rounded-lg bg-slate-100 text-slate-500 flex items-center justify-center shrink-0 group-hover:bg-blue-50 group-hover:text-blue-600 transition-colors">
                    <LinkIcon className="w-4 h-4" />
                  </div>
                  <p className="text-xs font-semibold text-slate-500 group-hover:text-blue-600 transition-colors">
                    View this day's schedule
                  </p>
                </button>
              )}
            </div>

            {/* Officer */}
            {m.officer_name && (
              <div className="bg-slate-50 rounded-xl p-4">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-3">Officer</p>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-600 to-indigo-600 text-white flex items-center justify-center font-bold text-sm shrink-0">
                    {m.officer_name.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-900 truncate">{m.officer_name}</p>
                    <div className="flex flex-col gap-0.5 mt-0.5">
                      {(m.officer_email || m.email) && (
                        <p className="text-[11px] text-slate-500 flex items-center gap-1.5 truncate">
                          <Mail className="w-3 h-3 shrink-0" /> {m.officer_email || m.email}
                        </p>
                      )}
                      {(m.officer_phone || m.phone) && (
                        <p className="text-[11px] text-slate-500 flex items-center gap-1.5 truncate">
                          <Phone className="w-3 h-3 shrink-0" /> {m.officer_phone || m.phone}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Attendees */}
            {attendees.length > 0 && (
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2.5">
                  Attendees ({attendees.length})
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {attendees.map((a, i) => (
                    <span key={i} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-100 text-[11px] font-medium text-slate-600">
                      <User className="w-3 h-3 text-slate-400" /> {a}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Notes / agenda */}
            {(m.notes || m.description || (m.agenda && m.title)) && (
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2.5 flex items-center gap-1.5">
                  <FileText className="w-3 h-3" /> Notes
                </p>
                <p className="text-xs text-slate-600 leading-relaxed bg-slate-50 rounded-xl p-4 whitespace-pre-wrap">
                  {m.notes || m.description || m.agenda}
                </p>
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="px-5 py-4 border-t border-slate-200 flex gap-2 bg-slate-50/50">
            <button
              type="button"
              onClick={() => openEditMeeting(m)}
              className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold text-blue-600 bg-blue-50 hover:bg-blue-100 transition-colors"
            >
              <Edit3 className="w-3.5 h-3.5" /> Edit meeting
            </button>
           <button
  type="button"
  onClick={requestDelete}
  className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold text-red-600 bg-red-50 hover:bg-red-100 transition-colors"
>
  <Trash2 className="w-3.5 h-3.5" /> Delete
</button>
          </div>
        </div>
      </>
    );
  };

  /* ─── Off-canvas: Day details (day mode) ─── */
  const renderDayDetails = () => {
    if (!selectedDate) return null;
    const dateStr = formatDateForInput(selectedDate);
    const dayMeetings = meetings
      .filter(m => getMeetingDateStr(m) === dateStr)
      .sort((a, b) => getMeetingTime(a).localeCompare(getMeetingTime(b)));
    const isToday = selectedDate.toDateString() === new Date().toDateString();

    return (
      <>
        {/* Backdrop */}
        <div className="fixed inset-0 bg-slate-900/40 z-40" onClick={closeOffCanvas} />

        {/* Panel */}
        <div className="fixed top-0 right-0 h-full w-full sm:w-[440px] bg-white z-50 shadow-2xl flex flex-col">
          {/* Header */}
          <div className="px-5 py-4 border-b border-slate-200 flex items-start justify-between gap-3">
            <div>
              <h3 className="text-sm font-bold text-slate-900">
                {isToday ? 'Today' : selectedDate.toLocaleDateString('en-US', { weekday: 'long' })}
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                {selectedDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                {dayMeetings.length > 0 && ` · ${dayMeetings.length} meeting${dayMeetings.length !== 1 ? 's' : ''}`}
              </p>
            </div>
            <button type="button" onClick={closeOffCanvas} className="p-2 rounded-lg hover:bg-slate-100 transition-colors" aria-label="Close">
              <X className="w-5 h-5 text-slate-400" />
            </button>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto p-5 space-y-2.5">
            {dayMeetings.length === 0 ? (
              <div className="py-10 text-center">
                <CalendarCheck className="w-8 h-8 mx-auto text-slate-300 mb-2" />
                <p className="text-xs text-slate-500">No meetings scheduled for this day.</p>
              </div>
            ) : (
              dayMeetings.map((m, i) => {
                const color = getMeetingVisualColor(m);
                return (
                  <button
                    key={m.id || i}
                    type="button"
                    onClick={() => openMeeting(m)}
                    className={`w-full text-left rounded-xl px-4 py-3 border-l-[3px] ${color.light} ${color.border} hover:shadow-sm transition-all`}
                  >
                    <div className="flex items-center gap-2">
                      <span className={color.text}>{getMeetingIcon(getMeetingType(m))}</span>
                      <p className={`text-xs font-bold ${color.text} truncate`}>{getMeetingTitle(m)}</p>
                    </div>
                    <p className="text-[11px] text-slate-500 mt-1.5 tabular-nums">
                      {formatTime12(getMeetingTime(m))}{m.duration ? ` · ${m.duration} min` : ''}
                      {(m.location || m.venue) ? ` · ${m.location || m.venue}` : ''}
                    </p>
                  </button>
                );
              })
            )}
          </div>

          {/* Footer action */}
          <div className="px-5 py-4 border-t border-slate-200 bg-slate-50/50">
            <button
              type="button"
              onClick={() => openCreateForDate(selectedDate)}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 shadow-sm shadow-blue-600/25 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" /> New meeting on this day
            </button>
          </div>
        </div>
      </>
    );
  };

  const renderOffCanvas = () => {
    if (offCanvasMode === 'view') return renderMeetingDetails();
    if (offCanvasMode === 'day') return renderDayDetails();
    return null;
  };

  /* ─── Main render ─── */
  return (
    // ── ✅ AUTH: route guard — shows a loader while the session is verified,
    // redirects to /login when signed out, renders content only when signed in.
    // (AppShell already gates this page; this is defense in depth.) ──
    <ProtectedRoute>
      <div className="p-4 sm:p-6 space-y-4">
        {/* Header */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-slate-900">Calendar</h1>
            <p className="text-xs text-slate-500 mt-0.5">View and manage all meetings</p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* View switcher */}
            <div className="flex items-center gap-1 bg-slate-100 rounded-xl p-1">
              {(['year', 'month', 'day', 'agenda'] as ViewMode[]).map(mode => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setViewMode(mode)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold capitalize transition-all ${
                    viewMode === mode ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  {mode}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={openCreate}
              className="inline-flex items-center gap-2 px-3.5 py-2 bg-blue-600 text-white rounded-xl text-xs font-semibold hover:bg-blue-700 shadow-sm shadow-blue-600/25 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" /> New Meeting
            </button>
          </div>
        </div>

        {/* Toolbar: navigation + current label */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => navigate('prev')} className="p-2 rounded-lg bg-white border border-slate-200 hover:bg-slate-50 transition-colors" aria-label="Previous">
              <ChevronLeft className="w-4 h-4 text-slate-500" />
            </button>
            <button type="button" onClick={() => navigate('next')} className="p-2 rounded-lg bg-white border border-slate-200 hover:bg-slate-50 transition-colors" aria-label="Next">
              <ChevronRight className="w-4 h-4 text-slate-500" />
            </button>
            <button type="button" onClick={goToToday} className="px-3 py-2 rounded-lg bg-white border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-colors">
              Today
            </button>
            <h2 className="text-sm font-bold text-slate-900 ml-1">{getHeaderLabel()}</h2>
          </div>

          <button type="button" onClick={loadData} className="p-2 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors" aria-label="Refresh" title="Refresh">
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>

        {/* Error state */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-red-500 shrink-0" />
            <p className="text-xs font-medium text-red-700 flex-1">{error}</p>
            <button type="button" onClick={loadData} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-red-600 bg-white hover:bg-red-50 transition-colors">
              <RefreshCw className="w-3.5 h-3.5" /> Retry
            </button>
          </div>
        )}

        {/* Content */}
        {loading ? (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm py-24 flex flex-col items-center gap-3">
            <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
            <p className="text-xs font-medium text-slate-400">Loading meetings…</p>
          </div>
        ) : (
          viewMode === 'year' ? renderYearView() :
          viewMode === 'month' ? renderMonthView() :
          viewMode === 'day' ? renderDayView() :
          renderAgendaView()
        )}

        {/* Off-canvas panels (meeting details / day details) */}
        {renderOffCanvas()}

        {/* Delete confirmation modal — replaces the browser confirm() dialog */}
{confirmDelete && selectedMeeting && (
  <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
    {/* Backdrop */}
    <div className="absolute inset-0 bg-slate-900/50" onClick={cancelDelete} />

    {/* Dialog */}
    <div className="relative bg-white rounded-2xl shadow-2xl max-w-sm w-full p-5 sm:p-6">
      <div className="w-11 h-11 rounded-full bg-red-50 flex items-center justify-center mx-auto mb-3">
        <AlertCircle className="w-5 h-5 text-red-500" />
      </div>

      <h3 className="text-sm font-bold text-slate-900 text-center">Delete this meeting?</h3>
      <p className="text-xs text-slate-500 text-center mt-1.5 leading-relaxed">
        <span className="font-semibold text-slate-700">"{getMeetingTitle(selectedMeeting)}"</span> will be
        permanently removed. This action can't be undone.
      </p>

      {deleteError && (
        <div className="mt-3 bg-red-50 border border-red-200 rounded-lg px-3 py-2 flex items-center gap-2">
          <AlertCircle className="w-3.5 h-3.5 text-red-500 shrink-0" />
          <p className="text-[11px] font-medium text-red-700">{deleteError}</p>
        </div>
      )}

      <div className="flex gap-2 mt-5">
        <button
          type="button"
          onClick={cancelDelete}
          disabled={deleting}
          className="flex-1 px-4 py-2.5 rounded-xl text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 disabled:opacity-50 transition-colors"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={confirmDeleteMeeting}
          disabled={deleting}
          className="flex-1 inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-bold text-white bg-red-600 hover:bg-red-700 disabled:opacity-60 transition-colors"
        >
          {deleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
          {deleting ? 'Deleting…' : 'Delete'}
        </button>
      </div>
    </div>
  </div>
)}

        {/* ⚠️ RECONSTRUCTED — keep whatever props your original file passes to
            CreateMeetingPanel. Adjust the prop names below to match yours. */}
        {panelOpen && (
  <CreateMeetingPanel
    isOpen={panelOpen}
    onClose={closePanel}
    onSuccess={handlePanelSuccess}
    meetingToEdit={editingMeeting}   // ✅ renamed
    defaultDate={panelDate}          // ✅ renamed
  />
)}
      </div>
    </ProtectedRoute>
  );
}