/**
 * Excel Import Controller
 *
 * Provides two endpoints consumed by the frontend's Excel Import page:
 *   POST /api/import/preview  – parse the file and return sheet metadata (no DB writes)
 *   POST /api/import/excel    – actually import data into MongoDB
 *
 * File is received as `multipart/form-data` with field name `excelFile`.
 * All parsing logic mirrors the CLI script (src/scripts/importExcelData.ts).
 */

import { Response } from 'express';
import * as XLSX from 'xlsx';
import { FuelRecord, DeliveryOrder, LPOEntry, LPOSummary, LPOWorkbook } from '../models';
import { AuthRequest } from '../middleware/auth';
import logger from '../utils/logger';

// Multer augments Express.Request with `file`; combine types for our handlers
type ImportRequest = AuthRequest & { file?: Express.Multer.File };

// ─── Types ────────────────────────────────────────────────────────────────────

type SheetType = 'fuelRecord' | 'deliveryOrder' | 'lpoEntry' | 'unknown';

interface ImportResult {
  inserted: number;
  updated: number;
  skipped: number;
  errors: number;
}

interface SheetPreview {
  name: string;
  detectedType: SheetType;
  rowCount: number;
  headers: string[];
}

// ─── Column mappings ─────────────────────────────────────────────────────────

const FUEL_RECORD_COLUMNS: Record<string, string> = {
  date: 'date', month: 'month',
  truck: 'truckNo', 'truck no': 'truckNo', 'truck no.': 'truckNo', 'truck number': 'truckNo',
  truckno: 'truckNo', 'truck #': 'truckNo',
  'going do': 'goingDo', goingdo: 'goingDo', going_do: 'goingDo', do: 'goingDo',
  'return do': 'returnDo', returndo: 'returnDo', return_do: 'returnDo',
  start: 'start', from: 'from', to: 'to',
  'total lts': 'totalLts', 'total liters': 'totalLts', 'total litres': 'totalLts',
  totallts: 'totalLts', extra: 'extra', balance: 'balance',
  status: 'journeyStatus', 'journey status': 'journeyStatus',
  'mmsa yard': 'mmsaYard', mmsayard: 'mmsaYard', mmsa: 'mmsaYard',
  'tanga yard': 'tangaYard', tangayard: 'tangaYard',
  'dar yard': 'darYard', daryard: 'darYard',
  'dar going': 'darGoing', dargoing: 'darGoing',
  'moro going': 'moroGoing', morogoing: 'moroGoing',
  'mbeya going': 'mbeyaGoing', mbeyagoing: 'mbeyaGoing',
  'tdm going': 'tdmGoing', tdmgoing: 'tdmGoing',
  'zambia going': 'zambiaGoing', zambiagoing: 'zambiaGoing',
  'congo fuel': 'congoFuel', congofuel: 'congoFuel', congo: 'congoFuel',
  'zambia return': 'zambiaReturn', zambiareturn: 'zambiaReturn',
  'tunduma return': 'tundumaReturn', tundumareturn: 'tundumaReturn', tunduma: 'tundumaReturn',
  'mbeya return': 'mbeyaReturn', mbeyareturn: 'mbeyaReturn',
  'moro return': 'moroReturn', mororeturn: 'moroReturn',
  'dar return': 'darReturn', darreturn: 'darReturn',
  'tanga return': 'tangaReturn', tangareturn: 'tangaReturn',
};

const DELIVERY_ORDER_COLUMNS: Record<string, string> = {
  sn: 'sn', 's/n': 'sn', serial: 'sn', 'serial number': 'sn', no: 'sn',
  date: 'date',
  // import/export — all variants including CSV "IMPORT OR EXPORT"
  'import/export': 'importOrExport', importexport: 'importOrExport',
  'import or export': 'importOrExport', importorexport: 'importOrExport',
  type: 'doType', 'do type': 'doType', dotype: 'doType',
  // do number — including CSV "D.O No." variants
  'do number': 'doNumber', donumber: 'doNumber', 'do no': 'doNumber', dono: 'doNumber',
  'd.o no.': 'doNumber', 'd.o no': 'doNumber', 'd.o number': 'doNumber',
  invoice: 'invoiceNos', 'invoice nos': 'invoiceNos', invoicenos: 'invoiceNos', 'invoice no': 'invoiceNos',
  client: 'clientName', 'client name': 'clientName', clientname: 'clientName',
  // truck/trailer/container — with and without trailing period
  truck: 'truckNo', 'truck no': 'truckNo', 'truck no.': 'truckNo', truckno: 'truckNo',
  trailer: 'trailerNo', 'trailer no': 'trailerNo', 'trailer no.': 'trailerNo', trailerno: 'trailerNo',
  container: 'containerNo', 'container no': 'containerNo', 'container no.': 'containerNo', containerno: 'containerNo',
  // border — including full "BORDER ENTRY DRC" from CSV
  border: 'borderEntryDRC', 'border entry': 'borderEntryDRC', 'border entry drc': 'borderEntryDRC',
  'loading point': 'loadingPoint', loadingpoint: 'loadingPoint',
  destination: 'destination', haulier: 'haulier',
  driver: 'driverName', 'driver name': 'driverName', drivername: 'driverName',
  tonnages: 'tonnages', tonnage: 'tonnages',
  'rate per ton': 'ratePerTon', rateperton: 'ratePerTon', 'rate/ton': 'ratePerTon',
  rate: 'rate',
  // explicit total columns (less common, but handle them)
  total: 'totalAmount', 'total amount': 'totalAmount', totalamount: 'totalAmount',
  amount: 'totalAmount', 'total usd': 'totalAmount', totalusd: 'totalAmount',
};

