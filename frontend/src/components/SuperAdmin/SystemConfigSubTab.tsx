import { useState, useEffect, useCallback } from 'react';
import {
  Settings, Lock, Database, Bell, Clock, GitCompare,
  ChevronDown, RefreshCw, Save, CheckCircle, AlertCircle, ShieldCheck,
} from 'lucide-react';
import UnifiedTabLoader from './common/UnifiedTabLoader';
import AsyncErrorPanel from './common/AsyncErrorPanel';
import { useAsyncState } from '../../hooks/useAsyncState';
import { useActionState } from '../../hooks/useActionState';
import apiClient from '../../services/api';
import { systemConfigAPI } from '../../services/systemConfigService';
import type { SystemSettings, PasswordPolicySettings } from '../../services/systemConfigService';
import ConfigVersionHistoryTab from './ConfigVersionHistoryTab';
import ConfigDiffTab from './ConfigDiffTab';

interface Props {
  onMessage: (type: 'success' | 'error', message: string) => void;
  onNavigate?: (section: string) => void;
}

type AccSection = 'general' | 'security' | 'data' | 'notifications';

// ── Tiny shared primitives ──────────────────────────────────────────────────

function StatTile({ label, value, sub, icon: Icon, iconBg, iconColor }: {
  label: string; value: string | number; sub?: string;
  icon: React.ElementType; iconBg: string; iconColor: string;
}) {
  return (
    <div className="bg-white dark:bg-gray-800 border border-[#E4E7EC] dark:border-gray-700 rounded-xl p-4 flex items-center gap-3.5 min-w-0">
      <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: iconBg }}>
        <Icon className="w-[18px] h-[18px]" style={{ color: iconColor }} />
      </div>
      <div className="min-w-0">
        <div className="text-[22px] font-extrabold text-[#111827] dark:text-gray-100 leading-none">{value}</div>
        <div className="text-[12px] text-[#6B7280] dark:text-gray-400 mt-1">{label}</div>
        {sub && <div className="text-[11px] text-[#9CA3AF] dark:text-gray-500 mt-0.5">{sub}</div>}
      </div>
    </div>
  );
}

function SectionDivider({ label, icon: Icon }: { label: string; icon?: React.ElementType }) {
  return (
    <div className="flex items-center gap-3 py-1">
      <div className="h-px flex-1 bg-[#E4E7EC] dark:bg-gray-700" />
      <div className="flex items-center gap-1.5 px-3 py-1 rounded-full border border-[#E4E7EC] dark:border-gray-700 bg-white dark:bg-gray-800">
        {Icon && <Icon className="w-3 h-3 text-[#9CA3AF] dark:text-gray-500" />}
        <span className="text-[10px] font-bold uppercase tracking-widest text-[#9CA3AF] dark:text-gray-500">{label}</span>
      </div>
      <div className="h-px flex-1 bg-[#E4E7EC] dark:bg-gray-700" />
    </div>
  );
}

