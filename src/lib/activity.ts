// lib/activity.ts — record what people do (shown on Reports → Activity Log).
//   logActivity('created', 'meeting', 'Meeting “Budget review” with Shri R. Kumar', meetingId)
// Fire-and-forget: it never slows down or breaks the action being logged.
// Who did it, their IP address and device are filled in by the server (/api/activity).

import pb from '@/lib/pocketbase';
import { orgHeader } from '@/lib/apiClient';

export type ActivityAction =
  | 'login' | 'logout' | 'created' | 'updated' | 'deleted' | 'status changed'
  | 'rescheduled' | 'cancelled' | 'completed' | 'minutes added' | 'password changed' | 'profile updated';

export function logActivity(action: ActivityAction, resourceType: string, details: string, resourceId = '', token = pb.authStore.token) {
  if (!token || typeof window === 'undefined') return;
  fetch('/api/activity', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: token, ...orgHeader() },
    body: JSON.stringify({ action, resource_type: resourceType, resource_id: resourceId, details }),
    keepalive: true, // still sent if the page is closing (e.g. sign-out)
  }).catch(() => { /* logging must never get in the way */ });
}

/** "Meeting “Budget review” with Shri R. Kumar on 8 Oct" — short, readable descriptions. */
export function meetingLabel(m: { agenda?: string; officer_name?: string; meeting_date?: string } | null | undefined) {
  if (!m) return 'Meeting';
  const date = String(m.meeting_date || '').slice(0, 10);
  const when = /^\d{4}-\d{2}-\d{2}$/.test(date)
    ? ` on ${new Date(`${date}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}`
    : '';
  return `Meeting “${m.agenda || 'Untitled'}”${m.officer_name ? ` with ${m.officer_name}` : ''}${when}`;
}
