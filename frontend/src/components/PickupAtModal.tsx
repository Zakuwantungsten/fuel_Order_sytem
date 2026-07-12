import React, { useState, useEffect, useCallback } from 'react';
import { toast } from 'react-toastify';
import { X, ArrowRight, Loader2, CheckCircle, AlertTriangle, Eye, Trash2, Lock } from 'lucide-react';
import { LPODetail, FuelStationConfig } from '../types';
import { lpoDocumentsAPI, fuelRecordsAPI, FuelAutomationConfig } from '../services/api';
import { configService } from '../services/configService';
import { getStationDisplayInfo } from '../services/lpoForwardingService';
import { FUEL_RECORD_COLUMNS } from '../services/cancellationService';
import FuelRecordInspectModal from './FuelRecordInspectModal';

interface PickupSource {
  id?: string;
  lpoNo: string;
  station: string;
  orderOf: string;
  date: string;
}

interface PickupAtModalProps {
  isOpen: boolean;
  onClose: () => void;
  sourceLpo: PickupSource;
  selectedEntries: LPODetail[];
  fuelAutomation: FuelAutomationConfig | null;
  onComplete: () => void;
}

// Per-truck resolution (keyed by `${doNo}-${truckNo}`): only direction (from the DO)
// and the fuel-record id (for Inspect) are per-truck now — the actual revert/add
// columns are chosen once per direction at the top.
interface TruckMeta {
  loading: boolean;
  error: string | null;
  direction: 'going' | 'returning' | null;
  fuelRecordId: string | number | null;
  // REF / NIL / Driver-Account entry: no fuel record, so direction resolution,
  // checkpoint selection and fuel netting are all skipped.
  special?: boolean;
}

const blankMeta = (): TruckMeta => ({ loading: true, error: null, direction: null, fuelRecordId: null });

const entryKey = (e: LPODetail) => `${e.doNo}-${e.truckNo}`;

// REF / NIL / Driver-Account entries carry no fuel record — they can be moved by
// pick-up, but never touch fuel records and need no checkpoint columns.
const isSpecialEntry = (e: LPODetail): boolean => {
  const doUp = (e.doNo || '').toUpperCase().trim();
  return (
    (e as any).isDriverAccount === true ||
    (e as any).isRefer === true ||
    doUp === '' || doUp === 'NIL' || doUp === 'N/A' || doUp === 'REF' || doUp === 'DA' || doUp === 'PENDING'
  );
};

// Custom-station defaults are stored alongside the LPO detail-form draft.
const readCustomDefaults = (): { rate: number; liters: number } => {
  try {
    const raw = localStorage.getItem('lpo_form_draft');
    if (!raw) return { rate: 0, liters: 0 };
    const s = JSON.parse(raw);
    return { rate: Number(s?.customRate) || 0, liters: Number(s?.customDefaultLiters) || 0 };
  } catch {
    return { rate: 0, liters: 0 };
  }
};

