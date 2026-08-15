/**
 * Visas & Overstays export generators (ExcelJS + PDFKit + SVG image).
 * Used by clerk day-sheet and build-review download endpoints.
 */
import PDFDocument from 'pdfkit';
import ExcelJS from 'exceljs';
import fs from 'fs';
import path from 'path';
import os from 'os';

export type DayExportRow = {
  truckNo: string;
  driverName: string;
  position?: string | null;
  overstayLabel?: string | null;
  overstayAmount?: number | null;
  visaAmount?: number | null;
  overstayStatus?: string | null;
  visaStatus?: string | null;
};

export type BuildExportRow = {
  truckNo: string;
  driverName: string;
  passportDueDate?: string | null;
  position?: string | null;
  source?: string | null;
  includeOverstay?: boolean;
  includeVisa?: boolean;
  overstayAmount?: number;
  visaAmount?: number;
};

export type DayTotals = { overstay: number; visa: number; all: number };

const SOURCE_LABEL: Record<string, string> = {
  due_date: 'Due date',
  cycle: 'Cycle 10d',
  reserve_raw: 'Raw reserve',
  late_add: 'Late add',
};

/** LPO-style grayscale palette (Excel ARGB without #). */
const INK = '000000';
const MUTED = '666666';
const HEADER_BG = 'F0F0F0';
const BORDER = '000000';

function fmtDate(ymd: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(ymd);
  if (!m) return ymd;
  return `${m[3]}/${m[2]}/${m[1]}`;
}

function money(n: number | null | undefined): string {
  if (n == null || Number.isNaN(Number(n))) return '—';
  return `$${Number(n).toFixed(2)}`;
}

function activeRows(rows: DayExportRow[]) {
  return rows.filter((r) => r.overstayStatus !== 'cancelled' || r.visaStatus !== 'cancelled');
}

function thinBorder(): Partial<ExcelJS.Borders> {
  return {
    top: { style: 'thin', color: { argb: `FF${BORDER}` } },
    bottom: { style: 'thin', color: { argb: `FF${BORDER}` } },
    left: { style: 'thin', color: { argb: `FF${BORDER}` } },
    right: { style: 'thin', color: { argb: `FF${BORDER}` } },
  };
}

/** Professional dual-panel day sheet workbook. */
export async function buildDaySheetWorkbook(
  date: string,
  rows: DayExportRow[],
  totals: DayTotals
): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Fuel Order — Clerk';
  wb.created = new Date();
  const ws = wb.addWorksheet('Day sheet', {
    views: [{ showGridLines: false }],
  });

  const active = activeRows(rows);
  const visaRows = active.filter((r) => r.visaAmount != null);

  ws.mergeCells('A1:G1');
  ws.getCell('A1').value = 'VISAS & OVERSTAYS';
  ws.getCell('A1').font = { bold: true, size: 16, color: { argb: `FF${INK}` }, name: 'Arial' };
  ws.getCell('A1').alignment = { vertical: 'middle', horizontal: 'left' };

  ws.mergeCells('H1:N1');
  ws.getCell('H1').value = `Date: ${fmtDate(date)}`;
  ws.getCell('H1').font = { bold: true, size: 12, color: { argb: `FF${INK}` }, name: 'Arial' };
  ws.getCell('H1').alignment = { vertical: 'middle', horizontal: 'right' };
  ws.getRow(1).height = 22;

  ws.mergeCells('A2:G2');
  ws.getCell('A2').value = 'DAILY DISBURSEMENT';
  ws.getCell('A2').font = { size: 10, color: { argb: `FF${INK}` }, name: 'Arial' };

  ws.mergeCells('A3:G3');
  ws.getCell('A3').value = `Trucks: ${active.length}`;
  ws.getCell('A3').font = { size: 10, name: 'Arial' };
  ws.mergeCells('H3:N3');
  ws.getCell('H3').value = 'Clerk portal';
  ws.getCell('H3').font = { size: 10, name: 'Arial' };
  ws.getCell('H3').alignment = { horizontal: 'right' };

  ws.mergeCells('A4:G4');
  ws.getCell('A4').value = 'OVERSTAY';
  ws.getCell('A4').font = { bold: true, size: 11, color: { argb: `FF${INK}` } };
  ws.getCell('A4').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${HEADER_BG}` } };

  ws.mergeCells('I4:N4');
  ws.getCell('I4').value = 'VISA';
  ws.getCell('I4').font = { bold: true, size: 11, color: { argb: `FF${INK}` } };
  ws.getCell('I4').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${HEADER_BG}` } };

  const oHeaders = ['S/No.', 'Date', 'Truck No.', 'Name', 'Particular', 'Amount', 'Position'];
  const vHeaders = ['S/No.', 'Date', 'Truck No.', 'Particular', 'Amount', 'Position'];
  oHeaders.forEach((h, i) => {
    const cell = ws.getCell(5, i + 1);
    cell.value = h;
    cell.font = { bold: true, color: { argb: `FF${INK}` }, size: 10 };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${HEADER_BG}` } };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.border = thinBorder();
  });
  vHeaders.forEach((h, i) => {
    const cell = ws.getCell(5, i + 9);
    cell.value = h;
    cell.font = { bold: true, color: { argb: `FF${INK}` }, size: 10 };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${HEADER_BG}` } };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.border = thinBorder();
  });

  const maxRows = Math.max(active.length, visaRows.length, 1);

  for (let i = 0; i < maxRows; i++) {
    const r = 6 + i;
    if (i < active.length) {
      const row = active[i];
      const vals: (string | number)[] = [
        i + 1,
        fmtDate(date),
        row.truckNo,
        row.driverName || '',
        row.overstayLabel || 'OVERSTAY',
        row.overstayAmount != null ? Number(row.overstayAmount) : '',
        row.position || '',
      ];
      vals.forEach((v, c) => {
        const cell = ws.getCell(r, c + 1);
        cell.value = v;
        cell.font = { size: 10, bold: c === 2, name: 'Arial' };
        cell.alignment = {
          horizontal: c === 3 || c === 6 ? 'left' : 'center',
          vertical: 'middle',
        };
        cell.border = thinBorder();
        if (c === 5 && typeof v === 'number') cell.numFmt = '"$"#,##0.00';
      });
    }
    if (i < visaRows.length) {
      const row = visaRows[i];
      const vals: (string | number)[] = [
        i + 1,
        fmtDate(date),
        row.truckNo,
        'VISA',
        row.visaAmount != null ? Number(row.visaAmount) : '',
        row.position || '',
      ];
      vals.forEach((v, c) => {
        const cell = ws.getCell(r, c + 9);
        cell.value = v;
        cell.font = { size: 10, bold: c === 2, name: 'Arial' };
        cell.alignment = {
          horizontal: c === 5 ? 'left' : 'center',
          vertical: 'middle',
        };
        cell.border = thinBorder();
        if (c === 4 && typeof v === 'number') cell.numFmt = '"$"#,##0.00';
      });
    }
  }

  const totalRow = 6 + maxRows;
  ws.getCell(totalRow, 5).value = 'TOTAL';
  ws.getCell(totalRow, 5).font = { bold: true, color: { argb: `FF${INK}` } };
  ws.getCell(totalRow, 5).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${HEADER_BG}` } };
  ws.getCell(totalRow, 5).border = thinBorder();
  ws.getCell(totalRow, 6).value = Number(totals.overstay || 0);
  ws.getCell(totalRow, 6).numFmt = '"$"#,##0.00';
  ws.getCell(totalRow, 6).font = { bold: true, color: { argb: `FF${INK}` } };
  ws.getCell(totalRow, 6).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${HEADER_BG}` } };
  ws.getCell(totalRow, 6).border = thinBorder();

  ws.getCell(totalRow, 12).value = 'TOTAL';
  ws.getCell(totalRow, 12).font = { bold: true, color: { argb: `FF${INK}` } };
  ws.getCell(totalRow, 12).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${HEADER_BG}` } };
  ws.getCell(totalRow, 12).border = thinBorder();
  ws.getCell(totalRow, 13).value = Number(totals.visa || 0);
  ws.getCell(totalRow, 13).numFmt = '"$"#,##0.00';
  ws.getCell(totalRow, 13).font = { bold: true, color: { argb: `FF${INK}` } };
  ws.getCell(totalRow, 13).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${HEADER_BG}` } };
  ws.getCell(totalRow, 13).border = thinBorder();

  const grand = totalRow + 2;
  ws.mergeCells(grand, 1, grand, 2);
  ws.getCell(grand, 1).value = 'OVERSTAY TOTAL';
  ws.getCell(grand, 1).font = { bold: true, size: 10, color: { argb: `FF${MUTED}` } };
  ws.getCell(grand, 1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${HEADER_BG}` } };
  ws.getCell(grand, 3).value = Number(totals.overstay || 0);
  ws.getCell(grand, 3).numFmt = '"$"#,##0.00';
  ws.getCell(grand, 3).font = { bold: true, size: 11, color: { argb: `FF${INK}` } };
  ws.getCell(grand, 3).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${HEADER_BG}` } };

  ws.mergeCells(grand, 5, grand, 6);
  ws.getCell(grand, 5).value = 'VISA TOTAL';
  ws.getCell(grand, 5).font = { bold: true, size: 10, color: { argb: `FF${MUTED}` } };
  ws.getCell(grand, 5).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${HEADER_BG}` } };
  ws.getCell(grand, 7).value = Number(totals.visa || 0);
  ws.getCell(grand, 7).numFmt = '"$"#,##0.00';
  ws.getCell(grand, 7).font = { bold: true, size: 11, color: { argb: `FF${INK}` } };
  ws.getCell(grand, 7).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${HEADER_BG}` } };

  ws.mergeCells(grand, 9, grand, 11);
  ws.getCell(grand, 9).value = 'GRAND TOTAL';
  ws.getCell(grand, 9).font = { bold: true, size: 10, color: { argb: `FF${MUTED}` } };
  ws.getCell(grand, 9).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${HEADER_BG}` } };
  ws.getCell(grand, 12).value = Number(totals.all || 0);
  ws.getCell(grand, 12).numFmt = '"$"#,##0.00';
  ws.getCell(grand, 12).font = { bold: true, size: 11, color: { argb: `FF${INK}` } };
  ws.getCell(grand, 12).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${HEADER_BG}` } };

  ws.columns = [
    { width: 8 },
    { width: 12 },
    { width: 12 },
    { width: 18 },
    { width: 12 },
    { width: 10 },
    { width: 16 },
    { width: 2 },
    { width: 8 },
    { width: 12 },
    { width: 12 },
    { width: 12 },
    { width: 10 },
    { width: 16 },
  ];

  return wb;
}

