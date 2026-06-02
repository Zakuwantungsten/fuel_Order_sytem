/**
 * Shared types — a mobile-focused subset of the web app's types
 * (frontend/src/types). Extend as screens are built out.
 */

export type UserRole =
  | 'super_admin'
  | 'admin'
  | 'manager'
  | 'super_manager'
  | 'supervisor'
  | 'clerk'
  | 'driver'
  | 'viewer'
  | 'fuel_order_maker'
  | 'boss'
  | 'yard_personnel'
  | 'fuel_attendant'
  | 'station_manager'
  | 'payment_manager'
  | 'dar_yard'
  | 'tanga_yard'
  | 'mmsa_yard'
  | 'import_officer'
  | 'export_officer';

export interface AuthUser {
  _id: string;
  username: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  role: UserRole;
  yard?: string;
  station?: string;
  department?: string;
  truckNo?: string;
  isActive?: boolean;
}

/** The four role-home groups the v1 mobile app routes to. */
export type RoleHome = 'driver' | 'manager' | 'yard' | 'station' | 'unsupported';

export interface ApiEnvelope<T> {
  success: boolean;
  message?: string;
  data?: T;
}
