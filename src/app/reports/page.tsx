'use client';

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  Activity, AlertCircle, AlertTriangle, ArrowUpDown, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, ChevronUp,
  Database, Download, ExternalLink, FileDown, FileJson, FileSpreadsheet, FileText,
  History, Minus, Pencil, Plus, Printer, RefreshCw, Search, SlidersHorizontal, Target,
  TrendingDown, TrendingUp, Trash2, X, Zap,
} from 'lucide-react';
import pb from '@/lib/pocketbase';

/* ───────── Types & constants ───────── */

type RecordItem = Record<string, any> & { id: string };
type DrawerKind = 'report' | 'log' | 'export' | 'form' | null;
type ExportFormat = 'csv' | 'excel' | 'json' | 'pdf';
type ExportTarget = 'summary' | 'reports' | 'logs';
type TabKey = 'reports' | 'logs';
type SortDir = 'asc' | 'desc';
interface SortState { key: string; dir: SortDir; }

interface ReportFilters { q: string; type: string; format: string; status: string; }
interface ColumnDef { key: string; label: string; defaultVisible?: boolean; }
interface FieldDef { key: string; label: string; type: 'text' | 'date' | 'select' | 'textarea'; options?: string[]; }

interface DrawerState {
  kind: DrawerKind;
  record?: RecordItem;
  collection?: string;
}

const HIDDEN_KEYS = ['id', 'collectionId', 'collectionName'];
const FILE_KEYS = ['file', 'attachment', 'report_file', 'document', 'pdf', 'excel_file'];
const SIZE_OPTIONS = [10, 25, 50, 100];

const DEFAULT_RF: ReportFilters = { q: '', type: 'all', format: 'all', status: 'all' };

const REPORT_PREFERRED = ['created', 'title', 'report_type', 'status', 'format', 'generated_by', 'date_from', 'date_to', 'department', 'officer_type'];
const REPORT_DEFAULT_VISIBLE = new Set(['created', 'title', 'report_type', 'status', 'format', 'generated_by']);
const LOG_PREFERRED = ['created', 'action', 'user', 'status', 'details'];

/* update_logs field names vary — aliases let the table bind its canonical
   columns (Action / User / Status / Details) to whatever your collection uses. */
const ACTION_KEYS = ['action', 'event', 'type', 'title', 'operation', 'activity', 'log_type', 'activity_type'];
const USER_KEYS = ['user', 'performed_by', 'username', 'author', 'user_name', 'actor', 'generated_by', 'by'];
const DETAILS_KEYS = ['details', 'description', 'message', 'notes', 'content', 'summary', 'log', 'payload', 'data'];
const STATUS_KEYS = ['status', 'result', 'state', 'outcome'];

/* Fixed trend window (no UI selector): last 30 days vs the 30 days before */
const TREND_WINDOW_DAYS = 30;

const COLUMN_LABELS: Record<string, string> = {
  created: 'Generated', title: 'Title', report_type: 'Type', generated_by: 'By',
  date_from: 'From', date_to: 'To', action: 'Action', user: 'User', details: 'Details',
};

const FORMAT_OPTIONS: { key: ExportFormat; label: string; icon: LucideIcon }[] = [
  { key: 'csv', label: 'CSV', icon: FileText },
  { key: 'excel', label: 'Excel', icon: FileSpreadsheet },
  { key: 'json', label: 'JSON', icon: FileJson },
  { key: 'pdf', label: 'PDF', icon: Printer },
];

const STATUS_META = [
  { label: 'Completed', key: 'completed', color: '#10b981' },
  { label: 'Scheduled', key: 'scheduled', color: '#6366f1' },
  { label: 'Cancelled', key: 'cancelled', color: '#f43f5e' },
  { label: 'Rescheduled', key: 'rescheduled', color: '#f59e0b' },
  { label: 'Rejected', key: 'rejected', color: '#8b5cf6' },
];

const TONES: Record<string, string> = {
  emerald: 'bg-emerald-50 text-emerald-700 ring-emerald-600/15',
  amber: 'bg-amber-50 text-amber-700 ring-amber-600/15',
  rose: 'bg-rose-50 text-rose-700 ring-rose-600/15',
  indigo: 'bg-indigo-50 text-indigo-700 ring-indigo-600/15',
  violet: 'bg-violet-50 text-violet-700 ring-violet-600/15',
  slate: 'bg-slate-100 text-slate-600 ring-slate-500/15',
};

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');
const uniq = (vals: (string | undefined | null)[]) =>
  Array.from(new Set(vals.filter((v): v is string => !!v && v !== 'N/A')));

const FIELD_CLS = 'w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-[13px] text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100';

/* ───────── Formatting helpers ───────── */

const fmtDate = (d?: string) =>
  d && d !== 'N/A' ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';

const fmtDateTime = (d?: string) =>
  d && d !== 'N/A' ? new Date(d).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';

