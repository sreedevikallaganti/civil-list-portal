// Calendar helpers: time maths, clash detection and .ics export for the Calendar page.

export const DEFAULT_DURATION = 30;

const pad = (n: number) => String(n).padStart(2, '0');

export const isoDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** "2026-10-03" from meeting_date (PocketBase may append a time) */
export const dateOf = (m: any): string => {
  const first = String(m?.meeting_date || m?.date || '').split(' ')[0].split('T')[0];
  return /^\d{4}-\d{2}-\d{2}$/.test(first) ? first : '';
};

/** minutes after midnight, or null when there's no usable time */
export function startMin(m: any): number | null {
  const t = /(\d{1,2}):(\d{2})/.exec(String(m?.meeting_time || m?.time || ''));
  return t ? +t[1] * 60 + +t[2] : null;
}

export const durationOf = (m: any) => Math.max(5, Math.round(Number(m?.duration) || DEFAULT_DURATION));

export const hhmm = (min: number) => `${pad(Math.floor(min / 60) % 24)}:${pad(min % 60)}`;

const statusOf = (m: any) => String(m?.status || 'Scheduled').toLowerCase();

/** cancelled / rejected meetings don't occupy a slot */
export const occupiesSlot = (m: any) => !/cancel|reject/.test(statusOf(m));

/** only open meetings can be dragged to a new slot */
export const isMovable = (m: any) => !/complete|done|cancel|reject/.test(statusOf(m));

/** ids of meetings that overlap another meeting on the same day */
export function findConflicts(meetings: any[]): Set<string> {
  const byDay = new Map<string, { id: string; s: number; e: number }[]>();
  for (const m of meetings) {
    const d = dateOf(m);
    const s = startMin(m);
    if (!d || s == null || !occupiesSlot(m)) continue;
    const list = byDay.get(d) ?? [];
    list.push({ id: m.id, s, e: s + durationOf(m) });
    byDay.set(d, list);
  }
  const out = new Set<string>();
  for (const list of byDay.values()) {
    list.sort((a, b) => a.s - b.s);
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length && list[j].s < list[i].e; j++) {
        out.add(list[i].id);
        out.add(list[j].id);
      }
    }
  }
  return out;
}

/** Monday of the week containing d */
export function startOfWeek(d: Date) {
  const c = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  c.setDate(c.getDate() - ((c.getDay() + 6) % 7));
  return c;
}

/* ── .ics export (floating local times, so they import at the same clock time) ── */

const esc = (s: unknown) => String(s ?? '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
const fold = (line: string) => (line.match(/.{1,73}/g) ?? ['']).join('\r\n ');
const stamp = (iso: string, min: number) => `${iso.replace(/-/g, '')}T${pad(Math.floor(min / 60))}${pad(min % 60)}00`;

export function downloadIcs(meetings: any[], fileName: string): number {
  const now = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const events: string[] = [];
  for (const m of meetings) {
    const d = dateOf(m);
    if (!d || !occupiesSlot(m)) continue;
    const s = startMin(m) ?? 9 * 60;
    const e = Math.min(s + durationOf(m), 24 * 60 - 1);
    events.push(
      'BEGIN:VEVENT',
      `UID:${m.id}@civillist`,
      `DTSTAMP:${now}`,
      `DTSTART:${stamp(d, s)}`,
      `DTEND:${stamp(d, e)}`,
      fold(`SUMMARY:${esc(m.agenda || m.title || 'Meeting')}`),
      m.officer_name ? fold(`DESCRIPTION:${esc(`With ${m.officer_name}${m.designation ? `, ${m.designation}` : ''}`)}`) : '',
      m.location || m.city ? fold(`LOCATION:${esc(m.location || m.city)}`) : '',
      `STATUS:${/complete/.test(statusOf(m)) ? 'CONFIRMED' : 'TENTATIVE'}`,
      'END:VEVENT',
    );
  }
  if (!events.length) return 0;
  const body = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Civillist//Calendar//EN', 'CALSCALE:GREGORIAN', ...events, 'END:VCALENDAR']
    .filter(Boolean)
    .join('\r\n');
  const url = URL.createObjectURL(new Blob([body], { type: 'text/calendar;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return events.filter((l) => l === 'BEGIN:VEVENT').length;
}
