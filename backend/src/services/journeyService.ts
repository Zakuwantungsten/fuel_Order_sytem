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
 *   - Manually marking an active journey complete (without cancelling) does the same
 *     promote/renumber, and can be undone if it was a mistake.
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
import { ApiError } from '../middleware/errorHandler';

/** Default start columns when no journey_config has been saved yet. */
export const DEFAULT_START_COLUMNS = ['tangaYard', 'darYard', 'darGoing', 'moroGoing'];
/** Pre-Tanga-Yard default — upgraded in place so existing installs promote on tangaYard fills. */
const LEGACY_DEFAULT_START_COLUMNS = ['darYard', 'darGoing', 'moroGoing'];

/** Treat the old 3-column default as the current default (adds tangaYard). Custom lists are unchanged. */
export function normalizeJourneyStartColumns(cols?: string[] | null): string[] {
  const list = Array.isArray(cols) ? cols.filter(Boolean) : [];
  if (list.length === 0) return [...DEFAULT_START_COLUMNS];
  const isLegacyDefault =
    list.length === LEGACY_DEFAULT_START_COLUMNS.length &&
    LEGACY_DEFAULT_START_COLUMNS.every((c) => list.includes(c)) &&
    list.every((c) => (LEGACY_DEFAULT_START_COLUMNS as string[]).includes(c));
  return isLegacyDefault ? [...DEFAULT_START_COLUMNS] : list;
}

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

/**
 * Canonical monthKey list ("YYYY-MM") for the LPO truck lookup window.
 * Prefer this over string `date >= dateFrom` — FuelRecord.date mixes ISO and
 * Excel-style strings, so lexicographic $gte drops valid journeys.
 */
