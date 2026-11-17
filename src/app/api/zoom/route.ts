// app/api/zoom/route.ts — Zoom meeting links (lib/zoom).
//   POST { agenda, date, time, duration, notes?, existingLink? }
//                                         → { joinUrl } — moves the existing Zoom meeting, or creates one
//   DELETE { link }                       → removes that Zoom meeting (cancelled / deleted / switched to Meet)
import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/serverAuth';
import { zoomMeetingId } from '@/lib/videoCall';
import { createZoomMeeting, deleteZoomMeeting, updateZoomMeeting, ZoomError } from '@/lib/zoom';

export const runtime = 'nodejs';

const failed = (err: any) => {
  console.error('[api/zoom]', err); // the technical reason (missing ZOOM_* keys, Zoom's answer) is here
  const status = err instanceof ZoomError ? err.status : 500;
  const error = status === 501
    ? 'Zoom isn’t set up yet — please ask your administrator.'
    : 'Couldn’t set up the Zoom meeting — please try again.';
  return NextResponse.json({ error }, { status });
};

export async function POST(req: NextRequest) {
  const user = await requireUser(req, 'editor');
  if (user instanceof NextResponse) return user;
  try {
    const { agenda, date, time, duration = 30, notes = '', existingLink = '' } = await req.json();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date || '').slice(0, 10))) {
      return NextResponse.json({ error: 'Meeting date is required' }, { status: 400 });
    }
    const input = { agenda, date: String(date).slice(0, 10), time, duration: Number(duration) || 30, notes };
    const id = zoomMeetingId(existingLink);
    if (id && await updateZoomMeeting(id, input)) return NextResponse.json({ joinUrl: existingLink, updated: true });
    const { joinUrl } = await createZoomMeeting(input); // new, or the old one was deleted in Zoom
    return NextResponse.json({ joinUrl, created: true });
  } catch (err) {
    return failed(err);
  }
}

export async function DELETE(req: NextRequest) {
  const user = await requireUser(req, 'editor');
  if (user instanceof NextResponse) return user;
  try {
    const { link } = await req.json();
    const id = zoomMeetingId(link);
    if (!id) return NextResponse.json({ ok: true, skipped: true }); // not a Zoom link
    await deleteZoomMeeting(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return failed(err);
  }
}
