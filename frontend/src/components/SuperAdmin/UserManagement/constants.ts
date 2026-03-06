import {
  EyeOff, Ban, CheckCircle, Clock,
  ShieldPlus, XCircle, AlertTriangle, Lock,
} from 'lucide-react';
import type { ColumnDef, PrivilegeStatus, UserLifecycleState } from './types';
import type { UserRole } from '../../../types';

// ── Role Definitions with Permissions ────────────────────────────────────────
export interface RoleDefinition {
  value: UserRole;
  label: string;
  color: string;
  bgColor: string;
  description: string;
  permissionSummary: string[];
}

export const USER_ROLES: RoleDefinition[] = [
  {
    value: 'super_admin',
    label: 'Super Admin',
    color: 'text-red-600 dark:text-red-400',
    bgColor: 'bg-red-50 dark:bg-red-900/30',
    description: 'Full system access with all administrative privileges',
    permissionSummary: ['All resources', 'User management', 'System configuration', 'Audit logs'],
  },
  {
    value: 'admin',
    label: 'Admin',
    color: 'text-blue-600 dark:text-blue-400',
    bgColor: 'bg-blue-50 dark:bg-blue-900/30',
    description: 'Administrative access excluding system-level settings',
    permissionSummary: ['User management', 'Data management', 'Reports', 'Configuration'],
  },
  {
    value: 'super_manager',
    label: 'Super Manager',
    color: 'text-purple-600 dark:text-purple-400',
    bgColor: 'bg-purple-50 dark:bg-purple-900/30',
    description: 'Cross-yard management with elevated operational access',
    permissionSummary: ['All yards', 'Delivery orders', 'LPO management', 'Reports'],
  },
  {
    value: 'boss',
    label: 'Boss',
    color: 'text-indigo-600 dark:text-indigo-400',
    bgColor: 'bg-indigo-50 dark:bg-indigo-900/30',
    description: 'Executive-level overview and approval authority',
    permissionSummary: ['Dashboard overview', 'Approval workflows', 'Reports', 'Financial data'],
  },
  {
    value: 'manager',
    label: 'Manager',
    color: 'text-violet-600 dark:text-violet-400',
    bgColor: 'bg-violet-50 dark:bg-violet-900/30',
    description: 'Operational management within assigned scope',
    permissionSummary: ['Delivery orders', 'LPO management', 'Team oversight', 'Reports'],
  },
  {
    value: 'supervisor',
    label: 'Supervisor',
    color: 'text-fuchsia-600 dark:text-fuchsia-400',
    bgColor: 'bg-fuchsia-50 dark:bg-fuchsia-900/30',
    description: 'Team supervision and operational monitoring',
    permissionSummary: ['Team oversight', 'Fuel records', 'Delivery tracking'],
  },
  {
    value: 'clerk',
    label: 'Clerk',
    color: 'text-slate-600 dark:text-slate-400',
    bgColor: 'bg-slate-50 dark:bg-slate-900/30',
    description: 'Data entry and record keeping',
    permissionSummary: ['Data entry', 'Record viewing', 'Basic reports'],
  },
  {
    value: 'fuel_order_maker',
    label: 'Fuel Order Maker',
    color: 'text-green-600 dark:text-green-400',
    bgColor: 'bg-green-50 dark:bg-green-900/30',
    description: 'Creates and manages fuel orders and LPOs',
    permissionSummary: ['Create fuel orders', 'LPO entry', 'Station management'],
  },
  {
    value: 'payment_manager',
    label: 'Payment Manager',
    color: 'text-yellow-600 dark:text-yellow-400',
    bgColor: 'bg-yellow-50 dark:bg-yellow-900/30',
    description: 'Financial operations and payment processing',
    permissionSummary: ['Payment processing', 'Financial reports', 'Invoice management'],
  },
  {
    value: 'import_officer',
    label: 'Import Officer',
    color: 'text-cyan-600 dark:text-cyan-400',
    bgColor: 'bg-cyan-50 dark:bg-cyan-900/30',
    description: 'Manages import delivery orders and logistics',
    permissionSummary: ['Import DOs', 'Border tracking', 'Customs documents'],
  },
  {
    value: 'export_officer',
    label: 'Export Officer',
    color: 'text-sky-600 dark:text-sky-400',
    bgColor: 'bg-sky-50 dark:bg-sky-900/30',
    description: 'Manages export delivery orders and logistics',
    permissionSummary: ['Export DOs', 'Shipping coordination', 'Documentation'],
  },
  {
    value: 'driver',
    label: 'Driver',
    color: 'text-emerald-600 dark:text-emerald-400',
    bgColor: 'bg-emerald-50 dark:bg-emerald-900/30',
    description: 'Driver account for delivery operations',
    permissionSummary: ['View assigned DOs', 'Fuel records', 'Trip reporting'],
  },
  {
    value: 'yard_personnel',
    label: 'Yard Personnel',
    color: 'text-orange-600 dark:text-orange-400',
    bgColor: 'bg-orange-50 dark:bg-orange-900/30',
    description: 'Yard operations and fuel dispensing',
    permissionSummary: ['Yard fuel records', 'Vehicle tracking', 'Dispensing logs'],
  },
  {
    value: 'fuel_attendant',
    label: 'Fuel Attendant',
    color: 'text-teal-600 dark:text-teal-400',
    bgColor: 'bg-teal-50 dark:bg-teal-900/30',
    description: 'Station-level fuel dispensing operations',
    permissionSummary: ['Fuel dispensing', 'Station records', 'LPO verification'],
  },
  {
    value: 'station_manager',
    label: 'Station Manager',
    color: 'text-pink-600 dark:text-pink-400',
    bgColor: 'bg-pink-50 dark:bg-pink-900/30',
    description: 'Manages fuel station operations',
    permissionSummary: ['Station management', 'Staff oversight', 'Fuel inventory'],
  },
  {
    value: 'dar_yard',
    label: 'Dar Yard',
    color: 'text-amber-600 dark:text-amber-400',
    bgColor: 'bg-amber-50 dark:bg-amber-900/30',
    description: 'Dar es Salaam yard operations access',
    permissionSummary: ['DAR yard operations', 'Local fuel records', 'Vehicle check-in'],
  },
  {
    value: 'tanga_yard',
    label: 'Tanga Yard',
    color: 'text-lime-600 dark:text-lime-400',
    bgColor: 'bg-lime-50 dark:bg-lime-900/30',
    description: 'Tanga yard operations access',
    permissionSummary: ['Tanga yard operations', 'Local fuel records', 'Vehicle check-in'],
  },
  {
    value: 'mmsa_yard',
    label: 'MMSA Yard',
    color: 'text-rose-600 dark:text-rose-400',
    bgColor: 'bg-rose-50 dark:bg-rose-900/30',
    description: 'MMSA yard operations access',
    permissionSummary: ['MMSA yard operations', 'Local fuel records', 'Vehicle check-in'],
  },
  {
    value: 'viewer',
    label: 'Viewer',
    color: 'text-gray-600 dark:text-gray-400',
    bgColor: 'bg-gray-50 dark:bg-gray-900/30',
    description: 'Read-only access to assigned resources',
    permissionSummary: ['View dashboards', 'View reports', 'Read-only access'],
  },
];

