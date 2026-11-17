'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  AlertTriangle, ArrowUpDown, ChevronDown, ChevronUp, FileDown, FileJson,
  FileSpreadsheet, FileText, History, Printer, RefreshCw, Trash2,
} from 'lucide-react';
import pb from '@/lib/pocketbase';
import { useNow } from '@/lib/useNow';
import {
  HIDDEN_KEYS,
  cx, deltaPct, downloadDataset, fetchAllRecords,
  fmtDateTime, humanize, OffCanvas, Pagination,
  Pill, timeAgo, Toast, TrendChip,
  ColumnPicker, EmptyState, FilterSelect, SearchInput,
  sortRecords,
  type ColumnDef, type ExportFormat, type RecordItem, type SortState,
} from '@/lib/reports-utils';

/* The Reports page shows exactly two PocketBase collections:
   update_logs     — what changed (meetings, officers, users, contacts…)
   deleted_records — snapshots archived before a record was deleted */

type TabKey = 'updates' | 'deleted';

const FORMAT_OPTIONS: { key: ExportFormat; label: string; icon: LucideIcon }[] = [
  { key: 'csv', label: 'CSV', icon: FileText },
  { key: 'excel', label: 'Excel', icon: FileSpreadsheet },
  { key: 'json', label: 'JSON', icon: FileJson },
  { key: 'pdf', label: 'PDF', icon: Printer },
];

/* Derived, sortable fields added to each row (never shown as raw record fields) */
const WHEN = '__when';
const NAME = '__name';

/* update_logs rows have no `created` — the event time lives in `completed_at` */
function withUpdateFields(rows: RecordItem[]): RecordItem[] {
  return rows.map((r) => ({ ...r, [WHEN]: r.completed_at || r.created || r.updated || '' }));
}

/* deleted_records keep the removed record in `record_data` — pick a readable name from it */
function withDeletedFields(rows: RecordItem[]): RecordItem[] {
  return rows.map((r) => {
    const d = (r.record_data && typeof r.record_data === 'object') ? r.record_data : {};
    const name = d.name || d.agenda || d.title || d.officer_name || d.company_name || d.email || r.original_id || '';
    return { ...r, [WHEN]: r.deleted_at || r.created || '', [NAME]: String(name) };
  });
}

const byNewest = (rows: RecordItem[]) =>
  [...rows].sort((a, b) => (new Date(b[WHEN] || 0).getTime() || 0) - (new Date(a[WHEN] || 0).getTime() || 0));

const COLUMNS: Record<TabKey, ColumnDef[]> = {
  updates: [
    { key: WHEN, label: 'When', defaultVisible: true },
    { key: 'update_type', label: 'Type', defaultVisible: true },
    { key: 'officer_name', label: 'Subject', defaultVisible: true },
    { key: 'description', label: 'Description', defaultVisible: true },
    { key: 'priority', label: 'Priority', defaultVisible: true },
    { key: 'updated_by', label: 'By', defaultVisible: true },
    { key: 'previous_value', label: 'Previous value' },
    { key: 'new_value', label: 'New value' },
    { key: 'meeting_id', label: 'Meeting ID' },
  ],
  deleted: [
    { key: WHEN, label: 'Deleted', defaultVisible: true },
    { key: NAME, label: 'Record', defaultVisible: true },
    { key: 'record_type', label: 'Type', defaultVisible: true },
    { key: 'original_collection', label: 'Deleted from', defaultVisible: true },
    { key: 'original_id', label: 'Record ID' },
  ],
};

const PRIORITY_TONE: Record<string, 'rose' | 'amber' | 'slate'> = { high: 'rose', medium: 'amber', low: 'slate' };

/* Plain-text value of a column (search, export) */
/* where a deleted record came from, in plain words (the database name → a page name) */
const SOURCE_NAMES: Record<string, string> = {
  meetings: 'Meetings', ias_officers: 'IAS officers', ips_officers: 'IPS officers',
  ias_directory: 'IAS officers', ips_directory: 'IPS officers', ifs_directory: 'IFS officers', irs_directory: 'IRS officers',
  other_contacts: 'Other contacts', employees: 'Employees', users: 'Users',
};
const sourceName = (v: unknown) => SOURCE_NAMES[String(v)] || String(v).replace(/_/g, ' ');

