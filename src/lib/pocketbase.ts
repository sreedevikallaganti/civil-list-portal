// src/lib/pocketbase.ts
import PocketBase, { ClientResponseError } from 'pocketbase';

/* ================================================================== */
/*  Configuration                                                      */
/* ================================================================== */

/**
 * Name of your PocketBase auth collection — confirmed "users" from your
 * PocketBase admin screenshots. If you ever rename it in PocketBase,
 * change it ONLY here.
 */
export const AUTH_COLLECTION = 'users';

/**
 * PocketBase URL — read from .env.local (NEXT_PUBLIC_POCKETBASE_URL).
 *
 * Your previous file hardcoded http://172.30.0.200:8091; this version
 * reads the identical value you already have in .env.local, so the URL
 * now lives in exactly one place.
 * Note: restart the dev server after changing .env.local —
 * NEXT_PUBLIC_* values are inlined at startup/build time.
 */
/**
 * Browser: same-origin '/pb' path, proxied by the Next.js rewrite
 * (see next.config.js) — no CORS, ever.
 * Server (Node): direct URL — Node has no CORS restrictions.
 */
const BROWSER_BASE = '/pb';

export function getPocketBaseURL(): string {
  if (typeof window !== 'undefined') return BROWSER_BASE;

  const url = process.env.POCKETBASE_URL || process.env.NEXT_PUBLIC_POCKETBASE_URL;
  if (!url) {
    throw new Error(
      'POCKETBASE_URL is not set. Add it to your .env.local file:\n' +
        'POCKETBASE_URL=http://172.30.0.200:8091'
    );
  }
  return url.replace(/\/+$/, '');
}

/* ================================================================== */
/*  Types                                                              */
/* ================================================================== */

/** Shape of a record in your "users" auth collection. */
export interface PortalUser {
  // PocketBase system fields
  id: string;
  email: string;
  collectionId: string;
  collectionName: string;
  verified: boolean;
  created?: string;
  updated?: string;

  // Custom fields from your "users" collection (visible in your
  // PocketBase admin screenshots)
  name?: string;
  permissions?: string;
  department?: string;
  phone?: string;
  status?: string;
  avatar?: string;
}

/** Safely casts a PocketBase auth record to our PortalUser type. */
export function asPortalUser(record: unknown): PortalUser | null {
  if (!record || typeof record !== 'object') return null;
  return record as PortalUser;
}

/* ================================================================== */
/*  PocketBase client (single shared instance)                          */
/* ================================================================== */

let pbInstance: PocketBase | null = null;

export function getPB(): PocketBase {
  if (!pbInstance) {
    pbInstance = new PocketBase(getPocketBaseURL());

    // Same setting your current file already uses — kept.
    pbInstance.autoCancellation(false);
  }
  return pbInstance;
}

/** Shared instance used by the entire app (same object everywhere). */
export const pb = getPB();

/**
 * ✅ Default export preserved.
 * Every existing file doing `import pb from '@/lib/pocketbase'`
 * (meetings, officers, calendar, …) keeps working unchanged.
 */
export default pb;

/**
 * Returns the signed-in user from the PocketBase auth store, or null.
 *
 * PocketBase JS SDK v0.21+ exposes the record as `authStore.record`;
 * older versions use `authStore.model`. This supports both, so it
 * works no matter which SDK version you have installed.
 */
export function getCurrentUser(): PortalUser | null {
  if (!pb.authStore.isValid) return null;
  const store = pb.authStore as unknown as { record?: unknown; model?: unknown };
  return asPortalUser(store.record ?? store.model);
}

/* ================================================================== */
/*  Error mapping for the login form                                   */
/* ================================================================== */

export function getAuthErrorMessage(error: unknown): string {
  if (
    error instanceof Error &&
    error.message.includes('NEXT_PUBLIC_POCKETBASE_URL')
  ) {
    return 'The portal is not configured correctly (missing PocketBase URL). Please contact an administrator.';
  }

  if (error instanceof ClientResponseError) {
    switch (error.status) {
      case 0:
        // Network failure — PocketBase unreachable at 172.30.0.200:8091
        return 'Cannot connect to the server. Please make sure PocketBase is running and reachable, then try again.';

      case 400:
        // Wrong email AND wrong password both return 400.
        // One combined message on purpose — revealing which one was
        // wrong would let attackers enumerate accounts.
        return 'Invalid email or password. Please check your credentials and try again.';

      case 401:
        return 'Your session is no longer valid. Please sign in again.';

      case 403:
        return 'You are not authorized to access the Civillist Portal.';

      case 404:
        return `Authentication failed: the "${AUTH_COLLECTION}" collection was not found on the PocketBase server.`;

      default:
        return `Authentication failed (server error ${error.status}). Please try again in a moment.`;
    }
  }

  return 'An unexpected error occurred while signing in. Please try again.';
}