// Flat list of all role values for dropdowns
export const ALL_ROLE_VALUES = USER_ROLES.map(r => r.value);

// Helper to look up role info
export const getRoleDefinition = (role: string): RoleDefinition =>
  USER_ROLES.find(r => r.value === role) || USER_ROLES[USER_ROLES.length - 1];

// ── Yards ────────────────────────────────────────────────────────────────────
export const YARDS = [
  { value: 'DAR YARD', label: 'DAR YARD' },
  { value: 'TANGA YARD', label: 'TANGA YARD' },
  { value: 'MMSA YARD', label: 'MMSA YARD' },
] as const;

// ── Lifecycle State Configuration ────────────────────────────────────────────
export interface LifecycleStateConfig {
  label: string;
  dotColor: string;
  bgColor: string;
  textColor: string;
  icon: React.ComponentType<{ className?: string }>;
}

export const LIFECYCLE_STATES: Record<UserLifecycleState, LifecycleStateConfig> = {
  active: {
    label: 'Active',
    dotColor: 'bg-green-500',
    bgColor: 'bg-green-50 dark:bg-green-900/20',
    textColor: 'text-green-700 dark:text-green-400',
    icon: CheckCircle,
  },
  inactive: {
    label: 'Inactive',
    dotColor: 'bg-gray-400',
    bgColor: 'bg-gray-50 dark:bg-gray-800',
    textColor: 'text-gray-600 dark:text-gray-400',
    icon: EyeOff,
  },
  banned: {
    label: 'Banned',
    dotColor: 'bg-red-500',
    bgColor: 'bg-red-50 dark:bg-red-900/20',
    textColor: 'text-red-700 dark:text-red-400',
    icon: Ban,
  },
  pending_activation: {
    label: 'Pending',
    dotColor: 'bg-amber-500',
    bgColor: 'bg-amber-50 dark:bg-amber-900/20',
    textColor: 'text-amber-700 dark:text-amber-400',
    icon: Clock,
  },
  suspended: {
    label: 'Suspended',
    dotColor: 'bg-orange-500',
    bgColor: 'bg-orange-50 dark:bg-orange-900/20',
    textColor: 'text-orange-700 dark:text-orange-400',
    icon: AlertTriangle,
  },
  archived: {
    label: 'Archived',
    dotColor: 'bg-slate-400',
    bgColor: 'bg-slate-50 dark:bg-slate-800',
    textColor: 'text-slate-600 dark:text-slate-400',
    icon: EyeOff,
  },
  locked: {
    label: 'Locked',
    dotColor: 'bg-yellow-500',
    bgColor: 'bg-yellow-50 dark:bg-yellow-900/20',
    textColor: 'text-yellow-700 dark:text-yellow-400',
    icon: Lock,
  },
};

