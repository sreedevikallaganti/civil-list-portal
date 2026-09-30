import { NextRequest, NextResponse } from 'next/server';
import nodemailer from 'nodemailer';
import { requireUser, esc, safeUrl } from '@/lib/serverAuth';
import { buildIcs, zonedToUtc } from '@/lib/ics';
import { APP_TIMEZONE } from '@/lib/appConfig';

export const runtime = 'nodejs';

const MAX_RECIPIENTS = 25;
const isEmail = (s: string) => /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(s);

export async function POST(req: NextRequest) {
  const user = await requireUser(req, 'editor');
  if (user instanceof NextResponse) return user;

  try {
    // `notice` (optional) turns the invite into an update, e.g. "Running 15 minutes late — new time 11:15"
    // isoDate / isoTime / duration / meetingId (optional) attach a calendar invite (.ics)
    const { to, name, agenda, date, time, location, meetLink, notice, isoDate, isoTime, duration, meetingId } = await req.json();
    if (!to || !agenda) return NextResponse.json({ error: 'to and agenda required' }, { status: 400 });

    const recipients = Array.from(new Set(
      String(to).split(/[,;\s]+/).map((e) => e.trim().toLowerCase()).filter(Boolean),
    ));
    const bad = recipients.filter((e) => !isEmail(e));
    if (bad.length) return NextResponse.json({ error: `Invalid email: ${bad.join(', ')}` }, { status: 400 });
    if (!recipients.length || recipients.length > MAX_RECIPIENTS) {
      return NextResponse.json({ error: `Between 1 and ${MAX_RECIPIENTS} recipients allowed` }, { status: 400 });
    }

    if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
      return NextResponse.json({ error: 'SMTP_USER / SMTP_PASS missing in .env.local' }, { status: 500 });
    }
    const port = Number(process.env.SMTP_PORT || 587);
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port,
      secure: port === 465, // 465 = implicit TLS; without this the connection hangs until timeout
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
    });

    const link = safeUrl(meetLink);
    const oneLine = (s: unknown) => String(s ?? '').replace(/[\r\n]+/g, ' ');

    const organizer = String(process.env.SMTP_FROM || process.env.SMTP_USER).replace(/^.*<([^>]+)>.*$/, '$1');
    const start = isoDate && isoTime ? zonedToUtc(String(isoDate).slice(0, 10), String(isoTime), APP_TIMEZONE) : null;
    const icalEvent = start ? {
      method: 'REQUEST',
      filename: 'invite.ics',
      content: buildIcs({
        uid: String(meetingId || `${isoDate}-${isoTime}-${oneLine(agenda)}`).replace(/[^\w.-]/g, ''),
        start,
        durationMin: Number(duration) || 30,
        title: oneLine(agenda),
        description: [notice, link && `Google Meet: ${link}`].filter(Boolean).join('\n'),
        location: location || (link ? 'Google Meet' : ''),
        url: link || undefined,
        organizer: { email: organizer, name: 'Civillist Meetings' },
        attendees: recipients,
        sequence: notice ? 1 : 0, // an update replaces the earlier invite in the calendar
      }),
    } : undefined;

    await transporter.sendMail({
      ...(icalEvent && { icalEvent }),
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to: recipients.join(', '),
      subject: notice ? `Update: ${oneLine(agenda)}` : `Meeting Invite: ${oneLine(agenda)}`,
      html: `
        <div style="font-family:sans-serif;max-width:520px">
          <h2 style="color:#4f46e5">📋 ${esc(agenda)}</h2>
          <p>Dear ${esc(name || 'Sir/Madam')},</p>
          ${notice
            ? `<p style="padding:10px 14px;border-radius:10px;background:#fef3c7;color:#92400e"><b>${esc(notice)}</b></p>`
            : '<p>You are invited to a meeting:</p>'}
          <ul>
            <li><b>📅 Date:</b> ${esc(date)}</li>
            <li><b>🕐 Time:</b> ${esc(time)}</li>
            ${location ? `<li><b>📍 Location:</b> ${esc(location)}</li>` : ''}
            ${link ? `<li><b>💻 Meet link:</b> <a href="${esc(link)}">${esc(link)}</a></li>` : ''}
          </ul>
          <p>${notice ? 'Apologies for the inconvenience.' : 'Kindly confirm your availability.'}</p>
        </div>`,
    });

    return NextResponse.json({ ok: true, sent: recipients.length });
  } catch (err: any) {
    console.error('Invite email error:', err);
    return NextResponse.json({ error: err?.message || 'Email failed' }, { status: 500 });
  }
}
