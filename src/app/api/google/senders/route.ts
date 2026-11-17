// app/api/google/senders/route.ts — the accounts meetings can be sent from (lib/senders),
// each with its Google connection status. Any signed-in user may ask; no secrets are returned.
import { NextRequest, NextResponse } from 'next/server';
import { checkGoogle } from '@/lib/googleStatus';
import { requireGoogleOrg, requireUser } from '@/lib/serverAuth';
import { calendarAllAccounts, defaultSender, listSenders, orgName, principalSender, publicSender, senderForUser } from '@/lib/senders';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const user = await requireUser(req, 'viewer');
  if (user instanceof NextResponse) return user;
  if (await requireGoogleOrg(req, user)) return NextResponse.json({ senders: [] });

  const { fresh = false } = await req.json().catch(() => ({}));
  const senders = await Promise.all(listSenders().map(async (s) => ({
    ...publicSender(s),
    google: await checkGoogle(!!fresh, s.id),
  })));
  return NextResponse.json({ senders, defaultSender: defaultSender().id, yourSender: senderForUser(user.email).id, allCalendars: calendarAllAccounts() && senders.length > 1, org: orgName(), principal: principalSender()?.id ?? null });
}
