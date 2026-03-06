import { useState, useCallback } from 'react';
import {
  Key, Loader2, Check, AlertTriangle, Copy, CheckCheck, Info, Mail,
} from 'lucide-react';
import { usersAPI } from '../../../../services/api';
import type { User } from '../../../../types';
import AccessibleModal from './AccessibleModal';

// ── Types ────────────────────────────────────────────────────────────────────
interface ResetPasswordModalProps {
  isOpen: boolean;
  user: User;
  onClose: () => void;
  onSuccess: () => void;
}

type ModalPhase = 'confirm' | 'success-email' | 'success-manual';

// ── Component ────────────────────────────────────────────────────────────────
export default function ResetPasswordModal({ isOpen, user, onClose, onSuccess }: ResetPasswordModalProps) {
  const [phase, setPhase] = useState<ModalPhase>('confirm');
  const [loading, setLoading] = useState(false);
  const [tempPassword, setTempPassword] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── Reset on open ──────────────────────────────────────────────────────
  // We use key-based reset via parent so internal state resets automatically
  // but also handle via isOpen watching
  const resetState = useCallback(() => {
    setPhase('confirm');
    setLoading(false);
    setTempPassword(null);
    setCopied(false);
    setError(null);
  }, []);

  // Reset when modal opens
  if (!isOpen && phase !== 'confirm') {
    resetState();
  }

  // ── Handle reset ───────────────────────────────────────────────────────
  const handleReset = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const userId = String(user.id || (user as any)._id);
      const result = await usersAPI.resetPassword(userId);
      const emailSent = result.emailSent || false;
      const tempPw = result.temporaryPassword || null;
      setTempPassword(tempPw);
      setPhase(emailSent ? 'success-email' : 'success-manual');
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Failed to reset password. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [user]);

  // ── Copy to clipboard ─────────────────────────────────────────────────
  const handleCopy = useCallback(async () => {
    if (!tempPassword) return;
    try {
      await navigator.clipboard.writeText(tempPassword);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      /* fallback: already visible in read-only input */
    }
  }, [tempPassword]);

  // ── Close and notify ───────────────────────────────────────────────────
  const handleDone = useCallback(() => {
    onSuccess();
    onClose();
    resetState();
  }, [onSuccess, onClose, resetState]);

  // ── Footer based on phase ──────────────────────────────────────────────
  const renderFooter = () => {
    if (phase === 'confirm') {
      return (
        <>
          <button
            onClick={onClose}
            disabled={loading}
            className="px-4 py-2.5 text-sm font-medium border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleReset}
            disabled={loading}
            className="px-5 py-2.5 text-sm font-medium text-white bg-orange-600 hover:bg-orange-700 rounded-lg disabled:opacity-50 transition-all flex items-center gap-2 shadow-lg shadow-orange-500/20"
          >
            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
            {loading ? 'Resetting...' : 'Reset Password'}
          </button>
        </>
      );
    }
    return (
      <button
        onClick={handleDone}
        className="px-6 py-2.5 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors shadow-lg shadow-indigo-500/20"
      >
        Done
      </button>
    );
  };

  return (
    <AccessibleModal
      isOpen={isOpen}
      onClose={phase === 'confirm' && !loading ? onClose : () => {}}
      title="Reset Password"
      subtitle="Generate temporary credentials"
      icon={Key}
      iconBg="bg-orange-100 dark:bg-orange-900/30"
      size="md"
      footer={renderFooter()}
    >
      {/* ── Phase: Confirmation ───────────────────────────────────────── */}
      {phase === 'confirm' && (
        <div className="space-y-4">
          <p className="text-sm text-gray-700 dark:text-gray-300">
            Reset password for <strong className="text-gray-900 dark:text-gray-100">{user.username}</strong> ({user.firstName} {user.lastName})?
          </p>

          {/* User info card */}
          <div className="bg-gray-50 dark:bg-gray-900/50 rounded-lg p-3 space-y-1.5 text-sm border border-gray-200 dark:border-gray-700">
            <div className="flex justify-between">
              <span className="text-gray-500 dark:text-gray-400">Email</span>
              <span className="font-medium text-gray-900 dark:text-gray-100">{user.email}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500 dark:text-gray-400">Role</span>
              <span className="font-medium text-gray-900 dark:text-gray-100 capitalize">{user.role?.replace(/_/g, ' ')}</span>
            </div>
          </div>

          {/* Info notice */}
          <div className="flex items-start gap-2.5 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
            <Info className="w-4 h-4 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-blue-700 dark:text-blue-300">
              A temporary password will be generated and sent to <strong>{user.email}</strong>. The user must change it on first login.
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
      )}

      {/* ── Phase: Success via Email ───────────────────────────────────── */}
      {phase === 'success-email' && (
        <div className="space-y-4">
          <div className="flex items-start gap-3 p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-700 rounded-xl">
            <div className="w-8 h-8 bg-green-100 dark:bg-green-900/50 rounded-full flex items-center justify-center flex-shrink-0">
              <Check className="w-5 h-5 text-green-600 dark:text-green-400" />
            </div>
            <div>
              <p className="text-sm font-semibold text-green-800 dark:text-green-300">Password Reset Successfully</p>
              <p className="text-xs text-green-600 dark:text-green-400 mt-1">
                An email with the temporary password has been sent to <strong>{user.email}</strong>.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 p-3 bg-gray-50 dark:bg-gray-900/50 rounded-lg border border-gray-200 dark:border-gray-700">
            <Mail className="w-4 h-4 text-gray-500 dark:text-gray-400" />
            <p className="text-xs text-gray-600 dark:text-gray-400">
              The user will be prompted to change their password on next login.
            </p>
          </div>
        </div>
      )}

      {/* ── Phase: Manual (email failed) ──────────────────────────────── */}
      {phase === 'success-manual' && (
        <div className="space-y-4">
          <div className="flex items-start gap-3 p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-700 rounded-xl">
            <div className="w-8 h-8 bg-yellow-100 dark:bg-yellow-900/50 rounded-full flex items-center justify-center flex-shrink-0">
              <AlertTriangle className="w-5 h-5 text-yellow-600 dark:text-yellow-400" />
            </div>
            <div>
              <p className="text-sm font-semibold text-yellow-800 dark:text-yellow-300">Password Reset -- Email Delivery Failed</p>
              <p className="text-xs text-yellow-600 dark:text-yellow-400 mt-1">
                The password was reset but the email could not be sent. Share the temporary password manually.
              </p>
            </div>
          </div>

          {/* Temporary password display */}
          {tempPassword && (
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Temporary Password
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={tempPassword}
                  readOnly
                  className="flex-1 px-4 py-3 text-lg font-mono font-semibold bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-gray-100 select-all"
                />
                <button
                  onClick={handleCopy}
                  className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors flex items-center gap-2 flex-shrink-0"
                >
                  {copied ? (
                    <><CheckCheck className="w-4 h-4" /> Copied</>
                  ) : (
                    <><Copy className="w-4 h-4" /> Copy</>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* Security warning */}
          <div className="flex items-start gap-2.5 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
            <AlertTriangle className="w-4 h-4 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-red-700 dark:text-red-300">
              <strong>Security notice:</strong> Share this temporary password through a secure channel only. The user will be required to change it on first login.
            </p>
          </div>
        </div>
      )}
    </AccessibleModal>
  );
}
