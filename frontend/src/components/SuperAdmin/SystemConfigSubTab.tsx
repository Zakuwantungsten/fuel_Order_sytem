import { useState, useEffect, useCallback } from 'react';
import {
  Settings, Lock, Database, Bell, Clock, GitCompare,
  RefreshCw, Save, CheckCircle, AlertCircle, ShieldCheck,
  ArrowRight, Monitor, Mail,
} from 'lucide-react';
import UnifiedTabLoader from './common/UnifiedTabLoader';
import AsyncErrorPanel from './common/AsyncErrorPanel';
import { useAsyncState } from '../../hooks/useAsyncState';
import { useActionState } from '../../hooks/useActionState';
import apiClient from '../../services/api';
import { systemAdminAPI } from '../../services/api';
import { systemConfigAPI } from '../../services/systemConfigService';
import type { SystemSettings, PasswordPolicySettings } from '../../services/systemConfigService';
import ConfigVersionHistoryTab from './ConfigVersionHistoryTab';
import ConfigDiffTab from './ConfigDiffTab';

interface Props {
  onMessage: (type: 'success' | 'error', message: string) => void;
  onNavigate?: (section: string) => void;
}

type AccSection = 'general' | 'data' | 'notifications';
type SidebarSection = AccSection | 'history' | 'changelog';

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

