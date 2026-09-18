'use client';

import { useEffect, useState, type ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  AlertCircle, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight,
  ChevronUp, Minus, Search, TrendingDown, TrendingUp, X,
} from 'lucide-react';
import pb from '@/lib/pocketbase';

/* ── Types ── */
export type RecordItem = Record<string, any> & { id: string };
export type SortDir = 'asc' | 'desc';
export type ExportFormat = 'csv' | 'excel' | 'json' | 'pdf';
export interface SortState { key: string; dir: SortDir; }
export interface ColumnDef { key: string; label: string; defaultVisible?: boolean; }
export interface FieldDef { key: string; label: string; type: 'text' | 'date' | 'select' | 'textarea'; options?: string[]; }

/* ── Constants ── */
export const HIDDEN_KEYS = ['id', 'collectionId', 'collectionName'];
export const FILE_KEYS = ['file', 'attachment', 'report_file', 'document', 'pdf', 'excel_file'];
export const SIZE_OPTIONS = [10, 25, 50, 100];

export const ACTION_KEYS = ['action', 'event', 'type', 'title', 'operation', 'activity', 'log_type', 'activity_type'];
export const USER_KEYS = ['user', 'performed_by', 'username', 'author', 'user_name', 'actor', 'generated_by', 'by'];
export const DETAILS_KEYS = ['details', 'description', 'message', 'notes', 'content', 'summary', 'log', 'payload', 'data'];
export const STATUS_KEYS = ['status', 'result', 'state', 'outcome'];

export const REPORT_PREFERRED = ['created', 'title', 'report_type', 'status', 'format', 'generated_by', 'date_from', 'date_to', 'department', 'officer_type'];
export const REPORT_DEFAULT_VISIBLE = new Set(['created', 'title', 'report_type', 'status', 'format', 'generated_by']);

export const COLUMN_LABELS: Record<string, string> = {
  created: 'Generated', title: 'Title', report_type: 'Type', generated_by: 'By',
  date_from: 'From', date_to: 'To', action: 'Action', user: 'User', details: 'Details',
};

export const TONES: Record<string, string> = {
  emerald: 'bg-emerald-50 text-emerald-700 ring-emerald-600/15',
  amber: 'bg-amber-50 text-amber-700 ring-amber-600/15',
  rose: 'bg-rose-50 text-rose-700 ring-rose-600/15',
  indigo: 'bg-indigo-50 text-indigo-700 ring-indigo-600/15',
  violet: 'bg-violet-50 text-violet-700 ring-violet-600/15',
  slate: 'bg-slate-100 text-slate-600 ring-slate-500/15',
};

export const FIELD_CLS = 'w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-[13px] text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100';

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');
export const humanize = (k: string) => k.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

/* ── Formatting ── */
export const fmtDate = (d?: string) =>
  d && d !== 'N/A' ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';

export const fmtDateTime = (d?: string) =>
  d && d !== 'N/A' ? new Date(d).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';

