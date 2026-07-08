import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { subscribeToDataChanges, unsubscribeFromDataChanges } from '../services/websocket';
import { lpoKeys } from './useLPOs';
import { deliveryOrderKeys } from './useDeliveryOrders';
import { fuelRecordKeys } from './useFuelRecords';
import { tangaLPOKeys } from './useTangaLPOs';
import { darLPOKeys } from './useDarLPOs';
import { journeyConfigKey } from './useJourneyConfig';
import { fuelStationKeys } from './useFuelStations';
import { cleanDeliveryOrder } from '../utils/dataCleanup';

/** Shape of a real-time data-change event delivered over the WebSocket. */
export interface DataChangeEvent {
  collection: string;
  action: 'create' | 'update' | 'delete' | string;
  timestamp: number;
  record?: any;
}

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
  lpo_summaries:        () => [lpoKeys.lists(), lpoKeys.workbooks(), lpoKeys.availableFilters()],
  delivery_orders:      () => [deliveryOrderKeys.lists(), deliveryOrderKeys.availablePeriods({})],
  fuel_records:         () => [fuelRecordKeys.lists(), fuelRecordKeys.availablePeriods()],
  truck_batches:        () => [fuelRecordKeys.lists(), deliveryOrderKeys.lists()],
  tanga_lpo_documents:  () => [tangaLPOKeys.lists(), [...tangaLPOKeys.all, 'workbook'] as const, tangaLPOKeys.years()],
  dar_lpo_documents:    () => [darLPOKeys.lists(), [...darLPOKeys.all, 'workbook'] as const, darLPOKeys.years()],
  journey_config:       () => [[...journeyConfigKey]],
  fuel_stations:        () => [fuelStationKeys.all, fuelStationKeys.active],
};

/** Map collection name → the detail-level React Query key for a specific record id. */
function getDetailKey(collection: string, id: string): readonly unknown[] | null {
  switch (collection) {
    case 'lpo_summaries':   return lpoKeys.detail(id);
    case 'delivery_orders': return deliveryOrderKeys.detail(id);
    case 'fuel_records':    return fuelRecordKeys.detail(id);
    case 'fuel_stations':   return fuelStationKeys.byId(id);
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
function normalizeWsRecord(collection: string, record: any): any {
  const rawId = record._id || record.id;
  if (!rawId) return record;
  // Apply the same defensive cleanup the list query applies, so a row patched
  // from a socket payload is indistinguishable from a freshly-fetched one.
  const cleaned = collection === 'delivery_orders' ? cleanDeliveryOrder(record) : record;
  return { ...cleaned, id: String(rawId) };
}

/**
 * The list-query cache entries store their rows under different keys depending
 * on the collection: fuel records → `records`, delivery orders → `orders`,
 * LPOs → `lpos`. We probe these in order so a single patch helper works for all.
 */
const LIST_ARRAY_KEYS = ['records', 'orders', 'lpos'] as const;

/**
 * Try to update a single record in-place across all matching list caches.
 * Returns true if the record was found and patched in at least one cached page.
 * List data is expected to have the shape { [records|orders|lpos]: T[], pagination }.
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
        if (!old || typeof old !== 'object') return old;
        const arrayKey = LIST_ARRAY_KEYS.find(k => Array.isArray(old[k]));
        if (!arrayKey) return old;
        const rows = old[arrayKey];
        const idx = rows.findIndex((r: any) => String(r._id || r.id) === recordId);
        if (idx === -1) return old;
        patchedAny = true;
        const newRows = [...rows];
        newRows[idx] = { ...newRows[idx], ...normalized };
        return { ...old, [arrayKey]: newRows };
      }
    );
  });
  return patchedAny;
}

/**
 * Coalesced list invalidation.
 *
 * A bulk import fires several `create` events in quick succession, and many
 * components subscribe to overlapping collections — so a naive invalidate would
 * trigger a burst of duplicate refetches (a mini thundering herd) across every
 * connected client. We batch invalidations landing within a short window into a
 * single refetch per query key. Row-level patches (setQueryData) stay immediate;
 * only the fall-back list refetches are coalesced.
 */
const COALESCE_WINDOW_MS = 300;
const pendingInvalidations = new Map<string, unknown[]>();
let invalidationTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleInvalidate(
  queryClient: ReturnType<typeof useQueryClient>,
  queryKey: readonly unknown[],
): void {
  pendingInvalidations.set(JSON.stringify(queryKey), queryKey as unknown[]);
  if (invalidationTimer) return;
  invalidationTimer = setTimeout(() => {
    const keys = Array.from(pendingInvalidations.values());
    pendingInvalidations.clear();
    invalidationTimer = null;
    keys.forEach(key => queryClient.invalidateQueries({ queryKey: key }));
  }, COALESCE_WINDOW_MS);
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
 * @param onRefresh    Called after every matching event. Receives the raw event
 *                     so consumers that manage their own local state can patch a
 *                     single record in place instead of refetching everything.
 *                     Existing zero-argument callbacks keep working unchanged.
 * @param id           Unique subscriber ID (auto-derived from collection names if omitted)
 */
export function useRealtimeSync(
  collections: string | string[],
  onRefresh: (event?: DataChangeEvent) => void,
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
        // A cross-entity cascade may touch several rows at once, so the payload
        // can be a single record or an array of them. Patch each one in place.
        const records = Array.isArray(event.record) ? event.record : [event.record];
        const listKeys = keyFactory ? keyFactory() : [];
        let allPatched = records.length > 0;

        for (const rec of records) {
          const rawId = rec?._id || rec?.id;
          if (!rawId) {
            allPatched = false;
            continue;
          }
          const recordId = String(rawId);
          const normalized = normalizeWsRecord(event.collection, rec);

          // Always write to the detail cache
          const detailKey = getDetailKey(event.collection, recordId);
          if (detailKey) queryClient.setQueryData(detailKey, normalized);

          // Patch in-place in list caches
          if (listKeys.length) {
            const found = patchRecordInListCaches(queryClient, listKeys, recordId, normalized);
            if (!found) allPatched = false;
          }
        }

        // Only fall back to invalidation when a record wasn't on any cached page
        // (e.g. it lives on a different page or the payload was malformed).
        if (!allPatched && listKeys.length) {
          listKeys.forEach(key => scheduleInvalidate(queryClient, key));
        }

        refreshRef.current(event as DataChangeEvent);
        return;
      }

      // create / delete — always invalidate so the list re-fetches (coalesced,
      // so a bulk import's burst of events collapses into a single refetch).
      if (keyFactory) {
        keyFactory().forEach((key: ReadonlyArray<unknown>) =>
          scheduleInvalidate(queryClient, key)
        );
      }

      // Seed detail cache for newly created records
      if (event.action === 'create' && event.record) {
        const rawId = event.record._id || event.record.id;
        if (rawId) {
          const detailKey = getDetailKey(event.collection, String(rawId));
          if (detailKey) queryClient.setQueryData(detailKey, normalizeWsRecord(event.collection, event.record));
        }
      }

      refreshRef.current(event as DataChangeEvent);
    }, subId);

    return () => {
      unsubscribeFromDataChanges(subId);
    };
  }, [subId]);
}
