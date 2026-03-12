import { useState, useEffect } from 'react';
import {
  Shield, ShieldAlert, Radar, BarChart3, Activity,
  Loader2, RefreshCw, AlertTriangle, CheckCircle, Globe,
} from 'lucide-react';
import SecurityEventsTab from './SecurityEventsTab';
import ThreatDetectionTab from './ThreatDetectionTab';
import SecurityScoreTab from './SecurityScoreTab';
import GeoAccessMap from './GeoAccessMap';
import ComplianceDashboard from './ComplianceDashboard';
import { Sparkline, SeverityDonutChart } from './SecurityCharts';

/* ───────── Types ───────── */

type Section = 'overview' | 'events' | 'threats' | 'score' | 'geo' | 'compliance';

interface QuickStats {
  securityScore: number;
  threatLevel: string;
  totalEvents24h: number;
  highRiskUsers: number;
  eventSeverity: { name: string; value: number }[];
  scoreTrend: number[];
}

const SECTIONS: { id: Section; label: string; shortLabel: string; icon: React.ReactNode }[] = [
  { id: 'overview',    label: 'Overview',          shortLabel: 'Overview',    icon: <Activity className="w-4 h-4" /> },
  { id: 'events',      label: 'Security Events',   shortLabel: 'Events',      icon: <ShieldAlert className="w-4 h-4" /> },
  { id: 'threats',     label: 'Threat Detection',  shortLabel: 'Threats',     icon: <Radar className="w-4 h-4" /> },
  { id: 'score',       label: 'Security Score',    shortLabel: 'Score',       icon: <Shield className="w-4 h-4" /> },
  { id: 'geo',         label: 'Geo Access',         shortLabel: 'Geo',         icon: <Globe className="w-4 h-4" /> },
  { id: 'compliance',  label: 'Compliance',         shortLabel: 'Comply',      icon: <Shield className="w-4 h-4" /> },
];

const THREAT_STYLES: Record<string, { bg: string; text: string; border: string }> = {
  low:      { bg: 'bg-green-100 dark:bg-green-900/20', text: 'text-green-700 dark:text-green-400', border: 'border-green-300 dark:border-green-700' },
  medium:   { bg: 'bg-yellow-100 dark:bg-yellow-900/20', text: 'text-yellow-700 dark:text-yellow-400', border: 'border-yellow-300 dark:border-yellow-700' },
  high:     { bg: 'bg-orange-100 dark:bg-orange-900/20', text: 'text-orange-700 dark:text-orange-400', border: 'border-orange-300 dark:border-orange-700' },
  critical: { bg: 'bg-red-100 dark:bg-red-900/20', text: 'text-red-700 dark:text-red-400', border: 'border-red-300 dark:border-red-700' },
};

/* ───────── Component ───────── */

const API_BASE = import.meta.env.VITE_API_BASE_URL || '/api/v1';

