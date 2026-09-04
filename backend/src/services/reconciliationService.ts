import ExcelJS from 'exceljs';
import mongoose from 'mongoose';
import { Counter } from '../models/Counter';
import { FuelStationConfig } from '../models/FuelStationConfig';
import { LPOSummary } from '../models/LPOSummary';
import {
  IReconciliationLine,
  IReconciliationSession,
  IReconciliationSummary,
  IStatementLine,
  ReconciliationSession,
} from '../models/ReconciliationSession';
import unifiedExportService from './unifiedExportService';
import { isYardStation } from '../utils/yardStations';

export const STATEMENT_TEMPLATE_HEADERS = [
  'S/N (optional)',
  'Date (YYYY-MM-DD)',
  'Station',
  'Truck No',
  'Liters',
  'Amount (optional)',
  'LPO No (optional)',
  'DO No (optional)',
] as const;

const HEADER_ALIASES: Record<string, keyof Omit<IStatementLine, 'lineIndex'>> = {
  's/n': 'sn',
  sn: 'sn',
  's/no': 'sn',
  serial: 'sn',
  'serial no': 'sn',
  date: 'date',
  'date (yyyy-mm-dd)': 'date',
  station: 'station',
  'truck no': 'truckNo',
  truckno: 'truckNo',
  truck: 'truckNo',
  liters: 'liters',
  litres: 'liters',
  ltrs: 'liters',
  amount: 'amount',
  'lpo no': 'lpoNo',
  lpono: 'lpoNo',
  lpo: 'lpoNo',
  'do no': 'doNo',
  dono: 'doNo',
  do: 'doNo',
  notes: 'notes',
  note: 'notes',
};

export function normalizeTruckNo(value: string | null | undefined): string {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '');
}

/** Preserve original cell text for display (only trim edges). */
export function displayTruckNo(value: string | null | undefined): string {
  return String(value || '').trim();
}

export function trucksMatch(a: string | null | undefined, b: string | null | undefined): boolean {
  return normalizeTruckNo(a) === normalizeTruckNo(b);
}

export function normalizeStation(value: string | null | undefined): string {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, ' ');
}

function parseDateOnly(value: unknown): string {
  if (value == null || value === '') return '';
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  const raw = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  return raw.slice(0, 10);
}

function daysBetween(dateA: string, dateB: string): number {
  const a = new Date(`${dateA}T00:00:00.000Z`);
  const b = new Date(`${dateB}T00:00:00.000Z`);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return 0;
  return Math.abs(Math.round((b.getTime() - a.getTime()) / (24 * 60 * 60 * 1000)));
}

function isReconcilableLpoEntry(entry: Record<string, unknown>): boolean {
  if (entry.isCancelled) return false;
  if (entry.isDriverAccount) return false;
  if (entry.isRefer) return false;
  const station = resolveLpoEntryStation(entry);
  if (isYardStation(station)) return false;
  return true;
}

/** Resolve billed station including CUSTOM → customStationName. */
export function resolveLpoEntryStation(entry: Record<string, unknown>): string {
  const base = String(entry.dieselAt || entry.station || '').trim();
  const isCustom =
    entry.isCustomStation === true || base.toUpperCase() === 'CUSTOM';
  if (isCustom) {
    const customName = String(entry.customStationName || '').trim();
    if (customName) return customName;
  }
  return base;
}

export async function getStationsInDateRange(dateFrom: string, dateTo: string): Promise<string[]> {
  const startDate = new Date(`${dateFrom}T00:00:00.000Z`);
  const endDate = new Date(`${dateTo}T23:59:59.999Z`);
  const rangeEntries = await unifiedExportService.getAllLPOEntries({ startDate, endDate });
  const stations = new Set<string>();

  for (const entry of rangeEntries) {
    if (!isReconcilableLpoEntry(entry)) continue;
    const station = resolveLpoEntryStation(entry);
    if (!station || isYardStation(station)) continue;
    stations.add(station);
  }

  return [...stations].sort((a, b) => a.localeCompare(b));
}

export async function generateSessionNo(): Promise<string> {
  const year = new Date().getFullYear();
  const counterId = `reconciliation_${year}`;
  const counter = await Counter.findByIdAndUpdate(
    counterId,
    { $inc: { seq: 1 } },
    { new: true, upsert: true }
  );
  const seq = String(counter?.seq || 1).padStart(4, '0');
  return `REC-${year}-${seq}`;
}

export async function buildStatementTemplateWorkbook(): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Fuel Order System';
  workbook.created = new Date();

  const sheet = workbook.addWorksheet('Statement Template');
  sheet.addRow([...STATEMENT_TEMPLATE_HEADERS]);
  sheet.getRow(1).font = { bold: true };
  sheet.getRow(1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFE2E8F0' },
  };

  sheet.addRow(['1', '2026-01-15', 'LAKE MBEYA', 'T123ABC', 900, 2250000, 'LPO-001', 'DO-12345']);
  sheet.addRow(['2', '2026-01-16', 'LAKE MOROGORO', 'T456DEF', 850, '', '', '']);

  const instructions = workbook.addWorksheet('Instructions');
  instructions.addRow(['Supplier Statement Import Template']);
  instructions.addRow(['']);
  instructions.addRow(['Required columns: Date, Station, Truck No, Liters.']);
  instructions.addRow(['Optional columns: S/N, Amount, LPO No, DO No — include only if your supplier provides them.']);
  instructions.addRow(['1. Fill the "Statement Template" sheet with supplier statement lines.']);
  instructions.addRow(['2. Date format must be YYYY-MM-DD.']);
  instructions.addRow(['3. Station must match names selected when you created the reconciliation.']);
  instructions.addRow(['4. Spacing/capitalization is ignored (e.g. "lake mbeya" = "LAKE MBEYA").']);
  instructions.addRow(['5. Wrong station names are flagged on upload — map them before import completes.']);
  instructions.addRow(['6. Yard stations (Tanga Yard, Dar Yard) are not reconciled.']);
  instructions.addRow(['7. Save as .xlsx and upload inside the open reconciliation session.']);

  sheet.columns = [
    { width: 10 },
    { width: 16 },
    { width: 22 },
    { width: 14 },
    { width: 10 },
    { width: 16 },
    { width: 16 },
    { width: 16 },
  ];

  return workbook;
}

function mapHeaderToField(header: string): keyof Omit<IStatementLine, 'lineIndex'> | null {
  const key = header
    .trim()
    .toLowerCase()
    .replace(/\s*\(optional\)\s*$/, '');
  return HEADER_ALIASES[key] || null;
}

export async function parseStatementWorkbookAsync(buffer: Buffer): Promise<IStatementLine[]> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer);

  const sheet =
    workbook.getWorksheet('Statement Template') ||
    workbook.worksheets.find((ws) => ws.name.toLowerCase().includes('statement')) ||
    workbook.worksheets[0];

  if (!sheet) {
    throw new Error('No worksheet found in uploaded file');
  }

  const headerRow = sheet.getRow(1);
  const columnMap: Record<number, keyof Omit<IStatementLine, 'lineIndex'>> = {};
  headerRow.eachCell({ includeEmpty: false }, (cell, colNumber) => {
    const field = mapHeaderToField(String(cell.value || ''));
    if (field) columnMap[colNumber] = field;
  });

  const requiredFields: Array<keyof Omit<IStatementLine, 'lineIndex'>> = [
    'date',
    'station',
    'truckNo',
    'liters',
  ];
  const mappedFields = new Set(Object.values(columnMap));
  for (const req of requiredFields) {
    if (!mappedFields.has(req)) {
      throw new Error(`Missing required column for "${req}" in statement template`);
    }
  }

  const lines: IStatementLine[] = [];
  sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return;
    const partial: Partial<IStatementLine> = {};
    Object.entries(columnMap).forEach(([colStr, field]) => {
      const cell = row.getCell(Number(colStr));
      partial[field] = cell.value as never;
    });

    const truckRaw = displayTruckNo(String(partial.truckNo || ''));
    const truckNo = normalizeTruckNo(truckRaw);
    const station = String(partial.station || '').trim();
    const liters = Number(partial.liters);
    const date = parseDateOnly(partial.date);

    if (!truckNo && !station && !date && !partial.liters) return;
    if (!truckNo || !station || !date || Number.isNaN(liters)) {
      throw new Error(`Invalid data on row ${rowNumber}: date, station, truck, and liters are required`);
    }

    lines.push({
      lineIndex: rowNumber - 2,
      rowNumber,
      date,
      station,
      truckNo,
      truckNoRaw: truckRaw,
      liters,
      sn:
        partial.sn != null && String(partial.sn).trim() !== '' && !Number.isNaN(Number(partial.sn))
          ? Number(partial.sn)
          : undefined,
      amount:
        partial.amount != null && String(partial.amount).trim() !== '' && !Number.isNaN(Number(partial.amount))
          ? Number(partial.amount)
          : undefined,
      lpoNo:
        partial.lpoNo != null && String(partial.lpoNo).trim() !== ''
          ? String(partial.lpoNo).trim()
          : undefined,
      doNo:
        partial.doNo != null && String(partial.doNo).trim() !== ''
          ? String(partial.doNo).trim()
          : undefined,
      notes:
        partial.notes != null && String(partial.notes).trim() !== ''
          ? String(partial.notes).trim()
          : undefined,
    });
  });

  if (lines.length === 0) {
    throw new Error('No statement lines found in uploaded file');
  }

  return lines;
}

export interface LpoEntryForReconciliation {
  lpoEntryId: string;
  lpoNo: string;
  lpoDate: string;
  lpoStation: string;
  lpoTruckNo: string;
  lpoTruckNoRaw: string;
  lpoLiters: number;
  lpoAmount: number;
  lpoDoNo: string;
  source: 'date_range' | 'pending_carry';
  originSessionId?: string;
  originSessionNo?: string;
  originSessionTitle?: string;
  originLineId?: string;
  matchStatus?: string;
  droppedAt?: string;
  droppedBy?: string;
}

export async function loadLpoEntriesForSession(opts: {
  stations: string[];
  dateFrom: string;
  dateTo: string;
  pendingMode: IReconciliationSession['pendingMode'];
  pendingDateFrom?: string;
  pendingDateTo?: string;
  selectedPendingEntryIds?: string[];
  excludeSessionId?: string;
}): Promise<LpoEntryForReconciliation[]> {
  const stationSet = new Set(opts.stations.map(normalizeStation));
  const results: LpoEntryForReconciliation[] = [];
  const seen = new Set<string>();

  const startDate = new Date(`${opts.dateFrom}T00:00:00.000Z`);
  const endDate = new Date(`${opts.dateTo}T23:59:59.999Z`);
  const rangeEntries = await unifiedExportService.getAllLPOEntries({ startDate, endDate });

  for (const entry of rangeEntries) {
    if (!isReconcilableLpoEntry(entry)) continue;
    const station = resolveLpoEntryStation(entry);
    if (!stationSet.has(normalizeStation(station))) continue;
    const lpoEntryId = String(entry._id);
    if (seen.has(lpoEntryId)) continue;
    seen.add(lpoEntryId);
    results.push({
      lpoEntryId,
      lpoNo: String(entry.lpoNo || ''),
      lpoDate: parseDateOnly(entry.date),
      lpoStation: station,
      lpoTruckNo: normalizeTruckNo(String(entry.truckNo || '')),
      lpoTruckNoRaw: displayTruckNo(String(entry.truckNo || '')),
      lpoLiters: Number(entry.ltrs ?? entry.liters ?? 0),
      lpoAmount: Number((entry.ltrs ?? entry.liters ?? 0) * (entry.pricePerLtr ?? entry.rate ?? 0)),
      lpoDoNo: String(entry.doSdo || entry.doNo || ''),
      source: 'date_range',
    });
  }

  if (opts.pendingMode !== 'none') {
    const pending = await getOpenPendingEntries({
      stations: opts.stations,
      pendingMode: opts.pendingMode,
      pendingDateFrom: opts.pendingDateFrom,
      pendingDateTo: opts.pendingDateTo,
      selectedPendingEntryIds: opts.selectedPendingEntryIds,
      excludeSessionId: opts.excludeSessionId,
    });
    for (const p of pending) {
      if (seen.has(p.lpoEntryId)) continue;
      seen.add(p.lpoEntryId);
      results.push(p);
    }
  }

  return results.sort((a, b) => {
    const d = a.lpoDate.localeCompare(b.lpoDate);
    if (d !== 0) return d;
    return a.lpoTruckNo.localeCompare(b.lpoTruckNo);
  });
}

