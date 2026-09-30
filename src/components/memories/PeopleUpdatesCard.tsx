"use client";

// Dashboard card: birthdays / service anniversaries coming up, and people whose
// posting changed since you last met — for everyone you have meetings with.

import { Cake, Award, ArrowRightLeft, Users } from "lucide-react";
import type { LivePerson, Occasion, PostingChange } from "@/lib/liveDirectory";
import { occasions as findOccasions, postingChanges } from "@/lib/liveDirectory";
import MemoryStyles from "@/components/memories/MemoryStyles";

const WINDOW_DAYS = 14;

const whenLabel = (o: Occasion) =>
  o.inDays === 0 ? "Today" : o.inDays === 1 ? "Tomorrow"
    : new Date(`${o.date}T00:00:00`).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });

const ordinal = (n: number) => {
  const s = ["th", "st", "nd", "rd"], v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
};

export default function PeopleUpdatesCard({ meetings, people, loading, delay = 0, onOpenMeeting }: {
  meetings: any[];
  people: Map<string, LivePerson>;
  loading?: boolean;
  delay?: number;
  onOpenMeeting?: (m: any) => void;
}) {
  const soon = findOccasions(people, WINDOW_DAYS);
  const nextOnes = soon.length ? [] : findOccasions(people, 366).slice(0, 1);
  const changes: PostingChange[] = postingChanges(meetings, people);

  return (
    <section className="mem-root mem-fade-up rounded-3xl border border-violet-100 bg-white p-5 shadow-sm" style={{ animationDelay: `${delay}ms` }}>
      <MemoryStyles />
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-slate-900">People updates</h2>
          <p className="mt-0.5 text-xs text-slate-500">Occasions and new postings of people you meet</p>
        </div>
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-violet-50 text-violet-600"><Users className="h-4 w-4" /></span>
      </div>

      {loading ? (
        <div className="mt-4 space-y-2">{[0, 1].map((i) => <div key={i} className="mem-skeleton h-12 rounded-2xl" />)}</div>
      ) : (
        <ul className="mt-4 space-y-2">
          {changes.map((c) => (
            <li key={`chg-${c.person.id}`}>
              <button
                type="button"
                onClick={() => onOpenMeeting?.(c.nextMeeting || c.lastMeeting)}
                className="flex w-full items-start gap-3 rounded-2xl bg-amber-50/70 p-3 text-left ring-1 ring-inset ring-amber-200 transition-colors hover:bg-amber-50"
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-white text-amber-600"><ArrowRightLeft className="h-4 w-4" /></span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-slate-900">{c.person.name} has a new posting</span>
                  <span className="block truncate text-xs text-slate-600">Now: {c.now}</span>
                  <span className="block truncate text-[11px] text-slate-400">Was: {c.was}{c.nextMeeting ? " · you meet them again soon" : ""}</span>
                </span>
              </button>
            </li>
          ))}

          {[...soon, ...nextOnes].map((o) => (
            <li key={`${o.kind}-${o.person.id}`} className={`flex items-center gap-3 rounded-2xl p-3 ${o.inDays === 0 ? "bg-fuchsia-50 ring-1 ring-inset ring-fuchsia-200" : "bg-slate-50/80"}`}>
              <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-white ${o.kind === "birthday" ? "text-fuchsia-600" : "text-sky-600"}`}>
                {o.kind === "birthday" ? <Cake className="h-4 w-4" /> : <Award className="h-4 w-4" />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-slate-900">{o.person.name}</span>
                <span className="block truncate text-xs text-slate-500">
                  {o.kind === "birthday" ? `Birthday · turns ${o.years}` : `${ordinal(o.years)} service anniversary`}
                  {o.person.designation ? ` · ${o.person.designation}` : ""}
                </span>
              </span>
              <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold ${o.inDays === 0 ? "bg-fuchsia-600 text-white" : "bg-white text-slate-600 ring-1 ring-inset ring-slate-200"}`}>
                {nextOnes.includes(o) ? `Next: ${whenLabel(o)}` : whenLabel(o)}
              </span>
            </li>
          ))}

          {!changes.length && !soon.length && !nextOnes.length && (
            <li className="rounded-2xl border border-dashed border-violet-200 bg-violet-50/40 px-4 py-6 text-center text-xs text-slate-500">
              No birthdays, anniversaries or posting changes to show. Dates come from the officer and contact records.
            </li>
          )}
        </ul>
      )}
    </section>
  );
}
