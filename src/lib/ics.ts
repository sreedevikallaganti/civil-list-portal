// lib/ics.ts — builds a calendar invite (.ics) so invite emails show
// "Add to calendar" with Yes / No / Maybe in Gmail, Outlook and Apple Mail.
// Replies go to the organiser's mailbox (the SMTP account).

/** minutes the zone is ahead of UTC at that instant (e.g. Asia/Kolkata → 330) */
function tzOffsetMinutes(at: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(at);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
  return Math.round((asUtc - at.getTime()) / 60_000);
}

/** "2026-10-04" + "12:00" in `timeZone` → the real UTC instant */
export function zonedToUtc(date: string, time: string, timeZone: string): Date | null {
  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  const t = /^(\d{1,2}):(\d{2})/.exec(time || '');
  if (!d || !t) return null;
  const guess = Date.UTC(+d[1], +d[2] - 1, +d[3], +t[1], +t[2]);
  return new Date(guess - tzOffsetMinutes(new Date(guess), timeZone) * 60_000);
}

const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
/* RFC 5545 text escaping + 75-octet line folding */
const text = (s: unknown) => String(s ?? '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
const fold = (line: string) => line.match(/.{1,73}/g)!.join('\r\n ');

export function buildIcs(opts: {
  uid: string;
  start: Date;
  durationMin: number;
  title: string;
  description?: string;
  location?: string;
  url?: string;
  organizer: { email: string; name?: string };
  attendees: string[];
  sequence?: number;
}) {
  const end = new Date(opts.start.getTime() + Math.max(1, opts.durationMin) * 60_000);
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Civillist//Meetings//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:REQUEST',
    'BEGIN:VEVENT',
    `UID:${opts.uid}@civillist`,
    `SEQUENCE:${opts.sequence ?? 0}`,
    `DTSTAMP:${stamp(new Date())}`,
    `DTSTART:${stamp(opts.start)}`,
    `DTEND:${stamp(end)}`,
    `SUMMARY:${text(opts.title)}`,
    opts.description ? `DESCRIPTION:${text(opts.description)}` : '',
    opts.location ? `LOCATION:${text(opts.location)}` : '',
    opts.url ? `URL:${opts.url}` : '',
    `ORGANIZER;CN=${text(opts.organizer.name || opts.organizer.email)}:mailto:${opts.organizer.email}`,
    ...opts.attendees.map((a) => `ATTENDEE;ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE:mailto:${a}`),
    'STATUS:CONFIRMED',
    'BEGIN:VALARM',
    'ACTION:DISPLAY',
    'DESCRIPTION:Meeting reminder',
    'TRIGGER:-PT30M',
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ].filter(Boolean);
  return lines.map(fold).join('\r\n') + '\r\n';
}
