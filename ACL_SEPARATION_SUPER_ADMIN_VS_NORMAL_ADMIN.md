# ACL Separation: Super Admin vs Normal Admin

**Date:** December 9, 2025  
**System:** Fuel Order Management System  
**Purpose:** Define comprehensive Access Control List (ACL) separation between Super Admins and Normal Admins

---

## Overview

This document outlines the complete separation of privileges and capabilities between **Super Admins** and **Normal Admins** in the Fuel Order Management System. This separation ensures security, operational efficiency, and proper separation of duties.

---

## 🔴 SUPER ADMIN (super_admin) - Highest Authority

**Philosophy**: Full system control with destructive and critical operation capabilities

### Exclusive Super Admin Privileges

#### 1. User Management - Critical Actions

- ✅ Create users with ANY role (including other super_admins and system_admins)
- ✅ **Ban/Unban users** - Lock accounts with reason tracking
- ✅ **Permanent user deletion** - Cannot be recovered
- ✅ **Force logout users** - Terminate active sessions
- ✅ Delete admin/boss level users
- ✅ Reset passwords for any user including admins
- ✅ Modify super_admin and system_admin roles
- ✅ View banned users and ban history

**Implementation Notes:**
- Ban functionality already exists in `userController.ts` (`banUser`, `unbanUser`)
- Force logout implemented in `systemAdminController.ts`
- Routes protected in `userRoutes.ts` with `authorize('super_admin')`

#### 2. System Configuration - Full Control

- ✅ **Modify system-wide settings** (email, database, security)
- ✅ Enable/disable profiling and performance monitoring
- ✅ Change retention policies for trash/backups
- ✅ Configure Cloudflare R2 and external integrations
- ✅ Modify critical system parameters (JWT secrets, API keys)
- ✅ Access environment variables and secrets

**Implementation Notes:**
- System config routes in `configRoutes.ts`
- Currently accessible by `system_admin` and `super_admin`
- Consider restricting critical modifications to super_admin only

#### 3. Data Management - Destructive Operations

- ✅ **Permanent delete** any resource (DOs, LPOs, Fuel Records, Users)
- ✅ **Bulk permanent delete** operations
- ✅ **Empty entire trash** for any resource type
- ✅ Restore any deleted item (no ownership restrictions)
- ✅ Bulk restore operations
- ✅ Database cleanup and maintenance operations

**Implementation Notes:**
- Trash management exists in `trashRoutes.ts`
- Permanent delete and bulk operations are super_admin only
- Restore operations currently allow system_admin (consider restricting)

#### 4. System Administration

- ✅ Access to **analytics & performance dashboard**
- ✅ Database monitoring and optimization
- ✅ View and modify backup schedules
- ✅ Manual backup triggers
- ✅ Database restore operations
- ✅ View system logs and error reports
- ✅ Security audit trail management

**Implementation Notes:**
- Analytics routes in `analyticsRoutes.ts`
- Database monitoring in `systemAdminController.ts`
- Backup management in `backupRoutes.ts`
- Currently shared with system_admin

#### 5. Audit & Compliance

- ✅ View ALL audit logs (including admin actions)
- ✅ Export comprehensive audit reports
- ✅ Permanent deletion of audit logs (for compliance)
- ✅ Modify retention settings
- ✅ Access critical events dashboard

**Implementation Notes:**
- Audit service in `utils/auditService.ts`
- Need to implement filtering for normal admins (show only own actions)
- Audit log deletion should be super_admin only

#### 6. Notification System

- ✅ Manage global notification settings
- ✅ Send critical system-wide alerts
- ✅ Configure notification templates
- ✅ Receive all critical system alerts

**Implementation Notes:**
- Notification routes in `notificationRoutes.ts`
- Critical alert sending to super admins in `emailService.ts`

---

## 🟣 NORMAL ADMIN (admin) - Operational Authority

**Philosophy**: Day-to-day operations with business-level permissions, but no destructive system actions

### Normal Admin Capabilities

#### 1. User Management - Limited

- ✅ View all users (except viewing passwords)
- ✅ Create users (ONLY roles: manager, supervisor, clerk, driver, viewer, fuel_order_maker, yard_personnel, fuel_attendant, station_manager, payment_manager)
- ❌ **Cannot create**: super_admin, system_admin, admin, boss
- ✅ Edit user details (name, department, station, status)
- ✅ **Soft delete** non-admin users (clerk, driver, viewer, etc.)
- ❌ **Cannot delete**: super_admin, system_admin, admin, boss
- ✅ Toggle active/inactive status for operational users
- ❌ **Cannot ban/unban** users
- ❌ **Cannot force logout** users
- ✅ Reset passwords for non-admin users
- ❌ **Cannot reset** admin/boss passwords

