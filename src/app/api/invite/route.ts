import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/serverAuth';
import { mailerFor } from '@/lib/mailer';
import { sendMeetingEmails, slotLabel, isoDateOf, timeOf, type Recipient } from '@/lib/meetingMail';

export const runtime = 'nodejs';

/* dev warm-up ping from the meeting form (compiles this route early) — no data, no auth needed */
export function HEAD() {
  return new Response(null, { status: 204 });
}

const MAX_RECIPIENTS = 25;
const isEmail = (s: string) => /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(s);

/* Meeting invitation — or, with `template: 'rescheduled'`, the "meeting rescheduled" email.
   Body:
     recipients: [{ email, name }]   (or `to` "a@x, b@y" + optional `name`) — each gets their OWN email
     agenda, isoDate (YYYY-MM-DD), isoTime (HH:MM), duration (min), location, meetLink, meetingId
     template: 'invite' | 'rescheduled'      previous: { date, time } (the old slot)   reason (optional)
     notice (older callers): a short update such as "Running 15 minutes late" — sent as a reschedule
     sender / onBehalf / fromName: who it comes from (lib/mailer) */
export async function POST(req: NextRequest) {
  const user = await requireUser(req, 'editor');
  if (user instanceof NextResponse) return user;

  try {
    const body = await req.json();
    const { to, name, recipients: list, agenda, location, meetLink, notice, isoDate, isoTime, duration, meetingId, sender, onBehalf, fromName } = body;
    if ((!to && !Array.isArray(list)) || !agenda) return NextResponse.json({ error: 'Add at least one person and an agenda before sending invites.' }, { status: 400 });

    const people = new Map<string, string>(); // email → name
    if (Array.isArray(list)) {
      for (const r of list) {
        const email = String(r?.email || '').trim().toLowerCase();
        if (email && !people.has(email)) people.set(email, String(r?.name || '').trim());
      }
    } else {
      const emails = String(to).split(/[,;\s]+/).map((e) => e.trim().toLowerCase()).filter(Boolean);
      for (const e of emails) if (!people.has(e)) people.set(e, emails.length === 1 ? String(name || '').trim() : '');
    }
    const recipients: Recipient[] = [...people].map(([email, n]) => ({ email, name: n }));
    const bad = recipients.filter((r) => !isEmail(r.email)).map((r) => r.email);
    if (bad.length) return NextResponse.json({ error: `This email address doesn’t look right: ${bad.join(', ')}` }, { status: 400 });
    if (!recipients.length || recipients.length > MAX_RECIPIENTS) {
      return NextResponse.json({ error: `Invites can go to 1 to ${MAX_RECIPIENTS} people at a time.` }, { status: 400 });
    }

    // the account the meeting is sent from (lib/senders) — its own mailbox when it has an app password
    const mailer = mailerFor(sender, user.email, { onBehalf, fromName });
    if (!mailer) {
      console.error('[invite] no mail account — SMTP_USER / SMTP_PASS missing in .env.local (sender:', sender || 'default', ')');
      return NextResponse.json({ error: 'Invite emails aren’t set up yet — please ask your administrator.' }, { status: 500 });
    }

    const rescheduled = body.template === 'rescheduled' || !!notice;
    const prev = body.previous && typeof body.previous === 'object'
      ? slotLabel(isoDateOf(body.previous.date), timeOf(body.previous.time)) : '';
    const meeting = {
      id: meetingId, agenda, meeting_date: isoDate, meeting_time: isoTime, duration, location, meet_link: meetLink,
    };
    // calendar (optional): the Google event { uid, organizer, sequence } from /api/google —
    // the attached invite then answers into that event
    const cal = body.calendar && typeof body.calendar === 'object' ? {
      uid: typeof body.calendar.uid === 'string' ? body.calendar.uid.slice(0, 200) : undefined,
      organizer: typeof body.calendar.organizer === 'string' && isEmail(body.calendar.organizer) ? body.calendar.organizer : undefined,
      sequence: Number.isFinite(Number(body.calendar.sequence)) ? Number(body.calendar.sequence) : undefined,
    } : undefined;
    const r = await sendMeetingEmails(mailer, rescheduled ? 'rescheduled' : 'invite', meeting, {
      recipients, previous: prev, reason: String(body.reason || notice || '').slice(0, 200), calendar: cal,
    });

    if (!r.sent.length) {
      // each failure is already logged with the mail server's reason
      return NextResponse.json({ error: 'The invite emails couldn’t be sent — please try again later.', failed: r.failed.map((email) => ({ email, error: 'not sent' })) }, { status: 500 });
    }
    return NextResponse.json({ ok: !r.failed.length, sent: r.sent.length, sentTo: r.sent, failed: r.failed.map((email) => ({ email, error: 'not sent' })) });
  } catch (err: any) {
    console.error('Invite email error:', err);
    return NextResponse.json({ error: 'The invite emails couldn’t be sent — please try again later.' }, { status: 500 });
  }
}
