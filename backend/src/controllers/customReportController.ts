import { Response } from 'express';
import type { AuthRequest } from '../middleware/auth';
import { AuditLog, User, DeliveryOrder, LPOEntry, FuelRecord } from '../models';
import mongoose from 'mongoose';

const MODEL_MAP: Record<string, mongoose.Model<any>> = {
  audit_logs: AuditLog,
  users: User,
  fuel_records: FuelRecord,
};

// Try to load optional models without crashing if they don't exist
try { MODEL_MAP['delivery_orders'] = DeliveryOrder; } catch { /* optional */ }
try { MODEL_MAP['lpo_entries'] = LPOEntry; } catch { /* optional */ }

/**
 * GET /api/system-admin/custom-report/models
 */
export const getAvailableModels = async (_req: AuthRequest, res: Response): Promise<void> => {
  res.json({
    success: true,
    data: Object.entries(MODEL_MAP).map(([key, Model]) => {
      // Derive available fields from the schema paths, excluding internal Mongoose fields
      const schemaPaths = Object.keys((Model as any).schema.paths).filter(
        (p) => !p.startsWith('__') && p !== '_id'
      );
      return {
        id: key,
        key,
        label: key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
        fields: schemaPaths,
      };
    }),
  });
};

/**
 * POST /api/system-admin/custom-report/run
 * body: { model: string, filters: Record<string, string>, limit: number, sort: string, order: 'asc'|'desc' }
 */
export const runReport = async (req: AuthRequest, res: Response): Promise<void> => {
  const { model, filters = {}, limit = 100, sort = 'createdAt', order = 'desc' } = req.body;

  if (!model || !MODEL_MAP[model]) {
    res.status(400).json({ success: false, message: `Invalid model. Available: ${Object.keys(MODEL_MAP).join(', ')}` });
    return;
  }

  const clampedLimit = Math.min(Math.max(Number(limit) || 100, 1), 1000);

  // Build a safe filter object — only allow simple equality / regex string filters
  const safeFilter: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(filters)) {
    if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean') continue;
    // Escape regex special chars to prevent ReDoS
    const safe = String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    safeFilter[key] = { $regex: safe, $options: 'i' };
  }

  const sortObj: Record<string, 1 | -1> = { [String(sort)]: order === 'asc' ? 1 : -1 };

  const Model = MODEL_MAP[model];
  const [rows, total] = await Promise.all([
    Model.find(safeFilter).sort(sortObj).limit(clampedLimit).lean(),
    Model.countDocuments(safeFilter),
  ]);

  res.json({ success: true, data: { rows, total, returned: rows.length, model, limit: clampedLimit } });
};

