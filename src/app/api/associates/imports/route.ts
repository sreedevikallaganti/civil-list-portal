// app/api/associates/imports/route.ts — upload one Excel / CSV file as a new import batch (a dry run).
//
// POST multipart/form-data: file, force=1 (upload even though the same file was uploaded before),
//   path (optional — the file's place in an uploaded folder, kept as the batch's file_name)
//   1. stores the file in `associate_imports` (status: uploaded)
//   2. reads it on the server (validating) — header row, column choices, cleaned values
//   3. checks every row against the list and itself → draft / ready, with the counts
// Nothing is added to `associates` here; that only happens on submit.
// Several files = several requests (the browser sends them one after another).
import { NextRequest, NextResponse } from 'next/server';
import { orgOfRequest, requireUser } from '@/lib/serverAuth';
import { fileProblem } from '@/lib/associateExcel';
import { cleanImportPath, type ImportBatch } from '@/lib/associateImport';
import {
  HttpError, IMPORTS, loadFields, loadPeople, pb, readSheets, saveBatch, sha256, stage, summary, tokenOf,
} from '@/lib/server/associateImports';

export const runtime = 'nodejs';
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  const user = await requireUser(req, 'editor');
  if (user instanceof NextResponse) return user;
  const token = tokenOf(req);

  const form = await req.formData().catch(() => null);
  const file = form?.get('file');
  if (!(file instanceof File)) return NextResponse.json({ error: 'No file was sent.' }, { status: 400 });
  const problem = fileProblem(file.name, file.size);
  if (problem) return NextResponse.json({ error: problem }, { status: 400 });

  const data = await file.arrayBuffer();
  const hash = sha256(data);
  const org = orgOfRequest(req, user);
  let batchId = '';

  try {
    // the same file again → stop, unless the user said "upload anyway"
    if (form?.get('force') !== '1') {
      const same = await pb<{ items: ImportBatch[] }>(token,
        `/api/collections/${IMPORTS}/records?perPage=1&sort=-created&fields=id,file_name,status,created&filter=${encodeURIComponent(`file_hash = "${hash}" && status != "failed"`)}`);
      if (same.items[0]) {
        return NextResponse.json({
          error: `This file was already uploaded${same.items[0].status === 'submitted' ? ' and submitted' : ''}.`,
          duplicateOf: same.items[0],
        }, { status: 409 });
      }
    }

    const fd = new FormData();
    fd.set('file', new Blob([data], { type: file.type || 'application/octet-stream' }), file.name);
    // from a folder upload: where the file sat in the folder ("Directors/IAS/list.xlsx")
    fd.set('file_name', cleanImportPath(form?.get('path'), file.name));
    fd.set('file_hash', hash);
    fd.set('status', 'uploaded');
    fd.set('uploaded_by', String(user.name || user.email || '').slice(0, 200));
    for (const n of ['total', 'valid', 'invalid', 'duplicates']) fd.set(n, '0');
    if (org) fd.set('org', org);
    const created = await pb<ImportBatch>(token, `/api/collections/${IMPORTS}/records`, { method: 'POST', form: fd });
    batchId = created.id;

    await saveBatch(token, batchId, { status: 'validating' });
    const sheets = readSheets(data);
    const [fields, people] = await Promise.all([loadFields(token), loadPeople(token)]);
    const { patch } = stage(sheets, undefined, undefined, fields, people, 'skip');
    const saved = await saveBatch(token, batchId, patch);
    return NextResponse.json({ batch: summary(saved) }, { status: 201 });
  } catch (err) {
    const e = err instanceof HttpError ? err : new HttpError(500, 'The file could not be processed.');
    if (!(err instanceof HttpError)) console.error('[associates/import] upload failed', err);
    if (batchId) {
      const failed = await saveBatch(token, batchId, { status: 'failed', error: e.message }).catch(() => null);
      return NextResponse.json({ error: e.message, batch: failed ? summary(failed) : { id: batchId } }, { status: e.status });
    }
    return NextResponse.json({ error: e.message }, { status: e.status });
  }
}
