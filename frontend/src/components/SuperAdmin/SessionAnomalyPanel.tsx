import { useState, useEffect } from 'react';
import {
  AlertTriangle, ShieldAlert, Loader2, RefreshCw,
  Monitor, Clock, Globe, Activity,
} from 'lucide-react';

/* ───────── Types ───────── */

interface SessionAnomaly {
  userId: string;
  username: string;
  role: string;
  ip: string;
  firstSeen: string;
  lastSeen: string;
  requestCount: number;
  riskScore: number;
  anomalyReasons: string[];
  isNewDevice: boolean;
  deviceBlocked: boolean;
  deviceTrusted: boolean;
}

/* ───────── Component ───────── */

const API_BASE = import.meta.env.VITE_API_BASE_URL || '/api/v1';

export default function SessionAnomalyPanel() {
  const [sessions, setSessions] = useState<SessionAnomaly[]>([]);
  const [riskySessions, setRiskySessions] = useState(0);
  const [loading, setLoading] = useState(true);
  const [showAll, setShowAll] = useState(false);

  const authHeaders = () => ({
    Authorization: `Bearer ${sessionStorage.getItem('fuel_order_token')}`,
  });

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/system-admin/session-anomalies`, { headers: authHeaders() });
      const json = await res.json();
      if (json.success) {
        setSessions(json.data.sessions);
        setRiskySessions(json.data.riskySessions);
      }
    } catch {
      // Non-critical
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const displayed = showAll ? sessions : sessions.filter(s => s.riskScore > 0);

  const getRiskColor = (score: number) => {
    if (score >= 50) return 'text-red-600 dark:text-red-400';
    if (score >= 30) return 'text-orange-600 dark:text-orange-400';
    if (score >= 15) return 'text-amber-600 dark:text-amber-400';
    return 'text-green-600 dark:text-green-400';
  };

  const getRiskBg = (score: number) => {
    if (score >= 50) return 'bg-red-50 dark:bg-red-900/10 border-l-2 border-red-400';
    if (score >= 30) return 'bg-orange-50 dark:bg-orange-900/10 border-l-2 border-orange-400';
    if (score >= 15) return 'bg-amber-50 dark:bg-amber-900/10 border-l-2 border-amber-400';
    return '';
  };

  if (loading) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div className="flex justify-center py-8">
          <Loader2 className="w-5 h-5 text-indigo-500 animate-spin" />
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
            riskySessions > 0
              ? 'bg-amber-100 dark:bg-amber-900/40'
              : 'bg-green-100 dark:bg-green-900/40'
          }`}>
            <ShieldAlert className={`w-4 h-4 ${
              riskySessions > 0
                ? 'text-amber-600 dark:text-amber-400'
                : 'text-green-600 dark:text-green-400'
            }`} />
          </div>
          <div>
            <h3 className="font-semibold text-gray-900 dark:text-gray-100">Session Anomaly Detection</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {riskySessions > 0
                ? `${riskySessions} session${riskySessions > 1 ? 's' : ''} with anomalies detected`
                : 'No anomalies detected'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowAll(!showAll)}
            className="px-3 py-1.5 text-xs font-medium rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
          >
            {showAll ? 'Risky Only' : 'Show All'}
          </button>
          <button onClick={load} className="p-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors">
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {displayed.length === 0 ? (
        <div className="text-center py-8 text-gray-400">
          <Activity className="w-6 h-6 mx-auto mb-2 opacity-30" />
          <p className="text-sm">{showAll ? 'No active sessions' : 'No risky sessions detected'}</p>
        </div>
      ) : (
        <div className="divide-y divide-gray-100 dark:divide-gray-700">
          {displayed.map(s => (
            <div key={s.userId} className={`px-5 py-3 flex items-center justify-between gap-4 ${getRiskBg(s.riskScore)}`}>
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm shrink-0 ${
                  s.riskScore >= 30
                    ? 'bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300'
                    : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300'
                }`}>
                  {s.username.charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-sm text-gray-900 dark:text-gray-100">{s.username}</span>
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300">
                      {s.role.replace(/_/g, ' ')}
                    </span>
                    {/* Anomaly badges */}
                    {s.anomalyReasons.map(reason => (
                      <span key={reason} className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
                        <AlertTriangle className="w-2.5 h-2.5" />
                        {reason}
                      </span>
                    ))}
                    {s.deviceBlocked && (
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300">
                        Blocked Device
                      </span>
                    )}
                    {s.deviceTrusted && (
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300">
                        Trusted Device
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 mt-0.5 text-xs text-gray-400">
                    <span className="flex items-center gap-1"><Globe className="w-3 h-3" /><code className="font-mono">{s.ip}</code></span>
                    <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{new Date(s.lastSeen).toLocaleTimeString()}</span>
                    <span className="flex items-center gap-1"><Monitor className="w-3 h-3" />{s.requestCount} reqs</span>
                  </div>
                </div>
              </div>
              <div className="text-right shrink-0">
                <p className={`text-lg font-bold ${getRiskColor(s.riskScore)}`}>{s.riskScore}</p>
                <p className="text-[10px] text-gray-400">risk score</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
