'use client';

/* The Imports tab as a folder explorer.

   "Associates" is the top folder; inside it any number of folders and subfolders
   ("Associates › Detail associates › 2026", "Associates › XYZ associates", …), each holding uploaded Excel files.
   A folder is simply the path in front of a file's name (associate_imports.file_name = "Detail associates/2026/list.xlsx"),
   so moving or renaming only rewrites those paths — no extra collection. A brand-new folder with nothing in it yet
   is remembered in this browser until the first file is uploaded into it.

   Every file: Review (its dry run) · Sync into Associates (admins, once approved) · Merge another file into it ·
   Preview · Download the Excel file · Move · Delete.
   Every folder: Open · Upload here · Rename · Delete (with everything inside). */

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  ChevronRight, Download, Eye, FileSpreadsheet, Folder, FolderInput, FolderOpen, FolderPlus, GitMerge, Home, Loader2,
  MoreVertical, Pencil, Search, Send, Trash2, Upload, X,
} from 'lucide-react';
import { showToast } from '@/components/Toaster';
import type { AssociateField } from '@/lib/associates';
import {
  childFolders, folderNameProblem, importFolders, inImportFolder, IMPORT_STATUSES, movePath, splitImportPath,
  STATUS_LABEL, type ImportStatus,
} from '@/lib/associateImport';
import {
  deleteImport, downloadOriginal, moveImport, submitImport, type BatchSummary,
} from '@/lib/associateImportsApi';
import { errorText, runPool } from '@/lib/associatesApi';
import { btn, inputCls, useEscape } from './ui';
import { StatusBadge, when } from './importUi';
import UploadImportsDialog from './UploadImportsDialog';
import FilePreview from './FilePreview';
import MergeDialog from './MergeDialog';

const ROOT = 'Associates';
const MAX_PATH = 255;

/* ── empty folders, remembered in this browser ─────────────────────────────────────────────────── */

const LOCAL_KEY = 'associates.import-folders';
const LOCAL_EVENT = 'associates-import-folders';

function readLocal(): string {
  try { return localStorage.getItem(LOCAL_KEY) || '[]'; } catch { return '[]'; }
}
function writeLocal(folders: string[]) {
  try { localStorage.setItem(LOCAL_KEY, JSON.stringify([...new Set(folders)].sort())); } catch { /* private mode */ }
  window.dispatchEvent(new Event(LOCAL_EVENT));
}
function subscribeLocal(cb: () => void) {
  window.addEventListener(LOCAL_EVENT, cb);
  window.addEventListener('storage', cb);
  return () => { window.removeEventListener(LOCAL_EVENT, cb); window.removeEventListener('storage', cb); };
}
function parseLocal(raw: string): string[] {
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && !!x) : [];
  } catch { return []; }
}

const label = (folder: string) => (folder ? folder.split('/').pop()! : ROOT);
const pretty = (folder: string) => [ROOT, ...(folder ? folder.split('/') : [])].join(' › ');
const join = (folder: string, name: string) => (folder ? `${folder}/${name}` : name);
const parentOf = (folder: string) => folder.split('/').slice(0, -1).join('/');

type Confirm = {
  title: string;
  body: ReactNode;
  action: string;
  danger?: boolean;
  run: (progress: (text: string) => void) => Promise<void>;
};

