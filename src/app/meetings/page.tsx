'use client';

import { useEffect, useState } from 'react';
import {
  Calendar, CalendarClock, CheckCircle2, RotateCcw, XCircle,
  Clock, MapPin, Search, Plus, Edit2, Trash2, X, ChevronRight, ChevronLeft,
  User, Briefcase, Tag, AlignLeft, FileText, Phone, Mail
} from 'lucide-react';
import pb from '@/lib/pocketbase';
import CreateMeetingPanel from '@/components/CreateMeetingPanel';

/* ----------------------------- Status Styling ----------------------------- */

const STATUS_STYLES: Record<string, { label: string; dot: string; badge: string }> = {
  scheduled:   { label: 'Scheduled',   dot: 'bg-blue-400',    badge: 'bg-blue-50 text-blue-700 ring-1 ring-inset ring-blue-600/20' },
  completed:   { label: 'Completed',   dot: 'bg-emerald-400', badge: 'bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-600/20' },
  rescheduled: { label: 'Rescheduled', dot: 'bg-amber-400',   badge: 'bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-600/20' },
  cancelled:   { label: 'Cancelled',   dot: 'bg-red-400',     badge: 'bg-red-50 text-red-700 ring-1 ring-inset ring-red-600/20' },
  rejected:    { label: 'Rejected',    dot: 'bg-rose-400',    badge: 'bg-rose-50 text-rose-700 ring-1 ring-inset ring-rose-600/20' },
};

const PER_PAGE_OPTIONS = [8, 12, 24, 48];

/* Generates page numbers with ellipsis, e.g. [1, '...', 4, 5, 6, '...', 12] */
function getPaginationRange(current: number, total: number): (number | 'dots')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  if (current <= 4) return [1, 2, 3, 4, 5, 'dots', total];
  if (current >= total - 3) return [1, 'dots', total - 4, total - 3, total - 2, total - 1, total];
  return [1, 'dots', current - 1, current, current + 1, 'dots', total];
}

