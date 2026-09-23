// src/components/auth/DayRing.tsx
'use client';

import { useEffect, useState } from 'react';
import styles from '@/styles/Login.module.css';

type Slot = { start: number; end: number; title: string; room: string };

// Illustrative agenda — the real one loads once you're signed in.
// Times are minutes-from-midnight so status can be computed live.
const SLOTS: Slot[] = [
  { start: 9 * 60, end: 10 * 60, title: 'Sprint Planning', room: 'Room 4B' },
  { start: 11 * 60 + 30, end: 12 * 60 + 30, title: 'Board Review', room: 'Virtual' },
  { start: 14 * 60, end: 15 * 60, title: 'Vendor Sync', room: 'Room 2A' },
];

const R = 42;
const CX = 50;
const CY = 50;
const CIRC = 2 * Math.PI * R;

function angleFor(minutes: number) {
  return (minutes / 1440) * 360 - 90; // -90 so 00:00 sits at 12 o'clock
}

function pointFor(minutes: number, radius = R) {
  const rad = (angleFor(minutes) * Math.PI) / 180;
  return { x: CX + radius * Math.cos(rad), y: CY + radius * Math.sin(rad) };
}

function statusFor(slot: Slot, nowMinutes: number): 'done' | 'live' | 'upcoming' {
  if (nowMinutes >= slot.end) return 'done';
  if (nowMinutes >= slot.start) return 'live';
  return 'upcoming';
}

function fmtTime(mins: number) {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  const period = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${period}`;
}

export default function DayRing() {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);

  const nowMinutes = now ? now.getHours() * 60 + now.getMinutes() : 9 * 60; // stable SSR fallback
  const dayFrac = nowMinutes / 1440;
  const nowPoint = pointFor(nowMinutes);

  return (
    <div className={styles.ringRow}>
      <div className={styles.ringWrap}>
        <svg viewBox="0 0 100 100" width="100%" height="100%">
          <circle cx={CX} cy={CY} r={R} fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="6" />
          <circle
            cx={CX}
            cy={CY}
            r={R}
            fill="none"
            stroke="#a78bfa"
            strokeWidth="6"
            strokeLinecap="round"
            strokeDasharray={CIRC}
            strokeDashoffset={CIRC * (1 - dayFrac)}
            transform={`rotate(-90 ${CX} ${CY})`}
            style={{ transition: 'stroke-dashoffset 1s linear' }}
          />
          {SLOTS.map((slot, i) => {
            const p = pointFor(slot.start);
            const status = statusFor(slot, nowMinutes);
            const fill = status === 'live' ? '#c4b5fd' : status === 'upcoming' ? '#7dd3fc' : 'rgba(255,255,255,0.35)';
            return (
              <circle key={i} cx={p.x} cy={p.y} r={status === 'live' ? 4 : 3} fill={fill}>
                {status === 'live' && (
                  <animate attributeName="r" values="3.4;5;3.4" dur="1.8s" repeatCount="indefinite" />
                )}
              </circle>
            );
          })}
          <circle cx={nowPoint.x} cy={nowPoint.y} r="2.4" fill="#ffffff" />
        </svg>
        <div className={styles.ringCenter}>
          <div className={styles.ringTime}>{now ? fmtTime(nowMinutes) : '—'}</div>
          <div className={styles.ringDate}>
            {now ? now.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' }) : ''}
          </div>
        </div>
      </div>

      <div className={styles.agenda}>
        <div className={styles.agendaCaption}>Example agenda · loads live once signed in</div>
        {SLOTS.map((slot, i) => {
          const status = statusFor(slot, nowMinutes);
          return (
            <div className={styles.agendaItem} key={i}>
              <span className={styles.agendaTime}>{fmtTime(slot.start)}</span>
              <span className={styles.agendaBody}>
                <span className={styles.agendaTitle}>{slot.title}</span>
                <span className={styles.agendaRoom}>{slot.room}</span>
              </span>
              <span className={`${styles.agendaStatus} ${styles[status]}`}>{status}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}