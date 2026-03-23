import { useCallback, useEffect, useRef, useState } from 'react';

export type ActionStatus = 'idle' | 'pending' | 'success' | 'error';

interface RunOptions {
  errorMessage?: string;
  resetAfterMs?: number;
}

export type ActionRunResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

const resolveErrorMessage = (error: any, fallback: string): string => {
  return error?.response?.data?.message || error?.message || fallback;
};

export function useActionState(initialStatus: ActionStatus = 'idle') {
  const [status, setStatus] = useState<ActionStatus>(initialStatus);
  const [error, setError] = useState<string | null>(null);
  const resetTimerRef = useRef<number | null>(null);

  const clearResetTimer = useCallback(() => {
    if (resetTimerRef.current) {
      window.clearTimeout(resetTimerRef.current);
      resetTimerRef.current = null;
    }
  }, []);

  const scheduleReset = useCallback((delayMs: number) => {
    clearResetTimer();
    resetTimerRef.current = window.setTimeout(() => {
      setStatus('idle');
    }, delayMs);
  }, [clearResetTimer]);

  const run = useCallback(async <T>(
    action: () => Promise<T>,
    options?: RunOptions
  ): Promise<ActionRunResult<T>> => {
    clearResetTimer();
    setStatus('pending');
    setError(null);

    try {
      const data = await action();
      setStatus('success');

      if (options?.resetAfterMs && options.resetAfterMs > 0) {
        scheduleReset(options.resetAfterMs);
      }

      return { ok: true, data };
    } catch (err: any) {
      const message = resolveErrorMessage(err, options?.errorMessage || 'Action failed');
      setError(message);
      setStatus('error');
      return { ok: false, error: message };
    }
  }, [clearResetTimer, scheduleReset]);

  const reset = useCallback(() => {
    clearResetTimer();
    setStatus('idle');
    setError(null);
  }, [clearResetTimer]);

  useEffect(() => {
    return () => clearResetTimer();
  }, [clearResetTimer]);

  return {
    status,
    error,
    isIdle: status === 'idle',
    isPending: status === 'pending',
    isSuccess: status === 'success',
    isError: status === 'error',
    setError,
    setStatus,
    run,
    reset,
  };
}
