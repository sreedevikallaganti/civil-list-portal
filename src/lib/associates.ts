/* lib/associates.ts — the Associates list: directors and other senior officials.

   Kept apart from employees / officers / other contacts (pb_migrations/1790900000_associates.js):
     associate_fields  the list's columns — created, renamed, reordered and deleted by users
     associates        one person per record: `name` + `data` (values keyed by field key)

   Everything here is pure (no PocketBase, no browser) so it is unit tested
   (src/lib/__tests__/associates.test.ts). Reading / writing Excel files lives in
   associateExcel.ts, the PocketBase calls in associatesApi.ts. */

import { parsePhoneNumberFromString } from 'libphonenumber-js/max';

/* ── types ─────────────────────────────────────────────────────────── */

export const FIELD_TYPES = ['text', 'longtext', 'number', 'date', 'email', 'phone', 'url', 'select'] as const;
export type FieldType = (typeof FIELD_TYPES)[number];

export const FIELD_TYPE_LABEL: Record<FieldType, string> = {
  text: 'Text',
  longtext: 'Long text',
  number: 'Number',
  date: 'Date',
  email: 'Email',
  phone: 'Phone',
  url: 'Link',
  select: 'Choice',
};

export interface AssociateField {
  id: string;
  key: string;
  label: string;
  type: FieldType;
  options?: { choices?: string[] } | null;
  required?: boolean;
  show_in_table?: boolean;
  sort_order?: number;
}

export type FieldInput = Omit<AssociateField, 'id'>;

export type AssociateData = Record<string, string | number>;

export interface Associate {
  id: string;
  name: string;
  data: AssociateData | null;
  created?: string;
  updated?: string;
}

/** A cell as SheetJS hands it over (raw values, dates as Date). */
export type Cell = string | number | boolean | Date | null | undefined;

/* ── fields ────────────────────────────────────────────────────────── */

/** Fields offered when the list is empty and nobody has imported a sheet yet. */
/** The standard fields of the list (besides Name): always shown, and the columns of the Excel template. */
export const SUGGESTED_FIELDS: FieldInput[] = [
  { key: 'cadre', label: 'Cadre', type: 'text', show_in_table: true },
  { key: 'batch', label: 'Batch year', type: 'number', show_in_table: true },
  { key: 'designation', label: 'Designation', type: 'text', show_in_table: true },
  { key: 'department', label: 'Department', type: 'text', show_in_table: true },
].map((f, i) => ({ ...f, required: false, sort_order: i } as FieldInput));

/** Ways the standard fields are written ("Batch no.", "Batch year", "Dept" …). */
const CORE_NAMES: Record<string, string[]> = {
  cadre: ['cadre', 'statecadre', 'cadrestate'],
  batch: ['batch', 'batchyear', 'batchno', 'yearofbatch', 'yearofallotment', 'allotmentyear'],
  designation: ['designation', 'post', 'position', 'currentposition', 'currentpost'],
  department: ['department', 'dept', 'ministry', 'ministrydepartment'],
};

/** Which standard field this is ('' = not one of them). */
export function coreFieldOf(f: Pick<AssociateField, 'key' | 'label'>): string {
  const names = [normalizeHeader(f.label), normalizeHeader(f.key)];
  return Object.entries(CORE_NAMES).find(([, list]) => names.some((n) => list.includes(n)))?.[0] || '';
}

/** Has anyone a value for this field? */
export const fieldInUse = (f: AssociateField, people: Pick<Associate, 'data'>[]) =>
  people.some((p) => {
    const v = p.data?.[f.key];
    return v !== undefined && v !== null && String(v).trim() !== '';
  });

/** The fields worth showing: the standard ones, plus any other field once someone actually has a value in it. */
export function activeFields(fields: AssociateField[], people: Pick<Associate, 'data'>[]): AssociateField[] {
  return fields.filter((f) => coreFieldOf(f) || fieldInUse(f, people));
}

