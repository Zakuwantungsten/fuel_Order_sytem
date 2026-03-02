import { useState, useEffect } from 'react';
import { Radar, Users, Clock, Download, MapPin, RefreshCw, AlertTriangle, ChevronDown, ChevronRight } from 'lucide-react';

interface ThreatOverview {
  threatLevel: string;
  highRiskUsers: Array<{ userId: string; name: string; email: string; riskScore: number; reasons: string[] }>;
  failedLoginClusters: Array<{ _id: string; count: number; lastAttempt: string }>;
  offHoursActivity: Array<{ _id: string; name: string; actionCount: number }>;
  largeExports: Array<{ _id: string; name: string; exportCount: number; totalRecords: number }>;
  impossibleTravel: Array<{ userId: string; name: string; locations: string[]; timeDiff: number }>;
  accessAnomalies: Array<{ _id: string; name: string; uniqueIPs: number; countries: string[] }>;
}

interface UserBaseline {
  activityByHour: Record<string, number>;
  activityByDay: Record<string, number>;
  topActions: Array<{ action: string; count: number }>;
  riskHistory: Array<{ date: string; score: number; level: string }>;
}

const THREAT_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  low: { bg: 'bg-green-100 dark:bg-green-900/20', text: 'text-green-700 dark:text-green-400', border: 'border-green-300 dark:border-green-700' },
  medium: { bg: 'bg-yellow-100 dark:bg-yellow-900/20', text: 'text-yellow-700 dark:text-yellow-400', border: 'border-yellow-300 dark:border-yellow-700' },
  high: { bg: 'bg-orange-100 dark:bg-orange-900/20', text: 'text-orange-700 dark:text-orange-400', border: 'border-orange-300 dark:border-orange-700' },
  critical: { bg: 'bg-red-100 dark:bg-red-900/20', text: 'text-red-700 dark:text-red-400', border: 'border-red-300 dark:border-red-700' },
};

