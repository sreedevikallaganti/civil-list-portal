/// <reference path="../pb_data/types.d.ts" />

// Server-side guard: rejects meetings that overlap an existing (non-cancelled) one.
// Catches double-clicks, two people booking at the same moment, and anything
// that bypasses the UI checks.

onRecordCreateRequest((e) => {
  require(`${__hooks}/meeting_conflicts.js`).assertNoConflict(e.app, e.record, false);
  e.next();
}, "meetings");

onRecordUpdateRequest((e) => {
  require(`${__hooks}/meeting_conflicts.js`).assertNoConflict(e.app, e.record, true);
  e.next();
}, "meetings");