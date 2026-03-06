/**
 * Role Permission Controller
 * 
 * Returns a structured permission map derived from route definitions.
 * This is a static map reflecting the authorize() calls in route files.
 */
import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth';

// Static permission map — mirrors the authorize() middleware configuration across all routes.
// Categories align with the system's functional modules.
const PERMISSION_MAP = {
  categories: [
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
  ],
  roles: [
    'super_admin', 'admin', 'boss', 'super_manager', 'manager', 'supervisor',
    'clerk', 'driver', 'viewer', 'fuel_order_maker', 'yard_personnel',
    'dar_yard', 'tanga_yard', 'mmsa_yard', 'fuel_attendant',
    'station_manager', 'payment_manager', 'import_officer', 'export_officer',
  ],
  /**
   * Permissions matrix.
   * Key = categoryId, value = { [role]: permission_string }
   * Permission strings: 'CRUD' | 'CRU' | 'CR' | 'R' | '—'
   * Derived from authorize() calls in route files.
   */
  matrix: {
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
  } as Record<string, Record<string, string>>,
};

/**
 * GET /system-admin/role-permissions
 */
export async function getRolePermissions(_req: AuthRequest, res: Response, _next: NextFunction) {
  try {
    return res.json({ success: true, data: PERMISSION_MAP });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: 'Failed to fetch role permissions', error: error.message });
  }
}
