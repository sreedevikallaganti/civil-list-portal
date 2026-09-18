"use client";

import {
  AlignLeft,
  ArrowRight,
  BarChart3,
  Briefcase,
  Calendar,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Clock3,
  Edit2,
  FileText,
  MapPin,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Tag,
  Trash2,
  TrendingUp,
  User,
  Users,
  X,
  XCircle,
} from "lucide-react";
import pb from "@/lib/pocketbase";
import CreateMeetingPanel from "@/components/CreateMeetingPanel";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { useRouter } from "next/navigation";

/* ────────────────────────────────────────────────
   Types
──────────────────────────────────────────────── */

type Meeting = {
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
  duration?: string | number;

  status?: string;
  priority?: string;
  meeting_type?: string;
  location?: string;
  meeting_place?: string;

  collectionId?: string;
  collectionName?: string;
  created?: string;
  updated?: string;
  created_date?: string;
};

type PocketBaseResponse<T> = {
  page: number;
  perPage: number;
  totalItems: number;
  totalPages: number;
  items: T[];
};

type DashboardStats = {
  totalMeetings: number;
  scheduled: number;
  completed: number;
  rescheduled: number;
  cancelled: number;
  completionRate: number;
};

type ActivityRange = "week" | "month";

type ActivityBucket = {
  key: string;
  shortLabel: string;
  fullLabel: string;
  scheduled: number;
  completed: number;
  cancelled: number;
  total: number;
};

type KpiAccent = "blue" | "violet" | "rose" | "emerald";

/* ────────────────────────────────────────────────
   Constants
──────────────────────────────────────────────── */

const PB_URL = process.env.NEXT_PUBLIC_POCKETBASE_URL;
const UPCOMING_PAGE_SIZE = 5;

const STATUS_STYLES: Record<string, { label: string; dot: string; badge: string }> = {
  scheduled:   { label: "Scheduled",   dot: "bg-violet-400",  badge: "bg-violet-50 text-violet-700 ring-1 ring-inset ring-violet-600/20" },
  completed:   { label: "Completed",   dot: "bg-emerald-400", badge: "bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-600/20" },
  rescheduled: { label: "Rescheduled", dot: "bg-amber-400",   badge: "bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-600/20" },
  cancelled:   { label: "Cancelled",   dot: "bg-rose-400",    badge: "bg-rose-50 text-rose-700 ring-1 ring-inset ring-rose-600/20" },
  rejected:    { label: "Rejected",    dot: "bg-rose-400",    badge: "bg-rose-50 text-rose-700 ring-1 ring-inset ring-rose-600/20" },
};

/* Pastel KPI cards — reference style: blue / lavender / peach / green */
const KPI_THEME: Record<KpiAccent, { card: string; icon: string; trend: string }> = {
  blue:    { card: "bg-gradient-to-br from-sky-100 to-blue-100",      icon: "text-blue-600",    trend: "text-blue-700" },
  violet:  { card: "bg-gradient-to-br from-violet-100 to-purple-100", icon: "text-violet-600",  trend: "text-violet-700" },
  rose:    { card: "bg-gradient-to-br from-orange-100 to-rose-100",   icon: "text-rose-600",    trend: "text-rose-700" },
  emerald: { card: "bg-gradient-to-br from-emerald-100 to-green-100", icon: "text-emerald-600", trend: "text-emerald-700" },
};

/* ────────────────────────────────────────────────
   Helpers
──────────────────────────────────────────────── */

function getMeetingTitle(meeting: Meeting): string {
  return (
    meeting.title ||
    meeting.meeting_title ||
    meeting.subject ||
    meeting.agenda ||
    "Untitled Meeting"
  );
}

function getMeetingStatus(meeting: Meeting): string {
  return (meeting.status || "scheduled").toLowerCase().trim();
}

const getStatusKey = (meeting: Meeting): string =>
  (meeting.status || "scheduled").toLowerCase();

const getStatusStyle = (key: string) =>
  STATUS_STYLES[key] || {
    label: key.replace(/\b\w/g, (c) => c.toUpperCase()),
    dot: "bg-gray-400",
    badge: "bg-gray-100 text-gray-600 ring-1 ring-inset ring-gray-500/20",
  };

const formatTimeDisplay = (timeString: string): string => {
  if (!timeString || !timeString.includes(":")) return "—";
  const [hours, minutes] = timeString.split(":");
  const hour = parseInt(hours, 10);
  const modifier = hour >= 12 ? "PM" : "AM";
  return `${hour % 12 || 12}:${minutes} ${modifier}`;
};

