import { Response } from 'express';
import mongoose, { ClientSession } from 'mongoose';
import { LPOSummary, LPOWorkbook, FuelRecord, DriverAccountEntry, SystemConfig, User } from '../models';
import { ArchivedLPOSummary } from '../models/ArchivedData';
import { FuelStationConfig } from '../models/FuelStationConfig';
import { ApiError } from '../middleware/errorHandler';
import { AuthRequest } from '../middleware/auth';
import { getPaginationParams, createPaginatedResponse, calculateSkip, logger, sanitizeRegexInput, buildFuzzyRegex } from '../utils';
import { AuditService } from '../utils/auditService';
import ExcelJS from 'exceljs';
import unifiedExportService from '../services/unifiedExportService';
import {
  addLpoSummaryMonthSheet,
  addLpoYearSummarySheet,
  monthAbbrToRange,
  monthAbbrFromDate,
  MONTH_ABBR,
  getCurrencyFromStation,
} from '../utils/summaryTabExport';
import { emitDataChange } from '../services/websocket';
import { enforceEditLock } from './editLockController';
import { acquireLock as acquireLockRecord, releaseLock as releaseLockRecord, getDisplayName } from '../services/lockService';
import { checkAndPromoteStartedJourney, getFuelAutomationFlags, getManagerAccessConfig, buildCustomZambiaLpoFilter, buildSuperManagerStationOrClauses, resolveDashboardSearchLimits } from '../services/journeyService';
import { formatDONumber, parseDONumber } from '../utils/doNumberFormatter';
import {
  createLPOCreatedNotification,
  createLPOCancelledNotification,
  createLPOAmendedNotification,
} from './notificationController';

// Dynamic station to fuel field mapping cache
let STATION_TO_FUEL_FIELD_CACHE: Record<string, { going?: string; returning?: string }> = {};
let CACHE_LAST_UPDATED = 0;
const CACHE_TTL = 60000; // 1 minute

/**
 * Load station mappings from database and cache them
 */
async function loadStationMappings() {
  const now = Date.now();
  if (now - CACHE_LAST_UPDATED < CACHE_TTL && Object.keys(STATION_TO_FUEL_FIELD_CACHE).length > 0) {
    return STATION_TO_FUEL_FIELD_CACHE;
  }

  const stations = await FuelStationConfig.find({ isActive: true });
  const mapping: Record<string, { going?: string; returning?: string }> = {};

  for (const station of stations) {
    // Only include stations that have at least one checkpoint field configured.
    // A station stored with both fields null/undefined would produce a truthy object
    // { going: undefined, returning: undefined } that blocks the fallback lookup and
    // causes the field to resolve to undefined → silent fuel-record skip.
    if (station.fuelRecordFieldGoing || station.fuelRecordFieldReturning) {
      mapping[station.stationName] = {
        going: station.fuelRecordFieldGoing,
        returning: station.fuelRecordFieldReturning,
      };
    }
  }

  // Add CASH as a fallback (context determines the field)
  mapping['CASH'] = { going: 'darGoing', returning: 'darReturn' };

  STATION_TO_FUEL_FIELD_CACHE = mapping;
  CACHE_LAST_UPDATED = now;
  
  return mapping;
}

/**
 * Get station to fuel field mapping (with caching)
 */
async function getStationToFuelFieldMapping() {
  return await loadStationMappings();
}

/**
 * LPO prior-order lookback (days). Stored as cashLpoLookbackDays in DB for backward compatibility.
 */
async function getLpoPriorOrderLookbackDays(): Promise<number> {
  try {
    const cfg = await SystemConfig.findOne({ configType: 'journey_config', isDeleted: false }).lean();
    const days = (cfg as any)?.journeyConfig?.cashLpoLookbackDays;
    return typeof days === 'number' && days > 0 ? days : 40;
  } catch {
    return 40;
  }
}

function normalizeTruckNo(truckNo: string): string {
  return truckNo.replace(/\s+/g, '').toUpperCase();
}

function buildTruckRegex(truckNoNormalized: string): RegExp {
  return new RegExp(
    `^T?${truckNoNormalized.replace(/^T/, '')}$`.replace(/(\d+)([A-Z]+)/, '$1\\s*$2'),
    'i'
  );
}

function resolveFuelRecordFieldFromStationDirection(
  stationMapping: Record<string, { going?: string; returning?: string }>,
  stationName: string,
  journeyDirection: 'going' | 'returning'
): string | null {
  const key = Object.keys(stationMapping).find(
    (k) => k.toUpperCase() === stationName.toUpperCase().trim()
  );
  if (!key) return null;
  const cfg = stationMapping[key];
  return journeyDirection === 'returning' ? (cfg.returning || null) : (cfg.going || null);
}

function resolveFuelRecordFieldFromCancellationPoint(cancellationPoint: string): string | null {
  return CANCELLATION_POINT_TO_FUEL_FIELD[cancellationPoint] || null;
}

function resolveFuelRecordFieldForEntry(
  stationMapping: Record<string, { going?: string; returning?: string }>,
  lpoStation: string,
  entry: { journeyDirection?: string }
): string | null {
  const direction: 'going' | 'returning' =
    entry.journeyDirection === 'returning' ? 'returning' : 'going';
  return resolveFuelRecordFieldFromStationDirection(stationMapping, lpoStation, direction);
}

interface PriorOrderMatch {
  id: unknown;
  lpoNo: string;
  date: string;
  station: string;
  entries: any[];
}

/**
 * Find active LPO entries for truck (+ DO) that fill the same fuel-record checkpoint column.
 */
async function findPriorOrdersAtCheckpoint(options: {
  truckNo: string;
  fuelRecordField: string;
  doNo?: string;
  lookbackDays?: number;
  excludeLpoId?: string;
  excludeCashLpos?: boolean;
}): Promise<PriorOrderMatch[]> {
  const { truckNo, fuelRecordField, doNo, excludeLpoId, excludeCashLpos = false } = options;
  const lookbackDays = options.lookbackDays ?? (await getLpoPriorOrderLookbackDays());

  const truckNoNormalized = normalizeTruckNo(truckNo);
  const dateLimitForLPO = new Date();
  dateLimitForLPO.setDate(dateLimitForLPO.getDate() - lookbackDays);
  const dateLimitString = dateLimitForLPO.toISOString().split('T')[0];

  const query: any = {
    isDeleted: false,
    'entries.truckNo': { $regex: buildTruckRegex(truckNoNormalized) },
    'entries.isCancelled': { $ne: true },
    date: { $gte: dateLimitString },
  };

  if (excludeCashLpos) {
    query.station = { $ne: 'CASH' };
  }

  if (excludeLpoId) {
    query._id = { $ne: excludeLpoId };
  }

  const checkDoNo = doNo?.toUpperCase().trim();
  if (checkDoNo && checkDoNo !== 'NIL') {
    query['entries.doNo'] = doNo;
  }

  const lpos = await LPOSummary.find(query).lean();
  const stationMapping = await getStationToFuelFieldMapping();
  const matchingLpos: PriorOrderMatch[] = [];

  for (const lpo of lpos) {
    const matchingEntries = lpo.entries.filter((e: any) => {
      const entryTruckNormalized = normalizeTruckNo(e.truckNo || '');
      if (entryTruckNormalized !== truckNoNormalized || e.isCancelled) return false;

      if (checkDoNo && checkDoNo !== 'NIL') {
        const entryDoNormalized = (e.doNo || 'NIL').replace(/\s+/g, '').toUpperCase();
        if (entryDoNormalized !== checkDoNo) return false;
      }

      const entryField = resolveFuelRecordFieldForEntry(stationMapping, lpo.station, e);
      return entryField === fuelRecordField;
    });

    if (matchingEntries.length > 0) {
      matchingLpos.push({
        id: lpo._id,
        lpoNo: lpo.lpoNo,
        date: lpo.date,
        station: lpo.station,
        entries: matchingEntries,
      });
    }
  }

  return matchingLpos;
}


/**
 * Map cancellation points to fuel record fields
 * Used for CASH LPOs where the cancellation point indicates which checkpoint was used
 */
const CANCELLATION_POINT_TO_FUEL_FIELD: Record<string, string> = {
  // Going direction checkpoints
  'TANGA_GOING': 'tangaGoing',
  'DAR_GOING': 'darGoing',
  'MORO_GOING': 'moroGoing',
  'MBEYA_GOING': 'mbeyaGoing',
  'INFINITY_GOING': 'mbeyaGoing',    // Infinity is in Mbeya area
  'TDM_GOING': 'tdmGoing',
  'ZAMBIA_GOING': 'zambiaGoing',
  'CONGO_GOING': 'congoFuel',        // Congo (Going) maps to congoFuel column
  // Returning direction checkpoints
  'ZAMBIA_NDOLA': 'zambiaReturn',    // Part of Zambia Return (50L)
  'ZAMBIA_KAPIRI': 'zambiaReturn',   // Part of Zambia Return (350L)
  'TDM_RETURN': 'tundumaReturn',
  'MBEYA_RETURN': 'mbeyaReturn',
  'MORO_RETURN': 'moroReturn',
  'DAR_RETURN': 'darReturn',
  'TANGA_RETURN': 'tangaReturn',
  'CONGO_RETURNING': 'congoFuel',    // Congo (Returning) also maps to congoFuel column
};

// Station rates reference (for documentation/validation)
const STATION_RATES: Record<string, { rate: number; currency: 'USD' | 'TZS' }> = {
  'LAKE CHILABOMBWE': { rate: 1.2, currency: 'USD' },
  'LAKE NDOLA': { rate: 1.2, currency: 'USD' },
  'LAKE KAPIRI': { rate: 1.2, currency: 'USD' },
  'LAKE KITWE': { rate: 1.2, currency: 'USD' },
  'LAKE KABANGWA': { rate: 1.2, currency: 'USD' },
  'LAKE CHINGOLA': { rate: 1.2, currency: 'USD' },
  'LAKE TUNDUMA': { rate: 2875, currency: 'TZS' },
  'INFINITY': { rate: 2757, currency: 'TZS' },
  'GBP MOROGORO': { rate: 2710, currency: 'TZS' },
  'GBP KANGE': { rate: 2730, currency: 'TZS' },
  'GPB KANGE': { rate: 2730, currency: 'TZS' },
  'CASH': { rate: 0, currency: 'TZS' }, // Variable rate
};

/**
 * Find the fuel record to update for an LPO entry and determine its direction.
 *
 * Resolution order:
 *   1. Match by goingDo  → direction 'going'
 *   2. Match by returnDo → direction 'returning'
 *   3. Fall back to the truck's current ACTIVE journey (journeyStatus === 'active'),
 *      else the most recent record for the truck → direction 'going'
 *
 * Journey completion is no longer inferred here from balance / return checkpoints.
 * It is handled by checkAndPromoteStartedJourney once a queued journey's configured
 * start columns are filled.
 */
/**
 * Batch context for processing many LPO entries in a single request (e.g. LPO creation).
 *
 * It eliminates the N+1 problem two ways:
 *   1. `resolution` memoizes findFuelRecordWithDirection() results per (doNo, truckNo) lookup.
 *   2. `byId` keeps a single in-memory copy of each fuel record so sequential read-modify-write
 *      of balance/checkpoint fields across multiple entries stays correct, and writes are
 *      collected into `pendingInc` for one atomic bulkWrite() at the end instead of one write per entry.
 *
 * `emitDataChange` + `checkAndPromoteStartedJourney` are deferred to flushFuelUpdateBatch()
 * so they run once per affected record after the single bulk write lands.
 */
interface FuelUpdateBatch {
  byId: Map<string, any>;
  resolution: Map<string, { fuelRecord: any; direction: 'going' | 'returning' } | null>;
  /** Accumulated field deltas per fuel-record id (applied atomically via pipeline $add/$max). */
  pendingInc: Map<string, Record<string, number>>;
}

function createFuelUpdateBatch(): FuelUpdateBatch {
  return { byId: new Map(), resolution: new Map(), pendingInc: new Map() };
}

/**
 * Apply all batched fuel-record updates with atomic pipeline increments,
 * then emit live updates and run journey promotion once per affected record.
 * When `opts.session` is set, the bulkWrite joins that transaction and
 * emit/promotion are deferred to the caller (post-commit).
 */
async function flushFuelUpdateBatch(
  batch: FuelUpdateBatch,
  username: string,
  opts?: { session?: ClientSession },
): Promise<string[]> {
  if (batch.pendingInc.size === 0) return [];

  const ops = Array.from(batch.pendingInc.entries()).map(([id, incs]) => {
    const setExpr: Record<string, any> = {};
    for (const [field, delta] of Object.entries(incs)) {
      if (field === 'balance') {
        setExpr.balance = { $add: [{ $ifNull: ['$balance', 0] }, delta] };
      } else {
        setExpr[field] = {
          $max: [0, { $add: [{ $ifNull: [`$${field}`, 0] }, delta] }],
        };
      }
    }
    return {
      updateOne: {
        filter: { _id: id },
        update: [{ $set: setExpr }],
      },
    };
  });

  await FuelRecord.bulkWrite(ops as any, opts?.session ? { session: opts.session } : {});
  logger.info(`Batched ${ops.length} fuel-record update(s) into a single atomic bulkWrite`);

  const touchedIds = Array.from(batch.pendingInc.keys());

  // Inside a transaction: caller runs emit + journey promotion after commit.
  if (opts?.session) return touchedIds;

  for (const [id, record] of batch.byId) {
    if (!batch.pendingInc.has(id)) continue;
    emitDataChange('fuel_records', 'update', record.toObject ? record.toObject() : record);
    await checkAndPromoteStartedJourney(record, username);
  }
  return touchedIds;
}

