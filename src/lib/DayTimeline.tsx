'use client';

/* ================================================================
   DayTimeline (v19) — 24-hour "day at a glance" bar.
   • Existing meetings as blocks (violet = Internal, sky = External)
   • Your meeting as a dashed ghost block — turns red when it clashes
   • Working hours (09:30–18:30) shaded, past time hatched on today
   • Click any empty spot to pick that time (snaps to 15 min)
================================================================ */

import { useEffect, useRef } from 'react';
import { Loader2 } from 'lucide-react';
import { DAY, WORK_START, WORK_END, toHHMM, toMin, blockLabel, type DayBlock } from '@/lib/busySlots';

const PX_PER_HOUR = 48;
const PX_PER_MIN = PX_PER_HOUR / 60;
const TRACK_WIDTH = 24 * PX_PER_HOUR;
const SNAP = 15;

const TYPE_STYLE: Record<string, string> = {
  internal: 'border-violet-300 bg-violet-200/90 text-violet-900',
  external: 'border-sky-300 bg-sky-200/90 text-sky-900',
};
const DEFAULT_STYLE = 'border-slate-300 bg-slate-200/90 text-slate-700';

const pad = (n: number) => String(n).padStart(2, '0');
const localISO = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

interface DayTimelineProps {
  date: string;
  blocks: DayBlock[];
  proposedTime?: string;
  proposedDuration?: number;
  conflictIds?: Set<string>;
  loading?: boolean;
  onPickTime?: (hhmm: string) => void;
}

export default function DayTimeline({
  date, blocks, proposedTime, proposedDuration = 30, conflictIds, loading, onPickTime,
}: DayTimelineProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const now = new Date();
  const isToday = date === localISO(now);
  const nowMin = now.getHours() * 60 + now.getMinutes();

  const pStart = proposedTime ? toMin(proposedTime) : null;
  const pEnd = pStart != null ? pStart + Math.max(proposedDuration || 0, 5) : null;
  const clash = !!conflictIds && conflictIds.size > 0;
  const crossesMidnight = pEnd != null && pEnd > DAY;

  /* keep the interesting part in view (your meeting, else now / 09:30) */
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const focusMin = pStart ?? (isToday ? Math.max(nowMin, WORK_START) : WORK_START);
    const x = focusMin * PX_PER_MIN;
    const w = el.clientWidth;
    const comfy = x >= el.scrollLeft + w * 0.15 && x <= el.scrollLeft + w * 0.65;
    if (!comfy) el.scrollTo({ left: Math.max(0, x - w / 3), behavior: 'smooth' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, pStart]);

  const handleTrackClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!onPickTime) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const raw = (e.clientX - rect.left) / PX_PER_MIN;
    const minute = Math.min(DAY - SNAP, Math.max(0, Math.floor(raw / SNAP) * SNAP));
    if (blocks.some((b) => minute >= b.dayStart && minute < b.dayEnd)) return;
    if (isToday && minute <= nowMin) return;
    onPickTime(toHHMM(minute));
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-xs font-semibold text-slate-600">
          Day at a glance
          {loading && <Loader2 className="h-3 w-3 animate-spin text-slate-400" />}
          <span className="font-normal text-slate-400">
            · {blocks.length ? `${blocks.length} booked` : 'nothing booked yet'}
          </span>
        </p>
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[10px] font-semibold text-slate-500">
          <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-violet-300" />Internal</span>
          <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-sky-300" />External</span>
          <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-sm border border-dashed border-violet-500" />New</span>
          <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-rose-400" />Overlap</span>
        </div>
      </div>

      <div ref={scrollRef} className="nice-scroll overflow-x-auto pb-1.5">
        <div className="relative" style={{ width: TRACK_WIDTH, height: 62 }}>
          {/* hour labels (24 h) */}
          {Array.from({ length: 24 }, (_, h) => (
            <span
              key={h}
              className="absolute top-0 pl-0.5 text-[9px] font-semibold tabular-nums text-slate-400"
              style={{ left: h * PX_PER_HOUR }}
            >
              {pad(h)}:00
            </span>
          ))}

          {/* track */}
          <div
            onClick={handleTrackClick}
            className={`absolute inset-x-0 top-4 h-11 overflow-hidden rounded-xl bg-slate-50 ring-1 ring-inset ring-slate-100 ${onPickTime ? 'cursor-crosshair' : ''}`}
          >
            {/* working hours band */}
            <div
              className="absolute inset-y-0 bg-violet-50"
              style={{ left: WORK_START * PX_PER_MIN, width: (WORK_END - WORK_START) * PX_PER_MIN }}
            />

            {/* hour grid */}
            {Array.from({ length: 23 }, (_, i) => (
              <span key={i} className="absolute inset-y-0 w-px bg-slate-200/70" style={{ left: (i + 1) * PX_PER_HOUR }} />
            ))}

            {/* past time today */}
            {isToday && (
              <div
                className="absolute inset-y-0 left-0"
                style={{
                  width: nowMin * PX_PER_MIN,
                  backgroundImage: 'repeating-linear-gradient(135deg, rgba(148,163,184,.14) 0 6px, transparent 6px 12px)',
                }}
              />
            )}

            {/* booked meetings */}
            {blocks.map((b) => {
              const width = Math.max((b.dayEnd - b.dayStart) * PX_PER_MIN, 4);
              const isClash = !!conflictIds?.has(b.id);
              return (
                <div
                  key={b.id}
                  onClick={(e) => e.stopPropagation()}
                  title={`${blockLabel(b)} · ${b.agenda}${b.officerName ? ` · with ${b.officerName}` : ''}`}
                  className={`absolute inset-y-1 cursor-default overflow-hidden rounded-lg border px-1.5 text-[10px] font-semibold leading-[34px] ${
                    TYPE_STYLE[b.meetingType] ?? DEFAULT_STYLE
                  } ${isClash ? 'ring-2 ring-rose-400' : ''}`}
                  style={{ left: b.dayStart * PX_PER_MIN, width }}
                >
                  {width >= 44 && <span className="block truncate">{b.agenda}</span>}
                </div>
              );
            })}

            {/* your meeting (ghost) */}
            {pStart != null && pEnd != null && (
              <div
                className={`pointer-events-none absolute inset-y-0.5 rounded-lg border-2 border-dashed px-1 text-[9px] font-bold leading-[36px] ${
                  clash ? 'animate-pulse border-rose-500 bg-rose-400/30 text-rose-700' : 'border-violet-500 bg-violet-400/20 text-violet-700'
                }`}
                style={{
                  left: pStart * PX_PER_MIN,
                  width: Math.max((Math.min(pEnd, DAY) - pStart) * PX_PER_MIN, 6),
                }}
              >
                {(Math.min(pEnd, DAY) - pStart) * PX_PER_MIN >= 30 && (clash ? 'Clash' : 'New')}
              </div>
            )}

            {/* now line */}
            {isToday && (
              <span className="absolute inset-y-0 w-0.5 bg-rose-400" style={{ left: nowMin * PX_PER_MIN }} />
            )}
          </div>
        </div>
      </div>

      <p className="mt-1 text-[10px] text-slate-400">
        Shaded = working hours {toHHMM(WORK_START)}–{toHHMM(WORK_END)} · click an empty spot to pick a time · 24-hour clock
        {crossesMidnight && <span className="font-semibold text-amber-600"> · continues past 00:00 into the next day</span>}
      </p>
    </div>
  );
}