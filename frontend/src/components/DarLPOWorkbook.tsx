import { useState, useEffect, useRef } from 'react';
import { ChevronLeft, ChevronRight, BookOpen, Loader2 } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { useDarWorkbook, useDarYears, darLPOKeys } from '../hooks/useDarLPOs';
import { useRealtimeSync } from '../hooks/useRealtimeSync';
import DarLPOSheetView from './DarLPOSheetView';
import UnifiedTabLoader from './SuperAdmin/common/UnifiedTabLoader';
import type { DarLPO } from '../types';

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const TABS_PER_PAGE = 8;

export default function DarLPOWorkbook({ onBack, initialLpoId, initialYear, initialMonth, initialTruckNo }: {
  onBack?: () => void;
  initialLpoId?: string | null;
  initialYear?: number;
  initialMonth?: number;
  initialTruckNo?: string;
} = {}) {
  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth() + 1;
  const queryClient = useQueryClient();

  const [selectedYear, setSelectedYear] = useState<number>(() => {
    if (initialYear) return initialYear;
    const s = localStorage.getItem('dar-lpo:selectedYear');
    return s ? parseInt(s, 10) : currentYear;
  });
  const [activeMonth, setActiveMonth] = useState<number>(initialMonth ?? currentMonth);
  const [activeLpoId, setActiveLpoId] = useState<string | null>(initialLpoId ?? null);
  const [tabPageStart, setTabPageStart] = useState(0);

  // When navigated to from a list row, honour the requested LPO once the
  // workbook data for its month has loaded, then fall back to default selection.
  const pendingInitialLpoRef = useRef<string | null>(initialLpoId ?? null);

  const { data: years = [currentYear] } = useDarYears();
  const { data: workbookData, isLoading, isFetching } = useDarWorkbook(selectedYear);

  const months: Record<number, DarLPO[]> = (workbookData?.months as Record<number, DarLPO[]>) ?? {};
  const availableMonths = Object.keys(months).map(Number).sort((a, b) => a - b);
  const monthLpos: DarLPO[] = months[activeMonth] ?? [];
  const visibleTabs = monthLpos.slice(tabPageStart, tabPageStart + TABS_PER_PAGE);
  const canGoPrev = tabPageStart > 0;
  const canGoNext = tabPageStart + TABS_PER_PAGE < monthLpos.length;

  useEffect(() => {
    if (availableMonths.length > 0 && !availableMonths.includes(activeMonth)) {
      setActiveMonth(availableMonths[availableMonths.length - 1]);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [availableMonths.join(',')]);

  useEffect(() => {
    setTabPageStart(0);
    const lpos: DarLPO[] = months[activeMonth] ?? [];
    const pending = pendingInitialLpoRef.current;
    if (pending && lpos.some(l => (l._id ?? l.id) === pending)) {
      setActiveLpoId(pending);
      pendingInitialLpoRef.current = null;
    } else if (lpos.length > 0) {
      setActiveLpoId((lpos[0]._id ?? lpos[0].id) as string);
    } else {
      setActiveLpoId(null);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeMonth, selectedYear, workbookData]);

  useEffect(() => {
    localStorage.setItem('dar-lpo:selectedYear', String(selectedYear));
  }, [selectedYear]);

  useEffect(() => {
    const idx = monthLpos.findIndex(l => (l._id ?? l.id) === activeLpoId);
    if (idx < 0) return;
    setTabPageStart(prev => {
      if (idx < prev) return idx;
      if (idx >= prev + TABS_PER_PAGE) return idx - TABS_PER_PAGE + 1;
      return prev;
    });
  }, [activeLpoId]);

  const activeLpo = monthLpos.find(l => (l._id ?? l.id) === activeLpoId) ?? null;

  const handleLpoUpdated = () => {
    queryClient.invalidateQueries({ queryKey: darLPOKeys.workbook(selectedYear) });
    queryClient.invalidateQueries({ queryKey: darLPOKeys.all });
  };

  useRealtimeSync('dar_lpo_documents', handleLpoUpdated, 'rt-dar-lpo-workbook');

  const allYears = [...new Set([...years, currentYear])].sort((a, b) => b - a);

  return (
    <div className="flex flex-col h-full bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
      {/* Year + Month header */}
      <div className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-700 px-3 py-2 flex items-center gap-3 flex-wrap">
        <BookOpen className="w-4 h-4 text-green-600 dark:text-green-400 flex-shrink-0" />
        {isFetching && !!workbookData && (
          <Loader2 className="w-3.5 h-3.5 text-green-500 animate-spin flex-shrink-0" />
        )}
        <select
          value={selectedYear}
          onChange={e => {
            setSelectedYear(Number(e.target.value));
            setActiveMonth(currentMonth);
          }}
          className="px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-green-500 focus:border-transparent"
        >
          {allYears.map(y => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>

        <div className="flex items-center gap-1 flex-wrap">
          {MONTH_NAMES.map((name, idx) => {
            const month = idx + 1;
            const hasData = availableMonths.includes(month);
            const lpoCount = (months[month] ?? []).length;
            return (
              <button
                key={month}
                onClick={() => { if (hasData) { setActiveMonth(month); } }}
                disabled={!hasData}
                className={`px-2.5 py-1 text-xs font-medium rounded-lg transition-colors ${
                  activeMonth === month && hasData
                    ? 'bg-green-600 text-white shadow-sm'
                    : hasData
                    ? 'bg-white dark:bg-gray-600 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-500 hover:bg-gray-100 dark:hover:bg-gray-500'
                    : 'opacity-40 text-gray-400 dark:text-gray-500 cursor-not-allowed'
                }`}
                title={hasData ? `${lpoCount} LPO${lpoCount !== 1 ? 's' : ''}` : 'No LPOs'}
              >
                {name}
              </button>
            );
          })}
        </div>
      </div>

      {/* LPO tabs row */}
      {monthLpos.length > 0 && (
        <div className="border-b border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-700 flex items-stretch min-h-[38px]">
          {canGoPrev && (
            <button
              onClick={() => setTabPageStart(p => Math.max(0, p - TABS_PER_PAGE))}
              className="px-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 border-r border-gray-300 dark:border-gray-600 flex-shrink-0"
              title="Previous"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
          )}
          <div className="flex items-stretch overflow-x-auto flex-1">
            {visibleTabs.map(lpo => {
              const lpoId = (lpo._id ?? lpo.id) as string;
              const allCancelled = lpo.entries.length > 0 && lpo.entries.every(e => e.isCancelled);
              const isActive = activeLpoId === lpoId;
              const activeEntries = lpo.entries.filter(e => !e.isCancelled);
              const totalLiters = activeEntries.reduce((s, e) => s + e.liters, 0);
              return (
                <button
                  key={lpoId}
                  onClick={() => setActiveLpoId(lpoId)}
                  className={`px-3 py-2 text-xs whitespace-nowrap border-r border-gray-300 dark:border-gray-600 transition-colors flex flex-col items-start gap-0.5 ${
                    isActive
                      ? 'bg-white dark:bg-gray-800 text-green-600 dark:text-green-400 border-b-2 border-b-green-600 dark:border-b-green-400 font-semibold'
                      : allCancelled
                      ? 'text-red-400 dark:text-red-500 hover:bg-gray-50 dark:hover:bg-gray-600'
                      : 'text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-50 dark:hover:bg-gray-600'
                  }`}
                >
                  <span className="font-mono font-medium">{lpo.lpoNo}</span>
                  <span className={`text-[10px] ${isActive ? 'text-green-400' : 'text-gray-400 dark:text-gray-500'}`}>
                    {lpo.date.slice(5)} · {allCancelled ? 'Cancelled' : `${totalLiters.toLocaleString()}L`}
                  </span>
                </button>
              );
            })}
          </div>
          {canGoNext && (
            <button
              onClick={() => setTabPageStart(p => Math.min(monthLpos.length - TABS_PER_PAGE, p + TABS_PER_PAGE))}
              className="px-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 border-l border-gray-300 dark:border-gray-600 flex-shrink-0"
              title="Next"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          )}
        </div>
      )}

      {/* Sheet content */}
      <div className="flex-1 overflow-auto">
        {isLoading && !workbookData ? (
          <UnifiedTabLoader label="Loading Dar workbook…" heightClassName="h-48" />
        ) : activeLpo ? (
          <DarLPOSheetView
            lpo={activeLpo}
            onUpdated={handleLpoUpdated}
            onBack={onBack}
            initialTruckNo={activeLpoId === initialLpoId ? initialTruckNo : undefined}
          />
        ) : (
          <div className="flex items-center justify-center h-48">
            <div className="text-center text-gray-500 dark:text-gray-400">
              <BookOpen className="w-10 h-10 mx-auto mb-3 text-gray-300 dark:text-gray-600" />
              <p className="font-medium text-sm">
                {availableMonths.length === 0
                  ? 'No LPOs for this year yet'
                  : 'No LPOs for this month'}
              </p>
              <p className="text-xs mt-1 text-gray-400 dark:text-gray-500">
                {availableMonths.length > 0
                  ? 'Select a month that has data, or create a new LPO'
                  : 'Create a new LPO from the list view to get started'}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