const LPO_COLUMNS: Record<string, string> = {
  sn: 'sn', 's/n': 'sn', serial: 'sn', no: 'sn',
  // date — full and truncated variants
  date: 'date', dat: 'date',
  // LPO number — full and truncated (Excel often cuts off trailing chars)
  'lpo no': 'lpoNo', 'lpo no.': 'lpoNo', lpono: 'lpoNo', lpo: 'lpoNo', 'lpo number': 'lpoNo',
  'lpo n': 'lpoNo', 'lpo n -': 'lpoNo', 'lpo n-': 'lpoNo',
  // diesel station — "Diesel @" is the real-world truncated form
  'diesel at': 'dieselAt', 'diesel @': 'dieselAt', dieselat: 'dieselAt',
  diesel: 'dieselAt', station: 'dieselAt', 'fueling station': 'dieselAt',
  // DO/SDO reference — truncated as "DO/SD" in narrowed columns
  'do/sdo': 'doSdo', 'do/sd': 'doSdo', 'do/s': 'doSdo',
  dosdo: 'doSdo', 'do sdo': 'doSdo', do: 'doSdo',
  // truck number — truncated as "Truck N"
  truck: 'truckNo', 'truck no': 'truckNo', 'truck no.': 'truckNo', truckno: 'truckNo',
  'truck n': 'truckNo', 'truck n.': 'truckNo',
  // liters
  ltrs: 'ltrs', liters: 'ltrs', litres: 'ltrs', quantity: 'ltrs', lts: 'ltrs',
  // price — truncated as "Price per"
  'price per ltr': 'pricePerLtr', 'price per litre': 'pricePerLtr',
  'price per': 'pricePerLtr', priceperltr: 'pricePerLtr',
  'price/ltr': 'pricePerLtr', 'price/l': 'pricePerLtr',
  price: 'pricePerLtr', 'unit price': 'pricePerLtr', rate: 'pricePerLtr',
  // destinations — truncated as "Destinatio"
  destinations: 'destinations', destination: 'destinations',
  destinatio: 'destinations', dest: 'destinations',
  // payment mode
  'payment mode': 'paymentMode', paymentmode: 'paymentMode', payment: 'paymentMode',
  // currency
  currency: 'currency',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function normalizeKey(raw: string): string {
  return raw.toString().toLowerCase().trim().replace(/\s+/g, ' ');
}

function excelSerialToDateStr(serial: number, overrideYear?: number): string {
  const d = new Date((serial - 25569) * 86400000);
  const day = d.getUTCDate();
  const monthAbbrs = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const mon = monthAbbrs[d.getUTCMonth()];
  const yr = overrideYear ?? d.getUTCFullYear();
  return `${day}-${mon}-${yr}`;
}

/**
 * Normalise any date value to ISO "YYYY-MM-DD" format.
 * Handles: Excel serials, "DD-Mon-YYYY", "DD/MM/YYYY", "YYYY-MM-DD", JS Date strings.
 */
function normalizeToISODate(value: unknown, overrideYear?: number): string {
  if (value === null || value === undefined || safeStr(value) === '') return '';

  // Excel serial number  → convert to UTC date
  if (isExcelSerial(value)) {
    const d = new Date(((value as number) - 25569) * 86400000);
    const y = overrideYear ?? d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, '0');
    const day = String(d.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  const str = String(value).trim();
  if (!str) return '';

  // Already ISO "YYYY-MM-DD" (or longer)
  if (/^\d{4}-\d{2}-\d{2}/.test(str)) {
    const iso = str.substring(0, 10);
    if (overrideYear) return `${overrideYear}-${iso.substring(5)}`;
    return iso;
  }

  const MON_MAP: Record<string, string> = {
    jan:'01',feb:'02',mar:'03',apr:'04',may:'05',jun:'06',
    jul:'07',aug:'08',sep:'09',oct:'10',nov:'11',dec:'12',
  };

  // "DD-Mon-YYYY" or "D-Mon-YYYY"  e.g. "15-Jan-2025"
  const dmy = str.match(/^(\d{1,2})[\/\-\s]([A-Za-z]+)[\/\-\s](\d{4})$/);
  if (dmy) {
    const mon = MON_MAP[dmy[2].toLowerCase().substring(0, 3)];
    if (mon) {
      const y = overrideYear ?? parseInt(dmy[3]);
      return `${y}-${mon}-${dmy[1].padStart(2, '0')}`;
    }
  }

  // "DD-Mon" WITHOUT year (e.g. "01-Oct") — common in LPO sheets where the year
  // is implied by the workbook year parameter or the sheet name month.
  const dmNoYear = str.match(/^(\d{1,2})[\/\-\s]([A-Za-z]{3,})$/);
  if (dmNoYear) {
    const mon = MON_MAP[dmNoYear[2].toLowerCase().substring(0, 3)];
    if (mon) {
      const y = overrideYear ?? new Date().getFullYear();
      return `${y}-${mon}-${dmNoYear[1].padStart(2, '0')}`;
    }
  }

  // "DD/MM/YYYY" or "D/M/YYYY"  (day-first – common in East Africa)
  const slashed = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (slashed) {
    const d = parseInt(slashed[1]);
    const m = parseInt(slashed[2]);
    const y = overrideYear ?? parseInt(slashed[3]);
    // If first number > 12 it must be the day (DD/MM); otherwise assume DD/MM
    return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }

  // Fallback: try native JS Date parser
  const native = new Date(str);
  if (!isNaN(native.getTime())) {
    const y = overrideYear ?? native.getFullYear();
    return `${y}-${String(native.getMonth() + 1).padStart(2, '0')}-${String(native.getDate()).padStart(2, '0')}`;
  }

  return str; // return as-is if nothing worked
}

function isExcelSerial(value: unknown): value is number {
  if (typeof value !== 'number') return false;
  return Number.isInteger(value) && value > 40000 && value < 100000;
}

function safeNum(value: unknown): number | null {
  if (value === null || value === undefined || value === '' || value === '-' || value === 'N/A') return null;
  const n = parseFloat(String(value).replace(/,/g, '').trim());
  return isNaN(n) ? null : n;
}

function safeStr(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

function isEmptyRow(row: Record<string, unknown>): boolean {
  return Object.values(row).every(v => v === null || v === undefined || safeStr(v) === '');
}

const MONTH_NAMES = /^(jan(uary)?|feb(ruary)?|mar(ch)?|apr(il)?|may|jun(e)?|jul(y)?|aug(ust)?|sep(tember)?|oct(ober)?|nov(ember)?|dec(ember)?)(\s+\d{4})?$/i;

function monthFromSheetName(sheetName: string): number | null {
  const abbr: Record<string, number> = {
    jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3,
    apr: 4, april: 4, may: 5, jun: 6, june: 6, jul: 7, july: 7,
    aug: 8, august: 8, sep: 9, september: 9, oct: 10, october: 10,
    nov: 11, november: 11, dec: 12, december: 12,
  };
  const key = sheetName.trim().toLowerCase().replace(/\s+\d{4}$/, '').trim();
  return abbr[key] ?? null;
}

function detectSheetType(sheetName: string, headers: string[]): SheetType {
  const name = sheetName.toLowerCase().replace(/[\s_-]/g, '');
  const headerStr = headers.map(normalizeKey).join(' ');

  // ── Header-based detection FIRST (most reliable) ──────────────────────────
  // Headers unambiguously identify the collection regardless of sheet name.
  // This handles DO/LPO/FuelRecord workbooks where each sheet is named after a month.
  if (/going do|return do|dar going|mbeya going|tanga return|mbeya return/.test(headerStr)) {
    return 'fuelRecord';
  }
  if (/d\.o no|do number|donumber|haulier|loading point|import or export/.test(headerStr)) {
    return 'deliveryOrder';
  }
  // LPO detection: match both full and truncated header variants
  // "lpo n" covers: "lpo no", "lpo number", "lpo n -", "lpo n."
  // "diesel" covers: "diesel at", "diesel @", "diesel"
  // "price per" covers: "price per ltr", "price per", "price/ltr", "price/l"
  if (/lpo n|diesel @|diesel at|price per|price\/l/.test(headerStr)) {
    return 'lpoEntry';
  }

  // ── Sheet-name-based detection (fallback when headers are not decisive) ────
  // Month-named sheets without distinctive headers default to fuelRecord
  // (the classic use case: one sheet per month for fuel journeys).
  if (MONTH_NAMES.test(sheetName.trim())) return 'fuelRecord';
  if (/fuel|record|journey|fuelrecord/.test(name)) return 'fuelRecord';
  if (/delivery.*order|do.*report|order.*report/.test(name)) return 'deliveryOrder';
  if (/lpo/.test(name)) return 'lpoEntry';

  return 'unknown';
}

// ─── Row mappers ──────────────────────────────────────────────────────────────

const FUEL_NUMERIC_FIELDS = new Set([
  'totalLts', 'extra', 'balance',
  'mmsaYard', 'tangaYard', 'darYard',
  'darGoing', 'moroGoing', 'mbeyaGoing', 'tdmGoing', 'zambiaGoing', 'congoFuel',
  'zambiaReturn', 'tundumaReturn', 'mbeyaReturn', 'moroReturn', 'darReturn', 'tangaReturn',
]);

function mapToFuelRecord(row: Record<string, unknown>, year?: number, sheetMonth?: number): Record<string, unknown> {
  const doc: Record<string, unknown> = {
    journeyStatus: 'completed', isDeleted: false, isCancelled: false, isLocked: false,
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
      doc[field] = normalizeToISODate(value, year); // store as YYYY-MM-DD
    } else if (FUEL_NUMERIC_FIELDS.has(field)) {
      const n = safeNum(value);
      if (n !== null) doc[field] = n;
    } else {
      doc[field] = safeStr(value);
    }
  }

  // If date is still an Excel serial after the loop (shouldn't happen, but safety net)
  if (isExcelSerial(doc.date)) {
    doc.date = normalizeToISODate(doc.date as number, year);
  }

  if (sheetMonth) {
    const monthAbbr = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][sheetMonth - 1];
    // Always set the month abbreviation if not already present
    if (!doc.month) doc.month = monthAbbr;
    // If date somehow ended up as a bare day number, build a proper ISO date
    if (doc.date && /^\d{1,2}$/.test(String(doc.date).trim())) {
      const day = String(doc.date).padStart(2, '0');
      const mon = String(sheetMonth).padStart(2, '0');
      const yr = year ?? new Date().getFullYear();
      doc.date = `${yr}-${mon}-${day}`;
    }
  }

  return doc;
}

function mapToDeliveryOrder(row: Record<string, unknown>): Record<string, unknown> {
  const doc: Record<string, unknown> = { isDeleted: false, importOrExport: 'IMPORT', doType: 'DO' };

  for (const [rawKey, value] of Object.entries(row)) {
    if (value === null || value === undefined || safeStr(value) === '') continue;
    const field = DELIVERY_ORDER_COLUMNS[normalizeKey(rawKey)];
    if (!field) continue;

    if (['sn', 'tonnages', 'ratePerTon', 'totalAmount'].includes(field)) {
      const n = safeNum(value);
      if (n !== null) doc[field] = n;
    } else if (field === 'date') {
      doc[field] = normalizeToISODate(value); // store as YYYY-MM-DD
    } else {
      doc[field] = safeStr(value);
    }
  }

  if (doc.importOrExport) {
    const s = String(doc.importOrExport).toUpperCase();
    doc.importOrExport = s === 'EXPORT' ? 'EXPORT' : 'IMPORT';
  }

  if (doc.doType) {
    doc.doType = String(doc.doType).toUpperCase() === 'SDO' ? 'SDO' : 'DO';
  }

  // ── Rate-type detection ──────────────────────────────────────────────────────
  // Two billing models exist:
  //   per_ton    – TONNAGES × RATE PER TON = totalAmount
  //   fixed_total – a single agreed amount (stored in ratePerTon per model convention)
  //
  // Detection rules (in priority order):
  //   1. tonnages > 0  AND  ratePerTon > 0  →  per_ton
  //   2. tonnages > 0  AND  ratePerTon = 0  AND  rate-string numeric  →  per_ton (RATE col used as rate)
  //   3. ratePerTon > 0  AND  tonnages = 0                            →  fixed_total
  //   4. rate-string numeric  AND  tonnages = 0                       →  fixed_total (RATE col = total)
  //   5. explicit totalAmount column present without rate fields       →  fixed_total
  //   6. fallback                                                      →  per_ton with zeros
  // ────────────────────────────────────────────────────────────────────────────
  const tons    = typeof doc.tonnages    === 'number' ? (doc.tonnages    as number) : 0;
  const ratePT  = typeof doc.ratePerTon  === 'number' ? (doc.ratePerTon  as number) : 0;
  const explicit = typeof doc.totalAmount === 'number' ? (doc.totalAmount as number) : 0;
  // Strip currency symbols / commas from the RATE string column to get a numeric value
  const rateNumeric = parseFloat(String(doc.rate ?? '').replace(/[^0-9.]/g, '')) || 0;

  if (tons > 0 && ratePT > 0) {
    // Classic per-ton billing
    doc.rateType    = 'per_ton';
    doc.tonnages    = tons;
    doc.totalAmount = explicit > 0 ? explicit : tons * ratePT;
  } else if (tons > 0 && ratePT === 0 && rateNumeric > 0) {
    // Tonnages present + value in RATE (not RATE PER TON) col → per-ton rate
    doc.rateType    = 'per_ton';
    doc.ratePerTon  = rateNumeric;
    doc.tonnages    = tons;
    doc.totalAmount = explicit > 0 ? explicit : tons * rateNumeric;
  } else if (ratePT > 0) {
    // No tonnages, RATE PER TON col holds the flat total
    doc.rateType    = 'fixed_total';
    doc.tonnages    = 0;
    doc.totalAmount = explicit > 0 ? explicit : ratePT;
    // ratePerTon already set — model stores fixed total in ratePerTon field
  } else if (rateNumeric > 0) {
    // No tonnages, RATE string col holds the flat total
    doc.rateType    = 'fixed_total';
    doc.ratePerTon  = rateNumeric;
    doc.tonnages    = 0;
    doc.totalAmount = explicit > 0 ? explicit : rateNumeric;
  } else if (explicit > 0) {
    // Explicit TOTAL AMOUNT column only — fixed total
    doc.rateType    = 'fixed_total';
    doc.ratePerTon  = explicit;
    doc.tonnages    = 0;
    doc.totalAmount = explicit;
  } else {
    // No financial data at all — default to per_ton with zeros
    doc.rateType    = 'per_ton';
    doc.tonnages    = tons;
    doc.ratePerTon  = ratePT;
    doc.totalAmount = 0;
  }

  return doc;
}

function mapToLPOEntry(
  row: Record<string, unknown>,
  year?: number,
  sheetMonth?: number,
): Record<string, unknown> {
  const doc: Record<string, unknown> = { isDeleted: false };

  for (const [rawKey, value] of Object.entries(row)) {
    if (value === null || value === undefined || safeStr(value) === '') continue;
    const field = LPO_COLUMNS[normalizeKey(rawKey)];
    if (!field) continue;

    if (['sn', 'ltrs', 'pricePerLtr'].includes(field)) {
      const n = safeNum(value);
      if (n !== null) doc[field] = n;
    } else if (field === 'date') {
      doc[field] = normalizeToISODate(value, year); // pass year so "01-Oct" → "2025-10-01"
    } else {
      doc[field] = safeStr(value);
    }
  }

  // ── Infer date from sheetMonth + year when column was absent / unparseable ──
  if ((!doc.date || doc.date === '') && sheetMonth && year) {
    doc.date = `${year}-${String(sheetMonth).padStart(2, '0')}-01`;
  }

  // ── Infer paymentMode from dieselAt when no explicit Payment Mode column ────
  // Real-world LPO sheets use the station name or the word "CASH" in Diesel @.
  if (!doc.paymentMode) {
    const station = String(doc.dieselAt ?? '').toUpperCase().trim();
    if (station === 'CASH') {
      doc.paymentMode = 'CASH';
    } else if (station.includes('DRIVER')) {
      doc.paymentMode = 'DRIVER_ACCOUNT';
    } else {
      doc.paymentMode = 'STATION';
    }
  } else {
    const pm = String(doc.paymentMode).toUpperCase().replace(/\s+/g, '_');
    doc.paymentMode = ['STATION', 'CASH', 'DRIVER_ACCOUNT'].includes(pm) ? pm : 'STATION';
  }

  // ── Infer currency from pricePerLtr when no explicit Currency column ─────────
  // Zambia stations (USD): price ~1–5 $/ltr. Tanzania (TZS): price ~2000–4000 TZS/ltr.
  if (!doc.currency) {
    const p = typeof doc.pricePerLtr === 'number' ? doc.pricePerLtr : 0;
    doc.currency = p > 50 ? 'TZS' : 'USD';
  } else {
    const cur = String(doc.currency).toUpperCase().trim();
    doc.currency = ['USD', 'TZS'].includes(cur) ? cur : 'TZS';
  }

  return doc;
}

// ─── Importers ────────────────────────────────────────────────────────────────

async function importFuelRecords(
  rows: Record<string, unknown>[],
  dryRun: boolean,
  year?: number,
  sheetMonth?: number,
): Promise<ImportResult> {
  const result: ImportResult = { inserted: 0, updated: 0, skipped: 0, errors: 0 };
  let lastKnownDate: unknown = null;

  for (const row of rows) {
    if (isEmptyRow(row)) continue;

    const rawDateVal = row['Date'] ?? row['date'] ?? row['DATE'];
    if (rawDateVal !== null && rawDateVal !== undefined) {
      lastKnownDate = rawDateVal;
    } else if (lastKnownDate !== null) {
      row['Date'] = lastKnownDate;
    }

    const doc = mapToFuelRecord(row, year, sheetMonth);

    if (!doc.truckNo || !doc.date || !doc.goingDo) { result.skipped++; continue; }
    if (!doc.start) doc.start = 'DSM';
    if (!doc.from) doc.from = doc.start;
    if (!doc.to) doc.to = 'UNKNOWN';

    const filter = { truckNo: doc.truckNo, goingDo: doc.goingDo };

    try {
      if (dryRun) {
        const exists = await FuelRecord.exists(filter);
        exists ? result.updated++ : result.inserted++;
        continue;
      }
      // Always upsert — insert new, overwrite existing
      const res = await FuelRecord.updateOne(filter, { $set: doc }, { upsert: true });
      res.upsertedCount ? result.inserted++ : result.updated++;
    } catch (err: unknown) {
      logger.error(`[ImportCtrl][FuelRecord] ${(err as Error).message}`);
      result.errors++;
    }
  }
  return result;
}

async function importDeliveryOrders(
  rows: Record<string, unknown>[],
  dryRun: boolean,
): Promise<ImportResult> {
  const result: ImportResult = { inserted: 0, updated: 0, skipped: 0, errors: 0 };

  for (const row of rows) {
    if (isEmptyRow(row)) continue;
    const doc = mapToDeliveryOrder(row);
    if (!doc.doNumber) { result.skipped++; continue; }
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
        exists ? result.updated++ : result.inserted++;
        continue;
      }
      // Always upsert — insert new, overwrite existing
      const res = await DeliveryOrder.updateOne(filter, { $set: doc }, { upsert: true });
      res.upsertedCount ? result.inserted++ : result.updated++;
    } catch (err: unknown) {
      logger.error(`[ImportCtrl][DeliveryOrder] ${(err as Error).message}`);
      result.errors++;
    }
  }
  return result;
}

