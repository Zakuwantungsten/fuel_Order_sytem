import React, { useEffect, useState } from 'react';
import { X, Fuel, AlertCircle, Loader2, TruckIcon, Calendar, ArrowRight, ArrowLeft, CheckCircle2, MessageSquare } from 'lucide-react';
import { FuelRecord } from '../types';
import api, { lpoDocumentsAPI } from '../services/api';

type EntryContext = {
  lpoId: string;
  lpoNo: string;
  station: string;
  date: string;
  doNo: string;
  truckNo: string;
  liters: number;
  context: string;
  dispensedCheckpoint?: string | null;
};

const CHECKPOINT_COLUMNS = [
  { abbr: 'MMS', field: 'mmsaYard', label: 'MMSA Yard' },
  { abbr: 'TNY', field: 'tangaYard', label: 'Tanga Yard' },
  { abbr: 'DRY', field: 'darYard', label: 'DAR Yard' },
  { abbr: 'TNG', field: 'tangaGoing', label: 'Tanga Going' },
  { abbr: 'DRG', field: 'darGoing', label: 'DAR Going' },
  { abbr: 'MOG', field: 'moroGoing', label: 'Moro Going' },
  { abbr: 'MBG', field: 'mbeyaGoing', label: 'Mbeya Going' },
  { abbr: 'TDG', field: 'tdmGoing', label: 'Tunduma Going' },
  { abbr: 'ZMG', field: 'zambiaGoing', label: 'Zambia Going' },
  { abbr: 'CNG', field: 'congoFuel', label: 'Congo Fuel' },
  { abbr: 'ZMR', field: 'zambiaReturn', label: 'Zambia Return' },
  { abbr: 'TDR', field: 'tundumaReturn', label: 'Tunduma Return' },
  { abbr: 'MBR', field: 'mbeyaReturn', label: 'Mbeya Return' },
  { abbr: 'MOR', field: 'moroReturn', label: 'Moro Return' },
  { abbr: 'DRR', field: 'darReturn', label: 'DAR Return' },
  { abbr: 'TNR', field: 'tangaReturn', label: 'Tanga Return' },
  { abbr: 'BAL', field: 'balance', label: 'Balance' },
] as const;

interface FuelRecordInspectModalProps {
  isOpen: boolean;
  onClose: () => void;
  fuelRecordId: string | number;
  truckNumber?: string;
}

function calculateTotalFuel(record: FuelRecord): number {
  return (
    (record.mmsaYard || 0) +
    (record.tangaYard || 0) +
    (record.darYard || 0) +
    (record.tangaGoing || 0) +
    (record.darGoing || 0) +
    (record.moroGoing || 0) +
    (record.mbeyaGoing || 0) +
    (record.tdmGoing || 0) +
    (record.zambiaGoing || 0) +
    (record.congoFuel || 0) +
    (record.zambiaReturn || 0) +
    (record.tundumaReturn || 0) +
    (record.mbeyaReturn || 0) +
    (record.moroReturn || 0) +
    (record.darReturn || 0) +
    (record.tangaReturn || 0)
  );
}

function getFrontierField(record: FuelRecord): string | null {
  const stops = CHECKPOINT_COLUMNS.filter(c => c.field !== 'balance');
  let lastIdx = -1;
  stops.forEach((col, i) => {
    if (((record as any)[col.field] || 0) > 0) lastIdx = i;
  });
  return lastIdx < stops.length - 1 ? stops[lastIdx + 1].field : null;
}

function getStatusBadge(record: FuelRecord): { label: string; cls: string } {
  if ((record as any).isLocked) return { label: 'Locked', cls: 'bg-amber-500/90 text-white' };
  if ((record.balance || 0) === 0) return { label: 'Completed', cls: 'bg-gray-500/80 text-white' };
  if ((record.balance || 0) > 0) return { label: 'Active', cls: 'bg-green-500/90 text-white' };
  return { label: 'Overspent', cls: 'bg-red-500/90 text-white' };
}

