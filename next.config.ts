import { networkInterfaces } from 'node:os';

/** This machine's current LAN addresses — lets other devices on the network use the
    dev server without hard-coding an IP that changes when the laptop changes Wi-Fi.
    Extra hosts can be added with ALLOWED_DEV_ORIGINS=host1,host2 in .env.local. */
function devOrigins(): string[] {
  const lan = Object.values(networkInterfaces())
    .flat()
    .filter((n) => n && n.family === 'IPv4' && !n.internal && !n.address.startsWith('169.254.'))
    .map((n) => n!.address);
  const extra = (process.env.ALLOWED_DEV_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
  return [...new Set([...lan, ...extra])];
}

/** PocketBase address — from .env.local only (POCKETBASE_URL or NEXT_PUBLIC_POCKETBASE_URL). */
const pbUrl = (process.env.POCKETBASE_URL || process.env.NEXT_PUBLIC_POCKETBASE_URL || '').replace(/\/+$/, '');
if (!pbUrl) {
  console.warn('⚠ POCKETBASE_URL is not set in .env.local — the /pb proxy to PocketBase will not work.');
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  allowedDevOrigins: devOrigins(),

  async rewrites() {
    return pbUrl ? [{ source: '/pb/:path*', destination: `${pbUrl}/:path*` }] : [];
  },

  /* installable app: the service worker must never be cached, so phones pick up new versions */
  async headers() {
    return [
      {
        source: '/sw.js',
        headers: [
          { key: 'Content-Type', value: 'application/javascript; charset=utf-8' },
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
          { key: 'Content-Security-Policy', value: "default-src 'self'; script-src 'self'" },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