async function importLPOEntries(
  rows: Record<string, unknown>[],
  dryRun: boolean,
  year?: number,
  sheetMonth?: number,
): Promise<ImportResult> {
  const result: ImportResult = { inserted: 0, updated: 0, skipped: 0, errors: 0 };

  for (const row of rows) {
    if (isEmptyRow(row)) continue;
    const doc = mapToLPOEntry(row, year, sheetMonth);
    // Skip only if truly no LPO number — missing ltrs is OK (could be a NIL entry)
    if (!doc.lpoNo) { result.skipped++; continue; }
    if (doc.ltrs === undefined) doc.ltrs = 0;
    if (!doc.truckNo) doc.truckNo = 'UNKNOWN';
    if (!doc.dieselAt) doc.dieselAt = 'UNKNOWN';
    if (!doc.doSdo) doc.doSdo = 'UNKNOWN';
    if (!doc.destinations) doc.destinations = 'UNKNOWN';
    if (doc.pricePerLtr === undefined) doc.pricePerLtr = 0;
    if (!doc.date) doc.date = new Date().toISOString().split('T')[0];

    // Compute actualDate explicitly — updateOne($set) bypasses Mongoose pre-save hooks,
    // so we must set it here to match what natively-created records produce.
    // Imported dates are already ISO "YYYY-MM-DD" at this point.
    if (typeof doc.date === 'string' && /^\d{4}-\d{2}-\d{2}/.test(doc.date)) {
      doc.actualDate = new Date(doc.date + 'T00:00:00.000Z');
    }

    // Assign an sn if missing (use max existing + position in batch)
    if (doc.sn === undefined) doc.sn = 0; // will be renumbered below if needed

    // Each LPO number can have multiple trucks — use {lpoNo + truckNo} as the
    // unique key so that all rows with the same LPO are stored individually.
    const filter = { lpoNo: doc.lpoNo, truckNo: doc.truckNo };

    try {
      if (dryRun) {
        const exists = await LPOEntry.exists(filter);
        exists ? result.updated++ : result.inserted++;
        continue;
      }
      // Always upsert — insert new, overwrite existing
      const res = await LPOEntry.updateOne(filter, { $set: doc }, { upsert: true });
      res.upsertedCount ? result.inserted++ : result.updated++;
    } catch (err: unknown) {
      logger.error(`[ImportCtrl][LPOEntry] ${(err as Error).message}`);
      result.errors++;
    }
  }
  return result;
}

