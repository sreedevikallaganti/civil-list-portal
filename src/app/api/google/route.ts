import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';

export const runtime = 'nodejs';

function getClient() {
  const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN } = process.env;
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
      includeMeet = false, sendInvite = false,
      gcalEventId = '', existingMeetLink = '',
    } = await req.json();

    if (!date) {
      return NextResponse.json({ error: 'Meeting date is required' }, { status: 400 });
    }

    const auth = getClient();
    const calendar = google.calendar({ version: 'v3', auth });
    const calendarId = process.env.GOOGLE_CALENDAR_ID || 'primary';
    const timeZone = process.env.APP_TIMEZONE || 'Asia/Kolkata';

    const start = new Date(`${date}T${time || '09:00'}:00`);
    if (isNaN(start.getTime())) {
      return NextResponse.json({ error: 'Invalid meeting date/time' }, { status: 400 });
    }
    const end = new Date(start.getTime() + Number(duration) * 60_000);

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
      start: { dateTime: start.toISOString(), timeZone },
      end: { dateTime: end.toISOString(), timeZone },
      reminders: { useDefault: true },
    };

    if (sendInvite && officerEmail) {
      requestBody.attendees = [{ email: officerEmail, displayName: officerName || undefined }];
    }

    if (includeMeet && !existingMeetLink) {
      requestBody.conferenceData = {
        createRequest: {
          requestId: `meet-${meetingId}-${Date.now()}`,
          conferenceSolutionKey: { type: 'hangoutsMeet' },
        },
      };
    }

    const params: any = {
      calendarId,
      conferenceDataVersion: 1,
      sendUpdates: sendInvite ? 'all' : 'none',
      requestBody,
    };

    let event;
    if (gcalEventId) {
      event = await calendar.events.update({ ...params, eventId: gcalEventId });
    } else {
      event = await calendar.events.insert(params);
    }

    return NextResponse.json({
      meetLink: event.data.hangoutLink || existingMeetLink || null,
      eventId: event.data.id,
      htmlLink: event.data.htmlLink,
    });
  } catch (err: any) {
    console.error('Google sync error:', err?.response?.data || err);
    return NextResponse.json(
      { error: err?.response?.data?.error?.message || err?.message || 'Google sync failed' },
      { status: 500 }
    );
  }
}