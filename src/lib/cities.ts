/* lib/cities.ts — city matching for the "met before" reminder.
   Known cities get aliases (Bombay → Mumbai etc.).
   ANY other typed city still works via a normalised fallback key. */

import { HOME_CITY } from '@/lib/appConfig';

export type City = { key: string; label: string; aliases: string[] };

/* home city (no "met before" popup there) — set NEXT_PUBLIC_HOME_CITY in .env.local */
export { HOME_CITY };

export const CITIES: City[] = [
  { key: 'new-delhi',     label: 'New Delhi',     aliases: ['new delhi', 'delhi', 'ndls', 'delhi ncr', 'new delhi ncr'] },
  { key: 'hyderabad',     label: 'Hyderabad',     aliases: ['hyderabad', 'hyd', 'secunderabad', 'cyberabad'] },
  { key: 'mumbai',        label: 'Mumbai',        aliases: ['mumbai', 'bombay', 'navi mumbai'] },
  { key: 'bengaluru',     label: 'Bengaluru',     aliases: ['bengaluru', 'bangalore', 'blr'] },
  { key: 'chennai',       label: 'Chennai',       aliases: ['chennai', 'madras'] },
  { key: 'kolkata',       label: 'Kolkata',       aliases: ['kolkata', 'calcutta'] },
  { key: 'pune',          label: 'Pune',          aliases: ['pune', 'poona'] },
  { key: 'gurugram',      label: 'Gurugram',      aliases: ['gurugram', 'gurgaon'] },
  { key: 'noida',         label: 'Noida',         aliases: ['noida', 'greater noida'] },
  { key: 'visakhapatnam', label: 'Visakhapatnam', aliases: ['visakhapatnam', 'vizag', 'vishakapatnam'] },
  { key: 'vijayawada',    label: 'Vijayawada',    aliases: ['vijayawada', 'bezawada'] },
  { key: 'ahmedabad',     label: 'Ahmedabad',     aliases: ['ahmedabad', 'amdavad'] },
  { key: 'dubai',         label: 'Dubai',         aliases: ['dubai', 'dxb'] },
  { key: 'abu-dhabi',     label: 'Abu Dhabi',     aliases: ['abu dhabi', 'abudhabi'] },
  { key: 'singapore',     label: 'Singapore',     aliases: ['singapore', 'sg'] },
  { key: 'london',        label: 'London',        aliases: ['london'] },
  { key: 'new-york',      label: 'New York',      aliases: ['new york', 'nyc', 'new york city'] },
];

/* "  New Delhi, India " → "new delhi" */
function normalize(raw: any): string {
  return String(raw || '')
    .split(',')[0]                                   // drop ", India" / ", MH"
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // strip accents
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\b(city|district|dist)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const ALIAS_MAP = new Map<string, City>();
CITIES.forEach((c) => c.aliases.forEach((a) => ALIAS_MAP.set(normalize(a), c)));

/* city field → stable key. Unknown cities get a slug instead of null. */
export function cityKey(raw: any): string | null {
  const n = normalize(raw);
  if (!n) return null;
  const known = ALIAS_MAP.get(n);
  if (known) return known.key;
  return n.replace(/\s+/g, '-');                     // e.g. "warangal", "kuala-lumpur"
}

/* key → display label */
export function cityLabel(key: string, fallback = ''): string {
  const known = CITIES.find((c) => c.key === key);
  if (known) return known.label;
  if (fallback.trim()) return fallback.trim();
  return key.split('-').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

/* free-text location/address → known city found inside it (whole-word match) */
export function findCity(location: any): City | undefined {
  const text = ` ${normalize(String(location || '').replace(/,/g, ' '))} `;
  if (!text.trim()) return undefined;
  /* longest alias first so "new delhi" beats "delhi", "navi mumbai" beats "mumbai" */
  const aliases = Array.from(ALIAS_MAP.keys()).sort((a, b) => b.length - a.length);
  for (const a of aliases) {
    if (text.includes(` ${a} `)) return ALIAS_MAP.get(a);
  }
  return undefined;
}

export function isHomeCity(key: string | null | undefined): boolean {
  return !!key && key === HOME_CITY;
}