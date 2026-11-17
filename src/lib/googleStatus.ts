// lib/googleStatus.ts — is the Google account (Calendar / Meet / invites) still connected?
// Shared by /api/google/status and /api/health. Cached for a minute so pages don't hammer Google.
import { GoogleAuthRequired, getAuthorizedClient, isInvalidGrant } from './googleAuth';

export type GoogleStatus = {
  connected: boolean | null;
  reason?: 'not_connected' | 'expired' | 'error' | 'disabled';
  message?: string;
};

const cache = new Map<string, { at: number; status: GoogleStatus }>();
const TTL_MS = 60_000;

/** Status of one sender account (lib/senders) — the main one by default. */
export async function checkGoogle(fresh = false, senderId = 'main'): Promise<GoogleStatus> {
  const hit = cache.get(senderId);
  if (!fresh && hit && Date.now() - hit.at < TTL_MS) return hit.status;

  let status: GoogleStatus;
  try {
    await getAuthorizedClient(senderId).getAccessToken(); // exchanges the refresh token → fails if expired / revoked
    status = { connected: true };
  } catch (err: any) {
    if (err instanceof GoogleAuthRequired) status = { connected: false, reason: 'not_connected' };
    else if (isInvalidGrant(err)) status = { connected: false, reason: 'expired' };
    else status = { connected: null, reason: 'error', message: err?.message || 'Could not reach Google' };
  }
  cache.set(senderId, { at: Date.now(), status });
  return status;
}
