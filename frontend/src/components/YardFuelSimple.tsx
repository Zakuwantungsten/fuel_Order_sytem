import React, { useState, useEffect, useCallback, useRef } from 'react';
import { yardFuelService } from '../services/yardFuelService';
import { formatTruckNumber } from '../utils/dataCleanup';
import { useAuth } from '../contexts/AuthContext';
import { Fuel, Truck, Calendar, LogOut, RefreshCw, Sun, Moon, Wifi, WifiOff, CheckCircle, Clock, Link2 } from 'lucide-react';
import { useRealtimeSync } from '../hooks/useRealtimeSync';

// Real-time update interval (30 seconds)
const REALTIME_UPDATE_INTERVAL = 30000;

interface YardFuelSimpleProps {
  user: any;
}

export function YardFuelSimple({ user }: YardFuelSimpleProps) {
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [recentEntries, setRecentEntries] = useState<any[]>([]);
  const [rejectionHistory, setRejectionHistory] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<'entries' | 'rejections'>('entries');
  const [showResolved, setShowResolved] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [stats, setStats] = useState({ totalEntries: 0, totalLiters: 0, linkedCount: 0 });
  const updateIntervalRef = useRef<NodeJS.Timeout | null>(null);
  
  const { logout, toggleTheme, isDark } = useAuth();
  
  const [formData, setFormData] = useState({
    truckNo: '',
    liters: 0,
    date: new Date().toISOString().split('T')[0],
    notes: '',
  });

  const getYardShortName = () => {
    const yardMap: Record<string, string> = {
      dar_yard: 'DAR',
      tanga_yard: 'TANGA',
      mmsa_yard: 'MMSA',
      yard_personnel: 'YARD',
    };
    return yardMap[user.role] || 'YARD';
  };

  // Online/Offline status monitoring
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const fetchRecentEntries = useCallback(async (silent: boolean = false) => {
    try {
      if (!silent) {
        setLoading(true);
      } else {
        setIsRefreshing(true);
      }
      const response = await yardFuelService.getAll({ page: 1, limit: 10, sort: 'timestamp', order: 'desc' });
      const entries = response.items || [];
      setRecentEntries(entries);
      
      // Calculate stats
      const todayEntries = entries.filter((e: any) => e.date === new Date().toISOString().split('T')[0]);
      const totalLiters = todayEntries.reduce((sum: number, e: any) => sum + (e.liters || 0), 0);
      const linkedCount = todayEntries.filter((e: any) => e.status === 'linked').length;
      setStats({
        totalEntries: todayEntries.length,
        totalLiters,
        linkedCount
      });
      
      setLastUpdated(new Date());
    } catch (error: any) {
      console.error('Failed to fetch recent entries:', error);
    } finally {
      if (!silent) {
        setLoading(false);
      } else {
        setIsRefreshing(false);
      }
    }
  }, []);

  const fetchRejectionHistory = useCallback(async () => {
    try {
      // Get yard from user role
      const yardMap: Record<string, string> = {
        dar_yard: 'DAR YARD',
        tanga_yard: 'TANGA YARD',
        mmsa_yard: 'MMSA YARD',
      };
      const yard = yardMap[user.role];
      const history = await yardFuelService.getRejectionHistory(yard, showResolved);
      setRejectionHistory(history);
    } catch (error: any) {
      console.error('Failed to fetch rejection history:', error);
    }
  }, [user.role, showResolved]);

  // Initial fetch and real-time updates
  useEffect(() => {
    fetchRecentEntries();
    fetchRejectionHistory();
    
    // Set up real-time polling
    updateIntervalRef.current = setInterval(() => {
      if (isOnline) {
        fetchRecentEntries(true);
        fetchRejectionHistory();
      }
    }, REALTIME_UPDATE_INTERVAL);
    
    return () => {
      if (updateIntervalRef.current) {
        clearInterval(updateIntervalRef.current);
      }
    };
  }, [fetchRecentEntries, isOnline]);

  useRealtimeSync('yard_fuel', () => fetchRecentEntries(true));

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: name === 'liters' ? parseFloat(value) || 0 : (name === 'truckNo' ? formatTruckNumber(value) : value.toUpperCase()),
    }));
  };

  const showMessage = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 4000);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.truckNo.trim()) {
      showMessage('error', 'Truck number is required');
      return;
    }
    
    if (formData.liters <= 0) {
      showMessage('error', 'Liters must be greater than 0');
      return;
    }

    // Check for duplicate entry (same truck with same liters on same date)
    const formattedTruckNo = formatTruckNumber(formData.truckNo);
    const duplicate = recentEntries.find(
      (entry: any) => 
        entry.truckNo.toUpperCase() === formattedTruckNo.toUpperCase() && 
        entry.liters === formData.liters && 
        entry.date === formData.date
    );
    
    if (duplicate) {
      showMessage('error', `⚠️ Duplicate Entry! Truck ${formattedTruckNo} with ${formData.liters}L already recorded on ${formData.date}. Use different liters if this is a new entry.`);
      return;
    }

    try {
      setSubmitting(true);
      const response = await yardFuelService.create({
        ...formData,
        truckNo: formatTruckNumber(formData.truckNo),
        ...(user.yard ? { yard: user.yard } : {}),
      });
      
      // Check if it was linked to a fuel record
      const wasLinked = (response as any)?.linkedInfo?.linked;
      const doNumber = (response as any)?.linkedInfo?.doNumber;
      
      if (wasLinked && doNumber) {
        showMessage('success', `✓ Fuel recorded and linked to DO ${doNumber}!`);
      } else {
        showMessage('success', '✓ Fuel recorded! Will be linked when fuel record is created.');
      }
      
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
      const errorMsg = error.response?.data?.message || error.message || 'Failed to record fuel dispense';
      showMessage('error', errorMsg);
      console.error('Error:', error);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 overflow-x-hidden transition-colors">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-blue-600 dark:bg-blue-800 text-white shadow-md">
        <div className="px-3 sm:px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex-1 min-w-0 mr-2">
              <div className="flex items-center">
                <h1 className="text-base sm:text-lg font-bold truncate">
                  {getYardShortName()} YARD
                </h1>
                {/* Real-time status indicator */}
                <div className="ml-2 flex items-center">
                  {isOnline ? (
                    <span className="flex items-center text-green-300" title="Connected - Auto-updating">
                      <Wifi className="w-3 h-3 sm:w-4 sm:h-4" />
                      {isRefreshing && <RefreshCw className="w-3 h-3 ml-1 animate-spin" />}
                    </span>
                  ) : (
                    <span className="flex items-center text-red-300" title="Offline">
                      <WifiOff className="w-3 h-3 sm:w-4 sm:h-4" />
                    </span>
                  )}
                </div>
              </div>
              <p className="text-xs opacity-80 truncate">
                <Calendar className="w-3 h-3 inline mr-1" />
                {new Date().toLocaleDateString()}
                {lastUpdated && (
                  <span className="hidden sm:inline ml-2">
                    • Updated {lastUpdated.toLocaleTimeString()}
                  </span>
                )}
              </p>
            </div>
            <div className="flex items-center space-x-1 sm:space-x-2 flex-shrink-0">
              <button
                onClick={toggleTheme}
                className="p-1.5 sm:p-2 text-white/80 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
                aria-label="Toggle theme"
              >
                {isDark ? <Sun className="w-4 h-4 sm:w-5 sm:h-5" /> : <Moon className="w-4 h-4 sm:w-5 sm:h-5" />}
              </button>
              <button
                onClick={() => fetchRecentEntries()}
                className={`p-1.5 sm:p-2 text-white/80 hover:text-white hover:bg-white/10 rounded-lg transition-colors ${isRefreshing ? 'animate-pulse' : ''}`}
                aria-label="Refresh"
                disabled={isRefreshing}
              >
                <RefreshCw className={`w-4 h-4 sm:w-5 sm:h-5 ${isRefreshing ? 'animate-spin' : ''}`} />
              </button>
              <button
                onClick={logout}
                className="p-1.5 sm:p-2 text-white/80 hover:text-white hover:bg-red-500/50 rounded-lg transition-colors"
                aria-label="Logout"
              >
                <LogOut className="w-4 h-4 sm:w-5 sm:h-5" />
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="pb-20 overflow-x-hidden max-w-7xl mx-auto">
        {/* Message Banner */}
        {message && (
          <div className={`mx-3 sm:mx-4 mt-3 sm:mt-4 p-3 sm:p-4 rounded-lg text-sm sm:text-base ${message.type === 'success' ? 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300' : 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300'}`}>
            {message.text}
          </div>
        )}

        {/* Stats Cards */}
        <div className="px-3 sm:px-4 py-3 sm:py-4">
          <div className="grid grid-cols-3 gap-2 sm:gap-3">
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-3 sm:p-4 border border-gray-100 dark:border-gray-700">
              <div className="flex items-center justify-between">
                <div className="min-w-0">
                  <p className="text-xs text-gray-500 dark:text-gray-400 truncate">Today</p>
                  <p className="text-lg sm:text-xl font-bold text-gray-900 dark:text-gray-100 mt-1">{stats.totalEntries}</p>
                </div>
                <div className="w-8 h-8 sm:w-10 sm:h-10 bg-blue-100 dark:bg-blue-900/30 rounded-lg flex items-center justify-center flex-shrink-0 ml-2">
                  <Truck className="w-4 h-4 sm:w-5 sm:h-5 text-blue-600 dark:text-blue-400" />
                </div>
              </div>
            </div>
            
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-3 sm:p-4 border border-gray-100 dark:border-gray-700">
              <div className="flex items-center justify-between">
                <div className="min-w-0">
                  <p className="text-xs text-gray-500 dark:text-gray-400 truncate">Liters</p>
                  <p className="text-lg sm:text-xl font-bold text-green-600 dark:text-green-400 mt-1">{stats.totalLiters.toLocaleString()}</p>
                </div>
                <div className="w-8 h-8 sm:w-10 sm:h-10 bg-green-100 dark:bg-green-900/30 rounded-lg flex items-center justify-center flex-shrink-0 ml-2">
                  <Fuel className="w-4 h-4 sm:w-5 sm:h-5 text-green-600 dark:text-green-400" />
                </div>
              </div>
            </div>
            
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-3 sm:p-4 border border-gray-100 dark:border-gray-700">
              <div className="flex items-center justify-between">
                <div className="min-w-0">
                  <p className="text-xs text-gray-500 dark:text-gray-400 truncate">Linked</p>
                  <p className="text-lg sm:text-xl font-bold text-purple-600 dark:text-purple-400 mt-1">{stats.linkedCount}</p>
                </div>
                <div className="w-8 h-8 sm:w-10 sm:h-10 bg-purple-100 dark:bg-purple-900/30 rounded-lg flex items-center justify-center flex-shrink-0 ml-2">
                  <Link2 className="w-4 h-4 sm:w-5 sm:h-5 text-purple-600 dark:text-purple-400" />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Entry Form */}
        <div className="px-3 sm:px-4 pb-3 sm:pb-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-4 sm:p-6 border border-gray-100 dark:border-gray-700 transition-colors">
            <h2 className="text-base sm:text-lg font-semibold mb-3 sm:mb-4 text-gray-800 dark:text-gray-100 flex items-center">
              <Fuel className="w-4 h-4 sm:w-5 sm:h-5 mr-2 text-blue-600 dark:text-blue-400" />
              Record Fuel Dispense
            </h2>
            
            <form onSubmit={handleSubmit} className="space-y-3 sm:space-y-4">
              {/* Form Fields Grid - 2 columns on desktop */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
                {/* Truck Number */}
                <div>
                  <label htmlFor="truckNo" className="block text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 sm:mb-2">
                    Truck Number *
                  </label>
                  <input
                    type="text"
                    id="truckNo"
                    name="truckNo"
                    value={formData.truckNo}
                    onChange={handleInputChange}
                    placeholder="e.g., T123ABC"
                    className="w-full px-3 sm:px-4 py-2.5 sm:py-3 border-2 border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-base sm:text-lg uppercase font-semibold bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                    required
                    autoComplete="off"
                  />
                </div>
                {/* Liters */}
                <div>
                  <label htmlFor="liters" className="block text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 sm:mb-2">
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
                    className="w-full px-3 sm:px-4 py-2.5 sm:py-3 border-2 border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-base sm:text-lg font-semibold bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                    required
                  />
                </div>

                {/* Date */}
                <div>
                  <label htmlFor="date" className="block text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 sm:mb-2">
                    Date *
                  </label>
                  <input
                    type="date"
                    id="date"
                    name="date"
                    value={formData.date}
                    onChange={handleInputChange}
                    className="w-full px-3 sm:px-4 py-2.5 sm:py-3 border-2 border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-base sm:text-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                    required
                  />
                </div>

                {/* Notes (Optional) - spans full width on all screens */}
                <div className="md:col-span-2">
                  <label htmlFor="notes" className="block text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 sm:mb-2">
                    Notes (Optional)
                  </label>
                  <textarea
                    id="notes"
                    name="notes"
                    value={formData.notes}
                    onChange={handleInputChange}
                    placeholder="Any additional notes..."
                    rows={2}
                    className="w-full px-3 sm:px-4 py-2.5 sm:py-3 border-2 border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm sm:text-base"
                  />
                </div>
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={submitting}
                className="w-full bg-blue-600 text-white py-3 sm:py-4 rounded-lg font-bold text-base sm:text-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors shadow-lg active:scale-[0.98] transform"
              >
                {submitting ? 'Recording...' : 'RECORD FUEL'}
              </button>
            </form>
          </div>
        </div>

        {/* Tabs & Content */}
        <div className="px-3 sm:px-4 pb-3 sm:pb-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 transition-colors">
            {/* Tabs */}
            <div className="flex border-b border-gray-200 dark:border-gray-600">
              <button
                onClick={() => setActiveTab('entries')}
                className={`flex-1 px-4 py-3 text-sm sm:text-base font-medium transition-colors ${
                  activeTab === 'entries'
                    ? 'text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400'
                    : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
                }`}
              >
                <Clock className="w-4 h-4 inline mr-2" />
                Recent Entries
              </button>
              <button
                onClick={() => setActiveTab('rejections')}
                className={`flex-1 px-4 py-3 text-sm sm:text-base font-medium transition-colors ${
                  activeTab === 'rejections'
                    ? 'text-red-600 dark:text-red-400 border-b-2 border-red-600 dark:border-red-400'
                    : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
                }`}
              >
                ⚠️ Rejections {rejectionHistory.length > 0 && `(${rejectionHistory.length})`}
              </button>
            </div>

            {/* Tab Content */}
            <div className="p-3 sm:p-4">
              {activeTab === 'entries' && (
                <div>
            
            {loading ? (
              <div className="text-center py-8 sm:py-12 text-gray-500 dark:text-gray-400">
                <RefreshCw className="w-8 h-8 sm:w-10 sm:h-10 animate-spin text-blue-600 dark:text-blue-400 mx-auto mb-3" />
                <p className="text-sm sm:text-base">Loading...</p>
              </div>
            ) : recentEntries.length === 0 ? (
              <div className="text-center py-8 sm:py-12 text-gray-500 dark:text-gray-400">
                <Fuel className="w-10 h-10 sm:w-12 sm:h-12 mx-auto text-gray-300 dark:text-gray-600 mb-2" />
                <p className="text-sm sm:text-base">No recent entries</p>
                <p className="text-xs sm:text-sm mt-1">Your fuel dispense records will appear here</p>
              </div>
            ) : (
              <>
              {/* Card View - Mobile/Tablet (below lg) */}
              <div className="lg:hidden space-y-2 sm:space-y-3">
                {recentEntries.map((entry, index) => (
                  <div 
                    key={entry._id || index} 
                    className="border border-gray-200 dark:border-gray-600 rounded-xl p-3 sm:p-4 bg-gray-50 dark:bg-gray-700/50 hover:bg-gray-100 dark:hover:bg-gray-600/50 transition-colors"
                  >
                    <div className="flex justify-between items-start">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center flex-wrap gap-1 sm:gap-2">
                          <p className="font-bold text-base sm:text-lg text-gray-800 dark:text-gray-100">{entry.truckNo}</p>
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                            entry.status === 'linked' 
                              ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300' 
                              : entry.status === 'pending'
                              ? 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300'
                              : 'bg-gray-100 dark:bg-gray-600 text-gray-700 dark:text-gray-300'
                          }`}>
                            {entry.status === 'linked' && <CheckCircle className="w-3 h-3 inline mr-0.5" />}
                            {entry.status}
                          </span>
                        </div>
                        <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 mt-1">{entry.date}</p>
                        {entry.notes && (
                          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 italic truncate">Note: {entry.notes}</p>
                        )}
                      </div>
                      <div className="text-right ml-2 sm:ml-3 flex-shrink-0">
                        <p className="text-lg sm:text-xl font-bold text-blue-600 dark:text-blue-400">{entry.liters}L</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Table View - Desktop/Laptop (lg and up) */}
              <div className="hidden lg:block overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                  <thead className="bg-gray-50 dark:bg-gray-700">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-200 uppercase tracking-wider">
                        Truck Number
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-200 uppercase tracking-wider">
                        Date
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-200 uppercase tracking-wider">
                        Liters
                      </th>
                      <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-200 uppercase tracking-wider">
                        Status
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-200 uppercase tracking-wider">
                        Notes
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                    {recentEntries.map((entry, index) => (
                      <tr key={entry._id || index} className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                        <td className="px-4 py-3 whitespace-nowrap">
                          <div className="flex items-center">
                            <Truck className="w-4 h-4 mr-2 text-gray-400" />
                            <span className="font-semibold text-gray-900 dark:text-gray-100">
                              {entry.truckNo}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600 dark:text-gray-300">
                          {entry.date}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-right">
                          <div className="flex items-center justify-end">
                            <Fuel className="w-4 h-4 mr-1 text-blue-500 dark:text-blue-400" />
                            <span className="font-semibold text-blue-600 dark:text-blue-400">
                              {entry.liters}L
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-center">
                          <span className={`inline-flex items-center px-2.5 py-1 text-xs font-medium rounded-full ${
                            entry.status === 'linked' 
                              ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300' 
                              : entry.status === 'pending'
                              ? 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300'
                              : 'bg-gray-100 dark:bg-gray-600 text-gray-700 dark:text-gray-300'
                          }`}>
                            {entry.status === 'linked' && <CheckCircle className="w-3 h-3 mr-1" />}
                            {entry.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400 max-w-xs truncate">
                          {entry.notes || '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              </>
            )}
          </div>
              )}

              {activeTab === 'rejections' && (
                <div>
                  {/* Toggle for showing resolved */}
                  <div className="mb-4 flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                      Show resolved rejections
                    </span>
                    <button
                      onClick={() => setShowResolved(!showResolved)}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                        showResolved ? 'bg-green-600' : 'bg-gray-300 dark:bg-gray-600'
                      }`}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                          showResolved ? 'translate-x-6' : 'translate-x-1'
                        }`}
                      />
                    </button>
                  </div>

                  {rejectionHistory.length === 0 ? (
                    <div className="text-center py-8 sm:py-12 text-gray-500 dark:text-gray-400">
                      <CheckCircle className="w-10 h-10 sm:w-12 sm:h-12 mx-auto text-green-300 dark:text-green-600 mb-2" />
                      <p className="text-sm sm:text-base font-medium">
                        {showResolved ? 'No Resolved Rejections' : 'No Pending Rejections'}
                      </p>
                      <p className="text-xs sm:text-sm mt-1">
                        {showResolved ? 'You have fixed all rejected entries' : 'All your entries have been accepted'}
                      </p>
                    </div>
                  ) : (
                    <>
                    {/* Card View - Mobile/Tablet (below lg) */}
                    <div className="lg:hidden space-y-3">
                      {rejectionHistory.map((entry, index) => (
                        <div
                          key={entry._id || index}
                          className={`border-2 rounded-xl p-3 sm:p-4 ${
                            entry.rejectionResolved
                              ? 'border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/20'
                              : 'border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20'
                          }`}
                        >
                          <div className="flex justify-between items-start mb-2">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <p className="font-bold text-base sm:text-lg text-gray-900 dark:text-gray-100">
                                  {entry.truckNo}
                                </p>
                                {entry.rejectionResolved ? (
                                  <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 dark:bg-green-900/50 text-green-700 dark:text-green-300 font-medium flex items-center gap-1">
                                    <CheckCircle className="w-3 h-3" /> RESOLVED
                                  </span>
                                ) : (
                                  <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-300 font-medium">
                                    REJECTED
                                  </span>
                                )}
                              </div>
                              <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 mt-1">
                                {new Date(entry.rejectedAt).toLocaleDateString()} at {new Date(entry.rejectedAt).toLocaleTimeString()}
                              </p>
                            </div>
                            <div className="text-right ml-3">
                              <p className="text-lg font-bold text-red-600 dark:text-red-400">{entry.liters}L</p>
                            </div>
                          </div>
                          
                          <div className="mt-3 p-2 sm:p-3 bg-white dark:bg-gray-800 rounded-lg">
                            <p className="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                              Rejection Reason:
                            </p>
                            <p className="text-sm text-gray-900 dark:text-gray-100">
                              {entry.rejectionReason}
                            </p>
                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                              Rejected by: {entry.rejectedBy}
                            </p>
                          </div>

                          {entry.rejectionResolved ? (
                            <div className="mt-3 pt-3 border-t border-green-200 dark:border-green-800">
                              <p className="text-xs font-semibold text-green-700 dark:text-green-400 mb-1">
                                ✅ Issue Resolved
                              </p>
                              <p className="text-xs text-gray-700 dark:text-gray-300">
                                This entry was successfully corrected and linked.
                              </p>
                              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                Resolved on: {new Date(entry.rejectionResolvedAt).toLocaleDateString()} by {entry.rejectionResolvedBy}
                              </p>
                            </div>
                          ) : (
                            <div className="mt-3 pt-3 border-t border-red-200 dark:border-red-800">
                              <p className="text-xs font-semibold text-red-700 dark:text-red-400 mb-1">
                                ⚠️ Action Required:
                              </p>
                              <p className="text-xs text-gray-700 dark:text-gray-300">
                                Please re-enter this fuel dispense with the correct truck number and details.
                              </p>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>

                    {/* Table View - Desktop/Laptop (lg and up) */}
                    <div className="hidden lg:block overflow-x-auto">
                      <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                        <thead className="bg-gray-50 dark:bg-gray-700">
                          <tr>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-200 uppercase tracking-wider">
                              Truck Number
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-200 uppercase tracking-wider">
                              Rejected Date
                            </th>
                            <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-200 uppercase tracking-wider">
                              Liters
                            </th>
                            <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-200 uppercase tracking-wider">
                              Status
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-200 uppercase tracking-wider">
                              Reason
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-200 uppercase tracking-wider">
                              Rejected By
                            </th>
                          </tr>
                        </thead>
                        <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                          {rejectionHistory.map((entry, index) => (
                            <tr key={entry._id || index} className={`hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors ${
                              entry.rejectionResolved ? 'bg-green-50/50 dark:bg-green-900/10' : 'bg-red-50/50 dark:bg-red-900/10'
                            }`}>
                              <td className="px-4 py-3 whitespace-nowrap">
                                <div className="flex items-center">
                                  <Truck className="w-4 h-4 mr-2 text-gray-400" />
                                  <span className="font-semibold text-gray-900 dark:text-gray-100">
                                    {entry.truckNo}
                                  </span>
                                </div>
                              </td>
                              <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600 dark:text-gray-300">
                                {new Date(entry.rejectedAt).toLocaleDateString()}
                                <br />
                                <span className="text-xs text-gray-500 dark:text-gray-400">
                                  {new Date(entry.rejectedAt).toLocaleTimeString()}
                                </span>
                              </td>
                              <td className="px-4 py-3 whitespace-nowrap text-right">
                                <span className="font-semibold text-red-600 dark:text-red-400">
                                  {entry.liters}L
                                </span>
                              </td>
                              <td className="px-4 py-3 whitespace-nowrap text-center">
                                {entry.rejectionResolved ? (
                                  <span className="inline-flex items-center px-2.5 py-1 text-xs font-medium rounded-full bg-green-100 dark:bg-green-900/50 text-green-700 dark:text-green-300">
                                    <CheckCircle className="w-3 h-3 mr-1" /> RESOLVED
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center px-2.5 py-1 text-xs font-medium rounded-full bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-300">
                                    REJECTED
                                  </span>
                                )}
                              </td>
                              <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300 max-w-xs">
                                <div className="truncate" title={entry.rejectionReason}>
                                  {entry.rejectionReason}
                                </div>
                              </td>
                              <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400 whitespace-nowrap">
                                {entry.rejectedBy}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

export default YardFuelSimple;