export async function getOpenPendingEntries(opts: {
  stations: string[];
  pendingMode?: IReconciliationSession['pendingMode'];
  pendingDateFrom?: string;
  pendingDateTo?: string;
  selectedPendingEntryIds?: string[];
  excludeSessionId?: string;
}): Promise<LpoEntryForReconciliation[]> {
  const stationSet = new Set(opts.stations.map(normalizeStation));
  const selectedSet =
    opts.selectedPendingEntryIds && opts.selectedPendingEntryIds.length > 0
      ? new Set(opts.selectedPendingEntryIds)
      : null;

  const sessions = await ReconciliationSession.find({
    status: { $in: ['draft', 'in_progress', 'completed'] },
    ...(opts.excludeSessionId ? { _id: { $ne: opts.excludeSessionId } } : {}),
  }).lean();

  const pending: LpoEntryForReconciliation[] = [];
  const seen = new Set<string>();

  for (const session of sessions) {
    for (const line of session.lines || []) {
      if (line.carriedForwardToSessionId) continue;
      if (!line.lpoEntryId) continue;
      if (seen.has(line.lpoEntryId)) continue;

      const isPendingLpo =
        line.matchStatus === 'unmatched_lpo' ||
        line.matchStatus === 'liter_mismatch' ||
        line.matchStatus === 'stale_pending';
      if (!isPendingLpo) continue;
      if (line.userDecision === 'drop') continue;
      if (line.matchStatus === 'stale_pending' && line.userDecision !== 'accept') continue;

      const station = line.lpoStation || '';
      if (!stationSet.has(normalizeStation(station))) continue;

      if (opts.pendingMode === 'selected' && selectedSet && !selectedSet.has(line.lpoEntryId)) {
        continue;
      }

      if (opts.pendingDateFrom || opts.pendingDateTo) {
        const lpoDate = line.lpoDate || '';
        if (opts.pendingDateFrom && lpoDate < opts.pendingDateFrom) continue;
        if (opts.pendingDateTo && lpoDate > opts.pendingDateTo) continue;
      }

      seen.add(line.lpoEntryId);
      pending.push({
        lpoEntryId: line.lpoEntryId,
        lpoNo: line.lpoNo || '',
        lpoDate: line.lpoDate || '',
        lpoStation: line.lpoStation || '',
        lpoTruckNo: normalizeTruckNo(line.lpoTruckNo || ''),
        lpoTruckNoRaw: line.lpoTruckNoRaw || displayTruckNo(line.lpoTruckNo || ''),
        lpoLiters: Number(line.lpoLiters || 0),
        lpoAmount: Number(line.lpoAmount || 0),
        lpoDoNo: line.lpoDoNo || '',
        source: 'pending_carry',
        originSessionId: String(session._id),
        originSessionNo: session.sessionNo || '',
        originSessionTitle: session.title || '',
        originLineId: String((line as { _id?: unknown })._id || ''),
        matchStatus: line.matchStatus,
      });
    }
  }

  return pending.sort((a, b) => a.lpoDate.localeCompare(b.lpoDate));
}

export async function getDroppedPendingEntries(opts: {
  stations: string[];
  pendingDateFrom?: string;
  pendingDateTo?: string;
}): Promise<LpoEntryForReconciliation[]> {
  const stationSet = new Set(opts.stations.map(normalizeStation));
  const sessions = await ReconciliationSession.find({
    status: { $in: ['draft', 'in_progress', 'completed'] },
  }).lean();

  const dropped: LpoEntryForReconciliation[] = [];
  const seen = new Set<string>();

  for (const session of sessions) {
    for (const line of session.lines || []) {
      if (!line.lpoEntryId) continue;
      if (line.matchStatus !== 'dropped' && line.userDecision !== 'drop') continue;
      if (seen.has(line.lpoEntryId)) continue;

      const station = line.lpoStation || '';
      if (!stationSet.has(normalizeStation(station))) continue;

      if (opts.pendingDateFrom || opts.pendingDateTo) {
        const lpoDate = line.lpoDate || '';
        if (opts.pendingDateFrom && lpoDate < opts.pendingDateFrom) continue;
        if (opts.pendingDateTo && lpoDate > opts.pendingDateTo) continue;
      }

      seen.add(line.lpoEntryId);
      dropped.push({
        lpoEntryId: line.lpoEntryId,
        lpoNo: line.lpoNo || '',
        lpoDate: line.lpoDate || '',
        lpoStation: line.lpoStation || '',
        lpoTruckNo: normalizeTruckNo(line.lpoTruckNo || ''),
        lpoTruckNoRaw: line.lpoTruckNoRaw || displayTruckNo(line.lpoTruckNo || ''),
        lpoLiters: Number(line.lpoLiters || 0),
        lpoAmount: Number(line.lpoAmount || 0),
        lpoDoNo: line.lpoDoNo || '',
        source: 'pending_carry',
        originSessionId: String(session._id),
        originSessionNo: session.sessionNo || '',
        originSessionTitle: session.title || '',
        originLineId: String((line as { _id?: unknown })._id || ''),
        matchStatus: 'dropped',
        droppedAt: line.resolvedAt ? new Date(line.resolvedAt).toISOString() : undefined,
        droppedBy: line.resolvedBy,
      });
    }
  }

  return dropped.sort((a, b) => a.lpoDate.localeCompare(b.lpoDate));
}

function buildLpoLine(entry: LpoEntryForReconciliation): IReconciliationLine {
  return {
    lpoEntryId: entry.lpoEntryId,
    lpoNo: entry.lpoNo,
    lpoDate: entry.lpoDate,
    lpoStation: entry.lpoStation,
    lpoTruckNo: entry.lpoTruckNo,
    lpoTruckNoRaw: entry.lpoTruckNoRaw,
    lpoLiters: entry.lpoLiters,
    lpoAmount: entry.lpoAmount,
    lpoDoNo: entry.lpoDoNo,
    source: entry.source,
    originSessionId: entry.originSessionId,
    matchStatus: 'unmatched_lpo',
  };
}

function stmtRowLabel(stmt: IStatementLine): string {
  const row = stmt.rowNumber ?? stmt.lineIndex + 2;
  return `Row ${row}`;
}

function applyStatementToLine(
  line: IReconciliationLine,
  stmts: IStatementLine[],
  indexes: number[]
): void {
  const picked = indexes
    .map((i) => stmts.find((s) => s.lineIndex === i))
    .filter(Boolean) as IStatementLine[];
  if (!picked.length) return;

  line.statementLineIndexes = indexes;
  line.statementLineIndex = picked[0].lineIndex;
  line.statementRowNumber = picked[0].rowNumber ?? picked[0].lineIndex + 2;
  line.statementDate = picked.map((s) => s.date).join(', ');
  line.statementStation = picked[0].station;
  line.statementTruckNoRaw = picked.map((s) => s.truckNoRaw || s.truckNo).join(' + ');
  line.statementTruckNo = picked[0].truckNo;
  line.statementLiters = picked.reduce((sum, s) => sum + Number(s.liters || 0), 0);
  line.statementAmount = picked.reduce((sum, s) => sum + Number(s.amount || 0), 0) || undefined;
  line.statementLpoNo = picked[0].lpoNo;
  line.statementDoNo = picked[0].doNo;
}

function finalizeLineMatch(
  line: IReconciliationLine,
  entry: LpoEntryForReconciliation,
  session: Pick<IReconciliationSession, 'dateFrom' | 'dateTo' | 'staleMatchThresholdDays'>,
  matchType: IReconciliationLine['matchType'] = 'one_to_one'
): void {
  line.matchType = matchType;
  const literMatch = Number(line.statementLiters) === Number(entry.lpoLiters);
  const stmtDate = parseDateOnly(String(line.statementDate || '').split(',')[0]);
  const daysGap = daysBetween(entry.lpoDate, stmtDate);

  if (literMatch) {
    if (entry.source === 'pending_carry' && daysGap > session.staleMatchThresholdDays) {
      line.matchStatus = 'stale_pending';
      line.daysGap = daysGap;
      line.exceptionCode = 'STALE_PENDING_MATCH';
      line.exceptionMessage = `Pending LPO is ${daysGap} days from statement (threshold ${session.staleMatchThresholdDays})`;
    } else if (matchType === 'split' || matchType === 'merge') {
      line.matchStatus = 'split_merge_candidate';
      line.exceptionCode = matchType === 'split' ? 'SPLIT_MATCH' : 'MERGE_MATCH';
      line.exceptionMessage =
        matchType === 'split'
          ? `Split match: LPO ${entry.lpoLiters}L = statement rows ${line.statementLineIndexes?.map((i) => i + 2).join(', ')}`
          : `Merge match: ${entry.lpoLiters}L grouped with other LPO lines → statement ${line.statementLiters}L`;
    } else {
      line.matchStatus = 'matched';
      line.exceptionCode = undefined;
      line.exceptionMessage = undefined;
    }
  } else {
    line.matchStatus = 'liter_mismatch';
    line.exceptionCode = 'LITER_MISMATCH';
    line.exceptionMessage = `Liter mismatch: we allocated ${entry.lpoLiters}L, statement shows ${line.statementLiters}L (${stmtRowLabel({ lineIndex: line.statementLineIndex ?? 0, rowNumber: line.statementRowNumber } as IStatementLine)})`;
  }
}

function findSubsetIndexes(
  items: Array<{ index: number; liters: number }>,
  target: number,
  maxItems = 6
): number[] | null {
  if (items.length > maxItems) items = items.slice(0, maxItems);
  let result: number[] | null = null;
  const search = (start: number, chosen: number[], sum: number) => {
    if (result) return;
    if (Math.abs(sum - target) < 0.001) {
      result = [...chosen];
      return;
    }
    if (sum > target || start >= items.length) return;
    for (let i = start; i < items.length; i++) {
      chosen.push(items[i].index);
      search(i + 1, chosen, sum + items[i].liters);
      chosen.pop();
      if (result) return;
    }
  };
  search(0, [], 0);
  return result;
}

function buildStatementOnlyLine(
  stmt: IStatementLine,
  stationAllowed: Set<string>
): IReconciliationLine {
  const stationNorm = normalizeStation(stmt.station);
  const inScope = stationAllowed.has(stationNorm);
  const row = stmt.rowNumber ?? stmt.lineIndex + 2;
  return {
    statementLineIndex: stmt.lineIndex,
    statementLineIndexes: [stmt.lineIndex],
    statementRowNumber: row,
    statementDate: stmt.date,
    statementStation: stmt.station,
    statementTruckNo: stmt.truckNo,
    statementTruckNoRaw: stmt.truckNoRaw || stmt.truckNo,
    statementLiters: stmt.liters,
    statementAmount: stmt.amount,
    statementLpoNo: stmt.lpoNo,
    statementDoNo: stmt.doNo,
    matchStatus: 'unmatched_statement',
    exceptionCode: inScope ? 'STATEMENT_TRUCK_NOT_IN_LPO' : 'STATEMENT_STATION_OUT_OF_SCOPE',
    exceptionMessage: inScope
      ? `Statement ${stmtRowLabel(stmt)}: truck "${stmt.truckNoRaw || stmt.truckNo}" ${stmt.liters}L not in our LPO list`
      : `Statement ${stmtRowLabel(stmt)}: station "${stmt.station}" outside selected stations`,
  };
}