export function timeAgo(d?: string) {
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

export function statusBucket(status?: string) {
  const s = (status || '').toLowerCase();
  if (s.includes('fail') || s.includes('error')) return 'failed';
  if (s.includes('pending') || s.includes('process') || s.includes('progress')) return 'pending';
  return 'success';
}

export const statusTone = (s?: string): keyof typeof TONES =>
  statusBucket(s) === 'failed' ? 'rose' : statusBucket(s) === 'pending' ? 'amber' : 'emerald';

export const deltaPct = (cur: number, prev: number) =>
  prev === 0 ? (cur > 0 ? 100 : 0) : Math.round(((cur - prev) / prev) * 100);

export function sortRecords(items: RecordItem[], key: string, dir: SortDir): RecordItem[] {
  return [...items].sort((a, b) => {
    const av = a[key], bv = b[key];
    let cmp = 0;
    if (av == null && bv == null) cmp = 0;
    else if (av == null) cmp = -1;
    else if (bv == null) cmp = 1;
    else if (typeof av === 'number' && typeof bv === 'number') cmp = av - bv;
    else {
      const as = String(av), bs = String(bv);
      const ad = Date.parse(as), bd = Date.parse(bs);
      if (!isNaN(ad) && !isNaN(bd) && /^\d{4}-\d{2}/.test(as) && /^\d{4}-\d{2}/.test(bs)) cmp = ad - bd;
      else cmp = as.localeCompare(bs, undefined, { numeric: true, sensitivity: 'base' });
    }
    return dir === 'asc' ? cmp : -cmp;
  });
}

export function normalizeRecord(r: RecordItem): Record<string, string> {
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

export function findFileUrl(record: RecordItem): string | null {
  const key = FILE_KEYS.find(k => typeof record[k] === 'string' && record[k]);
  if (!key || !record.id) return null;
  try { return pb.files.getUrl(record, record[key]) || null; } catch { return null; }
}

/* ── Export / download (zero dependencies) ── */

function triggerDownload(content: string, filename: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
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
 ${rows.map(r => `<tr>${r.map(c => `<td>${escHTML(c)}</td>`).join('\n')}</tr>`).join('')}
</tbody></table>
<p class="foot">Civillist Reports &middot; ${new Date().toLocaleString()}</p>
<script>window.onload = function () { setTimeout(function () { window.print(); }, 250); }<\/script>
</body></html>`;
}

export function downloadDataset(format: ExportFormat, title: string, rows: Record<string, any>[]) {
  if (!rows.length) return;
  const stamp = new Date().toISOString().slice(0, 10);
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  if (format === 'json') return triggerDownload(JSON.stringify(rows, null, 2), `${slug}-${stamp}.json`, 'application/json');
  if (format === 'csv') return triggerDownload('\uFEFF' + rowsToCSV(rows), `${slug}-${stamp}.csv`, 'text/csv;charset=utf-8');
  if (format === 'excel') return triggerDownload(rowsToExcelHTML(title, rows), `${slug}-${stamp}.xls`, 'application/vnd.ms-excel');
  let headers: string[]; let body: string[][];
  if (rows.length === 1) {
    headers = ['Field', 'Value'];
    body = Object.entries(rows[0]).map(([k, v]) => [k, String(v ?? '—')]);
  } else {
    headers = Object.keys(rows[0]);
    body = rows.map(r => headers.map(h => String(r[h] ?? '—')));
  }
  const w = window.open('', '_blank', 'width=880,height=980');
  if (!w) { window.alert('Allow pop-ups once so the PDF preview can open, then choose "Save as PDF".'); return; }
  w.document.write(buildPdfHTML(title, headers, body, headers.length > 5));
  w.document.close();
}

/* ── Fetch every record (pages through getList) ── */
export async function fetchAllRecords(collection: string, sort = '-created'): Promise<RecordItem[]> {
  const PER = 100;
  const first = await pb.collection(collection).getList(1, PER, { sort });
  const all: any[] = [...first.items];
  const totalPages = first.totalPages ?? 1;
  if (totalPages > 1) {
    const rest = await Promise.all(
      Array.from({ length: totalPages - 1 }, (_, i) =>
        pb.collection(collection).getList(i + 2, PER, { sort }).then(res => res.items))
    );
    rest.forEach(items => all.push(...items));
  }
  return all as RecordItem[];
}

/* ── Auto-detected form fields ── */
export function buildFieldDefs(records: RecordItem[], preferred: string[]): FieldDef[] {
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
    if (isDate) type = 'date'; else if (isSelect) type = 'select'; else if (isLong) type = 'textarea';
    return { key: k, label: humanize(k), type, options: type === 'select' ? vals : undefined };
  });
}

/* ── UI primitives ── */

export function Pill({ tone, children, dot = false }: { tone: keyof typeof TONES; children: ReactNode; dot?: boolean }) {
  return (
    <span className={cx('inline-flex items-center gap-1.5 rounded-full px-2.5 py-[3px] text-[11px] font-semibold ring-1 ring-inset', TONES[tone])}>
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}

export function TrendChip({ delta }: { delta: number | null }) {
  if (delta == null) return null;
  const Icon = delta === 0 ? Minus : delta > 0 ? TrendingUp : TrendingDown;
  const tone = delta === 0 ? 'bg-slate-100 text-slate-500' : delta > 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700';
  return (
    <span title="Last 30 days vs previous 30 days" className={cx('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold', tone)}>
      <Icon className="h-3 w-3" />{delta > 0 ? '+' : ''}{delta}%
    </span>
  );
}

export function Toast({ toast }: { toast: { kind: 'ok' | 'err'; msg: string } | null }) {
  return (
    <div className={cx(
      'fixed bottom-5 right-5 z-[60] flex max-w-xs items-start gap-2.5 rounded-xl px-4 py-3 shadow-lg transition-all duration-300',
      toast ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-2 opacity-0',
      toast?.kind === 'err' ? 'bg-rose-600 text-white' : 'bg-slate-900 text-white',
    )}>
      {toast?.kind === 'err' ? <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> : <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />}
      <p className="text-[12.5px] font-medium leading-snug">{toast?.msg}</p>
    </div>
  );
}

export function EmptyState({ icon: Icon, title, hint, action }: { icon: LucideIcon; title: string; hint: string; action?: ReactNode }) {
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

export function SearchInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <div className="relative min-w-[180px] flex-1 sm:max-w-xs">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
      <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        className="h-9 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-[13px] text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100" />
    </div>
  );
}

export function FilterSelect({ label, value, onChange, options }: {
  label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[];
}) {
  return (
    <label className="relative">
      <span className="sr-only">{label}</span>
      <select value={value} onChange={e => onChange(e.target.value)}
        className="h-9 cursor-pointer appearance-none rounded-lg border border-slate-200 bg-white pl-3 pr-8 text-[13px] font-medium text-slate-700 outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100">
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
    </label>
  );
}

export function ColumnPicker({ columns, isVisible, onToggle, onReset }: {
  columns: ColumnDef[]; isVisible: (k: string) => boolean; onToggle: (k: string) => void; onReset: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button onClick={() => setOpen(o => !o)}
        className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-[12.5px] font-semibold text-slate-600 transition hover:border-slate-300 hover:text-slate-800">
        <ChevronDown className={cx('h-3.5 w-3.5 text-slate-400 transition', open && 'rotate-180')} />Columns
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
              <button onClick={onReset} className="w-full rounded-lg px-2.5 py-1.5 text-left text-[12px] font-semibold text-slate-500 transition hover:bg-slate-50 hover:text-slate-700">Reset to default</button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export function pageList(cur: number, total: number): (number | '…')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  if (cur <= 4) return [1, 2, 3, 4, 5, '…', total];
  if (cur >= total - 3) return [1, '…', total - 4, total - 3, total - 2, total - 1, total];
  return [1, '…', cur - 1, cur, cur + 1, '…', total];
}

export function Pagination({ page, pages, start, end, total, onPage, size, onSize }: {
  page: number; pages: number; start: number; end: number; total: number;
  onPage: (p: number) => void; size: number; onSize: (s: number) => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-5 py-3">
      <div className="flex items-center gap-4">
        <p className="text-[12px] text-slate-500">
          Showing <span className="font-semibold text-slate-700">{total ? start : 0}–{end}</span> of <span className="font-semibold text-slate-700">{total}</span>
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
          n === '…' ? <span key={`d-${i}`} className="px-1 text-[12px] text-slate-400">…</span> : (
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

/* ── Off-canvas panel ── */
export function OffCanvas({ open, onClose, title, subtitle, icon, children, footer }: {
  open: boolean; onClose: () => void; title: string; subtitle?: string; icon?: ReactNode; children: ReactNode; footer?: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [open, onClose]);

  return (
    <>
      <div onClick={onClose}
        className={cx('fixed inset-0 z-40 bg-slate-900/30 backdrop-blur-[2px] transition-opacity duration-300',
          open ? 'opacity-100' : 'pointer-events-none opacity-0')} />
      <aside role="dialog" aria-modal="true"
        className={cx('fixed inset-y-0 right-0 z-50 flex w-full max-w-[460px] transform flex-col bg-white shadow-2xl transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]',
          open ? 'translate-x-0' : 'translate-x-full')}>
        <header className="flex items-start gap-3 border-b border-slate-100 px-6 py-5">
          {icon && <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">{icon}</div>}
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-[15px] font-bold text-slate-900">{title}</h2>
            {subtitle && <p className="mt-0.5 truncate text-[12px] text-slate-500">{subtitle}</p>}
          </div>
          <button onClick={onClose} aria-label="Close panel" className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700">
            <X className="h-5 w-5" />
          </button>
        </header>
        <div className="flex-1 overflow-y-auto overscroll-contain">{children}</div>
        {footer && <div className="border-t border-slate-100 bg-slate-50/70 px-6 py-4">{footer}</div>}
      </aside>
    </>
  );
}