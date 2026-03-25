import React, { useState, useEffect } from 'react';
import ConfirmModal from './ConfirmModal';
import { Key, Plus, Trash2, RefreshCw, AlertTriangle, Loader2, X, Eye, EyeOff } from 'lucide-react';
import { toast } from 'react-toastify';
import UnifiedTabLoader from './common/UnifiedTabLoader';
import apiClient from '../../services/api';

interface ApiToken {
  _id: string;
  name: string;
  description?: string;
  tokenPrefix: string;
  createdBy: string;
  expiresAt?: string;
  lastUsedAt?: string;
  revoked: boolean;
  revokedAt?: string;
  revokedBy?: string;
  scopes: string[];
  createdAt: string;
}

export const ApiTokenManagerTab: React.FC = () => {
  const [tokens, setTokens] = useState<ApiToken[]>([]);
  const [availableScopes, setAvailableScopes] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newRawToken, setNewRawToken] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name: '', description: '', expiresInDays: '', scopes: [] as string[] });
  const [creating, setCreating] = useState(false);
  const [showToken, setShowToken] = useState(false);
  const [revokeTarget, setRevokeTarget] = useState<{ id: string; name: string } | null>(null);
  const [revoking, setRevoking] = useState(false);

  const fetchTokens = async () => {
    setLoading(true);
    try {
      const res = await apiClient.get('/system-admin/api-tokens');
      setTokens(res.data.data);
      setAvailableScopes(res.data.scopes || []);
    } catch {
      setError('Failed to load tokens');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchTokens(); }, []);

  const handleCreate = async () => {
    if (!form.name.trim()) { setError('Token name is required'); return; }
    setCreating(true);
    try {
      const res = await apiClient.post('/system-admin/api-tokens', form);
      setNewRawToken(res.data.data.rawToken);
      setShowCreate(false);
      setForm({ name: '', description: '', expiresInDays: '', scopes: [] });
      await fetchTokens();
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Failed to create token';
      setError(msg);
    } finally {
      setCreating(false);
    }
  };

  const handleRevoke = (id: string, name: string) => {
    setRevokeTarget({ id, name });
  };

  const confirmRevoke = async () => {
    if (!revokeTarget) return;
    setRevoking(true);
    try {
      await apiClient.delete(`/system-admin/api-tokens/${revokeTarget.id}`);
      toast.success(`Token "${revokeTarget.name}" revoked`);
      setRevokeTarget(null);
      await fetchTokens();
    } catch {
      setError('Failed to revoke token');
    } finally {
      setRevoking(false);
    }
  };

  const toggleScope = (scope: string) => {
    setForm((f) => ({
      ...f,
      scopes: f.scopes.includes(scope) ? f.scopes.filter((s) => s !== scope) : [...f.scopes, scope],
    }));
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/30">
            <Key className="h-6 w-6 text-blue-600 dark:text-blue-400" />
          </div>
          <div>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">API Token Manager</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">Issue long-lived bearer tokens for service integrations</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={fetchTokens} disabled={loading} className="flex items-center gap-2 px-3 py-2 text-sm rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 disabled:opacity-50 transition-colors">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />Refresh
          </button>
          <button onClick={() => setShowCreate(true)} className="flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors">
            <Plus className="h-4 w-4" />New Token
          </button>
        </div>
      </div>

      {error && <div className="flex items-center gap-2 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 text-sm"><AlertTriangle className="h-4 w-4 shrink-0" />{error}<button onClick={() => setError(null)} className="ml-auto"><X className="h-4 w-4" /></button></div>}

      {/* New token reveal */}
      {newRawToken && (
        <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700">
          <p className="text-sm font-medium text-amber-800 dark:text-amber-300 mb-2">⚠️ Copy your token now — it will not be shown again.</p>
          <div className="flex items-center gap-2 bg-white dark:bg-gray-900 rounded-lg border border-amber-300 dark:border-amber-700 px-3 py-2">
            <code className="flex-1 font-mono text-xs text-gray-800 dark:text-gray-200 break-all">
              {showToken ? newRawToken : '•'.repeat(newRawToken.length)}
            </code>
            <button onClick={() => setShowToken((v) => !v)} className="shrink-0 p-1 text-gray-500 hover:text-gray-700">
              {showToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
            <button onClick={() => { navigator.clipboard.writeText(newRawToken); toast.success('Copied!'); }} className="shrink-0 px-2 py-1 text-xs rounded bg-amber-600 text-white hover:bg-amber-700">Copy</button>
          </div>
          <button onClick={() => { setNewRawToken(null); setShowToken(false); }} className="mt-2 text-xs text-amber-700 dark:text-amber-400 underline">I've copied it, dismiss</button>
        </div>
      )}

      {/* Token list */}
      {loading ? (
        <UnifiedTabLoader label="Loading API tokens..." heightClassName="py-16" />
      ) : tokens.length === 0 ? (
        <div className="text-center py-16 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400">
          <Key className="h-12 w-12 mx-auto mb-3 opacity-30" /><p>No API tokens yet</p>
        </div>
      ) : (
        <div className="space-y-3">
          {tokens.map((t) => (
            <div key={t._id} className={`bg-white dark:bg-gray-800 rounded-xl border p-4 ${t.revoked ? 'border-gray-200 dark:border-gray-700 opacity-60' : 'border-gray-200 dark:border-gray-700'}`}>
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-gray-900 dark:text-white">{t.name}</span>
                    {t.revoked && <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-400">Revoked</span>}
                    {!t.revoked && t.expiresAt && new Date(t.expiresAt) < new Date() && <span className="text-xs px-2 py-0.5 rounded-full bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-400">Expired</span>}
                    {!t.revoked && (!t.expiresAt || new Date(t.expiresAt) > new Date()) && <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400">Active</span>}
                  </div>
                  {t.description && <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{t.description}</p>}
                  <div className="flex flex-wrap gap-1 mt-2">
                    {t.scopes.map((s) => <span key={s} className="text-[10px] px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300">{s}</span>)}
                  </div>
                  <div className="flex gap-4 mt-2 text-xs text-gray-400 dark:text-gray-500">
                    <span>Prefix: <code>{t.tokenPrefix}…</code></span>
                    <span>By: {t.createdBy}</span>
                    <span>Created: {new Date(t.createdAt).toLocaleDateString()}</span>
                    {t.expiresAt && <span>Expires: {new Date(t.expiresAt).toLocaleDateString()}</span>}
                    {t.lastUsedAt && <span>Last used: {new Date(t.lastUsedAt).toLocaleDateString()}</span>}
                  </div>
                </div>
                {!t.revoked && (
                  <button onClick={() => handleRevoke(t._id, t.name)} className="shrink-0 p-2 rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors">
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl max-w-md w-full mx-4 p-6 space-y-4">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Create API Token</h3>
            <input type="text" placeholder="Token name *" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
            <input type="text" placeholder="Description (optional)" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
            <input type="number" placeholder="Expires in days (leave blank = no expiry)" value={form.expiresInDays} onChange={(e) => setForm((f) => ({ ...f, expiresInDays: e.target.value }))} className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
            <div>
              <p className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-2">Scopes</p>
              <div className="flex flex-wrap gap-2">
                {availableScopes.map((s) => (
                  <button key={s} onClick={() => toggleScope(s)} className={`text-xs px-2 py-1 rounded-full border transition-colors ${form.scopes.includes(s) ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:border-blue-400'}`}>
                    {s}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex gap-3 justify-end pt-2">
              <button onClick={() => { setShowCreate(false); setForm({ name: '', description: '', expiresInDays: '', scopes: [] }); }} className="px-4 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">Cancel</button>
              <button onClick={handleCreate} disabled={creating} className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 transition-colors">
                {creating && <Loader2 className="h-4 w-4 animate-spin" />}Create Token
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmModal
        open={revokeTarget !== null}
        title="Revoke API Token"
        message={`Revoke token "${revokeTarget?.name}"? This will immediately invalidate the token and cannot be undone.`}
        variant="danger"
        confirmLabel="Revoke Token"
        loading={revoking}
        onConfirm={confirmRevoke}
        onCancel={() => !revoking && setRevokeTarget(null)}
      />
    </div>
  );
};

export default ApiTokenManagerTab;
