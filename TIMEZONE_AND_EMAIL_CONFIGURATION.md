# System Configuration: Timezone & Email Setup

## Summary of Changes

This document summarizes all changes made to set the timezone to **Africa/Nairobi** and configure **email settings** throughout the system.

---

## 1. Timezone Updates (Africa/Dar_es_Salaam → Africa/Nairobi)

### Backend Changes

#### Files Modified:
1. **`backend/src/models/SystemConfig.ts`**
   - Changed default timezone from `'Africa/Dar_es_Salaam'` to `'Africa/Nairobi'` (line 170)

2. **`backend/src/controllers/systemConfigController.ts`**
   - Updated default timezone in `getSystemSettings()` (line 28)
   - Updated environment variable default in `getEnvironmentVariables()` (line 573)

3. **`backend/src/controllers/adminController.ts`**
   - Updated default timezone in system config initialization (line 1393)

4. **`backend/src/config/index.ts`**
   - Added `timezone` config property with default `'Africa/Nairobi'`
   - Reads from `process.env.TZ` environment variable

### Frontend Changes

1. **`frontend/src/components/SuperAdmin/SystemConfigDashboard.tsx`**
   - Changed default timezone state from `'Africa/Dar_es_Salaam'` to `'Africa/Nairobi'`

2. **`frontend/src/utils/timezone.ts`** (NEW FILE)
   - Created comprehensive timezone utility with functions:
     - `setSystemTimezone(timezone)` - Set system timezone globally
     - `getSystemTimezone()` - Get current system timezone
     - `formatDate()` - Format dates with timezone awareness
     - `formatDateOnly()` - Date without time
     - `formatTimeOnly()` - Time without date
     - `formatRelativeTime()` - Relative time (e.g., "2 hours ago")
     - `formatTableDate()` - Compact format for tables

3. **`frontend/src/contexts/AuthContext.tsx`**
   - Added system settings loading on app initialization
   - Automatically sets timezone when app loads using `setSystemTimezone()`

---

## 2. Email Configuration System

### Backend Changes

#### A. Database Model Updates

**`backend/src/models/SystemConfig.ts`**
- Added `email` configuration section to SystemSettings interface:
  ```typescript
  email?: {
    host: string;
    port: number;
    secure: boolean;
    user: string;
    password: string;
    from: string;
    fromName: string;
  };
  ```
- Added email schema with defaults (port: 587, secure: false, fromName: 'Fuel Order System')

#### B. Configuration Management

**`backend/src/config/index.ts`**
- Added email configuration properties:
  - `emailHost` - SMTP host
  - `emailPort` - SMTP port (default 587)
  - `emailSecure` - Use SSL/TLS
  - `emailUser` - SMTP username
  - `emailPassword` - SMTP password
  - `emailFrom` - From email address
  - `emailFromName` - From display name
- Supports both old (`SMTP_*`) and new (`EMAIL_*`) environment variable names

#### C. Email Service Enhancement

**`backend/src/services/emailService.ts`**
- **Major refactor** to support dual configuration sources:
  1. **Database** (SystemConfig) - Takes priority
  2. **Environment Variables** - Fallback
- New method: `getEmailConfig()` - Fetches config from DB or env vars
- New method: `reinitialize()` - Reloads email service after config changes
- Updated all `sendMail()` calls to use configured `from` address
- Stores current config in `currentConfig` property

#### D. API Controller Updates

**`backend/src/controllers/systemConfigController.ts`**
- **Updated** `getEmailConfiguration()`:
  - Now reads from SystemConfig database first
  - Falls back to environment variables
  - Returns source (`'database'` or `'environment'`)
  - Returns new fields: `host`, `port`, `secure`, `user`, `from`, `fromName`
- **New endpoint** `updateEmailConfiguration()`:
  - `PUT /api/system-admin/config/email`
  - Validates required fields (host, user, from)
  - Saves email config to SystemConfig database
  - Automatically reinitializes email service
  - Logs audit trail with HIGH severity

#### E. Routes

**`backend/src/routes/systemConfigRoutes.ts`**
- Added `PUT /email` route for updating email configuration
- Protected with `super_admin` authorization

### Frontend Changes

#### A. Service Layer

**`frontend/src/services/systemConfigService.ts`**
- Updated `EmailConfiguration` interface to match new backend response:
  ```typescript
  {
    host: string;
    port: number;
    secure: boolean;
    user: string;
    password: string;
    from: string;
    fromName: string;
    isConfigured: boolean;
    source?: 'database' | 'environment';
  }
  ```
- Added `updateEmailConfiguration()` method

#### B. UI Components

**`frontend/src/components/SuperAdmin/SystemConfigDashboard.tsx`**
- **Replaced** read-only email display with full configuration form
- Form fields:
  - SMTP Host (text input)
  - Port (number input, default 587)
  - Username (text input)
  - Password (password input, placeholder: "Leave blank to keep current")
  - From Email (email input)
  - From Name (text input)
  - Use SSL/TLS checkbox (for port 465)
