import { useState, useEffect } from 'react';
import {
  Shield, Network, Key, KeyRound, Loader2,
  ShieldBan, Ban,
} from 'lucide-react';
import IPRulesTab from './IPRulesTab';
import SecurityBlocklistTab from './SecurityBlocklistTab';
import ApiTokenManagerTab from './ApiTokenManagerTab';
import BreakGlassTab from './BreakGlassTab';
import RolePermissionMatrix from './RolePermissionMatrix';
import ConditionalAccessPolicies from './ConditionalAccessPolicies';

/* ───────── Types ───────── */

interface Props {
  onMessage: (type: 'success' | 'error', message: string) => void;
}

type Section = 'ip' | 'tokens' | 'breakglass' | 'permissions' | 'conditional';

interface OverviewStats {
  manualRules: number;
  activeBlocks: number;
  apiTokens: number;
  breakGlassAccounts: number;
}

const SECTIONS: { id: Section; label: string; shortLabel: string; icon: React.ReactNode }[] = [
  { id: 'ip',          label: 'IP Management',     shortLabel: 'IP',          icon: <Network className="w-4 h-4" /> },
  { id: 'tokens',      label: 'API Tokens',        shortLabel: 'Tokens',      icon: <Key className="w-4 h-4" /> },
  { id: 'breakglass',  label: 'Emergency Access',  shortLabel: 'Emergency',   icon: <KeyRound className="w-4 h-4" /> },
  { id: 'permissions', label: 'Permissions',        shortLabel: 'Perms',       icon: <Shield className="w-4 h-4" /> },
  { id: 'conditional', label: 'Conditional Access', shortLabel: 'Conditional', icon: <ShieldBan className="w-4 h-4" /> },
];

/* ───────── Component ───────── */

export default function SecurityAccessControlSubTab({ onMessage }: Props) {
  const [section, setSection] = useState<Section>('ip');
  const [stats, setStats] = useState<OverviewStats | null>(null);
  const [loadingStats, setLoadingStats] = useState(true);
  const [ipView, setIpView] = useState<'rules' | 'blocklist'>('rules');

  const authHeaders = () => ({
    'Content-Type': 'application/json',
    Authorization: `Bearer ${sessionStorage.getItem('fuel_order_token')}`,
  });

  const loadStats = async () => {
    setLoadingStats(true);
    try {
      const [blocklistRes, tokensRes, breakGlassRes, ipRulesRes] = await Promise.all([
        fetch('/api/v1/system-admin/security-blocklist/stats', { headers: authHeaders() }).then(r => r.json()).catch(() => null),
        fetch('/api/v1/system-admin/api-tokens', { headers: authHeaders() }).then(r => r.json()).catch(() => null),
        fetch('/api/v1/system-admin/break-glass', { headers: authHeaders() }).then(r => r.json()).catch(() => null),
        fetch('/api/v1/system-admin/ip-rules', { headers: authHeaders() }).then(r => r.json()).catch(() => null),
      ]);

      setStats({
        manualRules: Array.isArray(ipRulesRes?.data) ? ipRulesRes.data.length : ipRulesRes?.data?.rules?.length ?? 0,
        activeBlocks: blocklistRes?.data?.activeBlocks ?? 0,
        apiTokens: Array.isArray(tokensRes?.data) ? tokensRes.data.filter((t: any) => !t.revoked).length : 0,
        breakGlassAccounts: Array.isArray(breakGlassRes?.data) ? breakGlassRes.data.length : 0,
      });
    } catch {
      // Stats are non-critical
    } finally {
      setLoadingStats(false);
    }
  };

  useEffect(() => { loadStats(); }, []);

  const reversedOnMessage = (msg: string, type?: 'success' | 'error' | 'info') => {
    onMessage((type || 'error') as 'success' | 'error', msg);
  };

  const STAT_CARDS = [
    { label: 'IP Rules', value: stats?.manualRules ?? 0, icon: <Network className="w-4 h-4 text-indigo-500" />, color: 'from-indigo-50 to-indigo-100/50 dark:from-indigo-900/20 dark:to-indigo-900/10', valueColor: 'text-indigo-600 dark:text-indigo-400' },
    { label: 'Active Blocks', value: stats?.activeBlocks ?? 0, icon: <Ban className="w-4 h-4 text-red-500" />, color: 'from-red-50 to-red-100/50 dark:from-red-900/20 dark:to-red-900/10', valueColor: 'text-red-600 dark:text-red-400' },
    { label: 'Active Tokens', value: stats?.apiTokens ?? 0, icon: <Key className="w-4 h-4 text-blue-500" />, color: 'from-blue-50 to-blue-100/50 dark:from-blue-900/20 dark:to-blue-900/10', valueColor: 'text-blue-600 dark:text-blue-400' },
    { label: 'Break-Glass', value: stats?.breakGlassAccounts ?? 0, icon: <KeyRound className="w-4 h-4 text-amber-500" />, color: 'from-amber-50 to-amber-100/50 dark:from-amber-900/20 dark:to-amber-900/10', valueColor: 'text-amber-600 dark:text-amber-400' },
  ];

  return (
    <div className="space-y-6">
      {/* Overview Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {STAT_CARDS.map(card => (
          <div key={card.label} className={`bg-gradient-to-br ${card.color} rounded-xl p-4 border border-gray-100 dark:border-gray-700`}>
            <div className="flex items-center gap-2 mb-1">
              {card.icon}
              <span className="text-xs font-medium text-gray-500 dark:text-gray-400">{card.label}</span>
            </div>
            <p className={`text-2xl font-bold ${card.valueColor}`}>
              {loadingStats ? <Loader2 className="w-5 h-5 animate-spin" /> : card.value}
            </p>
          </div>
        ))}
      </div>

      {/* Section Navigation + Content */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
        <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700">
          <div className="flex gap-1 bg-gray-100 dark:bg-gray-700 rounded-lg p-1">
            {SECTIONS.map(s => (
              <button
                key={s.id}
                onClick={() => setSection(s.id)}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-all flex-1 justify-center ${
                  section === s.id
                    ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-white shadow-sm'
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                }`}>
                {s.icon}
                <span className="hidden lg:inline">{s.label}</span>
                <span className="lg:hidden">{s.shortLabel}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="p-5">
          {section === 'ip' && (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500 dark:text-gray-400 font-medium">View:</span>
                <div className="flex bg-gray-100 dark:bg-gray-700 rounded-lg p-0.5">
                  <button
                    onClick={() => setIpView('rules')}
                    className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                      ipView === 'rules'
                        ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-white shadow-sm'
                        : 'text-gray-500 dark:text-gray-400'
                    }`}>
                    <Shield className="w-3.5 h-3.5 inline mr-1" />
                    Manual Rules
                  </button>
                  <button
                    onClick={() => setIpView('blocklist')}
                    className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                      ipView === 'blocklist'
                        ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-white shadow-sm'
                        : 'text-gray-500 dark:text-gray-400'
                    }`}>
                    <ShieldBan className="w-3.5 h-3.5 inline mr-1" />
                    Auto-Blocked &amp; Reputation
                  </button>
                </div>
              </div>

              {ipView === 'rules' && <IPRulesTab onMessage={reversedOnMessage} />}
              {ipView === 'blocklist' && <SecurityBlocklistTab />}
            </div>
          )}

          {section === 'tokens' && <ApiTokenManagerTab />}
          {section === 'breakglass' && <BreakGlassTab />}
          {section === 'permissions' && <RolePermissionMatrix />}
          {section === 'conditional' && <ConditionalAccessPolicies />}
        </div>
      </div>
    </div>
  );
}