async function findFuelRecordWithDirection(
  doNumber: string,
  truckNo: string,
  batch?: FuelUpdateBatch,
  session?: ClientSession
): Promise<{ fuelRecord: any; direction: 'going' | 'returning' } | null> {
  const cacheKey = `${doNumber}||${truckNo}`;
  if (batch && batch.resolution.has(cacheKey)) {
    return batch.resolution.get(cacheKey)!;
  }

  const truckNorm = (truckNo || '').trim().toLowerCase();
  const truckMatches = (fr: any): boolean => {
    if (!truckNorm) return true;
    return ((fr?.truckNo || '') as string).trim().toLowerCase() === truckNorm;
  };

  // First try to find by DO number (exclude cancelled and deleted records)
  let fuelRecord = await FuelRecord.findOne({
    goingDo: doNumber,
    isDeleted: false,
    isCancelled: { $ne: true },
  }).session(session ?? null);

  let direction: 'going' | 'returning' = 'going';

  if (!fuelRecord) {
    fuelRecord = await FuelRecord.findOne({
      returnDo: doNumber,
      isDeleted: false,
      isCancelled: { $ne: true },
    }).session(session ?? null);
    if (fuelRecord) direction = 'returning';
  }

  // DO hit but truck doesn't match (wrong-truck correction) — prefer the
  // entry's truck journey so liters move onto the intended fuel record.
  if (fuelRecord && !truckMatches(fuelRecord)) {
    logger.info(
      `DO ${doNumber} resolved to truck ${fuelRecord.truckNo} but entry is ${truckNo} — falling back to truck lookup`
    );
    fuelRecord = null;
  }

  // If not found by DO (or DO truck mismatched), fall back to the truck's journey
  if (!fuelRecord) {
    const truckRecords = await FuelRecord.find({
      truckNo: { $regex: `^${truckNo.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' },
      isDeleted: false,
      isCancelled: { $ne: true },
    }).sort({ date: -1 }).session(session ?? null);

    if (truckRecords.length === 0) {
      if (batch) batch.resolution.set(cacheKey, null);
      return null;
    }

    // Prefer a record that owns this DO, else active, else most recent
    const doUpper = (doNumber || '').toUpperCase().trim();
    const byDo =
      truckRecords.find(
        (r: any) =>
          (r.goingDo || '').toUpperCase() === doUpper ||
          (r.returnDo || '').toUpperCase() === doUpper
      ) || null;

    if (byDo) {
      fuelRecord = byDo;
      direction =
        (byDo.returnDo || '').toUpperCase() === doUpper &&
        (byDo.goingDo || '').toUpperCase() !== doUpper
          ? 'returning'
          : 'going';
    } else {
      fuelRecord =
        truckRecords.find((r: any) => r.journeyStatus === 'active') ||
        truckRecords.find((r: any) => r.journeyStatus === 'queued') ||
        truckRecords[0] ||
        null;
      direction = 'going';
    }
  }

  if (!fuelRecord) {
    if (batch) batch.resolution.set(cacheKey, null);
    return null;
  }

  // Reuse a single in-memory copy per record so sequential mutations across entries accumulate
  // correctly (read-modify-write on balance/checkpoint fields must see prior entries' changes).
  if (batch) {
    const idStr = fuelRecord._id.toString();
    if (batch.byId.has(idStr)) {
      fuelRecord = batch.byId.get(idStr);
    } else {
      batch.byId.set(idStr, fuelRecord);
    }
  }

  const resolved = { fuelRecord, direction };
  if (batch) batch.resolution.set(cacheKey, resolved);
  return resolved;
}

/**
 * The real numeric checkpoint columns on a FuelRecord. Any manually-chosen
 * checkpoint (e.g. the pick-up-at picker) MUST be one of these — we never write
 * an arbitrary field name onto the document.
 */
const FUEL_CHECKPOINT_FIELDS = new Set<string>([
  'mmsaYard', 'tangaYard', 'darYard',
  'tangaGoing', 'darGoing', 'moroGoing', 'mbeyaGoing', 'tdmGoing', 'zambiaGoing', 'congoFuel',
  'zambiaReturn', 'tundumaReturn', 'mbeyaReturn', 'moroReturn', 'darReturn', 'tangaReturn',
]);

/**
 * Resolve which FuelRecord checkpoint column an LPO entry maps to, given the
 * station, the detected journey direction and any CASH/CUSTOM overrides.
 * Returns undefined when no mapping can be determined.
 */
async function resolveFuelFieldForEntry(
  station: string,
  direction: 'going' | 'returning',
  cancellationPoint?: string,
  customCheckpointInfo?: {
    isCustomStation?: boolean;
    customGoingCheckpoint?: string;
    customReturnCheckpoint?: string;
  }
): Promise<string | undefined> {
  const stationUpper = station.toUpperCase().trim();
  let fieldToUpdate: string | undefined;

  // For CUSTOM station, use the custom checkpoint based on direction.
  // If only one direction is configured, use that checkpoint regardless of detected direction.
  if (customCheckpointInfo?.isCustomStation) {
    const hasGoing = !!customCheckpointInfo.customGoingCheckpoint;
    const hasReturn = !!customCheckpointInfo.customReturnCheckpoint;

    if (hasGoing && hasReturn) {
      fieldToUpdate = direction === 'going'
        ? customCheckpointInfo.customGoingCheckpoint
        : customCheckpointInfo.customReturnCheckpoint;
    } else if (hasGoing) {
      fieldToUpdate = customCheckpointInfo.customGoingCheckpoint;
    } else if (hasReturn) {
      fieldToUpdate = customCheckpointInfo.customReturnCheckpoint;
    } else {
      logger.warn(`Custom station but no checkpoint configured for any direction`);
    }
    if (fieldToUpdate) logger.info(`Custom station (${direction}) -> field: ${fieldToUpdate}`);
  }
  // For CASH station with cancellation point, use the cancellation point to determine the field
  else if (stationUpper === 'CASH' && cancellationPoint) {
    fieldToUpdate = CANCELLATION_POINT_TO_FUEL_FIELD[cancellationPoint];
    logger.debug(`CASH mode with cancellation point ${cancellationPoint} -> field: ${fieldToUpdate}`);
  }

  // Resolve via FuelStationConfig (the single source of truth for station→checkpoint mapping).
  // Only stations that have fuelRecordFieldGoing or fuelRecordFieldReturning configured are
  // present in stationMappings — stations without those fields are absent so we don't
  // accidentally return undefined and silently skip a revert.
  if (!fieldToUpdate) {
    const stationMappings = await getStationToFuelFieldMapping();
    const fieldMapping = stationMappings[stationUpper];

    if (!fieldMapping) {
      logger.warn(`No checkpoint field configured in FuelStationConfig for station "${stationUpper}". Set fuelRecordFieldGoing / fuelRecordFieldReturning in the station admin to enable automated fuel-record sync.`);
      return undefined;
    }

    fieldToUpdate = direction === 'going' ? fieldMapping.going : fieldMapping.returning;
    if (!fieldToUpdate) {
      const missingField = direction === 'going' ? 'fuelRecordFieldGoing' : 'fuelRecordFieldReturning';
      const hasField     = direction === 'going' ? 'fuelRecordFieldReturning' : 'fuelRecordFieldGoing';
      logger.warn(
        `Station "${stationUpper}" has no ${missingField} configured for ${direction} trucks. ` +
        `It only has ${hasField} set. Go to the station admin and add ${missingField} to fix this.`
      );
      return undefined;
    }
  }

  return fieldToUpdate;
}

/**
 * NIL / DA / REF (and empty DO) entries never touch fuel records.
 * Matches create, cancel-all, and pick-up-at gating.
 */
function entrySkipsFuelRecord(entry: {
  doNo?: string;
  isDriverAccount?: boolean;
  isRefer?: boolean;
}): boolean {
  if (entry?.isDriverAccount === true || entry?.isRefer === true) return true;
  const doUp = (entry?.doNo || '').toString().trim().toUpperCase();
  return !doUp || doUp === 'NIL' || doUp === 'N/A' || doUp === 'REF' || doUp === 'DA';
}

/**
 * Update fuel record when LPO entry is created/updated
 * @param doNumber - DO number for identifying the fuel record
 * @param litersChange - positive for deduction, negative for reverting
 * @param station - station name (determines field for non-CASH entries)
 * @param truckNo - truck number for identifying the fuel record
 * @param cancellationPoint - optional cancellation point (for CASH entries - determines which field to update)
 * @param customCheckpointInfo - optional custom station checkpoint info
 */
async function updateFuelRecordForLPOEntry(
  doNumber: string,
  litersChange: number,
  station: string,
  truckNo: string,
  cancellationPoint?: string,
  customCheckpointInfo?: {
    isCustomStation?: boolean;
    customGoingCheckpoint?: string;
    customReturnCheckpoint?: string;
  },
  batch?: FuelUpdateBatch,
  opts?: {
    session?: ClientSession;
    // When provided, this exact FuelRecord column is written (manual checkpoint
    // pick). Must be one of FUEL_CHECKPOINT_FIELDS — station/direction derivation
    // is skipped entirely.
    explicitField?: string;
    // In session/transaction mode emit + journey-promotion are deferred to the
    // caller (post-commit); touched record ids are collected here.
    touchedIds?: Set<string>;
    // When true (atomic LPO create with deduct ON), missing fuel/field is a hard error.
    requireSuccess?: boolean;
  }
): Promise<void> {
  try {
    // Check for NIL DO, Driver Account, or REF entries
    const doNoUpper = (doNumber || '').toString().trim().toUpperCase();
    const isNilDO = doNoUpper === 'NIL' || doNoUpper === '' || doNoUpper === 'N/A';
    const isRefEntry = doNoUpper === 'REF';
    const isDaDo = doNoUpper === 'DA';

    logger.debug(`Updating fuel record: DO=${doNumber}, truck=${truckNo}, station=${station}, litersChange=${litersChange}, cancellationPoint=${cancellationPoint || 'N/A'}, explicitField=${opts?.explicitField || 'N/A'}, customInfo=${JSON.stringify(customCheckpointInfo || {})}`);

    // Skip fuel record update for NIL DOs (expected for Driver Account and CASH entries)
    if (isNilDO) {
      logger.debug(`Skipping fuel record update for NIL DO - likely Driver Account or CASH entry (truck: ${truckNo})`);
      return;
    }

    // Skip fuel record update for REF entries (partner/third-party trucks)
    if (isRefEntry) {
      logger.debug(`Skipping fuel record update for REF entry - partner truck (truck: ${truckNo})`);
      return;
    }

    // Skip DA-mode DO marker (flag-only driver account rows store doNo as "DA")
    if (isDaDo) {
      logger.debug(`Skipping fuel record update for DA DO marker (truck: ${truckNo})`);
      return;
    }

    const result = await findFuelRecordWithDirection(doNumber, truckNo, batch, opts?.session);

    if (!result) {
      logger.warn(`No fuel record found for DO ${doNumber} or truck ${truckNo} to update - possible data inconsistency`);
      if (opts?.requireSuccess) {
        throw new ApiError(
          422,
          `No fuel record found for DO ${doNumber} / truck ${truckNo}. LPO was not created — fix the fuel record first, or turn off LPO create deduct automation.`,
        );
      }
      return;
    }

    const { fuelRecord, direction } = result;

    let fieldToUpdate: string | undefined;

    // Manual checkpoint pick: write the exact column the caller chose (validated).
    if (opts?.explicitField) {
      if (!FUEL_CHECKPOINT_FIELDS.has(opts.explicitField)) {
        logger.warn(`Rejected invalid explicit checkpoint field "${opts.explicitField}" for truck ${truckNo}`);
        if (opts?.requireSuccess) {
          throw new ApiError(422, `Invalid checkpoint field "${opts.explicitField}" for truck ${truckNo}.`);
        }
        return;
      }
      fieldToUpdate = opts.explicitField;
      logger.debug(`Manual checkpoint -> field: ${fieldToUpdate}`);
    } else {
      fieldToUpdate = await resolveFuelFieldForEntry(station, direction, cancellationPoint, customCheckpointInfo);
    }

    if (!fieldToUpdate) {
      logger.warn(`No valid field to update for station ${station} direction ${direction} cancellationPoint ${cancellationPoint}`);
      if (opts?.requireSuccess) {
        throw new ApiError(
          422,
          `No fuel checkpoint mapping for station "${station}" (${direction}) on DO ${doNumber} / truck ${truckNo}. LPO was not created — configure the station checkpoint fields, or turn off LPO create deduct automation.`,
        );
      }
      return;
    }

    // Store checkpoint values as POSITIVE numbers
    // litersChange: positive = add fuel (LPO creation), negative = remove fuel (cancellation)
    const currentValue = Math.abs((fuelRecord as any)[fieldToUpdate] || 0);
    const oldBalance = fuelRecord.balance;
    const newValue = currentValue + litersChange; // For cancellation, litersChange is negative, so this subtracts

    // Update balance: positive litersChange reduces balance, negative litersChange increases balance
    const newBalance = fuelRecord.balance - litersChange; // For cancellation, litersChange is negative, so this adds

    const action = litersChange > 0 ? 'added' : 'removed';
    logger.debug(`Updating field ${fieldToUpdate}: ${currentValue}L -> ${Math.max(0, newValue)}L (${action}: ${Math.abs(litersChange)}L, balance: ${oldBalance}L -> ${newBalance}L)`);

    // Batched path: mutate the shared in-memory record so subsequent entries see this change,
    // accumulate atomic $inc deltas, and defer emit/promotion to flushFuelUpdateBatch().
    if (batch) {
      (fuelRecord as any)[fieldToUpdate] = Math.max(0, newValue);
      fuelRecord.balance = newBalance;
      const idStr = fuelRecord._id.toString();
      const existing = batch.pendingInc.get(idStr) || {};
      existing[fieldToUpdate] = (existing[fieldToUpdate] || 0) + litersChange;
      existing.balance = (existing.balance || 0) - litersChange;
      batch.pendingInc.set(idStr, existing);
      logger.debug(`✓ Queued fuel record ${idStr} field ${fieldToUpdate}: ${litersChange > 0 ? 'deducted' : 'restored'} ${Math.abs(litersChange)}L`);
      return;
    }

    // Atomic pipeline update — safe under concurrent LPO writes on the same record
    const updatedRecord = await FuelRecord.findByIdAndUpdate(
      fuelRecord._id,
      [
        {
          $set: {
            [fieldToUpdate]: {
              $max: [0, { $add: [{ $ifNull: [`$${fieldToUpdate}`, 0] }, litersChange] }],
            },
            balance: { $add: [{ $ifNull: ['$balance', 0] }, -litersChange] },
          },
        },
      ],
      { new: true, session: opts?.session ?? null }
    );

    logger.debug(`✓ Updated fuel record ${fuelRecord._id} field ${fieldToUpdate}: ${litersChange > 0 ? 'deducted' : 'restored'} ${Math.abs(litersChange)}L`);

    if (updatedRecord) {
      // In a transaction, defer the live-emit and journey promotion to the caller
      // (post-commit) so we never run a nested transaction or emit uncommitted data.
      if (opts?.session) {
        opts.touchedIds?.add(updatedRecord._id.toString());
      } else {
        // Live-update the fuel records table for every connected client (no refresh).
        emitDataChange('fuel_records', 'update', updatedRecord.toObject());
        // If this LPO fill just started a queued journey (a start column went non-zero),
        // auto-complete the truck's prior active journey and promote this one — live.
        await checkAndPromoteStartedJourney(updatedRecord, 'lpo-system');
      }
    }
  } catch (error: any) {
    logger.error(`Error updating fuel record for LPO: ${error.message}`);
    // Inside a transaction / requireSuccess the failure must abort the whole operation.
    if (opts?.session || opts?.requireSuccess || error instanceof ApiError) throw error;
  }
}

/**
 * Get or create workbook for a specific year
 */
async function getOrCreateWorkbook(year: number): Promise<any> {
  let workbook = await LPOWorkbook.findOne({ year, isDeleted: false });

  if (!workbook) {
    workbook = await LPOWorkbook.create({
      year,
      name: `LPOS ${year}`,
    });
    logger.info(`Created new workbook for year ${year}`);
  }

  return workbook;
}

/**
 * Get all workbooks
 */
export const getAllWorkbooks = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const workbooks = await LPOWorkbook.find({ isDeleted: false })
      .sort({ year: -1 })
      .lean();

    const workbooksWithCounts = await Promise.all(
      workbooks.map(async (wb) => {
        const sheetCount = await LPOSummary.countDocuments({ year: wb.year, isDeleted: false });
        return {
          ...wb,
          id: wb._id,
          sheetCount,
        };
      })
    );

    res.status(200).json({
      success: true,
      message: 'Workbooks retrieved successfully',
      data: workbooksWithCounts,
    });
  } catch (error: any) {
    throw error;
  }
};

/**
 * Get workbook by year with all its sheets (LPO documents)
 * Supports optional month filtering via query params
 * - months: comma-separated list of months (1-12) e.g., "11,12" for Nov & Dec
 */
export const getWorkbookByYear = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const year = parseInt(req.params.year, 10);
    const { months } = req.query;

    if (isNaN(year)) {
      throw new ApiError(400, 'Invalid year');
    }

    let workbook = await LPOWorkbook.findOne({ year, isDeleted: false });

    // Auto-create workbook if it doesn't exist
    if (!workbook) {
      workbook = await getOrCreateWorkbook(year);
    }

    // Build filter for sheets
    const sheetFilter: any = { year, isDeleted: false };
    
    // If months parameter is provided, filter by month
    if (months && typeof months === 'string') {
      const monthNumbers = months.split(',').map(m => parseInt(m.trim(), 10)).filter(m => m >= 1 && m <= 12);
      
      if (monthNumbers.length > 0) {
        // Filter by date field - extract month from date string (YYYY-MM-DD format)
        sheetFilter.$expr = {
          $in: [{ $month: { $dateFromString: { dateString: '$date' } } }, monthNumbers]
        };
      }
    }

    const sheets = await LPOSummary.find(sheetFilter)
      .sort({ lpoNo: 1 })
      .lean();

    res.status(200).json({
      success: true,
      message: 'Workbook retrieved successfully',
      data: {
        ...workbook!.toObject(),
        id: workbook!._id,
        sheets: sheets.map((s) => ({ ...s, id: s._id })),
      },
    });
  } catch (error: any) {
    throw error;
  }
};

/**
 * Get all LPO documents with pagination and filters
 */
export const getAllLPOSummaries = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { page, limit, sort, order } = getPaginationParams(req.query);
    const { dateFrom, dateTo, lpoNo, station, year, search } = req.query;

    const filter: any = { isDeleted: false };

    if (year) {
      filter.year = parseInt(year as string, 10);
    }

    if (dateFrom || dateTo) {
      filter.createdAt = {};
      if (dateFrom) filter.createdAt.$gte = new Date(dateFrom as string);
      if (dateTo) {
        const endDate = new Date(dateTo as string);
        endDate.setHours(23, 59, 59, 999);
        filter.createdAt.$lte = endDate;
      }
    }

    // Multi-field search parameter - searches across lpoNo, entries.truckNo, station, entries.doNo
    if (search) {
      const sanitized = sanitizeRegexInput(search as string);
      if (sanitized) {
        filter.$or = [
          { lpoNo: { $regex: sanitized, $options: 'i' } },
          { 'entries.truckNo': { $regex: sanitized, $options: 'i' } },
          { station: { $regex: sanitized, $options: 'i' } },
          { 'entries.doNo': { $regex: sanitized, $options: 'i' } }
        ];
      }
    } else {
      // Individual field filters (backward compatibility)
      if (lpoNo) {
        filter.lpoNo = { $regex: lpoNo, $options: 'i' };
      }

      if (station) {
        filter.station = { $regex: station, $options: 'i' };
      }
    }

    // A date/year filter used to force the slow "merged" path below, which
    // loads every matching active + archived LPO into memory and paginates in
    // JS. The LPO page filters by the current month by default, so that was
    // the path taken on every load and every page click. Only take it when
    // the archive actually contains matching rows (a cheap indexed count) —
    // otherwise the normal indexed skip/limit query handles the filter.
    let includeArchived = false;
    if (dateFrom || dateTo || year) {
      try {
        const archivedCount = await ArchivedLPOSummary.countDocuments({
          ...filter,
          isDeleted: { $ne: true },
        });
        includeArchived = archivedCount > 0;
      } catch (archErr: any) {
        logger.warn(`Archived LPO count failed — using active-only path: ${archErr.message}`);
      }
    }
    let lpoSummaries: any[];
    let total: number;

    if (includeArchived) {
      // Use unified export service to get both active and archived data
      const startDate = dateFrom ? new Date(dateFrom as string) : (year ? new Date(parseInt(year as string, 10), 0, 1) : undefined);
      const endDate = dateTo ? new Date(dateTo as string) : (year ? new Date(parseInt(year as string, 10), 11, 31, 23, 59, 59) : undefined);
      
      const allLPOs = await unifiedExportService.getAllLPOSummaries({
        startDate,
        endDate,
        includeArchived: true,
        filters: { ...filter, isDeleted: { $ne: true } },
      });

      // Apply additional filters
      let filteredLPOs = allLPOs;
      
      // Apply search filter if present (multi-field search in nested entries)
      if (search) {
        const regex = new RegExp(search as string, 'i');
        filteredLPOs = filteredLPOs.filter(l => {
          // Search in top-level fields
          if (regex.test(String(l.lpoNo)) || regex.test(l.station || '')) {
            return true;
          }
          // Search in entries array for truckNo and doNo
          if (l.entries && Array.isArray(l.entries)) {
            return l.entries.some((entry: any) => 
              regex.test(entry.truckNo || '') || regex.test(entry.doNo || '')
            );
          }
          return false;
        });
      } else {
        // Apply individual filters (backward compatibility)
        if (lpoNo) {
          const regex = new RegExp(lpoNo as string, 'i');
          filteredLPOs = filteredLPOs.filter(l => regex.test(String(l.lpoNo)));
        }
        if (station) {
          const regex = new RegExp(station as string, 'i');
          filteredLPOs = filteredLPOs.filter(l => regex.test(l.station || ''));
        }
      }
      
      if (year) {
        const yearNum = parseInt(year as string, 10);
        filteredLPOs = filteredLPOs.filter(l => l.year === yearNum);
      }

      // Sort
      const sortField = sort || 'date';
      const sortDir = order === 'asc' ? 1 : -1;
      filteredLPOs.sort((a, b) => {
        const aVal = a[sortField];
        const bVal = b[sortField];
        if (aVal < bVal) return -sortDir;
        if (aVal > bVal) return sortDir;
        return 0;
      });

      // Paginate in memory
      total = filteredLPOs.length;
      const skip = calculateSkip(page, limit);
      lpoSummaries = filteredLPOs.slice(skip, skip + limit);
    } else {
      // No date/year filter - only query active data (normal pagination)
      const skip = calculateSkip(page, limit);
      const sortOrder = order === 'asc' ? 1 : -1;

      [lpoSummaries, total] = await Promise.all([
        LPOSummary.find(filter)
          .sort({ [sort]: sortOrder })
          .skip(skip)
          .limit(limit)
          .lean(),
        LPOSummary.countDocuments(filter),
      ]);
    }

    const response = createPaginatedResponse(lpoSummaries, page, limit, total);

    res.status(200).json({
      success: true,
      message: 'LPO documents retrieved successfully',
      data: response,
    });
  } catch (error: any) {
    throw error;
  }
};

/**
 * Get single LPO document by ID
 */
export const getLPOSummaryById = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const lpoSummary = await LPOSummary.findOne({ _id: id, isDeleted: false });

    if (!lpoSummary) {
      throw new ApiError(404, 'LPO document not found');
    }

    // Return with id field for frontend compatibility
    const responseData = lpoSummary.toObject();
    
    res.status(200).json({
      success: true,
      message: 'LPO document retrieved successfully',
      data: { ...responseData, id: responseData._id },
    });
  } catch (error: any) {
    throw error;
  }
};

/**
 * Get LPO document by LPO number
 */
export const getLPOSummaryByLPONo = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { lpoNo } = req.params;

    const lpoSummary = await LPOSummary.findOne({ lpoNo, isDeleted: false });

    if (!lpoSummary) {
      throw new ApiError(404, 'LPO document not found');
    }

    // Return with id field for frontend compatibility
    const responseData = lpoSummary.toObject();
    
    res.status(200).json({
      success: true,
      message: 'LPO document retrieved successfully',
      data: { ...responseData, id: responseData._id },
    });
  } catch (error: any) {
    throw error;
  }
};

/**
 * Get the next available LPO number.
 * Format: XXXX/YY (e.g. 0001/26) — same convention as DO numbers.
 * Resets to 0001/YY each new year. Handles legacy plain-integer LPOs during transition.
 */
export const getNextLPONumber = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const currentYear = new Date().getFullYear();
    const yearSuffix = currentYear.toString().slice(-2);

    // Try new XXXX/YY format first. Split on "/" and cast the left part to int.
    const newFmtResult = await LPOSummary.aggregate([
      { $match: { isDeleted: false, year: currentYear, lpoNo: { $regex: `/${yearSuffix}$` } } },
      { $project: { seq: { $toInt: { $arrayElemAt: [{ $split: ['$lpoNo', '/'] }, 0] } } } },
      { $group: { _id: null, maxSeq: { $max: '$seq' } } },
    ]);

    let nextSeq: number;

    if (newFmtResult.length > 0 && newFmtResult[0].maxSeq != null) {
      nextSeq = newFmtResult[0].maxSeq + 1;
    } else {
      // No new-format LPOs for this year yet — fall back to legacy plain-int format
      // so we don't restart from 1 mid-year during the transition.
      const legacyResult = await LPOSummary.aggregate([
        { $match: { isDeleted: false, year: currentYear } },
        { $project: { lpoNoInt: { $toInt: '$lpoNo' } } },
        { $group: { _id: null, maxLpoNo: { $max: '$lpoNoInt' } } },
      ]);
      nextSeq = (legacyResult[0]?.maxLpoNo ?? 0) + 1;
    }

    let nextLpoNo = formatDONumber(nextSeq, currentYear);

    // Race-condition safety check
    const exists = await LPOSummary.exists({ lpoNo: nextLpoNo, isDeleted: false });
    if (exists) {
      const agg = await LPOSummary.aggregate([
        { $match: { isDeleted: false, year: currentYear, lpoNo: { $regex: `/${yearSuffix}$` } } },
        { $project: { seq: { $toInt: { $arrayElemAt: [{ $split: ['$lpoNo', '/'] }, 0] } } } },
        { $group: { _id: null, maxSeq: { $max: '$seq' } } },
      ]);
      nextSeq = (agg[0]?.maxSeq ?? 0) + 1;
      nextLpoNo = formatDONumber(nextSeq, currentYear);
    }

    res.status(200).json({
      success: true,
      message: 'Next LPO number retrieved successfully',
      data: { nextLpoNo },
    });
  } catch (error: any) {
    throw error;
  }
};

/**
 * Allocate the next canonical LPO number (XXXX/YY) for a year — the same scheme
 * getNextLPONumber returns for the manual create form. Server-side LPO creators
 * (forward, pick-up-at) use this so generated LPOs match the rest of the system
 * instead of the legacy plain-integer format. Session-aware for transactions.
 */
async function allocateNextLpoNo(year: number, session?: ClientSession): Promise<string> {
  const yearSuffix = year.toString().slice(-2);

  const maxNewFmt = await LPOSummary.aggregate([
    { $match: { isDeleted: false, year, lpoNo: { $regex: `/${yearSuffix}$` } } },
    { $project: { seq: { $toInt: { $arrayElemAt: [{ $split: ['$lpoNo', '/'] }, 0] } } } },
    { $group: { _id: null, maxSeq: { $max: '$seq' } } },
  ]).session(session ?? null);

  let nextSeq: number;
  if (maxNewFmt.length > 0 && maxNewFmt[0].maxSeq != null) {
    nextSeq = maxNewFmt[0].maxSeq + 1;
  } else {
    // No new-format LPOs this year yet — fall back to the legacy plain-int max so we
    // don't restart from 1 mid-year during the format transition.
    const legacy = await LPOSummary.aggregate([
      { $match: { isDeleted: false, year } },
      { $project: { lpoNoInt: { $toInt: '$lpoNo' } } },
      { $group: { _id: null, maxLpoNo: { $max: '$lpoNoInt' } } },
    ]).session(session ?? null);
    nextSeq = (legacy[0]?.maxLpoNo ?? 0) + 1;
  }

  let nextLpoNo = formatDONumber(nextSeq, year);
  let exists = await LPOSummary.exists({ lpoNo: nextLpoNo, isDeleted: false }).session(session ?? null);
  while (exists) {
    nextSeq++;
    nextLpoNo = formatDONumber(nextSeq, year);
    exists = await LPOSummary.exists({ lpoNo: nextLpoNo, isDeleted: false }).session(session ?? null);
  }
  return nextLpoNo;
}

/**
 * Create new LPO document (sheet in a workbook)
 * Handles regular entries, cancelled entries, and driver account entries.
 * When `lpoCreateDeduct` automation is ON, LPO create + fuel deductions run in
 * one Mongo transaction (both commit or both roll back).
 */
export const createLPOSummary = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const username = req.user?.username;
    if (!username) throw new ApiError(401, 'Authentication required');
    const { enforceResourceLock } = await import('./resourceLockController');
    await enforceResourceLock('lpo_create', username);

    const data = req.body;
    
    logger.debug(`Creating LPO: station=${data.station}, isCustomStation=${data.isCustomStation}, customStationName=${data.customStationName}, entries=${data.entries?.length || 0}`);

    // Extract year from date
    const dateObj = new Date(data.date);
    const year = dateObj.getFullYear();

    // Ensure workbook exists for this year
    await getOrCreateWorkbook(year);

    // Resolve station currency from FuelStationConfig (USD for Zambia, TZS for Tanzania)
    let resolvedCurrency: 'USD' | 'TZS' = 'TZS';
    if (data.station && data.station !== 'CASH' && data.station !== 'CUSTOM') {
      const stationConfig = await FuelStationConfig.findOne({ stationName: data.station, isActive: true }).lean();
      if (stationConfig?.currency) {
        resolvedCurrency = stationConfig.currency as 'USD' | 'TZS';
      } else {
        // Fallback heuristic: Lake Zambia stations = USD, everything else = TZS
        const upper = (data.station as string).toUpperCase();
        if (upper.startsWith('LAKE') && !upper.includes('TUNDUMA')) resolvedCurrency = 'USD';
      }
    }

    const fuelFlags = await getFuelAutomationFlags();
    const needsAtomicDeduct = fuelFlags.lpoCreateDeduct;
    const lpoPayload = {
      ...data,
      currency: data.currency || resolvedCurrency,
      year,
      createdBy: req.user?.username || 'Unknown',
    };

    let lpoSummary: any;
    let createDeductionsSkipped = 0;
    let touchedFuelIds: string[] = [];

    const applyCreateDeductions = async (
      lpo: any,
      session?: ClientSession,
    ): Promise<string[]> => {
      const fuelBatch = createFuelUpdateBatch();
      if (!lpo.entries || lpo.entries.length === 0) return [];

      for (const entry of lpo.entries) {
        if (entry.isCancelled) {
          logger.debug(`Skipping fuel record update for cancelled entry: ${entry.truckNo}`);
          continue;
        }
        if (entry.isDriverAccount) {
          logger.debug(`Skipping fuel record update for DA entry: ${entry.truckNo}`);
          continue;
        }
        if (entry.isRefer) {
          logger.debug(`Skipping fuel record update for REF entry: ${entry.truckNo}`);
          continue;
        }

        if (!needsAtomicDeduct) {
          createDeductionsSkipped += 1;
          logger.debug(`[fuelAutomation] lpoCreateDeduct OFF — skipping fuel deduction for ${entry.truckNo} (LPO ${lpo.lpoNo})`);
          continue;
        }

        const customInfo = entry.isCustomStation ? {
          isCustomStation: entry.isCustomStation,
          customGoingCheckpoint: entry.customGoingCheckpoint,
          customReturnCheckpoint: entry.customReturnCheckpoint,
        } : undefined;

        const deductOpts = session
          ? { session, requireSuccess: true as const }
          : undefined;

        if (entry.goingCheckpoint) {
          await updateFuelRecordForLPOEntry(
            entry.doNo, entry.liters, lpo.station, entry.truckNo,
            entry.goingCheckpoint, customInfo, fuelBatch, deductOpts,
          );
        }
        if (entry.returningCheckpoint) {
          await updateFuelRecordForLPOEntry(
            entry.doNo, entry.liters, lpo.station, entry.truckNo,
            entry.returningCheckpoint, customInfo, fuelBatch, deductOpts,
          );
        }
        if (!entry.goingCheckpoint && !entry.returningCheckpoint && entry.cancellationPoint) {
          await updateFuelRecordForLPOEntry(
            entry.doNo, entry.liters, lpo.station, entry.truckNo,
            entry.cancellationPoint, customInfo, fuelBatch, deductOpts,
          );
        }
        if (!entry.goingCheckpoint && !entry.returningCheckpoint && !entry.cancellationPoint) {
          await updateFuelRecordForLPOEntry(
            entry.doNo, entry.liters, lpo.station, entry.truckNo,
            undefined, customInfo, fuelBatch, deductOpts,
          );
        }
      }

      return flushFuelUpdateBatch(fuelBatch, 'lpo-system', session ? { session } : undefined);
    };

    if (needsAtomicDeduct) {
      // Atomic path: LPO + fuel deductions succeed or fail together.
      const session = await mongoose.startSession();
      try {
        await session.withTransaction(async () => {
          const created = await LPOSummary.create([lpoPayload], { session });
          lpoSummary = created[0];
          touchedFuelIds = await applyCreateDeductions(lpoSummary, session);
        });
      } finally {
        await session.endSession();
      }

      // Post-commit: live-update + journey promotion (must not run inside the txn).
      if (touchedFuelIds.length > 0) {
        const records = await FuelRecord.find({ _id: { $in: touchedFuelIds } });
        for (const rec of records) {
          emitDataChange('fuel_records', 'update', rec.toObject());
          await checkAndPromoteStartedJourney(rec, 'lpo-system');
        }
      }
    } else {
      // Automation OFF: create LPO only; fuel deductions skipped.
      lpoSummary = await LPOSummary.create(lpoPayload);
      await applyCreateDeductions(lpoSummary);
    }

    logger.info(`LPO document created: ${lpoSummary.lpoNo} for year ${year} by ${req.user?.username}`);

    await AuditService.log({
      userId: req.user?.userId,
      username: req.user?.username || 'system',
      action: 'CREATE',
      resourceType: 'LPOSummary',
      resourceId: lpoSummary.lpoNo,
      details: `LPO document ${lpoSummary.lpoNo} created (${lpoSummary.entries?.length || 0} entries, station: ${data.station}) by ${req.user?.username}`,
      ipAddress: req.ip,
      severity: 'medium',
    });

    if (createDeductionsSkipped > 0) {
      await AuditService.log({
        userId: req.user?.userId,
        username: req.user?.username || 'system',
        action: 'UPDATE',
        resourceType: 'FuelRecord',
        resourceId: lpoSummary.lpoNo,
        details: `Fuel deduction SKIPPED for ${createDeductionsSkipped} entr${createDeductionsSkipped === 1 ? 'y' : 'ies'} on LPO ${lpoSummary.lpoNo} — automation 'lpoCreateDeduct' is disabled. Manual fuel-record adjustment required.`,
        ipAddress: req.ip,
        severity: 'high',
      }).catch((err: any) => logger.warn(`Failed to write audit breadcrumb for skipped LPO deduction (LPO ${lpoSummary.lpoNo}): ${err?.message}`));
    }

    const responseData = lpoSummary.toObject();
    
    res.status(201).json({
      success: true,
      message: createDeductionsSkipped > 0
        ? 'LPO document created. Note: fuel-record deduct automation is disabled — adjust fuel records manually.'
        : 'LPO document created successfully',
      data: { ...responseData, id: responseData._id },
    });
    emitDataChange('lpo_summaries', 'create', lpoSummary.toObject(), lpoSummary.station, undefined, {
      id: req.user?.userId,
      username: req.user?.username,
    });
    // Atomic path already emitted per-record fuel updates above.
    if (!needsAtomicDeduct) emitDataChange('fuel_records', 'update');

    createLPOCreatedNotification(lpoSummary, req.user?.username || 'system').catch(() => {});
  } catch (error: any) {
    throw error;
  }
};

/**
 * Update LPO document (sheet) with fuel record adjustment
 * Tracks amendments and prevents double updates
 */
export const updateLPOSummary = async (req: AuthRequest, res: Response): Promise<void> => {
  const { id } = req.params;
  const newData = req.body;

  // Pre-flight: auth + lock enforcement (outside transaction — no writes needed)
  const username = req.user?.username;
    if (!username) throw new ApiError(401, 'Authentication required');
    const preflightLpo = await LPOSummary.findOne({ _id: id, isDeleted: false }).select('_id').lean();
    if (!preflightLpo) throw new ApiError(404, 'LPO document not found');
    await enforceEditLock(LPOSummary, id, username, 'lpo_summaries');

    // Define entry type for proper typing
    interface EntryType {
      doNo: string;
      truckNo: string;
      liters: number;
      rate: number;
      amount: number;
      dest: string;
      originalLiters?: number | null;
      amendedAt?: Date | null;
      isCancelled?: boolean;
      isDriverAccount?: boolean;
      isRefer?: boolean;
      cancellationPoint?: string;
      originalDoNo?: string;
      cancellationReason?: string;
      cancelledAt?: Date;
      _id?: any;
      // Custom station fields
      isCustomStation?: boolean;
      customStationName?: string;
      customGoingCheckpoint?: string;
      customReturnCheckpoint?: string;
    }

    // Fetch flags + parse manual checkpoints before the session (reads only, no writes)
    const fuelFlags = await getFuelAutomationFlags();
    const rawManualCheckpoints = (newData.manualCheckpoints || {}) as Record<string, string>;
    const manualFieldFor = (e: EntryType): string | undefined => {
      const f = rawManualCheckpoints[`${e.doNo}-${e.truckNo}`];
      return f && FUEL_CHECKPOINT_FIELDS.has(f) ? f : undefined;
    };
    if ('manualCheckpoints' in newData) delete newData.manualCheckpoints;

    // Accumulators — populated inside the transaction, consumed after commit
    const entriesToUpdate: EntryType[] = [];
    const newlyCancelledEntries: EntryType[] = [];
    const skippedAutomation = new Set<string>();
    const touchedFuelIds = new Set<string>();
    let lpoSummary: any;

    // Transaction: fuel-record mutations and LPO save are atomic
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
      const existingLpo = await LPOSummary.findOne({ _id: id, isDeleted: false }).session(session);
      if (!existingLpo) throw new ApiError(404, 'LPO document not found');

      logger.info(`Updating LPO ${existingLpo.lpoNo}, station: ${existingLpo.station}`);

      // Calculate fuel record adjustments using database values (not request values)
      const oldEntriesMap = new Map<string, EntryType>(
        existingLpo.entries.map((e) => [`${e.doNo}-${e.truckNo}`, e as unknown as EntryType])
      );
      const newEntries: EntryType[] = newData.entries || existingLpo.entries;
      const newEntriesMap = new Map<string, EntryType>(
        newEntries.map((e: EntryType) => [`${e.doNo}-${e.truckNo}`, e])
      );

      // debug, not info: these serialize the ENTIRE entry maps to JSON on every
      // LPO edit. At info level (prod default) that spikes the heap and floods the
      // logs on each save. Behaviour is unchanged — only the verbosity drops; set
      // LOG_LEVEL=debug to see them again when diagnosing a fuel-diff issue.
      logger.debug(`Old entries (from DB): ${JSON.stringify([...oldEntriesMap.entries()])}`);
      logger.debug(`New entries (from request): ${JSON.stringify([...newEntriesMap.entries()])}`);

      // Get date info for driver account entries
      const dateObj = new Date(newData.date || existingLpo.date);
      const month = dateObj.toLocaleString('default', { month: 'long' });
      const year = dateObj.getFullYear();

    // Revert old entries that are removed or changed
    for (const [key, oldEntry] of oldEntriesMap) {
      const newEntry = newEntriesMap.get(key);
      
      // Handle restoration first (when entry was cancelled but now is being uncancelled)
      if (newEntry && !newEntry.isCancelled && oldEntry.isCancelled) {
        // Entry was restored/uncancelled - deduct fuel again (skip for DA/REF/NIL)
        if (!entrySkipsFuelRecord(newEntry) && !entrySkipsFuelRecord(oldEntry)) {
          logger.info(`Entry restored: ${key}, deducting ${newEntry.liters}L from fuel record`);
          if (fuelFlags.lpoCancelRevert) {
            await updateFuelRecordForLPOEntry(
              newEntry.doNo,
              newEntry.liters, // Positive value to deduct from fuel record
              newData.station || existingLpo.station,
              newEntry.truckNo,
              newEntry.cancellationPoint || oldEntry.cancellationPoint,
              (newEntry.isCustomStation || oldEntry.isCustomStation) ? {
                isCustomStation: newEntry.isCustomStation || oldEntry.isCustomStation,
                customGoingCheckpoint: newEntry.customGoingCheckpoint || oldEntry.customGoingCheckpoint,
                customReturnCheckpoint: newEntry.customReturnCheckpoint || oldEntry.customReturnCheckpoint,
              } : undefined,
              undefined,
              { session, touchedIds: touchedFuelIds }
            );
          } else if (manualFieldFor(newEntry)) {
            // Automation off, but operator chose the checkpoint manually.
            await updateFuelRecordForLPOEntry(
              newEntry.doNo, newEntry.liters, newData.station || existingLpo.station, newEntry.truckNo,
              undefined, undefined, undefined, { session, touchedIds: touchedFuelIds, explicitField: manualFieldFor(newEntry) }
            );
            logger.info(`[fuelAutomation] lpoCancelRevert OFF — manual checkpoint ${manualFieldFor(newEntry)} re-deducted for ${newEntry.truckNo}`);
          } else {
            skippedAutomation.add('lpoCancelRevert');
            logger.info(`[fuelAutomation] lpoCancelRevert OFF — skipping restore re-deduction for ${newEntry.truckNo}`);
          }
        } else {
          logger.info(`Entry restored (DA/REF/NIL): ${key}, clearing cancel flags without fuel deduct`);
        }

        // Clear cancellation timestamp and reason
        newEntry.cancelledAt = undefined;
        newEntry.cancellationReason = undefined;
        continue; // Move to next entry
      }
      
      // Skip fuel/state diffs for entries that were already cancelled (restore handled above)
      if (oldEntry.isCancelled) {
        continue;
      }

      const oldSkipsFuel = entrySkipsFuelRecord(oldEntry);
      
      if (!newEntry) {
        // Entry was removed - revert the fuel deduction (skip for DA/REF/NIL)
        if (oldSkipsFuel) {
          logger.info(`Entry removed (DA/REF/NIL): ${key}, skipping fuel revert`);
          continue;
        }
        logger.info(`Entry removed: ${key}, reverting ${oldEntry.liters}L`);
        if (fuelFlags.lpoEditAdjust) {
          await updateFuelRecordForLPOEntry(
            oldEntry.doNo,
            -oldEntry.liters,
            existingLpo.station,
            oldEntry.truckNo,
            oldEntry.cancellationPoint,
            oldEntry.isCustomStation ? {
              isCustomStation: oldEntry.isCustomStation,
              customGoingCheckpoint: oldEntry.customGoingCheckpoint,
              customReturnCheckpoint: oldEntry.customReturnCheckpoint,
            } : undefined,
            undefined,
            { session, touchedIds: touchedFuelIds }
          );
        } else if (manualFieldFor(oldEntry)) {
          await updateFuelRecordForLPOEntry(
            oldEntry.doNo, -oldEntry.liters, existingLpo.station, oldEntry.truckNo,
            undefined, undefined, undefined, { session, touchedIds: touchedFuelIds, explicitField: manualFieldFor(oldEntry) }
          );
          logger.info(`[fuelAutomation] lpoEditAdjust OFF — manual checkpoint ${manualFieldFor(oldEntry)} reverted for removed entry ${oldEntry.truckNo}`);
        } else {
          skippedAutomation.add('lpoEditAdjust');
          logger.info(`[fuelAutomation] lpoEditAdjust OFF — skipping revert for removed entry ${oldEntry.truckNo}`);
        }
      } else if (newEntry.isCancelled && !oldEntry.isCancelled) {
        // Entry was just marked as cancelled - revert fuel only for regular entries
        if (!oldSkipsFuel) {
          logger.info(`Entry cancelled: ${key}, reverting ${oldEntry.liters}L`);
          if (fuelFlags.lpoCancelRevert) {
            await updateFuelRecordForLPOEntry(
              oldEntry.doNo,
              -oldEntry.liters,
              existingLpo.station,
              oldEntry.truckNo,
              oldEntry.cancellationPoint,
              oldEntry.isCustomStation ? {
                isCustomStation: oldEntry.isCustomStation,
                customGoingCheckpoint: oldEntry.customGoingCheckpoint,
                customReturnCheckpoint: oldEntry.customReturnCheckpoint,
              } : undefined,
              undefined,
              { session, touchedIds: touchedFuelIds }
            );
          } else if (manualFieldFor(newEntry)) {
            // Automation off, but operator chose the checkpoint manually.
            await updateFuelRecordForLPOEntry(
              oldEntry.doNo, -oldEntry.liters, existingLpo.station, oldEntry.truckNo,
              undefined, undefined, undefined, { session, touchedIds: touchedFuelIds, explicitField: manualFieldFor(newEntry) }
            );
            logger.info(`[fuelAutomation] lpoCancelRevert OFF — manual checkpoint ${manualFieldFor(newEntry)} reverted for ${oldEntry.truckNo}`);
          } else {
            skippedAutomation.add('lpoCancelRevert');
            logger.info(`[fuelAutomation] lpoCancelRevert OFF — skipping cancellation revert for ${oldEntry.truckNo}`);
          }
        } else {
          logger.info(`Entry cancelled (DA/REF/NIL): ${key}, marking cancelled without fuel revert`);
        }

        // Mark cancellation time
        newEntry.cancelledAt = new Date();
        newlyCancelledEntries.push(newEntry);
      } else if (newEntry.isDriverAccount && !oldEntry.isDriverAccount) {
        // Entry was converted to driver account - revert fuel only (flag-only DA, no side collection)
        // Skip revert if the old row was already a non-fuel entry (REF/NIL)
        if (!oldSkipsFuel) {
          logger.info(`Entry converted to driver account: ${key}, reverting ${oldEntry.liters}L`);
          if (fuelFlags.lpoEditAdjust) {
            await updateFuelRecordForLPOEntry(
              oldEntry.doNo,
              -oldEntry.liters,
              existingLpo.station,
              oldEntry.truckNo,
              oldEntry.cancellationPoint,
              oldEntry.isCustomStation ? {
                isCustomStation: oldEntry.isCustomStation,
                customGoingCheckpoint: oldEntry.customGoingCheckpoint,
                customReturnCheckpoint: oldEntry.customReturnCheckpoint,
              } : undefined,
              undefined,
              { session, touchedIds: touchedFuelIds }
            );
          } else {
            skippedAutomation.add('lpoEditAdjust');
            logger.info(`[fuelAutomation] lpoEditAdjust OFF — skipping driver-account conversion revert for ${oldEntry.truckNo}`);
          }
        }
      } else if (newEntry.liters !== oldEntry.liters) {
        // Entry liters changed - adjust the difference (never for DA/REF/NIL)
        if (oldSkipsFuel || entrySkipsFuelRecord(newEntry)) {
          logger.info(`Entry ${key} liters changed but DA/REF/NIL — skipping fuel adjust`);
          // Still track amendment metadata on the LPO row
          const originalLiters = oldEntry.originalLiters ?? oldEntry.liters;
          newEntry.originalLiters = originalLiters;
          newEntry.amendedAt = new Date();
          entriesToUpdate.push(newEntry);
          continue;
        }
        const difference = newEntry.liters - oldEntry.liters;
        logger.info(`Entry ${key} liters changed: ${oldEntry.liters} -> ${newEntry.liters} (diff: ${difference})`);
        
        // Track amendment - store original liters if this is the first change
        const originalLiters = oldEntry.originalLiters ?? oldEntry.liters;
        newEntry.originalLiters = originalLiters;
        newEntry.amendedAt = new Date();

        if (fuelFlags.lpoEditAdjust) {
          await updateFuelRecordForLPOEntry(
            oldEntry.doNo,
            difference,
            newData.station || existingLpo.station,
            oldEntry.truckNo,
            newEntry.cancellationPoint || oldEntry.cancellationPoint,
            (newEntry.isCustomStation || oldEntry.isCustomStation) ? {
              isCustomStation: newEntry.isCustomStation || oldEntry.isCustomStation,
              customGoingCheckpoint: newEntry.customGoingCheckpoint || oldEntry.customGoingCheckpoint,
              customReturnCheckpoint: newEntry.customReturnCheckpoint || oldEntry.customReturnCheckpoint,
            } : undefined,
            undefined,
            { session, touchedIds: touchedFuelIds }
          );
        } else if (manualFieldFor(newEntry)) {
          // Automation off, but operator chose the checkpoint manually.
          await updateFuelRecordForLPOEntry(
            oldEntry.doNo, difference, newData.station || existingLpo.station, oldEntry.truckNo,
            undefined, undefined, undefined, { session, touchedIds: touchedFuelIds, explicitField: manualFieldFor(newEntry) }
          );
          logger.info(`[fuelAutomation] lpoEditAdjust OFF — manual checkpoint ${manualFieldFor(newEntry)} adjusted (${difference}L) for ${oldEntry.truckNo}`);
        } else {
          skippedAutomation.add('lpoEditAdjust');
          logger.info(`[fuelAutomation] lpoEditAdjust OFF — skipping liters adjustment (${difference}L) for ${oldEntry.truckNo}`);
        }

        entriesToUpdate.push(newEntry);
      } else {
        logger.info(`Entry ${key} unchanged: ${oldEntry.liters}L`);
        // Preserve amendment history if it exists
        if (oldEntry.originalLiters !== undefined && oldEntry.originalLiters !== null) {
          newEntry.originalLiters = oldEntry.originalLiters;
          newEntry.amendedAt = oldEntry.amendedAt;
        }
      }
    }

    // Add new entries that didn't exist before
    for (const [key, newEntry] of newEntriesMap) {
      if (!oldEntriesMap.has(key)) {
        // Skip fuel record update for cancelled entries
        if (newEntry.isCancelled) {
          logger.info(`New cancelled entry: ${key}, skipping fuel record update`);
          continue;
        }
        
        // Driver account / REF / NIL: flag-only — skip fuel, no side-collection write
        if (entrySkipsFuelRecord(newEntry)) {
          logger.info(`New non-fuel entry (DA/REF/NIL): ${key}, skipping fuel record update`);
          continue;
        }
        
        // Regular new entry - update fuel record
        // For CASH station entries, pass the cancellation point to determine the correct fuel field
        // For CUSTOM station entries, pass the custom checkpoint info
        logger.info(`New entry: ${key}, adding ${newEntry.liters}L`);
        if (fuelFlags.lpoEditAdjust) {
          await updateFuelRecordForLPOEntry(
            newEntry.doNo,
            newEntry.liters,
            newData.station || existingLpo.station,
            newEntry.truckNo,
            newEntry.cancellationPoint,
            newEntry.isCustomStation ? {
              isCustomStation: newEntry.isCustomStation,
              customGoingCheckpoint: newEntry.customGoingCheckpoint,
              customReturnCheckpoint: newEntry.customReturnCheckpoint,
            } : undefined,
            undefined,
            { session, touchedIds: touchedFuelIds }
          );
        } else if (manualFieldFor(newEntry)) {
          await updateFuelRecordForLPOEntry(
            newEntry.doNo, newEntry.liters, newData.station || existingLpo.station, newEntry.truckNo,
            undefined, undefined, undefined, { session, touchedIds: touchedFuelIds, explicitField: manualFieldFor(newEntry) }
          );
          logger.info(`[fuelAutomation] lpoEditAdjust OFF — manual checkpoint ${manualFieldFor(newEntry)} deducted for newly-added entry ${newEntry.truckNo}`);
        } else {
          skippedAutomation.add('lpoEditAdjust');
          logger.info(`[fuelAutomation] lpoEditAdjust OFF — skipping deduction for newly-added entry ${newEntry.truckNo}`);
        }
      }
    }

    // Update the newData.entries with amendment tracking
    newData.entries = newEntries.map((entry: EntryType) => {
      const key = `${entry.doNo}-${entry.truckNo}`;
      const oldEntry = oldEntriesMap.get(key);
      if (oldEntry && entry.liters !== oldEntry.liters) {
        return {
          ...entry,
          originalLiters: oldEntry.originalLiters ?? oldEntry.liters,
          amendedAt: new Date()
        };
      } else if (oldEntry?.originalLiters !== undefined && oldEntry.originalLiters !== null) {
        // Preserve existing amendment history
        return {
          ...entry,
          originalLiters: oldEntry.originalLiters,
          amendedAt: oldEntry.amendedAt
        };
      }
      return entry;
    });

    // Update year if date changed
    if (newData.date) {
      const dateObj = new Date(newData.date);
      newData.year = dateObj.getFullYear();
      await getOrCreateWorkbook(newData.year);
    }

    lpoSummary = await LPOSummary.findOneAndUpdate(
      { _id: id, isDeleted: false },
      newData,
      { new: true, runValidators: true, session }
    );

    if (!lpoSummary) {
      throw new ApiError(404, 'LPO document not found');
    }

    await session.commitTransaction();
  } catch (txError: any) {
    await session.abortTransaction();
    throw txError;
  } finally {
    await session.endSession();
  }

  // Post-commit side effects — session is closed, data is durable.

  // Emit each touched fuel record and run journey promotion.
  if (touchedFuelIds.size > 0) {
    const records = await FuelRecord.find({ _id: { $in: Array.from(touchedFuelIds) } });
    for (const rec of records) {
      emitDataChange('fuel_records', 'update', rec.toObject());
      await checkAndPromoteStartedJourney(rec, username);
    }
  }

  logger.info(`LPO document updated: ${lpoSummary?.lpoNo} by ${username}`);

  await AuditService.log({
    userId: req.user?.userId,
    username,
    action: 'UPDATE',
    resourceType: 'LPOSummary',
    resourceId: lpoSummary?.lpoNo || id,
    details: `LPO document ${lpoSummary?.lpoNo} updated by ${username}`,
    ipAddress: req.ip,
    severity: 'medium',
  });

  if (skippedAutomation.size > 0) {
    await AuditService.log({
      userId: req.user?.userId,
      username,
      action: 'UPDATE',
      resourceType: 'FuelRecord',
      resourceId: lpoSummary?.lpoNo || id,
      details: `Fuel-record sync SKIPPED on LPO ${lpoSummary?.lpoNo} — disabled automation: [${[...skippedAutomation].join(', ')}]. Manual fuel-record adjustment required.`,
      ipAddress: req.ip,
      severity: 'high',
    }).catch((err: any) => logger.warn(`Failed to write audit breadcrumb for skipped LPO sync (LPO ${lpoSummary?.lpoNo}): ${err?.message}`));
  }

  const responseData = lpoSummary.toObject();
  res.status(200).json({
    success: true,
    message: 'LPO document updated successfully',
    data: { ...responseData, id: responseData._id },
  });

  // Send the full LPO payload so connected clients patch the row in place
  // instead of refetching the whole list (keeps other users' work undisturbed).
  emitDataChange('lpo_summaries', 'update', lpoSummary.toObject(), lpoSummary.station);
  emitDataChange('driver_accounts', 'update');

  for (const amended of entriesToUpdate) {
    if (amended.isCancelled || amended.isDriverAccount) continue;
    createLPOAmendedNotification(lpoSummary, amended, username).catch(() => {});
  }

  for (const cancelled of newlyCancelledEntries) {
    createLPOCancelledNotification(lpoSummary, cancelled, username).catch(() => {});
  }
};

/**
 * Export workbook as Excel file
 * Each LPO sheet matches the PDF/image export format exactly
 * Sheet names are just the LPO number (e.g., "2444" instead of "LPO 2444")
 * Summary sheet is placed at the end
 */
export const exportWorkbook = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const year = parseInt(req.params.year, 10);

    if (isNaN(year)) {
      throw new ApiError(400, 'Invalid year');
    }

    // Get all LPO documents for this year (INCLUDING ARCHIVED DATA)
    // Use Date.UTC so .toISOString() always returns the correct year string
    // regardless of the server's local timezone.
    const startDate = new Date(Date.UTC(year, 0, 1)); // Jan 1 UTC
    const endDate = new Date(Date.UTC(year, 11, 31, 23, 59, 59)); // Dec 31 UTC
    
    const allLPOSummaries = await unifiedExportService.getAllLPOSummaries({
      startDate,
      endDate,
      includeArchived: true,
    });

    // Filter for this year and not deleted
    const lpoDocuments = allLPOSummaries
      .filter((doc: any) => doc.year === year && !doc.isDeleted)
      .sort((a: any, b: any) => a.lpoNo - b.lpoNo);

    if (lpoDocuments.length === 0) {
      throw new ApiError(404, 'No LPO documents found for this year');
    }

    logger.info(`Exporting ${lpoDocuments.length} LPO documents for year ${year} (including archived)`)

    // Fetch all DriverAccountEntry records for the year to get approvedBy values
    const driverAccountEntries = await DriverAccountEntry.find({ year })
      .select('lpoNo truckNo approvedBy')
      .lean();

    // Create a map for quick lookup: key = "lpoNo-truckNo", value = approvedBy
    const driverAccountApprovedByMap = new Map<string, string>();
    for (const entry of driverAccountEntries) {
      if (entry.approvedBy) {
        const key = `${entry.lpoNo}-${entry.truckNo}`;
        driverAccountApprovedByMap.set(key, entry.approvedBy);
      }
    }

    // Create Excel workbook
    const excelWorkbook = new ExcelJS.Workbook();
    excelWorkbook.creator = 'Fuel Order System';
    excelWorkbook.created = new Date();

    // Define border styles
    const thinBorder: Partial<ExcelJS.Borders> = {
      top: { style: 'thin', color: { argb: 'FF000000' } },
      left: { style: 'thin', color: { argb: 'FF000000' } },
      bottom: { style: 'thin', color: { argb: 'FF000000' } },
      right: { style: 'thin', color: { argb: 'FF000000' } },
    };

    const thickBorder: Partial<ExcelJS.Borders> = {
      top: { style: 'medium', color: { argb: 'FF000000' } },
      left: { style: 'medium', color: { argb: 'FF000000' } },
      bottom: { style: 'medium', color: { argb: 'FF000000' } },
      right: { style: 'medium', color: { argb: 'FF000000' } },
    };

    // Alignment styles
    const centerAlignment: Partial<ExcelJS.Alignment> = {
      horizontal: 'center',
      vertical: 'middle',
    };

    const leftAlignment: Partial<ExcelJS.Alignment> = {
      horizontal: 'left',
      vertical: 'middle',
    };

    const rightAlignment: Partial<ExcelJS.Alignment> = {
      horizontal: 'right',
      vertical: 'middle',
    };

    // Create individual sheets for each LPO FIRST (before summary)
    for (const lpo of lpoDocuments) {
      // Sheet name is just the LPO number (e.g., "2444")
      const sheetName = lpo.lpoNo.substring(0, 31);
      const sheet = excelWorkbook.addWorksheet(sheetName);

      // Set column widths to match PDF layout
      sheet.getColumn(1).width = 18; // DO No.
      sheet.getColumn(2).width = 16; // Truck No.
      sheet.getColumn(3).width = 12; // Liters
      sheet.getColumn(4).width = 12; // Rate
      sheet.getColumn(5).width = 16; // Amount
      sheet.getColumn(6).width = 22; // Dest.

      // Row 1: Title - LOCAL PURCHASE ORDER
      sheet.mergeCells('A1:D1');
      const titleCell = sheet.getCell('A1');
      titleCell.value = 'LOCAL PURCHASE ORDER';
      titleCell.font = { bold: true, size: 18, color: { argb: 'FF000000' } };
      titleCell.alignment = leftAlignment;

      // Row 1 Right: LPO No.
      sheet.mergeCells('E1:F1');
      const lpoNoCell = sheet.getCell('E1');
      lpoNoCell.value = `LPO No. ${lpo.lpoNo}`;
      lpoNoCell.font = { bold: true, size: 14, color: { argb: 'FF000000' } };
      lpoNoCell.alignment = rightAlignment;

      // Row 2: Subtitle - FUEL SUPPLY
      sheet.mergeCells('A2:D2');
      const subtitleCell = sheet.getCell('A2');
      subtitleCell.value = 'FUEL SUPPLY';
      subtitleCell.font = { size: 11, color: { argb: 'FF444444' } };
      subtitleCell.alignment = leftAlignment;

      // Row 2 Right: Date
      sheet.mergeCells('E2:F2');
      const dateCell = sheet.getCell('E2');
      const formattedDate = new Date(lpo.date).toLocaleDateString('en-GB', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
      });
      dateCell.value = `Date: ${formattedDate}`;
      dateCell.font = { size: 11, color: { argb: 'FF555555' } };
      dateCell.alignment = rightAlignment;

      // Row 3: Border separator
      sheet.getRow(3).height = 8;
      sheet.mergeCells('A3:F3');
      sheet.getCell('A3').border = { bottom: { style: 'thick', color: { argb: 'FF000000' } } };

      // Row 4: Station and Order Of
      sheet.mergeCells('A4:C4');
      const stationCell = sheet.getCell('A4');
      stationCell.value = `Station: ${lpo.station}`;
      stationCell.font = { size: 11, color: { argb: 'FF333333' } };
      stationCell.alignment = leftAlignment;

      sheet.mergeCells('D4:F4');
      const orderOfCell = sheet.getCell('D4');
      orderOfCell.value = `Order of: ${lpo.orderOf}`;
      orderOfCell.font = { size: 11, color: { argb: 'FF333333' } };
      orderOfCell.alignment = leftAlignment;

      // Row 5: Empty row for spacing
      sheet.getRow(5).height = 8;

      // Row 6: Instructions
      sheet.mergeCells('A6:F6');
      const instructionsCell = sheet.getCell('A6');
      instructionsCell.value = 'KINDLY SUPPLY THE FOLLOWING LITERS';
      instructionsCell.font = { bold: true, size: 11, color: { argb: 'FF000000' } };
      instructionsCell.alignment = leftAlignment;
      instructionsCell.border = {
        top: { style: 'thin', color: { argb: 'FFDDDDDD' } },
        bottom: { style: 'thin', color: { argb: 'FFDDDDDD' } },
      };

      // Row 7: Empty row for spacing
      sheet.getRow(7).height = 8;

      // Row 8: Table Headers
      const headerRow = sheet.getRow(8);
      headerRow.values = ['DO No.', 'Truck No.', 'Liters', 'Rate', 'Amount', 'Dest.'];
      headerRow.font = { bold: true, size: 11, color: { argb: 'FF000000' } };
      headerRow.height = 24;
      // Apply styling only to table columns (1-6)
      for (let colNum = 1; colNum <= 6; colNum++) {
        const cell = headerRow.getCell(colNum);
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFF5F5F5' },
        };
        cell.border = thickBorder;
        if (colNum === 3 || colNum === 4 || colNum === 5) {
          cell.alignment = rightAlignment;
        } else {
          cell.alignment = leftAlignment;
        }
      }

      // Add entry data starting at row 9
      let rowNum = 9;
      let totalLiters = 0;
      let totalAmount = 0;

      for (const entry of lpo.entries) {
        const row = sheet.getRow(rowNum);
        const isCancelled = entry.isCancelled;
        const isDriverAccount = entry.isDriverAccount;
        
        // Determine display values
        const displayDoNo = isCancelled ? 'CANCELLED' : isDriverAccount ? 'NIL' : entry.doNo;
        const displayDest = isDriverAccount ? 'NIL' : entry.dest;
        
        row.values = [
          displayDoNo,
          entry.truckNo,
          entry.liters.toLocaleString(),
          entry.rate.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 }),
          entry.amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
          displayDest,
        ];
        
        row.height = 22;
        
        // Apply styling only to table columns (1-6)
        for (let colNum = 1; colNum <= 6; colNum++) {
          const cell = row.getCell(colNum);
          cell.border = thinBorder;
          
          if (colNum === 3 || colNum === 4 || colNum === 5) {
            cell.alignment = rightAlignment;
          } else {
            cell.alignment = leftAlignment;
          }
          
          // Color for cancelled entries
          if (isCancelled) {
            cell.font = { color: { argb: 'FFCC0000' }, strike: true };
            cell.fill = {
              type: 'pattern',
              pattern: 'solid',
              fgColor: { argb: 'FFFFE6E6' },
            };
          } else if (isDriverAccount) {
            // Color for driver account entries
            if (colNum === 1 || colNum === 6) {
              cell.font = { color: { argb: 'FFCC6600' } };
            }
            cell.fill = {
              type: 'pattern',
              pattern: 'solid',
              fgColor: { argb: 'FFFFF3E6' },
            };
          } else {
            // Alternating row colors
            if ((rowNum - 9) % 2 === 1) {
              cell.fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: 'FFFAFAFA' },
              };
            }
          }
        }

        // Sum up totals (excluding cancelled entries)
        if (!isCancelled) {
          totalLiters += entry.liters;
          totalAmount += entry.amount;
        }

        rowNum++;
      }

      // Total Row
      const totalRow = sheet.getRow(rowNum);
      totalRow.values = [
        'TOTAL',
        '',
        totalLiters.toLocaleString(),
        '',
        totalAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
        '',
      ];
      totalRow.font = { bold: true, size: 11, color: { argb: 'FF000000' } };
      totalRow.height = 26;
      // Apply styling only to table columns (1-6)
      for (let colNum = 1; colNum <= 6; colNum++) {
        const cell = totalRow.getCell(colNum);
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFE8E8E8' },
        };
        cell.border = thickBorder;
        if (colNum === 3 || colNum === 5) {
          cell.alignment = rightAlignment;
        } else if (colNum === 1) {
          cell.alignment = leftAlignment;
        } else {
          cell.alignment = centerAlignment;
        }
      }

      // Merge TOTAL label cells
      sheet.mergeCells(`A${rowNum}:B${rowNum}`);

      rowNum += 2; // Skip a row

      // Signatures Section - Row after totals + 2
      const sigRowNum = rowNum;
      
      // Add signature lines with actual names
      const preparedByCell = sheet.getCell(`A${sigRowNum}`);
      preparedByCell.value = 'Prepared By';
      preparedByCell.font = { bold: true, size: 10 };
      preparedByCell.border = { top: { style: 'medium', color: { argb: 'FF000000' } } };

      const approvedByCell = sheet.getCell(`C${sigRowNum}`);
      approvedByCell.value = 'Approved By';
      approvedByCell.font = { bold: true, size: 10 };
      approvedByCell.border = { top: { style: 'medium', color: { argb: 'FF000000' } } };

      const receivedByCell = sheet.getCell(`E${sigRowNum}`);
      receivedByCell.value = 'Received By';
      receivedByCell.font = { bold: true, size: 10 };
      receivedByCell.border = { top: { style: 'medium', color: { argb: 'FF000000' } } };

      // Names row - show actual names if available
      const preparedByName = sheet.getCell(`A${sigRowNum + 1}`);
      preparedByName.value = lpo.createdBy || '';
      preparedByName.font = { size: 10, color: { argb: 'FF000000' } };

      // Look up approvedBy from DriverAccountEntry for any driver account entries in this LPO
      let approvedByValue = '';
      for (const entry of lpo.entries) {
        if (entry.isDriverAccount) {
          const key = `${lpo.lpoNo}-${entry.truckNo}`;
          const foundApprovedBy = driverAccountApprovedByMap.get(key);
          if (foundApprovedBy) {
            approvedByValue = foundApprovedBy;
            break; // Use the first found approvedBy
          }
        }
      }
      
      const approvedByName = sheet.getCell(`C${sigRowNum + 1}`);
      approvedByName.value = approvedByValue;
      approvedByName.font = { size: 10, color: { argb: 'FF000000' } };

      // Signature labels
      const sigLabelRowNum = sigRowNum + 2;
      sheet.getCell(`A${sigLabelRowNum}`).value = 'Signature';
      sheet.getCell(`A${sigLabelRowNum}`).font = { size: 9, color: { argb: 'FF666666' } };
      sheet.getCell(`C${sigLabelRowNum}`).value = 'Name & Signature';
      sheet.getCell(`C${sigLabelRowNum}`).font = { size: 9, color: { argb: 'FF666666' } };
      sheet.getCell(`E${sigLabelRowNum}`).value = 'Station Attendant';
      sheet.getCell(`E${sigLabelRowNum}`).font = { size: 9, color: { argb: 'FF666666' } };

      // Footer
      const footerRowNum = sigRowNum + 5;
      sheet.mergeCells(`A${footerRowNum}:F${footerRowNum}`);
      const footerCell = sheet.getCell(`A${footerRowNum}`);
      footerCell.value = 'This is a computer-generated document. No signature is required.';
      footerCell.font = { size: 9, color: { argb: 'FF666666' } };
      footerCell.border = { top: { style: 'thin', color: { argb: 'FFCCCCCC' } } };
      
      sheet.mergeCells(`A${footerRowNum + 1}:F${footerRowNum + 1}`);
      const footerCell2 = sheet.getCell(`A${footerRowNum + 1}`);
      footerCell2.value = 'For any queries, please contact the logistics department.';
      footerCell2.font = { size: 9, color: { argb: 'FF666666' } };
    }

    // Create summary sheet LAST
    const summarySheet = excelWorkbook.addWorksheet('Summary');
    summarySheet.columns = [
      { header: 'LPO No', key: 'lpoNo', width: 12 },
      { header: 'Date', key: 'date', width: 14 },
      { header: 'Station', key: 'station', width: 20 },
      { header: 'Order Of', key: 'orderOf', width: 15 },
      { header: 'Total Amount', key: 'total', width: 18 },
      { header: 'Entries', key: 'entries', width: 10 },
    ];

    // Style summary header row
    const summaryHeaderRow = summarySheet.getRow(1);
    summaryHeaderRow.font = { bold: true, size: 11 };
    summaryHeaderRow.height = 24;
    summaryHeaderRow.alignment = centerAlignment;
    // Apply styling only to table columns (1-6)
    for (let colNum = 1; colNum <= 6; colNum++) {
      const cell = summaryHeaderRow.getCell(colNum);
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFE0E0E0' },
      };
      cell.border = thickBorder;
    }

    // Add summary data
    lpoDocuments.forEach((lpo, index) => {
      const row = summarySheet.addRow({
        lpoNo: lpo.lpoNo,
        date: new Date(lpo.date).toLocaleDateString('en-GB', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric'
        }),
        station: lpo.station,
        orderOf: lpo.orderOf,
        total: lpo.total.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
        entries: lpo.entries.filter((e: any) => !e.isCancelled).length,
      });
      row.alignment = centerAlignment;
      row.height = 20;
      // Apply borders and alternating colors only to table columns (1-6)
      for (let colNum = 1; colNum <= 6; colNum++) {
        const cell = row.getCell(colNum);
        cell.border = thinBorder;
        // Alternating row colors
        if (index % 2 === 0) {
          cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFFAFAFA' },
          };
        }
      }
    });

    // Set response headers
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename=LPOS_${year}.xlsx`
    );

    await excelWorkbook.xlsx.write(res);
    res.end();

    logger.info(`Workbook exported for year ${year} by ${req.user?.username}`);
  } catch (error: any) {
    throw error;
  }
};

/**
 * Get available years (for workbook selection)
 */
export const getAvailableYears = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    // Get years from active data
    const activeYears = await LPOSummary.distinct('year', { isDeleted: false });
    
    // Get years from archived data
    const archivedYears = await ArchivedLPOSummary.distinct('year');
    
    // Combine and deduplicate
    const allYears = [...new Set([...activeYears, ...archivedYears])];
    allYears.sort((a, b) => b - a);

    res.status(200).json({
      success: true,
      message: 'Available years retrieved successfully (including archived)',
      data: allYears,
    });
  } catch (error: any) {
    throw error;
  }
};

