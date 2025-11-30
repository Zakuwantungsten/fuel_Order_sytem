import { useState } from 'react';
import { Plus, Search, Download, Edit2, Eye } from 'lucide-react';

interface DO {
  id: string;
  doNumber: string;
  date: string;
  type: 'IMPORT' | 'EXPORT';
  client: string;
  truckNo: string;
  trailerNo: string;
  destination: string;
  haulier: string;
  tonnage: number;
  rate: number;
  createdBy: string;
  editedBy?: string;
}

export function DOManagement({ user }: { user: any }) {
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<'ALL' | 'IMPORT' | 'EXPORT'>('ALL');

  // Sample data
  const [dos, setDos] = useState<DO[]>([
    {
      id: '1',
      doNumber: '6772',
      date: '2025-11-01',
      type: 'EXPORT',
      client: 'BRIDGE',
      truckNo: 'T538 EKT',
      trailerNo: 'T637 ELE',
      destination: 'DSM',
      haulier: 'TCC',
      tonnage: 32,
      rate: 185,
      createdBy: 'John Doe',
    },
    {
      id: '2',
      doNumber: '6773',
      date: '2025-11-01',
      type: 'EXPORT',
      client: 'BRIDGE',
      truckNo: 'T676 EAQ',
      trailerNo: 'T907 EAK',
      destination: 'DSM',
      haulier: 'TCC',
      tonnage: 32,
      rate: 185,
      createdBy: 'John Doe',
    },
  ]);

  const filteredDos = dos.filter((doItem) => {
    const matchesSearch =
      doItem.doNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
      doItem.truckNo.toLowerCase().includes(searchTerm.toLowerCase()) ||
      doItem.client.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesFilter = filterType === 'ALL' || doItem.type === filterType;
    return matchesSearch && matchesFilter;
  });

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-gray-900">DO Management</h1>
        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
        >
          <Plus className="w-5 h-5 mr-2" />
          Create DO
        </button>
      </div>

      {/* Filters */}
      <div className="bg-white p-4 rounded-lg shadow mb-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
            <input
              type="text"
              placeholder="Search by DO number, truck, or client..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            />
          </div>
          <div className="flex space-x-2">
            {['ALL', 'IMPORT', 'EXPORT'].map((type) => (
              <button
                key={type}
                onClick={() => setFilterType(type as any)}
                className={`px-4 py-2 rounded-lg transition-colors ${
                  filterType === type
                    ? 'bg-indigo-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {type}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* DO List */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-6 py-3 text-left text-xs text-gray-500 uppercase tracking-wider">DO Number</th>
                <th className="px-6 py-3 text-left text-xs text-gray-500 uppercase tracking-wider">Date</th>
                <th className="px-6 py-3 text-left text-xs text-gray-500 uppercase tracking-wider">Type</th>
                <th className="px-6 py-3 text-left text-xs text-gray-500 uppercase tracking-wider">Client</th>
                <th className="px-6 py-3 text-left text-xs text-gray-500 uppercase tracking-wider">Truck</th>
                <th className="px-6 py-3 text-left text-xs text-gray-500 uppercase tracking-wider">Destination</th>
                <th className="px-6 py-3 text-left text-xs text-gray-500 uppercase tracking-wider">Tonnage</th>
                <th className="px-6 py-3 text-left text-xs text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredDos.map((doItem) => (
                <tr key={doItem.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{doItem.doNumber}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{doItem.date}</td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span
                      className={`px-2 py-1 text-xs rounded-full ${
                        doItem.type === 'IMPORT'
                          ? 'bg-green-100 text-green-800'
                          : 'bg-blue-100 text-blue-800'
                      }`}
                    >
                      {doItem.type}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{doItem.client}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{doItem.truckNo}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{doItem.destination}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{doItem.tonnage}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    <div className="flex space-x-2">
                      <button className="p-1 text-indigo-600 hover:text-indigo-900">
                        <Eye className="w-4 h-4" />
                      </button>
                      <button className="p-1 text-gray-600 hover:text-gray-900">
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button className="p-1 text-gray-600 hover:text-gray-900">
                        <Download className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create DO Modal */}
      {showCreateModal && (
        <CreateDOModal
          onClose={() => setShowCreateModal(false)}
          onSave={(newDo) => {
            setDos([...dos, { ...newDo, id: Date.now().toString(), createdBy: user.name }]);
            setShowCreateModal(false);
          }}
        />
      )}
    </div>
  );
}

function CreateDOModal({ onClose, onSave }: { onClose: () => void; onSave: (doData: any) => void }) {
  const [formData, setFormData] = useState({
    doNumber: '',
    date: new Date().toISOString().split('T')[0],
    type: 'IMPORT' as 'IMPORT' | 'EXPORT',
    client: '',
    truckNo: '',
    trailerNo: '',
    destination: '',
    haulier: '',
    tonnage: 0,
    rate: 0,
    loadingPoint: '',
    containerNo: '',
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(formData);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4">
          <h2 className="text-gray-900">Create New DO</h2>
        </div>

        <form onSubmit={handleSubmit} className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm text-gray-700 mb-2">DO Number</label>
              <input
                type="text"
                required
                value={formData.doNumber}
                onChange={(e) => setFormData({ ...formData, doNumber: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-sm text-gray-700 mb-2">Date</label>
              <input
                type="date"
                required
                value={formData.date}
                onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-sm text-gray-700 mb-2">Type</label>
              <select
                value={formData.type}
                onChange={(e) => setFormData({ ...formData, type: e.target.value as 'IMPORT' | 'EXPORT' })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              >
                <option value="IMPORT">IMPORT (Going DO)</option>
                <option value="EXPORT">EXPORT (Return DO)</option>
              </select>
            </div>

            <div>
              <label className="block text-sm text-gray-700 mb-2">Client</label>
              <input
                type="text"
                required
                value={formData.client}
                onChange={(e) => setFormData({ ...formData, client: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-sm text-gray-700 mb-2">Truck Number</label>
              <input
                type="text"
                required
                value={formData.truckNo}
                onChange={(e) => setFormData({ ...formData, truckNo: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                placeholder="e.g., T538 EKT"
              />
            </div>

            <div>
              <label className="block text-sm text-gray-700 mb-2">Trailer Number</label>
              <input
                type="text"
                required
                value={formData.trailerNo}
                onChange={(e) => setFormData({ ...formData, trailerNo: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                placeholder="e.g., T637 ELE"
              />
            </div>

            <div>
              <label className="block text-sm text-gray-700 mb-2">Destination</label>
              <select
                value={formData.destination}
                onChange={(e) => setFormData({ ...formData, destination: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              >
                <option value="">Select destination</option>
                <option value="DAR">DAR</option>
                <option value="LUBUMBASHI">LUBUMBASHI</option>
                <option value="LIKASI">LIKASI</option>
                <option value="KAMBOVE">KAMBOVE</option>
                <option value="FUNGURUME">FUNGURUME</option>
                <option value="KOLWEZI">KOLWEZI</option>
                <option value="LUSAKA">LUSAKA</option>
              </select>
            </div>

            <div>
              <label className="block text-sm text-gray-700 mb-2">Haulier/Loading Point</label>
              <input
                type="text"
                required
                value={formData.haulier}
                onChange={(e) => setFormData({ ...formData, haulier: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-sm text-gray-700 mb-2">Tonnage</label>
              <input
                type="number"
                required
                value={formData.tonnage}
                onChange={(e) => setFormData({ ...formData, tonnage: parseFloat(e.target.value) })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-sm text-gray-700 mb-2">Rate per Ton ($)</label>
              <input
                type="number"
                required
                value={formData.rate}
                onChange={(e) => setFormData({ ...formData, rate: parseFloat(e.target.value) })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-sm text-gray-700 mb-2">Container Number</label>
              <input
                type="text"
                value={formData.containerNo}
                onChange={(e) => setFormData({ ...formData, containerNo: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                placeholder="Leave empty for loose cargo"
              />
            </div>
          </div>

          <div className="flex justify-end space-x-4 mt-6">
            <button
              type="button"
              onClick={onClose}
              className="px-6 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
            >
              Create DO & Generate PDF
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
