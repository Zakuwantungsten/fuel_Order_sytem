import { useState, useEffect } from 'react';
import { BarChart2, Droplets, TrendingUp, Truck, FileText, Download, FileSpreadsheet, Loader2 } from 'lucide-react';
import { useTangaWorkbook, useTangaYears } from '../hooks/useTangaLPOs';
import UnifiedTabLoader from './SuperAdmin/common/UnifiedTabLoader';
import { tangaLPOAPI } from '../services/api';
import { toast } from 'react-toastify';
import type { TangaLPO } from '../types';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

interface MonthSummary {
  month: number;
  lpoCount: number;
  truckCount: number;
  totalLiters: number;
  totalAmount: number;
}

function computeSummaries(months: Record<number, TangaLPO[]>): MonthSummary[] {
  return Object.entries(months).map(([monthStr, lpos]) => {
    const month = Number(monthStr);
    const activeEntries = lpos.flatMap(lpo => lpo.entries.filter(e => !e.isCancelled));
    const truckSet = new Set(activeEntries.map(e => e.truckNo));
    const totalLiters = activeEntries.reduce((sum, e) => sum + e.liters, 0);
    const totalAmount = activeEntries.reduce((sum, e) => sum + e.amount, 0);
    return { month, lpoCount: lpos.length, truckCount: truckSet.size, totalLiters, totalAmount };
  }).sort((a, b) => a.month - b.month);
}

