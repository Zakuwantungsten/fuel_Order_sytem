import { useState, useEffect, useCallback, useMemo } from 'react';
import { toast } from 'react-toastify';
import {
  ShieldPlus, Clock, CheckCircle, XCircle, Ban,
  RefreshCw, Loader2, UserCheck, AlertTriangle,
  ArrowUpRight, Timer, MessageSquare,
} from 'lucide-react';
import apiClient from '../../../../services/api';
import { PRIVILEGE_STATUS_CONFIG } from '../constants';
import type { PrivilegeRequest, PrivilegeStatus } from '../types';
import StatCard from './StatCard';
import AccessibleModal from './AccessibleModal';
import RoleBadge from './RoleBadge';

// ── Stat gradients ───────────────────────────────────────────────────────────
const PRIV_GRADIENTS = {
  total:     'from-indigo-500 to-blue-600',
  pending:   'from-amber-500 to-yellow-600',
  active:    'from-emerald-500 to-green-600',
  processed: 'from-gray-500 to-slate-600',
} as const;

// ── Filter options ───────────────────────────────────────────────────────────
const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: '',        label: 'All Requests' },
  { value: 'pending', label: 'Pending' },
  { value: 'active',  label: 'Active' },
  { value: 'approved',label: 'Approved' },
  { value: 'denied',  label: 'Denied' },
  { value: 'expired', label: 'Expired' },
  { value: 'revoked', label: 'Revoked' },
];

const formatRole = (role: string) =>
  role.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());

