'use client';

/* DocsView — /docs. Top: live status of every service (from GET /api/health), refreshed every
   30 s. Below: a short guide to the app — pages, roles, rules, integrations, shortcuts and fixes. */

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import {
  Activity, AlertTriangle, ArrowRight, BookOpen, CalendarDays, CheckCircle2, Clock, Database, ExternalLink,
  KeyRound, Keyboard, LifeBuoy, Loader2, Mail, RefreshCw, Settings2, ShieldCheck, Terminal, Users, Wrench, XCircle,
} from 'lucide-react';

type Level = 'ok' | 'warn' | 'down';
type Check = { key: string; label: string; status: Level; ms: number; detail: string; critical: boolean };
type Health = {
  status: 'ok' | 'degraded' | 'down';
  summary: string;
  checkedAt: string;
  durationMs: number;
  app: { name: string; version: string; environment: string; node: string; uptimeSeconds: number };
  checks: Check[];
};

const REFRESH_MS = 30_000;

const LEVEL: Record<Level, { pill: string; icon: ReactNode; word: string }> = {
  ok: { pill: 'bg-emerald-50 text-emerald-700 ring-emerald-200', icon: <CheckCircle2 className="h-4 w-4 text-emerald-500" />, word: 'Working' },
  warn: { pill: 'bg-amber-50 text-amber-700 ring-amber-200', icon: <AlertTriangle className="h-4 w-4 text-amber-500" />, word: 'Needs attention' },
  down: { pill: 'bg-rose-50 text-rose-700 ring-rose-200', icon: <XCircle className="h-4 w-4 text-rose-500" />, word: 'Down' },
};

const OVERALL = {
  ok: { box: 'from-emerald-50 to-teal-50 ring-emerald-200', dot: 'bg-emerald-500', title: 'All systems working' },
  degraded: { box: 'from-amber-50 to-orange-50 ring-amber-200', dot: 'bg-amber-500', title: 'Working, with warnings' },
  down: { box: 'from-rose-50 to-pink-50 ring-rose-200', dot: 'bg-rose-500', title: 'App is down' },
} as const;

const CHECK_ICON: Record<string, ReactNode> = {
  database: <Database className="h-5 w-5" />,
  google: <CalendarDays className="h-5 w-5" />,
  email: <Mail className="h-5 w-5" />,
  config: <Settings2 className="h-5 w-5" />,
};

const SECTIONS = [
  { id: 'status', label: 'Live status', icon: Activity },
  { id: 'overview', label: 'Overview', icon: BookOpen },
  { id: 'pages', label: 'Pages', icon: CalendarDays },
  { id: 'roles', label: 'Login & roles', icon: ShieldCheck },
  { id: 'rules', label: 'Data rules', icon: KeyRound },
  { id: 'integrations', label: 'Integrations', icon: Mail },
  { id: 'shortcuts', label: 'Shortcuts', icon: Keyboard },
  { id: 'troubleshooting', label: 'Troubleshooting', icon: LifeBuoy },
  { id: 'developers', label: 'For developers', icon: Terminal },
];

function uptime(s: number) {
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
  return d ? `${d}d ${h}h` : h ? `${h}h ${m}m` : m ? `${m}m` : `${s}s`;
}

