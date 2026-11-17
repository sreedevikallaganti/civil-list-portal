// app/api/auth/login/route.ts — ONE login for everyone (same rules as the /login page):
//   1. the app's "users" collection (Admin, Super Admin, Editor, Viewer — set by the role field)
//   2. if the email/password isn't there: PocketBase "_superusers" (database owners → admin)
//   3. accounts whose status isn't "Active" are refused
// Returns the token (send it as the Authorization header) and who signed in.
import { NextRequest, NextResponse } from 'next/server';
import { pbURL, publicUser } from '@/lib/serverAuth';

export const runtime = 'nodejs';

async function authWithPassword(collection: string, identity: string, password: string) {
  const res = await fetch(`${pbURL()}/api/collections/${collection}/auth-with-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identity, password }),
    cache: 'no-store',
  });
  return { status: res.status, data: await res.json().catch(() => ({})) };
}

export async function POST(req: NextRequest) {
  const { email, password } = await req.json().catch(() => ({}));
  const identity = String(email || '').trim().toLowerCase();
  if (!identity || !password) {
    return NextResponse.json({ error: 'Please enter your email and password.' }, { status: 400 });
  }

  let result;
  try {
    result = await authWithPassword('users', identity, String(password));
    if (result.status === 400) result = await authWithPassword('_superusers', identity, String(password));
  } catch (e) {
    console.error('[login] PocketBase unreachable:', e);
    return NextResponse.json({ error: 'We can’t connect right now — please try again in a moment.' }, { status: 503 });
  }

  if (result.status !== 200 || !result.data?.token) {
    // same message whichever part was wrong — doesn't reveal which emails exist
    return NextResponse.json({ error: 'Invalid email or password.' }, { status: 401 });
  }

  const record = result.data.record;
  if (record?.status && String(record.status).toLowerCase() !== 'active') {
    return NextResponse.json(
      { error: 'This account is deactivated and is not authorized to access the Civillist Portal.' },
      { status: 403 },
    );
  }

  return NextResponse.json({ token: result.data.token, user: publicUser(record) }, { headers: { 'Cache-Control': 'no-store' } });
}