/**
 * After importing LPOEntry rows, reconstruct missing LPOSummary documents so that
 * the workbook view is populated exactly as if the LPOs had been created through the UI.
 *
 * Groups all LPOEntry records that lack a corresponding LPOSummary by lpoNo,
 * creates a synthetic LPOSummary + ensures the year workbook exists.
 */
async function backfillLPOSummaries(dryRun: boolean): Promise<{ created: number; skipped: number }> {
  let created = 0, skipped = 0;
  try {
    // Find lpoNo values in LPOEntry that have no matching LPOSummary
    const existingSummaryNos = await LPOSummary.distinct('lpoNo', { isDeleted: false });
    const orphanedEntries = await LPOEntry.find({
      isDeleted: false,
      lpoNo: { $nin: existingSummaryNos },
    }).lean();

    if (orphanedEntries.length === 0) return { created, skipped };

    // Group by lpoNo
    const byLpo: Record<string, typeof orphanedEntries> = {};
    for (const e of orphanedEntries) {
      if (!byLpo[e.lpoNo]) byLpo[e.lpoNo] = [];
      byLpo[e.lpoNo].push(e);
    }

    for (const [lpoNo, entries] of Object.entries(byLpo)) {
      const first = entries[0];
      // Derive summary date: prefer actualDate, fall back to the ISO date string
      const rawDate = (first.actualDate as Date | undefined)
        ? (first.actualDate as Date).toISOString().split('T')[0]
        : (typeof first.date === 'string' && /^\d{4}-\d{2}-\d{2}/.test(first.date)
            ? first.date
            : new Date().toISOString().split('T')[0]);

      const summaryYear = parseInt(rawDate.split('-')[0]);
      const station = first.dieselAt || 'UNKNOWN';

      const summaryEntries = entries.map(e => ({
        doNo:          e.doSdo   || 'IMPORTED',
        truckNo:       e.truckNo,
        liters:        e.ltrs    ?? 0,
        rate:          e.pricePerLtr ?? 0,
        amount:        (e.ltrs ?? 0) * (e.pricePerLtr ?? 0),
        dest:          e.destinations || 'IMPORTED',
        isCancelled:   false,
        isDriverAccount: e.isDriverAccount ?? false,
      }));

      const total = summaryEntries.reduce((s, e) => s + e.amount, 0);

      if (dryRun) { skipped++; continue; }

      try {
        // Upsert the LPOSummary (idempotent — safe to re-run)
        await LPOSummary.updateOne(
          { lpoNo },
          {
            $setOnInsert: {
              lpoNo,
              date:     rawDate,
              year:     summaryYear,
              station,
              orderOf:  'TAHMEED',
              entries:  summaryEntries,
              total,
              currency: (first as any).currency || 'TZS',
              isDeleted: false,
            },
          },
          { upsert: true },
        );

        // Ensure the workbook for this year exists
        const wbExists = await LPOWorkbook.exists({ year: summaryYear, isDeleted: false });
        if (!wbExists) {
          await LPOWorkbook.create({ year: summaryYear, name: `LPOS ${summaryYear}` });
          logger.info(`[ImportCtrl] Created workbook for year ${summaryYear}`);
        }

        created++;
      } catch (err: unknown) {
        logger.error(`[ImportCtrl][backfillLPOSummaries] lpoNo=${lpoNo}: ${(err as Error).message}`);
        skipped++;
      }
    }
  } catch (err: unknown) {
    logger.error(`[ImportCtrl][backfillLPOSummaries] ${(err as Error).message}`);
  }
  return { created, skipped };
}

