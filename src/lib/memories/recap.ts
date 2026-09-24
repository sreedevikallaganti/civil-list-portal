import {
  isCancelled,
  meetingDay,
  meetingPlace,
  officerKey,
  officerService,
  startOfToday,
  type MemoryMeeting,
} from "@/lib/memories/meetingUtils";

export type ServiceFilter = "all" | "IAS" | "IPS";

export type RecapPhoto = { meeting: MemoryMeeting; name: string };

export type Recap = {
  year: number;
  service: ServiceFilter;
  total: number;
  prevYearTotal: number;
  completed: number;
  photos: number;
  officers: number;
  newOfficers: number;
  ias: number; // meetings with IAS officers
  ips: number; // meetings with IPS officers
  departments: number;
  topDepartment: { name: string; count: number } | null;
  places: number;
  topPlace: { name: string; count: number } | null;
  byMonth: number[]; // 12
  busiestMonth: number; // 0-11
  byWeekday: number[]; // 7, Sunday first
  favouriteWeekday: number;
  topOfficers: { key: string; name: string; designation: string; service: string; count: number }[];
  longestWeekStreak: number;
  first: { meeting: MemoryMeeting; day: Date } | null;
  highlights: RecapPhoto[]; // up to 12, spread across the year
};

/** Years that have at least one meeting (newest first), always including the current year. */
export function recapYears(meetings: MemoryMeeting[]): number[] {
  const years = new Set<number>([new Date().getFullYear()]);
  for (const m of meetings) {
    const d = meetingDay(m);
    if (d) years.add(d.getFullYear());
  }
  return [...years].filter((y) => y <= new Date().getFullYear()).sort((a, b) => b - a);
}

/**
 * Yearly recap. Counts meetings that actually happened: not cancelled and not in the future.
 */
export function computeRecap(all: MemoryMeeting[], year: number, service: ServiceFilter = "all"): Recap {
  const today = startOfToday();
  const rows = all
    .filter((m) => !isCancelled(m))
    .filter((m) => service === "all" || officerService(m) === service)
    .map((m) => ({ m, day: meetingDay(m) }))
    .filter((r): r is { m: MemoryMeeting; day: Date } => !!r.day && r.day <= today);

  const inYear = rows.filter((r) => r.day.getFullYear() === year).sort((a, b) => +a.day - +b.day);
  const prevYearTotal = rows.filter((r) => r.day.getFullYear() === year - 1).length;
  const knownBefore = new Set(rows.filter((r) => r.day.getFullYear() < year).map((r) => officerKey(r.m)));

  const byMonth = Array(12).fill(0) as number[];
  const byWeekday = Array(7).fill(0) as number[];
  const officers = new Map<string, Recap["topOfficers"][number]>();
  const departments = new Map<string, number>();
  const places = new Map<string, { name: string; count: number }>();
  const weeks = new Set<number>();
  let photos = 0;
  let completed = 0;
  let ias = 0;
  let ips = 0;

  for (const { m, day } of inYear) {
    byMonth[day.getMonth()]++;
    byWeekday[day.getDay()]++;
    photos += m.photos?.length ?? 0;
    if ((m.status || "").toLowerCase().includes("complete")) completed++;

    const svc = officerService(m);
    if (svc === "IAS") ias++;
    if (svc === "IPS") ips++;

    const key = officerKey(m);
    if (key) {
      const o = officers.get(key) ?? {
        key,
        name: m.officer_name || "Unknown officer",
        designation: m.designation || "",
        service: svc,
        count: 0,
      };
      o.count++;
      officers.set(key, o);
    }

    const dept = (m.department || "").trim();
    if (dept) departments.set(dept, (departments.get(dept) ?? 0) + 1);

    const place = meetingPlace(m);
    if (place) {
      const p = places.get(place.toLowerCase()) ?? { name: place, count: 0 };
      p.count++;
      places.set(place.toLowerCase(), p);
    }

    // Monday-based week index
    const daysSinceEpoch = Date.UTC(day.getFullYear(), day.getMonth(), day.getDate()) / 86_400_000;
    weeks.add(Math.floor((daysSinceEpoch - 4) / 7));
  }

  const sortedWeeks = [...weeks].sort((a, b) => a - b);
  let longest = 0;
  let run = 0;
  sortedWeeks.forEach((w, i) => {
    run = i > 0 && w === sortedWeeks[i - 1] + 1 ? run + 1 : 1;
    longest = Math.max(longest, run);
  });

  const topDept = [...departments.entries()].sort((a, b) => b[1] - a[1])[0];
  const topPlace = [...places.values()].sort((a, b) => b.count - a.count)[0];
  const maxMonth = Math.max(...byMonth);
  const maxWeekday = Math.max(...byWeekday);

  return {
    year,
    service,
    total: inYear.length,
    prevYearTotal,
    completed,
    photos,
    officers: officers.size,
    newOfficers: [...officers.keys()].filter((k) => !knownBefore.has(k)).length,
    ias,
    ips,
    departments: departments.size,
    topDepartment: topDept ? { name: topDept[0], count: topDept[1] } : null,
    places: places.size,
    topPlace: topPlace ?? null,
    byMonth,
    busiestMonth: byMonth.indexOf(maxMonth),
    byWeekday,
    favouriteWeekday: byWeekday.indexOf(maxWeekday),
    topOfficers: [...officers.values()].sort((a, b) => b.count - a.count).slice(0, 3),
    longestWeekStreak: longest,
    first: inYear[0] ? { meeting: inYear[0].m, day: inYear[0].day } : null,
    highlights: pickHighlights(inYear.map((r) => r.m), 12),
  };
}

/** One photo per meeting, spread through the year; tops up from the same meetings if few. */
function pickHighlights(meetings: MemoryMeeting[], n: number): RecapPhoto[] {
  const withPhotos = meetings.filter((m) => m.photos?.length);
  if (withPhotos.length > n) {
    const step = withPhotos.length / n;
    return Array.from({ length: n }, (_, i) => {
      const m = withPhotos[Math.floor(i * step)];
      return { meeting: m, name: m.photos![0] };
    });
  }
  const out: RecapPhoto[] = [];
  for (let round = 0; out.length < n; round++) {
    let added = false;
    for (const m of withPhotos) {
      const name = m.photos![round];
      if (name && out.length < n) {
        out.push({ meeting: m, name });
        added = true;
      }
    }
    if (!added) break;
  }
  return out;
}

export const MONTHS = ["January", "February", "March", "April", "May", "June", "July",
  "August", "September", "October", "November", "December"];
export const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
