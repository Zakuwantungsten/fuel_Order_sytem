/**
 * replaceState that keeps existing history.state (e.g. { tab }) so browser
 * back can still restore dashboard tabs after URL query cleanup.
 */
export function replaceUrlPreservingState(
  url: string,
  extraState?: Record<string, unknown>,
): void {
  const prev =
    window.history.state && typeof window.history.state === 'object'
      ? (window.history.state as Record<string, unknown>)
      : {};
  window.history.replaceState({ ...prev, ...extraState }, '', url);
}