function Toggle({ checked, onChange, disabled }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button type="button" onClick={() => !disabled && onChange(!checked)} disabled={disabled}
      className={`relative inline-flex items-center w-9 h-5 rounded-full transition-colors flex-shrink-0 ${
        checked ? 'bg-[#4F46E5] dark:bg-indigo-500' : 'bg-[#E4E7EC] dark:bg-gray-600'
      } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}>
      <span className={`inline-block w-3.5 h-3.5 bg-white rounded-full shadow-sm transition-transform ${
        checked ? 'translate-x-[18px]' : 'translate-x-[2px]'
      }`} />
    </button>
  );
}

const inputCls = 'w-full px-3 py-2 text-[13px] bg-white dark:bg-gray-700 border border-[#E4E7EC] dark:border-gray-600 rounded-lg text-[#111827] dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-[#4F46E5] focus:border-[#4F46E5] transition-colors';
const labelCls = 'text-[11px] font-semibold uppercase tracking-[0.05em] text-[#6B7280] dark:text-gray-400';

// ── Main component ──────────────────────────────────────────────────────────

export default function SystemConfigSubTab({ onMessage, onNavigate }: Props) {
  const [openSection, setOpenSection] = useState<AccSection | null>('general');
  const [settings, setSettings] = useState<SystemSettings | null>(null);
  const settingsLoadState = useAsyncState('loading');
  const sectionSaveState = useActionState();
  const runSettingsLoad = settingsLoadState.run;
  const runSectionSave = sectionSaveState.run;
  const [passwordPolicy, setPasswordPolicy] = useState<PasswordPolicySettings>({
    minLength: 12,
    requireUppercase: true,
    requireLowercase: true,
    requireNumbers: true,
    requireSpecialChars: true,
    historyCount: 5,
    expirationDays: 0,
  });
  const [savingSection, setSavingSection] = useState<AccSection | null>(null);
  const [sectionFeedback, setSectionFeedback] = useState<{ section: AccSection; type: 'success' | 'error'; message: string } | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const [stats, setStats] = useState<{ snapshots: number; changes: number } | null>(null);
  const [securityLastChanged, setSecurityLastChanged] = useState<{ by: string; at: string } | null>(null);

  const fwd = useCallback((msg: string, type?: 'success' | 'error' | 'info') => {
    onMessage((type || 'error') as 'success' | 'error', msg);
  }, [onMessage]);

  const loadStats = useCallback(async () => {
    setStatsLoading(true);
    try {
      const [hRes, dRes, secRes] = await Promise.allSettled([
        apiClient.get('/system-admin/config-history', { params: { page: 1, limit: 1 } }),
        apiClient.get('/system-admin/config-diff',    { params: { page: 1, limit: 1 } }),
        apiClient.get('/system-admin/security-audit-log', { params: { page: 1, limit: 1 } }),
      ]);
      setStats({
        snapshots: hRes.status === 'fulfilled' ? (hRes.value.data.pagination?.total ?? 0) : 0,
        changes:   dRes.status === 'fulfilled' ? (dRes.value.data.pagination?.total ?? 0) : 0,
      });

      if (secRes.status === 'fulfilled') {
        const rows = secRes.value.data?.data?.data || secRes.value.data?.data || [];
        const latest = Array.isArray(rows) ? rows[0] : null;
        if (latest) {
          const name = latest.userId
            ? `${latest.userId.firstName || ''} ${latest.userId.lastName || ''}`.trim() || latest.userId.email || 'System'
            : latest.username || 'System';
          setSecurityLastChanged({
            by: name,
            at: latest.createdAt || '',
          });
        }
      }
    } catch { /* silent */ } finally { setStatsLoading(false); }
  }, []);

  const loadSettings = useCallback(async () => {
    const result = await runSettingsLoad(async () => {
      const [data, policy] = await Promise.all([
        systemConfigAPI.getSystemSettings(),
        systemConfigAPI.getPasswordPolicy(),
      ]);
      return { data, policy };
    }, {
      errorMessage: 'Failed to load settings',
    });

    if (result.ok) {
      setSettings(result.data.data);
      setPasswordPolicy(result.data.policy);
      return;
    }

    onMessage('error', result.error);
  }, [onMessage, runSettingsLoad]);

  useEffect(() => {
    loadStats();
    loadSettings();
  }, [loadStats, loadSettings]);

  useEffect(() => {
    const preferredSection = sessionStorage.getItem('sa_system_config_focus_section') as AccSection | null;
    if (preferredSection && ['general', 'security', 'data', 'notifications'].includes(preferredSection)) {
      setOpenSection(preferredSection);
    }
    if (preferredSection) {
      sessionStorage.removeItem('sa_system_config_focus_section');
    }
  }, []);

  const toggleSection = (id: AccSection) => {
    setOpenSection(prev => prev === id ? null : id);
    setSectionFeedback(null);
  };

  const upd = <K extends keyof SystemSettings>(section: K, patch: Partial<SystemSettings[K]>) => {
    setSettings(prev => prev ? { ...prev, [section]: { ...prev[section], ...patch } } : prev);
  };

  const saveSection = async (id: AccSection) => {
    if (!settings) return;

    if (id === 'security') {
      onMessage('error', 'Security settings are managed in Security Center');
      return;
    }

    setSavingSection(id);
    setSectionFeedback(null);
    const result = await runSectionSave(async () => {
      switch (id) {
        case 'general':
          await systemConfigAPI.updateGeneralSettings(settings.general);
          break;
        case 'data':
          await systemConfigAPI.updateDataRetentionSettings(settings.data);
          break;
        case 'notifications':
          await systemConfigAPI.updateNotificationSettings(settings.notifications);
          break;
      }
    }, {
      errorMessage: 'Save failed',
    });

    if (result.ok) {
      setSectionFeedback({ section: id, type: 'success', message: 'Settings saved successfully' });
      onMessage('success', 'Settings saved');
      setTimeout(() => setSectionFeedback(s => s?.section === id ? null : s), 4000);
    } else {
      setSectionFeedback({ section: id, type: 'error', message: result.error });
      onMessage('error', result.error);
    }

    setSavingSection(null);
  };

  // ── Section definitions ────────────────────────────────────────────────────

  const SECTIONS: { id: AccSection; label: string; sub: string; icon: React.ElementType; accent: string; accentBg: string }[] = [
    { id: 'general',       label: 'General',              sub: 'System name, timezone, date format, language',                     icon: Settings, accent: '#4F46E5', accentBg: '#EEF2FF' },
    { id: 'security',      label: 'Security & Sessions',  sub: 'Read-only summary. Managed in Security Center.',                   icon: Lock,     accent: '#2563EB', accentBg: '#EFF6FF' },
    { id: 'data',          label: 'Data Lifecycle Policy', sub: 'Canonical policy editor for archival, trash, and backup retention', icon: Database, accent: '#0D9488', accentBg: '#F0FDFA' },
    { id: 'notifications', label: 'Notifications',        sub: 'Email toggles, alert recipients, digests, warning thresholds',     icon: Bell,     accent: '#D97706', accentBg: '#FFFBEB' },
  ];

  return (
    <div className="p-6 space-y-6">
      {/* ── Stat tiles ──────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        <StatTile label="Config Snapshots"   value={statsLoading ? '…' : (stats?.snapshots ?? 0)} icon={Clock}      iconBg="#EEF2FF" iconColor="#4F46E5" />
        <StatTile label="Config Changes"     value={statsLoading ? '…' : (stats?.changes   ?? 0)} icon={GitCompare}  iconBg="#F5F3FF" iconColor="#7C3AED" />
        <StatTile label="Settings Sections"  value={4}                                             icon={Settings}   iconBg="#F0FDF4" iconColor="#16A34A" sub="General · Security · Data Lifecycle · Notifications" />
      </div>

      {/* ── Settings accordion ─────────────────────────────────────────────── */}
      {settingsLoadState.isLoading && !settings ? (
        <UnifiedTabLoader label="Loading settings..." heightClassName="h-40" />
      ) : settingsLoadState.isError && !settings ? (
        <AsyncErrorPanel
          title="System Settings Unavailable"
          message={settingsLoadState.error || 'Failed to load settings'}
          onRetry={loadSettings}
        />
      ) : settings && (
        <div className="space-y-2">
          {SECTIONS.map(sec => {
            const open = openSection === sec.id;
            const Icon = sec.icon;
            const isSaving = savingSection === sec.id;
            const fb = sectionFeedback?.section === sec.id ? sectionFeedback : null;

            return (
              <div key={sec.id}
                className={`bg-white dark:bg-gray-800 border rounded-xl overflow-hidden transition-shadow ${
                  open
                    ? 'border-[#C7D2FE] dark:border-indigo-700 shadow-sm'
                    : 'border-[#E4E7EC] dark:border-gray-700 hover:border-[#C7D2FE] dark:hover:border-gray-600'
                }`}>
                {/* Accordion header */}
                <button
                  type="button"
                  onClick={() => toggleSection(sec.id)}
                  className="w-full flex items-center gap-3 px-5 py-4 text-left"
                >
                  <div className="w-[34px] h-[34px] rounded-lg flex items-center justify-center flex-shrink-0"
                    style={{ background: sec.accentBg }}>
                    <Icon className="w-4 h-4" style={{ color: sec.accent }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[14px] font-bold text-[#111827] dark:text-gray-100">{sec.label}</span>
                    </div>
                    <div className="text-[12px] text-[#9CA3AF] dark:text-gray-400 mt-0.5 truncate">{sec.sub}</div>
                  </div>
                  <ChevronDown className={`w-4 h-4 text-[#9CA3AF] dark:text-gray-500 transition-transform flex-shrink-0 ${open ? 'rotate-180' : ''}`} />
                </button>

                {/* Accordion body */}
                {open && (
                  <div className="px-5 pb-5 border-t border-[#E4E7EC] dark:border-gray-700 pt-4">
                    {/* Inline feedback */}
                    {fb && (
                      <div className={`flex items-center gap-2 px-3 py-2 rounded-lg text-[12px] font-medium mb-4 ${
                        fb.type === 'success'
                          ? 'bg-[#F0FDF4] border border-[#BBF7D0] text-[#16A34A] dark:bg-green-900/20 dark:border-green-800 dark:text-green-400'
                          : 'bg-[#FEF2F2] border border-[#FECACA] text-[#DC2626] dark:bg-red-900/20 dark:border-red-800 dark:text-red-400'
                      }`}>
                        {fb.type === 'success'
                          ? <CheckCircle className="w-3.5 h-3.5 flex-shrink-0" />
                          : <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />}
                        {fb.message}
                      </div>
                    )}

                    {/* ── GENERAL ── */}
                    {sec.id === 'general' && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="sm:col-span-2 flex flex-col gap-1.5">
                          <label className={labelCls}>System Name</label>
                          <input className={inputCls} value={settings.general.systemName}
                            onChange={e => upd('general', { systemName: e.target.value })} />
                        </div>
                        <div className="flex flex-col gap-1.5">
                          <label className={labelCls}>Timezone</label>
                          <select className={inputCls} value={settings.general.timezone}
                            onChange={e => upd('general', { timezone: e.target.value })}>
                            <optgroup label="Africa">
                              <option value="Africa/Nairobi">Africa/Nairobi (EAT +3)</option>
                              <option value="Africa/Lagos">Africa/Lagos (WAT +1)</option>
                              <option value="Africa/Cairo">Africa/Cairo (EET +2)</option>
                              <option value="Africa/Johannesburg">Africa/Johannesburg (SAST +2)</option>
                            </optgroup>
                            <optgroup label="America">
                              <option value="America/New_York">America/New_York (ET)</option>
                              <option value="America/Chicago">America/Chicago (CT)</option>
                              <option value="America/Denver">America/Denver (MT)</option>
                              <option value="America/Los_Angeles">America/Los_Angeles (PT)</option>
                              <option value="America/Sao_Paulo">America/Sao_Paulo (BRT)</option>
                            </optgroup>
                            <optgroup label="Asia">
                              <option value="Asia/Dubai">Asia/Dubai (GST +4)</option>
                              <option value="Asia/Kolkata">Asia/Kolkata (IST +5:30)</option>
                              <option value="Asia/Riyadh">Asia/Riyadh (AST +3)</option>
                              <option value="Asia/Tokyo">Asia/Tokyo (JST +9)</option>
                              <option value="Asia/Singapore">Asia/Singapore (SGT +8)</option>
                            </optgroup>
                            <optgroup label="Europe">
                              <option value="Europe/London">Europe/London (GMT/BST)</option>
                              <option value="Europe/Paris">Europe/Paris (CET/CEST +1/2)</option>
                              <option value="Europe/Berlin">Europe/Berlin (CET/CEST +1/2)</option>
                              <option value="Europe/Moscow">Europe/Moscow (MSK +3)</option>
                            </optgroup>
                            <optgroup label="UTC">
                              <option value="UTC">UTC (±0)</option>
                            </optgroup>
                          </select>
                        </div>
                        <div className="flex flex-col gap-1.5">
                          <label className={labelCls}>Date Format</label>
                          <select className={inputCls} value={settings.general.dateFormat}
                            onChange={e => upd('general', { dateFormat: e.target.value })}>
                            <option value="DD/MM/YYYY">DD/MM/YYYY</option>
                            <option value="MM/DD/YYYY">MM/DD/YYYY</option>
                            <option value="YYYY-MM-DD">YYYY-MM-DD</option>
                            <option value="DD-MMM-YYYY">DD-MMM-YYYY</option>
                          </select>
                        </div>
                        <div className="flex flex-col gap-1.5">
                          <label className={labelCls}>Language</label>
                          <select className={inputCls} value={settings.general.language}
                            onChange={e => upd('general', { language: e.target.value })}>
                            <option value="en">English</option>
                            <option value="ar">Arabic</option>
                            <option value="fr">French</option>
                            <option value="sw">Swahili</option>
                          </select>
                        </div>
                      </div>
                    )}

                    {/* ── SECURITY ── */}
                    {sec.id === 'security' && (
                      <div className="space-y-4">
                        <div className="flex items-start justify-between gap-3 rounded-lg border border-blue-200 bg-blue-50 p-3 dark:border-blue-800 dark:bg-blue-900/20">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <ShieldCheck className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                              <span className="text-[12px] font-semibold text-blue-800 dark:text-blue-300">Managed in Security Center</span>
                            </div>
                            <p className="mt-1 text-[12px] text-blue-700 dark:text-blue-300/90">
                              Security policy editing is locked in System Configuration. Use Security Center for all policy changes.
                            </p>
                            <p className="mt-1 text-[11px] text-blue-600 dark:text-blue-400">
                              Last changed by: <span className="font-semibold">{securityLastChanged?.by || 'Unknown'}</span>
                              {' '}
                              {securityLastChanged?.at ? `on ${new Date(securityLastChanged.at).toLocaleString()}` : ''}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              sessionStorage.setItem('sa_security_preferred_subtab', 'policies');
                              onNavigate?.('sa_security');
                            }}
                            className="shrink-0 rounded-lg bg-blue-600 px-3 py-1.5 text-[12px] font-semibold text-white transition-colors hover:bg-blue-700"
                          >
                            Manage in Security Center
                          </button>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <ReadOnlyRow label="Session Timeout" value={`${settings.session.sessionTimeout} min`} />
                          <ReadOnlyRow label="JWT Expiry" value={`${settings.session.jwtExpiry} min`} />
                          <ReadOnlyRow label="Refresh Token Expiry" value={`${settings.session.refreshTokenExpiry} days`} />
                          <ReadOnlyRow label="Max Login Attempts" value={String(settings.session.maxLoginAttempts)} />
                          <ReadOnlyRow label="Lockout Duration" value={`${settings.session.lockoutDuration} min`} />
                          <ReadOnlyRow label="Allow Multiple Sessions" value={settings.session.allowMultipleSessions ? 'Enabled' : 'Disabled'} />
                        </div>

                        <SectionDivider label="Password Policy (Read-only)" icon={Lock} />
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <ReadOnlyRow label="Minimum Length" value={String(passwordPolicy.minLength)} />
                          <ReadOnlyRow label="Password History" value={`${passwordPolicy.historyCount} previous passwords`} />
                          <ReadOnlyRow label="Expiration" value={passwordPolicy.expirationDays > 0 ? `${passwordPolicy.expirationDays} days` : 'Never'} />
                          <ReadOnlyRow label="Uppercase Required" value={passwordPolicy.requireUppercase ? 'Yes' : 'No'} />
                          <ReadOnlyRow label="Lowercase Required" value={passwordPolicy.requireLowercase ? 'Yes' : 'No'} />
                          <ReadOnlyRow label="Numbers Required" value={passwordPolicy.requireNumbers ? 'Yes' : 'No'} />
                          <ReadOnlyRow label="Special Characters Required" value={passwordPolicy.requireSpecialChars ? 'Yes' : 'No'} />
                        </div>
                      </div>
                    )}

                    {/* ── DATA RETENTION ── */}
                    {sec.id === 'data' && (
                      <div className="space-y-4">
                        <div className="rounded-lg border border-teal-200 bg-teal-50 p-3 dark:border-teal-800 dark:bg-teal-900/20">
                          <div className="text-[12px] font-semibold text-teal-800 dark:text-teal-300">Canonical Data Lifecycle Editor</div>
                          <p className="mt-1 text-[12px] text-teal-700 dark:text-teal-300/90">
                            Archival, trash retention, and backup retention policy are managed here. Operational tabs are read-only for policy values.
                          </p>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="sm:col-span-2 flex items-center justify-between p-3 bg-[#F8F9FB] dark:bg-gray-700/50 rounded-lg border border-[#E4E7EC] dark:border-gray-600">
                          <div>
                            <div className="text-[13px] font-medium text-[#111827] dark:text-gray-100">Enable Archival</div>
                            <div className="text-[11px] text-[#9CA3AF] dark:text-gray-400 mt-0.5">Automatically archive old records based on retention policy</div>
                          </div>
                          <Toggle checked={settings.data.archivalEnabled}
                            onChange={v => upd('data', { archivalEnabled: v })} />
                        </div>
                        {[
                          { key: 'archivalMonths',    label: 'Archival After (months)', min: 1, disabled: !settings.data.archivalEnabled },
                          { key: 'auditLogRetention', label: 'Audit Log Retention (days)', min: 1 },
                          { key: 'trashRetention',    label: 'Trash Retention (days)',  min: 1 },
                          { key: 'backupRetention',   label: 'Backup Retention (copies)', min: 1 },
                        ].map(f => (
                          <div key={f.key} className="flex flex-col gap-1.5">
                            <label className={`${labelCls} ${f.disabled ? 'opacity-40' : ''}`}>{f.label}</label>
                            <input type="number" min={f.min} disabled={f.disabled} className={`${inputCls} ${f.disabled ? 'opacity-40 cursor-not-allowed' : ''}`}
                              value={(settings.data as any)[f.key]}
                              onChange={e => upd('data', { [f.key]: Number(e.target.value) } as any)} />
                          </div>
                        ))}
                        <div className="flex flex-col gap-1.5">
                          <label className={labelCls}>Backup Frequency</label>
                          <select className={inputCls} value={settings.data.backupFrequency}
                            onChange={e => upd('data', { backupFrequency: e.target.value as 'daily' | 'weekly' | 'monthly' })}>
                            <option value="daily">Daily</option>
                            <option value="weekly">Weekly</option>
                            <option value="monthly">Monthly</option>
                          </select>
                        </div>
                        <div className="flex items-center justify-between p-3 bg-[#F8F9FB] dark:bg-gray-700/50 rounded-lg border border-[#E4E7EC] dark:border-gray-600">
                          <div>
                            <div className="text-[13px] font-medium text-[#111827] dark:text-gray-100">Auto Cleanup</div>
                            <div className="text-[11px] text-[#9CA3AF] dark:text-gray-400 mt-0.5">Automatically purge trash beyond retention period</div>
                          </div>
                          <Toggle checked={settings.data.autoCleanupEnabled}
                            onChange={v => upd('data', { autoCleanupEnabled: v })} />
                        </div>
                        </div>
                      </div>
                    )}

                    {/* ── NOTIFICATIONS ── */}
                    {sec.id === 'notifications' && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        {[
                          { key: 'emailNotifications', label: 'Email Notifications',  sub: 'Send transactional emails on key events' },
                          { key: 'criticalAlerts',      label: 'Critical Alerts',      sub: 'Immediate notifications for system errors' },
                          { key: 'dailySummary',        label: 'Daily Summary',        sub: 'Send summary digest each morning' },
                          { key: 'weeklyReport',        label: 'Weekly Report',        sub: 'Send weekly analytics & activity report' },
                          { key: 'sendCredentialsEmail', label: 'Send Credentials Email', sub: 'Email username & password to new users on creation' },
                        ].map(f => (
                          <div key={f.key} className="flex items-center justify-between p-3 bg-[#F8F9FB] dark:bg-gray-700/50 rounded-lg border border-[#E4E7EC] dark:border-gray-600">
                            <div>
                              <div className="text-[13px] font-medium text-[#111827] dark:text-gray-100">{f.label}</div>
                              <div className="text-[11px] text-[#9CA3AF] dark:text-gray-400 mt-0.5">{f.sub}</div>
                            </div>
                            <Toggle checked={(settings.notifications as any)[f.key]}
                              onChange={v => upd('notifications', { [f.key]: v } as any)} />
                          </div>
                        ))}
                        {/* Bypass Email Verification — warning-styled since it lowers security */}
                        <div className="flex items-center justify-between p-3 bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-200 dark:border-amber-700 sm:col-span-2">
                          <div>
                            <div className="text-[13px] font-medium text-amber-800 dark:text-amber-300">Bypass Email Verification</div>
                            <div className="text-[11px] text-amber-600 dark:text-amber-400 mt-0.5">Skip OTP requirement during email MFA setup — use only while waiting for email domain verification</div>
                          </div>
                          <Toggle checked={(settings.notifications as any).bypassEmailVerification ?? false}
                            onChange={v => upd('notifications', { bypassEmailVerification: v } as any)} />
                        </div>
                        <div className="flex flex-col gap-1.5">
                          <label className={labelCls}>Slow Query Threshold (ms)</label>
                          <input type="number" min={100} className={inputCls}
                            value={settings.notifications.slowQueryThreshold}
                            onChange={e => upd('notifications', { slowQueryThreshold: Number(e.target.value) })} />
                        </div>
                        <div className="flex flex-col gap-1.5">
                          <label className={labelCls}>Storage Warning Threshold (%)</label>
                          <input type="number" min={1} max={100} className={inputCls}
                            value={settings.notifications.storageWarningThreshold}
                            onChange={e => upd('notifications', { storageWarningThreshold: Number(e.target.value) })} />
                        </div>
                      </div>
                    )}

                    {/* Save button */}
                    {sec.id !== 'security' && (
                      <div className="flex justify-end mt-5 pt-4 border-t border-[#E4E7EC] dark:border-gray-700">
                        <button
                          onClick={() => saveSection(sec.id)}
                          disabled={isSaving}
                          className="flex items-center gap-2 px-5 py-2 text-[13px] font-semibold text-white rounded-lg transition-colors disabled:opacity-60"
                          style={{ background: sec.accent }}
                        >
                          {isSaving
                            ? <><RefreshCw className="w-3.5 h-3.5 animate-spin" /> Saving…</>
                            : <><Save className="w-3.5 h-3.5" /> Save {sec.label}</>}
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── Version History ─────────────────────────────────────────────────── */}
      <SectionDivider label="Version History" icon={Clock} />
      <div className="bg-white dark:bg-gray-800 border border-[#E4E7EC] dark:border-gray-700 rounded-xl overflow-hidden">
        <ConfigVersionHistoryTab />
      </div>

      {/* ── Change Log ──────────────────────────────────────────────────────── */}
      <SectionDivider label="Change Log" icon={GitCompare} />
      <div className="bg-white dark:bg-gray-800 border border-[#E4E7EC] dark:border-gray-700 rounded-xl overflow-hidden">
        <ConfigDiffTab onMessage={fwd} />
      </div>
    </div>
  );
}

function ReadOnlyRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-[#E4E7EC] bg-[#F8F9FB] px-3 py-2 dark:border-gray-600 dark:bg-gray-700/50">
      <div className="text-[11px] font-semibold uppercase tracking-[0.05em] text-[#6B7280] dark:text-gray-400">{label}</div>
      <div className="mt-1 text-[13px] font-medium text-[#111827] dark:text-gray-100">{value}</div>
    </div>
  );
}
