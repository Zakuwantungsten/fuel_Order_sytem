/**
 * SecurityOverviewBanner — Always-visible security posture summary
 * displayed at the top of the Security tab, above sub-tab navigation.
 */
import { useState, useEffect } from 'react';
import {
  Shield, ShieldAlert, Radar, Users, AlertTriangle,
  RefreshCw, ChevronRight, TrendingUp, TrendingDown, Minus,
  Loader2,
} from 'lucide-react';
import { ScoreTrendChart, Sparkline } from './SecurityCharts';

/* ───────── Types ───────── */

interface ScoreSnapshot {
  date: string;
  overallScore: number;
  categoryScores: Record<string, { score: number; max: number; percentage: number }>;
  checksSummary: { total: number; passed: number; failed: number; partial: number };
}

interface OverviewData {
  score: number;
  threatLevel: string;
  activeSessions: number;
  totalEvents24h: number;
  highRiskUsers: number;
  improvementItems: { title: string; severity: string; score: number; weight: number }[];
  trend: ScoreSnapshot[];
}

/* ───────── Constants ───────── */

const THREAT_STYLES: Record<string, { bg: string; text: string; border: string; dot: string }> = {
  low:      { bg: 'bg-green-50 dark:bg-green-900/10', text: 'text-green-700 dark:text-green-400', border: 'border-green-200 dark:border-green-800', dot: 'bg-green-500' },
  medium:   { bg: 'bg-yellow-50 dark:bg-yellow-900/10', text: 'text-yellow-700 dark:text-yellow-400', border: 'border-yellow-200 dark:border-yellow-800', dot: 'bg-yellow-500' },
  high:     { bg: 'bg-orange-50 dark:bg-orange-900/10', text: 'text-orange-700 dark:text-orange-400', border: 'border-orange-200 dark:border-orange-800', dot: 'bg-orange-500' },
  critical: { bg: 'bg-red-50 dark:bg-red-900/10', text: 'text-red-700 dark:text-red-400', border: 'border-red-200 dark:border-red-800', dot: 'bg-red-500' },
  unknown:  { bg: 'bg-gray-50 dark:bg-gray-800', text: 'text-gray-500 dark:text-gray-400', border: 'border-gray-200 dark:border-gray-700', dot: 'bg-gray-400' },
};

/* ───────── Component ───────── */

interface Props {
  onNavigate?: (subTab: string) => void;
}

const API_BASE = import.meta.env.VITE_API_BASE_URL || '/api/v1';

