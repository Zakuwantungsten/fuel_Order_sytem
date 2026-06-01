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
const COLLECTION_QUERY_KEYS: Record<string, () => ReadonlyArray<ReadonlyArray<unknown>>> = {
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
 * Normalize a record from a WebSocket event (produced by Mongoose .toObject()) to
 * match the shape the frontend expects. The backend's toJSON transform maps _id → id
 * and removes _id, but toObject() keeps _id without adding id. We normalise here so
 * records patched into the React Query cache always carry a string `id` field and
 * preserve any existing `id` already in the cache entry.
 */
function normalizeWsRecord(record: any): any {
  const rawId = record._id || record.id;
  if (!rawId) return record;
  return { ...record, id: String(rawId) };
}

/**
 * Try to update a single record in-place across all matching list caches.
 * Returns true if the record was found and patched in at least one cached page.
 * List data is expected to have the shape { records: T[], pagination: {...} }.
 */
function patchRecordInListCaches(
  queryClient: ReturnType<typeof useQueryClient>,
  listKeys: ReadonlyArray<ReadonlyArray<unknown>>,
  recordId: string,
  normalized: any,
): boolean {
  let patchedAny = false;
  listKeys.forEach(listKey => {
    queryClient.setQueriesData(
      { queryKey: listKey as unknown[] },
      (old: any) => {
        if (!old?.records) return old;
        const idx = old.records.findIndex((r: any) =>
          String(r._id || r.id) === recordId
        );
        if (idx === -1) return old;
        patchedAny = true;
        const newRecords = [...old.records];
        newRecords[idx] = { ...newRecords[idx], ...normalized };
        return { ...old, records: newRecords };
      }
    );
  });
  return patchedAny;
}

/**
 * Subscribe to real-time data change events for one or more collections.
 *
 * On each event:
 * - **update** with a record payload → patch the row in-place in all list caches
 *   and write to the detail cache.  No network refetch is triggered unless the
 *   record wasn't found on the current page (different page → fallback invalidation).
 * - **create / delete** → invalidate list caches so the table refetches and shows
 *   the correct row count / ordering.
 * - Always calls the onRefresh() callback for extra component-level invalidations.
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

      const keyFactory = COLLECTION_QUERY_KEYS[event.collection];

      if (event.action === 'update' && event.record) {
        const rawId = event.record._id || event.record.id;
        if (rawId) {
          const recordId = String(rawId);
          const normalized = normalizeWsRecord(event.record);

          // Always write to the detail cache
          const detailKey = getDetailKey(event.collection, recordId);
          if (detailKey) queryClient.setQueryData(detailKey, normalized);

          // Patch in-place in list caches; only fall back to invalidation
          // when the record isn't on any currently-cached page
          if (keyFactory) {
            const listKeys = keyFactory();
            const found = patchRecordInListCaches(queryClient, listKeys, recordId, normalized);
            if (!found) {
              listKeys.forEach(key =>
                queryClient.invalidateQueries({ queryKey: key as unknown[] })
              );
            }
          }

          refreshRef.current();
          return;
        }
      }

      // create / delete — always invalidate so the list re-fetches
      if (keyFactory) {
        keyFactory().forEach((key: ReadonlyArray<unknown>) =>
          queryClient.invalidateQueries({ queryKey: key as unknown[] })
        );
      }

      // Seed detail cache for newly created records
      if (event.action === 'create' && event.record) {
        const rawId = event.record._id || event.record.id;
        if (rawId) {
          const detailKey = getDetailKey(event.collection, String(rawId));
          if (detailKey) queryClient.setQueryData(detailKey, normalizeWsRecord(event.record));
        }
      }

      refreshRef.current();
    }, subId);

    return () => {
      unsubscribeFromDataChanges(subId);
    };
  }, [subId]);
}
