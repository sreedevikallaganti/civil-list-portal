// lib/participantMails.ts — which automatic emails are due right now (pure: no network, easy to test).
// Sent by lib/participantMailRunner every 5 minutes.
//
//   • Reminders      — 24 hours and 1 hour before each meeting, to everyone in it
//   • Birthdays      — on the day (from 09:00), to officers you have meetings with
//   • Work anniversaries — on the day (from 09:00), from the officer's date of joining
//
// Every email has a stable `key`; the runner remembers sent keys, so each goes out once.
// A reminder key includes the meeting's slot, so a rescheduled meeting is reminded again.
import { localMinutes } from './creatorAlerts';
import { meetingRecipients, type Recipient } from './meetingMail';
import { retirementDate } from './occasions';

type Row = Record<string, any>;
const DAY = 1440;
export const REMINDER_BEFORE = { day: 24 * 60, hour: 60 } as const;
const REMINDER_WINDOW = 60;           // a reminder is still sent up to an hour late (server restarts)
export const OCCASION_FROM = 9 * 60;  // greetings go out from 09:00 …
const OCCASION_UNTIL = 20 * 60;       // … until 20:00

const pad = (n: number) => String(n).padStart(2, '0');
const isoFromDayNum = (n: number) => new Date(n * 86_400_000).toISOString().slice(0, 10);
const dayNum = (iso: string) => Math.round(Date.parse(`${iso}T00:00:00Z`) / 86_400_000);
const dateOf = (v: unknown) => { const s = String(v ?? '').slice(0, 10); return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : ''; };
function toMin(t: unknown) {
  const m = /^(\d{1,2}):(\d{2})/.exec(String(t ?? '').trim());
  if (!m) return null;
  const h = Number(m[1]), mm = Number(m[2]);
  return h > 23 || mm > 59 ? null : h * 60 + mm;
}
const isActive = (m: Row) => !m.deleted && /^(scheduled|rescheduled)$/i.test(String(m.status || 'Scheduled'));

export type DueReminder = { key: string; meeting: Row; recipients: Recipient[]; before: 'day' | 'hour' };

/** Meeting reminders due now (24 h / 1 h before), for meetings that send emails. */
export function dueReminders(meetings: Row[], { now = Date.now(), timeZone }: { now?: number; timeZone: string }): DueReminder[] {
  const nowLocal = localMinutes(now, timeZone);
  const out: DueReminder[] = [];
  for (const m of meetings) {
    if (!isActive(m) || m.send_invite === false) continue;
    const date = dateOf(m.meeting_date);
    const t = toMin(m.meeting_time);
    if (!date || t === null) continue;
    const minutesLeft = dayNum(date) * DAY + t - nowLocal;
    const recipients = meetingRecipients(m);
    if (!recipients.length) continue;
    for (const before of ['day', 'hour'] as const) {
      const lead = REMINDER_BEFORE[before];
      // due once fewer than `lead` minutes are left — but not if we're already past the next reminder
      const next = before === 'day' ? REMINDER_BEFORE.hour : 0;
      if (minutesLeft <= lead && minutesLeft > Math.max(next, lead - REMINDER_WINDOW)) {
        out.push({ key: `rem-${before}:${m.id}:${date}T${pad(Math.floor(t / 60))}:${pad(t % 60)}`, meeting: m, recipients, before });
      }
    }
  }
  return out;
}

export type DirectoryPerson = { service: string; id: string; name: string; email: string; date_of_birth?: string; date_of_joining?: string };
export type DueGreeting = { key: string; kind: 'birthday' | 'service'; person: DirectoryPerson; years: number };

/** Birthdays and work anniversaries today (from 09:00 until 20:00) for these officers. */
export function dueGreetings(people: DirectoryPerson[], { now = Date.now(), timeZone }: { now?: number; timeZone: string }): DueGreeting[] {
  const nowLocal = localMinutes(now, timeZone);
  const today = isoFromDayNum(Math.floor(nowLocal / DAY));
  const minute = nowLocal % DAY;
  if (minute < OCCASION_FROM || minute >= OCCASION_UNTIL) return [];
  const [y, md] = [Number(today.slice(0, 4)), today.slice(5)];
  // 29 Feb birthdays are wished on 28 Feb in other years
  const leap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
  const sameDay = (iso: string) => iso.slice(5) === md || (!leap && md === '02-28' && iso.slice(5) === '02-29');

  const out: DueGreeting[] = [];
  for (const p of people) {
    if (!/^\S+@\S+\.\S+$/.test(p.email || '')) continue;
    const dob = dateOf(p.date_of_birth);
    const doj = dateOf(p.date_of_joining);
    if (dob && sameDay(dob) && y > Number(dob.slice(0, 4))) {
      out.push({ key: `bday:${p.service}:${p.id}:${y}`, kind: 'birthday', person: p, years: y - Number(dob.slice(0, 4)) });
    }
    const retired = dob && retirementDate(dob) < today;
    if (doj && !retired && sameDay(doj) && y > Number(doj.slice(0, 4))) {
      out.push({ key: `wa:${p.service}:${p.id}:${y}`, kind: 'service', person: p, years: y - Number(doj.slice(0, 4)) });
    }
  }
  return out;
}

/** The directory officers a set of meetings is with: main participant + added participants, by service. */
export function officerRefs(meetings: Row[], serviceOf: (type: unknown) => string | null): Map<string, Set<string>> {
  const refs = new Map<string, Set<string>>();
  const add = (type: unknown, id: unknown) => {
    const s = serviceOf(type);
    const rid = String(id || '');
    if (!s || !/^[a-z0-9]{15}$/i.test(rid)) return;
    if (!refs.has(s)) refs.set(s, new Set());
    refs.get(s)!.add(rid);
  };
  for (const m of meetings) {
    if (m.deleted) continue;
    add(m.officer_type, m.officer_id);
    let extra: unknown = m.participants;
    if (typeof extra === 'string') { try { extra = JSON.parse(extra); } catch { extra = []; } }
    if (Array.isArray(extra)) for (const p of extra) add(p?.type, p?.id);
  }
  return refs;
}
