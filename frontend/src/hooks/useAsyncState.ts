import { useCallback, useState } from 'react';

export type AsyncStatus = 'idle' | 'loading' | 'success' | 'error';

interface RunOptions {
  errorMessage?: string;
}

export type AsyncRunResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

const resolveErrorMessage = (error: any, fallback: string): string => {
  return error?.response?.data?.message || error?.message || fallback;
};

export function useAsyncState(initialStatus: AsyncStatus = 'idle') {
  const [status, setStatus] = useState<AsyncStatus>(initialStatus);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(async <T>(
    operation: () => Promise<T>,
    options?: RunOptions
  ): Promise<AsyncRunResult<T>> => {
    setStatus('loading');
    setError(null);

    try {
      const data = await operation();
      setStatus('success');
      return { ok: true, data };
    } catch (err: any) {
      const message = resolveErrorMessage(err, options?.errorMessage || 'Request failed');
      setError(message);
      setStatus('error');
      return { ok: false, error: message };
    }
  }, []);

  const reset = useCallback(() => {
    setStatus('idle');
    setError(null);
  }, []);

  return {
    status,
    error,
    isIdle: status === 'idle',
    isLoading: status === 'loading',
    isSuccess: status === 'success',
    isError: status === 'error',
    setError,
    setStatus,
    run,
    reset,
  };
}
