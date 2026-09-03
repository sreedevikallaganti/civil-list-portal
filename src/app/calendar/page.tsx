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

type ViewMode = 'year' | 'month' | 'day' | 'agenda';
// 'create' and 'edit' removed — the shared CreateMeetingPanel handles both now
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
  // added for meetings created by the shared panel
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
  // added for meetings created by the shared panel
  'internal': { bg: 'bg-indigo-500', border: 'border-indigo-500', text: 'text-indigo-700', light: 'bg-indigo-50' },
  'external': { bg: 'bg-cyan-500', border: 'border-cyan-500', text: 'text-cyan-700', light: 'bg-cyan-50' },
};

const STATUS_COLORS: Record<string, string> = {
  'Scheduled': 'bg-blue-100 text-blue-700 border-blue-200',
  'Completed': 'bg-emerald-100 text-emerald-700 border-emerald-200',
  'Cancelled': 'bg-red-100 text-red-700 border-red-200',
  'Rescheduled': 'bg-amber-100 text-amber-700 border-amber-200',
};

// ✅ Was missing in your file — renderUpcoming references this
const STATUS_DOTS: Record<string, string> = {
  'Scheduled': 'bg-blue-500',
  'Completed': 'bg-emerald-500',
  'Cancelled': 'bg-rose-500',
  'Rescheduled': 'bg-amber-500',
};

