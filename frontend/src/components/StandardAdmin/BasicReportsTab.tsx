import { useState, useEffect, useCallback } from 'react';
import {
  FileText,
  Fuel,
  TrendingUp,
  Truck,
  Download,
  RefreshCw,
  DollarSign,
  BarChart3,
  MapPin,
  AlertTriangle,
  CheckCircle,
  Package,
} from 'lucide-react';
import { dashboardAPI, doWorkbookAPI, lpoWorkbookAPI, fuelRecordsAPI } from '../../services/api';
import XLSXStyle from 'xlsx-js-style';
import { useRealtimeSync } from '../../hooks/useRealtimeSync';

// ── Styling helpers ────────────────────────────────────────────────────────────

const COLORS = {
  headerBg:    '1E3A5F',   // dark navy
  headerFont:  'FFFFFF',
  sectionBg:   '2D6A4F',   // dark green for section titles
  sectionFont: 'FFFFFF',
  altRow:      'EBF5FB',   // light blue alternating row
  totalRow:    'FEF9E7',   // light yellow for totals
  border:      '9DB2BF',
  titleBg:     '154360',   // deepest navy for sheet title
  titleFont:   'FFFFFF',
  positiveNum: '1A5E20',
  negativeNum: 'B71C1C',
};

const borderAll = (color = COLORS.border) => ({
  top:    { style: 'thin', color: { rgb: color } },
  bottom: { style: 'thin', color: { rgb: color } },
  left:   { style: 'thin', color: { rgb: color } },
  right:  { style: 'thin', color: { rgb: color } },
});

const headerCell = (value: string): XLSXStyle.CellObject => ({
  v: value, t: 's',
  s: {
    font:      { bold: true, color: { rgb: COLORS.headerFont }, sz: 11 },
    fill:      { fgColor: { rgb: COLORS.headerBg } },
    alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
    border:    borderAll('FFFFFF'),
  },
});

const sectionCell = (value: string): XLSXStyle.CellObject => ({
  v: value, t: 's',
  s: {
    font:      { bold: true, color: { rgb: COLORS.sectionFont }, sz: 10 },
    fill:      { fgColor: { rgb: COLORS.sectionBg } },
    alignment: { horizontal: 'left', vertical: 'center' },
    border:    borderAll(),
  },
});

const dataCell = (value: any, type: 's'|'n'|'b' = 's', numFmt?: string, altRow = false, alignRight = false, color?: string): XLSXStyle.CellObject => ({
  v: value, t: type,
  s: {
    font:      color ? { color: { rgb: color } } : {},
    fill:      { fgColor: { rgb: altRow ? COLORS.altRow : 'FFFFFF' } },
    alignment: { horizontal: alignRight ? 'right' : 'left', vertical: 'center' },
    border:    borderAll(),
    ...(numFmt ? { numFmt } : {}),
  },
});

const titleCell = (value: string): XLSXStyle.CellObject => ({
  v: value, t: 's',
  s: {
    font:      { bold: true, color: { rgb: COLORS.titleFont }, sz: 14 },
    fill:      { fgColor: { rgb: COLORS.titleBg } },
    alignment: { horizontal: 'center', vertical: 'center' },
    border:    borderAll('FFFFFF'),
  },
});

const NUM_FMT_TZS      = '#,##0 "TZS"';
const NUM_FMT_LITRES   = '#,##0 "L"';
const NUM_FMT_PCT      = '0.00"%"';
const NUM_FMT_COUNT    = '#,##0';

/** Write a fully styled sheet and append it to the workbook. */
function appendStyledSheet(
  wb: XLSXStyle.WorkBook,
  sheetName: string,
  headers: { label: string; key: string; width: number; numFmt?: string; alignRight?: boolean }[],
  rows: Record<string, any>[],
  titleText?: string,
) {
  const ws: XLSXStyle.WorkSheet = {};
  let r = 0;

  const setCell = (row: number, col: number, cell: XLSXStyle.CellObject) => {
    const addr = XLSXStyle.utils.encode_cell({ r: row, c: col });
    ws[addr] = cell;
  };

  // Optional title row spanning all columns
  if (titleText) {
    setCell(r, 0, titleCell(titleText));
    for (let c = 1; c < headers.length; c++) {
      setCell(r, c, { v: '', t: 's', s: { fill: { fgColor: { rgb: COLORS.titleBg } }, border: borderAll('FFFFFF') } });
    }
    ws['!merges'] = [{ s: { r, c: 0 }, e: { r, c: headers.length - 1 } }];
    r++;
  }

  // Header row
  headers.forEach((h, c) => setCell(r, c, headerCell(h.label)));
  r++;

  // Data rows
  rows.forEach((row, rowIdx) => {
    const alt = rowIdx % 2 === 1;
    headers.forEach((h, c) => {
      const raw = row[h.key];
      const isNum = typeof raw === 'number';
      // Colour positive/negative money cells
      let color: string | undefined;
      if (h.numFmt === NUM_FMT_TZS && isNum) {
        color = raw >= 0 ? COLORS.positiveNum : COLORS.negativeNum;
      }
      setCell(r, c, dataCell(
        raw ?? '',
        isNum ? 'n' : 's',
        h.numFmt,
        alt,
        h.alignRight ?? isNum,
        color,
      ));
    });
    r++;
  });

  ws['!ref'] = XLSXStyle.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: r - 1, c: headers.length - 1 } });
  ws['!cols'] = headers.map(h => ({ wch: h.width }));
  ws['!rows'] = Array.from({ length: r }, (_, i) => ({ hpt: i === 0 && titleText ? 28 : i === (titleText ? 1 : 0) ? 22 : 18 }));

  XLSXStyle.utils.book_append_sheet(wb, ws, sheetName);
}

/** Append a two-column key→value summary sheet (used for Executive Summary). */
function appendKeyValueSheet(
  wb: XLSXStyle.WorkBook,
  sheetName: string,
  titleText: string,
  sections: { heading?: string; rows: { label: string; value: any; numFmt?: string }[] }[],
) {
  const ws: XLSXStyle.WorkSheet = {};
  let r = 0;

  const setCell = (row: number, col: number, cell: XLSXStyle.CellObject) => {
    const addr = XLSXStyle.utils.encode_cell({ r: row, c: col });
    ws[addr] = cell;
  };

  // Title spanning 2 columns
  setCell(r, 0, titleCell(titleText));
  setCell(r, 1, { v: '', t: 's', s: { fill: { fgColor: { rgb: COLORS.titleBg } }, border: borderAll('FFFFFF') } });
  ws['!merges'] = [{ s: { r, c: 0 }, e: { r, c: 1 } }];
  r++;

  // Column headers
  setCell(r, 0, headerCell('Metric'));
  setCell(r, 1, headerCell('Value'));
  r++;

  let rowIdx = 0;
  sections.forEach(section => {
    if (section.heading) {
      setCell(r, 0, sectionCell(section.heading));
      setCell(r, 1, { v: '', t: 's', s: { fill: { fgColor: { rgb: COLORS.sectionBg } }, border: borderAll() } });
      r++;
    }
    section.rows.forEach(item => {
      const alt = rowIdx % 2 === 1;
      const isNum = typeof item.value === 'number';
      let color: string | undefined;
      if (item.numFmt === NUM_FMT_TZS && isNum) {
        color = item.value >= 0 ? COLORS.positiveNum : COLORS.negativeNum;
      }
      setCell(r, 0, dataCell(item.label, 's', undefined, alt, false));
      setCell(r, 1, dataCell(item.value ?? '', isNum ? 'n' : 's', item.numFmt, alt, true, color));
      r++;
      rowIdx++;
    });
  });

  ws['!ref'] = XLSXStyle.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: r - 1, c: 1 } });
  ws['!cols'] = [{ wch: 34 }, { wch: 22 }];
  ws['!rows'] = Array.from({ length: r }, () => ({ hpt: 18 }));
  if (ws['!rows'][0]) ws['!rows'][0] = { hpt: 28 };
  if (ws['!rows'][1]) ws['!rows'][1] = { hpt: 22 };

  XLSXStyle.utils.book_append_sheet(wb, ws, sheetName);
}

