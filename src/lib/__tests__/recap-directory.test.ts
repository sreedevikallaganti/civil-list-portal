import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// these modules import the PocketBase client — the tests never touch the network
vi.mock('@/lib/pocketbase', () => ({ default: { authStore: {}, collection: () => ({}) }, pb: {} }));

const { computeRecap } = await import('@/lib/memories/recap');
const { occasions, postingChanges } = await import('@/lib/liveDirectory');

const year = 2026;
const m = (id: string, name: string, date: string, status = 'Scheduled') =>
  ({ id: `${id}-${date}-${status}`, officer_id: id, officer_name: name, officer_type: 'IPS', meeting_date: date, status });

describe('computeRecap — most met', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date(2026, 8, 29, 12, 0)); }); // "today" = 29 Sep 2026
  afterEach(() => { vi.useRealTimers(); });

  it('counts upcoming meetings and breaks ties by meetings already held', () => {
    const meetings = [
      m('dinesh', 'Dinesh IPS', '2026-09-20', 'Completed'), m('dinesh', 'Dinesh IPS', '2026-09-25', 'Completed'), m('dinesh', 'Dinesh IPS', '2026-10-04'),
      m('test', 'test', '2026-09-28'), m('test', 'test', '2026-10-02'), m('test', 'test', '2026-10-04'),
      m('devi', 'Devi', '2026-09-10', 'Completed'), m('devi', 'Devi', '2026-09-11', 'Cancelled'),
    ];
    const top = computeRecap(meetings as any, year).topOfficers;
    const dinesh = top.find((p) => p.name === 'Dinesh IPS')!;
    const test = top.find((p) => p.name === 'test')!;
    expect(dinesh).toMatchObject({ count: 3, held: 2, upcoming: 1, rank: 1 });
    expect(test).toMatchObject({ count: 3, held: 1, upcoming: 2, rank: 2 }); // same total, fewer held
    expect(top.find((p) => p.name === 'Devi')?.count).toBe(1);               // cancelled one excluded
  });

  it('counts a Completed meeting even when its date is later', () => {
    const top = computeRecap([m('a', 'A', '2026-10-10', 'Completed')] as any, year).topOfficers;
    expect(top[0]).toMatchObject({ held: 1, upcoming: 0 });
  });

  it('merges the same person across "Shri" / spacing variations', () => {
    const meetings = [
      { id: '1', officer_name: 'Shri  Rao', meeting_date: '2026-09-01', status: 'Completed' },
      { id: '2', officer_name: 'rao', meeting_date: '2026-09-02', status: 'Completed' },
    ];
    expect(computeRecap(meetings as any, year).topOfficers[0].count).toBe(2);
  });
});

describe('liveDirectory', () => {
  const person = (over: Record<string, any>) =>
    ({ id: 'p1', name: 'Neeraj', type: 'IAS', designation: 'Secretary, Telecom', email: '', phone: '', dob: '', serviceStart: '', ...over });

  it('finds birthdays and service anniversaries in the window', () => {
    const now = new Date(2026, 8, 29);
    const people = new Map([['p1', person({ dob: '1967-10-01', serviceStart: '1992-12-31' })]]);
    const list = occasions(people as any, 7, now);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ kind: 'birthday', inDays: 2, years: 59 });
  });

  it('flags a new posting but ignores date suffixes on the same post', () => {
    const people = new Map([['p1', person({ designation: 'Secretary, Telecom 01/09/2023' })]]);
    const same = postingChanges([{ officer_id: 'p1', designation: 'Secretary, Telecom', meeting_date: '2026-08-01' }], people as any);
    expect(same).toHaveLength(0);
    const moved = new Map([['p1', person({ designation: 'Chief Secretary, Telangana' })]]);
    const changed = postingChanges([{ officer_id: 'p1', designation: 'Secretary, Telecom', meeting_date: '2026-08-01' }], moved as any);
    expect(changed[0]).toMatchObject({ was: 'Secretary, Telecom', now: 'Chief Secretary, Telangana' });
  });
});
