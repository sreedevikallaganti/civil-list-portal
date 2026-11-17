// app/api/google/callback/route.ts — receives the OAuth code and stores the new refresh token
import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';
import { createOAuthClient, getRedirectUri, saveRefreshToken, verifyState } from '@/lib/googleAuth';
import { getSender } from '@/lib/senders';

export const runtime = 'nodejs';

const page = (title: string, body: string) =>
  new NextResponse(
    `<!doctype html><meta charset="utf-8"><title>${title}</title>
     <div style="font-family:Segoe UI,Arial,sans-serif;max-width:480px;margin:80px auto;text-align:center">
       <h2>${title}</h2><p style="color:#64748b">${body}</p>
       <p><a href="/settings#google" style="color:#4f46e5">Back to Settings → Google accounts</a></p>
     </div>`,
    { headers: { 'Content-Type': 'text/html; charset=utf-8' } },
  );

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code');
  const error = req.nextUrl.searchParams.get('error');
  if (!error && !code) {
    // opened directly — this address is only meant for Google to come back to after sign-in
    return page('Nothing to do here', 'This page is only used by Google after you sign in. To connect an account, go to Settings → Google accounts and click Connect.');
  }
  if (error || !code) return page('Google connection cancelled', error === 'access_denied' ? 'Permission wasn’t given on the Google screen. Click Connect again and choose Allow.' : error || 'No authorization code received.');
  const state = verifyState(req.nextUrl.searchParams.get('state'));
  if (!state) {
    return page('Link expired', 'The sign-in link is older than 10 minutes. Start again from Settings → Google accounts → Connect (admins only).');
  }

  try {
    const auth = createOAuthClient(getRedirectUri(req.nextUrl.origin));
    const { tokens } = await auth.getToken(code);
    if (!tokens.refresh_token) {
      return page('No refresh token returned',
        'Remove this app at myaccount.google.com/permissions, then click Reconnect again.');
    }
    const sender = getSender(state.senderId);

    // the account that signed in must be the one being connected (its primary calendar id is its email)
    auth.setCredentials(tokens);
    const signedIn = await google.calendar({ version: 'v3', auth }).calendars.get({ calendarId: 'primary' })
      .then((r) => String(r.data.id || '').toLowerCase()).catch(() => '');
    if (sender.email && signedIn && signedIn !== sender.email.toLowerCase() && sender.id !== 'main') {
      return page('Wrong Google account',
        `You signed in as ${signedIn}, but this connects ${sender.email}. Click Connect again and choose ${sender.email}.`);
    }

    saveRefreshToken(tokens.refresh_token, sender.id);
    return page('✅ Google connected', `${signedIn || sender.label} is connected — Calendar, Meet and invites will be sent from it. You can close this tab.`);
  } catch (err: any) {
    console.error('[api/google/callback]', err?.response?.data || err);
    return page('Google connection failed', err?.response?.data?.error_description || err?.message || 'Unknown error');
  }
}