function isReconciledMatchStatus(status: IReconciliationLine['matchStatus']): boolean {
  return status === 'matched' || status === 'rectified' || status === 'manual_matched';
}

function isPreservedMatchLine(line: IReconciliationLine): boolean {
  if (isReconciledMatchStatus(line.matchStatus)) return true;
  if (line.matchStatus === 'split_merge_candidate' && line.userDecision === 'accept') return true;
  return false;
}

function isPreservedDroppedLine(line: IReconciliationLine): boolean {
  return line.matchStatus === 'dropped';
}

/** Content key so duplicate statement rows can't auto-match after one is claimed. */
export function statementContentFingerprint(
  truckNo: string,
  station: string,
  liters: number
): string {
  return `${normalizeTruckNo(truckNo)}|${normalizeStation(station)}|${Number(liters)}`;
}

function fingerprintFromStatement(stmt: IStatementLine): string {
  return statementContentFingerprint(stmt.truckNo, stmt.station, Number(stmt.liters || 0));
}

function collectUsedFromLines(
  lines: IReconciliationLine[],
  usedLpo: Set<string>,
  usedStatement: Set<number>,
  usedFingerprints: Set<string>
): void {
  for (const line of lines) {
    if (line.lpoEntryId) usedLpo.add(line.lpoEntryId);
    line.linkedLpoEntryIds?.forEach((id) => usedLpo.add(id));
    const indexes = lineStatementIndexes(line);
    indexes.forEach((i) => usedStatement.add(i));
    if (
      isPreservedMatchLine(line) &&
      indexes.length > 0 &&
      line.statementTruckNo &&
      line.statementStation != null &&
      line.statementLiters != null
    ) {
      usedFingerprints.add(
        statementContentFingerprint(
          line.statementTruckNo,
          line.statementStation,
          Number(line.statementLiters)
        )
      );
    }
  }
}

function claimStatement(
  stmt: IStatementLine,
  usedStatement: Set<number>,
  usedFingerprints: Set<string>
): void {
  usedStatement.add(stmt.lineIndex);
  usedFingerprints.add(fingerprintFromStatement(stmt));
}

function statementAvailable(
  stmt: IStatementLine,
  usedStatement: Set<number>,
  usedFingerprints: Set<string>
): boolean {
  if (usedStatement.has(stmt.lineIndex)) return false;
  if (usedFingerprints.has(fingerprintFromStatement(stmt))) return false;
  return true;
}

export function runAutoMatch(
  lpoEntries: LpoEntryForReconciliation[],
  statementLines: IStatementLine[],
  session: Pick<IReconciliationSession, 'dateFrom' | 'dateTo' | 'staleMatchThresholdDays' | 'stations'>,
  opts?: {
    preservedLines?: IReconciliationLine[];
  }
): IReconciliationLine[] {
  const stationSet = new Set(session.stations.map(normalizeStation));
  const usedStatement = new Set<number>();
  const usedLpo = new Set<string>();
  const usedFingerprints = new Set<string>();
  const preservedMatched = (opts?.preservedLines || []).filter(isPreservedMatchLine);
  const preservedDropped = (opts?.preservedLines || []).filter(isPreservedDroppedLine);
  const preserved = [...preservedMatched, ...preservedDropped];
  collectUsedFromLines(preserved, usedLpo, usedStatement, usedFingerprints);
  const lines: IReconciliationLine[] = [...preserved];

  // Phase 1: exact 1:1 liter match
  for (const entry of lpoEntries) {
    if (usedLpo.has(entry.lpoEntryId)) continue;
    const candidates = statementLines.filter((s) => {
      if (!statementAvailable(s, usedStatement, usedFingerprints)) return false;
      if (!trucksMatch(s.truckNo, entry.lpoTruckNo)) return false;
      if (normalizeStation(s.station) !== normalizeStation(entry.lpoStation)) return false;
      return Number(s.liters) === Number(entry.lpoLiters);
    });
    if (!candidates.length) continue;
    const stmt = candidates[0];
    claimStatement(stmt, usedStatement, usedFingerprints);
    usedLpo.add(entry.lpoEntryId);
    const line = buildLpoLine(entry);
    applyStatementToLine(line, statementLines, [stmt.lineIndex]);
    finalizeLineMatch(line, entry, session, 'one_to_one');
    lines.push(line);
  }

  // Phase 2: split — one LPO → multiple statement rows (same truck+station, liters sum)
  for (const entry of lpoEntries) {
    if (usedLpo.has(entry.lpoEntryId)) continue;
    const pool = statementLines
      .filter(
        (s) =>
          statementAvailable(s, usedStatement, usedFingerprints) &&
          trucksMatch(s.truckNo, entry.lpoTruckNo) &&
          normalizeStation(s.station) === normalizeStation(entry.lpoStation)
      )
      .map((s) => ({ index: s.lineIndex, liters: Number(s.liters) }));
    const subset = findSubsetIndexes(pool, Number(entry.lpoLiters));
    if (!subset || subset.length < 2) continue;
    subset.forEach((i) => {
      const stmt = statementLines.find((s) => s.lineIndex === i);
      if (stmt) claimStatement(stmt, usedStatement, usedFingerprints);
    });
    usedLpo.add(entry.lpoEntryId);
    const line = buildLpoLine(entry);
    applyStatementToLine(line, statementLines, subset);
    finalizeLineMatch(line, entry, session, 'split');
    lines.push(line);
  }

  // Note: multi-LPO → one statement (merge) is intentionally NOT auto-matched.
  // Users link those manually via the Link modal.

  // Phase 4: remaining LPO — do not bind statement when truck/station match but liters differ
  for (const entry of lpoEntries) {
    if (usedLpo.has(entry.lpoEntryId)) continue;
    const line = buildLpoLine(entry);
    const truckStationCandidates = statementLines.filter(
      (s) =>
        statementAvailable(s, usedStatement, usedFingerprints) &&
        trucksMatch(s.truckNo, entry.lpoTruckNo) &&
        normalizeStation(s.station) === normalizeStation(entry.lpoStation)
    );
    if (truckStationCandidates.length === 0) {
      line.exceptionCode =
        entry.source === 'date_range' ? 'LPO_NOT_ON_STATEMENT' : 'PENDING_LPO_NOT_ON_STATEMENT';
      line.exceptionMessage = `Our LPO truck ${entry.lpoTruckNoRaw || entry.lpoTruckNo} (${entry.lpoLiters}L) not on statement`;
      lines.push(line);
      continue;
    }
    const stmt = truckStationCandidates[0];
    // Link indexes so Statement entries can show this message (do NOT claim —
    // other LPO lines may also liter-mismatch against the same statement row).
    line.statementLineIndex = stmt.lineIndex;
    line.statementLineIndexes = [stmt.lineIndex];
    line.statementRowNumber = stmt.rowNumber ?? stmt.lineIndex + 2;
    line.statementDate = stmt.date;
    line.statementStation = stmt.station;
    line.statementTruckNoRaw = stmt.truckNoRaw || stmt.truckNo;
    line.statementTruckNo = stmt.truckNo;
    line.originalStatementTruckNoRaw = stmt.originalTruckNoRaw || stmt.truckNoRaw || stmt.truckNo;
    line.originalStatementTruckNo = stmt.originalTruckNo || stmt.truckNo;
    line.statementLiters = Number(stmt.liters);
    line.statementAmount = stmt.amount;
    line.statementLpoNo = stmt.lpoNo;
    line.statementDoNo = stmt.doNo;
    line.matchStatus = 'liter_mismatch';
    line.exceptionCode = 'TRUCK_STATION_LITER_MISMATCH';
    line.exceptionMessage = `Our LPO ${entry.lpoLiters}L — ${stmtRowLabel(stmt)} shows ${stmt.liters}L (same truck/station, liters differ). Manual match or fix before linking.`;
    lines.push(line);
  }

  // Phase 5: unmatched statement rows (incl. duplicates blocked by fingerprint)
  statementLines.forEach((stmt) => {
    if (usedStatement.has(stmt.lineIndex)) return;
    if (isYardStation(stmt.station)) return;
    // Already explained by an LPO liter-mismatch (or other) line pointing at this row
    if (lines.some((l) => lineStatementIndexes(l).includes(stmt.lineIndex))) return;
    const line = buildStatementOnlyLine(stmt, stationSet);
    if (usedFingerprints.has(fingerprintFromStatement(stmt))) {
      line.exceptionCode = 'DUPLICATE_STATEMENT_LOCKED';
      line.exceptionMessage = `Statement ${stmtRowLabel(stmt)}: duplicate of an already-matched statement row (truck/station/liters). Locked to prevent double-count.`;
    }
    lines.push(line);
  });

  return lines;
}

export function computeSummary(
  lines: IReconciliationLine[],
  statementLines: IStatementLine[] = []
): IReconciliationSummary {
  const lpoLines = lines.filter((l) => l.lpoEntryId);
  const statementOnly = lines.filter((l) => !l.lpoEntryId && l.statementLineIndex != null);

  let matched = 0;
  let pendingLpo = 0;
  let pendingStatement = 0;
  let exceptions = 0;
  let stalePending = 0;
  let literVarianceTotal = 0;

  const reconciledStatuses = new Set<IReconciliationLine['matchStatus']>([
    'matched',
    'rectified',
    'manual_matched',
  ]);

  const matchedLpoEntryIds = new Set<string>();
  const matchedStatementIndexes = new Set<number>();

  for (const line of lines) {
    if (reconciledStatuses.has(line.matchStatus)) {
      matched += 1;
      if (line.lpoEntryId) matchedLpoEntryIds.add(line.lpoEntryId);
      line.linkedLpoEntryIds?.forEach((id) => matchedLpoEntryIds.add(id));
      line.statementLineIndexes?.forEach((i) => matchedStatementIndexes.add(i));
      if (line.statementLineIndex != null) matchedStatementIndexes.add(line.statementLineIndex);
    }
    if (line.matchStatus === 'unmatched_lpo') pendingLpo += 1;
    if (line.matchStatus === 'unmatched_statement') pendingStatement += 1;
    if (line.matchStatus === 'liter_mismatch' || line.exceptionCode === 'TRUCK_STATION_LITER_MISMATCH') {
      exceptions += 1;
      if (line.matchStatus === 'liter_mismatch') pendingLpo += 1;
      literVarianceTotal += Math.abs(
        Number(line.lpoLiters || 0) - Number(line.statementLiters || 0)
      );
    }
    if (line.matchStatus === 'split_merge_candidate') {
      exceptions += 1;
    }
    if (line.matchStatus === 'stale_pending') {
      stalePending += 1;
      exceptions += 1;
    }
    if (
      line.exceptionCode &&
      !reconciledStatuses.has(line.matchStatus) &&
      line.matchStatus !== 'liter_mismatch' &&
      line.matchStatus !== 'stale_pending'
    ) {
      exceptions += 1;
    }
  }

  const statementTotalLiters = statementLines.reduce((s, l) => s + Number(l.liters || 0), 0);
  const lpoTotalLiters = lpoLines.reduce((s, l) => s + Number(l.lpoLiters || 0), 0);
  let reconciledStatementLiters = 0;
  let reconciledLpoLiters = 0;
  const literVarianceDetails: IReconciliationSummary['literVarianceDetails'] = [];

  for (const line of lines) {
    if (line.statementLiters != null && reconciledStatuses.has(line.matchStatus)) {
      reconciledStatementLiters += Number(line.statementLiters);
    }
    if (line.lpoLiters != null && reconciledStatuses.has(line.matchStatus)) {
      reconciledLpoLiters += Number(line.lpoLiters);
    }
    if (
      line.matchStatus === 'unmatched_lpo' ||
      line.matchStatus === 'liter_mismatch' ||
      line.matchStatus === 'unmatched_statement' ||
      line.exceptionCode === 'TRUCK_STATION_LITER_MISMATCH'
    ) {
      const lpoL = Number(line.lpoLiters || 0);
      const stmtL = Number(line.statementLiters || 0);
      const category =
        line.matchStatus === 'unmatched_statement'
          ? 'statement_not_in_lpo'
          : line.exceptionCode === 'TRUCK_STATION_LITER_MISMATCH' ||
              line.matchStatus === 'liter_mismatch'
            ? 'liter_mismatch'
            : 'lpo_not_in_statement';
      const stmtIndexes =
        line.statementLineIndexes?.length
          ? line.statementLineIndexes
          : line.statementLineIndex != null
            ? [line.statementLineIndex]
            : [];
      const statementSn = stmtIndexes
        .map((idx) => statementLines.find((s) => s.lineIndex === idx)?.sn)
        .find((sn) => sn != null);

      literVarianceDetails?.push({
        category,
        truckNo: line.lpoTruckNoRaw || line.statementTruckNoRaw || line.lpoTruckNo || line.statementTruckNo || '—',
        station: line.lpoStation || line.statementStation || '—',
        lpoLiters: lpoL,
        statementLiters: stmtL,
        difference: lpoL - stmtL,
        reason: line.exceptionMessage || line.matchStatus,
        statementRows: line.statementRowNumber
          ? `Row ${line.statementRowNumber}`
          : line.statementLineIndexes?.map((i) => `Row ${i + 2}`).join(', '),
        statementSn,
        lineId: String((line as { _id?: unknown })._id || '') || undefined,
        originSessionId: line.originSessionId,
      });
    }
  }

  return {
    totalLpoLines: lpoLines.length,
    totalStatementLines: statementLines.length || statementOnly.length + matched,
    matched,
    matchedLpoLines: matchedLpoEntryIds.size,
    matchedStatementRows: matchedStatementIndexes.size,
    pendingLpo,
    pendingStatement,
    exceptions,
    stalePending,
    literVarianceTotal,
    statementTotalLiters,
    lpoTotalLiters,
    reconciledStatementLiters,
    reconciledLpoLiters,
    literDifference: statementTotalLiters - reconciledStatementLiters,
    literVarianceDetails,
  };
}

