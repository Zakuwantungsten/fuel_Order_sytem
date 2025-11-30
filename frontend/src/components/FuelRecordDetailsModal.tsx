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
        <div className="relative w-full max-w-4xl bg-white rounded-lg shadow-xl max-h-[90vh] overflow-hidden flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b bg-gray-50">
            <div className="flex items-center space-x-3">
              <div className="p-2 bg-primary-100 rounded-lg">
                <Fuel className="w-6 h-6 text-primary-600" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-gray-900">
                  Fuel Record Details
                </h2>
                {record && (
                  <p className="text-sm text-gray-500">
                    <span className="font-medium">{record.truckNo}</span> • {record.goingDo}
                    {record.returnDo && ` / ${record.returnDo}`}
                  </p>
                )}
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-100 rounded-full transition-colors"
            >
              <X className="w-5 h-5 text-gray-500" />
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
                {/* Summary Cards */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="bg-blue-50 p-4 rounded-lg">
                    <div className="text-sm text-blue-600 font-medium">Total Fuel</div>
                    <div className="text-2xl font-bold text-blue-700">
                      {allocations?.total.toLocaleString()} L
                    </div>
                  </div>
                  <div className="bg-green-50 p-4 rounded-lg">
                    <div className="text-sm text-green-600 font-medium">Extra Fuel</div>
                    <div className="text-2xl font-bold text-green-700">
                      {allocations?.extra || 0} L
                    </div>
                  </div>
                  <div className="bg-orange-50 p-4 rounded-lg">
                    <div className="text-sm text-orange-600 font-medium">Total LPOs</div>
                    <div className="text-2xl font-bold text-orange-700">
                      {details.summary.totalLPOs}
                    </div>
                  </div>
                  <div className="bg-purple-50 p-4 rounded-lg">
                    <div className="text-sm text-purple-600 font-medium">Balance</div>
                    <div className="text-2xl font-bold text-purple-700">
                      {allocations?.balance.toLocaleString()} L
                    </div>
                  </div>
                </div>

                {/* Journey Information Section */}
                <div className="border rounded-lg overflow-hidden">
                  <button
                    onClick={() => toggleSection('journey')}
                    className="w-full flex items-center justify-between p-4 bg-gray-50 hover:bg-gray-100 transition-colors"
                  >
                    <div className="flex items-center">
                      <ArrowLeftRight className="w-5 h-5 text-gray-500 mr-2" />
                      <span className="font-medium text-gray-900">Journey Information</span>
                      {journeyInfo?.hasDestinationChanged && (
                        <span className="ml-2 px-2 py-0.5 bg-yellow-100 text-yellow-700 text-xs rounded-full">
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
                      <div className="bg-blue-50 p-4 rounded-lg">
                        <div className="flex items-center mb-2">
                          <div className="w-3 h-3 bg-blue-500 rounded-full mr-2" />
                          <span className="font-medium text-blue-800">Going Journey (IMPORT)</span>
                          {!journeyInfo?.isOnReturnJourney && (
                            <span className="ml-2 px-2 py-0.5 bg-blue-200 text-blue-800 text-xs rounded-full">
                              <Clock className="w-3 h-3 inline mr-1" />
                              In Progress
                            </span>
                          )}
                        </div>
                        <div className="grid grid-cols-2 gap-4 mt-2">
                          <div>
                            <div className="text-xs text-blue-600">From</div>
                            <div className="font-medium text-blue-900">{journeyInfo?.goingJourney.from}</div>
                          </div>
                          <div>
                            <div className="text-xs text-blue-600">To (Destination)</div>
                            <div className="font-medium text-blue-900">{journeyInfo?.goingJourney.to}</div>
                          </div>
                          <div>
                            <div className="text-xs text-blue-600">DO Number</div>
                            <div className="font-medium text-blue-900">{journeyInfo?.goingJourney.doNumber}</div>
                          </div>
                          <div>
                            <div className="text-xs text-blue-600">Start Location</div>
                            <div className="font-medium text-blue-900">{journeyInfo?.goingJourney.start}</div>
                          </div>
                        </div>
                        {journeyInfo?.goingJourney.deliveryOrder && (
                          <div className="mt-3 pt-3 border-t border-blue-200">
                            <div className="text-xs text-blue-600 mb-1">Delivery Order Details</div>
                            <div className="grid grid-cols-2 gap-2 text-sm">
                              <div>Client: <span className="font-medium">{journeyInfo.goingJourney.deliveryOrder.clientName}</span></div>
                              <div>Loading: <span className="font-medium">{journeyInfo.goingJourney.deliveryOrder.loadingPoint}</span></div>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Return Journey (if exists) */}
                      {journeyInfo?.returnJourney ? (
                        <div className="bg-green-50 p-4 rounded-lg">
                          <div className="flex items-center mb-2">
                            <div className="w-3 h-3 bg-green-500 rounded-full mr-2" />
                            <span className="font-medium text-green-800">Return Journey (EXPORT)</span>
                            <span className="ml-2 px-2 py-0.5 bg-green-200 text-green-800 text-xs rounded-full">
                              <CheckCircle className="w-3 h-3 inline mr-1" />
                              Assigned
                            </span>
                          </div>
                          <div className="grid grid-cols-2 gap-4 mt-2">
                            <div>
                              <div className="text-xs text-green-600">From</div>
                              <div className="font-medium text-green-900">{journeyInfo.returnJourney.from}</div>
                            </div>
                            <div>
                              <div className="text-xs text-green-600">To</div>
                              <div className="font-medium text-green-900">{journeyInfo.returnJourney.to}</div>
                            </div>
                            <div>
                              <div className="text-xs text-green-600">DO Number</div>
                              <div className="font-medium text-green-900">{journeyInfo.returnJourney.doNumber}</div>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="bg-gray-50 p-4 rounded-lg border-2 border-dashed border-gray-300">
                          <div className="flex items-center text-gray-500">
                            <Clock className="w-5 h-5 mr-2" />
                            <span>Return journey not yet assigned (awaiting EXPORT DO)</span>
                          </div>
                        </div>
                      )}

                      {/* Original Going Destination Warning */}
                      {journeyInfo?.hasDestinationChanged && (
                        <div className="bg-yellow-50 p-4 rounded-lg border border-yellow-200">
                          <div className="flex items-start">
                            <AlertTriangle className="w-5 h-5 text-yellow-600 mr-2 mt-0.5" />
                            <div>
                              <div className="font-medium text-yellow-800">Original Going Destination Preserved</div>
                              <p className="text-sm text-yellow-700 mt-1">
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
                <div className="border rounded-lg overflow-hidden">
                  <button
                    onClick={() => toggleSection('goingFuel')}
                    className="w-full flex items-center justify-between p-4 bg-gray-50 hover:bg-gray-100 transition-colors"
                  >
                    <div className="flex items-center">
                      <Fuel className="w-5 h-5 text-blue-500 mr-2" />
                      <span className="font-medium text-gray-900">Going Journey Fuel</span>
                      <span className="ml-2 text-sm text-gray-500">
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
                    <div className="p-4">
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        {Object.entries(allocations?.going || {}).map(([key, value]) => (
                          <div
                            key={key}
                            className={`p-3 rounded-lg ${value ? 'bg-blue-50' : 'bg-gray-50'}`}
                          >
                            <div className="text-xs text-gray-500 capitalize">
                              {key.replace(/([A-Z])/g, ' $1').trim()}
                            </div>
                            <div className={`text-lg font-semibold ${value ? 'text-blue-700' : 'text-gray-400'}`}>
                              {value ? `${Math.abs(value).toLocaleString()} L` : '-'}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Return Fuel Allocations */}
                <div className="border rounded-lg overflow-hidden">
                  <button
                    onClick={() => toggleSection('returnFuel')}
                    className="w-full flex items-center justify-between p-4 bg-gray-50 hover:bg-gray-100 transition-colors"
                  >
                    <div className="flex items-center">
                      <Fuel className="w-5 h-5 text-green-500 mr-2" />
                      <span className="font-medium text-gray-900">Return Journey Fuel</span>
                      <span className="ml-2 text-sm text-gray-500">
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
                    <div className="p-4">
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                        {Object.entries(allocations?.return || {}).map(([key, value]) => (
                          <div
                            key={key}
                            className={`p-3 rounded-lg ${value ? 'bg-green-50' : 'bg-gray-50'}`}
                          >
                            <div className="text-xs text-gray-500 capitalize">
                              {key.replace(/([A-Z])/g, ' $1').trim()}
                            </div>
                            <div className={`text-lg font-semibold ${value ? 'text-green-700' : 'text-gray-400'}`}>
                              {value ? `${Math.abs(value).toLocaleString()} L` : '-'}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* LPO Entries */}
                <div className="border rounded-lg overflow-hidden">
                  <button
                    onClick={() => toggleSection('lpos')}
                    className="w-full flex items-center justify-between p-4 bg-gray-50 hover:bg-gray-100 transition-colors"
                  >
                    <div className="flex items-center">
                      <FileText className="w-5 h-5 text-orange-500 mr-2" />
                      <span className="font-medium text-gray-900">LPO Entries</span>
                      <span className="ml-2 text-sm text-gray-500">
                        ({details.lpoEntries.length} entries • {details.summary.totalFuelOrdered.toLocaleString()} L)
                      </span>
                    </div>
                    {expandedSections.lpos ? (
                      <ChevronUp className="w-5 h-5 text-gray-400" />
                    ) : (
                      <ChevronDown className="w-5 h-5 text-gray-400" />
                    )}
                  </button>
                  
                  {expandedSections.lpos && (
                    <div className="p-4">
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
                                <tr key={lpo.id || idx} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                                  <td className="px-3 py-2 font-medium text-gray-900 dark:text-gray-100">{lpo.lpoNo}</td>
                                  <td className="px-3 py-2 text-gray-700 dark:text-gray-300">{lpo.date}</td>
                                  <td className="px-3 py-2 text-gray-700 dark:text-gray-300">{lpo.dieselAt}</td>
                                  <td className="px-3 py-2 text-gray-700 dark:text-gray-300">{lpo.doSdo}</td>
                                  <td className="px-3 py-2 text-right font-medium text-gray-900 dark:text-gray-100">{lpo.ltrs.toLocaleString()}</td>
                                  <td className="px-3 py-2 text-right text-gray-700 dark:text-gray-300">{lpo.pricePerLtr.toLocaleString()}</td>
                                  <td className="px-3 py-2 text-center">
                                    <span className={`px-2 py-0.5 rounded-full text-xs ${
                                      lpo.journeyType === 'going' 
                                        ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                                        : lpo.journeyType === 'return'
                                        ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                                        : 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300'
                                    }`}>
                                      {lpo.journeyType}
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
          <div className="flex items-center justify-end p-4 border-t bg-gray-50">
            <button
              onClick={onClose}
              className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
