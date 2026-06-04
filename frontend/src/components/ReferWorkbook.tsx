import React, { useState, useEffect, useRef } from 'react';
import {
  Copy, FileSpreadsheet, FileDown, Download,
  Calendar, ChevronDown, Truck, Image, Check, MessageSquare, Loader2
} from 'lucide-react';
import { toast } from 'react-toastify';
import type { LPOEntry, LPOSummary } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { lpoDocumentsAPI } from '../services/api';
import { useReferEntries } from '../hooks/useLPOs';
import { copyLPOImageToClipboard, downloadLPOImage } from '../utils/lpoImageGenerator';
import { copyLPOForWhatsApp, copyLPOTextToClipboard } from '../utils/lpoTextGenerator';
import XLSX from 'xlsx-js-style';

interface ReferWorkbookProps {
  onNavigateToSheet?: (lpoNo: string, year: number) => void;
}

const ReferWorkbook: React.FC<ReferWorkbookProps> = ({ onNavigateToSheet }) => {
  const { user } = useAuth();
  const { data: referEntries = [], isLoading: loading } = useReferEntries();

  const [searchTerm, setSearchTerm] = useState('');
  const [showCopyDropdown, setShowCopyDropdown] = useState(false);
  const [stationFilter, setStationFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [dateFilter, setDateFilter] = useState({ from: '', to: '' });
  const [selectedPeriods, setSelectedPeriods] = useState<Array<{ year: number; month: number }>>([
    { year: new Date().getFullYear(), month: new Date().getMonth() + 1 }
  ]);
  const [showMonthDropdown, setShowMonthDropdown] = useState(false);
  const [showStationDropdown, setShowStationDropdown] = useState(false);
  const [openEntryDropdown, setOpenEntryDropdown] = useState<string | number | null>(null);
  const [entryDropdownPosition, setEntryDropdownPosition] = useState<{ top?: number; bottom?: number; left: number }>({ left: 0 });
  const [downloadingPdf, setDownloadingPdf] = useState<string | number | null>(null);
  const [downloadingImage, setDownloadingImage] = useState<string | number | null>(null);

  const stationDropdownRef = useRef<HTMLDivElement>(null);
  const monthDropdownRef = useRef<HTMLDivElement>(null);
  const wasAutoFallback = useRef(false);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (stationDropdownRef.current && !stationDropdownRef.current.contains(event.target as Node)) {
        setShowStationDropdown(false);
      }
      if (monthDropdownRef.current && !monthDropdownRef.current.contains(event.target as Node)) {
        setShowMonthDropdown(false);
      }
    };
    const handleScroll = (event: Event) => {
      const target = event.target as Node;
      if (stationDropdownRef.current?.contains(target) || monthDropdownRef.current?.contains(target)) return;
      setShowStationDropdown(false);
      setShowMonthDropdown(false);
      setShowCopyDropdown(false);
    };
    const scrollEl = document.getElementById('main-scroll-container');
    document.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('scroll', handleScroll, true);
    scrollEl?.addEventListener('scroll', handleScroll);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('scroll', handleScroll, true);
      scrollEl?.removeEventListener('scroll', handleScroll);
    };
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (openEntryDropdown !== null && !(event.target as Element).closest('.relative')) {
        setOpenEntryDropdown(null);
      }
    };
    const handleScroll = () => setOpenEntryDropdown(null);
    document.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('scroll', handleScroll, true);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('scroll', handleScroll, true);
    };
  }, [openEntryDropdown]);

  const MONTH_NAMES = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  const availableStations = React.useMemo(() => {
    const stations = new Set<string>();
    referEntries.forEach(entry => {
      if (entry.dieselAt?.trim()) stations.add(entry.dieselAt.trim().toUpperCase());
    });
    return Array.from(stations).sort();
  }, [referEntries]);

  const availablePeriods = React.useMemo(() => {
    const seen = new Map<string, { year: number; month: number }>();
    referEntries.forEach(entry => {
      if (!entry.createdAt) return;
      const d = new Date(entry.createdAt);
      if (isNaN(d.getTime())) return;
      const year = d.getFullYear();
      const month = d.getMonth() + 1;
      const key = `${year}-${month}`;
      if (!seen.has(key)) seen.set(key, { year, month });
    });
    return Array.from(seen.values()).sort((a, b) =>
      b.year !== a.year ? b.year - a.year : b.month - a.month
    );
  }, [referEntries]);

  const togglePeriod = (year: number, month: number) => {
    wasAutoFallback.current = false;
    setSelectedPeriods(prev => {
      const exists = prev.some(p => p.year === year && p.month === month);
      if (exists) {
        if (prev.length === 1) return prev;
        return prev.filter(p => !(p.year === year && p.month === month));
      }
      return [...prev, { year, month }].sort((a, b) =>
        b.year !== a.year ? b.year - a.year : b.month - a.month
      );
    });
  };

  const getPeriodsDisplayText = (): string => {
    if (selectedPeriods.length === 0) return 'Select Period';
    if (selectedPeriods.length === 1) {
      const p = selectedPeriods[0];
      return `${MONTH_NAMES[p.month - 1]} ${p.year}`;
    }
    if (selectedPeriods.length === availablePeriods.length && availablePeriods.length > 0) return 'All Periods';
    return `${selectedPeriods.length} periods`;
  };

  const filteredEntries = referEntries.filter(entry => {
    const matchesSearch = !searchTerm ||
      entry.truckNo?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      entry.lpoNo?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      entry.dieselAt?.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesStation = !stationFilter || entry.dieselAt?.toUpperCase() === stationFilter;

    let matchesPeriod = true;
    if (selectedPeriods.length > 0 && entry.createdAt) {
      const d = new Date(entry.createdAt);
      if (!isNaN(d.getTime())) {
        const entryYear = d.getFullYear();
        const entryMonth = d.getMonth() + 1;
        matchesPeriod = selectedPeriods.some(p => p.year === entryYear && p.month === entryMonth);
      }
    }

    const matchesStatus =
      statusFilter === 'all' ||
      (statusFilter === 'active' && !entry.isCancelled) ||
      (statusFilter === 'cancelled' && entry.isCancelled);

    const entryDateStr = entry.createdAt ? entry.createdAt.slice(0, 10) : '';
    const matchesDateFrom = !dateFilter.from || entryDateStr >= dateFilter.from;
    const matchesDateTo = !dateFilter.to || entryDateStr <= dateFilter.to;

    return matchesSearch && matchesStation && matchesPeriod && matchesStatus && matchesDateFrom && matchesDateTo;
  });

  useEffect(() => {
    if (loading || referEntries.length === 0) return;
    const now = new Date();
    const defYear = now.getFullYear(), defMonth = now.getMonth() + 1;
    if (selectedPeriods.length !== 1 || selectedPeriods[0].year !== defYear || selectedPeriods[0].month !== defMonth) return;
    const currentMonthAll = referEntries.filter(entry => {
      if (!entry.createdAt) return false;
      const d = new Date(entry.createdAt);
      return !isNaN(d.getTime()) && d.getFullYear() === defYear && d.getMonth() + 1 === defMonth;
    });
    if (currentMonthAll.length === 0 && availablePeriods.length > 0) {
      wasAutoFallback.current = true;
      setSelectedPeriods([availablePeriods[0]]);
    }
  }, [referEntries, loading, availablePeriods, selectedPeriods]);

  useEffect(() => {
    if (!wasAutoFallback.current || loading) return;
    const now = new Date();
    const defYear = now.getFullYear(), defMonth = now.getMonth() + 1;
    const currentMonthHasData = referEntries.some(entry => {
      if (!entry.createdAt) return false;
      const d = new Date(entry.createdAt);
      return !isNaN(d.getTime()) && d.getFullYear() === defYear && d.getMonth() + 1 === defMonth;
    });
    if (currentMonthHasData) {
      wasAutoFallback.current = false;
      setSelectedPeriods([{ year: defYear, month: defMonth }]);
    }
  }, [referEntries, loading]);

  const formatCurrency = (amount: number): string =>
    new Intl.NumberFormat('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(amount);

  const formatEntryDate = (dateStr?: string): string => {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return `${d.getDate()}-${d.toLocaleDateString('en-US', { month: 'short' })}`;
  };

  const fetchFullLPO = async (lpoNo: string): Promise<LPOSummary | null> => {
    try {
      const lpo = await lpoDocumentsAPI.getByLpoNo(lpoNo);
      return lpo || null;
    } catch {
      return null;
    }
  };

  const handleCopyEntryAsImage = async (entry: LPOEntry) => {
    try {
      const lpo = await fetchFullLPO(entry.lpoNo);
      if (!lpo) { toast.error('Could not find full LPO data'); return; }
      const success = await copyLPOImageToClipboard(lpo, user?.username);
      if (success) toast.success(`Image copied: LPO ${entry.lpoNo}`, { autoClose: 4000 });
      else toast.error('Failed to copy image to clipboard.');
    } catch { toast.error('Failed to copy image.'); }
  };

  const handleCopyWhatsApp = async (entry: LPOEntry) => {
    try {
      const lpo = await fetchFullLPO(entry.lpoNo);
      if (!lpo) { toast.error('Could not find full LPO data'); return; }
      const success = await copyLPOForWhatsApp(lpo);
      if (success) toast.success(`WhatsApp text copied: LPO ${entry.lpoNo}`, { autoClose: 4000 });
      else toast.error('Failed to copy WhatsApp text.');
    } catch { toast.error('Failed to copy WhatsApp text.'); }
  };

  const handleCopyCsvText = async (entry: LPOEntry) => {
    try {
      const lpo = await fetchFullLPO(entry.lpoNo);
      if (!lpo) { toast.error('Could not find full LPO data'); return; }
      const success = await copyLPOTextToClipboard(lpo);
      if (success) toast.success(`CSV text copied: LPO ${entry.lpoNo}`, { autoClose: 4000 });
      else toast.error('Failed to copy CSV text.');
    } catch { toast.error('Failed to copy CSV text.'); }
  };

  const handleDownloadEntryPDF = async (entry: LPOEntry) => {
    const lpoKey = entry.id || entry.lpoNo;
    setDownloadingPdf(lpoKey);
    const toastId = toast.loading(`Preparing PDF \u2014 LPO ${entry.lpoNo}...`, { style: { background: '#0284c7', color: '#fff' } });
    try {
      const lpo = await fetchFullLPO(entry.lpoNo);
      if (!lpo) throw new Error('LPO not found');
      await lpoDocumentsAPI.downloadPDF(lpo.id!);
      toast.update(toastId, { render: `PDF downloaded: LPO ${entry.lpoNo}`, type: 'success', isLoading: false, autoClose: 4000, style: undefined });
    } catch (error: any) {
      toast.update(toastId, { render: `PDF download failed: ${error?.message || 'Unknown error'}`, type: 'error', isLoading: false, autoClose: 6000, style: undefined });
    } finally { setDownloadingPdf(null); }
  };

  const handleDownloadEntryImage = async (entry: LPOEntry) => {
    const lpoKey = entry.id || entry.lpoNo;
    setDownloadingImage(lpoKey);
    const toastId = toast.loading(`Preparing image \u2014 LPO ${entry.lpoNo}...`, { style: { background: '#0284c7', color: '#fff' } });
    try {
      const lpo = await fetchFullLPO(entry.lpoNo);
      if (!lpo) throw new Error('LPO not found');
      await downloadLPOImage(lpo, undefined, user?.username);
      toast.update(toastId, { render: `Image downloaded: LPO ${entry.lpoNo}`, type: 'success', isLoading: false, autoClose: 4000, style: undefined });
    } catch (error: any) {
      toast.update(toastId, { render: `Image download failed: ${error?.message || 'Unknown error'}`, type: 'error', isLoading: false, autoClose: 6000, style: undefined });
    } finally { setDownloadingImage(null); }
  };

  const exportToExcel = () => {
    if (filteredEntries.length === 0) return;
    const data = filteredEntries.map((entry, index) => ({
      'S/N': index + 1,
      'Date': entry.date || formatEntryDate(entry.createdAt),
      'LPO No': entry.lpoNo,
      'Station': entry.dieselAt,
      'Truck No': entry.truckNo,
      'Ltrs': entry.ltrs,
      'Rate': entry.pricePerLtr,
      'Amount': (entry.ltrs || 0) * (entry.pricePerLtr || 0),
      'Destination': entry.destinations || 'REFER',
      'Status': entry.isCancelled ? 'CANCELLED' : 'ACTIVE',
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');
    const borderStyle = { top: { style: 'thin', color: { rgb: '000000' } }, bottom: { style: 'thin', color: { rgb: '000000' } }, left: { style: 'thin', color: { rgb: '000000' } }, right: { style: 'thin', color: { rgb: '000000' } } };
    for (let row = range.s.r; row <= range.e.r; row++) {
      for (let col = range.s.c; col <= range.e.c; col++) {
        const cellRef = XLSX.utils.encode_cell({ r: row, c: col });
        if (!ws[cellRef]) ws[cellRef] = { v: '', t: 's' };
        ws[cellRef].s = row === 0
          ? { border: borderStyle, alignment: { horizontal: 'center', vertical: 'center' }, font: { bold: true }, fill: { fgColor: { rgb: 'FDE8D0' } } }
          : { border: borderStyle, alignment: { horizontal: 'center', vertical: 'center' } };
      }
    }
    ws['!cols'] = [{ wch: 6 }, { wch: 12 }, { wch: 12 }, { wch: 15 }, { wch: 12 }, { wch: 10 }, { wch: 10 }, { wch: 15 }, { wch: 15 }, { wch: 10 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Refer Entries');
    XLSX.writeFile(wb, 'REFER_ENTRIES.xlsx');
  };

  const copyToClipboard = async (format: 'text' | 'whatsapp') => {
    if (filteredEntries.length === 0) return;
    let text = '';
    if (format === 'whatsapp') {
      text = '*REFER ENTRIES*\n\n';
      filteredEntries.forEach((entry, index) => {
        text += `${index + 1}. *${entry.truckNo}*${entry.isCancelled ? ' [CANCELLED]' : ''}\n`;
        text += `   Date: ${entry.date}\n`;
        text += `   ${entry.ltrs}L @ ${entry.pricePerLtr}\n`;
        text += `   Amount: ${((entry.ltrs || 0) * (entry.pricePerLtr || 0)).toLocaleString()}\n`;
        text += `   Station: ${entry.dieselAt}\n\n`;
      });
      const totLtrs = filteredEntries.filter(e => !e.isCancelled).reduce((s, e) => s + (e.ltrs || 0), 0);
      const totAmt = filteredEntries.filter(e => !e.isCancelled).reduce((s, e) => s + (e.ltrs || 0) * (e.pricePerLtr || 0), 0);
      text += `*TOTAL (active): ${totLtrs}L - ${totAmt.toLocaleString()}*`;
    } else {
      text = `REFER ENTRIES\n${'='.repeat(50)}\n\n`;
      filteredEntries.forEach((entry, index) => {
        text += `${index + 1}. ${entry.truckNo} - ${entry.date}${entry.isCancelled ? ' [CANCELLED]' : ''}\n`;
        text += `   ${entry.ltrs}L @ ${entry.pricePerLtr} = ${(entry.ltrs || 0) * (entry.pricePerLtr || 0)}\n`;
        text += `   Station: ${entry.dieselAt}\n\n`;
      });
    }
    try {
      await navigator.clipboard.writeText(text);
      toast.success('Copied to clipboard!');
    } catch { toast.error('Failed to copy to clipboard'); }
    setShowCopyDropdown(false);
  };

  const clearFilters = () => {
    setSearchTerm('');
    setStationFilter('');
    setStatusFilter('all');
    setDateFilter({ from: '', to: '' });
    wasAutoFallback.current = false;
    setSelectedPeriods(
      availablePeriods.length > 0
        ? [availablePeriods[0]]
        : [{ year: new Date().getFullYear(), month: new Date().getMonth() + 1 }]
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-600"></div>
      </div>
    );
  }

  const activeEntries = filteredEntries.filter(e => !e.isCancelled);
  const totalLiters = activeEntries.reduce((s, e) => s + (e.ltrs || 0), 0);
  const totalAmount = activeEntries.reduce((s, e) => s + (e.ltrs || 0) * (e.pricePerLtr || 0), 0);
  const cancelledCount = filteredEntries.filter(e => e.isCancelled).length;
  const now = new Date();

  return (
    <div className="h-full flex flex-col bg-white dark:bg-gray-800">
      {/* Header */}
      <div className="border-b dark:border-gray-700 px-4 sm:px-6 py-3 sm:py-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center space-x-3">
            <Truck className="w-5 h-5 sm:w-6 sm:h-6 text-orange-600" />
            <h1 className="text-lg sm:text-xl font-bold text-gray-900 dark:text-gray-100">Refer Trucks</h1>
            <span className="px-2 py-1 bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 text-sm rounded-full">
              {filteredEntries.length} entries
            </span>
            {cancelledCount > 0 && (
              <span className="px-2 py-1 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 text-xs rounded-full">
                {cancelledCount} cancelled
              </span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <button
                onClick={() => setShowCopyDropdown(!showCopyDropdown)}
                className="inline-flex items-center px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700"
              >
                <Download className="w-4 h-4 mr-2" />Export<ChevronDown className="w-3 h-3 ml-1" />
              </button>
              {showCopyDropdown && (
                <div className="absolute right-0 mt-1 w-48 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg shadow-lg z-50">
                  <button onClick={() => copyToClipboard('text')} className="flex items-center w-full px-4 py-2 text-left text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-600"><Copy className="w-4 h-4 mr-2" />Copy as Text</button>
                  <button onClick={() => copyToClipboard('whatsapp')} className="flex items-center w-full px-4 py-2 text-left text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-600"><FileSpreadsheet className="w-4 h-4 mr-2" />Copy for WhatsApp</button>
                  <div className="border-t border-gray-200 dark:border-gray-600"></div>
                  <button onClick={exportToExcel} className="flex items-center w-full px-4 py-2 text-left text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-600"><FileDown className="w-4 h-4 mr-2 text-green-600" />Export to Excel</button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Summary Stats */}
      <div className="px-4 sm:px-6 py-2">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
          <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-3 transition-colors">
            <div className="text-xs text-gray-600 dark:text-gray-400">Active Entries</div>
            <div className="text-lg font-bold text-gray-900 dark:text-gray-100">{activeEntries.length}</div>
          </div>
          <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-3 transition-colors">
            <div className="text-xs text-gray-600 dark:text-gray-400">Total Liters (active)</div>
            <div className="text-lg font-bold text-gray-900 dark:text-gray-100">{formatCurrency(totalLiters)}</div>
          </div>
          <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-3 transition-colors">
            <div className="text-xs text-gray-600 dark:text-gray-400">Total Amount (active)</div>
            <div className="text-lg font-bold text-gray-900 dark:text-gray-100">{formatCurrency(totalAmount)}</div>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-3 mb-3 transition-colors">
          <div className="grid grid-cols-1 md:grid-cols-6 gap-3">
            {/* Search */}
            <div>
              <input
                type="text"
                placeholder="Search LPO#, Truck, Station..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-md focus:ring-2 focus:ring-orange-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500"
              />
            </div>

            {/* Month Multi-Select */}
            <div className="relative" ref={monthDropdownRef}>
              <button
                onClick={() => setShowMonthDropdown(!showMonthDropdown)}
                className="w-full flex items-center justify-between px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 hover:bg-gray-50 dark:hover:bg-gray-600"
              >
                <span className="flex items-center"><Calendar className="w-4 h-4 mr-2 text-gray-400" />{getPeriodsDisplayText()}</span>
                <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${showMonthDropdown ? 'rotate-180' : ''}`} />
              </button>
              {showMonthDropdown && (
                <div className="absolute z-50 mt-1 w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-md shadow-lg max-h-64 overflow-y-auto left-0 right-0">
                  <div className="p-2 border-b border-gray-200 dark:border-gray-600 space-y-1">
                    {availablePeriods.some(p => p.year === now.getFullYear() && p.month === now.getMonth() + 1) && (
                      <button
                        onClick={() => { wasAutoFallback.current = false; setSelectedPeriods([{ year: now.getFullYear(), month: now.getMonth() + 1 }]); setShowMonthDropdown(false); }}
                        className="w-full text-left px-2 py-1 text-sm text-orange-600 dark:text-orange-400 hover:bg-orange-50 dark:hover:bg-orange-900/30 rounded"
                      >
                        Current Month ({MONTH_NAMES[now.getMonth()]} {now.getFullYear()})
                      </button>
                    )}
                    <button
                      onClick={() => { wasAutoFallback.current = false; setSelectedPeriods(availablePeriods.length > 0 ? [...availablePeriods] : [{ year: now.getFullYear(), month: now.getMonth() + 1 }]); setShowMonthDropdown(false); }}
                      className="w-full text-left px-2 py-1 text-sm text-orange-600 dark:text-orange-400 hover:bg-orange-50 dark:hover:bg-orange-900/30 rounded"
                    >
                      All Periods ({availablePeriods.length})
                    </button>
                  </div>
                  <div className="p-2">
                    {availablePeriods.length > 0 ? (() => {
                      const byYear = availablePeriods.reduce<Record<number, number[]>>((acc, p) => {
                        if (!acc[p.year]) acc[p.year] = [];
                        acc[p.year].push(p.month);
                        return acc;
                      }, {});
                      return Object.entries(byYear).sort(([a], [b]) => Number(b) - Number(a)).map(([yearStr, months]) => (
                        <div key={yearStr}>
                          <div className="px-2 pt-2 pb-0.5 text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">{yearStr}</div>
                          {months.map(monthNum => (
                            <label key={`${yearStr}-${monthNum}`} className="flex items-center px-2 py-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded cursor-pointer">
                              <input
                                type="checkbox"
                                checked={selectedPeriods.some(p => p.year === Number(yearStr) && p.month === monthNum)}
                                onChange={() => togglePeriod(Number(yearStr), monthNum)}
                                className="w-4 h-4 text-orange-600 border-gray-300 rounded focus:ring-orange-500"
                              />
                              <span className="ml-2 text-sm text-gray-700 dark:text-gray-300">{MONTH_NAMES[monthNum - 1]}</span>
                            </label>
                          ))}
                        </div>
                      ));
                    })() : (
                      <div className="px-2 py-1.5 text-sm text-gray-500 dark:text-gray-400">No data available</div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Station Dropdown */}
            <div className="relative" ref={stationDropdownRef}>
              <button
                type="button"
                onClick={() => setShowStationDropdown(!showStationDropdown)}
                className="w-full px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 flex items-center justify-between gap-2"
              >
                <span>{stationFilter || 'All Stations'}</span>
                <ChevronDown className="w-4 h-4 text-gray-400" />
              </button>
              {showStationDropdown && (
                <div className="absolute z-50 mt-1 w-full bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md shadow-lg max-h-60 overflow-auto">
                  <button type="button" onClick={() => { setStationFilter(''); setShowStationDropdown(false); }} className="w-full px-4 py-2 text-left hover:bg-gray-100 dark:hover:bg-gray-600 text-gray-900 dark:text-gray-100 flex items-center justify-between">
                    <span>All Stations</span>{stationFilter === '' && <Check className="w-4 h-4 text-orange-600" />}
                  </button>
                  {availableStations.map(station => (
                    <button key={station} type="button" onClick={() => { setStationFilter(station); setShowStationDropdown(false); }} className="w-full px-4 py-2 text-left hover:bg-gray-100 dark:hover:bg-gray-600 text-gray-900 dark:text-gray-100 flex items-center justify-between">
                      <span>{station}</span>{stationFilter === station && <Check className="w-4 h-4 text-orange-600" />}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Date From */}
            <input
              type="date"
              value={dateFilter.from}
              onChange={(e) => setDateFilter(prev => ({ ...prev, from: e.target.value }))}
              className="px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-md focus:ring-2 focus:ring-orange-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
            />

            {/* Status Filter */}
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-md focus:ring-2 focus:ring-orange-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
            >
              <option value="all">All Status</option>
              <option value="active">Active</option>
              <option value="cancelled">Cancelled</option>
            </select>

            {/* Clear Filters */}
            <button
              onClick={clearFilters}
              className="inline-flex items-center justify-center px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm text-sm font-medium text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            >
              Clear Filters
            </button>
          </div>
        </div>
      </div>

      {/* Entries */}
      <div className="flex-1 overflow-auto px-4 sm:px-6 pb-4">
        {filteredEntries.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-gray-500 dark:text-gray-400">
            <Truck className="w-12 h-12 mb-3 text-orange-300 dark:text-orange-700" />
            <p>No refer entries found</p>
            <p className="text-sm mt-1">Create refer entries by typing "REF" in the DO field of the main LPO form</p>
          </div>
        ) : (
          <>
            {/* Mobile card view */}
            <div className="md:hidden space-y-2">
              {filteredEntries.map((entry, index) => (
                <div
                  key={entry.id || `${entry.lpoNo}-${index}`}
                  className={`border rounded-lg p-3 cursor-pointer ${entry.isCancelled ? 'border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-900/20' : 'border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800'}`}
                  onClick={() => {
                    if (onNavigateToSheet && entry.lpoNo) {
                      const entryDate = entry.createdAt ? new Date(entry.createdAt) : new Date();
                      const year = !isNaN(entryDate.getTime()) ? entryDate.getFullYear() : new Date().getFullYear();
                      onNavigateToSheet(entry.lpoNo, year);
                    }
                  }}
                >
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="flex-shrink-0 w-6 h-6 flex items-center justify-center rounded-full bg-orange-100 dark:bg-orange-900/30 text-[10px] font-bold text-orange-700 dark:text-orange-300">{index + 1}</span>
                      <div className="min-w-0">
                        <p className={`text-sm font-bold truncate ${entry.isCancelled ? 'text-red-600 dark:text-red-400 line-through' : 'text-gray-900 dark:text-gray-100'}`}>{entry.truckNo}</p>
                        {entry.isCancelled && <span className="px-1.5 py-0.5 text-[10px] font-bold bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-300 rounded">CANCELLED</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <span className="px-1.5 py-0.5 bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 rounded text-[10px] font-bold">REF</span>
                      <div className="relative">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            const rect = e.currentTarget.getBoundingClientRect();
                            const DROPDOWN_HEIGHT = 260;
                            const spaceBelow = window.innerHeight - rect.bottom;
                            const dropLeft = Math.max(8, Math.min(rect.right - 224, window.innerWidth - 232));
                            setEntryDropdownPosition(spaceBelow >= DROPDOWN_HEIGHT ? { top: rect.bottom + 4, left: dropLeft } : { bottom: window.innerHeight - rect.top + 4, left: dropLeft });
                            setOpenEntryDropdown(openEntryDropdown === entry.id ? null : entry.id!);
                          }}
                          className="p-1 text-orange-600 dark:text-orange-400 hover:text-orange-900 dark:hover:text-orange-300 rounded hover:bg-orange-50 dark:hover:bg-orange-900/20"
                        >
                          <ChevronDown className="w-4 h-4" />
                        </button>
                        {openEntryDropdown === entry.id && (
                          <div
                            className="fixed w-56 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-md shadow-xl z-[9999]"
                            style={{ top: entryDropdownPosition.top !== undefined ? `${entryDropdownPosition.top}px` : 'auto', bottom: entryDropdownPosition.bottom !== undefined ? `${entryDropdownPosition.bottom}px` : 'auto', left: `${entryDropdownPosition.left}px`, maxWidth: 'calc(100vw - 20px)' }}
                          >
                            <div className="py-1">
                              <div className="px-3 py-2 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Copy Options</div>
                              <button onClick={() => { handleCopyEntryAsImage(entry); setOpenEntryDropdown(null); }} className="flex items-center w-full px-4 py-2 text-left text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700"><Image className="w-4 h-4 mr-2" />Copy as Image</button>
                              <button onClick={() => { handleCopyWhatsApp(entry); setOpenEntryDropdown(null); }} className="flex items-center w-full px-4 py-2 text-left text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700"><MessageSquare className="w-4 h-4 mr-2" />Copy for WhatsApp</button>
                              <button onClick={() => { handleCopyCsvText(entry); setOpenEntryDropdown(null); }} className="flex items-center w-full px-4 py-2 text-left text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700"><FileSpreadsheet className="w-4 h-4 mr-2" />Copy as CSV Text</button>
                              <div className="border-t border-gray-200 dark:border-gray-600 my-1" />
                              <div className="px-3 py-2 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Download Options</div>
                              <button onClick={() => { handleDownloadEntryPDF(entry); setOpenEntryDropdown(null); }} disabled={downloadingPdf === (entry.id || entry.lpoNo)} className="flex items-center w-full px-4 py-2 text-left text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50">
                                {downloadingPdf === (entry.id || entry.lpoNo) ? <Loader2 className="w-4 h-4 mr-2 text-red-600 animate-spin" /> : <FileDown className="w-4 h-4 mr-2 text-red-600" />}
                                {downloadingPdf === (entry.id || entry.lpoNo) ? 'Downloading...' : 'Download as PDF'}
                              </button>
                              <button onClick={() => { handleDownloadEntryImage(entry); setOpenEntryDropdown(null); }} disabled={downloadingImage === (entry.id || entry.lpoNo)} className="flex items-center w-full px-4 py-2 text-left text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50">
                                {downloadingImage === (entry.id || entry.lpoNo) ? <Loader2 className="w-4 h-4 mr-2 text-green-600 animate-spin" /> : <Download className="w-4 h-4 mr-2 text-green-600" />}
                                {downloadingImage === (entry.id || entry.lpoNo) ? 'Downloading...' : 'Download as Image'}
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                    <div><span className="text-gray-400 dark:text-gray-500">Date: </span><span className="text-gray-700 dark:text-gray-300">{entry.date || formatEntryDate(entry.createdAt)}</span></div>
                    <div><span className="text-gray-400 dark:text-gray-500">Station: </span><span className="text-gray-700 dark:text-gray-300">{entry.dieselAt}</span></div>
                    <div><span className="text-gray-400 dark:text-gray-500">LPO: </span><span className="text-orange-600 dark:text-orange-400">{entry.lpoNo}</span></div>
                    <div><span className="text-gray-400 dark:text-gray-500">Dest: </span><span className="text-gray-700 dark:text-gray-300">{entry.destinations || 'REFER'}</span></div>
                  </div>
                  <div className="mt-2 flex items-center gap-3 text-xs border-t border-gray-100 dark:border-gray-700 pt-2">
                    <div><span className="text-gray-400 dark:text-gray-500">Ltrs: </span><span className="font-semibold text-gray-900 dark:text-gray-100">{(entry.ltrs || 0).toLocaleString()}</span></div>
                    <div><span className="text-gray-400 dark:text-gray-500">Rate: </span><span className="text-gray-700 dark:text-gray-300">{(entry.pricePerLtr || 0).toFixed(2)}</span></div>
                    <div className="ml-auto"><span className="text-gray-400 dark:text-gray-500">Amt: </span><span className="font-bold text-gray-900 dark:text-gray-100">{formatCurrency((entry.ltrs || 0) * (entry.pricePerLtr || 0))}</span></div>
                  </div>
                </div>
              ))}
            </div>

            {/* Desktop table view */}
            <div className="hidden md:block overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700 border dark:border-gray-700">
                <thead className="bg-orange-50 dark:bg-orange-900/20">
                  <tr>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">S/N</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Date</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">LPO No.</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Station</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">DO/SDO</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Truck No.</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Ltrs</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">$/L</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Dest.</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Amount</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                  {filteredEntries.map((entry, index) => (
                    <tr
                      key={entry.id || `${entry.lpoNo}-${index}`}
                      className={`transition-colors cursor-pointer ${entry.isCancelled ? 'bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/30' : 'hover:bg-orange-50 dark:hover:bg-orange-900/10'}`}
                      onClick={() => {
                        if (onNavigateToSheet && entry.lpoNo) {
                          const entryDate = entry.createdAt ? new Date(entry.createdAt) : new Date();
                          const year = !isNaN(entryDate.getTime()) ? entryDate.getFullYear() : new Date().getFullYear();
                          onNavigateToSheet(entry.lpoNo, year);
                        }
                      }}
                    >
                      <td className="px-3 py-2 whitespace-nowrap text-xs text-gray-900 dark:text-gray-100">{index + 1}</td>
                      <td className="px-3 py-2 text-xs text-gray-900 dark:text-gray-100">{entry.date || formatEntryDate(entry.createdAt)}</td>
                      <td className="px-3 py-2 text-xs font-medium text-orange-600 dark:text-orange-400">
                        <span className={entry.isCancelled ? 'line-through' : ''}>{entry.lpoNo}</span>
                        {entry.isCancelled && <span className="ml-1 px-1 py-0.5 text-[10px] font-bold bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-300 rounded">CANCELLED</span>}
                      </td>
                      <td className="px-3 py-2 text-xs text-gray-900 dark:text-gray-100">{entry.dieselAt}</td>
                      <td className="px-3 py-2 text-xs">
                        <span className="px-1.5 py-0.5 bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 rounded text-[10px] font-bold">REF</span>
                      </td>
                      <td className="px-3 py-2 text-xs text-gray-900 dark:text-gray-100">{entry.truckNo}</td>
                      <td className="px-3 py-2 text-xs text-gray-900 dark:text-gray-100">{(entry.ltrs || 0).toLocaleString()}</td>
                      <td className="px-3 py-2 text-xs text-gray-900 dark:text-gray-100">{(entry.pricePerLtr || 0).toFixed(2)}</td>
                      <td className="px-3 py-2 text-xs text-gray-900 dark:text-gray-100">{entry.destinations || 'REFER'}</td>
                      <td className="px-3 py-2 text-xs font-semibold text-gray-900 dark:text-gray-100">{formatCurrency((entry.ltrs || 0) * (entry.pricePerLtr || 0))}</td>
                      <td className="px-3 py-2 whitespace-nowrap text-xs text-gray-500 dark:text-gray-400" onClick={(e) => e.stopPropagation()}>
                        <div className="relative">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              const rect = e.currentTarget.getBoundingClientRect();
                              const DROPDOWN_HEIGHT = 260;
                              const spaceBelow = window.innerHeight - rect.bottom;
                              const dropLeft = Math.max(8, Math.min(rect.right - 224, window.innerWidth - 232));
                              setEntryDropdownPosition(spaceBelow >= DROPDOWN_HEIGHT ? { top: rect.bottom + 4, left: dropLeft } : { bottom: window.innerHeight - rect.top + 4, left: dropLeft });
                              setOpenEntryDropdown(openEntryDropdown === entry.id ? null : entry.id!);
                            }}
                            className="flex items-center px-2 py-1 text-orange-600 dark:text-orange-400 hover:text-orange-900 dark:hover:text-orange-300 hover:bg-orange-50 dark:hover:bg-orange-900/20 rounded"
                            title="Copy/Download LPO"
                          >
                            <Copy className="w-4 h-4 mr-1" /><ChevronDown className="w-3 h-3" />
                          </button>
                          {openEntryDropdown === entry.id && (
                            <div
                              className="fixed w-56 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-md shadow-xl z-[9999]"
                              style={{ top: entryDropdownPosition.top !== undefined ? `${entryDropdownPosition.top}px` : 'auto', bottom: entryDropdownPosition.bottom !== undefined ? `${entryDropdownPosition.bottom}px` : 'auto', left: `${entryDropdownPosition.left}px`, maxWidth: 'calc(100vw - 20px)' }}
                            >
                              <div className="py-1">
                                <div className="px-3 py-2 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Copy Options</div>
                                <button onClick={() => { handleCopyEntryAsImage(entry); setOpenEntryDropdown(null); }} className="flex items-center w-full px-4 py-2 text-left text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700"><Image className="w-4 h-4 mr-2" />Copy as Image</button>
                                <button onClick={() => { handleCopyWhatsApp(entry); setOpenEntryDropdown(null); }} className="flex items-center w-full px-4 py-2 text-left text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700"><MessageSquare className="w-4 h-4 mr-2" />Copy for WhatsApp</button>
                                <button onClick={() => { handleCopyCsvText(entry); setOpenEntryDropdown(null); }} className="flex items-center w-full px-4 py-2 text-left text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700"><FileSpreadsheet className="w-4 h-4 mr-2" />Copy as CSV Text</button>
                                <div className="border-t border-gray-200 dark:border-gray-600 my-1" />
                                <div className="px-3 py-2 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Download Options</div>
                                <button
                                  onClick={() => { handleDownloadEntryPDF(entry); setOpenEntryDropdown(null); }}
                                  disabled={downloadingPdf === (entry.id || entry.lpoNo)}
                                  className="flex items-center w-full px-4 py-2 text-left text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                  {downloadingPdf === (entry.id || entry.lpoNo) ? <Loader2 className="w-4 h-4 mr-2 text-red-600 animate-spin" /> : <FileDown className="w-4 h-4 mr-2 text-red-600" />}
                                  {downloadingPdf === (entry.id || entry.lpoNo) ? 'Downloading...' : 'Download as PDF'}
                                </button>
                                <button
                                  onClick={() => { handleDownloadEntryImage(entry); setOpenEntryDropdown(null); }}
                                  disabled={downloadingImage === (entry.id || entry.lpoNo)}
                                  className="flex items-center w-full px-4 py-2 text-left text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                  {downloadingImage === (entry.id || entry.lpoNo) ? <Loader2 className="w-4 h-4 mr-2 text-green-600 animate-spin" /> : <Download className="w-4 h-4 mr-2 text-green-600" />}
                                  {downloadingImage === (entry.id || entry.lpoNo) ? 'Downloading...' : 'Download as Image'}
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default ReferWorkbook;
