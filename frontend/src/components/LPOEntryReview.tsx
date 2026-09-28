import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Clock, Eye, Link2, Locate, PlusCircle, Trash2, X } from 'lucide-react';
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
  onEditSelected: (indexes: number[]) => void;
  onClearSelection: () => void;
}

const BLANK = '(blank)';

function uniqueValues(rows: LPOReviewRow[], pick: (row: LPOReviewRow) => string): string[] {
  const set = new Set<string>();
  rows.forEach((row) => set.add(pick(row).trim() || BLANK));
  return Array.from(set).sort((a, b) => a.localeCompare(b));
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
  const map = new Map<string, { label: string; trucks: Set<number>; sort: number }>();
  rows.forEach((row) => {
    const values = new Set<string>();
    if (!row.hasFuelRecord || fields.length === 0) values.add(BLANK);
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
  if (!row.hasFuelRecord || fields.length === 0) values.add(BLANK);
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

function FilterMenu({
  label,
  active,
  children,
}: {
  label: string;
  active: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className={`inline-flex items-center gap-1 h-[30px] px-2.5 rounded-[7px] border text-[11.5px] font-semibold ${
          active
            ? 'border-[#c7ccf8] bg-[#eef0fe] text-[#4338ca] dark:border-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-200'
            : 'border-[#e6eaf1] bg-white text-[#64748b] dark:border-[#334155] dark:bg-[#0f172a] dark:text-gray-300'
        }`}
      >
        {label}
        <ChevronDown className="w-3.5 h-3.5" />
      </button>
      {open && (
        <div className="absolute z-30 mt-1 min-w-[200px] max-h-64 overflow-y-auto rounded-[10px] border border-[#e6eaf1] dark:border-[#334155] bg-white dark:bg-[#0f172a] shadow-lg p-1.5">
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

const LPOEntryReview: React.FC<LPOEntryReviewProps> = ({
  rows,
  onView,
  onDelete,
  onOpenEntry,
  onLink,
  onPendingGoing,
  onPendingReturn,
  onEditSelected,
  onClearSelection,
}) => {
  const [loadingPoints, setLoadingPoints] = useState<string[]>([]);
  const [destinations, setDestinations] = useState<string[]>([]);
  const [totals, setTotals] = useState<string[]>([]);
  const [balances, setBalances] = useState<string[]>([]);
  const [checkpointPick, setCheckpointPick] = useState<string[] | null>(null);
  const [checkpointLiters, setCheckpointLiters] = useState<string[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [sortKey, setSortKey] = useState<SortKey>('truck');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const selectAllRef = useRef<HTMLInputElement>(null);

  const clearSelected = () => {
    setSelected((prev) => (prev.size === 0 ? prev : new Set()));
    onClearSelection();
  };

  const setLoadingPointsFiltered = (next: string[]) => { setLoadingPoints(next); clearSelected(); };
  const setDestinationsFiltered = (next: string[]) => { setDestinations(next); clearSelected(); };
  const setTotalsFiltered = (next: string[]) => { setTotals(next); clearSelected(); };
  const setBalancesFiltered = (next: string[]) => { setBalances(next); clearSelected(); };
  const setCheckpointLitersFiltered = (next: string[]) => { setCheckpointLiters(next); clearSelected(); };
  const setCheckpointPickFiltered = (next: string[] | null) => { setCheckpointPick(next); clearSelected(); };

  const tableRows = useMemo(
    () => rows.map((row) => ({ ...row, checkpoints: readCheckpoints(row.fuelRecord) })),
    [rows]
  );

  const defaultCheckpoints = useMemo(() => {
    return REVIEW_CHECKPOINTS
      .filter((col) => tableRows.some((row) => (row.checkpoints[col.field] || 0) > 0))
      .map((col) => col.field);
  }, [tableRows]);
  const shownCheckpoints = checkpointPick ?? defaultCheckpoints;

  const loadingOptions = useMemo(() => uniqueValues(tableRows, (row) => row.loadingPoint), [tableRows]);
  const destinationOptions = useMemo(() => uniqueValues(tableRows, (row) => row.destination), [tableRows]);
  const totalOptions = useMemo(
    () => valueOptions(tableRows, (row) => amountKey(row.totalLts, row.hasFuelRecord)),
    [tableRows]
  );
  const balanceOptions = useMemo(
    () => valueOptions(tableRows, (row) => amountKey(row.balance, row.hasFuelRecord)),
    [tableRows]
  );
  const checkpointLiterOptionList = useMemo(
    () => checkpointLiterOptions(tableRows, shownCheckpoints),
    [tableRows, shownCheckpoints]
  );

  const filtered = useMemo(() => {
    return tableRows.filter((row) => {
      const loading = row.loadingPoint.trim() || BLANK;
      const destination = row.destination.trim() || BLANK;
      if (loadingPoints.length > 0 && !loadingPoints.includes(loading)) return false;
      if (destinations.length > 0 && !destinations.includes(destination)) return false;
      if (totals.length > 0 && !totals.includes(amountKey(row.totalLts, row.hasFuelRecord))) return false;
      if (balances.length > 0 && !balances.includes(amountKey(row.balance, row.hasFuelRecord))) return false;
      if (!rowHasCheckpointLiter(row, shownCheckpoints, checkpointLiters)) return false;
      return true;
    });
  }, [tableRows, loadingPoints, destinations, totals, balances, shownCheckpoints, checkpointLiters]);

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
  if (loadingPoints.length) chips.push({ key: 'lp', label: `Loading point · ${loadingPoints.join(', ')}`, clear: () => setLoadingPointsFiltered([]) });
  if (destinations.length) chips.push({ key: 'dest', label: `Destination · ${destinations.join(', ')}`, clear: () => setDestinationsFiltered([]) });
  if (totals.length) chips.push({ key: 'total', label: `Total liters · ${totals.map((value) => value === BLANK ? 'Blank' : value).join(', ')}`, clear: () => setTotalsFiltered([]) });
  if (balances.length) chips.push({ key: 'bal', label: `Balance · ${balances.map((value) => value === BLANK ? 'Blank' : value).join(', ')}`, clear: () => setBalancesFiltered([]) });
  if (checkpointLiters.length) chips.push({ key: 'cp', label: `Checkpoint liters · ${checkpointLiters.map((value) => value === BLANK ? 'Blank' : value).join(', ')}`, clear: () => setCheckpointLitersFiltered([]) });

  const clearAll = () => {
    setLoadingPoints([]);
    setDestinations([]);
    setTotals([]);
    setBalances([]);
    setCheckpointLiters([]);
    setCheckpointPick(null);
    clearSelected();
  };

  const visibleIndexes = sorted.map((row) => row.index);
  const selectedVisible = visibleIndexes.filter((index) => selected.has(index)).length;
  const allVisibleSelected = visibleIndexes.length > 0 && selectedVisible === visibleIndexes.length;

  useEffect(() => {
    if (!selectAllRef.current) return;
    selectAllRef.current.indeterminate = selectedVisible > 0 && !allVisibleSelected;
  }, [selectedVisible, allVisibleSelected]);

  const toggleVisible = () => {
    setSelected(allVisibleSelected ? new Set() : new Set(visibleIndexes));
  };

  const toggleRow = (index: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
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
      <div className="flex flex-wrap items-center gap-1.5 mb-2">
        <FilterMenu label={loadingPoints.length ? `Loading point (${loadingPoints.length})` : 'Loading point'} active={loadingPoints.length > 0}>
          <CheckList options={loadingOptions} selected={loadingPoints} onChange={setLoadingPointsFiltered} />
        </FilterMenu>
        <FilterMenu label={destinations.length ? `Destination (${destinations.length})` : 'Destination'} active={destinations.length > 0}>
          <CheckList options={destinationOptions} selected={destinations} onChange={setDestinationsFiltered} />
        </FilterMenu>
        <FilterMenu label={totals.length ? `Total liters (${totals.length})` : 'Total liters'} active={totals.length > 0}>
          <CheckList options={totalOptions} selected={totals} onChange={setTotalsFiltered} />
        </FilterMenu>
        <FilterMenu label={balances.length ? `Balance (${balances.length})` : 'Balance'} active={balances.length > 0}>
          <CheckList options={balanceOptions} selected={balances} onChange={setBalancesFiltered} />
        </FilterMenu>
        <FilterMenu label={shownCheckpoints.length ? `Checkpoints (${shownCheckpoints.length})` : 'Checkpoints'} active={checkpointPick != null}>
          <CheckList
            options={REVIEW_CHECKPOINTS.map((col) => col.label)}
            selected={REVIEW_CHECKPOINTS.filter((col) => shownCheckpoints.includes(col.field)).map((col) => col.label)}
            onChange={(labels) => {
              setCheckpointPickFiltered(REVIEW_CHECKPOINTS.filter((col) => labels.includes(col.label)).map((col) => col.field));
            }}
          />
        </FilterMenu>
        <FilterMenu label={checkpointLiters.length ? `Checkpoint liters (${checkpointLiters.length})` : 'Checkpoint liters'} active={checkpointLiters.length > 0}>
          <CheckList options={checkpointLiterOptionList} selected={checkpointLiters} onChange={setCheckpointLitersFiltered} />
        </FilterMenu>
        <span className="ml-auto text-[12px] text-[#9aa6b6] font-medium">Showing {sorted.length} of {rows.length}</span>
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
            className="h-[28px] px-2.5 rounded-[7px] bg-[#4f46e5] hover:bg-[#4338ca] text-white text-[11.5px] font-bold"
          >
            Edit in table
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

      <div className="rounded-[13px] border border-[#eaedf3] dark:border-[#1e293b] overflow-hidden">
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
                    {row.entryType === 'regular' ? (
                      <span className="text-[12px] font-semibold text-[#0f1729] dark:text-gray-100">{row.doNo.trim() || '—'}</span>
                    ) : (
                      <span className={`inline-flex px-2 py-0.5 rounded text-[10px] font-bold ${
                        row.entryType === 'da' ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-200'
                        : row.entryType === 'ref' ? 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-200'
                        : 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-200'
                      }`}>
                        {doOrModeLabel(row)}
                      </span>
                    )}
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
