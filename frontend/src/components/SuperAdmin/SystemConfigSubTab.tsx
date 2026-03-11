import { useState, useEffect, useCallback } from 'react';
import {
  Settings, Lock, Database, Bell, Clock, GitCompare,
  ChevronDown, RefreshCw, Save, CheckCircle, AlertCircle,
} from 'lucide-react';
import apiClient from '../../services/api';
import { systemConfigAPI } from '../../services/systemConfigService';
import type { SystemSettings, PasswordPolicySettings } from '../../services/systemConfigService';
import ConfigVersionHistoryTab from './ConfigVersionHistoryTab';
import ConfigDiffTab from './ConfigDiffTab';

interface Props {
  onMessage: (type: 'success' | 'error', message: string) => void;
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

export default function SystemConfigSubTab({ onMessage }: Props) {
  const [openSection, setOpenSection] = useState<AccSection | null>('general');
  const [settings, setSettings] = useState<SystemSettings | null>(null);
  const [loadingSettings, setLoadingSettings] = useState(true);
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
    } catch { /* silent */ } finally { setStatsLoading(false); }
  }, []);

  const loadSettings = useCallback(async () => {
    setLoadingSettings(true);
    try {
      const [data, policy] = await Promise.all([
        systemConfigAPI.getSystemSettings(),
        systemConfigAPI.getPasswordPolicy(),
      ]);
      setSettings(data);
      setPasswordPolicy(policy);
    } catch (e: any) {
      onMessage('error', e.response?.data?.message || 'Failed to load settings');
    } finally { setLoadingSettings(false); }
  }, [onMessage]);

  useEffect(() => {
    loadStats();
    loadSettings();
  }, [loadStats, loadSettings]);

  const toggleSection = (id: AccSection) => {
    setOpenSection(prev => prev === id ? null : id);
    setSectionFeedback(null);
  };

  const upd = <K extends keyof SystemSettings>(section: K, patch: Partial<SystemSettings[K]>) => {
    setSettings(prev => prev ? { ...prev, [section]: { ...prev[section], ...patch } } : prev);
  };

  const saveSection = async (id: AccSection) => {
    if (!settings) return;
    setSavingSection(id);
    setSectionFeedback(null);
    try {
      switch (id) {
        case 'general':       await systemConfigAPI.updateGeneralSettings(settings.general);       break;
        case 'security':
          await systemConfigAPI.updateSecuritySettings(settings.session);
          await systemConfigAPI.updatePasswordPolicy(passwordPolicy);
          break;
        case 'data':          await systemConfigAPI.updateDataRetentionSettings(settings.data);    break;
        case 'notifications': await systemConfigAPI.updateNotificationSettings(settings.notifications); break;
      }
      setSectionFeedback({ section: id, type: 'success', message: 'Settings saved successfully' });
      onMessage('success', 'Settings saved');
      setTimeout(() => setSectionFeedback(s => s?.section === id ? null : s), 4000);
    } catch (e: any) {
      const msg = e.response?.data?.message || 'Save failed';
      setSectionFeedback({ section: id, type: 'error', message: msg });
      onMessage('error', msg);
    } finally { setSavingSection(null); }
  };

  // ── Section definitions ────────────────────────────────────────────────────

  const SECTIONS: { id: AccSection; label: string; sub: string; icon: React.ElementType; accent: string; accentBg: string }[] = [
    { id: 'general',       label: 'General',              sub: 'System name, timezone, date format, language',                     icon: Settings, accent: '#4F46E5', accentBg: '#EEF2FF' },
    { id: 'security',      label: 'Security & Sessions',  sub: 'Timeouts, password policy, login attempts, multi-session',         icon: Lock,     accent: '#2563EB', accentBg: '#EFF6FF' },
    { id: 'data',          label: 'Data Retention',       sub: 'Archival policy, audit logs, trash, backup schedule',              icon: Database, accent: '#0D9488', accentBg: '#F0FDFA' },
    { id: 'notifications', label: 'Notifications',        sub: 'Email toggles, alert recipients, digests, warning thresholds',     icon: Bell,     accent: '#D97706', accentBg: '#FFFBEB' },
  ];

  return (
    <div className="p-6 space-y-6">
      {/* ── Stat tiles ──────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        <StatTile label="Config Snapshots"   value={statsLoading ? '…' : (stats?.snapshots ?? 0)} icon={Clock}      iconBg="#EEF2FF" iconColor="#4F46E5" />
        <StatTile label="Config Changes"     value={statsLoading ? '…' : (stats?.changes   ?? 0)} icon={GitCompare}  iconBg="#F5F3FF" iconColor="#7C3AED" />
        <StatTile label="Settings Sections"  value={4}                                             icon={Settings}   iconBg="#F0FDF4" iconColor="#16A34A" sub="General · Security · Data · Notifications" />
      </div>

      {/* ── Settings accordion ─────────────────────────────────────────────── */}
      {loadingSettings ? (
        <div className="flex items-center justify-center py-12">
          <RefreshCw className="w-5 h-5 text-[#4F46E5] animate-spin" />
          <span className="ml-2 text-[13px] text-[#6B7280] dark:text-gray-400">Loading settings…</span>
        </div>
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
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        {[
                          { key: 'sessionTimeout',      label: 'Session Timeout (min)',           min: 5 },
                          { key: 'jwtExpiry',           label: 'JWT Expiry (min)',                min: 5 },
                          { key: 'refreshTokenExpiry',  label: 'Refresh Token Expiry (days)',     min: 1 },
                          { key: 'maxLoginAttempts',    label: 'Max Login Attempts',             min: 1 },
                          { key: 'lockoutDuration',     label: 'Lockout Duration (min)',         min: 1 },
                        ].map(f => (
                          <div key={f.key} className="flex flex-col gap-1.5">
                            <label className={labelCls}>{f.label}</label>
                            <input type="number" min={f.min} className={inputCls}
                              value={(settings.session as any)[f.key]}
                              onChange={e => upd('session', { [f.key]: Number(e.target.value) } as any)} />
                          </div>
                        ))}
                        <div className="flex items-center justify-between p-3 bg-[#F8F9FB] dark:bg-gray-700/50 rounded-lg border border-[#E4E7EC] dark:border-gray-600">
                          <div>
                            <div className="text-[13px] font-medium text-[#111827] dark:text-gray-100">Allow Multiple Sessions</div>
                            <div className="text-[11px] text-[#9CA3AF] dark:text-gray-400 mt-0.5">Users can be logged in on multiple devices simultaneously</div>
                          </div>
                          <Toggle checked={settings.session.allowMultipleSessions}
                            onChange={v => upd('session', { allowMultipleSessions: v })} />
                        </div>

                        {/* ── Password Policy ── */}
                        <div className="sm:col-span-2">
                          <SectionDivider label="Password Policy" icon={Lock} />
                        </div>
                        <div className="flex flex-col gap-1.5">
                          <label className={labelCls}>Minimum Length</label>
                          <input type="number" min={6} max={128} className={inputCls}
                            value={passwordPolicy.minLength}
                            onChange={e => setPasswordPolicy(p => ({ ...p, minLength: Number(e.target.value) }))} />
                        </div>
                        <div className="flex flex-col gap-1.5">
                          <label className={labelCls}>Password History (last N)</label>
                          <input type="number" min={0} max={24} className={inputCls}
                            value={passwordPolicy.historyCount}
                            onChange={e => setPasswordPolicy(p => ({ ...p, historyCount: Number(e.target.value) }))} />
                        </div>
                        <div className="flex flex-col gap-1.5">
                          <label className={labelCls}>Expiration (days, 0 = never)</label>
                          <input type="number" min={0} className={inputCls}
                            value={passwordPolicy.expirationDays}
                            onChange={e => setPasswordPolicy(p => ({ ...p, expirationDays: Number(e.target.value) }))} />
                        </div>
                        {[
                          { key: 'requireUppercase',    label: 'Require Uppercase',    sub: 'At least one A–Z character' },
                          { key: 'requireLowercase',    label: 'Require Lowercase',    sub: 'At least one a–z character' },
                          { key: 'requireNumbers',      label: 'Require Numbers',      sub: 'At least one 0–9 digit' },
                          { key: 'requireSpecialChars', label: 'Require Special Chars', sub: 'At least one !@#$… symbol' },
                        ].map(f => (
                          <div key={f.key} className="flex items-center justify-between p-3 bg-[#F8F9FB] dark:bg-gray-700/50 rounded-lg border border-[#E4E7EC] dark:border-gray-600">
                            <div>
                              <div className="text-[13px] font-medium text-[#111827] dark:text-gray-100">{f.label}</div>
                              <div className="text-[11px] text-[#9CA3AF] dark:text-gray-400 mt-0.5">{f.sub}</div>
                            </div>
                            <Toggle checked={(passwordPolicy as any)[f.key]}
                              onChange={v => setPasswordPolicy(p => ({ ...p, [f.key]: v }))} />
                          </div>
                        ))}
                      </div>
                    )}

                    {/* ── DATA RETENTION ── */}
                    {sec.id === 'data' && (
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
                    )}

                    {/* ── NOTIFICATIONS ── */}
                    {sec.id === 'notifications' && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        {[
                          { key: 'emailNotifications', label: 'Email Notifications',  sub: 'Send transactional emails on key events' },
                          { key: 'criticalAlerts',      label: 'Critical Alerts',      sub: 'Immediate notifications for system errors' },
                          { key: 'dailySummary',        label: 'Daily Summary',        sub: 'Send summary digest each morning' },
                          { key: 'weeklyReport',        label: 'Weekly Report',        sub: 'Send weekly analytics & activity report' },
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
