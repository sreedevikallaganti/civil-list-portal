/* lib/trips.ts — upcoming visits and who to meet there.

   A "visit" = scheduled meetings in the same city (other than the home city)
   whose dates are within VISIT_WINDOW_DAYS of each other. For each visit we
   suggest (1) people met in that city before — lib/revisit.ts — and
   (2) directory officers / contacts based there — lib/memories/directory.ts. */

import { cityLabel } from '@/lib/cities';
import { findPeopleToRevisit, meetingCityKey, personKey, VISIT_WINDOW_DAYS, type RevisitPerson } from '@/lib/revisit';
import { findInDirectory, type DirectoryPerson } from '@/lib/memories/directory';
import { isHomeCity } from '@/lib/cities';

export type Trip = {
  key: string;        // stable id: city|first date
  city: string;       // city key
  label: string;      // display name
  from: string;       // YYYY-MM-DD
  to: string;
  meetings: any[];    // booked meetings on this visit
  ongoing: boolean;   // the visit has started (the MD is there now)
  planDate: string;   // date to pre-fill when scheduling: first day, or today once the visit is under way
};

/* A visit stays listed this many days after its last booked meeting, so the MD can
   still see who else to meet while in the city (e.g. the morning after). */
export const STAY_AFTER_DAYS = 1;

const pad = (n: number) => String(n).padStart(2, '0');
export const isoDay = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const dayOf = (m: any) => String(m?.meeting_date || '').slice(0, 10);
const daysBetween = (a: string, b: string) =>
  Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
const isOff = (m: any) => /cancel|reject/i.test(String(m?.status || '')) || m?.deleted;

/** Visits outside the home city that are under way or start within `withinDays`;
    the one the MD is on right now first, then soonest first. A visit stays listed
    until STAY_AFTER_DAYS after its last meeting. */
export function upcomingTrips(meetings: any[], { withinDays = 45, now = new Date() } = {}): Trip[] {
  const today = isoDay(now);
  const byCity = new Map<string, any[]>();
  for (const m of meetings) {
    const d = dayOf(m);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || isOff(m)) continue;
    // keep the last few days too, so a visit that has started stays together
    if (daysBetween(d, today) > STAY_AFTER_DAYS + VISIT_WINDOW_DAYS || daysBetween(today, d) > withinDays) continue;
    const city = meetingCityKey(m);
    if (!city || isHomeCity(city)) continue;
    (byCity.get(city) || byCity.set(city, []).get(city)!).push(m);
  }

  const trips: Trip[] = [];
  for (const [city, list] of byCity) {
    list.sort((a, b) => dayOf(a).localeCompare(dayOf(b)));
    let cur: Trip | null = null;
    for (const m of list) {
      const d = dayOf(m);
      if (cur && daysBetween(cur.to, d) <= VISIT_WINDOW_DAYS) {
        cur.to = d;
        cur.meetings.push(m);
      } else {
        cur = {
          key: `${city}|${d}`, city, label: cityLabel(city, String(m.city || '').split(',')[0]),
          from: d, to: d, meetings: [m], ongoing: false, planDate: d,
        };
        trips.push(cur);
      }
    }
  }
  return trips
    .filter((t) => daysBetween(t.to, today) <= STAY_AFTER_DAYS) // ended more than STAY_AFTER_DAYS ago → gone
    .map((t) => {
      const ongoing = t.from <= today;
      return { ...t, ongoing, planDate: ongoing ? today : t.from };
    })
    .sort((a, b) => Number(b.ongoing) - Number(a.ongoing) || a.from.localeCompare(b.from));
}

export type TripSuggestions = {
  metBefore: RevisitPerson[];     // met in this city before, not booked on this visit
  basedThere: DirectoryPerson[];  // directory people whose post / address mentions the city
};

/** People worth meeting on this visit. `metBefore` is instant; `basedThere` queries PocketBase. */
export function metBeforeFor(trip: Trip, meetings: any[]): RevisitPerson[] {
  return findPeopleToRevisit(meetings, {
    city: trip.city,
    date: trip.planDate,
    exclude: trip.meetings.map((m) => personKey(m)),
  });
}

export async function suggestionsFor(trip: Trip, meetings: any[]): Promise<TripSuggestions> {
  const metBefore = metBeforeFor(trip, meetings);
  const known = new Set<string>([
    ...meetings.map((m) => String(m.officer_id || '')).filter(Boolean),
  ]);
  const basedThere = (await findInDirectory(trip.label)).filter((p) => !known.has(p.id));
  return { metBefore, basedThere };
}

/** "4 Oct" or "4–6 Oct" */
export function tripDates(t: Trip) {
  const f = new Date(`${t.from}T00:00:00`);
  const e = new Date(`${t.to}T00:00:00`);
  const day = (d: Date) => d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  if (t.from === t.to) return day(f);
  return f.getMonth() === e.getMonth() ? `${f.getDate()}–${day(e)}` : `${day(f)} – ${day(e)}`;
}

/** Link that opens the New Meeting form on the Meetings page, pre-filled for this visit. */
export function scheduleHref(trip: Trip, who: { meetingId?: string; directory?: DirectoryPerson }) {
  const q = new URLSearchParams({ date: trip.planDate, city: trip.label });
  if (who.meetingId) q.set('schedule', who.meetingId);
  if (who.directory) q.set('person', `${who.directory.kind}:${who.directory.id}`);
  return `/meetings?${q}`;
}
