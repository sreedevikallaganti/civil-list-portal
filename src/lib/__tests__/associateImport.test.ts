import { describe, expect, it } from 'vitest';
import type { Associate, AssociateField, ColumnMap } from '@/lib/associates';
import {
  checkRows, childFolders, cleanImportPath, columnKeys, countChecks, folderNameProblem, importFolders, inImportFolder,
  isJunkFile, movePath, sanitizeRows,
  splitImportPath, stageRows, stagingFields, statusFor, submitPlan, type StagedRow,
} from '@/lib/associateImport';

const F = (key: string, label: string, type: AssociateField['type'], extra: Partial<AssociateField> = {}): AssociateField =>
  ({ id: key, key, label, type, show_in_table: true, sort_order: 0, ...extra });

const FIELDS = [F('designation', 'Designation', 'text'), F('phone', 'Phone', 'phone'), F('email', 'Email', 'email')];
const KEYS = new Map([[0, 'name'], [1, 'designation'], [2, 'phone'], [3, 'email']]);
const row = (id: number, name: string, data: StagedRow['data'] = {}, extra: Partial<StagedRow> = {}): StagedRow =>
  ({ id: `r${id}`, row: id, name, data, ...extra });

describe('stageRows', () => {
  it('cleans values, keeps rows without a name, drops empty rows', () => {
    const rows = stageRows([
      ['Asha Rao', 'Director', 9876543210, 'Asha@X.in'],
      [null, null, null, null],
      ['', 'Chairman', '', ''],
      ['Meera', '', 'n/a', 'meera@'],
    ], 5, KEYS, FIELDS);
    expect(rows).toEqual([
      { id: 'r5', row: 5, name: 'Asha Rao', data: { designation: 'Director', phone: '+91 98765 43210', email: 'asha@x.in' } },
      { id: 'r7', row: 7, name: '', data: { designation: 'Chairman' } },
      { id: 'r8', row: 8, name: 'Meera', data: { phone: 'n/a', email: 'meera@' } }, // kept as typed, flagged by the check
    ]);
  });
});

describe('checkRows', () => {
  const existing: Associate[] = [{ id: 'e1', name: 'Vikram Shah', data: { email: 'vikram@x.in' } }];

  it('marks invalid, duplicate (in the file and in the list) and removed rows', () => {
    const rows = [
      row(2, 'Asha Rao', { phone: '+91 98765 43210' }),
      row(3, '', { designation: 'Chairman' }),
      row(4, 'Meera', { email: 'meera@' }),
      row(5, 'A. Rao', { phone: '09876543210' }),
      row(6, 'V Shah', { email: 'VIKRAM@x.in' }),
      row(7, 'Gone', {}, { removed: true }),
    ];
    const checks = checkRows(rows, FIELDS, existing);
    expect([...checks.values()].map((c) => c.status)).toEqual(['valid', 'invalid', 'invalid', 'duplicate', 'duplicate', 'removed']);
    expect(checks.get('r3')!.issues[0].message).toBe('Name is missing');
    expect(checks.get('r4')!.issues[0]).toMatchObject({ level: 'error', field: 'email' });
    expect(checks.get('r5')!.duplicateOf).toEqual({ kind: 'file', rowId: 'r2', row: 2, reason: 'same phone' });
    expect(checks.get('r6')!.duplicateOf).toMatchObject({ kind: 'existing', id: 'e1', reason: 'same email' });

    const counts = countChecks(checks);
    expect(counts).toEqual({ total: 5, valid: 1, invalid: 2, duplicates: 2, removed: 1 });
    expect(statusFor(counts, 'skip')).toBe('draft'); // invalid rows → still a draft
  });

  it('an invalid or removed row does not make the next copy a duplicate', () => {
    const checks = checkRows([
      row(2, 'Asha', { email: 'asha@x.in', phone: 'bad' }),
      row(3, 'Asha', { email: 'asha@x.in' }),
    ], FIELDS, []);
    expect(checks.get('r3')!.status).toBe('valid');
  });

  it('required fields', () => {
    const fields = [F('designation', 'Designation', 'text', { required: true })];
    expect(checkRows([row(2, 'X')], fields, []).get('r2')!.issues[0].message).toBe('Designation is required');
  });

  it('stays fast for big files', () => {
    const many = Array.from({ length: 5000 }, (_, i) => row(i + 2, `Person ${i}`, { email: `p${i}@x.in`, phone: `98${String(i).padStart(8, '0')}` }));
    const people = Array.from({ length: 5000 }, (_, i) => ({ id: `e${i}`, name: `Old ${i}`, data: { email: `old${i}@x.in` } }));
    const t = Date.now();
    const counts = countChecks(checkRows(many, FIELDS, people));
    expect(counts.valid).toBe(5000);
    expect(Date.now() - t).toBeLessThan(3000);
  });
});

describe('statusFor / submitPlan', () => {
  const rows = [
    row(2, 'New Person', { email: 'new@x.in' }),
    row(3, 'Vikram', { email: 'vikram@x.in', designation: 'MD' }),
    row(4, 'New Person', { email: 'new@x.in' }),
  ];
  const existing: Associate[] = [{ id: 'e1', name: 'Vikram Shah', data: { email: 'vikram@x.in' } }];
  const checks = checkRows(rows, FIELDS, existing);

  it('never inserts duplicates', () => {
    expect(submitPlan(rows, checks, 'skip')).toMatchObject({ creates: [rows[0]], updates: [], skipped: 2 });
    const upd = submitPlan(rows, checks, 'update');
    expect(upd.creates).toEqual([rows[0]]);
    expect(upd.updates).toEqual([{ row: rows[1], existingId: 'e1' }]);
    expect(upd.skipped).toBe(1); // the second copy inside the file is never used
  });

  it('is ready when nothing is invalid and something can be submitted', () => {
    expect(statusFor({ total: 1, valid: 0, invalid: 0, duplicates: 1, removed: 0 }, 'skip')).toBe('draft');
    expect(statusFor({ total: 1, valid: 0, invalid: 0, duplicates: 1, removed: 0 }, 'update')).toBe('ready');
    expect(statusFor({ total: 3, valid: 3, invalid: 0, duplicates: 0, removed: 0 }, 'skip')).toBe('ready');
  });
});

