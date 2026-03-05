import { useState, useEffect, useCallback } from 'react';
import {
  Lock, Key, Fingerprint, ShieldBan, Mail, Save,
  Loader2, AlertTriangle, Send, CheckCircle, XCircle,
  Plus, Trash2, ToggleLeft, ToggleRight, RefreshCw,
  ChevronDown, ChevronRight, X, Shield, Bell,
} from 'lucide-react';
import { systemAdminAPI } from '../../services/api';
import { subscribeToSecurityEvents, unsubscribeFromSecurityEvents } from '../../services/websocket';

/* ───────── Types ───────── */

interface DLPRule {
  _id: string;
  name: string;
  description: string;
  isActive: boolean;
  ruleType: string;
  maxRecords?: number;
  appliesTo: string[];
  action: string;
  triggerCount: number;
  lastTriggeredAt?: string;
  createdAt: string;
}

interface DLPStats {
  totalRules: number;
  activeRules: number;
  totalTriggers: number;
  rulesByType: Record<string, number>;
}

interface Props {
  onMessage: (type: 'success' | 'error', message: string) => void;
}

/* ───────── Constants ───────── */

const DEFAULT_SESSION = { sessionTimeout: 30, jwtExpiry: 24, refreshTokenExpiry: 7, maxLoginAttempts: 5, lockoutDuration: 15, allowMultipleSessions: true };
const DEFAULT_PASSWORD = { minLength: 12, requireUppercase: true, requireLowercase: true, requireNumbers: true, requireSpecialChars: true, historyCount: 5 };
const DEFAULT_MFA = { globalEnabled: false, requiredRoles: [] as string[], allowedMethods: ['totp', 'email'] as string[], roleMethodOverrides: {} as Record<string, string[]> };
const DEFAULT_NOTIFICATIONS = { loginNotifications: true, newDeviceAlerts: true, deviceTracking: true };

const ALL_ROLES = [
  { value: 'super_admin', label: 'Super Admin' }, { value: 'admin', label: 'Admin' },
  { value: 'manager', label: 'Manager' }, { value: 'super_manager', label: 'Super Manager' },
  { value: 'supervisor', label: 'Supervisor' }, { value: 'clerk', label: 'Clerk' },
  { value: 'driver', label: 'Driver' }, { value: 'viewer', label: 'Viewer' },
  { value: 'fuel_order_maker', label: 'Fuel Order Maker' }, { value: 'boss', label: 'Boss' },
  { value: 'yard_personnel', label: 'Yard Personnel' }, { value: 'fuel_attendant', label: 'Fuel Attendant' },
  { value: 'station_manager', label: 'Station Manager' }, { value: 'payment_manager', label: 'Payment Manager' },
  { value: 'dar_yard', label: 'Dar Yard' }, { value: 'tanga_yard', label: 'Tanga Yard' },
  { value: 'mmsa_yard', label: 'MMSA Yard' }, { value: 'import_officer', label: 'Import Officer' },
  { value: 'export_officer', label: 'Export Officer' },
];

const RULE_TYPES: Record<string, string> = {
  export_limit: 'Export Limit', field_restriction: 'Field Restriction',
  time_restriction: 'Time Restriction', role_restriction: 'Role Restriction',
};

const DATA_TYPES = ['fuel_records', 'delivery_orders', 'lpo_entries', 'users', 'audit_logs', 'yard_fuel'];

/* ───────── Component ───────── */

