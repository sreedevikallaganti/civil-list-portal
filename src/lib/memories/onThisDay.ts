import {
  daysBetween,
  isCancelled,
  meetingDay,
  startOfToday,
  type MemoryMeeting,
} from "@/lib/memories/meetingUtils";

export type MemoryGroup = {
  yearsAgo: number;
  meetings: { meeting: MemoryMeeting; day: Date }[];
};

export type Memories = {
  /** "today" = same date in earlier years; "week" = within 3 days of it */
  mode: "today" | "week" | "none";
  groups: MemoryGroup[];
};

/**
 * "On this day" — meetings held on today's date in earlier years (like Google Photos).
 * If there are none, falls back to ±3 days so the card shows up more often.
 * Cancelled meetings are skipped. Runs on the meetings the dashboard already loaded.
 */
export function computeMemories(meetings: MemoryMeeting[], today: Date = startOfToday()): Memories {
  const exact: MemoryGroup["meetings"] = [];
  const near: MemoryGroup["meetings"] = [];

  for (const meeting of meetings) {
    if (isCancelled(meeting)) continue;
    const day = meetingDay(meeting);
    if (!day || daysBetween(day, today) < 300) continue; // ignore this year's meetings

    // distance to the "anniversary" in the nearest year
    const anniversary = new Date(today.getFullYear(), day.getMonth(), day.getDate());
    let gap = Math.abs(daysBetween(anniversary, today));
    gap = Math.min(gap, 365 - gap); // handles 30 Dec vs 2 Jan

    if (gap === 0) exact.push({ meeting, day });
    else if (gap <= 3) near.push({ meeting, day });
  }

  const group = (list: MemoryGroup["meetings"]): MemoryGroup[] => {
    const map = new Map<number, MemoryGroup["meetings"]>();
    for (const item of list) {
      const yearsAgo = Math.round(daysBetween(item.day, today) / 365.25);
      map.set(yearsAgo, [...(map.get(yearsAgo) ?? []), item]);
    }
    return [...map.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([yearsAgo, items]) => ({
        yearsAgo,
        // meetings with photos first, so the card leads with a picture
        meetings: items.sort((a, b) => (b.meeting.photos?.length ?? 0) - (a.meeting.photos?.length ?? 0)),
      }));
  };

  if (exact.length) return { mode: "today", groups: group(exact) };
  if (near.length) return { mode: "week", groups: group(near) };
  return { mode: "none", groups: [] };
}
