import { UserRole, RolePermissions, Permission } from '../types';

// Define all available resources and actions
export const RESOURCES = {
  DASHBOARD: 'dashboard',
  DELIVERY_ORDERS: 'delivery_orders',
  LPOS: 'lpos',
  FUEL_RECORDS: 'fuel_records',
  USERS: 'users',
  REPORTS: 'reports',
  SYSTEM_CONFIG: 'system_config',
} as const;

export const ACTIONS = {
  READ: 'read',
  CREATE: 'create',
  UPDATE: 'update',
  DELETE: 'delete',
  APPROVE: 'approve',
  MANAGE: 'manage',
  EXPORT: 'export',
} as const;

// Role-based permissions configuration
export const ROLE_PERMISSIONS: Record<UserRole, RolePermissions> = {
  super_admin: {
    role: 'super_admin',
    description: 'Full system access with all administrative privileges',
    permissions: [
      { resource: RESOURCES.DASHBOARD, actions: [ACTIONS.READ, ACTIONS.MANAGE] },
      { resource: RESOURCES.DELIVERY_ORDERS, actions: [ACTIONS.READ, ACTIONS.CREATE, ACTIONS.UPDATE, ACTIONS.DELETE, ACTIONS.APPROVE, ACTIONS.EXPORT] },
      { resource: RESOURCES.LPOS, actions: [ACTIONS.READ, ACTIONS.CREATE, ACTIONS.UPDATE, ACTIONS.DELETE, ACTIONS.APPROVE, ACTIONS.EXPORT] },
      { resource: RESOURCES.FUEL_RECORDS, actions: [ACTIONS.READ, ACTIONS.CREATE, ACTIONS.UPDATE, ACTIONS.DELETE, ACTIONS.EXPORT] },
      { resource: RESOURCES.USERS, actions: [ACTIONS.READ, ACTIONS.CREATE, ACTIONS.UPDATE, ACTIONS.DELETE, ACTIONS.MANAGE] },
      { resource: RESOURCES.REPORTS, actions: [ACTIONS.READ, ACTIONS.CREATE, ACTIONS.EXPORT, ACTIONS.MANAGE] },
      { resource: RESOURCES.SYSTEM_CONFIG, actions: [ACTIONS.READ, ACTIONS.UPDATE, ACTIONS.MANAGE] },
    ],
  },
  admin: {
    role: 'admin',
    description: 'Administrative access with most system privileges except user management',
    permissions: [
      { resource: RESOURCES.DASHBOARD, actions: [ACTIONS.READ, ACTIONS.MANAGE] },
      { resource: RESOURCES.DELIVERY_ORDERS, actions: [ACTIONS.READ, ACTIONS.CREATE, ACTIONS.UPDATE, ACTIONS.DELETE, ACTIONS.APPROVE, ACTIONS.EXPORT] },
      { resource: RESOURCES.LPOS, actions: [ACTIONS.READ, ACTIONS.CREATE, ACTIONS.UPDATE, ACTIONS.DELETE, ACTIONS.APPROVE, ACTIONS.EXPORT] },
      { resource: RESOURCES.FUEL_RECORDS, actions: [ACTIONS.READ, ACTIONS.CREATE, ACTIONS.UPDATE, ACTIONS.DELETE, ACTIONS.EXPORT] },
      { resource: RESOURCES.USERS, actions: [ACTIONS.READ, ACTIONS.UPDATE] },
      { resource: RESOURCES.REPORTS, actions: [ACTIONS.READ, ACTIONS.CREATE, ACTIONS.EXPORT] },
      { resource: RESOURCES.SYSTEM_CONFIG, actions: [ACTIONS.READ, ACTIONS.UPDATE] },
    ],
  },
  manager: {
    role: 'manager',
    description: 'Management access with approval rights and comprehensive reporting',
    permissions: [
      { resource: RESOURCES.DASHBOARD, actions: [ACTIONS.READ] },
      { resource: RESOURCES.DELIVERY_ORDERS, actions: [ACTIONS.READ, ACTIONS.CREATE, ACTIONS.UPDATE, ACTIONS.APPROVE, ACTIONS.EXPORT] },
      { resource: RESOURCES.LPOS, actions: [ACTIONS.READ, ACTIONS.CREATE, ACTIONS.UPDATE, ACTIONS.APPROVE, ACTIONS.EXPORT] },
      { resource: RESOURCES.FUEL_RECORDS, actions: [ACTIONS.READ, ACTIONS.CREATE, ACTIONS.UPDATE, ACTIONS.EXPORT] },
      { resource: RESOURCES.USERS, actions: [ACTIONS.READ] },
      { resource: RESOURCES.REPORTS, actions: [ACTIONS.READ, ACTIONS.CREATE, ACTIONS.EXPORT] },
    ],
  },
  supervisor: {
    role: 'supervisor',
    description: 'Supervisory access with limited approval rights and team oversight',
    permissions: [
      { resource: RESOURCES.DASHBOARD, actions: [ACTIONS.READ] },
      { resource: RESOURCES.DELIVERY_ORDERS, actions: [ACTIONS.READ, ACTIONS.CREATE, ACTIONS.UPDATE, ACTIONS.EXPORT] },
      { resource: RESOURCES.LPOS, actions: [ACTIONS.READ, ACTIONS.CREATE, ACTIONS.UPDATE, ACTIONS.EXPORT] },
      { resource: RESOURCES.FUEL_RECORDS, actions: [ACTIONS.READ, ACTIONS.CREATE, ACTIONS.UPDATE, ACTIONS.EXPORT] },
      { resource: RESOURCES.REPORTS, actions: [ACTIONS.READ, ACTIONS.EXPORT] },
    ],
  },
  clerk: {
    role: 'clerk',
    description: 'Data entry and basic operational access without approval rights',
    permissions: [
      { resource: RESOURCES.DASHBOARD, actions: [ACTIONS.READ] },
      { resource: RESOURCES.DELIVERY_ORDERS, actions: [ACTIONS.READ, ACTIONS.CREATE, ACTIONS.UPDATE] },
      { resource: RESOURCES.LPOS, actions: [ACTIONS.READ, ACTIONS.CREATE, ACTIONS.UPDATE] },
      { resource: RESOURCES.FUEL_RECORDS, actions: [ACTIONS.READ, ACTIONS.CREATE, ACTIONS.UPDATE] },
      { resource: RESOURCES.REPORTS, actions: [ACTIONS.READ] },
    ],
  },
  driver: {
    role: 'driver',
    description: 'Limited access to view assigned orders and update fuel records',
    permissions: [
      { resource: RESOURCES.DASHBOARD, actions: [ACTIONS.READ] },
      { resource: RESOURCES.DELIVERY_ORDERS, actions: [ACTIONS.READ] },
      { resource: RESOURCES.LPOS, actions: [ACTIONS.READ] },
      { resource: RESOURCES.FUEL_RECORDS, actions: [ACTIONS.READ, ACTIONS.UPDATE] },
    ],
  },
  viewer: {
    role: 'viewer',
    description: 'Read-only access for monitoring and reporting purposes',
    permissions: [
      { resource: RESOURCES.DASHBOARD, actions: [ACTIONS.READ] },
      { resource: RESOURCES.DELIVERY_ORDERS, actions: [ACTIONS.READ] },
      { resource: RESOURCES.LPOS, actions: [ACTIONS.READ] },
      { resource: RESOURCES.FUEL_RECORDS, actions: [ACTIONS.READ] },
      { resource: RESOURCES.REPORTS, actions: [ACTIONS.READ] },
    ],
  },
  fuel_order_maker: {
    role: 'fuel_order_maker',
    description: 'Fuel order creation and management specialist',
    permissions: [
      { resource: RESOURCES.DASHBOARD, actions: [ACTIONS.READ] },
      { resource: RESOURCES.DELIVERY_ORDERS, actions: [ACTIONS.READ, ACTIONS.CREATE, ACTIONS.UPDATE, ACTIONS.APPROVE, ACTIONS.EXPORT] },
      { resource: RESOURCES.LPOS, actions: [ACTIONS.READ, ACTIONS.CREATE, ACTIONS.UPDATE, ACTIONS.APPROVE, ACTIONS.EXPORT] },
      { resource: RESOURCES.FUEL_RECORDS, actions: [ACTIONS.READ, ACTIONS.CREATE, ACTIONS.UPDATE, ACTIONS.EXPORT] },
      { resource: RESOURCES.REPORTS, actions: [ACTIONS.READ, ACTIONS.EXPORT] },
    ],
  },
  boss: {
    role: 'boss',
    description: 'Executive level access with comprehensive oversight',
    permissions: [
      { resource: RESOURCES.DASHBOARD, actions: [ACTIONS.READ, ACTIONS.MANAGE] },
      { resource: RESOURCES.DELIVERY_ORDERS, actions: [ACTIONS.READ, ACTIONS.CREATE, ACTIONS.UPDATE, ACTIONS.DELETE, ACTIONS.APPROVE, ACTIONS.EXPORT] },
      { resource: RESOURCES.LPOS, actions: [ACTIONS.READ, ACTIONS.CREATE, ACTIONS.UPDATE, ACTIONS.DELETE, ACTIONS.APPROVE, ACTIONS.EXPORT] },
      { resource: RESOURCES.FUEL_RECORDS, actions: [ACTIONS.READ, ACTIONS.CREATE, ACTIONS.UPDATE, ACTIONS.DELETE, ACTIONS.EXPORT] },
      { resource: RESOURCES.USERS, actions: [ACTIONS.READ, ACTIONS.UPDATE] },
      { resource: RESOURCES.REPORTS, actions: [ACTIONS.READ, ACTIONS.CREATE, ACTIONS.EXPORT, ACTIONS.MANAGE] },
      { resource: RESOURCES.SYSTEM_CONFIG, actions: [ACTIONS.READ, ACTIONS.UPDATE] },
    ],
  },
  yard_personnel: {
    role: 'yard_personnel',
    description: 'Yard operations and fuel entry specialist',
    permissions: [
      { resource: RESOURCES.DASHBOARD, actions: [ACTIONS.READ] },
      { resource: RESOURCES.FUEL_RECORDS, actions: [ACTIONS.READ, ACTIONS.CREATE, ACTIONS.UPDATE] },
      { resource: RESOURCES.DELIVERY_ORDERS, actions: [ACTIONS.READ] },
      { resource: RESOURCES.LPOS, actions: [ACTIONS.READ] },
    ],
  },
  fuel_attendant: {
    role: 'fuel_attendant',
    description: 'Fuel station attendant with order fulfillment access',
    permissions: [
      { resource: RESOURCES.DASHBOARD, actions: [ACTIONS.READ] },
      { resource: RESOURCES.FUEL_RECORDS, actions: [ACTIONS.READ, ACTIONS.UPDATE] },
      { resource: RESOURCES.LPOS, actions: [ACTIONS.READ, ACTIONS.UPDATE] },
      { resource: RESOURCES.DELIVERY_ORDERS, actions: [ACTIONS.READ] },
    ],
  },
  station_manager: {
    role: 'station_manager',
    description: 'Station manager with comprehensive station operations access',
    permissions: [
      { resource: RESOURCES.DASHBOARD, actions: [ACTIONS.READ] },
      { resource: RESOURCES.FUEL_RECORDS, actions: [ACTIONS.READ, ACTIONS.CREATE, ACTIONS.UPDATE] },
      { resource: RESOURCES.LPOS, actions: [ACTIONS.READ, ACTIONS.UPDATE, ACTIONS.APPROVE] },
      { resource: RESOURCES.DELIVERY_ORDERS, actions: [ACTIONS.READ, ACTIONS.UPDATE] },
      { resource: RESOURCES.REPORTS, actions: [ACTIONS.READ, ACTIONS.EXPORT] },
    ],
  },
  payment_manager: {
    role: 'payment_manager',
    description: 'Payment and order management specialist',
    permissions: [
      { resource: RESOURCES.DASHBOARD, actions: [ACTIONS.READ] },
      { resource: RESOURCES.DELIVERY_ORDERS, actions: [ACTIONS.READ, ACTIONS.UPDATE] },
      { resource: RESOURCES.LPOS, actions: [ACTIONS.READ, ACTIONS.UPDATE] },
      { resource: RESOURCES.FUEL_RECORDS, actions: [ACTIONS.READ, ACTIONS.UPDATE] },
    ],
  },
  dar_yard: {
    role: 'dar_yard',
    description: 'Dar Es Salaam yard fuel dispense specialist',
    permissions: [
      { resource: RESOURCES.DASHBOARD, actions: [ACTIONS.READ] },
      { resource: RESOURCES.FUEL_RECORDS, actions: [ACTIONS.READ, ACTIONS.CREATE] },
    ],
  },
  tanga_yard: {
    role: 'tanga_yard',
    description: 'Tanga yard fuel dispense specialist',
    permissions: [
      { resource: RESOURCES.DASHBOARD, actions: [ACTIONS.READ] },
      { resource: RESOURCES.FUEL_RECORDS, actions: [ACTIONS.READ, ACTIONS.CREATE] },
    ],
  },
  mmsa_yard: {
    role: 'mmsa_yard',
    description: 'MMSA yard fuel dispense specialist',
    permissions: [
      { resource: RESOURCES.DASHBOARD, actions: [ACTIONS.READ] },
      { resource: RESOURCES.FUEL_RECORDS, actions: [ACTIONS.READ, ACTIONS.CREATE] },
    ],
  },
};

