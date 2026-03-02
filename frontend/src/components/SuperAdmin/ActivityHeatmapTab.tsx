import { useState, useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { Activity, RefreshCw, Users, Zap } from 'lucide-react';
import activityHeatmapService, { HeatmapData } from '../../services/activityHeatmapService';

interface Props {
  onMessage: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

const DAYS_OPTIONS = [7, 14, 30, 60, 90];

function heatColor(count: number, max: number): string {
  if (max === 0) return '#e5e7eb';
  const pct = count / max;
  if (pct === 0) return '#e5e7eb';
  if (pct < 0.25) return '#dbeafe';
  if (pct < 0.5) return '#93c5fd';
  if (pct < 0.75) return '#3b82f6';
  return '#1d4ed8';
}

function HourHeatmap({ hours }: { hours: HeatmapData['hours'] }) {
  const max = Math.max(...hours.map((h) => h.count));
  return (
    <div>
      <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-3 uppercase tracking-wide">Activity by Hour of Day</p>
      <div className="grid grid-cols-12 gap-1">
        {hours.map(({ hour, count }) => (
          <div key={hour} className="group relative">
            <div
              title={`${hour}:00 — ${count} events`}
              className="h-8 rounded cursor-default transition-all hover:opacity-80"
              style={{ backgroundColor: heatColor(count, max) }}
            />
            <p className="text-center text-xs text-gray-400 mt-0.5">{hour}</p>
            {/* Tooltip */}
            <div className="absolute bottom-10 left-1/2 -translate-x-1/2 bg-gray-900 text-white text-xs px-2 py-1 rounded shadow-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-10 pointer-events-none">
              {hour}:00 — {count} events
            </div>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-2 mt-3 justify-end">
        <span className="text-xs text-gray-400">Low</span>
        {['#e5e7eb', '#dbeafe', '#93c5fd', '#3b82f6', '#1d4ed8'].map((c) => (
          <span key={c} className="w-4 h-3 rounded" style={{ backgroundColor: c }} />
        ))}
        <span className="text-xs text-gray-400">High</span>
      </div>
    </div>
  );
}

function WeekdayBar({ weekdays }: { weekdays: HeatmapData['weekdays'] }) {
  const max = Math.max(...weekdays.map((d) => d.count));
  return (
    <div>
      <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-3 uppercase tracking-wide">Activity by Day of Week</p>
      <ResponsiveContainer width="100%" height={140}>
        <BarChart data={weekdays} margin={{ top: 0, right: 0, left: -24, bottom: 0 }}>
          <XAxis dataKey="label" tick={{ fontSize: 12 }} />
          <YAxis tick={{ fontSize: 11 }} />
          <Tooltip
            contentStyle={{ fontSize: 12, borderRadius: 8 }}
            formatter={(v) => [v, 'Events']}
          />
          <Bar dataKey="count" radius={[4, 4, 0, 0]}>
            {weekdays.map((d) => (
              <Cell key={d.day} fill={heatColor(d.count, max)} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function TopList({ items, labelKey, countKey, title }: { items: Record<string, unknown>[]; labelKey: string; countKey: string; title: string }) {
  const max = Math.max(...items.map((i) => i[countKey] as number));
  return (
    <div>
      <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-3 uppercase tracking-wide">{title}</p>
      <div className="space-y-2">
        {items.map((item, i) => {
          const label = String(item[labelKey]);
          const count = item[countKey] as number;
          const pct = max > 0 ? (count / max) * 100 : 0;
          return (
            <div key={i}>
              <div className="flex justify-between text-xs mb-0.5">
                <span className="text-gray-700 dark:text-gray-300 font-mono">{label}</span>
                <span className="text-gray-500">{count}</span>
              </div>
              <div className="h-1.5 bg-gray-100 dark:bg-gray-700 rounded-full">
                <div className="h-full bg-indigo-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function ActivityHeatmapTab({ onMessage }: Props) {
  const [data, setData] = useState<HeatmapData | null>(null);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(30);

  useEffect(() => { load(days); }, [days]);

  const load = async (d: number) => {
    setLoading(true);
    try {
      const result = await activityHeatmapService.get(d);
      setData(result);
    } catch {
      onMessage('Failed to load activity heatmap', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">User Activity Heatmap</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">Audit log aggregation by time of day and day of week</p>
        </div>
        <div className="flex items-center gap-2">
          {DAYS_OPTIONS.map((d) => (
            <button
              key={d}
              onClick={() => setDays(d)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${days === d ? 'bg-indigo-600 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600'}`}
            >
              {d}d
            </button>
          ))}
          <button onClick={() => load(days)} className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {loading || !data ? (
        <div className="flex items-center justify-center h-64">
          <RefreshCw className="w-6 h-6 animate-spin text-indigo-500" />
        </div>
      ) : (
        <>
          {/* Stats row */}
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 text-center">
              <Activity className="w-5 h-5 text-indigo-500 mx-auto mb-2" />
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{data.total.toLocaleString()}</p>
              <p className="text-xs text-gray-400">Total events ({days}d)</p>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 text-center">
              <Users className="w-5 h-5 text-blue-500 mx-auto mb-2" />
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{data.topUsers.length}</p>
              <p className="text-xs text-gray-400">Active users</p>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 text-center">
              <Zap className="w-5 h-5 text-amber-500 mx-auto mb-2" />
              <p className="text-2xl font-bold text-gray-900 dark:text-white">
                {data.hours.reduce((best, h) => h.count > best.count ? h : best, data.hours[0]).hour}:00
              </p>
              <p className="text-xs text-gray-400">Peak hour</p>
            </div>
          </div>

          {/* Hour heatmap */}
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
            <HourHeatmap hours={data.hours} />
          </div>

          {/* Weekday + Top lists side by side */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
              <WeekdayBar weekdays={data.weekdays} />
            </div>
            <div className="grid grid-rows-2 gap-4">
              <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
                <TopList
                  items={data.topUsers as unknown as Record<string, unknown>[]}
                  labelKey="username"
                  countKey="count"
                  title="Top Users"
                />
              </div>
              <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
                <TopList
                  items={data.topActions as unknown as Record<string, unknown>[]}
                  labelKey="action"
                  countKey="count"
                  title="Top Actions"
                />
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
