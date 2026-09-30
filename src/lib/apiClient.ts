// lib/apiClient.ts — browser-side calls to our own /api routes, signed with the PocketBase session.
import pb from '@/lib/pocketbase';

/** fetch JSON with the login token and a hard timeout; throws Error (+ response fields) on failure */
export async function apiJSON<T = any>(url: string, body: any, { method = 'POST', timeoutMs = 20_000 } = {}): Promise<T> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json', Authorization: pb.authStore.token || '' },
      body: JSON.stringify(body ?? {}),
      signal: ctrl.signal,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw Object.assign(new Error(data.error || `Request failed (${res.status})`), data);
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
    await apiJSON('/api/google', { gcalEventId: eventId, notify }, { method: 'DELETE' });
    if (clearRecord) {
      await pb.collection('meetings').update(meeting.id, { gcal_event_id: '', gcal_link: '' }).catch(() => {});
    }
  } catch (e) {
    console.warn('[google] could not remove calendar event:', e);
  }
}
