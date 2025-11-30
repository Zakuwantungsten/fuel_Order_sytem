import { useState } from 'react';
import { Search, Save, CheckCircle } from 'lucide-react';

interface YardEntry {
  id: string;
  date: string;
  truckNo: string;
  doNo: string;
  liters: number;
  yard: string;
  enteredBy: string;
  timestamp: string;
}

export function YardFuelEntry({ user }: { user: any }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedYard, setSelectedYard] = useState('DAR YARD');
  const [entries, setEntries] = useState<YardEntry[]>([
    {
      id: '1',
      date: '2025-11-28',
      truckNo: 'T699 DXY',
      doNo: '6038',
      liters: 550,
      yard: 'DAR YARD',
      enteredBy: 'Yard Manager',
      timestamp: '10:30 AM',
    },
  ]);

  const [newEntry, setNewEntry] = useState({
    truckNo: '',
    doNo: '',
    liters: 0,
  });

  const yards = ['DAR YARD', 'TANGA YARD', 'MMSA YARD', 'MBEYA YARD'];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const entry: YardEntry = {
      id: Date.now().toString(),
      date: new Date().toISOString().split('T')[0],
      truckNo: newEntry.truckNo,
      doNo: newEntry.doNo,
      liters: newEntry.liters,
      yard: selectedYard,
      enteredBy: user.name,
      timestamp: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
    };

    setEntries([entry, ...entries]);
    setNewEntry({ truckNo: '', doNo: '', liters: 0 });
  };

  const filteredEntries = entries.filter(
    (entry) =>
      entry.yard === selectedYard &&
      (entry.truckNo.toLowerCase().includes(searchTerm.toLowerCase()) ||
        entry.doNo.includes(searchTerm))
  );

  return (
    <div>
      <h1 className="text-gray-900 mb-6">Yard Fuel Entry</h1>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Entry Form */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-gray-900 mb-4">New Fuel Entry</h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm text-gray-700 mb-2">Yard</label>
              <select
                value={selectedYard}
                onChange={(e) => setSelectedYard(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              >
                {yards.map((yard) => (
                  <option key={yard} value={yard}>
                    {yard}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm text-gray-700 mb-2">Truck Number</label>
              <input
                type="text"
                required
                value={newEntry.truckNo}
                onChange={(e) => setNewEntry({ ...newEntry, truckNo: e.target.value.toUpperCase() })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                placeholder="e.g., T699 DXY"
              />
            </div>

            <div>
              <label className="block text-sm text-gray-700 mb-2">DO Number</label>
              <input
                type="text"
                required
                value={newEntry.doNo}
                onChange={(e) => setNewEntry({ ...newEntry, doNo: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                placeholder="e.g., 6038"
              />
            </div>

            <div>
              <label className="block text-sm text-gray-700 mb-2">Liters Filled</label>
              <input
                type="number"
                required
                min="0"
                value={newEntry.liters}
                onChange={(e) => setNewEntry({ ...newEntry, liters: parseFloat(e.target.value) || 0 })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                placeholder="Enter liters"
              />
            </div>

            <button
              type="submit"
              className="w-full flex items-center justify-center px-4 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
            >
              <Save className="w-5 h-5 mr-2" />
              Save Entry & Update Fuel Record
            </button>
          </form>

          <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <div className="flex items-start">
              <CheckCircle className="w-5 h-5 text-blue-600 mt-0.5 mr-2" />
              <div className="text-sm text-blue-800">
                <p className="mb-1">This entry will automatically:</p>
                <ul className="list-disc list-inside space-y-1 ml-2">
                  <li>Update the fuel record for this truck</li>
                  <li>Deduct liters from total allocation</li>
                  <li>Notify the driver (if applicable)</li>
                  <li>Create an audit trail</li>
                </ul>
              </div>
            </div>
          </div>
        </div>

        {/* Recent Entries */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-gray-900 mb-4">Today's Entries - {selectedYard}</h2>

          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
            <input
              type="text"
              placeholder="Search by truck or DO number..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            />
          </div>

          <div className="space-y-3 max-h-[500px] overflow-y-auto">
            {filteredEntries.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <p>No entries yet for {selectedYard} today</p>
              </div>
            ) : (
              filteredEntries.map((entry) => (
                <div key={entry.id} className="border border-gray-200 rounded-lg p-4 hover:border-indigo-300 transition-colors">
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <div className="text-gray-900">{entry.truckNo}</div>
                      <div className="text-sm text-gray-500">DO: {entry.doNo}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-green-600">{entry.liters} L</div>
                      <div className="text-xs text-gray-500">{entry.timestamp}</div>
                    </div>
                  </div>
                  <div className="text-xs text-gray-500 border-t border-gray-100 pt-2 mt-2">
                    Entered by: {entry.enteredBy}
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="mt-4 pt-4 border-t border-gray-200">
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600">Total Fuel Today:</span>
              <span className="text-gray-900">
                {filteredEntries.reduce((sum, entry) => sum + entry.liters, 0)} L
              </span>
            </div>
            <div className="flex justify-between items-center mt-2">
              <span className="text-sm text-gray-600">Total Trucks:</span>
              <span className="text-gray-900">{filteredEntries.length}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
