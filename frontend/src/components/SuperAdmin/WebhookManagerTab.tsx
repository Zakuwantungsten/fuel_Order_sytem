import { useState, useEffect } from 'react';
import {
  Webhook as WebhookIcon, Plus, Trash2, RefreshCw, Play, Eye, EyeOff,
  CheckCircle, XCircle, AlertTriangle, ChevronDown, ChevronUp, RotateCcw, X,
} from 'lucide-react';
import webhookService, { Webhook } from '../../services/webhookService';

interface Props {
  onMessage: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

const ALL_EVENTS = [
  'delivery_order.created', 'delivery_order.updated', 'delivery_order.deleted',
  'fuel_record.created', 'lpo_entry.created', 'user.created', 'user.deactivated',
  'maintenance.enabled', 'maintenance.disabled', 'fuel_price.updated', 'archival.completed',
];

function EventBadge({ event }: { event: string }) {
  const colors: Record<string, string> = {
    created: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
    updated: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
    deleted: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
    enabled: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
    disabled: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400',
    completed: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  };
  const suffix = event.split('.')[1] ?? '';
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${colors[suffix] || 'bg-gray-100 text-gray-600'}`}>
      {event}
    </span>
  );
}

interface FormState {
  name: string;
  url: string;
  events: string[];
  headerKey: string;
  headerVal: string;
  headers: Record<string, string>;
}

const defaultForm = (): FormState => ({ name: '', url: '', events: [], headerKey: '', headerVal: '', headers: {} });

export default function WebhookManagerTab({ onMessage }: Props) {
  const [webhooks, setWebhooks] = useState<Webhook[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState<FormState>(defaultForm());
  const [saving, setSaving] = useState(false);
  const [expandedLogs, setExpandedLogs] = useState<string | null>(null);
  const [shownSecret, setShownSecret] = useState<{ id: string; secret: string } | null>(null);
  const [testing, setTesting] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  useEffect(() => { load(); }, []);

  const load = async () => {
    setLoading(true);
    try {
      const data = await webhookService.list();
      setWebhooks(data);
    } catch {
      onMessage('Failed to load webhooks', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async () => {
    if (!form.name || !form.url || form.events.length === 0) {
      onMessage('Name, URL, and at least one event are required', 'error');
      return;
    }
    setSaving(true);
    try {
      const created = await webhookService.create({ name: form.name, url: form.url, events: form.events, headers: form.headers });
      setWebhooks((prev) => [created, ...prev]);
      setShownSecret({ id: created._id, secret: created.secret });
      setShowCreate(false);
      setForm(defaultForm());
      onMessage('Webhook created. Save the secret — it will not be shown again.', 'success');
    } catch (e: any) {
      onMessage(e.response?.data?.message || 'Failed to create webhook', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async (wh: Webhook) => {
    try {
      await webhookService.update(wh._id, { isEnabled: !wh.isEnabled });
      setWebhooks((prev) => prev.map((w) => w._id === wh._id ? { ...w, isEnabled: !w.isEnabled } : w));
    } catch {
      onMessage('Failed to update webhook', 'error');
    }
  };

  const handleTest = async (id: string) => {
    setTesting(id);
    try {
      const result = await webhookService.test(id);
      onMessage(
        result.success ? `Test succeeded (${result.statusCode}) in ${result.durationMs}ms` : `Test failed: ${result.error || result.statusCode}`,
        result.success ? 'success' : 'error'
      );
      load();
    } catch {
      onMessage('Test request failed', 'error');
    } finally {
      setTesting(null);
    }
  };

  const handleDelete = async (id: string) => {
    if (deleting !== id) { setDeleting(id); return; }
    try {
      await webhookService.delete(id);
      setWebhooks((prev) => prev.filter((w) => w._id !== id));
      onMessage('Webhook deleted', 'success');
    } catch {
      onMessage('Failed to delete webhook', 'error');
    } finally {
      setDeleting(null);
    }
  };

  const handleRegenSecret = async (id: string) => {
    try {
      const result = await webhookService.regenerateSecret(id);
      setShownSecret({ id, secret: result.secret });
      onMessage('Secret regenerated. Verify your consumer is updated.', 'info');
    } catch {
      onMessage('Failed to regenerate secret', 'error');
    }
  };

  const toggleEvent = (event: string) => {
    setForm((prev) => ({
      ...prev,
      events: prev.events.includes(event) ? prev.events.filter((e) => e !== event) : [...prev.events, event],
    }));
  };

  const addHeader = () => {
    if (!form.headerKey) return;
    setForm((prev) => ({
      ...prev,
      headers: { ...prev.headers, [prev.headerKey]: prev.headerVal },
      headerKey: '',
      headerVal: '',
    }));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="w-6 h-6 animate-spin text-indigo-500" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">Webhook Manager</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            {webhooks.length} webhook{webhooks.length !== 1 ? 's' : ''} configured
          </p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium transition-colors"
        >
          <Plus className="w-4 h-4" />
          New Webhook
        </button>
      </div>

      {/* Secret reveal banner */}
      {shownSecret && (
        <div className="p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-300 dark:border-amber-700 rounded-xl">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">Webhook Secret (save this now!)</p>
              <code className="text-xs bg-amber-100 dark:bg-amber-900/30 text-amber-900 dark:text-amber-200 px-2 py-1 rounded mt-1 block break-all select-all">
                {shownSecret.secret}
              </code>
              <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                Use this to verify webhook signatures via <code>X-Webhook-Signature</code> header (HMAC-SHA256).
              </p>
            </div>
            <button onClick={() => setShownSecret(null)} className="flex-shrink-0 text-amber-600">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Create Form */}
      {showCreate && (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6 space-y-4">
          <h3 className="font-semibold text-gray-800 dark:text-white">New Webhook</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Name</label>
              <input
                value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm text-gray-900 dark:text-white"
                placeholder="My Webhook"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">URL</label>
              <input
                value={form.url} onChange={(e) => setForm((p) => ({ ...p, url: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm text-gray-900 dark:text-white"
                placeholder="https://example.com/webhook"
              />
            </div>
          </div>
          {/* Events */}
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-2">Events</label>
            <div className="flex flex-wrap gap-2">
              {ALL_EVENTS.map((ev) => (
                <button
                  key={ev}
                  onClick={() => toggleEvent(ev)}
                  className={`text-xs px-2.5 py-1 rounded-full border transition-all ${form.events.includes(ev) ? 'bg-indigo-600 text-white border-indigo-600' : 'border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:border-indigo-400'}`}
                >
                  {ev}
                </button>
              ))}
            </div>
          </div>
          {/* Headers */}
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Custom Headers (optional)</label>
            <div className="flex gap-2 mb-2">
              <input value={form.headerKey} onChange={(e) => setForm((p) => ({ ...p, headerKey: e.target.value }))} placeholder="Header-Name" className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm text-gray-900 dark:text-white" />
              <input value={form.headerVal} onChange={(e) => setForm((p) => ({ ...p, headerVal: e.target.value }))} placeholder="value" className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm text-gray-900 dark:text-white" />
              <button onClick={addHeader} className="px-3 py-2 bg-gray-100 dark:bg-gray-700 rounded-lg text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-200">Add</button>
            </div>
            {Object.entries(form.headers).map(([k, v]) => (
              <div key={k} className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                <span className="font-mono">{k}: {v}</span>
                <button onClick={() => setForm((p) => { const h = { ...p.headers }; delete h[k]; return { ...p, headers: h }; })} className="text-red-400 hover:text-red-600"><X className="w-3 h-3" /></button>
              </div>
            ))}
          </div>
          <div className="flex justify-end gap-3">
            <button onClick={() => { setShowCreate(false); setForm(defaultForm()); }} className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm text-gray-700 dark:text-gray-300">Cancel</button>
            <button onClick={handleCreate} disabled={saving} className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium disabled:opacity-50">
              {saving && <RefreshCw className="w-4 h-4 animate-spin" />}
              Create
            </button>
          </div>
        </div>
      )}

      {/* Webhooks List */}
      {webhooks.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <WebhookIcon className="w-12 h-12 mx-auto mb-3 opacity-40" />
          <p>No webhooks configured yet.</p>
          <button onClick={() => setShowCreate(true)} className="mt-4 text-indigo-600 dark:text-indigo-400 text-sm underline">Create your first webhook</button>
        </div>
      ) : (
        <div className="space-y-4">
          {webhooks.map((wh) => (
            <div key={wh._id} className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
              <div className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${wh.isEnabled ? 'bg-green-500' : 'bg-gray-300 dark:bg-gray-600'}`} />
                    <div className="min-w-0">
                      <p className="font-semibold text-gray-900 dark:text-white text-sm">{wh.name}</p>
                      <p className="text-xs text-gray-400 truncate">{wh.url}</p>
                      {wh.lastTriggeredAt && (
                        <p className="text-xs text-gray-400 mt-0.5">
                          Last: {new Date(wh.lastTriggeredAt).toLocaleString()}
                          {wh.lastStatus === 'success' ? <CheckCircle className="w-3 h-3 inline ml-1 text-green-500" /> : <XCircle className="w-3 h-3 inline ml-1 text-red-500" />}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button onClick={() => handleToggle(wh)} className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${wh.isEnabled ? 'bg-green-500' : 'bg-gray-300 dark:bg-gray-600'}`}>
                      <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${wh.isEnabled ? 'translate-x-5' : 'translate-x-0.5'}`} />
                    </button>
                    <button onClick={() => handleTest(wh._id)} disabled={testing === wh._id} title="Test webhook" className="p-1.5 text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg disabled:opacity-50">
                      {testing === wh._id ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                    </button>
                    <button onClick={() => handleRegenSecret(wh._id)} title="Regenerate secret" className="p-1.5 text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-900/20 rounded-lg">
                      <RotateCcw className="w-4 h-4" />
                    </button>
                    <button onClick={() => handleDelete(wh._id)} title={deleting === wh._id ? 'Click again to confirm' : 'Delete'} className={`p-1.5 rounded-lg ${deleting === wh._id ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' : 'text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20'}`}>
                      <Trash2 className="w-4 h-4" />
                    </button>
                    <button onClick={() => setExpandedLogs(expandedLogs === wh._id ? null : wh._id)} className="p-1.5 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg">
                      {expandedLogs === wh._id ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                {/* Events */}
                <div className="flex flex-wrap gap-1 mt-3">
                  {wh.events.map((ev) => <EventBadge key={ev} event={ev} />)}
                </div>
                {wh.failureCount > 0 && (
                  <div className="flex items-center gap-1 mt-2 text-xs text-red-500">
                    <AlertTriangle className="w-3 h-3" />
                    <span>{wh.failureCount} recent failures</span>
                  </div>
                )}
              </div>

              {/* Logs */}
              {expandedLogs === wh._id && (
                <div className="border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50 p-4">
                  <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">
                    Delivery Logs ({wh.logs.length})
                  </p>
                  {wh.logs.length === 0 ? (
                    <p className="text-xs text-gray-400 italic">No logs yet.</p>
                  ) : (
                    <div className="space-y-2 max-h-64 overflow-y-auto">
                      {wh.logs.map((log, i) => (
                        <div key={i} className="flex items-center gap-3 text-xs">
                          {log.success ? (
                            <CheckCircle className="w-3.5 h-3.5 text-green-500 flex-shrink-0" />
                          ) : (
                            <XCircle className="w-3.5 h-3.5 text-red-500 flex-shrink-0" />
                          )}
                          <span className="text-gray-400">{new Date(log.timestamp).toLocaleString()}</span>
                          <span className="font-mono text-gray-600 dark:text-gray-300">{log.event}</span>
                          <span className={`ml-auto font-mono ${log.success ? 'text-green-600' : 'text-red-500'}`}>{log.statusCode}</span>
                          <span className="text-gray-400">{log.durationMs}ms</span>
                          {log.error && <span className="text-red-400 truncate max-w-xs">{log.error}</span>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* How-to info */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
        <div className="flex items-center gap-2 mb-3">
          {/* eslint-disable-next-line jsx-a11y/heading-has-content */}
          <Eye className="w-4 h-4 text-indigo-500" />
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Signature Verification</h3>
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
          Each request includes an <code className="bg-gray-100 dark:bg-gray-700 px-1 py-0.5 rounded">X-Webhook-Signature: sha256=&lt;hmac&gt;</code> header.
          Verify it by computing <code className="bg-gray-100 dark:bg-gray-700 px-1 py-0.5 rounded">HMAC-SHA256(secret, rawBody)</code> and comparing.
          Payloads also include <code className="bg-gray-100 dark:bg-gray-700 px-1 py-0.5 rounded">event</code>, <code className="bg-gray-100 dark:bg-gray-700 px-1 py-0.5 rounded">payload</code>, and <code className="bg-gray-100 dark:bg-gray-700 px-1 py-0.5 rounded">timestamp</code> fields.
        </p>
      </div>
    </div>
  );
}
