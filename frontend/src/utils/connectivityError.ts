import { getConnectivityStatus } from '../services/networkSignals';

/** Truck / DO lookups fail here instead of spinning on the default API timeout. */
export const SEARCH_TIMEOUT_MS = 8_000;

/** After this, a still-running lookup tells the user we are waiting on the network. */
export const SLOW_SEARCH_HINT_MS = 1_500;

export type ConnectivityFailure = 'device-offline' | 'server-unreachable' | 'request-timeout';

export class LookupConnectionError extends Error {
  kind: ConnectivityFailure;

  constructor(kind: ConnectivityFailure) {
    super(connectivityMessage(kind));
    this.name = 'LookupConnectionError';
    this.kind = kind;
  }
}

export function connectivityMessage(kind: ConnectivityFailure): string {
  switch (kind) {
    case 'device-offline':
      return 'No internet connection. Check your network, then try again.';
    case 'server-unreachable':
      return "Can't reach the server. This is not an empty result — try again.";
    case 'request-timeout':
      return 'Search timed out. The connection is up, but the server took too long to answer — try again.';
  }
}

/** Short label for a table status cell. */
export function connectionStatusLabel(message: string): string {
  if (message.startsWith('No internet')) return 'No internet';
  if (message.startsWith('Search timed')) return 'Timed out';
  return "Can't reach server";
}

type AxiosLike = {
  code?: string;
  message?: string;
  name?: string;
  response?: unknown;
  kind?: ConnectivityFailure;
};

function isCanceled(error: AxiosLike): boolean {
  const code = error.code || '';
  const name = error.name || '';
  return code === 'ERR_CANCELED' || name === 'CanceledError' || name === 'AbortError';
}

function isTimeout(error: AxiosLike): boolean {
  const code = error.code || '';
  const name = error.name || '';
  const message = (error.message || '').toLowerCase();
  return (
    code === 'ECONNABORTED' ||
    code === 'ETIMEDOUT' ||
    name === 'TimeoutError' ||
    message.includes('timeout')
  );
}

/**
 * Transport failure only. An HTTP response (including 404 / 500) is not a
 * connection problem — the server answered.
 * Device offline wins over a timeout, because the browser already knows.
 */
export function classifyTransportError(error: unknown): ConnectivityFailure | null {
  if (error instanceof LookupConnectionError) return error.kind;

  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return 'device-offline';
  }

  const err = (error || {}) as AxiosLike;
  if (isCanceled(err)) return null;
  if (err.response) return null;
  if (isTimeout(err)) return 'request-timeout';
  if (error != null) return 'server-unreachable';
  return null;
}

/** Skip the request when we already know it cannot succeed. */
export function knownConnectivityBlock(): ConnectivityFailure | null {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return 'device-offline';
  const status = getConnectivityStatus();
  if (status === 'device-offline') return 'device-offline';
  if (status === 'api-unreachable') return 'server-unreachable';
  return null;
}

export function preemptLookup(): { warningType: 'connection'; message: string } | null {
  const blocked = knownConnectivityBlock();
  if (!blocked) return null;
  return { warningType: 'connection', message: connectivityMessage(blocked) };
}

export function connectionFromError(
  error: unknown
): { warningType: 'connection'; message: string } | null {
  const kind = classifyTransportError(error);
  if (!kind) return null;
  return { warningType: 'connection', message: connectivityMessage(kind) };
}

export function assertLookupReachable(): void {
  const blocked = knownConnectivityBlock();
  if (blocked) throw new LookupConnectionError(blocked);
}
