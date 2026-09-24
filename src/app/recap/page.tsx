"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  BarChart3, Briefcase, Building2, CalendarDays, Camera, ChevronLeft, Flame, MapPin, Play,
  ShieldCheck, Sparkles, TrendingDown, TrendingUp, Trophy, Users, XCircle,
} from "lucide-react";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import { currentUserName, fetchAllMeetings, formatDayLong, meetingTitle, photoUrl, type MemoryMeeting } from "@/lib/memories/meetingUtils";
import { computeRecap, recapYears, MONTHS, WEEKDAYS, type ServiceFilter } from "@/lib/memories/recap";
import RecapStory, { CountUp } from "@/components/memories/RecapStory";
import PhotoLightbox from "@/components/memories/PhotoLightbox";
import MemoryStyles from "@/components/memories/MemoryStyles";

/* same pastel KPI theme as the dashboard */
const KPI = {
  blue: { card: "from-sky-100 to-blue-100", icon: "bg-white text-sky-600", trend: "text-sky-700" },
  violet: { card: "from-violet-100 to-purple-100", icon: "bg-white text-violet-600", trend: "text-violet-700" },
  rose: { card: "from-rose-100 to-pink-100", icon: "bg-white text-rose-600", trend: "text-rose-700" },
  emerald: { card: "from-emerald-100 to-green-100", icon: "bg-white text-emerald-600", trend: "text-emerald-700" },
} as const;

export default function RecapPage() {
  return (
    <ProtectedRoute>
      <Suspense>
        <RecapView />
      </Suspense>
    </ProtectedRoute>
  );
}

