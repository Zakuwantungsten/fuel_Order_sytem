/**
 * Role Permission Controller
 * 
 * Returns a structured permission map derived from route definitions.
 * Super admins can edit individual cells; changes are persisted to SystemConfig.
 */
import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth';
import logger from '../utils/logger';
import { SystemConfig } from '../models/SystemConfig';
import AuditService from '../utils/auditService';

// Valid permission levels in descending order
const VALID_PERMISSIONS = ['CRUD', 'CRU', 'CR', 'R', '—'] as const;
type Permission = typeof VALID_PERMISSIONS[number];

// Categories align with the system's functional modules.
const CATEGORIES = [
  { id: 'fuel_records',     label: 'Fuel Records' },
  { id: 'delivery_orders',  label: 'Delivery Orders' },
  { id: 'lpo',              label: 'LPO Management' },
  { id: 'yard_fuel',        label: 'Yard Fuel' },
  { id: 'driver_accounts',  label: 'Driver Accounts' },
  { id: 'user_management',  label: 'User Management' },
  { id: 'admin',            label: 'Administration' },
  { id: 'system_config',    label: 'System Config' },
  { id: 'security',         label: 'Security' },
  { id: 'analytics',        label: 'Analytics' },
  { id: 'import_export',    label: 'Import / Export' },
];

const ROLES = [
  'super_admin', 'admin', 'boss', 'super_manager', 'manager', 'supervisor',
  'clerk', 'driver', 'viewer', 'fuel_order_maker', 'yard_personnel',
  'dar_yard', 'tanga_yard', 'mmsa_yard', 'fuel_attendant',
  'station_manager', 'payment_manager', 'import_officer', 'export_officer',
];

// Default matrix — mirrors the authorize() middleware configuration across all routes.
const DEFAULT_MATRIX: Record<string, Record<string, string>> = {
  fuel_records: {
    super_admin: 'CRUD', admin: 'CRUD', boss: 'CRUD', super_manager: 'CRUD',
    manager: 'CRUD', supervisor: 'CR', clerk: 'CRUD', driver: 'R', viewer: 'R',
    fuel_order_maker: 'CRUD', yard_personnel: 'R', dar_yard: 'R', tanga_yard: 'R',
    mmsa_yard: 'R', fuel_attendant: '—', station_manager: '—',
    payment_manager: '—', import_officer: '—', export_officer: '—',
  },
  delivery_orders: {
    super_admin: 'CRUD', admin: 'CRUD', boss: 'CRUD', super_manager: 'CRUD',
    manager: 'CRUD', supervisor: 'CR', clerk: 'CRUD', driver: 'R', viewer: 'R',
    fuel_order_maker: 'CRUD', yard_personnel: '—', dar_yard: '—', tanga_yard: '—',
    mmsa_yard: '—', fuel_attendant: '—', station_manager: '—',
    payment_manager: '—', import_officer: '—', export_officer: '—',
  },
  lpo: {
    super_admin: 'CRUD', admin: 'CRUD', boss: 'CRUD', super_manager: 'CRUD',
    manager: 'CRU', supervisor: 'CR', clerk: 'CRU', driver: '—', viewer: 'R',
    fuel_order_maker: 'CR', yard_personnel: '—', dar_yard: '—', tanga_yard: '—',
    mmsa_yard: '—', fuel_attendant: '—', station_manager: 'CRU',
    payment_manager: 'CRU', import_officer: '—', export_officer: '—',
  },
  yard_fuel: {
    super_admin: 'CRUD', admin: 'CRUD', boss: 'CR', super_manager: 'CR',
    manager: 'CR', supervisor: 'CR', clerk: '—', driver: '—', viewer: 'R',
    fuel_order_maker: '—', yard_personnel: 'CRU', dar_yard: 'CRU', tanga_yard: 'CRU',
    mmsa_yard: 'CRU', fuel_attendant: 'CRU', station_manager: '—',
    payment_manager: '—', import_officer: '—', export_officer: '—',
  },
  driver_accounts: {
    super_admin: 'CRUD', admin: 'CRUD', boss: 'CR', super_manager: 'CR',
    manager: 'CR', supervisor: 'CR', clerk: 'CRU', driver: 'R', viewer: 'R',
    fuel_order_maker: 'CR', yard_personnel: '—', dar_yard: '—', tanga_yard: '—',
    mmsa_yard: '—', fuel_attendant: '—', station_manager: '—',
    payment_manager: '—', import_officer: '—', export_officer: '—',
  },
  user_management: {
    super_admin: 'CRUD', admin: 'CRU', boss: 'R', super_manager: '—',
    manager: '—', supervisor: '—', clerk: '—', driver: '—', viewer: '—',
    fuel_order_maker: '—', yard_personnel: '—', dar_yard: '—', tanga_yard: '—',
    mmsa_yard: '—', fuel_attendant: '—', station_manager: '—',
    payment_manager: '—', import_officer: '—', export_officer: '—',
  },
  admin: {
    super_admin: 'CRUD', admin: 'CR', boss: 'R', super_manager: '—',
    manager: '—', supervisor: '—', clerk: '—', driver: '—', viewer: '—',
    fuel_order_maker: '—', yard_personnel: '—', dar_yard: '—', tanga_yard: '—',
    mmsa_yard: '—', fuel_attendant: '—', station_manager: '—',
    payment_manager: '—', import_officer: '—', export_officer: '—',
  },
  system_config: {
    super_admin: 'CRUD', admin: '—', boss: '—', super_manager: '—',
    manager: '—', supervisor: '—', clerk: '—', driver: '—', viewer: '—',
    fuel_order_maker: '—', yard_personnel: '—', dar_yard: '—', tanga_yard: '—',
    mmsa_yard: '—', fuel_attendant: '—', station_manager: '—',
    payment_manager: '—', import_officer: '—', export_officer: '—',
  },
  security: {
    super_admin: 'CRUD', admin: '—', boss: '—', super_manager: '—',
    manager: '—', supervisor: '—', clerk: '—', driver: '—', viewer: '—',
    fuel_order_maker: '—', yard_personnel: '—', dar_yard: '—', tanga_yard: '—',
    mmsa_yard: '—', fuel_attendant: '—', station_manager: '—',
    payment_manager: '—', import_officer: '—', export_officer: '—',
  },
  analytics: {
    super_admin: 'R', admin: '—', boss: '—', super_manager: '—',
    manager: '—', supervisor: '—', clerk: '—', driver: '—', viewer: '—',
    fuel_order_maker: '—', yard_personnel: '—', dar_yard: '—', tanga_yard: '—',
    mmsa_yard: '—', fuel_attendant: '—', station_manager: '—',
    payment_manager: '—', import_officer: '—', export_officer: '—',
  },
  import_export: {
    super_admin: 'CRUD', admin: 'CR', boss: 'CR', super_manager: '—',
    manager: '—', supervisor: '—', clerk: '—', driver: '—', viewer: '—',
    fuel_order_maker: '—', yard_personnel: '—', dar_yard: '—', tanga_yard: '—',
    mmsa_yard: '—', fuel_attendant: '—', station_manager: '—',
    payment_manager: '—', import_officer: 'CR', export_officer: 'CR',
  },
};

