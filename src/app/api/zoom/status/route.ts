// app/api/zoom/status/route.ts — is Zoom set up (lib/zoom)? Any signed-in user may ask; no secrets returned.
import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/serverAuth';
import { zoomConfigured } from '@/lib/zoom';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const user = await requireUser(req, 'viewer');
  if (user instanceof NextResponse) return user;
  return NextResponse.json({ configured: zoomConfigured() });
}
