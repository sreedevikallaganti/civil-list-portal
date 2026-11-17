// app/api/google/route.ts — OAuth + self-healing calendarId
import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';
import { getAuthorizedClient, isInvalidGrant } from '@/lib/googleAuth';
import { requireUser, requireGoogleOrg, safeUrl } from '@/lib/serverAuth';
import { APP_TIMEZONE } from '@/lib/appConfig';
import { calendarAllAccounts, getSender, listSenders } from '@/lib/senders';
import { mailerFor } from '@/lib/mailer';
import { sendMeetingEmails, slotLabel, isoDateOf, timeOf } from '@/lib/meetingMail';
import { videoLabel } from '@/lib/videoCall';

export const runtime = 'nodejs';

/* dev warm-up ping from the meeting form (compiles this route early) — no data, no auth needed */
export function HEAD() {
  return new Response(null, { status: 204 });
}

const reconnectResponse = (senderId = 'main') => {
  const s = getSender(senderId);
  console.error(`[api/google] ${s.email || s.label}: refresh token missing, expired or revoked — connect it in Settings → Google accounts`);
  return NextResponse.json({ error: `Google connection for ${s.email || s.label} expired`, needsReconnect: true, sender: s.id }, { status: 401 });
};

/* The calendar each sender writes to: the main account may use GOOGLE_CALENDAR_ID, the others their own. */
function calendarIdFor(senderId: string) {
  return senderId === 'main' ? resolveCalendarId() : 'primary';
}

type Owner = { id: string; attendees: { email?: string | null; [k: string]: any }[] };

/* Which connected sender organises this calendar event? (the preferred one is asked first)
   Only the organiser can update / remove it — the other accounts only hold a guest copy
   (same event id), so those are skipped. */
async function findEventOwner(eventId: string, preferred: string): Promise<Owner | null> {
  const ids = [...new Set([getSender(preferred).id, ...listSenders().map((s) => s.id)])];
  for (const id of ids) {
    try {
      const calendar = google.calendar({ version: 'v3', auth: getAuthorizedClient(id) });
      const ev = await calendar.events.get({ calendarId: calendarIdFor(id), eventId });
      if (ev.data.status !== 'cancelled' && ev.data.organizer?.self !== false) {
        return { id, attendees: (ev.data.attendees || []) as Owner['attendees'] };
      }
    } catch { /* not this account (or it isn't connected) */ }
  }
  return null;
}

/* The first of these accounts whose Google connection works (null = none). */
async function firstConnected(ids: string[]): Promise<string | null> {
  for (const id of [...new Set(ids)]) {
    try {
      await getAuthorizedClient(id).getAccessToken();
      return id;
    } catch { /* not connected / expired — try the next */ }
  }
  return null;
}

