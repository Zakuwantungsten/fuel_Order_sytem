import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { yardFuelService } from '../services/yardFuelService';
import { toast } from 'react-toastify';
import { useNavigate } from 'react-router-dom';
import { formatTruckNumber } from '../utils/dataCleanup';

interface YardFuelEntry {
  truckNo: string;
  liters: number;
  date: string;
  notes?: string;
}

const YardFuel: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [recentEntries, setRecentEntries] = useState<any[]>([]);
  
  const [formData, setFormData] = useState<YardFuelEntry>({
    truckNo: '',
    liters: 0,
    date: new Date().toISOString().split('T')[0],
    notes: '',
  });

  // Check if user is yardman
  const isYardman = user?.role && ['dar_yard', 'tanga_yard', 'mmsa_yard'].includes(user.role);

  useEffect(() => {
    if (!isYardman) {
      navigate('/dashboard');
      toast.error('Access denied. Yard personnel only.');
      return;
    }
    fetchRecentEntries();
  }, [isYardman, navigate]);

  const fetchRecentEntries = async () => {
    try {
      setLoading(true);
      const response = await yardFuelService.getAll({ page: 1, limit: 5, sort: 'timestamp', order: 'desc' });
      setRecentEntries(response.items || []);
    } catch (error: any) {
      console.error('Failed to fetch recent entries:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: name === 'liters' ? parseFloat(value) || 0 : (name === 'truckNo' ? formatTruckNumber(value) : value.toUpperCase()),
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.truckNo.trim()) {
      toast.error('Truck number is required');
      return;
    }
    
    if (formData.liters <= 0) {
      toast.error('Liters must be greater than 0');
      return;
    }

    try {
      setSubmitting(true);
      await yardFuelService.create({
        ...formData,
        truckNo: formatTruckNumber(formData.truckNo),
      });
      
      toast.success('Fuel dispense recorded successfully!');
      
      // Reset form
      setFormData({
        truckNo: '',
        liters: 0,
        date: new Date().toISOString().split('T')[0],
        notes: '',
      });
      
      // Refresh recent entries
      fetchRecentEntries();
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to record fuel dispense');
    } finally {
      setSubmitting(false);
    }
  };

  const getYardName = () => {
    if (!user?.role) return '';
    const yardMap: Record<string, string> = {
      dar_yard: 'DAR ES SALAAM',
      tanga_yard: 'TANGA',
      mmsa_yard: 'MMSA',
    };
    return yardMap[user.role] || '';
  };

  if (!isYardman) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 pb-20 transition-colors">
      {/* Header - Fixed */}
      <div className="bg-blue-600 text-white p-4 shadow-md sticky top-0 z-10">
        <div className="max-w-2xl mx-auto">
          <h1 className="text-xl font-bold">{getYardName()} YARD</h1>
          <p className="text-sm opacity-90">Fuel Dispense Entry</p>
          <p className="text-xs opacity-75 mt-1">Logged in as: {user?.username}</p>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-2xl mx-auto p-4">
        {/* Entry Form */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <h2 className="text-lg font-semibold mb-4 text-gray-800">Record Fuel Dispense</h2>
          
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Truck Number */}
            <div>
              <label htmlFor="truckNo" className="block text-sm font-medium text-gray-700 mb-1">
                Truck Number *
              </label>
              <input
                type="text"
                id="truckNo"
                name="truckNo"
                value={formData.truckNo}
                onChange={handleInputChange}
                placeholder="e.g., T123ABC"
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-lg uppercase"
                required
                autoComplete="off"
              />
            </div>

            {/* Liters */}
            <div>
              <label htmlFor="liters" className="block text-sm font-medium text-gray-700 mb-1">
                Liters *
              </label>
              <input
                type="number"
                id="liters"
                name="liters"
                value={formData.liters || ''}
                onChange={handleInputChange}
                placeholder="0"
                step="0.01"
                min="0"
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-lg"
                required
              />
            </div>

            {/* Date */}
            <div>
              <label htmlFor="date" className="block text-sm font-medium text-gray-700 mb-1">
                Date *
              </label>
              <input
                type="date"
                id="date"
                name="date"
                value={formData.date}
                onChange={handleInputChange}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-lg"
                required
              />
            </div>

            {/* Notes (Optional) */}
            <div>
              <label htmlFor="notes" className="block text-sm font-medium text-gray-700 mb-1">
                Notes (Optional)
              </label>
              <textarea
                id="notes"
                name="notes"
                value={formData.notes}
                onChange={handleInputChange}
                placeholder="Any additional notes..."
                rows={2}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={submitting}
              className="w-full bg-blue-600 text-white py-4 rounded-lg font-semibold text-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors shadow-md"
            >
              {submitting ? 'Recording...' : 'Record Fuel Dispense'}
            </button>
          </form>
        </div>

        {/* Recent Entries */}
        <div className="bg-white rounded-lg shadow-md p-6">
          <h2 className="text-lg font-semibold mb-4 text-gray-800">Recent Entries</h2>
          
          {loading ? (
            <div className="text-center py-8 text-gray-500">Loading...</div>
          ) : recentEntries.length === 0 ? (
            <div className="text-center py-8 text-gray-500">No recent entries</div>
          ) : (
            <div className="space-y-3">
              {recentEntries.map((entry, index) => (
                <div 
                  key={entry._id || index} 
                  className="border border-gray-200 rounded-lg p-4 bg-gray-50"
                >
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <p className="font-semibold text-lg text-gray-800">{entry.truckNo}</p>
                      <p className="text-sm text-gray-600">{entry.date}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-bold text-blue-600">{entry.liters}L</p>
                      <span className={`text-xs px-2 py-1 rounded-full ${
                        entry.status === 'linked' 
                          ? 'bg-green-100 text-green-800' 
                          : entry.status === 'pending'
                          ? 'bg-yellow-100 text-yellow-800'
                          : 'bg-gray-100 text-gray-800'
                      }`}>
                        {entry.status}
                      </span>
                    </div>
                  </div>
                  {entry.notes && (
                    <p className="text-sm text-gray-600 mt-2">Note: {entry.notes}</p>
                  )}
                  <p className="text-xs text-gray-500 mt-2">
                    by {entry.enteredBy} • {new Date(entry.timestamp).toLocaleString()}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default YardFuel;
