import pb, { getPocketBaseURL } from "@/lib/pocketbase"; // ★ NEW — gives us the logged-in user's token
import { orgIdOf, scopeFetch } from "@/lib/tenancy";
import { apiJSON } from "@/lib/apiClient";

/* Same address as the rest of the app: "/pb" (the Next.js proxy) in the browser,
   POCKETBASE_URL from .env.local on the server — nothing hard-coded. */
export const PB_BASE_URL = getPocketBaseURL();

export interface Employee {
  collectionId: string;
  collectionName: string;
  id: string;
  name: string;
  designation: string;
  department: string;
  contact_number: string;
  email: string;
  photo_url: string;
  created: string;
  updated: string;
}

export interface EmployeesResponse {
  page: number;
  perPage: number;
  totalPages: number;
  totalItems: number;
  items: Employee[];
}

export interface NewEmployeePayload {
  name: string;
  designation: string;
  department: string;
  contact_number: string;
  email: string;
  photo_url: string;
}

/**
 * ★ NEW — builds the Authorization header from the logged-in PocketBase user.
 * Without this every request returns 401 when API rules require auth.
 */
function authHeaders(): Record<string, string> {
  return pb.authStore.isValid ? { Authorization: pb.authStore.token } : {};
}

/** GET employees list */
export async function fetchEmployees(
  page = 1,
  perPage = 30,
  signal?: AbortSignal
): Promise<EmployeesResponse> {
  // ★ FIX: was missing "/records" — that wrong endpoint was causing the 401
  const url = scopeFetch(`${PB_BASE_URL}/api/collections/employees/records?page=${page}&perPage=${perPage}`, pb.authStore.record as any);
  const res = await fetch(url, {
    signal,
    cache: "no-store",
    headers: authHeaders(), // ★ FIX: send login token
  });
  if (!res.ok) throw new Error(`Failed to fetch employees (${res.status})`);
  return res.json();
}

/** POST a new employee record */
export async function createEmployee(
  payload: NewEmployeePayload
): Promise<Employee> {
  const res = await fetch(`${PB_BASE_URL}/api/collections/employees/records`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(), // ★ FIX: create would also 401 without the token
    },
    body: JSON.stringify({ ...payload, org: orgIdOf(pb.authStore.record as any) || undefined }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.message ?? `Failed to create employee (${res.status})`);
  }
  return res.json();
}

/** PocketBase dates like "2026-09-18 09:52:52.153Z" — normalized for Safari too */
export function formatPBDate(value?: string): string {
  if (!value) return "—";
  const d = new Date(value.replace(" ", "T"));
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
/* ───────────── Employees directory: HRMS + employees added in the app ───────────── */

/** One row of the directory. `source: 'hrms'` rows are read-only (maintained in the HRMS). */
export type DirectoryEmployee = {
  id: string;
  source: 'hrms' | 'app';
  name: string;
  designation: string;
  department: string;
  contact_number: string;
  email: string;
  photo_url: string;
  emp_id?: number;
  branch?: string;
  date_of_joining?: string;
  role?: string;
  created?: string;
  updated?: string;
  [k: string]: any;
};

/**
 * Everyone in the directory: the HRMS list (/api/employees/hrms) plus employees added in this app.
 * An app employee whose email is also in the HRMS is left out (the HRMS copy wins).
 * Either source failing still returns the other one.
 */
export async function loadDirectoryEmployees({ fresh = false } = {}): Promise<{ employees: DirectoryEmployee[]; hrmsError: string }> {
  const [hrms, app] = await Promise.allSettled([
    apiJSON<{ employees: any[] }>('/api/employees/hrms', { fresh }, { timeoutMs: 45_000 }),
    pb.collection('employees').getFullList({ sort: 'name', requestKey: null }),
  ]);

  const fromHrms: DirectoryEmployee[] = hrms.status === 'fulfilled'
    ? hrms.value.employees.map((e) => ({ ...e, id: `hrms-${e.emp_id}`, source: 'hrms' as const, photo_url: '' }))
    : [];
  const hrmsEmails = new Set(fromHrms.map((e) => e.email).filter(Boolean));
  const fromApp: DirectoryEmployee[] = app.status === 'fulfilled'
    ? app.value
      .filter((e: any) => !e.email || !hrmsEmails.has(String(e.email).toLowerCase()))
      .map((e: any) => ({ ...e, source: 'app' as const }))
    : [];

  return {
    employees: [...fromHrms, ...fromApp].sort((a, b) => a.name.localeCompare(b.name)),
    hrmsError: hrms.status === 'rejected' ? (hrms.reason?.message || 'HRMS unavailable') : '',
  };
}
