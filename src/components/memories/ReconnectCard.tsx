"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CalendarPlus, ChevronRight, History, Mail, MapPin, Phone, Plane, Search, Sparkles, Users, X,
} from "lucide-react";
import {
  computeTrips, homeCity as guessHomeCity, peopleMetIn, rangeText, visitedCities, whenText,
  type ReconnectPerson, type Trip,
} from "@/lib/memories/reconnect";
import { findInDirectory, type DirectoryPerson } from "@/lib/memories/directory";
import { KNOWN_CITIES, cityFromText, titleCase } from "@/lib/memories/places";
import { meetingTitle, photoUrl, type MemoryMeeting } from "@/lib/memories/meetingUtils";
import MemoryStyles from "@/components/memories/MemoryStyles";

const HIDE_KEY = "civil-list:reconnect-hidden";

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
  /** "Plan meeting" button — e.g. the dashboard's openCreatePanel. */
  onPlanMeeting?: (who: { name: string; city: string }) => void;
  /** Your base city, if the automatic guess is wrong (e.g. "Hyderabad"). */
  homeCity?: string;
  delay?: number;
};

type View = { kind: "trip"; id: string } | { kind: "city"; city: string };

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
  if (months < 12) return `${months} month${months > 1 ? "s" : ""} ago`;
  const years = Math.floor(months / 12);
  return `${years} year${years > 1 ? "s" : ""} ago`;
}

