'use client';

/* ================================================================
   ParticipantHistory — everything about one officer / employee:
   meetings count, last met, next meeting and the full meeting
   history. Opened by clicking a participant's name.
   v2: action items removed (no more @/lib/meetingActions).
================================================================ */

import { useEffect, useMemo } from 'react';
import { X, User, CalendarDays, CalendarClock, History, Plus, ChevronRight, Phone, Mail } from 'lucide-react';

const pad = (n: number) => String(n).padStart(2, '0');
const DOT: Record<string, string> = {
  scheduled: 'bg-violet-500', completed: 'bg-emerald-500', cancelled: 'bg-rose-400', rescheduled: 'bg-amber-400',
};

function startOf(m: any): Date | null {
  const iso = String(m?.meeting_date || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const [y, mo, d] = iso.split('-').map(Number);
  const t = /^(\d{1,2}):(\d{2})/.exec(String(m?.meeting_time || ''));
  return new Date(y, mo - 1, d, t ? Number(t[1]) : 0, t ? Number(t[2]) : 0);
}

const fmt = (d: Date) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
const fmtTime = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

export function isSameParticipant(m: any, person: { id?: string; name?: string }) {
  if (person.id && m.officer_id && m.officer_id === person.id) return true;
  const a = String(m.officer_name || '').trim().toLowerCase();
  const b = String(person.name || '').trim().toLowerCase();
  return !!a && a === b;
}

export default function ParticipantHistory({ person, meetings, onClose, onOpenMeeting, onScheduleWith }: {
  person: { id?: string; name: string };
  meetings: any[];
  onClose: () => void;
  onOpenMeeting: (m: any) => void;
  onScheduleWith: (lastMeeting: any) => void;
}) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  const now = new Date();
  const theirs = useMemo(() => meetings
    .filter((m) => isSameParticipant(m, person))
    .map((m) => ({ m, at: startOf(m), status: String(m.status || 'Scheduled').toLowerCase() }))
    .sort((a, b) => (b.at?.getTime() || 0) - (a.at?.getTime() || 0)),
  [meetings, person]);

  const past = theirs.filter((x) => x.at && x.at <= now && x.status !== 'cancelled');
  const upcoming = theirs.filter((x) => x.at && x.at > now && x.status !== 'cancelled' && x.status !== 'completed')
    .sort((a, b) => a.at!.getTime() - b.at!.getTime());
  const completed = theirs.filter((x) => x.status === 'completed').length;
  const latest = theirs[0]?.m;
  const contact = latest ? { phone: latest.contact_number, email: latest.email, designation: latest.designation } : null;

  const initials = person.name.split(' ').map((w) => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();

  return (
    <div className="fixed inset-0 z-[55]">
      <div className="anim-overlay absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose} />
      <aside className="anim-panel nice-scroll absolute right-0 top-0 flex h-full w-full flex-col overflow-y-auto bg-white shadow-2xl sm:max-w-lg">
        <div className="h-1.5 w-full bg-gradient-to-r from-violet-500 via-indigo-500 to-sky-500" />

        {/* header */}
        <div className="border-b border-slate-100 px-5 py-4">
          <div className="flex items-start gap-3">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500 to-indigo-600 text-base font-bold text-white shadow-md shadow-violet-500/20">
              {initials || <User className="h-5 w-5" />}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Participant history</p>
              <h2 className="truncate text-lg font-bold text-slate-900">{person.name}</h2>
              {contact?.designation && <p className="truncate text-xs text-slate-500">{contact.designation}</p>}
            </div>
            <button onClick={onClose} aria-label="Close"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-slate-200 text-slate-400 transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-500">
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            {latest && (
              <button onClick={() => onScheduleWith(latest)}
                className="inline-flex items-center gap-1.5 rounded-full bg-slate-900 px-4 py-2 text-xs font-semibold text-white shadow-md shadow-slate-900/10 transition hover:-translate-y-0.5 hover:bg-slate-800">
                <Plus className="h-3.5 w-3.5" /> Schedule another meeting
              </button>
            )}
            {contact?.phone && (
              <a href={`tel:${String(contact.phone).replace(/\s+/g, '')}`}
                className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 px-3.5 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50">
                <Phone className="h-3.5 w-3.5" /> Call
              </a>
            )}
            {contact?.email && (
              <a href={`mailto:${contact.email}`}
                className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 px-3.5 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50">
                <Mail className="h-3.5 w-3.5" /> Email
              </a>
            )}
          </div>
        </div>

        <div className="space-y-4 px-5 py-5">
          {/* stats */}
          <div className="grid grid-cols-3 gap-2">
            <Stat label="Meetings" value={String(theirs.length)} sub={`${completed} completed`} />
            <Stat label="Last met" value={past[0]?.at ? fmt(past[0].at) : '—'} sub={past[0]?.at ? daysAgo(past[0].at, now) : 'Not yet'} />
            <Stat label="Next" value={upcoming[0]?.at ? fmt(upcoming[0].at) : '—'} sub={upcoming[0]?.at ? fmtTime(upcoming[0].at) : 'Nothing booked'} />
          </div>

          {/* history */}
          <Section icon={History} tint="bg-violet-50 text-violet-600" title="All meetings" count={theirs.length}>
            {theirs.length === 0 ? (
              <p className="text-xs text-slate-400">No meetings yet.</p>
            ) : (
              <ol className="relative space-y-1 border-l border-slate-100 pl-4">
                {theirs.map(({ m, at, status }) => (
                  <li key={m.id} className="relative">
                    <span className={`absolute -left-[21px] top-3 h-2.5 w-2.5 rounded-full ring-4 ring-white ${DOT[status] || 'bg-slate-300'}`} />
                    <button onClick={() => onOpenMeeting(m)} className="group flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left hover:bg-slate-50">
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-1.5">
                          <span className="truncate text-sm font-semibold text-slate-800 group-hover:text-violet-700">{m.agenda || 'Meeting'}</span>
                          {String(m.minutes || '').trim() && (
                            <span className="shrink-0 rounded-full bg-violet-50 px-1.5 py-0.5 text-[9px] font-bold text-violet-700 ring-1 ring-inset ring-violet-500/20">MoM</span>
                          )}
                        </span>
                        <span className="flex items-center gap-1 text-[11px] text-slate-400">
                          {at && at > now ? <CalendarClock className="h-3 w-3" /> : <CalendarDays className="h-3 w-3" />}
                          {at ? `${fmt(at)} · ${fmtTime(at)}` : '—'} · <span className="capitalize">{status}</span>
                        </span>
                      </span>
                      <ChevronRight className="h-4 w-4 text-slate-300 group-hover:text-violet-500" />
                    </button>
                  </li>
                ))}
              </ol>
            )}
          </Section>
        </div>
      </aside>
    </div>
  );
}

function daysAgo(d: Date, now: Date) {
  const days = Math.floor((now.getTime() - d.getTime()) / 86_400_000);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 30) return `${days} days ago`;
  const months = Math.floor(days / 30);
  return months < 12 ? `${months} month${months > 1 ? 's' : ''} ago` : `${Math.floor(months / 12)} yr ago`;
}

function Stat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded-2xl bg-slate-50 px-3 py-2.5 ring-1 ring-slate-100">
      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{label}</p>
      <p className="mt-0.5 truncate text-sm font-bold text-slate-900">{value}</p>
      <p className="truncate text-[11px] text-slate-400">{sub}</p>
    </div>
  );
}

function Section({ icon: Icon, tint, title, count, children }: {
  icon: any; tint: string; title: string; count: number; children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white p-4">
      <div className="mb-2.5 flex items-center gap-2">
        <span className={`flex h-7 w-7 items-center justify-center rounded-lg ${tint}`}><Icon className="h-3.5 w-3.5" /></span>
        <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">{title}</p>
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold tabular-nums text-slate-500">{count}</span>
      </div>
      {children}
    </div>
  );
}
