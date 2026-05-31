import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { subscribeToDataChanges, unsubscribeFromDataChanges } from '../services/websocket';
import { lpoKeys } from './useLPOs';
import { deliveryOrderKeys } from './useDeliveryOrders';
import { fuelRecordKeys } from './useFuelRecords';

/**
 * Map WebSocket collection names → the React Query cache keys they should invalidate.
 * A single event may need to bust multiple query families (cross-entity dependencies).
 *
 * Previously the hook did: invalidateQueries({ queryKey: [collectionName] })
 * which was a no-op because the actual cache keys are ['lpos','list',...] etc.
 * This mapping fixes that and also covers cross-entity cases (e.g. truck_batches
 * affecting both fuel records and delivery orders).
 */
const COLLECTION_QUERY_KEYS: Record<string, () => readonly unknown[][]> = {
  lpo_summaries:   () => [lpoKeys.lists(), lpoKeys.workbooks(), lpoKeys.availableFilters()],
  delivery_orders: () => [deliveryOrderKeys.lists(), deliveryOrderKeys.availablePeriods({})],
  fuel_records:    () => [fuelRecordKeys.lists(), fuelRecordKeys.availablePeriods()],
  truck_batches:   () => [fuelRecordKeys.lists(), deliveryOrderKeys.lists()],
};

/** Map collection name → the detail-level React Query key for a specific record id. */
function getDetailKey(collection: string, id: string): readonly unknown[] | null {
  switch (collection) {
    case 'lpo_summaries':   return lpoKeys.detail(id);
    case 'delivery_orders': return deliveryOrderKeys.detail(id);
    case 'fuel_records':    return fuelRecordKeys.detail(id);
    default:                return null;
  }
}

/**
 * Subscribe to real-time data change events for one or more collections.
 *
 * On each event:
 * 1. If a record payload is included (create/update), write it directly into the
 *    per-record detail cache so the UI reflects the change immediately — no round trip.
 * 2. Invalidate all list queries that depend on this collection so they refetch
 *    in the background (using the correct React Query key, not the WS channel name).
 * 3. Call the legacy onRefresh() callback for any additional invalidations the
 *    component needs (e.g. workbook years, filter dropdowns).
 *
 * @param collections  Collection name(s) to watch
 * @param onRefresh    Called after every matching event — use for extra invalidations
 * @param id           Unique subscriber ID (auto-derived from collection names if omitted)
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

      // 1. Direct cache injection for detail entries (eliminates flash of stale data)
      if (event.record && (event.action === 'update' || event.action === 'create')) {
        const recordId = event.record._id || event.record.id;
        if (recordId) {
          const detailKey = getDetailKey(event.collection, String(recordId));
          if (detailKey) queryClient.setQueryData(detailKey, event.record);
        }
      }

      // 2. Invalidate list queries using correct React Query keys
      const keyFactory = COLLECTION_QUERY_KEYS[event.collection];
      if (keyFactory) {
        keyFactory().forEach(key =>
          queryClient.invalidateQueries({ queryKey: key as unknown[] })
        );
      }

      // 3. Component-level callback for extra invalidations
      refreshRef.current();
    }, subId);

    return () => {
      unsubscribeFromDataChanges(subId);
    };
  }, [subId]);
}
