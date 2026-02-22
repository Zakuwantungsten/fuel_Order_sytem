import React, { useState, useEffect } from 'react';
import { formatDate as formatSystemDate, formatDateOnly } from '../../utils/timezone';
import {
  RefreshCw,
  Download,
  Lock,
  Unlock,
  RotateCcw,
  Search as ScanIcon,
  Search,
  Copy,
  X,
  AlertTriangle,
  CheckCircle,
  Key,
  Loader
} from 'lucide-react';
import api from '../../services/api';
import Pagination from '../../components/Pagination';

interface DriverCredential {
  _id: string;
  truckNo: string;
  driverName?: string;
  isActive: boolean;
  createdAt: string;
  lastLogin?: string;
  createdBy?: string;
}

interface NewCredential {
  id: string;
  truckNo: string;
  pin: string;
  createdAt: string;
}

interface Stats {
  totalDrivers: number;
  activeDrivers: number;
  inactiveDrivers: number;
  recentLogins: number;
  loginRate: string;
}

const DriverCredentialsManager: React.FC = () => {
  const [credentials, setCredentials] = useState<DriverCredential[]>([]);
  const [loading, setLoading] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Pagination and search state
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');

  // Dialog states
  const [showNewCredentials, setShowNewCredentials] = useState(false);
  const [newCredentials, setNewCredentials] = useState<NewCredential[]>([]);
  const [resetDialog, setResetDialog] = useState<{ open: boolean; credential: DriverCredential | null }>({
    open: false,
    credential: null,
  });
  const [resetReason, setResetReason] = useState('');
  const [newPIN, setNewPIN] = useState<string | null>(null);

  useEffect(() => {
    fetchStats();
  }, []);

  useEffect(() => {
    fetchCredentials();
  }, [currentPage, itemsPerPage, searchTerm, statusFilter]);

  const fetchCredentials = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({
        page: currentPage.toString(),
        limit: itemsPerPage.toString(),
      });
      
      if (searchTerm) {
        params.append('search', searchTerm);
      }
      
      if (statusFilter !== 'all') {
        params.append('status', statusFilter);
      }
      
      const response = await api.get(`/driver-credentials?${params}`);
      const apiData = response.data.data;
      
      // Backend returns { data: [], pagination: { page, limit, total, totalPages } }
      setCredentials(apiData.data || []);
      setCurrentPage(apiData.pagination?.page || 1);
      setItemsPerPage(apiData.pagination?.limit || 10);
      setTotalPages(apiData.pagination?.totalPages || 1);
      setTotalItems(apiData.pagination?.total || 0);
      setError(null);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to fetch driver credentials');
    } finally {
      setLoading(false);
    }
  };

  const fetchStats = async () => {
    try {
      const response = await api.get('/driver-credentials/stats');
      setStats(response.data.data);
    } catch (err) {
      console.error('Failed to fetch stats:', err);
    }
  };

  const handleScanTrucks = async () => {
    try {
      setScanning(true);
      setError(null);
      const response = await api.post('/driver-credentials/scan');
      
      const { newCredentials: newCreds, newCount } = response.data.data;
      
      if (newCount > 0) {
        setNewCredentials(newCreds);
        setShowNewCredentials(true);
        setSuccess(`Successfully created ${newCount} new driver credential(s)!`);
      } else {
        setSuccess('No new trucks found. All existing trucks already have credentials.');
      }
      
      fetchCredentials();
      fetchStats();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to scan for new trucks');
    } finally {
      setScanning(false);
    }
  };

  const handleResetPIN = async () => {
    if (!resetDialog.credential) return;

    try {
      setLoading(true);
      const response = await api.put(`/driver-credentials/${resetDialog.credential._id}/reset`, {
        reason: resetReason,
      });
      
      const { newPIN: pin } = response.data.data;
      setNewPIN(pin);
      setSuccess(`PIN reset successfully for truck ${resetDialog.credential.truckNo}`);
      fetchCredentials();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to reset PIN');
    } finally {
      setLoading(false);
    }
  };

  const handleToggleStatus = async (credential: DriverCredential) => {
    try {
      setLoading(true);
      const action = credential.isActive ? 'deactivate' : 'reactivate';
      await api.put(`/driver-credentials/${credential._id}/${action}`);
      
      setSuccess(`Driver credential ${action}d successfully`);
      fetchCredentials();
      fetchStats();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to update credential status');
    } finally {
      setLoading(false);
    }
  };

  const handleExport = async (format: 'json' | 'csv') => {
    try {
      const response = await api.get(`/driver-credentials/export?format=${format}`, {
        responseType: format === 'csv' ? 'blob' : 'json',
      });

      if (format === 'csv') {
        const blob = new Blob([response.data], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `driver_credentials_${new Date().toISOString().split('T')[0]}.csv`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
      } else {
        const blob = new Blob([JSON.stringify(response.data, null, 2)], { type: 'application/json' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `driver_credentials_${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
      }

      setSuccess(`Credentials exported successfully as ${format.toUpperCase()}`);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to export credentials');
    }
  };

  const closeResetDialog = () => {
    setResetDialog({ open: false, credential: null });
    setResetReason('');
    setNewPIN(null);
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setSuccess('Copied to clipboard!');
  };

  return (
    <div className="p-6 bg-gray-50 dark:bg-gray-900 min-h-screen">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
        <div className="flex items-center space-x-3">
          <Key className="w-8 h-8 text-indigo-600 dark:text-indigo-400" />
          <h1 className="text-3xl font-bold text-gray-800 dark:text-gray-100">Driver Credentials Manager</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => handleExport('csv')}
            className="px-4 py-2 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors flex items-center space-x-2"
          >
            <Download className="w-4 h-4" />
            <span>Export CSV</span>
          </button>
          <button
            onClick={() => handleExport('json')}
            className="px-4 py-2 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors flex items-center space-x-2"
          >
            <Download className="w-4 h-4" />
            <span>Export JSON</span>
          </button>
          <button
            onClick={handleScanTrucks}
            disabled={scanning}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors flex items-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {scanning ? <Loader className="w-4 h-4 animate-spin" /> : <ScanIcon className="w-4 h-4" />}
            <span>Scan for New Trucks</span>
          </button>
          <button
            onClick={fetchCredentials}
            disabled={loading}
            className="p-2 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
          >
            <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Search and Filters */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 mb-6">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative w-full sm:w-80">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="Search by truck number..."
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent dark:bg-gray-700 dark:text-gray-100"
            />
          </div>
          
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value as 'all' | 'active' | 'inactive');
              setCurrentPage(1);
            }}
            className="w-full sm:w-48 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent dark:bg-gray-700 dark:text-gray-100"
          >
            <option value="all">All Status</option>
            <option value="active">Active Only</option>
            <option value="inactive">Inactive Only</option>
          </select>
        </div>
      </div>

      {/* Statistics Cards */}
      {stats && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
            <p className="text-gray-500 dark:text-gray-400 text-sm mb-1">Total Drivers</p>
            <p className="text-3xl font-bold text-gray-800 dark:text-gray-100">{stats.totalDrivers}</p>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
            <p className="text-gray-500 dark:text-gray-400 text-sm mb-1">Active</p>
            <p className="text-3xl font-bold text-green-600 dark:text-green-400">{stats.activeDrivers}</p>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
            <p className="text-gray-500 dark:text-gray-400 text-sm mb-1">Inactive</p>
            <p className="text-3xl font-bold text-red-600 dark:text-red-400">{stats.inactiveDrivers}</p>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
            <p className="text-gray-500 dark:text-gray-400 text-sm mb-1">Login Rate (7d)</p>
            <p className="text-3xl font-bold text-gray-800 dark:text-gray-100">{stats.loginRate}%</p>
          </div>
        </div>
      )}

      {/* Alerts */}
      {error && (
        <div className="mb-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 px-4 py-3 rounded-lg flex items-start justify-between">
          <div className="flex items-start space-x-2">
            <AlertTriangle className="w-5 h-5 mt-0.5 flex-shrink-0" />
            <span>{error}</span>
          </div>
          <button onClick={() => setError(null)} className="text-red-700 dark:text-red-400 hover:text-red-900 dark:hover:text-red-300">
            <X className="w-5 h-5" />
          </button>
        </div>
      )}
      {success && (
        <div className="mb-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 text-green-700 dark:text-green-400 px-4 py-3 rounded-lg flex items-start justify-between">
          <div className="flex items-start space-x-2">
            <CheckCircle className="w-5 h-5 mt-0.5 flex-shrink-0" />
            <span>{success}</span>
          </div>
          <button onClick={() => setSuccess(null)} className="text-green-700 dark:text-green-400 hover:text-green-900 dark:hover:text-green-300">
            <X className="w-5 h-5" />
          </button>
        </div>
      )}

      {/* Credentials Table */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-700">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Truck Number</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Driver Name</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Status</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Created</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Last Login</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Created By</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
              {loading && credentials.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center">
                    <Loader className="w-8 h-8 animate-spin mx-auto text-indigo-600" />
                  </td>
                </tr>
              ) : credentials.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-gray-500 dark:text-gray-400">
                    No driver credentials found. Click "Scan for New Trucks" to get started.
                  </td>
                </tr>
              ) : (
                credentials.map((credential) => (
                  <tr key={credential._id} className="hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="font-bold text-gray-900 dark:text-gray-100">{credential.truckNo}</span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-gray-700 dark:text-gray-300">
                      {credential.driverName || 'Not set'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2 py-1 text-xs font-semibold rounded-full ${
                        credential.isActive 
                          ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' 
                          : 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-400'
                      }`}>
                        {credential.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-gray-700 dark:text-gray-300">
                      {formatDateOnly(credential.createdAt)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-gray-700 dark:text-gray-300">
                      {credential.lastLogin ? formatDateOnly(credential.lastLogin) : 'Never'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-gray-700 dark:text-gray-300">
                      {credential.createdBy || 'System'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right space-x-2">
                      <button
                        onClick={() => setResetDialog({ open: true, credential })}
                        className="inline-flex items-center p-2 text-yellow-600 hover:bg-yellow-50 dark:hover:bg-yellow-900/20 rounded-lg transition-colors"
                        title="Reset PIN"
                      >
                        <RotateCcw className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleToggleStatus(credential)}
                        className={`inline-flex items-center p-2 rounded-lg transition-colors ${
                          credential.isActive
                            ? 'text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20'
                            : 'text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20'
                        }`}
                        title={credential.isActive ? 'Deactivate' : 'Reactivate'}
                      >
                        {credential.isActive ? <Lock className="w-4 h-4" /> : <Unlock className="w-4 h-4" />}
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      {credentials.length > 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow mt-4">
          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            totalItems={totalItems}
            itemsPerPage={itemsPerPage}
            onPageChange={(page) => setCurrentPage(page)}
            onItemsPerPageChange={(limit) => {
              setItemsPerPage(limit);
              setCurrentPage(1);
            }}
          />
        </div>
      )}

      {/* New Credentials Dialog */}
      {showNewCredentials && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
            <div className="p-6 border-b border-gray-200 dark:border-gray-700">
              <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-100">New Driver Credentials Created</h2>
            </div>
            <div className="p-6 overflow-y-auto flex-1">
              <div className="mb-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 text-yellow-800 dark:text-yellow-400 px-4 py-3 rounded-lg flex items-start space-x-2">
                <AlertTriangle className="w-5 h-5 mt-0.5 flex-shrink-0" />
                <div>
                  <strong>Important:</strong> PINs are shown only once. Please save them securely before closing this dialog.
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                  <thead className="bg-gray-50 dark:bg-gray-700">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Truck Number</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">PIN</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Created</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                    {newCredentials.map((cred) => (
                      <tr key={cred.id} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                        <td className="px-4 py-3 font-bold text-gray-900 dark:text-gray-100">{cred.truckNo}</td>
                        <td className="px-4 py-3">
                          <span className="text-2xl font-mono font-bold text-indigo-600 dark:text-indigo-400">{cred.pin}</span>
                        </td>
                        <td className="px-4 py-3 text-gray-700 dark:text-gray-300">
                          {formatSystemDate(cred.createdAt)}
                        </td>
                        <td className="px-4 py-3">
                          <button
                            onClick={() => copyToClipboard(`${cred.truckNo}: ${cred.pin}`)}
                            className="px-3 py-1 bg-indigo-600 text-white rounded hover:bg-indigo-700 transition-colors flex items-center space-x-1"
                          >
                            <Copy className="w-4 h-4" />
                            <span>Copy</span>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="p-6 border-t border-gray-200 dark:border-gray-700 flex justify-end">
              <button
                onClick={() => setShowNewCredentials(false)}
                className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
              >
                I have saved the PINs
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reset PIN Dialog */}
      {resetDialog.open && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-2xl max-w-md w-full">
            <div className="p-6 border-b border-gray-200 dark:border-gray-700">
              <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-100">Reset Driver PIN</h2>
            </div>
            <div className="p-6">
              {newPIN ? (
                <>
                  <div className="mb-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 text-green-700 dark:text-green-400 px-4 py-3 rounded-lg flex items-start space-x-2">
                    <CheckCircle className="w-5 h-5 mt-0.5 flex-shrink-0" />
                    <span>PIN reset successfully! This PIN will only be shown once.</span>
                  </div>
                  <div className="text-center my-6">
                    <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                      Truck: <strong>{resetDialog.credential?.truckNo}</strong>
                    </p>
                    <p className="text-5xl font-mono font-bold text-indigo-600 dark:text-indigo-400 my-4">
                      {newPIN}
                    </p>
                    <button
                      onClick={() => copyToClipboard(newPIN)}
                      className="mt-4 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors flex items-center space-x-2 mx-auto"
                    >
                      <Copy className="w-4 h-4" />
                      <span>Copy PIN</span>
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div className="mb-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 text-yellow-800 dark:text-yellow-400 px-4 py-3 rounded-lg flex items-start space-x-2">
                    <AlertTriangle className="w-5 h-5 mt-0.5 flex-shrink-0" />
                    <div>
                      This will generate a new PIN for truck <strong>{resetDialog.credential?.truckNo}</strong>.
                      The old PIN will no longer work.
                    </div>
                  </div>
                  <textarea
                    placeholder="Reason for reset (optional) - e.g., Driver change, lost PIN, security concern"
                    value={resetReason}
                    onChange={(e) => setResetReason(e.target.value)}
                    rows={3}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent dark:bg-gray-700 dark:text-gray-100"
                  />
                </>
              )}
            </div>
            <div className="p-6 border-t border-gray-200 dark:border-gray-700 flex justify-end space-x-2">
              <button
                onClick={closeResetDialog}
                className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
              >
                {newPIN ? 'Close' : 'Cancel'}
              </button>
              {!newPIN && (
                <button
                  onClick={handleResetPIN}
                  disabled={loading}
                  className="px-4 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? 'Resetting...' : 'Reset PIN'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DriverCredentialsManager;
