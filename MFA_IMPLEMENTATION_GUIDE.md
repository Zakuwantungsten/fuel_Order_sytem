# Multi-Factor Authentication (MFA) Implementation Guide

## Overview

This document describes the complete Multi-Factor Authentication (MFA) system implemented for the Fuel Order Management System.

## Features Implemented

### ✅ Backend Implementation

1. **MFA Model** (`backend/src/models/MFA.ts`)
   - Stores user MFA preferences and settings
   - Supports TOTP (Time-based One-Time Password)
   - Backup codes for emergency access
   - Trusted device management (30-day expiry)
   - SMS & Email OTP placeholders (for future implementation)
   - Encrypted sensitive fields (phone numbers, secrets)

2. **MFA Service** (`backend/src/services/mfaService.ts`)
   - TOTP secret generation using `speakeasy`
   - QR code generation for authenticator apps
   - Backup code generation and verification
   - MFA verification logic with lockout protection
   - Device trust management
   - Email/SMS OTP sending (basic implementation)

3. **MFA Controller** (`backend/src/controllers/mfaController.ts`)
   - `GET /api/mfa/status` - Get user's MFA settings
   - `POST /api/mfa/setup/totp/generate` - Generate TOTP secret & QR code
   - `POST /api/mfa/setup/totp/verify` - Verify code and enable TOTP
   - `POST /api/mfa/verify` - Verify MFA code during login
   - `POST /api/mfa/backup-codes/regenerate` - Regenerate backup codes  
   - `POST /api/mfa/disable` - Disable MFA (requires password)
   - `GET /api/mfa/trusted-devices` - List trusted devices
   - `DELETE /api/mfa/trusted-devices/:deviceId` - Remove trusted device
   - `POST /api/mfa/check-device` - Check if device is trusted

4. **Enhanced Auth Controller** (`backend/src/controllers/authController.ts`)
   - Modified login flow to check for MFA
   - Returns temporary session token if MFA required
   - Skips MFA for trusted devices
   - New `verifyMFA` endpoint for completing login after MFA

5. **SMS Service** (`backend/src/services/smsService.ts`)
   - Basic SMS service implementation
   - Can be extended with Twilio, AWS SNS, etc.

### ✅ Frontend Implementation

1. **MFA Setup Component** (`frontend/src/components/MFASetup.tsx`)
   - Multi-step wizard for MFA setup
   - Choose MFA method (TOTP/SMS/Email)
   - Scan QR code with authenticator app
   - Manual entry key display
   - Verification code input
   - Backup codes display with download/copy
   - Dark mode support

2. **MFA Verification Component** (`frontend/src/components/MFAVerification.tsx`)
   - Shown during login when MFA is required
   - Support for TOTP and backup codes
   - Trust device option (30-day remember)
   - Auto-generated device names
   - Error handling and rate limiting

3. **MFA Settings Component** (`frontend/src/components/MFASettings.tsx`)
   - View MFA status and settings
   - Enable/disable MFA
   - Regenerate backup codes
   - Manage trusted devices
   - Password confirmation for disable

4. **Updated Login Component** (`frontend/src/components/Login.tsx`)
   - Handles MFA challenge workflow
   - Shows MFA verification when required
   - Device ID generation and storage
   - Seamless transition after MFA verification

## Authentication Flow

### Standard Login (No MFA)
```
1. User enters username/password → POST /api/auth/login
2. Backend verifies credentials
3. Returns access & refresh tokens
4. User redirected to dashboard
```

### MFA-Enabled Login
```
1. User enters username/password → POST /api/auth/login
2. Backend verifies credentials
3. Backend checks if MFA enabled
4. If device is trusted → skip MFA, return tokens
5. If device not trusted → return requiresMFA: true
6. Frontend shows MFA verification component
7. User enters MFA code → POST /api/auth/verify-mfa
8. Backend verifies MFA code
9. If "trust device" checked → add to trusted devices
10. Returns final access & refresh tokens
11. User redirected to dashboard
```

## Setup Instructions

### 1. Install Dependencies

**Backend:**
```bash
cd backend
npm install speakeasy qrcode @types/speakeasy @types/qrcode
```

**Frontend:**
```bash
cd frontend
npm install react-qr-code
```

### 2. Environment Variables

Add to `backend/.env`:
```env
# MFA Encryption Key (32-byte hex string)
# Generate with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
MFA_ENCRYPTION_KEY=your_32_byte_hex_key_here

# App name for TOTP (shows in authenticator app)
APP_NAME=Fuel Order Management System

# SMS Provider (optional - for future SMS OTP)
# TWILIO_ACCOUNT_SID=your_account_sid
# TWILIO_AUTH_TOKEN=your_auth_token
# TWILIO_PHONE_NUMBER=your_twilio_number
```

### 3. Database Migration

The MFA model will be automatically created on first use. No manual migration required.

## User Guide

### Enabling MFA

1. Navigate to Profile Settings → Security → MFA Settings
2. Click "Enable MFA"
3. Choose "Authenticator App" (recommended)
4. Scan QR code with Google Authenticator, Authy, or similar app
5. Enter 6-digit code from app to verify
6. **Important:** Save the 10 backup codes in a safe place
7. MFA is now enabled

### Logging in with MFA

1. Enter username and password as usual
2. If MFA is enabled, you'll see a verification screen
3. Open your authenticator app and enter the 6-digit code
4. Optional: Check "Trust this device for 30 days" to skip MFA on this device
5. Click "Verify" to complete login

### Using Backup Codes

- If you lose your authenticator device, use a backup code
- Each code can only be used once
- Switch to "Backup Code" method during login
- Enter code in format: XXXX-XXXX
- After using a backup code, reconfigure MFA or regenerate codes

