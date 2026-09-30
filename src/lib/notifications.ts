/* lib/notifications.ts — everything worth telling the user right now, computed
   from meetings + today's directory records. Pure: no network, easy to test.

   Each notification has a stable `id` (so read / dismissed state survives
   reloads) and an `href` that opens the right screen. */

import { meetingStartsAt } from '@/lib/meetingRules';
import { occasions, postingChanges, type LivePerson } from '@/lib/liveDirectory';
import { metBeforeFor, tripDates, upcomingTrips, isoDay, type Trip } from '@/lib/trips';

export type NotificationKind =
  | 'starting' | 'today' | 'trip' | 'followup' | 'overdue' | 'minutes' | 'occasion' | 'posting';

export type AppNotification = {
  id: string;
  kind: NotificationKind;
  title: string;
  body: string;
  href: string;
  urgent?: boolean;   // shown with an accent + counted first
  at: number;         // sort key (ms) — sooner / more recent first
  trip?: Trip;        // for 'trip' — the panel lists suggestions
};

const isOff = (m: any) => /cancel|reject/i.test(String(m?.status || '')) || m?.deleted;
const isScheduled = (m: any) => /^(scheduled|rescheduled)$/i.test(String(m?.status || 'Scheduled'));
const who = (m: any) => (m?.officer_name ? ` with ${m.officer_name}` : '');
const hhmm = (d: Date) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
const openMeeting = (m: any) => `/meetings?open=${encodeURIComponent(m.id)}`;

