# System Configuration API - Super Admin Only

**Date:** December 12, 2025  
**Author:** System  
**Purpose:** Comprehensive documentation for super admin system configuration endpoints

---

## Overview

This document describes the complete set of system configuration endpoints available exclusively to **Super Administrators**. These endpoints provide full control over critical system settings, external integrations, performance monitoring, and security parameters.

**Base URL:** `/api/system-admin/config`

**Authentication:** All endpoints require:
- Valid JWT token
- Role: `super_admin`

---

## 📋 Table of Contents

1. [System Settings Management](#system-settings-management)
2. [External Integrations](#external-integrations)
3. [Performance & Monitoring](#performance--monitoring)
4. [Critical System Access](#critical-system-access)
5. [Data Retention Policies](#data-retention-policies)

---

## System Settings Management

### 1. Get All System Settings

**GET** `/api/system-admin/config/settings`

Retrieves all system configuration settings including general, security, data retention, notifications, and maintenance settings.

**Response:**
```json
{
  "success": true,
  "message": "System settings retrieved successfully",
  "data": {
    "general": {
      "systemName": "Fuel Order Management System",
      "timezone": "Africa/Dar_es_Salaam",
      "dateFormat": "DD/MM/YYYY",
      "language": "en"
    },
    "session": {
      "sessionTimeout": 30,
      "jwtExpiry": 24,
      "refreshTokenExpiry": 7,
      "maxLoginAttempts": 5,
      "lockoutDuration": 15,
      "allowMultipleSessions": true
    },
    "data": {
      "archivalEnabled": true,
      "archivalMonths": 6,
      "auditLogRetention": 12,
      "trashRetention": 90,
      "autoCleanupEnabled": false,
      "backupFrequency": "daily",
      "backupRetention": 30
    },
    "notifications": {
      "emailNotifications": true,
      "criticalAlerts": true,
      "dailySummary": false,
      "weeklyReport": true,
      "slowQueryThreshold": 500,
      "storageWarningThreshold": 80
    },
    "maintenance": {
      "enabled": false,
      "message": "System is under maintenance. Please check back later.",
      "allowedRoles": ["super_admin"]
    }
  }
}
```

---

### 2. Update General Settings

**PUT** `/api/system-admin/config/settings/general`

Update general system settings like system name, timezone, date format, and language.

**Request Body:**
```json
{
  "systemName": "Fuel Order Management System",
  "timezone": "Africa/Dar_es_Salaam",
  "dateFormat": "DD/MM/YYYY",
  "language": "en"
}
```

**Response:**
```json
{
  "success": true,
  "message": "General settings updated successfully",
  "data": {
    "systemName": "Fuel Order Management System",
    "timezone": "Africa/Dar_es_Salaam",
    "dateFormat": "DD/MM/YYYY",
    "language": "en"
  }
}
```

**Audit Log:** Creates audit entry with action `update`, resourceType `config`

---

### 3. Update Security Settings

**PUT** `/api/system-admin/config/settings/security`

⚠️ **CRITICAL** - Updates session and security parameters affecting all users.

**Request Body:**
```json
{
  "sessionTimeout": 30,
  "jwtExpiry": 24,
  "refreshTokenExpiry": 7,
  "maxLoginAttempts": 5,
  "lockoutDuration": 15,
  "allowMultipleSessions": true
}
```

**Response:**
```json
{
  "success": true,
  "message": "Security settings updated successfully. Changes will take effect for new sessions.",
  "data": {
    "sessionTimeout": 30,
    "jwtExpiry": 24,
    "refreshTokenExpiry": 7,
    "maxLoginAttempts": 5,
    "lockoutDuration": 15,
    "allowMultipleSessions": true
  }
}
```

**Audit Log:** Creates audit entry with **HIGH severity**

**Notes:**
- Changes affect new sessions only (existing sessions remain valid until expiry)
- JWT changes require users to re-login after current token expires
- Exercise caution when modifying these values

---

### 4. Update Data Retention Settings

**PUT** `/api/system-admin/config/settings/data-retention`

Configure data archival, retention periods for trash, backups, and audit logs.

**Request Body:**
```json
{
  "archivalEnabled": true,
  "archivalMonths": 6,
  "auditLogRetention": 12,
  "trashRetention": 90,
  "autoCleanupEnabled": false,
  "backupFrequency": "daily",
  "backupRetention": 30
}
```

**Response:**
```json
{
  "success": true,
  "message": "Data retention settings updated successfully",
  "data": {
    "archivalEnabled": true,
    "archivalMonths": 6,
    "auditLogRetention": 12,
    "trashRetention": 90,
    "autoCleanupEnabled": false,
    "backupFrequency": "daily",
    "backupRetention": 30
  }
}
```

**Parameters:**
- `archivalEnabled`: Enable/disable automatic data archival
- `archivalMonths`: Age in months before data is archived
- `auditLogRetention`: How long to keep audit logs (months)
- `trashRetention`: How long to keep deleted items in trash (days)
- `autoCleanupEnabled`: Automatically delete old trash items
- `backupFrequency`: `daily`, `weekly`, or `monthly`
- `backupRetention`: How long to keep backups (days)

---

### 5. Update Notification Settings

**PUT** `/api/system-admin/config/settings/notifications`

Configure system-wide notification preferences.

**Request Body:**
```json
{
  "emailNotifications": true,
  "criticalAlerts": true,
  "dailySummary": false,
  "weeklyReport": true,
  "slowQueryThreshold": 500,
  "storageWarningThreshold": 80
}
```

**Response:**
```json
{
  "success": true,
  "message": "Notification settings updated successfully",
  "data": {
    "emailNotifications": true,
    "criticalAlerts": true,
    "dailySummary": false,
    "weeklyReport": true,
    "slowQueryThreshold": 500,
    "storageWarningThreshold": 80
  }
}
```

---

### 6. Update Maintenance Mode

**PUT** `/api/system-admin/config/settings/maintenance`

⚠️ **CRITICAL** - Enable or disable system-wide maintenance mode.

**Request Body:**
```json
{
  "enabled": true,
  "message": "System is under maintenance. We'll be back shortly.",
  "allowedRoles": ["super_admin", "system_admin"]
}
```

**Response:**
```json
{
  "success": true,
  "message": "Maintenance mode enabled successfully",
  "data": {
    "enabled": true,
    "message": "System is under maintenance. We'll be back shortly.",
    "allowedRoles": ["super_admin", "system_admin"]
  }
}
```

**Audit Log:** Creates audit entry with **CRITICAL severity**

**Notes:**
- When enabled, only users with roles in `allowedRoles` can access the system
- All other users will see the maintenance message
- Use for system updates, database maintenance, or critical fixes

---

## External Integrations

### 7. Get Cloudflare R2 Configuration

**GET** `/api/system-admin/config/r2`

Retrieve Cloudflare R2 (S3-compatible storage) configuration with masked credentials.

**Response:**
```json
{
  "success": true,
  "message": "R2 configuration retrieved successfully",
  "data": {
    "r2Endpoint": "https://your-account.r2.cloudflarestorage.com",
    "r2BucketName": "fuel-order-backups",
    "r2AccessKeyId": "***d8f9",
    "r2SecretAccessKey": "***************",
    "isConfigured": true
  }
}
```

**Audit Log:** Creates audit entry with **MEDIUM severity**

**Notes:**
- Access key and secret are masked for security
- Only the last 4 characters of access key are shown
- Configuration is read from environment variables

---

### 8. Test R2 Connection

**POST** `/api/system-admin/config/r2/test`

Test connectivity to Cloudflare R2 storage.

**Response:**
```json
{
  "success": true,
  "message": "R2 connection test successful (configuration verified)",
  "data": {
    "configured": true,
    "endpoint": "https://your-account.r2.cloudflarestorage.com",
    "bucket": "fuel-order-backups"
  }
}
```

**Error Response:**
```json
{
  "success": false,
  "message": "R2 is not configured. Please set R2 environment variables."
}
```

---

### 9. Get Email Configuration

**GET** `/api/system-admin/config/email`

Retrieve email server configuration with masked password.

**Response:**
```json
{
  "success": true,
  "message": "Email configuration retrieved successfully",
  "data": {
    "emailHost": "smtp.gmail.com",
    "emailPort": "587",
    "emailUser": "notifications@yourcompany.com",
    "emailPassword": "***************",
    "emailFrom": "Fuel Order System <notifications@yourcompany.com>",
    "isConfigured": true
  }
}
```

**Audit Log:** Creates audit entry with **MEDIUM severity**

---

### 10. Get Database Configuration

**GET** `/api/system-admin/config/database`

Retrieve database connection information with masked credentials.

**Response:**
```json
{
  "success": true,
  "message": "Database configuration retrieved successfully",
  "data": {
    "host": "localhost",
    "port": "27017",
    "database": "fuel_order_db",
    "username": "***in",
    "password": "***************",
    "isConfigured": true
  }
}
```

**Audit Log:** Creates audit entry with **HIGH severity**

⚠️ **Security Note:** This endpoint reveals database connection details (though masked). Access is logged and monitored.

---

## Performance & Monitoring

### 11. Get Profiling Settings

**GET** `/api/system-admin/config/profiling`

Retrieve current performance profiling configuration.

**Response:**
```json
{
  "success": true,
  "message": "Profiling settings retrieved successfully",
  "data": {
    "enabled": false,
    "sampleRate": 0.1,
    "slowQueryThreshold": 500
  }
}
```

---

### 12. Update Profiling Settings

**PUT** `/api/system-admin/config/profiling`

Enable/disable performance profiling and monitoring.

**Request Body:**
```json
{
  "enabled": true,
  "sampleRate": 0.1,
  "slowQueryThreshold": 500
}
```

**Response:**
```json
{
  "success": true,
  "message": "Performance profiling enabled successfully",
  "data": {
    "enabled": true,
    "sampleRate": 0.1,
    "slowQueryThreshold": 500
  }
}
```

**Parameters:**
- `enabled`: Enable/disable profiling
- `sampleRate`: Percentage of requests to profile (0.0 - 1.0)
- `slowQueryThreshold`: Database queries slower than this (ms) are logged

**Audit Log:** Creates audit entry with **MEDIUM severity**

---

## Critical System Access

### 13. Get Environment Variables

**GET** `/api/system-admin/config/environment`

⚠️ **CRITICAL** - View system environment variables (masked).

**Response:**
```json
{
  "success": true,
  "message": "Environment variables retrieved successfully (masked)",
  "data": {
    "nodeEnv": "production",
    "port": "5000",
    "timezone": "Africa/Dar_es_Salaam",
    "mongoConfigured": true,
    "jwtSecretConfigured": true,
    "jwtRefreshSecretConfigured": true,
    "emailConfigured": true,
    "r2Configured": true,
    "nodeVersion": "v18.17.0",
    "platform": "linux",
    "arch": "x64"
  }
}
```

**Audit Log:** Creates audit entry with **CRITICAL severity**

**Security:**
- This endpoint is heavily monitored
- Every access is logged with IP address
- Only shows configuration status, not actual values
- Useful for verifying system setup without exposing secrets

---

## Data Retention Policies

### 14. Get Retention Settings (Alternative Endpoint)

**GET** `/api/trash/retention-settings`

Get retention policies for trash and backups (also accessible via data retention settings).

**Response:**
```json
{
  "success": true,
  "data": {
    "retentionDays": 90,
    "autoCleanupEnabled": false,
    "backupRetention": 30,
    "archivalMonths": 6
  }
}
```

---

### 15. Update Retention Settings (Alternative Endpoint)

**PUT** `/api/trash/retention-settings`

Update trash and backup retention policies (super admin only).

**Request Body:**
```json
{
  "retentionDays": 90,
  "autoCleanupEnabled": false,
  "backupRetention": 30,
  "archivalMonths": 6
}
```

**Response:**
```json
{
  "success": true,
  "message": "Retention policy updated successfully",
  "data": {
    "retentionDays": 90,
    "autoCleanupEnabled": false,
    "backupRetention": 30,
    "archivalMonths": 6
  }
}
```

---

## Security Considerations

### Authorization
- All endpoints require `super_admin` role
- Requests without proper authorization return `403 Forbidden`
- Invalid tokens return `401 Unauthorized`

### Audit Logging
- Every configuration change is logged
- Severity levels: `low`, `medium`, `high`, `critical`
- Logs include: user, timestamp, IP address, old/new values
- Critical operations trigger alerts to super admins

### Rate Limiting
- Configuration endpoints should be rate-limited
- Recommended: 10 requests per minute per user
- Prevents brute force or automated attacks

### Sensitive Data
- Passwords and secrets are never returned in plain text
- Connection strings are parsed and masked
- Environment variables show only configuration status

---

## Implementation Checklist

### Backend ✅
- [x] Create `systemConfigController.ts` with all controller functions
- [x] Create `systemConfigRoutes.ts` with super_admin authorization
- [x] Register routes in main router
- [x] Update `trashController.ts` to use SystemConfig model
- [x] Add audit logging for all configuration changes
- [x] Implement masking for sensitive data

### Frontend (To Do)
- [ ] Create system configuration dashboard component
- [ ] Add forms for each configuration category
- [ ] Implement validation for all fields
- [ ] Add confirmation dialogs for critical changes
- [ ] Create environment variables viewer
- [ ] Add R2 and email configuration test buttons
- [ ] Display current profiling status
- [ ] Show maintenance mode toggle with warning

### Testing (To Do)
- [ ] Unit tests for all controller functions
- [ ] Integration tests for configuration updates
- [ ] Test authorization (non-super_admin should be denied)
- [ ] Test audit logging for all operations
- [ ] Test sensitive data masking
- [ ] Test maintenance mode enforcement

---

## Usage Examples

### Enable Maintenance Mode
```bash
curl -X PUT https://api.yourcompany.com/api/system-admin/config/settings/maintenance \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "enabled": true,
    "message": "System upgrade in progress. Back at 10:00 PM.",
    "allowedRoles": ["super_admin"]
  }'
```

### Update Trash Retention
```bash
curl -X PUT https://api.yourcompany.com/api/system-admin/config/settings/data-retention \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "trashRetention": 60,
    "autoCleanupEnabled": true
  }'
```

### Enable Performance Profiling
```bash
curl -X PUT https://api.yourcompany.com/api/system-admin/config/profiling \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "enabled": true,
    "sampleRate": 0.1,
    "slowQueryThreshold": 300
  }'
```

---

## Related Files

### Backend
- `/backend/src/controllers/systemConfigController.ts` - Controller functions
- `/backend/src/routes/systemConfigRoutes.ts` - Route definitions
- `/backend/src/models/SystemConfig.ts` - SystemConfig model
- `/backend/src/controllers/trashController.ts` - Retention settings
- `/backend/src/utils/auditService.ts` - Audit logging

### Documentation
- `/ACL_SEPARATION_SUPER_ADMIN_VS_NORMAL_ADMIN.md` - Role separation guide
- `/PASSWORD_RESET_SYSTEM.md` - Password management

---

**Last Updated:** December 12, 2025  
**Status:** ✅ Implemented and Ready for Testing
