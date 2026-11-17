// lib/roles.ts — one place that turns a PocketBase user into a role.
//
//   admin   → everything, incl. (re)connecting the Google account
//   editor  → create / edit / reschedule / delete meetings, send invites
//   viewer  → read-only
//
// 1. The users.role field decides first ("Admin", "Super Admin", "Editor", "Viewer").
// 2. If it's empty or unrecognised, users.permissions decides. It may be text ("admin, viewer")
//    or a list (["read", "write", "delete", "admin"]).
//    Only an explicit "viewer" / "view only" / "read only" makes an account read-only —
//    values like "View, Edit, Delete" or "Read/Write" are full access. Anything that isn't
//    clearly admin or viewer counts as editor, so existing accounts keep working.
// A department name such as "Administration" never grants admin.
// PocketBase "_superusers" accounts (database owners) are always admin.

export type Role = 'admin' | 'editor' | 'viewer';

type RoleSource = { role?: unknown; permissions?: unknown; collectionName?: unknown } | null | undefined;

const ADMIN = /\b(super[\s_-]*)?admin(istrator)?\b|\bsuper[\s_-]*user\b/;
const VIEWER = /\bviewer\b|\b(read|view)[\s_-]*only\b/;
const EDITOR = /\beditor\b/;

const text = (v: unknown) => (Array.isArray(v) ? v.join(' ') : String(v ?? '')).toLowerCase();

export function roleOf(user: RoleSource): Role {
  // PocketBase's own owner accounts (signed in through the same login) have full access
  if (user?.collectionName === '_superusers') return 'admin';

  const role = text(user?.role);
  if (ADMIN.test(role)) return 'admin';
  if (VIEWER.test(role)) return 'viewer';
  if (EDITOR.test(role)) return 'editor';

  const p = text(user?.permissions);
  if (ADMIN.test(p)) return 'admin';
  if (VIEWER.test(p)) return 'viewer';
  return 'editor';
}

export const canEdit = (user: RoleSource) => roleOf(user) !== 'viewer';
export const canManageIntegrations = (user: RoleSource) => roleOf(user) === 'admin';
