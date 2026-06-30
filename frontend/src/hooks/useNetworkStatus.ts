import { useState, useEffect, useRef, useCallback } from 'react';

const POLL_ONLINE_MS = 15_000;  // relaxed when believed online
const POLL_OFFLINE_MS = 5_000;  // aggressive when believed offline
const FETCH_TIMEOUT_MS = 5_000;

async function checkConnectivity(): Promise<boolean> {
  try {
    const res = await fetch('/api/health', {
      method: 'HEAD',
      cache: 'no-store',
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export function useNetworkStatus() {
  const [isOnline, setIsOnline] = useState(true); // optimistic until first poll
  const [showReconnected, setShowReconnected] = useState(false);

  // ref so the poll closure always reads current state without stale closure issues
  const isOnlineRef = useRef(true);
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
      nextPoll = setTimeout(poll, online ? POLL_ONLINE_MS : POLL_OFFLINE_MS);
    };

    // browser offline event: trust it immediately (accurate ~60% of the time)
    const handleOffline = () => applyResult(false);
    // browser online event: don't trust blindly — kick off a real check instead
    const handleOnline = () => { clearTimeout(nextPoll); poll(); };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    poll(); // initial check on mount

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
