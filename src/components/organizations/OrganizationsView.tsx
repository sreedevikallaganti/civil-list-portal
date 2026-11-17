'use client';

/* OrganizationsView — /organizations, for the platform owner (a PocketBase superuser).
 * Add organisations with their first admin, rename / suspend them, choose which one may use the
 * shared Google account, and switch the organisation you are working in.
 * Each organisation's data is kept apart by the PocketBase API rules (lib/tenancy).
 */

import { useCallback, useEffect, useState } from 'react';
import { ArrowRightLeft, Building2, CalendarCheck, Check, Loader2, PauseCircle, PlayCircle, Plus, Users, X } from 'lucide-react';
import pb from '@/lib/pocketbase';
import { useOrg, type Org } from '@/contexts/OrgContext';
import { showToast } from '@/components/Toaster';
import { OFFICER_COLLECTIONS } from '@/lib/officerDirectory';

type Counts = { users: number; meetings: number; officers: number };

const count = async (collection: string, orgId: string) =>
  (await pb.collection(collection).getList(1, 1, { filter: `org = "${orgId}"`, fields: 'id', allOrgs: true, requestKey: null } as any)).totalItems;

const input = 'w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-800 outline-none transition-colors focus:border-violet-400 focus:ring-2 focus:ring-violet-100';
const label = 'mb-1 block text-xs font-semibold text-slate-600';

/** The officers directory (IAS / IPS / IFS / IRS) is shared by every organisation. */
async function directoryTotal() {
  const res = await Promise.all(OFFICER_COLLECTIONS.map((c) =>
    pb.collection(c).getList(1, 1, { fields: 'id', requestKey: null }).then((r) => r.totalItems).catch(() => 0)));
  return res.reduce((a, b) => a + b, 0);
}