/**
 * Check if a truck already has an active fuel allocation at a specific station
 * Used to prevent duplicate allocations (except for CASH which is always allowed)
 * Returns existing LPOs where the truck has an active (non-cancelled) entry at the station
 * Note: If the new liters amount differs from existing, it's allowed (top-up/adjustment scenario)
 */
export const checkDuplicateAllocation = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { truckNo, station, excludeLpoId, liters, doNo, journeyDirection } = req.query;

    if (!truckNo || !station) {
      throw new ApiError(400, 'Truck number and station are required');
    }

    const stationUpper = (station as string).toUpperCase().trim();
    const newLiters = liters ? Number(liters) : null;
    const checkDoNo = (doNo as string)?.toUpperCase().trim();
    const direction: 'going' | 'returning' =
      journeyDirection === 'returning' ? 'returning' : 'going';

    // CASH uses find-at-checkpoint for prior-order discovery — skip duplicate check here
    if (stationUpper === 'CASH') {
      res.status(200).json({
        success: true,
        message: 'CASH station - duplicate check not required',
        data: {
          hasDuplicate: false,
          existingLpos: [],
          allowOverride: true,
          isDifferentAmount: false
        },
      });
      return;
    }

    const stationMapping = await getStationToFuelFieldMapping();
    const fuelRecordField = resolveFuelRecordFieldFromStationDirection(
      stationMapping,
      station as string,
      direction
    );

    if (!fuelRecordField) {
      res.status(200).json({
        success: true,
        message: 'Station has no checkpoint configured — prior-order check skipped',
        data: {
          hasDuplicate: false,
          existingLpos: [],
          allowOverride: true,
          isDifferentAmount: false,
          isNilDo: !checkDoNo || checkDoNo === 'NIL',
        },
      });
      return;
    }

    const matchingLpos = await findPriorOrdersAtCheckpoint({
      truckNo: truckNo as string,
      fuelRecordField,
      doNo: doNo as string | undefined,
      excludeLpoId: excludeLpoId as string | undefined,
    });

    const hasDuplicate = matchingLpos.length > 0;
    
    // Check if the new liters amount is different from all existing allocations
    // If different, it's likely a top-up or adjustment - allow it
    let isDifferentAmount = false;
    let existingLiters: number[] = [];
    
    if (hasDuplicate && newLiters !== null) {
      existingLiters = matchingLpos.flatMap(lpo => 
        lpo.entries.map((e: any) => e.liters)
      );
      // If the new amount is different from ALL existing allocations, allow it
      isDifferentAmount = existingLiters.every(existing => existing !== newLiters);
    }

    res.status(200).json({
      success: true,
      message: hasDuplicate 
        ? isDifferentAmount
          ? `Truck ${truckNo} has existing allocation (${existingLiters.join(', ')}L) - different amount allowed`
          : `Truck ${truckNo} already has same allocation (${existingLiters.join(', ')}L) at checkpoint ${fuelRecordField}`
        : 'No duplicate allocation found',
      data: {
        hasDuplicate,
        existingLpos: matchingLpos,
        existingLiters,
        isDifferentAmount,
        allowOverride: isDifferentAmount, // Allow if amount is different (top-up scenario)
        isNilDo: !checkDoNo || checkDoNo === 'NIL', // True when match was based on truck+station only (no DO)
      },
    });
  } catch (error: any) {
    throw error;
  }
};

