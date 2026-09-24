"use client";

import { useMemo, useState } from "react";
import { Camera, ChevronRight, Clock3, History, MapPin, Sparkles, User, X } from "lucide-react";
import { computeMemories } from "@/lib/memories/onThisDay";
import {
  formatDayLong,
  formatTime,
  meetingPlace,
  meetingTitle,
  photoUrl,
  type MemoryMeeting,
} from "@/lib/memories/meetingUtils";
import PhotoLightbox from "@/components/memories/PhotoLightbox";
import MemoryStyles from "@/components/memories/MemoryStyles";

const HIDE_KEY = "civil-list:on-this-day-hidden";

type Props<T extends MemoryMeeting> = {
  /** The meetings the dashboard already loaded (no extra request). */
  meetings: T[];
  /** Open a meeting — pass the dashboard's openMeetingDetails. */
  onOpenMeeting?: (meeting: T) => void;
  /** Animation delay, to fit the dashboard's staggered entrance. */
  delay?: number;
};

function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function yearsText(n: number) {
  return n === 1 ? "1 year ago" : `${n} years ago`;
}

/**
 * "On this day" card, like Google Photos memories.
 * Shows nothing when there are no memories, so it never leaves a gap in the layout.
 */
export default function OnThisDayCard<T extends MemoryMeeting>({ meetings, onOpenMeeting, delay = 0 }: Props<T>) {
  const memories = useMemo(() => computeMemories(meetings), [meetings]);
  const [active, setActive] = useState(0);
  const [viewer, setViewer] = useState<number | null>(null);
  const [hidden, setHidden] = useState(() => {
    try {
      return typeof window !== "undefined" && localStorage.getItem(HIDE_KEY) === todayKey();
    } catch {
      return false;
    }
  });

  const group = memories.groups[Math.min(active, memories.groups.length - 1)];
  const photos = useMemo(
    () => (group?.meetings ?? []).flatMap(({ meeting, day }) => (meeting.photos ?? []).map((name) => ({ meeting, day, name }))),
    [group]
  );

  if (hidden || memories.mode === "none" || !group) return null;

  const lead = group.meetings[0];
  const rest = group.meetings.slice(1);
  const cover = lead.meeting.photos?.[0];
  const subtitle =
    memories.mode === "today"
      ? `${yearsText(group.yearsAgo)} today · ${formatDayLong(lead.day)}`
      : `This week, ${yearsText(group.yearsAgo)}`;

  const open = (m: MemoryMeeting) => onOpenMeeting?.(m as T);

  function hideForToday() {
    try {
      localStorage.setItem(HIDE_KEY, todayKey());
    } catch {}
    setHidden(true);
  }

  return (
    <section
      className="mem-root mem-fade-up overflow-hidden rounded-3xl border border-violet-100 bg-white shadow-sm"
      style={{ animationDelay: `${delay}ms` }}
    >
      <MemoryStyles />

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white shadow-md shadow-violet-500/20">
            <Sparkles className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <h2 className="text-base font-bold text-slate-900">On This Day</h2>
            <p className="mt-0.5 truncate text-xs text-slate-500">{subtitle}</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {memories.groups.length > 1 && (
            <div className="flex items-center gap-1 rounded-full bg-slate-100 p-1">
              {memories.groups.map((g, i) => (
                <button
                  key={g.yearsAgo}
                  type="button"
                  onClick={() => { setActive(i); setViewer(null); }}
                  className={`cursor-pointer rounded-full px-3 py-1.5 text-xs font-semibold transition-all duration-200 ${
                    i === active ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
                  }`}
                >
                  {g.yearsAgo}y
                </button>
              ))}
            </div>
          )}
          <button
            type="button"
            onClick={hideForToday}
            aria-label="Hide until tomorrow"
            title="Hide until tomorrow"
            className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-full text-slate-400 transition-all hover:bg-slate-100 hover:text-slate-600 active:scale-90"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div key={group.yearsAgo} className="p-5">
        {/* Lead memory */}
        {cover ? (
          <div className="mem-fade-in relative overflow-hidden rounded-2xl bg-slate-900">
            <button type="button" onClick={() => setViewer(0)} className="block w-full cursor-zoom-in" aria-label="Open photos">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={photoUrl(lead.meeting, cover, "1200x0")} alt="" className="mem-ken h-56 w-full object-cover opacity-90 sm:h-64" />
            </button>
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-slate-950/90 via-slate-900/30 to-transparent" />
            <span className="pointer-events-none absolute left-4 top-4 inline-flex items-center gap-1.5 rounded-full bg-white/90 px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-violet-700 shadow-sm">
              <History className="h-3.5 w-3.5" />
              {yearsText(group.yearsAgo)}
            </span>
            {photos.length > 1 && (
              <span className="pointer-events-none absolute right-4 top-4 inline-flex items-center gap-1 rounded-full bg-slate-900/60 px-2.5 py-1 text-[11px] font-semibold text-white backdrop-blur">
                <Camera className="h-3.5 w-3.5" /> {photos.length}
              </span>
            )}
            <button
              type="button"
              onClick={() => open(lead.meeting)}
              className="group absolute inset-x-0 bottom-0 cursor-pointer p-4 text-left"
            >
              <p className="flex items-center gap-1 text-lg font-bold text-white group-hover:underline">
                {meetingTitle(lead.meeting)}
                <ChevronRight className="h-4 w-4 opacity-70 transition-transform group-hover:translate-x-0.5" />
              </p>
              <MetaLine meeting={lead.meeting} light />
            </button>
          </div>
        ) : (
          <MemoryRow meeting={lead.meeting} day={lead.day} onOpen={open} highlight />
        )}

        {/* Photo strip */}
        {photos.length > 1 && (
          <div className="mem-scroll mt-3 flex gap-2 overflow-x-auto pb-1">
            {photos.slice(0, 10).map((p, i) => (
              <button
                key={p.meeting.id + p.name}
                type="button"
                onClick={() => setViewer(i)}
                className="mem-fade-up h-16 w-16 shrink-0 cursor-pointer overflow-hidden rounded-xl ring-2 ring-transparent transition-all hover:-translate-y-0.5 hover:ring-violet-300"
                style={{ animationDelay: `${i * 50}ms` }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={photoUrl(p.meeting, p.name, "400x400")} alt="" className="h-full w-full object-cover" />
              </button>
            ))}
          </div>
        )}

        {/* Other meetings that day */}
        {rest.length > 0 && (
          <ul className="mt-3 space-y-2">
            {rest.slice(0, 3).map(({ meeting, day }) => (
              <li key={meeting.id}>
                <MemoryRow meeting={meeting} day={day} onOpen={open} />
              </li>
            ))}
          </ul>
        )}
      </div>

      <PhotoLightbox
        images={photos.map((p) => ({
          src: photoUrl(p.meeting, p.name, "1200x0"),
          caption: `${meetingTitle(p.meeting)} · ${formatDayLong(p.day)}`,
        }))}
        index={viewer}
        onIndexChange={setViewer}
      />
    </section>
  );
}

function MetaLine({ meeting, light }: { meeting: MemoryMeeting; light?: boolean }) {
  const place = meetingPlace(meeting);
  const time = formatTime(meeting.meeting_time);
  const tone = light ? "text-white/80" : "text-slate-500";
  const icon = light ? "text-white/60" : "text-slate-400";
  return (
    <div className={`mt-1 flex flex-wrap gap-x-3.5 gap-y-0.5 text-xs ${tone}`}>
      {meeting.officer_name && (
        <span className="flex items-center gap-1">
          <User className={`h-3.5 w-3.5 ${icon}`} />
          {meeting.officer_name}
          {meeting.designation ? `, ${meeting.designation}` : ""}
        </span>
      )}
      {time && (
        <span className="flex items-center gap-1">
          <Clock3 className={`h-3.5 w-3.5 ${icon}`} />
          {time}
        </span>
      )}
      {place && (
        <span className="flex items-center gap-1">
          <MapPin className={`h-3.5 w-3.5 ${icon}`} />
          {place}
        </span>
      )}
    </div>
  );
}

function MemoryRow({
  meeting,
  day,
  onOpen,
  highlight,
}: {
  meeting: MemoryMeeting;
  day: Date;
  onOpen: (m: MemoryMeeting) => void;
  highlight?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={() => onOpen(meeting)}
      className="group flex w-full cursor-pointer items-center gap-3.5 rounded-2xl border border-slate-100 bg-white p-3.5 text-left transition-all duration-200 hover:-translate-y-0.5 hover:border-violet-200 hover:bg-violet-50/40 hover:shadow-md hover:shadow-slate-900/[0.04]"
    >
      <div
        className={`flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-2xl border transition-transform duration-300 group-hover:scale-105 ${
          highlight
            ? "border-violet-500 bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white shadow-sm"
            : "border-violet-200 bg-gradient-to-b from-violet-100 to-violet-50 text-violet-900"
        }`}
      >
        <span className="text-[9px] font-bold uppercase tracking-wide">
          {day.toLocaleDateString("en-IN", { month: "short" })}
        </span>
        <span className="text-lg font-bold leading-tight">{day.getDate()}</span>
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h4 className="truncate text-sm font-semibold text-slate-900 transition-colors group-hover:text-violet-700">
            {meetingTitle(meeting)}
          </h4>
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
            {day.getFullYear()}
          </span>
        </div>
        <MetaLine meeting={meeting} />
      </div>
      <ChevronRight className="h-5 w-5 shrink-0 text-slate-300 transition-all group-hover:translate-x-0.5 group-hover:text-violet-500" />
    </button>
  );
}
