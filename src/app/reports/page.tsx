'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  Activity as ActivityIcon, AlertTriangle, ArrowUpDown, CalendarDays, CheckCircle2,
  ChevronDown, ChevronUp, Clock, Database, ExternalLink, FileDown, FileJson,
  FileSpreadsheet, FileText, Pencil, Plus, Printer, RefreshCw, Target, Trash2, Zap,
} from 'lucide-react';
import pb from '@/lib/pocketbase';
import ActivityLog, { type ActivityLogHandle, type ActivityStats } from '@/components/reports/ActivityLog';
import TimeReport from '@/components/reports/TimeReport';
import {
  ACTION_KEYS, COLUMN_LABELS, DETAILS_KEYS, FIELD_CLS, FILE_KEYS, HIDDEN_KEYS,
  REPORT_DEFAULT_VISIBLE, REPORT_PREFERRED, STATUS_KEYS, TONES, USER_KEYS,
  buildFieldDefs, cx, deltaPct, downloadDataset, fetchAllRecords, findFileUrl,
  fmtDate, fmtDateTime, humanize, normalizeRecord, OffCanvas, pageList, Pagination,
  Pill, statusBucket, statusTone, timeAgo, Toast, TrendChip,
  ColumnPicker, EmptyState, FilterSelect, SearchInput,
  sortRecords,
  type ColumnDef, type ExportFormat, type FieldDef, type RecordItem, type SortState,
} from '@/lib/reports-utils';

/* ───────── Local pieces ───────── */

const FORMAT_OPTIONS: { key: ExportFormat; label: string; icon: LucideIcon }[] = [
  { key: 'csv', label: 'CSV', icon: FileText },
  { key: 'excel', label: 'Excel', icon: FileSpreadsheet },
  { key: 'json', label: 'JSON', icon: FileJson },
  { key: 'pdf', label: 'PDF', icon: Printer },
];

const DAY_FULL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function currentUser(): string {
  const m: any = (pb as any).authStore?.model;
  return m?.name || m?.email?.split('@')[0] || 'admin';
}

function computeAnalytics(scoped: RecordItem[]) {
  const statusOf = (m: RecordItem) => (m.status || '').toLowerCase();
  const totalMeetings = scoped.length;
  const completedMeetings = scoped.filter(m => statusOf(m) === 'completed').length;
  const scheduledMeetings = scoped.filter(m => statusOf(m) === 'scheduled').length;
  const cancelledMeetings = scoped.filter(m => statusOf(m) === 'cancelled').length;
  const rescheduledMeetings = scoped.filter(m => statusOf(m) === 'rescheduled').length;
  const totalDuration = scoped.reduce((acc, m) => acc + (parseInt(m.duration) || 0), 0);
  const avgDuration = totalMeetings ? Math.round(totalDuration / totalMeetings) : 0;
  const decided = completedMeetings + cancelledMeetings;
  const health = decided ? Math.round((completedMeetings / decided) * 100) : null;

  const dayActivity = Array(7).fill(0);
  scoped.forEach(m => {
    const d = new Date(m.meeting_date || m.created || 0);
    if (!isNaN(d.getTime())) dayActivity[d.getDay()] += 1;
  });
  const maxDay = Math.max(...dayActivity, 0);
  const busiestDay = maxDay > 0 ? { name: DAY_FULL[dayActivity.indexOf(maxDay)], count: maxDay } : null;

  const meetingTypes: Record<string, number> = {};
  scoped.forEach(m => { const t = m.meeting_type || 'Other'; meetingTypes[t] = (meetingTypes[t] || 0) + 1; });

  const officerCount: Record<string, { count: number; type: string }> = {};
  scoped.forEach(m => {
    if (m.officer_name) {
      officerCount[m.officer_name] ??= { count: 0, type: m.officer_type || '—' };
      officerCount[m.officer_name].count += 1;
    }
  });
  const topOfficers = Object.entries(officerCount).sort(([, a], [, b]) => b.count - a.count).slice(0, 5)
    .map(([name, v]) => ({ name, ...v }));

  const now = new Date();
  const monthlyData: { month: string; count: number }[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const count = scoped.filter(m => {
      const md = new Date(m.meeting_date || m.created || 0);
      return md.getMonth() === d.getMonth() && md.getFullYear() === d.getFullYear();
    }).length;
    monthlyData.push({ month: d.toLocaleString('en-US', { month: 'short' }), count });
  }

  return {
    totalMeetings, completedMeetings, scheduledMeetings, cancelledMeetings,
    rescheduledMeetings, totalDuration, avgDuration, health,
    decided, busiestDay, meetingTypes, topOfficers, monthlyData,
  };
}