/**
 * Find LPOs at a fuel-record checkpoint for a truck (same column, any station).
 * Used for CASH auto-cancellation/amend and checkpoint-based prior-order discovery.
 */
export const findLPOsAtCheckpoint = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { truckNo, cancellationPoint, doNo, journeyDirection } = req.query;

    if (!truckNo) {
      throw new ApiError(400, 'Truck number is required');
    }

    let fuelRecordField: string | null = null;
    if (cancellationPoint) {
      fuelRecordField = resolveFuelRecordFieldFromCancellationPoint(cancellationPoint as string);
    } else if (req.query.station) {
      const stationMapping = await getStationToFuelFieldMapping();
      const direction: 'going' | 'returning' =
        journeyDirection === 'returning' ? 'returning' : 'going';
      fuelRecordField = resolveFuelRecordFieldFromStationDirection(
        stationMapping,
        req.query.station as string,
        direction
      );
    }

    if (!fuelRecordField) {
      throw new ApiError(400, 'cancellationPoint or station+journeyDirection is required to resolve checkpoint');
    }

    const matches = await findPriorOrdersAtCheckpoint({
      truckNo: truckNo as string,
      fuelRecordField,
      doNo: doNo as string | undefined,
      excludeCashLpos: true,
    });

    const matchingLpos = matches.map((m) => ({
      ...m,
      id: m.id?.toString?.() ?? m.id,
    }));

    res.status(200).json({
      success: true,
      message: `Found ${matchingLpos.length} LPOs with truck ${truckNo} at checkpoint ${fuelRecordField}${doNo ? ` for DO ${doNo}` : ''}`,
      data: matchingLpos,
    });
  } catch (error: any) {
    throw error;
  }
};

