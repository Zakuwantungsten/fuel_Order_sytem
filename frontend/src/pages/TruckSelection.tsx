import React, { useState, useEffect } from 'react';
import { formatDateOnly } from '../utils/timezone';
import { Truck, Search, ArrowRight, Loader } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import api from '../services/api';
import { useRealtimeSync } from '../hooks/useRealtimeSync';

interface TruckSelection {
  truckNo: string;
  lastDO?: string;
  lastUpdate?: string;
}

const TruckSelection: React.FC = () => {
  const navigate = useNavigate();
  const [trucks, setTrucks] = useState<TruckSelection[]>([]);
  const [filteredTrucks, setFilteredTrucks] = useState<TruckSelection[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    fetchTrucks();
  }, []);

  useEffect(() => {
    if (searchTerm) {
      const filtered = trucks.filter(truck =>
        truck.truckNo.toLowerCase().includes(searchTerm.toLowerCase())
      );
      setFilteredTrucks(filtered);
    } else {
      setFilteredTrucks(trucks);
    }
  }, [searchTerm, trucks]);

  const fetchTrucks = async () => {
    try {
      setLoading(true);
      const response = await api.get('/delivery-orders/trucks');
      setTrucks(response.data.trucks || []);
      setFilteredTrucks(response.data.trucks || []);
    } catch (error: any) {
      console.error('Failed to fetch trucks:', error);
      toast.error('Failed to load trucks');
    } finally {
      setLoading(false);
    }
  };

  useRealtimeSync('delivery_orders', fetchTrucks);

  const handleTruckSelect = (truckNo: string) => {
    // Store truck number in localStorage for driver session
    localStorage.setItem('driverTruckNo', truckNo);
    // Navigate to driver portal
    navigate('/driver-portal', { state: { truckNo } });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center p-4 transition-colors">
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl dark:shadow-gray-900/50 p-8 text-center transition-colors">
          <Loader className="w-12 h-12 animate-spin text-indigo-600 dark:text-indigo-400 mx-auto mb-4" />
          <p className="text-gray-600 dark:text-gray-300">Loading trucks...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 py-8 px-4 transition-colors">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-20 h-20 bg-indigo-600 rounded-full mb-4">
            <Truck className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-3xl md:text-4xl font-bold text-gray-900 dark:text-gray-100 mb-2">
            Driver Portal
          </h1>
          <p className="text-gray-600 dark:text-gray-300 text-lg">
            Select your truck to view orders
          </p>
        </div>

        {/* Search Box */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg dark:shadow-gray-900/30 p-6 mb-6 transition-colors">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400 dark:text-gray-500 w-5 h-5" />
            <input
              type="text"
              placeholder="Search truck number..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-12 pr-4 py-4 text-lg border-2 border-gray-200 dark:border-gray-600 rounded-lg focus:outline-none focus:border-indigo-500 dark:focus:border-indigo-400 transition-colors bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500"
            />
          </div>
        </div>

        {/* Trucks Grid */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg dark:shadow-gray-900/30 p-6 transition-colors">
          {filteredTrucks.length === 0 ? (
            <div className="text-center py-12">
              <Truck className="w-16 h-16 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
              <p className="text-gray-500 dark:text-gray-400 text-lg">
                {searchTerm ? 'No trucks found matching your search' : 'No trucks available'}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredTrucks.map((truck) => (
                <button
                  key={truck.truckNo}
                  onClick={() => handleTruckSelect(truck.truckNo)}
                  className="group relative bg-gradient-to-br from-indigo-50 to-blue-50 dark:from-indigo-900/20 dark:to-blue-900/20 hover:from-indigo-100 hover:to-blue-100 dark:hover:from-indigo-900/30 dark:hover:to-blue-900/30 border-2 border-indigo-200 dark:border-indigo-700 hover:border-indigo-400 dark:hover:border-indigo-500 rounded-xl p-6 transition-all duration-200 hover:shadow-lg"
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center space-x-3">
                      <div className="w-12 h-12 bg-indigo-600 rounded-full flex items-center justify-center">
                        <Truck className="w-6 h-6 text-white" />
                      </div>
                      <div className="text-left">
                        <div className="text-xl font-bold text-gray-900 dark:text-gray-100">
                          {truck.truckNo}
                        </div>
                        {truck.lastDO && (
                          <div className="text-xs text-gray-500 dark:text-gray-400">
                            DO: {truck.lastDO}
                          </div>
                        )}
                      </div>
                    </div>
                    <ArrowRight className="w-5 h-5 text-indigo-600 dark:text-indigo-400 group-hover:translate-x-1 transition-transform" />
                  </div>
                  {truck.lastUpdate && (
                    <div className="text-xs text-gray-400 dark:text-gray-500 mt-2">
                      Last active: {formatDateOnly(truck.lastUpdate)}
                    </div>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Info Footer */}
        <div className="mt-6 text-center">
          <p className="text-gray-500 dark:text-gray-400 text-sm">
            Can't find your truck? Contact your supervisor.
          </p>
        </div>
      </div>
    </div>
  );
};

export default TruckSelection;
