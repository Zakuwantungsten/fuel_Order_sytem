import { useState, useCallback } from 'react';
import {
  Key, Loader2, Check, AlertTriangle, Copy, CheckCheck, Info, Mail,
  Link2, KeyRound, Lock, Eye, EyeOff, AlertCircle,
} from 'lucide-react';
import { usersAPI } from '../../../../services/api';
import type { User } from '../../../../types';
import AccessibleModal from './AccessibleModal';

type ProvisioningMethod = 'temp_password' | 'email_link' | 'manual';
type ModalPhase = 'confirm' | 'success';

interface ResetPasswordModalProps {
  isOpen: boolean;
  user: User;
  onClose: () => void;
  onSuccess: () => void;
}

export default function ResetPasswordModal({ isOpen, user, onClose, onSuccess }: ResetPasswordModalProps) {
  const [phase, setPhase] = useState<ModalPhase>('confirm');
  const [provisioningMethod, setProvisioningMethod] = useState<ProvisioningMethod>('temp_password');
  const [customPassword, setCustomPassword] = useState('');
  const [showCustomPw, setShowCustomPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [resultEmailSent, setResultEmailSent] = useState(false);
  const [resultMethod, setResultMethod] = useState<ProvisioningMethod>('temp_password');
  const [tempPassword, setTempPassword] = useState<string | null>(null);
  const [copiedPw, setCopiedPw] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const resetState = useCallback(() => {
    setPhase('confirm');
    setProvisioningMethod('temp_password');
    setCustomPassword('');
    setShowCustomPw(false);
    setLoading(false);
    setResultEmailSent(false);
    setTempPassword(null);
    setCopiedPw(false);
    setError(null);
  }, []);

  if (!isOpen && phase !== 'confirm') resetState();

  const customPasswordError =
    provisioningMethod === 'manual' && customPassword.length > 0 && customPassword.length < 4
      ? 'Minimum 4 characters'
      : null;

  const canSubmit =
    provisioningMethod !== 'manual' || customPassword.length >= 4;

  const handleReset = useCallback(async () => {
    if (!canSubmit) return;
    setLoading(true);
    setError(null);
    try {
      const userId = String(user.id || (user as any)._id);
      const result = await usersAPI.resetPassword(userId, {
        provisioningMethod,
        ...(provisioningMethod === 'manual' ? { customPassword } : {}),
      });
      setResultEmailSent(result.emailSent);
      setResultMethod(provisioningMethod);
      setTempPassword(result.temporaryPassword || null);
      setPhase('success');
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Failed to reset password. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [user, provisioningMethod, customPassword, canSubmit]);

  const handleCopy = useCallback(async (text: string, setter: (v: boolean) => void) => {
    try {
      await navigator.clipboard.writeText(text);
      setter(true);
      setTimeout(() => setter(false), 2500);
    } catch { /* ignore */ }
  }, []);

  const handleDone = useCallback(() => {
    onSuccess();
    onClose();
    resetState();
  }, [onSuccess, onClose, resetState]);

  const renderFooter = () => {
    if (phase === 'confirm') {
      return (
        <>
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="px-4 py-2.5 text-sm font-medium border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleReset}
            disabled={loading || !canSubmit}
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
        type="button"
        onClick={handleDone}
        className="px-6 py-2.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors shadow-lg shadow-indigo-500/20"
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
      subtitle={
        phase === 'confirm'
          ? provisioningMethod === 'email_link' ? 'Send an activation link'
          : provisioningMethod === 'manual' ? 'Set a password manually'
          : 'Generate temporary credentials'
          : 'Password reset complete'
      }
      icon={Key}
      iconBg="bg-orange-100 dark:bg-orange-900/30"
      size="md"
      footer={renderFooter()}
    >
      {/* ── Confirm phase ─────────────────────────────────────────────────── */}
      {phase === 'confirm' && (
        <div className="space-y-4">
          {/* User info */}
          <p className="text-sm text-gray-700 dark:text-gray-300">
            Reset credentials for{' '}
            <strong className="text-gray-900 dark:text-gray-100">{user.username}</strong>{' '}
            ({user.firstName} {user.lastName})?
          </p>

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

          {/* Method selector */}
          <div className="space-y-2">
            <p className="text-sm font-medium text-gray-700 dark:text-gray-300">How should the user receive their new credentials?</p>

            {([
              {
                value: 'temp_password' as const,
                icon: <Info className="w-4 h-4" />,
                label: 'Send temporary password',
                desc: 'Auto-generate a password and email it. User must change it on first login.',
              },
              {
                value: 'email_link' as const,
                icon: <Link2 className="w-4 h-4" />,
                label: 'Send activation link',
                desc: 'Email a one-time link. User clicks it and sets their own password — no temp password needed.',
              },
              {
                value: 'manual' as const,
                icon: <Lock className="w-4 h-4" />,
                label: 'Set password manually',
                desc: 'Type a short password and give it in person. User must change it on first login.',
              },
            ] as const).map(opt => (
              <label
                key={opt.value}
                className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                  provisioningMethod === opt.value
                    ? 'border-orange-400 bg-orange-50 dark:bg-orange-900/20 dark:border-orange-400'
                    : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                }`}
              >
                <input
                  type="radio"
                  name="resetProvisioningMethod"
                  value={opt.value}
                  checked={provisioningMethod === opt.value}
                  onChange={() => { setProvisioningMethod(opt.value); setCustomPassword(''); setError(null); }}
                  className="mt-0.5 accent-orange-500"
                />
                <span className={`mt-0.5 flex-shrink-0 ${provisioningMethod === opt.value ? 'text-orange-600 dark:text-orange-400' : 'text-gray-400'}`}>
                  {opt.icon}
                </span>
                <div>
                  <p className={`text-sm font-medium ${provisioningMethod === opt.value ? 'text-orange-800 dark:text-orange-300' : 'text-gray-700 dark:text-gray-300'}`}>
                    {opt.label}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 leading-relaxed">{opt.desc}</p>
                </div>
              </label>
            ))}
          </div>

          {/* Manual password input */}
          {provisioningMethod === 'manual' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                New Password <span className="text-red-500">*</span>
                <span className="text-xs text-gray-400 font-normal ml-1">(min 4 characters)</span>
              </label>
              <div className="relative">
                <input
                  type={showCustomPw ? 'text' : 'password'}
                  value={customPassword}
                  onChange={e => { setCustomPassword(e.target.value); setError(null); }}
                  placeholder="e.g. 1234 or Admin@123"
                  autoComplete="new-password"
                  className={`w-full px-4 py-2.5 pr-10 text-sm border rounded-lg transition-colors focus:ring-2 focus:outline-none
                    ${customPasswordError
                      ? 'border-red-300 dark:border-red-600 focus:ring-red-500 bg-red-50/50 dark:bg-red-900/10'
                      : 'border-gray-300 dark:border-gray-600 focus:ring-orange-400 focus:border-transparent bg-white dark:bg-gray-700'
                    }
                    text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500`}
                />
                <button
                  type="button"
                  onClick={() => setShowCustomPw(p => !p)}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                >
                  {showCustomPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {customPasswordError && (
                <p className="mt-1 text-xs text-red-600 dark:text-red-400 flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" /> {customPasswordError}
                </p>
              )}
              <p className="mt-1.5 text-xs text-amber-600 dark:text-amber-400">
                Treated as temporary — the user must change it on first login.
              </p>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="flex items-start gap-2.5 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded-lg">
              <AlertTriangle className="w-4 h-4 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-red-700 dark:text-red-300">{error}</p>
            </div>
          )}
        </div>
      )}

      {/* ── Success phase ──────────────────────────────────────────────────── */}
      {phase === 'success' && (
        <div className="space-y-4">

          {/* Activation link sent */}
          {resultMethod === 'email_link' && resultEmailSent && (
            <div className="flex items-start gap-3 p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-700 rounded-xl">
              <div className="w-8 h-8 bg-green-100 dark:bg-green-900/50 rounded-full flex items-center justify-center flex-shrink-0">
                <Link2 className="w-5 h-5 text-green-600 dark:text-green-400" />
              </div>
              <div>
                <p className="text-sm font-semibold text-green-800 dark:text-green-300">Password reset — activation link sent!</p>
                <p className="text-xs text-green-600 dark:text-green-400 mt-1">
                  An email with a one-time activation link has been sent to <strong>{user.email}</strong>.
                </p>
              </div>
            </div>
          )}

          {/* Activation link email failed */}
          {resultMethod === 'email_link' && !resultEmailSent && (
            <div className="flex items-start gap-3 p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-xl">
              <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">Password reset — activation email failed</p>
                <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                  Check email configuration, then resend the link from the user detail page.
                </p>
              </div>
            </div>
          )}

          {/* Temp password emailed */}
          {resultMethod === 'temp_password' && resultEmailSent && (
            <div className="flex items-start gap-3 p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-700 rounded-xl">
              <div className="w-8 h-8 bg-green-100 dark:bg-green-900/50 rounded-full flex items-center justify-center flex-shrink-0">
                <Check className="w-5 h-5 text-green-600 dark:text-green-400" />
              </div>
              <div>
                <p className="text-sm font-semibold text-green-800 dark:text-green-300">Password Reset Successfully</p>
                <p className="text-xs text-green-600 dark:text-green-400 mt-1">
                  A temporary password has been sent to <strong>{user.email}</strong>. The user must change it on next login.
                </p>
              </div>
            </div>
          )}

          {/* Temp password email failed — show to copy */}
          {resultMethod === 'temp_password' && !resultEmailSent && tempPassword && (
            <div className="space-y-3">
              <div className="flex items-start gap-3 p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-700 rounded-xl">
                <AlertTriangle className="w-5 h-5 text-yellow-600 dark:text-yellow-400 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-yellow-800 dark:text-yellow-300">Password Reset — Email Delivery Failed</p>
                  <p className="text-xs text-yellow-600 dark:text-yellow-400 mt-1">
                    Share this temporary password through a secure channel.
                  </p>
                </div>
              </div>
              <PasswordCopyBox password={tempPassword} copied={copiedPw} onCopy={() => handleCopy(tempPassword, setCopiedPw)} />
            </div>
          )}

          {/* Manual — always show to copy */}
          {resultMethod === 'manual' && tempPassword && (
            <div className="space-y-3">
              <div className="flex items-start gap-3 p-4 bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-700 rounded-xl">
                <div className="w-8 h-8 bg-indigo-100 dark:bg-indigo-900/50 rounded-full flex items-center justify-center flex-shrink-0">
                  <KeyRound className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-indigo-800 dark:text-indigo-300">Password Reset — Share Manually</p>
                  <p className="text-xs text-indigo-600 dark:text-indigo-400 mt-1">
                    Copy and deliver this password to <strong>{user.firstName}</strong> in person or via a secure channel.
                  </p>
                </div>
              </div>
              <PasswordCopyBox password={tempPassword} copied={copiedPw} onCopy={() => handleCopy(tempPassword, setCopiedPw)} />
            </div>
          )}

          <div className="flex items-center gap-2 p-3 bg-gray-50 dark:bg-gray-900/50 rounded-lg border border-gray-200 dark:border-gray-700">
            <Mail className="w-4 h-4 text-gray-500 dark:text-gray-400 flex-shrink-0" />
            <p className="text-xs text-gray-600 dark:text-gray-400">
              The user has been logged out. They must{' '}
              {resultMethod === 'email_link' ? 'click the activation link' : 'log in with the new password'}{' '}
              and set a personal password to continue.
            </p>
          </div>
        </div>
      )}
    </AccessibleModal>
  );
}

// ── Password copy box ─────────────────────────────────────────────────────────
function PasswordCopyBox({ password, copied, onCopy }: { password: string; copied: boolean; onCopy: () => void }) {
  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
        Temporary Password
      </label>
      <div className="flex gap-2">
        <input
          type="text"
          value={password}
          readOnly
          className="flex-1 px-4 py-3 text-lg font-mono font-semibold bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-gray-100 select-all"
        />
        <button
          type="button"
          onClick={onCopy}
          className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors flex items-center gap-2 flex-shrink-0"
        >
          {copied ? (
            <><CheckCheck className="w-4 h-4" /> Copied</>
          ) : (
            <><Copy className="w-4 h-4" /> Copy</>
          )}
        </button>
      </div>
      <p className="text-xs text-amber-600 dark:text-amber-400">
        The user must change this password on first login.
      </p>
    </div>
  );
}
