import { useState, useEffect } from 'react';
import { Loader2, RefreshCw, Search, Shield, Eye, Pencil, Trash2, Plus } from 'lucide-react';

/* ───────── Types ───────── */

interface PermissionMatrix {
  roles: string[];
  categories: { key: string; label: string }[];
  matrix: Record<string, Record<string, string>>;
}

/* ───────── Permission cell styling ───────── */

const PERM_STYLES: Record<string, { bg: string; text: string; label: string; icons: React.ReactNode[] }> = {
  CRUD: {
    bg: 'bg-green-100 dark:bg-green-900/30',
    text: 'text-green-700 dark:text-green-400',
    label: 'Full',
    icons: [<Plus key="c" className="w-3 h-3" />, <Eye key="r" className="w-3 h-3" />, <Pencil key="u" className="w-3 h-3" />, <Trash2 key="d" className="w-3 h-3" />],
  },
  CRU: {
    bg: 'bg-blue-100 dark:bg-blue-900/30',
    text: 'text-blue-700 dark:text-blue-400',
    label: 'No Delete',
    icons: [<Plus key="c" className="w-3 h-3" />, <Eye key="r" className="w-3 h-3" />, <Pencil key="u" className="w-3 h-3" />],
  },
  CR: {
    bg: 'bg-cyan-100 dark:bg-cyan-900/30',
    text: 'text-cyan-700 dark:text-cyan-400',
    label: 'Create/Read',
    icons: [<Plus key="c" className="w-3 h-3" />, <Eye key="r" className="w-3 h-3" />],
  },
  R: {
    bg: 'bg-yellow-100 dark:bg-yellow-900/30',
    text: 'text-yellow-700 dark:text-yellow-400',
    label: 'Read Only',
    icons: [<Eye key="r" className="w-3 h-3" />],
  },
  '—': {
    bg: 'bg-gray-100 dark:bg-gray-800',
    text: 'text-gray-400 dark:text-gray-600',
    label: 'None',
    icons: [],
  },
};

/* ───────── Component ───────── */

export default function RolePermissionMatrix() {
  const [data, setData] = useState<PermissionMatrix | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [hoveredCell, setHoveredCell] = useState<string | null>(null);

  const authHeaders = () => ({
    Authorization: `Bearer ${sessionStorage.getItem('fuel_order_token')}`,
  });

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/v1/system-admin/role-permissions', { headers: authHeaders() });
      const json = await res.json();
      if (json.success) setData(json.data);
    } catch {
      // Non-critical
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="w-6 h-6 text-indigo-500 animate-spin" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="text-center py-12 text-gray-400">
        <Shield className="w-8 h-8 mx-auto mb-2 opacity-30" />
        <p className="text-sm">Unable to load permission data</p>
        <button onClick={load} className="mt-2 text-xs text-indigo-500 hover:underline">Retry</button>
      </div>
    );
  }

  const filteredRoles = search
    ? data.roles.filter(r => r.toLowerCase().includes(search.toLowerCase()))
    : data.roles;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-gray-900 dark:text-gray-100">Role Permission Matrix</h3>
          <p className="text-xs text-gray-500 dark:text-gray-400">{data.roles.length} roles &times; {data.categories.length} categories</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
            <input
              type="text" placeholder="Filter roles…" value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-8 pr-3 py-1.5 text-xs rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500 w-40"
            />
          </div>
          <button onClick={load} className="p-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors">
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-3">
        {Object.entries(PERM_STYLES).filter(([k]) => k !== '—').map(([key, style]) => (
          <div key={key} className={`flex items-center gap-1.5 px-2 py-1 rounded-md ${style.bg}`}>
            <span className={`text-[10px] font-bold ${style.text}`}>{key}</span>
            <span className={`text-[10px] ${style.text}`}>{style.label}</span>
          </div>
        ))}
        <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-gray-100 dark:bg-gray-800">
          <span className="text-[10px] font-bold text-gray-400">—</span>
          <span className="text-[10px] text-gray-400">No Access</span>
        </div>
      </div>

      {/* Matrix Table */}
      <div className="overflow-x-auto bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
        <table className="w-full text-xs">
          <thead className="sticky top-0 z-10 bg-gray-50 dark:bg-gray-700/80">
            <tr>
              <th className="px-3 py-2.5 text-left font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide sticky left-0 bg-gray-50 dark:bg-gray-700/80 border-r border-gray-200 dark:border-gray-600 min-w-[140px]">
                Role
              </th>
              {data.categories.map(cat => (
                <th key={cat.key} className="px-2 py-2.5 text-center font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide whitespace-nowrap">
                  {cat.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
            {filteredRoles.map((role, ri) => (
              <tr key={role} className={ri % 2 === 0 ? '' : 'bg-gray-50/50 dark:bg-gray-800/50'}>
                <td className="px-3 py-2 font-medium text-gray-900 dark:text-gray-100 sticky left-0 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-600 whitespace-nowrap">
                  <span className="inline-flex items-center gap-1.5">
                    <span className={`w-2 h-2 rounded-full ${
                      role === 'super_admin' ? 'bg-purple-500' :
                      role === 'admin' ? 'bg-blue-500' :
                      role === 'boss' ? 'bg-indigo-500' :
                      'bg-gray-400'
                    }`} />
                    {role.replace(/_/g, ' ')}
                  </span>
                </td>
                {data.categories.map(cat => {
                  const perm = data.matrix[role]?.[cat.key] ?? '—';
                  const style = PERM_STYLES[perm] ?? PERM_STYLES['—'];
                  const cellKey = `${role}-${cat.key}`;
                  return (
                    <td key={cat.key} className="px-2 py-2 text-center">
                      <div
                        onMouseEnter={() => setHoveredCell(cellKey)}
                        onMouseLeave={() => setHoveredCell(null)}
                        className={`inline-flex items-center justify-center gap-0.5 px-2 py-1 rounded-md cursor-default transition-all ${style.bg} ${hoveredCell === cellKey ? 'ring-2 ring-indigo-400 scale-110' : ''}`}
                        title={`${role} → ${cat.label}: ${style.label} (${perm})`}
                      >
                        <span className={`font-bold ${style.text}`}>{perm}</span>
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
            {filteredRoles.length === 0 && (
              <tr>
                <td colSpan={data.categories.length + 1} className="text-center py-8 text-gray-400 text-sm">
                  No roles match filter
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
