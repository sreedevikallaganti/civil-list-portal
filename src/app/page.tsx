"use client";

import {
  AlignLeft,
  ArrowRight,
  BarChart3,
  Briefcase,
  Building2,
  Calendar,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Clock3,
  Edit2,
  FileText,
  Mail,
  MapPin,
  Plus,
  RefreshCw,
  RotateCcw,
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
import UpdateMeetingPanel from "@/components/UpdateMeetingPanel";
import MeetingDetailsPanel from "@/components/MeetingDetailsPanel";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import OnThisDayCard from "@/components/memories/OnThisDayCard"; // NEW: On This Day
import RecapTeaserCard from "@/components/memories/RecapTeaserCard"; // NEW: Yearly Recap
import { Sparkles } from "lucide-react"; // NEW: icon for the Yearly Recap quick action
import { useEffect, useMemo, useRef, useState } from "react";
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
  email?: string;

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
};

/* v2: gradient-card KPI theme, matching the Meetings page's stat-card look */
const KPI_THEME: Record<KpiAccent, { card: string; icon: string; trend: string }> = {
  blue:    { card: "from-sky-100 to-blue-100",      icon: "bg-white text-sky-600",     trend: "text-sky-700" },
  violet:  { card: "from-violet-100 to-purple-100", icon: "bg-white text-violet-600",  trend: "text-violet-700" },
  rose:    { card: "from-rose-100 to-pink-100",     icon: "bg-white text-rose-600",    trend: "text-rose-700" },
  emerald: { card: "from-emerald-100 to-green-100", icon: "bg-white text-emerald-600", trend: "text-emerald-700" },
};

/* ────────────────────────────────────────────────
   Global CSS / Animations — mirrors the Meetings page
   (same keyframes, prefixed to avoid clashing with any
   class names that might already exist elsewhere).
──────────────────────────────────────────────── */

const CUSTOM_CSS = `
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');
.dash-root { font-family: 'Inter', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif; -webkit-font-smoothing: antialiased; text-rendering: optimizeLegibility; }
::selection { background: rgba(139, 92, 246, 0.18); }
@keyframes dFadeUp   { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: translateY(0); } }
@keyframes dFadeIn   { from { opacity: 0; } to { opacity: 1; } }
@keyframes dScaleIn  { from { opacity: 0; transform: scale(0.94) translateY(10px); } to { opacity: 1; transform: scale(1) translateY(0); } }
@keyframes dPanelIn  { from { opacity: 0; transform: translateX(64px); } to { opacity: 1; transform: translateX(0); } }
@keyframes dRowIn    { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
@keyframes dShimmer  { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }
@keyframes dBlob     { 0%, 100% { transform: translate(0, 0) scale(1); } 50% { transform: translate(14px, -18px) scale(1.07); } }
.anim-fade-up  { animation: dFadeUp 0.55s cubic-bezier(0.22, 1, 0.36, 1) both; }
.anim-fade-in  { animation: dFadeIn 0.4s ease both; }
.anim-scale-in { animation: dScaleIn 0.3s cubic-bezier(0.22, 1, 0.36, 1) both; }
.anim-panel    { animation: dPanelIn 0.38s cubic-bezier(0.22, 1, 0.36, 1) both; }
.anim-overlay  { animation: dFadeIn 0.25s ease both; }
.anim-row      { animation: dRowIn 0.4s cubic-bezier(0.22, 1, 0.36, 1) both; }
.anim-blob     { animation: dBlob 9s ease-in-out infinite; }
.skeleton { background: linear-gradient(90deg, #f1effc 25%, #e5e1f5 40%, #f1effc 55%); background-size: 200% 100%; animation: dShimmer 1.6s linear infinite; }
.nice-scroll::-webkit-scrollbar { width: 8px; }
.nice-scroll::-webkit-scrollbar-track { background: transparent; }
.nice-scroll::-webkit-scrollbar-thumb { background: #e2e8f0; border-radius: 999px; }
.nice-scroll::-webkit-scrollbar-thumb:hover { background: #cbd5e1; }
`;