const formatDate = (dateString?: string | null) => {
  if (!dateString) return null;
  try {
    const date = new Date(dateString);
    return {
      day: date.getDate(),
      month: date.toLocaleString("default", { month: "short" }),
      year: date.getFullYear(),
      weekday: date.toLocaleDateString("en-US", { weekday: "long" }),
      full: date.toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" }),
    };
  } catch {
    return null;
  }
};

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function formatShortDate(date: Date): string {
  return date.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

function getRelativeDayLabel(date: Date): string {
  const diffDays = Math.round(
    (startOfDay(date).getTime() - startOfDay(new Date()).getTime()) / 86_400_000
  );
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Tomorrow";
  if (diffDays > 1 && diffDays <= 7) return `In ${diffDays} days`;
  return "";
}

function getTimeUntilLabel(date: Date): string {
  const diffMs = date.getTime() - Date.now();
  if (diffMs <= 0) return "starting soon";

  const totalMinutes = Math.max(1, Math.floor(diffMs / 60_000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours > 0) return minutes > 0 ? `in ${hours}h ${minutes}m` : `in ${hours}h`;
  return `in ${totalMinutes}m`;
}

/**
 * Converts different possible date formats into a Date.
 * Supported: 2026-09-03 | 2026-09-03T10:30:00 | 03/09/2026 | 03-09-2026
 */
function parseMeetingDate(dateValue?: string, timeValue?: string): Date | null {
  if (!dateValue) return null;

  const dateString = dateValue.trim();

  // DD/MM/YYYY or DD-MM-YYYY
  const indianDateMatch = dateString.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (indianDateMatch) {
    const day = Number(indianDateMatch[1]);
    const month = Number(indianDateMatch[2]) - 1;
    const year = Number(indianDateMatch[3]);

    let hours = 0;
    let minutes = 0;

    if (timeValue) {
      const timeMatch = timeValue.match(/(\d{1,2}):(\d{2})(?:\s*(AM|PM))?/i);
      if (timeMatch) {
        hours = Number(timeMatch[1]);
        minutes = Number(timeMatch[2]);
        const meridiem = timeMatch[3]?.toUpperCase();
        if (meridiem === "PM" && hours < 12) hours += 12;
        if (meridiem === "AM" && hours === 12) hours = 0;
      }
    }

    return new Date(year, month, day, hours, minutes);
  }

  // ISO date
  const parsed = new Date(dateString);
  if (Number.isNaN(parsed.getTime())) return null;

  if (/^\d{4}-\d{2}-\d{2}$/.test(dateString) && timeValue) {
    const timeMatch = timeValue.match(/(\d{1,2}):(\d{2})(?:\s*(AM|PM))?/i);
    if (timeMatch) {
      let hours = Number(timeMatch[1]);
      const minutes = Number(timeMatch[2]);
      const meridiem = timeMatch[3]?.toUpperCase();
      if (meridiem === "PM" && hours < 12) hours += 12;
      if (meridiem === "AM" && hours === 12) hours = 0;
      parsed.setHours(hours, minutes, 0, 0);
    }
  }

  return parsed;
}

function formatMeetingDate(dateValue?: string, timeValue?: string): string {
  const date = parseMeetingDate(dateValue, timeValue);
  if (!date) return "Date not available";
  return date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function formatMeetingTime(timeValue?: string): string {
  if (!timeValue) return "Time not available";

  const match = timeValue.match(/(\d{1,2}):(\d{2})(?:\s*(AM|PM))?/i);
  if (!match) return timeValue;

  let hours = Number(match[1]);
  const minutes = Number(match[2]);
  const meridiem = match[3]?.toUpperCase();

  if (!meridiem) {
    const date = new Date();
    date.setHours(hours, minutes, 0, 0);
    return date.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", hour12: true });
  }

  if (meridiem === "PM" && hours < 12) hours += 12;
  if (meridiem === "AM" && hours === 12) hours = 0;

  const date = new Date();
  date.setHours(hours, minutes, 0, 0);
  return date.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", hour12: true });
}

/** Sliding window of page numbers for pagination (max 5 visible). */
function getPageWindow(current: number, total: number, size = 5): number[] {
  if (total <= size) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }
  const start = Math.max(1, Math.min(current - Math.floor(size / 2), total - size + 1));
  const end = Math.min(total, start + size - 1);
  const pages: number[] = [];
  for (let i = start; i <= end; i += 1) pages.push(i);
  return pages;
}

/* ────────────────────────────────────────────────
   Meeting Activity data (built from PocketBase records)
──────────────────────────────────────────────── */

function buildActivityData(meetings: Meeting[], range: ActivityRange): ActivityBucket[] {
  const buckets: ActivityBucket[] = [];
  const now = new Date();

  if (range === "week") {
    for (let i = 6; i >= 0; i -= 1) {
      const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
      buckets.push({
        key: day.toDateString(),
        shortLabel: day.toLocaleDateString("en-US", { weekday: "short" }),
        fullLabel: day.toLocaleDateString("en-US", { weekday: "long", day: "numeric", month: "short" }),
        scheduled: 0,
        completed: 0,
        cancelled: 0,
        total: 0,
      });
    }
  } else {
    for (let i = 5; i >= 0; i -= 1) {
      const month = new Date(now.getFullYear(), now.getMonth() - i, 1);
      buckets.push({
        key: `${month.getFullYear()}-${month.getMonth()}`,
        shortLabel: month.toLocaleDateString("en-US", { month: "short" }),
        fullLabel: month.toLocaleDateString("en-US", { month: "long", year: "numeric" }),
        scheduled: 0,
        completed: 0,
        cancelled: 0,
        total: 0,
      });
    }
  }

  const bucketIndex = new Map(buckets.map((bucket, index) => [bucket.key, index]));

  meetings.forEach((meeting) => {
    const date = parseMeetingDate(meeting.meeting_date, meeting.meeting_time);
    if (!date) return;

    const key = range === "week" ? date.toDateString() : `${date.getFullYear()}-${date.getMonth()}`;
    const index = bucketIndex.get(key);
    if (index === undefined) return;

    const bucket = buckets[index];
    const status = getMeetingStatus(meeting);

    if (status.includes("completed") || status.includes("done")) bucket.completed += 1;
    else if (status.includes("cancelled") || status.includes("canceled")) bucket.cancelled += 1;
    else bucket.scheduled += 1;

    bucket.total += 1;
  });

  return buckets;
}

/* ────────────────────────────────────────────────
   PocketBase fetch
──────────────────────────────────────────────── */

async function fetchPocketBaseCollection<T>(
  collectionName: string
): Promise<PocketBaseResponse<T>> {
  if (!PB_URL) {
    throw new Error("NEXT_PUBLIC_POCKETBASE_URL is missing from .env.local");
  }

  const url = `${PB_URL}/api/collections/${collectionName}/records?page=1&perPage=500`;

  console.log(`[Dashboard] Fetching ${collectionName}:`, url);

  const response = await fetch(url, { method: "GET", cache: "no-store" });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`${collectionName} API failed: ${response.status} ${errorText}`);
  }

  return (await response.json()) as PocketBaseResponse<T>;
}

/* ────────────────────────────────────────────────
   Presentational components
──────────────────────────────────────────────── */

