// lib/meetingShare.ts — share a meeting by hand: the invitation text to copy / paste, and
// WhatsApp links. For people without an email address (or with a wrong one), so nobody
// misses the Meet / Zoom link. Pure helpers — used by MeetingShareCard.
import { videoLabel } from '@/lib/videoCall';

export type ManualShare = {
  name: string;
  phone?: string;
  reason: 'no-email' | 'invalid-email' | 'not-delivered';
  email?: string;
};

export const REASON_TEXT: Record<ManualShare['reason'], string> = {
  'no-email': 'No email address',
  'invalid-email': 'Email address looks wrong',
  'not-delivered': 'Invite email couldn’t be sent',
};

/** 10-digit Indian numbers get +91; anything that isn't a phone number → ''. */
export function waPhone(phone: unknown): string {
  let digits = String(phone ?? '').replace(/\D/g, '').replace(/^0+/, '');
  if (digits.length === 10) digits = `91${digits}`;
  return digits.length >= 11 && digits.length <= 15 ? digits : '';
}

/** The invitation as plain text — paste it into WhatsApp, SMS, Teams, anything. */
export function inviteText(m: Record<string, any>, name = ''): string {
  const date = String(m?.meeting_date || '').slice(0, 10);
  const when = /^\d{4}-\d{2}-\d{2}$/.test(date)
    ? new Date(`${date}T00:00:00`).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
    : '';
  const time = String(m?.meeting_time || '').match(/\d{1,2}:\d{2}/)?.[0] || '';
  const link = String(m?.meet_link || '');
  return [
    `${name ? `Dear ${name}` : 'Hello'},`,
    `You are invited to a meeting${m?.agenda ? `: ${m.agenda}` : ''}.`,
    when && `📅 ${when}`,
    time && `🕐 ${time} hrs${m?.duration ? ` (${m.duration} min)` : ''}`,
    m?.location && `📍 ${m.location}`,
    link && `💻 Join on ${videoLabel(link)}: ${link}`,
    'Kindly confirm your availability.',
  ].filter(Boolean).join('\n');
}

/** wa.me link with the text ready — to that number, or (no number) WhatsApp asks whom to send it to. */
export function waLink(text: string, phone?: unknown): string {
  const to = waPhone(phone);
  return `https://wa.me/${to}?text=${encodeURIComponent(text)}`;
}

/** Copies text; falls back to a hidden textarea where the Clipboard API isn't allowed (http on a LAN IP). */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch { /* fall through */ }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}
