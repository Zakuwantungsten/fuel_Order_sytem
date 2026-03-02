import { useState, useEffect, useCallback } from 'react';
import ConfirmModal from './ConfirmModal';
import {
  Flag, Plus, RefreshCw, Trash2, Edit3, X, Check, Users,
} from 'lucide-react';
import featureFlagService, { FeatureFlag } from '../../services/featureFlagService';

interface Props {
  onMessage: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

const ROLE_OPTIONS = ['super_admin', 'admin', 'boss', 'store', 'driver'];

function RoleBadge({ role }: { role: string }) {
  const colors: Record<string, string> = {
    super_admin: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
    admin: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
    boss: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400',
    store: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
    driver: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
  };
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${colors[role] ?? 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'}`}>
      {role}
    </span>
  );
}

/* ─── Create/Edit Slide-over ─── */
function FlagSlideOver({
  flag,
  onClose,
  onSaved,
}: {
  flag?: FeatureFlag;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [key, setKey] = useState(flag?.key ?? '');
  const [name, setName] = useState(flag?.name ?? '');
  const [description, setDescription] = useState(flag?.description ?? '');
  const [isEnabled, setIsEnabled] = useState(flag?.isEnabled ?? false);
  const [enabledForRoles, setEnabledForRoles] = useState<string[]>(flag?.enabledForRoles ?? []);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const isEditing = !!flag;

  function toggleRole(role: string) {
    setEnabledForRoles((prev) =>
      prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role]
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!name.trim()) { setError('Name is required'); return; }
    if (!isEditing && !key.trim()) { setError('Key is required'); return; }
    setSaving(true);
    try {
      if (isEditing) {
        await featureFlagService.update(flag!.key, { name, description, isEnabled, enabledForRoles });
      } else {
        await featureFlagService.create({ key, name, description, isEnabled, enabledForRoles });
      }
      onSaved();
    } catch (err: any) {
      setError(err?.response?.data?.message ?? 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="w-full max-w-md bg-white dark:bg-gray-900 h-full shadow-2xl flex flex-col overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            {isEditing ? 'Edit Feature Flag' : 'New Feature Flag'}
          </h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="flex-1 p-6 space-y-5">
          {error && (
            <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 text-sm">
              {error}
            </div>
          )}
          {!isEditing && (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Key <span className="text-red-500">*</span></label>
              <input
                type="text"
                value={key}
                onChange={(e) => setKey(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_'))}
                placeholder="e.g. my_feature"
                className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white px-3 py-2.5 text-sm font-mono focus:ring-2 focus:ring-indigo-500 outline-none"
              />
              <p className="text-xs text-gray-400 mt-1">Lowercase letters, numbers, underscores only. Cannot be changed later.</p>
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Name <span className="text-red-500">*</span></label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Human-readable name"
              className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white px-3 py-2.5 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white px-3 py-2.5 text-sm focus:ring-2 focus:ring-indigo-500 outline-none resize-none"
            />
          </div>
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Enabled</label>
            <button
              type="button"
              onClick={() => setIsEnabled((v) => !v)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${isEnabled ? 'bg-indigo-600' : 'bg-gray-300 dark:bg-gray-600'}`}
            >
              <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform shadow-sm ${isEnabled ? 'translate-x-6' : 'translate-x-1'}`} />
            </button>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 flex items-center gap-1">
              <Users className="w-3.5 h-3.5" /> Restrict to roles <span className="text-gray-400 font-normal">(empty = all roles)</span>
            </label>
            <div className="flex flex-wrap gap-2">
              {ROLE_OPTIONS.map((role) => (
                <button
                  key={role}
                  type="button"
                  onClick={() => toggleRole(role)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                    enabledForRoles.includes(role)
                      ? 'bg-indigo-600 border-indigo-600 text-white'
                      : 'border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:border-indigo-400'
                  }`}
                >
                  {role}
                </button>
              ))}
            </div>
          </div>
          <button
            type="submit"
            disabled={saving}
            className="w-full py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-medium transition-colors flex items-center justify-center gap-2"
          >
            {saving ? <><RefreshCw className="w-4 h-4 animate-spin" /> Saving…</> : <><Check className="w-4 h-4" /> {isEditing ? 'Save Changes' : 'Create Flag'}</>}
          </button>
        </form>
      </div>
    </div>
  );
}

/* ─── Flag Row ─── */
function FlagRow({
  flag,
  onToggle,
  onEdit,
  onDelete,
}: {
  flag: FeatureFlag;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [toggling, setToggling] = useState(false);

  async function handleToggle() {
    setToggling(true);
    try { await onToggle(); } finally { setToggling(false); }
  }

  return (
    <div className="flex items-center justify-between p-4 rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:shadow-sm transition-shadow">
      <div className="flex items-start gap-3 min-w-0 flex-1">
        <div className={`mt-0.5 w-2 h-8 rounded-full flex-shrink-0 ${flag.isEnabled ? 'bg-green-500' : 'bg-gray-300 dark:bg-gray-600'}`} />
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-semibold text-gray-900 dark:text-white">{flag.name}</p>
            <span className="text-xs font-mono text-gray-400 bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded">{flag.key}</span>
          </div>
          {flag.description && <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{flag.description}</p>}
          {flag.enabledForRoles.length > 0 && (
            <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
              <span className="text-xs text-gray-400">Roles:</span>
              {flag.enabledForRoles.map((r) => <RoleBadge key={r} role={r} />)}
            </div>
          )}
          <p className="text-xs text-gray-400 mt-1">Updated by {flag.updatedBy} · {new Date(flag.updatedAt).toLocaleDateString('en-GB')}</p>
        </div>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0 ml-3">
        <button
          onClick={handleToggle}
          disabled={toggling}
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${flag.isEnabled ? 'bg-indigo-600' : 'bg-gray-300 dark:bg-gray-600'}`}
        >
          {toggling
            ? <RefreshCw className="w-3.5 h-3.5 text-white absolute left-1/2 -translate-x-1/2 animate-spin" />
            : <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform shadow-sm ${flag.isEnabled ? 'translate-x-6' : 'translate-x-1'}`} />
          }
        </button>
        <button
          onClick={onEdit}
          className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-gray-400 hover:text-indigo-600"
        >
          <Edit3 className="w-4 h-4" />
        </button>
        <button
          onClick={onDelete}
          className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors text-gray-400 hover:text-red-500"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

/* ─── Main Tab ─── */
export default function FeatureFlagsTab({ onMessage }: Props) {
  const [flags, setFlags] = useState<FeatureFlag[]>([]);
  const [loading, setLoading] = useState(true);
  const [slideOver, setSlideOver] = useState<{ open: boolean; flag?: FeatureFlag }>({ open: false });
  const [deleteTarget, setDeleteTarget] = useState<FeatureFlag | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await featureFlagService.list();
      setFlags(data);
    } catch {
      onMessage('Failed to load feature flags', 'error');
    } finally {
      setLoading(false);
    }
  }, [onMessage]);

  useEffect(() => { load(); }, [load]);

  async function handleToggle(flag: FeatureFlag) {
    try {
      const updated = await featureFlagService.toggle(flag.key);
      setFlags((prev) => prev.map((f) => (f.key === flag.key ? updated : f)));
      onMessage(`"${flag.name}" ${updated.isEnabled ? 'enabled' : 'disabled'}`, 'success');
    } catch (err: any) {
      onMessage(err?.response?.data?.message ?? 'Toggle failed', 'error');
    }
  }

  function handleDelete(flag: FeatureFlag) {
    setDeleteTarget(flag);
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await featureFlagService.delete(deleteTarget.key);
      setFlags((prev) => prev.filter((f) => f.key !== deleteTarget.key));
      onMessage(`"${deleteTarget.name}" deleted`, 'success');
      setDeleteTarget(null);
    } catch (err: any) {
      onMessage(err?.response?.data?.message ?? 'Delete failed', 'error');
    } finally {
      setDeleting(false);
    }
  }

  const enabledCount = flags.filter((f) => f.isEnabled).length;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="w-6 h-6 animate-spin text-indigo-500" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {slideOver.open && (
        <FlagSlideOver
          flag={slideOver.flag}
          onClose={() => setSlideOver({ open: false })}
          onSaved={() => { setSlideOver({ open: false }); load(); onMessage('Feature flag saved', 'success'); }}
        />
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">Feature Flags</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            Toggle system features on/off without redeployment
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={load} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 transition-colors">
            <RefreshCw className="w-4 h-4" />
          </button>
          <button
            onClick={() => setSlideOver({ open: true })}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium transition-colors"
          >
            <Plus className="w-4 h-4" />
            New Flag
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Total', value: flags.length, color: 'text-indigo-500' },
          { label: 'Enabled', value: enabledCount, color: 'text-green-500' },
          { label: 'Disabled', value: flags.length - enabledCount, color: 'text-gray-400' },
        ].map(({ label, value, color }) => (
          <div key={label} className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
            <div className="flex items-center gap-1.5 mb-1">
              <Flag className={`w-4 h-4 ${color}`} />
              <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">{label}</span>
            </div>
            <p className="text-2xl font-bold text-gray-900 dark:text-white">{value}</p>
          </div>
        ))}
      </div>

      {/* Flags list */}
      {flags.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <Flag className="w-10 h-10 mx-auto mb-3 opacity-40" />
          <p className="text-sm">No feature flags yet.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {flags.map((flag) => (
            <FlagRow
              key={flag.key}
              flag={flag}
              onToggle={() => handleToggle(flag)}
              onEdit={() => setSlideOver({ open: true, flag })}
              onDelete={() => handleDelete(flag)}
            />
          ))}
        </div>
      )}

      <ConfirmModal
        open={deleteTarget !== null}
        title="Delete Feature Flag"
        message={`Delete feature flag "${deleteTarget?.name}"? This cannot be undone.`}
        variant="danger"
        confirmLabel="Delete Flag"
        loading={deleting}
        onConfirm={confirmDelete}
        onCancel={() => !deleting && setDeleteTarget(null)}
      />
    </div>
  );
}
