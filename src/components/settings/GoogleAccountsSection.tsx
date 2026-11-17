'use client';

/* GoogleAccountsSection — Settings → Google accounts (admins).
   The accounts meetings can be sent from: Calendar event, Meet link and invite emails.
   Shows whether each is connected and lets an admin connect (or reconnect) it with Google. */

import { CalendarCheck, Loader2, Mail, RefreshCw, TriangleAlert, Unplug } from 'lucide-react';
import { useEffect, useState } from 'react';
import { apiJSON } from '@/lib/apiClient';
import { useSenders, type SenderInfo } from '@/lib/useSenders';
import { showToast } from '@/components/Toaster';

const status = (s: SenderInfo) =>
  s.google.connected === true
    ? { text: 'Connected', cls: 'bg-emerald-50 text-emerald-700 ring-emerald-500/20', ok: true }
    : s.google.reason === 'expired'
      ? { text: 'Connection expired', cls: 'bg-rose-50 text-rose-700 ring-rose-500/20', ok: false }
      : s.google.reason === 'not_connected'
        ? { text: 'Not connected', cls: 'bg-amber-50 text-amber-700 ring-amber-500/20', ok: false }
        : { text: 'Couldn’t check', cls: 'bg-slate-100 text-slate-600 ring-slate-500/20', ok: false };

export default function GoogleAccountsSection({ isAdmin }: { isAdmin: boolean }) {
  /* the setup steps are for the developer — logged, not shown */
  useEffect(() => {
    console.info('[google accounts] to add one: in .env.local set SENDER_2_EMAIL (+ its Gmail app password SENDER_2_SMTP_PASS); SENDER_DEFAULT picks the account that sends invites; CALENDAR_ALL_ACCOUNTS=false stops copying meetings into the others. Restart the app, then Connect. The account must be allowed on the Google Cloud OAuth consent screen (Test users while the app is in testing).');
  }, []);
  const { senders, defaultSender, yourSender, allCalendars, reload } = useSenders();
  const [busy, setBusy] = useState<string | null>(null);

  const connect = async (s: SenderInfo) => {
    setBusy(s.id);
    try {
      const { url } = await apiJSON<{ url: string }>('/api/google/connect', { sender: s.id });
      const w = window.open(url, '_blank');
      if (!w) window.location.assign(url);
      showToast(`Sign in as ${s.email || s.label} in the Google tab, then click “Check again” here`, 'success');
    } catch (e: any) {
      console.warn('[google] could not start sign-in:', e);
      showToast('Couldn’t start the Google sign-in — please try again.', 'error');
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="overflow-hidden rounded-3xl bg-white shadow-sm ring-1 ring-slate-100">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-5 py-4 sm:px-6">
        <div>
          <h2 className="text-base font-bold text-slate-900">Google accounts</h2>
          <p className="mt-0.5 text-xs text-slate-500">
            Invites (emails, calendar invitations and the Google Meet link) come from the account marked <b>Sends invites</b>.
            {allCalendars ? ' Every meeting is also saved in the other accounts’ Google calendars (added as a guest).' : ''}
          </p>
        </div>
        <button type="button" onClick={() => reload(true)}
          className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 px-3.5 py-1.5 text-xs font-semibold text-slate-600 hover:border-violet-200 hover:text-violet-700">
          <RefreshCw className="h-3.5 w-3.5" /> Check again
        </button>
      </div>

      <div className="space-y-3 px-5 py-5 sm:px-6">
        {senders === null ? (
          <div className="space-y-2">{[0, 1].map((i) => <div key={i} className="skeleton h-16 rounded-2xl" />)}</div>
        ) : senders.length === 0 ? (
          <p className="text-sm text-slate-500">Google isn’t available for your account.</p>
        ) : (
          senders.map((s) => {
            const st = status(s);
            return (
              <div key={s.id} className="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-100 bg-slate-50/60 p-3.5">
                <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${st.ok ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'}`}>
                  {st.ok ? <CalendarCheck className="h-5 w-5" /> : <Unplug className="h-5 w-5" />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-slate-900">
                    <span className="truncate">{s.label}</span>
                    {s.id === defaultSender
                      ? <span className="rounded-full bg-violet-600 px-2 py-0.5 text-[10px] font-bold text-white">Sends invites</span>
                      : allCalendars && <span className="rounded-full bg-violet-50 px-2 py-0.5 text-[10px] font-bold text-violet-700">Gets every meeting in its calendar</span>}
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ring-1 ring-inset ${st.cls}`}>{st.text}</span>
                  </p>
                  {s.email && s.email !== s.label && <p className="truncate text-xs text-slate-500">{s.email}</p>}
                  <p className="mt-0.5 flex items-center gap-1 text-[11px] text-slate-400">
                    <Mail className="h-3 w-3" />
                    {s.canEmail ? 'Invite emails are sent from this mailbox' : 'No mailbox password yet — invite emails go from the main mailbox, replies come here'}
                  </p>
                </div>
                {/* admins connect any account; everyone else only their own (no one needs another person's password) */}
                {(isAdmin || s.id === yourSender) && (
                  <button type="button" onClick={() => connect(s)} disabled={busy === s.id}
                    className={`inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-semibold disabled:opacity-60 ${st.ok ? 'border border-slate-200 bg-white text-slate-600 hover:text-violet-700' : 'bg-slate-900 text-white hover:bg-slate-800'}`}>
                    {busy === s.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                    {st.ok ? 'Reconnect' : 'Connect'}
                  </button>
                )}
              </div>
            );
          })
        )}

        <div className="flex items-start gap-2 rounded-2xl border border-violet-100 bg-violet-50/50 px-4 py-3 text-[11px] leading-relaxed text-slate-600">
          <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-violet-500" />
          <span>
            To add another Google account, ask your developer to set it up (the steps are in the browser console).
            Once it appears here, click <b>Connect</b> and sign in with that account.
          </span>
        </div>
      </div>
    </section>
  );
}
