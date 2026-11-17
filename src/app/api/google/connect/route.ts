// app/api/google/connect/route.ts — returns Google's consent URL to (re)connect a sender account.
// Admins may connect any sender; any other user only the sender that is their own email.
import { NextRequest, NextResponse } from 'next/server';
import { createOAuthClient, createState, getRedirectUri, GOOGLE_SCOPES } from '@/lib/googleAuth';
import { requireGoogleOrg, requireUser } from '@/lib/serverAuth';
import { roleOf } from '@/lib/roles';
import { getSender } from '@/lib/senders';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const auth = await requireUser(req, 'viewer');
  if (auth instanceof NextResponse) return auth;
  // only members of the organisation that owns the Google accounts may replace one
  const noGoogle = await requireGoogleOrg(req, auth);
  if (noGoogle) return noGoogle;

  // which sender account to (re)connect — { sender: "s2" }; default the main one
  const { sender: senderId } = await req.json().catch(() => ({}));
  const sender = getSender(senderId);
  const ownAccount = !!sender.email && sender.email.toLowerCase() === String(auth.email || '').toLowerCase();
  if (roleOf(auth) !== 'admin' && !ownAccount) {
    return NextResponse.json({ error: 'Only an admin, or the owner of this account, can connect it' }, { status: 403 });
  }

  const client = createOAuthClient(getRedirectUri(req.nextUrl.origin));
  const url = client.generateAuthUrl({
    access_type: 'offline', // → refresh token
    prompt: 'consent',      // → always return a fresh refresh token
    scope: GOOGLE_SCOPES,
    state: createState(auth.id, sender.id),
    ...(sender.email && { login_hint: sender.email }), // Google pre-selects that account
  });
  return NextResponse.json({ url });
}
