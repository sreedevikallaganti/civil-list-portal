// app/api/associates/imports/[id]/columns/route.ts — change which sheet / what each column goes into.
// Reads the stored original file again and rebuilds the rows (corrections made so far are replaced —
// the page warns about that before calling this).
//
// POST { sheet?: string, columns?: ColumnMap[], titleRow?: boolean }
//   no columns = guess them again for that sheet · titleRow = whether the first row holds column titles
import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/serverAuth';
import { mappingError } from '@/lib/associates';
import { withTitleRow } from '@/lib/associateExcel';
import {
  downloadBatchFile, getBatch, HttpError, loadFields, loadPeople, readSheets, sanitizeColumns, saveBatch, stage, summary, tokenOf,
} from '@/lib/server/associateImports';

export const runtime = 'nodejs';
export const maxDuration = 120;

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await requireUser(req, 'editor');
  if (user instanceof NextResponse) return user;
  const token = tokenOf(req);
  const { id } = await ctx.params;

  try {
    const body = await req.json().catch(() => ({}));
    const batch = await getBatch(token, id);
    if (batch.status === 'submitted') throw new HttpError(409, 'This import has already been submitted.');

    const sheets = readSheets(await downloadBatchFile(token, batch));
    const sheetName = typeof body.sheet === 'string' ? body.sheet : batch.settings?.sheet;
    const raw = sheets.find((s) => s.name === sheetName) || sheets[0];
    const [fields, people] = await Promise.all([loadFields(token), loadPeople(token)]);
    // with or without a title row: as the user says, else as it was read before (or guessed)
    const titleChange = typeof body.titleRow === 'boolean' && body.titleRow !== (batch.settings?.titleRow !== false);
    const titles: 'auto' | boolean = typeof body.titleRow === 'boolean' ? body.titleRow
      : batch.settings && raw.name === batch.settings.sheet ? batch.settings.titleRow !== false : 'auto';
    const sheet = withTitleRow(raw, fields, titles);
    // a different sheet, or the title row switched → its columns are guessed afresh
    const sameColumns = sheet.name === batch.settings?.sheet && !titleChange;
    const columns = sameColumns && body.columns ? sanitizeColumns(body.columns, sheet.headers) : null;
    if (body.columns && sameColumns && !columns) throw new HttpError(400, 'The column choices do not match the file.');
    if (columns) {
      const problem = mappingError(columns);
      if (problem) throw new HttpError(400, problem);
    }

    // reading again is a new dry run; a file the user had already approved stays approved
    const approved = !!batch.settings && batch.status !== 'uploaded';
    const { patch } = stage(sheets, sheet.name, columns || undefined, fields, people, batch.settings?.onDuplicate || 'skip', approved, titles);
    const saved = await saveBatch(token, id, patch);
    return NextResponse.json({ batch: summary(saved) });
  } catch (err) {
    const e = err instanceof HttpError ? err : new HttpError(500, 'The columns could not be changed.');
    if (!(err instanceof HttpError)) console.error('[associates/import] columns failed', err);
    return NextResponse.json({ error: e.message }, { status: e.status });
  }
}
