import { RoleHome, UserRole } from '../types';

/**
 * Map a backend role to the v1 mobile "home" group.
 * Mirrors the web app's EnhancedDashboard role routing.
 */
export function roleHomeFor(role: UserRole | undefined): RoleHome {
  switch (role) {
    case 'driver':
      return 'driver';

    case 'manager':
    case 'super_manager':
    case 'station_manager':
      // station_manager shows a station view on web, but for v1 we treat
      // manager-family roles together; refine later if needed.
      return 'manager';

    case 'yard_personnel':
    case 'dar_yard':
    case 'tanga_yard':
    case 'mmsa_yard':
      return 'yard';

    case 'fuel_attendant':
      return 'station';

    default:
      return 'unsupported';
  }
}

export const ROLE_LABELS: Record<string, string> = {
  driver: 'Driver',
  manager: 'Station Manager',
  super_manager: 'Super Manager',
  station_manager: 'Station Manager',
  fuel_attendant: 'Fuel Attendant',
  yard_personnel: 'Yard Personnel',
  dar_yard: 'DAR Yard',
  tanga_yard: 'Tanga Yard',
  mmsa_yard: 'MMSA Yard',
};

export function roleLabel(role: UserRole | undefined): string {
  if (!role) return 'User';
  return ROLE_LABELS[role] ?? role;
}
