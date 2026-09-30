'use client';

/* ================================================================
   ConflictCard + ParticipantNotice (v19)
   • ConflictCard: shown when the chosen slot overlaps a meeting.
     Names the clash and offers one-click "nearest free slot" chips.
   • ParticipantNotice: softer heads-up when the same officer /
     employee already has another (non-overlapping) meeting that day.
================================================================ */

import { AlertTriangle, Sparkles, Users, Eye } from 'lucide-react';
import { blockLabel, toHHMM, type BusyBlock, type SlotSuggestion } from '@/lib/busySlots';

export default function ConflictCard({
  date, conflicts, suggestions, onPick, onView,
}: {
  date: string;
  conflicts: BusyBlock[];
  suggestions: SlotSuggestion[];
  onPick: (s: SlotSuggestion) => void;
  onView?: (meetingId: string) => void;
}) {
  if (!conflicts.length) return null;

  return (
    <div className="mt-3 rounded-2xl border border-rose-200 bg-rose-50/70 p-3.5">
      <div className="flex items-start gap-2.5">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-rose-100 text-rose-600">
          <AlertTriangle className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <p className="text-[13px] font-semibold text-rose-800">This time is already booked</p>
          <p className="text-[11px] text-rose-600/80">
            Overlaps {conflicts.length} meeting{conflicts.length > 1 ? 's' : ''} — pick a free slot below.
          </p>
        </div>
      </div>

      <div className="mt-2.5 space-y-1.5">
        {conflicts.map((c) => (
          <div key={c.id} className="flex items-center gap-2 rounded-xl border border-rose-100 bg-white px-2.5 py-2">
            <span className="shrink-0 rounded-md bg-rose-50 px-1.5 py-0.5 text-[11px] font-bold tabular-nums text-rose-700">
              {blockLabel(c)}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-xs font-semibold text-slate-800">{c.agenda}</span>
              {c.officerName && <span className="block truncate text-[10px] text-slate-400">with {c.officerName}</span>}
            </span>
            {c.date !== date && (
              <span className="shrink-0 rounded-full bg-amber-50 px-1.5 py-0.5 text-[9px] font-bold text-amber-700">prev. day</span>
            )}
            {onView && (
              <button
                type="button"
                onClick={() => onView(c.id)}
                className="shrink-0 rounded-lg p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-violet-600"
                title="View this meeting"
              >
                <Eye className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        ))}
      </div>

      <p className="mb-1.5 mt-3 flex items-center gap-1 text-[11px] font-semibold text-slate-600">
        <Sparkles className="h-3.5 w-3.5 text-violet-500" /> Nearest free slots
      </p>
      {suggestions.length ? (
        <div className="flex flex-wrap gap-1.5">
          {suggestions.map((s) => (
            <button
              key={`${s.date}-${s.time}`}
              type="button"
              onClick={() => onPick(s)}
              className="rounded-full border border-violet-200 bg-white px-3 py-1.5 text-xs font-semibold tabular-nums text-violet-700 shadow-sm transition-all hover:-translate-y-0.5 hover:border-violet-400 hover:bg-violet-50 active:scale-95"
            >
              {s.label}
            </button>
          ))}
        </div>
      ) : (
        <p className="text-[11px] text-slate-500">
          No free slot of this length on this day or the next — try another date or a shorter duration.
        </p>
      )}
    </div>
  );
}

export function ParticipantNotice({ meetings }: { meetings: BusyBlock[] }) {
  if (!meetings.length) return null;
  return (
    <div className="mt-3 flex items-start gap-2.5 rounded-2xl border border-amber-200 bg-amber-50/70 p-3">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-700">
        <Users className="h-3.5 w-3.5" />
      </span>
      <div className="min-w-0 space-y-0.5">
        <p className="text-xs font-semibold text-amber-800">Heads-up: same participant, same day</p>
        {meetings.slice(0, 3).map((m) => (
          <p key={m.id} className="truncate text-[11px] text-amber-700">
            {m.officerName || 'This participant'} already has “{m.agenda}” at {toHHMM(m.start)}
          </p>
        ))}
      </div>
    </div>
  );
}