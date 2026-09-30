// lib/roles.ts — one place that turns the users.permissions text into a role.
//
//   admin   → everything, incl. (re)connecting the Google account
//   editor  → create / edit / reschedule / delete meetings, send invites
//   viewer  → read-only
//
// Only an explicit "viewer" / "view only" / "read only" makes an account read-only —
// values like "View, Edit, Delete" or "Read/Write" are full access. Anything that
// isn't clearly admin or viewer counts as editor, so existing accounts keep working.

export type Role = 'admin' | 'editor' | 'viewer';

export function roleOf(user: { permissions?: string } | null | undefined): Role {
  const p = String(user?.permissions || '').toLowerCase();
  if (/\b(admin|administrator|superuser|super admin)\b/.test(p)) return 'admin';
  if (/\bviewer\b|\b(read|view)[\s_-]*only\b/.test(p)) return 'viewer';
  return 'editor';
}

export const canEdit = (user: { permissions?: string } | null | undefined) => roleOf(user) !== 'viewer';
export const canManageIntegrations = (user: { permissions?: string } | null | undefined) => roleOf(user) === 'admin';
