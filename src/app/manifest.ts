// src/app/manifest.ts — makes Civillist installable as a phone / desktop app (served at /manifest.webmanifest).
import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: 'Civillist — Meeting Management',
    short_name: 'Civillist',
    description: 'Schedule, record and follow up meetings with officers, contacts and staff.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'any',
    background_color: '#f7f6fd',
    theme_color: '#0f172a',
    categories: ['business', 'productivity'],
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    // long-press the app icon
    shortcuts: [
      { name: 'Meetings', short_name: 'Meetings', url: '/meetings', icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }] },
      { name: 'Calendar', short_name: 'Calendar', url: '/calendar', icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }] },
      { name: 'Dashboard', short_name: 'Today', url: '/', icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }] },
    ],
  };
}