function timeAgo(d?: string) {
  if (!d) return '';
  const secs = Math.floor((Date.now() - new Date(d).getTime()) / 1000);
  if (secs < 60) return 'just now';
  const m = Math.floor(secs / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.floor(h / 24);
  if (days < 30) return `${days}d ago`;
  return fmtDate(d);
}

const humanize = (k: string) => k.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

function statusBucket(status?: string) {
  const s = (status || '').toLowerCase();
  if (s.includes('fail') || s.includes('error')) return 'failed';
  if (s.includes('pending') || s.includes('process') || s.includes('progress')) return 'pending';
  return 'success';
}

function sortRecords(items: RecordItem[], key: string, dir: SortDir): RecordItem[] {
  return [...items].sort((a, b) => {
    const av = a[key]; const bv = b[key];
    let cmp = 0;
    if (av == null && bv == null) cmp = 0;
    else if (av == null) cmp = -1;
    else if (bv == null) cmp = 1;
    else if (typeof av === 'number' && typeof bv === 'number') cmp = av - bv;
    else {
      const as = String(av); const bs = String(bv);
      const ad = Date.parse(as); const bd = Date.parse(bs);
      if (!isNaN(ad) && !isNaN(bd) && /^\d{4}-\d{2}/.test(as) && /^\d{4}-\d{2}/.test(bs)) cmp = ad - bd;
      else cmp = as.localeCompare(bs, undefined, { numeric: true, sensitivity: 'base' });
    }
    return dir === 'asc' ? cmp : -cmp;
  });
}

/* ───────── Export / download utilities (zero dependencies) ───────── */

function triggerDownload(content: string, filename: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

const csvCell = (v: unknown) => {
  const s = v == null ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

function rowsToCSV(rows: Record<string, any>[]): string {
  if (!rows.length) return '';
  const headers = Array.from(new Set(rows.flatMap(r => Object.keys(r))));
  return [headers.join(','), ...rows.map(r => headers.map(h => csvCell(r[h])).join(','))].join('\n');
}

const escHTML = (s: unknown) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function rowsToExcelHTML(title: string, rows: Record<string, any>[]): string {
  const headers = rows.length ? Array.from(new Set(rows.flatMap(r => Object.keys(r)))) : [];
  return `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel">
<head><meta charset="UTF-8" /><!--[if gte mso 9]><xml><x:ExcelWorksheet><x:Name>${escHTML(title).slice(0, 28)}</x:Name></x:ExcelWorksheet></xml><![endif]--></head>
<body><table border="1" cellspacing="0"><thead><tr>${headers.map(h => `<th bgcolor="#F1F5F9"><b>${escHTML(h)}</b></th>`).join('')}</tr></thead>
<tbody>${rows.map(r => `<tr>${headers.map(h => `<td>${escHTML(r[h])}</td>`).join('')}</tr>`).join('')}</tbody></table></body></html>`;
}

function buildPdfHTML(title: string, headers: string[], rows: string[][], landscape: boolean): string {
  return `<!doctype html><html><head><meta charset="utf-8" /><title>${escHTML(title)}</title><style>
@page { margin: 14mm; ${landscape ? 'size: A4 landscape;' : ''} }
body { font-family: -apple-system, 'Segoe UI', Roboto, sans-serif; color: #0f172a; margin: 0; }
h1 { font-size: 17px; font-weight: 700; margin: 0; }
.sub { color: #64748b; font-size: 10.5px; margin: 4px 0 16px; }
table { width: 100%; border-collapse: collapse; font-size: 10.5px; }
th { background: #f1f5f9; border: 1px solid #e2e8f0; padding: 6px 8px; text-align: left; font-weight: 700; }
td { border: 1px solid #e2e8f0; padding: 6px 8px; vertical-align: top; }
.foot { margin-top: 14px; color: #94a3b8; font-size: 9px; }
</style></head><body>
<h1>${escHTML(title)}</h1>
<p class="sub">Civillist &middot; generated ${new Date().toLocaleString()}</p>
<table><thead><tr>${headers.map(h => `<th>${escHTML(h)}</th>`).join('')}</tr></thead><tbody>
 ${rows.map(r => `<tr>${r.map(c => `<td>${escHTML(c)}</td>`).join('')}</tr>`).join('\n')}
</tbody></table>
<p class="foot">Civillist Reports &middot; ${new Date().toLocaleString()}</p>
<script>window.onload = function () { setTimeout(function () { window.print(); }, 250); }<\/script>
</body></html>`;
}

function downloadDataset(format: ExportFormat, title: string, rows: Record<string, any>[]) {
  if (!rows.length) return;
  const stamp = new Date().toISOString().slice(0, 10);
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  if (format === 'json') { triggerDownload(JSON.stringify(rows, null, 2), `${slug}-${stamp}.json`, 'application/json'); return; }
  if (format === 'csv') { triggerDownload('\uFEFF' + rowsToCSV(rows), `${slug}-${stamp}.csv`, 'text/csv;charset=utf-8'); return; }
  if (format === 'excel') { triggerDownload(rowsToExcelHTML(title, rows), `${slug}-${stamp}.xls`, 'application/vnd.ms-excel'); return; }
  let headers: string[]; let body: string[][];
  if (rows.length === 1) {
    headers = ['Field', 'Value'];
    body = Object.entries(rows[0]).map(([k, v]) => [k, String(v ?? '—')]);
  } else {
    headers = Object.keys(rows[0]);
    body = rows.map(r => headers.map(h => String(r[h] ?? '—')));
  }
  const w = window.open('', '_blank', 'width=880,height=980');
  if (!w) {
    window.alert('Allow pop-ups once so the PDF preview can open, then choose "Save as PDF".');
    return;
  }
  w.document.write(buildPdfHTML(title, headers, body, headers.length > 5));
  w.document.close();
}

function normalizeRecord(r: RecordItem): Record<string, string> {
  const out: Record<string, string> = {};
  Object.entries(r).forEach(([k, v]) => {
    if (HIDDEN_KEYS.includes(k)) return;
    if (v == null || v === '') { out[humanize(k)] = '—'; return; }
    if (typeof v === 'boolean') { out[humanize(k)] = v ? 'Yes' : 'No'; return; }
    if (typeof v === 'object') { out[humanize(k)] = JSON.stringify(v); return; }
    if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(v)) { out[humanize(k)] = fmtDateTime(v); return; }
    out[humanize(k)] = String(v);
  });
  return out;
}

function findFileUrl(record: RecordItem): string | null {
  const key = FILE_KEYS.find(k => typeof record[k] === 'string' && record[k]);
  if (!key || !record.id) return null;
  try {
    return pb.files.getUrl(record, record[key]) || null;
  } catch {
    return null;
  }
}

/* ───────── Reusable UI pieces ───────── */

function Pill({ tone, children, dot = false }: { tone: keyof typeof TONES; children: ReactNode; dot?: boolean }) {
  return (
    <span className={cx('inline-flex items-center gap-1.5 rounded-full px-2.5 py-[3px] text-[11px] font-semibold ring-1 ring-inset', TONES[tone])}>
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}

function TrendChip({ delta }: { delta: number | null }) {
  if (delta == null) return null;
  const Icon = delta === 0 ? Minus : delta > 0 ? TrendingUp : TrendingDown;
  const tone = delta === 0 ? 'bg-slate-100 text-slate-500' : delta > 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700';
  return (
    <span title="Last 30 days vs previous 30 days"
      className={cx('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold', tone)}>
      <Icon className="h-3 w-3" />
      {delta > 0 ? '+' : ''}{delta}%
    </span>
  );
}

function Toast({ toast }: { toast: { kind: 'ok' | 'err'; msg: string } | null }) {
  return (
    <div className={cx(
      'fixed bottom-5 right-5 z-[60] flex max-w-xs items-start gap-2.5 rounded-xl px-4 py-3 shadow-lg transition-all duration-300',
      toast ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-2 opacity-0',
      toast?.kind === 'err' ? 'bg-rose-600 text-white' : 'bg-slate-900 text-white'
    )}>
      {toast?.kind === 'err'
        ? <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
        : <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />}
      <p className="text-[12.5px] font-medium leading-snug">{toast?.msg}</p>
    </div>
  );
}

function EmptyState({ icon: Icon, title, hint, action }: { icon: LucideIcon; title: string; hint: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-50">
        <Icon className="h-6 w-6 text-slate-300" strokeWidth={1.5} />
      </div>
      <p className="text-[13.5px] font-semibold text-slate-600">{title}</p>
      <p className="mt-1 text-[12px] text-slate-400">{hint}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

function SearchInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <div className="relative min-w-[190px] flex-1 sm:max-w-xs">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
      <input
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-9 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-[13px] text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
      />
    </div>
  );
}

function FilterSelect({ label, value, onChange, options }: {
  label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[];
}) {
  return (
    <label className="relative">
      <span className="sr-only">{label}</span>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="h-9 cursor-pointer appearance-none rounded-lg border border-slate-200 bg-white pl-3 pr-8 text-[13px] font-medium text-slate-700 outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
      >
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
    </label>
  );
}

/* ── Column visibility picker (hide/show any column) ── */

function ColumnPicker({ columns, isVisible, onToggle, onReset }: {
  columns: ColumnDef[]; isVisible: (k: string) => boolean; onToggle: (k: string) => void; onReset: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button onClick={() => setOpen(o => !o)}
        className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-[12.5px] font-semibold text-slate-600 transition hover:border-slate-300 hover:text-slate-800">
        <ChevronDown className={cx('h-3.5 w-3.5 text-slate-400 transition', open && 'rotate-180')} />
        Columns
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-11 z-30 max-h-64 w-52 overflow-y-auto rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl">
            <p className="px-2.5 pb-1 pt-1 text-[10.5px] font-bold uppercase tracking-widest text-slate-400">Visible columns</p>
            {columns.map(c => (
              <label key={c.key} className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-[12.5px] text-slate-600 transition hover:bg-slate-50">
                <input type="checkbox" checked={isVisible(c.key)} onChange={() => onToggle(c.key)} className="h-3.5 w-3.5 accent-indigo-600" />
                <span className="truncate">{c.label}</span>
              </label>
            ))}
            <div className="mt-1 border-t border-slate-100 pt-1">
              <button onClick={onReset}
                className="w-full rounded-lg px-2.5 py-1.5 text-left text-[12px] font-semibold text-slate-500 transition hover:bg-slate-50 hover:text-slate-700">
                Reset to default
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function pageList(cur: number, total: number): (number | '…')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  if (cur <= 4) return [1, 2, 3, 4, 5, '…', total];
  if (cur >= total - 3) return [1, '…', total - 4, total - 3, total - 2, total - 1, total];
  return [1, '…', cur - 1, cur, cur + 1, '…', total];
}

/* ── Pagination with page-size selector ── */

function Pagination({ page, pages, start, end, total, onPage, size, onSize }: {
  page: number; pages: number; start: number; end: number; total: number;
  onPage: (p: number) => void; size: number; onSize: (s: number) => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-5 py-3">
      <div className="flex items-center gap-4">
        <p className="text-[12px] text-slate-500">
          Showing <span className="font-semibold text-slate-700">{total ? start : 0}–{end}</span> of{' '}
          <span className="font-semibold text-slate-700">{total}</span>
        </p>
        <label className="flex items-center gap-2 text-[12px] text-slate-400">
          Rows
          <select value={size} onChange={e => onSize(Number(e.target.value))}
            className="h-8 cursor-pointer rounded-lg border border-slate-200 bg-white px-2 text-[12px] font-semibold text-slate-600 outline-none focus:border-indigo-400">
            {SIZE_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
      </div>
      <div className="flex items-center gap-1">
        <button disabled={page === 1} onClick={() => onPage(page - 1)} aria-label="Previous page"
          className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 disabled:opacity-40 disabled:hover:bg-transparent">
          <ChevronLeft className="h-4 w-4" />
        </button>
        {pageList(page, pages).map((n, i) =>
          n === '…' ? (
            <span key={`dots-${i}`} className="px-1 text-[12px] text-slate-400">…</span>
          ) : (
            <button key={n} onClick={() => onPage(n)}
              className={cx('h-8 min-w-[2rem] rounded-lg px-2 text-[12px] font-semibold transition',
                n === page ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100')}>
              {n}
            </button>
          )
        )}
        <button disabled={page === pages} onClick={() => onPage(page + 1)} aria-label="Next page"
          className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 disabled:opacity-40 disabled:hover:bg-transparent">
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

/* ── Off-canvas panel (details + forms + export — no popup dialogs) ── */

function OffCanvas({ open, onClose, title, subtitle, icon, children, footer }: {
  open: boolean; onClose: () => void; title: string; subtitle?: string; icon?: ReactNode; children: ReactNode; footer?: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  return (
    <>
      <div
        onClick={onClose}
        className={cx('fixed inset-0 z-40 bg-slate-900/30 backdrop-blur-[2px] transition-opacity duration-300',
          open ? 'opacity-100' : 'pointer-events-none opacity-0')}
      />
      <aside
        role="dialog" aria-modal="true"
        className={cx(
          'fixed inset-y-0 right-0 z-50 flex w-full max-w-[460px] transform flex-col bg-white shadow-2xl transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]',
          open ? 'translate-x-0' : 'translate-x-full'
        )}
      >
        <header className="flex items-start gap-3 border-b border-slate-100 px-6 py-5">
          {icon && (
            <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">{icon}</div>
          )}
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-[15px] font-bold text-slate-900">{title}</h2>
            {subtitle && <p className="mt-0.5 truncate text-[12px] text-slate-500">{subtitle}</p>}
          </div>
          <button onClick={onClose} aria-label="Close panel"
            className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700">
            <X className="h-5 w-5" />
          </button>
        </header>
        <div className="flex-1 overflow-y-auto overscroll-contain">{children}</div>
        {footer && <div className="border-t border-slate-100 bg-slate-50/70 px-6 py-4">{footer}</div>}
      </aside>
    </>
  );
}

/* ───────── Table: sortable, column-filterable, row actions (edit + delete) ───────── */

interface GenericTableProps {
  records: RecordItem[];
  columns: ColumnDef[];
  isVisible: (key: string) => boolean;
  sortKey: string | null;
  sortDir: SortDir;
  onSort: (key: string) => void;
  onOpen: (r: RecordItem) => void;
  onEdit: (r: RecordItem) => void;
  onRequestDelete: (r: RecordItem) => void;
  pendingDeleteId: string | null;
  onConfirmDelete: () => void;
  onCancelDelete: () => void;
  renderCell: (key: string, r: RecordItem) => ReactNode;
}

function GenericTable({
  records, columns, isVisible, sortKey, sortDir, onSort, onOpen, onEdit,
  onRequestDelete, pendingDeleteId, onConfirmDelete, onCancelDelete, renderCell,
}: GenericTableProps) {
  const cols = columns.filter(c => isVisible(c.key));
  if (!cols.length) {
    return (
      <div className="px-6 py-12 text-center text-[12.5px] text-slate-400">
        All columns are hidden — enable some from the Columns menu.
      </div>
    );
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
                    ? (sortDir === 'asc'
                      ? <ChevronUp className="h-3 w-3 text-indigo-500" />
                      : <ChevronDown className="h-3 w-3 text-indigo-500" />)
                    : <ArrowUpDown className="h-3 w-3 opacity-0 transition group-hover:opacity-60" />}
                </button>
              </th>
            ))}
            <th className="pl-4 pr-6 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wider text-slate-400">Actions</th>          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {records.map(r => {
            const confirming = pendingDeleteId === r.id;
            return (
              <tr key={r.id}
                onClick={confirming ? undefined : () => onOpen(r)}
                className={cx('transition-colors', confirming ? 'bg-rose-50/70' : 'cursor-pointer hover:bg-slate-50/80')}>
                {cols.map(c => (
                  <td key={c.key} className="px-4 py-3 align-middle">{renderCell(c.key, r)}</td>
                ))}
                  <td className="pl-4 pr-6 py-3 align-middle">
                  {confirming ? (
                    <div className="flex items-center justify-end gap-1.5">
                      <button onClick={e => { e.stopPropagation(); onConfirmDelete(); }}
                        className="rounded-lg bg-rose-600 px-2.5 py-1.5 text-[11.5px] font-semibold text-white transition hover:bg-rose-700">
                        Delete
                      </button>
                      <button onClick={e => { e.stopPropagation(); onCancelDelete(); }}
                        className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11.5px] font-semibold text-slate-500 transition hover:bg-slate-50">
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center justify-end gap-1">
                      <button onClick={e => { e.stopPropagation(); onEdit(r); }} title="Edit record"
                        className="rounded-lg p-1.5 text-slate-400 transition hover:bg-indigo-50 hover:text-indigo-600">
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button onClick={e => { e.stopPropagation(); onRequestDelete(r); }} title="Delete record"
                        className="rounded-lg p-1.5 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600">
                        <Trash2 className="h-4 w-4" />
                      </button>
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

/* ── Smart cell rendering (works for any field / any payload) ── */

function renderGeneric(v: any): ReactNode {
  if (v == null || v === '' || v === 'N/A') return <span className="text-slate-300">—</span>;
  if (typeof v === 'boolean') return <Pill tone={v ? 'emerald' : 'slate'}>{v ? 'Yes' : 'No'}</Pill>;
  if (typeof v === 'object') {
    const s = JSON.stringify(v);
    return <span className="block max-w-[200px] truncate font-mono text-[11.5px] text-slate-500" title={s}>{s}</span>;
  }
  const s = String(v);
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(s)) {
    return <span className="whitespace-nowrap text-[12.5px] text-slate-500">{fmtDateTime(s)}</span>;
  }
  return <span className="block max-w-[200px] truncate text-[12.5px] text-slate-600" title={s}>{s}</span>;
}

function renderCell(key: string, r: RecordItem): ReactNode {
  const v = r[key];
  if (key === 'created') {
    return <span className="whitespace-nowrap text-[12.5px] text-slate-500">{fmtDateTime(r.created)}</span>;
  }
  if (key === 'title') {
    return <span className="block max-w-[220px] truncate text-[13px] font-semibold text-slate-800" title={String(v ?? '')}>{String(v ?? '') || '—'}</span>;
  }
  if (key === 'report_type' || ACTION_KEYS.includes(key)) {
    const s = String(v ?? '');
    return <span className="block max-w-[170px] truncate text-[12.5px] font-medium text-slate-700" title={s}>{s || '—'}</span>;
  }
  if (STATUS_KEYS.includes(key)) {
    const s = String(v ?? '');
    if (!s) return <span className="text-slate-300">—</span>;
    const b = statusBucket(s);
    return <Pill dot tone={b === 'failed' ? 'rose' : b === 'pending' ? 'amber' : 'emerald'}>{s}</Pill>;
  }
  if (USER_KEYS.includes(key)) {
    const name = String(v ?? '') || 'System';
    return (
      <span className="inline-flex items-center gap-2 whitespace-nowrap">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 text-[10px] font-bold text-white">
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
        ? <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[10.5px] font-bold tracking-wide text-slate-500">{f}</span>
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

/* ── Details drawer: shows EVERY field of the record, payload included ── */

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
              <pre className="overflow-x-auto rounded-lg bg-slate-50 p-3 font-mono text-[11.5px] leading-relaxed text-slate-600">
                {JSON.stringify(v, null, 2)}
              </pre>
            ) : (
              <span className="whitespace-pre-wrap">
                {v == null || v === '' ? '—' : typeof v === 'boolean' ? (v ? 'Yes' : 'No')
                  : /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(String(v)) ? fmtDateTime(String(v)) : String(v)}
              </span>
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/* ── Create / Edit form: fields auto-detected from real records ── */

function buildFieldDefs(records: RecordItem[], preferred: string[]): FieldDef[] {
  const stats = new Map<string, Set<string>>();
  records.forEach(r => {
    Object.entries(r).forEach(([k, v]) => {
      if (HIDDEN_KEYS.includes(k) || k === 'created' || k === 'updated') return;
      if (v != null && typeof v === 'object') return;
      const s = v == null ? '' : String(v);
      const set = stats.get(k) ?? new Set<string>();
      if (s !== '' && s !== 'N/A') set.add(s);
      stats.set(k, set);
    });
  });
  const keys = Array.from(stats.keys());
  const ordered = [...preferred.filter(p => keys.includes(p)), ...keys.filter(k => !preferred.includes(k)).sort()];
  return ordered.map(k => {
    const vals = Array.from(stats.get(k)!).sort();
    const isDate = vals.length > 0 && vals.every(x => /^\d{4}-\d{2}-\d{2}/.test(x));
    const isSelect = !isDate && vals.length > 0 && vals.length <= 10;
    const isLong = /details|description|notes|remarks|message|summary|agenda|content/.test(k) && !isSelect;
    let type: FieldDef['type'] = 'text';
    if (isDate) type = 'date';
    else if (isSelect) type = 'select';
    else if (isLong) type = 'textarea';
    return { key: k, label: humanize(k), type, options: type === 'select' ? vals : undefined };
  });
}

function RecordForm({ fields, values, onChange }: {
  fields: FieldDef[]; values: Record<string, string>; onChange: (k: string, v: string) => void;
}) {
  if (!fields.length) {
    return <p className="p-5 text-[12.5px] text-slate-400">No fields detected yet.</p>;
  }
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
            <input
              type={f.type === 'date' ? 'date' : 'text'}
              value={values[f.key] ?? ''}
              onChange={e => onChange(f.key, e.target.value)}
              placeholder={`Enter ${f.label.toLowerCase()}…`}
              className={FIELD_CLS}
            />
          )}
        </div>
      ))}
    </div>
  );
}

/* ───────── Analytics ───────── */

const deltaPct = (cur: number, prev: number) => (prev === 0 ? (cur > 0 ? 100 : 0) : Math.round(((cur - prev) / prev) * 100));

const DAY_FULL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function computeAnalytics(scoped: RecordItem[]) {
  const statusOf = (m: RecordItem) => (m.status || '').toLowerCase();
  const totalMeetings = scoped.length;
  const completedMeetings = scoped.filter(m => statusOf(m) === 'completed').length;
  const scheduledMeetings = scoped.filter(m => statusOf(m) === 'scheduled').length;
  const cancelledMeetings = scoped.filter(m => statusOf(m) === 'cancelled').length;
  const rescheduledMeetings = scoped.filter(m => statusOf(m) === 'rescheduled').length;
  const rejectedMeetings = scoped.filter(m => statusOf(m) === 'rejected').length;

  const totalDuration = scoped.reduce((acc: number, m) => acc + (parseInt(m.duration) || 0), 0);
  const avgDuration = totalMeetings ? Math.round(totalDuration / totalMeetings) : 0;

  const decided = completedMeetings + cancelledMeetings + rejectedMeetings;
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
  const topOfficers = Object.entries(officerCount)
    .sort(([, a], [, b]) => b.count - a.count).slice(0, 5)
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
    totalMeetings, completedMeetings, scheduledMeetings, cancelledMeetings, rescheduledMeetings, rejectedMeetings,
    totalDuration, avgDuration, health, decided, busiestDay, meetingTypes, topOfficers, monthlyData,
  };
}

function summaryRows(a: any, reportStats: { count: number }, logStats: { count: number }): Record<string, string>[] {
  const rows: Record<string, string>[] = [
    { Metric: 'Meeting health', Value: a.health != null ? `${a.health}%` : 'n/a' },
    { Metric: 'Total meetings', Value: String(a.totalMeetings) },
    { Metric: 'Completed', Value: String(a.completedMeetings) },
    { Metric: 'Scheduled', Value: String(a.scheduledMeetings) },
    { Metric: 'Cancelled', Value: String(a.cancelledMeetings) },
    { Metric: 'Rescheduled', Value: String(a.rescheduledMeetings) },
    { Metric: 'Rejected', Value: String(a.rejectedMeetings) },
    { Metric: 'Avg duration (min)', Value: String(a.avgDuration) },
    { Metric: 'Total time in meetings (min)', Value: String(a.totalDuration) },
    { Metric: 'Busiest day', Value: a.busiestDay ? `${a.busiestDay.name} (${a.busiestDay.count} meetings)` : 'n/a' },
    { Metric: 'Reports generated (all time)', Value: String(reportStats.count) },
    { Metric: 'System activity entries (all time)', Value: String(logStats.count) },
  ];
  a.topOfficers.forEach((o: any, i: number) =>
    rows.push({ Metric: `Most active #${i + 1}`, Value: `${o.name} (${o.type}) — ${o.count} meetings` }));
  Object.entries(a.meetingTypes).forEach(([t, c]: any) => rows.push({ Metric: `Type: ${t}`, Value: String(c) }));
  return rows;
}

/* ───────── Reliable fetch-all: pages through getList until every record is loaded ───────── */

async function fetchAllRecords(collection: string, sort = '-created'): Promise<RecordItem[]> {
  const PER = 100;
  const first = await pb.collection(collection).getList(1, PER, { sort });
  const all: any[] = [...first.items];
  const totalPages = first.totalPages ?? 1;
  if (totalPages > 1) {
    const rest = await Promise.all(
      Array.from({ length: totalPages - 1 }, (_, i) =>
        pb.collection(collection).getList(i + 2, PER, { sort }).then(res => res.items)
      )
    );
    rest.forEach(items => all.push(...items));
  }
  return all as RecordItem[];
}

/* ───────── Main page ───────── */

export default function ReportsPage() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [fetchWarnings, setFetchWarnings] = useState<string[]>([]);
  const [tab, setTab] = useState<TabKey>('reports');

  const [meetings, setMeetings] = useState<RecordItem[]>([]);
  const [reports, setReports] = useState<RecordItem[]>([]);
  const [logs, setLogs] = useState<RecordItem[]>([]);

  const [rf, setRf] = useState<ReportFilters>(DEFAULT_RF);
  const [lq, setLq] = useState('');
  const [lStatus, setLStatus] = useState('all');

  const [rPage, setRPage] = useState(1);
  const [lPage, setLPage] = useState(1);
  const [rSize, setRSize] = useState(25);
  const [lSize, setLSize] = useState(25);

  const [rSort, setRSort] = useState<SortState | null>(null);
  const [lSort, setLSort] = useState<SortState | null>(null);

  const [rVisible, setRVisible] = useState<Record<string, boolean>>({});
  const [lVisible, setLVisible] = useState<Record<string, boolean>>({});

  const [drawer, setDrawer] = useState<DrawerState>({ kind: null });
  const [formValues, setFormValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<{ id: string; collection: string } | null>(null);
  const [drawerDeleteConfirm, setDrawerDeleteConfirm] = useState(false);

  const [exportTarget, setExportTarget] = useState<ExportTarget>('summary');
  const [exportFormat, setExportFormat] = useState<ExportFormat>('csv');

  const [toast, setToast] = useState<{ kind: 'ok' | 'err'; msg: string } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const notify = (kind: 'ok' | 'err', msg: string) => {
    setToast({ kind, msg });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 4000);
  };

  /* ── data ── */
  async function loadReportData(silent = false) {
    try {
      setError('');
      if (silent) setRefreshing(true); else setLoading(true);
      const warnings: string[] = [];
      const [m, rh, ul] = await Promise.all([
        fetchAllRecords('meetings', '-meeting_date').catch(() => { warnings.push('meetings'); return [] as RecordItem[]; }),
        fetchAllRecords('report_history', '-created').catch(() => { warnings.push('report_history'); return [] as RecordItem[]; }),
        fetchAllRecords('update_logs', '-created').catch(() => { warnings.push('update_logs'); return [] as RecordItem[]; }),
      ]);
      setFetchWarnings(warnings);
      setMeetings(m);
      setReports(rh);
      setLogs(ul);
    } catch (e: any) {
      console.error('Failed to load reports:', e);
      setError(e?.message || 'Unable to reach the server. Check your connection and try again.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => { loadReportData(); }, []);

  /* ── all-time analytics (range selector removed) ── */
  const a = useMemo(() => computeAnalytics(meetings), [meetings]);

  const reportStats = useMemo(() => {
    const cutoff = Date.now() - TREND_WINDOW_DAYS * 86400000;
    const prevCutoff = cutoff - TREND_WINDOW_DAYS * 86400000;
    const recent = reports.filter(r => new Date(r.created || 0).getTime() >= cutoff).length;
    const prev = reports.filter(r => { const t = new Date(r.created || 0).getTime(); return t >= prevCutoff && t < cutoff; }).length;
    return { count: reports.length, recent, trend: deltaPct(recent, prev), last: reports[0]?.created };
  }, [reports]);

  const logStats = useMemo(() => {
    const cutoff = Date.now() - TREND_WINDOW_DAYS * 86400000;
    const prevCutoff = cutoff - TREND_WINDOW_DAYS * 86400000;
    const recent = logs.filter(l => new Date(l.created || 0).getTime() >= cutoff).length;
    const prev = logs.filter(l => { const t = new Date(l.created || 0).getTime(); return t >= prevCutoff && t < cutoff; }).length;
    return { count: logs.length, recent, trend: deltaPct(recent, prev), last: logs[0]?.created };
  }, [logs]);

  const reportHealth = useMemo(() => {
    const total = reports.length;
    const failed = reports.filter(r => statusBucket(r.status) === 'failed').length;
    const pending = reports.filter(r => statusBucket(r.status) === 'pending').length;
    const success = Math.max(total - failed - pending, 0);
    const typeCounts: Record<string, number> = {};
    reports.forEach(r => { const t = r.report_type; if (t) typeCounts[t] = (typeCounts[t] || 0) + 1; });
    const top = Object.entries(typeCounts).sort((x, y) => y[1] - x[1])[0];
    return {
      total, failed, pending, success,
      rate: total ? Math.round((success / total) * 100) : null,
      topType: top?.[0] ?? null,
      topCount: top?.[1] ?? 0,
    };
  }, [reports]);

  /* ── columns (every field in the collection becomes a toggleable column) ── */
  const reportColumns = useMemo(() => {
    const keys = new Set<string>();
    reports.forEach(r => Object.keys(r).forEach(k => { if (!HIDDEN_KEYS.includes(k) && k !== 'updated') keys.add(k); }));
    const ordered = [
      ...REPORT_PREFERRED.filter(p => keys.has(p)),
      ...Array.from(keys).filter(k => !REPORT_PREFERRED.includes(k)).sort(),
    ];
    return ordered.map(k => ({ key: k, label: COLUMN_LABELS[k] ?? humanize(k) }));
  }, [reports]);

  const logColumns = useMemo(() => {
    if (!logs.length) {
            return LOG_PREFERRED.map(k => ({ key: k, label: COLUMN_LABELS[k] ?? humanize(k), defaultVisible: true }));
    }
    const present = new Set<string>();
    logs.forEach(r => Object.keys(r).forEach(k => { if (!HIDDEN_KEYS.includes(k) && k !== 'updated') present.add(k); }));

    const actionKey = ACTION_KEYS.find(k => present.has(k));
    const userKey = USER_KEYS.find(k => present.has(k));
    const statusKey = STATUS_KEYS.find(k => present.has(k));
    const detailsKey = DETAILS_KEYS.find(k => present.has(k));

        const canonical: ColumnDef[] = [];
    if (present.has('created')) canonical.push({ key: 'created', label: 'Generated', defaultVisible: true });
    if (actionKey) canonical.push({ key: actionKey, label: 'Action', defaultVisible: true });
    if (userKey) canonical.push({ key: userKey, label: 'User', defaultVisible: true });
    if (statusKey) canonical.push({ key: statusKey, label: 'Status', defaultVisible: true });
    if (detailsKey) canonical.push({ key: detailsKey, label: 'Details', defaultVisible: true });

    const canonicalKeys = new Set(canonical.map(c => c.key));
    const rest = Array.from(present).filter(k => !canonicalKeys.has(k)).sort();
    return [...canonical, ...rest.map(k => ({ key: k, label: COLUMN_LABELS[k] ?? humanize(k), defaultVisible: false }))];
  }, [logs]);

  const isReportColVisible = (k: string) => rVisible[k] ?? REPORT_DEFAULT_VISIBLE.has(k);
    const logDefaults = useMemo(() => new Set(logColumns.filter(c => c.defaultVisible).map(c => c.key)), [logColumns]);
  const isLogColVisible = (k: string) => lVisible[k] ?? logDefaults.has(k);
  const toggleReportCol = (k: string) => setRVisible(v => ({ ...v, [k]: !isReportColVisible(k) }));
  const toggleLogCol = (k: string) => setLVisible(v => ({ ...v, [k]: !isLogColVisible(k) }));

  /* ── form fields (auto-detected) ── */
  const reportFields = useMemo(() => {
    const defs = buildFieldDefs(reports, ['title', 'report_type', 'status', 'format', 'department', 'officer_type', 'date_from', 'date_to', 'generated_by']);
    return defs.length ? defs : ['title', 'report_type', 'status', 'format', 'department', 'officer_type', 'date_from', 'date_to', 'generated_by']
      .map(k => ({ key: k, label: humanize(k), type: (k.startsWith('date') ? 'date' : 'text') as FieldDef['type'] }));
  }, [reports]);

  const logFields = useMemo(() => {
    const defs = buildFieldDefs(logs, ['action', 'user', 'status', 'details']);
    return defs.length ? defs : ['action', 'user', 'status', 'details']
      .map(k => ({ key: k, label: humanize(k), type: 'text' as const }));
  }, [logs]);

  /* ── drawer helpers ── */
  const openDetails = (kind: 'report' | 'log', record: RecordItem) => {
    setDrawerDeleteConfirm(false);
    setDrawer({ kind, record });
  };
  const openForm = (collection: string, record?: RecordItem) => {
    const fields = collection === 'report_history' ? reportFields : logFields;
    const values: Record<string, string> = {};
    fields.forEach(f => {
      const raw = record?.[f.key];
      values[f.key] = raw == null ? '' : f.type === 'date' ? String(raw).slice(0, 10) : String(raw);
    });
    setFormValues(values);
    setDrawerDeleteConfirm(false);
    setDrawer({ kind: 'form', collection, record });
  };
  const openExport = () => setDrawer({ kind: 'export' });
  const closeDrawer = () => setDrawer(d => (d.kind === null ? d : { ...d, kind: null }));

  /* ── filtering (search scans every string field) ── */
  const matches = (r: RecordItem, q: string) =>
    Object.values(r).some(v => typeof v === 'string' && v.toLowerCase().includes(q));

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

  const filteredLogs = useMemo(() => {
    const q = lq.trim().toLowerCase();
    return logs.filter(l => {
      if (lStatus !== 'all' && statusBucket(l.status) !== lStatus) return false;
      if (q && !matches(l, q)) return false;
      return true;
    });
  }, [logs, lq, lStatus]);

  useEffect(() => { setRPage(1); }, [rf]);
  useEffect(() => { setLPage(1); }, [lq, lStatus]);

  /* ── sorting ── */
  const sortedReports = useMemo(() => (rSort ? sortRecords(filteredReports, rSort.key, rSort.dir) : filteredReports), [filteredReports, rSort]);
  const sortedLogs = useMemo(() => (lSort ? sortRecords(filteredLogs, lSort.key, lSort.dir) : filteredLogs), [filteredLogs, lSort]);

  /* ── pagination ── */
  const rTotal = sortedReports.length;
  const rPages = Math.max(1, Math.ceil(rTotal / rSize));
  const rSafe = Math.min(rPage, rPages);
  const rSlice = sortedReports.slice((rSafe - 1) * rSize, rSafe * rSize);

  const lTotal = sortedLogs.length;
  const lPages = Math.max(1, Math.ceil(lTotal / lSize));
  const lSafe = Math.min(lPage, lPages);
  const lSlice = sortedLogs.slice((lSafe - 1) * lSize, lSafe * lSize);

  const handleRSort = (key: string) => {
    setRSort(s => (s && s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }));
    setRPage(1);
  };
  const handleLSort = (key: string) => {
    setLSort(s => (s && s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }));
    setLPage(1);
  };

  /* ── option lists ── */
  const rTypeOpts = [{ value: 'all', label: 'All types' }, ...uniq(reports.map(r => r.report_type)).map(v => ({ value: v, label: v }))];
  const rFormatOpts = [{ value: 'all', label: 'All formats' }, ...uniq(reports.map(r => r.format && String(r.format).toUpperCase())).map(v => ({ value: v, label: v }))];
  const bucketOpts = (allLabel: string, okLabel: string) => [
    { value: 'all', label: allLabel },
    { value: 'success', label: okLabel },
    { value: 'pending', label: 'Pending' },
    { value: 'failed', label: 'Failed' },
  ];

  const rFilterCount = [rf.q, rf.type, rf.format, rf.status].filter(v => v && v !== 'all').length;
  const lFilterCount = [lq, lStatus !== 'all' ? lStatus : ''].filter(Boolean).length;

  /* ── CRUD handlers ── */
  async function handleSave() {
    if (!drawer.collection) return;
    const payload: Record<string, any> = {};
    Object.entries(formValues).forEach(([k, v]) => { if (v !== '') payload[k] = v; });
    try {
      setSaving(true);
      if (drawer.record?.id) {
        await pb.collection(drawer.collection).update(drawer.record.id, payload);
        notify('ok', 'Record updated');
      } else {
        await pb.collection(drawer.collection).create(payload);
        notify('ok', 'Record created');
      }
      closeDrawer();
      loadReportData(true);
    } catch (e: any) {
      notify('err', e?.message || 'Save failed — check required fields.');
    } finally {
      setSaving(false);
    }
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    try {
      setDeleting(true);
      await pb.collection(pendingDelete.collection).delete(pendingDelete.id);
      notify('ok', 'Record deleted');
      setDrawer(d => (d.record?.id === pendingDelete.id && (d.kind === 'report' || d.kind === 'log') ? { ...d, kind: null } : d));
      setPendingDelete(null);
      setDrawerDeleteConfirm(false);
      loadReportData(true);
    } catch (e: any) {
      notify('err', e?.message || 'Delete failed');
      setPendingDelete(null);
    } finally {
      setDeleting(false);
    }
  }

  /* ── export ── */
  function buildExportRows(target: ExportTarget): Record<string, any>[] {
    switch (target) {
      case 'summary': return summaryRows(a, reportStats, logStats);
      case 'reports': return filteredReports.map(normalizeRecord);
      default: return filteredLogs.map(normalizeRecord);
    }
  }

  const EXPORT_TARGETS: { key: ExportTarget; label: string; desc: string; icon: LucideIcon }[] = [
    { key: 'summary', label: 'Analytics Summary', desc: 'Key numbers · all time', icon: Zap },
    { key: 'reports', label: 'Report History', desc: `${filteredReports.length} reports · filters applied`, icon: History },
    { key: 'logs', label: 'Update Logs', desc: `${filteredLogs.length} entries`, icon: Database },
  ];

  /* ── loading / error (AFTER all hooks — never add hooks below this line) ── */
  if (loading) {
    return (
      <div className="w-full bg-[#fbfbfd]">
        <div className="mx-auto w-full max-w-[1320px] space-y-5 px-5 py-8 lg:px-8">
          <div className="flex items-center justify-between">
            <div className="space-y-2">
              <div className="h-7 w-56 animate-pulse rounded-lg bg-slate-200/70" />
              <div className="h-4 w-80 animate-pulse rounded bg-slate-100" />
            </div>
            <div className="h-9 w-28 animate-pulse rounded-xl bg-slate-200/70" />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-[132px] animate-pulse rounded-2xl border border-slate-200/60 bg-slate-100/50" />)}
          </div>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-52 animate-pulse rounded-2xl border border-slate-200/60 bg-slate-100/50" />)}
          </div>
          <div className="h-[440px] animate-pulse rounded-2xl border border-slate-200/60 bg-slate-100/50" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center bg-[#fbfbfd] p-8">
        <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-rose-50">
            <AlertCircle className="h-6 w-6 text-rose-500" />
          </div>
          <h2 className="text-[16px] font-bold text-slate-900">Couldn&apos;t load reports</h2>
          <p className="mt-1.5 text-[13px] leading-relaxed text-slate-500">{error}</p>
          <button onClick={() => loadReportData()}
            className="mt-5 inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-slate-900 text-[13px] font-semibold text-white transition hover:bg-slate-700">
            <RefreshCw className="h-4 w-4" /> Try again
          </button>
        </div>
      </div>
    );
  }

  /* ── drawer content (plain consts — no hooks) ── */
  const rec = drawer.record;
  const kind = drawer.kind;
  const detailCollection = kind === 'report' ? 'report_history' : kind === 'log' ? 'update_logs' : null;
  const formLabel = drawer.collection === 'report_history' ? 'Report' : 'Log Entry';

  const logTitle = () => {
    for (const k of ACTION_KEYS) {
      if (rec?.[k]) return String(rec[k]);
    }
    return 'Activity details';
  };

  const drawerTitle =
    kind === 'report' ? (rec?.title || 'Untitled Report') :
    kind === 'log' ? logTitle() :
    kind === 'form' ? (rec ? `Edit ${formLabel}` : `New ${formLabel}`) :
    'Export Center';
  const drawerSubtitle =
    kind === 'report' ? `${rec?.report_type || 'Report'} · generated ${timeAgo(rec?.created)}` :
    kind === 'log' ? timeAgo(rec?.created) :
    kind === 'form' ? (rec ? 'Update fields and save' : 'Fields auto-detected from your data') :
    'Pick what to download and in which format';
  const drawerIcon =
    kind === 'report' ? <FileText className="h-5 w-5" /> :
    kind === 'log' ? <Database className="h-5 w-5" /> :
    kind === 'form' ? <Pencil className="h-5 w-5" /> :
    <Download className="h-5 w-5" />;

  const drawerChips = (): ReactNode[] => {
    if (!rec) return [];
    if (kind === 'report') {
      const fmt = String(rec.format || '').toUpperCase();
      return [
        rec.report_type ? <Pill key="t" tone="indigo">{rec.report_type}</Pill> : null,
        fmt ? <Pill key="f" tone={fmt === 'PDF' ? 'rose' : fmt === 'EXCEL' || fmt === 'CSV' ? 'emerald' : 'slate'}>{fmt}</Pill> : null,
        rec.officer_type ? <Pill key="o" tone="violet">{rec.officer_type}</Pill> : null,
        rec.department && rec.department !== 'N/A' ? <Pill key="d" tone="slate">{rec.department}</Pill> : null,
        <Pill key="s" dot tone={statusBucket(rec.status) === 'failed' ? 'rose' : statusBucket(rec.status) === 'pending' ? 'amber' : 'emerald'}>
          {rec.status || 'Generated'}
        </Pill>,
      ].filter(Boolean) as ReactNode[];
    }
    return [
      <Pill key="ls" dot tone={statusBucket(rec.status) === 'failed' ? 'rose' : statusBucket(rec.status) === 'pending' ? 'amber' : 'emerald'}>
        {rec.status || 'Success'}
      </Pill>,
    ];
  };

  const attachmentUrl = rec ? findFileUrl(rec) : null;

  const detailBody = rec ? (
    <div>
      <div className="flex flex-wrap gap-1.5 px-6 pb-4 pt-5">{drawerChips()}</div>
      <div className="border-y border-slate-100 bg-slate-50/60 px-6 py-2">
        <p className="text-[10.5px] font-bold uppercase tracking-widest text-slate-400">All fields · full payload</p>
      </div>
      <DetailGrid record={rec} />
      {attachmentUrl && (
        <a href={attachmentUrl} target="_blank" rel="noreferrer"
          className="mx-6 mb-6 mt-4 flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 transition hover:border-indigo-300 hover:bg-indigo-50/40">
          <FileDown className="h-5 w-5 shrink-0 text-indigo-600" />
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-semibold text-slate-800">Download attachment</p>
            <p className="text-[11.5px] text-slate-500">Original file uploaded with this record</p>
          </div>
          <ExternalLink className="h-4 w-4 shrink-0 text-slate-400" />
        </a>
      )}
    </div>
  ) : null;

  const detailFooter = rec && detailCollection ? (
    <div className="space-y-3">
      <div className="flex gap-2">
        <button onClick={() => openForm(detailCollection, rec)}
          className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-xl border border-indigo-200 bg-indigo-50/60 text-[12.5px] font-semibold text-indigo-700 transition hover:bg-indigo-100">
          <Pencil className="h-4 w-4" /> Edit
        </button>
        {drawerDeleteConfirm ? (
          <>
            <button onClick={confirmDelete} disabled={deleting}
              className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-xl bg-rose-600 text-[12.5px] font-semibold text-white transition hover:bg-rose-700 disabled:opacity-50">
              <Trash2 className="h-4 w-4" /> Confirm
            </button>
            <button onClick={() => setDrawerDeleteConfirm(false)}
              className="inline-flex h-10 items-center justify-center rounded-xl border border-slate-200 px-3 text-[12.5px] font-semibold text-slate-500 transition hover:bg-slate-100">
              Cancel
            </button>
          </>
        ) : (
          <button onClick={() => setDrawerDeleteConfirm(true)}
            className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-xl border border-rose-200 bg-rose-50/60 text-[12.5px] font-semibold text-rose-700 transition hover:bg-rose-100">
            <Trash2 className="h-4 w-4" /> Delete
          </button>
        )}
      </div>
      <div>
        <p className="mb-2 text-[10.5px] font-bold uppercase tracking-widest text-slate-400">Download this record</p>
        <div className="grid grid-cols-4 gap-2">
          {FORMAT_OPTIONS.map(f => (
            <button key={f.key}
              onClick={() => downloadDataset(f.key, `${drawerTitle} — record`, [normalizeRecord(rec)])}
              className="flex flex-col items-center gap-1.5 rounded-xl border border-slate-200 bg-white py-2.5 text-[11px] font-semibold text-slate-600 transition hover:border-indigo-400 hover:bg-indigo-50/50 hover:text-indigo-700">
              <f.icon className="h-5 w-5" />
              {f.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  ) : null;

  const activeFields = drawer.collection === 'report_history' ? reportFields : logFields;

  const formBody = (
    <div>
      {rec && (
        <div className="border-b border-slate-100 bg-slate-50/60 px-6 py-2.5 text-[11.5px] text-slate-500">
          Editing existing record · created {timeAgo(rec.created)}
        </div>
      )}
      <RecordForm fields={activeFields} values={formValues}
        onChange={(k, v) => setFormValues(vals => ({ ...vals, [k]: v }))} />
      <p className="px-5 pb-5 text-[11.5px] leading-relaxed text-slate-400">
        Fields are auto-detected from existing records. Leave optional fields empty to skip them.
      </p>
    </div>
  );

  const formFooter = (
    <div className="flex gap-2">
      <button onClick={closeDrawer}
        className="h-11 rounded-xl border border-slate-200 px-4 text-[13px] font-semibold text-slate-600 transition hover:bg-slate-100">
        Cancel
      </button>
      <button onClick={handleSave} disabled={saving}
        className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-slate-900 text-[13px] font-semibold text-white transition hover:bg-slate-700 disabled:opacity-50">
        {saving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
        {rec ? 'Save changes' : 'Create record'}
      </button>
    </div>
  );

  const exportBody = (
    <div className="space-y-6 p-5">
      <div>
        <p className="text-[10.5px] font-bold uppercase tracking-widest text-slate-400">1 · Choose data</p>
        <div className="mt-2.5 space-y-2">
          {EXPORT_TARGETS.map(t => {
            const active = exportTarget === t.key;
            return (
              <button key={t.key} onClick={() => setExportTarget(t.key)}
                className={cx('flex w-full items-center gap-3 rounded-xl border p-3.5 text-left transition',
                  active ? 'border-indigo-500 bg-indigo-50/50 ring-1 ring-indigo-500' : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50')}>
                <div className={cx('flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition',
                  active ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-500')}>
                  <t.icon className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-semibold text-slate-800">{t.label}</p>
                  <p className="truncate text-[11.5px] text-slate-500">{t.desc}</p>
                </div>
                {active && <CheckCircle2 className="h-5 w-5 shrink-0 text-indigo-600" />}
              </button>
            );
          })}
        </div>
      </div>
      <div>
        <p className="text-[10.5px] font-bold uppercase tracking-widest text-slate-400">2 · Choose format</p>
        <div className="mt-2.5 grid grid-cols-4 gap-2">
          {FORMAT_OPTIONS.map(f => (
            <button key={f.key} onClick={() => setExportFormat(f.key)}
              className={cx('flex flex-col items-center gap-1.5 rounded-xl border py-3 transition',
                exportFormat === f.key ? 'border-indigo-500 bg-indigo-50/50 text-indigo-700' : 'border-slate-200 text-slate-500 hover:border-slate-300')}>
              <f.icon className="h-5 w-5" />
              <span className="text-[11px] font-semibold">{f.label}</span>
            </button>
          ))}
        </div>
        {exportFormat === 'pdf' && (
          <p className="mt-2.5 text-[11.5px] leading-relaxed text-slate-400">
            PDF opens your browser&apos;s print preview — choose &ldquo;Save as PDF&rdquo; as the destination.
          </p>
        )}
      </div>
    </div>
  );

  const exportFooter = (
    <button
      onClick={() => downloadDataset(exportFormat, EXPORT_TARGETS.find(t => t.key === exportTarget)?.label || 'Export', buildExportRows(exportTarget))}
      disabled={buildExportRows(exportTarget).length === 0}
      className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-slate-900 text-[13px] font-semibold text-white shadow-sm transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40">
      <Download className="h-4 w-4" />
      Download {FORMAT_OPTIONS.find(f => f.key === exportFormat)?.label}
    </button>
  );

  /* ── KPIs (all from report_history + update_logs — nothing duplicated) ── */
  const successTint = reportHealth.rate == null ? 'bg-slate-100 text-slate-500'
    : reportHealth.rate >= 80 ? 'bg-emerald-50 text-emerald-600'
    : reportHealth.rate >= 50 ? 'bg-amber-50 text-amber-600'
    : 'bg-rose-50 text-rose-600';

  const kpis = [
    {
      label: 'Reports Generated', value: reportStats.count, big: true,
      icon: History, tint: 'bg-blue-50 text-blue-600', trend: reportStats.trend,
      sub: reportStats.last ? `${reportStats.recent} in last 30 days · latest ${timeAgo(reportStats.last)}` : 'none yet',
      help: 'Total reports ever generated · trend = last 30 days vs the 30 before',
    },
    {
      label: 'Report Success Rate', value: reportHealth.rate != null ? `${reportHealth.rate}%` : '—', big: true,
      icon: Target, tint: successTint, trend: null,
      sub: reportHealth.total
        ? `${reportHealth.success} ok · ${reportHealth.failed} failed · ${reportHealth.pending} pending`
        : 'no reports yet',
      help: 'Share of all generated reports that completed without errors',
    },
    {
      label: 'System Activity', value: logStats.count, big: true,
      icon: Activity, tint: 'bg-violet-50 text-violet-600', trend: logStats.trend,
      sub: logStats.last ? `${logStats.recent} in last 30 days · last activity ${timeAgo(logStats.last)}` : 'no activity yet',
      help: 'Total update-log entries · trend = last 30 days vs the 30 before',
    },
    {
      label: 'Top Report Type', value: reportHealth.topType ?? '—', big: false,
      icon: FileText, tint: 'bg-teal-50 text-teal-600', trend: null,
      sub: reportHealth.topType
        ? `${reportHealth.topCount} reports · ${Math.round((reportHealth.topCount / Math.max(reportHealth.total, 1)) * 100)}% of all`
        : 'no report types yet',
      help: 'The most frequently generated report type (all time)',
    },
  ];

  const statusSegments = STATUS_META
    .map(s => ({ ...s, value: (a as any)[`${s.key}Meetings`] ?? 0 }))
    .filter(s => s.value > 0);
  const totalStatus = statusSegments.reduce((sum, s) => sum + s.value, 0);
  const maxMonthly = Math.max(...a.monthlyData.map((m: any) => m.count), 1);

  const TABS: { key: TabKey; label: string; icon: LucideIcon; count: number }[] = [
    { key: 'reports', label: 'Report History', icon: History, count: reports.length },
    { key: 'logs', label: 'Activity Logs', icon: Database, count: logs.length },
  ];

  const card = 'rounded-2xl border border-slate-200/70 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)]';
  const rPendingId = pendingDelete?.collection === 'report_history' ? pendingDelete.id : null;
  const lPendingId = pendingDelete?.collection === 'update_logs' ? pendingDelete.id : null;

  return (
    <div className="w-full bg-[#fbfbfd]">
      <div className="mx-auto w-full max-w-[1320px] space-y-5 px-5 py-8 lg:px-8">

        {/* ── Header ── */}
        <header className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-[22px] font-bold tracking-tight text-slate-900">Reports &amp; Analytics</h1>
            <p className="mt-1 text-[13px] text-slate-500">Insights, report history and system activity — one clean view</p>
          </div>
          <div className="flex items-center gap-2.5">
            <button onClick={() => loadReportData(true)} aria-label="Refresh data" title="Refresh"
              className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 shadow-sm transition hover:text-slate-800">
              <RefreshCw className={cx('h-4 w-4', refreshing && 'animate-spin')} />
            </button>
            <button onClick={openExport}
              className="inline-flex h-9 items-center gap-2 rounded-xl bg-slate-900 px-4 text-[12.5px] font-semibold text-white shadow-sm transition hover:bg-slate-700">
              <Download className="h-4 w-4" /> Export
            </button>
          </div>
        </header>

        {/* ── KPI cards ── */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {kpis.map(k => {
            const Icon = k.icon;
            return (
              <div key={k.label} className={card} title={k.help}>
                <div className="flex items-center justify-between">
                  <div className={cx('flex h-10 w-10 items-center justify-center rounded-xl', k.tint)}>
                    <Icon className="h-5 w-5" strokeWidth={1.75} />
                  </div>
                  <TrendChip delta={k.trend} />
                </div>
                <p className={cx('mt-4 break-words font-bold leading-tight tracking-tight text-slate-900', k.big ? 'text-[26px]' : 'text-[21px]')}>{k.value}</p>
                <p className="text-[12.5px] font-medium text-slate-500">{k.label}</p>
                <p className="mt-1 text-[11.5px] text-slate-400">{k.sub}</p>
              </div>
            );
          })}
        </div>

        {/* ── Charts ── */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className={card}>
            <div className="flex items-baseline justify-between">
              <h3 className="text-[14px] font-bold text-slate-900">Meeting Outcomes</h3>
              <span className="text-[11px] text-slate-400">all time</span>
            </div>
            {totalStatus === 0 ? (
              <div className="flex h-32 items-center justify-center text-[12.5px] text-slate-400">No meetings yet</div>
            ) : (
              <>
                <div className="mt-5 flex h-2.5 overflow-hidden rounded-full bg-slate-100">
                  {statusSegments.map(s => (
                    <div key={s.label} style={{ width: `${(s.value / totalStatus) * 100}%`, backgroundColor: s.color }}
                      className="transition-all duration-500" />
                  ))}
                </div>
                <div className="mt-4 space-y-2.5">
                  {statusSegments.map(s => (
                    <div key={s.label} className="flex items-center gap-2.5">
                      <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: s.color }} />
                      <span className="flex-1 text-[12.5px] text-slate-600">{s.label}</span>
                      <span className="text-[12px] font-semibold tabular-nums text-slate-800">{s.value}</span>
                      <span className="w-9 text-right text-[11.5px] tabular-nums text-slate-400">
                        {Math.round((s.value / totalStatus) * 100)}%
                      </span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>

          <div className={card}>
            <div className="flex items-baseline justify-between">
              <h3 className="text-[14px] font-bold text-slate-900">6-Month Trend</h3>
              <span className="text-[11px] text-slate-400">meetings / month</span>
            </div>
            {a.totalMeetings === 0 ? (
              <div className="flex h-32 items-center justify-center text-[12.5px] text-slate-400">No data yet</div>
            ) : (
              <div className="flex h-36 items-stretch gap-2.5 pt-4">
                {a.monthlyData.map((m: any) => (
                  <div key={m.month} className="group flex flex-1 flex-col items-center justify-end gap-1">
                    <span className="text-[10.5px] font-bold text-indigo-600 opacity-0 transition group-hover:opacity-100">{m.count}</span>
                    <div style={{ height: `${Math.max((m.count / maxMonthly) * 96, 3)}%` }}
                      className="w-full rounded-t-md bg-gradient-to-t from-indigo-600 to-indigo-400 transition-all duration-500 group-hover:from-indigo-700 group-hover:to-indigo-500" />
                    <span className="text-[11px] font-medium text-slate-400">{m.month}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className={card}>
            <div className="flex items-baseline justify-between">
              <h3 className="text-[14px] font-bold text-slate-900">Most Active Officers</h3>
              <span className="text-[11px] text-slate-400">by meetings</span>
            </div>
            {a.topOfficers.length === 0 ? (
              <div className="flex h-32 items-center justify-center text-[12.5px] text-slate-400">No meeting data yet</div>
            ) : (
              <div className="mt-4 space-y-3.5">
                {a.topOfficers.map((o: any, i: number) => (
                  <div key={o.name} className="flex items-center gap-3">
                    <span className={cx('flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[11px] font-bold',
                      i === 0 ? 'bg-gradient-to-br from-amber-400 to-amber-600 text-white' :
                      i === 1 ? 'bg-gradient-to-br from-slate-300 to-slate-400 text-white' :
                      i === 2 ? 'bg-gradient-to-br from-orange-400 to-orange-500 text-white' :
                      'bg-slate-100 text-slate-500')}>
                      {i + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <p className="truncate text-[12.5px] font-semibold text-slate-700">{o.name}</p>
                        <span className="text-[11.5px] font-bold tabular-nums text-slate-500">{o.count}</span>
                      </div>
                      <div className="mt-1 h-1 overflow-hidden rounded-full bg-slate-100">
                        <div className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-violet-400"
                          style={{ width: `${(o.count / a.topOfficers[0].count) * 100}%` }} />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ── Data section ── */}
        <section className="overflow-hidden rounded-2xl border border-slate-200/70 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 pt-4">
            <div className="flex flex-wrap gap-1">
              {TABS.map(t => (
                <button key={t.key} onClick={() => { setTab(t.key); setPendingDelete(null); }}
                  className={cx('flex items-center gap-2 rounded-lg px-3.5 py-2.5 text-[13px] font-semibold transition',
                    tab === t.key ? 'bg-indigo-50 text-indigo-700' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700')}>
                  <t.icon className="h-4 w-4" />
                  {t.label}
                  <span className={cx('rounded-full px-1.5 py-px text-[10px] font-bold',
                    tab === t.key ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-500')}>
                    {t.count}
                  </span>
                </button>
              ))}
            </div>
            <span className="hidden items-center gap-1.5 pb-2.5 text-[11.5px] text-slate-400 md:flex">
              <SlidersHorizontal className="h-3.5 w-3.5" /> Click a row for details · sort by any column
            </span>
          </div>

          {/* ── Report History table ── */}
          {tab === 'reports' && (
            <div>
              {fetchWarnings.includes('report_history') && (
                <div className="flex flex-wrap items-center gap-2 border-b border-amber-100 bg-amber-50/70 px-5 py-2.5">
                  <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" />
                  <p className="flex-1 text-[12.5px] font-medium text-amber-800">Couldn&apos;t load report_history — the list may be incomplete.</p>
                  <button onClick={() => loadReportData(true)}
                    className="text-[12px] font-semibold text-amber-700 underline underline-offset-2">Retry</button>
                </div>
              )}
              <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 bg-slate-50/60 px-5 py-3">
                <SearchInput value={rf.q} onChange={q => setRf(f => ({ ...f, q }))} placeholder="Search any field…" />
                <FilterSelect label="Report type" value={rf.type} onChange={v => setRf(f => ({ ...f, type: v }))} options={rTypeOpts} />
                <FilterSelect label="Format" value={rf.format} onChange={v => setRf(f => ({ ...f, format: v }))} options={rFormatOpts} />
                <FilterSelect label="Status" value={rf.status} onChange={v => setRf(f => ({ ...f, status: v }))} options={bucketOpts('All statuses', 'Generated')} />
                {rFilterCount > 0 && (
                  <button onClick={() => setRf(DEFAULT_RF)}
                    className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-[12px] font-semibold text-slate-500 transition hover:border-rose-300 hover:text-rose-600">
                    <X className="h-3.5 w-3.5" /> Clear ({rFilterCount})
                  </button>
                )}
                <div className="ml-auto flex items-center gap-2">
                  <ColumnPicker columns={reportColumns} isVisible={isReportColVisible}
                    onToggle={toggleReportCol} onReset={() => setRVisible({})} />
                  <button onClick={() => openForm('report_history')}
                    className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 text-[12.5px] font-semibold text-white shadow-sm transition hover:bg-indigo-500">
                    <Plus className="h-4 w-4" /> New Report
                  </button>
                </div>
              </div>

              {rTotal === 0 ? (
                <EmptyState icon={FileText}
                  title={rFilterCount > 0 ? 'No reports match your filters' : 'No reports generated yet'}
                  hint={rFilterCount > 0 ? 'Try loosening or clearing the filters above' : 'Create one with the New Report button'}
                  action={rFilterCount > 0 ? (
                    <button onClick={() => setRf(DEFAULT_RF)}
                      className="rounded-lg border border-slate-200 px-3.5 py-1.5 text-[12px] font-semibold text-slate-600 transition hover:bg-slate-50">
                      Clear filters
                    </button>
                  ) : (
                    <button onClick={() => openForm('report_history')}
                      className="rounded-lg bg-indigo-600 px-3.5 py-1.5 text-[12px] font-semibold text-white transition hover:bg-indigo-500">
                      Create report
                    </button>
                  )}
                />
              ) : (
                <GenericTable
                  records={rSlice}
                  columns={reportColumns}
                  isVisible={isReportColVisible}
                  sortKey={rSort?.key ?? null}
                  sortDir={rSort?.dir ?? 'desc'}
                  onSort={handleRSort}
                  onOpen={r => openDetails('report', r)}
                  onEdit={r => openForm('report_history', r)}
                  onRequestDelete={r => setPendingDelete({ id: r.id, collection: 'report_history' })}
                  pendingDeleteId={rPendingId}
                  onConfirmDelete={confirmDelete}
                  onCancelDelete={() => setPendingDelete(null)}
                  renderCell={renderCell}
                />
              )}

              <Pagination page={rSafe} pages={rPages} total={rTotal}
                start={rTotal ? (rSafe - 1) * rSize + 1 : 0} end={Math.min(rSafe * rSize, rTotal)}
                onPage={setRPage} size={rSize} onSize={s => { setRSize(s); setRPage(1); }} />
            </div>
          )}

          {/* ── Activity Logs table (full payload as columns) ── */}
          {tab === 'logs' && (
            <div>
              {fetchWarnings.includes('update_logs') && (
                <div className="flex flex-wrap items-center gap-2 border-b border-amber-100 bg-amber-50/70 px-5 py-2.5">
                  <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" />
                  <p className="flex-1 text-[12.5px] font-medium text-amber-800">Couldn&apos;t load update_logs — the list may be incomplete.</p>
                  <button onClick={() => loadReportData(true)}
                    className="text-[12px] font-semibold text-amber-700 underline underline-offset-2">Retry</button>
                </div>
              )}
              <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 bg-slate-50/60 px-5 py-3">
                <SearchInput value={lq} onChange={setLq} placeholder="Search any field…" />
                <FilterSelect label="Status" value={lStatus} onChange={setLStatus} options={bucketOpts('All statuses', 'Success')} />
                {lFilterCount > 0 && (
                  <button onClick={() => { setLq(''); setLStatus('all'); }}
                    className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-[12px] font-semibold text-slate-500 transition hover:border-rose-300 hover:text-rose-600">
                    <X className="h-3.5 w-3.5" /> Clear
                  </button>
                )}
                <div className="ml-auto flex items-center gap-2">
                  <ColumnPicker columns={logColumns} isVisible={isLogColVisible}
                    onToggle={toggleLogCol} onReset={() => setLVisible({})} />
                  <button onClick={() => openForm('update_logs')}
                    className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 text-[12.5px] font-semibold text-white shadow-sm transition hover:bg-indigo-500">
                    <Plus className="h-4 w-4" /> New Log
                  </button>
                </div>
              </div>

              {lTotal === 0 ? (
                <EmptyState icon={Database}
                  title={lFilterCount > 0 ? 'No activity matches your filters' : 'No update logs found'}
                  hint={lFilterCount > 0 ? 'Try a different keyword or status' : 'Create one with the New Log button'}
                />
              ) : (
                <GenericTable
                  records={lSlice}
                  columns={logColumns}
                  isVisible={isLogColVisible}
                  sortKey={lSort?.key ?? null}
                  sortDir={lSort?.dir ?? 'desc'}
                  onSort={handleLSort}
                  onOpen={l => openDetails('log', l)}
                  onEdit={l => openForm('update_logs', l)}
                  onRequestDelete={l => setPendingDelete({ id: l.id, collection: 'update_logs' })}
                  pendingDeleteId={lPendingId}
                  onConfirmDelete={confirmDelete}
                  onCancelDelete={() => setPendingDelete(null)}
                  renderCell={renderCell}
                />
              )}

              <Pagination page={lSafe} pages={lPages} total={lTotal}
                start={lTotal ? (lSafe - 1) * lSize + 1 : 0} end={Math.min(lSafe * lSize, lTotal)}
                onPage={setLPage} size={lSize} onSize={s => { setLSize(s); setLPage(1); }} />
            </div>
          )}
        </section>
      </div>

      {/* ── Off-canvas drawer ── */}
      <OffCanvas
        open={drawer.kind !== null}
        onClose={closeDrawer}
        title={drawerTitle}
        subtitle={drawerSubtitle}
        icon={drawerIcon}
        footer={drawer.kind === 'export' ? exportFooter : drawer.kind === 'form' ? formFooter : detailFooter}
      >
        {drawer.kind === 'export' ? exportBody : drawer.kind === 'form' ? formBody : detailBody}
      </OffCanvas>

      <Toast toast={toast} />
    </div>
  );
}