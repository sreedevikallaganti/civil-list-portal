import { describe, expect, it } from 'vitest';
import {
  canonicalState, filterBatchmates, meetingPlaceState, metFor, metIndex, normBatch, peopleMetIn,
  rankBatchmates, stateOfText, toBatchOfficer, type BatchOfficer,
} from '@/lib/batchmates';

const TODAY = '2026-10-28';

const officer = (id: string, name: string, extra: Partial<BatchOfficer> = {}): BatchOfficer => ({
  id, name, service: 'IAS', batch: '1988', cadre: '', state: '', position: '', department: '', ...extra,
});

const meeting = (date: string, extra: Record<string, unknown> = {}) => ({
  meeting_date: `${date} 00:00:00.000Z`, status: 'Scheduled', ...extra,
});

describe('normBatch', () => {
  it.each([
    ['1988', '1988'], [1988, '1988'], [' 1988 batch', '1988'], ['2015', '2015'],
    ['', ''], [null, ''], ['88', ''], ['1788', ''],
  ])('%j → %j', (v, out) => expect(normBatch(v)).toBe(out));
});

describe('states', () => {
  it('normalises spelling, spacing and old names', () => {
    expect(canonicalState('Tamil Nadu ')).toBe('Tamil Nadu');
    expect(canonicalState('  tamil   nadu')).toBe('Tamil Nadu');
    expect(canonicalState('Orissa')).toBe('Odisha');
    expect(canonicalState('AGMUT')).toBe('');
  });

  it('reads a state from free text or a known city', () => {
    expect(stateOfText('Secretariat, Chennai')).toBe('Tamil Nadu');
    expect(stateOfText('Room 31104, Kartavya Bhavan-3, Janapath, New Delhi-110001')).toBe('Delhi');
    expect(stateOfText('Collectorate, Jaipur, Rajasthan')).toBe('Rajasthan');
    expect(stateOfText('Hyderabad')).toBe('Telangana');
    expect(stateOfText('Dubai')).toBe('');
  });

  it('uses the meeting place, not the officer state field', () => {
    // meetings.state is the officer's state — the meeting itself was in Delhi
    expect(meetingPlaceState({ state: 'Tamil Nadu', location: 'Delhi' })).toBe('Delhi');
  });
});

describe('metIndex / metFor', () => {
  const meetings = [
    meeting('2026-03-12', { officer_id: 'a', officer_name: 'Anil Kumar' }),
    meeting('2026-06-01', { officer_id: 'a', officer_name: 'Anil Kumar' }),
    meeting('2026-11-05', { officer_id: 'a', officer_name: 'Anil Kumar' }), // booked, upcoming
    meeting('2026-05-01', { officer_name: 'Beena Rao', status: 'Cancelled' }),
    meeting('2026-04-10', { officer_name: 'Chief Guest', participants: [{ id: 'c', name: 'Chitra Iyer', type: 'IPS' }] }),
  ];
  const index = metIndex(meetings, TODAY);

  it('counts past meetings and keeps the next booked one', () => {
    expect(metFor(index, { id: 'a' })).toEqual({ count: 2, last: '2026-06-01', next: '2026-11-05' });
  });
  it('ignores cancelled meetings', () => {
    expect(metFor(index, { name: 'Beena Rao' }).count).toBe(0);
  });
  it('counts people in the participants list, by id or by name', () => {
    expect(metFor(index, { id: 'c' }).count).toBe(1);
    expect(metFor(index, { name: '  chitra   iyer ' }).count).toBe(1);
  });
});

describe('rankBatchmates / filterBatchmates', () => {
  const officers = [
    officer('1', 'Zoya Khan', { cadre: 'Tamil Nadu ' }),
    officer('2', 'Anil Kumar', { cadre: 'Rajasthan' }),
    officer('3', 'Main Person', { cadre: 'Kerala' }),
    officer('4', 'Bala Murugan', { cadre: 'Kerala', service: 'IPS' }),
    officer('4', 'Bala Murugan', { cadre: 'Kerala', service: 'IPS' }), // duplicate row
  ];
  const index = metIndex([meeting('2026-02-01', { officer_id: '2', officer_name: 'Anil Kumar' })], TODAY);
  const rows = rankBatchmates(officers, { exclude: [{ id: '3', name: 'Main Person' }], placeState: 'Tamil Nadu', index });

  it('leaves out the meeting\'s own people and duplicates', () => {
    expect(rows.map((r) => r.id)).toEqual(['1', '2', '4']);
  });
  it('puts people posted where the meeting is first, then people met before', () => {
    expect(rows[0]).toMatchObject({ name: 'Zoya Khan', samePlace: true });
    expect(rows[1]).toMatchObject({ name: 'Anil Kumar', met: { count: 1 } });
  });
  it('filters by service, state, met-before and search text', () => {
    const base = { service: 'all' as const, state: '', metOnly: false, q: '' };
    expect(filterBatchmates(rows, { ...base, service: 'IPS' }).map((r) => r.id)).toEqual(['4']);
    expect(filterBatchmates(rows, { ...base, state: 'tamil nadu' }).map((r) => r.id)).toEqual(['1']);
    expect(filterBatchmates(rows, { ...base, metOnly: true }).map((r) => r.id)).toEqual(['2']);
    expect(filterBatchmates(rows, { ...base, q: 'bala' }).map((r) => r.id)).toEqual(['4']);
  });
});

describe('toBatchOfficer', () => {
  it('handles a numeric batch year and stray spaces', () => {
    expect(toBatchOfficer({ id: 'x', name: ' R Sharma ', batch_year: 1988, cadre: 'Tamil Nadu ', current_position: 'Collector' }, 'IAS'))
      .toMatchObject({ name: 'R Sharma', batch: '1988', cadre: 'Tamil Nadu', position: 'Collector' });
  });
});

describe('peopleMetIn', () => {
  const meetings = [
    meeting('2026-01-10', { officer_id: 'p1', officer_name: 'Priya', officer_type: 'IAS', city: 'Chennai', agenda: 'Port project' }),
    meeting('2026-07-02', { officer_id: 'p1', officer_name: 'Priya', officer_type: 'IAS', location: 'Secretariat, Chennai', agenda: 'Review' }),
    meeting('2026-05-05', { officer_name: 'Ravi', city: 'Coimbatore' }),
    meeting('2026-05-06', { officer_name: 'Sunil', city: 'Jaipur' }),
    meeting('2026-12-01', { officer_name: 'Future', city: 'Chennai' }),
    meeting('2026-03-03', { officer_name: 'Gone', city: 'Chennai', status: 'Rejected' }),
  ];

  it('finds everyone met in a state, latest first, with counts', () => {
    const out = peopleMetIn(meetings, { state: 'tamil nadu', today: TODAY });
    expect(out.map((p) => p.name)).toEqual(['Priya', 'Ravi']);
    expect(out[0]).toMatchObject({ timesMet: 2, lastMet: '2026-07-02', lastAgenda: 'Review' });
  });
  it('narrows to a city and a start date', () => {
    expect(peopleMetIn(meetings, { city: 'Chennai', today: TODAY }).map((p) => p.name)).toEqual(['Priya']);
    expect(peopleMetIn(meetings, { state: 'Tamil Nadu', since: '2026-06-01', today: TODAY }).map((p) => p.name)).toEqual(['Priya']);
  });
});