**Implementation Required:**
- Add role validation in `createUser` controller
- Add role check in `deleteUser` controller
- Restrict password reset for privileged roles

#### 2. System Configuration - Read & Basic Updates

- ✅ **View** system configurations (routes, stations, rates)
- ✅ **Update** operational configs (fuel rates, station defaults)
- ❌ **Cannot modify**: Core system settings, security configs
- ❌ **Cannot access**: Database credentials, API keys, secrets
- ✅ Manage routes and station configurations
- ✅ Update LPO calculation formulas

**Implementation Required:**
- Separate operational config routes from system config routes
- Create new routes for operational configs accessible by admin

#### 3. Data Management - Soft Operations Only

- ✅ Create, read, update DOs/LPOs/Fuel Records
- ✅ **Soft delete** operational data (DOs, LPOs, Fuel Records)
- ✅ Approve/reject operational requests
- ✅ Export reports and data
- ❌ **Cannot permanently delete** anything
- ❌ **Cannot access trash** management
- ❌ **No restore capabilities** for deleted items
- ❌ **Cannot bulk delete** operations

**Current Status:**
- Soft delete implemented across all models
- Admin currently has access to trash routes (needs restriction)
- Export capabilities exist and are appropriate

#### 4. System Administration - Limited

- ✅ View dashboard with operational metrics
- ❌ **Cannot access**: System analytics, performance monitoring
- ❌ **Cannot access**: Database health/metrics
- ❌ **Cannot manage**: Backups or schedules
- ❌ **No database** operations
- ✅ View system notifications

**Implementation Required:**
- Remove admin from analytics routes
- Remove admin from database monitoring routes
- Remove admin from backup routes

#### 5. Audit & Compliance - Own Actions Only

- ✅ View audit logs **related to their actions**
- ❌ **Cannot view**: Super admin actions
- ❌ **Cannot view**: System-level events
- ✅ Export operational reports
- ❌ **Cannot modify**: Audit settings or retention
- ❌ **Cannot delete**: Audit logs

**Implementation Required:**
- Filter audit logs by username for admin role
- Restrict super_admin action visibility
- Remove admin access to audit log deletion

#### 6. Notification System

- ✅ View notifications assigned to them
- ✅ Mark notifications as read
- ❌ **Cannot manage**: Global notification settings
- ❌ **Cannot send**: System-wide alerts

**Current Status:**
- Notification viewing is appropriate
- Admin can currently manage notifications (needs restriction)

---

## 📊 Side-by-Side Comparison Table

| **Capability** | **Super Admin** | **Normal Admin** |
|---|---|---|
| Create super_admin users | ✅ Yes | ❌ No |
| Create system_admin users | ✅ Yes | ❌ No |
| Create admin users | ✅ Yes | ❌ No |
| Create boss users | ✅ Yes | ❌ No |
| Create operational users | ✅ Yes | ✅ Yes |
| Ban/Unban users | ✅ Yes | ❌ No |
| Permanent delete | ✅ Yes | ❌ No |
| Soft delete | ✅ Yes | ✅ Yes (non-admin) |
| Trash management | ✅ Full access | ❌ No access |
| Restore deleted items | ✅ Any item | ❌ No access |
| Force logout users | ✅ Yes | ❌ No |
| Modify core system configs | ✅ Yes | ❌ No |
| Update operational configs | ✅ Yes | ✅ Yes |
| Database monitoring | ✅ Full access | ❌ No access |
| Analytics dashboard | ✅ Yes | ❌ No |
| Backup management | ✅ Full control | ❌ No access |
| View all audit logs | ✅ Yes | ⚠️ Own actions only |
| Delete audit logs | ✅ Yes | ❌ No |
| Manage admin users | ✅ Yes | ❌ No |
| Manage operational users | ✅ Yes | ✅ Yes |
| CRUD DOs/LPOs/Fuel Records | ✅ Yes | ✅ Yes |
| Export reports | ✅ Yes | ✅ Yes |
| Manage routes/stations | ✅ Yes | ✅ Yes |
| View system notifications | ✅ Yes | ✅ Yes |
| Manage notification settings | ✅ Yes | ❌ No |

---

## 🔐 Implementation Recommendations

### 1. Backend Route-Level Protection

#### Update Required Routes:

