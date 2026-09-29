import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeftRight, ChevronDown, Clock, Eye, Link2, Locate, PlusCircle, Trash2, X } from 'lucide-react';
import type { FuelRecord } from '../types';

const REVIEW_CHECKPOINTS: { field: string; label: string }[] = [
  { field: 'mmsaYard', label: 'MMSA Yard' },
  { field: 'tangaYard', label: 'Tanga Yard' },
  { field: 'darYard', label: 'Dar Yard' },
  { field: 'tangaGoing', label: 'Tanga Going' },
  { field: 'darGoing', label: 'Dar Going' },
  { field: 'moroGoing', label: 'Moro Going' },
  { field: 'mbeyaGoing', label: 'Mbeya Going' },
  { field: 'tdmGoing', label: 'Tunduma Going' },
  { field: 'zambiaGoing', label: 'Zambia Going' },
  { field: 'congoFuel', label: 'Congo' },
  { field: 'zambiaReturn', label: 'Zambia Return' },
  { field: 'tundumaReturn', label: 'Tunduma Return' },
  { field: 'mbeyaReturn', label: 'Mbeya Return' },
  { field: 'moroReturn', label: 'Moro Return' },
  { field: 'darReturn', label: 'Dar Return' },
  { field: 'tangaReturn', label: 'Tanga Return' },
];

export interface LPOReviewRow {
  index: number;
  truckNo: string;
  doNo: string;
  entryType: 'regular' | 'da' | 'ref' | 'nil';
  direction: 'going' | 'returning';
  loadingPoint: string;
  destination: string;
  totalLts: number | null;
  balance: number | null;
  hasFuelRecord: boolean;
  fuelRecord: FuelRecord | null;
  canView: boolean;
  canLink: boolean;
  canPendingGoing: boolean;
  canPendingReturn: boolean;
}

type SortKey = 'truck' | 'doMode' | 'direction' | 'loadingPoint' | 'destination' | 'totalLts' | 'balance' | `cp:${string}`;
type ValueOption = { value: string; label: string; count: number };

interface LPOEntryReviewProps {
  rows: LPOReviewRow[];
  onView: (index: number) => void;
  onDelete: (index: number) => void;
  onOpenEntry: (index: number) => void;
  onLink: (index: number) => void;
  onPendingGoing: (index: number) => void;
  onPendingReturn: (index: number) => void;
  selectedIndexes: number[];
  onSelectedChange: (indexes: number[]) => void;
  onEditSelected: (indexes: number[]) => void;
  onToggleSelected: () => void;
  onDeleteSelected: () => void;
  onClearSelection: () => void;
}

const BLANK = '(blank)';

type ReviewTableRow = LPOReviewRow & { checkpoints: Record<string, number> };
type ReviewFilters = {
  loadingPoints: string[];
  destinations: string[];
  totals: string[];
  balances: string[];
  checkpointPick: string[];
  checkpointLiters: string[];
};
type FilterSkip = 'loading' | 'destination' | 'total' | 'balance' | 'liters';

