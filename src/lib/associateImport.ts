/* lib/associateImport.ts — bulk import of associates through a staging area (pure: browser + server).

   An uploaded file becomes one *batch* in the `associate_imports` collection:
     uploaded → validating → draft / ready → submitted          (or → failed)
   The batch keeps the original file, its rows (editable) and the column choices. Nothing reaches the
   `associates` collection until the batch is submitted (app/api/associates/imports/[id]/submit).

   The same checks run in the browser (instant feedback while editing) and on the server
   (save draft, submit) — the server never trusts what the browser says about validity. */

import {
  coerceValue, FIELD_TYPES, identity, normalizeHeader, sameReason, toKey,
  type Associate, type AssociateData, type AssociateField, type Cell, type ColumnMap, type FieldInput, type FieldType,
  type Identity,
} from '@/lib/associates';

/* ── types ─────────────────────────────────────────────────────────── */

export const IMPORT_STATUSES = ['uploaded', 'validating', 'draft', 'ready', 'submitted', 'failed'] as const;
export type ImportStatus = (typeof IMPORT_STATUSES)[number];

/* "uploaded" with a dry-run result = checked, but not yet approved (saved) by the user */
export const STATUS_LABEL: Record<ImportStatus, string> = {
  uploaded: 'Dry run',
  validating: 'Validating',
  draft: 'Draft',
  ready: 'Ready for submission',
  submitted: 'Submitted',
  failed: 'Failed',
};

/** One row of the file, as it will be saved (values already cleaned). */
export interface StagedRow {
  /** stable id within the batch: "r" + Excel row number */
  id: string;
  /** the Excel row number */
  row: number;
  name: string;
  data: AssociateData;
  /** taken out of the import by the user (kept, so it can be put back) */
  removed?: boolean;
  /** changed by the user after the upload */
  edited?: boolean;
  /** merged in from another file (its name) */
  source?: string;
}

export type DuplicateAction = 'skip' | 'update';

/** Where a file's column goes when the file is synced into Associates. */
export type SyncTarget =
  | { kind: 'field'; key: string }
  /** a new Associates field named like the column (`key` is settled when the file is synced) */
  | { kind: 'new'; key?: string }
  | { kind: 'skip' };

/** One column of an imported file — its own name and type, editable per file. Rows are keyed by `key`. */
export interface FileColumn {
  key: string;
  label: string;
  type: FieldType;
  target: SyncTarget;
}

export interface ImportSettings {
  sheet: string;
  sheets: string[];
  /** the Excel row number of the first data row */
  firstRow: number;
  headers: string[];
  /** how the Excel columns were read (name / a column / left out) */
  columns: ColumnMap[];
  /** imports from before per-file columns: the fields they create (rows keyed by Associates keys) */
  newFields: FieldInput[];
  /** this file's own columns (rename / add / remove per file) and where each one syncs to */
  fileColumns?: FileColumn[];
  /** files merged into this one */
  merged?: { file_name: string; rows: number }[];
  /** false = the file had no column titles: its first row is a person and the columns were read in the template's
      order (Name, Department, Cadre, Designation, Batch year, …). Missing = it had titles. */
  titleRow?: boolean;
  /** what happens to people already in the Associates list */
  onDuplicate: DuplicateAction;
}

export interface SubmitResult {
  added: number;
  updated: number;
  skipped: number;
  fieldsCreated: number;
  /** submission stopped part-way (submitting again continues safely) */
  partial?: boolean;
}

export interface ImportBatch {
  id: string;
  file_name: string;
  file?: string;
  file_hash?: string;
  status: ImportStatus;
  settings: ImportSettings | null;
  rows: StagedRow[] | null;
  total: number;
  valid: number;
  invalid: number;
  duplicates: number;
  result?: SubmitResult | null;
  error?: string;
  uploaded_by?: string;
  submitted_by?: string;
  submitted_at?: string;
  created?: string;
  updated?: string;
  collectionId?: string;
}

export type RowIssue = { level: 'error' | 'warning'; field?: string; message: string };

export type DuplicateOf =
  | { kind: 'file'; rowId: string; row: number; reason: string }
  | { kind: 'existing'; id: string; name: string; reason: string };

export interface RowCheck {
  status: 'valid' | 'invalid' | 'duplicate' | 'removed';
  issues: RowIssue[];
  duplicateOf?: DuplicateOf;
}