/** The list's table columns (after Name), in this order and under these names — every other field is in the details. */
export const TABLE_COLUMNS: { core: string; label: string }[] = [
  { core: 'department', label: 'Department' },
  { core: 'cadre', label: 'Cadre' },
  { core: 'designation', label: 'Designation' },
  { core: 'batch', label: 'Batch year' },
];

/** The fields shown as table columns: the four standard ones the list has, each with its standard name. */
export function tableColumns(fields: AssociateField[]): AssociateField[] {
  return TABLE_COLUMNS.flatMap(({ core, label }) => {
    const f = fields.find((x) => coreFieldOf(x) === core);
    return f ? [{ ...f, label }] : [];
  });
}

/**
 * Every field of the list, the way all screens and files show it: the standard ones first (Department, Cadre,
 * Designation, Batch year — under those names), then the user's own fields in their Manage-fields order.
 * Used by the add / edit form, the details, the Excel template and the export, so they always agree.
 */
export function orderedFields(fields: AssociateField[]): AssociateField[] {
  const core = tableColumns(fields);
  const ids = new Set(core.map((f) => f.id));
  const rest = fields.filter((f) => !ids.has(f.id)).sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  return [...core, ...rest];
}

/**
 * The columns of the Excel template, in order (after Name): the list's fields as `orderedFields` gives them, plus the
 * standard ones it doesn't have yet. A file without column titles is read in exactly this order.
 */
export function templateColumns(fields: AssociateField[]): AssociateField[] {
  const missing = missingCoreFields(fields).map((s) => ({ ...s, id: `std:${s.key}` }) as AssociateField);
  return orderedFields([...fields, ...missing]);
}

/**
 * Does this row look like column titles? Yes when at least one cell is a known title — Name, one of the list's
 * fields, a common spelling (Dept, Batch no., Mobile …) or a serial-number column. A row of plain values
 * ("Ravi Kumar", "Delhi", 2010) is data.
 */
export function looksLikeTitles(cells: unknown[], fields: AssociateField[]): boolean {
  const SERIAL = /^(s\.?\s*no\.?|sl\.?\s*no\.?|sr\.?\s*no\.?|serial(\s*no\.?)?|#|no\.?)$/i;
  return cells.some((c) => {
    const v = String(c ?? '').trim();
    return !!v && (SERIAL.test(v) || !!matchHeader(v, [...fields, ...SUGGESTED_FIELDS]) || !!coreFieldOf({ key: v, label: v }));
  });
}

/** Column titles for a file that has none: Name, then the template's columns in order ("Column 7" beyond them). */
export function positionalTitles(width: number, fields: AssociateField[]): string[] {
  const order = ['Name', ...templateColumns(fields).map((f) => f.label)];
  return Array.from({ length: width }, (_, i) => order[i] ?? `Column ${i + 1}`);
}

/** The standard fields the list doesn't have yet. */
export const missingCoreFields = (fields: AssociateField[]) =>
  SUGGESTED_FIELDS.filter((s) => !fields.some((f) => coreFieldOf(f) === s.key));

/** Lower-case letters and digits only: "E-mail ID" → "emailid". */
export const normalizeHeader = (s: unknown) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');

/** A field key from a label, unique among `taken` ("name" is reserved for the fixed Name column). */
export function toKey(label: string, taken: Iterable<string> = []): string {
  const used = new Set(taken);
  used.add('name');
  let base = String(label).toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 48);
  if (!base) base = 'field';
  if (!/^[a-z]/.test(base)) base = `f_${base}`;
  let key = base;
  for (let n = 2; used.has(key); n++) key = `${base}_${n}`;
  return key;
}

/** Ways people write the Name column. */
const NAME_HEADERS = ['name', 'fullname', 'associatename', 'officialname', 'personname', 'nameofofficial',
  'nameoftheofficial', 'nameofassociate', 'nameoftheassociate', 'nameofofficer', 'officername', 'contactname'];

