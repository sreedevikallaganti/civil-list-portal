// lib/participantMailRunner.ts — server-only: the automatic emails to meeting participants and
// officers, every 5 minutes from the Next.js server (started in src/instrumentation.ts):
//
//   • Meeting reminders — 24 hours and 1 hour before (lib/participantMails)
//   • Meeting confirmed — when a guest accepts the Google Calendar invitation
//   • Birthday / work-anniversary greetings — OFF: occasion wishes are only sent by hand from the
//     Occasions page. AUTO_OCCASION_EMAILS=on would send them automatically.
//
// Only meetings whose "Send invite" switch is on get reminders / confirmations.
// PocketBase login: PB_ALERTS_EMAIL / PB_ALERTS_PASSWORD, else PB_ADMIN_EMAIL / PB_ADMIN_PASSWORD.
// Turn it off with PARTICIPANT_EMAILS=off. Sent emails are remembered in .participant-mails-sent.json,
// so a restart never sends one twice. From name: AUTO_EMAIL_FROM_NAME, else ORG_NAME.
import fs from 'fs';
import path from 'path';
import { APP_TIMEZONE } from './appConfig';
import { pbURL } from './serverAuth';
import { mailerFor } from './mailer';
import { orgName } from './senders';
import { eventGuests } from './googleGuests';
import { sendMeetingEmails, isoDateOf, timeOf } from './meetingMail';
import { occasionEmail } from './emailTemplates';
import { dueGreetings, dueReminders, officerRefs, type DirectoryPerson } from './participantMails';
import { OFFICER_COLLECTION, serviceOf, type OfficerService } from './officerDirectory';
import { zonedToUtc } from './ics';

const EVERY_MS = 5 * 60_000;
const KEEP_DAYS = 40;
const SENT_FILE = path.join(process.cwd(), '.participant-mails-sent.json');
const env = (k: string) => (process.env[k] || '').trim();

const credentials = () => ({
  email: env('PB_ALERTS_EMAIL') || env('PB_ADMIN_EMAIL'),
  password: env('PB_ALERTS_PASSWORD') || env('PB_ADMIN_PASSWORD'),
});
export const participantMailsOn = () =>
  !/^(off|false|0|no)$/i.test(env('PARTICIPANT_EMAILS')) && !!(credentials().email && credentials().password);

function readSent(): Record<string, string> {
  try { return JSON.parse(fs.readFileSync(SENT_FILE, 'utf8')); } catch { return {}; }
}
function writeSent(sent: Record<string, string>) {
  const cutoff = Date.now() - KEEP_DAYS * 86_400_000;
  fs.writeFileSync(SENT_FILE, JSON.stringify(Object.fromEntries(Object.entries(sent).filter(([, at]) => Date.parse(at) > cutoff)), null, 2));
}

async function login(): Promise<string> {
  const { email, password } = credentials();
  const body = JSON.stringify({ identity: email, password });
  for (const col of ['_superusers', 'users']) {
    const res = await fetch(`${pbURL()}/api/collections/${col}/auth-with-password`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body, cache: 'no-store',
    }).catch(() => null);
    if (res?.ok) return (await res.json()).token;
  }
  throw new Error('the PocketBase login for automatic emails was rejected');
}

async function listAll(token: string, collection: string, filter: string, fields = ''): Promise<Record<string, any>[]> {
  const rows: Record<string, any>[] = [];
  for (let page = 1; page < 100; page++) {
    const q = new URLSearchParams({ page: String(page), perPage: '500', skipTotal: '1', filter, ...(fields && { fields }) });
    const res = await fetch(`${pbURL()}/api/collections/${collection}/records?${q}`, { headers: { Authorization: token }, cache: 'no-store' });
    if (!res.ok) throw new Error(`${collection}: PocketBase answered ${res.status}`);
    const { items = [] } = await res.json();
    rows.push(...items);
    if (items.length < 500) break;
  }
  return rows;
}

/** Guests who accepted the meeting's Google Calendar event (null = event not found). */
async function acceptedGuests(eventId: string): Promise<string[] | null> {
  const guests = await eventGuests(eventId);
  return guests && guests.filter((g) => g.reply === 'accepted').map((g) => g.email);
}

