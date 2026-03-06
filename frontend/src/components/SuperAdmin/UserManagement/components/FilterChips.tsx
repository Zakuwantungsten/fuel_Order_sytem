import { X } from 'lucide-react';

interface FilterChip {
  key: string;
  label: string;
  value: string;
}

interface FilterChipsProps {
  chips: FilterChip[];
  onRemove: (key: string) => void;
  onClearAll: () => void;
}

export default function FilterChips({ chips, onRemove, onClearAll }: FilterChipsProps) {
  if (chips.length === 0) return null;

  return (
    <div className="flex items-center gap-2 flex-wrap" role="list" aria-label="Active filters">
      <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
        Filtered by
      </span>
      {chips.map(chip => (
        <span
          key={chip.key}
          role="listitem"
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800"
        >
          <span className="text-indigo-400 dark:text-indigo-500">{chip.label}:</span>
          <span>{chip.value}</span>
          <button
            onClick={() => onRemove(chip.key)}
            className="ml-0.5 p-0.5 rounded-full hover:bg-indigo-100 dark:hover:bg-indigo-900/40 transition-colors"
            aria-label={`Remove ${chip.label} filter`}
          >
            <X className="w-3 h-3" />
          </button>
        </span>
      ))}
      {chips.length > 1 && (
        <button
          onClick={onClearAll}
          className="text-xs font-medium text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 underline underline-offset-2 transition-colors"
        >
          Clear all
        </button>
      )}
    </div>
  );
}