function cellText(key: string, r: RecordItem): string {
  const v = r[key];
  if (key === WHEN) return v ? fmtDateTime(v) : '—';
  if (key === 'original_collection' && v) return sourceName(v);
  if (v == null || v === '') return '—';
  return typeof v === 'object' ? JSON.stringify(v) : String(v);
}

function renderCell(key: string, r: RecordItem): ReactNode {
  const v = r[key];
  if (key === WHEN) {
    return v
      ? <span className="whitespace-nowrap text-[12.5px] text-slate-500" title={fmtDateTime(v)}>{timeAgo(v)}</span>
      : <span className="text-slate-300">—</span>;
  }
  if (v == null || v === '') return <span className="text-slate-300">—</span>;
  const s = typeof v === 'object' ? JSON.stringify(v) : String(v);
  switch (key) {
    case NAME:
    case 'officer_name':
      return <span className="block max-w-[220px] truncate text-[13px] font-semibold text-slate-800" title={s}>{s}</span>;
    case 'update_type':
    case 'record_type':
      return <Pill tone="violet">{s}</Pill>;
    case 'priority':
      return <Pill dot tone={PRIORITY_TONE[s.toLowerCase()] ?? 'slate'}>{s}</Pill>;
    case 'original_collection':
      return <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">{sourceName(s)}</span>;
    case 'updated_by':
      return (
        <span className="inline-flex items-center gap-2 whitespace-nowrap">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-indigo-600 text-[10px] font-bold text-white">
            {s.charAt(0).toUpperCase()}
          </span>
          <span className="max-w-[120px] truncate text-[12.5px] text-slate-600" title={s}>{s}</span>
        </span>
      );
    case 'description':
      return <span className="block max-w-[340px] truncate text-[12.5px] text-slate-500" title={s}>{s}</span>;
    default:
      return <span className="block max-w-[200px] truncate text-[12.5px] text-slate-600" title={s}>{s}</span>;
  }
}