// Mutable in-memory matrix — may be replaced with a saved version from SystemConfig.
let _matrix: Record<string, Record<string, string>> = { ...DEFAULT_MATRIX };
// Deep-clone each category row so edits don't mutate DEFAULT_MATRIX
for (const key of Object.keys(DEFAULT_MATRIX)) {
  _matrix[key] = { ...DEFAULT_MATRIX[key] };
}

// Load any previously-saved custom matrix from SystemConfig on startup.
(async () => {
  try {
    const config = await SystemConfig.findOne().lean();
    const saved = (config as any)?.rolePermissionsMatrix;
    if (saved && typeof saved === 'object') {
      // Merge saved values on top of defaults (ignores unknown keys)
      for (const cat of Object.keys(saved)) {
        if (_matrix[cat]) Object.assign(_matrix[cat], saved[cat]);
      }
      logger.info('[RolePerms] Loaded saved permission matrix from SystemConfig');
    }
  } catch (e) {
    logger.warn('[RolePerms] Could not load saved permission matrix:', e);
  }
})();

/**
 * GET /system-admin/role-permissions
 */
export async function getRolePermissions(_req: AuthRequest, res: Response, _next: NextFunction) {
  try {
    return res.json({ success: true, data: { categories: CATEGORIES, roles: ROLES, matrix: _matrix } });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: 'Failed to fetch role permissions', error: error.message });
  }
}

/**
 * PUT /system-admin/role-permissions
 * Body: { category: string; role: string; permission: 'CRUD'|'CRU'|'CR'|'R'|'—' }
 */
export async function updateRolePermissions(req: AuthRequest, res: Response, _next: NextFunction) {
  try {
    const { category, role, permission } = req.body;

    if (!category || typeof category !== 'string' || !CATEGORIES.find(c => c.id === category)) {
      return res.status(400).json({ success: false, message: 'Invalid category' });
    }
    if (!role || typeof role !== 'string' || !ROLES.includes(role)) {
      return res.status(400).json({ success: false, message: 'Invalid role' });
    }
    if (!permission || !(VALID_PERMISSIONS as readonly string[]).includes(permission)) {
      return res.status(400).json({ success: false, message: `Invalid permission. Must be one of: ${VALID_PERMISSIONS.join(', ')}` });
    }

    // Update in-memory matrix
    _matrix[category][role] = permission as Permission;

    // Persist to SystemConfig
    let config = await SystemConfig.findOne();
    if (!config) config = new SystemConfig({});
    (config as any).rolePermissionsMatrix = _matrix;
    config.markModified('rolePermissionsMatrix');
    config.lastUpdatedBy = req.user?.username || 'system';
    await config.save();

    await AuditService.log({
      userId: req.user?.userId,
      username: req.user?.username || 'system',
      action: 'CONFIG_CHANGE',
      resourceType: 'role_permission_matrix',
      details: `Permission updated: ${role} → ${category} = ${permission}`,
      severity: 'high',
      ipAddress: req.ip,
    });

    return res.json({ success: true, data: { categories: CATEGORIES, roles: ROLES, matrix: _matrix } });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: 'Failed to update role permission', error: error.message });
  }
}
