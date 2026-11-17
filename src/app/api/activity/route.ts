// app/api/activity/route.ts — records one entry in the PocketBase `activity_logs` collection.
// The browser says WHAT happened; WHO did it (user id / name), the IP address and the device
// are taken from the verified session and the request on the server, so they can't be faked.
// Same shape as the entries imported from the old system.
import { NextRequest, NextResponse } from 'next/server';
import { orgOfRequest, pbURL, requireUser } from '@/lib/serverAuth';

export const runtime = 'nodejs';

const clip = (v: unknown, max: number) => String(v ?? '').replace(/[\r\n]+/g, ' ').trim().slice(0, max);

export async function POST(req: NextRequest) {
  const user = await requireUser(req, 'viewer');
  if (user instanceof NextResponse) return user;

  const body = await req.json().catch(() => ({}));
  const action = clip(body.action, 40).toLowerCase();
  if (!action) return NextResponse.json({ error: 'action is required' }, { status: 400 });

  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
  const forwarded = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || '';
  const entry = {
    action,
    resource_type: clip(body.resource_type, 40),
    resource_id: clip(body.resource_id, 40),
    details: clip(body.details, 500),
    user_id: user.id,
    user_name: user.name || user.email || '',
    ip_address: forwarded.split(',')[0].trim(),
    user_agent: clip(req.headers.get('user-agent'), 400),
    timestamp: new Date().toISOString(),
    // the caller's own organisation (the activity_logs rules reject any other)
    ...(orgOfRequest(req, user) && { org: orgOfRequest(req, user) }),
  };

  // written with the person's own session, so the collection's API rules still apply
  const res = await fetch(`${pbURL()}/api/collections/activity_logs/records`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: token },
    body: JSON.stringify(entry),
    cache: 'no-store',
  }).catch(() => null);

  if (!res?.ok) {
    const detail = res ? await res.json().catch(() => ({})) : {};
    // for the developer: 400/403 usually means the activity_logs Create rule in PocketBase rejects the entry
    console.error('[activity] could not store the entry —', res ? `PocketBase answered ${res.status} (check the activity_logs Create rule)` : 'PocketBase unreachable', detail);
    return NextResponse.json(
      { error: 'This action couldn’t be added to the activity history.' },
      { status: res?.status === 403 ? 403 : 502 },
    );
  }
  return NextResponse.json({ ok: true }, { status: 201 });
}
