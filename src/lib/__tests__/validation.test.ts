import { describe, expect, it } from 'vitest';
import {
  COUNTRY_OPTIONS, cleanName, cleanNational, joinPhone, nameError, phoneError, splitPhone, textError,
} from '../validation';

describe('names', () => {
  it('strips digits and symbols while typing', () => {
    expect(cleanName('Ramesh123')).toBe('Ramesh');
    expect(cleanName('Sree@devi#')).toBe('Sreedevi');
    expect(cleanName('  .Raju')).toBe('Raju');
    expect(cleanName('K.  Ravi')).toBe('K. Ravi');
  });

  it("keeps titles, initials, apostrophes, hyphens and Indian scripts", () => {
    expect(cleanName("Dr. K. D'Souza-Rao")).toBe("Dr. K. D'Souza-Rao");
    expect(cleanName('శ్రీదేవి')).toBe('శ్రీదేవి');
    expect(nameError('శ్రీదేవి')).toBe('');
  });

  it('reports missing, invalid and too-short names', () => {
    expect(nameError('  ')).toBe('Name is required.');
    expect(nameError('', { required: false })).toBe('');
    expect(nameError('R2D2')).toMatch(/only contain letters/);
    expect(nameError('A')).toBe('Name is too short.');
    expect(nameError('Dr. Pushpender Singh Poonia')).toBe('');
  });
});

describe('phone numbers (international)', () => {
  it('accepts valid numbers from different countries', () => {
    expect(phoneError('+91 98765 43210')).toBe('');   // India mobile
    expect(phoneError('+971 50 123 4567')).toBe('');  // UAE
    expect(phoneError('+1 415 555 2671')).toBe('');   // USA
    expect(phoneError('+44 20 7946 0958')).toBe('');  // UK landline
    expect(phoneError('+65 8123 4567')).toBe('');     // Singapore (8 digits)
    expect(phoneError('9876543210')).toBe('');        // old value, no code → India
  });

  it('explains what is wrong for the chosen country', () => {
    expect(phoneError('')).toBe('');
    expect(phoneError('', { required: true })).toBe('Phone number is required.');
    expect(phoneError('+91 98765')).toMatch(/too short for India \(\+91\)/);
    expect(phoneError('+971 50 123')).toMatch(/United Arab Emirates \(\+971\)/);
    expect(phoneError('+1 415 555')).toMatch(/too short for United States/);
    expect(phoneError('+91 55555 55555')).toMatch(/isn’t a valid number for India/);
  });

  it('splits and joins saved values', () => {
    expect(splitPhone('+971 50 123 4567')).toEqual({ country: 'AE', national: '501234567' });
    expect(splitPhone('9876543210')).toEqual({ country: 'IN', national: '9876543210' });
    expect(splitPhone('0044 20 7946 0958')).toEqual({ country: 'GB', national: '2079460958' });
    expect(splitPhone('+1 41').country).toBe('US'); // partial number keeps its country
    expect(joinPhone('IN', '9876543210')).toBe('+91 98765 43210');
    expect(joinPhone('AE', '50123')).toBe('+971 50123'); // still typing → kept as typed
    expect(joinPhone('IN', '')).toBe('');
  });

  it('allows digits only, up to the country’s maximum length', () => {
    expect(cleanNational('98765abc43210', 'IN')).toBe('9876543210');
    expect(cleanNational('9876543210999', 'IN')).toBe('9876543210');
    expect(cleanNational('81234567999', 'SG')).toBe('81234567');
    expect(cleanNational('98765', 'IN')).toBe('98765');           // still typing → untouched
    expect(cleanNational('15123456789', 'DE')).toBe('15123456789'); // Germany: 11-digit mobile allowed
  });

  it('lists every country with India first', () => {
    expect(COUNTRY_OPTIONS[0]).toMatchObject({ code: 'IN', dial: '+91' });
    expect(COUNTRY_OPTIONS.length).toBeGreaterThan(200);
  });
});

describe('agenda / free text', () => {
  it('accepts letters, numbers and any characters', () => {
    expect(textError('Review #3: Q4 budget & 2026 plan (Phase-2)')).toBe('');
  });

  it('rejects empty and over-long text', () => {
    expect(textError('   ', { label: 'Agenda' })).toBe('Agenda is required.');
    expect(textError('x'.repeat(501), { label: 'Agenda' })).toMatch(/500 characters/);
  });
});