function Toggle({ checked, onChange, disabled }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button type="button" onClick={() => !disabled && onChange(!checked)} disabled={disabled}
      className={`relative inline-flex items-center w-9 h-5 rounded-full transition-colors flex-shrink-0 ${
        checked ? 'bg-[#4F46E5] dark:bg-blue-500' : 'bg-[#E4E7EC] dark:bg-gray-600'
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
  const [activeSection, setActiveSection] = useState<SidebarSection>('general');
  const [settings, setSettings] = useState<SystemSettings | null>(null);
  const settingsLoadState = useAsyncState('loading');
  const sectionSaveState = useActionState();
  const runSettingsLoad = settingsLoadState.run;
  const runSectionSave = sectionSaveState.run;
  const [_passwordPolicy, setPasswordPolicy] = useState<PasswordPolicySettings>({
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
  const [generalLastChanged, setGeneralLastChanged] = useState<{ by: string; at: string } | null>(null);
  const [dataLastChanged, setDataLastChanged] = useState<{ by: string; at: string } | null>(null);
  const [logoUploading, setLogoUploading] = useState(false);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);

  // ── Login-security notification state (owned here, moved from SecurityPoliciesSubTab) ──
  const notifLoginSaveAction = useActionState();
  const [notifLoginSettings, setNotifLoginSettings] = useState({
    loginNotifications: true,
    newDeviceAlerts: true,
    deviceTracking: true,
  });

  // ── Alert-routing notification state (owned here, moved from MonitoringAlertsSubTab) ──
  const notifRoutingSaveAction = useActionState();
  const [notifRouting, setNotifRouting] = useState({
    emailEnabled: true,
    emailOnTypes: ['truck_entry_rejected', 'missing_total_liters', 'lpo_created'] as string[],
    alertRecipients: ['super_admin', 'admin'] as string[],
    digestEnabled: false,
    digestSchedule: 'daily' as 'daily' | 'weekly',
  });
  const [_notifRoutingLoaded, setNotifRoutingLoaded] = useState(false);

  const fwd = useCallback((msg: string, type?: 'success' | 'error' | 'info') => {
    onMessage((type || 'error') as 'success' | 'error', msg);
  }, [onMessage]);

  const loadStats = useCallback(async () => {
    setStatsLoading(true);
    try {
      const [hRes, dRes] = await Promise.allSettled([
        apiClient.get('/system-admin/config-history', { params: { page: 1, limit: 1 } }),
        apiClient.get('/system-admin/config-diff',    { params: { page: 1, limit: 1 } }),
      ]);
      setStats({
        snapshots: hRes.status === 'fulfilled' ? (hRes.value.data.pagination?.total ?? 0) : 0,
        changes:   dRes.status === 'fulfilled' ? (dRes.value.data.pagination?.total ?? 0) : 0,
      });

      if (hRes.status === 'fulfilled') {
        const cfgRows = hRes.value.data?.data?.data || hRes.value.data?.data || [];
        const latestCfg = Array.isArray(cfgRows) ? cfgRows[0] : null;
        if (latestCfg) {
          const name = latestCfg.userId
            ? `${latestCfg.userId.firstName || ''} ${latestCfg.userId.lastName || ''}`.trim() || latestCfg.userId.email || 'System'
            : latestCfg.changedBy || latestCfg.username || 'System';
          const meta = { by: name, at: latestCfg.createdAt || latestCfg.timestamp || '' };
          setGeneralLastChanged(meta);
          setDataLastChanged(meta);
        }
      }
    } catch { /* silent */ } finally { setStatsLoading(false); }
  }, []);

  const loadSettings = useCallback(async () => {
    const result = await runSettingsLoad(async () => {
      const [data, policy, secSettings, routingRes] = await Promise.all([
        systemConfigAPI.getSystemSettings(),
        systemConfigAPI.getPasswordPolicy(),
        systemAdminAPI.getSecuritySettings().catch(() => null),
        apiClient.get('/system-admin/notification-config').catch(() => null),
      ]);
      return { data, policy, secSettings, routingRes };
    }, {
      errorMessage: 'Failed to load settings',
    });

    if (result.ok) {
      setSettings(result.data.data);
      setPasswordPolicy(result.data.policy);
      if (result.data.secSettings?.notifications) {
        setNotifLoginSettings(prev => ({ ...prev, ...result.data.secSettings.notifications }));
      }
      if (result.data.routingRes?.data?.data) {
        setNotifRouting(prev => ({ ...prev, ...result.data.routingRes!.data.data }));
      }
      setNotifRoutingLoaded(true);
      return;
    }

    onMessage('error', result.error);
  }, [onMessage, runSettingsLoad]);

  useEffect(() => {
    loadStats();
    loadSettings();
  }, [loadStats, loadSettings]);

  useEffect(() => {
    const preferredSection = sessionStorage.getItem('sa_system_config_focus_section') as SidebarSection | null;
    if (preferredSection && ['general', 'data', 'notifications', 'history', 'changelog'].includes(preferredSection)) {
      setActiveSection(preferredSection);
    }
    if (preferredSection) {
      sessionStorage.removeItem('sa_system_config_focus_section');
    }
  }, []);

  const setSection = (id: SidebarSection) => {
    setActiveSection(id);
    setSectionFeedback(null);
  };

  const upd = <K extends keyof SystemSettings>(section: K, patch: Partial<SystemSettings[K]>) => {
    setSettings(prev => prev ? { ...prev, [section]: { ...prev[section], ...patch } } : prev);
  };

  const saveNotifLogin = async () => {
    const result = await notifLoginSaveAction.run(async () => {
      await systemAdminAPI.updateSecuritySettings('notifications', notifLoginSettings);
    }, { errorMessage: 'Failed to save login security settings' });
    if (result.ok) onMessage('success', 'Login security settings saved');
    else onMessage('error', result.error);
  };

  const saveNotifRouting = async () => {
    const result = await notifRoutingSaveAction.run(async () => {
      await apiClient.put('/system-admin/notification-config', notifRouting);
    }, { errorMessage: 'Failed to save notification routing' });
    if (result.ok) onMessage('success', 'Notification routing saved');
    else onMessage('error', result.error);
  };

  const saveSection = async (id: AccSection) => {
    if (!settings) return;

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

  const handleLogoUpload = async (file: File) => {
    setLogoUploading(true);
    try {
      const result = await systemConfigAPI.uploadLogo(file);
      upd('general', { logoUrl: result.logoUrl });
      setLogoPreview(result.logoUrl);
      onMessage('success', 'Logo uploaded successfully');
    } catch {
      onMessage('error', 'Failed to upload logo');
    } finally {
      setLogoUploading(false);
    }
  };

  // ── Section definitions ────────────────────────────────────────────────────

  const SECTIONS: { id: AccSection; label: string; icon: React.ElementType }[] = [
    { id: 'general',       label: 'General',       icon: Settings },
    { id: 'data',          label: 'Data Lifecycle', icon: Database },
    { id: 'notifications', label: 'Notifications',  icon: Bell     },
  ];

  const activeAccSection = (['general', 'data', 'notifications'] as SidebarSection[]).includes(activeSection)
    ? activeSection as AccSection
    : null;
  const isSaving = savingSection === activeAccSection;
  const fb = sectionFeedback?.section === activeAccSection ? sectionFeedback : null;

  return (
    <div className="flex flex-col">
      {/* ── Stat tiles ──────────────────────────────────────────────────────── */}
      <div className="px-5 pt-5 pb-4 grid grid-cols-2 sm:grid-cols-3 gap-3">
        <StatTile label="Config Snapshots"  value={statsLoading ? '…' : (stats?.snapshots ?? 0)} icon={Clock}     iconBg="#EEF2FF" iconColor="#4F46E5" />
        <StatTile label="Config Changes"    value={statsLoading ? '…' : (stats?.changes   ?? 0)} icon={GitCompare} iconBg="#F5F3FF" iconColor="#7C3AED" />
        <StatTile label="Settings Sections" value={3}                                             icon={Settings}  iconBg="#F0FDF4" iconColor="#16A34A" sub="General · Data · Notifications" />
      </div>

      {/* ── Security quick-link banner ─────────────────────────────────────── */}
      <div className="px-5 pb-4">
        <div className="flex items-center justify-between gap-4 rounded-xl border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20 px-5 py-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-lg bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center flex-shrink-0">
              <Lock className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            </div>
            <div className="min-w-0">
              <div className="text-[13px] font-medium text-blue-900 dark:text-blue-200">Security &amp; Sessions Policy</div>
              <div className="text-[11px] text-blue-700 dark:text-blue-400 mt-0.5">
                Session timeout · Password rules · MFA enforcement · DLP rules — edit in Security Center
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              sessionStorage.setItem('sa_security_preferred_subtab', 'policies');
              onNavigate?.('sa_security');
            }}
            className="shrink-0 flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-[12px] font-semibold text-white transition-colors hover:bg-blue-700"
          >
            Security Center <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* ── Sidebar + Content ────────────────────────────────────────────────── */}
      {settingsLoadState.isLoading && !settings ? (
        <div className="px-5 pb-5">
          <UnifiedTabLoader label="Loading settings..." heightClassName="h-40" />
        </div>
      ) : settingsLoadState.isError && !settings ? (
        <div className="px-5 pb-5">
          <AsyncErrorPanel
            title="System Settings Unavailable"
            message={settingsLoadState.error || 'Failed to load settings'}
            onRetry={loadSettings}
          />
        </div>
      ) : settings ? (
        <div className="flex min-h-[600px]">
          {/* Sidebar */}
          <aside className="w-40 bg-gray-100 dark:bg-gray-900/40 border-r border-gray-200 dark:border-gray-700 flex-shrink-0">
            <nav className="p-1.5 space-y-0.5" role="navigation" aria-label="Configuration sections">
              {/* Settings group */}
              <div className="px-3 pt-3 pb-1 text-[10px] font-medium text-gray-400 dark:text-gray-500 uppercase tracking-widest">
                Settings
              </div>
              {SECTIONS.map(sec => {
                const Icon = sec.icon;
                const isActive = activeSection === sec.id;
                return (
                  <button
                    key={sec.id}
                    onClick={() => setSection(sec.id)}
                    className={`w-full flex items-center gap-2 px-3.5 py-1.5 text-[13px] rounded-lg transition-colors ${
                      isActive
                        ? 'border-l-2 border-orange-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 font-medium'
                        : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800/50'
                    }`}
                  >
                    <Icon className="w-4 h-4 flex-shrink-0" />
                    <span className="truncate">{sec.label}</span>
                  </button>
                );
              })}

              {/* Utilities group */}
              <div className="px-3 pt-5 pb-1 text-[10px] font-medium text-gray-400 dark:text-gray-500 uppercase tracking-widest">
                Utilities
              </div>
              <button
                onClick={() => setSection('history')}
                className={`w-full flex items-center gap-2 px-3.5 py-1.5 text-[13px] rounded-lg transition-colors ${
                  activeSection === 'history'
                    ? 'border-l-2 border-orange-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 font-medium'
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800/50'
                }`}
              >
                <Clock className="w-4 h-4 flex-shrink-0" />
                <span className="truncate">History</span>
              </button>
              <button
                onClick={() => setSection('changelog')}
                className={`w-full flex items-center gap-2 px-3.5 py-1.5 text-[13px] rounded-lg transition-colors ${
                  activeSection === 'changelog'
                    ? 'border-l-2 border-orange-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 font-medium'
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800/50'
                }`}
              >
                <GitCompare className="w-4 h-4 flex-shrink-0" />
                <span className="truncate">Change Log</span>
              </button>
            </nav>
          </aside>

          {/* Main content area */}
          <div className="flex-1 p-5 bg-gray-50 dark:bg-gray-900 overflow-auto">
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
            {activeSection === 'general' && (
              <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-5 max-w-2xl">
                <h2 className="text-[13px] font-medium text-gray-900 dark:text-gray-100 mb-4">General Settings</h2>
                
                {generalLastChanged && (
                  <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600 text-[11px] text-gray-500 dark:text-gray-400 mb-4">
                    <Clock className="w-3 h-3 flex-shrink-0 text-gray-400 dark:text-gray-500" />
                    Last changed by&nbsp;<span className="font-semibold text-gray-700 dark:text-gray-300">{generalLastChanged.by}</span>
                    {generalLastChanged.at && <>&nbsp;·&nbsp;{new Date(generalLastChanged.at).toLocaleString()}</>}
                  </div>
                )}

                <div className="space-y-4">
                  <div className="flex flex-col gap-1.5">
                    <label className={labelCls}>System Name</label>
                    <input className={inputCls} value={settings.general.systemName}
                      onChange={e => upd('general', { systemName: e.target.value })} />
                  </div>
                  
                  <div className="grid grid-cols-2 gap-3">
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

                  {/* ── Company Branding ── */}
                  <div className="pt-3 border-t border-[#E4E7EC] dark:border-gray-700">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.05em] text-[#4F46E5] dark:text-indigo-400 mb-3">Company Branding</p>
                    <div className="space-y-3">
                      <div className="flex flex-col gap-1.5">
                        <label className={labelCls}>Company Name</label>
                        <input className={inputCls} value={settings.general.companyName ?? ''}
                          onChange={e => upd('general', { companyName: e.target.value })} placeholder="e.g. TAHMEED" />
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <label className={labelCls}>Company Website</label>
                        <input className={inputCls} value={settings.general.companyWebsite ?? ''}
                          onChange={e => upd('general', { companyWebsite: e.target.value })} placeholder="e.g. www.example.co.ke" />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="flex flex-col gap-1.5">
                          <label className={labelCls}>Company Email</label>
                          <input className={inputCls} type="email" value={settings.general.companyEmail ?? ''}
                            onChange={e => upd('general', { companyEmail: e.target.value })} placeholder="info@example.co.ke" />
                        </div>
                        <div className="flex flex-col gap-1.5">
                          <label className={labelCls}>Company Phone</label>
                          <input className={inputCls} value={settings.general.companyPhone ?? ''}
                            onChange={e => upd('general', { companyPhone: e.target.value })} placeholder="+254 700 000 000" />
                        </div>
                      </div>

                      {/* Logo upload */}
                      <div className="flex flex-col gap-1.5">
                        <label className={labelCls}>Company Logo</label>
                        <div className="flex items-center gap-3">
                          {(logoPreview || settings.general.logoUrl) && (
                            <img
                              src={logoPreview || settings.general.logoUrl}
                              alt="Company logo preview"
                              className="h-12 w-auto max-w-[96px] rounded border border-gray-200 dark:border-gray-600 object-contain bg-white p-1"
                            />
                          )}
                          <label className={`flex items-center gap-2 px-3 py-2 text-[12px] font-medium rounded-lg border border-dashed border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:border-orange-400 hover:text-orange-600 cursor-pointer transition-colors ${logoUploading ? 'opacity-50 pointer-events-none' : ''}`}>
                            {logoUploading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Monitor className="w-3.5 h-3.5" />}
                            {logoUploading ? 'Uploading…' : 'Upload Logo'}
                            <input
                              type="file"
                              accept="image/png,image/jpeg,image/webp,image/svg+xml"
                              className="hidden"
                              disabled={logoUploading}
                              onChange={e => { const f = e.target.files?.[0]; if (f) handleLogoUpload(f); e.target.value = ''; }}
                            />
                          </label>
                          <span className="text-[10px] text-gray-400 dark:text-gray-500">PNG, JPG, SVG · max 2 MB</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>{/* end space-y-4 */}

                <div className="flex justify-end mt-5 pt-4 border-t border-[#E4E7EC] dark:border-gray-700">
                  <button
                    onClick={() => saveSection('general')}
                    disabled={isSaving}
                    className="flex items-center gap-2 px-5 py-2 text-[13px] font-semibold text-white rounded-lg bg-orange-600 hover:bg-orange-700 transition-colors disabled:opacity-60"
                  >
                    {isSaving
                      ? <><RefreshCw className="w-3.5 h-3.5 animate-spin" /> Saving…</>
                      : <><Save className="w-3.5 h-3.5" /> Save Settings</>}
                  </button>
                </div>
              </div>
            )}

            {/* ── DATA LIFECYCLE ── */}
            {activeSection === 'data' && (
              <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-5 max-w-2xl">
                <h2 className="text-[13px] font-medium text-gray-900 dark:text-gray-100 mb-4">Data Lifecycle Policy</h2>
                
                <div className="rounded-lg border border-teal-200 bg-teal-50 p-3 dark:border-teal-800 dark:bg-teal-900/20 mb-4">
                  <div className="text-[12px] font-semibold text-teal-800 dark:text-teal-300">Canonical Data Lifecycle Editor</div>
                  <p className="mt-1 text-[12px] text-teal-700 dark:text-teal-300/90">
                    Archival, trash retention, and backup retention policy are managed here. Operational tabs are read-only for policy values.
                  </p>
                  {dataLastChanged && (
                    <p className="mt-1.5 flex items-center gap-1 text-[11px] text-teal-600 dark:text-teal-400">
                      <Clock className="w-3 h-3 flex-shrink-0" />
                      Last changed by&nbsp;<span className="font-semibold">{dataLastChanged.by}</span>
                      {dataLastChanged.at && <>&nbsp;·&nbsp;{new Date(dataLastChanged.at).toLocaleString()}</>}
                    </p>
                  )}
                </div>

                <div className="space-y-4">
                  <div className="flex items-center justify-between p-3 bg-[#F8F9FB] dark:bg-gray-700/50 rounded-lg border border-[#E4E7EC] dark:border-gray-600">
                    <div>
                      <div className="text-[13px] font-medium text-[#111827] dark:text-gray-100">Enable Archival</div>
                      <div className="text-[11px] text-[#9CA3AF] dark:text-gray-400 mt-0.5">Automatically archive old records based on retention policy</div>
                    </div>
                    <Toggle checked={settings.data.archivalEnabled}
                      onChange={v => upd('data', { archivalEnabled: v })} />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
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
                  </div>

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

                <div className="flex justify-end mt-5 pt-4 border-t border-[#E4E7EC] dark:border-gray-700">
                  <button
                    onClick={() => saveSection('data')}
                    disabled={isSaving}
                    className="flex items-center gap-2 px-5 py-2 text-[13px] font-semibold text-white rounded-lg bg-orange-600 hover:bg-orange-700 transition-colors disabled:opacity-60"
                  >
                    {isSaving
                      ? <><RefreshCw className="w-3.5 h-3.5 animate-spin" /> Saving…</>
                      : <><Save className="w-3.5 h-3.5" /> Save Settings</>}
                  </button>
                </div>
              </div>
            )}

            {/* ── NOTIFICATIONS ── */}
            {activeSection === 'notifications' && (
              <div className="space-y-4 max-w-4xl">
                <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-5">
                  <h2 className="text-[13px] font-medium text-gray-900 dark:text-gray-100 mb-4">Notifications</h2>

                  {/* Sub-section 1: Login Security */}
                  <div className="rounded-xl border border-[#E4E7EC] dark:border-gray-700 overflow-hidden mb-6">
                    <div className="flex items-center gap-2 px-4 py-2.5 bg-[#F8F9FB] dark:bg-gray-700/60 border-b border-[#E4E7EC] dark:border-gray-700">
                      <ShieldCheck className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                      <span className="text-[12px] font-semibold text-[#111827] dark:text-gray-100">Login Security Notifications</span>
                    </div>
                    <div className="p-4 space-y-3">
                      {[
                        { key: 'deviceTracking',      label: 'Device & Session Tracking',  sub: 'Track devices used to access the system' },
                        { key: 'loginNotifications',  label: 'Login Notification Emails',   sub: 'Send emails on each successful login' },
                        { key: 'newDeviceAlerts',     label: 'New Device Alerts',           sub: 'Alert when login from an unrecognised device' },
                      ].map(f => (
                        <div key={f.key} className="flex items-center justify-between p-3 bg-[#F8F9FB] dark:bg-gray-700/50 rounded-lg border border-[#E4E7EC] dark:border-gray-600">
                          <div>
                            <div className="text-[13px] font-medium text-[#111827] dark:text-gray-100">{f.label}</div>
                            <div className="text-[11px] text-[#9CA3AF] dark:text-gray-400 mt-0.5">{f.sub}</div>
                          </div>
                          <Toggle
                            checked={(notifLoginSettings as any)[f.key]}
                            onChange={v => setNotifLoginSettings(prev => ({ ...prev, [f.key]: v }))}
                          />
                        </div>
                      ))}
                      <div className="flex justify-end pt-1">
                        <button
                          type="button"
                          onClick={saveNotifLogin}
                          disabled={notifLoginSaveAction.isPending}
                          className="flex items-center gap-2 px-4 py-2 text-[12px] font-semibold text-white rounded-lg bg-blue-600 hover:bg-blue-700 transition-colors disabled:opacity-60"
                        >
                          {notifLoginSaveAction.isPending
                            ? <><RefreshCw className="w-3.5 h-3.5 animate-spin" /> Saving…</>
                            : <><Save className="w-3.5 h-3.5" /> Save Login Settings</>}
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Sub-section 2: Alert Routing */}
                  <div className="rounded-xl border border-[#E4E7EC] dark:border-gray-700 overflow-hidden mb-6">
                    <div className="flex items-center gap-2 px-4 py-2.5 bg-[#F8F9FB] dark:bg-gray-700/60 border-b border-[#E4E7EC] dark:border-gray-700">
                      <Mail className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                      <span className="text-[12px] font-semibold text-[#111827] dark:text-gray-100">Alert Routing</span>
                    </div>
                    <div className="p-4 space-y-4">
                      <div className="flex items-center justify-between p-3 bg-[#F8F9FB] dark:bg-gray-700/50 rounded-lg border border-[#E4E7EC] dark:border-gray-600">
                        <div>
                          <div className="text-[13px] font-medium text-[#111827] dark:text-gray-100">Email Alerts Enabled</div>
                          <div className="text-[11px] text-[#9CA3AF] dark:text-gray-400 mt-0.5">Send email notifications for system events</div>
                        </div>
                        <Toggle
                          checked={notifRouting.emailEnabled}
                          onChange={v => setNotifRouting(prev => ({ ...prev, emailEnabled: v }))}
                        />
                      </div>

                      <div>
                        <div className={`${labelCls} mb-2`}>Alert Recipients (roles)</div>
                        <div className="flex flex-wrap gap-2">
                          {[
                            { id: 'super_admin', label: 'Super Admin' },
                            { id: 'admin',       label: 'Admin' },
                            { id: 'manager',     label: 'Manager' },
                            { id: 'supervisor',  label: 'Supervisor' },
                          ].map(r => {
                            const active = notifRouting.alertRecipients.includes(r.id);
                            return (
                              <button
                                key={r.id}
                                type="button"
                                onClick={() => setNotifRouting(prev => ({
                                  ...prev,
                                  alertRecipients: active
                                    ? prev.alertRecipients.filter(x => x !== r.id)
                                    : [...prev.alertRecipients, r.id],
                                }))}
                                className={`px-3 py-1 rounded-full text-[12px] font-medium border transition-colors ${active ? 'bg-amber-600 text-white border-amber-600' : 'bg-white dark:bg-gray-800 text-[#374151] dark:text-gray-300 border-[#D1D5DB] dark:border-gray-600 hover:border-amber-400'}`}
                              >
                                {r.label}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      <div>
                        <div className={`${labelCls} mb-2`}>Email on Events</div>
                        <div className="flex flex-wrap gap-2">
                          {[
                            { id: 'truck_entry_rejected',    label: 'Truck Entry Rejected' },
                            { id: 'missing_total_liters',    label: 'Missing Total Liters' },
                            { id: 'lpo_created',             label: 'LPO Created' },
                            { id: 'lpo_approved',            label: 'LPO Approved' },
                            { id: 'fuel_record_flagged',     label: 'Fuel Record Flagged' },
                            { id: 'delivery_order_created',  label: 'Delivery Order Created' },
                            { id: 'user_account_locked',     label: 'User Account Locked' },
                            { id: 'failed_login_threshold',  label: 'Failed Login Threshold' },
                            { id: 'maintenance_mode_changed',label: 'Maintenance Mode Changed' },
                            { id: 'config_changed',          label: 'Config Changed' },
                            { id: 'bulk_operation',          label: 'Bulk Operation' },
                          ].map(ev => {
                            const active = notifRouting.emailOnTypes.includes(ev.id);
                            return (
                              <button
                                key={ev.id}
                                type="button"
                                onClick={() => setNotifRouting(prev => ({
                                  ...prev,
                                  emailOnTypes: active
                                    ? prev.emailOnTypes.filter(x => x !== ev.id)
                                    : [...prev.emailOnTypes, ev.id],
                                }))}
                                className={`px-2.5 py-1 rounded-full text-[11px] font-medium border transition-colors ${active ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-300 border-amber-300 dark:border-amber-700' : 'bg-white dark:bg-gray-800 text-[#374151] dark:text-gray-400 border-[#D1D5DB] dark:border-gray-600 hover:border-amber-300'}`}
                              >
                                {ev.label}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="flex items-center justify-between p-3 bg-[#F8F9FB] dark:bg-gray-700/50 rounded-lg border border-[#E4E7EC] dark:border-gray-600">
                          <div>
                            <div className="text-[13px] font-medium text-[#111827] dark:text-gray-100">Digest Emails</div>
                            <div className="text-[11px] text-[#9CA3AF] dark:text-gray-400 mt-0.5">Bundle alerts into periodic digests</div>
                          </div>
                          <Toggle
                            checked={notifRouting.digestEnabled}
                            onChange={v => setNotifRouting(prev => ({ ...prev, digestEnabled: v }))}
                          />
                        </div>
                        <div className="flex flex-col gap-1.5">
                          <label className={`${labelCls} ${!notifRouting.digestEnabled ? 'opacity-40' : ''}`}>Digest Schedule</label>
                          <select
                            disabled={!notifRouting.digestEnabled}
                            className={`${inputCls} ${!notifRouting.digestEnabled ? 'opacity-40 cursor-not-allowed' : ''}`}
                            value={notifRouting.digestSchedule}
                            onChange={e => setNotifRouting(prev => ({ ...prev, digestSchedule: e.target.value as 'daily' | 'weekly' }))}
                          >
                            <option value="daily">Daily</option>
                            <option value="weekly">Weekly</option>
                          </select>
                        </div>
                      </div>

                      <div className="flex justify-end">
                        <button
                          type="button"
                          onClick={saveNotifRouting}
                          disabled={notifRoutingSaveAction.isPending}
                          className="flex items-center gap-2 px-4 py-2 text-[12px] font-semibold text-white rounded-lg bg-amber-600 hover:bg-amber-700 transition-colors disabled:opacity-60"
                        >
                          {notifRoutingSaveAction.isPending
                            ? <><RefreshCw className="w-3.5 h-3.5 animate-spin" /> Saving…</>
                            : <><Save className="w-3.5 h-3.5" /> Save Alert Routing</>}
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Sub-section 3: System Notifications */}
                  <div className="rounded-xl border border-[#E4E7EC] dark:border-gray-700 overflow-hidden">
                    <div className="flex items-center gap-2 px-4 py-2.5 bg-[#F8F9FB] dark:bg-gray-700/60 border-b border-[#E4E7EC] dark:border-gray-700">
                      <Monitor className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                      <span className="text-[12px] font-semibold text-[#111827] dark:text-gray-100">System Notifications</span>
                    </div>
                    <div className="p-4 space-y-3">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {[
                          { key: 'emailNotifications',  label: 'Email Notifications',    sub: 'Master switch for outbound email' },
                          { key: 'criticalAlerts',      label: 'Critical Alerts',         sub: 'Immediate email on critical system events' },
                          { key: 'dailySummary',        label: 'Daily Summary',           sub: 'End-of-day summary digest' },
                          { key: 'weeklyReport',        label: 'Weekly Report',           sub: 'Weekly performance report email' },
                          { key: 'sendCredentialsEmail',label: 'Send Credentials Email',  sub: 'Email login credentials to new users' },
                        ].map(f => (
                          <div key={f.key} className="flex items-center justify-between p-3 bg-[#F8F9FB] dark:bg-gray-700/50 rounded-lg border border-[#E4E7EC] dark:border-gray-600">
                            <div>
                              <div className="text-[13px] font-medium text-[#111827] dark:text-gray-100">{f.label}</div>
                              <div className="text-[11px] text-[#9CA3AF] dark:text-gray-400 mt-0.5">{f.sub}</div>
                            </div>
                            <Toggle
                              checked={!!(settings.notifications as any)[f.key]}
                              onChange={v => upd('notifications', { [f.key]: v } as any)}
                            />
                          </div>
                        ))}
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        {[
                          { key: 'slowQueryThreshold',     label: 'Slow Query Threshold (ms)', min: 100 },
                          { key: 'storageWarningThreshold',label: 'Storage Warning Threshold (%)', min: 1, max: 100 },
                          { key: 'credentialsExpiryHours', label: 'Temp Credentials Expiry (hours, 0 = never)', min: 0 },
                        ].map(f => (
                          <div key={f.key} className="flex flex-col gap-1.5">
                            <label className={labelCls}>{f.label}</label>
                            <input
                              type="number"
                              min={f.min}
                              max={f.max}
                              className={inputCls}
                              value={(settings.notifications as any)[f.key]}
                              onChange={e => upd('notifications', { [f.key]: Number(e.target.value) } as any)}
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="flex justify-end mt-5 pt-4 border-t border-[#E4E7EC] dark:border-gray-700">
                    <button
                      onClick={() => saveSection('notifications')}
                      disabled={isSaving}
                      className="flex items-center gap-2 px-5 py-2 text-[13px] font-semibold text-white rounded-lg bg-orange-600 hover:bg-orange-700 transition-colors disabled:opacity-60"
                    >
                      {isSaving
                        ? <><RefreshCw className="w-3.5 h-3.5 animate-spin" /> Saving…</>
                        : <><Save className="w-3.5 h-3.5" /> Save Settings</>}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* ── VERSION HISTORY ── */}
            {activeSection === 'history' && (
              <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
                <ConfigVersionHistoryTab />
              </div>
            )}

            {/* ── CHANGE LOG ── */}
            {activeSection === 'changelog' && (
              <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
                <ConfigDiffTab onMessage={fwd} />
              </div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

