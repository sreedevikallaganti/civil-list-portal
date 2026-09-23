// app/api/google/route.ts — OAuth + self-healing calendarId
import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';
import nodemailer from 'nodemailer';

export const runtime = 'nodejs';

function getClient() {
  const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN } = process.env;
  console.log('[api/google] env check →', {
    id: GOOGLE_CLIENT_ID ? 'set ✅' : '❌ MISSING',
    secret: GOOGLE_CLIENT_SECRET ? 'set ✅' : '❌ MISSING',
    token: GOOGLE_REFRESH_TOKEN ? 'set ✅' : '❌ MISSING',
  });
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !GOOGLE_REFRESH_TOKEN) {
    throw new Error('Google OAuth environment variables are missing');
  }
  const auth = new google.auth.OAuth2(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET);
  auth.setCredentials({ refresh_token: GOOGLE_REFRESH_TOKEN });
  return auth;
}

export async function POST(req: NextRequest) {
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

    const auth = getClient();
    const calendar = google.calendar({ version: 'v3', auth });

    /* ⭐ DIAGNOSTIC: prove which account/calendar this token can actually reach */
    try {
      const me = await calendar.calendars.get({ calendarId: 'primary' });
      console.log('[api/google] 🔑 token belongs to calendar →', me.data.id, '| timezone:', me.data.timeZone);
    } catch (preErr: any) {
      console.log('[api/google] 🔑 token CANNOT read primary calendar →',
        preErr?.code, preErr?.response?.data?.error?.message || preErr?.message);
    }

    const calendarId = (process.env.GOOGLE_CALENDAR_ID || 'primary').trim();
    console.log('[api/google] configured calendarId →', JSON.stringify(calendarId));
    const timeZone = process.env.APP_TIMEZONE || 'Asia/Kolkata';
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
              console.log(`[api/google] attempt → calendar:${cid} | ${bv.note} | ${mode}`);
              const event = mode === 'update'
                ? await calendar.events.update({ ...params, eventId: gcalEventId })
                : await calendar.events.insert(params);
              meetLink = event.data.hangoutLink || existingMeetLink || null;
              eventId = event.data.id || null;
              htmlLink = event.data.htmlLink || null;
              saved = true;
              console.log(`[api/google] ✅ SAVED → calendar:${cid} | ${bv.note} | ${mode} | eventId:`, eventId);
              break outer;
            } catch (e: any) {
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