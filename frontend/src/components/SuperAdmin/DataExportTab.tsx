import { useState, useEffect, useCallback } from 'react';
import {
  Download, FileText, FileSpreadsheet, RefreshCw, Calendar,
  ChevronRight, Database, Package, ClipboardList, Fuel, Users, Shield,
} from 'lucide-react';
import dataExportService, { ExportResource, ExportFormat } from '../../services/dataExportService';

interface Props {
  onMessage: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

const RESOURCE_ICONS: Record<string, React.ElementType> = {
  fuel_records: Fuel,
  delivery_orders: Package,
  lpo_entries: ClipboardList,
  lpo_summaries: FileText,
  yard_fuel: Database,
  users: Users,
  audit_logs: Shield,
};

const FORMAT_OPTIONS: { value: ExportFormat; label: string; icon: React.ElementType; desc: string }[] = [
  { value: 'xlsx', label: 'Excel (.xlsx)', icon: FileSpreadsheet, desc: 'Best for analysis in Excel / Google Sheets' },
  { value: 'csv',  label: 'CSV (.csv)',    icon: FileText,        desc: 'Universal format, opens in any spreadsheet app' },
  { value: 'json', label: 'JSON (.json)',  icon: Database,        desc: 'Raw structured data for developers / APIs' },
];

export default function DataExportTab({ onMessage }: Props) {
  const [resources, setResources] = useState<ExportResource[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string>('');
  const [format, setFormat] = useState<ExportFormat>('xlsx');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [exporting, setExporting] = useState(false);

  const loadResources = useCallback(async () => {
    try {
      const data = await dataExportService.listResources();
      setResources(data);
      if (data.length > 0) setSelected(data[0].id);
    } catch {
      onMessage('Failed to load export resources', 'error');
    } finally {
      setLoading(false);
    }
  }, [onMessage]);

  useEffect(() => { loadResources(); }, [loadResources]);

  async function handleExport() {
    if (!selected) { onMessage('Please select a resource to export', 'error'); return; }
    if (from && to && new Date(from) > new Date(to)) {
      onMessage('Start date must be before end date', 'error');
      return;
    }
    setExporting(true);
    try {
      await dataExportService.exportData({
        resource: selected,
        format,
        from: from || undefined,
        to: to || undefined,
      });
      onMessage(`Export downloaded successfully`, 'success');
    } catch (err: any) {
      onMessage(err?.response?.data?.message ?? 'Export failed', 'error');
    } finally {
      setExporting(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="w-6 h-6 animate-spin text-indigo-500" />
      </div>
    );
  }

  const selectedResource = resources.find((r) => r.id === selected);

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Header */}
      <div>
        <h2 className="text-xl font-bold text-gray-900 dark:text-white">Data Export Center</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
          Export any system dataset as Excel, CSV, or JSON — including archived records
        </p>
      </div>

      {/* Step 1: Select Resource */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
        <div className="flex items-center gap-2 mb-4">
          <span className="w-6 h-6 rounded-full bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400 text-xs font-bold flex items-center justify-center">1</span>
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Choose Dataset</h3>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {resources.map((r) => {
            const Icon = RESOURCE_ICONS[r.id] ?? Database;
            const isSelected = selected === r.id;
            return (
              <button
                key={r.id}
                onClick={() => setSelected(r.id)}
                className={`flex items-center gap-3 p-3.5 rounded-xl border text-left transition-all ${
                  isSelected
                    ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20 dark:border-indigo-500'
                    : 'border-gray-200 dark:border-gray-700 hover:border-indigo-300 dark:hover:border-indigo-700 hover:bg-gray-50 dark:hover:bg-gray-700/50'
                }`}
              >
                <Icon className={`w-5 h-5 flex-shrink-0 ${isSelected ? 'text-indigo-600 dark:text-indigo-400' : 'text-gray-400'}`} />
                <div className="min-w-0">
                  <p className={`text-sm font-medium truncate ${isSelected ? 'text-indigo-700 dark:text-indigo-300' : 'text-gray-800 dark:text-gray-200'}`}>{r.label}</p>
                  <p className="text-xs text-gray-400 dark:text-gray-500 truncate">{r.description}</p>
                </div>
                {isSelected && <ChevronRight className="w-4 h-4 text-indigo-500 ml-auto flex-shrink-0" />}
              </button>
            );
          })}
        </div>
      </div>

      {/* Step 2: Date Range */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
        <div className="flex items-center gap-2 mb-4">
          <span className="w-6 h-6 rounded-full bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400 text-xs font-bold flex items-center justify-center">2</span>
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Date Range <span className="text-gray-400 font-normal">(optional — leave blank for all)</span></h3>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5 flex items-center gap-1">
              <Calendar className="w-3 h-3" /> From
            </label>
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5 flex items-center gap-1">
              <Calendar className="w-3 h-3" /> To
            </label>
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
            />
          </div>
        </div>
      </div>

      {/* Step 3: Format */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
        <div className="flex items-center gap-2 mb-4">
          <span className="w-6 h-6 rounded-full bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400 text-xs font-bold flex items-center justify-center">3</span>
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Export Format</h3>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {FORMAT_OPTIONS.map((f) => {
            const Icon = f.icon;
            const isSelected = format === f.value;
            return (
              <button
                key={f.value}
                onClick={() => setFormat(f.value)}
                className={`flex flex-col items-start p-4 rounded-xl border text-left transition-all ${
                  isSelected
                    ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20 dark:border-indigo-500'
                    : 'border-gray-200 dark:border-gray-700 hover:border-indigo-300 dark:hover:border-indigo-700 hover:bg-gray-50 dark:hover:bg-gray-700/50'
                }`}
              >
                <Icon className={`w-5 h-5 mb-2 ${isSelected ? 'text-indigo-600 dark:text-indigo-400' : 'text-gray-400'}`} />
                <p className={`text-sm font-semibold ${isSelected ? 'text-indigo-700 dark:text-indigo-300' : 'text-gray-800 dark:text-gray-200'}`}>{f.label}</p>
                <p className="text-xs text-gray-400 mt-0.5">{f.desc}</p>
              </button>
            );
          })}
        </div>
      </div>

      {/* Export Button */}
      <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-800/50 rounded-xl border border-gray-200 dark:border-gray-700">
        <div className="min-w-0">
          {selectedResource ? (
            <>
              <p className="text-sm font-medium text-gray-900 dark:text-white">
                {selectedResource.label} → {format.toUpperCase()}
              </p>
              <p className="text-xs text-gray-400 mt-0.5">
                {from && to ? `${from} to ${to}` : from ? `from ${from}` : to ? `up to ${to}` : 'All records'}
              </p>
            </>
          ) : (
            <p className="text-sm text-gray-400">Select a dataset to export</p>
          )}
        </div>
        <button
          onClick={handleExport}
          disabled={!selected || exporting}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-semibold transition-colors shadow-sm"
        >
          {exporting
            ? <><RefreshCw className="w-4 h-4 animate-spin" /> Exporting…</>
            : <><Download className="w-4 h-4" /> Download</>
          }
        </button>
      </div>
    </div>
  );
}
