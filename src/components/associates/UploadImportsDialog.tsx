'use client';

/* Upload one or more Excel / CSV files. Each file becomes its own import batch: the server reads it,
   checks every row (the dry run) and keeps it as a draft — nothing is added to the Associates list yet. */

import { useCallback, useRef, useState, type DragEvent } from 'react';
import Link from 'next/link';
import {
  AlertTriangle, ArrowRight, CheckCircle2, Copy, Download, FileSpreadsheet, Folder, FolderOpen, Loader2, Upload, X, XCircle,
} from 'lucide-react';
import type { AssociateField } from '@/lib/associates';
import { isJunkFile, splitImportPath } from '@/lib/associateImport';
import { ACCEPTED_FILES, downloadTemplate, fileProblem, MAX_FILE_MB } from '@/lib/associateExcel';
import { uploadImport, type UploadOutcome } from '@/lib/associateImportsApi';
import { btn, useEscape } from './ui';
import { StatusBadge, when } from './importUi';

type Item = {
  key: string;
  file: File;
  /** place inside an uploaded folder ("Directors/IAS/list.xlsx"); '' for single files */
  path: string;
  /** the folder of the explorer it is uploaded into ('' = the top "Associates" folder) */
  into: string;
  state: 'waiting' | 'uploading' | 'done' | 'duplicate' | 'failed';
  outcome?: UploadOutcome;
  force?: boolean;
};

type Picked = { file: File; path: string };

/** Most files one folder upload takes — a guard against picking a whole drive by mistake. */
const MAX_FOLDER_FILES = 2000;

/* ── reading dropped folders (File System Entry API — Chrome, Edge, Firefox, Safari) ───────────── */

function readEntries(dir: FileSystemDirectoryEntry): Promise<FileSystemEntry[]> {
  const reader = dir.createReader();
  const all: FileSystemEntry[] = [];
  return new Promise((resolve, reject) => {
    const next = () => reader.readEntries((batch) => {
      if (!batch.length) return resolve(all);
      all.push(...batch);
      next(); // readEntries hands back at most ~100 at a time
    }, reject);
    next();
  });
}

async function walk(entry: FileSystemEntry, out: Picked[]): Promise<void> {
  if (out.length > MAX_FOLDER_FILES * 4) return;
  if (entry.isFile) {
    const file = await new Promise<File>((res, rej) => (entry as FileSystemFileEntry).file(res, rej));
    out.push({ file, path: entry.fullPath.replace(/^\/+/, '') });
  } else if (entry.isDirectory) {
    for (const child of await readEntries(entry as FileSystemDirectoryEntry)) await walk(child, out);
  }
}

