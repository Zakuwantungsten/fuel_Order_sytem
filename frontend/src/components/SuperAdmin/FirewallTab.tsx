import { useState, useEffect, useCallback } from 'react';
import {
  Network, ShieldBan, Gauge, Globe, FileCode2,
  Loader2, Plus, Trash2, Pencil, Save,
  AlertTriangle, Info, X, Search, Ban,
  Siren, Lock,
  Bot, Layers, ShieldCheck, Zap, ArrowUpFromLine,
  Check,
} from 'lucide-react';
import IPRulesTab from './IPRulesTab';
import SecurityBlocklistTab from './SecurityBlocklistTab';
import RateLimitConfigTab from './RateLimitConfigTab';
import ConfirmModal from './ConfirmModal';
import UnifiedTabLoader from './common/UnifiedTabLoader';
import api from '../../services/api';

/* ─── Types ────────────────────────────────────────────────────── */

interface Props {
  onMessage: (type: 'success' | 'error', message: string) => void;
}

type Section = 'ip_rules' | 'autoblock' | 'rate_limits' | 'path_rules' | 'cors' | 'headers' | 'honeypots'
  | 'bot_protection' | 'network_zones' | 'tls' | 'ddos' | 'egress';

interface OverviewStats {
  ipRules: number;
  activeBlocks: number;
  pathRules: number;
  corsEnabled: boolean;
}

/* ─── Path Rules ────────────────────────────────────────────────── */

interface PathRule {
  id?: string;
  pattern: string;
  action: 'block' | 'allow' | 'log';
  methods: string[];
  description: string;
  isActive: boolean;
}

const DEFAULT_PATH_RULE: PathRule = { pattern: '', action: 'block', methods: [], description: '', isActive: true };
const HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD'];
const PATH_ACTION_COLORS: Record<PathRule['action'], string> = {
  block: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300',
  allow: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300',
  log:   'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300',
};

