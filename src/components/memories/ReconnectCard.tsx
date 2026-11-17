"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import {
  Building2, CalendarPlus, ChevronDown, History, Mail, MapPin, Phone, Search, Users, X,
} from "lucide-react";
import {
  computeTrips, homeCity as guessHomeCity, peopleMetIn, rangeText, visitedCities, whenText,
  type ReconnectPerson, type Trip,
} from "@/lib/memories/reconnect";
import { findInDirectory, type DirectoryPerson } from "@/lib/memories/directory";
import { KNOWN_CITIES, cityFromText, titleCase } from "@/lib/memories/places";
import { meetingTitle, photoUrl, type MemoryMeeting } from "@/lib/memories/meetingUtils";
import { isoDay } from "@/lib/trips";
import MemoryStyles from "@/components/memories/MemoryStyles";

const HIDE_KEY = "civil-list:reconnect-hidden";
const SHOW = 3;

/* avatar colours — same as the Officers page (IAS sky, IPS indigo, others amber) */
const AVATAR: Record<string, string> = {
  IAS: "from-sky-400 to-blue-600",
  IPS: "from-indigo-400 to-violet-600",
  Contact: "from-amber-400 to-orange-500",
  "": "from-amber-400 to-orange-500",
};

type Props<T extends MemoryMeeting> = {
  /** The meetings the dashboard already loaded. */
  meetings: T[];
  /** Open a meeting — pass the dashboard's openMeetingDetails. */
  onOpenMeeting?: (meeting: T) => void;
  /** Fallback "Plan meeting" when a pre-filled link can't be built — e.g. the dashboard's openCreatePanel. */
  onPlanMeeting?: (who: { name: string; city: string }) => void;
  /** Your base city, if the automatic guess is wrong (e.g. "Hyderabad"). */
  homeCity?: string;
  delay?: number;
};

type View = { kind: "trip"; id: string } | { kind: "city"; city: string };
type Tab = "met" | "directory";

const tripId = (t: Trip) => `${t.city}:${+t.start}`;

