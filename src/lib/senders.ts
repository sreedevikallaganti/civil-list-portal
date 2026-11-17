// lib/senders.ts — server-only: the accounts that meetings can be sent from.
//
// Each sender is one Google account used for three things:
//   • the Google Calendar event (in that account's calendar)
//   • the Google Meet link (created by that account)
//   • the invite emails (sent through that account's Gmail, SMTP + app password)
//
// The main sender is the setup the app always had:
//   GOOGLE_REFRESH_TOKEN (or .google-token.json), SMTP_USER / SMTP_PASS
// More senders come from .env.local, numbered 2…9:
//   SENDER_2_EMAIL=someone@example.com
//   SENDER_2_LABEL=Someone            (optional — shown in the meeting form)
//   SENDER_2_SMTP_PASS=…              (Gmail app password of that account — for invite emails)
//   SENDER_2_REFRESH_TOKEN=…          (optional — or click "Connect" in Settings → Google accounts)
//   SENDER_2_TITLE=PA to MD           (optional — shown under the name in email signatures)
//   SENDER_2_PHONE=…                  (optional — shown in email signatures)
// (the main account: SENDER_MAIN_LABEL / SENDER_MAIN_TITLE / SENDER_MAIN_PHONE)
//
// How emails are signed (lib/emailTemplates):
//   ORG_NAME=Brihaspathi Technologies   the company — "Tejaswi from Brihaspathi Technologies"
//   SENDER_PRINCIPAL=md@brihaspathi.com  the person others may send "on behalf of" (the MD)
//
// Which account sends, and where events go:
//   SENDER_DEFAULT=tejaswi@example.com  the account invites come from and that organises the events
//                                       (an email or an id like "s2"; default: the main account)
//                                       — except for a signed-in user whose own email is a sender:
//                                       their meetings are sent from their own account
//   CALENDAR_ALL_ACCOUNTS=true          every other account is added to each event as a guest, so the
//                                       meeting shows in all their Google calendars (default: true)

export type Sender = {
  id: string;                    // "main", "s2", "s3", …
  email: string;
  label: string;                 // the person's name, e.g. "Rajasekhar Papolu"
  title: string;                 // e.g. "Managing Director" ('' = none)
  phone: string;
  smtp: { user: string; pass: string; host: string; port: number } | null;
  envRefreshToken: string;       // from .env.local ('' = only the stored token file)
};

const env = (k: string) => (process.env[k] || '').trim();

export function listSenders(): Sender[] {
  const host = env('SMTP_HOST') || 'smtp.gmail.com';
  const port = Number(env('SMTP_PORT') || 465);
  const mainEmail = env('SENDER_MAIN_EMAIL') || env('SMTP_USER');
  const senders: Sender[] = [{
    id: 'main',
    email: mainEmail,
    label: env('SENDER_MAIN_LABEL') || mainEmail || 'Main account',
    title: env('SENDER_MAIN_TITLE'),
    phone: env('SENDER_MAIN_PHONE'),
    smtp: env('SMTP_USER') && env('SMTP_PASS') ? { user: env('SMTP_USER'), pass: env('SMTP_PASS'), host, port } : null,
    envRefreshToken: env('GOOGLE_REFRESH_TOKEN'),
  }];
  for (let n = 2; n <= 9; n++) {
    const email = env(`SENDER_${n}_EMAIL`).toLowerCase();
    if (!email) continue;
    const pass = env(`SENDER_${n}_SMTP_PASS`);
    senders.push({
      id: `s${n}`,
      email,
      label: env(`SENDER_${n}_LABEL`) || email,
      title: env(`SENDER_${n}_TITLE`),
      phone: env(`SENDER_${n}_PHONE`),
      // Gmail / Google Workspace mailboxes all use smtp.gmail.com
      smtp: pass ? { user: email, pass, host: 'smtp.gmail.com', port: 465 } : null,
      envRefreshToken: env(`SENDER_${n}_REFRESH_TOKEN`),
    });
  }
  return senders;
}

/** The account invites come from by default (SENDER_DEFAULT — an email or an id). */
export function defaultSender(): Sender {
  const all = listSenders();
  const want = env('SENDER_DEFAULT').toLowerCase();
  return all.find((s) => want && (s.id === want || s.email.toLowerCase() === want)) ?? all[0];
}

/** The signed-in user's sender: their own account when their email is one of the senders,
    otherwise the default sender (SENDER_DEFAULT). */
export function senderForUser(userEmail?: unknown): Sender {
  const email = String(userEmail || '').trim().toLowerCase();
  return (email && listSenders().find((s) => s.email.toLowerCase() === email)) || defaultSender();
}

/** The sender with this id — unknown / empty ids mean the signed-in user's sender (senderForUser). */
export function getSender(id?: unknown, userEmail?: unknown): Sender {
  return listSenders().find((s) => s.id === id) ?? senderForUser(userEmail);
}

/** The company name used in emails ("Tejaswi from Brihaspathi Technologies"). */
export const orgName = () => env('ORG_NAME') || 'Brihaspathi Technologies';

/** The person others can send "on behalf of" (SENDER_PRINCIPAL — an email or an id), or null. */
export function principalSender(): Sender | null {
  const want = env('SENDER_PRINCIPAL').toLowerCase();
  return (want && listSenders().find((s) => s.id === want || s.email.toLowerCase() === want)) || null;
}

/** Put every meeting in all the accounts' calendars (the others are added as guests). */
export const calendarAllAccounts = () => !/^(false|0|no|off)$/i.test(env('CALENDAR_ALL_ACCOUNTS'));

/** Safe to show in the browser (no passwords or tokens). */
export const publicSender = (s: Sender) => ({ id: s.id, email: s.email, label: s.label, title: s.title, canEmail: !!s.smtp });
