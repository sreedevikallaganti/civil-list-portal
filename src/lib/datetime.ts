/* PocketBase returns 'YYYY-MM-DD HH:mm:ss.sssZ' (UTC, with a space).
   new Date() only parses reliably with 'T' — swap it first. */
export const parsePBDate = (raw?: string): Date | null => {
  if (!raw) return null;
  const d = new Date(String(raw).replace(' ', 'T'));
  return isNaN(d.getTime()) ? null : d;
};

/* → '5 Jun 2025, 1:15 PM' (user's local timezone) */
export const formatPBDateTime = (raw?: string) => {
  const d = parsePBDate(raw);
  if (!d) return '—';
  return d.toLocaleString('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: 'numeric', minute: '2-digit', hour12: true,
  });
};

/* → '2 days ago' */
export const timeAgo = (raw?: string) => {
  const d = parsePBDate(raw);
  if (!d) return '';
  const s = Math.floor((Date.now() - d.getTime()) / 1000);
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} hr${h > 1 ? 's' : ''} ago`;
  const days = Math.floor(h / 24);
  if (days < 30) return `${days} day${days > 1 ? 's' : ''} ago`;
  const mo = Math.floor(days / 30);
  return mo < 12 ? `${mo} month${mo > 1 ? 's' : ''} ago` : `${Math.floor(days / 365)} yr ago`;
};