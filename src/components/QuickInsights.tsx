import { TrendingUp, Calendar, Clock, Users } from 'lucide-react';

interface QuickInsightsProps {
  totalMeetings: number;
  todayMeetings: number;
  completedMeetings: number;
  completionRate: number;
  thisMonthMeetings: number;
  avgDuration: number;
  totalHours: number;
}

export default function QuickInsights({
  totalMeetings,
  todayMeetings,
  completedMeetings,
  completionRate,
  thisMonthMeetings,
  avgDuration,
  totalHours,
}: QuickInsightsProps) {
  return (
    <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-lg font-bold text-gray-900">Quick Insights</h3>
          <p className="text-sm text-gray-500 mt-1">Meeting analytics overview</p>
        </div>
        <TrendingUp className="w-5 h-5 text-gray-400" />
      </div>

      <div className="grid grid-cols-2 gap-4">
        {/* Completion Rate */}
        <div className="p-4 bg-gray-50 rounded-lg border border-gray-100">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 bg-emerald-100 rounded-lg flex items-center justify-center">
              <TrendingUp className="w-4 h-4 text-emerald-600" />
            </div>
          </div>
          <p className="text-2xl font-bold text-gray-900">{completionRate}%</p>
          <p className="text-sm text-gray-500 mt-1">Completion Rate</p>
        </div>

        {/* This Month */}
        <div className="p-4 bg-gray-50 rounded-lg border border-gray-100">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center">
              <Calendar className="w-4 h-4 text-blue-600" />
            </div>
          </div>
          <p className="text-2xl font-bold text-gray-900">{thisMonthMeetings}</p>
          <p className="text-sm text-gray-500 mt-1">This Month</p>
        </div>

        {/* Avg Duration */}
        <div className="p-4 bg-gray-50 rounded-lg border border-gray-100">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 bg-purple-100 rounded-lg flex items-center justify-center">
              <Clock className="w-4 h-4 text-purple-600" />
            </div>
          </div>
          <p className="text-2xl font-bold text-gray-900">{avgDuration} min</p>
          <p className="text-sm text-gray-500 mt-1">Avg Duration</p>
        </div>

        {/* Total Hours */}
        <div className="p-4 bg-gray-50 rounded-lg border border-gray-100">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 bg-orange-100 rounded-lg flex items-center justify-center">
              <Users className="w-4 h-4 text-orange-600" />
            </div>
          </div>
          <p className="text-2xl font-bold text-gray-900">{totalHours}h</p>
          <p className="text-sm text-gray-500 mt-1">Total Hours</p>
        </div>
      </div>
    </div>
  );
}