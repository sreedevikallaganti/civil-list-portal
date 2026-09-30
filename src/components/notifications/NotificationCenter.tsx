'use client';

/* Notification centre — one provider (in AppShell) loads meetings + today's
   directory records once, keeps them live, and computes notifications;
   <NotificationBell /> can be placed anywhere (sidebar, mobile header). */

import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode,
} from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Bell, BellRing, CalendarClock, CalendarDays, Plane, ListChecks, AlertTriangle, FileText,
  Cake, ArrowRightLeft, X, CheckCheck, UserPlus,
} from 'lucide-react';
import pb from '@/lib/pocketbase';
import { useAuth } from '@/contexts/AuthContext';
import { useLivePeople } from '@/lib/liveDirectory';
import { buildNotifications, type AppNotification, type NotificationKind } from '@/lib/notifications';
import { metBeforeFor, scheduleHref } from '@/lib/trips';

/* ─────────────────────────── state ─────────────────────────── */

type Store = { read: string[]; dismissed: string[] };
type Ctx = {
  items: AppNotification[];
  unread: number;
  isRead: (id: string) => boolean;
  markRead: (ids: string[]) => void;
  dismiss: (id: string) => void;
  meetings: any[];
};
const NotificationsContext = createContext<Ctx | null>(null);

const KEEP = 400;
const load = (key: string): Store => {
  try { return { read: [], dismissed: [], ...JSON.parse(localStorage.getItem(key) || '{}') }; }
  catch { return { read: [], dismissed: [] }; }
};
const save = (key: string, s: Store) => {
  try { localStorage.setItem(key, JSON.stringify({ read: s.read.slice(-KEEP), dismissed: s.dismissed.slice(-KEEP) })); }
  catch { /* private window / storage blocked — state just won't persist */ }
};

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const storeKey = `civillist:notifications:${user?.id || 'anon'}`;
  const [meetings, setMeetings] = useState<any[]>([]);
  const [store, setStore] = useState<Store>({ read: [], dismissed: [] });
  const [now, setNow] = useState(() => new Date());

  useEffect(() => { setStore(load(storeKey)); }, [storeKey]);

  /* meetings — loaded once, then kept live */
  useEffect(() => {
    if (!user) return;
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let unsub: (() => void) | null = null;
    const refresh = () =>
      pb.collection('meetings').getFullList({ requestKey: null })
        .then((rows) => alive && setMeetings(rows.filter((m: any) => !m.deleted)))
        .catch(() => { /* offline — keep what we have */ });
    refresh();
    pb.collection('meetings')
      .subscribe('*', () => { if (timer) clearTimeout(timer); timer = setTimeout(refresh, 500); })
      .then((fn) => { if (alive) unsub = fn; else fn(); })
      .catch(() => {});
    return () => { alive = false; if (timer) clearTimeout(timer); unsub?.(); };
  }, [user]);

  /* time-based items ("starting in 10 min") need a clock */
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  const { people } = useLivePeople(meetings);
  const all = useMemo(() => buildNotifications(meetings, people, now), [meetings, people, now]);
  const items = useMemo(() => all.filter((n) => !store.dismissed.includes(n.id)), [all, store.dismissed]);

  const update = useCallback((fn: (s: Store) => Store) => {
    setStore((prev) => { const next = fn(prev); save(storeKey, next); return next; });
  }, [storeKey]);

  const value: Ctx = {
    items,
    unread: items.filter((n) => !store.read.includes(n.id)).length,
    isRead: (id) => store.read.includes(id),
    markRead: (ids) => update((s) => ({ ...s, read: [...new Set([...s.read, ...ids])] })),
    dismiss: (id) => update((s) => ({ read: [...s.read, id], dismissed: [...new Set([...s.dismissed, id])] })),
    meetings,
  };

  return <NotificationsContext.Provider value={value}>{children}</NotificationsContext.Provider>;
}

export const useNotifications = () => useContext(NotificationsContext);

/* ─────────────────────────── UI ─────────────────────────── */

const KIND: Record<NotificationKind, { icon: typeof Bell; tint: string; label: string }> = {
  starting: { icon: BellRing,       tint: 'bg-rose-50 text-rose-600',       label: 'Starting soon' },
  today:    { icon: CalendarClock,  tint: 'bg-violet-50 text-violet-600',   label: 'Today' },
  trip:     { icon: Plane,          tint: 'bg-sky-50 text-sky-600',         label: 'Upcoming visit' },
  followup: { icon: ListChecks,     tint: 'bg-amber-50 text-amber-600',     label: 'Follow-up' },
  occasion: { icon: Cake,           tint: 'bg-fuchsia-50 text-fuchsia-600', label: 'Occasion' },
  posting:  { icon: ArrowRightLeft, tint: 'bg-amber-50 text-amber-700',     label: 'New posting' },
  overdue:  { icon: AlertTriangle,  tint: 'bg-rose-50 text-rose-600',       label: 'Needs a status' },
  minutes:  { icon: FileText,       tint: 'bg-emerald-50 text-emerald-600', label: 'Minutes' },
};

