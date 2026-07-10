import ExcelJS from 'exceljs';

const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const thinBorder: Partial<ExcelJS.Borders> = {
  top: { style: 'thin' },
  left: { style: 'thin' },
  bottom: { style: 'thin' },
  right: { style: 'thin' },
};

const centerAlign: Partial<ExcelJS.Alignment> = {
  horizontal: 'center',
  vertical: 'middle',
};

/** Parse "Jan-2026" → { monthIdx, year, dateFrom, dateTo } */
export function parseMonthYearLabel(label: string): {
  monthIdx: number;
  year: number;
  dateFrom: string;
  dateTo: string;
  sheetName: string;
} | null {
  const [mon, yearStr] = label.split('-');
  const year = parseInt(yearStr, 10);
  const monthIdx = MONTH_ABBR.indexOf(mon);
  if (monthIdx < 0 || isNaN(year)) return null;
  const mm = String(monthIdx + 1).padStart(2, '0');
  const lastDay = new Date(year, monthIdx + 1, 0).getDate();
  return {
    monthIdx,
    year,
    dateFrom: `${year}-${mm}-01`,
    dateTo: `${year}-${mm}-${String(lastDay).padStart(2, '0')}`,
    sheetName: label,
  };
}

export function monthAbbrToRange(monthAbbr: string, year: number): { dateFrom: string; dateTo: string } | null {
  const monthIdx = MONTH_ABBR.indexOf(monthAbbr);
  if (monthIdx < 0 || isNaN(year)) return null;
  const mm = String(monthIdx + 1).padStart(2, '0');
  const lastDay = new Date(year, monthIdx + 1, 0).getDate();
  return {
    dateFrom: `${year}-${mm}-01`,
    dateTo: `${year}-${mm}-${String(lastDay).padStart(2, '0')}`,
  };
}

export function monthAbbrFromDate(dateStr: string): string | null {
  const iso = String(dateStr || '').match(/^(\d{4})-(\d{2})/);
  if (iso) {
    const idx = parseInt(iso[2], 10) - 1;
    return MONTH_ABBR[idx] ?? null;
  }
  const parts = String(dateStr || '').split('-');
  if (parts.length >= 2 && MONTH_ABBR.includes(parts[1])) return parts[1];
  return null;
}

export function getCurrencyFromStation(station: string): 'USD' | 'TZS' {
  const upper = (station || '').toUpperCase();
  if (upper.startsWith('LAKE') && !upper.includes('TUNDUMA')) return 'USD';
  return 'TZS';
}

function styleHeaderRow(row: ExcelJS.Row, colCount: number, fillArgb = 'FFE0E0E0') {
  row.font = { bold: true };
  row.alignment = centerAlign;
  row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fillArgb } };
  for (let col = 1; col <= colCount; col++) {
    row.getCell(col).border = thinBorder;
  }
}

function styleDataRow(row: ExcelJS.Row, colCount: number, cancelled = false) {
  for (let col = 1; col <= colCount; col++) {
    const cell = row.getCell(col);
    cell.alignment = centerAlign;
    cell.border = thinBorder;
    if (cancelled) {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEE2E2' } };
      cell.font = { color: { argb: 'FF9CA3AF' }, strike: true };
    }
  }
}

/**
 * Build DO/SDO Monthly Summary tab sheets — one sheet per "Mon-YYYY" label.
 * Matches the Summary tab export columns (includes cancelled rows, struck through).
 */
export function addDoSummaryTabSheets(
  workbook: ExcelJS.Workbook,
  ordersBySheet: Map<string, any[]>,
  sheetOrder: string[],
  doNumberHeader: string = 'D.O No.'
): void {
  const headers = [
    'S/N', 'DATE', 'IMPORT OR EXPORT', doNumberHeader, 'Invoice Nos',
    'CLIENT NAME', 'TRUCK No.', 'TRAILER No.', 'CONTAINER No.',
    'BORDER ENTRY DRC', 'LOADING POINT', 'DESTINATION', 'HAULIER',
    'TONNAGES', 'RATE PER TON', 'RATE',
  ];

  for (const sheetName of sheetOrder) {
    const orders = ordersBySheet.get(sheetName) || [];
    if (orders.length === 0) continue;

    // Excel sheet names max 31 chars; "Jan-2026" is fine
    const safeName = sheetName.slice(0, 31);
    const sheet = workbook.addWorksheet(safeName);
    sheet.columns = [
      { width: 6 }, { width: 12 }, { width: 15 }, { width: 12 }, { width: 15 },
      { width: 25 }, { width: 15 }, { width: 15 }, { width: 15 },
      { width: 15 }, { width: 20 }, { width: 20 }, { width: 20 },
      { width: 12 }, { width: 12 }, { width: 15 },
    ];

    const headerRow = sheet.getRow(1);
    headerRow.values = headers;
    styleHeaderRow(headerRow, headers.length, 'FF4472C4');
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };

    orders.forEach((order, index) => {
      const row = sheet.getRow(index + 2);
      row.values = [
        index + 1,
        order.date,
        order.importOrExport,
        order.doNumber,
        order.invoiceNos || '',
        order.clientName,
        order.truckNo,
        order.trailerNo,
        order.containerNo || 'LOOSE CARGO',
        order.borderEntryDRC || '',
        order.loadingPoint || '',
        order.destination,
        order.haulier || '',
        order.tonnages,
        order.ratePerTon,
        (order.tonnages || 0) * (order.ratePerTon || 0),
      ];
      styleDataRow(row, headers.length, !!order.isCancelled);
    });
  }
}