const SectionBadge = ({ n }: { n: string }) => (
  <span className="flex items-center justify-center w-6 h-6 rounded-full bg-gray-200 dark:bg-gray-700 text-xs font-bold text-gray-600 dark:text-gray-300 shrink-0">
    {n}
  </span>
);

const FuelRecordInspectModal: React.FC<FuelRecordInspectModalProps> = ({
  isOpen,
  onClose,
  fuelRecordId,
  truckNumber,
}) => {
  const [fuelRecord, setFuelRecord] = useState<FuelRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [entryContexts, setEntryContexts] = useState<EntryContext[]>([]);
  const [contextPopover, setContextPopover] = useState<EntryContext | null>(null);

  useEffect(() => {
    if (!isOpen) {
      setFuelRecord(null);
      setLoading(true);
      setError(null);
      setEntryContexts([]);
      setContextPopover(null);
    }
  }, [isOpen]);

  useEffect(() => {
    if (isOpen && fuelRecordId) {
      setFuelRecord(null);
      setLoading(true);
      setError(null);
      setEntryContexts([]);
      setContextPopover(null);
      fetchFuelRecord();
    }
  }, [isOpen, fuelRecordId]);

  useEffect(() => {
    if (!isOpen) return;
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        e.preventDefault();
        if (contextPopover) {
          setContextPopover(null);
          return;
        }
        onClose();
      }
    };
    window.addEventListener('keydown', handleEscape, true);
    return () => window.removeEventListener('keydown', handleEscape, true);
  }, [isOpen, onClose, contextPopover]);

  const fetchEntryContexts = async (record: FuelRecord) => {
    if (!record.truckNo) {
      setEntryContexts([]);
      return;
    }
    try {
      const contexts = await lpoDocumentsAPI.getEntryContextsForFuelRecord({
        truckNo: record.truckNo,
        goingDo: record.goingDo,
        returnDo: record.returnDo,
      });
      setEntryContexts(contexts || []);
    } catch {
      setEntryContexts([]);
    }
  };

  const fetchFuelRecord = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await api.get(`/fuel-records/${fuelRecordId}`);
      const record = response.data?.data || response.data;
      setFuelRecord(record);
      if (record) {
        void fetchEntryContexts(record);
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to fetch fuel record');
    } finally {
      setLoading(false);
    }
  };

  const contextsForDo = (doNo?: string | null) => {
    if (!doNo) return [];
    const up = doNo.toUpperCase().trim();
    return entryContexts.filter((c) => (c.doNo || '').toUpperCase().trim() === up);
  };

  const renderContextIcon = (doNo?: string | null, tint = 'text-indigo-600 dark:text-indigo-300') => {
    const matches = contextsForDo(doNo);
    if (matches.length === 0) return null;
    const first = matches[0];
    const title = matches.map((c) => c.context).join('\n\n');
    return (
      <button
        type="button"
        title={title}
        onClick={(e) => {
          e.stopPropagation();
          setContextPopover(first);
        }}
        className={`inline-flex items-center gap-1 p-0.5 rounded hover:bg-black/5 dark:hover:bg-white/10 ${tint}`}
      >
        <MessageSquare className="h-3.5 w-3.5" />
        {matches.length > 1 && (
          <span className="text-[10px] font-bold leading-none">{matches.length}</span>
        )}
      </button>
    );
  };

  const handleClose = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    e?.preventDefault();
    onClose();
  };

  if (!isOpen) return null;

  const totalFuel = fuelRecord ? calculateTotalFuel(fuelRecord) : 0;
  const frontierField = fuelRecord ? getFrontierField(fuelRecord) : null;
  const badge = fuelRecord ? getStatusBadge(fuelRecord) : null;
  const balance = fuelRecord?.balance || 0;

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center">
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={handleClose} />

      <div
        className="relative bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-4xl mx-4 max-h-[90vh] overflow-hidden flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* ── HEADER ── */}
        <div className="bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-600 px-6 py-4 shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-white/20 rounded-xl">
                <Fuel className="h-5 w-5 text-white" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-white">Fuel Record Inspection</h2>
                <div className="flex items-center gap-2 text-white/75 text-sm mt-0.5">
                  <TruckIcon className="h-3.5 w-3.5" />
                  <span>{fuelRecord?.truckNo || truckNumber || '—'}</span>
                  <span className="opacity-50">•</span>
                  <Calendar className="h-3.5 w-3.5" />
                  <span>{fuelRecord?.month || '—'}</span>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {badge && (
                <span className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-semibold ${badge.cls}`}>
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  {badge.label}
                </span>
              )}
              <button onClick={handleClose} className="p-2 hover:bg-white/20 rounded-xl transition-colors">
                <X className="h-5 w-5 text-white" />
              </button>
            </div>
          </div>
        </div>

        {/* ── SCROLLABLE BODY ── */}
        <div className="flex-1 overflow-y-auto">
          {loading && (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
              <span className="ml-3 text-gray-500 dark:text-gray-400">Loading fuel record…</span>
            </div>
          )}

          {error && (
            <div className="flex flex-col items-center justify-center py-16">
              <AlertCircle className="h-12 w-12 text-red-500 mb-4" />
              <p className="text-red-600 dark:text-red-400 text-center mb-4">{error}</p>
              <button
                onClick={fetchFuelRecord}
                className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
              >
                Retry
              </button>
            </div>
          )}

          {fuelRecord && (
            <>
              {/* ── STATS BAR ── */}
              <div className="grid grid-cols-2 md:grid-cols-4 divide-x divide-y md:divide-y-0 divide-gray-100 dark:divide-gray-800 border-b border-gray-100 dark:border-gray-800">
                <div className="p-4">
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Truck</p>
                  <p className="text-xl font-black text-gray-900 dark:text-white mt-1 tracking-wide">
                    {fuelRecord.truckNo || truckNumber || '—'}
                  </p>
                </div>
                <div className="p-4">
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Route</p>
                  <p className="text-base font-bold text-gray-900 dark:text-white mt-1">
                    {fuelRecord.from || '—'} → {fuelRecord.to || '—'}
                  </p>
                  {fuelRecord.returnDo && (
                    <p className="text-xs text-gray-400 mt-0.5">Going + Return</p>
                  )}
                </div>
                <div className="p-4">
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Total Allocated</p>
                  <p className="mt-1">
                    <span className="text-xl font-black text-purple-600 dark:text-purple-400">
                      {(fuelRecord.totalLts || 0).toLocaleString()}
                    </span>
                    <span className="text-sm text-gray-400 ml-1">L</span>
                  </p>
                </div>
                <div className="p-4">
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Balance Remaining</p>
                  <p className="mt-1">
                    <span className={`text-xl font-black ${
                      balance > 0 ? 'text-green-600 dark:text-green-400' :
                      balance < 0 ? 'text-red-600 dark:text-red-400' :
                      'text-gray-500 dark:text-gray-400'
                    }`}>
                      {balance.toLocaleString()}
                    </span>
                    <span className="text-sm text-gray-400 ml-1">L</span>
                  </p>
                </div>
              </div>

              <div className="p-6 space-y-6">
                {/* ── JOURNEY CARDS ── */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="bg-blue-50/70 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <div className="p-1.5 bg-blue-600 rounded-lg shrink-0">
                        <ArrowRight className="h-4 w-4 text-white" />
                      </div>
                      <h4 className="text-[10px] font-bold text-blue-700 dark:text-blue-300 uppercase tracking-widest">
                        Going Journey (Import)
                      </h4>
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <p className="text-[10px] text-blue-500 dark:text-blue-400">DO number</p>
                        <p className="text-sm font-semibold text-blue-900 dark:text-blue-100 mt-0.5 inline-flex items-center gap-1">
                          {fuelRecord.goingDo || '—'}
                          {renderContextIcon(fuelRecord.goingDo, 'text-blue-600 dark:text-blue-300')}
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] text-blue-500 dark:text-blue-400">From</p>
                        <p className="text-sm font-bold text-blue-900 dark:text-blue-100 mt-0.5 uppercase">
                          {(fuelRecord as any).originalGoingFrom || fuelRecord.from || '—'}
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] text-blue-500 dark:text-blue-400">To</p>
                        <p className="text-sm font-bold text-blue-900 dark:text-blue-100 mt-0.5 uppercase">
                          {(fuelRecord as any).originalGoingTo || fuelRecord.to || '—'}
                        </p>
                      </div>
                    </div>
                  </div>

                  {fuelRecord.returnDo ? (
                    <div className="bg-green-50/70 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl p-4">
                      <div className="flex items-center gap-2 mb-3">
                        <div className="p-1.5 bg-green-600 rounded-lg shrink-0">
                          <ArrowLeft className="h-4 w-4 text-white" />
                        </div>
                        <h4 className="text-[10px] font-bold text-green-700 dark:text-green-300 uppercase tracking-widest">
                          Return Journey (Export)
                        </h4>
                      </div>
                      <div className="grid grid-cols-3 gap-3">
                        <div>
                          <p className="text-[10px] text-green-500 dark:text-green-400">DO number</p>
                          <p className="text-sm font-semibold text-green-900 dark:text-green-100 mt-0.5 inline-flex items-center gap-1">
                            {fuelRecord.returnDo}
                            {renderContextIcon(fuelRecord.returnDo, 'text-green-600 dark:text-green-300')}
                          </p>
                        </div>
                        <div>
                          <p className="text-[10px] text-green-500 dark:text-green-400">From</p>
                          <p className="text-sm font-bold text-green-900 dark:text-green-100 mt-0.5 uppercase">
                            {fuelRecord.from || '—'}
                          </p>
                        </div>
                        <div>
                          <p className="text-[10px] text-green-500 dark:text-green-400">To</p>
                          <p className="text-sm font-bold text-green-900 dark:text-green-100 mt-0.5 uppercase">
                            {fuelRecord.to || '—'}
                          </p>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="hidden md:flex bg-gray-50 dark:bg-gray-800/40 border border-dashed border-gray-200 dark:border-gray-700 rounded-xl items-center justify-center">
                      <p className="text-sm text-gray-400">No return journey</p>
                    </div>
                  )}
                </div>

                {/* Locked warning */}
                {(fuelRecord as any).isLocked && (
                  <div className="bg-amber-50 dark:bg-amber-900/20 border-l-4 border-amber-500 p-4 rounded-lg">
                    <div className="flex items-start gap-3">
                      <AlertCircle className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                      <div>
                        <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">
                          Record Locked — Missing Configuration
                        </p>
                        <p className="text-xs text-amber-700 dark:text-amber-400 mt-1">
                          {(fuelRecord as any).pendingConfigReason === 'both'
                            ? 'Missing: Route total liters AND truck batch assignment'
                            : (fuelRecord as any).pendingConfigReason === 'missing_total_liters'
                            ? 'Missing: Route total liters configuration'
                            : 'Missing: Truck batch assignment'}
                        </p>
                        <p className="text-xs text-amber-600 dark:text-amber-500 mt-1">
                          Contact admin to configure missing settings. Manual LPO entry is still allowed.
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* ── 02 ALL CHECKPOINTS — desktop: table, mobile: cards ── */}
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <SectionBadge n="02" />
                      <h3 className="font-semibold text-gray-900 dark:text-white">All checkpoints</h3>
                    </div>
                    <div className="hidden md:flex items-center gap-4 text-xs text-gray-500 dark:text-gray-400">
                      <span className="flex items-center gap-1.5">
                        <span className="w-3.5 h-3.5 rounded border-2 border-green-400 bg-green-50 dark:bg-green-900/30 inline-block" />
                        Has fuel
                      </span>
                      <span className="flex items-center gap-1.5">
                        <span className="w-3.5 h-3.5 rounded border-2 border-blue-400 bg-blue-50 dark:bg-blue-900/30 inline-block" />
                        Balance
                      </span>
                    </div>
                  </div>

                  {/* Desktop table */}
                  <div className="hidden md:block overflow-x-auto">
                    <table className="w-full border-separate border-spacing-x-0.5">
                      <thead>
                        <tr>
                          {CHECKPOINT_COLUMNS.map(col => (
                            <th
                              key={col.abbr}
                              title={col.label}
                              className={`pb-2 text-center text-[10px] font-bold uppercase tracking-wider whitespace-nowrap ${
                                col.field === 'balance'
                                  ? 'text-blue-600 dark:text-blue-400'
                                  : 'text-gray-400 dark:text-gray-500'
                              }`}
                            >
                              {col.abbr}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        <tr>
                          {CHECKPOINT_COLUMNS.map(col => {
                            const val = (fuelRecord as any)[col.field] || 0;
                            const isBalance = col.field === 'balance';
                            const isFrontier = !isBalance && val === 0 && col.field === frontierField;

                            let cellCls = '';
                            let display: React.ReactNode = '—';

                            if (isBalance) {
                              display = val.toLocaleString();
                              cellCls = val > 0
                                ? 'text-blue-700 dark:text-blue-300 font-black text-base'
                                : val < 0
                                  ? 'text-red-600 dark:text-red-400 font-black text-base'
                                  : 'text-gray-400';
                            } else if (val > 0) {
                              display = val;
                              cellCls = 'bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-300 border border-green-300 dark:border-green-700 rounded-lg font-semibold';
                            } else if (isFrontier) {
                              cellCls = 'bg-amber-50 dark:bg-amber-900/30 text-amber-500 dark:text-amber-400 border border-amber-300 dark:border-amber-600 rounded-lg';
                            } else {
                              cellCls = 'text-gray-300 dark:text-gray-600';
                            }

                            return (
                              <td key={col.abbr} className="py-1 text-center" title={col.label}>
                                <div className={`mx-auto w-11 py-1.5 text-sm text-center ${cellCls}`}>
                                  {display}
                                </div>
                              </td>
                            );
                          })}
                        </tr>
                      </tbody>
                    </table>
                  </div>

                  {/* Mobile cards */}
                  <div className="md:hidden grid grid-cols-3 gap-2">
                    {CHECKPOINT_COLUMNS.map(col => {
                      const val = (fuelRecord as any)[col.field] || 0;
                      const isBalance = col.field === 'balance';
                      const hasVal = val !== 0;

                      return (
                        <div
                          key={col.abbr}
                          className={`p-2 rounded-lg border text-center ${
                            isBalance
                              ? val > 0
                                ? 'border-blue-300 bg-blue-50 dark:bg-blue-900/30 dark:border-blue-700'
                                : val < 0
                                  ? 'border-red-300 bg-red-50 dark:bg-red-900/30 dark:border-red-700'
                                  : 'border-gray-200 bg-gray-50 dark:bg-gray-800 dark:border-gray-700'
                              : hasVal
                                ? 'border-green-300 bg-green-50 dark:bg-green-900/30 dark:border-green-700'
                                : 'border-gray-200 bg-gray-50 dark:bg-gray-800 dark:border-gray-700'
                          }`}
                        >
                          <p className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase">{col.abbr}</p>
                          <p className={`text-base font-bold mt-0.5 ${
                            isBalance
                              ? val > 0 ? 'text-blue-700 dark:text-blue-300' : val < 0 ? 'text-red-600 dark:text-red-400' : 'text-gray-400'
                              : hasVal ? 'text-green-700 dark:text-green-300' : 'text-gray-300 dark:text-gray-600'
                          }`}>
                            {hasVal ? val : '—'}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* ── 03 CONSUMPTION SUMMARY ── */}
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <SectionBadge n="03" />
                    <h3 className="font-semibold text-gray-900 dark:text-white">Consumption summary</h3>
                  </div>
                  <div className="grid grid-cols-3 gap-4">
                    <div className="bg-gray-50 dark:bg-gray-800/60 border border-gray-200 dark:border-gray-700 rounded-xl p-4 text-center">
                      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Used</p>
                      <p className="text-3xl font-black text-gray-900 dark:text-white mt-2">
                        {totalFuel.toLocaleString()}
                      </p>
                      <p className="text-xs text-gray-400 mt-1">litres</p>
                    </div>
                    <div className="bg-blue-50/70 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-4 text-center">
                      <p className="text-[10px] font-bold text-blue-400 uppercase tracking-widest">Allocated</p>
                      <p className="text-3xl font-black text-blue-600 dark:text-blue-400 mt-2">
                        {(fuelRecord.totalLts || 0).toLocaleString()}
                      </p>
                      <p className="text-xs text-blue-400 mt-1">litres</p>
                    </div>
                    <div className={`rounded-xl p-4 text-center border ${
                      balance > 0
                        ? 'bg-green-50/70 dark:bg-green-900/20 border-green-200 dark:border-green-800'
                        : balance < 0
                          ? 'bg-red-50/70 dark:bg-red-900/20 border-red-200 dark:border-red-800'
                          : 'bg-gray-50 dark:bg-gray-800/60 border-gray-200 dark:border-gray-700'
                    }`}>
                      <p className={`text-[10px] font-bold uppercase tracking-widest ${
                        balance > 0 ? 'text-green-400' : balance < 0 ? 'text-red-400' : 'text-gray-400'
                      }`}>Balance</p>
                      <p className={`text-3xl font-black mt-2 ${
                        balance > 0 ? 'text-green-600 dark:text-green-400' :
                        balance < 0 ? 'text-red-600 dark:text-red-400' :
                        'text-gray-500 dark:text-gray-400'
                      }`}>
                        {balance.toLocaleString()}
                      </p>
                      <p className={`text-xs mt-1 ${
                        balance > 0 ? 'text-green-400' : balance < 0 ? 'text-red-400' : 'text-gray-400'
                      }`}>litres</p>
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>

        {/* ── FOOTER ── */}
        <div className="px-6 py-3 border-t border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/50 flex justify-end shrink-0">
          <button
            onClick={handleClose}
            className="px-4 py-2 text-sm bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600 rounded-lg transition-colors"
          >
            Close
          </button>
        </div>
      </div>

      {/* Entry context popover */}
      {contextPopover && (
        <div
          className="fixed inset-0 z-[90] flex items-center justify-center p-4"
          onClick={() => setContextPopover(null)}
        >
          <div className="absolute inset-0 bg-black/40" />
          <div
            className="relative w-full max-w-sm rounded-xl bg-white dark:bg-gray-900 shadow-2xl border border-gray-200 dark:border-gray-700 overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-3 p-4 border-b border-gray-100 dark:border-gray-800">
              <MessageSquare className="w-5 h-5 text-indigo-500 flex-shrink-0 mt-0.5" />
              <div className="min-w-0 flex-1">
                <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100">Order context</h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 truncate">
                  LPO {contextPopover.lpoNo} · {contextPopover.station}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setContextPopover(null)}
                className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800"
              >
                <X className="w-4 h-4 text-gray-400" />
              </button>
            </div>
            <div className="p-4">
              <p className="text-sm text-gray-800 dark:text-gray-200 whitespace-pre-wrap">
                {contextPopover.context}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default FuelRecordInspectModal;
