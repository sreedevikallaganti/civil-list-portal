/* lib/associateExcel.ts — reading and writing Excel files for the Associates list.
   Reading works in the browser and on the server (parseWorkbook); writing (template, export) is browser only.
   SheetJS is loaded on demand in the browser, so the page itself stays light. */

import { coreFieldOf, displayValue, FIELD_TYPE_LABEL, findHeaderRow, looksLikeTitles, orderedFields, positionalTitles, templateColumns, toDateString, type Associate, type AssociateField, type Cell } from '@/lib/associates';

type XLSXModule = typeof import('xlsx');
const xlsx = () => import('xlsx');

export const ACCEPTED_FILES = '.xlsx,.xls,.xlsm,.csv,.ods';
export const MAX_FILE_MB = 15;

export interface SheetData {
  name: string;
  headers: string[];
  body: Cell[][];
  /** the Excel row number of body[0] */
  firstRow: number;
  /** the title row as it is in the file (raw values) — a file without titles keeps it as its first person */
  top?: Cell[];
}

/**
 * The sheet read with or without a title row. `titles: 'auto'` decides by the first row: column titles when one of
 * its cells is a known title (Name, Department, Batch no. …), otherwise it is data and the columns are read in the
 * template's order (Name, Department, Cadre, Designation, Batch year, then the list's other fields).
 */
export function withTitleRow(sheet: SheetData, fields: AssociateField[], titles: 'auto' | boolean = 'auto'): SheetData & { hasTitles: boolean } {
  const hasTitles = titles === 'auto' ? !sheet.top || looksLikeTitles(sheet.top, fields) : titles;
  if (hasTitles || !sheet.top) return { ...sheet, hasTitles: true };
  return {
    ...sheet,
    headers: positionalTitles(sheet.headers.length, fields),
    body: [sheet.top, ...sheet.body],
    firstRow: sheet.firstRow - 1,
    hasTitles: false,
  };
}

/** '' when the file name and size are acceptable, otherwise the reason. */
export function fileProblem(name: string, size: number): string {
  const ext = name.toLowerCase().match(/\.[a-z0-9]+$/)?.[0] || '';
  if (!ACCEPTED_FILES.split(',').includes(ext)) return 'Choose an Excel (.xlsx, .xls) or CSV file.';
  if (size > MAX_FILE_MB * 1024 * 1024) return `The file is larger than ${MAX_FILE_MB} MB.`;
  if (size === 0) return 'The file is empty.';
  return '';
}

const filled = (c: Cell) => c !== null && c !== undefined && String(c).trim() !== '';

/** Every sheet of a workbook that has something in it — header row found, trailing blank rows dropped. */
export function parseWorkbook(XLSX: XLSXModule, data: ArrayBuffer | Uint8Array): SheetData[] {
  let wb;
  try {
    wb = XLSX.read(data, { type: 'array', cellDates: true, dense: true });
  } catch {
    throw new Error("This file couldn't be read. Save it as .xlsx or .csv and try again.");
  }
  const sheets: SheetData[] = [];
  for (const name of wb.SheetNames) {
    const rows = XLSX.utils.sheet_to_json<Cell[]>(wb.Sheets[name], { header: 1, raw: true, defval: null, blankrows: true });
    if (!rows.some((r) => r?.some(filled))) continue;
    const h = findHeaderRow(rows);
    let width = 0;
    for (let i = h; i < rows.length; i++) width = Math.max(width, rows[i]?.length || 0);
    const headers = Array.from({ length: width }, (_, i) => String(rows[h]?.[i] ?? '').replace(/\s+/g, ' ').trim());
    let end = rows.length;
    while (end > h + 1 && !(rows[end - 1] || []).some(filled)) end--;
    sheets.push({ name, headers, body: rows.slice(h + 1, end), firstRow: h + 2, top: rows[h] || [] });
  }
  if (!sheets.length) throw new Error('The file is empty.');
  return sheets;
}