export default function SecurityPoliciesSubTab({ onMessage }: Props) {
  /* Security settings */
  const [loading, setLoading] = useState(true);
  const [savingSession, setSavingSession] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [savingMFA, setSavingMFA] = useState(false);
  const [savingNotifications, setSavingNotifications] = useState(false);
  const [sessionSettings, setSessionSettings] = useState(DEFAULT_SESSION);
  const [passwordPolicy, setPasswordPolicy] = useState(DEFAULT_PASSWORD);
  const [mfaSettings, setMfaSettings] = useState(DEFAULT_MFA);
  const [notifSettings, setNotifSettings] = useState(DEFAULT_NOTIFICATIONS);

  /* Email */
  const [emailStatus, setEmailStatus] = useState<'unknown' | 'connected' | 'disconnected'>('unknown');
  const [testingEmail, setTestingEmail] = useState(false);
  const [sendingTest, setSendingTest] = useState(false);

  /* DLP */
  const [dlpRules, setDlpRules] = useState<DLPRule[]>([]);
  const [dlpStats, setDlpStats] = useState<DLPStats | null>(null);
  const [loadingDLP, setLoadingDLP] = useState(true);
  const [showDLPCreate, setShowDLPCreate] = useState(false);
  const [dlpForm, setDlpForm] = useState({
    name: '', description: '', ruleType: 'export_limit', maxRecords: 500,
    appliesTo: ['fuel_records'] as string[], action: 'block',
  });

  /* Messages & UI */
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set(['session', 'password']));

  const toggle = (s: string) => setExpanded(prev => {
    const next = new Set(prev);
    next.has(s) ? next.delete(s) : next.add(s);
    return next;
  });

  const authHeaders = () => {
    const h: Record<string, string> = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${sessionStorage.getItem('fuel_order_token')}`,
    };
    const match = decodeURIComponent(document.cookie).split(';').map(c => c.trim()).find(c => c.startsWith('XSRF-TOKEN='));
    if (match) h['X-XSRF-TOKEN'] = match.substring('XSRF-TOKEN='.length);
    return h;
  };

  /* ── Load security settings ── */
  const applySettings = useCallback((data: { session?: any; password?: any; mfa?: any; notifications?: any }) => {
    if (data.session) setSessionSettings(prev => ({ ...prev, ...data.session }));
    if (data.password) setPasswordPolicy(prev => ({ ...prev, ...data.password }));
    if (data.mfa) setMfaSettings(prev => ({ ...prev, ...data.mfa }));
    if (data.notifications) setNotifSettings(prev => ({ ...prev, ...data.notifications }));
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        applySettings(await systemAdminAPI.getSecuritySettings());
      } catch (err: any) {
        onMessage('error', err.response?.data?.message || 'Failed to load security settings');
      } finally { setLoading(false); }
    })();
    subscribeToSecurityEvents(event => applySettings(event));
    return () => unsubscribeFromSecurityEvents();
  }, []);

  /* ── Load DLP ── */
  const loadDLP = async () => {
    setLoadingDLP(true);
    try {
      const [rulesRes, statsRes] = await Promise.all([
        fetch('/api/v1/system-admin/dlp', { headers: authHeaders() }),
        fetch('/api/v1/system-admin/dlp/stats', { headers: authHeaders() }),
      ]);
      const rulesJson = await rulesRes.json();
      const statsJson = await statsRes.json();
      if (rulesJson.success) setDlpRules(rulesJson.data);
      if (statsJson.success) setDlpStats(statsJson.data);
    } catch (err: any) { setError(err.message); }
    finally { setLoadingDLP(false); }
  };

  useEffect(() => { loadDLP(); }, []);
  useEffect(() => { if (success) { const t = setTimeout(() => setSuccess(null), 3000); return () => clearTimeout(t); } }, [success]);

  /* ── Save functions ── */
  const saveSession = async () => {
    setSavingSession(true);
    try {
      await systemAdminAPI.updateSecuritySettings('session', sessionSettings);
      onMessage('success', 'Session settings saved. Changes apply to new sessions.');
    } catch (err: any) { onMessage('error', err.response?.data?.message || 'Failed'); }
    finally { setSavingSession(false); }
  };

  const savePassword = async () => {
    setSavingPassword(true);
    try {
      await systemAdminAPI.updateSecuritySettings('password', passwordPolicy);
      onMessage('success', 'Password policy saved');
    } catch (err: any) { onMessage('error', err.response?.data?.message || 'Failed'); }
    finally { setSavingPassword(false); }
  };

  const saveMFA = async () => {
    setSavingMFA(true);
    try {
      await systemAdminAPI.updateSecuritySettings('mfa', mfaSettings);
      onMessage('success', 'MFA settings saved');
    } catch (err: any) { onMessage('error', err.response?.data?.message || 'Failed'); }
    finally { setSavingMFA(false); }
  };

  const saveNotifications = async () => {
    setSavingNotifications(true);
    try {
      await systemAdminAPI.updateSecuritySettings('notifications', notifSettings);
      onMessage('success', 'Login security settings saved');
    } catch (err: any) { onMessage('error', err.response?.data?.message || 'Failed'); }
    finally { setSavingNotifications(false); }
  };

  const toggleMFARole = (role: string) => {
    setMfaSettings(prev => ({
      ...prev,
      requiredRoles: prev.requiredRoles.includes(role) ? prev.requiredRoles.filter(r => r !== role) : [...prev.requiredRoles, role],
    }));
  };

  const toggleMFAMethod = (method: string) => {
    setMfaSettings(prev => {
      const methods = prev.allowedMethods.includes(method)
        ? prev.allowedMethods.filter(m => m !== method)
        : [...prev.allowedMethods, method];
      if (methods.length === 0) return prev;
      return { ...prev, allowedMethods: methods };
    });
  };

  const toggleRoleMethodOverride = (role: string, method: string) => {
    setMfaSettings(prev => {
      const overrides = { ...prev.roleMethodOverrides };
      const current = overrides[role] ?? [...prev.allowedMethods];
      const updated = current.includes(method)
        ? current.filter(m => m !== method)
        : [...current, method];
      if (updated.length === 0) return prev;
      // If override matches global default, remove it
      const globalSorted = [...prev.allowedMethods].sort().join(',');
      const updatedSorted = [...updated].sort().join(',');
      if (globalSorted === updatedSorted) {
        delete overrides[role];
      } else {
        overrides[role] = updated;
      }
      return { ...prev, roleMethodOverrides: overrides };
    });
  };

  const clearRoleOverride = (role: string) => {
    setMfaSettings(prev => {
      const overrides = { ...prev.roleMethodOverrides };
      delete overrides[role];
      return { ...prev, roleMethodOverrides: overrides };
    });
  };

  /* ── Email ── */
  const testEmail = async () => {
    setTestingEmail(true);
    try {
      const result = await systemAdminAPI.testEmailConfig();
      setEmailStatus(result.success ? 'connected' : 'disconnected');
      onMessage(result.success ? 'success' : 'error', result.success ? 'Email service connected' : 'Email not reachable');
    } catch (err: any) { setEmailStatus('disconnected'); onMessage('error', err.response?.data?.message || 'Failed'); }
    finally { setTestingEmail(false); }
  };

  const sendTestEmail = async () => {
    setSendingTest(true);
    try { await systemAdminAPI.sendTestEmail(); onMessage('success', 'Test email sent!'); }
    catch (err: any) { onMessage('error', err.response?.data?.message || 'Failed'); }
    finally { setSendingTest(false); }
  };

  /* ── DLP actions ── */
  const createDLPRule = async () => {
    try {
      const res = await fetch('/api/v1/system-admin/dlp', { method: 'POST', headers: authHeaders(), body: JSON.stringify(dlpForm) });
      const json = await res.json();
      if (json.success) {
        setSuccess('DLP rule created');
        setShowDLPCreate(false);
        setDlpForm({ name: '', description: '', ruleType: 'export_limit', maxRecords: 500, appliesTo: ['fuel_records'], action: 'block' });
        loadDLP();
      } else setError(json.message);
    } catch (err: any) { setError(err.message); }
  };

  const toggleDLPRule = async (id: string) => {
    try {
      const res = await fetch(`/api/v1/system-admin/dlp/${id}/toggle`, { method: 'PATCH', headers: authHeaders() });
      const json = await res.json();
      if (json.success) loadDLP(); else setError(json.message);
    } catch (err: any) { setError(err.message); }
  };

  const deleteDLPRule = async (id: string) => {
    if (!confirm('Delete this DLP rule?')) return;
    try {
      const res = await fetch(`/api/v1/system-admin/dlp/${id}`, { method: 'DELETE', headers: authHeaders() });
      const json = await res.json();
      if (json.success) { setSuccess('Rule deleted'); loadDLP(); } else setError(json.message);
    } catch (err: any) { setError(err.message); }
  };

  const inputCls = 'w-full max-w-xs px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 outline-none focus:ring-2 focus:ring-indigo-500';

  if (loading) return (
    <div className="flex items-center justify-center py-16">
      <Loader2 className="w-6 h-6 animate-spin text-indigo-600" />
      <span className="ml-3 text-gray-500">Loading security settings…</span>
    </div>
  );

  /* ── Render ── */
  return (
    <div className="space-y-4">
      {/* Messages */}
      {error && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
          <AlertTriangle className="w-4 h-4 text-red-500 shrink-0" />
          <span className="text-sm text-red-700 dark:text-red-300 flex-1">{error}</span>
          <button onClick={() => setError(null)}><X className="w-4 h-4 text-red-400" /></button>
        </div>
      )}
      {success && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800">
          <CheckCircle className="w-4 h-4 text-green-500 shrink-0" />
          <span className="text-sm text-green-700 dark:text-green-300">{success}</span>
        </div>
      )}

      {/* ── Stats Cards ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-indigo-50 dark:bg-indigo-900/20 rounded-xl p-4 border border-gray-100 dark:border-gray-700">
          <div className="flex items-center gap-2 mb-1">
            <Lock className="w-3.5 h-3.5 text-indigo-500" />
            <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Session Timeout</span>
          </div>
          <p className="text-2xl font-bold text-indigo-600 dark:text-indigo-400">{sessionSettings.sessionTimeout}<span className="text-sm font-normal text-gray-400">m</span></p>
        </div>
        <div className="bg-purple-50 dark:bg-purple-900/20 rounded-xl p-4 border border-gray-100 dark:border-gray-700">
          <div className="flex items-center gap-2 mb-1">
            <Key className="w-3.5 h-3.5 text-purple-500" />
            <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Password Min</span>
          </div>
          <p className="text-2xl font-bold text-purple-600 dark:text-purple-400">{passwordPolicy.minLength}<span className="text-sm font-normal text-gray-400"> chars</span></p>
        </div>
        <div className="bg-teal-50 dark:bg-teal-900/20 rounded-xl p-4 border border-gray-100 dark:border-gray-700">
          <div className="flex items-center gap-2 mb-1">
            <Fingerprint className="w-3.5 h-3.5 text-teal-500" />
            <span className="text-xs font-medium text-gray-500 dark:text-gray-400">MFA Enforcement</span>
          </div>
          <p className="text-2xl font-bold text-teal-600 dark:text-teal-400">
            {mfaSettings.globalEnabled ? `${mfaSettings.requiredRoles.length} roles` : 'Off'}
          </p>
        </div>
        <div className="bg-orange-50 dark:bg-orange-900/20 rounded-xl p-4 border border-gray-100 dark:border-gray-700">
          <div className="flex items-center gap-2 mb-1">
            <ShieldBan className="w-3.5 h-3.5 text-orange-500" />
            <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Active DLP Rules</span>
          </div>
          <p className="text-2xl font-bold text-orange-600 dark:text-orange-400">{dlpStats?.activeRules ?? '—'}</p>
        </div>
      </div>

      {/* ═══════ Session & Security ═══════ */}
      <SectionCard title="Session & Security" icon={<Lock className="w-5 h-5" />} open={expanded.has('session')} onToggle={() => toggle('session')}>
        <div className="bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-700 rounded-lg p-3 mb-4 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-orange-600 dark:text-orange-400 shrink-0 mt-0.5" />
          <p className="text-sm text-orange-800 dark:text-orange-200">Changes affect <strong>all users</strong>. Existing sessions remain valid until their current token expires.</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-4">
          <InputField label="Session Timeout (minutes)" hint="Idle time before auto-logout"
            value={sessionSettings.sessionTimeout} onChange={v => setSessionSettings(p => ({ ...p, sessionTimeout: parseInt(v) || 30 }))} cls={inputCls} />
          <InputField label="JWT Expiry (hours)" hint="Token lifetime before re-login"
            value={sessionSettings.jwtExpiry} onChange={v => setSessionSettings(p => ({ ...p, jwtExpiry: parseInt(v) || 24 }))} cls={inputCls} />
          <InputField label="Max Login Attempts" hint="Failed logins before account lockout"
            value={sessionSettings.maxLoginAttempts} onChange={v => setSessionSettings(p => ({ ...p, maxLoginAttempts: parseInt(v) || 5 }))} cls={inputCls} />
          <InputField label="Lockout Duration (minutes)" hint="How long the account stays locked"
            value={sessionSettings.lockoutDuration} onChange={v => setSessionSettings(p => ({ ...p, lockoutDuration: parseInt(v) || 15 }))} cls={inputCls} />
          <InputField label="Refresh Token Expiry (days)" hint="How long 'stay logged in' sessions last"
            value={sessionSettings.refreshTokenExpiry} onChange={v => setSessionSettings(p => ({ ...p, refreshTokenExpiry: parseInt(v) || 7 }))} cls={inputCls} />
          <div className="flex items-center pt-5">
            <label className="flex items-start gap-3 cursor-pointer">
              <input type="checkbox" checked={sessionSettings.allowMultipleSessions}
                onChange={e => setSessionSettings(p => ({ ...p, allowMultipleSessions: e.target.checked }))}
                className="w-4 h-4 text-indigo-600 rounded mt-0.5" />
              <div>
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300 block">Allow multiple concurrent sessions</span>
                <span className="text-xs text-gray-500">Users can be logged in from multiple devices</span>
              </div>
            </label>
          </div>
        </div>
        <div className="flex justify-end">
          <SaveBtn label="Save Session Settings" saving={savingSession} onClick={saveSession} />
        </div>
      </SectionCard>

      {/* ═══════ Password Policy ═══════ */}
      <SectionCard title="Password Policy" icon={<Key className="w-5 h-5" />} open={expanded.has('password')} onToggle={() => toggle('password')}>
        <div className="space-y-4 mb-4">
          <InputField label="Minimum Length" value={passwordPolicy.minLength}
            onChange={v => setPasswordPolicy(p => ({ ...p, minLength: parseInt(v) || 12 }))} cls={inputCls} />
          <div className="space-y-2">
            {[
              { key: 'requireUppercase', label: 'Require Uppercase (A–Z)' },
              { key: 'requireLowercase', label: 'Require Lowercase (a–z)' },
              { key: 'requireNumbers', label: 'Require Numbers (0–9)' },
              { key: 'requireSpecialChars', label: 'Require Special Characters (!@#$…)' },
            ].map(({ key, label }) => (
              <label key={key} className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={(passwordPolicy as any)[key]}
                  onChange={e => setPasswordPolicy(p => ({ ...p, [key]: e.target.checked }))}
                  className="w-4 h-4 rounded text-indigo-600" />
                <span className="text-sm text-gray-700 dark:text-gray-300">{label}</span>
              </label>
            ))}
          </div>
          <InputField label="Password History (count)" hint="Prevent reuse of the last N passwords (0 = disabled)"
            value={passwordPolicy.historyCount} onChange={v => setPasswordPolicy(p => ({ ...p, historyCount: parseInt(v) || 5 }))} cls={inputCls} />
        </div>
        <div className="flex justify-end">
          <SaveBtn label="Save Password Policy" saving={savingPassword} onClick={savePassword} />
        </div>
      </SectionCard>

      {/* ═══════ MFA Enforcement ═══════ */}
      <SectionCard title="MFA Enforcement" icon={<Fingerprint className="w-5 h-5" />} open={expanded.has('mfa')} onToggle={() => toggle('mfa')}>
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded-lg p-3 mb-4 flex items-start gap-2">
          <Shield className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
          <p className="text-sm text-blue-800 dark:text-blue-200">
            When enabled, users in selected roles must set up MFA before accessing the system. Others can optionally enable MFA from their profile.
          </p>
        </div>
        <div className="space-y-5 mb-4">
          {/* Global toggle */}
          <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
            <div>
              <p className="font-medium text-gray-900 dark:text-gray-100">Enable MFA Enforcement</p>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                {mfaSettings.globalEnabled ? `Enforced for ${mfaSettings.requiredRoles.length} role(s)` : 'Currently optional for all users'}
              </p>
            </div>
            <button
              onClick={() => setMfaSettings(p => ({ ...p, globalEnabled: !p.globalEnabled }))}
              className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 ${
                mfaSettings.globalEnabled ? 'bg-indigo-600' : 'bg-gray-300 dark:bg-gray-600'
              }`}>
              <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
                mfaSettings.globalEnabled ? 'translate-x-6' : 'translate-x-1'
              }`} />
            </button>
          </div>

          {/* Role selection */}
          {mfaSettings.globalEnabled && (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Require MFA for these roles:</label>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                {ALL_ROLES.map(({ value, label }) => (
                  <label key={value}
                    className={`flex items-center gap-2 p-2 rounded-lg cursor-pointer border transition-colors ${
                      mfaSettings.requiredRoles.includes(value)
                        ? 'border-indigo-300 dark:border-indigo-600 bg-indigo-50 dark:bg-indigo-900/30'
                        : 'border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700/50'
                    }`}>
                    <input type="checkbox" checked={mfaSettings.requiredRoles.includes(value)}
                      onChange={() => toggleMFARole(value)} className="w-4 h-4 rounded text-indigo-600" />
                    <span className="text-sm text-gray-700 dark:text-gray-300">{label}</span>
                  </label>
                ))}
              </div>
              {mfaSettings.requiredRoles.length === 0 && (
                <p className="text-xs text-orange-600 dark:text-orange-400 mt-2">⚠ MFA is enabled but no roles are selected.</p>
              )}
            </div>
          )}

          {/* Allowed methods */}
          {mfaSettings.globalEnabled && (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Allowed verification methods:</label>
              <div className="flex flex-wrap gap-3">
                {[
                  { value: 'totp', label: 'Authenticator App (TOTP)', desc: 'Google Authenticator, Authy, etc.' },
                  { value: 'email', label: 'Email Verification', desc: 'One-time code sent via email' },
                ].map(({ value, label, desc }) => (
                  <label key={value}
                    className={`flex items-start gap-2 p-3 rounded-lg cursor-pointer border transition-colors flex-1 min-w-[180px] ${
                      mfaSettings.allowedMethods.includes(value)
                        ? 'border-indigo-300 dark:border-indigo-600 bg-indigo-50 dark:bg-indigo-900/30'
                        : 'border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700/50'
                    }`}>
                    <input type="checkbox" checked={mfaSettings.allowedMethods.includes(value)}
                      onChange={() => toggleMFAMethod(value)} className="w-4 h-4 rounded text-indigo-600 mt-0.5" />
                    <div>
                      <span className="text-sm font-medium text-gray-700 dark:text-gray-300 block">{label}</span>
                      <span className="text-xs text-gray-500 dark:text-gray-400">{desc}</span>
                    </div>
                  </label>
                ))}
              </div>
              {mfaSettings.allowedMethods.length === 1 && (
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">At least one method must remain enabled.</p>
              )}
            </div>
          )}

          {/* Per-role method overrides */}
          {mfaSettings.globalEnabled && mfaSettings.requiredRoles.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Per-role method overrides:</label>
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">Optionally restrict which methods specific roles may use. Roles without overrides inherit the global default above.</p>
              <div className="space-y-2">
                {mfaSettings.requiredRoles.map(role => {
                  const roleLabel = ALL_ROLES.find(r => r.value === role)?.label ?? role;
                  const hasOverride = !!mfaSettings.roleMethodOverrides[role];
                  const effective = mfaSettings.roleMethodOverrides[role] ?? mfaSettings.allowedMethods;
                  return (
                    <div key={role} className={`flex items-center gap-3 p-2 rounded-lg border ${hasOverride ? 'border-amber-300 dark:border-amber-600 bg-amber-50 dark:bg-amber-900/20' : 'border-gray-200 dark:border-gray-700'}`}>
                      <span className="text-sm font-medium text-gray-700 dark:text-gray-300 min-w-[120px]">{roleLabel}</span>
                      <div className="flex items-center gap-3 flex-1">
                        {[{ value: 'totp', label: 'TOTP' }, { value: 'email', label: 'Email' }].map(m => (
                          <label key={m.value} className="inline-flex items-center gap-1.5 cursor-pointer">
                            <input type="checkbox" checked={effective.includes(m.value)}
                              onChange={() => toggleRoleMethodOverride(role, m.value)}
                              className="h-3.5 w-3.5 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500" />
                            <span className="text-xs text-gray-600 dark:text-gray-400">{m.label}</span>
                          </label>
                        ))}
                      </div>
                      {hasOverride && (
                        <button onClick={() => clearRoleOverride(role)} className="text-xs text-amber-600 dark:text-amber-400 hover:underline">
                          Reset to global
                        </button>
                      )}
                      {!hasOverride && (
                        <span className="text-xs text-gray-400 italic">Global default</span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
        <div className="flex justify-end">
          <SaveBtn label="Save MFA Settings" saving={savingMFA} onClick={saveMFA} />
        </div>
      </SectionCard>

      {/* ═══════ Login Security ═══════ */}
      <SectionCard title="Login Security" icon={<Bell className="w-5 h-5" />} open={expanded.has('loginSecurity')} onToggle={() => toggle('loginSecurity')}>
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded-lg p-3 mb-4 flex items-start gap-2">
          <Shield className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
          <p className="text-sm text-blue-800 dark:text-blue-200">
            Control login-related security features for all users. These settings affect login activity tracking, email notifications, and new device detection.
          </p>
        </div>
        <div className="space-y-3 mb-4">
          {[
            { key: 'deviceTracking' as const, label: 'Device & Session Tracking', desc: 'Track login activity including browser, OS, IP address, and device type for all users' },
            { key: 'loginNotifications' as const, label: 'Login Notification Emails', desc: 'Send an email notification to users each time they sign in from any device' },
            { key: 'newDeviceAlerts' as const, label: 'New Device Alerts', desc: 'Send a special alert email when a user signs in from a previously unseen device' },
          ].map(({ key, label, desc }) => (
            <div key={key} className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
              <div>
                <p className="font-medium text-gray-900 dark:text-gray-100">{label}</p>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{desc}</p>
              </div>
              <button
                onClick={() => setNotifSettings(p => ({ ...p, [key]: !p[key] }))}
                className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 ${
                  notifSettings[key] ? 'bg-indigo-600' : 'bg-gray-300 dark:bg-gray-600'
                }`}>
                <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
                  notifSettings[key] ? 'translate-x-6' : 'translate-x-1'
                }`} />
              </button>
            </div>
          ))}
        </div>
        <div className="flex justify-end">
          <SaveBtn label="Save Login Security" saving={savingNotifications} onClick={saveNotifications} />
        </div>
      </SectionCard>

      {/* ═══════ DLP Rules ═══════ */}
      <SectionCard title="Data Loss Prevention" icon={<ShieldBan className="w-5 h-5" />} open={expanded.has('dlp')} onToggle={() => toggle('dlp')}>
        {/* DLP stats */}
        {dlpStats && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            {[
              { label: 'Total Rules', value: dlpStats.totalRules, cls: 'text-indigo-600 dark:text-indigo-400' },
              { label: 'Active', value: dlpStats.activeRules, cls: 'text-green-600 dark:text-green-400' },
              { label: 'Total Triggers', value: dlpStats.totalTriggers, cls: 'text-orange-600 dark:text-orange-400' },
              { label: 'Rule Types', value: Object.keys(dlpStats.rulesByType).length, cls: 'text-purple-600 dark:text-purple-400' },
            ].map(s => (
              <div key={s.label} className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3 border border-gray-100 dark:border-gray-600">
                <p className="text-xs text-gray-500 dark:text-gray-400">{s.label}</p>
                <p className={`text-xl font-bold mt-0.5 ${s.cls}`}>{s.value}</p>
              </div>
            ))}
          </div>
        )}

        {/* Add rule button */}
        <div className="flex justify-end mb-3">
          <button onClick={() => setShowDLPCreate(!showDLPCreate)}
            className="flex items-center gap-2 px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700 transition-colors">
            <Plus className="w-4 h-4" /> Add Rule
          </button>
        </div>

        {/* Create form */}
        {showDLPCreate && (
          <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4 mb-4 space-y-3 border border-gray-200 dark:border-gray-600">
            <h4 className="font-semibold text-sm text-gray-900 dark:text-gray-100">New DLP Rule</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-700 dark:text-gray-300 mb-1">Name</label>
                <input value={dlpForm.name} onChange={e => setDlpForm(f => ({ ...f, name: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border rounded-lg dark:bg-gray-800 dark:border-gray-600 dark:text-gray-200" />
              </div>
              <div>
                <label className="block text-xs text-gray-700 dark:text-gray-300 mb-1">Rule Type</label>
                <select value={dlpForm.ruleType} onChange={e => setDlpForm(f => ({ ...f, ruleType: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border rounded-lg dark:bg-gray-800 dark:border-gray-600 dark:text-gray-200">
                  {Object.entries(RULE_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
              <div className="md:col-span-2">
                <label className="block text-xs text-gray-700 dark:text-gray-300 mb-1">Description</label>
                <input value={dlpForm.description} onChange={e => setDlpForm(f => ({ ...f, description: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border rounded-lg dark:bg-gray-800 dark:border-gray-600 dark:text-gray-200" />
              </div>
              {dlpForm.ruleType === 'export_limit' && (
                <div>
                  <label className="block text-xs text-gray-700 dark:text-gray-300 mb-1">Max Records per Export</label>
                  <input type="number" value={dlpForm.maxRecords} onChange={e => setDlpForm(f => ({ ...f, maxRecords: parseInt(e.target.value) }))}
                    className="w-full px-3 py-2 text-sm border rounded-lg dark:bg-gray-800 dark:border-gray-600 dark:text-gray-200" />
                </div>
              )}
              <div>
                <label className="block text-xs text-gray-700 dark:text-gray-300 mb-1">Action</label>
                <select value={dlpForm.action} onChange={e => setDlpForm(f => ({ ...f, action: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border rounded-lg dark:bg-gray-800 dark:border-gray-600 dark:text-gray-200">
                  <option value="block">Block</option><option value="warn">Warn</option><option value="log">Log Only</option>
                </select>
              </div>
              <div className="md:col-span-2">
                <label className="block text-xs text-gray-700 dark:text-gray-300 mb-1">Applies To</label>
                <div className="flex flex-wrap gap-2">
                  {DATA_TYPES.map(dt => (
                    <label key={dt} className="flex items-center gap-1.5 text-sm">
                      <input type="checkbox" checked={dlpForm.appliesTo.includes(dt)}
                        onChange={e => setDlpForm(f => ({ ...f, appliesTo: e.target.checked ? [...f.appliesTo, dt] : f.appliesTo.filter(x => x !== dt) }))}
                        className="rounded" />
                      <span className="text-gray-700 dark:text-gray-300">{dt.replace(/_/g, ' ')}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
            <div className="flex gap-2 pt-1">
              <button onClick={createDLPRule} className="px-4 py-1.5 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700">Create</button>
              <button onClick={() => setShowDLPCreate(false)} className="px-4 py-1.5 bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-300 rounded-lg text-sm">Cancel</button>
            </div>
          </div>
        )}

        {/* Rules list */}
        {loadingDLP ? (
          <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 text-indigo-500 animate-spin" /></div>
        ) : dlpRules.length === 0 ? (
          <div className="text-center py-8 text-gray-400">
            <ShieldBan className="w-8 h-8 mx-auto mb-2 opacity-30" />
            <p className="text-sm">No DLP rules configured</p>
          </div>
        ) : (
          <div className="space-y-2">
            {dlpRules.map(rule => (
              <div key={rule._id} className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3 border border-gray-100 dark:border-gray-600">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className="font-medium text-sm text-gray-900 dark:text-gray-100">{rule.name}</span>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                        rule.isActive ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400'
                      }`}>{rule.isActive ? 'Active' : 'Inactive'}</span>
                      <span className="px-2 py-0.5 rounded-full text-[10px] bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400">
                        {RULE_TYPES[rule.ruleType] || rule.ruleType}
                      </span>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] ${
                        rule.action === 'block' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                          : rule.action === 'warn' ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400'
                          : 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                      }`}>{rule.action}</span>
                    </div>
                    {rule.description && <p className="text-xs text-gray-500 dark:text-gray-400">{rule.description}</p>}
                    <div className="flex items-center gap-3 mt-1.5 text-[11px] text-gray-400">
                      <span>Applies to: {rule.appliesTo.join(', ')}</span>
                      <span>Triggered: {rule.triggerCount}x</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button onClick={() => toggleDLPRule(rule._id)} className="p-1.5 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg transition-colors">
                      {rule.isActive ? <ToggleRight className="w-5 h-5 text-green-500" /> : <ToggleLeft className="w-5 h-5 text-gray-400" />}
                    </button>
                    <button onClick={() => deleteDLPRule(rule._id)} className="p-1.5 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg text-gray-400 hover:text-red-500 transition-colors">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      {/* ═══════ Email Notifications ═══════ */}
      <SectionCard title="Email Notifications" icon={<Mail className="w-5 h-5" />} open={expanded.has('email')} onToggle={() => toggle('email')}>
        <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg mb-4">
          <div className="flex items-center gap-3">
            {emailStatus === 'connected' && <CheckCircle className="w-5 h-5 text-green-500" />}
            {emailStatus === 'disconnected' && <XCircle className="w-5 h-5 text-red-500" />}
            {emailStatus === 'unknown' && <Mail className="w-5 h-5 text-gray-400" />}
            <div>
              <p className="font-medium text-gray-900 dark:text-gray-100">Email Service Status</p>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {emailStatus === 'connected' && 'Connected and operational'}
                {emailStatus === 'disconnected' && 'Not configured or connection failed'}
                {emailStatus === 'unknown' && 'Click Test to check status'}
              </p>
            </div>
          </div>
          <button onClick={testEmail} disabled={testingEmail}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50 transition-colors">
            {testingEmail ? 'Testing…' : 'Test Connection'}
          </button>
        </div>

        {emailStatus === 'connected' && (
          <button onClick={sendTestEmail} disabled={sendingTest}
            className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors text-sm">
            <Send className="w-4 h-4" />
            {sendingTest ? 'Sending…' : 'Send Test Email'}
          </button>
        )}

        {emailStatus === 'disconnected' && (
          <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
            <p className="text-sm font-medium text-red-800 dark:text-red-200 mb-2">⚠️ Email not configured</p>
            <p className="text-sm text-red-700 dark:text-red-300 mb-2">
              Configure SMTP credentials in the <strong>Integrations</strong> tab, or add these to your .env file:
            </p>
            <code className="block text-xs bg-red-100 dark:bg-red-900/40 p-2 rounded leading-relaxed">
              EMAIL_HOST=smtp.gmail.com<br />EMAIL_PORT=587<br />EMAIL_USER=your@email.com<br />EMAIL_PASSWORD=your-app-password
            </code>
          </div>
        )}
      </SectionCard>
    </div>
  );
}

/* ───────── Shared Sub-Components ───────── */

function SectionCard({ title, icon, open, onToggle, children }: {
  title: string; icon: React.ReactNode; open: boolean; onToggle: () => void; children: React.ReactNode;
}) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
      <button onClick={onToggle}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
        <div className="flex items-center gap-3">
          <div className="text-gray-700 dark:text-gray-300">{icon}</div>
          <h3 className="font-semibold text-gray-900 dark:text-gray-100">{title}</h3>
        </div>
        {open ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
      </button>
      {open && <div className="px-5 pb-5 border-t border-gray-100 dark:border-gray-700 pt-4">{children}</div>}
    </div>
  );
}

function InputField({ label, hint, value, onChange, cls }: {
  label: string; hint?: string; value: number | string; onChange: (v: string) => void; cls: string;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{label}</label>
      <input type="number" min={0} value={value} onChange={e => onChange(e.target.value)} className={cls} />
      {hint && <p className="text-xs text-gray-500 mt-1">{hint}</p>}
    </div>
  );
}

function SaveBtn({ label, saving, onClick }: { label: string; saving: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} disabled={saving}
      className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm disabled:opacity-50 transition-colors">
      {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
      {label}
    </button>
  );
}