function CustomStyles() {
  return <style dangerouslySetInnerHTML={{ __html: CUSTOM_CSS }} />;
}

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

function getRelativeDayLabel(date: Date): string {
  const diffDays = Math.round(
    (startOfDay(date).getTime() - startOfDay(new Date()).getTime()) / 86_400_000
  );
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Tomorrow";
  if (diffDays > 1 && diffDays <= 7) return `In ${diffDays} days`;
  return "";
}

function parseMeetingDate(dateValue?: string, timeValue?: string): Date | null {
  if (!dateValue) return null;

  const dateString = dateValue.trim();

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
   Meeting Activity data
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
   Animated count-up — same behavior as the Meetings page
──────────────────────────────────────────────── */

function AnimatedNumber({ value, duration = 900 }: { value: number; duration?: number }) {
  const [display, setDisplay] = useState(0);
  const prevRef = useRef(0);

  useEffect(() => {
    const from = prevRef.current;
    const to = value;
    if (from === to) return;
    let raf = 0;
    const start = performance.now();
    const step = (now: number) => {
      const p = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      const cur = Math.round(from + (to - from) * eased);
      prevRef.current = cur;
      setDisplay(cur);
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);

  return <span className="tabular-nums">{display}</span>;
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
  delay = 0,
}: {
  icon: ReactNode;
  label: string;
  value: number | string;
  sub?: string;
  accent: KpiAccent;
  loading?: boolean;
  onClick?: () => void;
  delay?: number;
}) {
  const theme = KPI_THEME[accent];

  return (
    <button
      type="button"
      onClick={onClick}
      style={{ animationDelay: `${delay}ms` }}
      className={`anim-fade-up group relative w-full cursor-pointer overflow-hidden rounded-3xl bg-gradient-to-br p-5 text-left transition-all duration-300 hover:-translate-y-1 hover:shadow-lg hover:shadow-slate-900/[0.08] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900/20 active:scale-[0.98] ${theme.card}`}
    >
      <span
        aria-hidden
        className="pointer-events-none absolute -right-6 -top-6 h-20 w-20 rounded-full bg-white/50 transition-transform duration-300 group-hover:scale-125"
      />

      <div className="relative flex items-start justify-between gap-3">
        <p className="pt-1.5 text-sm font-semibold text-slate-600">{label}</p>
        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full shadow-sm transition-transform duration-300 group-hover:scale-110 ${theme.icon}`}>
          {icon}
        </span>
      </div>

      <div className="relative mt-4">
        {loading ? (
          <div className="skeleton h-8 w-16 rounded-xl" />
        ) : (
          <p className="text-[1.85rem] font-extrabold leading-none tracking-tight text-slate-900">
            {typeof value === "number" ? <AnimatedNumber value={value} /> : value}
          </p>
        )}

        {!loading && sub && (
          <p className="mt-2 flex items-center gap-1 text-xs font-medium text-slate-500">
            <TrendingUp className={`h-3.5 w-3.5 ${theme.trend}`} />
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
        <div
          key={index}
          className="anim-fade-up flex items-center gap-4 rounded-2xl border border-slate-100 p-4"
          style={{ animationDelay: `${index * 70}ms` }}
        >
          <div className="skeleton hidden h-12 w-12 rounded-2xl sm:block" />
          <div className="flex-1 space-y-2">
            <div className="skeleton h-4 w-2/5 rounded-full" />
            <div className="skeleton h-3 w-3/5 rounded-full" />
            <div className="skeleton h-3 w-1/4 rounded-full" />
          </div>
          <div className="skeleton hidden h-6 w-16 rounded-full md:block" />
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
      <div className="anim-fade-up flex flex-col items-center justify-center rounded-2xl border border-dashed border-violet-200 bg-violet-50/40 px-6 py-8 text-center">
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
          className="mt-4 cursor-pointer rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-600 transition-all duration-200 hover:-translate-y-0.5 hover:border-violet-200 hover:text-violet-600 active:scale-95"
        >
          Clear search
        </button>
      </div>
    );
  }

  return (
    <div className="anim-fade-up flex flex-col items-center justify-center rounded-2xl border border-dashed border-violet-200 bg-violet-50/40 px-6 py-8 text-center">
      <div className="anim-fade-in flex h-12 w-12 items-center justify-center rounded-full bg-white shadow-sm">
        <CalendarDays className="h-6 w-6 text-violet-500" />
      </div>
      <p className="mt-3 text-sm font-semibold text-slate-700">No upcoming meetings</p>
      <p className="mt-1 max-w-xs text-xs leading-relaxed text-slate-500">
        All caught up — schedule a meeting to keep your calendar moving.
      </p>
      <button
        type="button"
        onClick={onCreate}
        className="mt-4 inline-flex cursor-pointer items-center gap-2 rounded-full bg-slate-900 px-4 py-2.5 text-xs font-semibold text-white shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:bg-slate-800 active:scale-[0.98]"
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
  index = 0,
}: {
  meeting: Meeting;
  onOpen: (meeting: Meeting) => void;
  index?: number;
}) {
  const meetingDate = parseMeetingDate(meeting.meeting_date, meeting.meeting_time);
  const statusStyle = getStatusStyle(getMeetingStatus(meeting));
  const isToday = meetingDate
    ? meetingDate.toDateString() === new Date().toDateString()
    : false;
  const relativeLabel = meetingDate ? getRelativeDayLabel(meetingDate) : "";

  return (
    <li className="anim-row" style={{ animationDelay: `${Math.min(index * 50, 300)}ms` }}>
      <button
        type="button"
        onClick={() => onOpen(meeting)}
        className="group flex w-full cursor-pointer items-center gap-3.5 rounded-2xl border border-slate-100 bg-white p-3.5 text-left transition-all duration-200 hover:-translate-y-0.5 hover:border-violet-200 hover:bg-violet-50/40 hover:shadow-md hover:shadow-slate-900/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/30"
      >
        <div
          className={`hidden h-12 w-12 shrink-0 flex-col items-center justify-center rounded-2xl border transition-transform duration-300 group-hover:scale-105 sm:flex ${
            isToday
              ? "border-slate-900 bg-slate-900 text-white shadow-sm"
              : "border-violet-200 bg-gradient-to-b from-violet-100 to-violet-50 text-violet-900"
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
            <h4 className="truncate text-sm font-semibold text-slate-900 transition-colors duration-200 group-hover:text-violet-700">
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
            className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-full border border-slate-200 text-slate-500 transition-colors hover:border-violet-300 hover:text-violet-600 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-slate-200 disabled:hover:text-slate-500"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>

          {pageWindow.map((page) => (
            <button
              key={page}
              type="button"
              onClick={() => onPageChange(page)}
              aria-current={page === currentPage ? "page" : undefined}
              className={`h-8 min-w-[2rem] cursor-pointer rounded-full px-2 text-xs font-bold tabular-nums transition-all duration-200 ${
                page === currentPage
                  ? "bg-slate-900 text-white shadow-sm"
                  : "border border-slate-200 text-slate-600 hover:border-violet-200 hover:text-violet-600"
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
            className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-full border border-slate-200 text-slate-500 transition-colors hover:border-violet-300 hover:text-violet-600 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-slate-200 disabled:hover:text-slate-500"
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
            <div className="skeleton w-full rounded-t-xl" style={{ height: `${height}%` }} />
          </div>
        ))}
      </div>
      <div className="mt-2 flex gap-1.5 sm:gap-3">
        {Array.from({ length: 7 }).map((_, index) => (
          <div key={index} className="skeleton h-3 flex-1 rounded-full" />
        ))}
      </div>
    </div>
  );
}

function ActivityEmpty({ range }: { range: ActivityRange }) {
  return (
    <div className="anim-fade-up flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-6 py-10 text-center">
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
    <div className="rounded-2xl bg-slate-50/80 px-3.5 py-3 transition-colors duration-200 hover:bg-violet-50/60">
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
        <div className="skeleton h-5 w-8 rounded-full" />
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
      onClick={() => onClick()}
      className="group relative z-10 flex w-full cursor-pointer select-none items-center justify-between rounded-2xl border border-slate-200 bg-white px-4 py-3 text-left text-xs font-semibold text-slate-600 transition-all duration-200 hover:-translate-y-0.5 hover:border-violet-200 hover:bg-violet-50/60 hover:text-violet-700 hover:shadow-sm active:scale-[0.98]"
    >
      <span className="flex items-center gap-2.5">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-50 text-slate-400 transition-all duration-300 group-hover:scale-110 group-hover:bg-white group-hover:text-violet-600">
          {icon}
        </span>
        {label}
      </span>
      <ArrowRight className="h-3.5 w-3.5 text-slate-300 transition-all group-hover:translate-x-0.5 group-hover:text-violet-500" />
    </button>
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
  const [updateMeeting, setUpdateMeeting] = useState<Meeting | null>(null);

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

  /* Greeting / date / logged-in user */
  useEffect(() => {
    const now = new Date();
    const hour = now.getHours();
    setGreeting(hour < 12 ? "Good Morning" : hour < 17 ? "Good Afternoon" : "Good Evening");
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
     Details off-canvas + delete + status
  ──────────────────────────────── */

  const openMeetingDetails = (meeting: Meeting) => setSelectedMeeting(meeting);
  const closeMeetingDetails = () => setSelectedMeeting(null);

  /* Always re-fetch the full record before editing/updating — the row
     data (from the list endpoint) can be stale or partial, which is
     why Edit could appear to open with "new meeting" (blank) details. */
  const fetchFreshMeeting = async (id: string): Promise<Meeting | null> => {
    try {
      return (await pb.collection("meetings").getOne(id)) as unknown as Meeting;
    } catch {
      return null;
    }
  };

  const openEditFromDetails = async (meeting: Meeting) => {
    setSelectedMeeting(null);
    const fresh = await fetchFreshMeeting(meeting.id);
    openEditPanel(fresh || meeting);
  };

  const handleOpenUpdate = async (meeting: Meeting) => {
    setSelectedMeeting(null);
    const fresh = await fetchFreshMeeting(meeting.id);
    setUpdateMeeting(fresh || meeting);
  };

  const closeUpdatePanel = () => setUpdateMeeting(null);

  const handleUpdateSaved = () => {
    setUpdateMeeting(null);
    loadDashboardData({ silent: true });
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

  /* ESC closes the update panel (the details panel handles its own ESC) */
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape" || panelOpen) return;
      if (updateMeeting) setUpdateMeeting(null);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [panelOpen, updateMeeting]);

  /* Keyboard shortcut: pressing "N" opens the create meeting panel */
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "n" && e.key !== "N") return;
      if (panelOpen || selectedMeeting || updateMeeting) return;
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || target?.isContentEditable) return;
      e.preventDefault();
      openCreatePanel();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [panelOpen, selectedMeeting, updateMeeting]);

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

  const safeUpcomingPage = Math.min(upcomingPage, upcomingTotalPages);

  const paginatedUpcomingMeetings = useMemo(() => {
    const startIndex = (safeUpcomingPage - 1) * UPCOMING_PAGE_SIZE;
    return filteredUpcomingMeetings.slice(startIndex, startIndex + UPCOMING_PAGE_SIZE);
  }, [filteredUpcomingMeetings, safeUpcomingPage]);

  const upcomingRangeStart =
    filteredUpcomingMeetings.length === 0
      ? 0
      : (safeUpcomingPage - 1) * UPCOMING_PAGE_SIZE + 1;
  const upcomingRangeEnd = Math.min(
    safeUpcomingPage * UPCOMING_PAGE_SIZE,
    filteredUpcomingMeetings.length
  );

  useEffect(() => {
    setUpcomingPage(1);
  }, [search]);

  const activityData = useMemo(
    () => buildActivityData(meetings, activityRange),
    [meetings, activityRange]
  );
  const hasActivity = activityData.some((bucket) => bucket.total > 0);

  const stats: DashboardStats = useMemo(() => {
    let scheduled = 0;
    let completed = 0;
    let rescheduled = 0;
    let cancelled = 0;

    meetings.forEach((meeting) => {
      const status = getMeetingStatus(meeting);
      if (status.includes("completed") || status.includes("done")) completed += 1;
      else if (status.includes("rescheduled")) rescheduled += 1;
      else if (
        status.includes("cancelled") ||
        status.includes("canceled") ||
        status.includes("rejected")
      )
        cancelled += 1;
      else scheduled += 1;
    });

    const totalMeetings = meetings.length;

    return {
      totalMeetings,
      scheduled,
      completed,
      rescheduled,
      cancelled,
      completionRate: totalMeetings === 0 ? 0 : Math.round((completed / totalMeetings) * 100),
    };
  }, [meetings]);

  /* ────────────────────────────────
     Render
  ──────────────────────────────── */

  return (
    <ProtectedRoute>
      <div className="dash-root relative min-h-screen bg-gradient-to-br from-indigo-200 via-violet-100 to-purple-200 p-2.5 sm:p-5 lg:p-8">
        <CustomStyles />

        <div aria-hidden className="pointer-events-none fixed inset-0 overflow-hidden">
          <div className="anim-blob absolute -left-32 -top-32 h-96 w-96 rounded-full bg-violet-300/40 blur-3xl" />
          <div
            className="anim-blob absolute -right-32 top-1/4 h-96 w-96 rounded-full bg-sky-300/30 blur-3xl"
            style={{ animationDelay: "-3s" }}
          />
          <div
            className="anim-blob absolute -bottom-32 left-1/3 h-96 w-96 rounded-full bg-fuchsia-300/25 blur-3xl"
            style={{ animationDelay: "-6s" }}
          />
        </div>

        <div className="relative mx-auto max-w-[1500px] overflow-hidden rounded-[1.75rem] bg-white shadow-2xl shadow-violet-300/40 ring-1 ring-white/70">
          {/* ── App bar ── */}
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 bg-white px-4 py-5 sm:px-6 sm:py-6">
            <div className="flex min-w-0 items-center gap-4">
              <span className="anim-scale-in flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-slate-900 to-slate-700 text-white shadow-lg shadow-slate-900/20 sm:h-16 sm:w-16">
                <CalendarDays className="h-6 w-6 sm:h-7 sm:w-7" />
              </span>
              <div className="min-w-0">
                <h1 className="anim-fade-up truncate bg-gradient-to-r from-slate-900 via-violet-800 to-slate-900 bg-clip-text text-2xl font-extrabold leading-tight tracking-tight text-transparent sm:text-3xl lg:text-4xl">
                  {greeting}, {userName}
                </h1>
                <p
                  className="anim-fade-up mt-1 truncate text-xs font-medium text-slate-400 sm:text-sm"
                  style={{ animationDelay: "80ms" }}
                >
                  {todayLabel || "Meeting Management"}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {/* Desktop search */}
              <div className="relative hidden md:block">
                <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search meetings, officers..."
                  className="h-11 w-64 rounded-full border border-slate-200 bg-slate-50/80 pl-11 pr-9 text-sm text-slate-900 placeholder-slate-400 transition-all duration-200 hover:border-slate-300 hover:bg-white focus:border-violet-400 focus:bg-white focus:outline-none focus:ring-4 focus:ring-violet-500/10"
                />
                {search && (
                  <button
                    type="button"
                    onClick={() => setSearch("")}
                    aria-label="Clear search"
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 cursor-pointer rounded-full p-1 text-slate-400 transition-all hover:bg-slate-100 hover:text-slate-600 active:scale-90"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>

              {/* Mobile search toggle */}
              <button
                type="button"
                onClick={() => setMobileSearchOpen((open) => !open)}
                aria-label="Toggle search"
                className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 transition-all duration-200 hover:-translate-y-0.5 hover:text-violet-600 active:scale-95 md:hidden"
              >
                <Search className="h-4 w-4" />
              </button>

              {/* Calendar */}
              <button
                type="button"
                onClick={() => goTo("/calendar")}
                aria-label="Open calendar"
                className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 transition-all duration-200 hover:-translate-y-0.5 hover:text-violet-600 active:scale-95"
              >
                <CalendarDays className="h-4 w-4" />
              </button>

              {/* New meeting */}
              <button
                type="button"
                onClick={openCreatePanel}
                className="group inline-flex h-11 cursor-pointer items-center gap-2 rounded-full bg-slate-900 px-5 text-sm font-semibold text-white shadow-lg shadow-slate-900/10 transition-all duration-300 hover:-translate-y-0.5 hover:bg-slate-800 active:scale-[0.98]"
              >
                <Plus className="h-4 w-4 transition-transform duration-300 group-hover:rotate-90" />
                New Meeting
                <kbd className="hidden rounded-md bg-white/15 px-1.5 py-0.5 text-[10px] font-bold sm:inline">N</kbd>
              </button>
            </div>
          </div>

          {/* Mobile search bar */}
          {mobileSearchOpen && (
            <div className="anim-fade-in border-b border-slate-100 bg-white px-4 py-3 md:hidden">
              <div className="relative">
                <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search meetings, officers..."
                  className="h-11 w-full rounded-full border border-slate-200 bg-slate-50/80 pl-11 pr-9 text-sm text-slate-900 placeholder-slate-400 focus:border-violet-400 focus:bg-white focus:outline-none focus:ring-4 focus:ring-violet-500/10"
                />
                {search && (
                  <button
                    type="button"
                    onClick={() => setSearch("")}
                    aria-label="Clear search"
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 cursor-pointer rounded-full p-1 text-slate-400 transition-all hover:bg-slate-100 hover:text-slate-600 active:scale-90"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>
          )}

          {/* ── Content ── */}
          <div className="space-y-6 bg-[#f7f6fd] p-4 sm:p-6 lg:p-7">
            {/* Error banner */}
            {error && (
              <div className="anim-fade-up flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700 shadow-sm">
                <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <div className="flex-1">
                  <p className="font-semibold">Couldn&apos;t load dashboard data</p>
                  <p className="mt-0.5 text-xs text-rose-600">{error}</p>
                </div>
                <button
                  type="button"
                  onClick={() => handleRefresh()}
                  className="cursor-pointer rounded-full border border-rose-300 bg-white px-3 py-1.5 text-xs font-semibold text-rose-600 transition-all duration-200 hover:-translate-y-0.5 hover:bg-rose-100 active:scale-95"
                >
                  {isRefreshing ? "Retrying…" : "Retry"}
                </button>
              </div>
            )}

            {/* ── KPI cards ── */}
            <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <StatCard
                icon={<Users className="h-5 w-5" />}
                label="Total Meetings"
                value={stats.totalMeetings}
                sub={`${stats.scheduled} scheduled`}
                accent="blue"
                loading={loadingMeetings}
                onClick={() => goTo("/meetings")}
                delay={120}
              />

              <StatCard
                icon={<Briefcase className="h-5 w-5" />}
                label="IAS Officers"
                value={iasCount}
                sub="Administrative service"
                accent="violet"
                loading={loadingOfficers}
                onClick={() => goTo("/officers?type=ias")}
                delay={190}
              />

              <StatCard
                icon={<ShieldCheck className="h-5 w-5" />}
                label="IPS Officers"
                value={ipsCount}
                sub="Police service"
                accent="rose"
                loading={loadingOfficers}
                onClick={() => goTo("/officers?type=ips")}
                delay={260}
              />

              <StatCard
                icon={<CheckCircle2 className="h-5 w-5" />}
                label="Completion Rate"
                value={`${stats.completionRate}%`}
                sub={`${stats.completed} completed`}
                accent="emerald"
                loading={loadingMeetings}
                onClick={() => goTo("/reports")}
                delay={330}
              />
            </section>

            {/* ── Main grid ── */}
            <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
              {/* Left column */}
              <div className="space-y-6 xl:col-span-2">
                {/* NEW: On This Day — renders nothing when there are no memories */}
                {!loadingMeetings && (
                  <OnThisDayCard meetings={meetings} onOpenMeeting={openMeetingDetails} delay={180} />
                )}

                {/* Upcoming meetings */}
                <section
                  className="anim-fade-up overflow-hidden rounded-3xl border border-violet-100 bg-white shadow-sm"
                  style={{ animationDelay: "220ms" }}
                >
                  <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
                    <div>
                      <h2 className="text-base font-bold text-slate-900">Upcoming Meetings</h2>
                      <p className="mt-0.5 text-xs text-slate-500">
                        Next scheduled meetings across all officers
                      </p>
                    </div>
                    <span className="rounded-full bg-violet-50 px-3 py-1 text-xs font-bold tabular-nums text-violet-700">
                      {filteredUpcomingMeetings.length}
                    </span>
                  </div>

                  <div className="p-5">
                    {loadingMeetings ? (
                      <LoadingRows count={4} />
                    ) : filteredUpcomingMeetings.length === 0 ? (
                      <EmptyMeetings
                        isFiltered={search.trim().length > 0}
                        onClearSearch={() => setSearch("")}
                        onCreate={openCreatePanel}
                      />
                    ) : (
                      <ul className="space-y-3">
                        {paginatedUpcomingMeetings.map((meeting, index) => (
                          <UpcomingMeetingRow
                            key={meeting.id}
                            meeting={meeting}
                            onOpen={openMeetingDetails}
                            index={index}
                          />
                        ))}
                      </ul>
                    )}
                  </div>

                  {!loadingMeetings && filteredUpcomingMeetings.length > 0 && (
                    <UpcomingPagination
                      currentPage={safeUpcomingPage}
                      totalPages={upcomingTotalPages}
                      totalItems={filteredUpcomingMeetings.length}
                      rangeStart={upcomingRangeStart}
                      rangeEnd={upcomingRangeEnd}
                      onPageChange={setUpcomingPage}
                    />
                  )}
                </section>

                {/* Activity chart */}
                <section
                  className="anim-fade-up rounded-3xl border border-violet-100 bg-white p-5 shadow-sm"
                  style={{ animationDelay: "300ms" }}
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h2 className="text-base font-bold text-slate-900">Meeting Activity</h2>
                      <p className="mt-0.5 text-xs text-slate-500">
                        {activityRange === "week" ? "Last 7 days" : "Last 6 months"}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 rounded-full bg-slate-100 p-1">
                      {(["week", "month"] as ActivityRange[]).map((range) => (
                        <button
                          key={range}
                          type="button"
                          onClick={() => setActivityRange(range)}
                          className={`cursor-pointer rounded-full px-3.5 py-1.5 text-xs font-semibold capitalize transition-all duration-200 ${
                            activityRange === range
                              ? "bg-white text-slate-900 shadow-sm"
                              : "text-slate-500 hover:text-slate-700"
                          }`}
                        >
                          {range}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="mt-5">
                    {loadingMeetings ? (
                      <ChartSkeleton />
                    ) : !hasActivity ? (
                      <ActivityEmpty range={activityRange} />
                    ) : (
                      <ActivityChart data={activityData} range={activityRange} />
                    )}
                  </div>

                  {!loadingMeetings && hasActivity && (
                    <>
                      <div className="mt-5 flex flex-wrap items-center gap-4 border-t border-slate-100 pt-4">
                        <LegendDot label="Scheduled" dotClass="bg-violet-500" />
                        <LegendDot label="Completed" dotClass="bg-emerald-500" />
                        <LegendDot label="Cancelled" dotClass="bg-slate-300" />
                      </div>

                      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                        <SummaryStat label="Scheduled" value={stats.scheduled} />
                        <SummaryStat label="Completed" value={stats.completed} />
                        <SummaryStat label="Cancelled" value={stats.cancelled} />
                        <SummaryStat label="Total" value={stats.totalMeetings} />
                      </div>
                    </>
                  )}
                </section>
              </div>

              {/* Right column */}
              <div className="space-y-6">
                {/* NEW: Yearly Recap */}
                <RecapTeaserCard meetings={meetings} loading={loadingMeetings} delay={200} />

                {/* Status breakdown */}
                <section
                  className="anim-fade-up rounded-3xl border border-violet-100 bg-white p-5 shadow-sm"
                  style={{ animationDelay: "260ms" }}
                >
                  <h2 className="text-base font-bold text-slate-900">Status Breakdown</h2>
                  <p className="mt-0.5 text-xs text-slate-500">All meetings by current status</p>

                  <div className="mt-4 space-y-1">
                    <StatusRow
                      icon={<CalendarDays className="h-4 w-4 text-violet-600" />}
                      iconClass="bg-violet-50"
                      label="Scheduled"
                      value={stats.scheduled}
                      total={stats.totalMeetings}
                      loading={loadingMeetings}
                    />
                    <StatusRow
                      icon={<CheckCircle2 className="h-4 w-4 text-emerald-600" />}
                      iconClass="bg-emerald-50"
                      label="Completed"
                      value={stats.completed}
                      total={stats.totalMeetings}
                      loading={loadingMeetings}
                    />
                    <StatusRow
                      icon={<RefreshCw className="h-4 w-4 text-amber-600" />}
                      iconClass="bg-amber-50"
                      label="Rescheduled"
                      value={stats.rescheduled}
                      total={stats.totalMeetings}
                      loading={loadingMeetings}
                    />
                    <StatusRow
                      icon={<XCircle className="h-4 w-4 text-rose-600" />}
                      iconClass="bg-rose-50"
                      label="Cancelled"
                      value={stats.cancelled}
                      total={stats.totalMeetings}
                      loading={loadingMeetings}
                    />
                  </div>

                  <div className="mt-4 grid grid-cols-3 gap-3 border-t border-slate-100 pt-4">
                    <SummaryStat label="Total" value={stats.totalMeetings} />
                    <SummaryStat label="IAS Officers" value={iasCount} />
                    <SummaryStat label="IPS Officers" value={ipsCount} />
                  </div>
                </section>

                {/* Quick actions */}
                <section
                  className="anim-fade-up relative z-10 rounded-3xl border border-violet-100 bg-white p-5 shadow-sm"
                  style={{ animationDelay: "340ms" }}
                >
                  <h2 className="text-base font-bold text-slate-900">Quick Actions</h2>
                  <div className="mt-4 space-y-2.5">
                    <QuickActionButton
                      icon={<Plus className="h-4 w-4" />}
                      label="New Meeting"
                      onClick={openCreatePanel}
                    />
                    <QuickActionButton
                      icon={<Users className="h-4 w-4" />}
                      label="Officers Directory"
                      onClick={() => goTo("/officers")}
                    />
                    <QuickActionButton
                      icon={<CalendarDays className="h-4 w-4" />}
                      label="View Calendar"
                      onClick={() => goTo("/calendar")}
                    />
                    <QuickActionButton
                      icon={<FileText className="h-4 w-4" />}
                      label="View Reports"
                      onClick={() => goTo("/reports")}
                    />
                    {/* NEW: Yearly Recap */}
                    <QuickActionButton
                      icon={<Sparkles className="h-4 w-4" />}
                      label="Yearly Recap"
                      onClick={() => goTo("/recap")}
                    />
                  </div>
                </section>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Meeting details off-canvas — shared with Meetings & Calendar ── */}
      {selectedMeeting && (
        <MeetingDetailsPanel
          meeting={selectedMeeting}
          onClose={closeMeetingDetails}
          onEdit={openEditFromDetails}
          onUpdate={handleOpenUpdate}
          onDeleted={() => { setSelectedMeeting(null); loadDashboardData({ silent: true }); }}
          onMeetingChange={(updated) => {
            setSelectedMeeting(updated);
            setMeetings((prev) => prev.map((x) => (x.id === updated.id ? updated : x)));
          }}
        />
      )}

      {/* ── Update meeting panel — shared with the Meetings page ── */}
      {updateMeeting && (
        <UpdateMeetingPanel
          meeting={updateMeeting}
          onClose={closeUpdatePanel}
          onSaved={handleUpdateSaved}
        />
      )}

      {/* ── Create / Edit panel ── */}
      {panelOpen && (
        <CreateMeetingPanel
          key={editingMeeting ? `edit-${editingMeeting.id}` : "create"}
          isOpen={panelOpen}
          meetingToEdit={editingMeeting}
          onClose={closePanel}
          onSuccess={handlePanelSuccess}
        />
      )}
    </ProtectedRoute>
  );
}