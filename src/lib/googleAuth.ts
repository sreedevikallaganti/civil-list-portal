// lib/googleAuth.ts — server-only Google OAuth client with a self-updating refresh-token store.
//
// Access tokens (1 h) are refreshed automatically by googleapis on every call.
// The refresh token itself is read from .google-token.json (written by /api/google/callback)
// and falls back to GOOGLE_REFRESH_TOKEN in .env.local. If Google ever rotates the refresh
// token, the new one is saved automatically — nobody has to edit .env.local again.
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { google } from 'googleapis';

const TOKEN_FILE = path.join(process.cwd(), '.google-token.json');

export const GOOGLE_SCOPES = [
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/calendar.events',
];

function readStoredRefreshToken(): string | null {
  try {
    const data = JSON.parse(fs.readFileSync(TOKEN_FILE, 'utf8'));
    return data.refresh_token || null;
  } catch {
    return null;
  }
}

export function saveRefreshToken(refresh_token: string) {
  fs.writeFileSync(TOKEN_FILE, JSON.stringify({ refresh_token, saved_at: new Date().toISOString() }, null, 2));
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
export function getAuthorizedClient() {
  const refresh_token = readStoredRefreshToken() || process.env.GOOGLE_REFRESH_TOKEN;
  if (!refresh_token) throw new GoogleAuthRequired('Google account is not connected');

  const auth = createOAuthClient();
  auth.setCredentials({ refresh_token });
  // Google occasionally issues a new refresh token — persist it so the old one is never needed.
  auth.on('tokens', (tokens) => {
    if (tokens.refresh_token && tokens.refresh_token !== refresh_token) {
      saveRefreshToken(tokens.refresh_token);
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

export function createState(userId: string) {
  const payload = Buffer.from(JSON.stringify({ u: userId, exp: Date.now() + STATE_TTL_MS })).toString('base64url');
  return `${payload}.${sign(payload)}`;
}

export function verifyState(state: string | null): boolean {
  if (!state) return false;
  const [payload, sig] = state.split('.');
  if (!payload || !sig) return false;
  const expected = sign(payload);
  if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return false;
  try {
    return JSON.parse(Buffer.from(payload, 'base64url').toString()).exp > Date.now();
  } catch {
    return false;
  }
}

/** True when Google rejected the refresh token (expired / revoked). */
export function isInvalidGrant(err: any) {
  const msg = String(err?.response?.data?.error || err?.message || '');
  return msg.includes('invalid_grant') || err instanceof GoogleAuthRequired;
}