/**
 * Acquire the DB-level edit lock for an LPO, run `fn`, then release it.
 * Throws 423 if another user holds the lock (same semantics as enforceEditLock).
 */
async function withLpoLock<T>(lpoId: string, username: string, displayName: string, fn: () => Promise<T>): Promise<T> {
  await acquireLockRecord('lpo_summaries', lpoId, username, displayName);
  try {
    return await fn();
  } finally {
    await releaseLockRecord('lpo_summaries', lpoId, username).catch(() => {});
  }
}

/**
 * Cancel a specific truck entry in an LPO by marking it as cancelled
 * This also reverts the fuel record deduction
 */
export const cancelTruckInLPO = async (req: AuthRequest, res: Response): Promise<void> => {
  const { lpoId, truckNo, cancellationPoint, reason } = req.body;
  const username = req.user?.username || 'system';
  const displayName = await getDisplayName(username);
  await withLpoLock(lpoId, username, displayName, async () => {

    if (!lpoId || !truckNo || !cancellationPoint) {
      throw new ApiError(400, 'LPO ID, truck number, and cancellation point are required');
    }

    // Find the LPO
    const lpo = await LPOSummary.findOne({ _id: lpoId, isDeleted: false });
    if (!lpo) {
      throw new ApiError(404, 'LPO not found');
    }

    // Find the entry for this truck (case-insensitive matching)
    const truckNoNormalized = (truckNo as string).replace(/\s+/g, '').toUpperCase();
    const entryIndex = lpo.entries.findIndex((e: any) => {
      const entryTruckNormalized = (e.truckNo || '').replace(/\s+/g, '').toUpperCase();
      return entryTruckNormalized === truckNoNormalized && !e.isCancelled;
    });

    if (entryIndex === -1) {
      throw new ApiError(404, 'Active entry for this truck not found in the LPO');
    }

    const entry = lpo.entries[entryIndex];
    const isDriverAccount = entry.isDriverAccount === true;
    const doNoUpper = (entry.doNo || '').toString().trim().toUpperCase();
    const isNilDO = doNoUpper === 'NIL' || doNoUpper === '' || doNoUpper === 'N/A';

    // Revert the fuel record deduction (will be skipped for NIL DO/Driver Account entries)
    await updateFuelRecordForLPOEntry(
      entry.doNo,
      -entry.liters,
      lpo.station,
      entry.truckNo,
      entry.cancellationPoint,
      entry.isCustomStation ? {
        isCustomStation: entry.isCustomStation,
        customGoingCheckpoint: entry.customGoingCheckpoint,
        customReturnCheckpoint: entry.customReturnCheckpoint,
      } : undefined
    );

    // Mark the entry as cancelled
    lpo.entries[entryIndex].isCancelled = true;
    lpo.entries[entryIndex].cancellationPoint = cancellationPoint;
    
    // Set appropriate cancellation reason based on entry type
    if (isDriverAccount) {
      lpo.entries[entryIndex].cancellationReason = reason || 'Driver Account entry cancelled - no fuel record affected';
    } else if (isNilDO) {
      lpo.entries[entryIndex].cancellationReason = reason || 'Entry cancelled - no fuel record found';
    } else {
      lpo.entries[entryIndex].cancellationReason = reason || 'Entry cancelled - fuel allocation reverted';
    }
    
    lpo.entries[entryIndex].cancelledAt = new Date();

    // Recalculate total (excluding cancelled entries)
    lpo.total = lpo.entries
      .filter((e: any) => !e.isCancelled)
      .reduce((sum: number, e: any) => sum + e.amount, 0);

    await lpo.save();

    // Log with entry type context
    const entryTypeLog = isDriverAccount ? '(Driver Account)' : isNilDO ? '(NIL DO)' : '';
    logger.info(`Truck ${truckNo} cancelled ${entryTypeLog} in LPO ${lpo.lpoNo} at ${cancellationPoint} by ${req.user?.username}`);

    await AuditService.log({
      userId: req.user?.userId,
      username: req.user?.username || 'system',
      action: 'UPDATE',
      resourceType: 'LPOSummary',
      resourceId: lpo.lpoNo,
      details: `Truck "${truckNo}" cancelled in LPO ${lpo.lpoNo} at ${cancellationPoint}${reason ? ` — reason: ${reason}` : ''} by ${req.user?.username}`,
      ipAddress: req.ip,
      severity: 'medium',
    });

    // Generate appropriate response message
    let message = `Successfully cancelled truck ${truckNo} in LPO ${lpo.lpoNo}`;
    if (isDriverAccount) {
      message += ' (Driver Account - no fuel record affected)';
    } else if (isNilDO) {
      message += ' (NIL DO - no fuel record affected)';
    }

    res.status(200).json({
      success: true,
      message,
      data: lpo,
      entryType: isDriverAccount ? 'driver-account' : isNilDO ? 'nil-do' : 'regular',
    });
    emitDataChange('lpo_summaries', 'update');
    emitDataChange('fuel_records', 'update');

    // Notify station manager / super_manager / driver of the cancellation (best-effort).
    createLPOCancelledNotification(lpo, lpo.entries[entryIndex], username).catch(() => {});
  });
};

/**
 * Amend (partially reduce) a truck entry in an LPO.
 * Used when a truck gets cash fuel near a station and will still collect its
 * reduced station allocation. Updates liters/amount, adjusts the fuel record by
 * the delta only, and cascades to the LPO total.
 */
export const amendTruckInLPO = async (req: AuthRequest, res: Response): Promise<void> => {
  const { lpoId, truckNo, newLiters, cancellationPoint, reason } = req.body;
  const username = req.user?.username || 'system';
  const displayName = await getDisplayName(username);
  await withLpoLock(lpoId, username, displayName, async () => {

    if (!lpoId || !truckNo || newLiters === undefined || newLiters === null) {
      throw new ApiError(400, 'LPO ID, truck number, and newLiters are required');
    }

    const parsedLiters = Number(newLiters);
    if (isNaN(parsedLiters) || parsedLiters < 0) {
      throw new ApiError(400, 'newLiters must be a non-negative number');
    }

    const lpo = await LPOSummary.findOne({ _id: lpoId, isDeleted: false });
    if (!lpo) {
      throw new ApiError(404, 'LPO not found');
    }

    const truckNoNormalized = (truckNo as string).replace(/\s+/g, '').toUpperCase();
    const entryIndex = lpo.entries.findIndex((e: any) => {
      const entryTruckNormalized = (e.truckNo || '').replace(/\s+/g, '').toUpperCase();
      return entryTruckNormalized === truckNoNormalized && !e.isCancelled;
    });

    if (entryIndex === -1) {
      throw new ApiError(404, 'Active entry for this truck not found in the LPO');
    }

    const entry = lpo.entries[entryIndex];
    const oldLiters = entry.liters;

    if (parsedLiters >= oldLiters) {
      throw new ApiError(400, `newLiters (${parsedLiters}) must be less than the current allocation (${oldLiters})`);
    }

    const delta = oldLiters - parsedLiters; // positive → restoring this many liters back to fuel record

    // Revert the delta from the fuel record (delta is positive → pass as negative change)
    const doNoUpper = (entry.doNo || '').toString().trim().toUpperCase();
    const isNilDO = doNoUpper === 'NIL' || doNoUpper === '' || doNoUpper === 'N/A';
    const isRefEntry = doNoUpper === 'REF';

    if (!isNilDO && !isRefEntry) {
      await updateFuelRecordForLPOEntry(
        entry.doNo,
        -delta,
        lpo.station,
        entry.truckNo,
        cancellationPoint || entry.cancellationPoint,
        entry.isCustomStation ? {
          isCustomStation: entry.isCustomStation,
          customGoingCheckpoint: entry.customGoingCheckpoint,
          customReturnCheckpoint: entry.customReturnCheckpoint,
        } : undefined
      );
    }

    // Update the entry: store original liters if not already amended, then apply new value
    if (!lpo.entries[entryIndex].originalLiters) {
      lpo.entries[entryIndex].originalLiters = oldLiters;
    }
    lpo.entries[entryIndex].liters = parsedLiters;
    lpo.entries[entryIndex].amount = parsedLiters * entry.rate;
    lpo.entries[entryIndex].amendedAt = new Date();
    if (cancellationPoint) {
      lpo.entries[entryIndex].cancellationPoint = cancellationPoint;
    }

    // Recalculate total (cancelled entries excluded)
    lpo.total = lpo.entries
      .filter((e: any) => !e.isCancelled)
      .reduce((sum: number, e: any) => sum + e.amount, 0);

    await lpo.save();

    logger.info(`Truck ${truckNo} amended in LPO ${lpo.lpoNo}: ${oldLiters}L → ${parsedLiters}L (Δ${delta}L) by ${req.user?.username}`);

    await AuditService.log({
      userId: req.user?.userId,
      username: req.user?.username || 'system',
      action: 'UPDATE',
      resourceType: 'LPOSummary',
      resourceId: lpo.lpoNo,
      details: `Truck "${truckNo}" amended in LPO ${lpo.lpoNo}: ${oldLiters}L → ${parsedLiters}L (reduced by ${delta}L)${reason ? ` — reason: ${reason}` : ''} by ${req.user?.username}`,
      ipAddress: req.ip,
      severity: 'medium',
    });

    res.status(200).json({
      success: true,
      message: `Successfully amended truck ${truckNo} in LPO ${lpo.lpoNo}: ${oldLiters}L → ${parsedLiters}L`,
      data: lpo,
    });
    emitDataChange('lpo_summaries', 'update');
    emitDataChange('fuel_records', 'update');

    createLPOAmendedNotification(lpo, lpo.entries[entryIndex], username).catch(() => {});
  });
};

/**
 * Cancel ALL active entries in an LPO at once
 * For regular trucks: reverts fuel record deduction
 * For DA/REF/NIL trucks: marks cancelled only, no fuel record change
 */
