import { useState, useEffect } from 'react';
import { Lock, Unlock, Save, X, AlertCircle, CheckCircle, Truck, MapPin } from 'lucide-react';
import { fuelRecordsAPI } from '../services/api';

interface LocalFuelRecord {
  id: string;
  date: string;
  truckNo: string;
  goingDo: string;
  to: string;
  from: string;
  totalLts: number | null;
  extra: number | null;
  isLocked: boolean;
  pendingConfigReason: 'missing_total_liters' | 'missing_extra_fuel' | 'both' | null;
}

export default function PendingConfigurations() {
  const [lockedRecords, setLockedRecords] = useState<LocalFuelRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<{ totalLts?: number; extra?: number }>({});
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    loadLockedRecords();
  }, []);

  const loadLockedRecords = async () => {
    try {
      setLoading(true);
      const response = await fuelRecordsAPI.getAll();
      // Response is the array directly, not response.data
      const records = Array.isArray(response) ? response : [];
      const locked = records.filter((record: any) => record.isLocked);
      setLockedRecords(locked as LocalFuelRecord[]);
    } catch (error: any) {
      console.error('Failed to load locked records:', error);
      showMessage('error', 'Failed to load pending configurations');
    } finally {
      setLoading(false);
    }
  };

  const showMessage = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 5000);
  };

  const startEditing = (record: LocalFuelRecord) => {
    setEditingId(record.id);
    setEditValues({
      totalLts: record.totalLts ?? undefined,
      extra: record.extra ?? undefined,
    });
  };

  const cancelEditing = () => {
    setEditingId(null);
    setEditValues({});
  };

  const saveConfiguration = async (recordId: string) => {
    try {
      setSaving(true);
      
      const updateData: any = {};
      if (editValues.totalLts !== undefined) {
        updateData.totalLts = editValues.totalLts;
      }
      if (editValues.extra !== undefined) {
        updateData.extra = editValues.extra;
      }

      await fuelRecordsAPI.update(recordId, updateData);
      
      showMessage('success', 'Configuration saved and fuel record unlocked!');
      setEditingId(null);
      setEditValues({});
      loadLockedRecords(); // Reload to get updated list
    } catch (error: any) {
      console.error('Failed to save configuration:', error);
      showMessage('error', error.response?.data?.message || 'Failed to save configuration');
    } finally {
      setSaving(false);
    }
  };

  const getMissingFieldsText = (reason: string | null) => {
    switch (reason) {
      case 'both':
        return 'Total Liters & Extra Fuel';
      case 'missing_total_liters':
        return 'Total Liters';
      case 'missing_extra_fuel':
        return 'Extra Fuel';
      default:
        return 'Unknown';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
            <Lock className="w-7 h-7 text-yellow-500" />
            Pending Configurations
          </h2>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
            Fuel records waiting for admin configuration
          </p>
        </div>
        <button
          onClick={loadLockedRecords}
          className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
        >
          Refresh
        </button>
      </div>

      {/* Message */}
      {message && (
        <div
          className={`p-4 rounded-lg flex items-center gap-3 ${
            message.type === 'success'
              ? 'bg-green-50 dark:bg-green-900/20 text-green-800 dark:text-green-300'
              : 'bg-red-50 dark:bg-red-900/20 text-red-800 dark:text-red-300'
          }`}
        >
          {message.type === 'success' ? (
            <CheckCircle className="w-5 h-5" />
          ) : (
            <AlertCircle className="w-5 h-5" />
          )}
          <span>{message.text}</span>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white dark:bg-gray-800 p-4 rounded-lg border dark:border-gray-700">
          <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            {lockedRecords.length}
          </div>
          <div className="text-sm text-gray-600 dark:text-gray-400">Total Locked</div>
        </div>
        <div className="bg-white dark:bg-gray-800 p-4 rounded-lg border dark:border-gray-700">
          <div className="text-2xl font-bold text-yellow-600">
            {lockedRecords.filter(r => r.pendingConfigReason === 'missing_total_liters').length}
          </div>
          <div className="text-sm text-gray-600 dark:text-gray-400">Missing Route Config</div>
        </div>
        <div className="bg-white dark:bg-gray-800 p-4 rounded-lg border dark:border-gray-700">
          <div className="text-2xl font-bold text-orange-600">
            {lockedRecords.filter(r => r.pendingConfigReason === 'missing_extra_fuel').length}
          </div>
          <div className="text-sm text-gray-600 dark:text-gray-400">Missing Truck Config</div>
        </div>
      </div>

      {/* Records Table */}
      {lockedRecords.length === 0 ? (
        <div className="bg-white dark:bg-gray-800 rounded-lg border dark:border-gray-700 p-12 text-center">
          <Unlock className="w-16 h-16 mx-auto mb-4 text-green-500" />
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
            All Clear!
          </h3>
          <p className="text-gray-600 dark:text-gray-400">
            No fuel records are waiting for configuration.
          </p>
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-800 rounded-lg border dark:border-gray-700 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
              <thead className="bg-gray-50 dark:bg-gray-900">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    DO Number
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Truck
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Destination
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Missing Fields
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Total Liters
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Extra Fuel
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                {lockedRecords.map((record) => (
                  <tr key={record.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <Lock className="w-5 h-5 text-yellow-500" />
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
                        {record.goingDo}
                      </div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">
                        {new Date(record.date).toLocaleDateString()}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <Truck className="w-4 h-4 text-gray-400" />
                        <span className="text-sm text-gray-900 dark:text-gray-100">
                          {record.truckNo}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <MapPin className="w-4 h-4 text-gray-400" />
                        <span className="text-sm text-gray-900 dark:text-gray-100">
                          {record.to}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="inline-flex px-2 py-1 text-xs font-medium rounded-full bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-300">
                        {getMissingFieldsText(record.pendingConfigReason)}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {editingId === record.id ? (
                        <input
                          type="number"
                          value={editValues.totalLts ?? ''}
                          onChange={(e) =>
                            setEditValues({ ...editValues, totalLts: parseInt(e.target.value) || undefined })
                          }
                          placeholder={record.totalLts?.toString() || 'Enter liters'}
                          className="w-24 px-2 py-1 border dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-sm"
                          disabled={
                            record.pendingConfigReason !== 'missing_total_liters' &&
                            record.pendingConfigReason !== 'both'
                          }
                        />
                      ) : (
                        <span className={`text-sm ${record.totalLts === null ? 'text-red-600 dark:text-red-400' : 'text-gray-900 dark:text-gray-100'}`}>
                          {record.totalLts !== null ? `${record.totalLts}L` : 'Not set'}
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {editingId === record.id ? (
                        <input
                          type="number"
                          value={editValues.extra ?? ''}
                          onChange={(e) =>
                            setEditValues({ ...editValues, extra: parseInt(e.target.value) || undefined })
                          }
                          placeholder={record.extra?.toString() || 'Enter extra'}
                          className="w-24 px-2 py-1 border dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-sm"
                          disabled={
                            record.pendingConfigReason !== 'missing_extra_fuel' &&
                            record.pendingConfigReason !== 'both'
                          }
                        />
                      ) : (
                        <span className={`text-sm ${record.extra === null ? 'text-red-600 dark:text-red-400' : 'text-gray-900 dark:text-gray-100'}`}>
                          {record.extra !== null ? `${record.extra}L` : 'Not set'}
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right">
                      {editingId === record.id ? (
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => saveConfiguration(record.id)}
                            disabled={saving}
                            className="inline-flex items-center px-3 py-1 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50 text-sm"
                          >
                            <Save className="w-4 h-4 mr-1" />
                            Save
                          </button>
                          <button
                            onClick={cancelEditing}
                            disabled={saving}
                            className="inline-flex items-center px-3 py-1 bg-gray-600 text-white rounded hover:bg-gray-700 disabled:opacity-50 text-sm"
                          >
                            <X className="w-4 h-4 mr-1" />
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => startEditing(record)}
                          className="inline-flex items-center px-3 py-1 bg-indigo-600 text-white rounded hover:bg-indigo-700 text-sm"
                        >
                          <Unlock className="w-4 h-4 mr-1" />
                          Configure
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