/* Remove a meeting's calendar event (meeting cancelled or deleted). */
export async function DELETE(req: NextRequest) {
  const user = await requireUser(req, 'editor');
  if (user instanceof NextResponse) return user;
  const noGoogle = await requireGoogleOrg(req, user); // the Google account belongs to one organisation
  if (noGoogle) return noGoogle;
  try {
    const { gcalEventId, notify = true, sender: preferred } = await req.json();
    if (!gcalEventId) return NextResponse.json({ error: 'There’s no calendar event to remove for this meeting.' }, { status: 400 });
    const owner = await findEventOwner(gcalEventId, getSender(preferred, user.email).id);
    if (!owner) return NextResponse.json({ ok: true, alreadyGone: true }); // in no connected calendar
    // removing it from the organiser also removes the guest copies in the other calendars
    const calendar = google.calendar({ version: 'v3', auth: getAuthorizedClient(owner.id) });
    try {
      await calendar.events.delete({
        calendarId: calendarIdFor(owner.id), eventId: gcalEventId, sendUpdates: notify ? 'all' : 'none',
      });
    } catch (e: any) {
      const code = e?.code || e?.response?.status;
      if (code !== 404 && code !== 410) throw e; // already gone → fine
    }
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    if (isInvalidGrant(err)) return reconnectResponse();
    console.error('[api/google] delete failed:', err?.response?.data || err);
    return NextResponse.json({ error: 'Couldn’t remove the meeting from Google Calendar — please try again.' }, { status: 500 });
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
  const noGoogle = await requireGoogleOrg(req, user); // the Google account belongs to one organisation
  if (noGoogle) return noGoogle;
  let senderUsed = 'main';
  try {
    const {
      meetingId, agenda, date, time, duration = 30,
      location, notes, officerName, officerEmail,
      includeMeet = false, sendInvite = false, syncCalendar,
      gcalEventId = '', existingMeetLink = '', sender: chosen,
      onBehalf, fromName, // how the invite email is signed (lib/mailer)
      template, previous, reason, // 'rescheduled' + the old { date, time } → the reschedule email instead
      videoLink = '', // a Zoom link (lib/zoom) — goes into the event instead of a Meet link
      guests: extraGuests = [], // [{ email, name }] — the other participants, each gets Google's invitation
    } = await req.json();

    if (!date) {
      return NextResponse.json({ error: 'Meeting date is required' }, { status: 400 });
    }

    const wantsCalendar = syncCalendar !== false;
    const wantsMeet = !!includeMeet;
    const wantsEmail = !!sendInvite && !!officerEmail;
    const otherGuests = (Array.isArray(extraGuests) ? extraGuests : [])
      .map((g: any) => ({ email: String(g?.email || '').trim().toLowerCase(), name: String(g?.name || '').trim() }))
      .filter((g: { email: string }) => /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(g.email))
      .slice(0, 50);
    // Google's own invitation to everyone on the event (each guest gets their own)
    // Google's own (plain) invitation email is only used when the app can't send its own — the app's
    // email (lib/emailTemplates) carries the same calendar invite, Yes / No / Maybe included.
    // GOOGLE_INVITE_EMAILS=on sends Google's as well.
    const appSendsEmails = !!sendInvite && !!mailerFor(chosen, user.email) && !/^(on|true|1|yes)$/i.test(process.env.GOOGLE_INVITE_EMAILS || '');
    const notifyGuests = !appSendsEmails && !!sendInvite && (!!officerEmail || otherGuests.length > 0);
    const needsEvent = wantsCalendar || wantsMeet;

    if (!needsEvent && !wantsEmail) {
      return NextResponse.json({ skipped: true, meetLink: existingMeetLink || null, eventId: null, htmlLink: null });
    }

    // invites come from the signed-in user's own account (else SENDER_DEFAULT), which also
    // organises new events; an existing event stays with the account that organises it
    const mailFrom = getSender(chosen, user.email).id;
    let account = '';
    let eventToUpdate = gcalEventId;
    let keepAttendees: Owner['attendees'] = [];
    if (gcalEventId) {
      const owner = await findEventOwner(gcalEventId, mailFrom);
      if (owner) { account = owner.id; keepAttendees = owner.attendees; }
      else eventToUpdate = ''; // deleted in Google — create a fresh event
    }
    if (!account) {
      // the default account; if it isn't connected, another one (the meeting still reaches every calendar)
      account = (await firstConnected([mailFrom, ...listSenders().map((s) => s.id)])) || mailFrom;
    }
    senderUsed = account;

    // the other accounts are guests, so the event shows in their calendars too
    const accountGuests = calendarAllAccounts()
      ? listSenders().filter((s) => s.id !== account && s.email).map((s) => s.email.toLowerCase())
      : [];

    const auth = getAuthorizedClient(account);
    const calendar = google.calendar({ version: 'v3', auth });

    const calendarId = calendarIdFor(account);
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
      videoLink && `Join on ${videoLabel(videoLink)}: ${videoLink}`,
      meetingId && `Meeting ID: ${meetingId}`,
    ].filter(Boolean).join('\n');

    const baseBody: any = {
      summary: agenda || 'Meeting',
      description,
      location: location || videoLink || undefined,
      start: { dateTime: `${date}T${startTime}:00`, timeZone },
      end: { dateTime: `${endDate}T${endTime}:00`, timeZone },
      reminders: { useDefault: true },
    };
    // guests: whoever was already on the event + the officer (when inviting) + the other accounts
    const guests = new Map<string, any>();
    for (const a of keepAttendees) if (a.email) guests.set(a.email.toLowerCase(), a);
    if (wantsEmail) guests.set(String(officerEmail).toLowerCase(), { email: officerEmail, displayName: officerName || undefined });
    if (sendInvite) for (const g of otherGuests) if (!guests.has(g.email)) guests.set(g.email, { email: g.email, displayName: g.name || undefined });
    for (const email of accountGuests) if (!guests.has(email)) guests.set(email, { email, responseStatus: 'accepted' });
    if (guests.size) {
      baseBody.attendees = [...guests.values()];
      baseBody.guestsCanSeeOtherGuests = false; // officers don't see the office's own accounts
    }
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
    // the event's UID / organiser / sequence — the app's invite email answers into this event
    let eventCalendar: { uid?: string; organizer?: string; sequence?: number } | undefined;

    if (needsEvent) {
      /* body variants: full → without attendees → without Meet → bare */
      const bodyVariants: { body: any; sendUpdates: string; note: string }[] = [
        { body: baseBody, sendUpdates: notifyGuests ? 'all' : 'none', note: 'full' },
      ];
      if (baseBody.attendees) {
        const { attendees, ...noAtt } = baseBody;
        bodyVariants.push({ body: noAtt, sendUpdates: 'none', note: 'no-attendees' });
      }
      if (baseBody.conferenceData) {
        const { conferenceData, ...noConf } = baseBody;
        const noAttNoConf: any = { ...noConf };
        delete noAttNoConf.attendees;
        bodyVariants.push({ body: noConf, sendUpdates: notifyGuests ? 'all' : 'none', note: 'no-meet' });
        bodyVariants.push({ body: noAttNoConf, sendUpdates: 'none', note: 'bare' });
      }

      /* ⭐ calendar variants: configured ID first, then 'primary' as safety net */
      const calendarIds = [...new Set([calendarId, 'primary'])];

      let lastErr: any = null;
      let saved = false;

      outer:
      for (const cid of calendarIds) {
        for (const bv of bodyVariants) {
          const modes: ('update' | 'insert')[] = eventToUpdate ? ['update', 'insert'] : ['insert'];
          for (const mode of modes) {
            try {
              const params: any = {
                calendarId: cid,
                conferenceDataVersion: 1,
                sendUpdates: bv.sendUpdates,
                requestBody: bv.body,
              };
              const event = mode === 'update'
                ? await calendar.events.update({ ...params, eventId: eventToUpdate })
                : await calendar.events.insert(params);
              meetLink = event.data.hangoutLink || existingMeetLink || null;
              eventId = event.data.id || null;
              eventCalendar = {
                uid: event.data.iCalUID || (event.data.id ? `${event.data.id}@google.com` : undefined),
                organizer: event.data.organizer?.email || undefined,
                sequence: event.data.sequence ?? 0,
              };
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
    const callLink = videoLink || meetLink; // what the officer joins with
    const mailer = wantsEmail ? mailerFor(mailFrom, user.email, { onBehalf, fromName }) : null;
    if (mailer) {
      // the invitation (or, after a date / time change, the reschedule notice) — lib/emailTemplates —
      // with the Google event's calendar invite, so Yes / No / Maybe updates that event.
      const r = await sendMeetingEmails(mailer, template === 'rescheduled' ? 'rescheduled' : 'invite', {
        id: meetingId, agenda, meeting_date: date, meeting_time: startTime, duration, location, meet_link: safeUrl(callLink),
      }, {
        recipients: [{ email: String(officerEmail).trim().toLowerCase(), name: officerName ? String(officerName) : '' }],
        previous: previous && typeof previous === 'object' ? slotLabel(isoDateOf(previous.date), timeOf(previous.time)) : '',
        reason: String(reason || '').slice(0, 200),
        calendar: eventCalendar,
      });
      emailSent = r.sent.length > 0;
    }

    return NextResponse.json({ meetLink, eventId, htmlLink, emailSent, sender: account, calendars: [account, ...accountGuests], calendar: eventCalendar });
  } catch (err: any) {
    if (isInvalidGrant(err)) return reconnectResponse(senderUsed);
    console.error('Google sync error:', err?.response?.data || err);
    return NextResponse.json(
      { error: 'Couldn’t add the meeting to Google Calendar — the meeting itself is saved. Please try “Sync to Google” again later.' },
      { status: 500 }
    );
  }
}