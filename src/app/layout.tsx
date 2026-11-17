// src/app/layout.tsx
import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { Toaster } from '@/components/Toaster';
import ShareMeetingHost from '@/components/meetings/ShareMeetingHost';
import { AuthProvider } from '@/contexts/AuthContext';
import AppShell from '@/components/AppShell';
import GlobalTooltips from '@/components/GlobalTooltips';
import PwaSetup from '@/components/PwaSetup';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Civillist - Meeting Management',
  description: 'Professional meeting management system for civil servants',
  applicationName: 'Civillist',
  // installed on an iPhone / iPad home screen (Share → Add to Home Screen)
  appleWebApp: { capable: true, title: 'Civillist', statusBarStyle: 'default' },
  icons: {
    icon: [{ url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' }],
    apple: [{ url: '/icons/apple-touch-icon.png', sizes: '180x180' }],
  },
  formatDetection: { telephone: false }, // phone numbers are shown as text, links are added on purpose
};

/* phone app look: status-bar colour, and room for the iPhone notch / home bar */
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#0f172a',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
        {/* installable app: service worker (offline page) + "Install app" support */}
        <PwaSetup />
        <AuthProvider>
          {/* AppShell renders /login standalone and your original sidebar
              layout for authenticated routes, with central auth redirects. */}
          <AppShell>{children}</AppShell>
          <Toaster />
          {/* "Meeting ready — share it" (Meet / Zoom link, copy, WhatsApp) after a meeting is saved */}
          <ShareMeetingHost />
          {/* styled tooltips for every title / data-tooltip / icon-only button in the app */}
          <GlobalTooltips />
        </AuthProvider>
      </body>
    </html>
  );
}