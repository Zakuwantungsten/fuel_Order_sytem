import { useState, useEffect, useCallback } from 'react';
import {
  X,
  MapPin,
  Fuel,
  FileText,
  ArrowLeftRight,
  AlertTriangle,
  CheckCircle,
  Clock,
  Ban,
  ArrowRight,
  MessageSquare,
  ListOrdered,
} from 'lucide-react';
import { FuelRecordDetails, fuelRecordsAPI } from '../services/api';
import type { AdditionalYardDispensation, TruckQueueJourney } from '../services/api';
import { useRealtimeSync } from '../hooks/useRealtimeSync';
import RecordTimeline from './RecordTimeline';

interface FuelRecordDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  recordId: string | number | null;
}

type ActiveTab = 'lpos' | 'yard' | 'queue' | 'history';

type LpoContextNote = {
  lpoNo: string;
  station: string;
  doSdo: string;
  context: string;
};

const FUEL_LABELS: Record<string, string> = {
  tangaYard: 'Tanga Yard',
  darYard: 'Dar Yard',
  tangaGoing: 'Tanga Going',
  darGoing: 'Dar Going',
  moroGoing: 'Morogoro Going',
  mbeyaGoing: 'Mbeya Going',
  tdmGoing: 'TDM Going',
  zambiaGoing: 'Zambia Going',
  congoFuel: 'Congo',
  zambiaReturn: 'Zambia Ret.',
  tundumaReturn: 'Tunduma Ret.',
  mbeyaReturn: 'Mbeya Ret.',
  moroReturn: 'Morogoro Ret.',
  darReturn: 'Dar Ret.',
  tangaReturn: 'Tanga Ret.',
};

function fuelLabel(key: string): string {
  return FUEL_LABELS[key] ?? key.replace(/([A-Z])/g, ' $1').trim();
}

function lpoTypeStyle(type: string): string {
  switch (type) {
    case 'going': return 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400';
    case 'return': return 'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300';
    case 'cash': return 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400';
    case 'driver_account': return 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-400';
    default: return 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300';
  }
}

function lpoTypeLabel(type: string): string {
  switch (type) {
    case 'going': return 'GO';
    case 'return': return 'RET';
    case 'cash': return 'CASH';
    case 'driver_account': return 'DRV';
    default: return type;
  }
}

