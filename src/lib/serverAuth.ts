// lib/serverAuth.ts — guards Next.js API routes with the caller's PocketBase session.
//
// The browser sends its PocketBase token as `Authorization: <token>` (see lib/apiClient.ts).
// We ask PocketBase to refresh it: a valid token returns the user record, anything else is 401.
// Results are cached briefly so a burst of requests doesn't hit PocketBase every time.
import { NextRequest, NextResponse } from 'next/server';
import { roleOf, type Role } from './roles';

type AuthUser = { id: string; email?: string; name?: string; permissions?: string; status?: string };

const CACHE_MS = 60_000;
const cache = new Map<string, { user: AuthUser; at: number }>();

function pbURL() {
  const url = process.env.POCKETBASE_URL || process.env.NEXT_PUBLIC_POCKETBASE_URL;
  if (!url) throw new Error('POCKETBASE_URL is not set');
  return url.replace(/\/+$/, '');
}

async function verifyToken(token: string): Promise<AuthUser | null> {
  const hit = cache.get(token);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.user;

  const res = await fetch(`${pbURL()}/api/collections/users/auth-refresh`, {
    method: 'POST',
    headers: { Authorization: token },
    cache: 'no-store',
  }).catch(() => null);
  if (!res?.ok) return null;

  const { record } = await res.json();
  if (!record?.id) return null;
  if (record.status && String(record.status).toLowerCase() !== 'active') return null;

  if (cache.size > 500) cache.clear();
  cache.set(token, { user: record, at: Date.now() });
  return record;
}

const RANK: Record<Role, number> = { viewer: 0, editor: 1, admin: 2 };

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
