import { useMemo, useState, useRef, useEffect, useCallback, useLayoutEffect, useId, useDeferredValue, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import {
  Plus,
  Download,
  Upload,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  FileSpreadsheet,
  ArrowLeft,
  Loader2,
  Save,
  ChevronDown,
  Check,
  Clock,
  List,
} from 'lucide-react';
import { toast } from 'react-toastify';
import { useActiveFuelStations } from '../hooks/useFuelStations';
import usePersistedState from '../hooks/usePersistedState';
import {
  useReconciliationMutations,
  useReconciliationSession,
  useReconciliationSessionLines,
  useReconciliationLineFilterOptions,
  useReconciliationStatementRows,
  useReconciliationStatementFilterOptions,
  useReconciliationMatchCandidates,
  useReconciliationSessions,
  usePendingLpoEntries,
  useReconciliationStationsInRange,
} from '../hooks/useReconciliation';
import {
  reconciliationAPI,
  PendingLpoEntry,
  ReconciliationLine,
  ReconciliationStatementRow,
  ReconciliationSession,
  StatementStationValidation,
} from '../services/api';
import { isYardStation } from '../utils/yardStations';
import ConfirmModal from './SuperAdmin/ConfirmModal';

type ReconcileSubTab = 'sessions' | 'pending' | 'dropped';
type LineFilter = 'all' | 'matched' | 'pending' | 'exceptions';
type LineSortKey = 'lpoTruck' | 'stmtTruck' | 'station' | 'lpoLiters' | 'stmtLiters' | 'status' | 'stmtRow' | 'lpoDate';
type PendingSortKey = 'lpoDate' | 'lpoTruck' | 'station' | 'lpoLiters' | 'lpoNo';
type StmtFilter = 'all' | 'matched' | 'unmatched' | 'exceptions' | 'dropped';
type StmtSortKey = 'stmtRow' | 'truck' | 'station' | 'stmtLiters' | 'lpoLiters' | 'status' | 'date';
type SessionDetailTableView = 'lines' | 'variance';
type SessionStatusFilter = '' | ReconciliationSession['status'];
type LinkModalState = {
  source: 'lpo' | 'statement';
  lpoLineIds: string[];
  statementIndexes: number[];
};

const EXCEPTION_CODE_LABELS: Record<string, string> = {
  TRUCK_STATION_LITER_MISMATCH: 'Truck/station match — liters differ',
  LPO_NOT_ON_STATEMENT: 'LPO not on statement',
  PENDING_LPO_NOT_ON_STATEMENT: 'Pending LPO not on statement',
  STATEMENT_TRUCK_NOT_IN_LPO: 'Statement truck not in LPO',
  STATEMENT_STATION_OUT_OF_SCOPE: 'Statement station out of scope',
  LITER_MISMATCH: 'Liter mismatch',
  MERGE_MATCH: 'Merge match candidate',
  SPLIT_MATCH: 'Split match candidate',
  STALE_PENDING_MATCH: 'Stale pending match',
  STATEMENT_STATION_FLAGGED: 'Statement station flagged',
  DUPLICATE_STATEMENT_LOCKED: 'Duplicate of matched statement — locked',
  AWAITING_STATEMENT: 'Awaiting statement',
};

const FILTER_SELECT_CLASS =
  'shrink-0 w-[140px] px-3 h-[34px] text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100';

function monthToDateRange(month: string): { from: string; to: string } {
  if (!month || !/^\d{4}-\d{2}$/.test(month)) return { from: '', to: '' };
  const [year, monthNum] = month.split('-').map(Number);
  const lastDay = new Date(year, monthNum, 0).getDate();
  return {
    from: `${month}-01`,
    to: `${month}-${String(lastDay).padStart(2, '0')}`,
  };
}

const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200',
  in_progress: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200',
  completed: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200',
  dropped: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200',
};

const MATCH_COLORS: Record<string, string> = {
  matched: 'text-green-600 dark:text-green-400',
  manual_matched: 'text-green-700 dark:text-green-300',
  rectified: 'text-teal-600 dark:text-teal-400',
  unmatched_lpo: 'text-amber-600 dark:text-amber-400',
  unmatched_statement: 'text-orange-600 dark:text-orange-400',
  liter_mismatch: 'text-red-600 dark:text-red-400',
  stale_pending: 'text-purple-600 dark:text-purple-400',
  split_merge_candidate: 'text-indigo-600 dark:text-indigo-400',
  dropped: 'text-gray-500 dark:text-gray-400',
};

const DEFAULT_CREATE_FORM = {
  title: '',
  stations: [] as string[],
  dateFrom: '',
  dateTo: '',
  pendingMode: 'none' as ReconciliationSession['pendingMode'],
  pendingDateFrom: '',
  pendingDateTo: '',
  staleMatchThresholdDays: 45,
};

function sessionId(s: ReconciliationSession): string {
  return s.id || s._id || '';
}

function displayTruck(line: ReconciliationLine | PendingLpoEntry, side?: 'lpo' | 'stmt'): string {
  if ('lpoTruckNoRaw' in line && line.lpoTruckNoRaw) return line.lpoTruckNoRaw;
  if (side === 'stmt' && 'statementTruckNoRaw' in line) {
    return (line as ReconciliationLine).statementTruckNoRaw || (line as ReconciliationLine).statementTruckNo || '—';
  }
  return line.lpoTruckNo || '—';
}