export interface ImportCounts {
  total: number;
  valid: number;
  invalid: number;
  duplicates: number;
  removed: number;
}

export const MAX_IMPORT_ROWS = 20000;

/* ── staging ───────────────────────────────────────────────────────── */

/** The list's fields plus the ones this import will create (with a placeholder id). */
export function stagingFields(fields: AssociateField[], newFields: FieldInput[]): AssociateField[] {
  const known = new Set(fields.map((f) => f.key));
  return [...fields, ...newFields.filter((f) => !known.has(f.key)).map((f) => ({ ...f, id: `new:${f.key}` }))];
}

/** The key each column goes into ('name', a field key), from the column choices and the new fields. */
export function columnKeys(columns: ColumnMap[], newFields: FieldInput[]): Map<number, string> {
  const keys = new Map<number, string>();
  const byLabel = new Map(newFields.map((f) => [normalizeHeader(f.label), f.key]));
  for (const c of columns) {
    if (c.target.kind === 'name') keys.set(c.index, 'name');
    else if (c.target.kind === 'field') keys.set(c.index, c.target.key);
    else if (c.target.kind === 'new') {
      const key = byLabel.get(normalizeHeader(c.target.label));
      if (key) keys.set(c.index, key);
    }
  }
  return keys;
}

const isBlank = (c: Cell) => c === null || c === undefined || String(c).trim() === '';

/**
 * The sheet's rows as staged rows. Values are cleaned for their field type; a value that doesn't fit
 * is kept as typed (the check flags it, so it can be corrected). Completely empty rows are dropped;
 * rows without a name are kept — they show up as invalid, to be fixed or removed.
 */
export function stageRows(body: Cell[][], firstRow: number, keys: Map<number, string>, fields: AssociateField[]): StagedRow[] {
  const byKey = new Map(fields.map((f) => [f.key, f]));
  const rows: StagedRow[] = [];
  body.forEach((cells, i) => {
    if (!cells || cells.every(isBlank)) return;
    const row = firstRow + i;
    let name = '';
    const data: AssociateData = {};
    for (const [col, key] of keys) {
      if (key === 'name') {
        name = String(coerceValue('text', cells[col]).value).replace(/\s+/g, ' ').slice(0, 200);
        continue;
      }
      const f = byKey.get(key);
      if (!f) continue;
      const { value } = coerceValue(f.type, cells[col]);
      if (value !== '') data[key] = value;
    }
    // a row with nothing mapped in it (only skipped columns had values) isn't a person
    if (!name && !Object.keys(data).length) return;
    rows.push({ id: `r${row}`, row, name, data });
  });
  return rows.slice(0, MAX_IMPORT_ROWS);
}

/* ── checking ──────────────────────────────────────────────────────── */

/** Finds people by ID, email, phone or name without comparing every pair (fast for big files). */
class IdentityIndex<T> {
  private by = new Map<string, { ref: T; id: Identity }[]>();

  /* A name alone only matches when one side has no email / phone (see sameReason), so names live in two lists:
     everyone with that name (n:), and only those without contact details (n0:). Someone WITH contact details
     only needs n0: — this keeps very common names from turning every lookup into a scan. */
  add(id: Identity, ref: T) {
    const keys = [...id.ids.map((x) => `i:${x}`), ...id.emails.map((x) => `e:${x}`), ...id.phones.map((x) => `p:${x}`)];
    if (id.name) {
      keys.push(`n:${id.name}`);
      if (!id.emails.length && !id.phones.length) keys.push(`n0:${id.name}`);
    }
    for (const k of keys) {
      const list = this.by.get(k);
      if (list) list.push({ ref, id });
      else this.by.set(k, [{ ref, id }]);
    }
  }

  find(id: Identity): { ref: T; reason: string } | null {
    const keys = [...id.ids.map((x) => `i:${x}`), ...id.emails.map((x) => `e:${x}`), ...id.phones.map((x) => `p:${x}`)];
    if (id.name) keys.push(!id.emails.length && !id.phones.length ? `n:${id.name}` : `n0:${id.name}`);
    for (const k of keys) {
      for (const c of this.by.get(k) || []) {
        const reason = sameReason(c.id, id);
        if (reason) return { ref: c.ref, reason };
      }
    }
    return null;
  }
}

