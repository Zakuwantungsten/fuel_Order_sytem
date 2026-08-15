import { Plus, Trash2 } from 'lucide-react';
import type { ClipboardEvent } from 'react';
import { isTonnageInput, parseTonnage, formatTonnage } from '../utils/dataCleanup';

export interface BulkGridRow {
  truckNo: string;
  trailerNo: string;
  driverName: string;
  tonnages: string;
  amountOrRate: string;
}

export type BulkGridField = keyof BulkGridRow;

const EDITABLE_FIELDS: BulkGridField[] = [
  'truckNo',
  'trailerNo',
  'driverName',
  'tonnages',
  'amountOrRate',
];

export const createEmptyGridRows = (count = 8): BulkGridRow[] =>
  Array.from({ length: count }, () => ({
    truckNo: '',
    trailerNo: '',
    driverName: '',
    tonnages: '',
    amountOrRate: '',
  }));

export const isGridRowEmpty = (row: BulkGridRow): boolean =>
  !row.truckNo.trim() &&
  !row.trailerNo.trim() &&
  !row.driverName.trim() &&
  !row.tonnages.trim() &&
  !row.amountOrRate.trim();

export const countFilledGridRows = (rows: BulkGridRow[]): number =>
  rows.filter((row) => !isGridRowEmpty(row)).length;

const sanitizeTonnageCell = (value: string): string => {
  const trimmed = value.trim().replace(/,/g, '');
  if (trimmed === '') return '';
  if (isTonnageInput(trimmed)) return trimmed;
  const match = trimmed.match(/^(\d+)\.(\d+)$/);
  if (match) return `${match[1]}.${match[2].slice(0, 3)}`;
  const n = parseTonnage(trimmed);
  return n > 0 ? formatTonnage(n) : '';
};

const cellToString = (value: unknown): string => {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number') {
    return String(value);
  }
  return String(value).trim();
};

const normalizeHeader = (value: unknown): string =>
  cellToString(value).toLowerCase().replace(/[^a-z0-9]+/g, '');

const HEADER_ALIASES: Record<BulkGridField, string[]> = {
  truckNo: ['truckno', 'truck', 'trucknumber', 'plateno', 'regno'],
  trailerNo: ['trailerno', 'trailer', 'trailernumber'],
  driverName: ['drivername', 'driver', 'driverfullname'],
  tonnages: ['tonnage', 'tonnages', 'tonnes', 'tons', 'weight'],
  amountOrRate: [
    'rateperton',
    'rate',
    'ratepton',
    'totalamount',
    'total',
    'amount',
    'fixedtotal',
  ],
};

const detectColumnMap = (headerRow: unknown[]): Partial<Record<BulkGridField, number>> | null => {
  const map: Partial<Record<BulkGridField, number>> = {};
  headerRow.forEach((cell, index) => {
    const key = normalizeHeader(cell);
    if (!key) return;
    (Object.keys(HEADER_ALIASES) as BulkGridField[]).forEach((field) => {
      if (map[field] !== undefined) return;
      if (HEADER_ALIASES[field].includes(key)) {
        map[field] = index;
      }
    });
  });
  // Need at least truck column to treat this as a header row
  return map.truckNo !== undefined ? map : null;
};

const looksLikeHeaderRow = (row: unknown[]): boolean => {
  const joined = row.map(normalizeHeader).join(' ');
  return joined.includes('truck') || joined.includes('driver') || joined.includes('tonnage');
};

/** Convert a matrix of spreadsheet cells into grid rows (skips header / blank rows) */
export const matrixToGridRows = (matrix: unknown[][]): BulkGridRow[] => {
  if (!matrix.length) return createEmptyGridRows();

  let startIndex = 0;
  let columnMap: Partial<Record<BulkGridField, number>> = {
    truckNo: 0,
    trailerNo: 1,
    driverName: 2,
    tonnages: 3,
    amountOrRate: 4,
  };

  const detected = detectColumnMap(matrix[0] || []);
  if (detected || looksLikeHeaderRow(matrix[0] || [])) {
    if (detected) columnMap = { ...columnMap, ...detected };
    startIndex = 1;
  }

  const rows: BulkGridRow[] = [];
  for (let i = startIndex; i < matrix.length; i++) {
    const raw = matrix[i] || [];
    const row: BulkGridRow = {
      truckNo: cellToString(raw[columnMap.truckNo ?? 0]),
      trailerNo: cellToString(raw[columnMap.trailerNo ?? 1]),
      driverName: cellToString(raw[columnMap.driverName ?? 2]),
      tonnages: sanitizeTonnageCell(cellToString(raw[columnMap.tonnages ?? 3])),
      amountOrRate: cellToString(raw[columnMap.amountOrRate ?? 4]),
    };
    if (!isGridRowEmpty(row)) rows.push(row);
  }

  if (rows.length === 0) return createEmptyGridRows();
  return [...rows, ...createEmptyGridRows(Math.max(2, 8 - rows.length))];
};

