import { useState, useEffect, useCallback } from 'react';

const STORAGE_PREFIX = 'fuel-order:';

/**
 * Drop-in replacement for useState that transparently persists state to
 * localStorage so filters and preferences survive page reloads.
 *
 * Usage:
 *   const [filterType, setFilterType] = usePersistedState('do:filterType', 'ALL');
 *
 * Keys are automatically namespaced with "fuel-order:" prefix to avoid
 * collisions with other data in localStorage.
 */
function usePersistedState<T>(
  key: string,
  defaultValue: T | (() => T)
): [T, React.Dispatch<React.SetStateAction<T>>] {
  const storageKey = STORAGE_PREFIX + key;

  const [state, setState] = useState<T>(() => {
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored !== null) {
        return JSON.parse(stored) as T;
      }
    } catch {
      // Corrupted storage value — fall through to default
    }
    return typeof defaultValue === 'function'
      ? (defaultValue as () => T)()
      : defaultValue;
  });

  // Persist every state change to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(state));
    } catch {
      // Quota exceeded or private-mode restriction — silently ignore
    }
  }, [storageKey, state]);

  const setPersistedState = useCallback<React.Dispatch<React.SetStateAction<T>>>(
    (action) => {
      setState((prev) => {
        const next =
          typeof action === 'function'
            ? (action as (prev: T) => T)(prev)
            : action;
        try {
          localStorage.setItem(storageKey, JSON.stringify(next));
        } catch {
          // Silently ignore
        }
        return next;
      });
    },
    [storageKey]
  );

  return [state, setPersistedState];
}

export default usePersistedState;