const REASON: Record<string, string> = { id: 'same ID', email: 'same email', phone: 'same phone', name: 'same name' };

/**
 * Checks every row: required values, values that don't fit their field (invalid email, phone, date …),
 * the same person twice in the file, and people already in the Associates list.
 *   invalid   → has an error; can't be submitted until corrected or removed
 *   duplicate → the same person as an earlier row, or already in the list; never inserted again
 */
export function checkRows(rows: StagedRow[], fields: AssociateField[], existing: Associate[]): Map<string, RowCheck> {
  const out = new Map<string, RowCheck>();
  const people = new IdentityIndex<Associate>();
  for (const a of existing) people.add(identity(a.name, a.data || {}, fields), a);
  const earlier = new IdentityIndex<StagedRow>();

  for (const r of rows) {
    if (r.removed) { out.set(r.id, { status: 'removed', issues: [] }); continue; }
    const issues: RowIssue[] = [];
    if (!r.name.trim()) issues.push({ level: 'error', field: 'name', message: 'Name is missing' });

    for (const f of fields) {
      const v = r.data?.[f.key];
      const empty = v === undefined || v === null || String(v).trim() === '';
      if (empty) {
        if (f.required) issues.push({ level: 'error', field: f.key, message: `${f.label} is required` });
        continue;
      }
      const { warning } = coerceValue(f.type, v as Cell);
      if (warning) issues.push({ level: 'error', field: f.key, message: `${f.label} "${v}" ${warning}` });
    }

    const id = identity(r.name, r.data || {}, fields);
    let duplicateOf: DuplicateOf | undefined;
    const twin = earlier.find(id);
    if (twin) duplicateOf = { kind: 'file', rowId: twin.ref.id, row: twin.ref.row, reason: REASON[twin.reason] };
    else {
      const known = people.find(id);
      if (known) duplicateOf = { kind: 'existing', id: known.ref.id, name: known.ref.name, reason: REASON[known.reason] };
    }
    if (duplicateOf) {
      issues.push({
        level: 'warning',
        message: duplicateOf.kind === 'file'
          ? `Same person as row ${duplicateOf.row} (${duplicateOf.reason})`
          : `Already in Associates as ${duplicateOf.name} (${duplicateOf.reason})`,
      });
    }
    // only rows that will really go in count as "seen" — a removed or broken row doesn't hide the next one
    if (!issues.some((i) => i.level === 'error') && !twin) earlier.add(id, r);

    const status = issues.some((i) => i.level === 'error') ? 'invalid' : duplicateOf ? 'duplicate' : 'valid';
    out.set(r.id, { status, issues, duplicateOf });
  }
  return out;
}

export function countChecks(checks: Map<string, RowCheck>): ImportCounts {
  const c: ImportCounts = { total: 0, valid: 0, invalid: 0, duplicates: 0, removed: 0 };
  for (const x of checks.values()) {
    if (x.status === 'removed') { c.removed++; continue; }
    c.total++;
    if (x.status === 'valid') c.valid++;
    else if (x.status === 'invalid') c.invalid++;
    else c.duplicates++;
  }
  return c;
}

/** Draft until every row is fine and there is something to submit. */
export function statusFor(counts: ImportCounts, onDuplicate: DuplicateAction): ImportStatus {
  if (counts.invalid > 0) return 'draft';
  return counts.valid > 0 || (onDuplicate === 'update' && counts.duplicates > 0) ? 'ready' : 'draft';
}

/** What submitting does with each row. Duplicates are never inserted. */
export function submitPlan(rows: StagedRow[], checks: Map<string, RowCheck>, onDuplicate: DuplicateAction) {
  const creates: StagedRow[] = [];
  const updates: { row: StagedRow; existingId: string }[] = [];
  let skipped = 0;
  for (const r of rows) {
    const c = checks.get(r.id);
    if (!c || c.status === 'removed' || c.status === 'invalid') continue;
    if (c.status === 'valid') creates.push(r);
    else if (c.duplicateOf?.kind === 'existing' && onDuplicate === 'update') updates.push({ row: r, existingId: c.duplicateOf.id });
    else skipped++;
  }
  return { creates, updates, skipped };
}

/* ── input from the browser (server side) ─────────────────────────── */

const clip = (v: unknown, max: number) => String(v ?? '').slice(0, max);

