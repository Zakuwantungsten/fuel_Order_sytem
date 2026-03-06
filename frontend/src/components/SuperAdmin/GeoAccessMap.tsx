import { useState, useEffect } from 'react';
import {
  Globe, MapPin, Loader2, RefreshCw, AlertTriangle,
  Users, Activity, Clock,
} from 'lucide-react';

/* ───────── Types ───────── */

interface GeoLocation {
  city: string;
  country: string;
  countryCode: string;
  lat: number;
  lng: number;
  loginCount: number;
  userCount: number;
  users: string[];
  lastSeen: string;
  unusual: boolean;
}

interface GeoData {
  locations: GeoLocation[];
  period: number;
  totalLogins: number;
  uniqueIPs: number;
  countries: { country: string; count: number }[];
}

/* ───────── Component ───────── */

export default function GeoAccessMap() {
  const [data, setData] = useState<GeoData | null>(null);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(7);

  const authHeaders = () => ({
    Authorization: `Bearer ${sessionStorage.getItem('fuel_order_token')}`,
  });

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/v1/system-admin/geo-access?days=${days}`, { headers: authHeaders() });
      const json = await res.json();
      if (json.success) setData(json.data);
    } catch {
      // Non-critical
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [days]);

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="w-6 h-6 text-indigo-500 animate-spin" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="text-center py-12 text-gray-400">
        <Globe className="w-8 h-8 mx-auto mb-2 opacity-30" />
        <p className="text-sm">Unable to load geographic access data</p>
        <button onClick={load} className="mt-2 text-xs text-indigo-500 hover:underline">Retry</button>
      </div>
    );
  }

  const unusualCount = data.locations.filter(l => l.unusual).length;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-gray-900 dark:text-gray-100">Geographic Access Map</h3>
          <p className="text-xs text-gray-500 dark:text-gray-400">Login origin locations over {days} days</p>
        </div>
        <div className="flex items-center gap-2">
          <select value={days} onChange={e => setDays(Number(e.target.value))}
            className="px-3 py-1.5 text-sm rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white outline-none">
            <option value={7}>7 days</option>
            <option value={30}>30 days</option>
            <option value={90}>90 days</option>
          </select>
          <button onClick={load} className="p-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors">
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-blue-50 dark:bg-blue-900/20 rounded-xl p-3 border border-gray-100 dark:border-gray-700">
          <div className="flex items-center gap-2 mb-1">
            <Activity className="w-3.5 h-3.5 text-blue-500" />
            <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Total Logins</span>
          </div>
          <p className="text-xl font-bold text-blue-600 dark:text-blue-400">{data.totalLogins.toLocaleString()}</p>
        </div>
        <div className="bg-indigo-50 dark:bg-indigo-900/20 rounded-xl p-3 border border-gray-100 dark:border-gray-700">
          <div className="flex items-center gap-2 mb-1">
            <Globe className="w-3.5 h-3.5 text-indigo-500" />
            <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Unique IPs</span>
          </div>
          <p className="text-xl font-bold text-indigo-600 dark:text-indigo-400">{data.uniqueIPs}</p>
        </div>
        <div className="bg-green-50 dark:bg-green-900/20 rounded-xl p-3 border border-gray-100 dark:border-gray-700">
          <div className="flex items-center gap-2 mb-1">
            <MapPin className="w-3.5 h-3.5 text-green-500" />
            <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Countries</span>
          </div>
          <p className="text-xl font-bold text-green-600 dark:text-green-400">{data.countries.length}</p>
        </div>
        {unusualCount > 0 && (
          <div className="bg-amber-50 dark:bg-amber-900/20 rounded-xl p-3 border border-amber-200 dark:border-amber-700">
            <div className="flex items-center gap-2 mb-1">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
              <span className="text-xs font-medium text-amber-600 dark:text-amber-400">Unusual Locations</span>
            </div>
            <p className="text-xl font-bold text-amber-600 dark:text-amber-400">{unusualCount}</p>
          </div>
        )}
      </div>

      {/* Country breakdown */}
      {data.countries.length > 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
          <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-3">Logins by Country</p>
          <div className="space-y-2">
            {data.countries.map(c => {
              const pct = Math.round((c.count / data.totalLogins) * 100);
              return (
                <div key={c.country} className="flex items-center gap-3">
                  <span className="text-sm text-gray-700 dark:text-gray-300 w-28 truncate">{c.country}</span>
                  <div className="flex-1 h-2 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                    <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${pct}%` }} />
                  </div>
                  <span className="text-xs text-gray-500 w-16 text-right">{c.count} ({pct}%)</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Location list */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100 dark:border-gray-700 flex items-center gap-3">
          <MapPin className="w-4 h-4 text-indigo-500" />
          <span className="font-medium text-sm text-gray-900 dark:text-gray-100">Access Locations</span>
          <span className="text-xs text-gray-400">{data.locations.length} locations</span>
        </div>
        {data.locations.length === 0 ? (
          <div className="text-center py-10 text-gray-400 text-sm">
            No location data available for this period
          </div>
        ) : (
          <div className="divide-y divide-gray-100 dark:divide-gray-700">
            {data.locations.map((loc, i) => (
              <div key={i}
                className={`px-5 py-3 flex items-center justify-between gap-4 ${
                  loc.unusual ? 'bg-amber-50/50 dark:bg-amber-900/10 border-l-2 border-amber-400' : ''
                }`}>
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                    loc.unusual
                      ? 'bg-amber-100 dark:bg-amber-900/40'
                      : 'bg-gray-100 dark:bg-gray-700'
                  }`}>
                    {loc.unusual
                      ? <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                      : <MapPin className="w-4 h-4 text-gray-500 dark:text-gray-400" />}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm text-gray-900 dark:text-gray-100">
                        {loc.city || 'Unknown City'}, {loc.country}
                      </span>
                      {loc.unusual && (
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
                          Unusual
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-0.5 text-xs text-gray-400">
                      <span className="flex items-center gap-1">
                        <Activity className="w-3 h-3" />{loc.loginCount} logins
                      </span>
                      <span className="flex items-center gap-1">
                        <Users className="w-3 h-3" />{loc.userCount} users
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />{new Date(loc.lastSeen).toLocaleDateString()}
                      </span>
                    </div>
                    {loc.users.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {loc.users.slice(0, 5).map(u => (
                          <span key={u} className="text-[10px] px-1.5 py-0.5 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded">
                            {u}
                          </span>
                        ))}
                        {loc.users.length > 5 && (
                          <span className="text-[10px] text-gray-400">+{loc.users.length - 5} more</span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-xs text-gray-400">
                    {loc.lat.toFixed(2)}, {loc.lng.toFixed(2)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
