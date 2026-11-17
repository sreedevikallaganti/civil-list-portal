// lib/tenancy.ts — multi-tenancy: every record belongs to one organisation (`org` field).
//
// The PocketBase API rules are what actually keep organisations apart: a signed-in user can
// only list, view, create, update or delete records whose `org` is their own org
// (scripts/multi-tenant-pocketbase.mjs installs those rules).
//
// This file only makes the app play along without touching every call site:
//   • new records get `org` filled in automatically (the rules reject a wrong / missing org)
//   • PocketBase superusers (the platform owner) bypass the rules and have no org of their own,
//     so they work "inside" one organisation at a time — the active org picked on /organizations.
//     Their record lists are filtered to that org and their new records are stamped with it.

/** Collections whose records belong to an organisation. (The officers directory — ias/ips/ifs/irs_directory — is shared by all.) */
export const TENANT_COLLECTIONS = [
  'meetings', 'other_contacts', 'employees', 'users',
  'activity_logs', 'update_logs', 'deleted_records', 'meeting_actions', 'special_events',
  'associates', 'associate_fields', 'associate_imports',
] as const;

const TENANT = new Set<string>(TENANT_COLLECTIONS);
const ACTIVE_KEY = 'civ.activeOrg';
/** Fired on window when the platform owner switches organisation. */
export const ORG_EVENT = 'civ:org-change';

const isId = (v: unknown): v is string => typeof v === 'string' && /^[a-z0-9]{15}$/i.test(v);

/** The org a superuser is currently working in (stored per browser). */
export function getActiveOrg(): string {
  try {
    const v = localStorage.getItem(ACTIVE_KEY) || '';
    return isId(v) ? v : '';
  } catch {
    return '';
  }
}

export function setActiveOrg(id: string) {
  try {
    if (isId(id)) localStorage.setItem(ACTIVE_KEY, id);
    else localStorage.removeItem(ACTIVE_KEY);
  } catch { /* storage blocked — falls back to no active org */ }
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(ORG_EVENT, { detail: id }));
}

type AuthRecord = { collectionName?: string; org?: string } | null | undefined;

export const isPlatformOwner = (rec: AuthRecord) => rec?.collectionName === '_superusers';

/** The organisation the signed-in person is working in ('' = none). */
export function orgIdOf(rec: AuthRecord): string {
  if (!rec) return '';
  const id = isPlatformOwner(rec) ? getActiveOrg() : rec.org;
  return isId(id) ? id : '';
}

/** `org = "…"` added to an existing PocketBase filter. */
export function withOrgFilter(filter: unknown, orgId: string): string {
  const own = `org = "${orgId}"`;
  const f = String(filter ?? '').trim();
  return f ? `(${f}) && ${own}` : own;
}

type SendOptions = { method?: string; body?: any; query?: Record<string, any>; [k: string]: any };

/**
 * Adjusts one PocketBase request for the active organisation (pure — unit tested):
 *   create in a tenant collection   → body.org = orgId (unless already set)
 *   list a tenant collection         → filter by org — superusers only; for everyone else
 *                                      the API rules already do it
 */
export function scopeRequest(url: string, options: SendOptions, orgId: string, superuser: boolean) {
  if (!isId(orgId)) return { url, options };
  let path = '';
  try { path = new URL(url, 'http://local').pathname; } catch { return { url, options }; }
  const m = /\/api\/collections\/([^/]+)\/records(?:\/([^/]+))?\/?$/.exec(path);
  if (!m || !TENANT.has(decodeURIComponent(m[1]))) return { url, options };

  const method = String(options.method || 'GET').toUpperCase();
  const single = !!m[2];

  // { allOrgs: true } in the SDK options: the platform owner deliberately looks across organisations
  if (options.query && 'allOrgs' in options.query) {
    const { allOrgs, ...query } = options.query;
    options = { ...options, query };
    if (allOrgs && superuser) return { url, options };
  }

  if (method === 'POST' && !single) {
    const body = options.body;
    if (typeof FormData !== 'undefined' && body instanceof FormData) {
      if (!body.get('org')) body.set('org', orgId);
    } else if (body && typeof body === 'object') {
      if (!body.org) options = { ...options, body: { ...body, org: orgId } };
    } else if (!body) {
      options = { ...options, body: { org: orgId } };
    }
  } else if (method === 'GET' && !single && superuser) {
    options = { ...options, query: { ...(options.query || {}), filter: withOrgFilter(options.query?.filter, orgId) } };
  }
  return { url, options };
}

type PBLike = {
  beforeSend?: (url: string, options: SendOptions) => any;
  authStore: { record: unknown };
};

/** Hooks scopeRequest into the PocketBase client (keeps any existing beforeSend). */
export function installTenancy(pb: PBLike) {
  if ((pb as any).__tenancy) return;
  (pb as any).__tenancy = true;
  const previous = pb.beforeSend;
  pb.beforeSend = async (url, options) => {
    if (previous) {
      const r = (await previous(url, options)) || {};
      if (r.url !== undefined || r.options !== undefined) { url = r.url || url; options = r.options || options; }
    }
    const rec = pb.authStore.record as AuthRecord;
    return scopeRequest(url, options, orgIdOf(rec), isPlatformOwner(rec));
  };
}

/** For the few places that call the PocketBase REST API with plain fetch(). */
export function scopeFetch(collectionListUrl: string, rec: AuthRecord): string {
  const orgId = orgIdOf(rec);
  if (!orgId || !isPlatformOwner(rec)) return collectionListUrl;
  const u = new URL(collectionListUrl, 'http://local');
  u.searchParams.set('filter', withOrgFilter(u.searchParams.get('filter'), orgId));
  return collectionListUrl.startsWith('http') ? u.toString() : u.pathname + u.search;
}
