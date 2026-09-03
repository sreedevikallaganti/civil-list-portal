"use client";

import {
  Activity,
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  Clock3,
  FileText,
  RefreshCw,
  Search,
  ShieldCheck,
  TrendingUp,
  Users,
  XCircle,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type Meeting = {
  id: string;
  title?: string;
  meeting_title?: string;
  subject?: string;
  agenda?: string;

  officer_name?: string;
  officer_type?: string;
  officer_id?: string;
  designation?: string;
  department?: string;

  meeting_date?: string;
  meeting_time?: string;
  duration?: string | number;

  status?: string;
  collectionId?: string;
  collectionName?: string;
  created?: string;
  updated?: string;
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

const PB_URL = process.env.NEXT_PUBLIC_POCKETBASE_URL;

function getMeetingTitle(meeting: Meeting) {
  return (
    meeting.title ||
    meeting.meeting_title ||
    meeting.subject ||
    meeting.agenda ||
    "Untitled Meeting"
  );
}

function getMeetingStatus(meeting: Meeting) {
  return (meeting.status || "scheduled").toLowerCase().trim();
}

/**
 * Converts different possible date formats into a Date.
 *
 * Supported:
 * 2026-09-03
 * 2026-09-03T10:30:00
 * 03/09/2026
 * 03-09-2026
 */
function parseMeetingDate(
  dateValue?: string,
  timeValue?: string
): Date | null {
  if (!dateValue) {
    return null;
  }

  const dateString = dateValue.trim();

  // DD/MM/YYYY or DD-MM-YYYY
  const indianDateMatch = dateString.match(
    /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/
  );

  if (indianDateMatch) {
    const day = Number(indianDateMatch[1]);
    const month = Number(indianDateMatch[2]) - 1;
    const year = Number(indianDateMatch[3]);

    let hours = 0;
    let minutes = 0;

    if (timeValue) {
      const timeMatch = timeValue.match(
        /(\d{1,2}):(\d{2})(?:\s*(AM|PM))?/i
      );

      if (timeMatch) {
        hours = Number(timeMatch[1]);
        minutes = Number(timeMatch[2]);

        const meridiem = timeMatch[3]?.toUpperCase();

        if (meridiem === "PM" && hours < 12) {
          hours += 12;
        }

        if (meridiem === "AM" && hours === 12) {
          hours = 0;
        }
      }
    }

    return new Date(year, month, day, hours, minutes);
  }

  // ISO date
  const parsed = new Date(dateString);

  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  // If meeting_date contains only YYYY-MM-DD,
  // add meeting_time separately.
  if (
    /^\d{4}-\d{2}-\d{2}$/.test(dateString) &&
    timeValue
  ) {
    const timeMatch = timeValue.match(
      /(\d{1,2}):(\d{2})(?:\s*(AM|PM))?/i
    );

    if (timeMatch) {
      let hours = Number(timeMatch[1]);
      const minutes = Number(timeMatch[2]);

      const meridiem = timeMatch[3]?.toUpperCase();

      if (meridiem === "PM" && hours < 12) {
        hours += 12;
      }

      if (meridiem === "AM" && hours === 12) {
        hours = 0;
      }

      parsed.setHours(hours, minutes, 0, 0);
    }
  }

  return parsed;
}

function formatMeetingDate(
  dateValue?: string,
  timeValue?: string
) {
  const date = parseMeetingDate(dateValue, timeValue);

  if (!date) {
    return "Date not available";
  }

  return date.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatMeetingTime(timeValue?: string) {
  if (!timeValue) {
    return "Time not available";
  }

  const match = timeValue.match(
    /(\d{1,2}):(\d{2})(?:\s*(AM|PM))?/i
  );

  if (!match) {
    return timeValue;
  }

  let hours = Number(match[1]);
  const minutes = Number(match[2]);
  const meridiem = match[3]?.toUpperCase();

  if (!meridiem) {
    const date = new Date();

    date.setHours(hours, minutes, 0, 0);

    return date.toLocaleTimeString("en-IN", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  }

  if (meridiem === "PM" && hours < 12) {
    hours += 12;
  }

  if (meridiem === "AM" && hours === 12) {
    hours = 0;
  }

  const date = new Date();

  date.setHours(hours, minutes, 0, 0);

  return date.toLocaleTimeString("en-IN", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

async function fetchPocketBaseCollection<T>(
  collectionName: string
): Promise<PocketBaseResponse<T>> {
  if (!PB_URL) {
    throw new Error(
      "NEXT_PUBLIC_POCKETBASE_URL is missing from .env.local"
    );
  }

  const url =
    `${PB_URL}/api/collections/${collectionName}/records` +
    `?page=1&perPage=500`;

  console.log(
    `[Dashboard] Fetching ${collectionName}:`,
    url
  );

  const response = await fetch(url, {
    method: "GET",
    cache: "no-store",
  });

  if (!response.ok) {
    const errorText = await response.text();

    throw new Error(
      `${collectionName} API failed: ${response.status} ${errorText}`
    );
  }

  const data =
    (await response.json()) as PocketBaseResponse<T>;

  console.log(
    `[Dashboard] ${collectionName} response:`,
    data
  );

  return data;
}

export default function DashboardPage() {
  const router = useRouter();

  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [iasCount, setIasCount] = useState(0);
  const [ipsCount, setIpsCount] = useState(0);

  const [loadingMeetings, setLoadingMeetings] =
    useState(true);

  const [loadingOfficers, setLoadingOfficers] =
    useState(true);

  const [error, setError] = useState("");

  const [search, setSearch] = useState("");

  const loadDashboardData = async () => {
    try {
      setError("");
      setLoadingMeetings(true);
      setLoadingOfficers(true);

      console.log(
        "[Dashboard] Starting PocketBase fetch..."
      );

      const [meetingResult, iasResult, ipsResult] =
        await Promise.all([
          fetchPocketBaseCollection<Meeting>("meetings"),
          fetchPocketBaseCollection<Record<string, unknown>>(
            "ias_officers"
          ),
          fetchPocketBaseCollection<Record<string, unknown>>(
            "ips_officers"
          ),
        ]);

      setMeetings(meetingResult.items || []);

      setIasCount(iasResult.totalItems || 0);
      setIpsCount(ipsResult.totalItems || 0);

      console.log(
        "[Dashboard] Meetings:",
        meetingResult.items
      );

      console.log(
        "[Dashboard] IAS count:",
        iasResult.totalItems
      );

      console.log(
        "[Dashboard] IPS count:",
        ipsResult.totalItems
      );
    } catch (err) {
      console.error(
        "[Dashboard] Fetch error:",
        err
      );

      setError(
        err instanceof Error
          ? err.message
          : "Unable to fetch dashboard data."
      );
    } finally {
      setLoadingMeetings(false);
      setLoadingOfficers(false);
    }
  };

  useEffect(() => {
    loadDashboardData();
  }, []);

  /**
   * Upcoming meetings
   */
  const upcomingMeetings = useMemo(() => {
    const now = new Date();

    return meetings
      .filter((meeting) => {
        const status = getMeetingStatus(meeting);

        // Don't show completed/cancelled meetings
        if (
          status.includes("completed") ||
          status.includes("cancelled") ||
          status.includes("canceled")
        ) {
          return false;
        }

        const meetingDate = parseMeetingDate(
          meeting.meeting_date,
          meeting.meeting_time
        );

        if (!meetingDate) {
          return false;
        }

        return meetingDate.getTime() >= now.getTime();
      })
      .sort((a, b) => {
        const dateA =
          parseMeetingDate(
            a.meeting_date,
            a.meeting_time
          )?.getTime() || 0;

        const dateB =
          parseMeetingDate(
            b.meeting_date,
            b.meeting_time
          )?.getTime() || 0;

        return dateA - dateB;
      });
  }, [meetings]);

  /**
   * Filter upcoming meetings by search
   */
  const filteredUpcomingMeetings =
    useMemo(() => {
      if (!search.trim()) {
        return upcomingMeetings.slice(0, 5);
      }

      const searchValue =
        search.toLowerCase().trim();

      return upcomingMeetings
        .filter((meeting) => {
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
        })
        .slice(0, 5);
    }, [upcomingMeetings, search]);

  /**
   * Dynamic meeting statistics
   */
  const stats = useMemo<DashboardStats>(() => {
    let scheduled = 0;
    let completed = 0;
    let rescheduled = 0;
    let cancelled = 0;

    meetings.forEach((meeting) => {
      const status = getMeetingStatus(meeting);

      if (
        status.includes("completed") ||
        status.includes("done")
      ) {
        completed++;
      } else if (status.includes("rescheduled")) {
        rescheduled++;
      } else if (
        status.includes("cancelled") ||
        status.includes("canceled")
      ) {
        cancelled++;
      } else {
        scheduled++;
      }
    });

    const total = meetings.length;

    const completionRate =
      total > 0
        ? Math.round((completed / total) * 100)
        : 0;

    return {
      totalMeetings: total,
      scheduled,
      completed,
      rescheduled,
      cancelled,
      completionRate,
    };
  }, [meetings]);

  const totalOfficers = iasCount + ipsCount;

  const goTo = (path: string) => {
    router.push(path);
  };

  return (
    <div className="min-h-screen w-full bg-[#f5f7fb]">
      {/* =====================================================
          TOP HEADER
      ====================================================== */}

      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="flex min-h-[78px] items-center justify-between gap-4 px-5 md:px-8">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-600">
              CIVILLIST PORTAL
            </p>

            <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">
              Dashboard
            </h1>
          </div>

          <div className="hidden w-full max-w-xl md:block">
            <div className="relative">
              <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />

              <input
                value={search}
                onChange={(event) =>
                  setSearch(event.target.value)
                }
                placeholder="Search officers, meetings, departments..."
                className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 pl-12 pr-4 text-sm outline-none transition focus:border-blue-400 focus:bg-white focus:ring-4 focus:ring-blue-50"
              />
            </div>
          </div>

          <button
            onClick={() => loadDashboardData()}
            className="flex h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-blue-200 hover:bg-blue-50"
          >
            <RefreshCw className="h-4 w-4" />
            <span className="hidden sm:inline">
              Refresh
            </span>
          </button>
        </div>
      </header>

      {/* =====================================================
          MAIN CONTENT
      ====================================================== */}

      <main className="w-full px-4 py-6 sm:px-6 lg:px-8">
        {/* Welcome */}
        <section className="mb-7 flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
          <div>
            <p className="mb-2 text-sm font-medium text-blue-600">
              Overview
            </p>

            <h2 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
              Good morning, Admin 👋
            </h2>

            <p className="mt-2 max-w-2xl text-sm text-slate-500 sm:text-base">
              Monitor meetings, officers and daily
              activities across the Civillist Portal.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              onClick={() => goTo("/calendar")}
              className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-blue-200 hover:bg-blue-50"
            >
              <CalendarDays className="h-4 w-4" />
              Calendar
            </button>

            <button
              onClick={() => goTo("/meetings?create=true")}
              className="flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-200 transition hover:bg-blue-700"
            >
              <span className="text-lg leading-none">
                +
              </span>
              New Meeting
            </button>
          </div>
        </section>

        {/* Error */}
        {error && (
          <div className="mb-6 rounded-2xl border border-red-200 bg-red-50 p-4">
            <div className="flex items-start gap-3">
              <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-600" />

              <div>
                <p className="font-semibold text-red-800">
                  Unable to load dashboard data
                </p>

                <p className="mt-1 text-sm text-red-700">
                  {error}
                </p>

                <p className="mt-2 text-xs text-red-600">
                  Open the browser console to see the
                  PocketBase request details.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* =====================================================
            STAT CARDS
        ====================================================== */}

        <section className="mb-7 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {/* Meetings */}
          <button
            onClick={() => goTo("/meetings")}
            className="group rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-sm transition hover:-translate-y-1 hover:border-blue-200 hover:shadow-lg"
          >
            <div className="flex items-start justify-between">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                <CalendarDays className="h-5 w-5" />
              </div>

              <ArrowRight className="h-5 w-5 text-slate-300 transition group-hover:translate-x-1 group-hover:text-blue-600" />
            </div>

            <p className="mt-5 text-sm font-medium text-slate-500">
              Total Meetings
            </p>

            <p className="mt-1 text-3xl font-bold text-slate-900">
              {loadingMeetings
                ? "..."
                : stats.totalMeetings}
            </p>

            <p className="mt-1 text-xs text-slate-400">
              All meetings
            </p>
          </button>

          {/* IAS */}
          <button
            onClick={() =>
              goTo("/officers?type=IAS")
            }
            className="group rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-sm transition hover:-translate-y-1 hover:border-violet-200 hover:shadow-lg"
          >
            <div className="flex items-start justify-between">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-violet-50 text-violet-600">
                <Users className="h-5 w-5" />
              </div>

              <ArrowRight className="h-5 w-5 text-slate-300 transition group-hover:translate-x-1 group-hover:text-violet-600" />
            </div>

            <p className="mt-5 text-sm font-medium text-slate-500">
              IAS Officers
            </p>

            <p className="mt-1 text-3xl font-bold text-slate-900">
              {loadingOfficers ? "..." : iasCount}
            </p>

            <p className="mt-1 text-xs text-slate-400">
              Click to view IAS officers
            </p>
          </button>

          {/* IPS */}
          <button
            onClick={() =>
              goTo("/officers?type=IPS")
            }
            className="group rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-sm transition hover:-translate-y-1 hover:border-pink-200 hover:shadow-lg"
          >
            <div className="flex items-start justify-between">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-pink-50 text-pink-600">
                <ShieldCheck className="h-5 w-5" />
              </div>

              <ArrowRight className="h-5 w-5 text-slate-300 transition group-hover:translate-x-1 group-hover:text-pink-600" />
            </div>

            <p className="mt-5 text-sm font-medium text-slate-500">
              IPS Officers
            </p>

            <p className="mt-1 text-3xl font-bold text-slate-900">
              {loadingOfficers ? "..." : ipsCount}
            </p>

            <p className="mt-1 text-xs text-slate-400">
              Click to view IPS officers
            </p>
          </button>

          {/* Completion */}
          <button
            onClick={() => goTo("/reports")}
            className="group rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-sm transition hover:-translate-y-1 hover:border-emerald-200 hover:shadow-lg"
          >
            <div className="flex items-start justify-between">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
                <TrendingUp className="h-5 w-5" />
              </div>

              <ArrowRight className="h-5 w-5 text-slate-300 transition group-hover:translate-x-1 group-hover:text-emerald-600" />
            </div>

            <p className="mt-5 text-sm font-medium text-slate-500">
              Completion Rate
            </p>

            <p className="mt-1 text-3xl font-bold text-slate-900">
              {loadingMeetings
                ? "..."
                : `${stats.completionRate}%`}
            </p>

            <p className="mt-1 text-xs text-slate-400">
              Click to view reports
            </p>
          </button>
        </section>

        {/* =====================================================
            MAIN GRID
        ====================================================== */}

        <section className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.65fr)_minmax(330px,0.85fr)]">
          {/* ===================================================
              UPCOMING MEETINGS
          ==================================================== */}

          <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex flex-col gap-3 border-b border-slate-100 p-5 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-lg font-bold text-slate-900">
                    Upcoming Meetings
                  </h3>

                  <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-bold text-blue-600">
                    {upcomingMeetings.length}
                  </span>
                </div>

                <p className="mt-1 text-sm text-slate-500">
                  Your next scheduled meetings
                </p>
              </div>

              <button
                onClick={() => goTo("/meetings")}
                className="flex items-center gap-1 text-sm font-semibold text-blue-600 hover:text-blue-700"
              >
                View all
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>

            <div className="p-5">
              {loadingMeetings ? (
                <LoadingRows />
              ) : filteredUpcomingMeetings.length ===
                0 ? (
                <EmptyMeetings />
              ) : (
                <div className="space-y-3">
                  {filteredUpcomingMeetings.map(
                    (meeting) => {
                      const meetingDate =
                        parseMeetingDate(
                          meeting.meeting_date,
                          meeting.meeting_time
                        );

                      const status =
                        getMeetingStatus(meeting);

                      const isToday =
                        meetingDate
                          ? meetingDate.toDateString() ===
                            new Date().toDateString()
                          : false;

                      return (
                        <button
                          key={meeting.id}
                          onClick={() =>
                            goTo(
                              `/meetings/${meeting.id}`
                            )
                          }
                          className="group flex w-full items-center gap-4 rounded-xl border border-slate-100 p-4 text-left transition hover:border-blue-200 hover:bg-blue-50/40"
                        >
                          {/* Date */}
                          <div
                            className={`hidden h-14 w-14 shrink-0 flex-col items-center justify-center rounded-xl sm:flex ${
                              isToday
                                ? "bg-blue-600 text-white"
                                : "bg-slate-100 text-slate-700"
                            }`}
                          >
                            <span className="text-[10px] font-bold uppercase">
                              {meetingDate
                                ? meetingDate.toLocaleDateString(
                                    "en-IN",
                                    {
                                      month: "short",
                                    }
                                  )
                                : "---"}
                            </span>

                            <span className="text-xl font-bold">
                              {meetingDate
                                ? meetingDate.getDate()
                                : "--"}
                            </span>
                          </div>

                          {/* Details */}
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <h4 className="truncate font-semibold text-slate-900 group-hover:text-blue-700">
                                {getMeetingTitle(
                                  meeting
                                )}
                              </h4>

                              {isToday && (
                                <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-bold uppercase text-blue-700">
                                  Today
                                </span>
                              )}
                            </div>

                            <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                              <span className="flex items-center gap-1">
                                <CalendarDays className="h-3.5 w-3.5" />

                                {formatMeetingDate(
                                  meeting.meeting_date,
                                  meeting.meeting_time
                                )}
                              </span>

                              <span className="flex items-center gap-1">
                                <Clock3 className="h-3.5 w-3.5" />

                                {formatMeetingTime(
                                  meeting.meeting_time
                                )}
                              </span>
                            </div>

                            {(meeting.officer_name ||
                              meeting.department) && (
                              <p className="mt-2 truncate text-xs text-slate-400">
                                {meeting.officer_name ||
                                  meeting.department}
                                {meeting.officer_name &&
                                meeting.department
                                  ? ` • ${meeting.department}`
                                  : ""}
                              </p>
                            )}
                          </div>

                          {/* Status */}
                          <div className="hidden shrink-0 md:block">
                            <span
                              className={`rounded-full px-3 py-1 text-xs font-semibold ${
                                status.includes(
                                  "rescheduled"
                                )
                                  ? "bg-amber-50 text-amber-700"
                                  : "bg-blue-50 text-blue-700"
                              }`}
                            >
                              {status
                                .charAt(0)
                                .toUpperCase() +
                                status.slice(1)}
                            </span>
                          </div>

                          <ArrowRight className="h-5 w-5 shrink-0 text-slate-300 transition group-hover:translate-x-1 group-hover:text-blue-600" />
                        </button>
                      );
                    }
                  )}
                </div>
              )}
            </div>
          </div>

          {/* ===================================================
              OFFICER DISTRIBUTION
          ==================================================== */}

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-lg font-bold text-slate-900">
                  Officer Distribution
                </h3>

                <p className="mt-1 text-sm text-slate-500">
                  IAS & IPS officers
                </p>
              </div>

              <Users className="h-5 w-5 text-slate-400" />
            </div>

            <div className="mt-7 flex justify-center">
              <div className="relative flex h-52 w-52 items-center justify-center rounded-full border-[20px] border-violet-100">
                <div className="absolute inset-0 rounded-full border-[20px] border-transparent border-t-violet-600 border-r-violet-600" />

                <div className="text-center">
                  <p className="text-3xl font-bold text-slate-900">
                    {loadingOfficers
                      ? "..."
                      : totalOfficers}
                  </p>

                  <p className="text-xs text-slate-400">
                    Total Officers
                  </p>
                </div>
              </div>
            </div>

            <div className="mt-7 space-y-4">
              <button
                onClick={() =>
                  goTo("/officers?type=IAS")
                }
                className="group flex w-full items-center gap-3 text-left"
              >
                <span className="h-3 w-3 rounded-full bg-violet-500" />

                <span className="flex-1 text-sm font-medium text-slate-600">
                  IAS Officers
                </span>

                <span className="font-bold text-slate-900">
                  {loadingOfficers
                    ? "..."
                    : iasCount}
                </span>

                <ArrowRight className="h-4 w-4 text-slate-300 group-hover:text-violet-600" />
              </button>

              <button
                onClick={() =>
                  goTo("/officers?type=IPS")
                }
                className="group flex w-full items-center gap-3 text-left"
              >
                <span className="h-3 w-3 rounded-full bg-blue-500" />

                <span className="flex-1 text-sm font-medium text-slate-600">
                  IPS Officers
                </span>

                <span className="font-bold text-slate-900">
                  {loadingOfficers
                    ? "..."
                    : ipsCount}
                </span>

                <ArrowRight className="h-4 w-4 text-slate-300 group-hover:text-blue-600" />
              </button>
            </div>

            <button
              onClick={() => goTo("/officers")}
              className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 py-3 text-sm font-semibold text-slate-700 transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-600"
            >
              View all officers
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </section>

        {/* =====================================================
            MEETING OVERVIEW + QUICK ACTIONS
        ====================================================== */}

        <section className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(320px,0.6fr)]">
          {/* Meeting Overview */}
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold text-slate-900">
                  Meeting Overview
                </h3>

                <p className="mt-1 text-sm text-slate-500">
                  Current meeting status distribution
                </p>
              </div>

              <button
                onClick={() => goTo("/reports")}
                className="text-sm font-semibold text-blue-600 hover:text-blue-700"
              >
                View details →
              </button>
            </div>

            <div className="mt-6">
              <div className="mb-2 flex items-end justify-between">
                <div>
                  <p className="text-3xl font-bold text-slate-900">
                    {loadingMeetings
                      ? "..."
                      : stats.totalMeetings}
                  </p>

                  <p className="text-xs text-slate-400">
                    Total meetings
                  </p>
                </div>

                <div className="text-right">
                  <p className="font-bold text-emerald-600">
                    {loadingMeetings
                      ? "..."
                      : `${stats.completionRate}% completed`}
                  </p>

                  <p className="text-xs text-slate-400">
                    Overall completion
                  </p>
                </div>
              </div>

              <div className="flex h-3 overflow-hidden rounded-full bg-slate-100">
                {stats.totalMeetings > 0 && (
                  <>
                    <div
                      className="bg-blue-500"
                      style={{
                        width: `${
                          (stats.scheduled /
                            stats.totalMeetings) *
                          100
                        }%`,
                      }}
                    />

                    <div
                      className="bg-emerald-500"
                      style={{
                        width: `${
                          (stats.completed /
                            stats.totalMeetings) *
                          100
                        }%`,
                      }}
                    />

                    <div
                      className="bg-amber-400"
                      style={{
                        width: `${
                          (stats.rescheduled /
                            stats.totalMeetings) *
                          100
                        }%`,
                      }}
                    />
                  </>
                )}
              </div>
            </div>

            <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
              <StatusCard
                icon={<Clock3 className="h-4 w-4" />}
                label="Scheduled"
                value={stats.scheduled}
                percentage={
                  stats.totalMeetings
                    ? Math.round(
                        (stats.scheduled /
                          stats.totalMeetings) *
                          100
                      )
                    : 0
                }
                type="blue"
              />

              <StatusCard
                icon={
                  <CheckCircle2 className="h-4 w-4" />
                }
                label="Completed"
                value={stats.completed}
                percentage={
                  stats.totalMeetings
                    ? Math.round(
                        (stats.completed /
                          stats.totalMeetings) *
                          100
                      )
                    : 0
                }
                type="green"
              />

              <StatusCard
                icon={
                  <RefreshCw className="h-4 w-4" />
                }
                label="Rescheduled"
                value={stats.rescheduled}
                percentage={
                  stats.totalMeetings
                    ? Math.round(
                        (stats.rescheduled /
                          stats.totalMeetings) *
                          100
                      )
                    : 0
                }
                type="amber"
              />
            </div>
          </div>

          {/* Quick Actions */}
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="text-lg font-bold text-slate-900">
              Quick Actions
            </h3>

            <p className="mt-1 text-sm text-slate-500">
              Navigate to frequently used modules
            </p>

            <div className="mt-5 space-y-3">
              <QuickAction
                icon={
                  <CalendarDays className="h-5 w-5" />
                }
                title="Calendar"
                description="View meeting schedule"
                onClick={() => goTo("/calendar")}
              />

              <QuickAction
                icon={<Users className="h-5 w-5" />}
                title="Officers"
                description="Browse officer directory"
                onClick={() => goTo("/officers")}
              />

              <QuickAction
                icon={<FileText className="h-5 w-5" />}
                title="Reports"
                description="View meeting reports"
                onClick={() => goTo("/reports")}
              />

              <QuickAction
                icon={<Activity className="h-5 w-5" />}
                title="Meetings"
                description="Manage all meetings"
                onClick={() => goTo("/meetings")}
              />
            </div>
          </div>
        </section>

        {/* Footer spacing */}
        <div className="h-8" />
      </main>
    </div>
  );
}

/* ============================================================
   LOADING ROWS
============================================================ */

function LoadingRows() {
  return (
    <div className="space-y-3">
      {[1, 2, 3].map((item) => (
        <div
          key={item}
          className="flex items-center gap-4 rounded-xl border border-slate-100 p-4"
        >
          <div className="h-14 w-14 shrink-0 animate-pulse rounded-xl bg-slate-100" />

          <div className="flex-1 space-y-2">
            <div className="h-3 w-1/3 animate-pulse rounded bg-slate-100" />

            <div className="h-2 w-1/2 animate-pulse rounded bg-slate-100" />

            <div className="h-2 w-1/4 animate-pulse rounded bg-slate-100" />
          </div>
        </div>
      ))}
    </div>
  );
}

/* ============================================================
   EMPTY MEETINGS
============================================================ */

function EmptyMeetings() {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 px-6 py-12 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100">
        <CalendarDays className="h-6 w-6 text-slate-400" />
      </div>

      <h4 className="mt-4 font-semibold text-slate-800">
        No upcoming meetings
      </h4>

      <p className="mt-1 max-w-sm text-sm text-slate-500">
        There are currently no meetings scheduled
        for a future date.
      </p>
    </div>
  );
}

/* ============================================================
   STATUS CARD
============================================================ */

function StatusCard({
  icon,
  label,
  value,
  percentage,
  type,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  percentage: number;
  type: "blue" | "green" | "amber";
}) {
  const styles = {
    blue: {
      wrapper: "bg-blue-50 border-blue-100",
      icon: "text-blue-600",
      percentage: "text-blue-600",
    },
    green: {
      wrapper: "bg-emerald-50 border-emerald-100",
      icon: "text-emerald-600",
      percentage: "text-emerald-600",
    },
    amber: {
      wrapper: "bg-amber-50 border-amber-100",
      icon: "text-amber-600",
      percentage: "text-amber-600",
    },
  };

  return (
    <div
      className={`rounded-xl border p-4 ${styles[type].wrapper}`}
    >
      <div className="flex items-center gap-2">
        <span className={styles[type].icon}>
          {icon}
        </span>

        <span className="text-xs font-semibold text-slate-600">
          {label}
        </span>
      </div>

      <div className="mt-3 flex items-end justify-between">
        <span className="text-2xl font-bold text-slate-900">
          {value}
        </span>

        <span
          className={`text-xs font-bold ${styles[type].percentage}`}
        >
          {percentage}%
        </span>
      </div>
    </div>
  );
}

/* ============================================================
   QUICK ACTION
============================================================ */

function QuickAction({
  icon,
  title,
  description,
  onClick,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="group flex w-full items-center gap-3 rounded-xl border border-slate-100 p-3 text-left transition hover:border-blue-200 hover:bg-blue-50"
    >
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600 transition group-hover:bg-blue-100 group-hover:text-blue-600">
        {icon}
      </div>

      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-slate-800">
          {title}
        </p>

        <p className="truncate text-xs text-slate-500">
          {description}
        </p>
      </div>

      <ArrowRight className="h-4 w-4 text-slate-300 transition group-hover:translate-x-1 group-hover:text-blue-600" />
    </button>
  );
}