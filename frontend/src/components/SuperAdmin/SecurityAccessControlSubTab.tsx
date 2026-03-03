import { useState, useEffect } from 'react';
import {
  Shield, Network, Key, KeyRound, Loader2,
  ShieldBan, Ban, Activity, RefreshCw,
} from 'lucide-react';
import IPRulesTab from './IPRulesTab';
import SecurityBlocklistTab from './SecurityBlocklistTab';
import ApiTokenManagerTab from './ApiTokenManagerTab';
import BreakGlassTab from './BreakGlassTab';

/* ───────── Types ───────── */

interface Props {
  onMessage: (type: 'success' | 'error', message: string) => void;
}

type Section = 'ip' | 'tokens' | 'breakglass';

interface OverviewStats {
  manualRules: number;
  activeBlocks: number;
  apiTokens: number;
  breakGlassAccounts: number;
}

const SECTIONS: { id: Section; label: string; icon: React.ReactNode }[] = [
  { id: 'ip',         label: 'IP Management',    icon: <Network className="w-4 h-4" /> },
  { id: 'tokens',     label: 'API Tokens',       icon: <Key className="w-4 h-4" /> },
  { id: 'breakglass', label: 'Emergency Access',  icon: <KeyRound className="w-4 h-4" /> },
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

  // Fetch overview stats from multiple endpoints
  const loadStats = async () => {
    setLoadingStats(true);
    try {
      const [blocklistRes, tokensRes, breakGlassRes] = await Promise.all([
        fetch('/api/v1/system-admin/security-blocklist/stats', { headers: authHeaders() }).then(r => r.json()).catch(() => null),
        fetch('/api/v1/system-admin/api-tokens', { headers: authHeaders() }).then(r => r.json()).catch(() => null),
        fetch('/api/v1/system-admin/break-glass', { headers: authHeaders() }).then(r => r.json()).catch(() => null),
      ]);

      setStats({
        manualRules: 0, // Will be populated when IP rules tab loads
        activeBlocks: blocklistRes?.data?.activeBlocks ?? 0,
        apiTokens: Array.isArray(tokensRes?.data) ? tokensRes.data.filter((t: any) => !t.revoked).length : 0,
        breakGlassAccounts: Array.isArray(breakGlassRes?.data) ? breakGlassRes.data.length : 0,
      });
    } catch {
      // Stats are non-critical, silently fail
    } finally {
      setLoadingStats(false);
    }
  };

  useEffect(() => { loadStats(); }, []);

  // IPRulesTab uses reversed param order: (msg, type)
  const reversedOnMessage = (msg: string, type?: 'success' | 'error' | 'info') => {
    onMessage((type || 'error') as 'success' | 'error', msg);
  };

  return (
    <div className="space-y-6">
      {/* ── Overview Stats ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-indigo-50 dark:bg-indigo-900/20 rounded-xl p-4 border border-gray-100 dark:border-gray-700">
          <div className="flex items-center gap-2 mb-1">
            <Network className="w-3.5 h-3.5 text-indigo-500" />
            <span className="text-xs font-medium text-gray-500 dark:text-gray-400">IP Rules</span>
          </div>
          <p className="text-2xl font-bold text-indigo-600 dark:text-indigo-400">
            {loadingStats ? <Loader2 className="w-5 h-5 animate-spin" /> : '—'}
          </p>
        </div>
        <div className="bg-red-50 dark:bg-red-900/20 rounded-xl p-4 border border-gray-100 dark:border-gray-700">
          <div className="flex items-center gap-2 mb-1">
            <Ban className="w-3.5 h-3.5 text-red-500" />
            <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Active Blocks</span>
          </div>
          <p className="text-2xl font-bold text-red-600 dark:text-red-400">
            {loadingStats ? <Loader2 className="w-5 h-5 animate-spin" /> : stats?.activeBlocks ?? 0}
          </p>
        </div>
        <div className="bg-blue-50 dark:bg-blue-900/20 rounded-xl p-4 border border-gray-100 dark:border-gray-700">
          <div className="flex items-center gap-2 mb-1">
            <Key className="w-3.5 h-3.5 text-blue-500" />
            <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Active Tokens</span>
          </div>
          <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">
            {loadingStats ? <Loader2 className="w-5 h-5 animate-spin" /> : stats?.apiTokens ?? 0}
          </p>
        </div>
        <div className="bg-amber-50 dark:bg-amber-900/20 rounded-xl p-4 border border-gray-100 dark:border-gray-700">
          <div className="flex items-center gap-2 mb-1">
            <KeyRound className="w-3.5 h-3.5 text-amber-500" />
            <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Break-Glass</span>
          </div>
          <p className="text-2xl font-bold text-amber-600 dark:text-amber-400">
            {loadingStats ? <Loader2 className="w-5 h-5 animate-spin" /> : stats?.breakGlassAccounts ?? 0}
          </p>
        </div>
      </div>

      {/* ── Section Navigation (Pills) ── */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
        <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700">
          <div className="flex gap-1 bg-gray-100 dark:bg-gray-700 rounded-lg p-1">
            {SECTIONS.map(s => (
              <button
                key={s.id}
                onClick={() => setSection(s.id)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all flex-1 justify-center ${
                  section === s.id
                    ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-white shadow-sm'
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                }`}>
                {s.icon}
                {s.label}
              </button>
            ))}
          </div>
        </div>

        {/* ── Section Content ── */}
        <div className="p-5">
          {/* IP Management */}
          {section === 'ip' && (
            <div className="space-y-4">
              {/* Sub-view toggle for IP Management */}
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

          {/* API Tokens */}
          {section === 'tokens' && <ApiTokenManagerTab />}

          {/* Emergency Access */}
          {section === 'breakglass' && <BreakGlassTab />}
        </div>
      </div>
    </div>
  );
}
