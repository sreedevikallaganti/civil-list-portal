// app/api/health/route.ts — one fast answer to "is the app working?"
//
//   GET /api/health            → cached sub-checks (≤ 1 min old), answers in milliseconds
//   GET /api/health?fresh=1    → re-checks everything now
//
// Public on purpose (used by the /docs status board and uptime monitors): it reports only
// ok / warning / down per service — never addresses, emails, tokens or other secrets.
// HTTP 200 when the app is usable (ok or degraded), 503 when it is down.
import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import nodemailer from 'nodemailer';
import pkg from '../../../../package.json';
import { checkGoogle } from '@/lib/googleStatus';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Level = 'ok' | 'warn' | 'down';
type Check = { key: string; label: string; status: Level; ms: number; detail: string; critical: boolean };

const startedAt = Date.now();
const TIMEOUT_MS = 6_000;

const timed = async (
  key: string, label: string, critical: boolean,
  run: () => Promise<{ status: Level; detail: string }>,
): Promise<Check> => {
  const t0 = Date.now();
  try {
    const r = await Promise.race([
      run(),
      new Promise<{ status: Level; detail: string }>((resolve) =>
        setTimeout(() => resolve({ status: critical ? 'down' : 'warn', detail: `No answer within ${TIMEOUT_MS / 1000}s` }), TIMEOUT_MS)),
    ]);
    return { key, label, critical, ms: Date.now() - t0, ...r };
  } catch (err: any) {
    return { key, label, critical, ms: Date.now() - t0, status: critical ? 'down' : 'warn', detail: err?.message || 'Check failed' };
  }
};

/* ── PocketBase: the database every page depends on ── */
function pocketbase() {
  return timed('database', 'Database (PocketBase)', true, async () => {
    const url = (process.env.POCKETBASE_URL || process.env.NEXT_PUBLIC_POCKETBASE_URL || '').replace(/\/+$/, '');
    if (!url) return { status: 'down', detail: 'POCKETBASE_URL is not set in .env.local' };
    const res = await fetch(`${url}/api/health`, { cache: 'no-store', signal: AbortSignal.timeout(TIMEOUT_MS) });
    return res.ok
      ? { status: 'ok', detail: 'Reachable — logins, meetings and the directory work' }
      : { status: 'down', detail: `PocketBase answered ${res.status}` };
  });
}

/* ── Google Calendar / Meet ── */
function google(fresh: boolean) {
  return timed('google', 'Google Calendar & Meet (refresh token)', false, async () => {
    const s = await checkGoogle(fresh);
    if (s.connected) return { status: 'ok', detail: `Refresh token is set (${tokenSource()}) and accepted by Google — events and Meet links are created` };
    if (s.reason === 'not_connected') return { status: 'warn', detail: 'No refresh token — add GOOGLE_REFRESH_TOKEN to .env.local and restart (meetings still save)' };
    if (s.reason === 'expired') return { status: 'warn', detail: `Refresh token (${tokenSource()}) was rejected by Google — expired or revoked; renew it (meetings still save)` };
    return { status: 'warn', detail: s.message || 'Google could not be reached' };
  });
}

/* ── Email invites (SMTP) — verified at most every 5 minutes ── */
let smtpCache: { at: number; result: { status: Level; detail: string } } | null = null;
function email(fresh: boolean) {
  return timed('email', 'Email invites (SMTP)', false, async () => {
    if (!fresh && smtpCache && Date.now() - smtpCache.at < 5 * 60_000) return smtpCache.result;
    const { SMTP_USER, SMTP_PASS, SMTP_HOST, SMTP_PORT } = process.env;
    let result: { status: Level; detail: string };
    if (!SMTP_USER || !SMTP_PASS) {
      result = { status: 'warn', detail: 'SMTP_USER / SMTP_PASS not set — invite emails are skipped' };
    } else {
      const port = Number(SMTP_PORT || 465);
      await nodemailer
        .createTransport({ host: SMTP_HOST || 'smtp.gmail.com', port, secure: port === 465, auth: { user: SMTP_USER, pass: SMTP_PASS }, connectionTimeout: TIMEOUT_MS })
        .verify();
      result = { status: 'ok', detail: 'Mail server accepted the login — invites can be sent' };
    }
    smtpCache = { at: Date.now(), result };
    return result;
  });
}

/* ── Configuration: required settings present (names only, never values) ── */
function config() {
  return timed('config', 'Configuration (.env.local)', false, async () => {
    const required = ['NEXT_PUBLIC_POCKETBASE_URL', 'GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'APP_TIMEZONE'];
    const missing = required.filter((k) => !process.env[k] && !(k === 'NEXT_PUBLIC_POCKETBASE_URL' && process.env.POCKETBASE_URL));
    return missing.length
      ? { status: 'warn', detail: `Missing: ${missing.join(', ')}` }
      : { status: 'ok', detail: 'All required settings are present' };
  });
}

export async function GET(req: NextRequest) {
  const t0 = Date.now();
  const fresh = req.nextUrl.searchParams.has('fresh');

  const checks = await Promise.all([pocketbase(), google(fresh), email(fresh), config()]);

  const down = checks.some((c) => c.critical && c.status === 'down');
  const degraded = checks.some((c) => c.status !== 'ok');
  const status = down ? 'down' : degraded ? 'degraded' : 'ok';

  return NextResponse.json(
    {
      status,
      summary: down
        ? 'The app is down — the database cannot be reached.'
        : degraded
          ? 'The app works; some extras need attention.'
          : 'Everything is working.',
      checkedAt: new Date().toISOString(),
      durationMs: Date.now() - t0,
      app: {
        name: 'Civillist — Meeting Management',
        version: pkg.version,
        environment: process.env.NODE_ENV,
        node: process.version,
        uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
      },
      checks,
    },
    { status: down ? 503 : 200, headers: { 'Cache-Control': 'no-store' } },
  );
}

/** Where the refresh token comes from — a file name only, never the token itself. */
function tokenSource() {
  return fs.existsSync(path.join(process.cwd(), '.google-token.json')) ? '.google-token.json' : '.env.local';
}
