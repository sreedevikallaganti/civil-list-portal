This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## Multiple organisations (multi-tenancy)

Every record (meetings, officers, contacts, employees, users, logs) belongs to one organisation through an
`org` field. PocketBase's API rules make sure people only ever see and change their own organisation's data.

**One-time setup** (asks for the PocketBase superuser login and shows every change before applying it):

```bash
node scripts/multi-tenant-pocketbase.mjs --dry-run   # preview only
node scripts/multi-tenant-pocketbase.mjs             # apply
```

It creates the `organizations` collection, adds `org` to every collection, puts all existing data into
your first organisation and installs the access rules. It is safe to run again. Also copy
`pb_hooks/meeting_conflicts.js` to the PocketBase server so time-slot clashes are checked per organisation.

**Day to day**
- Sign in with a PocketBase superuser account (the platform owner) and open **/organizations** to add an
  organisation with its first admin, optionally copying the officer directory into it. That admin then adds
  their own team on the Users page.
- The platform owner works inside one organisation at a time (switch it in the sidebar).
- **Suspend** blocks an organisation's users from all of its data without deleting anything.
- Google Calendar / Meet uses the single Google account in `.env.local`, so it only works for organisations
  with "Allow Google Calendar & Meet" turned on.

Code: `src/lib/tenancy.ts` (stamps new records, scopes the owner's lists), `src/contexts/OrgContext.tsx`,
`src/components/organizations/OrganizationsView.tsx`, `requireGoogleOrg` in `src/lib/serverAuth.ts`.

## Video call: Google Meet or Zoom

The meeting form's **Video call** choice offers *None*, *Google Meet* (when Google is connected) and *Zoom*
(when Zoom is set up). The link is kept in `meet_link` either way, so no PocketBase change is needed.
A Zoom meeting is created on save, moved when the meeting is rescheduled and deleted when it is cancelled;
the link also goes into the Google Calendar event and the invite emails.

To set up Zoom: [marketplace.zoom.us](https://marketplace.zoom.us) → Develop → Build App → **Server-to-Server OAuth**,
add the scopes `meeting:write:meeting:admin`, `meeting:update:meeting:admin`, `meeting:delete:meeting:admin`,
activate it, then copy the Account ID / Client ID / Client secret to `ZOOM_ACCOUNT_ID` / `ZOOM_CLIENT_ID` /
`ZOOM_CLIENT_SECRET` in `.env.local` (optionally `ZOOM_USER_EMAIL` = the host) and restart the app.
Code: `src/lib/zoom.ts`, `src/app/api/zoom/`, `src/lib/videoCall.ts`.

## Follow-up alerts for whoever created the meeting

The person who creates a meeting (usually the PA) is saved on it (`meetings.owner_email`) and gets:
- an email **"How did it go?"** 30 minutes after the meeting ends, while it is still *Scheduled*;
- a **morning digest email** (from 09:00) of follow-ups due, action items due and meetings that still need a status;
- the same follow-ups in the app's bell — plus a phone / desktop pop-up after they click **Turn on alerts** there.

The emails are sent by the Next.js server, so nothing has to be copied to the PocketBase server. To turn them on:
1. PocketBase dashboard → `meetings` → **New field** → *Plain text*, name `owner_email` → Save.
2. In `.env.local` set `PB_ALERTS_EMAIL` / `PB_ALERTS_PASSWORD` (a PocketBase login that can read meetings) and,
   optionally, `APP_URL` for links in the emails. Restart the app — the log says `[alerts] follow-up emails on`.
3. Admins can preview what would go out with `POST /api/alerts` (`{ "send": true }` sends it right away).

Emails go out through the main mailbox (`SMTP_USER`); sent ones are remembered in `.alerts-sent.json`.
Only meetings created after step 1 have an owner. Code: `src/lib/creatorAlerts.ts`, `src/lib/alertsRunner.ts`.
