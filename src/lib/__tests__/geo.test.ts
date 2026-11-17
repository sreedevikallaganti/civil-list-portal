import { describe, expect, it } from 'vitest';
import { HOME_PLACE, placeOf, placeStats } from '../geo';

const m = (id: string, fields: Record<string, string>) => ({ id, ...fields });

describe('placeOf', () => {
  it('uses the City field, then the location text', () => {
    expect(placeOf(m('1', { city: 'New Delhi' }))).toBe('Delhi');
    expect(placeOf(m('2', { location: 'Dubai World Trade Centre' }))).toBe('Dubai');
    expect(placeOf(m('3', { location: 'Collectorate, Warangal' }))).toBe('Warangal');
  });

  it('counts office meetings without a place as the home city', () => {
    expect(placeOf(m('4', { meeting_place: 'Office' }))).toBe(HOME_PLACE);
    expect(placeOf(m('5', { location: 'Office Board Room' }))).toBe(HOME_PLACE);
  });

  it('returns empty when nothing tells the place', () => {
    expect(placeOf(m('6', {}))).toBe('');
  });
});

describe('placeStats', () => {
  it('counts visit days separately from meetings and ranks by visits', () => {
    const { places, unplaced } = placeStats([
      m('a', { city: 'Chennai', meeting_date: '2026-10-01', officer_name: 'A' }),
      m('b', { city: 'Chennai', meeting_date: '2026-10-01', officer_name: 'A' }), // same day → still 1 visit
      m('c', { city: 'Delhi', meeting_date: '2026-09-01', officer_name: 'B' }),
      m('d', { city: 'Delhi', meeting_date: '2026-09-15', officer_name: 'C' }),
      m('e', {}),
    ], {});
    expect(places.map((p) => [p.city, p.visits, p.meetings])).toEqual([['Delhi', 2, 2], ['Chennai', 1, 2]]);
    expect(places[0].coords).toEqual([28.6139, 77.209]);
    expect(places[1].people).toEqual(['A']);
    expect(unplaced.map((x) => x.id)).toEqual(['e']);
  });
});
