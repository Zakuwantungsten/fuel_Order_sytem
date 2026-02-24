/**
 * ExcelImport.tsx
 * 
 * Admin-only page that lets users upload an Excel workbook (.xlsx / .xls)
 * or a CSV file and import its data into the MongoDB collections:
 *   • FuelRecord  (sheets named Jan, Feb … or containing fuel-record headers)
 *   • DeliveryOrder
 *   • LPOEntry
 *
 * Every record is always upserted — existing records are overwritten, new ones
 * are inserted. Nothing is ever skipped because it already exists.
 *
 * Workflow:
 *   1. Drop / select file  →  Preview (GET sheet names & detected types)
 *   2. Configure options   →  Import (POST to /api/import/excel)
 *   3. View per-sheet results
 */

import { useState, useCallback, useRef } from 'react';
import {
  Upload, FileSpreadsheet, Eye, Play, RotateCcw, CheckCircle2,
  AlertTriangle, XCircle, Info, ChevronDown, ChevronUp, Loader2,
  Fuel, PackageCheck, Receipt, HelpCircle, X
} from 'lucide-react';
import apiClient from '../services/api';

// ─── Types ────────────────────────────────────────────────────────────────────

type SheetType = 'fuelRecord' | 'deliveryOrder' | 'lpoEntry' | 'unknown';

interface SheetPreview {
  name: string;
  detectedType: SheetType;
  rowCount: number;
  headers: string[];
}

interface SheetResult {
  name: string;
  type: SheetType;
  inserted: number;
  updated: number;
  skipped: number;
  errors: number;
}

interface ImportSummary {
  totalInserted: number;
  totalUpdated: number;
  totalSkipped: number;
  totalErrors: number;
  sheetsProcessed: number;
}

