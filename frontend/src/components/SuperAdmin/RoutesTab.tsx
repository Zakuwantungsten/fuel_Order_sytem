import { useState, useEffect, useRef } from 'react';
import ConfirmModal from './ConfirmModal';
import { Route, Plus, Edit2, Trash2, Save, X, ChevronDown, Check } from 'lucide-react';
import { configAPI } from '../../services/api';
import { RouteConfig } from '../../types';
import { useRealtimeSync } from '../../hooks/useRealtimeSync';
import UnifiedTabLoader from './common/UnifiedTabLoader';

interface RoutesTabProps {
  onMessage: (type: 'success' | 'error', message: string) => void;
  initialDestination?: string;
  initialLoadingPoint?: string;
  onDestinationConsumed?: () => void;
}

/** Same origin equality used by backend route matching (e.g. "TANGA TANGA" ↔ "TANGA"). */
function originsMatch(a?: string, b?: string): boolean {
  const na = (a || '').toUpperCase().trim();
  const nb = (b || '').toUpperCase().trim();
  if (!na || !nb) return false;
  if (na === nb) return true;
  return na.includes(nb) || nb.includes(na);
}

/** Parse "ORIGIN → DEST" fallback when older notifications only stored a combined string. */
function parseRouteHint(destination?: string, loadingPoint?: string): { origin: string; destination: string } {
  const rawDest = (destination || '').trim();
  const rawOrigin = (loadingPoint || '').trim();
  if (rawOrigin) {
    return { origin: rawOrigin.toUpperCase(), destination: rawDest.toUpperCase() };
  }
  const arrowMatch = rawDest.match(/^(.+?)\s*→\s*(.+)$/);
  if (arrowMatch) {
    return {
      origin: arrowMatch[1].trim().toUpperCase(),
      destination: arrowMatch[2].trim().toUpperCase(),
    };
  }
  return { origin: '', destination: rawDest.toUpperCase() };
}

