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
  // MapPinned, // Meeting Map (hidden)
  ChevronsLeft,
  ChevronsRight,
  CalendarHeart,
  Building2,
  Crown,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useOrg } from '@/contexts/OrgContext';
import pb from '@/lib/pocketbase';
import { NotificationBell } from '@/components/notifications/NotificationCenter';

/* open / onClose drive the slide-in drawer below the lg breakpoint; on desktop it's always visible,
   either full width (w-64) or collapsed to an icon rail (w-20). Collapsing never affects the phone drawer. */
export default function SideBar({
  open = false,
  onClose,
  collapsed = false,
  onToggleCollapsed,
}: {
  open?: boolean;
  onClose?: () => void;
  collapsed?: boolean;
  onToggleCollapsed?: () => void;
}) {
  /* classes that only apply on desktop while collapsed */
  const railHide = collapsed ? 'lg:hidden' : '';
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuth();
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const { org, orgs, isOwner, enabled: tenancy, switchOrg } = useOrg();
const menuItems = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/meetings', label: 'Meetings', icon: Calendar },
  { href: '/officers', label: 'Officers', icon: Users },
  { href: '/employees', label: 'Employees', icon: Briefcase },  
  { href: '/associates', label: 'Associates', icon: Crown },
  { href: '/users', label: 'Users', icon: UserCog }, 
  // { href: '/other-contacts', label: 'Other Contacts', icon: Phone },
  { href: '/calendar', label: 'Calendar', icon: CalendarDays },
  { href: '/occasions', label: 'Occasions', icon: CalendarHeart },
  // Meeting Map — hidden until the feature is confirmed (page: src/app/map)
  // { href: '/map', label: 'Meeting Map', icon: MapPinned },
  { href: '/reports', label: 'Reports', icon: FileText },
  { href: '/recap', label: 'Yearly Recap', icon: Sparkles },
  { href: '/settings', label: 'Settings', icon: Settings },
  // platform owner (PocketBase superuser) only
  ...(isOwner ? [{ href: '/organizations', label: 'Organisations', icon: Building2 }] : []),
];

  /* ---------- Real signed-in user (from PocketBase via AuthContext) ---------- */
  const displayName =
    user?.name?.trim() ||
    user?.email?.split('@')[0] ||
    'Signed in';

  // permissions can be a list in PocketBase, so it's not used as text here
  const subLabel = user?.department || user?.role || user?.email || '';

  /* profile photo (Settings → My profile), small thumbnail */
  const avatarUrl = user?.avatar ? pb.files.getURL(user as never, user.avatar, { thumb: '100x100' }) : '';

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
      className={`fixed left-0 top-0 z-[60] flex h-screen w-64 flex-col border-r border-violet-100/80 bg-white/95 shadow-[1px_0_24px_-12px_rgba(139,92,246,0.25)] backdrop-blur-md transition-[transform,width] duration-300 lg:z-30 lg:translate-x-0 ${
        collapsed ? 'lg:w-20' : ''
      } ${open ? 'translate-x-0' : '-translate-x-full'}`}
    >
      {/* Collapse / expand — desktop only, sits on the sidebar's right edge */}
      {onToggleCollapsed && (
        <button
          type="button"
          onClick={onToggleCollapsed}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          aria-expanded={!collapsed}
          title={`${collapsed ? 'Expand' : 'Collapse'} sidebar (Ctrl+B)`}
          className="absolute -right-3.5 top-[5.25rem] z-10 hidden h-7 w-7 cursor-pointer items-center justify-center rounded-full border border-violet-100 bg-white text-slate-400 shadow-md shadow-violet-500/10 transition-all duration-200 hover:scale-110 hover:border-violet-200 hover:text-violet-600 lg:flex"
        >
          {collapsed ? <ChevronsRight className="h-4 w-4" /> : <ChevronsLeft className="h-4 w-4" />}
        </button>
      )}

      {/* Logo */}
      <div className={`border-b border-slate-100 p-6 ${collapsed ? 'lg:px-0 lg:py-5' : ''}`}>
        <div className={`flex items-center gap-3 ${collapsed ? 'lg:flex-col lg:gap-3' : ''}`}>
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-slate-900 text-white shadow-md shadow-slate-900/20">
            <CalendarDays className="h-5 w-5" />
          </span>
          <div className={`min-w-0 flex-1 ${railHide}`}>
            <h1 className="bg-gradient-to-r from-violet-600 to-indigo-600 bg-clip-text text-xl font-extrabold tracking-tight text-transparent">
              Civillist
            </h1>
            <p className="truncate text-[11px] font-medium text-slate-400" title={org?.name}>{org?.name || 'Meeting Management'}</p>
          </div>
          {/* desktop only — on phones the bell lives in the top bar */}
          <NotificationBell className="hidden lg:flex" />
        </div>
      </div>

      {/* platform owner: which organisation they are working in */}
      {isOwner && tenancy && orgs.length > 0 && (
        <div className={`border-b border-slate-100 px-4 py-3 ${railHide}`}>
          <label htmlFor="org-switch" className="mb-1 block px-1 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">Organisation</label>
          <div className="relative">
            <Building2 className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-violet-500" />
            <select
              id="org-switch"
              value={org?.id || ''}
              onChange={(e) => switchOrg(e.target.value)}
              className="w-full cursor-pointer appearance-none truncate rounded-xl border border-violet-100 bg-violet-50/60 py-2 pl-9 pr-3 text-sm font-semibold text-slate-800 outline-none transition-colors hover:border-violet-200 focus:border-violet-400"
            >
              {orgs.map((o) => <option key={o.id} value={o.id}>{o.name}{o.status === 'suspended' ? ' (suspended)' : ''}</option>)}
            </select>
          </div>
        </div>
      )}

      {/* Navigation — dark-pill active state, violet hover */}
      <nav className={`flex-1 overflow-y-auto overflow-x-hidden p-4 ${collapsed ? 'lg:px-3' : ''}`}>
        <p className={`mb-2 px-4 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400 ${collapsed ? 'lg:px-0 lg:text-center' : ''}`}>
          Menu
        </p>
        <div className="space-y-1.5">
          {menuItems.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href || (item.href !== '/' && !!pathname?.startsWith(`${item.href}/`));

            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={isActive ? 'page' : undefined}
                onClick={onClose}
                title={collapsed ? item.label : undefined}
                aria-label={collapsed ? item.label : undefined}
                className={`group flex items-center gap-3 rounded-full px-4 py-2.5 transition-all duration-200 ${
                  collapsed ? 'lg:justify-center lg:px-0' : ''
                } ${
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
                <span className={`truncate ${railHide}`}>{item.label}</span>

                {/* Active indicator */}
                {isActive && (
                  <span className={`ml-auto h-1.5 w-1.5 shrink-0 rounded-full bg-violet-400 ${railHide}`} />
                )}
              </Link>
            );
          })}
        </div>
      </nav>

      {/* User Profile — pinned to the bottom, same as before */}
      <div className={`border-t border-slate-100 p-4 ${collapsed ? 'lg:px-3' : ''}`}>
        <div
          className={`flex items-center gap-3 rounded-2xl bg-[#f7f6fd] px-3 py-2.5 ring-1 ring-violet-100/70 ${
            collapsed ? 'lg:flex-col lg:gap-2 lg:px-0' : ''
          }`}
        >
          {/* your photo + name → your own profile & settings */}
          <Link
            href="/settings"
            onClick={onClose}
            data-tooltip="Your profile & settings"
            className={`group flex min-w-0 flex-1 items-center gap-3 rounded-xl ${collapsed ? 'lg:flex-none' : ''}`}
          >
            {avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={avatarUrl} alt="" className="h-10 w-10 shrink-0 rounded-full object-cover shadow-md ring-2 ring-white transition-transform group-hover:scale-105" />
            ) : (
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-indigo-600 text-sm font-bold text-white shadow-md shadow-violet-500/25 transition-transform group-hover:scale-105">
                {initials}
              </span>
            )}
            <span className={`min-w-0 flex-1 ${railHide}`}>
              <span className="block truncate font-semibold capitalize text-slate-900 group-hover:text-violet-700">{displayName}</span>
              <span className="block truncate text-xs text-slate-400">{subLabel}</span>
            </span>
          </Link>
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