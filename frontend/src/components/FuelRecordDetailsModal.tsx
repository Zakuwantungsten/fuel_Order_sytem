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
} from 'lucide-react';
import { FuelRecordDetails, fuelRecordsAPI } from '../services/api';
import { useRealtimeSync } from '../hooks/useRealtimeSync';
import RecordTimeline from './RecordTimeline';

interface FuelRecordDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  recordId: string | number | null;
}

type ActiveTab = 'lpos' | 'yard' | 'history';

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

  useEffect(() => {
    if (isOpen && recordId) {
      fetchDetails();
    }
  }, [isOpen, recordId]);

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

  const tabs = [
    { id: 'lpos' as const, label: 'LPO Entries', count: details?.lpoEntries.length, icon: FileText },
    { id: 'yard' as const, label: 'Yard Dispenses', count: details?.yardDispenses.length, icon: MapPin },
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

                    {journeyInfo?.hasDestinationChanged && (
                      <div className="flex items-start gap-2 p-2.5 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
                        <AlertTriangle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                        <p className="text-xs text-amber-700 dark:text-amber-400">
                          Original destination <strong>{journeyInfo.goingJourney.to}</strong> preserved for fuel calculations.
                        </p>
                      </div>
                    )}

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
                        className={`flex items-center gap-1.5 px-3 py-2.5 text-xs font-medium border-b-2 transition-colors ${
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
                      details.yardDispenses.length === 0 ? (
                        <div className="flex items-center justify-center py-8 text-sm text-slate-400">No yard dispenses found</div>
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="border-b border-slate-200 dark:border-slate-700">
                                <th className="pb-2 text-left font-semibold text-slate-500 dark:text-slate-400 pr-3 whitespace-nowrap">Date</th>
                                <th className="pb-2 text-left font-semibold text-slate-500 dark:text-slate-400 pr-3 whitespace-nowrap">Yard</th>
                                <th className="pb-2 text-right font-semibold text-slate-500 dark:text-slate-400 pr-3 whitespace-nowrap">Liters</th>
                                <th className="pb-2 text-left font-semibold text-slate-500 dark:text-slate-400 pr-3 whitespace-nowrap">Entered By</th>
                                <th className="pb-2 text-left font-semibold text-slate-500 dark:text-slate-400 whitespace-nowrap">Status</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                              {details.yardDispenses.map((d, idx) => (
                                <tr key={d.id || idx} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                                  <td className="py-2 pr-3 text-slate-600 dark:text-slate-400 whitespace-nowrap">{d.date}</td>
                                  <td className="py-2 pr-3 text-slate-600 dark:text-slate-400 whitespace-nowrap">{d.yard}</td>
                                  <td className="py-2 pr-3 text-right font-medium text-slate-900 dark:text-slate-100 whitespace-nowrap">
                                    {d.liters?.toLocaleString() ?? 0}
                                  </td>
                                  <td className="py-2 pr-3 text-slate-600 dark:text-slate-400 whitespace-nowrap">{d.enteredBy}</td>
                                  <td className="py-2 whitespace-nowrap">
                                    <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${
                                      d.status === 'linked'
                                        ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                                        : d.status === 'pending'
                                        ? 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                                        : 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300'
                                    }`}>
                                      {d.status}
                                    </span>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
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
    </div>
  );
}