export async function markPendingCarriedForward(
  originSessionId: string,
  lpoEntryIds: string[],
  targetSessionId: string
): Promise<void> {
  if (!originSessionId || lpoEntryIds.length === 0) return;
  const session = await ReconciliationSession.findById(originSessionId);
  if (!session) return;

  const idSet = new Set(lpoEntryIds);
  let changed = false;
  for (const line of session.lines) {
    if (line.lpoEntryId && idSet.has(line.lpoEntryId) && !line.carriedForwardToSessionId) {
      line.carriedForwardToSessionId = targetSessionId;
      changed = true;
    }
  }
  if (changed) await session.save();
}

export async function releaseCarriedForwardForSession(targetSessionId: string): Promise<void> {
  if (!targetSessionId) return;
  const sessions = await ReconciliationSession.find({
    'lines.carriedForwardToSessionId': targetSessionId,
  });
  for (const session of sessions) {
    let changed = false;
    for (const line of session.lines) {
      if (line.carriedForwardToSessionId === targetSessionId) {
        line.carriedForwardToSessionId = undefined;
        changed = true;
      }
    }
    if (changed) await session.save();
  }
}

const EXPORT_THIN_BORDER: Partial<ExcelJS.Borders> = {
  top: { style: 'thin' },
  left: { style: 'thin' },
  bottom: { style: 'thin' },
  right: { style: 'thin' },
};

const EXPORT_CENTER_ALIGN: Partial<ExcelJS.Alignment> = {
  horizontal: 'center',
  vertical: 'middle',
};

/** LPO-entry layout for Reconciled / Pending trucks sheets (matches LPO summary style). */
const LPO_ENTRY_EXPORT_HEADERS = [
  'S/N',
  'Date',
  'LPO No.',
  'Diesel At',
  'DO/SDO',
  'Truck No.',
  'Liters',
  'Price per Liter',
  'Total Amount',
  'Destinations',
] as const;

interface LpoEntryExportEnrichment {
  doNo: string;
  rate: number;
  destination: string;
  liters?: number;
  amount?: number;
  lpoNo?: string;
  date?: string;
  station?: string;
  truckNo?: string;
}

function collectLineLpoEntryIds(line: IReconciliationLine): string[] {
  if (line.linkedLpoEntryIds?.length) {
    return [...new Set(line.linkedLpoEntryIds.filter(Boolean))];
  }
  return line.lpoEntryId ? [line.lpoEntryId] : [];
}

async function loadLpoEntryEnrichmentMap(
  entryIds: string[]
): Promise<Map<string, LpoEntryExportEnrichment>> {
  const map = new Map<string, LpoEntryExportEnrichment>();
  const unique = [...new Set(entryIds.filter(Boolean))];
  if (unique.length === 0) return map;

  const objectIds = unique
    .filter((id) => mongoose.Types.ObjectId.isValid(id))
    .map((id) => new mongoose.Types.ObjectId(id));
  if (objectIds.length === 0) return map;

  const rows = await LPOSummary.aggregate([
    { $match: { isDeleted: { $ne: true }, 'entries._id': { $in: objectIds } } },
    { $unwind: '$entries' },
    { $match: { 'entries._id': { $in: objectIds } } },
    {
      $project: {
        _id: '$entries._id',
        lpoNo: 1,
        date: 1,
        station: '$station',
        customStationName: 1,
        doNo: '$entries.doNo',
        truckNo: '$entries.truckNo',
        liters: '$entries.liters',
        rate: '$entries.rate',
        amount: '$entries.amount',
        dest: '$entries.dest',
        isCustomStation: '$entries.isCustomStation',
        entryCustomStationName: '$entries.customStationName',
      },
    },
  ]);

  for (const row of rows) {
    const id = String(row._id);
    const station = resolveLpoEntryStation({
      dieselAt: row.station,
      station: row.station,
      isCustomStation: row.isCustomStation,
      customStationName: row.entryCustomStationName || row.customStationName,
    });
    const liters = Number(row.liters ?? 0);
    const rate = Number(row.rate ?? 0);
    const amount =
      row.amount != null && !Number.isNaN(Number(row.amount))
        ? Number(row.amount)
        : Number((liters * rate).toFixed(4));
    map.set(id, {
      doNo: String(row.doNo || ''),
      rate,
      destination: String(row.dest || ''),
      liters,
      amount,
      lpoNo: String(row.lpoNo || ''),
      date: parseDateOnly(row.date),
      station,
      truckNo: displayTruckNo(String(row.truckNo || '')),
    });
  }

  return map;
}

function styleExportHeaderRow(row: ExcelJS.Row, colCount: number): void {
  row.font = { bold: true };
  row.alignment = EXPORT_CENTER_ALIGN;
  row.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFE0E0E0' },
  };
  for (let col = 1; col <= colCount; col++) {
    row.getCell(col).border = EXPORT_THIN_BORDER;
  }
}

function styleExportDataRow(row: ExcelJS.Row, colCount: number): void {
  for (let col = 1; col <= colCount; col++) {
    const cell = row.getCell(col);
    cell.alignment = EXPORT_CENTER_ALIGN;
    cell.border = EXPORT_THIN_BORDER;
  }
}

function buildLpoEntryExportValues(
  sn: number,
  line: IReconciliationLine,
  entryId: string | undefined,
  enrichment: LpoEntryExportEnrichment | undefined
): (string | number)[] {
  const liters =
    enrichment?.liters ??
    (line.lpoLiters != null ? Number(line.lpoLiters) : 0);
  const rate =
    enrichment?.rate ??
    (liters > 0 && line.lpoAmount != null
      ? Number((Number(line.lpoAmount) / liters).toFixed(4))
      : 0);
  const amount =
    enrichment?.amount ??
    (line.lpoAmount != null ? Number(line.lpoAmount) : Number((liters * rate).toFixed(4)));

  return [
    sn,
    enrichment?.date || line.lpoDate || '',
    enrichment?.lpoNo || line.lpoNo || '',
    enrichment?.station || line.lpoStation || '',
    enrichment?.doNo || line.lpoDoNo || '',
    enrichment?.truckNo || line.lpoTruckNoRaw || displayTruckNo(line.lpoTruckNo) || '',
    liters,
    rate,
    amount,
    enrichment?.destination || '',
  ];
}

function addLpoEntryExportSheet(
  workbook: ExcelJS.Workbook,
  sheetName: string,
  lines: IReconciliationLine[],
  enrichmentMap: Map<string, LpoEntryExportEnrichment>
): void {
  const sheet = workbook.addWorksheet(sheetName);
  sheet.columns = [
    { width: 8 },
    { width: 14 },
    { width: 12 },
    { width: 20 },
    { width: 14 },
    { width: 14 },
    { width: 10 },
    { width: 14 },
    { width: 14 },
    { width: 14 },
  ];

  const headerRow = sheet.getRow(1);
  headerRow.values = [...LPO_ENTRY_EXPORT_HEADERS];
  styleExportHeaderRow(headerRow, LPO_ENTRY_EXPORT_HEADERS.length);

  let sn = 1;
  for (const line of lines) {
    const entryIds = collectLineLpoEntryIds(line);
    if (entryIds.length === 0) {
      // Statement-only lines never belong on these LPO sheets
      continue;
    }
    for (const entryId of entryIds) {
      const row = sheet.getRow(sn + 1);
      row.values = buildLpoEntryExportValues(sn, line, entryId, enrichmentMap.get(entryId));
      styleExportDataRow(row, LPO_ENTRY_EXPORT_HEADERS.length);
      sn += 1;
    }
  }
}

