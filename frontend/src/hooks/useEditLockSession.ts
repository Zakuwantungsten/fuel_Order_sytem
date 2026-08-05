import { useEffect, useRef } from 'react';

export interface UseEditLockSessionOptions {
  /** Whether a lock session is currently active (form/row open). */
  active: boolean;
  /** Absolute expiry from the last successful acquire/renew. */
  lockedUntil: string | Date | null | undefined;
  /**
   * Called when the lock TTL elapses. Should exit edit mode immediately and
   * attempt to release the (already-expired) lock.
   */
  onExpire: () => void;
  /**
   * Optional renew while the session is open. Return the new lockedUntil so the
   * expiry timer can be reset. Failures are ignored — onExpire still fires at
   * the previous deadline if renew never succeeds.
   */
  renew?: () => Promise<{ lockedUntil?: string | Date } | void>;
  /** How often to renew. Default 3 minutes (lock TTL is 5 minutes). */
  renewEveryMs?: number;
}

/**
 * Keeps an acquired edit lock alive and exits edit mode the moment it expires —
 * no waiting for the user to hit Save and see a 409.
 */
export function useEditLockSession({
  active,
  lockedUntil,
  onExpire,
  renew,
  renewEveryMs = 3 * 60 * 1000,
}: UseEditLockSessionOptions): void {
  const onExpireRef = useRef(onExpire);
  const renewRef = useRef(renew);
  onExpireRef.current = onExpire;
  renewRef.current = renew;

  // Auto-exit when lockedUntil elapses
  useEffect(() => {
    if (!active || !lockedUntil) return;
    const untilMs = new Date(lockedUntil).getTime();
    if (Number.isNaN(untilMs)) return;
    const delay = Math.max(0, untilMs - Date.now());
    const timer = window.setTimeout(() => {
      onExpireRef.current();
    }, delay);
    return () => window.clearTimeout(timer);
  }, [active, lockedUntil]);

  // Renew while open so mid-edit sessions don't expire unexpectedly
  useEffect(() => {
    if (!active || !renewRef.current) return;
    const tick = async () => {
      try {
        await renewRef.current?.();
      } catch {
        /* silent — expiry timer still exits edit mode */
      }
    };
    const interval = window.setInterval(tick, renewEveryMs);
    return () => window.clearInterval(interval);
  }, [active, renewEveryMs]);
}
