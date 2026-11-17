// lib/preferences.ts — personal preferences, kept in this browser (localStorage).
// The Settings page writes them; the parts of the app that use them listen for
// PREFS_EVENT, so a change applies straight away without a reload.

export const PREF_KEYS = {
  sidebarCollapsed: 'civillist:sidebar-collapsed', // '1' | '0'   — AppShell
  calendarView: 'civillist:calendar-view',         // day | week | month | year | agenda — Calendar page
  tooltips: 'civillist:tooltips',                  // 'off' hides the app-wide tooltips — GlobalTooltips
} as const;

export const PREFS_EVENT = 'civillist:prefs';

export function readPref(key: string): string | null {
  try {
    return typeof window !== 'undefined' ? localStorage.getItem(key) : null;
  } catch {
    return null;
  }
}

export function writePref(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch { /* storage blocked — the change still applies for this page view */ }
  window.dispatchEvent(new CustomEvent(PREFS_EVENT, { detail: { key, value } }));
}
