// app/api/employees/hrms/route.ts — the HRMS employee list for the Employees directory and the
// meeting form, cleaned up by lib/hrmsEmployees (merged department spellings, tidy names).
// Read-only: employees are maintained in the HRMS. Signed-in users only; date of birth is never sent.
//   POST {}               → { employees, fetchedAt }
//   POST { fresh: true }  → skip the 5-minute cache
import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/serverAuth';
import { mapHrmsEmployees, type EmployeeRecord, type HrmsEmployee } from '@/lib/hrmsEmployees';

export const runtime = 'nodejs';

const HRMS_URL = () => (process.env.HRMS_EMPLOYEES_URL || 'https://hrms.brihaspathi.in/api/locationtracking/employees').trim();
const CACHE_MS = 5 * 60_000;
let cache: { at: number; employees: EmployeeRecord[] } | null = null;

export async function POST(req: NextRequest) {
  const user = await requireUser(req, 'viewer');
  if (user instanceof NextResponse) return user;
  const { fresh = false } = await req.json().catch(() => ({}));

  if (!fresh && cache && Date.now() - cache.at < CACHE_MS) {
    return NextResponse.json({ employees: cache.employees, fetchedAt: cache.at });
  }
  try {
    const res = await fetch(HRMS_URL(), { cache: 'no-store', signal: AbortSignal.timeout(30_000) });
    const body = await res.json().catch(() => null);
    if (!res.ok || !Array.isArray(body?.data)) throw new Error(`HRMS answered ${res.status}`);
    cache = { at: Date.now(), employees: mapHrmsEmployees(body.data as HrmsEmployee[]).records };
    return NextResponse.json({ employees: cache.employees, fetchedAt: cache.at });
  } catch (err: any) {
    console.error('[employees/hrms]', err?.message || err);
    // HRMS down — the last good list is better than nothing
    if (cache) return NextResponse.json({ employees: cache.employees, fetchedAt: cache.at, stale: true });
    return NextResponse.json({ error: 'Couldn’t load the employee list from HRMS right now — please try again later.' }, { status: 502 });
  }
}