/** Every sheet of the workbook that has something in it (browser). */
export async function readWorkbook(file: File): Promise<SheetData[]> {
  const problem = fileProblem(file.name, file.size);
  if (problem) throw new Error(problem);
  return parseWorkbook(await xlsx(), await file.arrayBuffer());
}

async function save(sheets: { name: string; rows: (string | number)[][]; widths?: number[] }[], filename: string) {
  const XLSX = await xlsx();
  const wb = XLSX.utils.book_new();
  for (const s of sheets) {
    const ws = XLSX.utils.aoa_to_sheet(s.rows);
    ws['!cols'] = (s.widths || s.rows[0].map(() => 22)).map((wch) => ({ wch }));
    XLSX.utils.book_append_sheet(wb, ws, s.name);
  }
  XLSX.writeFile(wb, filename, { compression: true });
}

/** An empty sheet with the right column titles, plus a sheet explaining them. */
export async function downloadTemplate(fields: AssociateField[]) {
  // Name + every field of the list (the standard ones first, under their standard names). A list without the
  // standard fields yet still gets their columns, so the sheet always has Department, Cadre, Designation, Batch year.
  const cols = templateColumns(fields);
  const example: Record<string, string> = {
    cadre: 'Tamil Nadu', batch: '2010', designation: 'Joint Secretary', department: 'Ministry of Finance',
  };
  const byType: Partial<Record<AssociateField['type'], string>> = {
    phone: '+91 98765 43210', email: 'name@example.com', date: '15/08/1970', url: 'https://example.com',
  };
  await save([
    {
      name: 'Associates',
      rows: [['Name', ...cols.map((f) => f.label)], ['Dr. Example Name', ...cols.map((f) => example[coreFieldOf(f)] || byType[f.type] || '')]],
    },
    {
      name: 'How to fill',
      widths: [24, 14, 70],
      rows: [
        ['Column', 'Type', 'Notes'],
        ['Name', 'Text', 'Required. One person per row.'],
        ...cols.map((f) => [f.label, FIELD_TYPE_LABEL[f.type], typeHint(f)]),
        [],
        ['', '', 'Delete the example row before importing. Extra columns are fine: they can be added as new fields while importing.'],
      ],
    },
  ], 'associates-template.xlsx');
}

function typeHint(f: Pick<AssociateField, 'type' | 'options'>): string {
  switch (f.type) {
    case 'date': return 'Day/Month/Year, e.g. 15/08/1970 (or an Excel date).';
    case 'phone': return '10-digit mobile number; add the country code for numbers outside India.';
    case 'email': return 'One email address.';
    case 'number': return 'Digits only.';
    case 'url': return 'A web address, e.g. www.example.com';
    case 'select': return f.options?.choices?.length ? `One of: ${f.options.choices.join(', ')}` : 'A short category value.';
    default: return '';
  }
}

/** The list as an Excel file, columns in the list's order. */
export async function exportAssociates(all: AssociateField[], people: Associate[], filename = 'associates.xlsx') {
  // same columns, names and order as the template — so an exported file can be imported again as it is
  const fields = orderedFields(all);
  await save([{
    name: 'Associates',
    rows: [
      ['Name', ...fields.map((f) => f.label)],
      ...people.map((a) => [a.name, ...fields.map((f) => {
        const v = a.data?.[f.key];
        if (v === undefined || v === null) return '';
        return f.type === 'number' && typeof v === 'number' ? v : f.type === 'date' ? displayValue(f, v) : String(v);
      })]),
    ],
  }], filename);
}

/** Rows that could not be imported, with the reason, so they can be fixed and imported again. */
export async function downloadFailedRows(headers: string[], rows: { row: number; cells: Cell[]; reason: string }[]) {
  await save([{
    name: 'Not imported',
    rows: [
      ['Excel row', 'Reason', ...headers],
      ...rows.map((r) => [r.row, r.reason, ...headers.map((_, i) => {
        const c = r.cells[i];
        return c instanceof Date ? toDateString(c) : c === null || c === undefined ? '' : typeof c === 'boolean' ? String(c) : c;
      })]),
    ],
  }], 'associates-not-imported.xlsx');
}
