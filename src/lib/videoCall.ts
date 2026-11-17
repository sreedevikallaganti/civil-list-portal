// lib/videoCall.ts — which video service a meeting link belongs to (browser + server).
// Meetings keep their link in `meet_link` — a Google Meet or a Zoom link; the URL tells which.

export type VideoPlatform = 'none' | 'meet' | 'zoom';

export function videoPlatform(url: unknown): VideoPlatform {
  const s = String(url || '');
  if (/^https:\/\/([\w-]+\.)*zoom\.(us|com)\//i.test(s)) return 'zoom';
  if (/^https:\/\/meet\.google\.com\//i.test(s)) return 'meet';
  return 'none';
}

/** "Zoom" / "Google Meet" / "Video call" — for buttons, emails and invites. */
export function videoLabel(url: unknown): string {
  const p = videoPlatform(url);
  return p === 'zoom' ? 'Zoom' : p === 'meet' ? 'Google Meet' : 'Video call';
}

/** The Zoom meeting id inside a join link (…/j/81234567890?pwd=…), or ''. */
export function zoomMeetingId(url: unknown): string {
  return videoPlatform(url) === 'zoom' ? (/\/j\/(\d{9,12})/.exec(String(url)) || [])[1] || '' : '';
}
