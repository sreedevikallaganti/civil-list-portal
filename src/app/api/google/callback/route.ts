// app/api/google/callback/route.ts — receives the OAuth code and stores the new refresh token
import { NextRequest, NextResponse } from 'next/server';
import { createOAuthClient, getRedirectUri, saveRefreshToken, verifyState } from '@/lib/googleAuth';

export const runtime = 'nodejs';

const page = (title: string, body: string) =>
  new NextResponse(
    `<!doctype html><meta charset="utf-8"><title>${title}</title>
     <div style="font-family:Segoe UI,Arial,sans-serif;max-width:480px;margin:80px auto;text-align:center">
       <h2>${title}</h2><p style="color:#64748b">${body}</p>
       <p><a href="/meetings" style="color:#4f46e5">Back to Meetings</a></p>
     </div>`,
    { headers: { 'Content-Type': 'text/html; charset=utf-8' } },
  );

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code');
  const error = req.nextUrl.searchParams.get('error');
  if (error || !code) return page('Google connection cancelled', error || 'No authorization code received.');
  if (!verifyState(req.nextUrl.searchParams.get('state'))) {
    return page('Link expired', 'Start again from “Reconnect Google” in the Meetings page (admins only).');
  }

  try {
    const auth = createOAuthClient(getRedirectUri(req.nextUrl.origin));
    const { tokens } = await auth.getToken(code);
    if (!tokens.refresh_token) {
      return page('No refresh token returned',
        'Remove this app at myaccount.google.com/permissions, then click Reconnect again.');
    }
    saveRefreshToken(tokens.refresh_token);
    return page('✅ Google connected', 'Calendar, Meet and invites will work again. You can close this tab.');
  } catch (err: any) {
    console.error('[api/google/callback]', err?.response?.data || err);
    return page('Google connection failed', err?.response?.data?.error_description || err?.message || 'Unknown error');
  }
}
