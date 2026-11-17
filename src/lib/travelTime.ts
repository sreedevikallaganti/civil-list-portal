// lib/travelTime.ts — is there enough time to get from one meeting to the next?
//
// For back-to-back meetings on the same day, compares the gap (end of one → start of the next)
// with an estimate of the travel time between their places:
//   • same venue (e.g. both in the office)       → no travel
//   • same city, different venue                  → CITY_HOP_MIN (traffic)
//   • different cities, up to ROAD_MAX_KM apart   → by road (~45 km/h incl. stops) + 20 min
//   • further                                     → by air: 2.5 h airport time + flight (~650 km/h)
//   • either place abroad                         → + 1 h (immigration)
// Estimates are deliberately rough and on the safe side; the warning says "about".
// Places come from lib/geo (City field, else Location text; office meetings = home city).

import { CITY_COORDS, placeOf, type LatLng } from '@/lib/geo';

export const CITY_HOP_MIN = 30;
const ROAD_MAX_KM = 350;
const ROAD_KMH = 45;
const AIRPORT_MIN = 150;
const FLIGHT_KMH = 650;
const ABROAD_MIN = 60;
const UNKNOWN_CITIES_MIN = 240; // different cities, but no coordinates for one of them
export const DEFAULT_DURATION = 30;

type M = { id: string; meeting_date?: string; meeting_time?: string; duration?: unknown; status?: string; location?: string; city?: string; meeting_place?: string; agenda?: string; [k: string]: any };

export type Estimate = { minutes: number; km: number | null; mode: 'none' | 'city' | 'road' | 'air' | 'unknown'; from: string; to: string };

export type TravelIssue = {
  from: M;
  to: M;
  date: string;
  gapMin: number;     // free minutes between the two (negative = they overlap)
  needMin: number;    // estimated travel time
  level: 'too-tight' | 'tight';
  estimate: Estimate;
  message: string;    // "Hyderabad → Warangal (about 3 h 50 min by road) — only 45 min between meetings"
};

/** in India (rough bounding box) — anything outside counts as abroad */
const inIndia = ([lat, lng]: LatLng) => lat > 6 && lat < 37.5 && lng > 68 && lng < 97.5;

export function km(a: LatLng, b: LatLng): number {
  const R = 6371, rad = Math.PI / 180;
  const dLat = (b[0] - a[0]) * rad, dLng = (b[1] - a[1]) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * rad) * Math.cos(b[0] * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

const venueOf = (m: M) =>
  String(m.location || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim() ||
  (/office/i.test(String(m.meeting_place || '')) ? 'office' : '');

export function fmtMinutes(min: number): string {
  const m = Math.max(0, Math.round(min));
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60), r = m % 60;
  return r ? `${h} h ${r} min` : `${h} h`;
}

/** Rough travel time between the places of two meetings. */
export function estimateTravel(a: M, b: M, coords: Record<string, LatLng> = CITY_COORDS): Estimate {
  const from = placeOf(a), to = placeOf(b);
  const va = venueOf(a), vb = venueOf(b);
  if (!from || !to || from === to) {
    // same city (or a place we can't tell): only a venue change costs time
    const sameVenue = va === vb || (!va && !vb);
    return { minutes: sameVenue ? 0 : CITY_HOP_MIN, km: null, mode: sameVenue ? 'none' : 'city', from, to };
  }
  const ca = coords[from] ?? CITY_COORDS[from], cb = coords[to] ?? CITY_COORDS[to];
  if (!ca || !cb) return { minutes: UNKNOWN_CITIES_MIN, km: null, mode: 'unknown', from, to };
  const d = km(ca, cb);
  const abroad = !inIndia(ca) || !inIndia(cb) ? ABROAD_MIN : 0;
  if (d <= ROAD_MAX_KM && !abroad) return { minutes: Math.round((d / ROAD_KMH) * 60 + 20), km: Math.round(d), mode: 'road', from, to };
  return { minutes: Math.round(AIRPORT_MIN + (d / FLIGHT_KMH) * 60 + abroad), km: Math.round(d), mode: 'air', from, to };
}

const startMin = (m: M) => {
  const t = /(\d{1,2}):(\d{2})/.exec(String(m.meeting_time || ''));
  return t ? +t[1] * 60 + +t[2] : null;
};
const durationOf = (m: M) => Math.max(5, Math.round(Number(m.duration) || DEFAULT_DURATION));
const counts = (m: M) => !/cancel|reject|complete|done/i.test(String(m.status || '')); // only meetings still to happen

function describe(e: Estimate) {
  if (e.mode === 'city') return `a change of venue in ${e.from || 'the city'} (about ${fmtMinutes(e.minutes)} in traffic)`;
  if (e.mode === 'road') return `${e.from} → ${e.to} (about ${fmtMinutes(e.minutes)} by road, ${e.km} km)`;
  if (e.mode === 'air') return `${e.from} → ${e.to} (about ${fmtMinutes(e.minutes)} incl. flight and airport time)`;
  return `${e.from} → ${e.to} (different cities — at least ${fmtMinutes(e.minutes)})`;
}

/** Back-to-back meetings on the same day that are too close for the travel between them. */
export function travelIssues(meetings: M[], { coords = CITY_COORDS, slackMin = 15 }: { coords?: Record<string, LatLng>; slackMin?: number } = {}): TravelIssue[] {
  const byDay = new Map<string, M[]>();
  for (const m of meetings) {
    const day = String(m.meeting_date || '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || startMin(m) == null || !counts(m)) continue;
    byDay.set(day, [...(byDay.get(day) ?? []), m]);
  }
  const out: TravelIssue[] = [];
  for (const [date, list] of byDay) {
    list.sort((x, y) => startMin(x)! - startMin(y)!);
    for (let i = 0; i + 1 < list.length; i++) {
      const a = list[i], b = list[i + 1];
      const gap = startMin(b)! - (startMin(a)! + durationOf(a));
      const est = estimateTravel(a, b, coords);
      if (est.minutes === 0) continue; // same place: overlaps are reported by the clash check
      const level = gap < est.minutes ? 'too-tight' : gap < est.minutes + slackMin ? 'tight' : null;
      if (!level) continue;
      out.push({
        from: a, to: b, date, gapMin: gap, needMin: est.minutes, level, estimate: est,
        message: `${describe(est)} — ${gap <= 0 ? 'no time' : `only ${fmtMinutes(gap)}`} between the meetings`,
      });
    }
  }
  return out.sort((x, y) => x.date.localeCompare(y.date));
}

/** The issue (if any) a planned new meeting would create with that day's other meetings. */
export function checkPlannedSlot(
  planned: M,
  sameDay: M[],
  opts?: { coords?: Record<string, LatLng>; slackMin?: number },
): TravelIssue[] {
  const id = planned.id || '__planned__';
  const all = [...sameDay.filter((m) => m.id !== id), { ...planned, id }];
  return travelIssues(all, opts).filter((t) => t.from.id === id || t.to.id === id);
}
