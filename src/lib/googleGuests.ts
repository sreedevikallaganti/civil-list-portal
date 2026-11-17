// lib/googleGuests.ts — server-only: who was invited to a Google Calendar event and how they replied.
// Used by the automatic "meeting confirmed" emails (participantMailRunner) and the dashboard's
// "Awaiting confirmation" card (/api/google/responses).
import { google } from 'googleapis';
import { listSenders } from './senders';
import { getAuthorizedClient } from './googleAuth';

export type GuestReply = 'accepted' | 'declined' | 'tentative' | 'needsAction';
export type Guest = { email: string; reply: GuestReply };

const env = (k: string) => (process.env[k] || '').trim();

/** The event's guests (not the organiser / our own accounts), or null when no connected account has the event. */
export async function eventGuests(eventId: string): Promise<Guest[] | null> {
  const own = new Set(listSenders().map((s) => s.email.toLowerCase()).filter(Boolean));
  for (const s of listSenders()) {
    try {
      const calendar = google.calendar({ version: 'v3', auth: getAuthorizedClient(s.id) });
      const calendarId = s.id === 'main' ? (env('GOOGLE_CALENDAR_ID') || 'primary') : 'primary';
      const ev = await calendar.events.get({ calendarId, eventId });
      if (ev.data.status === 'cancelled' || ev.data.organizer?.self === false) continue;
      return (ev.data.attendees || [])
        .filter((a) => !a.organizer && !a.self && a.email && !own.has(a.email.toLowerCase()))
        .map((a) => ({
          email: a.email!.toLowerCase(),
          reply: (['accepted', 'declined', 'tentative'].includes(String(a.responseStatus)) ? a.responseStatus : 'needsAction') as GuestReply,
        }));
    } catch { /* not this account / not connected */ }
  }
  return null;
}