/** Parse uploaded .xlsx / .xls / .csv into bulk grid rows */
export const parseSpreadsheetFileToGridRows = async (file: File): Promise<BulkGridRow[]> => {
  const XLSX = (await import('xlsx-js-style')).default;
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array', raw: false });

  const preferred =
    workbook.SheetNames.find((name) => /truck/i.test(name)) ||
    workbook.SheetNames.find((name) => !/instruction/i.test(name)) ||
    workbook.SheetNames[0];

  if (!preferred) {
    throw new Error('No worksheet found in the uploaded file');
  }

  const sheet = workbook.Sheets[preferred];
  const matrix = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    defval: '',
    raw: false,
  }) as unknown[][];

  return matrixToGridRows(matrix);
};

/** Convert legacy tab-separated textarea draft into grid rows */
export const parseTabTextToGridRows = (text: string): BulkGridRow[] => {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  if (lines.length === 0) return createEmptyGridRows();

  const rows = lines.map((line) => {
    const parts = line.split('\t').map((p) => p.trim());
    return {
      truckNo: parts[0] || '',
      trailerNo: parts[1] || '',
      driverName: parts[2] || '',
      tonnages: sanitizeTonnageCell(parts[3] || ''),
      amountOrRate: parts[4] || '',
    };
  });

  // Keep a couple of blank rows ready for more typing
  return [...rows, ...createEmptyGridRows(Math.max(2, 8 - rows.length))];
};

interface BulkDOEntryGridProps {
  rateType: 'per_ton' | 'fixed_total';
  rows: BulkGridRow[];
  onChange: (rows: BulkGridRow[]) => void;
  disabled?: boolean;
}

