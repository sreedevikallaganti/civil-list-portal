export const PB_BASE_URL =
  process.env.NEXT_PUBLIC_PB_URL ?? "http://172.30.0.200:8091";

export interface PBUser {
  collectionId: string;
  collectionName: string;
  id: string;
  email: string;
  emailVisibility: boolean;
  verified: boolean;
  name: string;
  avatar: string;          // filename ("" if none) — NOT a full URL
  department?: string;
  permissions?: string;
  created: string;
  updated: string;
}

export interface UsersResponse {
  page: number;
  perPage: number;
  totalPages: number;
  totalItems: number;
  items: PBUser[];
}

export interface NewUserPayload {
  name: string;
  email: string;
  password: string;
  passwordConfirm: string;
  department?: string;
  permissions?: string;
}

/* ---------- Auth header ----------
   PocketBase JS SDK stores its auth in localStorage under "pocketbase_auth".
   If your AuthContext keeps the token elsewhere, adjust here — everything
   else picks it up automatically. */
function getAuthHeaders(): HeadersInit {
  try {
    const raw = localStorage.getItem("pocketbase_auth");
    const parsed = raw ? JSON.parse(raw) : null;
    if (parsed?.token) return { Authorization: parsed.token };
  } catch { /* ignore */ }
  return {};
}

/** GET users (auth collections always need /records) */
export async function fetchUsers(
  page = 1,
  perPage = 30,
  signal?: AbortSignal
): Promise<UsersResponse> {
  const url = `${PB_BASE_URL}/api/collections/users/records?page=${page}&perPage=${perPage}&sort=-created`;
  const res = await fetch(url, { signal, cache: "no-store", headers: getAuthHeaders() });
  if (!res.ok) throw new Error(`Failed to fetch users (${res.status})`);
  return res.json();
}

/** POST new auth record — password + passwordConfirm are mandatory */
export async function createUser(payload: NewUserPayload): Promise<PBUser> {
  const res = await fetch(`${PB_BASE_URL}/api/collections/users/records`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...getAuthHeaders() },
    body: JSON.stringify({ ...payload, emailVisibility: true }), // so emails show in the list
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    // PocketBase returns per-field errors: { data: { email: { message: "..." } } }
    const fieldError =
      body?.data && Object.values(body.data)[0]?.message;
    throw new Error(fieldError ?? body?.message ?? `Failed to create user (${res.status})`);
  }
  return res.json();
}

/** Build the file URL for the avatar field */
export function avatarFileUrl(user: PBUser): string {
  if (!user.avatar) return "";
  return `${PB_BASE_URL}/api/files/${user.collectionId}/${user.id}/${user.avatar}`;
}

export function formatPBDate(value?: string): string {
  if (!value) return "—";
  const d = new Date(value.replace(" ", "T"));
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString("en-IN", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}