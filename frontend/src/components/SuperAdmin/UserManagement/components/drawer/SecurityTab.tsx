import {
  Shield, ShieldCheck, ShieldOff, ShieldAlert,
  Smartphone, Mail, Key, Lock, AlertTriangle,
} from 'lucide-react';
import { format, parseISO, isValid } from 'date-fns';
import type { User } from '../../../../../types';
import type { MfaStatus } from '../../types';

interface SecurityTabProps {
  user: User;
  mfaStatus: MfaStatus | null;
  onAction: (action: string) => void;
}

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '--';
  const d = parseISO(dateStr);
  return isValid(d) ? format(d, 'MMM d, yyyy h:mm a') : '--';
}

function MfaMethodRow({ icon: Icon, label, enrolled, className }: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  enrolled: boolean;
  className?: string;
}) {
  return (
    <div className={`flex items-center justify-between py-2 ${className || ''}`}>
      <div className="flex items-center gap-2">
        <Icon className="w-4 h-4 text-gray-400" />
        <span className="text-sm text-gray-700 dark:text-gray-300">{label}</span>
      </div>
      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
        enrolled
          ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
          : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400'
      }`}>
        {enrolled ? 'Enrolled' : 'Not enrolled'}
      </span>
    </div>
  );
}

export default function SecurityTab({ user, mfaStatus, onAction }: SecurityTabProps) {
  const mfa = mfaStatus;

  return (
    <div className="space-y-6">
      {/* MFA Status */}
      <section>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
            Multi-Factor Authentication
          </h3>
          {mfa && (
            <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${
              mfa.enabled
                ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'
            }`}>
              {mfa.enabled ? <ShieldCheck className="w-3 h-3" /> : <ShieldOff className="w-3 h-3" />}
              {mfa.enabled ? 'Enabled' : 'Disabled'}
            </span>
          )}
        </div>

        {mfa ? (
          <div className="bg-gray-50 dark:bg-gray-900/50 rounded-lg p-3">
            <div className="divide-y divide-gray-200 dark:divide-gray-700">
              <MfaMethodRow icon={Smartphone} label="TOTP (Authenticator App)" enrolled={mfa.totpEnrolled} />
              <MfaMethodRow icon={Mail} label="Email Verification" enrolled={mfa.emailEnrolled} />
            </div>

            <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500 dark:text-gray-400">Mandatory</span>
                <span className={`font-medium ${mfa.isMandatory ? 'text-amber-600 dark:text-amber-400' : 'text-gray-900 dark:text-gray-100'}`}>
                  {mfa.isMandatory ? 'Yes' : 'No'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500 dark:text-gray-400">Exempt</span>
                <span className="font-medium text-gray-900 dark:text-gray-100">
                  {mfa.isExempt ? 'Yes' : 'No'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500 dark:text-gray-400">Last Verified</span>
                <span className="font-medium text-gray-900 dark:text-gray-100">
                  {formatDate(mfa.lastVerified)}
                </span>
              </div>
              {mfa.failedAttempts > 0 && (
                <div className="flex justify-between">
                  <span className="text-gray-500 dark:text-gray-400">Failed Attempts</span>
                  <span className="font-medium text-red-600 dark:text-red-400">
                    {mfa.failedAttempts}
                  </span>
                </div>
              )}
              {mfa.lockedUntil && (
                <div className="flex items-center gap-1.5 mt-1 p-2 bg-red-50 dark:bg-red-900/20 rounded text-red-700 dark:text-red-400 text-xs">
                  <Lock className="w-3.5 h-3.5" />
                  MFA locked until {formatDate(mfa.lockedUntil)}
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="bg-gray-50 dark:bg-gray-900/50 rounded-lg p-4 text-sm text-gray-500 dark:text-gray-400 text-center">
            MFA information not available
          </div>
        )}
      </section>

      {/* Password & Account Security */}
      <section>
        <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
          Password & Access
        </h3>
        <div className="bg-gray-50 dark:bg-gray-900/50 rounded-lg p-3 space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-500 dark:text-gray-400">Must Change Password</span>
            <span className={`font-medium ${user.mustChangePassword ? 'text-amber-600 dark:text-amber-400' : 'text-gray-900 dark:text-gray-100'}`}>
              {user.mustChangePassword ? 'Yes' : 'No'}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500 dark:text-gray-400">Failed Login Attempts</span>
            <span className={`font-medium ${(user.failedLoginAttempts || 0) > 3 ? 'text-red-600 dark:text-red-400' : 'text-gray-900 dark:text-gray-100'}`}>
              {user.failedLoginAttempts || 0}
            </span>
          </div>
          {user.lockedUntil && (
            <div className="flex items-center gap-1.5 p-2 bg-amber-50 dark:bg-amber-900/20 rounded text-amber-700 dark:text-amber-400 text-xs">
              <AlertTriangle className="w-3.5 h-3.5" />
              Account locked until {formatDate(user.lockedUntil)}
            </div>
          )}
        </div>
      </section>

      {/* Security Actions */}
      <section>
        <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
          Quick Actions
        </h3>
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => onAction('reset_password')}
            className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-gray-900/50 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          >
            <Key className="w-4 h-4 text-orange-500" />
            Reset Password
          </button>
          <button
            onClick={() => onAction('force_logout')}
            className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-gray-900/50 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          >
            <ShieldAlert className="w-4 h-4 text-yellow-500" />
            Force Logout
          </button>
          {user.isBanned ? (
            <button
              onClick={() => onAction('unban')}
              className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg hover:bg-green-100 dark:hover:bg-green-900/30 transition-colors"
            >
              <Shield className="w-4 h-4" />
              Unban User
            </button>
          ) : (
            <button
              onClick={() => onAction('ban')}
              className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors"
            >
              <ShieldAlert className="w-4 h-4" />
              Ban User
            </button>
          )}
          <button
            onClick={() => onAction('toggle_status')}
            className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-gray-900/50 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          >
            {user.isActive ? <ShieldOff className="w-4 h-4 text-gray-500" /> : <ShieldCheck className="w-4 h-4 text-green-500" />}
            {user.isActive ? 'Deactivate' : 'Activate'}
          </button>
        </div>
      </section>
    </div>
  );
}
