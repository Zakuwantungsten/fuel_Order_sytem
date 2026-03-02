import React, { useState, useEffect } from 'react';
import { FileBarChart, AlertTriangle, Loader2, Plus, Trash2, Play, Download } from 'lucide-react';
import apiClient from '../../services/api';

interface ModelInfo {
  id: string;
  label: string;
  fields: string[];
}

interface ReportFilter {
  key: string;
  value: string;
}

interface ReportResult {
  total: number;
  rows: Record<string, unknown>[];
  columns: string[];
}

export const CustomReportBuilderTab: React.FC = () => {
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [selectedModel, setSelectedModel] = useState('');
  const [filters, setFilters] = useState<ReportFilter[]>([]);
  const [limit, setLimit] = useState(100);
  const [sortField, setSortField] = useState('createdAt');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [result, setResult] = useState<ReportResult | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadingModels, setLoadingModels] = useState(false);

  useEffect(() => {
    setLoadingModels(true);
    apiClient.get('/system-admin/custom-report/models')
      .then((res) => { setModels(res.data.data || []); if (res.data.data?.[0]) setSelectedModel(res.data.data[0].id); })
      .catch(() => setError('Failed to load models'))
      .finally(() => setLoadingModels(false));
  }, []);

  const addFilter = () => setFilters((f) => [...f, { key: '', value: '' }]);
  const removeFilter = (i: number) => setFilters((f) => f.filter((_, idx) => idx !== i));
  const updateFilter = (i: number, field: 'key' | 'value', val: string) => setFilters((f) => f.map((item, idx) => idx === i ? { ...item, [field]: val } : item));

  const runReport = async () => {
    if (!selectedModel) return;
    setRunning(true);
    setError(null);
    setResult(null);
    try {
      const filtersObj: Record<string, string> = {};
      filters.filter((f) => f.key && f.value).forEach((f) => { filtersObj[f.key] = f.value; });
      const res = await apiClient.post('/system-admin/custom-report/run', {
        model: selectedModel,
        filters: filtersObj,
        limit,
        sort: sortField,
        order: sortOrder,
      });
      const rows = res.data.data.rows || [];
      const columns = rows.length > 0 ? Object.keys(rows[0]).filter((k) => k !== '__v') : [];
      setResult({ total: res.data.data.total, rows, columns });
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setError(msg || 'Failed to run report');
    } finally {
      setRunning(false);
    }
  };

  const exportJson = () => {
    if (!result) return;
    const blob = new Blob([JSON.stringify(result.rows, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `report_${selectedModel}_${Date.now()}.json`; a.click();
    URL.revokeObjectURL(url);
  };

  const exportCsv = () => {
    if (!result || result.columns.length === 0) return;
    const header = result.columns.join(',');
    const rows = result.rows.map((r) => result.columns.map((c) => {
      const v = r[c]; return typeof v === 'string' ? `"${v.replace(/"/g, '""')}"` : String(v ?? '');
    }).join(','));
    const blob = new Blob([[header, ...rows].join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `report_${selectedModel}_${Date.now()}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  const currentModel = models.find((m) => m.id === selectedModel);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-orange-100 dark:bg-orange-900/30">
          <FileBarChart className="h-6 w-6 text-orange-600 dark:text-orange-400" />
        </div>
        <div>
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Custom Report Builder</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">Query any data collection with custom filters and export results</p>
        </div>
      </div>

      {error && <div className="flex items-center gap-2 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 text-sm"><AlertTriangle className="h-4 w-4 shrink-0" />{error}</div>}

      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5 space-y-5">
        <h3 className="font-medium text-gray-900 dark:text-white text-sm">Report Configuration</h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Data Model</label>
            {loadingModels ? <div className="h-9 rounded-lg bg-gray-100 dark:bg-gray-700 animate-pulse" /> : (
              <select value={selectedModel} onChange={(e) => { setSelectedModel(e.target.value); setResult(null); }} className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-orange-500">
                {models.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
              </select>
            )}
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Limit (max 1000)</label>
            <input type="number" min={1} max={1000} value={limit} onChange={(e) => setLimit(Math.min(1000, Math.max(1, parseInt(e.target.value) || 1)))} className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-orange-500" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Sort Field</label>
            <input value={sortField} onChange={(e) => setSortField(e.target.value)} placeholder="createdAt" className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-orange-500" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Order</label>
            <select value={sortOrder} onChange={(e) => setSortOrder(e.target.value as 'asc' | 'desc')} className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-orange-500">
              <option value="desc">Descending</option>
              <option value="asc">Ascending</option>
            </select>
          </div>
        </div>

        {currentModel && Array.isArray(currentModel.fields) && currentModel.fields.length > 0 && (
          <div className="text-xs text-gray-500 dark:text-gray-400">
            Available fields: <span className="font-mono">{currentModel.fields.join(', ')}</span>
          </div>
        )}

        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs font-medium text-gray-700 dark:text-gray-300">Filters</label>
            <button onClick={addFilter} className="flex items-center gap-1 text-xs text-orange-600 dark:text-orange-400 hover:underline">
              <Plus className="h-3 w-3" />Add filter
            </button>
          </div>
          <div className="space-y-2">
            {filters.map((f, i) => (
              <div key={i} className="flex items-center gap-2">
                <input value={f.key} onChange={(e) => updateFilter(i, 'key', e.target.value)} placeholder="Field" className="flex-1 px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-orange-500" />
                <input value={f.value} onChange={(e) => updateFilter(i, 'value', e.target.value)} placeholder="Value" className="flex-1 px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-orange-500" />
                <button onClick={() => removeFilter(i)} className="text-gray-400 hover:text-red-500"><Trash2 className="h-4 w-4" /></button>
              </div>
            ))}
            {filters.length === 0 && <p className="text-xs text-gray-400">No filters — all records will be returned (up to limit)</p>}
          </div>
        </div>

        <button onClick={runReport} disabled={running || !selectedModel} className="flex items-center gap-2 px-5 py-2 text-sm bg-orange-600 hover:bg-orange-700 text-white rounded-lg font-medium disabled:opacity-50">
          {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
          Run Report
        </button>
      </div>

      {result && (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 dark:border-gray-700">
            <p className="text-sm text-gray-700 dark:text-gray-300 font-medium">{result.total.toLocaleString()} total records · showing {result.rows.length}</p>
            <div className="flex items-center gap-2">
              <button onClick={exportCsv} className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600">
                <Download className="h-3.5 w-3.5" />CSV
              </button>
              <button onClick={exportJson} className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600">
                <Download className="h-3.5 w-3.5" />JSON
              </button>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-gray-50 dark:bg-gray-700/50">
                <tr>
                  {result.columns.map((col) => (
                    <th key={col} className="px-4 py-2 text-left font-medium text-gray-500 dark:text-gray-400 whitespace-nowrap">{col}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 dark:divide-gray-700/50">
                {result.rows.map((row, i) => (
                  <tr key={i} className="hover:bg-gray-50 dark:hover:bg-gray-700/30">
                    {result.columns.map((col) => {
                      const val = row[col];
                      const display = val == null ? '—' : typeof val === 'object' ? JSON.stringify(val) : String(val);
                      return <td key={col} className="px-4 py-2 text-gray-700 dark:text-gray-300 max-w-xs truncate" title={display}>{display}</td>;
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {result.rows.length === 0 && <p className="text-center text-gray-500 dark:text-gray-400 py-8 text-sm">No records match your filters.</p>}
        </div>
      )}
    </div>
  );
};

export default CustomReportBuilderTab;