function initials(name: string) {
  return (name || "?")
    .replace(/^(sri|smt|shri|dr|mr|mrs|ms)\.?\s+/i, "")
    .trim()
    .split(/\s+/)
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

const normName = (n: string) => n.toLowerCase().replace(/^(sri|smt|shri|dr|mr|mrs|ms)\.?\s+/, "").replace(/\s+/g, " ").trim();

function agoText(d: Date) {
  const months = Math.round((Date.now() - +d) / (30.44 * 86_400_000));
  if (months < 1) return "this month";
  if (months < 12) return `${months} mo ago`;
  const years = Math.floor(months / 12);
  return `${years} yr${years > 1 ? "s" : ""} ago`;
}

/* Opens the New Meeting form on the Meetings page, pre-filled with the person, city and trip date */
function planHref(city: string, date: string, who: { meetingId?: string; directory?: DirectoryPerson }) {
  const q = new URLSearchParams({ city });
  if (date) q.set("date", date);
  if (who.meetingId) q.set("schedule", who.meetingId);
  if (who.directory) q.set("person", `${who.directory.kind}:${who.directory.id}`);
  return `/meetings?${q}`;
}

/**
 * Reconnect — "You're going to Dubai. Last time you met these people there."
 *  • Upcoming trip (meetings in another city in the next 45 days) → people met there before
 *  • "Other city" → type any city to see who you know there
 *  • Also lists officers / contacts in your directory who are based in that city
 */
export default function ReconnectCard<T extends MemoryMeeting>({
  meetings,
  onOpenMeeting,
  onPlanMeeting,
  homeCity,
  delay = 0,
}: Props<T>) {
  const home = useMemo(() => homeCity ?? guessHomeCity(meetings), [meetings, homeCity]);
  const trips = useMemo(() => computeTrips(meetings, { home }), [meetings, home]);
  const cities = useMemo(() => visitedCities(meetings, home), [meetings, home]);

  const [hidden, setHidden] = useState<string[]>(() => {
    try {
      return typeof window !== "undefined" ? JSON.parse(localStorage.getItem(HIDE_KEY) || "[]") : [];
    } catch {
      return [];
    }
  });
  const visibleTrips = trips.filter((t) => !hidden.includes(tripId(t)));

  const [view, setView] = useState<View | null>(null);
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<Tab>("met");
  const [showAll, setShowAll] = useState(false);

  // default view: the next trip, otherwise the city search
  const current: View =
    view && (view.kind === "city" || visibleTrips.some((t) => tripId(t) === view.id))
      ? view
      : visibleTrips[0]
      ? { kind: "trip", id: tripId(visibleTrips[0]) }
      : { kind: "city", city: "" };

  const trip = current.kind === "trip" ? visibleTrips.find((t) => tripId(t) === current.id) ?? null : null;
  const city = trip ? trip.city : current.kind === "city" ? current.city : "";
  const planDate = trip ? isoDay(trip.start < new Date() ? new Date() : trip.start) : "";

  const people: ReconnectPerson[] = trip ? trip.people : city ? peopleMetIn(meetings, city) : [];

  /* directory matches for the active city */
  const [directory, setDirectory] = useState<{ city: string; list: DirectoryPerson[] } | null>(null);
  useEffect(() => {
    if (!city) return;
    let live = true;
    findInDirectory(city).then((list) => live && setDirectory({ city, list }));
    return () => {
      live = false;
    };
  }, [city]);

  const metNames = new Set(people.map((p) => normName(p.name)));
  const plannedNames = new Set((trip?.planned ?? []).map((p) => normName(p.meeting.officer_name || "")));
  const directoryList =
    directory && directory.city === city
      ? directory.list.filter((d) => !metNames.has(normName(d.name)) && !plannedNames.has(normName(d.name)))
      : null;

  if (!visibleTrips.length && !cities.length) return null;

  function select(next: View) {
    setView(next);
    setTab("met");
    setShowAll(false);
  }

  function dismiss(t: Trip) {
    const next = [...hidden, tripId(t)];
    setHidden(next);
    setTab("met");
    setShowAll(false);
    setView(null);
    try {
      localStorage.setItem(HIDE_KEY, JSON.stringify(next.slice(-30)));
    } catch {}
  }

  function search(text: string) {
    const c = cityFromText(text) || (text.trim() ? titleCase(text.trim()) : "");
    select({ kind: "city", city: c });
    setQuery(c);
  }

  const plannedOfficers = (trip?.planned ?? []).map((p) => p.meeting.officer_name).filter(Boolean);
  // if nobody was met there before, open straight on the directory list
  const activeTab: Tab = tab === "met" && people.length === 0 && (directoryList?.length ?? 0) > 0 ? "directory" : tab;
  const count = activeTab === "met" ? people.length : directoryList?.length ?? 0;
  const limit = showAll ? 30 : SHOW;

  const tabBtn = (t: Tab, icon: ReactNode, label: string, n: number | null) => (
    <button
      type="button"
      role="tab"
      aria-selected={activeTab === t}
      onClick={() => {
        setTab(t);
        setShowAll(false);
      }}
      className={`flex min-w-0 flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-all duration-200 ${
        activeTab === t ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
      }`}
    >
      {icon}
      <span className="truncate">{label}</span>
      <span className={`rounded-full px-1.5 text-[10px] tabular-nums ${activeTab === t ? "bg-violet-100 text-violet-700" : "bg-slate-200/70 text-slate-500"}`}>
        {n === null ? "…" : n}
      </span>
    </button>
  );

  return (
    <section
      className="mem-root mem-fade-up overflow-hidden rounded-3xl border border-violet-100 bg-white shadow-sm"
      style={{ animationDelay: `${delay}ms` }}
    >
      <MemoryStyles />

      {/* Header */}
      <div className="flex items-start justify-between gap-3 px-5 pt-5">
        <div className="min-w-0">
          <h2 className="text-base font-bold text-slate-900">Reconnect</h2>
          <p className="mt-0.5 text-xs text-slate-500">People you know in the cities you&apos;re heading to</p>
        </div>
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-violet-50 text-violet-600">
          <Users className="h-4 w-4" />
        </span>
      </div>

      {/* City tabs — one per upcoming trip, plus "Other city" */}
      <div role="tablist" aria-label="Trips" className="nice-scroll flex gap-2 overflow-x-auto px-5 pb-1 pt-4">
        {visibleTrips.map((t) => {
          const on = !!trip && tripId(trip) === tripId(t);
          return (
            <button
              key={tripId(t)}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => select({ kind: "trip", id: tripId(t) })}
              className={`flex shrink-0 cursor-pointer flex-col items-start rounded-2xl px-3.5 py-2 text-left ring-1 ring-inset transition-all duration-200 ${
                on ? "bg-violet-50 ring-violet-300" : "bg-white ring-slate-200 hover:bg-slate-50"
              }`}
            >
              <span className={`text-sm font-bold leading-tight ${on ? "text-violet-900" : "text-slate-800"}`}>{t.city}</span>
              <span className="text-[11px] text-slate-500">{whenText(t.daysAway)}</span>
            </button>
          );
        })}
        <button
          type="button"
          role="tab"
          aria-selected={!trip}
          onClick={() => select({ kind: "city", city: trip ? "" : city })}
          className={`flex shrink-0 cursor-pointer items-center gap-2 rounded-2xl px-3.5 py-2 text-left ring-1 ring-inset transition-all duration-200 ${
            !trip ? "bg-violet-50 ring-violet-300" : "bg-white ring-slate-200 hover:bg-slate-50"
          }`}
        >
          <Search className={`h-4 w-4 ${!trip ? "text-violet-600" : "text-slate-400"}`} />
          <span>
            <span className={`block text-sm font-bold leading-tight ${!trip ? "text-violet-900" : "text-slate-800"}`}>
              {!trip && city ? city : "Other city"}
            </span>
            <span className="block text-[11px] text-slate-500">Planning a trip?</span>
          </span>
        </button>
      </div>

      <div key={trip ? tripId(trip) : `city-${city}`} className="px-5 pb-5 pt-3">
        {/* Trip summary */}
        {trip && (
          <div className="flex items-center gap-2 rounded-2xl bg-slate-50/80 px-3 py-2">
            <MapPin className="h-3.5 w-3.5 shrink-0 text-violet-500" />
            <p className="min-w-0 flex-1 truncate text-xs text-slate-600">
              <b className="font-semibold text-slate-800">{rangeText(trip.start, trip.end)}</b>
              {" · "}
              {trip.planned.length} meeting{trip.planned.length > 1 ? "s" : ""} planned
              {plannedOfficers.length ? ` with ${plannedOfficers.slice(0, 2).join(", ")}${plannedOfficers.length > 2 ? ` +${plannedOfficers.length - 2}` : ""}` : ""}
            </p>
            <button
              type="button"
              onClick={() => onOpenMeeting?.(trip.planned[0].meeting as T)}
              className="shrink-0 cursor-pointer text-[11px] font-semibold text-violet-600 hover:underline"
            >
              View
            </button>
            <button
              type="button"
              onClick={() => dismiss(trip)}
              aria-label="Hide this trip"
              title="Hide this trip"
              className="flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded-full text-slate-400 transition hover:bg-white hover:text-slate-600"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        {/* City search */}
        {!trip && (
          <div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                search(query);
              }}
              className="relative"
            >
              <MapPin className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                list="reconnect-cities"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  if (KNOWN_CITIES.includes(e.target.value) || cities.some((c) => c.city === e.target.value)) search(e.target.value);
                }}
                placeholder="Where are you travelling? e.g. Dubai, Delhi…"
                className="h-10 w-full rounded-full border border-slate-200 bg-slate-50/80 pl-11 pr-20 text-sm text-slate-900 placeholder-slate-400 transition-all duration-200 hover:border-slate-300 hover:bg-white focus:border-violet-400 focus:bg-white focus:outline-none focus:ring-4 focus:ring-violet-500/10"
              />
              <datalist id="reconnect-cities">
                {[...new Set([...cities.map((c) => c.city), ...KNOWN_CITIES])].map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
              <button
                type="submit"
                className="absolute right-1 top-1/2 h-8 -translate-y-1/2 cursor-pointer rounded-full bg-slate-900 px-4 text-xs font-semibold text-white transition hover:bg-slate-800 active:scale-95"
              >
                Find
              </button>
            </form>
            {cities.length > 0 && (
              <div className="nice-scroll mt-2.5 flex gap-1.5 overflow-x-auto pb-1">
                {cities.slice(0, 10).map((c) => (
                  <button
                    key={c.city}
                    type="button"
                    onClick={() => search(c.city)}
                    className={`shrink-0 cursor-pointer rounded-full border px-3 py-1 text-[11px] font-semibold transition-all duration-200 active:scale-95 ${
                      city === c.city
                        ? "border-violet-300 bg-violet-50 text-violet-700"
                        : "border-slate-200 bg-white text-slate-600 hover:border-violet-200 hover:text-violet-700"
                    }`}
                  >
                    {c.city} <span className="tabular-nums text-slate-400">{c.count}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {city && (
          <>
            {/* Which list */}
            <div role="tablist" className="mt-3 flex gap-1 rounded-full bg-slate-100 p-1">
              {tabBtn("met", <History className="h-3.5 w-3.5 shrink-0" />, "Met here before", people.length)}
              {tabBtn("directory", <Building2 className="h-3.5 w-3.5 shrink-0" />, `Based in ${city}`, directoryList ? directoryList.length : null)}
            </div>

            <div className={`mt-3 ${showAll ? "nice-scroll max-h-80 overflow-y-auto pr-1" : ""}`}>
              {activeTab === "met" ? (
                people.length === 0 ? (
                  <Empty>No past meetings in <b className="text-slate-700">{city}</b> yet.</Empty>
                ) : (
                  <ul className="space-y-2">
                    {people.slice(0, limit).map((p, i) => (
                      <PersonRow
                        key={p.key}
                        person={p}
                        index={i}
                        onOpen={() => onOpenMeeting?.(p.lastMeeting as T)}
                        planHref={p.lastMeeting?.id ? planHref(city, planDate, { meetingId: p.lastMeeting.id }) : undefined}
                        onPlan={onPlanMeeting ? () => onPlanMeeting({ name: p.name, city }) : undefined}
                      />
                    ))}
                  </ul>
                )
              ) : directoryList === null ? (
                <div className="space-y-2">{[0, 1].map((i) => <div key={i} className="mem-skeleton h-14 rounded-2xl" />)}</div>
              ) : directoryList.length === 0 ? (
                <Empty>No officers or contacts in the directory mention <b className="text-slate-700">{city}</b>.</Empty>
              ) : (
                <ul className="space-y-2">
                  {directoryList.slice(0, limit).map((d, i) => (
                    <DirectoryRow key={`${d.kind}-${d.id}`} person={d} index={i} planHref={planHref(city, planDate, { directory: d })} />
                  ))}
                </ul>
              )}
            </div>

            {count > SHOW && (
              <button
                type="button"
                onClick={() => setShowAll((v) => !v)}
                className="mt-2.5 inline-flex cursor-pointer items-center gap-1 text-xs font-semibold text-violet-600 hover:underline"
              >
                {showAll ? "Show fewer" : `Show ${count - SHOW} more`}
                <ChevronDown className={`h-3.5 w-3.5 transition-transform ${showAll ? "rotate-180" : ""}`} />
              </button>
            )}
          </>
        )}
      </div>
    </section>
  );
}

/* ── rows ─────────────────────────────────────── */

function Empty({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-2xl border border-dashed border-violet-200 bg-violet-50/40 px-4 py-5 text-center text-xs text-slate-500">{children}</p>
  );
}

const PLAN_CLASS =
  "group/btn inline-flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-full bg-slate-900 text-[11px] font-semibold text-white shadow-md shadow-slate-900/10 transition-all duration-200 hover:-translate-y-0.5 hover:bg-slate-800 active:scale-95 sm:h-auto sm:w-auto sm:px-3.5 sm:py-2";

function PlanButton({ href, onClick }: { href?: string; onClick?: () => void }) {
  const inner = (
    <>
      <CalendarPlus className="h-3.5 w-3.5 transition-transform group-hover/btn:scale-110" />
      <span className="hidden sm:inline">Plan meeting</span>
    </>
  );
  if (href) {
    return (
      <Link href={href} aria-label="Plan meeting" title="Plan meeting" className={PLAN_CLASS}>
        {inner}
      </Link>
    );
  }
  if (!onClick) return null;
  return (
    <button type="button" onClick={onClick} aria-label="Plan meeting" title="Plan meeting" className={PLAN_CLASS}>
      {inner}
    </button>
  );
}

function PersonRow({
  person: p,
  index,
  onOpen,
  planHref,
  onPlan,
}: {
  person: ReconnectPerson;
  index: number;
  onOpen: () => void;
  planHref?: string;
  onPlan?: () => void;
}) {
  return (
    <li
      className="mem-fade-up group flex items-center gap-3 rounded-2xl border border-slate-100 bg-white p-2.5 transition-all duration-200 hover:border-violet-200 hover:bg-violet-50/40"
      style={{ animationDelay: `${index * 40}ms` }}
    >
      <div className="relative shrink-0">
        {p.photo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={photoUrl(p.photo.meeting, p.photo.name, "400x400")} alt="" className="h-10 w-10 rounded-xl object-cover" />
        ) : (
          <div className={`flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br text-xs font-bold text-white ${AVATAR[p.service]}`}>
            {initials(p.name)}
          </div>
        )}
      </div>

      <button type="button" onClick={onOpen} className="min-w-0 flex-1 cursor-pointer text-left" title={`Last: “${meetingTitle(p.lastMeeting)}”`}>
        <span className="flex items-center gap-1.5">
          <span className="truncate text-sm font-semibold text-slate-900 transition-colors group-hover:text-violet-700">{p.name}</span>
          {p.service && <span className="shrink-0 rounded-md bg-violet-50 px-1.5 py-0.5 text-[10px] font-bold text-violet-700">{p.service}</span>}
        </span>
        <span className="block truncate text-[11px] text-slate-500">
          {p.designation ? `${p.designation} · ` : ""}met {p.count}× · last {agoText(p.lastDay)}
        </span>
      </button>

      <PlanButton href={planHref} onClick={onPlan} />
    </li>
  );
}

function DirectoryRow({ person: d, index, planHref }: { person: DirectoryPerson; index: number; planHref: string }) {
  const iconBtn =
    "hidden h-8 w-8 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 transition hover:border-violet-200 hover:text-violet-600 sm:flex";
  return (
    <li
      className="mem-fade-up group flex items-center gap-3 rounded-2xl border border-slate-100 bg-white p-2.5 transition-all duration-200 hover:border-violet-200 hover:bg-violet-50/40"
      style={{ animationDelay: `${index * 40}ms` }}
    >
      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br text-xs font-bold text-white ${AVATAR[d.kind]}`}>
        {initials(d.name)}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <p className="truncate text-sm font-semibold text-slate-900">{d.name}</p>
          <span className="shrink-0 rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-500">{d.kind}</span>
        </div>
        <p className="truncate text-[11px] text-slate-500">{[d.role, d.org].filter(Boolean).join(" · ") || "Not met yet"}</p>
      </div>
      {d.phone && (
        <a href={`tel:${d.phone}`} title={d.phone} aria-label={`Call ${d.name}`} className={iconBtn}>
          <Phone className="h-3.5 w-3.5" />
        </a>
      )}
      {d.email && (
        <a href={`mailto:${d.email}`} title={d.email} aria-label={`Email ${d.name}`} className={iconBtn}>
          <Mail className="h-3.5 w-3.5" />
        </a>
      )}
      <PlanButton href={planHref} />
    </li>
  );
}
