import { AlertTriangle, RefreshCw } from 'lucide-react';

interface AsyncErrorPanelProps {
  title?: string;
  message: string;
  onRetry: () => void;
  retryLabel?: string;
  className?: string;
}

export default function AsyncErrorPanel({
  title = 'Failed to load data',
  message,
  onRetry,
  retryLabel = 'Retry',
  className = '',
}: AsyncErrorPanelProps) {
  return (
    <div className={`rounded-xl border border-red-200 bg-red-50 p-4 dark:border-red-800 dark:bg-red-900/20 ${className}`}>
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-600 dark:text-red-400" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-red-800 dark:text-red-300">{title}</p>
          <p className="mt-1 text-sm text-red-700 dark:text-red-300/90">{message}</p>
          <button
            type="button"
            onClick={onRetry}
            className="mt-3 inline-flex items-center gap-2 rounded-lg bg-red-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-red-700"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            {retryLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
