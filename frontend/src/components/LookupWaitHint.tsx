import { useEffect, useState } from 'react';
import { SLOW_SEARCH_HINT_MS } from '../utils/connectivityError';

/** Shown only after a lookup has already been waiting — a slow link, not an instant miss. */
export function LookupWaitHint({ active, className }: { active: boolean; className?: string }) {
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    if (!active) {
      setSlow(false);
      return;
    }
    const timer = setTimeout(() => setSlow(true), SLOW_SEARCH_HINT_MS);
    return () => clearTimeout(timer);
  }, [active]);

  if (!slow) return null;

  return (
    <span className={className ?? 'text-[10px] text-amber-700 dark:text-amber-400'}>
      Still trying to reach the server…
    </span>
  );
}
