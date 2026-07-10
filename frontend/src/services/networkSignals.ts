import type { AxiosInstance } from 'axios';

/** Default Axios timeout — hung backends must fail instead of spinning forever. */
export const API_TIMEOUT_MS = 15_000;

/** Dispatched when a request fails with no HTTP response (offline, DNS, timeout, etc.). */
export const NETWORK_ERROR_EVENT = 'app:network-error';

/** Dispatched when connectivity recovers so the app can refetch + reconnect sockets. */
export const NETWORK_RECOVERED_EVENT = 'app:network-recovered';

export function signalNetworkError(): void {
  window.dispatchEvent(new Event(NETWORK_ERROR_EVENT));
}

export function signalNetworkRecovered(): void {
  window.dispatchEvent(new Event(NETWORK_RECOVERED_EVENT));
}

/** Attach transport-failure → banner signal on any Axios instance. */
export function attachTransportFailureSignal(client: AxiosInstance): void {
  client.interceptors.response.use(
    (response) => response,
    (error) => {
      if (!error.response) {
        signalNetworkError();
      }
      return Promise.reject(error);
    }
  );
}
