import { Meeting } from '@/types/meeting';

interface MeetingListItemProps {
  meeting: Meeting;
}

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  });
}

function getInitials(name: string): string {
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
}

function getTypeColor(type: string): string {
  switch (type) {
    case 'IAS': return 'bg-purple-100 text-purple-700';
    case 'IPS': return 'bg-blue-100 text-blue-700';
    case 'Other': return 'bg-gray-100 text-gray-700';
    default: return 'bg-gray-100 text-gray-700';
  }
}

function getAvatarGradient(name: string): string {
  const gradients = [
    'from-blue-400 to-blue-600',
    'from-purple-400 to-purple-600',
    'from-green-400 to-green-600',
    'from-orange-400 to-orange-600',
    'from-pink-400 to-pink-600',
    'from-indigo-400 to-indigo-600',
  ];
  const index = name.charCodeAt(0) % gradients.length;
  return gradients[index];
}

export default function MeetingListItem({ meeting }: MeetingListItemProps) {
  return (
    <div className="flex items-center justify-between p-4 hover:bg-gray-50 rounded-xl transition-colors group">
      <div className="flex items-center space-x-4 flex-1">
        <div className={`w-12 h-12 rounded-full bg-gradient-to-br ${getAvatarGradient(meeting.officer_name)} flex items-center justify-center text-white font-semibold shadow-md`}>
          {getInitials(meeting.officer_name)}
        </div>

        
        <div className="flex-1">
          <h4 className="font-semibold text-gray-800">{meeting.officer_name}</h4>
          <div className="flex items-center space-x-2 mt-1">
            <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${getTypeColor(meeting.officer_type)}`}>
              {meeting.officer_type}
            </span>
            {meeting.designation && (
              <span className="text-xs text-gray-500">{meeting.designation}</span>
            )}
          </div>
        </div>
      </div>

      <div className="flex items-center space-x-6">
        <div className="text-right">
          <p className="text-sm font-medium text-gray-800">{formatDate(meeting.meeting_date)}</p>
          <p className="text-xs text-gray-500">{meeting.meeting_time}</p>
        </div>
        
        {meeting.duration && (
          <div className="text-right">
            <p className="text-sm font-medium text-gray-800">{meeting.duration} min</p>
            <p className="text-xs text-gray-500">Duration</p>
          </div>
        )}

        <button className="opacity-0 group-hover:opacity-100 p-2 hover:bg-gray-100 rounded-lg transition-all">
          →
        </button>
      </div>
    </div>
  );
}