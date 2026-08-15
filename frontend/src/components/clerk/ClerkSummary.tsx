import { useCallback, useEffect, useMemo, useState } from 'react';
import { BarChart2, Calendar } from 'lucide-react';
import { toast } from 'react-toastify';
import { visaOverstayAPI } from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';
import { useRealtimeSync } from '../../hooks/useRealtimeSync';
import UnifiedTabLoader from '../SuperAdmin/common/UnifiedTabLoader';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

type DaySummary = {
  date: string;
  truckCount: number;
  overstayTotal: number;
  visaTotal: number;
  total: number;
  pendingCount: number;
  confirmedCount: number;
};

type MonthRow = {
  month: number;
  dayCount: number;
  truckCount: number;
  overstayTotal: number;
  visaTotal: number;
  total: number;
  pendingCount: number;
  confirmedCount: number;
};

export default function ClerkSummary() {
  const { isDark } = useAuth();
  const currentYear = new Date().getFullYear();
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState<DaySummary[]>([]);
  const [selectedYear, setSelectedYear] = useState(currentYear);

  const card = {
    background: isDark ? '#1E293B' : '#FFFFFF',
    borderColor: isDark ? '#334155' : '#E2E8F0',
  };
  const text = isDark ? '#F1F5F9' : '#0F172A';
  const muted = '#64748B';

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await visaOverstayAPI.listDays({ limit: 365 });
      setDays((Array.isArray(data) ? data : data?.days || []) as DaySummary[]);
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Failed to load summary');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useRealtimeSync('visa_overstays', load);

  const years = useMemo(() => {
    const set = new Set<number>([currentYear]);
    days.forEach((d) => {
      const y = Number(d.date?.slice(0, 4));
      if (y) set.add(y);
    });
    return Array.from(set).sort((a, b) => b - a);
  }, [days, currentYear]);

  const monthRows = useMemo(() => {
    const map = new Map<number, MonthRow>();
    for (const d of days) {
      if (!d.date?.startsWith(String(selectedYear))) continue;
      const month = Number(d.date.slice(5, 7));
      const row = map.get(month) || {
        month,
        dayCount: 0,
        truckCount: 0,
        overstayTotal: 0,
        visaTotal: 0,
        total: 0,
        pendingCount: 0,
        confirmedCount: 0,
      };
      row.dayCount += 1;
      row.truckCount += d.truckCount || 0;
      row.overstayTotal += d.overstayTotal || 0;
      row.visaTotal += d.visaTotal || 0;
      row.total += d.total || 0;
      row.pendingCount += d.pendingCount || 0;
      row.confirmedCount += d.confirmedCount || 0;
      map.set(month, row);
    }
    return Array.from(map.values()).sort((a, b) => a.month - b.month);
  }, [days, selectedYear]);

  const totals = monthRows.reduce(
    (acc, r) => {
      acc.dayCount += r.dayCount;
      acc.truckCount += r.truckCount;
      acc.overstayTotal += r.overstayTotal;
      acc.visaTotal += r.visaTotal;
      acc.total += r.total;
      acc.pendingCount += r.pendingCount;
      acc.confirmedCount += r.confirmedCount;
      return acc;
    },
    { dayCount: 0, truckCount: 0, overstayTotal: 0, visaTotal: 0, total: 0, pendingCount: 0, confirmedCount: 0 }
  );

  if (loading) return <UnifiedTabLoader label="Loading summary..." heightClassName="h-48" />;

  return (
    <div className="rounded-xl border overflow-hidden" style={card}>
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b" style={{ borderColor: card.borderColor }}>
        <div className="flex items-center gap-2">
          <BarChart2 className="w-4 h-4 text-teal-600" />
          <h2 className="text-sm font-semibold" style={{ color: text }}>
            Monthly Summary
          </h2>
        </div>
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4" style={{ color: muted }} />
          <select
            value={selectedYear}
            onChange={(e) => setSelectedYear(Number(e.target.value))}
            className={`px-3 py-1.5 text-sm rounded-lg border ${
              isDark ? 'bg-slate-800 border-slate-600 text-slate-100' : 'bg-white border-gray-300 text-slate-900'
            }`}
          >
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 p-4">
        {[
          { label: 'Day sheets', value: String(totals.dayCount) },
          { label: 'Truck lines', value: String(totals.truckCount) },
          { label: 'Overstay', value: `$${totals.overstayTotal}` },
          { label: 'Visa', value: `$${totals.visaTotal}` },
          { label: 'Confirmed lines', value: String(totals.confirmedCount) },
          { label: 'Pending lines', value: String(totals.pendingCount) },
          { label: 'Total $', value: `$${totals.total}` },
        ].map((s) => (
          <div key={s.label} className="rounded-lg border px-3 py-2" style={{ borderColor: card.borderColor }}>
            <p className="text-xs" style={{ color: muted }}>{s.label}</p>
            <p className="text-base font-semibold" style={{ color: text }}>{s.value}</p>
          </div>
        ))}
      </div>

      <div className="overflow-x-auto border-t" style={{ borderColor: card.borderColor }}>
        <table className="min-w-full text-sm">
          <thead>
            <tr style={{ background: isDark ? '#0F172A' : '#F8FAFC', color: muted }}>
              <th className="px-3 py-2 text-left font-medium">Month</th>
              <th className="px-3 py-2 text-left font-medium">Days</th>
              <th className="px-3 py-2 text-left font-medium">Trucks</th>
              <th className="px-3 py-2 text-left font-medium">Overstay</th>
              <th className="px-3 py-2 text-left font-medium">Visa</th>
              <th className="px-3 py-2 text-left font-medium">Pending</th>
              <th className="px-3 py-2 text-left font-medium">Confirmed</th>
              <th className="px-3 py-2 text-left font-medium">Total</th>
            </tr>
          </thead>
          <tbody>
            {monthRows.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-3 py-10 text-center" style={{ color: muted }}>
                  No day sheets for {selectedYear}
                </td>
              </tr>
            ) : (
              monthRows.map((r) => (
                <tr key={r.month} className="border-t" style={{ borderColor: card.borderColor }}>
                  <td className="px-3 py-2 font-medium" style={{ color: text }}>
                    {MONTH_NAMES[r.month - 1]}
                  </td>
                  <td className="px-3 py-2" style={{ color: text }}>{r.dayCount}</td>
                  <td className="px-3 py-2" style={{ color: text }}>{r.truckCount}</td>
                  <td className="px-3 py-2" style={{ color: text }}>${r.overstayTotal}</td>
                  <td className="px-3 py-2" style={{ color: text }}>${r.visaTotal}</td>
                  <td className="px-3 py-2" style={{ color: muted }}>{r.pendingCount}</td>
                  <td className="px-3 py-2 text-emerald-600">{r.confirmedCount}</td>
                  <td className="px-3 py-2 font-semibold text-teal-600">${r.total}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
