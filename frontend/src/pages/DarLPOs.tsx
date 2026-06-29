import { useState, useEffect, useMemo } from 'react';
import { Plus, Search, X, FileText, Droplets, TrendingUp, Truck, AlertTriangle, ChevronLeft, ChevronRight, ChevronDown, BookOpen, List, BarChart2, FilePlus, Copy, Image as ImageIcon, MessageSquare, FileSpreadsheet, Download, FileDown, Loader2 } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-toastify';
import { useAuth } from '../contexts/AuthContext';
import { useDarLPOList, useDarNextNumber, useDarFilterOptions, darLPOKeys } from '../hooks/useDarLPOs';
import { useRealtimeSync } from '../hooks/useRealtimeSync';
import DarYardLPOForm from '../components/DarYardLPOForm';
import DarLPOWorkbook from '../components/DarLPOWorkbook';
import DarLPOSummary from '../components/DarLPOSummary';
import UnifiedTabLoader from '../components/SuperAdmin/common/UnifiedTabLoader';
import { copyLPOImageToClipboard, downloadLPOImage } from '../utils/lpoImageGenerator';
import { copyLPOForWhatsApp, copyLPOTextToClipboard } from '../utils/lpoTextGenerator';
import { darLPOAPI } from '../services/api';
import type { DarLPO, LPOSummary as LPOSummaryType } from '../types';

