/* sw.js — Civillist service worker (installable app).
   Deliberately small and safe:
   • Page loads go to the network as usual; only when there is NO connection is the
     branded offline page shown instead of the browser's error.
   • Meeting data, logins and API calls are never cached — they are always live.
   Bump VERSION when offline.html or the icons change. */

const VERSION = 'civillist-v1';
const OFFLINE_URL = '/offline.html';
const PRECACHE = [OFFLINE_URL, '/icons/icon-192.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(VERSION).then((cache) => cache.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  // only full page loads; everything else (data, API, scripts) goes straight to the network
  if (req.mode !== 'navigate') return;
  event.respondWith(
    fetch(req).catch(() => caches.match(OFFLINE_URL)),
  );
});

/* tap on a notification → open (or focus) the app at its link */
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      const open = list.find((c) => new URL(c.url).origin === self.location.origin);
      if (open) { open.navigate(url); return open.focus(); }
      return self.clients.openWindow(url);
    }),
  );
});