**Trash Routes** (`backend/src/routes/trashRoutes.ts`)
```typescript
// Current: authorize('super_admin', 'system_admin')
// Change to: authorize('super_admin') only

router.get('/stats', authorize('super_admin'), ...);
router.get('/:type', authorize('super_admin'), ...);
router.post('/:type/:id/restore', authorize('super_admin'), ...);
```

**Analytics Routes** (`backend/src/routes/analyticsRoutes.ts`)
```typescript
// Current: authorize('system_admin', 'super_admin')
// Keep as is (analytics for system admins is appropriate)
// But add note that normal admin should not access
```

**Config Routes** (`backend/src/routes/configRoutes.ts`)
```typescript
// Create separation between system config and operational config
// System config: super_admin only
// Operational config: super_admin, admin

// New route structure:
router.use('/system', authorize('super_admin', 'system_admin'));
router.use('/operational', authorize('super_admin', 'admin'));
```

**User Routes** (`backend/src/routes/userRoutes.ts`)
```typescript
// Ban/Unban already restricted to super_admin ✓
// Force logout already restricted to super_admin ✓
```

### 2. Controller-Level Function Restrictions

#### User Controller (`backend/src/controllers/userController.ts`)

Add to `createUser` function:
```typescript
export const createUser = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { role } = req.body;
    const requestingUserRole = req.user?.role;
    
    // Define privileged roles that only super_admin can create
    const privilegedRoles = ['super_admin', 'system_admin', 'admin', 'boss'];
    
    if (privilegedRoles.includes(role) && requestingUserRole !== 'super_admin') {
      throw new ApiError(
        403, 
        'Only super administrators can create users with privileged roles (super_admin, system_admin, admin, boss)'
      );
    }
    
    // ... rest of existing logic
  }
};
```

Add to `deleteUser` function:
```typescript
export const deleteUser = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const requestingUserRole = req.user?.role;
    
    // Prevent self-deletion (existing check)
    if (req.user?.userId === id) {
      throw new ApiError(400, 'Cannot delete your own account');
    }
    
    // Get target user to check role
    const targetUser = await User.findOne({ _id: id, isDeleted: false });
    
    if (!targetUser) {
      throw new ApiError(404, 'User not found');
    }
    
    // Define privileged roles that only super_admin can delete
    const privilegedRoles = ['super_admin', 'system_admin', 'admin', 'boss'];
    
    if (privilegedRoles.includes(targetUser.role) && requestingUserRole !== 'super_admin') {
      throw new ApiError(
        403, 
        'Only super administrators can delete users with privileged roles'
      );
    }
    
    // ... rest of existing logic
  }
};
```

Add to `resetUserPassword` function:
```typescript
export const resetUserPassword = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const requestingUserRole = req.user?.role;
    
    const user = await User.findOne({ _id: id, isDeleted: false });
    
    if (!user) {
      throw new ApiError(404, 'User not found');
    }
    
    // Restrict password reset for privileged roles
    const privilegedRoles = ['super_admin', 'system_admin', 'admin', 'boss'];
    
    if (privilegedRoles.includes(user.role) && requestingUserRole !== 'super_admin') {
      throw new ApiError(
        403, 
        'Only super administrators can reset passwords for privileged users'
      );
    }
    
    // ... rest of existing logic
  }
};
```

#### Audit Service (`backend/src/utils/auditService.ts`)

Add filtering in `getLogs` method:
```typescript
// In AuditService.getLogs()
export async function getLogs(options: AuditLogQueryOptions) {
  const {
    action,
    resourceType,
    username,
    severity,
    startDate,
    endDate,
    page = 1,
    limit = 50,
    requestingUserRole,  // Add this parameter
    requestingUsername,  // Add this parameter
  } = options;

  const filter: any = {};
  
  // If requesting user is admin (not super_admin), show only their actions
  if (requestingUserRole === 'admin') {
    filter.username = requestingUsername;
  }
  
  // ... rest of existing filter logic
}
```

### 3. Frontend UI-Level Restrictions

#### Permissions Utility (`frontend/src/utils/permissions.ts`)