function resolveLpoEntryType(entry: any): string {
  if (entry.isDriverAccount) return 'DRIVER ACCOUNT';
  if (entry.isRefer) return 'REF';
  return 'REGULAR';
}

/**
 * Build LPO Monthly Summary sheets (no Payment Mode / Paybill columns).
 */
export function addLpoSummaryMonthSheet(
  workbook: ExcelJS.Workbook,
  sheetName: string,
  entries: any[]
): void {
  const headers = [
    'S/N', 'Date', 'LPO No.', 'Diesel At', 'Currency', 'DO/SDO',
    'Truck No.', 'Liters', 'Price per Liter', 'Total Amount', 'Destinations', 'Type',
  ];

  const sheet = workbook.addWorksheet(sheetName.slice(0, 31));
  sheet.columns = [
    { width: 6 }, { width: 12 }, { width: 10 }, { width: 15 }, { width: 10 }, { width: 10 },
    { width: 12 }, { width: 10 }, { width: 12 }, { width: 15 }, { width: 18 }, { width: 15 },
  ];

  const headerRow = sheet.getRow(1);
  headerRow.values = headers;
  styleHeaderRow(headerRow, headers.length);

  entries.forEach((entry, index) => {
    const liters = entry.ltrs ?? entry.liters ?? 0;
    const rate = entry.pricePerLtr ?? entry.rate ?? 0;
    const row = sheet.getRow(index + 2);
    row.values = [
      index + 1,
      entry.date,
      entry.lpoNo,
      entry.dieselAt || entry.station,
      getCurrencyFromStation(entry.dieselAt || entry.station || ''),
      entry.doSdo || 'NIL',
      entry.truckNo,
      liters,
      rate,
      liters * rate,
      entry.destinations || entry.dest || '',
      resolveLpoEntryType(entry),
    ];
    styleDataRow(row, headers.length, !!entry.isCancelled);
  });
}

export function addLpoYearSummarySheet(
  workbook: ExcelJS.Workbook,
  year: number,
  byMonth: Map<string, any[]>
): void {
  const headers = [
    'Month', 'Total LPOs', 'Regular LPOs', 'Driver Account LPOs',
    'Total Liters', 'Total Amount (TZS)', 'Total Amount (USD)', 'Average Price/Liter',
  ];

  const sheet = workbook.addWorksheet(`${year}_Summary`.slice(0, 31));
  sheet.columns = [
    { width: 10 }, { width: 12 }, { width: 12 }, { width: 18 },
    { width: 12 }, { width: 16 }, { width: 16 }, { width: 16 },
  ];

  const headerRow = sheet.getRow(1);
  headerRow.values = headers;
  styleHeaderRow(headerRow, headers.length);

  let rowNum = 2;
  for (const month of MONTH_ABBR) {
    const monthEntries = byMonth.get(month);
    if (!monthEntries || monthEntries.length === 0) continue;

    const totalLiters = monthEntries.reduce((sum, e) => sum + (e.ltrs ?? e.liters ?? 0), 0);
    let totalAmountTZS = 0;
    let totalAmountUSD = 0;
    let driverAccountLPOs = 0;

    for (const e of monthEntries) {
      const liters = e.ltrs ?? e.liters ?? 0;
      const rate = e.pricePerLtr ?? e.rate ?? 0;
      const amount = liters * rate;
      const currency = getCurrencyFromStation(e.dieselAt || e.station || '');
      if (currency === 'USD') totalAmountUSD += amount;
      else totalAmountTZS += amount;
      if (e.isDriverAccount) driverAccountLPOs += 1;
    }

    const totalAmount = totalAmountTZS + totalAmountUSD;
    const row = sheet.getRow(rowNum++);
    row.values = [
      month,
      monthEntries.length,
      monthEntries.length - driverAccountLPOs,
      driverAccountLPOs,
      totalLiters,
      totalAmountTZS,
      totalAmountUSD,
      totalLiters > 0 ? Number((totalAmount / totalLiters).toFixed(2)) : 0,
    ];
    styleDataRow(row, headers.length);
  }
}

export { MONTH_ABBR };
