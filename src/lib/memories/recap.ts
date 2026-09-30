import {
  isCancelled,
  meetingDay,
  photoFiles,
  meetingPlace,
  officerService,
  startOfToday,
  type MemoryMeeting,
} from "@/lib/memories/meetingUtils";

export type ServiceFilter = "all" | "IAS" | "IPS";

export type RecapPhoto = { meeting: MemoryMeeting; name: string };

export type RecapPerson = {
  key: string;
  name: string;
  designation: string;
  service: string;
  count: number;     // all meetings this year (held + upcoming)
  held: number;      // already happened / completed
  upcoming: number;  // still ahead
  rank: number;
  lastMet: Date | null;
  next: Date | null; // next upcoming meeting
};

/* ── Who was met ─────────────────────────────────────────────────────────
   A meeting "happened" when it isn't cancelled/rejected and is either dated
   today or earlier, or already marked Completed (some are completed with a
   later date entered). Everyone in it counts once: the main officer plus any
   participants listed in `attendees` (names or emails).
   The same person is merged across meetings by officer_id, then by name
   (ignoring case, spacing and "Shri / Dr. / Smt" prefixes), then by email. */

const HONORIFICS = /\b(shri|sri|smt|dr|mr|mrs|ms|prof|capt|col)\b\.?/g;
const normName = (s: string) =>
  s.toLowerCase().replace(HONORIFICS, " ").replace(/[^a-z0-9@.\s]/g, " ").replace(/\s+/g, " ").trim();
const isEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);

function attendeeList(m: MemoryMeeting): string[] {
  let raw: unknown = (m as { attendees?: unknown }).attendees;
  for (let i = 0; i < 2 && typeof raw === "string"; i++) {
    try { raw = JSON.parse(raw); } catch { break; }
  }
  const list = Array.isArray(raw) ? raw : String(raw ?? "").split(/[,;\n]+/);
  return list.map((v) => String(v ?? "").trim()).filter(Boolean);
}

function isCompleted(m: MemoryMeeting) {
  return (m.status || "").toLowerCase().includes("complete");
}

/** Builds the lookup that decides "is this the same person?" from every meeting. */
function buildIdentity(all: MemoryMeeting[]) {
  const nameToId = new Map<string, string>();
  const emailToKey = new Map<string, string>();
  for (const m of all) {
    const n = normName(m.officer_name || "");
    if (m.officer_id && n) nameToId.set(n, m.officer_id);
  }
  const keyFor = (name: string, id?: string) => {
    if (id) return `id:${id}`;
    const n = normName(name);
    if (!n) return "";
    const known = nameToId.get(n);
    return known ? `id:${known}` : `name:${n}`;
  };
  for (const m of all) {
    const e = String((m as { email?: string }).email || "").trim().toLowerCase();
    const k = keyFor(m.officer_name || "", m.officer_id);
    if (isEmail(e) && k) emailToKey.set(e, k);
  }
  /** everyone in one meeting, each once: [key, display name, is main officer] */
  const people = (m: MemoryMeeting): [string, string, boolean][] => {
    const out = new Map<string, [string, string, boolean]>();
    const main = keyFor(m.officer_name || "", m.officer_id);
    if (main) out.set(main, [main, m.officer_name || "", true]);
    for (const a of attendeeList(m)) {
      const lower = a.toLowerCase();
      const k = isEmail(lower) ? emailToKey.get(lower) ?? `email:${lower}` : keyFor(a);
      if (k && !out.has(k)) out.set(k, [k, a, false]);
    }
    return [...out.values()];
  };
  return { keyFor, people };
}

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
  /** most met people — ties share a rank (1, 1, 3 …) */
  topOfficers: RecapPerson[];
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
 * Yearly recap. Counts meetings that actually happened: not cancelled, and either
 * dated today or earlier or already marked Completed.
 */
