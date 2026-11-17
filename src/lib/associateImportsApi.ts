/* lib/associateImportsApi.ts — the browser side of the associates bulk import.
   Reading the import history is a plain PocketBase read (the API rules apply); everything that changes
   a batch goes through our own API routes (app/api/associates/imports), where it is checked again. */

import pb from '@/lib/pocketbase';
import { apiJSON, orgHeader } from '@/lib/apiClient';
import type { ColumnMap } from '@/lib/associates';
import type { DuplicateAction, FileColumn, ImportBatch, ImportCounts, StagedRow, SubmitResult } from '@/lib/associateImport';

export const IMPORTS = 'associate_imports';

/** A batch as the history list shows it (without the rows). */
export type BatchSummary = Pick<ImportBatch,
  'id' | 'file' | 'file_name' | 'status' | 'total' | 'valid' | 'invalid' | 'duplicates' | 'error' | 'created' | 'result'
> & { uploaded_by?: string; submitted_at?: string; submitted_by?: string; updated?: string };

const LIST_FIELDS = 'id,file,file_name,status,total,valid,invalid,duplicates,error,created,updated,result,uploaded_by,submitted_at,submitted_by';

export async function listImports(): Promise<BatchSummary[]> {
  return pb.collection(IMPORTS).getFullList<BatchSummary>({ sort: '-created', fields: LIST_FIELDS, requestKey: null });
}

export async function getImport(id: string): Promise<ImportBatch> {
  return pb.collection(IMPORTS).getOne<ImportBatch>(id, { requestKey: null });
}

export async function deleteImport(id: string): Promise<void> {
  await pb.collection(IMPORTS).delete(id, { requestKey: null });
}

/** Moves / renames a batch inside the folder tree (only its `file_name` path changes). */
export async function moveImport(id: string, fileName: string): Promise<void> {
  await pb.collection(IMPORTS).update(id, { file_name: fileName }, { requestKey: null });
}

/** Downloads the original file. PocketBase sends it as an attachment (?download=1), so following the link
    saves it without leaving the page — and, unlike a new tab, no popup blocker can stop it. */
export async function downloadOriginal(batch: Pick<ImportBatch, 'id' | 'file'>): Promise<void> {
  const a = document.createElement('a');
  a.href = await originalFileUrl(batch);
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/** A link to the original file (protected → needs a short-lived file token). */
export async function originalFileUrl(batch: Pick<ImportBatch, 'id' | 'file'> & { collectionId?: string }): Promise<string> {
  if (!batch.file) throw new Error('The original file is not stored for this import.');
  const token = await pb.files.getToken();
  // list results carry no collection id — the collection name works just as well for the URL
  return pb.files.getURL({ collectionName: IMPORTS, ...batch } as never, batch.file, { token, download: true });
}

export type UploadOutcome =
  | { ok: true; batch: BatchSummary }
  | { ok: false; error: string; duplicateOf?: { id: string; file_name: string; status: string; created: string }; batch?: BatchSummary };

/** Uploads one file; the server reads and checks it. Never throws. */
/** `path` = the file's place inside an uploaded folder ("Directors/IAS/list.xlsx"). */
export async function uploadImport(file: File, force = false, path = ''): Promise<UploadOutcome> {
  const fd = new FormData();
  fd.set('file', file);
  if (force) fd.set('force', '1');
  if (path) fd.set('path', path);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 180_000);
  try {
    const res = await fetch('/api/associates/imports', {
      method: 'POST',
      headers: { Authorization: pb.authStore.token || '', ...orgHeader() },
      body: fd,
      signal: ctrl.signal,
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) return { ok: true, batch: data.batch };
    return { ok: false, error: data.error || `Upload failed (${res.status})`, duplicateOf: data.duplicateOf, batch: data.batch };
  } catch {
    return { ok: false, error: 'The upload did not finish (connection lost or it took too long).' };
  } finally {
    clearTimeout(timer);
  }
}

/** Saves (approves) a file: rows, duplicate choice and — when edited — its own columns. */
export function saveDraft(id: string, rows: StagedRow[], onDuplicate: DuplicateAction, columns?: FileColumn[]) {
  return apiJSON<{ batch: BatchSummary; counts: ImportCounts }>(`/api/associates/imports/${id}`, { rows, onDuplicate, columns }, { method: 'PUT', timeoutMs: 120_000 });
}

/** Merges the file `from` into `into` (the `from` file is removed afterwards). */
export function mergeImports(into: string, from: string) {
  return apiJSON<{ batch: BatchSummary; added: number; columns: number }>(`/api/associates/imports/${into}/merge`, { from }, { timeoutMs: 120_000 });
}

export function changeColumns(id: string, body: { sheet?: string; columns?: ColumnMap[]; titleRow?: boolean }) {
  return apiJSON<{ batch: BatchSummary }>(`/api/associates/imports/${id}/columns`, body, { timeoutMs: 120_000 });
}

/** Syncs a file into Associates (admins). `columns` = the approved mapping; omitted = the saved one. */
export function submitImport(id: string, columns?: FileColumn[]) {
  return apiJSON<{ result: SubmitResult; batch: BatchSummary }>(`/api/associates/imports/${id}/submit`, columns ? { columns } : {}, { timeoutMs: 300_000 });
}
