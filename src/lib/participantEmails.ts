'use client';

// lib/participantEmails.ts — after a meeting changes (meetings list, Update panel), email
// everyone in it: "rescheduled", "cancelled" or "thank you" (lib/emailTemplates, /api/meeting-email).
//
// Only for meetings that send emails (their "Send invite" switch is on) and that have someone
// with an email address. Guard rails so a bulk change never emails a pile of old meetings:
//   cancelled / rescheduled → only meetings that haven't happened yet
//   thanks                  → only meetings from the last 7 days
import { apiJSON } from './apiClient';
import { meetingParticipants } from './participants';
import { savedSendAs } from '@/components/SendAsPicker';

export type ParticipantEmailKind = 'rescheduled' | 'cancelled' | 'thanks';

const pad = (n: number) => String(n).padStart(2, '0');
const todayIso = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const daysAgoIso = (n: number) => { const d = new Date(); d.setDate(d.getDate() - n); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const hasEmail = (m: any) => meetingParticipants(m).some((p) => /^\S+@\S+\.\S+$/.test(p.email || ''));

/** Should this change email the participants? */
export function shouldEmailParticipants(kind: ParticipantEmailKind, m: any): boolean {
  if (!m || m.send_invite === false || !hasEmail(m)) return false;
  const day = String(m.meeting_date || '').slice(0, 10);
  if (!day) return false;
  return kind === 'thanks' ? day >= daysAgoIso(7) && day <= todayIso() : day >= todayIso();
}

/** Send it; resolves to the number of people emailed (0 = nothing to send). Throws a readable error. */
export async function emailParticipants(kind: ParticipantEmailKind, meeting: any, previous?: { date: string; time: string }) {
  if (!shouldEmailParticipants(kind, meeting)) return 0;
  const r = await apiJSON<{ sent: number }>('/api/meeting-email', {
    kind, meeting, ...(previous && { previous }), ...savedSendAs(),
  }, { timeoutMs: 120_000 });
  return Number(r?.sent) || 0;
}

/** Fire-and-forget with a toast when done. */
export function emailParticipantsInBackground(
  kind: ParticipantEmailKind, meeting: any, toast: (msg: string, type: 'success' | 'error') => void, previous?: { date: string; time: string },
) {
  if (!shouldEmailParticipants(kind, meeting)) return;
  const what = kind === 'cancelled' ? 'Cancellation' : kind === 'thanks' ? 'Thank-you' : 'Reschedule';
  emailParticipants(kind, meeting, previous)
    .then((n) => { if (n) toast(`${what} email sent to ${n} participant${n === 1 ? '' : 's'}`, 'success'); })
    .catch((err) => { console.warn(`[participant-email] ${kind}`, err); toast(`${what} email couldn’t be sent — ${err?.message || 'please try again'}`, 'error'); });
}
