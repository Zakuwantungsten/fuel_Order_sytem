import { useState, useEffect } from 'react';
import { Server, Plus, Trash2, ToggleLeft, ToggleRight, RefreshCw, Zap, CheckCircle, XCircle } from 'lucide-react';

interface SIEMConfig {
  _id: string;
  name: string;
  destinationType: string;
  isActive: boolean;
  webhookUrl?: string;
  syslogHost?: string;
  syslogPort?: number;
  splunkToken?: string;
  splunkUrl?: string;
  datadogApiKey?: string;
  elasticUrl?: string;
  eventFilter: {
    severities: string[];
    actions: string[];
    minRiskScore: number;
  };
  batchSize: number;
  flushIntervalSeconds: number;
  lastExportAt?: string;
  exportCount: number;
  errorCount: number;
  lastError?: string;
  createdAt: string;
}

const DEST_TYPES: Record<string, string> = {
  webhook: 'Webhook',
  syslog: 'Syslog',
  splunk_hec: 'Splunk HEC',
  datadog: 'Datadog',
  elastic: 'Elasticsearch',
};

const SEVERITIES = ['info', 'low', 'medium', 'high', 'critical'];

export default function SIEMExportTab() {
  const [configs, setConfigs] = useState<SIEMConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [testResults, setTestResults] = useState<Record<string, { success: boolean; message: string }>>({});
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [form, setForm] = useState({
    name: '', destinationType: 'webhook', webhookUrl: '', syslogHost: '', syslogPort: 514,
    splunkToken: '', splunkUrl: '', datadogApiKey: '', elasticUrl: '',
    severities: ['high', 'critical'] as string[], minRiskScore: 60, batchSize: 100, flushIntervalSeconds: 300,
  });

  const headers = () => ({
    'Content-Type': 'application/json',
    Authorization: `Bearer ${sessionStorage.getItem('fuel_order_token')}`,
  });

  const fetchConfigs = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/v1/system-admin/siem', { headers: headers() });
      const json = await res.json();
      if (json.success) setConfigs(json.data);
    } catch (err: any) { setError(err.message); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchConfigs(); }, []);

  const createConfig = async () => {
    const body: any = {
      name: form.name, destinationType: form.destinationType,
      eventFilter: { severities: form.severities, minRiskScore: form.minRiskScore },
      batchSize: form.batchSize, flushIntervalSeconds: form.flushIntervalSeconds,
    };
    if (form.destinationType === 'webhook') body.webhookUrl = form.webhookUrl;
    if (form.destinationType === 'syslog') { body.syslogHost = form.syslogHost; body.syslogPort = form.syslogPort; }
    if (form.destinationType === 'splunk_hec') { body.splunkToken = form.splunkToken; body.splunkUrl = form.splunkUrl; }
    if (form.destinationType === 'datadog') body.datadogApiKey = form.datadogApiKey;
    if (form.destinationType === 'elastic') body.elasticUrl = form.elasticUrl;

    try {
      const res = await fetch('/api/v1/system-admin/siem', {
        method: 'POST', headers: headers(), body: JSON.stringify(body),
      });
      const json = await res.json();
      if (json.success) {
        setSuccess('SIEM config created');
        setShowCreate(false);
        fetchConfigs();
        setTimeout(() => setSuccess(null), 3000);
      } else setError(json.message);
    } catch (err: any) { setError(err.message); }
  };

  const toggleConfig = async (id: string) => {
    try {
      const res = await fetch(`/api/v1/system-admin/siem/${id}/toggle`, { method: 'PATCH', headers: headers() });
      const json = await res.json();
      if (json.success) fetchConfigs();
      else setError(json.message);
    } catch (err: any) { setError(err.message); }
  };

  const testConnection = async (id: string) => {
    setTestResults(prev => ({ ...prev, [id]: { success: false, message: 'Testing...' } }));
    try {
      const res = await fetch(`/api/v1/system-admin/siem/${id}/test`, { method: 'POST', headers: headers() });
      const json = await res.json();
      setTestResults(prev => ({ ...prev, [id]: { success: json.success, message: json.success ? 'Connection successful' : json.message } }));
    } catch (err: any) {
      setTestResults(prev => ({ ...prev, [id]: { success: false, message: err.message } }));
    }
  };

  const deleteConfig = async (id: string) => {
    if (!confirm('Delete this SIEM configuration?')) return;
    try {
      const res = await fetch(`/api/v1/system-admin/siem/${id}`, { method: 'DELETE', headers: headers() });
      const json = await res.json();
      if (json.success) { setSuccess('Config deleted'); fetchConfigs(); setTimeout(() => setSuccess(null), 3000); }
      else setError(json.message);
    } catch (err: any) { setError(err.message); }
  };

  if (loading) return <div className="flex justify-center py-12"><RefreshCw className="w-6 h-6 text-purple-600 animate-spin" /></div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">SIEM Export</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">Export security events to external SIEM / log management systems</p>
        </div>
        <button onClick={() => setShowCreate(!showCreate)} className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 text-sm">
          <Plus className="w-4 h-4" /> Add Destination
        </button>
      </div>

      {error && <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3 text-sm text-red-700 dark:text-red-300">{error}</div>}
      {success && <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-3 text-sm text-green-700 dark:text-green-300">{success}</div>}

      {/* Create Form */}
      {showCreate && (
        <div className="bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-lg p-6 space-y-4">
          <h3 className="font-semibold text-gray-900 dark:text-gray-100">New SIEM Destination</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-gray-700 dark:text-gray-300 mb-1">Name</label>
              <input value={form.name} onChange={e => setForm({...form, name: e.target.value})}
                className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-gray-200 text-sm" />
            </div>
            <div>
              <label className="block text-sm text-gray-700 dark:text-gray-300 mb-1">Destination Type</label>
              <select value={form.destinationType} onChange={e => setForm({...form, destinationType: e.target.value})}
                className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-gray-200 text-sm">
                {Object.entries(DEST_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>

            {/* Dynamic destination fields */}
            {form.destinationType === 'webhook' && (
              <div className="md:col-span-2">
                <label className="block text-sm text-gray-700 dark:text-gray-300 mb-1">Webhook URL</label>
                <input value={form.webhookUrl} onChange={e => setForm({...form, webhookUrl: e.target.value})}
                  placeholder="https://..." className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-gray-200 text-sm" />
              </div>
            )}
            {form.destinationType === 'syslog' && (<>
              <div>
                <label className="block text-sm text-gray-700 dark:text-gray-300 mb-1">Syslog Host</label>
                <input value={form.syslogHost} onChange={e => setForm({...form, syslogHost: e.target.value})}
                  className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-gray-200 text-sm" />
              </div>
              <div>
                <label className="block text-sm text-gray-700 dark:text-gray-300 mb-1">Port</label>
                <input type="number" value={form.syslogPort} onChange={e => setForm({...form, syslogPort: parseInt(e.target.value)})}
                  className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-gray-200 text-sm" />
              </div>
            </>)}
            {form.destinationType === 'splunk_hec' && (<>
              <div>
                <label className="block text-sm text-gray-700 dark:text-gray-300 mb-1">Splunk URL</label>
                <input value={form.splunkUrl} onChange={e => setForm({...form, splunkUrl: e.target.value})}
                  className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-gray-200 text-sm" />
              </div>
              <div>
                <label className="block text-sm text-gray-700 dark:text-gray-300 mb-1">HEC Token</label>
                <input type="password" value={form.splunkToken} onChange={e => setForm({...form, splunkToken: e.target.value})}
                  className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-gray-200 text-sm" />
              </div>
            </>)}
            {form.destinationType === 'datadog' && (
              <div className="md:col-span-2">
                <label className="block text-sm text-gray-700 dark:text-gray-300 mb-1">Datadog API Key</label>
                <input type="password" value={form.datadogApiKey} onChange={e => setForm({...form, datadogApiKey: e.target.value})}
                  className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-gray-200 text-sm" />
              </div>
            )}
            {form.destinationType === 'elastic' && (
              <div className="md:col-span-2">
                <label className="block text-sm text-gray-700 dark:text-gray-300 mb-1">Elasticsearch URL</label>
                <input value={form.elasticUrl} onChange={e => setForm({...form, elasticUrl: e.target.value})}
                  className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-gray-200 text-sm" />
              </div>
            )}

            {/* Event Filter */}
            <div className="md:col-span-2">
              <label className="block text-sm text-gray-700 dark:text-gray-300 mb-1">Severity Filter</label>
              <div className="flex gap-2">
                {SEVERITIES.map(s => (
                  <label key={s} className="flex items-center gap-1.5 text-sm">
                    <input type="checkbox" checked={form.severities.includes(s)}
                      onChange={e => setForm({...form, severities: e.target.checked ? [...form.severities, s] : form.severities.filter(x => x !== s)})}
                      className="rounded" />
                    <span className="text-gray-700 dark:text-gray-300 capitalize">{s}</span>
                  </label>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-sm text-gray-700 dark:text-gray-300 mb-1">Min Risk Score</label>
              <input type="number" value={form.minRiskScore} onChange={e => setForm({...form, minRiskScore: parseInt(e.target.value)})}
                className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-gray-200 text-sm" />
            </div>
            <div>
              <label className="block text-sm text-gray-700 dark:text-gray-300 mb-1">Batch Size</label>
              <input type="number" value={form.batchSize} onChange={e => setForm({...form, batchSize: parseInt(e.target.value)})}
                className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-gray-200 text-sm" />
            </div>
          </div>
          <div className="flex gap-2 pt-2">
            <button onClick={createConfig} className="px-4 py-2 bg-purple-600 text-white rounded-lg text-sm hover:bg-purple-700">Create</button>
            <button onClick={() => setShowCreate(false)} className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg text-sm">Cancel</button>
          </div>
        </div>
      )}

      {/* Configs List */}
      {configs.length === 0 ? (
        <div className="text-center py-12 text-gray-500 dark:text-gray-400">
          <Server className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>No SIEM destinations configured</p>
        </div>
      ) : (
        <div className="space-y-3">
          {configs.map(cfg => (
            <div key={cfg._id} className="bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-lg p-4">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <Server className="w-4 h-4 text-purple-500" />
                    <span className="font-medium text-gray-900 dark:text-gray-100">{cfg.name}</span>
                    <span className={`px-2 py-0.5 rounded-full text-xs ${cfg.isActive ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400'}`}>
                      {cfg.isActive ? 'Active' : 'Inactive'}
                    </span>
                    <span className="px-2 py-0.5 rounded-full text-xs bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400">
                      {DEST_TYPES[cfg.destinationType]}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-3 mt-2 text-xs text-gray-500 dark:text-gray-400">
                    <span>Severities: {cfg.eventFilter.severities.join(', ')}</span>
                    <span>Min risk: {cfg.eventFilter.minRiskScore}</span>
                    <span>Exported: {cfg.exportCount}x</span>
                    <span>Errors: {cfg.errorCount}</span>
                    {cfg.lastExportAt && <span>Last: {new Date(cfg.lastExportAt).toLocaleString()}</span>}
                  </div>
                  {cfg.lastError && <p className="text-xs text-red-500 mt-1">Error: {cfg.lastError}</p>}

                  {/* Test result */}
                  {testResults[cfg._id] && (
                    <div className={`mt-2 flex items-center gap-1.5 text-xs ${testResults[cfg._id].success ? 'text-green-600' : 'text-red-600'}`}>
                      {testResults[cfg._id].success ? <CheckCircle className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}
                      {testResults[cfg._id].message}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => testConnection(cfg._id)} className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded" title="Test Connection">
                    <Zap className="w-4 h-4 text-purple-500" />
                  </button>
                  <button onClick={() => toggleConfig(cfg._id)} className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded" title="Toggle">
                    {cfg.isActive ? <ToggleRight className="w-5 h-5 text-green-500" /> : <ToggleLeft className="w-5 h-5 text-gray-400" />}
                  </button>
                  <button onClick={() => deleteConfig(cfg._id)} className="p-1.5 hover:bg-red-50 dark:hover:bg-red-900/20 rounded" title="Delete">
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
