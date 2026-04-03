import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { subscribeToDataChanges, unsubscribeFromDataChanges } from '../services/websocket';

/**
 * Subscribe to real-time data change events for one or more collections.
 * When the server pushes a record payload, it is injected directly into
 * the React Query cache via setQueryData (bypasses staleTime). List queries
 * are invalidated so the next render fetches fresh data.
 *
 * Falls back to calling onRefresh() when no record payload is available
 * (backward-compatible with controllers that haven't been updated yet).
 *
 * @param collections - Collection name(s) to watch
 * @param onRefresh - Fallback callback to re-fetch data
 * @param id - Unique subscriber ID
 */
export function useRealtimeSync(
  collections: string | string[],
  onRefresh: () => void,
  id?: string
) {
  const queryClient = useQueryClient();
  const refreshRef = useRef(onRefresh);
  useEffect(() => {
    refreshRef.current = onRefresh;
  });

  const cols = Array.isArray(collections) ? collections : [collections];
  const subId = id || `rt-${cols.join('+')}`;

  useEffect(() => {
    subscribeToDataChanges((event) => {
      if (!cols.includes(event.collection)) return;

      if (event.record && (event.action === 'update' || event.action === 'create')) {
        // Inject the record directly into the per-record cache entry
        const recordId = event.record._id || event.record.id;
        if (recordId) {
          queryClient.setQueryData([event.collection, recordId], event.record);
        }
      }

      // Always invalidate list queries so they refetch in the background
      cols.forEach(col => queryClient.invalidateQueries({ queryKey: [col] }));

      // Call the legacy refresh callback as fallback
      refreshRef.current();
    }, subId);

    return () => {
      unsubscribeFromDataChanges(subId);
    };
  }, [subId]);
}
