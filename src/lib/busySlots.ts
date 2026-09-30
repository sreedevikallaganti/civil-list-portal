'use client';

/* ================================================================
   busySlots — shared slot-conflict logic (v19)
   Used by CreateMeetingPanel (create / edit) and by the Update
   panel's reschedule flow in app/meetings/page.tsx.

   Rules:
   • Overlap is an INTERVAL check on meeting_time + duration, so an
     11:00 / 60 min meeting also blocks 11:30.
   • Cancelled / Rejected meetings never block a slot.
   • The meeting being edited is excluded (it can't clash with itself).
   • Meetings that cross midnight also block the next day — everything
     is compared in absolute minutes, not just "time of day".
   • All times are one 24-hour wall clock, exactly as entered.
================================================================ */

import { useCallback, useEffect, useMemo, useState } from 'react';
import pb from '@/lib/pocketbase';

export const DAY = 1440;
export const WORK_START = 9 * 60 + 30; // 09:30
export const WORK_END = 18 * 60 + 30;  // 18:30
const STEP = 15;
const DEFAULT_DURATION = 30;
const NON_BLOCKING = new Set(['cancelled', 'rejected']);
const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;

export interface BusyBlock {
  id: string;
  agenda: string;
  officerName: string;
  officerId: string;
  email: string;
  meetingType: string;
  status: string;
  date: string;     // YYYY-MM-DD the meeting starts on
  time: string;     // HH:mm (24 h)
  duration: number; // minutes
  start: number;    // absolute minutes
  end: number;      // absolute minutes
}

/** A block clipped to one calendar day — dayStart/dayEnd are 0..1440 */
export interface DayBlock extends BusyBlock {
  dayStart: number;
  dayEnd: number;
}

export interface SlotSuggestion {
  date: string;
  time: string;
  label: string;
}

/* ------------------------------ helpers ------------------------------ */

const pad = (n: number) => String(n).padStart(2, '0');
const localISO = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export function toMin(t: string | null | undefined): number | null {
  const m = /^(\d{1,2}):(\d{2})/.exec(String(t || '').trim());
  if (!m) return null;
  const h = Number(m[1]);
  const mm = Number(m[2]);
  if (h > 23 || mm > 59) return null;
  return h * 60 + mm;
}

export function toHHMM(min: number): string {
  const x = ((Math.round(min) % DAY) + DAY) % DAY;
  return `${pad(Math.floor(x / 60))}:${pad(x % 60)}`;
}

export function dayNum(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / 86_400_000);
}

export function isoFromDayNum(n: number): string {
  return new Date(n * 86_400_000).toISOString().slice(0, 10);
}

export function absMin(iso: string, hhmm: string): number | null {
  if (!ISO_RE.test(iso || '')) return null;
  const t = toMin(hhmm);
  return t == null ? null : dayNum(iso) * DAY + t;
}

export const overlaps = (aS: number, aE: number, bS: number, bE: number) => aS < bE && aE > bS;

export const blockLabel = (b: { start: number; end: number }) => `${toHHMM(b.start)}–${toHHMM(b.end)}`;

const nowAbs = () => {
  const n = new Date();
  return dayNum(localISO(n)) * DAY + n.getHours() * 60 + n.getMinutes();
};

/** reason a duration chip must be disabled (it would run into the next meeting), else null */
export function durationBlockReason(
  free: { minutes: number; next: BusyBlock | null } | null,
  minutes: number,
): string | null {
  if (!free || !free.next || free.minutes <= 0) return null; // start itself busy → handled by the time picker
  return minutes > free.minutes ? `Runs into “${free.next.agenda}” at ${toHHMM(free.next.start)}` : null;
}

/** true when PocketBase rejected a save because of the server-side overlap guard */
export function isSlotConflictError(err: any): boolean {
  const msg = String(err?.response?.message || err?.message || '');
  return err?.status === 400 && /overlaps another meeting/i.test(msg);
}

export function slotConflictMessage(err: any): string {
  return String(err?.response?.message || err?.message || 'This time slot overlaps another meeting.');
}

function toBlock(r: any): BusyBlock | null {
  if (r?.deleted) return null;
  const status = String(r?.status || 'Scheduled');
  if (NON_BLOCKING.has(status.toLowerCase())) return null;
  const date = String(r?.meeting_date || '').slice(0, 10);
  const start = absMin(date, r?.meeting_time);
  if (start == null) return null;
  const duration = Math.max(1, Math.round(Number(r?.duration) || DEFAULT_DURATION));
  return {
    id: r.id,
    agenda: r.agenda || 'Untitled meeting',
    officerName: r.officer_name || '',
    officerId: r.officer_id || '',
    email: r.email || '',
    meetingType: String(r.meeting_type || '').toLowerCase(),
    status,
    date,
    time: toHHMM(start),
    duration,
    start,
    end: start + duration,
  };
}