const BulkDOEntryGrid = ({ rateType, rows, onChange, disabled }: BulkDOEntryGridProps) => {
  const amountHeader = rateType === 'per_ton' ? 'Rate Per Ton' : 'Total Amount';

  const updateCell = (rowIndex: number, field: BulkGridField, value: string) => {
    if (field === 'tonnages' && !isTonnageInput(value)) return;
    const next = rows.map((row, i) => (i === rowIndex ? { ...row, [field]: value } : row));
    onChange(next);
  };

  const addRows = (count = 5) => {
    onChange([...rows, ...createEmptyGridRows(count)]);
  };

  const removeRow = (rowIndex: number) => {
    if (rows.length <= 1) {
      onChange(createEmptyGridRows(1));
      return;
    }
    onChange(rows.filter((_, i) => i !== rowIndex));
  };

  const clearAll = () => {
    onChange(createEmptyGridRows());
  };

  /** Excel-style paste: fill from the focused cell across columns and down rows */
  const handlePaste = (
    startRow: number,
    startField: BulkGridField,
    event: ClipboardEvent<HTMLInputElement>
  ) => {
    const pastedText = event.clipboardData.getData('text');
    if (!pastedText) return;

    const hasGridData = pastedText.includes('\t') || pastedText.includes('\n') || pastedText.includes('\r');
    if (!hasGridData) return; // single value — default paste

    event.preventDefault();
    event.stopPropagation();

    const matrix = pastedText
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      .split('\n')
      .filter((line, idx, arr) => !(idx === arr.length - 1 && line === ''))
      .map((line) => line.split('\t').map((cell) => cell.trim()));

    if (matrix.length === 0) return;

    const startCol = EDITABLE_FIELDS.indexOf(startField);
    if (startCol < 0) return;

    const neededRows = startRow + matrix.length;
    const next = rows.map((r) => ({ ...r }));
    while (next.length < neededRows) {
      next.push(...createEmptyGridRows(1));
    }

    matrix.forEach((cols, rOffset) => {
      const rowIdx = startRow + rOffset;
      cols.forEach((value, cOffset) => {
        const fieldIdx = startCol + cOffset;
        if (fieldIdx < 0 || fieldIdx >= EDITABLE_FIELDS.length) return;
        const field = EDITABLE_FIELDS[fieldIdx];
        next[rowIdx] = {
          ...next[rowIdx],
          [field]: field === 'tonnages' ? sanitizeTonnageCell(value) : value,
        };
      });
    });

    // Leave a couple blank rows at the end for continued typing
    if (!isGridRowEmpty(next[next.length - 1])) {
      next.push(...createEmptyGridRows(2));
    }

    onChange(next);
  };

  const inputClass =
    'w-full min-w-0 px-2 py-1.5 text-sm border-0 bg-transparent text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-primary-500 placeholder:text-gray-300 dark:placeholder:text-gray-600';

  return (
    <div className="space-y-2">
      <div className="overflow-x-auto rounded-md border border-gray-300 dark:border-gray-600">
        <table className="w-full border-collapse min-w-[720px]">
          <thead>
            <tr className="bg-gray-100 dark:bg-gray-700">
              <th className="w-10 px-2 py-2 text-xs font-semibold text-gray-600 dark:text-gray-300 text-center border-b border-r border-gray-300 dark:border-gray-600">
                #
              </th>
              <th className="px-2 py-2 text-xs font-semibold text-gray-700 dark:text-gray-200 text-left border-b border-r border-gray-300 dark:border-gray-600">
                Truck No
              </th>
              <th className="px-2 py-2 text-xs font-semibold text-gray-700 dark:text-gray-200 text-left border-b border-r border-gray-300 dark:border-gray-600">
                Trailer No
              </th>
              <th className="px-2 py-2 text-xs font-semibold text-gray-700 dark:text-gray-200 text-left border-b border-r border-gray-300 dark:border-gray-600">
                Driver Name
              </th>
              <th className="px-2 py-2 text-xs font-semibold text-gray-700 dark:text-gray-200 text-left border-b border-r border-gray-300 dark:border-gray-600 w-28">
                Tonnage
              </th>
              <th className="px-2 py-2 text-xs font-semibold text-gray-700 dark:text-gray-200 text-left border-b border-r border-gray-300 dark:border-gray-600 w-32">
                {amountHeader}
              </th>
              {rateType === 'per_ton' && (
                <th className="px-2 py-2 text-xs font-semibold text-gray-500 dark:text-gray-400 text-left border-b border-r border-gray-300 dark:border-gray-600 w-28">
                  Total (calc)
                </th>
              )}
              <th className="w-10 px-1 py-2 border-b border-gray-300 dark:border-gray-600" />
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rowIndex) => {
              const tonnage = parseFloat(row.tonnages.replace(/,/g, '')) || 0;
              const rate = parseFloat(row.amountOrRate.replace(/,/g, '')) || 0;
              const calcTotal = rateType === 'per_ton' ? tonnage * rate : null;

              return (
                <tr
                  key={rowIndex}
                  className="border-b border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800/40"
                >
                  <td className="px-2 py-0 text-xs text-center text-gray-400 dark:text-gray-500 border-r border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 select-none">
                    {rowIndex + 1}
                  </td>
                  {EDITABLE_FIELDS.map((field) => (
                    <td
                      key={field}
                      className="p-0 border-r border-gray-200 dark:border-gray-700"
                    >
                      <input
                        type="text"
                        inputMode={field === 'tonnages' ? 'decimal' : undefined}
                        value={row[field]}
                        disabled={disabled}
                        onChange={(e) => updateCell(rowIndex, field, e.target.value)}
                        onPaste={(e) => handlePaste(rowIndex, field, e)}
                        className={`${inputClass} ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
                        placeholder={
                          field === 'truckNo'
                            ? 'T844 EKS'
                            : field === 'trailerNo'
                            ? 'T629 ELE'
                            : field === 'driverName'
                            ? 'John Doe'
                            : field === 'tonnages'
                            ? '30.001'
                            : rateType === 'per_ton'
                            ? '1850'
                            : '55500'
                        }
                      />
                    </td>
                  ))}
                  {rateType === 'per_ton' && (
                    <td className="px-2 py-1.5 text-sm text-gray-500 dark:text-gray-400 border-r border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/40 tabular-nums">
                      {row.tonnages.trim() && row.amountOrRate.trim()
                        ? calcTotal!.toLocaleString(undefined, { maximumFractionDigits: 2 })
                        : ''}
                    </td>
                  )}
                  <td className="px-1 py-0.5 text-center">
                    <button
                      type="button"
                      onClick={() => removeRow(rowIndex)}
                      disabled={disabled}
                      title="Remove row"
                      className={`p-1 rounded text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 ${
                        disabled ? 'opacity-40 cursor-not-allowed' : ''
                      }`}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => addRows(5)}
          disabled={disabled}
          className={`inline-flex items-center px-3 py-1.5 text-sm rounded-md border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 ${
            disabled ? 'opacity-50 cursor-not-allowed' : ''
          }`}
        >
          <Plus className="w-4 h-4 mr-1" />
          Add rows
        </button>
        <button
          type="button"
          onClick={clearAll}
          disabled={disabled}
          className={`inline-flex items-center px-3 py-1.5 text-sm rounded-md border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 ${
            disabled ? 'opacity-50 cursor-not-allowed' : ''
          }`}
        >
          Clear grid
        </button>
        <span className="text-xs text-gray-500 dark:text-gray-400">
          Tip: paste Excel cells into any cell — data fills across and down like a spreadsheet.
        </span>
      </div>
    </div>
  );
};

export default BulkDOEntryGrid;
