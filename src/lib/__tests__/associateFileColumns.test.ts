import { describe, expect, it } from 'vitest';
import type { Associate, AssociateField, ColumnMap } from '@/lib/associates';
import {
  checkImport, columnFields, columnsProblem, fileColumnsFrom, fileColumnsOf, mapRows, mergeFiles, pruneRows,
  sanitizeFileColumns, stageRows, syncPlan, type FileColumn, type ImportSettings, type StagedRow,
} from '@/lib/associateImport';

const F = (key: string, label: string, type: AssociateField['type'], extra: Partial<AssociateField> = {}): AssociateField =>
  ({ id: `id_${key}`, key, label, type, show_in_table: true, sort_order: 0, ...extra });
const LIST = [F('designation', 'Designation', 'text'), F('email', 'Email', 'email'), F('department', 'Department', 'text')];
const col = (key: string, label: string, target: FileColumn['target'], type: FileColumn['type'] = 'text'): FileColumn => ({ key, label, type, target });
const row = (n: number, name: string, data: StagedRow['data']): StagedRow => ({ id: `r${n}`, row: n, name, data });

describe('per-file columns', () => {
  it('keeps the file’s own column names and syncs matching ones to the list’s fields', () => {
    const map: ColumnMap[] = [
      { index: 0, header: 'Officer Name', target: { kind: 'name' } },
      { index: 1, header: 'Post', target: { kind: 'field', key: 'designation' } },
      { index: 2, header: 'Cadre', target: { kind: 'new', label: 'Cadre', type: 'text' } },
      { index: 3, header: 'S.No', target: { kind: 'skip' } },
    ];
    const { cols, keys } = fileColumnsFrom(map, LIST);
    expect(cols).toEqual([
      { key: 'designation', label: 'Post', type: 'text', target: { kind: 'field', key: 'designation' } },
      { key: 'cadre', label: 'Cadre', type: 'text', target: { kind: 'new' } },
    ]);
    expect([...keys]).toEqual([[0, 'name'], [1, 'designation'], [2, 'cadre']]);
    const rows = stageRows([['Asha', 'Director', 'IAS', 1]], 2, keys, columnFields(cols, LIST));
    expect(rows[0]).toEqual({ id: 'r2', row: 2, name: 'Asha', data: { designation: 'Director', cadre: 'IAS' } });
  });

  it('reads the columns of imports made before per-file columns', () => {
    const settings = {
      sheet: 'S', sheets: ['S'], firstRow: 2, headers: [], onDuplicate: 'skip',
      columns: [
        { index: 0, header: 'Name', target: { kind: 'name' } },
        { index: 1, header: 'Designation', target: { kind: 'field', key: 'designation' } },
        { index: 2, header: 'Batch', target: { kind: 'new', label: 'Batch', type: 'number' } },
      ],
      newFields: [{ key: 'batch', label: 'Batch', type: 'number', show_in_table: true, sort_order: 3 }],
    } as ImportSettings;
    expect(fileColumnsOf(settings, LIST)).toEqual([
      { key: 'designation', label: 'Designation', type: 'text', target: { kind: 'field', key: 'designation' } },
      { key: 'batch', label: 'Batch', type: 'number', target: { kind: 'new', key: 'batch' } },
    ]);
  });
});

describe('sync plan', () => {
  it('maps columns to fields, creates new ones with free keys, leaves skipped ones out', () => {
    const cols = [
      col('post', 'Post', { kind: 'field', key: 'designation' }),
      col('designation', 'Designation', { kind: 'new' }), // the key is taken in Associates → designation_2
      col('batch_no', 'Batch no.', { kind: 'new' }, 'number'),
      col('notes', 'Notes', { kind: 'skip' }),
      col('dept', 'Dept', { kind: 'field', key: 'gone' }), // that field was deleted since → a new field
    ];
    const plan = syncPlan(cols, LIST);
    expect([...plan.keyMap]).toEqual([['post', 'designation'], ['designation', 'designation_2'], ['batch_no', 'batch_no'], ['dept', 'dept']]);
    expect(plan.newFields.map((f) => [f.key, f.label, f.type])).toEqual([
      ['designation_2', 'Designation', 'text'], ['batch_no', 'Batch no.', 'number'], ['dept', 'Dept', 'text'],
    ]);
    expect(plan.columns[1].target).toEqual({ kind: 'new', key: 'designation_2' });
    const mapped = mapRows([row(2, 'A', { post: 'Dir', notes: 'x', batch_no: 1990 })], plan.keyMap);
    expect(mapped[0].data).toEqual({ designation: 'Dir', batch_no: 1990 });
  });

  it('two columns aimed at one field: the second becomes a new field', () => {
    const plan = syncPlan([col('a', 'Post', { kind: 'field', key: 'designation' }), col('b', 'Role', { kind: 'field', key: 'designation' })], LIST);
    expect(plan.keyMap.get('b')).toBe('role');
  });

  it('reuses a field this import created on an interrupted sync instead of creating it again', () => {
    const created = F('cadre', 'Cadre', 'text', { id: 'mine' });
    const cols = [col('cadre', 'Cadre', { kind: 'new', key: 'cadre' })];
    const again = syncPlan(cols, [...LIST, created], [], (f) => f.id === 'mine');
    expect(again.newFields).toEqual([]);
    expect(again.keyMap.get('cadre')).toBe('cadre');
    // someone else's field with that key → a fresh key; their field is left alone
    const other = syncPlan(cols, [...LIST, { ...created, id: 'theirs' }], [], (f) => f.id === 'mine');
    expect(other.keyMap.get('cadre')).toBe('cadre_2');
  });
});

