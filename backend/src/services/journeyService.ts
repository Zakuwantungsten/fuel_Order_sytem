/**
 * Journey lifecycle service.
 *
 * Journey model (per FuelRecord):
 *   - A truck has at most ONE `active` journey; later journeys created while one is
 *     active are `queued` (with a queueOrder).
 *   - A journey is considered STARTED — and therefore the truck's previous active
 *     journey COMPLETED — the moment one of the configured "start columns" (e.g.
 *     darYard / darGoing / moroGoing) is filled on a queued journey. Filling those
 *     origin-leg columns means the truck has physically begun that new trip.
 *
 * This replaces the old balance===0 + return-checkpoint completion rule, which was
 * hardcoded and never fired for the LPO-driven path.
 */
import mongoose from 'mongoose';
import { FuelRecord } from '../models';
import { SystemConfig, IFuelAutomationConfig, DEFAULT_FUEL_AUTOMATION } from '../models/SystemConfig';
import { emitDataChange } from './websocket';
import { logger } from '../utils';

/** Default start columns when no journey_config has been saved yet. */
export const DEFAULT_START_COLUMNS = ['darYard', 'darGoing', 'moroGoing'];

/**
 * All fuel "going"/origin columns that may be selected as start columns in the
 * Journey Config UI. Filling any of these indicates an outbound trip is underway.
 */
export const SELECTABLE_START_COLUMNS = [
  'mmsaYard',
  'tangaYard',
  'darYard',
  'darGoing',
  'moroGoing',
  'mbeyaGoing',
  'tdmGoing',
  'zambiaGoing',
  'congoFuel',
];

// Short-lived cache so the hot LPO/manual paths don't hit the DB on every fill.
let _startColumnsCache: string[] | null = null;
let _cacheUpdatedAt = 0;
const CACHE_TTL_MS = 30000;

// Separate short-lived cache for the fuel-automation flags. Read inside the hot
// LPO/DO bulk loops, so it must avoid an N+1 DB hit per entry. Invalidated together
// with the start-columns cache whenever journey_config is saved.
let _fuelAutomationCache: IFuelAutomationConfig | null = null;
let _fuelAutomationCacheUpdatedAt = 0;

// Cache for the manager-access config (super-manager stations + LPO lookback).
// Read on every manager/super_manager LPO list request, so it must not hit the DB
// each time. Invalidated together with the rest of journey_config on save.
export interface ManagerAccessConfig {
  /** Stations a super_manager may view. Empty => all (minus client-side excludes). */
  superManagerStations: string[];
  /** Days back manager-tier roles may see LPOs. 0 => unlimited. */
  managerLpoLookbackDays: number;
}
let _managerAccessCache: ManagerAccessConfig | null = null;
let _managerAccessCacheUpdatedAt = 0;

/** Drop the cache so the next read reflects a freshly-saved config. */
export function invalidateJourneyConfigCache(): void {
  _startColumnsCache = null;
  _cacheUpdatedAt = 0;
  _fuelAutomationCache = null;
  _fuelAutomationCacheUpdatedAt = 0;
  _managerAccessCache = null;
  _managerAccessCacheUpdatedAt = 0;
}

/**
 * Read the manager-access config (cached, 30s TTL). Used to scope the manager /
 * super_manager LPO views server-side. Never throws — on error returns the
 * permissive default (all stations, unlimited lookback) so a config read failure
 * can't lock managers out of their own data.
 */
export async function getManagerAccessConfig(): Promise<ManagerAccessConfig> {
  const now = Date.now();
  if (_managerAccessCache && now - _managerAccessCacheUpdatedAt < CACHE_TTL_MS) {
    return _managerAccessCache;
  }

  try {
    const cfg = await SystemConfig.findOne({ configType: 'journey_config', isDeleted: false })
      .select('journeyConfig.superManagerStations journeyConfig.managerLpoLookbackDays')
      .lean();
    const stations = (cfg?.journeyConfig?.superManagerStations || [])
      .map((s) => (s || '').toUpperCase().trim())
      .filter(Boolean);
    const lookbackRaw = Number(cfg?.journeyConfig?.managerLpoLookbackDays);
    const result: ManagerAccessConfig = {
      superManagerStations: stations,
      managerLpoLookbackDays: Number.isFinite(lookbackRaw) && lookbackRaw > 0 ? Math.floor(lookbackRaw) : 0,
    };
    _managerAccessCache = result;
    _managerAccessCacheUpdatedAt = now;
    return result;
  } catch (error: any) {
    logger.error(`Failed to load manager-access config, using permissive defaults: ${error.message}`);
    return { superManagerStations: [], managerLpoLookbackDays: 0 };
  }
}

/**
 * Read the per-operation fuel-record automation flags (cached, 30s TTL). Any
 * missing flag falls back to `true` (enabled) so a partially-written config never
 * silently disables automation. Never throws — on error returns all-enabled
 * defaults so a config read failure can't block LPO/DO operations.
 */
