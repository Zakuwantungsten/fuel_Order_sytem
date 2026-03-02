import { useState, useEffect } from 'react';
import { ShieldPlus, Clock, CheckCircle, XCircle, RefreshCw, UserCheck, Ban } from 'lucide-react';
import apiClient from '../../services/api';

interface PrivilegeRequest {
  _id: string;
  requestedByUsername: string;
  targetRole: string;
  currentRole: string;
  reason: string;
  status: string;
  durationMinutes: number;
  approvedByUsername?: string;
  approvedAt?: string;
  deniedByUsername?: string;
  denialReason?: string;
  expiresAt?: string;
  createdAt: string;
}

const STATUS_BADGES: Record<string, { color: string; icon: any }> = {
  pending: { color: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400', icon: Clock },
  approved: { color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400', icon: CheckCircle },
  active: { color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400', icon: ShieldPlus },
  denied: { color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400', icon: XCircle },
  expired: { color: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400', icon: Clock },
  revoked: { color: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400', icon: Ban },
};

export default function PrivilegeElevationTab() {
  const [requests, setRequests] = useState<PrivilegeRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState('');
  const [denyReason, setDenyReason] = useState('');
  const [denyingId, setDenyingId] = useState<string | null>(null);

  const fetchRequests = async () => {
    setLoading(true);
    try {
      const params = statusFilter ? { status: statusFilter } : {};
      const res = await apiClient.get('/system-admin/privilege-elevation', { params });
      if (res.data.success) setRequests(res.data.data);
      else setError(res.data.message);
    } catch (err: any) {
      setError(err.response?.data?.message || err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchRequests(); }, [statusFilter]);

  const handleAction = async (id: string, action: 'approve' | 'deny' | 'revoke', reason?: string) => {
    try {
      const res = await apiClient.post(`/system-admin/privilege-elevation/${id}/${action}`, { reason });
      if (res.data.success) {
        setSuccess(res.data.message);
        setDenyingId(null);
        setDenyReason('');
        fetchRequests();
        setTimeout(() => setSuccess(null), 4000);
      } else {
        setError(res.data.message);
        setTimeout(() => setError(null), 5000);
      }
    } catch (err: any) {
      setError(err.response?.data?.message || err.message);
    }
  };

  const formatRole = (role: string) => role.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">JIT Privilege Elevation</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">4-eyes approval workflow for temporary access escalation</p>
        </div>
        <button onClick={fetchRequests} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg">
          <RefreshCw className="w-5 h-5 text-gray-500" />
        </button>
      </div>

      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3 text-sm text-red-700 dark:text-red-300">
          {error}
        </div>
      )}
      {success && (
        <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-3 text-sm text-green-700 dark:text-green-300">
          {success}
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        {['', 'pending', 'active', 'approved', 'denied', 'expired', 'revoked'].map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`px-3 py-1.5 text-xs rounded-full transition-colors ${
              statusFilter === s
                ? 'bg-indigo-600 text-white'
                : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
            }`}
          >
            {s || 'All'}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <RefreshCw className="w-6 h-6 text-indigo-600 animate-spin" />
        </div>
      ) : requests.length === 0 ? (
        <div className="text-center py-12 text-gray-500 dark:text-gray-400">
          <ShieldPlus className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>No privilege elevation requests found</p>
        </div>
      ) : (
        <div className="space-y-3">
          {requests.map((req) => {
            const badge = STATUS_BADGES[req.status] || STATUS_BADGES.pending;
            const BadgeIcon = badge.icon;
            const isActive = req.status === 'active';
            const isPending = req.status === 'pending';
            const timeLeft = isActive && req.expiresAt
              ? Math.max(0, Math.round((new Date(req.expiresAt).getTime() - Date.now()) / 60000))
              : 0;

            return (
              <div key={req._id} className="bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-lg p-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-semibold text-gray-900 dark:text-gray-100">{req.requestedByUsername}</span>
                      <span className="text-gray-400 mx-1">→</span>
                      <span className="font-medium text-indigo-600 dark:text-indigo-400">{formatRole(req.targetRole)}</span>
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs ${badge.color}`}>
                        <BadgeIcon className="w-3 h-3" />{req.status}
                      </span>
                    </div>
                    <p className="text-sm text-gray-600 dark:text-gray-400">{req.reason}</p>
                    <div className="flex items-center gap-4 mt-2 text-xs text-gray-500 dark:text-gray-400">
                      <span>From: {formatRole(req.currentRole)}</span>
                      <span>Duration: {req.durationMinutes}min</span>
                      <span>Requested: {new Date(req.createdAt).toLocaleString()}</span>
                      {isActive && timeLeft > 0 && (
                        <span className="text-green-600 dark:text-green-400 font-medium">{timeLeft}min remaining</span>
                      )}
                    </div>
                    {req.approvedByUsername && (
                      <p className="text-xs text-green-600 dark:text-green-400 mt-1">Approved by: {req.approvedByUsername}</p>
                    )}
                    {req.denialReason && (
                      <p className="text-xs text-red-600 dark:text-red-400 mt-1">Denied: {req.denialReason}</p>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    {isPending && (
                      <>
                        <button
                          onClick={() => handleAction(req._id, 'approve')}
                          className="flex items-center gap-1 px-3 py-1.5 bg-green-600 text-white rounded-lg text-xs hover:bg-green-700"
                        >
                          <UserCheck className="w-3 h-3" /> Approve
                        </button>
                        {denyingId === req._id ? (
                          <div className="flex items-center gap-1">
                            <input
                              value={denyReason}
                              onChange={(e) => setDenyReason(e.target.value)}
                              placeholder="Reason..."
                              className="px-2 py-1 text-xs border rounded dark:bg-gray-700 dark:border-gray-600 dark:text-gray-200 w-40"
                            />
                            <button
                              onClick={() => handleAction(req._id, 'deny', denyReason)}
                              className="px-2 py-1 bg-red-600 text-white rounded text-xs hover:bg-red-700"
                            >
                              Confirm
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setDenyingId(req._id)}
                            className="flex items-center gap-1 px-3 py-1.5 bg-red-600 text-white rounded-lg text-xs hover:bg-red-700"
                          >
                            <XCircle className="w-3 h-3" /> Deny
                          </button>
                        )}
                      </>
                    )}
                    {isActive && (
                      <button
                        onClick={() => handleAction(req._id, 'revoke', 'Manually revoked by admin')}
                        className="flex items-center gap-1 px-3 py-1.5 bg-orange-600 text-white rounded-lg text-xs hover:bg-orange-700"
                      >
                        <Ban className="w-3 h-3" /> Revoke
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
