import { useState, useEffect } from 'react';
import { Shield, CheckCircle, AlertTriangle, XCircle, RefreshCw, ChevronRight, Info } from 'lucide-react';

interface SecurityCheck {
  id: string;
  category: string;
  title: string;
  description: string;
  status: 'pass' | 'fail' | 'partial' | 'info';
  weight: number;
  score: number;
  recommendation?: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
}

interface CategoryScore {
  score: number;
  max: number;
  percentage: number;
}

interface SecurityScoreData {
  overallScore: number;
  maxPossibleScore: number;
  categoryScores: Record<string, CategoryScore>;
  checks: SecurityCheck[];
  generatedAt: string;
  improvementPriority: SecurityCheck[];
}

const CATEGORY_LABELS: Record<string, string> = {
  authentication: 'Authentication',
  access_control: 'Access Control',
  monitoring: 'Monitoring',
  data_protection: 'Data Protection',
  network: 'Network',
  compliance: 'Compliance',
};

export default function SecurityScoreTab() {
  const [data, setData] = useState<SecurityScoreData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);

  const fetchScore = async () => {
    setLoading(true);
    setError(null);
    try {
      const token = sessionStorage.getItem('token');
      const res = await fetch('/api/v1/system-admin/security-score', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (json.success) setData(json.data);
      else setError(json.message);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchScore(); }, []);

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

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'pass': return <CheckCircle className="w-5 h-5 text-green-500" />;
      case 'fail': return <XCircle className="w-5 h-5 text-red-500" />;
      case 'partial': return <AlertTriangle className="w-5 h-5 text-yellow-500" />;
      default: return <Info className="w-5 h-5 text-blue-500" />;
    }
  };

  const getSeverityBadge = (severity: string) => {
    const colors: Record<string, string> = {
      critical: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
      high: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
      medium: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
      low: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
    };
    return <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${colors[severity]}`}>{severity}</span>;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="w-8 h-8 text-indigo-600 animate-spin" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
        <p className="text-red-700 dark:text-red-300">{error || 'Failed to load security score'}</p>
        <button onClick={fetchScore} className="mt-2 text-sm text-red-600 hover:underline">Retry</button>
      </div>
    );
  }

  const circumference = 2 * Math.PI * 45;
  const dashOffset = circumference - (data.overallScore / 100) * circumference;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">Security Posture Dashboard</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Last assessed: {new Date(data.generatedAt).toLocaleString()}
          </p>
        </div>
        <button onClick={fetchScore} className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm">
          <RefreshCw className="w-4 h-4" /> Recalculate
        </button>
      </div>

      {/* Score Ring + Summary */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="bg-white dark:bg-gray-800 rounded-xl border dark:border-gray-700 p-6 flex flex-col items-center">
          <svg className="w-40 h-40 transform -rotate-90" viewBox="0 0 100 100">
            <circle cx="50" cy="50" r="45" fill="none" stroke="currentColor" strokeWidth="8"
              className="text-gray-200 dark:text-gray-700" />
            <circle cx="50" cy="50" r="45" fill="none" strokeWidth="8"
              strokeDasharray={circumference} strokeDashoffset={dashOffset}
              strokeLinecap="round" className={getScoreRingColor(data.overallScore)} />
          </svg>
          <div className="absolute mt-14">
            <span className={`text-4xl font-bold ${getScoreColor(data.overallScore)}`}>
              {data.overallScore}
            </span>
            <span className="text-lg text-gray-400">/100</span>
          </div>
          <p className="mt-4 text-sm text-gray-500 dark:text-gray-400 text-center">
            {data.overallScore >= 80 ? 'Strong security posture' :
             data.overallScore >= 60 ? 'Good, with room for improvement' :
             data.overallScore >= 40 ? 'Needs attention' : 'Critical improvements required'}
          </p>
        </div>

        {/* Category Breakdown */}
        <div className="lg:col-span-2 bg-white dark:bg-gray-800 rounded-xl border dark:border-gray-700 p-6">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Category Scores</h3>
          <div className="space-y-3">
            {Object.entries(data.categoryScores).map(([cat, catScore]) => (
              <div key={cat}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    {CATEGORY_LABELS[cat] || cat}
                  </span>
                  <span className={`text-sm font-bold ${getScoreColor(catScore.percentage)}`}>
                    {catScore.percentage}%
                  </span>
                </div>
                <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                  <div
                    className={`h-2 rounded-full transition-all ${
                      catScore.percentage >= 80 ? 'bg-green-500' :
                      catScore.percentage >= 60 ? 'bg-yellow-500' :
                      catScore.percentage >= 40 ? 'bg-orange-500' : 'bg-red-500'
                    }`}
                    style={{ width: `${catScore.percentage}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Improvement Priority */}
      {data.improvementPriority.length > 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-xl border dark:border-gray-700 p-6">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-orange-500" /> Top Improvements
          </h3>
          <div className="space-y-3">
            {data.improvementPriority.slice(0, 5).map((check) => (
              <div key={check.id} className="flex items-start gap-3 p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                {getStatusIcon(check.status)}
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-gray-900 dark:text-gray-100 text-sm">{check.title}</span>
                    {getSeverityBadge(check.severity)}
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{check.description}</p>
                  {check.recommendation && (
                    <p className="text-xs text-indigo-600 dark:text-indigo-400 mt-1 flex items-center gap-1">
                      <ChevronRight className="w-3 h-3" /> {check.recommendation}
                    </p>
                  )}
                </div>
                <span className="text-xs text-gray-400">{check.score}/{check.weight} pts</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Detailed Checks by Category */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border dark:border-gray-700 p-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
          <Shield className="w-5 h-5 text-indigo-500" /> All Security Checks
        </h3>
        <div className="space-y-2">
          {Object.keys(CATEGORY_LABELS).map((cat) => {
            const catChecks = data.checks.filter(c => c.category === cat);
            if (catChecks.length === 0) return null;
            const isExpanded = expandedCategory === cat;
            return (
              <div key={cat} className="border dark:border-gray-700 rounded-lg overflow-hidden">
                <button
                  onClick={() => setExpandedCategory(isExpanded ? null : cat)}
                  className="w-full flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700/50 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                >
                  <span className="font-medium text-sm text-gray-800 dark:text-gray-200">
                    {CATEGORY_LABELS[cat]}
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                      {catChecks.filter(c => c.status === 'pass').length}/{catChecks.length} passed
                    </span>
                    <ChevronRight className={`w-4 h-4 text-gray-400 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                  </div>
                </button>
                {isExpanded && (
                  <div className="p-3 space-y-2">
                    {catChecks.map((check) => (
                      <div key={check.id} className="flex items-start gap-3 p-2">
                        {getStatusIcon(check.status)}
                        <div className="flex-1">
                          <span className="text-sm text-gray-800 dark:text-gray-200">{check.title}</span>
                          <p className="text-xs text-gray-500 dark:text-gray-400">{check.description}</p>
                        </div>
                        {getSeverityBadge(check.severity)}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
