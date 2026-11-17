// app/api/associates/imports/[id]/submit/route.ts — the final step: sync a file into Associates.
//
// POST { columns?: FileColumn[] }   — the column mapping the admin approved (where each column goes:
//   an existing field, a new field, or left out). Without it, the file's saved mapping is used.
// Admins only: editors upload, correct and save files; an admin approves the sync.
// The file must have been saved (approved) first — a bare dry run can't be synced.
// The rows are checked again on the server; any invalid row stops the sync. Duplicates are never
// inserted (skipped, or — when the file says so — used to update the existing person).
// Safe to repeat: rows have fixed record ids, so a retry continues instead of adding people twice.
import { NextRequest, NextResponse } from 'next/server';
import { orgOfRequest, requireUser } from '@/lib/serverAuth';
import { sanitizeFileColumns } from '@/lib/associateImport';
import { getBatch, HttpError, saveBatch, submitBatch, summary, tokenOf } from '@/lib/server/associateImports';

export const runtime = 'nodejs';
export const maxDuration = 300;

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await requireUser(req, 'admin');
  if (user instanceof NextResponse) return user;
  const token = tokenOf(req);
  const { id } = await ctx.params;

  try {
    const body = await req.json().catch(() => ({}));
    let batch = await getBatch(token, id);
    if (batch.status === 'submitted') throw new HttpError(409, 'This file has already been synced to Associates.');
    if (batch.status === 'validating' || (batch.status === 'uploaded' && !batch.settings)) {
      throw new HttpError(409, 'This file is still being read. Try again in a moment.');
    }
    if (batch.status === 'uploaded') throw new HttpError(409, 'Save (approve) the dry run of this file first.');

    // the approved mapping — only where columns go may change here, not the columns themselves
    if (body.columns !== undefined && batch.settings) {
      const sent = sanitizeFileColumns(body.columns);
      const current = batch.settings.fileColumns;
      if (!sent || (current && (sent.length !== current.length || sent.some((c, i) => c.key !== current[i].key)))) {
        throw new HttpError(400, 'The columns changed since the page was opened. Reload and try again.');
      }
      const merged = current ? current.map((c, i) => ({ ...c, target: sent[i].target })) : sent;
      batch = await saveBatch(token, id, { settings: { ...batch.settings, fileColumns: merged } });
    }

    const { result, patch } = await submitBatch(token, batch, orgOfRequest(req, user), String(user.name || user.email || ''));
    const saved = await saveBatch(token, id, patch);
    return NextResponse.json({ result, batch: summary(saved) });
  } catch (err) {
    const e = err instanceof HttpError ? err : new HttpError(500, 'The file could not be synced.');
    if (!(err instanceof HttpError)) console.error('[associates/import] submit failed', err);
    return NextResponse.json({ error: e.message, counts: e.extra.counts }, { status: e.status });
  }
}