describe('checkImport', () => {
  it('checks values against where they sync and points problems at the file’s columns', () => {
    const cols = [col('mail', 'E-mail', { kind: 'field', key: 'email' }), col('junk', 'Junk', { kind: 'skip' }, 'email')];
    const people: Associate[] = [{ id: 'p1', name: 'Old', data: { email: 'old@x.in' } }];
    const { checks, counts } = checkImport([
      row(2, 'A', { mail: 'not-an-email' }),
      row(3, 'B', { mail: 'old@x.in' }),
      row(4, 'C', { mail: 'c@x.in', junk: 'whatever' }), // a column that isn't synced isn't checked
    ], cols, LIST, people);
    expect(checks.get('r2')!.issues[0].field).toBe('mail');
    expect(checks.get('r3')!.status).toBe('duplicate');
    expect(checks.get('r4')!.status).toBe('valid');
    expect(counts).toMatchObject({ total: 3, valid: 1, invalid: 1, duplicates: 1 });
  });
});

describe('editing and merging', () => {
  it('validates edited columns', () => {
    expect(columnsProblem([col('a', 'Cadre', { kind: 'new' }), col('b', 'cadre ', { kind: 'new' })])).toMatch(/Two columns/);
    expect(columnsProblem([col('a', 'Name', { kind: 'new' })])).toMatch(/Name column/);
    expect(columnsProblem([col('a', ' ', { kind: 'new' })])).toMatch(/needs a name/);
    expect(columnsProblem([col('a', 'Cadre', { kind: 'new' })])).toBe('');
  });

  it('sanitizes columns from the browser', () => {
    expect(sanitizeFileColumns([{ key: 'cadre', label: ' Cadre ', type: 'bogus', target: { kind: 'field', key: 'cadre' } }]))
      .toEqual([{ key: 'cadre', label: 'Cadre', type: 'text', target: { kind: 'field', key: 'cadre' } }]);
    expect(sanitizeFileColumns([{ key: 'Bad Key', label: 'x' }])).toBeNull();
    expect(sanitizeFileColumns([{ key: 'name', label: 'x' }])).toBeNull();
    expect(sanitizeFileColumns([{ key: 'a', label: 'x' }, { key: 'a', label: 'y' }])).toBeNull();
    expect(sanitizeFileColumns('nope')).toBeNull();
  });

  it('drops values of removed columns', () => {
    expect(pruneRows([row(2, 'A', { a: 1, b: 2 })], [col('a', 'A', { kind: 'new' })])[0].data).toEqual({ a: 1 });
  });

  it('merges another file: same-named columns combine, others are added, rows get new ids', () => {
    const into = { rows: [row(2, 'A', { post: 'Dir' }), row(3, 'B', { post: 'JS' })], cols: [col('post', 'Post', { kind: 'field', key: 'designation' })] };
    const from = {
      name: 'xyz.xlsx',
      rows: [row(2, 'C', { p: 'US', cadre: 'IAS' }), { ...row(3, 'D', { p: 'X' }), removed: true }],
      cols: [col('p', 'post', { kind: 'new' }), col('cadre', 'Cadre', { kind: 'new' })],
    };
    const m = mergeFiles(into, from);
    expect(m.cols.map((c) => c.label)).toEqual(['Post', 'Cadre']);
    expect(m.added).toBe(1);
    expect(m.rows[2]).toEqual({ id: 'r4', row: 2, name: 'C', data: { post: 'US', cadre: 'IAS' }, source: 'xyz.xlsx' });
  });
});

describe('merging files that name the same field differently', () => {
  it('"Dept" and "Department" (both going into Department) become one column', () => {
    const into = { rows: [row(2, 'A', { department: 'Home' })], cols: [col('department', 'Department', { kind: 'field', key: 'department' })] };
    const from = { name: 'b.xlsx', rows: [row(2, 'B', { dept: 'Finance', mobile: '98' })],
      cols: [col('dept', 'Dept', { kind: 'field', key: 'department' }), col('mobile', 'Mobile', { kind: 'field', key: 'phone' })] };
    const m = mergeFiles(into, from);
    expect(m.cols.map((c) => c.label)).toEqual(['Department', 'Mobile']);
    expect(m.rows[1].data).toEqual({ department: 'Finance', mobile: '98' });
  });
});
