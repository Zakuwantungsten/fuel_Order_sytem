import { useState, useEffect, useRef, useCallback } from 'react';
import usePersistedState from '../../hooks/usePersistedState';
import {
  FileSearch, Download, ChevronDown, Check, Shield, ShieldAlert,
  ShieldCheck, RefreshCw, AlertTriangle, Eye, X, ChevronRight,
} from 'lucide-react';
import { systemAdminAPI } from '../../services/api';

interface AuditLogsTabProps {
  onMessage: (type: 'success' | 'error', message: string) => void;
}

// â”€â”€ Filter options â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const ACTION_TYPES = [
  { value: '', label: 'All Actions' },
  // CRUD
  { value: 'CREATE',           label: 'Create'           },
  { value: 'UPDATE',           label: 'Update'           },
  { value: 'DELETE',           label: 'Delete'           },
  { value: 'RESTORE',          label: 'Restore'          },
  { value: 'PERMANENT_DELETE', label: 'Permanent Delete' },
  { value: 'IMPORT',           label: 'Import'           },
  // Auth
  { value: 'LOGIN',            label: 'Login'            },
  { value: 'LOGOUT',           label: 'Logout'           },
  { value: 'FAILED_LOGIN',     label: 'Failed Login'     },
  { value: 'PASSWORD_RESET',   label: 'Password Reset'   },
  { value: 'TOKEN_REFRESH',    label: 'Token Refresh'    },
  { value: 'SESSION_EXPIRED',  label: 'Session Expired'  },
  // Access control
  { value: 'ACCESS_DENIED',    label: 'Access Denied'    },
  { value: 'ROLE_CHANGE',      label: 'Role Change'      },
  { value: 'ACCOUNT_LOCKED',   label: 'Account Locked'   },
  { value: 'ACCOUNT_UNLOCKED', label: 'Account Unlocked' },
  // Data access
  { value: 'VIEW_SENSITIVE_DATA', label: 'Sensitive View' },
  { value: 'EXPORT',           label: 'Export'           },
  // Workflow
  { value: 'APPROVE',          label: 'Approve'          },
  { value: 'REJECT',           label: 'Reject'           },
  // System
  { value: 'CONFIG_CHANGE',        label: 'Config Change'        },
  { value: 'BULK_OPERATION',       label: 'Bulk Operation'       },
  { value: 'ENABLE_MAINTENANCE',   label: 'Enable Maintenance'   },
  { value: 'DISABLE_MAINTENANCE',  label: 'Disable Maintenance'  },
  // Audit integrity
  { value: 'VERIFY_INTEGRITY',     label: 'Integrity Verify'     },
];

const SEVERITY_TYPES = [
  { value: '', label: 'All Severities' },
  { value: 'low',      label: 'Low'      },
  { value: 'medium',   label: 'Medium'   },
  { value: 'high',     label: 'High'     },
  { value: 'critical', label: 'Critical' },
];

const OUTCOME_TYPES = [
  { value: '',          label: 'All Outcomes' },
  { value: 'SUCCESS',   label: 'Success'      },
  { value: 'FAILURE',   label: 'Failure'      },
  { value: 'PARTIAL',   label: 'Partial'      },
];

// â”€â”€ Colour helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const severityColor = (s: string) => ({
  low:      'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300',
  medium:   'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  high:     'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300',
  critical: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
}[s] ?? 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300');

