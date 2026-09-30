// Automatic meeting reminders — shared logic, scheduled by reminders.pb.js
// PocketBase v0.23+ (tested against v0.40.2).
//
// Two reminders per meeting, sent by email through PocketBase's own mailer
// (Dashboard → Settings → Mail settings — use the same Gmail + app password
// as SMTP_USER / SMTP_PASS in your Next.js .env.local):
//   • Day before  — sent at 18:00 (office time) for all of tomorrow's meetings
//   • 1 hour before — sent ~60 minutes before the start time
// Only Scheduled / Rescheduled meetings get reminders.

/* ------------------------------ settings ------------------------------ */

// Meeting times are entered in this time zone (same as APP_TIMEZONE in the
// Next.js app — Asia/Kolkata = +05:30 = 330 minutes).
// Override on the server with the env var APP_TZ_OFFSET_MIN (e.g. 240 for Dubai).
const TZ_OFFSET_MIN = Number($os.getenv("APP_TZ_OFFSET_MIN")) || 330;
// When the "tomorrow" reminder goes out, in that same time zone.
const DAY_BEFORE_AT = 18 * 60; // 18:00
// Always copy these addresses too (e.g. the office / organiser). Leave [] for none.
const EXTRA_RECIPIENTS = [];
const APP_NAME = "Civillist Meetings";

/* ------------------------------ helpers ------------------------------ */

const DAY = 1440;
const ACTIVE = ["scheduled", "rescheduled"];

function pad(n) { return (n < 10 ? "0" : "") + n; }
function hhmm(min) { const x = ((min % DAY) + DAY) % DAY; return pad(Math.floor(x / 60)) + ":" + pad(x % 60); }
function isoFromDayNum(n) { return new Date(n * 86400000).toISOString().slice(0, 10); }
function dayNum(iso) { const p = iso.split("-").map(Number); return Math.round(Date.UTC(p[0], p[1] - 1, p[2]) / 86400000); }

function toMin(t) {
  const m = /^(\d{1,2}):(\d{2})/.exec(String(t || "").trim());
  if (!m) return null;
  const h = Number(m[1]), mm = Number(m[2]);
  return h > 23 || mm > 59 ? null : h * 60 + mm;
}

function isEmail(s) { return /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/.test(s); }

function recipientsOf(rec) {
  const out = [];
  const push = (v) => {
    const s = String(v || "").trim().toLowerCase();
    if (isEmail(s) && out.indexOf(s) === -1) out.push(s);
  };
  push(rec.getString("email"));

  // attendees may be saved as "a@x.com, b@y.com", a JSON array, or {attendees:[...]}
  // (getString returns the raw JSON text of a JSON field, e.g. "\"a@x.com, b@y.com\"" or "[\"a@x.com\"]")
  let raw = rec.getString("attendees");
  for (let i = 0; i < 2 && typeof raw === "string"; i++) {
    try { raw = JSON.parse(raw); } catch (_) { break; }
  }
  if (typeof raw === "string") raw.split(/[,;\s]+/).forEach(push);
  else if (Array.isArray(raw)) raw.forEach(push);
  else if (raw && typeof raw === "object") {
    const arr = Array.isArray(raw.attendees) ? raw.attendees : Object.keys(raw).map((k) => raw[k]);
    arr.forEach(push);
  }
  EXTRA_RECIPIENTS.forEach(push);
  return out;
}

