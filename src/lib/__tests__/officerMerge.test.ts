import { describe, expect, it } from 'vitest';
import {
  conflictBetween, fillBlanks, findDuplicates, idsNamedLike, nameKey, officerInMeeting, pickKeeper, relinkContext,
  relinkMeeting, searchWord, type DirectoryRecord,
} from '@/lib/officerMerge';

const R = (id: string, name: string, extra: Partial<DirectoryRecord> = {}): DirectoryRecord => ({ id, name, ...extra });
const EMPTY = { IAS: [], IPS: [], IFS: [], IRS: [] } as Record<'IAS' | 'IPS' | 'IFS' | 'IRS', DirectoryRecord[]>;

describe('names', () => {
  it('ignores case, dots, spaces and titles', () => {
    expect(nameKey('A.A. Sindhu')).toBe('aasindhu');
    expect(nameKey('Aa Sindhu')).toBe('aasindhu');
    expect(nameKey('Dr. A A SINDHU, IAS')).toBe('aasindhu');
    expect(nameKey('Smt. Meena')).toBe('meena');
    expect(nameKey('')).toBe('');
  });
});

describe('duplicates', () => {
  it('groups same-named records; officer ID / batch / birth date tell people apart', () => {
    expect(conflictBetween(R('a', 'X', { officer_id: '01AB' }), R('b', 'X', { officer_id: '01ab' }))).toBe('');
    expect(conflictBetween(R('a', 'X', { officer_id: '1' }), R('b', 'X', { officer_id: '2' }))).toMatch(/officer IDs/);
    expect(conflictBetween(R('a', 'X', { batch: 1998 }), R('b', 'X', { batch: 2001 }))).toMatch(/batches/);
    expect(conflictBetween(R('a', 'X', { date_of_birth: '1970-01-02 00:00:00.000Z' }), R('b', 'X', { date_of_birth: '1971-01-02' }))).toMatch(/birth/);
    expect(conflictBetween(R('a', 'X', { batch: 1998 }), R('b', 'X', {}))).toBe('');

    const groups = findDuplicates('IAS', [
      R('old', 'A A Sindhu', { batch: 2010 }),
      R('new', 'Aa Sindhu', { batch: 2010, officer_id: '01KL2010', updated: '2026-11-10' }),
      R('k1', 'Rajesh Kumar', { officer_id: '1' }),
      R('k2', 'Rajesh Kumar', { officer_id: '2' }),
      R('solo', 'Meena'),
    ]);
    expect(groups.map((g) => [g.key, g.records.length, g.keepId, g.conflict])).toEqual([
      ['aasindhu', 2, 'new', ''],
      ['rajeshkumar', 2, expect.any(String), 'different officer IDs'],
    ]);
  });

  it('keeps the civil-list record, then the newest, and fills its blanks', () => {
    expect(pickKeeper([R('a', 'X', { updated: '2026-01-01' }), R('b', 'X', { officer_id: '9', updated: '2020-01-01' })]).id).toBe('b');
    expect(pickKeeper([R('a', 'X', { updated: '2026-01-01' }), R('b', 'X', { updated: '2025-01-01' })]).id).toBe('a');
    const keep = R('n', 'Aa Sindhu', { officer_id: '9', email: '', designation: 'Secretary', updated: 'z', collectionId: 'c' });
    expect(fillBlanks(keep, [R('o', 'A A Sindhu', { email: 'old@gov.in', designation: 'Collector', contact_number: '987', created: 'x' })]))
      .toEqual({ email: 'old@gov.in', contact_number: '987' });
  });
});