Update admin permissions:
```typescript
admin: {
  role: 'admin',
  description: 'Administrative access with most system privileges except critical operations',
  permissions: [
    { resource: RESOURCES.DASHBOARD, actions: [ACTIONS.READ, ACTIONS.MANAGE] },
    { resource: RESOURCES.DELIVERY_ORDERS, actions: [ACTIONS.READ, ACTIONS.CREATE, ACTIONS.UPDATE, ACTIONS.DELETE, ACTIONS.APPROVE, ACTIONS.EXPORT] },
    { resource: RESOURCES.LPOS, actions: [ACTIONS.READ, ACTIONS.CREATE, ACTIONS.UPDATE, ACTIONS.DELETE, ACTIONS.APPROVE, ACTIONS.EXPORT] },
    { resource: RESOURCES.FUEL_RECORDS, actions: [ACTIONS.READ, ACTIONS.CREATE, ACTIONS.UPDATE, ACTIONS.DELETE, ACTIONS.EXPORT] },
    { resource: RESOURCES.USERS, actions: [ACTIONS.READ, ACTIONS.UPDATE] }, // No CREATE or DELETE
    { resource: RESOURCES.REPORTS, actions: [ACTIONS.READ, ACTIONS.CREATE, ACTIONS.EXPORT] },
    { resource: RESOURCES.SYSTEM_CONFIG, actions: [ACTIONS.READ, ACTIONS.UPDATE] },
    // REMOVED: TRASH, PERMANENT_DELETE, DATABASE_MONITOR, AUDIT_LOGS management
  ],
},
```

#### Component Restrictions

**User Management Components:**
```typescript
// In CreateUserModal.tsx
const privilegedRoles = ['super_admin', 'system_admin', 'admin', 'boss'];
const availableRoles = user?.role === 'super_admin' 
  ? allRoles 
  : allRoles.filter(r => !privilegedRoles.includes(r.value));

// In UserManagementTab.tsx
const canDeleteUser = (targetUser: User) => {
  if (user?.role !== 'super_admin') {
    const privilegedRoles = ['super_admin', 'system_admin', 'admin', 'boss'];
    if (privilegedRoles.includes(targetUser.role)) {
      return false;
    }
  }
  return true;
};

const canBanUser = user?.role === 'super_admin';
const canForceLogout = user?.role === 'super_admin';
```

**Dashboard Components:**
```typescript
// In EnhancedDashboard.tsx
const canAccessTrash = user?.role === 'super_admin';
const canAccessAnalytics = ['super_admin', 'system_admin'].includes(user?.role);
const canAccessBackups = ['super_admin', 'system_admin'].includes(user?.role);

// Hide menu items for normal admin
{canAccessTrash && <TrashMenuItem />}
{canAccessAnalytics && <AnalyticsMenuItem />}
```

**Audit Log Components:**
```typescript
// In AuditLogViewer.tsx
useEffect(() => {
  const fetchAuditLogs = async () => {
    const params: any = { page, limit, ...filters };
    
    // If user is admin (not super_admin), filter to show only their actions
    if (user?.role === 'admin') {
      params.username = user.username;
    }
    
    const response = await auditService.getLogs(params);
    setLogs(response.logs);
  };
  
  fetchAuditLogs();
}, [user, page, limit, filters]);
```

### 4. Database Query Restrictions

#### Add Role-Based Filtering:
```typescript
// In any controller that needs role-based filtering
const buildFilterForRole = (requestingUserRole: string, requestingUsername: string, baseFilter: any) => {
  if (requestingUserRole === 'admin') {
    // Normal admin sees only their related data
    return {
      ...baseFilter,
      $or: [
        { createdBy: requestingUsername },
        { assignedTo: requestingUsername },
      ]
    };
  }
  
  // Super admin sees everything
  return baseFilter;
};
```

---

## 🎯 Key Security Principles

### 1. Principle of Least Privilege
- Users should have only the minimum permissions necessary to perform their job
- Normal admins handle day-to-day operations without system-breaking capabilities

### 2. Separation of Duties
- Destructive operations (permanent delete, ban, force logout) require super admin
- Operational tasks (create orders, manage users) can be handled by admin
- System administration (backups, monitoring) is separate from business operations

### 3. Defense in Depth
- **Layer 1**: Frontend UI restrictions (hide buttons, disable actions)
- **Layer 2**: API route authorization (middleware checks)
- **Layer 3**: Controller function validation (business logic checks)
- **Layer 4**: Database query filters (data-level security)

### 4. Audit Trail
- All privileged operations are logged
- Super admin actions have higher severity levels
- Admins cannot view or delete audit logs of super admin actions

### 5. Self-Protection
- No user can modify or delete their own account
- No user can elevate their own privileges
- Password resets for privileged users require super admin

### 6. Escalation Path
- Normal admins must request super admin for:
  - Creating privileged user accounts
  - Permanent deletion of any data
  - System configuration changes
  - Restoring deleted items
  - Accessing system analytics