/**
 * POST /api/import/migrate-lpo-data
 *
 * One-time migration for imported LPOEntry records that were created before
 * the inline actualDate + backfillLPOSummaries fixes were applied.
 *
 * Steps:
 *  1. Find all LPOEntry records with an ISO date string but no `actualDate`
 *  2. Set `actualDate` = parsed date for each
 *  3. Run `backfillLPOSummaries` to create LPOSummary / LPOWorkbook docs
 */
export const migrateLPOData = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    // Step 1: Patch missing actualDate on LPOEntry records
    const entriesWithISODate = await LPOEntry.find({
      isDeleted: false,
      date: /^\d{4}-\d{2}-\d{2}/,
      $or: [{ actualDate: { $exists: false } }, { actualDate: null }],
    }).lean();

    let patchedDates = 0;
    for (const entry of entriesWithISODate) {
      const d = new Date((entry.date as string) + 'T00:00:00.000Z');
      if (!isNaN(d.getTime())) {
        await LPOEntry.updateOne({ _id: entry._id }, { $set: { actualDate: d } });
        patchedDates++;
      }
    }

    logger.info(`[migrateLPOData] Patched actualDate on ${patchedDates} LPOEntry records`);

    // Step 2: Repair LPOSummary docs where the stored `year` doesn't match their ISO `date`.
    // This handles the case where summaries were created with year = createdAt year (e.g. 2026)
    // even though the actual business date is in a different year (e.g. 2025).
    const wrongYearSummaries = await LPOSummary.find({
      isDeleted: false,
      date: /^\d{4}-\d{2}-\d{2}/,
    }).select('date year').lean();

    let repairedYears = 0;
    for (const summary of wrongYearSummaries) {
      const correctYear = parseInt((summary.date as string).split('-')[0], 10);
      if (!isNaN(correctYear) && correctYear !== summary.year) {
        await LPOSummary.updateOne({ _id: summary._id }, { $set: { year: correctYear } });
        repairedYears++;
      }
    }

    if (repairedYears > 0) {
      logger.info(`[migrateLPOData] Repaired year on ${repairedYears} LPOSummary docs`);
      // Ensure workbooks exist for every year that was repaired
      const uniqueYears = [...new Set(
        wrongYearSummaries
          .map(s => parseInt((s.date as string).split('-')[0], 10))
          .filter(y => !isNaN(y))
      )];
      for (const y of uniqueYears) {
        const exists = await LPOWorkbook.exists({ year: y, isDeleted: false });
        if (!exists) {
          await LPOWorkbook.create({ year: y, name: `LPOS ${y}` });
          logger.info(`[migrateLPOData] Created workbook for year ${y}`);
        }
      }
    }

    // Step 3: Backfill LPOSummary / LPOWorkbook for orphaned entries
    const backfill = await backfillLPOSummaries(false);

    logger.info(
      `[migrateLPOData] backfill: created=${backfill.created} skipped=${backfill.skipped}`,
    );

    res.json({
      success: true,
      message: 'Migration complete',
      patchedActualDates: patchedDates,
      repairedLPOSummaryYears: repairedYears,
      lpoSummariesCreated: backfill.created,
      lpoSummariesSkipped: backfill.skipped,
    });
  } catch (err: unknown) {
    logger.error('[migrateLPOData] Error:', err);
    res.status(500).json({ success: false, message: 'Migration failed. Check server logs.' });
  }
};