/** Rows sent by the browser, reduced to the shape above (anything else is dropped). */
export function sanitizeRows(input: unknown): StagedRow[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<string>();
  const out: StagedRow[] = [];
  for (const r of input.slice(0, MAX_IMPORT_ROWS)) {
    if (!r || typeof r !== 'object') continue;
    const x = r as Record<string, unknown>;
    const id = clip(x.id, 20);
    if (!/^r\d{1,7}$/.test(id) || seen.has(id)) continue;
    seen.add(id);
    const data: AssociateData = {};
    if (x.data && typeof x.data === 'object') {
      for (const [k, v] of Object.entries(x.data as Record<string, unknown>).slice(0, 200)) {
        if (!/^[a-z][a-z0-9_]{0,63}$/.test(k)) continue;
        if (typeof v === 'number' && Number.isFinite(v)) data[k] = v;
        else if (typeof v === 'string' && v.trim()) data[k] = v.trim().slice(0, 5000);
      }
    }
    out.push({
      id,
      row: Math.max(0, Math.floor(Number(x.row) || 0)),
      name: clip(x.name, 200).replace(/\s+/g, ' ').trim(),
      data,
      ...(x.removed === true && { removed: true }),
      ...(x.edited === true && { edited: true }),
    });
  }
  return out;
}

export const isDuplicateAction = (v: unknown): v is DuplicateAction => v === 'skip' || v === 'update';

/* ── per-file columns ─────────────────────────────────────────────────────────────────────────────
   Every file keeps its own columns (named as in the file, editable: rename, add, remove, change type).
   Nothing about them touches the Associates fields until the file is synced: then each column goes into
   an existing field, becomes a new field, or is left out — the user approves that mapping (syncPlan). */

export const MAX_FILE_COLUMNS = 150;

/** The file's columns, read from the Excel column choices; `keys` = Excel column index → column key. */
export function fileColumnsFrom(columns: ColumnMap[], listFields: AssociateField[]): { cols: FileColumn[]; keys: Map<number, string> } {
  const byKey = new Map(listFields.map((f) => [f.key, f]));
  const used = new Set<string>();
  const cols: FileColumn[] = [];
  const keys = new Map<number, string>();
  for (const c of columns) {
    if (c.target.kind === 'name') { keys.set(c.index, 'name'); continue; }
    if (c.target.kind === 'skip') continue;
    const header = String(c.header || '').trim();
    let col: FileColumn;
    const f = c.target.kind === 'field' ? byKey.get(c.target.key) : undefined;
    if (f) {
      // matched to an Associates field: keep the file's own name, sync to that field by default
      const key = used.has(f.key) ? toKey(header || f.label, used) : f.key;
      col = { key, label: (header || f.label).slice(0, 80), type: f.type, target: { kind: 'field', key: f.key } };
    } else {
      const label = (c.target.kind === 'new' ? c.target.label : header) || `Column ${c.index + 1}`;
      col = { key: toKey(label, used), label: label.slice(0, 80), type: c.target.kind === 'new' ? c.target.type : 'text', target: { kind: 'new' } };
    }
    used.add(col.key);
    cols.push(col);
    keys.set(c.index, col.key);
  }
  return { cols, keys };
}

/** A batch's columns — imports from before per-file columns get theirs from the Excel choices + new fields. */
export function fileColumnsOf(settings: ImportSettings | null | undefined, listFields: AssociateField[]): FileColumn[] {
  if (!settings) return [];
  if (Array.isArray(settings.fileColumns)) return settings.fileColumns;
  const byKey = new Map(listFields.map((f) => [f.key, f]));
  const byLabel = new Map((settings.newFields || []).map((f) => [normalizeHeader(f.label), f]));
  const out: FileColumn[] = [];
  for (const c of settings.columns || []) {
    if (c.target.kind === 'field') {
      const f = byKey.get(c.target.key);
      if (f && !out.some((x) => x.key === f.key)) out.push({ key: f.key, label: f.label, type: f.type, target: { kind: 'field', key: f.key } });
    } else if (c.target.kind === 'new') {
      const nf = byLabel.get(normalizeHeader(c.target.label));
      if (nf && !out.some((x) => x.key === nf.key)) out.push({ key: nf.key, label: nf.label, type: nf.type, target: { kind: 'new', key: nf.key } });
    }
  }
  return out;
}

