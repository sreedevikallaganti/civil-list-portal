'use client';

import { Search, Bell } from 'lucide-react';

export default function Header() {
  return (
    <header className="bg-white border-b border-gray-200 px-6 py-4">
      <div className="flex items-center justify-between">
        {/* Left Side - Logo & Search */}
        <div className="flex items-center gap-4 flex-1">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center text-white font-bold text-lg">
              C
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900">Civillist</h1>
              <p className="text-xs text-gray-500">Meeting Management</p>
            </div>
          </div>
          
          {/* Search Bar */}
          <div className="flex-1 max-w-xl ml-8">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                placeholder="Search meetings, officers..."
                className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>
        </div>

        {/* Right Side - Actions */}
        <div className="flex items-center gap-4">
          {/* New Meeting Button */}
          <button className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors shadow-sm">
            <span className="text-lg leading-none">+</span>
            New Meeting
          </button>

          {/* Notifications */}
          <button className="relative p-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
            <Bell className="w-5 h-5" />
            <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full"></span>
          </button>

          {/* User Avatar */}
          <div className="w-10 h-10 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-full flex items-center justify-center text-white font-bold">
            A
          </div>
        </div>
      </div>
    </header>
  );
}