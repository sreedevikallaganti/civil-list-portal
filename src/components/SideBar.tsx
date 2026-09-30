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
  Phone,
  CalendarDays,
  Briefcase,
  UserCog,
  Sparkles,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { NotificationBell } from '@/components/notifications/NotificationCenter';

/* open / onClose drive the slide-in drawer below the lg breakpoint; on desktop it's always visible */
export default function SideBar({ open = false, onClose }: { open?: boolean; onClose?: () => void }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuth();
  const [isLoggingOut, setIsLoggingOut] = useState(false);

const menuItems = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/meetings', label: 'Meetings', icon: Calendar },
  { href: '/officers', label: 'Officers', icon: Users },
  { href: '/employees', label: 'Employees', icon: Briefcase },  
  { href: '/users', label: 'Users', icon: UserCog }, 
  // { href: '/other-contacts', label: 'Other Contacts', icon: Phone },
  { href: '/calendar', label: 'Calendar', icon: CalendarDays },
  { href: '/reports', label: 'Reports', icon: FileText },
  { href: '/recap', label: 'Yearly Recap', icon: Sparkles },
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
    /* ── FIXED SIDEBAR — same positioning contract as before:
          fixed / h-screen / z-30, above page content but below
          the off-canvas panels (z-40/z-50). Width unchanged (w-64)
          so your main-content offset keeps working. ── */
    <aside
      className={`fixed left-0 top-0 z-[60] flex h-screen w-64 flex-col border-r border-violet-100/80 bg-white/95 shadow-[1px_0_24px_-12px_rgba(139,92,246,0.25)] backdrop-blur-md transition-transform duration-300 lg:z-30 lg:translate-x-0 ${
        open ? 'translate-x-0' : '-translate-x-full'
      }`}
    >

      {/* Logo */}
      <div className="border-b border-slate-100 p-6">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-slate-900 text-white shadow-md shadow-slate-900/20">
            <CalendarDays className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <h1 className="bg-gradient-to-r from-violet-600 to-indigo-600 bg-clip-text text-xl font-extrabold tracking-tight text-transparent">
              Civillist
            </h1>
            <p className="text-[11px] font-medium text-slate-400">Meeting Management</p>
          </div>
          {/* desktop only — on phones the bell lives in the top bar */}
          <NotificationBell className="hidden lg:flex" />
        </div>
      </div>

      {/* Navigation — dark-pill active state, violet hover */}
      <nav className="flex-1 overflow-y-auto p-4">
        <p className="mb-2 px-4 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">
          Menu
        </p>
        <div className="space-y-1.5">
          {menuItems.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href;

            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={isActive ? 'page' : undefined}
                onClick={onClose}
                className={`group flex items-center gap-3 rounded-full px-4 py-2.5 transition-all duration-200 ${
                  isActive
                    ? 'bg-slate-900 font-semibold text-white shadow-lg shadow-slate-900/20'
                    : 'font-medium text-slate-500 hover:bg-violet-50 hover:text-violet-700'
                }`}
              >
                <Icon
                  className={`h-5 w-5 shrink-0 transition-transform duration-200 group-hover:scale-110 ${
                    isActive ? 'text-white' : 'text-slate-400 group-hover:text-violet-600'
                  }`}
                />
                <span className="truncate">{item.label}</span>

                {/* Active indicator */}
                {isActive && (
                  <span className="ml-auto h-1.5 w-1.5 shrink-0 rounded-full bg-violet-400" />
                )}
              </Link>
            );
          })}
        </div>
      </nav>

      {/* User Profile — pinned to the bottom, same as before */}
      <div className="border-t border-slate-100 p-4">
        <div className="flex items-center gap-3 rounded-2xl bg-[#f7f6fd] px-3 py-2.5 ring-1 ring-violet-100/70">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-indigo-600 text-sm font-bold text-white shadow-md shadow-violet-500/25">
            {initials}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold capitalize text-slate-900">{displayName}</p>
            <p className="truncate text-xs text-slate-400">{subLabel}</p>
          </div>
          <button
            type="button"
            onClick={handleLogout}
            disabled={isLoggingOut}
            aria-label="Sign out"
            title="Sign out"
            className="rounded-full p-2 text-slate-400 transition-colors hover:bg-rose-50 hover:text-rose-600 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isLoggingOut ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <LogOut className="h-5 w-5" />
            )}
          </button>
        </div>
      </div>
    </aside>
  );
}