// ── Privilege Elevation Status Badges ────────────────────────────────────────
export const PRIVILEGE_STATUS_CONFIG: Record<PrivilegeStatus, { color: string; icon: React.ComponentType<{ className?: string }> }> = {
  pending: { color: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400', icon: Clock },
  approved: { color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400', icon: CheckCircle },
  active: { color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400', icon: ShieldPlus },
  denied: { color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400', icon: XCircle },
  expired: { color: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400', icon: Clock },
  revoked: { color: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400', icon: Ban },
};

// ── Table Column Definitions ─────────────────────────────────────────────────
export const TABLE_COLUMNS: ColumnDef[] = [
  { id: 'select',    label: '',            sortable: false,                       width: 'w-12',  align: 'center', visible: true },
  { id: 'user',      label: 'User',        sortable: true,  sortField: 'name',    width: 'w-72',  align: 'left',   visible: true },
  { id: 'email',     label: 'Email',       sortable: true,  sortField: 'email',                   align: 'left',   visible: true },
  { id: 'role',      label: 'Role',        sortable: true,  sortField: 'role',    width: 'w-44',  align: 'left',   visible: true },
  { id: 'status',    label: 'Status',      sortable: true,  sortField: 'status',  width: 'w-36',  align: 'left',   visible: true },
  { id: 'mfa',       label: 'MFA',         sortable: false,                       width: 'w-20',  align: 'center', visible: true },
  { id: 'lastLogin', label: 'Last Active', sortable: true,  sortField: 'lastLogin', width: 'w-36', align: 'left',  visible: true },
  { id: 'created',   label: 'Created',     sortable: true,  sortField: 'createdAt', width: 'w-36', align: 'left',  visible: true },
  { id: 'actions',   label: '',            sortable: false,                       width: 'w-16',  align: 'right',  visible: true },
];

// ── Page Size Options ────────────────────────────────────────────────────────
export const PAGE_SIZE_OPTIONS = [25, 50, 100] as const;
export const EXTENDED_PAGE_SIZE_OPTIONS = [25, 50, 100, 250, 500] as const;
export const DEFAULT_PAGE_SIZE = 25;
export const VIRTUAL_SCROLL_THRESHOLD = 100;
export const TABLE_ROW_HEIGHT = 56;

// ── Keyboard Shortcuts ──────────────────────────────────────────────────────
export const KEYBOARD_SHORTCUTS = {
  GLOBAL_SEARCH: { key: 'k', modifiers: ['ctrl'] as const, description: 'Focus search' },
  CLOSE:         { key: 'Escape', modifiers: [] as const, description: 'Close drawer/modal' },
  CREATE_USER:   { key: 'n', modifiers: ['ctrl', 'shift'] as const, description: 'Create new user' },
  SELECT_ALL:    { key: 'a', modifiers: ['ctrl', 'shift'] as const, description: 'Select all users' },
} as const;

// ── Stat Card Gradients ──────────────────────────────────────────────────────
export const STAT_GRADIENTS = {
  total:    'from-indigo-500 to-blue-600',
  active:   'from-emerald-500 to-green-600',
  inactive: 'from-amber-500 to-orange-600',
  banned:   'from-red-500 to-rose-600',
} as const;

// ── Filter Options ───────────────────────────────────────────────────────────
export const ROLE_FILTER_OPTIONS = [
  { value: '', label: 'All Roles' },
  ...USER_ROLES.map(r => ({ value: r.value, label: r.label })),
];

export const STATUS_FILTER_OPTIONS = [
  { value: '', label: 'All Status' },
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
];

export const MFA_FILTER_OPTIONS = [
  { value: '', label: 'All MFA' },
  { value: 'enrolled', label: 'MFA Enrolled' },
  { value: 'not_enrolled', label: 'Not Enrolled' },
];
