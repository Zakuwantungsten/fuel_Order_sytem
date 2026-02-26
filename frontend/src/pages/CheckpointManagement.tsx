import { useState, useEffect } from 'react';
import { 
  MapPin, 
  Plus, 
  Edit2, 
  Trash2, 
  Save, 
  X,
  AlertCircle,
  CheckCircle,
  Loader2
} from 'lucide-react';
import apiClient from '../services/api';
import { useRealtimeSync } from '../hooks/useRealtimeSync';

interface Checkpoint {
  _id: string;
  name: string;
  displayName: string;
  order: number;
  region: string;
  country: string;
  coordinates?: {
    latitude: number;
    longitude: number;
  };
  isActive: boolean;
  isMajor: boolean;
  alternativeNames: string[];
  fuelAvailable: boolean;
  borderCrossing: boolean;
  estimatedDistanceFromStart: number;
  createdAt: string;
  updatedAt: string;
}

const CheckpointManagement = () => {
  const [checkpoints, setCheckpoints] = useState<Checkpoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [formData, setFormData] = useState<Partial<Checkpoint>>({
    name: '',
    displayName: '',
    region: 'KENYA',
    country: 'KE',
    isActive: true,
    isMajor: false,
    alternativeNames: [],
    fuelAvailable: false,
    borderCrossing: false,
    estimatedDistanceFromStart: 0,
    coordinates: { latitude: 0, longitude: 0 },
  });
  const [altNameInput, setAltNameInput] = useState('');

  const regions = [
    'KENYA',
    'TANZANIA_COASTAL',
    'TANZANIA_INTERIOR',
    'TANZANIA_BORDER',
    'ZAMBIA_NORTH',
    'ZAMBIA_CENTRAL',
    'ZAMBIA_COPPERBELT',
    'ZAMBIA_BORDER',
    'DRC',
  ];

  const countries = [
    { code: 'KE', name: 'Kenya' },
    { code: 'TZ', name: 'Tanzania' },
    { code: 'ZM', name: 'Zambia' },
    { code: 'CD', name: 'DRC' },
  ];

  useEffect(() => {
    fetchCheckpoints();
  }, []);

  const fetchCheckpoints = async () => {
    try {
      setLoading(true);
      const response = await apiClient.get('/checkpoints?includeInactive=true');
      setCheckpoints(response.data.data || []);
      setError(null);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to fetch checkpoints');
    } finally {
      setLoading(false);
    }
  };

  useRealtimeSync('checkpoints', fetchCheckpoints);

  const showMessage = (message: string, type: 'success' | 'error') => {
    if (type === 'success') {
      setSuccess(message);
      setTimeout(() => setSuccess(null), 3000);
    } else {
      setError(message);
      setTimeout(() => setError(null), 5000);
    }
  };

  const handleCreate = async () => {
    try {
      await apiClient.post('/checkpoints', formData);
      showMessage('Checkpoint created successfully', 'success');
      setShowAddForm(false);
      resetForm();
      fetchCheckpoints();
    } catch (err: any) {
      showMessage(err.response?.data?.message || 'Failed to create checkpoint', 'error');
    }
  };

  const handleUpdate = async (id: string, data: Partial<Checkpoint>) => {
    try {
      await apiClient.put(`/checkpoints/${id}`, data);
      showMessage('Checkpoint updated successfully', 'success');
      setEditingId(null);
      setShowAddForm(false);
      fetchCheckpoints();
    } catch (err: any) {
      showMessage(err.response?.data?.message || 'Failed to update checkpoint', 'error');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this checkpoint?')) return;
    
    try {
      await apiClient.delete(`/checkpoints/${id}`);
      showMessage('Checkpoint deleted successfully', 'success');
      fetchCheckpoints();
    } catch (err: any) {
      showMessage(err.response?.data?.message || 'Failed to delete checkpoint', 'error');
    }
  };



  const resetForm = () => {
    setFormData({
      name: '',
      displayName: '',
      region: 'KENYA',
      country: 'KE',
      isActive: true,
      isMajor: false,
      alternativeNames: [],
      fuelAvailable: false,
      borderCrossing: false,
      estimatedDistanceFromStart: 0,
      coordinates: { latitude: 0, longitude: 0 },
    });
    setAltNameInput('');
  };

  const addAlternativeName = () => {
    if (!altNameInput.trim()) return;
    setFormData(prev => ({
      ...prev,
      alternativeNames: [...(prev.alternativeNames || []), altNameInput.trim()]
    }));
    setAltNameInput('');
  };

  const removeAlternativeName = (index: number) => {
    setFormData(prev => ({
      ...prev,
      alternativeNames: (prev.alternativeNames || []).filter((_, i) => i !== index)
    }));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6">
      {/* Header */}
      <div className="mb-4 sm:mb-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
              <MapPin className="w-6 h-6 sm:w-7 sm:h-7" />
              Checkpoint Management
            </h1>
            <p className="text-gray-600 dark:text-gray-400 mt-1 text-sm">
              Manage route checkpoints for fleet tracking
            </p>
          </div>
          <button
            onClick={() => {
              resetForm();
              setShowAddForm(true);
            }}
            className="flex items-center gap-2 px-3 py-1.5 sm:px-4 sm:py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm"
          >
            <Plus className="w-4 h-4" />
            Add Checkpoint
          </button>
        </div>
      </div>

      {/* Messages */}
      {success && (
        <div className="mb-4 p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg flex items-center gap-2 text-green-800 dark:text-green-200">
          <CheckCircle className="w-5 h-5" />
          {success}
        </div>
      )}
      
      {error && (
        <div className="mb-4 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg flex items-center gap-2 text-red-800 dark:text-red-200">
          <AlertCircle className="w-5 h-5" />
          {error}
        </div>
      )}

      {/* Add/Edit Form as Modal */}
      {showAddForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 p-6 flex items-center justify-between">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                {editingId ? 'Edit Checkpoint' : 'Add New Checkpoint'}
              </h2>
              <button
                onClick={() => {
                  setShowAddForm(false);
                  setEditingId(null);
                }}
                className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6">\n          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Name (Uppercase)
              </label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value.toUpperCase() })}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                placeholder="MOMBASA PORT"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Display Name
              </label>
              <input
                type="text"
                value={formData.displayName}
                onChange={(e) => setFormData({ ...formData, displayName: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                placeholder="Mombasa Port"
              />
            </div>

            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Coordinates (Latitude, Longitude)
              </label>
              <input
                type="text"
                value={formData.coordinates ? `${formData.coordinates.latitude}, ${formData.coordinates.longitude}` : ''}
                onChange={(e) => {
                  const parts = e.target.value.split(',').map(p => p.trim());
                  const lat = parseFloat(parts[0]) || 0;
                  const lng = parseFloat(parts[1]) || 0;
                  setFormData({ ...formData, coordinates: { latitude: lat, longitude: lng } });
                }}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                placeholder="-8.9288883, 33.4146716"
              />
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                Format: latitude, longitude (e.g., -8.9288883, 33.4146716)
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Region
              </label>
              <select
                value={formData.region}
                onChange={(e) => setFormData({ ...formData, region: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              >
                {regions.map(region => (
                  <option key={region} value={region}>{region}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Country
              </label>
              <select
                value={formData.country}
                onChange={(e) => setFormData({ ...formData, country: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              >
                {countries.map(country => (
                  <option key={country.code} value={country.code}>{country.name} ({country.code})</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Distance (km)
              </label>
              <input
                type="number"
                value={formData.estimatedDistanceFromStart}
                onChange={(e) => setFormData({ ...formData, estimatedDistanceFromStart: parseInt(e.target.value) })}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              />
            </div>
          </div>

          <div className="mt-4">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Alternative Names
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={altNameInput}
                onChange={(e) => setAltNameInput(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && addAlternativeName()}
                className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                placeholder="Add alternative name"
              />
              <button
                onClick={addAlternativeName}
                className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700"
              >
                Add
              </button>
            </div>
            <div className="flex flex-wrap gap-2 mt-2">
              {formData.alternativeNames?.map((name, index) => (
                <span
                  key={index}
                  className="inline-flex items-center gap-1 px-3 py-1 bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 rounded-full text-sm"
                >
                  {name}
                  <button
                    onClick={() => removeAlternativeName(index)}
                    className="hover:text-blue-900 dark:hover:text-blue-100"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
            <label className="flex items-center gap-2 text-gray-700 dark:text-gray-300">
              <input
                type="checkbox"
                checked={formData.isActive}
                onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                className="rounded"
              />
              Active
            </label>
            <label className="flex items-center gap-2 text-gray-700 dark:text-gray-300">
              <input
                type="checkbox"
                checked={formData.isMajor}
                onChange={(e) => setFormData({ ...formData, isMajor: e.target.checked })}
                className="rounded"
              />
              Major Checkpoint
            </label>
            <label className="flex items-center gap-2 text-gray-700 dark:text-gray-300">
              <input
                type="checkbox"
                checked={formData.fuelAvailable}
                onChange={(e) => setFormData({ ...formData, fuelAvailable: e.target.checked })}
                className="rounded"
              />
              Fuel Available
            </label>
            <label className="flex items-center gap-2 text-gray-700 dark:text-gray-300">
              <input
                type="checkbox"
                checked={formData.borderCrossing}
                onChange={(e) => setFormData({ ...formData, borderCrossing: e.target.checked })}
                className="rounded"
              />
              Border Crossing
            </label>
          </div>

          <div className="flex justify-end gap-2 mt-6">
            <button
              onClick={() => {
                setShowAddForm(false);
                setEditingId(null);
              }}
              className="px-4 py-2 text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600"
            >
              Cancel
            </button>
            <button
              onClick={() => {
                if (editingId) {
                  handleUpdate(editingId, formData);
                } else {
                  handleCreate();
                }
              }}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2"
            >
              <Save className="w-4 h-4" />
              {editingId ? 'Update Checkpoint' : 'Create Checkpoint'}
            </button>
          </div>
            </div>
          </div>
        </div>
      )}

      {/* Checkpoints Table */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md overflow-hidden">

        {/* Mobile card view */}
        <div className="sm:hidden">
          {checkpoints.length === 0 ? (
            <div className="text-center py-12">
              <MapPin className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-500 dark:text-gray-400">No checkpoints found</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-200 dark:divide-gray-700">
              {checkpoints.map((checkpoint) => (
                <div key={checkpoint._id} className="p-4 space-y-2">
                  {/* Name + status + actions */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">{checkpoint.displayName}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">{checkpoint.name}</p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                        checkpoint.isActive
                          ? 'bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200'
                          : 'bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-300'
                      }`}>{checkpoint.isActive ? 'Active' : 'Inactive'}</span>
                      <button
                        onClick={() => { setEditingId(checkpoint._id); setFormData(checkpoint); setShowAddForm(true); }}
                        className="text-blue-600 hover:text-blue-800 dark:text-blue-400"
                      ><Edit2 className="w-4 h-4" /></button>
                      <button
                        onClick={() => handleDelete(checkpoint._id)}
                        className="text-red-600 hover:text-red-800 dark:text-red-400"
                      ><Trash2 className="w-4 h-4" /></button>
                    </div>
                  </div>

                  {/* Details grid */}
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                    <div><span className="text-gray-400 dark:text-gray-500">Region: </span><span className="text-gray-700 dark:text-gray-300">{checkpoint.region.replace(/_/g, ' ')}</span></div>
                    <div><span className="text-gray-400 dark:text-gray-500">Country: </span><span className="text-gray-700 dark:text-gray-300">{checkpoint.country}</span></div>
                    <div><span className="text-gray-400 dark:text-gray-500">Distance: </span><span className="text-gray-700 dark:text-gray-300">{checkpoint.estimatedDistanceFromStart.toLocaleString()} km</span></div>
                    {checkpoint.coordinates && (
                      <div><span className="text-gray-400 dark:text-gray-500">Coords: </span><span className="font-mono text-gray-700 dark:text-gray-300">{checkpoint.coordinates.latitude.toFixed(4)}, {checkpoint.coordinates.longitude.toFixed(4)}</span></div>
                    )}
                  </div>

                  {/* Tags */}
                  {(checkpoint.isMajor || checkpoint.fuelAvailable || checkpoint.borderCrossing) && (
                    <div className="flex flex-wrap gap-1">
                      {checkpoint.isMajor && <span className="px-2 py-0.5 rounded text-xs font-medium bg-purple-100 dark:bg-purple-900 text-purple-800 dark:text-purple-200">Major</span>}
                      {checkpoint.fuelAvailable && <span className="px-2 py-0.5 rounded text-xs font-medium bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200">Fuel</span>}
                      {checkpoint.borderCrossing && <span className="px-2 py-0.5 rounded text-xs font-medium bg-orange-100 dark:bg-orange-900 text-orange-800 dark:text-orange-200">Border</span>}
                    </div>
                  )}

                  {checkpoint.alternativeNames.length > 0 && (
                    <p className="text-xs text-gray-400 dark:text-gray-500">Also: {checkpoint.alternativeNames.slice(0, 2).join(', ')}{checkpoint.alternativeNames.length > 2 && ` +${checkpoint.alternativeNames.length - 2} more`}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Desktop table view */}
        <div className="hidden sm:block overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 dark:bg-gray-700 border-b border-gray-200 dark:border-gray-600">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Name
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Coordinates
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Region / Country
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Distance (km)
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Properties
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {checkpoints.map((checkpoint) => (
                <tr key={checkpoint._id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                  <td className="px-4 py-3">
                    <div className="text-sm font-medium text-gray-900 dark:text-white">
                      {checkpoint.displayName}
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">
                      {checkpoint.name}
                    </div>
                    {checkpoint.alternativeNames.length > 0 && (
                      <div className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                        Also: {checkpoint.alternativeNames.slice(0, 2).join(', ')}
                        {checkpoint.alternativeNames.length > 2 && ` +${checkpoint.alternativeNames.length - 2} more`}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    {checkpoint.coordinates ? (
                      <div className="text-gray-700 dark:text-gray-300">
                        <div className="font-mono text-xs">
                          {checkpoint.coordinates.latitude.toFixed(6)},
                        </div>
                        <div className="font-mono text-xs">
                          {checkpoint.coordinates.longitude.toFixed(6)}
                        </div>
                      </div>
                    ) : (
                      <span className="text-gray-400 dark:text-gray-500 text-xs">No coordinates</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">
                    <div>{checkpoint.region.replace(/_/g, ' ')}</div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">{checkpoint.country}</div>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">
                    {checkpoint.estimatedDistanceFromStart.toLocaleString()}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {checkpoint.isMajor && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-purple-100 dark:bg-purple-900 text-purple-800 dark:text-purple-200">
                          Major
                        </span>
                      )}
                      {checkpoint.fuelAvailable && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200">
                          Fuel
                        </span>
                      )}
                      {checkpoint.borderCrossing && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-orange-100 dark:bg-orange-900 text-orange-800 dark:text-orange-200">
                          Border
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                      checkpoint.isActive 
                        ? 'bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200'
                        : 'bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-300'
                    }`}>
                      {checkpoint.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => {
                          setEditingId(checkpoint._id);
                          setFormData(checkpoint);
                          setShowAddForm(true);
                        }}
                        className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
                        title="Edit"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(checkpoint._id)}
                        className="text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300"
                        title="Delete"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {checkpoints.length === 0 && (
          <div className="hidden sm:block text-center py-12">
            <MapPin className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-500 dark:text-gray-400">No checkpoints found</p>
          </div>
        )}
      </div>

      <div className="mt-4 text-sm text-gray-600 dark:text-gray-400">
        Total: {checkpoints.length} checkpoints
      </div>
    </div>
  );
};

export default CheckpointManagement;
