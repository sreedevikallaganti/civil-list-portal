// app/api/google/responses/route.ts — how the guests replied to the Google Calendar invitations
// of the given events (dashboard "Awaiting confirmation" card). Any signed-in user may ask.
//   POST { eventIds: string[] } → { responses: { [eventId]: { accepted, declined, tentative, waiting } | null } }
import { NextRequest, NextResponse } from 'next/server';
import { eventGuests } from '@/lib/googleGuests';
import { requireGoogleOrg, requireUser } from '@/lib/serverAuth';

export const runtime = 'nodejs';

const MAX_EVENTS = 40;

export async function POST(req: NextRequest) {
  const user = await requireUser(req, 'viewer');
  if (user instanceof NextResponse) return user;
  if (await requireGoogleOrg(req, user)) return NextResponse.json({ responses: {} });

  const { eventIds } = await req.json().catch(() => ({}));
  const ids = [...new Set((Array.isArray(eventIds) ? eventIds : []).map(String).filter((x) => /^[\w-]{5,1024}$/.test(x)))].slice(0, MAX_EVENTS);

  const entries = await Promise.all(ids.map(async (id) => {
    const guests = await eventGuests(id).catch(() => null);
    if (!guests) return [id, null] as const;
    const count = (r: string) => guests.filter((g) => g.reply === r).length;
    return [id, { accepted: count('accepted'), declined: count('declined'), tentative: count('tentative'), waiting: count('needsAction') }] as const;
  }));
  return NextResponse.json({ responses: Object.fromEntries(entries) });
}