### Managing Trusted Devices

- View all trusted devices in MFA Settings
- Each device auto-expires after 30 days
- Remove any device you no longer use
- Maximum 5 trusted devices per account

### Disabling MFA

1. Go to MFA Settings
2. Click "Disable MFA"
3. Enter your password to confirm
4. **Note:** Admin-required roles cannot disable MFA

## Security Features

- ✅ TOTP verification with 2-step time window (clock drift tolerance)
- ✅ Backup codes with bcrypt hashing
- ✅ Account lockout after 5 failed MFA attempts (15 minutes)
- ✅ Trusted device fingerprinting
- ✅ Encrypted secrets (AES-256-GCM)
- ✅ Rate limiting on MFA endpoints
- ✅ Audit logging for all MFA events
- ✅ Session invalidation on MFA changes

## Admin Controls

### Enforcing MFA for Roles

The system automatically requires MFA for:
- super_admin
- admin
- system_admin

To customize, modify `mfaService.ts`:
```typescript
async isMFARequired(userId: string): Promise<boolean> {
  const user = await User.findById(userId);
  if (!user) return false;
  
  // Add/remove roles as needed
  const mfaRequiredRoles = ['super_admin', 'admin', 'system_admin'];
  return mfaRequiredRoles.includes(user.role);
}
```

## Troubleshooting

### "Invalid verification code" error
- Ensure device time is synchronized (TOTP is time-based)
- Try the next code that appears in your app
- Use a backup code if authenticator app is not working

### Lost authenticator device
- Use one of your backup codes to log in
- Go to MFA Settings and disable MFA
- Re-enable MFA with a new device
- Save new backup codes

### Backup codes not working
- Ensure you're entering the code correctly (format: XXXX-XXXX)
- Each code can only be used once
- Regenerate codes if you've used them all

## Testing

### Manual Testing Steps

1. **Test MFA Setup:**
   - Create test user
   - Enable MFA with authenticator app
   - Verify QR code scanning works
   - Verify manual key entry works
   - Save backup codes

2. **Test Login Flow:**
   - Log out
   - Log in with username/password
   - Complete MFA verification
   - Verify successful login

3. **Test Trusted Device:**
   - Enable "Trust this device"
   - Log out and log in again
   - Verify MFA is skipped
   - Check device appears in trusted devices list

4. **Test Backup Codes:**
   - Log out
   - Log in with username/password
   - Use backup code instead of TOTP
   - Verify login successful
   - Verify code is marked as used

5. **Test Account Lockout:**
   - Attempt MFA verification with wrong code 5 times
   - Verify account locked for 15 minutes
   - Wait and verify unlock

## Future Enhancements

- [ ] SMS OTP integration (Twilio)
- [ ] Email OTP integration
- [ ] WebAuthn/FIDO2 support (hardware keys)
- [ ] Admin dashboard to view MFA adoption rates
- [ ] Force MFA enrollment on first login for admins
- [ ] Recovery email verification
- [ ] Push notification MFA (mobile app)

## API Reference

### MFA Endpoints

All MFA endpoints are prefixed with `/api/mfa`

#### GET /status
Get current user's MFA status
- **Auth**: Required
- **Response:**
```json
{
  "success": true,
  "data": {
    "isEnabled": true,
    "isRequired": false,
    "totpEnabled": true,
    "preferredMethod": "totp",
    "backupCodesRemaining": 8,
    "trustedDevicesCount": 2
  }
}
```

#### POST /setup/totp/generate
Generate TOTP secret and QR code
- **Auth**: Required
- **Response:**
```json
{
  "success": true,
  "data": {
    "secret": "JBSWY3DPEHPK3PXP",
    "qrCodeUrl": "data:image/png;base64,...",
    "manualEntryKey": "JBSWY3DPEHPK3PXP"
  }
}
```

#### POST /setup/totp/verify
Verify TOTP code and enable MFA
- **Auth**: Required
- **Body:**
```json
{
  "secret": "JBSWY3DPEHPK3PXP",
  "code": "123456"
}
```
- **Response:**
```json
{
  "success": true,
  "message": "TOTP MFA enabled successfully",
  "data": {
    "backupCodes": ["XXXX-XXXX", "YYYY-YYYY", ...]
  }
}
```

#### POST /verify
Verify MFA code (during login or sensitive operations)
- **Auth**: Not required (uses temp session token)
- **Body:**
```json
{
  "userId": "user_id",
  "tempSessionToken": "temp_token",
  "code": "123456",
  "method": "totp",
  "trustDevice": true,
  "deviceName": "Chrome on Windows"
}
```

## Files Modified/Created

### Backend
- ✅ `src/models/MFA.ts` (new)
- ✅ `src/services/mfaService.ts` (new)
- ✅ `src/services/smsService.ts` (new)
- ✅ `src/controllers/mfaController.ts` (new)
- ✅ `src/routes/mfaRoutes.ts` (new)
- ✅ `src/routes/index.ts` (modified - added MFA routes)
- ✅ `src/controllers/authController.ts` (modified - added MFA logic to login)
- ✅ `src/routes/authRoutes.ts` (modified - added verify-mfa route)

### Frontend
- ✅ `src/components/MFASetup.tsx` (new)
- ✅ `src/components/MFAVerification.tsx` (new)
- ✅ `src/components/MFASettings.tsx` (new)
- ✅ `src/components/Login.tsx` (modified - MFA challenge handling)

## Support

For issues or questions:
1. Check this documentation
2. Review error logs in backend/logs
3. Check browser console for frontend errors
4. Contact system administrator
