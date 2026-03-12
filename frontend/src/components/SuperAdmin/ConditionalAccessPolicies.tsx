/**
 * Conditional Access Policies Component
 *
 * Visual rule builder for conditional access policies:
 * IF signal operator value AND... → THEN action
 */
import React, { useState, useEffect, useCallback } from 'react';
import {
  Shield,
  Plus,
  Edit2,
  Trash2,
  ToggleLeft,
  ToggleRight,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  X,
  Loader2,
  Network,
  Clock,
  UserCheck,
  Globe,
} from 'lucide-react';

/* ───────── Types ───────── */

type ConditionSignal = 'role' | 'ip_range' | 'time_of_day' | 'device_trusted' | 'country';
type ConditionOperator = 'in' | 'not_in' | 'equals' | 'not_equals' | 'between' | 'not_between';
type PolicyAction = 'allow' | 'block' | 'require_mfa' | 'notify_admin';

interface Condition {
  signal: ConditionSignal;
  operator: ConditionOperator;
  value: string | string[];
}

interface Policy {
  _id: string;
  name: string;
  description: string;
  conditions: Condition[];
  action: PolicyAction;
  isActive: boolean;
  priority: number;
  createdBy: string;
  updatedBy?: string;
  createdAt: string;
  updatedAt: string;
}

/* ───────── Constants ───────── */

const API_BASE = '/api/v1/system-admin/conditional-access';

const ALL_ROLES = [
  'super_admin', 'admin', 'manager', 'super_manager', 'supervisor', 'clerk',
  'driver', 'viewer', 'fuel_order_maker', 'boss', 'yard_personnel',
  'fuel_attendant', 'station_manager', 'payment_manager',
  'dar_yard', 'tanga_yard', 'mmsa_yard', 'import_officer', 'export_officer',
];

const SIGNAL_OPTIONS: { value: ConditionSignal; label: string; icon: React.ReactNode }[] = [
  { value: 'role', label: 'User Role', icon: <UserCheck className="w-4 h-4" /> },
  { value: 'ip_range', label: 'IP Address', icon: <Network className="w-4 h-4" /> },
  { value: 'time_of_day', label: 'Time of Day', icon: <Clock className="w-4 h-4" /> },
  { value: 'country', label: 'Country', icon: <Globe className="w-4 h-4" /> },
];

const OPERATOR_MAP: Record<ConditionSignal, { value: ConditionOperator; label: string }[]> = {
  role: [
    { value: 'in', label: 'is one of' },
    { value: 'not_in', label: 'is not one of' },
  ],
  ip_range: [
    { value: 'in', label: 'matches' },
    { value: 'not_in', label: 'does not match' },
  ],
  time_of_day: [
    { value: 'between', label: 'between' },
    { value: 'not_between', label: 'not between' },
  ],
  device_trusted: [
    { value: 'equals', label: 'is' },
    { value: 'not_equals', label: 'is not' },
  ],
  country: [
    { value: 'in', label: 'is one of' },
    { value: 'not_in', label: 'is not one of' },
  ],
};

const ACTION_OPTIONS: { value: PolicyAction; label: string; color: string }[] = [
  { value: 'allow', label: 'Allow', color: 'text-green-600 dark:text-green-400' },
  { value: 'block', label: 'Block', color: 'text-red-600 dark:text-red-400' },
  { value: 'require_mfa', label: 'Require MFA', color: 'text-amber-600 dark:text-amber-400' },
  { value: 'notify_admin', label: 'Notify Admin', color: 'text-blue-600 dark:text-blue-400' },
];

const EMPTY_CONDITION: Condition = { signal: 'role', operator: 'in', value: [] };

/* ───────── API helpers ───────── */

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const token = sessionStorage.getItem('fuel_order_token');
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });
  const json = await res.json();
  if (!res.ok || !json.success) throw new Error(json.message || 'Request failed');
  return json.data;
}

/* ───────── Component ───────── */