const PickupAtModal: React.FC<PickupAtModalProps> = ({
  isOpen,
  onClose,
  sourceLpo,
  selectedEntries,
  fuelAutomation,
  onComplete,
}) => {
  const [targetStation, setTargetStation] = useState('');
  const [customStationName, setCustomStationName] = useState('');
  const [customCountry, setCustomCountry] = useState('Zambia');
  const [rate, setRate] = useState(0);
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [orderOf, setOrderOf] = useState('');
  const [bulkLiters, setBulkLiters] = useState(0);
  const [nextLpoNo, setNextLpoNo] = useState('');

  // Manual checkpoints — chosen once per direction (not per row).
  const [revertGoing, setRevertGoing] = useState('');
  const [revertReturning, setRevertReturning] = useState('');
  const [addGoing, setAddGoing] = useState('');
  const [addReturning, setAddReturning] = useState('');

  const [availableStations, setAvailableStations] = useState<FuelStationConfig[]>([]);
  const [loadingStations, setLoadingStations] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState<{ lpoNo: string; count: number } | null>(null);

  const [entries, setEntries] = useState<LPODetail[]>(() => selectedEntries);
  const [litersByKey, setLitersByKey] = useState<Record<string, number>>(() =>
    Object.fromEntries(selectedEntries.map((e) => [entryKey(e), e.liters]))
  );
  const [meta, setMeta] = useState<Record<string, TruckMeta>>({});
  const [inspect, setInspect] = useState<{ id: string | number; truck: string } | null>(null);

  const isCustomTarget = targetStation.toUpperCase() === 'CUSTOM';
  const isCashTarget = targetStation.toUpperCase() === 'CASH';
  const manualMode = !fuelAutomation?.lpoPickupAuto || isCustomTarget;
  const showRateAndLitersBox = isCustomTarget || isCashTarget;

  // Reset scalar config on open
  useEffect(() => {
    if (!isOpen) return;
    setSuccess(null);
    setNextLpoNo('');
    setTargetStation('');
    setCustomStationName('');
    setCustomCountry('Zambia');
    setRate(0);
    setBulkLiters(0);
    setDate(new Date().toISOString().split('T')[0]);
    setOrderOf(sourceLpo.orderOf);
    setRevertGoing(''); setRevertReturning(''); setAddGoing(''); setAddReturning('');
    // Key on the stable LPO id — `sourceLpo` is a fresh object literal on every
    // parent render, so depending on its identity would wipe the form (and re-blank
    // the LPO number) on any parent re-render, e.g. a scroll inside the modal.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, sourceLpo.id]);

  // Load stations + preview the next LPO number (same endpoint the detail form uses).
  // A `cancelled` guard drops stale responses if the modal is closed/reopened before
  // these slow calls resolve, so an out-of-order reply can't overwrite fresh state.
  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    setLoadingStations(true);
    configService.getStations()
      .then((s) => { if (!cancelled) setAvailableStations(s); })
      .catch(() => { /* non-fatal */ })
      .finally(() => { if (!cancelled) setLoadingStations(false); });
    lpoDocumentsAPI.getNextLpoNumber()
      .then((n) => { if (!cancelled) setNextLpoNo(n); })
      .catch(() => { if (!cancelled) setNextLpoNo(''); });
    return () => { cancelled = true; };
  }, [isOpen]);

  // Station change: listed stations auto-fill their rate; CUSTOM pulls saved defaults.
  useEffect(() => {
    if (!targetStation) return;
    if (isCustomTarget) {
      const d = readCustomDefaults();
      if (d.rate > 0) setRate(d.rate);
      if (d.liters > 0) {
        setBulkLiters(d.liters);
        setLitersByKey((prev) => Object.fromEntries(Object.keys(prev).map((k) => [k, d.liters])));
      }
      // CUSTOM station has no config — clear any previously auto-set add fields.
      setAddGoing(''); setAddReturning('');
    } else if (!isCashTarget) {
      const cfg = availableStations.find((s) => s.stationName === targetStation);
      setRate(cfg?.defaultRate || getStationDisplayInfo(targetStation).rate);
      // Auto-derive the add-at-target checkpoint from the station's own config.
      // The truck's resolved direction picks going vs returning at submit time.
      setAddGoing(cfg?.fuelRecordFieldGoing || '');
      setAddReturning(cfg?.fuelRecordFieldReturning || '');
    } else {
      // CASH — no single fixed checkpoint; clear so user can pick if manual mode fires.
      setAddGoing(''); setAddReturning('');
    }
  }, [targetStation, isCustomTarget, isCashTarget, availableStations]);

  // Resolve each truck's direction (from DO) + fuel record id. Runs once on open.
  const resolveTrucks = useCallback(async () => {
    const init: Record<string, TruckMeta> = {};
    selectedEntries.forEach((e) => { init[entryKey(e)] = blankMeta(); });
    setMeta(init);

    await Promise.all(selectedEntries.map(async (entry) => {
      const key = entryKey(entry);
      // Special entries (REF/NIL/DA) have no fuel record — mark and skip the lookup.
      if (isSpecialEntry(entry)) {
        setMeta((prev) => ({ ...prev, [key]: { loading: false, error: null, direction: null, fuelRecordId: null, special: true } }));
        return;
      }
      try {
        const res = await fuelRecordsAPI.getByDoNumber(entry.doNo);
        if (!res || !res.fuelRecord) {
          setMeta((prev) => ({ ...prev, [key]: { loading: false, error: `No fuel record for DO ${entry.doNo}`, direction: null, fuelRecordId: null } }));
          return;
        }
        const fr: any = res.fuelRecord;
        setMeta((prev) => ({ ...prev, [key]: { loading: false, error: null, direction: res.direction, fuelRecordId: fr.id ?? fr._id ?? null } }));
      } catch {
        setMeta((prev) => ({ ...prev, [key]: { loading: false, error: 'Failed to resolve fuel record', direction: null, fuelRecordId: null } }));
      }
    }));
  }, [selectedEntries]);

  useEffect(() => {
    if (isOpen) resolveTrucks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const setLitersFor = (key: string, value: number) => setLitersByKey((prev) => ({ ...prev, [key]: value }));
  const applyBulkLiters = (value: number) => {
    setBulkLiters(value);
    setLitersByKey((prev) => Object.fromEntries(Object.keys(prev).map((k) => [k, value])));
  };
  const removeEntry = (key: string) => setEntries((prev) => prev.filter((e) => entryKey(e) !== key));
  const litersFor = (e: LPODetail) => litersByKey[entryKey(e)] ?? e.liters;

  // Which directions are present among the selected trucks (drives the dynamic UI).
  const metaList = entries.map((e) => meta[entryKey(e)]);
  const anyLoading = metaList.some((m) => !m || m.loading);
  const hasGoing = metaList.some((m) => m?.direction === 'going');
  const hasReturning = metaList.some((m) => m?.direction === 'returning');
  const unresolvedTrucks = entries.filter((e) => {
    const m = meta[entryKey(e)];
    return m && !m.loading && !m.direction && !m.special;
  });

  // Whether the target station has its own checkpoint fields configured (from the station config).
  // When true, addGoing/addReturning are auto-derived and no "Add at target" dropdown is needed.
  const targetCfg = availableStations.find((s) => s.stationName === targetStation);
  const targetHasAddConfig = !isCustomTarget && !isCashTarget && !!(targetCfg?.fuelRecordFieldGoing || targetCfg?.fuelRecordFieldReturning);

  // Validation flags — only once a target station is chosen (nothing to configure
  // before that) and only for the directions actually present among the trucks.
  const flags: string[] = [];
  if (manualMode && targetStation && !anyLoading) {
    if (unresolvedTrucks.length > 0) {
      flags.push(`No fuel record / direction for: ${unresolvedTrucks.map((e) => e.truckNo).join(', ')}. Remove them or fix the data before continuing.`);
    }
    if (hasGoing && !revertGoing) flags.push('Going trucks: choose the revert-at-source checkpoint.');
    if (hasGoing && !addGoing) flags.push(`Going trucks: the target station "${targetStation}" has no checkpoint configured — set fuelRecordFieldGoing in station config.`);
    if (hasReturning && !revertReturning) flags.push('Returning trucks: choose the revert-at-source checkpoint.');
    if (hasReturning && !addReturning) flags.push(`Returning trucks: the target station "${targetStation}" has no returning checkpoint configured — set fuelRecordFieldReturning in station config.`);
  }

  const manualReady = !manualMode || (
    !anyLoading &&
    unresolvedTrucks.length === 0 &&
    (!hasGoing || (!!revertGoing && !!addGoing)) &&
    (!hasReturning || (!!revertReturning && !!addReturning))
  );
  const allLitersValid = entries.every((e) => litersFor(e) > 0);
  const canSubmit =
    !!sourceLpo.id &&
    entries.length > 0 &&
    !!targetStation &&
    rate > 0 &&
    allLitersValid &&
    (!isCustomTarget || customStationName.trim().length > 0) &&
    manualReady &&
    !submitting;

  const handleSubmit = async () => {
    if (!canSubmit || !sourceLpo.id) return;
    setSubmitting(true);
    try {
      const trucks = entries.map((e) => {
        const m = meta[entryKey(e)];
        const dir = m?.direction;
        // Special entries carry no checkpoints — backend skips fuel netting for them.
        const manualFields = manualMode && !m?.special
          ? {
              revertField: dir === 'returning' ? revertReturning : revertGoing,
              addField: dir === 'returning' ? addReturning : addGoing,
            }
          : {};
        return { doNo: e.doNo, truckNo: e.truckNo, liters: litersFor(e), ...manualFields };
      });

      const result = await lpoDocumentsAPI.pickupAt({
        sourceLpoId: sourceLpo.id,
        targetStation,
        ...(isCustomTarget ? { customStationName, customCountry } : {}),
        rate,
        date,
        orderOf: orderOf || sourceLpo.orderOf,
        ...(nextLpoNo ? { lpoNo: nextLpoNo } : {}),
        trucks,
      });

      setSuccess({ lpoNo: result.pickedUpLpo.lpoNo, count: result.entriesPickedUp });
      toast.success(`Picked up ${result.entriesPickedUp} truck(s) to LPO ${result.pickedUpLpo.lpoNo}`);
      setTimeout(() => { onComplete(); }, 1800);
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to pick up trucks. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  const estTotal = entries.reduce((sum, e) => sum + litersFor(e) * rate, 0);

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex min-h-screen items-center justify-center p-4">
        <div className="fixed inset-0 bg-black/50" onClick={onClose} />

        <div className="relative w-full max-w-3xl bg-white dark:bg-gray-800 rounded-xl shadow-2xl" onClick={(e) => e.stopPropagation()}>
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700 bg-gradient-to-r from-indigo-600 to-blue-600 rounded-t-xl">
            <div className="flex items-center space-x-3">
              <div className="p-2 bg-white/20 rounded-lg"><ArrowRight className="w-5 h-5 text-white" /></div>
              <div>
                <h2 className="text-lg font-semibold text-white">Pick Up At Another Station</h2>
                <p className="text-sm text-indigo-100">
                  Move {entries.length} truck{entries.length !== 1 ? 's' : ''} from LPO {sourceLpo.lpoNo} ({sourceLpo.station})
                </p>
              </div>
            </div>
            <button onClick={onClose} className="p-2 text-white/80 hover:text-white hover:bg-white/10 rounded-lg">
              <X className="w-5 h-5" />
            </button>
          </div>

          {success ? (
            <div className="p-6 text-center">
              <div className="w-16 h-16 mx-auto mb-4 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center">
                <CheckCircle className="w-8 h-8 text-green-600 dark:text-green-400" />
              </div>
              <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2">Picked Up Successfully!</h3>
              <p className="text-gray-600 dark:text-gray-400 mb-1">
                {success.count} truck{success.count !== 1 ? 's' : ''} cancelled on LPO {sourceLpo.lpoNo} and re-ordered at{' '}
                <span className="font-bold">{isCustomTarget ? customStationName : targetStation}</span> as{' '}
                <span className="font-bold text-blue-600">LPO #{success.lpoNo}</span>.
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-3">Closing…</p>
            </div>
          ) : (
            <div className="p-6 max-h-[75vh] overflow-y-auto">
              {/* Config */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-5">
                {/* New LPO number — auto-generated, read-only (like the detail form) */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">New LPO No.</label>
                  <div className="relative">
                    <input
                      type="text"
                      readOnly
                      value={nextLpoNo}
                      placeholder="…"
                      className="w-full px-3 py-2 font-mono tracking-wide border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-900/40 text-gray-900 dark:text-gray-100 cursor-default"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
                      {nextLpoNo ? <Lock className="w-4 h-4" /> : <Loader2 className="w-4 h-4 animate-spin" />}
                    </span>
                  </div>
                  <p className="text-[11px] text-gray-400 mt-1">Auto-generated</p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Target Station *</label>
                  <select
                    value={targetStation}
                    onChange={(e) => setTargetStation(e.target.value)}
                    disabled={loadingStations}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                  >
                    <option value="">{loadingStations ? 'Loading…' : 'Select target station…'}</option>
                    {availableStations
                      .filter((s) => s.stationName !== sourceLpo.station)
                      .map((s) => <option key={s._id} value={s.stationName}>{s.stationName}</option>)}
                    {sourceLpo.station !== 'CASH' && <option value="CASH">CASH</option>}
                    <option value="CUSTOM">CUSTOM (Unlisted Station)</option>
                  </select>
                  {targetStation && !showRateAndLitersBox && (
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Rate: <span className="font-semibold">{rate}</span> /L (from station)</p>
                  )}
                </div>

                {isCustomTarget && (
                  <>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Custom Station Name *</label>
                      <input
                        type="text"
                        value={customStationName}
                        onChange={(e) => setCustomStationName(e.target.value.toUpperCase())}
                        placeholder="e.g., LAKE MWERU"
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 uppercase"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Country</label>
                      <select
                        value={customCountry}
                        onChange={(e) => setCustomCountry(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                      >
                        <option value="Zambia">Zambia</option>
                        <option value="Tanzania">Tanzania</option>
                      </select>
                    </div>
                  </>
                )}

                {showRateAndLitersBox && (
                  <>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Rate per Liter *</label>
                      <input
                        type="number" step="0.01" min="0" value={rate}
                        onChange={(e) => setRate(parseFloat(e.target.value) || 0)}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Liters (apply to all)</label>
                      <input
                        type="number" min="0" value={bulkLiters || ''}
                        onChange={(e) => applyBulkLiters(parseInt(e.target.value) || 0)}
                        placeholder="e.g., 350"
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                      />
                    </div>
                  </>
                )}

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Date</label>
                  <input
                    type="date" value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                  />
                </div>
              </div>

              {/* Manual checkpoints — Going & Returning side-by-side per action, shown
                  only once a target is chosen and only for the directions present. */}
              {manualMode && targetStation && (
                <div className="mb-5 border border-amber-200 dark:border-amber-800 bg-amber-50/60 dark:bg-amber-900/10 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-sm font-semibold text-amber-800 dark:text-amber-300">Checkpoints (manual)</h4>
                    <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
                      {isCustomTarget ? 'Required for CUSTOM' : 'Automation off'}
                    </span>
                  </div>

                  {anyLoading ? (
                    <p className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-2">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" /> Resolving truck directions…
                    </p>
                  ) : !hasGoing && !hasReturning ? (
                    <p className="text-xs text-gray-500 dark:text-gray-400">No directions resolved yet.</p>
                  ) : (
                    <div className="space-y-3">
                      {/* Going — revert-at-source (always manual) + add-at-target (auto from station config) */}
                      {hasGoing && (
                        <div>
                          <p className="text-[11px] font-bold uppercase tracking-wide text-blue-700 dark:text-blue-300 mb-1">Going</p>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            <div>
                              <label className="block text-[10px] font-bold text-gray-600 dark:text-gray-300 uppercase mb-1">Revert at source</label>
                              <select value={revertGoing} onChange={(e) => setRevertGoing(e.target.value)}
                                className="w-full px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100">
                                <option value="">Select column…</option>
                                {FUEL_RECORD_COLUMNS.going.map((c) => <option key={c.field} value={c.field}>{c.label}</option>)}
                              </select>
                            </div>
                            <div>
                              <label className="block text-[10px] font-bold text-gray-600 dark:text-gray-300 uppercase mb-1">Add at target</label>
                              {targetHasAddConfig && addGoing ? (
                                <div className="px-2 py-1.5 text-sm border border-green-300 dark:border-green-700 rounded bg-green-50 dark:bg-green-900/20 text-green-800 dark:text-green-300 font-mono">
                                  {FUEL_RECORD_COLUMNS.going.find((c) => c.field === addGoing)?.label || addGoing}
                                  <span className="ml-2 text-[10px] text-green-600 dark:text-green-400 normal-case font-sans">from station config</span>
                                </div>
                              ) : (
                                <select value={addGoing} onChange={(e) => setAddGoing(e.target.value)}
                                  className="w-full px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100">
                                  <option value="">Select column…</option>
                                  {FUEL_RECORD_COLUMNS.going.map((c) => <option key={c.field} value={c.field}>{c.label}</option>)}
                                </select>
                              )}
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Returning — revert-at-source (always manual) + add-at-target (auto from station config) */}
                      {hasReturning && (
                        <div>
                          <p className="text-[11px] font-bold uppercase tracking-wide text-green-700 dark:text-green-300 mb-1">Returning</p>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            <div>
                              <label className="block text-[10px] font-bold text-gray-600 dark:text-gray-300 uppercase mb-1">Revert at source</label>
                              <select value={revertReturning} onChange={(e) => setRevertReturning(e.target.value)}
                                className="w-full px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100">
                                <option value="">Select column…</option>
                                {FUEL_RECORD_COLUMNS.return.map((c) => <option key={c.field} value={c.field}>{c.label}</option>)}
                              </select>
                            </div>
                            <div>
                              <label className="block text-[10px] font-bold text-gray-600 dark:text-gray-300 uppercase mb-1">Add at target</label>
                              {targetHasAddConfig && addReturning ? (
                                <div className="px-2 py-1.5 text-sm border border-green-300 dark:border-green-700 rounded bg-green-50 dark:bg-green-900/20 text-green-800 dark:text-green-300 font-mono">
                                  {FUEL_RECORD_COLUMNS.return.find((c) => c.field === addReturning)?.label || addReturning}
                                  <span className="ml-2 text-[10px] text-green-600 dark:text-green-400 normal-case font-sans">from station config</span>
                                </div>
                              ) : (
                                <select value={addReturning} onChange={(e) => setAddReturning(e.target.value)}
                                  className="w-full px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100">
                                  <option value="">Select column…</option>
                                  {FUEL_RECORD_COLUMNS.return.map((c) => <option key={c.field} value={c.field}>{c.label}</option>)}
                                </select>
                              )}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Validation flags */}
              {flags.length > 0 && (
                <div className="mb-5 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                  <ul className="space-y-1">
                    {flags.map((f, i) => (
                      <li key={i} className="text-xs text-red-700 dark:text-red-300 flex items-start gap-2">
                        <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" /> {f}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Trucks table */}
              <div className="mb-5">
                <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Trucks ({entries.length})</h4>
                <div className="overflow-x-auto border border-gray-200 dark:border-gray-700 rounded-lg">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 dark:bg-gray-700/50 text-gray-600 dark:text-gray-300">
                      <tr>
                        <th className="px-3 py-2 text-left font-medium">Truck</th>
                        <th className="px-3 py-2 text-left font-medium">DO</th>
                        <th className="px-3 py-2 text-left font-medium">Dir.</th>
                        <th className="px-3 py-2 text-right font-medium">Liters</th>
                        <th className="px-3 py-2 text-right font-medium">Rate</th>
                        <th className="px-3 py-2 text-center font-medium">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                      {entries.map((entry) => {
                        const key = entryKey(entry);
                        const m = meta[key];
                        return (
                          <tr key={key} className="text-gray-900 dark:text-gray-100">
                            <td className="px-3 py-2 font-semibold whitespace-nowrap">{entry.truckNo}</td>
                            <td className="px-3 py-2 text-gray-500 dark:text-gray-400 whitespace-nowrap">{entry.doNo}</td>
                            <td className="px-3 py-2">
                              {m?.loading ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-500" />
                              ) : m?.special ? (
                                <span title="No fuel record (REF / NIL / Driver Account)"
                                  className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-300">N/A</span>
                              ) : m?.error || !m?.direction ? (
                                <span title={m?.error || 'No direction'}><AlertTriangle className="w-3.5 h-3.5 text-amber-500" /></span>
                              ) : (
                                <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded-full ${
                                  m.direction === 'going'
                                    ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
                                    : 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300'
                                }`}>
                                  {m.direction === 'going' ? 'GOING' : 'RETURNING'}
                                </span>
                              )}
                            </td>
                            <td className="px-3 py-2 text-right">
                              <input
                                type="number" min="0"
                                value={litersByKey[key] ?? entry.liters}
                                onChange={(e) => setLitersFor(key, parseInt(e.target.value) || 0)}
                                className="w-20 px-2 py-1 text-right text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                              />
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums text-gray-600 dark:text-gray-300 whitespace-nowrap">{rate || '—'}</td>
                            <td className="px-3 py-2">
                              <div className="flex items-center justify-center gap-1">
                                <button
                                  onClick={() => m?.fuelRecordId != null && setInspect({ id: m.fuelRecordId, truck: entry.truckNo })}
                                  disabled={m?.fuelRecordId == null}
                                  title="Inspect fuel record"
                                  className="p-1 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded disabled:opacity-30 disabled:cursor-not-allowed"
                                >
                                  <Eye className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() => removeEntry(key)}
                                  title="Remove from pick-up"
                                  className="p-1 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                      {entries.length === 0 && (
                        <tr><td colSpan={6} className="px-3 py-6 text-center text-gray-400">No trucks selected.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Estimated total */}
              {targetStation && rate > 0 && entries.length > 0 && (
                <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded-lg p-4 mb-5">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-blue-700 dark:text-blue-300">Estimated Total:</span>
                    <span className="text-xl font-bold text-blue-600 dark:text-blue-400">{estTotal.toLocaleString()}</span>
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="flex items-center justify-end space-x-3 pt-4 border-t border-gray-200 dark:border-gray-700">
                <button onClick={onClose} disabled={submitting} className="px-4 py-2 text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg">
                  Cancel
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={!canSubmit}
                  className="flex items-center space-x-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 disabled:cursor-not-allowed text-white rounded-lg"
                >
                  {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
                  <span>{submitting ? 'Picking up…' : 'Pick Up Trucks'}</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {inspect && (
        <FuelRecordInspectModal
          isOpen={!!inspect}
          onClose={() => setInspect(null)}
          fuelRecordId={inspect.id}
          truckNumber={inspect.truck}
        />
      )}
    </div>
  );
};

export default PickupAtModal;
