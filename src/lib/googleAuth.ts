// lib/googleAuth.ts — server-only Google OAuth client with a self-updating refresh-token store.
//
// Access tokens (1 h) are refreshed automatically by googleapis on every call.
// The refresh token itself is read from .google-token.json (written by /api/google/callback)
// and falls back to GOOGLE_REFRESH_TOKEN in .env.local. If Google ever rotates the refresh
// token, the new one is saved automatically — nobody has to edit .env.local again.
//
// Several sender accounts (lib/senders): the main one keeps .google-token.json, the others
// get .google-token-<id>.json (e.g. .google-token-s2.json). Every function takes the sender id.
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { google } from 'googleapis';
import { getSender } from './senders';

const tokenFile = (senderId = 'main') =>
  path.join(process.cwd(), senderId === 'main' ? '.google-token.json' : `.google-token-${senderId.replace(/[^a-z0-9]/gi, '')}.json`);

export const GOOGLE_SCOPES = [
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/calendar.events',
];

function readStoredRefreshToken(senderId = 'main'): string | null {
  try {
    const data = JSON.parse(fs.readFileSync(tokenFile(senderId), 'utf8'));
    return data.refresh_token || null;
  } catch {
    return null;
  }
}

export function saveRefreshToken(refresh_token: string, senderId = 'main') {
  fs.writeFileSync(tokenFile(senderId), JSON.stringify({ refresh_token, saved_at: new Date().toISOString() }, null, 2));
}

export function getRedirectUri(origin: string) {
  return process.env.GOOGLE_REDIRECT_URI || `${origin}/api/google/callback`;
}

export function createOAuthClient(redirectUri?: string) {
  const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET } = process.env;
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
    throw new Error('GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET are missing in .env.local');
  }
  return new google.auth.OAuth2(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, redirectUri);
}

/** Authorised client for API calls. Throws GoogleAuthRequired when no refresh token exists. */
export function getAuthorizedClient(senderId = 'main') {
  const sender = getSender(senderId);
  const refresh_token = readStoredRefreshToken(sender.id) || sender.envRefreshToken;
  if (!refresh_token) throw new GoogleAuthRequired(`Google account ${sender.email || sender.label} is not connected`);

  const auth = createOAuthClient();
  auth.setCredentials({ refresh_token });
  // Google occasionally issues a new refresh token — persist it so the old one is never needed.
  auth.on('tokens', (tokens) => {
    if (tokens.refresh_token && tokens.refresh_token !== refresh_token) {
      saveRefreshToken(tokens.refresh_token, sender.id);
      console.log('[googleAuth] 🔄 rotated refresh token saved');
    }
  });
  return auth;
}

export class GoogleAuthRequired extends Error {}

/* OAuth `state` — a signed, 10-minute ticket so only a connect flow started by a
   signed-in admin (POST /api/google/connect) can replace the stored token. */
const STATE_TTL_MS = 10 * 60_000;
const sign = (payload: string) =>
  crypto.createHmac('sha256', process.env.GOOGLE_CLIENT_SECRET || '').update(payload).digest('base64url');

export function createState(userId: string, senderId = 'main') {
  const payload = Buffer.from(JSON.stringify({ u: userId, s: senderId, exp: Date.now() + STATE_TTL_MS })).toString('base64url');
  return `${payload}.${sign(payload)}`;
}

/** The sender id the connect flow was started for, or null when the state is missing / forged / expired. */
export function verifyState(state: string | null): { senderId: string } | null {
  if (!state) return null;
  const [payload, sig] = state.split('.');
  if (!payload || !sig) return null;
  const expected = sign(payload);
  if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString());
    return data.exp > Date.now() ? { senderId: String(data.s || 'main') } : null;
  } catch {
    return null;
  }
}

/** True when Google rejected the refresh token (expired / revoked). */
export function isInvalidGrant(err: any) {
  const msg = String(err?.response?.data?.error || err?.message || '');
  return msg.includes('invalid_grant') || err instanceof GoogleAuthRequired;
}
