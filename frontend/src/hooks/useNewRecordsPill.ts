import { useEffect, useState } from 'react';

/**
 * Tracks a count of newly-created records that are relevant to the current view
 * but haven't been loaded yet (the user chooses when to load them via a pill).
 *
 * `resetKey` should be a string derived from the active filters / month / tab /
 * page. Whenever it changes, the pending count is cleared — switching the view
 * already triggers a fresh query that includes the new rows, so a stale pill
 * would be misleading.
 */
export function useNewRecordsPill(resetKey: string) {
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    setPendingCount(0);
  }, [resetKey]);

  return {
    pendingCount,
    addPending: (n: number = 1) => {
      if (n > 0) setPendingCount(c => c + n);
    },
    clearPending: () => setPendingCount(0),
  };
}