interface BasicReportsTabProps {
  user: any;
  showMessage: (type: 'success' | 'error', message: string) => void;
}

type ActiveReport = 'overview' | 'financial' | 'fuel' | 'fleet' | 'lpo_station' | 'do_activity' | 'export_hub';

const REPORT_TABS: { id: ActiveReport; label: string; icon: any; description: string }[] = [
  { id: 'overview',     label: 'Executive Overview', icon: BarChart3,     description: 'Key KPIs at a glance' },
  { id: 'financial',    label: 'Financial P&L',      icon: DollarSign,    description: 'Revenue, cost & profit' },
  { id: 'fuel',         label: 'Fuel Analysis',      icon: Fuel,          description: 'Consumption by yard & route' },
  { id: 'fleet',        label: 'Fleet Performance',  icon: Truck,         description: 'Per-truck metrics & efficiency' },
  { id: 'lpo_station',  label: 'Station LPOs',       icon: MapPin,        description: 'LPO spend per fuel station' },
  { id: 'do_activity',  label: 'DO Activity',        icon: Package,       description: 'Delivery orders breakdown' },
  { id: 'export_hub',   label: 'Export Hub',         icon: Download,      description: 'Download raw data exports' },
];

const DATE_RANGES = [
  { value: 'week',    label: 'This Week' },
  { value: 'month',   label: 'This Month' },
  { value: 'quarter', label: 'This Quarter' },
  { value: 'year',    label: 'This Year' },
];

function formatCurrency(amount: number) {
  return new Intl.NumberFormat('en-TZ', { style: 'currency', currency: 'TZS', minimumFractionDigits: 0 }).format(amount);
}

function StatCard({ label, value, sub, icon: Icon, color }: { label: string; value: string; sub?: string; icon: any; color: string }) {
  const colorMap: Record<string, string> = {
    blue:   'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400',
    green:  'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400',
    red:    'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400',
    purple: 'bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400',
    orange: 'bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400',
    yellow: 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-600 dark:text-yellow-400',
  };
  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg border dark:border-gray-700 p-5">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-gray-500 dark:text-gray-400">{label}</p>
          <p className="text-2xl font-bold text-gray-900 dark:text-gray-100 mt-1">{value}</p>
          {sub && <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">{sub}</p>}
        </div>
        <div className={`w-11 h-11 rounded-lg flex items-center justify-center ${colorMap[color] || colorMap.blue}`}>
          <Icon className="w-5 h-5" />
        </div>
      </div>
    </div>
  );
}

