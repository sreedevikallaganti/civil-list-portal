'use client';

/* WeekView — Mon–Sun time grid. Meetings are sized by duration and laid out side by side
   when they overlap; a red line marks "now"; click an empty slot to schedule; drag a
   meeting to another day/time to reschedule (snaps to 15 minutes). */

import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { useNow } from '@/lib/useNow';
import { dateOf, durationOf, hhmm, isMovable, isoDate, startMin } from './calendarTools';

const START_H = 7;
const END_H = 22;
const HOUR_PX = 56;
const SNAP = 15;

type Color = { light: string; text: string; border: string };

type Props = {
  weekStart: Date;
  meetings: any[];
  conflicts: Set<string>;
  getTitle: (m: any) => string;
  getColor: (m: any) => Color;
  onOpen: (m: any) => void;
  onCreate: (date: Date) => void;
  onMove: (m: any, date: string, time: string) => void;
};

type Placed = { m: any; top: number; height: number; lane: number; lanes: number; s: number; e: number };

/* greedy lane assignment inside each cluster of overlapping meetings */
function layout(dayMeetings: any[]): Placed[] {
  const items = dayMeetings
    .map((m) => {
      const s = startMin(m) ?? START_H * 60;
      return { m, s, e: s + durationOf(m) };
    })
    .sort((a, b) => a.s - b.s || b.e - a.e);

  const out: Placed[] = [];
  let cluster: Placed[] = [];
  let clusterEnd = -1;
  const flush = () => {
    const lanes = Math.max(1, ...cluster.map((p) => p.lane + 1));
    cluster.forEach((p) => (p.lanes = lanes));
    out.push(...cluster);
    cluster = [];
  };

  for (const it of items) {
    if (it.s >= clusterEnd && cluster.length) flush();
    const used = new Set(cluster.filter((p) => p.e > it.s).map((p) => p.lane));
    let lane = 0;
    while (used.has(lane)) lane++;
    const top = Math.max(0, ((it.s - START_H * 60) / 60) * HOUR_PX);
    const bottom = Math.min((END_H - START_H) * HOUR_PX, ((it.e - START_H * 60) / 60) * HOUR_PX);
    cluster.push({ m: it.m, s: it.s, e: it.e, lane, lanes: 1, top, height: Math.max(24, bottom - top) });
    clusterEnd = Math.max(clusterEnd, it.e);
  }
  if (cluster.length) flush();
  return out;
}

