/// <reference path="../pb_data/types.d.ts" />

// Civillist — premium features (PocketBase v0.23+ / tested against the v0.40 API)
//
// Runs automatically the next time you start `pocketbase.exe serve`.
//   • meetings.minutes     — plain-text minutes of meeting (MoM)
//   • meetings.series_id   — links the occurrences of a repeating meeting
//   • meeting_actions      — action items (title, owner, due date, done)
//
// API rules for meeting_actions are copied from your meetings collection,
// so whoever can see/edit meetings can see/edit their action items.
// Safe to run on a database that already has some of these.

migrate((app) => {
  const meetings = app.findCollectionByNameOrId("meetings");

  if (!meetings.fields.getByName("minutes")) {
    meetings.fields.add(new TextField({ name: "minutes", max: 100000 }));
  }
  if (!meetings.fields.getByName("series_id")) {
    meetings.fields.add(new TextField({ name: "series_id", max: 60 }));
  }
  app.save(meetings);

  let exists = true;
  try { app.findCollectionByNameOrId("meeting_actions"); } catch (_) { exists = false; }
  if (exists) return;

  const actions = new Collection({
    type: "base",
    name: "meeting_actions",
    listRule: meetings.listRule,
    viewRule: meetings.viewRule,
    createRule: meetings.createRule,
    updateRule: meetings.updateRule,
    deleteRule: meetings.deleteRule,
    fields: [
      { name: "meeting", type: "relation", collectionId: meetings.id, maxSelect: 1, cascadeDelete: true, required: true },
      { name: "title", type: "text", required: true, max: 500 },
      { name: "owner", type: "text", max: 200 },
      { name: "due_date", type: "date" },
      { name: "done", type: "bool" },
      { name: "done_at", type: "date" },
      { name: "created", type: "autodate", onCreate: true, onUpdate: false },
      { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
    ],
  });
  app.save(actions);
}, (app) => {
  try { app.delete(app.findCollectionByNameOrId("meeting_actions")); } catch (_) {}

  const meetings = app.findCollectionByNameOrId("meetings");
  meetings.fields.removeByName("minutes");
  meetings.fields.removeByName("series_id");
  app.save(meetings);
});
