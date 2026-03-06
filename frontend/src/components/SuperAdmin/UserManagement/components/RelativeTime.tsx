import { useMemo } from 'react';
import {
  formatDistanceToNowStrict,
  isValid,
  parseISO,
  format,
} from 'date-fns';

interface RelativeTimeProps {
  date: string | Date | null | undefined;
  fallback?: string;
  className?: string;
}

export default function RelativeTime({
  date,
  fallback = 'Never',
  className = '',
}: RelativeTimeProps) {
  const { relative, absolute } = useMemo(() => {
    if (!date) return { relative: fallback, absolute: '' };
    const parsed = typeof date === 'string' ? parseISO(date) : date;
    if (!isValid(parsed)) return { relative: fallback, absolute: '' };
    return {
      relative: formatDistanceToNowStrict(parsed, { addSuffix: true }),
      absolute: format(parsed, 'PPpp'), // e.g., "Mar 6, 2026 at 2:30:45 PM"
    };
  }, [date, fallback]);

  if (!absolute) {
    return (
      <span className={`text-gray-400 dark:text-gray-500 ${className}`}>
        {relative}
      </span>
    );
  }

  return (
    <time
      dateTime={typeof date === 'string' ? date : date?.toISOString()}
      title={absolute}
      className={`cursor-default ${className}`}
    >
      {relative}
    </time>
  );
}
