/**
 * ComplianceDashboard — Compliance & Regulatory overview.
 * Displays compliance status across four frameworks derived from security score checks.
 */
import { useState, useEffect, useCallback } from 'react';
import {
  Shield, RefreshCw, CheckCircle, AlertTriangle, XCircle,
  Loader2, ChevronDown, ChevronRight, ClipboardCheck,
  AlertOctagon,
} from 'lucide-react';

/* ───────── Types ───────── */

interface ComplianceControl {
  id: string;
  title: string;
  status: 'pass' | 'fail' | 'partial';
  checks: string[];
}

interface ComplianceFramework {
  id: string;
  name: string;
  description: string;
  percentage: number;
  controls: ComplianceControl[];
}

interface ComplianceData {
  overallPercentage: number;
  frameworks: ComplianceFramework[];
  securityScore: number;
  generatedAt: string;
}

/* ───────── Constants ───────── */

const STATUS_ICON: Record<string, { icon: React.ReactNode; color: string; bg: string }> = {
  pass:    { icon: <CheckCircle className="w-4 h-4" />, color: 'text-green-600 dark:text-green-400', bg: 'bg-green-50 dark:bg-green-900/20' },
  partial: { icon: <AlertTriangle className="w-4 h-4" />, color: 'text-yellow-600 dark:text-yellow-400', bg: 'bg-yellow-50 dark:bg-yellow-900/20' },
  fail:    { icon: <XCircle className="w-4 h-4" />, color: 'text-red-600 dark:text-red-400', bg: 'bg-red-50 dark:bg-red-900/20' },
};

function pctColor(pct: number): string {
  if (pct >= 80) return 'text-green-600 dark:text-green-400';
  if (pct >= 60) return 'text-yellow-600 dark:text-yellow-400';
  return 'text-red-600 dark:text-red-400';
}

function barColor(pct: number): string {
  if (pct >= 80) return 'bg-green-500';
  if (pct >= 60) return 'bg-yellow-500';
  return 'bg-red-500';
}

/* ───────── Component ───────── */

