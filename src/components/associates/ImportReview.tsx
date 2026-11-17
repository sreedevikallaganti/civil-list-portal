'use client';

/* One imported file: dry run → approve (save) → sync into Associates, or merge with another file.
   The file has its own columns (rename / add / remove / reorder via Edit columns); where each one goes in
   Associates is chosen and approved in the sync step. Rows are checked live in the browser while editing;
   saving and syncing check them again on the server. */

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import {
  AlertTriangle, ArrowLeft, CheckCircle2, ChevronLeft, ChevronRight, Columns3, Download, Eye, FileSpreadsheet,
  GitMerge, Loader2, Pencil, RefreshCw, RotateCcw, Save, Search, Send, Trash2, X, XCircle,
} from 'lucide-react';
import { showToast } from '@/components/Toaster';
import { useAuth } from '@/contexts/AuthContext';
import { canEdit, roleOf } from '@/lib/roles';
import { displayValue, mappingError, type Associate, type AssociateField, type Cell, type ColumnMap } from '@/lib/associates';
import {
  checkImport, columnFields, fileColumnsOf, pruneRows, splitImportPath, submitPlan,
  type DuplicateAction, type FileColumn, type ImportBatch, type RowCheck, type StagedRow, type SubmitResult,
} from '@/lib/associateImport';
import { errorText, listAssociates, listFields } from '@/lib/associatesApi';
import { changeColumns, downloadOriginal, getImport, originalFileUrl, saveDraft, submitImport } from '@/lib/associateImportsApi';
import { parseWorkbook, withTitleRow, type SheetData } from '@/lib/associateExcel';
import { positionalTitles } from '@/lib/associates';
import StagedRowPanel from './StagedRowPanel';
import AssociatesFrame from './AssociatesFrame';
import FilePreview from './FilePreview';
import MergeDialog from './MergeDialog';
import { ColumnEditor, SyncDialog } from './ImportColumns';
import { btn, inputCls, useEscape } from './ui';
import { ColumnMapper, Count, samplesOf, StatusBadge, when } from './importUi';

const PER_PAGE = 50;
type Filter = 'all' | 'valid' | 'invalid' | 'duplicate' | 'removed';

/** Same fixed id the server gives a row on submit (sha-256 of batch + row, first 15 hex characters). */
async function fixedIdOf(seed: string) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(seed));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 15);
}

