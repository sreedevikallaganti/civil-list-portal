/// <reference path="../pb_data/types.d.ts" />

// Civillist — data hygiene + access control (PocketBase v0.23+)
//
// 1. Adds `created` / `updated` autodate fields where they are missing, so
//    lists can be sorted "newest first" (sort=-created used to return 400).
// 2. Locks every app collection to signed-in users. Before this, the rules were
//    empty ("") = PUBLIC: anyone on the network could list, create and delete
//    meetings, read all users, officers and activity logs.
//      list / view            → must be signed in
//      create / update / delete → must be signed in AND not a viewer
//    Existing conditions are kept and ANDed with these; a null rule
//    (superuser-only) is left alone. Safe to run twice.

const STAMPED = ["meetings", "other_contacts", "ias_officers", "ips_officers", "employees", "deleted_records"];
const LOCKED = [
  "meetings", "other_contacts", "ias_officers", "ips_officers", "employees", "users",
  "deleted_records", "activity_logs", "update_logs", "meeting_actions",
];
const SIGNED_IN = '@request.auth.id != ""';
const NOT_VIEWER = '@request.auth.permissions !~ "viewer"';

function findOrNull(app, name) {
  try { return app.findCollectionByNameOrId(name); } catch (_) { return null; }
}

function tighten(rule, extra) {
  if (rule === null || rule === undefined) return rule; // superuser-only — already strictest
  const s = String(rule).trim();
  const missing = extra.filter((c) => s.indexOf(c) === -1);
  if (!missing.length) return rule;
  return s === "" ? missing.join(" && ") : "(" + s + ") && " + missing.join(" && ");
}

migrate((app) => {
  for (const name of STAMPED) {
    const col = findOrNull(app, name);
    if (!col) continue;
    if (!col.fields.getByName("created")) {
      col.fields.add(new AutodateField({ name: "created", onCreate: true, onUpdate: false }));
    }
    if (!col.fields.getByName("updated")) {
      col.fields.add(new AutodateField({ name: "updated", onCreate: true, onUpdate: true }));
    }
    app.save(col);
  }

  for (const name of LOCKED) {
    const col = findOrNull(app, name);
    if (!col) continue;
    col.listRule = tighten(col.listRule, [SIGNED_IN]);
    col.viewRule = tighten(col.viewRule, [SIGNED_IN]);
    col.createRule = tighten(col.createRule, [SIGNED_IN, NOT_VIEWER]);
    col.updateRule = tighten(col.updateRule, [SIGNED_IN, NOT_VIEWER]);
    col.deleteRule = tighten(col.deleteRule, [SIGNED_IN, NOT_VIEWER]);
    app.save(col);
  }
}, (app) => {
  // Rollback strips only the conditions this migration added.
  const strip = (rule) => {
    if (rule === null || rule === undefined) return rule;
    let s = String(rule);
    for (const c of [NOT_VIEWER, SIGNED_IN]) {
      s = s.split(" && " + c).join("");
      if (s === c) s = "";
    }
    const m = /^\((.*)\)$/s.exec(s);
    return m ? m[1] : s;
  };
  for (const name of LOCKED) {
    const col = findOrNull(app, name);
    if (!col) continue;
    for (const key of ["listRule", "viewRule", "createRule", "updateRule", "deleteRule"]) col[key] = strip(col[key]);
    app.save(col);
  }
  // autodate fields are left in place on rollback — removing them would drop the timestamps.
});