export default function BasicReportsTab({ showMessage }: BasicReportsTabProps) {
  const [activeReport, setActiveReport] = useState<ActiveReport>('overview');
  const [dateRange, setDateRange] = useState('month');
  const [reportData, setReportData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);

  const loadReportData = useCallback(async () => {
    setLoading(true);
    try {
      const data = await dashboardAPI.getReports(dateRange);
      setReportData(data);
    } catch {
      showMessage('error', 'Failed to load report data');
    } finally {
      setLoading(false);
    }
  }, [dateRange]);

  useEffect(() => {
    if (activeReport !== 'export_hub') {
      loadReportData();
    }
  }, [activeReport, loadReportData]);

  useRealtimeSync(['fuel_records', 'delivery_orders', 'lpo_entries'], loadReportData);

  // ── Export helpers ─────────────────────────────────────────────────────────

  const exportExcel = async (type: 'do' | 'lpo' | 'fuel') => {
    setExporting(true);
    try {
      if (type === 'do') {
        const years = await doWorkbookAPI.getAvailableYears();
        if (!years.length) { showMessage('error', 'No delivery order data available'); return; }
        await doWorkbookAPI.exportWorkbook(years[0]);
        showMessage('success', `Delivery Orders workbook (${years[0]}) downloaded`);
      } else if (type === 'lpo') {
        const years = await lpoWorkbookAPI.getAvailableYears();
        if (!years.length) { showMessage('error', 'No LPO data available'); return; }
        await lpoWorkbookAPI.exportWorkbook(years[0]);
        showMessage('success', `LPO workbook (${years[0]}) downloaded`);
      } else {
        // Styled fuel records export
        const res = await fuelRecordsAPI.getAll({ page: 1, limit: 5000, sort: 'date', order: 'desc' });
        const rawRows = res.data || [];
        if (!rawRows.length) { showMessage('error', 'No fuel records found'); return; }

        const wb = XLSXStyle.utils.book_new();
        const dataRows = rawRows.map((r: any) => ({
          date:        r.date ?? '',
          truckNo:     r.truckNo ?? '',
          goingDo:     r.goingDo ?? '',
          to:          r.to ?? '',
          from:        r.from ?? '',
          totalLts:    typeof r.totalLts === 'number' ? r.totalLts : (typeof r.totalFuel === 'number' ? r.totalFuel : null),
          balance:     typeof r.balance === 'number' ? r.balance : null,
          status:      r.journeyStatus ?? '',
        }));

        appendStyledSheet(wb, 'Fuel Records', [
          { label: 'Date',          key: 'date',     width: 14 },
          { label: 'Truck No.',     key: 'truckNo',  width: 14 },
          { label: 'DO Number',     key: 'goingDo',  width: 16 },
          { label: 'From',          key: 'from',     width: 20 },
          { label: 'Destination',   key: 'to',       width: 20 },
          { label: 'Total Litres',  key: 'totalLts', width: 15, numFmt: NUM_FMT_LITRES,  alignRight: true },
          { label: 'Balance (L)',   key: 'balance',  width: 14, numFmt: NUM_FMT_LITRES,  alignRight: true },
          { label: 'Journey Status',key: 'status',   width: 16 },
        ], dataRows, `Fuel Records Export — ${new Date().toLocaleDateString('en-TZ')}`);

        XLSXStyle.writeFile(wb, `fuel_records_${new Date().toISOString().split('T')[0]}.xlsx`);
        showMessage('success', `Fuel records export (${dataRows.length} rows) downloaded`);
      }
    } catch {
      showMessage('error', 'Export failed. Please try again.');
    } finally {
      setExporting(false);
    }
  };

  const exportSummaryExcel = async () => {
    if (!reportData) { showMessage('error', 'Load report data first'); return; }
    setExporting(true);
    try {
      const wb = XLSXStyle.utils.book_new();
      const periodLabel = DATE_RANGES.find(d => d.value === dateRange)?.label ?? dateRange;
      const today = new Date().toLocaleDateString('en-TZ');
      const f  = reportData.financials      ?? {};
      const o  = reportData.operations      ?? {};
      const fc = reportData.fuelConsumption ?? {};

      // ── Sheet 1: Executive Summary (key-value) ──────────────────────────────
      appendKeyValueSheet(wb, 'Executive Summary',
        `Admin Report — ${periodLabel}  (Generated: ${today})`,
        [
          { heading: 'Report Info', rows: [
            { label: 'Period',            value: periodLabel },
            { label: 'Generated On',      value: today },
          ]},
          { heading: 'Financials', rows: [
            { label: 'Total Revenue',           value: f.totalRevenue   ?? 0, numFmt: NUM_FMT_TZS },
            { label: 'Total Fuel Cost',         value: f.totalFuelCost  ?? 0, numFmt: NUM_FMT_TZS },
            { label: 'Estimated Total Cost',    value: f.totalCost      ?? 0, numFmt: NUM_FMT_TZS },
            { label: 'Net Profit / Loss',       value: f.profit         ?? 0, numFmt: NUM_FMT_TZS },
            { label: 'Profit Margin',           value: f.profitMargin   ?? 0, numFmt: NUM_FMT_PCT  },
          ]},
          { heading: 'Operations', rows: [
            { label: 'Total Trips (DOs)',        value: o.totalTrips          ?? 0, numFmt: NUM_FMT_COUNT },
            { label: 'Active Trucks',            value: o.totalTrucks         ?? 0, numFmt: NUM_FMT_COUNT },
            { label: 'Total Fuel Records',       value: o.totalFuelRecords    ?? 0, numFmt: NUM_FMT_COUNT },
            { label: 'Avg Fuel per Trip',        value: o.averageFuelPerTrip  ?? 0, numFmt: NUM_FMT_LITRES },
            { label: 'Journey Completion Rate',  value: o.onTimeDelivery      ?? 0, numFmt: NUM_FMT_PCT   },
            { label: 'Active Journeys',          value: o.journeyStatus?.active    ?? 0, numFmt: NUM_FMT_COUNT },
            { label: 'Queued Journeys',          value: o.journeyStatus?.queued    ?? 0, numFmt: NUM_FMT_COUNT },
            { label: 'Completed Journeys',       value: o.journeyStatus?.completed ?? 0, numFmt: NUM_FMT_COUNT },
          ]},
          { heading: 'Fuel Consumption', rows: [
            { label: 'Total Fuel Consumed',      value: fc.total ?? 0, numFmt: NUM_FMT_LITRES },
          ]},
        ],
      );

      // ── Sheet 2: Fuel by Yard ───────────────────────────────────────────────
      if (fc.byYard?.length) {
        const totalYard = fc.byYard.reduce((s: number, y: any) => s + (y.value ?? 0), 0);
        appendStyledSheet(wb, 'Fuel by Yard', [
          { label: 'Yard',              key: 'name',  width: 22 },
          { label: 'Litres Dispensed',  key: 'value', width: 20, numFmt: NUM_FMT_LITRES, alignRight: true },
          { label: 'Share (%)',         key: 'share', width: 14, numFmt: NUM_FMT_PCT,     alignRight: true },
        ],
        [
          ...fc.byYard.map((y: any) => ({
            name: y.name,
            value: y.value ?? 0,
            share: totalYard > 0 ? parseFloat(((y.value / totalYard) * 100).toFixed(2)) : 0,
          })),
          { name: 'TOTAL', value: totalYard, share: 100 },
        ],
        `Fuel Dispensed by Yard — ${periodLabel}`);
      }

      // ── Sheet 3: Station LPO Spend ─────────────────────────────────────────
      if (fc.byStation?.length) {
        const totalStation = fc.byStation.reduce((s: number, st: any) => s + (st.value ?? 0), 0);
        appendStyledSheet(wb, 'Station LPO Spend', [
          { label: '#',                 key: 'rank',  width: 6 },
          { label: 'Station',           key: 'name',  width: 28 },
          { label: 'Litres Purchased',  key: 'value', width: 20, numFmt: NUM_FMT_LITRES, alignRight: true },
          { label: 'Share (%)',         key: 'share', width: 14, numFmt: NUM_FMT_PCT,     alignRight: true },
        ],
        [
          ...fc.byStation.map((s: any, i: number) => ({
            rank: i + 1,
            name: s.name,
            value: s.value ?? 0,
            share: totalStation > 0 ? parseFloat(((s.value / totalStation) * 100).toFixed(2)) : 0,
          })),
          { rank: '', name: 'TOTAL', value: totalStation, share: 100 },
        ],
        `Top Fuel Stations by LPO Spend — ${periodLabel}`);
      }

      // ── Sheet 4: Monthly Trends ─────────────────────────────────────────────
      if (reportData.trends?.length) {
        appendStyledSheet(wb, 'Monthly Trends', [
          { label: 'Month',           key: 'month',   width: 14 },
          { label: 'Fuel (L)',        key: 'fuel',    width: 16, numFmt: NUM_FMT_LITRES, alignRight: true },
          { label: 'Revenue (TZS)',   key: 'revenue', width: 22, numFmt: NUM_FMT_TZS,    alignRight: true },
          { label: 'DOs',            key: 'dos',     width: 10, numFmt: NUM_FMT_COUNT,   alignRight: true },
          { label: 'LPOs',           key: 'lpos',    width: 10, numFmt: NUM_FMT_COUNT,   alignRight: true },
        ],
        reportData.trends.map((t: any) => ({
          month:   `${t.month} ${t.year ?? ''}`.trim(),
          fuel:    t.fuel    ?? 0,
          revenue: t.revenue ?? 0,
          dos:     t.dos     ?? 0,
          lpos:    t.lpos    ?? 0,
        })),
        `Monthly Trends — ${periodLabel}`);
      }

      XLSXStyle.writeFile(wb, `admin_report_${dateRange}_${new Date().toISOString().split('T')[0]}.xlsx`);
      showMessage('success', 'Styled admin report workbook downloaded');
    } catch (err) {
      console.error('Export error:', err);
      showMessage('error', 'Failed to generate Excel export');
    } finally {
      setExporting(false);
    }
  };

  // ── Per-tab export ────────────────────────────────────────────────────────

  const exportCurrentTab = async () => {
    if (!reportData) { showMessage('error', 'Load report data first'); return; }
    setExporting(true);
    try {
      const wb        = XLSXStyle.utils.book_new();
      const period    = DATE_RANGES.find(d => d.value === dateRange)?.label ?? dateRange;
      const today     = new Date().toLocaleDateString('en-TZ');
      const dateStr   = new Date().toISOString().split('T')[0];
      const f         = reportData.financials      ?? {};
      const o         = reportData.operations      ?? {};
      const fc        = reportData.fuelConsumption ?? {};

      switch (activeReport) {
        case 'overview': {
          appendKeyValueSheet(wb, 'KPI Overview',
            `Executive Overview — ${period}  (${today})`,
            [
              { heading: 'Financials', rows: [
                { label: 'Total Revenue',     value: f.totalRevenue  ?? 0, numFmt: NUM_FMT_TZS },
                { label: 'Net Profit / Loss', value: f.profit        ?? 0, numFmt: NUM_FMT_TZS },
                { label: 'Profit Margin',     value: f.profitMargin  ?? 0, numFmt: NUM_FMT_PCT  },
                { label: 'Total Fuel Cost',   value: f.totalFuelCost ?? 0, numFmt: NUM_FMT_TZS },
              ]},
              { heading: 'Operations', rows: [
                { label: 'Total Trips (DOs)',       value: o.totalTrips         ?? 0, numFmt: NUM_FMT_COUNT  },
                { label: 'Active Trucks',           value: o.totalTrucks        ?? 0, numFmt: NUM_FMT_COUNT  },
                { label: 'Total Fuel (L)',           value: fc.total             ?? 0, numFmt: NUM_FMT_LITRES },
                { label: 'Avg Fuel / Trip',         value: o.averageFuelPerTrip ?? 0, numFmt: NUM_FMT_LITRES },
                { label: 'Journey Completion Rate', value: o.onTimeDelivery     ?? 0, numFmt: NUM_FMT_PCT    },
              ]},
            ],
          );
          if (reportData.trends?.length) {
            appendStyledSheet(wb, 'Monthly Trends', [
              { label: 'Month',          key: 'month',   width: 14 },
              { label: 'Fuel (L)',       key: 'fuel',    width: 16, numFmt: NUM_FMT_LITRES, alignRight: true },
              { label: 'Revenue (TZS)', key: 'revenue', width: 22, numFmt: NUM_FMT_TZS,    alignRight: true },
              { label: 'DOs',           key: 'dos',     width: 10, numFmt: NUM_FMT_COUNT,   alignRight: true },
              { label: 'LPOs',          key: 'lpos',    width: 10, numFmt: NUM_FMT_COUNT,   alignRight: true },
            ], reportData.trends.map((t: any) => ({
              month: `${t.month} ${t.year ?? ''}`.trim(),
              fuel: t.fuel ?? 0, revenue: t.revenue ?? 0, dos: t.dos ?? 0, lpos: t.lpos ?? 0,
            })), `Monthly Trends — ${period}`);
          }
          XLSXStyle.writeFile(wb, `executive_overview_${dateRange}_${dateStr}.xlsx`);
          showMessage('success', 'Executive Overview exported');
          break;
        }

        case 'financial': {
          appendKeyValueSheet(wb, 'Financial P&L',
            `Financial P&L — ${period}  (${today})`,
            [
              { heading: 'Revenue & Cost', rows: [
                { label: 'Total Revenue',        value: f.totalRevenue  ?? 0, numFmt: NUM_FMT_TZS },
                { label: 'Total Fuel Cost',      value: f.totalFuelCost ?? 0, numFmt: NUM_FMT_TZS },
                { label: 'Estimated Total Cost', value: f.totalCost     ?? 0, numFmt: NUM_FMT_TZS },
              ]},
              { heading: 'Profitability', rows: [
                { label: 'Net Profit / Loss', value: f.profit       ?? 0, numFmt: NUM_FMT_TZS },
                { label: 'Profit Margin',     value: f.profitMargin ?? 0, numFmt: NUM_FMT_PCT  },
              ]},
              { heading: 'Per-Trip Metrics', rows: [
                { label: 'Total Trips',             value: o.totalTrips ?? 0, numFmt: NUM_FMT_COUNT },
                { label: 'Avg Revenue per Trip',    value: o.totalTrips ? parseFloat((f.totalRevenue  / o.totalTrips).toFixed(2)) : 0, numFmt: NUM_FMT_TZS },
                { label: 'Avg Fuel Cost per Trip',  value: o.totalTrips ? parseFloat((f.totalFuelCost / o.totalTrips).toFixed(2)) : 0, numFmt: NUM_FMT_TZS },
              ]},
            ],
          );
          XLSXStyle.writeFile(wb, `financial_pl_${dateRange}_${dateStr}.xlsx`);
          showMessage('success', 'Financial P&L exported');
          break;
        }

        case 'fuel': {
          if (fc.byYard?.length) {
            const totalYard = fc.byYard.reduce((s: number, y: any) => s + (y.value ?? 0), 0);
            appendStyledSheet(wb, 'Fuel by Yard', [
              { label: 'Yard',             key: 'name',  width: 22 },
              { label: 'Litres Dispensed', key: 'value', width: 20, numFmt: NUM_FMT_LITRES, alignRight: true },
              { label: 'Share (%)',        key: 'share', width: 14, numFmt: NUM_FMT_PCT,     alignRight: true },
            ], [
              ...fc.byYard.map((y: any) => ({
                name: y.name, value: y.value ?? 0,
                share: totalYard > 0 ? parseFloat(((y.value / totalYard) * 100).toFixed(2)) : 0,
              })),
              { name: 'TOTAL', value: totalYard, share: 100 },
            ], `Fuel by Yard — ${period}`);
          }
          if (fc.byStation?.length) {
            const totalSt = fc.byStation.reduce((s: number, st: any) => s + (st.value ?? 0), 0);
            appendStyledSheet(wb, 'By Station', [
              { label: '#',          key: 'rank',  width: 6 },
              { label: 'Station',    key: 'name',  width: 28 },
              { label: 'Litres',     key: 'value', width: 18, numFmt: NUM_FMT_LITRES, alignRight: true },
              { label: 'Share (%)', key: 'share', width: 14, numFmt: NUM_FMT_PCT,     alignRight: true },
            ], [
              ...fc.byStation.map((s: any, i: number) => ({
                rank: i + 1, name: s.name, value: s.value ?? 0,
                share: totalSt > 0 ? parseFloat(((s.value / totalSt) * 100).toFixed(2)) : 0,
              })),
              { rank: '', name: 'TOTAL', value: totalSt, share: 100 },
            ], `Fuel by Station — ${period}`);
          }
          appendKeyValueSheet(wb, 'Summary',
            `Fuel Analysis Summary — ${period}  (${today})`,
            [{ heading: 'Fuel Metrics', rows: [
              { label: 'Total Fuel Consumed', value: fc.total             ?? 0, numFmt: NUM_FMT_LITRES },
              { label: 'Avg Fuel per Trip',   value: o.averageFuelPerTrip ?? 0, numFmt: NUM_FMT_LITRES },
              { label: 'Active Journeys',     value: o.journeyStatus?.active    ?? 0, numFmt: NUM_FMT_COUNT },
              { label: 'Queued Journeys',     value: o.journeyStatus?.queued    ?? 0, numFmt: NUM_FMT_COUNT },
              { label: 'Completed Journeys',  value: o.journeyStatus?.completed ?? 0, numFmt: NUM_FMT_COUNT },
            ]}]);
          XLSXStyle.writeFile(wb, `fuel_analysis_${dateRange}_${dateStr}.xlsx`);
          showMessage('success', 'Fuel Analysis exported');
          break;
        }

        case 'fleet': {
          appendKeyValueSheet(wb, 'Fleet Performance',
            `Fleet Performance — ${period}  (${today})`,
            [
              { heading: 'Fleet Metrics', rows: [
                { label: 'Active Trucks',       value: o.totalTrucks        ?? 0, numFmt: NUM_FMT_COUNT  },
                { label: 'Total Trips',         value: o.totalTrips         ?? 0, numFmt: NUM_FMT_COUNT  },
                { label: 'Total Fuel Records',  value: o.totalFuelRecords   ?? 0, numFmt: NUM_FMT_COUNT  },
                { label: 'Total Fuel (L)',       value: fc.total             ?? 0, numFmt: NUM_FMT_LITRES },
                { label: 'Avg Fuel / Trip',     value: o.averageFuelPerTrip ?? 0, numFmt: NUM_FMT_LITRES },
                { label: 'Avg Fuel / Truck',    value: o.totalTrucks ? parseFloat(((fc.total ?? 0) / o.totalTrucks).toFixed(2)) : 0, numFmt: NUM_FMT_LITRES },
                { label: 'Trips / Truck (avg)', value: o.totalTrucks ? parseFloat((o.totalTrips / o.totalTrucks).toFixed(2)) : 0, numFmt: NUM_FMT_COUNT },
                { label: 'Completion Rate',     value: o.onTimeDelivery     ?? 0, numFmt: NUM_FMT_PCT    },
              ]},
              { heading: 'Journey Status', rows: [
                { label: 'Active Journeys',    value: o.journeyStatus?.active    ?? 0, numFmt: NUM_FMT_COUNT },
                { label: 'Queued Journeys',    value: o.journeyStatus?.queued    ?? 0, numFmt: NUM_FMT_COUNT },
                { label: 'Completed Journeys', value: o.journeyStatus?.completed ?? 0, numFmt: NUM_FMT_COUNT },
              ]},
            ],
          );
          XLSXStyle.writeFile(wb, `fleet_performance_${dateRange}_${dateStr}.xlsx`);
          showMessage('success', 'Fleet Performance exported');
          break;
        }

        case 'lpo_station': {
          if (!fc.byStation?.length) { showMessage('error', 'No station LPO data for this period'); return; }
          const totalSt = fc.byStation.reduce((s: number, st: any) => s + (st.value ?? 0), 0);
          appendStyledSheet(wb, 'Station LPO Spend', [
            { label: '#',                key: 'rank',  width: 6 },
            { label: 'Station',          key: 'name',  width: 30 },
            { label: 'Litres Purchased', key: 'value', width: 20, numFmt: NUM_FMT_LITRES, alignRight: true },
            { label: 'Share (%)',        key: 'share', width: 14, numFmt: NUM_FMT_PCT,     alignRight: true },
          ], [
            ...fc.byStation.map((s: any, i: number) => ({
              rank: i + 1, name: s.name, value: s.value ?? 0,
              share: totalSt > 0 ? parseFloat(((s.value / totalSt) * 100).toFixed(2)) : 0,
            })),
            { rank: '', name: 'TOTAL', value: totalSt, share: 100 },
          ], `Station LPO Spend — ${period}  (${today})`);
          XLSXStyle.writeFile(wb, `station_lpo_${dateRange}_${dateStr}.xlsx`);
          showMessage('success', 'Station LPO Spend exported');
          break;
        }

        case 'do_activity': {
          appendKeyValueSheet(wb, 'DO Summary',
            `DO Activity Summary — ${period}  (${today})`,
            [{ heading: 'Delivery Orders', rows: [
              { label: 'Total DOs',        value: o.totalTrips   ?? 0, numFmt: NUM_FMT_COUNT },
              { label: 'Total Revenue',    value: f.totalRevenue ?? 0, numFmt: NUM_FMT_TZS   },
              { label: 'Avg Revenue / DO', value: o.totalTrips ? parseFloat((f.totalRevenue / o.totalTrips).toFixed(2)) : 0, numFmt: NUM_FMT_TZS },
            ]}]);
          if (reportData.trends?.length) {
            appendStyledSheet(wb, 'DO Activity by Month', [
              { label: 'Month',          key: 'month',   width: 14 },
              { label: 'DOs',            key: 'dos',     width: 10, numFmt: NUM_FMT_COUNT,   alignRight: true },
              { label: 'LPOs',           key: 'lpos',    width: 10, numFmt: NUM_FMT_COUNT,   alignRight: true },
              { label: 'Fuel (L)',       key: 'fuel',    width: 16, numFmt: NUM_FMT_LITRES,  alignRight: true },
              { label: 'Revenue (TZS)', key: 'revenue', width: 22, numFmt: NUM_FMT_TZS,     alignRight: true },
            ], reportData.trends.map((t: any) => ({
              month: `${t.month} ${t.year ?? ''}`.trim(),
              dos: t.dos ?? 0, lpos: t.lpos ?? 0, fuel: t.fuel ?? 0, revenue: t.revenue ?? 0,
            })), `DO Activity by Month — ${period}`);
          }
          XLSXStyle.writeFile(wb, `do_activity_${dateRange}_${dateStr}.xlsx`);
          showMessage('success', 'DO Activity exported');
          break;
        }

        default: break;
      }
    } catch (err) {
      console.error('Export error:', err);
      showMessage('error', 'Failed to generate export');
    } finally {
      setExporting(false);
    }
  };

  // ── Sub-renders ────────────────────────────────────────────────────────────

  const renderOverview = () => {
    if (!reportData) return null;
    const f = reportData.financials ?? {};
    const o = reportData.operations ?? {};
    const fc = reportData.fuelConsumption ?? {};
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard label="Total Revenue"     value={formatCurrency(f.totalRevenue ?? 0)}  icon={DollarSign}  color="green"  />
          <StatCard label="Net Profit"         value={formatCurrency(f.profit ?? 0)}        sub={`Margin: ${f.profitMargin ?? 0}%`} icon={TrendingUp} color={f.profit >= 0 ? 'green' : 'red'} />
          <StatCard label="Total Trips"        value={(o.totalTrips ?? 0).toString()}        icon={Package}    color="blue"   />
          <StatCard label="Total Fuel (L)"     value={(fc.total ?? 0).toLocaleString()}      icon={Fuel}       color="orange" />
          <StatCard label="Active Trucks"      value={(o.totalTrucks ?? 0).toString()}       icon={Truck}      color="purple" />
          <StatCard label="Avg Fuel / Trip"    value={`${Math.round(o.averageFuelPerTrip ?? 0)} L`}           icon={BarChart3} color="blue" />
          <StatCard label="Journey Completion" value={`${o.onTimeDelivery ?? 0}%`}           icon={CheckCircle} color="green" />
          <StatCard label="Fuel Cost"          value={formatCurrency(f.totalFuelCost ?? 0)} icon={DollarSign} color="yellow" />
        </div>

        {/* Monthly Trend Table */}
        {reportData.trends?.length > 0 && (
          <div className="bg-white dark:bg-gray-800 rounded-lg border dark:border-gray-700 p-5">
            <h3 className="text-base font-semibold text-gray-800 dark:text-gray-100 mb-4">Monthly Trends</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b dark:border-gray-700">
                    <th className="text-left py-2 pr-4 text-gray-500 dark:text-gray-400 font-medium">Month</th>
                    <th className="text-right py-2 pr-4 text-gray-500 dark:text-gray-400 font-medium">Fuel (L)</th>
                    <th className="text-right py-2 pr-4 text-gray-500 dark:text-gray-400 font-medium">Revenue (TZS)</th>
                    <th className="text-right py-2 pr-4 text-gray-500 dark:text-gray-400 font-medium">DOs</th>
                    <th className="text-right py-2 text-gray-500 dark:text-gray-400 font-medium">LPOs</th>
                  </tr>
                </thead>
                <tbody>
                  {reportData.trends.map((t: any) => (
                    <tr key={`${t.month}-${t.year}`} className="border-b dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-700/30">
                      <td className="py-2 pr-4 text-gray-800 dark:text-gray-200 font-medium">{t.month} {t.year}</td>
                      <td className="py-2 pr-4 text-right text-gray-700 dark:text-gray-300">{t.fuel.toLocaleString()}</td>
                      <td className="py-2 pr-4 text-right text-gray-700 dark:text-gray-300">{formatCurrency(t.revenue)}</td>
                      <td className="py-2 pr-4 text-right text-gray-700 dark:text-gray-300">{t.dos ?? '-'}</td>
                      <td className="py-2 text-right text-gray-700 dark:text-gray-300">{t.lpos ?? '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderFinancial = () => {
    if (!reportData) return null;
    const f = reportData.financials ?? {};
    const o = reportData.operations ?? {};
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <StatCard label="Total Revenue"     value={formatCurrency(f.totalRevenue ?? 0)}   sub="From tonnage × rate"       icon={DollarSign}  color="green"  />
          <StatCard label="Total Fuel Cost"   value={formatCurrency(f.totalFuelCost ?? 0)}  sub="Litres × price/litre"       icon={Fuel}        color="orange" />
          <StatCard label="Estimated Total Cost" value={formatCurrency(f.totalCost ?? 0)}   sub="Fuel + 20% other expenses"  icon={TrendingUp}  color="yellow" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className={`rounded-lg border p-5 ${f.profit >= 0 ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800' : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'}`}>
            <p className="text-sm text-gray-600 dark:text-gray-400">Net Profit / Loss</p>
            <p className={`text-3xl font-bold mt-1 ${f.profit >= 0 ? 'text-green-700 dark:text-green-400' : 'text-red-700 dark:text-red-400'}`}>{formatCurrency(f.profit ?? 0)}</p>
            <p className="text-sm mt-2 text-gray-500 dark:text-gray-400">Margin: <span className="font-semibold">{f.profitMargin ?? 0}%</span></p>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-lg border dark:border-gray-700 p-5">
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">Revenue Drivers</p>
            <p className="text-sm text-gray-700 dark:text-gray-300">Total trips completed: <span className="font-semibold">{o.totalTrips ?? 0}</span></p>
            <p className="text-sm text-gray-700 dark:text-gray-300 mt-1">Avg revenue per trip: <span className="font-semibold">{formatCurrency(o.totalTrips ? (f.totalRevenue / o.totalTrips) : 0)}</span></p>
            <p className="text-sm text-gray-700 dark:text-gray-300 mt-1">Avg fuel cost per trip: <span className="font-semibold">{formatCurrency(o.totalTrips ? (f.totalFuelCost / o.totalTrips) : 0)}</span></p>
          </div>
        </div>
      </div>
    );
  };

  const renderFuel = () => {
    if (!reportData) return null;
    const fc = reportData.fuelConsumption ?? {};
    const o  = reportData.operations ?? {};
    const journeyStatus = o.journeyStatus ?? {};
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard label="Total Consumed"   value={`${(fc.total ?? 0).toLocaleString()} L`}                    icon={Fuel}      color="orange" />
          <StatCard label="Avg / Trip"       value={`${Math.round(o.averageFuelPerTrip ?? 0)} L`}               icon={Truck}     color="blue"   />
          <StatCard label="Active Journeys"  value={(journeyStatus.active ?? 0).toString()}                     icon={TrendingUp} color="green" />
          <StatCard label="Queued"           value={(journeyStatus.queued ?? 0).toString()}                     icon={AlertTriangle} color="yellow" />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* By Yard */}
          <div className="bg-white dark:bg-gray-800 rounded-lg border dark:border-gray-700 p-5">
            <h3 className="text-base font-semibold text-gray-800 dark:text-gray-100 mb-4">Fuel Dispensed by Yard</h3>
            {fc.byYard?.length ? fc.byYard.map((y: any, i: number) => {
              const pct = fc.total ? Math.round((y.value / fc.total) * 100) : 0;
              const barColors = ['bg-blue-500', 'bg-green-500', 'bg-orange-500', 'bg-purple-500'];
              return (
                <div key={y.name} className="mb-3">
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-gray-700 dark:text-gray-300">{y.name}</span>
                    <span className="font-medium text-gray-900 dark:text-gray-100">{y.value.toLocaleString()} L <span className="text-gray-400">({pct}%)</span></span>
                  </div>
                  <div className="h-2 bg-gray-100 dark:bg-gray-700 rounded-full">
                    <div className={`h-2 rounded-full ${barColors[i % barColors.length]}`} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            }) : <p className="text-sm text-gray-400">No yard data available</p>}
          </div>

          {/* By Station */}
          <div className="bg-white dark:bg-gray-800 rounded-lg border dark:border-gray-700 p-5">
            <h3 className="text-base font-semibold text-gray-800 dark:text-gray-100 mb-4">Top Fuel Stations (by litres)</h3>
            {fc.byStation?.length ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b dark:border-gray-700">
                      <th className="text-left py-1.5 text-gray-500 dark:text-gray-400 font-medium">#</th>
                      <th className="text-left py-1.5 text-gray-500 dark:text-gray-400 font-medium">Station</th>
                      <th className="text-right py-1.5 text-gray-500 dark:text-gray-400 font-medium">Litres</th>
                    </tr>
                  </thead>
                  <tbody>
                    {fc.byStation.map((s: any, i: number) => (
                      <tr key={s.name} className="border-b dark:border-gray-700/50">
                        <td className="py-1.5 text-gray-400">{i + 1}</td>
                        <td className="py-1.5 text-gray-800 dark:text-gray-200">{s.name}</td>
                        <td className="py-1.5 text-right font-medium text-gray-900 dark:text-gray-100">{s.value.toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <p className="text-sm text-gray-400">No station data available</p>}
          </div>
        </div>

        {/* Journey Status */}
        <div className="bg-white dark:bg-gray-800 rounded-lg border dark:border-gray-700 p-5">
          <h3 className="text-base font-semibold text-gray-800 dark:text-gray-100 mb-4">Journey Status Breakdown</h3>
          <div className="grid grid-cols-3 gap-4 text-center">
            <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4">
              <p className="text-2xl font-bold text-blue-700 dark:text-blue-300">{journeyStatus.queued ?? 0}</p>
              <p className="text-sm text-blue-600 dark:text-blue-400 mt-1">Queued</p>
            </div>
            <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-4">
              <p className="text-2xl font-bold text-green-700 dark:text-green-300">{journeyStatus.active ?? 0}</p>
              <p className="text-sm text-green-600 dark:text-green-400 mt-1">Active</p>
            </div>
            <div className="bg-gray-50 dark:bg-gray-700/40 rounded-lg p-4">
              <p className="text-2xl font-bold text-gray-700 dark:text-gray-300">{journeyStatus.completed ?? 0}</p>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Completed</p>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderFleet = () => {
    if (!reportData) return null;
    const o  = reportData.operations ?? {};
    const fc = reportData.fuelConsumption ?? {};
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard label="Active Trucks"      value={(o.totalTrucks ?? 0).toString()}              icon={Truck}       color="purple" />
          <StatCard label="Total Trips"        value={(o.totalTrips ?? 0).toString()}               icon={Package}     color="blue"   />
          <StatCard label="Avg Fuel / Trip"    value={`${Math.round(o.averageFuelPerTrip ?? 0)} L`} icon={Fuel}        color="orange" />
          <StatCard label="Completion Rate"    value={`${o.onTimeDelivery ?? 0}%`}                  icon={CheckCircle} color="green"  />
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-lg border dark:border-gray-700 p-5">
          <h3 className="text-base font-semibold text-gray-800 dark:text-gray-100 mb-2">Fleet Efficiency Summary</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">Based on fuel records for the selected period</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <div className="space-y-2">
              <div className="flex justify-between py-2 border-b dark:border-gray-700">
                <span className="text-gray-600 dark:text-gray-400">Total fuel records</span>
                <span className="font-medium text-gray-900 dark:text-gray-100">{o.totalFuelRecords ?? 0}</span>
              </div>
              <div className="flex justify-between py-2 border-b dark:border-gray-700">
                <span className="text-gray-600 dark:text-gray-400">Total fuel consumed</span>
                <span className="font-medium text-gray-900 dark:text-gray-100">{(fc.total ?? 0).toLocaleString()} L</span>
              </div>
              <div className="flex justify-between py-2">
                <span className="text-gray-600 dark:text-gray-400">Fuel per truck (avg)</span>
                <span className="font-medium text-gray-900 dark:text-gray-100">{o.totalTrucks ? Math.round((fc.total ?? 0) / o.totalTrucks).toLocaleString() : '—'} L</span>
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex justify-between py-2 border-b dark:border-gray-700">
                <span className="text-gray-600 dark:text-gray-400">Trips per truck (avg)</span>
                <span className="font-medium text-gray-900 dark:text-gray-100">{o.totalTrucks ? (o.totalTrips / o.totalTrucks).toFixed(1) : '—'}</span>
              </div>
              <div className="flex justify-between py-2 border-b dark:border-gray-700">
                <span className="text-gray-600 dark:text-gray-400">Active journeys</span>
                <span className="font-medium text-gray-900 dark:text-gray-100">{o.journeyStatus?.active ?? 0}</span>
              </div>
              <div className="flex justify-between py-2">
                <span className="text-gray-600 dark:text-gray-400">Completed journeys</span>
                <span className="font-medium text-gray-900 dark:text-gray-100">{o.journeyStatus?.completed ?? 0}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderLpoStation = () => {
    if (!reportData) return null;
    const fc = reportData.fuelConsumption ?? {};
    return (
      <div className="space-y-6">
        <div className="bg-white dark:bg-gray-800 rounded-lg border dark:border-gray-700 p-5">
          <h3 className="text-base font-semibold text-gray-800 dark:text-gray-100 mb-1">Station LPO Fuel Spend</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">Litres purchased via LPO per fuel station — ranked highest to lowest</p>
          {fc.byStation?.length ? (
            <div className="space-y-3">
              {fc.byStation.map((s: any, i: number) => {
                const pct = fc.byStation[0]?.value ? Math.round((s.value / fc.byStation[0].value) * 100) : 0;
                return (
                  <div key={s.name}>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-gray-700 dark:text-gray-300 font-medium">#{i + 1} &nbsp;{s.name}</span>
                      <span className="text-gray-900 dark:text-gray-100 font-semibold">{s.value.toLocaleString()} L</span>
                    </div>
                    <div className="h-2 bg-gray-100 dark:bg-gray-700 rounded-full">
                      <div className="h-2 rounded-full bg-indigo-500" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : <p className="text-sm text-gray-400">No station LPO data for this period</p>}
        </div>
      </div>
    );
  };

  const renderDoActivity = () => {
    if (!reportData) return null;
    const o = reportData.operations ?? {};
    const f = reportData.financials ?? {};
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
          <StatCard label="Total DOs"         value={(o.totalTrips ?? 0).toString()}          icon={Package}    color="blue"   />
          <StatCard label="Total Revenue"     value={formatCurrency(f.totalRevenue ?? 0)}     icon={DollarSign} color="green"  />
          <StatCard label="Avg Revenue / DO"  value={formatCurrency(o.totalTrips ? (f.totalRevenue / o.totalTrips) : 0)} icon={TrendingUp} color="purple" />
        </div>

        {/* Monthly DO breakdown */}
        {reportData.trends?.length > 0 && (
          <div className="bg-white dark:bg-gray-800 rounded-lg border dark:border-gray-700 p-5">
            <h3 className="text-base font-semibold text-gray-800 dark:text-gray-100 mb-4">DO Activity by Month</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b dark:border-gray-700">
                    <th className="text-left py-2 text-gray-500 dark:text-gray-400 font-medium">Month</th>
                    <th className="text-right py-2 text-gray-500 dark:text-gray-400 font-medium">DOs</th>
                    <th className="text-right py-2 text-gray-500 dark:text-gray-400 font-medium">LPOs</th>
                    <th className="text-right py-2 text-gray-500 dark:text-gray-400 font-medium">Fuel (L)</th>
                    <th className="text-right py-2 text-gray-500 dark:text-gray-400 font-medium">Revenue</th>
                  </tr>
                </thead>
                <tbody>
                  {reportData.trends.map((t: any) => (
                    <tr key={`${t.month}-${t.year}`} className="border-b dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-700/30">
                      <td className="py-2 text-gray-800 dark:text-gray-200">{t.month} {t.year}</td>
                      <td className="py-2 text-right text-gray-700 dark:text-gray-300">{t.dos ?? '-'}</td>
                      <td className="py-2 text-right text-gray-700 dark:text-gray-300">{t.lpos ?? '-'}</td>
                      <td className="py-2 text-right text-gray-700 dark:text-gray-300">{t.fuel.toLocaleString()}</td>
                      <td className="py-2 text-right text-gray-700 dark:text-gray-300">{formatCurrency(t.revenue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderExportHub = () => (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Workbook Exports */}
        <div className="bg-white dark:bg-gray-800 rounded-lg border dark:border-gray-700 p-5">
          <h3 className="text-base font-semibold text-gray-800 dark:text-gray-100 mb-1">Workbook Exports</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">Download the latest yearly formatted workbooks</p>
          <div className="space-y-3">
            <button onClick={() => exportExcel('do')} disabled={exporting} className="w-full flex items-center gap-3 px-4 py-3 bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/40 border border-blue-200 dark:border-blue-800 rounded-lg transition-colors disabled:opacity-50 text-left">
              <FileText className="w-5 h-5 text-blue-600 dark:text-blue-400 flex-shrink-0" />
              <div>
                <p className="font-medium text-blue-900 dark:text-blue-100 text-sm">Delivery Orders Workbook</p>
                <p className="text-xs text-blue-600 dark:text-blue-400">Full formatted DO workbook (.xlsx)</p>
              </div>
              <Download className="w-4 h-4 text-blue-500 ml-auto" />
            </button>
            <button onClick={() => exportExcel('lpo')} disabled={exporting} className="w-full flex items-center gap-3 px-4 py-3 bg-purple-50 dark:bg-purple-900/20 hover:bg-purple-100 dark:hover:bg-purple-900/40 border border-purple-200 dark:border-purple-800 rounded-lg transition-colors disabled:opacity-50 text-left">
              <MapPin className="w-5 h-5 text-purple-600 dark:text-purple-400 flex-shrink-0" />
              <div>
                <p className="font-medium text-purple-900 dark:text-purple-100 text-sm">LPO Workbook</p>
                <p className="text-xs text-purple-600 dark:text-purple-400">Full formatted LPO workbook (.xlsx)</p>
              </div>
              <Download className="w-4 h-4 text-purple-500 ml-auto" />
            </button>
            <button onClick={() => exportExcel('fuel')} disabled={exporting} className="w-full flex items-center gap-3 px-4 py-3 bg-orange-50 dark:bg-orange-900/20 hover:bg-orange-100 dark:hover:bg-orange-900/40 border border-orange-200 dark:border-orange-800 rounded-lg transition-colors disabled:opacity-50 text-left">
              <Fuel className="w-5 h-5 text-orange-600 dark:text-orange-400 flex-shrink-0" />
              <div>
                <p className="font-medium text-orange-900 dark:text-orange-100 text-sm">Fuel Records Export</p>
                <p className="text-xs text-orange-600 dark:text-orange-400">All fuel records (.xlsx)</p>
              </div>
              <Download className="w-4 h-4 text-orange-500 ml-auto" />
            </button>
          </div>
        </div>

        {/* Summary Export */}
        <div className="bg-white dark:bg-gray-800 rounded-lg border dark:border-gray-700 p-5">
          <h3 className="text-base font-semibold text-gray-800 dark:text-gray-100 mb-1">Admin Summary Report</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">Multi-sheet Excel with P&L, fuel breakdown, station spend, and monthly trends for the selected date range</p>
          <div className="space-y-2 text-sm text-gray-600 dark:text-gray-400 mb-5">
            <p className="flex items-center gap-2"><span className="text-green-500">✓</span> Executive Summary (KPIs)</p>
            <p className="flex items-center gap-2"><span className="text-green-500">✓</span> Fuel Consumed by Yard</p>
            <p className="flex items-center gap-2"><span className="text-green-500">✓</span> Station LPO Spend Ranking</p>
            <p className="flex items-center gap-2"><span className="text-green-500">✓</span> Monthly Trends (DOs, LPOs, Fuel, Revenue)</p>
          </div>
          <div className="mb-3">
            <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1 block">Period</label>
            <select
              value={dateRange}
              onChange={(e) => setDateRange(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm focus:ring-2 focus:ring-indigo-500"
            >
              {DATE_RANGES.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
            </select>
          </div>
          <button onClick={exportSummaryExcel} disabled={exporting} className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-medium text-sm transition-colors disabled:opacity-50">
            <Download className="w-4 h-4" />
            {exporting ? 'Generating...' : 'Download Admin Report (.xlsx)'}
          </button>
        </div>
      </div>
    </div>
  );

  const renderContent = () => {
    if (loading) {
      return (
        <div className="flex items-center justify-center h-48">
          <div className="text-center">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-600 mx-auto" />
            <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">Loading report data...</p>
          </div>
        </div>
      );
    }
    if (!reportData && activeReport !== 'export_hub') {
      return (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
          <p className="text-sm text-red-800 dark:text-red-400">Failed to load data. <button className="underline font-medium" onClick={loadReportData}>Retry</button></p>
        </div>
      );
    }
    switch (activeReport) {
      case 'overview':    return renderOverview();
      case 'financial':   return renderFinancial();
      case 'fuel':        return renderFuel();
      case 'fleet':       return renderFleet();
      case 'lpo_station': return renderLpoStation();
      case 'do_activity': return renderDoActivity();
      case 'export_hub':  return renderExportHub();
      default:            return null;
    }
  };

  const activeTab = REPORT_TABS.find(t => t.id === activeReport)!;

  return (
    <div className="space-y-6">
      {/* Report Type Tabs */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border dark:border-gray-700 p-1 flex flex-wrap gap-1">
        {REPORT_TABS.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveReport(tab.id)}
              title={tab.description}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                activeReport === tab.id
                  ? 'bg-indigo-600 text-white'
                  : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
              }`}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Controls bar — hidden on export hub */}
      {activeReport !== 'export_hub' && (
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <p className="text-xs text-gray-500 dark:text-gray-400">{activeTab.description}</p>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={dateRange}
              onChange={(e) => setDateRange(e.target.value)}
              className="px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm focus:ring-2 focus:ring-indigo-500"
            >
              {DATE_RANGES.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
            </select>
            <button
              onClick={loadReportData}
              disabled={loading}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 rounded-lg text-sm transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
            <button
              onClick={exportCurrentTab}
              disabled={exporting || !reportData}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
            >
              <Download className="w-4 h-4" />
              {exporting ? 'Exporting...' : 'Export'}
            </button>
          </div>
        </div>
      )}

      {/* Report Content */}
      {renderContent()}
    </div>
  );
}