export default function WeekView({ weekStart, meetings, conflicts, getTitle, getColor, onOpen, onCreate, onMove }: Props) {
  const now = useNow();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [ghost, setGhost] = useState<{ day: string; min: number } | null>(null);

  const days = useMemo(
    () => Array.from({ length: 7 }, (_, i) => new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + i)),
    [weekStart],
  );

  const byDay = useMemo(() => {
    const map = new Map<string, any[]>();
    for (const m of meetings) {
      const d = dateOf(m);
      if (!d) continue;
      map.set(d, [...(map.get(d) ?? []), m]);
    }
    return map;
  }, [meetings]);

  /* open scrolled to the working day */
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = (8.5 - START_H) * HOUR_PX;
  }, []);

  const todayIso = isoDate(new Date(now));
  const nowDate = new Date(now);
  const nowMin = nowDate.getHours() * 60 + nowDate.getMinutes();
  const hours = Array.from({ length: END_H - START_H }, (_, i) => START_H + i);

  const minFromEvent = (e: React.DragEvent | React.MouseEvent) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const raw = START_H * 60 + ((e.clientY - rect.top) / HOUR_PX) * 60;
    return Math.min((END_H * 60) - SNAP, Math.max(START_H * 60, Math.round(raw / SNAP) * SNAP));
  };

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[760px]">
        {/* Day headers */}
        <div className="grid grid-cols-[56px_repeat(7,minmax(0,1fr))] border-b border-slate-100 bg-slate-50/70">
          <div />
          {days.map((d) => {
            const iso = isoDate(d);
            const isToday = iso === todayIso;
            const count = (byDay.get(iso) ?? []).length;
            return (
              <div key={iso} className="flex flex-col items-center gap-0.5 border-l border-slate-100 py-2.5">
                <span className={`text-[10px] font-bold uppercase tracking-[0.15em] ${isToday ? 'text-violet-600' : 'text-slate-400'}`}>
                  {d.toLocaleDateString('en-US', { weekday: 'short' })}
                </span>
                <span className={`flex h-8 w-8 items-center justify-center rounded-xl text-sm font-bold ${isToday ? 'bg-violet-600 text-white shadow-md shadow-violet-500/30' : 'text-slate-700'}`}>
                  {d.getDate()}
                </span>
                <span className="h-3 text-[10px] font-semibold text-slate-400">{count ? `${count} mtg${count > 1 ? 's' : ''}` : ''}</span>
              </div>
            );
          })}
        </div>

        {/* Untimed meetings */}
        {days.some((d) => (byDay.get(isoDate(d)) ?? []).some((m) => startMin(m) == null)) && (
          <div className="grid grid-cols-[56px_repeat(7,minmax(0,1fr))] border-b border-slate-100">
            <div className="flex items-center justify-center text-[9px] font-bold uppercase text-slate-400">No time</div>
            {days.map((d) => (
              <div key={isoDate(d)} className="space-y-1 border-l border-slate-100 p-1">
                {(byDay.get(isoDate(d)) ?? []).filter((m) => startMin(m) == null).map((m) => (
                  <button key={m.id} type="button" onClick={() => onOpen(m)}
                    className={`block w-full truncate rounded-md px-1.5 py-1 text-left text-[10px] font-semibold ${getColor(m).light} ${getColor(m).text}`}>
                    {getTitle(m)}
                  </button>
                ))}
              </div>
            ))}
          </div>
        )}

        {/* Time grid */}
        <div ref={scrollRef} className="relative max-h-[68vh] overflow-y-auto">
          <div className="grid grid-cols-[56px_repeat(7,minmax(0,1fr))]" style={{ height: (END_H - START_H) * HOUR_PX }}>
            {/* hour gutter */}
            <div className="relative">
              {hours.map((h) => (
                <span key={h} className="absolute right-2 -translate-y-1/2 text-[10px] font-semibold tabular-nums text-slate-400" style={{ top: (h - START_H) * HOUR_PX }}>
                  {h === START_H ? '' : `${String(h).padStart(2, '0')}:00`}
                </span>
              ))}
            </div>

            {days.map((d) => {
              const iso = isoDate(d);
              const isToday = iso === todayIso;
              const isPast = iso < todayIso;
              const placed = layout((byDay.get(iso) ?? []).filter((m) => startMin(m) != null));
              return (
                <div
                  key={iso}
                  onClick={(e) => {
                    if (e.target === e.currentTarget) onCreate(d);
                  }}
                  onDragOver={(e) => {
                    if (!dragId) return;
                    e.preventDefault();
                    const min = minFromEvent(e);
                    if (ghost?.day !== iso || ghost.min !== min) setGhost({ day: iso, min });
                  }}
                  onDragLeave={() => setGhost(null)}
                  onDrop={(e) => {
                    e.preventDefault();
                    const m = meetings.find((x) => x.id === dragId);
                    setGhost(null);
                    setDragId(null);
                    if (m) onMove(m, iso, hhmm(minFromEvent(e)));
                  }}
                  title={isPast ? undefined : 'Click to schedule on this day'}
                  className={`relative border-l border-slate-100 ${isToday ? 'bg-violet-50/40' : isPast ? 'bg-slate-50/50' : 'cursor-pointer hover:bg-violet-50/20'}`}
                  style={{
                    backgroundImage: `repeating-linear-gradient(to bottom, transparent 0, transparent ${HOUR_PX - 1}px, rgb(241 245 249) ${HOUR_PX - 1}px, rgb(241 245 249) ${HOUR_PX}px)`,
                  }}
                >
                  {/* drop preview */}
                  {ghost?.day === iso && (
                    <div
                      className="pointer-events-none absolute inset-x-1 z-20 rounded-lg border-2 border-dashed border-violet-400 bg-violet-100/60 px-1.5 py-0.5 text-[10px] font-bold text-violet-700"
                      style={{ top: ((ghost.min - START_H * 60) / 60) * HOUR_PX, height: HOUR_PX / 2 }}
                    >
                      {ghost.min != null && hhmm(ghost.min)}
                    </div>
                  )}

                  {/* now line */}
                  {isToday && nowMin >= START_H * 60 && nowMin <= END_H * 60 && (
                    <div className="pointer-events-none absolute inset-x-0 z-10 flex items-center" style={{ top: ((nowMin - START_H * 60) / 60) * HOUR_PX }}>
                      <span className="-ml-1 h-2.5 w-2.5 rounded-full bg-rose-500 ring-2 ring-white" />
                      <span className="h-0.5 flex-1 bg-rose-500" />
                    </div>
                  )}

                  {placed.map((p) => {
                    const c = getColor(p.m);
                    const clash = conflicts.has(p.m.id);
                    const movable = isMovable(p.m);
                    const compact = p.height < 40;
                    const width = 100 / p.lanes;
                    return (
                      <button
                        key={p.m.id}
                        type="button"
                        draggable={movable}
                        onDragStart={(e) => {
                          e.dataTransfer.setData('text/plain', p.m.id);
                          e.dataTransfer.effectAllowed = 'move';
                          setDragId(p.m.id);
                        }}
                        onDragEnd={() => {
                          setDragId(null);
                          setGhost(null);
                        }}
                        onClick={() => onOpen(p.m)}
                        title={`${getTitle(p.m)} · ${hhmm(p.s)}–${hhmm(p.e)}${p.m.officer_name ? ` · ${p.m.officer_name}` : ''}${clash ? ' · overlaps another meeting' : ''}${movable ? '\nDrag to reschedule' : ''}`}
                        className={`absolute overflow-hidden rounded-lg border-l-[3px] px-1.5 py-1 text-left shadow-sm ring-1 ring-white transition-all duration-150 hover:z-30 hover:shadow-md ${c.light} ${c.border} ${
                          movable ? 'cursor-grab active:cursor-grabbing' : ''
                        } ${dragId === p.m.id ? 'opacity-40' : ''} ${clash ? 'ring-2 !ring-amber-400' : ''}`}
                        style={{ top: p.top + 1, height: p.height - 2, left: `calc(${p.lane * width}% + 2px)`, width: `calc(${width}% - 4px)` }}
                      >
                        <span className={`flex items-center gap-1 text-[10px] font-bold leading-tight ${c.text}`}>
                          {clash && <AlertTriangle className="h-3 w-3 shrink-0 text-amber-500" />}
                          <span className="truncate">{compact ? `${hhmm(p.s)} ${getTitle(p.m)}` : getTitle(p.m)}</span>
                        </span>
                        {!compact && (
                          <span className="mt-0.5 block truncate text-[10px] tabular-nums text-slate-500">
                            {hhmm(p.s)}–{hhmm(p.e)}
                            {p.m.officer_name ? ` · ${p.m.officer_name}` : ''}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
