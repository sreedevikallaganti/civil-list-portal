'use client';

/* TravelTimeNotice — in the meeting form: warns when the meeting being planned leaves too
   little time to travel from the previous meeting that day, or to the next one.
   Re-checks as the date, time, duration or place change. Advice only — never blocks saving. */

import { useEffect, useMemo, useState } from 'react';
import { Car, Plane, TriangleAlert } from 'lucide-react';
import pb from '@/lib/pocketbase';
import { checkPlannedSlot, fmtMinutes } from '@/lib/travelTime';

type Planned = { meeting_date?: string; meeting_time?: string; duration?: unknown; city?: string; location?: string; meeting_place?: string; agenda?: string };

export default function TravelTimeNotice({ planned, editingId }: { planned: Planned; editingId?: string | null }) {
  const day = String(planned.meeting_date || '').slice(0, 10);
  const [loaded, setLoaded] = useState<{ day: string; rows: any[] }>({ day: '', rows: [] });
  const sameDay = loaded.day === day ? loaded.rows : [];

  // that day's meetings (the meeting being edited is left out by id)
  useEffect(() => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return;
    let alive = true;
    const t = setTimeout(() => {
      pb.collection('meetings')
        .getFullList({ filter: `meeting_date ~ "${day}"`, requestKey: null })
        .then((rows) => alive && setLoaded({ day, rows: rows.filter((m: any) => !m.deleted) }))
        .catch(() => alive && setLoaded({ day, rows: [] }));
    }, 250);
    return () => { alive = false; clearTimeout(t); };
  }, [day]);

  const issues = useMemo(() => {
    if (!day || !planned.meeting_time) return [];
    return checkPlannedSlot({ ...planned, id: editingId || '' } as any, sameDay);
  }, [planned, sameDay, day, editingId]);

  if (!issues.length) return null;

  return (
    <div className="mt-3 space-y-2" role="status">
      {issues.map((t) => {
        const after = t.from.id === (editingId || '__planned__') || t.from.id === '';
        const other = after ? t.to : t.from;
        const Icon = t.estimate.mode === 'air' ? Plane : Car;
        const tooTight = t.level === 'too-tight';
        return (
          <div key={`${t.from.id}-${t.to.id}`}
            className={`flex items-start gap-3 rounded-2xl border px-3.5 py-3 text-xs ${tooTight ? 'border-rose-200 bg-rose-50 text-rose-800' : 'border-amber-200 bg-amber-50 text-amber-800'}`}>
            <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${tooTight ? 'bg-rose-100 text-rose-600' : 'bg-amber-100 text-amber-600'}`}>
              {tooTight ? <TriangleAlert className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
            </span>
            <div className="min-w-0">
              <p className="font-bold">
                {tooTight ? 'Not enough time to travel' : 'Tight travel time'} {after ? 'to the next meeting' : 'from the previous meeting'}
              </p>
              <p className="mt-0.5">
                {after ? 'Next' : 'Before this'}: “{other.agenda || 'Meeting'}” at {String(other.meeting_time || '').slice(0, 5)}
                {other.location || other.city ? `, ${other.location || other.city}` : ''}.
              </p>
              <p className="mt-0.5">
                Travel needs about <b>{fmtMinutes(t.needMin)}</b>
                {t.estimate.mode === 'road' && t.estimate.km ? ` by road (${t.estimate.km} km)` : t.estimate.mode === 'air' ? ' including flight and airport time' : t.estimate.mode === 'city' ? ' across the city' : ''}
                {' — '}{t.gapMin <= 0 ? 'there is no gap at all.' : <>there are only <b>{fmtMinutes(t.gapMin)}</b> between them.</>}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
