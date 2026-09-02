'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Calendar, Clock, MapPin, Users, Edit } from 'lucide-react';
import CreateMeetingPanel from '@/components/CreateMeetingPanel';

interface Meeting {
  id: string;
  title?: string;
  agenda?: string;
  topic?: string;
  description?: string;
  meeting_date?: string;
  meeting_time?: string;
  time?: string;
  location?: string;
  venue?: string;
  officer_name?: string;
  officer_type?: string;
  officer_designation?: string;
  status?: string;
  attendees?: string[];
  expand?: {
    attendees?: any[];
    officers?: any[];
  };
}

interface UpComingMeetingsProps {
  meetings: Meeting[];
}

export default function UpComingMeetings({ meetings }: UpComingMeetingsProps) {
  const router = useRouter();
  const [editingMeeting, setEditingMeeting] = useState<Meeting | null>(null);

  // Helper function to get proper meeting title
  const getMeetingTitle = (meeting: Meeting): string => {
    if (meeting.agenda && meeting.agenda.trim()) return meeting.agenda;
    if (meeting.title && meeting.title.trim()) return meeting.title;
    if (meeting.topic && meeting.topic.trim()) return meeting.topic;
    if (meeting.description && meeting.description.trim()) return meeting.description;
    
    if (meeting.officer_name) {
      const type = meeting.officer_type || 'Officer';
      return `Meeting with ${meeting.officer_name} (${type})`;
    }
    
    return 'Scheduled Meeting';
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return null;
    try {
      const date = new Date(dateString);
      if (isNaN(date.getTime())) return null;
      
      return {
        day: date.getDate(),
        month: date.toLocaleString('default', { month: 'short' }).toUpperCase(),
        full: date.toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' }),
      };
    } catch {
      return null;
    }
  };

  const formatTime = (time24h?: string): string => {
    if (!time24h) return '-';
    const [hours, minutes] = time24h.split(':');
    const hour = parseInt(hours);
    const modifier = hour >= 12 ? 'PM' : 'AM';
    const hour12 = hour % 12 || 12;
    return `${hour12}:${minutes} ${modifier}`;
  };

  const getAttendeeNames = (meeting: Meeting): string[] => {
    const names: string[] = [];
    
    if (meeting.expand) {
      ['attendees', 'officers'].forEach(field => {
        if (meeting.expand[field]) {
          const items = Array.isArray(meeting.expand[field]) 
            ? meeting.expand[field] 
            : [meeting.expand[field]];
          items.forEach((item: any) => {
            if (item && item.name) names.push(item.name);
          });
        }
      });
    }
    
    if (Array.isArray(meeting.attendees) && meeting.attendees.length > 0 && names.length === 0) {
      return meeting.attendees;
    }
    
    return names;
  };

  if (!meetings || meetings.length === 0) {
    return (
      <div className="bg-white rounded-2xl p-8 border border-gray-200 shadow-sm">
        <h2 className="text-xl font-bold text-gray-900 mb-6">Upcoming Meetings</h2>
        <div className="text-center py-12">
          <div className="w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center mx-auto mb-4">
            <Calendar className="w-8 h-8 text-blue-600" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900 mb-1">No upcoming meetings</h3>
          <p className="text-gray-500 text-sm">Schedule a meeting to get started</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="bg-white rounded-2xl p-6 border border-gray-200 shadow-sm">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-gray-900">Upcoming Meetings</h2>
          <span className="text-sm text-gray-500 bg-gray-100 px-3 py-1 rounded-full font-medium">
            {meetings.length} Scheduled
          </span>
        </div>
        
        <div className="space-y-4">
          {meetings.map((meeting) => {
            const dateInfo = formatDate(meeting.meeting_date);
            const time = meeting.meeting_time || meeting.time || '-';
            const location = meeting.location || meeting.venue || 'TBD';
            const attendeeNames = getAttendeeNames(meeting);
            const title = getMeetingTitle(meeting);

            return (
              <div 
                key={meeting.id}
                className="group relative flex gap-4 p-4 rounded-xl border border-gray-100 hover:border-blue-200 hover:bg-blue-50/30 transition-all"
              >
                {/* Date Badge */}
                <div className="flex-shrink-0">
                  <div className="w-14 h-14 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-xl flex flex-col items-center justify-center text-white shadow-sm">
                    <span className="text-xs font-bold uppercase">{dateInfo?.month || 'TBD'}</span>
                    <span className="text-xl font-bold">{dateInfo?.day || '--'}</span>
                  </div>
                </div>

                {/* Meeting Info */}
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-gray-900 group-hover:text-blue-700 transition-colors line-clamp-1 mb-1">
                    {title}
                  </h3>
                  
                  <div className="flex flex-wrap items-center gap-3 text-sm text-gray-600">
                    <div className="flex items-center gap-1">
                      <Clock className="w-4 h-4 text-gray-400" />
                      <span>{formatTime(time)}</span>
                    </div>

                    <div className="flex items-center gap-1">
                      <MapPin className="w-4 h-4 text-gray-400" />
                      <span className="truncate">{location}</span>
                    </div>

                    {meeting.officer_type && (
                      <div className="flex items-center gap-1 px-2 py-0.5 bg-blue-50 text-blue-700 rounded-full text-xs font-semibold border border-blue-100">
                        <Users className="w-3 h-3" />
                        <span>{meeting.officer_type}</span>
                      </div>
                    )}
                  </div>

                  {meeting.officer_name && (
                    <p className="text-sm text-gray-600 mt-2">
                      <span className="font-medium text-gray-900">With:</span> {meeting.officer_name}
                      {meeting.officer_designation && <span className="text-gray-500"> - {meeting.officer_designation}</span>}
                    </p>
                  )}

                  {attendeeNames.length > 0 && (
                    <div className="flex items-center gap-2 mt-2">
                      <div className="flex -space-x-2">
                        {attendeeNames.slice(0, 3).map((name, idx) => (
                          <div 
                            key={idx}
                            className="w-7 h-7 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center text-white text-xs font-bold border-2 border-white"
                            title={typeof name === 'string' ? name : name.name}
                          >
                            {(typeof name === 'string' ? name : name.name).charAt(0).toUpperCase()}
                          </div>
                        ))}
                        {attendeeNames.length > 3 && (
                          <div className="w-7 h-7 rounded-full bg-gray-200 flex items-center justify-center text-gray-600 text-xs font-bold border-2 border-white">
                            +{attendeeNames.length - 3}
                          </div>
                        )}
                      </div>
                      <span className="text-xs text-gray-500">
                        {attendeeNames.length} attendee{attendeeNames.length !== 1 ? 's' : ''}
                      </span>
                    </div>
                  )}
                </div>

                {/* Edit Button (Appears on Hover) */}
                <div className="flex-shrink-0">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditingMeeting(meeting);
                    }}
                    className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-100 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                    title="Edit or Delete Meeting"
                  >
                    <Edit className="w-5 h-5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Edit/Create Panel */}
      <CreateMeetingPanel 
        isOpen={!!editingMeeting}
        meetingToEdit={editingMeeting}
        onClose={() => setEditingMeeting(null)}
        onSuccess={() => {
          setEditingMeeting(null);
          router.refresh(); // Automatically refreshes the dashboard data!
        }}
      />
    </>
  );
}