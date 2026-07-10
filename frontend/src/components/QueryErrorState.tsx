import { WifiOff, RefreshCw } from 'lucide-react';

interface QueryErrorStateProps {
  title?: string;
  message?: string;
  onRetry: () => void;
  isRetrying?: boolean;
  className?: string;
}

/**
 * Empty-state shown when a list/page query fails and there is no cached data.
 * Keeps the UI honest instead of looking like an empty successful load.
 */
const QueryErrorState = ({
  title = 'Unable to load data',
  message = 'The server may be unreachable or temporarily unavailable. Check your connection and try again.',
  onRetry,
  isRetrying = false,
  className = '',
}: QueryErrorStateProps) => {
  return (
    <div
      className={`flex flex-col items-center justify-center gap-3 px-6 py-12 text-center ${className}`}
      role="alert"
    >
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-50 text-red-600 dark:bg-red-900/30 dark:text-red-400">
        <WifiOff className="h-6 w-6" aria-hidden="true" />
      </div>
      <div className="max-w-sm space-y-1">
        <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{title}</p>
        <p className="text-sm text-gray-500 dark:text-gray-400">{message}</p>
      </div>
      <button
        type="button"
        onClick={onRetry}
        disabled={isRetrying}
        className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-blue-500 dark:hover:bg-blue-600"
      >
        <RefreshCw className={`h-4 w-4 ${isRetrying ? 'animate-spin' : ''}`} aria-hidden="true" />
        {isRetrying ? 'Retrying…' : 'Retry'}
      </button>
    </div>
  );
};

export default QueryErrorState;
