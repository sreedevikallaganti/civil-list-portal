/// <reference path="../pb_data/types.d.ts" />

// Civillist — Associates: directors and other senior officials (PocketBase v0.23+)
//
// Two collections, kept apart from employees / officers / other contacts:
//
//   associate_fields  the columns of the associates list. Users create, rename, reorder and
//                     delete them on the /associates page (or let an Excel import create them).
//                     key · label · type · options · required · show_in_table · sort_order
//
//   associates        one record per person. `name` is fixed; every other value lives in
//                     `data` (JSON), keyed by associate_fields.key — so new columns never
//                     need a schema change.
//
// Both belong to an organisation (`org`) when the database is multi-tenant
// (scripts/multi-tenant-pocketbase.mjs) and get the same access rules as the other data:
// members of the org can read, everyone except viewers can write. Safe to run twice.

const all = (...parts) => parts.filter(Boolean).join(" && ");
const SIGNED_IN = '@request.auth.id != ""';
const WRITER = all('@request.auth.role !~ "viewer"',
  '(@request.auth.permissions = null || @request.auth.permissions = "" || @request.auth.permissions !~ "viewer")');

function findOrNull(app, name) {
  try { return app.findCollectionByNameOrId(name); } catch (_) { return null; }
}

function rules(tenant) {
  if (!tenant) {
    return {
      listRule: SIGNED_IN, viewRule: SIGNED_IN,
      createRule: all(SIGNED_IN, WRITER), updateRule: all(SIGNED_IN, WRITER), deleteRule: all(SIGNED_IN, WRITER),
    };
  }
  const MEMBER = all(SIGNED_IN, '@request.auth.org != ""', '@request.auth.org.status != "suspended"');
  const SAME_ORG = "org = @request.auth.org";
  return {
    listRule: all(MEMBER, SAME_ORG),
    viewRule: all(MEMBER, SAME_ORG),
    createRule: all(MEMBER, WRITER, "@request.body.org = @request.auth.org"),
    updateRule: all(MEMBER, SAME_ORG, WRITER, "(@request.body.org:isset = false || @request.body.org = @request.auth.org)"),
    deleteRule: all(MEMBER, SAME_ORG, WRITER),
  };
}

function applyRules(col, r) {
  col.listRule = r.listRule;
  col.viewRule = r.viewRule;
  col.createRule = r.createRule;
  col.updateRule = r.updateRule;
  col.deleteRule = r.deleteRule;
}


migrate((app) => {
  const orgs = findOrNull(app, "organizations");

  // new Collection({ fields: [...] }) drops the fields on this PocketBase build, so each
  // collection is created empty and built up with fields.add() — like the other migrations.
  function create(name, fields, indexes) {
    const col = new Collection({ type: "base", name: name });
    for (const f of fields) col.fields.add(f);
    if (orgs) {
      col.fields.add(new RelationField({
        name: "org", collectionId: orgs.id, maxSelect: 1, required: true, cascadeDelete: false,
      }));
    }
    col.fields.add(new AutodateField({ name: "created", onCreate: true, onUpdate: false }));
    col.fields.add(new AutodateField({ name: "updated", onCreate: true, onUpdate: true }));
    col.indexes = indexes;
    applyRules(col, rules(!!orgs));
    app.save(col);
  }

  if (!findOrNull(app, "associate_fields")) {
    create("associate_fields", [
      new TextField({ name: "key", required: true, max: 64, pattern: "^[a-z][a-z0-9_]*$" }),
      new TextField({ name: "label", required: true, max: 80 }),
      new SelectField({
        name: "type", required: true, maxSelect: 1,
        values: ["text", "longtext", "number", "date", "email", "phone", "url", "select"],
      }),
      new JSONField({ name: "options", maxSize: 20000 }),
      new BoolField({ name: "required" }),
      new BoolField({ name: "show_in_table" }),
      new NumberField({ name: "sort_order", onlyInt: true }),
    ], orgs
      ? ["CREATE UNIQUE INDEX idx_associate_fields_org_key ON associate_fields (org, `key`)"]
      : ["CREATE UNIQUE INDEX idx_associate_fields_key ON associate_fields (`key`)"]);
  }

  if (!findOrNull(app, "associates")) {
    create("associates", [
      new TextField({ name: "name", required: true, max: 200 }),
      new JSONField({ name: "data", maxSize: 200000 }),
    ], orgs ? ["CREATE INDEX idx_associates_org ON associates (org)"] : []);
  }
}, (app) => {
  for (const name of ["associates", "associate_fields"]) {
    const col = findOrNull(app, name);
    if (col) app.delete(col);
  }
});