/** One pass. `dryRun` only reports what is due. */
export async function runParticipantMails({ dryRun = false, now = Date.now() } = {}) {
  const report = { reminders: 0, confirmations: 0, greetings: 0, failed: 0, due: [] as string[] };
  if (!participantMailsOn()) return report;
  const token = await login();
  // very first run: confirmations / greetings already due are only recorded, not sent — so turning
  // this on never emails people about acceptances or birthdays from before (reminders are unaffected)
  const firstRun = !fs.existsSync(SENT_FILE);
  const sent = readSent();

  const from = new Date(now - 86_400_000).toISOString().slice(0, 10);
  const meetings = await listAll(token, 'meetings', `meeting_date >= "${from} 00:00:00.000Z"`);
  const mailer = dryRun ? null : mailerFor(undefined, undefined, { onBehalf: true, fromName: env('AUTO_EMAIL_FROM_NAME') || orgName() });
  if (!dryRun && !mailer) throw new Error('SMTP_USER / SMTP_PASS missing in .env.local');
  const done = (key: string) => { sent[key] = new Date().toISOString(); };

  /* 1) reminders */
  for (const r of dueReminders(meetings, { now, timeZone: APP_TIMEZONE }).filter((r) => !sent[r.key])) {
    report.due.push(r.key);
    if (!mailer) continue;
    const res = await sendMeetingEmails(mailer, 'reminder', r.meeting, { recipients: r.recipients });
    if (res.sent.length) { done(r.key); report.reminders += res.sent.length; }
    report.failed += res.failed.length;
  }

  /* 2) confirmations — guests who accepted the Google Calendar invitation of an upcoming meeting */
  const upcoming = meetings.filter((m) => {
    if (m.deleted || m.send_invite === false || !m.gcal_event_id) return false;
    if (!/^(scheduled|rescheduled)$/i.test(String(m.status || 'Scheduled'))) return false;
    const start = zonedToUtc(isoDateOf(m.meeting_date), timeOf(m.meeting_time) || '00:00', APP_TIMEZONE);
    return !!start && start.getTime() > now;
  });
  for (const m of upcoming.slice(0, 40)) {
    const accepted = await acceptedGuests(String(m.gcal_event_id));
    if (!accepted?.length) continue;
    const slot = `${isoDateOf(m.meeting_date)}T${timeOf(m.meeting_time)}`;
    const names = new Map<string, string>([[String(m.email || '').toLowerCase(), String(m.officer_name || '')]]);
    for (const email of accepted) {
      const key = `conf:${m.id}:${slot}:${email}`;
      if (sent[key]) continue;
      report.due.push(key);
      if (!mailer) continue;
      if (firstRun) { done(key); continue; }
      const res = await sendMeetingEmails(mailer, 'confirmed', m, { recipients: [{ email, name: names.get(email) || '' }] });
      if (res.sent.length) { done(key); report.confirmations++; } else report.failed++;
    }
  }

  /* 3) birthdays & work anniversaries — only when AUTO_OCCASION_EMAILS=on (off by default:
        occasion wishes go out only when someone sends them from the Occasions page) */
  if (!/^(on|true|1|yes)$/i.test(env('AUTO_OCCASION_EMAILS'))) {
    if (!dryRun) writeSent(sent);
    const total = report.reminders + report.confirmations;
    if (total) console.log(`[participant-mails] ✉ ${report.reminders} reminder(s), ${report.confirmations} confirmation(s)`);
    return report;
  }
  const allMeetings = await listAll(token, 'meetings', 'id != ""', 'officer_type,officer_id,participants');
  const refs = officerRefs(allMeetings, serviceOf);
  const people: DirectoryPerson[] = [];
  for (const [service, ids] of refs) {
    const list = [...ids];
    for (let i = 0; i < list.length; i += 40) {
      const filter = list.slice(i, i + 40).map((id) => `id = "${id}"`).join(' || ');
      const rows = await listAll(token, OFFICER_COLLECTION[service as OfficerService], filter).catch(() => []);
      people.push(...rows.map((o) => ({ service, id: o.id, name: o.name, email: String(o.email || '').trim().toLowerCase(), date_of_birth: o.date_of_birth, date_of_joining: o.date_of_joining })));
    }
  }
  for (const g of dueGreetings(people, { now, timeZone: APP_TIMEZONE }).filter((g) => !sent[g.key])) {
    report.due.push(g.key);
    if (!mailer) continue;
    if (firstRun) { done(g.key); continue; }
    const mail = occasionEmail({ kind: g.kind, recipientName: g.person.name, years: g.years, sendAs: mailer.sendAs });
    try {
      await mailer.transporter.sendMail({
        from: mailer.from, ...(mailer.replyTo && { replyTo: mailer.replyTo }),
        to: { name: String(g.person.name || '').replace(/["\r\n]+/g, ' '), address: g.person.email },
        subject: mail.subject, html: mail.html, text: mail.text,
      });
      done(g.key);
      report.greetings++;
    } catch (err) {
      report.failed++;
      console.error(`[participant-mails] ${g.kind} to ${g.person.email} failed:`, err);
    }
  }

  if (!dryRun) writeSent(sent);
  const total = report.reminders + report.confirmations + report.greetings;
  if (total) console.log(`[participant-mails] ✉ ${report.reminders} reminder(s), ${report.confirmations} confirmation(s), ${report.greetings} greeting(s)`);
  return report;
}

/** Called once at server start (src/instrumentation.ts). */
export function startParticipantMails() {
  const g = globalThis as typeof globalThis & { __participantMails?: boolean };
  if (g.__participantMails) return; // dev reloads re-run register()
  g.__participantMails = true;
  if (!participantMailsOn()) {
    console.log('[participant-mails] automatic reminders / greetings are off (PARTICIPANT_EMAILS=off or no PocketBase login)');
    return;
  }
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try { await runParticipantMails(); }
    catch (err: any) { console.error('[participant-mails]', err?.message || err); }
    finally { running = false; }
  };
  setTimeout(tick, 30_000);
  setInterval(tick, EVERY_MS);
  console.log('[participant-mails] automatic reminders and confirmations on — checking every 5 minutes');
}
