import { useState } from 'react';
import { Download, FileSpreadsheet, Calendar, TrendingUp } from 'lucide-react';

export function Reports({ user }: { user: any }) {
  const [reportType, setReportType] = useState('fuel_records');
  const [dateRange, setDateRange] = useState({
    from: '2025-11-01',
    to: '2025-11-30',
  });

  const reportTypes = [
    { value: 'fuel_records', label: 'Fuel Records Report', icon: FileSpreadsheet },
    { value: 'lpo_summary', label: 'LPO Summary Report', icon: FileSpreadsheet },
    { value: 'do_summary', label: 'DO Summary Report', icon: FileSpreadsheet },
    { value: 'station_analysis', label: 'Station-wise Analysis', icon: TrendingUp },
    { value: 'truck_performance', label: 'Truck Performance Report', icon: TrendingUp },
  ];

  const handleGenerateReport = () => {
    // In a real app, this would generate and download the Excel file
    alert(`Generating ${reportTypes.find((r) => r.value === reportType)?.label}...`);
  };

  return (
    <div>
      <h1 className="text-gray-900 mb-6">Reports & Analytics</h1>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Report Configuration */}
        <div className="lg:col-span-1">
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-gray-900 mb-4">Generate Report</h2>

            <div className="space-y-4">
              <div>
                <label className="block text-sm text-gray-700 mb-2">Report Type</label>
                <select
                  value={reportType}
                  onChange={(e) => setReportType(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                >
                  {reportTypes.map((type) => (
                    <option key={type.value} value={type.value}>
                      {type.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm text-gray-700 mb-2">Date Range</label>
                <div className="space-y-2">
                  <div>
                    <label className="block text-xs text-gray-600 mb-1">From</label>
                    <input
                      type="date"
                      value={dateRange.from}
                      onChange={(e) => setDateRange({ ...dateRange, from: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-600 mb-1">To</label>
                    <input
                      type="date"
                      value={dateRange.to}
                      onChange={(e) => setDateRange({ ...dateRange, to: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                    />
                  </div>
                </div>
              </div>

              <button
                onClick={handleGenerateReport}
                className="w-full flex items-center justify-center px-4 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
              >
                <Download className="w-5 h-5 mr-2" />
                Generate Excel Report
              </button>
            </div>

            <div className="mt-6 p-4 bg-gray-50 rounded-lg">
              <h3 className="text-sm text-gray-900 mb-2">Report Features:</h3>
              <ul className="text-xs text-gray-600 space-y-1">
                <li>• Excel format (.xlsx)</li>
                <li>• Multiple sheets for detailed data</li>
                <li>• Formatted exactly like current files</li>
                <li>• Automatic calculations</li>
                <li>• Ready for printing</li>
              </ul>
            </div>
          </div>
        </div>

        {/* Quick Stats */}
        <div className="lg:col-span-2">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg shadow p-6 text-white">
              <div className="flex items-center justify-between mb-2">
                <div className="text-sm opacity-90">Total Fuel This Month</div>
                <FileSpreadsheet className="w-8 h-8 opacity-50" />
              </div>
              <div className="text-2xl mb-1">145,200 L</div>
              <div className="text-xs opacity-75">+8% from last month</div>
            </div>

            <div className="bg-gradient-to-br from-green-500 to-green-600 rounded-lg shadow p-6 text-white">
              <div className="flex items-center justify-between mb-2">
                <div className="text-sm opacity-90">Total LPOs Created</div>
                <Calendar className="w-8 h-8 opacity-50" />
              </div>
              <div className="text-2xl mb-1">284</div>
              <div className="text-xs opacity-75">Across 12 stations</div>
            </div>

            <div className="bg-gradient-to-br from-purple-500 to-purple-600 rounded-lg shadow p-6 text-white">
              <div className="flex items-center justify-between mb-2">
                <div className="text-sm opacity-90">Active Routes</div>
                <TrendingUp className="w-8 h-8 opacity-50" />
              </div>
              <div className="text-2xl mb-1">156</div>
              <div className="text-xs opacity-75">487 trucks on journey</div>
            </div>

            <div className="bg-gradient-to-br from-orange-500 to-orange-600 rounded-lg shadow p-6 text-white">
              <div className="flex items-center justify-between mb-2">
                <div className="text-sm opacity-90">Total DO Created</div>
                <FileSpreadsheet className="w-8 h-8 opacity-50" />
              </div>
              <div className="text-2xl mb-1">542</div>
              <div className="text-xs opacity-75">This month</div>
            </div>
          </div>

          {/* Available Reports */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-gray-900 mb-4">Available Reports</h2>

            <div className="space-y-3">
              {reportTypes.map((type) => {
                const Icon = type.icon;
                return (
                  <div
                    key={type.value}
                    className="flex items-center justify-between p-4 border border-gray-200 rounded-lg hover:border-indigo-300 hover:bg-indigo-50 transition-colors cursor-pointer"
                    onClick={() => setReportType(type.value)}
                  >
                    <div className="flex items-center">
                      <Icon className="w-5 h-5 text-indigo-600 mr-3" />
                      <div>
                        <div className="text-sm text-gray-900">{type.label}</div>
                        <div className="text-xs text-gray-500">
                          {type.value === 'fuel_records' && 'Detailed fuel consumption by truck'}
                          {type.value === 'lpo_summary' && 'Summary of all LPOs by station'}
                          {type.value === 'do_summary' && 'All delivery orders with client info'}
                          {type.value === 'station_analysis' && 'Fuel usage analysis by station'}
                          {type.value === 'truck_performance' && 'Truck efficiency and consumption'}
                        </div>
                      </div>
                    </div>
                    <Download className="w-4 h-4 text-gray-400" />
                  </div>
                );
              })}
            </div>
          </div>

          {/* Top Stations */}
          <div className="bg-white rounded-lg shadow p-6 mt-6">
            <h2 className="text-gray-900 mb-4">Top Fuel Stations This Month</h2>
            <div className="space-y-3">
              {[
                { station: 'LAKE KAPIRI', liters: 45200, orders: 89 },
                { station: 'LAKE NDOLA', liters: 38600, orders: 76 },
                { station: 'LAKE TUNDUMA', liters: 32100, orders: 64 },
                { station: 'DAR YARD', liters: 29300, orders: 58 },
              ].map((station, idx) => (
                <div key={idx} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div className="flex items-center">
                    <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center mr-3">
                      {idx + 1}
                    </div>
                    <div>
                      <div className="text-sm text-gray-900">{station.station}</div>
                      <div className="text-xs text-gray-500">{station.orders} orders</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm text-gray-900">{station.liters.toLocaleString()} L</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
