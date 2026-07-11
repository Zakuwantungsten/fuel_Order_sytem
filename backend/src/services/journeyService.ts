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
 *   - Cancelling an active journey completes it and promotes the next queued (FIFO).
 *   - Changing truckNo on a live journey re-places it on the target truck (append
 *     as last queued if that truck already has an active journey; otherwise active)
 *     and cleans up the old truck's queue.
 *
 * This replaces the old balance===0 + return-checkpoint completion rule, which was
 * hardcoded and never fired for the LPO-driven path.
 */
import mongoose, { ClientSession } from 'mongoose';
import { FuelRecord } from '../models';
import { SystemConfig, IFuelAutomationConfig, DEFAULT_FUEL_AUTOMATION } from '../models/SystemConfig';
import { emitDataChange } from './websocket';
import { logger, formatTruckNumber } from '../utils';

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
  /** Notify super_manager for custom-station LPOs in Zambia. */
  superManagerNotifyCustomZambia: boolean;
}

/** Country match for custom-station LPOs treated as Zambia (missing => Zambia). */
const CUSTOM_ZAMBIA_COUNTRY_OR = [
  { customCountry: { $regex: /^zambia$/i } },
  { customCountry: { $exists: false } },
  { customCountry: null },
  { customCountry: '' },
];

/** Mongo filter: LPO documents that are custom stations in Zambia. */
export function buildCustomZambiaLpoFilter(): Record<string, unknown> {
  return {
    $or: [
      { isCustomStation: true, $or: CUSTOM_ZAMBIA_COUNTRY_OR },
      {
        entries: {
          $elemMatch: { isCustomStation: true, $or: CUSTOM_ZAMBIA_COUNTRY_OR },
        },
      },
    ],
  };
}

/** Build $or clauses for super_manager: configured stations + optional custom Zambia. */
export function buildSuperManagerStationOrClauses(
  allowedStations: string[],
  includeCustomZambia: boolean
): Record<string, unknown>[] {
  const clauses: Record<string, unknown>[] = allowedStations
    .map((st) => (st || '').trim())
    .filter(Boolean)
    .map((st) => {
      const escaped = st.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      return { station: { $regex: new RegExp(`^${escaped}$`, 'i') } };
    });
  if (includeCustomZambia) {
    clauses.push(buildCustomZambiaLpoFilter());
  }
  return clauses;
}
let _managerAccessCache: ManagerAccessConfig | null = null;
let _managerAccessCacheUpdatedAt = 0;

export interface DashboardSearchConfig {
  doMonths: number;
  doMaxResults: number;
  lpoMonths: number;
  lpoMaxResults: number;
  fuelMaxResults: number;
}

const DEFAULT_DASHBOARD_SEARCH_CONFIG: DashboardSearchConfig = {
  doMonths: 4,
  doMaxResults: 6,
  lpoMonths: 1,
  lpoMaxResults: 50,
  fuelMaxResults: 3,
};

let _dashboardSearchCache: DashboardSearchConfig | null = null;
let _dashboardSearchCacheUpdatedAt = 0;
let _lpoTruckLookupMonthsCache: number | null = null;
let _lpoTruckLookupMonthsCacheUpdatedAt = 0;

/** Drop the cache so the next read reflects a freshly-saved config. */
export function invalidateJourneyConfigCache(): void {
  _startColumnsCache = null;
  _cacheUpdatedAt = 0;
  _fuelAutomationCache = null;
  _fuelAutomationCacheUpdatedAt = 0;
  _managerAccessCache = null;
  _managerAccessCacheUpdatedAt = 0;
  _dashboardSearchCache = null;
  _dashboardSearchCacheUpdatedAt = 0;
  _lpoTruckLookupMonthsCache = null;
  _lpoTruckLookupMonthsCacheUpdatedAt = 0;
}