/** The file's columns as fields (for showing, editing and cleaning values). */
export function columnFields(cols: FileColumn[], listFields: AssociateField[]): AssociateField[] {
  const byKey = new Map(listFields.map((f) => [f.key, f]));
  return cols.map((c, i) => {
    const target = c.target.kind === 'field' ? byKey.get(c.target.key) : undefined;
    return {
      id: `col:${c.key}`, key: c.key, label: c.label, type: c.type, required: !!target?.required,
      options: c.type === 'select' ? target?.options ?? null : null, show_in_table: true, sort_order: i,
    };
  });
}

export interface SyncPlan {
  /** column key → Associates field key */
  keyMap: Map<string, string>;
  /** Associates fields the sync creates */
  newFields: FieldInput[];
  /** the fields the rows are checked against once mapped (the list's + the new ones) */
  checkFields: AssociateField[];
  /** the columns with every new field's key settled */
  columns: FileColumn[];
}

/**
 * Where each column goes on sync. A column whose field no longer exists, or a second column aimed at the
 * same field, becomes a new field. `own` tells a field this very import created on an earlier
 * (interrupted) sync — it is reused instead of being created again.
 */
export function syncPlan(cols: FileColumn[], listFields: AssociateField[], rows: StagedRow[] = [], own?: (f: AssociateField) => boolean): SyncPlan {
  const byKey = new Map(listFields.map((f) => [f.key, f]));
  const taken = new Set(listFields.map((f) => f.key));
  const aimed = new Set<string>();
  const keyMap = new Map<string, string>();
  const newFields: FieldInput[] = [];
  const labels = new Map<string, string>();
  const columns: FileColumn[] = [];
  let order = Math.max(-1, ...listFields.map((f) => f.sort_order ?? 0)) + 1;
  let shown = listFields.filter((f) => f.show_in_table).length;

  for (const c of cols) {
    if (c.target.kind === 'skip') { columns.push(c); continue; }
    if (c.target.kind === 'field' && byKey.has(c.target.key) && !aimed.has(c.target.key)) {
      aimed.add(c.target.key);
      keyMap.set(c.key, c.target.key);
      labels.set(c.target.key, c.label);
      columns.push(c);
      continue;
    }
    // a new field (or one that has to become new)
    const wanted = c.target.kind === 'new' ? c.target.key : undefined;
    const existing = wanted ? byKey.get(wanted) : undefined;
    if (wanted && existing && own?.(existing) && !aimed.has(wanted)) {
      aimed.add(wanted);
      keyMap.set(c.key, wanted);
      labels.set(wanted, c.label);
      columns.push({ ...c, target: { kind: 'new', key: wanted } });
      continue;
    }
    const key = wanted && !taken.has(wanted) && /^[a-z][a-z0-9_]{0,63}$/.test(wanted) ? wanted : toKey(c.label, taken);
    taken.add(key);
    aimed.add(key);
    keyMap.set(c.key, key);
    const choices = c.type === 'select'
      ? [...new Set(rows.map((r) => String(r.data?.[c.key] ?? '').trim()).filter(Boolean))].slice(0, 50)
      : undefined;
    const show = shown < 6 && c.type !== 'longtext';
    if (show) shown++;
    newFields.push({
      key, label: c.label, type: c.type, required: false, show_in_table: show, sort_order: order++,
      options: choices ? { choices } : null,
    });
    columns.push({ ...c, target: { kind: 'new', key } });
  }

  const checkFields: AssociateField[] = [
    ...listFields.map((f) => (labels.has(f.key) ? { ...f, label: labels.get(f.key)! } : f)),
    ...newFields.map((f) => ({ ...f, id: `new:${f.key}` })),
  ];
  return { keyMap, newFields, checkFields, columns };
}

/** Rows with their values under the Associates keys the columns sync to (left-out columns dropped). */
export function mapRows(rows: StagedRow[], keyMap: Map<string, string>): StagedRow[] {
  return rows.map((r) => {
    const data: AssociateData = {};
    for (const [k, v] of Object.entries(r.data || {})) {
      const to = keyMap.get(k);
      if (to) data[to] = v;
    }
    return { ...r, data };
  });
}

/**
 * The dry run of a file with its own columns: the rows are mapped the way they would be synced, then
 * checked like before (values, required fields, duplicates in the file and in Associates). Problems
 * point back at the file's own column keys.
 */
