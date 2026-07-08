import { RefreshCw } from 'lucide-react';

interface NewRecordsPillProps {
  count: number;
  onLoad: () => void;
  /** Singular noun for the record type, e.g. "record", "order", "LPO". */
  label?: string;
  className?: string;
}

/**
 * A small, non-intrusive "N new records — click to load" affordance. Shown when
 * newly-created records relevant to the current view are available but haven't
 * been loaded, so the user's table isn't refreshed out from under them.
 */
export function NewRecordsPill({ count, onLoad, label = 'record', className = '' }: NewRecordsPillProps) {
  if (count <= 0) return null;
  return (
    <button
      type="button"
      onClick={onLoad}
      className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium shadow-sm transition-colors ${className}`}
      title="Load the new records into the table"
    >
      <RefreshCw className="w-4 h-4" />
      {count} new {label}{count === 1 ? '' : 's'} — click to load
    </button>
  );
}
