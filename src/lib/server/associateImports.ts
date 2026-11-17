/* lib/server/associateImports.ts — server side of the associates bulk import (used by app/api/associates/imports).

   Every PocketBase call is made with the signed-in person's own token, so the collections' API rules
   (organisation, viewer = read-only) apply exactly as in the browser.

   Submitting is retry-safe: each staged row gets a fixed record id (derived from the batch id and the row),
   so running the submission again never inserts the same person twice — it carries on where it stopped.
   Writes go through PocketBase's batch API (one transaction per batch) when it is enabled in the
   PocketBase settings, and one by one otherwise. */

import { createHash } from 'node:crypto';
import * as XLSX from 'xlsx';
import { pbURL } from '@/lib/serverAuth';
import { autoMap, mergeData, missingChoices, type Associate, type AssociateField, type ColumnMap } from '@/lib/associates';
import {
  checkImport, checkRows, columnFields, countChecks, fileColumnsFrom, fileColumnsOf, mapRows, stageRows, statusFor,
  submitPlan, syncPlan,
  type DuplicateAction, type ImportBatch, type ImportSettings, type StagedRow, type SubmitResult,
} from '@/lib/associateImport';
import { parseWorkbook, withTitleRow, type SheetData } from '@/lib/associateExcel';

export const IMPORTS = 'associate_imports';

/** An error with the HTTP status to answer with. */
export class HttpError extends Error {
  constructor(public status: number, message: string, public extra: Record<string, unknown> = {}) {
    super(message);
  }
}

/* ── PocketBase, as the signed-in user ─────────────────────────────── */

export async function pb<T = any>(token: string, path: string, init: { method?: string; body?: unknown; form?: FormData } = {}): Promise<T> {
  const res = await fetch(`${pbURL()}${path}`, {
    method: init.method || 'GET',
    headers: { Authorization: token, ...(init.body !== undefined && { 'Content-Type': 'application/json' }) },
    body: init.form ?? (init.body !== undefined ? JSON.stringify(init.body) : undefined),
    cache: 'no-store',
  }).catch(() => null);
  if (!res) throw new HttpError(502, 'The database server could not be reached.');
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const field = data?.data && Object.entries(data.data as Record<string, { message?: string }>)[0];
    const detail = field ? `${field[0]}: ${field[1]?.message || 'invalid value'}` : '';
    const message = res.status === 404 && path.includes(`/collections/${IMPORTS}`)
      ? 'The import area is not set up on the server yet (create the associate_imports collection).'
      : res.status === 403 ? 'You do not have permission to do this.'
      : detail || data?.message || `The database answered ${res.status}.`;
    throw new HttpError(res.status === 404 || res.status === 403 ? res.status : res.status >= 500 ? 502 : 400, message, { pb: data });
  }
  return data as T;
}

/** Every record of a collection (500 per request). */
export async function listAll<T>(token: string, collection: string, query = ''): Promise<T[]> {
  const out: T[] = [];
  for (let page = 1; ; page++) {
    const r = await pb<{ items: T[]; totalPages: number }>(token,
      `/api/collections/${collection}/records?page=${page}&perPage=500&skipTotal=0${query ? `&${query}` : ''}`);
    out.push(...r.items);
    if (page >= r.totalPages || !r.items.length) break;
  }
  return out;
}

export const loadFields = (token: string) => listAll<AssociateField>(token, 'associate_fields', 'sort=sort_order,created');
export const loadPeople = (token: string) => listAll<Associate>(token, 'associates', 'fields=id,name,data');

export const getBatch = (token: string, id: string) => {
  if (!/^[a-z0-9]{15}$/.test(id)) throw new HttpError(404, 'Import not found.');
  return pb<ImportBatch>(token, `/api/collections/${IMPORTS}/records/${id}`);
};

/** Saves part of a batch — and checks it really was saved. PocketBase silently ignores values for fields the
    collection doesn't have (a field created by hand under another name, or as the wrong type), which would leave
    a "ready" import with no rows. Such a gap is reported by name instead. */
