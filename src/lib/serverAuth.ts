// lib/serverAuth.ts — guards Next.js API routes with the caller's PocketBase session.
//
// The browser sends its PocketBase token as `Authorization: <token>` (see lib/apiClient.ts).
// We ask PocketBase to refresh it: a valid token returns the user record, anything else is 401.
// Results are cached briefly so a burst of requests doesn't hit PocketBase every time.
import { NextRequest, NextResponse } from 'next/server';
import { roleOf, type Role } from './roles';

type AuthUser = { id: string; email?: string; name?: string; permissions?: string | string[]; role?: string; status?: string; collectionName?: string; org?: string };

const CACHE_MS = 60_000;
const cache = new Map<string, { user: AuthUser; at: number }>();

export function pbURL() {
  const url = process.env.POCKETBASE_URL || process.env.NEXT_PUBLIC_POCKETBASE_URL;
  if (!url) throw new Error('POCKETBASE_URL is not set');
  return url.replace(/\/+$/, '');
}

async function verifyToken(token: string): Promise<AuthUser | null> {
  const hit = cache.get(token);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.user;

  // one login for everyone: the token belongs to "users" or to PocketBase "_superusers"
  const refresh = (collection: string) =>
    fetch(`${pbURL()}/api/collections/${collection}/auth-refresh`, {
      method: 'POST',
      headers: { Authorization: token },
      cache: 'no-store',
    }).catch(() => null);
  let res = await refresh('users');
  if (!res?.ok) res = await refresh('_superusers');
  if (!res?.ok) return null;

  const { record } = await res.json();
  if (!record?.id) return null;
  if (record.status && String(record.status).toLowerCase() !== 'active') return null;

  if (cache.size > 500) cache.clear();
  cache.set(token, { user: record, at: Date.now() });
  return record;
}

const RANK: Record<Role, number> = { viewer: 0, editor: 1, admin: 2 };

/** Drop a token from the verification cache (logout) so it isn't accepted from cache afterwards. */
export function forgetToken(token: string) {
  cache.delete(token);
}

/** The signed-in user as the API shows it — who they are and what the app lets them do. */
export function publicUser(record: AuthUser & { department?: string }) {
  const isSuperuser = record.collectionName === '_superusers';
  const access = roleOf(record);
  return {
    id: record.id,
    name: record.name || '',
    email: record.email || '',
    account: isSuperuser ? 'PocketBase superuser' : 'App user',
    role: record.role || (isSuperuser ? 'Superuser' : ''),
    access, // what the app actually allows: admin | editor | viewer
    department: record.department || '',
    status: record.status || '',
    org: record.org || '',
  };
}

/**
 * Returns the signed-in user, or a ready-to-return 401/403 response.
 *   const auth = await requireUser(req, 'editor');
 *   if (auth instanceof NextResponse) return auth;
 */
export async function requireUser(req: NextRequest, minRole: Role = 'editor'): Promise<AuthUser | NextResponse> {
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
  if (!token) return NextResponse.json({ error: 'Sign in required' }, { status: 401 });

  const user = await verifyToken(token);
  if (!user) return NextResponse.json({ error: 'Your session has expired — please sign in again' }, { status: 401 });

  if (RANK[roleOf(user)] < RANK[minRole]) {
    return NextResponse.json({ error: 'You do not have permission to do this' }, { status: 403 });
  }
  return user;
}

/* ── multi-tenancy (lib/tenancy) ── */

const isOrgId = (v: unknown): v is string => typeof v === 'string' && /^[a-z0-9]{15}$/i.test(v);

/**
 * The organisation a request acts for: an app user's own org — never anything else —
 * or, for a PocketBase superuser (platform owner), the org picked in the app (X-Org header).
 * '' = no organisation (multi-tenancy not set up yet).
 */
export function orgOfRequest(req: NextRequest, user: AuthUser): string {
  if (user.collectionName === '_superusers') {
    const h = req.headers.get('x-org') || '';
    return isOrgId(h) ? h : '';
  }
  return isOrgId(user.org) ? user.org : '';
}

const orgCache = new Map<string, { at: number; org: { google_enabled?: boolean; status?: string } | null }>();

/** The organisation record, read with the caller's own session (so the API rules apply). Cached a minute. */
async function loadOrg(req: NextRequest, orgId: string) {
  const hit = orgCache.get(orgId);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.org;
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
  const res = await fetch(`${pbURL()}/api/collections/organizations/records/${orgId}`, {
    headers: { Authorization: token }, cache: 'no-store',
  }).catch(() => null);
  let org = res?.ok ? await res.json() : null;
  if (res?.status === 404) {
    // no `organizations` collection at all = multi-tenancy isn't set up → nothing to restrict
    // (same rule as OrgContext in the browser; a user may still carry an old `org` value)
    const list = await fetch(`${pbURL()}/api/collections/organizations/records?perPage=1&skipTotal=1`, {
      headers: { Authorization: token }, cache: 'no-store',
    }).catch(() => null);
    if (list?.status === 404) org = { google_enabled: true };
  }
  if (orgCache.size > 200) orgCache.clear();
  orgCache.set(orgId, { at: Date.now(), org });
  return org;
}

/**
 * Google Calendar / Meet is one shared Google account (.env.local), so only organisations with
 * google_enabled may use it. Returns a 403 response for the others; null = allowed.
 * Before multi-tenancy is set up (no org at all) everything works as before.
 */
export async function requireGoogleOrg(req: NextRequest, user: AuthUser): Promise<NextResponse | null> {
  const orgId = orgOfRequest(req, user);
  if (!orgId) return null;
  const org = await loadOrg(req, orgId);
  if (org?.google_enabled) return null;
  return NextResponse.json(
    { error: 'Google Calendar isn’t enabled for your organisation.', googleDisabled: true },
    { status: 403 },
  );
}

/** Escapes text before it goes into an HTML email. */
export function esc(v: unknown) {
  return String(v ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}

/** Only http(s) links may be put in an href. */
export function safeUrl(v: unknown) {
  const s = String(v ?? '').trim();
  return /^https?:\/\//i.test(s) ? s : '';
}
