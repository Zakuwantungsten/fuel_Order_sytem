import { useState, useEffect, useRef, useCallback } from 'react';
import { useQueryClient, onlineManager } from '@tanstack/react-query';
import { getSocket, ensureWebSocketConnected } from '../services/websocket';
import {
  NETWORK_ERROR_EVENT,
  NETWORK_RECOVERED_EVENT,
  signalNetworkRecovered,
} from '../services/networkSignals';

const POLL_MS = 3_000;
const FETCH_TIMEOUT_MS = 3_000;

export type ConnectivityStatus = 'online' | 'device-offline' | 'api-unreachable';

async function checkApiReachable(): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch('/api/health', {
      method: 'HEAD',
      cache: 'no-store',
      signal: controller.signal,
    });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

async function resolveStatus(): Promise<ConnectivityStatus> {
  if (!navigator.onLine) return 'device-offline';
  const reachable = await checkApiReachable();
  return reachable ? 'online' : 'api-unreachable';
}

export function useNetworkStatus() {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<ConnectivityStatus>(
    navigator.onLine ? 'online' : 'device-offline'
  );
  const [showReconnected, setShowReconnected] = useState(false);
  const statusRef = useRef<ConnectivityStatus>(navigator.onLine ? 'online' : 'device-offline');
  const reconnectedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const applyResult = useCallback((next: ConnectivityStatus) => {
    const was = statusRef.current;
    statusRef.current = next;
    const wasDown = was !== 'online';
    const isUp = next === 'online';

    // Keep React Query's onlineManager in sync so refetchOnReconnect fires
    // when the API comes back even if the browser never flipped offline.
    onlineManager.setOnline(isUp);

    if (isUp && wasDown) {
      if (reconnectedTimer.current) clearTimeout(reconnectedTimer.current);
      setStatus('online');
      setShowReconnected(true);
      reconnectedTimer.current = setTimeout(() => setShowReconnected(false), 3000);
      // Recovery: refetch stale queries + bring the socket back.
      signalNetworkRecovered();
      ensureWebSocketConnected();
      void queryClient.invalidateQueries();
    } else if (!isUp && was === 'online') {
      setStatus(next);
      setShowReconnected(false);
      if (reconnectedTimer.current) clearTimeout(reconnectedTimer.current);
    } else if (next !== was) {
      setStatus(next);
    }
  }, [queryClient]);

  useEffect(() => {
    let cancelled = false;
    let nextPoll: ReturnType<typeof setTimeout>;

    const poll = async () => {
      if (cancelled) return;
      const next = await resolveStatus();
      if (cancelled) return;
      applyResult(next);
      nextPoll = setTimeout(poll, POLL_MS);
    };

    const schedulePoll = () => {
      clearTimeout(nextPoll);
      nextPoll = setTimeout(poll, POLL_MS);
    };

    // Layer 1 — Browser events (device internet only; unreliable alone)
    const handleOffline = () => {
      applyResult('device-offline');
      schedulePoll();
    };
    const handleOnline = () => {
      clearTimeout(nextPoll);
      void poll();
    };
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Layer 2 — Socket.io: early warning; confirm with health poll
    const sock = getSocket();
    const handleSocketDisconnect = () => {
      clearTimeout(nextPoll);
      void poll();
    };
    const handleSocketConnect = () => {
      clearTimeout(nextPoll);
      void poll();
    };
    sock?.on('disconnect', handleSocketDisconnect);
    sock?.on('connect', handleSocketConnect);

    // Layer 3 — Axios / fetch transport failures (instant, no wait for poll)
    const handleNetworkError = () => {
      clearTimeout(nextPoll);
      void poll();
    };
    window.addEventListener(NETWORK_ERROR_EVENT, handleNetworkError);

    // External recovery listeners (e.g. other tabs / future hooks)
    const handleRecovered = () => {
      ensureWebSocketConnected();
    };
    window.addEventListener(NETWORK_RECOVERED_EVENT, handleRecovered);

    void poll();

    return () => {
      cancelled = true;
      clearTimeout(nextPoll);
      if (reconnectedTimer.current) clearTimeout(reconnectedTimer.current);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener(NETWORK_ERROR_EVENT, handleNetworkError);
      window.removeEventListener(NETWORK_RECOVERED_EVENT, handleRecovered);
      sock?.off('disconnect', handleSocketDisconnect);
      sock?.off('connect', handleSocketConnect);
    };
  }, [applyResult]);

  const isOnline = status === 'online';

  return { status, isOnline, showReconnected };
}
