// src/components/SideBar.tsx
'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  LayoutDashboard,
  Calendar,
  Users,
  FileText,
  Settings,
  LogOut,
  Loader2,
  Phone
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';

export default function SideBar() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuth();
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const menuItems = [
    { href: '/', label: 'Dashboard', icon: LayoutDashboard },
    { href: '/meetings', label: 'Meetings', icon: Calendar },
    { href: '/officers', label: 'Officers', icon: Users },
    // { href: '/other-contacts', label: 'Other Contacts', icon: Phone },
    { href: '/calendar', label: 'Calendar', icon: Calendar },
    { href: '/reports', label: 'Reports', icon: FileText },
    // { href: '/settings', label: 'Settings', icon: Settings },
  ];

  /* ---------- Real signed-in user (from PocketBase via AuthContext) ---------- */
  const displayName =
    user?.name?.trim() ||
    user?.email?.split('@')[0] ||
    'Signed in';

  const subLabel = user?.department || user?.permissions || user?.email || '';

  const initials = (() => {
    if (user?.name?.trim()) {
      return user.name
        .trim()
        .split(/\s+/)
        .map((part) => part.charAt(0))
        .join('')
        .slice(0, 2)
        .toUpperCase();
    }
    return (user?.email?.charAt(0) || 'U').toUpperCase();
  })();

  const handleLogout = () => {
    if (isLoggingOut) return;
    setIsLoggingOut(true);
    logout();
    router.replace('/login');
  };

  return (
    /* ── ✅ FIXED SIDEBAR: completely removed from the page flow.
          Locked to the viewport — it physically cannot move or scroll
          when the page content scrolls.
          - fixed left-0 top-0  → anchored to the top-left corner forever
          - h-screen            → exactly one viewport tall
          - z-30               → sits above page content, but BELOW the
                                 calendar off-canvas panels (z-40/z-50) ── */
    <aside className="fixed left-0 top-0 z-30 flex h-screen w-64 flex-col border-r border-gray-200 bg-white">

      {/* Logo */}
      <div className="border-b border-gray-200 p-6">
        <h1 className="text-2xl font-bold text-blue-600">Civillist</h1>
        <p className="mt-1 text-xs text-gray-500">Meeting Management</p>
      </div>

      {/* Navigation — static list, no scrollbar (fits any screen with your menu size) */}
      <nav className="flex-1 p-4">
        <div className="space-y-1">
          {menuItems.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href;

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                  isActive
                    ? 'bg-blue-50 text-blue-600 font-semibold'
                    : 'text-gray-600 hover:bg-gray-50'
                }`}
              >
                <Icon className="w-5 h-5" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>

      {/* User Profile — pinned to the bottom of the viewport, always visible,
          never participates in any scrolling */}
      <div className="border-t border-gray-200 p-4">
        <div className="flex items-center gap-3 px-2 py-2">
          <div className="w-10 h-10 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-full flex items-center justify-center text-white font-bold">
            {initials}
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-medium text-gray-900 truncate capitalize">{displayName}</p>
            <p className="text-xs text-gray-500 truncate">{subLabel}</p>
          </div>
          <button
            type="button"
            onClick={handleLogout}
            disabled={isLoggingOut}
            aria-label="Sign out"
            title="Sign out"
            className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoggingOut ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <LogOut className="w-5 h-5" />
            )}
          </button>
        </div>
      </div>
    </aside>
  );
}