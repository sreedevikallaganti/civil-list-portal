import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/pocketbase', () => ({ default: { authStore: {}, collection: () => ({}) }, pb: {} }));

const { upcomingTrips, metBeforeFor, tripDates, scheduleHref } = await import('@/lib/trips');
const { buildNotifications } = await import('@/lib/notifications');

const NOW = new Date(2026, 8, 29, 13, 45); // Tue 29 Sep 2026, 13:45
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(NOW); });
afterEach(() => { vi.useRealTimers(); });

const mtg = (id: string, over: Record<string, any>) => ({
  id, officer_id: `p-${id}`, officer_name: `Person ${id}`, agenda: `Agenda ${id}`,
  status: 'Scheduled', meeting_time: '11:00', duration: 30, city: '', ...over,
});

describe('upcomingTrips / suggestions', () => {
  const data = [
    // past meetings in Delhi with two people
    mtg('a', { meeting_date: '2026-03-10', city: 'New Delhi', status: 'Completed' }),
    mtg('b', { meeting_date: '2026-05-02', city: 'Delhi', status: 'Completed', follow_up_date: '2026-06-01' }),
    // upcoming visit: two meetings on 5 and 6 Oct, one of them with person "a"
    mtg('c', { meeting_date: '2026-10-05', city: 'New Delhi', officer_id: 'p-a', officer_name: 'Person a' }),
    mtg('d', { meeting_date: '2026-10-06', city: 'New Delhi' }),
    // home city — never a "visit"
    mtg('e', { meeting_date: '2026-10-07', city: 'Hyderabad' }),
  ];

  it('groups nearby meetings in another city into one visit', () => {
    const trips = upcomingTrips(data, { now: NOW });
    expect(trips).toHaveLength(1);
    expect(trips[0]).toMatchObject({ city: 'new-delhi', label: 'New Delhi', from: '2026-10-05', to: '2026-10-06' });
    expect(tripDates(trips[0])).toBe('5–6 Oct');
  });

  it('suggests people met there before who are not already booked', () => {
    const [trip] = upcomingTrips(data, { now: NOW });
    const names = metBeforeFor(trip, data).map((p) => p.name);
    expect(names).toEqual(['Person b']); // "a" is already booked on this visit
  });

  it('builds a pre-filled scheduling link', () => {
    const [trip] = upcomingTrips(data, { now: NOW });
    expect(scheduleHref(trip, { meetingId: 'b' })).toBe('/meetings?date=2026-10-05&city=New+Delhi&schedule=b');
  });
});

describe('buildNotifications', () => {
  it('covers starting-soon, today, visits, follow-ups, overdue status and missing minutes', () => {
    const data = [
      mtg('soon', { meeting_date: '2026-09-29', meeting_time: '14:10' }),                        // in 25 min
      mtg('later', { meeting_date: '2026-09-29', meeting_time: '17:00' }),                       // later today
      mtg('late', { meeting_date: '2026-09-28', meeting_time: '10:00' }),                        // past, still Scheduled
      mtg('done', { meeting_date: '2026-09-25', status: 'Completed', minutes: '' }),             // no minutes
      mtg('fu', { meeting_date: '2026-09-20', status: 'Completed', minutes: 'ok', follow_up_date: '2026-09-27' }), // overdue follow-up
      mtg('past-delhi', { meeting_date: '2026-04-01', city: 'Mumbai', status: 'Completed', minutes: 'ok' }),
      mtg('trip', { meeting_date: '2026-10-08', city: 'Mumbai', officer_id: 'x', officer_name: 'X' }),
    ];
    const kinds = buildNotifications(data, new Map(), NOW).map((n) => n.kind);
    expect(kinds).toEqual(expect.arrayContaining(['starting', 'today', 'trip', 'followup', 'overdue', 'minutes']));
    const starting = buildNotifications(data, new Map(), NOW).find((n) => n.kind === 'starting')!;
    expect(starting.title).toBe('In 25 min: Agenda soon');
    expect(starting.urgent).toBe(true);
  });

  it('ignores cancelled meetings', () => {
    const data = [mtg('x', { meeting_date: '2026-09-29', meeting_time: '14:00', status: 'Cancelled' })];
    expect(buildNotifications(data, new Map(), NOW)).toHaveLength(0);
  });
});