export default function CalendarPage() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [viewMode, setViewMode] = useState<ViewMode>('month');
  const [meetings, setMeetings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedMeeting, setSelectedMeeting] = useState<any>(null);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [offCanvasMode, setOffCanvasMode] = useState<OffCanvasMode>(null);

  // ── Shared CreateMeetingPanel state (replaces the old create/edit form) ──
  const [panelOpen, setPanelOpen] = useState(false);
  const [editingMeeting, setEditingMeeting] = useState<any>(null);
  const [panelDate, setPanelDate] = useState<string>('');

    // ── Agenda view: status filter, per-section pagination, collapsible sections ──
  const [agendaFilter, setAgendaFilter] = useState<string>('all');
  const [sectionPages, setSectionPages] = useState<Record<string, number>>({});
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const AGENDA_PAGE_SIZE = 5;

  const AGENDA_FILTERS = [
    { value: 'all', label: 'All' },
    { value: 'Scheduled', label: 'Scheduled' },
    { value: 'Completed', label: 'Completed' },
    { value: 'Cancelled', label: 'Cancelled' },
    { value: 'Rescheduled', label: 'Rescheduled' },
  ];

  const applyAgendaFilter = (value: string) => {
    setAgendaFilter(value);
    setSectionPages({}); // reset all pagination when the filter changes
  };

  const setSectionPage = (id: string, p: number) =>
    setSectionPages(prev => ({ ...prev, [id]: p }));

  const toggleSection = (id: string) =>
    setCollapsed(prev => ({ ...prev, [id]: !prev[id] }));

  // Reset agenda pagination whenever the underlying data refreshes
  useEffect(() => { setSectionPages({}); }, [meetings, currentDate]);

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    try {
      setLoading(true);
      setError('');
      const data = await pb.collection('meetings').getFullList({ sort: '-created' });
      setMeetings(data);
    } catch (err: any) {
      console.error('Error:', err);
      setError(err.message || 'Failed to load meetings');
    } finally {
      setLoading(false);
    }
  }

  /* ── Field normalizers (read both old-style and panel-style records) ── */

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

  // Panel stores meeting_date as "YYYY-MM-DD HH:MM:SS.000Z" — parse the date
  // token directly (no Date parsing) so timezones can't shift the day.
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

  /* ── Upcoming Meetings — grouped into day sections (timeline) ── */

  const renderUpcoming = () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // One section per day for the next 7 days (empty days skipped)
    const sections: { dateStr: string; dateObj: Date; label: string; isToday: boolean; meetings: any[] }[] = [];
    for (let i = 0; i < 7; i++) {
      const day = new Date(today);
      day.setDate(day.getDate() + i);
      const dateStr = formatDateForInput(day);
      const dayMeetings = meetings
        .filter(m => getMeetingDateStr(m) === dateStr)
        .sort((a, b) => getMeetingTime(a).localeCompare(getMeetingTime(b)));
      if (dayMeetings.length === 0) continue;

      sections.push({
        dateStr,
        dateObj: day,
        label: i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : day.toLocaleDateString('en-US', { weekday: 'long' }),
        isToday: i === 0,
        meetings: dayMeetings,
      });
    }

    return (
      <section className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-900">
            Upcoming Meetings <span className="font-normal text-slate-400">(Next 7 Days)</span>
          </h3>
          <button type="button" onClick={() => setViewMode('agenda')} className="text-xs font-semibold text-blue-600 hover:text-blue-700">View all</button>
        </div>

        {sections.length === 0 ? (
          <div className="p-10 text-center">
            <CalendarCheck className="w-8 h-8 mx-auto text-slate-300 mb-2" />
            <p className="text-xs text-slate-500">No meetings in the next 7 days.</p>
          </div>
        ) : (
          <div className="relative">
            {/* Timeline rail */}
            <div className="absolute left-[40px] top-3 bottom-3 w-px bg-slate-200" aria-hidden="true" />

            {sections.map((s, si) => (
              <div key={s.dateStr} className={`relative px-5 py-4 ${si > 0 ? 'border-t border-slate-100' : ''}`}>
                {/* Day header */}
                <div className="flex items-center gap-3 mb-3">
                  <div className={`relative z-10 w-10 h-10 rounded-xl flex flex-col items-center justify-center shrink-0 ${
                    s.isToday
                      ? 'bg-gradient-to-br from-blue-500 to-blue-600 text-white shadow-md shadow-blue-500/30'
                      : 'bg-white ring-1 ring-slate-200 text-slate-600'
                  }`}>
                    <span className={`text-[8px] font-bold uppercase tracking-wide leading-none ${s.isToday ? 'text-blue-100' : 'text-slate-400'}`}>
                      {s.dateObj.toLocaleDateString('en-US', { month: 'short' })}
                    </span>
                    <span className="text-[15px] font-extrabold leading-tight">{s.dateObj.getDate()}</span>
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-bold text-slate-900">{s.label}</p>
                      <span className="text-[11px] font-medium text-slate-400">
                        {s.dateObj.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}
                      </span>
                    </div>
                  </div>

                  <span className={`shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold ${
                    s.isToday ? 'bg-blue-50 text-blue-700' : 'bg-slate-100 text-slate-500'
                  }`}>
                    {s.meetings.length} meeting{s.meetings.length !== 1 ? 's' : ''}
                  </span>
                </div>

                {/* Meeting cards */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 pl-[52px]">
                  {s.meetings.map((m, mi) => {
                    const color = getMeetingVisualColor(m);
                    const statusDot = STATUS_DOTS[m.status] || STATUS_DOTS['Scheduled'];
                    return (
                      <button
                        type="button"
                        key={m.id || mi}
                        onClick={() => openMeeting(m)}
                        className="group text-left p-3.5 rounded-xl border border-slate-200 bg-white hover:border-blue-300 hover:shadow-sm hover:-translate-y-0.5 transition-all flex gap-3"
                      >
                        <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${color.light} ${color.text}`}>
                          {getMeetingIcon(getMeetingType(m))}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-semibold text-slate-900 truncate group-hover:text-blue-600 transition-colors">
                            {getMeetingTitle(m)}
                          </p>
                          <div className="flex items-center gap-1.5 mt-1 text-[10px] text-slate-500">
                            <Clock className="w-3 h-3 shrink-0" />
                            <span className="font-semibold">{formatTime12(getMeetingTime(m))}</span>
                            {m.duration ? <span className="text-slate-400">· {m.duration} min</span> : null}
                          </div>
                          {(m.location || m.venue) && (
                            <p className="text-[10px] text-slate-400 mt-1 flex items-center gap-1 truncate">
                              <MapPin className="w-3 h-3 shrink-0" />{m.location || m.venue}
                            </p>
                          )}
                          {m.officer_name && (
                            <p className="text-[10px] text-slate-400 mt-1 truncate">with {m.officer_name}</p>
                          )}
                        </div>
                        <div className="flex flex-col items-end justify-between shrink-0">
                          <span className={`w-2 h-2 rounded-full ${statusDot}`} title={m.status || 'Scheduled'} />
                          <ChevronRightIcon className="w-3.5 h-3.5 text-slate-300 group-hover:text-blue-500 transition-colors" />
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
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

  /* ── Shared panel wiring (replaces openCreate / openCreateForDate / edit form) ── */

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

  const handleDeleteMeeting = async () => {
    if (!selectedMeeting) return;
    if (!confirm('Delete this meeting?')) return;
    try {
      await pb.collection('meetings').delete(selectedMeeting.id);
      closeOffCanvas();
      await loadData();
    } catch (err: any) {
      console.error('Delete error:', err);
    }
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

        {/* Upcoming meetings — grouped by day */}
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
          {/* opens the shared panel pre-filled with this date */}
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

  /* ─── Agenda View ─── */
    /* ─── Agenda View — sectioned timeline with pagination ─── */
    /* ─── Agenda View — scoped to the selected month, sectioned + paginated ─── */
  const renderAgendaView = () => {
    // ── Scope everything to the currently selected month ──
    const viewYear = currentDate.getFullYear();
    const viewMonth = currentDate.getMonth();
    const monthStart = new Date(viewYear, viewMonth, 1);
    const monthEnd = new Date(viewYear, viewMonth + 1, 0); // last day of month
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

    // ── Meetings within the selected month (after status filter) ──
    const dated = meetings.filter(m => {
      const d = getMeetingDateStr(m);
      if (!d) return false;
      if (d < monthStartStr || d > monthEndStr) return false;
      return agendaFilter === 'all' || (m.status || 'Scheduled') === agendaFilter;
    });

    const monthSorted = [...dated].sort((a, b) =>
      `${getMeetingDateStr(a)} ${getMeetingTime(a)}`.localeCompare(`${getMeetingDateStr(b)} ${getMeetingTime(b)}`)
    );

    // ── Sections ──
    let sections: {
      id: string; label: string; sub: string; icon: any; iconBg: string;
      meetings: any[]; showDate: boolean; defaultCollapsed: boolean;
    }[];

    if (isCurrentMonth) {
      // Time-aware sections within the current month
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
      // Any other month — a single section scoped to that month
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

    // ── Stats (scoped to the month) ──
    const daysWithMeetings = new Set(monthSorted.map(m => getMeetingDateStr(m))).size;
    const upcomingCount = monthSorted.filter(m => getMeetingDateStr(m) >= todayStr).length;
    const stats = [
      { label: 'Meetings this month', value: monthSorted.length, icon: CalendarIcon, bubble: 'bg-blue-50 text-blue-600' },
      { label: 'Days with meetings', value: daysWithMeetings, icon: CalendarDays, bubble: 'bg-violet-50 text-violet-600' },
      { label: 'Upcoming', value: upcomingCount, icon: TrendingUp, bubble: 'bg-emerald-50 text-emerald-600' },
      { label: 'Past', value: monthSorted.length - upcomingCount, icon: History, bubble: 'bg-slate-100 text-slate-500' },
    ];

    // ── Renders one section card with its own pagination ──
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
          {/* Header — title, month nav, filters */}
          <div className="px-5 py-4 border-b border-slate-200 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            <div className="flex items-center gap-3 flex-wrap">
              <div>
                <h3 className="text-sm font-bold text-slate-900">Meeting Agenda</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  {isCurrentMonth ? 'Current month, organized by timeframe' : monthLabel}
                </p>
              </div>

              {/* Month navigation — changes which month the agenda shows */}
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

            {/* Status filter chips */}
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

          {/* Stats row — scoped to the month */}
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

        {/* Sections */}
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

  /* ─── Year View ─── */
    /* ─── Year View — click any month card to open it in Month view ─── */
  const renderYearView = () => {
    const year = currentDate.getFullYear();
    const months = Array.from({ length: 12 }, (_, i) => i);
    const monthNames = Array.from({ length: 12 }, (_, i) =>
      new Date(year, i, 1).toLocaleDateString('en-US', { month: 'long' })
    );

    const isCurrentMonth = (monthIndex: number) =>
      new Date().getFullYear() === year && new Date().getMonth() === monthIndex;

    const getMonthMeetings = (monthIndex: number) => {
      const prefix = `${year}-${String(monthIndex + 1).padStart(2, '0')}`;
      return meetings.filter(m => getMeetingDateStr(m).startsWith(prefix));
    };

    const openMonth = (monthIndex: number) => {
      setCurrentDate(new Date(year, monthIndex, 1));
      setViewMode('month');
    };

    return (
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-3">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
          {months.map(monthIndex => {
            const firstDay = new Date(year, monthIndex, 1).getDay();
            const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
            const cells: (number | null)[] = [];
            for (let i = 0; i < firstDay; i++) cells.push(null);
            for (let day = 1; day <= daysInMonth; day++) cells.push(day);
            while (cells.length % 7 !== 0) cells.push(null);

            const monthMeetings = getMonthMeetings(monthIndex);
            const current = isCurrentMonth(monthIndex);
            const meetingDates = new Set(monthMeetings.map(m => getMeetingDateStr(m)));

            return (
              <div
                key={monthIndex}
                onClick={() => openMonth(monthIndex)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    openMonth(monthIndex);
                  }
                }}
                title={`Open ${monthNames[monthIndex]} ${year}`}
                className={`group rounded-xl border p-2.5 cursor-pointer transition-all hover:shadow-md hover:-translate-y-0.5 ${
                  current
                    ? 'border-blue-400 ring-2 ring-blue-100 bg-blue-50/30'
                    : 'border-slate-200 bg-white hover:border-blue-300'
                }`}
              >
                {/* Month header + meeting count badge */}
                <div className="flex items-center justify-between mb-1.5">
                  <span className={`text-sm font-bold transition-colors ${current ? 'text-blue-700' : 'text-slate-900 group-hover:text-blue-600'}`}>
                    {monthNames[monthIndex]}
                  </span>
                  {monthMeetings.length > 0 && (
                    <span className={`px-1.5 py-0.5 rounded-full text-[9px] font-bold shrink-0 ${current ? 'bg-blue-600 text-white' : 'bg-blue-50 text-blue-600 group-hover:bg-blue-100'}`}>
                      {monthMeetings.length}
                    </span>
                  )}
                </div>

                {/* Weekday headers */}
                <div className="grid grid-cols-7 mb-1">
                  {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
                    <span key={`${d}-${i}`} className="text-[8px] text-center font-semibold text-slate-400">{d}</span>
                  ))}
                </div>

                {/* Days — clicking a specific day still opens Day Details */}
                <div className="grid grid-cols-7 gap-y-1">
                  {cells.map((day, index) => {
                    if (!day) return <span key={index} className="h-5" />;
                    const date = new Date(year, monthIndex, day);
                    const dateStr = formatDateForInput(date);
                    const hasMeeting = meetingDates.has(dateStr);
                    const isToday = date.toDateString() === new Date().toDateString();
                    return (
                      <button
                        type="button"
                        key={index}
                        onClick={(e) => { e.stopPropagation(); openDayDetails(date); }}
                        className={`h-5 w-5 mx-auto rounded-full text-[9px] flex items-center justify-center transition-colors ${
                          isToday ? 'bg-blue-600 text-white font-bold'
                            : hasMeeting ? 'bg-blue-100 text-blue-700 font-semibold hover:bg-blue-200'
                            : 'text-slate-500 hover:bg-slate-100'
                        }`}
                      >
                        {day}
                      </button>
                    );
                  })}
                </div>

                {/* Hover hint — appears on hover, guides the click */}
                <p className="mt-1.5 text-[9px] font-semibold text-blue-600 flex items-center justify-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  Open month <ChevronRight className="w-2.5 h-2.5 group-hover:translate-x-0.5 transition-transform" />
                </p>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  /* ─── Day Details Off-Canvas ─── */
  const renderDayDetails = () => {
    if (!selectedDate) return null;
    const dateStr = formatDateForInput(selectedDate);
    const dayMeetings = meetings
      .filter(m => getMeetingDateStr(m) === dateStr)
      .sort((a, b) => getMeetingTime(a).localeCompare(getMeetingTime(b)));

    const isToday = selectedDate.toDateString() === new Date().toDateString();

    return (
      <>
        <div className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm transition-opacity" onClick={closeOffCanvas} />
        <div className="fixed right-0 top-0 bottom-0 z-50 w-full max-w-lg bg-white shadow-2xl transform transition-transform duration-300 ease-out overflow-y-auto">
          <div className="sticky top-0 bg-white/80 backdrop-blur-md border-b border-gray-200 px-6 py-5 z-10">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-gray-900">Day Details</h2>
              <button type="button" onClick={closeOffCanvas} className="p-2 hover:bg-gray-100 rounded-xl transition-colors">
                <X className="w-5 h-5 text-gray-600" />
              </button>
            </div>

            <div className={`p-5 rounded-2xl border-2 ${isToday ? 'bg-gradient-to-br from-blue-50 to-blue-100/50 border-blue-300' : 'bg-gradient-to-br from-gray-50 to-gray-100 border-gray-200'}`}>
              <div className="flex items-center gap-4">
                <div className={`w-16 h-16 rounded-2xl flex flex-col items-center justify-center shadow-lg ${isToday ? 'bg-blue-600 text-white' : 'bg-white border border-gray-200'}`}>
                  <span className="text-xs font-semibold uppercase opacity-70">{selectedDate.toLocaleDateString('en-US', { month: 'short' })}</span>
                  <span className="text-3xl font-bold leading-none">{selectedDate.getDate()}</span>
                </div>
                <div className="flex-1">
                  <p className="text-lg font-bold text-gray-900">{selectedDate.toLocaleDateString('en-US', { weekday: 'long' })}</p>
                  <p className="text-sm text-gray-600">{selectedDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</p>
                  <div className="flex items-center gap-2 mt-2">
                    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold ${dayMeetings.length > 0 ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'}`}>
                      <CalendarIcon className="w-3.5 h-3.5" />
                      {dayMeetings.length} meeting{dayMeetings.length !== 1 ? 's' : ''}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* opens the shared panel pre-filled with this day */}
            <button
              onClick={() => openCreateForDate(selectedDate)}
              className="w-full mt-4 flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-xl hover:from-blue-700 hover:to-blue-800 font-semibold shadow-lg shadow-blue-600/25 transition-all duration-200 hover:shadow-xl hover:shadow-blue-600/30 hover:-translate-y-0.5"
            >
              <Plus className="w-5 h-5" />
              Add Meeting
            </button>
          </div>

          <div className="p-6">
            {dayMeetings.length === 0 ? (
              <div className="text-center py-16">
                <div className="w-20 h-20 bg-gradient-to-br from-gray-100 to-gray-200 rounded-2xl flex items-center justify-center mx-auto mb-5 shadow-inner">
                  <CalendarIcon className="w-10 h-10 text-gray-400" />
                </div>
                <p className="text-gray-900 font-semibold mb-2">No meetings scheduled</p>
                <p className="text-sm text-gray-500">Click "Add Meeting" to create one</p>
              </div>
            ) : (
              <div className="space-y-3">
                {dayMeetings.map((m, i) => {
                  const type = getMeetingType(m);
                  const color = getMeetingColor(type);
                  const statusColor = STATUS_COLORS[m.status] || STATUS_COLORS['Scheduled'];
                  return (
                    <div
                      key={m.id || i}
                      onClick={() => openMeeting(m)}
                      className="group bg-white border border-gray-200 rounded-xl p-4 cursor-pointer hover:shadow-lg hover:border-blue-300 transition-all duration-200 hover:-translate-y-0.5"
                    >
                      <div className="flex items-start justify-between mb-3">
                        <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold uppercase ${color.light} ${color.text} border ${color.border}`}>
                          {getMeetingIcon(type)}
                          <span>{type}</span>
                        </div>
                        <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full border ${statusColor}`}>{m.status || 'Scheduled'}</span>
                      </div>
                      <h4 className="font-bold text-gray-900 mb-2 line-clamp-2 group-hover:text-blue-600 transition-colors">{getMeetingTitle(m)}</h4>
                      <div className="space-y-2 text-sm text-gray-600">
                        <div className="flex items-center gap-2">
                          <Clock className="w-4 h-4 text-gray-400" />
                          <span className="font-medium text-gray-900">{formatTime12(getMeetingTime(m))}</span>
                          {m.duration && <span className="text-gray-400">• {m.duration} min</span>}
                        </div>
                        {(m.location || m.venue) && (
                          <div className="flex items-center gap-2"><MapPin className="w-4 h-4 text-gray-400" /><span className="truncate">{m.location || m.venue}</span></div>
                        )}
                        {(m.meeting_link || m.link || m.meet_link) && (
                          <div className="flex items-center gap-2"><Video className="w-4 h-4 text-gray-400" /><span className="text-blue-600 font-medium">Join meeting</span></div>
                        )}
                      </div>
                      <div className="flex justify-end mt-3 opacity-0 group-hover:opacity-100 transition-opacity">
                        <ChevronRightIcon className="w-5 h-5 text-gray-400" />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="sticky bottom-0 bg-gray-50/80 backdrop-blur-md border-t border-gray-200 px-6 py-4">
            <button onClick={closeOffCanvas} className="w-full px-4 py-3 border border-gray-300 text-gray-700 font-semibold rounded-xl hover:bg-gray-100 transition-colors">
              Close
            </button>
          </div>
        </div>
      </>
    );
  };

  /* ─── Meeting Details Off-Canvas (view only — create/edit delegated to shared panel) ─── */
  const renderMeetingDetails = () => {
    if (!selectedMeeting) return null;

    const type = getMeetingType(selectedMeeting);
    const color = getMeetingColor(type);
    const statusColor = STATUS_COLORS[selectedMeeting.status] || STATUS_COLORS['Scheduled'];
    const dateStr = getMeetingDateStr(selectedMeeting);
    const attendees = getAttendeesArray(selectedMeeting.attendees);
    const meetLink = selectedMeeting.meeting_link || selectedMeeting.link || selectedMeeting.meet_link;

    return (
      <>
        <div className="fixed inset-0 z-40 bg-slate-950/35 backdrop-blur-sm" onClick={closeOffCanvas} />

        <div className="fixed right-0 top-0 bottom-0 z-50 w-full max-w-xl bg-white shadow-2xl flex flex-col">
          {/* Header */}
          <div className="shrink-0 px-5 sm:px-6 py-4 border-b border-slate-200 bg-white flex items-center justify-between">
            <div className="flex items-center gap-3 min-w-0">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${color.light} ${color.text}`}>
                {getMeetingIcon(type)}
              </div>
              <div className="min-w-0">
                <h2 className="text-lg font-bold text-slate-900 truncate">Meeting Details</h2>
                <p className="text-xs text-slate-500 mt-0.5 truncate">{getMeetingTitle(selectedMeeting)}</p>
              </div>
            </div>
            <button type="button" onClick={closeOffCanvas} className="w-9 h-9 rounded-lg flex items-center justify-center hover:bg-slate-100 text-slate-500" aria-label="Close">
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-6">
            {/* Actions */}
            <div className="flex gap-3">
              <button onClick={() => openEditMeeting(selectedMeeting)} className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors shadow-sm">
                <Edit3 className="w-4 h-4" /> Edit Meeting
              </button>
              <button onClick={handleDeleteMeeting} className="px-4 py-2.5 bg-red-50 hover:bg-red-100 text-red-600 font-medium rounded-lg transition-colors border border-red-200">
                <Trash2 className="w-5 h-5" />
              </button>
            </div>

            {/* Status + priority */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full border ${statusColor}`}>{selectedMeeting.status || 'Scheduled'}</span>
              {selectedMeeting.priority && (
                <span className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-slate-100 text-slate-600 border border-slate-200 capitalize">{selectedMeeting.priority} priority</span>
              )}
            </div>

            {/* Date & time */}
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center shrink-0"><CalendarIcon className="w-4 h-4 text-blue-600" /></div>
              <div className="flex-1">
                <p className="text-xs font-semibold text-gray-500 uppercase mb-0.5">Date & Time</p>
                <p className="text-sm font-medium text-gray-900">
                  {dateStr ? new Date(`${dateStr}T00:00:00`).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }) : 'N/A'}
                  {' at '}{formatTime12(getMeetingTime(selectedMeeting))}
                </p>
                {selectedMeeting.duration && <p className="text-xs text-gray-500 mt-0.5">Duration: {selectedMeeting.duration} minutes</p>}
              </div>
            </div>

            {/* Location */}
            {(selectedMeeting.location || selectedMeeting.venue || selectedMeeting.meeting_place) && (
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center shrink-0"><MapPin className="w-4 h-4 text-blue-600" /></div>
                <div className="flex-1">
                  <p className="text-xs font-semibold text-gray-500 uppercase mb-0.5">Location</p>
                  <p className="text-sm text-gray-900">{selectedMeeting.location || selectedMeeting.venue}</p>
                  {selectedMeeting.meeting_place && <p className="text-xs text-gray-500 mt-0.5">{selectedMeeting.meeting_place}</p>}
                </div>
              </div>
            )}

            {/* Officer (meetings created via the shared panel) */}
            {(selectedMeeting.officer_name || selectedMeeting.designation) && (
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center shrink-0"><User className="w-4 h-4 text-indigo-600" /></div>
                <div className="flex-1">
                  <p className="text-xs font-semibold text-gray-500 uppercase mb-0.5">Officer</p>
                  {selectedMeeting.officer_name && <p className="text-sm font-medium text-gray-900">{selectedMeeting.officer_name}</p>}
                  {selectedMeeting.designation && <p className="text-sm text-gray-700">{selectedMeeting.designation}</p>}
                  {selectedMeeting.officer_type && <span className="inline-block mt-1 px-2 py-0.5 bg-indigo-50 text-indigo-700 text-xs font-semibold rounded">{selectedMeeting.officer_type}</span>}
                  <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs text-gray-500">
                    {selectedMeeting.contact_number && <span className="inline-flex items-center gap-1"><Phone className="w-3 h-3" />{selectedMeeting.contact_number}</span>}
                    {selectedMeeting.email && <span className="inline-flex items-center gap-1 truncate"><Mail className="w-3 h-3" />{selectedMeeting.email}</span>}
                  </div>
                </div>
              </div>
            )}

            {/* Type */}
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg bg-gray-50 flex items-center justify-center shrink-0"><Briefcase className="w-4 h-4 text-gray-600" /></div>
              <div className="flex-1">
                <p className="text-xs font-semibold text-gray-500 uppercase mb-0.5">Type</p>
                <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold uppercase ${color.light} ${color.text} border ${color.border}`}>
                  {getMeetingIcon(type)}<span>{type}</span>
                </div>
              </div>
            </div>

            {/* Meet link */}
            {meetLink && (
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center shrink-0"><Video className="w-4 h-4 text-blue-600" /></div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-gray-500 uppercase mb-0.5">Meeting Link</p>
                  <a href={meetLink} target="_blank" rel="noreferrer" className="text-sm text-blue-600 font-medium hover:underline flex items-center gap-1.5 truncate">
                    <LinkIcon className="w-3.5 h-3.5 shrink-0" /> Join meeting
                  </a>
                </div>
              </div>
            )}

            {/* Attendees */}
            {attendees.length > 0 && (
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-gray-50 flex items-center justify-center shrink-0"><Users className="w-4 h-4 text-gray-600" /></div>
                <div className="flex-1">
                  <p className="text-xs font-semibold text-gray-500 uppercase mb-1.5">Attendees ({attendees.length})</p>
                  <div className="flex flex-wrap gap-1.5">
                    {attendees.map((a, i) => (
                      <span key={i} className="px-2 py-1 bg-slate-100 text-slate-700 rounded-lg text-xs font-medium">{a}</span>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Notes / description */}
            {(selectedMeeting.notes || selectedMeeting.description || selectedMeeting.agenda) && (
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-yellow-50 flex items-center justify-center shrink-0"><FileText className="w-4 h-4 text-yellow-600" /></div>
                <div className="flex-1">
                  <p className="text-xs font-semibold text-gray-500 uppercase mb-0.5">Notes</p>
                  <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">{selectedMeeting.notes || selectedMeeting.description || selectedMeeting.agenda}</p>
                </div>
              </div>
            )}

            {/* Metadata */}
            <div className="pt-4 border-t border-gray-200 grid grid-cols-2 gap-4 text-xs">
              <div>
                <p className="text-gray-500 mb-0.5">Created</p>
                <p className="font-medium text-gray-900">{selectedMeeting.created ? new Date(selectedMeeting.created).toLocaleDateString() : 'N/A'}</p>
              </div>
              <div>
                <p className="text-gray-500 mb-0.5">Last Updated</p>
                <p className="font-medium text-gray-900">{selectedMeeting.updated ? new Date(selectedMeeting.updated).toLocaleDateString() : 'N/A'}</p>
              </div>
            </div>
          </div>
        </div>
      </>
    );
  };

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center min-h-screen">
        <Loader2 className="w-10 h-10 text-blue-600 animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-5 max-w-[1500px] mx-auto space-y-3">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Calendar</h1>
          <p className="text-slate-500 mt-1">Plan, schedule and track all your meetings</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={loadData} className="p-2.5 bg-white border border-slate-200 rounded-xl text-slate-500 hover:text-blue-600 hover:border-blue-300 transition-colors" aria-label="Refresh">
            <RefreshCw className="w-5 h-5" />
          </button>
          {/* Same shared panel as the Meetings module */}
          <button onClick={openCreate} className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-xl transition-colors shadow-sm">
            <Plus className="w-5 h-5" /> New Meeting
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-3 p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
          <AlertCircle className="w-5 h-5 shrink-0" />
          <span className="flex-1">{error}</span>
          <button onClick={loadData} className="text-xs font-semibold text-red-700 hover:text-red-900 underline">Retry</button>
        </div>
      )}

      {/* Toolbar — Year now first, before Month */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button onClick={() => navigate('prev')} className="p-2 rounded-lg hover:bg-slate-100 text-slate-500" aria-label="Previous"><ChevronLeft className="w-4 h-4" /></button>
          <button onClick={goToToday} className="px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-100 border border-slate-200">Today</button>
          <button onClick={() => navigate('next')} className="p-2 rounded-lg hover:bg-slate-100 text-slate-500" aria-label="Next"><ChevronRight className="w-4 h-4" /></button>
          <h2 className="text-base font-bold text-slate-900 px-2">{getHeaderLabel()}</h2>
        </div>
        <div className="flex bg-slate-100 rounded-lg p-1">
          {(['year', 'month', 'day', 'agenda'] as ViewMode[]).map(v => (
            <button
              key={v}
              onClick={() => setViewMode(v)}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold capitalize transition-all ${viewMode === v ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              {v}
            </button>
          ))}
        </div>
      </div>

      {/* Views */}
      {viewMode === 'month' && renderMonthView()}
      {viewMode === 'day' && renderDayView()}
      {viewMode === 'agenda' && renderAgendaView()}
      {viewMode === 'year' && renderYearView()}

      {/* Off-canvas layers */}
      {offCanvasMode === 'day' && renderDayDetails()}
      {offCanvasMode === 'view' && renderMeetingDetails()}

      {/* ✅ Shared CreateMeetingPanel — identical to the Meetings module */}
      <CreateMeetingPanel
        isOpen={panelOpen}
        onClose={closePanel}
        onSuccess={handlePanelSuccess}
        meetingToEdit={editingMeeting}
        defaultDate={panelDate || undefined}
      />
    </div>
  );
}