describe('columns and new fields', () => {
  it('maps new-field columns to their settled keys', () => {
    const columns: ColumnMap[] = [
      { index: 0, header: 'Name', target: { kind: 'name' } },
      { index: 1, header: 'Cadre', target: { kind: 'new', label: 'Cadre', type: 'text' } },
      { index: 2, header: 'Mail', target: { kind: 'field', key: 'email' } },
      { index: 3, header: 'S.No', target: { kind: 'skip' } },
    ];
    const newFields = [{ key: 'cadre', label: 'Cadre', type: 'text' as const }];
    expect(columnKeys(columns, newFields)).toEqual(new Map([[0, 'name'], [1, 'cadre'], [2, 'email']]));
    expect(stagingFields(FIELDS, newFields).map((f) => f.id)).toEqual(['designation', 'phone', 'email', 'new:cadre']);
  });
});

describe('sanitizeRows', () => {
  it('keeps only the expected shape', () => {
    expect(sanitizeRows([
      { id: 'r2', row: 2, name: '  Asha  Rao ', data: { email: 'a@x.in', 'bad key': 'x', n: 5, o: { x: 1 } }, removed: true, extra: 1 },
      { id: 'r2', name: 'again' },          // same id twice
      { id: 'drop table', name: 'x' },      // bad id
      'nonsense',
    ])).toEqual([{ id: 'r2', row: 2, name: 'Asha Rao', data: { email: 'a@x.in', n: 5 }, removed: true }]);
    expect(sanitizeRows('nope')).toEqual([]);
  });
});

describe('folder paths', () => {
  it('keeps a clean relative path and always the real file name', () => {
    expect(cleanImportPath('Directors/IAS/2020.xlsx', '2020.xlsx')).toBe('Directors/IAS/2020.xlsx');
    expect(cleanImportPath('Directors\\IAS\\2020.xlsx', '2020.xlsx')).toBe('Directors/IAS/2020.xlsx');
    expect(cleanImportPath('/../x/./y//a.csv', 'a.csv')).toBe('x/y/a.csv');
    expect(cleanImportPath('A/other-name.xlsx', 'real.xlsx')).toBe('A/real.xlsx');
    expect(cleanImportPath(null, 'list.xlsx')).toBe('list.xlsx');
    expect(cleanImportPath('', 'list.xlsx')).toBe('list.xlsx');
    const long = cleanImportPath(`${'a'.repeat(200)}/${'b'.repeat(100)}/f.xlsx`, 'f.xlsx');
    expect(long).toBe(`${'b'.repeat(100)}/f.xlsx`);
  });

  it('splits, lists and filters folders', () => {
    expect(splitImportPath('A/B/list.xlsx')).toEqual({ folder: 'A/B', name: 'list.xlsx' });
    expect(splitImportPath('list.xlsx')).toEqual({ folder: '', name: 'list.xlsx' });
    expect(importFolders(['IAS/2020/a.xlsx', 'IAS/b.xlsx', 'c.xlsx', 'IPS/d.csv'])).toEqual(['IAS', 'IAS/2020', 'IPS']);
    expect(inImportFolder('IAS/2020/a.xlsx', 'IAS')).toBe(true);
    expect(inImportFolder('IAS2/a.xlsx', 'IAS')).toBe(false);
    expect(inImportFolder('c.xlsx', '')).toBe(true);
    expect(inImportFolder('c.xlsx', 'IAS')).toBe(false);
  });

  it('lists child folders, moves paths and checks folder names', () => {
    const all = ['Detail associates', 'Detail associates/2026', 'Detail associates/2026/Q1', 'XYZ associates'];
    expect(childFolders('', all)).toEqual(['Detail associates', 'XYZ associates']);
    expect(childFolders('Detail associates', all)).toEqual(['Detail associates/2026']);
    expect(childFolders('XYZ associates', all)).toEqual([]);

    expect(movePath('Detail associates/2026/a.xlsx', 'Detail associates', 'Senior')).toBe('Senior/2026/a.xlsx');
    expect(movePath('Detail associates', 'Detail associates', 'Senior')).toBe('Senior');
    expect(movePath('Detail associates 2/a.xlsx', 'Detail associates', 'Senior')).toBe('Detail associates 2/a.xlsx');
    expect(movePath('A/a.xlsx', 'A', '')).toBe('a.xlsx');
    expect(movePath('a.xlsx', '', 'A')).toBe('A/a.xlsx');

    expect(folderNameProblem('  ', [])).toMatch(/name/);
    expect(folderNameProblem('a/b', [])).toMatch(/\//);
    expect(folderNameProblem('xyz associates', ['XYZ associates'])).toMatch(/already/);
    expect(folderNameProblem('Detail associates', ['XYZ associates'])).toBe('');
  });

  it('recognises lock and system files', () => {
    expect(isJunkFile('~$list.xlsx')).toBe(true);
    expect(isJunkFile('.DS_Store')).toBe(true);
    expect(isJunkFile('desktop.ini')).toBe(true);
    expect(isJunkFile('list.xlsx')).toBe(false);
  });
});
