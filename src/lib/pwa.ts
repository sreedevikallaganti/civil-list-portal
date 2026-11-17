// lib/pwa.ts — installing Civillist as an app on a phone or computer.
//
// Chrome / Edge / Android fire `beforeinstallprompt` once the app is installable; we keep that
// event so an "Install app" button can show the browser's install dialog later. iPhone / iPad
// Safari never fire it — there the user adds the app with Share → Add to Home Screen.

import { useSyncExternalStore } from 'react';

type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> };

let deferred: InstallEvent | null = null;
let installed = false;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

/** Call once, as early as possible (PwaSetup in the root layout). */
export function initPwa() {
  if (typeof window === 'undefined') return;
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(() => { /* not fatal — the app still works */ });
  }
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault(); // keep it for our own button instead of the browser's mini-bar
    deferred = e as InstallEvent;
    notify();
  });
  window.addEventListener('appinstalled', () => {
    installed = true;
    deferred = null;
    notify();
  });
}

/** Opened from the home-screen icon (running as an installed app)? */
export const isStandalone = () =>
  typeof window !== 'undefined' &&
  (window.matchMedia?.('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true);

/** iPhone / iPad (iPadOS reports itself as a Mac with touch). */
export const isIOS = () =>
  typeof navigator !== 'undefined' &&
  (/iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));

export async function promptInstall(): Promise<'accepted' | 'dismissed' | 'unavailable'> {
  if (!deferred) return 'unavailable';
  await deferred.prompt();
  const { outcome } = await deferred.userChoice;
  deferred = null;
  notify();
  return outcome;
}

type InstallState = { canPrompt: boolean; installed: boolean; ios: boolean };
let snapshot: InstallState = { canPrompt: false, installed: false, ios: false };
const SERVER: InstallState = { canPrompt: false, installed: false, ios: false };

function read(): InstallState {
  const next = { canPrompt: !!deferred, installed: installed || isStandalone(), ios: isIOS() };
  if (next.canPrompt !== snapshot.canPrompt || next.installed !== snapshot.installed || next.ios !== snapshot.ios) snapshot = next;
  return snapshot;
}

/** { canPrompt, installed, ios } — re-renders when the browser becomes able to install, or installs. */
export function useInstallState(): InstallState {
  return useSyncExternalStore(
    (cb) => { listeners.add(cb); return () => listeners.delete(cb); },
    read,
    () => SERVER,
  );
}
