import { useState, useEffect } from 'react';
import {
  X,
  MapPin,
  Fuel,
  FileText,
  ArrowLeftRight,
  AlertTriangle,
  CheckCircle,
  Clock,
  ChevronDown,
  ChevronUp,
  Ban,
} from 'lucide-react';
import { FuelRecordDetails, fuelRecordsAPI } from '../services/api';

interface FuelRecordDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  recordId: string | number | null;
}

export default function FuelRecordDetailsModal({
  isOpen,
  onClose,
  recordId,
}: FuelRecordDetailsModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [details, setDetails] = useState<FuelRecordDetails | null>(null);
  const [expandedSections, setExpandedSections] = useState({
    journey: true,
    goingFuel: true,
    returnFuel: true,
    lpos: true,
    yardDispenses: false,
  });

  useEffect(() => {
    if (isOpen && recordId) {
      fetchDetails();
    }
  }, [isOpen, recordId]);

  const fetchDetails = async () => {
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
  };

  const toggleSection = (section: keyof typeof expandedSections) => {
    setExpandedSections(prev => ({
      ...prev,
      [section]: !prev[section],
    }));
  };

  if (!isOpen) return null;

  const record = details?.fuelRecord;
  const journeyInfo = details?.journeyInfo;
  const allocations = details?.fuelAllocations;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex min-h-screen items-center justify-center p-4">
        {/* Overlay */}
        <div
          className="fixed inset-0 bg-black/50 transition-opacity"
          onClick={onClose}
        />

        {/* Modal */}
        <div className="relative w-full max-w-4xl bg-white dark:bg-gray-800 rounded-lg shadow-xl max-h-[90vh] overflow-hidden flex flex-col transition-colors">
          {/* Header */}
          <div className={`flex items-center justify-between p-4 border-b dark:border-gray-700 ${record?.isCancelled ? 'bg-red-50 dark:bg-red-900/20' : 'bg-gray-50 dark:bg-gray-800/50'}`}>
            <div className="flex items-center space-x-3">
              <div className={`p-2 rounded-lg ${record?.isCancelled ? 'bg-red-100 dark:bg-red-900/30' : 'bg-primary-100 dark:bg-primary-900/30'}`}>
                {record?.isCancelled ? (
                  <Ban className="w-6 h-6 text-red-600 dark:text-red-400" />
                ) : (
                  <Fuel className="w-6 h-6 text-primary-600 dark:text-primary-400" />
                )}
              </div>
              <div>
                <div className="flex items-center space-x-2">
                  <h2 className={`text-lg font-semibold ${record?.isCancelled ? 'text-red-800 dark:text-red-300' : 'text-gray-900 dark:text-gray-100'}`}>
                    Fuel Record Details
                  </h2>
                  {record?.isCancelled && (
                    <span className="px-2 py-0.5 bg-red-200 dark:bg-red-800 text-red-800 dark:text-red-200 text-xs font-medium rounded-full">
                      CANCELLED
                    </span>
                  )}
                </div>
                {record && (
                  <p className={`text-sm ${record?.isCancelled ? 'text-red-600 dark:text-red-400 line-through' : 'text-gray-500 dark:text-gray-400'}`}>
                    <span className="font-medium">{record.truckNo}</span> • {record.goingDo}
                    {record.returnDo && ` / ${record.returnDo}`}
                  </p>
                )}
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors"
            >
              <X className="w-5 h-5 text-gray-500 dark:text-gray-400" />
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
                <span className="ml-3 text-gray-500">Loading details...</span>
              </div>
            ) : error ? (
              <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
                <div className="flex items-center">
                  <AlertTriangle className="w-5 h-5 text-red-500 mr-2" />
                  <span className="text-red-700">{error}</span>
                </div>
              </div>
            ) : details ? (
              <>
                {/* Cancelled Banner */}
                {record?.isCancelled && (
                  <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-lg p-6 text-center">
                    <div className="flex flex-col items-center space-y-3">
                      <div className="p-3 bg-red-100 dark:bg-red-900/50 rounded-full">
                        <Ban className="w-8 h-8 text-red-600 dark:text-red-400" />
                      </div>
                      <h3 className="text-lg font-semibold text-red-800 dark:text-red-300">
                        This Fuel Record Has Been Cancelled
                      </h3>
                      <div className="text-sm text-red-600 dark:text-red-400 space-y-1">
                        {record.cancelledAt && (
                          <p>
                            Cancelled on: {new Date(record.cancelledAt).toLocaleDateString('en-US', {
                              weekday: 'long',
                              year: 'numeric',
                              month: 'long',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit'
                            })}
                          </p>
                        )}
                        {record.cancellationReason && (
                          <p className="italic">Reason: {record.cancellationReason}</p>
                        )}
                        {record.cancelledBy && (
                          <p>Cancelled by: {record.cancelledBy}</p>
                        )}
                      </div>
                      <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">
                        The fuel allocation data below is preserved for historical reference only.
                      </p>
                    </div>
                  </div>
                )}

                {/* Summary Cards */}
                <div className={`grid grid-cols-2 md:grid-cols-4 gap-4 ${record?.isCancelled ? 'opacity-60' : ''}`}>
                  <div className={`p-4 rounded-lg ${record?.isCancelled ? 'bg-gray-100 dark:bg-gray-700' : 'bg-blue-50 dark:bg-blue-900/30'}`}>
                    <div className={`text-sm font-medium ${record?.isCancelled ? 'text-gray-500 dark:text-gray-400' : 'text-blue-600 dark:text-blue-400'}`}>Total Fuel</div>
                    <div className={`text-2xl font-bold ${record?.isCancelled ? 'text-gray-600 dark:text-gray-300 line-through' : 'text-blue-700 dark:text-blue-300'}`}>
                      {allocations?.total.toLocaleString()} L
                    </div>
                  </div>
                  <div className={`p-4 rounded-lg ${record?.isCancelled ? 'bg-gray-100 dark:bg-gray-700' : 'bg-green-50 dark:bg-green-900/30'}`}>
                    <div className={`text-sm font-medium ${record?.isCancelled ? 'text-gray-500 dark:text-gray-400' : 'text-green-600 dark:text-green-400'}`}>Extra Fuel</div>
                    <div className={`text-2xl font-bold ${record?.isCancelled ? 'text-gray-600 dark:text-gray-300 line-through' : 'text-green-700 dark:text-green-300'}`}>
                      {allocations?.extra || 0} L
                    </div>
                  </div>
                  <div className={`p-4 rounded-lg ${record?.isCancelled ? 'bg-gray-100 dark:bg-gray-700' : 'bg-orange-50 dark:bg-orange-900/30'}`}>
                    <div className={`text-sm font-medium ${record?.isCancelled ? 'text-gray-500 dark:text-gray-400' : 'text-orange-600 dark:text-orange-400'}`}>Total LPOs</div>
                    <div className={`text-2xl font-bold ${record?.isCancelled ? 'text-gray-600 dark:text-gray-300 line-through' : 'text-orange-700 dark:text-orange-300'}`}>
                      {details.summary.totalLPOs}
                    </div>
                  </div>
                  <div className={`p-4 rounded-lg ${record?.isCancelled ? 'bg-gray-100 dark:bg-gray-700' : 'bg-purple-50 dark:bg-purple-900/30'}`}>
                    <div className={`text-sm font-medium ${record?.isCancelled ? 'text-gray-500 dark:text-gray-400' : 'text-purple-600 dark:text-purple-400'}`}>Balance</div>
                    <div className={`text-2xl font-bold ${record?.isCancelled ? 'text-gray-600 dark:text-gray-300 line-through' : 'text-purple-700 dark:text-purple-300'}`}>
                      {allocations?.balance.toLocaleString()} L
                    </div>
                  </div>
                </div>

                {/* Journey Information Section */}
                <div className="border dark:border-gray-700 rounded-lg overflow-hidden">
                  <button
                    onClick={() => toggleSection('journey')}
                    className="w-full flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-700 hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors"
                  >
                    <div className="flex items-center">
                      <ArrowLeftRight className="w-5 h-5 text-gray-500 dark:text-gray-400 mr-2" />
                      <span className="font-medium text-gray-900 dark:text-gray-100">Journey Information</span>
                      {journeyInfo?.hasDestinationChanged && (
                        <span className="ml-2 px-2 py-0.5 bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400 text-xs rounded-full">
                          Destination Changed
                        </span>
                      )}
                    </div>
                    {expandedSections.journey ? (
                      <ChevronUp className="w-5 h-5 text-gray-400" />
                    ) : (
                      <ChevronDown className="w-5 h-5 text-gray-400" />
                    )}
                  </button>
                  
                  {expandedSections.journey && (
                    <div className="p-4 space-y-4">
                      {/* Going Journey */}
                      <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg">
                        <div className="flex items-center mb-2">
                          <div className="w-3 h-3 bg-blue-500 rounded-full mr-2" />
                          <span className="font-medium text-blue-800 dark:text-blue-300">Going Journey (IMPORT)</span>
                          {!journeyInfo?.isOnReturnJourney && (
                            <span className="ml-2 px-2 py-0.5 bg-blue-200 dark:bg-blue-800 text-blue-800 dark:text-blue-200 text-xs rounded-full">
                              <Clock className="w-3 h-3 inline mr-1" />
                              In Progress
                            </span>
                          )}
                        </div>
                        <div className="grid grid-cols-2 gap-4 mt-2">
                          <div>
                            <div className="text-xs text-blue-600 dark:text-blue-400">From</div>
                            <div className="font-medium text-blue-900 dark:text-blue-200">{journeyInfo?.goingJourney.from}</div>
                          </div>
                          <div>
                            <div className="text-xs text-blue-600 dark:text-blue-400">To (Destination)</div>
                            <div className="font-medium text-blue-900 dark:text-blue-200">{journeyInfo?.goingJourney.to}</div>
                          </div>
                          <div>
                            <div className="text-xs text-blue-600 dark:text-blue-400">DO Number</div>
                            <div className="font-medium text-blue-900 dark:text-blue-200">{journeyInfo?.goingJourney.doNumber}</div>
                          </div>
                          <div>
                            <div className="text-xs text-blue-600 dark:text-blue-400">Start Location</div>
                            <div className="font-medium text-blue-900 dark:text-blue-200">{journeyInfo?.goingJourney.start}</div>
                          </div>
                        </div>
                        {journeyInfo?.goingJourney.deliveryOrder && (
                          <div className="mt-3 pt-3 border-t border-blue-200 dark:border-blue-700">
                            <div className="text-xs text-blue-600 dark:text-blue-400 mb-1">Delivery Order Details</div>
                            <div className="grid grid-cols-2 gap-2 text-sm">
                              <div className="text-blue-900 dark:text-blue-200">Client: <span className="font-medium">{journeyInfo.goingJourney.deliveryOrder.clientName}</span></div>
                              <div className="text-blue-900 dark:text-blue-200">Loading: <span className="font-medium">{journeyInfo.goingJourney.deliveryOrder.loadingPoint}</span></div>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Return Journey (if exists) */}
                      {journeyInfo?.returnJourney ? (
                        <div className="bg-green-50 dark:bg-green-900/20 p-4 rounded-lg">
                          <div className="flex items-center mb-2">
                            <div className="w-3 h-3 bg-green-500 rounded-full mr-2" />
                            <span className="font-medium text-green-800 dark:text-green-300">Return Journey (EXPORT)</span>
                            <span className="ml-2 px-2 py-0.5 bg-green-200 dark:bg-green-800 text-green-800 dark:text-green-200 text-xs rounded-full">
                              <CheckCircle className="w-3 h-3 inline mr-1" />
                              Assigned
                            </span>
                          </div>
                          <div className="grid grid-cols-2 gap-4 mt-2">
                            <div>
                              <div className="text-xs text-green-600 dark:text-green-400">From</div>
                              <div className="font-medium text-green-900 dark:text-green-200">{journeyInfo.returnJourney.from}</div>
                            </div>
                            <div>
                              <div className="text-xs text-green-600 dark:text-green-400">To</div>
                              <div className="font-medium text-green-900 dark:text-green-200">{journeyInfo.returnJourney.to}</div>
                            </div>
                            <div>
                              <div className="text-xs text-green-600 dark:text-green-400">DO Number</div>
                              <div className="font-medium text-green-900 dark:text-green-200">{journeyInfo.returnJourney.doNumber}</div>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="bg-gray-50 dark:bg-gray-700 p-4 rounded-lg border-2 border-dashed border-gray-300 dark:border-gray-600">
                          <div className="flex items-center text-gray-500 dark:text-gray-400">
                            <Clock className="w-5 h-5 mr-2" />
                            <span>Return journey not yet assigned (awaiting EXPORT DO)</span>
                          </div>
                        </div>
                      )}

                      {/* Original Going Destination Warning */}
                      {journeyInfo?.hasDestinationChanged && (
                        <div className="bg-yellow-50 dark:bg-yellow-900/20 p-4 rounded-lg border border-yellow-200 dark:border-yellow-800">
                          <div className="flex items-start">
                            <AlertTriangle className="w-5 h-5 text-yellow-600 dark:text-yellow-400 mr-2 mt-0.5" />
                            <div>
                              <div className="font-medium text-yellow-800 dark:text-yellow-300">Original Going Destination Preserved</div>
                              <p className="text-sm text-yellow-700 dark:text-yellow-400 mt-1">
                                The EXPORT DO has changed the from/to fields, but the original going journey
                                destination (<strong>{journeyInfo.goingJourney.to}</strong>) is preserved for accurate
                                fuel allocation calculations during the going journey.
                              </p>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Going Fuel Allocations */}
                <div className="border dark:border-gray-700 rounded-lg overflow-hidden">
                  <button
                    onClick={() => toggleSection('goingFuel')}
                    className="w-full flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-700 hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors"
                  >
                    <div className="flex items-center">
                      <Fuel className="w-5 h-5 text-blue-500 dark:text-blue-400 mr-2" />
                      <span className="font-medium text-gray-900 dark:text-gray-100">Going Journey Fuel</span>
                      <span className="ml-2 text-sm text-gray-500 dark:text-gray-400">
                        ({allocations?.totalGoingFuel.toLocaleString()} L total)
                      </span>
                    </div>
                    {expandedSections.goingFuel ? (
                      <ChevronUp className="w-5 h-5 text-gray-400" />
                    ) : (
                      <ChevronDown className="w-5 h-5 text-gray-400" />
                    )}
                  </button>
                  
                  {expandedSections.goingFuel && (
                    <div className="p-4 dark:bg-gray-800">
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        {Object.entries(allocations?.going || {}).map(([key, value]) => (
                          <div
                            key={key}
                            className={`p-3 rounded-lg ${value ? 'bg-blue-50 dark:bg-blue-900/30' : 'bg-gray-50 dark:bg-gray-700'}`}
                          >
                            <div className="text-xs text-gray-500 dark:text-gray-400 capitalize">
                              {key.replace(/([A-Z])/g, ' $1').trim()}
                            </div>
                            <div className={`text-lg font-semibold ${value ? 'text-blue-700 dark:text-blue-300' : 'text-gray-400 dark:text-gray-500'}`}>
                              {value ? `${Math.abs(value).toLocaleString()} L` : '-'}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Return Fuel Allocations */}
                <div className="border dark:border-gray-700 rounded-lg overflow-hidden">
                  <button
                    onClick={() => toggleSection('returnFuel')}
                    className="w-full flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-700 hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors"
                  >
                    <div className="flex items-center">
                      <Fuel className="w-5 h-5 text-green-500 dark:text-green-400 mr-2" />
                      <span className="font-medium text-gray-900 dark:text-gray-100">Return Journey Fuel</span>
                      <span className="ml-2 text-sm text-gray-500 dark:text-gray-400">
                        ({allocations?.totalReturnFuel.toLocaleString()} L total)
                      </span>
                    </div>
                    {expandedSections.returnFuel ? (
                      <ChevronUp className="w-5 h-5 text-gray-400" />
                    ) : (
                      <ChevronDown className="w-5 h-5 text-gray-400" />
                    )}
                  </button>
                  
                  {expandedSections.returnFuel && (
                    <div className="p-4 dark:bg-gray-800">
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                        {Object.entries(allocations?.return || {}).map(([key, value]) => (
                          <div
                            key={key}
                            className={`p-3 rounded-lg ${value ? 'bg-green-50 dark:bg-green-900/30' : 'bg-gray-50 dark:bg-gray-700'}`}
                          >
                            <div className="text-xs text-gray-500 dark:text-gray-400 capitalize">
                              {key.replace(/([A-Z])/g, ' $1').trim()}
                            </div>
                            <div className={`text-lg font-semibold ${value ? 'text-green-700 dark:text-green-300' : 'text-gray-400 dark:text-gray-500'}`}>
                              {value ? `${Math.abs(value).toLocaleString()} L` : '-'}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* LPO Entries */}
                <div className="border dark:border-gray-700 rounded-lg overflow-hidden">
                  <button
                    onClick={() => toggleSection('lpos')}
                    className="w-full flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-700 hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors"
                  >
                    <div className="flex items-center flex-wrap gap-2">
                      <FileText className="w-5 h-5 text-orange-500 dark:text-orange-400 mr-2" />
                      <span className="font-medium text-gray-900 dark:text-gray-100">LPO Entries</span>
                      <span className="text-sm text-gray-500 dark:text-gray-400">
                        ({details.lpoEntries.length} entries • {details.summary.totalFuelOrdered.toLocaleString()} L)
                      </span>
                      {/* Show breakdown by type */}
                      {details.summary.cashLPOs && details.summary.cashLPOs > 0 && (
                        <span className="px-2 py-0.5 rounded-full text-xs bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400">
                          {details.summary.cashLPOs} Cash
                        </span>
                      )}
                      {details.summary.driverAccountLPOs && details.summary.driverAccountLPOs > 0 && (
                        <span className="px-2 py-0.5 rounded-full text-xs bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400">
                          {details.summary.driverAccountLPOs} Driver Acc.
                        </span>
                      )}
                    </div>
                    {expandedSections.lpos ? (
                      <ChevronUp className="w-5 h-5 text-gray-400" />
                    ) : (
                      <ChevronDown className="w-5 h-5 text-gray-400" />
                    )}
                  </button>
                  
                  {expandedSections.lpos && (
                    <div className="p-4 dark:bg-gray-800">
                      {details.lpoEntries.length === 0 ? (
                        <div className="text-center py-4 text-gray-500 dark:text-gray-400">
                          No LPO entries found for this fuel record
                        </div>
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead className="bg-gray-100 dark:bg-gray-700">
                              <tr>
                                <th className="px-3 py-2 text-left text-gray-500 dark:text-gray-200">LPO No.</th>
                                <th className="px-3 py-2 text-left text-gray-500 dark:text-gray-200">Date</th>
                                <th className="px-3 py-2 text-left text-gray-500 dark:text-gray-200">Station</th>
                                <th className="px-3 py-2 text-left text-gray-500 dark:text-gray-200">DO</th>
                                <th className="px-3 py-2 text-right text-gray-500 dark:text-gray-200">Liters</th>
                                <th className="px-3 py-2 text-right text-gray-500 dark:text-gray-200">Rate</th>
                                <th className="px-3 py-2 text-center text-gray-500 dark:text-gray-200">Type</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                              {details.lpoEntries.map((lpo, idx) => (
                                <tr key={lpo.id || idx} className={`hover:bg-gray-50 dark:hover:bg-gray-700/50 ${lpo.isDriverAccount ? 'bg-red-50/50 dark:bg-red-900/10' : ''}`}>
                                  <td className="px-3 py-2 font-medium text-gray-900 dark:text-gray-100">{lpo.lpoNo}</td>
                                  <td className="px-3 py-2 text-gray-700 dark:text-gray-300">{lpo.date}</td>
                                  <td className="px-3 py-2 text-gray-700 dark:text-gray-300">{lpo.dieselAt}</td>
                                  <td className="px-3 py-2 text-gray-700 dark:text-gray-300">
                                    {lpo.isDriverAccount ? (
                                      <div className="flex flex-col">
                                        <span className="text-red-600 dark:text-red-400 italic">NIL</span>
                                        {lpo.originalDoNo && (
                                          <span className="text-xs text-gray-400 dark:text-gray-500">
                                            (ref: {lpo.originalDoNo})
                                          </span>
                                        )}
                                      </div>
                                    ) : lpo.doSdo === 'NIL' || lpo.doSdo === 'nil' || !lpo.doSdo ? (
                                      <span className="text-amber-600 dark:text-amber-400 italic">NIL (Cash)</span>
                                    ) : lpo.doSdo}
                                  </td>
                                  <td className="px-3 py-2 text-right font-medium text-gray-900 dark:text-gray-100">
                                    <div className="flex flex-col items-end">
                                      <span>{lpo.ltrs.toLocaleString()}</span>
                                      {/* Show amendment info if liters were changed */}
                                      {lpo.originalLtrs !== undefined && lpo.originalLtrs !== null && lpo.originalLtrs !== lpo.ltrs && (
                                        <span className="text-xs text-amber-600 dark:text-amber-400">
                                          (was {lpo.originalLtrs.toLocaleString()})
                                        </span>
                                      )}
                                    </div>
                                  </td>
                                  <td className="px-3 py-2 text-right text-gray-700 dark:text-gray-300">{lpo.pricePerLtr.toLocaleString()}</td>
                                  <td className="px-3 py-2 text-center">
                                    <span className={`px-2 py-0.5 rounded-full text-xs ${
                                      lpo.journeyType === 'going' 
                                        ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                                        : lpo.journeyType === 'return'
                                        ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                                        : lpo.journeyType === 'cash'
                                        ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                                        : lpo.journeyType === 'driver_account'
                                        ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                                        : 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300'
                                    }`}>
                                      {lpo.journeyType === 'cash' ? 'CASH' 
                                        : lpo.journeyType === 'driver_account' ? 'DRIVER ACC.'
                                        : lpo.journeyType}
                                    </span>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Yard Dispenses */}
                <div className="border dark:border-gray-700 rounded-lg overflow-hidden">
                  <button
                    onClick={() => toggleSection('yardDispenses')}
                    className="w-full flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-700 hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors"
                  >
                    <div className="flex items-center">
                      <MapPin className="w-5 h-5 text-purple-500 dark:text-purple-400 mr-2" />
                      <span className="font-medium text-gray-900 dark:text-gray-100">Yard Fuel Dispenses</span>
                      <span className="ml-2 text-sm text-gray-500 dark:text-gray-400">
                        ({details.yardDispenses.length} entries • {details.summary.totalYardFuel.toLocaleString()} L)
                      </span>
                    </div>
                    {expandedSections.yardDispenses ? (
                      <ChevronUp className="w-5 h-5 text-gray-400" />
                    ) : (
                      <ChevronDown className="w-5 h-5 text-gray-400" />
                    )}
                  </button>
                  
                  {expandedSections.yardDispenses && (
                    <div className="p-4">
                      {details.yardDispenses.length === 0 ? (
                        <div className="text-center py-4 text-gray-500 dark:text-gray-400">
                          No yard fuel dispenses found for this fuel record
                        </div>
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead className="bg-gray-100 dark:bg-gray-700">
                              <tr>
                                <th className="px-3 py-2 text-left text-gray-500 dark:text-gray-200">Date</th>
                                <th className="px-3 py-2 text-left text-gray-500 dark:text-gray-200">Yard</th>
                                <th className="px-3 py-2 text-right text-gray-500 dark:text-gray-200">Liters</th>
                                <th className="px-3 py-2 text-left text-gray-500 dark:text-gray-200">Entered By</th>
                                <th className="px-3 py-2 text-left text-gray-500 dark:text-gray-200">Status</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                              {details.yardDispenses.map((dispense, idx) => (
                                <tr key={dispense.id || idx} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                                  <td className="px-3 py-2 text-gray-700 dark:text-gray-300">{dispense.date}</td>
                                  <td className="px-3 py-2 text-gray-700 dark:text-gray-300">{dispense.yard}</td>
                                  <td className="px-3 py-2 text-right font-medium text-gray-900 dark:text-gray-100">{dispense.liters.toLocaleString()}</td>
                                  <td className="px-3 py-2 text-gray-700 dark:text-gray-300">{dispense.enteredBy}</td>
                                  <td className="px-3 py-2">
                                    <span className={`px-2 py-0.5 rounded-full text-xs ${
                                      dispense.status === 'linked' 
                                        ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                                        : dispense.status === 'pending'
                                        ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400'
                                        : 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300'
                                    }`}>
                                      {dispense.status}
                                    </span>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </>
            ) : null}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end p-4 border-t dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
            <button
              onClick={onClose}
              className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
