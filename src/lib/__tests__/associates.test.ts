import { describe, expect, it } from 'vitest';
import {
  autoMap, coerceValue, compareBy, findHeaderRow, guessType, mappingError, matchHeader,
  matchesSearch, mergeData, missingChoices, newFieldsFrom, sameReason, identity, toDateString, toKey,
  type Associate, type AssociateField,
} from '@/lib/associates';

const F = (key: string, label: string, type: AssociateField['type'], extra: Partial<AssociateField> = {}): AssociateField =>
  ({ id: key, key, label, type, show_in_table: true, sort_order: 0, ...extra });

const FIELDS = [
  F('designation', 'Designation', 'text'),
  F('phone', 'Phone', 'phone'),
  F('email', 'Email', 'email'),
];

describe('toKey', () => {
  it('slugs labels and keeps them unique', () => {
    expect(toKey('Date of Birth')).toBe('date_of_birth');
    expect(toKey('E-mail ID')).toBe('e_mail_id');
    expect(toKey('Phone', ['phone'])).toBe('phone_2');
    expect(toKey('Name')).toBe('name_2'); // "name" is the fixed column
    expect(toKey('2nd Phone')).toBe('f_2nd_phone');
    expect(toKey('***')).toBe('field');
  });
});

describe('matchHeader', () => {
  it.each([
    ['Name', 'name'],
    ['Full Name', 'name'],
    ['Name of the Official', 'name'],
    ['DESIGNATION', 'designation'],
    ['Position', 'designation'],
    ['Mobile No.', 'phone'],
    ['Contact Number', 'phone'],
    ['E-mail ID', 'email'],
    ['Favourite colour', null],
  ])('%s → %s', (header, key) => {
    expect(matchHeader(header, FIELDS)).toBe(key);
  });

  it('matches a renamed field by its label', () => {
    expect(matchHeader('Cell', [F('mobile', 'Mobile', 'phone')])).toBe('mobile');
  });
});

describe('guessType', () => {
  it('reads the header first', () => {
    expect(guessType('Email ID', [])).toBe('email');
    expect(guessType('Mobile', [9876543210])).toBe('phone');
    expect(guessType('DOB', ['12/03/1970'])).toBe('date');
    expect(guessType('Office Address', [])).toBe('longtext');
  });
  it('then the values', () => {
    expect(guessType('Joined on', [])).toBe('date');
    expect(guessType('Since', [new Date(2020, 0, 1)])).toBe('date');
    expect(guessType('Batch', [1998, 2001, '2004'])).toBe('number');
    expect(guessType('Zone', ['North', 'South', 'North', 'East', 'South', 'North'])).toBe('select');
    expect(guessType('Remarks about', ['x'])).toBe('longtext');
    expect(guessType('Company', ['Tata', 'Infosys'])).toBe('text');
  });
});

describe('toDateString', () => {
  it.each([
    ['2026-03-05', '2026-03-05'],
    ['05/03/2026', '2026-03-05'], // day first
    ['5-3-26', '2026-03-05'],
    ['5 March 2026', '2026-03-05'],
    ['5th Mar, 2026', '2026-03-05'],
    ['March 5, 2026', '2026-03-05'],
    ['31/02/2026', ''],
    ['soon', ''],
  ])('%s → %s', (raw, out) => {
    expect(toDateString(raw)).toBe(out);
  });
  it('handles Date cells and Excel serials', () => {
    expect(toDateString(new Date(1970, 2, 12))).toBe('1970-03-12');
    expect(toDateString(45000)).toBe('2023-03-15');
  });
});

describe('coerceValue', () => {
  it('formats phones and emails', () => {
    expect(coerceValue('phone', 9876543210)).toEqual({ value: '+91 98765 43210' });
    expect(coerceValue('phone', '12').warning).toBeTruthy();
    expect(coerceValue('email', ' Director@Example.COM ')).toEqual({ value: 'director@example.com' });
    expect(coerceValue('email', 'not-an-email')).toEqual({ value: 'not-an-email', warning: "doesn't look like an email" });
  });
  it('keeps values that do not fit, flagged', () => {
    expect(coerceValue('number', '1,200')).toEqual({ value: 1200 });
    expect(coerceValue('number', 'about 5').warning).toBe('is not a number');
    expect(coerceValue('date', 'next week').value).toBe('next week');
    expect(coerceValue('url', 'example.org')).toEqual({ value: 'https://example.org' });
  });
  it('treats blanks as empty', () => {
    expect(coerceValue('text', '   ')).toEqual({ value: '' });
    expect(coerceValue('number', null)).toEqual({ value: '' });
  });
});

