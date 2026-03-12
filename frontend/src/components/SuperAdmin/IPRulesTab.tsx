import { useState, useEffect, useCallback } from 'react';
import {
  Shield,
  ShieldOff,
  Plus,
  Trash2,
  Pencil,
  ToggleLeft,
  ToggleRight,
  Loader2,
  Search,
  Filter,
  X,
  AlertTriangle,
  CheckCircle,
  Info,
  Network,
  FlaskConical,
  ChevronRight,
} from 'lucide-react';
import { ipRuleService, IPRule, CreateIPRulePayload } from '../../services/ipRuleService';

interface Props {
  onMessage: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

interface FormState {
  ip: string;
  type: 'allow' | 'block';
  description: string;
  isActive: boolean;
}

const DEFAULT_FORM: FormState = { ip: '', type: 'block', description: '', isActive: true };

export default function IPRulesTab({ onMessage }: Props) {
  const [rules, setRules] = useState<IPRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'allow' | 'block'>('all');
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'inactive'>('all');

  // Modal / form state
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(DEFAULT_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  // Delete confirm
  const [deleteTarget, setDeleteTarget] = useState<IPRule | null>(null);
  const [deleting, setDeleting] = useState(false);

  // IP tester
  const [testIP, setTestIP] = useState('');
  const [testResult, setTestResult] = useState<{ verdict: 'allow' | 'block' | 'none'; matchedRule?: string } | null>(null);
  const [testing, setTesting] = useState(false);

  // IP gating
  const [ipGatingEnabled, setIpGatingEnabled] = useState(false);
  const [gatingLoading, setGatingLoading] = useState(false);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const data = await ipRuleService.getAll();
      setRules(data);
    } catch {
      onMessage('Failed to load IP rules', 'error');
    } finally {
      setLoading(false);
    }
  }, [onMessage]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    ipRuleService.getGatingConfig().then(cfg => setIpGatingEnabled(cfg.ipGatingEnabled)).catch(() => {});
  }, []);

  const filtered = rules.filter((r) => {
    const matchSearch = !search || r.ip.includes(search) || r.description.toLowerCase().includes(search.toLowerCase());
    const matchType = filterType === 'all' || r.type === filterType;
    const matchStatus = filterStatus === 'all' || (filterStatus === 'active' ? r.isActive : !r.isActive);
    return matchSearch && matchType && matchStatus;
  });

  // Stats
  const activeAllowCount = rules.filter((r) => r.type === 'allow' && r.isActive).length;
  const activeBlockCount = rules.filter((r) => r.type === 'block' && r.isActive).length;
  const inactiveCount = rules.filter((r) => !r.isActive).length;

  function openCreate() {
    setEditingId(null);
    setForm(DEFAULT_FORM);
    setFormError('');
    setShowModal(true);
  }

  function openEdit(rule: IPRule) {
    setEditingId(rule._id);
    setForm({ ip: rule.ip, type: rule.type, description: rule.description, isActive: rule.isActive });
    setFormError('');
    setShowModal(true);
  }

  async function handleSave() {
    if (!form.ip.trim()) { setFormError('IP address is required'); return; }
    setSaving(true);
    setFormError('');
    try {
      const payload: CreateIPRulePayload = {
        ip: form.ip.trim(),
        type: form.type,
        description: form.description.trim(),
        isActive: form.isActive,
      };
      if (editingId) {
        await ipRuleService.update(editingId, payload);
        onMessage('IP rule updated', 'success');
      } else {
        await ipRuleService.create(payload);
        onMessage('IP rule created', 'success');
      }
      setShowModal(false);
      load();
    } catch (err: any) {
      setFormError(err?.response?.data?.message || 'Failed to save rule');
    } finally {
      setSaving(false);
    }
  }

  async function handleToggle(rule: IPRule) {
    try {
      await ipRuleService.toggle(rule._id);
      setRules((prev) => prev.map((r) => r._id === rule._id ? { ...r, isActive: !r.isActive } : r));
    } catch {
      onMessage('Failed to toggle rule', 'error');
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await ipRuleService.delete(deleteTarget._id);
      onMessage('IP rule deleted', 'success');
      setDeleteTarget(null);
      load();
    } catch {
      onMessage('Failed to delete rule', 'error');
    } finally {
      setDeleting(false);
    }
  }

  async function handleTestIP() {
    if (!testIP.trim()) return;
    setTesting(true);
    setTestResult(null);
    try {
      const result = await ipRuleService.testIP(testIP.trim());
      setTestResult(result);
    } catch (err: any) {
      onMessage(err?.response?.data?.message || 'Invalid IP address', 'error');
    } finally {
      setTesting(false);
    }
  }

  async function handleToggleGating() {
    setGatingLoading(true);
    try {
      const newVal = !ipGatingEnabled;
      await ipRuleService.updateGating(newVal);
      setIpGatingEnabled(newVal);
      onMessage(newVal ? 'IP gating enabled — auto-blocked IPs will be added as persistent block rules' : 'IP gating disabled', 'success');
    } catch {
      onMessage('Failed to update IP gating', 'error');
    } finally {
      setGatingLoading(false);
    }
  }

  const hasAllowRules = activeAllowCount > 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-red-100 dark:bg-red-900/40 flex items-center justify-center">
            <Network className="w-5 h-5 text-red-600 dark:text-red-400" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">IP Allowlist / Blocklist</h2>
            <p className="text-xs text-gray-500 dark:text-gray-400">Control which IP addresses can access the system</p>
          </div>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 px-4 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-semibold transition-colors shadow-sm"
        >
          <Plus className="w-4 h-4" />
          Add Rule
        </button>
      </div>

      {/* Allowlist warning */}
      {hasAllowRules && (
        <div className="flex items-start gap-3 p-4 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-xl">
          <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">Allowlist mode is active</p>
            <p className="text-xs text-amber-700 dark:text-amber-400 mt-0.5">
              {activeAllowCount} active allow rule{activeAllowCount !== 1 ? 's' : ''} detected. All IPs NOT on the allowlist will be <strong>blocked</strong>.
              Make sure your own IP is included before activating.
            </p>
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Allow Rules', count: activeAllowCount, color: 'text-green-600 dark:text-green-400', bg: 'bg-green-50 dark:bg-green-900/20', dot: 'bg-green-500', icon: Shield },
          { label: 'Block Rules', count: activeBlockCount, color: 'text-red-600 dark:text-red-400', bg: 'bg-red-50 dark:bg-red-900/20', dot: 'bg-red-500', icon: ShieldOff },
          { label: 'Inactive', count: inactiveCount, color: 'text-gray-500 dark:text-gray-400', bg: 'bg-gray-50 dark:bg-gray-800', dot: 'bg-gray-300', icon: ToggleLeft },
        ].map(({ label, count, color, bg, dot }) => (
          <div key={label} className={`${bg} rounded-xl p-4 border border-gray-100 dark:border-gray-700`}>
            <div className="flex items-center gap-2 mb-1">
              <span className={`w-2 h-2 rounded-full ${dot}`} />
              <span className="text-xs text-gray-500 dark:text-gray-400 font-medium">{label}</span>
            </div>
            <p className={`text-2xl font-bold ${color}`}>{count}</p>
          </div>
        ))}
      </div>

      {/* IP Gating */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg ${ipGatingEnabled ? 'bg-indigo-100 dark:bg-indigo-900/40' : 'bg-gray-100 dark:bg-gray-700'}`}>
              <ShieldOff className={`w-4 h-4 ${ipGatingEnabled ? 'text-indigo-600 dark:text-indigo-400' : 'text-gray-400'}`} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">IP Gating</h3>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide ${
                  ipGatingEnabled
                    ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300'
                    : 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400'
                }`}>
                  {ipGatingEnabled ? 'Active' : 'Off'}
                </span>
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                When enabled, IPs auto-blocked by the security blocklist are automatically added here as persistent block rules.
                This ensures blocks survive server restarts and memory clears.
              </p>
            </div>
          </div>
          <button
            onClick={handleToggleGating}
            disabled={gatingLoading}
            className="flex-shrink-0 ml-4"
          >
            {gatingLoading ? (
              <Loader2 className="w-8 h-8 text-gray-400 animate-spin" />
            ) : ipGatingEnabled ? (
              <ToggleRight className="w-8 h-8 text-indigo-600 dark:text-indigo-400" />
            ) : (
              <ToggleLeft className="w-8 h-8 text-gray-400" />
            )}
          </button>
        </div>
      </div>

      {/* IP Tester */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
        <div className="flex items-center gap-2 mb-3">
          <FlaskConical className="w-4 h-4 text-indigo-500" />
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">IP Rule Tester</h3>
          <span className="text-xs text-gray-400 dark:text-gray-500">Test what would happen to a specific IP</span>
        </div>
        <div className="flex gap-3">
          <input
            type="text"
            value={testIP}
            onChange={(e) => { setTestIP(e.target.value); setTestResult(null); }}
            onKeyDown={(e) => e.key === 'Enter' && handleTestIP()}
            placeholder="e.g. 198.51.100.50"
            className="flex-1 px-3 py-2 text-sm bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none text-gray-900 dark:text-gray-100"
          />
          <button
            onClick={handleTestIP}
            disabled={!testIP.trim() || testing}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white rounded-lg text-sm font-medium transition-colors"
          >
            {testing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ChevronRight className="w-3.5 h-3.5" />}
            Test
          </button>
        </div>
        {testResult && (
          <div className={`mt-3 flex items-start gap-3 p-3 rounded-lg border ${
            testResult.verdict === 'allow'
              ? 'bg-green-50 dark:bg-green-950/40 border-green-200 dark:border-green-800'
              : testResult.verdict === 'block'
              ? 'bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-800'
              : 'bg-blue-50 dark:bg-blue-950/40 border-blue-200 dark:border-blue-800'
          }`}>
            {testResult.verdict === 'allow' ? (
              <CheckCircle className="w-4 h-4 text-green-600 dark:text-green-400 flex-shrink-0 mt-0.5" />
            ) : testResult.verdict === 'block' ? (
              <ShieldOff className="w-4 h-4 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
            ) : (
              <Info className="w-4 h-4 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
            )}
            <div>
              <p className={`text-sm font-semibold ${
                testResult.verdict === 'allow' ? 'text-green-800 dark:text-green-300' :
                testResult.verdict === 'block' ? 'text-red-800 dark:text-red-300' :
                'text-blue-800 dark:text-blue-300'
              }`}>
                {testResult.verdict === 'allow' ? 'Access ALLOWED' :
                 testResult.verdict === 'block' ? 'Access BLOCKED' :
                 'No matching rule — access allowed by default'}
              </p>
              {testResult.matchedRule && (
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                  Matched rule: <code className="font-mono bg-gray-100 dark:bg-gray-700 px-1 rounded">{testResult.matchedRule}</code>
                </p>
              )}
              {!testResult.matchedRule && testResult.verdict === 'block' && (
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                  IP is not on any active allowlist (allowlist mode is active).
                </p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Filter bar */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search by IP or description..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-sm bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition text-gray-900 dark:text-gray-100"
          />
        </div>
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-gray-400" />
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value as any)}
            className="text-sm bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500 text-gray-700 dark:text-gray-300"
          >
            <option value="all">All types</option>
            <option value="allow">Allow</option>
            <option value="block">Block</option>
          </select>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value as any)}
            className="text-sm bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500 text-gray-700 dark:text-gray-300"
          >
            <option value="all">All statuses</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>
      </div>

      {/* Rules list */}
      {loading ? (
        <div className="space-y-2 animate-pulse">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 bg-gray-200 dark:bg-gray-700 rounded-lg" />
                  <div className="space-y-1.5">
                    <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-32" />
                    <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-48" />
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="h-6 w-14 bg-gray-200 dark:bg-gray-700 rounded-full" />
                  <div className="h-8 w-8 bg-gray-200 dark:bg-gray-700 rounded-lg" />
                  <div className="h-8 w-8 bg-gray-200 dark:bg-gray-700 rounded-lg" />
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-gray-400 dark:text-gray-500">
          <Network className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm font-medium">No IP rules found</p>
          <p className="text-xs mt-1">Add allow or block rules to control access by IP address</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((rule) => (
            <div
              key={rule._id}
              className={`group relative bg-white dark:bg-gray-800 rounded-xl border transition-all shadow-sm hover:shadow-md overflow-hidden ${
                rule.isActive
                  ? rule.type === 'block'
                    ? 'border-red-200 dark:border-red-800 hover:border-red-300 dark:hover:border-red-700'
                    : 'border-green-200 dark:border-green-800 hover:border-green-300 dark:hover:border-green-700'
                  : 'border-gray-200 dark:border-gray-700 opacity-60'
              }`}
            >
              {/* Left color bar */}
              <div className={`absolute left-0 top-0 bottom-0 w-1 ${
                !rule.isActive ? 'bg-gray-300 dark:bg-gray-600' :
                rule.type === 'block' ? 'bg-red-500' : 'bg-green-500'
              }`} />

              <div className="pl-5 pr-4 py-3 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <div className={`p-1.5 rounded-lg flex-shrink-0 ${
                    !rule.isActive ? 'bg-gray-100 dark:bg-gray-700 text-gray-400' :
                    rule.type === 'block'
                      ? 'bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-400'
                      : 'bg-green-100 dark:bg-green-900/40 text-green-600 dark:text-green-400'
                  }`}>
                    {rule.type === 'block' ? <ShieldOff className="w-3.5 h-3.5" /> : <Shield className="w-3.5 h-3.5" />}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <code className="font-mono text-sm font-semibold text-gray-900 dark:text-gray-100">{rule.ip}</code>
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wide ${
                        rule.type === 'block'
                          ? 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300'
                          : 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300'
                      }`}>
                        {rule.type}
                      </span>
                      {!rule.isActive && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400">
                          Inactive
                        </span>
                      )}
                      {(rule.createdBy === 'system:ip-gating' || rule.description?.startsWith('Auto-gated:')) && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300">
                          Auto-gated
                        </span>
                      )}
                    </div>
                    {rule.description && (
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 truncate">{rule.description}</p>
                    )}
                    <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5">Added by {rule.createdBy}</p>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => handleToggle(rule)}
                    className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                    title={rule.isActive ? 'Deactivate' : 'Activate'}
                  >
                    {rule.isActive
                      ? <ToggleRight className="w-4 h-4 text-green-500" />
                      : <ToggleLeft className="w-4 h-4 text-gray-400" />}
                  </button>
                  <button
                    onClick={() => openEdit(rule)}
                    className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-gray-500 dark:text-gray-400"
                    title="Edit"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setDeleteTarget(rule)}
                    className="p-2 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors text-gray-500 hover:text-red-600 dark:text-gray-400 dark:hover:text-red-400"
                    title="Delete"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create/Edit slide-over */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-start justify-end">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setShowModal(false)} />
          <div className="relative w-full max-w-md h-full bg-white dark:bg-gray-900 shadow-2xl flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
              <div>
                <h3 className="font-bold text-gray-900 dark:text-gray-100">
                  {editingId ? 'Edit IP Rule' : 'Add IP Rule'}
                </h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Supports exact IPv4 or CIDR notation</p>
              </div>
              <button onClick={() => setShowModal(false)} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
                <X className="w-4 h-4 text-gray-500" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
              {formError && (
                <div className="flex items-center gap-2 p-3 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 rounded-lg">
                  <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0" />
                  <p className="text-sm text-red-700 dark:text-red-300">{formError}</p>
                </div>
              )}

              {/* IP field */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
                  IP Address or CIDR <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={form.ip}
                  onChange={(e) => setForm((p) => ({ ...p, ip: e.target.value }))}
                  placeholder="e.g. 198.51.100.1  or  203.0.113.0/24"
                  className="w-full px-3 py-2 font-mono text-sm bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none text-gray-900 dark:text-gray-100"
                />
                <p className="text-[10px] text-gray-400 mt-1">IPv4 only. CIDR ranges like 203.0.113.0/24 are supported.</p>
              </div>

              {/* Type selector */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-2">Rule Type</label>
                <div className="grid grid-cols-2 gap-2">
                  {(['block', 'allow'] as const).map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setForm((p) => ({ ...p, type: t }))}
                      className={`flex items-center gap-2 px-4 py-3 rounded-lg border text-sm font-semibold transition-all ${form.type === t
                        ? t === 'block'
                          ? 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300 border-red-300 dark:border-red-700 ring-2 ring-red-400 ring-offset-1'
                          : 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300 border-green-300 dark:border-green-700 ring-2 ring-green-400 ring-offset-1'
                        : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-gray-300'
                      }`}
                    >
                      {t === 'block' ? <ShieldOff className="w-4 h-4" /> : <Shield className="w-4 h-4" />}
                      {t === 'block' ? 'Block' : 'Allow'}
                    </button>
                  ))}
                </div>
                {form.type === 'allow' && (
                  <div className="mt-2 flex items-start gap-2 p-2.5 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg">
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-500 flex-shrink-0 mt-0.5" />
                    <p className="text-[11px] text-amber-700 dark:text-amber-400">
                      Adding an allow rule enables allowlist mode — all IPs not on the allowlist will be blocked.
                    </p>
                  </div>
                )}
              </div>

              {/* Description */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Description <span className="font-normal text-gray-400">(optional)</span></label>
                <input
                  type="text"
                  value={form.description}
                  onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
                  placeholder="e.g. Office network, Server cluster..."
                  maxLength={500}
                  className="w-full px-3 py-2 text-sm bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none text-gray-900 dark:text-gray-100"
                />
              </div>

              {/* Active toggle */}
              <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800/60 rounded-lg border border-gray-100 dark:border-gray-700">
                <div>
                  <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Active</p>
                  <p className="text-xs text-gray-400">Enforce this rule immediately</p>
                </div>
                <button
                  type="button"
                  onClick={() => setForm((p) => ({ ...p, isActive: !p.isActive }))}
                  className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none ${form.isActive ? 'bg-indigo-600' : 'bg-gray-200 dark:bg-gray-600'}`}
                >
                  <span className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow transition duration-200 ease-in-out ${form.isActive ? 'translate-x-4' : 'translate-x-0'}`} />
                </button>
              </div>

              {/* IP Gating (global) */}
              <div className="flex items-center justify-between p-3 bg-indigo-50/50 dark:bg-indigo-950/20 rounded-lg border border-indigo-100 dark:border-indigo-900/40">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-gray-700 dark:text-gray-300">IP Gating</p>
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${ipGatingEnabled ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300' : 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400'}`}>
                      {ipGatingEnabled ? 'On' : 'Off'}
                    </span>
                  </div>
                  <p className="text-xs text-gray-400 mt-0.5">Auto-add dynamically detected suspicious IPs as block rules</p>
                </div>
                <button
                  type="button"
                  onClick={handleToggleGating}
                  disabled={gatingLoading}
                  className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none ${ipGatingEnabled ? 'bg-indigo-600' : 'bg-gray-200 dark:bg-gray-600'}`}
                >
                  {gatingLoading ? (
                    <Loader2 className="w-4 h-4 text-white animate-spin" />
                  ) : (
                    <span className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow transition duration-200 ease-in-out ${ipGatingEnabled ? 'translate-x-4' : 'translate-x-0'}`} />
                  )}
                </button>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
              <button onClick={() => setShowModal(false)} className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 transition-colors">
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-2 px-5 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white rounded-lg text-sm font-semibold transition-colors"
              >
                {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                {editingId ? 'Save Changes' : 'Add Rule'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirm */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setDeleteTarget(null)} />
          <div className="relative bg-white dark:bg-gray-800 rounded-2xl shadow-2xl p-6 w-full max-w-md">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                <Trash2 className="w-5 h-5 text-red-600 dark:text-red-400" />
              </div>
              <div>
                <h3 className="font-bold text-gray-900 dark:text-gray-100">Delete IP Rule</h3>
                <p className="text-xs text-gray-500 dark:text-gray-400">This action cannot be undone</p>
              </div>
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
              Delete the{' '}
              <span className={`font-semibold px-1.5 py-0.5 rounded text-xs ${
                deleteTarget.type === 'block'
                  ? 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300'
                  : 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300'
              }`}>
                {deleteTarget.type.toUpperCase()}
              </span>{' '}
              rule for <code className="font-mono text-gray-900 dark:text-gray-100">{deleteTarget.ip}</code>?
              {deleteTarget.type === 'allow' && activeAllowCount === 1 && (
                <span className="block mt-2 text-amber-600 dark:text-amber-400 text-xs">
                  ⚠ This is the last allow rule. Deleting it will disable allowlist mode.
                </span>
              )}
            </p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteTarget(null)} className="flex-1 px-4 py-2.5 text-sm font-medium text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors">
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-red-600 hover:bg-red-700 disabled:bg-red-400 text-white rounded-lg text-sm font-semibold transition-colors"
              >
                {deleting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
