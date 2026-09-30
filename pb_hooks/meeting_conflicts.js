// Shared module for meetings.pb.js — PocketBase v0.23+ (tested against v0.40 API).
// Handlers run in isolated contexts, so this logic is require()'d inside each handler.

const DAY = 1440;
const NON_BLOCKING = ["cancelled", "rejected"];

function pad(n) { return (n < 10 ? "0" : "") + n; }

function toMin(t) {
  const m = /^(\d{1,2}):(\d{2})/.exec(String(t || "").trim());
  if (!m) return null;
  const h = Number(m[1]), mm = Number(m[2]);
  if (h > 23 || mm > 59) return null;
  return h * 60 + mm;
}

function hhmm(min) {
  const x = ((Math.round(min) % DAY) + DAY) % DAY;
  return pad(Math.floor(x / 60)) + ":" + pad(x % 60);
}

function dayNum(iso) {
  const p = iso.split("-").map(Number);
  return Math.round(Date.UTC(p[0], p[1] - 1, p[2]) / 86400000);
}

function isoFromDayNum(n) {
  return new Date(n * 86400000).toISOString().slice(0, 10);
}

function dateOf(rec) {
  let v = "";
  try { v = rec.getDateTime("meeting_date").string(); } catch (_) {}
  if (!v) v = String(rec.getString("meeting_date") || "");
  return v.slice(0, 10);
}

function isBlocking(status) {
  return NON_BLOCKING.indexOf(String(status || "Scheduled").toLowerCase()) === -1;
}

function interval(rec) {
  const date = dateOf(rec);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const t = toMin(rec.getString("meeting_time"));
  if (t === null) return null;
  const dur = Math.max(1, Math.round(rec.getFloat("duration") || 30));
  const start = dayNum(date) * DAY + t;
  return { date: date, start: start, end: start + dur };
}

// Only re-check on update when something that affects the slot changed —
// so status-only edits, notes, documents, Google links etc. never get blocked.
function slotChanged(rec) {
  const orig = rec.original();
  if (!orig) return true;
  if (dateOf(orig) !== dateOf(rec)) return true;
  if (orig.getString("meeting_time") !== rec.getString("meeting_time")) return true;
  if (orig.getFloat("duration") !== rec.getFloat("duration")) return true;
  if (!isBlocking(orig.getString("status")) && isBlocking(rec.getString("status"))) return true; // un-cancelling
  return false;
}

function assertNoConflict(app, rec, isUpdate) {
  if (!isBlocking(rec.getString("status"))) return;
  if (isUpdate && !slotChanged(rec)) return;

  const me = interval(rec);
  if (!me) return; // incomplete data — let normal validation handle it

  const d = dayNum(me.date);
  const rows = app.findRecordsByFilter(
    "meetings",
    "meeting_date >= {:from} && meeting_date < {:to} && id != {:id}",
    "", 0, 0,
    {
      from: isoFromDayNum(d - 1) + " 00:00:00.000Z",
      to: isoFromDayNum(d + 2) + " 00:00:00.000Z",
      id: rec.id || "",
    }
  );

  for (const r of rows) {
    if (!isBlocking(r.getString("status"))) continue;
    if (r.getBool("deleted")) continue;
    const other = interval(r);
    if (!other) continue;
    if (me.start < other.end && me.end > other.start) {
      // The frontend detects this exact phrase ("overlaps another meeting").
      throw new BadRequestError(
        'This time slot overlaps another meeting: "' + (r.getString("agenda") || "Untitled") +
        '" (' + hhmm(other.start) + "–" + hhmm(other.end) + ")."
      );
    }
  }
}

module.exports = { assertNoConflict: assertNoConflict };