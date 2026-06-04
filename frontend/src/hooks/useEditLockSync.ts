import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  subscribeToLockChanges,
  unsubscribeFromLockChanges,
  LockChangeEvent,
} from '../services/websocket';
import { deliveryOrderKeys } from './useDeliveryOrders';
import { fuelRecordKeys } from './useFuelRecords';

/**
 * Map a WebSocket collection name → the React Query list-cache key family whose
 * rows show the "Editing: <name>" badge.
 */
const COLLECTION_LIST_KEYS: Record<string, () => ReadonlyArray<ReadonlyArray<unknown>>> = {
  delivery_orders: () => [deliveryOrderKeys.lists()],
  fuel_records: () => [fuelRecordKeys.lists()],
};

/**
 * Patch the `editLock` field of one record across all cached list pages.
 * List caches store their rows under either `orders` (DOs) or `records` (fuel),
 * so we patch whichever array is present without touching anything else.
 */
function patchEditLockInLists(
  queryClient: ReturnType<typeof useQueryClient>,
  listKeys: ReadonlyArray<ReadonlyArray<unknown>>,
  documentId: string,
  editLock: unknown,
): void {
  listKeys.forEach(listKey => {
    queryClient.setQueriesData({ queryKey: listKey as unknown[] }, (old: any) => {
      if (!old) return old;
      const arrayKey = Array.isArray(old.orders) ? 'orders' : Array.isArray(old.records) ? 'records' : null;
      if (!arrayKey) return old;
      const rows = old[arrayKey];
      const idx = rows.findIndex((r: any) => String(r._id ?? r.id) === documentId);
      if (idx === -1) return old;
      const next = [...rows];
      next[idx] = { ...next[idx], editLock };
      return { ...old, [arrayKey]: next };
    });
  });
}

/**
 * Subscribe to real-time edit-lock changes and update the "Editing: <name>"
 * badge in place — without refetching the list (lock activity is not a data
 * change). Pair this with the list query on pages that render `EditLockBadge`.
 */
export function useEditLockSync(collections: string | string[], id?: string): void {
  const queryClient = useQueryClient();
  const cols = Array.isArray(collections) ? collections : [collections];
  const subId = id || `lock-${cols.join('+')}`;

  useEffect(() => {
    subscribeToLockChanges((event: LockChangeEvent) => {
      if (!cols.includes(event.collection)) return;
      const factory = COLLECTION_LIST_KEYS[event.collection];
      if (!factory) return;

      const editLock = event.lock
        ? {
            lockedBy: event.lock.lockedBy,
            lockedByName: event.lock.lockedByName,
            lockedUntil: event.lock.lockedUntil,
          }
        : null;

      patchEditLockInLists(queryClient, factory(), event.documentId, editLock);
    }, subId);

    return () => unsubscribeFromLockChanges(subId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subId]);
}