/* ── Stat card (pastel, reference style) ── */
function StatCard({ icon: Icon, label, value, sub, trend, card, tint }: {
  icon: LucideIcon; label: string; value: string | number; sub?: string;
  trend?: number | null; card: string; tint: string;
}) {
  return (
    <div className={`group relative overflow-hidden rounded-3xl bg-gradient-to-br p-5 transition-all duration-300 hover:-translate-y-1 hover:shadow-lg hover:shadow-slate-900/[0.08] ${card}`}>
      <span
        aria-hidden
        className="pointer-events-none absolute -right-6 -top-6 h-20 w-20 rounded-full bg-white/50 transition-transform duration-300 group-hover:scale-125"
      />

      <div className="relative flex items-start justify-between gap-2">
        <p className="pt-1.5 text-sm font-semibold text-slate-600">{label}</p>
        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/80 shadow-sm transition-transform duration-300 group-hover:scale-110 ${tint}`}>
          <Icon className="h-5 w-5" />
        </span>
      </div>

      <div className="relative mt-3 flex items-end justify-between gap-2">
        <span className="text-[2rem] font-extrabold leading-none tracking-tight text-slate-900">{value}</span>
        <span className="pb-1"><TrendChip delta={trend ?? null} /></span>
      </div>

      {sub && <p className="relative mt-1.5 truncate text-xs font-medium text-slate-500/80" title={sub}>{sub}</p>}
    </div>
  );
}

/* ── Segmented tab (dark pill) ── */
function TabButton({ active, onClick, icon: Icon, label, count }: {
  active: boolean; onClick: () => void; icon: LucideIcon; label: string; count: number;
}) {
  return (
    <button onClick={onClick}
      className={cx('flex items-center gap-2 rounded-full px-4 py-2 text-[13px] font-semibold transition-all duration-200',
        active ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-500 hover:text-slate-800')}>
      <Icon className="h-4 w-4" />
      {label}
      <span className={cx('rounded-full px-1.5 py-0.5 text-[10.5px] font-bold',
        active ? 'bg-white/20 text-white' : 'bg-slate-200/70 text-slate-500')}>
        {count}
      </span>
    </button>
  );
}

/* ── Read-only table ── */
function LogTable({ records, columns, sort, onSort, onOpen }: {
  records: RecordItem[]; columns: ColumnDef[]; sort: SortState | null;
  onSort: (key: string) => void; onOpen: (r: RecordItem) => void;
}) {
  if (!columns.length) {
    return <div className="px-6 py-12 text-center text-[12.5px] text-slate-400">All columns are hidden — enable some from the Columns menu.</div>;
  }
  return (
    <div className="max-h-[70vh] overflow-auto">
      <table className="w-full min-w-[820px] border-collapse">
        <thead className="sticky top-0 z-10 bg-slate-50 shadow-[0_1px_0_0_rgb(241_245_249)]">
          <tr className="border-b border-slate-100 bg-slate-50/70">
            {columns.map(c => (
              <th key={c.key} className="whitespace-nowrap px-4 py-2.5 text-left align-middle">
                <button onClick={() => onSort(c.key)} title="Sort by this column"
                  className="group inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400 transition hover:text-slate-700">
                  {c.label}
                  {sort?.key === c.key
                    ? (sort.dir === 'asc' ? <ChevronUp className="h-3 w-3 text-violet-500" /> : <ChevronDown className="h-3 w-3 text-violet-500" />)
                    : <ArrowUpDown className="h-3 w-3 opacity-0 transition group-hover:opacity-60" />}
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {records.map(r => (
            <tr key={r.id} onClick={() => onOpen(r)} className="cursor-pointer transition-colors hover:bg-violet-50/50">
              {columns.map(c => <td key={c.key} className="px-4 py-3 align-middle">{renderCell(c.key, r)}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ── Details drawer grid ── */
function DetailGrid({ record }: { record: RecordItem }) {
  const skip = new Set([...HIDDEN_KEYS, WHEN, NAME]);
  const entries = Object.entries(record).filter(([k]) => !skip.has(k));
  return (
    <dl className="divide-y divide-slate-100">
      {entries.map(([k, v]) => (
        <div key={k} className="grid grid-cols-[130px_1fr] gap-4 px-6 py-3">
          <dt className="text-[12px] font-medium text-slate-400">{humanize(k)}</dt>
          <dd className="break-words text-[13px] text-slate-700">
            {v != null && typeof v === 'object' ? (
              <pre className="overflow-x-auto rounded-2xl bg-slate-50 p-3 font-mono text-[11.5px] leading-relaxed text-slate-600">
                {JSON.stringify(v, null, 2)}
              </pre>
            ) : (
              <span className="whitespace-pre-wrap">
                {v == null || v === '' ? '—'
                  : typeof v === 'boolean' ? (v ? 'Yes' : 'No')
                  : /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/.test(String(v)) ? fmtDateTime(String(v)) : String(v)}
              </span>
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/* ───────── Main page ───────── */

const DEFAULT_FILTERS = { q: '', type: 'all', priority: 'all' };

export default function ReportsPage() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [fetchWarnings, setFetchWarnings] = useState<string[]>([]);
  const [syncedAt, setSyncedAt] = useState<string>('');

  const [updates, setUpdates] = useState<RecordItem[]>([]);
  const [deleted, setDeleted] = useState<RecordItem[]>([]);

  const [tab, setTab] = useState<TabKey>('updates');
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(25);
  const [sort, setSort] = useState<SortState | null>(null);
  const [visible, setVisible] = useState<Record<string, boolean>>({});

  const [drawer, setDrawer] = useState<{ kind: 'details' | 'export' | null; record?: RecordItem }>({ kind: null });
  const [exportFormat, setExportFormat] = useState<ExportFormat>('csv');

  const [toast, setToast] = useState<{ kind: 'ok' | 'err'; msg: string } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const notify = (kind: 'ok' | 'err', msg: string) => {
    setToast({ kind, msg });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 4000);
  };

  /* ── Data ── */
  const loadData = useCallback(async (silent = false) => {
    try {
      setError('');
      if (silent) setRefreshing(true); else setLoading(true);
      const warnings: string[] = [];
      const [u, d] = await Promise.all([
        fetchAllRecords('update_logs', '-completed_at').catch(() => { warnings.push('update_logs'); return [] as RecordItem[]; }),
        fetchAllRecords('deleted_records', '-deleted_at').catch(() => { warnings.push('deleted_records'); return [] as RecordItem[]; }),
      ]);
      setFetchWarnings(warnings);
      setUpdates(byNewest(withUpdateFields(u)));
      setDeleted(byNewest(withDeletedFields(d)));
      setSyncedAt(new Date().toISOString());
    } catch (e: any) {
      console.error('Failed to load reports:', e);
      setError(e?.message || 'Unable to reach the server. Check your connection and try again.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  /* ── Live updates: reload quietly when either collection changes in PocketBase ── */
  const [live, setLive] = useState(false);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    let cancelled = false;
    const unsubs: (() => void)[] = [];
    const onChange = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => loadData(true), 400); // one reload per burst
    };
    Promise.allSettled(['update_logs', 'deleted_records'].map((col) =>
      pb.collection(col).subscribe('*', onChange).then((fn) => { if (cancelled) fn(); else unsubs.push(fn); }),
    )).then((results) => {
      if (cancelled) return;
      setLive(unsubs.length > 0);
      results.forEach((r) => {
        // status 0 = the attempt was cancelled (dev mode mounts twice) — not a real failure
        if (r.status === 'rejected' && r.reason?.status !== 0 && !r.reason?.isAbort) {
          console.warn('[reports] live updates unavailable:', r.reason);
        }
      });
    });
    return () => { cancelled = true; if (timer) clearTimeout(timer); unsubs.forEach((fn) => fn()); };
  }, [loadData]);

  /* ── Stats (last 30 days vs the 30 before) ── */
  const now = useNow();
  const stats = useMemo(() => {
    const cutoff = now - 30 * 86400000;
    const prevCutoff = cutoff - 30 * 86400000;
    const windowed = (rows: RecordItem[]) => {
      let recent = 0, prev = 0;
      rows.forEach((r) => {
        const t = new Date(r[WHEN] || 0).getTime();
        if (t >= cutoff) recent += 1; else if (t >= prevCutoff) prev += 1;
      });
      return { recent, trend: deltaPct(recent, prev) };
    };
    return { updates: windowed(updates), deleted: windowed(deleted) };
  }, [updates, deleted, now]);

  const topOf = (rows: RecordItem[], key: string) => {
    const counts: Record<string, number> = {};
    rows.forEach((r) => { const v = r[key]; if (v) counts[v] = (counts[v] || 0) + 1; });
    return Object.entries(counts).sort((x, y) => y[1] - x[1])[0]?.[0] ?? null;
  };
  const topUpdateType = useMemo(() => topOf(updates, 'update_type'), [updates]);
  const topDeletedType = useMemo(() => topOf(deleted, 'record_type'), [deleted]);

  /* ── Current tab: rows, columns, filters ── */
  const rows = tab === 'updates' ? updates : deleted;
  const typeKey = tab === 'updates' ? 'update_type' : 'record_type';

  const isVisible = (c: ColumnDef) => visible[c.key] ?? !!c.defaultVisible;
  const allColumns = COLUMNS[tab];
  const shownColumns = allColumns.filter(isVisible);

  const switchTab = (t: TabKey) => {
    setTab(t);
    setFilters(DEFAULT_FILTERS);
    setSort(null);
    setVisible({});
    setPage(1);
  };

  const typeOptions = useMemo(() => {
    const set = new Set<string>();
    rows.forEach((r) => { if (r[typeKey]) set.add(String(r[typeKey])); });
    return [{ value: 'all', label: 'All types' }, ...Array.from(set).sort().map((v) => ({ value: v, label: v }))];
  }, [rows, typeKey]);

  const filtered = useMemo(() => {
    const q = filters.q.trim().toLowerCase();
    return rows.filter((r) => {
      if (filters.type !== 'all' && String(r[typeKey] || '') !== filters.type) return false;
      if (tab === 'updates' && filters.priority !== 'all' && String(r.priority || '').toLowerCase() !== filters.priority) return false;
      if (q) {
        const hay = allColumns.map((c) => cellText(c.key, r)).join(' ').toLowerCase()
          + (tab === 'deleted' ? ' ' + JSON.stringify(r.record_data ?? '').toLowerCase() : '');
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [rows, filters, tab, typeKey, allColumns]);

  useEffect(() => { setPage(1); }, [filters, size]);

  const sorted = useMemo(() => (sort ? sortRecords(filtered, sort.key, sort.dir) : filtered), [filtered, sort]);
  const pages = Math.max(1, Math.ceil(sorted.length / size));
  const safePage = Math.min(page, pages);
  const paged = useMemo(() => sorted.slice((safePage - 1) * size, safePage * size), [sorted, safePage, size]);

  const toggleSort = (key: string) =>
    setSort((s) => (s && s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'desc' }));

  const closeDrawer = useCallback(() => setDrawer((d) => (d.kind === null ? d : { ...d, kind: null })), []);

  function runExport() {
    const out = sorted.map((r) => Object.fromEntries(shownColumns.map((c) => [c.label, cellText(c.key, r)])));
    if (!out.length) { notify('err', 'Nothing to export — adjust the filters first'); return; }
    const title = tab === 'updates' ? 'Update Logs' : 'Deleted Records';
    downloadDataset(exportFormat, title, out);
    notify('ok', `Exported ${out.length} rows as ${exportFormat.toUpperCase()}`);
    closeDrawer();
  }

  const filtersActive = filters.q || filters.type !== 'all' || filters.priority !== 'all';
  const tabLabel = tab === 'updates' ? 'update logs' : 'deleted records';

  return (
    <div className="relative min-h-screen bg-gradient-to-br from-indigo-200 via-violet-100 to-purple-200 p-0 sm:p-5 lg:p-8">
      {/* Ambient blobs */}
      <div aria-hidden className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -left-32 -top-32 h-96 w-96 rounded-full bg-violet-300/40 blur-3xl" />
        <div className="absolute -right-32 top-1/4 h-96 w-96 rounded-full bg-sky-300/30 blur-3xl" />
        <div className="absolute -bottom-32 left-1/3 h-96 w-96 rounded-full bg-fuchsia-300/25 blur-3xl" />
      </div>

      <div className="relative mx-auto max-w-[1500px] overflow-hidden bg-white sm:rounded-[1.75rem] sm:shadow-2xl sm:shadow-violet-300/40 sm:ring-1 sm:ring-white/70">

        {/* ── App bar ── */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 bg-white px-4 py-3.5 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-900 text-white shadow-sm">
              <FileText className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <p className="truncate text-sm font-bold text-slate-900">Reports</p>
                <span className="rounded-full bg-violet-50 px-2 py-0.5 text-[10px] font-bold tabular-nums text-violet-600 ring-1 ring-inset ring-violet-500/15">
                  {updates.length + deleted.length}
                </span>
              </div>
              <p className="flex items-center gap-1.5 truncate text-[11px] text-slate-400">
                {live && (
                  <span className="inline-flex items-center gap-1 font-semibold text-emerald-600" title="Updates automatically when data changes">
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" /> Live ·
                  </span>
                )}
                {syncedAt ? `Synced ${timeAgo(syncedAt)}` : 'Loading…'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button onClick={() => loadData(true)} aria-label="Refresh data"
              className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 transition-colors hover:border-violet-200 hover:text-violet-600">
              <RefreshCw className={cx('h-4 w-4', refreshing && 'animate-spin')} />
            </button>
            <button onClick={() => setDrawer({ kind: 'export' })}
              className="inline-flex h-10 items-center gap-1.5 rounded-full bg-slate-900 px-5 text-[12.5px] font-semibold text-white shadow-lg shadow-slate-900/10 transition-all hover:-translate-y-0.5 hover:bg-slate-800 active:scale-[0.98]">
              <FileDown className="h-3.5 w-3.5" /> Export
            </button>
          </div>
        </div>

        {/* ── Content ── */}
        <div className="space-y-5 bg-[#f7f6fd] p-3 sm:p-6 lg:p-7">

          {/* Error / warnings */}
          {error && (
            <div className="flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-500" />
              <span className="flex-1 text-[13px] text-rose-700">{error}</span>
              <button onClick={() => loadData()} className="shrink-0 rounded-full bg-white px-3.5 py-1.5 text-[11.5px] font-semibold text-rose-600 ring-1 ring-rose-200 transition hover:bg-rose-100">Retry</button>
            </div>
          )}
          {!!fetchWarnings.length && !error && (
            <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] text-amber-700">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              Couldn&apos;t load: {fetchWarnings.join(', ')} — verify these collections exist in PocketBase.
            </div>
          )}

          {/* Stat cards */}
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatCard icon={History} label="Update logs" value={updates.length}
              sub={topUpdateType ? `Most common: ${topUpdateType}` : 'All time'}
              card="from-violet-100 to-purple-100" tint="text-violet-600" />
            <StatCard icon={RefreshCw} label="Updates · 30 days" value={stats.updates.recent}
              sub={`Last: ${timeAgo(updates[0]?.[WHEN]) || '—'}`}
              trend={stats.updates.trend} card="from-sky-100 to-blue-100" tint="text-sky-600" />
            <StatCard icon={Trash2} label="Deleted records" value={deleted.length}
              sub={topDeletedType ? `Mostly: ${topDeletedType}` : 'All time'}
              card="from-rose-100 to-pink-100" tint="text-rose-600" />
            <StatCard icon={Trash2} label="Deleted · 30 days" value={stats.deleted.recent}
              sub={`Last: ${timeAgo(deleted[0]?.[WHEN]) || '—'}`}
              trend={stats.deleted.trend} card="from-amber-100 to-orange-100" tint="text-amber-600" />
          </div>

          {/* Tabs */}
          <div className="inline-flex rounded-full bg-slate-100 p-1">
            <TabButton active={tab === 'updates'} onClick={() => switchTab('updates')} icon={History} label="Update logs" count={updates.length} />
            <TabButton active={tab === 'deleted'} onClick={() => switchTab('deleted')} icon={Trash2} label="Deleted records" count={deleted.length} />
          </div>

          <section className="overflow-hidden rounded-3xl bg-white shadow-sm ring-1 ring-slate-100">
            <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-5 py-3.5">
              <SearchInput value={filters.q} onChange={(v) => setFilters((f) => ({ ...f, q: v }))}
                placeholder={`Search ${tabLabel}…`} />
              <FilterSelect label="Type" value={filters.type} onChange={(v) => setFilters((f) => ({ ...f, type: v }))} options={typeOptions} />
              {tab === 'updates' && (
                <FilterSelect label="Priority" value={filters.priority} onChange={(v) => setFilters((f) => ({ ...f, priority: v }))} options={[
                  { value: 'all', label: 'All priorities' },
                  { value: 'high', label: 'High' },
                  { value: 'medium', label: 'Medium' },
                  { value: 'low', label: 'Low' },
                ]} />
              )}
              {filtersActive && (
                <button onClick={() => setFilters(DEFAULT_FILTERS)}
                  className="rounded-full bg-rose-50 px-3 py-1.5 text-[12px] font-semibold text-rose-600 transition hover:bg-rose-100">
                  Clear
                </button>
              )}
              <div className="ml-auto">
                <ColumnPicker columns={allColumns} isVisible={(k) => isVisible(allColumns.find((c) => c.key === k)!)}
                  onToggle={(k) => setVisible((v) => ({ ...v, [k]: !isVisible(allColumns.find((c) => c.key === k)!) }))}
                  onReset={() => setVisible({})} />
              </div>
            </div>

            {loading ? (
              <div className="space-y-2.5 px-5 py-5">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-3 rounded-2xl border border-slate-100 px-3.5 py-3">
                    <div className="h-8 w-8 animate-pulse rounded-full bg-slate-100" />
                    <div className="flex-1 space-y-1.5">
                      <div className="h-3 w-1/3 animate-pulse rounded-full bg-slate-100" />
                      <div className="h-2.5 w-1/4 animate-pulse rounded-full bg-slate-50" />
                    </div>
                  </div>
                ))}
              </div>
            ) : paged.length === 0 ? (
              <EmptyState icon={tab === 'updates' ? History : Trash2}
                title={filtersActive ? `No matching ${tabLabel}` : `No ${tabLabel} yet`}
                hint={filtersActive ? 'Try adjusting your search or filters.'
                  : tab === 'updates' ? 'Changes to meetings, officers, users and contacts will appear here.'
                  : 'Records deleted from the app are archived here.'} />
            ) : (
              <>
                <LogTable records={paged} columns={shownColumns} sort={sort} onSort={toggleSort}
                  onOpen={(r) => setDrawer({ kind: 'details', record: r })} />
                <Pagination page={safePage} pages={pages} total={sorted.length}
                  start={(safePage - 1) * size + 1} end={Math.min(safePage * size, sorted.length)}
                  onPage={setPage} size={size} onSize={setSize} />
              </>
            )}
          </section>
        </div>
      </div>

      {/* Details */}
      <OffCanvas
        open={drawer.kind === 'details'} onClose={closeDrawer}
        title={tab === 'updates'
          ? (drawer.record?.update_type || 'Update details')
          : (drawer.record?.[NAME] || 'Deleted record')}
        subtitle={drawer.record?.[WHEN]
          ? `${tab === 'updates' ? 'Logged' : 'Deleted'} ${fmtDateTime(drawer.record[WHEN])}`
          : undefined}
        icon={tab === 'updates' ? <History className="h-5 w-5" /> : <Trash2 className="h-5 w-5" />}
      >
        {drawer.record && <DetailGrid record={drawer.record} />}
      </OffCanvas>

      {/* Export */}
      <OffCanvas
        open={drawer.kind === 'export'} onClose={closeDrawer}
        title="Export data" subtitle={`${filtered.length} ${tabLabel} · current filters and visible columns`}
        icon={<FileDown className="h-5 w-5" />}
        footer={(
          <div className="flex items-center gap-2">
            <button onClick={closeDrawer}
              className="rounded-full border border-slate-200 bg-white px-4 py-2 text-[12.5px] font-semibold text-slate-500 transition hover:bg-slate-50">Cancel</button>
            <button onClick={runExport}
              className="ml-auto rounded-full bg-slate-900 px-4 py-2 text-[12.5px] font-semibold text-white shadow-sm transition hover:bg-slate-800">
              Export {exportFormat.toUpperCase()}
            </button>
          </div>
        )}
      >
        <div className="space-y-5 p-5">
          <div>
            <p className="mb-2 text-[12px] font-semibold text-slate-600">What to export</p>
            <div className="space-y-2">
              {(['updates', 'deleted'] as const).map((t) => (
                <button key={t} onClick={() => switchTab(t)}
                  className={cx('flex w-full items-center gap-3 rounded-2xl border px-3.5 py-3 text-left transition',
                    tab === t ? 'border-violet-300 bg-violet-50/60 ring-1 ring-violet-200' : 'border-slate-200 hover:border-slate-300')}>
                  <span className={cx('flex h-4 w-4 items-center justify-center rounded-full border-2',
                    tab === t ? 'border-violet-600 bg-violet-600' : 'border-slate-300')}>
                    {tab === t && <span className="h-1.5 w-1.5 rounded-full bg-white" />}
                  </span>
                  <span>
                    <span className="block text-[13px] font-semibold text-slate-800">{t === 'updates' ? 'Update logs' : 'Deleted records'}</span>
                    <span className="block text-[11.5px] text-slate-400">
                      {t === 'updates' ? `${updates.length} entries` : `${deleted.length} entries`}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="mb-2 text-[12px] font-semibold text-slate-600">Format</p>
            <div className="grid grid-cols-4 gap-2">
              {FORMAT_OPTIONS.map(f => (
                <button key={f.key} onClick={() => setExportFormat(f.key)}
                  className={cx('flex flex-col items-center gap-1.5 rounded-2xl border py-3 transition',
                    exportFormat === f.key ? 'border-violet-300 bg-violet-50/60 ring-1 ring-violet-200' : 'border-slate-200 hover:border-slate-300')}>
                  <f.icon className={cx('h-4 w-4', exportFormat === f.key ? 'text-violet-600' : 'text-slate-400')} />
                  <span className={cx('text-[11px] font-bold', exportFormat === f.key ? 'text-violet-700' : 'text-slate-500')}>{f.label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </OffCanvas>

      <Toast toast={toast} />
    </div>
  );
}
