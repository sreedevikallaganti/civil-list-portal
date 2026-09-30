/// <reference path="../pb_data/types.d.ts" />

// Automatic meeting reminders — runs every 5 minutes (logic in reminders_lib.js).
// Emails go out through PocketBase's own mailer: Dashboard → Settings → Mail settings.

cronAdd("meeting_reminders", "*/5 * * * *", () => {
  require(`${__hooks}/reminders_lib.js`).runReminders($app);
});
