import { useState, useEffect, useCallback } from 'react';
import { useRealtimeSync } from '../../hooks/useRealtimeSync';
import ConfirmModal from './ConfirmModal';
import Pagination from '../Pagination';
import {
  TrendingUp, TrendingDown, DollarSign, Clock, Plus, RefreshCw,
  X, CheckCircle, Edit3, ChevronDown, ChevronUp, Zap,
} from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend,
} from 'recharts';
import fuelPriceService, {
  FuelStation, FuelPriceHistoryEntry, FuelPriceScheduleEntry,
} from '../../services/fuelPriceService';

interface Props {
  onMessage: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

const PALETTE = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#f97316', '#84cc16'];

function stationColor(id: string, stations: FuelStation[]): string {
  const idx = stations.findIndex((s) => s.id === id);
  return PALETTE[idx >= 0 ? idx % PALETTE.length : 0];
}

function formatPrice(p: number, currency?: 'USD' | 'TZS') {
  if (currency === 'USD') return `$${p.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  return `TZS ${p.toLocaleString('en-TZ', { maximumFractionDigits: 0 })}`;
}

function formatDate(d: string) {
  return new Date(d).toLocaleString('en-GB', {
    year: 'numeric', month: 'short', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  });
}

function timeUntil(d: string) {
  const diff = new Date(d).getTime() - Date.now();
  if (diff <= 0) return 'Due now';
  const h = Math.floor(diff / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  if (h >= 24) return `in ${Math.floor(h / 24)}d ${h % 24}h`;
  if (h > 0) return `in ${h}h ${m}m`;
  return `in ${m}m`;
}

/* ─── Schedule Slide-over ─── */
function ScheduleSlideOver({
  stations,
  onClose,
  onSaved,
}: {
  stations: FuelStation[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [stationId, setStationId] = useState(stations[0]?.id ?? '');
  const [newPrice, setNewPrice] = useState('');
  const [effectiveAt, setEffectiveAt] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const selectedStation = stations.find((s) => s.id === stationId);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    const price = parseFloat(newPrice);
    if (!stationId || isNaN(price) || price <= 0) {
      setError('Please select a station and enter a valid price.');
      return;
    }
    if (!effectiveAt || new Date(effectiveAt) <= new Date()) {
      setError('Effective date must be in the future.');
      return;
    }
    setSaving(true);
    try {
      await fuelPriceService.createSchedule({
        stationId,
        newPrice: price,
        effectiveAt: new Date(effectiveAt).toISOString(),
      });
      onSaved();
    } catch (err: any) {
      setError(err?.response?.data?.message ?? 'Failed to create schedule.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="w-full max-w-md bg-white dark:bg-gray-900 h-full shadow-2xl flex flex-col overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Schedule Price Change</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="flex-1 p-6 space-y-5">
          {error && (
            <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 text-sm">
              {error}
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Station</label>
            <select
              value={stationId}
              onChange={(e) => setStationId(e.target.value)}
              className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white px-3 py-2.5 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
            >
              {stations.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
            {selectedStation && (
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                Current price: <span className="font-medium">{formatPrice(selectedStation.pricePerLiter, selectedStation.currency)}</span> / L
              </p>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
              New Price <span className="text-gray-400 font-normal">({selectedStation?.currency ?? 'TZS'} / L)</span>
            </label>
            <div className="flex items-center rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 overflow-hidden focus-within:ring-2 focus-within:ring-indigo-500 focus-within:border-indigo-500 transition-all">
              <span className="px-3 py-2.5 text-sm font-bold bg-gray-50 dark:bg-gray-700 text-gray-500 dark:text-gray-400 border-r border-gray-300 dark:border-gray-600 select-none">
                {selectedStation?.currency === 'USD' ? '$' : 'TZS'}
              </span>
              <input
                type="text"
                inputMode="decimal"
                value={newPrice}
                onChange={(e) => setNewPrice(e.target.value)}
                placeholder="0.00"
                className="flex-1 px-3 py-2.5 text-sm bg-transparent outline-none text-gray-900 dark:text-white placeholder:text-gray-400"
              />
              <span className="pr-3 text-xs text-gray-400 select-none">/ L</span>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Effective From</label>
            <input
              type="datetime-local"
              value={effectiveAt}
              onChange={(e) => setEffectiveAt(e.target.value)}
              className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white px-3 py-2.5 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
            />
          </div>
          <button
            type="submit"
            disabled={saving}
            className="w-full py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-medium transition-colors flex items-center justify-center gap-2"
          >
            {saving ? <><RefreshCw className="w-4 h-4 animate-spin" /> Scheduling…</> : <><Clock className="w-4 h-4" /> Schedule Change</>}
          </button>
        </form>
      </div>
    </div>
  );
}

/* ─── Edit Price Modal ─── */
function EditPriceModal({
  station,
  onClose,
  onSaved,
  onMessage,
}: {
  station: FuelStation;
  onClose: () => void;
  onSaved: () => void;
  onMessage: Props['onMessage'];
}) {
  const [value, setValue] = useState(String(station.pricePerLiter));
  const [saving, setSaving] = useState(false);
  const [sameError, setSameError] = useState(false);

  async function save() {
    const price = parseFloat(value);
    if (isNaN(price) || price <= 0) { onMessage('Enter a valid price', 'error'); return; }
    if (price === station.pricePerLiter) { setSameError(true); return; }
    setSameError(false);
    setSaving(true);
    try {
      await fuelPriceService.updatePrice({ stationId: station.id, newPrice: price });
      onMessage(`${station.name} updated to ${formatPrice(price, station.currency)}/L`, 'success');
      onSaved();
    } catch (err: any) {
      onMessage(err?.response?.data?.message ?? 'Update failed', 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-xs bg-white dark:bg-gray-900 rounded-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-800">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-indigo-100 dark:bg-indigo-900/50 flex items-center justify-center flex-shrink-0">
              <Edit3 className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-900 dark:text-white leading-tight">{station.name}</p>
              <p className="text-xs text-gray-400 leading-tight">{station.location}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-gray-400">
            <X className="w-4 h-4" />
          </button>
        </div>
        {/* Body */}
        <div className="px-4 py-4 space-y-3">
          <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-gray-50 dark:bg-gray-800/60 border border-gray-200 dark:border-gray-700">
            <span className="text-xs text-gray-500 dark:text-gray-400">Current price</span>
            <span className="text-sm font-bold text-gray-800 dark:text-gray-200 tabular-nums">
              {formatPrice(station.pricePerLiter, station.currency)}<span className="text-xs font-normal text-gray-400 ml-1">/ L</span>
            </span>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5 uppercase tracking-wide">New Price</label>
            <div className="flex items-center rounded-xl border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 overflow-hidden focus-within:border-indigo-500 transition-colors">
              <span className="px-3 py-2.5 text-sm font-bold bg-indigo-50 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400 border-r border-gray-200 dark:border-gray-700 select-none">
                {station.currency === 'USD' ? '$' : 'TZS'}
              </span>
              <input
                type="text"
                inputMode="decimal"
                value={value}
                onChange={(e) => { setValue(e.target.value); setSameError(false); }}
                onKeyDown={(e) => { if (e.key === 'Enter') save(); if (e.key === 'Escape') onClose(); }}
                placeholder="0.00"
                autoFocus
                className="flex-1 px-3 py-2.5 text-base font-semibold bg-transparent outline-none text-gray-900 dark:text-white placeholder:text-gray-300 dark:placeholder:text-gray-600 tabular-nums"
              />
              <span className="pr-3 text-xs text-gray-400 select-none">/ L</span>
            </div>
            {sameError && (
              <p className="mt-1.5 text-xs text-red-500 font-medium">New price must differ from the current price.</p>
            )}
          </div>
        </div>
        {/* Footer */}
        <div className="flex items-center gap-2 px-4 py-3 bg-gray-50 dark:bg-gray-800/60 border-t border-gray-100 dark:border-gray-800">
          <button
            onClick={onClose}
            className="flex-1 py-2 rounded-xl border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 text-sm font-medium hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={save}
            disabled={saving}
            className="flex-1 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white text-sm font-semibold transition-colors flex items-center justify-center gap-1.5"
          >
            {saving ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle className="w-3.5 h-3.5" />}
            {saving ? 'Saving…' : 'Update Price'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Station Row ─── */
function StationRow({
  station,
  color,
  onEdit,
}: {
  station: FuelStation;
  color: string;
  onEdit: () => void;
}) {
  return (
    <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:border-indigo-200 dark:hover:border-indigo-800 hover:shadow-sm transition-all group">
      <div className="flex items-center gap-2.5">
        <span className="w-2 h-6 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
        <div>
          <p className="font-semibold text-gray-900 dark:text-white text-sm leading-tight">{station.name}</p>
          <p className="text-xs text-gray-400 leading-tight">{station.location}</p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-sm font-bold text-gray-900 dark:text-white tabular-nums">
          {formatPrice(station.pricePerLiter, station.currency)}<span className="text-xs font-normal text-gray-400 ml-0.5">/L</span>
        </span>
        <button
          onClick={onEdit}
          className="opacity-0 group-hover:opacity-100 flex items-center gap-1 px-2 py-1 rounded-md bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-900/30 dark:hover:bg-indigo-900/50 text-indigo-600 dark:text-indigo-400 text-xs font-semibold transition-all"
        >
          <Edit3 className="w-3 h-3" />
          Edit
        </button>
      </div>
    </div>
  );
}

/* ─── Main Tab ─── */
export default function FuelPriceTab({ onMessage }: Props) {
  const [stations, setStations] = useState<FuelStation[]>([]);
  const [history, setHistory] = useState<FuelPriceHistoryEntry[]>([]);
  const [schedules, setSchedules] = useState<FuelPriceScheduleEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [histPage, setHistPage] = useState(1);
  const [histTotal, setHistTotal] = useState(0);
  const [showSchedulePanel, setShowSchedulePanel] = useState(false);
  const [expandedEntry, setExpandedEntry] = useState<string | null>(null);
  const [applyingDue, setApplyingDue] = useState(false);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [cancelTarget, setCancelTarget] = useState<{ id: string; name: string } | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [editingStation, setEditingStation] = useState<FuelStation | null>(null);
  const HIST_LIMIT = 20;

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [stationsData, histData, schedulesData] = await Promise.all([
        fuelPriceService.getCurrentPrices(),
        fuelPriceService.getPriceHistory({ page: histPage, limit: HIST_LIMIT }),
        fuelPriceService.getSchedules(),
      ]);
      setStations(stationsData);
      setHistory(Array.isArray(histData.history) ? histData.history : []);
      setHistTotal(histData.total);
      setSchedules(schedulesData);
    } catch {
      onMessage('Failed to load fuel price data', 'error');
    } finally {
      setLoading(false);
    }
  }, [histPage, onMessage]);

  useEffect(() => { loadAll(); }, [loadAll]);
  useRealtimeSync(['fuel_stations'], loadAll);

  const loadHistory = useCallback(async () => {
    try {
      const data = await fuelPriceService.getPriceHistory({ page: histPage, limit: HIST_LIMIT });
      setHistory(Array.isArray(data.history) ? data.history : []);
      setHistTotal(data.total);
    } catch { /* silent */ }
  }, [histPage]);

  useEffect(() => { loadHistory(); }, [loadHistory]);

  async function handleApplyDue() {
    setApplyingDue(true);
    try {
      const result = await fuelPriceService.applyDueSchedules();
      onMessage(`Applied ${result.applied} scheduled price change${result.applied !== 1 ? 's' : ''}`, 'success');
      loadAll();
    } catch (err: any) {
      onMessage(err?.response?.data?.message ?? 'Failed to apply schedules', 'error');
    } finally {
      setApplyingDue(false);
    }
  }

  function handleCancelSchedule(id: string, name: string) {
    setCancelTarget({ id, name });
  }

  async function confirmCancelSchedule() {
    if (!cancelTarget) return;
    setCancelling(true);
    setCancellingId(cancelTarget.id);
    try {
      await fuelPriceService.cancelSchedule(cancelTarget.id);
      onMessage('Schedule cancelled', 'success');
      setCancelTarget(null);
      loadAll();
    } catch (err: any) {
      onMessage(err?.response?.data?.message ?? 'Failed to cancel', 'error');
    } finally {
      setCancelling(false);
      setCancellingId(null);
    }
  }

  /* Build chart data from history — last 10 changes per station */
  const chartData = (() => {
    const byDate: Record<string, Record<string, number>> = {};
    const sorted = [...(Array.isArray(history) ? history : [])].sort((a, b) => new Date(a.changedAt).getTime() - new Date(b.changedAt).getTime());
    sorted.forEach((h) => {
      const d = new Date(h.changedAt).toLocaleDateString('en-GB', { month: 'short', day: '2-digit' });
      byDate[d] = { ...(byDate[d] ?? {}), [h.stationId]: h.newPrice };
    });
    return Object.entries(byDate).map(([date, prices]) => ({ date, ...prices }));
  })();

  const pendingSchedules = schedules.filter((s) => !s.isApplied && !s.isCancelled);
  const totalPages = Math.ceil(histTotal / HIST_LIMIT);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="w-6 h-6 animate-spin text-indigo-500" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {editingStation && (
        <EditPriceModal
          station={editingStation}
          onClose={() => setEditingStation(null)}
          onSaved={() => { setEditingStation(null); loadAll(); }}
          onMessage={onMessage}
        />
      )}
      {showSchedulePanel && (
        <ScheduleSlideOver
          stations={stations}
          onClose={() => setShowSchedulePanel(false)}
          onSaved={() => { setShowSchedulePanel(false); onMessage('Price change scheduled', 'success'); loadAll(); }}
        />
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-gray-900 dark:text-white">Fuel Prices</h2>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Manage pricing, view history and schedule future changes</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={loadAll}
            className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-gray-500"
            title="Refresh"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          {pendingSchedules.length > 0 && (
            <button
              onClick={handleApplyDue}
              disabled={applyingDue}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white text-sm font-medium transition-colors"
            >
              {applyingDue ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
              Apply Due Now
            </button>
          )}
          <button
            onClick={() => setShowSchedulePanel(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium transition-colors"
          >
            <Plus className="w-4 h-4" />
            Schedule Change
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-2">
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-3">
          <div className="flex items-center gap-1.5 mb-0.5">
            <DollarSign className="w-3.5 h-3.5 text-indigo-500" />
            <span className="text-xs text-gray-500 dark:text-gray-400 font-medium uppercase tracking-wide">Stations</span>
          </div>
          <p className="text-xl font-bold text-gray-900 dark:text-white">{stations.filter((s) => s.isActive).length}</p>
          <p className="text-xs text-gray-400">active</p>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-3">
          <div className="flex items-center gap-1.5 mb-0.5">
            <Clock className="w-3.5 h-3.5 text-amber-500" />
            <span className="text-xs text-gray-500 dark:text-gray-400 font-medium uppercase tracking-wide">Pending</span>
          </div>
          <p className="text-xl font-bold text-gray-900 dark:text-white">{pendingSchedules.length}</p>
          <p className="text-xs text-gray-400">scheduled</p>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-3">
          <div className="flex items-center gap-1.5 mb-0.5">
            <TrendingUp className="w-3.5 h-3.5 text-green-500" />
            <span className="text-xs text-gray-500 dark:text-gray-400 font-medium uppercase tracking-wide">Changes</span>
          </div>
          <p className="text-xl font-bold text-gray-900 dark:text-white">{histTotal}</p>
          <p className="text-xs text-gray-400">total updates</p>
        </div>
      </div>

      {/* Current Prices */}
      <div>
        <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-2 uppercase tracking-wider">Current Prices</h3>
        <div className="space-y-1">
          {stations.map((s) => (
            <StationRow key={s.id} station={s} color={stationColor(s.id, stations)} onEdit={() => setEditingStation(s)} />
          ))}
        </div>
      </div>

      {/* Price Trend Chart */}
      {chartData.length > 1 && (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-3">
          <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-2 uppercase tracking-wider">Price Trend</h3>
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={chartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} domain={['auto', 'auto']} tickFormatter={(v) => (v as number).toLocaleString()} />
              <Tooltip formatter={(v: number | undefined) => [(v ?? 0).toLocaleString(), '']} />
              <Legend />
              {stations.map((s) => (
                <Line
                  key={s.id}
                  type="monotone"
                  dataKey={s.id}
                  name={s.name}
                  stroke={stationColor(s.id, stations)}
                  strokeWidth={2}
                  dot={{ r: 3 }}
                  connectNulls
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Pending Schedules */}
      {pendingSchedules.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-2 uppercase tracking-wider">Pending Schedules</h3>
          <div className="space-y-1">
            {pendingSchedules.map((s) => {
              const isPast = new Date(s.effectiveAt) <= new Date();
              return (
                <div key={s._id} className={`flex items-center justify-between px-3 py-2 rounded-lg border ${isPast ? 'border-amber-300 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-700' : 'border-gray-200 bg-white dark:bg-gray-800 dark:border-gray-700'}`}>
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: stationColor(s.stationId, stations) }} />
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">{s.stationName}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {formatPrice(s.currentPrice, stations.find((st) => st.id === s.stationId)?.currency)} → <span className={s.newPrice > s.currentPrice ? 'text-red-500' : 'text-green-500'}>{formatPrice(s.newPrice, stations.find((st) => st.id === s.stationId)?.currency)}</span> · {formatDate(s.effectiveAt)}
                        {isPast && <span className="ml-2 inline-flex items-center gap-1 text-amber-600 dark:text-amber-400 font-medium"><Zap className="w-3 h-3" />Overdue</span>}
                        {!isPast && <span className="ml-2 text-gray-400">{timeUntil(s.effectiveAt)}</span>}
                      </p>
                      {s.reason && <p className="text-xs italic text-gray-400 truncate">"{s.reason}"</p>}
                      <p className="text-xs text-gray-400">by {s.createdBy ?? 'Unknown'}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => handleCancelSchedule(s._id, s.stationName)}
                    disabled={cancellingId === s._id}
                    className="ml-3 flex-shrink-0 px-3 py-1.5 rounded-lg border border-red-300 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 text-xs font-medium transition-colors disabled:opacity-50"
                  >
                    {cancellingId === s._id ? <RefreshCw className="w-3 h-3 animate-spin" /> : 'Cancel'}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* History */}
      <div>
        <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-2 uppercase tracking-wider">
          Change History {histTotal > 0 && <span className="normal-case font-normal text-gray-400">({histTotal} total)</span>}
        </h3>
        {history.length === 0 ? (
          <div className="text-center py-12 text-gray-500 dark:text-gray-400 text-sm">
            No price changes recorded yet.
          </div>
        ) : (
          <div className="space-y-1">
            {history.map((h) => {
              const delta = h.newPrice - h.oldPrice;
              const isExpanded = expandedEntry === h._id;
              return (
                <div key={h._id} className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
                  <button
                    className="w-full flex items-center justify-between px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors text-left"
                    onClick={() => setExpandedEntry(isExpanded ? null : h._id)}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: stationColor(h.stationId, stations) }} />
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-900 dark:text-white">{h.stationName}</p>
                      <p className="text-xs text-gray-400">{formatDate(h.changedAt)} · by {h.changedBy ?? 'Unknown'}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0">
                      <div className="text-right">
                        <p className="text-sm font-semibold text-gray-900 dark:text-white">
                          {formatPrice(h.oldPrice, stations.find((st) => st.id === h.stationId)?.currency)} → {formatPrice(h.newPrice, stations.find((st) => st.id === h.stationId)?.currency)}
                        </p>
                        <p className={`text-xs font-medium flex items-center gap-0.5 justify-end ${delta > 0 ? 'text-red-500' : 'text-green-500'}`}>
                          {delta > 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                          {delta > 0 ? '+' : ''}{formatPrice(Math.abs(delta), stations.find((st) => st.id === h.stationId)?.currency)}
                          <span className="text-gray-400 font-normal ml-1">({delta > 0 ? '+' : ''}{((delta / h.oldPrice) * 100).toFixed(1)}%)</span>
                        </p>
                      </div>
                      {isExpanded ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                    </div>
                  </button>
                  {isExpanded && h.reason && (
                    <div className="px-4 pb-4 border-t border-gray-100 dark:border-gray-700 pt-3">
                      <p className="text-sm text-gray-600 dark:text-gray-300 italic">"{h.reason}"</p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <Pagination
          currentPage={histPage}
          totalPages={totalPages}
          totalItems={histTotal}
          itemsPerPage={HIST_LIMIT}
          onPageChange={setHistPage}
          showItemsPerPage={false}
        />
      </div>

      <ConfirmModal
        open={cancelTarget !== null}
        title="Cancel Scheduled Price Change"
        message={`Cancel the scheduled price change for ${cancelTarget?.name}? This will remove the pending update.`}
        variant="warning"
        confirmLabel="Cancel Schedule"
        loading={cancelling}
        onConfirm={confirmCancelSchedule}
        onCancel={() => !cancelling && setCancelTarget(null)}
      />
    </div>
  );
}
