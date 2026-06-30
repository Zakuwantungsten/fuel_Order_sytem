import { useState, useEffect, useRef, useCallback } from 'react';
import { getSocket } from '../services/websocket';

const POLL_MS = 3_000;
const FETCH_TIMEOUT_MS = 3_000;

async function checkConnectivity(): Promise<boolean> {
  if (!navigator.onLine) return false;
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

export function useNetworkStatus() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [showReconnected, setShowReconnected] = useState(false);
  const isOnlineRef = useRef(navigator.onLine);
  const reconnectedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const applyResult = useCallback((online: boolean) => {
    const was = isOnlineRef.current;
    isOnlineRef.current = online;
    if (online && !was) {
      if (reconnectedTimer.current) clearTimeout(reconnectedTimer.current);
      setIsOnline(true);
      setShowReconnected(true);
      reconnectedTimer.current = setTimeout(() => setShowReconnected(false), 3000);
    } else if (!online && was) {
      setIsOnline(false);
      setShowReconnected(false);
      if (reconnectedTimer.current) clearTimeout(reconnectedTimer.current);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    let nextPoll: ReturnType<typeof setTimeout>;

    const poll = async () => {
      if (cancelled) return;
      const online = await checkConnectivity();
      if (cancelled) return;
      applyResult(online);
      nextPoll = setTimeout(poll, POLL_MS);
    };

    const schedulePoll = () => { clearTimeout(nextPoll); nextPoll = setTimeout(poll, POLL_MS); };

    // Layer 1 — Browser events: instant when the OS fires them (unreliable for hotspots)
    const handleOffline = () => { applyResult(false); schedulePoll(); };
    const handleOnline  = () => { clearTimeout(nextPoll); poll(); };
    window.addEventListener('online',  handleOnline);
    window.addEventListener('offline', handleOffline);

    // Layer 2 — Socket.io: fires within ~1s of network drop (TCP fails fast).
    // Kick a poll rather than trusting the disconnect reason blindly — server
    // restarts and auth expiry also disconnect the socket.
    const sock = getSocket();
    const handleSocketDisconnect = () => { clearTimeout(nextPoll); poll(); };
    const handleSocketConnect    = () => { clearTimeout(nextPoll); poll(); };
    sock?.on('disconnect', handleSocketDisconnect);
    sock?.on('connect',    handleSocketConnect);

    // Layer 3 — Axios network errors: any API call that fails with no response
    // (transport failure) dispatches 'app:network-error' from api.ts — the same
    // technique Offline.js (HubSpot) uses to get instant detection from real requests.
    const handleNetworkError = () => { clearTimeout(nextPoll); poll(); };
    window.addEventListener('app:network-error', handleNetworkError);

    poll(); // initial check on mount

    return () => {
      cancelled = true;
      clearTimeout(nextPoll);
      if (reconnectedTimer.current) clearTimeout(reconnectedTimer.current);
      window.removeEventListener('online',  handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('app:network-error', handleNetworkError);
      sock?.off('disconnect', handleSocketDisconnect);
      sock?.off('connect',    handleSocketConnect);
    };
  }, [applyResult]);

  return { isOnline, showReconnected };
}
