import { useState, useEffect } from 'react';
import { KeyRound, Plus, Trash2, ToggleLeft, ToggleRight, RefreshCw, Shield, Eye, EyeOff } from 'lucide-react';

interface BreakGlassAccount {
  _id: string;
  username: string;
  description: string;
  isEnabled: boolean;
  lastUsedAt?: string;
  lastUsedBy?: string;
  lastUsedIP?: string;
  lastUsedReason?: string;
  createdBy: { name: string };
  lastRotatedAt: string;
  usageCount: number;
  createdAt: string;
}

const API_BASE = import.meta.env.VITE_API_BASE_URL || '/api/v1';

export default function BreakGlassTab() {
  const [accounts, setAccounts] = useState<BreakGlassAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [showPassword, setShowPassword] = useState<string | null>(null);
  const [generatedPassword, setGeneratedPassword] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [form, setForm] = useState({ username: '', description: '', password: '', confirmPassword: '' });

const headers = () => {
  const h: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${sessionStorage.getItem('fuel_order_token')}`,
  };
  const match = decodeURIComponent(document.cookie).split(';').map(c => c.trim()).find(c => c.startsWith('XSRF-TOKEN='));
  if (match) h['X-XSRF-TOKEN'] = match.substring('XSRF-TOKEN='.length);
  return h;
};

  const fetchAccounts = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/system-admin/break-glass`, { headers: headers() });
      const json = await res.json();
      if (json.success) setAccounts(json.data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchAccounts(); }, []);

  const createAccount = async () => {
    if (form.password !== form.confirmPassword) { setError('Passwords do not match'); return; }
    if (form.password.length < 20) { setError('Password must be at least 20 characters'); return; }
    try {
      const res = await fetch(`${API_BASE}/system-admin/break-glass`, {
        method: 'POST', headers: headers(),
        body: JSON.stringify({ username: form.username, description: form.description, password: form.password }),
      });
      const json = await res.json();
      if (json.success) {
        setSuccess('Break-glass account created');
        setShowCreate(false);
        setForm({ username: '', description: '', password: '', confirmPassword: '' });
        fetchAccounts();
        setTimeout(() => setSuccess(null), 3000);
      } else setError(json.message);
    } catch (err: any) { setError(err.message); }
  };

  const toggleAccount = async (id: string) => {
    try {
      const res = await fetch(`${API_BASE}/system-admin/break-glass/${id}/toggle`, { method: 'PATCH', headers: headers() });
      const json = await res.json();
      if (json.success) fetchAccounts();
      else setError(json.message);
    } catch (err: any) { setError(err.message); }
  };

  const rotatePassword = async (id: string) => {
    const newPass = prompt('Enter new password (min 20 characters):');
    if (!newPass || newPass.length < 20) { setError('Password must be at least 20 characters'); return; }
    try {
      const res = await fetch(`${API_BASE}/system-admin/break-glass/${id}/rotate`, {
        method: 'PATCH', headers: headers(), body: JSON.stringify({ newPassword: newPass }),
      });
      const json = await res.json();
      if (json.success) { setSuccess('Password rotated successfully'); fetchAccounts(); setTimeout(() => setSuccess(null), 3000); }
      else setError(json.message);
    } catch (err: any) { setError(err.message); }
  };

  const deleteAccount = async (id: string) => {
    if (!confirm('Permanently delete this break-glass account?')) return;
    try {
      const res = await fetch(`${API_BASE}/system-admin/break-glass/${id}`, { method: 'DELETE', headers: headers() });
      const json = await res.json();
      if (json.success) { setSuccess('Account deleted'); fetchAccounts(); setTimeout(() => setSuccess(null), 3000); }
      else setError(json.message);
    } catch (err: any) { setError(err.message); }
  };

  const generatePassword = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()';
    const array = new Uint32Array(24);
    crypto.getRandomValues(array);
    const pw = Array.from(array, v => chars[v % chars.length]).join('');
    setForm({ ...form, password: pw, confirmPassword: pw });
    setGeneratedPassword(pw);
  };

  if (loading) return <div className="flex justify-center py-12"><RefreshCw className="w-6 h-6 text-amber-600 animate-spin" /></div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">Break-Glass Accounts</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">Emergency access accounts for system recovery — disabled by default</p>
        </div>
        <button onClick={() => setShowCreate(!showCreate)} className="flex items-center gap-2 px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 text-sm">
          <Plus className="w-4 h-4" /> Create Account
        </button>
      </div>

      {/* Warning banner */}
      <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-4 flex items-start gap-3">
        <Shield className="w-5 h-5 text-amber-600 mt-0.5 shrink-0" />
        <div className="text-sm text-amber-800 dark:text-amber-300">
          <p className="font-medium">Security Notice</p>
          <p>Break-glass accounts bypass normal authentication. Keep them disabled unless needed for emergency recovery. All usage is fully audited.</p>
        </div>
      </div>

      {error && <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3 text-sm text-red-700 dark:text-red-300">{error}</div>}
      {success && <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-3 text-sm text-green-700 dark:text-green-300">{success}</div>}

      {/* Create Form */}
      {showCreate && (
        <div className="bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-lg p-6 space-y-4">
          <h3 className="font-semibold text-gray-900 dark:text-gray-100">New Break-Glass Account</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-gray-700 dark:text-gray-300 mb-1">Username</label>
              <input value={form.username} onChange={e => setForm({...form, username: e.target.value})}
                placeholder="e.g., emergency-admin-1"
                className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-gray-200 text-sm" />
            </div>
            <div>
              <label className="block text-sm text-gray-700 dark:text-gray-300 mb-1">Description</label>
              <input value={form.description} onChange={e => setForm({...form, description: e.target.value})}
                placeholder="Primary emergency access"
                className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-gray-200 text-sm" />
            </div>
            <div>
              <label className="block text-sm text-gray-700 dark:text-gray-300 mb-1">Password (min 20 chars)</label>
              <div className="relative">
                <input type={showPassword === 'create' ? 'text' : 'password'} value={form.password}
                  onChange={e => setForm({...form, password: e.target.value})}
                  className="w-full px-3 py-2 pr-10 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-gray-200 text-sm" />
                <button type="button" onClick={() => setShowPassword(showPassword === 'create' ? null : 'create')}
                  className="absolute right-2 top-2 text-gray-400 hover:text-gray-600">
                  {showPassword === 'create' ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <div>
              <label className="block text-sm text-gray-700 dark:text-gray-300 mb-1">Confirm Password</label>
              <input type="password" value={form.confirmPassword} onChange={e => setForm({...form, confirmPassword: e.target.value})}
                className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-gray-200 text-sm" />
            </div>
          </div>
          <div className="flex gap-2 pt-2">
            <button onClick={createAccount} className="px-4 py-2 bg-amber-600 text-white rounded-lg text-sm hover:bg-amber-700">Create</button>
            <button onClick={generatePassword} className="px-4 py-2 bg-gray-600 text-white rounded-lg text-sm hover:bg-gray-700">Generate Strong Password</button>
            <button onClick={() => setShowCreate(false)} className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg text-sm">Cancel</button>
          </div>
          {generatedPassword && (
            <div className="bg-gray-100 dark:bg-gray-900 p-3 rounded-lg text-sm font-mono break-all text-gray-900 dark:text-gray-100">
              Generated: {generatedPassword}
              <p className="text-xs text-gray-500 mt-1">Copy this password and store it securely. It cannot be retrieved later.</p>
            </div>
          )}
        </div>
      )}

      {/* Accounts List */}
      {accounts.length === 0 ? (
        <div className="text-center py-12 text-gray-500 dark:text-gray-400">
          <KeyRound className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>No break-glass accounts configured</p>
        </div>
      ) : (
        <div className="space-y-3">
          {accounts.map(acc => (
            <div key={acc._id} className={`bg-white dark:bg-gray-800 border rounded-lg p-4 ${acc.isEnabled ? 'border-amber-300 dark:border-amber-700' : 'dark:border-gray-700'}`}>
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <KeyRound className="w-4 h-4 text-amber-600" />
                    <span className="font-medium text-gray-900 dark:text-gray-100">{acc.username}</span>
                    <span className={`px-2 py-0.5 rounded-full text-xs ${acc.isEnabled ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 animate-pulse' : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400'}`}>
                      {acc.isEnabled ? 'ENABLED' : 'Disabled'}
                    </span>
                  </div>
                  {acc.description && <p className="text-sm text-gray-500 dark:text-gray-400">{acc.description}</p>}
                  <div className="flex flex-wrap gap-3 mt-2 text-xs text-gray-500 dark:text-gray-400">
                    <span>Created by: {acc.createdBy?.name || 'System'}</span>
                    <span>Used: {acc.usageCount}x</span>
                    <span>Last rotated: {new Date(acc.lastRotatedAt).toLocaleDateString()}</span>
                    {acc.lastUsedAt && <span>Last used: {new Date(acc.lastUsedAt).toLocaleDateString()}</span>}
                  </div>
                  {acc.lastUsedReason && (
                    <p className="text-xs mt-1 text-amber-600 dark:text-amber-400">Last reason: {acc.lastUsedReason}</p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => rotatePassword(acc._id)} className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded" title="Rotate Password">
                    <RefreshCw className="w-4 h-4 text-blue-500" />
                  </button>
                  <button onClick={() => toggleAccount(acc._id)} className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded" title="Toggle">
                    {acc.isEnabled ? <ToggleRight className="w-5 h-5 text-amber-500" /> : <ToggleLeft className="w-5 h-5 text-gray-400" />}
                  </button>
                  <button onClick={() => deleteAccount(acc._id)} className="p-1.5 hover:bg-red-50 dark:hover:bg-red-900/20 rounded" title="Delete">
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
