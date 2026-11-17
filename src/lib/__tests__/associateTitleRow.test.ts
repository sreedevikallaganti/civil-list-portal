import { describe, expect, it } from 'vitest';
import type { AssociateField } from '@/lib/associates';
import { autoMap, looksLikeTitles, positionalTitles } from '@/lib/associates';
import { withTitleRow, type SheetData } from '@/lib/associateExcel';
import { checkImport, fileColumnsFrom, stageRows, columnFields } from '@/lib/associateImport';

const F = (key: string, label: string, type: AssociateField['type'] = 'text', sort_order = 0): AssociateField =>
  ({ id: key, key, label, type, show_in_table: true, sort_order });
const LIST = [F('department', 'Department'), F('cadre', 'Cadre'), F('designation', 'Designation'), F('batch', 'Batch year', 'number'), F('phone', 'Phone', 'phone', 9)];

describe('files with and without column titles', () => {
  it('tells titles from data', () => {
    expect(looksLikeTitles(['Name', 'Dept', 'Batch no.'], LIST)).toBe(true);
    expect(looksLikeTitles(['S.No', 'Officer', 'Posting'], LIST)).toBe(true);
    expect(looksLikeTitles(['hgfsa', 'gfsa', 'HGFSA'], LIST)).toBe(false);
    expect(looksLikeTitles(['Ravi Kumar', 'Finance', 2010], LIST)).toBe(false);
  });

  it('reads a file without titles in the template order, keeping its first row as a person', () => {
    expect(positionalTitles(7, LIST)).toEqual(['Name', 'Department', 'Cadre', 'Designation', 'Batch year', 'Phone', 'Column 7']);

    // the file from the screenshot: three columns, no title row
    const sheet: SheetData = {
      name: 'Sheet1', headers: ['hgfsa', 'gfsa', 'HGFSA'], firstRow: 2, top: ['hgfsa', 'gfsa', 'HGFSA'],
      body: [['asfg', 'mtrfv', 'eeee'], ['vxzxv', 'vvs', 'cccc']],
    };
    const read = withTitleRow(sheet, LIST);
    expect(read.hasTitles).toBe(false);
    expect(read.headers).toEqual(['Name', 'Department', 'Cadre']);
    expect(read.firstRow).toBe(1);

    const map = autoMap(read.headers, LIST, read.body);
    const { cols, keys } = fileColumnsFrom(map, LIST);
    expect(cols.map((c) => [c.label, c.target])).toEqual([
      ['Department', { kind: 'field', key: 'department' }], ['Cadre', { kind: 'field', key: 'cadre' }],
    ]);
    const rows = stageRows(read.body, read.firstRow, keys, columnFields(cols, LIST));
    expect(rows.map((r) => [r.row, r.name, r.data])).toEqual([
      [1, 'hgfsa', { department: 'gfsa', cadre: 'HGFSA' }],
      [2, 'asfg', { department: 'mtrfv', cadre: 'eeee' }],
      [3, 'vxzxv', { department: 'vvs', cadre: 'cccc' }],
    ]);
    expect(checkImport(rows, cols, LIST, []).counts).toMatchObject({ total: 3, valid: 3, invalid: 0 });
  });

  it('leaves a file with titles alone, and follows the user when they say otherwise', () => {
    const sheet: SheetData = { name: 'S', headers: ['Name', 'Cadre'], firstRow: 2, top: ['Name', 'Cadre'], body: [['Asha', 'TN']] };
    expect(withTitleRow(sheet, LIST)).toMatchObject({ hasTitles: true, headers: ['Name', 'Cadre'], firstRow: 2 });
    expect(withTitleRow(sheet, LIST, false)).toMatchObject({ hasTitles: false, headers: ['Name', 'Department'], firstRow: 1 });
    const odd: SheetData = { name: 'S', headers: ['x', 'y'], firstRow: 2, top: ['x', 'y'], body: [] };
    expect(withTitleRow(odd, LIST, true).hasTitles).toBe(true);
  });
});
