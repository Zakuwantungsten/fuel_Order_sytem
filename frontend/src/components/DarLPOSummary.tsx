import { useState, useEffect, useMemo, useRef } from 'react';
import {
  BarChart2, Droplets, TrendingUp, Truck, FileText, Download,
  FileSpreadsheet, Loader2, Calendar, ChevronDown,
} from 'lucide-react';
import { useDarWorkbook, useDarYears } from '../hooks/useDarLPOs';
import UnifiedTabLoader from './SuperAdmin/common/UnifiedTabLoader';
import { darLPOAPI } from '../services/api';
import { toast } from 'react-toastify';
import type { DarLPO } from '../types';

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

function computeSummaries(months: Record<number, DarLPO[]>): MonthSummary[] {
  return Object.entries(months).map(([monthStr, lpos]) => {
    const month = Number(monthStr);
    const activeEntries = lpos.flatMap(lpo => lpo.entries.filter(e => !e.isCancelled));
    const truckSet = new Set(activeEntries.map(e => e.truckNo));
    const totalLiters = activeEntries.reduce((sum, e) => sum + e.liters, 0);
    const totalAmount = activeEntries.reduce((sum, e) => sum + e.amount, 0);
    return { month, lpoCount: lpos.length, truckCount: truckSet.size, totalLiters, totalAmount };
  }).sort((a, b) => a.month - b.month);
}

