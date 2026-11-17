// src/components/AppShell.tsx
'use client';

import { useCallback, useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Menu } from 'lucide-react';
import SideBar from '@/components/SideBar';
import InstallAppButton from '@/components/InstallAppButton';
import AssistantLauncher from '@/components/AssistantLauncher';
import { NotificationBell, NotificationsProvider } from '@/components/notifications/NotificationCenter';
import { useAuth } from '@/contexts/AuthContext';
import { OrgProvider } from '@/contexts/OrgContext';
import { PREF_KEYS, PREFS_EVENT, readPref, writePref } from '@/lib/preferences';

const COLLAPSE_KEY = PREF_KEYS.sidebarCollapsed;

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
  /* desktop only: icon-rail sidebar, remembered per browser */
  const [collapsed, setCollapsed] = useState(() => readPref(COLLAPSE_KEY) === '1');
  // saved + broadcast, so the Settings page and this shell always agree
  const toggleCollapsed = useCallback(() => {
    writePref(COLLAPSE_KEY, readPref(COLLAPSE_KEY) === '1' ? '0' : '1');
  }, []);
  useEffect(() => {
    const onPrefs = (e: Event) => {
      const { key, value } = (e as CustomEvent<{ key: string; value: string }>).detail || {};
      if (key === COLLAPSE_KEY) setCollapsed(value === '1');
    };
    window.addEventListener(PREFS_EVENT, onPrefs);
    return () => window.removeEventListener(PREFS_EVENT, onPrefs);
  }, []);

  /* Ctrl/⌘+B toggles the sidebar */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === 'b') {
        e.preventDefault();
        toggleCollapsed();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [toggleCollapsed]);

  const isAuthRoute = pathname?.startsWith('/login') ?? false;
  /* /docs (status board + guide) opens without signing in, so you can check the app even when login is broken */
  const isPublicRoute = pathname === '/docs' || (pathname?.startsWith('/docs/') ?? false);

  useEffect(() => {
    if (isLoading || isPublicRoute) return;

    if (!isAuthenticated && !isAuthRoute) {
      router.replace('/login');
    } else if (isAuthenticated && isAuthRoute) {
      router.replace('/'); // Dashboard lives at "/"
    }
  }, [isLoading, isAuthenticated, isAuthRoute, isPublicRoute, router]);

  // 0. Public pages render standalone for everyone, signed in or not.
  if (isPublicRoute) return <>{children}</>;

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
    <OrgProvider>
    <NotificationsProvider>
    <div
      className="min-h-screen bg-gray-50"
      style={{ '--sidebar-w': collapsed ? '5rem' : '16rem' } as CSSProperties}
    >
      <SideBar open={navOpen} onClose={() => setNavOpen(false)} collapsed={collapsed} onToggleCollapsed={toggleCollapsed} />
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
        <InstallAppButton />
        <NotificationBell />
      </header>
      <main className="transition-[margin] duration-300 lg:ml-[var(--sidebar-w)]">{children}</main>
      {/* "Ask AI" — bottom-right corner on every page */}
      <AssistantLauncher />
    </div>
    </NotificationsProvider>
    </OrgProvider>
  );
}