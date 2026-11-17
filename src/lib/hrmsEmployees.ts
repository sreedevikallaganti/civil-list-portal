// lib/hrmsEmployees.ts — turns the HRMS employee list into clean records for the
// `employees` collection. Pure: rows in, records out — no network, easy to test.
// Used by /api/employees/sync.
//
// HRMS row: { EmpId, FirstName, DOB, DOJ, Branch, Department, Designation, CompanyEmail, CompanyCellNo, Role }
// The HRMS data spells the same department many ways ("Projects", "PROJECTS ", "Projects Solar",
// "SOLAR - PROJECTS", "STORES & PURCHASE" …) — those are merged into one name each.

export type HrmsEmployee = {
  EmpId: number | string;
  FirstName?: string;
  DOB?: string;
  DOJ?: string;
  Branch?: string;
  Department?: string;
  Designation?: string;
  CompanyEmail?: string;
  CompanyCellNo?: string;
  Role?: string;
};

export type EmployeeRecord = {
  emp_id: number;
  name: string;
  designation: string;
  department: string;
  branch: string;
  email: string;
  contact_number: string;
  date_of_joining: string; // YYYY-MM-DD or ''
  role: string;
};

/* words kept in capitals when a value is title-cased */
const ACRONYMS = new Set(['HR', 'IT', 'BDM', 'SEO', 'IOCL', 'MSRTC', 'TGBI', 'CEO', 'CFO', 'CTO', 'GM', 'AGM', 'DGM', 'MD', 'QA', 'UI', 'UX', 'SR', 'R&D']);
const SMALL = new Set(['and', 'of', 'the', 'for', 'in', 'to']);

const squash = (s: unknown) => String(s ?? '').replace(/\s+/g, ' ').trim();
const isAllCaps = (s: string) => /[A-Z]/.test(s) && s === s.toUpperCase();

/** "NEW PRODUCT DEVELOPMENT" → "New Product Development", keeps HR / IT / BDM … */
export function titleCase(value: unknown): string {
  return squash(value).split(' ').map((word, i) =>
    word.split(/([-/&().])/).map((part) => {
      if (!part || /^[-/&().]$/.test(part)) return part;
      if (ACRONYMS.has(part.toUpperCase())) return part.toUpperCase();
      const lower = part.toLowerCase();
      if (i > 0 && SMALL.has(lower)) return lower;
      return lower[0].toUpperCase() + lower.slice(1);
    }).join(''),
  ).join(' ');
}

/** Words of a name, singular, lower-case and sorted — equal for every spelling of the same thing. */
export function groupKey(value: unknown): string {
  const words = squash(value).toLowerCase().split(/[^a-z0-9]+/)
    .filter((w) => w && w !== 'and')
    .map((w) => (w.length > 3 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w));
  return [...new Set(words)].sort().join(' ');
}

/**
 * One display name per group: the most used mixed-case spelling ("Stores & Purchase"),
 * or the title-cased most used spelling when the data only has capitals.
 */
export function canonicalNames(values: unknown[]): Map<string, string> {
  const groups = new Map<string, Map<string, number>>();
  for (const v of values) {
    const s = squash(v);
    const key = groupKey(s);
    if (!key) continue;
    const g = groups.get(key) ?? new Map<string, number>();
    g.set(s, (g.get(s) || 0) + 1);
    groups.set(key, g);
  }
  const out = new Map<string, string>();
  for (const [key, spellings] of groups) {
    const ranked = [...spellings.entries()].sort((a, b) => b[1] - a[1] || b[0].length - a[0].length || a[0].localeCompare(b[0]));
    const mixed = ranked.find(([s]) => !isAllCaps(s));
    out.set(key, mixed ? mixed[0] : titleCase(ranked[0][0]));
  }
  return out;
}

const digits = (s: unknown) => String(s ?? '').replace(/\D/g, '');
const isoDate = (s: unknown) => (/^\d{4}-\d{2}-\d{2}/.test(String(s ?? '')) ? String(s).slice(0, 10) : '');

/** HRMS rows → clean records (one per EmpId; later duplicates are reported, not imported). */
export function mapHrmsEmployees(rows: HrmsEmployee[]) {
  const depts = canonicalNames(rows.map((r) => r.Department));
  const branches = canonicalNames(rows.map((r) => r.Branch));
  const seen = new Set<number>();
  const records: EmployeeRecord[] = [];
  const skipped: { empId: unknown; reason: string }[] = [];

  for (const r of rows) {
    const empId = Number(r.EmpId);
    if (!Number.isFinite(empId) || empId <= 0) { skipped.push({ empId: r.EmpId, reason: 'no EmpId' }); continue; }
    if (seen.has(empId)) { skipped.push({ empId, reason: 'duplicate EmpId' }); continue; }
    const name = squash(r.FirstName);
    if (!name) { skipped.push({ empId, reason: 'no name' }); continue; }
    seen.add(empId);
    records.push({
      emp_id: empId,
      name: isAllCaps(name) ? titleCase(name) : name,
      designation: isAllCaps(squash(r.Designation)) ? titleCase(r.Designation) : squash(r.Designation),
      department: depts.get(groupKey(r.Department)) || '',
      branch: branches.get(groupKey(r.Branch)) || '',
      email: squash(r.CompanyEmail).toLowerCase(),
      contact_number: digits(r.CompanyCellNo),
      date_of_joining: isoDate(r.DOJ),
      role: squash(r.Role),
    });
  }
  return { records, skipped };
}