export default function ImportReview({ id }: { id: string }) {
  const { user } = useAuth();
  const editable = canEdit(user);
  /** editors prepare drafts; only an admin submits them to the list */
  const canSubmit = roleOf(user) === 'admin';

  const [batch, setBatch] = useState<ImportBatch | null>(null);
  const [fields, setFields] = useState<AssociateField[]>([]);
  const [people, setPeople] = useState<Associate[]>([]);
  const [mine, setMine] = useState<Set<string>>(new Set());
  const [loadError, setLoadError] = useState('');

  const [rows, setRows] = useState<StagedRow[]>([]);
  const [cols, setCols] = useState<FileColumn[]>([]);
  const [editingCols, setEditingCols] = useState(false);
  const [merging, setMerging] = useState(false);
  const [onDuplicate, setOnDuplicate] = useState<DuplicateAction>('skip');
  const [dirty, setDirty] = useState(false);

  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<string | null>(null);

  const [saving, setSaving] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<SubmitResult | null>(null);

  const [columnsOpen, setColumnsOpen] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [rereading, setRereading] = useState(false);

  /* ── loading ── */
  const load = useCallback(async () => {
    try {
      const [b, f, p] = await Promise.all([getImport(id), listFields(), listAssociates()]);
      setBatch(b);
      setFields(f);
      setPeople(p);
      setRows(b.rows || []);
      setCols(fileColumnsOf(b.settings, f));
      setOnDuplicate(b.settings?.onDuplicate || 'skip');
      setDirty(false);
      setLoadError('');
      if (b.status === 'submitted') setResult(b.result || null);
      // an earlier submit stopped part-way: the people it already added aren't "duplicates" of this file
      // (crypto.subtle only exists on https:// or localhost — opened through the network address it is
      //  missing, and the page must still open; the server re-checks this on submit anyway)
      if (b.status === 'failed' && b.rows?.length && globalThis.crypto?.subtle) {
        const ids = await Promise.all(b.rows.map((r) => fixedIdOf(`${b.id}:${r.id}`))).catch(() => []);
        setMine(new Set(ids));
      }
    } catch (err) {
      setLoadError(errorText(err));
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  /* still being read on the server → look again every few seconds */
  const processing = batch?.status === 'validating' || (batch?.status === 'uploaded' && !batch.settings);
  useEffect(() => {
    if (!processing) return;
    const t = setInterval(load, 3000);
    return () => clearInterval(t);
  }, [processing, load]);

  /* leaving with unsaved corrections asks first */
  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [dirty]);

  /* ── the live check (the dry run, again with every change) ── */
  const settings = batch?.settings || null;
  /* this file's own columns, in order */
  const shownFields = useMemo(() => columnFields(cols, fields), [cols, fields]);
  const colByKey = useMemo(() => new Map(cols.map((c) => [c.key, c])), [cols]);
  const others = useMemo(() => (mine.size ? people.filter((p) => !mine.has(p.id)) : people), [people, mine]);
  const dry = useMemo(() => checkImport(rows, cols, fields, others), [rows, cols, fields, others]);
  const checks = dry.checks;
  const counts = dry.counts;
  const plan = useMemo(() => submitPlan(rows, checks, onDuplicate), [rows, checks, onDuplicate]);
  /** checked, but not yet approved (saved) by the user */
  const unapproved = batch?.status === 'uploaded' && !!settings;
  const byId = useMemo(() => new Map(people.map((p) => [p.id, p])), [people]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      const c = checks.get(r.id);
      if (filter !== 'all' && c?.status !== filter) return false;
      if (filter === 'all' && r.removed) return false;
      if (!q) return true;
      return [r.name, r.row, ...Object.values(r.data || {})].join(' ').toLowerCase().includes(q);
    });
  }, [rows, checks, filter, query]);
  const pages = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
  const current = Math.min(page, pages);
  const pageRows = filtered.slice((current - 1) * PER_PAGE, current * PER_PAGE);

  const readOnly = !editable || !batch || batch.status === 'submitted' || processing || !settings;

  /* ── editing ── */
  const change = (next: StagedRow[]) => { setRows(next); setDirty(true); };
  const setRemoved = (ids: Set<string>, removed: boolean) =>
    change(rows.map((r) => (ids.has(r.id) ? { ...r, removed: removed || undefined } : r)));

  function bulkRemove(status: 'invalid' | 'duplicate') {
    const ids = new Set(rows.filter((r) => checks.get(r.id)?.status === status).map((r) => r.id));
    setRemoved(ids, true);
    showToast(`${ids.size} ${ids.size === 1 ? 'row' : 'rows'} removed from this import`, 'success');
  }

  /** Saving = the user's approval of the dry run (with their corrections and column changes). */
  async function save(quiet = false, withCols: FileColumn[] = cols): Promise<boolean> {
    if (!batch) return false;
    setSaving(true);
    try {
      const { batch: s } = await saveDraft(batch.id, rows, onDuplicate, withCols);
      setBatch((b) => (b ? { ...b, ...s, settings: b.settings ? { ...b.settings, onDuplicate, fileColumns: withCols } : b.settings, rows } : b));
      setCols(withCols);
      setDirty(false);
      if (!quiet) showToast(s.status === 'ready' ? 'Saved: ready to sync into Associates' : 'Saved as draft', 'success');
      return true;
    } catch (err) {
      showToast(errorText(err), 'error');
      return false;
    } finally {
      setSaving(false);
    }
  }

  /** reads the stored file again on the server (dry run) — the server names any missing collection field */
  async function readAgain() {
    if (!batch) return;
    setRereading(true);
    try {
      await changeColumns(batch.id, {});
      await load();
      showToast('The file was read and checked again', 'success');
    } catch (err) {
      showToast(errorText(err), 'error');
    } finally {
      setRereading(false);
    }
  }

  /** The admin's approved sync: saves first when needed (also saving the chosen mapping), then syncs. */
  async function submit(mapping: FileColumn[]) {
    if (!batch) return;
    setSubmitting(true);
    try {
      if ((dirty || unapproved) && !(await save(true, mapping))) return;
      const r = await submitImport(batch.id, mapping);
      setResult(r.result);
      setBatch((b) => (b ? { ...b, ...r.batch } : b));
      setConfirming(false);
      showToast(`Synced · ${r.result.added} ${r.result.added === 1 ? 'associate' : 'associates'} added`, 'success');
    } catch (err) {
      showToast(errorText(err), 'error');
      setConfirming(false);
      load();
    } finally {
      setSubmitting(false);
    }
  }

  /* ── render ── */
  if (loadError) {
    return (
      <Shell>
        <div className="rounded-3xl bg-rose-50 p-6 text-center ring-1 ring-rose-100" role="alert">
          <p className="font-semibold text-rose-900">This import couldn&apos;t be opened</p>
          <p className="mt-1 text-sm text-rose-700">{loadError}</p>
          <Link href="/associates/imports" className={`${btn.secondary} mt-4`}>Back to imports</Link>
        </div>
      </Shell>
    );
  }
  if (!batch) {
    return <Shell><div className="flex items-center justify-center gap-2 py-24 text-slate-500"><Loader2 className="h-5 w-5 animate-spin text-violet-500" /> Loading the import…</div></Shell>;
  }

  const editingRow = editing ? rows.find((r) => r.id === editing) : undefined;
  const editingCheck = editingRow ? checks.get(editingRow.id) : undefined;

  return (
    <Shell>
      {/* header */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <Link
            href={splitImportPath(batch.file_name).folder
              ? `/associates/imports?folder=${encodeURIComponent(splitImportPath(batch.file_name).folder)}`
              : '/associates/imports'}
            className="mb-2 inline-flex items-center gap-1 text-sm font-medium text-slate-500 hover:text-slate-800">
            <ArrowLeft className="h-4 w-4" /> {splitImportPath(batch.file_name).folder ? splitImportPath(batch.file_name).folder.split('/').pop() : 'Associates'}
          </Link>
          <div className="flex flex-wrap items-center gap-3">
            <FileSpreadsheet className="h-6 w-6 shrink-0 text-emerald-600" />
            <h1 className="min-w-0 truncate text-2xl font-extrabold tracking-tight text-slate-900" title={batch.file_name}>{splitImportPath(batch.file_name).name}</h1>
            <StatusBadge status={batch.status} />
            {dirty && <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-800">Unsaved changes</span>}
          </div>
          <p className="mt-1 text-sm text-slate-500">
            {splitImportPath(batch.file_name).folder && <>Folder {splitImportPath(batch.file_name).folder.replace(/\//g, ' › ')} · </>}
            Uploaded {when(batch.created)}{batch.uploaded_by ? ` by ${batch.uploaded_by}` : ''}
            {settings && <> · sheet “{settings.sheet}”</>}
            {batch.submitted_at && <> · submitted {when(batch.submitted_at)}{batch.submitted_by ? ` by ${batch.submitted_by}` : ''}</>}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {batch.file && (
            <>
              <button type="button" className={btn.secondary} onClick={() => setPreviewing(true)}>
                <Eye className="h-4 w-4" /> Preview
              </button>
              <button type="button" className={btn.secondary}
                onClick={async () => { try { await downloadOriginal(batch); } catch (err) { showToast(errorText(err), 'error'); } }}>
                <Download className="h-4 w-4" /> Download
              </button>
            </>
          )}
          {!readOnly && (
            <>
              <button type="button" onClick={() => setEditingCols(true)} className={btn.secondary}>
                <Columns3 className="h-4 w-4" /> Edit columns
              </button>
              <button type="button" onClick={() => setColumnsOpen(true)} className={btn.secondary} title="Choose the sheet and read the original file again">
                <RefreshCw className="h-4 w-4" /> Re-read file
              </button>
            </>
          )}
        </div>
      </div>

      {processing && (
        <div className="flex items-center gap-3 rounded-2xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-900">
          <Loader2 className="h-5 w-5 animate-spin" /> The file is still being read and checked. This page updates by itself.
        </div>
      )}

      {/* step guide: dry run → approve (save) → sync / merge */}
      {settings && batch.status !== 'submitted' && batch.status !== 'failed' && (
        <ol className="grid gap-2 rounded-3xl bg-white p-3 shadow-sm ring-1 ring-slate-100 text-sm sm:grid-cols-3">
          {[
            { n: 1, title: 'Dry run', text: 'Checked — nothing saved yet', done: true },
            { n: 2, title: unapproved ? 'Approve' : 'Approved', text: unapproved ? 'Review rows and columns, then Approve & save' : 'Saved as a draft — you can still change it', done: !unapproved },
            { n: 3, title: 'Sync or merge', text: canSubmit ? 'Sync into Associates, or merge with another file' : 'An admin syncs it into Associates; you can merge files', done: false },
          ].map((s) => (
            <li key={s.n} className={`flex items-start gap-2.5 rounded-xl px-3 py-2 ${s.done ? 'bg-emerald-50/70' : (s.n === 2 && unapproved) || (s.n === 3 && !unapproved) ? 'bg-violet-50' : ''}`}>
              <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${s.done ? 'bg-emerald-600 text-white' : 'bg-white text-violet-700 ring-1 ring-violet-200'}`}>
                {s.done ? <CheckCircle2 className="h-4 w-4" /> : s.n}
              </span>
              <span><span className="block font-semibold text-slate-900">{s.title}</span><span className="text-xs text-slate-500">{s.text}</span></span>
            </li>
          ))}
        </ol>
      )}
      {batch.status === 'failed' && batch.error && (
        <div className="flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900" role="alert">
          <XCircle className="mt-0.5 h-5 w-5 shrink-0" />
          <div className="flex-1">
            <p className="font-semibold">{settings ? 'The last submission did not finish' : 'The file could not be read'}</p>
            <p className="mt-0.5">{batch.error}</p>
          </div>
          {!settings && editable && (
            <button type="button" className={btn.secondary} onClick={async () => {
              try { await changeColumns(batch.id, {}); await load(); } catch (err) { showToast(errorText(err), 'error'); }
            }}><RefreshCw className="h-4 w-4" /> Read again</button>
          )}
        </div>
      )}

      {/* the file had no column titles → say how its columns were read, with a one-click way back */}
      {settings?.titleRow === false && batch.status !== 'submitted' && (
        <div className="flex flex-col gap-3 rounded-3xl bg-sky-50/80 px-5 py-4 text-sm text-sky-950 ring-1 ring-sky-200 sm:flex-row sm:items-center">
          <FileSpreadsheet className="h-5 w-5 shrink-0 text-sky-600" />
          <p className="flex-1">
            <strong>This file has no column titles</strong>, so its first row is read as a person and its columns in the
            template order: <span className="font-semibold">{['Name', ...cols.map((c) => c.label)].join(' · ')}</span>.
          </p>
          {editable && (
            <button type="button" className={btn.secondary} onClick={() => setColumnsOpen(true)}>
              <Columns3 className="h-4 w-4" /> Change
            </button>
          )}
        </div>
      )}

      {/* the checked rows are missing (e.g. a field absent from the collection) — never a blank page */}
      {!settings && !processing && batch.status !== 'failed' && (
        <div className="rounded-3xl bg-amber-50/70 p-6 ring-1 ring-amber-200" role="alert">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-6 w-6 shrink-0 text-amber-600" />
            <div className="min-w-0 flex-1">
              <p className="text-base font-bold text-amber-950">The checked rows of this file aren&apos;t available</p>
              <p className="mt-1 text-sm text-amber-900">
                The file was uploaded, but its dry-run result wasn&apos;t stored. This usually means the <code className="rounded bg-white/70 px-1">settings</code> or{' '}
                <code className="rounded bg-white/70 px-1">rows</code> JSON field is missing from the <code className="rounded bg-white/70 px-1">associate_imports</code> collection in PocketBase.
                Add it, then click <strong>Read again</strong>. Meanwhile you can preview or download the file.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                {batch.file && (
                  <>
                    <button type="button" className={btn.primary} onClick={() => setPreviewing(true)}><Eye className="h-4 w-4" /> Preview file</button>
                    <button type="button" className={btn.secondary}
                      onClick={async () => { try { await downloadOriginal(batch); } catch (err) { showToast(errorText(err), 'error'); } }}>
                      <Download className="h-4 w-4" /> Download
                    </button>
                  </>
                )}
                {editable && (
                  <button type="button" className={btn.secondary} disabled={rereading} onClick={readAgain}>
                    {rereading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Read again
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* submitted: the summary */}
      {batch.status === 'submitted' && result && (
        <div className="rounded-3xl bg-emerald-50/60 p-6 ring-1 ring-emerald-200">
          <div className="flex flex-wrap items-center gap-3">
            <CheckCircle2 className="h-8 w-8 text-emerald-600" />
            <div className="flex-1">
              <p className="text-lg font-bold text-emerald-950">Synced to Associates</p>
              <p className="text-sm text-emerald-800">
                {result.added} added · {result.updated} updated · {result.skipped} duplicates skipped
                {result.fieldsCreated ? ` · ${result.fieldsCreated} new ${result.fieldsCreated === 1 ? 'field' : 'fields'}` : ''}
              </p>
            </div>
            <Link href="/associates" className={btn.primary}>View Associates</Link>
          </div>
        </div>
      )}

      {settings && (
        <>
          {/* the dry run, in numbers — click one to see those rows */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            <Count label="Records" value={counts.total} tone="slate" active={filter === 'all'} onClick={() => { setFilter('all'); setPage(1); }} />
            <Count label="Valid" value={counts.valid} tone="emerald" active={filter === 'valid'} onClick={() => { setFilter('valid'); setPage(1); }} />
            <Count label="Invalid" value={counts.invalid} tone="rose" active={filter === 'invalid'} onClick={() => { setFilter('invalid'); setPage(1); }} />
            <Count label="Duplicates" value={counts.duplicates} tone="amber" active={filter === 'duplicate'} onClick={() => { setFilter('duplicate'); setPage(1); }} />
            <Count label="Removed" value={counts.removed} tone="sky" active={filter === 'removed'} onClick={() => { setFilter('removed'); setPage(1); }} />
          </div>

          {!readOnly && counts.duplicates > 0 && (
            <fieldset className="flex flex-col gap-2 rounded-3xl bg-white p-4 shadow-sm ring-1 ring-slate-100 sm:flex-row sm:items-center">
              <legend className="sr-only">People already in Associates</legend>
              <p className="flex-1 text-sm text-slate-700"><strong>Duplicates are never added twice.</strong> For people already in Associates:</p>
              {([['skip', 'Skip them'], ['update', 'Update them with this file’s values']] as const).map(([v, label]) => (
                <label key={v} className={`flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-sm font-medium ${onDuplicate === v ? 'border-violet-400 bg-violet-50 text-violet-900' : 'border-slate-200 text-slate-600'}`}>
                  <input type="radio" name="dup" checked={onDuplicate === v} onChange={() => { setOnDuplicate(v); setDirty(true); }} className="accent-violet-600" />
                  {label}
                </label>
              ))}
            </fieldset>
          )}

          {/* search + bulk */}
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input type="search" value={query} onChange={(e) => { setQuery(e.target.value); setPage(1); }} placeholder="Search rows…" aria-label="Search rows"
                className={`${inputCls} pl-10`} />
            </div>
            {!readOnly && filter === 'invalid' && counts.invalid > 0 && (
              <button type="button" onClick={() => bulkRemove('invalid')} className={btn.secondary}><Trash2 className="h-4 w-4" /> Remove all {counts.invalid} invalid</button>
            )}
            {!readOnly && filter === 'duplicate' && counts.duplicates > 0 && (
              <button type="button" onClick={() => bulkRemove('duplicate')} className={btn.secondary}><Trash2 className="h-4 w-4" /> Remove all {counts.duplicates} duplicates</button>
            )}
            {!readOnly && filter === 'removed' && counts.removed > 0 && (
              <button type="button" onClick={() => setRemoved(new Set(rows.filter((r) => r.removed).map((r) => r.id)), false)} className={btn.secondary}>
                <RotateCcw className="h-4 w-4" /> Put all back
              </button>
            )}
          </div>

          {/* the rows */}
          <div className="overflow-hidden rounded-3xl bg-white shadow-sm ring-1 ring-slate-100">
            <div className="max-h-[65vh] overflow-auto">
              <table className="w-full min-w-[720px] text-sm">
                <thead className="sticky top-0 z-10 bg-slate-50/95 text-left text-[11px] font-bold uppercase tracking-wider text-slate-400 backdrop-blur">
                  <tr>
                    <th className="px-3 py-3">Row</th>
                    <th className="px-3 py-3">Check</th>
                    <th className="px-3 py-3">Name</th>
                    {shownFields.map((f) => {
                      const t = colByKey.get(f.key)?.target;
                      return (
                        <th key={f.key} className="whitespace-nowrap px-3 py-3">
                          {f.label}
                          {t?.kind === 'new' && <span className="ml-1 rounded bg-emerald-50 px-1 text-[9px] text-emerald-700" title="Becomes a new field in Associates">NEW</span>}
                          {t?.kind === 'skip' && <span className="ml-1 rounded bg-slate-100 px-1 text-[9px] text-slate-500" title="Not synced into Associates">NOT SYNCED</span>}
                        </th>
                      );
                    })}
                    <th className="w-24 px-3 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {pageRows.map((r) => {
                    const c = checks.get(r.id);
                    const bad = new Set((c?.issues || []).filter((i) => i.level === 'error').map((i) => i.field));
                    return (
                      <tr key={r.id} className={`group align-top ${r.removed ? 'opacity-50' : ''} ${c?.status === 'invalid' ? 'bg-rose-50/30' : ''}`}>
                        <td className="px-3 py-2.5 text-xs tabular-nums text-slate-400">{r.row}</td>
                        <td className="px-3 py-2.5"><CheckChip check={c} /></td>
                        <td className="min-w-[12rem] px-3 py-2.5">
                          <button type="button" onClick={() => setEditing(r.id)} className={`text-left font-semibold ${bad.has('name') ? 'text-rose-700' : 'text-slate-900'} hover:text-violet-700`}>
                            {r.name || <span className="italic text-rose-600">No name</span>}
                          </button>
                          {r.edited && <span className="ml-1.5 text-[10px] font-semibold uppercase text-violet-600">edited</span>}
                          {(c?.issues || []).slice(0, 2).map((i) => (
                            <p key={i.message} className={`mt-0.5 text-xs ${i.level === 'error' ? 'text-rose-700' : 'text-amber-700'}`}>{i.message}</p>
                          ))}
                          {(c?.issues.length || 0) > 2 && <p className="text-xs text-slate-400">+{c!.issues.length - 2} more</p>}
                        </td>
                        {shownFields.map((f) => (
                          <td key={f.key} className={`max-w-[14rem] truncate px-3 py-2.5 ${bad.has(f.key) ? 'font-medium text-rose-700' : 'text-slate-600'}`} title={String(r.data?.[f.key] ?? '')}>
                            {displayValue(f, r.data?.[f.key]) || <span className="text-slate-300">—</span>}
                          </td>
                        ))}
                        <td className="px-3 py-2.5">
                          <div className="flex justify-end gap-1">
                            <button type="button" onClick={() => setEditing(r.id)} className={btn.icon} aria-label={`${readOnly ? 'View' : 'Edit'} row ${r.row}`}><Pencil className="h-4 w-4" /></button>
                            {!readOnly && (r.removed ? (
                              <button type="button" onClick={() => setRemoved(new Set([r.id]), false)} className={btn.icon} aria-label={`Put row ${r.row} back`}><RotateCcw className="h-4 w-4" /></button>
                            ) : (
                              <button type="button" onClick={() => setRemoved(new Set([r.id]), true)} className={`${btn.icon} hover:text-rose-600`} aria-label={`Remove row ${r.row}`}><Trash2 className="h-4 w-4" /></button>
                            ))}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {!pageRows.length && (
                    <tr><td colSpan={shownFields.length + 4} className="px-4 py-12 text-center text-slate-400">No rows here.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
            {pages > 1 && (
              <div className="flex items-center justify-between gap-3 border-t border-slate-200 bg-slate-50/60 px-4 py-3 text-sm text-slate-500">
                <span>{(current - 1) * PER_PAGE + 1}–{Math.min(current * PER_PAGE, filtered.length)} of {filtered.length}</span>
                <div className="flex gap-2">
                  <button type="button" onClick={() => setPage(current - 1)} disabled={current === 1} className={btn.secondary} aria-label="Previous page"><ChevronLeft className="h-4 w-4" /></button>
                  <button type="button" onClick={() => setPage(current + 1)} disabled={current === pages} className={btn.secondary} aria-label="Next page"><ChevronRight className="h-4 w-4" /></button>
                </div>
              </div>
            )}
          </div>

          {/* save / submit — kept in view */}
          {!readOnly && (
            <div className="sticky bottom-3 z-20 flex flex-col gap-2 rounded-3xl bg-white/95 px-5 py-3 shadow-lg shadow-slate-900/10 ring-1 ring-slate-200 backdrop-blur sm:flex-row sm:items-center">
              <p className="flex-1 text-sm text-slate-600">
                {counts.invalid > 0
                  ? <span className="font-medium text-rose-700">{counts.invalid} {counts.invalid === 1 ? 'row needs' : 'rows need'} correcting or removing before syncing.</span>
                  : <>{plan.creates.length} will be added{plan.updates.length ? `, ${plan.updates.length} updated` : ''}{plan.skipped ? `, ${plan.skipped} duplicates skipped` : ''}.</>}
                {unapproved && <span className="block text-xs text-violet-700">Dry run — nothing is saved until you approve it.</span>}
              </p>
              <button type="button" onClick={() => setMerging(true)} disabled={saving || submitting} className={btn.secondary}>
                <GitMerge className="h-4 w-4" /> Merge…
              </button>
              <button type="button" onClick={() => save()} disabled={saving || submitting || (!dirty && !unapproved)}
                className={unapproved ? btn.primary : btn.secondary}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} {unapproved ? 'Approve & save' : 'Save changes'}
              </button>
              {canSubmit ? (
                <button type="button" onClick={() => setConfirming(true)}
                  disabled={saving || submitting || counts.invalid > 0 || (!plan.creates.length && !plan.updates.length)}
                  title={counts.invalid > 0 ? 'Correct or remove the invalid rows first' : undefined}
                  className={btn.violet}>
                  <Send className="h-4 w-4" /> Sync to Associates…
                </button>
              ) : (
                <span className="rounded-xl bg-violet-50 px-3 py-2 text-sm font-medium text-violet-800">
                  An admin syncs this after you save it.
                </span>
              )}
            </div>
          )}
        </>
      )}

      {editingRow && (
        <StagedRowPanel
          key={editingRow.id}
          row={editingRow}
          check={editingCheck}
          fields={shownFields}
          existing={editingCheck?.duplicateOf?.kind === 'existing' ? byId.get(editingCheck.duplicateOf.id) : undefined}
          readOnly={readOnly}
          onClose={() => setEditing(null)}
          onApply={(next) => { change(rows.map((r) => (r.id === next.id ? next : r))); setEditing(null); }}
          onRemove={() => { setRemoved(new Set([editingRow.id]), true); setEditing(null); }}
          onRestore={() => { setRemoved(new Set([editingRow.id]), false); setEditing(null); }}
        />
      )}

      {confirming && (
        <SyncDialog cols={cols} rows={rows} fields={fields} people={others} onDuplicate={onDuplicate}
          dirty={dirty || unapproved} busy={submitting}
          onCancel={() => setConfirming(false)} onConfirm={submit} />
      )}
      {editingCols && (
        <ColumnEditor open cols={cols} rows={rows} fields={fields} onClose={() => setEditingCols(false)}
          onApply={(next) => {
            setCols(next);
            setRows((rs) => pruneRows(rs, next));
            setDirty(true);
            setEditingCols(false);
            showToast('Columns changed — click Save to keep them', 'success');
          }} />
      )}
      {merging && (
        <MergeDialog into={batch} onClose={() => setMerging(false)}
          beforeMerge={async () => (dirty ? save(true) : true)}
          onMerged={() => { setMerging(false); load(); }} />
      )}

      {previewing && <FilePreview batch={batch} onClose={() => setPreviewing(false)} />}
      {columnsOpen && batch && settings && (
        <ColumnsDialog batch={batch} fields={fields} editedRows={rows.filter((r) => r.edited).length}
          onClose={() => setColumnsOpen(false)} onApplied={() => { setColumnsOpen(false); load(); }} />
      )}
    </Shell>
  );
}

function Shell({ children }: { children: ReactNode }) {
  return <AssociatesFrame>{children}</AssociatesFrame>;
}

function CheckChip({ check }: { check?: RowCheck }) {
  const s = check?.status;
  const map = {
    valid: ['bg-emerald-50 text-emerald-700', 'Valid'],
    invalid: ['bg-rose-50 text-rose-700', 'Invalid'],
    duplicate: ['bg-amber-50 text-amber-800', 'Duplicate'],
    removed: ['bg-slate-100 text-slate-500', 'Removed'],
  } as const;
  const [cls, label] = s ? map[s] : map.valid;
  return <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold ${cls}`}>{label}</span>;
}

/* ── change the sheet / what each column goes into (rebuilds the rows from the original file) ── */
function ColumnsDialog({ batch, fields, editedRows, onClose, onApplied }: {
  batch: ImportBatch; fields: AssociateField[]; editedRows: number; onClose: () => void; onApplied: () => void;
}) {
  const settings = batch.settings!;
  const [sheet, setSheet] = useState(settings.sheet);
  const [columns, setColumns] = useState<ColumnMap[]>(settings.columns);
  const [sheets, setSheets] = useState<SheetData[] | null>(null);
  /* does the first row hold column titles? (no = it is a person; columns follow the template's order) */
  const [titleRow, setTitleRow] = useState(settings.titleRow !== false);
  const titlesChanged = titleRow !== (settings.titleRow !== false);
  const [busy, setBusy] = useState(false);
  const loading = useRef(false);
  useEscape(onClose, !busy);

  /* the original file, read here only for the sample values */
  useEffect(() => {
    if (loading.current) return;
    loading.current = true;
    (async () => {
      try {
        const url = await originalFileUrl(batch);
        const buf = await (await fetch(url)).arrayBuffer();
        setSheets(parseWorkbook(await import('xlsx'), buf));
      } catch {
        setSheets([]);
      }
    })();
  }, [batch]);

  const raw = sheets?.find((s) => s.name === sheet);
  const body: Cell[][] = raw ? withTitleRow(raw, fields, titleRow).body : [];
  // same sheet, same title row → the user's column choices; otherwise the columns are guessed again
  const keepColumns = sheet === settings.sheet && !titlesChanged;
  const problem = keepColumns ? mappingError(columns) : '';

  async function apply() {
    const lost = [
      editedRows ? `your corrections to ${editedRows} ${editedRows === 1 ? 'row' : 'rows'}` : '',
      batch.settings?.fileColumns ? 'your column changes' : '',
      batch.settings?.merged?.length ? `the rows merged in from ${batch.settings.merged.length === 1 ? 'another file' : `${batch.settings.merged.length} files`}` : '',
    ].filter(Boolean);
    if (lost.length && !window.confirm(`Reading the file again rebuilds its rows and columns from the original Excel file. ${lost.join(', ')} will be lost. Continue?`)) return;
    setBusy(true);
    try {
      await changeColumns(batch.id, keepColumns ? { sheet, columns, titleRow } : { sheet, titleRow });
      showToast('Columns updated and every row checked again', 'success');
      onApplied();
    } catch (err) {
      showToast(errorText(err), 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[85] flex items-end justify-center bg-slate-900/40 backdrop-blur-[2px] sm:items-center sm:p-6" role="dialog" aria-modal="true" aria-labelledby="cols-title">
      <div className="flex max-h-[100dvh] w-full max-w-4xl flex-col overflow-hidden bg-white shadow-2xl sm:max-h-[92vh] sm:rounded-3xl">
        <header className="flex items-start gap-3 border-b border-slate-100 px-5 py-5 sm:px-7">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-50 text-violet-600"><Columns3 className="h-5 w-5" /></span>
          <div className="min-w-0 flex-1">
            <h2 id="cols-title" className="text-lg font-bold text-slate-900">Columns</h2>
            <p className="text-sm text-slate-500">Choose where each column of the file goes. The rows are rebuilt from the original file.</p>
          </div>
          <button type="button" onClick={onClose} disabled={busy} className={btn.icon} aria-label="Close"><X className="h-5 w-5" /></button>
        </header>
        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-5 sm:px-7">
          {settings.sheets.length > 1 && (
            <label className="flex items-center gap-2 text-sm">
              <span className="font-semibold text-slate-700">Sheet</span>
              <select value={sheet} onChange={(e) => setSheet(e.target.value)} className={`${inputCls} w-auto py-1.5`}>
                {settings.sheets.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </label>
          )}
          <fieldset className="rounded-2xl bg-slate-50 p-3.5">
            <legend className="sr-only">First row of the sheet</legend>
            <p className="mb-2 text-sm font-semibold text-slate-700">The first row of the sheet is…</p>
            <div className="flex flex-col gap-2 sm:flex-row">
              {([[true, 'Column titles', 'e.g. Name, Department, Cadre…'], [false, 'A person (no titles)', 'Columns are read in the template order']] as const).map(([v, label, hint]) => (
                <label key={String(v)} className={`flex flex-1 cursor-pointer items-start gap-2.5 rounded-xl border px-3 py-2.5 text-sm ${titleRow === v ? 'border-violet-300 bg-white ring-2 ring-violet-100' : 'border-slate-200 bg-white/60'}`}>
                  <input type="radio" name="title-row" checked={titleRow === v} onChange={() => setTitleRow(v)} className="mt-0.5 accent-violet-600" />
                  <span><span className="block font-semibold text-slate-800">{label}</span><span className="text-xs text-slate-500">{hint}</span></span>
                </label>
              ))}
            </div>
            {!titleRow && (
              <p className="mt-2 text-xs text-slate-500">Order: {positionalTitles(Math.max(raw?.headers.length || 0, 5), fields).join(' · ')}</p>
            )}
          </fieldset>
          {keepColumns ? (
            <ColumnMapper columns={columns} fields={fields} onChange={setColumns}
              samples={(i) => (sheets === null ? ['loading…'] : samplesOf(body, i))} />
          ) : (
            <p className="rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
              {titlesChanged ? 'The columns are matched again for this choice.' : <>The columns of “{sheet}” are matched automatically.</>} You can adjust them after applying.
            </p>
          )}
          {problem && <p className="flex items-center gap-2 rounded-xl bg-amber-50 px-3 py-2.5 text-sm font-medium text-amber-800" role="alert"><AlertTriangle className="h-4 w-4" /> {problem}</p>}
        </div>
        <footer className="flex items-center gap-2 border-t border-slate-100 bg-slate-50/60 px-5 py-3.5 sm:px-7">
          {editedRows > 0 && <p className="text-xs text-amber-700">Your corrections to {editedRows} {editedRows === 1 ? 'row' : 'rows'} will be replaced.</p>}
          <button type="button" onClick={onClose} disabled={busy} className={`${btn.secondary} ml-auto`}>Cancel</button>
          <button type="button" onClick={apply} disabled={busy || !!problem} className={btn.primary}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Apply and check again
          </button>
        </footer>
      </div>
    </div>
  );
}
