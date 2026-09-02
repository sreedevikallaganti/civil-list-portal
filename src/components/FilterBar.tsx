'use client';

import { FilterOptions } from '@/types/meeting';

interface FilterBarProps {
  filters: FilterOptions;
  onFilterChange: (filters: FilterOptions) => void;
}

export default function FilterBar({ filters, onFilterChange }: FilterBarProps) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 mb-6">
      <div className="flex flex-wrap gap-4 items-center">
        {/* Search */}
        <div className="flex-1 min-w-[200px]">
          <input
            type="text"
            placeholder="Search by officer name..."
            value={filters.search || ''}
            onChange={(e) => onFilterChange({ ...filters, search: e.target.value })}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>

        {/* Type Filter */}
        <select
          value={filters.type || 'All'}
          onChange={(e) => onFilterChange({ ...filters, type: e.target.value })}
          className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="All">All Types</option>
          <option value="IAS">IAS</option>
          <option value="IPS">IPS</option>
          <option value="Other">Other</option>
        </select>

        {/* Sort */}
        <select
          value={filters.sortBy || 'date'}
          onChange={(e) => onFilterChange({ ...filters, sortBy: e.target.value as any })}
          className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="date">Sort by Date</option>
          <option value="name">Sort by Name</option>
          <option value="type">Sort by Type</option>
        </select>

        {/* Order */}
        <button
          onClick={() => onFilterChange({ 
            ...filters, 
            sortOrder: filters.sortOrder === 'asc' ? 'desc' : 'asc' 
          })}
          className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
        >
          {filters.sortOrder === 'asc' ? '↑ Ascending' : '↓ Descending'}
        </button>
      </div>
    </div>
  );
}