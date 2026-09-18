// app/api/google/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';
import nodemailer from 'nodemailer';

export const runtime = 'nodejs';

function getClient() {
  const { GOOGLE_CLIENT_EMAIL, GOOGLE_PRIVATE_KEY } = process.env;
  console.log('[api/google] env check →', {
    email: GOOGLE_CLIENT_EMAIL ? 'set ✅' : '❌ MISSING',
    key: GOOGLE_PRIVATE_KEY ? 'set ✅' : '❌ MISSING',
  });
  if (!GOOGLE_CLIENT_EMAIL || !GOOGLE_PRIVATE_KEY) {
    throw new Error('Google service account environment variables are missing');
  }
  return new google.auth.JWT({
    email: GOOGLE_CLIENT_EMAIL,
    key: GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    scopes: ['https://www.googleapis.com/auth/calendar'],
  });
}

export async function POST(req: NextRequest) {
  try {
    const {
      meetingId, agenda, date, time, duration = 30,
      location, notes, officerName, officerEmail,
      includeMeet = false, sendInvite = false,
      syncCalendar,
      gcalEventId = '', existingMeetLink = '',
    } = await req.json();

    if (!date) {
      return NextResponse.json({ error: 'Meeting date is required' }, { status: 400 });
    }

    const wantsCalendar = syncCalendar !== false;
    const wantsMeet = !!includeMeet;
    const wantsEmail = !!sendInvite && !!officerEmail;
    const needsEvent = wantsCalendar || wantsMeet;

    if (!needsEvent && !wantsEmail) {
      return NextResponse.json({ skipped: true, meetLink: existingMeetLink || null, eventId: null, htmlLink: null });
    }

    const calendarId = process.env.GOOGLE_CALENDAR_ID || 'primary';
    const timeZone = process.env.APP_TIMEZONE || 'Asia/Kolkata';
    const startTime = time || '09:00';

    // midnight rollover
    const [h, m] = startTime.split(':').map(Number);
    const total = h * 60 + m + (Number(duration) || 30);
    const dayShift = Math.floor(total / 1440);
    const rem = total % 1440;
    const endTime = `${String(Math.floor(rem / 60)).padStart(2, '0')}:${String(rem % 60).padStart(2, '0')}`;
    const endDate = dayShift > 0
      ? new Date(new Date(`${date}T00:00:00Z`).getTime() + dayShift * 86400000).toISOString().slice(0, 10)
      : date;

    const description = [
      officerName && `With: ${officerName}`,
      location && `Location: ${location}`,
      notes && `Notes: ${notes}`,
      meetingId && `Meeting ID: ${meetingId}`,
    ].filter(Boolean).join('\n');

    const requestBody: any = {
      summary: agenda || 'Meeting',
      description,
      location,
      start: { dateTime: `${date}T${startTime}:00`, timeZone },
      end: { dateTime: `${endDate}T${endTime}:00`, timeZone },
      reminders: { useDefault: true },
    };

    const attendees = wantsEmail
      ? [{ email: officerEmail, displayName: officerName || undefined }]
      : undefined;
    if (attendees) requestBody.attendees = attendees;

    if (wantsMeet && !existingMeetLink) {
      requestBody.conferenceData = {
        createRequest: {
          requestId: `meet-${meetingId}-${Date.now()}`,
          conferenceSolutionKey: { type: 'hangoutsMeet' },
        },
      };
    }

    let meetLink: string | null = existingMeetLink || null;
    let eventId: string | null = null;
    let htmlLink: string | null = null;

    if (needsEvent) {
      const auth = getClient();
      const calendar = google.calendar({ version: 'v3', auth });
      const params: any = {
        calendarId,
        conferenceDataVersion: 1,
        sendUpdates: attendees ? 'all' : 'none',
        requestBody,
      };
      const event = gcalEventId
        ? await calendar.events.update({ ...params, eventId: gcalEventId })
        : await calendar.events.insert(params);
      meetLink = event.data.hangoutLink || existingMeetLink || null;
      eventId = event.data.id || null;
      htmlLink = event.data.htmlLink || null;
    }

    let emailSent = false;
    if (wantsEmail && process.env.SMTP_USER && process.env.SMTP_PASS) {
      try {
        const transporter = nodemailer.createTransport({
          host: process.env.SMTP_HOST || 'smtp.gmail.com',
          port: Number(process.env.SMTP_PORT || 465),
          secure: true,
          auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
        });
        await transporter.sendMail({
          from: `"Civillist Meetings" <${process.env.SMTP_USER}>`,
          to: officerEmail,
          subject: `Meeting Invitation: ${agenda || 'Meeting'}`,
          html: `<div style="font-family:Segoe UI,Arial,sans-serif;max-width:560px;margin:auto">
            <h2 style="color:#1e293b">Meeting Invitation</h2>
            <p>Dear ${officerName || 'Sir/Madam'},</p>
            <table style="border-collapse:collapse;width:100%">
              <tr><td style="padding:6px 12px 6px 0;color:#64748b"><b>Agenda</b></td><td>${agenda || '—'}</td></tr>
              <tr><td style="padding:6px 12px 6px 0;color:#64748b"><b>When</b></td><td>${date} ${startTime} (${duration} min)</td></tr>
              <tr><td style="padding:6px 12px 6px 0;color:#64748b"><b>Where</b></td><td>${location || '—'}${meetLink ? ' + Google Meet' : ''}</td></tr>
            </table>
            ${meetLink ? `<p style="margin:20px 0"><a href="${meetLink}" style="background:#4f46e5;color:#fff;padding:10px 22px;border-radius:999px;text-decoration:none;font-weight:600">Join on Google Meet</a></p>` : ''}
            <p style="color:#94a3b8;font-size:12px">Automated invitation from Civillist Meeting Management.</p>
          </div>`,
        });
        emailSent = true;
      } catch (mailErr) {
        console.error('Custom invite email failed:', mailErr);
      }
    }

    return NextResponse.json({ meetLink, eventId, htmlLink, emailSent });
  } catch (err: any) {
    console.error('Google sync error:', err?.response?.data || err);
    return NextResponse.json(
      { error: err?.response?.data?.error?.message || err?.message || 'Google sync failed' },
      { status: 500 }
    );
  }
}