/** Ways people write common columns → the suggested field key they mean. */
const HEADER_ALIASES: Record<string, string[]> = {
  designation: ['designation', 'title', 'position', 'post', 'role', 'jobtitle', 'rank'],
  organization: ['organization', 'organisation', 'company', 'office', 'institution', 'firm', 'agency', 'ministry'],
  department: ['department', 'dept', 'division', 'wing'],
  phone: ['phone', 'phoneno', 'phonenumber', 'mobile', 'mobileno', 'mobilenumber', 'contact', 'contactno',
    'contactnumber', 'cell', 'cellno', 'telephone', 'tel', 'whatsapp'],
  email: ['email', 'emailid', 'emailaddress', 'mail', 'mailid'],
  city: ['city', 'town', 'place', 'location', 'station'],
  address: ['address', 'officeaddress', 'postaladdress'],
  date_of_birth: ['dob', 'dateofbirth', 'birthday', 'birthdate'],
  notes: ['notes', 'note', 'remarks', 'remark', 'comments', 'comment'],
  cadre: ['cadre', 'allottedcadre', 'statecadre', 'cadrestate'],
  state: ['state', 'statename', 'stateut', 'homestate'],
  batch_year: ['batch', 'batchyear', 'batchno', 'batchnumber', 'yearofbatch', 'yearofallotment', 'allotmentyear', 'servicebatch'],
  service: ['service', 'servicename'],
  employee_id: ['employeeid', 'empid', 'employeecode', 'empcode', 'employeeno', 'empno', 'staffid', 'associateid'],
};

/**
 * Which existing field an Excel header belongs to: 'name', a field key, or null (no match).
 * Matches the field's label or key first, then the common spellings above.
 */
export function matchHeader(header: string, fields: Pick<AssociateField, 'key' | 'label'>[]): string | null {
  const h = normalizeHeader(header);
  if (!h) return null;
  if (NAME_HEADERS.includes(h)) return 'name';
  const direct = fields.find((f) => normalizeHeader(f.label) === h || normalizeHeader(f.key) === h);
  if (direct) return direct.key;
  for (const [key, aliases] of Object.entries(HEADER_ALIASES)) {
    if (!aliases.includes(h)) continue;
    const f = fields.find((x) => x.key === key || aliases.includes(normalizeHeader(x.label)));
    if (f) return f.key;
  }
  return null;
}

/** The type a brand-new column should get, from its header and some of its values. */
export function guessType(header: string, samples: Cell[]): FieldType {
  const h = normalizeHeader(header);
  const has = (...words: string[]) => words.some((w) => h.includes(w));
  if (has('email', 'mail')) return 'email';
  if (has('phone', 'mobile', 'contact', 'cell', 'whatsapp', 'telephone')) return 'phone';
  if (has('dob', 'birth', 'date', 'anniversary', 'joined', 'joining')) return 'date';
  if (has('website', 'url', 'link', 'linkedin')) return 'url';
  if (has('address', 'notes', 'remark', 'comment', 'description', 'about')) return 'longtext';

  const values = samples.filter((v) => v !== null && v !== undefined && String(v).trim() !== '');
  if (!values.length) return 'text';
  if (values.every((v) => v instanceof Date)) return 'date';
  if (values.every((v) => EMAIL.test(String(v).trim()))) return 'email';
  if (values.every((v) => typeof v === 'number' || /^-?\d+(\.\d+)?$/.test(String(v).trim()))) return 'number';
  if (values.some((v) => String(v).length > 120)) return 'longtext';

  // a handful of repeating values (Category, Priority, Zone …) → a choice
  const distinct = new Set(values.map((v) => String(v).trim().toLowerCase()));
  if (values.length >= 6 && distinct.size <= 8 && distinct.size <= values.length / 2) return 'select';
  return 'text';
}

/* ── values ────────────────────────────────────────────────────────── */

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const pad = (n: number) => String(n).padStart(2, '0');

function ymd(y: number, m: number, d: number): string {
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return '';
  return `${y}-${pad(m)}-${pad(d)}`;
}

