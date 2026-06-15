import { lazy, ComponentType } from 'react';

// When a new deployment happens, Vite assigns new content-hash filenames to chunks.
// Old clients (with the prior index.html cached) try to fetch the old chunk URLs,
// which no longer exist — the server returns the HTML 404 fallback instead, causing
// a MIME type error. The fix: on any dynamic-import failure, reload once so the
// browser fetches the new index.html and the new (valid) chunk URLs.
const RELOAD_KEY = 'chunk_load_error_reloaded_at';
const RELOAD_COOLDOWN_MS = 15_000; // don't reload more than once per 15s

function shouldReload(): boolean {
  const last = sessionStorage.getItem(RELOAD_KEY);
  if (!last) return true;
  return Date.now() - parseInt(last, 10) > RELOAD_COOLDOWN_MS;
}

export function lazyWithRetry<T extends ComponentType<any>>(
  factory: () => Promise<{ default: T }>
) {
  return lazy(() =>
    factory().catch((err: unknown) => {
      if (shouldReload()) {
        sessionStorage.setItem(RELOAD_KEY, Date.now().toString());
        window.location.reload();
        // Never resolves — the reload takes over
        return new Promise<{ default: T }>(() => {});
      }
      // Already reloaded recently; surface the error to any error boundary
      throw err;
    })
  );
}
