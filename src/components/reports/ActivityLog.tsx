'use client';

import {
  forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState,
  type ReactNode,
} from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  Activity, CheckCircle2, ChevronDown, ChevronUp, Download, FileJson, FileText,
  History, List, Pencil, Plus, RefreshCw, Trash2, Zap,
} from 'lucide-react';
import pb from '@/lib/pocketbase';
import {
  ACTION_KEYS, DETAILS_KEYS, HIDDEN_KEYS, STATUS_KEYS, USER_KEYS,
  cx, downloadDataset, fetchAllRecords, fmtDateTime, humanize, Pill, EmptyState,
  FilterSelect, Pagination, SearchInput, sortRecords, statusBucket, statusTone, timeAgo,
  type ColumnDef, type RecordItem, type SortState,
} from '@/lib/reports-utils';

/* ── Public API ── */

export interface ActivityEntry {
  action: string;
  user?: string;
  status?: string;        // 'success' | 'failed' | 'pending' | anything
  details?: string;
}

export interface ActivityStats { count: number; recent: number; trend: number | null; }

export interface ActivityLogHandle {
  /** Store a new entry, then refresh the feed. Returns false if the write failed. */
  push: (entry: ActivityEntry) => Promise<boolean>;
  refresh: () => Promise<void>;
  /** Normalized rows for exporting from the parent page. */
  getRows: () => Record<string, any>[];
}

interface ActivityLogProps {
  onStats?: (s: ActivityStats) => void;
  title?: string;
  className?: string;
}

const PRIMARY_COLLECTION = 'activity_logs';
const FALLBACK_COLLECTION = 'update_logs';
type ViewMode = 'timeline' | 'table';

/* ── Visual language per action / status ── */

function entryVisual(action: string, status?: string): { Icon: LucideIcon; iconCls: string; dotCls: string } {
  const a = (action || '').toLowerCase();
  let Icon: LucideIcon = Activity;
  let iconCls = 'bg-slate-100 text-slate-500';
  let dotCls = 'bg-slate-400';

  if (a.includes('delete') || a.includes('remove')) { Icon = Trash2; iconCls = 'bg-rose-50 text-rose-600'; dotCls = 'bg-rose-500'; }
  else if (a.includes('edit') || a.includes('update') || a.includes('modify')) { Icon = Pencil; iconCls = 'bg-amber-50 text-amber-600'; dotCls = 'bg-amber-500'; }
  else if (a.includes('create') || a.includes('add') || a.includes('new') || a.includes('generate')) { Icon = Plus; iconCls = 'bg-emerald-50 text-emerald-600'; dotCls = 'bg-emerald-500'; }
  else if (a.includes('export') || a.includes('download')) { Icon = Download; iconCls = 'bg-indigo-50 text-indigo-600'; dotCls = 'bg-indigo-500'; }
  else if (a.includes('login') || a.includes('auth') || a.includes('sign')) { Icon = CheckCircle2; iconCls = 'bg-blue-50 text-blue-600'; dotCls = 'bg-blue-500'; }
  else if (a.includes('system') || a.includes('auto') || a.includes('sync') || a.includes('schedul')) { Icon = Zap; iconCls = 'bg-violet-50 text-violet-600'; dotCls = 'bg-violet-500'; }

  const s = (status || '').toLowerCase();
  if (s.includes('fail') || s.includes('error')) dotCls = 'bg-rose-500';
  else if (s.includes('pending') || s.includes('progress')) dotCls = 'bg-amber-400';

  return { Icon, iconCls, dotCls };
}