const WRITE_ROLES = ['super_admin', 'admin', 'manager', 'supervisor', 'dar_yard'];
const STATION_LABEL = 'Dar Yard';
const LIMIT = 20;
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function StatCard({ label, value, sub, icon: Icon, accent, onClick, isLoading }: {
  label: string;
  value: string | number;
  sub?: string;
  icon: React.ElementType;
  accent: string;
  onClick?: () => void;
  isLoading?: boolean;
}) {
  return (
    <div
      className={`bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 flex items-start gap-3 transition-colors ${onClick ? 'cursor-pointer hover:border-amber-400 dark:hover:border-amber-500 hover:shadow-sm' : ''}`}
      onClick={onClick}
    >
      <div className={`p-2.5 rounded-lg ${accent}`}>
        <Icon className="w-5 h-5 text-white" />
      </div>
      <div>
        <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">{label}</p>
        {isLoading ? (
          <div className="h-7 w-20 mt-0.5 rounded bg-gray-200 dark:bg-gray-700 animate-pulse" />
        ) : (
          <p className="text-xl font-bold text-gray-900 dark:text-gray-100 mt-0.5">{value}</p>
        )}
        {sub && !isLoading && <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

const monthOf = (date: string) => parseInt(date.slice(5, 7), 10) || 0;

// Whitespace/separator-tolerant prefix match — mirrors the backend buildFuzzyRegex
// so the displayed rows match what the server returned ("t598 dtb" finds "T598DTB").
const compactStr = (s: string) => s.replace(/[\s\-_/.]+/g, '').toLowerCase();
const fuzzyMatch = (value: string | undefined, term: string): boolean => {
  const q = compactStr(term);
  if (!q) return true;
  return compactStr(value || '').startsWith(q);
};

export default function DarLPOs() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const canWrite = WRITE_ROLES.includes(user?.role ?? '');

  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth() + 1;

  const [viewMode, setViewMode] = useState<'list' | 'workbook' | 'summary'>('list');
  const [page, setPage] = useState(1);
  // Server-side filters (drive the paginated fetch)
  const [search, setSearch] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  // Client-side filters (refine the fetched page)
  const [filterMonth, setFilterMonth] = useState<number | 'all'>('all');
  const [entityFilter, setEntityFilter] = useState('');
  const [linkedFilter, setLinkedFilter] = useState<'all' | 'linked' | 'unlinked'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'cancelled'>('all');
  const [showForm, setShowForm] = useState(false);
  const [showAddEntries, setShowAddEntries] = useState(false);

  // Row → workbook navigation target (set on row click, cleared on plain tab switch)
  const [workbookInitial, setWorkbookInitial] = useState<{ lpoId: string; year: number; month: number; initialTruckNo?: string } | null>(null);

  // Copy/Download dropdown state
  const [openDropdowns, setOpenDropdowns] = useState<{ [key: string]: boolean }>({});
  const [dropdownPosition, setDropdownPosition] = useState<{ top?: number; bottom?: number; left: number }>({ top: 0, left: 0 });
  const [downloadingImage, setDownloadingImage] = useState<string | null>(null);
  const [downloadingPdf, setDownloadingPdf] = useState<string | null>(null);

  useRealtimeSync('dar_lpo_documents', () => {}, 'rt-dar-lpo-page');

  // Server-side paginated list — every filter is applied on the server so
  // pagination stays correct across the whole dataset.
  const { data, isLoading } = useDarLPOList({
    page,
    limit: LIMIT,
    search: search || undefined,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
    month: filterMonth === 'all' ? undefined : filterMonth,
    entity: entityFilter || undefined,
    linked: linkedFilter === 'all' ? undefined : linkedFilter,
    status: statusFilter === 'all' ? undefined : statusFilter,
    order: 'desc',
  });
  const lpos: DarLPO[] = data?.lpos ?? [];
  const pagination = data?.pagination;

  // Dynamic dropdown options across the whole (scoped) dataset
  const { data: filterOptions } = useDarFilterOptions({
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
    search: search || undefined,
    month: filterMonth === 'all' ? undefined : filterMonth,
  });
  const availableMonths = filterOptions?.months ?? [];
  const availableEntities = filterOptions?.entities ?? [];

  // Stats: this-month aggregations from a separate query
  const thisMonthStart = `${currentYear}-${String(currentMonth).padStart(2, '0')}-01`;
  const lastDay = new Date(currentYear, currentMonth, 0).getDate();
  const thisMonthEnd = `${currentYear}-${String(currentMonth).padStart(2, '0')}-${lastDay}`;
  const { data: monthData, isLoading: isMonthLoading } = useDarLPOList(
    { limit: 1000, dateFrom: thisMonthStart, dateTo: thisMonthEnd },
    true
  );

  const { data: nextLpoNo = '' } = useDarNextNumber();

  // Flatten the fetched page into one row per entry
  const allRows = useMemo(
    () => lpos.flatMap(lpo => lpo.entries.map((entry, entryIdx) => ({ lpo, entry, entryIdx }))),
    [lpos]
  );

  // The server already returns only documents that contain a matching entry, but a
  // multi-entry LPO still carries its other entries — trim the displayed rows to the
  // ones that match the active entry-level filters.
  const filteredRows = useMemo(() => {
    const term = search.trim();
    return allRows.filter(({ lpo, entry }) => {
      // Mirror the server-side search at the entry level so multi-entry LPOs only
      // surface the entries that actually match (LPO# / truck / DO / destination).
      if (term && !(
        fuzzyMatch(lpo.lpoNo, term) ||
        fuzzyMatch(entry.truckNo, term) ||
        fuzzyMatch(entry.doNo, term) ||
        fuzzyMatch(entry.dest, term)
      )) return false;
      if (filterMonth !== 'all' && monthOf(lpo.date) !== filterMonth) return false;
      if (entityFilter && entry.truckNo !== entityFilter) return false;
      if (linkedFilter === 'linked' && (entry.isCancelled || !entry.linkedFuelRecordId)) return false;
      if (linkedFilter === 'unlinked' && (entry.isCancelled || entry.linkedFuelRecordId)) return false;
      if (statusFilter === 'active' && entry.isCancelled) return false;
      if (statusFilter === 'cancelled' && !entry.isCancelled) return false;
      return true;
    });
  }, [allRows, search, filterMonth, entityFilter, linkedFilter, statusFilter]);

  // Reset to page 1 whenever any filter changes
  useEffect(() => { setPage(1); }, [search, dateFrom, dateTo, filterMonth, entityFilter, linkedFilter, statusFilter]);

  // Keep Month / Entity selections valid when the available options change
  useEffect(() => {
    if (filterMonth !== 'all' && availableMonths.length > 0 && !availableMonths.includes(filterMonth)) setFilterMonth('all');
  }, [availableMonths.join(','), filterMonth]);
  useEffect(() => {
    if (entityFilter && availableEntities.length > 0 && !availableEntities.includes(entityFilter)) setEntityFilter('');
  }, [availableEntities.join('|'), entityFilter]);

  // Compute month stats from full month fetch
  const monthLpos: DarLPO[] = monthData?.lpos ?? [];
  const monthLiters = monthLpos.reduce(
    (sum, lpo) => sum + lpo.entries.filter(e => !e.isCancelled).reduce((s, e) => s + e.liters, 0),
    0
  );
  const monthAmount = monthLpos.reduce(
    (sum, lpo) => sum + lpo.entries.filter(e => !e.isCancelled).reduce((s, e) => s + e.amount, 0),
    0
  );
  const monthTrucks = new Set(
    monthLpos.flatMap(lpo => lpo.entries.filter(e => !e.isCancelled).map(e => e.truckNo))
  ).size;
  const unlinkedCount = monthLpos.reduce(
    (sum, lpo) => sum + lpo.entries.filter(e => !e.isCancelled && !e.linkedFuelRecordId).length,
    0
  );

  const handleClearFilters = () => {
    setSearch('');
    setDateFrom('');
    setDateTo('');
    setFilterMonth('all');
    setEntityFilter('');
    setLinkedFilter('all');
    setStatusFilter('all');
    setPage(1);
  };

  const hasFilters = !!search || !!dateFrom || !!dateTo || filterMonth !== 'all' || !!entityFilter || linkedFilter !== 'all' || statusFilter !== 'all';

  // ── Copy / Download helpers (whole parent LPO, same as LPO management) ──────
  const convertToLPOSummary = (lpo: DarLPO): LPOSummaryType => {
    const entries = lpo.entries.map(e => ({
      doNo: e.doNo || 'NIL',
      truckNo: e.truckNo,
      liters: e.liters,
      rate: e.rate,
      amount: e.amount,
      dest: e.dest || 'NIL',
    }));
    const total = entries.reduce((sum, e) => sum + e.amount, 0);
    return {
      lpoNo: lpo.lpoNo,
      date: lpo.date,
      station: STATION_LABEL,
      orderOf: 'TAHMEED',
      entries,
      total,
    };
  };

  const closeAllDropdowns = () => setOpenDropdowns({});

  const toggleDropdown = (key: string, event: React.MouseEvent<HTMLButtonElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const DROPDOWN_HEIGHT = 260;
    const DROPDOWN_WIDTH = 224;
    const spaceBelow = window.innerHeight - rect.bottom;
    const left = Math.max(10, Math.min(rect.right - DROPDOWN_WIDTH, window.innerWidth - DROPDOWN_WIDTH - 10));
    if (spaceBelow >= DROPDOWN_HEIGHT) {
      setDropdownPosition({ top: rect.bottom + 4, bottom: undefined, left });
    } else {
      setDropdownPosition({ top: undefined, bottom: window.innerHeight - rect.top + 4, left });
    }
    setOpenDropdowns(prev => ({ ...prev, [key]: !prev[key] }));
  };

  useEffect(() => {
    const handleScroll = () => setOpenDropdowns({});
    const handleClickOutside = (e: MouseEvent) => {
      if (!(e.target as Element).closest('.dar-copy-dropdown')) setOpenDropdowns({});
    };
    window.addEventListener('scroll', handleScroll, true);
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      window.removeEventListener('scroll', handleScroll, true);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const handleCopyImage = async (lpo: DarLPO) => {
    closeAllDropdowns();
    try {
      const ok = await copyLPOImageToClipboard(convertToLPOSummary(lpo), user?.username);
      ok
        ? toast.success('LPO image copied to clipboard. You can now paste it anywhere.')
        : toast.error('Failed to copy LPO image to clipboard. Please try again.');
    } catch (error) {
      console.error('Error copying image to clipboard:', error);
      toast.error('Failed to copy LPO image. Your browser may not support this feature.');
    }
  };

  const handleCopyWhatsApp = async (lpo: DarLPO) => {
    closeAllDropdowns();
    try {
      const ok = await copyLPOForWhatsApp(convertToLPOSummary(lpo));
      ok
        ? toast.success('LPO text for WhatsApp copied. You can now paste it in WhatsApp.')
        : toast.error('Failed to copy LPO text to clipboard. Please try again.');
    } catch (error) {
      console.error('Error copying WhatsApp text:', error);
      toast.error('Failed to copy LPO text to clipboard.');
    }
  };

  const handleCopyCsv = async (lpo: DarLPO) => {
    closeAllDropdowns();
    try {
      const ok = await copyLPOTextToClipboard(convertToLPOSummary(lpo));
      ok
        ? toast.success('LPO CSV text copied to clipboard successfully!')
        : toast.error('Failed to copy LPO CSV text to clipboard. Please try again.');
    } catch (error) {
      console.error('Error copying CSV text:', error);
      toast.error('Failed to copy LPO CSV text to clipboard.');
    }
  };

  const handleDownloadImage = async (lpo: DarLPO) => {
    closeAllDropdowns();
    const key = (lpo._id ?? lpo.id ?? lpo.lpoNo) as string;
    setDownloadingImage(key);
    const toastId = toast.loading(`Preparing image — LPO ${lpo.lpoNo}...`, {
      style: { background: '#16a34a', color: '#fff' },
    });
    try {
      await downloadLPOImage(convertToLPOSummary(lpo), undefined, user?.username);
      toast.update(toastId, {
        render: `Image downloaded: LPO ${lpo.lpoNo}`,
        type: 'success', isLoading: false, autoClose: 4000, style: undefined,
      });
    } catch (error: any) {
      console.error('Error downloading image:', error);
      toast.update(toastId, {
        render: `Image download failed: ${error?.message || 'Unknown error'}`,
        type: 'error', isLoading: false, autoClose: 6000, style: undefined,
      });
    } finally {
      setDownloadingImage(null);
    }
  };

  const handleDownloadPdf = async (lpo: DarLPO) => {
    closeAllDropdowns();
    const key = (lpo._id ?? lpo.id ?? lpo.lpoNo) as string;
    setDownloadingPdf(key);
    const toastId = toast.loading(`Generating PDF — LPO ${lpo.lpoNo}...`, {
      style: { background: '#16a34a', color: '#fff' },
    });
    try {
      await darLPOAPI.downloadPDF(key);
      toast.update(toastId, {
        render: `PDF downloaded: LPO ${lpo.lpoNo}`,
        type: 'success', isLoading: false, autoClose: 4000, style: undefined,
      });
    } catch (error: any) {
      toast.update(toastId, {
        render: `PDF download failed: ${error?.message || 'Unknown error'}`,
        type: 'error', isLoading: false, autoClose: 6000, style: undefined,
      });
    } finally {
      setDownloadingPdf(null);
    }
  };

  // Row click → open the parent LPO's sheet in the Workbook view
  const handleRowClick = (lpo: DarLPO, truckNo?: string) => {
    const lpoId = (lpo._id ?? lpo.id) as string;
    const month = monthOf(lpo.date) || currentMonth;
    setWorkbookInitial({ lpoId, year: lpo.year ?? currentYear, month, initialTruckNo: truckNo });
    setViewMode('workbook');
  };

  const goToWorkbookTab = () => {
    setWorkbookInitial(null);
    setViewMode('workbook');
  };

  // Reusable Copy/Download dropdown menu
  const CopyDownloadMenu = ({ lpo }: { lpo: DarLPO }) => (
    <div
      className="fixed w-56 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-md shadow-xl z-[9999]"
      style={{
        top: dropdownPosition.top !== undefined ? `${dropdownPosition.top}px` : 'auto',
        bottom: dropdownPosition.bottom !== undefined ? `${dropdownPosition.bottom}px` : 'auto',
        left: `${dropdownPosition.left}px`,
        maxWidth: 'calc(100vw - 20px)',
      }}
    >
      <div className="py-1">
        <div className="px-3 py-2 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Copy Options</div>
        <button onClick={() => handleCopyImage(lpo)} className="flex items-center w-full px-4 py-2 text-left text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700">
          <ImageIcon className="w-4 h-4 mr-2" /> Copy as Image
        </button>
        <button onClick={() => handleCopyWhatsApp(lpo)} className="flex items-center w-full px-4 py-2 text-left text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700">
          <MessageSquare className="w-4 h-4 mr-2" /> Copy for WhatsApp
        </button>
        <button onClick={() => handleCopyCsv(lpo)} className="flex items-center w-full px-4 py-2 text-left text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700">
          <FileSpreadsheet className="w-4 h-4 mr-2" /> Copy as CSV Text
        </button>
        <div className="border-t border-gray-200 dark:border-gray-600 my-1" />
        <div className="px-3 py-2 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Download Options</div>
        <button
          onClick={() => handleDownloadImage(lpo)}
          disabled={downloadingImage === (lpo._id ?? lpo.id ?? lpo.lpoNo)}
          className="flex items-center w-full px-4 py-2 text-left text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {downloadingImage === (lpo._id ?? lpo.id ?? lpo.lpoNo)
            ? <Loader2 className="w-4 h-4 mr-2 text-green-600 animate-spin" />
            : <Download className="w-4 h-4 mr-2 text-green-600" />}
          {downloadingImage === (lpo._id ?? lpo.id ?? lpo.lpoNo) ? 'Downloading...' : 'Download as Image'}
        </button>
        <button
          onClick={() => handleDownloadPdf(lpo)}
          disabled={downloadingPdf === (lpo._id ?? lpo.id ?? lpo.lpoNo)}
          className="flex items-center w-full px-4 py-2 text-left text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {downloadingPdf === (lpo._id ?? lpo.id ?? lpo.lpoNo)
            ? <Loader2 className="w-4 h-4 mr-2 text-red-500 animate-spin" />
            : <FileDown className="w-4 h-4 mr-2 text-red-500" />}
          {downloadingPdf === (lpo._id ?? lpo.id ?? lpo.lpoNo) ? 'Generating PDF...' : 'Download as PDF'}
        </button>
      </div>
    </div>
  );

  const fieldCls = 'w-full px-3 h-[38px] text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-green-500 focus:border-transparent';

  return (
    <div className="p-4 lg:p-6 space-y-5 min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Page header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Dar Yard LPO</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            Formal purchase orders for Dar Yard fuel dispensing
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* View toggle */}
          <div className="flex rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
            <button
              onClick={() => setViewMode('list')}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium transition-colors ${
                viewMode === 'list'
                  ? 'bg-green-600 text-white'
                  : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'
              }`}
            >
              <List className="w-3.5 h-3.5" /> List
            </button>
            <button
              onClick={goToWorkbookTab}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium border-l border-gray-200 dark:border-gray-700 transition-colors ${
                viewMode === 'workbook'
                  ? 'bg-green-600 text-white'
                  : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'
              }`}
            >
              <BookOpen className="w-3.5 h-3.5" /> Workbook
            </button>
            <button
              onClick={() => setViewMode('summary')}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium border-l border-gray-200 dark:border-gray-700 transition-colors ${
                viewMode === 'summary'
                  ? 'bg-green-600 text-white'
                  : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'
              }`}
            >
              <BarChart2 className="w-3.5 h-3.5" /> Summary
            </button>
          </div>
          {canWrite && (
            <div className="flex items-center gap-2">
              {lpos.length > 0 && (
                <button
                  onClick={() => setShowAddEntries(true)}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 hover:bg-green-100 dark:hover:bg-green-900/40 rounded-lg transition-colors"
                >
                  <FilePlus className="w-4 h-4" /> Add Entries
                </button>
              )}
              {nextLpoNo && (
                <button
                  onClick={() => setShowForm(true)}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-green-600 hover:bg-green-700 rounded-lg transition-colors shadow-sm"
                >
                  <Plus className="w-4 h-4" /> Add LPO
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          label="LPOs This Month"
          value={monthLpos.length}
          icon={FileText}
          accent="bg-green-500"
          isLoading={isMonthLoading}
        />
        <StatCard
          label="Total Liters"
          value={monthLiters.toLocaleString()}
          sub="This month"
          icon={Droplets}
          accent="bg-cyan-500"
          isLoading={isMonthLoading}
        />
        <StatCard
          label="Total Amount (TZS)"
          value={monthAmount >= 1_000_000
            ? `${(monthAmount / 1_000_000).toFixed(1)}M`
            : monthAmount.toLocaleString()}
          sub="This month"
          icon={TrendingUp}
          accent="bg-emerald-500"
          isLoading={isMonthLoading}
        />
        <StatCard
          label={unlinkedCount > 0 ? 'Unlinked Entries' : 'Trucks Served'}
          value={unlinkedCount > 0 ? unlinkedCount : monthTrucks}
          sub={unlinkedCount > 0 ? 'Click to view & fix' : 'All linked'}
          icon={unlinkedCount > 0 ? AlertTriangle : Truck}
          accent={unlinkedCount > 0 ? 'bg-amber-500' : 'bg-teal-500'}
          isLoading={isMonthLoading}
          onClick={unlinkedCount > 0 ? () => {
            setDateFrom(thisMonthStart);
            setDateTo(thisMonthEnd);
            setFilterMonth('all');
            setEntityFilter('');
            setLinkedFilter('unlinked');
            setStatusFilter('all');
            setViewMode('list');
            setPage(1);
          } : undefined}
        />
      </div>

      {/* Workbook view */}
      {viewMode === 'workbook' && (
        <div className="flex-1 min-h-[600px]">
          <DarLPOWorkbook
            onBack={() => { setWorkbookInitial(null); setViewMode('list'); }}
            initialLpoId={workbookInitial?.lpoId ?? null}
            initialYear={workbookInitial?.year}
            initialMonth={workbookInitial?.month}
            initialTruckNo={workbookInitial?.initialTruckNo}
          />
        </div>
      )}

      {/* Summary view */}
      {viewMode === 'summary' && (
        <DarLPOSummary />
      )}

      {/* Filters + table (list view) */}
      {viewMode === 'list' && <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        {/* Filter bar */}
        <div className="p-4 border-b border-gray-200 dark:border-gray-700">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-9 gap-3">
            {/* Search */}
            <div className="relative col-span-2 md:col-span-1 xl:col-span-2">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search LPO, truck/entity, DO, destination…"
                className={`${fieldCls} pl-9`}
              />
            </div>

            {/* Date range with dash */}
            <div className="col-span-2 md:col-span-2 xl:col-span-2 flex items-center gap-2">
              <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="flex-1 min-w-0 px-3 h-[38px] text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-green-500 focus:border-transparent" title="From date" />
              <span className="text-gray-400 dark:text-gray-500 text-sm font-medium shrink-0">—</span>
              <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="flex-1 min-w-0 px-3 h-[38px] text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-green-500 focus:border-transparent" title="To date" />
            </div>

            {/* Month — dynamic */}
            <select
              value={filterMonth === 'all' ? 'all' : String(filterMonth)}
              onChange={e => setFilterMonth(e.target.value === 'all' ? 'all' : Number(e.target.value))}
              className={fieldCls}
              title="Month"
            >
              <option value="all">All Months</option>
              {availableMonths.map(m => <option key={m} value={m}>{MONTH_NAMES[m - 1]}</option>)}
            </select>

            {/* Entity — dynamic */}
            <select value={entityFilter} onChange={e => setEntityFilter(e.target.value)} className={fieldCls} title="Truck / Entity">
              <option value="">All Trucks / Entities</option>
              {availableEntities.map(en => <option key={en} value={en}>{en}</option>)}
            </select>

            {/* Linked */}
            <select value={linkedFilter} onChange={e => setLinkedFilter(e.target.value as 'all' | 'linked' | 'unlinked')} className={fieldCls} title="Link status">
              <option value="all">All Links</option>
              <option value="linked">Linked</option>
              <option value="unlinked">Unlinked</option>
            </select>

            {/* Status */}
            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value as 'all' | 'active' | 'cancelled')} className={fieldCls} title="Status">
              <option value="all">All Status</option>
              <option value="active">Active</option>
              <option value="cancelled">Cancelled</option>
            </select>

            {/* Clear */}
            <button
              onClick={handleClearFilters}
              disabled={!hasFilters}
              className="col-span-2 md:col-span-1 inline-flex items-center justify-center gap-1 px-3 h-[38px] text-sm font-medium text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <X className="w-4 h-4" /> Clear
            </button>
          </div>
        </div>

        {/* Table */}
        {isLoading ? (
          <UnifiedTabLoader label="Loading Dar LPOs…" heightClassName="h-48" />
        ) : filteredRows.length === 0 ? (
          <div className="py-16 text-center">
            <FileText className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
            <p className="text-gray-500 dark:text-gray-400 font-medium">
              {hasFilters || allRows.length > 0 ? 'No entries match your filters' : 'No Dar LPOs yet'}
            </p>
            {!hasFilters && allRows.length === 0 && canWrite && (
              <button
                onClick={() => setShowForm(true)}
                className="mt-3 text-sm text-green-600 hover:underline"
              >
                Create the first one
              </button>
            )}
          </div>
        ) : (
          <>
            {/* Card view — mobile/tablet (below lg) */}
            <div className="lg:hidden space-y-3 p-4">
              {filteredRows.map(({ lpo, entry, entryIdx }, index) => {
                const rowKey = (entry._id ?? `${lpo._id ?? lpo.id ?? lpo.lpoNo}-${entryIdx}`) as string;
                return (
                  <div
                    key={rowKey}
                    onClick={() => handleRowClick(lpo, entry.truckNo)}
                    className={`border rounded-xl p-4 transition-all cursor-pointer ${
                      entry.isCancelled
                        ? 'border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/30'
                        : 'border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700/50 hover:bg-gray-100 dark:hover:bg-gray-600/50'
                    }`}
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs text-gray-500 dark:text-gray-400">#{index + 1}</span>
                          <span className={`text-sm font-bold ${entry.isCancelled ? 'text-red-500 dark:text-red-400 line-through' : 'text-green-600 dark:text-green-400'}`}>{lpo.lpoNo}</span>
                          {entry.isCancelled && <span className="px-1.5 py-0.5 text-[10px] font-bold bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-300 rounded">CANCELLED</span>}
                          {!entry.isCancelled && !entry.linkedFuelRecordId && <span className="px-1.5 py-0.5 text-[10px] font-bold bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300 rounded">UNLINKED</span>}
                        </div>
                        <p className="text-xs text-gray-500 dark:text-gray-400">{lpo.date}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-lg font-bold text-gray-900 dark:text-gray-100">{entry.amount.toLocaleString()}</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">{entry.liters.toLocaleString()}L @ {entry.rate.toFixed(2)}</p>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2 mb-3 text-sm">
                      <div>
                        <span className="text-xs text-gray-500 dark:text-gray-400">Station:</span>
                        <p className="font-medium text-gray-900 dark:text-gray-100">{STATION_LABEL}</p>
                      </div>
                      <div>
                        <span className="text-xs text-gray-500 dark:text-gray-400">DO/SDO:</span>
                        <p className="font-medium text-gray-900 dark:text-gray-100">{entry.doNo}</p>
                      </div>
                      <div>
                        <span className="text-xs text-gray-500 dark:text-gray-400">Truck/Entity:</span>
                        <p className="font-medium text-gray-900 dark:text-gray-100">{entry.truckNo}</p>
                      </div>
                      <div>
                        <span className="text-xs text-gray-500 dark:text-gray-400">Destination:</span>
                        <p className="font-medium text-gray-900 dark:text-gray-100">{entry.dest}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 pt-3 border-t border-gray-200 dark:border-gray-600" onClick={(e) => e.stopPropagation()}>
                      <div className="relative flex-1 dar-copy-dropdown">
                        <button
                          onClick={(e) => { e.stopPropagation(); toggleDropdown(rowKey, e); }}
                          className="w-full px-3 py-2 text-xs font-medium text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20 rounded-lg hover:bg-green-100 dark:hover:bg-green-900/30 inline-flex items-center justify-center"
                        >
                          <Copy className="w-4 h-4 mr-1" />
                          Copy/Download
                          <ChevronDown className="w-3 h-3 ml-1" />
                        </button>
                        {openDropdowns[rowKey] && <CopyDownloadMenu lpo={lpo} />}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Table view — desktop (lg and up) */}
            <div className="hidden lg:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 dark:bg-gray-700 border-b border-gray-200 dark:border-gray-600">
                  <tr>
                    <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">S/N</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Date</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">LPO#</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Station</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">DO/SDO</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Truck/Entity</th>
                    <th className="px-3 py-2 text-right text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Liters</th>
                    <th className="px-3 py-2 text-right text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">$/L</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Destination</th>
                    <th className="px-3 py-2 text-right text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Amount</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                  {filteredRows.map(({ lpo, entry, entryIdx }, index) => {
                    const rowKey = (entry._id ?? `${lpo._id ?? lpo.id ?? lpo.lpoNo}-${entryIdx}`) as string;
                    return (
                      <tr
                        key={rowKey}
                        className={`cursor-pointer transition-colors ${
                          entry.isCancelled
                            ? 'bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/30'
                            : 'hover:bg-green-50/40 dark:hover:bg-green-900/10'
                        }`}
                        onClick={() => handleRowClick(lpo, entry.truckNo)}
                      >
                        <td className="px-3 py-2 whitespace-nowrap text-xs text-gray-900 dark:text-gray-100">{index + 1}</td>
                        <td className="px-3 py-2 text-xs text-gray-900 dark:text-gray-100">{lpo.date}</td>
                        <td className="px-3 py-2 text-xs font-medium text-green-600 dark:text-green-400 underline">
                          <span className={entry.isCancelled ? 'line-through text-red-500 dark:text-red-400' : ''}>{lpo.lpoNo}</span>
                          {entry.isCancelled && <span className="ml-1 px-1 py-0.5 text-[10px] font-bold bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-300 rounded">CANCELLED</span>}
                          {!entry.isCancelled && !entry.linkedFuelRecordId && <span className="ml-1 px-1 py-0.5 text-[10px] font-bold bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300 rounded">UNLINKED</span>}
                        </td>
                        <td className="px-3 py-2 text-xs text-gray-900 dark:text-gray-100">{STATION_LABEL}</td>
                        <td className="px-3 py-2 text-xs text-gray-900 dark:text-gray-100">{entry.doNo}</td>
                        <td className="px-3 py-2 text-xs text-gray-900 dark:text-gray-100">{entry.truckNo}</td>
                        <td className="px-3 py-2 text-right text-xs text-gray-900 dark:text-gray-100">{entry.liters.toLocaleString()}</td>
                        <td className="px-3 py-2 text-right text-xs text-gray-900 dark:text-gray-100">{entry.rate.toFixed(2)}</td>
                        <td className="px-3 py-2 text-xs text-gray-900 dark:text-gray-100">{entry.dest}</td>
                        <td className="px-3 py-2 text-right text-xs font-semibold text-gray-900 dark:text-gray-100">{entry.amount.toLocaleString()}</td>
                        <td className="px-3 py-2 whitespace-nowrap text-xs" onClick={(e) => e.stopPropagation()}>
                          <div className="relative dar-copy-dropdown">
                            <button
                              onClick={(e) => { e.stopPropagation(); toggleDropdown(rowKey, e); }}
                              className="flex items-center px-2 py-1 text-green-600 dark:text-green-400 hover:text-green-900 dark:hover:text-green-300 hover:bg-green-50 dark:hover:bg-green-900/20 rounded"
                              title="Copy/Download LPO"
                            >
                              <Copy className="w-4 h-4 mr-1" />
                              <ChevronDown className="w-3 h-3" />
                            </button>
                            {openDropdowns[rowKey] && <CopyDownloadMenu lpo={lpo} />}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}

        {/* Pagination (server-side) */}
        {pagination && pagination.totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 dark:border-gray-700">
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Page {page} of {pagination.totalPages} · {pagination.total} LPOs
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronLeft className="w-4 h-4 text-gray-600 dark:text-gray-400" />
              </button>
              <span className="text-sm text-gray-700 dark:text-gray-300">
                {page} / {pagination.totalPages}
              </span>
              <button
                onClick={() => setPage(p => Math.min(pagination.totalPages, p + 1))}
                disabled={page >= pagination.totalPages}
                className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronRight className="w-4 h-4 text-gray-600 dark:text-gray-400" />
              </button>
            </div>
          </div>
        )}
      </div>}

      {/* New LPO form */}
      {showForm && nextLpoNo && (
        <DarYardLPOForm
          mode="new"
          nextLpoNo={nextLpoNo}
          onClose={() => setShowForm(false)}
          onSuccess={() => queryClient.invalidateQueries({ queryKey: darLPOKeys.all })}
        />
      )}

      {/* Add Entries to most recent LPO */}
      {showAddEntries && lpos[0] && (
        <DarYardLPOForm
          mode="add-entries"
          existingLpo={lpos[0]}
          onClose={() => setShowAddEntries(false)}
          onSuccess={() => queryClient.invalidateQueries({ queryKey: darLPOKeys.all })}
        />
      )}
    </div>
  );
}