// ─── Sheet processor ──────────────────────────────────────────────────────────

async function processSheet(
  workbook: XLSX.WorkBook,
  sheetName: string,
  dryRun: boolean,
  year?: number,
): Promise<{ type: SheetType; result: ImportResult }> {
  const emptyResult: ImportResult = { inserted: 0, updated: 0, skipped: 0, errors: 0 };
  const worksheet = workbook.Sheets[sheetName];

  const rawRows: Record<string, unknown>[] = XLSX.utils.sheet_to_json(worksheet, {
    defval: null,
    blankrows: false,
  });

  if (rawRows.length === 0) return { type: 'unknown', result: emptyResult };

  const headers = Object.keys(rawRows[0] as object);
  const sheetType = detectSheetType(sheetName, headers);
  const sheetMonth = monthFromSheetName(sheetName) ?? undefined;

  if (sheetType === 'unknown') return { type: 'unknown', result: emptyResult };

  let result: ImportResult;
  if (sheetType === 'fuelRecord') {
    result = await importFuelRecords(rawRows, dryRun, year, sheetMonth);
  } else if (sheetType === 'deliveryOrder') {
    result = await importDeliveryOrders(rawRows, dryRun);
  } else {
    // Pass year + sheetMonth so LPO date "01-Oct" resolves to "2025-10-01"
    result = await importLPOEntries(rawRows, dryRun, year, sheetMonth);
  }

  return { type: sheetType, result };
}