function dayGroup(ts?: string) {
  if (!ts) return 'Earlier';
  const d = new Date(ts);
  if (isNaN(d.getTime())) return 'Earlier';
  const start = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((start(new Date()) - start(d)) / 86400000);
  if (diff <= 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  if (diff < 7) return d.toLocaleDateString('en-US', { weekday: 'long' });
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
}

/* ── Component ── */

const ActivityLog = forwardRef<ActivityLogHandle, ActivityLogProps>(function ActivityLog(
  { onStats, title = 'Activity Log', className },
  ref,
) {
  const [logs, setLogs] = useState<RecordItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [noCollection, setNoCollection] = useState(false);

  const [q, setQ] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [view, setView] = useState<ViewMode>('timeline');
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(15);
  const [sort, setSort] = useState<SortState | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [exportOpen, setExportOpen] = useState(false);

  const colRef = useRef<string>(FALLBACK_COLLECTION);
  const latest = useRef<RecordItem[]>([]);
  useEffect(() => { latest.current = logs; }, [logs]);

  /* ── Load: prefer activity_logs, fall back to update_logs ── */
  const load = useCallback(async (silent = false) => {
    if (silent) setRefreshing(true); else setLoading(true);
    let items: RecordItem[] = [];
    let missing = false;
    try {
      items = await fetchAllRecords(PRIMARY_COLLECTION, '-created');
      colRef.current = PRIMARY_COLLECTION;
    } catch {
      try {
        items = await fetchAllRecords(FALLBACK_COLLECTION, '-created');
        colRef.current = FALLBACK_COLLECTION;
      } catch { missing = true; }
    }
    setLogs(items);
    setNoCollection(missing);
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  /* ── Report stats up to the parent (memoized callback there) ── */
  useEffect(() => {
    if (!onStats) return;
    const cutoff = Date.now() - 30 * 86400000;
    const prevCutoff = cutoff - 30 * 86400000;
    const recent = logs.filter(l => new Date(l.created || 0).getTime() >= cutoff).length;
    const prev = logs.filter(l => {
      const t = new Date(l.created || 0).getTime();
      return t >= prevCutoff && t < cutoff;
    }).length;
    const trend = prev === 0 ? (recent > 0 ? 100 : null) : Math.round(((recent - prev) / prev) * 100);
    onStats({ count: logs.length, recent, trend });
  }, [logs]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── Alias-aware getters ── */
  const get = useCallback((l: RecordItem, keys: string[]) => {
    for (const k of keys) {
      const v = l[k];
      if (v != null && v !== '') return typeof v === 'object' ? JSON.stringify(v) : String(v);
    }
    return '';
  }, []);

  /* ── Imperative handle: push / refresh / getRows ── */
  useImperativeHandle(ref, () => ({
    push: async (entry: ActivityEntry) => {
      try {
        const sample = latest.current[0];
        const payload: Record<string, any> = {};
        const assign = (aliases: string[], value: any) => {
          // Bind to a field name that actually exists on the target collection
          const key = (sample ? aliases.find(a => a in sample) : null) ?? aliases[0];
          if (key && value != null && value !== '') payload[key] = value;
        };
        assign(ACTION_KEYS, entry.action);
        assign(USER_KEYS, entry.user || 'system');
        assign(STATUS_KEYS, entry.status || 'success');
        if (entry.details) assign(DETAILS_KEYS, entry.details);
        await pb.collection(colRef.current).create(payload);
        await load(true);
        return true;
      } catch (e) {
        console.error('[ActivityLog] failed to store entry:', e);
        return false;
      }
    },
    refresh: () => load(true),
    getRows: () => latest.current.map(l => ({
      When: fmtDateTime(l.created),
      Action: get(l, ACTION_KEYS) || '—',
      User: get(l, USER_KEYS) || 'system',
      Status: get(l, STATUS_KEYS) || '—',
      Details: get(l, DETAILS_KEYS) || '—',
    })),
  }), [load, get]);

  /* ── Filter / sort / paginate ── */
  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    return logs.filter(l => {
      if (statusFilter !== 'all' && statusBucket(get(l, STATUS_KEYS)) !== statusFilter) return false;
      if (query && !Object.values(l).some(v => typeof v === 'string' && v.toLowerCase().includes(query))) return false;
      return true;
    });
  }, [logs, q, statusFilter, get]);

  const sorted = useMemo(() => (sort ? sortRecords(filtered, sort.key, sort.dir) : filtered), [filtered, sort]);
  const pages = Math.max(1, Math.ceil(sorted.length / size));
  const safePage = Math.min(page, pages);
  const paged = useMemo(() => sorted.slice((safePage - 1) * size, safePage * size), [sorted, safePage, size]);
  useEffect(() => { setPage(1); }, [q, statusFilter, size]);

  /* ── Timeline groups (day buckets) ── */
  const groups = useMemo(() => {
    const map = new Map<string, RecordItem[]>();
    paged.forEach(l => {
      const key = dayGroup(l.created);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(l);
    });
    return Array.from(map.entries());
  }, [paged]);

  /* ── Canonical columns for table view ── */
  const columns = useMemo<ColumnDef[]>(() => {
    const present = new Set<string>();
    logs.forEach(l => Object.keys(l).forEach(k => {
      if (!HIDDEN_KEYS.includes(k) && k !== 'updated') present.add(k);
    }));
    if (!present.size) {
      return [
        { key: 'created', label: 'When' }, { key: 'action', label: 'Action' }, { key: 'user', label: 'User' },
        { key: 'status', label: 'Status' }, { key: 'details', label: 'Details' },
      ];
    }
    const cols: ColumnDef[] = [{ key: 'created', label: 'When' }];
    const ak = ACTION_KEYS.find(k => present.has(k)); if (ak) cols.push({ key: ak, label: 'Action' });
    const uk = USER_KEYS.find(k => present.has(k)); if (uk) cols.push({ key: uk, label: 'User' });
    const sk = STATUS_KEYS.find(k => present.has(k)); if (sk) cols.push({ key: sk, label: 'Status' });
    const dk = DETAILS_KEYS.find(k => present.has(k)); if (dk) cols.push({ key: dk, label: 'Details' });
    return cols;
  }, [logs]);

  const toggleSort = (key: string) =>
    setSort(s => (s && s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'desc' }));

  function doExport(format: 'csv' | 'json') {
    const rows = latest.current.map(l => ({
      When: fmtDateTime(l.created),
      Action: get(l, ACTION_KEYS) || '—',
      User: get(l, USER_KEYS) || 'system',
      Status: get(l, STATUS_KEYS) || '—',
      Details: get(l, DETAILS_KEYS) || '—',
    }));
    if (rows.length) downloadDataset(format, 'activity-log', rows);
    setExportOpen(false);
  }

  /* ── Cell renderer for table view ── */
  const logCell = (key: string, item: RecordItem): ReactNode => {
    if (key === 'created') {
      return <span className="whitespace-nowrap text-[12.5px] text-slate-500" title={fmtDateTime(item.created)}>{timeAgo(item.created)}</span>;
    }
    if (ACTION_KEYS.includes(key)) {
      const s = String(item[key] ?? '') || '—';
      return <span className="block max-w-[200px] truncate text-[12.5px] font-semibold text-slate-700" title={s}>{s}</span>;
    }
    if (USER_KEYS.includes(key)) {
      const name = String(item[key] ?? '') || 'system';
      return (
        <span className="inline-flex items-center gap-2 whitespace-nowrap">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 text-[10px] font-bold text-white">
            {name.charAt(0).toUpperCase()}
          </span>
          <span className="max-w-[120px] truncate text-[12.5px] text-slate-600" title={name}>{name}</span>
        </span>
      );
    }
    if (STATUS_KEYS.includes(key)) {
      const s = String(item[key] ?? '');
      return s ? <Pill dot tone={statusTone(s)}>{s}</Pill> : <span className="text-slate-300">—</span>;
    }
    if (DETAILS_KEYS.includes(key)) {
      const s = String(item[key] ?? '');
      return <span className="block max-w-[280px] truncate text-[12.5px] text-slate-500" title={s}>{s || '—'}</span>;
    }
    const v = item[key];
    const s = v == null ? '' : String(v);
    return <span className="block max-w-[200px] truncate text-[12.5px] text-slate-600" title={s}>{s || '—'}</span>;
  };

  return (
    <section className={cx('overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm', className)}>
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-5 py-4">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
            <History className="h-4 w-4" />
          </span>
          <div>
            <h2 className="text-[14px] font-bold text-slate-900">{title}</h2>
            <p className="text-[11.5px] text-slate-400">
              {loading ? 'Loading…' : noCollection
                ? 'No log collection found'
                : `${filtered.length} entries · stored in “${colRef.current}”`}
            </p>
          </div>
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <SearchInput value={q} onChange={setQ} placeholder="Search activity…" />
          <FilterSelect value={statusFilter} onChange={setStatusFilter} label="Status" options={[
            { value: 'all', label: 'All statuses' },
            { value: 'success', label: 'Success' },
            { value: 'pending', label: 'Pending' },
            { value: 'failed', label: 'Failed' },
          ]} />
          <div className="flex rounded-lg bg-slate-100 p-0.5">
            {(['timeline', 'table'] as ViewMode[]).map(m => (
              <button key={m} onClick={() => setView(m)}
                className={cx('flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[12px] font-semibold transition',
                  view === m ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700')}>
                {m === 'timeline' ? <History className="h-3.5 w-3.5" /> : <List className="h-3.5 w-3.5" />}
                <span className="hidden sm:inline">{m === 'timeline' ? 'Timeline' : 'Table'}</span>
              </button>
            ))}
          </div>
          <button onClick={() => load(true)} title="Refresh"
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 transition hover:text-slate-800">
            <RefreshCw className={cx('h-4 w-4', refreshing && 'animate-spin')} />
          </button>
          <div className="relative">
            <button onClick={() => setExportOpen(o => !o)} title="Export log"
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 transition hover:text-slate-800">
              <Download className="h-4 w-4" />
            </button>
            {exportOpen && (
              <>
                <div className="fixed inset-0 z-20" onClick={() => setExportOpen(false)} />
                <div className="absolute right-0 top-11 z-30 w-40 rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl">
                  <button onClick={() => doExport('csv')} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-[12.5px] font-medium text-slate-600 hover:bg-slate-50">
                    <FileText className="h-3.5 w-3.5 text-slate-400" /> Export CSV
                  </button>
                  <button onClick={() => doExport('json')} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-[12.5px] font-medium text-slate-600 hover:bg-slate-50">
                    <FileJson className="h-3.5 w-3.5 text-slate-400" /> Export JSON
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Body */}
      {loading ? (
        <div className="space-y-2.5 px-5 py-5">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 rounded-xl border border-slate-100 px-3.5 py-3">
              <div className="h-8 w-8 animate-pulse rounded-lg bg-slate-100" />
              <div className="flex-1 space-y-1.5">
                <div className="h-3 w-1/3 animate-pulse rounded bg-slate-100" />
                <div className="h-2.5 w-1/4 animate-pulse rounded bg-slate-50" />
              </div>
              <div className="h-5 w-16 animate-pulse rounded-full bg-slate-100" />
            </div>
          ))}
        </div>
      ) : noCollection ? (
        <EmptyState icon={History} title="No activity collection"
          hint={<>Create an <b>activity_logs</b> collection (or keep <b>update_logs</b>) in PocketBase.</>} />
      ) : filtered.length === 0 ? (
        <EmptyState icon={History} title={q || statusFilter !== 'all' ? 'No matching activity' : 'No activity yet'}
          hint={q || statusFilter !== 'all' ? 'Try a different search or filter.' : 'Actions like exports and edits will appear here.'} />
      ) : view === 'timeline' ? (
        <div className="max-h-[620px] overflow-y-auto px-5 py-4">
          {groups.map(([label, items]) => (
            <div key={label} className="mb-5 last:mb-1">
              <p className="mb-2.5 text-[10.5px] font-bold uppercase tracking-[0.12em] text-slate-400">{label}</p>
              <ol className="relative ml-2 space-y-1.5 border-l border-slate-200 pl-5">
                {items.map(item => {
                  const action = get(item, ACTION_KEYS) || 'Activity';
                  const user = get(item, USER_KEYS) || 'system';
                  const status = get(item, STATUS_KEYS);
                  const details = get(item, DETAILS_KEYS);
                  const v = entryVisual(action, status);
                  const isExpanded = expandedId === item.id;
                  return (
                    <li key={item.id} className="relative">
                      <span className={cx('absolute -left-[26px] top-4 h-2.5 w-2.5 rounded-full ring-4 ring-white', v.dotCls)} />
                      <div onClick={() => setExpandedId(isExpanded ? null : item.id)}
                        className={cx('cursor-pointer rounded-xl border px-3.5 py-3 transition',
                          isExpanded ? 'border-indigo-200 bg-indigo-50/40' : 'border-transparent hover:border-slate-200 hover:bg-slate-50/70')}>
                        <div className="flex items-start gap-3">
                          <span className={cx('mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg', v.iconCls)}>
                            <v.Icon className="h-4 w-4" />
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                              <p className="text-[13px] font-semibold text-slate-800">{humanize(action)}</p>
                              {status && <Pill dot tone={statusTone(status)}>{status}</Pill>}
                            </div>
                            {details && !isExpanded && (
                              <p className="mt-0.5 truncate text-[12px] text-slate-500">{details}</p>
                            )}
                            <div className="mt-1.5 flex items-center gap-1.5 text-[11.5px] text-slate-400">
                              <span className="flex h-[18px] w-[18px] items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 text-[9px] font-bold text-white">
                                {user.charAt(0).toUpperCase()}
                              </span>
                              <span className="font-medium text-slate-500">{user}</span>
                              <span>·</span>
                              <span title={fmtDateTime(item.created)}>{timeAgo(item.created)}</span>
                            </div>
                          </div>
                          <ChevronDown className={cx('mt-1 h-4 w-4 shrink-0 text-slate-300 transition', isExpanded && 'rotate-180')} />
                        </div>
                        {isExpanded && details && (
                          <p className="mt-2.5 whitespace-pre-wrap rounded-lg bg-white px-3 py-2.5 text-[12.5px] leading-relaxed text-slate-600 ring-1 ring-slate-100">
                            {details}
                          </p>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ol>
            </div>
          ))}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px]">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/70">
                {columns.map(c => (
                  <th key={c.key} className="whitespace-nowrap px-4 py-2.5 text-left">
                    <button onClick={() => toggleSort(c.key)}
                      className="group inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400 transition hover:text-slate-700">
                      {c.label}
                      {sort?.key === c.key
                        ? (sort.dir === 'asc' ? <ChevronUp className="h-3 w-3 text-indigo-500" /> : <ChevronDown className="h-3 w-3 text-indigo-500" />)
                        : <ChevronDown className="h-3 w-3 opacity-0 transition group-hover:opacity-60" />}
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {paged.map(item => (
                <tr key={item.id} className="transition-colors hover:bg-slate-50/80">
                  {columns.map(c => <td key={c.key} className="px-4 py-2.5 align-middle">{logCell(c.key, item)}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!loading && filtered.length > 0 && (
        <Pagination
          page={safePage} pages={pages} total={sorted.length}
          start={(safePage - 1) * size + 1} end={Math.min(safePage * size, sorted.length)}
          onPage={setPage} size={size} onSize={setSize}
        />
      )}
    </section>
  );
});

export default ActivityLog;