export default function MeetingsPage() {
  const [meetings, setMeetings] = useState<any[]>([]);
  const [selectedMeeting, setSelectedMeeting] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const [editingMeeting, setEditingMeeting] = useState<any>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  /* Pagination state */
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(8);

  useEffect(() => { loadData(); }, []);

  /* Reset to first page whenever search, filter, or page size changes */
  useEffect(() => { setPage(1); }, [searchQuery, statusFilter, perPage]);

  /* Close panel / modal with Escape key */
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'Escape' || isPanelOpen) return;
      if (showDeleteConfirm) setShowDeleteConfirm(false);
      else setSelectedMeeting(null);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedMeeting, showDeleteConfirm, isPanelOpen]);

  async function loadData() {
    try {
      setLoading(true);
      const meetingsData = await pb.collection('meetings').getFullList({ sort: '-meeting_date' });
      setMeetings(meetingsData);
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  }

  const handleEdit = () => {
    if (!selectedMeeting) return;
    setEditingMeeting(selectedMeeting);
    setIsPanelOpen(true);
    setSelectedMeeting(null);
  };

  const confirmDelete = async () => {
    if (!selectedMeeting) return;
    try {
      await pb.collection('meetings').delete(selectedMeeting.id);
      setSelectedMeeting(null);
      setShowDeleteConfirm(false);
      loadData();
    } catch {
      alert('Failed to delete meeting');
    }
  };

  /* -------------------------------- Helpers -------------------------------- */

  const formatTimeDisplay = (timeString: string): string => {
    if (!timeString || !timeString.includes(':')) return '—';
    const [hours, minutes] = timeString.split(':');
    const hour = parseInt(hours);
    const modifier = hour >= 12 ? 'PM' : 'AM';
    return `${hour % 12 || 12}:${minutes} ${modifier}`;
  };

  const formatDate = (dateString: any) => {
    if (!dateString) return null;
    try {
      const date = new Date(dateString);
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

  const filteredMeetings = meetings.filter((meeting) => {
    const title = getMeetingTitle(meeting).toLowerCase();
    const matchesSearch =
      searchQuery === '' ||
      title.includes(searchQuery.toLowerCase()) ||
      (meeting.location || '').toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === 'all' || getStatusKey(meeting) === statusFilter;
    return matchesSearch && matchesStatus;
  });

  /* ------------------------------- Pagination ------------------------------ */

  const totalPages = Math.max(1, Math.ceil(filteredMeetings.length / perPage));
  const currentPage = Math.min(page, totalPages); // clamp when list shrinks
  const startIndex = (currentPage - 1) * perPage;
  const endIndex = Math.min(startIndex + perPage, filteredMeetings.length);
  const paginatedMeetings = filteredMeetings.slice(startIndex, endIndex);
  const paginationRange = getPaginationRange(currentPage, totalPages);

  /* ------------------------------ Skeleton View ----------------------------- */

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50/70 p-6 lg:p-10">
        <div className="max-w-7xl mx-auto space-y-6 animate-pulse">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-gray-200 rounded-2xl" />
              <div className="space-y-2">
                <div className="h-7 w-40 bg-gray-200 rounded-lg" />
                <div className="h-4 w-56 bg-gray-100 rounded" />
              </div>
            </div>
            <div className="h-11 w-36 bg-gray-200 rounded-xl" />
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-[118px] bg-gray-100 rounded-2xl border border-gray-200" />
            ))}
          </div>
          <div className="h-[70px] bg-gray-100 rounded-2xl" />
          <div className="bg-white rounded-2xl border border-gray-200 divide-y divide-gray-100">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="flex items-center gap-4 p-5">
                <div className="w-12 h-14 bg-gray-100 rounded-xl" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 w-2/3 bg-gray-100 rounded" />
                  <div className="h-3 w-1/3 bg-gray-50 rounded" />
                </div>
                <div className="h-6 w-24 bg-gray-100 rounded-full" />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  /* -------------------------------- Main View ------------------------------- */

  return (
    <div className="min-h-screen bg-slate-50/70 p-6 lg:p-10">
      <div className="max-w-7xl mx-auto space-y-6">

        {/* ------------------------------ Page Header ----------------------------- */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center shadow-lg shadow-blue-600/25">
              <CalendarClock className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl lg:text-3xl font-bold tracking-tight text-slate-900">Meetings</h1>
              <p className="text-sm text-gray-500 mt-0.5">Manage and track all your meetings</p>
            </div>
          </div>
          <button
            onClick={() => { setEditingMeeting(null); setIsPanelOpen(true); }}
            className="inline-flex items-center justify-center gap-2 px-5 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-semibold rounded-xl shadow-lg shadow-blue-600/25 hover:shadow-blue-600/40 transition-all hover:-translate-y-px"
          >
            <Plus className="w-5 h-5" />
            New Meeting
          </button>
        </div>

        {/* ------------------------------ Status Stats ---------------------------- */}
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4">
          {[
            { key: 'all', label: 'Total', caption: 'All meetings', icon: CalendarClock, colors: 'bg-indigo-50 text-indigo-600', ring: 'ring-indigo-500/40' },
            { key: 'scheduled', label: 'Scheduled', caption: 'Upcoming', icon: Calendar, colors: 'bg-blue-50 text-blue-600', ring: 'ring-blue-500/40' },
            { key: 'completed', label: 'Completed', caption: 'Finished', icon: CheckCircle2, colors: 'bg-emerald-50 text-emerald-600', ring: 'ring-emerald-500/40' },
            { key: 'rescheduled', label: 'Rescheduled', caption: 'Moved dates', icon: RotateCcw, colors: 'bg-amber-50 text-amber-600', ring: 'ring-amber-500/40' },
            { key: 'cancelled', label: 'Cancelled', caption: 'Called off', icon: XCircle, colors: 'bg-red-50 text-red-600', ring: 'ring-red-500/40' },
          ].map((stat) => {
            const Icon = stat.icon;
            const count = stat.key === 'all' ? meetings.length : statusCount(stat.key);
            const active = statusFilter === stat.key;
            return (
              <button
                key={stat.key}
                onClick={() => setStatusFilter(stat.key)}
                className={`text-left bg-white rounded-2xl border p-4 lg:p-5 transition-all hover:shadow-md hover:-translate-y-0.5 ${
                  active ? `ring-2 ${stat.ring} border-transparent shadow-md` : 'border-gray-200 shadow-sm hover:border-gray-300'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${stat.colors}`}>
                    <Icon className="w-5 h-5" />
                  </div>
                  <span className="text-2xl font-bold text-slate-900 tabular-nums">{count}</span>
                </div>
                <p className="mt-3 text-sm font-semibold text-gray-800">{stat.label}</p>
                <p className="text-xs text-gray-400 mt-0.5">{stat.caption}</p>
              </button>
            );
          })}
        </div>

        {/* ------------------------------- Search Bar ----------------------------- */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4 lg:p-5">
          <div className="relative lg:max-w-md">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search by agenda, location..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-10 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:bg-white focus:ring-2 focus:ring-blue-500/60 focus:border-blue-500 transition-all"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* --------------------------------- Table -------------------------------- */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">

          {/* Table header */}
          <div className="px-6 py-4 flex items-center justify-between border-b border-gray-100">
            <div className="flex items-center gap-2.5">
              <h3 className="text-sm font-bold text-gray-800">All Meetings</h3>
              <span className="px-2 py-0.5 bg-gray-100 rounded-full text-[11px] font-bold text-gray-500 tabular-nums">
                {filteredMeetings.length}
              </span>
            </div>
            {(searchQuery || statusFilter !== 'all') && (
              <button
                onClick={() => { setSearchQuery(''); setStatusFilter('all'); }}
                className="text-xs font-semibold text-blue-600 hover:text-blue-700 transition-colors"
              >
                Clear filters
              </button>
            )}
          </div>

          {/* Column headers */}
          <div className="hidden md:grid grid-cols-12 gap-4 px-6 py-3.5 bg-slate-50/80 border-b border-gray-200 text-[11px] font-bold text-gray-500 uppercase tracking-wider">
            <div className="col-span-1 text-center">Date</div>
            <div className="col-span-4">Agenda</div>
            <div className="col-span-2 text-center">Time</div>
            <div className="col-span-2">Location</div>
            <div className="col-span-1 text-center">Type</div>
            <div className="col-span-1 text-center">Status</div>
            <div className="col-span-1" />
          </div>

          <div className="divide-y divide-gray-100">
            {paginatedMeetings.length === 0 ? (
              /* Empty state */
              <div className="py-20 flex flex-col items-center justify-center text-center">
                <div className="w-16 h-16 rounded-2xl bg-gray-50 border border-gray-100 flex items-center justify-center">
                  <CalendarClock className="w-8 h-8 text-gray-300" />
                </div>
                <h3 className="mt-4 text-base font-semibold text-gray-800">No meetings found</h3>
                <p className="mt-1 text-sm text-gray-500">Try adjusting your search or filters, or create a new meeting.</p>
                <button
                  onClick={() => { setEditingMeeting(null); setIsPanelOpen(true); }}
                  className="mt-5 inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors"
                >
                  <Plus className="w-4 h-4" /> New Meeting
                </button>
              </div>
            ) : (
              paginatedMeetings.map((meeting) => {
                const dateInfo = formatDate(meeting.meeting_date || meeting.created);
                const time = meeting.meeting_time || '';
                const style = getStatusStyle(getStatusKey(meeting));
                const title = getMeetingTitle(meeting);

                return (
                  <div key={meeting.id} onClick={() => setSelectedMeeting(meeting)}>
                    {/* Desktop row */}
                    <div className="hidden md:grid grid-cols-12 gap-4 px-6 py-4 items-center cursor-pointer transition-colors group hover:bg-blue-50/40">
                      <div className="col-span-1 flex justify-center">
                        <div className="flex flex-col items-center justify-center w-12 h-14 rounded-xl border border-gray-200 bg-slate-50 group-hover:border-blue-300 group-hover:bg-blue-50 transition-colors">
                          <span className="text-lg font-bold text-slate-900 leading-none tabular-nums">{dateInfo?.day}</span>
                          <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mt-1">{dateInfo?.month}</span>
                        </div>
                      </div>

                      <div className="col-span-4 min-w-0">
                        <h3 className="font-semibold text-gray-900 truncate group-hover:text-blue-700 transition-colors">{title}</h3>
                        {meeting.officer_name && (
                          <p className="flex items-center gap-1.5 text-xs text-gray-500 mt-1">
                            <User className="w-3 h-3 text-gray-400" />
                            <span className="truncate">with {meeting.officer_name}</span>
                          </p>
                        )}
                      </div>

                      <div className="col-span-2 text-center">
                        <div className="flex items-center justify-center gap-1.5 text-sm font-medium text-gray-700">
                          <Clock className="w-3.5 h-3.5 text-gray-400" />
                          {formatTimeDisplay(time)}
                        </div>
                        {meeting.duration && <p className="text-[11px] text-gray-400 mt-0.5">{meeting.duration} min</p>}
                      </div>

                      <div className="col-span-2 min-w-0 flex items-center gap-1.5">
                        <MapPin className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                        <span className="text-sm text-gray-600 truncate">{meeting.location || '—'}</span>
                      </div>

                      <div className="col-span-1 text-center">
                        {meeting.meeting_type ? (
                          <span className="inline-flex px-2.5 py-1 rounded-lg bg-gray-100 text-gray-600 text-[11px] font-semibold capitalize">
                            {meeting.meeting_type}
                          </span>
                        ) : (
                          <span className="text-sm text-gray-300">—</span>
                        )}
                      </div>

                      <div className="col-span-1 flex justify-center">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold ${style.badge}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${style.dot}`} />
                          {style.label}
                        </span>
                      </div>

                      <div className="col-span-1 flex justify-center">
                        <div className="w-8 h-8 rounded-full flex items-center justify-center text-gray-300 group-hover:text-blue-600 group-hover:bg-blue-100 transition-all">
                          <ChevronRight className="w-4 h-4" />
                        </div>
                      </div>
                    </div>

                    {/* Mobile card */}
                    <div className="md:hidden p-4 cursor-pointer hover:bg-blue-50/40 transition-colors">
                      <div className="flex items-start gap-3">
                        <div className="flex flex-col items-center justify-center w-12 h-14 rounded-xl border border-gray-200 bg-slate-50 flex-shrink-0">
                          <span className="text-lg font-bold text-slate-900 leading-none">{dateInfo?.day}</span>
                          <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mt-1">{dateInfo?.month}</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2">
                            <h3 className="font-semibold text-gray-900 text-sm leading-snug line-clamp-2">{title}</h3>
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold flex-shrink-0 ${style.badge}`}>
                              <span className={`w-1 h-1 rounded-full ${style.dot}`} />
                              {style.label}
                            </span>
                          </div>
                          {meeting.officer_name && <p className="text-xs text-gray-500 mt-1 truncate">with {meeting.officer_name}</p>}
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 text-[11px] text-gray-500">
                            <span className="flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              {formatTimeDisplay(time)}{meeting.duration ? ` · ${meeting.duration}m` : ''}
                            </span>
                            {meeting.location && (
                              <span className="flex items-center gap-1 truncate">
                                <MapPin className="w-3 h-3" />
                                <span className="truncate">{meeting.location}</span>
                              </span>
                            )}
                            {meeting.meeting_type && (
                              <span className="px-1.5 py-0.5 bg-gray-100 rounded capitalize font-medium">{meeting.meeting_type}</span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* ------------------------------- Pagination ---------------------------- */}
          {filteredMeetings.length > 0 && (
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-6 py-4 border-t border-gray-100 bg-slate-50/50">
              {/* Results info + rows per page */}
              <div className="flex items-center gap-3 text-xs text-gray-500">
                <p>
                  Showing <span className="font-bold text-gray-700">{startIndex + 1}–{endIndex}</span> of{' '}
                  <span className="font-bold text-gray-700">{filteredMeetings.length}</span> meetings
                </p>
                <div className="flex items-center gap-2">
                  <span className="hidden sm:inline text-gray-300">|</span>
                  <label className="hidden sm:inline text-gray-400">Per page</label>
                  <select
                    value={perPage}
                    onChange={(e) => setPerPage(Number(e.target.value))}
                    className="px-2 py-1.5 bg-white border border-gray-200 rounded-lg text-xs font-semibold text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500/60 cursor-pointer"
                  >
                    {PER_PAGE_OPTIONS.map((opt) => (
                      <option key={opt} value={opt}>{opt}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Page controls */}
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPage(currentPage - 1)}
                  disabled={currentPage === 1}
                  className="inline-flex items-center gap-1 px-3 py-2 text-xs font-semibold rounded-lg bg-white border border-gray-200 text-gray-600 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-white transition-colors"
                >
                  <ChevronLeft className="w-4 h-4" />
                  <span className="hidden sm:inline">Prev</span>
                </button>

                {paginationRange.map((item, i) =>
                  item === 'dots' ? (
                    <span key={`dots-${i}`} className="px-2 py-2 text-xs text-gray-400 select-none">…</span>
                  ) : (
                    <button
                      key={item}
                      onClick={() => setPage(item)}
                      className={`w-8 h-8 text-xs font-bold rounded-lg tabular-nums transition-all ${
                        item === currentPage
                          ? 'bg-slate-900 text-white shadow-md'
                          : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-100'
                      }`}
                    >
                      {item}
                    </button>
                  )
                )}

                <button
                  onClick={() => setPage(currentPage + 1)}
                  disabled={currentPage === totalPages}
                  className="inline-flex items-center gap-1 px-3 py-2 text-xs font-semibold rounded-lg bg-white border border-gray-200 text-gray-600 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-white transition-colors"
                >
                  <span className="hidden sm:inline">Next</span>
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>

        {/* ---------------------- Off-Canvas Details Panel ------------------------ */}
        {selectedMeeting && (() => {
          const dateInfo = formatDate(selectedMeeting.meeting_date || selectedMeeting.created);
          const time = selectedMeeting.meeting_time || '';
          const style = getStatusStyle(getStatusKey(selectedMeeting));
          const title = getMeetingTitle(selectedMeeting);
          const officerInitials = selectedMeeting.officer_name
            ? selectedMeeting.officer_name.split(' ').map((w: string) => w[0]).slice(0, 2).join('').toUpperCase()
            : '';
          const priorityColor =
            { high: 'text-red-600', medium: 'text-amber-600', low: 'text-emerald-600' }[String(selectedMeeting.priority || '').toLowerCase()] || 'text-gray-900';

          return (
            <>
              {/* Overlay */}
              <div
                className="fixed inset-0 z-40 bg-slate-900/50 backdrop-blur-[2px] animate-in fade-in duration-300"
                onClick={() => setSelectedMeeting(null)}
              />

              {/* Panel */}
              <div className="fixed inset-y-0 right-0 w-full max-w-md bg-white shadow-2xl z-50 flex flex-col animate-in slide-in-from-right duration-300">

                {/* Gradient header */}
                <div className="relative bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-900 px-6 pt-6 pb-5 overflow-hidden flex-shrink-0">
                  <div className="absolute -top-20 -right-20 w-56 h-56 bg-blue-500/20 rounded-full blur-3xl" />
                  <div className="absolute -bottom-24 -left-16 w-48 h-48 bg-indigo-400/10 rounded-full blur-3xl" />

                  <div className="relative">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-white/10 text-white ring-1 ring-inset ring-white/20">
                          <span className={`w-1.5 h-1.5 rounded-full ${style.dot}`} />
                          {style.label}
                        </span>
                        {selectedMeeting.meeting_type && (
                          <span className="inline-flex px-2.5 py-1 rounded-full text-[11px] font-semibold bg-white/10 text-white/70 ring-1 ring-inset ring-white/15 capitalize">
                            {selectedMeeting.meeting_type}
                          </span>
                        )}
                      </div>
                      <button
                        onClick={() => setSelectedMeeting(null)}
                        className="p-2 -mr-2 -mt-1 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
                      >
                        <X className="w-5 h-5" />
                      </button>
                    </div>

                    <h2 className="text-xl font-bold text-white leading-snug mt-3 line-clamp-3">{title}</h2>

                    <div className="flex items-center flex-wrap gap-x-4 gap-y-1.5 mt-3 text-sm text-slate-300">
                      <span className="flex items-center gap-1.5">
                        <Calendar className="w-4 h-4 text-slate-400" />
                        {dateInfo ? `${dateInfo.weekday}, ${dateInfo.full}` : '—'}
                      </span>
                      <span className="flex items-center gap-1.5">
                        <Clock className="w-4 h-4 text-slate-400" />
                        {formatTimeDisplay(time)}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Scrollable body */}
                <div className="flex-1 overflow-y-auto min-h-0 p-5 space-y-4 bg-slate-50/70">

                  {/* Quick info tiles */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-white rounded-xl border border-gray-200 p-4">
                      <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-gray-400">
                        <Calendar className="w-3.5 h-3.5 text-blue-500" /> Date
                      </p>
                      <p className="mt-1.5 text-sm font-semibold text-gray-900">{dateInfo?.full || '—'}</p>
                    </div>
                    <div className="bg-white rounded-xl border border-gray-200 p-4">
                      <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-gray-400">
                        <Clock className="w-3.5 h-3.5 text-blue-500" /> Time
                      </p>
                      <p className="mt-1.5 text-sm font-semibold text-gray-900">{formatTimeDisplay(time)}</p>
                      {selectedMeeting.duration && <p className="text-xs text-gray-400 mt-0.5">{selectedMeeting.duration} min</p>}
                    </div>
                    <div className="bg-white rounded-xl border border-gray-200 p-4">
                      <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-gray-400">
                        <MapPin className="w-3.5 h-3.5 text-blue-500" /> Location
                      </p>
                      <p className="mt-1.5 text-sm font-semibold text-gray-900 truncate">
                        {selectedMeeting.location || selectedMeeting.meeting_place || 'Not specified'}
                      </p>
                    </div>
                    {selectedMeeting.meeting_type && (
                      <div className="bg-white rounded-xl border border-gray-200 p-4">
                        <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-gray-400">
                          <Briefcase className="w-3.5 h-3.5 text-blue-500" /> Type
                        </p>
                        <p className="mt-1.5 text-sm font-semibold text-gray-900 capitalize">{selectedMeeting.meeting_type}</p>
                      </div>
                    )}
                    {selectedMeeting.priority && (
                      <div className="bg-white rounded-xl border border-gray-200 p-4">
                        <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-gray-400">
                          <Tag className="w-3.5 h-3.5 text-blue-500" /> Priority
                        </p>
                        <p className={`mt-1.5 text-sm font-semibold capitalize ${priorityColor}`}>{selectedMeeting.priority}</p>
                      </div>
                    )}
                  </div>

                  {/* Officer card */}
                  {(selectedMeeting.officer_name || selectedMeeting.designation || selectedMeeting.officer_type) && (
                    <div className="bg-white rounded-xl border border-gray-200 p-4">
                      <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-gray-400 mb-3">
                        <User className="w-3.5 h-3.5 text-indigo-500" /> Officer
                      </p>
                      <div className="flex items-center gap-3">
                        {officerInitials && (
                          <div className="w-11 h-11 rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center text-white text-sm font-bold flex-shrink-0">
                            {officerInitials}
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          {selectedMeeting.officer_name && (
                            <p className="text-sm font-semibold text-gray-900 truncate">{selectedMeeting.officer_name}</p>
                          )}
                          {selectedMeeting.designation && (
                            <p className="text-xs text-gray-500 truncate">{selectedMeeting.designation}</p>
                          )}
                        </div>
                        {selectedMeeting.officer_type && (
                          <span className="px-2 py-0.5 bg-indigo-50 text-indigo-700 text-[11px] font-bold rounded-md flex-shrink-0">
                            {selectedMeeting.officer_type}
                          </span>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Description */}
                  {selectedMeeting.description && (
                    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                      <div className="flex items-center gap-2 px-4 py-3 bg-slate-50/80 border-b border-gray-100">
                        <AlignLeft className="w-4 h-4 text-gray-400" />
                        <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider">Description</h4>
                      </div>
                      <p className="px-4 py-3.5 text-sm text-gray-600 leading-relaxed whitespace-pre-wrap">
                        {selectedMeeting.description}
                      </p>
                    </div>
                  )}

                  {/* Notes */}
                  {selectedMeeting.notes && (
                    <div className="bg-amber-50/60 rounded-xl border border-amber-200/70 overflow-hidden">
                      <div className="flex items-center gap-2 px-4 py-3 border-b border-amber-200/70">
                        <FileText className="w-4 h-4 text-amber-500" />
                        <h4 className="text-xs font-bold text-amber-800/80 uppercase tracking-wider">Additional Notes</h4>
                      </div>
                      <p className="px-4 py-3.5 text-sm text-amber-900/80 leading-relaxed whitespace-pre-wrap">
                        {selectedMeeting.notes}
                      </p>
                    </div>
                  )}

                  {/* Contact info */}
                  {(selectedMeeting.contact_number || selectedMeeting.email) && (
                    <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
                      {selectedMeeting.contact_number && (
                        <a href={`tel:${selectedMeeting.contact_number}`} className="flex items-center gap-3 group">
                          <div className="w-9 h-9 rounded-lg bg-emerald-50 flex items-center justify-center flex-shrink-0">
                            <Phone className="w-4 h-4 text-emerald-600" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-[11px] font-bold uppercase tracking-wider text-gray-400">Phone</p>
                            <p className="text-sm font-semibold text-gray-800 group-hover:text-emerald-600 transition-colors truncate">
                              {selectedMeeting.contact_number}
                            </p>
                          </div>
                        </a>
                      )}
                      {selectedMeeting.email && (
                        <a href={`mailto:${selectedMeeting.email}`} className="flex items-center gap-3 group">
                          <div className="w-9 h-9 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0">
                            <Mail className="w-4 h-4 text-blue-600" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-[11px] font-bold uppercase tracking-wider text-gray-400">Email</p>
                            <p className="text-sm font-semibold text-gray-800 group-hover:text-blue-600 transition-colors truncate">
                              {selectedMeeting.email}
                            </p>
                          </div>
                        </a>
                      )}
                    </div>
                  )}

                  {/* Metadata */}
                  <div className="flex items-center justify-between text-[11px] text-gray-400 px-1 pt-1">
                    <span>
                      Created {new Date(selectedMeeting.created).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </span>
                    <span>
                      Updated{' '}
                      {selectedMeeting.updated
                        ? new Date(selectedMeeting.updated).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' })
                        : '—'}
                    </span>
                  </div>
                </div>

                {/* Sticky action footer */}
                <div className="flex items-center gap-3 p-5 border-t border-gray-200 bg-white/95 backdrop-blur flex-shrink-0">
                  <button
                    onClick={handleEdit}
                    className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-3 bg-slate-900 hover:bg-slate-800 text-white font-semibold rounded-xl transition-colors shadow-md"
                  >
                    <Edit2 className="w-4 h-4" /> Edit Meeting
                  </button>
                  <button
                    onClick={() => setShowDeleteConfirm(true)}
                    title="Delete meeting"
                    className="px-4 py-3 bg-white border border-red-200 text-red-600 hover:bg-red-50 hover:border-red-300 rounded-xl transition-colors shadow-sm"
                  >
                    <Trash2 className="w-5 h-5" />
                  </button>
                </div>
              </div>
            </>
          );
        })()}

        {/* -------------------------- Delete Confirmation ------------------------- */}
        {showDeleteConfirm && selectedMeeting && (
          <>
            <div
              className="fixed inset-0 z-[60] bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200"
              onClick={() => setShowDeleteConfirm(false)}
            />
            <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
              <div className="w-full max-w-sm bg-white rounded-2xl shadow-2xl border border-gray-100 p-6 animate-in zoom-in-95 fade-in duration-200">
                <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center mx-auto">
                  <Trash2 className="w-6 h-6 text-red-600" />
                </div>
                <h3 className="mt-4 text-lg font-bold text-gray-900 text-center">Delete this meeting?</h3>
                <p className="mt-1.5 text-sm text-gray-500 text-center leading-relaxed">
                  <span className="font-semibold text-gray-700">"{getMeetingTitle(selectedMeeting)}"</span> will be permanently
                  removed. This action cannot be undone.
                </p>
                <div className="mt-6 flex gap-3">
                  <button
                    onClick={() => setShowDeleteConfirm(false)}
                    className="flex-1 px-4 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold rounded-xl transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={confirmDelete}
                    className="flex-1 px-4 py-2.5 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-xl transition-colors shadow-md shadow-red-600/20"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          </>
        )}

        {/* ---------------------------- Create/Edit Panel ------------------------- */}
        <CreateMeetingPanel
          isOpen={isPanelOpen}
          onClose={() => { setIsPanelOpen(false); setEditingMeeting(null); }}
          onSuccess={() => { loadData(); setIsPanelOpen(false); setEditingMeeting(null); }}
          meetingToEdit={editingMeeting}
        />
      </div>
    </div>
  );
} 