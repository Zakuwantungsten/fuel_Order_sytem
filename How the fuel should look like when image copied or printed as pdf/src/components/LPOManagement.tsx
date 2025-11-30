import { useState } from 'react';
import { Plus, Search, Download, Eye, XCircle } from 'lucide-react';

interface LPOItem {
  doNo: string;
  truckNo: string;
  liters: number;
  rate: number;
  amount: number;
  destination: string;
}

interface LPO {
  id: string;
  lpoNumber: string;
  date: string;
  station: string;
  orderOf: string;
  items: LPOItem[];
  total: number;
  createdBy: string;
  status: 'active' | 'cancelled' | 'completed';
}

export function LPOManagement({ user }: { user: any }) {
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedStation, setSelectedStation] = useState('ALL');

  const stations = [
    'LAKE KAPIRI',
    'LAKE NDOLA',
    'LAKE CHILABOMBWE',
    'LAKE TUNDUMA',
    'LAKE KITWE',
    'LAKE KABANGWA',
    'LAKE CHINGOLA',
    'GBP MOROGORO',
    'GBP KANGE',
    'INFINITY',
    'CASH',
  ];

  const [lpos, setLpos] = useState<LPO[]>([
    {
      id: '1',
      lpoNumber: '2356',
      date: '2025-11-17',
      station: 'LAKE KAPIRI',
      orderOf: 'TAHMEED',
      items: [
        { doNo: '6638', truckNo: 'T710 EHJ', liters: 350, rate: 1.2, amount: 420, destination: 'DAR' },
        { doNo: '6842', truckNo: 'T709 EHJ', liters: 350, rate: 1.2, amount: 420, destination: 'DAR' },
        { doNo: '6826', truckNo: 'T531 DRF', liters: 350, rate: 1.2, amount: 420, destination: 'DAR' },
        { doNo: '6634', truckNo: 'T593 DTB', liters: 350, rate: 1.2, amount: 420, destination: 'DAR' },
        { doNo: '6635', truckNo: 'T523 DRF', liters: 350, rate: 1.2, amount: 420, destination: 'DAR' },
      ],
      total: 2100,
      createdBy: 'John Doe',
      status: 'active',
    },
  ]);

  const filteredLpos = lpos.filter((lpo) => {
    const matchesSearch =
      lpo.lpoNumber.includes(searchTerm) ||
      lpo.items.some((item) => item.truckNo.toLowerCase().includes(searchTerm.toLowerCase()));
    const matchesStation = selectedStation === 'ALL' || lpo.station === selectedStation;
    return matchesSearch && matchesStation;
  });

  const handleCancelLPO = (lpoId: string) => {
    setLpos(lpos.map((lpo) => (lpo.id === lpoId ? { ...lpo, status: 'cancelled' as const } : lpo)));
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-gray-900">LPO Management</h1>
        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
        >
          <Plus className="w-5 h-5 mr-2" />
          Create LPO
        </button>
      </div>

      {/* Filters */}
      <div className="bg-white p-4 rounded-lg shadow mb-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
            <input
              type="text"
              placeholder="Search by LPO number or truck..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            />
          </div>

          <div>
            <select
              value={selectedStation}
              onChange={(e) => setSelectedStation(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            >
              <option value="ALL">All Stations</option>
              {stations.map((station) => (
                <option key={station} value={station}>
                  {station}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* LPO List */}
      <div className="space-y-4">
        {filteredLpos.map((lpo) => (
          <div key={lpo.id} className="bg-white rounded-lg shadow overflow-hidden">
            <div className="p-6">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <div className="flex items-center space-x-3">
                    <h3 className="text-gray-900">LPO #{lpo.lpoNumber}</h3>
                    <span
                      className={`px-2 py-1 text-xs rounded-full ${
                        lpo.status === 'active'
                          ? 'bg-green-100 text-green-800'
                          : lpo.status === 'cancelled'
                          ? 'bg-red-100 text-red-800'
                          : 'bg-gray-100 text-gray-800'
                      }`}
                    >
                      {lpo.status.toUpperCase()}
                    </span>
                  </div>
                  <div className="text-sm text-gray-600 mt-1">
                    Date: {lpo.date} | Station: {lpo.station}
                  </div>
                  <div className="text-xs text-gray-500 mt-1">Created by: {lpo.createdBy}</div>
                </div>

                <div className="flex items-center space-x-2">
                  <button className="p-2 text-indigo-600 hover:text-indigo-900">
                    <Eye className="w-5 h-5" />
                  </button>
                  <button className="p-2 text-green-600 hover:text-green-900">
                    <Download className="w-5 h-5" />
                  </button>
                  {lpo.status === 'active' && user.role === 'payment_manager' && (
                    <button
                      onClick={() => handleCancelLPO(lpo.id)}
                      className="p-2 text-red-600 hover:text-red-900"
                    >
                      <XCircle className="w-5 h-5" />
                    </button>
                  )}
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="px-4 py-2 text-left text-xs text-gray-500 uppercase">DO No.</th>
                      <th className="px-4 py-2 text-left text-xs text-gray-500 uppercase">Truck No.</th>
                      <th className="px-4 py-2 text-left text-xs text-gray-500 uppercase">Liters</th>
                      <th className="px-4 py-2 text-left text-xs text-gray-500 uppercase">Rate</th>
                      <th className="px-4 py-2 text-left text-xs text-gray-500 uppercase">Amount</th>
                      <th className="px-4 py-2 text-left text-xs text-gray-500 uppercase">Dest.</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {lpo.items.map((item, idx) => (
                      <tr key={idx}>
                        <td className="px-4 py-2 text-sm text-gray-900">{item.doNo}</td>
                        <td className="px-4 py-2 text-sm text-gray-900">{item.truckNo}</td>
                        <td className="px-4 py-2 text-sm text-gray-900">{item.liters}</td>
                        <td className="px-4 py-2 text-sm text-gray-500">{item.rate}</td>
                        <td className="px-4 py-2 text-sm text-gray-900">${item.amount}</td>
                        <td className="px-4 py-2 text-sm text-gray-500">{item.destination}</td>
                      </tr>
                    ))}
                    <tr className="bg-gray-50">
                      <td colSpan={2} className="px-4 py-2 text-sm text-gray-900">
                        TOTAL
                      </td>
                      <td className="px-4 py-2 text-sm text-gray-900">
                        {lpo.items.reduce((sum, item) => sum + item.liters, 0)}
                      </td>
                      <td colSpan={2} className="px-4 py-2 text-sm text-gray-900">
                        ${lpo.total}
                      </td>
                      <td></td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Create LPO Modal */}
      {showCreateModal && (
        <CreateLPOModal
          stations={stations}
          onClose={() => setShowCreateModal(false)}
          onSave={(newLpo) => {
            setLpos([
              ...lpos,
              {
                ...newLpo,
                id: Date.now().toString(),
                createdBy: user.name,
                status: 'active' as const,
              },
            ]);
            setShowCreateModal(false);
          }}
        />
      )}
    </div>
  );
}

function CreateLPOModal({
  stations,
  onClose,
  onSave,
}: {
  stations: string[];
  onClose: () => void;
  onSave: (lpo: any) => void;
}) {
  const [formData, setFormData] = useState({
    lpoNumber: '',
    date: new Date().toISOString().split('T')[0],
    station: stations[0],
    orderOf: 'TAHMEED',
  });

  const [items, setItems] = useState<LPOItem[]>([
    { doNo: '', truckNo: '', liters: 0, rate: 0, amount: 0, destination: '' },
  ]);

  const handleAddItem = () => {
    setItems([...items, { doNo: '', truckNo: '', liters: 0, rate: 0, amount: 0, destination: '' }]);
  };

  const handleRemoveItem = (index: number) => {
    setItems(items.filter((_, i) => i !== index));
  };

  const handleItemChange = (index: number, field: keyof LPOItem, value: any) => {
    const newItems = [...items];
    newItems[index] = { ...newItems[index], [field]: value };

    // Auto-calculate amount
    if (field === 'liters' || field === 'rate') {
      newItems[index].amount = newItems[index].liters * newItems[index].rate;
    }

    setItems(newItems);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const total = items.reduce((sum, item) => sum + item.amount, 0);
    onSave({ ...formData, items, total });
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-6xl max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4">
          <h2 className="text-gray-900">Create New LPO</h2>
        </div>

        <form onSubmit={handleSubmit} className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            <div>
              <label className="block text-sm text-gray-700 mb-2">LPO Number</label>
              <input
                type="text"
                required
                value={formData.lpoNumber}
                onChange={(e) => setFormData({ ...formData, lpoNumber: e.target.value })}
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
              <label className="block text-sm text-gray-700 mb-2">Station</label>
              <select
                value={formData.station}
                onChange={(e) => setFormData({ ...formData, station: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              >
                {stations.map((station) => (
                  <option key={station} value={station}>
                    {station}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm text-gray-700 mb-2">Order Of</label>
              <input
                type="text"
                required
                value={formData.orderOf}
                onChange={(e) => setFormData({ ...formData, orderOf: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              />
            </div>
          </div>

          <h3 className="text-gray-900 mb-4">Fuel Orders</h3>

          <div className="space-y-4 mb-4">
            {items.map((item, index) => (
              <div key={index} className="grid grid-cols-1 md:grid-cols-7 gap-3 p-4 border border-gray-200 rounded-lg">
                <div>
                  <label className="block text-xs text-gray-700 mb-1">DO No.</label>
                  <input
                    type="text"
                    required
                    value={item.doNo}
                    onChange={(e) => handleItemChange(index, 'doNo', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  />
                </div>

                <div>
                  <label className="block text-xs text-gray-700 mb-1">Truck No.</label>
                  <input
                    type="text"
                    required
                    value={item.truckNo}
                    onChange={(e) => handleItemChange(index, 'truckNo', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  />
                </div>

                <div>
                  <label className="block text-xs text-gray-700 mb-1">Liters</label>
                  <input
                    type="number"
                    required
                    value={item.liters}
                    onChange={(e) => handleItemChange(index, 'liters', parseFloat(e.target.value) || 0)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  />
                </div>

                <div>
                  <label className="block text-xs text-gray-700 mb-1">Rate</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={item.rate}
                    onChange={(e) => handleItemChange(index, 'rate', parseFloat(e.target.value) || 0)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  />
                </div>

                <div>
                  <label className="block text-xs text-gray-700 mb-1">Amount</label>
                  <input
                    type="number"
                    value={item.amount}
                    readOnly
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-gray-50"
                  />
                </div>

                <div>
                  <label className="block text-xs text-gray-700 mb-1">Dest.</label>
                  <input
                    type="text"
                    required
                    value={item.destination}
                    onChange={(e) => handleItemChange(index, 'destination', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  />
                </div>

                <div className="flex items-end">
                  <button
                    type="button"
                    onClick={() => handleRemoveItem(index)}
                    className="px-3 py-2 border border-red-300 text-red-600 rounded-lg hover:bg-red-50 text-sm"
                    disabled={items.length === 1}
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={handleAddItem}
            className="flex items-center px-4 py-2 border border-indigo-600 text-indigo-600 rounded-lg hover:bg-indigo-50 mb-6"
          >
            <Plus className="w-4 h-4 mr-2" />
            Add Item
          </button>

          <div className="bg-gray-50 p-4 rounded-lg mb-6">
            <div className="flex justify-between items-center">
              <span className="text-gray-900">Total Amount:</span>
              <span className="text-gray-900">
                ${items.reduce((sum, item) => sum + item.amount, 0).toFixed(2)}
              </span>
            </div>
            <div className="flex justify-between items-center mt-2">
              <span className="text-gray-600">Total Liters:</span>
              <span className="text-gray-900">{items.reduce((sum, item) => sum + item.liters, 0)} L</span>
            </div>
          </div>

          <div className="flex justify-end space-x-4">
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
              Create LPO & Auto-Update Records
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
