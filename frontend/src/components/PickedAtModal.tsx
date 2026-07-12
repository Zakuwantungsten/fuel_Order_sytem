import React, { useState, useEffect, useCallback } from 'react';
import { toast } from 'react-toastify';
import { X, MapPin, Loader2, AlertTriangle } from 'lucide-react';
import { LPODetail, FuelStationConfig } from '../types';
import { lpoDocumentsAPI, fuelRecordsAPI, FuelAutomationConfig } from '../services/api';
import { configService } from '../services/configService';
import { FUEL_RECORD_COLUMNS } from '../services/cancellationService';

interface PickedAtSource {
  id?: string;
  lpoNo: string;
  station: string;
}

interface PickedAtModalProps {
  isOpen: boolean;
  onClose: () => void;
  sourceLpo: PickedAtSource;
  entry: LPODetail;
  fuelAutomation: FuelAutomationConfig | null;
  onComplete: () => void;
}

const ALL_FUEL_COLUMNS = [...FUEL_RECORD_COLUMNS.going, ...FUEL_RECORD_COLUMNS.return];

const isSpecialEntry = (e: LPODetail): boolean => {
  const doUp = (e.doNo || '').toUpperCase().trim();
  return (
    (e as any).isDriverAccount === true ||
    (e as any).isRefer === true ||
    doUp === '' ||
    doUp === 'NIL' ||
    doUp === 'N/A' ||
    doUp === 'REF' ||
    doUp === 'DA' ||
    doUp === 'PENDING'
  );
};

/**
 * In-place picked-at: keep the truck on this LPO, override fill station only.
 */
