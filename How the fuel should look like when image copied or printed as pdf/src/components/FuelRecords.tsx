import { useState } from 'react';
import { Search, Filter, Download, Edit2 } from 'lucide-react';

interface FuelRecord {
  id: string;
  date: string;
  truckNo: string;
  goingDo: string;
  returnDo: string;
  start: string;
  from: string;
  to: string;
  totalLiters: number;
  extra: number;
  mmsaYard: number;
  tangaYard: number;
  darYard: number;
  darGoing: number;
  moroGoing: number;
  mbeyaGoing: number;
  tdmGoing: number;
  zambiaGoing: number;
  congoFuel: number;
  zambiaReturn: number;
  tundumaReturn: number;
  mbeyaReturn: number;
  moroReturn: number;
  darReturn: number;
  tangaReturn: number;
  balance: number;
  statement: string;
}

export function FuelRecords({ user }: { user: any }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedMonth, setSelectedMonth] = useState('November');
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedRecord, setSelectedRecord] = useState<FuelRecord | null>(null);

  // Sample data
  const [fuelRecords] = useState<FuelRecord[]>([
    {
      id: '1',
      date: '6-Sep',
      truckNo: 'T699 DXY',
      goingDo: '6038',
      returnDo: '6314',
      start: 'DAR',
      from: 'COMMUS',
      to: 'DAR',
      totalLiters: 2400,
      extra: 100,
      mmsaYard: 0,
      tangaYard: 0,
      darYard: -550,
      darGoing: 0,
      moroGoing: 0,
      mbeyaGoing: -450,
      tdmGoing: 0,
      zambiaGoing: -600,
      congoFuel: 0,
      zambiaReturn: -400,
      tundumaReturn: -100,
      mbeyaReturn: -400,
      moroReturn: 0,
      darReturn: 0,
      tangaReturn: 0,
      balance: 0,
      statement: '',
    },
    {
      id: '2',
      date: '6-Sep',
      truckNo: 'T132 EFP',
      goingDo: '6039',
      returnDo: '6317',
      start: 'DAR',
      from: 'COMMUS',
      to: 'DAR',
      totalLiters: 2400,
      extra: 60,
      mmsaYard: 0,
      tangaYard: 0,
      darYard: -550,
      darGoing: 0,
      moroGoing: 0,
      mbeyaGoing: -450,
      tdmGoing: 0,
      zambiaGoing: -560,
      congoFuel: 0,
      zambiaReturn: -400,
      tundumaReturn: -100,
      mbeyaReturn: -400,
      moroReturn: 0,
      darReturn: 0,
      tangaReturn: 0,
      balance: 0,
      statement: '',
    },
  ]);

  const filteredRecords = fuelRecords.filter((record) =>
    record.truckNo.toLowerCase().includes(searchTerm.toLowerCase()) ||
    record.goingDo.includes(searchTerm) ||
    record.returnDo.includes(searchTerm)
  );

  const calculateBalance = (record: FuelRecord) => {
    const totalFuel = record.totalLiters + record.extra;
    const consumed =
      Math.abs(record.mmsaYard) +
      Math.abs(record.tangaYard) +
      Math.abs(record.darYard) +
      Math.abs(record.darGoing) +
      Math.abs(record.moroGoing) +
      Math.abs(record.mbeyaGoing) +
      Math.abs(record.tdmGoing) +
      Math.abs(record.zambiaGoing) +
      Math.abs(record.congoFuel) +
      Math.abs(record.zambiaReturn) +
      Math.abs(record.tundumaReturn) +
      Math.abs(record.mbeyaReturn) +
      Math.abs(record.moroReturn) +
      Math.abs(record.darReturn) +
      Math.abs(record.tangaReturn);
    return totalFuel - consumed;
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-gray-900">Fuel Records</h1>
        <button className="flex items-center px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors">
          <Download className="w-5 h-5 mr-2" />
          Export to Excel
        </button>
      </div>

      {/* Filters */}
      <div className="bg-white p-4 rounded-lg shadow mb-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
            <input
              type="text"
              placeholder="Search by truck or DO number..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            />
          </div>

          <div>
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            >
              <option value="November">November 2025</option>
              <option value="October">October 2025</option>
              <option value="September">September 2025</option>
            </select>
          </div>

          <div>
            <button className="flex items-center px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 w-full justify-center">
              <Filter className="w-5 h-5 mr-2" />
              More Filters
            </button>
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white p-4 rounded-lg shadow">
          <div className="text-sm text-gray-600">Total Fuel This Month</div>
          <div className="text-gray-900 mt-1">145,200 L</div>
        </div>
        <div className="bg-white p-4 rounded-lg shadow">
          <div className="text-sm text-gray-600">Active Trucks</div>
          <div className="text-gray-900 mt-1">487</div>
        </div>
        <div className="bg-white p-4 rounded-lg shadow">
          <div className="text-sm text-gray-600">Avg Extra Fuel</div>
          <div className="text-gray-900 mt-1">78 L</div>
        </div>
        <div className="bg-white p-4 rounded-lg shadow">
          <div className="text-sm text-gray-600">Pending Balance</div>
          <div className="text-gray-900 mt-1">2,340 L</div>
        </div>
      </div>

      {/* Fuel Records Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-3 text-left text-xs text-gray-500 uppercase">Date</th>
                <th className="px-4 py-3 text-left text-xs text-gray-500 uppercase">Truck No.</th>
                <th className="px-4 py-3 text-left text-xs text-gray-500 uppercase">Going DO</th>
                <th className="px-4 py-3 text-left text-xs text-gray-500 uppercase">Return DO</th>
                <th className="px-4 py-3 text-left text-xs text-gray-500 uppercase">From → To</th>
                <th className="px-4 py-3 text-left text-xs text-gray-500 uppercase">Total Lts</th>
                <th className="px-4 py-3 text-left text-xs text-gray-500 uppercase">Extra</th>
                <th className="px-4 py-3 text-left text-xs text-gray-500 uppercase">Dar Yard</th>
                <th className="px-4 py-3 text-left text-xs text-gray-500 uppercase">Mbeya Going</th>
                <th className="px-4 py-3 text-left text-xs text-gray-500 uppercase">Zambia Going</th>
                <th className="px-4 py-3 text-left text-xs text-gray-500 uppercase">Zambia Return</th>
                <th className="px-4 py-3 text-left text-xs text-gray-500 uppercase">Mbeya Return</th>
                <th className="px-4 py-3 text-left text-xs text-gray-500 uppercase">Balance</th>
                <th className="px-4 py-3 text-left text-xs text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredRecords.map((record) => {
                const balance = calculateBalance(record);
                return (
                  <tr key={record.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 whitespace-nowrap text-gray-900">{record.date}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-gray-900">{record.truckNo}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-gray-500">{record.goingDo}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-gray-500">{record.returnDo}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-gray-500">
                      {record.from} → {record.to}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-gray-900">{record.totalLiters}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-gray-500">{record.extra}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-red-600">{record.darYard}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-red-600">{record.mbeyaGoing}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-red-600">{record.zambiaGoing}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-red-600">{record.zambiaReturn}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-red-600">{record.mbeyaReturn}</td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className={balance === 0 ? 'text-green-600' : 'text-orange-600'}>
                        {balance}
                      </span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <button
                        onClick={() => {
                          setSelectedRecord(record);
                          setShowEditModal(true);
                        }}
                        className="p-1 text-indigo-600 hover:text-indigo-900"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Edit Modal */}
      {showEditModal && selectedRecord && (
        <EditFuelRecordModal
          record={selectedRecord}
          onClose={() => {
            setShowEditModal(false);
            setSelectedRecord(null);
          }}
          onSave={(updatedRecord) => {
            // Handle save
            setShowEditModal(false);
            setSelectedRecord(null);
          }}
        />
      )}
    </div>
  );
}

