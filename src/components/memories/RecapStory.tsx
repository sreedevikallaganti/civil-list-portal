"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import {
  Briefcase, Building2, CalendarDays, Camera, Flame, MapPin, RotateCcw, ShieldCheck,
  Sparkles, TrendingDown, TrendingUp, Users, X,
} from "lucide-react";
import { MONTHS, WEEKDAYS, type Recap } from "@/lib/memories/recap";
import { formatDayLong, meetingTitle, photoUrl } from "@/lib/memories/meetingUtils";
import MemoryStyles from "@/components/memories/MemoryStyles";

const SLIDE_MS = 6000;

/* ── building blocks ─────────────────────────── */

export function CountUp({ to, ms = 1100 }: { to: number; ms?: number }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / ms);
      setN(Math.round(to * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [to, ms]);
  return <span className="tabular-nums">{n.toLocaleString("en-IN")}</span>;
}

function Kicker({ icon, children }: { icon?: ReactNode; children: ReactNode }) {
  return (
    <p className="mem-fade-up inline-flex items-center gap-2 self-start rounded-full bg-white/15 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.16em] text-white/90 backdrop-blur">
      {icon}
      {children}
    </p>
  );
}

function Big({ children }: { children: ReactNode }) {
  return <p className="mem-pop mt-4 text-7xl font-black leading-none tracking-tight sm:text-8xl">{children}</p>;
}

function Headline({ children }: { children: ReactNode }) {
  return <p className="mem-pop mt-4 text-5xl font-black leading-[1.05] tracking-tight sm:text-6xl">{children}</p>;
}

function Line({ children, d = 1, icon }: { children: ReactNode; d?: 1 | 2 | 3; icon?: ReactNode }) {
  return (
    <p className={`mem-fade-up mem-d${d} mt-4 flex items-start gap-2 text-base font-medium leading-snug text-white/90 sm:text-lg`}>
      {icon && <span className="mt-0.5 shrink-0 text-white/70">{icon}</span>}
      <span>{children}</span>
    </p>
  );
}

function MonthBars({ values, highlight }: { values: number[]; highlight: number }) {
  const max = Math.max(1, ...values);
  return (
    <div className="mem-fade-up mem-d2 mt-8 flex items-end gap-1.5" aria-label="Meetings per month">
      {values.map((v, i) => (
        <div key={i} className="flex flex-1 flex-col items-center gap-1">
          <span className={`text-[10px] tabular-nums ${i === highlight ? "font-bold text-white" : "text-white/60"}`}>{v || ""}</span>
          <div
            className={`mem-bar w-full rounded-t-lg ${i === highlight ? "bg-white" : "bg-white/30"}`}
            style={{ height: v ? Math.max(6, Math.round((v / max) * 120)) : 2, animationDelay: `${400 + i * 50}ms` }}
          />
          <span className={`text-[10px] ${i === highlight ? "font-bold text-white" : "text-white/60"}`}>{MONTHS[i][0]}</span>
        </div>
      ))}
    </div>
  );
}

/* ── slides ──────────────────────────────────── */

type Slide = { bg: string; body: ReactNode };