export default function ComplianceDashboard() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<ComplianceData | null>(null);
  const [expandedFramework, setExpandedFramework] = useState<string | null>(null);

  const fetchCompliance = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const token = sessionStorage.getItem('fuel_order_token');
      const res = await fetch('/api/v1/system-admin/compliance', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.message || 'Failed to load compliance data');
      setData(json.data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchCompliance(); }, [fetchCompliance]);

  if (loading && !data) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="w-6 h-6 text-indigo-500 animate-spin" />
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-lg p-4 flex items-center gap-2">
        <AlertTriangle className="w-5 h-5 text-red-600 dark:text-red-400" />
        <span className="text-sm text-red-700 dark:text-red-300">{error}</span>
        <button onClick={fetchCompliance} className="ml-auto text-xs text-red-600 hover:underline">Retry</button>
      </div>
    );
  }

  if (!data) return null;

  const passCount = data.frameworks.reduce((s, f) => s + f.controls.filter(c => c.status === 'pass').length, 0);
  const totalControls = data.frameworks.reduce((s, f) => s + f.controls.length, 0);
  const failCount = data.frameworks.reduce((s, f) => s + f.controls.filter(c => c.status === 'fail').length, 0);

  return (
    <div className="space-y-5">
      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-3">
          <div className="flex items-center gap-2">
            <ClipboardCheck className="w-4 h-4 text-indigo-500" />
            <span className="text-xs text-gray-500 dark:text-gray-400">Overall Compliance</span>
          </div>
          <p className={`text-2xl font-bold mt-1 ${pctColor(data.overallPercentage)}`}>
            {Math.round(data.overallPercentage)}%
          </p>
        </div>
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-3">
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-blue-500" />
            <span className="text-xs text-gray-500 dark:text-gray-400">Security Score</span>
          </div>
          <p className={`text-2xl font-bold mt-1 ${pctColor(data.securityScore)}`}>
            {Math.round(data.securityScore)}
          </p>
        </div>
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-3">
          <div className="flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-green-500" />
            <span className="text-xs text-gray-500 dark:text-gray-400">Controls Passing</span>
          </div>
          <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">
            {passCount}<span className="text-sm text-gray-400">/{totalControls}</span>
          </p>
        </div>
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-3">
          <div className="flex items-center gap-2">
            <AlertOctagon className="w-4 h-4 text-red-500" />
            <span className="text-xs text-gray-500 dark:text-gray-400">Controls Failing</span>
          </div>
          <p className="text-2xl font-bold text-red-600 dark:text-red-400 mt-1">{failCount}</p>
        </div>
      </div>

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <ClipboardCheck className="w-5 h-5 text-indigo-500" />
          <h3 className="text-lg font-bold text-gray-900 dark:text-white">Compliance Frameworks</h3>
        </div>
        <button
          onClick={fetchCompliance}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Framework cards */}
      <div className="space-y-3">
        {data.frameworks.map(fw => {
          const isExpanded = expandedFramework === fw.id;
          const passedControls = fw.controls.filter(c => c.status === 'pass').length;
          const failedControls = fw.controls.filter(c => c.status === 'fail').length;

          return (
            <div
              key={fw.id || fw.name}
              className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden"
            >
              {/* Framework header */}
              <button
                onClick={() => setExpandedFramework(isExpanded ? null : fw.id)}
                className="w-full p-4 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-800/80 transition-colors"
              >
                <div className="flex-1 min-w-0 text-left">
                  <div className="flex items-center gap-3">
                    <h4 className="text-sm font-semibold text-gray-900 dark:text-white">{fw.name}</h4>
                    <span className={`text-sm font-bold ${pctColor(fw.percentage)}`}>
                      {Math.round(fw.percentage)}%
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{fw.description}</p>
                  {/* Progress bar */}
                  <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1.5 mt-2">
                    <div
                      className={`${barColor(fw.percentage)} h-1.5 rounded-full transition-all duration-500`}
                      style={{ width: `${Math.min(100, fw.percentage)}%` }}
                    />
                  </div>
                  <div className="flex items-center gap-3 mt-1.5 text-[10px] text-gray-400 dark:text-gray-500">
                    <span className="text-green-600 dark:text-green-400">{passedControls} passed</span>
                    {failedControls > 0 && <span className="text-red-600 dark:text-red-400">{failedControls} failed</span>}
                    <span>{fw.controls.length} total controls</span>
                  </div>
                </div>
                <div className="ml-3 shrink-0 text-gray-400">
                  {isExpanded ? <ChevronDown className="w-5 h-5" /> : <ChevronRight className="w-5 h-5" />}
                </div>
              </button>

              {/* Controls list */}
              {isExpanded && (
                <div className="border-t border-gray-100 dark:border-gray-700">
                  <div className="divide-y divide-gray-100 dark:divide-gray-700">
                    {fw.controls.map(ctrl => {
                      const si = STATUS_ICON[ctrl.status];
                      return (
                        <div key={ctrl.id} className={`flex items-center gap-3 px-4 py-3 ${si.bg}`}>
                          <span className={si.color}>{si.icon}</span>
                          <div className="flex-1 min-w-0">
                            <span className="text-xs font-mono text-gray-400 dark:text-gray-500 mr-2">{ctrl.id}</span>
                            <span className="text-sm text-gray-800 dark:text-gray-200">{ctrl.title}</span>
                          </div>
                          <span className={`text-xs font-semibold uppercase ${si.color}`}>{ctrl.status}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Timestamp */}
      <p className="text-[10px] text-gray-400 dark:text-gray-500 text-right">
        Last assessed: {new Date(data.generatedAt).toLocaleString()}
      </p>
    </div>
  );
}
