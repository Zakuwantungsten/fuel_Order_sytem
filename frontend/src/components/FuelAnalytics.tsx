import { useState, useMemo } from 'react';
import { TrendingUp, TrendingDown, Fuel, DollarSign, Truck, MapPin, BarChart3 } from 'lucide-react';
import { FuelRecord, LPOEntry } from '../types';

interface FuelAnalyticsProps {
  fuelRecords: FuelRecord[];
  lpoEntries: LPOEntry[];
}

interface RouteAnalytics {
  route: string;
  trips: number;
  totalFuel: number;
  avgFuelPerTrip: number;
  totalCost: number;
}

interface TruckAnalytics {
  truckNo: string;
  trips: number;
  totalFuel: number;
  avgFuelPerTrip: number;
  efficiency: string;
}

const FuelAnalytics = ({ fuelRecords, lpoEntries }: FuelAnalyticsProps) => {
  const [selectedView, setSelectedView] = useState<'routes' | 'trucks' | 'costs'>('routes');

  // Calculate route analytics
  const routeAnalytics = useMemo<RouteAnalytics[]>(() => {
    const routeMap = new Map<string, { trips: number; totalFuel: number; cost: number }>();

    fuelRecords.forEach(record => {
      const route = `${record.from} → ${record.to}`;
      const existing = routeMap.get(route) || { trips: 0, totalFuel: 0, cost: 0 };
      
      routeMap.set(route, {
        trips: existing.trips + 1,
        totalFuel: existing.totalFuel + record.totalLts + (record.extra || 0),
        cost: existing.cost + 0, // Will be calculated from LPOs
      });
    });

    return Array.from(routeMap.entries())
      .map(([route, data]) => ({
        route,
        trips: data.trips,
        totalFuel: data.totalFuel,
        avgFuelPerTrip: data.totalFuel / data.trips,
        totalCost: data.cost,
      }))
      .sort((a, b) => b.totalFuel - a.totalFuel);
  }, [fuelRecords]);

  // Calculate truck analytics
  const truckAnalytics = useMemo<TruckAnalytics[]>(() => {
    const truckMap = new Map<string, { trips: number; totalFuel: number }>();

    fuelRecords.forEach(record => {
      const existing = truckMap.get(record.truckNo) || { trips: 0, totalFuel: 0 };
      
      truckMap.set(record.truckNo, {
        trips: existing.trips + 1,
        totalFuel: existing.totalFuel + record.totalLts + (record.extra || 0),
      });
    });

    return Array.from(truckMap.entries())
      .map(([truckNo, data]) => {
        const avgFuel = data.totalFuel / data.trips;
        let efficiency = 'Good';
        if (avgFuel > 2300) efficiency = 'Low';
        else if (avgFuel > 2100) efficiency = 'Average';
        else efficiency = 'Excellent';

        return {
          truckNo,
          trips: data.trips,
          totalFuel: data.totalFuel,
          avgFuelPerTrip: avgFuel,
          efficiency,
        };
      })
      .sort((a, b) => b.trips - a.trips);
  }, [fuelRecords]);

  // Calculate cost analytics
  const costAnalytics = useMemo(() => {
    const totalLiters = lpoEntries.reduce((sum, lpo) => sum + lpo.ltrs, 0);
    const totalCost = lpoEntries.reduce((sum, lpo) => sum + (lpo.ltrs * lpo.pricePerLtr), 0);
    const avgPricePerLiter = totalCost / totalLiters || 0;

    // Group by station
    const stationCosts = new Map<string, { liters: number; cost: number; entries: number }>();
    lpoEntries.forEach(lpo => {
      const existing = stationCosts.get(lpo.dieselAt) || { liters: 0, cost: 0, entries: 0 };
      stationCosts.set(lpo.dieselAt, {
        liters: existing.liters + lpo.ltrs,
        cost: existing.cost + (lpo.ltrs * lpo.pricePerLtr),
        entries: existing.entries + 1,
      });
    });

    return {
      totalLiters,
      totalCost,
      avgPricePerLiter,
      stationCosts: Array.from(stationCosts.entries())
        .map(([station, data]) => ({
          station,
          liters: data.liters,
          cost: data.cost,
          avgPrice: data.cost / data.liters,
          entries: data.entries,
        }))
        .sort((a, b) => b.cost - a.cost),
    };
  }, [lpoEntries]);

  // Overall stats
  const overallStats = useMemo(() => {
    const totalTrips = fuelRecords.length;
    const totalFuelConsumed = fuelRecords.reduce((sum, r) => sum + r.totalLts + (r.extra || 0), 0);
    const totalBalance = fuelRecords.reduce((sum, r) => sum + r.balance, 0);
    const avgFuelPerTrip = totalFuelConsumed / totalTrips || 0;

    return {
      totalTrips,
      totalFuelConsumed,
      totalBalance,
      avgFuelPerTrip,
      totalCost: costAnalytics.totalCost,
    };
  }, [fuelRecords, costAnalytics]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-lg shadow p-4">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="flex items-center space-x-3">
            <BarChart3 className="w-6 h-6 text-primary-600" />
            <h3 className="text-xl font-semibold text-gray-900">Fuel Analytics Dashboard</h3>
          </div>
          
          <div className="flex flex-wrap items-center gap-3">
            {/* View Toggle */}
            <div className="flex border border-gray-300 rounded-md overflow-hidden">
              <button
                onClick={() => setSelectedView('routes')}
                className={`px-4 py-2 text-sm font-medium ${
                  selectedView === 'routes'
                    ? 'bg-primary-600 text-white'
                    : 'bg-white text-gray-700 hover:bg-gray-50'
                }`}
              >
                By Routes
              </button>
              <button
                onClick={() => setSelectedView('trucks')}
                className={`px-4 py-2 text-sm font-medium border-l ${
                  selectedView === 'trucks'
                    ? 'bg-primary-600 text-white'
                    : 'bg-white text-gray-700 hover:bg-gray-50'
                }`}
              >
                By Trucks
              </button>
              <button
                onClick={() => setSelectedView('costs')}
                className={`px-4 py-2 text-sm font-medium border-l ${
                  selectedView === 'costs'
                    ? 'bg-primary-600 text-white'
                    : 'bg-white text-gray-700 hover:bg-gray-50'
                }`}
              >
                Costs
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="bg-white p-4 rounded-lg shadow">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Total Trips</p>
              <p className="text-2xl font-bold text-gray-900">{overallStats.totalTrips}</p>
            </div>
            <Truck className="w-8 h-8 text-blue-500" />
          </div>
        </div>

        <div className="bg-white p-4 rounded-lg shadow">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Fuel Consumed</p>
              <p className="text-2xl font-bold text-gray-900">
                {overallStats.totalFuelConsumed.toLocaleString()} L
              </p>
            </div>
            <Fuel className="w-8 h-8 text-orange-500" />
          </div>
        </div>

        <div className="bg-white p-4 rounded-lg shadow">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Avg Fuel/Trip</p>
              <p className="text-2xl font-bold text-gray-900">
                {overallStats.avgFuelPerTrip.toFixed(0)} L
              </p>
            </div>
            <TrendingDown className="w-8 h-8 text-green-500" />
          </div>
        </div>

        <div className="bg-white p-4 rounded-lg shadow">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Total Balance</p>
              <p className="text-2xl font-bold text-gray-900">
                {overallStats.totalBalance.toLocaleString()} L
              </p>
            </div>
            <TrendingUp className="w-8 h-8 text-purple-500" />
          </div>
        </div>

        <div className="bg-white p-4 rounded-lg shadow">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Total Cost</p>
              <p className="text-2xl font-bold text-gray-900">
                TZS {overallStats.totalCost.toLocaleString()}
              </p>
            </div>
            <DollarSign className="w-8 h-8 text-primary-500" />
          </div>
        </div>
      </div>

      {/* Routes View */}
      {selectedView === 'routes' && (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow dark:shadow-gray-700/30 overflow-hidden transition-colors">
          <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
            <h4 className="text-lg font-semibold text-gray-900 dark:text-gray-100 flex items-center">
              <MapPin className="w-5 h-5 mr-2 text-primary-600 dark:text-primary-400" />
              Fuel Consumption by Route
            </h4>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
              <thead className="bg-gray-50 dark:bg-gray-700">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-200 uppercase tracking-wider">
                    Route
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-200 uppercase tracking-wider">
                    Trips
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-200 uppercase tracking-wider">
                    Total Fuel (L)
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-200 uppercase tracking-wider">
                    Avg Fuel/Trip (L)
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-200 uppercase tracking-wider">
                    Efficiency
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                {routeAnalytics.map((route, index) => (
                  <tr key={index} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-gray-100">
                      {route.route}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
                      {route.trips}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
                      {route.totalFuel.toLocaleString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
                      {route.avgFuelPerTrip.toFixed(0)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="w-full bg-gray-200 dark:bg-gray-600 rounded-full h-2">
                        <div
                          className="bg-primary-600 h-2 rounded-full"
                          style={{ width: `${Math.min((route.avgFuelPerTrip / 2500) * 100, 100)}%` }}
                        ></div>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Trucks View */}
      {selectedView === 'trucks' && (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow dark:shadow-gray-700/30 overflow-hidden transition-colors">
          <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
            <h4 className="text-lg font-semibold text-gray-900 dark:text-gray-100 flex items-center">
              <Truck className="w-5 h-5 mr-2 text-primary-600 dark:text-primary-400" />
              Truck Performance & Efficiency
            </h4>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
              <thead className="bg-gray-50 dark:bg-gray-700">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-200 uppercase tracking-wider">
                    Truck No.
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-200 uppercase tracking-wider">
                    Trips
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-200 uppercase tracking-wider">
                    Total Fuel (L)
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-200 uppercase tracking-wider">
                    Avg Fuel/Trip (L)
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-200 uppercase tracking-wider">
                    Efficiency Rating
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                {truckAnalytics.map((truck, index) => (
                  <tr key={index} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-gray-100">
                      {truck.truckNo}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
                      {truck.trips}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
                      {truck.totalFuel.toLocaleString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
                      {truck.avgFuelPerTrip.toFixed(0)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span
                        className={`px-3 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${
                          truck.efficiency === 'Excellent'
                            ? 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300'
                            : truck.efficiency === 'Good'
                            ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300'
                            : truck.efficiency === 'Average'
                            ? 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-300'
                            : 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300'
                        }`}
                      >
                        {truck.efficiency}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Costs View */}
      {selectedView === 'costs' && (
        <div className="space-y-6">
          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-gradient-to-br from-primary-500 to-primary-600 text-white p-6 rounded-lg shadow">
              <p className="text-sm opacity-90">Total Fuel Purchased</p>
              <p className="text-3xl font-bold mt-2">
                {costAnalytics.totalLiters.toLocaleString()} L
              </p>
            </div>
            <div className="bg-gradient-to-br from-green-500 to-green-600 text-white p-6 rounded-lg shadow">
              <p className="text-sm opacity-90">Total Cost</p>
              <p className="text-3xl font-bold mt-2">
                TZS {costAnalytics.totalCost.toLocaleString()}
              </p>
            </div>
            <div className="bg-gradient-to-br from-orange-500 to-orange-600 text-white p-6 rounded-lg shadow">
              <p className="text-sm opacity-90">Avg Price/Liter</p>
              <p className="text-3xl font-bold mt-2">
                TZS {costAnalytics.avgPricePerLiter.toFixed(2)}
              </p>
            </div>
          </div>

          {/* Station Costs */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow dark:shadow-gray-700/30 overflow-hidden transition-colors">
            <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
              <h4 className="text-lg font-semibold text-gray-900 dark:text-gray-100 flex items-center">
                <DollarSign className="w-5 h-5 mr-2 text-primary-600 dark:text-primary-400" />
                Costs by Station
              </h4>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                <thead className="bg-gray-50 dark:bg-gray-700">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-200 uppercase tracking-wider">
                      Station
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-200 uppercase tracking-wider">
                      Entries
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-200 uppercase tracking-wider">
                      Total Liters
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-200 uppercase tracking-wider">
                      Total Cost
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-200 uppercase tracking-wider">
                      Avg Price/L
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                  {costAnalytics.stationCosts.map((station, index) => (
                    <tr key={index} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-gray-100">
                        {station.station}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
                        {station.entries}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
                        {station.liters.toLocaleString()} L
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-gray-900 dark:text-gray-100">
                        TZS {station.cost.toLocaleString()}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
                        TZS {station.avgPrice.toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default FuelAnalytics;
