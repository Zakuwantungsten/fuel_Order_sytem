import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { FeatureFlag } from '../models/FeatureFlag';
import { ApiError } from '../middleware/errorHandler';
import logger from '../utils/logger';
import AuditService from '../utils/auditService';

// Default flags seeded on first request
const DEFAULT_FLAGS = [
  {
    key: 'announcements',
    name: 'Announcements',
    description: 'Show system announcements to users on the dashboard',
    isEnabled: true,
    enabledForRoles: [],
  },
  {
    key: 'ip_filter',
    name: 'IP Filter',
    description: 'Enforce IP allowlist/blocklist rules for API access',
    isEnabled: false,
    enabledForRoles: [],
  },
  {
    key: 'fuel_price_scheduling',
    name: 'Fuel Price Scheduling',
    description: 'Allow scheduling future fuel price changes',
    isEnabled: true,
    enabledForRoles: ['super_admin'],
  },
  {
    key: 'analytics_access',
    name: 'Analytics Dashboard',
    description: 'Enable the analytics/reports section for non-super-admin roles',
    isEnabled: true,
    enabledForRoles: ['admin', 'boss'],
  },
  {
    key: 'data_export',
    name: 'Data Export',
    description: 'Allow super admins to export raw data collections',
    isEnabled: true,
    enabledForRoles: ['super_admin'],
  },
  {
    key: 'driver_portal',
    name: 'Driver Portal',
    description: 'Show the driver self-service portal',
    isEnabled: true,
    enabledForRoles: [],
  },
];

async function seedDefaultFlags(updatedBy: string) {
  for (const flag of DEFAULT_FLAGS) {
    await FeatureFlag.findOneAndUpdate(
      { key: flag.key },
      { $setOnInsert: { ...flag, updatedBy } },
      { upsert: true, new: false }
    );
  }
}

/**
 * GET /api/v1/system-admin/feature-flags
 */
export const listFlags = async (req: AuthRequest, res: Response): Promise<void> => {
  await seedDefaultFlags(req.user?.username ?? 'system');
  const flags = await FeatureFlag.find().sort({ key: 1 }).lean();
  res.status(200).json({ success: true, data: flags });
};

/**
 * PATCH /api/v1/system-admin/feature-flags/:key/toggle
 */
export const toggleFlag = async (req: AuthRequest, res: Response): Promise<void> => {
  const flag = await FeatureFlag.findOne({ key: req.params.key });
  if (!flag) throw new ApiError(404, `Feature flag "${req.params.key}" not found`);

  flag.isEnabled = !flag.isEnabled;
  flag.updatedBy = req.user?.username ?? 'unknown';
  await flag.save();

  AuditService.log({
    action: 'CONFIG_CHANGE',
    userId: req.user?.userId as string,
    username: req.user?.username as string,
    resourceType: 'feature_flag',
    resourceId: flag.key,
    details: `Feature flag "${flag.name}" ${flag.isEnabled ? 'enabled' : 'disabled'}`,
    severity: 'medium',
    ipAddress: req.ip,
  });

  logger.info(`Feature flag "${flag.key}" set to ${flag.isEnabled} by ${req.user?.username}`);
  res.status(200).json({ success: true, data: flag });
};

/**
 * PUT /api/v1/system-admin/feature-flags/:key
 * Update name, description, enabledForRoles, and/or isEnabled.
 */
export const updateFlag = async (req: AuthRequest, res: Response): Promise<void> => {
  const { name, description, isEnabled, enabledForRoles } = req.body;
  const flag = await FeatureFlag.findOne({ key: req.params.key });
  if (!flag) throw new ApiError(404, `Feature flag "${req.params.key}" not found`);

  if (name !== undefined) flag.name = String(name).trim();
  if (description !== undefined) flag.description = String(description).trim();
  if (isEnabled !== undefined) flag.isEnabled = Boolean(isEnabled);
  if (Array.isArray(enabledForRoles)) flag.enabledForRoles = enabledForRoles;
  flag.updatedBy = req.user?.username ?? 'unknown';
  await flag.save();

  AuditService.log({
    action: 'UPDATE',
    userId: req.user?.userId as string,
    username: req.user?.username as string,
    resourceType: 'feature_flag',
    resourceId: flag.key,
    details: `Feature flag "${flag.name}" updated`,
    severity: 'low',
    ipAddress: req.ip,
  });

  res.status(200).json({ success: true, data: flag });
};

/**
 * POST /api/v1/system-admin/feature-flags
 * Create a custom feature flag.
 */
export const createFlag = async (req: AuthRequest, res: Response): Promise<void> => {
  const { key, name, description, isEnabled = false, enabledForRoles = [] } = req.body;
  if (!key || !name) throw new ApiError(400, '"key" and "name" are required');

  const normalized = String(key).toLowerCase().replace(/[^a-z0-9_]/g, '_');
  const existing = await FeatureFlag.findOne({ key: normalized });
  if (existing) throw new ApiError(409, `A flag with key "${normalized}" already exists`);

  const flag = await FeatureFlag.create({
    key: normalized,
    name: String(name).trim(),
    description: String(description ?? '').trim(),
    isEnabled: Boolean(isEnabled),
    enabledForRoles: Array.isArray(enabledForRoles) ? enabledForRoles : [],
    updatedBy: req.user?.username ?? 'unknown',
  });

  AuditService.log({
    action: 'CREATE',
    userId: req.user?.userId as string,
    username: req.user?.username as string,
    resourceType: 'feature_flag',
    resourceId: flag.key,
    details: `Feature flag "${flag.name}" created`,
    severity: 'low',
    ipAddress: req.ip,
  });

  res.status(201).json({ success: true, data: flag });
};

/**
 * DELETE /api/v1/system-admin/feature-flags/:key
 */
export const deleteFlag = async (req: AuthRequest, res: Response): Promise<void> => {
  const flag = await FeatureFlag.findOne({ key: req.params.key });
  if (!flag) throw new ApiError(404, `Feature flag "${req.params.key}" not found`);

  // Don't allow deleting built-in flags
  const builtIn = DEFAULT_FLAGS.map((f) => f.key);
  if (builtIn.includes(flag.key)) throw new ApiError(403, 'Cannot delete built-in feature flags');

  await flag.deleteOne();

  AuditService.log({
    action: 'DELETE',
    userId: req.user?.userId as string,
    username: req.user?.username as string,
    resourceType: 'feature_flag',
    resourceId: flag.key,
    details: `Feature flag "${flag.name}" deleted`,
    severity: 'medium',
    ipAddress: req.ip,
  });

  res.status(200).json({ success: true, message: 'Feature flag deleted' });
};
