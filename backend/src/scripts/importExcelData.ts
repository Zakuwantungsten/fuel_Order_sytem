/**
 * Excel Data Importer / Seeder
 *
 * Imports historical data from an Excel workbook (one or more sheets) into
 * the MongoDB database.  Supported collections:
 *   • FuelRecord   – sheets whose name/headers suggest fuel-journey records
 *   • DeliveryOrder – sheets whose name/headers suggest DO/SDO records
 *   • LPOEntry     – sheets whose name/headers suggest LPO records
 *
 * Usage:
 *   ts-node src/scripts/importExcelData.ts <path-to-file.xlsx> [options]
 *
 * Options:
 *   --dry-run          Preview what would be imported without writing to DB
 *   --sheet=SheetName  Only process a single named sheet
 *   --force            Allow re-importing rows that already exist (overwrite)
 *
 * Examples:
 *   ts-node src/scripts/importExcelData.ts data/fuel_2025.xlsx --dry-run
 *   ts-node src/scripts/importExcelData.ts data/fuel_2025.xlsx --sheet="Jan 2025"
 *   ts-node src/scripts/importExcelData.ts data/fuel_2025.xlsx --force
 */

import mongoose from 'mongoose';
import * as XLSX from 'xlsx';
import * as path from 'path';
import * as fs from 'fs';
import { FuelRecord, DeliveryOrder, LPOEntry } from '../models';
import { config } from '../config';
import logger from '../utils/logger';

// ─── Types ───────────────────────────────────────────────────────────────────

type SheetType = 'fuelRecord' | 'deliveryOrder' | 'lpoEntry' | 'unknown';

interface ImportResult {
  inserted: number;
  updated: number;
  skipped: number;
  errors: number;
}

// ─── Column name → model field mappings ─────────────────────────────────────
// Keys are normalised headers (lowercase, collapsed whitespace).
// Values are the Mongoose model field names.

const FUEL_RECORD_COLUMNS: Record<string, string> = {
  // Date / identification
  date: 'date',
  month: 'month',
  // Truck
  truck: 'truckNo',
  'truck no': 'truckNo',
  'truck no.': 'truckNo',
  'truck number': 'truckNo',
  truckno: 'truckNo',
  'truck #': 'truckNo',
  // Delivery orders
  'going do': 'goingDo',
  goingdo: 'goingDo',
  going_do: 'goingDo',
  do: 'goingDo',
  'return do': 'returnDo',
  returndo: 'returnDo',
  return_do: 'returnDo',
  // Journey locations
  start: 'start',
  from: 'from',
  to: 'to',
  // Totals
  'total lts': 'totalLts',
  'total liters': 'totalLts',
  'total litres': 'totalLts',
  totallts: 'totalLts',
  extra: 'extra',
  balance: 'balance',
  // Journey status
  status: 'journeyStatus',
  'journey status': 'journeyStatus',
  // Yard allocations
  'mmsa yard': 'mmsaYard',
  mmsayard: 'mmsaYard',
  mmsa: 'mmsaYard',
  'tanga yard': 'tangaYard',
  tangayard: 'tangaYard',
  'dar yard': 'darYard',
  daryard: 'darYard',
  // Going fuel checkpoints
  'dar going': 'darGoing',
  dargoing: 'darGoing',
  'moro going': 'moroGoing',
  morogoing: 'moroGoing',
  'mbeya going': 'mbeyaGoing',
  mbeyagoing: 'mbeyaGoing',
  'tdm going': 'tdmGoing',
  tdmgoing: 'tdmGoing',
  'zambia going': 'zambiaGoing',
  zambiagoing: 'zambiaGoing',
  'congo fuel': 'congoFuel',
  congofuel: 'congoFuel',
  congo: 'congoFuel',
  // Return fuel checkpoints
  'zambia return': 'zambiaReturn',
  zambiareturn: 'zambiaReturn',
  'tunduma return': 'tundumaReturn',
  tundumareturn: 'tundumaReturn',
  tunduma: 'tundumaReturn',
  'mbeya return': 'mbeyaReturn',
  mbeyareturn: 'mbeyaReturn',
  'moro return': 'moroReturn',
  mororeturn: 'moroReturn',
  'dar return': 'darReturn',
  darreturn: 'darReturn',
  'tanga return': 'tangaReturn',
  tangareturn: 'tangaReturn',
};

