/* ================================================================
   revisit.ts — "You've met these people in Dubai before."

   Given all meetings, a city and a date, returns the people the MD
   has met in that city before who aren't already booked for this
   visit. Pure function — no network.

   Order: overdue/pending follow-up → High priority → longest since
   last met → most meetings there.
================================================================ */

import { CITIES, cityKey, findCity, isHomeCity } from '@/lib/cities';

/* meetings in the same city within ± this many days count as the same visit */
export const VISIT_WINDOW_DAYS = 3;

export interface RevisitPerson {
  key: string;
  name: string;
  designation: string;
  email: string;
  phone: string;
  timesMet: number;
  lastMetAt: Date | null;
  lastAgenda: string;
  lastMeeting: any;          // latest past meeting in this city — used to pre-fill Schedule
  pendingFollowUp: boolean;
  followUpOverdue: boolean;
  priority: string;
}

const pad2 = (n: number) => String(n).padStart(2, '0');
const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
};
const dayOf = (m: any) => String(m?.meeting_date || '').slice(0, 10);
const statusOf = (m: any) => String(m?.status || 'Scheduled').toLowerCase();

function daysApart(a: string, b: string) {
  const [y1, m1, d1] = a.split('-').map(Number);
  const [y2, m2, d2] = b.split('-').map(Number);
  return Math.abs(Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86_400_000));
}

export function meetingStart(m: any): Date | null {
  const iso = dayOf(m);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const [y, mo, d] = iso.split('-').map(Number);
  const t = /^(\d{1,2}):(\d{2})/.exec(String(m?.meeting_time || ''));
  return new Date(y, mo - 1, d, t ? +t[1] : 0, t ? +t[2] : 0);
}

/* City field first, else a known city named in the address. */
/* City field first, else a known city named in the address. */
export function meetingCityKey(m: any): string | null {
  const fromField = cityKey(m?.city);
  if (fromField) return fromField;
  return findCity(m?.location)?.key ?? null;
}

const normText = (s: any) =>
  ` ${String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()} `;

/* Does meeting `m` belong to `city`?
   1) its city field / a known city in its venue decides, if present
   2) otherwise look for the city's name (or aliases) inside the venue text —
      this also works for cities that aren't in the CITIES list */
export function isInCity(m: any, city: string): boolean {
  const k = meetingCityKey(m);
  if (k) return k === city;
  const known = CITIES.find((c) => c.key === city);
  const terms = known ? known.aliases : [city.replace(/-/g, ' ')];
  const text = normText(m?.location);
  return terms.some((t) => text.includes(normText(t)));
}

export function personKey(m: { officer_id?: string; officer_name?: string }): string {
  if (m?.officer_id) return `id:${m.officer_id}`;
  const n = String(m?.officer_name || '').trim().toLowerCase().replace(/\s+/g, ' ');
  return n ? `name:${n}` : '';
}

export function findPeopleToRevisit(
  meetings: any[],
  /* exclude: person keys (id:… / name:…) or emails as `email:x@y.com` */
  opts: { city: string | null; date: string; exclude?: string[]; now?: Date },
): RevisitPerson[] {
  const { city, date } = opts;
  if (!city || isHomeCity(city) || !/^\d{4}-\d{2}-\d{2}$/.test(date || '')) return [];
  const now = opts.now || new Date();
  const today = todayISO();
  const exclude = new Set((opts.exclude || []).filter(Boolean));

  /* emails in `exclude` → exclude that person on every meeting */
  for (const m of meetings) {
    if (m?.email && exclude.has(`email:${String(m.email).trim().toLowerCase()}`)) exclude.add(personKey(m));
  }

  /* already booked in this city around this date → skip */
  for (const m of meetings) {
    if (statusOf(m) === 'cancelled' || meetingCityKey(m) !== city) continue;
    const d = dayOf(m);
    if (d && daysApart(d, date) <= VISIT_WINDOW_DAYS) exclude.add(personKey(m));
  }

  /* latest meeting with each person anywhere — for contact details & follow-ups */
  const latestAny = new Map<string, any>();
  for (const m of meetings) {
    const k = personKey(m);
    if (!k) continue;
    const prev = latestAny.get(k);
    if (!prev || (meetingStart(m)?.getTime() || 0) > (meetingStart(prev)?.getTime() || 0)) latestAny.set(k, m);
  }

  /* past meetings in this city, grouped by person */
  const groups = new Map<string, any[]>();
  for (const m of meetings) {
if (statusOf(m) === 'cancelled' || meetingCityKey(m) !== city) continue;
    const at = meetingStart(m);
    if (!at || at > now) continue;
    const k = personKey(m);
    if (!k || exclude.has(k)) continue;
    (groups.get(k) || groups.set(k, []).get(k)!).push(m);
  }

  const people: RevisitPerson[] = [];
  for (const [key, list] of groups) {
    list.sort((a, b) => (meetingStart(b)?.getTime() || 0) - (meetingStart(a)?.getTime() || 0));
    const last = list[0];
    const any = latestAny.get(key) || last;
    const fuDate = String(any?.follow_up_date || '').slice(0, 10);
    const fuText = String(any?.follow_up_notes || any?.followup_notes || '').trim();
    const pending = statusOf(any) !== 'cancelled' && (!!fuDate || !!fuText);
    people.push({
      key,
      name: last.officer_name,
      designation: any?.designation || last.designation || '',
      email: any?.email || last.email || '',
      phone: any?.contact_number || last.contact_number || '',
      timesMet: list.length,
      lastMetAt: meetingStart(last),
      lastAgenda: last.agenda || '',
      lastMeeting: last,
      pendingFollowUp: pending,
      followUpOverdue: pending && !!fuDate && fuDate < today,
      priority: String(any?.priority || last.priority || ''),
    });
  }

  const rank = (p: RevisitPerson) => [
    p.followUpOverdue ? 0 : p.pendingFollowUp ? 1 : 2,
    p.priority.toLowerCase() === 'high' ? 0 : 1,
    p.lastMetAt ? p.lastMetAt.getTime() : 0,
    -p.timesMet,
  ];
  return people.sort((a, b) => {
    const ra = rank(a), rb = rank(b);
    for (let i = 0; i < ra.length; i++) if (ra[i] !== rb[i]) return ra[i] - rb[i];
    return a.name.localeCompare(b.name);
  });
}