export function buildNotifications(meetings: any[], people: Map<string, LivePerson>, now = new Date()): AppNotification[] {
  const out: AppNotification[] = [];
  const today = isoDay(now);
  const live = meetings.filter((m) => !isOff(m));

  /* 1. starting within the hour */
  for (const m of live) {
    const start = meetingStartsAt(m);
    if (!start || !isScheduled(m)) continue;
    const mins = Math.round((+start - +now) / 60_000);
    if (mins >= 0 && mins <= 60) {
      out.push({
        id: `starting:${m.id}:${dayKey(m)}`, kind: 'starting', urgent: true, at: +start,
        title: mins <= 1 ? `Starting now: ${m.agenda || 'Meeting'}` : `In ${mins} min: ${m.agenda || 'Meeting'}`,
        body: `${hhmm(start)}${who(m)}${m.location ? ` · ${m.location}` : ''}`,
        href: openMeeting(m),
      });
    }
  }

  /* 2. today's schedule */
  const todays = live.filter((m) => String(m.meeting_date || '').slice(0, 10) === today && isScheduled(m))
    .map((m) => ({ m, start: meetingStartsAt(m) }))
    .filter((x) => x.start && +x.start > +now)
    .sort((a, b) => +a.start! - +b.start!);
  if (todays.length) {
    const next = todays[0];
    out.push({
      id: `today:${today}:${todays.length}`, kind: 'today', at: +next.start!,
      title: `${todays.length} more meeting${todays.length > 1 ? 's' : ''} today`,
      body: `Next: ${next.m.agenda || 'Meeting'} at ${hhmm(next.start!)}${who(next.m)}`,
      href: openMeeting(next.m),
    });
  }

  /* 3. upcoming visits → who else to meet there */
  for (const trip of upcomingTrips(meetings, { withinDays: 30, now })) {
    const metBefore = metBeforeFor(trip, meetings);
    const daysAway = Math.round((Date.parse(`${trip.from}T00:00:00`) - Date.parse(`${today}T00:00:00`)) / 86_400_000);
    out.push({
      id: `trip:${trip.key}:${metBefore.length}`, kind: 'trip', trip, urgent: daysAway <= 7 && metBefore.length > 0,
      at: Date.parse(`${trip.from}T00:00:00`),
      title: `Visit to ${trip.label} · ${tripDates(trip)}`,
      body: metBefore.length
        ? `${trip.meetings.length} meeting${trip.meetings.length > 1 ? 's' : ''} booked. You’ve met ${metBefore.length} ${metBefore.length > 1 ? 'people' : 'person'} there before — meet them again?`
        : `${trip.meetings.length} meeting${trip.meetings.length > 1 ? 's' : ''} booked. See officers based in ${trip.label}.`,
      href: `/?visit=${encodeURIComponent(trip.key)}`,
    });
  }

  /* 4. follow-ups due today or overdue (latest meeting per person only) */
  const latestByPerson = new Map<string, any>();
  for (const m of live) {
    const k = m.officer_id || m.officer_name;
    if (!k) continue;
    const prev = latestByPerson.get(k);
    if (!prev || String(m.meeting_date) > String(prev.meeting_date)) latestByPerson.set(k, m);
  }
  for (const m of latestByPerson.values()) {
    const fu = String(m.follow_up_date || '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fu) || fu > today) continue;
    const overdue = fu < today;
    out.push({
      id: `followup:${m.id}:${fu}`, kind: 'followup', urgent: overdue, at: Date.parse(`${fu}T09:00:00`),
      title: `Follow up${who(m)}`,
      body: `${overdue ? 'Was due' : 'Due today'}${overdue ? ` ${new Date(`${fu}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}` : ''} · ${String(m.follow_up_notes || m.agenda || '').slice(0, 90)}`,
      href: openMeeting(m),
    });
  }

  /* 5. past meetings still marked Scheduled */
  const overdue = live.filter((m) => {
    const start = meetingStartsAt(m);
    return start && isScheduled(m) && +start + (Number(m.duration) || 30) * 60_000 < +now;
  });
  if (overdue.length) {
    out.push({
      id: `overdue:${overdue.map((m) => m.id).sort().join(',')}`, kind: 'overdue', at: +now - 1,
      title: overdue.length > 1 ? `${overdue.length} meetings need a status` : `1 meeting needs a status`,
      body: `Still “Scheduled” after the meeting time — mark them Completed, Rescheduled or Cancelled.`,
      href: '/meetings?filter=scheduled',
    });
  }

  /* 6. completed in the last 14 days without minutes */
  for (const m of live) {
    const start = meetingStartsAt(m);
    if (!start || !/complete/i.test(m.status || '') || String(m.minutes || '').trim()) continue;
    const ageDays = (+now - +start) / 86_400_000;
    if (ageDays < 0 || ageDays > 14) continue;
    out.push({
      id: `minutes:${m.id}`, kind: 'minutes', at: +start,
      title: `Add minutes: ${m.agenda || 'Meeting'}`,
      body: `Held ${start.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}${who(m)} — record what was decided while it’s fresh.`,
      href: openMeeting(m),
    });
  }

  /* 7. birthdays / service anniversaries in the next 3 days */
  for (const o of occasions(people, 3, now)) {
    out.push({
      id: `occasion:${o.kind}:${o.person.id}:${o.date}`, kind: 'occasion', urgent: o.inDays === 0,
      at: Date.parse(`${o.date}T08:00:00`),
      title: o.kind === 'birthday'
        ? `${o.person.name}’s birthday ${o.inDays === 0 ? 'today' : o.inDays === 1 ? 'tomorrow' : `on ${new Date(`${o.date}T00:00:00`).toLocaleDateString('en-IN', { weekday: 'long' })}`}`
        : `${o.person.name}: ${o.years} years of service ${o.inDays === 0 ? 'today' : `in ${o.inDays} days`}`,
      body: o.person.designation || 'A good moment to send wishes.',
      href: '/',
    });
  }

  /* 8. new postings */
  for (const c of postingChanges(meetings, people, now)) {
    out.push({
      id: `posting:${c.person.id}:${c.now}`, kind: 'posting', at: +now - 2,
      title: `${c.person.name} has a new posting`,
      body: `Now ${c.now} (was ${c.was})`,
      href: openMeeting(c.nextMeeting || c.lastMeeting),
    });
  }

  const ORDER: NotificationKind[] = ['starting', 'today', 'trip', 'followup', 'occasion', 'posting', 'overdue', 'minutes'];
  return out.sort((a, b) =>
    Number(!!b.urgent) - Number(!!a.urgent) || ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind) || a.at - b.at);
}

function dayKey(m: any) {
  return `${String(m.meeting_date || '').slice(0, 10)}T${m.meeting_time || ''}`;
}
