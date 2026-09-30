// app/api/google/connect/route.ts — admin-only: returns Google's consent URL to (re)connect the calendar account
import { NextRequest, NextResponse } from 'next/server';
import { createOAuthClient, createState, getRedirectUri, GOOGLE_SCOPES } from '@/lib/googleAuth';
import { requireUser } from '@/lib/serverAuth';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const auth = await requireUser(req, 'admin');
  if (auth instanceof NextResponse) return auth;

  const client = createOAuthClient(getRedirectUri(req.nextUrl.origin));
  const url = client.generateAuthUrl({
    access_type: 'offline', // → refresh token
    prompt: 'consent',      // → always return a fresh refresh token
    scope: GOOGLE_SCOPES,
    state: createState(auth.id),
  });
  return NextResponse.json({ url });
}