function PathRulesSection({ fwd }: { fwd: (msg: string, type?: 'success' | 'error' | 'info') => void }) {
  const [rules, setRules] = useState<PathRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<PathRule | null>(null);
  const [form, setForm] = useState<PathRule>(DEFAULT_PATH_RULE);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<PathRule | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/system-admin/firewall/path-rules');
      setRules(res.data.data ?? []);
    } catch { setRules([]); } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openCreate = () => { setEditing(null); setForm(DEFAULT_PATH_RULE); setShowModal(true); };
  const openEdit = (r: PathRule) => { setEditing(r); setForm({ ...r }); setShowModal(true); };

  const handleSave = async () => {
    if (!form.pattern.trim()) { fwd('Pattern is required', 'error'); return; }
    setSaving(true);
    try {
      if (editing?.id) {
        await api.put(`/system-admin/firewall/path-rules/${editing.id}`, form);
        fwd('Path rule updated', 'success');
      } else {
        await api.post('/system-admin/firewall/path-rules', form);
        fwd('Path rule created', 'success');
      }
      setShowModal(false);
      load();
    } catch (e: any) {
      fwd(e.response?.data?.message || 'Failed to save path rule', 'error');
    } finally { setSaving(false); }
  };

  const handleDelete = async () => {
    if (!deleteTarget?.id) return;
    setDeleting(true);
    try {
      await api.delete(`/system-admin/firewall/path-rules/${deleteTarget.id}`);
      fwd('Path rule deleted', 'success');
      setDeleteTarget(null);
      load();
    } catch { fwd('Failed to delete path rule', 'error'); } finally { setDeleting(false); }
  };

  const handleToggle = async (r: PathRule) => {
    try {
      await api.put(`/system-admin/firewall/path-rules/${r.id}`, { ...r, isActive: !r.isActive });
      setRules(prev => prev.map(x => x.id === r.id ? { ...x, isActive: !x.isActive } : x));
    } catch { fwd('Failed to update rule', 'error'); }
  };

  const filtered = rules.filter(r =>
    r.pattern.toLowerCase().includes(search.toLowerCase()) ||
    r.description.toLowerCase().includes(search.toLowerCase())
  );

  if (loading) return <UnifiedTabLoader label="Loading path rules..." heightClassName="py-12" />;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="font-medium text-gray-900 dark:text-gray-100">Path / Route Block Rules</h3>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Block, allow, or log requests matching specific URL path patterns</p>
        </div>
        <button onClick={openCreate} className="flex items-center gap-1.5 px-3 py-1.5 bg-orange-600 hover:bg-orange-700 text-white text-sm font-medium rounded-lg transition-colors">
          <Plus className="w-4 h-4" /> Add Rule
        </button>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search patterns…"
          className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white"
        />
      </div>

      {/* List */}
      {filtered.length === 0 ? (
        <div className="text-center py-10 text-gray-400 text-sm border border-dashed border-gray-200 dark:border-gray-700 rounded-xl">
          {search ? 'No rules match your search.' : 'No path rules configured. Add a rule to get started.'}
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((r, i) => (
            <div
              key={r.id ?? i}
              className={`flex items-center gap-3 px-4 py-3 bg-white dark:bg-gray-800 border rounded-xl transition-opacity ${
                r.isActive ? 'border-gray-200 dark:border-gray-700' : 'border-gray-100 dark:border-gray-700/40 opacity-60'
              }`}
            >
              <button onClick={() => handleToggle(r)} className="shrink-0">
                {r.isActive
                  ? <FwSwitch on={true} />
                  : <FwSwitch on={false} />}
              </button>
              <code className="text-sm font-mono text-gray-900 dark:text-gray-100 flex-1 truncate min-w-0">{r.pattern}</code>
              <span className={`px-2 py-0.5 rounded-full text-xs font-medium shrink-0 ${PATH_ACTION_COLORS[r.action]}`}>
                {r.action.toUpperCase()}
              </span>
              {r.methods.length > 0 && (
                <span className="text-xs text-gray-400 hidden sm:inline shrink-0">{r.methods.join(', ')}</span>
              )}
              {r.description && (
                <span className="text-xs text-gray-500 dark:text-gray-400 truncate hidden md:inline flex-1 min-w-0">{r.description}</span>
              )}
              <div className="flex gap-1 shrink-0">
                <button onClick={() => openEdit(r)} className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors">
                  <Pencil className="w-3.5 h-3.5" />
                </button>
                <button onClick={() => setDeleteTarget(r)} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 w-full max-w-lg shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-700">
              <h3 className="font-medium text-gray-900 dark:text-gray-100">{editing ? 'Edit' : 'Add'} Path Rule</h3>
              <button onClick={() => setShowModal(false)} className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  URL Pattern <span className="text-red-500">*</span>
                </label>
                <input
                  value={form.pattern}
                  onChange={e => setForm(p => ({ ...p, pattern: e.target.value }))}
                  placeholder="e.g. /wp-admin/* or /.env"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm font-mono"
                />
                <p className="text-xs text-gray-400 mt-1">Use <code>*</code> as wildcard, e.g. <code>/admin/*</code></p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Action</label>
                  <select
                    value={form.action}
                    onChange={e => setForm(p => ({ ...p, action: e.target.value as PathRule['action'] }))}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                  >
                    <option value="block">Block (403)</option>
                    <option value="allow">Allow (whitelist)</option>
                    <option value="log">Log only</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Active</label>
                  <select
                    value={form.isActive ? '1' : '0'}
                    onChange={e => setForm(p => ({ ...p, isActive: e.target.value === '1' }))}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                  >
                    <option value="1">Yes</option>
                    <option value="0">No (disabled)</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  HTTP Methods <span className="text-gray-400 font-normal">(leave empty = all)</span>
                </label>
                <div className="flex flex-wrap gap-3">
                  {HTTP_METHODS.map(m => (
                    <label key={m} className="flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={form.methods.includes(m)}
                        onChange={e => setForm(p => ({
                          ...p,
                          methods: e.target.checked ? [...p.methods, m] : p.methods.filter(x => x !== m),
                        }))}
                        className="rounded border-gray-300"
                      />
                      <span className="text-xs font-mono text-gray-700 dark:text-gray-300">{m}</span>
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Description</label>
                <input
                  value={form.description}
                  onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
                  placeholder="What does this rule block/allow?"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 px-6 py-4 border-t border-gray-100 dark:border-gray-700">
              <button onClick={() => setShowModal(false)} className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-lg transition-colors">
                Cancel
              </button>
              <button
                onClick={handleSave} disabled={saving}
                className="flex items-center gap-2 px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white text-sm font-medium rounded-lg disabled:opacity-50 transition-colors"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                {editing ? 'Update' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmModal
        open={!!deleteTarget}
        title="Delete Path Rule"
        message={`Remove rule for pattern "${deleteTarget?.pattern}"? This cannot be undone.`}
        confirmLabel="Delete"
        variant="danger"
        loading={deleting}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}

/* ─── CORS Policy ───────────────────────────────────────────────── */

const CORS_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD'];

interface CorsConfig {
  enabled: boolean;
  allowedOrigins: string;
  allowedMethods: string[];
  allowedHeaders: string;
  exposeHeaders: string;
  allowCredentials: boolean;
  maxAge: number;
}

const DEFAULT_CORS: CorsConfig = {
  enabled: true,
  allowedOrigins: '',
  allowedMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: 'Content-Type, Authorization, X-Requested-With',
  exposeHeaders: '',
  allowCredentials: true,
  maxAge: 86400,
};

function CorsSection({ fwd }: { fwd: (msg: string, type?: 'success' | 'error' | 'info') => void }) {
  const [config, setConfig] = useState<CorsConfig>(DEFAULT_CORS);
  const [draft, setDraft] = useState<CorsConfig>(DEFAULT_CORS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/system-admin/firewall/cors');
      const cfg = { ...DEFAULT_CORS, ...res.data.data };
      setConfig(cfg);
      setDraft(cfg);
    } catch { /* use defaults */ } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.put('/system-admin/firewall/cors', draft);
      setConfig(draft);
      fwd('CORS policy saved', 'success');
    } catch (e: any) {
      fwd(e.response?.data?.message || 'Failed to save CORS policy', 'error');
    } finally { setSaving(false); }
  };

  const isDirty = JSON.stringify(draft) !== JSON.stringify(config);

  if (loading) return <UnifiedTabLoader label="Loading CORS policy..." heightClassName="py-12" />;

  return (
    <div className="space-y-5">
      <div>
        <h3 className="font-medium text-gray-900 dark:text-gray-100">CORS Policy</h3>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
          Control which origins, methods, and headers are permitted for cross-origin browser requests
        </p>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-700 overflow-hidden">
        {/* Master toggle */}
        <div className="flex items-center justify-between px-5 py-4">
          <div>
            <p className="text-sm font-medium text-gray-900 dark:text-gray-100">CORS Enforcement</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">Enable CORS header validation and policy enforcement</p>
          </div>
          <button onClick={() => setDraft(p => ({ ...p, enabled: !p.enabled }))}>
            {draft.enabled
              ? <FwSwitch on={true} />
              : <FwSwitch on={false} />}
          </button>
        </div>

        {draft.enabled && (
          <>
            {/* Allowed Origins */}
            <div className="px-5 py-4 space-y-2">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Allowed Origins</label>
              <textarea
                rows={3}
                value={draft.allowedOrigins}
                onChange={e => setDraft(p => ({ ...p, allowedOrigins: e.target.value }))}
                placeholder={'https://example.com\nhttps://app.example.com\nhttp://localhost:3000'}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm font-mono resize-none"
              />
              <p className="text-xs text-gray-400">One origin per line. Use <code>*</code> to allow all (not recommended when credentials are enabled)</p>
            </div>

            {/* Allowed Methods */}
            <div className="px-5 py-4 space-y-2">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Allowed HTTP Methods</label>
              <div className="flex flex-wrap gap-3">
                {CORS_METHODS.map(m => (
                  <label key={m} className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={draft.allowedMethods.includes(m)}
                      onChange={e => setDraft(p => ({
                        ...p,
                        allowedMethods: e.target.checked ? [...p.allowedMethods, m] : p.allowedMethods.filter(x => x !== m),
                      }))}
                      className="rounded border-gray-300"
                    />
                    <span className="text-xs font-mono font-medium text-gray-700 dark:text-gray-300">{m}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Headers */}
            <div className="px-5 py-4 grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Allowed Request Headers</label>
                <input
                  value={draft.allowedHeaders}
                  onChange={e => setDraft(p => ({ ...p, allowedHeaders: e.target.value }))}
                  placeholder="Content-Type, Authorization"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                />
              </div>
              <div className="space-y-1">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Expose Headers to Browser</label>
                <input
                  value={draft.exposeHeaders}
                  onChange={e => setDraft(p => ({ ...p, exposeHeaders: e.target.value }))}
                  placeholder="X-Total-Count, X-Page"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                />
              </div>
            </div>

            {/* Credentials + Max Age */}
            <div className="px-5 py-4 grid grid-cols-1 md:grid-cols-2 gap-4 items-center">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Allow Credentials</p>
                  <p className="text-xs text-gray-400">Send cookies / auth headers cross-origin</p>
                </div>
                <button onClick={() => setDraft(p => ({ ...p, allowCredentials: !p.allowCredentials }))}>
                  {draft.allowCredentials
                    ? <FwSwitch on={true} />
                    : <FwSwitch on={false} />}
                </button>
              </div>
              <div className="space-y-1">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Preflight Cache (max-age, seconds)</label>
                <input
                  type="number" min={0} max={86400}
                  value={draft.maxAge}
                  onChange={e => setDraft(p => ({ ...p, maxAge: Number(e.target.value) }))}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                />
                <p className="text-xs text-gray-400">0–86400 seconds. 86400 = 1 day.</p>
              </div>
            </div>
          </>
        )}
      </div>

      {isDirty && (
        <div className="flex items-center gap-2 text-sm text-amber-600 dark:text-amber-400">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" /> You have unsaved changes.
        </div>
      )}
      <div className="flex justify-end">
        <button
          onClick={handleSave} disabled={saving || !isDirty}
          className="flex items-center gap-2 px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white text-sm font-medium rounded-lg disabled:opacity-50 transition-colors"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Save CORS Policy
        </button>
      </div>
    </div>
  );
}

/* ─── Security Headers ──────────────────────────────────────────── */

interface SecHeadersConfig {
  hstsEnabled: boolean;
  hstsMaxAge: number;
  hstsIncludeSubdomains: boolean;
  hstsPreload: boolean;
  xFrameOptions: 'DENY' | 'SAMEORIGIN' | 'disabled';
  xContentTypeOptions: boolean;
  referrerPolicy: string;
  cspEnabled: boolean;
  cspDirectives: string;
  permissionsPolicyEnabled: boolean;
  permissionsPolicy: string;
}

const DEFAULT_HEADERS: SecHeadersConfig = {
  hstsEnabled: true,
  hstsMaxAge: 31536000,
  hstsIncludeSubdomains: true,
  hstsPreload: false,
  xFrameOptions: 'DENY',
  xContentTypeOptions: true,
  referrerPolicy: 'strict-origin-when-cross-origin',
  cspEnabled: false,
  cspDirectives: "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:;",
  permissionsPolicyEnabled: false,
  permissionsPolicy: 'camera=(), microphone=(), geolocation=()',
};

function SecHeadersSection({ fwd }: { fwd: (msg: string, type?: 'success' | 'error' | 'info') => void }) {
  const [config, setConfig] = useState<SecHeadersConfig>(DEFAULT_HEADERS);
  const [draft, setDraft] = useState<SecHeadersConfig>(DEFAULT_HEADERS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/system-admin/firewall/security-headers');
      const cfg = { ...DEFAULT_HEADERS, ...res.data.data };
      setConfig(cfg);
      setDraft(cfg);
    } catch { /* use defaults */ } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.put('/system-admin/firewall/security-headers', draft);
      setConfig(draft);
      fwd('Security headers saved', 'success');
    } catch (e: any) {
      fwd(e.response?.data?.message || 'Failed to save security headers', 'error');
    } finally { setSaving(false); }
  };

  const isDirty = JSON.stringify(draft) !== JSON.stringify(config);
  const toggle = (key: keyof SecHeadersConfig) =>
    setDraft(p => ({ ...p, [key]: !p[key as keyof SecHeadersConfig] }));

  if (loading) return <UnifiedTabLoader label="Loading security headers..." heightClassName="py-12" />;

  return (
    <div className="space-y-5">
      <div>
        <h3 className="font-medium text-gray-900 dark:text-gray-100">HTTP Security Headers</h3>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Configure response headers that protect browsers from common web attacks</p>
      </div>

      <div className="space-y-3">
        {/* HSTS */}
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4">
            <div>
              <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                HSTS <span className="text-xs font-normal text-gray-400 ml-1">(HTTP Strict Transport Security)</span>
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400">Forces browsers to use HTTPS for all future requests to this domain</p>
            </div>
            <button onClick={() => toggle('hstsEnabled')}>
              {draft.hstsEnabled
                ? <FwSwitch on={true} />
                : <FwSwitch on={false} />}
            </button>
          </div>
          {draft.hstsEnabled && (
            <div className="px-5 pb-4 space-y-3 border-t border-gray-100 dark:border-gray-700/50 pt-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-end">
                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">max-age (seconds)</label>
                  <input
                    type="number"
                    value={draft.hstsMaxAge}
                    onChange={e => setDraft(p => ({ ...p, hstsMaxAge: Number(e.target.value) }))}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                  />
                  <p className="text-[10px] text-gray-400 mt-0.5">31536000 = 1 year (recommended)</p>
                </div>
                <label className="flex items-center gap-2 cursor-pointer pb-1">
                  <input
                    type="checkbox" id="hsts-sub"
                    checked={draft.hstsIncludeSubdomains}
                    onChange={e => setDraft(p => ({ ...p, hstsIncludeSubdomains: e.target.checked }))}
                    className="rounded"
                  />
                  <span className="text-sm text-gray-700 dark:text-gray-300">includeSubDomains</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer pb-1">
                  <input
                    type="checkbox"
                    checked={draft.hstsPreload}
                    onChange={e => setDraft(p => ({ ...p, hstsPreload: e.target.checked }))}
                    className="rounded"
                  />
                  <span className="text-sm text-gray-700 dark:text-gray-300">preload</span>
                </label>
              </div>
              <code className="block text-xs bg-gray-50 dark:bg-gray-700/50 px-3 py-2 rounded font-mono text-gray-600 dark:text-gray-300">
                Strict-Transport-Security: max-age={draft.hstsMaxAge}
                {draft.hstsIncludeSubdomains ? '; includeSubDomains' : ''}
                {draft.hstsPreload ? '; preload' : ''}
              </code>
            </div>
          )}
        </div>

        {/* X-Frame-Options */}
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 px-5 py-4 space-y-3">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-gray-900 dark:text-gray-100">X-Frame-Options</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">Prevent clickjacking by controlling iframe embedding</p>
            </div>
            <select
              value={draft.xFrameOptions}
              onChange={e => setDraft(p => ({ ...p, xFrameOptions: e.target.value as SecHeadersConfig['xFrameOptions'] }))}
              className="px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm shrink-0"
            >
              <option value="DENY">DENY</option>
              <option value="SAMEORIGIN">SAMEORIGIN</option>
              <option value="disabled">Disabled</option>
            </select>
          </div>
          {draft.xFrameOptions !== 'disabled' && (
            <code className="block text-xs bg-gray-50 dark:bg-gray-700/50 px-3 py-2 rounded font-mono text-gray-600 dark:text-gray-300">
              X-Frame-Options: {draft.xFrameOptions}
            </code>
          )}
        </div>

        {/* X-Content-Type-Options */}
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 px-5 py-4 flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-gray-900 dark:text-gray-100">X-Content-Type-Options: nosniff</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">Prevent MIME-type sniffing attacks</p>
          </div>
          <button onClick={() => toggle('xContentTypeOptions')}>
            {draft.xContentTypeOptions
              ? <FwSwitch on={true} />
              : <FwSwitch on={false} />}
          </button>
        </div>

        {/* Referrer-Policy */}
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 px-5 py-4 flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-gray-900 dark:text-gray-100">Referrer-Policy</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">Controls how much referrer information is sent with outbound requests</p>
          </div>
          <select
            value={draft.referrerPolicy}
            onChange={e => setDraft(p => ({ ...p, referrerPolicy: e.target.value }))}
            className="px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm max-w-[270px] shrink-0"
          >
            <option value="no-referrer">no-referrer</option>
            <option value="no-referrer-when-downgrade">no-referrer-when-downgrade</option>
            <option value="same-origin">same-origin</option>
            <option value="origin">origin</option>
            <option value="strict-origin">strict-origin</option>
            <option value="origin-when-cross-origin">origin-when-cross-origin</option>
            <option value="strict-origin-when-cross-origin">strict-origin-when-cross-origin ✓</option>
            <option value="unsafe-url">unsafe-url</option>
          </select>
        </div>

        {/* Content-Security-Policy */}
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4">
            <div>
              <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                Content-Security-Policy <span className="text-xs font-normal text-gray-400 ml-1">(CSP)</span>
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400">Restrict sources for scripts, styles, fonts, images, and other resources</p>
            </div>
            <button onClick={() => toggle('cspEnabled')}>
              {draft.cspEnabled
                ? <FwSwitch on={true} />
                : <FwSwitch on={false} />}
            </button>
          </div>
          {draft.cspEnabled && (
            <div className="px-5 pb-4 space-y-2 border-t border-gray-100 dark:border-gray-700/50 pt-4">
              <div className="flex items-start gap-2 p-2.5 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
                <p className="text-xs text-amber-700 dark:text-amber-300">
                  Test CSP thoroughly before enabling in production — an incorrect policy will break the application.
                </p>
              </div>
              <textarea
                rows={5}
                value={draft.cspDirectives}
                onChange={e => setDraft(p => ({ ...p, cspDirectives: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-xs font-mono resize-none"
              />
            </div>
          )}
        </div>

        {/* Permissions-Policy */}
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4">
            <div>
              <p className="text-sm font-medium text-gray-900 dark:text-gray-100">Permissions-Policy</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">Restrict browser features: camera, microphone, geolocation, etc.</p>
            </div>
            <button onClick={() => toggle('permissionsPolicyEnabled')}>
              {draft.permissionsPolicyEnabled
                ? <FwSwitch on={true} />
                : <FwSwitch on={false} />}
            </button>
          </div>
          {draft.permissionsPolicyEnabled && (
            <div className="px-5 pb-4 space-y-2 border-t border-gray-100 dark:border-gray-700/50 pt-4">
              <textarea
                rows={3}
                value={draft.permissionsPolicy}
                onChange={e => setDraft(p => ({ ...p, permissionsPolicy: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-xs font-mono resize-none"
              />
              <p className="text-xs text-gray-400">e.g. <code>camera=(), microphone=(), geolocation=()</code></p>
            </div>
          )}
        </div>
      </div>

      {isDirty && (
        <div className="flex items-center gap-2 text-sm text-amber-600 dark:text-amber-400">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" /> You have unsaved changes.
        </div>
      )}
      <div className="flex justify-end">
        <button
          onClick={handleSave} disabled={saving || !isDirty}
          className="flex items-center gap-2 px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white text-sm font-medium rounded-lg disabled:opacity-50 transition-colors"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Save Headers
        </button>
      </div>
    </div>
  );
}

/* ─── Honeypots ─────────────────────────────────────────────────── */

interface HoneypotPath {
  id?: string;
  path: string;
  description: string;
  action: 'block' | 'log' | 'alert';
  isActive: boolean;
}

const DEFAULT_HONEYPOT: HoneypotPath = { path: '', description: '', action: 'block', isActive: true };
const HONEYPOT_ACTION_COLORS: Record<HoneypotPath['action'], string> = {
  block: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300',
  alert: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300',
  log:   'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300',
};

function HoneypotsSection({ fwd }: { fwd: (msg: string, type?: 'success' | 'error' | 'info') => void }) {
  const [paths, setPaths] = useState<HoneypotPath[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<HoneypotPath | null>(null);
  const [form, setForm] = useState<HoneypotPath>(DEFAULT_HONEYPOT);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<HoneypotPath | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/system-admin/firewall/honeypots');
      setPaths(res.data.data ?? []);
    } catch { setPaths([]); } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openCreate = () => { setEditing(null); setForm(DEFAULT_HONEYPOT); setShowModal(true); };
  const openEdit = (h: HoneypotPath) => { setEditing(h); setForm({ ...h }); setShowModal(true); };

  const handleSave = async () => {
    if (!form.path.trim()) { fwd('Path is required', 'error'); return; }
    setSaving(true);
    try {
      if (editing?.id) {
        await api.put(`/system-admin/firewall/honeypots/${editing.id}`, form);
        fwd('Honeypot path updated', 'success');
      } else {
        await api.post('/system-admin/firewall/honeypots', form);
        fwd('Honeypot path added', 'success');
      }
      setShowModal(false);
      load();
    } catch (e: any) {
      fwd(e.response?.data?.message || 'Failed to save honeypot path', 'error');
    } finally { setSaving(false); }
  };

  const handleDelete = async () => {
    if (!deleteTarget?.id) return;
    setDeleting(true);
    try {
      await api.delete(`/system-admin/firewall/honeypots/${deleteTarget.id}`);
      fwd('Honeypot path removed', 'success');
      setDeleteTarget(null);
      load();
    } catch { fwd('Failed to remove honeypot path', 'error'); } finally { setDeleting(false); }
  };

  const handleToggle = async (h: HoneypotPath) => {
    try {
      await api.put(`/system-admin/firewall/honeypots/${h.id}`, { ...h, isActive: !h.isActive });
      setPaths(prev => prev.map(x => x.id === h.id ? { ...x, isActive: !x.isActive } : x));
    } catch { fwd('Failed to update honeypot', 'error'); }
  };

  if (loading) return <UnifiedTabLoader label="Loading honeypot paths..." heightClassName="py-12" />;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="font-medium text-gray-900 dark:text-gray-100">Honeypot Paths</h3>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            Trap paths no legitimate user should access — any hit signals an attacker or scanner
          </p>
        </div>
        <button onClick={openCreate} className="flex items-center gap-1.5 px-3 py-1.5 bg-orange-600 hover:bg-orange-700 text-white text-sm font-medium rounded-lg transition-colors">
          <Plus className="w-4 h-4" /> Add Path
        </button>
      </div>

      {/* Info */}
      <div className="flex items-start gap-2 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl">
        <Siren className="w-4 h-4 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
        <p className="text-xs text-blue-700 dark:text-blue-300">
          Honeypots are decoy endpoints not linked anywhere in the app. Any request reaching them is automatically suspicious.
          Events appear in <strong>Security Events</strong> as <code>honeypot_hit</code>.
          Set action to <strong>Block</strong> to auto-ban the requesting IP immediately.
        </p>
      </div>

      {/* List */}
      {paths.length === 0 ? (
        <div className="text-center py-10 text-gray-400 text-sm border border-dashed border-gray-200 dark:border-gray-700 rounded-xl">
          No honeypot paths configured. Add a path to start trapping scanners.
        </div>
      ) : (
        <div className="space-y-2">
          {paths.map((h, i) => (
            <div
              key={h.id ?? i}
              className={`flex items-center gap-3 px-4 py-3 bg-white dark:bg-gray-800 border rounded-xl transition-opacity ${
                h.isActive ? 'border-gray-200 dark:border-gray-700' : 'border-gray-100 dark:border-gray-700/40 opacity-60'
              }`}
            >
              <button onClick={() => handleToggle(h)} className="shrink-0">
                {h.isActive
                  ? <FwSwitch on={true} />
                  : <FwSwitch on={false} />}
              </button>
              <Siren className={`w-4 h-4 shrink-0 ${h.isActive ? 'text-amber-500' : 'text-gray-300'}`} />
              <code className="text-sm font-mono text-gray-900 dark:text-gray-100 flex-1 truncate min-w-0">{h.path}</code>
              <span className={`px-2 py-0.5 rounded-full text-xs font-medium shrink-0 ${HONEYPOT_ACTION_COLORS[h.action]}`}>
                {h.action.toUpperCase()}
              </span>
              {h.description && (
                <span className="text-xs text-gray-500 dark:text-gray-400 truncate hidden md:inline flex-1 min-w-0">{h.description}</span>
              )}
              <div className="flex gap-1 shrink-0">
                <button onClick={() => openEdit(h)} className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors">
                  <Pencil className="w-3.5 h-3.5" />
                </button>
                <button onClick={() => setDeleteTarget(h)} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-700">
              <h3 className="font-medium text-gray-900 dark:text-gray-100">{editing ? 'Edit' : 'Add'} Honeypot</h3>
              <button onClick={() => setShowModal(false)} className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Path <span className="text-red-500">*</span>
                </label>
                <input
                  value={form.path}
                  onChange={e => setForm(p => ({ ...p, path: e.target.value }))}
                  placeholder="/admin-portal"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm font-mono"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Action on Hit</label>
                <select
                  value={form.action}
                  onChange={e => setForm(p => ({ ...p, action: e.target.value as HoneypotPath['action'] }))}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                >
                  <option value="block">Block IP immediately</option>
                  <option value="alert">Alert + log (no block)</option>
                  <option value="log">Log only</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Description</label>
                <input
                  value={form.description}
                  onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
                  placeholder="Trap for WordPress scanners"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 px-6 py-4 border-t border-gray-100 dark:border-gray-700">
              <button onClick={() => setShowModal(false)} className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-lg transition-colors">
                Cancel
              </button>
              <button
                onClick={handleSave} disabled={saving}
                className="flex items-center gap-2 px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white text-sm font-medium rounded-lg disabled:opacity-50 transition-colors"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                {editing ? 'Update' : 'Add'}
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmModal
        open={!!deleteTarget}
        title="Remove Honeypot"
        message={`Remove honeypot at "${deleteTarget?.path}"?`}
        confirmLabel="Remove"
        variant="danger"
        loading={deleting}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}

/* ─── Main FirewallTab ──────────────────────────────────────────── */

/* ─── Bot Protection ────────────────────────────────────────────── */

interface BotConfig {
  enabled: boolean;
  action: 'block' | 'challenge' | 'log';
  botScoreThreshold: number;
  blockEmptyUA: boolean;
  challengeMode: boolean;
  userAgentBlocklist: string[];
  userAgentAllowlist: string[];
}

const DEFAULT_BOT: BotConfig = {
  enabled: true,
  action: 'block',
  botScoreThreshold: 70,
  blockEmptyUA: false,
  challengeMode: false,
  userAgentBlocklist: [
    'nikto','sqlmap','nmap','masscan','zmap','dirbuster','gobuster','dirb','wfuzz','ffuf',
    'nuclei','acunetix','nessus','openvas','qualys','burpsuite','owasp zap','arachni','w3af',
    'skipfish','webscarab','havij','metasploit','commix','hydra','medusa/','slowloris',
    'slowhttptest','hping','loic','semrushbot','ahrefsbot','mj12bot','dotbot','blexbot',
    'petalbot','megaindex','bytespider','sogou','yandexbot','python-requests','python-urllib',
    'python-httpx','go-http-client','ruby/','perl/','libwww-perl','wget/','curl/7.','curl/8.',
    'httpie','axios/','node-fetch','java/','apache-httpclient','okhttp','phantomjs',
    'headlesschrome','selenium','webdriver','puppeteer','playwright','zgrab','censys','shodan',
    'httrack','scrapy','wpscan','wpscanner','wp-login',
  ],
  userAgentAllowlist: [
    'Googlebot','Googlebot-Image','Bingbot','msnbot','Slurp','DuckDuckBot','Baiduspider',
    'Applebot','Twitterbot','facebot','facebookexternalhit','LinkedInBot','WhatsApp',
    'Discordbot','TelegramBot','Slackbot','ia_archiver','archive.org_bot','CCBot',
    'MojeekBot','SeznamBot',
  ],
};

function BotProtectionSection({ fwd }: { fwd: (msg: string, type?: 'success' | 'error' | 'info') => void }) {
  const [config, setConfig] = useState<BotConfig>(DEFAULT_BOT);
  const [draft, setDraft] = useState<BotConfig>(DEFAULT_BOT);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [newBlockUA, setNewBlockUA] = useState('');
  const [newAllowUA, setNewAllowUA] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/system-admin/firewall/bot-protection');
      const cfg = { ...DEFAULT_BOT, ...res.data.data };
      setConfig(cfg); setDraft(cfg);
    } catch { /* use defaults */ } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.put('/system-admin/firewall/bot-protection', draft);
      setConfig(draft);
      fwd('Bot protection config saved', 'success');
    } catch (e: any) { fwd(e.response?.data?.message || 'Failed to save', 'error'); }
    finally { setSaving(false); }
  };

  const addUA = (list: 'userAgentBlocklist' | 'userAgentAllowlist', value: string, clear: () => void) => {
    if (!value.trim()) return;
    setDraft(p => ({ ...p, [list]: [...p[list], value.trim()] }));
    clear();
  };
  const removeUA = (list: 'userAgentBlocklist' | 'userAgentAllowlist', idx: number) =>
    setDraft(p => ({ ...p, [list]: p[list].filter((_, i) => i !== idx) }));

  const isDirty = JSON.stringify(draft) !== JSON.stringify(config);
  if (loading) return <UnifiedTabLoader label="Loading bot protection config..." heightClassName="py-12" />;

  return (
    <div className="space-y-5">
      <div>
        <h3 className="font-medium text-gray-900 dark:text-gray-100">Bot Protection Rules</h3>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
          Detect and block automated bots, scrapers, and vulnerability scanners based on User-Agent patterns
        </p>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-700 overflow-hidden">
        {/* Master toggle */}
        <div className="flex items-center justify-between px-5 py-4">
          <div>
            <p className="text-sm font-medium text-gray-900 dark:text-gray-100">Bot Protection Enforcement</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">Enable User-Agent based bot filtering</p>
          </div>
          <button onClick={() => setDraft(p => ({ ...p, enabled: !p.enabled }))}>
            {draft.enabled ? <FwSwitch on={true} /> : <FwSwitch on={false} />}
          </button>
        </div>

        {draft.enabled && (<>
          {/* Action + Threshold */}
          <div className="px-5 py-4 grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Action on Detection</label>
              <select
                value={draft.action}
                onChange={e => setDraft(p => ({ ...p, action: e.target.value as BotConfig['action'] }))}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
              >
                <option value="block">Block (403)</option>
                <option value="log">Log only</option>
                <option value="challenge">Challenge (future CAPTCHA)</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Bot Score Threshold (0–100)</label>
              <input
                type="number" min={0} max={100}
                value={draft.botScoreThreshold}
                onChange={e => setDraft(p => ({ ...p, botScoreThreshold: Number(e.target.value) }))}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
              />
              <p className="text-[10px] text-gray-400 mt-0.5">Requests scoring ≥ threshold are treated as bots</p>
            </div>
            <div className="flex items-center gap-3 pt-5">
              <button onClick={() => setDraft(p => ({ ...p, blockEmptyUA: !p.blockEmptyUA }))}>
                {draft.blockEmptyUA ? <FwSwitch on={true} /> : <FwSwitch on={false} />}
              </button>
              <div>
                <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Block Empty User-Agent</p>
                <p className="text-xs text-gray-400">Block requests with no UA header</p>
              </div>
            </div>
          </div>

          {/* UA Blocklist */}
          <div className="px-5 py-4 space-y-3">
            <div>
              <p className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-1">User-Agent Blocklist</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">Substring matches — any request whose UA contains one of these strings is treated as a bot</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {draft.userAgentBlocklist.map((ua, i) => (
                <span key={i} className="flex items-center gap-1 px-2.5 py-1 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800 rounded-full text-xs font-mono">
                  {ua}
                  <button onClick={() => removeUA('userAgentBlocklist', i)} className="hover:text-red-900 dark:hover:text-red-100 ml-0.5">
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                value={newBlockUA} onChange={e => setNewBlockUA(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { addUA('userAgentBlocklist', newBlockUA, () => setNewBlockUA('')); } }}
                placeholder="UA substring to block…"
                className="flex-1 px-3 py-2 text-xs border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white font-mono"
              />
              <button
                onClick={() => addUA('userAgentBlocklist', newBlockUA, () => setNewBlockUA(''))}
                className="px-3 py-2 bg-red-600 hover:bg-red-700 text-white text-xs rounded-lg transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* UA Allowlist */}
          <div className="px-5 py-4 space-y-3">
            <div>
              <p className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-1">Known Good Bot Allowlist</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">These UAs are always allowed regardless of bot score (search engines, social crawlers, etc.)</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {draft.userAgentAllowlist.map((ua, i) => (
                <span key={i} className="flex items-center gap-1 px-2.5 py-1 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300 border border-green-200 dark:border-green-800 rounded-full text-xs font-mono">
                  <Check className="w-3 h-3 flex-shrink-0" />
                  {ua}
                  <button onClick={() => removeUA('userAgentAllowlist', i)} className="hover:text-green-900 dark:hover:text-green-100 ml-0.5">
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                value={newAllowUA} onChange={e => setNewAllowUA(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { addUA('userAgentAllowlist', newAllowUA, () => setNewAllowUA('')); } }}
                placeholder="Bot UA to allow (e.g. Googlebot)…"
                className="flex-1 px-3 py-2 text-xs border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white font-mono"
              />
              <button
                onClick={() => addUA('userAgentAllowlist', newAllowUA, () => setNewAllowUA(''))}
                className="px-3 py-2 bg-green-600 hover:bg-green-700 text-white text-xs rounded-lg transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </>)}
      </div>

      {isDirty && (
        <div className="flex items-center gap-2 text-sm text-amber-600 dark:text-amber-400">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" /> You have unsaved changes.
        </div>
      )}
      <div className="flex justify-end">
        <button onClick={handleSave} disabled={saving || !isDirty}
          className="flex items-center gap-2 px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white text-sm font-medium rounded-lg disabled:opacity-50 transition-colors">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Save Bot Protection
        </button>
      </div>
    </div>
  );
}

/* ─── Network Zones ─────────────────────────────────────────────── */

interface NetworkZone {
  id?: string;
  name: string;
  description: string;
  cidrs: string[];
  color: string;
  isBuiltIn?: boolean;
  isActive: boolean;
}

const ZONE_COLORS = ['#6366f1','#3b82f6','#10b981','#f59e0b','#ef4444','#8b5cf6','#ec4899','#14b8a6'];
const DEFAULT_ZONE: NetworkZone = { name: '', description: '', cidrs: [], color: '#6366f1', isActive: true };

function NetworkZonesSection({ fwd }: { fwd: (msg: string, type?: 'success' | 'error' | 'info') => void }) {
  const [zones, setZones] = useState<NetworkZone[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<NetworkZone | null>(null);
  const [form, setForm] = useState<NetworkZone>(DEFAULT_ZONE);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<NetworkZone | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [newCidr, setNewCidr] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/system-admin/firewall/network-zones');
      setZones(res.data.data ?? []);
    } catch { setZones([]); } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const openCreate = () => { setEditing(null); setForm(DEFAULT_ZONE); setNewCidr(''); setShowModal(true); };
  const openEdit = (z: NetworkZone) => { setEditing(z); setForm({ ...z }); setNewCidr(''); setShowModal(true); };

  const addCidr = () => {
    if (!newCidr.trim()) return;
    setForm(p => ({ ...p, cidrs: [...p.cidrs, newCidr.trim()] }));
    setNewCidr('');
  };
  const removeCidr = (idx: number) => setForm(p => ({ ...p, cidrs: p.cidrs.filter((_, i) => i !== idx) }));

  const handleSave = async () => {
    if (!form.name.trim()) { fwd('Zone name is required', 'error'); return; }
    if (form.cidrs.length === 0) { fwd('At least one CIDR or IP is required', 'error'); return; }
    setSaving(true);
    try {
      if (editing?.id) {
        await api.put(`/system-admin/firewall/network-zones/${editing.id}`, form);
        fwd('Network zone updated', 'success');
      } else {
        await api.post('/system-admin/firewall/network-zones', form);
        fwd('Network zone created', 'success');
      }
      setShowModal(false); load();
    } catch (e: any) { fwd(e.response?.data?.message || 'Failed to save zone', 'error'); }
    finally { setSaving(false); }
  };

  const handleDelete = async () => {
    if (!deleteTarget?.id) return;
    setDeleting(true);
    try {
      await api.delete(`/system-admin/firewall/network-zones/${deleteTarget.id}`);
      fwd('Zone deleted', 'success');
      setDeleteTarget(null); load();
    } catch (e: any) { fwd(e.response?.data?.message || 'Failed to delete zone', 'error'); }
    finally { setDeleting(false); }
  };

  if (loading) return <UnifiedTabLoader label="Loading network zones..." heightClassName="py-12" />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="font-medium text-gray-900 dark:text-gray-100">Network Zones</h3>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Named CIDR groups reusable across IP rules and Conditional Access policies</p>
        </div>
        <button onClick={openCreate} className="flex items-center gap-1.5 px-3 py-1.5 bg-orange-600 hover:bg-orange-700 text-white text-sm font-medium rounded-lg transition-colors">
          <Plus className="w-4 h-4" /> Add Zone
        </button>
      </div>

      <div className="flex items-start gap-2 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl">
        <Info className="w-4 h-4 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
        <p className="text-xs text-blue-700 dark:text-blue-300">
          Network zones let you group related IP ranges under a meaningful name (e.g. <strong>Office Network</strong>, <strong>VPN Pool</strong>, <strong>Partner CIDRs</strong>).
          Reference them by name in IP rules and Conditional Access policies instead of repeating raw CIDRs.
        </p>
      </div>

      {zones.length === 0 ? (
        <div className="text-center py-10 text-gray-400 text-sm border border-dashed border-gray-200 dark:border-gray-700 rounded-xl">
          No network zones defined. Click "Add Zone" to create one.
        </div>
      ) : (
        <div className="space-y-2">
          {zones.map((z, i) => (
            <div key={z.id ?? i} className={`flex items-start gap-4 px-4 py-3 bg-white dark:bg-gray-800 border rounded-xl ${z.isActive ? 'border-gray-200 dark:border-gray-700' : 'border-gray-100 dark:border-gray-700/40 opacity-60'}`}>
              <div className="mt-1 w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: z.color }} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="font-medium text-sm text-gray-900 dark:text-gray-100">{z.name}</p>
                  {z.isBuiltIn && <span className="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 text-[10px] rounded font-medium">BUILT-IN</span>}
                  {!z.isActive && <span className="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-700 text-gray-500 text-[10px] rounded font-medium">DISABLED</span>}
                </div>
                {z.description && <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 truncate">{z.description}</p>}
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {z.cidrs.map((c, ci) => (
                    <code key={ci} className="px-2 py-0.5 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded text-[11px] font-mono text-gray-700 dark:text-gray-300">
                      {c}
                    </code>
                  ))}
                </div>
              </div>
              {!z.isBuiltIn && (
                <div className="flex gap-1 flex-shrink-0">
                  <button onClick={() => openEdit(z)} className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors">
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => setDeleteTarget(z)} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 w-full max-w-lg shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-700">
              <h3 className="font-medium text-gray-900 dark:text-gray-100">{editing ? 'Edit' : 'Create'} Network Zone</h3>
              <button onClick={() => setShowModal(false)} className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg"><X className="w-4 h-4" /></button>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Name <span className="text-red-500">*</span></label>
                  <input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                    placeholder="e.g. Office Network"
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Color</label>
                  <div className="flex gap-1.5 flex-wrap">
                    {ZONE_COLORS.map(c => (
                      <button key={c} onClick={() => setForm(p => ({ ...p, color: c }))}
                        className={`w-6 h-6 rounded-full border-2 transition-all ${form.color === c ? 'border-gray-800 dark:border-white scale-110' : 'border-transparent'}`}
                        style={{ backgroundColor: c }} />
                    ))}
                  </div>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Description</label>
                <input value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
                  placeholder="What IP ranges are in this zone?"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  CIDRs / IPs <span className="text-red-500">*</span>
                </label>
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {form.cidrs.map((c, i) => (
                    <span key={i} className="flex items-center gap-1 px-2 py-0.5 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-indigo-700 text-blue-700 dark:text-blue-300 rounded text-xs font-mono">
                      {c} <button onClick={() => removeCidr(i)}><X className="w-3 h-3" /></button>
                    </span>
                  ))}
                </div>
                <div className="flex gap-2">
                  <input value={newCidr} onChange={e => setNewCidr(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') addCidr(); }}
                    placeholder="e.g. 192.168.1.0/24 or 10.0.0.1"
                    className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-xs font-mono" />
                  <button onClick={addCidr} className="px-3 py-2 bg-orange-600 hover:bg-orange-700 text-white text-xs rounded-lg"><Plus className="w-3.5 h-3.5" /></button>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => setForm(p => ({ ...p, isActive: !p.isActive }))}>
                  {form.isActive ? <FwSwitch on={true} /> : <FwSwitch on={false} />}
                </button>
                <span className="text-sm text-gray-700 dark:text-gray-300">Zone is active</span>
              </div>
            </div>
            <div className="flex justify-end gap-2 px-6 py-4 border-t border-gray-100 dark:border-gray-700">
              <button onClick={() => setShowModal(false)} className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-lg">Cancel</button>
              <button onClick={handleSave} disabled={saving}
                className="flex items-center gap-2 px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white text-sm font-medium rounded-lg disabled:opacity-50">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                {editing ? 'Update' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmModal
        open={!!deleteTarget}
        title="Delete Network Zone"
        message={`Delete zone "${deleteTarget?.name}"? IP rules referencing this zone will not be auto-updated.`}
        confirmLabel="Delete"
        variant="danger"
        loading={deleting}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}

/* ─── TLS Policy ────────────────────────────────────────────────── */

interface TlsConfig {
  minVersion: 'TLS1.0' | 'TLS1.1' | 'TLS1.2' | 'TLS1.3';
  cipherPreset: 'modern' | 'intermediate' | 'legacy';
  rejectSelfSigned: boolean;
  hstsPreloadEnabled: boolean;
  ocspStaplingEnabled: boolean;
}

const CIPHER_DESCRIPTIONS: Record<TlsConfig['cipherPreset'], string> = {
  modern: 'TLS 1.2–1.3 only, forward-secrecy ECDHE/DHE ciphers, AES-GCM & ChaCha20. Recommended.',
  intermediate: 'TLS 1.0–1.3, broader cipher support for legacy compatibility.',
  legacy: 'Includes weak ciphers for very old clients — NOT recommended for production.',
};

const DEFAULT_TLS: TlsConfig = {
  minVersion: 'TLS1.2',
  cipherPreset: 'modern',
  rejectSelfSigned: true,
  hstsPreloadEnabled: false,
  ocspStaplingEnabled: false,
};

function TlsPolicySection({ fwd }: { fwd: (msg: string, type?: 'success' | 'error' | 'info') => void }) {
  const [config, setConfig] = useState<TlsConfig>(DEFAULT_TLS);
  const [draft, setDraft] = useState<TlsConfig>(DEFAULT_TLS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/system-admin/firewall/tls');
      const cfg = { ...DEFAULT_TLS, ...res.data.data };
      setConfig(cfg); setDraft(cfg);
    } catch { /* use defaults */ } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.put('/system-admin/firewall/tls', draft);
      setConfig(draft);
      fwd('TLS policy saved', 'success');
    } catch (e: any) { fwd(e.response?.data?.message || 'Failed to save TLS policy', 'error'); }
    finally { setSaving(false); }
  };

  const isDirty = JSON.stringify(draft) !== JSON.stringify(config);
  const toggle = (k: keyof TlsConfig) => setDraft(p => ({ ...p, [k]: !p[k] }));
  if (loading) return <UnifiedTabLoader label="Loading TLS policy..." heightClassName="py-12" />;

  return (
    <div className="space-y-5">
      <div>
        <h3 className="font-medium text-gray-900 dark:text-gray-100">TLS / Transport Security Policy</h3>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Control minimum TLS version, cipher suites, and certificate validation</p>
      </div>

      <div className="flex items-start gap-2 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl">
        <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
        <p className="text-xs text-amber-700 dark:text-amber-300">
          TLS policy settings are stored and surfaced here for documentation and operational visibility. 
          Enforcing them at the transport layer requires configuring your reverse proxy (nginx/Caddy) or Node.js TLS options with these values.
        </p>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-700 overflow-hidden">
        {/* Min TLS Version */}
        <div className="px-5 py-4 flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-gray-900 dark:text-gray-100">Minimum TLS Version</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">Reject connections negotiating a lower TLS version</p>
          </div>
          <select
            value={draft.minVersion}
            onChange={e => setDraft(p => ({ ...p, minVersion: e.target.value as TlsConfig['minVersion'] }))}
            className="px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm shrink-0"
          >
            <option value="TLS1.0">TLS 1.0 (legacy)</option>
            <option value="TLS1.1">TLS 1.1 (deprecated)</option>
            <option value="TLS1.2">TLS 1.2 ✓ recommended</option>
            <option value="TLS1.3">TLS 1.3 (strictest)</option>
          </select>
        </div>

        {/* Cipher Preset */}
        <div className="px-5 py-4 space-y-3">
          <p className="text-sm font-medium text-gray-900 dark:text-gray-100">Cipher Suite Preset</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {(['modern', 'intermediate', 'legacy'] as TlsConfig['cipherPreset'][]).map(preset => (
              <button
                key={preset}
                onClick={() => setDraft(p => ({ ...p, cipherPreset: preset }))}
                className={`flex flex-col gap-1.5 p-3 rounded-xl border-2 text-left transition-all ${
                  draft.cipherPreset === preset
                    ? 'border-orange-500 bg-orange-50 dark:bg-orange-900/20'
                    : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-gray-300 dark:hover:border-gray-600'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium capitalize text-gray-900 dark:text-gray-100">{preset}</span>
                  {draft.cipherPreset === preset && <Check className="w-4 h-4 text-orange-500" />}
                </div>
                <p className="text-[11px] text-gray-500 dark:text-gray-400">{CIPHER_DESCRIPTIONS[preset]}</p>
              </button>
            ))}
          </div>
        </div>

        {/* Toggles */}
        {[
          { key: 'rejectSelfSigned' as const, label: 'Reject Self-Signed Certificates', desc: 'Block outbound connections presenting self-signed or untrusted TLS certificates' },
          { key: 'hstsPreloadEnabled' as const, label: 'HSTS Preload Submission', desc: 'Flag this domain as eligible for browser HSTS preload submission (requires HSTS header to be active)' },
          { key: 'ocspStaplingEnabled' as const, label: 'OCSP Stapling', desc: 'Cache certificate revocation check responses and include them in the TLS handshake' },
        ].map(({ key, label, desc }) => (
          <div key={key} className="px-5 py-4 flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{label}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">{desc}</p>
            </div>
            <button onClick={() => toggle(key)}>
              {draft[key] ? <FwSwitch on={true} /> : <FwSwitch on={false} />}
            </button>
          </div>
        ))}
      </div>

      {isDirty && (
        <div className="flex items-center gap-2 text-sm text-amber-600 dark:text-amber-400">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" /> You have unsaved changes.
        </div>
      )}
      <div className="flex justify-end">
        <button onClick={handleSave} disabled={saving || !isDirty}
          className="flex items-center gap-2 px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white text-sm font-medium rounded-lg disabled:opacity-50 transition-colors">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Save TLS Policy
        </button>
      </div>
    </div>
  );
}

/* ─── DDoS / Burst Protection ───────────────────────────────────── */

interface DdosConfig {
  enabled: boolean;
  maxRequestsPerWindow: number;
  windowMs: number;
  burstLimit: number;
  blockDurationMs: number;
  perIPThreshold: number;
  slowlorisTimeoutMs: number;
  maxPayloadSizeMB: number;
  trustProxy: boolean;
}

const DEFAULT_DDOS: DdosConfig = {
  enabled: true,
  maxRequestsPerWindow: 500,
  windowMs: 60000,
  burstLimit: 100,
  blockDurationMs: 300000,
  perIPThreshold: 80,
  slowlorisTimeoutMs: 5000,
  maxPayloadSizeMB: 10,
  trustProxy: true,
};

function DdosSection({ fwd }: { fwd: (msg: string, type?: 'success' | 'error' | 'info') => void }) {
  const [config, setConfig] = useState<DdosConfig>(DEFAULT_DDOS);
  const [draft, setDraft] = useState<DdosConfig>(DEFAULT_DDOS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/system-admin/firewall/ddos');
      const cfg = { ...DEFAULT_DDOS, ...res.data.data };
      setConfig(cfg); setDraft(cfg);
    } catch { /* use defaults */ } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.put('/system-admin/firewall/ddos', draft);
      setConfig(draft);
      fwd('DDoS protection config saved', 'success');
    } catch (e: any) { fwd(e.response?.data?.message || 'Failed to save', 'error'); }
    finally { setSaving(false); }
  };

  const num = (k: keyof DdosConfig, min = 1, max = 999999) =>
    <input type="number" min={min} max={max}
      value={draft[k] as number}
      onChange={e => setDraft(p => ({ ...p, [k]: Number(e.target.value) }))}
      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm" />;

  const isDirty = JSON.stringify(draft) !== JSON.stringify(config);
  if (loading) return <UnifiedTabLoader label="Loading DDoS config..." heightClassName="py-12" />;

  return (
    <div className="space-y-5">
      <div>
        <h3 className="font-medium text-gray-900 dark:text-gray-100">DDoS / Burst Protection</h3>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Rate-based thresholds for detecting and mitigating volumetric attacks and traffic bursts</p>
      </div>

      <div className="flex items-start gap-2 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl">
        <Info className="w-4 h-4 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
        <p className="text-xs text-blue-700 dark:text-blue-300">
          These thresholds configure the application-layer burst limiter. For true volumetric DDoS mitigation, 
          pair this with a CDN/WAF layer (Cloudflare, AWS Shield) or network-layer controls on your load balancer.
        </p>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-700 overflow-hidden">
        {/* Master toggle */}
        <div className="flex items-center justify-between px-5 py-4">
          <div>
            <p className="text-sm font-medium text-gray-900 dark:text-gray-100">Burst Protection Enforcement</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">Enable application-layer rate limiting and auto-block on burst</p>
          </div>
          <button onClick={() => setDraft(p => ({ ...p, enabled: !p.enabled }))}>
            {draft.enabled ? <FwSwitch on={true} /> : <FwSwitch on={false} />}
          </button>
        </div>

        {draft.enabled && (
          <div className="px-5 py-4 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-5">
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Max Requests per Window</label>
              {num('maxRequestsPerWindow', 1, 100000)}
              <p className="text-[10px] text-gray-400 mt-0.5">Total requests allowed per time window globally</p>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Window Duration (ms)</label>
              {num('windowMs', 1000, 3600000)}
              <p className="text-[10px] text-gray-400 mt-0.5">60000 = 1 minute</p>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Burst Limit (per IP)</label>
              {num('burstLimit', 1, 10000)}
              <p className="text-[10px] text-gray-400 mt-0.5">Max rapid-fire requests from a single IP</p>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Block Duration (ms)</label>
              {num('blockDurationMs', 1000, 86400000)}
              <p className="text-[10px] text-gray-400 mt-0.5">300000 = 5 minutes</p>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Per-IP Threshold (%)</label>
              {num('perIPThreshold', 1, 100)}
              <p className="text-[10px] text-gray-400 mt-0.5">Block IP when it exceeds this % of max requests</p>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Slow-loris Timeout (ms)</label>
              {num('slowlorisTimeoutMs', 1000, 60000)}
              <p className="text-[10px] text-gray-400 mt-0.5">Close keep-alive connections held longer than this</p>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Max Payload Size (MB)</label>
              {num('maxPayloadSizeMB', 1, 100)}
              <p className="text-[10px] text-gray-400 mt-0.5">Reject request bodies exceeding this size</p>
            </div>
            <div className="flex items-center gap-3 pt-4">
              <button onClick={() => setDraft(p => ({ ...p, trustProxy: !p.trustProxy }))}>
                {draft.trustProxy ? <FwSwitch on={true} /> : <FwSwitch on={false} />}
              </button>
              <div>
                <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Trust X-Forwarded-For</p>
                <p className="text-xs text-gray-400">Use proxy-forwarded IP for rate limiting</p>
              </div>
            </div>
          </div>
        )}
      </div>

      {isDirty && (
        <div className="flex items-center gap-2 text-sm text-amber-600 dark:text-amber-400">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" /> You have unsaved changes.
        </div>
      )}
      <div className="flex justify-end">
        <button onClick={handleSave} disabled={saving || !isDirty}
          className="flex items-center gap-2 px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white text-sm font-medium rounded-lg disabled:opacity-50 transition-colors">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Save DDoS Config
        </button>
      </div>
    </div>
  );
}

/* ─── Egress Filtering ──────────────────────────────────────────── */

interface EgressRule {
  id?: string;
  type: 'allow' | 'block';
  target: string;
  targetType: 'domain' | 'ip' | 'cidr';
  port: number | null;
  protocol: 'tcp' | 'udp' | 'any';
  description: string;
  isActive: boolean;
}

const DEFAULT_EGRESS: EgressRule = { type: 'block', target: '', targetType: 'domain', port: null, protocol: 'any', description: '', isActive: true };
const EGRESS_TYPE_COLORS: Record<EgressRule['type'], string> = {
  block: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300',
  allow: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300',
};

function EgressSection({ fwd }: { fwd: (msg: string, type?: 'success' | 'error' | 'info') => void }) {
  const [rules, setRules] = useState<EgressRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<EgressRule | null>(null);
  const [form, setForm] = useState<EgressRule>(DEFAULT_EGRESS);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<EgressRule | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/system-admin/firewall/egress-rules');
      setRules(res.data.data ?? []);
    } catch { setRules([]); } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const openCreate = () => { setEditing(null); setForm(DEFAULT_EGRESS); setShowModal(true); };
  const openEdit = (r: EgressRule) => { setEditing(r); setForm({ ...r }); setShowModal(true); };

  const handleSave = async () => {
    if (!form.target.trim()) { fwd('Target is required', 'error'); return; }
    setSaving(true);
    try {
      if (editing?.id) {
        await api.put(`/system-admin/firewall/egress-rules/${editing.id}`, form);
        fwd('Egress rule updated', 'success');
      } else {
        await api.post('/system-admin/firewall/egress-rules', form);
        fwd('Egress rule created', 'success');
      }
      setShowModal(false); load();
    } catch (e: any) { fwd(e.response?.data?.message || 'Failed to save egress rule', 'error'); }
    finally { setSaving(false); }
  };

  const handleDelete = async () => {
    if (!deleteTarget?.id) return;
    setDeleting(true);
    try {
      await api.delete(`/system-admin/firewall/egress-rules/${deleteTarget.id}`);
      fwd('Egress rule deleted', 'success');
      setDeleteTarget(null); load();
    } catch { fwd('Failed to delete rule', 'error'); } finally { setDeleting(false); }
  };

  const handleToggle = async (r: EgressRule) => {
    try {
      await api.patch(`/system-admin/firewall/egress-rules/${r.id}/toggle`);
      setRules(prev => prev.map(x => x.id === r.id ? { ...x, isActive: !x.isActive } : x));
    } catch { fwd('Failed to toggle rule', 'error'); }
  };

  const filtered = rules.filter(r => r.target.toLowerCase().includes(search.toLowerCase()) || r.description.toLowerCase().includes(search.toLowerCase()));
  if (loading) return <UnifiedTabLoader label="Loading egress rules..." heightClassName="py-12" />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="font-medium text-gray-900 dark:text-gray-100">Egress Filtering</h3>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Control which external hosts, IPs, and CIDRs backend services are permitted to reach</p>
        </div>
        <button onClick={openCreate} className="flex items-center gap-1.5 px-3 py-1.5 bg-orange-600 hover:bg-orange-700 text-white text-sm font-medium rounded-lg transition-colors">
          <Plus className="w-4 h-4" /> Add Rule
        </button>
      </div>

      <div className="flex items-start gap-2 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl">
        <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
        <p className="text-xs text-amber-700 dark:text-amber-300">
          Egress rules are stored and logged here. Enforcement requires integrating these rules with your server's outbound connection middleware or deploying a network-layer egress filter.
        </p>
      </div>

      <div className="relative max-w-sm">
        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search targets…"
          className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white" />
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-10 text-gray-400 text-sm border border-dashed border-gray-200 dark:border-gray-700 rounded-xl">
          {search ? 'No rules match your search.' : 'No egress rules. Click "Add Rule" to create one.'}
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((r, i) => (
            <div key={r.id ?? i} className={`flex items-center gap-3 px-4 py-3 bg-white dark:bg-gray-800 border rounded-xl transition-opacity ${r.isActive ? 'border-gray-200 dark:border-gray-700' : 'border-gray-100 dark:border-gray-700/40 opacity-60'}`}>
              <button onClick={() => handleToggle(r)} className="shrink-0">
                {r.isActive ? <FwSwitch on={true} /> : <FwSwitch on={false} />}
              </button>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <code className="text-sm font-mono text-gray-900 dark:text-gray-100">{r.target}</code>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium shrink-0 ${EGRESS_TYPE_COLORS[r.type]}`}>{r.type.toUpperCase()}</span>
                  <span className="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 text-[10px] rounded font-mono">{r.targetType}</span>
                  {r.port && <span className="text-xs text-gray-400 font-mono">:{r.port}</span>}
                  {r.protocol !== 'any' && <span className="text-xs text-gray-400 uppercase">{r.protocol}</span>}
                </div>
                {r.description && <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 truncate">{r.description}</p>}
              </div>
              <div className="flex gap-1 shrink-0">
                <button onClick={() => openEdit(r)} className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors"><Pencil className="w-3.5 h-3.5" /></button>
                <button onClick={() => setDeleteTarget(r)} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"><Trash2 className="w-3.5 h-3.5" /></button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 w-full max-w-lg shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-700">
              <h3 className="font-medium text-gray-900 dark:text-gray-100">{editing ? 'Edit' : 'Add'} Egress Rule</h3>
              <button onClick={() => setShowModal(false)} className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg"><X className="w-4 h-4" /></button>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Type</label>
                  <select value={form.type} onChange={e => setForm(p => ({ ...p, type: e.target.value as EgressRule['type'] }))}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm">
                    <option value="block">Block</option>
                    <option value="allow">Allow</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Target Type</label>
                  <select value={form.targetType} onChange={e => setForm(p => ({ ...p, targetType: e.target.value as EgressRule['targetType'] }))}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm">
                    <option value="domain">Domain</option>
                    <option value="ip">IP Address</option>
                    <option value="cidr">CIDR</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Target <span className="text-red-500">*</span></label>
                <input value={form.target} onChange={e => setForm(p => ({ ...p, target: e.target.value }))}
                  placeholder={form.targetType === 'domain' ? 'e.g. evil.example.com' : form.targetType === 'ip' ? 'e.g. 1.2.3.4' : 'e.g. 10.0.0.0/8'}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm font-mono" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Port (optional)</label>
                  <input type="number" min={0} max={65535} value={form.port ?? ''} onChange={e => setForm(p => ({ ...p, port: e.target.value ? Number(e.target.value) : null }))}
                    placeholder="All ports"
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Protocol</label>
                  <select value={form.protocol} onChange={e => setForm(p => ({ ...p, protocol: e.target.value as EgressRule['protocol'] }))}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm">
                    <option value="any">Any</option>
                    <option value="tcp">TCP</option>
                    <option value="udp">UDP</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Description</label>
                <input value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
                  placeholder="Why is this blocked/allowed?"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm" />
              </div>
            </div>
            <div className="flex justify-end gap-2 px-6 py-4 border-t border-gray-100 dark:border-gray-700">
              <button onClick={() => setShowModal(false)} className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-lg">Cancel</button>
              <button onClick={handleSave} disabled={saving}
                className="flex items-center gap-2 px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white text-sm font-medium rounded-lg disabled:opacity-50">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                {editing ? 'Update' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmModal
        open={!!deleteTarget}
        title="Delete Egress Rule"
        message={`Remove egress rule for "${deleteTarget?.target}"?`}
        confirmLabel="Delete"
        variant="danger"
        loading={deleting}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}

/* ─── Pill toggle (follows SUPERADMIN_UI_PATTERNS Rule 8) ──────── */

function FwSwitch({ on }: { on: boolean }) {
  return (
    <span className={`relative inline-flex w-8 h-[18px] rounded-full transition-colors duration-200 flex-shrink-0 ${on ? 'bg-green-600' : 'bg-gray-300'}`}>
      <span className={`absolute top-0.5 w-3.5 h-3.5 rounded-full bg-white shadow-sm transition-all duration-200 ${on ? 'left-[calc(100%-16px)]' : 'left-0.5'}`} />
    </span>
  );
}

/* ─── Navigation groups (Cloudflare sidebar pattern) ───────────── */

const API_BASE = import.meta.env.VITE_API_BASE_URL || '/api/v1';

interface NavItem { id: Section; label: string; icon: React.ReactNode }
interface NavGroup { label: string; items: NavItem[] }

const NAV_GROUPS: NavGroup[] = [
  {
    label: 'Inbound Controls',
    items: [
      { id: 'ip_rules',   label: 'IP Rules',   icon: <Network className="w-3.5 h-3.5" /> },
      { id: 'autoblock',  label: 'Auto-Block', icon: <ShieldBan className="w-3.5 h-3.5" /> },
    ],
  },
  {
    label: 'Rate & Burst',
    items: [
      { id: 'rate_limits', label: 'Rate Limits',  icon: <Gauge className="w-3.5 h-3.5" /> },
      { id: 'ddos',        label: 'DDoS / Burst', icon: <Zap className="w-3.5 h-3.5" /> },
    ],
  },
  {
    label: 'HTTP Layer',
    items: [
      { id: 'path_rules', label: 'Path Rules',  icon: <FileCode2 className="w-3.5 h-3.5" /> },
      { id: 'cors',       label: 'CORS Policy', icon: <Globe className="w-3.5 h-3.5" /> },
      { id: 'headers',    label: 'Sec Headers', icon: <Lock className="w-3.5 h-3.5" /> },
    ],
  },
  {
    label: 'Threat Detection',
    items: [
      { id: 'honeypots',      label: 'Honeypots',       icon: <Siren className="w-3.5 h-3.5" /> },
      { id: 'bot_protection', label: 'Bot Protection',  icon: <Bot className="w-3.5 h-3.5" /> },
    ],
  },
  {
    label: 'Network & Infra',
    items: [
      { id: 'network_zones', label: 'Network Zones',    icon: <Layers className="w-3.5 h-3.5" /> },
      { id: 'tls',           label: 'TLS Policy',       icon: <ShieldCheck className="w-3.5 h-3.5" /> },
      { id: 'egress',        label: 'Egress Filtering', icon: <ArrowUpFromLine className="w-3.5 h-3.5" /> },
    ],
  },
];

export default function FirewallTab({ onMessage }: Props) {
  const [section, setSection] = useState<Section>('ip_rules');
  const [stats, setStats] = useState<OverviewStats | null>(null);
  const [loadingStats, setLoadingStats] = useState(true);

  const authHeaders = () => ({
    'Content-Type': 'application/json',
    Authorization: `Bearer ${sessionStorage.getItem('fuel_order_token')}`,
  });

  const fwd = useCallback((msg: string, type?: 'success' | 'error' | 'info') => {
    onMessage((type || 'error') as 'success' | 'error', msg);
  }, [onMessage]);

  const loadStats = useCallback(async () => {
    setLoadingStats(true);
    try {
      const [blocklistRes, ipRulesRes, pathRulesRes, corsRes] = await Promise.allSettled([
        fetch(`${API_BASE}/system-admin/security-blocklist/stats`, { headers: authHeaders() }).then(r => r.json()),
        fetch(`${API_BASE}/system-admin/ip-rules`, { headers: authHeaders() }).then(r => r.json()),
        fetch(`${API_BASE}/system-admin/firewall/path-rules`, { headers: authHeaders() }).then(r => r.json()),
        fetch(`${API_BASE}/system-admin/firewall/cors`, { headers: authHeaders() }).then(r => r.json()),
      ]);
      const blocklist = blocklistRes.status === 'fulfilled' ? blocklistRes.value : null;
      const ipRules   = ipRulesRes.status === 'fulfilled'   ? ipRulesRes.value   : null;
      const pathRules = pathRulesRes.status === 'fulfilled' ? pathRulesRes.value : null;
      const cors      = corsRes.status === 'fulfilled'      ? corsRes.value      : null;
      setStats({
        ipRules:      Array.isArray(ipRules?.data) ? ipRules.data.length : (ipRules?.data?.rules?.length ?? 0),
        activeBlocks: blocklist?.data?.activeBlocks ?? 0,
        pathRules:    Array.isArray(pathRules?.data) ? pathRules.data.length : 0,
        corsEnabled:  cors?.data?.enabled ?? false,
      });
    } catch { /* non-critical */ } finally { setLoadingStats(false); }
  }, []);

  useEffect(() => { loadStats(); }, [loadStats]);

  /* ── Stat tiles (Rule 3: 11px label / font-medium value) ───── */
  const STAT_TILES = [
    { label: 'IP RULES',      value: stats?.ipRules ?? 0,       icon: <Network className="w-4 h-4 text-gray-400" />,   dot: 'bg-blue-500' },
    { label: 'ACTIVE BLOCKS', value: stats?.activeBlocks ?? 0,  icon: <Ban className="w-4 h-4 text-gray-400" />,       dot: 'bg-red-500' },
    { label: 'PATH RULES',    value: stats?.pathRules ?? 0,      icon: <FileCode2 className="w-4 h-4 text-gray-400" />, dot: 'bg-blue-500' },
    { label: 'CORS',          value: stats?.corsEnabled ? 'ON' : 'OFF', icon: <Globe className="w-4 h-4 text-gray-400" />, dot: stats?.corsEnabled ? 'bg-green-500' : 'bg-gray-400' },
  ];

  return (
    <div className="flex flex-col gap-4">
      {/* Stats row — Rule 1: bg-white cards, Rule 3: typography scale */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {STAT_TILES.map(tile => (
          <div key={tile.label} className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4 flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gray-50 dark:bg-gray-700 border border-gray-100 dark:border-gray-600 flex items-center justify-center flex-shrink-0">
              {tile.icon}
            </div>
            <div>
              <p className="text-[11px] text-gray-400 dark:text-gray-500 uppercase tracking-wide">{tile.label}</p>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${tile.dot}`} />
                <p className="text-[20px] font-medium text-gray-900 dark:text-gray-100 leading-none">
                  {loadingStats ? <Loader2 className="w-4 h-4 animate-spin text-gray-400" /> : tile.value}
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Sidebar + content — Rule 1: Layer 2 sidebar / Layer 3 content */}
      <div className="flex rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden" style={{ minHeight: 560 }}>

        {/* LEFT: sidebar nav (Layer 2 — bg-gray-100) */}
        <aside className="w-44 bg-gray-100 dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 flex-shrink-0 py-2 overflow-y-auto">
          {NAV_GROUPS.map(group => (
            <div key={group.label}>
              <p className="px-3.5 pt-4 pb-1 text-[10px] font-medium text-gray-400 uppercase tracking-widest">
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
                        : 'border-l-2 border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-white/60 dark:hover:bg-gray-700/40 pl-[14px]',
                    ].join(' ')}
                  >
                    <span className={active ? 'text-orange-600' : 'text-gray-400'}>{item.icon}</span>
                    {item.label}
                  </button>
                );
              })}
            </div>
          ))}
        </aside>

        {/* RIGHT: content panel (Layer 3 — bg-white) */}
        <div className="flex-1 p-5 bg-white dark:bg-gray-900 overflow-y-auto">
          {section === 'ip_rules'       && <IPRulesTab onMessage={fwd} />}
          {section === 'autoblock'      && <SecurityBlocklistTab />}
          {section === 'rate_limits'    && <RateLimitConfigTab onMessage={fwd} />}
          {section === 'path_rules'     && <PathRulesSection fwd={fwd} />}
          {section === 'cors'           && <CorsSection fwd={fwd} />}
          {section === 'headers'        && <SecHeadersSection fwd={fwd} />}
          {section === 'honeypots'      && <HoneypotsSection fwd={fwd} />}
          {section === 'bot_protection' && <BotProtectionSection fwd={fwd} />}
          {section === 'network_zones'  && <NetworkZonesSection fwd={fwd} />}
          {section === 'tls'            && <TlsPolicySection fwd={fwd} />}
          {section === 'ddos'           && <DdosSection fwd={fwd} />}
          {section === 'egress'         && <EgressSection fwd={fwd} />}
        </div>
      </div>
    </div>
  );
}