export function checkImport(rows: StagedRow[], cols: FileColumn[], listFields: AssociateField[], people: Associate[]) {
  const plan = syncPlan(cols, listFields, rows);
  const checks = checkRows(mapRows(rows, plan.keyMap), plan.checkFields, people);
  const back = new Map([...plan.keyMap].map(([from, to]) => [to, from]));
  for (const c of checks.values()) {
    for (const i of c.issues) if (i.field && back.has(i.field)) i.field = back.get(i.field);
  }
  return { checks, counts: countChecks(checks), plan };
}

/** Columns sent by the browser, checked and reduced to the expected shape (null = unusable). */
export function sanitizeFileColumns(input: unknown): FileColumn[] | null {
  if (!Array.isArray(input) || input.length > MAX_FILE_COLUMNS) return null;
  const KEY = /^[a-z][a-z0-9_]{0,63}$/;
  const seen = new Set<string>();
  const out: FileColumn[] = [];
  for (const raw of input) {
    const x = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
    const key = String(x.key ?? '');
    const label = String(x.label ?? '').replace(/\s+/g, ' ').trim().slice(0, 80);
    if (!KEY.test(key) || key === 'name' || seen.has(key) || !label) return null;
    seen.add(key);
    const type = (FIELD_TYPES as readonly string[]).includes(String(x.type)) ? (x.type as FieldType) : 'text';
    const t = (x.target && typeof x.target === 'object' ? x.target : {}) as Record<string, unknown>;
    let target: SyncTarget = { kind: 'new' };
    if (t.kind === 'skip') target = { kind: 'skip' };
    else if (t.kind === 'field' && KEY.test(String(t.key))) target = { kind: 'field', key: String(t.key) };
    else if (t.kind === 'new' && KEY.test(String(t.key ?? ''))) target = { kind: 'new', key: String(t.key) };
    out.push({ key, label, type, target });
  }
  return out;
}

/** Problems with a set of columns the user edited ('' = fine). */
export function columnsProblem(cols: FileColumn[]): string {
  const seen = new Set<string>();
  for (const c of cols) {
    const n = normalizeHeader(c.label);
    if (!n) return 'Every column needs a name.';
    if (n === 'name' || n === 'full name') return `“${c.label}” — the Name column is always there; choose another name.`;
    if (seen.has(n)) return `Two columns are called “${c.label}”.`;
    seen.add(n);
  }
  return '';
}

/** Rows without values for columns that no longer exist. */
export function pruneRows(rows: StagedRow[], cols: FileColumn[]): StagedRow[] {
  const keep = new Set(cols.map((c) => c.key));
  return rows.map((r) => {
    const data: AssociateData = {};
    for (const [k, v] of Object.entries(r.data || {})) if (keep.has(k)) data[k] = v;
    return { ...r, data };
  });
}

/**
 * Merges another file's rows into this one. Columns with the same name become one column; the others are
 * added. Merged rows get new ids after this file's own (their Excel row number is kept, with the file name).
 */
export function mergeFiles(
  into: { rows: StagedRow[]; cols: FileColumn[] },
  from: { rows: StagedRow[]; cols: FileColumn[]; name: string },
): { rows: StagedRow[]; cols: FileColumn[]; added: number } {
  const cols = [...into.cols];
  const byName = new Map(cols.map((c) => [normalizeHeader(c.label), c.key]));
  // columns that go into the same Associates field are one column, whatever each file calls them ("Dept" = "Department")
  const byField = new Map(cols.flatMap((c) => (c.target.kind === 'field' ? [[c.target.key, c.key] as const] : [])));
  const used = new Set(cols.map((c) => c.key));
  const colMap = new Map<string, string>();
  for (const c of from.cols) {
    const same = byName.get(normalizeHeader(c.label)) ?? (c.target.kind === 'field' ? byField.get(c.target.key) : undefined);
    if (same) { colMap.set(c.key, same); continue; }
    if (cols.length >= MAX_FILE_COLUMNS) continue;
    const key = toKey(c.label, used);
    used.add(key);
    cols.push({ ...c, key, target: c.target.kind === 'new' ? { kind: 'new' } : c.target });
    byName.set(normalizeHeader(c.label), key);
    if (c.target.kind === 'field') byField.set(c.target.key, key);
    colMap.set(c.key, key);
  }

  let next = Math.max(0, ...into.rows.map((r) => Number(r.id.slice(1)) || 0)) + 1;
  const rows = [...into.rows];
  let added = 0;
  for (const r of from.rows) {
    if (r.removed || rows.length >= MAX_IMPORT_ROWS || next > 9_999_999) continue;
    const data: AssociateData = {};
    for (const [k, v] of Object.entries(r.data || {})) {
      const to = colMap.get(k);
      if (to) data[to] = v;
    }
    rows.push({ id: `r${next++}`, row: r.row, name: r.name, data, source: r.source || from.name, ...(r.edited && { edited: true }) });
    added++;
  }
  return { rows, cols, added };
}