export async function exportSessionReportWorkbook(session: IReconciliationSession): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook();
  const lines = session.lines || [];

  const summarySheet = workbook.addWorksheet('Summary');
  summarySheet.addRow(['Reconciliation Report']);
  summarySheet.addRow(['Session No', session.sessionNo]);
  summarySheet.addRow(['Title', session.title || '']);
  summarySheet.addRow(['Status', session.status]);
  summarySheet.addRow(['Stations', session.stations.join(', ')]);
  summarySheet.addRow(['Date Range', `${session.dateFrom} to ${session.dateTo}`]);
  summarySheet.addRow(['Statement File', session.statementFileName || '']);
  summarySheet.addRow(['']);
  summarySheet.addRow(['Matched', session.summary?.matched ?? 0]);
  summarySheet.addRow(['Pending LPO', session.summary?.pendingLpo ?? 0]);
  summarySheet.addRow(['Pending Statement', session.summary?.pendingStatement ?? 0]);
  summarySheet.addRow(['Exceptions', session.summary?.exceptions ?? 0]);
  summarySheet.addRow(['Stale Pending', session.summary?.stalePending ?? 0]);

  const detail = workbook.addWorksheet('Details');
  detail.addRow([
    'Match Status',
    'LPO Date',
    'LPO Station',
    'LPO Truck',
    'LPO Liters',
    'Statement Date',
    'Statement Station',
    'Statement Truck',
    'Statement Liters',
    'Exception',
    'Days Gap',
    'Decision',
    'Notes',
  ]);
  detail.getRow(1).font = { bold: true };

  for (const line of lines) {
    detail.addRow([
      line.matchStatus,
      line.lpoDate || '',
      line.lpoStation || '',
      line.lpoTruckNo || '',
      line.lpoLiters ?? '',
      line.statementDate || '',
      line.statementStation || '',
      line.statementTruckNo || '',
      line.statementLiters ?? '',
      line.exceptionMessage || line.exceptionCode || '',
      line.daysGap ?? '',
      line.userDecision || '',
      line.notes || '',
    ]);
  }

  const droppedSheet = workbook.addWorksheet('Dropped trucks');
  droppedSheet.addRow([
    'Stmt Row',
    'S/N',
    'Date',
    'Statement Station',
    'Statement Truck',
    'Original Truck',
    'Liters',
    'Amount',
    'Status',
    'Exception',
    'Dropped At',
    'Dropped By',
    'Notes',
  ]);
  droppedSheet.getRow(1).font = { bold: true };

  const droppedRows = buildStatementRows(lines, session.statementLines || []).filter(
    (r) => r.matchStatus === 'dropped'
  );
  for (const row of droppedRows) {
    const linked = lines.find(
      (l) => String((l as { _id?: unknown })._id || '') === row.reconLineId
    );
    droppedSheet.addRow([
      row.statementRowNumber,
      row.sn ?? '',
      row.date || '',
      row.station || '',
      row.truckNoRaw || row.truckNo || '',
      row.originalTruckNoRaw || row.originalTruckNo || '',
      row.liters ?? '',
      row.amount ?? '',
      row.matchStatus,
      row.exceptionMessage || row.exceptionCode || '',
      linked?.resolvedAt ? new Date(linked.resolvedAt).toISOString() : '',
      linked?.resolvedBy || '',
      linked?.notes || '',
    ]);
  }

  const reconciledLines = lines
    .filter((l) => isReconciledMatchStatus(l.matchStatus) && !!l.lpoEntryId)
    .sort((a, b) => {
      const d = (a.lpoDate || '').localeCompare(b.lpoDate || '');
      if (d !== 0) return d;
      return (a.lpoTruckNo || '').localeCompare(b.lpoTruckNo || '');
    });

  const pendingTruckLines = lines
    .filter(
      (l) =>
        !!l.lpoEntryId &&
        (l.matchStatus === 'unmatched_lpo' ||
          l.matchStatus === 'liter_mismatch' ||
          (l.matchStatus === 'stale_pending' && l.userDecision !== 'drop'))
    )
    .sort((a, b) => {
      const d = (a.lpoDate || '').localeCompare(b.lpoDate || '');
      if (d !== 0) return d;
      return (a.lpoTruckNo || '').localeCompare(b.lpoTruckNo || '');
    });

  const enrichmentIds = [
    ...reconciledLines.flatMap(collectLineLpoEntryIds),
    ...pendingTruckLines.flatMap(collectLineLpoEntryIds),
  ];
  const enrichmentMap = await loadLpoEntryEnrichmentMap(enrichmentIds);

  addLpoEntryExportSheet(workbook, 'Reconciled', reconciledLines, enrichmentMap);
  addLpoEntryExportSheet(workbook, 'Pending trucks', pendingTruckLines, enrichmentMap);

  return workbook;
}

export async function rematchSessionLines(session: IReconciliationSession): Promise<IReconciliationLine[]> {
  const lpoEntries = await loadLpoEntriesForSession({
    stations: session.stations,
    dateFrom: session.dateFrom,
    dateTo: session.dateTo,
    pendingMode: session.pendingMode,
    pendingDateFrom: session.pendingDateFrom,
    pendingDateTo: session.pendingDateTo,
    selectedPendingEntryIds: session.selectedPendingEntryIds,
    excludeSessionId: String((session as any)._id || ''),
  });
  return runAutoMatch(lpoEntries, session.statementLines || [], session, {
    preservedLines: session.lines || [],
  });
}

export type LineQueryFilter =
  | 'all'
  | 'matched'
  | 'pending'
  | 'exceptions'
  | 'stmt_matched'
  | 'stmt_unmatched';

export type LineSortKey =
  | 'lpoTruck'
  | 'stmtTruck'
  | 'station'
  | 'lpoLiters'
  | 'stmtLiters'
  | 'status'
  | 'stmtRow'
  | 'lpoDate';

export type VarianceSortKey = 'truck' | 'station' | 'lpoLiters' | 'stmtLiters' | 'difference' | 'reason';

export interface QuerySessionLinesParams {
  filter?: LineQueryFilter;
  search?: string;
  truck?: string;
  station?: string;
  exceptionCode?: string;
  side?: 'lpo' | 'statement' | 'all';
  sortBy?: LineSortKey;
  sortDir?: 'asc' | 'desc';
  page?: number;
  limit?: number;
}

export interface QueryVarianceParams {
  category?: 'all' | 'lpo_not_in_statement' | 'statement_not_in_lpo' | 'liter_mismatch';
  search?: string;
  sortBy?: VarianceSortKey;
  sortDir?: 'asc' | 'desc';
  page?: number;
  limit?: number;
}

function lineStatementIndexes(line: IReconciliationLine): number[] {
  if (line.statementLineIndexes?.length) return line.statementLineIndexes;
  if (line.statementLineIndex != null) return [line.statementLineIndex];
  return [];
}

function lineMatchesFilter(line: IReconciliationLine, filter: LineQueryFilter): boolean {
  switch (filter) {
    case 'matched':
      return isReconciledMatchStatus(line.matchStatus);
    case 'pending':
      return line.matchStatus === 'unmatched_lpo' || line.matchStatus === 'unmatched_statement';
    case 'exceptions':
      return (
        line.matchStatus === 'liter_mismatch' ||
        line.matchStatus === 'stale_pending' ||
        line.matchStatus === 'split_merge_candidate' ||
        (!!line.exceptionCode && !isReconciledMatchStatus(line.matchStatus))
      );
    case 'stmt_matched':
      return isReconciledMatchStatus(line.matchStatus) && lineStatementIndexes(line).length > 0;
    case 'stmt_unmatched':
      return (
        line.matchStatus === 'unmatched_statement' ||
        (line.lpoEntryId != null && !isReconciledMatchStatus(line.matchStatus)) ||
        line.matchStatus === 'split_merge_candidate' ||
        line.matchStatus === 'liter_mismatch'
      );
    default:
      return true;
  }
}

