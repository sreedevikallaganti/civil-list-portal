/// <reference path="../pb_data/types.d.ts" />

// Civillist — bulk import of associates through a staging area (PocketBase v0.23+)
//
// associate_imports: one record per uploaded Excel / CSV file (an "import batch").
//   file · file_name · file_hash   the original upload (protected) and its SHA-256, to catch the same file twice
//   status                          uploaded → validating → draft / ready → submitted (or failed)
//   settings (JSON)                 sheet, headers, column choices, fields to create, what to do with duplicates
//   rows (JSON)                     the parsed rows, with the user's corrections — NOT in `associates` yet
//   total · valid · invalid · duplicates   the last server-side check
//   result (JSON) · error           what submitting did / why it failed
//   uploaded_by · submitted_by · submitted_at
// Rows only reach `associates` through app/api/associates/imports/[id]/submit.
// Same access rules as the other organisation data. Safe to run twice.

const all = (...parts) => parts.filter(Boolean).join(" && ");
const SIGNED_IN = '@request.auth.id != ""';
const WRITER = all('@request.auth.role !~ "viewer"',
  '(@request.auth.permissions = null || @request.auth.permissions = "" || @request.auth.permissions !~ "viewer")');

function findOrNull(app, name) {
  try { return app.findCollectionByNameOrId(name); } catch (_) { return null; }
}

migrate((app) => {
  if (findOrNull(app, "associate_imports")) return;
  const orgs = findOrNull(app, "organizations");

  const col = new Collection({ type: "base", name: "associate_imports" });
  col.fields.add(new TextField({ name: "file_name", required: true, max: 255 }));
  col.fields.add(new FileField({ name: "file", maxSelect: 1, maxSize: 15728640, protected: true }));
  col.fields.add(new TextField({ name: "file_hash", max: 64 }));
  col.fields.add(new SelectField({
    name: "status", required: true, maxSelect: 1,
    values: ["uploaded", "validating", "draft", "ready", "submitted", "failed"],
  }));
  col.fields.add(new JSONField({ name: "settings", maxSize: 2000000 }));
  col.fields.add(new JSONField({ name: "rows", maxSize: 30000000 }));
  for (const n of ["total", "valid", "invalid", "duplicates"]) col.fields.add(new NumberField({ name: n, onlyInt: true }));
  col.fields.add(new JSONField({ name: "result", maxSize: 20000 }));
  col.fields.add(new TextField({ name: "error", max: 2000 }));
  col.fields.add(new TextField({ name: "uploaded_by", max: 200 }));
  col.fields.add(new TextField({ name: "submitted_by", max: 200 }));
  col.fields.add(new DateField({ name: "submitted_at" }));
  if (orgs) {
    col.fields.add(new RelationField({ name: "org", collectionId: orgs.id, maxSelect: 1, required: true, cascadeDelete: false }));
  }
  col.fields.add(new AutodateField({ name: "created", onCreate: true, onUpdate: false }));
  col.fields.add(new AutodateField({ name: "updated", onCreate: true, onUpdate: true }));
  col.indexes = orgs
    ? ["CREATE INDEX idx_associate_imports_org ON associate_imports (org, created)",
       "CREATE INDEX idx_associate_imports_hash ON associate_imports (org, file_hash)"]
    : ["CREATE INDEX idx_associate_imports_hash ON associate_imports (file_hash)"];

  if (orgs) {
    const MEMBER = all(SIGNED_IN, '@request.auth.org != ""', '@request.auth.org.status != "suspended"');
    const SAME_ORG = "org = @request.auth.org";
    col.listRule = all(MEMBER, SAME_ORG);
    col.viewRule = all(MEMBER, SAME_ORG);
    col.createRule = all(MEMBER, WRITER, "@request.body.org = @request.auth.org");
    col.updateRule = all(MEMBER, SAME_ORG, WRITER, "(@request.body.org:isset = false || @request.body.org = @request.auth.org)");
    col.deleteRule = all(MEMBER, SAME_ORG, WRITER);
  } else {
    col.listRule = SIGNED_IN;
    col.viewRule = SIGNED_IN;
    col.createRule = all(SIGNED_IN, WRITER);
    col.updateRule = all(SIGNED_IN, WRITER);
    col.deleteRule = all(SIGNED_IN, WRITER);
  }
  app.save(col);
}, (app) => {
  const col = findOrNull(app, "associate_imports");
  if (col) app.delete(col);
});
