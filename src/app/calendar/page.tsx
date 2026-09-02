'use client';

import React, { useEffect, useState } from 'react';
import {
  Calendar as CalendarIcon, Clock, MapPin, Filter, Plus,
  ChevronLeft, ChevronRight, X, Edit3, Trash2, Save,
  FileText, Search, Check, Briefcase, Users, Target,
  Lightbulb, TrendingUp, GraduationCap, Presentation,
  ClipboardList, FolderKanban, RefreshCw, AlertCircle
} from 'lucide-react';
import pb from '@/lib/pocketbase';

type ViewMode = 'year' | 'month' | 'week';
type OffCanvasMode = 'create' | 'view' | 'edit' | null;

// Professional icon mapping for meeting types
const MEETING_TYPE_ICONS: Record<string, React.ReactNode> = {
  'review': <Briefcase className="w-3 h-3" />,
  'training': <GraduationCap className="w-3 h-3" />,
  'brainstorming': <Lightbulb className="w-3 h-3" />,
  'strategy': <TrendingUp className="w-3 h-3" />,
  'client': <Users className="w-3 h-3" />,
  'workshop': <Presentation className="w-3 h-3" />,
  'planning': <ClipboardList className="w-3 h-3" />,
  'general': <FolderKanban className="w-3 h-3" />,
};

const MEETING_TYPE_COLORS: Record<string, string> = {
  'review': 'bg-emerald-50 border-emerald-400 text-emerald-900',
  'training': 'bg-purple-50 border-purple-400 text-purple-900',
  'brainstorming': 'bg-blue-50 border-blue-400 text-blue-900',
  'strategy': 'bg-indigo-50 border-indigo-400 text-indigo-900',
  'client': 'bg-cyan-50 border-cyan-400 text-cyan-900',
  'workshop': 'bg-amber-50 border-amber-400 text-amber-900',
  'planning': 'bg-pink-50 border-pink-400 text-pink-900',
  'general': 'bg-slate-50 border-slate-400 text-slate-900',
};

