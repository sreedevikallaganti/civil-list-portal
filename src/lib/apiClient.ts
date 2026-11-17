// lib/apiClient.ts — browser-side calls to our own /api routes, signed with the PocketBase session.
import pb from '@/lib/pocketbase';
import { orgIdOf } from '@/lib/tenancy';
import { videoPlatform } from '@/lib/videoCall';

/** the org being worked in — the server uses it for platform-owner (superuser) requests */
export const orgHeader = (): Record<string, string> => {
  const id = orgIdOf(pb.authStore.record as any);
  return id ? { 'X-Org': id } : {};
};

/** fetch JSON with the login token and a hard timeout; throws Error (+ response fields) on failure */
export async function apiJSON<T = any>(url: string, body: any, { method = 'POST', timeoutMs = 20_000 } = {}): Promise<T> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json', Authorization: pb.authStore.token || '', ...orgHeader() },
      body: JSON.stringify(body ?? {}),
      signal: ctrl.signal,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      if (!data.error) console.warn(`[api] ${method} ${url} failed with ${res.status}`, data);
      throw Object.assign(new Error(data.error || 'Something went wrong — please try again.'), data);
    }
    return data as T;
  } finally {
    clearTimeout(t);
  }
}

/** Sends the admin to Google's consent screen; the new token is stored server-side. */
export async function reconnectGoogle() {
  const { url } = await apiJSON<{ url: string }>('/api/google/connect', {});
  const w = window.open(url, '_blank');
  if (!w) window.location.assign(url); // pop-up blocked → same tab (the callback page links back)
}

/** Removes a meeting's Google Calendar event (on cancel / delete) and clears the saved link. */
export async function removeGoogleEvent(meeting: any, { notify = true, clearRecord = true } = {}) {
  const eventId = meeting?.gcal_event_id;
  if (!eventId) return;
  try {
    await apiJSON('/api/google', { gcalEventId: eventId, notify, sender: meeting?.sender }, { method: 'DELETE' });
    if (clearRecord) {
      await pb.collection('meetings').update(meeting.id, { gcal_event_id: '', gcal_link: '' }).catch(() => {});
    }
  } catch (e) {
    console.warn('[google] could not remove calendar event:', e);
  }
}

/** Removes a meeting's Zoom meeting (on cancel / delete) and clears the saved link. */
export async function removeZoomMeeting(meeting: any, { clearRecord = true } = {}) {
  if (videoPlatform(meeting?.meet_link) !== 'zoom') return;
  try {
    await apiJSON('/api/zoom', { link: meeting.meet_link }, { method: 'DELETE' });
    if (clearRecord) await pb.collection('meetings').update(meeting.id, { meet_link: '' }).catch(() => {});
  } catch (e) {
    console.warn('[zoom] could not remove the Zoom meeting:', e);
  }
}

/** Cancel / delete: drop the Google Calendar event and the Zoom meeting, whichever the meeting has. */
export async function removeCalendarAndVideo(meeting: any, opts: { notify?: boolean; clearRecord?: boolean } = {}) {
  await Promise.all([removeGoogleEvent(meeting, opts), removeZoomMeeting(meeting, opts)]);
}

/** Reschedule: move the meeting's Zoom meeting to the new time (no-op for other links).
    Resolves to the link to use from now on (a new one when Zoom had to recreate the meeting). */
export async function moveZoomMeeting(meeting: any, when: { date: string; time: string; duration: number }): Promise<string | undefined> {
  if (videoPlatform(meeting?.meet_link) !== 'zoom') return undefined;
  const r = await apiJSON<{ joinUrl: string }>('/api/zoom', {
    agenda: meeting.agenda, ...when, existingLink: meeting.meet_link,
  }, { timeoutMs: 30_000 });
  // the old one was deleted in Zoom → a new link was made
  if (r.joinUrl && r.joinUrl !== meeting.meet_link) {
    await pb.collection('meetings').update(meeting.id, { meet_link: r.joinUrl }).catch(() => {});
  }
  return r.joinUrl || meeting.meet_link;
}