export default function OrganizationsView() {
  const { enabled, isOwner, orgs, org: active, switchOrg, refresh } = useOrg();
  const [counts, setCounts] = useState<Record<string, Counts>>({});
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Org | null>(null);

  const loadCounts = useCallback(async () => {
    const officers = await directoryTotal();
    const entries = await Promise.all(orgs.map(async (o) => {
      const [users, meetings] = await Promise.all(
        ['users', 'meetings'].map((c) => count(c, o.id).catch(() => 0)),
      );
      return [o.id, { users, meetings, officers }] as const;
    }));
    setCounts(Object.fromEntries(entries));
  }, [orgs]);

  useEffect(() => {
    // fetch-on-mount: setState happens after the requests resolve
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (isOwner && enabled) void loadCounts();
  }, [isOwner, enabled, loadCounts]);

  if (!isOwner) {
    return (
      <Shell subtitle="Platform owner only">
        <Empty icon={<Building2 className="h-6 w-6" />} title="Only the platform owner manages organisations"
          text="Sign in with the platform owner account to add or manage organisations." />
      </Shell>
    );
  }

  if (!enabled) {
    console.info('[organisations] multi-organisation mode is off — run once on the app computer: node scripts/multi-tenant-pocketbase.mjs (asks for the PocketBase superuser login and shows every change before applying it)');
    return (
      <Shell subtitle="Not set up yet">
        <Empty icon={<Building2 className="h-6 w-6" />} title="Multi-organisation mode isn’t set up yet"
          text="It needs a one-time setup by your developer. They can find the steps in the browser console." />
      </Shell>
    );
  }

  const setStatus = async (o: Org, status: 'active' | 'suspended') => {
    try {
      await pb.collection('organizations').update(o.id, { status });
      showToast(status === 'suspended' ? `${o.name} suspended — its users can no longer sign in to any data` : `${o.name} is active again`, 'success');
      await refresh();
    } catch (e: any) {
      console.warn('[organisations] status update failed:', e);
      showToast(`Couldn’t update ${o.name} — please try again.`, 'error');
    }
  };

  return (
    <Shell
      subtitle={`${orgs.length} organisation${orgs.length === 1 ? '' : 's'} · each sees only its own data`}
      action={
        <button type="button" onClick={() => setCreating(true)}
          className="inline-flex items-center gap-2 rounded-full bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-slate-900/10 hover:bg-slate-800">
          <Plus className="h-4 w-4" /> New organisation
        </button>
      }
    >
      {creating && (
        <CreateOrgForm activeOrg={active} onClose={() => setCreating(false)}
          onCreated={async (o) => { setCreating(false); await refresh(); switchOrg(o.id); }} />
      )}
      {editing && (
        <EditOrgForm org={editing} onClose={() => setEditing(null)} onSaved={async () => { setEditing(null); await refresh(); }} />
      )}

      <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {orgs.map((o) => {
          const c = counts[o.id];
          const isActive = o.id === active?.id;
          const suspended = o.status === 'suspended';
          return (
            <li key={o.id} className={`flex flex-col rounded-3xl bg-white p-5 shadow-sm ring-1 ${isActive ? 'ring-2 ring-violet-400' : 'ring-slate-100'}`}>
              <div className="flex items-start gap-3">
                <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl ${suspended ? 'bg-slate-100 text-slate-400' : 'bg-violet-50 text-violet-600'}`}>
                  <Building2 className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <h2 className="truncate text-sm font-bold text-slate-900" title={o.name}>{o.name}</h2>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ring-1 ring-inset ${suspended ? 'bg-rose-50 text-rose-700 ring-rose-500/20' : 'bg-emerald-50 text-emerald-700 ring-emerald-500/20'}`}>
                      {suspended ? 'Suspended' : 'Active'}
                    </span>
                    {o.google_enabled && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-sky-50 px-2 py-0.5 text-[10px] font-bold text-sky-700 ring-1 ring-inset ring-sky-500/20">
                        <CalendarCheck className="h-2.5 w-2.5" /> Google Calendar
                      </span>
                    )}
                    {isActive && <span className="rounded-full bg-violet-600 px-2 py-0.5 text-[10px] font-bold text-white">Working here</span>}
                  </div>
                </div>
              </div>

              <dl className="mt-4 grid grid-cols-3 gap-2 text-center">
                {([['Users', c?.users], ['Meetings', c?.meetings], ['Officers', c?.officers]] as const).map(([k, v]) => (
                  <div key={k} className="rounded-2xl bg-slate-50 py-2">
                    <dd className="text-base font-extrabold tabular-nums text-slate-900">{v ?? '…'}</dd>
                    <dt className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{k}</dt>
                  </div>
                ))}
              </dl>

              <div className="mt-4 flex flex-wrap gap-2">
                {!isActive && (
                  <button type="button" onClick={() => switchOrg(o.id)}
                    className="inline-flex items-center gap-1.5 rounded-full bg-slate-900 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-slate-800">
                    <ArrowRightLeft className="h-3.5 w-3.5" /> Work in this org
                  </button>
                )}
                <button type="button" onClick={() => setEditing(o)}
                  className="rounded-full border border-slate-200 px-3.5 py-1.5 text-xs font-semibold text-slate-600 hover:border-violet-200 hover:text-violet-700">
                  Edit
                </button>
                <button type="button" onClick={() => setStatus(o, suspended ? 'active' : 'suspended')}
                  data-tooltip={suspended ? 'Let this organisation’s users back in' : 'Block this organisation’s users from all of its data (nothing is deleted)'}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-semibold ${suspended ? 'border-emerald-200 text-emerald-700 hover:bg-emerald-50' : 'border-rose-200 text-rose-600 hover:bg-rose-50'}`}>
                  {suspended ? <><PlayCircle className="h-3.5 w-3.5" /> Reactivate</> : <><PauseCircle className="h-3.5 w-3.5" /> Suspend</>}
                </button>
              </div>
            </li>
          );
        })}
      </ul>

      <p className="mt-5 rounded-2xl border border-violet-100 bg-white px-4 py-3 text-xs text-slate-500">
        <b className="text-slate-700">How it works:</b> every meeting, officer, contact, employee, user and log belongs to one organisation.
        People only ever see their own organisation — the server enforces it. As the platform owner you can
        see everything; the organisation you are <b>working in</b> (switch it here or in the sidebar) is the one whose data the app shows and where new records go.
        The app’s Google Calendar account is shared, so turn Google on only for the organisation that owns it.
      </p>
    </Shell>
  );
}

/* ── forms ─────────────────────────────────────────────────────────── */

function CreateOrgForm({ onClose, onCreated }: { activeOrg?: Org | null; onClose: () => void; onCreated: (o: Org) => void }) {
  const [name, setName] = useState('');
  const [google, setGoogle] = useState(false);
  const [admin, setAdmin] = useState({ name: '', email: '', password: '' });
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (name.trim().length < 2) return setError('Give the organisation a name.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(admin.email.trim())) return setError('Enter the first admin’s email address.');
    if (admin.password.length < 8) return setError('The admin’s password needs at least 8 characters.');

    let org: Org | null = null;
    try {
      setBusy('Creating the organisation…');
      org = await pb.collection('organizations').create<Org>({ name: name.trim(), status: 'active', google_enabled: google });
      setBusy('Creating the first admin…');
      await pb.collection('users').create({
        name: admin.name.trim() || admin.email.split('@')[0],
        email: admin.email.trim().toLowerCase(),
        emailVisibility: true,
        password: admin.password,
        passwordConfirm: admin.password,
        role: 'Admin',
        permissions: ['read', 'write', 'delete', 'admin'],
        status: 'Active',
        verified: true,
        org: org.id,
      });
      showToast(`${org.name} is ready — ${admin.email.trim()} can sign in as its admin`, 'success');
      onCreated(org);
    } catch (err: any) {
      const field = err?.response?.data && Object.entries(err.response.data)[0];
      setError(field ? `${field[0]}: ${(field[1] as any)?.message}` : err?.message || 'Something went wrong.');
      // the org exists but its admin failed — leave it (the form can be retried with the edit form + Users page)
      if (org) setError((m) => `${m} The organisation “${org!.name}” was created; add its admin from the Users page after switching to it.`);
    } finally {
      setBusy(null);
    }
  };

  return (
    <Modal title="New organisation" onClose={busy ? undefined : onClose}>
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className={label} htmlFor="org-name">Organisation name</label>
          <input id="org-name" className={input} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. District Collector Office, Warangal" autoFocus />
        </div>
        <fieldset className="rounded-2xl border border-slate-100 bg-slate-50/60 p-4">
          <legend className="px-1 text-xs font-bold text-slate-700">First admin</legend>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className={label} htmlFor="adm-name">Name</label>
              <input id="adm-name" className={input} value={admin.name} onChange={(e) => setAdmin({ ...admin, name: e.target.value })} />
            </div>
            <div>
              <label className={label} htmlFor="adm-email">Email</label>
              <input id="adm-email" type="email" className={input} value={admin.email} onChange={(e) => setAdmin({ ...admin, email: e.target.value })} />
            </div>
            <div className="sm:col-span-2">
              <label className={label} htmlFor="adm-pass">Temporary password</label>
              <input id="adm-pass" type="password" autoComplete="new-password" className={input} value={admin.password} onChange={(e) => setAdmin({ ...admin, password: e.target.value })} />
              <p className="mt-1 text-[11px] text-slate-400">They can change it in Settings after signing in. They then add their own team on the Users page.</p>
            </div>
          </div>
        </fieldset>
        <Check2 checked={google} onChange={setGoogle} title="Allow Google Calendar & Meet"
          text="Uses the app’s one Google account — events land in that account’s calendar. Leave off unless this organisation owns it." />
        {error && <p className="rounded-xl bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</p>}
        <div className="flex items-center justify-end gap-2">
          {busy && <span className="mr-auto inline-flex items-center gap-2 text-xs text-slate-500"><Loader2 className="h-3.5 w-3.5 animate-spin" />{busy}</span>}
          <button type="button" onClick={onClose} disabled={!!busy} className="rounded-full px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 disabled:opacity-50">Cancel</button>
          <button type="submit" disabled={!!busy} className="inline-flex items-center gap-2 rounded-full bg-slate-900 px-5 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60">
            <Plus className="h-4 w-4" /> Create
          </button>
        </div>
      </form>
    </Modal>
  );
}

function EditOrgForm({ org, onClose, onSaved }: { org: Org; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(org.name);
  const [google, setGoogle] = useState(!!org.google_enabled);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim().length < 2) return setError('Give the organisation a name.');
    setBusy(true);
    try {
      await pb.collection('organizations').update(org.id, { name: name.trim(), google_enabled: google });
      showToast('Organisation saved', 'success');
      onSaved();
    } catch (err: any) {
      setError(err?.message || 'Couldn’t save.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal title={`Edit ${org.name}`} onClose={busy ? undefined : onClose}>
      <form onSubmit={save} className="space-y-4">
        <div>
          <label className={label} htmlFor="edit-name">Organisation name</label>
          <input id="edit-name" className={input} value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </div>
        <Check2 checked={google} onChange={setGoogle} title="Allow Google Calendar & Meet"
          text="Uses the app’s one Google account. Only one organisation should normally have this on." />
        {error && <p className="rounded-xl bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} disabled={busy} className="rounded-full px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100">Cancel</button>
          <button type="submit" disabled={busy} className="inline-flex items-center gap-2 rounded-full bg-slate-900 px-5 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Save
          </button>
        </div>
      </form>
    </Modal>
  );
}

/* ── small building blocks ─────────────────────────────────────────── */

function Shell({ subtitle, action, children }: { subtitle: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="relative min-h-screen bg-gradient-to-br from-indigo-200 via-violet-100 to-purple-200 p-0 sm:p-5 lg:p-8">
      <div className="relative mx-auto max-w-[1300px] overflow-hidden bg-white sm:rounded-[1.75rem] sm:shadow-2xl sm:shadow-violet-300/40 sm:ring-1 sm:ring-white/70">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 bg-white px-4 py-3.5 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-900 text-white shadow-sm"><Users className="h-4 w-4" /></span>
            <div className="min-w-0">
              <h1 className="truncate text-sm font-bold text-slate-900">Organisations</h1>
              <p className="truncate text-[11px] text-slate-400">{subtitle}</p>
            </div>
          </div>
          {action}
        </div>
        <div className="bg-[#f7f6fd] p-3 sm:p-6 lg:p-7">{children}</div>
      </div>
    </div>
  );
}

function Empty({ icon, title, text, children }: { icon: React.ReactNode; title: string; text: string; children?: React.ReactNode }) {
  return (
    <div className="rounded-3xl border border-dashed border-violet-200 bg-white px-6 py-12 text-center">
      <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-violet-50 text-violet-600">{icon}</span>
      <p className="mt-4 text-sm font-bold text-slate-800">{title}</p>
      <p className="mx-auto mt-1 max-w-md text-xs text-slate-500">{text}</p>
      {children}
    </div>
  );
}

function Check2({ checked, onChange, title, text, icon }: { checked: boolean; onChange: (v: boolean) => void; title: string; text: string; icon?: React.ReactNode }) {
  return (
    <label className={`flex cursor-pointer items-start gap-3 rounded-2xl border p-3.5 transition-colors ${checked ? 'border-violet-300 bg-violet-50/60' : 'border-slate-200 bg-white hover:border-violet-200'}`}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-0.5 h-4 w-4 accent-violet-600" />
      <span className="min-w-0">
        <span className="flex items-center gap-1.5 text-sm font-semibold text-slate-800">{icon}{title}</span>
        <span className="mt-0.5 block text-[11px] text-slate-500">{text}</span>
      </span>
    </label>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose?: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-3xl bg-white p-6 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-bold text-slate-900">{title}</h2>
          {onClose && <button type="button" onClick={onClose} aria-label="Close" className="rounded-full p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"><X className="h-4 w-4" /></button>}
        </div>
        {children}
      </div>
    </div>
  );
}