function StatCard({
  icon,
  label,
  value,
  sub,
  accent,
  loading = false,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  value: number | string;
  sub?: string;
  accent: KpiAccent;
  loading?: boolean;
  onClick?: () => void;
}) {
  const theme = KPI_THEME[accent];

  return (
    <button
      type="button"
      onClick={onClick}
      className={`group relative w-full overflow-hidden rounded-3xl p-5 text-left transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-slate-900/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900/20 ${theme.card}`}
    >
      <span
        aria-hidden
        className="pointer-events-none absolute -right-6 -top-6 h-20 w-20 rounded-full bg-white/50 transition-transform duration-300 group-hover:scale-125"
      />

      <div className="relative flex items-start justify-between gap-3">
        <p className="pt-1.5 text-sm font-semibold text-slate-600">{label}</p>
        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/80 shadow-sm ${theme.icon}`}>
          {icon}
        </span>
      </div>

      <div className="relative mt-3">
        {loading ? (
          <div className="h-9 w-20 animate-pulse rounded-xl bg-white/70" />
        ) : (
          <p className="text-[2rem] font-extrabold leading-none tracking-tight text-slate-900">{value}</p>
        )}

        {!loading && sub && (
          <p className={`mt-2.5 inline-flex items-center gap-1 text-xs font-semibold ${theme.trend}`}>
            <TrendingUp className="h-3.5 w-3.5" />
            {sub}
          </p>
        )}
      </div>
    </button>
  );
}

function LoadingRows({ count = 4 }: { count?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: count }).map((_, index) => (
        <div key={index} className="flex items-center gap-4 rounded-2xl border border-slate-100 p-4">
          <div className="hidden h-12 w-12 animate-pulse rounded-2xl bg-slate-100 sm:block" />
          <div className="flex-1 space-y-2">
            <div className="h-4 w-2/5 animate-pulse rounded-full bg-slate-100" />
            <div className="h-3 w-3/5 animate-pulse rounded-full bg-slate-100" />
            <div className="h-3 w-1/4 animate-pulse rounded-full bg-slate-100" />
          </div>
          <div className="hidden h-6 w-16 animate-pulse rounded-full bg-slate-100 md:block" />
        </div>
      ))}
    </div>
  );
}

function EmptyMeetings({
  isFiltered,
  onClearSearch,
  onCreate,
}: {
  isFiltered: boolean;
  onClearSearch: () => void;
  onCreate: () => void;
}) {
  if (isFiltered) {
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-violet-200 bg-violet-50/40 px-6 py-8 text-center">
        <div className="flex h-11 w-11 items-center justify-center rounded-full bg-white shadow-sm">
          <Search className="h-5 w-5 text-violet-400" />
        </div>
        <p className="mt-3 text-sm font-semibold text-slate-700">No matching meetings</p>
        <p className="mt-1 text-xs text-slate-500">
          No upcoming meetings match your search. Try a different term.
        </p>
        <button
          type="button"
          onClick={onClearSearch}
          className="mt-4 rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-600 transition-colors hover:border-violet-200 hover:text-violet-600"
        >
          Clear search
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-violet-200 bg-violet-50/40 px-6 py-8 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white shadow-sm">
        <CalendarDays className="h-6 w-6 text-violet-500" />
      </div>
      <p className="mt-3 text-sm font-semibold text-slate-700">No upcoming meetings</p>
      <p className="mt-1 max-w-xs text-xs leading-relaxed text-slate-500">
        All caught up — schedule a meeting to keep your calendar moving.
      </p>
      <button
        type="button"
        onClick={onCreate}
        className="mt-4 inline-flex items-center gap-2 rounded-full bg-slate-900 px-4 py-2.5 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-slate-800"
      >
        <Plus className="h-4 w-4" />
        New Meeting
      </button>
    </div>
  );
}

/* ── Compact meeting row ── */

function UpcomingMeetingRow({
  meeting,
  onOpen,
}: {
  meeting: Meeting;
  onOpen: (meeting: Meeting) => void;
}) {
  const meetingDate = parseMeetingDate(meeting.meeting_date, meeting.meeting_time);
  const statusStyle = getStatusStyle(getMeetingStatus(meeting));
  const isToday = meetingDate
    ? meetingDate.toDateString() === new Date().toDateString()
    : false;
  const relativeLabel = meetingDate ? getRelativeDayLabel(meetingDate) : "";

  return (
    <li>
      <button
        type="button"
        onClick={() => onOpen(meeting)}
        className="group flex w-full items-center gap-3.5 rounded-2xl border border-slate-100 bg-white p-3.5 text-left transition-all duration-200 hover:border-violet-200 hover:bg-violet-50/40 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/30"
      >
        <div
          className={`hidden h-12 w-12 shrink-0 flex-col items-center justify-center rounded-2xl sm:flex ${
            isToday ? "bg-slate-900 text-white shadow-sm" : "bg-violet-50 text-violet-900"
          }`}
        >
          <span className="text-[9px] font-bold uppercase tracking-wide">
            {meetingDate ? meetingDate.toLocaleDateString("en-IN", { month: "short" }) : "---"}
          </span>
          <span className="text-lg font-bold leading-tight">
            {meetingDate ? meetingDate.getDate() : "--"}
          </span>
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="truncate text-sm font-semibold text-slate-900 group-hover:text-violet-700">
              {getMeetingTitle(meeting)}
            </h4>
            {isToday && (
              <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-violet-700">
                Today
              </span>
            )}
            {!isToday && relativeLabel && (
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                {relativeLabel}
              </span>
            )}
          </div>

          <div className="mt-1 flex flex-wrap gap-x-3.5 gap-y-0.5 text-xs text-slate-500">
            <span className="flex items-center gap-1">
              <CalendarDays className="h-3.5 w-3.5 text-slate-400" />
              {formatMeetingDate(meeting.meeting_date, meeting.meeting_time)}
            </span>
            <span className="flex items-center gap-1">
              <Clock3 className="h-3.5 w-3.5 text-slate-400" />
              {formatMeetingTime(meeting.meeting_time)}
            </span>
            {meeting.officer_name && (
              <span className="hidden truncate items-center gap-1 lg:flex">
                <User className="h-3.5 w-3.5 text-slate-400" />
                {meeting.officer_name}
              </span>
            )}
          </div>
        </div>

        <span
          className={`hidden shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold md:inline-flex ${statusStyle.badge}`}
        >
          {statusStyle.label}
        </span>

        <ChevronRight className="h-5 w-5 shrink-0 text-slate-300 transition-all duration-200 group-hover:translate-x-0.5 group-hover:text-violet-500" />
      </button>
    </li>
  );
}

/* ── Pagination footer for the upcoming list ── */

function UpcomingPagination({
  currentPage,
  totalPages,
  totalItems,
  rangeStart,
  rangeEnd,
  onPageChange,
}: {
  currentPage: number;
  totalPages: number;
  totalItems: number;
  rangeStart: number;
  rangeEnd: number;
  onPageChange: (page: number) => void;
}) {
  const pageWindow = getPageWindow(currentPage, totalPages, 5);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-5 py-3">
      <p className="text-xs text-slate-500">
        Showing{" "}
        <span className="font-semibold text-slate-700">
          {totalItems === 0 ? 0 : rangeStart}–{rangeEnd}
        </span>{" "}
        of <span className="font-semibold text-slate-700">{totalItems}</span>{" "}
        {totalItems === 1 ? "meeting" : "meetings"}
      </p>

      {totalPages > 1 && (
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => onPageChange(currentPage - 1)}
            disabled={currentPage <= 1}
            aria-label="Previous page"
            className="flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 text-slate-500 transition-colors hover:border-violet-300 hover:text-violet-600 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-slate-200 disabled:hover:text-slate-500"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>

          {pageWindow.map((page) => (
            <button
              key={page}
              type="button"
              onClick={() => onPageChange(page)}
              aria-current={page === currentPage ? "page" : undefined}
              className={`h-8 min-w-[2rem] rounded-full px-2 text-xs font-semibold transition-colors ${
                page === currentPage
                  ? "bg-slate-900 text-white shadow-sm"
                  : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              {page}
            </button>
          ))}

          <button
            type="button"
            onClick={() => onPageChange(currentPage + 1)}
            disabled={currentPage >= totalPages}
            aria-label="Next page"
            className="flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 text-slate-500 transition-colors hover:border-violet-300 hover:text-violet-600 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-slate-200 disabled:hover:text-slate-500"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
}

function TooltipRow({ label, value, dotClass }: { label: string; value: number; dotClass: string }) {
  return (
    <p className="flex items-center justify-between text-[11px]">
      <span className="flex items-center gap-1.5 text-slate-300">
        <span className={`h-1.5 w-1.5 rounded-full ${dotClass}`} />
        {label}
      </span>
      <span className="font-semibold text-white">{value}</span>
    </p>
  );
}