export default function SecurityThreatMonitorSubTab() {
  const [section, setSection] = useState<Section>('overview');
  const [stats, setStats] = useState<QuickStats | null>(null);
  const [loading, setLoading] = useState(true);

  const authHeaders = () => ({
    Authorization: `Bearer ${sessionStorage.getItem('fuel_order_token')}`,
  });

  const loadOverview = async () => {
    setLoading(true);
    try {
      const [scoreRes, threatRes, eventsRes, historyRes] = await Promise.all([
        fetch(`${API_BASE}/system-admin/security-score`, { headers: authHeaders() }).then(r => r.json()).catch(() => null),
        fetch(`${API_BASE}/system-admin/threat-detection/anomalies?days=7`, { headers: authHeaders() }).then(r => r.json()).catch(() => null),
        fetch(`${API_BASE}/system-admin/security-events/stats?hours=24`, { headers: authHeaders() }).then(r => r.json()).catch(() => null),
        fetch(`${API_BASE}/system-admin/security-score/history?days=14`, { headers: authHeaders() }).then(r => r.json()).catch(() => null),
      ]);

      const sevData = eventsRes?.data?.bySeverity ?? {};
      setStats({
        securityScore: scoreRes?.data?.overallScore ?? 0,
        threatLevel: threatRes?.data?.threatLevel ?? 'unknown',
        totalEvents24h: eventsRes?.data?.totalEvents ?? 0,
        highRiskUsers: threatRes?.data?.highRiskUsers?.length ?? 0,
        eventSeverity: Object.entries(sevData).map(([name, value]) => ({ name, value: value as number })),
        scoreTrend: (historyRes?.data?.snapshots ?? []).map((s: any) => s.overallScore as number),
      });
    } catch {
      // Non-critical overview stats
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadOverview(); }, []);

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-green-600 dark:text-green-400';
    if (score >= 60) return 'text-yellow-600 dark:text-yellow-400';
    if (score >= 40) return 'text-orange-600 dark:text-orange-400';
    return 'text-red-600 dark:text-red-400';
  };

  const getScoreRingColor = (score: number) => {
    if (score >= 80) return 'stroke-green-500';
    if (score >= 60) return 'stroke-yellow-500';
    if (score >= 40) return 'stroke-orange-500';
    return 'stroke-red-500';
  };

  const circumference = 2 * Math.PI * 40;
  const dashOffset = stats ? circumference - (stats.securityScore / 100) * circumference : circumference;
  const tc = THREAT_STYLES[stats?.threatLevel ?? 'low'] ?? THREAT_STYLES.low;

  return (
    <div className="space-y-6">
      {/* Section Navigation (Pills) */}
      <div className="flex gap-1 bg-gray-100 dark:bg-gray-700 rounded-lg p-1">
        {SECTIONS.map(s => (
          <button
            key={s.id}
            onClick={() => setSection(s.id)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-all flex-1 justify-center ${
              section === s.id
                ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-white shadow-sm'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
            }`}>
            {s.icon}
            <span className="hidden lg:inline">{s.label}</span>
            <span className="lg:hidden hidden sm:inline">{s.shortLabel}</span>
          </button>
        ))}
      </div>

      {/* ═══════ Overview Section ═══════ */}
      {section === 'overview' && (
        <div className="space-y-6">
          {loading ? (
            <div className="flex justify-center py-16">
              <Loader2 className="w-6 h-6 text-indigo-500 animate-spin" />
            </div>
          ) : stats ? (
            <>
              {/* Score + Threat level banner */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                {/* Score ring */}
                <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6 flex flex-col items-center">
                  <div className="relative">
                    <svg className="w-32 h-32 transform -rotate-90" viewBox="0 0 100 100">
                      <circle cx="50" cy="50" r="40" fill="none" stroke="currentColor" strokeWidth="8"
                        className="text-gray-200 dark:text-gray-700" />
                      <circle cx="50" cy="50" r="40" fill="none" strokeWidth="8"
                        strokeDasharray={circumference} strokeDashoffset={dashOffset}
                        strokeLinecap="round" className={getScoreRingColor(stats.securityScore)} />
                    </svg>
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="text-center">
                        <span className={`text-3xl font-bold ${getScoreColor(stats.securityScore)}`}>{stats.securityScore}</span>
                        <span className="text-sm text-gray-400">/100</span>
                      </div>
                    </div>
                  </div>
                  <p className="mt-3 text-sm font-medium text-gray-700 dark:text-gray-300">Security Score</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 text-center mt-1">
                    {stats.securityScore >= 80 ? 'Strong security posture' :
                     stats.securityScore >= 60 ? 'Good, with room for improvement' :
                     stats.securityScore >= 40 ? 'Needs attention' : 'Critical improvements required'}
                  </p>
                  <button onClick={() => setSection('score')}
                    className="mt-3 text-xs text-indigo-600 dark:text-indigo-400 hover:underline font-medium">
                    View full assessment →
                  </button>
                </div>

                {/* Threat level + quick stats */}
                <div className="lg:col-span-2 space-y-4">
                  {/* Threat banner */}
                  <div className={`${tc.bg} ${tc.border} border rounded-xl p-4 flex items-center gap-3`}>
                    <Radar className={`w-6 h-6 ${tc.text}`} />
                    <div>
                      <p className={`font-semibold ${tc.text} uppercase text-sm`}>
                        Threat Level: {stats.threatLevel}
                      </p>
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        {stats.highRiskUsers} high-risk user{stats.highRiskUsers !== 1 ? 's' : ''} detected in last 7 days
                      </p>
                    </div>
                  </div>

                  {/* Quick stat cards */}
                  <div className="grid grid-cols-3 gap-3">
                    <div className="bg-gradient-to-br from-indigo-50 to-indigo-100/50 dark:from-indigo-900/20 dark:to-indigo-900/10 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
                      <div className="flex items-center gap-2 mb-1">
                        <BarChart3 className="w-3.5 h-3.5 text-indigo-500" />
                        <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Events (24h)</span>
                      </div>
                      <p className="text-2xl font-bold text-indigo-600 dark:text-indigo-400">{stats.totalEvents24h.toLocaleString()}</p>
                    </div>
                    <div className="bg-gradient-to-br from-orange-50 to-orange-100/50 dark:from-orange-900/20 dark:to-orange-900/10 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
                      <div className="flex items-center gap-2 mb-1">
                        <AlertTriangle className="w-3.5 h-3.5 text-orange-500" />
                        <span className="text-xs font-medium text-gray-500 dark:text-gray-400">High-Risk Users</span>
                      </div>
                      <p className="text-2xl font-bold text-orange-600 dark:text-orange-400">{stats.highRiskUsers}</p>
                    </div>
                    <div className="bg-gradient-to-br from-green-50 to-green-100/50 dark:from-green-900/20 dark:to-green-900/10 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
                      <div className="flex items-center gap-2 mb-1">
                        <CheckCircle className="w-3.5 h-3.5 text-green-500" />
                        <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Score Grade</span>
                      </div>
                      <p className={`text-2xl font-bold ${getScoreColor(stats.securityScore)}`}>
                        {stats.securityScore >= 80 ? 'A' : stats.securityScore >= 60 ? 'B' : stats.securityScore >= 40 ? 'C' : 'D'}
                      </p>
                    </div>
                  </div>

                  {/* Mini charts row */}
                  <div className="grid grid-cols-2 gap-3">
                    {/* Severity breakdown mini */}
                    {stats.eventSeverity.length > 0 && (
                      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
                        <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">Event Severity (24h)</p>
                        <SeverityDonutChart data={stats.eventSeverity} height={100} />
                      </div>
                    )}
                    {/* Score trend sparkline */}
                    {stats.scoreTrend.length >= 2 && (
                      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 flex flex-col">
                        <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">Score Trend (14d)</p>
                        <div className="flex-1 flex items-center justify-center">
                          <Sparkline data={stats.scoreTrend} width={180} height={50} />
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Quick links */}
                  <div className="grid grid-cols-3 gap-3">
                    <button onClick={() => setSection('events')}
                      className="flex items-center gap-2 p-3 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 hover:border-indigo-300 dark:hover:border-indigo-600 transition-colors text-left">
                      <ShieldAlert className="w-5 h-5 text-indigo-500 shrink-0" />
                      <div>
                        <p className="text-sm font-medium text-gray-900 dark:text-white">Security Events</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">View event timeline & stats</p>
                      </div>
                    </button>
                    <button onClick={() => setSection('threats')}
                      className="flex items-center gap-2 p-3 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 hover:border-indigo-300 dark:hover:border-indigo-600 transition-colors text-left">
                      <Radar className="w-5 h-5 text-orange-500 shrink-0" />
                      <div>
                        <p className="text-sm font-medium text-gray-900 dark:text-white">Threat Detection</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">UEBA anomaly analysis</p>
                      </div>
                    </button>
                    <button onClick={() => setSection('score')}
                      className="flex items-center gap-2 p-3 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 hover:border-indigo-300 dark:hover:border-indigo-600 transition-colors text-left">
                      <Shield className="w-5 h-5 text-green-500 shrink-0" />
                      <div>
                        <p className="text-sm font-medium text-gray-900 dark:text-white">Posture Assessment</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">Detailed security checks</p>
                      </div>
                    </button>
                  </div>
                </div>
              </div>

              {/* Refresh */}
              <div className="flex justify-center">
                <button onClick={loadOverview}
                  className="flex items-center gap-2 px-4 py-2 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 transition-colors">
                  <RefreshCw className="w-3.5 h-3.5" /> Refresh overview
                </button>
              </div>
            </>
          ) : (
            <div className="text-center py-16 text-gray-400">
              <ShieldAlert className="w-8 h-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">Unable to load overview data</p>
              <button onClick={loadOverview} className="mt-2 text-xs text-indigo-500 hover:underline">Retry</button>
            </div>
          )}
        </div>
      )}

      {/* ═══════ Security Events ═══════ */}
      {section === 'events' && <SecurityEventsTab />}

      {/* ═══════ Threat Detection ═══════ */}
      {section === 'threats' && <ThreatDetectionTab />}

      {/* ═══════ Security Score ═══════ */}
      {section === 'score' && <SecurityScoreTab />}

      {/* ═══════ Geographic Access ═══════ */}
      {section === 'geo' && <GeoAccessMap />}

      {/* ═══════ Compliance Dashboard ═══════ */}
      {section === 'compliance' && <ComplianceDashboard />}
    </div>
  );
}
