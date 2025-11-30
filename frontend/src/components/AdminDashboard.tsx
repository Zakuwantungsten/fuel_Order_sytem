import { useState, useEffect } from 'react';
import {
  Settings,
  Users,
  Fuel,
  MapPin,
  Truck,
  RefreshCw,
  Plus,
  Edit2,
  Trash2,
  Save,
  X,
  AlertTriangle,
  CheckCircle,
  DollarSign,
  Activity,
  TrendingUp,
  BarChart3,
  UserPlus,
} from 'lucide-react';
import {
  adminAPI,
  usersAPI,
  FuelStation,
  RouteConfig,
  TruckBatches,
  StandardAllocations,
  AdminStats,
} from '../services/api';
import { User } from '../types';
import CreateUserModal, { BatchTruckCreation } from './CreateUserModal';

interface AdminDashboardProps {
  user: any;
}

type TabType = 'overview' | 'stations' | 'routes' | 'trucks' | 'allocations' | 'users';

export default function AdminDashboard({ user: _user }: AdminDashboardProps) {
  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showCreateUser, setShowCreateUser] = useState(false);

  // Data states
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [fuelStations, setFuelStations] = useState<FuelStation[]>([]);
  const [routes, setRoutes] = useState<RouteConfig[]>([]);
  const [truckBatches, setTruckBatches] = useState<TruckBatches | null>(null);
  const [allocations, setAllocations] = useState<StandardAllocations | null>(null);
  const [users, setUsers] = useState<User[]>([]);

  // Edit states
  const [editingStation, setEditingStation] = useState<string | null>(null);
  const [editingRoute, setEditingRoute] = useState<string | null>(null);

  // Form states
  const [newStation, setNewStation] = useState({ id: '', name: '', location: '', pricePerLiter: 1450 });
  const [newRoute, setNewRoute] = useState({ destination: '', totalLiters: 2200 });
  const [newTruck, setNewTruck] = useState({ truckSuffix: '', extraLiters: 60, truckNumber: '' });
  const [showAddStation, setShowAddStation] = useState(false);
  const [showAddRoute, setShowAddRoute] = useState(false);
  const [showAddTruck, setShowAddTruck] = useState(false);

  // Load data based on active tab
  useEffect(() => {
    loadData();
  }, [activeTab]);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      switch (activeTab) {
        case 'overview':
          const statsData = await adminAPI.getStats();
          setStats(statsData);
          break;
        case 'stations':
          const stationsData = await adminAPI.getFuelStations();
          setFuelStations(stationsData);
          break;
        case 'routes':
          const routesData = await adminAPI.getRoutes();
          setRoutes(routesData);
          break;
        case 'trucks':
          const batchesData = await adminAPI.getTruckBatches();
          setTruckBatches(batchesData);
          break;
        case 'allocations':
          const allocData = await adminAPI.getStandardAllocations();
          setAllocations(allocData);
          break;
        case 'users':
          const usersData = await usersAPI.getAll();
          setUsers(usersData);
          break;
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const showMessage = (type: 'success' | 'error', message: string) => {
    if (type === 'success') {
      setSuccess(message);
      setTimeout(() => setSuccess(null), 3000);
    } else {
      setError(message);
      setTimeout(() => setError(null), 5000);
    }
  };

  // Station handlers
  const handleUpdateStation = async (stationId: string, data: Partial<FuelStation>) => {
    try {
      await adminAPI.updateFuelStation(stationId, data);
      setFuelStations(prev =>
        prev.map(s => (s.id === stationId ? { ...s, ...data } : s))
      );
      setEditingStation(null);
      showMessage('success', 'Station updated successfully');
    } catch (err: any) {
      showMessage('error', err.response?.data?.message || 'Failed to update station');
    }
  };

  const handleAddStation = async () => {
    if (!newStation.id || !newStation.name || !newStation.location) {
      showMessage('error', 'Please fill all fields');
      return;
    }
    try {
      const station = await adminAPI.addFuelStation(newStation);
      setFuelStations(prev => [...prev, station]);
      setNewStation({ id: '', name: '', location: '', pricePerLiter: 1450 });
      setShowAddStation(false);
      showMessage('success', 'Station added successfully');
    } catch (err: any) {
      showMessage('error', err.response?.data?.message || 'Failed to add station');
    }
  };

  // Route handlers
  const handleUpdateRoute = async (destination: string, data: Partial<RouteConfig>) => {
    try {
      await adminAPI.updateRoute(destination, data);
      setRoutes(prev =>
        prev.map(r => (r.destination === destination ? { ...r, ...data } : r))
      );
      setEditingRoute(null);
      showMessage('success', 'Route updated successfully');
    } catch (err: any) {
      showMessage('error', err.response?.data?.message || 'Failed to update route');
    }
  };

  const handleAddRoute = async () => {
    if (!newRoute.destination || !newRoute.totalLiters) {
      showMessage('error', 'Please fill all fields');
      return;
    }
    try {
      const route = await adminAPI.addRoute(newRoute);
      setRoutes(prev => [...prev, route]);
      setNewRoute({ destination: '', totalLiters: 2200 });
      setShowAddRoute(false);
      showMessage('success', 'Route added successfully');
    } catch (err: any) {
      showMessage('error', err.response?.data?.message || 'Failed to add route');
    }
  };

  const handleDeleteRoute = async (destination: string) => {
    if (!confirm(`Delete route to ${destination}?`)) return;
    try {
      await adminAPI.deleteRoute(destination);
      setRoutes(prev => prev.filter(r => r.destination !== destination));
      showMessage('success', 'Route deleted successfully');
    } catch (err: any) {
      showMessage('error', err.response?.data?.message || 'Failed to delete route');
    }
  };

  // Truck handlers
  const handleAddTruck = async () => {
    if (!newTruck.truckSuffix) {
      showMessage('error', 'Please enter truck suffix');
      return;
    }
    try {
      const batches = await adminAPI.addTruckToBatch(newTruck);
      setTruckBatches(batches);
      setNewTruck({ truckSuffix: '', extraLiters: 60, truckNumber: '' });
      setShowAddTruck(false);
      showMessage('success', 'Truck added to batch successfully');
    } catch (err: any) {
      showMessage('error', err.response?.data?.message || 'Failed to add truck');
    }
  };

  const handleRemoveTruck = async (suffix: string) => {
    if (!confirm(`Remove truck ${suffix} from batch?`)) return;
    try {
      const batches = await adminAPI.removeTruckFromBatch(suffix);
      setTruckBatches(batches);
      showMessage('success', 'Truck removed from batch');
    } catch (err: any) {
      showMessage('error', err.response?.data?.message || 'Failed to remove truck');
    }
  };

  // Allocations handlers
  const handleUpdateAllocations = async (updates: Partial<StandardAllocations>) => {
    try {
      const updated = await adminAPI.updateStandardAllocations(updates);
      setAllocations(updated);
      showMessage('success', 'Allocations updated successfully');
    } catch (err: any) {
      showMessage('error', err.response?.data?.message || 'Failed to update allocations');
    }
  };

  // User handlers
  const handleToggleUserStatus = async (userId: string) => {
    try {
      const updated = await usersAPI.toggleStatus(userId);
      setUsers(prev =>
        prev.map(u => (u.id === userId ? { ...u, isActive: updated.isActive } : u))
      );
      showMessage('success', `User ${updated.isActive ? 'activated' : 'deactivated'}`);
    } catch (err: any) {
      showMessage('error', err.response?.data?.message || 'Failed to update user');
    }
  };

  const handleResetPassword = async (userId: string) => {
    if (!confirm('Reset password for this user?')) return;
    try {
      const result = await usersAPI.resetPassword(userId);
      showMessage('success', `Password reset. Temporary password: ${result.temporaryPassword}`);
    } catch (err: any) {
      showMessage('error', err.response?.data?.message || 'Failed to reset password');
    }
  };

  const tabs = [
    { id: 'overview', label: 'Overview', icon: BarChart3 },
    { id: 'stations', label: 'Fuel Stations', icon: Fuel },
    { id: 'routes', label: 'Routes', icon: MapPin },
    { id: 'trucks', label: 'Truck Batches', icon: Truck },
    { id: 'allocations', label: 'Allocations', icon: Settings },
    { id: 'users', label: 'Users', icon: Users },
  ];

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 transition-colors">
      {/* Header */}
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                <Settings className="w-6 h-6 text-indigo-600" />
                Admin Dashboard
              </h1>
              <p className="text-sm text-gray-500 mt-1">
                Manage system configuration and settings
              </p>
            </div>
            <button
              onClick={loadData}
              disabled={loading}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>
        </div>
      </div>

      {/* Alerts */}
      {error && (
        <div className="max-w-7xl mx-auto px-4 mt-4">
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-red-600" />
            <span className="text-red-700">{error}</span>
            <button onClick={() => setError(null)} className="ml-auto">
              <X className="w-4 h-4 text-red-600" />
            </button>
          </div>
        </div>
      )}
      {success && (
        <div className="max-w-7xl mx-auto px-4 mt-4">
          <div className="bg-green-50 border border-green-200 rounded-lg p-4 flex items-center gap-2">
            <CheckCircle className="w-5 h-5 text-green-600" />
            <span className="text-green-700">{success}</span>
            <button onClick={() => setSuccess(null)} className="ml-auto">
              <X className="w-4 h-4 text-green-600" />
            </button>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="max-w-7xl mx-auto px-4 mt-6">
        <div className="bg-white rounded-lg shadow-sm border">
          <div className="border-b overflow-x-auto">
            <nav className="flex -mb-px">
              {tabs.map(tab => {
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id as TabType)}
                    className={`flex items-center gap-2 px-6 py-4 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                      activeTab === tab.id
                        ? 'border-indigo-600 text-indigo-600'
                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    {tab.label}
                  </button>
                );
              })}
            </nav>
          </div>

          {/* Tab Content */}
          <div className="p-6">
            {loading ? (
              <div className="flex items-center justify-center h-64">
                <RefreshCw className="w-8 h-8 text-indigo-600 animate-spin" />
              </div>
            ) : (
              <>
                {activeTab === 'overview' && stats && <OverviewTab stats={stats} />}
                {activeTab === 'stations' && (
                  <StationsTab
                    stations={fuelStations}
                    editing={editingStation}
                    setEditing={setEditingStation}
                    onUpdate={handleUpdateStation}
                    showAdd={showAddStation}
                    setShowAdd={setShowAddStation}
                    newStation={newStation}
                    setNewStation={setNewStation}
                    onAdd={handleAddStation}
                  />
                )}
                {activeTab === 'routes' && (
                  <RoutesTab
                    routes={routes}
                    editing={editingRoute}
                    setEditing={setEditingRoute}
                    onUpdate={handleUpdateRoute}
                    onDelete={handleDeleteRoute}
                    showAdd={showAddRoute}
                    setShowAdd={setShowAddRoute}
                    newRoute={newRoute}
                    setNewRoute={setNewRoute}
                    onAdd={handleAddRoute}
                  />
                )}
                {activeTab === 'trucks' && truckBatches && (
                  <TrucksTab
                    batches={truckBatches}
                    showAdd={showAddTruck}
                    setShowAdd={setShowAddTruck}
                    newTruck={newTruck}
                    setNewTruck={setNewTruck}
                    onAdd={handleAddTruck}
                    onRemove={handleRemoveTruck}
                  />
                )}
                {activeTab === 'allocations' && allocations && (
                  <AllocationsTab
                    allocations={allocations}
                    onUpdate={handleUpdateAllocations}
                  />
                )}
                {activeTab === 'users' && (
                  <>
                    <UsersTab
                      users={users}
                      onToggleStatus={handleToggleUserStatus}
                      onResetPassword={handleResetPassword}
                      onShowCreateUser={() => setShowCreateUser(true)}
                      onUsersCreated={loadData}
                    />
                    <CreateUserModal
                      isOpen={showCreateUser}
                      onClose={() => setShowCreateUser(false)}
                      onUserCreated={loadData}
                    />
                  </>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// Overview Tab Component
function OverviewTab({ stats }: { stats: AdminStats }) {
  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl p-6 text-white">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-blue-100 text-sm">Total Users</p>
              <p className="text-3xl font-bold">{stats.users.total}</p>
            </div>
            <Users className="w-10 h-10 text-blue-200" />
          </div>
          <p className="text-sm text-blue-100 mt-2">
            {stats.users.active} active, {stats.users.inactive} inactive
          </p>
        </div>

        <div className="bg-gradient-to-br from-green-500 to-green-600 rounded-xl p-6 text-white">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-green-100 text-sm">Delivery Orders</p>
              <p className="text-3xl font-bold">{stats.records.deliveryOrders}</p>
            </div>
            <Activity className="w-10 h-10 text-green-200" />
          </div>
        </div>

        <div className="bg-gradient-to-br from-purple-500 to-purple-600 rounded-xl p-6 text-white">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-purple-100 text-sm">LPOs</p>
              <p className="text-3xl font-bold">{stats.records.lpos}</p>
            </div>
            <DollarSign className="w-10 h-10 text-purple-200" />
          </div>
        </div>

        <div className="bg-gradient-to-br from-orange-500 to-orange-600 rounded-xl p-6 text-white">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-orange-100 text-sm">Fuel Records</p>
              <p className="text-3xl font-bold">{stats.records.fuelRecords}</p>
            </div>
            <Fuel className="w-10 h-10 text-orange-200" />
          </div>
        </div>
      </div>

      {/* Role Distribution */}
      <div className="bg-white rounded-lg border p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-indigo-600" />
          User Role Distribution
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {stats.roleDistribution.map(role => (
            <div key={role.role} className="bg-gray-50 rounded-lg p-4">
              <p className="text-sm text-gray-500 capitalize">
                {role.role.replace(/_/g, ' ')}
              </p>
              <p className="text-2xl font-bold text-gray-900">{role.count}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Recent Users */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border dark:border-gray-700 p-6 transition-colors">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
          <Users className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
          Recent Users
        </h3>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-700">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-200 uppercase">Name</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-200 uppercase">Role</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-200 uppercase">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700 bg-white dark:bg-gray-800">
              {stats.recentUsers.map((user: any) => (
                <tr key={user._id || user.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 bg-indigo-100 dark:bg-indigo-900/30 rounded-full flex items-center justify-center">
                        <span className="text-indigo-600 dark:text-indigo-400 font-medium text-sm">
                          {user.firstName?.[0]}{user.lastName?.[0]}
                        </span>
                      </div>
                      <div>
                        <p className="font-medium text-gray-900 dark:text-gray-100">{user.firstName} {user.lastName}</p>
                        <p className="text-sm text-gray-500 dark:text-gray-400">{user.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className="px-2 py-1 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded text-xs capitalize">
                      {user.role?.replace(/_/g, ' ')}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-1 rounded text-xs ${
                      user.isActive ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                    }`}>
                      {user.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// Stations Tab Component
function StationsTab({
  stations,
  editing,
  setEditing,
  onUpdate,
  showAdd,
  setShowAdd,
  newStation,
  setNewStation,
  onAdd,
}: {
  stations: FuelStation[];
  editing: string | null;
  setEditing: (id: string | null) => void;
  onUpdate: (id: string, data: Partial<FuelStation>) => void;
  showAdd: boolean;
  setShowAdd: (show: boolean) => void;
  newStation: { id: string; name: string; location: string; pricePerLiter: number };
  setNewStation: (data: { id: string; name: string; location: string; pricePerLiter: number }) => void;
  onAdd: () => void;
}) {
  const [editPrice, setEditPrice] = useState<number>(0);

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold text-gray-900">Fuel Station Rates</h3>
        <button
          onClick={() => setShowAdd(!showAdd)}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
        >
          <Plus className="w-4 h-4" />
          Add Station
        </button>
      </div>

      {/* Add Station Form */}
      {showAdd && (
        <div className="bg-gray-50 rounded-lg p-4 border">
          <h4 className="font-medium text-gray-900 mb-3">Add New Station</h4>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <input
              type="text"
              placeholder="Station ID (e.g., new_station)"
              value={newStation.id}
              onChange={e => setNewStation({ ...newStation, id: e.target.value })}
              className="px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500"
            />
            <input
              type="text"
              placeholder="Station Name"
              value={newStation.name}
              onChange={e => setNewStation({ ...newStation, name: e.target.value })}
              className="px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500"
            />
            <input
              type="text"
              placeholder="Location"
              value={newStation.location}
              onChange={e => setNewStation({ ...newStation, location: e.target.value })}
              className="px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500"
            />
            <input
              type="number"
              placeholder="Price per Liter"
              value={newStation.pricePerLiter}
              onChange={e => setNewStation({ ...newStation, pricePerLiter: Number(e.target.value) })}
              className="px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div className="flex gap-2 mt-3">
            <button
              onClick={onAdd}
              className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
            >
              <Save className="w-4 h-4 inline mr-1" />
              Save
            </button>
            <button
              onClick={() => setShowAdd(false)}
              className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Stations Table */}
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
          <thead className="bg-gray-50 dark:bg-gray-700">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-200 uppercase">Station</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-200 uppercase">Location</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-200 uppercase">Price/Liter</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-200 uppercase">Status</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-200 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-700 bg-white dark:bg-gray-800">
            {stations.map(station => (
              <tr key={station.id} className={!station.isActive ? 'bg-gray-50' : ''}>
                <td className="px-4 py-3 font-medium text-gray-900">{station.name}</td>
                <td className="px-4 py-3 text-gray-600">{station.location}</td>
                <td className="px-4 py-3">
                  {editing === station.id ? (
                    <input
                      type="number"
                      value={editPrice}
                      onChange={e => setEditPrice(Number(e.target.value))}
                      className="w-24 px-2 py-1 border rounded focus:ring-2 focus:ring-indigo-500"
                      autoFocus
                    />
                  ) : (
                    <span className="font-mono">{station.pricePerLiter.toLocaleString()}</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-1 rounded text-xs ${
                    station.isActive ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                  }`}>
                    {station.isActive ? 'Active' : 'Inactive'}
                  </span>
                </td>
                <td className="px-4 py-3">
                  {editing === station.id ? (
                    <div className="flex gap-2">
                      <button
                        onClick={() => {
                          onUpdate(station.id, { pricePerLiter: editPrice });
                        }}
                        className="p-1 text-green-600 hover:bg-green-50 rounded"
                      >
                        <Save className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setEditing(null)}
                        className="p-1 text-gray-600 hover:bg-gray-100 rounded"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <div className="flex gap-2">
                      <button
                        onClick={() => {
                          setEditing(station.id);
                          setEditPrice(station.pricePerLiter);
                        }}
                        className="p-1 text-indigo-600 hover:bg-indigo-50 rounded"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => onUpdate(station.id, { isActive: !station.isActive })}
                        className={`p-1 rounded ${
                          station.isActive ? 'text-red-600 hover:bg-red-50' : 'text-green-600 hover:bg-green-50'
                        }`}
                      >
                        {station.isActive ? <X className="w-4 h-4" /> : <CheckCircle className="w-4 h-4" />}
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// Routes Tab Component
function RoutesTab({
  routes,
  editing,
  setEditing,
  onUpdate,
  onDelete,
  showAdd,
  setShowAdd,
  newRoute,
  setNewRoute,
  onAdd,
}: {
  routes: RouteConfig[];
  editing: string | null;
  setEditing: (id: string | null) => void;
  onUpdate: (destination: string, data: Partial<RouteConfig>) => void;
  onDelete: (destination: string) => void;
  showAdd: boolean;
  setShowAdd: (show: boolean) => void;
  newRoute: { destination: string; totalLiters: number };
  setNewRoute: (data: { destination: string; totalLiters: number }) => void;
  onAdd: () => void;
}) {
  const [editLiters, setEditLiters] = useState<number>(0);

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold text-gray-900">Route Total Liters Configuration</h3>
        <button
          onClick={() => setShowAdd(!showAdd)}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
        >
          <Plus className="w-4 h-4" />
          Add Route
        </button>
      </div>

      {/* Add Route Form */}
      {showAdd && (
        <div className="bg-gray-50 rounded-lg p-4 border">
          <h4 className="font-medium text-gray-900 mb-3">Add New Route</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <input
              type="text"
              placeholder="Destination (e.g., KOLWEZI)"
              value={newRoute.destination}
              onChange={e => setNewRoute({ ...newRoute, destination: e.target.value.toUpperCase() })}
              className="px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500"
            />
            <input
              type="number"
              placeholder="Total Liters"
              value={newRoute.totalLiters}
              onChange={e => setNewRoute({ ...newRoute, totalLiters: Number(e.target.value) })}
              className="px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div className="flex gap-2 mt-3">
            <button
              onClick={onAdd}
              className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
            >
              <Save className="w-4 h-4 inline mr-1" />
              Save
            </button>
            <button
              onClick={() => setShowAdd(false)}
              className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Routes Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {routes.map(route => (
          <div
            key={route.destination}
            className={`bg-white border rounded-lg p-4 ${!route.isActive ? 'opacity-50' : ''}`}
          >
            <div className="flex items-center justify-between mb-2">
              <h4 className="font-semibold text-gray-900">{route.destination}</h4>
              <div className="flex gap-1">
                <button
                  onClick={() => {
                    if (editing === route.destination) {
                      onUpdate(route.destination, { totalLiters: editLiters });
                    } else {
                      setEditing(route.destination);
                      setEditLiters(route.totalLiters);
                    }
                  }}
                  className="p-1 text-indigo-600 hover:bg-indigo-50 rounded"
                >
                  {editing === route.destination ? <Save className="w-4 h-4" /> : <Edit2 className="w-4 h-4" />}
                </button>
                {editing === route.destination && (
                  <button
                    onClick={() => setEditing(null)}
                    className="p-1 text-gray-600 hover:bg-gray-100 rounded"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
                <button
                  onClick={() => onDelete(route.destination)}
                  className="p-1 text-red-600 hover:bg-red-50 rounded"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
            {editing === route.destination ? (
              <input
                type="number"
                value={editLiters}
                onChange={e => setEditLiters(Number(e.target.value))}
                className="w-full px-2 py-1 border rounded focus:ring-2 focus:ring-indigo-500"
                autoFocus
              />
            ) : (
              <p className="text-2xl font-bold text-indigo-600">{route.totalLiters.toLocaleString()}L</p>
            )}
            <span className={`text-xs px-2 py-1 rounded ${
              route.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700'
            }`}>
              {route.isActive ? 'Active' : 'Inactive'}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// Trucks Tab Component
function TrucksTab({
  batches,
  showAdd,
  setShowAdd,
  newTruck,
  setNewTruck,
  onAdd,
  onRemove,
}: {
  batches: TruckBatches;
  showAdd: boolean;
  setShowAdd: (show: boolean) => void;
  newTruck: { truckSuffix: string; extraLiters: number; truckNumber: string };
  setNewTruck: (data: { truckSuffix: string; extraLiters: number; truckNumber: string }) => void;
  onAdd: () => void;
  onRemove: (suffix: string) => void;
}) {
  const batchGroups = [
    { key: 'batch_100', label: '100L Extra', liters: 100, color: 'bg-green-500', trucks: batches.batch_100 },
    { key: 'batch_80', label: '80L Extra', liters: 80, color: 'bg-blue-500', trucks: batches.batch_80 },
    { key: 'batch_60', label: '60L Extra', liters: 60, color: 'bg-orange-500', trucks: batches.batch_60 },
  ];

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold text-gray-900">Truck Extra Fuel Batches</h3>
        <button
          onClick={() => setShowAdd(!showAdd)}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
        >
          <Plus className="w-4 h-4" />
          Add Truck
        </button>
      </div>

      {/* Add Truck Form */}
      {showAdd && (
        <div className="bg-gray-50 rounded-lg p-4 border">
          <h4 className="font-medium text-gray-900 mb-3">Add New Truck to Batch</h4>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <input
              type="text"
              placeholder="Truck Suffix (e.g., xyz)"
              value={newTruck.truckSuffix}
              onChange={e => setNewTruck({ ...newTruck, truckSuffix: e.target.value.toLowerCase() })}
              className="px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500"
            />
            <input
              type="text"
              placeholder="Full Truck Number (optional)"
              value={newTruck.truckNumber}
              onChange={e => setNewTruck({ ...newTruck, truckNumber: e.target.value })}
              className="px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500"
            />
            <select
              value={newTruck.extraLiters}
              onChange={e => setNewTruck({ ...newTruck, extraLiters: Number(e.target.value) })}
              className="px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500"
            >
              <option value={60}>60L Extra</option>
              <option value={80}>80L Extra</option>
              <option value={100}>100L Extra</option>
            </select>
          </div>
          <div className="flex gap-2 mt-3">
            <button
              onClick={onAdd}
              className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
            >
              <Save className="w-4 h-4 inline mr-1" />
              Save
            </button>
            <button
              onClick={() => setShowAdd(false)}
              className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Batch Groups */}
      {batchGroups.map(group => (
        <div key={group.key} className="bg-white border rounded-lg overflow-hidden">
          <div className={`${group.color} text-white px-4 py-3 flex items-center justify-between`}>
            <h4 className="font-semibold">{group.label} Batch</h4>
            <span className="text-sm opacity-90">{group.trucks.length} trucks</span>
          </div>
          <div className="p-4">
            {group.trucks.length === 0 ? (
              <p className="text-gray-500 text-sm">No trucks in this batch</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {group.trucks.map(truck => (
                  <div
                    key={truck.truckSuffix}
                    className="flex items-center gap-2 bg-gray-100 px-3 py-2 rounded-lg"
                  >
                    <Truck className="w-4 h-4 text-gray-600" />
                    <span className="font-mono font-medium uppercase">{truck.truckSuffix}</span>
                    {truck.truckNumber && (
                      <span className="text-xs text-gray-500">({truck.truckNumber})</span>
                    )}
                    <button
                      onClick={() => onRemove(truck.truckSuffix)}
                      className="p-1 text-red-600 hover:bg-red-100 rounded ml-1"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

// Allocations Tab Component
function AllocationsTab({
  allocations,
  onUpdate,
}: {
  allocations: StandardAllocations;
  onUpdate: (updates: Partial<StandardAllocations>) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [formData, setFormData] = useState(allocations);

  const fields = [
    { key: 'tangaYardToDar', label: 'Tanga Yard to DAR', description: 'Fuel allocation from Tanga Yard to Dar es Salaam' },
    { key: 'darYardStandard', label: 'DAR Yard Standard', description: 'Standard fuel allocation from DAR Yard' },
    { key: 'darYardKisarawe', label: 'DAR Yard Kisarawe', description: 'Fuel allocation for Kisarawe route' },
    { key: 'mbeyaGoing', label: 'Mbeya Going', description: 'Fuel allocation going to Mbeya' },
    { key: 'tundumaReturn', label: 'Tunduma Return', description: 'Fuel allocation for Tunduma return' },
    { key: 'mbeyaReturn', label: 'Mbeya Return', description: 'Fuel allocation for Mbeya return' },
    { key: 'moroReturnToMombasa', label: 'Moro Return to Mombasa', description: 'Fuel allocation from Moro to Mombasa' },
    { key: 'tangaReturnToMombasa', label: 'Tanga Return to Mombasa', description: 'Fuel allocation from Tanga to Mombasa' },
  ];

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold text-gray-900">Standard Fuel Allocations</h3>
        {!editing ? (
          <button
            onClick={() => {
              setFormData(allocations);
              setEditing(true);
            }}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
          >
            <Edit2 className="w-4 h-4" />
            Edit
          </button>
        ) : (
          <div className="flex gap-2">
            <button
              onClick={() => {
                onUpdate(formData);
                setEditing(false);
              }}
              className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
            >
              <Save className="w-4 h-4" />
              Save
            </button>
            <button
              onClick={() => setEditing(false)}
              className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
            >
              Cancel
            </button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {fields.map(field => (
          <div key={field.key} className="bg-white border rounded-lg p-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">{field.label}</label>
            <p className="text-xs text-gray-500 mb-2">{field.description}</p>
            {editing ? (
              <input
                type="number"
                value={(formData as any)[field.key]}
                onChange={e => setFormData({ ...formData, [field.key]: Number(e.target.value) })}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500"
              />
            ) : (
              <p className="text-2xl font-bold text-indigo-600">
                {((allocations as any)[field.key] || 0).toLocaleString()}L
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// Users Tab Component
function UsersTab({
  users,
  onToggleStatus,
  onResetPassword,
  onShowCreateUser,
  onUsersCreated,
}: {
  users: User[];
  onToggleStatus: (id: string) => void;
  onResetPassword: (id: string) => void;
  onShowCreateUser: () => void;
  onUsersCreated: () => void;
}) {
  const [filter, setFilter] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [showBatchCreate, setShowBatchCreate] = useState(false);

  const filteredUsers = users.filter(user => {
    const matchesSearch = 
      user.firstName?.toLowerCase().includes(filter.toLowerCase()) ||
      user.lastName?.toLowerCase().includes(filter.toLowerCase()) ||
      user.email?.toLowerCase().includes(filter.toLowerCase()) ||
      user.username?.toLowerCase().includes(filter.toLowerCase());
    
    const matchesRole = !roleFilter || user.role === roleFilter;
    
    return matchesSearch && matchesRole;
  });

  const uniqueRoles = [...new Set(users.map(u => u.role))].sort();

  return (
    <div className="space-y-6">
      {/* Action Buttons */}
      <div className="flex flex-wrap gap-3">
        <button
          onClick={onShowCreateUser}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
        >
          <UserPlus className="w-4 h-4" />
          Create User
        </button>
        <button
          onClick={() => setShowBatchCreate(!showBatchCreate)}
          className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
        >
          <Plus className="w-4 h-4" />
          Batch Create Drivers
        </button>
      </div>

      {/* Batch Create Section */}
      {showBatchCreate && (
        <BatchTruckCreation onUsersCreated={onUsersCreated} />
      )}

      {/* Filters */}
      <div className="flex flex-col md:flex-row gap-4">
        <input
          type="text"
          placeholder="Search users..."
          value={filter}
          onChange={e => setFilter(e.target.value)}
          className="flex-1 px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500"
        />
        <select
          value={roleFilter}
          onChange={e => setRoleFilter(e.target.value)}
          className="px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500"
        >
          <option value="">All Roles</option>
          {uniqueRoles.map(role => (
            <option key={role} value={role}>
              {role.replace(/_/g, ' ').toUpperCase()}
            </option>
          ))}
        </select>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
          <thead className="bg-gray-50 dark:bg-gray-700">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-200 uppercase">User</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-200 uppercase">Role</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-200 uppercase">Department</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-200 uppercase">Status</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-200 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-700 bg-white dark:bg-gray-800">
            {filteredUsers.map(user => (
              <tr key={user.id} className={!user.isActive ? 'bg-gray-50' : ''}>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 bg-indigo-100 rounded-full flex items-center justify-center">
                      <span className="text-indigo-600 font-medium text-sm">
                        {user.firstName?.[0]}{user.lastName?.[0]}
                      </span>
                    </div>
                    <div>
                      <p className="font-medium text-gray-900">{user.firstName} {user.lastName}</p>
                      <p className="text-sm text-gray-500">{user.email}</p>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <span className="px-2 py-1 bg-gray-100 rounded text-xs capitalize">
                    {user.role?.replace(/_/g, ' ')}
                  </span>
                </td>
                <td className="px-4 py-3 text-gray-600">{user.department || '-'}</td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-1 rounded text-xs ${
                    user.isActive ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                  }`}>
                    {user.isActive ? 'Active' : 'Inactive'}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex gap-2">
                    <button
                      onClick={() => onToggleStatus(user.id as string)}
                      className={`px-3 py-1 rounded text-xs ${
                        user.isActive
                          ? 'bg-red-100 text-red-700 hover:bg-red-200'
                          : 'bg-green-100 text-green-700 hover:bg-green-200'
                      }`}
                    >
                      {user.isActive ? 'Deactivate' : 'Activate'}
                    </button>
                    <button
                      onClick={() => onResetPassword(user.id as string)}
                      className="px-3 py-1 bg-gray-100 text-gray-700 rounded text-xs hover:bg-gray-200"
                    >
                      Reset Password
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