// ─── Controllers ─────────────────────────────────────────────────────────────

/**
 * POST /api/import/preview
 * Returns sheet metadata without writing to DB.
 */
export const previewExcel = async (req: ImportRequest, res: Response): Promise<void> => {
  if (!req.file) {
    res.status(400).json({ success: false, message: 'No file uploaded.' });
    return;
  }

  try {
    const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
    const sheets: SheetPreview[] = workbook.SheetNames.map((name) => {
      const ws = workbook.Sheets[name];
      const rows: Record<string, unknown>[] = XLSX.utils.sheet_to_json(ws, {
        defval: null,
        blankrows: false,
      });
      const headers = rows.length > 0 ? Object.keys(rows[0] as object) : [];
      return {
        name,
        detectedType: detectSheetType(name, headers),
        rowCount: rows.length,
        headers: headers.slice(0, 15), // first 15 headers for preview
      };
    });

    res.json({
      success: true,
      fileName: req.file.originalname,
      fileSize: req.file.size,
      totalSheets: sheets.length,
      sheets,
    });
  } catch (err: unknown) {
    logger.error('[ImportCtrl] Preview error:', err);
    res.status(400).json({ success: false, message: 'Failed to parse Excel file. Make sure it is a valid .xlsx or .xls file.' });
  }
};