export async function saveBatch(token: string, id: string, patch: Partial<ImportBatch>): Promise<ImportBatch> {
  const saved = await pb<ImportBatch>(token, `/api/collections/${IMPORTS}/records/${id}`, { method: 'PATCH', body: patch });
  const record = saved as unknown as Record<string, unknown>;
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined || value === null || value === '') continue;
    const got = record[key];
    const wantsJson = typeof value === 'object';
    if (got === undefined || (wantsJson && (got === null || typeof got !== 'object'))) {
      throw new HttpError(500,
        `The "${key}" field is missing from the associate_imports collection in PocketBase` +
        `${got !== undefined ? ' (or is not a JSON field)' : ''}. Add it there as a ${wantsJson ? 'JSON' : typeof value === 'number' ? 'Number' : 'Plain text'} field named exactly "${key}", then click Read again.`);
    }
  }
  return saved;
}

/** The uploaded file of a batch (protected → fetched with a short-lived file token). */
export async function downloadBatchFile(token: string, batch: ImportBatch): Promise<ArrayBuffer> {
  if (!batch.file) throw new HttpError(400, 'This import has no file attached.');
  const { token: fileToken } = await pb<{ token: string }>(token, '/api/files/token', { method: 'POST' });
  const res = await fetch(`${pbURL()}/api/files/${IMPORTS}/${batch.id}/${encodeURIComponent(batch.file)}?token=${fileToken}`, {
    headers: { Authorization: token }, cache: 'no-store',
  }).catch(() => null);
  if (!res?.ok) throw new HttpError(502, 'The original file could not be read from the server.');
  return res.arrayBuffer();
}

/* ── parsing + staging ────────────────────────────────────────────── */

export const sha256 = (data: ArrayBuffer | Uint8Array) => createHash('sha256').update(new Uint8Array(data as ArrayBuffer)).digest('hex');

/** A fixed 15-character record id for a seed — the same seed always gives the same id. */
export const fixedId = (seed: string) => createHash('sha256').update(seed).digest('hex').slice(0, 15);

export function readSheets(data: ArrayBuffer): SheetData[] {
  try {
    return parseWorkbook(XLSX, new Uint8Array(data));
  } catch (err) {
    throw new HttpError(422, err instanceof Error ? err.message : "This file couldn't be read.");
  }
}

/**
 * The dry run of one sheet: how the Excel columns are read (given, or guessed), the file's own columns,
 * the cleaned rows and the check. The result waits for the user's approval: status "uploaded" (Dry run)
 * unless `approved` — saving the draft is the approval.
 */
export function stage(
  sheets: SheetData[], sheetName: string | undefined, columns: ColumnMap[] | undefined,
  fields: AssociateField[], people: Associate[], onDuplicate: DuplicateAction, approved = false,
  titles: 'auto' | boolean = 'auto',
) {
  // a file without column titles: its first row is a person, its columns follow the template's order
  const sheet = withTitleRow(sheets.find((s) => s.name === sheetName) || sheets[0], fields, titles);
  const map = columns && columns.length === sheet.headers.length ? columns : autoMap(sheet.headers, fields, sheet.body);
  const { cols, keys } = fileColumnsFrom(map, fields);
  const rows = stageRows(sheet.body, sheet.firstRow, keys, columnFields(cols, fields));
  const { counts } = checkImport(rows, cols, fields, people);
  const settings: ImportSettings = {
    sheet: sheet.name, sheets: sheets.map((s) => s.name), firstRow: sheet.firstRow, headers: sheet.headers,
    columns: map, newFields: [], fileColumns: cols, onDuplicate,
    ...(!sheet.hasTitles && { titleRow: false }),
  };
  return {
    settings, rows,
    patch: {
      settings, rows, status: approved ? statusFor(counts, onDuplicate) : 'uploaded', error: '',
      total: counts.total, valid: counts.valid, invalid: counts.invalid, duplicates: counts.duplicates,
    } satisfies Partial<ImportBatch>,
  };
}

/** People already in the list, minus those this batch itself created on an earlier (interrupted) submit. */
export function othersThan(people: Associate[], batchId: string, rows: StagedRow[]) {
  const mine = new Set(rows.map((r) => fixedId(`${batchId}:${r.id}`)));
  return { others: people.filter((p) => !mine.has(p.id)), mine };
}

/* ── writing ──────────────────────────────────────────────────────── */

type Op = { method: 'POST' | 'PATCH'; url: string; body: Record<string, unknown> };

/**
 * Runs the writes as PocketBase batches (each one all-or-nothing). If the batch API is switched off,
 * falls back to one request at a time; if it allows fewer requests per batch, uses that size.
 */
