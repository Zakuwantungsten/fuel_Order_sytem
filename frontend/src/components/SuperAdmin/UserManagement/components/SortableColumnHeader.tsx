import { ArrowUp, ArrowDown, ArrowUpDown } from 'lucide-react';
import type { SortField, SortConfig } from '../types';

interface SortableColumnHeaderProps {
  label: string;
  field: SortField;
  currentSort: SortConfig | null;
  onSort: (field: SortField) => void;
  align?: 'left' | 'center' | 'right';
  className?: string;
}

export default function SortableColumnHeader({
  label,
  field,
  currentSort,
  onSort,
  align = 'left',
  className = '',
}: SortableColumnHeaderProps) {
  const isActive = currentSort?.field === field;
  const direction = isActive ? currentSort!.direction : null;

  const alignClass =
    align === 'right' ? 'justify-end' : align === 'center' ? 'justify-center' : 'justify-start';

  return (
    <th
      className={`px-4 py-3 text-left text-xs font-medium uppercase tracking-wider whitespace-nowrap ${className}`}
    >
      <button
        type="button"
        onClick={() => onSort(field)}
        className={`inline-flex items-center gap-1 group transition-colors ${
          isActive
            ? 'text-indigo-600 dark:text-indigo-400'
            : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
        } ${alignClass}`}
        aria-label={`Sort by ${label}${direction ? `, currently ${direction}ending` : ''}`}
      >
        <span>{label}</span>
        <span className={`transition-opacity ${isActive ? 'opacity-100' : 'opacity-0 group-hover:opacity-50'}`}>
          {direction === 'asc' ? (
            <ArrowUp className="w-3.5 h-3.5" />
          ) : direction === 'desc' ? (
            <ArrowDown className="w-3.5 h-3.5" />
          ) : (
            <ArrowUpDown className="w-3.5 h-3.5" />
          )}
        </span>
      </button>
    </th>
  );
}
