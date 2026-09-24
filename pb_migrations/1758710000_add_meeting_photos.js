/// <reference path="../pb_data/types.d.ts" />

/**
 * Civil List Portal — adds a "photos" field to the EXISTING "meetings" collection.
 * Nothing else in the collection is touched (no fields, rules or data changed).
 *
 * Copy into <pocketbase folder>/pb_migrations/ and restart PocketBase.
 * Safe to run on a database that already has a "photos" field — it skips it.
 */
migrate(
  (app) => {
    const meetings = app.findCollectionByNameOrId("meetings");
    if (meetings.fields.getByName("photos")) return;

    meetings.fields.add(
      new FileField({
        name: "photos",
        maxSelect: 10,
        maxSize: 10 * 1024 * 1024, // 10 MB per photo (the app shrinks them before upload anyway)
        mimeTypes: ["image/jpeg", "image/png", "image/webp"],
        thumbs: ["400x400", "1200x0"],
      })
    );
    app.save(meetings);
  },
  (app) => {
    const meetings = app.findCollectionByNameOrId("meetings");
    meetings.fields.removeByName("photos");
    app.save(meetings);
  }
);
