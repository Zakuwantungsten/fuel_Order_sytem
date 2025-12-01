import { useState, useEffect } from 'react';
import { Search, Save, CheckCircle, Fuel, Truck, Calendar, User, Link2, AlertCircle } from 'lucide-react';
import { YardFuelDispense } from '../types';
import yardFuelService from '../services/yardFuelService';
import { formatTruckNumber } from '../utils/dataCleanup';

interface YardFuelEntryProps {
  user: any;
}

export function YardFuelEntry({ user }: YardFuelEntryProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedYard, setSelectedYard] = useState<YardFuelDispense['yard']>('DAR YARD');
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [entries, setEntries] = useState<YardFuelDispense[]>([]);
  const [truckSearchTerm, setTruckSearchTerm] = useState('');
  const [truckInfo, setTruckInfo] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState<any>({ totalEntries: 0, totalLiters: 0, averageLiters: 0 });
  
  const [newEntry, setNewEntry] = useState({
    truckNo: '',
    liters: 0,
    notes: '',
  });

  const yards: YardFuelDispense['yard'][] = ['DAR YARD', 'TANGA YARD', 'MMSA YARD'];

  // Load entries when yard or date changes
  useEffect(() => {
    loadEntries();
  }, [selectedYard, selectedDate]);

  const loadEntries = async () => {
    try {
      setLoading(true);
      const dispenses = await yardFuelService.getDispensesByYardAndDate(selectedYard, selectedDate);
      // Ensure dispenses is always an array
      setEntries(Array.isArray(dispenses) ? dispenses : []);
      const yardStats = await yardFuelService.getYardStats(selectedYard, selectedDate);
      setStats(yardStats || { totalEntries: 0, totalLiters: 0, averageLiters: 0 });
    } catch (error) {
      console.error('Error loading entries:', error);
      setEntries([]);
      setStats({ totalEntries: 0, totalLiters: 0, averageLiters: 0 });
    } finally {
      setLoading(false);
    }
  };

  // Search for truck information
  const handleTruckSearch = async () => {
    if (!truckSearchTerm.trim()) return;
    
    setLoading(true);
    try {
      const info = await yardFuelService.searchTruckInfo(truckSearchTerm.trim());
      setTruckInfo(info);
      setNewEntry({ 
        ...newEntry, 
        truckNo: info.truckNo 
      });
    } catch (error) {
      console.error('Error searching truck:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!newEntry.truckNo || newEntry.liters <= 0) {
      alert('Please fill in all required fields');
      return;
    }

    setLoading(true);
    try {
      // Record the fuel dispense
      const dispense = await yardFuelService.dispenseYardFuel({
        date: selectedDate,
        truckNo: newEntry.truckNo,
        liters: newEntry.liters,
        yard: selectedYard,
        enteredBy: `${user.firstName} ${user.lastName}`,
        notes: newEntry.notes || undefined,
      });

      // Show feedback
      if (dispense.autoLinked && dispense.linkedDONumber) {
        alert(`✓ Fuel recorded and automatically linked to DO #${dispense.linkedDONumber}`);
      } else {
        alert(`✓ Fuel recorded. No active DO found - entry will be linked when DO is created.`);
      }

      // Reset form
      setNewEntry({ truckNo: '', liters: 0, notes: '' });
      setTruckSearchTerm('');
      setTruckInfo(null);
      await loadEntries();
    } catch (error) {
      console.error('Error dispensing fuel:', error);
      alert('Failed to record fuel dispense. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const filteredEntries = entries.filter(
    (entry) =>
      entry.truckNo.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (entry.linkedDONumber && entry.linkedDONumber.includes(searchTerm))
  );

  return (
    <div>
      <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-6">Yard Fuel Dispensing</h1>

      {loading && (
        <div className="mb-4 bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800 rounded-lg p-4 text-blue-800 dark:text-blue-300">
          Loading...
        </div>
      )}

      {/* Info Banner */}
      <div className="bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800 rounded-lg p-4 mb-6">
        <div className="flex items-start">
          <AlertCircle className="w-5 h-5 text-blue-600 dark:text-blue-400 mr-3 mt-0.5" />
          <div className="text-sm text-blue-800 dark:text-blue-300">
            <p className="font-semibold mb-1">How it works:</p>
            <ul className="list-disc list-inside space-y-1">
              <li>Search for the truck number to see if it has an active delivery order</li>
              <li>Enter the fuel amount you are dispensing</li>
              <li>The system will automatically link to the truck's fuel record</li>
              <li>You don't need to enter DO numbers - the system handles that</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow transition-colors">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm text-gray-600 dark:text-gray-400">Entries Today</div>
              <div className="text-2xl font-bold text-gray-900 dark:text-gray-100 mt-1">{stats.totalEntries}</div>
            </div>
            <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
              <Truck className="w-6 h-6 text-blue-600" />
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow transition-colors">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm text-gray-600 dark:text-gray-400">Total Liters</div>
              <div className="text-2xl font-bold text-gray-900 dark:text-gray-100 mt-1">{stats.totalLiters}L</div>
            </div>
            <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
              <Fuel className="w-6 h-6 text-green-600" />
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow transition-colors">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm text-gray-600 dark:text-gray-400">Auto-Linked</div>
              <div className="text-2xl font-bold text-gray-900 dark:text-gray-100 mt-1">{stats.linkedEntries}</div>
            </div>
            <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
              <Link2 className="w-6 h-6 text-green-600" />
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow transition-colors">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm text-gray-600 dark:text-gray-400">Average/Truck</div>
              <div className="text-2xl font-bold text-gray-900 dark:text-gray-100 mt-1">{stats.averageLiters}L</div>
            </div>
            <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center">
              <CheckCircle className="w-6 h-6 text-purple-600" />
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Entry Form */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 transition-colors">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-4 flex items-center">
            <Save className="w-5 h-5 mr-2" />
            Record Fuel Dispensing
          </h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Yard</label>
                <select
                  value={selectedYard}
                  onChange={(e) => setSelectedYard(e.target.value as YardFuelDispense['yard'])}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                >
                  {yards.map((yard) => (
                    <option key={yard} value={yard}>
                      {yard}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Date</label>
                <input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                />
              </div>
            </div>

            {/* Truck Search */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Search Truck Number
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={truckSearchTerm}
                  onChange={(e) => setTruckSearchTerm(formatTruckNumber(e.target.value))}
                  onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), handleTruckSearch())}
                  className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                  placeholder="e.g., T699 DXY"
                />
                <button
                  type="button"
                  onClick={handleTruckSearch}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                  <Search className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Truck Info Display */}
            {truckInfo && (
              <div className={`p-4 rounded-lg border-2 ${
                truckInfo.hasActiveRecord 
                  ? 'bg-green-50 dark:bg-green-900/20 border-green-300 dark:border-green-700' 
                  : 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-300 dark:border-yellow-700'
              }`}>
                <div className="flex items-start justify-between">
                  <div>
                    <div className="font-semibold text-gray-900 dark:text-gray-100">{truckInfo.truckNo}</div>
                    {truckInfo.hasActiveRecord ? (
                      <>
                        <div className="text-sm text-gray-700 dark:text-gray-300 mt-1">
                          DO: <span className="font-medium">{truckInfo.doNumber}</span>
                        </div>
                        <div className="text-sm text-gray-700 dark:text-gray-300">
                          Destination: <span className="font-medium">{truckInfo.destination}</span>
                        </div>
                        <div className="text-xs text-green-600 dark:text-green-400 mt-2 flex items-center">
                          <Link2 className="w-3 h-3 mr-1" />
                          Will auto-link to fuel record
                        </div>
                      </>
                    ) : (
                      <div className="text-sm text-yellow-700 dark:text-yellow-300 mt-1">
                        No active DO found. Entry will be saved and linked when DO is created.
                      </div>
                    )}
                  </div>
                  {truckInfo.hasActiveRecord && (
                    <CheckCircle className="w-6 h-6 text-green-600 dark:text-green-400" />
                  )}
                </div>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Truck Number <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                required
                value={newEntry.truckNo}
                onChange={(e) => setNewEntry({ ...newEntry, truckNo: formatTruckNumber(e.target.value) })}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                placeholder="e.g., T699 DXY"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Fuel Amount (Liters) <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                required
                min="1"
                value={newEntry.liters || ''}
                onChange={(e) => setNewEntry({ ...newEntry, liters: parseInt(e.target.value) || 0 })}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                placeholder="Enter fuel amount"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Notes (Optional)</label>
              <textarea
                value={newEntry.notes}
                onChange={(e) => setNewEntry({ ...newEntry, notes: e.target.value })}
                rows={2}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                placeholder="Add any additional notes..."
              />
            </div>

            <button
              type="submit"
              className="w-full bg-indigo-600 text-white py-3 px-4 rounded-lg hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 transition-colors flex items-center justify-center font-medium"
            >
              <Save className="w-4 h-4 mr-2" />
              Record Fuel Dispensing
            </button>
          </form>
        </div>

        {/* Entries List */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 transition-colors">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Today's Entries</h2>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 dark:text-gray-500 w-4 h-4" />
              <input
                type="text"
                placeholder="Search truck or DO..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
              />
            </div>
          </div>

          <div className="space-y-4 max-h-[600px] overflow-y-auto">
            {filteredEntries.map((entry) => (
              <div 
                key={entry.id} 
                className={`border-2 rounded-lg p-4 ${
                  entry.status === 'linked' 
                    ? 'border-green-200 dark:border-green-700 bg-green-50 dark:bg-green-900/20' 
                    : entry.status === 'pending'
                    ? 'border-yellow-200 dark:border-yellow-700 bg-yellow-50 dark:bg-yellow-900/20'
                    : 'border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center space-x-3">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                      entry.status === 'linked' ? 'bg-green-100 dark:bg-green-900/30' : 'bg-yellow-100 dark:bg-yellow-900/30'
                    }`}>
                      <Truck className={`w-5 h-5 ${
                        entry.status === 'linked' ? 'text-green-600 dark:text-green-400' : 'text-yellow-600 dark:text-yellow-400'
                      }`} />
                    </div>
                    <div>
                      <div className="font-medium text-gray-900 dark:text-gray-100">{entry.truckNo}</div>
                      {entry.linkedDONumber ? (
                        <div className="text-sm text-gray-600 dark:text-gray-400 flex items-center">
                          <Link2 className="w-3 h-3 mr-1" />
                          DO: {entry.linkedDONumber}
                        </div>
                      ) : (
                        <div className="text-sm text-yellow-600 dark:text-yellow-400">Pending link</div>
                      )}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="flex items-center text-lg font-semibold text-gray-900 dark:text-gray-100">
                      <Fuel className="w-4 h-4 mr-1" />
                      {entry.liters}L
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">
                      {new Date(entry.timestamp).toLocaleTimeString('en-US', { 
                        hour: '2-digit', 
                        minute: '2-digit' 
                      })}
                    </div>
                  </div>
                </div>
                
                <div className="flex items-center justify-between text-sm text-gray-600 dark:text-gray-400 mt-3">
                  <div className="flex items-center">
                    <User className="w-3 h-3 mr-1" />
                    {entry.enteredBy}
                  </div>
                  <div className="flex items-center">
                    <Calendar className="w-3 h-3 mr-1" />
                    {new Date(entry.date).toLocaleDateString()}
                  </div>
                </div>

                {entry.notes && (
                  <div className="mt-2 p-2 bg-white dark:bg-gray-700 rounded text-sm text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-600">
                    {entry.notes}
                  </div>
                )}

                {entry.status === 'linked' && (
                  <div className="mt-2 flex items-center text-xs text-green-600 dark:text-green-400 font-medium">
                    <CheckCircle className="w-3 h-3 mr-1" />
                    Auto-linked to fuel record
                  </div>
                )}
              </div>
            ))}

            {filteredEntries.length === 0 && (
              <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                <Fuel className="w-12 h-12 mx-auto mb-4 text-gray-300 dark:text-gray-600" />
                <p>No entries found for {selectedYard}</p>
                <p className="text-sm">on {new Date(selectedDate).toLocaleDateString()}</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default YardFuelEntry;