export default function SecurityOverviewBanner({ onNavigate }: Props) {
  const [data, setData] = useState<OverviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [collapsed, setCollapsed] = useState(false);

  const authHeaders = () => ({
    Authorization: `Bearer ${sessionStorage.getItem('fuel_order_token')}`,
  });

  const loadData = async () => {
    setLoading(true);
    try {
      const [scoreRes, threatRes, eventsRes, sessionsRes, historyRes] = await Promise.all([
        fetch(`${API_BASE}/system-admin/security-score`, { headers: authHeaders() }).then(r => r.json()).catch(() => null),
        fetch(`${API_BASE}/system-admin/threat-detection/anomalies?days=7`, { headers: authHeaders() }).then(r => r.json()).catch(() => null),
        fetch(`${API_BASE}/system-admin/security-events/stats?hours=24`, { headers: authHeaders() }).then(r => r.json()).catch(() => null),
        fetch(`${API_BASE}/admin/sessions/active`, { headers: authHeaders() }).then(r => r.json()).catch(() => null),
        fetch(`${API_BASE}/system-admin/security-score/history?days=30`, { headers: authHeaders() }).then(r => r.json()).catch(() => null),
      ]);

      const improvementItems = (scoreRes?.data?.improvementPriority || [])
        .slice(0, 4)
        .map((c: any) => ({
          title: c.title,
          severity: c.severity,
          score: c.score,
          weight: c.weight,
        }));

      setData({
        score: scoreRes?.data?.overallScore ?? 0,
        threatLevel: threatRes?.data?.threatLevel ?? 'unknown',
        activeSessions: Array.isArray(sessionsRes?.data) ? sessionsRes.data.length : sessionsRes?.data?.sessions?.length ?? 0,
        totalEvents24h: eventsRes?.data?.totalEvents ?? 0,
        highRiskUsers: threatRes?.data?.highRiskUsers?.length ?? 0,
        improvementItems,
        trend: historyRes?.data?.snapshots ?? [],
      });
    } catch {
      // Non-critical overview
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, []);

  if (loading) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
        <div className="flex items-center justify-center gap-2 py-4">
          <Loader2 className="w-5 h-5 text-indigo-500 animate-spin" />
          <span className="text-sm text-gray-500 dark:text-gray-400">Loading security overview...</span>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const tc = THREAT_STYLES[data.threatLevel] ?? THREAT_STYLES.unknown;

  // Score color helpers
  const getScoreColor = (s: number) => {
    if (s >= 80) return 'text-green-600 dark:text-green-400';
    if (s >= 60) return 'text-yellow-600 dark:text-yellow-400';
    if (s >= 40) return 'text-orange-600 dark:text-orange-400';
    return 'text-red-600 dark:text-red-400';
  };

  const getScoreRingColor = (s: number) => {
    if (s >= 80) return 'stroke-green-500';
    if (s >= 60) return 'stroke-yellow-500';
    if (s >= 40) return 'stroke-orange-500';
    return 'stroke-red-500';
  };

  const getGrade = (s: number) => s >= 90 ? 'A+' : s >= 80 ? 'A' : s >= 70 ? 'B' : s >= 60 ? 'C' : s >= 40 ? 'D' : 'F';

  // Trend direction
  const trendScores = data.trend.map(t => t.overallScore);
  const scoreDelta = trendScores.length >= 2
    ? trendScores[trendScores.length - 1] - trendScores[0]
    : 0;

  const circumference = 2 * Math.PI * 36;
  const dashOffset = circumference - (data.score / 100) * circumference;

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
      {/* Header bar */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-gray-50 dark:bg-gray-800/50 border-b border-gray-100 dark:border-gray-700">
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="flex items-center gap-2 text-sm font-semibold text-gray-700 dark:text-gray-200 hover:text-gray-900 dark:hover:text-white transition-colors"
        >
          <Shield className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
          Security Overview
          <ChevronRight className={`w-3.5 h-3.5 text-gray-400 transition-transform ${collapsed ? '' : 'rotate-90'}`} />
        </button>
        <div className="flex items-center gap-3">
          {/* Threat level pill */}
          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${tc.bg} ${tc.text} border ${tc.border}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${tc.dot} ${data.threatLevel === 'critical' || data.threatLevel === 'high' ? 'animate-pulse' : ''}`} />
            {data.threatLevel.toUpperCase()}
          </span>
          <button
            onClick={loadData}
            className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded transition-colors"
            title="Refresh overview"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Collapsible content */}
      {!collapsed && (
        <div className="p-4">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
            {/* ── Left: Score Ring ── */}
            <div className="lg:col-span-2 flex flex-col items-center justify-center">
              <div className="relative">
                <svg className="w-24 h-24 transform -rotate-90" viewBox="0 0 80 80">
                  <circle cx="40" cy="40" r="36" fill="none" stroke="currentColor" strokeWidth="6"
                    className="text-gray-100 dark:text-gray-700" />
                  <circle cx="40" cy="40" r="36" fill="none" strokeWidth="6"
                    strokeDasharray={circumference} strokeDashoffset={dashOffset}
                    strokeLinecap="round" className={`${getScoreRingColor(data.score)} transition-all duration-700`} />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="text-center">
                    <span className={`text-xl font-bold ${getScoreColor(data.score)}`}>{data.score}</span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1 mt-1">
                <span className={`text-xs font-bold ${getScoreColor(data.score)}`}>Grade {getGrade(data.score)}</span>
                {scoreDelta !== 0 && (
                  <span className={`inline-flex items-center text-[10px] font-medium ${scoreDelta > 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                    {scoreDelta > 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                    {scoreDelta > 0 ? '+' : ''}{scoreDelta}
                  </span>
                )}
                {scoreDelta === 0 && trendScores.length >= 2 && (
                  <span className="inline-flex items-center text-[10px] text-gray-400"><Minus className="w-3 h-3" /></span>
                )}
              </div>
            </div>

            {/* ── Center: Quick Stats ── */}
            <div className="lg:col-span-4 grid grid-cols-2 gap-2.5">
              {/* Active Sessions */}
              <div
                className="bg-gray-50 dark:bg-gray-700/30 rounded-lg p-3 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700/50 transition-colors"
                onClick={() => onNavigate?.('sessions')}
              >
                <div className="flex items-center gap-1.5 mb-0.5">
                  <Users className="w-3 h-3 text-blue-500" />
                  <span className="text-[10px] font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Sessions</span>
                </div>
                <p className="text-lg font-bold text-gray-900 dark:text-white">{data.activeSessions}</p>
              </div>

              {/* Events 24h */}
              <div
                className="bg-gray-50 dark:bg-gray-700/30 rounded-lg p-3 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700/50 transition-colors"
                onClick={() => onNavigate?.('threats')}
              >
                <div className="flex items-center gap-1.5 mb-0.5">
                  <ShieldAlert className="w-3 h-3 text-indigo-500" />
                  <span className="text-[10px] font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Events 24h</span>
                </div>
                <p className="text-lg font-bold text-gray-900 dark:text-white">{data.totalEvents24h.toLocaleString()}</p>
              </div>

              {/* Threat Level */}
              <div
                className="bg-gray-50 dark:bg-gray-700/30 rounded-lg p-3 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700/50 transition-colors"
                onClick={() => onNavigate?.('threats')}
              >
                <div className="flex items-center gap-1.5 mb-0.5">
                  <Radar className="w-3 h-3 text-orange-500" />
                  <span className="text-[10px] font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Threats</span>
                </div>
                <p className={`text-lg font-bold capitalize ${tc.text}`}>{data.threatLevel}</p>
              </div>

              {/* High Risk Users */}
              <div
                className="bg-gray-50 dark:bg-gray-700/30 rounded-lg p-3 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700/50 transition-colors"
                onClick={() => onNavigate?.('threats')}
              >
                <div className="flex items-center gap-1.5 mb-0.5">
                  <AlertTriangle className="w-3 h-3 text-red-500" />
                  <span className="text-[10px] font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Risk Users</span>
                </div>
                <p className={`text-lg font-bold ${data.highRiskUsers > 0 ? 'text-red-600 dark:text-red-400' : 'text-gray-900 dark:text-white'}`}>
                  {data.highRiskUsers}
                </p>
              </div>
            </div>

            {/* ── Right: Score Trend ── */}
            <div className="lg:col-span-6">
              {data.trend.length >= 2 ? (
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Score Trend (30 days)</span>
                    {trendScores.length > 0 && (
                      <Sparkline data={trendScores} width={60} height={20} />
                    )}
                  </div>
                  <ScoreTrendChart
                    data={data.trend.map(t => ({ date: t.date, score: t.overallScore }))}
                    height={100}
                    showGrid={false}
                    showAxis={false}
                    gradientId="overviewTrendGrad"
                  />
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-center py-4">
                  <TrendingUp className="w-8 h-8 text-gray-300 dark:text-gray-600 mb-2" />
                  <p className="text-xs text-gray-400 dark:text-gray-500">Trend data will appear after daily score snapshots are collected</p>
                </div>
              )}
            </div>
          </div>

          {/* Attention Items */}
          {data.improvementItems.length > 0 && (
            <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-700">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-1.5">
                  <AlertTriangle className="w-3 h-3 text-amber-500" />
                  <span className="text-xs font-semibold text-gray-600 dark:text-gray-400">
                    Needs Attention
                  </span>
                </div>
                <span className="text-[10px] text-gray-400 dark:text-gray-500 bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded-full font-medium">
                  {data.improvementItems.length} item{data.improvementItems.length !== 1 ? 's' : ''}
                </span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-2">
                {data.improvementItems.map((item, i) => {
                  const sevColors: Record<string, string> = {
                    critical: 'border-l-red-500 bg-red-50/50 dark:bg-red-900/10',
                    high: 'border-l-orange-500 bg-orange-50/50 dark:bg-orange-900/10',
                    medium: 'border-l-yellow-500 bg-yellow-50/50 dark:bg-yellow-900/10',
                    low: 'border-l-blue-500 bg-blue-50/50 dark:bg-blue-900/10',
                  };
                  const sevBadge: Record<string, string> = {
                    critical: 'text-red-600 dark:text-red-400',
                    high: 'text-orange-600 dark:text-orange-400',
                    medium: 'text-yellow-600 dark:text-yellow-400',
                    low: 'text-blue-600 dark:text-blue-400',
                  };
                  return (
                    <div
                      key={i}
                      className={`border-l-2 rounded-r-lg px-3 py-2 ${sevColors[item.severity] || sevColors.low}`}
                    >
                      <p className="text-xs font-medium text-gray-800 dark:text-gray-200 line-clamp-1">{item.title}</p>
                      <div className="flex items-center justify-between mt-0.5">
                        <span className={`text-[10px] font-semibold uppercase ${sevBadge[item.severity] || sevBadge.low}`}>{item.severity}</span>
                        <span className="text-[10px] text-gray-400 dark:text-gray-500">{item.score}/{item.weight} pts</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
