'use client';

import { useEffect, useState } from 'react';
import { 
  Calendar, Users, Clock, MapPin, Search, FileText,
  Plus, XCircle, AlertCircle, Edit2, Trash2, 
  X, ChevronRight, User, Briefcase, Tag, AlignLeft, Phone, Mail
} from 'lucide-react';
import pb from '@/lib/pocketbase';
import CreateMeetingPanel from '@/components/CreateMeetingPanel';

export default function MeetingsPage() {
  const [meetings, setMeetings] = useState<any[]>([]);
  const [selectedMeeting, setSelectedMeeting] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const [editingMeeting, setEditingMeeting] = useState<any>(null);

  useEffect(() => { loadData(); }, []);

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

  const handleDelete = async () => {
    if (!selectedMeeting) return;
    if (!confirm('Are you sure you want to delete this meeting?')) return;
    try {
      await pb.collection('meetings').delete(selectedMeeting.id);
      setSelectedMeeting(null);
      loadData();
    } catch (error) {
      alert('Failed to delete meeting');
    }
  };

  const formatTimeDisplay = (timeString: string): string => {
    if (!timeString || !timeString.includes(':')) return '-';
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

  const getMeetingTitle = (meeting: any) => {
    return meeting.agenda || meeting.title || 'General Discussion';
  };

  const getStatusColor = (status: string) => {
    switch (status?.toLowerCase()) {
      case 'completed': return { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200' };
      case 'cancelled': return { bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-200' };
      case 'rescheduled': return { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200' };
      case 'rejected': return { bg: 'bg-rose-50', text: 'text-rose-700', border: 'border-rose-200' };
      case 'scheduled': return { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200' };
      default: return { bg: 'bg-gray-50', text: 'text-gray-700', border: 'border-gray-200' };
    }
  };

  const filteredMeetings = meetings.filter(meeting => {
    const title = getMeetingTitle(meeting).toLowerCase();
    const matchesSearch = searchQuery === '' || title.includes(searchQuery.toLowerCase()) || (meeting.location || '').toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === 'all' || (meeting.status || 'Scheduled').toLowerCase() === statusFilter.toLowerCase();
    return matchesSearch && matchesStatus;
  });

  if (loading) return <div className="p-8 flex items-center justify-center min-h-screen"><div className="w-12 h-12 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" /></div>;

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div><h1 className="text-3xl font-bold text-gray-900">Meetings</h1><p className="text-gray-500 mt-1">Manage and track all your meetings</p></div>
        <button onClick={() => { setEditingMeeting(null); setIsPanelOpen(true); }} className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors">
          <Plus className="w-5 h-5" /> New Meeting
        </button>
      </div>

      {/* Search and Filter */}
      <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
        <div className="flex gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input type="text" placeholder="Search meetings..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="px-4 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
            <option value="all">All Status</option>
            <option value="scheduled">Scheduled</option>
            <option value="completed">Completed</option>
            <option value="rescheduled">Rescheduled</option>
            <option value="cancelled">Cancelled</option>
            <option value="rejected">Rejected</option>
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="grid grid-cols-12 gap-4 px-6 py-3.5 bg-gray-50 border-b border-gray-200 text-xs font-semibold text-gray-500 uppercase">
          <div className="col-span-1 text-center">Date</div>
          <div className="col-span-4">Agenda</div>
          <div className="col-span-2 text-center">Time</div>
          <div className="col-span-2">Location</div>
          <div className="col-span-1 text-center">Type</div>
          <div className="col-span-1 text-center">Status</div>
          <div className="col-span-1"></div>
        </div>
        <div className="divide-y divide-gray-200">
          {filteredMeetings.length === 0 ? (
            <div className="p-16 text-center text-gray-500">No meetings found</div>
          ) : (
            filteredMeetings.map((meeting) => {
              const dateInfo = formatDate(meeting.meeting_date || meeting.created);
              const time = meeting.meeting_time || '-';
              const status = meeting.status || 'Scheduled';
              const statusColors = getStatusColor(status);
              const title = getMeetingTitle(meeting);

              return (
                <div key={meeting.id} onClick={() => setSelectedMeeting(meeting)} className="grid grid-cols-12 gap-4 px-6 py-4 items-center hover:bg-blue-50/50 cursor-pointer transition-colors group">
                  <div className="col-span-1 text-center">
                    <div className="text-lg font-bold text-gray-900">{dateInfo?.day}</div>
                    <div className="text-xs text-gray-500 uppercase">{dateInfo?.month}</div>
                  </div>
                  <div className="col-span-4">
                    <h3 className="font-semibold text-gray-900 group-hover:text-blue-600 transition-colors">{title}</h3>
                    {meeting.officer_name && <p className="text-xs text-gray-500 mt-1">with {meeting.officer_name}</p>}
                  </div>
                  <div className="col-span-2 text-center text-sm text-gray-600">
                    <div>{formatTimeDisplay(time)}</div>
                    {meeting.duration && <div className="text-xs text-gray-400">{meeting.duration} min</div>}
                  </div>
                  <div className="col-span-2 text-sm text-gray-600 truncate">{meeting.location || '-'}</div>
                  <div className="col-span-1 text-center text-sm text-gray-600">{meeting.meeting_type || '-'}</div>
                  <div className="col-span-1 text-center">
                    <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-semibold ${statusColors.bg} ${statusColors.text} border ${statusColors.border}`}>{status}</span>
                  </div>
                  <div className="col-span-1 text-center">
                    <ChevronRight className="w-4 h-4 text-gray-400 group-hover:text-blue-600 transition-colors mx-auto" />
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* ✅ CLEAN OFF-CANVAS MEETING DETAILS PANEL (No Status Changer) */}
      {selectedMeeting && (() => {
        const dateInfo = formatDate(selectedMeeting.meeting_date || selectedMeeting.created);
        const time = selectedMeeting.meeting_time || '';
        const currentStatus = selectedMeeting.status || 'Scheduled';
        const statusColors = getStatusColor(currentStatus);

        return (
          <>
            <div className="fixed inset-0 bg-black/30 backdrop-blur-sm z-40 transition-opacity" onClick={() => setSelectedMeeting(null)} />
            <div className="fixed inset-y-0 right-0 w-full max-w-md bg-white shadow-2xl z-50 flex flex-col animate-in slide-in-from-right duration-300">
              
              {/* Header */}
              <div className="flex items-start justify-between p-6 border-b border-gray-200 bg-gray-50/50">
                <div className="flex-1 pr-4">
                  <h2 className="text-xl font-bold text-gray-900 leading-tight mb-2">{getMeetingTitle(selectedMeeting)}</h2>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-semibold ${statusColors.bg} ${statusColors.text} border ${statusColors.border}`}>{currentStatus}</span>
                    {dateInfo && <span className="text-sm text-gray-500 font-medium">{dateInfo.weekday}, {dateInfo.full}</span>}
                  </div>
                </div>
                <button onClick={() => setSelectedMeeting(null)} className="p-2 hover:bg-gray-200 rounded-lg transition-colors">
                  <X className="w-5 h-5 text-gray-500" />
                </button>
              </div>

              {/* Scrollable Content */}
              <div className="flex-1 overflow-y-auto p-6 space-y-6">
                
                {/* Action Buttons */}
                <div className="flex gap-3">
                  <button onClick={handleEdit} className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors shadow-sm">
                    <Edit2 className="w-4 h-4" /> Edit Meeting
                  </button>
                  <button onClick={handleDelete} className="px-4 py-2.5 bg-red-50 hover:bg-red-100 text-red-600 font-medium rounded-lg transition-colors border border-red-200">
                    <Trash2 className="w-5 h-5" />
                  </button>
                </div>

                {/* Meeting Details Grid */}
                <div className="space-y-4">
                  <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wide flex items-center gap-2">
                    <FileText className="w-4 h-4 text-blue-600" />
                    Meeting Information
                  </h3>
                  
                  <div className="space-y-4">
                    {/* Date & Time */}
                    <div className="flex items-start gap-3">
                      <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0">
                        <Calendar className="w-4 h-4 text-blue-600" />
                      </div>
                      <div className="flex-1">
                        <p className="text-xs font-semibold text-gray-500 uppercase mb-0.5">Date & Time</p>
                        <p className="text-sm font-medium text-gray-900">
                          {dateInfo?.full} at {formatTimeDisplay(time)}
                        </p>
                        {selectedMeeting.duration && (
                          <p className="text-xs text-gray-500 mt-0.5">Duration: {selectedMeeting.duration} minutes</p>
                        )}
                      </div>
                    </div>

                    {/* Location */}
                    <div className="flex items-start gap-3">
                      <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0">
                        <MapPin className="w-4 h-4 text-blue-600" />
                      </div>
                      <div className="flex-1">
                        <p className="text-xs font-semibold text-gray-500 uppercase mb-0.5">Location & Place</p>
                        <p className="text-sm text-gray-900">{selectedMeeting.location || selectedMeeting.meeting_place || 'Not specified'}</p>
                      </div>
                    </div>

                    {/* Officer Details */}
                    {(selectedMeeting.officer_name || selectedMeeting.designation || selectedMeeting.officer_type) && (
                      <div className="flex items-start gap-3">
                        <div className="w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center flex-shrink-0">
                          <User className="w-4 h-4 text-indigo-600" />
                        </div>
                        <div className="flex-1">
                          <p className="text-xs font-semibold text-gray-500 uppercase mb-0.5">Officer Details</p>
                          {selectedMeeting.officer_name && <p className="text-sm font-medium text-gray-900">{selectedMeeting.officer_name}</p>}
                          {selectedMeeting.designation && <p className="text-sm text-gray-700">{selectedMeeting.designation}</p>}
                          {selectedMeeting.officer_type && (
                            <span className="inline-block mt-1 px-2 py-0.5 bg-indigo-50 text-indigo-700 text-xs font-semibold rounded">
                              {selectedMeeting.officer_type}
                            </span>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Meeting Type & Priority */}
                    <div className="grid grid-cols-2 gap-4">
                      {selectedMeeting.meeting_type && (
                        <div className="flex items-start gap-3">
                          <div className="w-8 h-8 rounded-lg bg-gray-50 flex items-center justify-center flex-shrink-0">
                            <Briefcase className="w-4 h-4 text-gray-600" />
                          </div>
                          <div className="flex-1">
                            <p className="text-xs font-semibold text-gray-500 uppercase mb-0.5">Type</p>
                            <p className="text-sm text-gray-900 capitalize">{selectedMeeting.meeting_type}</p>
                          </div>
                        </div>
                      )}
                      {selectedMeeting.priority && (
                        <div className="flex items-start gap-3">
                          <div className="w-8 h-8 rounded-lg bg-gray-50 flex items-center justify-center flex-shrink-0">
                            <Tag className="w-4 h-4 text-gray-600" />
                          </div>
                          <div className="flex-1">
                            <p className="text-xs font-semibold text-gray-500 uppercase mb-0.5">Priority</p>
                            <p className="text-sm text-gray-900 capitalize">{selectedMeeting.priority}</p>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Description */}
                    {selectedMeeting.description && (
                      <div className="flex items-start gap-3">
                        <div className="w-8 h-8 rounded-lg bg-gray-50 flex items-center justify-center flex-shrink-0">
                          <AlignLeft className="w-4 h-4 text-gray-600" />
                        </div>
                        <div className="flex-1">
                          <p className="text-xs font-semibold text-gray-500 uppercase mb-0.5">Description</p>
                          <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">{selectedMeeting.description}</p>
                        </div>
                      </div>
                    )}

                    {/* Notes */}
                    {selectedMeeting.notes && (
                      <div className="flex items-start gap-3">
                        <div className="w-8 h-8 rounded-lg bg-yellow-50 flex items-center justify-center flex-shrink-0">
                          <FileText className="w-4 h-4 text-yellow-600" />
                        </div>
                        <div className="flex-1">
                          <p className="text-xs font-semibold text-gray-500 uppercase mb-0.5">Additional Notes</p>
                          <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">{selectedMeeting.notes}</p>
                        </div>
                      </div>
                    )}

                    {/* Contact Info */}
                    {(selectedMeeting.contact_number || selectedMeeting.email) && (
                      <div className="pt-4 border-t border-gray-100 grid grid-cols-2 gap-4">
                        {selectedMeeting.contact_number && (
                          <div className="flex items-center gap-3">
                            <Phone className="w-4 h-4 text-gray-400" />
                            <div>
                              <p className="text-xs text-gray-500 uppercase font-semibold">Contact</p>
                              <p className="text-sm font-medium text-gray-900">{selectedMeeting.contact_number}</p>
                            </div>
                          </div>
                        )}
                        {selectedMeeting.email && (
                          <div className="flex items-center gap-3">
                            <Mail className="w-4 h-4 text-gray-400" />
                            <div>
                              <p className="text-xs text-gray-500 uppercase font-semibold">Email</p>
                              <p className="text-sm font-medium text-gray-900 truncate">{selectedMeeting.email}</p>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* Metadata Footer */}
                <div className="pt-4 border-t border-gray-200">
                  <div className="grid grid-cols-2 gap-4 text-xs">
                    <div>
                      <p className="text-gray-500 mb-0.5">Created</p>
                      <p className="font-medium text-gray-900">{new Date(selectedMeeting.created).toLocaleDateString()}</p>
                    </div>
                    <div>
                      <p className="text-gray-500 mb-0.5">Last Updated</p>
                      <p className="font-medium text-gray-900">{selectedMeeting.updated ? new Date(selectedMeeting.updated).toLocaleDateString() : 'N/A'}</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </>
        );
      })()}

      {/* Create/Edit Meeting Panel */}
      <CreateMeetingPanel 
        isOpen={isPanelOpen}
        onClose={() => { setIsPanelOpen(false); setEditingMeeting(null); }}
        onSuccess={() => { loadData(); setIsPanelOpen(false); setEditingMeeting(null); }}
        meetingToEdit={editingMeeting}
      />
    </div>
  );
}