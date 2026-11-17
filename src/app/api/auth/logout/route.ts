// app/api/auth/logout/route.ts — the logout counterpart of /api/auth/login.
// PocketBase tokens are stateless: logging out means the client deletes its token (the app does
// pb.authStore.clear()). This route also drops the token from the server's verification cache.
import { NextRequest, NextResponse } from 'next/server';
import { forgetToken } from '@/lib/serverAuth';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
  if (token) forgetToken(token);
  return NextResponse.json({
    ok: true,
    message: 'Signed out. Delete the token on your side — it stays valid until it expires if you keep it.',
  });
}
