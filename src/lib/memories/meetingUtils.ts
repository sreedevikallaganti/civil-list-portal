/**
 * Shared helpers for "On This Day", Yearly Recap and meeting photos.
 * Written for the existing `meetings` collection (title / officer_name / officer_type /
 * meeting_date / meeting_time / status / location …) — no schema changes except `photos`.
 */
import pb from "@/lib/pocketbase";

export type MemoryMeeting = {
  id: string;
  title?: string;
  meeting_title?: string;
  subject?: string;
  agenda?: string;
  description?: string;

  officer_name?: string;
  officer_type?: string;
  officer_id?: string;
  designation?: string;
  department?: string;

  meeting_date?: string;
  meeting_time?: string;
  status?: string;
  location?: string;
  meeting_place?: string;

  photos?: string[];

  collectionId?: string;
  collectionName?: string;
  created?: string;
  updated?: string;
};

/* ── Fields ─────────────────────────────────── */

export function meetingTitle(m: MemoryMeeting): string {
  return m.title || m.meeting_title || m.subject || m.agenda || "Untitled Meeting";
}

export function meetingPlace(m: MemoryMeeting): string {
  return (m.location || m.meeting_place || "").trim();
}

export function isCancelled(m: MemoryMeeting): boolean {
  const s = (m.status || "").toLowerCase();
  return s.includes("cancel") || s.includes("rejected");
}

/** "IAS" | "IPS" | "" — read from officer_type */
export function officerService(m: MemoryMeeting): "IAS" | "IPS" | "" {
  const t = (m.officer_type || "").toUpperCase();
  if (t.includes("IAS")) return "IAS";
  if (t.includes("IPS")) return "IPS";
  return "";
}

/** Stable key for "the same officer" across meetings. */
export function officerKey(m: MemoryMeeting): string {
  return (m.officer_id || m.officer_name || "").trim().toLowerCase();
}

/* ── Dates ───────────────────────────────────── */

/**
 * Calendar day of a meeting as a local Date (midnight), or null.
 * Accepts the same formats the dashboard accepts: "24/09/2025", "24-09-2025",
 * "2025-09-24" and PocketBase datetimes ("2025-09-24 00:00:00.000Z").
 */
export function meetingDay(m: MemoryMeeting): Date | null {
  const v = (m.meeting_date || "").trim();
  if (!v) return null;

  const indian = v.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (indian) return new Date(+indian[3], +indian[2] - 1, +indian[1]);

  const dateOnly = v.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (dateOnly) return new Date(+dateOnly[1], +dateOnly[2] - 1, +dateOnly[3]);

  // full datetime — read it in local time, like the dashboard does
  const d = new Date(v.includes(" ") && !v.includes("T") ? v.replace(" ", "T") : v);
  if (Number.isNaN(d.getTime())) return null;
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function startOfToday(): Date {
  const n = new Date();
  return new Date(n.getFullYear(), n.getMonth(), n.getDate());
}

export function daysBetween(a: Date, b: Date): number {
  return Math.round(
    (Date.UTC(b.getFullYear(), b.getMonth(), b.getDate()) -
      Date.UTC(a.getFullYear(), a.getMonth(), a.getDate())) /
      86_400_000
  );
}

export function formatDayLong(d: Date): string {
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });
}

export function formatTime(value?: string): string {
  if (!value) return "";
  const m = value.match(/(\d{1,2}):(\d{2})(?:\s*(AM|PM))?/i);
  if (!m) return value;
  let h = +m[1];
  const mer = m[3]?.toUpperCase();
  if (mer === "PM" && h < 12) h += 12;
  if (mer === "AM" && h === 12) h = 0;
  return `${h % 12 || 12}:${m[2]} ${h >= 12 ? "PM" : "AM"}`;
}

/* ── Photos ──────────────────────────────────── */

const PB_URL = (process.env.NEXT_PUBLIC_POCKETBASE_URL || "").replace(/\/+$/, "");

/**
 * URL of a meeting photo. thumb: "400x400" (grid) or "1200x0" (full view).
 * Built by hand so it works with any version of the PocketBase JS SDK.
 */
export function photoUrl(m: MemoryMeeting, filename: string, thumb?: "400x400" | "1200x0"): string {
  const collection = m.collectionId || m.collectionName || "meetings";
  const url = `${PB_URL}/api/files/${collection}/${m.id}/${encodeURIComponent(filename)}`;
  return thumb ? `${url}?thumb=${thumb}` : url;
}

/** Logged-in user's display name (works with old and new SDK versions). */
export function currentUserName(fallback = "Admin"): string {
  const store = pb.authStore as unknown as {
    record?: { name?: string; email?: string } | null;
    model?: { name?: string; email?: string } | null;
  };
  const r = store.record ?? store.model;
  const n = r?.name || r?.email?.split("@")[0];
  return n ? n.charAt(0).toUpperCase() + n.slice(1) : fallback;
}

/** Loads every meeting (same data the dashboard shows). */
export async function fetchAllMeetings(): Promise<MemoryMeeting[]> {
  return pb.collection("meetings").getFullList<MemoryMeeting>({ batch: 500 });
}