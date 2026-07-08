import { useEffect, useState } from 'react';

// How often (ms) to check whether a newer build has been deployed.
const POLL_INTERVAL_MS = 60_000;
// Delay before the first check so we don't fire during initial page load.
const INITIAL_DELAY_MS = 15_000;

// Vite injects the app entry as a hashed module script into index.html
// (e.g. <script type="module" src="/assets/index-a1b2c3.js">). When code is
// redeployed the hash changes, so comparing this src is a reliable, build-tool
// agnostic way to detect that a new version is live.
function extractEntrySrc(html: string): string | null {
  const match = html.match(/<script[^>]*type="module"[^>]*src="([^"]+)"[^>]*>/i);
  return match?.[1] ?? null;
}

/**
 * Detects when a newer frontend build has been deployed while the current tab
 * is still running the old bundle. Returns true once a new version is found.
 *
 * Strategy: remember the entry-script URL of the running document, then poll
 * index.html (uncached) and compare. No backend or build-config changes needed —
 * it relies on Vite's content-hashed filenames + the no-cache index.html.
 */
export function useVersionCheck(): boolean {
  const [updateAvailable, setUpdateAvailable] = useState(false);

  useEffect(() => {
    // In dev, Vite HMR already handles updates and the entry is /src/main.tsx.
    if (import.meta.env.DEV) return;

    const currentEntry = (
      document.querySelector('script[type="module"][src]') as HTMLScriptElement | null
    )?.getAttribute('src') ?? null;

    // If we can't identify the running entry, there's nothing reliable to compare.
    if (!currentEntry) return;

    let stopped = false;

    const check = async () => {
      if (stopped || document.visibilityState !== 'visible') return;
      try {
        const res = await fetch(`${import.meta.env.BASE_URL || '/'}?v=${Date.now()}`, {
          cache: 'no-store',
          headers: { 'Cache-Control': 'no-cache' },
        });
        if (!res.ok) return;
        const html = await res.text();
        const latestEntry = extractEntrySrc(html);
        if (latestEntry && latestEntry !== currentEntry) {
          setUpdateAvailable(true);
          stopped = true; // stop polling once an update is detected
        }
      } catch {
        // Offline / transient network error — ignore and retry next tick.
      }
    };

    const intervalId = window.setInterval(check, POLL_INTERVAL_MS);
    const initialId = window.setTimeout(check, INITIAL_DELAY_MS);
    // Re-check when the user returns to the tab, so long-idle tabs update promptly.
    const onVisible = () => {
      if (document.visibilityState === 'visible') check();
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      stopped = true;
      window.clearInterval(intervalId);
      window.clearTimeout(initialId);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  return updateAvailable;
}