export default function ImportHistory({ batches, loading, editable, canSubmit, fields, onChanged }: {
  batches: BatchSummary[];
  loading: boolean;
  /** editors and admins: upload, organise, delete */
  editable: boolean;
  /** admins: submit to the Associates list */
  canSubmit: boolean;
  fields: AssociateField[];
  onChanged: () => void;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const folder = (params.get('folder') || '').replace(/^\/+|\/+$/g, '');
  const go = useCallback((f: string) => {
    router.push(f ? `/associates/imports?folder=${encodeURIComponent(f)}` : '/associates/imports', { scroll: false });
  }, [router]);

  const localRaw = useSyncExternalStore(subscribeLocal, readLocal, () => '[]');
  const local = useMemo(() => parseLocal(localRaw), [localRaw]);

  // every folder: the ones files sit in, their parents, and empty ones created here
  const folders = useMemo(
    () => importFolders([...batches.map((b) => b.file_name), ...local.map((f) => `${f}/_`)]),
    [batches, local],
  );

  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<'all' | ImportStatus>('all');
  const [uploadTo, setUploadTo] = useState<string | null>(null);
  const [naming, setNaming] = useState<{ mode: 'new' | 'rename'; folder: string } | null>(null);
  const [moving, setMoving] = useState<BatchSummary | null>(null);
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const [preview, setPreview] = useState<BatchSummary | null>(null);
  const [mergeInto, setMergeInto] = useState<BatchSummary | null>(null);

  /* per-folder totals, including everything in its subfolders */
  const stats = useMemo(() => {
    const m = new Map<string, { files: number; open: number; ready: number; submitted: number }>();
    for (const b of batches) {
      const parts = splitImportPath(b.file_name).folder.split('/').filter(Boolean);
      for (let i = 0; i <= parts.length; i++) {
        const key = parts.slice(0, i).join('/');
        const s = m.get(key) || { files: 0, open: 0, ready: 0, submitted: 0 };
        s.files++;
        if (b.status === 'submitted') s.submitted++;
        else s.open++;
        if (b.status === 'ready') s.ready++;
        m.set(key, s);
      }
    }
    return m;
  }, [batches]);

  const inside = useMemo(() => batches.filter((b) => inImportFolder(b.file_name, folder)), [batches, folder]);
  const searching = !!query.trim() || status !== 'all';
  const files = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!searching) return inside.filter((b) => splitImportPath(b.file_name).folder === folder);
    return inside.filter((b) => (status === 'all' || b.status === status) && (!q || b.file_name.toLowerCase().includes(q)));
  }, [inside, folder, query, status, searching]);
  const subfolders = searching ? [] : childFolders(folder, folders);
  const statusCounts = useMemo(() => {
    const c = new Map<string, number>();
    for (const b of inside) c.set(b.status, (c.get(b.status) || 0) + 1);
    return c;
  }, [inside]);
  const readyHere = inside.filter((b) => b.status === 'ready');

  /* ── actions ── */

  async function download(b: BatchSummary) {
    try {
      await downloadOriginal(b);
    } catch (err) {
      showToast(errorText(err), 'error');
    }
  }

  function askSubmit(list: BatchSummary[]) {
    const people = list.reduce((n, b) => n + b.valid, 0);
    setConfirm({
      title: list.length === 1 ? `Sync “${splitImportPath(list[0].file_name).name}” into Associates?` : `Sync ${list.length} approved files into Associates?`,
      body: (
        <>
          <p>
            Up to <strong>{people}</strong> {people === 1 ? 'person is' : 'people are'} added to the Associates list.
            Duplicates are never inserted — each file skips or updates them as chosen in its review.
          </p>
          <p className="mt-2">
            Each file’s columns go where it was set: columns named like an Associates field go into that field, the
            others become new fields. To choose this per column, open the file and use <strong>Sync to Associates</strong> there.
          </p>
          <p className="mt-2">Every file is checked again first; one with problems is left as it is.</p>
        </>
      ),
      action: list.length === 1 ? 'Approve & sync' : `Approve & sync ${list.length} files`,
      run: async (progress) => {
        let added = 0, updated = 0;
        const failed: string[] = [];
        for (let i = 0; i < list.length; i++) {
          progress(list.length > 1 ? `Syncing ${i + 1} of ${list.length}…` : 'Syncing…');
          try {
            const r = await submitImport(list[i].id);
            added += r.result.added;
            updated += r.result.updated;
          } catch (err) {
            failed.push(`${splitImportPath(list[i].file_name).name}: ${errorText(err)}`);
          }
        }
        onChanged();
        if (failed.length) showToast(`${list.length - failed.length} synced, ${failed.length} not — ${failed[0]}`, 'error');
        else showToast(`Synced · ${added} added${updated ? `, ${updated} updated` : ''}`, 'success');
      },
    });
  }

  function askDeleteFile(b: BatchSummary) {
    const name = splitImportPath(b.file_name).name;
    setConfirm({
      title: `Delete “${name}”?`,
      body: b.status === 'submitted'
        ? <p>It is removed from the imports. The associates it added stay in the list.</p>
        : <p>The draft and its uploaded file are deleted. Nothing in the Associates list changes.</p>,
      action: 'Delete',
      danger: true,
      run: async () => {
        await deleteImport(b.id);
        onChanged();
        showToast(`“${name}” deleted`, 'success');
      },
    });
  }

  function askDeleteFolder(f: string) {
    const list = batches.filter((b) => inImportFolder(b.file_name, f));
    const submitted = list.filter((b) => b.status === 'submitted').length;
    setConfirm({
      title: `Delete the folder “${label(f)}”?`,
      body: list.length ? (
        <>
          <p>The folder, its subfolders and the <strong>{list.length}</strong> {list.length === 1 ? 'file' : 'files'} in them are deleted.</p>
          {submitted > 0 && <p className="mt-2">The associates already submitted from {submitted === 1 ? 'one file' : `${submitted} files`} stay in the list.</p>}
        </>
      ) : <p>The folder is empty.</p>,
      action: 'Delete folder',
      danger: true,
      run: async (progress) => {
        const failed = await runPool(list, (b) => deleteImport(b.id), (d, t) => progress(`Deleting ${d} of ${t}…`));
        writeLocal(local.filter((x) => !inImportFolder(`${x}/_`, f)));
        onChanged();
        if (failed.length) showToast(`${failed.length} ${failed.length === 1 ? 'file' : 'files'} could not be deleted — ${failed[0].error}`, 'error');
        else showToast(`Folder “${label(f)}” deleted`, 'success');
        if (inImportFolder(`${folder}/_`, f)) go(parentOf(f));
      },
    });
  }

  async function saveFolderName(name: string) {
    if (!naming) return;
    const n = name.trim();
    if (naming.mode === 'new') {
      writeLocal([...local, join(naming.folder, n)]);
      setNaming(null);
      go(join(naming.folder, n));
      return;
    }
    const from = naming.folder;
    const to = join(parentOf(from), n);
    const list = batches.filter((b) => inImportFolder(b.file_name, from));
    if (list.some((b) => movePath(b.file_name, from, to).length > MAX_PATH)) {
      throw new Error('That name makes some file paths too long. Choose a shorter name.');
    }
    const failed = await runPool(list, (b) => moveImport(b.id, movePath(b.file_name, from, to)));
    writeLocal(local.map((x) => (inImportFolder(`${x}/_`, from) ? movePath(x, from, to) : x)));
    setNaming(null);
    onChanged();
    if (failed.length) showToast(`${failed.length} ${failed.length === 1 ? 'file' : 'files'} could not be moved — ${failed[0].error}`, 'error');
    else showToast(`Renamed to “${n}”`, 'success');
    if (inImportFolder(`${folder}/_`, from)) go(movePath(folder, from, to));
  }

  async function moveFile(b: BatchSummary, dest: string) {
    const target = join(dest, splitImportPath(b.file_name).name);
    if (target.length > MAX_PATH) throw new Error('That folder path is too long for this file.');
    await moveImport(b.id, target);
    setMoving(null);
    onChanged();
    showToast(`Moved to ${pretty(dest)}`, 'success');
  }

  /* ── render ── */

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 rounded-3xl bg-white py-16 shadow-sm ring-1 ring-slate-100 text-sm text-slate-500">
        <Loader2 className="h-5 w-5 animate-spin text-violet-500" /> Loading imports…
      </div>
    );
  }

  const fileMenu = (b: BatchSummary): MenuItem[] => [
    { label: b.status === 'submitted' ? 'View' : 'Review dry run', icon: Eye, href: `/associates/imports/${b.id}` },
    ...(canSubmit && b.status === 'ready' ? [{ label: 'Sync to Associates', icon: Send, onClick: () => askSubmit([b]) }] : []),
    { label: 'Preview file', icon: FileSpreadsheet, onClick: () => setPreview(b), disabled: !b.file },
    { label: 'Download Excel', icon: Download, onClick: () => download(b), disabled: !b.file },
    ...(editable ? [
      ...(b.status !== 'submitted' && b.status !== 'validating' && b.status !== 'failed'
        ? [{ label: 'Merge a file into this…', icon: GitMerge, onClick: () => setMergeInto(b) }] : []),
      { label: 'Move to…', icon: FolderInput, onClick: () => setMoving(b) },
      { label: 'Delete', icon: Trash2, onClick: () => askDeleteFile(b), danger: true },
    ] : []),
  ];

  const folderMenu = (f: string): MenuItem[] => [
    { label: 'Open', icon: FolderOpen, onClick: () => go(f) },
    ...(editable ? [
      { label: 'Upload here', icon: Upload, onClick: () => setUploadTo(f) },
      { label: 'New subfolder', icon: FolderPlus, onClick: () => setNaming({ mode: 'new', folder: f }) },
      { label: 'Rename', icon: Pencil, onClick: () => setNaming({ mode: 'rename', folder: f }) },
      { label: 'Delete', icon: Trash2, onClick: () => askDeleteFolder(f), danger: true },
    ] : []),
  ];

  const empty = !subfolders.length && !files.length;

  return (
    <div className="space-y-4">
      {/* where we are + what can be done here */}
      <div className="flex flex-col gap-3 rounded-3xl bg-white p-3 shadow-sm ring-1 ring-slate-100 sm:p-4 lg:flex-row lg:items-center">
        <nav aria-label="Folder" className="flex min-w-0 flex-1 flex-wrap items-center gap-1 px-1 text-sm">
          <button type="button" onClick={() => go('')}
            className={`inline-flex items-center gap-1.5 rounded-lg px-2 py-1 ${folder ? 'text-slate-500 hover:bg-slate-100 hover:text-slate-900' : 'font-bold text-slate-900'}`}>
            <Home className="h-4 w-4" /> {ROOT}
          </button>
          {folder.split('/').filter(Boolean).map((part, i, all) => {
            const path = all.slice(0, i + 1).join('/');
            const last = i === all.length - 1;
            return (
              <span key={path} className="flex min-w-0 items-center gap-1">
                <ChevronRight className="h-4 w-4 shrink-0 text-slate-300" />
                <button type="button" onClick={() => go(path)} aria-current={last ? 'page' : undefined}
                  className={`truncate rounded-lg px-2 py-1 ${last ? 'font-bold text-slate-900' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900'}`}>
                  {part}
                </button>
              </span>
            );
          })}
        </nav>
        <div className="flex flex-wrap gap-2">
          {canSubmit && readyHere.length > 0 && (
            <button type="button" onClick={() => askSubmit(readyHere)} className={btn.secondary}>
              <Send className="h-4 w-4" /> Sync approved ({readyHere.length})
            </button>
          )}
          {editable && (
            <>
              <button type="button" onClick={() => setNaming({ mode: 'new', folder })} className={btn.secondary}>
                <FolderPlus className="h-4 w-4" /> New folder
              </button>
              <button type="button" onClick={() => setUploadTo(folder)} className={btn.violet}>
                <Upload className="h-4 w-4" /> Upload here
              </button>
            </>
          )}
        </div>
      </div>

      {/* search + status */}
      {inside.length > 0 && (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <label className="relative block sm:w-72">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <span className="sr-only">Search files</span>
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={`Search in ${label(folder)}`}
              className="w-full rounded-full border border-slate-200 bg-slate-50/80 py-2.5 pl-9 pr-4 text-sm text-slate-900 placeholder-slate-400 transition hover:border-slate-300 hover:bg-white focus:border-violet-400 focus:bg-white focus:outline-none focus:ring-4 focus:ring-violet-500/10" />
          </label>
          <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Filter by status">
            {(['all', ...IMPORT_STATUSES] as const).filter((s) => s === 'all' || statusCounts.get(s)).map((s) => (
              <button key={s} type="button" role="tab" aria-selected={status === s} onClick={() => setStatus(s)}
                className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${status === s ? 'bg-slate-900 text-white' : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50'}`}>
                {s === 'all' ? 'All' : STATUS_LABEL[s]} <span className="opacity-60">{s === 'all' ? inside.length : statusCounts.get(s)}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* subfolders */}
      {subfolders.length > 0 && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {subfolders.map((f) => {
            const s = stats.get(f);
            return (
              <div key={f} className="group relative flex items-center gap-3 rounded-3xl bg-white p-4 shadow-sm ring-1 ring-slate-100 transition hover:-translate-y-0.5 hover:shadow-md hover:ring-violet-200">
                <button type="button" onClick={() => go(f)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-500">
                    <Folder className="h-5 w-5 fill-amber-200" />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate font-semibold text-slate-900" title={label(f)}>{label(f)}</span>
                    <span className="block truncate text-xs text-slate-500">
                      {s ? `${s.files} ${s.files === 1 ? 'file' : 'files'}${s.open ? ` · ${s.open} to finish` : ''}${s.ready ? ` · ${s.ready} ready` : ''}` : 'Empty'}
                    </span>
                  </span>
                </button>
                <ActionMenu label={`Actions for folder ${label(f)}`} items={folderMenu(f)} />
              </div>
            );
          })}
        </div>
      )}

      {/* files */}
      {files.length > 0 && (
        <div className="overflow-hidden rounded-3xl bg-white shadow-sm ring-1 ring-slate-100">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead className="bg-slate-50/95 text-left text-[11px] font-bold uppercase tracking-wider text-slate-400">
                <tr>
                  <th className="px-4 py-3">File</th>
                  <th className="px-4 py-3">Uploaded</th>
                  <th className="px-4 py-3 text-right">Records</th>
                  <th className="px-4 py-3 text-right">Valid</th>
                  <th className="px-4 py-3 text-right">Invalid</th>
                  <th className="px-4 py-3 text-right">Duplicates</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {files.map((b) => {
                  const { folder: where, name } = splitImportPath(b.file_name);
                  return (
                    <tr key={b.id} className="hover:bg-violet-50/30">
                      <td className="max-w-[20rem] px-4 py-3">
                        {searching && where !== folder && (
                          <button type="button" onClick={() => go(where)} className="mb-0.5 flex max-w-full items-center gap-1 text-[11px] text-slate-400 hover:text-violet-700">
                            <Folder className="h-3 w-3 shrink-0" /> <span className="truncate">{pretty(where)}</span>
                          </button>
                        )}
                        <Link href={`/associates/imports/${b.id}`} className="flex items-center gap-2 font-semibold text-slate-900 hover:text-violet-700">
                          <FileSpreadsheet className="h-4 w-4 shrink-0 text-emerald-600" />
                          <span className="truncate" title={b.file_name}>{name}</span>
                        </Link>
                        {b.status === 'failed' && b.error && <p className="mt-0.5 line-clamp-2 text-xs text-rose-600">{b.error}</p>}
                        {b.status === 'submitted' && b.result && (
                          <p className="mt-0.5 text-xs text-emerald-700">
                            {b.result.added} added{b.result.updated ? ` · ${b.result.updated} updated` : ''}{b.result.skipped ? ` · ${b.result.skipped} skipped` : ''}
                          </p>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                        {when(b.created)}
                        {b.uploaded_by && <span className="block text-xs text-slate-400">{b.uploaded_by}</span>}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-slate-900">{b.total}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-emerald-700">{b.valid}</td>
                      <td className={`px-4 py-3 text-right tabular-nums ${b.invalid ? 'font-semibold text-rose-700' : 'text-slate-400'}`}>{b.invalid}</td>
                      <td className={`px-4 py-3 text-right tabular-nums ${b.duplicates ? 'text-amber-700' : 'text-slate-400'}`}>{b.duplicates}</td>
                      <td className="px-4 py-3"><StatusBadge status={b.status} /></td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          {canSubmit && b.status === 'ready' && (
                            <button type="button" onClick={() => askSubmit([b])} className="rounded-lg bg-violet-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-violet-700">
                              Sync
                            </button>
                          )}
                          <ActionMenu label={`Actions for ${name}`} items={fileMenu(b)} />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {empty && (
        <div className="rounded-3xl bg-white shadow-sm ring-1 ring-slate-100 px-6 py-12 text-center">
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-50 text-amber-500">
            {searching ? <Search className="h-6 w-6" /> : <FolderOpen className="h-6 w-6" />}
          </span>
          <h2 className="mt-4 text-lg font-bold text-slate-900">
            {searching ? 'No files match' : folder ? `“${label(folder)}” is empty` : 'No imports yet'}
          </h2>
          <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">
            {searching
              ? 'Try another name or status.'
              : 'Create folders such as “Detail associates” or “XYZ associates”, then upload Excel files or whole folders into them. Each file is checked (dry run) and kept as a draft until an admin approves and syncs it.'}
          </p>
          {editable && !searching && (
            <div className="mt-5 flex flex-wrap justify-center gap-2">
              <button type="button" onClick={() => setNaming({ mode: 'new', folder })} className={btn.secondary}>
                <FolderPlus className="h-4 w-4" /> New folder
              </button>
              <button type="button" onClick={() => setUploadTo(folder)} className={btn.violet}>
                <Upload className="h-4 w-4" /> Upload here
              </button>
            </div>
          )}
        </div>
      )}

      {!canSubmit && editable && readyHere.length > 0 && (
        <p className="text-sm text-slate-500">{readyHere.length} ready {readyHere.length === 1 ? 'file is' : 'files are'} waiting for an admin to sync.</p>
      )}

      {/* dialogs */}
      {editable && (
        <UploadImportsDialog open={uploadTo !== null} folder={uploadTo || ''} onClose={() => setUploadTo(null)} fields={fields} onUploaded={onChanged} />
      )}
      {naming && (
        <FolderNameDialog
          key={`${naming.mode}:${naming.folder}`}
          title={naming.mode === 'new' ? `New folder in ${label(naming.folder)}` : `Rename “${label(naming.folder)}”`}
          initial={naming.mode === 'rename' ? label(naming.folder) : ''}
          siblings={childFolders(naming.mode === 'new' ? naming.folder : parentOf(naming.folder), folders)
            .map(label).filter((s) => naming.mode === 'new' || s !== label(naming.folder))}
          action={naming.mode === 'new' ? 'Create' : 'Rename'}
          onCancel={() => setNaming(null)}
          onSave={saveFolderName}
        />
      )}
      {moving && (
        <MoveDialog file={moving} folders={folders} onCancel={() => setMoving(null)} onMove={(dest) => moveFile(moving, dest)} />
      )}
      {confirm && <ConfirmDialog {...confirm} onClose={() => setConfirm(null)} />}
      {preview && <FilePreview batch={preview} onClose={() => setPreview(null)} />}
      {mergeInto && (
        <MergeDialog into={mergeInto} files={batches} onClose={() => setMergeInto(null)}
          onMerged={() => { setMergeInto(null); onChanged(); }} />
      )}
    </div>
  );
}

/* ── small pieces ─────────────────────────────────────────────────────────────────────────────────── */

type MenuItem = {
  label: string;
  icon: typeof Eye;
  onClick?: () => void;
  href?: string;
  danger?: boolean;
  disabled?: boolean;
};

/** A "⋮" button with a menu. Fixed-positioned so the table's scroll box can't cut it off. */
function ActionMenu({ label: name, items }: { label: string; items: MenuItem[] }) {
  const [pos, setPos] = useState<{ top?: number; bottom?: number; right: number } | null>(null);
  const close = useCallback(() => setPos(null), []);
  useEscape(close, !!pos);
  useEffect(() => {
    if (!pos) return;
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => { window.removeEventListener('scroll', close, true); window.removeEventListener('resize', close); };
  }, [pos, close]);

  return (
    <>
      <button type="button" aria-label={name} aria-haspopup="menu" aria-expanded={!!pos} className={btn.icon}
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          const right = window.innerWidth - r.right;
          setPos(r.bottom + 260 > window.innerHeight ? { bottom: window.innerHeight - r.top + 4, right } : { top: r.bottom + 4, right });
        }}>
        <MoreVertical className="h-4 w-4" />
      </button>
      {pos && (
        <>
          <div className="fixed inset-0 z-[60]" onClick={close} aria-hidden />
          <div role="menu" style={pos} className="fixed z-[61] min-w-48 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-xl">
            {items.map((it) => {
              const cls = `flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-sm ${it.danger ? 'text-rose-700 hover:bg-rose-50' : 'text-slate-700 hover:bg-slate-50'} disabled:opacity-40`;
              const body = <><it.icon className="h-4 w-4 shrink-0" /> {it.label}</>;
              return it.href ? (
                <Link key={it.label} role="menuitem" href={it.href} className={cls} onClick={close}>{body}</Link>
              ) : (
                <button key={it.label} role="menuitem" type="button" disabled={it.disabled} className={cls}
                  onClick={() => { close(); it.onClick?.(); }}>{body}</button>
              );
            })}
          </div>
        </>
      )}
    </>
  );
}

function Modal({ title, onClose, children, footer }: { title: string; onClose: () => void; children: ReactNode; footer: ReactNode }) {
  useEscape(onClose);
  return (
    <div className="fixed inset-0 z-[90] flex items-end justify-center bg-slate-900/40 backdrop-blur-[2px] sm:items-center sm:p-6" role="dialog" aria-modal="true" aria-label={title}>
      <div className="w-full max-w-md overflow-hidden bg-white shadow-2xl sm:rounded-3xl">
        <header className="flex items-start gap-3 px-6 pt-5">
          <h2 className="flex-1 text-lg font-bold text-slate-900">{title}</h2>
          <button type="button" onClick={onClose} className={btn.icon} aria-label="Close"><X className="h-5 w-5" /></button>
        </header>
        <div className="px-6 py-4 text-sm text-slate-600">{children}</div>
        <footer className="flex justify-end gap-2 border-t border-slate-100 bg-slate-50/60 px-6 py-3.5">{footer}</footer>
      </div>
    </div>
  );
}

function FolderNameDialog({ title, initial, siblings, action, onCancel, onSave }: {
  title: string; initial: string; siblings: string[]; action: string;
  onCancel: () => void; onSave: (name: string) => Promise<void>;
}) {
  const [name, setName] = useState(initial);
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const problem = folderNameProblem(name, siblings);
  const unchanged = !!initial && name.trim() === initial;

  async function submit() {
    setTouched(true);
    if (problem || unchanged) return;
    setBusy(true);
    try { await onSave(name); } catch (err) { setError(errorText(err)); setBusy(false); }
  }

  return (
    <Modal title={title} onClose={busy ? () => {} : onCancel} footer={
      <>
        <button type="button" onClick={onCancel} disabled={busy} className={btn.secondary}>Cancel</button>
        <button type="button" onClick={submit} disabled={busy || unchanged} className={btn.violet}>
          {busy && <Loader2 className="h-4 w-4 animate-spin" />} {action}
        </button>
      </>
    }>
      <form onSubmit={(e) => { e.preventDefault(); submit(); }}>
        <label className="block text-sm font-medium text-slate-700" htmlFor="folder-name">Folder name</label>
        <input id="folder-name" autoFocus value={name} onChange={(e) => { setName(e.target.value); setError(''); }}
          placeholder="e.g. Detail associates" maxLength={80} className={`${inputCls} mt-1.5`} />
        {((touched && problem) || error) && <p className="mt-1.5 text-xs text-rose-600">{error || problem}</p>}
        {!initial && <p className="mt-2 text-xs text-slate-400">An empty folder is kept in this browser until a file is uploaded into it.</p>}
      </form>
    </Modal>
  );
}

function MoveDialog({ file, folders, onCancel, onMove }: {
  file: BatchSummary; folders: string[]; onCancel: () => void; onMove: (dest: string) => Promise<void>;
}) {
  const current = splitImportPath(file.file_name).folder;
  const [dest, setDest] = useState(current);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const options = ['', ...folders];

  async function move() {
    setBusy(true);
    try { await onMove(dest); } catch (err) { setError(errorText(err)); setBusy(false); }
  }

  return (
    <Modal title={`Move “${splitImportPath(file.file_name).name}”`} onClose={busy ? () => {} : onCancel} footer={
      <>
        <button type="button" onClick={onCancel} disabled={busy} className={btn.secondary}>Cancel</button>
        <button type="button" onClick={move} disabled={busy || dest === current} className={btn.violet}>
          {busy && <Loader2 className="h-4 w-4 animate-spin" />} Move here
        </button>
      </>
    }>
      <ul className="max-h-72 space-y-0.5 overflow-y-auto rounded-xl border border-slate-200 p-1.5" role="listbox" aria-label="Destination folder">
        {options.map((f) => {
          const depth = f ? f.split('/').length : 0;
          return (
            <li key={f || '/'}>
              <button type="button" role="option" aria-selected={dest === f} onClick={() => setDest(f)}
                style={{ paddingLeft: 10 + depth * 16 }}
                className={`flex w-full items-center gap-2 rounded-lg py-2 pr-2.5 text-left text-sm ${dest === f ? 'bg-violet-50 font-semibold text-violet-800' : 'text-slate-700 hover:bg-slate-50'}`}>
                {f ? <Folder className="h-4 w-4 shrink-0 text-amber-500" /> : <Home className="h-4 w-4 shrink-0 text-slate-400" />}
                <span className="truncate">{label(f)}</span>
                {f === current && <span className="ml-auto text-xs font-normal text-slate-400">current</span>}
              </button>
            </li>
          );
        })}
      </ul>
      {error && <p className="mt-2 text-xs text-rose-600">{error}</p>}
    </Modal>
  );
}

function ConfirmDialog({ title, body, action, danger, run, onClose }: Confirm & { onClose: () => void }) {
  const [busy, setBusy] = useState('');
  async function go() {
    setBusy('Working…');
    try {
      await run(setBusy);
      onClose();
    } catch (err) {
      showToast(errorText(err), 'error');
      setBusy('');
    }
  }
  return (
    <Modal title={title} onClose={busy ? () => {} : onClose} footer={
      <>
        <button type="button" onClick={onClose} disabled={!!busy} className={btn.secondary}>Cancel</button>
        <button type="button" onClick={go} disabled={!!busy} className={danger ? btn.danger : btn.violet}>
          {busy ? <><Loader2 className="h-4 w-4 animate-spin" /> {busy}</> : action}
        </button>
      </>
    }>
      {body}
    </Modal>
  );
}