export default function ConditionalAccessPolicies() {
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState<Policy | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Form state
  const [formName, setFormName] = useState('');
  const [formDesc, setFormDesc] = useState('');
  const [formConditions, setFormConditions] = useState<Condition[]>([{ ...EMPTY_CONDITION, value: [] }]);
  const [formAction, setFormAction] = useState<PolicyAction>('block');
  const [formPriority, setFormPriority] = useState(100);
  const [saving, setSaving] = useState(false);

  const fetchPolicies = useCallback(async () => {
    try {
      setLoading(true);
      const data = await apiFetch<Policy[]>('/');
      setPolicies(data);
      setError('');
    } catch (e: any) {
      setError(e.message || 'Failed to load policies');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchPolicies(); }, [fetchPolicies]);

  const resetForm = () => {
    setFormName('');
    setFormDesc('');
    setFormConditions([{ ...EMPTY_CONDITION, value: [] }]);
    setFormAction('block');
    setFormPriority(100);
    setEditing(null);
    setShowForm(false);
  };

  const startEdit = (p: Policy) => {
    setEditing(p);
    setFormName(p.name);
    setFormDesc(p.description);
    setFormConditions(p.conditions.map(c => ({ ...c, value: Array.isArray(c.value) ? [...c.value] : c.value })));
    setFormAction(p.action);
    setFormPriority(p.priority);
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!formName.trim()) return;
    if (formConditions.length === 0) return;
    setSaving(true);
    try {
      const body = {
        name: formName.trim(),
        description: formDesc.trim(),
        conditions: formConditions,
        action: formAction,
        priority: formPriority,
      };
      if (editing) {
        await apiFetch(`/${editing._id}`, { method: 'PUT', body: JSON.stringify(body) });
      } else {
        await apiFetch('/', { method: 'POST', body: JSON.stringify(body) });
      }
      resetForm();
      await fetchPolicies();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async (id: string) => {
    try {
      await apiFetch(`/${id}/toggle`, { method: 'PATCH' });
      await fetchPolicies();
    } catch (e: any) { setError(e.message); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this policy?')) return;
    try {
      await apiFetch(`/${id}`, { method: 'DELETE' });
      await fetchPolicies();
    } catch (e: any) { setError(e.message); }
  };

  // Condition helpers
  const updateCondition = (idx: number, patch: Partial<Condition>) => {
    setFormConditions(prev => {
      const next = [...prev];
      const current = next[idx];
      // Reset value when signal changes
      if (patch.signal && patch.signal !== current.signal) {
        const ops = OPERATOR_MAP[patch.signal];
        next[idx] = { signal: patch.signal, operator: ops[0].value, value: patch.signal === 'time_of_day' ? '06:00-22:00' : [] };
      } else {
        next[idx] = { ...current, ...patch };
      }
      return next;
    });
  };

  const addCondition = () => setFormConditions(prev => [...prev, { ...EMPTY_CONDITION, value: [] }]);
  const removeCondition = (idx: number) => setFormConditions(prev => prev.filter((_, i) => i !== idx));

  const actionColor = (a: PolicyAction) => ACTION_OPTIONS.find(o => o.value === a)?.color || '';

  /* ─── Condition value editor ─── */
  const renderValueEditor = (cond: Condition, idx: number) => {
    if (cond.signal === 'role' || cond.signal === 'country') {
      const selected = Array.isArray(cond.value) ? cond.value : [];
      const options = cond.signal === 'role' ? ALL_ROLES : ['TZ', 'KE', 'UG', 'RW', 'CD', 'MW', 'ZM', 'MZ'];
      return (
        <div className="flex flex-wrap gap-1.5 mt-1">
          {options.map(opt => {
            const active = selected.includes(opt);
            return (
              <button
                key={opt}
                type="button"
                onClick={() => {
                  const next = active ? selected.filter(v => v !== opt) : [...selected, opt];
                  updateCondition(idx, { value: next });
                }}
                className={`px-2 py-0.5 text-xs rounded-full border transition-colors ${
                  active
                    ? 'bg-indigo-100 dark:bg-indigo-900/40 border-indigo-400 text-indigo-700 dark:text-indigo-300'
                    : 'bg-gray-50 dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:border-indigo-300'
                }`}
              >
                {opt.replace(/_/g, ' ')}
              </button>
            );
          })}
        </div>
      );
    }

    if (cond.signal === 'ip_range') {
      const val = Array.isArray(cond.value) ? cond.value.join(', ') : String(cond.value);
      return (
        <input
          type="text"
          value={val}
          onChange={e => updateCondition(idx, { value: e.target.value.split(',').map(s => s.trim()).filter(Boolean) })}
          placeholder="198.51.100.0/24, 203.0.113.0/24"
          className="mt-1 w-full px-3 py-1.5 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-indigo-500"
        />
      );
    }

    if (cond.signal === 'time_of_day') {
      const val = typeof cond.value === 'string' ? cond.value : '06:00-22:00';
      const [start, end] = val.split('-');
      return (
        <div className="flex items-center gap-2 mt-1">
          <input
            type="time"
            value={start || '06:00'}
            onChange={e => updateCondition(idx, { value: `${e.target.value}-${end || '22:00'}` })}
            className="px-2 py-1.5 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
          />
          <span className="text-gray-500 text-sm">to</span>
          <input
            type="time"
            value={end || '22:00'}
            onChange={e => updateCondition(idx, { value: `${start || '06:00'}-${e.target.value}` })}
            className="px-2 py-1.5 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
          />
        </div>
      );
    }

    return null;
  };

  /* ─── Render ─── */
  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="p-2 bg-indigo-100 dark:bg-indigo-900/30 rounded-xl">
            <Shield className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Conditional Access Policies</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400">{policies.length} polic{policies.length === 1 ? 'y' : 'ies'} configured</p>
          </div>
        </div>
        <button
          onClick={() => { resetForm(); setShowForm(true); }}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors"
        >
          <Plus className="w-4 h-4" /> New Policy
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-sm text-red-700 dark:text-red-400">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" /> {error}
          <button onClick={() => setError('')} className="ml-auto"><X className="w-4 h-4" /></button>
        </div>
      )}

      {/* Form */}
      {showForm && (
        <div className="p-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-sm space-y-4">
          <h4 className="font-semibold text-gray-900 dark:text-white">{editing ? 'Edit Policy' : 'Create Policy'}</h4>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Name</label>
              <input
                value={formName}
                onChange={e => setFormName(e.target.value)}
                maxLength={200}
                placeholder="Policy name"
                className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Priority (lower = higher)</label>
              <input
                type="number"
                value={formPriority}
                onChange={e => setFormPriority(Math.max(0, Math.min(1000, parseInt(e.target.value) || 0)))}
                min={0}
                max={1000}
                className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Description</label>
            <input
              value={formDesc}
              onChange={e => setFormDesc(e.target.value)}
              maxLength={1000}
              placeholder="Optional description"
              className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          {/* Conditions */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Conditions (all must match)</label>
              <button onClick={addCondition} className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1">
                <Plus className="w-3 h-3" /> Add condition
              </button>
            </div>
            <div className="space-y-3">
              {formConditions.map((cond, idx) => (
                <div key={idx} className="p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg border border-gray-200 dark:border-gray-600">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase w-6">
                      {idx === 0 ? 'IF' : 'AND'}
                    </span>
                    <select
                      value={cond.signal}
                      onChange={e => updateCondition(idx, { signal: e.target.value as ConditionSignal })}
                      className="px-2 py-1.5 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                    >
                      {SIGNAL_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                    </select>
                    <select
                      value={cond.operator}
                      onChange={e => updateCondition(idx, { operator: e.target.value as ConditionOperator })}
                      className="px-2 py-1.5 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                    >
                      {(OPERATOR_MAP[cond.signal] || []).map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                    {formConditions.length > 1 && (
                      <button onClick={() => removeCondition(idx)} className="ml-auto text-red-500 hover:text-red-700">
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                  {renderValueEditor(cond, idx)}
                </div>
              ))}
            </div>
          </div>

          {/* Action */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Then Action</label>
            <div className="flex gap-2 flex-wrap">
              {ACTION_OPTIONS.map(a => (
                <button
                  key={a.value}
                  type="button"
                  onClick={() => setFormAction(a.value)}
                  className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${
                    formAction === a.value
                      ? 'bg-indigo-100 dark:bg-indigo-900/40 border-indigo-400 text-indigo-700 dark:text-indigo-300 font-medium'
                      : 'bg-gray-50 dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:border-indigo-300'
                  }`}
                >
                  {a.label}
                </button>
              ))}
            </div>
          </div>

          {/* Save / Cancel */}
          <div className="flex justify-end gap-2 pt-2 border-t border-gray-200 dark:border-gray-700">
            <button onClick={resetForm} className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200">
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving || !formName.trim()}
              className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-lg transition-colors"
            >
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              {editing ? 'Update' : 'Create'}
            </button>
          </div>
        </div>
      )}

      {/* Policy List */}
      {loading ? (
        <div className="flex items-center justify-center py-12 text-gray-500 dark:text-gray-400">
          <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading policies...
        </div>
      ) : policies.length === 0 ? (
        <div className="text-center py-12 text-gray-500 dark:text-gray-400">
          <Shield className="w-10 h-10 mx-auto mb-2 opacity-30" />
          <p>No conditional access policies configured</p>
          <p className="text-xs mt-1">Create a policy to control access based on role, IP, time, or location.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {policies.map(p => {
            const expanded = expandedId === p._id;
            return (
              <div
                key={p._id}
                className={`bg-white dark:bg-gray-800 border rounded-xl transition-colors ${
                  p.isActive ? 'border-gray-200 dark:border-gray-700' : 'border-gray-200 dark:border-gray-700 opacity-60'
                }`}
              >
                <div className="flex items-center gap-3 p-3 cursor-pointer" onClick={() => setExpandedId(expanded ? null : p._id)}>
                  <button
                    onClick={e => { e.stopPropagation(); handleToggle(p._id); }}
                    className="flex-shrink-0"
                    title={p.isActive ? 'Deactivate' : 'Activate'}
                  >
                    {p.isActive
                      ? <ToggleRight className="w-6 h-6 text-green-500" />
                      : <ToggleLeft className="w-6 h-6 text-gray-400" />
                    }
                  </button>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-gray-900 dark:text-white truncate">{p.name}</span>
                      <span className={`text-xs font-semibold ${actionColor(p.action)}`}>{p.action.replace(/_/g, ' ').toUpperCase()}</span>
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                      {p.conditions.length} condition{p.conditions.length > 1 ? 's' : ''} · Priority {p.priority}
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <button onClick={e => { e.stopPropagation(); startEdit(p); }} className="p-1 text-gray-400 hover:text-indigo-500" title="Edit">
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button onClick={e => { e.stopPropagation(); handleDelete(p._id); }} className="p-1 text-gray-400 hover:text-red-500" title="Delete">
                      <Trash2 className="w-4 h-4" />
                    </button>
                    {expanded ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                  </div>
                </div>

                {expanded && (
                  <div className="px-3 pb-3 border-t border-gray-100 dark:border-gray-700 pt-2 space-y-2">
                    {p.description && <p className="text-xs text-gray-500 dark:text-gray-400">{p.description}</p>}
                    {p.conditions.map((c, ci) => (
                      <div key={ci} className="flex items-center gap-2 text-xs">
                        <span className="font-semibold text-gray-500 dark:text-gray-400 uppercase w-8">{ci === 0 ? 'IF' : 'AND'}</span>
                        <span className="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-700 rounded text-gray-700 dark:text-gray-300 font-medium">{c.signal.replace(/_/g, ' ')}</span>
                        <span className="text-gray-500 dark:text-gray-400 italic">{OPERATOR_MAP[c.signal]?.find(o => o.value === c.operator)?.label || c.operator}</span>
                        <span className="text-gray-800 dark:text-gray-200 font-mono">
                          {Array.isArray(c.value) ? c.value.join(', ') : String(c.value)}
                        </span>
                      </div>
                    ))}
                    <div className="flex items-center gap-2 text-xs">
                      <span className="font-semibold text-gray-500 dark:text-gray-400 uppercase w-8">THEN</span>
                      <span className={`font-semibold ${actionColor(p.action)}`}>{p.action.replace(/_/g, ' ').toUpperCase()}</span>
                    </div>
                    <div className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                      Created by {p.createdBy} · {new Date(p.createdAt).toLocaleDateString()}
                      {p.updatedBy && ` · Updated by ${p.updatedBy}`}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