/** A date cell → "YYYY-MM-DD" ('' if it isn't one). Day-first, as dates are written in India. */
export function toDateString(raw: Cell): string {
  if (raw instanceof Date) {
    if (Number.isNaN(raw.getTime())) return '';
    return ymd(raw.getFullYear(), raw.getMonth() + 1, raw.getDate());
  }
  if (typeof raw === 'number') {
    // an Excel date serial that wasn't formatted as a date (1 = 1900-01-01, with Excel's 1900 leap-year bug)
    if (raw < 1 || raw > 2958465) return '';
    const d = new Date(Date.UTC(1899, 11, 30) + Math.floor(raw) * 86400000);
    return ymd(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
  }
  const s = String(raw ?? '').trim();
  if (!s) return '';
  let m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[T\s].*)?$/.exec(s);
  if (m) return ymd(+m[1], +m[2], +m[3]);
  m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})$/.exec(s);
  if (m) {
    const y = m[3].length === 2 ? (+m[3] > 30 ? 1900 : 2000) + +m[3] : +m[3];
    return ymd(y, +m[2], +m[1]);
  }
  m = /^(\d{1,2})(?:st|nd|rd|th)?[\s\-/.,]*([a-z]{3,})[\s\-/.,]*(\d{4})$/i.exec(s);
  if (m) {
    const month = MONTHS.indexOf(m[2].slice(0, 3).toLowerCase()) + 1;
    return month ? ymd(+m[3], month, +m[1]) : '';
  }
  m = /^([a-z]{3,})[\s\-/.]*(\d{1,2})(?:st|nd|rd|th)?,?[\s\-/.]*(\d{4})$/i.exec(s);
  if (m) {
    const month = MONTHS.indexOf(m[1].slice(0, 3).toLowerCase()) + 1;
    return month ? ymd(+m[3], month, +m[2]) : '';
  }
  return '';
}

export type Coerced = { value: string | number | ''; warning?: string };

/**
 * One cell → the value stored for a field of `type`.
 * Something that doesn't fit the type is kept as typed (nothing is thrown away) and flagged.
 */
