'use client';

/* SavedViews — one-click filter presets above the meetings list, plus the person's own
   saved combinations (kept in this browser). A view = search + status + type + priority +
   sort + "when" (a date / follow-up condition the plain filters can't express). */

import { useEffect, useMemo, useState } from 'react';
import { Bookmark, BookmarkPlus, Check, X } from 'lucide-react';
import { readPref } from '@/lib/preferences';
import { showToast } from '@/components/Toaster';

export type When = 'all' | 'today' | 'week' | 'upcoming' | 'past' | 'needs-status' | 'followups' | 'no-minutes';

export const WHEN_OPTIONS: { value: When; label: string }[] = [
  { value: 'all', label: 'Any date' },
  { value: 'today', label: 'Today' },
  { value: 'week', label: 'This week' },
  { value: 'upcoming', label: 'Upcoming' },
  { value: 'past', label: 'Past' },
  { value: 'needs-status', label: 'Needs a status' },
  { value: 'followups', label: 'Follow-ups due' },
  { value: 'no-minutes', label: 'No minutes yet' },
];

export type ViewFilters = { search: string; status: string; type: string; priority: string; sort: string; when: When };
export type SavedView = ViewFilters & { id: string; name: string; builtIn?: boolean; hint?: string };

const KEY = 'civillist:meeting-views';
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const statusOf = (m: any) => String(m?.status || 'scheduled').toLowerCase();
const isOpen = (m: any) => !/complete|done|cancel|reject/.test(statusOf(m));

/** Does a meeting fall in the "when" condition? */
export function matchesWhen(m: any, when: When, now = new Date()): boolean {
  if (when === 'all') return true;
  const today = iso(now);
  const day = String(m?.meeting_date || '').slice(0, 10);
  switch (when) {
    case 'today': return day === today;
    case 'week': {
      const mon = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7));
      const sun = new Date(mon.getFullYear(), mon.getMonth(), mon.getDate() + 6);
      return !!day && day >= iso(mon) && day <= iso(sun);
    }
    case 'upcoming': return !!day && day >= today && isOpen(m);
    case 'past': return !!day && day < today;
    case 'needs-status': return !!day && day < today && statusOf(m).trim() === 'scheduled';
    case 'followups': {
      const fu = String(m?.follow_up_date || '').slice(0, 10);
      const soon = iso(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 7));
      return /^\d{4}-\d{2}-\d{2}$/.test(fu) && fu <= soon && !/cancel|reject/.test(statusOf(m));
    }
    case 'no-minutes': return /complete/.test(statusOf(m)) && !String(m?.minutes || '').trim();
  }
}

const ALL: ViewFilters = { search: '', status: 'all', type: 'all', priority: 'all', sort: '', when: 'all' };

/** Ready-made views (sort '' = the page's default sort). */
export const BUILT_IN_VIEWS: SavedView[] = [
  { ...ALL, id: 'all', name: 'All meetings', builtIn: true, hint: 'Clear every filter' },
  { ...ALL, id: 'today', name: 'Today', when: 'today', sort: 'time-asc', builtIn: true, hint: 'Today’s meetings, earliest first' },
  { ...ALL, id: 'week', name: 'This week', when: 'week', sort: 'date-asc', builtIn: true, hint: 'Monday to Sunday of this week' },
  { ...ALL, id: 'upcoming', name: 'Upcoming', when: 'upcoming', sort: 'date-asc', builtIn: true, hint: 'From today on, not completed or cancelled' },
  { ...ALL, id: 'needs-status', name: 'Needs a status', when: 'needs-status', sort: 'date-desc', builtIn: true, hint: 'Past meetings still marked Scheduled' },
  { ...ALL, id: 'followups', name: 'Follow-ups due', when: 'followups', sort: 'date-desc', builtIn: true, hint: 'Follow-up date overdue or within 7 days' },
  { ...ALL, id: 'no-minutes', name: 'No minutes yet', when: 'no-minutes', sort: 'date-desc', builtIn: true, hint: 'Completed, but minutes not recorded' },
  { ...ALL, id: 'high', name: 'High priority', priority: 'high', when: 'upcoming', sort: 'date-asc', builtIn: true, hint: 'Upcoming high-priority meetings' },
];

function readSaved(): SavedView[] {
  try {
    const list = JSON.parse(readPref(KEY) || '[]');
    return Array.isArray(list) ? list.filter((v) => v && v.id && v.name) : [];
  } catch {
    return [];
  }
}
function writeSaved(list: SavedView[]) {
  try { localStorage.setItem(KEY, JSON.stringify(list)); } catch { /* storage blocked */ }
}

