import { useEffect, useRef } from 'react';
import { subscribeToDataChanges, unsubscribeFromDataChanges } from '../services/websocket';

/**
 * Subscribe to real-time data change events for one or more collections.
 * When any user creates/updates/deletes data in a watched collection,
 * the provided refresh callback is called silently (no loading spinner).
 *
 * @param collections - Collection name(s) to watch (e.g. 'fuel_records', ['fuel_records', 'lpo_entries'])
 * @param onRefresh - Callback to silently re-fetch data. Should NOT set loading=true.
 * @param id - Unique subscriber ID (defaults to collections joined)
 */
export function useRealtimeSync(
  collections: string | string[],
  onRefresh: () => void,
  id?: string
) {
  const refreshRef = useRef(onRefresh);
  useEffect(() => {
    refreshRef.current = onRefresh;
  });

  const cols = Array.isArray(collections) ? collections : [collections];
  const subId = id || `rt-${cols.join('+')}`;

  useEffect(() => {
    subscribeToDataChanges((event) => {
      if (cols.includes(event.collection)) {
        refreshRef.current();
      }
    }, subId);

    return () => {
      unsubscribeFromDataChanges(subId);
    };
  }, [subId]);
}