function summaryRows(a: ReturnType<typeof computeAnalytics>, reportStats: { count: number }, activityStats: ActivityStats): Record<string, string>[] {
  const rows: Record<string, string>[] = [
    { Metric: 'Meeting health', Value: a.health != null ? `${a.health}%` : 'n/a' },
    { Metric: 'Total meetings', Value: String(a.totalMeetings) },
    { Metric: 'Completed', Value: String(a.completedMeetings) },
    { Metric: 'Scheduled', Value: String(a.scheduledMeetings) },
    { Metric: 'Cancelled', Value: String(a.cancelledMeetings) },
    { Metric: 'Rescheduled', Value: String(a.rescheduledMeetings) },
    { Metric: 'Avg duration (min)', Value: String(a.avgDuration) },
    { Metric: 'Total time in meetings (min)', Value: String(a.totalDuration) },
    { Metric: 'Busiest day', Value: a.busiestDay ? `${a.busiestDay.name} (${a.busiestDay.count} meetings)` : 'n/a' },
    { Metric: 'Reports generated (all time)', Value: String(reportStats.count) },
    { Metric: 'Activity entries (all time)', Value: String(activityStats.count) },
  ];
  a.topOfficers.forEach((o, i) => rows.push({ Metric: `Most active #${i + 1}`, Value: `${o.name} (${o.type}) — ${o.count} meetings` }));
  Object.entries(a.meetingTypes).forEach(([t, c]) => rows.push({ Metric: `Type: ${t}`, Value: String(c) }));
  return rows;
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

/* ── Reports table ── */
function GenericTable({
  records, columns, isVisible, sortKey, sortDir, onSort, onOpen, onEdit, onRequestDelete,
  pendingDeleteId, onConfirmDelete, onCancelDelete, renderCell,
}: {
  records: RecordItem[]; columns: ColumnDef[]; isVisible: (key: string) => boolean;
  sortKey: string | null; sortDir: 'asc' | 'desc'; onSort: (key: string) => void;
  onOpen: (r: RecordItem) => void; onEdit: (r: RecordItem) => void; onRequestDelete: (r: RecordItem) => void;
  pendingDeleteId: string | null; onConfirmDelete: () => void; onCancelDelete: () => void;
  renderCell: (key: string, r: RecordItem) => ReactNode;
}) {
  const cols = columns.filter(c => isVisible(c.key));
  if (!cols.length) {
    return <div className="px-6 py-12 text-center text-[12.5px] text-slate-400">All columns are hidden — enable some from the Columns menu.</div>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[820px] border-collapse">
        <thead>
          <tr className="border-b border-slate-100 bg-slate-50/70">
            {cols.map(c => (
              <th key={c.key} className="whitespace-nowrap px-4 py-2.5 text-left align-middle">
                <button onClick={() => onSort(c.key)} title="Sort by this column"
                  className="group inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400 transition hover:text-slate-700">
                  {c.label}
                  {sortKey === c.key
                    ? (sortDir === 'asc' ? <ChevronUp className="h-3 w-3 text-violet-500" /> : <ChevronDown className="h-3 w-3 text-violet-500" />)
                    : <ArrowUpDown className="h-3 w-3 opacity-0 transition group-hover:opacity-60" />}
                </button>
              </th>
            ))}
            <th className="py-2.5 pl-4 pr-6 text-right text-[11px] font-semibold uppercase tracking-wider text-slate-400">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {records.map(r => {
            const confirming = pendingDeleteId === r.id;
            return (
              <tr key={r.id} onClick={confirming ? undefined : () => onOpen(r)}
                className={cx('transition-colors', confirming ? 'bg-rose-50/70' : 'cursor-pointer hover:bg-violet-50/50')}>
                {cols.map(c => <td key={c.key} className="px-4 py-3 align-middle">{renderCell(c.key, r)}</td>)}
                <td className="py-3 pl-4 pr-6 align-middle">
                  {confirming ? (
                    <div className="flex items-center justify-end gap-1.5">
                      <button onClick={e => { e.stopPropagation(); onConfirmDelete(); }}
                        className="rounded-full bg-rose-600 px-3 py-1.5 text-[11.5px] font-semibold text-white transition hover:bg-rose-700">Delete</button>
                      <button onClick={e => { e.stopPropagation(); onCancelDelete(); }}
                        className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[11.5px] font-semibold text-slate-500 transition hover:bg-slate-50">Cancel</button>
                    </div>
                  ) : (
                    <div className="flex items-center justify-end gap-1">
                      <button onClick={e => { e.stopPropagation(); onEdit(r); }} title="Edit record"
                        className="rounded-lg p-1.5 text-slate-400 transition hover:bg-violet-50 hover:text-violet-600"><Pencil className="h-4 w-4" /></button>
                      <button onClick={e => { e.stopPropagation(); onRequestDelete(r); }} title="Delete record"
                        className="rounded-lg p-1.5 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600"><Trash2 className="h-4 w-4" /></button>
                    </div>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/* ── Cell rendering for reports ── */
function renderGeneric(v: any): ReactNode {
  if (v == null || v === '' || v === 'N/A') return <span className="text-slate-300">—</span>;
  if (typeof v === 'boolean') return <Pill tone={v ? 'emerald' : 'slate'}>{v ? 'Yes' : 'No'}</Pill>;
  if (typeof v === 'object') {
    const s = JSON.stringify(v);
    return <span className="block max-w-[200px] truncate font-mono text-[11.5px] text-slate-500" title={s}>{s}</span>;
  }
  const s = String(v);
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(s)) return <span className="whitespace-nowrap text-[12.5px] text-slate-500">{fmtDateTime(s)}</span>;
  return <span className="block max-w-[200px] truncate text-[12.5px] text-slate-600" title={s}>{s}</span>;
}

function renderCell(key: string, r: RecordItem): ReactNode {
  const v = r[key];
  if (key === 'created') return <span className="whitespace-nowrap text-[12.5px] text-slate-500">{fmtDateTime(r.created)}</span>;
  if (key === 'title') return <span className="block max-w-[220px] truncate text-[13px] font-semibold text-slate-800" title={String(v ?? '')}>{String(v ?? '') || '—'}</span>;
  if (key === 'report_type' || ACTION_KEYS.includes(key)) {
    const s = String(v ?? '');
    return <span className="block max-w-[170px] truncate text-[12.5px] font-medium text-slate-700" title={s}>{s || '—'}</span>;
  }
  if (STATUS_KEYS.includes(key)) {
    const s = String(v ?? '');
    if (!s) return <span className="text-slate-300">—</span>;
    return <Pill dot tone={statusTone(s)}>{s}</Pill>;
  }
  if (USER_KEYS.includes(key)) {
    const name = String(v ?? '') || 'System';
    return (
      <span className="inline-flex items-center gap-2 whitespace-nowrap">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-indigo-600 text-[10px] font-bold text-white">
          {name.charAt(0).toUpperCase()}
        </span>
        <span className="max-w-[120px] truncate text-[12.5px] text-slate-600" title={name}>{name}</span>
      </span>
    );
  }
  if (DETAILS_KEYS.includes(key)) {
    const s = v == null ? '' : String(v);
    return <span className="block max-w-[280px] truncate text-[12.5px] text-slate-500" title={s}>{s || '—'}</span>;
  }
  switch (key) {
    case 'format': {
      const f = String(v ?? '').toUpperCase();
      return f
        ? <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10.5px] font-bold tracking-wide text-slate-500">{f}</span>
        : <span className="text-slate-300">—</span>;
    }
    case 'date_from': case 'date_to': case 'meeting_date':
      return <span className="whitespace-nowrap text-[12.5px] text-slate-600">{fmtDate(String(v ?? ''))}</span>;
    case 'officer_type': {
      const s = String(v ?? '');
      return s ? <Pill tone={s === 'IAS' ? 'indigo' : s === 'IPS' ? 'slate' : 'violet'}>{s}</Pill> : <span className="text-slate-300">—</span>;
    }
    default:
      return renderGeneric(v);
  }
}

/* ── Details drawer grid ── */
function DetailGrid({ record }: { record: RecordItem }) {
  const skip = new Set([...HIDDEN_KEYS, 'updated']);
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
                  : /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(String(v)) ? fmtDateTime(String(v)) : String(v)}
              </span>
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/* ── Create / Edit form ── */
function RecordForm({ fields, values, onChange }: {
  fields: FieldDef[]; values: Record<string, string>; onChange: (k: string, v: string) => void;
}) {
  if (!fields.length) return <p className="p-5 text-[12.5px] text-slate-400">No fields detected yet.</p>;
  return (
    <div className="space-y-4 p-5">
      {fields.map(f => (
        <div key={f.key}>
          <label className="mb-1.5 block text-[12px] font-semibold text-slate-600">{f.label}</label>
          {f.type === 'select' ? (() => {
            const opts = f.options ?? [];
            const current = values[f.key] ?? '';
            const list = current && !opts.includes(current) ? [current, ...opts] : opts;
            return (
              <select value={current} onChange={e => onChange(f.key, e.target.value)} className={cx(FIELD_CLS, 'cursor-pointer')}>
                <option value="">— none —</option>
                {list.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            );
          })() : f.type === 'textarea' ? (
            <textarea rows={3} value={values[f.key] ?? ''} onChange={e => onChange(f.key, e.target.value)}
              placeholder={`Enter ${f.label.toLowerCase()}…`} className={cx(FIELD_CLS, 'resize-y')} />
          ) : (
            <input type={f.type === 'date' ? 'date' : 'text'} value={values[f.key] ?? ''}
              onChange={e => onChange(f.key, e.target.value)}
              placeholder={`Enter ${f.label.toLowerCase()}…`} className={FIELD_CLS} />
          )}
        </div>
      ))}
    </div>
  );
}

/* ───────── Main page ───────── */

const DEFAULT_RF = { q: '', type: 'all', format: 'all', status: 'all' };

export default function ReportsPage() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [fetchWarnings, setFetchWarnings] = useState<string[]>([]);
  const [syncedAt, setSyncedAt] = useState<string>('');

  const [meetings, setMeetings] = useState<RecordItem[]>([]);
  const [reports, setReports] = useState<RecordItem[]>([]);

  const [tab, setTab] = useState<'reports' | 'activity' | 'time'>('reports');

  const [rf, setRf] = useState(DEFAULT_RF);
  const [rPage, setRPage] = useState(1);
  const [rSize, setRSize] = useState(25);
  const [rSort, setRSort] = useState<SortState | null>(null);
  const [rVisible, setRVisible] = useState<Record<string, boolean>>({});

  const [drawer, setDrawer] = useState<{ kind: 'report' | 'form' | 'export' | null; record?: RecordItem; collection?: string }>({ kind: null });
  const [formValues, setFormValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<{ id: string; collection: string } | null>(null);
  const [drawerDeleteConfirm, setDrawerDeleteConfirm] = useState(false);

  const [exportTarget, setExportTarget] = useState<'summary' | 'reports' | 'activity'>('summary');
  const [exportFormat, setExportFormat] = useState<ExportFormat>('csv');

  const [toast, setToast] = useState<{ kind: 'ok' | 'err'; msg: string } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const activityRef = useRef<ActivityLogHandle>(null);
  const [activityStats, setActivityStats] = useState<ActivityStats>({ count: 0, recent: 0, trend: null });
  const handleActivityStats = useCallback((s: ActivityStats) => setActivityStats(s), []);

  const notify = (kind: 'ok' | 'err', msg: string) => {
    setToast({ kind, msg });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 4000);
  };

  /* ── Data ── */
  async function loadReportData(silent = false) {
    try {
      setError('');
      if (silent) setRefreshing(true); else setLoading(true);
      const warnings: string[] = [];
      const [m, rh] = await Promise.all([
        fetchAllRecords('meetings', '-meeting_date').catch(() => { warnings.push('meetings'); return [] as RecordItem[]; }),
        fetchAllRecords('report_history', '-created').catch(() => { warnings.push('report_history'); return [] as RecordItem[]; }),
      ]);
      setFetchWarnings(warnings);
      setMeetings(m);
      setReports(rh);
      setSyncedAt(new Date().toISOString());
    } catch (e: any) {
      console.error('Failed to load reports:', e);
      setError(e?.message || 'Unable to reach the server. Check your connection and try again.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => { loadReportData(); }, []);

  /* ── Analytics & stats ── */
  const a = useMemo(() => computeAnalytics(meetings), [meetings]);

  const reportStats = useMemo(() => {
    const cutoff = Date.now() - 30 * 86400000;
    const prevCutoff = cutoff - 30 * 86400000;
    const recent = reports.filter(r => new Date(r.created || 0).getTime() >= cutoff).length;
    const prev = reports.filter(r => { const t = new Date(r.created || 0).getTime(); return t >= prevCutoff && t < cutoff; }).length;
    const typeCounts: Record<string, number> = {};
    reports.forEach(r => { const t = r.report_type; if (t) typeCounts[t] = (typeCounts[t] || 0) + 1; });
    const top = Object.entries(typeCounts).sort((x, y) => y[1] - x[1])[0];
    return { count: reports.length, recent, trend: deltaPct(recent, prev), last: reports[0]?.created, topType: top?.[0] ?? null };
  }, [reports]);

  const reportHealth = useMemo(() => {
    const total = reports.length;
    const failed = reports.filter(r => statusBucket(r.status) === 'failed').length;
    const pending = reports.filter(r => statusBucket(r.status) === 'pending').length;
    const success = Math.max(total - failed - pending, 0);
    return { total, failed, pending, success, rate: total ? Math.round((success / total) * 100) : null };
  }, [reports]);

  /* ── Columns ── */
  const reportColumns = useMemo<ColumnDef[]>(() => {
    const keys = new Set<string>();
    reports.forEach(r => Object.keys(r).forEach(k => { if (!HIDDEN_KEYS.includes(k) && k !== 'updated') keys.add(k); }));
    const ordered = [...REPORT_PREFERRED.filter(p => keys.has(p)), ...Array.from(keys).filter(k => !REPORT_PREFERRED.includes(k)).sort()];
    return ordered.map(k => ({ key: k, label: COLUMN_LABELS[k] ?? humanize(k) }));
  }, [reports]);

  const isReportColVisible = (k: string) => rVisible[k] ?? REPORT_DEFAULT_VISIBLE.has(k);
  const toggleReportCol = (k: string) => setRVisible(v => ({ ...v, [k]: !isReportColVisible(k) }));

  /* ── Form fields ── */
  const reportFields = useMemo<FieldDef[]>(() => {
    const preferred = ['title', 'report_type', 'status', 'format', 'department', 'officer_type', 'date_from', 'date_to', 'generated_by'];
    const defs = buildFieldDefs(reports, preferred);
    return defs.length ? defs : preferred.map(k => ({ key: k, label: humanize(k), type: (k.startsWith('date') ? 'date' : 'text') as FieldDef['type'] }));
  }, [reports]);

  /* ── Drawer helpers ── */
  const openDetails = (r: RecordItem) => { setDrawerDeleteConfirm(false); setDrawer({ kind: 'report', record: r, collection: 'report_history' }); };
  const openForm = (record?: RecordItem) => {
    const values: Record<string, string> = {};
    reportFields.forEach(f => {
      const raw = record?.[f.key];
      values[f.key] = raw == null ? '' : f.type === 'date' ? String(raw).slice(0, 10) : String(raw);
    });
    setFormValues(values);
    setDrawerDeleteConfirm(false);
    setDrawer({ kind: 'form', record, collection: 'report_history' });
  };
  const openExport = () => setDrawer({ kind: 'export' });
  const closeDrawer = () => setDrawer(d => (d.kind === null ? d : { ...d, kind: null }));

  /* ── Filtering ── */
  const matches = (r: RecordItem, q: string) => Object.values(r).some(v => typeof v === 'string' && v.toLowerCase().includes(q));

  const filteredReports = useMemo(() => {
    const q = rf.q.trim().toLowerCase();
    return reports.filter(r => {
      if (q && !matches(r, q)) return false;
      if (rf.type !== 'all' && (r.report_type || '') !== rf.type) return false;
      if (rf.format !== 'all' && (r.format || '').toUpperCase() !== rf.format) return false;
      if (rf.status !== 'all' && statusBucket(r.status) !== rf.status) return false;
      return true;
    });
  }, [reports, rf]);

  useEffect(() => { setRPage(1); }, [rf]);

  const sortedReports = useMemo(() => (rSort ? sortRecords(filteredReports, rSort.key, rSort.dir) : filteredReports), [filteredReports, rSort]);

  const rTotal = filteredReports.length;
  const rPages = Math.max(1, Math.ceil(rTotal / rSize));
  const safeRPage = Math.min(rPage, rPages);
  const pagedReports = useMemo(
    () => sortedReports.slice((safeRPage - 1) * rSize, safeRPage * rSize),
    [sortedReports, safeRPage, rSize],
  );

  const typeOptions = useMemo(() => {
    const set = new Set<string>();
    reports.forEach(r => r.report_type && set.add(r.report_type));
    return [{ value: 'all', label: 'All types' }, ...Array.from(set).sort().map(v => ({ value: v, label: v }))];
  }, [reports]);

  /* ── CRUD + export (each action is written to the activity log) ── */
  async function saveRecord() {
    const { collection, record } = drawer;
    if (!collection) return;
    setSaving(true);
    try {
      if (record) await pb.collection(collection).update(record.id, formValues);
      else await pb.collection(collection).create(formValues);
      notify('ok', record ? 'Record updated' : 'Report created');
      activityRef.current?.push({
        action: record ? 'report.updated' : 'report.created',
        user: currentUser(),
        status: 'success',
        details: `${formValues.title || 'Untitled report'} ${record ? 'updated' : 'created'}`,
      });
      closeDrawer();
      await loadReportData(true);
    } catch (e: any) {
      notify('err', e?.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  async function performDelete(id: string, collection: string) {
    try {
      await pb.collection(collection).delete(id);
      notify('ok', 'Record deleted');
      activityRef.current?.push({
        action: 'report.deleted',
        user: currentUser(),
        status: 'success',
        details: `Deleted report ${id}`,
      });
      setPendingDelete(null);
      setDrawerDeleteConfirm(false);
      closeDrawer();
      await loadReportData(true);
    } catch (e: any) {
      notify('err', e?.message || 'Delete failed');
    }
  }

  function runExport() {
    let rows: Record<string, any>[] = [];
    let title = 'Export';
    if (exportTarget === 'summary') { rows = summaryRows(a, reportStats, activityStats); title = 'Reports Summary'; }
    else if (exportTarget === 'reports') { rows = filteredReports.map(normalizeRecord); title = 'Reports'; }
    else { rows = activityRef.current?.getRows() ?? []; title = 'Activity Log'; }
    if (!rows.length) { notify('err', 'Nothing to export for this target'); return; }
    downloadDataset(exportFormat, title, rows);
    activityRef.current?.push({
      action: 'export.generated',
      user: currentUser(),
      status: 'success',
      details: `${title} → ${exportFormat.toUpperCase()} · ${rows.length} rows`,
    });
    notify('ok', `Exported ${rows.length} rows as ${exportFormat.toUpperCase()}`);
    closeDrawer();
  }

  const fileUrl = drawer.record ? findFileUrl(drawer.record) : null;

  return (
    <div className="relative min-h-screen bg-gradient-to-br from-indigo-200 via-violet-100 to-purple-200 p-2.5 sm:p-5 lg:p-8">
      {/* Ambient blobs */}
      <div aria-hidden className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -left-32 -top-32 h-96 w-96 rounded-full bg-violet-300/40 blur-3xl" />
        <div className="absolute -right-32 top-1/4 h-96 w-96 rounded-full bg-sky-300/30 blur-3xl" />
        <div className="absolute -bottom-32 left-1/3 h-96 w-96 rounded-full bg-fuchsia-300/25 blur-3xl" />
      </div>

      <div className="relative mx-auto max-w-[1500px] overflow-hidden rounded-[1.75rem] bg-white shadow-2xl shadow-violet-300/40 ring-1 ring-white/70">

        {/* ── App bar ── */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 bg-white px-4 py-3.5 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-900 text-white shadow-sm">
              <FileText className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <p className="truncate text-sm font-bold text-slate-900">Reports &amp; Activity</p>
                <span className="rounded-full bg-violet-50 px-2 py-0.5 text-[10px] font-bold tabular-nums text-violet-600 ring-1 ring-inset ring-violet-500/15">
                  {reports.length}
                </span>
              </div>
              <p className="truncate text-[11px] text-slate-400">
                {syncedAt ? `Synced ${timeAgo(syncedAt)}` : 'Loading…'} · {activityStats.count} activity entries
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button onClick={() => loadReportData(true)} aria-label="Refresh data"
              className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 transition-colors hover:border-violet-200 hover:text-violet-600">
              <RefreshCw className={cx('h-4 w-4', refreshing && 'animate-spin')} />
            </button>
            <button onClick={openExport}
              className="inline-flex h-10 items-center gap-1.5 rounded-full border border-slate-200 bg-white px-4 text-[12.5px] font-semibold text-slate-600 transition-colors hover:border-violet-200 hover:text-violet-600">
              <FileDown className="h-3.5 w-3.5" /> Export
            </button>
            <button onClick={() => openForm()}
              className="inline-flex h-10 items-center gap-1.5 rounded-full bg-slate-900 px-5 text-[12.5px] font-semibold text-white shadow-lg shadow-slate-900/10 transition-all hover:-translate-y-0.5 hover:bg-slate-800 active:scale-[0.98]">
              <Plus className="h-3.5 w-3.5" /> New Report
            </button>
          </div>
        </div>

        {/* ── Content ── */}
        <div className="space-y-5 bg-[#f7f6fd] p-4 sm:p-6 lg:p-7">

          {/* Error / warnings */}
          {error && (
            <div className="flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-500" />
              <span className="flex-1 text-[13px] text-rose-700">{error}</span>
              <button onClick={() => loadReportData()} className="shrink-0 rounded-full bg-white px-3.5 py-1.5 text-[11.5px] font-semibold text-rose-600 ring-1 ring-rose-200 transition hover:bg-rose-100">Retry</button>
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
            <StatCard icon={Database} label="Total reports" value={reportStats.count}
              sub={reportStats.topType ? `Top type: ${reportStats.topType}` : 'All time'}
              trend={reportStats.trend} card="from-violet-100 to-purple-100" tint="text-violet-600" />
            <StatCard icon={Target} label="Success rate" value={reportHealth.rate != null ? `${reportHealth.rate}%` : '—'}
              sub={`${reportHealth.success} ok · ${reportHealth.failed} failed · ${reportHealth.pending} pending`}
              card="from-emerald-100 to-green-100" tint="text-emerald-600" />
            <StatCard icon={Zap} label="Generated · 30 days" value={reportStats.recent}
              sub={`Last: ${timeAgo(reportStats.last) || '—'}`}
              trend={reportStats.trend} card="from-amber-100 to-orange-100" tint="text-amber-600" />
            <StatCard icon={ActivityIcon} label="Activity entries" value={activityStats.count}
              sub={`${activityStats.recent} in the last 30 days`}
              trend={activityStats.trend} card="from-sky-100 to-blue-100" tint="text-sky-600" />
          </div>

          {/* Meetings snapshot strip */}
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-3xl bg-white px-5 py-3.5 shadow-sm ring-1 ring-slate-100">
            <span className="flex items-center gap-2 text-[12.5px] text-slate-500">
              <CalendarDays className="h-4 w-4 text-slate-400" /> <b className="text-slate-800">{a.totalMeetings}</b> meetings
            </span>
            <span className="flex items-center gap-2 text-[12.5px] text-slate-500">
              <CheckCircle2 className="h-4 w-4 text-emerald-500" /> <b className="text-slate-800">{a.completedMeetings}</b> completed
            </span>
            <span className="flex items-center gap-2 text-[12.5px] text-slate-500">
              <Clock className="h-4 w-4 text-slate-400" /> avg <b className="text-slate-800">{a.avgDuration}m</b> · {Math.round(a.totalDuration / 60)}h total
            </span>
            <span className="flex items-center gap-2 text-[12.5px] text-slate-500">
              <Zap className="h-4 w-4 text-amber-500" /> Busiest: <b className="text-slate-800">{a.busiestDay ? `${a.busiestDay.name} (${a.busiestDay.count})` : '—'}</b>
            </span>
          </div>

          {/* Tabs */}
          <div className="inline-flex rounded-full bg-slate-100 p-1">
            <TabButton active={tab === 'reports'} onClick={() => setTab('reports')} icon={FileText} label="Reports" count={reports.length} />
            <TabButton active={tab === 'activity'} onClick={() => setTab('activity')} icon={ActivityIcon} label="Activity" count={activityStats.count} />
            <TabButton active={tab === 'time'} onClick={() => setTab('time')} icon={Clock} label="Time" count={meetings.length} />
          </div>

          {/* Reports tab */}
          {tab === 'reports' && (
            <section className="overflow-hidden rounded-3xl bg-white shadow-sm ring-1 ring-slate-100">
              <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-5 py-3.5">
                <SearchInput value={rf.q} onChange={v => setRf(f => ({ ...f, q: v }))} placeholder="Search reports…" />
                <FilterSelect label="Type" value={rf.type} onChange={v => setRf(f => ({ ...f, type: v }))} options={typeOptions} />
                <FilterSelect label="Format" value={rf.format} onChange={v => setRf(f => ({ ...f, format: v }))} options={[
                  { value: 'all', label: 'All formats' },
                  ...['CSV', 'EXCEL', 'JSON', 'PDF'].map(f => ({ value: f, label: f })),
                ]} />
                <FilterSelect label="Status" value={rf.status} onChange={v => setRf(f => ({ ...f, status: v }))} options={[
                  { value: 'all', label: 'All statuses' },
                  { value: 'success', label: 'Completed' },
                  { value: 'pending', label: 'Pending' },
                  { value: 'failed', label: 'Failed' },
                ]} />
                <div className="ml-auto">
                  <ColumnPicker columns={reportColumns} isVisible={isReportColVisible} onToggle={toggleReportCol}
                    onReset={() => setRVisible({})} />
                </div>
              </div>

              {loading ? (
                <div className="space-y-2.5 px-5 py-5">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className="flex items-center gap-3 rounded-2xl border border-slate-100 px-3.5 py-3">
                      <div className="h-8 w-8 animate-pulse rounded-full bg-slate-100" />
                      <div className="flex-1 space-y-1.5">
                        <div className="h-3 w-1/3 animate-pulse rounded-full bg-slate-100" />
                        <div className="h-2.5 w-1/4 animate-pulse rounded-full bg-slate-50" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : pagedReports.length === 0 ? (
                <EmptyState icon={FileText} title={rf.q || rf.type !== 'all' || rf.status !== 'all' ? 'No matching reports' : 'No reports yet'}
                  hint={rf.q ? 'Try adjusting your search or filters.' : 'Generated reports will appear here.'}
                  action={<button onClick={() => openForm()} className="inline-flex items-center gap-1.5 rounded-full bg-slate-900 px-4 py-2.5 text-[12.5px] font-semibold text-white transition-all hover:-translate-y-0.5 hover:bg-slate-800">
                    <Plus className="h-3.5 w-3.5" /> Create report
                  </button>} />
              ) : (
                <>
                  <GenericTable
                    records={pagedReports} columns={reportColumns} isVisible={isReportColVisible}
                    sortKey={rSort?.key ?? null} sortDir={rSort?.dir ?? 'asc'}
                    onSort={k => setRSort(s => (s && s.key === k ? { key: k, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key: k, dir: 'desc' }))}
                    onOpen={openDetails} onEdit={r => openForm(r)}
                    onRequestDelete={r => setPendingDelete({ id: r.id, collection: 'report_history' })}
                    pendingDeleteId={pendingDelete?.id ?? null}
                    onConfirmDelete={() => pendingDelete && performDelete(pendingDelete.id, pendingDelete.collection)}
                    onCancelDelete={() => setPendingDelete(null)}
                    renderCell={renderCell}
                  />
                  <Pagination page={safeRPage} pages={rPages} total={rTotal}
                    start={(safeRPage - 1) * rSize + 1} end={Math.min(safeRPage * rSize, rTotal)}
                    onPage={setRPage} size={rSize} onSize={setRSize} />
                </>
              )}
            </section>
          )}

          {/* Activity tab — standalone component, own collection */}
          {tab === 'activity' && (
            <ActivityLog ref={activityRef} onStats={handleActivityStats} title="Activity Log" />
          )}

          {/* Time tab — hours by department + monthly cancellation / reschedule rates */}
          {tab === 'time' && <TimeReport meetings={meetings} />}
        </div>
      </div>

      {/* ── Drawers (OffCanvas shell comes from reports-utils) ── */}

      {/* Details */}
      <OffCanvas
        open={drawer.kind === 'report'} onClose={closeDrawer}
        title="Report details"
        subtitle={drawer.record ? `Created ${fmtDateTime(drawer.record.created)}` : undefined}
        icon={<FileText className="h-5 w-5" />}
        footer={drawer.record ? (
          <div className="flex items-center gap-2">
            {fileUrl && (
              <a href={fileUrl} target="_blank" rel="noreferrer"
                className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3.5 py-2 text-[12.5px] font-semibold text-slate-600 transition hover:text-slate-800">
                <ExternalLink className="h-3.5 w-3.5" /> Open file
              </a>
            )}
            <div className="ml-auto flex items-center gap-2">
              {drawerDeleteConfirm ? (
                <>
                  <span className="text-[12px] font-medium text-rose-600">Delete this report?</span>
                  <button onClick={() => drawer.record && performDelete(drawer.record.id, drawer.collection || 'report_history')}
                    className="rounded-full bg-rose-600 px-3.5 py-2 text-[12.5px] font-semibold text-white transition hover:bg-rose-700">Yes, delete</button>
                  <button onClick={() => setDrawerDeleteConfirm(false)}
                    className="rounded-full border border-slate-200 bg-white px-3.5 py-2 text-[12.5px] font-semibold text-slate-500 transition hover:bg-slate-50">Cancel</button>
                </>
              ) : (
                <>
                  <button onClick={() => drawer.record && openForm(drawer.record)}
                    className="inline-flex items-center gap-1.5 rounded-full bg-slate-900 px-4 py-2 text-[12.5px] font-semibold text-white transition hover:bg-slate-800">
                    <Pencil className="h-3.5 w-3.5" /> Edit
                  </button>
                  <button onClick={() => setDrawerDeleteConfirm(true)}
                    className="inline-flex items-center gap-1.5 rounded-full border border-rose-200 bg-rose-50 px-3.5 py-2 text-[12.5px] font-semibold text-rose-600 transition hover:bg-rose-100">
                    <Trash2 className="h-3.5 w-3.5" /> Delete
                  </button>
                </>
              )}
            </div>
          </div>
        ) : undefined}
      >
        {drawer.record && <DetailGrid record={drawer.record} />}
      </OffCanvas>

      {/* Create / Edit */}
      <OffCanvas
        open={drawer.kind === 'form'} onClose={closeDrawer}
        title={drawer.record ? 'Edit report' : 'New report'}
        subtitle={drawer.record ? drawer.record.id : 'Fill in the fields — they mirror your collection schema'}
        icon={<Pencil className="h-5 w-5" />}
        footer={(
          <div className="flex items-center gap-2">
            <div className="ml-auto flex items-center gap-2">
              <button onClick={closeDrawer}
                className="rounded-full border border-slate-200 bg-white px-4 py-2 text-[12.5px] font-semibold text-slate-500 transition hover:bg-slate-50">Cancel</button>
              <button onClick={saveRecord} disabled={saving}
                className="rounded-full bg-slate-900 px-4 py-2 text-[12.5px] font-semibold text-white shadow-sm transition hover:bg-slate-800 disabled:opacity-60">
                {saving ? 'Saving…' : drawer.record ? 'Save changes' : 'Create report'}
              </button>
            </div>
          </div>
        )}
      >
        <RecordForm fields={reportFields} values={formValues} onChange={(k, v) => setFormValues(vals => ({ ...vals, [k]: v }))} />
      </OffCanvas>

      {/* Export */}
      <OffCanvas
        open={drawer.kind === 'export'} onClose={closeDrawer}
        title="Export data" subtitle="Choose a target and file format"
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
              {([
                { key: 'summary', label: 'Analytics summary', hint: 'Meetings KPIs, reports & activity totals' },
                { key: 'reports', label: 'Reports table', hint: `${filteredReports.length} filtered rows` },
                { key: 'activity', label: 'Activity log', hint: `${activityStats.count} stored entries` },
              ] as const).map(t => (
                <button key={t.key} onClick={() => setExportTarget(t.key)}
                  className={cx('flex w-full items-center gap-3 rounded-2xl border px-3.5 py-3 text-left transition',
                    exportTarget === t.key ? 'border-violet-300 bg-violet-50/60 ring-1 ring-violet-200' : 'border-slate-200 hover:border-slate-300')}>
                  <span className={cx('flex h-4 w-4 items-center justify-center rounded-full border-2',
                    exportTarget === t.key ? 'border-violet-600 bg-violet-600' : 'border-slate-300')}>
                    {exportTarget === t.key && <span className="h-1.5 w-1.5 rounded-full bg-white" />}
                  </span>
                  <span>
                    <span className="block text-[13px] font-semibold text-slate-800">{t.label}</span>
                    <span className="block text-[11.5px] text-slate-400">{t.hint}</span>
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