describe('findHeaderRow', () => {
  it('skips a title row above the headers', () => {
    expect(findHeaderRow([
      ['List of Associates — 2026'],
      [],
      ['S.No', 'Name', 'Designation', 'Mobile'],
      [1, 'A', 'Director', 9876543210],
    ])).toBe(2);
    expect(findHeaderRow([['Name', 'Email'], ['A', 'a@b.co']])).toBe(0);
    expect(findHeaderRow([])).toBe(0);
  });
});

describe('autoMap / mappingError / newFieldsFrom', () => {
  const headers = ['S.No', 'Name', 'Designation', 'Mobile', 'Company', ''];
  const body = [[1, 'Asha Rao', 'Director', 9876543210, 'Tata', '']];

  it('maps known columns, skips serial numbers, proposes new fields', () => {
    const map = autoMap(headers, FIELDS, body);
    expect(map.map((c) => c.target)).toEqual([
      { kind: 'skip' },
      { kind: 'name' },
      { kind: 'field', key: 'designation' },
      { kind: 'field', key: 'phone' },
      { kind: 'new', label: 'Company', type: 'text' },
      { kind: 'skip' },
    ]);
    expect(mappingError(map)).toBe('');
    const created = newFieldsFrom(map, FIELDS, body);
    expect(created).toHaveLength(1);
    expect(created[0]).toMatchObject({ index: 4, field: { key: 'company', label: 'Company', type: 'text' } });
  });

  it('needs exactly one Name column and no clashes', () => {
    expect(mappingError([{ index: 0, header: 'A', target: { kind: 'skip' } }])).toMatch(/Name/);
    expect(mappingError([
      { index: 0, header: 'A', target: { kind: 'name' } },
      { index: 1, header: 'B', target: { kind: 'field', key: 'phone' } },
      { index: 2, header: 'C', target: { kind: 'field', key: 'phone' } },
    ])).toMatch(/same field/);
  });
});

describe('duplicates', () => {
  it('matches on email, then phone, then a bare name', () => {
    const a = identity('Dr. Asha Rao', { email: 'asha@x.in' }, FIELDS);
    expect(sameReason(a, identity('Someone', { email: 'ASHA@x.in' }, FIELDS))).toBe('email');
    expect(sameReason(
      identity('A', { phone: '+91 98765 43210' }, FIELDS),
      identity('B', { phone: '09876543210' }, FIELDS),
    )).toBe('phone');
    expect(sameReason(identity('Asha Rao', {}, FIELDS), a)).toBe('name');
    // same name, different emails → two different people
    expect(sameReason(identity('Asha Rao', { email: 'other@x.in' }, FIELDS), a)).toBe('');
  });
});

describe('merging and choices', () => {
  it('merges without erasing', () => {
    expect(mergeData({ email: 'a@x.in', designation: 'MD' }, { designation: 'CEO' })).toEqual({ email: 'a@x.in', designation: 'CEO' });
  });

  it('collects new choices', () => {
    const zone = F('zone', 'Zone', 'select', { options: { choices: ['North'] } });
    expect(missingChoices([zone], [{ data: { zone: 'north' } }, { data: { zone: 'South' } }])).toEqual(new Map([['zone', ['South']]]));
  });
});

describe('employee ID', () => {
  const withId = [...FIELDS, F('emp', 'Employee ID', 'text')];
  it('is the strongest match, and different IDs mean different people', () => {
    expect(sameReason(identity('A', { emp: 'BTL-01' }, withId), identity('B', { emp: 'btl-01 ' }, withId))).toBe('id');
    // same email but different employee IDs → two people (e.g. a shared office address)
    expect(sameReason(
      identity('A', { emp: 'BTL-01', email: 'office@x.in' }, withId),
      identity('B', { emp: 'BTL-02', email: 'office@x.in' }, withId),
    )).toBe('');
  });
});

