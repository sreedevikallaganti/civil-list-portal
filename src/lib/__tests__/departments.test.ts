import { describe, expect, it } from 'vitest';
import { canonicalDepartment, departmentError } from '../departments';

const LIST = ['Administration', 'Executive', 'IT / Software', 'Finance & Accounts'];

describe('departments', () => {
  it('maps any casing / spacing to the list’s spelling', () => {
    expect(canonicalDepartment('administration', LIST)).toBe('Administration');
    expect(canonicalDepartment('  EXECUTIVE ', LIST)).toBe('Executive');
    expect(canonicalDepartment('it/software', LIST)).toBe('IT / Software');
    expect(canonicalDepartment('software', LIST)).toBe('IT / Software');   // one part of a combined name
    expect(canonicalDepartment('Accounts', LIST)).toBe('Finance & Accounts');
  });

  it('rejects made-up departments', () => {
    expect(canonicalDepartment('sdfghjkl;', LIST)).toBe('');
    expect(departmentError('sdfghjkl;', LIST)).toBe('Please choose a department from the list.');
    expect(departmentError('Executive', LIST)).toBeNull();
    expect(departmentError('', LIST)).toBeNull(); // no department is allowed
  });
});
