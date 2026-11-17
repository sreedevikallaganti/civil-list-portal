// lib/alertsRunner.ts — server-only: sends the creator follow-up emails (lib/creatorAlerts)
// every 5 minutes from the Next.js server, through the main mailbox (SMTP_USER / SMTP_PASS).
//
// It reads meetings with its own PocketBase login, set in .env.local:
//   PB_ALERTS_EMAIL=…      a PocketBase superuser (all organisations) or an app user (their organisation)
//   PB_ALERTS_PASSWORD=…
//   APP_URL=http://<server>:3000   (optional — links in the emails)
// Without the login the alerts are off. Sent emails are remembered in .alerts-sent.json,
// so a restart never sends one twice.
import fs from 'fs';
import path from 'path';
import { APP_TIMEZONE } from './appConfig';
import { creatorAlerts, type AlertEmail } from './creatorAlerts';
import { mailerFor } from './mailer';
import { pbURL } from './serverAuth';

const EVERY_MS = 5 * 60_000;
const KEEP_DAYS = 8;
const SENT_FILE = path.join(process.cwd(), '.alerts-sent.json');
const env = (k: string) => (process.env[k] || '').trim();

export const alertsConfigured = () => !!(env('PB_ALERTS_EMAIL') && env('PB_ALERTS_PASSWORD'));

function readSent(): Record<string, string> {
  try { return JSON.parse(fs.readFileSync(SENT_FILE, 'utf8')); } catch { return {}; }
}
function writeSent(sent: Record<string, string>) {
  const cutoff = Date.now() - KEEP_DAYS * 86_400_000;
  const kept = Object.fromEntries(Object.entries(sent).filter(([, at]) => Date.parse(at) > cutoff));
  fs.writeFileSync(SENT_FILE, JSON.stringify(kept, null, 2));
}

async function login(): Promise<string> {
  const body = JSON.stringify({ identity: env('PB_ALERTS_EMAIL'), password: env('PB_ALERTS_PASSWORD') });
  for (const col of ['_superusers', 'users']) {
    const res = await fetch(`${pbURL()}/api/collections/${col}/auth-with-password`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body, cache: 'no-store',
    }).catch(() => null);
    if (res?.ok) return (await res.json()).token;
  }
  throw new Error('PB_ALERTS_EMAIL / PB_ALERTS_PASSWORD were rejected by PocketBase');
}

async function listAll(token: string, collection: string, filter: string): Promise<Record<string, any>[]> {
  const rows: Record<string, any>[] = [];
  for (let page = 1; page < 100; page++) {
    const q = new URLSearchParams({ page: String(page), perPage: '500', skipTotal: '1', filter });
    const res = await fetch(`${pbURL()}/api/collections/${collection}/records?${q}`, {
      headers: { Authorization: token }, cache: 'no-store',
    });
    if (res.status === 404) return rows; // collection doesn't exist (e.g. no meeting_actions)
    if (!res.ok) throw new Error(`${collection}: PocketBase answered ${res.status}`);
    const { items = [] } = await res.json();
    rows.push(...items);
    if (items.length < 500) break;
  }
  return rows;
}

/** One pass: what's due now and not sent yet. `dryRun` only reports. */
export async function runCreatorAlerts({ dryRun = false, now = Date.now() } = {}) {
  if (!alertsConfigured()) return { configured: false, due: [] as AlertEmail[], sent: 0, failed: 0 };
  const token = await login();
  const since = new Date(now - 366 * 86_400_000).toISOString().slice(0, 10);
  const [meetings, actions] = await Promise.all([
    listAll(token, 'meetings', `meeting_date >= "${since} 00:00:00.000Z"`),
    listAll(token, 'meeting_actions', 'done = false'),
  ]);
  if (meetings.length && !('owner_email' in meetings[0])) {
    console.warn('[alerts] meetings has no owner_email field yet — add it in the PocketBase dashboard (Plain text)');
  }

  const sent = readSent();
  const due = creatorAlerts(meetings, actions, { now, timeZone: APP_TIMEZONE, appUrl: env('APP_URL') })
    .filter((a) => !sent[a.key]);
  if (dryRun || !due.length) return { configured: true, due, sent: 0, failed: 0 };

  const mailer = mailerFor('main');
  if (!mailer) throw new Error('SMTP_USER / SMTP_PASS missing in .env.local');
  let ok = 0, failed = 0;
  for (const a of due) {
    try {
      await mailer.transporter.sendMail({ from: mailer.from, to: a.to, subject: a.subject, html: a.html });
      sent[a.key] = new Date().toISOString();
      ok++;
    } catch (err) {
      failed++;
      console.error(`[alerts] couldn't email ${a.to}:`, err);
    }
  }
  writeSent(sent);
  if (ok) console.log(`[alerts] ✉ sent ${ok} follow-up alert${ok === 1 ? '' : 's'}`);
  return { configured: true, due, sent: ok, failed };
}

/** Called once at server start (src/instrumentation.ts). */
export function startCreatorAlerts() {
  const g = globalThis as typeof globalThis & { __creatorAlerts?: boolean };
  if (g.__creatorAlerts) return; // dev reloads re-run register()
  g.__creatorAlerts = true;
  if (!alertsConfigured()) {
    console.log('[alerts] follow-up emails are off — set PB_ALERTS_EMAIL / PB_ALERTS_PASSWORD in .env.local to turn them on');
    return;
  }
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try { await runCreatorAlerts(); }
    catch (err: any) { console.error('[alerts]', err?.message || err); }
    finally { running = false; }
  };
  setTimeout(tick, 20_000); // let the server finish starting
  setInterval(tick, EVERY_MS);
  console.log('[alerts] follow-up emails on — checking every 5 minutes');
}
