// lib/departments.ts — the departments a user can belong to. Users pick from this list
// (no free text), so the directory never fills up with typos and made-up names.
//
// Change the list in .env.local (comma-separated, restart the app afterwards):
//   NEXT_PUBLIC_DEPARTMENTS=Administration,Executive,Finance & Accounts,IT / Software

const DEFAULT_DEPARTMENTS = [
  'Administration',
  'Executive',
  'Finance & Accounts',
  'Human Resources',
  'IT / Software',
  'Legal',
  'Operations',
  'Protocol',
  'Public Relations',
];

export const DEPARTMENTS: string[] = (() => {
  const custom = (process.env.NEXT_PUBLIC_DEPARTMENTS || '').split(',').map((d) => d.trim()).filter(Boolean);
  return custom.length ? [...new Set(custom)] : DEFAULT_DEPARTMENTS;
})();

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '');

/**
 * The list's spelling of a department, or '' when it isn't one. Ignores case, spaces and
 * punctuation, and also matches one part of a combined name ("software" → "IT / Software").
 */
export function canonicalDepartment(value: unknown, list: string[] = DEPARTMENTS): string {
  const v = norm(String(value ?? ''));
  if (!v) return '';
  return list.find((d) => norm(d) === v)
    ?? list.find((d) => d.split(/[/&,]| and /i).some((part) => norm(part) === v))
    ?? '';
}

/** Error text for a department, or null when it's fine (empty = no department, allowed). */
export function departmentError(value: unknown, list: string[] = DEPARTMENTS): string | null {
  if (!String(value ?? '').trim()) return null;
  return canonicalDepartment(value, list) ? null : 'Please choose a department from the list.';
}
