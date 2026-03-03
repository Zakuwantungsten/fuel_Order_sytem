import React, { useState, useEffect, useCallback } from 'react';
import {
  Monitor,
  Smartphone,
  Tablet,
  Globe,
  LogOut,
  Shield,
  Clock,
  AlertTriangle,
  RefreshCw,
  CheckCircle,
} from 'lucide-react';
import apiClient from '../services/api';

interface Session {
  _id: string;
  browser: string;
  os: string;
  deviceType: string;
  ipAddress: string;
  loginAt: string;
  lastActiveAt: string;
  isCurrent: boolean;
  isNewDevice: boolean;
  mfaMethod?: string;
}

interface DevicesSessionsPanelProps {
  onClose?: () => void;
}

const DeviceIcon: React.FC<{ type: string; className?: string }> = ({ type, className = 'w-5 h-5' }) => {
  switch (type) {
    case 'mobile': return <Smartphone className={className} />;
    case 'tablet': return <Tablet className={className} />;
    default: return <Monitor className={className} />;
  }
};

const DevicesSessionsPanel: React.FC<DevicesSessionsPanelProps> = ({ onClose }) => {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [revoking, setRevoking] = useState<string | null>(null);
  const [revokingAll, setRevokingAll] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const fetchSessions = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await apiClient.get('/mfa/login-activity');
      const data = response.data;
      if (!data.success) {
        throw new Error(data.message || 'Failed to load sessions');
      }
      setSessions(data.data.activities || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  const revokeSession = async (sessionId: string) => {
    setRevoking(sessionId);
    setError('');
    setSuccess('');
    try {
      const response = await apiClient.delete(`/mfa/sessions/${sessionId}`);
      const data = response.data;
      if (!data.success) {
        throw new Error(data.message || 'Failed to revoke session');
      }
      setSuccess('Session signed out successfully');
      setSessions(prev => prev.filter(s => s._id !== sessionId));
    } catch (err: any) {
      setError(err.message);
    } finally {
      setRevoking(null);
    }
  };

  const revokeAllOthers = async () => {
    setRevokingAll(true);
    setError('');
    setSuccess('');
    try {
      const response = await apiClient.post('/mfa/sessions/revoke-all');
      const data = response.data;
      if (!data.success) {
        throw new Error(data.message || 'Failed to revoke sessions');
      }
      setSuccess(`Signed out of ${data.data.revokedCount} other session(s)`);
      setSessions(prev => prev.filter(s => s.isCurrent));
    } catch (err: any) {
      setError(err.message);
    } finally {
      setRevokingAll(false);
    }
  };

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  const otherSessions = sessions.filter(s => !s.isCurrent);

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700">
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
              <Shield className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                Your Devices & Sessions
              </h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Manage where you're signed in
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={fetchSessions}
              disabled={loading}
              className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
              title="Refresh"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            {onClose && (
              <button
                onClick={onClose}
                className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
              >
                ✕
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Alerts */}
      {error && (
        <div className="mx-6 mt-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded-lg flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0" />
          <span className="text-sm text-red-700 dark:text-red-300">{error}</span>
        </div>
      )}
      {success && (
        <div className="mx-6 mt-4 p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-700 rounded-lg flex items-center gap-2">
          <CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0" />
          <span className="text-sm text-green-700 dark:text-green-300">{success}</span>
        </div>
      )}

      {/* Content */}
      <div className="p-6">
        {loading && sessions.length === 0 ? (
          <div className="flex items-center justify-center py-12">
            <RefreshCw className="w-6 h-6 animate-spin text-gray-400" />
            <span className="ml-2 text-gray-500 dark:text-gray-400">Loading sessions...</span>
          </div>
        ) : sessions.length === 0 ? (
          <div className="text-center py-12 text-gray-500 dark:text-gray-400">
            <Globe className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p>No active sessions found</p>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Current Session */}
            {sessions.filter(s => s.isCurrent).map(session => (
              <div key={session._id} className="relative">
                <div className="absolute -left-2 top-0 bottom-0 w-1 bg-green-500 rounded-full" />
                <div className="pl-4">
                  <div className="flex items-center gap-1.5 mb-2">
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300">
                      This device
                    </span>
                    {session.isNewDevice && (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300">
                        New device
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 bg-green-50 dark:bg-green-900/20 rounded-xl">
                      <DeviceIcon type={session.deviceType} className="w-6 h-6 text-green-600 dark:text-green-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-gray-900 dark:text-white">
                        {session.browser} on {session.os}
                      </p>
                      <div className="flex items-center gap-3 text-sm text-gray-500 dark:text-gray-400">
                        <span className="flex items-center gap-1">
                          <Globe className="w-3.5 h-3.5" />
                          {session.ipAddress}
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="w-3.5 h-3.5" />
                          Active now
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))}

            {/* Other Sessions */}
            {otherSessions.length > 0 && (
              <>
                <div className="flex items-center justify-between pt-2">
                  <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                    Other Sessions ({otherSessions.length})
                  </h3>
                  <button
                    onClick={revokeAllOthers}
                    disabled={revokingAll}
                    className="text-sm text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 font-medium flex items-center gap-1 disabled:opacity-50"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    {revokingAll ? 'Signing out...' : 'Sign out all others'}
                  </button>
                </div>

                <div className="space-y-3">
                  {otherSessions.map(session => (
                    <div
                      key={session._id}
                      className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-750 dark:bg-gray-700/50 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                    >
                      <div className="p-2 bg-gray-200 dark:bg-gray-600 rounded-lg">
                        <DeviceIcon type={session.deviceType} className="w-5 h-5 text-gray-600 dark:text-gray-300" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <p className="font-medium text-gray-900 dark:text-white text-sm">
                            {session.browser} on {session.os}
                          </p>
                          {session.isNewDevice && (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300">
                              New
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
                          <span>{session.ipAddress}</span>
                          <span>{formatTime(session.loginAt)}</span>
                          {session.mfaMethod && (
                            <span className="text-blue-500">MFA: {session.mfaMethod}</span>
                          )}
                        </div>
                      </div>
                      <button
                        onClick={() => revokeSession(session._id)}
                        disabled={revoking === session._id}
                        className="px-3 py-1.5 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors disabled:opacity-50 flex items-center gap-1"
                      >
                        <LogOut className="w-3.5 h-3.5" />
                        {revoking === session._id ? '...' : 'Sign out'}
                      </button>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* Footer info */}
      <div className="px-6 py-3 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-750 dark:bg-gray-800/50 rounded-b-xl">
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Sessions older than 90 days are automatically removed. If you see a session you don't recognize, sign it out and change your password immediately.
        </p>
      </div>
    </div>
  );
};

export default DevicesSessionsPanel;
