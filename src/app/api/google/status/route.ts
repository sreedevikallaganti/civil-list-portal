// app/api/google/status/route.ts — is the Google account (Calendar / Meet / invites) still connected?
// Any signed-in user may ask. The check itself lives in lib/googleStatus (shared with /api/health).
import { NextRequest, NextResponse } from 'next/server';
import { checkGoogle } from '@/lib/googleStatus';
import { requireGoogleOrg, requireUser } from '@/lib/serverAuth';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const user = await requireUser(req, 'viewer');
  if (user instanceof NextResponse) return user;
  if (await requireGoogleOrg(req, user)) return NextResponse.json({ connected: null, reason: 'disabled', message: 'Google isn’t enabled for this organisation' });

  const { fresh = false } = await req.json().catch(() => ({}));
  return NextResponse.json(await checkGoogle(!!fresh));
}
