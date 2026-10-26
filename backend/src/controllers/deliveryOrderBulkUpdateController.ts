import { Response } from 'express';
import mongoose from 'mongoose';
import { randomUUID } from 'crypto';
import { validationResult } from 'express-validator';
import { DeliveryOrder, EditLock } from '../models';
import { ApiError } from '../middleware/errorHandler';
import { AuthRequest } from '../middleware/auth';
import { deliveryOrderValidation } from '../middleware/validation';
import { AuditService } from '../utils/auditService';
import { logger } from '../utils';
import { acquireLock, releaseLock, getDisplayName } from '../services/lockService';
import { emitLockChange } from '../services/websocket';
import { updateDeliveryOrder } from './deliveryOrderController';
import { inspectDirectionFlipImpacts, type DirectionFlipImpact } from '../services/doDirectionFlipImpact';
import { inspectRouteConfig, type RouteConfigIssue } from '../services/doRouteConfigCheck';

const LOCK_COLLECTION = 'delivery_orders';
export const BULK_UPDATE_MAX_IDS = 200;

/** Fields a bulk edit may change. Anything else in the request is ignored. */
export const BULK_EDITABLE_FIELDS = [
  'loadingPoint',
  'destination',
  'ratePerTon',
  'rateType',
  'clientName',
  'haulier',
  'importOrExport',
] as const;
type BulkField = typeof BULK_EDITABLE_FIELDS[number];

export type BulkItemStatus = 'updated' | 'unchanged' | 'skipped' | 'failed';

export interface BulkItemResult {
  id: string;
  doNumber?: string;
  doType?: string;
  status: BulkItemStatus;
  message: string;
  changes?: Array<{ field: string; oldValue: any; newValue: any }>;
  cascadeMessage?: string;
}

function normalizeRequestedFields(raw: any): Partial<Record<BulkField, any>> {
  const out: Partial<Record<BulkField, any>> = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const field of BULK_EDITABLE_FIELDS) {
    if (raw[field] === undefined || raw[field] === null) continue;
    if (field === 'ratePerTon') {
      out.ratePerTon = Number(raw.ratePerTon);
    } else if (field === 'importOrExport') {
      out.importOrExport = String(raw.importOrExport).trim().toUpperCase();
    } else {
      out[field] = String(raw[field]).trim();
    }
  }
  return out;
}

function assertValidFields(fields: Partial<Record<BulkField, any>>): void {
  for (const field of ['loadingPoint', 'destination', 'clientName'] as const) {
    if (fields[field] !== undefined && !fields[field]) {
      throw new ApiError(400, `${field} cannot be empty`);
    }
  }
  if (fields.ratePerTon !== undefined && (!Number.isFinite(fields.ratePerTon) || fields.ratePerTon < 0)) {
    throw new ApiError(400, 'Rate must be a non-negative number');
  }
  if (fields.rateType !== undefined && !['per_ton', 'fixed_total'].includes(fields.rateType)) {
    throw new ApiError(400, 'Rate type must be per_ton or fixed_total');
  }
  if (fields.importOrExport !== undefined && !['IMPORT', 'EXPORT'].includes(fields.importOrExport)) {
    throw new ApiError(400, 'Direction must be IMPORT or EXPORT');
  }
}

function sameValue(field: BulkField, current: any, next: any): boolean {
  if (field === 'ratePerTon') return Number(current ?? 0) === Number(next);
  if (field === 'rateType') return String(current || 'per_ton') === String(next);
  return String(current ?? '').trim() === String(next ?? '').trim();
}

/**
 * Runs the regular single-DO update handler against a synthetic request so a
 * bulk item goes through the exact same validation, role field policy, edit
 * history, audit log, fuel/LPO cascades and realtime emits as a manual edit.
 */
async function runSingleUpdate(
  req: AuthRequest,
  id: string,
  body: Record<string, any>,
  bulkOperationId: string
): Promise<{ status: number; payload: any }> {
  const subReq: any = {
    params: { id },
    query: {},
    body,
    user: req.user,
    ip: req.ip,
    headers: req.headers,
    get: (name: string) => req.get?.(name),
    bulkOperationId,
  };

  for (const chain of deliveryOrderValidation.update) {
    await chain.run(subReq);
  }
  const errors = validationResult(subReq);
  if (!errors.isEmpty()) {
    const message = errors
      .array()
      .map((e: any) => e.msg)
      .join('; ');
    throw new ApiError(400, `Validation failed: ${message}`);
  }

  let statusCode = 200;
  let payload: any = null;
  const subRes: any = {
    status(code: number) {
      statusCode = code;
      return subRes;
    },
    json(data: any) {
      payload = data;
      return subRes;
    },
  };

  await updateDeliveryOrder(subReq as AuthRequest, subRes as Response);
  return { status: statusCode, payload };
}