export async function runOps(token: string, ops: Op[], onChunk?: (done: number) => void): Promise<void> {
  let size = Math.min(Math.max(ops.length, 1), 1000);
  let useBatch = true;
  let done = 0;
  while (done < ops.length) {
    const chunk = ops.slice(done, done + size);
    if (useBatch) {
      const res = await fetch(`${pbURL()}/api/batch`, {
        method: 'POST',
        headers: { Authorization: token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ requests: chunk }),
        cache: 'no-store',
      }).catch(() => null);
      if (!res) throw new HttpError(502, 'The database server could not be reached.');
      if (res.ok) { done += chunk.length; onChunk?.(done); continue; }
      const data = await res.json().catch(() => ({}));
      const msg = String(data?.message || '');
      const requests = data?.data?.requests;
      // "Batch requests are not allowed." → the batch API is switched off in the PocketBase settings
      if (res.status === 403 && !requests) { useBatch = false; continue; }
      // more requests than the settings allow per batch → {requests: {code: validation_length_too_long, params: {max}}}
      if (res.status === 400 && requests?.code === 'validation_length_too_long') {
        const max = Number(requests.params?.max);
        if (max > 0 && max < size) { size = max; continue; }
        useBatch = false; // max 0 = batches effectively off
        continue;
      }
      // the transaction took longer than the settings allow → smaller transactions (nothing of this one was written)
      if (/timeout|deadline/i.test(msg) && size > 10) { size = Math.ceil(size / 4); continue; }
      // a request in the batch was rejected → {requests: {"<index>": {response: {...}}}} — nothing of this batch was written
      const failed = requests && typeof requests === 'object'
        ? Object.entries(requests as Record<string, any>).find(([k]) => /^\d+$/.test(k)) : undefined;
      const response = failed?.[1]?.response;
      const inner = response?.data && Object.entries(response.data as Record<string, { message?: string }>)[0];
      const who = failed ? (chunk[Number(failed[0])]?.body?.name as string | undefined) : undefined;
      const reason = inner ? `${inner[0]}: ${inner[1]?.message}` : response?.message || msg || `The database answered ${res.status}.`;
      throw new HttpError(400, who ? `“${who}” was rejected (${reason}). Nothing from this group was saved.` : reason);
    }
    for (const op of chunk) {
      await pb(token, op.url, { method: op.method, body: op.body });
      done++;
    }
    onChunk?.(done);
  }
}

/**
 * Submits a batch: checks it again on the server, creates the new fields, extends choice lists,
 * then adds the valid people (and updates matching ones when chosen). Never inserts a duplicate.
 */
