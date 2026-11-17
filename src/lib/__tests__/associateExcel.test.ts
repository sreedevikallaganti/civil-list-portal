import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import { readWorkbook } from '@/lib/associateExcel';
import { autoMap, mappingError, newFieldsFrom, type AssociateField } from '@/lib/associates';
import { checkRows, columnKeys, countChecks, stageRows, stagingFields } from '@/lib/associateImport';

/** A sheet the way people really make them: a title row, a serial-number column,
    phone numbers stored as numbers, real Excel dates, a blank row and a repeated person. */
function messyWorkbook(type: 'xlsx' | 'csv'): File {
  const ws = XLSX.utils.aoa_to_sheet([
    ['List of Associates — November 2026'],
    [],
    ['S.No', 'Name of the Official', 'Designation', 'Company', 'Mobile No.', 'E-mail ID', 'DOB', 'Zone'],
    [1, 'Dr. Asha Rao', 'Managing Director', 'ABC Ltd', 9876543210, 'Asha@ABC.in', new Date(1970, 7, 15), 'South'],
    [2, 'Vikram Shah', 'Director', 'XYZ Corp', 9123456780, '', new Date(1965, 0, 2), 'North'],
    [],
    [3, '', 'Chairman', 'No Name Inc', '', '', '', 'East'],
    [4, 'V. Shah', '', '', 9123456780, 'vikram@xyz.com', '', 'North'],
    [5, 'Meera Iyer', 'CEO', 'Iyer & Sons', 'n/a', 'meera@iyer', '', 'South'],
    [],
    [],
  ], { cellDates: true });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Associates');
  const data = type === 'csv'
    ? XLSX.write(wb, { type: 'string', bookType: 'csv' })
    : XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
  return new File([data], `associates.${type}`);
}

const FIELDS: AssociateField[] = [
  { id: '1', key: 'designation', label: 'Designation', type: 'text', show_in_table: true, sort_order: 0 },
  { id: '2', key: 'phone', label: 'Phone', type: 'phone', show_in_table: true, sort_order: 1 },
  { id: '3', key: 'email', label: 'Email', type: 'email', show_in_table: true, sort_order: 2 },
];

describe('readWorkbook → import plan', () => {
  it('finds the real header row and drops trailing blank rows', async () => {
    const [sheet] = await readWorkbook(messyWorkbook('xlsx'));
    expect(sheet.name).toBe('Associates');
    expect(sheet.headers).toEqual(['S.No', 'Name of the Official', 'Designation', 'Company', 'Mobile No.', 'E-mail ID', 'DOB', 'Zone']);
    expect(sheet.firstRow).toBe(4); // Excel row of the first person
    expect(sheet.body).toHaveLength(6);
    expect(sheet.body[0][6]).toBeInstanceOf(Date);
  });

  it('turns the messy sheet into a clean plan', async () => {
    const [sheet] = await readWorkbook(messyWorkbook('xlsx'));
    const map = autoMap(sheet.headers, FIELDS, sheet.body);
    expect(mappingError(map)).toBe('');
    expect(map.map((c) => c.target.kind)).toEqual(['skip', 'name', 'field', 'new', 'field', 'field', 'new', 'new']);

    const created = newFieldsFrom(map, FIELDS, sheet.body);
    expect(created.map((c) => [c.field.key, c.field.type])).toEqual([['company', 'text'], ['dob', 'date'], ['zone', 'text']]);

    const newFields = created.map((c) => c.field);
    const all = stagingFields(FIELDS, newFields);
    const rows = stageRows(sheet.body, sheet.firstRow, columnKeys(map, newFields), all);

    expect(rows.map((r) => [r.row, r.name])).toEqual([[4, 'Dr. Asha Rao'], [5, 'Vikram Shah'], [7, ''], [8, 'V. Shah'], [9, 'Meera Iyer']]);
    expect(rows[0].data).toEqual({ designation: 'Managing Director', company: 'ABC Ltd', phone: '+91 98765 43210', email: 'asha@abc.in', dob: '1970-08-15', zone: 'South' });

    const existing = [{ id: 'x', name: 'Asha Rao', data: { email: 'asha@abc.in' } }];
    const checks = checkRows(rows, all, existing);
    expect(rows.map((r) => checks.get(r.id)!.status)).toEqual(['duplicate', 'valid', 'invalid', 'duplicate', 'invalid']);
    expect(checks.get('r8')!.duplicateOf).toMatchObject({ kind: 'file', row: 5, reason: 'same phone' });
    expect(checks.get('r9')!.issues.filter((i) => i.level === 'error')).toHaveLength(2); // bad phone + bad email
    expect(countChecks(checks)).toEqual({ total: 5, valid: 1, invalid: 2, duplicates: 2, removed: 0 });
  });

  it('reads CSV files too', async () => {
    const [sheet] = await readWorkbook(messyWorkbook('csv'));
    expect(sheet.headers[1]).toBe('Name of the Official');
    expect(sheet.body.filter((r) => r[1]).length).toBe(4);
  });

  it('rejects files that are not spreadsheets', async () => {
    await expect(readWorkbook(new File(['%PDF-1.7'], 'list.pdf'))).rejects.toThrow(/Excel/);
    await expect(readWorkbook(new File([''], 'empty.xlsx'))).rejects.toThrow();
  });
});
