"use client";

import { useMemo } from "react";
import Link from "next/link";
import { ArrowRight, Crown, Play, Trophy } from "lucide-react";
import { computeRecap } from "@/lib/memories/recap";
import type { MemoryMeeting } from "@/lib/memories/meetingUtils";
import MemoryStyles from "@/components/memories/MemoryStyles";

type Props = {
  meetings: MemoryMeeting[];
  loading?: boolean;
  delay?: number;
};

/** Dashboard card that leads to the Yearly Recap page. */
export default function RecapTeaserCard({ meetings, loading, delay = 0 }: Props) {
  const year = new Date().getFullYear();
  const recap = useMemo(() => computeRecap(meetings, year), [meetings, year]);

  const stats: [string, number][] = [
    ["Meetings", recap.total],
    ["People", recap.officers],
    ["Photos", recap.photos],
  ];
  const leaders = recap.topOfficers.filter((o) => o.rank === 1);

  return (
    <section
      className="mem-root mem-fade-up group relative overflow-hidden rounded-3xl bg-gradient-to-br from-violet-100 via-purple-100 to-fuchsia-100 p-5 shadow-sm ring-1 ring-violet-100"
      style={{ animationDelay: `${delay}ms` }}
    >
      <MemoryStyles />
      <span aria-hidden className="pointer-events-none absolute -right-8 -top-8 h-28 w-28 rounded-full bg-white/50 transition-transform duration-500 group-hover:scale-125" />
      <span aria-hidden className="pointer-events-none absolute -bottom-10 -left-6 h-24 w-24 rounded-full bg-white/30" />

      <div className="relative flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-violet-600">Yearly Recap</p>
          <h2 className="mt-1 text-lg font-extrabold leading-tight tracking-tight text-slate-900">
            Your {year} in review
          </h2>
          <p className="mt-0.5 text-xs text-slate-500">Meetings, officers and moments, as a story</p>
        </div>
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white text-violet-600 shadow-sm transition-transform duration-300 group-hover:scale-110">
          <Trophy className="h-5 w-5" />
        </span>
      </div>

      <div className="relative mt-4 grid grid-cols-3 gap-2">
        {stats.map(([label, value]) => (
          <div key={label} className="rounded-2xl bg-white/70 px-3 py-2.5 backdrop-blur-sm">
            {loading ? (
              <div className="mem-skeleton h-5 w-8 rounded-full" />
            ) : (
              <p className="text-lg font-extrabold leading-none tabular-nums text-slate-900">{value}</p>
            )}
            <p className="mt-1 text-[11px] font-medium text-slate-500">{label}</p>
          </div>
        ))}
      </div>

      {!loading && leaders.length > 0 && (
        <div className="relative mt-3 flex items-center gap-3 rounded-2xl bg-white/70 px-3 py-2.5 backdrop-blur-sm">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-900 text-white">
            <Crown className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-medium text-slate-500">
              Most met{leaders.length > 1 ? ` (tied, ${leaders[0].count} each)` : ""}
              {leaders.length === 1 && leaders[0].upcoming > 0 && ` · ${leaders[0].held} held, ${leaders[0].upcoming} upcoming`}
            </p>
            <p className="truncate text-sm font-bold text-slate-900">
              {leaders[0].name}
              {leaders.length > 1 && <span className="font-medium text-slate-500"> +{leaders.length - 1} more</span>}
            </p>
          </div>
          {leaders.length === 1 && (
            <span className="shrink-0 rounded-full bg-violet-50 px-2.5 py-1 text-xs font-bold tabular-nums text-violet-700">
              {leaders[0].count} meetings
            </span>
          )}
        </div>
      )}

      <div className="relative mt-4 flex items-center gap-2">
        <Link
          href="/recap?play=1"
          className="group/btn inline-flex h-10 cursor-pointer items-center gap-2 rounded-full bg-slate-900 px-4 text-xs font-semibold text-white shadow-lg shadow-slate-900/10 transition-all duration-300 hover:-translate-y-0.5 hover:bg-slate-800 active:scale-[0.98]"
        >
          <Play className="h-3.5 w-3.5 fill-current transition-transform duration-300 group-hover/btn:scale-110" />
          Play recap
        </Link>
        <Link
          href="/recap"
          className="inline-flex h-10 cursor-pointer items-center gap-1.5 rounded-full border border-white/80 bg-white/60 px-4 text-xs font-semibold text-slate-600 transition-all duration-200 hover:-translate-y-0.5 hover:bg-white hover:text-violet-700 active:scale-95"
        >
          Details
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>
    </section>
  );
}