function parseBulkRequest(req: AuthRequest): {
  ids: string[];
  fields: Partial<Record<BulkField, any>>;
  userReason: string;
} {
  const rawIds: unknown = req.body?.ids;
  if (!Array.isArray(rawIds) || rawIds.length === 0) {
    throw new ApiError(400, 'Select at least one delivery order');
  }
  const ids = Array.from(new Set(rawIds.map((v) => String(v).trim()).filter(Boolean)));
  if (ids.length > BULK_UPDATE_MAX_IDS) {
    throw new ApiError(400, `You can bulk edit at most ${BULK_UPDATE_MAX_IDS} delivery orders at a time`);
  }
  const invalidId = ids.find((id) => !mongoose.Types.ObjectId.isValid(id));
  if (invalidId) throw new ApiError(400, `Invalid delivery order id: ${invalidId}`);

  const fields = normalizeRequestedFields(req.body?.fields);
  if (Object.keys(fields).length === 0) {
    throw new ApiError(400, 'Choose at least one field to change');
  }
  assertValidFields(fields);

  const userReason = typeof req.body?.editReason === 'string' ? req.body.editReason.trim() : '';
  if (userReason.length > 500) {
    throw new ApiError(400, 'Edit reason must be 500 characters or fewer');
  }
  return { ids, fields, userReason };
}

async function loadBulkOrders(ids: string[]): Promise<Map<string, any>> {
  const orders = await DeliveryOrder.find({ _id: { $in: ids }, isDeleted: false })
    .select('_id doNumber doType truckNo isCancelled updatedAt ' + BULK_EDITABLE_FIELDS.join(' '))
    .lean();
  return new Map(orders.map((o: any) => [String(o._id), o]));
}

function diffOrder(order: any, fields: Partial<Record<BulkField, any>>): Record<string, any> {
  const diff: Record<string, any> = {};
  for (const [field, value] of Object.entries(fields) as Array<[BulkField, any]>) {
    if (!sameValue(field, order[field], value)) diff[field] = value;
  }
  return diff;
}

/** Impact of a direction switch for each non-cancelled DO whose direction would actually change. */
async function loadFlipImpacts(
  orderById: Map<string, any>,
  fields: Partial<Record<BulkField, any>>
): Promise<Map<string, DirectionFlipImpact>> {
  if (!fields.importOrExport) return new Map();
  const flippingOrders = Array.from(orderById.values()).filter(
    (o: any) => !o.isCancelled && !sameValue('importOrExport', o.importOrExport, fields.importOrExport)
  );
  if (flippingOrders.length === 0) return new Map();
  return inspectDirectionFlipImpacts(flippingOrders, fields.importOrExport);
}

/** Non-cancelled DOs whose changed route (for their post-edit direction) is not configured. */
async function loadRouteIssues(
  orderById: Map<string, any>,
  fields: Partial<Record<BulkField, any>>
): Promise<Map<string, RouteConfigIssue>> {
  const entries = Array.from(orderById.values())
    .filter((o: any) => !o.isCancelled)
    .map((order: any) => ({ order, changes: diffOrder(order, fields) }));
  return inspectRouteConfig(entries);
}

export interface BulkPreviewItem {
  id: string;
  doNumber?: string;
  doType?: string;
  truckNo?: string;
  status: 'will_change' | 'unchanged' | 'skipped';
  message: string;
  changes?: Array<{ field: string; oldValue: any; newValue: any }>;
  flipImpact?: DirectionFlipImpact;
  routeIssue?: RouteConfigIssue;
}

/**
 * POST /delivery-orders/bulk-update/preview
 * Same body as bulk-update. Read-only: reports what each DO would change, for
 * direction switches the fuel journey / pending placeholder / LPO lines / issued
 * liters the switch would affect, and DOs whose new route is not configured.
 */