function buildSlides(r: Recap, name: string): Slide[] {
  const change = r.prevYearTotal ? Math.round(((r.total - r.prevYearTotal) / r.prevYearTotal) * 100) : null;
  const scope = r.service === "all" ? "" : ` with ${r.service} officers`;
  const slides: Slide[] = [];

  slides.push({
    bg: "from-slate-900 via-violet-900 to-fuchsia-800",
    body: (
      <>
        <Kicker icon={<Sparkles className="h-3.5 w-3.5" />}>Civil List Portal</Kicker>
        <p className="mem-pop mt-6 text-7xl font-black tracking-tight sm:text-8xl">{r.year}</p>
        <p className="mem-fade-up mem-d1 mt-2 text-3xl font-extrabold">Year in review</p>
        <Line d={2}>{name}, here&apos;s a look back at the meetings, officers and moments{scope} this year.</Line>
      </>
    ),
  });

  slides.push({
    bg: "from-sky-600 via-blue-700 to-indigo-800",
    body: (
      <>
        <Kicker icon={<CalendarDays className="h-3.5 w-3.5" />}>Meetings held</Kicker>
        <Big><CountUp to={r.total} /></Big>
        {change !== null && (
          <Line icon={change >= 0 ? <TrendingUp className="h-5 w-5" /> : <TrendingDown className="h-5 w-5" />}>
            {change === 0 ? `Exactly as many as ${r.year - 1}` : `${Math.abs(change)}% ${change > 0 ? "more" : "fewer"} than ${r.year - 1} (${r.prevYearTotal})`}
          </Line>
        )}
        {r.completed > 0 && <Line d={2}><b>{r.completed}</b> marked completed</Line>}
        {r.photos > 0 && <Line d={3} icon={<Camera className="h-5 w-5" />}><b>{r.photos}</b> photos captured along the way</Line>}
      </>
    ),
  });

  slides.push({
    bg: "from-emerald-600 via-teal-700 to-cyan-800",
    body: (
      <>
        <Kicker icon={<Users className="h-3.5 w-3.5" />}>Officers met</Kicker>
        <Big><CountUp to={r.officers} /></Big>
        {r.newOfficers > 0 && <Line>…including <b>{r.newOfficers}</b> met for the very first time</Line>}
        {r.departments > 0 && (
          <Line d={2} icon={<Building2 className="h-5 w-5" />}>
            across <b>{r.departments}</b> department{r.departments > 1 ? "s" : ""}
            {r.topDepartment ? <>, mostly <b>{r.topDepartment.name}</b></> : null}
          </Line>
        )}
      </>
    ),
  });

  if (r.service === "all" && r.ias + r.ips > 0) {
    const iasPct = Math.round((r.ias / (r.ias + r.ips)) * 100);
    slides.push({
      bg: "from-indigo-700 via-violet-700 to-rose-700",
      body: (
        <>
          <Kicker>IAS vs IPS</Kicker>
          <div className="mt-8 space-y-5">
            {[
              { label: "IAS", sub: "Administrative service", value: r.ias, icon: <Briefcase className="h-6 w-6" />, pct: iasPct },
              { label: "IPS", sub: "Police service", value: r.ips, icon: <ShieldCheck className="h-6 w-6" />, pct: 100 - iasPct },
            ].map((s, i) => (
              <div key={s.label} className={`mem-fade-up mem-d${(i + 1) as 1 | 2} rounded-3xl bg-white/12 p-4 backdrop-blur`}>
                <div className="flex items-center gap-3">
                  <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-violet-700">{s.icon}</span>
                  <div className="flex-1">
                    <p className="text-2xl font-black leading-none"><CountUp to={s.value} /> <span className="text-sm font-semibold text-white/70">meetings</span></p>
                    <p className="mt-1 text-xs text-white/70">{s.label} · {s.sub}</p>
                  </div>
                  <p className="text-xl font-extrabold tabular-nums">{s.pct}%</p>
                </div>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/20">
                  <div className="mem-bar h-full origin-left rounded-full bg-white" style={{ width: `${s.pct}%`, animationName: "none" }} />
                </div>
              </div>
            ))}
          </div>
        </>
      ),
    });
  }

  slides.push({
    bg: "from-rose-600 via-pink-600 to-fuchsia-700",
    body: (
      <>
        <Kicker icon={<CalendarDays className="h-3.5 w-3.5" />}>Busiest month</Kicker>
        <Headline>{MONTHS[r.busiestMonth]}</Headline>
        <Line d={1}><b>{r.byMonth[r.busiestMonth]}</b> meetings in a single month</Line>
        <MonthBars values={r.byMonth} highlight={r.busiestMonth} />
      </>
    ),
  });

  if (r.topOfficers.length) {
    slides.push({
      bg: "from-amber-500 via-orange-600 to-rose-700",
      body: (
        <>
          <Kicker icon={<Users className="h-3.5 w-3.5" />}>Most met</Kicker>
          <ol className="mt-8 space-y-3">
            {r.topOfficers.slice(0, 3).map((o, i) => (
              <li key={o.key} className={`mem-fade-up mem-d${(i + 1) as 1 | 2 | 3} flex items-center gap-4 rounded-3xl bg-white/12 p-3.5 backdrop-blur`}>
                <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-xl font-black ${o.rank === 1 ? "bg-white text-orange-600" : "bg-white/20"}`}>
                  {o.rank}
                </span>
                <div className="min-w-0">
                  <p className="truncate text-xl font-extrabold leading-tight">{o.name}</p>
                  <p className="truncate text-xs text-white/80">
                    {[o.designation, o.service].filter(Boolean).join(" · ")}
                    {o.designation || o.service ? " · " : ""}
                    {o.count} meeting{o.count > 1 ? "s" : ""}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </>
      ),
    });
  }

  if (r.places > 0) {
    slides.push({
      bg: "from-teal-600 via-emerald-700 to-green-800",
      body: (
        <>
          <Kicker icon={<MapPin className="h-3.5 w-3.5" />}>On the road</Kicker>
          <Big><CountUp to={r.places} /></Big>
          <Line>different places visited</Line>
          {r.topPlace && <Line d={2} icon={<MapPin className="h-5 w-5" />}>Most visited: <b>{r.topPlace.name}</b> ({r.topPlace.count}×)</Line>}
        </>
      ),
    });
  }

  slides.push({
    bg: "from-violet-700 via-indigo-800 to-slate-900",
    body: (
      <>
        <Kicker icon={<Flame className="h-3.5 w-3.5" />}>The rhythm</Kicker>
        <Headline>{WEEKDAYS[r.favouriteWeekday]}s</Headline>
        <Line>were the favourite day for meetings</Line>
        {r.longestWeekStreak > 1 && (
          <Line d={2} icon={<Flame className="h-5 w-5" />}>
            Longest streak: <b>{r.longestWeekStreak} weeks</b> in a row with a meeting
          </Line>
        )}
        {r.first && (
          <Line d={3} icon={<Sparkles className="h-5 w-5" />}>
            It all started on {formatDayLong(r.first.day)} with “{meetingTitle(r.first.meeting)}”
          </Line>
        )}
      </>
    ),
  });

  if (r.highlights.length) {
    slides.push({
      bg: "from-slate-900 via-slate-950 to-black",
      body: (
        <>
          <Kicker icon={<Camera className="h-3.5 w-3.5" />}>Moments from {r.year}</Kicker>
          <div className="mt-6 grid grid-cols-3 gap-2">
            {r.highlights.slice(0, 9).map((h, i) => (
              <div key={h.meeting.id + h.name} className="mem-pop aspect-square overflow-hidden rounded-2xl" style={{ animationDelay: `${i * 110}ms` }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={photoUrl(h.meeting, h.name, "400x400")} alt={meetingTitle(h.meeting)} className="h-full w-full object-cover" />
              </div>
            ))}
          </div>
        </>
      ),
    });
  }

  slides.push({
    bg: "from-slate-900 via-violet-900 to-fuchsia-800",
    body: (
      <>
        <Kicker icon={<Sparkles className="h-3.5 w-3.5" />}>{r.year} wrapped</Kicker>
        <dl className="mt-6 grid grid-cols-2 gap-2.5">
          {(
            [
              ["Meetings", r.total],
              ["Officers", r.officers],
              ["New faces", r.newOfficers],
              ["Photos", r.photos],
              ["Places", r.places],
              ["Top month", r.total ? MONTHS[r.busiestMonth].slice(0, 3) : "—"],
            ] as [string, number | string][]
          ).map(([label, value], i) => (
            <div key={label} className="mem-fade-up rounded-2xl bg-white/12 p-3.5 backdrop-blur" style={{ animationDelay: `${i * 80}ms` }}>
              <dt className="text-[10px] font-bold uppercase tracking-wider text-white/60">{label}</dt>
              <dd className="mt-1 text-2xl font-black tabular-nums">{value}</dd>
            </div>
          ))}
        </dl>
        <Line d={3}>Here&apos;s to an even better {r.year + 1}.</Line>
      </>
    ),
  });

  return slides;
}

/* ── player ──────────────────────────────────── */

export default function RecapStory({ recap, name, onClose }: { recap: Recap; name: string; onClose: () => void }) {
  const slides = buildSlides(recap, name);
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  const [progress, setProgress] = useState(0);
  const elapsed = useRef(0);
  const last = i === slides.length - 1;

  const go = useCallback(
    (step: number) => {
      elapsed.current = 0;
      setProgress(0);
      setI((cur) => Math.min(slides.length - 1, Math.max(0, cur + step)));
    },
    [slides.length]
  );

  useEffect(() => {
    if (paused || last) return;
    let raf = 0;
    let prev = performance.now();
    const tick = (now: number) => {
      elapsed.current += now - prev;
      prev = now;
      const p = Math.min(1, elapsed.current / SLIDE_MS);
      setProgress(p);
      if (p >= 1) go(1);
      else raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [i, paused, last, go]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === " ") { e.preventDefault(); go(1); }
      if (e.key === "ArrowLeft") go(-1);
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [go, onClose]);

  const slide = slides[i];

  return (
    <div className="mem-root mem-fade-in fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/95 backdrop-blur">
      <MemoryStyles />
      <div
        className={`relative flex h-full w-full max-w-md flex-col overflow-hidden bg-gradient-to-br text-white shadow-2xl transition-colors duration-500 sm:h-[92vh] sm:rounded-[1.75rem] ${slide.bg}`}
        onPointerDown={() => setPaused(true)}
        onPointerUp={() => setPaused(false)}
        onPointerLeave={() => setPaused(false)}
      >
        {/* progress */}
        <div className="absolute inset-x-0 top-0 z-30 flex gap-1 px-3 pt-3">
          {slides.map((_, k) => (
            <div key={k} className="h-1 flex-1 overflow-hidden rounded-full bg-white/25">
              <div className="h-full rounded-full bg-white" style={{ width: `${k < i || (k === i && last) ? 100 : k === i ? progress * 100 : 0}%` }} />
            </div>
          ))}
        </div>

        <div className="absolute inset-x-0 top-6 z-30 flex items-center justify-between px-4">
          <span className="text-xs font-semibold text-white/70">Recap {recap.year}</span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close recap"
            className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/20 active:scale-95"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* soft blobs, same as the dashboard background */}
        <div aria-hidden className="mem-blob pointer-events-none absolute -right-20 -top-16 h-72 w-72 rounded-full bg-white/10 blur-3xl" />
        <div aria-hidden className="mem-blob pointer-events-none absolute -bottom-24 -left-16 h-80 w-80 rounded-full bg-fuchsia-300/20 blur-3xl" style={{ animationDelay: "-4s" }} />

        {/* key re-mounts the slide so its animations replay */}
        <div key={i} className="relative z-10 flex flex-1 flex-col justify-center px-7 pb-20 pt-20">
          {slide.body}
        </div>

        {/* tap zones */}
        <button type="button" aria-label="Previous" className="absolute inset-y-0 left-0 z-20 w-1/3 cursor-w-resize" onClick={() => go(-1)} />
        {!last && <button type="button" aria-label="Next" className="absolute inset-y-0 right-0 z-20 w-2/3 cursor-e-resize" onClick={() => go(1)} />}

        {last && (
          <div className="absolute inset-x-0 bottom-6 z-30 flex justify-center gap-2.5">
            <button
              type="button"
              onClick={() => { elapsed.current = 0; setProgress(0); setI(0); }}
              className="inline-flex h-11 cursor-pointer items-center gap-2 rounded-full bg-white/15 px-5 text-sm font-semibold backdrop-blur transition hover:bg-white/25 active:scale-95"
            >
              <RotateCcw className="h-4 w-4" /> Replay
            </button>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-11 cursor-pointer items-center rounded-full bg-white px-6 text-sm font-semibold text-slate-900 shadow-lg transition hover:-translate-y-0.5 active:scale-95"
            >
              Done
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