function formatShortDate(value?: string | null): string {
  if (!value) return '—';
  const raw = String(value).trim();
  // Prefer YYYY-MM-DD (or ISO prefix)
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  let d: Date | null = null;
  if (iso) {
    d = new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
  } else {
    const parsed = new Date(raw);
    if (!Number.isNaN(parsed.getTime())) d = parsed;
  }
  if (!d || Number.isNaN(d.getTime())) return raw;
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${d.getDate()}-${months[d.getMonth()]}`;
}

function stmtRowLabel(line: ReconciliationLine): string {
  if (line.statementRowNumber) return `Row ${line.statementRowNumber}`;
  if (line.statementLineIndexes?.length) {
    return line.statementLineIndexes.map((i) => `Row ${i + 2}`).join(', ');
  }
  return '—';
}

const TRUNCATE_TOOLTIP_MIN = 18;

function cellDisplay(value?: string | number | null): string {
  if (value == null || value === '') return '—';
  return String(value);
}

function truncateHoverTitle(text: string, minLength = TRUNCATE_TOOLTIP_MIN): string | undefined {
  if (!text || text === '—' || text.length <= minLength) return undefined;
  return text;
}

function TruncateTd({
  text,
  className = '',
  align = 'left',
  title,
  children,
}: {
  text?: string | number | null;
  className?: string;
  align?: 'left' | 'right';
  title?: string;
  children?: ReactNode;
}) {
  const display = cellDisplay(text);
  const tip = title !== undefined ? title || undefined : truncateHoverTitle(display);
  return (
    <td
      className={`px-3 py-1 leading-5 h-8 max-w-0 truncate text-xs align-middle ${align === 'right' ? 'text-right' : 'text-left'} ${className}`}
      title={tip}
    >
      <span className="block truncate leading-5">{children ?? display}</span>
    </td>
  );
}

/** Sentinel that loads the next page when scrolled into view inside `rootRef`. */
function InfiniteScrollSentinel({
  rootRef,
  hasNextPage,
  isFetchingNextPage,
  fetchNextPage,
  colSpan,
}: {
  rootRef: RefObject<HTMLElement | null>;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  fetchNextPage: () => void;
  colSpan: number;
}) {
  const sentinelRef = useRef<HTMLTableRowElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    const target = sentinelRef.current;
    if (!root || !target || !hasNextPage) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && hasNextPage && !isFetchingNextPage) {
          fetchNextPage();
        }
      },
      { root, rootMargin: '160px', threshold: 0 }
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [rootRef, hasNextPage, isFetchingNextPage, fetchNextPage]);

  if (!hasNextPage && !isFetchingNextPage) return null;

  return (
    <tr ref={sentinelRef}>
      <td colSpan={colSpan} className="px-4 py-3 text-center text-xs text-gray-500">
        {isFetchingNextPage ? (
          <span className="inline-flex items-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin" />
            Loading more…
          </span>
        ) : (
          'Scroll for more'
        )}
      </td>
    </tr>
  );
}

function TableFetchOverlay({ show }: { show: boolean }) {
  if (!show) return null;
  return (
    <div className="absolute inset-0 z-10 flex items-start justify-center bg-white/55 dark:bg-gray-900/55 pt-16 pointer-events-none">
      <span className="inline-flex items-center gap-2 rounded-md bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 px-3 py-1.5 text-sm text-gray-700 dark:text-gray-200 shadow-sm">
        <Loader2 className="w-4 h-4 animate-spin" />
        Updating…
      </span>
    </div>
  );
}

const TOOLBAR_BTN =
  'inline-flex items-center px-3 py-1.5 text-sm border rounded-md dark:border-gray-600 disabled:opacity-50 disabled:cursor-not-allowed';
const TOOLBAR_BTN_GREEN =
  'inline-flex items-center px-3 py-1.5 text-sm rounded-md text-white bg-green-600 hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-green-600';
const TOOLBAR_BTN_RED =
  'inline-flex items-center px-3 py-1.5 text-sm rounded-md text-white bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed';

function formatMatchedRatio(summary?: ReconciliationSession['summary']): string {
  if (!summary) return '—';
  const matched = summary.matchedLpoLines ?? summary.matched ?? 0;
  const total = summary.totalStatementLines ?? summary.totalLpoLines ?? 0;
  return `${matched}/${total}`;
}

function isReconciledLine(line: ReconciliationLine): boolean {
  return ['matched', 'rectified', 'manual_matched'].includes(line.matchStatus);
}

function lineIsSelectable(line: ReconciliationLine): boolean {
  if (isReconciledLine(line)) return false;
  return !!line.lpoEntryId;
}

function sessionIsOpen(status: ReconciliationSession['status']): boolean {
  return status === 'draft' || status === 'in_progress';
}

function stationsEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const sortedA = [...a].sort();
  const sortedB = [...b].sort();
  return sortedA.every((v, i) => v === sortedB[i]);
}

function sessionScopeEqual(
  stations: string[],
  dateFrom: string,
  dateTo: string,
  session?: ReconciliationSession | null
): boolean {
  if (!session) return true;
  return (
    stationsEqual(stations, session.stations || []) &&
    dateFrom === (session.dateFrom || '') &&
    dateTo === (session.dateTo || '')
  );
}

function SortableTh({
  label,
  sortKey,
  activeKey,
  dir,
  onSort,
  align = 'left',
}: {
  label: string;
  sortKey: string;
  activeKey: string;
  dir: 'asc' | 'desc';
  onSort: (key: string) => void;
  align?: 'left' | 'right';
}) {
  const active = activeKey === sortKey;
  return (
    <th
      className={`px-3 py-1.5 text-xs font-medium text-gray-500 dark:text-gray-100 uppercase tracking-wider cursor-pointer select-none whitespace-nowrap ${
        align === 'right' ? 'text-right' : 'text-left'
      }`}
      onClick={() => onSort(sortKey)}
    >
      <span className="inline-flex items-center gap-0.5">
        {label}
        {active && <span className="text-[10px] normal-case">{dir === 'asc' ? '↑' : '↓'}</span>}
      </span>
    </th>
  );
}

type ConfirmDialogState = {
  title: string;
  message: string;
  variant: 'danger' | 'warning';
  confirmLabel?: string;
  onConfirm: () => Promise<void>;
};

function StationMultiSelect({
  options,
  selected,
  onChange,
  label = 'Stations',
  compact = false,
  customStations = [] as string[],
  optionCounts,
}: {
  options: string[];
  selected: string[];
  onChange: (next: string[]) => void;
  label?: string;
  compact?: boolean;
  customStations?: string[];
  optionCounts?: Record<string, number>;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();
  const [menuStyle, setMenuStyle] = useState<React.CSSProperties>({});

  const customSet = useMemo(
    () => new Set(customStations.map((s) => s.toUpperCase())),
    [customStations]
  );

  useLayoutEffect(() => {
    if (!open || !buttonRef.current) return;
    const updatePosition = () => {
      const rect = buttonRef.current!.getBoundingClientRect();
      setMenuStyle({
        position: 'fixed',
        top: rect.bottom + 4,
        left: rect.left,
        width: Math.max(rect.width, 260),
        zIndex: 9999,
      });
    };
    updatePosition();
    window.addEventListener('resize', updatePosition);
    return () => {
      window.removeEventListener('resize', updatePosition);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (ref.current?.contains(target)) return;
      if (document.getElementById(menuId)?.contains(target)) return;
      setOpen(false);
    };
    const handleScroll = (event: Event) => {
      const target = event.target as Node;
      if (ref.current?.contains(target)) return;
      if (document.getElementById(menuId)?.contains(target)) return;
      setOpen(false);
    };
    const scrollEl = document.getElementById('main-scroll-container');
    document.addEventListener('mousedown', handler);
    window.addEventListener('scroll', handleScroll, true);
    scrollEl?.addEventListener('scroll', handleScroll);
    return () => {
      document.removeEventListener('mousedown', handler);
      window.removeEventListener('scroll', handleScroll, true);
      scrollEl?.removeEventListener('scroll', handleScroll);
    };
  }, [open, menuId]);

  const allSelected = options.length > 0 && selected.length === options.length;

  const menu = open ? (
    <div
      id={menuId}
      style={menuStyle}
      className="max-h-64 overflow-y-auto rounded-md border dark:border-gray-600 bg-white dark:bg-gray-800 shadow-xl p-2"
    >
      <div className="flex gap-2 mb-2 pb-2 border-b dark:border-gray-700">
        <button
          type="button"
          className="text-xs px-2 py-1 rounded bg-blue-100 dark:bg-blue-900/40 text-blue-800 dark:text-blue-200"
          onClick={() => onChange([...options])}
        >
          Select all
        </button>
        <button
          type="button"
          className="text-xs px-2 py-1 rounded bg-gray-100 dark:bg-gray-700"
          onClick={() => onChange([])}
        >
          Clear
        </button>
      </div>
      {options.map((name) => {
        const checked = selected.includes(name);
        const isCustom = customSet.has(name.toUpperCase());
        return (
          <label
            key={name}
            className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer text-sm"
          >
            <input
              type="checkbox"
              checked={checked}
              onChange={() =>
                onChange(checked ? selected.filter((s) => s !== name) : [...selected, name])
              }
              className="rounded"
            />
            <span className="truncate flex-1">
              {name}
              {optionCounts?.[name] != null ? `: ${optionCounts[name]}` : ''}
            </span>
            {isCustom && (
              <span className="text-[10px] px-1 py-0.5 rounded bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300 shrink-0">
                custom
              </span>
            )}
          </label>
        );
      })}
      {allSelected && options.length > 0 && (
        <p className="text-xs text-green-600 mt-2 flex items-center gap-1">
          <Check className="w-3 h-3" /> All selected
        </p>
      )}
    </div>
  ) : null;

  return (
    <div className="relative min-w-0" ref={ref}>
      <span className={`${compact ? 'text-[10px]' : 'text-xs'} text-gray-500 dark:text-gray-400`}>
        {label}
      </span>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`${
          compact ? 'mt-0.5 h-[34px] py-0' : 'mt-1 py-2'
        } w-full flex items-center justify-between rounded border dark:border-gray-600 dark:bg-gray-900 px-2 text-sm text-left box-border`}
      >
        <span className="truncate">
          {selected.length === 0
            ? 'Select…'
            : selected.length === options.length
              ? `All (${options.length})`
              : `${selected.length} selected`}
        </span>
        <ChevronDown className="w-4 h-4 shrink-0 ml-1" />
      </button>
      {menu && createPortal(menu, document.body)}
    </div>
  );
}

/** Compact searchable multi-select for filter bars (truck / station / details). */
function FilterMultiSelect({
  options,
  selected,
  onChange,
  placeholder,
  searchable = false,
  searchPlaceholder = 'Search…',
  widthClass = 'w-[180px]',
  optionLabels,
}: {
  options: string[];
  selected: string[];
  onChange: (next: string[]) => void;
  placeholder: string;
  searchable?: boolean;
  searchPlaceholder?: string;
  widthClass?: string;
  optionLabels?: Record<string, string>;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const menuId = useId();
  const [menuStyle, setMenuStyle] = useState<React.CSSProperties>({});

  const labelFor = (value: string) => optionLabels?.[value] || value;

  const filteredOptions = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => {
      const label = labelFor(o).toLowerCase();
      return label.includes(q) || o.toLowerCase().includes(q);
    });
  }, [options, query, optionLabels]);

  useLayoutEffect(() => {
    if (!open || !buttonRef.current) return;
    const updatePosition = () => {
      const rect = buttonRef.current!.getBoundingClientRect();
      setMenuStyle({
        position: 'fixed',
        top: rect.bottom + 4,
        left: rect.left,
        width: Math.max(rect.width, searchable ? 320 : 220),
        zIndex: 9999,
      });
    };
    updatePosition();
    window.addEventListener('resize', updatePosition);
    return () => window.removeEventListener('resize', updatePosition);
  }, [open, searchable]);

  useEffect(() => {
    if (!open) {
      setQuery('');
      return;
    }
    if (searchable) {
      requestAnimationFrame(() => searchRef.current?.focus());
    }
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (ref.current?.contains(target)) return;
      if (document.getElementById(menuId)?.contains(target)) return;
      setOpen(false);
    };
    const handleScroll = (event: Event) => {
      const target = event.target as Node;
      if (ref.current?.contains(target)) return;
      if (document.getElementById(menuId)?.contains(target)) return;
      setOpen(false);
    };
    const scrollEl = document.getElementById('main-scroll-container');
    document.addEventListener('mousedown', handler);
    window.addEventListener('scroll', handleScroll, true);
    scrollEl?.addEventListener('scroll', handleScroll);
    return () => {
      document.removeEventListener('mousedown', handler);
      window.removeEventListener('scroll', handleScroll, true);
      scrollEl?.removeEventListener('scroll', handleScroll);
    };
  }, [open, menuId, searchable]);

  const label =
    selected.length === 0
      ? placeholder
      : selected.length === 1
        ? labelFor(selected[0])
        : `${selected.length} selected`;

  const menu = open ? (
    <div
      id={menuId}
      style={menuStyle}
      className="max-h-72 overflow-hidden rounded-md border dark:border-gray-600 bg-white dark:bg-gray-800 shadow-xl flex flex-col"
    >
      {searchable && (
        <div className="p-2 border-b dark:border-gray-700 shrink-0">
          <input
            ref={searchRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={searchPlaceholder}
            className="w-full px-2 py-1.5 text-sm border rounded-md dark:border-gray-600 dark:bg-gray-900"
          />
        </div>
      )}
      <div className="flex gap-2 p-2 border-b dark:border-gray-700 shrink-0">
        <button
          type="button"
          className="text-xs px-2 py-1 rounded bg-blue-100 dark:bg-blue-900/40 text-blue-800 dark:text-blue-200"
          onClick={() => onChange([...options])}
        >
          Select all
        </button>
        <button
          type="button"
          className="text-xs px-2 py-1 rounded bg-gray-100 dark:bg-gray-700"
          onClick={() => onChange([])}
        >
          Clear
        </button>
      </div>
      <div className="overflow-y-auto p-2 max-h-52">
        {filteredOptions.length === 0 ? (
          <p className="text-xs text-gray-500 px-2 py-2">No matches</p>
        ) : (
          filteredOptions.map((name) => {
            const checked = selected.includes(name);
            return (
              <label
                key={name}
                className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer text-sm"
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() =>
                    onChange(checked ? selected.filter((s) => s !== name) : [...selected, name])
                  }
                  className="rounded shrink-0"
                />
                <span className="truncate text-xs" title={labelFor(name)}>
                  {labelFor(name)}
                </span>
              </label>
            );
          })
        )}
      </div>
    </div>
  ) : null;

  return (
    <div className={`relative shrink-0 ${widthClass}`} ref={ref}>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full h-[34px] flex items-center justify-between rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 text-sm text-left text-gray-900 dark:text-gray-100"
        aria-label={placeholder}
      >
        <span className={`truncate ${selected.length === 0 ? 'text-gray-500' : ''}`}>{label}</span>
        <ChevronDown className="w-4 h-4 shrink-0 ml-1 opacity-70" />
      </button>
      {menu && createPortal(menu, document.body)}
    </div>
  );
}

function NewReconciliationModal({
  open,
  onClose,
  form,
  setForm,
  stationOptions,
  customStations,
  pendingPreviewCount,
  onRequestCreate,
  creating,
  onStationsUserChange,
}: {
  open: boolean;
  onClose: () => void;
  form: typeof DEFAULT_CREATE_FORM;
  setForm: React.Dispatch<React.SetStateAction<typeof DEFAULT_CREATE_FORM>>;
  stationOptions: string[];
  customStations: string[];
  pendingPreviewCount: number;
  onRequestCreate: () => void;
  creating: boolean;
  onStationsUserChange?: () => void;
}) {
  const pendingDatesDisabled = form.pendingMode !== 'date_range';

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={() => !creating && onClose()} />
      <div className="relative bg-white dark:bg-gray-800 rounded-xl shadow-xl border dark:border-gray-700 w-full max-w-lg overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b dark:border-gray-700">
          <h3 className="font-semibold text-gray-900 dark:text-gray-100">New reconciliation</h3>
          <button
            type="button"
            disabled={creating}
            onClick={onClose}
            className="text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
          >
            Cancel
          </button>
        </div>

        <div className="px-5 py-4 space-y-3">
          <div className="grid grid-cols-2 gap-x-3 gap-y-2">
            <label className="block col-span-2">
              <span className="text-[10px] text-gray-500">Title (optional)</span>
              <input
                className="mt-0.5 w-full rounded border dark:border-gray-600 dark:bg-gray-900 px-2 py-1.5 text-sm"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="e.g. Lake Petroleum Jan 2026"
              />
            </label>
            <label className="block">
              <span className="text-[10px] text-gray-500">LPO from</span>
              <input
                type="date"
                className="mt-0.5 w-full rounded border dark:border-gray-600 dark:bg-gray-900 px-2 py-1.5 text-sm"
                value={form.dateFrom}
                onChange={(e) => setForm({ ...form, dateFrom: e.target.value })}
              />
            </label>
            <label className="block">
              <span className="text-[10px] text-gray-500">LPO to</span>
              <input
                type="date"
                className="mt-0.5 w-full rounded border dark:border-gray-600 dark:bg-gray-900 px-2 py-1.5 text-sm"
                value={form.dateTo}
                onChange={(e) => setForm({ ...form, dateTo: e.target.value })}
              />
            </label>
            <div className="col-span-2">
              <StationMultiSelect
                compact
                label="Stations"
                options={stationOptions}
                customStations={customStations}
                selected={form.stations}
                onChange={(stations) => {
                  onStationsUserChange?.();
                  setForm({ ...form, stations });
                }}
              />
            </div>
            <label className="block">
              <span className="text-[10px] text-gray-500">Pending entries</span>
              <select
                className="mt-0.5 w-full rounded border dark:border-gray-600 dark:bg-gray-900 px-2 py-1.5 text-sm"
                value={form.pendingMode}
                onChange={(e) =>
                  setForm({ ...form, pendingMode: e.target.value as ReconciliationSession['pendingMode'] })
                }
              >
                <option value="none">None</option>
                <option value="all">All pending</option>
                <option value="date_range">By date</option>
              </select>
            </label>
            <label
              className="block"
              title="Pending carry-forward matches older than this many days are flagged stale."
            >
              <span className="text-[10px] text-gray-500">Stale days</span>
              <input
                type="number"
                min={1}
                className="mt-0.5 w-full rounded border dark:border-gray-600 dark:bg-gray-900 px-2 py-1.5 text-sm"
                value={form.staleMatchThresholdDays}
                onChange={(e) =>
                  setForm({ ...form, staleMatchThresholdDays: Number(e.target.value) || 45 })
                }
              />
            </label>
            <label className="block">
              <span className="text-[10px] text-gray-500">Pending from</span>
              <input
                type="date"
                disabled={pendingDatesDisabled}
                className="mt-0.5 w-full rounded border dark:border-gray-600 dark:bg-gray-900 px-2 py-1.5 text-sm disabled:opacity-40"
                value={form.pendingDateFrom}
                onChange={(e) => setForm({ ...form, pendingDateFrom: e.target.value })}
              />
            </label>
            <label className="block">
              <span className="text-[10px] text-gray-500">Pending to</span>
              <input
                type="date"
                disabled={pendingDatesDisabled}
                className="mt-0.5 w-full rounded border dark:border-gray-600 dark:bg-gray-900 px-2 py-1.5 text-sm disabled:opacity-40"
                value={form.pendingDateTo}
                onChange={(e) => setForm({ ...form, pendingDateTo: e.target.value })}
              />
            </label>
          </div>

          <div className="text-xs text-gray-500 space-y-0.5 pt-1 border-t dark:border-gray-700">
            {form.dateFrom && form.dateTo && stationOptions.length > 0 && (
              <p>
                {stationOptions.length} station(s) in LPO range
                {customStations.length > 0 ? ` · ${customStations.length} custom` : ''}
              </p>
            )}
            {form.pendingMode !== 'none' && form.stations.length > 0 && (
              <p className="text-purple-600 dark:text-purple-400">
                {pendingPreviewCount} pending entries will be included
              </p>
            )}
          </div>
        </div>

        <div className="px-5 py-3 border-t dark:border-gray-700 flex flex-wrap items-center justify-end gap-2 bg-gray-50 dark:bg-gray-900/40">
          <button
            type="button"
            onClick={() =>
              reconciliationAPI.downloadTemplate({
                title: form.title || undefined,
              })
            }
            className="inline-flex items-center px-2 py-1.5 text-xs border rounded-md dark:border-gray-600"
          >
            <Download className="w-3 h-3 mr-1" />
            Template
          </button>
          <button
            type="button"
            disabled={creating}
            onClick={onClose}
            className="px-3 py-1.5 text-sm rounded-md border dark:border-gray-600"
          >
            Discard
          </button>
          <button
            type="button"
            onClick={onRequestCreate}
            disabled={creating}
            className="inline-flex items-center px-4 py-1.5 text-sm rounded-md text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50"
          >
            {creating && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
            Create &amp; load LPO
          </button>
        </div>
      </div>
    </div>
  );
}

type StatementImportModalState = {
  file: File;
  fileName: string;
  validation: StatementStationValidation;
  selectedStations: string[];
  mappings: Record<string, string>;
  flagged: Record<string, boolean>;
};

function StatementStationImportModal({
  state,
  onClose,
  onConfirm,
  loading,
}: {
  state: StatementImportModalState;
  onClose: () => void;
  onConfirm: (mappings: Record<string, string>, flaggedStations: string[]) => void;
  loading: boolean;
}) {
  const [mappings, setMappings] = useState(state.mappings);
  const [flagged, setFlagged] = useState<Record<string, boolean>>(state.flagged);
  const unknownStations = state.validation.stationsInFile.filter((s) => !s.inSelectedScope && !s.isYard);

  const toggleFlag = (statementStation: string) => {
    setFlagged((prev) => {
      const next = !prev[statementStation];
      if (next) {
        setMappings((m) => {
          const copy = { ...m };
          delete copy[statementStation];
          return copy;
        });
      }
      return { ...prev, [statementStation]: next };
    });
  };

  const setMapping = (statementStation: string, value: string) => {
    setMappings((prev) => ({ ...prev, [statementStation]: value }));
    if (value) {
      setFlagged((prev) => ({ ...prev, [statementStation]: false }));
    }
  };

  const allResolved = unknownStations.every(
    (row) => flagged[row.statementStation] || Boolean(mappings[row.statementStation]?.trim())
  );

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={() => !loading && onClose()} />
      <div className="relative bg-white dark:bg-gray-800 rounded-xl shadow-xl border dark:border-gray-700 w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        <div className="p-5 border-b dark:border-gray-700">
          <h3 className="font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-amber-500" />
            Station names need mapping
          </h3>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">
            <strong>{state.fileName}</strong> has {state.validation.lineCount} rows.{' '}
            {state.validation.outOfScopeRowCount} row(s) use station names that do not match your
            selected stations. Map each name to a station, or flag it to import as an exception and
            resolve later.
          </p>
          <p className="text-xs text-gray-500 mt-2">
            Selected for this reconciliation:{' '}
            <span className="font-medium">{state.selectedStations.join(', ')}</span>
          </p>
        </div>

        <div className="overflow-y-auto p-5 space-y-3 flex-1">
          {unknownStations.length === 0 ? (
            <p className="text-sm text-green-600">All station names match.</p>
          ) : (
            unknownStations.map((row) => {
              const isFlagged = Boolean(flagged[row.statementStation]);
              return (
              <div
                key={row.normalized}
                className={`grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 rounded-lg border dark:border-gray-700 ${
                  isFlagged
                    ? 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800'
                    : 'bg-gray-50 dark:bg-gray-900/40'
                }`}
              >
                <div>
                  <div className="text-[10px] uppercase text-gray-500">In statement</div>
                  <div className="font-medium text-sm">{row.statementStation}</div>
                  <div className="text-xs text-gray-500 mt-1">
                    Rows {row.rowNumbers.join(', ')} · {row.lineCount} line(s) · {row.litersTotal} L
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="block">
                    <span className="text-[10px] uppercase text-gray-500">Map to station</span>
                    <select
                      className="mt-1 w-full rounded border dark:border-gray-600 dark:bg-gray-900 px-2 py-2 text-sm disabled:opacity-50"
                      value={mappings[row.statementStation] || ''}
                      disabled={isFlagged}
                      onChange={(e) => setMapping(row.statementStation, e.target.value)}
                    >
                      <option value="">Choose station…</option>
                      {state.selectedStations.map((st) => (
                        <option key={st} value={st}>
                          {st}
                        </option>
                      ))}
                    </select>
                    {row.suggestedMatch && !mappings[row.statementStation] && !isFlagged && (
                      <button
                        type="button"
                        className="text-xs text-blue-600 mt-1 hover:underline"
                        onClick={() => setMapping(row.statementStation, row.suggestedMatch!)}
                      >
                        Use suggestion: {row.suggestedMatch}
                      </button>
                    )}
                  </label>
                  <button
                    type="button"
                    onClick={() => toggleFlag(row.statementStation)}
                    className={`w-full px-3 py-2 text-xs rounded-md border transition-colors ${
                      isFlagged
                        ? 'bg-amber-100 dark:bg-amber-900/40 border-amber-300 dark:border-amber-700 text-amber-900 dark:text-amber-200'
                        : 'border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700'
                    }`}
                  >
                    {isFlagged
                      ? 'Flagged — will import as exception'
                      : 'Flag as exception & continue'}
                  </button>
                </div>
              </div>
            );
            })
          )}

          {state.validation.yardRowCount > 0 && (
            <p className="text-xs text-gray-500">
              {state.validation.yardRowCount} yard row(s) skipped (not reconciled).
            </p>
          )}
        </div>

        <div className="p-4 border-t dark:border-gray-700 flex flex-wrap gap-2 justify-end">
          <button
            type="button"
            disabled={loading}
            onClick={onClose}
            className="px-4 py-2 text-sm rounded-md border dark:border-gray-600"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={loading || !allResolved}
            onClick={() =>
              onConfirm(
                mappings,
                unknownStations.filter((row) => flagged[row.statementStation]).map((row) => row.statementStation)
              )
            }
            className="px-4 py-2 text-sm rounded-md bg-blue-600 text-white disabled:opacity-50"
          >
            {loading ? 'Importing…' : 'Apply mapping & import'}
          </button>
        </div>
      </div>
    </div>
  );
}

function ReconciliationTab() {
  const [subTab, setSubTab] = usePersistedState<ReconcileSubTab>('lpo:reconcileSubTab', 'sessions');
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [lineFilter, setLineFilter] = useState<LineFilter>('all');
  const [lineSearch, setLineSearch] = useState('');
  const [lineTruckFilter, setLineTruckFilter] = useState('');
  const [lineStationFilter, setLineStationFilter] = useState('');
  const [lineExceptionFilter, setLineExceptionFilter] = useState('');
  const [lineSortBy, setLineSortBy] = useState<LineSortKey>('lpoTruck');
  const [lineSortDir, setLineSortDir] = useState<'asc' | 'desc'>('asc');
  const [selectedLineIds, setSelectedLineIds] = useState<Set<string>>(new Set());
  const [selectedStmtIndexes, setSelectedStmtIndexes] = useState<Set<number>>(new Set());
  const [fixLineModal, setFixLineModal] = useState<ReconciliationLine | null>(null);
  const [fixTruck, setFixTruck] = useState('');
  const [fixStation, setFixStation] = useState('');
  const [pendingSortBy, setPendingSortBy] = useState<PendingSortKey>('lpoDate');
  const [pendingSortDir, setPendingSortDir] = useState<'asc' | 'desc'>('asc');
  const [stmtFilter, setStmtFilter] = useState<StmtFilter>('all');
  const [stmtSearch, setStmtSearch] = useState('');
  const [stmtTruckFilter, setStmtTruckFilter] = useState<string[]>([]);
  const [stmtStationFilter, setStmtStationFilter] = useState<string[]>([]);
  const [stmtDetailFilter, setStmtDetailFilter] = useState<string[]>([]);
  const [stmtSortBy, setStmtSortBy] = useState<StmtSortKey>('stmtRow');
  const [stmtSortDir, setStmtSortDir] = useState<'asc' | 'desc'>('asc');
  const [sessionTableView, setSessionTableView] = useState<SessionDetailTableView>('lines');
  const [linkModal, setLinkModal] = useState<LinkModalState | null>(null);
  const [linkModalSearch, setLinkModalSearch] = useState('');
  const [linkModalSelection, setLinkModalSelection] = useState<Set<string>>(new Set());
  const [linkModalSubmitting, setLinkModalSubmitting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [sessionStationSelection, setSessionStationSelection] = useState<string[]>([]);
  const [sessionDateFromSelection, setSessionDateFromSelection] = useState('');
  const [sessionDateToSelection, setSessionDateToSelection] = useState('');
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState | null>(null);
  const [confirmLoading, setConfirmLoading] = useState(false);
  const [sessionSearch, setSessionSearch] = usePersistedState('lpo:reconcileSessionSearch', '');
  const [sessionStationFilter, setSessionStationFilter] = usePersistedState<string[]>(
    'lpo:reconcileSessionStations',
    []
  );
  const [sessionListDateFrom, setSessionListDateFrom] = usePersistedState(
    'lpo:reconcileSessionDateFrom',
    ''
  );
  const [sessionListDateTo, setSessionListDateTo] = usePersistedState('lpo:reconcileSessionDateTo', '');
  const [sessionStatusFilter, setSessionStatusFilter] = usePersistedState<SessionStatusFilter>(
    'lpo:reconcileSessionStatus',
    ''
  );
  const [showSessionStationDropdown, setShowSessionStationDropdown] = useState(false);
  const sessionStationDropdownRef = useRef<HTMLDivElement>(null);
  const [leaveModalOpen, setLeaveModalOpen] = useState(false);
  const [leaveLoading, setLeaveLoading] = useState(false);
  const [pendingNav, setPendingNav] = useState<(() => void) | null>(null);
  const [form, setForm] = useState(DEFAULT_CREATE_FORM);
  const [pendingFilters, setPendingFilters] = useState({
    stations: [] as string[],
    month: '',
    dateFrom: '',
    dateTo: '',
    search: '',
  });
  const [importModal, setImportModal] = useState<StatementImportModalState | null>(null);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: stationsData } = useActiveFuelStations();
  const billableStations = useMemo(
    () =>
      (stationsData || [])
        .filter((s: { stationName: string }) => !isYardStation(s.stationName))
        .map((s: { stationName: string }) => s.stationName)
        .sort(),
    [stationsData]
  );

  useEffect(() => {
    if (pendingFilters.stations.length === 0 && billableStations.length > 0) {
      setPendingFilters((f) => ({ ...f, stations: [...billableStations] }));
    }
  }, [billableStations, pendingFilters.stations.length]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        sessionStationDropdownRef.current &&
        !sessionStationDropdownRef.current.contains(event.target as Node)
      ) {
        setShowSessionStationDropdown(false);
      }
    };

    const handleScroll = (event: Event) => {
      const target = event.target as Node;
      if (sessionStationDropdownRef.current?.contains(target)) return;
      setShowSessionStationDropdown(false);
    };

    const scrollEl = document.getElementById('main-scroll-container');
    document.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('scroll', handleScroll, true);
    scrollEl?.addEventListener('scroll', handleScroll);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('scroll', handleScroll, true);
      scrollEl?.removeEventListener('scroll', handleScroll);
    };
  }, []);

  const { data: rangeStations = [] } = useReconciliationStationsInRange(form.dateFrom, form.dateTo);

  const stationOptions = useMemo(() => {
    const merged = new Set([...billableStations, ...rangeStations]);
    return [...merged].sort((a, b) => a.localeCompare(b));
  }, [billableStations, rangeStations]);

  const customStationsInRange = useMemo(() => {
    const billableUpper = new Set(billableStations.map((s: string) => s.toUpperCase()));
    return rangeStations.filter((s: string) => !billableUpper.has(s.toUpperCase()));
  }, [billableStations, rangeStations]);

  const lastDateKeyRef = useRef('');
  const userEditedStationsRef = useRef(false);
  useEffect(() => {
    if (!createModalOpen) return;
    const key = `${form.dateFrom}|${form.dateTo}`;
    if (!form.dateFrom || !form.dateTo) return;
    if (stationOptions.length === 0) return;
    if (lastDateKeyRef.current !== key) {
      lastDateKeyRef.current = key;
      setForm((f) => {
        if (userEditedStationsRef.current && f.stations.length > 0) {
          const pruned = f.stations.filter((s) => stationOptions.includes(s));
          return { ...f, stations: pruned.length > 0 ? pruned : [...stationOptions] };
        }
        return { ...f, stations: [...stationOptions] };
      });
    }
  }, [createModalOpen, form.dateFrom, form.dateTo, stationOptions]);

  const { data: listData, isLoading: listLoading } = useReconciliationSessions({
    limit: 100,
    status: sessionStatusFilter || undefined,
    search: sessionSearch.trim() || undefined,
    stations: sessionStationFilter.length ? sessionStationFilter : undefined,
    dateFrom: sessionListDateFrom || undefined,
    dateTo: sessionListDateTo || undefined,
  });
  const { data: session, isLoading: sessionLoading } = useReconciliationSession(activeSessionId);

  const deferredLineSearch = useDeferredValue(lineSearch.trim());
  const deferredStmtSearch = useDeferredValue(stmtSearch.trim());

  const linesScrollRef = useRef<HTMLDivElement>(null);
  const stmtScrollRef = useRef<HTMLDivElement>(null);

  const {
    data: linesInfinite,
    isLoading: linesLoading,
    isFetching: linesFetching,
    isFetchingNextPage: linesFetchingNext,
    hasNextPage: linesHasNext,
    fetchNextPage: fetchNextLines,
  } = useReconciliationSessionLines(activeSessionId, {
    filter: lineFilter,
    search: deferredLineSearch || undefined,
    truck: lineTruckFilter.trim() || undefined,
    station: lineStationFilter.trim() || undefined,
    exceptionCode: lineExceptionFilter.trim() || undefined,
    side: 'lpo',
    sortBy: lineSortBy,
    sortDir: lineSortDir,
    limit: 100,
    enabled: !!activeSessionId && sessionTableView === 'lines',
  });
  const displayLines = useMemo(
    () => linesInfinite?.pages.flatMap((p) => p.data) || [],
    [linesInfinite]
  );
  const linesPagination = linesInfinite?.pages[0]?.pagination;
  const linesFilterLoading = linesFetching && !linesFetchingNext;
  const fetchNextLinesPage = useCallback(() => {
    void fetchNextLines();
  }, [fetchNextLines]);

  const { data: lineFilterOptions } = useReconciliationLineFilterOptions(activeSessionId, {
    enabled: !!activeSessionId && sessionTableView === 'lines',
    side: 'lpo',
  });

  const { data: statementFilterOptions } = useReconciliationStatementFilterOptions(activeSessionId, {
    enabled: !!activeSessionId && sessionTableView === 'variance',
  });

  const {
    data: statementRowsInfinite,
    isLoading: statementRowsLoading,
    isFetching: statementRowsFetching,
    isFetchingNextPage: statementRowsFetchingNext,
    hasNextPage: statementRowsHasNext,
    fetchNextPage: fetchNextStatementRows,
  } = useReconciliationStatementRows(activeSessionId, {
    filter: stmtFilter,
    search: deferredStmtSearch || undefined,
    truck: stmtTruckFilter.length ? stmtTruckFilter.join(',') : undefined,
    station: stmtStationFilter.length ? stmtStationFilter.join(',') : undefined,
    detail: stmtDetailFilter.length ? stmtDetailFilter.join(',') : undefined,
    sortBy: stmtSortBy,
    sortDir: stmtSortDir,
    limit: 100,
    enabled: !!activeSessionId && sessionTableView === 'variance',
  });
  const displayStatementRows = useMemo(
    () => statementRowsInfinite?.pages.flatMap((p) => p.data) || [],
    [statementRowsInfinite]
  );
  const statementRowsPagination = statementRowsInfinite?.pages[0]?.pagination;
  const stmtFilterLoading = statementRowsFetching && !statementRowsFetchingNext;
  const fetchNextStatementRowsPage = useCallback(() => {
    void fetchNextStatementRows();
  }, [fetchNextStatementRows]);

  // Reset bulk selection when filters/sort change (loaded pages reset)
  useEffect(() => {
    setSelectedLineIds(new Set());
  }, [
    lineFilter,
    deferredLineSearch,
    lineTruckFilter,
    lineStationFilter,
    lineExceptionFilter,
    lineSortBy,
    lineSortDir,
    activeSessionId,
  ]);
  useEffect(() => {
    setSelectedStmtIndexes(new Set());
  }, [
    stmtFilter,
    deferredStmtSearch,
    stmtTruckFilter.join('|'),
    stmtStationFilter.join('|'),
    stmtDetailFilter.join('|'),
    stmtSortBy,
    stmtSortDir,
    activeSessionId,
  ]);

  const mutations = useReconciliationMutations();

  const sessionBusy =
    exporting ||
    mutations.saveDraft.isPending ||
    mutations.reopen.isPending ||
    mutations.uploadStatement.isPending ||
    mutations.validateStatement.isPending ||
    mutations.runMatch.isPending ||
    mutations.complete.isPending ||
    mutations.drop.isPending;

  const linkOppositeSide = linkModal?.source === 'lpo' ? 'statement' : 'lpo';
  const { data: linkCandidates, isLoading: linkCandidatesLoading } = useReconciliationMatchCandidates(
    activeSessionId,
    {
      side: linkOppositeSide,
      search: linkModalSearch.trim() || undefined,
      limit: 100,
      enabled: !!linkModal && !!activeSessionId,
    }
  );

  const sessionDateFrom = session?.dateFrom || '';
  const sessionDateTo = session?.dateTo || '';
  const scopePreviewDateFrom = sessionDateFromSelection || sessionDateFrom;
  const scopePreviewDateTo = sessionDateToSelection || sessionDateTo;
  const { data: sessionRangeStations = [] } = useReconciliationStationsInRange(
    scopePreviewDateFrom,
    scopePreviewDateTo
  );

  const sessionStationOptions = useMemo(() => {
    const merged = new Set([...billableStations, ...sessionRangeStations]);
    session?.stations.forEach((s) => merged.add(s));
    return [...merged].sort((a, b) => a.localeCompare(b));
  }, [billableStations, sessionRangeStations, session?.stations]);

  const sessionCustomStations = useMemo(() => {
    const billableUpper = new Set(billableStations.map((s: string) => s.toUpperCase()));
    return sessionRangeStations.filter((s: string) => !billableUpper.has(s.toUpperCase()));
  }, [billableStations, sessionRangeStations]);

  useEffect(() => {
    if (session?.stations) {
      setSessionStationSelection([...session.stations]);
    }
    if (session) {
      setSessionDateFromSelection(session.dateFrom || '');
      setSessionDateToSelection(session.dateTo || '');
    }
  }, [session?.id, session?.stations?.join('|'), session?.dateFrom, session?.dateTo]);

  const sessionScopeDirty = useMemo(
    () =>
      !sessionScopeEqual(
        sessionStationSelection,
        sessionDateFromSelection,
        sessionDateToSelection,
        session
      ),
    [session, sessionStationSelection, sessionDateFromSelection, sessionDateToSelection]
  );

  useEffect(() => {
    setSelectedLineIds(new Set());
    setSelectedStmtIndexes(new Set());
    setSessionTableView('lines');
    setLinkModal(null);
  }, [activeSessionId]);

  useEffect(() => {
    setSelectedLineIds(new Set());
  }, [lineFilter]);

  useEffect(() => {
    setSelectedStmtIndexes(new Set());
  }, [stmtFilter]);

  const { data: pendingPreview = [] } = usePendingLpoEntries(form.stations, {
    pendingMode: form.pendingMode === 'none' ? 'all' : form.pendingMode,
    pendingDateFrom: form.pendingDateFrom || undefined,
    pendingDateTo: form.pendingDateTo || undefined,
    enabled: createModalOpen && form.stations.length > 0 && form.pendingMode !== 'none',
  });

  const pendingQueryEnabled =
    (subTab === 'pending' || subTab === 'dropped') && pendingFilters.stations.length > 0;

  const { data: allPending = [], isLoading: pendingLoading } = usePendingLpoEntries(
    pendingFilters.stations,
    {
      pendingMode: 'all',
      pendingDateFrom: pendingFilters.dateFrom || undefined,
      pendingDateTo: pendingFilters.dateTo || undefined,
      view: 'active',
      search: pendingFilters.search.trim() || undefined,
      sortBy: pendingSortBy,
      sortDir: pendingSortDir,
      enabled: pendingQueryEnabled && subTab === 'pending',
    }
  );

  const { data: droppedPending = [], isLoading: droppedLoading } = usePendingLpoEntries(
    pendingFilters.stations,
    {
      pendingDateFrom: pendingFilters.dateFrom || undefined,
      pendingDateTo: pendingFilters.dateTo || undefined,
      view: 'dropped',
      search: pendingFilters.search.trim() || undefined,
      sortBy: pendingSortBy,
      sortDir: pendingSortDir,
      enabled: pendingQueryEnabled && subTab === 'dropped',
    }
  );

  const { data: pendingBadgeList = [] } = usePendingLpoEntries(billableStations, {
    pendingMode: 'all',
    enabled: billableStations.length > 0,
  });

  const filteredPending = subTab === 'dropped' ? droppedPending : allPending;

  const pendingSummary = useMemo(() => {
    const liters = filteredPending.reduce((s, p) => s + (p.lpoLiters || 0), 0);
    const byStation = filteredPending.reduce<Record<string, number>>((acc, p) => {
      acc[p.lpoStation] = (acc[p.lpoStation] || 0) + 1;
      return acc;
    }, {});
    return { count: filteredPending.length, liters, byStation };
  }, [filteredPending]);

  const statementTabCount =
    statementRowsPagination?.total ?? session?.summary?.totalStatementLines ?? 0;

  const pendingCountsEnabled =
    (subTab === 'pending' || subTab === 'dropped') && billableStations.length > 0;

  const { data: pendingCountSource = [] } = usePendingLpoEntries(billableStations, {
    pendingMode: 'all',
    pendingDateFrom: pendingFilters.dateFrom || undefined,
    pendingDateTo: pendingFilters.dateTo || undefined,
    view: subTab === 'dropped' ? 'dropped' : 'active',
    search: pendingFilters.search.trim() || undefined,
    enabled: pendingCountsEnabled,
  });

  const pendingStationCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const entry of pendingCountSource) {
      counts[entry.lpoStation] = (counts[entry.lpoStation] || 0) + 1;
    }
    return counts;
  }, [pendingCountSource]);

  const toggleLineSort = (key: string) => {
    if (lineSortBy === key) setLineSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setLineSortBy(key as LineSortKey);
      setLineSortDir('asc');
    }
  };

  const togglePendingSort = (key: string) => {
    if (pendingSortBy === key) setPendingSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setPendingSortBy(key as PendingSortKey);
      setPendingSortDir('asc');
    }
  };

  const toggleStmtSort = (key: string) => {
    if (stmtSortBy === key) setStmtSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setStmtSortBy(key as StmtSortKey);
      setStmtSortDir('asc');
    }
  };

  const toggleLineSelection = (lineId: string) => {
    setSelectedLineIds((prev) => {
      const next = new Set(prev);
      if (next.has(lineId)) next.delete(lineId);
      else next.add(lineId);
      return next;
    });
  };

  const toggleStmtSelection = (index: number) => {
    setSelectedStmtIndexes((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  const openLinkModalFromLpo = () => {
    const ids = [...selectedLineIds];
    if (!ids.length) {
      toast.error('Select at least one LPO line');
      return;
    }
    setLinkModalSearch('');
    setLinkModalSelection(new Set());
    setLinkModal({ source: 'lpo', lpoLineIds: ids, statementIndexes: [] });
  };

  const openLinkModalFromStatement = () => {
    const indexes = [...selectedStmtIndexes];
    if (!indexes.length) {
      toast.error('Select at least one statement row');
      return;
    }
    setLinkModalSearch('');
    setLinkModalSelection(new Set());
    setLinkModal({ source: 'statement', lpoLineIds: [], statementIndexes: indexes });
  };

  const toggleLinkModalItem = (key: string) => {
    setLinkModalSelection((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const submitLinkModal = async (accept = false) => {
    if (!activeSessionId || !linkModal) return;
    const lpoLineIds =
      linkModal.source === 'lpo'
        ? linkModal.lpoLineIds
        : [...linkModalSelection];
    const statementIndexes =
      linkModal.source === 'statement'
        ? linkModal.statementIndexes
        : [...linkModalSelection].map((v) => Number(v));

    if (!lpoLineIds.length || !statementIndexes.length) {
      toast.error(
        linkModal.source === 'lpo'
          ? 'Select at least one statement row to link'
          : 'Select at least one LPO line to link'
      );
      return;
    }

    setLinkModalSubmitting(true);
    try {
      await mutations.manualMatch.mutateAsync({
        id: activeSessionId,
        payload: { lpoLineIds, statementLineIndexes: statementIndexes, accept },
      });
      setLinkModal(null);
      setSelectedLineIds(new Set());
      setSelectedStmtIndexes(new Set());
      toast.success(
        accept
          ? 'Manual match accepted'
          : 'Manual link created — review and accept if liters match'
      );
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Manual match failed');
    } finally {
      setLinkModalSubmitting(false);
    }
  };

  const openFixFromStatementRow = (row: ReconciliationStatementRow) => {
    if (!row.reconLineId) {
      toast.error('Run Re-match first so this statement row has a reconciliation line');
      return;
    }
    setFixLineModal({
      _id: row.reconLineId,
      matchStatus: row.matchStatus,
      exceptionMessage: row.exceptionMessage,
      exceptionCode: row.exceptionCode,
      statementLineIndex: row.statementLineIndex,
      statementRowNumber: row.statementRowNumber,
      statementStation: row.station,
      statementTruckNo: row.truckNo,
      statementTruckNoRaw: row.truckNoRaw || row.truckNo,
      originalStatementTruckNo: row.originalTruckNo,
      originalStatementTruckNoRaw: row.originalTruckNoRaw || row.truckNoRaw || row.truckNo,
      statementLiters: row.liters,
      lpoTruckNo: row.lpoTruckNo,
      lpoLiters: row.lpoLiters,
      lpoStation: row.lpoStation,
      userDecision: row.userDecision,
    });
    setFixTruck(row.truckNoRaw || row.truckNo || '');
    const station = row.station || '';
    setFixStation(station);
  };

  const fixLineChanged = useMemo(() => {
    if (!fixLineModal) return false;
    const truck = fixTruck.trim();
    const station = fixStation.trim();
    const origTruck = (
      fixLineModal.statementTruckNoRaw ||
      fixLineModal.statementTruckNo ||
      fixLineModal.lpoTruckNoRaw ||
      fixLineModal.lpoTruckNo ||
      ''
    ).trim();
    const origStation = (fixLineModal.statementStation || fixLineModal.lpoStation || '').trim();
    return truck !== origTruck || station !== origStation;
  }, [fixLineModal, fixTruck, fixStation]);

  const needsLeaveGuard = useCallback(
    (targetSessionId?: string | null) => {
      if (!session || !activeSessionId) return false;
      if (!sessionIsOpen(session.status)) return false;
      if (targetSessionId === activeSessionId) return false;
      return true;
    },
    [session, activeSessionId]
  );

  const runPendingNavigation = useCallback(async (saveDraft: boolean) => {
    if (!pendingNav) return;
    setLeaveLoading(true);
    try {
      if (saveDraft && activeSessionId) {
        await mutations.saveDraft.mutateAsync({ id: activeSessionId });
        toast.success('Draft saved');
      }
      pendingNav();
      setPendingNav(null);
      setLeaveModalOpen(false);
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Could not save draft');
    } finally {
      setLeaveLoading(false);
    }
  }, [pendingNav, activeSessionId, mutations.saveDraft]);

  const requestNavigate = useCallback(
    (action: () => void, targetSessionId?: string | null) => {
      if (needsLeaveGuard(targetSessionId)) {
        setPendingNav(() => action);
        setLeaveModalOpen(true);
        return;
      }
      action();
    },
    [needsLeaveGuard]
  );

  const openSession = (id: string) => {
    requestNavigate(() => setActiveSessionId(id), id);
  };

  const goBackToList = () => {
    requestNavigate(() => setActiveSessionId(null));
  };

  const switchSubTab = (tab: ReconcileSubTab) => {
    if (tab === subTab) return;
    requestNavigate(() => setSubTab(tab));
  };

  const executeCreate = async () => {
    try {
      const created = await mutations.create.mutateAsync({
        title: form.title || undefined,
        stations: form.stations,
        dateFrom: form.dateFrom,
        dateTo: form.dateTo,
        pendingMode: form.pendingMode,
        pendingDateFrom: form.pendingDateFrom || undefined,
        pendingDateTo: form.pendingDateTo || undefined,
        staleMatchThresholdDays: form.staleMatchThresholdDays,
      });
      const id = sessionId(created);
      await mutations.loadLpo.mutateAsync(id);
      setCreateModalOpen(false);
      setActiveSessionId(id);
      toast.success(`Reconciliation ${created.sessionNo} started`);
    } catch (err: any) {
      toast.error(err?.response?.data?.message || err.message || 'Failed to create reconciliation');
      throw err;
    }
  };

  const requestCreateConfirmation = () => {
    if (!form.stations.length) {
      toast.error('Select at least one station');
      return;
    }
    if (!form.dateFrom || !form.dateTo) {
      toast.error('LPO date range is required');
      return;
    }

    const stationLabel =
      form.stations.length === stationOptions.length
        ? `all ${form.stations.length} stations`
        : `${form.stations.length} station(s)`;

    setConfirmDialog({
      title: 'Create reconciliation?',
      message: `Load LPO lines for ${stationLabel} from ${form.dateFrom} to ${form.dateTo}? You can upload the supplier statement after the session opens.`,
      variant: 'warning',
      confirmLabel: 'Create & load',
      onConfirm: executeCreate,
    });
  };

  const handleCreate = () => {
    requestCreateConfirmation();
  };

  const openCreateModal = () => {
    userEditedStationsRef.current = false;
    lastDateKeyRef.current = '';
    setForm({ ...DEFAULT_CREATE_FORM });
    setCreateModalOpen(true);
  };

  const closeCreateModal = () => {
    if (mutations.create.isPending || mutations.loadLpo.isPending) return;
    setCreateModalOpen(false);
  };

  const handleUpload = async (file: File) => {
    if (!activeSessionId || sessionBusy) return;
    try {
      const result = await mutations.validateStatement.mutateAsync({ id: activeSessionId, file });
      if (result.stationValidation.allValid) {
        await mutations.uploadStatement.mutateAsync({ id: activeSessionId, file });
        toast.success(`Statement imported — ${result.lineCount} rows matched`);
        return;
      }

      const mappings: Record<string, string> = {};
      for (const s of result.stationValidation.stationsInFile) {
        if (!s.inSelectedScope && !s.isYard && s.suggestedMatch) {
          mappings[s.statementStation] = s.suggestedMatch;
        }
      }
      setImportModal({
        file,
        fileName: result.fileName,
        validation: result.stationValidation,
        selectedStations: result.selectedStations,
        mappings,
        flagged: {},
      });
    } catch (err: any) {
      toast.error(err?.response?.data?.message || err.message || 'Could not read statement file');
    }
  };

  const confirmStatementImport = async (
    mappings: Record<string, string>,
    flaggedStations: string[]
  ) => {
    if (!activeSessionId || !importModal) return;
    const unknowns = importModal.validation.stationsInFile.filter(
      (s) => !s.inSelectedScope && !s.isYard
    );
    for (const row of unknowns) {
      const isFlagged = flaggedStations.includes(row.statementStation);
      if (!isFlagged && !mappings[row.statementStation]?.trim()) {
        toast.error(`Map or flag station "${row.statementStation}" (rows ${row.rowNumbers.join(', ')})`);
        return;
      }
    }
    try {
      await mutations.uploadStatement.mutateAsync({
        id: activeSessionId,
        file: importModal.file,
        stationMappings: mappings,
        flaggedStatementStations: flaggedStations,
        forceImport: flaggedStations.length > 0,
      });
      setImportModal(null);
      toast.success(
        flaggedStations.length > 0
          ? 'Statement imported — flagged stations saved as exceptions'
          : 'Statement imported with station mappings applied'
      );
    } catch (err: any) {
      toast.error(err?.response?.data?.message || err.message || 'Import failed');
    }
  };

  const handleLineAction = async (
    line: ReconciliationLine,
    payload: Parameters<typeof reconciliationAPI.updateLine>[2]
  ) => {
    if (!activeSessionId || !line._id) return;
    try {
      await mutations.updateLine.mutateAsync({ id: activeSessionId, lineId: line._id, payload });
      toast.success('Line updated');
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Update failed');
    }
  };

  const handleDropStatementRow = (row: ReconciliationStatementRow) => {
    if (!activeSessionId || !row.reconLineId) {
      toast.error('Run Re-match first so this statement row can be dropped');
      return;
    }
    setConfirmDialog({
      title: 'Drop statement truck?',
      message: `Drop ${row.truckNoRaw || row.truckNo} · ${row.station} (${row.liters}L)? It will move to the Dropped filter and be excluded from matching until you Fix & re-match it.`,
      variant: 'danger',
      confirmLabel: 'Drop',
      onConfirm: async () => {
        await mutations.updateLine.mutateAsync({
          id: activeSessionId,
          lineId: row.reconLineId!,
          payload: { userDecision: 'drop' },
        });
        toast.success('Statement truck dropped');
      },
    });
  };

  const submitFixLine = async () => {
    if (!fixLineModal?._id || !activeSessionId || mutations.updateLine.isPending) return;
    if (!fixLineChanged) {
      toast.error('Change the statement truck or station before re-matching');
      return;
    }
    if (!fixStation.trim()) {
      toast.error('Select a station');
      return;
    }
    const wasDropped = fixLineModal.matchStatus === 'dropped';
    try {
      const result = await mutations.updateLine.mutateAsync({
        id: activeSessionId,
        lineId: fixLineModal._id,
        payload: {
          statementTruckNo: fixTruck.trim() || undefined,
          statementStation: fixStation.trim() || undefined,
          rematch: true,
        },
      });
      setFixLineModal(null);
      const outcome = result.rematchOutcome;
      if (outcome?.matched) {
        toast.success(wasDropped ? 'Revived and matched successfully' : 'Updated and matched successfully');
      } else {
        toast.warning(
          outcome?.exceptionMessage ||
            `Updated, but still unmatched (${(outcome?.matchStatus || 'pending').replace(/_/g, ' ')})`
        );
      }
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Update failed');
    }
  };

  const handleExportSession = async () => {
    if (!activeSessionId || !session || exporting) return;
    setExporting(true);
    const toastId = toast.info('Exporting reconciliation report…', { autoClose: false });
    try {
      await reconciliationAPI.exportReport(activeSessionId, session.sessionNo);
      toast.update(toastId, {
        render: 'Export complete',
        type: 'success',
        autoClose: 3000,
      });
    } catch (err: any) {
      toast.update(toastId, {
        render: err?.response?.data?.message || 'Export failed',
        type: 'error',
        autoClose: 5000,
      });
    } finally {
      setExporting(false);
    }
  };

  const handleApplySessionScope = async () => {
    if (!activeSessionId || !sessionStationSelection.length) return;
    if (!sessionDateFromSelection || !sessionDateToSelection) {
      toast.error('LPO date range is required');
      return;
    }
    if (sessionDateFromSelection > sessionDateToSelection) {
      toast.error('Start date must be on or before end date');
      return;
    }
    try {
      await mutations.updateSessionStations.mutateAsync({
        id: activeSessionId,
        stations: sessionStationSelection,
        dateFrom: sessionDateFromSelection,
        dateTo: sessionDateToSelection,
      });
      toast.success('Scope updated — LPO lines reloaded and re-matched');
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Failed to update session scope');
    }
  };

  const handleDropPendingEntry = (entry: PendingLpoEntry) => {
    if (!entry.originSessionId || !entry.originLineId) {
      toast.error('Cannot drop this entry — missing origin session reference');
      return;
    }
    setConfirmDialog({
      title: 'Drop pending entry?',
      message: `Drop ${entry.lpoNo} · ${entry.lpoTruckNoRaw || entry.lpoTruckNo} (${entry.lpoLiters}L)? It will be kept under Dropped entries and excluded from future reconciliations.`,
      variant: 'warning',
      confirmLabel: 'Drop',
      onConfirm: async () => {
        await mutations.updateLine.mutateAsync({
          id: entry.originSessionId!,
          lineId: entry.originLineId!,
          payload: { userDecision: 'drop' },
        });
        toast.success('Pending entry dropped');
      },
    });
  };

  const setPendingMonthFilter = (month: string) => {
    const range = monthToDateRange(month);
    setPendingFilters((f) => ({
      ...f,
      month,
      dateFrom: range.from,
      dateTo: range.to,
    }));
  };

  const runConfirmDialog = async () => {
    if (!confirmDialog || confirmLoading) return;
    setConfirmLoading(true);
    try {
      await confirmDialog.onConfirm();
      setConfirmDialog(null);
    } catch (err: any) {
      toast.error(err?.response?.data?.message || err.message || 'Action failed');
    } finally {
      setConfirmLoading(false);
    }
  };

  const handleDropCurrent = async () => {
    if (!activeSessionId || !session) return;
    setLeaveLoading(true);
    try {
      await mutations.drop.mutateAsync(activeSessionId);
      toast.info('Reconciliation dropped');
      setLeaveModalOpen(false);
      setPendingNav(null);
      setActiveSessionId(null);
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Drop failed');
    } finally {
      setLeaveLoading(false);
    }
  };

  /* ── Session detail view ── */
  if (activeSessionId && session) {
    const isClosed = session.status === 'completed' || session.status === 'dropped';
    const canEdit = !isClosed || session.status === 'completed';
    const summary = session.summary;
    const stationScopeIssues = displayStatementRows.filter(
      (r) => r.exceptionCode === 'STATEMENT_STATION_OUT_OF_SCOPE'
    );

    return (
      <>
        {importModal && (
          <StatementStationImportModal
            state={importModal}
            loading={mutations.uploadStatement.isPending}
            onClose={() => setImportModal(null)}
            onConfirm={confirmStatementImport}
          />
        )}
        <div className="space-y-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <button
                onClick={goBackToList}
                className="inline-flex items-center text-sm text-blue-600 dark:text-blue-400 hover:underline mb-2"
              >
                <ArrowLeft className="w-4 h-4 mr-1" />
                Back to sessions
              </button>
              <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">
                {session.sessionNo} — {session.title}
              </h2>
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                {session.stations.length} station(s) · {session.dateFrom} to {session.dateTo}
                {session.statementFileName ? ` · ${session.statementFileName}` : ''}
              </p>
            </div>
            <div className="flex flex-wrap gap-2 justify-end">
              <span className={`px-2 py-1 rounded text-xs font-medium ${STATUS_COLORS[session.status]}`}>
                {session.status.replace('_', ' ')}
              </span>
              {!isClosed && (
                <button
                  type="button"
                  disabled={sessionBusy}
                  onClick={async () => {
                    if (sessionBusy) return;
                    try {
                      await mutations.saveDraft.mutateAsync({ id: activeSessionId });
                      toast.success('Draft saved');
                    } catch (err: any) {
                      toast.error(err?.response?.data?.message || 'Save failed');
                    }
                  }}
                  className={TOOLBAR_BTN}
                >
                  {mutations.saveDraft.isPending ? (
                    <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                  ) : (
                    <Save className="w-4 h-4 mr-1" />
                  )}
                  {mutations.saveDraft.isPending ? 'Saving…' : 'Save draft'}
                </button>
              )}
              {session.status === 'completed' && (
                <button
                  type="button"
                  disabled={sessionBusy}
                  onClick={async () => {
                    if (sessionBusy) return;
                    try {
                      await mutations.reopen.mutateAsync(activeSessionId);
                      toast.info('Reconciliation reopened for editing');
                    } catch (err: any) {
                      toast.error(err?.response?.data?.message || 'Reopen failed');
                    }
                  }}
                  className={TOOLBAR_BTN}
                >
                  {mutations.reopen.isPending ? (
                    <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                  ) : null}
                  {mutations.reopen.isPending ? 'Reopening…' : 'Reopen'}
                </button>
              )}
              <button
                type="button"
                disabled={sessionBusy}
                onClick={() => {
                  if (sessionBusy) return;
                  reconciliationAPI.downloadTemplate({
                    title: session.title,
                    sessionNo: session.sessionNo,
                  });
                }}
                className={TOOLBAR_BTN}
              >
                <Download className="w-4 h-4 mr-1" />
                Template
              </button>
              {!isClosed && (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      if (sessionBusy) return;
                      fileInputRef.current?.click();
                    }}
                    className={`${TOOLBAR_BTN} bg-white dark:bg-gray-800`}
                    disabled={sessionBusy}
                  >
                    {mutations.uploadStatement.isPending || mutations.validateStatement.isPending ? (
                      <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                    ) : (
                      <Upload className="w-4 h-4 mr-1" />
                    )}
                    {mutations.uploadStatement.isPending || mutations.validateStatement.isPending
                      ? 'Uploading…'
                      : 'Upload'}
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".xlsx"
                    className="hidden"
                    disabled={sessionBusy}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) handleUpload(f);
                      e.target.value = '';
                    }}
                  />
                  <button
                    type="button"
                    disabled={sessionBusy}
                    onClick={async () => {
                      if (sessionBusy || !activeSessionId) return;
                      try {
                        await mutations.runMatch.mutateAsync(activeSessionId);
                        toast.success('Re-match complete');
                      } catch (err: any) {
                        toast.error(err?.response?.data?.message || 'Re-match failed');
                      }
                    }}
                    className={TOOLBAR_BTN}
                  >
                    {mutations.runMatch.isPending ? (
                      <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                    ) : (
                      <RefreshCw className="w-4 h-4 mr-1" />
                    )}
                    {mutations.runMatch.isPending ? 'Matching…' : 'Re-match'}
                  </button>
                </>
              )}
              <button
                type="button"
                disabled={sessionBusy}
                onClick={handleExportSession}
                className={TOOLBAR_BTN}
              >
                {exporting ? (
                  <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                ) : (
                  <FileSpreadsheet className="w-4 h-4 mr-1" />
                )}
                {exporting ? 'Exporting…' : 'Export'}
              </button>
              {canEdit && session.status !== 'completed' && (
                <>
                  <button
                    type="button"
                    disabled={sessionBusy}
                    onClick={async () => {
                      if (sessionBusy || !activeSessionId) return;
                      try {
                        await mutations.complete.mutateAsync(activeSessionId);
                        toast.success('Reconciliation marked complete');
                      } catch (err: any) {
                        toast.error(err?.response?.data?.message || 'Cannot complete yet');
                      }
                    }}
                    className={TOOLBAR_BTN_GREEN}
                  >
                    {mutations.complete.isPending ? (
                      <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                    ) : (
                      <CheckCircle2 className="w-4 h-4 mr-1" />
                    )}
                    {mutations.complete.isPending ? 'Completing…' : 'Complete'}
                  </button>
                  <button
                    type="button"
                    disabled={sessionBusy}
                    onClick={() => {
                      if (sessionBusy) return;
                      setConfirmDialog({
                        title: 'Drop reconciliation?',
                        message: `Drop ${session.sessionNo}? This session will be marked dropped and cannot be resumed.`,
                        variant: 'danger',
                        confirmLabel: 'Drop',
                        onConfirm: async () => {
                          if (!activeSessionId || mutations.drop.isPending) return;
                          await mutations.drop.mutateAsync(activeSessionId);
                          setActiveSessionId(null);
                          toast.info('Reconciliation dropped');
                        },
                      });
                    }}
                    className={TOOLBAR_BTN_RED}
                  >
                    {mutations.drop.isPending ? (
                      <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                    ) : (
                      <XCircle className="w-4 h-4 mr-1" />
                    )}
                    {mutations.drop.isPending ? 'Dropping…' : 'Drop'}
                  </button>
                </>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2">
            {[
              ['Stmt total L', summary?.statementTotalLiters ?? 0, 'text-gray-800 dark:text-gray-200'],
              ['Reconciled L', summary?.reconciledStatementLiters ?? 0, 'text-green-600'],
              ['Difference L', summary?.literDifference ?? 0, 'text-red-600'],
              ['LPO total L', summary?.lpoTotalLiters ?? 0, 'text-gray-800 dark:text-gray-200'],
              [
                'Matched LPO / Stmt',
                `${summary?.matchedLpoLines ?? summary?.matched ?? 0} / ${summary?.totalStatementLines ?? 0}`,
                'text-green-600',
              ],
              ['Pending LPO', summary?.pendingLpo ?? 0, 'text-amber-600'],
              ['Pending Stmt', summary?.pendingStatement ?? 0, 'text-orange-600'],
              ['Exceptions', summary?.exceptions ?? 0, 'text-red-600'],
            ].map(([label, value, color]) => (
              <div key={String(label)} className="bg-white dark:bg-gray-800 rounded-lg border dark:border-gray-700 p-2.5">
                <div className="text-[10px] uppercase tracking-wide text-gray-500">{label}</div>
                <div className={`text-base font-semibold ${color}`}>
                  {typeof value === 'number' ? value.toLocaleString() : value}
                </div>
              </div>
            ))}
          </div>

          {stationScopeIssues.length > 0 && (
            <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-4">
              <p className="text-sm font-medium text-amber-900 dark:text-amber-200">
                {stationScopeIssues.length} statement row(s) have station names outside selected
                stations
              </p>
              <ul className="mt-2 text-xs text-amber-800 dark:text-amber-300 space-y-1 max-h-32 overflow-y-auto">
                {stationScopeIssues.slice(0, 8).map((row) => (
                  <li key={row.statementLineIndex}>
                    Row {row.statementRowNumber} · {row.station} · {row.truckNoRaw || row.truckNo} ·{' '}
                    {row.liters}L
                  </li>
                ))}
                {stationScopeIssues.length > 8 && (
                  <li>
                    …and {stationScopeIssues.length - 8} more — use Exceptions filter on Statement entries
                  </li>
                )}
              </ul>
              <p className="text-xs text-amber-700 dark:text-amber-400 mt-2">
                Re-upload the statement and map station names in the import dialog, or add the
                station using the station selector in the tab bar then re-upload.
              </p>
            </div>
          )}

          <div className="bg-white dark:bg-gray-800 shadow rounded-lg transition-colors">
            <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 flex flex-wrap items-end justify-between gap-3">
              <div className="flex flex-wrap gap-2 items-center">
                <button
                  type="button"
                  onClick={() => setSessionTableView('lines')}
                  className={`px-3 py-1.5 text-sm rounded-md border ${
                    sessionTableView === 'lines'
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-white dark:bg-gray-800 dark:border-gray-600'
                  }`}
                >
                  Reconciliation lines
                </button>
                <button
                  type="button"
                  onClick={() => setSessionTableView('variance')}
                  className={`px-3 py-1.5 text-sm rounded-md border ${
                    sessionTableView === 'variance'
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-white dark:bg-gray-800 dark:border-gray-600'
                  }`}
                >
                  Statement entries ({statementTabCount})
                </button>
              </div>
              {!isClosed && (
                <div className="flex flex-wrap items-end gap-2">
                  <label className="text-[10px] text-gray-500 dark:text-gray-400 shrink-0">
                    LPO from
                    <input
                      type="date"
                      value={sessionDateFromSelection}
                      onChange={(e) => setSessionDateFromSelection(e.target.value)}
                      className="mt-0.5 block w-[140px] px-2 h-[34px] text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 box-border"
                    />
                  </label>
                  <label className="text-[10px] text-gray-500 dark:text-gray-400 shrink-0">
                    LPO to
                    <input
                      type="date"
                      value={sessionDateToSelection}
                      onChange={(e) => setSessionDateToSelection(e.target.value)}
                      className="mt-0.5 block w-[140px] px-2 h-[34px] text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 box-border"
                    />
                  </label>
                  <div className="w-[220px]">
                    <StationMultiSelect
                      compact
                      label="Stations"
                      options={sessionStationOptions}
                      customStations={sessionCustomStations}
                      selected={sessionStationSelection}
                      onChange={setSessionStationSelection}
                    />
                  </div>
                  <button
                    type="button"
                    disabled={
                      !sessionStationSelection.length ||
                      !sessionDateFromSelection ||
                      !sessionDateToSelection ||
                      mutations.updateSessionStations.isPending ||
                      !sessionScopeDirty
                    }
                    onClick={handleApplySessionScope}
                    className="inline-flex items-center px-3 text-sm rounded-md bg-indigo-600 text-white disabled:opacity-50 h-[34px] box-border"
                  >
                    {mutations.updateSessionStations.isPending && (
                      <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                    )}
                    Apply &amp; reload LPO
                  </button>
                  {sessionScopeDirty && (
                    <span className="text-xs text-amber-600 dark:text-amber-400 pb-1">
                      Apply to reload LPO for this range
                    </span>
                  )}
                </div>
              )}
            </div>

            {sessionTableView === 'variance' && (
              <>
                <div className="px-4 py-3 space-y-2 border-b border-gray-200 dark:border-gray-700">
                  <div className="flex flex-wrap gap-2">
                    {(
                      [
                        ['all', 'All'],
                        ['matched', 'Matched'],
                        ['unmatched', 'Unmatched'],
                        ['exceptions', 'Exceptions'],
                        ['dropped', 'Dropped'],
                      ] as const
                    ).map(([f, label]) => (
                      <button
                        key={f}
                        type="button"
                        onClick={() => setStmtFilter(f)}
                        className={`px-3 py-1 text-sm rounded-full border ${
                          stmtFilter === f
                            ? f === 'dropped'
                              ? 'bg-gray-700 text-white border-gray-700'
                              : 'bg-blue-600 text-white border-blue-600'
                            : 'bg-white dark:bg-gray-800 dark:border-gray-600'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  <div className="overflow-x-auto">
                    <div className="flex flex-nowrap items-center gap-2 min-w-max">
                      <input
                        type="text"
                        placeholder="Search truck, station, reason…"
                        value={stmtSearch}
                        onChange={(e) => setStmtSearch(e.target.value)}
                        className="shrink-0 w-[220px] px-3 h-[34px] text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                      />
                      <FilterMultiSelect
                        options={statementFilterOptions?.trucks || []}
                        selected={stmtTruckFilter}
                        onChange={setStmtTruckFilter}
                        placeholder="Truck filter"
                        searchable
                        searchPlaceholder="Search trucks…"
                        widthClass="w-[200px]"
                      />
                      <FilterMultiSelect
                        options={statementFilterOptions?.stations || []}
                        selected={stmtStationFilter}
                        onChange={setStmtStationFilter}
                        placeholder="Station filter"
                        widthClass="w-[200px]"
                      />
                      <FilterMultiSelect
                        options={(statementFilterOptions?.details || []).map((d) => d.code)}
                        selected={stmtDetailFilter}
                        onChange={setStmtDetailFilter}
                        placeholder="Details filter"
                        searchable
                        searchPlaceholder="Search details…"
                        widthClass="w-[260px]"
                        optionLabels={Object.fromEntries(
                          (statementFilterOptions?.details || []).map((d) => [
                            d.code,
                            `${EXCEPTION_CODE_LABELS[d.code] || d.label}${d.count > 0 ? ` (${d.count})` : ''}`,
                          ])
                        )}
                      />
                      <button
                        type="button"
                        onClick={() => {
                          setStmtSearch('');
                          setStmtTruckFilter([]);
                          setStmtStationFilter([]);
                          setStmtDetailFilter([]);
                        }}
                        className="h-[34px] px-3 text-sm border rounded-md dark:border-gray-600 shrink-0 whitespace-nowrap"
                      >
                        Clear filters
                      </button>
                      {statementRowsPagination && statementRowsPagination.total > 0 && (
                        <span className="text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap shrink-0 inline-flex items-center gap-1.5">
                          {stmtFilterLoading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                          Showing {displayStatementRows.length} of {statementRowsPagination.total} statement rows
                        </span>
                      )}
                      {stmtFilterLoading && !(statementRowsPagination && statementRowsPagination.total > 0) && (
                        <span className="text-xs text-gray-500 inline-flex items-center gap-1.5 shrink-0">
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          Loading…
                        </span>
                      )}
                    </div>
                  </div>
                  {!isClosed && selectedStmtIndexes.size > 0 && (
                    <div className="flex flex-wrap items-center gap-2 p-2 rounded-md bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800">
                      <span className="text-xs text-indigo-900 dark:text-indigo-200">
                        {selectedStmtIndexes.size} statement row(s) selected
                      </span>
                      <button
                        type="button"
                        onClick={openLinkModalFromStatement}
                        className="text-xs px-2 py-1 rounded bg-indigo-600 text-white"
                      >
                        Link to LPO…
                      </button>
                      <button
                        type="button"
                        onClick={() => setSelectedStmtIndexes(new Set())}
                        className="text-xs px-2 py-1 rounded border dark:border-gray-600"
                      >
                        Clear selection
                      </button>
                    </div>
                  )}
                </div>
                {statementRowsLoading && displayStatementRows.length === 0 ? (
                  <div className="px-4 py-8 text-center">
                    <Loader2 className="w-6 h-6 animate-spin inline" />
                  </div>
                ) : displayStatementRows.length === 0 && !stmtFilterLoading ? (
                  <div className="text-center py-8 sm:py-12 text-gray-500 dark:text-gray-400">
                    <p className="text-sm sm:text-base">
                      {stmtFilter === 'dropped'
                        ? 'No dropped statement trucks'
                        : 'No statement rows in this filter'}
                    </p>
                  </div>
                ) : displayStatementRows.length === 0 && stmtFilterLoading ? (
                  <div className="px-4 py-8 text-center">
                    <Loader2 className="w-6 h-6 animate-spin inline" />
                  </div>
                ) : (
                  <div className="relative">
                    <TableFetchOverlay show={stmtFilterLoading} />
                    <div ref={stmtScrollRef} className="max-h-[min(70vh,720px)] overflow-auto">
                    <table className="w-full table-fixed divide-y divide-gray-200 dark:divide-gray-700">
                      <colgroup>
                        {!isClosed && <col className="w-8" />}
                        <col className="w-10" />
                        <col className="w-24" />
                        <col className="w-20" />
                        <col className="w-24" />
                        <col className="w-28" />
                        <col className="w-14" />
                        <col className="w-24" />
                        <col className="w-14" />
                        {/* Details — takes remaining width before Date + Actions */}
                        <col />
                        <col className="w-14" />
                        <col className="w-32" />
                      </colgroup>
                      <thead className="bg-gray-50 dark:bg-gray-800">
                        <tr>
                          {!isClosed && (
                            <th className="px-2 py-1.5 w-8 text-left text-xs font-medium text-gray-500 uppercase">
                              {' '}
                            </th>
                          )}
                          <th className="px-3 py-1.5 text-left text-xs font-medium text-gray-500 dark:text-gray-100 uppercase tracking-wider">
                            S/N
                          </th>
                          <SortableTh
                            label="Status"
                            sortKey="status"
                            activeKey={stmtSortBy}
                            dir={stmtSortDir}
                            onSort={toggleStmtSort}
                          />
                          <SortableTh
                            label="Stmt row"
                            sortKey="stmtRow"
                            activeKey={stmtSortBy}
                            dir={stmtSortDir}
                            onSort={toggleStmtSort}
                          />
                          <SortableTh
                            label="Stmt truck"
                            sortKey="truck"
                            activeKey={stmtSortBy}
                            dir={stmtSortDir}
                            onSort={toggleStmtSort}
                          />
                          <SortableTh
                            label="Station"
                            sortKey="station"
                            activeKey={stmtSortBy}
                            dir={stmtSortDir}
                            onSort={toggleStmtSort}
                          />
                          <SortableTh
                            label="Stmt L"
                            sortKey="stmtLiters"
                            activeKey={stmtSortBy}
                            dir={stmtSortDir}
                            onSort={toggleStmtSort}
                            align="right"
                          />
                          <th className="px-3 py-1.5 text-left text-xs font-medium text-gray-500 dark:text-gray-100 uppercase tracking-wider">
                            LPO truck
                          </th>
                          <SortableTh
                            label="LPO L"
                            sortKey="lpoLiters"
                            activeKey={stmtSortBy}
                            dir={stmtSortDir}
                            onSort={toggleStmtSort}
                            align="right"
                          />
                          <th className="px-3 py-1.5 text-left text-xs font-medium text-gray-500 dark:text-gray-100 uppercase tracking-wider min-w-0">
                            Details
                          </th>
                          <SortableTh
                            label="Date"
                            sortKey="date"
                            activeKey={stmtSortBy}
                            dir={stmtSortDir}
                            onSort={toggleStmtSort}
                          />
                          <th className="px-2 py-1.5 text-left text-xs font-medium text-gray-500 dark:text-gray-100 uppercase tracking-wider">
                            Actions
                          </th>
                        </tr>
                      </thead>
                      <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                        {displayStatementRows.map((row, index) => (
                          <tr
                            key={row.statementLineIndex}
                            className={`hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors ${
                              selectedStmtIndexes.has(row.statementLineIndex)
                                ? 'bg-indigo-50/60 dark:bg-indigo-900/20'
                                : ''
                            }`}
                          >
                            {!isClosed && (
                              <td className="px-2 py-1 h-8 align-middle">
                                {row.selectable && (
                                  <input
                                    type="checkbox"
                                    checked={selectedStmtIndexes.has(row.statementLineIndex)}
                                    onChange={() => toggleStmtSelection(row.statementLineIndex)}
                                    className="rounded border-gray-300"
                                  />
                                )}
                              </td>
                            )}
                            <td className="px-3 py-1 h-8 leading-5 align-middle whitespace-nowrap text-xs text-gray-900 dark:text-gray-100">
                              {index + 1}
                            </td>
                            <TruncateTd
                              text={row.matchStatus.replace(/_/g, ' ')}
                              className={`font-medium ${MATCH_COLORS[row.matchStatus] || ''}`}
                            />
                            <TruncateTd
                              text={
                                row.sn != null
                                  ? `#${row.sn} · Row ${row.statementRowNumber}`
                                  : `Row ${row.statementRowNumber}`
                              }
                              className="font-mono text-gray-900 dark:text-gray-100"
                            />
                            <TruncateTd
                              text={row.truckNoRaw || row.truckNo}
                              className="font-mono text-blue-600 dark:text-blue-400"
                            />
                            <TruncateTd text={row.station} className="text-gray-900 dark:text-gray-100" />
                            <td className="px-3 py-1 h-8 leading-5 align-middle whitespace-nowrap text-xs text-right text-gray-900 dark:text-gray-100">
                              {row.liters}
                            </td>
                            <TruncateTd
                              text={row.lpoTruckNo}
                              className="font-mono text-blue-600 dark:text-blue-400"
                            />
                            <td className="px-3 py-1 h-8 leading-5 align-middle whitespace-nowrap text-xs text-right text-gray-900 dark:text-gray-100">
                              {row.lpoLiters ?? '—'}
                            </td>
                            <TruncateTd
                              text={row.exceptionMessage}
                              className="text-gray-600 dark:text-gray-400 min-w-0"
                              title={row.exceptionMessage || undefined}
                            />
                            <td
                              className="px-2 py-1 h-8 leading-5 align-middle whitespace-nowrap text-xs text-gray-900 dark:text-gray-100"
                              title={row.date || undefined}
                            >
                              {formatShortDate(row.date)}
                            </td>
                            <td className="px-2 py-1 h-8 align-middle whitespace-nowrap">
                              {!isClosed && (
                                <div className="flex flex-nowrap items-center gap-1">
                                  {(row.matchStatus === 'unmatched_statement' ||
                                    row.matchStatus === 'liter_mismatch' ||
                                    row.matchStatus === 'dropped' ||
                                    row.matchStatus === 'split_merge_candidate' ||
                                    row.exceptionCode === 'TRUCK_STATION_LITER_MISMATCH' ||
                                    row.exceptionCode === 'DUPLICATE_STATEMENT_LOCKED') && (
                                    <button
                                      type="button"
                                      onClick={() => openFixFromStatementRow(row)}
                                      className="text-[11px] leading-none px-1.5 py-1 rounded bg-teal-100 text-teal-800 dark:bg-teal-900/40"
                                    >
                                      {row.matchStatus === 'dropped' ? 'Revive' : 'Fix'}
                                    </button>
                                  )}
                                  {row.matchStatus === 'unmatched_statement' && (
                                    <button
                                      type="button"
                                      onClick={() => handleDropStatementRow(row)}
                                      className="text-[11px] leading-none px-1.5 py-1 rounded bg-gray-100 dark:bg-gray-700"
                                    >
                                      Drop
                                    </button>
                                  )}
                                </div>
                              )}
                            </td>
                          </tr>
                        ))}
                        <InfiniteScrollSentinel
                          rootRef={stmtScrollRef}
                          hasNextPage={!!statementRowsHasNext}
                          isFetchingNextPage={statementRowsFetchingNext}
                          fetchNextPage={fetchNextStatementRowsPage}
                          colSpan={isClosed ? 11 : 12}
                        />
                      </tbody>
                    </table>
                    </div>
                  </div>
                )}
              </>
            )}

            {sessionTableView === 'lines' && (
              <>
                <div className="px-4 py-3 space-y-2 border-b border-gray-200 dark:border-gray-700">
                  <div className="flex flex-wrap gap-2">
                    {(
                      [
                        ['all', 'All'],
                        ['matched', 'Matched'],
                        ['pending', 'Pending'],
                        ['exceptions', 'Exceptions'],
                      ] as const
                    ).map(([f, label]) => (
                      <button
                        key={f}
                        type="button"
                        onClick={() => setLineFilter(f)}
                        className={`px-3 py-1 text-sm rounded-full border ${
                          lineFilter === f
                            ? 'bg-blue-600 text-white border-blue-600'
                            : 'bg-white dark:bg-gray-800 dark:border-gray-600'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  <div className="overflow-x-auto">
                    <div className="flex flex-nowrap items-center gap-2 min-w-max">
                      <input
                        type="text"
                        placeholder="Search truck, station, reason…"
                        value={lineSearch}
                        onChange={(e) => setLineSearch(e.target.value)}
                        className="shrink-0 w-[220px] px-3 h-[34px] text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                      />
                      <select
                        value={lineTruckFilter}
                        onChange={(e) => setLineTruckFilter(e.target.value)}
                        className={FILTER_SELECT_CLASS}
                        aria-label="Truck filter"
                      >
                        <option value="">All trucks</option>
                        {(lineFilterOptions?.trucks || []).map((truck) => (
                          <option key={truck} value={truck}>
                            {truck}
                          </option>
                        ))}
                      </select>
                      <select
                        value={lineStationFilter}
                        onChange={(e) => setLineStationFilter(e.target.value)}
                        className={FILTER_SELECT_CLASS}
                        aria-label="Station filter"
                      >
                        <option value="">All stations</option>
                        {(lineFilterOptions?.stations || []).map((station) => (
                          <option key={station} value={station}>
                            {station}
                          </option>
                        ))}
                      </select>
                      <select
                        value={lineExceptionFilter}
                        onChange={(e) => setLineExceptionFilter(e.target.value)}
                        className={`${FILTER_SELECT_CLASS} w-[180px]`}
                        aria-label="Exception filter"
                      >
                        <option value="">All exceptions</option>
                        {(lineFilterOptions?.exceptionCodes || []).map(({ code, count }) => (
                          <option key={code} value={code}>
                            {EXCEPTION_CODE_LABELS[code] || code}
                            {count > 0 ? ` (${count})` : ''}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() => {
                          setLineSearch('');
                          setLineTruckFilter('');
                          setLineStationFilter('');
                          setLineExceptionFilter('');
                        }}
                        className="h-[34px] px-3 text-sm border rounded-md dark:border-gray-600 shrink-0 whitespace-nowrap"
                      >
                        Clear filters
                      </button>
                      {linesPagination && linesPagination.total > 0 && (
                        <span className="text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap shrink-0 inline-flex items-center gap-1.5">
                          {linesFilterLoading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                          Showing {displayLines.length} of {linesPagination.total} lines
                        </span>
                      )}
                      {linesFilterLoading && !(linesPagination && linesPagination.total > 0) && (
                        <span className="text-xs text-gray-500 inline-flex items-center gap-1.5 shrink-0">
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          Loading…
                        </span>
                      )}
                    </div>
                  </div>
                  {!isClosed && selectedLineIds.size > 0 && (
                    <div className="flex flex-wrap items-center gap-2 p-2 rounded-md bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800">
                      <span className="text-xs text-indigo-900 dark:text-indigo-200">
                        {selectedLineIds.size} LPO line(s) selected
                      </span>
                      <button
                        type="button"
                        onClick={openLinkModalFromLpo}
                        className="text-xs px-2 py-1 rounded bg-indigo-600 text-white"
                      >
                        Link to statement…
                      </button>
                      <button
                        type="button"
                        onClick={() => setSelectedLineIds(new Set())}
                        className="text-xs px-2 py-1 rounded border dark:border-gray-600"
                      >
                        Clear selection
                      </button>
                    </div>
                  )}
                </div>
                {sessionLoading || (linesLoading && displayLines.length === 0) ? (
                  <div className="px-4 py-8 text-center">
                    <Loader2 className="w-6 h-6 animate-spin inline" />
                  </div>
                ) : displayLines.length === 0 && !linesFilterLoading ? (
                  <div className="text-center py-8 sm:py-12 text-gray-500 dark:text-gray-400">
                    <p className="text-sm sm:text-base">No lines in this filter</p>
                  </div>
                ) : displayLines.length === 0 && linesFilterLoading ? (
                  <div className="px-4 py-8 text-center">
                    <Loader2 className="w-6 h-6 animate-spin inline" />
                  </div>
                ) : (
                  <div className="relative">
                    <TableFetchOverlay show={linesFilterLoading} />
                    <div ref={linesScrollRef} className="max-h-[min(70vh,720px)] overflow-auto">
                <table className="w-full table-fixed divide-y divide-gray-200 dark:divide-gray-700">
                  <colgroup>
                    {!isClosed && <col className="w-8" />}
                    <col className="w-10" />
                    <col className="w-24" />
                    <col className="w-20" />
                    <col className="w-24" />
                    <col className="w-14" />
                    <col className="w-24" />
                    <col className="w-14" />
                    <col className="w-28" />
                    {/* Details — takes remaining width before Date + Actions */}
                    <col />
                    <col className="w-14" />
                    <col className="w-32" />
                  </colgroup>
                  <thead className="bg-gray-50 dark:bg-gray-800">
                    <tr>
                      {!isClosed && (
                        <th className="px-2 py-1.5 w-8 text-left text-xs font-medium text-gray-500 uppercase">
                          {' '}
                        </th>
                      )}
                      <th className="px-3 py-1.5 text-left text-xs font-medium text-gray-500 dark:text-gray-100 uppercase tracking-wider">
                        S/N
                      </th>
                      <SortableTh
                        label="Status"
                        sortKey="status"
                        activeKey={lineSortBy}
                        dir={lineSortDir}
                        onSort={toggleLineSort}
                      />
                      <SortableTh
                        label="Stmt row"
                        sortKey="stmtRow"
                        activeKey={lineSortBy}
                        dir={lineSortDir}
                        onSort={toggleLineSort}
                      />
                      <SortableTh
                        label="LPO truck"
                        sortKey="lpoTruck"
                        activeKey={lineSortBy}
                        dir={lineSortDir}
                        onSort={toggleLineSort}
                      />
                      <SortableTh
                        label="LPO L"
                        sortKey="lpoLiters"
                        activeKey={lineSortBy}
                        dir={lineSortDir}
                        onSort={toggleLineSort}
                        align="right"
                      />
                      <SortableTh
                        label="Stmt truck"
                        sortKey="stmtTruck"
                        activeKey={lineSortBy}
                        dir={lineSortDir}
                        onSort={toggleLineSort}
                      />
                      <SortableTh
                        label="Stmt L"
                        sortKey="stmtLiters"
                        activeKey={lineSortBy}
                        dir={lineSortDir}
                        onSort={toggleLineSort}
                        align="right"
                      />
                      <SortableTh
                        label="Station"
                        sortKey="station"
                        activeKey={lineSortBy}
                        dir={lineSortDir}
                        onSort={toggleLineSort}
                      />
                      <th className="px-3 py-1.5 text-left text-xs font-medium text-gray-500 dark:text-gray-100 uppercase tracking-wider min-w-0">
                        Details
                      </th>
                      <SortableTh
                        label="Date"
                        sortKey="lpoDate"
                        activeKey={lineSortBy}
                        dir={lineSortDir}
                        onSort={toggleLineSort}
                      />
                      <th className="px-2 py-1.5 text-left text-xs font-medium text-gray-500 dark:text-gray-100 uppercase tracking-wider">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                    {displayLines.map((line, index) => (
                      <tr
                        key={line._id}
                        className={`hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors ${
                          line._id && selectedLineIds.has(line._id) ? 'bg-indigo-50/60 dark:bg-indigo-900/20' : ''
                        }`}
                      >
                        {!isClosed && (
                          <td className="px-2 py-1 h-8 align-middle" onClick={(e) => e.stopPropagation()}>
                            {line._id && lineIsSelectable(line) && (
                              <input
                                type="checkbox"
                                checked={selectedLineIds.has(line._id)}
                                onChange={() => toggleLineSelection(line._id!)}
                                className="rounded border-gray-300"
                              />
                            )}
                          </td>
                        )}
                        <td className="px-3 py-1 h-8 leading-5 align-middle whitespace-nowrap text-xs text-gray-900 dark:text-gray-100">
                          {index + 1}
                        </td>
                        {(() => {
                          const statusText =
                            line.matchStatus.replace(/_/g, ' ') +
                            (line.matchType && line.matchType !== 'one_to_one'
                              ? ` · ${line.matchType.replace(/_/g, ' ')}`
                              : '');
                          return (
                            <TruncateTd
                              text={statusText}
                              className={`font-medium ${MATCH_COLORS[line.matchStatus] || ''}`}
                            />
                          );
                        })()}
                        <TruncateTd
                          text={stmtRowLabel(line)}
                          className="font-mono text-gray-900 dark:text-gray-100"
                        />
                        <TruncateTd
                          text={displayTruck(line, 'lpo')}
                          className="font-mono text-blue-600 dark:text-blue-400"
                        />
                        <td className="px-3 py-1 h-8 leading-5 align-middle whitespace-nowrap text-xs text-right text-gray-900 dark:text-gray-100">
                          {line.lpoLiters ?? '—'}
                        </td>
                        <TruncateTd
                          text={displayTruck(line, 'stmt')}
                          className="font-mono text-blue-600 dark:text-blue-400"
                        />
                        <td className="px-3 py-1 h-8 leading-5 align-middle whitespace-nowrap text-xs text-right text-gray-900 dark:text-gray-100">
                          {line.statementLiters ?? '—'}
                        </td>
                        <TruncateTd
                          text={line.lpoStation || line.statementStation}
                          className="text-gray-900 dark:text-gray-100"
                        />
                        <TruncateTd
                          className="text-gray-600 dark:text-gray-400 min-w-0"
                          text={line.exceptionMessage}
                          title={line.exceptionMessage || undefined}
                        />
                        <td
                          className="px-2 py-1 h-8 leading-5 align-middle whitespace-nowrap text-xs text-gray-900 dark:text-gray-100"
                          title={line.lpoDate || undefined}
                        >
                          {formatShortDate(line.lpoDate)}
                        </td>
                        <td className="px-2 py-1 h-8 align-middle whitespace-nowrap">
                          {!isClosed && (
                            <div className="flex flex-nowrap items-center gap-1">
                              {(line.matchStatus === 'stale_pending' ||
                                line.matchStatus === 'split_merge_candidate') &&
                                line.userDecision !== 'accept' && (
                                  <button
                                    type="button"
                                    onClick={() => handleLineAction(line, { userDecision: 'accept' })}
                                    className="text-[11px] leading-none px-1.5 py-1 rounded bg-green-100 text-green-800 dark:bg-green-900/40"
                                  >
                                    Accept
                                  </button>
                                )}
                              {(line.matchStatus === 'stale_pending' ||
                                line.matchStatus === 'unmatched_lpo') && (
                                <button
                                  type="button"
                                  onClick={() => handleLineAction(line, { userDecision: 'drop' })}
                                  className="text-[11px] leading-none px-1.5 py-1 rounded bg-gray-100 dark:bg-gray-700"
                                >
                                  Drop
                                </button>
                              )}
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                    <InfiniteScrollSentinel
                      rootRef={linesScrollRef}
                      hasNextPage={!!linesHasNext}
                      isFetchingNextPage={linesFetchingNext}
                      fetchNextPage={fetchNextLinesPage}
                      colSpan={isClosed ? 11 : 12}
                    />
                  </tbody>
                </table>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {linkModal && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
            <div
              className="absolute inset-0 bg-black/50"
              onClick={() => !linkModalSubmitting && setLinkModal(null)}
            />
            <div className="relative bg-white dark:bg-gray-800 rounded-xl shadow-xl border dark:border-gray-700 w-full max-w-2xl max-h-[85vh] flex flex-col">
              <div className="px-5 py-4 border-b dark:border-gray-700">
                <h3 className="font-semibold text-gray-900 dark:text-gray-100">
                  {linkModal.source === 'lpo' ? 'Link LPO to statement' : 'Link statement to LPO'}
                </h3>
                <p className="text-xs text-gray-500 mt-1">
                  {linkModal.source === 'lpo'
                    ? `${linkModal.lpoLineIds.length} LPO line(s) selected — pick statement row(s) to link`
                    : `${linkModal.statementIndexes.length} statement row(s) selected — pick LPO line(s) to link`}
                </p>
                <input
                  type="text"
                  placeholder={
                    linkModal.source === 'lpo'
                      ? 'Search statement truck, station, row…'
                      : 'Search LPO truck, station…'
                  }
                  value={linkModalSearch}
                  onChange={(e) => setLinkModalSearch(e.target.value)}
                  className="mt-3 w-full px-3 h-[34px] text-sm border rounded-md dark:border-gray-600 dark:bg-gray-700"
                />
              </div>
              <div className="flex-1 overflow-y-auto px-5 py-3">
                {linkCandidatesLoading ? (
                  <div className="py-8 text-center">
                    <Loader2 className="w-6 h-6 animate-spin inline" />
                  </div>
                ) : linkModal.source === 'lpo' ? (
                  (linkCandidates?.statementRows || []).length === 0 ? (
                    <p className="text-sm text-gray-500 py-6 text-center">No available statement rows</p>
                  ) : (
                    <div className="space-y-1">
                      {(linkCandidates?.statementRows || []).map((row) => {
                        const key = String(row.statementLineIndex);
                        return (
                          <label
                            key={key}
                            className="flex items-start gap-2 p-2 rounded hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer text-sm"
                          >
                            <input
                              type="checkbox"
                              className="mt-0.5 rounded border-gray-300"
                              checked={linkModalSelection.has(key)}
                              onChange={() => toggleLinkModalItem(key)}
                            />
                            <span className="min-w-0">
                              <span className="font-mono text-blue-600 dark:text-blue-400">
                                {row.truckNoRaw || row.truckNo}
                              </span>
                              {' · '}
                              {row.station}
                              {' · '}
                              {row.liters}L
                              {' · '}
                              Row {row.statementRowNumber}
                              {row.exceptionMessage ? (
                                <span className="block text-xs text-gray-500 truncate">
                                  {row.exceptionMessage}
                                </span>
                              ) : null}
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  )
                ) : (linkCandidates?.lpoLines || []).length === 0 ? (
                  <p className="text-sm text-gray-500 py-6 text-center">No available LPO lines</p>
                ) : (
                  <div className="space-y-1">
                    {(linkCandidates?.lpoLines || []).map((line) => {
                      const key = String(line._id);
                      return (
                        <label
                          key={key}
                          className="flex items-start gap-2 p-2 rounded hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer text-sm"
                        >
                          <input
                            type="checkbox"
                            className="mt-0.5 rounded border-gray-300"
                            checked={linkModalSelection.has(key)}
                            onChange={() => toggleLinkModalItem(key)}
                          />
                          <span className="min-w-0">
                            <span className="font-mono text-blue-600 dark:text-blue-400">
                              {displayTruck(line, 'lpo')}
                            </span>
                            {' · '}
                            {line.lpoStation || '—'}
                            {' · '}
                            {line.lpoLiters ?? '—'}L
                            {line.exceptionMessage ? (
                              <span className="block text-xs text-gray-500 truncate">
                                {line.exceptionMessage}
                              </span>
                            ) : null}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>
              <div className="px-5 py-3 border-t dark:border-gray-700 flex flex-wrap justify-end gap-2">
                <button
                  type="button"
                  disabled={linkModalSubmitting}
                  onClick={() => setLinkModal(null)}
                  className="px-3 py-2 text-sm border rounded-md dark:border-gray-600"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={linkModalSubmitting || linkModalSelection.size === 0}
                  onClick={() => submitLinkModal(false)}
                  className="px-3 py-2 text-sm rounded-md bg-indigo-600 text-white disabled:opacity-50"
                >
                  {linkModalSubmitting ? 'Linking…' : 'Link selected'}
                </button>
                <button
                  type="button"
                  disabled={linkModalSubmitting || linkModalSelection.size === 0}
                  onClick={() => submitLinkModal(true)}
                  className="px-3 py-2 text-sm rounded-md bg-green-600 text-white disabled:opacity-50"
                >
                  Link &amp; accept
                </button>
              </div>
            </div>
          </div>
        )}

        {fixLineModal && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
            <div
              className="absolute inset-0 bg-black/50"
              onClick={() => !mutations.updateLine.isPending && setFixLineModal(null)}
            />
            <div className="relative bg-white dark:bg-gray-800 rounded-xl shadow-xl border dark:border-gray-700 w-full max-w-md p-5">
              <h3 className="font-semibold text-gray-900 dark:text-gray-100">
                {fixLineModal.matchStatus === 'dropped' ? 'Revive & re-match' : 'Fix & re-match'}
              </h3>
              <p className="text-xs text-gray-500 mt-1">
                {fixLineModal.matchStatus.replace(/_/g, ' ')} ·{' '}
                {fixLineModal.exceptionMessage || 'Correct the statement truck/station to match our LPO'}
              </p>
              {(fixLineModal.originalStatementTruckNoRaw ||
                fixLineModal.originalStatementTruckNo ||
                fixLineModal.statementTruckNoRaw ||
                fixLineModal.statementTruckNo) && (
                <p className="mt-2 text-xs text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-900/40 rounded-md px-3 py-2">
                  <span className="font-medium text-gray-700 dark:text-gray-300">Original statement truck: </span>
                  <span className="font-mono">
                    {fixLineModal.originalStatementTruckNoRaw ||
                      fixLineModal.originalStatementTruckNo ||
                      fixLineModal.statementTruckNoRaw ||
                      fixLineModal.statementTruckNo}
                  </span>
                  {(fixLineModal.originalStatementTruckNoRaw ||
                    fixLineModal.originalStatementTruckNo) &&
                    fixTruck.trim() &&
                    fixTruck.trim() !==
                      (fixLineModal.originalStatementTruckNoRaw ||
                        fixLineModal.originalStatementTruckNo) && (
                      <>
                        <span className="mx-1.5 text-gray-400">→</span>
                        <span className="font-medium text-gray-700 dark:text-gray-300">Corrected: </span>
                        <span className="font-mono text-teal-700 dark:text-teal-300">{fixTruck.trim()}</span>
                      </>
                    )}
                </p>
              )}
              <div className="mt-4 space-y-3">
                <label className="block text-xs text-gray-600 dark:text-gray-400">
                  Statement truck (corrected to our truck)
                  <input
                    value={fixTruck}
                    onChange={(e) => setFixTruck(e.target.value)}
                    disabled={mutations.updateLine.isPending}
                    className="mt-1 w-full px-3 py-2 text-sm border rounded-md dark:border-gray-600 dark:bg-gray-700 disabled:opacity-50"
                  />
                </label>
                <label className="block text-xs text-gray-600 dark:text-gray-400">
                  Statement station
                  <select
                    value={fixStation}
                    onChange={(e) => setFixStation(e.target.value)}
                    disabled={mutations.updateLine.isPending}
                    className="mt-1 w-full px-3 py-2 text-sm border rounded-md dark:border-gray-600 dark:bg-gray-700 bg-white disabled:opacity-50"
                  >
                    <option value="">Select station…</option>
                    {(session?.stations || []).map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                    {fixStation &&
                      !(session?.stations || []).some(
                        (s) => s.toUpperCase() === fixStation.toUpperCase()
                      ) && <option value={fixStation}>{fixStation} (current)</option>}
                  </select>
                </label>
                {!fixLineChanged && (
                  <p className="text-xs text-amber-600 dark:text-amber-400">
                    Edit the truck or station above before re-matching against LPO lines in the session date range.
                  </p>
                )}
              </div>
              <div className="flex justify-end gap-2 mt-4">
                <button
                  type="button"
                  disabled={mutations.updateLine.isPending}
                  onClick={() => setFixLineModal(null)}
                  className="px-3 py-2 text-sm border rounded-md dark:border-gray-600 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={submitFixLine}
                  disabled={!fixLineChanged || mutations.updateLine.isPending}
                  className="inline-flex items-center px-3 py-2 text-sm rounded-md bg-teal-600 text-white disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {mutations.updateLine.isPending && (
                    <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                  )}
                  {mutations.updateLine.isPending
                    ? 'Re-matching…'
                    : fixLineModal.matchStatus === 'dropped'
                      ? 'Revive & re-match'
                      : 'Save & re-match'}
                </button>
              </div>
            </div>
          </div>
        )}

        {leaveModalOpen && session && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/50" onClick={() => !leaveLoading && setLeaveModalOpen(false)} />
            <div className="relative bg-white dark:bg-gray-800 rounded-xl shadow-xl border dark:border-gray-700 w-full max-w-md p-5">
              <h3 className="font-semibold text-gray-900 dark:text-gray-100">Leave reconciliation?</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">
                <strong>{session.sessionNo}</strong> is still in progress. Save as draft before leaving, or discard
                changes.
              </p>
              <div className="flex flex-col gap-2 mt-4">
                <button
                  disabled={leaveLoading}
                  onClick={() => runPendingNavigation(true)}
                  className="w-full px-4 py-2 text-sm rounded-md bg-blue-600 text-white disabled:opacity-50"
                >
                  {leaveLoading ? 'Saving…' : 'Save draft & continue'}
                </button>
                <button
                  disabled={leaveLoading}
                  onClick={() => runPendingNavigation(false)}
                  className="w-full px-4 py-2 text-sm rounded-md border dark:border-gray-600"
                >
                  Leave without saving
                </button>
                <button
                  disabled={leaveLoading}
                  onClick={handleDropCurrent}
                  className="w-full px-4 py-2 text-sm rounded-md text-red-600 border border-red-200 dark:border-red-800"
                >
                  Discard (drop session)
                </button>
                <button
                  disabled={leaveLoading}
                  onClick={() => {
                    setLeaveModalOpen(false);
                    setPendingNav(null);
                  }}
                  className="w-full px-4 py-2 text-sm text-gray-500"
                >
                  Cancel — stay here
                </button>
              </div>
            </div>
          </div>
        )}

        <ConfirmModal
          open={!!confirmDialog}
          title={confirmDialog?.title || ''}
          message={confirmDialog?.message || ''}
          variant={confirmDialog?.variant || 'danger'}
          confirmLabel={confirmDialog?.confirmLabel || 'Confirm'}
          loading={confirmLoading}
          onConfirm={runConfirmDialog}
          onCancel={() => !confirmLoading && setConfirmDialog(null)}
        />
      </>
    );
  }

  /* ── List / pending views ── */
  const globalPendingCount = pendingBadgeList.length;

  return (
    <div className="space-y-5">
      {/* Sub-tabs */}
      <div className="inline-flex rounded-md shadow-sm overflow-hidden border dark:border-gray-600">
        <button
          onClick={() => switchSubTab('sessions')}
          className={`px-4 py-2 text-sm font-medium inline-flex items-center gap-1.5 ${
            subTab === 'sessions'
              ? 'bg-indigo-600 text-white'
              : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
          }`}
        >
          <List className="w-4 h-4" />
          Sessions
        </button>
        <button
          onClick={() => switchSubTab('pending')}
          className={`px-4 py-2 text-sm font-medium inline-flex items-center gap-1.5 border-l dark:border-gray-600 ${
            subTab === 'pending'
              ? 'bg-indigo-600 text-white'
              : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
          }`}
        >
          <Clock className="w-4 h-4" />
          Pending entries
          {globalPendingCount > 0 && (
            <span className="ml-1 px-1.5 py-0.5 text-[10px] rounded-full bg-amber-500 text-white">
              {globalPendingCount > 99 ? '99+' : globalPendingCount}
            </span>
          )}
        </button>
        <button
          onClick={() => switchSubTab('dropped')}
          className={`px-4 py-2 text-sm font-medium inline-flex items-center gap-1.5 border-l dark:border-gray-600 ${
            subTab === 'dropped'
              ? 'bg-indigo-600 text-white'
              : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
          }`}
        >
          <XCircle className="w-4 h-4" />
          Dropped entries
        </button>
      </div>

      {subTab === 'sessions' && (
        <>
          <div className="flex justify-end">
            <button
              type="button"
              onClick={openCreateModal}
              className="inline-flex items-center px-4 py-2 text-sm rounded-md text-white bg-blue-600 hover:bg-blue-700"
            >
              <Plus className="w-4 h-4 mr-1" />
              New reconciliation
            </button>
          </div>

          <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-3 mb-6 transition-colors">
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
              <div className="col-span-2 md:col-span-1">
                <input
                  type="text"
                  placeholder="Search session#, title, station..."
                  value={sessionSearch}
                  onChange={(e) => setSessionSearch(e.target.value)}
                  className="w-full px-3 h-[34px] text-sm border border-gray-300 dark:border-gray-600 rounded-md focus:ring-2 focus:ring-blue-600 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500"
                />
              </div>

              <div className="relative" ref={sessionStationDropdownRef}>
                <button
                  type="button"
                  onClick={() => setShowSessionStationDropdown(!showSessionStationDropdown)}
                  className="w-full px-3 h-[34px] text-sm border border-gray-300 dark:border-gray-600 rounded-md focus:ring-2 focus:ring-blue-600 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 flex items-center justify-between gap-2"
                >
                  <span>
                    {sessionStationFilter.length === 0
                      ? 'All Stations'
                      : `${sessionStationFilter.length} Station${sessionStationFilter.length === 1 ? '' : 's'}`}
                  </span>
                  <ChevronDown className="w-4 h-4 text-gray-400" />
                </button>
                {showSessionStationDropdown && (
                  <div className="absolute z-50 mt-1 w-full bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md shadow-lg max-h-60 overflow-auto">
                    <button
                      type="button"
                      onClick={() => setSessionStationFilter([])}
                      className="w-full px-4 py-2 text-left hover:bg-gray-100 dark:hover:bg-gray-600 text-gray-900 dark:text-gray-100 flex items-center justify-between"
                    >
                      <span>All Stations</span>
                      {sessionStationFilter.length === 0 && <Check className="w-4 h-4 text-blue-600" />}
                    </button>
                    {billableStations.map((station: string) => (
                      <button
                        key={station}
                        type="button"
                        onClick={() => {
                          setSessionStationFilter((current) => {
                            const normalized = station.trim().toUpperCase();
                            return current.includes(normalized)
                              ? current.filter((value) => value !== normalized)
                              : [...current, normalized].sort();
                          });
                        }}
                        className="w-full px-4 py-2 text-left hover:bg-gray-100 dark:hover:bg-gray-600 text-gray-900 dark:text-gray-100 flex items-center justify-between"
                      >
                        <span>{station}</span>
                        {sessionStationFilter.includes(station.trim().toUpperCase()) && (
                          <Check className="w-4 h-4 text-blue-600" />
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <input
                type="date"
                title="Period from"
                value={sessionListDateFrom}
                onChange={(e) => setSessionListDateFrom(e.target.value)}
                className="w-full px-3 h-[34px] text-sm border border-gray-300 dark:border-gray-600 rounded-md focus:ring-2 focus:ring-blue-600 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
              />
              <input
                type="date"
                title="Period to"
                value={sessionListDateTo}
                min={sessionListDateFrom || undefined}
                onChange={(e) => setSessionListDateTo(e.target.value)}
                className="w-full px-3 h-[34px] text-sm border border-gray-300 dark:border-gray-600 rounded-md focus:ring-2 focus:ring-blue-600 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
              />

              <select
                value={sessionStatusFilter}
                onChange={(e) => setSessionStatusFilter(e.target.value as SessionStatusFilter)}
                className="w-full px-3 h-[34px] text-sm border border-gray-300 dark:border-gray-600 rounded-md focus:ring-2 focus:ring-blue-600 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
              >
                <option value="">All Status</option>
                <option value="draft">Draft</option>
                <option value="in_progress">In progress</option>
                <option value="completed">Completed</option>
                <option value="dropped">Dropped</option>
              </select>

              <button
                type="button"
                onClick={() => {
                  setSessionSearch('');
                  setSessionStationFilter([]);
                  setSessionListDateFrom('');
                  setSessionListDateTo('');
                  setSessionStatusFilter('');
                }}
                className="col-span-2 md:col-span-1 w-full inline-flex items-center justify-center px-3 h-[34px] border border-gray-300 dark:border-gray-600 rounded-md shadow-sm text-sm font-medium text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              >
                Clear Filters
              </button>
            </div>
          </div>

          <div className="bg-white dark:bg-gray-800 shadow rounded-lg transition-colors">
            {listLoading ? (
              <div className="px-4 py-8 text-center">
                <Loader2 className="w-6 h-6 animate-spin inline" />
              </div>
            ) : (listData?.data || []).length === 0 ? (
              <div className="text-center py-8 sm:py-12 text-gray-500 dark:text-gray-400">
                <p className="text-sm sm:text-base">
                  {sessionSearch ||
                  sessionStationFilter.length ||
                  sessionListDateFrom ||
                  sessionListDateTo ||
                  sessionStatusFilter
                    ? 'No reconciliations match your filters'
                    : 'No reconciliations yet — click New reconciliation to start one'}
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full divide-y divide-gray-200 dark:divide-gray-700">
                  <thead className="bg-gray-50 dark:bg-gray-800">
                    <tr>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-100 uppercase tracking-wider">
                        S/N
                      </th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-100 uppercase tracking-wider">
                        Session
                      </th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-100 uppercase tracking-wider">
                        Title
                      </th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-100 uppercase tracking-wider">
                        Stations
                      </th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-100 uppercase tracking-wider">
                        Period
                      </th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-100 uppercase tracking-wider">
                        Status
                      </th>
                      <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-100 uppercase tracking-wider">
                        Matched
                      </th>
                      <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-100 uppercase tracking-wider">
                        Diff L
                      </th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-100 uppercase tracking-wider">
                        Updated
                      </th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-100 uppercase tracking-wider">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                    {(listData?.data || []).map((row, index) => {
                      const id = sessionId(row);
                      return (
                        <tr
                          key={id}
                          className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
                        >
                          <td className="px-3 py-2 whitespace-nowrap text-xs text-gray-900 dark:text-gray-100">
                            {index + 1}
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap text-xs font-medium font-mono text-blue-600 dark:text-blue-400">
                            {row.sessionNo}
                          </td>
                          <td className="px-3 py-2 text-xs text-gray-900 dark:text-gray-100 max-w-[180px] truncate" title={row.title || undefined}>
                            {row.title || '—'}
                          </td>
                          <td className="px-3 py-2 text-xs text-gray-900 dark:text-gray-100" title={row.stations.join(', ')}>
                            {row.stations.length}
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap text-xs text-gray-900 dark:text-gray-100">
                            {row.dateFrom} – {row.dateTo}
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap">
                            <span className={`px-2 py-0.5 rounded text-xs ${STATUS_COLORS[row.status]}`}>
                              {row.status.replace('_', ' ')}
                            </span>
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap text-xs text-right text-green-600 dark:text-green-400 font-mono">
                            {formatMatchedRatio(row.summary)}
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap text-xs text-right text-red-600 dark:text-red-400">
                            {row.summary?.literDifference ?? 0}
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap text-xs text-gray-900 dark:text-gray-100">
                            {new Date(row.updatedAt).toLocaleDateString()}
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap text-xs">
                            <button
                              onClick={() => openSession(id)}
                              className="text-blue-600 dark:text-blue-400 hover:underline mr-2"
                            >
                              {sessionIsOpen(row.status) ? 'Resume' : 'View'}
                            </button>
                            {(row.status === 'draft' || row.status === 'in_progress') && (
                              <button
                                onClick={() =>
                                  setConfirmDialog({
                                    title: 'Delete draft?',
                                    message: `Delete draft ${row.sessionNo}? This cannot be undone.`,
                                    variant: 'danger',
                                    confirmLabel: 'Delete',
                                    onConfirm: async () => {
                                      await mutations.remove.mutateAsync(id);
                                      toast.success('Draft deleted');
                                    },
                                  })
                                }
                                className="text-red-600 dark:text-red-400"
                              >
                                Delete
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <NewReconciliationModal
            open={createModalOpen}
            onClose={closeCreateModal}
            form={form}
            setForm={setForm}
            stationOptions={stationOptions}
            customStations={customStationsInRange}
            pendingPreviewCount={pendingPreview.length}
            onRequestCreate={handleCreate}
            creating={mutations.create.isPending || mutations.loadLpo.isPending}
            onStationsUserChange={() => {
              userEditedStationsRef.current = true;
            }}
          />
        </>
      )}

      {(subTab === 'pending' || subTab === 'dropped') && (
        <>
          <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-3 mb-6 transition-colors">
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
              <div className="col-span-2 md:col-span-1">
                <StationMultiSelect
                  compact
                  label="Stations"
                  options={billableStations}
                  selected={pendingFilters.stations}
                  onChange={(stations) => setPendingFilters((f) => ({ ...f, stations }))}
                  optionCounts={pendingStationCounts}
                />
              </div>
              <input
                type="month"
                title="Filter by month"
                value={pendingFilters.month}
                onChange={(e) => setPendingMonthFilter(e.target.value)}
                className="w-full px-3 h-[34px] text-sm border border-gray-300 dark:border-gray-600 rounded-md focus:ring-2 focus:ring-blue-600 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
              />
              <input
                type="date"
                title="Pending from"
                value={pendingFilters.dateFrom}
                onChange={(e) =>
                  setPendingFilters((f) => ({ ...f, month: '', dateFrom: e.target.value }))
                }
                className="w-full px-3 h-[34px] text-sm border border-gray-300 dark:border-gray-600 rounded-md focus:ring-2 focus:ring-blue-600 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
              />
              <input
                type="date"
                title="Pending to"
                value={pendingFilters.dateTo}
                min={pendingFilters.dateFrom || undefined}
                onChange={(e) =>
                  setPendingFilters((f) => ({ ...f, month: '', dateTo: e.target.value }))
                }
                className="w-full px-3 h-[34px] text-sm border border-gray-300 dark:border-gray-600 rounded-md focus:ring-2 focus:ring-blue-600 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
              />
              <input
                type="text"
                placeholder="Search truck / LPO / session"
                value={pendingFilters.search}
                onChange={(e) => setPendingFilters((f) => ({ ...f, search: e.target.value }))}
                className="w-full px-3 h-[34px] text-sm border border-gray-300 dark:border-gray-600 rounded-md focus:ring-2 focus:ring-blue-600 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500"
              />
              <button
                type="button"
                onClick={() =>
                  setPendingFilters((f) => ({
                    ...f,
                    month: '',
                    dateFrom: '',
                    dateTo: '',
                    search: '',
                  }))
                }
                className="col-span-2 md:col-span-1 w-full inline-flex items-center justify-center px-3 h-[34px] border border-gray-300 dark:border-gray-600 rounded-md shadow-sm text-sm font-medium text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              >
                Clear Filters
              </button>
            </div>
            <div className="flex flex-wrap gap-3 text-xs text-gray-600 dark:text-gray-400 border-t dark:border-gray-700 pt-3 mt-3">
              <span>
                <strong>{pendingSummary.count}</strong>{' '}
                {subTab === 'dropped' ? 'dropped' : 'pending'} entries
              </span>
              <span>
                <strong>{pendingSummary.liters.toLocaleString()}</strong> L total
              </span>
              {Object.entries(pendingSummary.byStation)
                .slice(0, 6)
                .map(([st, n]) => (
                  <span key={st} className="px-2 py-0.5 rounded bg-gray-100 dark:bg-gray-700">
                    {st}: {n}
                  </span>
                ))}
            </div>
          </div>

          <div className="bg-white dark:bg-gray-800 shadow rounded-lg transition-colors">
            {(subTab === 'pending' ? pendingLoading : droppedLoading) ? (
              <div className="px-4 py-8 text-center">
                <Loader2 className="w-6 h-6 animate-spin inline" />
              </div>
            ) : filteredPending.length === 0 ? (
              <div className="text-center py-8 sm:py-12 text-gray-500 dark:text-gray-400">
                <p className="text-sm sm:text-base">
                  {subTab === 'dropped'
                    ? 'No dropped pending entries for these filters'
                    : 'No pending LPO entries for these filters'}
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full divide-y divide-gray-200 dark:divide-gray-700">
                  <thead className="bg-gray-50 dark:bg-gray-800">
                    <tr>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-100 uppercase tracking-wider">
                        S/N
                      </th>
                      <SortableTh
                        label="LPO date"
                        sortKey="lpoDate"
                        activeKey={pendingSortBy}
                        dir={pendingSortDir}
                        onSort={togglePendingSort}
                      />
                      <SortableTh
                        label="LPO #"
                        sortKey="lpoNo"
                        activeKey={pendingSortBy}
                        dir={pendingSortDir}
                        onSort={togglePendingSort}
                      />
                      <SortableTh
                        label="Station"
                        sortKey="station"
                        activeKey={pendingSortBy}
                        dir={pendingSortDir}
                        onSort={togglePendingSort}
                      />
                      <SortableTh
                        label="Truck"
                        sortKey="lpoTruck"
                        activeKey={pendingSortBy}
                        dir={pendingSortDir}
                        onSort={togglePendingSort}
                      />
                      <SortableTh
                        label="Liters"
                        sortKey="lpoLiters"
                        activeKey={pendingSortBy}
                        dir={pendingSortDir}
                        onSort={togglePendingSort}
                        align="right"
                      />
                      <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-100 uppercase tracking-wider">
                        Amount
                      </th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-100 uppercase tracking-wider">
                        DO
                      </th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-100 uppercase tracking-wider">
                        Origin session
                      </th>
                      {subTab === 'dropped' && (
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-100 uppercase tracking-wider">
                          Dropped
                        </th>
                      )}
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-100 uppercase tracking-wider">
                        Reason
                      </th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-100 uppercase tracking-wider">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                    {filteredPending.map((p, index) => (
                      <tr
                        key={p.lpoEntryId}
                        className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
                      >
                        <td className="px-3 py-2 whitespace-nowrap text-xs text-gray-900 dark:text-gray-100">
                          {index + 1}
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap text-xs">{p.lpoDate}</td>
                        <td className="px-3 py-2 font-mono text-xs text-blue-600 dark:text-blue-400">
                          {p.lpoNo}
                        </td>
                        <td className="px-3 py-2 text-xs">{p.lpoStation}</td>
                        <td className="px-3 py-2 font-mono text-xs">{displayTruck(p)}</td>
                        <td className="px-3 py-2 text-right text-xs">{p.lpoLiters}</td>
                        <td className="px-3 py-2 text-right text-xs">
                          {p.lpoAmount?.toLocaleString() ?? '—'}
                        </td>
                        <td className="px-3 py-2 text-xs">{p.lpoDoNo || '—'}</td>
                        <td className="px-3 py-2 text-xs">
                          {p.originSessionNo || '—'}
                          {p.originSessionTitle ? (
                            <span className="block text-[10px] text-gray-500 truncate max-w-[120px]">
                              {p.originSessionTitle}
                            </span>
                          ) : null}
                        </td>
                        {subTab === 'dropped' && (
                          <td className="px-3 py-2 text-xs whitespace-nowrap">
                            {p.droppedAt
                              ? new Date(p.droppedAt).toLocaleDateString()
                              : '—'}
                          </td>
                        )}
                        <td
                          className={`px-3 py-2 text-xs ${MATCH_COLORS[p.matchStatus || ''] || 'text-gray-600'}`}
                        >
                          {(p.matchStatus || 'pending').replace(/_/g, ' ')}
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap text-xs">
                          {p.originSessionId && (
                            <button
                              onClick={() => openSession(p.originSessionId!)}
                              className="text-blue-600 dark:text-blue-400 hover:underline mr-2"
                            >
                              Open
                            </button>
                          )}
                          {subTab === 'pending' && (
                            <button
                              onClick={() => handleDropPendingEntry(p)}
                              className="text-red-600 dark:text-red-400 hover:underline"
                            >
                              Drop
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      <ConfirmModal
        open={!!confirmDialog}
        title={confirmDialog?.title || ''}
        message={confirmDialog?.message || ''}
        variant={confirmDialog?.variant || 'danger'}
        confirmLabel={confirmDialog?.confirmLabel || 'Confirm'}
        loading={confirmLoading}
        onConfirm={runConfirmDialog}
        onCancel={() => !confirmLoading && setConfirmDialog(null)}
      />
    </div>
  );
}

export default ReconciliationTab;