describe('search and sort', () => {
  const list: Associate[] = [
    { id: '1', name: 'Zara', data: { designation: 'Director', batch: 2001 } },
    { id: '2', name: 'arjun', data: { designation: 'Chairman' } },
    { id: '3', name: 'Mohan', data: { batch: 1998 } },
  ];
  it('searches every value, word by word', () => {
    expect(list.filter((a) => matchesSearch(a, 'dir zara')).map((a) => a.id)).toEqual(['1']);
    expect(list.filter((a) => matchesSearch(a, '1998')).map((a) => a.id)).toEqual(['3']);
  });
  it('sorts case-insensitively with blanks last', () => {
    expect([...list].sort(compareBy('name', 1)).map((a) => a.name)).toEqual(['arjun', 'Mohan', 'Zara']);
    const batch = F('batch', 'Batch', 'number');
    expect([...list].sort(compareBy(batch, -1)).map((a) => a.id)).toEqual(['1', '3', '2']);
  });
});

describe('standard fields and hiding empty ones', () => {
  it('knows the standard fields however they are written', async () => {
    const { coreFieldOf } = await import('@/lib/associates');
    expect(coreFieldOf({ key: 'batch_year', label: 'Batch Year' })).toBe('batch');
    expect(coreFieldOf({ key: 'post', label: 'Post' })).toBe('designation');
    expect(coreFieldOf({ key: 'dept', label: 'Dept' })).toBe('department');
    expect(coreFieldOf({ key: 'cadre', label: 'Cadre' })).toBe('cadre');
    expect(coreFieldOf({ key: 'email', label: 'Email' })).toBe('');
  });

  it('shows standard fields always, others only once someone has a value', async () => {
    const { activeFields, missingCoreFields } = await import('@/lib/associates');
    const f = (key: string, label: string) => ({ id: key, key, label, type: 'text' as const });
    const fields = [f('cadre', 'Cadre'), f('email', 'Email'), f('city', 'City'), f('designation', 'Designation')];
    const people = [{ data: { city: 'Delhi', email: '' } }, { data: null }];
    expect(activeFields(fields, people).map((x) => x.key)).toEqual(['cadre', 'city', 'designation']);
    expect(missingCoreFields(fields).map((x) => x.key)).toEqual(['batch', 'department']);
  });
});

describe('one field list for form, template, export and import', () => {
  it('orders standard fields first under standard names, then the user’s own', async () => {
    const { orderedFields, autoMap } = await import('@/lib/associates');
    const f = (key: string, label: string, type: 'text' | 'number' | 'phone', sort_order: number) => ({ id: key, key, label, type, sort_order });
    const fields = [
      f('phone', 'Phone', 'phone', 0), f('designation', 'Designation', 'text', 1), f('batch_year', 'Batch', 'number', 2),
      f('cadre', 'Cadre', 'text', 3), f('dept', 'Dept', 'text', 4), f('pa', 'PA name', 'text', 5),
    ];
    const ordered = orderedFields(fields);
    expect(ordered.map((x) => x.label)).toEqual(['Dept'.replace('Dept', 'Department'), 'Cadre', 'Designation', 'Batch year', 'Phone', 'PA name']);

    // the headers an export / template writes go straight back into the same fields on import
    const headers = ['Name', ...ordered.map((x) => x.label)];
    const map = autoMap(headers, fields, []);
    expect(map.map((c) => (c.target.kind === 'field' ? c.target.key : c.target.kind))).toEqual(
      ['name', 'dept', 'cadre', 'designation', 'batch_year', 'phone', 'pa'],
    );
  });
});

describe('years are shown without a thousands separator', () => {
  it('2010, not 2,010', async () => {
    const { displayValue } = await import('@/lib/associates');
    expect(displayValue({ type: 'number', key: 'batch', label: 'Batch year' }, 2010)).toBe('2010');
    expect(displayValue({ type: 'number', key: 'batch_year', label: 'Batch' }, 2015)).toBe('2015');
    expect(displayValue({ type: 'number', key: 'staff', label: 'Staff' }, 2500)).toBe('2,500');
  });
});