export default function FuelRecordDetailsModal({
  isOpen,
  onClose,
  recordId,
}: FuelRecordDetailsModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [details, setDetails] = useState<FuelRecordDetails | null>(null);
  const [activeTab, setActiveTab] = useState<ActiveTab>('lpos');
  const [contextNote, setContextNote] = useState<LpoContextNote | null>(null);

  useEffect(() => {
    if (isOpen && recordId) {
      setContextNote(null);
      fetchDetails();
    }
  }, [isOpen, recordId]);

  useEffect(() => {
    if (!isOpen || !contextNote) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        e.preventDefault();
        setContextNote(null);
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [isOpen, contextNote]);

  const fetchDetails = useCallback(async () => {
    if (!recordId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await fuelRecordsAPI.getDetails(recordId);
      setDetails(data);
    } catch (err: any) {
      console.error('Error fetching fuel record details:', err);
      setError(err.response?.data?.message || 'Failed to load fuel record details');
    } finally {
      setLoading(false);
    }
  }, [recordId]);

  useRealtimeSync('fuel_records', fetchDetails);

  if (!isOpen) return null;

  const record = details?.fuelRecord;
  const journeyInfo = details?.journeyInfo;
  const allocations = details?.fuelAllocations;

  const additionalRows: AdditionalYardDispensation[] =
    details?.additionalYardDispensations ??
    // Back-compat: older API only returned legacy yardDispenses
    (details?.yardDispenses || []).map((d) => ({
      id: d.id != null ? String(d.id) : undefined,
      kind: 'legacy_dispense' as const,
      date: d.date,
      lpoNo: null,
      yard: d.yard,
      doNo: d.linkedDONumber || '',
      truckNo: d.truckNo,
      billedLiters: null,
      dispenseLiters: d.liters ?? 0,
      diff: null,
      context: d.notes || null,
      enteredBy: d.enteredBy,
      status: d.status,
      source: 'legacy',
    }));

  const queueActive = details?.truckQueue?.active ?? null;
  const queueQueued: TruckQueueJourney[] = details?.truckQueue?.queued ?? [];
  const queueCount = queueQueued.length + (queueActive ? 1 : 0);

  const tabs = [
    { id: 'lpos' as const, label: 'LPO Entries', count: details?.lpoEntries.length, icon: FileText },
    { id: 'yard' as const, label: 'Additional Dispensation (Yard)', count: additionalRows.length, icon: MapPin },
    { id: 'queue' as const, label: 'Queued Journeys', count: queueCount || undefined, icon: ListOrdered },
    { id: 'history' as const, label: 'Audit History', icon: Clock },
  ];

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex min-h-screen items-center justify-center p-4">
        <div className="fixed inset-0 bg-black/50 transition-opacity" onClick={onClose} />

        <div className="relative w-full max-w-5xl bg-white dark:bg-slate-900 rounded-xl shadow-2xl max-h-[90vh] overflow-hidden flex flex-col">

          {/* Header */}
          <div className={`flex items-center justify-between px-5 py-3 border-b ${
            record?.isCancelled
              ? 'bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800'
              : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700'
          }`}>
            <div className="flex items-center gap-3 min-w-0">
              <div className={`p-1.5 rounded-lg shrink-0 ${record?.isCancelled ? 'bg-red-100 dark:bg-red-900/40' : 'bg-blue-50 dark:bg-blue-900/30'}`}>
                {record?.isCancelled
                  ? <Ban className="w-4 h-4 text-red-600 dark:text-red-400" />
                  : <Fuel className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                }
              </div>
              <div className="flex items-center gap-2 min-w-0 flex-wrap">
                <span className={`font-semibold text-sm ${record?.isCancelled ? 'text-red-800 dark:text-red-300' : 'text-slate-900 dark:text-slate-100'}`}>
                  {record?.truckNo ?? 'Fuel Record'}
                </span>
                {record && (
                  <span className="text-xs text-slate-400 dark:text-slate-500">
                    {record.goingDo}{record.returnDo ? ` / ${record.returnDo}` : ''}
                  </span>
                )}
                {record?.isCancelled && (
                  <span className="px-2 py-0.5 bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-300 text-xs font-semibold rounded-full tracking-wide">
                    CANCELLED
                  </span>
                )}
              </div>
            </div>
            <button
              onClick={onClose}
              className="ml-4 p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors shrink-0"
            >
              <X className="w-4 h-4 text-slate-500 dark:text-slate-400" />
            </button>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center py-16">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600" />
                <span className="ml-3 text-sm text-slate-500">Loading…</span>
              </div>
            ) : error ? (
              <div className="m-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-red-500 shrink-0" />
                <span className="text-sm text-red-700 dark:text-red-400">{error}</span>
              </div>
            ) : details ? (
              <>
                {/* Cancelled strip */}
                {record?.isCancelled && (
                  <div className="px-5 py-2 bg-red-50 dark:bg-red-950/30 border-b border-red-200 dark:border-red-800 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-red-700 dark:text-red-400">
                    <span className="font-semibold flex items-center gap-1">
                      <Ban className="w-3.5 h-3.5" /> Record Cancelled
                    </span>
                    {record.cancelledAt && (
                      <span>
                        {new Date(record.cancelledAt).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}
                      </span>
                    )}
                    {record.cancelledBy && <span>by {record.cancelledBy}</span>}
                    {record.cancellationReason && <span className="italic">"{record.cancellationReason}"</span>}
                  </div>
                )}

                {/* Stat strip */}
                <div className={`grid grid-cols-4 divide-x border-b dark:border-slate-700 dark:divide-slate-700 ${record?.isCancelled ? 'opacity-60' : ''}`}>
                  {[
                    { label: 'Total Fuel', value: `${allocations?.total?.toLocaleString() ?? 0} L` },
                    { label: 'Extra Fuel', value: `${allocations?.extra ?? 0} L` },
                    { label: 'LPOs', value: details.summary.totalLPOs },
                    { label: 'Balance', value: `${allocations?.balance?.toLocaleString() ?? 0} L` },
                  ].map(stat => (
                    <div key={stat.label} className="px-4 py-3 text-center">
                      <div className="text-xs text-slate-400 dark:text-slate-500 mb-0.5">{stat.label}</div>
                      <div className={`text-base font-semibold ${record?.isCancelled ? 'text-slate-400 line-through' : 'text-slate-800 dark:text-slate-100'}`}>
                        {stat.value}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Two-column zone */}
                <div className={`grid grid-cols-1 md:grid-cols-5 divide-y md:divide-y-0 md:divide-x border-b dark:border-slate-700 dark:divide-slate-700 ${record?.isCancelled ? 'opacity-60' : ''}`}>

                  {/* Left: Journey */}
                  <div className="md:col-span-2 p-4 space-y-3">
                    <div className="flex items-center gap-2">
                      <ArrowLeftRight className="w-3.5 h-3.5 text-slate-400" />
                      <span className="text-xs font-semibold uppercase tracking-widest text-slate-500 dark:text-slate-400">Journey</span>
                      {journeyInfo?.hasDestinationChanged && (
                        <span className="px-1.5 py-0.5 bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 text-xs rounded">
                          Dest. Changed
                        </span>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      {/* Going card */}
                      <div className="border border-slate-200 dark:border-slate-700 rounded-lg p-3 bg-slate-50 dark:bg-slate-800">
                        <div className="flex items-center gap-1.5 mb-2">
                          <span className="w-2 h-2 rounded-full bg-blue-500 shrink-0" />
                          <span className="text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wide">Going</span>
                          {!journeyInfo?.isOnReturnJourney && (
                            <span className="ml-auto flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400 font-medium">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                              Live
                            </span>
                          )}
                        </div>
                        <div className="space-y-1">
                          <div className="flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400 min-w-0">
                            <span className="truncate">{journeyInfo?.goingJourney.from}</span>
                            <ArrowRight className="w-3 h-3 shrink-0" />
                            <span className="truncate">{journeyInfo?.goingJourney.to}</span>
                          </div>
                          <div className="text-xs text-slate-500 dark:text-slate-400">
                            DO: <span className="font-medium text-slate-700 dark:text-slate-300">{journeyInfo?.goingJourney.doNumber}</span>
                          </div>
                          {journeyInfo?.goingJourney.deliveryOrder?.clientName && (
                            <div className="text-xs text-slate-500 dark:text-slate-400 truncate">
                              {journeyInfo.goingJourney.deliveryOrder.clientName}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Return card */}
                      {journeyInfo?.returnJourney ? (
                        <div className="border border-slate-200 dark:border-slate-700 rounded-lg p-3 bg-slate-50 dark:bg-slate-800">
                          <div className="flex items-center gap-1.5 mb-2">
                            <span className="w-2 h-2 rounded-full bg-slate-400 shrink-0" />
                            <span className="text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wide">Return</span>
                            <CheckCircle className="w-3 h-3 text-emerald-500 ml-auto" />
                          </div>
                          <div className="space-y-1">
                            <div className="flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400 min-w-0">
                              <span className="truncate">{journeyInfo.returnJourney.from}</span>
                              <ArrowRight className="w-3 h-3 shrink-0" />
                              <span className="truncate">{journeyInfo.returnJourney.to}</span>
                            </div>
                            <div className="text-xs text-slate-500 dark:text-slate-400">
                              DO: <span className="font-medium text-slate-700 dark:text-slate-300">{journeyInfo.returnJourney.doNumber}</span>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="border border-dashed border-slate-200 dark:border-slate-700 rounded-lg p-3 flex flex-col items-center justify-center gap-1 text-center">
                          <Clock className="w-4 h-4 text-slate-300 dark:text-slate-600" />
                          <span className="text-xs text-slate-400 dark:text-slate-500">Awaiting return DO</span>
                        </div>
                      )}
                    </div>

                    {journeyInfo?.goingJourney.deliveryOrder?.loadingPoint && (
                      <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                        <MapPin className="w-3.5 h-3.5 shrink-0" />
                        <span>
                          Loading: <span className="font-medium text-slate-700 dark:text-slate-300">{journeyInfo.goingJourney.deliveryOrder.loadingPoint}</span>
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Right: Fuel Allocation */}
                  <div className="md:col-span-3 p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <Fuel className="w-3.5 h-3.5 text-slate-400" />
                      <span className="text-xs font-semibold uppercase tracking-widest text-slate-500 dark:text-slate-400">Fuel Allocation</span>
                    </div>

                    <div className="grid grid-cols-2 gap-x-6">
                      {/* Going fuel */}
                      <div>
                        <div className="flex items-center justify-between mb-2 pb-1.5 border-b border-slate-100 dark:border-slate-700">
                          <span className="text-xs font-semibold text-blue-600 dark:text-blue-400 uppercase tracking-wide">Going</span>
                          <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                            {allocations?.totalGoingFuel?.toLocaleString() ?? 0} L
                          </span>
                        </div>
                        <div className="space-y-1">
                          {Object.entries(allocations?.going ?? {}).map(([key, value]) =>
                            value ? (
                              <div key={key} className="flex items-center justify-between py-0.5 text-xs">
                                <span className="text-slate-500 dark:text-slate-400">{fuelLabel(key)}</span>
                                <span className="font-medium text-blue-700 dark:text-blue-300">{Math.abs(value).toLocaleString()} L</span>
                              </div>
                            ) : null
                          )}
                          {!Object.values(allocations?.going ?? {}).some(Boolean) && (
                            <div className="text-xs text-slate-400 italic py-1">No allocations</div>
                          )}
                        </div>
                      </div>

                      {/* Return fuel */}
                      <div>
                        <div className="flex items-center justify-between mb-2 pb-1.5 border-b border-slate-100 dark:border-slate-700">
                          <span className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wide">Return</span>
                          <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                            {allocations?.totalReturnFuel?.toLocaleString() ?? 0} L
                          </span>
                        </div>
                        <div className="space-y-1">
                          {Object.entries(allocations?.return ?? {}).map(([key, value]) =>
                            value ? (
                              <div key={key} className="flex items-center justify-between py-0.5 text-xs">
                                <span className="text-slate-500 dark:text-slate-400">{fuelLabel(key)}</span>
                                <span className="font-medium text-slate-700 dark:text-slate-300">{Math.abs(value).toLocaleString()} L</span>
                              </div>
                            ) : null
                          )}
                          {!Object.values(allocations?.return ?? {}).some(Boolean) && (
                            <div className="text-xs text-slate-400 italic py-1">No allocations</div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Tabs */}
                <div>
                  {/* Tab bar */}
                  <div className="flex items-center border-b border-slate-200 dark:border-slate-700 px-4 bg-slate-50 dark:bg-slate-900/50">
                    {tabs.map(tab => (
                      <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        title={
                          tab.id === 'yard'
                            ? 'Additional Dispensation (Yard) — billed vs dispense diffs & context'
                            : tab.id === 'queue'
                            ? 'Same-truck active & queued journeys (Q1, Q2, …)'
                            : tab.label
                        }
                        className={`flex items-center gap-1.5 px-3 py-2.5 text-xs font-medium border-b-2 transition-colors whitespace-nowrap ${
                          activeTab === tab.id
                            ? 'border-blue-600 text-blue-600 dark:text-blue-400 dark:border-blue-400'
                            : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
                        }`}
                      >
                        <tab.icon className="w-3.5 h-3.5" />
                        {tab.label}
                        {'count' in tab && tab.count !== undefined && (
                          <span className={`px-1.5 py-0.5 rounded-full text-xs leading-none ${
                            activeTab === tab.id
                              ? 'bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-400'
                              : 'bg-slate-200 text-slate-500 dark:bg-slate-700 dark:text-slate-400'
                          }`}>
                            {tab.count}
                          </span>
                        )}
                      </button>
                    ))}
                    {activeTab === 'lpos' && (
                      <div className="ml-auto flex items-center gap-1.5 py-2">
                        {details.summary.cashLPOs && details.summary.cashLPOs > 0 ? (
                          <span className="px-2 py-0.5 rounded-full text-xs bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400">
                            {details.summary.cashLPOs} Cash
                          </span>
                        ) : null}
                        {details.summary.driverAccountLPOs && details.summary.driverAccountLPOs > 0 ? (
                          <span className="px-2 py-0.5 rounded-full text-xs bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400">
                            {details.summary.driverAccountLPOs} Driver Acc.
                          </span>
                        ) : null}
                        {details.summary.tangaLPOs && details.summary.tangaLPOs > 0 ? (
                          <span className="px-2 py-0.5 rounded-full text-xs bg-teal-100 dark:bg-teal-900/30 text-teal-700 dark:text-teal-400">
                            {details.summary.tangaLPOs} Tanga
                          </span>
                        ) : null}
                        {details.summary.darLPOs && details.summary.darLPOs > 0 ? (
                          <span className="px-2 py-0.5 rounded-full text-xs bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-400">
                            {details.summary.darLPOs} Dar
                          </span>
                        ) : null}
                      </div>
                    )}
                  </div>

                  {/* Tab content */}
                  <div className="p-4 min-h-[120px]">

                    {activeTab === 'lpos' && (
                      details.lpoEntries.length === 0 ? (
                        <div className="flex items-center justify-center py-8 text-sm text-slate-400">No LPO entries found</div>
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="border-b border-slate-200 dark:border-slate-700">
                                <th className="pb-2 text-left font-semibold text-slate-500 dark:text-slate-400 pr-3 whitespace-nowrap">LPO No.</th>
                                <th className="pb-2 text-left font-semibold text-slate-500 dark:text-slate-400 pr-3 whitespace-nowrap">Date</th>
                                <th className="pb-2 text-left font-semibold text-slate-500 dark:text-slate-400 pr-3 whitespace-nowrap">Station</th>
                                <th className="pb-2 text-left font-semibold text-slate-500 dark:text-slate-400 pr-3 whitespace-nowrap">DO</th>
                                <th className="pb-2 text-right font-semibold text-slate-500 dark:text-slate-400 pr-3 whitespace-nowrap">Liters</th>
                                <th className="pb-2 text-right font-semibold text-slate-500 dark:text-slate-400 pr-3 whitespace-nowrap">Rate</th>
                                <th className="pb-2 text-center font-semibold text-slate-500 dark:text-slate-400 pr-3 whitespace-nowrap">Chkp</th>
                                <th className="pb-2 text-center font-semibold text-slate-500 dark:text-slate-400 whitespace-nowrap">Type</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                              {details.lpoEntries.map((lpo, idx) => (
                                <tr
                                  key={lpo.id || idx}
                                  className={`hover:bg-slate-50 dark:hover:bg-slate-800/50 ${lpo.isCancelled ? 'bg-red-50/60 dark:bg-red-900/20' : lpo.isDriverAccount ? 'bg-red-50/40 dark:bg-red-900/10' : ''}`}
                                >
                                  <td className="py-2 pr-3 font-medium whitespace-nowrap">
                                    <div className="flex items-center gap-1.5 flex-wrap">
                                      <span className={lpo.isCancelled ? 'line-through text-red-400 dark:text-red-500' : 'text-slate-900 dark:text-slate-100'}>{lpo.lpoNo}</span>
                                      {lpo.context?.trim() ? (
                                        <button
                                          type="button"
                                          title={lpo.context}
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            setContextNote({
                                              lpoNo: lpo.lpoNo,
                                              station: lpo.dieselAt,
                                              doSdo: lpo.doSdo,
                                              context: lpo.context!,
                                            });
                                          }}
                                          className="relative inline-flex items-center p-0.5 rounded text-indigo-600 dark:text-indigo-300 hover:bg-indigo-50 dark:hover:bg-indigo-900/30"
                                          aria-label="View order context"
                                        >
                                          <MessageSquare className="w-3.5 h-3.5" />
                                          <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-red-500 ring-2 ring-white dark:ring-slate-900" />
                                        </button>
                                      ) : null}
                                      {lpo.source === 'tanga' && <span className="px-1 py-0.5 text-[10px] font-bold bg-teal-100 dark:bg-teal-900/50 text-teal-700 dark:text-teal-300 rounded">TNG</span>}
                                      {lpo.source === 'dar' && <span className="px-1 py-0.5 text-[10px] font-bold bg-violet-100 dark:bg-violet-900/50 text-violet-700 dark:text-violet-300 rounded">DAR</span>}
                                      {lpo.hasDispenseAs && (
                                        <button
                                          type="button"
                                          title={`Dispense as ${lpo.dispenseLiters?.toLocaleString() ?? '—'}L (billed ${lpo.billedLiters?.toLocaleString() ?? '—'}L, diff ${lpo.dispenseDiff != null && lpo.dispenseDiff > 0 ? '+' : ''}${lpo.dispenseDiff ?? 0}). Open Additional Dispensation (Yard) for context.`}
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            setActiveTab('yard');
                                          }}
                                          className="px-1 py-0.5 text-[10px] font-bold bg-amber-100 dark:bg-amber-900/50 text-amber-800 dark:text-amber-300 rounded hover:bg-amber-200 dark:hover:bg-amber-900/70 transition-colors"
                                        >
                                          Dispense as
                                        </button>
                                      )}
                                      {lpo.isCancelled && <span className="px-1 py-0.5 text-[10px] font-bold bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-300 rounded">CANCELLED</span>}
                                      {!lpo.isCancelled && lpo.originalLtrs != null && lpo.originalLtrs !== lpo.ltrs && <span className="px-1 py-0.5 text-[10px] font-bold bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300 rounded">AMENDED</span>}
                                    </div>
                                  </td>
                                  <td className="py-2 pr-3 text-slate-600 dark:text-slate-400 whitespace-nowrap">{lpo.date}</td>
                                  <td className="py-2 pr-3 text-slate-600 dark:text-slate-400 whitespace-nowrap">{lpo.dieselAt}</td>
                                  <td className="py-2 pr-3 text-slate-600 dark:text-slate-400 whitespace-nowrap">
                                    {lpo.isDriverAccount ? (
                                      <span className="text-red-600 dark:text-red-400 italic">
                                        NIL{lpo.originalDoNo ? ` (${lpo.originalDoNo})` : ''}
                                      </span>
                                    ) : !lpo.doSdo || lpo.doSdo === 'NIL' || lpo.doSdo === 'nil' ? (
                                      <span className="text-amber-600 dark:text-amber-400 italic">NIL (Cash)</span>
                                    ) : lpo.doSdo}
                                  </td>
                                  <td className="py-2 pr-3 text-right whitespace-nowrap">
                                    <span className="inline-flex items-center justify-end gap-1.5">
                                      {lpo.originalLtrs != null && lpo.originalLtrs !== lpo.ltrs && (
                                        <span className="font-normal text-slate-400 dark:text-slate-500 line-through">{lpo.originalLtrs.toLocaleString()}</span>
                                      )}
                                      <span className={`font-medium ${lpo.isCancelled ? 'text-red-400 dark:text-red-500 line-through' : 'text-slate-900 dark:text-slate-100'}`}>
                                        {lpo.ltrs?.toLocaleString() ?? 0}
                                      </span>
                                    </span>
                                  </td>
                                  <td className="py-2 pr-3 text-right text-slate-600 dark:text-slate-400 whitespace-nowrap">
                                    {lpo.pricePerLtr?.toLocaleString() ?? 0}
                                  </td>
                                  <td className="py-2 pr-3 text-center whitespace-nowrap">
                                    {lpo.checkpoint ? (
                                      <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300">
                                        {lpo.checkpoint}
                                      </span>
                                    ) : (
                                      <span className="text-slate-300 dark:text-slate-600">—</span>
                                    )}
                                  </td>
                                  <td className="py-2 text-center whitespace-nowrap">
                                    <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${lpoTypeStyle(lpo.journeyType)}`}>
                                      {lpoTypeLabel(lpo.journeyType)}
                                    </span>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )
                    )}

                    {activeTab === 'yard' && (
                      additionalRows.length === 0 ? (
                        <div className="flex items-center justify-center py-8 text-sm text-slate-400">
                          No additional yard dispensation found
                        </div>
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="border-b border-slate-200 dark:border-slate-700">
                                <th className="pb-2 text-left font-semibold text-slate-500 dark:text-slate-400 pr-3 whitespace-nowrap">LPO Date</th>
                                <th className="pb-2 text-left font-semibold text-slate-500 dark:text-slate-400 pr-3 whitespace-nowrap">LPO / Yard</th>
                                <th className="pb-2 text-right font-semibold text-slate-500 dark:text-slate-400 pr-3 whitespace-nowrap" title="Billed liters">Billed</th>
                                <th className="pb-2 text-right font-semibold text-slate-500 dark:text-slate-400 pr-3 whitespace-nowrap" title="Liters written to fuel record">Disp</th>
                                <th className="pb-2 text-right font-semibold text-slate-500 dark:text-slate-400 pr-3 whitespace-nowrap" title="Billed − dispensed">Diff</th>
                                <th className="pb-2 text-left font-semibold text-slate-500 dark:text-slate-400 whitespace-nowrap">Context</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                              {additionalRows.map((row, idx) => {
                                const diff = row.diff ?? null;
                                const isLegacy = row.kind === 'legacy_dispense';
                                return (
                                  <tr key={row.id || idx} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 align-top">
                                    <td className="py-2 pr-3 text-slate-600 dark:text-slate-400 whitespace-nowrap">
                                      {row.date}
                                    </td>
                                    <td className="py-2 pr-3 whitespace-nowrap">
                                      <div className="font-medium text-slate-900 dark:text-slate-100">
                                        {row.lpoNo || (isLegacy ? 'Freeform' : '—')}
                                      </div>
                                      <div className="text-[10px] text-slate-500 dark:text-slate-400">
                                        {row.yard}
                                        {row.doNo ? ` · ${row.doNo}` : ''}
                                        {isLegacy && row.status ? ` · ${row.status}` : ''}
                                      </div>
                                    </td>
                                    <td className="py-2 pr-3 text-right tabular-nums text-slate-700 dark:text-slate-300 whitespace-nowrap">
                                      {row.billedLiters != null ? row.billedLiters.toLocaleString() : '—'}
                                    </td>
                                    <td className="py-2 pr-3 text-right tabular-nums font-medium text-slate-900 dark:text-slate-100 whitespace-nowrap">
                                      {row.dispenseLiters != null ? row.dispenseLiters.toLocaleString() : '—'}
                                    </td>
                                    <td className="py-2 pr-3 text-right tabular-nums font-semibold whitespace-nowrap">
                                      {diff == null || Math.abs(diff) < 0.001 ? (
                                        <span className="text-slate-300 dark:text-slate-600 font-normal">—</span>
                                      ) : (
                                        <span className={diff > 0
                                          ? 'text-amber-700 dark:text-amber-400'
                                          : 'text-red-600 dark:text-red-400'
                                        }>
                                          {diff > 0 ? '+' : ''}{diff.toLocaleString()}
                                        </span>
                                      )}
                                    </td>
                                    <td className="py-2 text-slate-600 dark:text-slate-300 max-w-[220px]">
                                      {row.context ? (
                                        <span className="inline-flex items-start gap-1">
                                          <MessageSquare className="w-3 h-3 mt-0.5 shrink-0 text-amber-600 dark:text-amber-400" />
                                          <span className="leading-snug">{row.context}</span>
                                        </span>
                                      ) : isLegacy && row.enteredBy ? (
                                        <span className="text-slate-400">by {row.enteredBy}</span>
                                      ) : (
                                        <span className="text-slate-300 dark:text-slate-600">—</span>
                                      )}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      )
                    )}

                    {activeTab === 'queue' && (
                      !queueActive && queueQueued.length === 0 ? (
                        <div className="flex items-center justify-center py-8 text-sm text-slate-400">
                          No active or queued journeys for this truck
                        </div>
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="border-b border-slate-200 dark:border-slate-700">
                                <th className="pb-2 text-left font-semibold text-slate-500 dark:text-slate-400 pr-3 whitespace-nowrap">Status</th>
                                <th className="pb-2 text-left font-semibold text-slate-500 dark:text-slate-400 pr-3 whitespace-nowrap">Truck</th>
                                <th className="pb-2 text-left font-semibold text-slate-500 dark:text-slate-400 pr-3 whitespace-nowrap">DO</th>
                                <th className="pb-2 text-left font-semibold text-slate-500 dark:text-slate-400 pr-3 whitespace-nowrap">From</th>
                                <th className="pb-2 text-left font-semibold text-slate-500 dark:text-slate-400 pr-3 whitespace-nowrap">To</th>
                                <th className="pb-2 text-left font-semibold text-slate-500 dark:text-slate-400 pr-3 whitespace-nowrap">Start</th>
                                <th className="pb-2 text-left font-semibold text-slate-500 dark:text-slate-400 whitespace-nowrap">Date</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                              {queueActive && (
                                <tr
                                  key={queueActive.id}
                                  className={`hover:bg-slate-50 dark:hover:bg-slate-800/50 ${
                                    queueActive.isCurrent ? 'bg-blue-50/60 dark:bg-blue-900/20' : ''
                                  }`}
                                >
                                  <td className="py-2 pr-3 whitespace-nowrap">
                                    <div className="flex items-center gap-1.5 flex-wrap">
                                      <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
                                        Active
                                      </span>
                                      {queueActive.isCurrent && (
                                        <span className="px-1 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
                                          This record
                                        </span>
                                      )}
                                    </div>
                                  </td>
                                  <td className="py-2 pr-3 font-medium text-slate-900 dark:text-slate-100 whitespace-nowrap">{queueActive.truckNo}</td>
                                  <td className="py-2 pr-3 text-slate-700 dark:text-slate-300 whitespace-nowrap">
                                    {queueActive.goingDo || '—'}
                                    {queueActive.returnDo ? (
                                      <span className="text-slate-400"> / {queueActive.returnDo}</span>
                                    ) : null}
                                  </td>
                                  <td className="py-2 pr-3 text-slate-600 dark:text-slate-400 whitespace-nowrap">{queueActive.from || '—'}</td>
                                  <td className="py-2 pr-3 text-slate-600 dark:text-slate-400 whitespace-nowrap">{queueActive.to || '—'}</td>
                                  <td className="py-2 pr-3 text-slate-600 dark:text-slate-400 whitespace-nowrap">{queueActive.start || '—'}</td>
                                  <td className="py-2 text-slate-600 dark:text-slate-400 whitespace-nowrap">{queueActive.date || '—'}</td>
                                </tr>
                              )}
                              {queueQueued.map((q) => (
                                <tr
                                  key={q.id}
                                  className={`hover:bg-slate-50 dark:hover:bg-slate-800/50 ${
                                    q.isCurrent ? 'bg-blue-50/60 dark:bg-blue-900/20' : ''
                                  }`}
                                >
                                  <td className="py-2 pr-3 whitespace-nowrap">
                                    <div className="flex items-center gap-1.5 flex-wrap">
                                      <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                                        Queued{q.queueOrder != null ? ` Q${q.queueOrder}` : ''}
                                      </span>
                                      {q.isCurrent && (
                                        <span className="px-1 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
                                          This record
                                        </span>
                                      )}
                                      {q.isPendingGoing && (
                                        <span className="px-1 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300">
                                          Pending DO
                                        </span>
                                      )}
                                    </div>
                                  </td>
                                  <td className="py-2 pr-3 font-medium text-slate-900 dark:text-slate-100 whitespace-nowrap">{q.truckNo}</td>
                                  <td className="py-2 pr-3 text-slate-700 dark:text-slate-300 whitespace-nowrap">
                                    {q.goingDo || '—'}
                                    {q.returnDo ? (
                                      <span className="text-slate-400"> / {q.returnDo}</span>
                                    ) : null}
                                  </td>
                                  <td className="py-2 pr-3 text-slate-600 dark:text-slate-400 whitespace-nowrap">{q.from || '—'}</td>
                                  <td className="py-2 pr-3 text-slate-600 dark:text-slate-400 whitespace-nowrap">{q.to || '—'}</td>
                                  <td className="py-2 pr-3 text-slate-600 dark:text-slate-400 whitespace-nowrap">{q.start || '—'}</td>
                                  <td className="py-2 text-slate-600 dark:text-slate-400 whitespace-nowrap">{q.date || '—'}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                          {queueQueued.length === 0 && queueActive && (
                            <div className="pt-3 text-[11px] text-slate-400">
                              No journeys queued behind the active trip for this truck.
                            </div>
                          )}
                        </div>
                      )
                    )}

                    {activeTab === 'history' && (
                      <RecordTimeline
                        fetchHistory={() => fuelRecordsAPI.getHistory(recordId!)}
                        isOpen={activeTab === 'history'}
                      />
                    )}
                  </div>
                </div>
              </>
            ) : null}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end px-5 py-3 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50">
            <button
              onClick={onClose}
              className="px-4 py-1.5 text-sm bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-lg hover:bg-slate-300 dark:hover:bg-slate-600 transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      </div>

      {/* Order context popover */}
      {contextNote && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center p-4"
          onClick={() => setContextNote(null)}
        >
          <div className="absolute inset-0 bg-black/40" />
          <div
            className="relative w-full max-w-sm rounded-xl bg-white dark:bg-slate-900 shadow-2xl border border-slate-200 dark:border-slate-700 overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-3 p-4 border-b border-slate-100 dark:border-slate-800">
              <div className="relative shrink-0 mt-0.5">
                <MessageSquare className="w-5 h-5 text-indigo-500" />
                <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-red-500 ring-2 ring-white dark:ring-slate-900" />
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">Order context</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                  LPO {contextNote.lpoNo} · {contextNote.station} · DO {contextNote.doSdo}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setContextNote(null)}
                className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="w-4 h-4 text-slate-400" />
              </button>
            </div>
            <div className="p-4">
              <p className="text-sm text-slate-800 dark:text-slate-200 whitespace-pre-wrap">
                {contextNote.context}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
