/**
 * SecurityCharts — Reusable Recharts wrappers for the Security module.
 * Provides consistent theming across dark/light mode.
 */
import { useMemo } from 'react';
import {
  AreaChart, Area, LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';

/* ───────── Theme ───────── */

const CHART_COLORS = {
  indigo: '#6366f1',
  green: '#22c55e',
  yellow: '#eab308',
  orange: '#f97316',
  red: '#ef4444',
  blue: '#3b82f6',
  purple: '#a855f7',
  cyan: '#06b6d4',
  pink: '#ec4899',
};

const SEVERITY_COLORS: Record<string, string> = {
  critical: CHART_COLORS.red,
  high: CHART_COLORS.orange,
  medium: CHART_COLORS.yellow,
  low: CHART_COLORS.blue,
};

const PIE_COLORS = [
  CHART_COLORS.indigo, CHART_COLORS.orange, CHART_COLORS.red,
  CHART_COLORS.blue, CHART_COLORS.yellow, CHART_COLORS.purple,
  CHART_COLORS.cyan, CHART_COLORS.pink, CHART_COLORS.green,
];

function useIsDark(): boolean {
  return typeof document !== 'undefined' &&
    document.documentElement.classList.contains('dark');
}

/* ───────── Custom tooltip ───────── */

function ChartTooltip({ active, payload, label, formatter }: { active?: boolean; payload?: any[]; label?: string; formatter?: (v: number) => string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg px-3 py-2 text-xs">
      {label && <p className="text-gray-500 dark:text-gray-400 mb-1">{label}</p>}
      {payload.map((p: any, i: number) => (
        <p key={i} className="font-medium" style={{ color: p.color }}>
          {p.name}: {formatter ? formatter(p.value as number) : p.value?.toLocaleString()}
        </p>
      ))}
    </div>
  );
}

/* ───────── Score Trend Area Chart ───────── */

interface TrendChartProps {
  data: { date: string; score: number }[];
  height?: number;
  showGrid?: boolean;
  showAxis?: boolean;
  color?: string;
  gradientId?: string;
}

export function ScoreTrendChart({
  data, height = 200, showGrid = true, showAxis = true,
  color = CHART_COLORS.indigo, gradientId = 'scoreTrendGradient',
}: TrendChartProps) {
  const dark = useIsDark();
  const gridColor = dark ? '#374151' : '#e5e7eb';
  const axisColor = dark ? '#9ca3af' : '#6b7280';

  const formattedData = useMemo(() =>
    data.map(d => ({
      ...d,
      label: new Date(d.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    })),
  [data]);

  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={formattedData} margin={{ top: 5, right: 10, left: showAxis ? 0 : -20, bottom: 0 }}>
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={color} stopOpacity={0.3} />
            <stop offset="95%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        {showGrid && <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />}
        {showAxis && (
          <>
            <XAxis
              dataKey="label"
              tick={{ fontSize: 11, fill: axisColor }}
              tickLine={false}
              axisLine={{ stroke: gridColor }}
            />
            <YAxis
              domain={[0, 100]}
              tick={{ fontSize: 11, fill: axisColor }}
              tickLine={false}
              axisLine={false}
              width={30}
            />
          </>
        )}
        <Tooltip content={<ChartTooltip />} />
        <Area
          type="monotone"
          dataKey="score"
          stroke={color}
          strokeWidth={2}
          fill={`url(#${gradientId})`}
          dot={data.length <= 30}
          activeDot={{ r: 4, strokeWidth: 2 }}
          name="Score"
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

/* ───────── Sparkline (mini trend for stat cards) ───────── */

interface SparklineProps {
  data: number[];
  width?: number;
  height?: number;
  color?: string;
}

export function Sparkline({ data, width = 80, height = 32, color = CHART_COLORS.indigo }: SparklineProps) {
  const chartData = useMemo(() => data.map((v, i) => ({ i, v })), [data]);
  return (
    <ResponsiveContainer width={width} height={height}>
      <LineChart data={chartData} margin={{ top: 2, right: 2, bottom: 2, left: 2 }}>
        <Line type="monotone" dataKey="v" stroke={color} strokeWidth={1.5} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

/* ───────── Event Timeline Area Chart ───────── */

interface TimelineChartProps {
  data: { time: string; count: number }[];
  height?: number;
  color?: string;
}

export function EventTimelineChart({ data, height = 120, color = CHART_COLORS.indigo }: TimelineChartProps) {
  const dark = useIsDark();
  const gridColor = dark ? '#374151' : '#e5e7eb';
  const axisColor = dark ? '#9ca3af' : '#6b7280';

  const formattedData = useMemo(() =>
    data.map(d => ({
      ...d,
      label: new Date(d.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    })),
  [data]);

  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={formattedData} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
        <defs>
          <linearGradient id="timelineGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={color} stopOpacity={0.3} />
            <stop offset="95%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
        <XAxis
          dataKey="label"
          tick={{ fontSize: 10, fill: axisColor }}
          tickLine={false}
          axisLine={{ stroke: gridColor }}
          interval="preserveStartEnd"
        />
        <YAxis
          tick={{ fontSize: 10, fill: axisColor }}
          tickLine={false}
          axisLine={false}
          width={30}
          allowDecimals={false}
        />
        <Tooltip content={<ChartTooltip />} />
        <Area
          type="monotone"
          dataKey="count"
          stroke={color}
          strokeWidth={2}
          fill="url(#timelineGradient)"
          dot={false}
          name="Events"
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

/* ───────── Event Distribution Bar Chart ───────── */

interface DistributionBarChartProps {
  data: { name: string; value: number; color?: string }[];
  height?: number;
  layout?: 'horizontal' | 'vertical';
}

export function DistributionBarChart({ data, height = 200, layout = 'vertical' }: DistributionBarChartProps) {
  const dark = useIsDark();
  const gridColor = dark ? '#374151' : '#e5e7eb';
  const axisColor = dark ? '#9ca3af' : '#6b7280';

  if (layout === 'vertical') {
    return (
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={data} layout="vertical" margin={{ top: 0, right: 10, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={gridColor} horizontal={false} />
          <XAxis type="number" tick={{ fontSize: 10, fill: axisColor }} tickLine={false} axisLine={false} allowDecimals={false} />
          <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: axisColor }} tickLine={false} axisLine={false} width={100} />
          <Tooltip content={<ChartTooltip />} />
          <Bar dataKey="value" radius={[0, 4, 4, 0]} name="Count">
            {data.map((entry, i) => (
              <Cell key={i} fill={entry.color || PIE_COLORS[i % PIE_COLORS.length]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
        <XAxis dataKey="name" tick={{ fontSize: 10, fill: axisColor }} tickLine={false} axisLine={{ stroke: gridColor }} />
        <YAxis tick={{ fontSize: 10, fill: axisColor }} tickLine={false} axisLine={false} allowDecimals={false} />
        <Tooltip content={<ChartTooltip />} />
        <Bar dataKey="value" radius={[4, 4, 0, 0]} name="Count">
          {data.map((entry, i) => (
            <Cell key={i} fill={entry.color || PIE_COLORS[i % PIE_COLORS.length]} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

/* ───────── Severity Donut Chart ───────── */

interface SeverityDonutProps {
  data: Record<string, number> | { name: string; value: number }[];
  height?: number;
}

export function SeverityDonutChart({ data, height = 180 }: SeverityDonutProps) {
  const chartData = useMemo(() => {
    const entries = Array.isArray(data)
      ? data.map(d => [d.name, d.value] as [string, number])
      : Object.entries(data);
    return entries
      .filter(([, v]) => v > 0)
      .map(([name, value]) => ({
        name: name.charAt(0).toUpperCase() + name.slice(1),
        value,
        color: SEVERITY_COLORS[name] || CHART_COLORS.blue,
      }));
  }, [data]);

  if (chartData.length === 0) return null;

  return (
    <ResponsiveContainer width="100%" height={height}>
      <PieChart>
        <Pie
          data={chartData}
          cx="50%"
          cy="50%"
          innerRadius={40}
          outerRadius={65}
          paddingAngle={2}
          dataKey="value"
          nameKey="name"
        >
          {chartData.map((entry, i) => (
            <Cell key={i} fill={entry.color} />
          ))}
        </Pie>
        <Tooltip content={<ChartTooltip />} />
      </PieChart>
    </ResponsiveContainer>
  );
}

/* ───────── Exports ───────── */

export { CHART_COLORS, SEVERITY_COLORS, PIE_COLORS };