function ActivityChart({ data, range }: { data: ActivityBucket[]; range: ActivityRange }) {
  const maxTotal = Math.max(...data.map((bucket) => bucket.total), 1);
  const totalInPeriod = data.reduce((sum, bucket) => sum + bucket.total, 0);
  const todayKey =
    range === "week"
      ? new Date().toDateString()
      : `${new Date().getFullYear()}-${new Date().getMonth()}`;

  return (
    <div className="relative">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-44" aria-hidden>
        {[0, 25, 50, 75, 100].map((pos) => (
          <div
            key={pos}
            className="absolute inset-x-0 border-t border-dashed border-slate-200/80"
            style={{ top: `${pos}%` }}
          />
        ))}
      </div>

      <div
        className="relative flex h-44 gap-1.5 sm:gap-3"
        role="img"
        aria-label={`Meeting activity chart showing ${totalInPeriod} meetings in the selected period`}
      >
        {data.map((bucket) => {
          const barHeight = bucket.total > 0 ? Math.max((bucket.total / maxTotal) * 100, 8) : 0;

          return (
            <div
              key={bucket.key}
              className="group relative flex h-full flex-1 cursor-default flex-col justify-end"
            >
              <div
                className="pointer-events-none absolute left-1/2 z-20 hidden w-36 -translate-x-1/2 rounded-2xl bg-slate-900/95 p-3 text-left shadow-xl group-hover:block sm:w-40"
                style={{ bottom: `calc(${barHeight}% + 10px)` }}
              >
                <p className="text-xs font-semibold text-white">{bucket.fullLabel}</p>
                <div className="mt-2 space-y-1">
                  <TooltipRow label="Scheduled" value={bucket.scheduled} dotClass="bg-violet-400" />
                  <TooltipRow label="Completed" value={bucket.completed} dotClass="bg-emerald-400" />
                  <TooltipRow label="Cancelled" value={bucket.cancelled} dotClass="bg-slate-400" />
                </div>
                <div className="mt-2 flex items-center justify-between border-t border-white/10 pt-1.5">
                  <span className="text-[11px] text-slate-400">Total</span>
                  <span className="text-[11px] font-bold text-white">{bucket.total}</span>
                </div>
              </div>

              <div
                className="flex w-full flex-col justify-end overflow-hidden rounded-t-xl transition-all duration-300"
                style={{ height: `${barHeight}%` }}
              >
                {bucket.cancelled > 0 && (
                  <div
                    className="w-full bg-slate-300"
                    style={{ height: `${(bucket.cancelled / bucket.total) * 100}%` }}
                  />
                )}
                {bucket.completed > 0 && (
                  <div
                    className="w-full bg-emerald-500"
                    style={{ height: `${(bucket.completed / bucket.total) * 100}%` }}
                  />
                )}
                {bucket.scheduled > 0 && (
                  <div
                    className="w-full bg-violet-500"
                    style={{ height: `${(bucket.scheduled / bucket.total) * 100}%` }}
                  />
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-2 flex gap-1.5 sm:gap-3">
        {data.map((bucket) => (
          <div key={bucket.key} className="flex-1 text-center">
            <span
              className={`text-xs ${
                bucket.key === todayKey ? "font-bold text-violet-600" : "font-medium text-slate-500"
              }`}
            >
              {bucket.shortLabel}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ChartSkeleton() {
  return (
    <div aria-hidden>
      <div className="flex h-44 gap-1.5 sm:gap-3">
        {[75, 40, 90, 55, 30, 65, 45].map((height, index) => (
          <div key={index} className="flex h-full flex-1 flex-col justify-end">
            <div
              className="w-full animate-pulse rounded-t-xl bg-slate-100"
              style={{ height: `${height}%` }}
            />
          </div>
        ))}
      </div>
      <div className="mt-2 flex gap-1.5 sm:gap-3">
        {Array.from({ length: 7 }).map((_, index) => (
          <div key={index} className="h-3 flex-1 animate-pulse rounded-full bg-slate-100" />
        ))}
      </div>
    </div>
  );
}

function ActivityEmpty({ range }: { range: ActivityRange }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-6 py-10 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white shadow-sm">
        <BarChart3 className="h-6 w-6 text-slate-400" />
      </div>
      <p className="mt-3 text-sm font-semibold text-slate-700">No meeting activity in this period</p>
      <p className="mt-1 max-w-xs text-xs leading-relaxed text-slate-500">
        {range === "week"
          ? "No meetings were recorded in the last 7 days."
          : "No meetings were recorded in the last 6 months."}{" "}
        Try a different range or schedule a new meeting.
      </p>
    </div>
  );
}

function LegendDot({ label, dotClass }: { label: string; dotClass: string }) {
  return (
    <span className="flex items-center gap-1.5 text-xs font-medium text-slate-500">
      <span className={`h-2 w-2 rounded-full ${dotClass}`} />
      {label}
    </span>
  );
}

function SummaryStat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-2xl bg-slate-50/80 px-3.5 py-3">
      <p className="text-lg font-extrabold leading-none text-slate-900">{value}</p>
      <p className="mt-1 text-[11px] font-medium text-slate-400">{label}</p>
    </div>
  );
}

function StatusRow({
  icon,
  iconClass,
  label,
  value,
  total,
  loading,
}: {
  icon: ReactNode;
  iconClass: string;
  label: string;
  value: number;
  total: number;
  loading: boolean;
}) {
  const percent = total > 0 ? Math.round((value / total) * 100) : 0;

  return (
    <div className="flex items-center gap-3 rounded-2xl p-2 transition-colors hover:bg-slate-50">
      <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${iconClass}`}>
        {icon}
      </span>
      <p className="flex-1 truncate text-sm font-medium text-slate-600">{label}</p>
      {loading ? (
        <div className="h-5 w-8 animate-pulse rounded-full bg-slate-100" />
      ) : (
        <>
          <p className="text-sm font-bold text-slate-900">{value}</p>
          <p className="w-9 text-right text-xs text-slate-400">{percent}%</p>
        </>
      )}
    </div>
  );
}

function QuickActionButton({
  icon,
  label,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex w-full items-center justify-between rounded-2xl border border-slate-200 bg-white px-4 py-3 text-left text-xs font-semibold text-slate-600 transition-all hover:-translate-y-0.5 hover:border-violet-200 hover:bg-violet-50/60 hover:text-violet-700"
    >
      <span className="flex items-center gap-2.5">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-50 text-slate-400 transition-colors group-hover:bg-white group-hover:text-violet-600">
          {icon}
        </span>
        {label}
      </span>
      <ArrowRight className="h-3.5 w-3.5 text-slate-300 transition-all group-hover:translate-x-0.5 group-hover:text-violet-500" />
    </button>
  );
}

/* ── Off-canvas details panel ── */

function MeetingDetailsPanel({
  meeting,
  onClose,
  onEdit,
  onDeleteRequest,
}: {
  meeting: Meeting;
  onClose: () => void;
  onEdit: (meeting: Meeting) => void;
  onDeleteRequest: () => void;
}) {
  const dateInfo = formatDate(meeting.meeting_date || meeting.created_date);
  const time = meeting.meeting_time || "";
  const style = getStatusStyle(getStatusKey(meeting));
  const title = getMeetingTitle(meeting);
  const officerInitials = meeting.officer_name
    ? meeting.officer_name
        .split(" ")
        .map((word) => word.charAt(0))
        .slice(0, 2)
        .join("")
        .toUpperCase()
    : "";
  const priorityColor =
    (
      {
        high: "text-red-600",
        medium: "text-amber-600",
        low: "text-emerald-600",
      } as Record<string, string>
    )[(meeting.priority || "").toLowerCase()] || "text-slate-900";

  return (
    <>
      <div
        className="fixed inset-0 z-40 animate-in fade-in bg-slate-900/50 backdrop-blur-sm duration-300"
        onClick={onClose}
      />

      <div className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col bg-white shadow-2xl animate-in slide-in-from-right duration-300">
        {/* Gradient header */}
        <div className="relative flex-shrink-0 overflow-hidden bg-gradient-to-br from-slate-900 via-slate-900 to-violet-900 px-6 pb-5 pt-6">
          <div className="absolute -right-20 -top-20 h-56 w-56 rounded-full bg-violet-500/25 blur-3xl" />
          <div className="absolute -bottom-24 -left-16 h-48 w-48 rounded-full bg-indigo-400/10 blur-3xl" />

          <div className="relative">
            <div className="flex items-start justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-2.5 py-1 text-[11px] font-semibold text-white ring-1 ring-inset ring-white/20">
                  <span className={`h-1.5 w-1.5 rounded-full ${style.dot}`} />
                  {style.label}
                </span>
                {meeting.meeting_type && (
                  <span className="inline-flex rounded-full bg-white/10 px-2.5 py-1 text-[11px] font-semibold capitalize text-white/70 ring-1 ring-inset ring-white/15">
                    {meeting.meeting_type}
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={onClose}
                className="-mr-2 -mt-1 rounded-lg p-2 text-slate-400 transition-colors hover:bg-white/10 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <h2 className="mt-3 line-clamp-3 text-xl font-bold leading-snug text-white">{title}</h2>

            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm text-slate-300">
              <span className="flex items-center gap-1.5">
                <Calendar className="h-4 w-4 text-slate-400" />
                {dateInfo ? `${dateInfo.weekday}, ${dateInfo.full}` : "—"}
              </span>
              <span className="flex items-center gap-1.5">
                <Clock className="h-4 w-4 text-slate-400" />
                {formatTimeDisplay(time)}
              </span>
            </div>
          </div>
        </div>

        {/* Scrollable body */}
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto bg-slate-50 p-5">
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-2xl border border-slate-200/80 bg-white p-4">
              <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                <Calendar className="h-3.5 w-3.5 text-violet-500" /> Date
              </p>
              <p className="mt-1.5 text-sm font-semibold text-slate-900">{dateInfo?.full || "—"}</p>
            </div>
            <div className="rounded-2xl border border-slate-200/80 bg-white p-4">
              <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                <Clock className="h-3.5 w-3.5 text-violet-500" /> Time
              </p>
              <p className="mt-1.5 text-sm font-semibold text-slate-900">{formatTimeDisplay(time)}</p>
              {meeting.duration && (
                <p className="mt-0.5 text-xs text-slate-400">{meeting.duration} min</p>
              )}
            </div>
            <div className="rounded-2xl border border-slate-200/80 bg-white p-4">
              <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                <MapPin className="h-3.5 w-3.5 text-violet-500" /> Location
              </p>
              <p className="mt-1.5 truncate text-sm font-semibold text-slate-900">
                {meeting.location || meeting.meeting_place || "Not specified"}
              </p>
            </div>
            {meeting.meeting_type && (
              <div className="rounded-2xl border border-slate-200/80 bg-white p-4">
                <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  <Briefcase className="h-3.5 w-3.5 text-violet-500" /> Type
                </p>
                <p className="mt-1.5 text-sm font-semibold capitalize text-slate-900">
                  {meeting.meeting_type}
                </p>
              </div>
            )}
            {meeting.priority && (
              <div className="rounded-2xl border border-slate-200/80 bg-white p-4">
                <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  <Tag className="h-3.5 w-3.5 text-violet-500" /> Priority
                </p>
                <p className={`mt-1.5 text-sm font-semibold capitalize ${priorityColor}`}>
                  {meeting.priority}
                </p>
              </div>
            )}
          </div>

          {(meeting.officer_name || meeting.designation || meeting.officer_type) && (
            <div className="rounded-2xl border border-slate-200/80 bg-white p-4">
              <p className="mb-3 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                <User className="h-3.5 w-3.5 text-violet-500" /> Officer
              </p>
              <div className="flex items-center gap-3">
                {officerInitials && (
                  <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-indigo-600 text-sm font-bold text-white">
                    {officerInitials}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  {meeting.officer_name && (
                    <p className="truncate text-sm font-semibold text-slate-900">
                      {meeting.officer_name}
                    </p>
                  )}
                  {meeting.designation && (
                    <p className="truncate text-xs text-slate-500">{meeting.designation}</p>
                  )}
                </div>
                {meeting.officer_type && (
                  <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-violet-50 px-2.5 py-1 text-[11px] font-bold text-violet-700">
                    <ShieldCheck className="h-3 w-3" />
                    {meeting.officer_type}
                  </span>
                )}
              </div>
            </div>
          )}

          {meeting.agenda && (
            <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white">
              <div className="flex items-center gap-2 border-b border-slate-100 bg-slate-50 px-4 py-3">
                <AlignLeft className="h-4 w-4 text-violet-500" />
                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Agenda</p>
              </div>
              <p className="whitespace-pre-line px-4 py-3 text-sm leading-relaxed text-slate-600">
                {meeting.agenda}
              </p>
            </div>
          )}

          {meeting.description && (
            <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white">
              <div className="flex items-center gap-2 border-b border-slate-100 bg-slate-50 px-4 py-3">
                <FileText className="h-4 w-4 text-violet-500" />
                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  Description
                </p>
              </div>
              <p className="whitespace-pre-line px-4 py-3 text-sm leading-relaxed text-slate-600">
                {meeting.description}
              </p>
            </div>
          )}

          {(meeting.created || meeting.updated) && (
            <div className="flex items-center justify-between rounded-2xl border border-slate-200/80 bg-white px-4 py-3 text-[11px] text-slate-400">
              {meeting.created && (
                <span>
                  Created{" "}
                  {new Date(meeting.created).toLocaleDateString("en-IN", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })}
                </span>
              )}
              {meeting.updated && (
                <span>
                  Updated{" "}
                  {new Date(meeting.updated).toLocaleDateString("en-IN", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })}
                </span>
              )}
            </div>
          )}
        </div>

        {/* Footer actions */}
        <div className="flex flex-shrink-0 gap-3 border-t border-slate-200 bg-white p-4">
          <button
            type="button"
            onClick={() => onEdit(meeting)}
            className="flex flex-1 items-center justify-center gap-2 rounded-full bg-slate-900 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-slate-800"
          >
            <Edit2 className="h-4 w-4" />
            Edit Meeting
          </button>
          <button
            type="button"
            onClick={onDeleteRequest}
            className="flex items-center justify-center gap-2 rounded-full border border-rose-200 px-4 py-2.5 text-sm font-semibold text-rose-600 transition-colors hover:border-rose-300 hover:bg-rose-50"
          >
            <Trash2 className="h-4 w-4" />
            Delete
          </button>
        </div>
      </div>
    </>
  );
}

/* ────────────────────────────────────────────────
   Dashboard Page
──────────────────────────────────────────────── */

export default function DashboardPage() {
  const router = useRouter();

  /* ── Data state ── */
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [iasCount, setIasCount] = useState(0);
  const [ipsCount, setIpsCount] = useState(0);
  const [loadingMeetings, setLoadingMeetings] = useState(true);
  const [loadingOfficers, setLoadingOfficers] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");

  /* ── UI state ── */
  const [greeting, setGreeting] = useState("Welcome back");
  const [userName, setUserName] = useState("Admin");
  const [todayLabel, setTodayLabel] = useState("");
  const [activityRange, setActivityRange] = useState<ActivityRange>("week");
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);

  /* ── Upcoming meetings pagination ── */
  const [upcomingPage, setUpcomingPage] = useState(1);

  /* ── Off-canvas state ── */
  const [selectedMeeting, setSelectedMeeting] = useState<Meeting | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [editingMeeting, setEditingMeeting] = useState<Meeting | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  /* ────────────────────────────────
     Data loading (PocketBase)
  ──────────────────────────────── */

  const loadDashboardData = async (options?: { silent?: boolean }) => {
    const silent = options?.silent === true;

    try {
      if (!silent) {
        setError("");
        setLoadingMeetings(true);
        setLoadingOfficers(true);
      }

      console.log("[Dashboard] Starting PocketBase fetch...");

      const [meetingResult, iasResult, ipsResult] = await Promise.all([
        fetchPocketBaseCollection<Meeting>("meetings"),
        fetchPocketBaseCollection<Record<string, unknown>>("ias_officers"),
        fetchPocketBaseCollection<Record<string, unknown>>("ips_officers"),
      ]);

      setMeetings(meetingResult.items || []);
      setIasCount(iasResult.totalItems || 0);
      setIpsCount(ipsResult.totalItems || 0);
      setError("");

      console.log(
        `[Dashboard] Loaded ${meetingResult.items?.length ?? 0} meetings, ` +
          `IAS: ${iasResult.totalItems}, IPS: ${ipsResult.totalItems}`
      );
    } catch (err) {
      console.error("[Dashboard] Fetch error:", err);
      setError(err instanceof Error ? err.message : "Unable to fetch dashboard data.");
    } finally {
      setLoadingMeetings(false);
      setLoadingOfficers(false);
    }
  };

  useEffect(() => {
    loadDashboardData();
  }, []);

  /* Greeting / date / logged-in user (set after mount to avoid hydration mismatch) */
  useEffect(() => {
    const now = new Date();
    const hour = now.getHours();
    setGreeting(hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening");
    setTodayLabel(
      now.toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" })
    );

    const authModel: unknown = pb.authStore.model;
    const record = authModel as { name?: string; email?: string } | null;
    if (record?.name || record?.email) {
      const fallbackName = record.name || record.email?.split("@")[0] || "Admin";
      setUserName(fallbackName.charAt(0).toUpperCase() + fallbackName.slice(1));
    }
  }, []);

  /* ────────────────────────────────
     Create / Edit panel
  ──────────────────────────────── */

  const openCreatePanel = () => {
    setEditingMeeting(null);
    setPanelOpen(true);
  };

  const openEditPanel = (meeting: Meeting) => {
    setEditingMeeting(meeting);
    setPanelOpen(true);
  };

  const closePanel = () => {
    setPanelOpen(false);
    setEditingMeeting(null);
  };

  const handlePanelSuccess = () => {
    closePanel();
    loadDashboardData({ silent: true });
  };

  /* ────────────────────────────────
     Details off-canvas + delete
  ──────────────────────────────── */

  const openMeetingDetails = (meeting: Meeting) => setSelectedMeeting(meeting);
  const closeMeetingDetails = () => setSelectedMeeting(null);

  const openEditFromDetails = (meeting: Meeting) => {
    setSelectedMeeting(null);
    openEditPanel(meeting);
  };

  const confirmDelete = async () => {
    if (!selectedMeeting) return;
    try {
      await pb.collection("meetings").delete(selectedMeeting.id);
      setSelectedMeeting(null);
      setShowDeleteConfirm(false);
      loadDashboardData({ silent: true });
    } catch (err) {
      console.error("[Dashboard] Delete failed:", err);
      alert("Failed to delete meeting. Please try again.");
    }
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await loadDashboardData({ silent: true });
    } finally {
      setIsRefreshing(false);
    }
  };

  const goTo = (path: string) => {
    router.push(path);
  };

  /* ESC closes delete modal first, then the details off-canvas */
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape" || panelOpen) return;
      if (showDeleteConfirm) setShowDeleteConfirm(false);
      else setSelectedMeeting(null);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedMeeting, showDeleteConfirm, panelOpen]);

  /* ────────────────────────────────
     Derived data
  ──────────────────────────────── */

  const upcomingMeetings = useMemo(() => {
    const now = Date.now();

    return meetings
      .filter((meeting) => {
        const status = getMeetingStatus(meeting);
        if (
          status.includes("completed") ||
          status.includes("cancelled") ||
          status.includes("canceled")
        ) {
          return false;
        }

        const meetingDate = parseMeetingDate(meeting.meeting_date, meeting.meeting_time);
        if (!meetingDate) return false;

        return meetingDate.getTime() >= now;
      })
      .sort((a, b) => {
        const dateA =
          parseMeetingDate(a.meeting_date, a.meeting_time)?.getTime() ?? Number.POSITIVE_INFINITY;
        const dateB =
          parseMeetingDate(b.meeting_date, b.meeting_time)?.getTime() ?? Number.POSITIVE_INFINITY;
        return dateA - dateB;
      });
  }, [meetings]);

  /* Full filtered list (search applies across ALL upcoming meetings) */
  const filteredUpcomingMeetings = useMemo(() => {
    const searchValue = search.toLowerCase().trim();

    if (!searchValue) return upcomingMeetings;

    return upcomingMeetings.filter((meeting) => {
      const searchableText = [
        getMeetingTitle(meeting),
        meeting.officer_name || "",
        meeting.designation || "",
        meeting.department || "",
        meeting.officer_type || "",
      ]
        .join(" ")
        .toLowerCase();

      return searchableText.includes(searchValue);
    });
  }, [upcomingMeetings, search]);

  const upcomingTotalPages = Math.max(
    1,
    Math.ceil(filteredUpcomingMeetings.length / UPCOMING_PAGE_SIZE)
  );

  /* Clamp current page if data shrinks (e.g. after delete) */
  useEffect(() => {
    setUpcomingPage((prev) => Math.min(prev, Math.max(1, upcomingTotalPages)));
  }, [upcomingTotalPages]);

  /* Reset to page 1 whenever the search changes */
  useEffect(() => {
    setUpcomingPage(1);
  }, [search]);

  const upcomingCurrentPage = Math.min(upcomingPage, upcomingTotalPages);

  const paginatedUpcomingMeetings = useMemo(
    () =>
      filteredUpcomingMeetings.slice(
        (upcomingCurrentPage - 1) * UPCOMING_PAGE_SIZE,
        upcomingCurrentPage * UPCOMING_PAGE_SIZE
      ),
    [filteredUpcomingMeetings, upcomingCurrentPage]
  );

  const upcomingRangeStart =
    filteredUpcomingMeetings.length === 0
      ? 0
      : (upcomingCurrentPage - 1) * UPCOMING_PAGE_SIZE + 1;
  const upcomingRangeEnd =
    filteredUpcomingMeetings.length === 0
      ? 0
      : upcomingRangeStart + paginatedUpcomingMeetings.length - 1;

  /* ── Stats ── */
  const dashboardStats: DashboardStats = useMemo(() => {
    let scheduled = 0;
    let completed = 0;
    let rescheduled = 0;
    let cancelled = 0;

    meetings.forEach((meeting) => {
      const status = getMeetingStatus(meeting);
      if (status.includes("completed") || status.includes("done")) completed += 1;
      else if (status.includes("cancelled") || status.includes("canceled")) cancelled += 1;
      else if (status.includes("reschedule")) rescheduled += 1;
      else scheduled += 1;
    });

    const totalMeetings = meetings.length;
    const completionRate = totalMeetings > 0 ? Math.round((completed / totalMeetings) * 100) : 0;

    return { totalMeetings, scheduled, completed, rescheduled, cancelled, completionRate };
  }, [meetings]);

  const activityData = useMemo(
    () => buildActivityData(meetings, activityRange),
    [meetings, activityRange]
  );

  const activityTotals = useMemo(
    () =>
      activityData.reduce(
        (acc, bucket) => ({
          scheduled: acc.scheduled + bucket.scheduled,
          completed: acc.completed + bucket.completed,
          cancelled: acc.cancelled + bucket.cancelled,
          total: acc.total + bucket.total,
        }),
        { scheduled: 0, completed: 0, cancelled: 0, total: 0 }
      ),
    [activityData]
  );

  /* ────────────────────────────────
     Render
  ──────────────────────────────── */

  return (
    <ProtectedRoute>
      <div className="relative min-h-screen bg-gradient-to-br from-indigo-200 via-violet-100 to-purple-200">
        {/* Soft decorative blobs */}
        <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute -left-32 -top-32 h-96 w-96 rounded-full bg-violet-300/40 blur-3xl" />
          <div className="absolute -right-32 top-1/4 h-96 w-96 rounded-full bg-sky-300/30 blur-3xl" />
          <div className="absolute -bottom-32 left-1/3 h-96 w-96 rounded-full bg-fuchsia-300/25 blur-3xl" />
        </div>

        <div className="relative px-2.5 py-2.5 sm:px-5 sm:py-5 lg:px-8 lg:py-7">
          <div className="mx-auto max-w-[1500px] overflow-hidden rounded-[1.75rem] bg-white shadow-2xl shadow-violet-300/40 ring-1 ring-white/70">

            {/* ── App bar ── */}
            <div className="flex items-center justify-between gap-3 border-b border-slate-100 bg-white px-4 py-3.5 sm:px-6">
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-900 text-white shadow-sm">
                  <CalendarDays className="h-4 w-4" />
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-slate-900">Meeting Dashboard</p>
                  <p className="truncate text-[11px] text-slate-400">{todayLabel}</p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {/* Desktop search */}
                <div className="relative hidden md:block">
                  <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search meetings, officers…"
                    className="h-10 w-56 rounded-full border border-slate-200 bg-slate-50 pl-10 pr-4 text-sm text-slate-700 placeholder:text-slate-400 outline-none transition-all focus:border-violet-300 focus:bg-white focus:ring-4 focus:ring-violet-500/10 lg:w-72"
                  />
                </div>

                {/* Mobile search toggle */}
                <button
                  type="button"
                  onClick={() => setMobileSearchOpen((v) => !v)}
                  aria-label="Toggle search"
                  className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 transition-colors hover:border-violet-200 hover:text-violet-600 md:hidden"
                >
                  <Search className="h-4 w-4" />
                </button>

                {/* Refresh */}
                <button
                  type="button"
                  onClick={handleRefresh}
                  disabled={isRefreshing}
                  aria-label="Refresh data"
                  className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 transition-colors hover:border-violet-200 hover:text-violet-600 disabled:opacity-60"
                >
                  <RefreshCw className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`} />
                </button>

                {/* User chip */}
                <div className="flex items-center gap-2 rounded-full border border-slate-200 bg-white py-1 pl-1 pr-3">
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-indigo-600 text-[11px] font-bold text-white">
                    {userName.charAt(0).toUpperCase()}
                  </span>
                  <span className="hidden max-w-[120px] truncate text-xs font-semibold text-slate-700 sm:block">
                    {userName}
                  </span>
                </div>
              </div>
            </div>

            {/* Mobile search row */}
            {mobileSearchOpen && (
              <div className="border-b border-slate-100 bg-white px-4 py-3 md:hidden">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search meetings, officers…"
                    autoFocus
                    className="h-10 w-full rounded-full border border-slate-200 bg-slate-50 pl-11 pr-4 text-sm text-slate-700 placeholder:text-slate-400 outline-none focus:border-violet-300 focus:bg-white focus:ring-4 focus:ring-violet-500/10"
                  />
                </div>
              </div>
            )}

            {/* ── Content ── */}
            <div className="space-y-6 bg-[#f7f6fd] p-4 sm:p-6 lg:p-7">

              {/* Error banner */}
              {error && (
                <div className="flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3">
                  <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-500" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-rose-700">Something went wrong</p>
                    <p className="mt-0.5 break-words text-xs text-rose-600">{error}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => loadDashboardData({ silent: true })}
                    className="shrink-0 rounded-full bg-white px-3.5 py-1.5 text-xs font-semibold text-rose-600 ring-1 ring-rose-200 transition-colors hover:bg-rose-100"
                  >
                    Retry
                  </button>
                </div>
              )}

              {/* Greeting row */}
              <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                  <h1 className="text-[1.65rem] font-extrabold leading-tight tracking-tight text-slate-900 sm:text-3xl">
                    {greeting},{" "}
                    <span className="bg-gradient-to-r from-violet-600 to-indigo-600 bg-clip-text text-transparent">
                      {userName}
                    </span>
                  </h1>
                  <p className="mt-1 text-sm text-slate-500">
                    {todayLabel} — here&apos;s your meeting overview.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={openCreatePanel}
                  className="inline-flex items-center gap-2 rounded-full bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-slate-900/10 transition-all hover:-translate-y-0.5 hover:bg-slate-800"
                >
                  <Plus className="h-4 w-4" />
                  New Meeting
                </button>
              </div>

              {/* KPI cards */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <StatCard
                  accent="blue"
                  icon={<Briefcase className="h-5 w-5" />}
                  label="Total Meetings"
                  value={dashboardStats.totalMeetings}
                  sub={`${dashboardStats.completionRate}% completion rate`}
                  loading={loadingMeetings}
                  onClick={() => goTo("/meetings")}
                />
                <StatCard
                  accent="violet"
                  icon={<CalendarDays className="h-5 w-5" />}
                  label="Scheduled"
                  value={dashboardStats.scheduled}
                  sub={`${dashboardStats.rescheduled} rescheduled`}
                  loading={loadingMeetings}
                  onClick={() => goTo("/meetings")}
                />
                <StatCard
                  accent="emerald"
                  icon={<CheckCircle2 className="h-5 w-5" />}
                  label="Completed"
                  value={dashboardStats.completed}
                  sub={`${upcomingMeetings.length} upcoming`}
                  loading={loadingMeetings}
                  onClick={() => goTo("/meetings")}
                />
                <StatCard
                  accent="rose"
                  icon={<XCircle className="h-5 w-5" />}
                  label="Cancelled"
                  value={dashboardStats.cancelled}
                  sub={`${dashboardStats.totalMeetings} total meetings`}
                  loading={loadingMeetings}
                  onClick={() => goTo("/meetings")}
                />
              </div>

              {/* Main grid */}
              <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">

                {/* ── Left column ── */}
                <div className="space-y-5 xl:col-span-2">

                  {/* Activity chart */}
                  <section className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-100 sm:p-6">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <h3 className="text-base font-bold text-slate-900">Meeting Activity</h3>
                        <p className="mt-0.5 text-xs text-slate-400">
                          {activityRange === "week" ? "Last 7 days" : "Last 6 months"}
                        </p>
                      </div>

                      <div className="flex flex-wrap items-center gap-3">
                        <div className="hidden items-center gap-3 sm:flex">
                          <LegendDot label="Scheduled" dotClass="bg-violet-500" />
                          <LegendDot label="Completed" dotClass="bg-emerald-500" />
                          <LegendDot label="Cancelled" dotClass="bg-slate-300" />
                        </div>

                        {/* Week / Month pill toggle */}
                        <div className="flex items-center rounded-full bg-slate-100 p-1">
                          <button
                            type="button"
                            onClick={() => setActivityRange("week")}
                            aria-pressed={activityRange === "week"}
                            className={`rounded-full px-4 py-1.5 text-xs font-semibold transition-all duration-200 ${
                              activityRange === "week"
                                ? "bg-slate-900 text-white shadow-sm"
                                : "text-slate-500 hover:text-slate-800"
                            }`}
                          >
                            Week
                          </button>
                          <button
                            type="button"
                            onClick={() => setActivityRange("month")}
                            aria-pressed={activityRange === "month"}
                            className={`rounded-full px-4 py-1.5 text-xs font-semibold transition-all duration-200 ${
                              activityRange === "month"
                                ? "bg-slate-900 text-white shadow-sm"
                                : "text-slate-500 hover:text-slate-800"
                            }`}
                          >
                            Month
                          </button>
                        </div>
                      </div>
                    </div>

                    <div className="mt-6">
                      {loadingMeetings ? (
                        <ChartSkeleton />
                      ) : activityTotals.total === 0 ? (
                        <ActivityEmpty range={activityRange} />
                      ) : (
                        <ActivityChart data={activityData} range={activityRange} />
                      )}
                    </div>

                    <div className="mt-6 grid grid-cols-2 gap-3 border-t border-slate-100 pt-4 sm:grid-cols-4">
                      <SummaryStat label="Total meetings" value={activityTotals.total} />
                      <SummaryStat label="Scheduled" value={activityTotals.scheduled} />
                      <SummaryStat label="Completed" value={activityTotals.completed} />
                      <SummaryStat label="Cancelled" value={activityTotals.cancelled} />
                    </div>
                  </section>

                  {/* Upcoming meetings */}
                  <section className="overflow-hidden rounded-3xl bg-white shadow-sm ring-1 ring-slate-100">
                    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4 sm:px-6">
                      <div className="flex items-center gap-2.5">
                        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-50 text-violet-600">
                          <CalendarDays className="h-4 w-4" />
                        </span>
                        <div>
                          <h3 className="text-sm font-bold text-slate-900">Upcoming Meetings</h3>
                          <p className="text-[11px] text-slate-400">
                            {filteredUpcomingMeetings.length} scheduled ahead
                          </p>
                        </div>
                      </div>

                      {search.trim() && (
                        <button
                          type="button"
                          onClick={() => setSearch("")}
                          className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1.5 text-[11px] font-semibold text-slate-600 transition-colors hover:bg-slate-200"
                        >
                          <X className="h-3 w-3" />
                          Clear search
                        </button>
                      )}
                    </div>

                    <div className="p-4 sm:p-5">
                      {loadingMeetings ? (
                        <LoadingRows count={4} />
                      ) : paginatedUpcomingMeetings.length > 0 ? (
                        <ul className="space-y-2.5">
                          {paginatedUpcomingMeetings.map((meeting) => (
                            <UpcomingMeetingRow
                              key={meeting.id}
                              meeting={meeting}
                              onOpen={openMeetingDetails}
                            />
                          ))}
                        </ul>
                      ) : (
                        <EmptyMeetings
                          isFiltered={search.trim().length > 0}
                          onClearSearch={() => setSearch("")}
                          onCreate={openCreatePanel}
                        />
                      )}
                    </div>

                    <UpcomingPagination
                      currentPage={upcomingCurrentPage}
                      totalPages={upcomingTotalPages}
                      totalItems={filteredUpcomingMeetings.length}
                      rangeStart={upcomingRangeStart}
                      rangeEnd={upcomingRangeEnd}
                      onPageChange={setUpcomingPage}
                    />
                  </section>
                </div>

                {/* ── Right column ── */}
                <div className="space-y-5">

                  {/* Officers */}
                  <section className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-100">
                    <h3 className="flex items-center gap-2.5 text-sm font-bold text-slate-900">
                      <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
                        <Users className="h-4 w-4" />
                      </span>
                      Officers
                    </h3>

                    <div className="mt-4 space-y-3">
                      <button
                        type="button"
                        onClick={() => goTo("/officers/ias")}
                        className="group flex w-full items-center gap-3.5 rounded-2xl bg-violet-50/80 p-4 text-left ring-1 ring-violet-100 transition-all hover:-translate-y-0.5 hover:ring-violet-200"
                      >
                        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-violet-600 text-[11px] font-extrabold tracking-wide text-white shadow-sm">
                          IAS
                        </span>
                        <div className="min-w-0 flex-1">
                          {loadingOfficers ? (
                            <div className="h-7 w-12 animate-pulse rounded-lg bg-violet-100" />
                          ) : (
                            <p className="text-2xl font-extrabold leading-none text-slate-900">{iasCount}</p>
                          )}
                          <p className="mt-1 text-xs font-medium text-slate-500">IAS Officers</p>
                        </div>
                        <ArrowRight className="h-4 w-4 shrink-0 text-violet-300 transition-all group-hover:translate-x-0.5 group-hover:text-violet-600" />
                      </button>

                      <button
                        type="button"
                        onClick={() => goTo("/officers/ips")}
                        className="group flex w-full items-center gap-3.5 rounded-2xl bg-sky-50/80 p-4 text-left ring-1 ring-sky-100 transition-all hover:-translate-y-0.5 hover:ring-sky-200"
                      >
                        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-sky-600 text-[11px] font-extrabold tracking-wide text-white shadow-sm">
                          IPS
                        </span>
                        <div className="min-w-0 flex-1">
                          {loadingOfficers ? (
                            <div className="h-7 w-12 animate-pulse rounded-lg bg-sky-100" />
                          ) : (
                            <p className="text-2xl font-extrabold leading-none text-slate-900">{ipsCount}</p>
                          )}
                          <p className="mt-1 text-xs font-medium text-slate-500">IPS Officers</p>
                        </div>
                        <ArrowRight className="h-4 w-4 shrink-0 text-sky-300 transition-all group-hover:translate-x-0.5 group-hover:text-sky-600" />
                      </button>
                    </div>
                  </section>

                  {/* Status breakdown */}
                  <section className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-100">
                    <h3 className="flex items-center gap-2.5 text-sm font-bold text-slate-900">
                      <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-violet-50 text-violet-600">
                        <BarChart3 className="h-4 w-4" />
                      </span>
                      Meetings by Status
                    </h3>

                    <div className="mt-4 space-y-1">
                      <StatusRow
                        icon={<CalendarDays className="h-4 w-4" />}
                        iconClass="bg-violet-50 text-violet-600"
                        label="Scheduled"
                        value={dashboardStats.scheduled}
                        total={dashboardStats.totalMeetings}
                        loading={loadingMeetings}
                      />
                      <StatusRow
                        icon={<CheckCircle2 className="h-4 w-4" />}
                        iconClass="bg-emerald-50 text-emerald-600"
                        label="Completed"
                        value={dashboardStats.completed}
                        total={dashboardStats.totalMeetings}
                        loading={loadingMeetings}
                      />
                      <StatusRow
                        icon={<RefreshCw className="h-4 w-4" />}
                        iconClass="bg-amber-50 text-amber-600"
                        label="Rescheduled"
                        value={dashboardStats.rescheduled}
                        total={dashboardStats.totalMeetings}
                        loading={loadingMeetings}
                      />
                      <StatusRow
                        icon={<XCircle className="h-4 w-4" />}
                        iconClass="bg-rose-50 text-rose-600"
                        label="Cancelled"
                        value={dashboardStats.cancelled}
                        total={dashboardStats.totalMeetings}
                        loading={loadingMeetings}
                      />
                    </div>
                  </section>

                  {/* Quick actions */}
                  <section className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-100">
                    <h3 className="flex items-center gap-2.5 text-sm font-bold text-slate-900">
                      <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
                        <TrendingUp className="h-4 w-4" />
                      </span>
                      Quick Actions
                    </h3>

                    <div className="mt-4 space-y-2.5">
                      <QuickActionButton
                        icon={<Plus className="h-4 w-4" />}
                        label="Create new meeting"
                        onClick={openCreatePanel}
                      />
                      <QuickActionButton
                        icon={<CalendarDays className="h-4 w-4" />}
                        label="View all meetings"
                        onClick={() => goTo("/meetings")}
                      />
                      <QuickActionButton
                        icon={<Users className="h-4 w-4" />}
                        label="IAS officers"
                        onClick={() => goTo("/officers/ias")}
                      />
                      <QuickActionButton
                        icon={<Users className="h-4 w-4" />}
                        label="IPS officers"
                        onClick={() => goTo("/officers/ips")}
                      />
                    </div>
                  </section>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ── Create / Edit panel ── */}
        <CreateMeetingPanel
          isOpen={panelOpen}
          onClose={closePanel}
          onSuccess={handlePanelSuccess}
          editingMeeting={editingMeeting}
        />

        {/* ── Details off-canvas ── */}
        {selectedMeeting && (
          <MeetingDetailsPanel
            meeting={selectedMeeting}
            onClose={closeMeetingDetails}
            onEdit={openEditFromDetails}
            onDeleteRequest={() => setShowDeleteConfirm(true)}
          />
        )}

        {/* ── Delete confirmation modal ── */}
        {showDeleteConfirm && selectedMeeting && (
          <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
            <div
              className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm animate-in fade-in duration-200"
              onClick={() => setShowDeleteConfirm(false)}
            />
            <div className="relative w-full max-w-sm rounded-3xl bg-white p-6 shadow-2xl animate-in zoom-in-95 duration-200">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-rose-100">
                <Trash2 className="h-5 w-5 text-rose-600" />
              </div>
              <h3 className="mt-4 text-center text-lg font-bold text-slate-900">Delete meeting?</h3>
              <p className="mt-1.5 text-center text-sm leading-relaxed text-slate-500">
                &ldquo;{getMeetingTitle(selectedMeeting)}&rdquo; will be permanently removed. This
                action can&apos;t be undone.
              </p>
              <div className="mt-5 flex gap-3">
                <button
                  type="button"
                  onClick={() => setShowDeleteConfirm(false)}
                  className="flex-1 rounded-full border border-slate-200 py-2.5 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={confirmDelete}
                  className="flex-1 rounded-full bg-rose-600 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-rose-700"
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </ProtectedRoute>
  );
}