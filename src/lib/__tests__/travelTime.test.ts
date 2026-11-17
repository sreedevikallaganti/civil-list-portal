import { describe, expect, it } from 'vitest';
import { checkPlannedSlot, estimateTravel, fmtMinutes, travelIssues } from '../travelTime';

const m = (id: string, f: Record<string, string>) => ({ id, meeting_date: '2026-10-09', duration: '60', ...f });

describe('estimateTravel', () => {
  it('no travel for the same venue; a city hop for a different venue', () => {
    expect(estimateTravel(m('a', { city: 'Hyderabad', location: 'Secretariat' }), m('b', { city: 'Hyderabad', location: 'Secretariat' })).minutes).toBe(0);
    expect(estimateTravel(m('a', { meeting_place: 'Office' }), m('b', { meeting_place: 'Office' })).minutes).toBe(0);
    const hop = estimateTravel(m('a', { city: 'Hyderabad', location: 'Secretariat' }), m('b', { city: 'Hyderabad', location: 'Collectorate' }));
    expect(hop.mode).toBe('city');
    expect(hop.minutes).toBe(30);
  });

  it('by road between nearby cities, by air when far', () => {
    const road = estimateTravel(m('a', { city: 'Hyderabad' }), m('b', { city: 'Warangal' }));
    expect(road.mode).toBe('road');
    expect(road.km).toBeGreaterThan(120);
    expect(road.km).toBeLessThan(160);
    const air = estimateTravel(m('a', { city: 'Hyderabad' }), m('b', { city: 'New Delhi' }));
    expect(air.mode).toBe('air');
    expect(air.minutes).toBeGreaterThan(250);
    const abroad = estimateTravel(m('a', { city: 'Hyderabad' }), m('b', { location: 'Dubai World Trade Centre' }));
    expect(abroad.mode).toBe('air');
    expect(abroad.minutes).toBeGreaterThan(air.minutes);
  });
});

describe('travelIssues', () => {
  it('flags back-to-back meetings that are too close for the trip', () => {
    const issues = travelIssues([
      m('1', { city: 'Hyderabad', location: 'Secretariat', meeting_time: '10:00' }),     // ends 11:00
      m('2', { city: 'Warangal', location: 'Collectorate', meeting_time: '12:00' }),     // 60 min gap, needs ~3 h
      m('3', { city: 'Warangal', location: 'Collectorate', meeting_time: '13:30' }),     // same venue → fine
    ]);
    expect(issues).toHaveLength(1);
    expect(issues[0].from.id).toBe('1');
    expect(issues[0].level).toBe('too-tight');
    expect(issues[0].message).toMatch(/Hyderabad → Warangal/);
  });

  it('marks a gap only slightly longer than the trip as tight, and ignores cancelled meetings', () => {
    const tight = travelIssues([
      m('1', { city: 'Hyderabad', location: 'Secretariat', meeting_time: '10:00' }),
      m('2', { city: 'Hyderabad', location: 'Collectorate', meeting_time: '11:35' }), // 35 min gap vs 30 needed
    ]);
    expect(tight[0].level).toBe('tight');
    const none = travelIssues([
      m('1', { city: 'Hyderabad', location: 'Secretariat', meeting_time: '10:00', status: 'Cancelled' }),
      m('2', { city: 'Warangal', meeting_time: '11:00' }),
    ]);
    expect(none).toHaveLength(0);
  });

  it('checks a planned slot against that day', () => {
    const day = [m('1', { city: 'Hyderabad', location: 'Secretariat', meeting_time: '10:00' })];
    expect(checkPlannedSlot(m('', { city: 'Warangal', meeting_time: '11:30' }), day)).toHaveLength(1);
    expect(checkPlannedSlot(m('', { city: 'Warangal', meeting_time: '15:30' }), day)).toHaveLength(0);
  });

  it('formats minutes', () => {
    expect(fmtMinutes(45)).toBe('45 min');
    expect(fmtMinutes(120)).toBe('2 h');
    expect(fmtMinutes(200)).toBe('3 h 20 min');
  });
});
