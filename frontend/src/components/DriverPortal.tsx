import { useState, useEffect, useCallback, useRef } from 'react';
import { MapPin, Fuel, Bell, Navigation, Clock, ArrowRight, Info, LogOut, Sun, Moon, RefreshCw, Truck, Wifi, WifiOff, FileText, Calendar, Key, User, X } from 'lucide-react';
import { toast } from 'react-toastify';
import api from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import { lposAPI } from '../services/api';
import ChangePasswordModal from './ChangePasswordModal';

// Real-time update interval (30 seconds)
const REALTIME_UPDATE_INTERVAL = 30000;

interface LPOEntryData {
  id: string;
  date: string;
  lpoNo: string;
  station: string;
  doNo: string;
  truckNo: string;
  liters: number;
  rate: number;
  amount: number;
  destination: string;
  isCancelled?: boolean;
  isDriverAccount?: boolean;
}

interface DriverNotification {
  id: string;
  type: 'import' | 'export' | 'return' | 'fuel' | 'info';
  message: string;
  timestamp: string;
  read: boolean;
  doNo?: string;
  loadingPoint?: string;
  offloadingPoint?: string;
  destination?: string;
  station?: string;
  liters?: number;
}

interface DriverPortalProps {
  user: any;
}

export function DriverPortal({ user }: DriverPortalProps) {
  const [notifications, setNotifications] = useState<DriverNotification[]>([]);
  const [lpoEntries, setLpoEntries] = useState<LPOEntryData[]>([]);
  const [loading, setLoading] = useState(true);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const updateIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [showProfileMenu, setShowProfileMenu] = useState(false);

  const { logout, toggleTheme, isDark } = useAuth();

  const [driverData, setDriverData] = useState({
    truckNo: user.truckNo || 'N/A',
    goingDoNo: 'N/A',
    returningDoNo: 'N/A',
    goingDestination: 'N/A',
    returningDestination: 'N/A',
    loadingPoint: 'N/A',
    totalFuel: 0,
    usedFuel: 0,
    remainingFuel: 0,
    journeyPhase: 'none' as 'none' | 'going' | 'returning' | 'completed',
  });

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

  const fetchDriverData = useCallback(async (truck: string, silent: boolean = false) => {
    try {
      if (!silent) {
        setLoading(true);
      } else {
        setIsRefreshing(true);
      }

      // Fetch current journey for this truck (backend handles the logic)
      const journeyResponse = await api.get(`/delivery-orders/truck/${truck}/current-journey`);
      const journeyData = journeyResponse.data.data || {};
      
      const currentGoingDO = journeyData.goingDO;
      const currentReturningDO = journeyData.returningDO;
      const journeyDONumbers: string[] = journeyData.journeyDONumbers || [];
      const deliveryOrders = journeyData.allDeliveryOrders || [];
      const backendJourneyPhase = journeyData.journeyPhase || 'none';

      // Fetch fuel records for this truck
      const fuelResponse = await api.get(`/fuel-records?truckNo=${truck}&limit=100`);
      const fuelRecords = fuelResponse.data.data?.items || [];

      // Fetch LPO entries for this truck's CURRENT JOURNEY
      // Include:
      // 1. Entries matching current journey DOs (going/returning)
      // 2. NIL DO/destination entries (driver's account/cash) with referenceDo matching journey
      // 3. NIL entries without referenceDo (legacy entries - include all for this truck)
      let lpoEntriesData: LPOEntryData[] = [];
      try {
        // Get all LPO entries for this truck
        const response = await lposAPI.getAll({ truckNo: truck, limit: 10000 });
        const lpoData = response.data;
        
        // Filter entries for this journey
        const filteredLpoData = (lpoData || []).filter((entry: any) => {
          // Use correct field names from backend LPOEntry model
          const entryDoNo = entry.doSdo?.toString()?.trim()?.toUpperCase() || '';
          const entryDest = entry.destinations?.toString()?.trim()?.toUpperCase() || '';
          const entryReferenceDo = entry.referenceDo?.toString()?.trim()?.toUpperCase() || '';
          
          // Check if this is a NIL DO/destination entry (driver's account or cash)
          const isNilDO = entryDoNo === 'NIL' || entryDoNo === '' || entryDoNo === 'N/A';
          const isNilDest = entryDest === 'NIL' || entryDest === '' || entryDest === 'N/A';
          const isDriverAccountOrCash = entry.isDriverAccount || isNilDO || isNilDest;
          
          // NIL entries (driver's account/cash)
          if (isDriverAccountOrCash) {
            // If referenceDo exists, check if it matches current journey
            if (entryReferenceDo && journeyDONumbers.length > 0) {
              const matchesJourneyRef = journeyDONumbers.some(doNo => 
                entryReferenceDo === doNo?.toString()?.trim()?.toUpperCase()
              );
              return matchesJourneyRef;
            }
            // No referenceDo - include all NIL entries for this truck (legacy behavior)
            return true;
          }
          
          // If no journey DOs found yet, show all entries
          if (journeyDONumbers.length === 0) {
            return true;
          }
          
          // Regular entries - match by current journey DO numbers
          const matchesJourneyDO = journeyDONumbers.some(doNo => 
            entryDoNo === doNo?.toString()?.trim()?.toUpperCase()
          );
          
          return matchesJourneyDO;
        });
        
        lpoEntriesData = filteredLpoData.map((entry: any) => {
          // Use correct field names from backend LPOEntry model
          const entryDoNo = entry.doSdo?.toString()?.trim()?.toUpperCase() || '';
          const entryDest = entry.destinations?.toString()?.trim()?.toUpperCase() || '';
          const isNilDO = entryDoNo === 'NIL' || entryDoNo === '' || entryDoNo === 'N/A';
          const isNilDest = entryDest === 'NIL' || entryDest === '' || entryDest === 'N/A';
          
          return {
            id: entry._id || entry.id,
            date: entry.date,
            lpoNo: entry.lpoNo,
            station: entry.dieselAt || 'N/A',  // Backend field: dieselAt
            doNo: isNilDO ? 'NIL' : (entry.doSdo || 'N/A'),  // Backend field: doSdo
            truckNo: entry.truckNo,
            liters: entry.ltrs || 0,  // Backend field: ltrs
            rate: entry.pricePerLtr || 0,  // Backend field: pricePerLtr
            amount: (entry.ltrs || 0) * (entry.pricePerLtr || 0),
            destination: isNilDest ? 'NIL' : (entry.destinations || 'N/A'),  // Backend field: destinations
            isCancelled: entry.isCancelled,
            isDriverAccount: entry.isDriverAccount || isNilDO, // Mark NIL DO as driver account type
          };
        });
        
        // Sort by date descending (newest first)
        lpoEntriesData.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        setLpoEntries(lpoEntriesData);
      } catch (lpoError) {
        console.error('Failed to fetch LPO entries:', lpoError);
        setLpoEntries([]);
      }

      // Check if driver has any assignments
      if (deliveryOrders.length === 0 && fuelRecords.length === 0 && lpoEntriesData.length === 0) {
        // No assignments yet
        setNotifications([{
          id: 'no-assignment',
          type: 'info',
          message: 'You have not been assigned any trips yet. Please check back later or contact dispatch.',
          timestamp: new Date().toISOString(),
          read: false,
        }]);
        setDriverData({
          truckNo: truck,
          goingDoNo: 'N/A',
          returningDoNo: 'N/A',
          goingDestination: 'N/A',
          returningDestination: 'N/A',
          loadingPoint: 'N/A',
          totalFuel: 0,
          usedFuel: 0,
          remainingFuel: 0,
          journeyPhase: 'none',
        });
        setLastUpdated(new Date());
        return;
      }

      // Process delivery orders into notifications (only current journey)
      const currentJourneyDOs = [currentGoingDO, currentReturningDO].filter(Boolean);
      const doNotifications: DriverNotification[] = currentJourneyDOs.map((order: any) => {
        let type: 'import' | 'export' | 'return' | 'info' = 'info';
        let message = '';

        if (order.importOrExport === 'IMPORT') {
          type = 'import';
          message = `🟢 GOING: Load at ${order.loadingPoint}, deliver to ${order.destination}`;
        } else if (order.importOrExport === 'EXPORT') {
          type = 'export';
          message = `🔵 RETURNING: Load at ${order.loadingPoint}, deliver to ${order.destination}`;
        }

        // Check for return DO (if there's a border entry or specific offloading point)
        if (order.borderEntryDRC || (order.offloadingPoint && order.offloadingPoint !== order.destination)) {
          type = 'return';
          const offloadPoint = order.offloadingPoint || order.borderEntryDRC || 'border';
          message = `🟠 RETURN: Offload at ${offloadPoint}, then reload and proceed to ${order.destination}`;
        }

        return {
          id: order._id,
          type,
          message,
          timestamp: order.date,
          read: false,
          doNo: order.doNumber,
          loadingPoint: order.loadingPoint,
          offloadingPoint: order.offloadingPoint || order.destination,
          destination: order.destination,
        };
      });

      // Process fuel records into notifications
      const fuelNotifications: DriverNotification[] = fuelRecords.slice(0, 5).map((record: any) => ({
        id: `fuel-${record._id}`,
        type: 'fuel' as const,
        message: `⛽ Fuel Order: ${record.liters}L at ${record.fuelStation}`,
        timestamp: record.date,
        read: false,
        station: record.fuelStation,
        liters: record.liters,
        doNo: record.doNo,
      }));

      // Combine and sort notifications by date
      const allNotifications = [...doNotifications, ...fuelNotifications].sort(
        (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      );

      setNotifications(allNotifications);

      // Use journey phase from backend (already computed)
      const journeyPhase = backendJourneyPhase as 'none' | 'going' | 'returning' | 'completed';

      // Update driver data from current journey DOs
      // Calculate fuel data from LPO entries for current journey
      const totalFuel = lpoEntriesData.reduce((sum, e) => sum + (e.liters || 0), 0);
      const usedFuel = lpoEntriesData
        .filter(e => !e.isCancelled)
        .reduce((sum, e) => sum + (e.liters || 0), 0);

      setDriverData({
        truckNo: truck,
        goingDoNo: currentGoingDO?.doNumber || 'N/A',
        returningDoNo: currentReturningDO?.doNumber || 'N/A',
        goingDestination: currentGoingDO?.destination || 'N/A',
        returningDestination: currentReturningDO?.destination || 'N/A',
        loadingPoint: currentGoingDO?.loadingPoint || currentReturningDO?.loadingPoint || 'N/A',
        totalFuel: totalFuel,
        usedFuel: usedFuel,
        remainingFuel: totalFuel - usedFuel,
        journeyPhase,
      });
      
      setLastUpdated(new Date());
    } catch (error: any) {
      console.error('Failed to fetch driver data:', error);
      if (!silent) {
        toast.error('Failed to load driver information');
      }
    } finally {
      if (!silent) {
        setLoading(false);
      } else {
        setIsRefreshing(false);
      }
    }
  }, []);

  useEffect(() => {
    const activeTruckNo = user.truckNo;
    
    if (activeTruckNo) {
      fetchDriverData(activeTruckNo);
      
      // Set up real-time polling
      updateIntervalRef.current = setInterval(() => {
        if (isOnline) {
          fetchDriverData(activeTruckNo, true);
        }
      }, REALTIME_UPDATE_INTERVAL);
      
      return () => {
        if (updateIntervalRef.current) {
          clearInterval(updateIntervalRef.current);
        }
      };
    } else {
      setLoading(false);
    }
  }, [user.truckNo, fetchDriverData, isOnline]);

  const handleManualRefresh = () => {
    if (user.truckNo && isOnline) {
      fetchDriverData(user.truckNo, true);
    }
  };

  const handleLogout = () => {
    if (window.confirm('Are you sure you want to logout?')) {
      logout();
    }
  };

  const handlePasswordChangeSuccess = () => {
    setSuccessMessage('Password changed successfully!');
    setTimeout(() => setSuccessMessage(''), 3000);
  };

  const markNotificationRead = (id: string) => {
    setNotifications(prev =>
      prev.map(n => (n.id === id ? { ...n, read: true } : n))
    );
  };

  const unreadCount = notifications.filter(n => !n.read).length;

  // Check if truck number is missing
  if (!user.truckNo) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 transition-colors">
        {/* Header - Fixed */}
        <div className="bg-indigo-600 text-white p-4 shadow-md sticky top-0 z-10">
          <div className="max-w-2xl mx-auto flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold">Driver Portal</h1>
              <p className="text-sm opacity-90">{user.firstName} {user.lastName}</p>
            </div>
            <div className="flex items-center space-x-2">
              <button
                onClick={toggleTheme}
                className="p-2 rounded-full bg-indigo-500 hover:bg-indigo-400 transition-colors"
                title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
              >
                {isDark ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
              </button>
            </div>
          </div>
        </div>
        
        <div className="flex items-center justify-center p-4" style={{ minHeight: 'calc(100vh - 80px)' }}>
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 max-w-md w-full transition-colors">
            <div className="text-center">
              <Info className="w-16 h-16 text-yellow-500 mx-auto mb-4" />
              <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-2">Truck Number Required</h3>
              <p className="text-gray-600 dark:text-gray-400 mb-4">
                Your account doesn't have a truck number assigned. Please contact your supervisor to set up your truck number.
              </p>
              <div className="text-sm text-gray-500 dark:text-gray-400">
                User: {user.firstName} {user.lastName}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (loading && notifications.length === 0) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 transition-colors">
        {/* Header - Fixed */}
        <div className="bg-indigo-600 text-white p-4 shadow-md sticky top-0 z-10">
          <div className="max-w-2xl mx-auto flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold">Driver Portal</h1>
              <p className="text-sm opacity-90">{user.firstName} {user.lastName}</p>
            </div>
            <div className="flex items-center space-x-2">
              <button
                onClick={toggleTheme}
                className="p-2 rounded-full bg-indigo-500 hover:bg-indigo-400 transition-colors"
                title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
              >
                {isDark ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
              </button>
            </div>
          </div>
        </div>
        
        <div className="flex items-center justify-center p-4" style={{ minHeight: 'calc(100vh - 80px)' }}>
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 dark:border-indigo-400 mx-auto mb-4"></div>
            <p className="text-gray-600 dark:text-gray-400">Loading your information...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 pb-6 transition-colors">
      {/* Header - Fixed */}
      <div className="bg-indigo-600 text-white p-3 sm:p-4 shadow-md sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-2 sm:px-0">
          <div className="flex items-center gap-2">
            <div className="min-w-0 flex-1">
              <h1 className="text-lg sm:text-xl font-bold flex items-center">
                <Truck className="w-4 h-4 sm:w-5 sm:h-5 mr-1 sm:mr-2 flex-shrink-0" />
                <span className="truncate">Driver Portal</span>
              </h1>
              <p className="text-xs sm:text-sm opacity-90 truncate">{driverData.truckNo}</p>
            </div>
            <div className="flex items-center space-x-1 sm:space-x-2 flex-shrink-0">
              {/* Connection Status - Hidden on very small screens */}
              <div className={`hidden xs:block p-1.5 sm:p-2 rounded-full ${isOnline ? 'bg-green-500' : 'bg-red-500'}`} title={isOnline ? 'Online' : 'Offline'}>
                {isOnline ? <Wifi className="w-3 h-3 sm:w-4 sm:h-4" /> : <WifiOff className="w-3 h-3 sm:w-4 sm:h-4" />}
              </div>
              {/* Refresh Button */}
              <button
                onClick={handleManualRefresh}
                disabled={isRefreshing || !isOnline}
                className={`p-1.5 sm:p-2 rounded-full bg-indigo-500 hover:bg-indigo-400 transition-colors ${isRefreshing ? 'animate-spin' : ''}`}
                title="Refresh data"
              >
                <RefreshCw className="w-4 h-4 sm:w-5 sm:h-5" />
              </button>
              {/* Theme Toggle - Now visible on mobile */}
              <button
                onClick={toggleTheme}
                className="p-1.5 sm:p-2 rounded-full bg-indigo-500 hover:bg-indigo-400 transition-colors"
                title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
              >
                {isDark ? <Sun className="w-4 h-4 sm:w-5 sm:h-5" /> : <Moon className="w-4 h-4 sm:w-5 sm:h-5" />}
              </button>
              {/* Profile Menu with Account Actions */}
              <div className="relative">
                <button
                  onClick={() => setShowProfileMenu(!showProfileMenu)}
                  className="p-1.5 sm:p-2 rounded-full bg-indigo-500 hover:bg-indigo-400 transition-colors"
                  title="Profile Menu"
                >
                  <User className="w-5 h-5 sm:w-5 sm:h-5" />
                </button>
                
                {showProfileMenu && (
                  <>
                    <div className="fixed inset-0 z-[100]" onClick={() => setShowProfileMenu(false)} />
                    <div className="absolute right-0 mt-2 w-48 bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 py-2 z-[110]">
                      <div className="px-4 py-2 border-b border-gray-200 dark:border-gray-700">
                        <p className="text-xs text-gray-500 dark:text-gray-400">Signed in as</p>
                        <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{driverData.truckNo}</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{user.firstName} {user.lastName}</p>
                      </div>

                      <button
                        onClick={() => {
                          setShowProfileMenu(false);
                          setShowChangePassword(true);
                        }}
                        className="w-full flex items-center px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
                      >
                        <Key className="w-4 h-4 mr-3" />
                        Change Password
                      </button>
                      <div className="border-t border-gray-200 dark:border-gray-700 my-1"></div>
                      <button
                        onClick={() => {
                          setShowProfileMenu(false);
                          handleLogout();
                        }}
                        className="w-full flex items-center px-4 py-2 text-sm text-red-700 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20"
                      >
                        <LogOut className="w-4 h-4 mr-3" />
                        Sign Out
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
          {/* Last Updated */}
          {lastUpdated && (
            <p className="text-xs opacity-75 mt-1">
              Last updated: {lastUpdated.toLocaleTimeString()}
            </p>
          )}
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-2xl mx-auto p-3 sm:p-4">
        {/* Truck Info Card - Current Journey */}
        <div className="bg-gradient-to-br from-indigo-500 to-indigo-600 rounded-lg shadow-lg p-3 sm:p-4 md:p-6 text-white mb-3 sm:mb-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-4 space-y-2 sm:space-y-0">
            <div>
              <div className="text-sm opacity-90">Your Truck</div>
              <div className="text-xl sm:text-2xl font-bold">{driverData.truckNo}</div>
              {/* Journey Phase Indicator */}
              <div className="mt-1">
                {driverData.journeyPhase === 'going' && (
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-500 text-white">
                    🟢 Going to Destination
                  </span>
                )}
                {driverData.journeyPhase === 'returning' && (
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-500 text-white">
                    🔵 Returning Journey
                  </span>
                )}
                {driverData.journeyPhase === 'none' && (
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-500 text-white">
                    ⏳ Awaiting Assignment
                  </span>
                )}
              </div>
            </div>
            <div className="sm:text-right">
              <div className="text-sm opacity-90">Loading Point</div>
              <div className="text-lg sm:text-xl font-bold">{driverData.loadingPoint}</div>
            </div>
          </div>

          {/* Going & Returning DO Info */}
          <div className="grid grid-cols-2 gap-4 mt-4 pt-4 border-t border-indigo-400">
            <div className={`rounded-lg p-3 ${driverData.journeyPhase === 'going' ? 'bg-green-500/40 ring-2 ring-green-300' : 'bg-indigo-400/30'}`}>
              <div className="text-xs opacity-75 mb-1">🟢 GOING</div>
              <div className="text-sm font-semibold">DO: {driverData.goingDoNo}</div>
              <div className="text-xs opacity-90">→ {driverData.goingDestination}</div>
            </div>
            <div className={`rounded-lg p-3 ${driverData.journeyPhase === 'returning' ? 'bg-blue-500/40 ring-2 ring-blue-300' : 'bg-indigo-400/30'}`}>
              <div className="text-xs opacity-75 mb-1">🔵 RETURNING</div>
              <div className="text-sm font-semibold">DO: {driverData.returningDoNo}</div>
              <div className="text-xs opacity-90">→ {driverData.returningDestination}</div>
            </div>
          </div>
        </div>

        {/* Fuel Status - Mobile Responsive Grid */}
        <div className="grid grid-cols-3 gap-3 mb-4">
          <div className="bg-white dark:bg-gray-800 p-3 sm:p-4 rounded-lg shadow transition-colors">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs sm:text-sm text-gray-600 dark:text-gray-400">Total Fuel</div>
                <div className="text-lg sm:text-xl font-bold text-gray-900 dark:text-gray-100">{driverData.totalFuel}L</div>
              </div>
              <Fuel className="w-6 h-6 sm:w-8 sm:h-8 text-blue-500" />
            </div>
          </div>
          
          <div className="bg-white dark:bg-gray-800 p-3 sm:p-4 rounded-lg shadow transition-colors">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs sm:text-sm text-gray-600 dark:text-gray-400">Used</div>
                <div className="text-lg sm:text-xl font-bold text-gray-900 dark:text-gray-100">{driverData.usedFuel}L</div>
              </div>
              <Fuel className="w-6 h-6 sm:w-8 sm:h-8 text-orange-500" />
            </div>
          </div>
          
          <div className="bg-white dark:bg-gray-800 p-3 sm:p-4 rounded-lg shadow transition-colors">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs sm:text-sm text-gray-600 dark:text-gray-400">Remaining</div>
                <div className="text-lg sm:text-xl font-bold text-gray-900 dark:text-gray-100">{driverData.remainingFuel}L</div>
              </div>
              <Fuel className="w-6 h-6 sm:w-8 sm:h-8 text-green-500" />
            </div>
          </div>
        </div>

        {/* Notifications */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden mb-4 transition-colors">
          <div className="bg-gradient-to-r from-indigo-50 to-blue-50 dark:from-indigo-900/30 dark:to-blue-900/30 px-4 sm:px-6 py-3 sm:py-4 border-b dark:border-gray-700">
            <h3 className="text-base sm:text-lg font-semibold text-gray-900 dark:text-gray-100 flex items-center">
              <Bell className="w-4 h-4 sm:w-5 sm:h-5 mr-2 text-indigo-600 dark:text-indigo-400" />
              Notifications & Orders
              {unreadCount > 0 && (
                <span className="ml-2 sm:ml-3 bg-red-500 text-white text-xs px-2 py-0.5 sm:py-1 rounded-full font-bold">
                  {unreadCount} New
                </span>
              )}
            </h3>
          </div>
          <div className="divide-y dark:divide-gray-700 max-h-72 sm:max-h-96 overflow-y-auto">
          {notifications.length === 0 ? (
            <div className="p-6 sm:p-8 text-center">
              <Info className="w-10 h-10 sm:w-12 sm:h-12 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
              <p className="text-gray-500 dark:text-gray-400 text-sm sm:text-base">No notifications yet</p>
            </div>
          ) : (
            notifications.map((notification) => (
              <div
                key={notification.id}
                onClick={() => markNotificationRead(notification.id)}
                className={`p-3 sm:p-4 cursor-pointer transition-colors hover:bg-gray-50 dark:hover:bg-gray-700 ${
                  notification.read ? 'bg-white dark:bg-gray-800' : 'bg-blue-50 dark:bg-blue-900/20'
                }`}
              >
                <div className="flex items-start space-x-2 sm:space-x-3">
                  <div
                    className={`w-8 h-8 sm:w-10 sm:h-10 rounded-full flex items-center justify-center flex-shrink-0 ${
                      notification.type === 'import'
                        ? 'bg-green-100 dark:bg-green-900/30'
                        : notification.type === 'export'
                        ? 'bg-blue-100 dark:bg-blue-900/30'
                        : notification.type === 'return'
                        ? 'bg-orange-100 dark:bg-orange-900/30'
                        : notification.type === 'fuel'
                        ? 'bg-yellow-100 dark:bg-yellow-900/30'
                        : 'bg-gray-100 dark:bg-gray-700'
                    }`}
                  >
                    {notification.type === 'import' || notification.type === 'export' ? (
                      <Navigation
                        className={`w-4 h-4 sm:w-5 sm:h-5 ${
                          notification.type === 'import' ? 'text-green-600' : 'text-blue-600'
                        }`}
                      />
                    ) : notification.type === 'return' ? (
                      <ArrowRight className="w-4 h-4 sm:w-5 sm:h-5 text-orange-600" />
                    ) : notification.type === 'fuel' ? (
                      <Fuel className="w-4 h-4 sm:w-5 sm:h-5 text-yellow-600" />
                    ) : (
                      <Info className="w-4 h-4 sm:w-5 sm:h-5 text-gray-600" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <span
                        className={`text-xs font-semibold px-1.5 sm:px-2 py-0.5 sm:py-1 rounded ${
                          notification.type === 'import'
                            ? 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300'
                            : notification.type === 'export'
                            ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300'
                            : notification.type === 'return'
                            ? 'bg-orange-100 dark:bg-orange-900/30 text-orange-800 dark:text-orange-300'
                            : notification.type === 'fuel'
                            ? 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-300'
                            : 'bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-300'
                        }`}
                      >
                        {notification.type.toUpperCase()}
                      </span>
                      {!notification.read && (
                        <span className="w-2 h-2 bg-blue-600 rounded-full"></span>
                      )}
                    </div>
                    <p className="text-xs sm:text-sm text-gray-900 dark:text-gray-100 font-medium mb-1">
                      {notification.message}
                    </p>
                    {notification.doNo && (
                      <div className="text-xs text-gray-600 dark:text-gray-400 mb-1">
                        DO: <span className="font-semibold">{notification.doNo}</span>
                      </div>
                    )}
                    <div className="flex items-center text-xs text-gray-500 dark:text-gray-400">
                      <Clock className="w-3 h-3 mr-1" />
                      {new Date(notification.timestamp).toLocaleString()}
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

        {/* LPO Entries / Fuel Orders */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow transition-colors">
          <div className="bg-gradient-to-r from-indigo-50 to-blue-50 dark:from-indigo-900/30 dark:to-blue-900/30 px-4 sm:px-6 py-3 sm:py-4 border-b dark:border-gray-700">
            <h3 className="text-base sm:text-lg font-semibold text-gray-900 dark:text-gray-100 flex items-center">
              <FileText className="w-4 h-4 sm:w-5 sm:h-5 mr-2 text-indigo-600 dark:text-indigo-400" />
              Fuel Orders / LPOs
              <span className="ml-2 sm:ml-3 bg-indigo-500 text-white text-xs px-2 py-0.5 sm:py-1 rounded-full font-bold">
                {lpoEntries.length}
              </span>
            </h3>
          </div>

          <div className="p-4 sm:p-6 max-h-96 overflow-y-auto">
            <div className="space-y-3 sm:space-y-4">
              {lpoEntries.length === 0 ? (
                <div className="text-center py-8">
                  <Fuel className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
                  <p className="text-gray-500 dark:text-gray-400 text-sm">No fuel orders yet</p>
                  <p className="text-gray-400 dark:text-gray-500 text-xs mt-1">LPO entries will appear here once created</p>
                </div>
              ) : (
                lpoEntries.map((entry) => (
                  <div 
                    key={entry.id} 
                    className={`p-3 sm:p-4 rounded-lg border transition-colors ${
                      entry.isCancelled
                        ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'
                        : entry.isDriverAccount
                        ? 'bg-orange-50 dark:bg-orange-900/20 border-orange-200 dark:border-orange-800'
                        : 'bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 border-gray-200 dark:border-gray-700'
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-start space-x-3 sm:space-x-4">
                        <div className={`w-10 h-10 sm:w-12 sm:h-12 rounded-full flex items-center justify-center flex-shrink-0 ${
                          entry.isCancelled
                            ? 'bg-red-500'
                            : entry.isDriverAccount
                            ? 'bg-orange-500'
                            : 'bg-blue-500'
                        }`}>
                          {entry.isCancelled ? (
                            <span className="text-white text-xs font-bold">X</span>
                          ) : (
                            <MapPin className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center flex-wrap gap-1">
                            <div className="font-semibold text-gray-900 dark:text-gray-100 text-sm sm:text-base">{entry.station}</div>
                            {entry.isCancelled && (
                              <span className="text-xs bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 px-1.5 py-0.5 rounded">
                                CANCELLED
                              </span>
                            )}
                            {entry.isDriverAccount && (
                              <span className="text-xs bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400 px-1.5 py-0.5 rounded">
                                DRIVER ACC
                              </span>
                            )}
                            {(entry.doNo === 'NIL' || entry.doNo === 'N/A' || !entry.doNo) && !entry.isDriverAccount && (
                              <span className="text-xs bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400 px-1.5 py-0.5 rounded">
                                CASH
                              </span>
                            )}
                          </div>
                          <div className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 mt-0.5">
                            <span className="font-medium">{entry.liters}L</span> @ {entry.rate} = <span className="font-medium">KES {entry.amount?.toLocaleString()}</span>
                          </div>
                          <div className="text-xs text-gray-500 dark:text-gray-500 mt-0.5">
                            LPO: <span className="font-medium">{entry.lpoNo}</span> • DO: <span className={`font-medium ${entry.doNo === 'NIL' ? 'text-orange-500' : ''}`}>{entry.doNo}</span>
                          </div>
                          <div className="text-xs text-gray-500 dark:text-gray-500">
                            Dest: <span className={entry.destination === 'NIL' ? 'text-orange-500' : ''}>{entry.destination}</span>
                          </div>
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <div className="flex items-center text-xs text-gray-500 dark:text-gray-400">
                          <Calendar className="w-3 h-3 mr-1" />
                          {new Date(entry.date).toLocaleDateString()}
                        </div>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Change Password Modal */}
      {showChangePassword && (
        <ChangePasswordModal
          onClose={() => setShowChangePassword(false)}
          onSuccess={handlePasswordChangeSuccess}
        />
      )}

      {/* Success Message */}
      {successMessage && (
        <div className="fixed top-4 right-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 text-green-800 dark:text-green-200 px-6 py-3 rounded-lg shadow-lg z-50 flex items-center space-x-3">
          <span>{successMessage}</span>
          <button onClick={() => setSuccessMessage('')} className="text-green-600 dark:text-green-400 hover:text-green-800 dark:hover:text-green-200">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
}

export default DriverPortal;