/* ------------------------ repeating meetings ------------------------ */

export type RepeatMode = 'none' | 'weekly' | 'biweekly' | 'monthly';

/** dates of a series, starting with `first` (monthly keeps the day, clamped to month end) */
export function seriesDates(first: string, mode: RepeatMode, count: number): string[] {
  if (!ISO_RE.test(first || '')) return [];
  if (mode === 'none' || count < 2) return [first];
  const [y, m, d] = first.split('-').map(Number);
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    if (mode === 'monthly') {
      const last = new Date(Date.UTC(y, m - 1 + i + 1, 0)).getUTCDate();
      out.push(new Date(Date.UTC(y, m - 1 + i, Math.min(d, last))).toISOString().slice(0, 10));
    } else {
      out.push(isoFromDayNum(dayNum(first) + i * (mode === 'weekly' ? 7 : 14)));
    }
  }
  return out;
}

export interface SeriesSlot { date: string; status: 'free' | 'busy' | 'past'; clash?: BusyBlock }

/** checks every date of a series against existing meetings in ONE request */
export async function checkSeries(dates: string[], time: string, duration: number, excludeId?: string | null): Promise<SeriesSlot[]> {
  const valid = dates.filter((d) => ISO_RE.test(d));
  if (!valid.length || toMin(time) == null) return valid.map((date) => ({ date, status: 'free' as const }));
  const nums = valid.map(dayNum);
  const rows = await pb.collection('meetings').getFullList({
    filter: pb.filter('meeting_date >= {:from} && meeting_date < {:to}', {
      from: `${isoFromDayNum(Math.min(...nums) - 1)} 00:00:00.000Z`,
      to: `${isoFromDayNum(Math.max(...nums) + 2)} 00:00:00.000Z`,
    }),
    fields: 'id,agenda,meeting_date,meeting_time,duration,status,meeting_type,officer_id,officer_name,email,deleted',
    requestKey: null,
  });
  const blocks = (rows.map(toBlock).filter(Boolean) as BusyBlock[]).filter((b) => b.id !== excludeId);
  const now = nowAbs();
  const dur = duration > 0 ? duration : DEFAULT_DURATION;
  return valid.map((date) => {
    const s = absMin(date, time)!;
    if (s <= now) return { date, status: 'past' as const };
    const clash = blocks.find((b) => overlaps(s, s + dur, b.start, b.end));
    return clash ? { date, status: 'busy' as const, clash } : { date, status: 'free' as const };
  });
}

/* ------------------------------- hook ------------------------------- */

/**
 * Loads every blocking meeting from the day before to the day after `date`
 * (so midnight-crossing meetings are caught) and exposes conflict helpers.
 * Refreshes live through PocketBase realtime while mounted.
 */
