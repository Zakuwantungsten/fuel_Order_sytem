import React, { ReactNode } from 'react';

/**
 * ResponsiveTable Component
 * 
 * A reusable component that displays data as cards on mobile/tablet (< lg breakpoint)
 * and as a traditional table on desktop (>= lg breakpoint).
 * 
 * Usage:
 * <ResponsiveTable
 *   headers={['Name', 'Email', 'Status']}
 *   data={users}
 *   renderCard={(item) => <UserCard user={item} />}
 *   renderRow={(item) => <UserRow user={item} />}
 * />
 */

export interface ResponsiveTableProps<T> {
  /** Array of column headers for desktop table view */
  headers?: string[];
  /** Array of data items to display */
  data: T[];
  /** Render function for mobile card view */
  renderCard: (item: T, index: number) => ReactNode;
  /** Render function for desktop table row view */
  renderRow: (item: T, index: number) => ReactNode;
  /** Loading state */
  loading?: boolean;
  /** Empty state message */
  emptyMessage?: string;
  /** Additional className for the container */
  className?: string;
  /** Show table headers (defaults to true) */
  showHeaders?: boolean;
}

export function ResponsiveTable<T>({
  headers = [],
  data,
  renderCard,
  renderRow,
  loading = false,
  emptyMessage = 'No data available',
  className = '',
  showHeaders = true,
}: ResponsiveTableProps<T>) {
  if (loading) {
    return (
      <div className="text-center py-8 sm:py-12 text-gray-500 dark:text-gray-400">
        <div className="w-8 h-8 sm:w-10 sm:h-10 border-4 border-blue-600 dark:border-blue-400 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
        <p className="text-sm sm:text-base">Loading...</p>
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div className="text-center py-8 sm:py-12 text-gray-500 dark:text-gray-400">
        <p className="text-sm sm:text-base">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className={className}>
      {/* Card View - Mobile/Tablet (below lg) */}
      <div className="lg:hidden space-y-2 sm:space-y-3">
        {data.map((item, index) => (
          <div key={index}>
            {renderCard(item, index)}
          </div>
        ))}
      </div>

      {/* Table View - Desktop/Laptop (lg and up) */}
      <div className="hidden lg:block overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
          {showHeaders && headers.length > 0 && (
            <thead className="bg-gray-50 dark:bg-gray-700">
              <tr>
                {headers.map((header, index) => (
                  <th
                    key={index}
                    className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-200 uppercase tracking-wider"
                  >
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
          )}
          <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
            {data.map((item, index) => renderRow(item, index))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/**
 * Card Component
 * A simple card wrapper for consistent styling
 */
export interface CardProps {
  children: ReactNode;
  className?: string;
  onClick?: () => void;
}

export function Card({ children, className = '', onClick }: CardProps) {
  return (
    <div
      onClick={onClick}
      className={`border border-gray-200 dark:border-gray-600 rounded-xl p-3 sm:p-4 bg-gray-50 dark:bg-gray-700/50 hover:bg-gray-100 dark:hover:bg-gray-600/50 transition-colors ${
        onClick ? 'cursor-pointer' : ''
      } ${className}`}
    >
      {children}
    </div>
  );
}

/**
 * CardField Component
 * A reusable field display for cards
 */
export interface CardFieldProps {
  label: string;
  value: ReactNode;
  className?: string;
}

export function CardField({ label, value, className = '' }: CardFieldProps) {
  return (
    <div className={`flex justify-between items-center py-1 ${className}`}>
      <span className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 font-medium">
        {label}:
      </span>
      <span className="text-sm sm:text-base text-gray-900 dark:text-gray-100 font-medium">
        {value}
      </span>
    </div>
  );
}

/**
 * CardHeader Component
 * Header section for cards with title and optional badge
 */
export interface CardHeaderProps {
  title: ReactNode;
  badge?: ReactNode;
  subtitle?: ReactNode;
}

export function CardHeader({ title, badge, subtitle }: CardHeaderProps) {
  return (
    <div className="flex justify-between items-start mb-2">
      <div className="min-w-0 flex-1">
        <div className="flex items-center flex-wrap gap-2">
          <h3 className="font-bold text-base sm:text-lg text-gray-800 dark:text-gray-100 truncate">
            {title}
          </h3>
          {badge}
        </div>
        {subtitle && (
          <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 mt-1">
            {subtitle}
          </p>
        )}
      </div>
    </div>
  );
}

/**
 * Badge Component
 * Status badges with color variants
 */
export interface BadgeProps {
  children: ReactNode;
  variant?: 'success' | 'warning' | 'error' | 'info' | 'default';
  size?: 'sm' | 'md';
}

export function Badge({ children, variant = 'default', size = 'sm' }: BadgeProps) {
  const variants = {
    success: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300',
    warning: 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300',
    error: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300',
    info: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300',
    default: 'bg-gray-100 dark:bg-gray-600 text-gray-700 dark:text-gray-300',
  };

  const sizes = {
    sm: 'text-xs px-2 py-0.5',
    md: 'text-sm px-3 py-1',
  };

  return (
    <span className={`${variants[variant]} ${sizes[size]} rounded-full font-medium inline-flex items-center`}>
      {children}
    </span>
  );
}

export default ResponsiveTable;