function RecapView() {
  const router = useRouter();
  const params = useSearchParams();
  const thisYear = new Date().getFullYear();

  const [meetings, setMeetings] = useState<MemoryMeeting[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [year, setYear] = useState(thisYear);
  const [service, setService] = useState<ServiceFilter>("all");
  const [playing, setPlaying] = useState(false);
  const [viewer, setViewer] = useState<number | null>(null);
  const [userName] = useState(() => currentUserName());

  useEffect(() => {
    let live = true;
    fetchAllMeetings()
      .then((rows) => {
        if (!live) return;
        setMeetings(rows);
        if (params.get("play") === "1") setPlaying(true);
      })
      .catch((err) => live && setError(err instanceof Error ? err.message : "Unable to load meetings."))
      .finally(() => live && setLoading(false));

    return () => {
      live = false;
    };
  }, [params]);

  const years = useMemo(() => recapYears(meetings), [meetings]);
  const recap = useMemo(() => computeRecap(meetings, year, service), [meetings, year, service]);
  const change = recap.prevYearTotal ? Math.round(((recap.total - recap.prevYearTotal) / recap.prevYearTotal) * 100) : null;
  const maxMonth = Math.max(1, ...recap.byMonth);

  function closeStory() {
    setPlaying(false);
    if (params.get("play")) router.replace("/recap");
  }

  return (
    <div className="mem-root relative min-h-screen bg-gradient-to-br from-indigo-200 via-violet-100 to-purple-200 p-2.5 sm:p-5 lg:p-8">
      <MemoryStyles />

      <div aria-hidden className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="mem-blob absolute -left-32 -top-32 h-96 w-96 rounded-full bg-violet-300/40 blur-3xl" />
        <div className="mem-blob absolute -right-32 top-1/4 h-96 w-96 rounded-full bg-sky-300/30 blur-3xl" style={{ animationDelay: "-3s" }} />
        <div className="mem-blob absolute -bottom-32 left-1/3 h-96 w-96 rounded-full bg-fuchsia-300/25 blur-3xl" style={{ animationDelay: "-6s" }} />
      </div>

      <div className="relative mx-auto max-w-[1500px] overflow-hidden rounded-[1.75rem] bg-white shadow-2xl shadow-violet-300/40 ring-1 ring-white/70">
        {/* App bar */}
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 bg-white px-4 py-5 sm:px-6 sm:py-6">
          <div className="flex min-w-0 items-center gap-4">
            <button
              type="button"
              onClick={() => router.push("/")}
              aria-label="Back to dashboard"
              className="flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 transition-all duration-200 hover:-translate-y-0.5 hover:text-violet-600 active:scale-95"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <span className="mem-scale-in hidden h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-slate-900 to-slate-700 text-white shadow-lg shadow-slate-900/20 sm:flex sm:h-16 sm:w-16">
              <Trophy className="h-6 w-6 sm:h-7 sm:w-7" />
            </span>
            <div className="min-w-0">
              <h1 className="mem-fade-up truncate bg-gradient-to-r from-slate-900 via-violet-800 to-slate-900 bg-clip-text text-2xl font-extrabold leading-tight tracking-tight text-transparent sm:text-3xl lg:text-4xl">
                Yearly Recap
              </h1>
              <p className="mem-fade-up mt-1 truncate text-xs font-medium text-slate-400 sm:text-sm" style={{ animationDelay: "80ms" }}>
                {year === thisYear ? `${year} so far` : year} · meetings, officers and moments
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="mem-scroll flex max-w-full items-center gap-1 overflow-x-auto rounded-full bg-slate-100 p-1">
              {years.map((y) => (
                <button
                  key={y}
                  type="button"
                  onClick={() => setYear(y)}
                  className={`cursor-pointer rounded-full px-3.5 py-1.5 text-xs font-semibold tabular-nums transition-all duration-200 ${
                    y === year ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
                  }`}
                >
                  {y}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-1 rounded-full bg-slate-100 p-1">
              {(["all", "IAS", "IPS"] as ServiceFilter[]).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setService(s)}
                  className={`cursor-pointer rounded-full px-3.5 py-1.5 text-xs font-semibold transition-all duration-200 ${
                    s === service ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
                  }`}
                >
                  {s === "all" ? "All" : s}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="space-y-6 bg-[#f7f6fd] p-4 sm:p-6 lg:p-7">
          {error && (
            <div className="mem-fade-up flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700 shadow-sm">
              <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                <p className="font-semibold">Couldn&apos;t load the recap</p>
                <p className="mt-0.5 text-xs text-rose-600">{error}</p>
              </div>
            </div>
          )}

          {/* Hero */}
          <section className="mem-fade-up relative overflow-hidden rounded-3xl bg-gradient-to-br from-slate-900 via-violet-900 to-fuchsia-800 p-6 text-white shadow-lg shadow-violet-900/20 sm:p-8">
            <div aria-hidden className="mem-blob pointer-events-none absolute -right-16 -top-20 h-72 w-72 rounded-full bg-fuchsia-400/25 blur-3xl" />
            <div aria-hidden className="mem-blob pointer-events-none absolute -bottom-24 left-10 h-64 w-64 rounded-full bg-sky-400/20 blur-3xl" style={{ animationDelay: "-4s" }} />
            <div className="relative flex flex-wrap items-end justify-between gap-6">
              <div>
                <p className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.16em] text-white/80">
                  <Sparkles className="h-3.5 w-3.5" /> {service === "all" ? "All officers" : `${service} officers`}
                </p>
                <p className="mt-4 text-5xl font-black tracking-tight sm:text-6xl">{year}</p>
                <p className="mt-2 max-w-md text-sm text-white/75">
                  {loading
                    ? "Gathering your meetings…"
                    : recap.total
                    ? `${recap.total} meetings with ${recap.officers} officers${recap.photos ? ` and ${recap.photos} photos` : ""}. Play it as a story.`
                    : `No meetings recorded in ${year} yet.`}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPlaying(true)}
                disabled={loading || recap.total === 0}
                className="group inline-flex h-12 cursor-pointer items-center gap-2.5 rounded-full bg-white px-6 text-sm font-bold text-slate-900 shadow-xl shadow-black/20 transition-all duration-300 hover:-translate-y-0.5 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0"
              >
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-violet-600 to-fuchsia-600 text-white transition-transform duration-300 group-hover:scale-110">
                  <Play className="h-3.5 w-3.5 fill-current" />
                </span>
                Play recap
              </button>
            </div>
          </section>

          {/* KPIs */}
          <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Kpi accent="blue" icon={<CalendarDays className="h-5 w-5" />} label="Meetings held" value={recap.total} loading={loading} delay={80} down={change !== null && change < 0}
              sub={change === null ? `${recap.completed} completed` : `${change >= 0 ? "+" : ""}${change}% vs ${year - 1}`} />
            <Kpi accent="violet" icon={<Users className="h-5 w-5" />} label="Officers met" value={recap.officers} loading={loading} delay={150}
              sub={recap.newOfficers ? `${recap.newOfficers} met for the first time` : "All familiar faces"} />
            <Kpi accent="rose" icon={<Camera className="h-5 w-5" />} label="Photos captured" value={recap.photos} loading={loading} delay={220}
              sub={`${recap.highlights.length ? "See moments below" : "Add photos to meetings"}`} />
            <Kpi accent="emerald" icon={<MapPin className="h-5 w-5" />} label="Places visited" value={recap.places} loading={loading} delay={290}
              sub={recap.topPlace ? `Mostly ${recap.topPlace.name}` : "—"} />
          </section>

          <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
            <div className="space-y-6 xl:col-span-2">
              {/* Month by month */}
              <Card title="Month by month" subtitle={recap.total ? `Busiest: ${MONTHS[recap.busiestMonth]} (${recap.byMonth[recap.busiestMonth]})` : "No meetings yet"} delay={200}>
                {loading ? (
                  <div className="mem-skeleton h-44 rounded-2xl" />
                ) : recap.total === 0 ? (
                  <Empty icon={<BarChart3 className="h-6 w-6 text-slate-400" />} text={`No meetings recorded in ${year}.`} />
                ) : (
                  <div className="relative">
                    <div className="pointer-events-none absolute inset-x-0 top-0 h-44" aria-hidden>
                      {[0, 25, 50, 75, 100].map((pos) => (
                        <div key={pos} className="absolute inset-x-0 border-t border-dashed border-slate-200/80" style={{ top: `${pos}%` }} />
                      ))}
                    </div>
                    <div className="relative flex h-44 gap-1.5 sm:gap-3">
                      {recap.byMonth.map((v, i) => (
                        <div key={i} className="group relative flex h-full flex-1 flex-col justify-end">
                          <div className="pointer-events-none absolute left-1/2 z-20 hidden -translate-x-1/2 whitespace-nowrap rounded-xl bg-slate-900/95 px-2.5 py-1.5 text-[11px] font-semibold text-white shadow-xl group-hover:block"
                            style={{ bottom: `calc(${(v / maxMonth) * 100}% + 8px)` }}>
                            {MONTHS[i]}: {v}
                          </div>
                          <div
                            className={`mem-bar w-full rounded-t-xl ${i === recap.busiestMonth ? "bg-gradient-to-t from-violet-600 to-fuchsia-500" : "bg-violet-300/80 group-hover:bg-violet-400"}`}
                            style={{ height: v ? `${Math.max((v / maxMonth) * 100, 6)}%` : 0, animationDelay: `${i * 40}ms` }}
                          />
                        </div>
                      ))}
                    </div>
                    <div className="mt-2 flex gap-1.5 sm:gap-3">
                      {MONTHS.map((m, i) => (
                        <div key={m} className="flex-1 text-center">
                          <span className={`text-xs ${i === recap.busiestMonth ? "font-bold text-violet-600" : "font-medium text-slate-500"}`}>{m.slice(0, 3)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </Card>

              {/* Moments */}
              <Card title="Moments" subtitle={`${recap.photos} photo${recap.photos === 1 ? "" : "s"} from ${year}`} delay={280}
                badge={recap.photos}>
                {loading ? (
                  <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
                    {Array.from({ length: 6 }).map((_, i) => <div key={i} className="mem-skeleton aspect-square rounded-2xl" />)}
                  </div>
                ) : recap.highlights.length === 0 ? (
                  <Empty icon={<Camera className="h-6 w-6 text-violet-400" />} text="Add photos to your meetings and they'll show up here." />
                ) : (
                  <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
                    {recap.highlights.map((h, i) => (
                      <button key={h.meeting.id + h.name} type="button" onClick={() => setViewer(i)}
                        className="mem-fade-up group relative aspect-square cursor-zoom-in overflow-hidden rounded-2xl bg-slate-100"
                        style={{ animationDelay: `${i * 50}ms` }}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={photoUrl(h.meeting, h.name, "400x400")} alt={meetingTitle(h.meeting)} loading="lazy"
                          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105" />
                      </button>
                    ))}
                  </div>
                )}
              </Card>
            </div>

            <div className="space-y-6">
              {/* Most met */}
              <Card title="Most met officers" subtitle="By number of meetings" delay={240}>
                {loading ? (
                  <div className="space-y-2">{[0, 1, 2].map((i) => <div key={i} className="mem-skeleton h-14 rounded-2xl" />)}</div>
                ) : recap.topOfficers.length === 0 ? (
                  <Empty icon={<Users className="h-6 w-6 text-slate-400" />} text="No officers yet." />
                ) : (
                  <ol className="space-y-2">
                    {recap.topOfficers.map((o, i) => (
                      <li key={o.key} className="mem-fade-up flex items-center gap-3 rounded-2xl border border-slate-100 p-3 transition-colors hover:border-violet-200 hover:bg-violet-50/40"
                        style={{ animationDelay: `${i * 60}ms` }}>
                        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl text-sm font-extrabold ${
                          i === 0 ? "bg-slate-900 text-white" : "bg-gradient-to-b from-violet-100 to-violet-50 text-violet-900"}`}>
                          {i + 1}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-slate-900">{o.name}</p>
                          <p className="truncate text-xs text-slate-500">{[o.designation, o.service].filter(Boolean).join(" · ") || "Officer"}</p>
                        </div>
                        <span className="rounded-full bg-violet-50 px-2.5 py-1 text-xs font-bold tabular-nums text-violet-700">{o.count}</span>
                      </li>
                    ))}
                  </ol>
                )}
              </Card>

              {/* Highlights */}
              <Card title="Highlights" subtitle="Patterns from the year" delay={320}>
                <div className="space-y-1">
                  <Fact icon={<Flame className="h-4 w-4 text-amber-600" />} iconClass="bg-amber-50" label="Longest weekly streak"
                    value={recap.longestWeekStreak ? `${recap.longestWeekStreak} wk` : "—"} loading={loading} />
                  <Fact icon={<CalendarDays className="h-4 w-4 text-violet-600" />} iconClass="bg-violet-50" label="Favourite day"
                    value={recap.total ? WEEKDAYS[recap.favouriteWeekday] : "—"} loading={loading} />
                  <Fact icon={<Building2 className="h-4 w-4 text-sky-600" />} iconClass="bg-sky-50" label="Top department"
                    value={recap.topDepartment?.name ?? "—"} loading={loading} />
                  {service === "all" && (
                    <>
                      <Fact icon={<Briefcase className="h-4 w-4 text-violet-600" />} iconClass="bg-violet-50" label="IAS meetings" value={recap.ias} loading={loading} />
                      <Fact icon={<ShieldCheck className="h-4 w-4 text-rose-600" />} iconClass="bg-rose-50" label="IPS meetings" value={recap.ips} loading={loading} />
                    </>
                  )}
                </div>
                {recap.first && (
                  <p className="mt-4 rounded-2xl bg-slate-50/80 px-3.5 py-3 text-xs leading-relaxed text-slate-500">
                    First meeting of {year}: <span className="font-semibold text-slate-700">{meetingTitle(recap.first.meeting)}</span> on {formatDayLong(recap.first.day)}
                  </p>
                )}
              </Card>
            </div>
          </div>
        </div>
      </div>

      <PhotoLightbox
        images={recap.highlights.map((h) => ({ src: photoUrl(h.meeting, h.name, "1200x0"), caption: meetingTitle(h.meeting) }))}
        index={viewer}
        onIndexChange={setViewer}
      />

      {playing && recap.total > 0 && <RecapStory recap={recap} name={userName} onClose={closeStory} />}
    </div>
  );
}

/* ── small pieces in the dashboard's style ───── */

function Kpi({ accent, icon, label, value, sub, loading, delay, down }: {
  accent: keyof typeof KPI; icon: ReactNode; label: string; value: number; sub: string; loading: boolean; delay: number; down?: boolean;
}) {
  const Trend = down ? TrendingDown : TrendingUp;
  const t = KPI[accent];
  return (
    <div style={{ animationDelay: `${delay}ms` }}
      className={`mem-fade-up group relative overflow-hidden rounded-3xl bg-gradient-to-br p-5 transition-all duration-300 hover:-translate-y-1 hover:shadow-lg hover:shadow-slate-900/[0.08] ${t.card}`}>
      <span aria-hidden className="pointer-events-none absolute -right-6 -top-6 h-20 w-20 rounded-full bg-white/50 transition-transform duration-300 group-hover:scale-125" />
      <div className="relative flex items-start justify-between gap-3">
        <p className="pt-1.5 text-sm font-semibold text-slate-600">{label}</p>
        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full shadow-sm transition-transform duration-300 group-hover:scale-110 ${t.icon}`}>{icon}</span>
      </div>
      <div className="relative mt-4">
        {loading ? (
          <div className="mem-skeleton h-8 w-16 rounded-xl" />
        ) : (
          <>
            <p className="text-[1.85rem] font-extrabold leading-none tracking-tight text-slate-900"><CountUp to={value} ms={900} /></p>
            <p className="mt-2 flex items-center gap-1 truncate text-xs font-medium text-slate-500">
              <Trend className={`h-3.5 w-3.5 shrink-0 ${t.trend}`} />
              {sub}
            </p>
          </>
        )}
      </div>
    </div>
  );
}

function Card({ title, subtitle, children, delay, badge }: {
  title: string; subtitle?: string; children: ReactNode; delay: number; badge?: number;
}) {
  return (
    <section className="mem-fade-up rounded-3xl border border-violet-100 bg-white p-5 shadow-sm" style={{ animationDelay: `${delay}ms` }}>
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-slate-900">{title}</h2>
          {subtitle && <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>}
        </div>
        {badge !== undefined && (
          <span className="rounded-full bg-violet-50 px-3 py-1 text-xs font-bold tabular-nums text-violet-700">{badge}</span>
        )}
      </div>
      {children}
    </section>
  );
}

function Fact({ icon, iconClass, label, value, loading }: {
  icon: ReactNode; iconClass: string; label: string; value: string | number; loading: boolean;
}) {
  return (
    <div className="flex items-center gap-3 rounded-2xl p-2 transition-colors hover:bg-slate-50">
      <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${iconClass}`}>{icon}</span>
      <p className="flex-1 truncate text-sm font-medium text-slate-600">{label}</p>
      {loading ? <div className="mem-skeleton h-5 w-10 rounded-full" /> : <p className="max-w-[45%] truncate text-sm font-bold text-slate-900">{value}</p>}
    </div>
  );
}

function Empty({ icon, text }: { icon: ReactNode; text: string }) {
  return (
    <div className="mem-fade-up flex flex-col items-center justify-center rounded-2xl border border-dashed border-violet-200 bg-violet-50/40 px-6 py-8 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white shadow-sm">{icon}</div>
      <p className="mt-3 max-w-xs text-xs leading-relaxed text-slate-500">{text}</p>
    </div>
  );
}