function EditFuelRecordModal({
  record,
  onClose,
  onSave,
}: {
  record: FuelRecord;
  onClose: () => void;
  onSave: (record: FuelRecord) => void;
}) {
  const [formData, setFormData] = useState(record);

  const checkpoints = [
    { key: 'mmsaYard', label: 'MMSA Yard' },
    { key: 'tangaYard', label: 'Tanga Yard' },
    { key: 'darYard', label: 'Dar Yard' },
    { key: 'darGoing', label: 'Dar Going' },
    { key: 'moroGoing', label: 'Moro Going' },
    { key: 'mbeyaGoing', label: 'Mbeya Going' },
    { key: 'tdmGoing', label: 'TDM Going' },
    { key: 'zambiaGoing', label: 'Zambia Going' },
    { key: 'congoFuel', label: 'Congo Fuel' },
    { key: 'zambiaReturn', label: 'Zambia Return' },
    { key: 'tundumaReturn', label: 'Tunduma Return' },
    { key: 'mbeyaReturn', label: 'Mbeya Return' },
    { key: 'moroReturn', label: 'Moro Return' },
    { key: 'darReturn', label: 'Dar Return' },
    { key: 'tangaReturn', label: 'Tanga Return' },
  ];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(formData);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4">
          <h2 className="text-gray-900">Edit Fuel Record - {record.truckNo}</h2>
        </div>

        <form onSubmit={handleSubmit} className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
            <div>
              <label className="block text-sm text-gray-700 mb-2">Total Liters</label>
              <input
                type="number"
                value={formData.totalLiters}
                onChange={(e) => setFormData({ ...formData, totalLiters: parseFloat(e.target.value) })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-sm text-gray-700 mb-2">Extra Fuel</label>
              <input
                type="number"
                value={formData.extra}
                onChange={(e) => setFormData({ ...formData, extra: parseFloat(e.target.value) })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-sm text-gray-700 mb-2">Statement</label>
              <input
                type="text"
                value={formData.statement}
                onChange={(e) => setFormData({ ...formData, statement: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              />
            </div>
          </div>

          <h3 className="text-gray-900 mb-4">Fuel Distribution at Checkpoints</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {checkpoints.map((checkpoint) => (
              <div key={checkpoint.key}>
                <label className="block text-sm text-gray-700 mb-2">{checkpoint.label}</label>
                <input
                  type="number"
                  value={formData[checkpoint.key as keyof FuelRecord] as number}
                  onChange={(e) =>
                    setFormData({ ...formData, [checkpoint.key]: parseFloat(e.target.value) || 0 })
                  }
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                />
              </div>
            ))}
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
              Save Changes
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