export async function buildBuildReviewWorkbook(
  date: string,
  items: BuildExportRow[]
): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Fuel Order — Clerk';
  wb.created = new Date();
  const ws = wb.addWorksheet('Build review');

  ws.mergeCells('A1:J1');
  ws.getCell('A1').value = `BUILD REVIEW — ${fmtDate(date)}`;
  ws.getCell('A1').font = { bold: true, size: 14, color: { argb: `FF${INK}` } };
  ws.getCell('A1').alignment = { vertical: 'middle', horizontal: 'left' };
  ws.getRow(1).height = 24;

  ws.mergeCells('A2:J2');
  ws.getCell('A2').value = 'STAGING — CONFIRM TO DAY SHEET';
  ws.getCell('A2').font = { size: 10, color: { argb: `FF${MUTED}` } };

  const headers = [
    'S/N',
    'Source',
    'Truck No.',
    'Name',
    'Passport due',
    'Position',
    'Overstay',
    'Visa',
    'Overstay $',
    'Visa $',
  ];
  headers.forEach((h, i) => {
    const cell = ws.getCell(3, i + 1);
    cell.value = h;
    cell.font = { bold: true, color: { argb: `FF${INK}` }, size: 10 };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${HEADER_BG}` } };
    cell.alignment = { horizontal: 'center' };
    cell.border = thinBorder();
  });

  items.forEach((item, i) => {
    const r = 4 + i;
    const vals: (string | number)[] = [
      i + 1,
      SOURCE_LABEL[item.source || ''] || item.source || '',
      item.truckNo,
      item.driverName,
      item.passportDueDate ? fmtDate(item.passportDueDate) : '',
      item.position || '',
      item.includeOverstay ? 'Yes' : 'No',
      item.includeVisa ? 'Yes' : 'No',
      item.includeOverstay ? Number(item.overstayAmount || 0) : '',
      item.includeVisa ? Number(item.visaAmount || 0) : '',
    ];
    vals.forEach((v, c) => {
      const cell = ws.getCell(r, c + 1);
      cell.value = v;
      cell.font = { size: 10, bold: c === 2 };
      cell.border = thinBorder();
      cell.alignment = { horizontal: c === 3 || c === 5 ? 'left' : 'center' };
      if ((c === 8 || c === 9) && typeof v === 'number') cell.numFmt = '"$"#,##0.00';
    });
  });

  ws.columns = [
    { width: 6 },
    { width: 12 },
    { width: 12 },
    { width: 18 },
    { width: 14 },
    { width: 16 },
    { width: 10 },
    { width: 8 },
    { width: 11 },
    { width: 9 },
  ];
  return wb;
}

function pdfToBuffer(doc: PDFKit.PDFDocument): Promise<{ buffer: Buffer; pages: number }> {
  const pages = Math.max(1, doc.bufferedPageRange().count);
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve({ buffer: Buffer.concat(chunks), pages }));
    doc.on('error', reject);
    doc.end();
  });
}

/** Image = single PDF page only. PDF allowed up to this many pages. */
export const EXPORT_PAGE_LIMITS = {
  imageMaxPages: 1,
  pdfMaxPages: 8,
} as const;

/** Rough landscape LPO capacity (header + signatures + totals). */
export function estimateDaySheetPages(rowCount: number): number {
  const rowsPerPage = 18;
  return Math.max(1, Math.ceil(Math.max(rowCount, 1) / rowsPerPage));
}

export function estimateBuildReviewPages(itemCount: number): number {
  const rowsPerPage = 22;
  return Math.max(1, Math.ceil(Math.max(itemCount, 1) / rowsPerPage));
}

function assertExportPagesAllowed(kind: 'pdf' | 'png', pages: number) {
  if (kind === 'png' && pages > EXPORT_PAGE_LIMITS.imageMaxPages) {
    const err: any = new Error(
      `Image export is only for single-page sheets (${pages} pages needed). Download PDF instead.`
    );
    err.statusCode = 400;
    throw err;
  }
  if (kind === 'pdf' && pages > EXPORT_PAGE_LIMITS.pdfMaxPages) {
    const err: any = new Error(
      `PDF export is limited to ${EXPORT_PAGE_LIMITS.pdfMaxPages} pages (this needs ${pages}). Reduce rows or split by date.`
    );
    err.statusCode = 400;
    throw err;
  }
}

const GRAY = {
  ink: '#000000',
  text: '#111111',
  muted: '#666666',
  line: '#000000',
  softLine: '#CCCCCC',
  headerBg: '#F0F0F0',
  totalBg: '#F0F0F0',
  border: '#000000',
};

/** Shared LPO-like document header (title left, date right, thick rules). */
function drawLpoHeader(
  doc: PDFKit.PDFDocument,
  opts: {
    margin: number;
    pageW: number;
    title: string;
    subtitle: string;
    rightLines: string[];
    metaLeft?: string;
    metaRight?: string;
    instruction?: string;
  }
): number {
  const { margin, pageW, title, subtitle, rightLines } = opts;
  const right = pageW - margin;
  let y = 36;

  doc.fillColor(GRAY.ink).font('Helvetica-Bold').fontSize(18);
  doc.text(title, margin, y, { lineBreak: false });
  doc.font('Helvetica-Bold').fontSize(11);
  rightLines.forEach((line, i) => {
    doc.text(line, margin, y + i * 14, { width: right - margin, align: 'right', lineBreak: false });
  });

  y += 22;
  doc.font('Helvetica').fontSize(10).fillColor(GRAY.text);
  doc.text(subtitle, margin, y);

  y += Math.max(18, rightLines.length * 14 - 4);
  doc.save();
  doc.lineWidth(2.2).strokeColor(GRAY.line);
  doc.moveTo(margin, y).lineTo(right, y).stroke();
  doc.restore();

  y += 10;
  if (opts.metaLeft || opts.metaRight) {
    doc.font('Helvetica').fontSize(10).fillColor(GRAY.text);
    if (opts.metaLeft) {
      // Support "Label: **Value**" style — bold after colon
      const parts = opts.metaLeft.split(':');
      if (parts.length >= 2) {
        doc.font('Helvetica').text(`${parts[0]}: `, margin, y, { continued: true, lineBreak: false });
        doc.font('Helvetica-Bold').text(parts.slice(1).join(':').trim(), { lineBreak: false });
      } else {
        doc.text(opts.metaLeft, margin, y, { lineBreak: false });
      }
    }
    if (opts.metaRight) {
      doc.font('Helvetica').text(opts.metaRight, margin, y, {
        width: right - margin,
        align: 'right',
        lineBreak: false,
      });
    }
    y += 16;
    doc.save();
    doc.lineWidth(2.2).strokeColor(GRAY.line);
    doc.moveTo(margin, y).lineTo(right, y).stroke();
    doc.restore();
    y += 10;
  }

  if (opts.instruction) {
    doc.save();
    doc.lineWidth(0.6).strokeColor(GRAY.softLine);
    doc.moveTo(margin, y).lineTo(right, y).stroke();
    doc.restore();
    y += 8;
    doc.font('Helvetica-Bold').fontSize(9).fillColor(GRAY.ink);
    doc.text(opts.instruction, margin, y);
    y += 16;
    doc.save();
    doc.lineWidth(2.2).strokeColor(GRAY.line);
    doc.moveTo(margin, y).lineTo(right, y).stroke();
    doc.restore();
    y += 10;
  }

  return y;
}

/** Prepared / Approved / Received — LPO signature row. */
function drawLpoSignatures(
  doc: PDFKit.PDFDocument,
  opts: { margin: number; pageW: number; y: number; preparedBy?: string }
): number {
  const { margin, pageW } = opts;
  const right = pageW - margin;
  const colW = (right - margin) / 3;
  let y = opts.y;

  const cols = [
    { title: 'Prepared By', line: opts.preparedBy || '', hint: 'Signature' },
    { title: 'Approved By', line: '', hint: 'Name & Signature' },
    { title: 'Received By', line: '', hint: 'Station Attendant' },
  ];

  cols.forEach((c, i) => {
    const x = margin + colW * i + (i === 0 ? 0 : 8);
    const w = colW - 12;
    doc.save();
    doc.lineWidth(1.6).strokeColor(GRAY.line);
    doc.moveTo(x, y).lineTo(x + w, y).stroke();
    doc.restore();
    doc.fillColor(GRAY.ink).font('Helvetica-Bold').fontSize(9);
    doc.text(c.title, x, y + 6, { width: w });
    if (c.line) {
      doc.font('Helvetica').fontSize(9).fillColor(GRAY.text);
      doc.text(c.line, x, y + 20, { width: w });
    }
    doc.font('Helvetica').fontSize(8).fillColor(GRAY.muted);
    doc.text(c.hint, x, y + (c.line ? 34 : 22), { width: w });
  });

  return y + 48;
}

function drawGrayTable(
  doc: PDFKit.PDFDocument,
  opts: {
    x: number;
    y: number;
    width: number;
    headers: string[];
    weights: number[];
    rows: string[][];
    footer?: { label: string; values: (string | null)[] };
    maxY?: number;
  }
): number {
  const { x, width, headers, weights, rows } = opts;
  const maxY = opts.maxY ?? doc.page.height - 70;
  const tw = weights.reduce((a, b) => a + b, 0);
  const widths = weights.map((w) => (w / tw) * width);
  const rowH = 15;
  let cy = opts.y;

  // Header
  doc.rect(x, cy, width, rowH).fill(GRAY.headerBg);
  doc.strokeColor(GRAY.border).lineWidth(0.7).rect(x, cy, width, rowH).stroke();
  let cx = x;
  doc.fillColor(GRAY.ink).font('Helvetica-Bold').fontSize(7.5);
  headers.forEach((h, i) => {
    doc.text(h.toUpperCase(), cx + 2, cy + 4, { width: widths[i] - 4, align: 'center' });
    if (i < headers.length - 1) {
      doc
        .moveTo(cx + widths[i], cy)
        .lineTo(cx + widths[i], cy + rowH)
        .stroke();
    }
    cx += widths[i];
  });
  cy += rowH;

  rows.forEach((cols) => {
    if (cy + rowH > maxY) return;
    doc.strokeColor(GRAY.border).lineWidth(0.5).rect(x, cy, width, rowH).stroke();
    cx = x;
    cols.forEach((val, i) => {
      doc
        .fillColor(GRAY.text)
        .font(i === 2 ? 'Helvetica-Bold' : 'Helvetica')
        .fontSize(8);
      doc.text(val, cx + 2, cy + 3.5, {
        width: widths[i] - 4,
        align: i === 3 || i === cols.length - 1 ? 'left' : 'center',
      });
      if (i < cols.length - 1) {
        doc
          .moveTo(cx + widths[i], cy)
          .lineTo(cx + widths[i], cy + rowH)
          .stroke();
      }
      cx += widths[i];
    });
    cy += rowH;
  });

  if (opts.footer) {
    doc.rect(x, cy, width, rowH).fill(GRAY.totalBg);
    doc.strokeColor(GRAY.border).lineWidth(0.7).rect(x, cy, width, rowH).stroke();
    cx = x;
    opts.footer.values.forEach((val, i) => {
      const label = i === 0 ? opts.footer!.label : val || '';
      doc.fillColor(GRAY.ink).font('Helvetica-Bold').fontSize(8);
      doc.text(label, cx + 2, cy + 3.5, {
        width: widths[i] - 4,
        align: i === 0 ? 'right' : 'center',
      });
      if (i < opts.footer!.values.length - 1) {
        doc
          .moveTo(cx + widths[i], cy)
          .lineTo(cx + widths[i], cy + rowH)
          .stroke();
      }
      cx += widths[i];
    });
    cy += rowH;
  }

  return cy;
}

/** Landscape PDF — overstay + visa panels (LPO grayscale style). */
async function renderDaySheetPdf(
  date: string,
  rows: DayExportRow[],
  totals: DayTotals
): Promise<{ buffer: Buffer; pages: number }> {
  const doc = new PDFDocument({
    size: 'A4',
    layout: 'landscape',
    margin: 32,
    info: {
      Title: `Visas & Overstays — ${date}`,
      Author: 'Fuel Order System',
    },
  });

  const pageW = doc.page.width;
  const margin = 32;
  const gap = 16;
  const usable = pageW - margin * 2 - gap;
  const leftW = usable * 0.56;
  const rightW = usable * 0.44;
  const leftX = margin;
  const rightX = margin + leftW + gap;

  const active = activeRows(rows);
  const visaRows = active.filter((r) => r.visaAmount != null);

  let y = drawLpoHeader(doc, {
    margin,
    pageW,
    title: 'VISAS & OVERSTAYS',
    subtitle: 'DAILY DISBURSEMENT',
    rightLines: [`Date: ${fmtDate(date)}`],
    metaLeft: `Trucks: ${active.length}`,
    metaRight: 'Order of: Clerk portal',
    instruction: 'KINDLY DISBURSE THE FOLLOWING',
  });

  doc.font('Helvetica-Bold').fontSize(9).fillColor(GRAY.ink);
  doc.text('OVERSTAY', leftX, y);
  doc.text('VISA', rightX, y);
  y += 12;

  const overstayData = active.map((r, i) => [
    String(i + 1),
    fmtDate(date),
    r.truckNo,
    r.driverName || '',
    r.overstayLabel || 'OVERSTAY',
    money(r.overstayAmount),
    r.position || '',
  ]);
  const visaData = visaRows.map((r, i) => [
    String(i + 1),
    fmtDate(date),
    r.truckNo,
    'VISA',
    money(r.visaAmount),
    r.position || '',
  ]);

  drawGrayTable(doc, {
    x: leftX,
    y,
    width: leftW,
    headers: ['S/No.', 'Date', 'Truck No.', 'Name', 'Particular', 'Amount', 'Position'],
    weights: [0.6, 1.1, 1.2, 1.7, 1.2, 1, 1.4],
    rows: overstayData,
    footer: {
      label: 'TOTAL',
      values: ['TOTAL', null, null, null, null, money(totals.overstay), null],
    },
    maxY: doc.page.height - 140,
  });

  drawGrayTable(doc, {
    x: rightX,
    y,
    width: rightW,
    headers: ['S/No.', 'Date', 'Truck No.', 'Particular', 'Amount', 'Position'],
    weights: [0.6, 1.1, 1.3, 1.1, 1, 1.4],
    rows: visaData,
    footer: {
      label: 'TOTAL',
      values: ['TOTAL', null, null, null, money(totals.visa), null],
    },
    maxY: doc.page.height - 140,
  });

  // Signatures (LPO-style) then totals bar
  const sigY = doc.page.height - 118;
  drawLpoSignatures(doc, { margin, pageW, y: sigY });

  const footY = doc.page.height - 58;
  const barW = pageW - margin * 2;
  const colW = barW / 3;
  doc.rect(margin, footY, barW, 28).fill(GRAY.headerBg);
  doc.strokeColor(GRAY.border).lineWidth(1).rect(margin, footY, barW, 28).stroke();

  const blocks = [
    { label: 'OVERSTAY TOTAL', value: money(totals.overstay) },
    { label: 'VISA TOTAL', value: money(totals.visa) },
    { label: 'GRAND TOTAL', value: money(totals.all) },
  ];
  blocks.forEach((b, i) => {
    const bx = margin + colW * i;
    doc.fillColor(GRAY.muted).font('Helvetica').fontSize(7);
    doc.text(b.label, bx + 8, footY + 4, { width: colW - 16 });
    doc.fillColor(GRAY.ink).font('Helvetica-Bold').fontSize(11);
    doc.text(b.value, bx + 8, footY + 13, { width: colW - 16 });
    if (i < 2) {
      doc
        .moveTo(bx + colW, footY)
        .lineTo(bx + colW, footY + 28)
        .stroke();
    }
  });

  doc.fillColor(GRAY.muted).font('Helvetica').fontSize(7);
  doc.text(
    'This is a computer-generated document. No signature is required. For any queries, please contact the logistics department.',
    margin,
    doc.page.height - 22,
    { width: barW }
  );

  const result = await pdfToBuffer(doc);
  const pages = Math.max(result.pages, estimateDaySheetPages(active.length));
  return { buffer: result.buffer, pages };
}

export async function buildDaySheetPdfBuffer(
  date: string,
  rows: DayExportRow[],
  totals: DayTotals
): Promise<Buffer> {
  const { buffer, pages } = await renderDaySheetPdf(date, rows, totals);
  assertExportPagesAllowed('pdf', pages);
  return buffer;
}

async function renderBuildReviewPdf(
  date: string,
  items: BuildExportRow[]
): Promise<{ buffer: Buffer; pages: number }> {
  const doc = new PDFDocument({
    size: 'A4',
    layout: 'landscape',
    margin: 32,
    info: { Title: `Build Review — ${date}`, Author: 'Fuel Order System' },
  });

  const pageW = doc.page.width;
  const margin = 32;
  const totalW = pageW - margin * 2;

  let y = drawLpoHeader(doc, {
    margin,
    pageW,
    title: 'BUILD REVIEW',
    subtitle: 'STAGING — CONFIRM TO DAY SHEET',
    rightLines: [`Date: ${fmtDate(date)}`],
    metaLeft: `Trucks: ${items.length}`,
    metaRight: 'Order of: Clerk portal',
    instruction: 'PENDING BUILD PREVIEW ROWS',
  });

  const headers = ['S/N', 'Source', 'Truck No.', 'Name', 'Passport due', 'Position', 'Overstay', 'Visa'];
  const weights = [0.55, 1.1, 1.15, 1.7, 1.2, 1.4, 0.95, 0.95];
  const tw = weights.reduce((a, b) => a + b, 0);
  const widths = weights.map((w) => (w / tw) * totalW);
  const rowH = 15;

  doc.rect(margin, y, totalW, rowH).fill(GRAY.headerBg);
  doc.strokeColor(GRAY.border).lineWidth(0.7).rect(margin, y, totalW, rowH).stroke();
  let x = margin;
  doc.fillColor(GRAY.ink).font('Helvetica-Bold').fontSize(7.5);
  headers.forEach((h, i) => {
    doc.text(h.toUpperCase(), x + 2, y + 4, { width: widths[i] - 4, align: 'center' });
    if (i < headers.length - 1) {
      doc
        .moveTo(x + widths[i], y)
        .lineTo(x + widths[i], y + rowH)
        .stroke();
    }
    x += widths[i];
  });
  y += rowH;

  items.forEach((item, ri) => {
    if (y > doc.page.height - 78) {
      doc.addPage();
      y = 40;
    }
    doc.strokeColor(GRAY.border).lineWidth(0.5).rect(margin, y, totalW, rowH).stroke();
    const cols = [
      String(ri + 1),
      SOURCE_LABEL[item.source || ''] || item.source || '',
      item.truckNo,
      item.driverName || '',
      item.passportDueDate ? fmtDate(item.passportDueDate) : '—',
      item.position || '—',
      item.includeOverstay ? money(item.overstayAmount) : '—',
      item.includeVisa ? money(item.visaAmount) : '—',
    ];
    x = margin;
    cols.forEach((val, i) => {
      doc
        .fillColor(GRAY.text)
        .font(i === 2 ? 'Helvetica-Bold' : 'Helvetica')
        .fontSize(8);
      doc.text(val, x + 2, y + 3.5, {
        width: widths[i] - 4,
        align: i === 3 || i === 5 ? 'left' : 'center',
      });
      if (i < cols.length - 1) {
        doc
          .moveTo(x + widths[i], y)
          .lineTo(x + widths[i], y + rowH)
          .stroke();
      }
      x += widths[i];
    });
    y += rowH;
  });

  const overstayTotal = items.reduce(
    (s, i) => s + (i.includeOverstay ? Number(i.overstayAmount || 0) : 0),
    0
  );
  const visaTotal = items.reduce(
    (s, i) => s + (i.includeVisa ? Number(i.visaAmount || 0) : 0),
    0
  );
  const grand = overstayTotal + visaTotal;

  const footY = Math.min(y + 14, doc.page.height - 58);
  const colW = totalW / 3;
  doc.rect(margin, footY, totalW, 28).fill(GRAY.headerBg);
  doc.strokeColor(GRAY.border).lineWidth(1).rect(margin, footY, totalW, 28).stroke();
  [
    { label: 'OVERSTAY TOTAL', value: money(overstayTotal) },
    { label: 'VISA TOTAL', value: money(visaTotal) },
    { label: 'GRAND TOTAL', value: money(grand) },
  ].forEach((b, i) => {
    const bx = margin + colW * i;
    doc.fillColor(GRAY.muted).font('Helvetica').fontSize(7);
    doc.text(b.label, bx + 8, footY + 4, { width: colW - 16 });
    doc.fillColor(GRAY.ink).font('Helvetica-Bold').fontSize(11);
    doc.text(b.value, bx + 8, footY + 13, { width: colW - 16 });
    if (i < 2) {
      doc
        .moveTo(bx + colW, footY)
        .lineTo(bx + colW, footY + 28)
        .stroke();
    }
  });

  doc.fillColor(GRAY.muted).font('Helvetica').fontSize(7);
  doc.text(
    'This is a computer-generated document. No signature is required.',
    margin,
    doc.page.height - 22,
    { width: totalW }
  );

  const result = await pdfToBuffer(doc);
  const pages = Math.max(result.pages, estimateBuildReviewPages(items.length));
  return { buffer: result.buffer, pages };
}

export async function buildBuildReviewPdfBuffer(
  date: string,
  items: BuildExportRow[]
): Promise<Buffer> {
  const { buffer, pages } = await renderBuildReviewPdf(date, items);
  assertExportPagesAllowed('pdf', pages);
  return buffer;
}

function esc(s: string) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Full HTML used for Puppeteer PNG raster — LPO grayscale style. */
export function buildDaySheetHtml(
  date: string,
  rows: DayExportRow[],
  totals: DayTotals
): string {
  const active = activeRows(rows);
  const visaRows = active.filter((r) => r.visaAmount != null);
  const overstayBody = active
    .map(
      (r, i) => `
    <tr>
      <td>${i + 1}</td>
      <td>${esc(fmtDate(date))}</td>
      <td class="truck">${esc(r.truckNo)}</td>
      <td class="left">${esc(r.driverName || '')}</td>
      <td>${esc(r.overstayLabel || 'OVERSTAY')}</td>
      <td class="amt">${esc(money(r.overstayAmount))}</td>
      <td class="left">${esc(r.position || '')}</td>
    </tr>`
    )
    .join('');
  const visaBody = visaRows
    .map(
      (r, i) => `
    <tr>
      <td>${i + 1}</td>
      <td>${esc(fmtDate(date))}</td>
      <td class="truck">${esc(r.truckNo)}</td>
      <td>VISA</td>
      <td class="amt">${esc(money(r.visaAmount))}</td>
      <td class="left">${esc(r.position || '')}</td>
    </tr>`
    )
    .join('');

  return `<!DOCTYPE html><html><head><meta charset="utf-8"/>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:Helvetica,Arial,sans-serif;background:#fff;color:#111;padding:28px}
  .sheet{background:#fff;width:1344px}
  .hdr{display:flex;justify-content:space-between;align-items:flex-start}
  .hdr h1{font-size:22px;font-weight:700;letter-spacing:.02em}
  .hdr .sub{font-size:11px;margin-top:4px;font-weight:400}
  .hdr .right{text-align:right;font-size:12px;font-weight:700}
  .rule{height:2.5px;background:#000;margin:12px 0 10px}
  .rule-thin{height:1px;background:#ccc;margin:8px 0}
  .meta{display:flex;justify-content:space-between;font-size:11px;margin-bottom:2px}
  .instr{font-size:10px;font-weight:700;letter-spacing:.04em;margin:8px 0}
  .grid{display:grid;grid-template-columns:1.15fr 1fr;gap:18px;margin-top:8px}
  .panel h2{font-size:11px;font-weight:700;margin-bottom:6px;letter-spacing:.06em}
  table{width:100%;border-collapse:collapse;font-size:11px;border:1px solid #000}
  th{padding:7px 5px;background:#F0F0F0;border:1px solid #000;font-weight:700;text-transform:uppercase;font-size:10px}
  td{padding:6px 5px;border:1px solid #000;text-align:center}
  td.left{text-align:left}
  td.truck{font-weight:700}
  tr.total td{background:#F0F0F0;font-weight:700}
  .totals{margin-top:16px;border:1px solid #000;display:grid;grid-template-columns:1fr 1fr 1fr}
  .totals > div{padding:10px 12px;border-right:1px solid #000;background:#F0F0F0}
  .totals > div:last-child{border-right:none}
  .totals .label{font-size:9px;color:#666;letter-spacing:.06em;text-transform:uppercase;margin-bottom:3px}
  .totals .val{font-size:15px;font-weight:700;color:#000}
  .sigs{display:grid;grid-template-columns:1fr 1fr 1fr;gap:24px;margin-top:22px}
  .sigs .col{border-top:2px solid #000;padding-top:8px}
  .sigs .ttl{font-size:11px;font-weight:700;margin-bottom:4px}
  .sigs .hint{font-size:10px;color:#888;margin-top:18px}
  .foot{margin-top:14px;padding-top:8px;border-top:1px solid #ccc;font-size:9px;color:#888}
</style></head><body>
  <div class="sheet" id="export-root">
    <div class="hdr">
      <div>
        <h1>VISAS &amp; OVERSTAYS</h1>
        <div class="sub">DAILY DISBURSEMENT</div>
      </div>
      <div class="right">Date: ${esc(fmtDate(date))}</div>
    </div>
    <div class="rule"></div>
    <div class="meta">
      <div>Trucks: <strong>${active.length}</strong></div>
      <div>Order of: Clerk portal</div>
    </div>
    <div class="rule"></div>
    <div class="rule-thin"></div>
    <div class="instr">KINDLY DISBURSE THE FOLLOWING</div>
    <div class="rule"></div>
    <div class="grid">
      <div class="panel">
        <h2>OVERSTAY</h2>
        <table>
          <thead><tr><th>S/No.</th><th>Date</th><th>Truck No.</th><th>Name</th><th>Particular</th><th>Amount</th><th>Position</th></tr></thead>
          <tbody>
            ${overstayBody || '<tr><td colspan="7">—</td></tr>'}
            <tr class="total"><td colspan="5" style="text-align:right">TOTAL</td><td>${esc(money(totals.overstay))}</td><td></td></tr>
          </tbody>
        </table>
      </div>
      <div class="panel">
        <h2>VISA</h2>
        <table>
          <thead><tr><th>S/No.</th><th>Date</th><th>Truck No.</th><th>Particular</th><th>Amount</th><th>Position</th></tr></thead>
          <tbody>
            ${visaBody || '<tr><td colspan="6">—</td></tr>'}
            <tr class="total"><td colspan="4" style="text-align:right">TOTAL</td><td>${esc(money(totals.visa))}</td><td></td></tr>
          </tbody>
        </table>
      </div>
    </div>
    <div class="sigs">
      <div class="col"><div class="ttl">Prepared By</div><div class="hint">Signature</div></div>
      <div class="col"><div class="ttl">Approved By</div><div class="hint">Name &amp; Signature</div></div>
      <div class="col"><div class="ttl">Received By</div><div class="hint">Station Attendant</div></div>
    </div>
    <div class="totals">
      <div><div class="label">Overstay total</div><div class="val">${esc(money(totals.overstay))}</div></div>
      <div><div class="label">Visa total</div><div class="val">${esc(money(totals.visa))}</div></div>
      <div><div class="label">Grand total</div><div class="val">${esc(money(totals.all))}</div></div>
    </div>
    <div class="foot">This is a computer-generated document. No signature is required.<br/>For any queries, please contact the logistics department.</div>
  </div>
</body></html>`;
}

export function buildBuildReviewHtml(date: string, items: BuildExportRow[]): string {
  const overstayTotal = items.reduce(
    (s, i) => s + (i.includeOverstay ? Number(i.overstayAmount || 0) : 0),
    0
  );
  const visaTotal = items.reduce(
    (s, i) => s + (i.includeVisa ? Number(i.visaAmount || 0) : 0),
    0
  );
  const grand = overstayTotal + visaTotal;
  const body = items
    .map((item, i) => {
      const src = SOURCE_LABEL[item.source || ''] || item.source || '';
      return `<tr>
        <td>${i + 1}</td>
        <td>${esc(src)}</td>
        <td class="truck">${esc(item.truckNo)}</td>
        <td class="left">${esc(item.driverName)}</td>
        <td>${esc(item.passportDueDate ? fmtDate(item.passportDueDate) : '—')}</td>
        <td class="left">${esc(item.position || '—')}</td>
        <td>${item.includeOverstay ? esc(money(item.overstayAmount)) : '—'}</td>
        <td>${item.includeVisa ? esc(money(item.visaAmount)) : '—'}</td>
      </tr>`;
    })
    .join('');

  return `<!DOCTYPE html><html><head><meta charset="utf-8"/>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:Helvetica,Arial,sans-serif;background:#fff;color:#111;padding:28px}
  .sheet{background:#fff;width:1144px}
  .hdr{display:flex;justify-content:space-between;align-items:flex-start}
  .hdr h1{font-size:22px;font-weight:700}
  .hdr .sub{font-size:11px;margin-top:4px}
  .hdr .right{text-align:right;font-size:12px;font-weight:700}
  .rule{height:2.5px;background:#000;margin:12px 0 10px}
  .rule-thin{height:1px;background:#ccc;margin:8px 0}
  .meta{display:flex;justify-content:space-between;font-size:11px}
  .instr{font-size:10px;font-weight:700;letter-spacing:.04em;margin:8px 0}
  table{width:100%;border-collapse:collapse;font-size:11px;border:1px solid #000;margin-top:4px}
  th{padding:7px 5px;background:#F0F0F0;border:1px solid #000;font-weight:700;text-transform:uppercase;font-size:10px}
  td{padding:6px 5px;border:1px solid #000;text-align:center}
  td.left{text-align:left}
  td.truck{font-weight:700}
  .totals{margin-top:16px;border:1px solid #000;display:grid;grid-template-columns:1fr 1fr 1fr}
  .totals > div{padding:10px 12px;border-right:1px solid #000;background:#F0F0F0}
  .totals > div:last-child{border-right:none}
  .totals .label{font-size:9px;color:#666;letter-spacing:.06em;text-transform:uppercase;margin-bottom:3px}
  .totals .val{font-size:15px;font-weight:700}
  .sigs{display:grid;grid-template-columns:1fr 1fr 1fr;gap:24px;margin-top:22px}
  .sigs .col{border-top:2px solid #000;padding-top:8px}
  .sigs .ttl{font-size:11px;font-weight:700}
  .sigs .hint{font-size:10px;color:#888;margin-top:18px}
  .foot{margin-top:14px;padding-top:8px;border-top:1px solid #ccc;font-size:9px;color:#888}
</style></head><body>
  <div class="sheet" id="export-root">
    <div class="hdr">
      <div>
        <h1>BUILD REVIEW</h1>
        <div class="sub">STAGING — CONFIRM TO DAY SHEET</div>
      </div>
      <div class="right">Date: ${esc(fmtDate(date))}</div>
    </div>
    <div class="rule"></div>
    <div class="meta">
      <div>Trucks: <strong>${items.length}</strong></div>
      <div>Order of: Clerk portal</div>
    </div>
    <div class="rule"></div>
    <div class="rule-thin"></div>
    <div class="instr">PENDING BUILD PREVIEW ROWS</div>
    <div class="rule"></div>
    <table>
      <thead><tr><th>S/N</th><th>Source</th><th>Truck No.</th><th>Name</th><th>Passport due</th><th>Position</th><th>Overstay</th><th>Visa</th></tr></thead>
      <tbody>${body || '<tr><td colspan="8">No pending items</td></tr>'}</tbody>
    </table>
    <div class="sigs">
      <div class="col"><div class="ttl">Prepared By</div><div class="hint">Signature</div></div>
      <div class="col"><div class="ttl">Approved By</div><div class="hint">Name &amp; Signature</div></div>
      <div class="col"><div class="ttl">Received By</div><div class="hint">Station Attendant</div></div>
    </div>
    <div class="totals">
      <div><div class="label">Overstay total</div><div class="val">${esc(money(overstayTotal))}</div></div>
      <div><div class="label">Visa total</div><div class="val">${esc(money(visaTotal))}</div></div>
      <div><div class="label">Grand total</div><div class="val">${esc(money(grand))}</div></div>
    </div>
    <div class="foot">This is a computer-generated document. No signature is required.<br/>For any queries, please contact the logistics department.</div>
  </div>
</body></html>`;
}

let browserPromise: Promise<import('puppeteer').Browser> | null = null;

function resolveChromeExecutable(): string | undefined {
  if (process.env.PUPPETEER_EXECUTABLE_PATH) return process.env.PUPPETEER_EXECUTABLE_PATH;
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;

  const home = os.homedir();
  const tryBundledChrome = (chromeRoot: string): string | undefined => {
    try {
      if (!fs.existsSync(chromeRoot)) return undefined;
      const versions = fs
        .readdirSync(chromeRoot)
        .filter((d) => d.startsWith('win64-') || d.startsWith('linux-') || d.startsWith('mac-'));
      versions.sort().reverse();
      for (const ver of versions) {
        const win = path.join(chromeRoot, ver, 'chrome-win64', 'chrome.exe');
        if (fs.existsSync(win)) return win;
        const linux = path.join(chromeRoot, ver, 'chrome-linux64', 'chrome');
        if (fs.existsSync(linux)) return linux;
      }
    } catch {
      /* ignore */
    }
    return undefined;
  };

  const fromCache =
    tryBundledChrome(path.join(home, '.cache', 'puppeteer', 'chrome')) ||
    (process.env.PUPPETEER_CACHE_DIR
      ? tryBundledChrome(path.join(process.env.PUPPETEER_CACHE_DIR, 'chrome'))
      : undefined);
  if (fromCache) return fromCache;

  // Ubuntu / Debian / Alpine system browsers (production servers)
  const systemLinux = [
    '/usr/bin/chromium-browser',
    '/usr/bin/chromium',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/google-chrome',
    '/snap/bin/chromium',
  ];
  for (const exe of systemLinux) {
    if (fs.existsSync(exe)) return exe;
  }

  // Windows desktop Chrome / Edge
  const systemWin = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  ];
  for (const exe of systemWin) {
    if (fs.existsSync(exe)) return exe;
  }
  return undefined;
}

async function getBrowser() {
  if (!browserPromise) {
    browserPromise = (async () => {
      const puppeteer = await import('puppeteer');
      let executablePath = resolveChromeExecutable();
      // Fall back to Puppeteer's resolved bundled path when cache is configured
      if (!executablePath) {
        try {
          const resolved = puppeteer.default.executablePath();
          executablePath = typeof resolved === 'string' ? resolved : await resolved;
        } catch {
          /* none */
        }
      }
      if (!executablePath) {
        throw new Error(
          'Chrome/Chromium not found for PNG export. On Ubuntu run: npx puppeteer browsers install chrome  OR  apt install chromium-browser and set PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser'
        );
      }
      return puppeteer.default.launch({
        headless: true,
        executablePath,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--font-render-hinting=none',
          '--disable-gpu',
        ],
      });
    })().catch((err) => {
      browserPromise = null;
      throw err;
    });
  }
  return browserPromise;
}

/**
 * Rasterize styled HTML → high-DPI PNG via Puppeteer, then sharpen/compress with Sharp.
 *
 * Scale = deviceScaleFactor (default 2 → 2× retina). Day sheet CSS width is ~1344px,
 * so PNG is ~2688px wide at scale 2. Viewport height is measured from #export-root
 * so tall tables are not cropped.
 */
export async function htmlToPngBuffer(
  html: string,
  opts?: { width?: number; scale?: number }
): Promise<Buffer> {
  const width = opts?.width ?? 1400;
  const scale = opts?.scale ?? 2;
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    // Tall starter viewport so layout can measure full height (element screenshots
    // are clipped to the viewport — a short height crops the bottom).
    await page.setViewport({
      width,
      height: 2400,
      deviceScaleFactor: scale,
    });
    await page.setContent(html, { waitUntil: 'load', timeout: 60000 });
    await page.evaluate(`(async () => {
      if (document.fonts && document.fonts.ready) await document.fonts.ready;
    })()`);

    const size = await page.evaluate(`(() => {
      const el = document.getElementById('export-root') || document.body;
      const r = el.getBoundingClientRect();
      const padBottom = 24;
      return {
        width: Math.ceil(Math.max(r.right, document.documentElement.scrollWidth, ${width})),
        height: Math.ceil(Math.max(r.bottom + padBottom, el.scrollHeight + padBottom, 400)),
      };
    })()`) as { width: number; height: number };

    await page.setViewport({
      width: Math.max(width, size.width),
      height: size.height,
      deviceScaleFactor: scale,
    });
    // Brief settle after resize so layout matches the new viewport
    await page.evaluate(
      `new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))`
    );

    const root = await page.$('#export-root');
    const raw = root
      ? await root.screenshot({ type: 'png', omitBackground: false, captureBeyondViewport: true })
      : await page.screenshot({ type: 'png', fullPage: true, captureBeyondViewport: true });

    const sharpMod = await import('sharp');
    const sharp = sharpMod.default;
    return await sharp(Buffer.from(raw))
      .png({
        compressionLevel: 8,
        adaptiveFiltering: true,
      })
      .sharpen({ sigma: 0.55 })
      .toBuffer();
  } finally {
    await page.close().catch(() => undefined);
  }
}

/**
 * Rasterize a PDF buffer to PNG via Puppeteer + PDF.js (pixel-identical to the PDF page).
 * Only the first page is rendered — callers must enforce single-page.
 */
async function rasterizePdfPageToPng(
  pdfBuffer: Buffer,
  opts?: { scale?: number }
): Promise<Buffer> {
  const scale = opts?.scale ?? 2.5;
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    const cdn = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174';
    await page.setContent(
      `<!DOCTYPE html><html><head>
        <meta charset="utf-8"/>
        <style>html,body{margin:0;padding:0;background:#fff}</style>
        <script src="${cdn}/pdf.min.js"></script>
      </head><body>
        <canvas id="c"></canvas>
        <script>pdfjsLib.GlobalWorkerOptions.workerSrc='${cdn}/pdf.worker.min.js';</script>
      </body></html>`,
      { waitUntil: 'load', timeout: 60000 }
    );

    const dataUrl = (await page.evaluate(
      async (b64, renderScale) => {
        const g = globalThis as any;
        const lib = g.pdfjsLib;
        if (!lib) throw new Error('PDF.js failed to load');
        const raw = g.atob(b64);
        const bytes = new Uint8Array(raw.length);
        for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
        const pdf = await lib.getDocument({ data: bytes }).promise;
        const pg = await pdf.getPage(1);
        const viewport = pg.getViewport({ scale: renderScale });
        const canvas = g.document.getElementById('c');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('Canvas unavailable');
        await pg.render({ canvasContext: ctx, viewport }).promise;
        return canvas.toDataURL('image/png');
      },
      pdfBuffer.toString('base64'),
      scale
    )) as string;

    const base64 = dataUrl.replace(/^data:image\/png;base64,/, '');
    const raw = Buffer.from(base64, 'base64');
    const sharpMod = await import('sharp');
    return await sharpMod
      .default(raw)
      .png({ compressionLevel: 8, adaptiveFiltering: true })
      .toBuffer();
  } finally {
    await page.close().catch(() => undefined);
  }
}

/**
 * Build the same PDF as download, then rasterize page 1 → PNG (exact PDF look).
 * Refuses when the sheet needs more than one page.
 */
export async function buildDaySheetPngBuffer(
  date: string,
  rows: DayExportRow[],
  totals: DayTotals
): Promise<Buffer> {
  const { buffer, pages } = await renderDaySheetPdf(date, rows, totals);
  assertExportPagesAllowed('png', pages);
  return rasterizePdfPageToPng(buffer, { scale: 2.5 });
}

export async function buildBuildReviewPngBuffer(
  date: string,
  items: BuildExportRow[]
): Promise<Buffer> {
  const { buffer, pages } = await renderBuildReviewPdf(date, items);
  assertExportPagesAllowed('png', pages);
  return rasterizePdfPageToPng(buffer, { scale: 2.5 });
}

/** Crisp vector “image” export (SVG) — LPO grayscale (matches PDF/PNG). */
function htmlBodyWithStyles(fullHtml: string): string {
  const style = fullHtml.match(/<style>([\s\S]*?)<\/style>/i)?.[1] || '';
  const body = fullHtml.match(/<body[^>]*>([\s\S]*?)<\/body>/i)?.[1] || fullHtml;
  return `<style>${style}</style>${body}`;
}

export function buildDaySheetSvg(
  date: string,
  rows: DayExportRow[],
  totals: DayTotals
): string {
  const inner = htmlBodyWithStyles(buildDaySheetHtml(date, rows, totals));
  const h = Math.max(720, 320 + Math.max(activeRows(rows).length, 4) * 32);
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1400" height="${h}" viewBox="0 0 1400 ${h}">
  <rect fill="#ffffff" width="1400" height="${h}" />
  <foreignObject x="0" y="0" width="1400" height="${h}">
    <div xmlns="http://www.w3.org/1999/xhtml">${inner}</div>
  </foreignObject>
</svg>`;
}

export function buildBuildReviewSvg(date: string, items: BuildExportRow[]): string {
  const inner = htmlBodyWithStyles(buildBuildReviewHtml(date, items));
  const h = Math.max(560, 280 + items.length * 32);
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="${h}" viewBox="0 0 1200 ${h}">
  <rect fill="#ffffff" width="1200" height="${h}" />
  <foreignObject x="0" y="0" width="1200" height="${h}">
    <div xmlns="http://www.w3.org/1999/xhtml">${inner}</div>
  </foreignObject>
</svg>`;
}