function getTimeRemaining(expiresAt: string): string {
  const diff = new Date(expiresAt).getTime() - Date.now();
  if (diff <= 0) return 'Expired';
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m remaining`;
  const hrs = Math.floor(mins / 60);
  const rem = mins % 60;
  return `${hrs}h ${rem}m remaining`;
}

export default function PrivilegeElevationView() {
  // ── State ─────────────────────────────────────────────────────────────
  const [requests, setRequests] = useState<PrivilegeRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Deny modal state
  const [denyTarget, setDenyTarget] = useState<PrivilegeRequest | null>(null);
  const [denyReason, setDenyReason] = useState('');

  // Revoke modal state
  const [revokeTarget, setRevokeTarget] = useState<PrivilegeRequest | null>(null);
  const [revokeReason, setRevokeReason] = useState('');

  // ── Fetch ─────────────────────────────────────────────────────────────
  const fetchRequests = useCallback(async () => {
    setLoading(true);
    try {
      const params = statusFilter ? { status: statusFilter } : {};
      const res = await apiClient.get('/system-admin/privilege-elevation', { params });
      if (res.data.success) {
        setRequests(res.data.data);
      } else {
        toast.error(res.data.message || 'Failed to load requests');
      }
    } catch {
      toast.error('Failed to load privilege elevation requests');
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => { fetchRequests(); }, [fetchRequests]);

  // ── Actions ───────────────────────────────────────────────────────────
  const handleAction = useCallback(async (
    id: string,
    action: 'approve' | 'deny' | 'revoke',
    reason?: string,
  ) => {
    setActionLoading(id);
    try {
      const res = await apiClient.post(
        `/system-admin/privilege-elevation/${id}/${action}`,
        reason ? { reason } : {},
      );
      if (res.data.success) {
        toast.success(res.data.message || `Request ${action}d successfully`);
        setDenyTarget(null);
        setDenyReason('');
        setRevokeTarget(null);
        setRevokeReason('');
        fetchRequests();
      } else {
        toast.error(res.data.message);
      }
    } catch {
      toast.error(`Failed to ${action} request`);
    } finally {
      setActionLoading(null);
    }
  }, [fetchRequests]);

  // ── Derived stats ─────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const pending = requests.filter(r => r.status === 'pending').length;
    const active  = requests.filter(r => r.status === 'active').length;
    const processed = requests.filter(r =>
      ['denied', 'expired', 'revoked'].includes(r.status),
    ).length;
    return { total: requests.length, pending, active, processed };
  }, [requests]);

  // ── Render ────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* Stat Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Total Requests"   value={stats.total}     icon={ShieldPlus}  gradient={PRIV_GRADIENTS.total} />
        <StatCard label="Pending Approval" value={stats.pending}   icon={Clock}       gradient={PRIV_GRADIENTS.pending} />
        <StatCard label="Currently Active" value={stats.active}    icon={CheckCircle} gradient={PRIV_GRADIENTS.active} />
        <StatCard label="Processed"        value={stats.processed} icon={XCircle}     gradient={PRIV_GRADIENTS.processed} />
      </div>

      {/* Toolbar */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 shadow-sm">
        <div className="flex flex-col sm:flex-row gap-3">
          {/* Status filter tabs */}
          <div className="flex-1 flex flex-wrap items-center gap-1 bg-gray-100 dark:bg-gray-700 rounded-lg p-1" role="radiogroup" aria-label="Filter by status">
            {STATUS_OPTIONS.map(opt => (
              <button
                key={opt.value}
                role="radio"
                aria-checked={statusFilter === opt.value}
                onClick={() => setStatusFilter(opt.value)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                  statusFilter === opt.value
                    ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-gray-100 shadow-sm'
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                }`}
              >
                {opt.label}
                {opt.value === 'pending' && stats.pending > 0 && (
                  <span className="ml-1.5 px-1.5 py-0.5 text-[10px] font-bold rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400">
                    {stats.pending}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Refresh */}
          <button
            onClick={fetchRequests}
            disabled={loading}
            aria-label="Refresh"
            className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Refresh</span>
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3" role="status" aria-live="polite">
            <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
            <p className="text-sm text-gray-500 dark:text-gray-400">Loading privilege requests...</p>
          </div>
        ) : requests.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <div className="w-14 h-14 bg-gray-100 dark:bg-gray-700 rounded-full flex items-center justify-center">
              <ShieldPlus className="w-7 h-7 text-gray-400 dark:text-gray-500" />
            </div>
            <p className="text-sm font-medium text-gray-500 dark:text-gray-400">No privilege elevation requests</p>
            <p className="text-xs text-gray-400 dark:text-gray-500">
              {statusFilter ? 'Try changing the status filter' : 'No requests have been submitted yet'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700" aria-label="Privilege elevation requests">
              <thead>
                <tr className="bg-gray-50 dark:bg-gray-900/50">
                  <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Requester</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Elevation</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Status</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Duration</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Requested</th>
                  <th className="px-5 py-3 text-right text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {requests.map(req => {
                  const cfg = PRIVILEGE_STATUS_CONFIG[req.status] || PRIVILEGE_STATUS_CONFIG.pending;
                  const StatusIcon = cfg.icon;
                  const isActive  = req.status === 'active';
                  const isPending = req.status === 'pending';

                  return (
                    <tr key={req._id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                      {/* Requester */}
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-lg bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center flex-shrink-0">
                            <span className="text-sm font-bold text-indigo-600 dark:text-indigo-400">
                              {req.requestedByUsername.charAt(0).toUpperCase()}
                            </span>
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{req.requestedByUsername}</p>
                            <p className="text-xs text-gray-500 dark:text-gray-400">
                              Current: {formatRole(req.currentRole)}
                            </p>
                          </div>
                        </div>
                      </td>

                      {/* Elevation */}
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-2">
                          <ArrowUpRight className="w-4 h-4 text-indigo-500 flex-shrink-0" />
                          <div>
                            <RoleBadge role={req.targetRole as any} size="sm" showTooltip={false} />
                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 max-w-[200px] truncate" title={req.reason}>
                              <MessageSquare className="w-3 h-3 inline mr-1" />
                              {req.reason}
                            </p>
                          </div>
                        </div>
                      </td>

                      {/* Status */}
                      <td className="px-5 py-3.5">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${cfg.color}`}>
                          <StatusIcon className="w-3 h-3" />
                          <span className="capitalize">{req.status}</span>
                        </span>
                        {isActive && req.expiresAt && (
                          <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-1 flex items-center gap-1">
                            <Timer className="w-3 h-3" />
                            {getTimeRemaining(req.expiresAt)}
                          </p>
                        )}
                        {req.approvedByUsername && (
                          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                            By: {req.approvedByUsername}
                          </p>
                        )}
                        {req.denialReason && (
                          <p className="text-xs text-red-500 dark:text-red-400 mt-0.5 max-w-[180px] truncate" title={req.denialReason}>
                            {req.denialReason}
                          </p>
                        )}
                      </td>

                      {/* Duration */}
                      <td className="px-5 py-3.5">
                        <span className="text-sm text-gray-700 dark:text-gray-300 flex items-center gap-1.5">
                          <Clock className="w-3.5 h-3.5 text-gray-400" />
                          {req.durationMinutes >= 60
                            ? `${Math.floor(req.durationMinutes / 60)}h ${req.durationMinutes % 60}m`
                            : `${req.durationMinutes}m`
                          }
                        </span>
                      </td>

                      {/* Requested */}
                      <td className="px-5 py-3.5 text-sm text-gray-600 dark:text-gray-400 whitespace-nowrap">
                        {new Date(req.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                        <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                          {new Date(req.createdAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </td>

                      {/* Actions */}
                      <td className="px-5 py-3.5">
                        <div className="flex items-center justify-end gap-2">
                          {isPending && (
                            <>
                              <button
                                onClick={() => handleAction(req._id, 'approve')}
                                disabled={actionLoading === req._id}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800 hover:bg-emerald-100 dark:hover:bg-emerald-900/40 transition-colors disabled:opacity-50"
                              >
                                {actionLoading === req._id
                                  ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                  : <UserCheck className="w-3.5 h-3.5" />
                                }
                                Approve
                              </button>
                              <button
                                onClick={() => { setDenyTarget(req); setDenyReason(''); }}
                                disabled={actionLoading === req._id}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-800 hover:bg-red-100 dark:hover:bg-red-900/40 transition-colors disabled:opacity-50"
                              >
                                <XCircle className="w-3.5 h-3.5" />
                                Deny
                              </button>
                            </>
                          )}
                          {isActive && (
                            <button
                              onClick={() => { setRevokeTarget(req); setRevokeReason(''); }}
                              disabled={actionLoading === req._id}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-orange-50 dark:bg-orange-900/20 text-orange-700 dark:text-orange-400 border border-orange-200 dark:border-orange-800 hover:bg-orange-100 dark:hover:bg-orange-900/40 transition-colors disabled:opacity-50"
                            >
                              <Ban className="w-3.5 h-3.5" />
                              Revoke
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Deny Modal ────────────────────────────────────────────────────── */}
      <AccessibleModal
        isOpen={!!denyTarget}
        onClose={() => setDenyTarget(null)}
        title="Deny Privilege Elevation"
        subtitle={denyTarget ? `Denying request from ${denyTarget.requestedByUsername}` : undefined}
        icon={XCircle}
        iconBg="bg-red-100 dark:bg-red-900/30"
        size="sm"
        footer={
          <div className="flex items-center justify-end gap-3">
            <button
              onClick={() => setDenyTarget(null)}
              className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={() => denyTarget && handleAction(denyTarget._id, 'deny', denyReason)}
              disabled={!denyReason.trim() || actionLoading === denyTarget?._id}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {actionLoading === denyTarget?._id && <Loader2 className="w-4 h-4 animate-spin" />}
              Deny Request
            </button>
          </div>
        }
      >
        {denyTarget && (
          <div className="space-y-4">
            {/* Request summary */}
            <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3 space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-500 dark:text-gray-400">Target Role</span>
                <RoleBadge role={denyTarget.targetRole as any} size="sm" showTooltip={false} />
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-500 dark:text-gray-400">Duration</span>
                <span className="text-gray-900 dark:text-gray-100 font-medium">{denyTarget.durationMinutes}m</span>
              </div>
              <div className="text-sm">
                <span className="text-gray-500 dark:text-gray-400 block mb-1">Reason</span>
                <p className="text-gray-900 dark:text-gray-100 text-xs bg-white dark:bg-gray-800 rounded p-2 border dark:border-gray-600">
                  {denyTarget.reason}
                </p>
              </div>
            </div>

            {/* Denial reason */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                Denial Reason <span className="text-red-500">*</span>
              </label>
              <textarea
                value={denyReason}
                onChange={e => setDenyReason(e.target.value)}
                placeholder="Provide a reason for denying this request..."
                rows={3}
                className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:ring-2 focus:ring-red-500 focus:outline-none resize-none"
              />
            </div>

            <div className="flex items-start gap-2 p-3 bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-200 dark:border-amber-800">
              <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-amber-700 dark:text-amber-400">
                The requester will be notified of this denial and the reason provided.
              </p>
            </div>
          </div>
        )}
      </AccessibleModal>

      {/* ── Revoke Modal ──────────────────────────────────────────────────── */}
      <AccessibleModal
        isOpen={!!revokeTarget}
        onClose={() => setRevokeTarget(null)}
        title="Revoke Privilege Elevation"
        subtitle={revokeTarget ? `Revoking active elevation for ${revokeTarget.requestedByUsername}` : undefined}
        icon={Ban}
        iconBg="bg-orange-100 dark:bg-orange-900/30"
        size="sm"
        footer={
          <div className="flex items-center justify-end gap-3">
            <button
              onClick={() => setRevokeTarget(null)}
              className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={() => revokeTarget && handleAction(revokeTarget._id, 'revoke', revokeReason || 'Manually revoked by admin')}
              disabled={actionLoading === revokeTarget?._id}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-orange-600 rounded-lg hover:bg-orange-700 transition-colors disabled:opacity-50"
            >
              {actionLoading === revokeTarget?._id && <Loader2 className="w-4 h-4 animate-spin" />}
              Revoke Access
            </button>
          </div>
        }
      >
        {revokeTarget && (
          <div className="space-y-4">
            <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3 space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-500 dark:text-gray-400">Elevated Role</span>
                <RoleBadge role={revokeTarget.targetRole as any} size="sm" showTooltip={false} />
              </div>
              {revokeTarget.expiresAt && (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-500 dark:text-gray-400">Time Remaining</span>
                  <span className="text-emerald-600 dark:text-emerald-400 font-medium text-xs">
                    {getTimeRemaining(revokeTarget.expiresAt)}
                  </span>
                </div>
              )}
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-500 dark:text-gray-400">Approved By</span>
                <span className="text-gray-900 dark:text-gray-100 font-medium">{revokeTarget.approvedByUsername || '--'}</span>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                Revocation Reason <span className="text-gray-400">(optional)</span>
              </label>
              <textarea
                value={revokeReason}
                onChange={e => setRevokeReason(e.target.value)}
                placeholder="Provide a reason for revoking this elevation..."
                rows={2}
                className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:ring-2 focus:ring-orange-500 focus:outline-none resize-none"
              />
            </div>

            <div className="flex items-start gap-2 p-3 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800">
              <AlertTriangle className="w-4 h-4 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-red-700 dark:text-red-400">
                This will immediately downgrade the user back to their original role. Any actions taken during elevation will be preserved in audit logs.
              </p>
            </div>
          </div>
        )}
      </AccessibleModal>
    </div>
  );
}