export const previewBulkUpdateDeliveryOrders = async (req: AuthRequest, res: Response): Promise<void> => {
  if (!req.user?.username) throw new ApiError(401, 'Authentication required');
  const { ids, fields } = parseBulkRequest(req);
  const orderById = await loadBulkOrders(ids);
  const [flipImpacts, routeIssues] = await Promise.all([
    loadFlipImpacts(orderById, fields),
    loadRouteIssues(orderById, fields),
  ]);

  const items: BulkPreviewItem[] = ids.map((id) => {
    const order: any = orderById.get(id);
    if (!order) return { id, status: 'skipped', message: 'Delivery order not found' };
    const base = { id, doNumber: order.doNumber, doType: order.doType, truckNo: order.truckNo };
    if (order.isCancelled) {
      return { ...base, status: 'skipped', message: 'Cancelled delivery orders cannot be edited' };
    }
    const diff = diffOrder(order, fields);
    if (Object.keys(diff).length === 0) {
      return { ...base, status: 'unchanged', message: 'Already has the requested values' };
    }
    return {
      ...base,
      status: 'will_change',
      message: 'Will be updated',
      changes: Object.keys(diff).map((field) => ({ field, oldValue: order[field], newValue: diff[field] })),
      flipImpact: diff.importOrExport ? flipImpacts.get(order.doNumber) : undefined,
      routeIssue: routeIssues.get(order.doNumber),
    };
  });

  const summary = {
    requested: ids.length,
    willChange: items.filter((i) => i.status === 'will_change').length,
    unchanged: items.filter((i) => i.status === 'unchanged').length,
    skipped: items.filter((i) => i.status === 'skipped').length,
    needsConfirmation: items.filter((i) => i.flipImpact?.requiresConfirmation).length,
    revivesPending: items.filter((i) => i.flipImpact?.pendingToRevive).length,
    routeNotConfigured: items.filter((i) => i.routeIssue).length,
  };

  res.status(200).json({ success: true, data: { summary, items } });
};

/**
 * POST /delivery-orders/bulk-update
 * Body: { ids: string[], fields: { loadingPoint?, destination?, ratePerTon?, rateType?,
 *         clientName?, haulier?, importOrExport? }, editReason?: string,
 *         confirmFuelImpact?: boolean, confirmMissingRoutes?: boolean }
 *
 * A direction switch touching journeys with LPO lines / issued fuel returns 409
 * FLIP_FUEL_IMPACT_CONFIRMATION_REQUIRED unless confirmFuelImpact is true.
 * A loading point / destination / direction change onto a route that is not
 * configured returns 409 ROUTE_NOT_CONFIGURED_CONFIRMATION_REQUIRED unless
 * confirmMissingRoutes is true.
 *
 * Each DO is updated independently (its own lock + transaction) so one failure
 * does not block the rest. Returns a per-DO result list.
 */
