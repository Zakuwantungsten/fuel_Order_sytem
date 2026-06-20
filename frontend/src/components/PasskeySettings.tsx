import React, { useState, useEffect, useCallback } from 'react';
import { toast } from 'react-toastify';
import { Fingerprint, Trash2, Plus, Pencil, Check, X } from 'lucide-react';
import { passkeyAPI } from '../services/api';
import { enrollPasskey, isPasskeySupported, describePasskeyError } from '../services/passkeyService';

interface PasskeyItem {
  _id: string;
  label: string;
  deviceType: string;
  backedUp: boolean;
  transports: string[];
  lastUsedAt: string | null;
  createdAt: string;
}

/**
 * Lets the logged-in user enroll and manage their passkeys. Rendered inside the
 * security/MFA settings modal. See PASSKEY_IMPLEMENTATION.md §8.2.
 */
export const PasskeySettings: React.FC = () => {
  const supported = isPasskeySupported();
  const [passkeys, setPasskeys] = useState<PasskeyItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [enrolling, setEnrolling] = useState(false);
  const [newLabel, setNewLabel] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState('');

  const fetchPasskeys = useCallback(async () => {
    try {
      setPasskeys(await passkeyAPI.list());
    } catch {
      toast.error('Failed to load passkeys');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (supported) fetchPasskeys();
    else setLoading(false);
  }, [supported, fetchPasskeys]);

  const handleEnroll = async () => {
    setEnrolling(true);
    try {
      await enrollPasskey(newLabel.trim() || defaultDeviceLabel());
      toast.success('Passkey added');
      setNewLabel('');
      await fetchPasskeys();
    } catch (err) {
      toast.error(describePasskeyError(err));
    } finally {
      setEnrolling(false);
    }
  };

  const handleRemove = async (id: string) => {
    try {
      await passkeyAPI.remove(id);
      toast.success('Passkey removed');
      setPasskeys(prev => prev.filter(p => p._id !== id));
    } catch {
      toast.error('Failed to remove passkey');
    }
  };

  const handleRename = async (id: string) => {
    const label = editLabel.trim();
    if (!label) return;
    try {
      await passkeyAPI.rename(id, label);
      setPasskeys(prev => prev.map(p => (p._id === id ? { ...p, label } : p)));
      setEditingId(null);
    } catch {
      toast.error('Failed to rename passkey');
    }
  };

  if (!supported) {
    return (
      <div className="px-6 py-5 text-sm text-gray-600 dark:text-gray-400">
        This browser does not support passkeys.
      </div>
    );
  }

  return (
    <div className="px-6 py-5">
      <div className="flex items-center gap-2 mb-1">
        <Fingerprint className="w-5 h-5" style={{ color: '#2563EB' }} />
        <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">Passkeys</h3>
      </div>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
        Sign in with your fingerprint, face, or device PIN instead of a password.
      </p>

      {/* Add new passkey */}
      <div className="flex gap-2 mb-5">
        <input
          type="text"
          value={newLabel}
          onChange={e => setNewLabel(e.target.value)}
          placeholder="Name this device (optional)"
          maxLength={100}
          className="flex-1 px-3 py-2 text-sm border-2 border-slate-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-slate-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button
          onClick={handleEnroll}
          disabled={enrolling}
          className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          <Plus className="w-4 h-4" />
          {enrolling ? 'Waiting…' : 'Add passkey'}
        </button>
      </div>

      {/* Existing passkeys */}
      {loading ? (
        <div className="text-sm text-gray-500 dark:text-gray-400">Loading…</div>
      ) : passkeys.length === 0 ? (
        <div className="text-sm text-gray-500 dark:text-gray-400">No passkeys registered yet.</div>
      ) : (
        <ul className="space-y-2">
          {passkeys.map(p => (
            <li
              key={p._id}
              className="flex items-center justify-between gap-3 px-3 py-2.5 border border-slate-200 dark:border-gray-700 rounded-lg"
            >
              <div className="flex items-center gap-3 min-w-0">
                <Fingerprint className="w-4 h-4 text-slate-400 flex-shrink-0" />
                <div className="min-w-0">
                  {editingId === p._id ? (
                    <div className="flex items-center gap-1.5">
                      <input
                        autoFocus
                        value={editLabel}
                        onChange={e => setEditLabel(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') handleRename(p._id); if (e.key === 'Escape') setEditingId(null); }}
                        maxLength={100}
                        className="px-2 py-1 text-sm border border-slate-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-slate-900 dark:text-gray-100"
                      />
                      <button onClick={() => handleRename(p._id)} className="p-1 text-green-600 hover:bg-green-50 dark:hover:bg-gray-700 rounded">
                        <Check className="w-4 h-4" />
                      </button>
                      <button onClick={() => setEditingId(null)} className="p-1 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded">
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <>
                      <div className="text-sm font-medium text-slate-900 dark:text-gray-100 truncate">{p.label}</div>
                      <div className="text-xs text-slate-400 dark:text-gray-500">
                        {p.backedUp ? 'Synced' : 'This device'}
                        {p.lastUsedAt ? ` · Last used ${new Date(p.lastUsedAt).toLocaleDateString()}` : ' · Never used'}
                      </div>
                    </>
                  )}
                </div>
              </div>
              {editingId !== p._id && (
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button
                    onClick={() => { setEditingId(p._id); setEditLabel(p.label); }}
                    className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-gray-700 rounded"
                    title="Rename"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleRemove(p._id)}
                    className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-gray-700 rounded"
                    title="Remove"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

/** Best-effort friendly default label from the platform. */
function defaultDeviceLabel(): string {
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/.test(ua)) return 'iPhone / iPad';
  if (/Android/.test(ua)) return 'Android device';
  if (/Macintosh/.test(ua)) return 'Mac';
  if (/Windows/.test(ua)) return 'Windows device';
  return 'Passkey';
}

export default PasskeySettings;
