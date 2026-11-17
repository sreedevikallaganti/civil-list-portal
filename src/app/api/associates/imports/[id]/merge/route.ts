// app/api/associates/imports/[id]/merge/route.ts — merge another file into this one (with the user's approval).
//
// POST { from: "<id of the other file>" }
//   The other file's rows are added to this one. Columns with the same name become one column; the others
//   are added as new columns. Every row is checked again (duplicates between the two files show up as such).
//   The other file is then removed from the imports — its rows now live here. Neither file may be synced yet.
import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/serverAuth';
import { checkImport, fileColumnsOf, mergeFiles, splitImportPath, statusFor } from '@/lib/associateImport';
import { getBatch, HttpError, IMPORTS, loadFields, loadPeople, othersThan, pb, saveBatch, summary, tokenOf } from '@/lib/server/associateImports';

export const runtime = 'nodejs';
export const maxDuration = 120;

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await requireUser(req, 'editor');
  if (user instanceof NextResponse) return user;
  const token = tokenOf(req);
  const { id } = await ctx.params;

  try {
    const body = await req.json().catch(() => ({}));
    const fromId = String(body.from || '');
    if (fromId === id) throw new HttpError(400, 'A file can’t be merged into itself.');
    const [into, from] = await Promise.all([getBatch(token, id), getBatch(token, fromId)]);
    for (const b of [into, from]) {
      const name = splitImportPath(b.file_name).name;
      if (b.status === 'submitted') throw new HttpError(409, `“${name}” has already been synced to Associates and can’t be merged.`);
      if (!b.settings || b.status === 'validating') throw new HttpError(409, `“${name}” hasn’t been read yet.`);
    }

    const [fields, people] = await Promise.all([loadFields(token), loadPeople(token)]);
    const merged = mergeFiles(
      { rows: into.rows || [], cols: fileColumnsOf(into.settings, fields) },
      { rows: from.rows || [], cols: fileColumnsOf(from.settings, fields), name: splitImportPath(from.file_name).name },
    );
    const { counts } = checkImport(merged.rows, merged.cols, fields, othersThan(people, into.id, merged.rows).others);
    const onDuplicate = into.settings!.onDuplicate;

    const saved = await saveBatch(token, id, {
      rows: merged.rows,
      settings: {
        ...into.settings!,
        fileColumns: merged.cols,
        merged: [...(into.settings!.merged || []), { file_name: from.file_name, rows: merged.added }],
      },
      // a file still waiting for approval keeps waiting; an approved one is re-counted
      status: into.status === 'uploaded' ? 'uploaded' : statusFor(counts, onDuplicate),
      error: '',
      total: counts.total, valid: counts.valid, invalid: counts.invalid, duplicates: counts.duplicates,
    });

    // its rows live in this file now
    await pb(token, `/api/collections/${IMPORTS}/records/${from.id}`, { method: 'DELETE' });
    return NextResponse.json({ batch: summary(saved), added: merged.added, columns: merged.cols.length });
  } catch (err) {
    const e = err instanceof HttpError ? err : new HttpError(500, 'The files could not be merged.');
    if (!(err instanceof HttpError)) console.error('[associates/import] merge failed', err);
    return NextResponse.json({ error: e.message }, { status: e.status });
  }
}
