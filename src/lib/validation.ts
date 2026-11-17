// lib/validation.ts — input rules shared by every form (officers, contacts, employees, users, meetings).
//
//  • Names  — letters only, plus space . ' - for titles and initials ("Dr. K. Sreedevi", "D'Souza").
//             Any script is allowed (Telugu, Hindi…). Digits and symbols are blocked while typing.
//  • Phones — international: a country (default India) + the national number. Validity and length
//             follow that country's real numbering plan (libphonenumber), so +91 98765 43210,
//             +971 50 123 4567 and +1 415 555 2671 are all accepted. Saved as "+<code> <number>".
//             Old values without a country code ("9876543210") are read as Indian numbers.
//  • Agenda / free text — any characters; only checked for being non-empty and not too long.

import {
  getCountries,
  getCountryCallingCode,
  getExampleNumber,
  parsePhoneNumberFromString,
  validatePhoneNumberLength,
  type CountryCode,
} from 'libphonenumber-js/max'; // full metadata: real number patterns per country, not just lengths
import examples from 'libphonenumber-js/mobile/examples';

export const NAME_MAX = 80;
export const AGENDA_MAX = 500;

/* ─────────────────────────────── Names ─────────────────────────────── */

const NAME_DISALLOWED = /[^\p{L}\p{M} .'-]/gu;
const NAME_VALID = /^\p{L}[\p{L}\p{M} .'-]*$/u;

/** Strip everything a name can't contain — use in onChange so invalid characters never appear. */
export function cleanName(value: string): string {
  return value
    .replace(NAME_DISALLOWED, '')
    .replace(/^[\s.'-]+/, '') // must start with a letter
    .replace(/\s{2,}/g, ' ')
    .slice(0, NAME_MAX);
}

/** Error message for a name, or '' when it's fine. */
export function nameError(value: string, { required = true, label = 'Name' } = {}): string {
  const v = value.trim();
  if (!v) return required ? `${label} is required.` : '';
  if (!NAME_VALID.test(v)) return `${label} can only contain letters, spaces and . ' -`;
  if (v.replace(/[^\p{L}]/gu, '').length < 2) return `${label} is too short.`;
  return '';
}

/* ─────────────────────────────── Phones ─────────────────────────────── */

export type { CountryCode };
export const DEFAULT_COUNTRY: CountryCode = 'IN';

const regionNames = typeof Intl !== 'undefined' && 'DisplayNames' in Intl
  ? new Intl.DisplayNames(['en'], { type: 'region' })
  : null;
export const countryName = (c: CountryCode) => regionNames?.of(c) || c;

/** Countries most of our contacts come from — listed first in the picker. */
const PRIORITY: CountryCode[] = ['IN', 'AE', 'SA', 'QA', 'KW', 'OM', 'BH', 'SG', 'MY', 'US', 'GB', 'CA', 'AU', 'NZ', 'DE', 'FR', 'JP', 'LK', 'NP', 'BD'];

export type CountryOption = { code: CountryCode; name: string; dial: string };

/** Every country with its calling code: priority countries first, then A–Z. */
export const COUNTRY_OPTIONS: CountryOption[] = (() => {
  const all = getCountries().map((code) => ({ code, name: countryName(code), dial: `+${getCountryCallingCode(code)}` }));
  const byCode = new Map(all.map((o) => [o.code, o]));
  const top = PRIORITY.map((c) => byCode.get(c)).filter(Boolean) as CountryOption[];
  const rest = all.filter((o) => !PRIORITY.includes(o.code)).sort((a, b) => a.name.localeCompare(b.name));
  return [...top, ...rest];
})();

/** How many of COUNTRY_OPTIONS are the "common" countries at the top. */
export const COMMON_COUNTRY_COUNT = PRIORITY.filter((c) => getCountries().includes(c)).length;

/** Split a saved value into country + national digits ("+971 50 123 4567" → AE, "501234567"). */
export function splitPhone(value: string, fallback: CountryCode = DEFAULT_COUNTRY): { country: CountryCode; national: string } {
  const v = String(value || '').trim();
  if (!v) return { country: fallback, national: '' };
  const intl = v.replace(/^00/, '+');
  const p = parsePhoneNumberFromString(intl.startsWith('+') ? intl : v, fallback);
  if (p) {
    // partial numbers (e.g. "+1 41") have a calling code but no country yet → first country with that code
    const byCode = COUNTRY_OPTIONS.find((o) => o.dial === `+${p.countryCallingCode}`)?.code;
    return { country: (p.country as CountryCode) || byCode || fallback, national: String(p.nationalNumber) };
  }
  // unparseable partial: "+<code> <digits>" with a known calling code
  const m = /^\+(\d{1,3})\s*(.*)$/.exec(intl);
  if (m) {
    const match = COUNTRY_OPTIONS.find((o) => o.dial === `+${m[1]}`);
    if (match) return { country: match.code, national: m[2].replace(/\D/g, '') };
  }
  return { country: fallback, national: v.replace(/\D/g, '') };
}

/** Build the saved value from country + national digits: "+91 98765 43210" (international format). */
export function joinPhone(country: CountryCode, national: string): string {
  const digits = String(national || '').replace(/\D/g, '');
  if (!digits) return '';
  const p = parsePhoneNumberFromString(digits, country);
  if (p?.isValid()) return p.formatInternational();
  return `+${getCountryCallingCode(country)} ${digits}`; // still being typed / invalid → kept as typed
}

const isValidFor = (digits: string, country: CountryCode) => !!parsePhoneNumberFromString(digits, country)?.isValid();

/** Digits only. Typing stops once the number is complete: extra digits are dropped when a shorter
    prefix is already a valid number (India: 10-digit mobiles) and the longer one isn't — countries
    with several valid lengths (e.g. Germany) keep working. Never longer than the country allows. */
export function cleanNational(value: string, country: CountryCode): string {
  let digits = String(value || '').replace(/\D/g, '');
  while (digits && validatePhoneNumberLength(digits, country) === 'TOO_LONG') digits = digits.slice(0, -1);
  if (digits && !isValidFor(digits, country)) {
    for (let n = digits.length - 1; n >= 4; n--) {
      if (isValidFor(digits.slice(0, n), country)) return digits.slice(0, n);
    }
  }
  return digits;
}

/** "e.g. 81234 56789" — a real-looking mobile number for the chosen country. */
export function examplePhone(country: CountryCode): string {
  try {
    return getExampleNumber(country, examples)?.formatNational() ?? '';
  } catch {
    return '';
  }
}

/** Error message for a phone number, or '' when it's fine (empty is fine unless required). */
export function phoneError(value: string, { required = false, label = 'Phone number' } = {}): string {
  const v = String(value || '').trim();
  if (!v) return required ? `${label} is required.` : '';
  const { country, national } = splitPhone(v);
  if (!national) return required ? `${label} is required.` : '';
  const where = `${countryName(country)} (+${getCountryCallingCode(country)})`;
  switch (validatePhoneNumberLength(national, country)) {
    case 'TOO_SHORT': return `${label} is too short for ${where}.`;
    case 'TOO_LONG': return `${label} is too long for ${where}.`;
    case 'NOT_A_NUMBER': return `${label} can only contain digits.`;
  }
  const p = parsePhoneNumberFromString(national, country);
  if (!p?.isValid()) return `${label} isn’t a valid number for ${where}.`;
  return '';
}

/* ─────────────────────────────── Free text ─────────────────────────────── */

/** Error message for free text such as the agenda (letters, numbers, any character). */
export function textError(value: string, { required = true, label = 'This field', max = AGENDA_MAX } = {}): string {
  const v = value.trim();
  if (!v) return required ? `${label} is required.` : '';
  if (v.length > max) return `${label} must be ${max} characters or fewer.`;
  return '';
}
