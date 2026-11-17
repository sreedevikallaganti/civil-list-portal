// lib/meetingMail.ts — server-only: sends a meeting email (lib/emailTemplates) to everyone in a
// meeting, one personal email each ("Dear <name>"), with the calendar file where it helps:
//   invite / rescheduled → .ics REQUEST (updates the event in their calendar)
//   cancelled            → .ics CANCEL  (removes it)
import { buildIcs, zonedToUtc } from './ics';
import { APP_TIMEZONE } from './appConfig';
import { meetingParticipants } from './participants';
import { meetingEmail, type MeetingEmailKind } from './emailTemplates';
import { videoLabel } from './videoCall';
import type { Mailer } from './mailer';

type Row = Record<string, any>;
export type Recipient = { email: string; name: string };

const isEmail = (s: string) => /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(s);
const oneLine = (v: unknown) => String(v ?? '').replace(/[\r\n]+/g, ' ').trim();
const pad = (n: number) => String(n).padStart(2, '0');
const safeUrl = (v: unknown) => (/^https?:\/\//i.test(String(v ?? '').trim()) ? String(v).trim() : '');

export const isoDateOf = (v: unknown) => { const s = String(v ?? '').slice(0, 10); return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : ''; };
export const timeOf = (v: unknown) => { const m = /^(\d{1,2}):(\d{2})/.exec(String(v ?? '').trim()); return m ? `${pad(+m[1])}:${m[2]}` : ''; };
export const durationOf = (m: Row) => Math.max(5, Math.round(Number(m.duration) || Number(m.duration_minutes) || 30));

/** "Thu, 12 Nov 2026" */
export function prettyDate(iso: string) {
  if (!iso) return '';
  const d = new Date(`${iso}T00:00:00Z`);
  return d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

/** "11:00 – 11:45 hrs" */
export function timeRange(time: string, minutes: number) {
  if (!time) return '';
  const [h, mm] = time.split(':').map(Number);
  const end = h * 60 + mm + minutes;
  return `${time} – ${pad(Math.floor(end / 60) % 24)}:${pad(end % 60)} hrs`;
}

/** "Thu, 12 Nov 2026, 11:00 hrs" — the old slot in a reschedule email. */
export const slotLabel = (isoDate: string, time: string) => [prettyDate(isoDate), time && `${time} hrs`].filter(Boolean).join(', ');

/** Everyone in the meeting who has an email address (main participant first, no duplicates). */
export function meetingRecipients(m: Row): Recipient[] {
  const seen = new Set<string>();
  const out: Recipient[] = [];
  for (const p of meetingParticipants(m)) {
    const email = String(p.email || '').trim().toLowerCase();
    if (!isEmail(email) || seen.has(email)) continue;
    seen.add(email);
    out.push({ email, name: p.name && p.name.toLowerCase() !== email ? p.name : '' });
  }
  return out;
}

/** What the templates need, from a meeting record. */
export function meetingFacts(m: Row) {
  const isoDate = isoDateOf(m.meeting_date);
  const time = timeOf(m.meeting_time);
  const duration = durationOf(m);
  const link = safeUrl(m.meet_link);
  return {
    isoDate, time, duration, link,
    agenda: oneLine(m.agenda) || 'Meeting',
    date: prettyDate(isoDate),
    timeLabel: timeRange(time, duration),
    location: oneLine(m.location || m.meeting_place || ''),
    linkLabel: link ? videoLabel(link) : '',
  };
}

/** Send one kind of meeting email to each recipient. Never throws; reports who failed. */
export async function sendMeetingEmails(mailer: Mailer, kind: MeetingEmailKind, m: Row, opts: {
  recipients?: Recipient[]; previous?: string; reason?: string; sequence?: number;
  ics?: boolean; // false = no calendar file
  // the Google Calendar event (from /api/google): its UID + organiser make the Yes / No / Maybe
  // answers update that event, so Google keeps track of who accepted
  calendar?: { uid?: string; organizer?: string; sequence?: number };
} = {}) {
  const f = meetingFacts(m);
  const recipients = opts.recipients ?? meetingRecipients(m);
  const start = f.isoDate && f.time ? zonedToUtc(f.isoDate, f.time, APP_TIMEZONE) : null;
  const ics = opts.ics !== false && start && (kind === 'invite' || kind === 'rescheduled' || kind === 'cancelled') ? {
    method: kind === 'cancelled' ? 'CANCEL' : 'REQUEST',
    filename: kind === 'cancelled' ? 'cancelled.ics' : 'invite.ics',
    content: buildIcs({
      // the Google Calendar event's own UID, so Yes / No / Maybe answers update that event
      uid: opts.calendar?.uid || (m.gcal_event_id ? `${m.gcal_event_id}@google.com`
        : String(m.id || `${f.isoDate}-${f.time}-${f.agenda}`).replace(/[^\w.-]/g, '')),
      start,
      durationMin: f.duration,
      title: f.agenda,
      description: f.link ? `${f.linkLabel}: ${f.link}` : '',
      location: f.location || f.linkLabel,
      url: f.link || undefined,
      // answers go to the organiser: for a Google event, the Google account that owns it
      organizer: {
        email: opts.calendar?.organizer || (m.gcal_event_id && mailer.sender.email) || mailer.replyTo || mailer.address,
        name: mailer.fromName || mailer.sender.label,
      },
      attendees: recipients.map((r) => r.email),
      // a change must carry a higher sequence than the invite, or calendars ignore it
      sequence: opts.sequence ?? (kind === 'invite' ? opts.calendar?.sequence ?? 0 : Math.floor(Date.now() / 1000)),
      method: kind === 'cancelled' ? 'CANCEL' : 'REQUEST',
    }),
  } : undefined;

  const sent: string[] = [];
  const failed: string[] = [];
  for (const r of recipients) {
    const mail = meetingEmail(kind, {
      recipientName: r.name, agenda: f.agenda, date: f.date, time: f.timeLabel, location: f.location,
      link: f.link, linkLabel: f.linkLabel, previous: opts.previous, reason: opts.reason, sendAs: mailer.sendAs,
    });
    try {
      await mailer.transporter.sendMail({
        ...(ics && { icalEvent: ics }),
        from: mailer.from,
        ...(mailer.replyTo && { replyTo: mailer.replyTo }),
        to: r.name ? { name: oneLine(r.name).replace(/"/g, ''), address: r.email } : r.email,
        subject: mail.subject,
        html: mail.html,
        text: mail.text,
      });
      sent.push(r.email);
    } catch (err) {
      failed.push(r.email);
      console.error(`[meeting-mail] ${kind} to ${r.email} failed:`, err);
    }
  }
  return { sent, failed };
}