/** Format a Date as local YYYY-MM-DD (avoids UTC day-shift in EAT etc.). */
export function toLocalDateString(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** First day of the oldest calendar month in an LPO truck lookup window. */
export function computeLpoTruckLookupDateFrom(months: number): string {
  const safeMonths = Number.isFinite(months) && months > 0 ? Math.floor(months) : 4;
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() - (safeMonths - 1), 1);
  return toLocalDateString(start);
}

/** Date floor N calendar months before today (dashboard DO/LPO search). */
export function dashboardMonthFloorDate(months: number): string {
  const safeMonths = Number.isFinite(months) && months > 0 ? Math.floor(months) : 1;
  const d = new Date();
  d.setMonth(d.getMonth() - safeMonths);
  return toLocalDateString(d);
}

export async function getDashboardSearchConfig(): Promise<DashboardSearchConfig> {
  const now = Date.now();
  if (_dashboardSearchCache && now - _dashboardSearchCacheUpdatedAt < CACHE_TTL_MS) {
    return _dashboardSearchCache;
  }
  try {
    const cfg = await SystemConfig.findOne({ configType: 'journey_config', isDeleted: false })
      .select('journeyConfig.searchConfig')
      .lean();
    const sc = (cfg as any)?.journeyConfig?.searchConfig || {};
    const merged: DashboardSearchConfig = {
      doMonths: sc.doMonths ?? DEFAULT_DASHBOARD_SEARCH_CONFIG.doMonths,
      doMaxResults: sc.doMaxResults ?? DEFAULT_DASHBOARD_SEARCH_CONFIG.doMaxResults,
      lpoMonths: sc.lpoMonths ?? DEFAULT_DASHBOARD_SEARCH_CONFIG.lpoMonths,
      lpoMaxResults: sc.lpoMaxResults ?? DEFAULT_DASHBOARD_SEARCH_CONFIG.lpoMaxResults,
      fuelMaxResults: sc.fuelMaxResults ?? DEFAULT_DASHBOARD_SEARCH_CONFIG.fuelMaxResults,
    };
    _dashboardSearchCache = merged;
    _dashboardSearchCacheUpdatedAt = now;
    return merged;
  } catch (error: any) {
    logger.error(`Failed to load dashboard search config, using defaults: ${error.message}`);
    return { ...DEFAULT_DASHBOARD_SEARCH_CONFIG };
  }
}

export async function getLpoTruckLookupMonths(): Promise<number> {
  const now = Date.now();
  if (_lpoTruckLookupMonthsCache != null && now - _lpoTruckLookupMonthsCacheUpdatedAt < CACHE_TTL_MS) {
    return _lpoTruckLookupMonthsCache;
  }
  try {
    const cfg = await SystemConfig.findOne({ configType: 'journey_config', isDeleted: false })
      .select('journeyConfig.lpoTruckLookupMonths')
      .lean();
    const raw = Number((cfg as any)?.journeyConfig?.lpoTruckLookupMonths);
    const months = Number.isInteger(raw) && raw >= 1 && raw <= 24 ? raw : 4;
    _lpoTruckLookupMonthsCache = months;
    _lpoTruckLookupMonthsCacheUpdatedAt = now;
    return months;
  } catch (error: any) {
    logger.error(`Failed to load lpoTruckLookupMonths, using default 4: ${error.message}`);
    return 4;
  }
}

export type DashboardSearchKind = 'do' | 'lpo' | 'fuel';

/**
 * When dashboardSearch=true with a search term, enforce Journey Config limits server-side.
 * Returns null when the request is not a dashboard unified search.
 */