export default function CalendarPage() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [viewMode, setViewMode] = useState<ViewMode>('week');
  const [meetings, setMeetings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedMeeting, setSelectedMeeting] = useState<any>(null);
  const [offCanvasMode, setOffCanvasMode] = useState<OffCanvasMode>(null);
  const [formData, setFormData] = useState({
    title: '', topic: '', date: '', time: '', duration: '60',
    location: '', description: '', status: 'Scheduled', type: 'general'
  });
  const [saving, setSaving] = useState(false);
  const [showFilter, setShowFilter] = useState(false);
  const [filterType, setFilterType] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      setLoading(true);
      setError('');
      console.log('🔄 Fetching meetings from PocketBase...');

      const data = await pb.collection('meetings').getFullList({
        sort: '-created',
        $autoCancel: false
      });

      console.log('✅ Meetings loaded:', data.length);
      console.log('Sample meeting:', data[0]);
      setMeetings(data);
    } catch (err: any) {
      console.error('❌ Error loading meetings:', err);
      setError(err.message || 'Failed to load meetings');
    } finally {
      setLoading(false);
    }
  }

  // ─── Date helpers ───
  const getMeetingTitle = (m: any) => m.title || m.topic || m.agenda || 'Meeting';
  const getMeetingTime = (m: any) => m.time || m.meeting_time || '09:00';
  const getMeetingType = (m: any) => m.type || 'general';

  // Fix: Parse date properly handling timezone
  const getMeetingDateStr = (m: any): string => {
    const raw = m.date || m.meeting_date || m.created || '';
    if (!raw) return '';
    
    // If it's already a date string like "2025-08-14"
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
    
    // If it has time part, parse and return local date
    try {
      const d = new Date(raw);
      if (isNaN(d.getTime())) return raw.split('T')[0];
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    } catch {
      return raw.split('T')[0];
    }
  };

  const formatDateForInput = (d: Date) => {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  const hourToTime = (hour: number) => `${String(hour).padStart(2, '0')}:00`;

  const getMeetingColor = (type: string) => {
    return MEETING_TYPE_COLORS[type?.toLowerCase()] || MEETING_TYPE_COLORS['general'];
  };

  const getMeetingIcon = (type: string) => {
    return MEETING_TYPE_ICONS[type?.toLowerCase()] || MEETING_TYPE_ICONS['general'];
  };

  const filteredMeetings = meetings.filter(m => {
    if (filterType !== 'all' && getMeetingType(m) !== filterType) return false;
    if (filterStatus !== 'all' && m.status !== filterStatus) return false;
    return true;
  });

  const navigate = (dir: 'prev' | 'next') => {
    const d = new Date(currentDate);
    if (viewMode === 'year') d.setFullYear(d.getFullYear() + (dir === 'next' ? 1 : -1));
    else if (viewMode === 'month') d.setMonth(d.getMonth() + (dir === 'next' ? 1 : -1));
    else d.setDate(d.getDate() + (dir === 'next' ? 7 : -7));
    setCurrentDate(d);
  };

  const goToToday = () => setCurrentDate(new Date());

  const getWeekStart = (d: Date) => {
    const start = new Date(d);
    const day = start.getDay();
    start.setDate(start.getDate() - day + (day === 0 ? -6 : 1));
    start.setHours(0, 0, 0, 0);
    return start;
  };

  const getHeaderLabel = () => {
    if (viewMode === 'year') return currentDate.getFullYear().toString();
    if (viewMode === 'month') return currentDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    const start = getWeekStart(currentDate);
    const end = new Date(start); end.setDate(start.getDate() + 6);
    const s = start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const e = end.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    return `${s} - ${e}`;
  };

  const openCreateForSlot = (date: Date, hour?: number) => {
    setSelectedMeeting(null);
    setFormData({
      title: '', topic: '',
      date: formatDateForInput(date),
      time: hour !== undefined ? hourToTime(hour) : '09:00',
      duration: '60', location: '', description: '',
      status: 'Scheduled', type: 'general'
    });
    setOffCanvasMode('create');
  };

  // ─── Year View ───
  const renderYearView = () => {
    const year = currentDate.getFullYear();
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

    return (
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden p-6">
        <h3 className="text-2xl font-bold text-gray-900 mb-6">{year}</h3>
        <div className="grid grid-cols-4 gap-4">
          {monthNames.map((month, idx) => {
            const monthMeetings = filteredMeetings.filter(m => {
              const md = getMeetingDateStr(m);
              return md.startsWith(`${year}-${String(idx + 1).padStart(2, '0')}`);
            });

            return (
              <div
                key={month}
                onClick={() => { setCurrentDate(new Date(year, idx, 1)); setViewMode('month'); }}
                className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-all cursor-pointer hover:border-blue-300"
              >
                <h4 className="font-semibold text-gray-900 mb-2">{month}</h4>
                <p className="text-xs text-gray-500 mb-2">{monthMeetings.length} meeting{monthMeetings.length !== 1 ? 's' : ''}</p>
                {monthMeetings.length > 0 && (
                  <div className="space-y-1">
                    {monthMeetings.slice(0, 2).map((m, i) => (
                      <div key={i} className={`text-[10px] px-2 py-1 rounded border-l-2 truncate flex items-center gap-1 ${getMeetingColor(getMeetingType(m))}`}>
                        {getMeetingIcon(getMeetingType(m))}
                        <span className="truncate">{getMeetingTitle(m)}</span>
                      </div>
                    ))}
                    {monthMeetings.length > 2 && (
                      <p className="text-[10px] text-gray-500">+{monthMeetings.length - 2} more</p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  // ── Month View ───
  const renderMonthView = () => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const firstDay = new Date(year, month, 1).getDay();
    const adjustedFirst = firstDay === 0 ? 6 : firstDay - 1;
    const days: (number | null)[] = [];
    for (let i = 0; i < adjustedFirst; i++) days.push(null);
    for (let i = 1; i <= daysInMonth; i++) days.push(i);
    const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

    return (
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="grid grid-cols-7 border-b border-gray-200">
          {dayNames.map(d => (
            <div key={d} className="p-3 text-center text-xs font-semibold text-gray-500 uppercase bg-gray-50">{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {days.map((day, idx) => {
            if (!day) return <div key={idx} className="min-h-[120px] border-b border-r border-gray-100 bg-gray-50/30" />;
            const cellDate = new Date(year, month, day);
            const dateStr = formatDateForInput(cellDate);
            const dayMeetings = filteredMeetings.filter(m => getMeetingDateStr(m) === dateStr);
            const isToday = new Date().toDateString() === cellDate.toDateString();
            return (
              <div
                key={idx}
                onClick={() => openCreateForSlot(cellDate)}
                className={`min-h-[120px] border-b border-r border-gray-100 p-2 hover:bg-blue-50/30 transition-colors cursor-pointer ${isToday ? 'bg-blue-50/50' : ''}`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className={`text-xs font-semibold w-7 h-7 flex items-center justify-center rounded-full ${isToday ? 'bg-blue-600 text-white' : 'text-gray-700'}`}>{day}</span>
                  {dayMeetings.length > 0 && <span className="text-[10px] font-bold text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded-full">{dayMeetings.length}</span>}
                </div>
                <div className="space-y-1">
                  {dayMeetings.slice(0, 3).map((m, i) => (
                    <div
                      key={i}
                      onClick={(e) => { e.stopPropagation(); openMeeting(m); }}
                      className={`text-[10px] px-2 py-1 rounded border-l-2 cursor-pointer truncate font-medium hover:opacity-80 transition-opacity flex items-center gap-1 ${getMeetingColor(getMeetingType(m))}`}
                      title={getMeetingTitle(m)}
                    >
                      {getMeetingIcon(getMeetingType(m))}
                      <span className="truncate">{getMeetingTitle(m)}</span>
                    </div>
                  ))}
                  {dayMeetings.length > 3 && <div className="text-[10px] text-gray-500 font-medium px-2">+{dayMeetings.length - 3} more</div>}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  // ─── Week View ───
  const renderWeekView = () => {
    const weekStart = getWeekStart(currentDate);
    const weekDates = Array.from({ length: 7 }, (_, i) => { const d = new Date(weekStart); d.setDate(weekStart.getDate() + i); return d; });
    const timeSlots = ['9 AM', '10 AM', '11 AM', '12 PM', '1 PM', '2 PM', '3 PM', '4 PM', '5 PM'];
    const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

    return (
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="grid grid-cols-8 border-b border-gray-200">
          <div className="p-3 border-r border-gray-200 bg-gray-50"></div>
          {weekDates.map((d, i) => {
            const isToday = d.toDateString() === new Date().toDateString();
            return (
              <div key={i} className="p-3 text-center border-r border-gray-200 last:border-r-0 bg-gray-50">
                <p className="text-xs font-semibold text-gray-500 uppercase">{dayNames[i]}</p>
                <div className={`mt-1 w-8 h-8 mx-auto flex items-center justify-center rounded-full text-sm font-bold ${isToday ? 'bg-blue-600 text-white' : 'text-gray-900'}`}>{d.getDate()}</div>
              </div>
            );
          })}
        </div>
        <div className="overflow-y-auto max-h-[650px]">
          {timeSlots.map((time, tIdx) => {
            const hour = tIdx + 9;
            return (
              <React.Fragment key={time}>
                <div className="grid grid-cols-8 border-b border-gray-100">
                  <div className="p-3 border-r border-gray-200 text-xs font-medium text-gray-500 bg-gray-50/50 flex items-start justify-end pr-3">{time}</div>
                  {weekDates.map((d, dIdx) => {
                    const dateStr = formatDateForInput(d);
                    const slotMeetings = filteredMeetings.filter(m => {
                      const md = getMeetingDateStr(m);
                      const mt = parseInt(getMeetingTime(m).split(':')[0]);
                      return md === dateStr && mt === hour;
                    });
                    return (
                      <div
                        key={dIdx}
                        onClick={() => openCreateForSlot(d, hour)}
                        className="min-h-[80px] border-r border-gray-100 last:border-r-0 p-1.5 hover:bg-blue-50/30 transition-colors cursor-pointer"
                      >
                        {slotMeetings.map((m, i) => (
                          <div
                            key={i}
                            onClick={(e) => { e.stopPropagation(); openMeeting(m); }}
                            className={`mb-1.5 p-2 rounded-lg border-l-3 cursor-pointer hover:shadow-md transition-all ${getMeetingColor(getMeetingType(m))}`}
                          >
                            <div className="flex items-start gap-1.5">
                              <span className="mt-0.5">{getMeetingIcon(getMeetingType(m))}</span>
                              <div className="flex-1 min-w-0">
                                <p className="font-semibold text-[11px] leading-tight truncate">{getMeetingTitle(m)}</p>
                                <p className="text-[10px] opacity-70 mt-0.5">{getMeetingTime(m)}</p>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    );
                  })}
                </div>
              </React.Fragment>
            );
          })}
        </div>
      </div>
    );
  };

  const openMeeting = (meeting: any) => {
    setSelectedMeeting(meeting);
    setFormData({
      title: meeting.title || '',
      topic: meeting.topic || '',
      date: getMeetingDateStr(meeting),
      time: meeting.time || meeting.meeting_time || '',
      duration: meeting.duration || '60',
      location: meeting.location || meeting.venue || '',
      description: meeting.description || meeting.notes || meeting.agenda || '',
      status: meeting.status || 'Scheduled',
      type: meeting.type || 'general'
    });
    setOffCanvasMode('view');
  };

  const openCreate = () => {
    setSelectedMeeting(null);
    setFormData({
      title: '', topic: '', date: formatDateForInput(new Date()), time: '09:00', duration: '60',
      location: '', description: '', status: 'Scheduled', type: 'general'
    });
    setOffCanvasMode('create');
  };

  const closeOffCanvas = () => { setOffCanvasMode(null); setSelectedMeeting(null); };

  const handleSave = async () => {
    try {
      setSaving(true);
      if (offCanvasMode === 'edit' && selectedMeeting) {
        await pb.collection('meetings').update(selectedMeeting.id, formData);
        setOffCanvasMode('view');
        setSelectedMeeting({ ...selectedMeeting, ...formData });
      } else if (offCanvasMode === 'create') {
        await pb.collection('meetings').create(formData);
        closeOffCanvas();
      }
      await loadData();
    } catch (err: any) { console.error('Save error:', err); }
    finally { setSaving(false); }
  };

  const handleDeleteMeeting = async () => {
    if (!confirm('Delete this meeting?')) return;
    try { await pb.collection('meetings').delete(selectedMeeting.id); closeOffCanvas(); await loadData(); }
    catch (err: any) { console.error('Delete error:', err); }
  };

  const renderOffCanvas = () => {
    if (!offCanvasMode) return null;

    return (
      <>
        <div className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm" onClick={closeOffCanvas} />
        <div className="fixed right-0 top-0 bottom-0 z-50 w-full max-w-md bg-white shadow-2xl overflow-y-auto">
          <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between z-10">
            <h2 className="text-lg font-bold text-gray-900">
              {offCanvasMode === 'create' ? 'Create New Meeting' :
               offCanvasMode === 'edit' ? 'Edit Meeting' : 'Meeting Details'}
            </h2>
            <div className="flex items-center gap-1">
              {offCanvasMode === 'view' && (
                <button onClick={() => setOffCanvasMode('edit')} className="p-2 hover:bg-gray-100 rounded-lg" title="Edit">
                  <Edit3 className="w-4 h-4 text-gray-600" />
                </button>
              )}
              {offCanvasMode === 'edit' && (
                <button onClick={handleSave} disabled={saving} className="p-2 hover:bg-green-50 rounded-lg" title="Save">
                  <Save className="w-4 h-4 text-green-600" />
                </button>
              )}
              <button onClick={closeOffCanvas} className="p-2 hover:bg-gray-100 rounded-lg">
                <X className="w-4 h-4 text-gray-600" />
              </button>
            </div>
          </div>

          <div className="p-6 space-y-5">
            {offCanvasMode !== 'create' && selectedMeeting && (
              <div className={`p-3 rounded-lg border-l-4 flex items-center gap-2 ${getMeetingColor(getMeetingType(selectedMeeting))}`}>
                {getMeetingIcon(getMeetingType(selectedMeeting))}
                <span className="text-xs font-bold uppercase">{getMeetingType(selectedMeeting)}</span>
              </div>
            )}

            {offCanvasMode === 'view' ? (
              <h3 className="text-xl font-bold text-gray-900">{getMeetingTitle(selectedMeeting)}</h3>
            ) : (
              <div>
                <label className="text-xs font-semibold text-gray-700 uppercase mb-1 block">Title *</label>
                <input type="text" required value={formData.title} onChange={(e) => setFormData({ ...formData, title: e.target.value })} className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="Meeting title" />
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
                <div className="flex items-center gap-1.5 text-gray-500 mb-1"><CalendarIcon className="w-3.5 h-3.5" /><span className="text-[10px] font-semibold uppercase">Date</span></div>
                {offCanvasMode === 'view' ? (
                  <p className="text-sm font-semibold text-gray-900">{new Date(selectedMeeting.date || selectedMeeting.meeting_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</p>
                ) : (
                  <input type="date" value={formData.date} onChange={(e) => setFormData({ ...formData, date: e.target.value })} className="w-full text-sm font-semibold bg-transparent border-b border-gray-300 focus:outline-none" />
                )}
              </div>
              <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
                <div className="flex items-center gap-1.5 text-gray-500 mb-1"><Clock className="w-3.5 h-3.5" /><span className="text-[10px] font-semibold uppercase">Time</span></div>
                {offCanvasMode === 'view' ? (
                  <p className="text-sm font-semibold text-gray-900">{getMeetingTime(selectedMeeting)}</p>
                ) : (
                  <input type="time" value={formData.time} onChange={(e) => setFormData({ ...formData, time: e.target.value })} className="w-full text-sm font-semibold bg-transparent border-b border-gray-300 focus:outline-none" />
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
                <div className="flex items-center gap-1.5 text-gray-500 mb-1"><Clock className="w-3.5 h-3.5" /><span className="text-[10px] font-semibold uppercase">Duration</span></div>
                {offCanvasMode === 'view' ? (
                  <p className="text-sm font-semibold text-gray-900">{selectedMeeting.duration || 60} min</p>
                ) : (
                  <input type="number" value={formData.duration} onChange={(e) => setFormData({ ...formData, duration: e.target.value })} className="w-full text-sm font-semibold bg-transparent border-b border-gray-300 focus:outline-none" />
                )}
              </div>
              <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
                <div className="flex items-center gap-1.5 text-gray-500 mb-1"><FileText className="w-3.5 h-3.5" /><span className="text-[10px] font-semibold uppercase">Type</span></div>
                {offCanvasMode === 'view' ? (
                  <p className="text-sm font-semibold text-gray-900 capitalize">{selectedMeeting.type || 'General'}</p>
                ) : (
                  <select value={formData.type} onChange={(e) => setFormData({ ...formData, type: e.target.value })} className="w-full text-sm font-semibold bg-transparent border-b border-gray-300 focus:outline-none">
                    <option value="general">General</option>
                    <option value="review">Review</option>
                    <option value="training">Training</option>
                    <option value="brainstorming">Brainstorming</option>
                    <option value="strategy">Strategy</option>
                    <option value="client">Client</option>
                    <option value="workshop">Workshop</option>
                    <option value="planning">Planning</option>
                  </select>
                )}
              </div>
            </div>

            <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
              <div className="flex items-center gap-1.5 text-gray-500 mb-1"><MapPin className="w-3.5 h-3.5" /><span className="text-[10px] font-semibold uppercase">Location</span></div>
              {offCanvasMode === 'view' ? (
                <p className="text-sm font-semibold text-gray-900">{selectedMeeting.location || selectedMeeting.venue || 'Not specified'}</p>
              ) : (
                <input type="text" value={formData.location} onChange={(e) => setFormData({ ...formData, location: e.target.value })} className="w-full text-sm font-semibold bg-transparent border-b border-gray-300 focus:outline-none" placeholder="Room, venue, or link" />
              )}
            </div>

            {offCanvasMode === 'edit' && (
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase mb-1 block">Status</label>
                <select value={formData.status} onChange={(e) => setFormData({ ...formData, status: e.target.value })} className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option>Scheduled</option><option>Completed</option><option>Cancelled</option><option>Rescheduled</option>
                </select>
              </div>
            )}

            <div>
              <div className="flex items-center gap-1.5 text-gray-500 mb-2"><FileText className="w-4 h-4" /><span className="text-xs font-semibold uppercase">Description</span></div>
              {offCanvasMode === 'view' ? (
                <p className="text-sm text-gray-700 leading-relaxed bg-gray-50 rounded-lg p-3 border border-gray-200">{selectedMeeting.description || selectedMeeting.notes || selectedMeeting.agenda || 'No description provided.'}</p>
              ) : (
                <textarea value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })} rows={4} className="w-full text-sm border border-gray-300 rounded-lg p-3 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" placeholder="Agenda or notes..." />
              )}
            </div>
          </div>

          <div className="sticky bottom-0 bg-gray-50 border-t border-gray-200 px-6 py-4 flex gap-2">
            {offCanvasMode === 'view' ? (
              <>
                <button onClick={handleDeleteMeeting} className="px-4 py-2.5 border border-red-300 text-red-600 font-medium rounded-lg hover:bg-red-50 transition-colors"><Trash2 className="w-4 h-4" /></button>
                <button onClick={() => setOffCanvasMode('edit')} className="flex-1 px-4 py-2.5 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors">Edit Meeting</button>
              </>
            ) : offCanvasMode === 'edit' ? (
              <>
                <button onClick={() => { setOffCanvasMode('view'); setFormData({ title: selectedMeeting.title || '', topic: selectedMeeting.topic || '', date: getMeetingDateStr(selectedMeeting), time: selectedMeeting.time || selectedMeeting.meeting_time || '', duration: selectedMeeting.duration || '60', location: selectedMeeting.location || selectedMeeting.venue || '', description: selectedMeeting.description || selectedMeeting.notes || selectedMeeting.agenda || '', status: selectedMeeting.status || 'Scheduled', type: selectedMeeting.type || 'general' }); }} className="flex-1 px-4 py-2.5 border border-gray-300 text-gray-700 font-medium rounded-lg hover:bg-gray-100 transition-colors">Cancel</button>
                <button onClick={handleSave} disabled={saving} className="flex-1 px-4 py-2.5 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50">{saving ? 'Saving...' : 'Save Changes'}</button>
              </>
            ) : (
              <>
                <button onClick={closeOffCanvas} className="flex-1 px-4 py-2.5 border border-gray-300 text-gray-700 font-medium rounded-lg hover:bg-gray-100 transition-colors">Cancel</button>
                <button onClick={handleSave} disabled={saving} className="flex-1 px-4 py-2.5 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50">{saving ? 'Creating...' : 'Create Meeting'}</button>
              </>
            )}
          </div>
        </div>
      </>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-10 h-10 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4">
        <div className="bg-red-50 border border-red-200 rounded-xl p-6">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-6 h-6 text-red-600 flex-shrink-0" />
            <div className="flex-1">
              <h3 className="text-lg font-bold text-red-900 mb-2">Failed to load meetings</h3>
              <p className="text-red-700 mb-4">{error}</p>
              <button onClick={loadData} className="inline-flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 font-medium"><RefreshCw className="w-4 h-4" />Try Again</button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <h2 className="text-xl font-bold text-gray-900">Calendar</h2>
          
          <div className="flex items-center bg-gray-100 rounded-lg p-0.5">
            {(['year', 'month', 'week'] as ViewMode[]).map(v => (
              <button key={v} onClick={() => setViewMode(v)} className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all capitalize ${viewMode === v ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}>{v}</button>
            ))}
          </div>

          <div className="flex items-center gap-1">
            <button onClick={() => navigate('prev')} className="p-1.5 hover:bg-gray-100 rounded-lg"><ChevronLeft className="w-4 h-4 text-gray-600" /></button>
            <button onClick={goToToday} className="px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-100 rounded-lg border border-gray-200">Today</button>
            <button onClick={() => navigate('next')} className="p-1.5 hover:bg-gray-100 rounded-lg"><ChevronRight className="w-4 h-4 text-gray-600" /></button>
          </div>

          <span className="text-sm font-medium text-gray-700">{getHeaderLabel()}</span>
        </div>

        <div className="flex items-center gap-2">
          <div className="relative">
            <button 
              onClick={() => setShowFilter(!showFilter)}
              className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border transition-colors ${showFilter ? 'bg-blue-50 border-blue-300 text-blue-700' : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'}`}
            >
              <Filter className="w-3.5 h-3.5" />
              Filter
              {(filterType !== 'all' || filterStatus !== 'all') && (
                <span className="w-2 h-2 bg-blue-600 rounded-full"></span>
              )}
            </button>

            {showFilter && (
              <div className="absolute right-0 top-full mt-2 w-64 bg-white border border-gray-200 rounded-lg shadow-lg z-30 p-4">
                <div className="space-y-3">
                  <div>
                    <label className="text-xs font-semibold text-gray-700 uppercase mb-1 block">Meeting Type</label>
                    <select value={filterType} onChange={(e) => setFilterType(e.target.value)} className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500">
                      <option value="all">All Types</option>
                      <option value="general">General</option>
                      <option value="review">Review</option>
                      <option value="training">Training</option>
                      <option value="brainstorming">Brainstorming</option>
                      <option value="strategy">Strategy</option>
                      <option value="client">Client</option>
                      <option value="workshop">Workshop</option>
                      <option value="planning">Planning</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-gray-700 uppercase mb-1 block">Status</label>
                    <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500">
                      <option value="all">All Status</option>
                      <option value="Scheduled">Scheduled</option>
                      <option value="Completed">Completed</option>
                      <option value="Cancelled">Cancelled</option>
                      <option value="Rescheduled">Rescheduled</option>
                    </select>
                  </div>
                  <button 
                    onClick={() => { setFilterType('all'); setFilterStatus('all'); setShowFilter(false); }}
                    className="w-full px-3 py-2 text-xs text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50"
                  >
                    Clear Filters
                  </button>
                </div>
              </div>
            )}
          </div>

          <button onClick={openCreate} className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-xs font-medium shadow-lg shadow-blue-600/20">
            <Plus className="w-3.5 h-3.5" />
            Create
          </button>
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-2 text-xs">
        {Object.entries(MEETING_TYPE_COLORS).map(([type, color]) => (
          <div key={type} className={`flex items-center gap-1.5 px-2 py-1 rounded border-l-2 ${color}`}>
            {MEETING_TYPE_ICONS[type]}
            <span className="capitalize font-medium">{type}</span>
          </div>
        ))}
      </div>

      {/* Debug info */}
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-xs text-gray-600">
        <strong>Total meetings:</strong> {meetings.length} | <strong>Filtered:</strong> {filteredMeetings.length}
        {meetings.length > 0 && (
          <div className="mt-1">
            <strong>Sample dates:</strong> {meetings.slice(0, 3).map(m => getMeetingDateStr(m)).join(', ')}
          </div>
        )}
      </div>

      {/* Calendar Views */}
      {viewMode === 'year' && renderYearView()}
      {viewMode === 'month' && renderMonthView()}
      {viewMode === 'week' && renderWeekView()}

      {renderOffCanvas()}
    </div>
  );
}