/**
 * Security Policy Templates
 *
 * Predefined security policy presets: Strict, Standard, Relaxed.
 * Applies all settings at once with confirmation and diff preview.
 */
import React, { useState } from 'react';
import {
  ShieldAlert,
  Shield,
  ShieldOff,
  Check,
  ArrowRight,
  Loader2,
  Eye,
  X,
} from 'lucide-react';
import { systemAdminAPI } from '../../services/api';

/* ───────── Template Definitions ───────── */

export interface TemplateValues {
  session: {
    sessionTimeout: number;
    jwtExpiry: number;
    refreshTokenExpiry: number;
    maxLoginAttempts: number;
    lockoutDuration: number;
    allowMultipleSessions: boolean;
  };
  password: {
    minLength: number;
    requireUppercase: boolean;
    requireLowercase: boolean;
    requireNumbers: boolean;
    requireSpecialChars: boolean;
    historyCount: number;
    expirationDays: number;
    expirationWarningDays: number;
    expirationGraceDays: number;
    expirationExemptRoles: string[];
  };
  mfa: {
    globalEnabled: boolean;
    requiredRoles: string[];
    allowedMethods: string[];
  };
}

const TEMPLATES: {
  id: string;
  name: string;
  description: string;
  icon: React.ReactNode;
  color: string;
  borderColor: string;
  values: TemplateValues;
}[] = [
  {
    id: 'strict',
    name: 'Strict',
    description: 'Maximum security — short sessions, strong passwords, MFA for all admins, 30-day password expiry.',
    icon: <ShieldAlert className="w-5 h-5" />,
    color: 'text-red-600 dark:text-red-400',
    borderColor: 'border-red-300 dark:border-red-700',
    values: {
      session: { sessionTimeout: 15, jwtExpiry: 8, refreshTokenExpiry: 3, maxLoginAttempts: 3, lockoutDuration: 30, allowMultipleSessions: false },
      password: { minLength: 16, requireUppercase: true, requireLowercase: true, requireNumbers: true, requireSpecialChars: true, historyCount: 10, expirationDays: 30, expirationWarningDays: 7, expirationGraceDays: 2, expirationExemptRoles: [] },
      mfa: { globalEnabled: true, requiredRoles: ['super_admin', 'admin', 'manager', 'super_manager', 'boss'], allowedMethods: ['totp'] },
    },
  },
  {
    id: 'standard',
    name: 'Standard',
    description: 'Balanced security — reasonable defaults for most organizations.',
    icon: <Shield className="w-5 h-5" />,
    color: 'text-indigo-600 dark:text-indigo-400',
    borderColor: 'border-indigo-300 dark:border-indigo-700',
    values: {
      session: { sessionTimeout: 30, jwtExpiry: 24, refreshTokenExpiry: 7, maxLoginAttempts: 5, lockoutDuration: 15, allowMultipleSessions: true },
      password: { minLength: 12, requireUppercase: true, requireLowercase: true, requireNumbers: true, requireSpecialChars: true, historyCount: 5, expirationDays: 90, expirationWarningDays: 7, expirationGraceDays: 3, expirationExemptRoles: [] },
      mfa: { globalEnabled: true, requiredRoles: ['super_admin', 'admin'], allowedMethods: ['totp', 'email'] },
    },
  },
  {
    id: 'relaxed',
    name: 'Relaxed',
    description: 'Minimal friction — longer sessions, simpler passwords, MFA optional.',
    icon: <ShieldOff className="w-5 h-5" />,
    color: 'text-amber-600 dark:text-amber-400',
    borderColor: 'border-amber-300 dark:border-amber-700',
    values: {
      session: { sessionTimeout: 60, jwtExpiry: 48, refreshTokenExpiry: 14, maxLoginAttempts: 10, lockoutDuration: 5, allowMultipleSessions: true },
      password: { minLength: 8, requireUppercase: true, requireLowercase: true, requireNumbers: true, requireSpecialChars: false, historyCount: 3, expirationDays: 0, expirationWarningDays: 7, expirationGraceDays: 5, expirationExemptRoles: [] },
      mfa: { globalEnabled: false, requiredRoles: [], allowedMethods: ['totp', 'email'] },
    },
  },
];

/* ───────── Diff Helper ───────── */

interface DiffItem { field: string; current: string | number | boolean; template: string | number | boolean }

function computeDiff(
  current: { session: any; password: any; mfa: any },
  template: TemplateValues,
): DiffItem[] {
  const diffs: DiffItem[] = [];
  const check = (section: string, key: string, cur: any, tpl: any) => {
    const curStr = Array.isArray(cur) ? cur.join(', ') : String(cur);
    const tplStr = Array.isArray(tpl) ? tpl.join(', ') : String(tpl);
    if (curStr !== tplStr) diffs.push({ field: `${section}.${key}`, current: curStr, template: tplStr });
  };
  for (const key of Object.keys(template.session)) check('Session', key, current.session?.[key], (template.session as any)[key]);
  for (const key of Object.keys(template.password)) check('Password', key, current.password?.[key], (template.password as any)[key]);
  for (const key of Object.keys(template.mfa)) check('MFA', key, current.mfa?.[key], (template.mfa as any)[key]);
  return diffs;
}

/* ───────── Props ───────── */

