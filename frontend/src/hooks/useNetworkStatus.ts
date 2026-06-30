import { useState, useEffect, useRef, useCallback } from 'react';

const POLL_MS = 5_000;        // check every 5s — fast enough to feel instant
const FETCH_TIMEOUT_MS = 4_000;

async function checkConnectivity(): Promise<boolean> {
  // Quick shortcut: if the browser itself already knows we're offline, trust it
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
  // Start from whatever the browser currently believes, not optimistic true
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

    // offline event: trust it immediately AND reschedule poll sooner
    const handleOffline = () => {
      applyResult(false);
      clearTimeout(nextPoll);
      nextPoll = setTimeout(poll, POLL_MS);
    };
    // online event: don't trust blindly — run a real check first
    const handleOnline = () => { clearTimeout(nextPoll); poll(); };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    poll(); // run immediately on mount

    return () => {
      cancelled = true;
      clearTimeout(nextPoll);
      if (reconnectedTimer.current) clearTimeout(reconnectedTimer.current);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [applyResult]);

  return { isOnline, showReconnected };
}