export default function DocsView() {
  const [health, setHealth] = useState<Health | null>(null);
  const [error, setError] = useState('');
  const [checking, setChecking] = useState(false);

  const load = useCallback(async (fresh: boolean) => {
    setChecking(true);
    try {
      const res = await fetch(`/api/health${fresh ? '?fresh=1' : ''}`, { cache: 'no-store' });
      setHealth(await res.json());
      setError('');
    } catch {
      setError('The app server is not answering — it may be stopped or restarting.');
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    load(false);
    const t = setInterval(() => load(false), REFRESH_MS);
    return () => clearInterval(t);
  }, [load]);

  const overall = error ? OVERALL.down : health ? OVERALL[health.status] : null;

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-100 via-violet-50 to-purple-100 px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl">
        {/* Top bar */}
        <header className="flex flex-wrap items-center justify-between gap-3 rounded-3xl bg-white/90 px-5 py-4 shadow-sm ring-1 ring-violet-100 backdrop-blur">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-900 text-white shadow-md"><BookOpen className="h-5 w-5" /></span>
            <div>
              <h1 className="text-lg font-extrabold tracking-tight text-slate-900">
                Civillist <span className="bg-gradient-to-r from-violet-600 to-fuchsia-600 bg-clip-text text-transparent">Docs & Status</span>
              </h1>
              <p className="text-xs text-slate-500">Is the app working? How does it work? — all on one page.</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <a href="/api/health" target="_blank" rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-600 hover:border-violet-200 hover:text-violet-700">
              JSON <ExternalLink className="h-3.5 w-3.5" />
            </a>
            <Link href="/docs/api"
              className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-600 hover:border-violet-200 hover:text-violet-700">
              <Terminal className="h-3.5 w-3.5" /> Swagger
            </Link>
            <Link href="/docs/redoc"
              className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-600 hover:border-violet-200 hover:text-violet-700">
              <BookOpen className="h-3.5 w-3.5" /> ReDoc
            </Link>
            <Link href="/" className="inline-flex items-center gap-1.5 rounded-full bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800">
              Open the app <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </header>

        <div className="mt-6 grid gap-6 lg:grid-cols-[200px_minmax(0,1fr)]">
          {/* Contents */}
          <nav aria-label="Contents" className="hidden lg:block">
            <ul className="sticky top-6 space-y-1 rounded-3xl bg-white/80 p-3 shadow-sm ring-1 ring-violet-100">
              {SECTIONS.map(({ id, label, icon: Icon }) => (
                <li key={id}>
                  <a href={`#${id}`} className="flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-violet-50 hover:text-violet-700">
                    <Icon className="h-3.5 w-3.5" /> {label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>

          <main className="min-w-0 space-y-6">
            {/* ───────────── Live status ───────────── */}
            <section id="status" className="scroll-mt-6 space-y-4">
              <div className={`rounded-3xl bg-gradient-to-br p-5 ring-1 ${overall?.box ?? 'from-white to-white ring-slate-200'}`}>
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    {overall ? (
                      <span className="relative flex h-4 w-4">
                        <span className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-50 ${overall.dot}`} />
                        <span className={`relative inline-flex h-4 w-4 rounded-full ${overall.dot}`} />
                      </span>
                    ) : <Loader2 className="h-5 w-5 animate-spin text-violet-500" />}
                    <div>
                      <p className="text-xl font-extrabold text-slate-900">{overall?.title ?? 'Checking…'}</p>
                      <p className="text-sm text-slate-600">{error || health?.summary || 'Asking every service…'}</p>
                    </div>
                  </div>
                  <button type="button" onClick={() => load(true)} disabled={checking}
                    className="inline-flex items-center gap-2 rounded-full bg-slate-900 px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-slate-800 disabled:opacity-60">
                    <RefreshCw className={`h-3.5 w-3.5 ${checking ? 'animate-spin' : ''}`} /> {checking ? 'Checking…' : 'Check now'}
                  </button>
                </div>
                {health && (
                  <p className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px] font-medium text-slate-500">
                    <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" /> Checked {new Date(health.checkedAt).toLocaleTimeString()} · in {health.durationMs} ms</span>
                    <span>Auto-refreshes every 30 s</span>
                    <span>v{health.app.version} · {health.app.environment} · Node {health.app.node}</span>
                    <span>Server up {uptime(health.app.uptimeSeconds)}</span>
                  </p>
                )}
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                {(health?.checks ?? []).map((c) => (
                  <div key={c.key} className="flex gap-3 rounded-3xl bg-white p-4 shadow-sm ring-1 ring-slate-100">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-violet-50 text-violet-600">{CHECK_ICON[c.key]}</span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-sm font-bold text-slate-900">{c.label}</p>
                        <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-bold ring-1 ring-inset ${LEVEL[c.status].pill}`}>
                          {LEVEL[c.status].icon} {LEVEL[c.status].word}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-slate-600">{c.detail}</p>
                      <p className="mt-1 text-[10px] font-medium text-slate-400">{c.ms} ms{c.critical ? ' · required for the app to work' : ' · optional extra'}</p>
                    </div>
                  </div>
                ))}
                {!health && !error && [0, 1, 2, 3].map((i) => <div key={i} className="h-24 animate-pulse rounded-3xl bg-white/70" />)}
              </div>
            </section>

            {/* ───────────── Guide ───────────── */}
            <Doc id="overview" icon={BookOpen} title="Overview">
              <p>
                <b>Civillist</b> is a meeting-management app for scheduling and recording meetings with IAS / IPS officers,
                contacts and employees. Data lives in <b>PocketBase</b> (the database); meetings can be added to
                <b> Google Calendar</b> with a <b>Meet</b> link, and invites are sent by <b>email</b>.
              </p>
              <p>If the database is down, the app cannot be used. Google and email are extras — when they fail, meetings are still saved.</p>
            </Doc>

            <Doc id="pages" icon={CalendarDays} title="Pages">
              <Table
                head={['Page', 'What it is for']}
                rows={[
                  [<L key="d" href="/">Dashboard</L>, 'Today at a glance: next meeting countdown, items needing attention, upcoming meetings & visits, reconnect, yearly recap, activity.'],
                  [<L key="m" href="/meetings">Meetings</L>, 'Every meeting — create, edit, update status (Completed / Rescheduled / Cancelled), minutes, photos, WhatsApp reminders, Google sync.'],
                  [<L key="c" href="/calendar">Calendar</L>, 'Day / Week / Month / Year / Agenda views, drag a meeting to reschedule, clash warnings, search & filters, .ics export.'],
                  // Meeting Map — hidden until the feature is confirmed
                  // [<L key="map" href="/map">Meeting Map</L>, 'Map of where meetings are held; ranks the places visited most (visit days and meetings), with each city’s meetings.'],
                  [<L key="o" href="/officers">Officers</L>, 'IAS / IPS directory and other contacts.'],
                  [<L key="e" href="/employees">Employees</L>, 'Internal staff directory.'],
                  [<L key="u" href="/users">Users</L>, 'Who can sign in, and their role.'],
                  [<L key="r" href="/reports">Reports</L>, 'Sortable reports, time report, activity log; export to CSV, Excel, JSON or PDF.'],
                  [<L key="y" href="/recap">Yearly Recap</L>, 'The year as a story: meetings, people, most-met officers, photo highlights.'],
                ]}
              />
            </Doc>

            <Doc id="roles" icon={ShieldCheck} title="Login & roles">
              <p>There is <b>one login page</b> for everyone. What a person can do is set by the <b>role</b> field of their record in PocketBase’s <code>users</code> collection:</p>
              <Table
                head={['Role', 'Can do']}
                rows={[
                  ['Super Admin / Admin', 'Everything, including Google connection settings.'],
                  ['Editor (default when no role is set)', 'Create, edit, reschedule and delete meetings; send invites.'],
                  ['Viewer', 'Read only.'],
                  ['PocketBase superuser', 'Signs in on the same page; treated as Admin.'],
                ]}
              />
              <p>Accounts whose <code>status</code> is not “Active” cannot sign in. Every sign-out returns to the same login page.</p>
            </Doc>

            <Doc id="rules" icon={KeyRound} title="Data rules (validation)">
              <Table
                head={['Field', 'Rule']}
                rows={[
                  ['Names', 'Letters only (any language), plus space . \' - for titles and initials — e.g. “Dr. K. D’Souza-Rao”. Digits and symbols cannot be typed.'],
                  ['Phone numbers', 'Pick the country (India by default), then the number. Only digits; length and format follow that country’s real numbering plan. Saved as “+91 98765 43210”. Pasting “+971 …” switches the country.'],
                  ['Agenda', 'Anything — letters, numbers, symbols; required, up to 500 characters.'],
                  ['Meeting dates', 'Cannot be in the past; a meeting cannot be marked Completed before it starts; overlapping time slots are blocked.'],
                ]}
              />
            </Doc>

            <Doc id="integrations" icon={Mail} title="Integrations">
              <h3>Google Calendar & Meet</h3>
              <p>Uses one Google account through a <b>refresh token</b> (<code>GOOGLE_REFRESH_TOKEN</code> in <code>.env.local</code>). If the status board shows it expired:</p>
              <ol>
                <li>Open the <b>OAuth 2.0 Playground</b> → ⚙️ → tick <b>Use your own OAuth credentials</b>, paste the same Client ID / secret as <code>.env.local</code>, access type <b>Offline</b>.</li>
                <li>Scopes: <code>https://www.googleapis.com/auth/calendar https://www.googleapis.com/auth/calendar.events</code> → <b>Authorize APIs</b> → sign in with the calendar’s account.</li>
                <li><b>Exchange authorization code for tokens</b> → copy the refresh token into <code>GOOGLE_REFRESH_TOKEN</code> → save → restart the server.</li>
                <li>Keep it from expiring weekly: Google Cloud Console → OAuth consent screen → <b>Publish app</b>.</li>
              </ol>
              <h3>Email invites</h3>
              <p>Sent through SMTP (<code>SMTP_HOST</code>, <code>SMTP_PORT</code>, <code>SMTP_USER</code>, <code>SMTP_PASS</code>). For Gmail, <code>SMTP_PASS</code> must be an <b>App password</b>, not the normal password.</p>
            </Doc>

            <Doc id="shortcuts" icon={Keyboard} title="Keyboard shortcuts">
              <Table
                head={['Where', 'Keys']}
                rows={[
                  ['Everywhere', 'Ctrl + B — collapse / expand the sidebar'],
                  ['Dashboard', 'Ctrl + K or / — search & jump · N — new meeting · R — yearly recap'],
                  ['Meetings', 'Ctrl + K — command palette · N — new meeting'],
                  ['Calendar', '← / → previous / next · T today · D W M Y A switch view · N new · / search · ? help'],
                ]}
              />
            </Doc>

            <Doc id="troubleshooting" icon={Wrench} title="Troubleshooting">
              <Table
                head={['You see', 'Do this']}
                rows={[
                  ['Status: Database down / “Cannot reach the server”', 'Start PocketBase, and check NEXT_PUBLIC_POCKETBASE_URL in .env.local points to it.'],
                  ['“Google connection expired” after saving a meeting', 'The meeting was saved. Renew GOOGLE_REFRESH_TOKEN (see Integrations) and restart the server.'],
                  ['Google “Error 400: redirect_uri_mismatch”', 'Add http://localhost:3000/api/google/callback and https://<your-domain>/api/google/callback to the OAuth client’s Authorized redirect URIs.'],
                  ['Invites not arriving', 'Status board → Email. Use a Gmail App password; check the spam folder.'],
                  ['“Your session has expired”', 'Sign in again.'],
                  ['Admin options missing', 'Set the user’s role to “Admin” or “Super Admin” in PocketBase, then sign out and in.'],
                  ['Photos can’t be saved', 'Add a File field named “photos” to the meetings collection.'],
                  ['This page itself does not load', 'The app server is stopped — run npm run dev (or restart the production server).'],
                ]}
              />
            </Doc>

            <Doc id="developers" icon={Terminal} title="For developers">
              <Table
                head={['Command', 'Does']}
                rows={[
                  [<code key="1">npm run dev</code>, 'Development server on http://localhost:3000 with live reload.'],
                  [<code key="2">npm run build</code>, 'Type-checks and compiles an optimised production build into .next — fails on errors.'],
                  [<code key="3">npm run start</code>, 'Serves the production build.'],
                  [<code key="4">npm run typecheck</code>, 'TypeScript check only (fast).'],
                  [<code key="5">npm run test</code>, 'Unit tests (Vitest): roles, meeting rules, notifications, validation.'],
                  [<code key="6">npm run lint</code>, 'ESLint.'],
                ]}
              />
              <h3>API reference (Swagger & ReDoc)</h3>
              <p>
                Every server route is described in an OpenAPI 3.1 file, <code>public/openapi.json</code>, served at{' '}
                <a href="/openapi.json" className="text-violet-700 hover:underline">/openapi.json</a>. Browse and try it in{' '}
                <L href="/docs/api">Swagger UI</L> (try requests), read it in <L href="/docs/redoc">ReDoc</L> (clean reference), or
                import the file into Postman / Insomnia. Meeting data itself comes from
                PocketBase’s own REST API, proxied at <code>/pb/api/…</code>. When you add or change a route under{' '}
                <code>src/app/api</code>, update <code>openapi.json</code> too.
              </p>
              <h3>Health endpoint (for uptime monitors)</h3>
              <p>
                <code>GET /api/health</code> returns JSON with <code>status</code> = <b>ok</b> / <b>degraded</b> / <b>down</b> and one entry per service.
                HTTP <b>200</b> while the app is usable, <b>503</b> when it is down. Results are cached for a minute; add <code>?fresh=1</code> to re-check now.
                It never exposes addresses, emails or secrets.
              </p>
              <pre className="overflow-x-auto rounded-2xl bg-slate-900 p-4 text-[12px] leading-relaxed text-slate-100"><code>{`curl -s https://<your-domain>/api/health
# → {"status":"ok","summary":"Everything is working.", "checks":[…]}`}</code></pre>
              <h3>Settings (.env.local)</h3>
              <p>
                <code>NEXT_PUBLIC_POCKETBASE_URL</code> · <code>GOOGLE_CLIENT_ID</code> · <code>GOOGLE_CLIENT_SECRET</code> · <code>GOOGLE_REFRESH_TOKEN</code> ·
                {' '}<code>GOOGLE_CALENDAR_ID</code> · <code>APP_TIMEZONE</code> · <code>SMTP_HOST</code> · <code>SMTP_PORT</code> · <code>SMTP_USER</code> · <code>SMTP_PASS</code>.
                Changes take effect after restarting the server.
              </p>
            </Doc>

            <p className="pb-4 text-center text-[11px] text-slate-400">
              <Users className="mr-1 inline h-3 w-3" /> Civillist · Meeting Management
            </p>
          </main>
        </div>
      </div>
    </div>
  );
}

/* ── small building blocks ── */

function Doc({ id, icon: Icon, title, children }: { id: string; icon: typeof BookOpen; title: string; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-6 rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-100 sm:p-6">
      <h2 className="flex items-center gap-2 text-base font-bold text-slate-900">
        <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-violet-50 text-violet-600"><Icon className="h-4 w-4" /></span>
        {title}
      </h2>
      <div className="mt-3 space-y-3 text-sm leading-relaxed text-slate-600 [&_code]:rounded-md [&_code]:bg-slate-100 [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:text-[12px] [&_code]:text-slate-800 [&_h3]:pt-2 [&_h3]:text-sm [&_h3]:font-bold [&_h3]:text-slate-900 [&_ol]:list-decimal [&_ol]:space-y-1.5 [&_ol]:pl-5 [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_pre_code]:text-slate-100">
        {children}
      </div>
    </section>
  );
}

function Table({ head, rows }: { head: string[]; rows: ReactNode[][] }) {
  return (
    <div className="overflow-x-auto rounded-2xl ring-1 ring-slate-100">
      <table className="w-full min-w-[520px] text-left text-[13px]">
        <thead className="bg-slate-50 text-[11px] font-bold uppercase tracking-wider text-slate-400">
          <tr>{head.map((h) => <th key={h} className="px-4 py-2.5">{h}</th>)}</tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((r, i) => (
            <tr key={i} className="align-top">
              {r.map((cell, j) => <td key={j} className={`px-4 py-2.5 ${j === 0 ? 'w-1/3 font-semibold text-slate-800' : 'text-slate-600'}`}>{cell}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function L({ href, children }: { href: string; children: ReactNode }) {
  return <Link href={href} className="text-violet-700 underline-offset-2 hover:underline">{children}</Link>;
}