interface Props {
  currentSession: any;
  currentPassword: any;
  currentMfa: any;
  onApplied: () => void;
  onMessage: (type: 'success' | 'error', message: string) => void;
}

/* ───────── Component ───────── */

export default function SecurityTemplates({ currentSession, currentPassword, currentMfa, onApplied, onMessage }: Props) {
  const [applying, setApplying] = useState<string | null>(null);
  const [previewId, setPreviewId] = useState<string | null>(null);

  const apply = async (tpl: typeof TEMPLATES[0]) => {
    if (!confirm(`Apply "${tpl.name}" template? This will overwrite your current session, password, and MFA settings.`)) return;
    setApplying(tpl.id);
    try {
      await Promise.all([
        systemAdminAPI.updateSecuritySettings('session', tpl.values.session),
        systemAdminAPI.updateSecuritySettings('password', tpl.values.password),
        systemAdminAPI.updateSecuritySettings('mfa', tpl.values.mfa),
      ]);
      onMessage('success', `"${tpl.name}" template applied. Settings are now active.`);
      onApplied();
    } catch (err: any) {
      onMessage('error', err.response?.data?.message || 'Failed to apply template');
    } finally {
      setApplying(null);
    }
  };

  const previewTemplate = previewId ? TEMPLATES.find(t => t.id === previewId) : null;
  const diffs = previewTemplate
    ? computeDiff({ session: currentSession, password: currentPassword, mfa: currentMfa }, previewTemplate.values)
    : [];

  return (
    <div className="bg-gradient-to-r from-indigo-50 via-white to-purple-50 dark:from-gray-800 dark:via-gray-800 dark:to-gray-800 border border-indigo-200/60 dark:border-gray-700 rounded-xl overflow-hidden">
      <div className="px-4 pt-4 pb-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-indigo-100 dark:bg-indigo-900/30 rounded-lg">
            <ShieldAlert className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200">Quick Apply — Security Templates</h3>
            <p className="text-[10px] text-gray-500 dark:text-gray-400">Apply a preset configuration to all security policies at once</p>
          </div>
        </div>
      </div>
      <div className="px-4 pb-4 grid grid-cols-1 md:grid-cols-3 gap-3">
        {TEMPLATES.map(tpl => (
          <div
            key={tpl.id}
            className={`relative p-4 rounded-xl border-2 ${tpl.borderColor} bg-white dark:bg-gray-700/40 hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200`}
          >
            <div className="flex items-center gap-2 mb-2">
              <div className={`p-1.5 rounded-lg ${tpl.id === 'strict' ? 'bg-red-100 dark:bg-red-900/30' : tpl.id === 'standard' ? 'bg-indigo-100 dark:bg-indigo-900/30' : 'bg-amber-100 dark:bg-amber-900/30'}`}>
                <span className={tpl.color}>{tpl.icon}</span>
              </div>
              <span className={`font-semibold ${tpl.color}`}>{tpl.name}</span>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-3 line-clamp-2">{tpl.description}</p>
            <div className="text-xs text-gray-500 dark:text-gray-400 space-y-0.5 mb-3">
              <div>Timeout: {tpl.values.session.sessionTimeout}m · PW: {tpl.values.password.minLength}+ chars</div>
              <div>MFA: {tpl.values.mfa.globalEnabled ? `${tpl.values.mfa.requiredRoles.length} roles` : 'Off'} · Expiry: {tpl.values.password.expirationDays || 'Never'}{tpl.values.password.expirationDays ? 'd' : ''}</div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setPreviewId(previewId === tpl.id ? null : tpl.id)}
                className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-gray-600 dark:text-gray-400 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors"
              >
                <Eye className="w-3 h-3" /> Compare
              </button>
              <button
                onClick={() => apply(tpl)}
                disabled={applying !== null}
                className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-lg transition-colors"
              >
                {applying === tpl.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <ArrowRight className="w-3 h-3" />}
                Apply
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Diff preview */}
      {previewTemplate && diffs.length > 0 && (
        <div className="mx-4 mb-4 p-3 bg-white/80 dark:bg-gray-700/50 rounded-lg border border-gray-200 dark:border-gray-600">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-gray-600 dark:text-gray-400">
              Changes if "{previewTemplate.name}" is applied ({diffs.length})
            </span>
            <button onClick={() => setPreviewId(null)} className="text-gray-400 hover:text-gray-600"><X className="w-3.5 h-3.5" /></button>
          </div>
          <div className="max-h-48 overflow-y-auto space-y-1">
            {diffs.map((d, i) => (
              <div key={i} className="flex items-center text-xs gap-2">
                <span className="text-gray-500 dark:text-gray-400 w-40 truncate font-mono">{d.field}</span>
                <span className="text-red-500 dark:text-red-400 line-through">{String(d.current)}</span>
                <ArrowRight className="w-3 h-3 text-gray-400 flex-shrink-0" />
                <span className="text-green-600 dark:text-green-400 font-medium">{String(d.template)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      {previewTemplate && diffs.length === 0 && (
        <div className="mx-4 mb-4 p-3 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800 text-xs text-green-700 dark:text-green-400 flex items-center gap-2">
          <Check className="w-4 h-4" /> Current settings already match the "{previewTemplate.name}" template.
        </div>
      )}
    </div>
  );
}
