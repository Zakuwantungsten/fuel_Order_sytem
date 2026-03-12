import { useState, useEffect } from 'react';
import { ShieldBan, Plus, Trash2, ToggleLeft, ToggleRight, RefreshCw } from 'lucide-react';

interface DLPRule {
  _id: string;
  name: string;
  description: string;
  isActive: boolean;
  ruleType: string;
  maxRecords?: number;
  allowedHoursStart?: number;
  allowedHoursEnd?: number;
  allowedRoles?: string[];
  blockedRoles?: string[];
  restrictedFields?: string[];
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

const RULE_TYPES: Record<string, string> = {
  export_limit: 'Export Limit',
  field_restriction: 'Field Restriction',
  time_restriction: 'Time Restriction',
  role_restriction: 'Role Restriction',
};

const DATA_TYPES = ['fuel_records', 'delivery_orders', 'lpo_entries', 'users', 'audit_logs', 'yard_fuel'];

const API_BASE = import.meta.env.VITE_API_BASE_URL || '/api/v1';

export default function DLPControlsTab() {
  const [rules, setRules] = useState<DLPRule[]>([]);
  const [stats, setStats] = useState<DLPStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Form state
  const [form, setForm] = useState({
    name: '', description: '', ruleType: 'export_limit', maxRecords: 500,
    allowedHoursStart: 8, allowedHoursEnd: 18,
    appliesTo: ['fuel_records'] as string[], action: 'block',
  });

const headers = () => {
  const h: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${sessionStorage.getItem('fuel_order_token')}`,
  };
  const match = decodeURIComponent(document.cookie).split(';').map(c => c.trim()).find(c => c.startsWith('XSRF-TOKEN='));
  if (match) h['X-XSRF-TOKEN'] = match.substring('XSRF-TOKEN='.length);
  return h;
};

  const fetchData = async () => {
    setLoading(true);
    try {
      const [rulesRes, statsRes] = await Promise.all([
        fetch(`${API_BASE}/system-admin/dlp`, { headers: headers() }),
        fetch(`${API_BASE}/system-admin/dlp/stats`, { headers: headers() }),
      ]);
      const rulesJson = await rulesRes.json();
      const statsJson = await statsRes.json();
      if (rulesJson.success) setRules(rulesJson.data);
      if (statsJson.success) setStats(statsJson.data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const createRule = async () => {
    try {
      const res = await fetch(`${API_BASE}/system-admin/dlp`, {
        method: 'POST', headers: headers(), body: JSON.stringify(form),
      });
      const json = await res.json();
      if (json.success) {
        setSuccess('DLP rule created');
        setShowCreate(false);
        setForm({ name: '', description: '', ruleType: 'export_limit', maxRecords: 500, allowedHoursStart: 8, allowedHoursEnd: 18, appliesTo: ['fuel_records'], action: 'block' });
        fetchData();
        setTimeout(() => setSuccess(null), 3000);
      } else setError(json.message);
    } catch (err: any) { setError(err.message); }
  };

  const toggleRule = async (id: string) => {
    try {
      const res = await fetch(`${API_BASE}/system-admin/dlp/${id}/toggle`, { method: 'PATCH', headers: headers() });
      const json = await res.json();
      if (json.success) fetchData();
      else setError(json.message);
    } catch (err: any) { setError(err.message); }
  };

  const deleteRule = async (id: string) => {
    if (!confirm('Delete this DLP rule?')) return;
    try {
      const res = await fetch(`${API_BASE}/system-admin/dlp/${id}`, { method: 'DELETE', headers: headers() });
      const json = await res.json();
      if (json.success) { setSuccess('Rule deleted'); fetchData(); setTimeout(() => setSuccess(null), 3000); }
      else setError(json.message);
    } catch (err: any) { setError(err.message); }
  };

  if (loading) return <div className="flex justify-center py-12"><RefreshCw className="w-6 h-6 text-indigo-600 animate-spin" /></div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">Data Loss Prevention</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">Prevent unauthorized bulk data export and sensitive data access</p>
        </div>
        <button onClick={() => setShowCreate(!showCreate)} className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm">
          <Plus className="w-4 h-4" /> Add Rule
        </button>
      </div>

      {error && <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3 text-sm text-red-700 dark:text-red-300">{error}</div>}
      {success && <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-3 text-sm text-green-700 dark:text-green-300">{success}</div>}

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: 'Total Rules', value: stats.totalRules, color: 'indigo' },
            { label: 'Active', value: stats.activeRules, color: 'green' },
            { label: 'Total Triggers', value: stats.totalTriggers, color: 'orange' },
            { label: 'Rule Types', value: Object.keys(stats.rulesByType).length, color: 'purple' },
          ].map(({ label, value, color }) => (
            <div key={label} className={`bg-${color}-50 dark:bg-${color}-900/20 rounded-lg p-4 border border-${color}-200 dark:border-${color}-800`}>
              <p className="text-xs text-gray-500 dark:text-gray-400">{label}</p>
              <p className={`text-2xl font-bold text-${color}-600 dark:text-${color}-400`}>{value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Create Form */}
      {showCreate && (
        <div className="bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-lg p-6 space-y-4">
          <h3 className="font-semibold text-gray-900 dark:text-gray-100">New DLP Rule</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-gray-700 dark:text-gray-300 mb-1">Name</label>
              <input value={form.name} onChange={e => setForm({...form, name: e.target.value})}
                className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-gray-200 text-sm" />
            </div>
            <div>
              <label className="block text-sm text-gray-700 dark:text-gray-300 mb-1">Rule Type</label>
              <select value={form.ruleType} onChange={e => setForm({...form, ruleType: e.target.value})}
                className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-gray-200 text-sm">
                {Object.entries(RULE_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm text-gray-700 dark:text-gray-300 mb-1">Description</label>
              <input value={form.description} onChange={e => setForm({...form, description: e.target.value})}
                className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-gray-200 text-sm" />
            </div>
            {form.ruleType === 'export_limit' && (
              <div>
                <label className="block text-sm text-gray-700 dark:text-gray-300 mb-1">Max Records per Export</label>
                <input type="number" value={form.maxRecords} onChange={e => setForm({...form, maxRecords: parseInt(e.target.value)})}
                  className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-gray-200 text-sm" />
              </div>
            )}
            <div>
              <label className="block text-sm text-gray-700 dark:text-gray-300 mb-1">Action</label>
              <select value={form.action} onChange={e => setForm({...form, action: e.target.value})}
                className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-gray-200 text-sm">
                <option value="block">Block</option>
                <option value="warn">Warn</option>
                <option value="log">Log Only</option>
              </select>
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm text-gray-700 dark:text-gray-300 mb-1">Applies To</label>
              <div className="flex flex-wrap gap-2">
                {DATA_TYPES.map(dt => (
                  <label key={dt} className="flex items-center gap-1.5 text-sm">
                    <input type="checkbox" checked={form.appliesTo.includes(dt)}
                      onChange={e => setForm({...form, appliesTo: e.target.checked ? [...form.appliesTo, dt] : form.appliesTo.filter(x => x !== dt)})}
                      className="rounded" />
                    <span className="text-gray-700 dark:text-gray-300">{dt.replace(/_/g, ' ')}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>
          <div className="flex gap-2 pt-2">
            <button onClick={createRule} className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700">Create</button>
            <button onClick={() => setShowCreate(false)} className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg text-sm">Cancel</button>
          </div>
        </div>
      )}

      {/* Rules List */}
      {rules.length === 0 ? (
        <div className="text-center py-12 text-gray-500 dark:text-gray-400">
          <ShieldBan className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>No DLP rules configured</p>
        </div>
      ) : (
        <div className="space-y-3">
          {rules.map(rule => (
            <div key={rule._id} className="bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-lg p-4">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-medium text-gray-900 dark:text-gray-100">{rule.name}</span>
                    <span className={`px-2 py-0.5 rounded-full text-xs ${rule.isActive ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400'}`}>
                      {rule.isActive ? 'Active' : 'Inactive'}
                    </span>
                    <span className="px-2 py-0.5 rounded-full text-xs bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400">
                      {RULE_TYPES[rule.ruleType] || rule.ruleType}
                    </span>
                    <span className={`px-2 py-0.5 rounded-full text-xs ${rule.action === 'block' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' : rule.action === 'warn' ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400' : 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'}`}>
                      {rule.action}
                    </span>
                  </div>
                  {rule.description && <p className="text-sm text-gray-500 dark:text-gray-400">{rule.description}</p>}
                  <div className="flex items-center gap-3 mt-2 text-xs text-gray-500 dark:text-gray-400">
                    <span>Applies to: {rule.appliesTo.join(', ')}</span>
                    {rule.maxRecords && <span>Max: {rule.maxRecords} records</span>}
                    <span>Triggered: {rule.triggerCount}x</span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => toggleRule(rule._id)} className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded" title="Toggle">
                    {rule.isActive ? <ToggleRight className="w-5 h-5 text-green-500" /> : <ToggleLeft className="w-5 h-5 text-gray-400" />}
                  </button>
                  <button onClick={() => deleteRule(rule._id)} className="p-1.5 hover:bg-red-50 dark:hover:bg-red-900/20 rounded" title="Delete">
                    <Trash2 className="w-4 h-4 text-red-500" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
