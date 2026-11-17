'use client';

/* "Merge another file into this one" — asks which file, explains what happens, and merges on approval.
   The other file's rows join this file; columns with the same name become one; the other file is removed. */

import { useEffect, useMemo, useState } from 'react';
import { FileSpreadsheet, Folder, GitMerge, Loader2, Search, X } from 'lucide-react';
import { showToast } from '@/components/Toaster';
import { splitImportPath } from '@/lib/associateImport';
import { listImports, mergeImports, type BatchSummary } from '@/lib/associateImportsApi';
import { errorText } from '@/lib/associatesApi';
import { btn, inputCls, useEscape } from './ui';
import { StatusBadge } from './importUi';

export default function MergeDialog({ into, files, onClose, onMerged, beforeMerge }: {
  /** the file the rows are merged into */
  into: { id: string; file_name: string };
  /** the files to choose from (loaded here when not given) */
  files?: BatchSummary[];
  onClose: () => void;
  onMerged: () => void;
  /** e.g. save unsaved changes first; false = stop */
  beforeMerge?: () => Promise<boolean>;
}) {
  const [loaded, setLoaded] = useState<BatchSummary[] | null>(files ?? null);
  const [query, setQuery] = useState('');
  const [pick, setPick] = useState<string>('');
  const [busy, setBusy] = useState(false);
  useEscape(onClose, !busy);

  useEffect(() => {
    if (files) return;
    let alive = true;
    listImports().then((l) => { if (alive) setLoaded(l); }, (err) => { if (alive) { setLoaded([]); showToast(errorText(err), 'error'); } });
    return () => { alive = false; };
  }, [files]);

  const candidates = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (loaded || [])
      .filter((b) => b.id !== into.id && b.status !== 'submitted' && b.status !== 'validating' && b.status !== 'failed')
      .filter((b) => !q || b.file_name.toLowerCase().includes(q))
      .sort((a, b) => a.file_name.localeCompare(b.file_name, undefined, { numeric: true, sensitivity: 'base' }));
  }, [loaded, into.id, query]);
  const chosen = candidates.find((b) => b.id === pick);

  async function merge() {
    if (!chosen) return;
    setBusy(true);
    try {
      if (beforeMerge && !(await beforeMerge())) { setBusy(false); return; }
      const r = await mergeImports(into.id, chosen.id);
      showToast(`${r.added} ${r.added === 1 ? 'row' : 'rows'} merged in from “${splitImportPath(chosen.file_name).name}”`, 'success');
      onMerged();
    } catch (err) {
      showToast(errorText(err), 'error');
      setBusy(false);
    }
  }

  const name = splitImportPath(into.file_name).name;

  return (
    <div className="fixed inset-0 z-[90] flex items-end justify-center bg-slate-900/40 backdrop-blur-[2px] sm:items-center sm:p-6" role="dialog" aria-modal="true" aria-labelledby="merge-title">
      <div className="flex max-h-[100dvh] w-full max-w-xl flex-col overflow-hidden bg-white shadow-2xl sm:max-h-[90vh] sm:rounded-3xl">
        <header className="flex items-start gap-3 border-b border-slate-100 px-5 py-5 sm:px-6">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600"><GitMerge className="h-5 w-5" /></span>
          <div className="min-w-0 flex-1">
            <h2 id="merge-title" className="text-lg font-bold text-slate-900">Merge a file into “{name}”</h2>
            <p className="text-sm text-slate-500">Pick the file whose rows should join this one.</p>
          </div>
          <button type="button" onClick={onClose} disabled={busy} className={btn.icon} aria-label="Close"><X className="h-5 w-5" /></button>
        </header>

        <div className="flex-1 space-y-3 overflow-y-auto px-5 py-4 sm:px-6">
          <label className="relative block">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <span className="sr-only">Search files</span>
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search files…" className={`${inputCls} py-2 pl-9`} />
          </label>
          {!loaded ? (
            <p className="flex items-center justify-center gap-2 py-10 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Loading files…</p>
          ) : !candidates.length ? (
            <p className="rounded-xl border border-dashed border-slate-200 p-6 text-center text-sm text-slate-400">No other file can be merged (synced files can’t be).</p>
          ) : (
            <ul className="space-y-1" role="listbox" aria-label="Files">
              {candidates.map((b) => {
                const { folder, name: n } = splitImportPath(b.file_name);
                return (
                  <li key={b.id}>
                    <button type="button" role="option" aria-selected={pick === b.id} onClick={() => setPick(b.id)}
                      className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left ${pick === b.id ? 'border-indigo-400 bg-indigo-50' : 'border-slate-200 hover:bg-slate-50'}`}>
                      <FileSpreadsheet className="h-4 w-4 shrink-0 text-emerald-600" />
                      <span className="min-w-0 flex-1">
                        {folder && <span className="flex items-center gap-1 truncate text-[11px] text-slate-400"><Folder className="h-3 w-3" /> {folder.replace(/\//g, ' › ')}</span>}
                        <span className="block truncate text-sm font-semibold text-slate-900">{n}</span>
                        <span className="text-xs text-slate-500">{b.total} rows</span>
                      </span>
                      <StatusBadge status={b.status} />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          {chosen && (
            <div className="rounded-2xl bg-indigo-50/70 p-4 text-sm text-indigo-950">
              <p className="font-semibold">What happens</p>
              <ul className="mt-1 list-inside list-disc space-y-0.5">
                <li>The {chosen.total} rows of “{splitImportPath(chosen.file_name).name}” are added to “{name}”.</li>
                <li>Columns with the same name become one column; other columns are added.</li>
                <li>Every row is checked again — the same person in both files shows up as a duplicate.</li>
                <li>“{splitImportPath(chosen.file_name).name}” is then removed from the imports.</li>
                <li>Nothing is added to Associates until this file is synced.</li>
              </ul>
            </div>
          )}
        </div>

        <footer className="flex justify-end gap-2 border-t border-slate-100 bg-slate-50/60 px-5 py-3.5 sm:px-6">
          <button type="button" onClick={onClose} disabled={busy} className={btn.secondary}>Cancel</button>
          <button type="button" onClick={merge} disabled={!chosen || busy} className={btn.violet}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <GitMerge className="h-4 w-4" />} Approve &amp; merge
          </button>
        </footer>
      </div>
    </div>
  );
}