export function coerceValue(type: FieldType, raw: Cell): Coerced {
  if (raw === null || raw === undefined) return { value: '' };
  if (typeof raw === 'string' && raw.trim() === '') return { value: '' };
  const text = raw instanceof Date ? toDateString(raw) : String(raw).trim();

  switch (type) {
    case 'number': {
      if (typeof raw === 'number') return { value: raw };
      const n = Number(text.replace(/,/g, ''));
      return Number.isFinite(n) ? { value: n } : { value: text, warning: 'is not a number' };
    }
    case 'date': {
      const d = toDateString(raw);
      return d ? { value: d } : { value: text, warning: 'is not a date we recognise' };
    }
    case 'email': {
      const e = text.toLowerCase().replace(/^mailto:/, '');
      return EMAIL.test(e) ? { value: e } : { value: text, warning: "doesn't look like an email" };
    }
    case 'phone': {
      // Excel often keeps numbers as numbers: 9876543210 → "9876543210"
      const s = typeof raw === 'number' ? String(Math.round(raw)) : text;
      const p = parsePhoneNumberFromString(s, 'IN');
      return p?.isValid() ? { value: p.formatInternational() } : { value: s, warning: "doesn't look like a phone number" };
    }
    case 'url': {
      if (/^https?:\/\//i.test(text)) return { value: text };
      return /^[\w-]+(\.[\w-]+)+(\/\S*)?$/.test(text) ? { value: `https://${text}` } : { value: text, warning: "doesn't look like a link" };
    }
    default:
      return { value: raw instanceof Date ? text : String(raw).trim() };
  }
}

/** A stored value as people read it. */
/** A year-like number field (Batch, Batch year, Year of allotment …): shown as 2010, never "2,010". */
const isYearField = (f: Partial<Pick<AssociateField, 'key' | 'label'>>) =>
  /batch|year/i.test(`${f.key ?? ''} ${f.label ?? ''}`);

export function displayValue(field: (Pick<AssociateField, 'type'> & Partial<Pick<AssociateField, 'key' | 'label'>>) | undefined, value: unknown): string {
  if (value === null || value === undefined || value === '') return '';
  if (field?.type === 'date') {
    const s = String(value);
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
    if (m) return `${+m[3]} ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][+m[2] - 1]} ${m[1]}`;
    return s;
  }
  if (field?.type === 'number' && typeof value === 'number') {
    return isYearField(field) ? String(value) : value.toLocaleString('en-IN');
  }
  return String(value);
}

/** Problems with a value typed into the form ('' = fine). */
export function fieldError(field: AssociateField, value: unknown): string {
  const empty = value === null || value === undefined || String(value).trim() === '';
  if (empty) return field.required ? `${field.label} is required` : '';
  const { warning } = coerceValue(field.type, value as Cell);
  return warning ? `${field.label} ${warning}` : '';
}

/* ── searching / sorting ──────────────────────────────────────────── */

export function matchesSearch(a: Associate, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const hay = [a.name, ...Object.values(a.data || {})].join(' \u0001 ').toLowerCase();
  return q.split(/\s+/).every((word) => hay.includes(word));
}

export function compareBy(field: AssociateField | 'name', dir: 1 | -1) {
  return (a: Associate, b: Associate) => {
    const va = field === 'name' ? a.name : a.data?.[field.key];
    const vb = field === 'name' ? b.name : b.data?.[field.key];
    const ea = va === undefined || va === null || va === '';
    const eb = vb === undefined || vb === null || vb === '';
    if (ea || eb) return ea === eb ? 0 : ea ? 1 : -1; // blanks last, whichever way
    if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * dir;
    return String(va).localeCompare(String(vb), 'en', { numeric: true, sensitivity: 'base' }) * dir;
  };
}

/* ── duplicates ───────────────────────────────────────────────────── */

const digits = (v: unknown) => String(v ?? '').replace(/\D/g, '');
const nameKey = (v: unknown) => String(v ?? '').toLowerCase().replace(/\b(dr|mr|mrs|ms|shri|smt|sri|prof)\b\.?/g, '').replace(/[^a-z]/g, '');

/** Headers that hold an organisation's own ID for the person — the strongest way to tell people apart. */
const ID_HEADERS = ['employeeid', 'empid', 'employeecode', 'empcode', 'employeeno', 'empno', 'employeenumber',
  'staffid', 'staffno', 'associateid', 'associatecode', 'officerid', 'personnelno', 'idno', 'idnumber'];

/** Is this field an employee / associate ID column? */
export const isIdField = (f: Pick<AssociateField, 'key' | 'label'>) =>
  ID_HEADERS.includes(normalizeHeader(f.label)) || ID_HEADERS.includes(normalizeHeader(f.key));

/** What identifies a person: an employee / associate ID, their email, phone (last 10 digits) and name. */
export function identity(name: string, data: AssociateData, fields: AssociateField[]) {
  const ids: string[] = [];
  const emails: string[] = [];
  const phones: string[] = [];
  for (const f of fields) {
    const v = data[f.key];
    if (v === undefined || v === '') continue;
    if (isIdField(f)) ids.push(`${f.key}:${String(v).trim().toLowerCase()}`);
    if (f.type === 'email') emails.push(String(v).toLowerCase().trim());
    if (f.type === 'phone') {
      const d = digits(v);
      if (d.length >= 7) phones.push(d.slice(-10));
    }
  }
  return { ids, emails, phones, name: nameKey(name) };
}

export type Identity = ReturnType<typeof identity>;

/** Why two people look like the same person ('' = they don't). */
export function sameReason(a: Identity, b: Identity): '' | 'id' | 'email' | 'phone' | 'name' {
  if (a.ids.some((i) => b.ids.includes(i))) return 'id';
  // both have an ID in the same column, and the IDs differ → two different people
  const idCols = (x: Identity) => new Set(x.ids.map((i) => i.split(':')[0]));
  const shared = [...idCols(a)].filter((c) => idCols(b).has(c));
  if (shared.length) return '';
  if (a.emails.some((e) => b.emails.includes(e))) return 'email';
  if (a.phones.some((p) => b.phones.includes(p))) return 'phone';
  // the name alone only counts when neither side has an email or phone to tell them apart
  const noContact = (x: Identity) => !x.emails.length && !x.phones.length;
  if (a.name && a.name === b.name && (noContact(a) || noContact(b))) return 'name';
  return '';
}

/* ── import ───────────────────────────────────────────────────────── */

/**
 * Where the column titles are: the first of the top rows that is (nearly) as wide as the widest one —
 * so a title row such as "List of Associates — 2026" above the real headers is skipped.
 */
export function findHeaderRow(rows: Cell[][]): number {
  const filled = (r: Cell[]) => (r || []).filter((c) => c !== null && c !== undefined && String(c).trim() !== '').length;
  const top = rows.slice(0, 15).map(filled);
  const widest = Math.max(0, ...top);
  if (!widest) return 0;
  const i = top.findIndex((n) => n >= Math.max(1, Math.ceil(widest * 0.6)));
  return i < 0 ? 0 : i;
}

export type ColumnTarget =
  | { kind: 'name' }
  | { kind: 'field'; key: string }
  | { kind: 'new'; label: string; type: FieldType }
  | { kind: 'skip' };

export interface ColumnMap {
  index: number;
  header: string;
  target: ColumnTarget;
}

/** The first guess at what each Excel column is. */
export function autoMap(headers: string[], fields: AssociateField[], body: Cell[][]): ColumnMap[] {
  const used = new Set<string>();
  return headers.map((raw, index) => {
    const header = String(raw ?? '').trim();
    if (!header) return { index, header: `Column ${index + 1}`, target: { kind: 'skip' } as ColumnTarget };
    const hit = matchHeader(header, fields);
    if (hit && !used.has(hit)) {
      used.add(hit);
      return { index, header, target: hit === 'name' ? { kind: 'name' } : { kind: 'field', key: hit } };
    }
    // serial-number columns aren't worth keeping
    if (/^(s\.?\s*no\.?|sl\.?\s*no\.?|sr\.?\s*no\.?|serial(\s*no\.?)?|#|no\.?)$/i.test(header)) {
      return { index, header, target: { kind: 'skip' } };
    }
    return { index, header, target: { kind: 'new', label: header, type: guessType(header, body.slice(0, 50).map((r) => r?.[index])) } };
  });
}

/** Problems that stop the import from starting ('' = ready). */
export function mappingError(map: ColumnMap[]): string {
  const names = map.filter((c) => c.target.kind === 'name').length;
  if (names === 0) return 'Choose which column holds the Name.';
  if (names > 1) return 'Only one column can be the Name.';
  const keys = map.flatMap((c) => (c.target.kind === 'field' ? [c.target.key] : []));
  if (new Set(keys).size !== keys.length) return 'Two columns go into the same field. Pick a different field for one of them.';
  const labels = map.flatMap((c) => (c.target.kind === 'new' ? [normalizeHeader(c.target.label)] : []));
  if (labels.some((l) => !l)) return 'Every new field needs a name.';
  if (new Set(labels).size !== labels.length) return 'Two new fields have the same name.';
  return '';
}

/** The fields that the import will create, with their keys settled. */
export function newFieldsFrom(map: ColumnMap[], fields: AssociateField[], body: Cell[][]): { index: number; field: FieldInput }[] {
  const taken = fields.map((f) => f.key);
  let order = Math.max(-1, ...fields.map((f) => f.sort_order ?? 0)) + 1;
  let shown = fields.filter((f) => f.show_in_table).length;
  return map.flatMap((c) => {
    if (c.target.kind !== 'new') return [];
    const key = toKey(c.target.label, taken);
    taken.push(key);
    const choices = c.target.type === 'select'
      ? [...new Set(body.map((r) => String(r?.[c.index] ?? '').trim()).filter(Boolean))].slice(0, 50)
      : undefined;
    // the first few columns show in the table; the rest are one click away in the details panel
    const show = shown < 6 && c.target.type !== 'longtext';
    if (show) shown++;
    return [{
      index: c.index,
      field: {
        key,
        label: c.target.label.trim().slice(0, 80),
        type: c.target.type,
        options: choices ? { choices } : null,
        required: false,
        show_in_table: show,
        sort_order: order++,
      },
    }];
  });
}

/** An existing person's values with the sheet's values laid over them (blank cells never erase anything). */
export function mergeData(current: AssociateData | null | undefined, incoming: AssociateData): AssociateData {
  return { ...(current || {}), ...incoming };
}

/** Choices to add to choice fields so every imported value is one of them. */
export function missingChoices(fields: AssociateField[], rows: { data: AssociateData }[]): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const f of fields) {
    if (f.type !== 'select') continue;
    const have = new Set((f.options?.choices || []).map((c) => c.toLowerCase()));
    const add: string[] = [];
    for (const r of rows) {
      const v = r.data[f.key];
      if (v === undefined || v === '') continue;
      const s = String(v);
      if (!have.has(s.toLowerCase())) { have.add(s.toLowerCase()); add.push(s); }
    }
    if (add.length) out.set(f.key, add);
  }
  return out;
}

