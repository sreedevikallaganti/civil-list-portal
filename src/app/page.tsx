'use client';

import { useEffect, useState } from 'react';
import { 
  Calendar, Users, Shield, Clock, TrendingUp, Search, Bell, 
  Target, Briefcase, CheckCircle2, Circle, MapPin, MoreHorizontal,
  ArrowUpRight, ArrowDownRight, Eye
} from 'lucide-react';
import pb from '@/lib/pocketbase';

export default function DashboardPage() {
  const [stats, setStats] = useState({
    totalMeetings: 0,
    iasOfficers: 0,
    ipsOfficers: 0,
    todayMeetings: 0,
    thisWeekMeetings: 0,
    completionRate: 0,
    scheduled: 0,
    completed: 0,
    rescheduled: 0,
    cancelled: 0,
    rejected: 0,
  });
  const [recentMeetings, setRecentMeetings] = useState<any[]>([]);
  const [upcomingTasks, setUpcomingTasks] = useState([
    { id: 1, title: 'Review MoM from last District Collector meeting', completed: true, time: 'Completed on Aug 30 at 4:23 PM' },
    { id: 2, title: 'Prepare agenda for IAS batch 2024 review', completed: true, time: 'Completed on Aug 30 at 2:15 PM' },
    { id: 3, title: 'Schedule quarterly review with Home Secretary', completed: false, time: null },
    { id: 4, title: 'Send invites for emergency cabinet meeting', completed: false, time: null },
  ]);

  useEffect(() => {
    loadDashboard();
  }, []);

  async function loadDashboard() {
    try {
      const [meetingsRes, iasRes, ipsRes] = await Promise.all([
        pb.collection('meetings').getList(1, 100, { sort: '-meeting_date' }),
        pb.collection('ias_officers').getList(1, 1, {}),
        pb.collection('ips_officers').getList(1, 1, {}),
      ]);

      const meetings = meetingsRes.items;
      const today = new Date().toISOString().split('T')[0];
      const todayMeetings = meetings.filter(m => m.meeting_date?.startsWith(today)).length;

      const statusCounts = {
        scheduled: meetings.filter(m => m.status?.toLowerCase() === 'scheduled').length,
        completed: meetings.filter(m => m.status?.toLowerCase() === 'completed').length,
        rescheduled: meetings.filter(m => m.status?.toLowerCase() === 'rescheduled').length,
        cancelled: meetings.filter(m => m.status?.toLowerCase() === 'cancelled').length,
        rejected: meetings.filter(m => m.status?.toLowerCase() === 'rejected').length,
      };

      const total = meetings.length || 1;
      const completionRate = Math.round((statusCounts.completed / total) * 100);

      setStats({
        totalMeetings: meetings.length,
        iasOfficers: iasRes.totalItems,
        ipsOfficers: ipsRes.totalItems,
        todayMeetings,
        thisWeekMeetings: meetings.length,
        completionRate,
        ...statusCounts,
      });

      setRecentMeetings(meetings.slice(0, 5));
    } catch (error) {
      console.error('Error loading dashboard:', error);
    }
  }

  // Donut chart data
  const chartData = [
    { label: 'Scheduled', value: stats.scheduled, color: '#3b82f6', percent: 0 },
    { label: 'Completed', value: stats.completed, color: '#10b981', percent: 0 },
    { label: 'Rescheduled', value: stats.rescheduled, color: '#f59e0b', percent: 0 },
    { label: 'Cancelled', value: stats.cancelled, color: '#ef4444', percent: 0 },
    { label: 'Rejected', value: stats.rejected, color: '#8b5cf6', percent: 0 },
  ];

  const totalChart = chartData.reduce((sum, item) => sum + item.value, 0);
  chartData.forEach(item => {
    item.percent = totalChart > 0 ? Math.round((item.value / totalChart) * 100) : 0;
  });

  const getStatusBadge = (status: string) => {
    const styles: Record<string, string> = {
      scheduled: 'bg-blue-100 text-blue-700',
      completed: 'bg-emerald-100 text-emerald-700',
      rescheduled: 'bg-amber-100 text-amber-700',
      cancelled: 'bg-red-100 text-red-700',
      rejected: 'bg-purple-100 text-purple-700',
    };
    return styles[status?.toLowerCase()] || 'bg-gray-100 text-gray-700';
  };

  const getOfficerType = (meeting: any) => {
    if (meeting.officer_type === 'IPS') return 'IPS';
    if (meeting.officer_type === 'IAS') return 'IAS';
    return 'Other';
  };

  const getOfficerTypeColor = (type: string) => {
    if (type === 'IAS') return 'bg-blue-100 text-blue-700';
    if (type === 'IPS') return 'bg-indigo-100 text-indigo-700';
    return 'bg-gray-100 text-gray-700';
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Top Header Bar */}
      <div className="bg-white border-b border-gray-200 px-8 py-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900">Overview</h1>
          <div className="flex items-center gap-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search jobs, careers, network, etc"
                className="pl-9 pr-4 py-2 w-80 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <button className="relative p-2 hover:bg-gray-100 rounded-lg">
              <Bell className="w-5 h-5 text-gray-600" />
              <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full"></span>
            </button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="p-8 max-w-[1600px] mx-auto">
        {/* Top Row: Goal + Careers + Jobs Donut */}
        <div className="grid grid-cols-12 gap-6 mb-6">
          
          {/* Goal Card */}
          <div className="col-span-12 lg:col-span-4 bg-white rounded-xl border border-gray-200 p-6">
            <div className="flex items-center gap-2 mb-3">
              <Target className="w-5 h-5 text-blue-600" />
              <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wide">Focus</h3>
            </div>
            <p className="text-xs text-gray-500 mb-2">Exploring</p>
            <h2 className="text-lg font-bold text-gray-900 mb-3">
              Senior Administrative roles in the Civil Service
            </h2>
            <div className="flex flex-wrap gap-2">
              <span className="px-3 py-1 bg-gray-900 text-white text-xs font-semibold rounded-md">
                {stats.totalMeetings} meetings
              </span>
              <span className="px-3 py-1 bg-gray-100 text-gray-700 text-xs font-semibold rounded-md flex items-center gap-1">
                <Briefcase className="w-3 h-3" /> IAS
              </span>
              <span className="px-3 py-1 bg-gray-100 text-gray-700 text-xs font-semibold rounded-md flex items-center gap-1">
                <Shield className="w-3 h-3" /> IPS
              </span>
            </div>
          </div>

          {/* Careers Card */}
          <div className="col-span-12 lg:col-span-3 bg-white rounded-xl border border-gray-200 p-6">
            <div className="flex items-center gap-2 mb-3">
              <Briefcase className="w-5 h-5 text-indigo-600" />
              <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wide">Officers</h3>
            </div>
            <div className="flex flex-wrap gap-2">
              <span className="px-3 py-1.5 border border-gray-200 rounded-lg text-xs font-medium text-gray-700 hover:bg-gray-50">
                IAS ({stats.iasOfficers})
              </span>
              <span className="px-3 py-1.5 border border-gray-200 rounded-lg text-xs font-medium text-gray-700 hover:bg-gray-50">
                IPS ({stats.ipsOfficers})
              </span>
              <span className="px-3 py-1.5 border border-gray-200 rounded-lg text-xs font-medium text-gray-700 hover:bg-gray-50">
                Civil Service
              </span>
              <span className="px-3 py-1.5 border border-gray-200 rounded-lg text-xs font-medium text-gray-700 hover:bg-gray-50">
                Administration
              </span>
            </div>
          </div>

          {/* Jobs Donut Chart */}
          <div className="col-span-12 lg:col-span-5 bg-white rounded-xl border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wide">Meetings</h3>
              <span className="text-xs text-blue-600 font-medium">This Week ↻</span>
            </div>
            <div className="flex items-center gap-6">
              {/* Donut Chart */}
              <div className="relative w-32 h-32 flex-shrink-0">
                <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
                  {chartData.reduce((acc, item, idx) => {
                    const circumference = 2 * Math.PI * 40;
                    const offset = circumference - (item.percent / 100) * circumference;
                    const rotation = chartData.slice(0, idx).reduce((sum, prev) => sum + (prev.percent / 100) * 360, 0);
                    acc.push(
                      <circle
                        key={item.label}
                        cx="50"
                        cy="50"
                        r="40"
                        fill="none"
                        stroke={item.color}
                        strokeWidth="12"
                        strokeDasharray={`${(item.percent / 100) * circumference} ${circumference}`}
                        strokeDashoffset={0}
                        transform={`rotate(${rotation} 50 50)`}
                        className="transition-all duration-500"
                      />
                    );
                    return acc;
                  }, [] as JSX.Element[])}
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-3xl font-bold text-gray-900">{totalChart}</span>
                  <span className="text-xs text-gray-500">Total</span>
                </div>
              </div>

              {/* Legend */}
              <div className="flex-1 grid grid-cols-2 gap-2">
                {chartData.map(item => (
                  <div key={item.label} className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: item.color }}></div>
                    <div>
                      <p className="text-sm font-bold text-gray-900">{item.percent}%</p>
                      <p className="text-xs text-gray-500">{item.label}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Middle Row: Roadmaps + Execution */}
        <div className="grid grid-cols-12 gap-6 mb-6">
          
          {/* Roadmaps / Tasks */}
          <div className="col-span-12 lg:col-span-7 bg-white rounded-xl border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wide">Roadmaps</h3>
                <p className="text-xs text-gray-500 mt-1">Professional Networking & Meeting Follow-ups</p>
              </div>
              <span className="text-xs font-semibold text-red-600 bg-red-50 px-2 py-1 rounded">3 Days left</span>
            </div>

            <div className="mb-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-gray-700">TASKS</span>
              </div>
              <div className="space-y-3">
                {upcomingTasks.map(task => (
                  <label key={task.id} className="flex items-start gap-3 cursor-pointer group">
                    <div className={`mt-0.5 w-5 h-5 rounded flex items-center justify-center flex-shrink-0 border-2 transition-colors ${
                      task.completed 
                        ? 'bg-blue-600 border-blue-600' 
                        : 'border-gray-300 group-hover:border-blue-400'
                    }`}>
                      {task.completed && <CheckCircle2 className="w-4 h-4 text-white" />}
                    </div>
                    <div className="flex-1">
                      <p className={`text-sm ${task.completed ? 'text-gray-500 line-through' : 'text-gray-900 font-medium'}`}>
                        {task.title}
                      </p>
                      {task.time && (
                        <p className="text-xs text-gray-400 mt-0.5">{task.time}</p>
                      )}
                    </div>
                  </label>
                ))}
              </div>
            </div>

            <button className="inline-flex items-center gap-1 text-sm font-semibold text-blue-600 hover:text-blue-700">
              View All Milestones <ArrowUpRight className="w-4 h-4" />
            </button>
          </div>

          {/* Execution */}
          <div className="col-span-12 lg:col-span-5 bg-white rounded-xl border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wide">Execution</h3>
              <span className="text-xs text-blue-600 font-medium">This Week ↻</span>
            </div>

            <div className="mb-6">
              <div className="flex items-baseline gap-2">
                <span className="text-5xl font-bold text-gray-900">{stats.completionRate}%</span>
                <span className="text-sm font-semibold text-emerald-600 flex items-center gap-1">
                  <ArrowUpRight className="w-4 h-4" /> +23% PAST 7 DAYS
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 border border-gray-200 rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <Calendar className="w-4 h-4 text-gray-400" />
                  <span className="text-xs font-semibold text-gray-500 uppercase">Meetings</span>
                </div>
                <p className="text-2xl font-bold text-gray-900">{stats.completed}/{stats.totalMeetings}</p>
              </div>
              <div className="p-4 border border-gray-200 rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <Users className="w-4 h-4 text-gray-400" />
                  <span className="text-xs font-semibold text-gray-500 uppercase">Officers</span>
                </div>
                <p className="text-2xl font-bold text-gray-900">{stats.iasOfficers + stats.ipsOfficers}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom Row: Recent Meetings Table */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200">
            <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wide">Recent Meetings</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase">#</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Reference</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Meeting Name</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Status</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Officer</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Last Update</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {recentMeetings.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-12 text-center text-gray-500">
                      <Calendar className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                      <p className="font-medium">No meetings yet</p>
                      <p className="text-sm">Schedule your first meeting to get started</p>
                    </td>
                  </tr>
                ) : (
                  recentMeetings.map((meeting, idx) => (
                    <tr key={meeting.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4 text-sm text-gray-600 font-mono">{idx + 1}</td>
                      <td className="px-6 py-4">
                        <span className="px-2 py-1 bg-gray-100 text-gray-700 text-xs font-semibold rounded">
                          {meeting.meeting_type || 'Meeting'}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <p className="text-sm font-medium text-gray-900">{meeting.agenda || meeting.title || 'Untitled'}</p>
                        {meeting.location && (
                          <p className="text-xs text-gray-500 flex items-center gap-1 mt-0.5">
                            <MapPin className="w-3 h-3" /> {meeting.location}
                          </p>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-full ${getStatusBadge(meeting.status)}`}>
                          <span className="w-1.5 h-1.5 rounded-full bg-current"></span>
                          {meeting.status || 'Scheduled'}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <div className={`w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold ${
                            getOfficerType(meeting) === 'IAS' ? 'bg-blue-600' : 'bg-indigo-600'
                          }`}>
                            {(meeting.officer_name || 'O').charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <p className="text-sm font-medium text-gray-900">{meeting.officer_name || 'Unassigned'}</p>
                            <span className={`inline-block px-1.5 py-0.5 text-[10px] font-semibold rounded ${getOfficerTypeColor(getOfficerType(meeting))}`}>
                              {getOfficerType(meeting)}
                            </span>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600">
                        {meeting.updated ? new Date(meeting.updated).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '-'}
                      </td>
                      <td className="px-6 py-4">
                        <button className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors">
                          <MoreHorizontal className="w-4 h-4 text-gray-500" />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}