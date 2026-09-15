'use client';

import { Calendar, RefreshCw, User } from 'lucide-react';

const parsePBDate = (raw?: string): Date | null => {
  if (!raw) return null;
  const d = new Date(String(raw).replace(' ', 'T'));
  return isNaN(d.getTime()) ? null : d;
};

export const formatPBDateTime = (raw?: string) => {
  const d = parsePBDate(raw);
  if (!d) return '';
  return d.toLocaleString('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: 'numeric', minute: '2-digit', hour12: true,
  });
};

export const timeAgo = (raw?: string) => {
  const d = parsePBDate(raw);
  if (!d) return '';
  const s = Math.floor((Date.now() - d.getTime()) / 1000);
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} hr${h > 1 ? 's' : ''} ago`;
  const days = Math.floor(h / 24);
  if (days < 30) return `${days} day${days > 1 ? 's' : ''} ago`;
  const mo = Math.floor(days / 30);
  return mo < 12 ? `${mo} month${mo > 1 ? 's' : ''} ago` : `${Math.floor(days / 365)} yr ago`;
};

export default function MeetingMetaRow({ meeting }: { meeting?: any }) {
  if (!meeting) return null;

  const rows = [
    meeting.created && { icon: Calendar, label: 'Created on', value: formatPBDateTime(meeting.created), hint: timeAgo(meeting.created) },
    meeting.updated && { icon: RefreshCw, label: 'Last updated on', value: formatPBDateTime(meeting.updated), hint: timeAgo(meeting.updated) },
    meeting.created_by && { icon: User, label: 'By', value: String(meeting.created_by) },
  ].filter(Boolean) as { icon: any; label: string; value: string; hint?: string }[];

  if (rows.length === 0) return null;

  return (
    <div className="rounded-xl ring-1 ring-slate-200 bg-slate-50/60 p-3 space-y-2">
      {rows.map((r) => (
        <div key={r.label} className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-white ring-1 ring-slate-200 text-slate-500 flex items-center justify-center shrink-0">
            <r.icon className="w-3.5 h-3.5" />
          </div>
          <p className="text-xs text-slate-500 min-w-0">
            <span className="font-semibold text-slate-600">{r.label}</span>{' '}
            <span className="tabular-nums text-slate-800">{r.value}</span>
            {r.hint && <span className="text-slate-400"> · {r.hint}</span>}
          </p>
        </div>
      ))}
    </div>
  );
}