/// <reference path="../pb_data/types.d.ts" />

// Civillist — everyone in a meeting, not just the main officer (PocketBase v0.23+)
//
// Adds `participants` (JSON) to meetings: the other participants by name, directory id,
// type and e-mail — people without an e-mail are kept too (see src/lib/participants.ts).
// Safe to run twice.

migrate((app) => {
  const col = app.findCollectionByNameOrId("meetings");
  if (!col.fields.getByName("participants")) {
    col.fields.add(new JSONField({ name: "participants", maxSize: 200000 }));
    app.save(col);
  }
}, (app) => {
  const col = app.findCollectionByNameOrId("meetings");
  if (col.fields.getByName("participants")) {
    col.fields.removeByName("participants");
    app.save(col);
  }
});
