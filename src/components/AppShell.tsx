// src/components/AppShell.tsx
'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Menu } from 'lucide-react';
import SideBar from '@/components/SideBar';
import { NotificationBell, NotificationsProvider } from '@/components/notifications/NotificationCenter';
import { useAuth } from '@/contexts/AuthContext';

function FullScreenLoader() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-gray-50">
      <div
        className="h-10 w-10 animate-spin rounded-full border-4 border-gray-200 border-t-blue-600"
        role="status"
        aria-label="Loading"
      />
      <p className="text-sm font-medium text-gray-500">
        Verifying your session…
      </p>
    </div>
  );
}

export default function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { isAuthenticated, isLoading } = useAuth();
  const [navOpen, setNavOpen] = useState(false);

  const isAuthRoute = pathname?.startsWith('/login') ?? false;

  useEffect(() => {
    if (isLoading) return;

    if (!isAuthenticated && !isAuthRoute) {
      router.replace('/login');
    } else if (isAuthenticated && isAuthRoute) {
      router.replace('/'); // Dashboard lives at "/"
    }
  }, [isLoading, isAuthenticated, isAuthRoute, router]);

  // 1. Auth pages render standalone (no sidebar, no margin).
  if (isAuthRoute) {
    if (!isLoading && isAuthenticated) return null;
    return <>{children}</>;
  }

  // 2. Session being restored → loader.
  if (isLoading || !pathname) return <FullScreenLoader />;

  // 3. Signed out → redirecting, render nothing.
  if (!isAuthenticated) return null;

  // 4. Signed in — fixed sidebar beside the content on desktop (lg+),
  //    a slide-in drawer opened from the top bar on phones/tablets.
  return (
    <NotificationsProvider>
    <div className="min-h-screen bg-gray-50">
      <SideBar open={navOpen} onClose={() => setNavOpen(false)} />
      {navOpen && (
        <div className="fixed inset-0 z-[55] bg-slate-900/40 backdrop-blur-sm lg:hidden" onClick={() => setNavOpen(false)} />
      )}
      <header
        className="sticky z-20 flex items-center gap-3 border-b border-slate-200 bg-white/95 px-4 py-3 backdrop-blur lg:hidden"
        style={{ top: 'env(safe-area-inset-top, 0px)' }}
      >
        <button
          type="button"
          onClick={() => setNavOpen(true)}
          aria-label="Open menu"
          className="rounded-lg p-2 text-slate-600 hover:bg-slate-100"
        >
          <Menu className="h-5 w-5" />
        </button>
        <span className="flex-1 bg-gradient-to-r from-violet-600 to-indigo-600 bg-clip-text text-lg font-extrabold text-transparent">Civillist</span>
        <NotificationBell />
      </header>
      <main className="lg:ml-64">{children}</main>
    </div>
    </NotificationsProvider>
  );
}