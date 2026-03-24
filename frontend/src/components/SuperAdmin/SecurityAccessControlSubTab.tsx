import { useState, useEffect, useCallback } from 'react';
import {
  Shield, Key, KeyRound, Loader2, ShieldBan,
} from 'lucide-react';
import ApiTokenManagerTab from './ApiTokenManagerTab';
import BreakGlassTab from './BreakGlassTab';
import RolePermissionMatrix from './RolePermissionMatrix';
import ConditionalAccessPolicies from './ConditionalAccessPolicies';

/* ───────── Types ───────── */

interface Props {
  onMessage: (type: 'success' | 'error', message: string) => void;
}

type Section = 'tokens' | 'breakglass' | 'permissions' | 'conditional';

interface OverviewStats {
  apiTokens: number;
  breakGlassAccounts: number;
}

/* ─── Navigation groups (Cloudflare sidebar pattern) ─────────── */

interface NavItem  { id: Section; label: string; icon: React.ReactNode }
interface NavGroup { label: string; items: NavItem[] }

const NAV_GROUPS: NavGroup[] = [
  {
    label: 'Credentials',
    items: [
      { id: 'tokens',     label: 'API Tokens',       icon: <Key      className="w-3.5 h-3.5" /> },
      { id: 'breakglass', label: 'Emergency Access', icon: <KeyRound className="w-3.5 h-3.5" /> },
    ],
  },
  {
    label: 'Permissions',
    items: [
      { id: 'permissions', label: 'Role Permissions',  icon: <Shield    className="w-3.5 h-3.5" /> },
      { id: 'conditional', label: 'Conditional Access', icon: <ShieldBan className="w-3.5 h-3.5" /> },
    ],
  },
];

/* ───────── Component ───────── */

const API_BASE = import.meta.env.VITE_API_BASE_URL || '/api/v1';

export default function SecurityAccessControlSubTab({ onMessage: _onMessage }: Props) {
  const [section, setSection] = useState<Section>('tokens');
  const [stats, setStats]     = useState<OverviewStats | null>(null);
  const [loadingStats, setLoadingStats] = useState(true);

  const authHeaders = useCallback(() => ({
    'Content-Type': 'application/json',
    Authorization: `Bearer ${sessionStorage.getItem('fuel_order_token')}`,
  }), []);

  const loadStats = useCallback(async () => {
    setLoadingStats(true);
    try {
      const [tokensRes, breakGlassRes] = await Promise.all([
        fetch(`${API_BASE}/system-admin/api-tokens`,  { headers: authHeaders() }).then(r => r.json()).catch(() => null),
        fetch(`${API_BASE}/system-admin/break-glass`, { headers: authHeaders() }).then(r => r.json()).catch(() => null),
      ]);
      setStats({
        apiTokens:          Array.isArray(tokensRes?.data)     ? tokensRes.data.filter((t: any) => !t.revoked).length : 0,
        breakGlassAccounts: Array.isArray(breakGlassRes?.data) ? breakGlassRes.data.length : 0,
      });
    } catch { /* non-critical */ } finally { setLoadingStats(false); }
  }, [authHeaders]);

  useEffect(() => { loadStats(); }, [loadStats]);

  /* ── Stat tiles ───────────────────────────────────────────── */
  const STAT_TILES = [
    { label: 'ACTIVE TOKENS', value: stats?.apiTokens ?? 0,          icon: <Key      className="w-4 h-4 text-gray-400 dark:text-gray-500" />, dot: 'bg-blue-500' },
    { label: 'BREAK-GLASS',   value: stats?.breakGlassAccounts ?? 0, icon: <KeyRound className="w-4 h-4 text-gray-400 dark:text-gray-500" />, dot: 'bg-amber-500' },
  ];

  return (
    <div className="flex flex-col gap-4">
      {/* Stats row */}
      <div className="grid grid-cols-2 gap-3">
        {STAT_TILES.map(tile => (
          <div
            key={tile.label}
            className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4 flex items-center gap-3"
          >
            <div className="w-8 h-8 rounded-lg bg-gray-50 dark:bg-gray-700 border border-gray-100 dark:border-gray-600 flex items-center justify-center flex-shrink-0">
              {tile.icon}
            </div>
            <div>
              <p className="text-[11px] text-gray-400 dark:text-gray-500 uppercase tracking-wide">{tile.label}</p>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${tile.dot}`} />
                <p className="text-[20px] font-medium text-gray-900 dark:text-white leading-none">
                  {loadingStats ? <Loader2 className="w-4 h-4 animate-spin text-gray-400" /> : tile.value}
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Sidebar + content */}
      <div
        className="flex rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden"
        style={{ minHeight: 520 }}
      >
        {/* LEFT: sidebar nav */}
        <aside className="w-44 bg-gray-100 dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 flex-shrink-0 py-2 overflow-y-auto">
          {NAV_GROUPS.map(group => (
            <div key={group.label}>
              <p className="px-3.5 pt-4 pb-1 text-[10px] font-medium text-gray-400 dark:text-gray-500 uppercase tracking-widest">
                {group.label}
              </p>
              {group.items.map(item => {
                const active = section === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => setSection(item.id)}
                    className={[
                      'w-full flex items-center gap-2 py-1.5 text-[13px] transition-colors',
                      active
                        ? 'border-l-2 border-orange-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-white font-medium pl-[12px]'
                        : 'border-l-2 border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-white/60 dark:hover:bg-gray-700/60 pl-[14px]',
                    ].join(' ')}
                  >
                    <span className={active ? 'text-orange-600 dark:text-orange-500' : 'text-gray-400 dark:text-gray-500'}>
                      {item.icon}
                    </span>
                    {item.label}
                  </button>
                );
              })}
            </div>
          ))}
        </aside>

        {/* RIGHT: content panel */}
        <div className="flex-1 p-5 bg-white dark:bg-gray-900 overflow-y-auto">
          {section === 'tokens'      && <ApiTokenManagerTab />}
          {section === 'breakglass'  && <BreakGlassTab />}
          {section === 'permissions' && <RolePermissionMatrix />}
          {section === 'conditional' && <ConditionalAccessPolicies />}
        </div>
      </div>
    </div>
  );
}
