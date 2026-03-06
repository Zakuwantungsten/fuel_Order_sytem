
import {
  Search, RefreshCw, UserPlus, Upload, Download, X,
} from 'lucide-react';
import type { UserFilters } from '../types';
import FilterDropdown from './FilterDropdown';
import FilterChips from './FilterChips';
import { ROLE_FILTER_OPTIONS, STATUS_FILTER_OPTIONS, getRoleDefinition } from '../constants';

interface UserTableToolbarProps {
  filters: UserFilters;
  totalItems: number;
  page: number;
  limit: number;
  isFetching: boolean;
  onSearchChange: (q: string) => void;
  onFilterChange: (key: 'role' | 'status' | 'mfa', value: string) => void;
  onClearFilters: () => void;
  onRefresh: () => void;
  onCreateUser: () => void;
  onImportCSV: () => void;
  onExportCSV: () => void;
  searchInputRef?: React.RefObject<HTMLInputElement | null>;
}

export default function UserTableToolbar({
  filters,
  totalItems,
  page,
  limit,
  isFetching,
  onSearchChange,
  onFilterChange,
  onClearFilters,
  onRefresh,
  onCreateUser,
  onImportCSV,
  onExportCSV,
  searchInputRef,
}: UserTableToolbarProps) {
  const start = (page - 1) * limit + 1;
  const end = Math.min(page * limit, totalItems);

  // Build active filter chips
  const chips: { key: string; label: string; value: string }[] = [];
  if (filters.q) chips.push({ key: 'q', label: 'Search', value: filters.q });
  if (filters.role) chips.push({
    key: 'role',
    label: 'Role',
    value: getRoleDefinition(filters.role).label,
  });
  if (filters.status) chips.push({
    key: 'status',
    label: 'Status',
    value: filters.status === 'active' ? 'Active' : 'Inactive',
  });

  const handleChipRemove = (key: string) => {
    if (key === 'q') onSearchChange('');
    else if (key === 'role') onFilterChange('role', '');
    else if (key === 'status') onFilterChange('status', '');
  };

  return (
    <div className="space-y-3">
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm">
        <div className="p-4">
          <div className="flex flex-col lg:flex-row lg:items-end gap-3">
            {/* Search */}
            <div className="flex-1 min-w-0 lg:max-w-md">
              <label htmlFor="user-search-input" className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                Search
              </label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  id="user-search-input"
                  ref={searchInputRef as React.Ref<HTMLInputElement>}
                  type="text"
                  placeholder="Name, username, email, department..."
                  value={filters.q}
                  onChange={(e) => onSearchChange(e.target.value)}
                  aria-keyshortcuts="Control+k"
                  className="w-full pl-9 pr-8 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder:text-gray-400 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-colors"
                />
                {filters.q && (
                  <button
                    onClick={() => onSearchChange('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 rounded text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                    aria-label="Clear search"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>

            {/* Filters */}
            <div className="flex items-end gap-3 flex-wrap">
              <div className="w-40">
                <FilterDropdown
                  label="Role"
                  value={filters.role}
                  options={ROLE_FILTER_OPTIONS}
                  onChange={(v) => onFilterChange('role', v)}
                />
              </div>
              <div className="w-36">
                <FilterDropdown
                  label="Status"
                  value={filters.status}
                  options={STATUS_FILTER_OPTIONS}
                  onChange={(v) => onFilterChange('status', v)}
                />
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex items-end gap-2 ml-auto">
              <button
                onClick={onRefresh}
                disabled={isFetching}
                className="p-2 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors disabled:opacity-50"
                aria-label="Refresh"
                title="Refresh"
              >
                <RefreshCw className={`w-4 h-4 ${isFetching ? 'animate-spin' : ''}`} />
              </button>
              <button
                onClick={onExportCSV}
                className="p-2 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                aria-label="Export CSV"
                title="Export CSV"
              >
                <Download className="w-4 h-4" />
              </button>
              <button
                onClick={onImportCSV}
                className="p-2 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                aria-label="Import CSV"
                title="Import CSV"
              >
                <Upload className="w-4 h-4" />
              </button>
              <div className="w-px h-6 bg-gray-200 dark:bg-gray-700 mx-1" />
              <button
                onClick={onCreateUser}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 shadow-sm transition-colors"
              >
                <UserPlus className="w-4 h-4" />
                Create User
              </button>
            </div>
          </div>
        </div>

        {/* Record count + filter chips */}
        <div className="px-4 pb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-3">
            <span className="text-xs text-gray-500 dark:text-gray-400">
              {totalItems > 0
                ? `Showing ${start}--${end} of ${totalItems.toLocaleString()}`
                : 'No results'
              }
            </span>
          </div>
          <FilterChips
            chips={chips}
            onRemove={handleChipRemove}
            onClearAll={onClearFilters}
          />
        </div>
      </div>
    </div>
  );
}
