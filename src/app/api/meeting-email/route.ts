// app/api/meeting-email/route.ts — the emails sent when a meeting changes status:
//   kind 'cancelled' → "Meeting cancelled" (+ .ics CANCEL, so it leaves their calendar)
//   kind 'thanks'    → "Thank you for attending" (after it is marked Completed)
//   kind 'confirmed' → "Meeting confirmed" (when someone confirms by phone / email)
//   kind 'rescheduled' → "Meeting rescheduled" (+ previous: { date, time }, the old slot)
// Body: { kind, meeting: <the meeting record>, emails?: [...] (only these people), sender?, onBehalf?, fromName? }
// Everyone in the meeting with an email address gets their own email (lib/meetingMail).
import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/serverAuth';
import { mailerFor } from '@/lib/mailer';
import { isoDateOf, meetingRecipients, sendMeetingEmails, slotLabel, timeOf } from '@/lib/meetingMail';

export const runtime = 'nodejs';

const KINDS = ['cancelled', 'thanks', 'confirmed', 'rescheduled'] as const;
type Kind = (typeof KINDS)[number];

export async function POST(req: NextRequest) {
  const user = await requireUser(req, 'editor');
  if (user instanceof NextResponse) return user;

  try {
    const { kind, meeting, emails, previous, sender, onBehalf, fromName } = await req.json();
    if (!KINDS.includes(kind) || !meeting || typeof meeting !== 'object') {
      return NextResponse.json({ error: 'Nothing to send.' }, { status: 400 });
    }
    const only = Array.isArray(emails) ? new Set(emails.map((e: unknown) => String(e).trim().toLowerCase())) : null;
    const recipients = meetingRecipients(meeting).filter((r) => !only || only.has(r.email)).slice(0, 25);
    if (!recipients.length) return NextResponse.json({ ok: true, sent: 0, sentTo: [], failed: [] });

    const mailer = mailerFor(sender, user.email, { onBehalf: onBehalf ?? true, fromName });
    if (!mailer) {
      console.error('[meeting-email] no mail account — SMTP_USER / SMTP_PASS missing in .env.local');
      return NextResponse.json({ error: 'Emails aren’t set up yet — please ask your administrator.' }, { status: 500 });
    }
    const r = await sendMeetingEmails(mailer, kind as Kind, meeting, {
      recipients,
      previous: previous && typeof previous === 'object' ? slotLabel(isoDateOf(previous.date), timeOf(previous.time)) : '',
    });
    if (!r.sent.length) return NextResponse.json({ error: 'The emails couldn’t be sent — please try again later.' }, { status: 500 });
    return NextResponse.json({ ok: !r.failed.length, sent: r.sent.length, sentTo: r.sent, failed: r.failed });
  } catch (err) {
    console.error('[meeting-email] failed:', err);
    return NextResponse.json({ error: 'The emails couldn’t be sent — please try again later.' }, { status: 500 });
  }
}