export function useBusySlots(date: string, excludeId?: string | null, enabled = true) {
  const [blocks, setBlocks] = useState<BusyBlock[]>([]);
  const [loading, setLoading] = useState(false);
  const [version, setVersion] = useState(0);
  const refresh = useCallback(() => setVersion((v) => v + 1), []);
  const active = enabled && ISO_RE.test(date || '');

  useEffect(() => {
    if (!active) { setBlocks([]); return; }
    let cancelled = false;
    const d = dayNum(date);
    setLoading(true);
    pb.collection('meetings')
      .getFullList({
        filter: pb.filter('meeting_date >= {:from} && meeting_date < {:to}', {
          from: `${isoFromDayNum(d - 1)} 00:00:00.000Z`,
          to: `${isoFromDayNum(d + 2)} 00:00:00.000Z`,
        }),
        fields: 'id,agenda,meeting_date,meeting_time,duration,status,meeting_type,officer_id,officer_name,email,deleted',
        requestKey: `busy-slots-${date}-${version}`,
      })
      .then((rows) => {
        if (!cancelled) setBlocks(rows.map(toBlock).filter(Boolean) as BusyBlock[]);
      })
      .catch((err) => {
        if (!cancelled && !err?.isAbort) console.error('[busySlots] failed to load meetings:', err);
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [active, date, version]);

  /* live: if someone books/moves a meeting while the panel is open, re-check */
  useEffect(() => {
    if (!active) return;
    let unsub: (() => void) | undefined;
    let alive = true;
    pb.collection('meetings')
      .subscribe('*', () => refresh())
      .then((fn) => { if (alive) unsub = fn; else fn(); })
      .catch(() => { /* realtime not allowed by API rules — polling on open is enough */ });
    return () => { alive = false; unsub?.(); };
  }, [active, refresh]);

  const others = useMemo(
    () => blocks.filter((b) => b.id !== excludeId).sort((a, b) => a.start - b.start),
    [blocks, excludeId],
  );

  /** blocks visible on `date`, clipped to 00:00–24:00 */
  const dayBlocks = useMemo<DayBlock[]>(() => {
    if (!ISO_RE.test(date || '')) return [];
    const ds = dayNum(date) * DAY;
    return others
      .filter((b) => overlaps(b.start, b.end, ds, ds + DAY))
      .map((b) => ({ ...b, dayStart: Math.max(b.start, ds) - ds, dayEnd: Math.min(b.end, ds + DAY) - ds }));
  }, [others, date]);

  /** meetings overlapping [time, time + duration) on `date` */
  const findConflicts = useCallback((time: string, duration?: number): BusyBlock[] => {
    const s = absMin(date, time);
    if (s == null) return [];
    const e = s + (duration && duration > 0 ? duration : STEP);
    return others.filter((b) => overlaps(s, e, b.start, b.end));
  }, [others, date]);

  /** how many free minutes follow `time` before the next meeting starts */
  const freeMinutesFrom = useCallback((time: string): { minutes: number; next: BusyBlock | null } | null => {
    const s = absMin(date, time);
    if (s == null) return null;
    if (others.some((b) => b.start <= s && b.end > s)) return { minutes: 0, next: null };
    const next = others.find((b) => b.start > s) || null;
    return { minutes: next ? next.start - s : Infinity, next };
  }, [others, date]);

  /** up to `count` nearest free starts (never in the past), spaced ≥ 1 h apart */
  const suggest = useCallback((time: string, duration: number, count = 3): SlotSuggestion[] => {
    if (!ISO_RE.test(date || '')) return [];
    const dur = duration > 0 ? Math.round(duration) : DEFAULT_DURATION;
    const d0 = dayNum(date);
    const proposed = absMin(date, time) ?? d0 * DAY + WORK_START;
    const now = nowAbs();

    const isFree = (s: number) => !others.some((b) => overlaps(s, s + dur, b.start, b.end));
    const inWork = (s: number) => {
      const m = s - Math.floor(s / DAY) * DAY;
      return m >= WORK_START && m + dur <= WORK_END;
    };
    const preferWork = inWork(proposed);

    const candidatesFor = (day: number) => {
      const base = day * DAY;
      const starts = new Set<number>();
      for (let m = 0; m + dur <= DAY; m += STEP) starts.add(base + m);
      /* also offer "right after the meeting ends", e.g. 11:50 */
      others.forEach((b) => { if (b.end > base && b.end + dur <= base + DAY) starts.add(b.end); });
      return Array.from(starts).filter((s) => s > now && isFree(s));
    };

    const picks: number[] = [];
    const take = (list: number[]) => {
      for (const s of list) {
        if (picks.length >= count) return;
        if (picks.every((p) => Math.abs(p - s) >= 60)) picks.push(s);
      }
    };

    take(candidatesFor(d0).sort((a, b) =>
      (preferWork ? Number(!inWork(a)) - Number(!inWork(b)) : 0) ||
      Math.abs(a - proposed) - Math.abs(b - proposed)));

    if (picks.length < count) {
      const next = candidatesFor(d0 + 1).sort((a, b) => a - b);
      take([...next.filter(inWork), ...next.filter((s) => !inWork(s))]);
    }

    return picks.sort((a, b) => a - b).map((s) => {
      const iso = isoFromDayNum(Math.floor(s / DAY));
      const wd = iso === date ? '' : `${new Date(`${iso}T00:00:00`).toLocaleDateString('en-IN', { weekday: 'short' })} `;
      return { date: iso, time: toHHMM(s), label: `${wd}${toHHMM(s)}` };
    });
  }, [others, date]);

  /** other meetings on `date` with the same participant (officer id or email) */
  const participantMeetings = useCallback((p: { officerIds: string[]; emails: string[] }): BusyBlock[] => {
    const ids = new Set(p.officerIds.filter(Boolean));
    const emails = new Set(p.emails.map((e) => e.trim().toLowerCase()).filter(Boolean));
    if (!ids.size && !emails.size) return [];
    return others.filter((b) =>
      b.date === date &&
      ((b.officerId && ids.has(b.officerId)) || (b.email && emails.has(b.email.toLowerCase()))));
  }, [others, date]);

  return { loading, blocks: others, dayBlocks, findConflicts, freeMinutesFrom, suggest, participantMeetings, refresh };
}