function lineSearchHaystack(line: IReconciliationLine): string {
  return [
    line.lpoTruckNoRaw,
    line.lpoTruckNo,
    line.statementTruckNoRaw,
    line.statementTruckNo,
    line.lpoStation,
    line.statementStation,
    line.exceptionCode,
    line.exceptionMessage,
    line.matchStatus,
    line.lpoNo,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

function compareStrings(a: string, b: string, dir: 'asc' | 'desc'): number {
  const cmp = a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
  return dir === 'asc' ? cmp : -cmp;
}

function compareNumbers(a: number, b: number, dir: 'asc' | 'desc'): number {
  const cmp = a - b;
  return dir === 'asc' ? cmp : -cmp;
}

function sortReconciliationLines(
  lines: IReconciliationLine[],
  sortBy: LineSortKey = 'lpoTruck',
  sortDir: 'asc' | 'desc' = 'asc'
): IReconciliationLine[] {
  const sorted = [...lines];
  sorted.sort((a, b) => {
    switch (sortBy) {
      case 'stmtTruck':
        return compareStrings(
          a.statementTruckNoRaw || a.statementTruckNo || '',
          b.statementTruckNoRaw || b.statementTruckNo || '',
          sortDir
        );
      case 'station':
        return compareStrings(
          a.lpoStation || a.statementStation || '',
          b.lpoStation || b.statementStation || '',
          sortDir
        );
      case 'lpoLiters':
        return compareNumbers(Number(a.lpoLiters || 0), Number(b.lpoLiters || 0), sortDir);
      case 'stmtLiters':
        return compareNumbers(Number(a.statementLiters || 0), Number(b.statementLiters || 0), sortDir);
      case 'status':
        return compareStrings(a.matchStatus, b.matchStatus, sortDir);
      case 'stmtRow':
        return compareNumbers(
          Number(a.statementRowNumber || a.statementLineIndex || 0),
          Number(b.statementRowNumber || b.statementLineIndex || 0),
          sortDir
        );
      case 'lpoDate':
        return compareStrings(a.lpoDate || '', b.lpoDate || '', sortDir);
      case 'lpoTruck':
      default:
        return compareStrings(
          a.lpoTruckNoRaw || a.lpoTruckNo || '',
          b.lpoTruckNoRaw || b.lpoTruckNo || '',
          sortDir
        );
    }
  });
  return sorted;
}

export function querySessionLines(
  lines: IReconciliationLine[],
  params: QuerySessionLinesParams
): {
  data: Array<IReconciliationLine & { _id?: unknown }>;
  pagination: { page: number; limit: number; total: number; totalPages: number };
} {
  const filter = params.filter || 'all';
  const search = (params.search || '').trim().toLowerCase();
  const truck = (params.truck || '').trim().toLowerCase();
  const station = (params.station || '').trim().toLowerCase();
  const exceptionCode = (params.exceptionCode || '').trim().toUpperCase();
  const sortBy = params.sortBy || 'lpoTruck';
  const sortDir = params.sortDir === 'desc' ? 'desc' : 'asc';
  const page = Math.max(1, params.page || 1);
  const limit = Math.min(200, Math.max(1, params.limit || 100));

  let filtered = lines.filter((line) => lineMatchesFilter(line, filter));

  if (params.side === 'lpo') {
    filtered = filtered.filter((line) => !!line.lpoEntryId);
  } else if (params.side === 'statement') {
    filtered = filtered.filter((line) => !line.lpoEntryId && lineStatementIndexes(line).length > 0);
  }

  if (search) {
    filtered = filtered.filter((line) => lineSearchHaystack(line).includes(search));
  }
  if (truck) {
    filtered = filtered.filter((line) => {
      const values = [
        line.lpoTruckNoRaw,
        line.lpoTruckNo,
        line.statementTruckNoRaw,
        line.statementTruckNo,
      ].filter(Boolean) as string[];
      return values.some((v) => v.toLowerCase() === truck);
    });
  }
  if (station) {
    filtered = filtered.filter((line) => {
      const values = [line.lpoStation, line.statementStation].filter(Boolean) as string[];
      return values.some((v) => v.toLowerCase() === station);
    });
  }
  if (exceptionCode) {
    const literMismatchCodes = new Set(['LITER_MISMATCH', 'TRUCK_STATION_LITER_MISMATCH']);
    filtered = filtered.filter((line) => {
      const code = (line.exceptionCode || '').toUpperCase();
      if (exceptionCode === 'LITER_MISMATCH') return literMismatchCodes.has(code);
      return code === exceptionCode;
    });
  }

  const sorted = sortReconciliationLines(filtered, sortBy, sortDir);
  const total = sorted.length;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const start = (page - 1) * limit;

  return {
    data: sorted.slice(start, start + limit),
    pagination: { page, limit, total, totalPages },
  };
}

export interface LineFilterOptions {
  trucks: string[];
  stations: string[];
  exceptionCodes: Array<{ code: string; label: string; count: number }>;
}

export function extractLineFilterOptions(
  lines: IReconciliationLine[],
  side: 'lpo' | 'statement' | 'all' = 'all'
): LineFilterOptions {
  const scoped =
    side === 'lpo'
      ? lines.filter((l) => !!l.lpoEntryId)
      : side === 'statement'
        ? lines.filter((l) => !l.lpoEntryId && lineStatementIndexes(l).length > 0)
        : lines;
  return extractLineFilterOptionsFromLines(scoped);
}

function extractLineFilterOptionsFromLines(lines: IReconciliationLine[]): LineFilterOptions {
  const trucks = new Set<string>();
  const stations = new Set<string>();
  const exceptions = new Map<string, { label: string; count: number }>();

  for (const line of lines) {
    for (const truck of [
      line.lpoTruckNoRaw,
      line.lpoTruckNo,
      line.statementTruckNoRaw,
      line.statementTruckNo,
    ]) {
      if (truck) trucks.add(String(truck));
    }
    if (line.lpoStation) stations.add(line.lpoStation);
    if (line.statementStation) stations.add(line.statementStation);
    if (line.exceptionCode) {
      const existing = exceptions.get(line.exceptionCode);
      const label = (line.exceptionMessage || line.exceptionCode).slice(0, 120);
      if (existing) existing.count += 1;
      else exceptions.set(line.exceptionCode, { label, count: 1 });
    }
  }

  return {
    trucks: [...trucks].sort((a, b) => a.localeCompare(b, undefined, { numeric: true })),
    stations: [...stations].sort((a, b) => a.localeCompare(b)),
    exceptionCodes: [...exceptions.entries()]
      .map(([code, { label, count }]) => ({ code, label, count }))
      .sort((a, b) => a.code.localeCompare(b.code)),
  };
}

export type StatementRowFilter = 'all' | 'matched' | 'unmatched' | 'exceptions' | 'dropped';
export type StatementRowSortKey =
  | 'stmtRow'
  | 'truck'
  | 'station'
  | 'stmtLiters'
  | 'lpoLiters'
  | 'status'
  | 'date';

export interface StatementRowView {
  statementLineIndex: number;
  statementRowNumber: number;
  sn?: number;
  date: string;
  station: string;
  truckNo: string;
  truckNoRaw?: string;
  originalTruckNo?: string;
  originalTruckNoRaw?: string;
  liters: number;
  amount?: number;
  matchStatus: IReconciliationLine['matchStatus'];
  exceptionCode?: string;
  exceptionMessage?: string;
  reconLineId?: string;
  lpoLineIds: string[];
  lpoTruckNo?: string;
  lpoLiters?: number;
  lpoStation?: string;
  difference?: number;
  selectable: boolean;
  userDecision?: IReconciliationLine['userDecision'];
}

export function buildStatementRows(
  lines: IReconciliationLine[],
  statementLines: IStatementLine[]
): StatementRowView[] {
  const byStmt = new Map<number, IReconciliationLine>();

  const isLiterMismatchLine = (line: IReconciliationLine) =>
    line.matchStatus === 'liter_mismatch' ||
    line.exceptionCode === 'TRUCK_STATION_LITER_MISMATCH' ||
    line.exceptionCode === 'LITER_MISMATCH';

  for (const line of lines) {
    for (const idx of lineStatementIndexes(line)) {
      const existing = byStmt.get(idx);
      if (!existing) {
        byStmt.set(idx, line);
        continue;
      }
      const preferNew =
        (!existing.lpoEntryId && !!line.lpoEntryId) ||
        (isReconciledMatchStatus(line.matchStatus) && !isReconciledMatchStatus(existing.matchStatus)) ||
        (isLiterMismatchLine(line) &&
          (existing.matchStatus === 'unmatched_statement' || !existing.lpoEntryId));
      if (preferNew) byStmt.set(idx, line);
    }
  }

  // Prefer liter-mismatch LPO lines over "not in LPO" statement-only rows
  // (covers older sessions that wrote Phase 4 without statementLineIndex).
  for (const stmt of statementLines) {
    const existing = byStmt.get(stmt.lineIndex);
    if (existing?.lpoEntryId && isLiterMismatchLine(existing)) continue;
    if (
      existing &&
      existing.matchStatus !== 'unmatched_statement' &&
      existing.exceptionCode !== 'STATEMENT_TRUCK_NOT_IN_LPO'
    ) {
      continue;
    }
    const rowNum = stmt.rowNumber ?? stmt.lineIndex + 2;
    const fallback = lines.find(
      (l) =>
        !!l.lpoEntryId &&
        isLiterMismatchLine(l) &&
        (lineStatementIndexes(l).includes(stmt.lineIndex) ||
          (lineStatementIndexes(l).length === 0 &&
            l.statementRowNumber === rowNum &&
            trucksMatch(l.statementTruckNo || '', stmt.truckNo) &&
            normalizeStation(l.statementStation || '') === normalizeStation(stmt.station)))
    );
    if (fallback) byStmt.set(stmt.lineIndex, fallback);
  }

  return statementLines.map((stmt) => {
    const linked = byStmt.get(stmt.lineIndex);
    const resolvedStatus: IReconciliationLine['matchStatus'] = !linked
      ? 'unmatched_statement'
      : isLiterMismatchLine(linked)
        ? 'liter_mismatch'
        : linked.matchStatus;
    const lpoLineIds: string[] = [];
    if (linked?.lpoEntryId) {
      const id = String((linked as { _id?: unknown })._id || '');
      if (id) lpoLineIds.push(id);
    }
    const lpoL = Number(linked?.lpoLiters || 0);
    const stmtL = Number(stmt.liters || 0);
    return {
      statementLineIndex: stmt.lineIndex,
      statementRowNumber: stmt.rowNumber ?? stmt.lineIndex + 2,
      sn: stmt.sn,
      date: stmt.date,
      station: stmt.station,
      truckNo: stmt.truckNo,
      truckNoRaw: stmt.truckNoRaw,
      originalTruckNo: stmt.originalTruckNo || linked?.originalStatementTruckNo,
      originalTruckNoRaw:
        stmt.originalTruckNoRaw ||
        linked?.originalStatementTruckNoRaw ||
        stmt.truckNoRaw ||
        stmt.truckNo,
      liters: stmtL,
      amount: stmt.amount,
      matchStatus: resolvedStatus,
      exceptionCode: linked?.exceptionCode,
      exceptionMessage: linked?.exceptionMessage,
      reconLineId: linked ? String((linked as { _id?: unknown })._id || '') || undefined : undefined,
      lpoLineIds,
      lpoTruckNo: linked?.lpoTruckNoRaw || linked?.lpoTruckNo,
      lpoLiters: linked?.lpoLiters,
      lpoStation: linked?.lpoStation,
      difference: linked?.lpoEntryId ? lpoL - stmtL : undefined,
      selectable: !isReconciledMatchStatus(resolvedStatus) && resolvedStatus !== 'dropped',
      userDecision: linked?.userDecision,
    };
  });
}

export function extractStatementFilterOptions(
  lines: IReconciliationLine[],
  statementLines: IStatementLine[]
): {
  trucks: string[];
  stations: string[];
  details: Array<{ code: string; label: string; count: number }>;
} {
  const rows = buildStatementRows(lines, statementLines);
  const trucks = new Set<string>();
  const stations = new Set<string>();
  const details = new Map<string, { label: string; count: number }>();
  for (const row of rows) {
    const truck = (row.truckNoRaw || row.truckNo || '').trim();
    if (truck) trucks.add(truck);
    const station = (row.station || '').trim();
    if (station) stations.add(station);
    const code = (row.exceptionCode || '').trim();
    const message = (row.exceptionMessage || '').trim();
    if (code) {
      const existing = details.get(code);
      const label = message ? message.slice(0, 100) : code;
      if (existing) existing.count += 1;
      else details.set(code, { label, count: 1 });
    } else if (message) {
      const key = `msg:${message.slice(0, 80)}`;
      const existing = details.get(key);
      if (existing) existing.count += 1;
      else details.set(key, { label: message.slice(0, 100), count: 1 });
    }
  }
  return {
    trucks: [...trucks].sort((a, b) => a.localeCompare(b, undefined, { numeric: true })),
    stations: [...stations].sort((a, b) => a.localeCompare(b)),
    details: [...details.entries()]
      .map(([code, { label, count }]) => ({ code, label, count }))
      .sort((a, b) => a.label.localeCompare(b.label)),
  };
}

function parseMultiFilter(value?: string | string[]): string[] {
  if (!value) return [];
  const raw = Array.isArray(value) ? value : String(value).split(',');
  return [
    ...new Set(
      raw
        .map((v) => String(v).trim())
        .filter(Boolean)
    ),
  ];
}

export function queryStatementRows(
  lines: IReconciliationLine[],
  statementLines: IStatementLine[],
  params: {
    filter?: StatementRowFilter;
    search?: string;
    truck?: string | string[];
    station?: string | string[];
    detail?: string | string[];
    sortBy?: StatementRowSortKey;
    sortDir?: 'asc' | 'desc';
    page?: number;
    limit?: number;
  }
): {
  data: StatementRowView[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
} {
  const filter = params.filter || 'all';
  const search = (params.search || '').trim().toLowerCase();
  const trucks = parseMultiFilter(params.truck).map((t) => t.toLowerCase());
  const stations = parseMultiFilter(params.station).map((s) => s.toLowerCase());
  const details = parseMultiFilter(params.detail);
  const sortBy = params.sortBy || 'stmtRow';
  const sortDir = params.sortDir === 'desc' ? 'desc' : 'asc';
  const page = Math.max(1, params.page || 1);
  const limit = Math.min(200, Math.max(1, params.limit || 100));

  let filtered = buildStatementRows(lines, statementLines);

  if (filter === 'dropped') {
    filtered = filtered.filter((r) => r.matchStatus === 'dropped');
  } else {
    filtered = filtered.filter((r) => r.matchStatus !== 'dropped');
    if (filter === 'matched') {
      filtered = filtered.filter((r) => isReconciledMatchStatus(r.matchStatus));
    } else if (filter === 'unmatched') {
      filtered = filtered.filter(
        (r) => r.matchStatus === 'unmatched_statement' || r.matchStatus === 'liter_mismatch'
      );
    } else if (filter === 'exceptions') {
      filtered = filtered.filter(
        (r) =>
          !!r.exceptionCode ||
          r.matchStatus === 'liter_mismatch' ||
          r.matchStatus === 'split_merge_candidate' ||
          r.matchStatus === 'stale_pending'
      );
    }
  }

  if (search) {
    filtered = filtered.filter((r) =>
      [
        r.truckNoRaw,
        r.truckNo,
        r.station,
        r.lpoTruckNo,
        r.lpoStation,
        r.exceptionMessage,
        r.matchStatus,
        String(r.statementRowNumber),
        String(r.sn || ''),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(search)
    );
  }
  if (trucks.length) {
    const truckSet = new Set(trucks);
    filtered = filtered.filter((r) =>
      [r.truckNoRaw, r.truckNo, r.lpoTruckNo].some((v) => truckSet.has((v || '').toLowerCase()))
    );
  }
  if (stations.length) {
    const stationSet = new Set(stations);
    filtered = filtered.filter((r) =>
      [r.station, r.lpoStation].some((v) => stationSet.has((v || '').toLowerCase()))
    );
  }
  if (details.length) {
    const detailSet = new Set(details);
    filtered = filtered.filter((r) => {
      const code = (r.exceptionCode || '').trim();
      if (code && detailSet.has(code)) return true;
      const message = (r.exceptionMessage || '').trim();
      if (message && detailSet.has(`msg:${message.slice(0, 80)}`)) return true;
      return false;
    });
  }

  const sorted = [...filtered].sort((a, b) => {
    switch (sortBy) {
      case 'truck':
        return compareStrings(a.truckNoRaw || a.truckNo, b.truckNoRaw || b.truckNo, sortDir);
      case 'station':
        return compareStrings(a.station, b.station, sortDir);
      case 'stmtLiters':
        return compareNumbers(a.liters, b.liters, sortDir);
      case 'lpoLiters':
        return compareNumbers(Number(a.lpoLiters || 0), Number(b.lpoLiters || 0), sortDir);
      case 'status':
        return compareStrings(a.matchStatus, b.matchStatus, sortDir);
      case 'date':
        return compareStrings(a.date || '', b.date || '', sortDir);
      case 'stmtRow':
      default:
        return compareNumbers(a.statementRowNumber, b.statementRowNumber, sortDir);
    }
  });

  const total = sorted.length;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const start = (page - 1) * limit;
  return {
    data: sorted.slice(start, start + limit),
    pagination: { page, limit, total, totalPages },
  };
}

export function queryMatchCandidates(
  lines: IReconciliationLine[],
  statementLines: IStatementLine[],
  params: {
    side: 'lpo' | 'statement';
    search?: string;
    limit?: number;
  }
): {
  lpoLines: Array<IReconciliationLine & { _id?: unknown }>;
  statementRows: StatementRowView[];
} {
  const search = (params.search || '').trim().toLowerCase();
  const limit = Math.min(200, Math.max(1, params.limit || 100));

  if (params.side === 'lpo') {
    let lpoLines = lines.filter(
      (l) =>
        !!l.lpoEntryId &&
        !isReconciledMatchStatus(l.matchStatus) &&
        l.matchStatus !== 'dropped'
    );
    if (search) {
      lpoLines = lpoLines.filter((l) => lineSearchHaystack(l).includes(search));
    }
    return {
      lpoLines: sortReconciliationLines(lpoLines, 'lpoTruck', 'asc').slice(0, limit),
      statementRows: [],
    };
  }

  let statementRows = buildStatementRows(lines, statementLines).filter((r) => r.selectable);
  const lockedFingerprints = new Set<string>();
  for (const line of lines) {
    if (!isReconciledMatchStatus(line.matchStatus)) continue;
    if (line.statementTruckNo && line.statementStation != null && line.statementLiters != null) {
      lockedFingerprints.add(
        statementContentFingerprint(
          line.statementTruckNo,
          line.statementStation,
          Number(line.statementLiters)
        )
      );
    }
  }
  statementRows = statementRows.filter(
    (r) =>
      !lockedFingerprints.has(statementContentFingerprint(r.truckNo, r.station, Number(r.liters || 0)))
  );
  if (search) {
    statementRows = statementRows.filter((r) =>
      [
        r.truckNoRaw,
        r.truckNo,
        r.station,
        r.exceptionMessage,
        String(r.statementRowNumber),
        String(r.sn || ''),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(search)
    );
  }
  return {
    lpoLines: [],
    statementRows: statementRows.slice(0, limit),
  };
}

export function queryLiterVarianceDetails(
  summary: IReconciliationSummary,
  params: QueryVarianceParams
): {
  data: NonNullable<IReconciliationSummary['literVarianceDetails']>;
  pagination: { page: number; limit: number; total: number; totalPages: number };
} {
  const details = summary.literVarianceDetails || [];
  const category = params.category || 'all';
  const search = (params.search || '').trim().toLowerCase();
  const sortBy = params.sortBy || 'truck';
  const sortDir = params.sortDir === 'desc' ? 'desc' : 'asc';
  const page = Math.max(1, params.page || 1);
  const limit = Math.min(200, Math.max(1, params.limit || 100));

  let filtered = details;
  if (category !== 'all') {
    filtered = filtered.filter((d) => {
      if (d.category === category) return true;
      if (category === 'liter_mismatch' && d.lpoLiters > 0 && d.statementLiters > 0) return true;
      return false;
    });
  }
  if (search) {
    filtered = filtered.filter((d) =>
      [d.truckNo, d.station, d.reason, d.statementRows, String(d.statementSn || '')]
        .join(' ')
        .toLowerCase()
        .includes(search)
    );
  }

  const sorted = [...filtered].sort((a, b) => {
    switch (sortBy) {
      case 'station':
        return compareStrings(a.station, b.station, sortDir);
      case 'lpoLiters':
        return compareNumbers(a.lpoLiters, b.lpoLiters, sortDir);
      case 'stmtLiters':
        return compareNumbers(a.statementLiters, b.statementLiters, sortDir);
      case 'difference':
        return compareNumbers(a.difference, b.difference, sortDir);
      case 'reason':
        return compareStrings(a.reason, b.reason, sortDir);
      case 'truck':
      default:
        return compareStrings(a.truckNo, b.truckNo, sortDir);
    }
  });

  const total = sorted.length;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const start = (page - 1) * limit;

  return {
    data: sorted.slice(start, start + limit),
    pagination: { page, limit, total, totalPages },
  };
}

export type PendingSortKey = 'lpoDate' | 'lpoTruck' | 'station' | 'lpoLiters' | 'lpoNo';

export function sortPendingEntries<T extends LpoEntryForReconciliation>(
  entries: T[],
  sortBy: PendingSortKey = 'lpoDate',
  sortDir: 'asc' | 'desc' = 'asc'
): T[] {
  const sorted = [...entries];
  sorted.sort((a, b) => {
    switch (sortBy) {
      case 'lpoTruck':
        return compareStrings(a.lpoTruckNoRaw || a.lpoTruckNo, b.lpoTruckNoRaw || b.lpoTruckNo, sortDir);
      case 'station':
        return compareStrings(a.lpoStation, b.lpoStation, sortDir);
      case 'lpoLiters':
        return compareNumbers(Number(a.lpoLiters || 0), Number(b.lpoLiters || 0), sortDir);
      case 'lpoNo':
        return compareStrings(a.lpoNo, b.lpoNo, sortDir);
      case 'lpoDate':
      default:
        return compareStrings(a.lpoDate, b.lpoDate, sortDir);
    }
  });
  return sorted;
}

function lineUsesStatementIndex(line: IReconciliationLine, index: number): boolean {
  return lineStatementIndexes(line).includes(index);
}

function lineUsesLpoEntry(line: IReconciliationLine, entryId: string): boolean {
  if (line.lpoEntryId === entryId) return true;
  return line.linkedLpoEntryIds?.includes(entryId) ?? false;
}

export function applyStatementCorrection(
  session: IReconciliationSession,
  line: IReconciliationLine,
  opts: { statementTruckNo?: string; statementStation?: string }
): { truckChanged: boolean; stationChanged: boolean; targetIndexes: number[] } {
  let truckChanged = false;
  let stationChanged = false;

  const newTruckRaw =
    opts.statementTruckNo != null
      ? displayTruckNo(opts.statementTruckNo)
      : line.statementTruckNoRaw || line.statementTruckNo || '';
  const newTruckNorm =
    opts.statementTruckNo != null
      ? normalizeTruckNo(opts.statementTruckNo)
      : line.statementTruckNo || '';
  const newStation =
    opts.statementStation != null
      ? String(opts.statementStation).trim()
      : line.statementStation || '';

  if (opts.statementTruckNo != null) {
    const prevRaw = line.statementTruckNoRaw || '';
    const prevNorm = line.statementTruckNo || '';
    truckChanged = newTruckRaw !== prevRaw || newTruckNorm !== prevNorm;
  }
  if (opts.statementStation != null) {
    stationChanged = newStation !== (line.statementStation || '');
  }

  // Resolve which statement row(s) this fix applies to
  let targetIndexes = lineStatementIndexes(line);
  if (!targetIndexes.length && line.statementRowNumber != null) {
    const byRow = session.statementLines.find(
      (s) => (s.rowNumber ?? s.lineIndex + 2) === line.statementRowNumber
    );
    if (byRow) targetIndexes = [byRow.lineIndex];
  }
  if (!targetIndexes.length && line.statementTruckNo && line.statementStation != null) {
    const prevTruck = line.statementTruckNo;
    const prevStation = line.statementStation;
    const prevLiters = line.statementLiters;
    const guess = session.statementLines.find(
      (s) =>
        trucksMatch(s.truckNo, prevTruck) &&
        normalizeStation(s.station) === normalizeStation(prevStation) &&
        (prevLiters == null || Number(s.liters) === Number(prevLiters))
    );
    if (guess) targetIndexes = [guess.lineIndex];
  }
  if (!targetIndexes.length && line.statementLineIndex != null) {
    targetIndexes = [line.statementLineIndex];
  }

  // Preserve original truck on recon line (first fix only)
  if (truckChanged) {
    if (!line.originalStatementTruckNoRaw && !line.originalStatementTruckNo) {
      line.originalStatementTruckNoRaw =
        line.statementTruckNoRaw || line.statementTruckNo || undefined;
      line.originalStatementTruckNo = line.statementTruckNo || undefined;
    }
  }

  if (opts.statementTruckNo != null) {
    line.statementTruckNoRaw = newTruckRaw;
    line.statementTruckNo = newTruckNorm;
    if (truckChanged) {
      line.notes = line.notes
        ? `${line.notes}; Truck rectified to ${newTruckRaw}`
        : `Truck rectified to ${newTruckRaw}`;
    }
  }
  if (opts.statementStation != null) {
    line.statementStation = newStation;
  }

  // Apply to underlying statementLines so rematch uses the correction
  for (const idx of targetIndexes) {
    const stmt = session.statementLines.find((s) => s.lineIndex === idx);
    if (!stmt) continue;
    if (opts.statementTruckNo != null && truckChanged) {
      if (!stmt.originalTruckNoRaw && !stmt.originalTruckNo) {
        stmt.originalTruckNoRaw = stmt.truckNoRaw || stmt.truckNo;
        stmt.originalTruckNo = stmt.truckNo;
      }
      stmt.truckNoRaw = newTruckRaw;
      stmt.truckNo = newTruckNorm;
    }
    if (opts.statementStation != null && stationChanged) {
      stmt.station = newStation;
    }
  }

  return { truckChanged, stationChanged, targetIndexes };
}

export function findLineMatchOutcome(
  lines: IReconciliationLine[],
  opts: { lineId?: string; lpoEntryId?: string; statementLineIndex?: number }
): {
  matched: boolean;
  matchStatus?: IReconciliationLine['matchStatus'];
  exceptionCode?: string;
  exceptionMessage?: string;
  lineId?: string;
} {
  const found = lines.find((l) => {
    const id = String((l as { _id?: unknown })._id || '');
    if (opts.lineId && id === opts.lineId) return true;
    if (opts.lpoEntryId && l.lpoEntryId === opts.lpoEntryId) return true;
    if (
      opts.statementLineIndex != null &&
      lineStatementIndexes(l).includes(opts.statementLineIndex)
    ) {
      return true;
    }
    return false;
  });
  if (!found) {
    return { matched: false };
  }
  return {
    matched: isReconciledMatchStatus(found.matchStatus),
    matchStatus: found.matchStatus,
    exceptionCode: found.exceptionCode,
    exceptionMessage: found.exceptionMessage,
    lineId: String((found as { _id?: unknown })._id || '') || undefined,
  };
}

export function applyManualMatch(
  session: IReconciliationSession,
  opts: {
    lpoLineIds: string[];
    statementLineIndexes: number[];
    accept?: boolean;
  }
): IReconciliationLine {
  const { lpoLineIds, statementLineIndexes, accept = false } = opts;
  if (!lpoLineIds.length) throw new Error('At least one LPO line is required');
  if (!statementLineIndexes.length) throw new Error('At least one statement row is required');
  if (!session.statementLines?.length) throw new Error('No statement uploaded');

  const lpoLines = session.lines.filter((l) =>
    lpoLineIds.includes(String((l as { _id?: unknown })._id))
  );
  if (lpoLines.length !== lpoLineIds.length) {
    throw new Error('One or more LPO lines were not found');
  }
  if (lpoLines.some((l) => !l.lpoEntryId)) {
    throw new Error('Statement-only rows cannot be used as LPO side of a manual match');
  }
  if (lpoLines.some((l) => isReconciledMatchStatus(l.matchStatus))) {
    throw new Error('One or more selected LPO lines are already matched');
  }

  const stmtIndexes = [...new Set(statementLineIndexes)];
  const stmtRows = stmtIndexes
    .map((i) => session.statementLines.find((s) => s.lineIndex === i))
    .filter(Boolean) as IStatementLine[];
  if (stmtRows.length !== stmtIndexes.length) {
    throw new Error('One or more statement rows were not found');
  }

  // Lock: reject statement rows already reconciled, or duplicates of a matched fingerprint
  const lockedIndexes = new Set<number>();
  const lockedFingerprints = new Set<string>();
  for (const line of session.lines) {
    if (!isReconciledMatchStatus(line.matchStatus) && line.matchStatus !== 'dropped') continue;
    if (isReconciledMatchStatus(line.matchStatus)) {
      lineStatementIndexes(line).forEach((i) => lockedIndexes.add(i));
      if (line.statementTruckNo && line.statementStation != null && line.statementLiters != null) {
        lockedFingerprints.add(
          statementContentFingerprint(
            line.statementTruckNo,
            line.statementStation,
            Number(line.statementLiters)
          )
        );
      }
    }
  }
  for (const stmt of stmtRows) {
    if (lockedIndexes.has(stmt.lineIndex)) {
      throw new Error(
        `Statement row ${stmt.rowNumber ?? stmt.lineIndex + 2} is already matched and locked`
      );
    }
    const fp = fingerprintFromStatement(stmt);
    if (lockedFingerprints.has(fp)) {
      throw new Error(
        `Statement row ${stmt.rowNumber ?? stmt.lineIndex + 2} is a duplicate of an already-matched statement (same truck/station/liters) and is locked`
      );
    }
  }

  const consumedLpoIds = new Set<string>();
  for (const line of lpoLines) {
    if (line.lpoEntryId) consumedLpoIds.add(line.lpoEntryId);
    line.linkedLpoEntryIds?.forEach((id) => consumedLpoIds.add(id));
  }

  const removeLineIds = new Set<string>();
  for (const line of session.lines) {
    const lineId = String((line as { _id?: unknown })._id || '');
    if (lpoLineIds.includes(lineId)) {
      removeLineIds.add(lineId);
      continue;
    }
    if (line.lpoEntryId && consumedLpoIds.has(line.lpoEntryId)) {
      removeLineIds.add(lineId);
      continue;
    }
    if (line.linkedLpoEntryIds?.some((id) => consumedLpoIds.has(id))) {
      removeLineIds.add(lineId);
      continue;
    }
    if (stmtIndexes.some((idx) => lineUsesStatementIndex(line, idx))) {
      if (!isReconciledMatchStatus(line.matchStatus)) {
        removeLineIds.add(lineId);
      }
    }
  }

  const primary = lpoLines[0];
  const linkedIds =
    lpoLines.length > 1
      ? lpoLines.map((l) => l.lpoEntryId!).filter(Boolean)
      : primary.linkedLpoEntryIds;
  const totalLpoLiters = lpoLines.reduce((sum, l) => sum + Number(l.lpoLiters || 0), 0);
  const totalStmtLiters = stmtRows.reduce((sum, s) => sum + Number(s.liters || 0), 0);

  const combined: IReconciliationLine = {
    ...buildLpoLine({
      lpoEntryId: primary.lpoEntryId!,
      lpoNo: primary.lpoNo || '',
      lpoDate: primary.lpoDate || '',
      lpoStation: primary.lpoStation || '',
      lpoTruckNo: primary.lpoTruckNo || '',
      lpoTruckNoRaw: primary.lpoTruckNoRaw || displayTruckNo(primary.lpoTruckNo || ''),
      lpoLiters: totalLpoLiters,
      lpoAmount: lpoLines.reduce((sum, l) => sum + Number(l.lpoAmount || 0), 0),
      lpoDoNo: primary.lpoDoNo || '',
      source: primary.source || 'date_range',
      originSessionId: primary.originSessionId,
    }),
    linkedLpoEntryIds: linkedIds && linkedIds.length > 1 ? linkedIds : undefined,
    lpoLiters: totalLpoLiters,
    matchType:
      lpoLines.length > 1 && stmtIndexes.length === 1
        ? 'merge'
        : lpoLines.length === 1 && stmtIndexes.length > 1
          ? 'split'
          : 'manual',
  };

  applyStatementToLine(combined, session.statementLines, stmtIndexes);

  const literMatch = Math.abs(totalLpoLiters - totalStmtLiters) < 0.001;
  if (accept && literMatch) {
    combined.matchStatus = 'manual_matched';
    combined.exceptionCode = undefined;
    combined.exceptionMessage = 'Manual match accepted';
  } else if (literMatch) {
    combined.matchStatus = 'split_merge_candidate';
    combined.exceptionCode =
      combined.matchType === 'merge'
        ? 'MERGE_MATCH'
        : combined.matchType === 'split'
          ? 'SPLIT_MATCH'
          : 'MANUAL_MATCH';
    combined.exceptionMessage =
      combined.matchType === 'merge'
        ? `Manual merge: ${lpoLines.length} LPO lines (${totalLpoLiters}L) → statement ${totalStmtLiters}L`
        : combined.matchType === 'split'
          ? `Manual split: LPO ${totalLpoLiters}L → ${stmtIndexes.length} statement rows (${totalStmtLiters}L)`
          : `Manual match: LPO ${totalLpoLiters}L = statement ${totalStmtLiters}L`;
  } else {
    combined.matchStatus = 'split_merge_candidate';
    combined.exceptionCode = 'LITER_MISMATCH';
    combined.exceptionMessage = `Manual link: LPO total ${totalLpoLiters}L vs statement ${totalStmtLiters}L — accept to confirm`;
  }

  session.lines = session.lines.filter(
    (l) => !removeLineIds.has(String((l as { _id?: unknown })._id))
  );
  session.lines.push(combined);
  return combined;
}

export interface StatementStationInFile {
  statementStation: string;
  normalized: string;
  rowNumbers: number[];
  lineCount: number;
  litersTotal: number;
  inSelectedScope: boolean;
  isYard: boolean;
  suggestedMatch?: string;
}

export interface StatementStationValidation {
  selectedStations: string[];
  lineCount: number;
  inScopeRowCount: number;
  outOfScopeRowCount: number;
  yardRowCount: number;
  unknownStations: string[];
  stationsInFile: StatementStationInFile[];
  allValid: boolean;
}

export function suggestStationMatch(
  statementStation: string,
  candidates: string[]
): string | undefined {
  const norm = normalizeStation(statementStation);
  if (!norm) return undefined;

  for (const candidate of candidates) {
    if (normalizeStation(candidate) === norm) return candidate;
  }
  for (const candidate of candidates) {
    const candidateNorm = normalizeStation(candidate);
    if (norm.includes(candidateNorm) || candidateNorm.includes(norm)) return candidate;
  }
  return undefined;
}

export function applyStatementStationMappings(
  lines: IStatementLine[],
  mappings: Record<string, string>
): IStatementLine[] {
  if (!mappings || Object.keys(mappings).length === 0) return lines;

  const byNormalizedKey = new Map<string, string>();
  for (const [from, to] of Object.entries(mappings)) {
    const target = String(to || '').trim();
    if (!target) continue;
    byNormalizedKey.set(normalizeStation(from), target);
    byNormalizedKey.set(normalizeStation(target), target);
  }

  return lines.map((line) => {
    const mapped = byNormalizedKey.get(normalizeStation(line.station));
    if (!mapped || normalizeStation(mapped) === normalizeStation(line.station)) return line;
    return { ...line, station: mapped };
  });
}

export function applyFlaggedStatementStationExceptions(
  lines: IReconciliationLine[],
  flaggedSet: Set<string>
): void {
  for (const line of lines) {
    const stmtStation = line.statementStation;
    if (!stmtStation || !flaggedSet.has(normalizeStation(stmtStation))) continue;
    line.matchStatus = 'unmatched_statement';
    line.exceptionCode = 'STATEMENT_STATION_FLAGGED';
    line.exceptionMessage = `Flagged on import — map station "${stmtStation}" or accept as exception`;
  }
}

export function validateStatementStations(
  statementLines: IStatementLine[],
  selectedStations: string[],
  knownStations: string[] = []
): StatementStationValidation {
  const selectedSet = new Set(selectedStations.map(normalizeStation));
  const suggestionPool = [...new Set([...selectedStations, ...knownStations])];
  const grouped = new Map<string, StatementStationInFile>();

  let inScopeRowCount = 0;
  let outOfScopeRowCount = 0;
  let yardRowCount = 0;

  for (const line of statementLines) {
    const statementStation = String(line.station || '').trim();
    const normalized = normalizeStation(statementStation);
    const rowNumber = line.rowNumber ?? line.lineIndex + 2;
    const isYard = isYardStation(statementStation);
    const inSelectedScope = selectedSet.has(normalized);

    if (isYard) {
      yardRowCount += 1;
      continue;
    }

    if (inSelectedScope) {
      inScopeRowCount += 1;
    } else {
      outOfScopeRowCount += 1;
    }

    const existing = grouped.get(normalized);
    if (existing) {
      existing.rowNumbers.push(rowNumber);
      existing.lineCount += 1;
      existing.litersTotal += Number(line.liters || 0);
      existing.inSelectedScope = existing.inSelectedScope || inSelectedScope;
    } else {
      grouped.set(normalized, {
        statementStation,
        normalized,
        rowNumbers: [rowNumber],
        lineCount: 1,
        litersTotal: Number(line.liters || 0),
        inSelectedScope,
        isYard: false,
        suggestedMatch: inSelectedScope
          ? statementStation
          : suggestStationMatch(statementStation, suggestionPool),
      });
    }
  }

  const stationsInFile = [...grouped.values()].sort((a, b) =>
    a.statementStation.localeCompare(b.statementStation)
  );
  const unknownStations = stationsInFile
    .filter((s) => !s.inSelectedScope && !s.isYard)
    .map((s) => s.statementStation);

  return {
    selectedStations,
    lineCount: statementLines.length,
    inScopeRowCount,
    outOfScopeRowCount,
    yardRowCount,
    unknownStations,
    stationsInFile,
    allValid: outOfScopeRowCount === 0,
  };
}

export async function loadKnownStationNames(): Promise<string[]> {
  const rows = await FuelStationConfig.find({ isActive: true }).select('stationName').lean();
  return rows.map((r) => String(r.stationName || '').trim()).filter(Boolean);
}

export function parseStationMappings(raw: unknown): Record<string, string> {
  if (!raw) return {};
  let parsed: unknown = raw;
  if (typeof raw === 'string') {
    try {
      parsed = JSON.parse(raw);
    } catch {
      return {};
    }
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {};

  const out: Record<string, string> = {};
  for (const [from, to] of Object.entries(parsed as Record<string, unknown>)) {
    const target = String(to || '').trim();
    if (from.trim() && target) out[String(from).trim()] = target;
  }
  return out;
}

export const reconciliationService = {
  generateSessionNo,
  buildStatementTemplateWorkbook,
  parseStatementWorkbookAsync,
  loadLpoEntriesForSession,
  getOpenPendingEntries,
  getDroppedPendingEntries,
  runAutoMatch,
  rematchSessionLines,
  computeSummary,
  querySessionLines,
  extractLineFilterOptions,
  extractStatementFilterOptions,
  queryLiterVarianceDetails,
  queryStatementRows,
  queryMatchCandidates,
  buildStatementRows,
  sortPendingEntries,
  applyManualMatch,
  applyStatementCorrection,
  findLineMatchOutcome,
  statementContentFingerprint,
  markPendingCarriedForward,
  releaseCarriedForwardForSession,
  exportSessionReportWorkbook,
  normalizeTruckNo,
  displayTruckNo,
  trucksMatch,
  normalizeStation,
  validateStatementStations,
  applyStatementStationMappings,
  applyFlaggedStatementStationExceptions,
  suggestStationMatch,
  loadKnownStationNames,
  parseStationMappings,
  resolveLpoEntryStation,
  getStationsInDateRange,
};