export default function UploadImportsDialog({ open, folder = '', onClose, fields, onUploaded }: {
  open: boolean;
  /** upload into this folder ("Detail associates/2026"); '' = the top "Associates" folder */
  folder?: string;
  onClose: () => void;
  fields: AssociateField[];
  /** after each finished upload — refreshes the history */
  onUploaded: () => void;
}) {
  const [items, setItems] = useState<Item[]>([]);
  const [dragging, setDragging] = useState(false);
  const [notice, setNotice] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const folderRef = useRef<HTMLInputElement>(null);
  const running = useRef(false);
  const queue = useRef<Item[]>([]);

  const busy = items.some((i) => i.state === 'uploading' || i.state === 'waiting');
  const close = useCallback(() => {
    if (busy) return;
    setItems([]);
    setNotice('');
    onClose();
  }, [busy, onClose]);
  useEscape(close, open);

  /** Files picked one by one are all listed (a wrong type shows why it failed). Files that came from a
      folder are filtered: only Excel / CSV files are taken, the rest is counted and left out. */
  function add(picked: Picked[]) {
    if (inputRef.current) inputRef.current.value = '';
    if (folderRef.current) folderRef.current.value = '';
    if (!picked.length) return;

    const fromFolder = picked.filter((p) => p.path.includes('/'));
    const single = picked.filter((p) => !p.path.includes('/'));
    const usable = fromFolder.filter((p) => !isJunkFile(p.file.name) && !fileProblem(p.file.name, 1));
    const ignored = fromFolder.filter((p) => !isJunkFile(p.file.name)).length - usable.length;
    const taken = usable
      .sort((a, b) => a.path.localeCompare(b.path, undefined, { numeric: true, sensitivity: 'base' }))
      .slice(0, MAX_FOLDER_FILES);

    const notes: string[] = [];
    if (fromFolder.length && !usable.length) notes.push('No Excel or CSV files were found in that folder.');
    if (ignored > 0) notes.push(`${ignored} other file${ignored === 1 ? ' was' : 's were'} left out (not Excel or CSV).`);
    if (usable.length > MAX_FOLDER_FILES) notes.push(`Only the first ${MAX_FOLDER_FILES} files were taken — upload the rest separately.`);
    setNotice(notes.join(' '));

    const stamp = Date.now();
    const next: Item[] = [...single, ...taken].map(({ file, path }, i) => {
      const problem = fileProblem(file.name, file.size);
      return {
        key: `${stamp}-${i}-${path || file.name}`,
        file,
        path,
        into: folder,
        state: problem ? 'failed' : 'waiting',
        ...(problem && { outcome: { ok: false, error: problem } as UploadOutcome }),
      };
    });
    setItems((cur) => [...cur, ...next]);
    queue.current.push(...next.filter((i) => i.state === 'waiting'));
    pump();
  }

  const fromInput = (files: FileList | null) =>
    add([...(files || [])].map((file) => ({ file, path: file.webkitRelativePath || '' })));

  const patch = (key: string, change: Partial<Item>) =>
    setItems((cur) => cur.map((i) => (i.key === key ? { ...i, ...change } : i)));

  /* one file at a time — keeps the server load predictable and the progress readable */
  async function pump() {
    if (running.current) return;
    running.current = true;
    while (queue.current.length) {
      const next = queue.current.shift()!;
      patch(next.key, { state: 'uploading' });
      const rel = next.path || next.file.name;
      const outcome = await uploadImport(next.file, next.force, next.into ? `${next.into}/${rel}` : next.path);
      patch(next.key, { state: outcome.ok ? 'done' : outcome.duplicateOf ? 'duplicate' : 'failed', outcome });
      if (outcome.ok || outcome.batch) onUploaded();
    }
    running.current = false;
  }

  const uploadAnyway = (it: Item) => {
    const again = { ...it, state: 'waiting' as const, force: true, outcome: undefined };
    patch(it.key, again);
    queue.current.push(again);
    pump();
  };
  const drop = (key: string) => setItems((cur) => cur.filter((i) => i.key !== key));

  const onDrop = async (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    // the entries must be taken now — the drop data is gone after the first await
    const entries = [...e.dataTransfer.items]
      .map((it) => (it.kind === 'file' ? it.webkitGetAsEntry?.() : null))
      .filter((x): x is FileSystemEntry => !!x);
    if (!entries.some((en) => en.isDirectory)) {
      add([...e.dataTransfer.files].map((file) => ({ file, path: '' })));
      return;
    }
    setNotice('Reading the folder…');
    try {
      const out: Picked[] = [];
      for (const en of entries) await walk(en, out);
      add(out);
    } catch {
      setNotice('That folder could not be read. Try "Choose folder" instead.');
    }
  };

  if (!open) return null;
  const done = items.filter((i) => i.state === 'done').length;

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-slate-900/40 backdrop-blur-[2px] sm:items-center sm:p-6" role="dialog" aria-modal="true" aria-labelledby="upload-title">
      <div className="flex max-h-[100dvh] w-full max-w-3xl flex-col overflow-hidden bg-white shadow-2xl sm:max-h-[92vh] sm:rounded-3xl">
        <header className="flex items-start gap-3 border-b border-slate-100 px-5 py-5 sm:px-7">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
            <FileSpreadsheet className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 id="upload-title" className="text-lg font-bold text-slate-900">Upload Excel files or folders</h2>
            <p className="text-sm text-slate-500">Each file is checked (dry run) and kept as a draft. Nothing is added to Associates until an admin submits it.</p>
            <p className="mt-1.5 inline-flex max-w-full items-center gap-1.5 rounded-lg bg-amber-50 px-2 py-1 text-xs font-medium text-amber-800">
              <FolderOpen className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">Into: {['Associates', ...(folder ? folder.split('/') : [])].join(' › ')}</span>
            </p>
          </div>
          <button type="button" onClick={close} disabled={busy} className={btn.icon} aria-label="Close"><X className="h-5 w-5" /></button>
        </header>

        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-5 sm:px-7">
          <div
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            className={`flex flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-9 text-center transition ${
              dragging ? 'border-violet-400 bg-violet-50' : 'border-slate-200 bg-slate-50/60'
            }`}
          >
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-violet-600 shadow-sm ring-1 ring-slate-200">
              <Upload className="h-5 w-5" />
            </span>
            <p className="mt-3 text-base font-semibold text-slate-900">Drop files or a whole folder here</p>
            <p className="mt-1 text-sm text-slate-500">.xlsx, .xls or .csv · up to {MAX_FILE_MB} MB each · subfolders included</p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              <button type="button" onClick={() => inputRef.current?.click()} className={btn.primary}>
                <FileSpreadsheet className="h-4 w-4" /> Choose files
              </button>
              <button type="button" onClick={() => folderRef.current?.click()} className={btn.secondary}>
                <FolderOpen className="h-4 w-4" /> Choose folder
              </button>
            </div>
            <input ref={inputRef} type="file" multiple accept={ACCEPTED_FILES} className="sr-only" aria-label="Excel files"
              onChange={(e) => fromInput(e.target.files)} />
            {/* webkitdirectory: pick a folder; every file in it and its subfolders comes with its relative path */}
            <input ref={folderRef} type="file" multiple className="sr-only" aria-label="Folder of Excel files"
              {...{ webkitdirectory: '', directory: '' }}
              onChange={(e) => fromInput(e.target.files)} />
          </div>

          {notice && (
            <p className="flex items-start gap-2 rounded-xl bg-slate-50 px-3 py-2.5 text-sm text-slate-600 ring-1 ring-slate-200">
              <FolderOpen className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" /> {notice}
            </p>
          )}

          {items.length > 0 && (
            <ul className="space-y-2" aria-live="polite">
              {items.map((it) => (
                <li key={it.key} className="rounded-2xl border border-slate-200 p-3.5">
                  <div className="flex items-center gap-3">
                    <FileIcon state={it.state} />
                    <div className="min-w-0 flex-1">
                      {it.path.includes('/') && (
                        <p className="flex items-center gap-1 truncate text-[11px] text-slate-400" title={splitImportPath(it.path).folder}>
                          <Folder className="h-3 w-3 shrink-0" /> {splitImportPath(it.path).folder.replace(/\//g, ' › ')}
                        </p>
                      )}
                      <p className="truncate text-sm font-semibold text-slate-900" title={it.file.name}>{it.file.name}</p>
                      <Detail item={it} />
                    </div>
                    {it.state === 'done' && it.outcome?.ok && (
                      <Link href={`/associates/imports/${it.outcome.batch.id}`} className={btn.secondary}>
                        Review <ArrowRight className="h-4 w-4" />
                      </Link>
                    )}
                    {(it.state === 'failed' || it.state === 'duplicate') && (
                      <button type="button" onClick={() => drop(it.key)} className={btn.icon} aria-label={`Remove ${it.path || it.file.name} from this list`}>
                        <X className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                  {it.state === 'duplicate' && !it.outcome?.ok && it.outcome?.duplicateOf && (
                    <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl bg-amber-50 px-3 py-2.5 text-sm text-amber-900">
                      <Copy className="h-4 w-4 shrink-0" />
                      <span className="flex-1">
                        {it.outcome.error} Uploaded {when(it.outcome.duplicateOf.created)}.
                      </span>
                      <Link href={`/associates/imports/${it.outcome.duplicateOf.id}`} className={btn.secondary}>Open it</Link>
                      <button type="button" onClick={() => uploadAnyway(it)} className={btn.ghost}>Upload anyway</button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}

          <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 p-4 sm:flex-row sm:items-center">
            <div className="flex-1 text-sm text-slate-600">
              <p className="font-semibold text-slate-800">Tips</p>
              <ul className="mt-1 list-inside list-disc space-y-0.5">
                <li>One person per row, column titles in the first row. A <strong>Name</strong> column is required.</li>
                <li>Columns the list doesn&apos;t have yet become new fields when the import is submitted.</li>
                <li>In a folder, every Excel file becomes its own draft. The folder names are kept, so you can browse the imports by folder.</li>
              </ul>
            </div>
            <button type="button" onClick={() => downloadTemplate(fields)} className={btn.secondary}>
              <Download className="h-4 w-4" /> Template
            </button>
          </div>
        </div>

        <footer className="flex items-center gap-2 border-t border-slate-100 bg-slate-50/60 px-5 py-3.5 sm:px-7">
          <p className="text-sm text-slate-500">{items.length ? `${done} of ${items.length} ready to review` : ''}</p>
          <button type="button" onClick={close} disabled={busy} className={`${btn.primary} ml-auto`}>
            {busy ? <><Loader2 className="h-4 w-4 animate-spin" /> Uploading…</> : 'Done'}
          </button>
        </footer>
      </div>
    </div>
  );
}

function FileIcon({ state }: { state: Item['state'] }) {
  if (state === 'uploading') return <Loader2 className="h-5 w-5 shrink-0 animate-spin text-violet-500" />;
  if (state === 'done') return <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-500" />;
  if (state === 'duplicate') return <AlertTriangle className="h-5 w-5 shrink-0 text-amber-500" />;
  if (state === 'failed') return <XCircle className="h-5 w-5 shrink-0 text-rose-500" />;
  return <FileSpreadsheet className="h-5 w-5 shrink-0 text-slate-300" />;
}

function Detail({ item }: { item: Item }) {
  const o = item.outcome;
  if (item.state === 'waiting') return <p className="text-xs text-slate-400">Waiting…</p>;
  if (item.state === 'uploading') return <p className="text-xs text-slate-500">Uploading and checking every row…</p>;
  if (o?.ok) {
    const b = o.batch;
    return (
      <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
        <StatusBadge status={b.status} />
        <span>{b.total} rows</span>·<span className="text-emerald-700">{b.valid} valid</span>
        {b.invalid > 0 && <>·<span className="text-rose-700">{b.invalid} to fix</span></>}
        {b.duplicates > 0 && <>·<span className="text-amber-700">{b.duplicates} duplicates</span></>}
      </p>
    );
  }
  if (item.state === 'duplicate') return <p className="text-xs text-amber-700">Already uploaded</p>;
  return <p className="text-xs text-rose-700">{o && !o.ok ? o.error : 'Failed'}</p>;
}
