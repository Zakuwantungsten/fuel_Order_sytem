import { useState } from 'react';
import { Plus, Search, X, FileText, Droplets, TrendingUp, Truck, AlertTriangle, ChevronLeft, ChevronRight, BookOpen, List, BarChart2 } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../contexts/AuthContext';
import { useTangaLPOList, useTangaNextNumber, tangaLPOKeys } from '../hooks/useTangaLPOs';
import { useRealtimeSync } from '../hooks/useRealtimeSync';
import TangaLPOForm from '../components/TangaLPOForm';
import TangaLPOWorkbook from '../components/TangaLPOWorkbook';
import TangaLPOSummary from '../components/TangaLPOSummary';
import UnifiedTabLoader from '../components/SuperAdmin/common/UnifiedTabLoader';
import type { TangaLPO } from '../types';

const WRITE_ROLES = ['super_admin', 'admin', 'manager', 'supervisor', 'tanga_yard'];

function StatCard({ label, value, sub, icon: Icon, accent, onClick }: {
  label: string;
  value: string | number;
  sub?: string;
  icon: React.ElementType;
  accent: string;
  onClick?: () => void;
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
        <p className="text-xl font-bold text-gray-900 dark:text-gray-100 mt-0.5">{value}</p>
        {sub && <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

export default function TangaLPOs() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const canWrite = WRITE_ROLES.includes(user?.role ?? '');

  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth() + 1;

  const [viewMode, setViewMode] = useState<'list' | 'workbook' | 'summary'>('list');
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [filterUnlinked, setFilterUnlinked] = useState(false);
  const [showForm, setShowForm] = useState(false);

  useRealtimeSync('tanga_lpo_documents', () => {}, 'rt-tanga-lpo-page');

  const LIMIT = 20;

  // Main list query
  const { data, isLoading } = useTangaLPOList({
    page,
    limit: LIMIT,
    search: search || undefined,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
    order: 'desc',
    filter: filterUnlinked ? 'unlinked' : undefined,
  });

  // Stats: this-month aggregations from a separate query
  const thisMonthStart = `${currentYear}-${String(currentMonth).padStart(2, '0')}-01`;
  const lastDay = new Date(currentYear, currentMonth, 0).getDate();
  const thisMonthEnd = `${currentYear}-${String(currentMonth).padStart(2, '0')}-${lastDay}`;

  const { data: monthData } = useTangaLPOList(
    { limit: 1000, dateFrom: thisMonthStart, dateTo: thisMonthEnd },
    true
  );

  const { data: nextLpoNo = '' } = useTangaNextNumber();

  const lpos: TangaLPO[] = data?.lpos ?? [];
  const pagination = data?.pagination;

  // Compute month stats from full month fetch
  const monthLpos: TangaLPO[] = monthData?.lpos ?? [];
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
    setFilterUnlinked(false);
    setPage(1);
  };

  const hasFilters = search || dateFrom || dateTo || filterUnlinked;

  return (
    <div className="p-4 lg:p-6 space-y-5 min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Page header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Tanga Yard LPO</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            Formal purchase orders for Tanga Yard fuel dispensing
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* View toggle */}
          <div className="flex rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
            <button
              onClick={() => setViewMode('list')}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium transition-colors ${
                viewMode === 'list'
                  ? 'bg-blue-600 text-white'
                  : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'
              }`}
            >
              <List className="w-3.5 h-3.5" /> List
            </button>
            <button
              onClick={() => setViewMode('workbook')}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium border-l border-gray-200 dark:border-gray-700 transition-colors ${
                viewMode === 'workbook'
                  ? 'bg-blue-600 text-white'
                  : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'
              }`}
            >
              <BookOpen className="w-3.5 h-3.5" /> Workbook
            </button>
            <button
              onClick={() => setViewMode('summary')}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium border-l border-gray-200 dark:border-gray-700 transition-colors ${
                viewMode === 'summary'
                  ? 'bg-blue-600 text-white'
                  : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'
              }`}
            >
              <BarChart2 className="w-3.5 h-3.5" /> Summary
            </button>
          </div>
          {canWrite && nextLpoNo && (
            <button
              onClick={() => setShowForm(true)}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors shadow-sm"
            >
              <Plus className="w-4 h-4" /> New LPO
            </button>
          )}
        </div>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          label="LPOs This Month"
          value={monthLpos.length}
          icon={FileText}
          accent="bg-blue-500"
        />
        <StatCard
          label="Total Liters"
          value={monthLiters.toLocaleString()}
          sub="This month"
          icon={Droplets}
          accent="bg-cyan-500"
        />
        <StatCard
          label="Total Amount (TZS)"
          value={monthAmount >= 1_000_000
            ? `${(monthAmount / 1_000_000).toFixed(1)}M`
            : monthAmount.toLocaleString()}
          sub="This month"
          icon={TrendingUp}
          accent="bg-green-500"
        />
        <StatCard
          label={unlinkedCount > 0 ? 'Unlinked Entries' : 'Trucks Served'}
          value={unlinkedCount > 0 ? unlinkedCount : monthTrucks}
          sub={unlinkedCount > 0 ? 'Click to view & fix' : 'All linked'}
          icon={unlinkedCount > 0 ? AlertTriangle : Truck}
          accent={unlinkedCount > 0 ? 'bg-amber-500' : 'bg-indigo-500'}
          onClick={unlinkedCount > 0 ? () => { setFilterUnlinked(true); setViewMode('list'); setPage(1); } : undefined}
        />
      </div>

      {/* Workbook view */}
      {viewMode === 'workbook' && (
        <div className="flex-1 min-h-[600px]">
          <TangaLPOWorkbook onBack={() => setViewMode('list')} />
        </div>
      )}

      {/* Summary view */}
      {viewMode === 'summary' && (
        <TangaLPOSummary />
      )}

      {/* Filters + table (list view) */}
      {viewMode === 'list' && <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        {/* Filter bar */}
        <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex flex-wrap gap-3 items-center">
          <div className="relative flex-1 min-w-[180px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1); }}
              placeholder="Search LPO, truck, DO…"
              className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <input
            type="date"
            value={dateFrom}
            onChange={e => { setDateFrom(e.target.value); setPage(1); }}
            className="px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
          <span className="text-gray-400 text-sm">—</span>
          <input
            type="date"
            value={dateTo}
            onChange={e => { setDateTo(e.target.value); setPage(1); }}
            className="px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
          {filterUnlinked && (
            <button
              onClick={() => { setFilterUnlinked(false); setPage(1); }}
              className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg hover:bg-amber-100 dark:hover:bg-amber-900/40 transition-colors"
            >
              <AlertTriangle className="w-3.5 h-3.5" />
              Unlinked only
              <X className="w-3.5 h-3.5 ml-0.5" />
            </button>
          )}
          {hasFilters && (
            <button
              onClick={handleClearFilters}
              className="flex items-center gap-1 px-3 py-2 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
            >
              <X className="w-4 h-4" /> Clear
            </button>
          )}
        </div>

        {/* Table */}
        {isLoading ? (
          <UnifiedTabLoader label="Loading Tanga LPOs…" heightClassName="h-48" />
        ) : lpos.length === 0 ? (
          <div className="py-16 text-center">
            <FileText className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
            <p className="text-gray-500 dark:text-gray-400 font-medium">
              {hasFilters ? 'No LPOs match your filters' : 'No Tanga LPOs yet'}
            </p>
            {!hasFilters && canWrite && (
              <button
                onClick={() => setShowForm(true)}
                className="mt-3 text-sm text-blue-600 hover:underline"
              >
                Create the first one
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-700 border-b border-gray-200 dark:border-gray-600">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">LPO No</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Date</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Trucks</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Total Liters</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Total Amount</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Currency</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Created By</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                {lpos.map(lpo => {
                  const activeEntries = lpo.entries.filter(e => !e.isCancelled);
                  const liters = activeEntries.reduce((s, e) => s + e.liters, 0);
                  const allCancelled = lpo.entries.length > 0 && activeEntries.length === 0;
                  const hasUnlinked = activeEntries.some(e => !e.linkedFuelRecordId);

                  return (
                    <tr key={lpo._id ?? lpo.id} className="hover:bg-gray-50 dark:hover:bg-gray-750 transition-colors">
                      <td className="px-4 py-3">
                        <span className="font-mono font-semibold text-blue-700 dark:text-blue-400">
                          {lpo.lpoNo}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-700 dark:text-gray-300">{lpo.date}</td>
                      <td className="px-4 py-3 text-right text-gray-900 dark:text-gray-100">
                        {activeEntries.length}
                        {lpo.entries.length !== activeEntries.length && (
                          <span className="text-xs text-gray-400 ml-1">/ {lpo.entries.length}</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right text-gray-900 dark:text-gray-100">
                        {liters.toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-right font-medium text-gray-900 dark:text-gray-100">
                        {lpo.total.toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300">
                          {lpo.currency}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        {allCancelled ? (
                          <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400">
                            Cancelled
                          </span>
                        ) : hasUnlinked ? (
                          <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400">
                            Unlinked
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400">
                            Active
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-500 dark:text-gray-400 text-xs">
                        {lpo.createdBy ?? '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {pagination && pagination.totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 dark:border-gray-700">
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Showing {((page - 1) * LIMIT) + 1}–{Math.min(page * LIMIT, pagination.total)} of {pagination.total}
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

      {/* Create form modal */}
      {showForm && nextLpoNo && (
        <TangaLPOForm
          nextLpoNo={nextLpoNo}
          onClose={() => {
            setShowForm(false);
            queryClient.invalidateQueries({ queryKey: tangaLPOKeys.all });
          }}
        />
      )}
    </div>
  );
}