---

## 📋 Implementation Checklist

### Backend Changes:

- [ ] **User Controller**
  - [ ] Add role validation in `createUser`
  - [ ] Add role check in `deleteUser`
  - [ ] Add role check in `resetUserPassword`
  - [ ] Add role check in `toggleUserStatus`

- [ ] **Audit Service**
  - [ ] Add role-based filtering in `getLogs`
  - [ ] Restrict audit log deletion to super_admin
  - [ ] Add severity levels for super admin actions

- [ ] **Routes**
  - [ ] Update trash routes (super_admin only)
  - [ ] Separate config routes (system vs operational)
  - [ ] Update notification management routes
  - [ ] Review all admin routes for proper restrictions

- [ ] **Middleware**
  - [ ] Add helper function for privilege checks
  - [ ] Add role hierarchy validation

### Frontend Changes:

- [ ] **Permissions Utility**
  - [ ] Update admin role permissions
  - [ ] Add helper functions for privilege checks
  - [ ] Document permission changes

- [ ] **Components**
  - [ ] Update CreateUserModal (restrict role options)
  - [ ] Update UserManagementTab (hide ban/delete for admins)
  - [ ] Update EnhancedDashboard (hide trash/analytics)
  - [ ] Update AuditLogViewer (filter by username for admins)
  - [ ] Update SystemAdminDashboard (access control)

- [ ] **Services**
  - [ ] Update API calls with role-aware parameters
  - [ ] Add error handling for permission denials

### Testing:

- [ ] **Unit Tests**
  - [ ] Test role validation in user creation
  - [ ] Test role validation in user deletion
  - [ ] Test audit log filtering
  - [ ] Test permission checks

- [ ] **Integration Tests**
  - [ ] Test admin cannot create super_admin
  - [ ] Test admin cannot delete admin/boss
  - [ ] Test admin cannot access trash
  - [ ] Test admin cannot access analytics
  - [ ] Test audit log visibility by role

- [ ] **E2E Tests**
  - [ ] Test complete admin workflow
  - [ ] Test complete super admin workflow
  - [ ] Test permission denials at UI level
  - [ ] Test permission denials at API level

### Documentation:

- [ ] Update API documentation with role requirements
- [ ] Create admin user guide
- [ ] Create super admin user guide
- [ ] Document escalation procedures
- [ ] Update system architecture documentation

---

## 🚀 Rollout Plan

### Phase 1: Backend Implementation (Week 1)
1. Implement controller-level validations
2. Update route authorizations
3. Add audit service filtering
4. Write unit tests

### Phase 2: Frontend Implementation (Week 2)
1. Update permissions utility
2. Modify UI components
3. Add role-based rendering
4. Update API service calls

### Phase 3: Testing (Week 3)
1. Comprehensive testing of all changes
2. Security audit
3. Performance testing
4. User acceptance testing

### Phase 4: Deployment (Week 4)
1. Deploy to staging environment
2. Train administrators
3. Deploy to production
4. Monitor for issues

---

## 📝 Notes

- Current codebase already has good foundation with `authorize()` middleware
- Ban/unban functionality exists and is properly restricted
- Trash management is well-structured but needs tighter access control
- Audit logging is comprehensive and needs filtering by role
- Frontend permissions system is robust and extensible

---

## 🔗 Related Files

### Backend:
- `backend/src/middleware/auth.ts` - Authentication and authorization
- `backend/src/controllers/userController.ts` - User management
- `backend/src/controllers/systemAdminController.ts` - System administration
- `backend/src/controllers/configController.ts` - Configuration management
- `backend/src/routes/trashRoutes.ts` - Trash management routes
- `backend/src/routes/userRoutes.ts` - User management routes
- `backend/src/routes/adminRoutes.ts` - Admin routes
- `backend/src/routes/systemAdminRoutes.ts` - System admin routes
- `backend/src/utils/auditService.ts` - Audit logging service
- `backend/src/models/User.ts` - User model

### Frontend:
- `frontend/src/utils/permissions.ts` - Permission definitions
- `frontend/src/components/EnhancedDashboard.tsx` - Main dashboard
- `frontend/src/components/SystemAdminDashboard.tsx` - System admin view
- `frontend/src/components/SuperAdmin/UserManagementTab.tsx` - User management
- `frontend/src/components/CreateUserModal.tsx` - User creation
- `frontend/src/types/index.ts` - Type definitions

---

**End of Document**
