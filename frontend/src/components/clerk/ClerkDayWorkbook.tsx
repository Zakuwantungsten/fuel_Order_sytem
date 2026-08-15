import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BookOpen, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import { toast } from 'react-toastify';
import { visaOverstayAPI } from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';
import { useRealtimeSync } from '../../hooks/useRealtimeSync';
import UnifiedTabLoader from '../SuperAdmin/common/UnifiedTabLoader';
import ClerkDaySheetView from './ClerkDaySheetView';

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const TABS_PER_PAGE = 8;

type DaySummary = {
  date: string;
  truckCount: number;
  paymentCount?: number;
  overstayTotal: number;
  visaTotal: number;
  total: number;
  pendingCount: number;
  confirmedCount: number;
};

interface Props {
  initialDate: string;
  onBack: () => void;
}

function shortDayLabel(date: string) {
  const [y, m, d] = date.split('-');
  if (!y || !m || !d) return date;
  return `${d}.${m}.${y.slice(2)}`;
}

function parseYMD(date: string) {
  const [y, m, d] = date.split('-').map(Number);
  return { year: y, month: m, day: d };
}

export default function ClerkDayWorkbook({ initialDate, onBack }: Props) {
  const { isDark } = useAuth();
  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth() + 1;
  const initial = parseYMD(initialDate);

  const [days, setDays] = useState<DaySummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetching, setFetching] = useState(false);
  const [selectedYear, setSelectedYear] = useState(initial.year || currentYear);
  const [activeMonth, setActiveMonth] = useState(initial.month || currentMonth);
  const [activeDate, setActiveDate] = useState(initialDate);
  const [tabPageStart, setTabPageStart] = useState(0);
  const pendingInitialRef = useRef<string | null>(initialDate);

  const cardBorder = isDark ? '#334155' : '#E2E8F0';
  const headerBg = isDark ? '#0F172A' : '#F8FAFC';
  const tabsBg = isDark ? '#1E293B' : '#F1F5F9';
  const text = isDark ? '#F1F5F9' : '#0F172A';
  const muted = '#64748B';

  const loadDays = useCallback(async (opts?: { silent?: boolean }) => {
    if (opts?.silent) setFetching(true);
    else setLoading(true);
    try {
      const data = await visaOverstayAPI.listDays({ limit: 365 });
      const list = (Array.isArray(data) ? data : data?.days || []) as DaySummary[];
      setDays(list);
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Failed to load day sheets');
    } finally {
      setLoading(false);
      setFetching(false);
    }
  }, []);

  useEffect(() => {
    loadDays();
  }, [loadDays]);

  useRealtimeSync('visa_overstays', () => loadDays({ silent: true }));

  const years = useMemo(() => {
    const set = new Set<number>([currentYear, selectedYear]);
    days.forEach((d) => {
      const y = Number(d.date?.slice(0, 4));
      if (y) set.add(y);
    });
    return Array.from(set).sort((a, b) => b - a);
  }, [days, currentYear, selectedYear]);

  const monthsByYear = useMemo(() => {
    const map: Record<number, Record<number, DaySummary[]>> = {};
    for (const d of days) {
      const { year, month } = parseYMD(d.date);
      if (!map[year]) map[year] = {};
      if (!map[year][month]) map[year][month] = [];
      map[year][month].push(d);
    }
    // Ensure current open date appears even if empty / not yet in listDays
    const ensure = (date: string) => {
      const { year, month } = parseYMD(date);
      if (!map[year]) map[year] = {};
      if (!map[year][month]) map[year][month] = [];
      if (!map[year][month].some((x) => x.date === date)) {
        map[year][month].unshift({
          date,
          truckCount: 0,
          overstayTotal: 0,
          visaTotal: 0,
          total: 0,
          pendingCount: 0,
          confirmedCount: 0,
        });
      }
    };
    if (activeDate) ensure(activeDate);
    if (pendingInitialRef.current) ensure(pendingInitialRef.current);

    Object.values(map).forEach((months) => {
      Object.values(months).forEach((list) => list.sort((a, b) => b.date.localeCompare(a.date)));
    });
    return map;
  }, [days, activeDate]);

  const yearMonths = monthsByYear[selectedYear] || {};
  const availableMonths = Object.keys(yearMonths)
    .map(Number)
    .sort((a, b) => a - b);
  const monthDays: DaySummary[] = yearMonths[activeMonth] || [];
  const visibleTabs = monthDays.slice(tabPageStart, tabPageStart + TABS_PER_PAGE);
  const canGoPrev = tabPageStart > 0;
  const canGoNext = tabPageStart + TABS_PER_PAGE < monthDays.length;

  useEffect(() => {
    if (availableMonths.length > 0 && !availableMonths.includes(activeMonth)) {
      setActiveMonth(availableMonths[availableMonths.length - 1]);
    }
  }, [availableMonths.join(','), activeMonth]);

  useEffect(() => {
    setTabPageStart(0);
    const pending = pendingInitialRef.current;
    if (pending) {
      const p = parseYMD(pending);
      if (p.year === selectedYear && p.month === activeMonth) {
        setActiveDate(pending);
        pendingInitialRef.current = null;
        return;
      }
    }
    if (monthDays.length > 0) {
      setActiveDate((prev) => (monthDays.some((d) => d.date === prev) ? prev : monthDays[0].date));
    }
  }, [activeMonth, selectedYear, days]);

  useEffect(() => {
    const idx = monthDays.findIndex((d) => d.date === activeDate);
    if (idx < 0) return;
    setTabPageStart((prev) => {
      if (idx < prev) return idx;
      if (idx >= prev + TABS_PER_PAGE) return idx - TABS_PER_PAGE + 1;
      return prev;
    });
  }, [activeDate, monthDays]);

  if (loading && days.length === 0) {
    return <UnifiedTabLoader label="Loading day workbook…" heightClassName="h-48" />;
  }

  return (
    <div
      className="flex flex-col rounded-xl border overflow-hidden"
      style={{
        background: isDark ? '#1E293B' : '#FFFFFF',
        borderColor: cardBorder,
      }}
    >
      {/* Year + Month header */}
      <div
        className="border-b px-3 py-2 flex items-center gap-3 flex-wrap"
        style={{ borderColor: cardBorder, background: headerBg }}
      >
        <BookOpen className="w-4 h-4 text-teal-600 flex-shrink-0" />
        {fetching && <Loader2 className="w-3.5 h-3.5 text-teal-500 animate-spin flex-shrink-0" />}
        <select
          value={selectedYear}
          onChange={(e) => {
            setSelectedYear(Number(e.target.value));
            setActiveMonth(currentMonth);
          }}
          className={`px-2 py-1 text-sm rounded-lg border ${
            isDark ? 'bg-slate-800 border-slate-600 text-slate-100' : 'bg-white border-gray-300 text-slate-900'
          } focus:ring-2 focus:ring-teal-500 focus:border-transparent`}
        >
          {years.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>

        <div className="flex items-center gap-1 flex-wrap">
          {MONTH_NAMES.map((name, idx) => {
            const month = idx + 1;
            const hasData = availableMonths.includes(month);
            const count = (yearMonths[month] || []).length;
            return (
              <button
                key={month}
                onClick={() => {
                  if (hasData) setActiveMonth(month);
                }}
                disabled={!hasData}
                className={`px-2.5 py-1 text-xs font-medium rounded-lg transition-colors ${
                  activeMonth === month && hasData
                    ? 'bg-teal-600 text-white shadow-sm'
                    : hasData
                      ? isDark
                        ? 'bg-slate-700 text-slate-200 border border-slate-600 hover:bg-slate-600'
                        : 'bg-white text-slate-700 border border-gray-200 hover:bg-gray-100'
                      : 'opacity-40 text-gray-400 cursor-not-allowed'
                }`}
                title={hasData ? `${count} day sheet${count !== 1 ? 's' : ''}` : 'No day sheets'}
              >
                {name}
              </button>
            );
          })}
        </div>
      </div>

      {/* Day tabs row */}
      {monthDays.length > 0 && (
        <div
          className="border-b flex items-stretch min-h-[38px]"
          style={{ borderColor: cardBorder, background: tabsBg }}
        >
          {canGoPrev && (
            <button
              onClick={() => setTabPageStart((p) => Math.max(0, p - TABS_PER_PAGE))}
              className="px-2 border-r flex-shrink-0"
              style={{ borderColor: cardBorder, color: muted }}
              title="Previous days"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
          )}
          <div className="flex items-stretch overflow-x-auto flex-1">
            {visibleTabs.map((day) => {
              const isActive = activeDate === day.date;
              return (
                <button
                  key={day.date}
                  onClick={() => setActiveDate(day.date)}
                  className={`px-3 py-2 text-xs whitespace-nowrap border-r transition-colors flex flex-col items-start gap-0.5 ${
                    isActive ? 'font-semibold border-b-2 border-b-teal-600' : ''
                  }`}
                  style={{
                    borderColor: cardBorder,
                    background: isActive ? (isDark ? '#0F172A' : '#FFFFFF') : 'transparent',
                    color: isActive ? '#0D9488' : muted,
                  }}
                >
                  <span className="font-mono font-medium">{shortDayLabel(day.date)}</span>
                  <span className={`text-[10px] ${isActive ? 'text-teal-500' : ''}`} style={{ color: isActive ? undefined : muted }}>
                    {day.truckCount} truck{day.truckCount !== 1 ? 's' : ''} · ${day.total || 0}
                  </span>
                </button>
              );
            })}
          </div>
          {canGoNext && (
            <button
              onClick={() =>
                setTabPageStart((p) => Math.min(Math.max(0, monthDays.length - TABS_PER_PAGE), p + TABS_PER_PAGE))
              }
              className="px-2 border-l flex-shrink-0"
              style={{ borderColor: cardBorder, color: muted }}
              title="Next days"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          )}
        </div>
      )}

      {/* Sheet content */}
      <div className="flex-1 overflow-auto p-3 sm:p-4" style={{ color: text }}>
        {activeDate ? (
          <ClerkDaySheetView key={activeDate} date={activeDate} onBack={onBack} />
        ) : (
          <div className="flex items-center justify-center h-48">
            <div className="text-center" style={{ color: muted }}>
              <BookOpen className="w-10 h-10 mx-auto mb-3 opacity-40" />
              <p className="font-medium text-sm">
                {availableMonths.length === 0 ? 'No day sheets for this year yet' : 'No day sheets for this month'}
              </p>
              <p className="text-xs mt-1">Build a day from the list view to get started</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