function esc(s) {
  return String(s || "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const WEEKDAYS = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
function prettyDate(iso) {
  const d = new Date(iso + "T00:00:00Z");
  return WEEKDAYS[d.getUTCDay()] + ", " + d.getUTCDate() + " " + MONTHS[d.getUTCMonth()] + " " + d.getUTCFullYear();
}

function emailHtml(rec, date, when, startMin) {
  const dur = Math.round(rec.getFloat("duration") || 30);
  const meet = rec.getString("meet_link");
  const row = (k, v) => v ? `<tr><td style="padding:6px 14px 6px 0;color:#64748b;font-weight:600">${k}</td><td style="padding:6px 0;color:#0f172a">${v}</td></tr>` : "";
  return `<div style="font-family:Segoe UI,Arial,sans-serif;max-width:560px;margin:auto;padding:8px">
    <p style="margin:0 0 6px;font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#7c3aed">Reminder · ${esc(when)}</p>
    <h2 style="margin:0 0 14px;color:#0f172a">${esc(rec.getString("agenda") || "Meeting")}</h2>
    <table style="border-collapse:collapse;font-size:14px">
      ${row("When", prettyDate(date) + " · " + hhmm(startMin) + "–" + hhmm(startMin + dur) + " (" + dur + " min)")}
      ${row("With", esc(rec.getString("officer_name")))}
      ${row("Where", esc(rec.getString("location")))}
    </table>
    ${meet ? `<p style="margin:20px 0"><a href="${esc(meet)}" style="background:#4f46e5;color:#fff;padding:10px 22px;border-radius:999px;text-decoration:none;font-weight:600">Join on Google Meet</a></p>` : ""}
    <p style="margin-top:22px;color:#94a3b8;font-size:12px">Automatic reminder from ${APP_NAME}.</p>
  </div>`;
}

function defaultSend(app, to, subject, html) {
  const meta = app.settings().meta;
  const message = new MailerMessage({
    from: { address: meta.senderAddress, name: meta.senderName || APP_NAME },
    to: to.map((address) => ({ address })),
    subject,
    html,
  });
  app.newMailClient().send(message);
}

/* ------------------------------ main ------------------------------ */

// Runs every 5 minutes. `nowMs` / `send` are only overridden in tests.
function runReminders(app, nowMs, send) {
  send = send || defaultSend;
  const localNow = Math.floor((nowMs === undefined ? Date.now() : nowMs) / 60000) + TZ_OFFSET_MIN; // minutes, local wall clock
  const today = Math.floor(localNow / DAY);
  const minuteOfDay = localNow - today * DAY;

  const rows = app.findRecordsByFilter(
    "meetings",
    "meeting_date >= {:from} && meeting_date < {:to}",
    "", 0, 0,
    { from: isoFromDayNum(today) + " 00:00:00.000Z", to: isoFromDayNum(today + 2) + " 00:00:00.000Z" }
  );

  const sent = [];
  const isDayBeforeTick = minuteOfDay >= DAY_BEFORE_AT && minuteOfDay < DAY_BEFORE_AT + 5;

  for (const rec of rows) {
    if (rec.getBool("deleted")) continue;
    if (ACTIVE.indexOf(String(rec.getString("status") || "Scheduled").toLowerCase()) === -1) continue;
    let date = "";
    try { date = rec.getDateTime("meeting_date").string().slice(0, 10); } catch (_) {}
    const t = toMin(rec.getString("meeting_time"));
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || t === null) continue;

    const start = dayNum(date) * DAY + t;
    let kind = null;
    if (start - localNow >= 55 && start - localNow < 60) kind = "In 1 hour";
    else if (isDayBeforeTick && dayNum(date) === today + 1) kind = "Tomorrow";
    if (!kind) continue;

    const to = recipientsOf(rec);
    if (!to.length) continue;
    const subject = (kind === "Tomorrow" ? "Tomorrow" : "In 1 hour") + ": " + (rec.getString("agenda") || "Meeting") + " at " + hhmm(t);
    try {
      send(app, to, subject, emailHtml(rec, date, kind, t));
      sent.push({ id: rec.id, kind: kind, to: to });
    } catch (err) {
      app.logger().error("Meeting reminder failed", "meeting", rec.id, "error", String(err));
    }
  }
  if (sent.length) app.logger().info("Meeting reminders sent", "count", sent.length);
  return sent;
}

module.exports = { runReminders: runReminders, recipientsOf: recipientsOf };
