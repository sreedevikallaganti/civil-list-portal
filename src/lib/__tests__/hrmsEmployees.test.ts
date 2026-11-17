import { describe, expect, it } from 'vitest';
import { canonicalNames, groupKey, mapHrmsEmployees, titleCase } from '../hrmsEmployees';

const row = (EmpId: number, over: Record<string, string> = {}) => ({
  EmpId, FirstName: `Person ${EmpId}`, DOB: '1990-01-01', DOJ: '2024-05-06', Branch: 'CORPORATE OFFICE',
  Department: 'Software', Designation: 'Engineer', CompanyEmail: `P${EmpId}@Example.com`, CompanyCellNo: '98765 43210', Role: 'Employee',
  ...over,
});

describe('hrmsEmployees', () => {
  it('title-cases capitals but keeps acronyms', () => {
    expect(titleCase('NEW PRODUCT DEVELOPMENT')).toBe('New Product Development');
    expect(titleCase('HR & ADMIN')).toBe('HR & Admin');
    expect(titleCase('SOLAR - PROJECTS')).toBe('Solar - Projects');
  });

  it('groups every spelling of the same department', () => {
    expect(groupKey('Projects ')).toBe(groupKey('PROJECTS'));
    expect(groupKey('Solar - Projects')).toBe(groupKey('PROJECTS SOLAR'));
    expect(groupKey('PURCHASE & STORES')).toBe(groupKey('Stores & Purchase'));
    expect(groupKey('STORE')).toBe(groupKey('STORES'));
    expect(groupKey('Technical')).not.toBe(groupKey('Technical Support'));
  });

  it('picks the most used mixed-case spelling as the name', () => {
    const names = canonicalNames(['PROJECTS', 'PROJECTS ', 'Projects', 'Projects ', 'SOFTWARE', 'SOFTWARE', 'Software', 'GYM ASSISTANT']);
    expect(names.get(groupKey('projects'))).toBe('Projects');
    expect(names.get(groupKey('software'))).toBe('Software');
    expect(names.get(groupKey('gym assistant'))).toBe('Gym Assistant'); // only capitals → title-cased
  });

  it('maps rows to clean employee records, one per EmpId', () => {
    const { records, skipped } = mapHrmsEmployees([
      row(1, { FirstName: 'PICHUKA SURESH', Department: 'PROJECTS ', Branch: 'SR NAGAR' }),
      row(2, { Department: 'Projects', Branch: 'SR Nagar' }),
      row(2, { FirstName: 'Duplicate' }),
      row(0),
    ]);
    expect(records).toHaveLength(2);
    expect(records[0]).toMatchObject({
      emp_id: 1, name: 'Pichuka Suresh', department: 'Projects', branch: 'SR Nagar',
      email: 'p1@example.com', contact_number: '9876543210', date_of_joining: '2024-05-06', role: 'Employee',
    });
    expect(records[1].department).toBe('Projects');
    expect(skipped.map((s) => s.reason)).toEqual(['duplicate EmpId', 'no EmpId']);
  });
});
