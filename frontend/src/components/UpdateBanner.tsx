import { useState } from 'react';
import { RefreshCw, X, Sparkles } from 'lucide-react';
import { useVersionCheck } from '../hooks/useVersionCheck';

/**
 * Floating prompt shown when a newer app version has been deployed while this
 * tab is still running the old bundle. Clicking Refresh reloads the page, which
 * fetches the fresh (uncached) index.html and its new hashed assets.
 */
export default function UpdateBanner() {
  const updateAvailable = useVersionCheck();
  const [dismissed, setDismissed] = useState(false);

  if (!updateAvailable || dismissed) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[9999] w-[calc(100%-2rem)] max-w-md
                 rounded-2xl border border-indigo-200 dark:border-indigo-800
                 bg-white/95 dark:bg-gray-800/95 backdrop-blur-xl
                 shadow-2xl shadow-indigo-500/10
                 px-4 py-3.5 flex items-center gap-3
                 animate-fade-in-up"
    >
      <span className="shrink-0 w-9 h-9 rounded-xl bg-indigo-100 dark:bg-indigo-900/40 flex items-center justify-center">
        <Sparkles className="w-4.5 h-4.5 text-indigo-600 dark:text-indigo-400" />
      </span>

      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 leading-tight">
          A new version is available
        </p>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
          Refresh to get the latest updates.
        </p>
      </div>

      <button
        onClick={() => window.location.reload()}
        className="shrink-0 inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl
                   bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold
                   transition-colors"
      >
        <RefreshCw className="w-3.5 h-3.5" />
        Refresh
      </button>

      <button
        onClick={() => setDismissed(true)}
        aria-label="Dismiss"
        className="shrink-0 p-1.5 rounded-lg text-gray-400 hover:text-gray-600
                   dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