/* ── a person's usual details, whatever the fields are called ─────── */

export interface AssociateSummary {
  email: string;
  phone: string;
  designation: string;
  organization: string;
  department: string;
  cadre: string;
  state: string;
  batch: string;
  /** every non-empty value, in field order — for "view details" */
  details: { label: string; value: string }[];
}

/** The first non-empty value among fields that mean `alias` (by key, label or common spelling). */
function pick(a: Associate, fields: AssociateField[], alias: string): string {
  const names = HEADER_ALIASES[alias] || [alias];
  for (const f of fields) {
    const v = a.data?.[f.key];
    if (v === undefined || v === '') continue;
    if (f.key === alias || names.includes(normalizeHeader(f.label)) || names.includes(normalizeHeader(f.key))) return String(v);
  }
  return '';
}

/**
 * What the New Meeting form needs to start a meeting with this associate: they are the main participant of an
 * External meeting, with their designation, department, contact details — and kept as an associate (badge, Details).
 */
export function meetingWithAssociate(a: Associate, fields: AssociateField[]) {
  const s = associateSummary(a, fields);
  return {
    meeting_type: 'External',
    officer_type: 'Other',
    officer_id: a.id,
    officer_name: a.name,
    designation: s.designation,
    current_position: s.designation,
    department: s.department || s.organization,
    email: s.email,
    contact_number: s.phone,
    cadre: s.cadre,
    state: s.state,
    batch_year: s.batch,
    __kind: 'Associate',
    __details: s.details,
  };
}