export const bulkUpdateDeliveryOrders = async (req: AuthRequest, res: Response): Promise<void> => {
  const username = req.user?.username;
  if (!username) throw new ApiError(401, 'Authentication required');

  const { ids, fields, userReason } = parseBulkRequest(req);
  const bulkId = randomUUID();
  const editReason = userReason ? `Bulk edit: ${userReason}` : 'Bulk edit';

  const orderById = await loadBulkOrders(ids);

  // A direction switch on DOs whose current journey already has LPO lines or issued
  // fuel must be explicitly acknowledged ("proceed anyway") before anything runs.
  const flipImpacts = await loadFlipImpacts(orderById, fields);
  const flaggedImpacts = Array.from(flipImpacts.values()).filter((i) => i.requiresConfirmation);
  const fuelImpactConfirmed = req.body?.confirmFuelImpact === true;
  if (flaggedImpacts.length > 0 && !fuelImpactConfirmed) {
    throw new ApiError(
      409,
      `${flaggedImpacts.length} delivery order(s) have LPO lines or issued fuel on the journey that the direction change affects. Confirm to proceed anyway.`
    ).withData({
      code: 'FLIP_FUEL_IMPACT_CONFIRMATION_REQUIRED',
      flagged: flaggedImpacts,
    });
  }

  // Routes missing from the configuration go through the normal lock + notification
  // flow on save, but in bulk the user must acknowledge them first.
  const routeIssues = Array.from((await loadRouteIssues(orderById, fields)).values());
  const missingRoutesConfirmed = req.body?.confirmMissingRoutes === true;
  if (routeIssues.length > 0 && !missingRoutesConfirmed) {
    throw new ApiError(
      409,
      `${routeIssues.length} delivery order(s) would move to a route that is not configured. Confirm to proceed anyway.`
    ).withData({
      code: 'ROUTE_NOT_CONFIGURED_CONFIRMATION_REQUIRED',
      flagged: routeIssues,
    });
  }

  const lockedByName = await getDisplayName(username);

  const results: BulkItemResult[] = [];

  for (const id of ids) {
    const order: any = orderById.get(id);
    if (!order) {
      results.push({ id, status: 'skipped', message: 'Delivery order not found' });
      continue;
    }
    const base = { id, doNumber: order.doNumber, doType: order.doType };

    if (order.isCancelled) {
      results.push({ ...base, status: 'skipped', message: 'Cancelled delivery orders cannot be edited' });
      continue;
    }

    const diff = diffOrder(order, fields);
    if (Object.keys(diff).length === 0) {
      results.push({ ...base, status: 'unchanged', message: 'Already has the requested values' });
      continue;
    }

    const heldBefore = await EditLock.exists({
      collectionName: LOCK_COLLECTION,
      documentId: id,
      lockedBy: username,
      lockedUntil: { $gt: new Date() },
    });

    let lockAcquired = false;
    try {
      const lock = await acquireLock(LOCK_COLLECTION, id, username, lockedByName);
      lockAcquired = true;
      emitLockChange(LOCK_COLLECTION, id, {
        lockedBy: lock.lockedBy,
        lockedByName: lock.lockedByName,
        lockedUntil: lock.lockedUntil,
      });

      const { status, payload } = await runSingleUpdate(req, id, {
        ...diff,
        editReason,
        clientUpdatedAt: order.updatedAt ? new Date(order.updatedAt).toISOString() : undefined,
      }, bulkId);

      if (status >= 400 || !payload?.success) {
        results.push({ ...base, status: 'failed', message: payload?.message || `Update failed (${status})` });
        continue;
      }

      const changes = Object.keys(diff).map((field) => ({
        field,
        oldValue: order[field],
        newValue: (payload.data as any)?.[field] ?? diff[field],
      }));
      const manualSteps: string[] = payload.cascadeResults?.importExportFlip?.manualSteps || [];
      results.push({
        ...base,
        status: 'updated',
        message: payload.message || 'Updated',
        changes,
        cascadeMessage: manualSteps.length ? manualSteps.join(' ') : undefined,
      });
    } catch (err: any) {
      const code = err?.statusCode;
      const message = err?.message || 'Update failed';
      results.push({ ...base, status: code === 423 ? 'skipped' : 'failed', message });
      if (!code || code >= 500) {
        logger.error(`[bulkUpdateDO ${bulkId}] DO ${order.doNumber} failed: ${message}`);
      }
    } finally {
      if (lockAcquired && !heldBefore) {
        try {
          if (await releaseLock(LOCK_COLLECTION, id, username)) {
            emitLockChange(LOCK_COLLECTION, id, null);
          }
        } catch (releaseErr: any) {
          logger.warn(`[bulkUpdateDO ${bulkId}] lock release failed for ${id}: ${releaseErr?.message}`);
        }
      }
    }
  }

  const summary = {
    requested: ids.length,
    updated: results.filter((r) => r.status === 'updated').length,
    unchanged: results.filter((r) => r.status === 'unchanged').length,
    skipped: results.filter((r) => r.status === 'skipped').length,
    failed: results.filter((r) => r.status === 'failed').length,
  };

  const updatedDoNumbers = results.filter((r) => r.status === 'updated').map((r) => r.doNumber);
  const outcome =
    summary.updated === 0 && summary.failed > 0
      ? 'FAILURE'
      : summary.failed > 0 || summary.skipped > 0
        ? 'PARTIAL'
        : 'SUCCESS';

  await AuditService.log({
    userId: req.user?.userId,
    username,
    action: 'BULK_OPERATION',
    resourceType: 'DeliveryOrder',
    details:
      `Bulk edit of ${ids.length} delivery order(s) — fields: ${Object.keys(fields).join(', ')}. ` +
      `Updated ${summary.updated}, unchanged ${summary.unchanged}, skipped ${summary.skipped}, failed ${summary.failed}.` +
      (updatedDoNumbers.length ? ` Updated DOs: ${updatedDoNumbers.join(', ')}` : ''),
    newValue: {
      bulkId,
      fields,
      editReason: userReason || undefined,
      fuelImpactConfirmed: flaggedImpacts.length > 0 ? true : undefined,
      fuelImpactDOs: flaggedImpacts.length > 0
        ? flaggedImpacts.map((i) => ({
            doNumber: i.doNumber,
            lpoLines: i.lpoLines.length,
            lpoLiters: i.lpoLiters,
            fuelIssuedLiters: i.fuelIssuedLiters,
          }))
        : undefined,
      missingRoutesConfirmed: routeIssues.length > 0 ? true : undefined,
      missingRouteDOs: routeIssues.length > 0
        ? routeIssues.map(({ doNumber, direction, loadingPoint, destination }) => ({
            doNumber,
            direction,
            loadingPoint,
            destination,
          }))
        : undefined,
      summary,
      items: results.map(({ id, doNumber, doType, status, message, changes }) => ({
        id,
        doNumber,
        doType,
        status,
        message,
        changes,
      })),
    },
    ipAddress: req.ip,
    correlationId: bulkId,
    outcome,
    severity: summary.updated > 10 ? 'high' : 'medium',
    tags: ['bulk', 'bulk_update', 'delivery_orders'],
  });

  logger.info(
    `[bulkUpdateDO ${bulkId}] ${username} bulk-edited DOs: ${JSON.stringify(summary)} fields=${Object.keys(fields).join(',')}`
  );

  res.status(200).json({
    success: true,
    message: `Bulk edit complete: ${summary.updated} updated, ${summary.unchanged} unchanged, ${summary.skipped} skipped, ${summary.failed} failed`,
    data: { bulkId, summary, results },
  });
};