export const cancelAllEntriesInLPO = async (req: AuthRequest, res: Response): Promise<void> => {
  const { id } = req.params;
  const { reason, manualCheckpoints } = req.body;
  const username = req.user?.username || 'system';
  const displayName = await getDisplayName(username);

  // When lpoCancelRevert automation is OFF, the operator must pick which fuel
  // column to revert each regular truck from. Those picks arrive keyed by
  // `${doNo}-${truckNo}`; we validate them against the known checkpoint fields.
  const fuelFlags = await getFuelAutomationFlags();
  const rawManualCheckpoints = (manualCheckpoints || {}) as Record<string, string>;
  const manualFieldFor = (e: any): string | undefined => {
    const f = rawManualCheckpoints[`${e.doNo}-${e.truckNo}`];
    return f && FUEL_CHECKPOINT_FIELDS.has(f) ? f : undefined;
  };

  await withLpoLock(id, username, displayName, async () => {

    const lpo = await LPOSummary.findOne({ _id: id, isDeleted: false });
    if (!lpo) {
      throw new ApiError(404, 'LPO not found');
    }

    const activeEntries = lpo.entries.filter((e: any) => !e.isCancelled);
    if (activeEntries.length === 0) {
      throw new ApiError(400, 'No active entries to cancel');
    }

    const results: Array<{ truckNo: string; reverted: boolean; reason?: string; error?: string }> = [];

    for (let i = 0; i < lpo.entries.length; i++) {
      const entry = lpo.entries[i] as any;
      if (entry.isCancelled) continue;

      const isDriverAccount = entry.isDriverAccount === true;
      const isRefer = entry.isRefer === true;
      const doNoUpper = (entry.doNo || '').toString().trim().toUpperCase();
      const isNilOrSpecial = doNoUpper === 'NIL' || doNoUpper === '' || doNoUpper === 'N/A' ||
                             doNoUpper === 'DA' || doNoUpper === 'REF' || isDriverAccount || isRefer;

      if (!isNilOrSpecial && entry.truckNo && entry.doNo) {
        // Regular entry — revert fuel record
        const manualField = manualFieldFor(entry);
        if (!fuelFlags.lpoCancelRevert && !manualField) {
          // Automation off and no checkpoint chosen — cancel the row but leave
          // the fuel record untouched (operator did not pick a column).
          results.push({ truckNo: entry.truckNo, reverted: false, reason: 'Automation OFF - no checkpoint selected' });
        } else {
          try {
            await updateFuelRecordForLPOEntry(
              entry.doNo,
              -entry.liters,
              lpo.station,
              entry.truckNo,
              fuelFlags.lpoCancelRevert ? entry.cancellationPoint : undefined,
              entry.isCustomStation ? {
                isCustomStation: entry.isCustomStation,
                customGoingCheckpoint: entry.customGoingCheckpoint,
                customReturnCheckpoint: entry.customReturnCheckpoint,
              } : undefined,
              undefined,
              fuelFlags.lpoCancelRevert ? undefined : { explicitField: manualField }
            );
            results.push({ truckNo: entry.truckNo, reverted: true });
          } catch (err) {
            results.push({ truckNo: entry.truckNo, reverted: false, error: String(err) });
          }
        }
      } else {
        const entryKind = isDriverAccount ? 'DA' : isRefer ? 'REF' : 'NIL DO';
        results.push({ truckNo: entry.truckNo, reverted: false, reason: `${entryKind} - no fuel record affected` });
      }

      lpo.entries[i].isCancelled = true;
      lpo.entries[i].cancellationReason = reason || 'Bulk LPO cancellation';
      lpo.entries[i].cancelledAt = new Date();
    }

    // Recalculate total (all cancelled now = 0)
    lpo.total = lpo.entries
      .filter((e: any) => !e.isCancelled)
      .reduce((sum: number, e: any) => sum + e.amount, 0);

    await lpo.save();

    logger.info(`All entries cancelled in LPO ${lpo.lpoNo} by ${req.user?.username} (${activeEntries.length} entries)`);

    await AuditService.log({
      userId: req.user?.userId,
      username: req.user?.username || 'system',
      action: 'UPDATE',
      resourceType: 'LPOSummary',
      resourceId: lpo.lpoNo,
      details: `All ${activeEntries.length} entries cancelled in LPO ${lpo.lpoNo}${reason ? ` — reason: ${reason}` : ''} by ${req.user?.username}`,
      ipAddress: req.ip,
      severity: 'high',
    });

    res.status(200).json({
      success: true,
      message: `Successfully cancelled all ${activeEntries.length} entries in LPO ${lpo.lpoNo}`,
      data: { lpoNo: lpo.lpoNo, results },
    });
    emitDataChange('lpo_summaries', 'update');
    emitDataChange('fuel_records', 'update');

    // Notify station manager / super_manager / drivers for every cancelled entry (best-effort).
    for (const entry of activeEntries) {
      createLPOCancelledNotification(lpo, entry, username).catch(() => {});
    }
  });
};

/**
 * Forward an LPO to a new station
 * Creates a new LPO with the same truck entries but at a different station with new default liters
 * 
 * Common Use Cases:
 * - Zambia Returning: Ndola (50L) → Kapiri (350L)
 * - Tunduma Returning: Lake Tunduma (100L) → Infinity/Mbeya (400L)
 */
export const forwardLPO = async (req: AuthRequest, res: Response): Promise<void> => {
  const {
    sourceLpoId,
    targetStation,
    defaultLiters,
    rate,
    date,
    orderOf,
    includeOnlyActive = true,
    customStationName,
    customGoingCheckpoint,
    customReturnCheckpoint
  } = req.body;
  const username = req.user?.username || 'system';
  const displayName = await getDisplayName(username);
  await withLpoLock(sourceLpoId, username, displayName, async () => {

    if (!sourceLpoId || !targetStation || !defaultLiters || !rate) {
      throw new ApiError(400, 'Source LPO ID, target station, default liters, and rate are required');
    }

    // Find the source LPO
    const sourceLpo = await LPOSummary.findOne({ _id: sourceLpoId, isDeleted: false });
    if (!sourceLpo) {
      throw new ApiError(404, 'Source LPO not found');
    }

    // Validate target station is different
    if (sourceLpo.station.toUpperCase() === targetStation.toUpperCase()) {
      throw new ApiError(400, 'Target station cannot be the same as source station');
    }

    // Filter entries (only active, non-cancelled entries if specified)
    const entriesToForward = includeOnlyActive
      ? sourceLpo.entries.filter((e: any) => !e.isCancelled)
      : sourceLpo.entries;

    if (entriesToForward.length === 0) {
      throw new ApiError(400, 'Source LPO has no active entries to forward');
    }

    // Create forwarded entries with new liters and rate
    const forwardedEntries = entriesToForward.map((entry: any) => ({
      doNo: entry.doNo,
      truckNo: entry.truckNo,
      liters: defaultLiters,
      rate: rate,
      amount: defaultLiters * rate,
      dest: entry.dest,
      // Reset cancellation/driver account fields
      isCancelled: false,
      isDriverAccount: false,
      originalLiters: null,
      amendedAt: null,
      // Preserve or set custom station info
      cancellationPoint: entry.cancellationPoint,
      isCustomStation: targetStation.toUpperCase() === 'CUSTOM',
      customStationName: targetStation.toUpperCase() === 'CUSTOM' ? customStationName : entry.customStationName,
      customGoingCheckpoint: targetStation.toUpperCase() === 'CUSTOM' ? customGoingCheckpoint : entry.customGoingCheckpoint,
      customReturnCheckpoint: targetStation.toUpperCase() === 'CUSTOM' ? customReturnCheckpoint : entry.customReturnCheckpoint,
    }));

    // Create new LPO date
    const lpoDate = date || new Date().toISOString().split('T')[0];
    const dateObj = new Date(lpoDate);
    const year = dateObj.getFullYear();

    // Calculate total
    const total = forwardedEntries.reduce((sum: number, entry: any) => sum + entry.amount, 0);

    // Ensure workbook exists for this year
    await getOrCreateWorkbook(year);

    // Get next canonical LPO number (XXXX/YY) for this year
    const nextLpoNo = await allocateNextLpoNo(year);

    // Create the forwarded LPO
    const forwardedLpo = await LPOSummary.create({
      lpoNo: nextLpoNo,
      date: lpoDate,
      year,
      station: targetStation.toUpperCase(),
      orderOf: orderOf || sourceLpo.orderOf,
      entries: forwardedEntries,
      total,
      // Track the source LPO for reference
      forwardedFrom: {
        lpoId: sourceLpo._id,
        lpoNo: sourceLpo.lpoNo,
        station: sourceLpo.station,
      },
      // Include custom station metadata if target is CUSTOM
      isCustomStation: targetStation.toUpperCase() === 'CUSTOM',
      customStationName: targetStation.toUpperCase() === 'CUSTOM' ? customStationName : undefined,
      customGoingCheckpoint: targetStation.toUpperCase() === 'CUSTOM' ? customGoingCheckpoint : undefined,
      customReturnCheckpoint: targetStation.toUpperCase() === 'CUSTOM' ? customReturnCheckpoint : undefined,
    });

    // Update fuel records for each entry (regular LPO entries)
    for (const entry of forwardedEntries) {
      await updateFuelRecordForLPOEntry(
        entry.doNo,
        entry.liters,
        targetStation,
        entry.truckNo,
        entry.cancellationPoint,
        entry.isCustomStation ? {
          isCustomStation: entry.isCustomStation,
          customGoingCheckpoint: entry.customGoingCheckpoint,
          customReturnCheckpoint: entry.customReturnCheckpoint,
        } : undefined
      );
    }

    logger.info(`LPO ${sourceLpo.lpoNo} forwarded to ${targetStation} as LPO ${forwardedLpo.lpoNo} by ${req.user?.username}`);

    await AuditService.log({
      userId: req.user?.userId,
      username: req.user?.username || 'system',
      action: 'CREATE',
      resourceType: 'LPOSummary',
      resourceId: forwardedLpo.lpoNo,
      details: `LPO ${sourceLpo.lpoNo} forwarded to ${targetStation} as LPO ${forwardedLpo.lpoNo} (${forwardedEntries.length} entries) by ${req.user?.username}`,
      ipAddress: req.ip,
      severity: 'medium',
    });

    res.status(201).json({
      success: true,
      message: `Successfully forwarded LPO ${sourceLpo.lpoNo} to ${targetStation} as LPO ${forwardedLpo.lpoNo}`,
      data: {
        sourceLpo: {
          id: sourceLpo._id,
          lpoNo: sourceLpo.lpoNo,
          station: sourceLpo.station,
        },
        forwardedLpo: forwardedLpo,
        entriesForwarded: forwardedEntries.length,
      },
    });
    emitDataChange('lpo_summaries', 'create', undefined, undefined, undefined, {
      id: req.user?.userId,
      username: req.user?.username,
    });
    emitDataChange('fuel_records', 'update');
  });
};

/**
 * Pick-up-at: a set of trucks ordered fuel at one station but actually filled at
 * another. In a single all-or-nothing transaction this:
 *   1. Cancels the selected trucks on the source LPO and reverts their fuel.
 *   2. Creates a new LPO at the chosen station for those trucks (same liters by
 *      default, or a uniform override) and deducts their fuel there.
 *
 * Fuel netting is always "deduct old + add new": same liters nets the balance to
 * zero (the fuel just moves columns); different liters nets the difference.
 *
 * Checkpoint selection:
 *   - When `lpoPickupAuto` is ON, the deduct/add columns are auto-derived from the
 *     station + the DO-derived direction (existing logic).
 *   - When OFF (e.g. raw imported records with no checkpoints), the caller supplies
 *     a per-truck `revertField` (column to revert at the source) and `addField`
 *     (column to deduct at the target). Direction is determined per truck by its DO
 *     number on the client, so going trucks pick going columns and returning trucks
 *     pick returning columns. Both must be real FuelRecord columns.
 */
// REF / NIL / Driver-Account entries never have a fuel record. Pick-up moves them
// to the new LPO but skips fuel netting and (in manual mode) the checkpoint columns.
const isNoFuelRecordEntry = (entry: any): boolean => {
  const doUp = (entry?.doNo || '').toString().trim().toUpperCase();
  return (
    entry?.isDriverAccount === true ||
    entry?.isRefer === true ||
    doUp === '' || doUp === 'NIL' || doUp === 'N/A' || doUp === 'REF' || doUp === 'DA'
  );
};

export const pickupAtStation = async (req: AuthRequest, res: Response): Promise<void> => {
  const {
    sourceLpoId,
    targetStation,
    customStationName,
    customCountry,
    customGoingCheckpoint,
    customReturnCheckpoint,
    rate,
    date,
    orderOf,
    lpoNo,                         // optional preferred number (previewed client-side); used if still free
    litersMode = 'same',           // 'same' (keep each truck's liters) | 'uniform'
    uniformLiters,                 // required when litersMode === 'uniform'
    trucks,                        // [{ doNo, truckNo, liters?, revertField?, addField? }]
  } = req.body;

  if (!sourceLpoId || !targetStation || !rate) {
    throw new ApiError(400, 'Source LPO ID, target station, and rate are required');
  }
  if (!Array.isArray(trucks) || trucks.length === 0) {
    throw new ApiError(400, 'At least one truck must be selected for pick-up-at');
  }
  if (litersMode === 'uniform' && (!uniformLiters || uniformLiters <= 0)) {
    throw new ApiError(400, 'Uniform liters must be greater than 0 when litersMode is "uniform"');
  }

  const isCustomTarget = String(targetStation).toUpperCase() === 'CUSTOM';
  if (isCustomTarget && !customStationName) {
    throw new ApiError(400, 'Custom station name is required when target is CUSTOM');
  }
  const resolvedCustomCountry = (customCountry || 'Zambia').toString().trim();

  const fuelFlags = await getFuelAutomationFlags();
  // Manual columns are required when auto is off, OR when the target is a CUSTOM
  // (unlisted) station — there is no station→column mapping to auto-derive from.
  const autoCheckpoints = fuelFlags.lpoPickupAuto && !isCustomTarget;

  // The manual-checkpoint requirement is enforced per truck inside the transaction
  // (below), once each source entry is resolved — REF / NIL / Driver-Account entries
  // have no fuel record and are exempt.

  // Resolve the target station's currency the same way createLPOSummary does.
  let resolvedCurrency: 'USD' | 'TZS' = 'TZS';
  if (targetStation && String(targetStation).toUpperCase() !== 'CASH' && !isCustomTarget) {
    const stationConfig = await FuelStationConfig.findOne({ stationName: targetStation, isActive: true }).lean();
    if (stationConfig?.currency) {
      resolvedCurrency = stationConfig.currency as 'USD' | 'TZS';
    } else {
      const upper = String(targetStation).toUpperCase();
      if (upper.startsWith('LAKE') && !upper.includes('TUNDUMA')) resolvedCurrency = 'USD';
    }
  }

  const touchedIds = new Set<string>();
  let createdLpo: any = null;
  let sourceLpoNo = '';
  let pickedUpCount = 0;

  const pickupUsername = req.user?.username || 'system';
  await enforceEditLock(LPOSummary, sourceLpoId, pickupUsername, 'lpo_summaries');

  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const sourceLpo = await LPOSummary.findOne({ _id: sourceLpoId, isDeleted: false }).session(session);
      if (!sourceLpo) {
        throw new ApiError(404, 'Source LPO not found');
      }
      sourceLpoNo = sourceLpo.lpoNo;

      if (String(sourceLpo.station).toUpperCase() === String(targetStation).toUpperCase()) {
        throw new ApiError(400, 'Target station cannot be the same as the source station');
      }

      // Resolve each requested truck to its live (active, non-cancelled) source entry.
      const selected: { entry: any; liters: number; revertField?: string; addField?: string; special: boolean }[] = [];
      for (const t of trucks) {
        const entry: any = sourceLpo.entries.find(
          (e: any) => e.doNo === t.doNo && e.truckNo === t.truckNo && !e.isCancelled
        );
        if (!entry) {
          throw new ApiError(400, `Truck ${t.truckNo} (DO ${t.doNo}) is not an active entry on LPO ${sourceLpo.lpoNo}`);
        }
        const special = isNoFuelRecordEntry(entry);
        // Manual mode: a real fuel-record entry must carry valid revert/add columns.
        // Special entries (REF/NIL/DA) have no fuel record, so checkpoints don't apply.
        if (!autoCheckpoints && !special) {
          if (!t.revertField || !FUEL_CHECKPOINT_FIELDS.has(t.revertField)) {
            throw new ApiError(400, `Truck ${t.truckNo}: a valid revert checkpoint is required (manual mode)`);
          }
          if (!t.addField || !FUEL_CHECKPOINT_FIELDS.has(t.addField)) {
            throw new ApiError(400, `Truck ${t.truckNo}: a valid destination checkpoint is required (manual mode)`);
          }
        }
        // Per-truck liters take precedence (edited in the table); fall back to the
        // legacy uniform/same modes, then the source entry's own liters.
        const newLiters = t.liters != null && Number(t.liters) > 0
          ? Number(t.liters)
          : (litersMode === 'uniform' ? Number(uniformLiters) : entry.liters);
        if (!(newLiters > 0)) {
          throw new ApiError(400, `Truck ${t.truckNo}: liters must be greater than 0`);
        }
        selected.push({ entry, liters: newLiters, revertField: t.revertField, addField: t.addField, special });
      }

      const now = new Date();

      // 1. Cancel selected trucks on the source LPO and revert their fuel.
      for (const sel of selected) {
        const { entry } = sel;
        // Special entries (REF/NIL/DA) have no fuel record — just cancel them.
        if (!sel.special) {
          await updateFuelRecordForLPOEntry(
            entry.doNo,
            -entry.liters, // revert exactly what was deducted at the source
            sourceLpo.station,
            entry.truckNo,
            entry.cancellationPoint,
            entry.isCustomStation ? {
              isCustomStation: entry.isCustomStation,
              customGoingCheckpoint: entry.customGoingCheckpoint,
              customReturnCheckpoint: entry.customReturnCheckpoint,
            } : undefined,
            undefined,
            { session, touchedIds, explicitField: autoCheckpoints ? undefined : sel.revertField }
          );
        }
        entry.isCancelled = true;
        entry.cancelledAt = now;
        entry.cancellationReason = `Picked up at ${isCustomTarget ? customStationName : targetStation}`;
      }
      sourceLpo.total = sourceLpo.entries
        .filter((e: any) => !e.isCancelled)
        .reduce((sum: number, e: any) => sum + e.amount, 0);
      sourceLpo.markModified('entries');
      await sourceLpo.save({ session });

      // 2. Build the new LPO entries (preserve DO/dest/direction; same or uniform liters).
      const newEntries = selected.map((sel) => ({
        doNo: sel.entry.doNo,
        truckNo: sel.entry.truckNo,
        liters: sel.liters,
        rate,
        amount: sel.liters * rate,
        dest: sel.entry.dest,
        isCancelled: false,
        // Preserve the source entry's nature so picked-up REF / Driver-Account
        // entries stay correctly categorised at the target.
        isDriverAccount: sel.entry.isDriverAccount || false,
        isRefer: sel.entry.isRefer || false,
        referenceDo: sel.entry.referenceDo,
        referenceDoNo: sel.entry.referenceDoNo,
        originalLiters: null,
        amendedAt: null,
        cancellationPoint: sel.entry.cancellationPoint,
        isCustomStation: isCustomTarget,
        customStationName: isCustomTarget ? customStationName : sel.entry.customStationName,
        customGoingCheckpoint: isCustomTarget ? customGoingCheckpoint : sel.entry.customGoingCheckpoint,
        customReturnCheckpoint: isCustomTarget ? customReturnCheckpoint : sel.entry.customReturnCheckpoint,
        customCountry: isCustomTarget ? resolvedCustomCountry : sel.entry.customCountry,
      }));

      const lpoDate = date || new Date().toISOString().split('T')[0];
      const year = new Date(lpoDate).getFullYear();
      await getOrCreateWorkbook(year);

      // Use the client-previewed number if it's still free; otherwise allocate the
      // next canonical XXXX/YY (session-consistent) so concurrent creates can't collide.
      const requestedLpoNo = (lpoNo || '').toString().trim();
      let newLpoNo: string;
      if (requestedLpoNo) {
        const taken = await LPOSummary.exists({ lpoNo: requestedLpoNo, isDeleted: false }).session(session);
        newLpoNo = taken ? await allocateNextLpoNo(year, session) : requestedLpoNo;
      } else {
        newLpoNo = await allocateNextLpoNo(year, session);
      }

      const total = newEntries.reduce((sum, e) => sum + e.amount, 0);
      const resolvedStation = isCustomTarget
        ? String(customStationName).toUpperCase().trim()
        : String(targetStation).toUpperCase();
      const created = await LPOSummary.create([{
        lpoNo: newLpoNo,
        date: lpoDate,
        year,
        station: resolvedStation,
        orderOf: orderOf || sourceLpo.orderOf,
        currency: resolvedCurrency,
        entries: newEntries,
        total,
        forwardedFrom: {
          lpoId: sourceLpo._id,
          lpoNo: sourceLpo.lpoNo,
          station: sourceLpo.station,
        },
        isCustomStation: isCustomTarget,
        customStationName: isCustomTarget ? customStationName : undefined,
        customGoingCheckpoint: isCustomTarget ? customGoingCheckpoint : undefined,
        customReturnCheckpoint: isCustomTarget ? customReturnCheckpoint : undefined,
        customCountry: isCustomTarget ? resolvedCustomCountry : undefined,
      }], { session });
      createdLpo = created[0];

      // 3. Deduct fuel for each new entry at the target (skip special entries —
      //    REF/NIL/DA carry no fuel record).
      for (let i = 0; i < newEntries.length; i++) {
        if (selected[i].special) continue;
        const e = newEntries[i];
        await updateFuelRecordForLPOEntry(
          e.doNo,
          e.liters,
          String(targetStation),
          e.truckNo,
          e.cancellationPoint,
          isCustomTarget ? {
            isCustomStation: true,
            customGoingCheckpoint,
            customReturnCheckpoint,
          } : undefined,
          undefined,
          { session, touchedIds, explicitField: autoCheckpoints ? undefined : selected[i].addField }
        );
      }

      pickedUpCount = newEntries.length;
    });
  } catch (error: any) {
    await session.endSession();
    if (error instanceof ApiError) throw error;
    logger.error(`Pick-up-at failed for LPO ${sourceLpoId}: ${error.message}`);
    throw new ApiError(500, `Pick-up-at failed: ${error.message}`);
  }
  await session.endSession();

  // Post-commit: live-update affected fuel records and run journey promotion.
  if (touchedIds.size > 0) {
    const records = await FuelRecord.find({ _id: { $in: Array.from(touchedIds) } });
    for (const rec of records) {
      emitDataChange('fuel_records', 'update', rec.toObject());
      await checkAndPromoteStartedJourney(rec, req.user?.username || 'lpo-system');
    }
  }
  emitDataChange('lpo_summaries', 'update');
  emitDataChange(
    'lpo_summaries',
    'create',
    createdLpo?.toObject?.() ?? createdLpo,
    createdLpo?.station,
    undefined,
    { id: req.user?.userId, username: req.user?.username },
  );
  if (createdLpo) {
    createLPOCreatedNotification(createdLpo, req.user?.username || 'system').catch(() => {});
  }

  await AuditService.log({
    userId: req.user?.userId,
    username: req.user?.username || 'system',
    action: 'UPDATE',
    resourceType: 'LPOSummary',
    resourceId: createdLpo?.lpoNo,
    details: `Picked up ${pickedUpCount} truck(s) from LPO ${sourceLpoNo} to ${targetStation} as LPO ${createdLpo?.lpoNo} (checkpoints: ${autoCheckpoints ? 'auto' : 'manual'}) by ${req.user?.username}`,
    ipAddress: req.ip,
    severity: 'medium',
  });

  res.status(201).json({
    success: true,
    message: `Picked up ${pickedUpCount} truck(s) from LPO ${sourceLpoNo} to ${targetStation} as LPO ${createdLpo?.lpoNo}`,
    data: {
      sourceLpo: { id: sourceLpoId, lpoNo: sourceLpoNo },
      pickedUpLpo: createdLpo,
      entriesPickedUp: pickedUpCount,
    },
  });
};

