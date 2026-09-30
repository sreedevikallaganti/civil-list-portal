// app/api/google/route.ts — OAuth + self-healing calendarId
import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';
import nodemailer from 'nodemailer';
import { getAuthorizedClient, isInvalidGrant } from '@/lib/googleAuth';
import { requireUser, esc, safeUrl } from '@/lib/serverAuth';
import { APP_TIMEZONE } from '@/lib/appConfig';

export const runtime = 'nodejs';

const reconnectResponse = () => {
  console.error('[api/google] refresh token expired or revoked — an admin must use “Reconnect Google”');
  return NextResponse.json({ error: 'Google connection expired', needsReconnect: true }, { status: 401 });
};

/* Remove a meeting's calendar event (meeting cancelled or deleted). */
export async function DELETE(req: NextRequest) {
  const user = await requireUser(req, 'editor');
  if (user instanceof NextResponse) return user;
  try {
    const { gcalEventId, notify = true } = await req.json();
    if (!gcalEventId) return NextResponse.json({ error: 'gcalEventId is required' }, { status: 400 });
    const calendar = google.calendar({ version: 'v3', auth: getAuthorizedClient() });
    try {
      await calendar.events.delete({
        calendarId: resolveCalendarId(), eventId: gcalEventId, sendUpdates: notify ? 'all' : 'none',
      });
    } catch (e: any) {
      const code = e?.code || e?.response?.status;
      if (code !== 404 && code !== 410) throw e; // already gone → fine
    }
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    if (isInvalidGrant(err)) return reconnectResponse();
    console.error('[api/google] delete failed:', err?.response?.data || err);
    return NextResponse.json({ error: err?.response?.data?.error?.message || err?.message || 'Delete failed' }, { status: 500 });
  }
}

/* A calendar ID is 'primary' or an email-like id; anything else (typo) falls back to 'primary'. */
function resolveCalendarId() {
  const id = (process.env.GOOGLE_CALENDAR_ID || 'primary').trim();
  if (id === 'primary' || id.includes('@')) return id;
  console.warn(`[api/google] GOOGLE_CALENDAR_ID "${id}" is not a valid calendar id — using 'primary'`);
  return 'primary';
}

export async function POST(req: NextRequest) {
  const user = await requireUser(req, 'editor');
  if (user instanceof NextResponse) return user;
  try {
    const {
      meetingId, agenda, date, time, duration = 30,
      location, notes, officerName, officerEmail,
      includeMeet = false, sendInvite = false, syncCalendar,
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

    const auth = getAuthorizedClient();
    const calendar = google.calendar({ version: 'v3', auth });

    const calendarId = resolveCalendarId();
    const timeZone = APP_TIMEZONE;
    const startTime = time || '09:00';

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

    const baseBody: any = {
      summary: agenda || 'Meeting',
      description,
      location,
      start: { dateTime: `${date}T${startTime}:00`, timeZone },
      end: { dateTime: `${endDate}T${endTime}:00`, timeZone },
      reminders: { useDefault: true },
    };
    if (wantsEmail) baseBody.attendees = [{ email: officerEmail, displayName: officerName || undefined }];
    if (wantsMeet && !existingMeetLink) {
      baseBody.conferenceData = {
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
      /* body variants: full → without attendees → without Meet → bare */
      const bodyVariants: { body: any; sendUpdates: string; note: string }[] = [
        { body: baseBody, sendUpdates: wantsEmail ? 'all' : 'none', note: 'full' },
      ];
      if (baseBody.attendees) {
        const { attendees, ...noAtt } = baseBody;
        bodyVariants.push({ body: noAtt, sendUpdates: 'none', note: 'no-attendees' });
      }
      if (baseBody.conferenceData) {
        const { conferenceData, ...noConf } = baseBody;
        const noAttNoConf: any = { ...noConf };
        delete noAttNoConf.attendees;
        bodyVariants.push({ body: noConf, sendUpdates: wantsEmail ? 'all' : 'none', note: 'no-meet' });
        bodyVariants.push({ body: noAttNoConf, sendUpdates: 'none', note: 'bare' });
      }

      /* ⭐ calendar variants: configured ID first, then 'primary' as safety net */
      const calendarIds = [...new Set([calendarId, 'primary'])];

      let lastErr: any = null;
      let saved = false;

      outer:
      for (const cid of calendarIds) {
        for (const bv of bodyVariants) {
          const modes: ('update' | 'insert')[] = gcalEventId ? ['update', 'insert'] : ['insert'];
          for (const mode of modes) {
            try {
              const params: any = {
                calendarId: cid,
                conferenceDataVersion: 1,
                sendUpdates: bv.sendUpdates,
                requestBody: bv.body,
              };
              const event = mode === 'update'
                ? await calendar.events.update({ ...params, eventId: gcalEventId })
                : await calendar.events.insert(params);
              meetLink = event.data.hangoutLink || existingMeetLink || null;
              eventId = event.data.id || null;
              htmlLink = event.data.htmlLink || null;
              saved = true;
              break outer;
            } catch (e: any) {
              if (isInvalidGrant(e)) throw e; // token dead — retrying other variants is pointless
              lastErr = e;
              console.warn(`[api/google] ✗ failed [${e?.code || e?.response?.status}]`,
                e?.response?.data?.error?.message || e?.message);
            }
          }
        }
      }
      if (!saved) throw lastErr;
    }

    let emailSent = false;
    if (wantsEmail && process.env.SMTP_USER && process.env.SMTP_PASS) {
      try {
        const transporter = nodemailer.createTransport({
          host: process.env.SMTP_HOST || 'smtp.gmail.com',
          port: Number(process.env.SMTP_PORT || 465),
          secure: Number(process.env.SMTP_PORT || 465) === 465,
          auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
        });
        await transporter.sendMail({
          from: `"Civillist Meetings" <${process.env.SMTP_USER}>`,
          to: officerEmail,
          subject: `Meeting Invitation: ${String(agenda || 'Meeting').replace(/[\r\n]+/g, ' ')}`,
          html: `<div style="font-family:Segoe UI,Arial,sans-serif;max-width:560px;margin:auto">
            <h2 style="color:#1e293b">Meeting Invitation</h2>
            <p>Dear ${esc(officerName || 'Sir/Madam')},</p>
            <table style="border-collapse:collapse;width:100%">
              <tr><td style="padding:6px 12px 6px 0;color:#64748b"><b>Agenda</b></td><td>${esc(agenda || '—')}</td></tr>
              <tr><td style="padding:6px 12px 6px 0;color:#64748b"><b>When</b></td><td>${esc(date)} ${esc(startTime)} (${esc(duration)} min)</td></tr>
              <tr><td style="padding:6px 12px 6px 0;color:#64748b"><b>Where</b></td><td>${esc(location || '—')}${meetLink ? ' + Google Meet' : ''}</td></tr>
            </table>
            ${safeUrl(meetLink) ? `<p style="margin:20px 0"><a href="${esc(safeUrl(meetLink))}" style="background:#4f46e5;color:#fff;padding:10px 22px;border-radius:999px;text-decoration:none;font-weight:600">Join on Google Meet</a></p>` : ''}
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
    if (isInvalidGrant(err)) return reconnectResponse();
    console.error('Google sync error:', err?.response?.data || err);
    return NextResponse.json(
      { error: err?.response?.data?.error?.message || err?.message || 'Google sync failed' },
      { status: 500 }
    );
  }
}