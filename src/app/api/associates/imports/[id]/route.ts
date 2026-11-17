// app/api/associates/imports/[id]/route.ts — save (approve) a file: the user's corrections, removed rows,
// the file's own columns (renamed / added / removed / retyped) and the choice for people already in the list.
// Saving is the user's approval of the dry run: the file goes from "Dry run" to Draft / Ready.
// Everything is checked again HERE (the browser's own check is only for instant feedback) and the
// counts / status stored are the server's.
//
// PUT { rows: StagedRow[], onDuplicate: 'skip' | 'update', columns?: FileColumn[] }
import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/serverAuth';
import {
  checkImport, columnsProblem, fileColumnsOf, isDuplicateAction, pruneRows, sanitizeFileColumns, sanitizeRows, statusFor,
} from '@/lib/associateImport';
import { getBatch, HttpError, loadFields, loadPeople, othersThan, saveBatch, summary, tokenOf } from '@/lib/server/associateImports';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function PUT(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await requireUser(req, 'editor');
  if (user instanceof NextResponse) return user;
  const token = tokenOf(req);
  const { id } = await ctx.params;

  try {
    const body = await req.json().catch(() => ({}));
    const batch = await getBatch(token, id);
    if (batch.status === 'submitted') throw new HttpError(409, 'This file has already been synced to Associates.');
    if (!batch.settings) throw new HttpError(409, 'This file has not been read yet.');
    const [fields, people] = await Promise.all([loadFields(token), loadPeople(token)]);

    // the file's columns: as edited, or as they were
    let cols = fileColumnsOf(batch.settings, fields);
    if (body.columns !== undefined) {
      const edited = sanitizeFileColumns(body.columns);
      if (!edited) throw new HttpError(400, 'The columns could not be read. Reload the page and try again.');
      const problem = columnsProblem(edited);
      if (problem) throw new HttpError(400, problem);
      cols = edited;
    }

    // only rows that are in this file — the browser can correct or remove them, not invent new ones
    const original = new Map((batch.rows || []).map((r) => [r.id, r]));
    let rows = sanitizeRows(body.rows)
      .filter((r) => original.has(r.id))
      .map((r) => {
        const o = original.get(r.id)!;
        return { ...r, row: o.row, ...(o.source && { source: o.source }) };
      });
    for (const r of original.values()) if (!rows.some((x) => x.id === r.id)) rows.push(r);
    rows = pruneRows(rows, cols).sort((a, b) => (Number(a.id.slice(1)) || 0) - (Number(b.id.slice(1)) || 0));

    const onDuplicate = isDuplicateAction(body.onDuplicate) ? body.onDuplicate : batch.settings.onDuplicate;
    const { counts } = checkImport(rows, cols, fields, othersThan(people, batch.id, rows).others);

    const saved = await saveBatch(token, id, {
      rows,
      settings: { ...batch.settings, fileColumns: cols, onDuplicate },
      status: statusFor(counts, onDuplicate),
      error: '',
      total: counts.total, valid: counts.valid, invalid: counts.invalid, duplicates: counts.duplicates,
    });
    return NextResponse.json({ batch: summary(saved), counts });
  } catch (err) {
    const e = err instanceof HttpError ? err : new HttpError(500, 'The file could not be saved.');
    if (!(err instanceof HttpError)) console.error('[associates/import] save failed', err);
    return NextResponse.json({ error: e.message, ...e.extra, pb: undefined }, { status: e.status });
  }
}