export default function ThreatDetectionTab() {
  const [overview, setOverview] = useState<ThreatOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(['highRiskUsers', 'failedLoginClusters']));
  const [selectedUser, setSelectedUser] = useState<string | null>(null);
  const [baseline, setBaseline] = useState<UserBaseline | null>(null);
  const [baselineLoading, setBaselineLoading] = useState(false);

  const headers = () => ({
    'Content-Type': 'application/json',
    Authorization: `Bearer ${sessionStorage.getItem('token')}`,
  });

  const fetchOverview = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/v1/system-admin/threat-detection/anomalies?days=7', { headers: headers() });
      const json = await res.json();
      if (json.success) setOverview(json.data);
      else setError(json.message);
    } catch (err: any) { setError(err.message); }
    finally { setLoading(false); }
  };

  const fetchBaseline = async (userId: string) => {
    setBaselineLoading(true);
    setSelectedUser(userId);
    try {
      const res = await fetch(`/api/v1/system-admin/threat-detection/baseline/${userId}`, { headers: headers() });
      const json = await res.json();
      if (json.success) setBaseline(json.data);
    } catch (err: any) { setError(err.message); }
    finally { setBaselineLoading(false); }
  };

  useEffect(() => { fetchOverview(); }, []);

  const toggle = (section: string) => {
    setExpandedSections(prev => {
      const next = new Set(prev);
      next.has(section) ? next.delete(section) : next.add(section);
      return next;
    });
  };

  if (loading) return <div className="flex justify-center py-12"><RefreshCw className="w-6 h-6 text-red-600 animate-spin" /></div>;

  const tc = THREAT_COLORS[overview?.threatLevel || 'low'];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">Threat Detection & UEBA</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">User and Entity Behavior Analytics — anomaly detection dashboard</p>
        </div>
        <button onClick={fetchOverview} className="flex items-center gap-2 px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg text-sm hover:bg-gray-300 dark:hover:bg-gray-600">
          <RefreshCw className="w-4 h-4" /> Refresh
        </button>
      </div>

      {error && <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3 text-sm text-red-700 dark:text-red-300">{error}</div>}

      {/* Threat Level Banner */}
      {overview && (
        <div className={`${tc.bg} ${tc.border} border rounded-lg p-4 flex items-center gap-3`}>
          <Radar className={`w-6 h-6 ${tc.text}`} />
          <div>
            <p className={`font-semibold ${tc.text} uppercase`}>Threat Level: {overview.threatLevel}</p>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              {overview.highRiskUsers.length} high-risk users, {overview.failedLoginClusters.length} failed login clusters detected in last 7 days
            </p>
          </div>
        </div>
      )}

      {overview && (
        <div className="space-y-4">
          {/* High-Risk Users */}
          <SectionCard title="High-Risk Users" icon={<Users className="w-4 h-4" />} count={overview.highRiskUsers.length}
            expanded={expandedSections.has('highRiskUsers')} onToggle={() => toggle('highRiskUsers')}>
            {overview.highRiskUsers.length === 0 ? <p className="text-sm text-gray-500 dark:text-gray-400">No high-risk users detected</p> : (
              <div className="space-y-2">
                {overview.highRiskUsers.map(u => (
                  <div key={u.userId} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-900/50 rounded-lg">
                    <div>
                      <p className="font-medium text-sm text-gray-900 dark:text-gray-100">{u.name}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">{u.email}</p>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {u.reasons.map((r, i) => (
                          <span key={i} className="px-1.5 py-0.5 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 rounded text-xs">{r}</span>
                        ))}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={`text-lg font-bold ${u.riskScore >= 80 ? 'text-red-600' : u.riskScore >= 60 ? 'text-orange-600' : 'text-yellow-600'}`}>{u.riskScore}</span>
                      <button onClick={() => fetchBaseline(u.userId)} className="px-2 py-1 text-xs bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400 rounded hover:bg-indigo-200">
                        Baseline
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </SectionCard>

          {/* Failed Login Clusters */}
          <SectionCard title="Failed Login Clusters" icon={<AlertTriangle className="w-4 h-4" />} count={overview.failedLoginClusters.length}
            expanded={expandedSections.has('failedLoginClusters')} onToggle={() => toggle('failedLoginClusters')}>
            {overview.failedLoginClusters.length === 0 ? <p className="text-sm text-gray-500 dark:text-gray-400">No suspicious clusters</p> : (
              <div className="space-y-2">
                {overview.failedLoginClusters.map(c => (
                  <div key={c._id} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-900/50 rounded-lg">
                    <div>
                      <p className="font-medium text-sm text-gray-900 dark:text-gray-100">IP: {c._id}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">Last attempt: {new Date(c.lastAttempt).toLocaleString()}</p>
                    </div>
                    <span className="text-lg font-bold text-red-600">{c.count} attempts</span>
                  </div>
                ))}
              </div>
            )}
          </SectionCard>

          {/* Off-Hours Activity */}
          <SectionCard title="Off-Hours Activity" icon={<Clock className="w-4 h-4" />} count={overview.offHoursActivity.length}
            expanded={expandedSections.has('offHoursActivity')} onToggle={() => toggle('offHoursActivity')}>
            {overview.offHoursActivity.length === 0 ? <p className="text-sm text-gray-500 dark:text-gray-400">No off-hours activity</p> : (
              <div className="space-y-2">
                {overview.offHoursActivity.map(a => (
                  <div key={a._id} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-900/50 rounded-lg">
                    <p className="font-medium text-sm text-gray-900 dark:text-gray-100">{a.name}</p>
                    <span className="text-sm font-medium text-amber-600">{a.actionCount} actions</span>
                  </div>
                ))}
              </div>
            )}
          </SectionCard>

          {/* Large Exports */}
          <SectionCard title="Bulk Data Exports" icon={<Download className="w-4 h-4" />} count={overview.largeExports.length}
            expanded={expandedSections.has('largeExports')} onToggle={() => toggle('largeExports')}>
            {overview.largeExports.length === 0 ? <p className="text-sm text-gray-500 dark:text-gray-400">No suspicious exports</p> : (
              <div className="space-y-2">
                {overview.largeExports.map(e => (
                  <div key={e._id} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-900/50 rounded-lg">
                    <div>
                      <p className="font-medium text-sm text-gray-900 dark:text-gray-100">{e.name}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">{e.totalRecords} total records exported</p>
                    </div>
                    <span className="text-sm font-medium text-orange-600">{e.exportCount} exports</span>
                  </div>
                ))}
              </div>
            )}
          </SectionCard>

          {/* Impossible Travel */}
          <SectionCard title="Impossible Travel" icon={<MapPin className="w-4 h-4" />} count={overview.impossibleTravel.length}
            expanded={expandedSections.has('impossibleTravel')} onToggle={() => toggle('impossibleTravel')}>
            {overview.impossibleTravel.length === 0 ? <p className="text-sm text-gray-500 dark:text-gray-400">No impossible travel detected</p> : (
              <div className="space-y-2">
                {overview.impossibleTravel.map(t => (
                  <div key={t.userId} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-900/50 rounded-lg">
                    <div>
                      <p className="font-medium text-sm text-gray-900 dark:text-gray-100">{t.name}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">Locations: {t.locations.join(' → ')}</p>
                    </div>
                    <span className="text-sm font-medium text-red-600">{Math.round(t.timeDiff)}min apart</span>
                  </div>
                ))}
              </div>
            )}
          </SectionCard>

          {/* Access Anomalies */}
          <SectionCard title="Access Anomalies" icon={<Radar className="w-4 h-4" />} count={overview.accessAnomalies.length}
            expanded={expandedSections.has('accessAnomalies')} onToggle={() => toggle('accessAnomalies')}>
            {overview.accessAnomalies.length === 0 ? <p className="text-sm text-gray-500 dark:text-gray-400">No access anomalies</p> : (
              <div className="space-y-2">
                {overview.accessAnomalies.map(a => (
                  <div key={a._id} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-900/50 rounded-lg">
                    <div>
                      <p className="font-medium text-sm text-gray-900 dark:text-gray-100">{a.name}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">Countries: {a.countries.join(', ')}</p>
                    </div>
                    <span className="text-sm font-medium text-purple-600">{a.uniqueIPs} IPs</span>
                  </div>
                ))}
              </div>
            )}
          </SectionCard>
        </div>
      )}

      {/* User Baseline Modal */}
      {selectedUser && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => { setSelectedUser(null); setBaseline(null); }}>
          <div className="bg-white dark:bg-gray-800 rounded-xl p-6 max-w-lg w-full mx-4 max-h-[80vh] overflow-auto" onClick={e => e.stopPropagation()}>
            <h3 className="font-bold text-lg text-gray-900 dark:text-gray-100 mb-4">User Behavioral Baseline</h3>
            {baselineLoading ? <RefreshCw className="w-5 h-5 animate-spin mx-auto text-indigo-500" /> : baseline ? (
              <div className="space-y-4">
                <div>
                  <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Top Actions</h4>
                  {baseline.topActions.map(a => (
                    <div key={a.action} className="flex justify-between text-sm py-1">
                      <span className="text-gray-600 dark:text-gray-400">{a.action}</span>
                      <span className="font-medium text-gray-900 dark:text-gray-100">{a.count}</span>
                    </div>
                  ))}
                </div>
                <div>
                  <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Recent Risk Scores</h4>
                  <div className="flex items-end gap-1 h-20">
                    {baseline.riskHistory.map((r, i) => (
                      <div key={i} className="flex-1 flex flex-col items-center">
                        <div className={`w-full rounded-t ${r.score >= 80 ? 'bg-red-500' : r.score >= 60 ? 'bg-orange-500' : r.score >= 30 ? 'bg-yellow-500' : 'bg-green-500'}`}
                          style={{ height: `${Math.max(4, r.score)}%` }} title={`Score: ${r.score}`} />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : <p className="text-sm text-gray-500">No baseline data available</p>}
            <button onClick={() => { setSelectedUser(null); setBaseline(null); }} className="mt-4 px-4 py-2 bg-gray-200 dark:bg-gray-700 rounded-lg text-sm">Close</button>
          </div>
        </div>
      )}
    </div>
  );
}

// Collapsible section card component
function SectionCard({ title, icon, count, expanded, onToggle, children }: {
  title: string; icon: React.ReactNode; count: number; expanded: boolean; onToggle: () => void; children: React.ReactNode;
}) {
  return (
    <div className="bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-lg">
      <button onClick={onToggle} className="w-full flex items-center justify-between p-4 hover:bg-gray-50 dark:hover:bg-gray-750">
        <div className="flex items-center gap-2">
          {icon}
          <span className="font-medium text-gray-900 dark:text-gray-100">{title}</span>
          {count > 0 && <span className="px-2 py-0.5 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 rounded-full text-xs">{count}</span>}
        </div>
        {expanded ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
      </button>
      {expanded && <div className="px-4 pb-4">{children}</div>}
    </div>
  );
}
