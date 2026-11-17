// lib/creatorAlerts.ts — follow-up emails for whoever created a meeting (meetings.owner_email),
// usually the PA. Pure: meetings + action items in, emails out — no network, easy to test.
// Sent by lib/alertsRunner (every 5 minutes on the Next.js server).
//
//   • "How did it go?"       — from 30 min after a meeting ends, while it is still Scheduled
//   • the morning digest     — from 09:00: follow-ups due, action items due, meetings needing a status
//
// Every email has a stable `key`; the runner remembers sent keys, so each goes out once.

export type AlertEmail = { key: string; to: string; subject: string; html: string };

type Row = Record<string, any>;
type Options = { now?: number; timeZone: string; appUrl?: string };

const DAY = 1440;
export const AFTER_MEETING_MIN = 30;
const AFTER_MEETING_UNTIL = 6 * 60;   // still worth asking up to 6 h after the meeting
export const DIGEST_AT = 9 * 60;      // 09:00
const DIGEST_UNTIL = 13 * 60;         // a server started late in the morning still sends it
const LOOKBACK_DAYS = 14;             // older follow-ups / action items stop nagging
const APP_NAME = 'Civillist Meetings';

const pad = (n: number) => String(n).padStart(2, '0');
const hhmm = (min: number) => { const x = ((min % DAY) + DAY) % DAY; return `${pad(Math.floor(x / 60))}:${pad(x % 60)}`; };
const isoFromDayNum = (n: number) => new Date(n * 86_400_000).toISOString().slice(0, 10);
const dayNum = (iso: string) => Math.round(Date.parse(`${iso}T00:00:00Z`) / 86_400_000);
const isEmail = (s: string) => /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/.test(s);
const esc = (s: unknown) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

