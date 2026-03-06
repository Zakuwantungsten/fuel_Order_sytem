import { useState, useCallback, useEffect } from 'react';
import {
  Ban, Loader2, AlertTriangle,
} from 'lucide-react';
import { usersAPI } from '../../../../services/api';
import type { User } from '../../../../types';
import AccessibleModal from './AccessibleModal';

// ── Types ────────────────────────────────────────────────────────────────────
interface BanUserModalProps {
  isOpen: boolean;
  user: User;
  onClose: () => void;
  onSuccess: () => void;
}

// ── Component ────────────────────────────────────────────────────────────────
export default function BanUserModal({ isOpen, user, onClose, onSuccess }: BanUserModalProps) {
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset on open
  useEffect(() => {
    if (isOpen) {
      setReason('');
      setError(null);
      setLoading(false);
    }
  }, [isOpen]);

  const handleBan = useCallback(async () => {
    if (!reason.trim()) {
      setError('A reason is required when banning a user.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const userId = String(user.id || (user as any)._id);
      await usersAPI.ban(userId, reason.trim());
      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Failed to ban user. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [user, reason, onSuccess, onClose]);

  return (
    <AccessibleModal
      isOpen={isOpen}
      onClose={loading ? () => {} : onClose}
      title="Ban User"
      subtitle="Prevent system access"
      icon={Ban}
      iconBg="bg-red-100 dark:bg-red-900/30"
      size="md"
      footer={
        <>
          <button
            onClick={onClose}
            disabled={loading}
            className="px-4 py-2.5 text-sm font-medium border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleBan}
            disabled={loading || !reason.trim()}
            className="px-5 py-2.5 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg disabled:opacity-50 transition-all flex items-center gap-2 shadow-lg shadow-red-500/20"
          >
            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
            {loading ? 'Banning...' : 'Ban User'}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        {/* Warning */}
        <div className="flex items-start gap-3 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded-xl">
          <AlertTriangle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-red-800 dark:text-red-300">
              Ban <strong>{user.username}</strong> ({user.firstName} {user.lastName})?
            </p>
            <p className="text-xs text-red-600 dark:text-red-400 mt-1">
              The user will be immediately logged out and unable to access the system until unbanned.
            </p>
          </div>
        </div>

        {/* User info */}
        <div className="bg-gray-50 dark:bg-gray-900/50 rounded-lg p-3 space-y-1.5 text-sm border border-gray-200 dark:border-gray-700">
          <div className="flex justify-between">
            <span className="text-gray-500 dark:text-gray-400">Username</span>
            <span className="font-medium text-gray-900 dark:text-gray-100">{user.username}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500 dark:text-gray-400">Email</span>
            <span className="font-medium text-gray-900 dark:text-gray-100">{user.email}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500 dark:text-gray-400">Role</span>
            <span className="font-medium text-gray-900 dark:text-gray-100 capitalize">{user.role?.replace(/_/g, ' ')}</span>
          </div>
        </div>

        {/* Reason textarea */}
        <div>
          <label htmlFor="ban-reason" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
            Reason for Ban <span className="text-red-500">*</span>
          </label>
          <textarea
            id="ban-reason"
            value={reason}
            onChange={e => { setReason(e.target.value); setError(null); }}
            rows={3}
            placeholder="Provide a reason for banning this user..."
            disabled={loading}
            className="w-full px-4 py-2.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-red-500 focus:outline-none focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 transition-colors resize-none disabled:opacity-50"
          />
          <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
            This reason will be visible to other administrators.
          </p>
        </div>

        {/* Error */}
        {error && (
          <div className="flex items-start gap-2.5 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded-lg">
            <AlertTriangle className="w-4 h-4 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-red-700 dark:text-red-300">{error}</p>
          </div>
        )}
      </div>
    </AccessibleModal>
  );
}