const DELIVERY_ORDER_COLUMNS: Record<string, string> = {
  sn: 'sn',
  's/n': 'sn',
  serial: 'sn',
  'serial number': 'sn',
  no: 'sn',
  date: 'date',
  'import/export': 'importOrExport',
  importexport: 'importOrExport',
  'type': 'doType',
  'do type': 'doType',
  dotype: 'doType',
  'do number': 'doNumber',
  donumber: 'doNumber',
  'do no': 'doNumber',
  dono: 'doNumber',
  invoice: 'invoiceNos',
  'invoice nos': 'invoiceNos',
  invoicenos: 'invoiceNos',
  'invoice no': 'invoiceNos',
  client: 'clientName',
  'client name': 'clientName',
  clientname: 'clientName',
  truck: 'truckNo',
  'truck no': 'truckNo',
  truckno: 'truckNo',
  trailer: 'trailerNo',
  'trailer no': 'trailerNo',
  trailerno: 'trailerNo',
  container: 'containerNo',
  'container no': 'containerNo',
  containerno: 'containerNo',
  border: 'borderEntryDRC',
  'border entry': 'borderEntryDRC',
  'loading point': 'loadingPoint',
  loadingpoint: 'loadingPoint',
  destination: 'destination',
  haulier: 'haulier',
  driver: 'driverName',
  'driver name': 'driverName',
  drivername: 'driverName',
  tonnages: 'tonnages',
  tonnage: 'tonnages',
};