function toMin(t: unknown) {
  const m = /^(\d{1,2}):(\d{2})/.exec(String(t || '').trim());
  if (!m) return null;
  const h = Number(m[1]), mm = Number(m[2]);
  return h > 23 || mm > 59 ? null : h * 60 + mm;
}
const dateOf = (v: unknown) => { const s = String(v || '').slice(0, 10); return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : ''; };
const ownerOf = (m: Row) => { const s = String(m.owner_email || '').trim().toLowerCase(); return isEmail(s) ? s : ''; };
const isLive = (m: Row) => !m.deleted && !/cancel|reject/i.test(String(m.status || ''));
const isActive = (m: Row) => !m.deleted && /^(scheduled|rescheduled)$/i.test(String(m.status || 'Scheduled'));
const durationOf = (m: Row) => Math.round(Number(m.duration) || 30);
const withWho = (m: Row) => (m.officer_name ? ` with ${m.officer_name}` : '');
const personKey = (m: Row) => String(m.officer_id || m.officer_name || '');

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const prettyDate = (iso: string) => {
  const d = new Date(`${iso}T00:00:00Z`);
  return `${WEEKDAYS[d.getUTCDay()]}, ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
};

/** Wall-clock minutes since 1970 in that time zone (meeting dates/times are entered in it). */
export function localMinutes(nowMs: number, timeZone: string) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  }).formatToParts(new Date(nowMs)).map((x) => [x.type, x.value]));
  return Math.round(Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute) / 60_000);
}

const button = (href: string, label: string) => href
  ? `<p style="margin:20px 0"><a href="${esc(href)}" style="background:#4f46e5;color:#fff;padding:10px 22px;border-radius:999px;text-decoration:none;font-weight:600">${esc(label)}</a></p>`
  : '';
const wrap = (kicker: string, title: string, body: string) =>
  `<div style="font-family:Segoe UI,Arial,sans-serif;max-width:560px;margin:auto;padding:8px">
    <p style="margin:0 0 6px;font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#7c3aed">${esc(kicker)}</p>
    <h2 style="margin:0 0 14px;color:#0f172a">${esc(title)}</h2>
    ${body}
    <p style="margin-top:22px;color:#94a3b8;font-size:12px">You get this because you created these meetings in ${APP_NAME}.</p>
  </div>`;

export function creatorAlerts(meetings: Row[], actions: Row[], opts: Options): AlertEmail[] {
  const localNow = localMinutes(opts.now ?? Date.now(), opts.timeZone);
  const today = Math.floor(localNow / DAY);
  const minuteOfDay = localNow - today * DAY;
  const base = String(opts.appUrl || '').trim().replace(/\/+$/, '');
  const link = (path: string) => (base ? base + path : '');
  const meetingLink = (m: Row) => link(`/meetings?open=${encodeURIComponent(m.id)}`);
  const out: AlertEmail[] = [];

  /* 1. "How did it go?" — ended 30 min – 6 h ago and still Scheduled */
  for (const m of meetings) {
    const owner = ownerOf(m);
    const date = dateOf(m.meeting_date);
    const t = toMin(m.meeting_time);
    if (!owner || !date || t === null || !isActive(m)) continue;
    const end = dayNum(date) * DAY + t + durationOf(m);
    const since = localNow - end;
    if (since < AFTER_MEETING_MIN || since >= AFTER_MEETING_UNTIL) continue;
    const agenda = m.agenda || 'Meeting';
    out.push({
      key: `after:${m.id}:${date}:${t}`,
      to: owner,
      subject: `How did it go? ${agenda}`,
      html: wrap(`Meeting ended · ${hhmm(end)}`, agenda,
        `<p style="color:#334155;font-size:14px">Your meeting${esc(withWho(m))} ended at ${hhmm(end)} and is still marked <b>Scheduled</b>.</p>
         <p style="color:#334155;font-size:14px">Mark it <b>Completed</b>, <b>Rescheduled</b> or <b>Cancelled</b>, note the minutes, and set a follow-up date if one is needed.</p>
         ${button(meetingLink(m), 'Update the meeting')}`),
    });
  }

  /* 2. the morning digest — one email per creator, only when something needs them */
  if (minuteOfDay < DIGEST_AT || minuteOfDay >= DIGEST_UNTIL) return out;
  const todayIso = isoFromDayNum(today);
  const fromIso = isoFromDayNum(today - LOOKBACK_DAYS);

  // a follow-up is done once a later meeting with the same person exists (same rule as the bell)
  const latest = new Map<string, Row>();
  for (const m of meetings) {
    const k = personKey(m);
    if (!k || !isLive(m)) continue;
    const prev = latest.get(k);
    if (!prev || dateOf(m.meeting_date) > dateOf(prev.meeting_date)) latest.set(k, m);
  }

  const digest = new Map<string, { followups: string[]; actions: string[]; status: string[] }>();
  const add = (owner: string, section: 'followups' | 'actions' | 'status', html: string) => {
    if (!digest.has(owner)) digest.set(owner, { followups: [], actions: [], status: [] });
    digest.get(owner)![section].push(html);
  };
  const item = (m: Row, text: string) => {
    const href = meetingLink(m);
    const title = esc(m.agenda || 'Meeting') + esc(withWho(m));
    return `<li style="margin:0 0 8px"><b>${href ? `<a href="${esc(href)}" style="color:#4f46e5">${title}</a>` : title}</b><br><span style="color:#64748b">${text}</span></li>`;
  };

  const byId = new Map(meetings.map((m) => [m.id, m]));
  for (const m of meetings) {
    const owner = ownerOf(m);
    if (!owner || !isLive(m)) continue;
    const fu = dateOf(m.follow_up_date);
    const k = personKey(m);
    if (fu && fu <= todayIso && fu >= fromIso && (!k || latest.get(k) === m)) {
      const notes = String(m.follow_up_notes || '').slice(0, 140);
      add(owner, 'followups', item(m, (fu === todayIso ? 'Due today' : `Overdue since ${prettyDate(fu)}`) + (notes ? ` · ${esc(notes)}` : '')));
    }
    const date = dateOf(m.meeting_date);
    const t = toMin(m.meeting_time);
    if (isActive(m) && date && date >= fromIso && t !== null && dayNum(date) * DAY + t + durationOf(m) < localNow) {
      add(owner, 'status', item(m, `Held ${prettyDate(date)} · still marked Scheduled`));
    }
  }
  for (const a of actions) {
    const due = dateOf(a.due_date);
    if (a.done || !due || due > todayIso || due < fromIso) continue;
    const m = byId.get(a.meeting);
    const owner = m ? ownerOf(m) : '';
    if (!m || !owner || !isLive(m)) continue;
    const who = a.owner ? ` · ${esc(a.owner)}` : '';
    add(owner, 'actions', item(m, `${esc(a.title)}${who} · ${due === todayIso ? 'due today' : `overdue since ${prettyDate(due)}`}`));
  }

  const section = (title: string, list: string[]) => list.length
    ? `<h3 style="margin:18px 0 8px;font-size:15px;color:#0f172a">${title} (${list.length})</h3><ul style="padding-left:18px;margin:0;font-size:14px">${list.join('')}</ul>`
    : '';
  for (const [owner, d] of digest) {
    const count = d.followups.length + d.actions.length + d.status.length;
    out.push({
      key: `digest:${owner}:${todayIso}`,
      to: owner,
      subject: `Today's follow-ups: ${count} item${count === 1 ? '' : 's'}`,
      html: wrap(`Follow-ups · ${prettyDate(todayIso)}`, `${count} thing${count === 1 ? '' : 's'} need your attention`,
        section('Follow-ups due', d.followups) + section('Action items due', d.actions) +
        section('Meetings that need a status', d.status) + button(link('/meetings'), 'Open Civillist')),
    });
  }
  return out;
}
