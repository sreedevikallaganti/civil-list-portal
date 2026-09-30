// lib/meetingRules.ts — business rules shared by every place that changes a meeting.

/** Local start time of a meeting (date + HH:MM), or null if the date is missing. */
export function meetingStartsAt(m: { meeting_date?: any; meeting_time?: any }): Date | null {
  const iso = String(m?.meeting_date || '').slice(0, 10);
  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!d) return null;
  const t = /(\d{1,2}):(\d{2})/.exec(String(m?.meeting_time || ''));
  return new Date(+d[1], +d[2] - 1, +d[3], t ? +t[1] : 0, t ? +t[2] : 0);
}

/**
 * A meeting can only be marked Completed once it has started.
 * Returns an error message, or null when the change is fine.
 */
export function completedTooEarly(m: { meeting_date?: any; meeting_time?: any }, status: string, now = new Date()): string | null {
  if (!/complete/i.test(status || '')) return null;
  const start = meetingStartsAt(m);
  if (!start || start <= now) return null;
  const when = start.toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false });
  return `This meeting hasn’t happened yet (${when}) — it can be marked Completed once it starts.`;
}
