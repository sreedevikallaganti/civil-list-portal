import { describe, expect, it } from 'vitest';
import { roleOf } from '@/lib/roles';
import { completedTooEarly, meetingStartsAt } from '@/lib/meetingRules';
import { buildIcs, zonedToUtc } from '@/lib/ics';

describe('roleOf', () => {
  it.each([
    ['', 'editor'],
    ['View, Edit, Delete', 'editor'],
    ['Read/Write', 'editor'],
    ['admin', 'admin'],
    ['Administrator', 'admin'],
    ['viewer', 'viewer'],
    ['read-only', 'viewer'],
    ['View only', 'viewer'],
    ['Administration', 'editor'], // a department name, not a role
  ])('%j → %s', (permissions, role) => {
    expect(roleOf({ permissions })).toBe(role);
  });
});

describe('completedTooEarly', () => {
  const now = new Date(2026, 8, 29, 15, 0); // 29 Sep 2026, 15:00

  it('blocks Completed for a future meeting', () => {
    expect(completedTooEarly({ meeting_date: '2026-10-18', meeting_time: '10:00' }, 'Completed', now)).toMatch(/hasn’t happened yet/);
  });
  it('blocks Completed later today', () => {
    expect(completedTooEarly({ meeting_date: '2026-09-29', meeting_time: '16:00' }, 'Completed', now)).not.toBeNull();
  });
  it('allows Completed once it has started', () => {
    expect(completedTooEarly({ meeting_date: '2026-09-29', meeting_time: '14:15' }, 'Completed', now)).toBeNull();
  });
  it('ignores other statuses', () => {
    expect(completedTooEarly({ meeting_date: '2026-10-18', meeting_time: '10:00' }, 'Scheduled', now)).toBeNull();
  });
});

describe('meetingStartsAt', () => {
  it('accepts PocketBase datetimes', () => {
    expect(meetingStartsAt({ meeting_date: '2026-10-04 00:00:00.000Z', meeting_time: '12:00' })?.getHours()).toBe(12);
  });
});

describe('ics', () => {
  it('converts office time to UTC', () => {
    expect(zonedToUtc('2026-10-04', '12:00', 'Asia/Kolkata')?.toISOString()).toBe('2026-10-04T06:30:00.000Z');
  });
  it('builds a valid invite with escaped text and RSVP attendees', () => {
    const ics = buildIcs({
      uid: 'abc', start: new Date('2026-10-04T06:30:00Z'), durationMin: 90, title: 'Review, budget; Q3',
      organizer: { email: 'org@example.com' }, attendees: ['a@x.com'],
    });
    expect(ics).toContain('DTSTART:20261004T063000Z');
    expect(ics).toContain('DTEND:20261004T080000Z');
    expect(ics).toContain('SUMMARY:Review\\, budget\\; Q3');
    expect(ics).toContain('RSVP=TRUE:mailto:a@x.');
    expect(ics.split('\r\n').every((l) => l.length <= 75)).toBe(true);
  });
});
