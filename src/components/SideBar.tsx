'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { 
  LayoutDashboard, 
  Calendar, 
  Users, 
  FileText, 
  Settings,
  LogOut,
  Phone
} from 'lucide-react';

export default function SideBar() {
  const pathname = usePathname();
  
  const menuItems = [
    { href: '/', label: 'Dashboard', icon: LayoutDashboard },
    { href: '/meetings', label: 'Meetings', icon: Calendar },
    { href: '/officers', label: 'Officers', icon: Users },
    // { href: '/other-contacts', label: 'Other Contacts', icon: Phone },
    { href: '/calendar', label: 'Calendar', icon: Calendar },
    { href: '/reports', label: 'Reports', icon: FileText },
    { href: '/settings', label: 'Settings', icon: Settings },
  ];

  return (
    <aside className="w-64 bg-white border-r border-gray-200 min-h-screen flex flex-col">
      {/* Logo */}
      <div className="p-6 border-b border-gray-200">
        <h1 className="text-2xl font-bold text-blue-600">Civillist</h1>
        <p className="text-xs text-gray-500 mt-1">Meeting Management</p>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-4 space-y-1">
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
      </nav>

      {/* User Profile at Bottom */}
      <div className="p-4 border-t border-gray-200">
        <div className="flex items-center gap-3 px-2 py-2">
          <div className="w-10 h-10 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-full flex items-center justify-center text-white font-bold">
            A
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-medium text-gray-900 truncate">Admin User</p>
            <p className="text-xs text-gray-500 truncate">admin@civillist.com</p>
          </div>
          <button className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
            <LogOut className="w-5 h-5" />
          </button>
        </div>
      </div>
    </aside>
  );
}