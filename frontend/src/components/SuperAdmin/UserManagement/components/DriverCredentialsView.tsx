import { useState, useEffect, useCallback, useMemo } from 'react';
import { toast } from 'react-toastify';
import {
  Truck, Shield, Activity, Clock, Search, RefreshCw,
  Loader2, Power, PowerOff, Phone, User as UserIcon,
} from 'lucide-react';
import apiClient from '../../../../services/api';
import Pagination from '../../../Pagination';
import type { DriverCredential, DriverCredentialStats } from '../types';
import StatCard from './StatCard';

// ── Stat gradients for driver section ────────────────────────────────────────
const DRIVER_GRADIENTS = {
  total:    'from-indigo-500 to-blue-600',
  active:   'from-emerald-500 to-green-600',
  recent:   'from-violet-500 to-purple-600',
  inactive: 'from-red-500 to-rose-600',
} as const;

const LIMIT = 25;

export default function DriverCredentialsView() {
  // ── State ──────────────────────────────────────────────────────────────
  const [stats, setStats] = useState<DriverCredentialStats | null>(null);
  const [drivers, setDrivers] = useState<DriverCredential[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');

  // ── Debounced search ──────────────────────────────────────────────────
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  // ── Fetch data ────────────────────────────────────────────────────────
  const fetchData = useCallback(async (p = page) => {
    setLoading(true);
    try {
      const [credRes, statsRes] = await Promise.all([
        apiClient.get('/driver-credentials', {
          params: { search: debouncedSearch || undefined, page: p, limit: LIMIT },
        }),
        apiClient.get('/driver-credentials/stats'),
      ]);
      const creds: DriverCredential[] = credRes.data.data?.data || credRes.data.data || [];
      setDrivers(creds);
      setTotalItems(credRes.data.data?.pagination?.total || 0);
      setTotalPages(credRes.data.data?.pagination?.totalPages || 1);
      setStats(statsRes.data.data);
    } catch {
      toast.error('Failed to load driver credentials');
    } finally {
      setLoading(false);
    }
  }, [page, debouncedSearch]);

  useEffect(() => { fetchData(page); }, [page, debouncedSearch, fetchData]);

  // ── Toggle action ─────────────────────────────────────────────────────
  const handleToggle = useCallback(async (driverId: string, truckNo: string, action: 'reactivate' | 'deactivate') => {
    setActionLoading(driverId);
    try {
      await apiClient.put(`/driver-credentials/${driverId}/${action}`);
      toast.success(`${truckNo} ${action}d successfully`);
      fetchData(page);
    } catch {
      toast.error(`Failed to ${action} ${truckNo}`);
    } finally {
      setActionLoading(null);
    }
  }, [fetchData, page]);

  // ── Filtered drivers ──────────────────────────────────────────────────
  const filteredDrivers = useMemo(() => {
    if (statusFilter === 'all') return drivers;
    return drivers.filter(d => statusFilter === 'active' ? d.isActive : !d.isActive);
  }, [drivers, statusFilter]);

  // ── Render ────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* Stat Cards */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard label="Total Trucks"       value={stats.totalDrivers}    icon={Truck}    gradient={DRIVER_GRADIENTS.total} />
          <StatCard label="Active Credentials" value={stats.activeDrivers}   icon={Shield}   gradient={DRIVER_GRADIENTS.active} />
          <StatCard label="Active (Last 7d)"   value={stats.recentLogins}    icon={Activity}  gradient={DRIVER_GRADIENTS.recent} />
          <StatCard label="Inactive"           value={stats.inactiveDrivers} icon={Clock}     gradient={DRIVER_GRADIENTS.inactive} />
        </div>
      )}

      {/* Toolbar */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 shadow-sm">
        <div className="flex flex-col sm:flex-row gap-3">
          {/* Search */}
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search by truck number or driver name..."
              aria-label="Search driver credentials"
              className="w-full pl-10 pr-4 py-2.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:ring-2 focus:ring-indigo-500 focus:outline-none transition-colors"
            />
          </div>

          {/* Status filter */}
          <div className="flex items-center gap-1 bg-gray-100 dark:bg-gray-700 rounded-lg p-1" role="radiogroup" aria-label="Filter by status">
            {(['all', 'active', 'inactive'] as const).map(s => (
              <button
                key={s}
                role="radio"
                aria-checked={statusFilter === s}
                onClick={() => setStatusFilter(s)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors capitalize ${
                  statusFilter === s
                    ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-gray-100 shadow-sm'
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                }`}
              >
                {s}
              </button>
            ))}
          </div>

          {/* Refresh */}
          <button
            onClick={() => fetchData(page)}
            disabled={loading}
            aria-label="Refresh"
            className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Refresh</span>
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3" role="status" aria-live="polite">
            <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
            <p className="text-sm text-gray-500 dark:text-gray-400">Loading driver credentials...</p>
          </div>
        ) : filteredDrivers.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <div className="w-14 h-14 bg-gray-100 dark:bg-gray-700 rounded-full flex items-center justify-center">
              <Truck className="w-7 h-7 text-gray-400 dark:text-gray-500" />
            </div>
            <p className="text-sm font-medium text-gray-500 dark:text-gray-400">No driver credentials found</p>
            <p className="text-xs text-gray-400 dark:text-gray-500">
              {search ? 'Try adjusting your search terms' : 'No credentials have been created yet'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700" aria-label="Driver credentials">
              <thead>
                <tr className="bg-gray-50 dark:bg-gray-900/50">
                  <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Truck / Driver</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Contact</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Status</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Last Login</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Created</th>
                  <th className="px-5 py-3 text-right text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {filteredDrivers.map(driver => (
                  <tr key={driver._id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                    {/* Truck / Driver */}
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-3">
                        <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${
                          driver.isActive
                            ? 'bg-emerald-100 dark:bg-emerald-900/30'
                            : 'bg-gray-100 dark:bg-gray-700'
                        }`}>
                          <Truck className={`w-4.5 h-4.5 ${
                            driver.isActive
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : 'text-gray-400 dark:text-gray-500'
                          }`} />
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{driver.truckNo}</p>
                          {driver.driverName ? (
                            <p className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1">
                              <UserIcon className="w-3 h-3" /> {driver.driverName}
                            </p>
                          ) : (
                            <p className="text-xs text-gray-400 dark:text-gray-500 italic">No driver assigned</p>
                          )}
                        </div>
                      </div>
                    </td>

                    {/* Contact */}
                    <td className="px-5 py-3.5">
                      {driver.phoneNumber ? (
                        <span className="text-sm text-gray-700 dark:text-gray-300 flex items-center gap-1.5">
                          <Phone className="w-3.5 h-3.5 text-gray-400" /> {driver.phoneNumber}
                        </span>
                      ) : (
                        <span className="text-xs text-gray-400 dark:text-gray-500">--</span>
                      )}
                    </td>

                    {/* Status */}
                    <td className="px-5 py-3.5">
                      {driver.isActive ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-full bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400">
                          <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full" />
                          Active
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-full bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400">
                          <span className="w-1.5 h-1.5 bg-gray-400 rounded-full" />
                          Inactive
                        </span>
                      )}
                    </td>

                    {/* Last Login */}
                    <td className="px-5 py-3.5 text-sm text-gray-600 dark:text-gray-400">
                      {driver.lastLogin
                        ? new Date(driver.lastLogin).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
                        : <span className="text-gray-400 dark:text-gray-500">Never</span>
                      }
                    </td>

                    {/* Created */}
                    <td className="px-5 py-3.5 text-sm text-gray-600 dark:text-gray-400">
                      {new Date(driver.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                    </td>

                    {/* Actions */}
                    <td className="px-5 py-3.5">
                      <div className="flex items-center justify-end">
                        {driver.isActive ? (
                          <button
                            onClick={() => handleToggle(driver._id, driver.truckNo, 'deactivate')}
                            disabled={actionLoading === driver._id}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-800 hover:bg-red-100 dark:hover:bg-red-900/40 transition-colors disabled:opacity-50"
                          >
                            {actionLoading === driver._id
                              ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              : <PowerOff className="w-3.5 h-3.5" />
                            }
                            Deactivate
                          </button>
                        ) : (
                          <button
                            onClick={() => handleToggle(driver._id, driver.truckNo, 'reactivate')}
                            disabled={actionLoading === driver._id}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800 hover:bg-emerald-100 dark:hover:bg-emerald-900/40 transition-colors disabled:opacity-50"
                          >
                            {actionLoading === driver._id
                              ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              : <Power className="w-3.5 h-3.5" />
                            }
                            Reactivate
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="border-t border-gray-200 dark:border-gray-700">
            <Pagination
              currentPage={page}
              totalPages={totalPages}
              totalItems={totalItems}
              itemsPerPage={LIMIT}
              onPageChange={setPage}
              showItemsPerPage={false}
            />
          </div>
        )}
      </div>
    </div>
  );
}