export function computeLpoTruckLookupMonthKeys(months: number): string[] {
  const safeMonths = Number.isFinite(months) && months > 0 ? Math.floor(months) : 4;
  const now = new Date();
  const keys: string[] = [];
  for (let i = 0; i < safeMonths; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    keys.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  return keys;
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
    const cols = normalizeJourneyStartColumns(cfg?.journeyConfig?.startColumns);
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
 * Drop cancelled journeys that were left stuck as journeyStatus=queued
 * (legacy cancel path). Safe to call opportunistically for a truck.
 */
export async function healCancelledQueuedJourneys(
  truckNo: string,
  session?: ClientSession | null
): Promise<number> {
  if (!truckNo) return 0;
  const result = await FuelRecord.updateMany(
    {
      truckNo,
      isDeleted: false,
      isCancelled: true,
      journeyStatus: 'queued',
    },
    {
      $set: { journeyStatus: 'cancelled' },
      $unset: { queueOrder: 1 },
    },
    session ? { session } : undefined
  );
  const n = result.modifiedCount || 0;
  if (n > 0) {
    logger.info(`Healed ${n} cancelled-but-still-queued journey(s) for truck ${truckNo}`);
    await renumberQueuedJourneys(truckNo, session);
  }
  return n;
}

/**
 * Re-number live queued journeys for a truck to contiguous 1..n.
 * First heals cancelled rows that were left stuck as journeyStatus=queued
 * (legacy cancel path), so they no longer occupy queue slots or confuse UI.
 * Returns ids whose queueOrder was rewritten (not including healed cancelled ids).
 */
async function renumberQueuedJourneys(
  truckNo: string,
  session?: ClientSession | null
): Promise<string[]> {
  // Drop cancelled journeys out of the queue (status + order)
  await FuelRecord.updateMany(
    {
      truckNo,
      isDeleted: false,
      isCancelled: true,
      journeyStatus: 'queued',
    },
    {
      $set: { journeyStatus: 'cancelled' },
      $unset: { queueOrder: 1 },
    },
    session ? { session } : undefined
  );

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
  const affectedIds = new Set<string>([recordId]);

  const run = async (s: ClientSession | null) => {
    const record = await FuelRecord.findById(recordId).session(sessionQuery(s));
    if (!record || record.isDeleted) return;

    const truckNo = record.truckNo;

    if (options.wasActive) {
      record.cancelledFromJourneyStatus = 'active';
      if (record.journeyStatus !== 'completed') {
        record.journeyStatus = 'completed';
        record.completedAt = record.completedAt || new Date();
        record.queueOrder = undefined;
      }
      const promotedId = await promoteNextQueuedJourney(truckNo, username, s);
      if (promotedId) {
        record.cancelPromotedSuccessorId = promotedId;
        affectedIds.add(promotedId);
      }
      await record.save(sessionWrite(s));
      for (const id of await renumberQueuedJourneys(truckNo, s)) affectedIds.add(id);
      logger.info(
        `Cancelled active journey ${record.goingDo} (truck ${truckNo}) completed; queue advanced by ${username}`
      );
      return;
    }

    if (options.wasQueued) {
      record.cancelledFromJourneyStatus = 'queued';
      if (record.queueOrder != null) {
        record.cancelledFromQueueOrder = record.queueOrder;
      }
      record.journeyStatus = 'cancelled';
      record.queueOrder = undefined;
      await record.save(sessionWrite(s));

      for (const id of await renumberQueuedJourneys(truckNo, s)) affectedIds.add(id);
      logger.info(
        `Cancelled queued journey ${record.goingDo} (truck ${truckNo}); removed from queue and renumbered by ${username}`
      );
    }
  };

  if (options.session) {
    await run(options.session);
  } else {
    await runWithOptionalTransaction(run);
  }

  const ids = [...affectedIds];
  if (!options.session) {
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

function isStandaloneTxnError(err: any): boolean {
  const msg = String(err?.message || '');
  return (
    msg.includes('Transaction numbers are only allowed') ||
    msg.includes('replica set member') ||
    msg.includes('not supported')
  );
}

async function runWithOptionalTransaction(
  fn: (session: ClientSession | null) => Promise<void>
): Promise<void> {
  const session = await mongoose.startSession();
  try {
    try {
      await session.withTransaction(async () => {
        await fn(session);
      });
    } catch (err: any) {
      if (err instanceof ApiError) throw err;
      if (err?.cause instanceof ApiError) throw err.cause;
      if (isStandaloneTxnError(err)) {
        await fn(null);
        return;
      }
      throw err;
    }
  } finally {
    await session.endSession();
  }
}

function sessionQuery(session?: ClientSession | null) {
  return session || null;
}

function sessionWrite(session?: ClientSession | null) {
  return session ? { session } : undefined;
}

export interface CompleteJourneyResult {
  record: any;
  affectedIds: string[];
  promotedId: string | null;
}

/**
 * Manually complete an active journey (does not cancel the record) and promote
 * the next queued journey for that truck. Stores enough state to undo later.
 */
export async function completeJourneyManually(
  recordId: string,
  username: string
): Promise<CompleteJourneyResult> {
  const affectedIds = new Set<string>([recordId]);
  let promotedId: string | null = null;

  await runWithOptionalTransaction(async (session) => {
    const record = await FuelRecord.findById(recordId).session(sessionQuery(session));
    if (!record || record.isDeleted) {
      throw new ApiError(404, 'Fuel record not found');
    }
    if (record.isCancelled) {
      throw new ApiError(409, 'Cannot complete a cancelled fuel record');
    }
    if (record.journeyStatus !== 'active') {
      throw new ApiError(409, 'Only an active journey can be marked complete');
    }

    const truckNo = record.truckNo;
    record.journeyStatus = 'completed';
    record.completedAt = new Date();
    record.completedBy = username;
    record.manuallyCompleted = true;
    record.queueOrder = undefined;
    record.promotedSuccessorId = undefined;
    await record.save(sessionWrite(session));

    const stillActive = await FuelRecord.findOne(activeJourneyFilter(truckNo, recordId)).session(
      sessionQuery(session)
    );
    if (!stillActive) {
      promotedId = await promoteNextQueuedJourney(truckNo, username, session);
      if (promotedId) {
        affectedIds.add(promotedId);
        record.promotedSuccessorId = promotedId;
        await record.save(sessionWrite(session));
      }
    }

    for (const id of await renumberQueuedJourneys(truckNo, session)) {
      affectedIds.add(id);
    }

    logger.info(
      `Journey ${record.goingDo} (truck ${truckNo}) manually completed by ${username}` +
        (promotedId ? `; promoted successor ${promotedId}` : '')
    );
  });

  const record = await FuelRecord.findById(recordId);
  if (!record) throw new ApiError(404, 'Fuel record not found');

  await emitFuelRecordUpdates(affectedIds);
  return { record, affectedIds: [...affectedIds], promotedId };
}

/**
 * Undo a mistaken manual complete: restore this journey to active and put the
 * promoted successor back at the front of the queue (if it is still this truck's
 * active journey).
 */
export async function reopenManuallyCompletedJourney(
  recordId: string,
  username: string
): Promise<CompleteJourneyResult> {
  const affectedIds = new Set<string>([recordId]);

  await runWithOptionalTransaction(async (session) => {
    const record = await FuelRecord.findById(recordId).session(sessionQuery(session));
    if (!record || record.isDeleted) {
      throw new ApiError(404, 'Fuel record not found');
    }
    if (record.isCancelled) {
      throw new ApiError(409, 'Cannot undo complete on a cancelled fuel record');
    }
    if (record.journeyStatus !== 'completed') {
      throw new ApiError(409, 'This journey is not completed');
    }
    if (!record.manuallyCompleted) {
      throw new ApiError(
        409,
        'This journey was completed automatically and cannot be undone from here'
      );
    }

    const truckNo = record.truckNo;
    const successorId = record.promotedSuccessorId ? String(record.promotedSuccessorId) : null;
    const currentActive = await FuelRecord.findOne(activeJourneyFilter(truckNo, recordId)).session(
      sessionQuery(session)
    );

    if (currentActive) {
      if (!successorId || currentActive._id.toString() !== successorId) {
        throw new ApiError(409, 'Cannot undo — another journey is now active for this truck');
      }

      currentActive.journeyStatus = 'queued';
      currentActive.queueOrder = 0;
      await currentActive.save(sessionWrite(session));
      affectedIds.add(currentActive._id.toString());
    } else if (successorId) {
      const successor = await FuelRecord.findById(successorId).session(sessionQuery(session));
      if (successor && !successor.isDeleted && !successor.isCancelled) {
        if (successor.journeyStatus === 'completed') {
          throw new ApiError(409, 'Cannot undo — a later journey has already been completed');
        }
        if (successor.journeyStatus === 'active') {
          successor.journeyStatus = 'queued';
          successor.queueOrder = 0;
          await successor.save(sessionWrite(session));
          affectedIds.add(successor._id.toString());
        }
      }
    }

    await FuelRecord.updateOne(
      { _id: record._id },
      {
        $set: { journeyStatus: 'active', manuallyCompleted: false },
        $unset: { completedAt: 1, completedBy: 1, promotedSuccessorId: 1, queueOrder: 1 },
      },
      sessionWrite(session)
    );

    for (const id of await renumberQueuedJourneys(truckNo, session)) {
      affectedIds.add(id);
    }

    logger.info(
      `Journey ${record.goingDo} (truck ${truckNo}) manual complete undone by ${username}`
    );
  });

  const record = await FuelRecord.findById(recordId);
  if (!record) throw new ApiError(404, 'Fuel record not found');

  await emitFuelRecordUpdates(affectedIds);
  return { record, affectedIds: [...affectedIds], promotedId: null };
}

export interface UncancelJourneyResult {
  record: any;
  affectedIds: string[];
}

/**
 * Restore journey queue state when a cancelled fuel record is uncancelled.
 * Uses cancel snapshots written by afterJourneyCancelled. Legacy cancels without
 * snapshots only clear isCancelled.
 */
export async function restoreJourneyOnFuelRecordUncancel(
  recordId: string,
  username: string
): Promise<UncancelJourneyResult> {
  const affectedIds = new Set<string>([recordId]);

  await runWithOptionalTransaction(async (session) => {
    const record = await FuelRecord.findById(recordId).session(sessionQuery(session));
    if (!record || record.isDeleted) {
      throw new ApiError(404, 'Fuel record not found');
    }
    if (!record.isCancelled) {
      throw new ApiError(409, 'Fuel record is not cancelled');
    }

    const fromStatus = record.cancelledFromJourneyStatus;
    const fromQueueOrder = record.cancelledFromQueueOrder;
    const successorId = record.cancelPromotedSuccessorId
      ? String(record.cancelPromotedSuccessorId)
      : null;
    const truckNo = record.truckNo;

    record.isCancelled = false;
    record.uncancelledAt = new Date();
    record.uncancelledBy = username;
    record.cancelledAt = undefined;
    record.cancelledBy = undefined;
    record.cancellationReason = undefined;

    if (!fromStatus) {
      await record.save(sessionWrite(session));
      return;
    }

    if (fromStatus === 'active') {
      const currentActive = await FuelRecord.findOne(activeJourneyFilter(truckNo, recordId)).session(
        sessionQuery(session)
      );

      if (currentActive) {
        if (!successorId || currentActive._id.toString() !== successorId) {
          throw new ApiError(409, 'Cannot uncancel — another journey is now active for this truck');
        }

        currentActive.journeyStatus = 'queued';
        currentActive.queueOrder = 0;
        await currentActive.save(sessionWrite(session));
        affectedIds.add(currentActive._id.toString());
      } else if (successorId) {
        const successor = await FuelRecord.findById(successorId).session(sessionQuery(session));
        if (successor && !successor.isDeleted && !successor.isCancelled) {
          if (successor.journeyStatus === 'completed') {
            throw new ApiError(409, 'Cannot uncancel — a later journey has already been completed');
          }
          if (successor.journeyStatus === 'active') {
            successor.journeyStatus = 'queued';
            successor.queueOrder = 0;
            await successor.save(sessionWrite(session));
            affectedIds.add(successor._id.toString());
          }
        }
      }

      record.journeyStatus = 'active';
      record.activatedAt = record.activatedAt || new Date();
      record.completedAt = undefined;
      record.completedBy = undefined;
      record.queueOrder = undefined;
      record.cancelledFromJourneyStatus = undefined;
      record.cancelledFromQueueOrder = undefined;
      record.cancelPromotedSuccessorId = undefined;
      await record.save(sessionWrite(session));

      for (const id of await renumberQueuedJourneys(truckNo, session)) {
        affectedIds.add(id);
      }

      logger.info(
        `Cancelled active journey ${record.goingDo} (truck ${truckNo}) restored on uncancel by ${username}`
      );
      return;
    }

    if (fromStatus === 'queued') {
      record.journeyStatus = 'queued';
      record.queueOrder = fromQueueOrder && fromQueueOrder > 0 ? fromQueueOrder : undefined;
      record.cancelledFromJourneyStatus = undefined;
      record.cancelledFromQueueOrder = undefined;
      record.cancelPromotedSuccessorId = undefined;
      await record.save(sessionWrite(session));

      for (const id of await renumberQueuedJourneys(truckNo, session)) {
        affectedIds.add(id);
      }

      logger.info(
        `Cancelled queued journey ${record.goingDo} (truck ${truckNo}) restored on uncancel by ${username}`
      );
    }
  });

  const record = await FuelRecord.findById(recordId);
  if (!record) throw new ApiError(404, 'Fuel record not found');

  await emitFuelRecordUpdates(affectedIds);
  return { record, affectedIds: [...affectedIds] };
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