describe("an officer's meetings", () => {
  const me = { id: 'new', name: 'Adarsh Sidhu', service: 'IAS' as const };
  const none = () => false;

  it('finds them as main participant or other participant, linked or by name', () => {
    expect(officerInMeeting({ officer_id: 'new', officer_name: 'X', officer_type: 'IAS' }, me, none)).toEqual({ role: 'main', how: 'linked' });
    expect(officerInMeeting({ officer_id: 'gone', officer_name: 'Adarsh  Sidhu.', officer_type: 'IAS' }, me, none)).toEqual({ role: 'main', how: 'by name' });
    expect(officerInMeeting({ officer_name: 'Ravi', participants: [{ id: '', name: 'Dr Adarsh Sidhu', type: 'IAS' }] }, me, none))
      .toEqual({ role: 'participant', how: 'by name' });
    expect(officerInMeeting({ officer_name: 'Ravi', participants: JSON.stringify([{ id: 'new', name: 'A. Sidhu' }]) }, me, none))
      .toEqual({ role: 'participant', how: 'linked' });
  });

  it('leaves out other people of the same name', () => {
    expect(officerInMeeting({ officer_id: 'k2', officer_name: 'Adarsh Sidhu', officer_type: 'IAS' }, me, (id) => id === 'k2')).toBeNull();
    expect(officerInMeeting({ officer_id: '', officer_name: 'Adarsh Sidhu', officer_type: 'IPS' }, me, none)).toBeNull();
    expect(officerInMeeting({ officer_name: 'Someone else' }, me, none)).toBeNull();
  });

  it('helps find candidates', () => {
    expect(searchWord('Dr. A.A. Sindhu')).toBe('Sindhu');
    expect(idsNamedLike({ officer_id: 'a', officer_name: 'Aa Sindhu', participants: [{ id: 'b', name: 'A A Sindhu' }, { id: 'c', name: 'X' }] }, 'A.A. Sindhu'))
      .toEqual(['a', 'b']);
  });
});

describe('meetings', () => {
  const remaining = { ...EMPTY, IAS: [R('new', 'Aa Sindhu'), R('k1', 'Rajesh Kumar'), R('k2', 'Rajesh Kumar')], IPS: [R('p1', 'Ravi')] };
  const ctx = relinkContext(remaining, new Map([['old', 'new']]));

  it('moves a meeting from a merged duplicate to the kept record', () => {
    const fix = relinkMeeting({ id: 'm1', officer_id: 'old', officer_name: 'A A Sindhu', officer_type: 'IAS' }, ctx);
    expect(fix?.patch).toEqual({ officer_id: 'new' });
    expect(fix?.changes[0].why).toBe('merged');
  });

  it('links a meeting whose officer record is gone, by name — only when the name is unique', () => {
    expect(relinkMeeting({ id: 'm', officer_id: 'from_old_collection', officer_name: 'A.A. Sindhu', officer_type: 'IAS Officer' }, ctx)?.patch)
      .toEqual({ officer_id: 'new' });
    expect(relinkMeeting({ id: 'm', officer_id: '', officer_name: 'Aa Sindhu', officer_type: 'IAS' }, ctx)?.changes[0].why).toBe('by name');
    expect(relinkMeeting({ id: 'm', officer_id: '', officer_name: 'Rajesh Kumar', officer_type: 'IAS' }, ctx)).toBeNull(); // two of them
    expect(relinkMeeting({ id: 'm', officer_id: 'new', officer_name: 'Aa Sindhu', officer_type: 'IAS' }, ctx)).toBeNull(); // already fine
    expect(relinkMeeting({ id: 'm', officer_id: '', officer_name: 'Aa Sindhu', officer_type: 'IPS' }, ctx)).toBeNull(); // other service
    expect(relinkMeeting({ id: 'm', officer_id: 'e1', officer_name: 'Aa Sindhu', officer_type: 'Employee' }, ctx)).toBeNull(); // not an officer
  });

  it('fixes the other participants too and keeps everything else they had', () => {
    const fix = relinkMeeting({
      id: 'm', officer_id: 'p1', officer_name: 'Ravi', officer_type: 'IPS',
      participants: JSON.stringify([
        { id: 'old', name: 'A A Sindhu', type: 'IAS', email: 'a@gov.in', designation: 'Collector' },
        { id: 'x', name: 'Walk-in', type: 'Other' },
      ]),
    }, ctx);
    expect(fix?.patch.officer_id).toBeUndefined();
    expect(fix?.patch.participants).toEqual([
      { id: 'new', name: 'A A Sindhu', type: 'IAS', email: 'a@gov.in', designation: 'Collector' },
      { id: 'x', name: 'Walk-in', type: 'Other' },
    ]);
  });
});