type ImportStatus = 'idle' | 'previewing' | 'previewed' | 'importing' | 'done' | 'error';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const TYPE_META: Record<SheetType, { label: string; color: string; bg: string; icon: typeof Fuel }> = {
  fuelRecord:    { label: 'Fuel Record',    color: 'text-blue-700 dark:text-blue-300',   bg: 'bg-blue-50 dark:bg-blue-900/30',   icon: Fuel },
  deliveryOrder: { label: 'Delivery Order', color: 'text-green-700 dark:text-green-300', bg: 'bg-green-50 dark:bg-green-900/30', icon: PackageCheck },
  lpoEntry:      { label: 'LPO Entry',      color: 'text-purple-700 dark:text-purple-300', bg: 'bg-purple-50 dark:bg-purple-900/30', icon: Receipt },
  unknown:       { label: 'Unknown',        color: 'text-gray-500 dark:text-gray-400',  bg: 'bg-gray-50 dark:bg-gray-800',      icon: HelpCircle },
};

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SheetTypeBadge({ type }: { type: SheetType }) {
  const meta = TYPE_META[type];
  const Icon = meta.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${meta.bg} ${meta.color}`}>
      <Icon className="w-3 h-3" />
      {meta.label}
    </span>
  );
}

function StatPill({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className={`flex flex-col items-center px-3 py-1.5 rounded-lg ${color}`}>
      <span className="text-lg font-bold tabular-nums">{value}</span>
      <span className="text-xs opacity-75">{label}</span>
    </div>
  );
}

// ─── Main component ──────────────────────────────────────────────────────────

export default function ExcelImport() {
  const [file, setFile] = useState<File | null>(null);
  const [sheets, setSheets] = useState<SheetPreview[]>([]);
  const [selectedSheets, setSelectedSheets] = useState<Set<string>>(new Set());
  const [dryRun, setDryRun] = useState(true);
  const [year, setYear] = useState<string>('');
  const [status, setStatus] = useState<ImportStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [sheetResults, setSheetResults] = useState<SheetResult[]>([]);
  const [progress, setProgress] = useState<{ current: number; total: number; sheet: string } | null>(null);
  const [expandedSheets, setExpandedSheets] = useState<Set<string>>(new Set());
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── File handling ──────────────────────────────────────────────────────────

  const handleFile = useCallback((f: File) => {
    if (!f.name.match(/\.(xlsx|xls|csv)$/i)) {
      setError('Only Excel (.xlsx, .xls) or CSV (.csv) files are accepted.');
      return;
    }
    setFile(f);
    setSheets([]);
    setSelectedSheets(new Set());
    setSummary(null);
    setSheetResults([]);
    setStatus('idle');
    setError(null);
  }, []);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  }, [handleFile]);

  const onInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) handleFile(f);
    e.target.value = '';
  };

  const clearFile = () => {
    setFile(null);
    setSheets([]);
    setSelectedSheets(new Set());
    setSummary(null);
    setSheetResults([]);
    setStatus('idle');
    setError(null);
  };

  // ── Preview ────────────────────────────────────────────────────────────────

  const handlePreview = async () => {
    if (!file) return;
    setStatus('previewing');
    setError(null);

    const formData = new FormData();
    formData.append('excelFile', file);

    try {
      const res = await (apiClient as any).post('/import/preview', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      const data = res.data;
      setSheets(data.sheets);
      setSelectedSheets(new Set(data.sheets.filter((s: SheetPreview) => s.detectedType !== 'unknown').map((s: SheetPreview) => s.name)));
      setStatus('previewed');
    } catch (err: any) {
      setError(err.response?.data?.message ?? 'Preview failed.');
      setStatus('error');
    }
  };

  // ── Import ─────────────────────────────────────────────────────────────────

  const handleImport = async () => {
    if (!file) return;
    setStatus('importing');
    setError(null);
    setSummary(null);
    setSheetResults([]);

    const sheetsToImport = Array.from(selectedSheets);
    const total = sheetsToImport.length;
    const allResults: SheetResult[] = [];

    setProgress({ current: 0, total, sheet: sheetsToImport[0] ?? '' });

    try {
      for (let i = 0; i < sheetsToImport.length; i++) {
        const sheetName = sheetsToImport[i];
        setProgress({ current: i, total, sheet: sheetName });

        const formData = new FormData();
        formData.append('excelFile', file);
        formData.append('dryRun', String(dryRun));
        if (year) formData.append('year', year);
        formData.append('sheets', JSON.stringify([sheetName]));

        const res = await (apiClient as any).post('/import/excel', formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
        allResults.push(...(res.data.sheets as SheetResult[]));
      }

      const finalSummary: ImportSummary = {
        totalInserted:   allResults.reduce((s, r) => s + r.inserted, 0),
        totalUpdated:    allResults.reduce((s, r) => s + r.updated,  0),
        totalSkipped:    allResults.reduce((s, r) => s + r.skipped,  0),
        totalErrors:     allResults.reduce((s, r) => s + r.errors,   0),
        sheetsProcessed: allResults.length,
      };
      setSummary(finalSummary);
      setSheetResults(allResults);
      setStatus('done');
    } catch (err: any) {
      setError(err.response?.data?.message ?? 'Import failed.');
      setStatus('error');
    } finally {
      setProgress(null);
    }
  };

  // ── Helpers ────────────────────────────────────────────────────────────────

  const toggleSheet = (name: string) => {
    setSelectedSheets(prev => {
      const next = new Set(prev);
      next.has(name) ? next.delete(name) : next.add(name);
      return next;
    });
  };

  const toggleExpand = (name: string) => {
    setExpandedSheets(prev => {
      const next = new Set(prev);
      next.has(name) ? next.delete(name) : next.add(name);
      return next;
    });
  };

  const selectAll = () => setSelectedSheets(new Set(sheets.map(s => s.name)));
  const selectAutoDetected = () => setSelectedSheets(new Set(sheets.filter(s => s.detectedType !== 'unknown').map(s => s.name)));
  const deselectAll = () => setSelectedSheets(new Set());

  const isImporting = status === 'importing' || status === 'previewing';
  const canPreview = !!file && status !== 'importing';
  const canImport = !!file && selectedSheets.size > 0 && !isImporting &&
    (status === 'previewed' || status === 'done' || status === 'error');

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-4 sm:p-6 lg:p-8">
      <div className="max-w-4xl mx-auto space-y-6">

        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <FileSpreadsheet className="w-7 h-7 text-indigo-500" />
            Data Import
          </h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Upload an Excel (<strong>.xlsx / .xls</strong>) or CSV (<strong>.csv</strong>) file to populate
            &nbsp;<strong>FuelRecords</strong>,&nbsp;<strong>Delivery Orders</strong>, or&nbsp;<strong>LPO Entries</strong>.
            Every record is always upserted — no records are ever skipped.
          </p>
        </div>

        {/* ── Step 1 – File picker ────────────────────────────────────────── */}
        <section className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-6">
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4 uppercase tracking-wide">
            Step 1 — Select File
          </h2>

          {!file ? (
            <div
              onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={onDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-xl p-10 flex flex-col items-center justify-center cursor-pointer transition-colors
                ${isDragging
                  ? 'border-indigo-400 bg-indigo-50 dark:bg-indigo-900/20'
                  : 'border-gray-300 dark:border-gray-600 hover:border-indigo-300 dark:hover:border-indigo-500 hover:bg-gray-50 dark:hover:bg-gray-700/30'
                }`}
            >
              <Upload className="w-10 h-10 text-gray-400 dark:text-gray-500 mb-3" />
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Drop your file here, or <span className="text-indigo-600 dark:text-indigo-400 underline">browse</span>
              </p>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">.xlsx, .xls or .csv — max 25 MB</p>
              <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={onInputChange} />
            </div>
          ) : (
            <div className="flex items-center gap-4 p-4 bg-indigo-50 dark:bg-indigo-900/20 rounded-xl border border-indigo-100 dark:border-indigo-800">
              <FileSpreadsheet className="w-10 h-10 text-indigo-500 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-800 dark:text-gray-100 truncate">{file.name}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">{formatBytes(file.size)}</p>
              </div>
              <button
                onClick={clearFile}
                className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                title="Remove file"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {error && (
            <div className="mt-3 flex items-start gap-2 p-3 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-100 dark:border-red-800 text-red-700 dark:text-red-400 text-sm">
              <XCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              {error}
            </div>
          )}

          <button
            onClick={handlePreview}
            disabled={!canPreview}
            className="mt-4 flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 dark:disabled:bg-indigo-900 text-white rounded-xl text-sm font-semibold transition-colors"
          >
            {status === 'previewing' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Eye className="w-4 h-4" />}
            {status === 'previewing' ? 'Reading file…' : 'Preview Sheets'}
          </button>
        </section>

        {/* ── Step 2 – Sheet selection ─────────────────────────────────────── */}
        {sheets.length > 0 && (
          <section className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide">
                Step 2 — Select Sheets to Import
              </h2>
              <div className="flex gap-2 text-xs">
                <button onClick={selectAll} className="text-indigo-600 dark:text-indigo-400 hover:underline">All</button>
                <span className="text-gray-300 dark:text-gray-600">|</span>
                <button onClick={selectAutoDetected} className="text-indigo-600 dark:text-indigo-400 hover:underline">Auto-detected</button>
                <span className="text-gray-300 dark:text-gray-600">|</span>
                <button onClick={deselectAll} className="text-indigo-600 dark:text-indigo-400 hover:underline">None</button>
              </div>
            </div>

            <div className="space-y-2">
              {sheets.map((sheet) => {
                const isSelected = selectedSheets.has(sheet.name);
                const isExpanded = expandedSheets.has(sheet.name);
                return (
                  <div
                    key={sheet.name}
                    className={`rounded-xl border transition-colors ${
                      isSelected
                        ? 'border-indigo-200 dark:border-indigo-700 bg-indigo-50/50 dark:bg-indigo-900/10'
                        : 'border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-700/30'
                    }`}
                  >
                    <div className="flex items-center gap-3 p-3">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSheet(sheet.name)}
                        className="w-4 h-4 rounded accent-indigo-600"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium text-gray-800 dark:text-gray-100 truncate">{sheet.name}</span>
                          <SheetTypeBadge type={sheet.detectedType} />
                          <span className="text-xs text-gray-400 dark:text-gray-500">{sheet.rowCount} rows</span>
                        </div>
                      </div>
                      {sheet.headers.length > 0 && (
                        <button
                          onClick={() => toggleExpand(sheet.name)}
                          className="p-1 rounded text-gray-400 hover:text-indigo-500 transition-colors"
                          title="Toggle headers"
                        >
                          {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        </button>
                      )}
                    </div>
                    {isExpanded && sheet.headers.length > 0 && (
                      <div className="px-3 pb-3 pt-0 border-t border-gray-100 dark:border-gray-700">
                        <p className="text-xs text-gray-500 dark:text-gray-400 mb-1 mt-2">Detected columns:</p>
                        <div className="flex flex-wrap gap-1">
                          {sheet.headers.map((h) => (
                            <span key={h} className="px-1.5 py-0.5 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded text-xs text-gray-600 dark:text-gray-300">
                              {h}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {sheets.some(s => s.detectedType === 'unknown') && (
              <div className="mt-3 flex items-start gap-2 p-3 bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-100 dark:border-amber-800 text-amber-700 dark:text-amber-400 text-xs">
                <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <span>
                  Sheets marked as <strong>Unknown</strong> could not be matched to a collection.
                  Rename the sheet to <em>FuelRecord</em>, <em>DeliveryOrder</em>, or <em>LPO</em>,
                  or ensure it contains recognisable column headers (e.g. "Truck No", "DO Number", "LPO No").
                </span>
              </div>
            )}
          </section>
        )}

        {/* ── Step 3 – Import options ──────────────────────────────────────── */}
        {sheets.length > 0 && (
          <section className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-6">
            <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4 uppercase tracking-wide">
              Step 3 — Import Options
            </h2>

            <div className="grid sm:grid-cols-1 gap-4">
              {/* Dry run */}
              <label className={`flex items-start gap-3 p-4 rounded-xl border cursor-pointer transition-colors ${
                dryRun ? 'border-indigo-200 dark:border-indigo-700 bg-indigo-50 dark:bg-indigo-900/20'
                       : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/30'
              }`}>
                <input type="checkbox" checked={dryRun} onChange={e => setDryRun(e.target.checked)}
                  className="mt-0.5 w-4 h-4 rounded accent-indigo-600" />
                <div>
                  <p className="text-sm font-medium text-gray-800 dark:text-gray-100">Dry Run (Preview only)</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                    Simulate the import and show what <em>would</em> be inserted / updated — no data written to the database.
                    Uncheck this to actually write to the database.
                  </p>
                </div>
              </label>
            </div>

            {/* Year override */}
            <div className="mt-4 flex items-center gap-3">
              <div className="flex-1 max-w-xs">
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                  Year Override <span className="font-normal text-gray-400">(optional)</span>
                </label>
                <input
                  type="number"
                  min={2000}
                  max={2099}
                  placeholder="e.g. 2025"
                  value={year}
                  onChange={e => setYear(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div className="flex items-start gap-1 mt-5 text-xs text-gray-400 dark:text-gray-500">
                <Info className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                Forces all dates to the specified year. Useful when Excel serial dates are ambiguous.
              </div>
            </div>

            {/* Import button */}
            <div className="mt-6 flex flex-col sm:flex-row items-start sm:items-center gap-3">
              <button
                onClick={handleImport}
                disabled={!canImport}
                className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-semibold transition-colors text-white ${
                  dryRun
                    ? 'bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 dark:disabled:bg-indigo-900'
                    : 'bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-300 dark:disabled:bg-emerald-900'
                }`}
              >
                {status === 'importing'
                  ? <><Loader2 className="w-4 h-4 animate-spin" /> Importing…</>
                  : dryRun
                    ? <><Eye className="w-4 h-4" /> Run Dry-Run</>
                    : <><Play className="w-4 h-4" /> Import to Database</>}
              </button>

              {status === 'done' && (
                <button
                  onClick={() => { setStatus('previewed'); setSummary(null); setSheetResults([]); }}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                >
                  <RotateCcw className="w-4 h-4" /> Import Again
                </button>
              )}

              {!dryRun && (
                <p className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  Dry Run is off — every record will be written to the database.
                </p>
              )}
            </div>

            {/* ── Progress bar ───────────────────────────────────────────── */}
            {status === 'importing' && progress && (
              <div className="mt-5 space-y-1.5">
                <div className="flex items-center justify-between text-xs text-gray-600 dark:text-gray-400">
                  <span className="flex items-center gap-1.5">
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-500" />
                    Processing&nbsp;
                    <span className="font-semibold text-gray-800 dark:text-gray-100 truncate max-w-[220px]">
                      {progress.sheet}
                    </span>
                  </span>
                  <span className="tabular-nums font-medium">
                    {progress.current}&thinsp;/&thinsp;{progress.total} sheets
                  </span>
                </div>
                <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2.5 overflow-hidden">
                  <div
                    className="h-full bg-indigo-500 dark:bg-indigo-400 rounded-full transition-all duration-500 ease-out"
                    style={{ width: `${progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0}%` }}
                  />
                </div>
                <p className="text-right text-xs text-gray-400 dark:text-gray-500">
                  {progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0}% complete
                </p>
              </div>
            )}
          </section>
        )}

        {/* ── Results ──────────────────────────────────────────────────────── */}
        {status === 'done' && summary && (
          <section className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-6">
            <div className="flex items-center gap-2 mb-5">
              <CheckCircle2 className="w-5 h-5 text-emerald-500" />
              <h2 className="text-base font-semibold text-gray-800 dark:text-gray-100">
                {dryRun ? 'Dry-Run Complete' : 'Import Complete'}
              </h2>
            </div>

            {/* Summary pills */}
            <div className="flex flex-wrap gap-3 mb-6">
              <StatPill label="Inserted" value={summary.totalInserted} color="bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300" />
              <StatPill label="Updated"  value={summary.totalUpdated}  color="bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300" />
              <StatPill label="Skipped"  value={summary.totalSkipped}  color="bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300" />
              <StatPill label="Errors"   value={summary.totalErrors}   color={summary.totalErrors > 0 ? 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300' : 'bg-gray-100 dark:bg-gray-700 text-gray-400 dark:text-gray-500'} />
              <StatPill label="Sheets"   value={summary.sheetsProcessed} color="bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-300" />
            </div>

            {/* Per-sheet breakdown */}
            <div className="space-y-2">
              {sheetResults.map((sr) => (
                <div key={sr.name} className="rounded-xl border border-gray-100 dark:border-gray-700 overflow-hidden">
                  <div className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-700/40">
                    <SheetTypeBadge type={sr.type} />
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-200 flex-1">{sr.name}</span>
                    <div className="flex gap-3 text-xs">
                      <span className="text-emerald-600 dark:text-emerald-400">+{sr.inserted}</span>
                      <span className="text-blue-600 dark:text-blue-400">~{sr.updated}</span>
                      <span className="text-gray-400 dark:text-gray-500">/{sr.skipped}</span>
                      {sr.errors > 0 && <span className="text-red-500">!{sr.errors}</span>}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <p className="mt-4 text-xs text-gray-400 dark:text-gray-500">
              Legend: <span className="text-emerald-600">+inserted</span>&nbsp;|&nbsp;
              <span className="text-blue-600">~updated</span>&nbsp;|&nbsp;
              /skipped&nbsp;|&nbsp;<span className="text-red-500">!errors</span>
            </p>
          </section>
        )}

        {/* ── Help ─────────────────────────────────────────────────────────── */}
        <section className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-6">
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3 uppercase tracking-wide flex items-center gap-2">
            <HelpCircle className="w-4 h-4" /> How sheet detection works
          </h2>
          <div className="grid sm:grid-cols-3 gap-4 text-xs text-gray-600 dark:text-gray-400">
            <div className="space-y-1">
              <p className="font-semibold text-blue-600 dark:text-blue-400 flex items-center gap-1"><Fuel className="w-3.5 h-3.5" /> Fuel Record</p>
              <p>Sheets named after a month (<em>Jan, Feb, Mar 2025…</em>) or containing columns like <em>Going DO, Truck No, Dar Going</em>.</p>
            </div>
            <div className="space-y-1">
              <p className="font-semibold text-green-600 dark:text-green-400 flex items-center gap-1"><PackageCheck className="w-3.5 h-3.5" /> Delivery Order</p>
              <p>Sheets named <em>DeliveryOrder / DO Report</em> or with columns like <em>DO Number, Haulier, Loading Point</em>.</p>
            </div>
            <div className="space-y-1">
              <p className="font-semibold text-purple-600 dark:text-purple-400 flex items-center gap-1"><Receipt className="w-3.5 h-3.5" /> LPO Entry</p>
              <p>Sheets named <em>LPO</em> or containing columns like <em>LPO No, Diesel At, Price/Ltr</em>.</p>
            </div>
          </div>
        </section>

      </div>
    </div>
  );
}
