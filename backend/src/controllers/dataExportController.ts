import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import * as XLSX from 'xlsx';
import { ApiError } from '../middleware/errorHandler';
import logger from '../utils/logger';
import AuditService from '../utils/auditService';
import {
  getAllFuelRecords,
  getAllLPOEntries,
  getAllLPOSummaries,
  getAllYardFuelDispenses,
  getAllDeliveryOrders,
} from '../services/unifiedExportService';
import { User } from '../models/User';
import { AuditLog } from '../models/AuditLog';

// ─── Types ─────────────────────────────────────────────────────────────────────

export type ExportResource =
  | 'fuel_records'
  | 'delivery_orders'
  | 'lpo_entries'
  | 'lpo_summaries'
  | 'yard_fuel'
  | 'users'
  | 'audit_logs';

export type ExportFormat = 'json' | 'csv' | 'xlsx';

const RESOURCES: { id: ExportResource; label: string; description: string }[] = [
  { id: 'fuel_records',     label: 'Fuel Records',         description: 'All active & archived fuel dispensing records' },
  { id: 'delivery_orders',  label: 'Delivery Orders',      description: 'All delivery order records' },
  { id: 'lpo_entries',      label: 'LPO Entries',          description: 'Local Purchase Order line entries' },
  { id: 'lpo_summaries',    label: 'LPO Summaries',        description: 'Local Purchase Order summary documents' },
  { id: 'yard_fuel',        label: 'Yard Fuel Dispenses',  description: 'Internal yard fuel dispensing records' },
  { id: 'users',            label: 'Users',                description: 'User accounts (passwords excluded)' },
  { id: 'audit_logs',       label: 'Audit Logs',           description: 'System audit event log' },
];

// ─── List available resources ──────────────────────────────────────────────────

export const listResources = async (_req: AuthRequest, res: Response): Promise<void> => {
  res.status(200).json({ success: true, data: RESOURCES });
};

// ─── Fetch data helper ─────────────────────────────────────────────────────────

async function fetchData(resource: ExportResource, from?: Date, to?: Date): Promise<any[]> {
  const opts = { from, to, includeArchived: true };

  switch (resource) {
    case 'fuel_records':
      return getAllFuelRecords(opts);
    case 'delivery_orders':
      return getAllDeliveryOrders(opts);
    case 'lpo_entries':
      return getAllLPOEntries(opts);
    case 'lpo_summaries':
      return getAllLPOSummaries(opts);
    case 'yard_fuel':
      return getAllYardFuelDispenses(opts);
    case 'users': {
      const users = await User.find({}, { password: 0, __v: 0 }).lean();
      return users;
    }
    case 'audit_logs': {
      const filter: Record<string, any> = {};
      if (from || to) {
        filter.timestamp = {};
        if (from) filter.timestamp.$gte = from;
        if (to) filter.timestamp.$lte = to;
      }
      return AuditLog.find(filter).sort({ timestamp: -1 }).limit(50_000).lean();
    }
    default:
      throw new ApiError(400, `Unknown resource: ${resource}`);
  }
}

// ─── Flatten nested object for CSV/XLSX ───────────────────────────────────────

function flatten(obj: any, prefix = ''): Record<string, string | number | boolean | null> {
  const result: Record<string, any> = {};
  for (const [k, v] of Object.entries(obj ?? {})) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Date)) {
      Object.assign(result, flatten(v, key));
    } else if (Array.isArray(v)) {
      result[key] = v.join(', ');
    } else {
      result[key] = v as any;
    }
  }
  return result;
}

// ─── Export endpoint ───────────────────────────────────────────────────────────

/**
 * POST /api/v1/system-admin/data-export
 * Body: { resource, format, from?, to? }
 */
export const exportData = async (req: AuthRequest, res: Response): Promise<void> => {
  const { resource, format = 'json', from: fromStr, to: toStr } = req.body as {
    resource: ExportResource;
    format?: ExportFormat;
    from?: string;
    to?: string;
  };

  if (!resource) throw new ApiError(400, '"resource" is required');
  if (!RESOURCES.find((r) => r.id === resource)) throw new ApiError(400, `Unknown resource: "${resource}"`);
  if (!['json', 'csv', 'xlsx'].includes(format)) throw new ApiError(400, 'format must be json, csv, or xlsx');

  const from = fromStr ? new Date(fromStr) : undefined;
  const to = toStr ? new Date(toStr) : undefined;

  logger.info(`Data export requested: resource=${resource} format=${format} by ${req.user?.username}`);

  AuditService.log({
    action: 'CONFIG_CHANGE',
    userId: req.user?.userId as string,
    username: req.user?.username as string,
    resourceType: resource,
    details: `Data export: ${resource} as ${format}${from ? ` from ${from.toISOString()}` : ''}${to ? ` to ${to.toISOString()}` : ''}`,
    severity: 'medium',
    ipAddress: req.ip,
  });

  const rows = await fetchData(resource, from, to);
  const filename = `${resource}_${Date.now()}`;

  if (format === 'json') {
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}.json"`);
    res.status(200).json(rows);
    return;
  }

  const flatRows = rows.map((row) => flatten(row));

  if (format === 'csv') {
    if (flatRows.length === 0) {
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}.csv"`);
      res.status(200).send('');
      return;
    }
    const headers = Object.keys(flatRows[0]);
    const escape = (v: any) => {
      const s = String(v ?? '').replace(/"/g, '""');
      return /[",\n\r]/.test(s) ? `"${s}"` : s;
    };
    const csvLines = [
      headers.map(escape).join(','),
      ...flatRows.map((row) => headers.map((h) => escape(row[h])).join(',')),
    ];
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}.csv"`);
    res.status(200).send(csvLines.join('\r\n'));
    return;
  }

  // XLSX
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(flatRows);
  XLSX.utils.book_append_sheet(wb, ws, resource.substring(0, 31));
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}.xlsx"`);
  res.status(200).send(buf);
};