export default function RoutesTab({ onMessage, initialDestination, initialLoadingPoint, onDestinationConsumed }: RoutesTabProps) {
  const [routes, setRoutes] = useState<RouteConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [showRouteModal, setShowRouteModal] = useState(false);
  const [editingRoute, setEditingRoute] = useState<RouteConfig | null>(null);
  const [deleteRouteTarget, setDeleteRouteTarget] = useState<string | null>(null);
  const [deletingRoute, setDeletingRoute] = useState(false);
  const [savingRoute, setSavingRoute] = useState(false);

  const [routeForm, setRouteForm] = useState({
    routeName: '',
    origin: '',
    destination: '',
    destinationAliases: '',
    routeType: 'IMPORT' as 'IMPORT' | 'EXPORT',
    defaultTotalLiters: '',
    description: '',
  });
  
  // Dropdown state
  const [showRouteTypeDropdown, setShowRouteTypeDropdown] = useState(false);
  
  // Dropdown ref
  const routeTypeDropdownRef = useRef<HTMLDivElement>(null);

  // ── "Add from notification" chooser: alias of an existing route vs new route ──
  const [showRouteChoice, setShowRouteChoice] = useState(false);
  const [choiceDestination, setChoiceDestination] = useState('');
  const [choiceOrigin, setChoiceOrigin] = useState('');
  const [aliasRouteId, setAliasRouteId] = useState('');
  const [aliasSearch, setAliasSearch] = useState('');
  const [savingAlias, setSavingAlias] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (!initialDestination || loading) return;
    // Opened from a "route not configured" notification. Wait until routes are
    // loaded so same-origin alias candidates are available immediately.
    const parsed = parseRouteHint(initialDestination, initialLoadingPoint);
    setChoiceDestination(parsed.destination);
    setChoiceOrigin(parsed.origin);
    setAliasRouteId('');
    setAliasSearch('');
    setShowRouteChoice(true);
    onDestinationConsumed?.();
  }, [initialDestination, initialLoadingPoint, loading]);

  // Click outside detection
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (routeTypeDropdownRef.current && !routeTypeDropdownRef.current.contains(event.target as Node)) {
        setShowRouteTypeDropdown(false);
      }
    };

    const handleScroll = (event: Event) => {
      const target = event.target as Node;
      if (routeTypeDropdownRef.current?.contains(target)) return;
      setShowRouteTypeDropdown(false);
    };

    document.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('scroll', handleScroll, true);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('scroll', handleScroll, true);
    };
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const routesData = await configAPI.getRoutes();
      setRoutes(routesData);
    } catch (error: any) {
      onMessage('error', error.response?.data?.message || 'Failed to load routes');
    } finally {
      setLoading(false);
    }
  };

  useRealtimeSync('routes', loadData);

  // Same-origin IMPORT routes only — alias is invalid across different starts.
  const sameOriginRoutes = routes.filter(
    (r) =>
      r.isActive !== false &&
      (!r.routeType || r.routeType === 'IMPORT') &&
      choiceOrigin &&
      originsMatch(r.origin, choiceOrigin)
  );

  // Chooser → "Create new route": open the Add Route form prefilled with the
  // notification's origin + destination.
  const startCreateFromChoice = () => {
    resetRouteForm();
    setEditingRoute(null);
    setRouteForm(f => ({
      ...f,
      origin: choiceOrigin,
      destination: choiceDestination,
    }));
    setShowRouteChoice(false);
    setShowRouteModal(true);
  };

  // Chooser → "Add as alias": append the destination to the selected same-origin
  // route's aliases. Backend auto-fill then applies that route's total liters to
  // locked fuel records matching origin + this alias.
  const handleAddAlias = async () => {
    if (savingAlias) return;
    const route = sameOriginRoutes.find(r => r._id === aliasRouteId);
    if (!route) {
      onMessage('error', 'Please select a same-origin route for this alias');
      return;
    }
    if (!originsMatch(route.origin, choiceOrigin)) {
      onMessage('error', 'Alias can only be added to a route with the same starting point');
      return;
    }
    const dest = choiceDestination.trim().toUpperCase();
    const existingAliases = (route.destinationAliases || []).map(a => a.toUpperCase());
    if (route.destination.toUpperCase() === dest || existingAliases.includes(dest)) {
      onMessage('error', `"${dest}" is already part of ${route.routeName}`);
      return;
    }

    setSavingAlias(true);
    try {
      await configAPI.updateRoute(route._id, {
        routeName: route.routeName,
        origin: route.origin,
        destination: route.destination,
        destinationAliases: [...existingAliases, dest],
        routeType: route.routeType,
        defaultTotalLiters: route.defaultTotalLiters,
        description: route.description,
      });
      onMessage('success', `Added "${dest}" as an alias of ${route.routeName} (${route.defaultTotalLiters} L) — matching fuel records will update automatically`);
      setShowRouteChoice(false);
      loadData();
    } catch (error: any) {
      onMessage('error', error.response?.data?.message || 'Failed to add alias');
    } finally {
      setSavingAlias(false);
    }
  };

  const handleCreateRoute = async () => {
    if (savingRoute) return;
    // Validate and trim required fields with specific messages
    const routeName = routeForm.routeName?.trim();
    if (!routeName) {
      onMessage('error', 'Please enter a Route Name');
      return;
    }

    const origin = routeForm.origin?.trim();
    if (!origin) {
      onMessage('error', 'Please enter a Starting Point');
      return;
    }

    const destination = routeForm.destination?.trim();
    if (!destination) {
      onMessage('error', 'Please enter a Destination');
      return;
    }

    const defaultLiters = routeForm.defaultTotalLiters?.trim();
    if (!defaultLiters) {
      onMessage('error', 'Please enter Default Liters');
      return;
    }

    const litersValue = parseFloat(defaultLiters);
    if (isNaN(litersValue) || litersValue <= 0) {
      onMessage('error', 'Default Liters must be a valid number greater than 0');
      return;
    }

    setSavingRoute(true);
    try {
      await configAPI.createRoute({
        routeName,
        origin,
        destination,
        destinationAliases: routeForm.destinationAliases
          ? routeForm.destinationAliases.split(',').map(a => a.trim()).filter(Boolean)
          : undefined,
        routeType: routeForm.routeType,
        defaultTotalLiters: litersValue,
        description: routeForm.description?.trim() || undefined,
      });
      onMessage('success', 'Route created successfully');
      setShowRouteModal(false);
      resetRouteForm();
      loadData();
    } catch (error: any) {
      onMessage('error', error.response?.data?.message || 'Failed to create route');
    } finally {
      setSavingRoute(false);
    }
  };

  const handleUpdateRoute = async () => {
    if (!editingRoute) return;
    if (savingRoute) return;
    // Validate and trim required fields with specific messages
    const routeName = routeForm.routeName?.trim();
    if (!routeName) {
      onMessage('error', 'Please enter a Route Name');
      return;
    }

    const origin = routeForm.origin?.trim();
    if (!origin) {
      onMessage('error', 'Please enter a Starting Point');
      return;
    }

    const destination = routeForm.destination?.trim();
    if (!destination) {
      onMessage('error', 'Please enter a Destination');
      return;
    }

    const defaultLiters = routeForm.defaultTotalLiters?.trim();
    if (!defaultLiters) {
      onMessage('error', 'Please enter Default Liters');
      return;
    }

    const litersValue = parseFloat(defaultLiters);
    if (isNaN(litersValue) || litersValue <= 0) {
      onMessage('error', 'Default Liters must be a valid number greater than 0');
      return;
    }

    setSavingRoute(true);
    try {
      await configAPI.updateRoute(editingRoute._id, {
        routeName,
        origin,
        destination,
        // Always send the array so clearing the input removes persisted aliases.
        // `undefined` is omitted from JSON and would leave the old aliases unchanged.
        destinationAliases: routeForm.destinationAliases
          .split(',')
          .map(a => a.trim())
          .filter(Boolean),
        routeType: routeForm.routeType,
        defaultTotalLiters: litersValue,
        description: routeForm.description?.trim() || undefined,
      });
      onMessage('success', 'Route updated successfully');
      setShowRouteModal(false);
      setEditingRoute(null);
      resetRouteForm();
      loadData();
    } catch (error: any) {
      onMessage('error', error.response?.data?.message || 'Failed to update route');
    } finally {
      setSavingRoute(false);
    }
  };

  const handleDeleteRoute = (id: string) => {
    setDeleteRouteTarget(id);
  };

  const confirmDeleteRoute = async () => {
    if (!deleteRouteTarget) return;
    setDeletingRoute(true);
    try {
      await configAPI.deleteRoute(deleteRouteTarget);
      onMessage('success', 'Route deleted successfully');
      setDeleteRouteTarget(null);
      loadData();
    } catch (error: any) {
      onMessage('error', error.response?.data?.message || 'Failed to delete route');
    } finally {
      setDeletingRoute(false);
    }
  };

  const openRouteModal = (route?: RouteConfig) => {
    if (route) {
      setEditingRoute(route);
      setRouteForm({
        routeName: route.routeName || '',
        origin: route.origin || '',
        destination: route.destination || '',
        destinationAliases: route.destinationAliases?.join(', ') || '',
        routeType: route.routeType || 'IMPORT',
        defaultTotalLiters: String(route.defaultTotalLiters ?? ''),
        description: route.description || '',
      });
    }
    setShowRouteModal(true);
  };

  const resetRouteForm = () => {
    setRouteForm({
      routeName: '',
      origin: '',
      destination: '',
      destinationAliases: '',
      routeType: 'IMPORT',
      defaultTotalLiters: '',
      description: '',
    });
  };

  // Labeled outline buttons (icon + text) for the row-level Modify / Delete actions.
  const labelButtonBase =
    'inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg border bg-white dark:bg-gray-800 ' +
    'transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 ' +
    'dark:focus-visible:ring-offset-gray-800 disabled:opacity-40 disabled:cursor-not-allowed';
  const modifyButtonClass =
    `${labelButtonBase} border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 ` +
    'hover:bg-gray-50 dark:hover:bg-gray-700 hover:text-blue-600 dark:hover:text-blue-400 hover:border-blue-300 dark:hover:border-blue-700 focus-visible:ring-blue-500';
  const deleteLabelButtonClass =
    `${labelButtonBase} border-gray-300 dark:border-gray-600 text-red-600 dark:text-red-400 ` +
    'hover:bg-red-50 dark:hover:bg-red-900/20 hover:border-red-300 dark:hover:border-red-700 focus-visible:ring-red-500';

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Route className="w-5 h-5 text-purple-600 dark:text-purple-400" />
          <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">
            Routes Management
          </h2>
        </div>
        <button onClick={() => openRouteModal()} className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700">
          <Plus className="w-3.5 h-3.5" />Add Route
        </button>
      </div>

      {loading && routes.length === 0 ? (
        <UnifiedTabLoader label="Loading routes..." />
      ) : (
        <>

      {/* Mobile Cards */}
      <div className="md:hidden space-y-3">
        {routes.map((route) => (
          <div key={String(route._id)} className="bg-white dark:bg-gray-800 rounded-lg border dark:border-gray-700 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{route.routeName}</h3>
              <div className="flex items-center gap-2">
                <button onClick={() => openRouteModal(route)} className={modifyButtonClass} aria-label={`Modify route ${route.routeName}`} title="Modify route">
                  <Edit2 className="w-4 h-4" />
                  Modify
                </button>
                <button onClick={() => handleDeleteRoute(route._id)} className={deleteLabelButtonClass} aria-label={`Delete route ${route.routeName}`} title="Delete route">
                  <Trash2 className="w-4 h-4" />
                  Delete
                </button>
              </div>
            </div>
            <div className="text-sm">
              {route.origin ? (
                <span className="flex items-center gap-1">
                  <span className="font-medium text-green-600 dark:text-green-400">{route.origin}</span>
                  <span className="text-gray-400">→</span>
                  <span className="font-medium text-blue-600 dark:text-blue-400">{route.destination}</span>
                </span>
              ) : (
                <span className="font-medium text-blue-600 dark:text-blue-400">{route.destination}</span>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <span className="text-gray-500 dark:text-gray-400 text-xs">Type</span>
                <div className="text-gray-900 dark:text-gray-100 mt-0.5 font-medium">{route.routeType || 'IMPORT'}</div>
              </div>
              <div>
                <span className="text-gray-500 dark:text-gray-400 text-xs">Default Liters</span>
                <div className="text-gray-900 dark:text-gray-100 mt-0.5 font-medium">{route.defaultTotalLiters} L</div>
              </div>
            </div>
            {route.destinationAliases && route.destinationAliases.length > 0 && (
              <div>
                <span className="text-gray-500 dark:text-gray-400 text-xs">Aliases</span>
                <div className="flex flex-wrap gap-1 mt-1">
                  {route.destinationAliases.map((alias, idx) => (
                    <span key={idx} className="bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 px-2 py-0.5 rounded text-xs">
                      {alias}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {route.description && (
              <div>
                <span className="text-gray-500 dark:text-gray-400 text-xs">Description</span>
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-0.5">{route.description}</p>
              </div>
            )}
          </div>
        ))}
        {routes.length === 0 && (
          <div className="bg-white dark:bg-gray-800 rounded-lg border dark:border-gray-700 px-4 py-8 text-center text-gray-500 dark:text-gray-400">
            No routes configured.
          </div>
        )}
      </div>

      {/* Desktop Table */}
      <div className="hidden md:block bg-white dark:bg-gray-800 rounded-lg border dark:border-gray-700 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 dark:bg-gray-900">
            <tr>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-600 dark:text-gray-400">Route</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-600 dark:text-gray-400">From → To</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-600 dark:text-gray-400">Type</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-600 dark:text-gray-400">Default Liters</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-600 dark:text-gray-400">Aliases</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-600 dark:text-gray-400">Description</th>
              <th className="px-3 py-2 text-right text-xs font-medium text-gray-600 dark:text-gray-400">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y dark:divide-gray-700">
            {routes.map((route) => (
              <tr key={String(route._id)} className="hover:bg-gray-50 dark:hover:bg-gray-900/50">
                <td className="px-3 py-2.5 text-sm font-medium text-gray-900 dark:text-gray-100">{route.routeName}</td>
                <td className="px-3 py-2.5 text-sm text-gray-600 dark:text-gray-400">
                  {route.origin ? (
                    <span className="flex items-center gap-1">
                      <span className="font-medium text-green-600 dark:text-green-400">{route.origin}</span>
                      <span className="text-gray-400">→</span>
                      <span className="font-medium text-blue-600 dark:text-blue-400">{route.destination}</span>
                    </span>
                  ) : (
                    <span className="font-medium text-blue-600 dark:text-blue-400">{route.destination}</span>
                  )}
                </td>
                <td className="px-3 py-2.5 text-sm text-gray-600 dark:text-gray-400">{route.routeType || 'IMPORT'}</td>
                <td className="px-3 py-2.5 text-sm text-gray-600 dark:text-gray-400">{route.defaultTotalLiters} L</td>
                <td className="px-3 py-2.5 text-xs">
                  {route.destinationAliases && route.destinationAliases.length > 0 ? (
                    <div className="flex flex-wrap gap-1">
                      {route.destinationAliases.map((alias, idx) => (
                        <span key={idx} className="bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 px-1.5 py-0.5 rounded text-[11px]">
                          {alias}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <span className="text-gray-400">—</span>
                  )}
                </td>
                <td className="px-3 py-2.5 text-sm text-gray-500 dark:text-gray-400">{route.description || '—'}</td>
                <td className="px-3 py-2.5 text-sm text-right">
                  <div className="flex items-center justify-end gap-2">
                    <button onClick={() => openRouteModal(route)} className={modifyButtonClass} aria-label={`Modify route ${route.routeName}`} title="Modify route">
                      <Edit2 className="w-4 h-4" />
                      Modify
                    </button>
                    <button onClick={() => handleDeleteRoute(route._id)} className={deleteLabelButtonClass} aria-label={`Delete route ${route.routeName}`} title="Delete route">
                      <Trash2 className="w-4 h-4" />
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {routes.length === 0 && (
              <tr><td colSpan={7} className="px-3 py-6 text-center text-sm text-gray-500 dark:text-gray-400">No routes configured.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {showRouteModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100">{editingRoute ? 'Edit Route' : 'Add New Route'}</h3>
                <button onClick={() => { setShowRouteModal(false); setEditingRoute(null); resetRouteForm(); }} className="text-gray-500 hover:text-gray-700">
                  <X className="w-6 h-6" />
                </button>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Route Name *</label>
                  <input type="text" value={routeForm.routeName} onChange={(e) => setRouteForm({ ...routeForm, routeName: e.target.value })}
                    className="w-full px-3 py-2 border dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100" placeholder="e.g., Dar to Kolwezi Route" />
                  <p className="mt-1 text-xs text-gray-500">Descriptive name for this route</p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Starting Point (Origin) *</label>
                    <input type="text" value={routeForm.origin} onChange={(e) => setRouteForm({ ...routeForm, origin: e.target.value })}
                      className="w-full px-3 py-2 border dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100" placeholder="e.g., DAR, TANGA, DSM" required />
                    <p className="mt-1 text-xs text-gray-500">Where the journey starts (determines fuel allocation)</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Destination *</label>
                    <input type="text" value={routeForm.destination} onChange={(e) => setRouteForm({ ...routeForm, destination: e.target.value })}
                      className="w-full px-3 py-2 border dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100" placeholder="e.g., KOLWEZI, LUSAKA" />
                    <p className="mt-1 text-xs text-gray-500">Final destination (will be auto-uppercased)</p>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Destination Aliases</label>
                  <input type="text" value={routeForm.destinationAliases} onChange={(e) => setRouteForm({ ...routeForm, destinationAliases: e.target.value })}
                    className="w-full px-3 py-2 border dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100" placeholder="e.g., DSM, DAR (comma-separated)" />
                  <p className="mt-1 text-xs text-gray-500">Alternative names for destination (e.g., "DSM, DAR" for Dar es Salaam)</p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="relative" ref={routeTypeDropdownRef}>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Route Type *</label>
                    <button
                      type="button"
                      onClick={() => setShowRouteTypeDropdown(!showRouteTypeDropdown)}
                      className="w-full px-3 py-2 border dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 text-left flex items-center justify-between"
                    >
                      <span>{routeForm.routeType === 'IMPORT' ? 'Import (Going/Outbound)' : 'Export (Return/Inbound)'}</span>
                      <ChevronDown className={`w-4 h-4 flex-shrink-0 transition-transform ${showRouteTypeDropdown ? 'rotate-180' : ''}`} />
                    </button>
                    {showRouteTypeDropdown && (
                      <div className="absolute z-50 w-full mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-md shadow-lg">
                        <button
                          type="button"
                          onClick={() => {
                            setRouteForm({ ...routeForm, routeType: 'IMPORT' });
                            setShowRouteTypeDropdown(false);
                          }}
                          className={`w-full px-3 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors flex items-center justify-between ${
                            routeForm.routeType === 'IMPORT' ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400' : 'text-gray-900 dark:text-gray-100'
                          }`}
                        >
                          <span>Import (Going/Outbound)</span>
                          {routeForm.routeType === 'IMPORT' && <Check className="w-4 h-4" />}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setRouteForm({ ...routeForm, routeType: 'EXPORT' });
                            setShowRouteTypeDropdown(false);
                          }}
                          className={`w-full px-3 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors flex items-center justify-between ${
                            routeForm.routeType === 'EXPORT' ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400' : 'text-gray-900 dark:text-gray-100'
                          }`}
                        >
                          <span>Export (Return/Inbound)</span>
                          {routeForm.routeType === 'EXPORT' && <Check className="w-4 h-4" />}
                        </button>
                      </div>
                    )}
                    <p className="mt-1 text-xs text-gray-500">Import = outgoing routes, Export = return routes</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Default Total Liters *</label>
                    <input type="number" value={routeForm.defaultTotalLiters} onChange={(e) => setRouteForm({ ...routeForm, defaultTotalLiters: e.target.value })}
                      className="w-full px-3 py-2 border dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100" placeholder="2400" />
                    <p className="mt-1 text-xs text-gray-500">Default liters assigned for this route</p>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Description (Optional)</label>
                  <textarea value={routeForm.description} onChange={(e) => setRouteForm({ ...routeForm, description: e.target.value })}
                    className="w-full px-3 py-2 border dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100" rows={3} placeholder="Additional notes about this route..." />
                </div>
              </div>
              <div className="flex gap-3 mt-6">
                <button onClick={() => { setShowRouteModal(false); setEditingRoute(null); resetRouteForm(); }}
                  className="flex-1 px-4 py-2 border dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700">Cancel</button>
                <button onClick={editingRoute ? handleUpdateRoute : handleCreateRoute}
                  disabled={savingRoute}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2">
                  {savingRoute ? (
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <Save className="w-4 h-4" />
                  )}
                  {savingRoute
                    ? (editingRoute ? 'Updating…' : 'Creating…')
                    : (editingRoute ? 'Update' : 'Create')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showRouteChoice && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg max-w-lg w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100">Configure Route</h3>
                  <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                    <span className="font-semibold text-blue-600 dark:text-blue-400">
                      {choiceOrigin ? `${choiceOrigin} → ${choiceDestination}` : choiceDestination}
                    </span>
                    {' '}isn’t configured yet.
                    {sameOriginRoutes.length > 0
                      ? ' Is it another name for a same-start route you already have, or a brand-new route?'
                      : ' No existing route shares this starting point — create a new route.'}
                  </p>
                </div>
                <button onClick={() => setShowRouteChoice(false)} className="text-gray-500 hover:text-gray-700 flex-shrink-0">
                  <X className="w-6 h-6" />
                </button>
              </div>

              {/* Option 1: alias — only when same-origin routes exist */}
              {sameOriginRoutes.length > 0 && (
                <>
                  <div className="border dark:border-gray-700 rounded-lg p-4">
                    <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Add as an alias of an existing route</h4>
                    <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                      Only routes that start at <span className="font-medium">{choiceOrigin}</span> are listed. “{choiceDestination}” will inherit that route’s liters.
                    </p>

                    <input
                      type="text"
                      value={aliasSearch}
                      onChange={(e) => setAliasSearch(e.target.value)}
                      placeholder="Search same-origin routes…"
                      className="mt-3 w-full px-3 py-2 text-sm border dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100"
                    />

                    <div className="mt-2 max-h-48 overflow-y-auto border dark:border-gray-700 rounded-lg divide-y dark:divide-gray-700">
                      {sameOriginRoutes
                        .filter(r => {
                          const q = aliasSearch.trim().toLowerCase();
                          if (!q) return true;
                          return (
                            r.routeName.toLowerCase().includes(q) ||
                            r.destination.toLowerCase().includes(q) ||
                            (r.origin || '').toLowerCase().includes(q) ||
                            (r.destinationAliases || []).some(a => a.toLowerCase().includes(q))
                          );
                        })
                        .map(r => (
                          <button
                            key={String(r._id)}
                            type="button"
                            onClick={() => setAliasRouteId(r._id)}
                            className={`w-full text-left px-3 py-2 text-sm flex items-center justify-between transition-colors ${
                              aliasRouteId === r._id
                                ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300'
                                : 'hover:bg-gray-50 dark:hover:bg-gray-700/50 text-gray-900 dark:text-gray-100'
                            }`}
                          >
                            <span className="min-w-0">
                              <span className="font-medium">{r.routeName}</span>
                              <span className="block text-xs text-gray-500 dark:text-gray-400 truncate">
                                {r.origin ? `${r.origin} → ` : ''}{r.destination} · {r.defaultTotalLiters} L
                              </span>
                            </span>
                            {aliasRouteId === r._id && <Check className="w-4 h-4 flex-shrink-0" />}
                          </button>
                        ))}
                    </div>

                    <button
                      onClick={handleAddAlias}
                      disabled={savingAlias || !aliasRouteId}
                      className="mt-3 w-full px-4 py-2 text-sm bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    >
                      {savingAlias ? (
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <Plus className="w-4 h-4" />
                      )}
                      {savingAlias ? 'Adding alias…' : 'Add as alias'}
                    </button>
                  </div>

                  <div className="flex items-center gap-3 my-4">
                    <div className="flex-1 h-px bg-gray-200 dark:bg-gray-700" />
                    <span className="text-xs font-medium text-gray-400">OR</span>
                    <div className="flex-1 h-px bg-gray-200 dark:bg-gray-700" />
                  </div>
                </>
              )}

              {/* Option 2: create a new route */}
              <div className="border dark:border-gray-700 rounded-lg p-4">
                <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Create a new route</h4>
                <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                  {sameOriginRoutes.length > 0
                    ? `Use this when “${choiceDestination}” is a genuinely new destination with its own liters allocation.`
                    : `Create ${choiceOrigin ? `${choiceOrigin} → ${choiceDestination}` : choiceDestination} with its own liters allocation.`}
                </p>
                <button
                  onClick={startCreateFromChoice}
                  className="mt-3 w-full px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center justify-center gap-2"
                >
                  <Route className="w-4 h-4" />
                  Create new route
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <ConfirmModal
        open={deleteRouteTarget !== null}
        title="Delete Route"
        message="Are you sure you want to delete this route? This action cannot be undone."
        variant="danger"
        loading={deletingRoute}
        onConfirm={confirmDeleteRoute}
        onCancel={() => !deletingRoute && setDeleteRouteTarget(null)}
      />
        </>
      )}
    </div>
  );
}