export function associateSummary(a: Associate, fields: AssociateField[]): AssociateSummary {
  const ofType = (t: FieldType) => {
    const f = fields.find((x) => x.type === t && a.data?.[x.key] !== undefined && a.data?.[x.key] !== '');
    return f ? String(a.data?.[f.key]) : '';
  };
  return {
    email: ofType('email').toLowerCase(),
    phone: ofType('phone'),
    designation: pick(a, fields, 'designation'),
    organization: pick(a, fields, 'organization'),
    department: pick(a, fields, 'department'),
    cadre: pick(a, fields, 'cadre'),
    state: pick(a, fields, 'state'),
    batch: pick(a, fields, 'batch_year'),
    details: fields
      .map((f) => ({ label: f.label, value: displayValue(f, a.data?.[f.key]) }))
      .filter((d) => d.value),
  };
}

/** Fields worth a filter dropdown: choices, or text with a handful of repeating values (Cadre, State, Batch …). */
export function filterableFields(fields: AssociateField[], people: Associate[]): { field: AssociateField; values: string[] }[] {
  const out: { field: AssociateField; values: string[] }[] = [];
  for (const f of fields) {
    if (!['select', 'text', 'number'].includes(f.type) || isIdField(f)) continue;
    const counts = new Map<string, number>();
    for (const p of people) {
      const v = p.data?.[f.key];
      if (v === undefined || v === '') continue;
      const s = displayValue(f, v);
      counts.set(s, (counts.get(s) || 0) + 1);
    }
    const values = [...counts.keys()].sort((x, y) => x.localeCompare(y, 'en', { numeric: true }));
    const repeats = [...counts.values()].some((n) => n > 1);
    if (f.type === 'select' ? values.length >= 1 : values.length >= 2 && values.length <= 40 && repeats) out.push({ field: f, values });
  }
  return out;
}
