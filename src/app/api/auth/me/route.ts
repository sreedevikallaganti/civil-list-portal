// app/api/auth/me/route.ts — "am I signed in, and as whom?" Checks the Authorization token.
import { NextRequest, NextResponse } from 'next/server';
import { publicUser, requireUser } from '@/lib/serverAuth';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const user = await requireUser(req, 'viewer'); // any active account
  if (user instanceof NextResponse) return user;
  return NextResponse.json({ signedIn: true, user: publicUser(user) }, { headers: { 'Cache-Control': 'no-store' } });
}