/* ── Folders ────────────────────────────────────────────────────────────────────────────────────
   A folder upload keeps each file's place in the folder: the batch's `file_name` is the relative
   path ("Directors/IAS/2020 list.xlsx"), so no extra collection or field is needed. */

/** A safe relative path: forward slashes, no "." / ".." / empty parts, at most 255 characters
    (the file name itself always survives). Falls back to `fileName` when nothing usable is left. */
export function cleanImportPath(path: unknown, fileName: string): string {
  const name = fileName.replace(/[\\/]/g, '_').trim() || 'file';
  const parts = String(path ?? '').replace(/\\/g, '/').split('/')
    .map((p) => p.replace(/[\u0000-\u001f]/g, '').trim())
    .filter((p) => p && p !== '.' && p !== '..');
  parts.pop(); // the last part is the file — use the real name
  let folders = parts;
  while (folders.length && [...folders, name].join('/').length > 255) folders = folders.slice(1);
  return [...folders, name].join('/').slice(-255);
}

/** "A/B/list.xlsx" → { folder: "A/B", name: "list.xlsx" } */
export function splitImportPath(fileName: string): { folder: string; name: string } {
  const i = fileName.lastIndexOf('/');
  return i < 0 ? { folder: '', name: fileName } : { folder: fileName.slice(0, i), name: fileName.slice(i + 1) };
}

/** Every folder and parent folder in the list, sorted ("A", "A/B", "C"). */
export function importFolders(fileNames: string[]): string[] {
  const out = new Set<string>();
  for (const f of fileNames) {
    const parts = splitImportPath(f).folder.split('/').filter(Boolean);
    for (let i = 1; i <= parts.length; i++) out.add(parts.slice(0, i).join('/'));
  }
  return [...out].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base', numeric: true }));
}

/** Is this file inside `folder` (or one of its subfolders)? '' = every file. */
export function inImportFolder(fileName: string, folder: string): boolean {
  if (!folder) return true;
  const own = splitImportPath(fileName).folder;
  return own === folder || own.startsWith(folder + '/');
}

/** The folders directly inside `folder` ('' = the top level), from a list of folder paths. */
export function childFolders(folder: string, all: string[]): string[] {
  const depth = folder ? folder.split('/').length + 1 : 1;
  return all.filter((f) => f.split('/').length === depth && (folder ? f.startsWith(folder + '/') : true));
}

/** A file's path after its folder `from` (or a parent of it) is renamed / moved to `to`. */
export function movePath(fileName: string, from: string, to: string): string {
  if (!from) return to ? `${to}/${fileName}` : fileName;
  if (fileName === from) return to;
  if (!fileName.startsWith(from + '/')) return fileName;
  const rest = fileName.slice(from.length + 1);
  return to ? `${to}/${rest}` : rest;
}

/** What is wrong with a folder name the user typed ('' = fine). */
export function folderNameProblem(name: string, siblings: string[]): string {
  const n = name.trim();
  if (!n) return 'Give the folder a name.';
  if (n.length > 80) return 'Keep the name under 80 characters.';
  if (/[\\/]/.test(n) || n === '.' || n === '..') return 'A folder name can’t contain / or \\.';
  if (siblings.some((s) => s.toLowerCase() === n.toLowerCase())) return 'There is already a folder with that name here.';
  return '';
}

/** Files a folder upload leaves out without complaint: hidden / system files and Excel's "~$" lock files. */
export function isJunkFile(name: string): boolean {
  return /^(\.|~\$)/.test(name) || /^(desktop\.ini|thumbs\.db)$/i.test(name);
}