/**
 * Get flattened LPO entries for a specific truck (Driver Portal)
 * Returns all entries from LPOSummary with cancellation status and updates
 */
export const getDriverLPOEntries = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { truckNo } = req.params;
    const { limit = 100 } = req.query;

    if (!truckNo) {
      throw new ApiError(400, 'Truck number is required');
    }

    // Normalize truck number for case-insensitive matching
    const truckNoNormalized = (truckNo as string).replace(/\s+/g, '').toUpperCase();

    // Find all LPOs containing this truck (including cancelled entries)
    // Use case-insensitive regex that allows optional spaces
    const truckRegexPattern = truckNoNormalized.split('').join('\\s*');
    const lpos = await LPOSummary.find({
      'entries.truckNo': new RegExp(`^${truckRegexPattern}$`, 'i'),
      isDeleted: false,
    })
      .sort({ date: -1 })
      .limit(parseInt(limit as string))
      .lean();

    // Flatten entries for this truck
    const flattenedEntries: any[] = [];
    
    for (const lpo of lpos) {
      for (let i = 0; i < lpo.entries.length; i++) {
        const entry = lpo.entries[i];
        const entryTruckNormalized = (entry.truckNo || '').replace(/\s+/g, '').toUpperCase();
        if (entryTruckNormalized === truckNoNormalized) {
          // Generate unique ID from LPO + index since subdocuments have _id
          const entryId = (entry as any)._id || `${lpo._id}-${i}`;
          flattenedEntries.push({
            _id: entryId.toString ? entryId.toString() : entryId,
            date: lpo.date,
            lpoNo: lpo.lpoNo,
            station: lpo.station,
            doSdo: entry.doNo,
            truckNo: entry.truckNo,
            ltrs: entry.liters,
            pricePerLtr: entry.rate,
            amount: entry.amount,
            destinations: entry.dest,
            // Cancellation fields
            isCancelled: entry.isCancelled || false,
            cancellationPoint: entry.cancellationPoint,
            cancellationReason: entry.cancellationReason,
            cancelledAt: entry.cancelledAt,
            // Amendment tracking
            originalLiters: entry.originalLiters,
            amendedAt: entry.amendedAt,
            // Driver account fields
            isDriverAccount: entry.isDriverAccount,
            referenceDo: entry.referenceDo,
            // Custom station fields
            isCustomStation: entry.isCustomStation,
            customStationName: entry.customStationName,
            customGoingCheckpoint: entry.customGoingCheckpoint,
            customReturnCheckpoint: entry.customReturnCheckpoint,
          });
        }
      }
    }

    logger.info(`Driver LPO entries fetched for truck ${truckNo}: ${flattenedEntries.length} entries`);

    res.status(200).json({
      success: true,
      message: 'Driver LPO entries retrieved successfully',
      data: flattenedEntries,
    });
  } catch (error: any) {
    throw error;
  }
};

// Legacy methods for backward compatibility
export const addSheetToWorkbook = async (req: AuthRequest, res: Response): Promise<void> => {
  return createLPOSummary(req, res);
};

export const updateSheetInWorkbook = async (req: AuthRequest, res: Response): Promise<void> => {
  req.params.id = req.params.sheetId;
  return updateLPOSummary(req, res);
};

// ─── Flat entry list (replaces the old /lpo-entries endpoint) ────────────────

const ENTRY_DERIVE_STAGE = {
  $addFields: {
    doSdoDisplay: {
      $cond: {
        if: { $eq: ['$entries.isCancelled', true] },
        then: 'CANCELLED',
        else: {
          $cond: {
            if: { $eq: ['$entries.isRefer', true] },
            then: 'REF',
            else: {
              $cond: {
                if: { $eq: ['$entries.isDriverAccount', true] },
                then: 'DA(NIL)',
                else: { $ifNull: ['$entries.doNo', 'PENDING'] },
              },
            },
          },
        },
      },
    },
    destinationsDisplay: {
      $cond: {
        if: { $eq: ['$entries.isCancelled', true] },
        then: 'CANCELLED',
        else: { $ifNull: ['$entries.dest', 'PENDING'] },
      },
    },
    paymentModeValue: {
      $switch: {
        branches: [
          { case: { $eq: ['$entries.isRefer', true] }, then: 'REFER' },
          { case: { $eq: ['$entries.isDriverAccount', true] }, then: 'DRIVER_ACCOUNT' },
          {
            case: {
              $or: [
                { $eq: ['$station', 'CASH'] },
                { $gt: [{ $strLenCP: { $ifNull: ['$entries.cancellationPoint', ''] } }, 0] },
                { $gt: [{ $strLenCP: { $ifNull: ['$entries.goingCheckpoint', ''] } }, 0] },
              ],
            },
            then: 'CASH',
          },
        ],
        default: 'STATION',
      },
    },
  },
};

const ENTRY_PROJECTION = {
  _id: 0,
  id: '$entries._id',
  lpoId: '$_id',
  lpoNo: 1,
  date: 1,
  dieselAt: '$station',
  doSdo: '$doSdoDisplay',
  truckNo: '$entries.truckNo',
  ltrs: '$entries.liters',
  pricePerLtr: '$entries.rate',
  destinations: '$destinationsDisplay',
  currency: 1,
  isCancelled: { $ifNull: ['$entries.isCancelled', false] },
  cancelledAt: '$entries.cancelledAt',
  isDriverAccount: { $ifNull: ['$entries.isDriverAccount', false] },
  isRefer: { $ifNull: ['$entries.isRefer', false] },
  paymentMode: '$paymentModeValue',
  originalLtrs: '$entries.originalLiters',
  amendedAt: '$entries.amendedAt',
  referenceDo: { $ifNull: ['$entries.referenceDoNo', '$entries.referenceDo'] },
  createdAt: 1,
  updatedAt: 1,
};

/** Numeric prefix of canonical LPO number (XXXX/YY → XXXX) for stable list ordering. */
const LPO_SORT_NUM_EXPR = {
  $convert: {
    input: { $arrayElemAt: [{ $split: [{ $ifNull: ['$lpoNo', '0'] }, '/'] }, 0] },
    to: 'int',
    onError: 0,
    onNull: 0,
  },
};

const FLAT_ENTRY_PROJECTION = {
  ...ENTRY_PROJECTION,
  entryIdx: { $ifNull: ['$entryIdx', 0] },
  lpoSortNum: LPO_SORT_NUM_EXPR,
};

function resolveFlatEntrySort(sort?: string, order?: string): Record<string, 1 | -1> {
  const raw = (sort as string) || 'lpo_desc';
  const asc = order === 'asc';

  switch (raw) {
    case 'lpo_asc':
    case 'oldest':
      return { lpoSortNum: 1, entryIdx: 1 };
    case 'liters_desc':
      return { ltrs: -1, lpoSortNum: -1, entryIdx: 1 };
    case 'liters_asc':
      return { ltrs: 1, lpoSortNum: -1, entryIdx: 1 };
    case 'lpo_desc':
    case 'newest':
    case 'createdAt':
    default:
      return asc ? { lpoSortNum: 1, entryIdx: 1 } : { lpoSortNum: -1, entryIdx: 1 };
  }
}

/**
 * GET /lpo-documents/entries
 * Aggregates LPOSummary.entries into a flat, paginated list.
 * Replaces the removed /lpo-entries endpoint.
 */
// Manager-tier roles whose LPO view is scoped (by station and/or date) server-side.
const STATION_SCOPED_ROLES = ['manager', 'station_manager'];
const ALL_MANAGER_TIER_ROLES = [...STATION_SCOPED_ROLES, 'super_manager'];

// Stations a super_manager does NOT see by default (when no allow-list is
// configured). Mirrors the client EXCLUDED_STATIONS_SUPER so the default view is
// identical whether or not an admin has set an explicit list.
const DEFAULT_SUPER_MANAGER_EXCLUDED = [
  'LAKE TUNDUMA',
  'GBP MOROGORO',
  'GBP KANGE',
  'GPB KANGE',
  'INFINITY',
];

// Fallback station mapping for legacy station-manager accounts that have no
// `station` field set — derived from their username (manager_kitwe → LAKE KITWE).
// Mirrors the client-side STATION_MAPPING so server and app agree.
const USERNAME_STATION_MAPPING: Record<string, string> = {
  infinity: 'INFINITY',
  chilabombwe: 'LAKE CHILABOMBWE',
  ndola: 'LAKE NDOLA',
  kapiri: 'LAKE KAPIRI',
  kitwe: 'LAKE KITWE',
  kabangwa: 'LAKE KABANGWA',
  chingola: 'LAKE CHINGOLA',
  tunduma: 'LAKE TUNDUMA',
  morogoro: 'GBP MOROGORO',
  kange: 'GBP KANGE',
};

/**
 * Resolve the LPO-access constraints for a manager-tier user, enforced
 * SERVER-SIDE so the restriction can't be widened by editing the client.
 *
 * Returns null for non-manager roles (no extra scoping applied here).
 *  - manager / station_manager → `forcedStation` (their own station; '' if it
 *    can't be resolved, which deliberately matches nothing).
 *  - super_manager → `allowedStations` (the admin-configured list; empty => all).
 *  - all three → `dateFloor` ('YYYY-MM-DD') from managerLpoLookbackDays (0 => none).
 */
async function resolveManagerScope(
  user: { userId: string; username: string; role: string } | undefined
): Promise<{ forcedStation?: string; allowedStations?: string[]; excludedStations?: string[]; dateFloor?: string; includeCustomZambia?: boolean } | null> {
  if (!user || !ALL_MANAGER_TIER_ROLES.includes(user.role)) return null;

  const access = await getManagerAccessConfig();
  const includeCustomZambia = access.superManagerNotifyCustomZambia;

  // Date floor (applies to every manager-tier role).
  let dateFloor: string | undefined;
  if (access.managerLpoLookbackDays > 0) {
    const floor = new Date();
    floor.setDate(floor.getDate() - access.managerLpoLookbackDays);
    dateFloor = floor.toISOString().substring(0, 10);
  }

  if (user.role === 'super_manager') {
    // Configured allow-list wins; otherwise fall back to the default exclusions.
    if (access.superManagerStations.length > 0) {
      return { allowedStations: access.superManagerStations, dateFloor, includeCustomZambia };
    }
    return { excludedStations: DEFAULT_SUPER_MANAGER_EXCLUDED, dateFloor, includeCustomZambia };
  }

  // Station-scoped roles: force their own station.
  let station = '';
  const dbUser = await User.findById(user.userId).select('station').lean();
  if (dbUser?.station) {
    station = dbUser.station.toUpperCase().trim();
  } else {
    const key = (user.username || '')
      .toLowerCase()
      .replace('manager_', '')
      .replace('mgr_', '');
    station = USERNAME_STATION_MAPPING[key] || '';
  }
  return { forcedStation: station, dateFloor };
}

type ManagerScope = NonNullable<Awaited<ReturnType<typeof resolveManagerScope>>>;

/** Apply manager-tier station scoping (incl. custom Zambia LPOs for super_manager). */
function applyManagerStationScope(
  docMatch: Record<string, any>,
  scope: ManagerScope,
  opts: {
    station?: string;
    stations?: string;
    customZambiaOnly?: string;
    hasSearch?: boolean;
  }
): void {
  if (scope.forcedStation !== undefined) {
    delete docMatch.$or;
    delete docMatch.$nor;
    delete docMatch.$and;
    const s = sanitizeRegexInput(scope.forcedStation);
    docMatch.station = s ? { $regex: `^${s}$`, $options: 'i' } : '\0__no_station__';
    return;
  }

  const includeCustom = scope.includeCustomZambia === true;
  const pickedSingle = opts.station && !opts.hasSearch ? (opts.station as string).toUpperCase().trim() : '';
  const customZambiaOnly = opts.customZambiaOnly === 'true' && includeCustom;
  const multiList =
    opts.stations && !opts.station && !opts.hasSearch
      ? (opts.stations as string).split(',').map((x) => sanitizeRegexInput(x.trim())).filter(Boolean)
      : [];

  delete docMatch.$nor;

  if (scope.allowedStations && scope.allowedStations.length > 0) {
    const allowed = scope.allowedStations.map((s) => s.toUpperCase().trim());
    const scopeOr = buildSuperManagerStationOrClauses(scope.allowedStations, includeCustom);

    if (customZambiaOnly) {
      delete docMatch.$or;
      delete docMatch.$and;
      delete docMatch.station;
      Object.assign(docMatch, buildCustomZambiaLpoFilter());
      return;
    }

    if (multiList.length > 0) {
      delete docMatch.station;
      docMatch.$and = [
        { $or: multiList.map((s) => ({ station: { $regex: `^${s}$`, $options: 'i' } })) },
        { $or: scopeOr },
      ];
      return;
    }

    if (pickedSingle) {
      delete docMatch.$or;
      delete docMatch.$and;
      const s = sanitizeRegexInput(pickedSingle);
      if (allowed.includes(pickedSingle)) {
        docMatch.station = { $regex: `^${s}$`, $options: 'i' };
      } else if (includeCustom) {
        docMatch.$and = [
          { station: { $regex: `^${s}$`, $options: 'i' } },
          buildCustomZambiaLpoFilter(),
        ];
      } else {
        docMatch.station = '\0__no_station__';
      }
      return;
    }

    delete docMatch.station;
    delete docMatch.$and;
    docMatch.$or = scopeOr;
    return;
  }

  if (scope.excludedStations && scope.excludedStations.length > 0) {
    const excluded = scope.excludedStations;

    if (customZambiaOnly) {
      delete docMatch.$or;
      delete docMatch.$and;
      delete docMatch.station;
      delete docMatch.$nor;
      Object.assign(docMatch, buildCustomZambiaLpoFilter());
      return;
    }

    if (multiList.length > 0) {
      delete docMatch.station;
      delete docMatch.$nor;
      docMatch.$and = [
        { $or: multiList.map((s) => ({ station: { $regex: `^${s}$`, $options: 'i' } })) },
        {
          $nor: excluded
            .map((st) => sanitizeRegexInput(st))
            .filter(Boolean)
            .map((s) => ({ station: { $regex: `^${s}$`, $options: 'i' } })),
        },
      ];
      return;
    }

    if (pickedSingle) {
      delete docMatch.$or;
      delete docMatch.$and;
      delete docMatch.$nor;
      if (!excluded.includes(pickedSingle)) {
        const s = sanitizeRegexInput(pickedSingle);
        docMatch.station = { $regex: `^${s}$`, $options: 'i' };
      } else {
        docMatch.station = '\0__no_station__';
      }
      return;
    }

    delete docMatch.station;
    delete docMatch.$and;
    docMatch.$nor = excluded
      .map((st) => sanitizeRegexInput(st))
      .filter(Boolean)
      .map((s) => ({ station: { $regex: `^${s}$`, $options: 'i' } }));
  }
}

