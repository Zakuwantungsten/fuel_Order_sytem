
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
        <div className="p-3 sm:p-4 space-y-2.5 lg:space-y-0">

          {/* ── Desktop layout (lg+): single flex row ─────────────────── */}
          <div className="hidden lg:flex lg:items-end gap-3">
            {/* Search */}
            <div className="flex-1 min-w-0 max-w-md">
              <label htmlFor="user-search-input" className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                Search
              </label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                <input
                  id="user-search-input"
                  ref={searchInputRef as React.Ref<HTMLInputElement>}
                  type="text"
                  placeholder="Name, username, email..."
                  value={filters.q}
                  onChange={(e) => onSearchChange(e.target.value)}
                  aria-keyshortcuts="Control+k"
                  className="w-full pl-9 pr-8 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder:text-gray-400 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-colors"
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
            <div className="flex items-end gap-3">
              <div className="w-40">
                <FilterDropdown label="Role" value={filters.role} options={ROLE_FILTER_OPTIONS} onChange={(v) => onFilterChange('role', v)} />
              </div>
              <div className="w-36">
                <FilterDropdown label="Status" value={filters.status} options={STATUS_FILTER_OPTIONS} onChange={(v) => onFilterChange('status', v)} />
              </div>
            </div>
            {/* Action buttons */}
            <div className="flex items-end gap-2 ml-auto">
              <button onClick={onRefresh} disabled={isFetching} className="p-2 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors disabled:opacity-50" aria-label="Refresh" title="Refresh">
                <RefreshCw className={`w-4 h-4 ${isFetching ? 'animate-spin' : ''}`} />
              </button>
              <button onClick={onExportCSV} className="p-2 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors" aria-label="Export CSV" title="Export CSV">
                <Download className="w-4 h-4" />
              </button>
              <button onClick={onImportCSV} className="p-2 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors" aria-label="Import CSV" title="Import CSV">
                <Upload className="w-4 h-4" />
              </button>
              <div className="w-px h-6 bg-gray-200 dark:bg-gray-700 mx-1" />
              <button onClick={onCreateUser} className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 shadow-sm transition-colors">
                <UserPlus className="w-4 h-4" />
                Create User
              </button>
            </div>
          </div>

          {/* ── Mobile layout (< lg): stacked rows ────────────────────── */}
          <div className="lg:hidden space-y-2">
            {/* Row 1: Search */}
            <div className="relative">
              <input
                ref={searchInputRef as React.Ref<HTMLInputElement>}
                type="text"
                placeholder="Search users..."
                value={filters.q}
                onChange={(e) => onSearchChange(e.target.value)}
                className="w-full pl-10 pr-8 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder:text-gray-400 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-colors"
              />
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
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

            {/* Row 2: Filters + icon buttons */}
            <div className="flex items-center gap-2">
              <div className="flex-1 min-w-0">
                <FilterDropdown label="Role" value={filters.role} options={ROLE_FILTER_OPTIONS} onChange={(v) => onFilterChange('role', v)} />
              </div>
              <div className="flex-1 min-w-0">
                <FilterDropdown label="Status" value={filters.status} options={STATUS_FILTER_OPTIONS} onChange={(v) => onFilterChange('status', v)} />
              </div>
              {/* Icon buttons grouped */}
              <div className="flex items-center gap-1 flex-shrink-0 border-l border-gray-200 dark:border-gray-700 pl-2 ml-1">
                <button onClick={onRefresh} disabled={isFetching} className="p-1.5 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors disabled:opacity-50" aria-label="Refresh" title="Refresh">
                  <RefreshCw className={`w-4 h-4 ${isFetching ? 'animate-spin' : ''}`} />
                </button>
                <button onClick={onExportCSV} className="p-1.5 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors" aria-label="Export CSV" title="Export CSV">
                  <Download className="w-4 h-4" />
                </button>
                <button onClick={onImportCSV} className="p-1.5 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors" aria-label="Import CSV" title="Import CSV">
                  <Upload className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Row 3: Create User — full width */}
            <button
              onClick={onCreateUser}
              className="w-full inline-flex items-center justify-center gap-1.5 px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 shadow-sm transition-colors"
            >
              <UserPlus className="w-4 h-4" />
              Create User
            </button>
          </div>

        </div>

        {/* Record count + filter chips */}
        <div className="px-3 sm:px-4 pb-3 flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs text-gray-500 dark:text-gray-400">
            {totalItems > 0
              ? `Showing ${start}–${end} of ${totalItems.toLocaleString()}`
              : 'No results'
            }
          </span>
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