function sameStrings(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function sameFilters(left: ReviewFilters, right: ReviewFilters): boolean {
  return sameStrings(left.loadingPoints, right.loadingPoints)
    && sameStrings(left.destinations, right.destinations)
    && sameStrings(left.totals, right.totals)
    && sameStrings(left.balances, right.balances)
    && sameStrings(left.checkpointPick, right.checkpointPick)
    && sameStrings(left.checkpointLiters, right.checkpointLiters);
}

function readCheckpoints(record: FuelRecord | null): Record<string, number> {
  const checkpoints: Record<string, number> = {};
  REVIEW_CHECKPOINTS.forEach((col) => {
    checkpoints[col.field] = Number((record as unknown as Record<string, number | null | undefined> | null)?.[col.field] || 0);
  });
  return checkpoints;
}

function amountKey(value: number | null, hasRecord: boolean): string {
  if (!hasRecord || value == null) return BLANK;
  return String(value);
}

function valueOptions<T>(rows: T[], pick: (row: T) => string): ValueOption[] {
  const map = new Map<string, { label: string; count: number; sort: number }>();
  rows.forEach((row) => {
    const value = pick(row);
    const sort = value === BLANK ? Number.NEGATIVE_INFINITY : Number(value);
    const current = map.get(value);
    if (current) current.count += 1;
    else map.set(value, { label: value === BLANK ? 'Blank' : value, count: 1, sort });
  });
  return Array.from(map.entries())
    .sort((a, b) => b[1].sort - a[1].sort)
    .map(([value, item]) => ({ value, label: item.label, count: item.count }));
}

function checkpointLiterOptions(
  rows: { index: number; hasFuelRecord: boolean; checkpoints: Record<string, number> }[],
  fields: string[]
): ValueOption[] {
  if (fields.length === 0) return [];
  const map = new Map<string, { label: string; trucks: Set<number>; sort: number }>();
  rows.forEach((row) => {
    const values = new Set<string>();
    if (!row.hasFuelRecord) values.add(BLANK);
    else {
      let found = false;
      fields.forEach((field) => {
        const amount = row.checkpoints[field] || 0;
        if (amount > 0) {
          found = true;
          values.add(String(amount));
        }
      });
      if (!found) values.add(BLANK);
    }
    values.forEach((value) => {
      const sort = value === BLANK ? Number.NEGATIVE_INFINITY : Number(value);
      const current = map.get(value);
      if (current) current.trucks.add(row.index);
      else map.set(value, { label: value === BLANK ? 'Blank' : value, trucks: new Set([row.index]), sort });
    });
  });
  return Array.from(map.entries())
    .sort((a, b) => b[1].sort - a[1].sort)
    .map(([value, item]) => ({ value, label: item.label, count: item.trucks.size }));
}

function doOrModeLabel(row: LPOReviewRow): string {
  if (row.entryType === 'nil') return 'NIL';
  if (row.entryType === 'da') return 'DA';
  if (row.entryType === 'ref') return 'REF';
  return row.doNo.trim() || '—';
}

function rowHasCheckpointLiter(
  row: { hasFuelRecord: boolean; checkpoints: Record<string, number> },
  fields: string[],
  selected: string[]
): boolean {
  if (selected.length === 0) return true;
  const values = new Set<string>();
  if (!row.hasFuelRecord) values.add(BLANK);
  else {
    let found = false;
    fields.forEach((field) => {
      const amount = row.checkpoints[field] || 0;
      if (amount > 0) {
        found = true;
        values.add(String(amount));
      }
    });
    if (!found) values.add(BLANK);
  }
  return selected.some((value) => values.has(value));
}

function textOptions(rows: ReviewTableRow[], pick: (row: ReviewTableRow) => string): ValueOption[] {
  const map = new Map<string, number>();
  rows.forEach((row) => {
    const value = pick(row).trim() || BLANK;
    map.set(value, (map.get(value) || 0) + 1);
  });
  return Array.from(map.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([value, count]) => ({ value, label: value === BLANK ? 'Blank' : value, count }));
}

function checkpointChoices(rows: ReviewTableRow[]): ValueOption[] {
  return REVIEW_CHECKPOINTS.flatMap((col) => {
    const count = rows.filter((row) => (row.checkpoints[col.field] || 0) > 0).length;
    return count > 0 ? [{ value: col.field, label: col.label, count }] : [];
  });
}

function keepKnown(selected: string[], options: ValueOption[]): string[] {
  if (selected.length === 0) return selected;
  const allowed = new Set(options.map((option) => option.value));
  const next = selected.filter((value) => allowed.has(value));
  return sameStrings(next, selected) ? selected : next;
}

function rowPasses(row: ReviewTableRow, filters: ReviewFilters, skip?: FilterSkip): boolean {
  if (skip !== 'loading' && filters.loadingPoints.length > 0) {
    const loading = row.loadingPoint.trim() || BLANK;
    if (!filters.loadingPoints.includes(loading)) return false;
  }
  if (skip !== 'destination' && filters.destinations.length > 0) {
    const destination = row.destination.trim() || BLANK;
    if (!filters.destinations.includes(destination)) return false;
  }
  if (skip !== 'total' && filters.totals.length > 0 && !filters.totals.includes(amountKey(row.totalLts, row.hasFuelRecord))) return false;
  if (skip !== 'balance' && filters.balances.length > 0 && !filters.balances.includes(amountKey(row.balance, row.hasFuelRecord))) return false;
  if (skip !== 'liters' && !rowHasCheckpointLiter(row, filters.checkpointPick, filters.checkpointLiters)) return false;
  return true;
}

function reconcileReviewFilters(rows: ReviewTableRow[], filters: ReviewFilters) {
  let current = filters;
  for (let pass = 0; pass < 8; pass += 1) {
    const except = (skip?: FilterSkip) => rows.filter((row) => rowPasses(row, current, skip));
    const literOptions = current.checkpointPick.length === 0
      ? []
      : checkpointLiterOptions(except('liters'), current.checkpointPick);
    const checkpointLiters = current.checkpointPick.length === 0 ? [] : keepKnown(current.checkpointLiters, literOptions);
    const withLiters = { ...current, checkpointLiters };
    const checkpointPick = keepKnown(current.checkpointPick, checkpointChoices(rows.filter((row) => rowPasses(row, withLiters))));
    const litersAfterPick = checkpointPick.length === 0
      ? []
      : keepKnown(
        checkpointLiters,
        checkpointLiterOptions(rows.filter((row) => rowPasses(row, { ...withLiters, checkpointPick }, 'liters')), checkpointPick)
      );
    const next: ReviewFilters = {
      loadingPoints: keepKnown(current.loadingPoints, textOptions(except('loading'), (row) => row.loadingPoint)),
      destinations: keepKnown(current.destinations, textOptions(except('destination'), (row) => row.destination)),
      totals: keepKnown(current.totals, valueOptions(except('total'), (row) => amountKey(row.totalLts, row.hasFuelRecord))),
      balances: keepKnown(current.balances, valueOptions(except('balance'), (row) => amountKey(row.balance, row.hasFuelRecord))),
      checkpointPick,
      checkpointLiters: litersAfterPick,
    };
    if (sameFilters(next, current)) break;
    current = next;
  }

  const except = (skip?: FilterSkip) => rows.filter((row) => rowPasses(row, current, skip));
  return {
    filters: current,
    loadingOptions: textOptions(except('loading'), (row) => row.loadingPoint),
    destinationOptions: textOptions(except('destination'), (row) => row.destination),
    totalOptions: valueOptions(except('total'), (row) => amountKey(row.totalLts, row.hasFuelRecord)),
    balanceOptions: valueOptions(except('balance'), (row) => amountKey(row.balance, row.hasFuelRecord)),
    checkpointOptionList: checkpointChoices(rows.filter((row) => rowPasses(row, current))),
    literOptions: current.checkpointPick.length === 0 ? [] : checkpointLiterOptions(except('liters'), current.checkpointPick),
  };
}

function DoModeValue({ row }: { row: LPOReviewRow }) {
  if (row.entryType === 'regular') {
    return <span className="text-[12px] font-semibold text-[#0f1729] dark:text-gray-100">{row.doNo.trim() || '—'}</span>;
  }
  return (
    <span className={`inline-flex px-2 py-0.5 rounded text-[10px] font-bold ${
      row.entryType === 'da' ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-200'
      : row.entryType === 'ref' ? 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-200'
      : 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-200'
    }`}>
      {doOrModeLabel(row)}
    </span>
  );
}

function FilterMenu({
  label,
  active,
  align = 'start',
  children,
}: {
  label: string;
  active: boolean;
  align?: 'start' | 'end';
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    };
    const onScroll = (event: Event) => {
      const target = event.target;
      if (target instanceof Node && ref.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [open]);

  return (
    <div className="relative min-w-0 w-full md:w-auto" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className={`inline-flex items-center justify-between gap-1 h-[30px] w-full md:w-auto px-2.5 rounded-[7px] border text-[11.5px] font-semibold ${
          active
            ? 'border-[#c7ccf8] bg-[#eef0fe] text-[#4338ca] dark:border-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-200'
            : 'border-[#e6eaf1] bg-white text-[#64748b] dark:border-[#334155] dark:bg-[#0f172a] dark:text-gray-300'
        }`}
      >
        <span className="truncate">{label}</span>
        <ChevronDown className="w-3.5 h-3.5 shrink-0" />
      </button>
      {open && (
        <div className={`absolute z-30 mt-1 min-w-[200px] max-w-[min(280px,calc(100vw-2rem))] max-h-64 overflow-y-auto rounded-[10px] border border-[#e6eaf1] dark:border-[#334155] bg-white dark:bg-[#0f172a] shadow-lg p-1.5 ${align === 'end' ? 'right-0 md:left-0 md:right-auto' : 'left-0'}`}>
          {children}
        </div>
      )}
    </div>
  );
}

function CheckList({
  options,
  selected,
  onChange,
}: {
  options: Array<string | ValueOption>;
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  return (
    <div className="flex flex-col">
      {options.map((option) => {
        const value = typeof option === 'string' ? option : option.value;
        const label = typeof option === 'string' ? option : option.label;
        const count = typeof option === 'string' ? null : option.count;
        const checked = selected.includes(value);
        return (
          <label key={value} className="flex items-center gap-2 px-2 py-1.5 rounded-md text-[12px] text-[#0f1729] dark:text-gray-100 hover:bg-[#f4f6fb] dark:hover:bg-[#1e293b] cursor-pointer">
            <input
              type="checkbox"
              checked={checked}
              onChange={() => {
                onChange(checked ? selected.filter((item) => item !== value) : [...selected, value]);
              }}
              className="accent-[#4f46e5]"
            />
            <span className="flex-1">{label}</span>
            {count != null && <span className="text-[11px] font-semibold text-[#9aa6b6]">{count}</span>}
          </label>
        );
      })}
    </div>
  );
}

function ReviewRowActions({
  row,
  layout = 'icons',
  onView,
  onDelete,
  onOpenEntry,
  onLink,
  onPendingGoing,
  onPendingReturn,
}: {
  row: LPOReviewRow;
  layout?: 'icons' | 'bar';
  onView: (index: number) => void;
  onDelete: (index: number) => void;
  onOpenEntry: (index: number) => void;
  onLink: (index: number) => void;
  onPendingGoing: (index: number) => void;
  onPendingReturn: (index: number) => void;
}) {
  if (layout === 'bar') {
    const barBtn = 'flex-1 min-w-0 px-2 py-1.5 text-[11px] font-medium rounded-lg inline-flex items-center justify-center gap-1 transition-colors';
    return (
      <div className="flex items-center gap-1.5 w-full">
        <button type="button" title="Show this truck on the entry table" onClick={() => onOpenEntry(row.index)} className={`${barBtn} text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/30`}>
          <Locate className="w-3.5 h-3.5 shrink-0" />
          <span className="truncate">Locate</span>
        </button>
        <button type="button" title={row.canView ? 'Inspect fuel record' : 'No fuel record'} disabled={!row.canView} onClick={() => onView(row.index)} className={`${barBtn} ${row.canView ? 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/30' : 'text-blue-400 dark:text-blue-700 bg-blue-50/50 dark:bg-blue-900/10 opacity-40 cursor-not-allowed'}`}>
          <Eye className="w-3.5 h-3.5 shrink-0" />
          <span className="truncate">Inspect</span>
        </button>
        {row.canLink && (
          <button type="button" title="Link export DO as the return DO" onClick={() => onLink(row.index)} className={`${barBtn} text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-900/20 hover:bg-indigo-100 dark:hover:bg-indigo-900/40`}>
            <Link2 className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">Link</span>
          </button>
        )}
        {row.canPendingGoing && (
          <button type="button" title="Create pending going DO (PG####)" onClick={() => onPendingGoing(row.index)} className={`${barBtn} text-amber-800 dark:text-amber-200 bg-amber-50 dark:bg-amber-900/20 hover:bg-amber-100 dark:hover:bg-amber-900/40`}>
            <PlusCircle className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">Pending</span>
          </button>
        )}
        {row.canPendingReturn && (
          <button type="button" title="Create pending return DO (PR####)" onClick={() => onPendingReturn(row.index)} className={`${barBtn} text-amber-800 dark:text-amber-200 bg-amber-50 dark:bg-amber-900/20 hover:bg-amber-100 dark:hover:bg-amber-900/40`}>
            <Clock className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">Pending</span>
          </button>
        )}
        <button type="button" title="Remove entry" onClick={() => onDelete(row.index)} className={`${barBtn} text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/30`}>
          <Trash2 className="w-3.5 h-3.5 shrink-0" />
          <span className="truncate">Delete</span>
        </button>
      </div>
    );
  }
  return (
    <span className="inline-flex gap-1 justify-end">
      <button type="button" className="icon-btn text-[#2563eb] dark:text-blue-400" title="Show this truck on the entry table" onClick={() => onOpenEntry(row.index)}>
        <Locate className="w-4 h-4" />
      </button>
      <button type="button" className="icon-btn text-[#2563eb] dark:text-blue-400 disabled:opacity-40" title={row.canView ? 'Inspect fuel record' : 'No fuel record'} disabled={!row.canView} onClick={() => onView(row.index)}>
        <Eye className="w-4 h-4" />
      </button>
      {row.canLink && (
        <button type="button" className="icon-btn text-indigo-600 dark:text-indigo-400" title="Link export DO as the return DO" onClick={() => onLink(row.index)}>
          <Link2 className="w-4 h-4" />
        </button>
      )}
      {row.canPendingGoing && (
        <button type="button" className="icon-btn icon-btn-pending" title="Create pending going DO (PG####)" onClick={() => onPendingGoing(row.index)}>
          <PlusCircle className="w-4 h-4" />
        </button>
      )}
      {row.canPendingReturn && (
        <button type="button" className="icon-btn icon-btn-pending" title="Create pending return DO (PR####)" onClick={() => onPendingReturn(row.index)}>
          <Clock className="w-4 h-4" />
        </button>
      )}
      <button type="button" className="icon-btn icon-btn-danger text-[#dc2626] dark:text-red-400" title="Remove entry" onClick={() => onDelete(row.index)}>
        <Trash2 className="w-4 h-4" />
      </button>
    </span>
  );
}

const LPOEntryReview: React.FC<LPOEntryReviewProps> = ({
  rows,
  onView,
  onDelete,
  onOpenEntry,
  onLink,
  onPendingGoing,
  onPendingReturn,
  selectedIndexes,
  onSelectedChange,
  onEditSelected,
  onToggleSelected,
  onDeleteSelected,
  onClearSelection,
}) => {
  const [loadingPoints, setLoadingPoints] = useState<string[]>([]);
  const [destinations, setDestinations] = useState<string[]>([]);
  const [totals, setTotals] = useState<string[]>([]);
  const [balances, setBalances] = useState<string[]>([]);
  const [checkpointPick, setCheckpointPick] = useState<string[]>([]);
  const [checkpointLiters, setCheckpointLiters] = useState<string[]>([]);
  const [sortKey, setSortKey] = useState<SortKey>('truck');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const selectAllRef = useRef<HTMLInputElement>(null);
  const selectAllMobileRef = useRef<HTMLInputElement>(null);
  const selected = useMemo(() => new Set(selectedIndexes), [selectedIndexes]);

  const clearSelected = () => {
    onClearSelection();
  };

  const setLoadingPointsFiltered = (next: string[]) => { setLoadingPoints(next); clearSelected(); };
  const setDestinationsFiltered = (next: string[]) => { setDestinations(next); clearSelected(); };
  const setTotalsFiltered = (next: string[]) => { setTotals(next); clearSelected(); };
  const setBalancesFiltered = (next: string[]) => { setBalances(next); clearSelected(); };
  const setCheckpointLitersFiltered = (next: string[]) => { setCheckpointLiters(next); clearSelected(); };
  const setCheckpointPickFiltered = (next: string[]) => { setCheckpointPick(next); clearSelected(); };

  const tableRows = useMemo(
    () => rows.map((row) => ({ ...row, checkpoints: readCheckpoints(row.fuelRecord) })),
    [rows]
  );

  const model = useMemo(
    () => reconcileReviewFilters(tableRows, {
      loadingPoints,
      destinations,
      totals,
      balances,
      checkpointPick,
      checkpointLiters,
    }),
    [tableRows, loadingPoints, destinations, totals, balances, checkpointPick, checkpointLiters]
  );
  const activeFilters = model.filters;
  const shownCheckpoints = activeFilters.checkpointPick;

  if (!sameFilters(activeFilters, { loadingPoints, destinations, totals, balances, checkpointPick, checkpointLiters })) {
    setLoadingPoints(activeFilters.loadingPoints);
    setDestinations(activeFilters.destinations);
    setTotals(activeFilters.totals);
    setBalances(activeFilters.balances);
    setCheckpointPick(activeFilters.checkpointPick);
    setCheckpointLiters(activeFilters.checkpointLiters);
  }
  if (sortKey.startsWith('cp:') && !shownCheckpoints.includes(sortKey.slice(3))) {
    setSortKey('truck');
    setSortDir('asc');
  }

  const filtered = useMemo(
    () => tableRows.filter((row) => rowPasses(row, activeFilters)),
    [tableRows, activeFilters]
  );

  const sorted = useMemo(() => {
    const copy = [...filtered];
    const dir = sortDir === 'asc' ? 1 : -1;
    copy.sort((a, b) => {
      const text = (left: string, right: string) => left.localeCompare(right) * dir;
      const num = (left: number | null, right: number | null) => {
        const l = left == null ? Number.NEGATIVE_INFINITY : left;
        const r = right == null ? Number.NEGATIVE_INFINITY : right;
        return (l - r) * dir;
      };
      if (sortKey === 'truck') return text(a.truckNo, b.truckNo);
      if (sortKey === 'doMode') return text(doOrModeLabel(a), doOrModeLabel(b));
      if (sortKey === 'direction') return text(a.direction, b.direction);
      if (sortKey === 'loadingPoint') return text(a.loadingPoint, b.loadingPoint);
      if (sortKey === 'destination') return text(a.destination, b.destination);
      if (sortKey === 'totalLts') return num(a.totalLts, b.totalLts);
      if (sortKey === 'balance') return num(a.balance, b.balance);
      const field = sortKey.slice(3);
      return num(a.checkpoints[field] ?? null, b.checkpoints[field] ?? null);
    });
    return copy;
  }, [filtered, sortKey, sortDir]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((dir) => (dir === 'asc' ? 'desc' : 'asc'));
    else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  const sortMark = (key: SortKey) => (sortKey === key ? (sortDir === 'asc' ? ' ↑' : ' ↓') : '');

  const chips: { key: string; label: string; clear: () => void }[] = [];
  if (activeFilters.loadingPoints.length) chips.push({ key: 'lp', label: `Loading point · ${activeFilters.loadingPoints.join(', ')}`, clear: () => setLoadingPointsFiltered([]) });
  if (activeFilters.destinations.length) chips.push({ key: 'dest', label: `Destination · ${activeFilters.destinations.join(', ')}`, clear: () => setDestinationsFiltered([]) });
  if (activeFilters.totals.length) chips.push({ key: 'total', label: `Total liters · ${activeFilters.totals.map((value) => value === BLANK ? 'Blank' : value).join(', ')}`, clear: () => setTotalsFiltered([]) });
  if (activeFilters.balances.length) chips.push({ key: 'bal', label: `Balance · ${activeFilters.balances.map((value) => value === BLANK ? 'Blank' : value).join(', ')}`, clear: () => setBalancesFiltered([]) });
  if (shownCheckpoints.length) chips.push({ key: 'cpick', label: `Checkpoints · ${REVIEW_CHECKPOINTS.filter((col) => shownCheckpoints.includes(col.field)).map((col) => col.label).join(', ')}`, clear: () => setCheckpointPickFiltered([]) });
  if (activeFilters.checkpointLiters.length) chips.push({ key: 'cp', label: `Checkpoint liters · ${activeFilters.checkpointLiters.map((value) => value === BLANK ? 'Blank' : value).join(', ')}`, clear: () => setCheckpointLitersFiltered([]) });

  const clearAll = () => {
    setLoadingPoints([]);
    setDestinations([]);
    setTotals([]);
    setBalances([]);
    setCheckpointLiters([]);
    setCheckpointPick([]);
    clearSelected();
  };

  const visibleIndexes = sorted.map((row) => row.index);
  const selectedVisible = visibleIndexes.filter((index) => selected.has(index)).length;
  const allVisibleSelected = visibleIndexes.length > 0 && selectedVisible === visibleIndexes.length;

  useEffect(() => {
    const indeterminate = selectedVisible > 0 && !allVisibleSelected;
    if (selectAllRef.current) selectAllRef.current.indeterminate = indeterminate;
    if (selectAllMobileRef.current) selectAllMobileRef.current.indeterminate = indeterminate;
  }, [selectedVisible, allVisibleSelected]);

  const toggleVisible = () => {
    onSelectedChange(allVisibleSelected ? [] : visibleIndexes);
  };

  const toggleRow = (index: number) => {
    const next = new Set(selected);
    if (next.has(index)) next.delete(index);
    else next.add(index);
    onSelectedChange(Array.from(next));
  };

  const th = (key: SortKey, label: string, align: 'left' | 'right' = 'left') => (
    <th className="lpo-th" style={{ textAlign: align }}>
      <button type="button" onClick={() => toggleSort(key)} className="uppercase tracking-wide">
        {label}{sortMark(key)}
      </button>
    </th>
  );

  return (
    <div>
      <div className="grid grid-cols-2 gap-1.5 mb-2 md:flex md:flex-wrap md:items-center">
        <FilterMenu label={activeFilters.loadingPoints.length ? `Loading point (${activeFilters.loadingPoints.length})` : 'Loading point'} active={activeFilters.loadingPoints.length > 0}>
          <CheckList options={model.loadingOptions} selected={activeFilters.loadingPoints} onChange={setLoadingPointsFiltered} />
        </FilterMenu>
        <FilterMenu align="end" label={activeFilters.destinations.length ? `Destination (${activeFilters.destinations.length})` : 'Destination'} active={activeFilters.destinations.length > 0}>
          <CheckList options={model.destinationOptions} selected={activeFilters.destinations} onChange={setDestinationsFiltered} />
        </FilterMenu>
        <FilterMenu label={activeFilters.totals.length ? `Total liters (${activeFilters.totals.length})` : 'Total liters'} active={activeFilters.totals.length > 0}>
          <CheckList options={model.totalOptions} selected={activeFilters.totals} onChange={setTotalsFiltered} />
        </FilterMenu>
        <FilterMenu align="end" label={activeFilters.balances.length ? `Balance (${activeFilters.balances.length})` : 'Balance'} active={activeFilters.balances.length > 0}>
          <CheckList options={model.balanceOptions} selected={activeFilters.balances} onChange={setBalancesFiltered} />
        </FilterMenu>
        <FilterMenu label={shownCheckpoints.length ? `Checkpoints (${shownCheckpoints.length})` : 'Checkpoints'} active={shownCheckpoints.length > 0}>
          {model.checkpointOptionList.length === 0 ? (
            <p className="px-2 py-1.5 text-[12px] text-[#9aa6b6]">No checkpoints on these trucks</p>
          ) : (
            <CheckList options={model.checkpointOptionList} selected={shownCheckpoints} onChange={setCheckpointPickFiltered} />
          )}
        </FilterMenu>
        <FilterMenu align="end" label={activeFilters.checkpointLiters.length ? `Checkpoint liters (${activeFilters.checkpointLiters.length})` : 'Checkpoint liters'} active={activeFilters.checkpointLiters.length > 0}>
          {shownCheckpoints.length === 0 ? (
            <p className="px-2 py-1.5 text-[12px] text-[#9aa6b6]">Select a checkpoint first</p>
          ) : model.literOptions.length === 0 ? (
            <p className="px-2 py-1.5 text-[12px] text-[#9aa6b6]">No checkpoint liters on these trucks</p>
          ) : (
            <CheckList options={model.literOptions} selected={activeFilters.checkpointLiters} onChange={setCheckpointLitersFiltered} />
          )}
        </FilterMenu>
        <span className="col-span-2 md:ml-auto text-[12px] text-[#9aa6b6] font-medium">Showing {sorted.length} of {rows.length}</span>
      </div>

      {chips.length > 0 && (
      <div className="flex flex-wrap items-center gap-1.5 mb-2 min-h-[24px]">
        {chips.map((chip) => (
          <button key={chip.key} type="button" onClick={chip.clear} className="inline-flex items-center gap-1 h-6 px-2 rounded-full bg-[#eef0fe] dark:bg-indigo-900/30 text-[#4338ca] dark:text-indigo-200 text-[11px] font-semibold">
            {chip.label}
            <X className="w-3 h-3" />
          </button>
        ))}
        <button type="button" onClick={clearAll} className="text-[11.5px] font-semibold text-[#6b73c9] dark:text-indigo-300 hover:underline">Clear</button>
      </div>
      )}

      {selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 mb-2 px-3 py-2 rounded-[10px] bg-[#eef0fe] dark:bg-indigo-900/20 border border-[#d9dcfb] dark:border-indigo-800">
          <span className="text-[12px] font-bold text-[#4338ca] dark:text-indigo-300">{selected.size} selected</span>
          <button
            type="button"
            onClick={() => onEditSelected(Array.from(selected))}
            className="inline-flex items-center h-[28px] px-2.5 rounded-[7px] bg-[#4f46e5] hover:bg-[#4338ca] text-white text-[11.5px] font-bold"
          >
            Edit in table
          </button>
          <button
            type="button"
            onClick={onToggleSelected}
            className="inline-flex items-center gap-1.5 h-[28px] px-2.5 rounded-[7px] bg-[#dbe4ff] dark:bg-blue-900/40 text-[#1d4ed8] dark:text-blue-300 text-[11.5px] font-bold"
          >
            <ArrowLeftRight className="w-3.5 h-3.5" />Toggle direction
          </button>
          <button
            type="button"
            onClick={onDeleteSelected}
            className="inline-flex items-center gap-1.5 h-[28px] px-2.5 rounded-[7px] bg-[#fde2e2] dark:bg-red-900/40 text-[#b91c1c] dark:text-red-300 text-[11.5px] font-bold"
          >
            <Trash2 className="w-3.5 h-3.5" />Delete
          </button>
          <button
            type="button"
            onClick={clearSelected}
            className="ml-auto text-[11.5px] text-[#6b73c9] dark:text-indigo-300 font-semibold hover:underline"
          >
            Clear
          </button>
        </div>
      )}

      <div className="md:hidden space-y-1.5">
        <label className="flex items-center gap-2 px-0.5 text-[12px] font-semibold text-[#64748b] dark:text-gray-300">
          <input
            ref={selectAllMobileRef}
            type="checkbox"
            checked={allVisibleSelected}
            onChange={toggleVisible}
            disabled={visibleIndexes.length === 0}
            title="Select the trucks these filters are showing"
            className="accent-[#4f46e5]"
          />
          Select shown
        </label>
        {sorted.length === 0 ? (
          <div className="px-3 py-8 text-center text-[12px] text-[#9aa6b6] rounded-[13px] border border-[#eaedf3] dark:border-[#1e293b]">
            {rows.length === 0 ? 'No trucks on this order yet.' : 'No trucks match these filters.'}
          </div>
        ) : sorted.map((row) => {
          const checkpointFields = REVIEW_CHECKPOINTS.filter((col) => shownCheckpoints.includes(col.field) && (row.checkpoints[col.field] || 0) > 0);
          return (
            <div key={row.index} className="rounded-[12px] border border-[#eaedf3] dark:border-[#1e293b] bg-white dark:bg-[#0f172a] p-3">
              <div className="flex items-start gap-2">
                <input
                  type="checkbox"
                  checked={selected.has(row.index)}
                  onChange={() => toggleRow(row.index)}
                  title="Select this truck"
                  className="mt-0.5 accent-[#4f46e5]"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-[14px] font-bold text-[#0f1729] dark:text-gray-100">{row.truckNo || '—'}</span>
                    <DoModeValue row={row} />
                    <span className={`inline-flex px-2 py-0.5 rounded text-[10px] font-bold ${row.direction === 'returning' ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200' : 'bg-sky-100 text-sky-800 dark:bg-sky-900/30 dark:text-sky-200'}`}>
                      {row.direction === 'returning' ? 'Return' : 'Going'}
                    </span>
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-x-3 gap-y-2 mt-2.5">
                <div className="min-w-0">
                  <div className="text-[10px] font-bold uppercase tracking-wide text-[#9aa6b6]">Loading point</div>
                  <div className="text-[12px] text-[#0f1729] dark:text-gray-100 truncate">{row.loadingPoint || '—'}</div>
                </div>
                <div className="min-w-0">
                  <div className="text-[10px] font-bold uppercase tracking-wide text-[#9aa6b6]">Destination</div>
                  <div className="text-[12px] text-[#0f1729] dark:text-gray-100 truncate">{row.destination || '—'}</div>
                </div>
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-wide text-[#9aa6b6]">Total L</div>
                  <div className="text-[12px] font-semibold text-[#0f1729] dark:text-gray-100">{row.hasFuelRecord && row.totalLts != null ? row.totalLts : '—'}</div>
                </div>
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-wide text-[#9aa6b6]">Balance</div>
                  <div className="text-[12px] font-semibold text-[#0f1729] dark:text-gray-100">{row.hasFuelRecord && row.balance != null ? row.balance : '—'}</div>
                </div>
                {checkpointFields.map((col) => (
                  <div key={col.field}>
                    <div className="text-[10px] font-bold uppercase tracking-wide text-[#9aa6b6]">{col.label}</div>
                    <div className="text-[12px] font-semibold text-[#0f1729] dark:text-gray-100">{row.checkpoints[col.field]}</div>
                  </div>
                ))}
              </div>
              <div className="mt-2.5 pt-2 border-t border-[#eef1f6] dark:border-[#1e293b]">
                <ReviewRowActions
                  layout="bar"
                  row={row}
                  onView={onView}
                  onDelete={onDelete}
                  onOpenEntry={onOpenEntry}
                  onLink={onLink}
                  onPendingGoing={onPendingGoing}
                  onPendingReturn={onPendingReturn}
                />
              </div>
            </div>
          );
        })}
      </div>

      <div className="hidden md:block rounded-[13px] border border-[#eaedf3] dark:border-[#1e293b] overflow-hidden">
        <div className="lpo-scroll overflow-x-auto">
          <table className="lpo-table">
            <thead>
              <tr>
                <th className="lpo-th" style={{ width: 36 }}>
                  <input
                    ref={selectAllRef}
                    type="checkbox"
                    checked={allVisibleSelected}
                    onChange={toggleVisible}
                    disabled={visibleIndexes.length === 0}
                    title="Select the trucks these filters are showing"
                    className="accent-[#4f46e5]"
                  />
                </th>
                {th('truck', 'Truck')}
                {th('doMode', 'DO / Mode')}
                {th('direction', 'Direction')}
                {th('loadingPoint', 'Loading point')}
                {th('destination', 'Destination')}
                {th('totalLts', 'Total L', 'right')}
                {th('balance', 'Balance', 'right')}
                {REVIEW_CHECKPOINTS.filter((col) => shownCheckpoints.includes(col.field)).map((col) => (
                  <th key={col.field} className="lpo-th" style={{ textAlign: 'right' }}>
                    <button type="button" onClick={() => toggleSort(`cp:${col.field}`)} className="uppercase tracking-wide">
                      {col.label}{sortMark(`cp:${col.field}`)}
                    </button>
                  </th>
                ))}
                <th className="lpo-th" style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {sorted.length === 0 ? (
                <tr>
                  <td colSpan={9 + shownCheckpoints.length} className="px-4 py-8 text-center text-[12px] text-[#9aa6b6]">
                    {rows.length === 0 ? 'No trucks on this order yet.' : 'No trucks match these filters.'}
                  </td>
                </tr>
              ) : sorted.map((row) => (
                <tr key={row.index} className="lpo-row">
                  <td>
                    <input
                      type="checkbox"
                      checked={selected.has(row.index)}
                      onChange={() => toggleRow(row.index)}
                      title="Select this truck"
                      className="accent-[#4f46e5]"
                    />
                  </td>
                  <td>
                    <div className="text-[13px] font-semibold text-[#0f1729] dark:text-gray-100">{row.truckNo || '—'}</div>
                  </td>
                  <td>
                    <DoModeValue row={row} />
                  </td>
                  <td>
                    <span className={`inline-flex px-2 py-0.5 rounded text-[10px] font-bold ${row.direction === 'returning' ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200' : 'bg-sky-100 text-sky-800 dark:bg-sky-900/30 dark:text-sky-200'}`}>
                      {row.direction === 'returning' ? 'Return' : 'Going'}
                    </span>
                  </td>
                  <td className="text-[12px] text-[#0f1729] dark:text-gray-100">{row.loadingPoint || '—'}</td>
                  <td className="text-[12px] text-[#0f1729] dark:text-gray-100">{row.destination || '—'}</td>
                  <td className="amount-cell" style={{ textAlign: 'right' }}>{row.hasFuelRecord && row.totalLts != null ? row.totalLts : '—'}</td>
                  <td className="amount-cell" style={{ textAlign: 'right' }}>{row.hasFuelRecord && row.balance != null ? row.balance : '—'}</td>
                  {REVIEW_CHECKPOINTS.filter((col) => shownCheckpoints.includes(col.field)).map((col) => {
                    const value = row.checkpoints[col.field] || 0;
                    return (
                      <td key={col.field} className="amount-cell" style={{ textAlign: 'right' }}>
                        {row.hasFuelRecord && value > 0 ? value : '—'}
                      </td>
                    );
                  })}
                  <td style={{ textAlign: 'right' }}>
                    <ReviewRowActions
                      row={row}
                      onView={onView}
                      onDelete={onDelete}
                      onOpenEntry={onOpenEntry}
                      onLink={onLink}
                      onPendingGoing={onPendingGoing}
                      onPendingReturn={onPendingReturn}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default LPOEntryReview;
