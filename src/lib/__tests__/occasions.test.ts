import { describe, expect, it } from 'vitest';
import { buildOccasions, personMilestones, retirementDate, whatsappUrl, type OccasionPerson } from '../occasions';

const person = (over: Partial<OccasionPerson>): OccasionPerson => ({
  key: 'IAS:1', id: '1', kind: 'IAS', name: 'Shri R. Kumar', role: 'Collector', phone: '', email: '',
  dob: '', serviceStart: '', batch: '', cadre: '', ...over,
});
const today = new Date(2026, 9, 8); // 8 Oct 2026

describe('retirementDate (superannuation at 60)', () => {
  it('last day of the month they turn 60', () => {
    expect(retirementDate('1966-10-24')).toBe('2026-10-31');
    expect(retirementDate('1966-02-15')).toBe('2026-02-28');
  });
  it('born on the 1st → last day of the previous month', () => {
    expect(retirementDate('1966-10-01')).toBe('2026-09-30');
    expect(retirementDate('1966-01-01')).toBe('2025-12-31');
  });
});

describe('buildOccasions', () => {
  it('finds birthdays, service anniversaries and retirements in the window', () => {
    const list = buildOccasions([
      person({ key: 'IAS:a', name: 'A', dob: '1980-10-08' }),            // birthday today, turns 46
      person({ key: 'IAS:b', name: 'B', serviceStart: '2001-10-20' }),   // 25 years on 20 Oct
      person({ key: 'IAS:c', name: 'C', dob: '1966-10-24' }),            // retires 31 Oct 2026
      person({ key: 'IAS:d', name: 'D', dob: '1980-12-25' }),            // outside 30 days
    ], [], { days: 30, today });
    const brief = list.filter((o) => o.person).map((o) => [o.kind, o.title, o.inDays, o.years]);
    expect(brief).toContainEqual(['birthday', 'A', 0, 46]);
    expect(brief).toContainEqual(['service', 'B', 12, 25]);
    expect(brief).toContainEqual(['retirement', 'C', 23, 60]);
    expect(brief.some(([, t]) => t === 'D')).toBe(false);
  });

  it('includes national days and special events (yearly or one-off)', () => {
    const list = buildOccasions([], [
      { id: 'e1', title: 'Office Diwali lunch', date: '2026-11-05', repeats: false, notes: '' },
      { id: 'e2', title: 'Foundation Day', date: '2015-10-15', repeats: true, notes: '' },
      { id: 'e3', title: 'Old event', date: '2026-09-01', repeats: false, notes: '' },
    ], { days: 30, today });
    const titles = list.map((o) => o.title);
    expect(titles).toContain('Police Commemoration Day');   // 21 Oct
    expect(titles).toContain('Rashtriya Ekta Diwas');        // 31 Oct
    expect(titles).toContain('Office Diwali lunch');
    expect(titles).toContain('Foundation Day');
    expect(titles).not.toContain('Old event');
    expect(titles).not.toContain('Republic Day');
  });
});

describe('whatsappUrl', () => {
  it('adds +91 to 10-digit numbers and refuses bad ones', () => {
    expect(whatsappUrl('+91 98765 43210', 'Hi')).toBe('https://wa.me/919876543210?text=Hi');
    expect(whatsappUrl('9876543210', 'Hi')).toBe('https://wa.me/919876543210?text=Hi');
    expect(whatsappUrl('12345', 'Hi')).toBeNull();
  });
});

describe('officer milestones (Officers Directory profile)', () => {
  it('next birthday, work anniversary and retirement', () => {
    const m = personMilestones({ kind: 'IFS', dob: '1980-10-20', serviceStart: '2006-12-01' }, today);
    expect(m.birthday).toEqual({ date: '2026-10-20', inDays: 12, years: 46 });
    expect(m.service).toEqual({ date: '2026-12-01', inDays: 54, years: 20 });
    expect(m.retirement?.date).toBe('2040-10-31');
    expect(m.retired).toBe(false);
  });
  it('a retired officer keeps birthdays but gets no work anniversaries', () => {
    const m = personMilestones({ kind: 'IRS', dob: '1960-11-02', serviceStart: '1986-10-10' }, today);
    expect(m.retired).toBe(true);
    expect(m.service).toBeNull();
    expect(m.birthday?.years).toBe(66);
    const list = buildOccasions([person({ kind: 'IRS', dob: '1960-11-02', serviceStart: '1986-10-10' })], [], { days: 30, today });
    expect(list.some((o) => o.kind === 'service')).toBe(false);
    expect(list.some((o) => o.kind === 'birthday')).toBe(true);
  });
});