export async function getFuelAutomationFlags(): Promise<IFuelAutomationConfig> {
  const now = Date.now();
  if (_fuelAutomationCache && now - _fuelAutomationCacheUpdatedAt < CACHE_TTL_MS) {
    return _fuelAutomationCache;
  }

  try {
    const cfg = await SystemConfig.findOne({ configType: 'journey_config', isDeleted: false })
      .select('journeyConfig.fuelAutomation')
      .lean();
    const stored = (cfg?.journeyConfig?.fuelAutomation || {}) as Partial<IFuelAutomationConfig>;
    // Merge over defaults so unset keys stay enabled; coerce only explicit `false`.
    const flags: IFuelAutomationConfig = {
      lpoCreateDeduct: stored.lpoCreateDeduct !== false,
      lpoCancelRevert: stored.lpoCancelRevert !== false,
      lpoEditAdjust: stored.lpoEditAdjust !== false,
      lpoPickupAuto: stored.lpoPickupAuto !== false,
      doImportCreate: stored.doImportCreate !== false,
      doExportUpdate: stored.doExportUpdate !== false,
      doAmendCascade: stored.doAmendCascade !== false,
      doCancelCascade: stored.doCancelCascade !== false,
    };
    _fuelAutomationCache = flags;
    _fuelAutomationCacheUpdatedAt = now;
    return flags;
  } catch (error: any) {
    logger.error(`Failed to load fuel-automation flags, using all-enabled defaults: ${error.message}`);
    return { ...DEFAULT_FUEL_AUTOMATION };
  }
}

/** Read the configured start columns (cached). Falls back to defaults. */
export async function getJourneyStartColumns(): Promise<string[]> {
  const now = Date.now();
  if (_startColumnsCache && now - _cacheUpdatedAt < CACHE_TTL_MS) {
    return _startColumnsCache;
  }

  try {
    const cfg = await SystemConfig.findOne({ configType: 'journey_config', isDeleted: false });
    const cols = cfg?.journeyConfig?.startColumns?.length
      ? cfg.journeyConfig.startColumns
      : DEFAULT_START_COLUMNS;
    _startColumnsCache = cols;
    _cacheUpdatedAt = now;
    return cols;
  } catch (error: any) {
    logger.error(`Failed to load journey start columns, using defaults: ${error.message}`);
    return DEFAULT_START_COLUMNS;
  }
}

/** True if any configured start column on this record holds a non-zero value. */
function hasStartColumnFilled(record: any, startColumns: string[]): boolean {
  return startColumns.some((col) => Math.abs(Number(record?.[col]) || 0) > 0);
}

/**
 * Atomically complete the truck's current active journey and promote the started
 * (queued) journey to active, then re-number any remaining queued journeys so the
 * queue stays contiguous (integrity preserved). Emits live data_changed events for
 * every affected record so all clients update in place without a refresh.
 */
async function promoteJourney(
  truckNo: string,
  startedRecordId: string,
  username: string
): Promise<void> {
  const session = await mongoose.startSession();
  const affectedIds = new Set<string>();
  try {
    await session.withTransaction(async () => {
      // 1. Complete any currently-active journey for this truck (normally exactly one).
      const activeJourneys = await FuelRecord.find({
        truckNo,
        journeyStatus: 'active',
        isDeleted: false,
        _id: { $ne: startedRecordId },
      }).session(session);

      for (const aj of activeJourneys) {
        aj.journeyStatus = 'completed';
        aj.completedAt = new Date();
        await aj.save({ session });
        affectedIds.add(aj._id.toString());
        logger.info(
          `Journey ${aj.goingDo} (truck ${truckNo}) auto-completed: successor started by ${username}`
        );
      }

      // 2. Promote the started journey to active.
      const started = await FuelRecord.findById(startedRecordId).session(session);
      if (started && started.journeyStatus !== 'active') {
        started.journeyStatus = 'active';
        started.activatedAt = new Date();
        started.queueOrder = undefined;
        await started.save({ session });
        affectedIds.add(started._id.toString());
        logger.info(`Journey ${started.goingDo} (truck ${truckNo}) activated — start columns filled`);
      }

      // 3. Re-number remaining queued journeys (queue integrity).
      const remainingQueued = await FuelRecord.find({
        truckNo,
        journeyStatus: 'queued',
        isDeleted: false,
      })
        .sort({ queueOrder: 1 })
        .session(session);

      if (remainingQueued.length > 0) {
        const bulkOps = remainingQueued.map((r, i) => ({
          updateOne: {
            filter: { _id: r._id },
            update: { $set: { queueOrder: i + 1 } },
          },
        }));
        await FuelRecord.bulkWrite(bulkOps, { session });
      }
    });
  } finally {
    await session.endSession();
  }

  // Emit live updates AFTER the transaction commits so clients patch the latest state.
  for (const id of affectedIds) {
    const fresh = await FuelRecord.findById(id);
    if (fresh) emitDataChange('fuel_records', 'update', fresh.toObject());
  }
}

/**
 * Entry point called after any fuel-record fill (LPO-driven or manual). If the
 * record is a queued journey whose start columns have now been filled, complete the
 * truck's active journey and promote this one. Safe to call on any record/status —
 * it no-ops unless promotion is warranted. Never throws (background operation).
 */
export async function checkAndPromoteStartedJourney(
  record: any,
  username: string
): Promise<void> {
  try {
    if (!record || record.journeyStatus !== 'queued') return;

    const startColumns = await getJourneyStartColumns();
    if (!hasStartColumnFilled(record, startColumns)) return;

    await promoteJourney(record.truckNo, record._id.toString(), username);
  } catch (error: any) {
    logger.error(
      `Error promoting started journey for truck ${record?.truckNo}: ${error.message}`
    );
    // Swallow — promotion is a background side-effect and must not fail the request.
  }
}
