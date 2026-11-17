'use client';

/* CommandPalette — Ctrl/⌘+K (or "/") from the dashboard: search every meeting
   by title, person, designation or city, and jump to any page or action. */

import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { CalendarDays, CalendarHeart, CornerDownLeft, FileText, LayoutList, Plus, Search, Sparkles, Users } from 'lucide-react';
import { meetingStartsAt } from '@/lib/meetingRules';
import { useNow } from '@/lib/useNow';

type M = { id: string; meeting_date?: any; meeting_time?: any; [key: string]: any };
type Item = { id: string; group: 'Actions' | 'Meetings'; label: string; hint?: string; icon: ReactNode; run: () => void };

const title = (m: M) => m.title || m.meeting_title || m.subject || m.agenda || 'Untitled meeting';

export default function CommandPalette({
  open, onClose, meetings, onOpenMeeting, onCreate, goTo, initialQuery = '',
}: {
  initialQuery?: string; open: boolean; onClose: () => void; meetings: M[]; onOpenMeeting: (m: any) => void; onCreate: () => void; goTo: (path: string) => void;
}) {
  const [query, setQuery] = useState(initialQuery);
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);
  const now = useNow();

  const actions: Item[] = useMemo(() => [
    { id: 'a-new', group: 'Actions', label: 'New meeting', hint: 'N', icon: <Plus className="h-4 w-4" />, run: onCreate },
    { id: 'a-meetings', group: 'Actions', label: 'All meetings', icon: <LayoutList className="h-4 w-4" />, run: () => goTo('/meetings') },
    { id: 'a-calendar', group: 'Actions', label: 'Calendar', icon: <CalendarDays className="h-4 w-4" />, run: () => goTo('/calendar') },
    { id: 'a-occasions', group: 'Actions', label: 'Occasions — birthdays, retirements, special days', icon: <CalendarHeart className="h-4 w-4" />, run: () => goTo('/occasions') },
    // Meeting Map — hidden until the feature is confirmed
    //     { id: 'a-map', group: 'Actions', label: 'Meeting map — places visited', icon: <MapPinned className="h-4 w-4" />, run: () => goTo('/map') },
    { id: 'a-officers', group: 'Actions', label: 'Officers directory', icon: <Users className="h-4 w-4" />, run: () => goTo('/officers') },
    { id: 'a-reports', group: 'Actions', label: 'Reports', icon: <FileText className="h-4 w-4" />, run: () => goTo('/reports') },
    { id: 'a-recap', group: 'Actions', label: `Yearly recap ${new Date().getFullYear()}`, hint: 'R', icon: <Sparkles className="h-4 w-4" />, run: () => goTo('/recap') },
  ], [onCreate, goTo]);

  /* newest-first index of every meeting, built once per data change */
  const index = useMemo(() => meetings
    .map((m) => {
      const start = meetingStartsAt(m);
      return {
        m, start,
        text: [title(m), m.officer_name, m.designation, m.department, m.city, m.location, m.officer_type].filter(Boolean).join(' ').toLowerCase(),
      };
    })
    .sort((a, b) => (+(b.start ?? 0)) - (+(a.start ?? 0))), [meetings]);

  const items: Item[] = useMemo(() => {
    const words = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
    const acts = words.length ? actions.filter((a) => words.every((w) => a.label.toLowerCase().includes(w))) : actions;
    const found = words.length ? index.filter((x) => words.every((w) => x.text.includes(w))).slice(0, 8) : index.filter((x) => x.start && +x.start >= now).reverse().slice(0, 5);
    return [
      ...acts,
      ...found.map(({ m, start }) => ({
        id: m.id, group: 'Meetings' as const, label: title(m),
        hint: [m.officer_name, start?.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })].filter(Boolean).join(' · '),
        icon: <CalendarDays className="h-4 w-4" />,
        run: () => onOpenMeeting(m),
      })),
    ];
  }, [query, actions, index, onOpenMeeting, now]);

  useEffect(() => {
    listRef.current?.querySelector(`[data-idx="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  if (!open) return null;

  const run = (item?: Item) => {
    if (!item) return;
    onClose();
    setQuery('');
    item.run();
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((i) => Math.min(i + 1, items.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); run(items[active]); }
    else if (e.key === 'Escape') { e.preventDefault(); onClose(); }
  };

  let lastGroup = '';
  return (
    <div className="anim-fade-in fixed inset-0 z-[60] flex items-start justify-center bg-slate-900/40 px-4 pt-[12vh] backdrop-blur-sm" onMouseDown={onClose}>
      <div role="dialog" aria-modal="true" aria-label="Search and commands" onMouseDown={(e) => e.stopPropagation()}
        className="anim-scale-in w-full max-w-xl overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-slate-900/10">
        <div className="flex items-center gap-3 border-b border-slate-100 px-4">
          <Search className="h-4 w-4 shrink-0 text-slate-400" />
          <input autoFocus value={query} onChange={(e) => { setQuery(e.target.value); setActive(0); }} onKeyDown={onKeyDown}
            placeholder="Search meetings, people, cities… or type a command"
            className="h-14 w-full bg-transparent text-sm text-slate-900 placeholder-slate-400 focus:outline-none" />
          <kbd className="hidden shrink-0 rounded-md border border-slate-200 px-1.5 py-0.5 text-[10px] font-semibold text-slate-400 sm:inline">Esc</kbd>
        </div>

        <ul ref={listRef} className="nice-scroll max-h-[55vh] overflow-y-auto p-2">
          {items.length === 0 && <li className="px-3 py-10 text-center text-sm text-slate-400">Nothing matches “{query}”.</li>}
          {items.map((item, i) => {
            const header = item.group !== lastGroup
              ? (lastGroup = item.group, (
                <p className="px-3 pb-1 pt-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  {item.group === 'Meetings' && !query.trim() ? 'Coming up' : item.group}
                </p>))
              : null;
            return (
              <li key={item.id}>
                {header}
                <button type="button" data-idx={i} onMouseMove={() => setActive(i)} onClick={() => run(item)}
                  className={`flex w-full cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 text-left ${i === active ? 'bg-violet-50 text-violet-900' : 'text-slate-700'}`}>
                  <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${i === active ? 'bg-white text-violet-600 shadow-sm' : 'bg-slate-100 text-slate-500'}`}>{item.icon}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{item.label}</span>
                    {item.hint && item.group === 'Meetings' && <span className="block truncate text-[11px] text-slate-500">{item.hint}</span>}
                  </span>
                  {item.hint && item.group === 'Actions' && (
                    <kbd className="rounded-md border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] font-semibold text-slate-400">{item.hint}</kbd>
                  )}
                  {i === active && <CornerDownLeft className="h-3.5 w-3.5 shrink-0 text-violet-400" />}
                </button>
              </li>
            );
          })}
        </ul>

        <div className="flex items-center gap-4 border-t border-slate-100 bg-slate-50/70 px-4 py-2 text-[11px] text-slate-400">
          <span><kbd className="font-semibold">↑↓</kbd> navigate</span>
          <span><kbd className="font-semibold">Enter</kbd> open</span>
          <span><kbd className="font-semibold">Ctrl K</kbd> toggle</span>
        </div>
      </div>
    </div>
  );
}