/**
 * POST /api/import/excel
 * Imports data from uploaded Excel file into MongoDB.
 * Body params (multipart):
 *   excelFile  – the file (.xlsx, .xls, or .csv)
 *   dryRun     – "true" / "false"
 *   year       – optional 4-digit year to override dates
 *   sheets     – optional JSON array of sheet names to process (if blank → all)
 *
 * Note: force-overwrite is always enabled — every record is upserted.
 */
export const importExcel = async (req: ImportRequest, res: Response): Promise<void> => {
  if (!req.file) {
    res.status(400).json({ success: false, message: 'No file uploaded.' });
    return;
  }

  const dryRun = req.body.dryRun === 'true';
  const yearRaw = req.body.year ? parseInt(req.body.year, 10) : undefined;
  const year = yearRaw && !isNaN(yearRaw) ? yearRaw : undefined;
  const requestedSheets: string[] | undefined = req.body.sheets
    ? JSON.parse(req.body.sheets)
    : undefined;

  try {
    const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });

    const sheetsToProcess = requestedSheets
      ? workbook.SheetNames.filter((n) => requestedSheets.includes(n))
      : workbook.SheetNames;

    const sheetResults: Array<{
      name: string;
      type: SheetType;
      inserted: number;
      updated: number;
      skipped: number;
      errors: number;
    }> = [];

    let totalInserted = 0;
    let totalUpdated = 0;
    let totalSkipped = 0;
    let totalErrors = 0;

    for (const sheetName of sheetsToProcess) {
      const { type, result } = await processSheet(workbook, sheetName, dryRun, year);
      sheetResults.push({ name: sheetName, type, ...result });
      totalInserted += result.inserted;
      totalUpdated += result.updated;
      totalSkipped += result.skipped;
      totalErrors += result.errors;
    }

    logger.info(
      `[ImportCtrl] ${dryRun ? '[DRY RUN] ' : ''}Import complete by ${req.user?.username} — ` +
      `inserted=${totalInserted} updated=${totalUpdated} skipped=${totalSkipped} errors=${totalErrors}`,
    );

    // After every real import, backfill any LPOEntry records that have no matching
    // LPOSummary document. This makes imported data appear in the workbook view
    // exactly as if the LPOs had been created through the UI.
    const lpoSheetsImported = sheetResults.some(s => s.type === 'lpoEntry' && !dryRun);
    const backfill = lpoSheetsImported
      ? await backfillLPOSummaries(false)
      : { created: 0, skipped: 0 };

    if (backfill.created > 0) {
      logger.info(`[ImportCtrl] Backfilled ${backfill.created} LPOSummary documents from imported entries`);
    }

    res.json({
      success: true,
      dryRun,
      fileName: req.file.originalname,
      summary: {
        totalInserted,
        totalUpdated,
        totalSkipped,
        totalErrors,
        sheetsProcessed: sheetsToProcess.length,
        lpoSummariesCreated: backfill.created,
      },
      sheets: sheetResults,
    });
  } catch (err: unknown) {
    logger.error('[ImportCtrl] Import error:', err);
    res.status(500).json({ success: false, message: 'Import failed. Check server logs for details.' });
  }
};