const actionColor = (a: string) => ({
  CREATE:           'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
  UPDATE:           'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  DELETE:           'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
  PERMANENT_DELETE: 'bg-red-200 text-red-800 dark:bg-red-900/50 dark:text-red-300',
  RESTORE:          'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
  LOGIN:            'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
  LOGOUT:           'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300',
  FAILED_LOGIN:     'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
  ACCESS_DENIED:    'bg-red-200 text-red-800 dark:bg-red-900/50 dark:text-red-300',
  ROLE_CHANGE:      'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300',
  ACCOUNT_LOCKED:   'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300',
  ACCOUNT_UNLOCKED: 'bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300',
  CONFIG_CHANGE:    'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
  BULK_OPERATION:   'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300',
  EXPORT:           'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-300',
  VIEW_SENSITIVE_DATA: 'bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-300',
  VERIFY_INTEGRITY: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
}[a] ?? 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300');

const outcomeColor = (o: string) => ({
  SUCCESS: 'text-green-600 dark:text-green-400',
  FAILURE: 'text-red-600 dark:text-red-400',
  PARTIAL: 'text-orange-500 dark:text-orange-400',
}[o] ?? 'text-gray-500');

const riskColor = (score: number) => {
  if (score >= 80) return 'text-red-600 dark:text-red-400';
  if (score >= 60) return 'text-orange-500 dark:text-orange-400';
  if (score >= 40) return 'text-yellow-500 dark:text-yellow-400';
  return 'text-gray-500 dark:text-gray-400';
};

// â”€â”€ Simple dropdown component  â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function FilterDropdown({ label, value, options, onChange }: {
  label: string; value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const selected = options.find(o => o.value === value);

  return (
    <div className="relative" ref={ref}>
      <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">{label}</label>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full px-3 py-2 border dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 flex items-center justify-between"
      >
        <span>{selected?.label}</span>
        <ChevronDown className="w-4 h-4 text-gray-400" />
      </button>
      {open && (
        <div className="absolute z-50 mt-1 w-full bg-white dark:bg-gray-700 border dark:border-gray-600 rounded-lg shadow-lg max-h-60 overflow-auto">
          {options.map(opt => (
            <button
              key={opt.value} type="button"
              onClick={() => { onChange(opt.value); setOpen(false); }}
              className="w-full px-3 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-600 text-gray-900 dark:text-gray-100 flex items-center justify-between"
            >
              <span>{opt.label}</span>
              {value === opt.value && <Check className="w-4 h-4 text-indigo-600" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// â”€â”€ Log detail modal â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function LogDetailModal({ log, onClose }: { log: any; onClose: () => void }) {
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b dark:border-gray-700">
          <h3 className="font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
            <Eye className="w-5 h-5 text-indigo-500" />
            Audit Log Detail
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-4 space-y-4">
          {/* Core info */}
          <div className="grid grid-cols-2 gap-3 text-sm">
            {[
              ['Timestamp',     new Date(log.timestamp).toLocaleString()],
              ['User',          log.username],
              ['User ID',       log.userId || 'â€”'],
              ['Action',        log.action],
              ['Resource Type', log.resourceType],
              ['Resource ID',   log.resourceId || 'â€”'],
              ['Outcome',       log.outcome || 'SUCCESS'],
              ['Severity',      log.severity],
              ['Risk Score',    log.riskScore ?? 'â€”'],
              ['IP Address',    log.ipAddress || 'â€”'],
              ['Read Only',     log.readOnly ? 'Yes' : 'No'],
              ['Error Code',    log.errorCode || 'â€”'],
              ['Correlation ID', log.correlationId || 'â€”'],
              ['Session ID',    log.sessionId || 'â€”'],
            ].map(([k, v]) => (
              <div key={k} className="bg-gray-50 dark:bg-gray-700/50 rounded p-2">
                <p className="text-xs text-gray-500 dark:text-gray-400">{k}</p>
                <p className="font-mono text-xs text-gray-900 dark:text-gray-100 break-all">{String(v)}</p>
              </div>
            ))}
          </div>

          {log.details && (
            <div>
              <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Details</p>
              <p className="text-sm text-gray-800 dark:text-gray-200">{log.details}</p>
            </div>
          )}

          {/* Before / After diff */}
          {(log.previousValue || log.newValue) && (
            <div className="grid grid-cols-2 gap-3">
              {log.previousValue && (
                <div>
                  <p className="text-xs font-medium text-red-500 mb-1">Before</p>
                  <pre className="text-xs bg-red-50 dark:bg-red-900/20 text-red-800 dark:text-red-200 rounded p-2 overflow-auto max-h-40">
                    {JSON.stringify(log.previousValue, null, 2)}
                  </pre>
                </div>
              )}
              {log.newValue && (
                <div>
                  <p className="text-xs font-medium text-green-600 mb-1">After</p>
                  <pre className="text-xs bg-green-50 dark:bg-green-900/20 text-green-800 dark:text-green-200 rounded p-2 overflow-auto max-h-40">
                    {JSON.stringify(log.newValue, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          )}

          {/* Integrity hash */}
          {log.hash && (
            <div>
              <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1 flex items-center gap-1">
                <Shield className="w-3 h-3" /> SHA-256 Integrity Hash
              </p>
              <p className="font-mono text-xs text-gray-600 dark:text-gray-300 break-all bg-gray-50 dark:bg-gray-700/50 p-2 rounded">
                {log.hash}
              </p>
              {log.previousHash && (
                <>
                  <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mt-2 mb-1">Previous Hash (chain)</p>
                  <p className="font-mono text-xs text-gray-500 dark:text-gray-400 break-all bg-gray-50 dark:bg-gray-700/50 p-2 rounded">
                    {log.previousHash}
                  </p>
                </>
              )}
            </div>
          )}

          {log.tags?.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {log.tags.map((t: string) => (
                <span key={t} className="px-2 py-0.5 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-300 text-xs rounded-full">{t}</span>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// â”€â”€ Integrity panel â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function IntegrityPanel({ onClose }: { onClose: () => void }) {
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState<any>(null);

  const runCheck = async () => {
    setLoading(true);
    try {
      const data = await systemAdminAPI.verifyAuditIntegrity({ limit: 5000 });
      setReport(data);
    } catch {
      setReport(null);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg border dark:border-gray-700 shadow-sm p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
          <Shield className="w-5 h-5 text-emerald-500" />
          Log Chain Integrity Verification
          <span className="text-xs font-normal text-gray-500 dark:text-gray-400">(equivalent to AWS CloudTrail validate-logs)</span>
        </h3>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
          <X className="w-4 h-4" />
        </button>
      </div>
      <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
        Walks every audit log entry in chronological order, re-computes its SHA-256 hash from stored
        immutable fields, and verifies the hash chain is unbroken. Any tampering will be detected.
      </p>
      <button
        onClick={runCheck}
        disabled={loading}
        className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white text-sm rounded-lg hover:bg-emerald-700 disabled:opacity-50"
      >
        {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
        {loading ? 'Verifyingâ€¦' : 'Run Integrity Check'}
      </button>

      {report && (
        <div className="mt-4 space-y-3">
          {/* Score */}
          <div className={`p-3 rounded-lg ${report.integrityScore === 100 ? 'bg-green-50 dark:bg-green-900/20' : 'bg-red-50 dark:bg-red-900/20'}`}>
            <div className="flex items-center gap-2">
              {report.integrityScore === 100
                ? <ShieldCheck className="w-5 h-5 text-green-600" />
                : <ShieldAlert className="w-5 h-5 text-red-600" />}
              <span className={`font-semibold ${report.integrityScore === 100 ? 'text-green-700 dark:text-green-300' : 'text-red-700 dark:text-red-300'}`}>
                Integrity Score: {report.integrityScore}/100
              </span>
            </div>
            <p className="text-xs mt-1 text-gray-600 dark:text-gray-300">
              Checked {report.totalChecked} entries â€” {report.valid} valid,{' '}
              {report.tampered.length} tampered, {report.chainBroken.length} chain breaks
            </p>
          </div>

          {/* Tampered entries */}
          {report.tampered.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-red-600 dark:text-red-400 mb-1">Tampered Entries ({report.tampered.length})</p>
              <div className="space-y-1 max-h-40 overflow-auto">
                {report.tampered.map((e: any) => (
                  <div key={e.id} className="text-xs bg-red-50 dark:bg-red-900/20 p-2 rounded font-mono text-red-700 dark:text-red-300">
                    {new Date(e.timestamp).toLocaleString()} â€” {e.action} â€” {e.id}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Chain broken entries */}
          {report.chainBroken.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-orange-600 dark:text-orange-400 mb-1">Chain Breaks ({report.chainBroken.length})</p>
              <div className="space-y-1 max-h-40 overflow-auto">
                {report.chainBroken.map((e: any) => (
                  <div key={e.id} className="text-xs bg-orange-50 dark:bg-orange-900/20 p-2 rounded font-mono text-orange-700 dark:text-orange-300">
                    {new Date(e.timestamp).toLocaleString()} â€” {e.action} â€” {e.id}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// â”€â”€ Main component â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export default function AuditLogsTab({ onMessage }: AuditLogsTabProps) {
  const [logs, setLogs]       = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedLog, setSelectedLog] = useState<any>(null);
  const [showIntegrity, setShowIntegrity] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [stats, setStats] = useState<any>(null);

  const [filters, setFilters] = usePersistedState('audit:filters:v2', {
    action: '', severity: '', outcome: '',
    username: '', resourceType: '',
    startDate: '', endDate: '',
  });

  const [pagination, setPagination] = useState({ page: 1, limit: 50, total: 0, totalPages: 0 });

  // â”€â”€ Load logs â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const loadLogs = useCallback(async () => {
    setLoading(true);
    try {
      const response = await systemAdminAPI.getAuditLogs({
        ...filters,
        page:  pagination.page,
        limit: pagination.limit,
      });
      setLogs(response.data || []);
      if (response.pagination) setPagination(prev => ({ ...prev, ...response.pagination }));
    } catch {
      onMessage('error', 'Failed to load audit logs');
    } finally {
      setLoading(false);
    }
  }, [filters, pagination.page, pagination.limit]);

  // â”€â”€ Load stats â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const loadStats = useCallback(async () => {
    try {
      const data = await systemAdminAPI.getAuditStats();
      setStats(data);
    } catch { /* non-critical */ }
  }, []);

  useEffect(() => { loadLogs(); }, [filters, pagination.page]);
  useEffect(() => { loadStats(); }, []);

  // Reset page on filter change
  const updateFilter = (key: string, value: string) => {
    setFilters((prev: any) => ({ ...prev, [key]: value }));
    setPagination(prev => ({ ...prev, page: 1 }));
  };

  // â”€â”€ CSV export â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const handleExport = async () => {
    setExporting(true);
    try {
      const blob = await systemAdminAPI.exportAuditLogs(filters);
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href     = url;
      a.download = `audit-logs-${new Date().toISOString().slice(0, 10)}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
      onMessage('success', 'Audit logs exported successfully');
    } catch {
      onMessage('error', 'Export failed');
    } finally {
      setExporting(false);
    }
  };

  // â”€â”€ Stat card helper â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const StatCard = ({ label, value, icon: Icon, color }: {
    label: string; value: number | string; icon: any; color: string;
  }) => (
    <div className="bg-white dark:bg-gray-800 rounded-lg border dark:border-gray-700 p-4 shadow-sm flex items-center gap-3">
      <div className={`p-2 rounded-lg ${color}`}>
        <Icon className="w-5 h-5 text-white" />
      </div>
      <div>
        <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{value}</p>
        <p className="text-xs text-gray-500 dark:text-gray-400">{label}</p>
      </div>
    </div>
  );

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
          <FileSearch className="w-6 h-6 text-yellow-600 dark:text-yellow-400" />
          Audit Trail &amp; Integrity Logs
        </h2>
        <div className="flex gap-2">
          <button
            onClick={() => setShowIntegrity(!showIntegrity)}
            className="flex items-center gap-2 px-3 py-2 bg-emerald-600 text-white text-sm rounded-lg hover:bg-emerald-700"
          >
            <Shield className="w-4 h-4" />
            Verify Integrity
          </button>
          <button
            onClick={() => { loadLogs(); loadStats(); }}
            className="flex items-center gap-2 px-3 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 text-sm rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600"
          >
            <RefreshCw className="w-4 h-4" />
            Refresh
          </button>
          <button
            onClick={handleExport}
            disabled={exporting}
            className="flex items-center gap-2 px-3 py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 disabled:opacity-50"
          >
            <Download className="w-4 h-4" />
            {exporting ? 'Exportingâ€¦' : 'Export CSV'}
          </button>
        </div>
      </div>

      {/* Stats cards */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <StatCard label="Events Today"        value={stats.todayTotal}         icon={FileSearch}   color="bg-indigo-500" />
          <StatCard label="Critical Today"      value={stats.todayCritical}      icon={AlertTriangle} color="bg-red-500" />
          <StatCard label="Failed Logins Today" value={stats.todayFailedLogins}  icon={ShieldAlert}   color="bg-orange-500" />
          <StatCard label="Access Denied Today" value={stats.todayAccessDenied}  icon={ShieldAlert}   color="bg-yellow-500" />
          <StatCard label="High Risk (24 h)"    value={stats.highRiskCount}      icon={Shield}        color="bg-pink-500" />
          <StatCard label="Failures (24 h)"     value={stats.last24hFailures}    icon={AlertTriangle} color="bg-gray-500" />
        </div>
      )}

      {/* Integrity panel */}
      {showIntegrity && <IntegrityPanel onClose={() => setShowIntegrity(false)} />}

      {/* Filters */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border dark:border-gray-700 p-4 shadow-sm">
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
          <FilterDropdown label="Action"   value={filters.action}   options={ACTION_TYPES}   onChange={v => updateFilter('action',   v)} />
          <FilterDropdown label="Severity" value={filters.severity} options={SEVERITY_TYPES} onChange={v => updateFilter('severity', v)} />
          <FilterDropdown label="Outcome"  value={filters.outcome}  options={OUTCOME_TYPES}  onChange={v => updateFilter('outcome',  v)} />

          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Username</label>
            <input
              type="text" value={filters.username}
              onChange={e => updateFilter('username', e.target.value)}
              placeholder="Filter by userâ€¦"
              className="w-full px-3 py-2 border dark:border-gray-600 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Start Date</label>
            <input
              type="date" value={filters.startDate}
              onChange={e => updateFilter('startDate', e.target.value)}
              className="w-full px-3 py-2 border dark:border-gray-600 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">End Date</label>
            <input
              type="date" value={filters.endDate}
              onChange={e => updateFilter('endDate', e.target.value)}
              className="w-full px-3 py-2 border dark:border-gray-600 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
            />
          </div>
          <div className="flex items-end">
            <button
              onClick={() => {
                setFilters({ action: '', severity: '', outcome: '', username: '', resourceType: '', startDate: '', endDate: '' });
                setPagination(prev => ({ ...prev, page: 1 }));
              }}
              className="w-full px-3 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 text-sm rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600"
            >
              Clear
            </button>
          </div>
        </div>
      </div>

      {/* Log table */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border dark:border-gray-700 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700 text-sm">
            <thead className="bg-gray-50 dark:bg-gray-700">
              <tr>
                {['Timestamp', 'User', 'Action', 'Resource', 'Outcome', 'Severity', 'Risk', 'Details', ''].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {loading ? (
                <tr><td colSpan={9} className="px-4 py-10 text-center text-gray-400">Loadingâ€¦</td></tr>
              ) : logs.length === 0 ? (
                <tr><td colSpan={9} className="px-4 py-10 text-center text-gray-400">No audit logs found</td></tr>
              ) : logs.map((log, i) => (
                <tr
                  key={i}
                  className="hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer"
                  onClick={() => setSelectedLog(log)}
                >
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-300 whitespace-nowrap font-mono text-xs">
                    {new Date(log.timestamp).toLocaleString()}
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-medium text-gray-900 dark:text-gray-100">{log.username}</p>
                    {log.ipAddress && <p className="text-xs text-gray-400 font-mono">{log.ipAddress}</p>}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${actionColor(log.action)}`}>
                      {log.action}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-gray-900 dark:text-gray-100">{log.resourceType}</p>
                    {log.resourceId && (
                      <p className="font-mono text-xs text-gray-400">{String(log.resourceId).slice(0, 10)}â€¦</p>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`font-medium text-xs ${outcomeColor(log.outcome ?? 'SUCCESS')}`}>
                      {log.outcome ?? 'SUCCESS'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${severityColor(log.severity)}`}>
                      {log.severity}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`font-mono text-xs font-semibold ${riskColor(log.riskScore ?? 0)}`}>
                      {log.riskScore ?? 0}
                    </span>
                  </td>
                  <td className="px-4 py-3 max-w-xs">
                    <p className="text-gray-600 dark:text-gray-300 text-xs truncate">{log.details || 'â€”'}</p>
                  </td>
                  <td className="px-4 py-3">
                    <ChevronRight className="w-4 h-4 text-gray-400" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {pagination.totalPages > 1 && (
          <div className="bg-gray-50 dark:bg-gray-700/50 px-4 py-3 border-t dark:border-gray-700 flex items-center justify-between">
            <p className="text-sm text-gray-600 dark:text-gray-300">
              Page {pagination.page} of {pagination.totalPages} ({pagination.total.toLocaleString()} total entries)
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setPagination(prev => ({ ...prev, page: Math.max(1, prev.page - 1) }))}
                disabled={pagination.page === 1}
                className="px-3 py-1 bg-white dark:bg-gray-700 border dark:border-gray-600 rounded text-sm disabled:opacity-50 hover:bg-gray-100 dark:hover:bg-gray-600"
              >
                Previous
              </button>
              <button
                onClick={() => setPagination(prev => ({ ...prev, page: Math.min(prev.totalPages, prev.page + 1) }))}
                disabled={pagination.page === pagination.totalPages}
                className="px-3 py-1 bg-white dark:bg-gray-700 border dark:border-gray-600 rounded text-sm disabled:opacity-50 hover:bg-gray-100 dark:hover:bg-gray-600"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Log detail modal */}
      {selectedLog && <LogDetailModal log={selectedLog} onClose={() => setSelectedLog(null)} />}
    </div>
  );
}