const PickedAtModal: React.FC<PickedAtModalProps> = ({
  isOpen,
  onClose,
  sourceLpo,
  entry,
  fuelAutomation,
  onComplete,
}) => {
  const [targetStation, setTargetStation] = useState('');
  const [customStationName, setCustomStationName] = useState('');
  const [customCountry, setCustomCountry] = useState('Zambia');
  const [customGoingCheckpoint, setCustomGoingCheckpoint] = useState('');
  const [customReturnCheckpoint, setCustomReturnCheckpoint] = useState('');
  const [revertField, setRevertField] = useState('');
  const [addField, setAddField] = useState('');
  const [availableStations, setAvailableStations] = useState<FuelStationConfig[]>([]);
  const [loadingStations, setLoadingStations] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [direction, setDirection] = useState<'going' | 'returning' | null>(null);
  const [resolving, setResolving] = useState(false);
  const [resolveError, setResolveError] = useState<string | null>(null);

  const special = isSpecialEntry(entry);
  const isCustomTarget = targetStation.toUpperCase() === 'CUSTOM';
  const isCashTarget = targetStation.toUpperCase() === 'CASH';
  const manualMode = (!fuelAutomation?.lpoPickupAuto || isCustomTarget) && !special;
  const currentPickedAt = (entry.pickedAtStation || '').toString().trim();
  const orderStation = sourceLpo.station;

  useEffect(() => {
    if (!isOpen) return;
    setTargetStation('');
    setCustomStationName('');
    setCustomCountry('Zambia');
    setCustomGoingCheckpoint('');
    setCustomReturnCheckpoint('');
    setRevertField('');
    setAddField('');
    setDirection(null);
    setResolveError(null);
  }, [isOpen, entry.doNo, entry.truckNo]);

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    setLoadingStations(true);
    configService
      .getStations()
      .then((s) => {
        if (!cancelled) setAvailableStations(s);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoadingStations(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  const resolveDirection = useCallback(async () => {
    if (!isOpen || special) return;
    setResolving(true);
    setResolveError(null);
    try {
      const res = await fuelRecordsAPI.getByDoNumber(entry.doNo);
      if (!res?.fuelRecord) {
        setResolveError(`No fuel record for DO ${entry.doNo}`);
        setDirection(null);
        return;
      }
      setDirection(res.direction);
    } catch {
      setResolveError('Failed to resolve fuel record direction');
      setDirection(null);
    } finally {
      setResolving(false);
    }
  }, [isOpen, special, entry.doNo]);

  useEffect(() => {
    resolveDirection();
  }, [resolveDirection]);

  useEffect(() => {
    if (!targetStation || isCustomTarget || isCashTarget) return;
    const cfg = availableStations.find((s) => s.stationName === targetStation);
    if (direction === 'returning') {
      setAddField(cfg?.fuelRecordFieldReturning || '');
    } else if (direction === 'going') {
      setAddField(cfg?.fuelRecordFieldGoing || '');
    }
  }, [targetStation, direction, availableStations, isCustomTarget, isCashTarget]);

  // Prefill revert from current effective station; keep order-station add handy for clear.
  useEffect(() => {
    if (!manualMode || !direction) return;
    const effective = currentPickedAt || orderStation;
    const currentCfg = availableStations.find(
      (s) => s.stationName.toUpperCase() === effective.toUpperCase()
    );
    const orderCfg = availableStations.find(
      (s) => s.stationName.toUpperCase() === orderStation.toUpperCase()
    );
    if (direction === 'returning') {
      if (currentCfg?.fuelRecordFieldReturning) setRevertField(currentCfg.fuelRecordFieldReturning);
      if (!targetStation && orderCfg?.fuelRecordFieldReturning) {
        setAddField(orderCfg.fuelRecordFieldReturning);
      }
    } else {
      if (currentCfg?.fuelRecordFieldGoing) setRevertField(currentCfg.fuelRecordFieldGoing);
      if (!targetStation && orderCfg?.fuelRecordFieldGoing) {
        setAddField(orderCfg.fuelRecordFieldGoing);
      }
    }
  }, [manualMode, direction, currentPickedAt, orderStation, availableStations, targetStation]);

  if (!isOpen) return null;

  const canSubmit =
    !!targetStation &&
    (!isCustomTarget || !!customStationName.trim()) &&
    !resolving &&
    (special || !resolveError) &&
    (!manualMode || (!!revertField && !!addField));

  const handleSubmit = async (clear = false) => {
    if (!sourceLpo.id) {
      toast.error('LPO id missing');
      return;
    }
    setSubmitting(true);
    try {
      await lpoDocumentsAPI.setPickedAt({
        lpoId: sourceLpo.id,
        doNo: entry.doNo,
        truckNo: entry.truckNo,
        targetStation: clear ? null : isCustomTarget ? 'CUSTOM' : targetStation,
        customStationName: clear ? undefined : isCustomTarget ? customStationName.trim() : undefined,
        customCountry: clear ? undefined : isCustomTarget ? customCountry : undefined,
        customGoingCheckpoint: clear
          ? undefined
          : isCustomTarget
            ? customGoingCheckpoint || undefined
            : undefined,
        customReturnCheckpoint: clear
          ? undefined
          : isCustomTarget
            ? customReturnCheckpoint || undefined
            : undefined,
        revertField: manualMode ? revertField : undefined,
        addField: manualMode ? addField : undefined,
      });
      toast.success(
        clear
          ? `Cleared picked-at for ${entry.truckNo}`
          : `${entry.truckNo} marked as picked at ${isCustomTarget ? customStationName : targetStation}`
      );
      onComplete();
    } catch (err: any) {
      toast.error(err.response?.data?.message || err.message || 'Failed to set picked-at');
    } finally {
      setSubmitting(false);
    }
  };

  const stationOptions = availableStations
    .map((s) => s.stationName)
    .filter((n) => n.toUpperCase() !== orderStation.toUpperCase());

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b dark:border-gray-700">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
            <MapPin className="w-5 h-5 text-teal-600" />
            Picked at
          </h3>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          <p className="text-sm text-gray-600 dark:text-gray-300">
            Truck <span className="font-semibold">{entry.truckNo}</span> (DO {entry.doNo}) stays on LPO{' '}
            <span className="font-semibold">{sourceLpo.lpoNo}</span> ordered at{' '}
            <span className="font-semibold">{orderStation}</span>. Set where it actually filled.
          </p>

          {currentPickedAt && (
            <div className="text-xs font-medium text-teal-700 dark:text-teal-300 bg-teal-50 dark:bg-teal-900/30 rounded px-3 py-2">
              Currently picked at: {currentPickedAt}
            </div>
          )}

          {(resolving || resolveError) && !special && (
            <div
              className={`flex items-start gap-2 text-xs rounded px-3 py-2 ${
                resolveError
                  ? 'bg-amber-50 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200'
                  : 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-200'
              }`}
            >
              {resolving ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin mt-0.5" />
              ) : (
                <AlertTriangle className="w-3.5 h-3.5 mt-0.5" />
              )}
              <span>{resolving ? 'Resolving journey direction…' : resolveError}</span>
            </div>
          )}

          <div>
            <label className="block text-xs font-bold uppercase text-gray-500 mb-1">
              Filled at station
            </label>
            <select
              value={targetStation}
              onChange={(e) => setTargetStation(e.target.value)}
              disabled={loadingStations || submitting}
              className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
            >
              <option value="">Select station…</option>
              {stationOptions.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
              <option value="CUSTOM">CUSTOM (unlisted)</option>
              <option value="CASH">CASH</option>
            </select>
          </div>

          {isCustomTarget && (
            <div className="space-y-2 border border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-3">
              <input
                type="text"
                placeholder="Custom station name"
                value={customStationName}
                onChange={(e) => setCustomStationName(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700"
              />
              <input
                type="text"
                placeholder="Country (default Zambia)"
                value={customCountry}
                onChange={(e) => setCustomCountry(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700"
              />
              <select
                value={customGoingCheckpoint}
                onChange={(e) => setCustomGoingCheckpoint(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700"
              >
                <option value="">Going checkpoint…</option>
                {ALL_FUEL_COLUMNS.map((c) => (
                  <option key={c.field} value={c.field}>
                    {c.label}
                  </option>
                ))}
              </select>
              <select
                value={customReturnCheckpoint}
                onChange={(e) => setCustomReturnCheckpoint(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700"
              >
                <option value="">Return checkpoint…</option>
                {ALL_FUEL_COLUMNS.map((c) => (
                  <option key={c.field} value={c.field}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
          )}

          {manualMode && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold uppercase text-gray-500 mb-1">
                  Revert checkpoint
                </label>
                <select
                  value={revertField}
                  onChange={(e) => setRevertField(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700"
                >
                  <option value="">Select…</option>
                  {ALL_FUEL_COLUMNS.map((c) => (
                    <option key={c.field} value={c.field}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold uppercase text-gray-500 mb-1">
                  Add at picked-at
                </label>
                <select
                  value={addField}
                  onChange={(e) => setAddField(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700"
                >
                  <option value="">Select…</option>
                  {ALL_FUEL_COLUMNS.map((c) => (
                    <option key={c.field} value={c.field}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 px-5 py-4 border-t dark:border-gray-700">
          {currentPickedAt && (
            <button
              type="button"
              disabled={submitting || (manualMode && (!revertField || !addField))}
              onClick={() => handleSubmit(true)}
              className="px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50"
            >
              Clear picked-at
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-2 text-sm font-medium text-gray-600 dark:text-gray-300"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!canSubmit || submitting}
            onClick={() => handleSubmit(false)}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-white bg-teal-600 hover:bg-teal-700 rounded-lg disabled:opacity-50"
          >
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <MapPin className="w-4 h-4" />}
            Save picked at
          </button>
        </div>
      </div>
    </div>
  );
};

export default PickedAtModal;
