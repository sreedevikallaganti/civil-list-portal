// src/components/AppShell.tsx
'use client';

import { useEffect, type ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import SideBar from '@/components/SideBar';
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

  // 4. Signed in — fixed sidebar + content offset by its width (w-64 → ml-64).
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Locked to the viewport — never moves, never scrolls */}
      <SideBar />
      {/* Content sits beside the fixed sidebar */}
      <main className="ml-64">{children}</main>
    </div>
  );
}