export function computeRecap(all: MemoryMeeting[], year: number, service: ServiceFilter = "all"): Recap {
  const today = startOfToday();
  const identity = buildIdentity(all);
  const rows = all
    .filter((m) => !isCancelled(m) && !(m as { deleted?: boolean }).deleted)
    .filter((m) => service === "all" || officerService(m) === service)
    .map((m) => ({ m, day: meetingDay(m) }))
    .filter((r): r is { m: MemoryMeeting; day: Date } => !!r.day && (r.day <= today || isCompleted(r.m)));

  const inYear = rows.filter((r) => r.day.getFullYear() === year).sort((a, b) => +a.day - +b.day);
  const prevYearTotal = rows.filter((r) => r.day.getFullYear() === year - 1).length;
  const knownBefore = new Set(
    rows.filter((r) => r.day.getFullYear() < year).flatMap((r) => identity.people(r.m).map(([k]) => k)),
  );

  const byMonth = Array(12).fill(0) as number[];
  const byWeekday = Array(7).fill(0) as number[];
  const people = new Set<string>(); // everyone met in meetings that happened
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
    photos += photoFiles(m).length;
    if ((m.status || "").toLowerCase().includes("complete")) completed++;

    const svc = officerService(m);
    if (svc === "IAS") ias++;
    if (svc === "IPS") ips++;

    for (const [key, , isMain] of identity.people(m)) {
      if (service === "all" || isMain) people.add(key);
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

  const topOfficers = rankMostMet(all, year, service, identity, today);

  return {
    year,
    service,
    total: inYear.length,
    prevYearTotal,
    completed,
    photos,
    officers: people.size,
    newOfficers: [...people].filter((k) => !knownBefore.has(k)).length,
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
    topOfficers,
    longestWeekStreak: longest,
    first: inYear[0] ? { meeting: inYear[0].m, day: inYear[0].day } : null,
    highlights: pickHighlights(inYear.map((r) => r.m), 12),
  };
}

/**
 * Most met people of the year — every meeting in the year that isn't cancelled,
 * including upcoming ones. Ranked by total meetings, then by how many already
 * happened, then by who was met most recently. Identical records share a rank.
 */
function rankMostMet(
  all: MemoryMeeting[], year: number, service: ServiceFilter,
  identity: ReturnType<typeof buildIdentity>, today: Date,
): RecapPerson[] {
  type Acc = Omit<RecapPerson, "rank"> & { mainAt: number };
  const acc = new Map<string, Acc>();

  for (const m of all) {
    if (isCancelled(m) || (m as { deleted?: boolean }).deleted) continue;
    if (service !== "all" && officerService(m) !== service) continue;
    const day = meetingDay(m);
    if (!day || day.getFullYear() !== year) continue;
    const happened = day <= today || isCompleted(m);

    for (const [key, name, isMain] of identity.people(m)) {
      if (service !== "all" && !isMain) continue; // IAS / IPS view ranks those officers only
      const p = acc.get(key) ?? {
        key, name, designation: "", service: "", count: 0, held: 0, upcoming: 0, lastMet: null, next: null, mainAt: -1,
      };
      p.count++;
      if (happened) {
        p.held++;
        if (!p.lastMet || day > p.lastMet) p.lastMet = day;
      } else {
        p.upcoming++;
        if (!p.next || day < p.next) p.next = day;
      }
      // name / designation from their most recent meeting as the main officer
      if (isMain && +day >= p.mainAt) {
        p.mainAt = +day;
        p.name = m.officer_name || p.name;
        p.designation = m.designation || p.designation;
        p.service = officerService(m) || p.service;
      }
      acc.set(key, p);
    }
  }

  const ranked = [...acc.values()].sort((a, b) =>
    b.count - a.count || b.held - a.held || +(b.lastMet ?? 0) - +(a.lastMet ?? 0) || a.name.localeCompare(b.name));

  const out: RecapPerson[] = [];
  for (const { mainAt: _mainAt, ...p } of ranked.slice(0, 5)) {
    const prev = out[out.length - 1];
    const tied = prev && prev.count === p.count && prev.held === p.held;
    out.push({ ...p, rank: tied ? prev.rank : out.length + 1 });
  }
  return out;
}

/** One photo per meeting, spread through the year; tops up from the same meetings if few. */
function pickHighlights(meetings: MemoryMeeting[], n: number): RecapPhoto[] {
  const withPhotos = meetings.filter((m) => photoFiles(m).length > 0);
  if (withPhotos.length > n) {
    const step = withPhotos.length / n;
    return Array.from({ length: n }, (_, i) => {
      const m = withPhotos[Math.floor(i * step)];
      return { meeting: m, name: photoFiles(m)[0] };
    });
  }
  const out: RecapPhoto[] = [];
  for (let round = 0; out.length < n; round++) {
    let added = false;
    for (const m of withPhotos) {
      const name = photoFiles(m)[round];
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
