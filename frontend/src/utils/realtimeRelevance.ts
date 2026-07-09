/**
 * Helpers to decide whether a real-time `create` event (single record or a bulk
 * scope descriptor) would actually land in the viewer's *current* filtered and
 * paginated list view. Used by the list pages to show a precise
 * "N new records — click to load" affordance instead of silently refetching.
 *
 * Design rule: when relevance can't be determined (missing dates, empty page,
 * active free-text search), we err toward SHOWING the pill — never toward
 * hiding new data from the user.
 */
import type { DataChangeEvent } from '../hooks/useRealtimeSync';

export interface ViewWindow {
  /** Rows currently rendered on the active page. */
  visibleRows: any[];
  /** Field the list is sorted by (the sort key used for pagination). */
  sortField: string;
  sortOrder: 'asc' | 'desc';
  /** 1-based current page number. */
  page: number;
  /** Total number of pages for the active filter. */
  totalPages: number;
}

export interface RelevanceMatchers {
  /** Field holding the record's sort/date value (usually the same as sortField). */
  dateField: string;
  /** Does a single created record match the currently-active filters? */
  matchesFilters: (record: any) => boolean;
  /** Does a bulk create's scope overlap the currently-active filters? */
  matchesBulk: (meta: NonNullable<DataChangeEvent['meta']>) => boolean;
}

function toTime(value: any): number | null {
  if (value == null) return null;
  const t = new Date(value).getTime();
  return Number.isNaN(t) ? null : t;
}

function toSortable(value: any, field: string): number | null {
  if (field === 'lpoSortNum' || field === 'lpoNo') {
    if (typeof value === 'number' && !Number.isNaN(value)) return value;
    const parsed = parseInt(String(value ?? '').split('/')[0], 10);
    return Number.isNaN(parsed) ? null : parsed;
  }
  return toTime(value);
}

/**
 * Compute the time window [lower, upper] covered by the current page. Returns
 * null when it can't be determined (empty page / no comparable sort values).
 * Boundaries open to ±Infinity on the first / last page so newest-or-oldest
 * inserts are correctly attributed to the edge pages.
 */
function pageWindow(view: ViewWindow): { lower: number; upper: number } | null {
  const times = view.visibleRows
    .map((r) => toSortable(
      r?.[view.sortField] ?? (view.sortField === 'lpoSortNum' ? r?.lpoNo : undefined),
      view.sortField,
    ))
    .filter((t): t is number => t != null);
  if (times.length === 0) return null;
  const max = Math.max(...times);
  const min = Math.min(...times);
  const isFirst = view.page <= 1;
  const isLast = view.page >= view.totalPages;
  if (view.sortOrder === 'desc') {
    return { upper: isFirst ? Infinity : max, lower: isLast ? -Infinity : min };
  }
  return { lower: isFirst ? -Infinity : min, upper: isLast ? Infinity : max };
}

function sameId(a: any, b: any): boolean {
  return String(a?._id ?? a?.id) === String(b?._id ?? b?.id);
}

/**
 * How many of the event's newly-created records are relevant to the current
 * view. 0 means "nothing the user is looking at changed — stay silent".
 */
export function countRelevantNewRecords(
  event: DataChangeEvent,
  view: ViewWindow,
  match: RelevanceMatchers,
): number {
  // Single created record with a full payload → exact test.
  if (event.record && !Array.isArray(event.record)) {
    // Already on the page (e.g. the creator's own row after their refetch).
    if (view.visibleRows.some(r => sameId(r, event.record))) return 0;
    if (!match.matchesFilters(event.record)) return 0;
    const sortField = match.dateField;
    const t = toSortable(
      event.record[sortField] ?? (sortField === 'lpoSortNum' ? event.record.lpoNo : undefined),
      sortField,
    );
    if (t == null) return 1; // no date to test landing → err toward showing
    const win = pageWindow(view);
    if (!win) return 1; // empty/unknown page → err toward showing
    return t >= win.lower && t <= win.upper ? 1 : 0;
  }

  // Bulk create → overlap test on the scope's date range.
  if (event.meta?.bulk) {
    if (!match.matchesBulk(event.meta)) return 0;
    const tMin = toTime(event.meta.dateMin);
    const tMax = toTime(event.meta.dateMax);
    if (tMin == null || tMax == null) return event.meta.count; // no range → err toward showing
    const win = pageWindow(view);
    if (!win) return event.meta.count; // empty/unknown page → err toward showing
    const overlaps = tMax >= win.lower && tMin <= win.upper;
    return overlaps ? event.meta.count : 0;
  }

  // Create with neither payload nor meta → can't tell, err toward showing one.
  return 1;
}