export default function DarLPOSummary() {
  const currentYear = new Date().getFullYear();

  const [selectedYear, setSelectedYear] = useState<number>(() => {
    const s = localStorage.getItem('dar-lpo:selectedYear');
    return s ? parseInt(s, 10) : currentYear;
  });
  const [selectedMonths, setSelectedMonths] = useState<number[]>([]);
  const [showMonthDropdown, setShowMonthDropdown] = useState(false);
  const monthDropdownRef = useRef<HTMLDivElement>(null);

  const [downloadingMonth, setDownloadingMonth] = useState<number | null>(null);
  const [exportingMonth, setExportingMonth] = useState<number | null>(null);
  const [isExportingFiltered, setIsExportingFiltered] = useState(false);
  const [isExportingYear, setIsExportingYear] = useState(false);

  const { data: years = [currentYear] } = useDarYears();
  const { data: workbookData, isLoading } = useDarWorkbook(selectedYear);

  useEffect(() => {
    localStorage.setItem('dar-lpo:selectedYear', String(selectedYear));
  }, [selectedYear]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (monthDropdownRef.current && !monthDropdownRef.current.contains(event.target as Node)) {
        setShowMonthDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const months: Record<number, DarLPO[]> =
    (workbookData?.months as Record<number, DarLPO[]>) ?? {};
  const summaries = useMemo(() => computeSummaries(months), [months]);
  const availableMonths = useMemo(() => summaries.map(s => s.month), [summaries]);
  const availableMonthsKey = availableMonths.join(',');

  useEffect(() => {
    if (availableMonths.length === 0) {
      setSelectedMonths([]);
      return;
    }
    setSelectedMonths(prev => {
      const kept = prev.filter(m => availableMonths.includes(m));
      return kept.length > 0 ? kept : availableMonths;
    });
  }, [availableMonthsKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const filteredSummaries = useMemo(
    () => summaries.filter(row => selectedMonths.includes(row.month)),
    [summaries, selectedMonths]
  );

  const totals = filteredSummaries.reduce(
    (acc, row) => ({
      lpoCount: acc.lpoCount + row.lpoCount,
      truckCount: acc.truckCount + row.truckCount,
      totalLiters: acc.totalLiters + row.totalLiters,
      totalAmount: acc.totalAmount + row.totalAmount,
    }),
    { lpoCount: 0, truckCount: 0, totalLiters: 0, totalAmount: 0 }
  );

  const isBusy = exportingMonth != null || isExportingFiltered || isExportingYear;
  const allMonthsSelected =
    availableMonths.length > 0 && selectedMonths.length === availableMonths.length;

  const monthLabel =
    selectedMonths.length === 0
      ? 'Select Month'
      : selectedMonths.length === 1
        ? MONTH_NAMES[selectedMonths[0] - 1]
        : allMonthsSelected
          ? 'All Months'
          : `${selectedMonths.length} months`;

  const toggleMonth = (month: number) => {
    setSelectedMonths(prev => {
      if (prev.includes(month)) {
        if (prev.length === 1) return prev;
        return prev.filter(m => m !== month).sort((a, b) => a - b);
      }
      return [...prev, month].sort((a, b) => a - b);
    });
  };

  const handleDownloadMonth = async (month: number) => {
    setDownloadingMonth(month);
    try {
      await darLPOAPI.downloadMonthPDF(selectedYear, month);
      toast.success('PDF downloaded');
    } catch {
      toast.error('Failed to generate PDF');
    } finally {
      setDownloadingMonth(null);
    }
  };

  const handleExportMonth = async (month: number) => {
    if (isBusy) return;
    setExportingMonth(month);
    try {
      await darLPOAPI.exportSummaryMonth({
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

  const handleExportFiltered = async () => {
    if (selectedMonths.length === 0 || isBusy) return;
    setIsExportingFiltered(true);
    try {
      if (selectedMonths.length === 1) {
        await darLPOAPI.exportSummaryMonth({
          year: selectedYear,
          month: MONTH_ABBR[selectedMonths[0] - 1],
        });
      } else {
        await darLPOAPI.exportSummaryYear({
          year: selectedYear,
          months: selectedMonths.map(m => MONTH_ABBR[m - 1]),
        });
      }
      toast.success('Excel exported');
    } catch {
      toast.error('Failed to export filtered summary');
    } finally {
      setIsExportingFiltered(false);
    }
  };

  const handleExportYear = async () => {
    if (isBusy || summaries.length === 0) return;
    setIsExportingYear(true);
    try {
      await darLPOAPI.exportSummaryYear({ year: selectedYear });
      toast.success('Year Excel exported');
    } catch {
      toast.error('Failed to export year summary');
    } finally {
      setIsExportingYear(false);
    }
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-2">
          <BarChart2 className="w-4 h-4 text-green-500" />
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200">Monthly Summary</h2>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={selectedYear}
            onChange={e => setSelectedYear(Number(e.target.value))}
            className="px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-green-500 focus:border-transparent"
          >
            {years.map(y => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>

          {/* Month multi-select */}
          <div className="relative" ref={monthDropdownRef}>
            <button
              type="button"
              onClick={() => setShowMonthDropdown(v => !v)}
              disabled={availableMonths.length === 0}
              className="px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 flex items-center gap-2 disabled:opacity-50"
            >
              <Calendar className="w-4 h-4 text-gray-400" />
              <span>{monthLabel}</span>
              <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${showMonthDropdown ? 'rotate-180' : ''}`} />
            </button>
            {showMonthDropdown && availableMonths.length > 0 && (
              <div className="absolute right-0 z-50 mt-1 w-56 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md shadow-lg max-h-64 overflow-auto">
                <div className="p-2 border-b border-gray-200 dark:border-gray-600 space-y-0.5">
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedMonths(availableMonths);
                      setShowMonthDropdown(false);
                    }}
                    className="w-full text-left px-2 py-1 text-sm text-green-600 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/30 rounded"
                  >
                    All Months ({availableMonths.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedMonths([availableMonths[availableMonths.length - 1]]);
                      setShowMonthDropdown(false);
                    }}
                    className="w-full text-left px-2 py-1 text-sm text-green-600 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/30 rounded"
                  >
                    Latest Month Only
                  </button>
                </div>
                <div className="p-2">
                  {availableMonths.map(month => (
                    <label
                      key={month}
                      className="flex items-center px-2 py-1.5 hover:bg-gray-100 dark:hover:bg-gray-600 rounded cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={selectedMonths.includes(month)}
                        onChange={() => toggleMonth(month)}
                        className="w-4 h-4 text-green-600 border-gray-300 rounded focus:ring-green-500"
                      />
                      <span className="ml-2 text-sm text-gray-700 dark:text-gray-300">
                        {MONTH_NAMES[month - 1]}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={handleExportFiltered}
            disabled={isBusy || selectedMonths.length === 0}
            className="inline-flex items-center px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm text-sm font-medium text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isExportingFiltered ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Download className="w-4 h-4 mr-1.5" />}
            Export Filtered
          </button>
          <button
            type="button"
            onClick={handleExportYear}
            disabled={isBusy || summaries.length === 0}
            className="inline-flex items-center px-3 py-1.5 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-green-600 hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
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
      ) : filteredSummaries.length === 0 ? (
        <div className="py-16 text-center">
          <Calendar className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
          <p className="text-gray-500 dark:text-gray-400 font-medium">
            Select at least one month to view summary
          </p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-4 bg-gray-50 dark:bg-gray-900/30 border-b border-gray-200 dark:border-gray-700">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-lg bg-green-500">
                <FileText className="w-4 h-4 text-white" />
              </div>
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400">Total LPOs</p>
                <p className="text-base font-bold text-gray-900 dark:text-gray-100">{totals.lpoCount}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-lg bg-teal-500">
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
              <div className="p-2 rounded-lg bg-emerald-500">
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
                {filteredSummaries.map(row => (
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
                          disabled={isBusy}
                          title={`Export Excel for ${MONTH_NAMES[row.month - 1]} ${selectedYear}`}
                          className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-md bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-900/30 dark:text-emerald-400 dark:hover:bg-emerald-900/50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
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
                          className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-md bg-green-50 text-green-700 hover:bg-green-100 dark:bg-green-900/30 dark:text-green-400 dark:hover:bg-green-900/50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                          {downloadingMonth === row.month ? (
                            <span className="w-3.5 h-3.5 border-2 border-green-500 border-t-transparent rounded-full animate-spin" />
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
              <tfoot className="bg-green-50 dark:bg-green-900/20 border-t-2 border-green-200 dark:border-green-700">
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
