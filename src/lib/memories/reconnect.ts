/**
 * Reconnect — "You're going to Dubai. Last time there you met these people."
 *
 * Looks at upcoming meetings in the next few weeks, groups them into trips by city,
 * and for each city lists the people met there before (who aren't already on the plan).
 * Everything runs on the meetings the dashboard has already loaded.
 */
import {
  daysBetween,
  isCancelled,
  meetingDay,
  meetingImages,
  officerKey,
  officerService,
  startOfToday,
  type MemoryMeeting,
} from "@/lib/memories/meetingUtils";
import { meetingCity } from "@/lib/memories/places";

export type ReconnectPerson = {
  key: string;
  name: string;
  designation: string;
  service: "IAS" | "IPS" | "";
  officerType: string;
  count: number;
  lastDay: Date;
  lastMeeting: MemoryMeeting;
  photo: { meeting: MemoryMeeting; name: string } | null;
};

export type Trip = {
  city: string;
  start: Date;
  end: Date;
  daysAway: number;
  planned: { meeting: MemoryMeeting; day: Date }[];
  people: ReconnectPerson[];
  pastVisits: number; // number of past meetings in this city
};

function isDone(m: MemoryMeeting) {
  return (m.status || "").toLowerCase().includes("complete");
}

/**
 * The "home" city — where most meetings happen. Trips there aren't trips,
 * so Reconnect skips it (it would otherwise suggest half your contacts every week).
 */
export function homeCity(meetings: MemoryMeeting[]): string {
  const counts = new Map<string, number>();
  let total = 0;
  for (const m of meetings) {
    const c = meetingCity(m);
    if (!c) continue;
    total++;
    counts.set(c, (counts.get(c) ?? 0) + 1);
  }
  const [city, n] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0] ?? ["", 0];
  return total >= 5 && n / total >= 0.4 ? city : "";
}

/** People met in `city` before today, most-met first; excludes `excludeKeys`. */
export function peopleMetIn(
  meetings: MemoryMeeting[],
  city: string,
  excludeKeys: Set<string> = new Set(),
  today: Date = startOfToday()
): ReconnectPerson[] {
  const people = new Map<string, ReconnectPerson>();
  for (const m of meetings) {
    if (isCancelled(m) || meetingCity(m) !== city) continue;
    const day = meetingDay(m);
    const key = officerKey(m);
    if (!day || day >= today || !key || excludeKeys.has(key)) continue;

    const p = people.get(key);
    const images = meetingImages(m);
    if (!p) {
      people.set(key, {
        key,
        name: m.officer_name || "Unknown",
        designation: m.designation || "",
        service: officerService(m),
        officerType: m.officer_type || "",
        count: 1,
        lastDay: day,
        lastMeeting: m,
        photo: images[0] ? { meeting: m, name: images[0] } : null,
      });
    } else {
      p.count++;
      if (day > p.lastDay) {
        p.lastDay = day;
        p.lastMeeting = m;
        if (images[0]) p.photo = { meeting: m, name: images[0] };
        if (m.designation) p.designation = m.designation;
      }
      if (!p.photo && images[0]) p.photo = { meeting: m, name: images[0] };
    }
  }
  // most-met first; for equal counts, the one not seen for longest first
  return [...people.values()].sort((a, b) => b.count - a.count || +a.lastDay - +b.lastDay);
}

/** Upcoming trips (next `horizonDays`) that have people to reconnect with. */
export function computeTrips(
  meetings: MemoryMeeting[],
  { horizonDays = 45, home, today = startOfToday() }: { horizonDays?: number; home?: string; today?: Date } = {}
): Trip[] {
  const homeName = home ?? homeCity(meetings);
  const byCity = new Map<string, { meeting: MemoryMeeting; day: Date }[]>();

  for (const m of meetings) {
    if (isCancelled(m) || isDone(m)) continue;
    const day = meetingDay(m);
    if (!day) continue;
    const away = daysBetween(today, day);
    if (away < 0 || away > horizonDays) continue;
    const city = meetingCity(m);
    if (!city || city === homeName) continue;
    byCity.set(city, [...(byCity.get(city) ?? []), { meeting: m, day }]);
  }

  const trips: Trip[] = [];
  for (const [city, planned] of byCity) {
    planned.sort((a, b) => +a.day - +b.day);
    const onPlan = new Set(planned.map((p) => officerKey(p.meeting)).filter(Boolean));
    const people = peopleMetIn(meetings, city, onPlan, today);
    if (!people.length) continue;
    const pastVisits = meetings.filter((m) => {
      const d = meetingDay(m);
      return d && d < today && !isCancelled(m) && meetingCity(m) === city;
    }).length;
    trips.push({
      city,
      start: planned[0].day,
      end: planned[planned.length - 1].day,
      daysAway: daysBetween(today, planned[0].day),
      planned,
      people,
      pastVisits,
    });
  }
  return trips.sort((a, b) => +a.start - +b.start);
}

/** "today" / "tomorrow" / "in 5 days" */
export function whenText(daysAway: number): string {
  if (daysAway <= 0) return "today";
  if (daysAway === 1) return "tomorrow";
  return `in ${daysAway} days`;
}

/** "12 Oct" or "12–14 Oct" or "30 Sep – 2 Oct" */
export function rangeText(start: Date, end: Date): string {
  const d = (x: Date) => x.getDate();
  const mon = (x: Date) => x.toLocaleDateString("en-IN", { month: "short" });
  if (+start === +end) return `${d(start)} ${mon(start)}`;
  if (start.getMonth() === end.getMonth()) return `${d(start)}–${d(end)} ${mon(end)}`;
  return `${d(start)} ${mon(start)} – ${d(end)} ${mon(end)}`;
}

/** Cities visited before (not the home city), most visited first — for the "Planning a trip?" chips. */
export function visitedCities(
  meetings: MemoryMeeting[],
  home?: string,
  today: Date = startOfToday()
): { city: string; count: number }[] {
  const homeName = home ?? homeCity(meetings);
  const counts = new Map<string, number>();
  for (const m of meetings) {
    if (isCancelled(m)) continue;
    const day = meetingDay(m);
    if (!day || day >= today || !officerKey(m)) continue;
    const city = meetingCity(m);
    if (!city || city === homeName) continue;
    counts.set(city, (counts.get(city) ?? 0) + 1);
  }
  return [...counts.entries()].map(([city, count]) => ({ city, count })).sort((a, b) => b.count - a.count);
}
