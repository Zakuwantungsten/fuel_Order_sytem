/**
 * Tracks edit locks held by the current page so they can be released on
 * logout / pagehide before auth tokens are cleared.
 *
 * Uses fetch + keepalive (not axios) so the DELETE still goes out when the
 * tab is closing or navigating away.
 */

const API_BASE = import.meta.env.VITE_API_BASE_URL || '/api/v1';

export type HeldLockDescriptor = {
  /** Domain document id (LPO / DO / fuel record id). */
  documentId: string;
  /** API path segment, e.g. "lpo-documents", "fuel-records". */
  collectionPath: string;
  /** Optional per-entry lock scope. */
  entryId?: string;
};

type RegistryEntry = HeldLockDescriptor & { key: string };

const registry = new Map<string, RegistryEntry>();

function makeKey(desc: HeldLockDescriptor): string {
  return `${desc.collectionPath}:${desc.documentId}:${desc.entryId || ''}`;
}

/** Register (or refresh) a lock currently held by this client. */
export function registerHeldLock(desc: HeldLockDescriptor): string {
  const key = makeKey(desc);
  registry.set(key, { ...desc, key });
  return key;
}

/** Unregister a lock after a normal (awaited) release. */
export function unregisterHeldLock(keyOrDesc: string | HeldLockDescriptor): void {
  const key = typeof keyOrDesc === 'string' ? keyOrDesc : makeKey(keyOrDesc);
  registry.delete(key);
}

/** Clear the entire registry (after a bulk flush). */
export function clearHeldLocks(): void {
  registry.clear();
}

/**
 * Fire-and-forget DELETE with keepalive so the browser may still send it
 * during unload / logout navigation.
 */
export function releaseLockKeepalive(desc: HeldLockDescriptor): void {
  const token = sessionStorage.getItem('fuel_order_token');
  if (!token) return;

  const params = desc.entryId
    ? `?entryId=${encodeURIComponent(desc.entryId)}`
    : '';
  const url = `${API_BASE}/${desc.collectionPath}/${encodeURIComponent(desc.documentId)}/lock${params}`;

  try {
    void fetch(url, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${token}`,
      },
      credentials: 'include',
      keepalive: true,
    });
  } catch {
    /* best-effort — lock TTL will reclaim if this fails */
  }
}

/**
 * Release every registered lock via keepalive, then clear the registry.
 * Call this *before* clearing sessionStorage on logout.
 */
export function flushHeldLocksKeepalive(): void {
  for (const entry of registry.values()) {
    releaseLockKeepalive(entry);
  }
  registry.clear();
}
