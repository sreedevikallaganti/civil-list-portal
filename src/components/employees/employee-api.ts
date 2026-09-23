import pb from "@/lib/pocketbase"; // ★ NEW — gives us the logged-in user's token

export const PB_BASE_URL =
  process.env.NEXT_PUBLIC_PB_URL ?? "http://172.30.0.200:8091";

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
  const url = `${PB_BASE_URL}/api/collections/employees/records?page=${page}&perPage=${perPage}`;
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
    body: JSON.stringify(payload),
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