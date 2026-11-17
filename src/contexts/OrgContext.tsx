'use client';

/* OrgContext — which organisation the signed-in person is working in (multi-tenancy).
 *
 *   App users        → their own org (users.org). They can never see another org's data —
 *                      the PocketBase API rules enforce that; this context only shows the name.
 *   Platform owner   → a PocketBase superuser. Picks the active org (switcher in the sidebar,
 *   (superuser)        /organizations page); everything they see and create is in that org.
 *
 * Before scripts/multi-tenant-pocketbase.mjs has been run there is no `organizations`
 * collection — the app then keeps working exactly as before (single organisation).
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { ClientResponseError } from 'pocketbase';
import { Building2, LogOut, PauseCircle } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { pb } from '@/lib/pocketbase';
import { getActiveOrg, isPlatformOwner, ORG_EVENT, setActiveOrg } from '@/lib/tenancy';

export type Org = {
  id: string;
  name: string;
  status?: string;          // "active" | "suspended"
  home_city?: string;
  google_enabled?: boolean;
  created?: string;
};

type OrgContextValue = {
  /** false until the org (or the lack of tenancy) is known */
  ready: boolean;
  /** true once the organisations collection exists on the server */
  enabled: boolean;
  /** the organisation being worked in */
  org: Org | null;
  /** platform owner only: every organisation */
  orgs: Org[];
  isOwner: boolean;
  switchOrg: (id: string) => void;
  refresh: () => Promise<void>;
};

const OrgContext = createContext<OrgContextValue | null>(null);

const missing = (e: unknown) => e instanceof ClientResponseError && e.status === 404;

export function OrgProvider({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const isOwner = isPlatformOwner(user as any);
  const [state, setState] = useState<{ ready: boolean; enabled: boolean; org: Org | null; orgs: Org[] }>(
    { ready: false, enabled: false, org: null, orgs: [] },
  );
  const [activeId, setActiveId] = useState(getActiveOrg);

  const load = useCallback(async () => {
    try {
      if (isOwner) {
        const orgs = await pb.collection('organizations').getFullList<Org>({ sort: 'name', requestKey: null });
        const active: Org | null = orgs.find((o) => o.id === getActiveOrg()) ?? orgs[0] ?? null;
        if (active && active.id !== getActiveOrg()) setActiveOrg(active.id);
        setState({ ready: true, enabled: true, org: active, orgs });
        setActiveId(active?.id || '');
        return;
      }
      const orgId = (user as any)?.org as string | undefined;
      if (orgId) {
        const org = await pb.collection('organizations').getOne<Org>(orgId, { requestKey: null });
        setState({ ready: true, enabled: true, org, orgs: [] });
        return;
      }
      // no org on the account: is tenancy set up at all?
      await pb.collection('organizations').getList(1, 1, { requestKey: null });
      setState({ ready: true, enabled: true, org: null, orgs: [] });
    } catch (e) {
      // collection not there yet → single-organisation mode (exactly as before)
      setState({ ready: true, enabled: !missing(e) && !!(user as any)?.org, org: null, orgs: [] });
    }
  }, [isOwner, user]);

  useEffect(() => {
    // fetch-on-mount: setState happens after the request resolves
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  // another tab switched org
  useEffect(() => {
    const onChange = () => setActiveId(getActiveOrg());
    window.addEventListener(ORG_EVENT, onChange);
    const onStorage = (e: StorageEvent) => { if (e.key === 'civ.activeOrg') onChange(); };
    window.addEventListener('storage', onStorage);
    return () => { window.removeEventListener(ORG_EVENT, onChange); window.removeEventListener('storage', onStorage); };
  }, []);

  const switchOrg = useCallback((id: string) => {
    setActiveOrg(id);
    setActiveId(id);
    setState((s) => ({ ...s, org: s.orgs.find((o) => o.id === id) ?? s.org }));
  }, []);

  const value = useMemo<OrgContextValue>(() => ({
    ...state,
    org: isOwner ? state.orgs.find((o) => o.id === activeId) ?? state.org : state.org,
    isOwner,
    switchOrg,
    refresh: load,
  }), [state, isOwner, activeId, switchOrg, load]);

  if (!state.ready) return null;

  // app user whose account isn't linked to an organisation, or whose org is suspended
  if (state.enabled && !isOwner && (!state.org || state.org.status === 'suspended')) {
    const suspended = !!state.org;
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 p-4">
        <div className="w-full max-w-md rounded-3xl border border-violet-100 bg-white p-8 text-center shadow-sm">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-violet-50 text-violet-600">
            {suspended ? <PauseCircle className="h-6 w-6" /> : <Building2 className="h-6 w-6" />}
          </span>
          <h1 className="mt-4 text-lg font-bold text-slate-900">
            {suspended ? `${state.org!.name} is suspended` : 'No organisation linked'}
          </h1>
          <p className="mt-2 text-sm text-slate-500">
            {suspended
              ? 'Access for your organisation has been paused. Please contact the platform administrator.'
              : 'Your account isn’t part of an organisation yet. Ask your administrator to add you to one.'}
          </p>
          <button type="button" onClick={logout}
            className="mt-6 inline-flex items-center gap-2 rounded-full bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-slate-800">
            <LogOut className="h-4 w-4" /> Sign out
          </button>
        </div>
      </div>
    );
  }

  return (
    <OrgContext.Provider value={value}>
      {/* remount the pages when the platform owner switches org, so every list reloads */}
      <div key={value.org?.id || 'none'} className="contents">{children}</div>
    </OrgContext.Provider>
  );
}

/**
 * Can this organisation use Google Calendar / Meet? (One shared Google account — see
 * requireGoogleOrg in lib/serverAuth.) Always true before multi-tenancy is set up.
 */
export function useGoogleEnabled(): boolean {
  const ctx = useContext(OrgContext);
  if (!ctx || !ctx.enabled) return true;
  return !!ctx.org?.google_enabled;
}

export function useOrg(): OrgContextValue {
  const ctx = useContext(OrgContext);
  if (!ctx) throw new Error('useOrg must be used inside an <OrgProvider>.');
  return ctx;
}
