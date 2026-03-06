import type { User, UserRole, UserDetail, PaginatedResponse } from '../../../types';

// ── Lifecycle States ─────────────────────────────────────────────────────────
export type UserLifecycleState =
  | 'active'
  | 'inactive'
  | 'banned'
  | 'pending_activation'
  | 'suspended'
  | 'archived'
  | 'locked';

// ── Filter & Sort ────────────────────────────────────────────────────────────
export interface UserFilters {
  q: string;
  role: string;
  status: string;
  mfaStatus: string;
}

export type SortField = 'name' | 'email' | 'role' | 'status' | 'lastLogin' | 'createdAt';
export type SortDirection = 'asc' | 'desc';

export interface SortConfig {
  field: SortField;
  direction: SortDirection;
}

// ── Column Definitions ───────────────────────────────────────────────────────
export interface ColumnDef {
  id: string;
  label: string;
  sortable: boolean;
  sortField?: SortField;
  width?: string;
  align?: 'left' | 'center' | 'right';
  visible: boolean;
}

// ── Bulk Operations ──────────────────────────────────────────────────────────
export type BulkActionType =
  | 'activate'
  | 'deactivate'
  | 'change_role'
  | 'delete'
  | 'reset_password'
  | 'export';

export type SelectionScope = 'page' | 'all';

export interface BulkSelectionState {
  selectedIds: Set<string>;
  selectionScope: SelectionScope;
  totalMatching: number;
}

// ── User Detail Drawer ───────────────────────────────────────────────────────
export type DrawerTab = 'overview' | 'security' | 'activity' | 'sessions' | 'roles' | 'notes';

export interface DrawerState {
  isOpen: boolean;
  userId: string | number | null;
  activeTab: DrawerTab;
}

// ── Stat Card ────────────────────────────────────────────────────────────────
export interface StatCardData {
  label: string;
  value: number;
  previousValue?: number;
  icon: React.ComponentType<{ className?: string }>;
  gradient: string;
  trendData?: number[];
}

// ── Privilege Elevation ──────────────────────────────────────────────────────
export type PrivilegeStatus = 'pending' | 'approved' | 'active' | 'denied' | 'expired' | 'revoked';

export interface PrivilegeRequest {
  _id: string;
  requestedByUsername: string;
  targetRole: string;
  currentRole: string;
  reason: string;
  status: PrivilegeStatus;
  durationMinutes: number;
  approvedByUsername?: string;
  approvedAt?: string;
  deniedByUsername?: string;
  denialReason?: string;
  expiresAt?: string;
  createdAt: string;
}

// ── Driver Credentials ───────────────────────────────────────────────────────
export interface DriverCredential {
  _id: string;
  truckNo: string;
  driverName?: string;
  phoneNumber?: string;
  isActive: boolean;
  lastLogin?: string;
  createdBy: string;
  createdAt: string;
}

export interface DriverCredentialStats {
  totalDrivers: number;
  activeDrivers: number;
  inactiveDrivers: number;
  recentLogins: number;
}

// ── Session ──────────────────────────────────────────────────────────────────
export interface ActiveSession {
  sessionId: string;
  userId: string;
  username: string;
  ipAddress?: string;
  userAgent?: string;
  device?: string;
  location?: string;
  startedAt: string;
  lastActivity: string;
}

// ── Modal Props ──────────────────────────────────────────────────────────────
export interface ModalBaseProps {
  onClose: () => void;
}

export interface UserModalProps extends ModalBaseProps {
  user: User;
}

export interface MessageHandler {
  onMessage: (type: 'success' | 'error', message: string) => void;
}

// ── Login History Entry ──────────────────────────────────────────────────────
export interface LoginHistoryEntry {
  _id: string;
  timestamp: string;
  action: 'LOGIN' | 'FAILED_LOGIN';
  outcome: 'SUCCESS' | 'FAILURE';
  ipAddress?: string;
  userAgent?: string;
}

// ── MFA Status ───────────────────────────────────────────────────────────────
export interface MfaStatus {
  enabled: boolean;
  totpEnrolled: boolean;
  emailEnrolled: boolean;
  isMandatory: boolean;
  isExempt: boolean;
  lastVerified: string | null;
  failedAttempts: number;
  lockedUntil: string | null;
}

// Re-export core types for convenience
export type { User, UserRole, UserDetail, PaginatedResponse };
