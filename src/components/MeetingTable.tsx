import Link from 'next/link';
import { ArrowRight, Calendar, Users } from 'lucide-react';

interface Meeting {
  id: string;
  title?: string;
  name?: string;
  date?: string;
  meeting_date?: string;
  created?: string;
  time?: string;
  meeting_time?: string;
  duration?: string | number;
  duration_minutes?: string | number;
  expand?: {
    attendees?: any[];
    participants?: any[];
    officers?: any[];
    ias_officers?: any[];
    ips_officers?: any[];
  };
  attendees?: string[];
  participants?: string[];
  officers?: string[];
}

interface MeetingTableProps {
  meetings: Meeting[];
}

export default function MeetingTable({ meetings }: MeetingTableProps) {
  const formatDate = (dateString?: string) => {
    if (!dateString) return { month: 'N/A', day: 'N/A', full: 'Date TBD' };
    try {
      const date = new Date(dateString);
      if (isNaN(date.getTime())) return { month: 'N/A', day: 'N/A', full: 'Date TBD' };
      return {
        month: date.toLocaleString('default', { month: 'short' }).toUpperCase(),
        day: date.getDate().toString(),
        full: date.toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' }),
      };
    } catch {
      return { month: 'N/A', day: 'N/A', full: 'Date TBD' };
    }
  };

  const getOfficerNames = (meeting: Meeting) => {
    const names: string[] = [];
    const expandFields = ['attendees', 'participants', 'officers', 'ias_officers', 'ips_officers'] as const;
    
    // 1. Try to get names from expanded data
    for (const field of expandFields) {
      if (meeting.expand?.[field]) {
        const items = Array.isArray(meeting.expand[field]) 
          ? meeting.expand[field] 
          : [meeting.expand[field]];
          
        items.forEach((item: any) => {
          if (item?.name && !names.includes(item.name)) {
            names.push(item.name);
          }
        });
      }
    }
    
    // 2. Fallback if expand didn't work but we have raw IDs
    if (names.length === 0) {
      const rawIds = [
        ...(meeting.attendees || []),
        ...(meeting.participants || []),
        ...(meeting.officers || [])
      ].filter(Boolean);
      
      if (rawIds.length > 0) {
        return `${rawIds.length} officer(s) linked (IDs hidden)`;
      }
    }
    
    return names.length > 0 ? names.join(', ') : 'No officers linked';
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Recent Meetings</h2>
          <p className="text-sm text-gray-500 mt-0.5">Latest meetings with attendees</p>
        </div>
        <Link 
          href="/meetings"
          className="flex items-center gap-1 text-sm font-medium text-blue-600 hover:text-blue-700 transition-colors"
        >
          View All
          <ArrowRight className="w-4 h-4" />
        </Link>
      </div>

      <div className="space-y-4">
        {meetings.length === 0 ? (
          <div className="text-center py-12">
            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-3">
              <Calendar className="w-8 h-8 text-gray-400" />
            </div>
            <p className="text-gray-500 text-sm">No meetings yet</p>
          </div>
        ) : (
          meetings.map((meeting, index) => {
            const displayName = meeting.title || meeting.name || `Meeting ${index + 1}`;
            const dateStr = meeting.date || meeting.meeting_date || meeting.created;
            const safeDate = formatDate(dateStr);
            
            const displayTime = meeting.time || meeting.meeting_time || 'Time TBD';
            const duration = meeting.duration || meeting.duration_minutes ? `${meeting.duration || meeting.duration_minutes} min` : '';
            const officerNames = getOfficerNames(meeting);

            return (
              <div
                key={meeting.id || index}
                className="flex flex-col gap-3 p-4 rounded-lg border border-gray-100 hover:border-blue-200 hover:bg-blue-50/30 transition-all cursor-pointer group"
              >
                {/* Top Row: Date & Title */}
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 bg-blue-50 rounded-lg flex flex-col items-center justify-center border border-blue-100 flex-shrink-0">
                    <span className="text-xs font-semibold text-blue-600 uppercase">
                      {safeDate.month}
                    </span>
                    <span className="text-lg font-bold text-blue-700">
                      {safeDate.day}
                    </span>
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-gray-900 truncate group-hover:text-blue-700 transition-colors">
                      {displayName}
                    </h3>
                    <p className="text-xs text-gray-500 mt-0.5 flex items-center gap-2 flex-wrap">
                      <span>{safeDate.full}</span>
                      <span>•</span>
                      <span>{displayTime}</span>
                      {duration && (
                        <>
                          <span>•</span>
                          <span>{duration}</span>
                        </>
                      )}
                    </p>
                  </div>
                </div>

                {/* Bottom Row: Officers/Attendees Info */}
                <div className="pl-16 flex items-start gap-2">
                  <Users className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
                  <div className="flex-1">
                    <p className="text-xs font-medium text-gray-700 mb-1">Attendees:</p>
                    <p className="text-xs text-gray-600 line-clamp-2">
                      {officerNames}
                    </p>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}