export async function submitBatch(token: string, batch: ImportBatch, org: string, who: string): Promise<{ result: SubmitResult; patch: Partial<ImportBatch> }> {
  const settings = batch.settings;
  if (!settings) throw new HttpError(409, 'This import has not been read yet.');
  const own = batch.rows || [];

  const [fields, people] = await Promise.all([loadFields(token), loadPeople(token)]);
  const { others, mine } = othersThan(people, batch.id, own);

  // the approved column mapping: file columns → Associates fields (new ones get their keys settled here;
  // a field this import already created on an interrupted attempt is reused, never created twice)
  const ownField = (f: AssociateField) => f.id === fixedId(`${batch.id}:field:${f.key}`);
  const sync = syncPlan(fileColumnsOf(settings, fields), fields, own, ownField);
  const rows = mapRows(own, sync.keyMap);
  const checks = checkRows(rows, sync.checkFields, others);
  const counts = countChecks(checks);
  const countsPatch = { total: counts.total, valid: counts.valid, invalid: counts.invalid, duplicates: counts.duplicates };

  if (counts.invalid > 0) {
    throw new HttpError(422, `${counts.invalid} ${counts.invalid === 1 ? 'row needs' : 'rows need'} correcting (or removing) before this file can be synced.`, { counts });
  }
  const plan = submitPlan(rows, checks, settings.onDuplicate);
  if (!plan.creates.length && !plan.updates.length) throw new HttpError(422, 'There is nothing to sync: every row is a duplicate or removed.', { counts });
  // remember the settled keys, so a retry uses the same ones
  await saveBatch(token, batch.id, { settings: { ...settings, fileColumns: sync.columns } });

  // 1. fields this import adds (fixed ids: a retry finds them instead of adding them twice)
  let fieldsCreated = 0;
  const byKey = new Map(fields.map((f) => [f.key, f]));
  for (const nf of sync.newFields) {
    if (byKey.has(nf.key)) continue;
    const used = plan.creates.some((r) => r.data[nf.key] !== undefined) || plan.updates.some((u) => u.row.data[nf.key] !== undefined);
    if (!used) continue;
    const created = await pb<AssociateField>(token, '/api/collections/associate_fields/records', {
      method: 'POST', body: { ...nf, id: fixedId(`${batch.id}:field:${nf.key}`), ...(org && { org }) },
    }).catch(async (err) => {
      // the server may not accept a type (e.g. its `type` choices miss one) → keep the column as text
      if (nf.type !== 'text' && err instanceof HttpError && /type/i.test(err.message)) {
        return pb<AssociateField>(token, '/api/collections/associate_fields/records', {
          method: 'POST', body: { ...nf, type: 'text', options: null, id: fixedId(`${batch.id}:field:${nf.key}`), ...(org && { org }) },
        });
      }
      throw err;
    });
    byKey.set(created.key, created);
    fieldsCreated++;
  }

  // 2. choice fields learn the values this import uses
  const real = [...byKey.values()];
  for (const [key, add] of missingChoices(real, [...plan.creates, ...plan.updates.map((u) => u.row)])) {
    const f = byKey.get(key)!;
    await pb(token, `/api/collections/associate_fields/records/${f.id}`, {
      method: 'PATCH', body: { options: { choices: [...(f.options?.choices || []), ...add] } },
    });
  }

  // 3. people — creates with fixed ids (already there from an earlier attempt → counted, not repeated)
  const existingIds = new Set(people.map((p) => p.id));
  const byId = new Map(people.map((p) => [p.id, p]));
  const ops: Op[] = [];
  for (const r of plan.creates) {
    const id = fixedId(`${batch.id}:${r.id}`);
    if (existingIds.has(id) && mine.has(id)) continue; // added by an earlier, interrupted submit
    ops.push({ method: 'POST', url: '/api/collections/associates/records', body: { id, name: r.name, data: r.data, ...(org && { org }) } });
  }
  for (const u of plan.updates) {
    const current = byId.get(u.existingId);
    ops.push({ method: 'PATCH', url: `/api/collections/associates/records/${u.existingId}`, body: { name: u.row.name, data: mergeData(current?.data, u.row.data) } });
  }

  try {
    await runOps(token, ops);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Submitting failed.';
    await saveBatch(token, batch.id, {
      status: 'failed', error: `${message} Nothing was inserted twice: submitting again continues where it stopped.`, ...countsPatch,
    }).catch(() => {});
    throw err instanceof HttpError ? err : new HttpError(502, message);
  }

  const result: SubmitResult = { added: plan.creates.length, updated: plan.updates.length, skipped: plan.skipped, fieldsCreated };
  return {
    result,
    patch: { status: 'submitted', result, error: '', submitted_by: who, submitted_at: new Date().toISOString(), ...countsPatch },
  };
}

/* ── for the route handlers ───────────────────────────────────────── */

/** What the list / upload answers show of a batch (no rows — they can be large). */
export const summary = (b: ImportBatch) => ({
  id: b.id, file_name: b.file_name, status: b.status, total: b.total || 0, valid: b.valid || 0,
  invalid: b.invalid || 0, duplicates: b.duplicates || 0, error: b.error || '', created: b.created, result: b.result || null,
});

export function tokenOf(req: Request) {
  return (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
}

/** Column choices sent by the browser, checked and reduced to the expected shape. */
export function sanitizeColumns(input: unknown, headers: string[]): ColumnMap[] | null {
  if (!Array.isArray(input) || input.length !== headers.length) return null;
  const TYPES = ['text', 'longtext', 'number', 'date', 'email', 'phone', 'url', 'select'];
  const out: ColumnMap[] = [];
  for (let i = 0; i < input.length; i++) {
    const t = (input[i] as any)?.target;
    let target: ColumnMap['target'] = { kind: 'skip' };
    if (t?.kind === 'name') target = { kind: 'name' };
    else if (t?.kind === 'field' && /^[a-z][a-z0-9_]{0,63}$/.test(String(t.key))) target = { kind: 'field', key: String(t.key) };
    else if (t?.kind === 'new' && String(t.label || '').trim()) {
      target = { kind: 'new', label: String(t.label).trim().slice(0, 80), type: TYPES.includes(t.type) ? t.type : 'text' };
    }
    out.push({ index: i, header: headers[i] || `Column ${i + 1}`, target });
  }
  return out;
}
