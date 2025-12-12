import { useState, useEffect } from 'react';
import {
  FileText,
  ClipboardList,
  Fuel,
  Download,
  Plus,
  RefreshCw,
  ExternalLink,
} from 'lucide-react';
import { deliveryOrdersAPI, lposAPI, fuelRecordsAPI, doWorkbookAPI, lpoWorkbookAPI } from '../../services/api';
import { DeliveryOrder, LPOEntry, FuelRecord } from '../../types';

interface DataManagementTabProps {
  user: any;
  showMessage: (type: 'success' | 'error', message: string) => void;
}

interface DataStats {
  total: number;
  approved: number;
  pending: number;
  thisMonth: number;
}

export default function DataManagementTab({ showMessage }: DataManagementTabProps) {
  const [activeSection, setActiveSection] = useState<'do' | 'lpo' | 'fuel'>('do');
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState<DataStats>({ total: 0, approved: 0, pending: 0, thisMonth: 0 });
  const [data, setData] = useState<(DeliveryOrder | LPOEntry | FuelRecord)[]>([]);

  const sections = [
    { id: 'do', label: 'Delivery Orders', icon: FileText, color: 'blue' },
    { id: 'lpo', label: 'LPOs', icon: ClipboardList, color: 'purple' },
    { id: 'fuel', label: 'Fuel Records', icon: Fuel, color: 'orange' },
  ];

  // Load data when section changes
  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSection]);

  const loadData = async () => {
    setLoading(true);
    try {
      const currentDate = new Date();
      const firstDayOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
      
      let items: any[] = [];
      
      if (activeSection === 'do') {
        items = await deliveryOrdersAPI.getAll({ limit: 10, sort: 'createdAt', order: 'desc' });
      } else if (activeSection === 'lpo') {
        items = await lposAPI.getAll({ limit: 10, sort: 'createdAt', order: 'desc' });
      } else {
        items = await fuelRecordsAPI.getAll({ limit: 10, sort: 'createdAt', order: 'desc' });
      }
      
      setData(items);
      
      // Calculate stats
      const total = items.length;
      const approved = items.filter((item: any) => 
        activeSection === 'do' ? item.status === 'active' : !item.isCancelled
      ).length;
      const pending = items.filter((item: any) => 
        activeSection === 'do' ? item.status === 'pending' : false
      ).length;
      const thisMonth = items.filter((item: any) => {
        const itemDate = new Date(item.date || item.createdAt);
        return itemDate >= firstDayOfMonth;
      }).length;
      
      setStats({ total, approved, pending, thisMonth });
    } catch (error: any) {
      showMessage('error', error.response?.data?.message || 'Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const handleExport = async () => {
    try {
      showMessage('success', 'Preparing export...');
      const currentYear = new Date().getFullYear();
      
      if (activeSection === 'do') {
        await doWorkbookAPI.exportWorkbook(currentYear);
        showMessage('success', 'Delivery Orders exported successfully');
      } else if (activeSection === 'lpo') {
        await lpoWorkbookAPI.exportWorkbook(currentYear);
        showMessage('success', 'LPOs exported successfully');
      } else {
        showMessage('error', 'Fuel Records export not yet implemented');
      }
    } catch (error: any) {
      showMessage('error', error.response?.data?.message || 'Export failed');
    }
  };

  const navigateToFullPage = () => {
    const pages = {
      do: '/delivery-orders',
      lpo: '/lpo-management',
      fuel: '/fuel-records'
    };
    window.location.href = pages[activeSection];
  };

  return (
    <div className="space-y-6">
      {/* Section Selector */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border dark:border-gray-700 p-4">
        <div className="flex items-center gap-3 flex-wrap">
          {sections.map((section) => {
            const Icon = section.icon;
            return (
              <button
                key={section.id}
                onClick={() => setActiveSection(section.id as any)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${
                  activeSection === section.id
                    ? `bg-${section.color}-100 dark:bg-${section.color}-900/30 text-${section.color}-700 dark:text-${section.color}-400`
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                }`}
              >
                <Icon className="w-4 h-4" />
                {section.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Info Card */}
      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
        <div className="flex items-start gap-3">
          <FileText className="w-5 h-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
          <div>
            <h4 className="font-medium text-blue-900 dark:text-blue-100 mb-1">Data Management</h4>
            <p className="text-sm text-blue-800 dark:text-blue-200">
              View, create, edit, and approve operational data for {activeSection === 'do' ? 'Delivery Orders' : activeSection === 'lpo' ? 'LPOs' : 'Fuel Records'}.
              You have full CRUD permissions but cannot modify system configuration.
            </p>
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border dark:border-gray-700 p-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Quick Actions</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <button
            onClick={navigateToFullPage}
            className="flex items-center gap-3 p-4 bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800 rounded-lg hover:bg-indigo-100 dark:hover:bg-indigo-900/30 transition-colors"
          >
            <Plus className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
            <div className="text-left">
              <p className="font-medium text-indigo-900 dark:text-indigo-100">Create New</p>
              <p className="text-sm text-indigo-700 dark:text-indigo-300">
                Add new {activeSection === 'do' ? 'DO' : activeSection === 'lpo' ? 'LPO' : 'Fuel Record'}
              </p>
            </div>
          </button>

          <button
            onClick={loadData}
            className="flex items-center gap-3 p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg hover:bg-green-100 dark:hover:bg-green-900/30 transition-colors"
          >
            <RefreshCw className={`w-5 h-5 text-green-600 dark:text-green-400 ${loading ? 'animate-spin' : ''}`} />
            <div className="text-left">
              <p className="font-medium text-green-900 dark:text-green-100">Refresh Data</p>
              <p className="text-sm text-green-700 dark:text-green-300">
                Reload latest records
              </p>
            </div>
          </button>

          <button
            onClick={handleExport}
            className="flex items-center gap-3 p-4 bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-lg hover:bg-purple-100 dark:hover:bg-purple-900/30 transition-colors"
          >
            <Download className="w-5 h-5 text-purple-600 dark:text-purple-400" />
            <div className="text-left">
              <p className="font-medium text-purple-900 dark:text-purple-100">Export Data</p>
              <p className="text-sm text-purple-700 dark:text-purple-300">
                Download to Excel
              </p>
            </div>
          </button>
        </div>
      </div>

      {/* Data Table Section */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border dark:border-gray-700 p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            {activeSection === 'do' ? 'Delivery Orders' : activeSection === 'lpo' ? 'LPO Entries' : 'Fuel Records'}
          </h3>
          <div className="flex items-center gap-2">
            <button 
              onClick={loadData}
              disabled={loading}
              className="flex items-center gap-2 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
            <button 
              onClick={handleExport}
              className="flex items-center gap-2 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600"
            >
              <Download className="w-4 h-4" />
              Export
            </button>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center p-8">
            <RefreshCw className="w-8 h-8 text-indigo-600 dark:text-indigo-400 animate-spin" />
          </div>
        ) : data.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
              <thead className="bg-gray-50 dark:bg-gray-700">
                <tr>
                  {activeSection === 'do' && (
                    <>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-200 uppercase">DO Number</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-200 uppercase">Truck</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-200 uppercase">Destination</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-200 uppercase">Type</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-200 uppercase">Date</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-200 uppercase">Status</th>
                    </>
                  )}
                  {activeSection === 'lpo' && (
                    <>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-200 uppercase">LPO No</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-200 uppercase">Truck</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-200 uppercase">Station</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-200 uppercase">Liters</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-200 uppercase">Date</th>
                    </>
                  )}
                  {activeSection === 'fuel' && (
                    <>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-200 uppercase">Truck</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-200 uppercase">From</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-200 uppercase">To</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-200 uppercase">Going DO</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-200 uppercase">Return DO</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-200 uppercase">Date</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700 bg-white dark:bg-gray-800">
                {data.slice(0, 10).map((item: any) => (
                  <tr key={item._id || item.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                    {activeSection === 'do' && (
                      <>
                        <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100">{item.doNumber}</td>
                        <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100">{item.truckNo}</td>
                        <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100">{item.destination}</td>
                        <td className="px-4 py-3 text-sm">
                          <span className={`px-2 py-1 rounded text-xs ${
                            item.importOrExport === 'IMPORT' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' : 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                          }`}>
                            {item.importOrExport}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100">
                          {new Date(item.date).toLocaleDateString()}
                        </td>
                        <td className="px-4 py-3 text-sm">
                          <span className={`px-2 py-1 rounded text-xs ${
                            item.isCancelled ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' : 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                          }`}>
                            {item.isCancelled ? 'Cancelled' : 'Active'}
                          </span>
                        </td>
                      </>
                    )}
                    {activeSection === 'lpo' && (
                      <>
                        <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100">{item.lpoNo}</td>
                        <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100">{item.truckNo}</td>
                        <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100">{item.dieselAt}</td>
                        <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100">{item.liters}</td>
                        <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100">
                          {new Date(item.date).toLocaleDateString()}
                        </td>
                      </>
                    )}
                    {activeSection === 'fuel' && (
                      <>
                        <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100">{item.truckNo}</td>
                        <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100">{item.from}</td>
                        <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100">{item.to}</td>
                        <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100">{item.goingDo || '-'}</td>
                        <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100">{item.returnDo || '-'}</td>
                        <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100">
                          {new Date(item.date).toLocaleDateString()}
                        </td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="border dark:border-gray-700 rounded-lg p-8 text-center">
            <p className="text-gray-500 dark:text-gray-400 mb-2">
              No data available
            </p>
            <p className="text-sm text-gray-400 dark:text-gray-500">
              Start by creating a new record
            </p>
          </div>
        )}

        {/* Navigate to full page */}
        <div className="mt-6 flex items-center justify-center gap-3 pt-4 border-t dark:border-gray-700">
          <button 
            onClick={navigateToFullPage}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
          >
            <ExternalLink className="w-4 h-4" />
            Go to {activeSection === 'do' ? 'DO Management' : activeSection === 'lpo' ? 'LPO Management' : 'Fuel Records'}
          </button>
        </div>
      </div>

      {/* Statistics */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-gray-800 rounded-lg border dark:border-gray-700 p-4">
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">Total Records</p>
          <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{stats.total}</p>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-lg border dark:border-gray-700 p-4">
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">
            {activeSection === 'do' ? 'Active' : 'Approved'}
          </p>
          <p className="text-2xl font-bold text-green-600 dark:text-green-400">{stats.approved}</p>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-lg border dark:border-gray-700 p-4">
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">
            {activeSection === 'do' ? 'Pending' : 'Cancelled'}
          </p>
          <p className="text-2xl font-bold text-yellow-600 dark:text-yellow-400">{stats.pending}</p>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-lg border dark:border-gray-700 p-4">
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">This Month</p>
          <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">{stats.thisMonth}</p>
        </div>
      </div>
    </div>
  );
}