export const getAllLPOEntriesFlat = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    let { page, limit, sort, order } = getPaginationParams(req.query);
    const dashboardLimits = await resolveDashboardSearchLimits('lpo', req.query);
    if (dashboardLimits) {
      page = dashboardLimits.page;
      limit = dashboardLimits.limit;
    }

    const { dateFrom, dateTo, lpoNo, truckNo, station, stations, customZambiaOnly, search, status, isRefer, isDriverAccount } = req.query;
    const effectiveDateFrom = dashboardLimits?.dateFrom ?? dateFrom;
    const effectiveDateTo = dashboardLimits?.dateTo ?? dateTo;

    const docMatch: any = { isDeleted: false };
    const scopeEarly = await resolveManagerScope(req.user);
    const managerTier = !!scopeEarly;

    if (lpoNo && !search) {
      const s = sanitizeRegexInput(lpoNo as string);
      if (s) docMatch.lpoNo = { $regex: `^${s}`, $options: 'i' };
    }
    if (!managerTier) {
      if (station && !search) {
        const s = sanitizeRegexInput(station as string);
        if (s) docMatch.station = { $regex: `^${s}`, $options: 'i' };
      }
      if (stations && !station && !search) {
        const list = (stations as string)
          .split(',')
          .map((x) => sanitizeRegexInput(x.trim()))
          .filter(Boolean);
        if (list.length > 0) {
          docMatch.$or = list.map((s) => ({ station: { $regex: `^${s}$`, $options: 'i' } }));
        }
      }
    }
    if (effectiveDateFrom || effectiveDateTo) {
      docMatch.date = {};
      if (effectiveDateFrom) docMatch.date.$gte = (effectiveDateFrom as string).substring(0, 10);
      if (effectiveDateTo) docMatch.date.$lte = (effectiveDateTo as string).substring(0, 10);
    }

    // ── Server-side access enforcement for manager-tier roles ──────────────
    // Station + date scoping is applied here (NOT trusting the client) so a
    // manager can never widen their view by editing query params. Runs even
    // when `search` is present, so search stays within the allowed scope.
    const scope = scopeEarly;
    if (scope) {
      applyManagerStationScope(docMatch, scope, {
        station: station as string | undefined,
        stations: stations as string | undefined,
        customZambiaOnly: customZambiaOnly as string | undefined,
        hasSearch: !!search,
      });
      // Date floor: tighten $gte, never loosen it.
      if (scope.dateFloor) {
        docMatch.date = docMatch.date || {};
        const existingFrom = docMatch.date.$gte as string | undefined;
        docMatch.date.$gte = existingFrom && existingFrom > scope.dateFloor ? existingFrom : scope.dateFloor;
      }
    }

    const entryMatch: any = {};
    if (status === 'active') {
      entryMatch.$or = [{ 'entries.isCancelled': false }, { 'entries.isCancelled': { $exists: false } }];
    } else if (status === 'cancelled') {
      entryMatch['entries.isCancelled'] = true;
    }
    if (isRefer === 'true') entryMatch['entries.isRefer'] = true;
    if (isDriverAccount === 'true') entryMatch['entries.isDriverAccount'] = true;
    if (req.user?.role === 'driver') entryMatch['entries.truckNo'] = req.user.username;
    if (truckNo && !search) {
      const s = sanitizeRegexInput(truckNo as string);
      if (s) entryMatch['entries.truckNo'] = { $regex: `^${s}`, $options: 'i' };
    }

    const skip = calculateSkip(page, limit);
    const pipeline: any[] = [
      { $match: docMatch },
      { $unwind: { path: '$entries', includeArrayIndex: 'entryIdx' } },
    ];
    if (Object.keys(entryMatch).length > 0) pipeline.push({ $match: entryMatch });
    pipeline.push(ENTRY_DERIVE_STAGE);

    if (search) {
      // Whitespace/separator-tolerant prefix match so "t598 dtb" also finds
      // "T598DTB", "T598  DTB", "T598-DTB", etc.
      const fuzzy = buildFuzzyRegex(search as string);
      if (fuzzy) {
        pipeline.push({
          $match: {
            $or: [
              { lpoNo: { $regex: fuzzy, $options: 'i' } },
              { 'entries.truckNo': { $regex: fuzzy, $options: 'i' } },
              { station: { $regex: fuzzy, $options: 'i' } },
              { doSdoDisplay: { $regex: fuzzy, $options: 'i' } },
            ],
          },
        });
      }
    }

    pipeline.push({ $project: FLAT_ENTRY_PROJECTION });

    // Legacy DriverAccountEntry union removed — DA is flag-only on LPOSummary (like REF).

    const sortStage = resolveFlatEntrySort(sort as string, order as string);
    pipeline.push({ $sort: sortStage });
    pipeline.push({
      $facet: {
        data: [{ $skip: skip }, { $limit: limit }],
        total: [{ $count: 'count' }],
      },
    });

    const [result] = await LPOSummary.aggregate(pipeline);
    const rawData: any[] = result?.data ?? [];
    const total: number = result?.total?.[0]?.count ?? 0;
    const data = rawData.map((entry, idx) => ({ sn: skip + idx + 1, ...entry }));

    res.status(200).json({
      success: true,
      message: 'LPO entries retrieved successfully',
      data: createPaginatedResponse(data, page, limit, total),
    });
  } catch (error: any) {
    throw error;
  }
};

/**
 * GET /lpo-documents/entries/filters
 * Returns distinct periods and stations for filter dropdowns.
 * Periods are always global (all months with data); dateFrom/dateTo only scope stations.
 * Replaces the removed /lpo-entries/available-filters endpoint.
 */
export const getLPOEntriesFilters = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const baseMatch: any = { isDeleted: false };
    if (req.user?.role === 'driver') baseMatch['entries.truckNo'] = req.user.username;

    const { dateFrom, dateTo } = req.query;

    // Scope the filter dropdowns to what a manager-tier user is actually allowed
    // to see, so the station list and period list don't leak other stations.
    const scope = await resolveManagerScope(req.user);
    let scopedDateFloor: string | undefined;
    if (scope) {
      applyManagerStationScope(baseMatch, scope, {});
      scopedDateFloor = scope.dateFloor;
    }

    const applyDateFloor = (m: any) => {
      if (!scopedDateFloor) return;
      m.date = m.date || {};
      const existingFrom = m.date.$gte as string | undefined;
      m.date.$gte = existingFrom && existingFrom > scopedDateFloor ? existingFrom : scopedDateFloor;
    };

    // Period list is global (not scoped by dateFrom/dateTo) so the month picker
    // always shows every month that has data — same pattern as DO management.
    // dateFrom/dateTo below only narrows the station dropdown.
    const periodsMatch: any = { ...baseMatch };
    applyDateFloor(periodsMatch);

    const periodResults = await LPOSummary.aggregate([
      { $match: periodsMatch },
      {
        $group: {
          _id: {
            year: { $toInt: { $substr: ['$date', 0, 4] } },
            month: { $toInt: { $substr: ['$date', 5, 2] } },
          },
        },
      },
      { $sort: { '_id.year': -1, '_id.month': -1 } },
    ]);

    const seen = new Map<string, { year: number; month: number }>();
    for (const r of periodResults) {
      if (r._id.year && r._id.month) {
        seen.set(`${r._id.year}-${r._id.month}`, { year: r._id.year, month: r._id.month });
      }
    }
    const now = new Date();
    const curKey = `${now.getFullYear()}-${now.getMonth() + 1}`;
    if (!seen.has(curKey)) seen.set(curKey, { year: now.getFullYear(), month: now.getMonth() + 1 });
    const periods = Array.from(seen.values()).sort((a, b) =>
      b.year !== a.year ? b.year - a.year : b.month - a.month
    );
    const stationsMatch: any = { ...baseMatch };
    // Preserve the "non-empty station" guard without clobbering a scoped station filter.
    if (!stationsMatch.station) stationsMatch.station = { $nin: [null, ''] };
    if (dateFrom || dateTo) {
      stationsMatch.date = {};
      if (dateFrom) stationsMatch.date.$gte = (dateFrom as string).substring(0, 10);
      if (dateTo) stationsMatch.date.$lte = (dateTo as string).substring(0, 10);
    }
    applyDateFloor(stationsMatch);
    const rawStations = await LPOSummary.distinct('station', stationsMatch) as string[];
    const stations = rawStations
      .filter(s => s && s.trim())
      .map(s => s.trim().toUpperCase())
      .filter((v, i, arr) => arr.indexOf(v) === i)
      .sort();

    const includeCustom = scope?.includeCustomZambia === true;
    const regularSet = new Set(
      (scope?.allowedStations && scope.allowedStations.length > 0
        ? scope.allowedStations
        : [
            'INFINITY', 'LAKE CHILABOMBWE', 'LAKE NDOLA', 'LAKE KAPIRI', 'LAKE KITWE',
            'LAKE KABANGWA', 'LAKE CHINGOLA', 'LAKE TUNDUMA', 'GBP MOROGORO', 'GBP KANGE', 'GPB KANGE',
          ].filter((s) => !DEFAULT_SUPER_MANAGER_EXCLUDED.includes(s))
      ).map((s) => s.toUpperCase().trim())
    );
    const regularStations = [...regularSet].sort();
    const customStations = includeCustom
      ? stations.filter((s) => !regularSet.has(s) && s !== 'CASH' && s !== 'CUSTOM')
      : [];

    res.json({
      periods,
      stations,
      regularStations,
      customStations,
      customZambiaEnabled: includeCustom,
    });
  } catch (error) {
    logger.error('Error fetching LPO entry filters:', error);
    throw new ApiError(500, 'Failed to fetch available filters');
  }
};

/**
 * Download a single LPO document as a server-generated PDF.
 * Matches the layout of the former frontend canvas-based LPO PDF.
 */
export const downloadLPOPDF = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const lpoSummary = await LPOSummary.findOne({ _id: id, isDeleted: false }).lean();
    if (!lpoSummary) {
      throw new ApiError(404, 'LPO document not found');
    }

    const { generateLPOPDF, getCompanyBranding } = await import('../utils/pdfGenerator');

    const branding = await getCompanyBranding();

    // Look up approvedBy from DriverAccountEntry (used for driver-account LPOs)
    let approvedBy: string | undefined;
    const hasDriverAccount = lpoSummary.entries.some((e: any) => e.isDriverAccount);
    if (hasDriverAccount) {
      const daEntry = await DriverAccountEntry.findOne({
        lpoNo: lpoSummary.lpoNo,
        approvedBy: { $exists: true, $ne: '' },
        isDeleted: false,
      }).select('approvedBy').lean();
      approvedBy = (daEntry as any)?.approvedBy;
    }
    // Fall back to LPO's own approvedBy if not from driver account
    if (!approvedBy && (lpoSummary as any).approvedBy) {
      approvedBy = (lpoSummary as any).approvedBy;
    }

    // Fetch station supplier info for PDF
    let stationInfo: { supplierName?: string; supplierAddress?: string; supplierPlotNo?: string; supplierPoBox?: string; description?: string } | undefined;
    if (lpoSummary.station && lpoSummary.station !== 'CASH' && lpoSummary.station !== 'CUSTOM') {
      const stationConfig = await FuelStationConfig.findOne({ stationName: lpoSummary.station, isActive: true }).select('supplierName supplierAddress supplierPlotNo supplierPoBox description').lean();
      if (stationConfig) {
        stationInfo = {
          supplierName: (stationConfig as any).supplierName,
          supplierAddress: (stationConfig as any).supplierAddress,
          supplierPlotNo: (stationConfig as any).supplierPlotNo,
          supplierPoBox: (stationConfig as any).supplierPoBox,
          description: (stationConfig as any).description,
        };
      }
    }

    const preparedBy = req.user?.username;
    const doc = generateLPOPDF(lpoSummary as any, branding, preparedBy, approvedBy, stationInfo);

    const dateStr = new Date().toISOString().split('T')[0];
    const filename = `LPO-${lpoSummary.lpoNo}-${dateStr}.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    doc.pipe(res);
    doc.end();

    logger.info(`LPO PDF downloaded: ${lpoSummary.lpoNo} by ${req.user?.username}`);
  } catch (error: any) {
    throw error;
  }
};

/**
 * Load flat LPO entries for summary export (LPOSummary flag-only; no DA side collection).
 */
async function loadLpoEntriesForSummaryExport(opts: {
  dateFrom: string;
  dateTo: string;
  stations?: string[];
}): Promise<any[]> {
  const startDate = new Date(`${opts.dateFrom}T00:00:00.000Z`);
  const endDate = new Date(`${opts.dateTo}T23:59:59.999Z`);

  let all = await unifiedExportService.getAllLPOEntries({ startDate, endDate });

  if (opts.stations && opts.stations.length > 0) {
    const set = new Set(opts.stations.map((s) => s.trim().toUpperCase()).filter(Boolean));
    all = all.filter((e) => set.has(String(e.dieselAt || e.station || '').trim().toUpperCase()));
  }

  all.sort((a, b) => {
    const dateCompare = String(a.date || '').localeCompare(String(b.date || ''));
    if (dateCompare !== 0) return dateCompare;
    return String(a.lpoNo || '').localeCompare(String(b.lpoNo || ''));
  });

  return all;
}

function parseStationsQuery(raw: unknown): string[] | undefined {
  if (!raw) return undefined;
  const list = String(raw)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return list.length > 0 ? list : undefined;
}

/**
 * Aggregate LPO Monthly Summary metrics server-side.
 * Query: dateFrom, dateTo, stations (comma-separated optional)
 */
export const getSummaryAggregate = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const dateFrom = req.query.dateFrom ? String(req.query.dateFrom).substring(0, 10) : '';
    const dateTo = req.query.dateTo ? String(req.query.dateTo).substring(0, 10) : '';
    if (!dateFrom || !dateTo) {
      throw new ApiError(400, 'dateFrom and dateTo are required');
    }

    const stations = parseStationsQuery(req.query.stations);
    const entries = await loadLpoEntriesForSummaryExport({ dateFrom, dateTo, stations });

    let totalLiters = 0;
    let totalLitersTZS = 0;
    let totalLitersUSD = 0;
    let totalAmountTZS = 0;
    let totalAmountUSD = 0;
    let driverAccountCount = 0;
    let referCount = 0;
    const byStation: Record<string, { lpos: number; liters: number; amount: number }> = {};
    const byDestination: Record<string, number> = {};

    for (const e of entries) {
      const liters = e.ltrs ?? e.liters ?? 0;
      const rate = e.pricePerLtr ?? e.rate ?? 0;
      const amount = liters * rate;
      const station = e.dieselAt || e.station || 'UNKNOWN';
      const dest = e.destinations || e.dest || 'UNKNOWN';
      const currency = getCurrencyFromStation(station);

      totalLiters += liters;
      if (currency === 'USD') {
        totalAmountUSD += amount;
        totalLitersUSD += liters;
      } else {
        totalAmountTZS += amount;
        totalLitersTZS += liters;
      }
      if (e.isDriverAccount) driverAccountCount += 1;
      if (e.isRefer) referCount += 1;

      if (!byStation[station]) byStation[station] = { lpos: 0, liters: 0, amount: 0 };
      byStation[station].lpos += 1;
      byStation[station].liters += liters;
      byStation[station].amount += amount;
      byDestination[dest] = (byDestination[dest] || 0) + 1;
    }

    const totalAmount = totalAmountTZS + totalAmountUSD;
    const totalLPOs = entries.length;

    res.json({
      totalLPOs,
      totalLiters,
      totalAmount,
      totalAmountTZS,
      totalAmountUSD,
      avgPricePerLiter: totalLiters > 0 ? totalAmount / totalLiters : 0,
      avgPricePerLiterTZS: totalLitersTZS > 0 ? totalAmountTZS / totalLitersTZS : 0,
      avgPricePerLiterUSD: totalLitersUSD > 0 ? totalAmountUSD / totalLitersUSD : 0,
      driverAccountCount,
      referCount,
      regularLPOCount: totalLPOs - driverAccountCount,
      byStation,
      byDestination,
    });
  } catch (error: any) {
    if (error instanceof ApiError) throw error;
    logger.error('Error aggregating LPO summary:', error);
    throw new ApiError(500, 'Failed to aggregate LPO summary');
  }
};

/**
 * Return all flat LPO entries for Summary Detailed view (one server query).
 * Query: dateFrom, dateTo, stations
 */
export const getSummaryEntries = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const dateFrom = req.query.dateFrom ? String(req.query.dateFrom).substring(0, 10) : '';
    const dateTo = req.query.dateTo ? String(req.query.dateTo).substring(0, 10) : '';
    if (!dateFrom || !dateTo) {
      throw new ApiError(400, 'dateFrom and dateTo are required');
    }

    const entries = await loadLpoEntriesForSummaryExport({
      dateFrom,
      dateTo,
      stations: parseStationsQuery(req.query.stations),
    });

    res.json({
      success: true,
      data: entries,
      count: entries.length,
    });
  } catch (error: any) {
    if (error instanceof ApiError) throw error;
    logger.error('Error fetching LPO summary entries:', error);
    throw new ApiError(500, 'Failed to fetch LPO summary entries');
  }
};

/**
 * Export LPO Monthly Summary — single month sheet.
 * Query: year=2026&month=Oct&stations=A,B&dateFrom=&dateTo=
 */
export const exportSummaryMonth = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const year = parseInt(String(req.query.year || ''), 10);
    const month = String(req.query.month || '').trim();
    if (isNaN(year) || !month || !MONTH_ABBR.includes(month)) {
      throw new ApiError(400, 'year and month (Jan..Dec) are required');
    }

    const monthRange = monthAbbrToRange(month, year);
    if (!monthRange) throw new ApiError(400, 'Invalid month/year');

    let { dateFrom, dateTo } = monthRange;
    const qFrom = req.query.dateFrom ? String(req.query.dateFrom).substring(0, 10) : '';
    const qTo = req.query.dateTo ? String(req.query.dateTo).substring(0, 10) : '';
    if (qFrom && qFrom > dateFrom) dateFrom = qFrom;
    if (qTo && qTo < dateTo) dateTo = qTo;

    const entries = await loadLpoEntriesForSummaryExport({
      dateFrom,
      dateTo,
      stations: parseStationsQuery(req.query.stations),
    });

    if (entries.length === 0) {
      throw new ApiError(404, 'No LPO entries found for the selected month');
    }

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Fuel Order System';
    workbook.created = new Date();
    addLpoSummaryMonthSheet(workbook, `${month}_${year}`, entries);

    const filename = `LPO_Summary_${month}_${year}.xlsx`;
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    await workbook.xlsx.write(res);

    await AuditService.log({
      userId: req.user?.userId,
      username: req.user?.username || 'system',
      action: 'EXPORT',
      resourceType: 'LPOSummary',
      resourceId: `${month}_${year}`,
      details: `LPO summary month export (${entries.length} rows) by ${req.user?.username}`,
      ipAddress: req.ip,
      severity: 'low',
    }).catch(() => {});

    res.end();
    logger.info(`LPO summary month ${month} ${year} exported by ${req.user?.username}`);
  } catch (error: any) {
    if (error instanceof ApiError) {
      if (!res.headersSent) res.status(error.statusCode).json({ error: error.message });
    } else {
      logger.error('Error exporting LPO summary month:', error);
      if (!res.headersSent) res.status(500).json({ error: 'Failed to export LPO summary' });
    }
  }
};

/**
 * Export LPO Monthly Summary — full year (one sheet per month + year summary).
 * Query: year=2026&stations=A,B&dateFrom=&dateTo=
 */
export const exportSummaryYear = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const year = parseInt(String(req.query.year || ''), 10);
    if (isNaN(year)) throw new ApiError(400, 'year is required');

    let dateFrom = `${year}-01-01`;
    let dateTo = `${year}-12-31`;
    const qFrom = req.query.dateFrom ? String(req.query.dateFrom).substring(0, 10) : '';
    const qTo = req.query.dateTo ? String(req.query.dateTo).substring(0, 10) : '';
    if (qFrom && qFrom > dateFrom) dateFrom = qFrom;
    if (qTo && qTo < dateTo) dateTo = qTo;

    const entries = await loadLpoEntriesForSummaryExport({
      dateFrom,
      dateTo,
      stations: parseStationsQuery(req.query.stations),
    });

    if (entries.length === 0) {
      throw new ApiError(404, 'No LPO entries found for the selected year');
    }

    const byMonth = new Map<string, any[]>();
    for (const entry of entries) {
      const mon = monthAbbrFromDate(entry.date);
      if (!mon) continue;
      if (!byMonth.has(mon)) byMonth.set(mon, []);
      byMonth.get(mon)!.push(entry);
    }

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Fuel Order System';
    workbook.created = new Date();

    for (const month of MONTH_ABBR) {
      const monthEntries = byMonth.get(month);
      if (!monthEntries || monthEntries.length === 0) continue;
      addLpoSummaryMonthSheet(workbook, `${month}_${year}`, monthEntries);
    }
    addLpoYearSummarySheet(workbook, year, byMonth);

    const filename = `LPO_Summary_${year}.xlsx`;
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    await workbook.xlsx.write(res);

    await AuditService.log({
      userId: req.user?.userId,
      username: req.user?.username || 'system',
      action: 'EXPORT',
      resourceType: 'LPOSummary',
      resourceId: String(year),
      details: `LPO summary year export (${entries.length} rows) by ${req.user?.username}`,
      ipAddress: req.ip,
      severity: 'low',
    }).catch(() => {});

    res.end();
    logger.info(`LPO summary year ${year} exported by ${req.user?.username}`);
  } catch (error: any) {
    if (error instanceof ApiError) {
      if (!res.headersSent) res.status(error.statusCode).json({ error: error.message });
    } else {
      logger.error('Error exporting LPO summary year:', error);
      if (!res.headersSent) res.status(500).json({ error: 'Failed to export LPO summary' });
    }
  }
};