/**
 * Reconnect — "You're going to Dubai. Last time you met these people there."
 *  • Upcoming trip (meetings in another city in the next 45 days) → people met there before
 *  • "Planning a trip?" → type any city to see who you know there
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

  // default view: the next trip, otherwise the "Planning a trip?" search
  const current: View =
    view && (view.kind === "city" || visibleTrips.some((t) => tripId(t) === view.id))
      ? view
      : visibleTrips[0]
      ? { kind: "trip", id: tripId(visibleTrips[0]) }
      : { kind: "city", city: "" };

  const trip = current.kind === "trip" ? visibleTrips.find((t) => tripId(t) === current.id) ?? null : null;
  const city = trip ? trip.city : current.kind === "city" ? current.city : "";

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

  function dismiss(t: Trip) {
    const next = [...hidden, tripId(t)];
    setHidden(next);
    setView(null);
    try {
      localStorage.setItem(HIDE_KEY, JSON.stringify(next.slice(-30)));
    } catch {}
  }

  function search(text: string) {
    const c = cityFromText(text) || (text.trim() ? titleCase(text.trim()) : "");
    setView({ kind: "city", city: c });
    setQuery(c);
  }

  const plannedOfficers = (trip?.planned ?? []).map((p) => p.meeting.officer_name).filter(Boolean);

  return (
    <section
      className="mem-root mem-fade-up overflow-hidden rounded-3xl border border-violet-100 bg-white shadow-sm"
      style={{ animationDelay: `${delay}ms` }}
    >
      <MemoryStyles />

      {/* Header */}
      <div className="relative overflow-hidden bg-gradient-to-br from-sky-50 via-violet-50 to-fuchsia-50 px-5 py-4">
        <span aria-hidden className="pointer-events-none absolute -right-10 -top-12 h-32 w-32 rounded-full bg-white/60" />
        <div className="relative flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-sky-500 to-violet-600 text-white shadow-md shadow-violet-500/20">
              <Plane className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-violet-600">Reconnect</p>
              <h2 className="truncate text-base font-bold text-slate-900">
                {trip ? `${trip.city} trip ${whenText(trip.daysAway)}` : city ? `Planning a trip to ${city}?` : "Planning a trip?"}
              </h2>
              <p className="mt-0.5 truncate text-xs text-slate-500">
                {trip
                  ? `${rangeText(trip.start, trip.end)} · ${trip.planned.length} meeting${trip.planned.length > 1 ? "s" : ""} planned${
                      plannedOfficers.length ? ` (with ${plannedOfficers.slice(0, 2).join(", ")}${plannedOfficers.length > 2 ? "…" : ""})` : ""
                    }`
                  : "See who you've met there before, and who's in your directory"}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 rounded-full bg-white/80 p-1 shadow-sm">
              {visibleTrips.map((t) => (
                <button
                  key={tripId(t)}
                  type="button"
                  onClick={() => setView({ kind: "trip", id: tripId(t) })}
                  className={`cursor-pointer rounded-full px-3 py-1.5 text-xs font-semibold transition-all duration-200 ${
                    trip && tripId(trip) === tripId(t) ? "bg-slate-900 text-white shadow-sm" : "text-slate-500 hover:text-slate-700"
                  }`}
                >
                  {t.city}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setView({ kind: "city", city: "" })}
                aria-label="Search a city"
                title="Planning a trip? Search a city"
                className={`flex h-7 w-7 cursor-pointer items-center justify-center rounded-full transition-all duration-200 ${
                  !trip ? "bg-slate-900 text-white shadow-sm" : "text-slate-500 hover:text-slate-700"
                }`}
              >
                <Search className="h-3.5 w-3.5" />
              </button>
            </div>
            {trip && (
              <button
                type="button"
                onClick={() => dismiss(trip)}
                aria-label="Dismiss this trip"
                title="Dismiss this trip"
                className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-full text-slate-400 transition-all hover:bg-white hover:text-slate-600 active:scale-90"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
      </div>

      <div key={trip ? tripId(trip) : `city-${city}`} className="p-5">
        {/* City search (when not showing a trip) */}
        {!trip && (
          <div className="mb-4">
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
                className="h-11 w-full rounded-full border border-slate-200 bg-slate-50/80 pl-11 pr-24 text-sm text-slate-900 placeholder-slate-400 transition-all duration-200 hover:border-slate-300 hover:bg-white focus:border-violet-400 focus:bg-white focus:outline-none focus:ring-4 focus:ring-violet-500/10"
              />
              <datalist id="reconnect-cities">
                {[...new Set([...cities.map((c) => c.city), ...KNOWN_CITIES])].map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
              <button
                type="submit"
                className="absolute right-1.5 top-1/2 h-8 -translate-y-1/2 cursor-pointer rounded-full bg-slate-900 px-4 text-xs font-semibold text-white transition hover:bg-slate-800 active:scale-95"
              >
                Find
              </button>
            </form>
            {cities.length > 0 && (
              <div className="mt-3 flex flex-wrap items-center gap-1.5">
                <span className="text-[11px] font-medium text-slate-400">Visited before:</span>
                {cities.slice(0, 8).map((c) => (
                  <button
                    key={c.city}
                    type="button"
                    onClick={() => search(c.city)}
                    className={`cursor-pointer rounded-full border px-3 py-1 text-[11px] font-semibold transition-all duration-200 active:scale-95 ${
                      city === c.city
                        ? "border-violet-300 bg-violet-50 text-violet-700"
                        : "border-slate-200 bg-white text-slate-600 hover:border-violet-200 hover:text-violet-700"
                    }`}
                  >
                    {c.city} <span className="tabular-nums text-slate-400">· {c.count}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {city && (
          <>
            {people.length > 0 ? (
              <>
                <p className="mb-3 flex items-center gap-1.5 text-xs font-semibold text-slate-600">
                  <Sparkles className="h-3.5 w-3.5 text-violet-500" />
                  You met {people.length === 1 ? "this person" : `these ${Math.min(people.length, 5)} people`} in {city} before — meet again?
                </p>
                <ul className="space-y-2.5">
                  {people.slice(0, 5).map((p, i) => (
                    <PersonRow
                      key={p.key}
                      person={p}
                      index={i}
                      onOpen={() => onOpenMeeting?.(p.lastMeeting as T)}
                      onPlan={onPlanMeeting ? () => onPlanMeeting({ name: p.name, city }) : undefined}
                    />
                  ))}
                </ul>
              </>
            ) : (
              <p className="rounded-2xl border border-dashed border-violet-200 bg-violet-50/40 px-4 py-4 text-center text-xs text-slate-500">
                No past meetings found in <span className="font-semibold text-slate-700">{city}</span> yet.
              </p>
            )}

            {/* Directory matches */}
            {directoryList === null ? (
              <div className="mt-4 space-y-2">
                {[0, 1].map((i) => <div key={i} className="mem-skeleton h-12 rounded-2xl" />)}
              </div>
            ) : directoryList.length > 0 ? (
              <div className="mt-5">
                <p className="mb-2 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  <Users className="h-3.5 w-3.5" /> Also in your directory · based in {city}
                </p>
                <ul className="space-y-2">
                  {directoryList.slice(0, 4).map((d, i) => (
                    <DirectoryRow
                      key={`${d.kind}-${d.id}`}
                      person={d}
                      index={i}
                      onPlan={onPlanMeeting ? () => onPlanMeeting({ name: d.name, city }) : undefined}
                    />
                  ))}
                </ul>
              </div>
            ) : null}
          </>
        )}

        {trip && (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3 text-[11px] text-slate-400">
            <span className="flex items-center gap-1.5">
              <History className="h-3.5 w-3.5" />
              {trip.people.length} {trip.people.length === 1 ? "person" : "people"} from {trip.pastVisits} past meeting
              {trip.pastVisits === 1 ? "" : "s"} in {trip.city}
            </span>
            <button
              type="button"
              onClick={() => onOpenMeeting?.(trip.planned[0].meeting as T)}
              className="inline-flex cursor-pointer items-center gap-0.5 font-semibold text-violet-600 hover:underline"
            >
              View trip meeting <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </div>
    </section>
  );
}

/* ── rows ─────────────────────────────────────── */

function PlanButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Plan meeting"
      title="Plan meeting"
      className="group/btn inline-flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-full bg-slate-900 text-[11px] font-semibold text-white shadow-md shadow-slate-900/10 transition-all duration-200 hover:-translate-y-0.5 hover:bg-slate-800 active:scale-95 sm:h-auto sm:w-auto sm:px-3.5 sm:py-2"
    >
      <CalendarPlus className="h-3.5 w-3.5 transition-transform group-hover/btn:scale-110" />
      <span className="hidden sm:inline">Plan meeting</span>
    </button>
  );
}

function PersonRow({
  person: p,
  index,
  onOpen,
  onPlan,
}: {
  person: ReconnectPerson;
  index: number;
  onOpen: () => void;
  onPlan?: () => void;
}) {
  return (
    <li
      className="mem-fade-up group flex items-center gap-3 rounded-2xl border border-slate-100 bg-white p-3 transition-all duration-200 hover:-translate-y-0.5 hover:border-violet-200 hover:bg-violet-50/40 hover:shadow-md hover:shadow-slate-900/[0.04]"
      style={{ animationDelay: `${index * 60}ms` }}
    >
      <div className="relative shrink-0">
        {p.photo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={photoUrl(p.photo.meeting, p.photo.name, "400x400")} alt="" className="h-12 w-12 rounded-2xl object-cover ring-2 ring-white" />
        ) : (
          <div className={`flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br text-sm font-bold text-white shadow-sm ${AVATAR[p.service]}`}>
            {initials(p.name)}
          </div>
        )}
        {p.photo && (
          <span className={`absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-gradient-to-br text-[8px] font-bold text-white ring-2 ring-white ${AVATAR[p.service]}`}>
            {initials(p.name).slice(0, 1)}
          </span>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <p className="line-clamp-2 text-sm font-semibold leading-snug text-slate-900 sm:truncate">{p.name}</p>
          {p.service && <span className="rounded-full bg-violet-50 px-2 py-0.5 text-[10px] font-bold text-violet-700">{p.service}</span>}
        </div>
        <p className="truncate text-xs text-slate-500">
          {p.designation ? `${p.designation} · ` : ""}met {p.count}× · last met {agoText(p.lastDay)}
        </p>
        <button
          type="button"
          onClick={onOpen}
          className="mt-0.5 inline-flex max-w-full cursor-pointer items-center gap-1 truncate text-[11px] font-medium text-slate-400 transition-colors hover:text-violet-600"
        >
          <History className="h-3 w-3 shrink-0" />
          <span className="truncate">“{meetingTitle(p.lastMeeting)}”</span>
        </button>
      </div>

      {onPlan && <PlanButton onClick={onPlan} />}
    </li>
  );
}

function DirectoryRow({ person: d, index, onPlan }: { person: DirectoryPerson; index: number; onPlan?: () => void }) {
  return (
    <li
      className="mem-fade-up flex items-center gap-3 rounded-2xl border border-dashed border-slate-200 bg-slate-50/50 p-3 transition-colors hover:border-violet-200 hover:bg-violet-50/30"
      style={{ animationDelay: `${index * 50}ms` }}
    >
      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br text-xs font-bold text-white shadow-sm ring-2 ring-white ${AVATAR[d.kind]}`}>
        {initials(d.name)}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <p className="line-clamp-2 text-sm font-semibold leading-snug text-slate-900 sm:truncate">{d.name}</p>
          <span className="hidden shrink-0 rounded-full bg-white px-2 py-0.5 text-[10px] font-bold text-slate-500 ring-1 ring-inset ring-slate-200 sm:inline">{d.kind}</span>
        </div>
        <p className="truncate text-xs text-slate-500">
          <span className="sm:hidden">{d.kind} · </span>
          {[d.role, d.org].filter(Boolean).join(" · ") || "Not met yet"}
        </p>
      </div>
      {d.phone && (
        <a href={`tel:${d.phone}`} title={d.phone} aria-label={`Call ${d.name}`}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 transition hover:border-violet-200 hover:text-violet-600">
          <Phone className="h-3.5 w-3.5" />
        </a>
      )}
      {d.email && (
        <a href={`mailto:${d.email}`} title={d.email} aria-label={`Email ${d.name}`}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 transition hover:border-violet-200 hover:text-violet-600">
          <Mail className="h-3.5 w-3.5" />
        </a>
      )}
      {onPlan && <PlanButton onClick={onPlan} />}
    </li>
  );
}