export function NotificationBell({ className = '' }: { className?: string }) {
  const ctx = useNotifications();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!panelRef.current?.contains(t) && !btnRef.current?.contains(t)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); window.removeEventListener('keydown', onKey); };
  }, [open]);

  if (!ctx) return null;
  const { items, unread, isRead, markRead, dismiss, meetings } = ctx;

  const go = (n: AppNotification, href = n.href) => {
    markRead([n.id]);
    setOpen(false);
    router.push(href);
  };

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={unread ? `Notifications, ${unread} unread` : 'Notifications'}
        aria-expanded={open}
        className={`relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 transition-colors hover:border-violet-200 hover:text-violet-600 ${className}`}
      >
        <Bell className="h-[18px] w-[18px]" />
        {unread > 0 && (
          <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white ring-2 ring-white">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div
          ref={panelRef}
          role="dialog"
          aria-label="Notifications"
          className="anim-scale-in fixed inset-x-3 top-16 z-[70] flex max-h-[min(80vh,640px)] flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl shadow-slate-900/15 lg:left-[16.5rem] lg:right-auto lg:top-4 lg:w-[26rem]"
        >
          <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
            <div>
              <p className="text-sm font-bold text-slate-900">Notifications</p>
              <p className="text-[11px] text-slate-400">{unread ? `${unread} new` : 'You’re all caught up'}</p>
            </div>
            {unread > 0 && (
              <button onClick={() => markRead(items.map((n) => n.id))}
                className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold text-violet-600 hover:bg-violet-50">
                <CheckCheck className="h-3.5 w-3.5" /> Mark all read
              </button>
            )}
          </div>

          <ul className="nice-scroll flex-1 divide-y divide-slate-100 overflow-y-auto">
            {items.length === 0 && (
              <li className="px-6 py-12 text-center">
                <CalendarDays className="mx-auto h-8 w-8 text-slate-300" />
                <p className="mt-3 text-sm font-semibold text-slate-700">Nothing needs your attention</p>
                <p className="mt-1 text-xs text-slate-400">Meeting reminders, visits, follow-ups and birthdays will show up here.</p>
              </li>
            )}
            {items.map((n) => {
              const k = KIND[n.kind];
              const Icon = k.icon;
              const unreadItem = !isRead(n.id);
              const suggestions = n.trip ? metBeforeFor(n.trip, meetings).slice(0, 3) : [];
              return (
                <li key={n.id} className={`group relative px-5 py-3.5 ${unreadItem ? 'bg-violet-50/40' : ''}`}>
                  <div className="flex gap-3">
                    <span className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${k.tint}`}><Icon className="h-4 w-4" /></span>
                    <button type="button" onClick={() => go(n)} className="min-w-0 flex-1 text-left">
                      <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                        {k.label}
                        {n.urgent && <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />}
                      </span>
                      <span className={`mt-0.5 block text-sm ${unreadItem ? 'font-bold text-slate-900' : 'font-semibold text-slate-700'}`}>{n.title}</span>
                      <span className="mt-0.5 block text-xs leading-relaxed text-slate-500">{n.body}</span>
                    </button>
                    <button type="button" onClick={() => dismiss(n.id)} aria-label="Dismiss"
                      className="h-7 w-7 shrink-0 rounded-full text-slate-300 opacity-100 transition hover:bg-slate-100 hover:text-slate-600 sm:opacity-0 sm:group-hover:opacity-100">
                      <X className="mx-auto h-3.5 w-3.5" />
                    </button>
                  </div>

                  {n.trip && suggestions.length > 0 && (
                    <div className="ml-12 mt-2.5 space-y-1.5">
                      {suggestions.map((p) => (
                        <div key={p.key} className="flex items-center gap-2 rounded-xl bg-white px-3 py-2 ring-1 ring-slate-100">
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-xs font-semibold text-slate-800">{p.name}</span>
                            <span className="block truncate text-[11px] text-slate-400">
                              Met {p.timesMet}× here{p.followUpOverdue ? ' · follow-up overdue' : p.pendingFollowUp ? ' · follow-up pending' : ''}
                            </span>
                          </span>
                          <Link href={scheduleHref(n.trip!, { meetingId: p.lastMeeting?.id })} onClick={() => { markRead([n.id]); setOpen(false); }}
                            className="inline-flex shrink-0 items-center gap-1 rounded-full bg-slate-900 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-slate-800">
                            <UserPlus className="h-3 w-3" /> Schedule
                          </Link>
                        </div>
                      ))}
                      <button type="button" onClick={() => go(n)} className="text-[11px] font-semibold text-violet-600 hover:underline">
                        All suggestions for {n.trip.label} →
                      </button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </>
  );
}