export default function TangaLPOSummary() {
  const currentYear = new Date().getFullYear();

  const [selectedYear, setSelectedYear] = useState<number>(() => {
    const s = localStorage.getItem('tanga-lpo:selectedYear');
    return s ? parseInt(s, 10) : currentYear;
  });
  const [downloadingMonth, setDownloadingMonth] = useState<number | null>(null);
  const [exportingMonth, setExportingMonth] = useState<number | null>(null);
  const [isExportingYear, setIsExportingYear] = useState(false);

  const handleDownloadMonth = async (month: number) => {
    setDownloadingMonth(month);
    try {
      await tangaLPOAPI.downloadMonthPDF(selectedYear, month);
      toast.success('PDF downloaded');
    } catch {
      toast.error('Failed to generate PDF');
    } finally {
      setDownloadingMonth(null);
    }
  };

  const handleExportMonth = async (month: number) => {
    if (exportingMonth != null || isExportingYear) return;
    setExportingMonth(month);
    try {
      await tangaLPOAPI.exportSummaryMonth({
        year: selectedYear,
        month: MONTH_ABBR[month - 1],
      });
      toast.success('Excel exported');
    } catch {
      toast.error('Failed to export Excel summary');
    } finally {
      setExportingMonth(null);
    }
  };

  const handleExportYear = async () => {
    if (exportingMonth != null || isExportingYear) return;
    setIsExportingYear(true);
    try {
      await tangaLPOAPI.exportSummaryYear({ year: selectedYear });
      toast.success('Year Excel exported');
    } catch {
      toast.error('Failed to export year summary');
    } finally {
      setIsExportingYear(false);
    }
  };

  const { data: years = [currentYear] } = useTangaYears();
  const { data: workbookData, isLoading } = useTangaWorkbook(selectedYear);

  useEffect(() => {
    localStorage.setItem('tanga-lpo:selectedYear', String(selectedYear));
  }, [selectedYear]);

  const months: Record<number, TangaLPO[]> =
    (workbookData?.months as Record<number, TangaLPO[]>) ?? {};
  const summaries = computeSummaries(months);

  const totals = summaries.reduce(
    (acc, row) => ({
      lpoCount: acc.lpoCount + row.lpoCount,
      truckCount: acc.truckCount + row.truckCount,
      totalLiters: acc.totalLiters + row.totalLiters,
      totalAmount: acc.totalAmount + row.totalAmount,
    }),
    { lpoCount: 0, truckCount: 0, totalLiters: 0, totalAmount: 0 }
  );

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-2">
          <BarChart2 className="w-4 h-4 text-blue-500" />
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200">Monthly Summary</h2>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={selectedYear}
            onChange={e => setSelectedYear(Number(e.target.value))}
            className="px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            {years.map(y => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
          <button
            type="button"
            onClick={handleExportYear}
            disabled={isExportingYear || summaries.length === 0}
            className="inline-flex items-center px-3 py-1.5 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isExportingYear ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <FileSpreadsheet className="w-4 h-4 mr-1.5" />}
            Export Year
          </button>
        </div>
      </div>

      {isLoading ? (
        <UnifiedTabLoader label="Loading summary…" heightClassName="h-48" />
      ) : summaries.length === 0 ? (
        <div className="py-16 text-center">
          <BarChart2 className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
          <p className="text-gray-500 dark:text-gray-400 font-medium">
            No LPOs recorded for {selectedYear}
          </p>
        </div>
      ) : (
        <>
          {/* Summary stat pills */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-4 bg-gray-50 dark:bg-gray-900/30 border-b border-gray-200 dark:border-gray-700">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-lg bg-blue-500">
                <FileText className="w-4 h-4 text-white" />
              </div>
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400">Total LPOs</p>
                <p className="text-base font-bold text-gray-900 dark:text-gray-100">{totals.lpoCount}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-lg bg-indigo-500">
                <Truck className="w-4 h-4 text-white" />
              </div>
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400">Unique Trucks</p>
                <p className="text-base font-bold text-gray-900 dark:text-gray-100">{totals.truckCount}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-lg bg-cyan-500">
                <Droplets className="w-4 h-4 text-white" />
              </div>
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400">Total Liters</p>
                <p className="text-base font-bold text-gray-900 dark:text-gray-100">{totals.totalLiters.toLocaleString()}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-lg bg-green-500">
                <TrendingUp className="w-4 h-4 text-white" />
              </div>
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400">Total Amount</p>
                <p className="text-base font-bold text-gray-900 dark:text-gray-100">
                  {totals.totalAmount >= 1_000_000
                    ? `${(totals.totalAmount / 1_000_000).toFixed(1)}M`
                    : totals.totalAmount.toLocaleString()}
                </p>
              </div>
            </div>
          </div>

          {/* Monthly breakdown table */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-700 border-b border-gray-200 dark:border-gray-600">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Month</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide"># LPOs</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Trucks Served</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Total Liters</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Total Amount (TZS)</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Export</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                {summaries.map(row => (
                  <tr key={row.month} className="hover:bg-gray-50 dark:hover:bg-gray-750 transition-colors">
                    <td className="px-4 py-3 font-medium text-gray-900 dark:text-gray-100">
                      {MONTH_NAMES[row.month - 1]} {selectedYear}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-700 dark:text-gray-300">{row.lpoCount}</td>
                    <td className="px-4 py-3 text-right text-gray-700 dark:text-gray-300">{row.truckCount}</td>
                    <td className="px-4 py-3 text-right text-gray-700 dark:text-gray-300">{row.totalLiters.toLocaleString()}</td>
                    <td className="px-4 py-3 text-right font-medium text-gray-900 dark:text-gray-100">
                      {row.totalAmount.toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <div className="inline-flex items-center gap-1.5">
                        <button
                          onClick={() => handleExportMonth(row.month)}
                          disabled={exportingMonth === row.month || isExportingYear}
                          title={`Export Excel for ${MONTH_NAMES[row.month - 1]} ${selectedYear}`}
                          className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-md bg-indigo-50 text-indigo-700 hover:bg-indigo-100 dark:bg-indigo-900/30 dark:text-indigo-400 dark:hover:bg-indigo-900/50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                          {exportingMonth === row.month ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <FileSpreadsheet className="w-3.5 h-3.5" />
                          )}
                          Excel
                        </button>
                        <button
                          onClick={() => handleDownloadMonth(row.month)}
                          disabled={downloadingMonth === row.month}
                          title={`Download all LPOs for ${MONTH_NAMES[row.month - 1]} ${selectedYear}`}
                          className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-md bg-blue-50 text-blue-700 hover:bg-blue-100 dark:bg-blue-900/30 dark:text-blue-400 dark:hover:bg-blue-900/50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                          {downloadingMonth === row.month ? (
                            <span className="w-3.5 h-3.5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                          ) : (
                            <Download className="w-3.5 h-3.5" />
                          )}
                          PDF
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-blue-50 dark:bg-blue-900/20 border-t-2 border-blue-200 dark:border-blue-700">
                <tr>
                  <td className="px-4 py-3 font-bold text-gray-900 dark:text-gray-100">Totals</td>
                  <td className="px-4 py-3 text-right font-bold text-gray-900 dark:text-gray-100">{totals.lpoCount}</td>
                  <td className="px-4 py-3 text-right font-bold text-gray-900 dark:text-gray-100">{totals.truckCount}</td>
                  <td className="px-4 py-3 text-right font-bold text-gray-900 dark:text-gray-100">{totals.totalLiters.toLocaleString()}</td>
                  <td className="px-4 py-3 text-right font-bold text-gray-900 dark:text-gray-100">{totals.totalAmount.toLocaleString()}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
