// lib/zoom.ts — server-only: Zoom meetings through a Zoom "Server-to-Server OAuth" app.
//
// Set up once (marketplace.zoom.us → Develop → Build App → Server-to-Server OAuth), then in .env.local:
//   ZOOM_ACCOUNT_ID=…  ZOOM_CLIENT_ID=…  ZOOM_CLIENT_SECRET=…
//   ZOOM_USER_EMAIL=host@example.com   the Zoom user who hosts the meetings (default: the app's owner, "me")
// Scopes the app needs: meeting:write:meeting:admin, meeting:update:meeting:admin, meeting:delete:meeting:admin
// (or the classic meeting:write:admin).
import { APP_TIMEZONE } from './appConfig';

const env = (k: string) => (process.env[k] || '').trim();
const API = 'https://api.zoom.us/v2';

export const zoomConfigured = () => !!(env('ZOOM_ACCOUNT_ID') && env('ZOOM_CLIENT_ID') && env('ZOOM_CLIENT_SECRET'));

export class ZoomError extends Error {
  constructor(message: string, public status = 500) { super(message); }
}

let cached: { token: string; until: number } | null = null;

async function token(): Promise<string> {
  if (cached && Date.now() < cached.until) return cached.token;
  if (!zoomConfigured()) throw new ZoomError('Zoom isn’t set up — add ZOOM_ACCOUNT_ID / ZOOM_CLIENT_ID / ZOOM_CLIENT_SECRET to .env.local', 501);
  const basic = Buffer.from(`${env('ZOOM_CLIENT_ID')}:${env('ZOOM_CLIENT_SECRET')}`).toString('base64');
  const res = await fetch(
    `https://zoom.us/oauth/token?grant_type=account_credentials&account_id=${encodeURIComponent(env('ZOOM_ACCOUNT_ID'))}`,
    { method: 'POST', headers: { Authorization: `Basic ${basic}` }, cache: 'no-store' },
  );
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.access_token) {
    throw new ZoomError(`Zoom sign-in failed: ${data.reason || data.error || res.status} — check the ZOOM_* keys in .env.local`, 502);
  }
  cached = { token: data.access_token, until: Date.now() + (Number(data.expires_in) || 3600) * 1000 - 60_000 };
  return cached.token;
}

async function call(method: string, path: string, body?: unknown) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { Authorization: `Bearer ${await token()}`, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: 'no-store',
  });
  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ZoomError(`Zoom: ${data.message || res.statusText}`, res.status);
  return data;
}

export type ZoomMeetingInput = { agenda: string; date: string; time: string; duration: number; notes?: string };

const meetingBody = (m: ZoomMeetingInput) => ({
  topic: (m.agenda || 'Meeting').replace(/[\r\n]+/g, ' ').slice(0, 200),
  type: 2, // scheduled
  start_time: `${m.date}T${m.time || '09:00'}:00`,
  timezone: APP_TIMEZONE,
  duration: Math.max(1, Math.round(Number(m.duration) || 30)),
  agenda: (m.notes || '').slice(0, 2000),
  settings: { waiting_room: true, join_before_host: false },
});

/** A new Zoom meeting → its join link and id. */
export async function createZoomMeeting(m: ZoomMeetingInput) {
  const host = encodeURIComponent(env('ZOOM_USER_EMAIL') || 'me');
  const data = await call('POST', `/users/${host}/meetings`, meetingBody(m));
  return { joinUrl: String(data.join_url), id: String(data.id) };
}

/** Moves / renames an existing Zoom meeting. false when it no longer exists in Zoom. */
export async function updateZoomMeeting(id: string, m: ZoomMeetingInput) {
  try {
    await call('PATCH', `/meetings/${encodeURIComponent(id)}`, meetingBody(m));
    return true;
  } catch (e) {
    if (e instanceof ZoomError && e.status === 404) return false;
    throw e;
  }
}

/** Deletes a Zoom meeting (already gone is fine). */
export async function deleteZoomMeeting(id: string) {
  try {
    await call('DELETE', `/meetings/${encodeURIComponent(id)}`);
  } catch (e) {
    if (!(e instanceof ZoomError && e.status === 404)) throw e;
  }
}