export async function resolveDashboardSearchLimits(
  kind: DashboardSearchKind,
  query: { search?: unknown; dashboardSearch?: unknown; dateFrom?: unknown; dateTo?: unknown; limit?: unknown }
): Promise<{ dateFrom?: string; dateTo?: string; limit: number; page: number } | null> {
  if (query.dashboardSearch !== 'true' && query.dashboardSearch !== true) return null;
  if (!query.search || String(query.search).trim() === '') return null;

  const cfg = await getDashboardSearchConfig();
  const today = toLocalDateString(new Date());

  if (kind === 'do') {
    return {
      dateFrom: dashboardMonthFloorDate(cfg.doMonths),
      dateTo: today,
      limit: cfg.doMaxResults,
      page: 1,
    };
  }
  if (kind === 'lpo') {
    return {
      dateFrom: dashboardMonthFloorDate(cfg.lpoMonths),
      dateTo: today,
      limit: cfg.lpoMaxResults,
      page: 1,
    };
  }
  return {
    dateTo: today,
    limit: cfg.fuelMaxResults,
    page: 1,
  };
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
      .select('journeyConfig.superManagerStations journeyConfig.managerLpoLookbackDays journeyConfig.superManagerNotifyCustomZambia')
      .lean();
    const stations = (cfg?.journeyConfig?.superManagerStations || [])
      .map((s) => (s || '').toUpperCase().trim())
      .filter(Boolean);
    const lookbackRaw = Number(cfg?.journeyConfig?.managerLpoLookbackDays);
    const notifyCustomZambia = cfg?.journeyConfig?.superManagerNotifyCustomZambia;
    const result: ManagerAccessConfig = {
      superManagerStations: stations,
      managerLpoLookbackDays: Number.isFinite(lookbackRaw) && lookbackRaw > 0 ? Math.floor(lookbackRaw) : 0,
      superManagerNotifyCustomZambia: notifyCustomZambia !== false,
    };
    _managerAccessCache = result;
    _managerAccessCacheUpdatedAt = now;
    return result;
  } catch (error: any) {
    logger.error(`Failed to load manager-access config, using permissive defaults: ${error.message}`);
    return { superManagerStations: [], managerLpoLookbackDays: 0, superManagerNotifyCustomZambia: true };
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

/** Active journeys that still count for queue rules (not deleted/cancelled). */
function activeJourneyFilter(truckNo: string, excludeId?: string) {
  const filter: Record<string, unknown> = {
    truckNo,
    journeyStatus: 'active',
    isDeleted: false,
    isCancelled: { $ne: true },
  };
  if (excludeId) filter._id = { $ne: excludeId };
  return filter;
}

/** Live queued journeys (excludes cancelled). */
function queuedJourneyFilter(truckNo: string, excludeId?: string) {
  const filter: Record<string, unknown> = {
    truckNo,
    journeyStatus: 'queued',
    isDeleted: false,
    isCancelled: { $ne: true },
  };
  if (excludeId) filter._id = { $ne: excludeId };
  return filter;
}

async function emitFuelRecordUpdates(ids: Iterable<string>): Promise<void> {
  for (const id of ids) {
    const fresh = await FuelRecord.findById(id);
    if (fresh) emitDataChange('fuel_records', 'update', fresh.toObject());
  }
}

/**
 * Re-number live queued journeys for a truck to contiguous 1..n.
 * Returns ids whose queueOrder was rewritten.
 */
async function renumberQueuedJourneys(
  truckNo: string,
  session?: ClientSession | null
): Promise<string[]> {
  const remainingQueued = await FuelRecord.find(queuedJourneyFilter(truckNo))
    .sort({ queueOrder: 1, createdAt: 1 })
    .session(session || null);

  if (remainingQueued.length === 0) return [];

  const bulkOps = remainingQueued.map((r, i) => ({
    updateOne: {
      filter: { _id: r._id },
      update: { $set: { queueOrder: i + 1 } },
    },
  }));
  await FuelRecord.bulkWrite(bulkOps, session ? { session } : undefined);
  return remainingQueued.map((r) => r._id.toString());
}

/**
 * Promote the next queued journey for a truck to active (FIFO by queueOrder).
 * Does not complete any other journey — caller is responsible for that when needed.
 */
export async function promoteNextQueuedJourney(
  truckNo: string,
  username: string,
  session?: ClientSession | null
): Promise<string | null> {
  const next = await FuelRecord.findOne(queuedJourneyFilter(truckNo))
    .sort({ queueOrder: 1, createdAt: 1 })
    .session(session || null);

  if (!next) return null;

  next.journeyStatus = 'active';
  next.activatedAt = new Date();
  next.queueOrder = undefined;
  await next.save(session ? { session } : undefined);

  const affected = await renumberQueuedJourneys(truckNo, session);
  logger.info(
    `Journey ${next.goingDo} (truck ${truckNo}) promoted to active after queue advance by ${username}` +
      (affected.length ? ` (renumbered ${affected.length} remaining)` : '')
  );
  return next._id.toString();
}

/**
 * After a fuel journey is cancelled: complete it if it was active (so it no longer
 * blocks the one-active rule), promote the next queued on that truck, or renumber
 * the queue if a queued journey was cancelled.
 *
 * Pass `wasActive` / `wasQueued` from the pre-cancel status — after cancel the
 * record may already be marked isCancelled.
 */
export async function afterJourneyCancelled(
  recordId: string,
  username: string,
  options: { session?: ClientSession; wasActive: boolean; wasQueued: boolean }
): Promise<{ affectedIds: string[] }> {
  const session = options.session;
  const ownSession = !session;
  const localSession = session || (await mongoose.startSession());
  const affectedIds = new Set<string>([recordId]);

  try {
    const run = async (s: ClientSession) => {
      const record = await FuelRecord.findById(recordId).session(s);
      if (!record || record.isDeleted) return;

      const truckNo = record.truckNo;

      if (options.wasActive) {
        if (record.journeyStatus !== 'completed') {
          record.journeyStatus = 'completed';
          record.completedAt = record.completedAt || new Date();
          record.queueOrder = undefined;
          await record.save({ session: s });
        }
        const promotedId = await promoteNextQueuedJourney(truckNo, username, s);
        if (promotedId) affectedIds.add(promotedId);
        for (const id of await renumberQueuedJourneys(truckNo, s)) affectedIds.add(id);
        logger.info(
          `Cancelled active journey ${record.goingDo} (truck ${truckNo}) completed; queue advanced by ${username}`
        );
        return;
      }

      if (options.wasQueued) {
        for (const id of await renumberQueuedJourneys(truckNo, s)) affectedIds.add(id);
        logger.info(
          `Cancelled queued journey ${record.goingDo} (truck ${truckNo}); queue renumbered by ${username}`
        );
      }
    };

    if (ownSession) {
      await localSession.withTransaction(async () => run(localSession));
    } else {
      await run(localSession);
    }
  } finally {
    if (ownSession) await localSession.endSession();
  }

  const ids = [...affectedIds];
  if (ownSession) {
    await emitFuelRecordUpdates(ids);
  }
  return { affectedIds: ids };
}

/**
 * Move a fuel journey onto a different truck and place it correctly in that truck's
 * queue: append as last queued if the new truck has an active journey; otherwise
 * become active. Cleans up the old truck's queue (renumber / promote next if the
 * moved record was that truck's active).
 */
export async function reassignJourneyOnTruckChange(
  recordId: string,
  newTruckNoRaw: string,
  username: string,
  options?: { session?: ClientSession }
): Promise<{
  changed: boolean;
  oldTruckNo?: string;
  newTruckNo?: string;
  placement?: 'active' | 'queued' | 'unchanged';
  affectedIds: string[];
}> {
  const newTruckNo = formatTruckNumber(newTruckNoRaw);
  if (!newTruckNo) {
    return { changed: false, affectedIds: [] };
  }

  const session = options?.session;
  const ownSession = !session;
  const localSession = session || (await mongoose.startSession());
  const affectedIds = new Set<string>([recordId]);
  let result: {
    changed: boolean;
    oldTruckNo?: string;
    newTruckNo?: string;
    placement?: 'active' | 'queued' | 'unchanged';
  } = { changed: false };

  try {
    const run = async (s: ClientSession) => {
      const record = await FuelRecord.findById(recordId).session(s);
      if (!record || record.isDeleted) {
        result = { changed: false };
        return;
      }

      const oldTruckNo = record.truckNo;
      if (formatTruckNumber(oldTruckNo) === newTruckNo) {
        if (record.truckNo !== newTruckNo) {
          record.truckNo = newTruckNo;
          await record.save({ session: s });
          result = { changed: true, oldTruckNo, newTruckNo, placement: 'unchanged' };
        } else {
          result = { changed: false, oldTruckNo, newTruckNo, placement: 'unchanged' };
        }
        return;
      }

      const wasActive = record.journeyStatus === 'active' && !record.isCancelled;
      const wasQueued = record.journeyStatus === 'queued' && !record.isCancelled;
      const isLiveJourney = wasActive || wasQueued;

      record.truckNo = newTruckNo;

      let placement: 'active' | 'queued' | 'unchanged' = 'unchanged';

      if (isLiveJourney) {
        const activeOnNew = await FuelRecord.findOne(
          activeJourneyFilter(newTruckNo, record._id.toString())
        ).session(s);

        if (activeOnNew) {
          const queuedCount = await FuelRecord.countDocuments(
            queuedJourneyFilter(newTruckNo, record._id.toString())
          ).session(s);
          record.journeyStatus = 'queued';
          record.queueOrder = queuedCount + 1;
          record.previousJourneyId = activeOnNew._id.toString();
          placement = 'queued';
          logger.info(
            `Journey ${record.goingDo} moved ${oldTruckNo} → ${newTruckNo}: queued #${record.queueOrder} behind ${activeOnNew.goingDo} by ${username}`
          );
        } else {
          record.journeyStatus = 'active';
          record.activatedAt = record.activatedAt || new Date();
          record.queueOrder = undefined;
          record.previousJourneyId = undefined;
          placement = 'active';
          logger.info(
            `Journey ${record.goingDo} moved ${oldTruckNo} → ${newTruckNo}: set active (no active on target) by ${username}`
          );
        }
      } else {
        logger.info(
          `Journey ${record.goingDo} truck changed ${oldTruckNo} → ${newTruckNo} (status ${record.journeyStatus}) by ${username}`
        );
      }

      await record.save({ session: s });

      // Old truck cleanup
      for (const id of await renumberQueuedJourneys(oldTruckNo, s)) affectedIds.add(id);
      if (wasActive) {
        const promotedId = await promoteNextQueuedJourney(oldTruckNo, username, s);
        if (promotedId) affectedIds.add(promotedId);
      }

      // New truck queue integrity (in case we inserted mid-flight)
      if (placement === 'queued') {
        for (const id of await renumberQueuedJourneys(newTruckNo, s)) affectedIds.add(id);
      }

      result = { changed: true, oldTruckNo, newTruckNo, placement };
    };

    if (ownSession) {
      await localSession.withTransaction(async () => run(localSession));
    } else {
      await run(localSession);
    }
  } finally {
    if (ownSession) await localSession.endSession();
  }

  const ids = [...affectedIds];
  if (ownSession && result.changed) {
    await emitFuelRecordUpdates(ids);
  }

  return { ...result, affectedIds: ids };
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
      const activeJourneys = await FuelRecord.find(
        activeJourneyFilter(truckNo, startedRecordId)
      ).session(session);

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
      for (const id of await renumberQueuedJourneys(truckNo, session)) {
        affectedIds.add(id);
      }
    });
  } finally {
    await session.endSession();
  }

  // Emit live updates AFTER the transaction commits so clients patch the latest state.
  await emitFuelRecordUpdates(affectedIds);
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
    if (record.isCancelled) return;

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
