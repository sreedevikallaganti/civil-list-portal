import Link from 'next/link';
import { Calendar, Users, Shield, Clock, TrendingUp } from 'lucide-react';

interface StatsCardProps {
  title: string;
  value: number | string;
  subtitle: string;
  icon: React.ReactNode;
  trend?: string;
  href?: string;
}

function StatsCard({ title, value, subtitle, icon, trend, href }: StatsCardProps) {
  const Card = href ? Link : 'div';
  
  return (
    <Card 
      href={href || '#'}
      className="bg-white rounded-xl p-6 border border-gray-200 hover:shadow-md hover:border-blue-300 transition-all group cursor-pointer"
    >
      <div className="flex items-start justify-between mb-4">
        <div className="w-12 h-12 bg-blue-50 rounded-lg flex items-center justify-center group-hover:bg-blue-100 transition-colors">
          {icon}
        </div>
        {trend && (
          <div className="flex items-center gap-1 px-2 py-1 bg-green-50 rounded-lg">
            <TrendingUp className="w-3 h-3 text-green-600" />
            <span className="text-xs font-semibold text-green-600">{trend}</span>
          </div>
        )}
      </div>
      
      <div className="space-y-1">
        <p className="text-3xl font-bold text-gray-900">{value}</p>
        <p className="text-sm font-medium text-gray-900">{title}</p>
        <p className="text-xs text-gray-500">{subtitle}</p>
      </div>
    </Card>
  );
}

interface StatsCardsProps {
  totalMeetings: number;
  iasOfficers: number;
  ipsOfficers: number;
  todayMeetings: number;
}

export default function StatsCards({ 
  totalMeetings, 
  iasOfficers, 
  ipsOfficers, 
  todayMeetings 
}: StatsCardsProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
      <StatsCard
        title="Total Meetings"
        value={totalMeetings}
        subtitle="All time meetings"
        icon={<Calendar className="w-6 h-6 text-blue-600" />}
        trend="+12%"
        href="/meetings"
      />
      <StatsCard
        title="IAS Officers"
        value={iasOfficers}
        subtitle="Administrative Service"
        icon={<Users className="w-6 h-6 text-blue-600" />}
        href="/officers"
      />
      <StatsCard
        title="IPS Officers"
        value={ipsOfficers}
        subtitle="Police Service"
        icon={<Shield className="w-6 h-6 text-blue-600" />}
        href="/officers"
      />
      <StatsCard
        title="Today's Meetings"
        value={todayMeetings}
        subtitle="Scheduled today"
        icon={<Clock className="w-6 h-6 text-blue-600" />}
        href="/calendar"
      />
    </div>
  );
}