// Helper function to check if user has permission
export function hasPermission(
  userPermissions: Permission[],
  resource: string,
  action: string
): boolean {
  return userPermissions.some(
    (permission) =>
      permission.resource === resource && permission.actions.includes(action)
  );
}

// Helper function to get user role permissions
export function getRolePermissions(role: UserRole): Permission[] {
  return ROLE_PERMISSIONS[role]?.permissions || [];
}

// Helper function to check if user can access a route
export function canAccessRoute(userPermissions: Permission[], route: string): boolean {
  const routeResourceMap: Record<string, string> = {
    '/': RESOURCES.DASHBOARD,
    '/delivery-orders': RESOURCES.DELIVERY_ORDERS,
    '/lpos': RESOURCES.LPOS,
    '/fuel-records': RESOURCES.FUEL_RECORDS,
    '/users': RESOURCES.USERS,
    '/reports': RESOURCES.REPORTS,
    '/settings': RESOURCES.SYSTEM_CONFIG,
  };

  const resource = routeResourceMap[route];
  return resource ? hasPermission(userPermissions, resource, ACTIONS.READ) : false;
}

// Get role display information
export function getRoleInfo(role: UserRole) {
  return {
    name: role.replace('_', ' ').toUpperCase(),
    description: ROLE_PERMISSIONS[role]?.description || '',
    color: getRoleColor(role),
  };
}

// Get role color for UI display
export function getRoleColor(role: UserRole): string {
  const colors: Record<UserRole, string> = {
    super_admin: 'bg-red-100 text-red-800',
    admin: 'bg-purple-100 text-purple-800',
    manager: 'bg-blue-100 text-blue-800',
    supervisor: 'bg-green-100 text-green-800',
    clerk: 'bg-yellow-100 text-yellow-800',
    driver: 'bg-orange-100 text-orange-800',
    viewer: 'bg-gray-100 text-gray-800',
    fuel_order_maker: 'bg-indigo-100 text-indigo-800',
    boss: 'bg-pink-100 text-pink-800',
    yard_personnel: 'bg-teal-100 text-teal-800',
    fuel_attendant: 'bg-cyan-100 text-cyan-800',
    station_manager: 'bg-emerald-100 text-emerald-800',
    payment_manager: 'bg-amber-100 text-amber-800',
    dar_yard: 'bg-blue-100 text-blue-800',
    tanga_yard: 'bg-green-100 text-green-800',
    mmsa_yard: 'bg-purple-100 text-purple-800',
  };
  return colors[role] || colors.viewer;
}