type Props = {
  current: ViewFilters;
  defaultSort: string;
  onApply: (v: ViewFilters) => void;
  /** returns how many meetings a view would show (for the count badges) */
  countFor: (v: ViewFilters) => number;
};

export default function SavedViews({ current, defaultSort, onApply, countFor }: Props) {
  const [saved, setSaved] = useState<SavedView[]>([]);
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState('');
  useEffect(() => setSaved(readSaved()), []); // after mount — the server has no localStorage

  const norm = (v: ViewFilters): ViewFilters => ({ ...v, sort: v.sort || defaultSort, search: v.search.trim().toLowerCase() });
  const same = (a: ViewFilters, b: ViewFilters) => JSON.stringify(norm(a)) === JSON.stringify(norm(b));
  const views = useMemo(() => [...BUILT_IN_VIEWS, ...saved], [saved]);
  const activeId = views.find((v) => same(v, current))?.id ?? null;
  const isCustomState = !activeId;

  const apply = (v: SavedView) => onApply({ search: v.search, status: v.status, type: v.type, priority: v.priority, sort: v.sort || defaultSort, when: v.when });

  const save = () => {
    const n = name.trim();
    if (!n) return;
    if (views.some((v) => v.name.toLowerCase() === n.toLowerCase())) { showToast('A view with that name already exists.', 'error'); return; }
    const next = [...saved, { ...current, id: `v${Date.now()}`, name: n.slice(0, 40) }];
    setSaved(next);
    writeSaved(next);
    setNaming(false);
    setName('');
    showToast(`Saved view “${n}”`, 'success');
  };

  const remove = (id: string) => {
    const v = saved.find((x) => x.id === id);
    const next = saved.filter((x) => x.id !== id);
    setSaved(next);
    writeSaved(next);
    if (v) showToast(`Removed view “${v.name}”`, 'success');
  };

  return (
    <div className="flex flex-wrap items-center gap-1.5 border-t border-slate-100 pt-3">
      <span className="mr-1 inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider text-slate-400">
        <Bookmark className="h-3.5 w-3.5" /> Views
      </span>
      {views.map((v) => {
        const on = v.id === activeId;
        const n = countFor(v);
        return (
          <span key={v.id} className="group relative inline-flex">
            <button
              type="button"
              onClick={() => apply(v)}
              aria-pressed={on}
              data-tooltip={v.hint || 'Your saved view'}
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold ring-1 ring-inset transition-all active:scale-95 ${
                on ? 'bg-slate-900 text-white ring-slate-900' : v.builtIn ? 'bg-white text-slate-600 ring-slate-200 hover:ring-violet-300 hover:text-violet-700' : 'bg-violet-50 text-violet-700 ring-violet-200 hover:ring-violet-400'
              } ${!v.builtIn ? 'pr-7' : ''}`}
            >
              {v.name}
              <span className={`rounded-full px-1.5 text-[10px] tabular-nums ${on ? 'bg-white/20' : 'bg-slate-100 text-slate-500'}`}>{n}</span>
            </button>
            {!v.builtIn && (
              <button type="button" onClick={() => remove(v.id)} aria-label={`Remove view ${v.name}`}
                className={`absolute right-1 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-full ${on ? 'text-white/70 hover:bg-white/20' : 'text-violet-400 hover:bg-violet-100 hover:text-violet-700'}`}>
                <X className="h-3 w-3" />
              </button>
            )}
          </span>
        );
      })}

      {naming ? (
        <form onSubmit={(e) => { e.preventDefault(); save(); }} className="inline-flex items-center gap-1">
          <input autoFocus value={name} onChange={(e) => setName(e.target.value)} maxLength={40}
            onKeyDown={(e) => { if (e.key === 'Escape') { setNaming(false); setName(''); } }}
            placeholder="Name this view" aria-label="View name"
            className="h-8 w-40 rounded-full border border-violet-300 bg-white px-3 text-xs text-slate-900 focus:outline-none focus:ring-4 focus:ring-violet-500/10" />
          <button type="submit" aria-label="Save view" className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-900 text-white"><Check className="h-3.5 w-3.5" /></button>
          <button type="button" aria-label="Cancel" onClick={() => { setNaming(false); setName(''); }} className="flex h-8 w-8 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100"><X className="h-3.5 w-3.5" /></button>
        </form>
      ) : (
        isCustomState && (
          <button type="button" onClick={() => setNaming(true)} data-tooltip="Keep the current filters as a one-click view"
            className="inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-semibold text-violet-600 hover:bg-violet-50">
            <BookmarkPlus className="h-3.5 w-3.5" /> Save current view
          </button>
        )
      )}
    </div>
  );
}