const LPO_COLUMNS: Record<string, string> = {
  sn: 'sn',
  's/n': 'sn',
  serial: 'sn',
  date: 'date',
  'lpo no': 'lpoNo',
  lpono: 'lpoNo',
  lpo: 'lpoNo',
  'lpo number': 'lpoNo',
  'diesel at': 'dieselAt',
  dieselat: 'dieselAt',
  station: 'dieselAt',
  'fueling station': 'dieselAt',
  'do/sdo': 'doSdo',
  dosdo: 'doSdo',
  'do sdo': 'doSdo',
  do: 'doSdo',
  truck: 'truckNo',
  'truck no': 'truckNo',
  truckno: 'truckNo',
  ltrs: 'ltrs',
  liters: 'ltrs',
  litres: 'ltrs',
  quantity: 'ltrs',
  'price per ltr': 'pricePerLtr',
  priceperltr: 'pricePerLtr',
  'price/ltr': 'pricePerLtr',
  price: 'pricePerLtr',
  'unit price': 'pricePerLtr',
  destinations: 'destinations',
  destination: 'destinations',
  'payment mode': 'paymentMode',
  paymentmode: 'paymentMode',
  payment: 'paymentMode',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function normalizeKey(raw: string): string {
  return raw.toString().toLowerCase().trim().replace(/\s+/g, ' ');
}

/**
 * Convert an Excel date serial number to a "DD-Mon-YYYY" string.
 * Excel serials count days from Jan 1 1900 (with the famous Feb-29-1900 leap-year bug).
 * The offset 25569 is the number of days between Jan 1 1900 and Jan 1 1970.
 */
function excelSerialToDateStr(serial: number, overrideYear?: number): string {
  const d = new Date((serial - 25569) * 86400000);
  const day = d.getUTCDate();
  const monthAbbrs = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const mon = monthAbbrs[d.getUTCMonth()];
  const yr = overrideYear ?? d.getUTCFullYear();
  return `${day}-${mon}-${yr}`;
}

/** Returns true when a value looks like an Excel date serial (integer > 40000 = year ~2009+). */
function isExcelSerial(value: any): boolean {
  if (typeof value !== 'number') return false;
  return Number.isInteger(value) && value > 40000 && value < 100000;
}

function safeNum(value: any): number | null {
  if (value === null || value === undefined || value === '' || value === '-' || value === 'N/A') {
    return null;
  }
  const n = parseFloat(String(value).replace(/,/g, '').trim());
  return isNaN(n) ? null : n;
}

function safeStr(value: any): string {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

function isEmptyRow(row: Record<string, any>): boolean {
  return Object.values(row).every(v => v === null || v === undefined || safeStr(v) === '');
}

// Month names / abbreviations that indicate a fuel-record sheet
const MONTH_NAMES = /^(jan(uary)?|feb(ruary)?|mar(ch)?|apr(il)?|may|jun(e)?|jul(y)?|aug(ust)?|sep(tember)?|oct(ober)?|nov(ember)?|dec(ember)?)(\s+\d{4})?$/i;

/** Extract the month number (1-12) from a sheet name like "Jan", "Feb 2025", etc. */
export function monthFromSheetName(sheetName: string): number | null {
  const abbr: Record<string, number> = {
    jan: 1, january: 1,
    feb: 2, february: 2,
    mar: 3, march: 3,
    apr: 4, april: 4,
    may: 5,
    jun: 6, june: 6,
    jul: 7, july: 7,
    aug: 8, august: 8,
    sep: 9, september: 9,
    oct: 10, october: 10,
    nov: 11, november: 11,
    dec: 12, december: 12,
  };
  const key = sheetName.trim().toLowerCase().replace(/\s+\d{4}$/, '').trim();
  return abbr[key] ?? null;
}

// ─── Sheet type detection ─────────────────────────────────────────────────────

function detectSheetType(sheetName: string, headers: string[]): SheetType {
  const name = sheetName.toLowerCase().replace(/[\s_-]/g, '');
  const headerStr = headers.map(normalizeKey).join(' ');

  // Month-named sheets are always fuel records (Jan, Feb, Jan 2025, etc.)
  if (MONTH_NAMES.test(sheetName.trim())) return 'fuelRecord';

  // Name-based detection
  if (/fuel|record|journey|fuelrecord/.test(name)) return 'fuelRecord';
  if (/delivery.*order|do.*report|order.*report/.test(name)) return 'deliveryOrder';
  if (/lpo/.test(name)) return 'lpoEntry';

  // Header-based detection (check for distinctive fields)
  if (/going do|return do|dar going|mbeya going|tanga return|mbeya return/.test(headerStr)) {
    return 'fuelRecord';
  }
  if (/do number|donumber|haulier|loading point/.test(headerStr)) {
    return 'deliveryOrder';
  }
  if (/lpo|diesel at|price per ltr|price\/ltr/.test(headerStr)) {
    return 'lpoEntry';
  }

  return 'unknown';
}

// ─── Row mappers ──────────────────────────────────────────────────────────────

const FUEL_NUMERIC_FIELDS = new Set([
  'totalLts', 'extra', 'balance',
  'mmsaYard', 'tangaYard', 'darYard',
  'darGoing', 'moroGoing', 'mbeyaGoing', 'tdmGoing', 'zambiaGoing', 'congoFuel',
  'zambiaReturn', 'tundumaReturn', 'mbeyaReturn', 'moroReturn', 'darReturn', 'tangaReturn',
]);

function mapToFuelRecord(
  row: Record<string, any>,
  year?: number,
  sheetMonth?: number,
): Record<string, any> {
  const doc: Record<string, any> = {
    // Defaults for a historical (completed) record
    journeyStatus: 'completed',
    isDeleted: false,
    isCancelled: false,
    isLocked: false,
    mmsaYard: 0, tangaYard: 0, darYard: 0,
    darGoing: 0, moroGoing: 0, mbeyaGoing: 0, tdmGoing: 0, zambiaGoing: 0, congoFuel: 0,
    zambiaReturn: 0, tundumaReturn: 0, mbeyaReturn: 0, moroReturn: 0, darReturn: 0, tangaReturn: 0,
    balance: 0,
  };

  for (const [rawKey, value] of Object.entries(row)) {
    if (value === null || value === undefined || safeStr(value) === '') continue;
    const field = FUEL_RECORD_COLUMNS[normalizeKey(rawKey)];
    if (!field) continue;

    if (field === 'date') {
      // Convert Excel serial date to readable string before anything else
      if (isExcelSerial(value)) {
        doc[field] = excelSerialToDateStr(value as number, year);
      } else {
        doc[field] = safeStr(value);
      }
    } else if (FUEL_NUMERIC_FIELDS.has(field)) {
      const n = safeNum(value);
      if (n !== null) doc[field] = n;
    } else {
      doc[field] = safeStr(value);
    }
  }

  // Convert Excel date serial → readable string before anything else
  if (isExcelSerial(doc.date)) {
    doc.date = excelSerialToDateStr(doc.date as number, year);
  }

  // If the sheet is named by month (Jan, Feb…) and no explicit month column was
  // found, inject the month from the sheet name so dates like "15" become "15-Jan".
  if (sheetMonth && !doc.month) {
    const monthAbbr = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][sheetMonth - 1];
    doc.month = monthAbbr;
    // If date is a bare number (day only), suffix the month abbreviation
    if (doc.date && /^\d{1,2}$/.test(String(doc.date).trim())) {
      doc.date = `${String(doc.date).trim()}-${monthAbbr}`;
    }
  }

  // Append year to make dates unambiguous when provided
  if (year && doc.date && !/\d{4}/.test(String(doc.date))) {
    doc.date = `${doc.date}-${year}`;
  }

  // Normalise journeyStatus to allowed enum values
  if (doc.journeyStatus) {
    const s = String(doc.journeyStatus).toLowerCase();
    doc.journeyStatus = ['queued', 'active', 'completed', 'cancelled'].includes(s)
      ? s
      : 'completed';
  }

  return doc;
}

function mapToDeliveryOrder(row: Record<string, any>): Record<string, any> {
  const doc: Record<string, any> = { isDeleted: false };

  for (const [rawKey, value] of Object.entries(row)) {
    if (value === null || value === undefined || safeStr(value) === '') continue;
    const field = DELIVERY_ORDER_COLUMNS[normalizeKey(rawKey)];
    if (!field) continue;

    if (field === 'sn' || field === 'tonnages') {
      const n = safeNum(value);
      if (n !== null) doc[field] = n;
    } else {
      doc[field] = safeStr(value);
    }
  }

  // Normalise enum fields
  if (doc.importOrExport) {
    doc.importOrExport = doc.importOrExport.toUpperCase() === 'EXPORT' ? 'EXPORT' : 'IMPORT';
  } else {
    doc.importOrExport = 'IMPORT';
  }

  if (doc.doType) {
    doc.doType = doc.doType.toUpperCase() === 'SDO' ? 'SDO' : 'DO';
  } else {
    doc.doType = 'DO';
  }

  return doc;
}

function mapToLPOEntry(row: Record<string, any>): Record<string, any> {
  const doc: Record<string, any> = { isDeleted: false, paymentMode: 'STATION' };

  for (const [rawKey, value] of Object.entries(row)) {
    if (value === null || value === undefined || safeStr(value) === '') continue;
    const field = LPO_COLUMNS[normalizeKey(rawKey)];
    if (!field) continue;

    if (['sn', 'ltrs', 'pricePerLtr'].includes(field)) {
      const n = safeNum(value);
      if (n !== null) doc[field] = n;
    } else {
      doc[field] = safeStr(value);
    }
  }

  // Normalise paymentMode
  if (doc.paymentMode) {
    const pm = doc.paymentMode.toUpperCase().replace(/\s+/g, '_');
    doc.paymentMode = ['STATION', 'CASH', 'DRIVER_ACCOUNT'].includes(pm) ? pm : 'STATION';
  }

  return doc;
}

// ─── Importers ────────────────────────────────────────────────────────────────

async function importFuelRecords(
  rows: Record<string, any>[],
  dryRun: boolean,
  force: boolean,
  year?: number,
  sheetMonth?: number,
): Promise<ImportResult> {
  const result: ImportResult = { inserted: 0, updated: 0, skipped: 0, errors: 0 };

  // Forward-fill dates from Excel merged cells: when a date cell spans multiple rows,
  // only the first row has a value; subsequent rows have null.
  let lastKnownDate: any = null;

  for (const row of rows) {
    if (isEmptyRow(row)) continue;

    // Detect the raw date value under any casing variant the sheet might use
    const rawDateVal = row['Date'] ?? row['date'] ?? row['DATE'];
    if (rawDateVal !== null && rawDateVal !== undefined) {
      lastKnownDate = rawDateVal;
    } else if (lastKnownDate !== null) {
      // Inject the carried-forward date so mapToFuelRecord picks it up
      row['Date'] = lastKnownDate;
    }

    const doc = mapToFuelRecord(row, year, sheetMonth);

    if (!doc.truckNo || !doc.date || !doc.goingDo) {
      logger.warn(`[FuelRecord] Skipping – missing truckNo/date/goingDo | row: ${JSON.stringify(row)}`);
      result.skipped++;
      continue;
    }

    // Fill required fields that may be blank in older records
    if (!doc.start) doc.start = 'DSM';
    if (!doc.from) doc.from = doc.start;
    if (!doc.to) doc.to = 'UNKNOWN';

    const filter = { truckNo: doc.truckNo, goingDo: doc.goingDo };

    try {
      if (dryRun) {
        const exists = await FuelRecord.exists(filter);
        logger.info(
          `[DRY RUN][FuelRecord] ${exists ? (force ? 'WOULD UPDATE' : 'WOULD SKIP (exists)') : 'WOULD INSERT'} ` +
          `→ Truck: ${doc.truckNo}  DO: ${doc.goingDo}  Date: ${doc.date}`,
        );
        exists ? (force ? result.updated++ : result.skipped++) : result.inserted++;
        continue;
      }

      if (force) {
        const res = await FuelRecord.findOneAndUpdate(filter, { $set: doc }, { upsert: true, new: true });
        res ? result.updated++ : result.inserted++;
      } else {
        // Only insert if it doesn't already exist
        const res = await FuelRecord.updateOne(filter, { $setOnInsert: doc }, { upsert: true });
        res.upsertedCount ? result.inserted++ : result.skipped++;
      }
    } catch (err: any) {
      logger.error(`[FuelRecord] Error – Truck: ${doc.truckNo}  DO: ${doc.goingDo}: ${err.message}`);
      result.errors++;
    }
  }

  return result;
}

async function importDeliveryOrders(
  rows: Record<string, any>[],
  dryRun: boolean,
  force: boolean,
): Promise<ImportResult> {
  const result: ImportResult = { inserted: 0, updated: 0, skipped: 0, errors: 0 };

  for (const row of rows) {
    if (isEmptyRow(row)) continue;

    const doc = mapToDeliveryOrder(row);

    if (!doc.doNumber) {
      logger.warn(`[DeliveryOrder] Skipping – missing doNumber | row: ${JSON.stringify(row)}`);
      result.skipped++;
      continue;
    }

    // Fill required fields
    if (!doc.truckNo) doc.truckNo = 'UNKNOWN';
    if (!doc.clientName) doc.clientName = 'UNKNOWN';
    if (!doc.trailerNo) doc.trailerNo = 'UNKNOWN';
    if (!doc.loadingPoint) doc.loadingPoint = 'DSM';
    if (!doc.destination) doc.destination = 'UNKNOWN';
    if (!doc.date) doc.date = new Date().toISOString().split('T')[0];

    const filter = { doNumber: doc.doNumber };

    try {
      if (dryRun) {
        const exists = await DeliveryOrder.exists(filter);
        logger.info(
          `[DRY RUN][DeliveryOrder] ${exists ? (force ? 'WOULD UPDATE' : 'WOULD SKIP (exists)') : 'WOULD INSERT'} ` +
          `→ DO: ${doc.doNumber}  Truck: ${doc.truckNo}`,
        );
        exists ? (force ? result.updated++ : result.skipped++) : result.inserted++;
        continue;
      }

      if (force) {
        await DeliveryOrder.findOneAndUpdate(filter, { $set: doc }, { upsert: true });
        result.updated++;
      } else {
        const res = await DeliveryOrder.updateOne(filter, { $setOnInsert: doc }, { upsert: true });
        res.upsertedCount ? result.inserted++ : result.skipped++;
      }
    } catch (err: any) {
      logger.error(`[DeliveryOrder] Error – DO: ${doc.doNumber}: ${err.message}`);
      result.errors++;
    }
  }

  return result;
}

async function importLPOEntries(
  rows: Record<string, any>[],
  dryRun: boolean,
  force: boolean,
): Promise<ImportResult> {
  const result: ImportResult = { inserted: 0, updated: 0, skipped: 0, errors: 0 };

  for (const row of rows) {
    if (isEmptyRow(row)) continue;

    const doc = mapToLPOEntry(row);

    if (!doc.lpoNo || doc.ltrs === undefined) {
      logger.warn(`[LPOEntry] Skipping – missing lpoNo or ltrs | row: ${JSON.stringify(row)}`);
      result.skipped++;
      continue;
    }

    // Fill required fields
    if (!doc.truckNo) doc.truckNo = 'UNKNOWN';
    if (!doc.dieselAt) doc.dieselAt = 'UNKNOWN';
    if (!doc.doSdo) doc.doSdo = 'UNKNOWN';
    if (!doc.destinations) doc.destinations = 'UNKNOWN';
    if (doc.pricePerLtr === undefined) doc.pricePerLtr = 0;
    if (!doc.date) doc.date = new Date().toISOString().split('T')[0];

    const filter = { lpoNo: doc.lpoNo };

    try {
      if (dryRun) {
        const exists = await LPOEntry.exists(filter);
        logger.info(
          `[DRY RUN][LPOEntry] ${exists ? (force ? 'WOULD UPDATE' : 'WOULD SKIP (exists)') : 'WOULD INSERT'} ` +
          `→ LPO: ${doc.lpoNo}  Truck: ${doc.truckNo}  Ltrs: ${doc.ltrs}`,
        );
        exists ? (force ? result.updated++ : result.skipped++) : result.inserted++;
        continue;
      }

      if (force) {
        await LPOEntry.findOneAndUpdate(filter, { $set: doc }, { upsert: true });
        result.updated++;
      } else {
        const res = await LPOEntry.updateOne(filter, { $setOnInsert: doc }, { upsert: true });
        res.upsertedCount ? result.inserted++ : result.skipped++;
      }
    } catch (err: any) {
      logger.error(`[LPOEntry] Error – LPO: ${doc.lpoNo}: ${err.message}`);
      result.errors++;
    }
  }

  return result;
}

// ─── Sheet processor ──────────────────────────────────────────────────────────

async function processSheet(
  workbook: XLSX.WorkBook,
  sheetName: string,
  dryRun: boolean,
  force: boolean,
  year?: number,
): Promise<ImportResult> {
  const emptyResult: ImportResult = { inserted: 0, updated: 0, skipped: 0, errors: 0 };
  const worksheet = workbook.Sheets[sheetName];

  // Read with header row; skip completely empty rows
  const rawRows: Record<string, any>[] = XLSX.utils.sheet_to_json(worksheet, {
    defval: null,
    blankrows: false,
  });

  if (rawRows.length === 0) {
    logger.warn(`Sheet "${sheetName}" is empty or has no usable rows – skipping.`);
    return emptyResult;
  }

  const headers = Object.keys(rawRows[0]);
  const sheetType = detectSheetType(sheetName, headers);
  const sheetMonth = monthFromSheetName(sheetName) ?? undefined;

  logger.info(`\n────────────────────────────────────────────`);
  logger.info(`Sheet: "${sheetName}"`);
  logger.info(`Rows : ${rawRows.length}`);
  logger.info(`Type : ${sheetType}`);
  logger.info(`Headers: ${headers.map(normalizeKey).join(', ')}`);
  logger.info(`────────────────────────────────────────────`);

  if (sheetType === 'unknown') {
    logger.warn(
      `Cannot map sheet "${sheetName}" to any model.  ` +
      `Tip: rename the sheet to "FuelRecord", "DeliveryOrder", or "LPO", ` +
      `or ensure the header row contains known column names (e.g. "Going DO", "Truck No", "LPO No").`,
    );
    return emptyResult;
  }

  let result: ImportResult;

  if (sheetType === 'fuelRecord') {
    result = await importFuelRecords(rawRows, dryRun, force, year, sheetMonth);
  } else if (sheetType === 'deliveryOrder') {
    result = await importDeliveryOrders(rawRows, dryRun, force);
  } else {
    result = await importLPOEntries(rawRows, dryRun, force);
  }

  logger.info(`Result for "${sheetName}":`);
  logger.info(`  Inserted : ${result.inserted}`);
  logger.info(`  Updated  : ${result.updated}`);
  logger.info(`  Skipped  : ${result.skipped}`);
  logger.info(`  Errors   : ${result.errors}`);
  return result;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const filePath = args.find(a => !a.startsWith('--'));
  const dryRun = args.includes('--dry-run');
  const force = args.includes('--force');
  const sheetArg = args.find(a => a.startsWith('--sheet='))?.replace('--sheet=', '');
  const yearArg = args.find(a => a.startsWith('--year='))?.replace('--year=', '');
  const year = yearArg ? parseInt(yearArg, 10) : undefined;

  if (!filePath) {
    console.error([
      '',
      'Usage:',
      '  ts-node src/scripts/importExcelData.ts <file.xlsx> [options]',
      '',
      'Options:',
      '  --dry-run          Preview imports without writing to the database',
      '  --sheet=SheetName  Process only a single named sheet (e.g. --sheet=Jan)',
      '  --year=YYYY        Year to tag records with (e.g. --year=2025)',
      '  --force            Overwrite existing records (default: skip duplicates)',
      '',
      'Examples:',
      '  ts-node src/scripts/importExcelData.ts "C:\\Users\\you\\fuel_2025.xlsx" --dry-run --year=2025',
      '  ts-node src/scripts/importExcelData.ts "C:\\Users\\you\\fuel_2025.xlsx" --year=2025',
      '  ts-node src/scripts/importExcelData.ts "C:\\Users\\you\\fuel_2025.xlsx" --sheet=Jan --year=2025',
      '  ts-node src/scripts/importExcelData.ts "C:\\Users\\you\\fuel_2025.xlsx" --force --year=2025',
      '',
    ].join('\n'));
    process.exit(1);
  }

  const absolutePath = path.resolve(filePath);

  if (!fs.existsSync(absolutePath)) {
    console.error(`File not found: ${absolutePath}`);
    process.exit(1);
  }

  const ext = path.extname(absolutePath).toLowerCase();
  if (!['.xlsx', '.xls', '.xlsm', '.csv'].includes(ext)) {
    console.error(`Unsupported file type: "${ext}".  Expected .xlsx, .xls, .xlsm, or .csv`);
    process.exit(1);
  }

  logger.info('═══════════════════════════════════════════════════');
  logger.info('         Excel Data Importer / Seeder');
  logger.info('═══════════════════════════════════════════════════');
  logger.info(`File    : ${absolutePath}`);
  logger.info(`Mode    : ${dryRun ? 'DRY RUN (no DB writes)' : force ? 'LIVE (force overwrite)' : 'LIVE (skip duplicates)'}`);
  if (year) logger.info(`Year    : ${year}`);

  const workbook = XLSX.readFile(absolutePath);
  const allSheets = workbook.SheetNames;
  const sheetsToProcess = sheetArg ? [sheetArg] : allSheets;

  logger.info(`Sheets  : ${allSheets.join(', ')}`);
  if (sheetArg) logger.info(`Filter  : "${sheetArg}" only`);

  if (!dryRun) {
    await mongoose.connect(config.mongodbUri);
    logger.info('Connected to MongoDB');
  } else {
    // Connect read-only for dry-run existence checks
    await mongoose.connect(config.mongodbUri);
    logger.info('Connected to MongoDB (read-only for dry-run checks)');
  }

  const totals: ImportResult = { inserted: 0, updated: 0, skipped: 0, errors: 0 };

  for (const sheetName of sheetsToProcess) {
    if (!allSheets.includes(sheetName)) {
      logger.warn(`Sheet "${sheetName}" not found in the workbook.  Available: ${allSheets.join(', ')}`);
      continue;
    }
    const result = await processSheet(workbook, sheetName, dryRun, force, year);
    totals.inserted += result.inserted;
    totals.updated  += result.updated;
    totals.skipped  += result.skipped;
    totals.errors   += result.errors;
  }

  logger.info('\n═══════════════════════════════════════════════════');
  logger.info('                   All Done');
  logger.info(`  Inserted : ${totals.inserted}`);
  logger.info(`  Updated  : ${totals.updated}`);
  logger.info(`  Skipped  : ${totals.skipped}`);
  logger.info(`  Errors   : ${totals.errors}`);
  logger.info('═══════════════════════════════════════════════════\n');

  await mongoose.connection.close();
  logger.info('Database connection closed.');
  process.exit(0);
}

main().catch(err => {
  logger.error('Import failed:', err);
  process.exit(1);
});