- Added configuration tips for Gmail and Office 365
- Shows configuration source badge (Database/Environment)
- New function: `saveEmailConfiguration()` - Validates and saves config
- Auto-reloads config after successful save to display masked values

---

## 3. Environment Variables

### Required for Email (Choose ONE method):

#### Method 1: Database Configuration (Recommended)
Configure via Super Admin Dashboard → Integrations tab → Email Configuration

#### Method 2: Environment Variables
Add to `.env` file:
```env
# Email Configuration
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_SECURE=false
EMAIL_USER=your-email@gmail.com
EMAIL_PASSWORD=your-app-password
EMAIL_FROM=noreply@yourcompany.com
EMAIL_FROM_NAME=Fuel Order System

# OR use legacy variable names:
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
```

### Optional Timezone Override:
```env
TZ=Africa/Nairobi
```

---

## 4. Usage Examples

### Frontend: Using Timezone Utilities

```typescript
import { formatDate, formatDateOnly, formatRelativeTime } from '../utils/timezone';

// Format with time
const fullDate = formatDate(new Date()); // "12/12/2025, 14:30" (in Nairobi time)

// Date only
const dateOnly = formatDateOnly(new Date()); // "12/12/2025"

// Relative time
const relative = formatRelativeTime(createdAt); // "2 hours ago"
```

### Backend: Email Service

```typescript
import emailService from '../services/emailService';

// Send critical alert (uses configured SMTP)
await emailService.sendCriticalEmail({
  subject: 'System Alert',
  message: 'Something important happened',
  priority: 'critical',
});

// After updating email config in database
await emailService.reinitialize();
```

---

## 5. Testing

### Test Email Configuration:

1. Navigate to **Super Admin Dashboard** → **Integrations** tab
2. Fill in email configuration form:
   - **Gmail**: `smtp.gmail.com:587` with App Password
   - **Office 365**: `smtp.office365.com:587`
   - **Other**: Use your provider's SMTP settings
3. Click **Save Email Configuration**
4. Test by triggering a password reset or critical alert

### Verify Timezone:

1. Check system settings in **Super Admin Dashboard** → **Settings** → **General**
2. Confirm timezone is set to `Africa/Nairobi`
3. Verify dates throughout the app display in Nairobi time
4. Check audit logs, fuel records, and reports for correct timestamps

---

## 6. Migration Notes

### Existing Installations:

1. **Timezone**: Will automatically use `Africa/Nairobi` after restart
2. **Email**: 
   - If `.env` has `SMTP_*` or `EMAIL_*` variables, they will be used
   - Can override by configuring in Super Admin Dashboard
   - Database config takes priority over environment variables

### New Installations:

1. Set timezone in Super Admin Dashboard (defaults to Nairobi)
2. Configure email via UI (no `.env` changes needed)

---

## 7. Security Considerations

- Email passwords are **masked** in all GET responses
- Email configuration changes are **audit logged** with HIGH severity
- Only **super_admin** role can view/modify email settings
- Password field accepts input but never returns actual password
- If password is left blank during update, existing password is preserved

---

## 8. Files Changed Summary

### Backend (7 files):
1. `src/models/SystemConfig.ts` - Added email schema
2. `src/config/index.ts` - Added email config properties
3. `src/services/emailService.ts` - Enhanced to use DB config
4. `src/controllers/systemConfigController.ts` - Email CRUD endpoints
5. `src/controllers/adminController.ts` - Timezone default
6. `src/routes/systemConfigRoutes.ts` - Email update route

### Frontend (4 files):
1. `src/services/systemConfigService.ts` - Email API methods
2. `src/components/SuperAdmin/SystemConfigDashboard.tsx` - Email UI form
3. `src/contexts/AuthContext.tsx` - Timezone initialization
4. `src/utils/timezone.ts` - NEW timezone utility library

---

## 9. API Documentation

### GET /api/system-admin/config/email
**Returns:**
```json
{
  "success": true,
  "data": {
    "host": "smtp.gmail.com",
    "port": 587,
    "secure": false,
    "user": "system@example.com",
    "password": "***************",
    "from": "noreply@example.com",
    "fromName": "Fuel Order System",
    "isConfigured": true,
    "source": "database"
  }
}
```

### PUT /api/system-admin/config/email
**Request Body:**
```json
{
  "host": "smtp.gmail.com",
  "port": 587,
  "secure": false,
  "user": "system@example.com",
  "password": "app-password-here",
  "from": "noreply@example.com",
  "fromName": "Fuel Order System"
}
```

**Note:** Password is optional in update requests. Omit to keep existing password.

---

## Completion Status: ✅ ALL TASKS COMPLETE

1. ✅ Timezone changed to Nairobi (backend + frontend)
2. ✅ Email configuration added to database model
3. ✅ Email service enhanced to use database config
4. ✅ Email update endpoint created (super admin only)
5. ✅ Frontend email configuration UI implemented
6. ✅ Timezone utility created for consistent formatting
7. ✅ System-wide integration complete
