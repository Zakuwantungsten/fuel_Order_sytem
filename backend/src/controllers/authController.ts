import { Response } from 'express';
import bcrypt from 'bcryptjs';
import { User, DriverCredential, SystemConfig, IDriverCredential, IUserDocument } from '../models';
import { MFA } from '../models/MFA';
import UserMFA from '../models/UserMFA';
import LoginActivity from '../models/LoginActivity';
import { KnownDevice } from '../models/KnownDevice';
import { ApiError } from '../middleware/errorHandler';
import { generateTokens, verifyRefreshToken, logger, createDriverUserId } from '../utils';
import { AuditService } from '../utils/auditService';
import AnomalyDetectionService from '../utils/anomalyDetectionService';
import { AuthRequest, invalidateAuthUserCache } from '../middleware/auth';
import { LoginRequest, RegisterRequest, AuthResponse, JWTPayload } from '../types';
import * as crypto from 'crypto';
import emailService from '../services/emailService';
import mfaService from '../services/mfaService';
import { emitToUser } from '../services/websocket';
import { getPasswordPolicy, enforcePasswordPolicy } from '../utils/passwordPolicy';
import { checkBreachedPassword } from '../utils/breachedPasswordCheck';
import { assessLoginRisk } from '../utils/riskScoringService';

/** Build secure HttpOnly cookie options for the remember-me refresh token */
function refreshCookieOptions(maxAgeDays: number): object {
  const isProd = process.env.NODE_ENV === 'production';
  return {
    httpOnly: true,
    secure: isProd,
    // SameSite=None is required for cross-origin requests (Firebase → Railway).
    // The HttpOnly flag still prevents JS access, so XSS cannot steal the cookie.
    // CSRF is handled by the separate HMAC-signed X-XSRF-TOKEN header.
    sameSite: isProd ? 'none' : 'lax',
    maxAge: maxAgeDays * 24 * 60 * 60 * 1000,
    // Scope cookie to /api so it covers both /api/auth (legacy) and /api/v1/auth.
    // It will still NOT be sent to unrelated origins — httpOnly + CSRF provide the real protection.
    path: '/api',
  };
}

/** Helper: parses UA for browser/os/deviceType */
function parseUA(ua: string) {
  let browser = 'Unknown', os = 'Unknown', deviceType: 'desktop' | 'mobile' | 'tablet' | 'unknown' = 'unknown';
  if (ua.includes('Edg/')) browser = 'Microsoft Edge';
  else if (ua.includes('OPR/')) browser = 'Opera';
  else if (ua.includes('Chrome/')) browser = 'Google Chrome';
  else if (ua.includes('Firefox/')) browser = 'Firefox';
  else if (ua.includes('Safari/') && !ua.includes('Chrome')) browser = 'Safari';
  if (ua.includes('Windows NT 10')) os = 'Windows 10/11';
  else if (ua.includes('Windows')) os = 'Windows';
  else if (ua.includes('Mac OS X')) os = 'macOS';
  else if (ua.includes('Android')) os = 'Android';
  else if (ua.includes('iPhone') || ua.includes('iPad')) os = 'iOS';
  else if (ua.includes('Linux')) os = 'Linux';
  if (ua.includes('Mobi')) deviceType = 'mobile';
  else if (ua.includes('Tablet') || ua.includes('iPad')) deviceType = 'tablet';
  else if (ua.includes('Windows') || ua.includes('Mac') || ua.includes('Linux')) deviceType = 'desktop';
  return { browser, os, deviceType };
}

/**
 * Options controlling how a session is issued. Defaults preserve the behavior of
 * the original inline password-login issuance.
 */
export interface IssueSessionOptions {
  /** Success message returned to the client. */
  message?: string;
  /** Whether the client asked for a persistent (remember-me) session. */
  rememberMe?: boolean;
  /** The resolved system_settings config doc (for session/notification settings). */
  sessionConfig?: any;
  /** Access-token expiry string (e.g. "12h"); undefined → library default. */
  accessExpiry?: string;
  /** Refresh-token expiry string (e.g. "30d"); undefined → library default. */
  refreshExpiry?: string;
  /** Refresh-token lifetime in days, used for the remember-me cookie maxAge. */
  refreshExpiryDays?: number;
  /** Single-session policy: when false, existing sessions are force-logged out. */
  allowMultipleSessions?: boolean;
  /** Audit-log context phrase, e.g. "new login" / "new passkey login". */
  sessionKillContext?: string;
  /** Method label recorded on the LoginActivity entry (e.g. "totp", "passkey"). */
  loginMethod?: string;
  /** When true, driver-format usernames (T###-ABC) never get a remember-me cookie. */
  guardDriverRememberMe?: boolean;
  /** UEBA risk result; when present, adds riskScore/riskLevel to the response and
   *  logs an ELEVATED_RISK_LOGIN audit entry for scores > 30. */
  riskResult?: { score: number; level: string; factors?: any } | null;
  /** Extra fields merged into the response `data` object. */
  extraResponseData?: Record<string, any>;
}

/**
 * Issue an authenticated session: enforce single-session policy, generate the
 * access/refresh tokens, persist the hashed refresh token, write audit + login
 * activity, set the remember-me cookie, and send the success response.
 *
 * Extracted from `login()` so every authentication path (password, MFA-verified,
 * and — from Phase 3 — passkey) produces an identical session. See
 * PASSKEY_IMPLEMENTATION.md §6.4.
 */
export async function issueSession(
  user: IUserDocument,
  req: AuthRequest,
  res: Response,
  opts: IssueSessionOptions = {}
): Promise<void> {
  const {
    message = 'Login successful',
    rememberMe = false,
    sessionConfig,
    accessExpiry,
    refreshExpiry,
    refreshExpiryDays,
    allowMultipleSessions = true,
    sessionKillContext = 'new login',
    loginMethod,
    guardDriverRememberMe = false,
    riskResult = null,
    extraResponseData = {},
  } = opts;

  if (!allowMultipleSessions) {
    // Single-session policy: revoke the existing refresh token in the DB *before*
    // issuing a new one so that any session not connected via WebSocket also loses
    // the ability to refresh its access token once the current JWT expires.
    // The WebSocket force_logout is the fast path for connected clients; this DB
    // revocation is the reliable fallback for offline/disconnected browsers.
    user.refreshToken = undefined;
    await user.save();

    emitToUser(user.username, 'session_event', {
      type: 'force_logout',
      message: 'You have been logged out because a new session was started from another location.',
    });
    await AuditService.log({
      userId: user._id.toString(),
      username: user.username,
      action: 'CONCURRENT_SESSION_KILL',
      resourceType: 'auth',
      resourceId: user._id.toString(),
      details: `Existing session terminated by single-session policy — ${sessionKillContext} from ${req.ip}`,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
      severity: 'medium',
    });
    logger.info(`Single-session policy: existing session(s) for '${user.username}' were force-logged out and refresh token revoked`);
  }

  // Generate tokens
  const payload: JWTPayload = {
    userId: user._id.toString(),
    username: user.username,
    role: user.role,
  };

  const { accessToken, refreshToken } = generateTokens(payload, accessExpiry, refreshExpiry);

  // Hash refresh token before storage, update last login (Gap 2)
  user.refreshToken = crypto.createHash('sha256').update(refreshToken).digest('hex');
  user.lastLogin = new Date();
  await user.save();

  logger.info(`User logged in: ${user.username}`);

  // Log successful login
  await AuditService.logLogin(
    user.username,
    true,
    req.ip,
    req.get('user-agent'),
    user._id.toString()
  );

  // Log risk score if elevated
  if (riskResult && riskResult.score > 30) {
    await AuditService.log({
      userId: user._id.toString(),
      username: user.username,
      action: 'ELEVATED_RISK_LOGIN',
      resourceType: 'auth',
      details: JSON.stringify({ riskScore: riskResult.score, riskLevel: riskResult.level, factors: riskResult.factors }),
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });
  }

  const response: AuthResponse = {
    user: user.toJSON() as unknown as AuthResponse['user'],
    accessToken,
    refreshToken,
  };

  // Record login activity & send notification email (fire-and-forget)
  const notifSettings = sessionConfig?.systemSettings?.notifications;
  const deviceTrackingEnabled = notifSettings?.deviceTracking !== false; // default true
  const loginNotifsEnabled = notifSettings?.loginNotifications !== false; // default true
  const ua = req.get('user-agent') || '';
  const ip = req.ip || 'unknown';
  const parsed = parseUA(ua);
  if (deviceTrackingEnabled) {
    (LoginActivity as any).recordLogin(
      user._id.toString(), user.refreshToken, ip, ua, loginMethod
    ).then((activity: any) => {
      (KnownDevice as any).recordDevice(user._id.toString(), user.username, parsed.browser, parsed.os, parsed.deviceType, ip).catch(() => {});
      if (loginNotifsEnabled) {
        emailService.sendLoginNotification(user.email, user.firstName || user.username, {
          browser: parsed.browser, os: parsed.os, ipAddress: ip,
          time: new Date(), isNewDevice: activity.isNewDevice, deviceType: parsed.deviceType,
        }).catch((e: any) => logger.error('Failed to send login notification email:', e?.message));
      }
    }).catch((e: any) => logger.error('Failed to record login activity:', e?.message));
  }

  // ── Remember Me: set rotating HttpOnly refresh-token cookie ──────────
  // Only for non-driver, voluntarily persistent sessions. JS cannot read this
  // cookie (httpOnly) and CSRF cannot forge it (already protected by XSRF token).
  //
  // IMPORTANT: do NOT establish a persistent session for an un-activated user
  // (one who still mustChangePassword). Otherwise, if they reach the
  // "Set Your Password" screen and close the browser without finishing, the
  // cookie silently logs them back in on the next visit and re-shows the
  // temp-password flow — making them look like a brand-new user. The cookie is
  // instead set once they complete first-login password setup (firstLoginPassword).
  const isDriverUsername = /^T\d{3,4}[-\s]?[A-Z]{3}$/i.test(user.username);
  if (rememberMe && !user.mustChangePassword && !(guardDriverRememberMe && isDriverUsername)) {
    const rmDays = refreshExpiryDays ?? 30;
    const cookieOpts = refreshCookieOptions(rmDays);
    logger.info(`[RememberMe] Setting cookie for ${user.username}, maxAge=${rmDays}d, opts=${JSON.stringify(cookieOpts)}`);
    res.cookie('fuel_order_refresh', refreshToken, cookieOpts);
  } else {
    logger.info(`[RememberMe] Cookie NOT set: rememberMe=${rememberMe}, mustChangePassword=${user.mustChangePassword}, username=${user.username}`);
  }

  res.status(200).json({
    success: true,
    message,
    data: {
      ...response,
      rememberMe: !!rememberMe,
      sessionTimeoutMinutes: sessionConfig?.systemSettings?.session?.sessionTimeout ?? 30,
      ...(riskResult ? { riskScore: riskResult.score, riskLevel: riskResult.level } : {}),
      ...extraResponseData,
    },
  });
}

/**
 * Heal a *stale* `mustChangePassword` flag on an established account.
 *
 * The "Set Your Password" gate fires whenever `mustChangePassword` is true.
 * Legacy/established accounts — created before the temp-password feature, or whose
 * flag was re-introduced by a backup/restore or a re-seed — can carry a stale `true`
 * even though they set a real password long ago. login() already heals on its own
 * path, but the remember-me session-restore path (POST /auth/refresh → GET /auth/me)
 * never goes through login, so /me must heal too — otherwise a returning user is
 * wrongly forced back into the first-login screen on a new tab / browser restart.
 *
 * We only clear a flag we can prove is stale; a genuine pending account (recent
 * admin reset, or a live temporary-credential expiry) is left untouched so it still
 * completes first-login setup. Conditions mirror the login handler:
 *   • no `passwordResetAt`                              → legacy data, clear
 *   • `passwordResetAt` older than 5 minutes AND no live
 *     `tempPasswordExpiresAt`                           → working creds reset long ago, clear
 *
 * Mutates `user` in place; the caller persists with `user.save()` when this returns true.
 * @returns true if the flag was cleared (a save is needed), false otherwise.
 */
function healStaleMustChangePassword(user: IUserDocument): boolean {
  if (!user.mustChangePassword) return false;

  // A genuinely pending account must never be treated as stale. This covers:
  //   • email_link users who clicked the activation link but haven't set their
  //     password yet — they have no tempPasswordExpiresAt so without this guard
  //     the 5-minute branch below would incorrectly clear the flag on any /me or
  //     /login call made after account creation, bypassing ForcePasswordChange.
  //   • temp_password users whose admin just reset their password.
  // pendingActivation is cleared only by firstLoginPassword / changePassword once
  // the user actually sets their own password, so it is a reliable sentinel here.
  if (user.pendingActivation) return false;

  let shouldClear = false;
  if (!user.passwordResetAt) {
    shouldClear = true;
  } else if (!user.tempPasswordExpiresAt) {
    const minutesSincePwdReset =
      (Date.now() - new Date(user.passwordResetAt).getTime()) / (1000 * 60);
    if (minutesSincePwdReset > 5) shouldClear = true;
  }

  if (shouldClear) {
    user.mustChangePassword = false;
    user.passwordResetAt = undefined;
    // Legacy accounts may also carry a stale pendingActivation; clear it together.
    user.pendingActivation = false;
  }
  return shouldClear;
}

/**
 * Register a new user
 */
export const register = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { username, email, password, firstName, lastName, role } = req.body as RegisterRequest;

    // Enforce admin-configured password policy
    const policy = await getPasswordPolicy();
    const policyError = enforcePasswordPolicy(password, policy);
    if (policyError) {
      throw new ApiError(400, policyError);
    }

    // Check against HaveIBeenPwned breached password database
    const breachResult = await checkBreachedPassword(password);
    if (breachResult.breached) {
      throw new ApiError(400, `This password has appeared in ${breachResult.count.toLocaleString()} data breaches. Please choose a different password.`);
    }

    // Check if user already exists
    const existingUser = await User.findOne({
      $or: [{ username }, { email }],
      isDeleted: false,
    }).select('-password -refreshToken -passwordHistory -resetPasswordToken');

    if (existingUser) {
      if (existingUser.username === username) {
        throw new ApiError(400, 'Username already exists');
      }
      if (existingUser.email === email) {
        throw new ApiError(400, 'Email already exists');
      }
    }

    // Create new user
    const user = await User.create({
      username,
      email,
      password,
      firstName,
      lastName,
      role: role || 'viewer',
      isActive: true,
      isDeleted: false,
    });

    // Generate tokens
    const payload: JWTPayload = {
      userId: user._id.toString(),
      username: user.username,
      role: user.role,
    };

    const { accessToken, refreshToken } = generateTokens(payload);

    // Hash refresh token before storage (Gap 2)
    user.refreshToken = crypto.createHash('sha256').update(refreshToken).digest('hex');
    await user.save();

    logger.info(`New user registered: ${username}`);

    const response: AuthResponse = {
      user: user.toJSON(),
      accessToken,
      refreshToken,
    };

    res.status(201).json({
      success: true,
      message: 'User registered successfully',
      data: response,
    });
  } catch (error: any) {
    throw error;
  }
};

/**
 * Login user or driver
 */
export const login = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { username, password, rememberMe } = req.body as LoginRequest & { rememberMe?: boolean };

    // Check if this is a driver login attempt (truck number format)
    // Pattern: Starts with T followed by digits and letters (e.g., T123-DNH, T456-ABC)
    const truckPattern = /^T\d{3,4}[-\s]?[A-Z]{3}$/i;
    const isDriverLogin = truckPattern.test(username);

    // Read session config once — shared by both driver and regular-user paths.
    // jwtExpiry (hours) and refreshTokenExpiry (days) let the super-admin control
    // token lifetimes from the Security tab without restarting the server.
    const sessionConfig = await SystemConfig.findOne({ configType: 'system_settings' });
    const jwtExpiryHours = sessionConfig?.systemSettings?.session?.jwtExpiry;
    const refreshExpiryDays = sessionConfig?.systemSettings?.session?.refreshTokenExpiry;
    const accessExpiry = jwtExpiryHours ? `${jwtExpiryHours}h` : undefined;
    // Mobile app sessions are long-lived ("stay logged in until logout"): issue a
    // 365-day refresh token for the mobile client (identified by its user-agent),
    // while web keeps the admin-configured TTL. Rotation extends it on each use.
    const isMobileClient = (req.get('user-agent') || '').includes('FuelOrderMobile');
    const refreshExpiry = isMobileClient
      ? '365d'
      : refreshExpiryDays
      ? `${refreshExpiryDays}d`
      : undefined;

    if (isDriverLogin) {
      // Secure driver authentication using DriverCredential model
      // Normalize truck number format - try both space and hyphen formats
      const inputTruck = username.toUpperCase().trim();
      
      // Try to find with the exact format entered
      let driverCredential: IDriverCredential | null = await DriverCredential.findOne({
        truckNo: inputTruck,
        isActive: true,
      }).select('+pin');
      
      // If not found, try alternative format (space <-> hyphen)
      if (!driverCredential) {
        const alternateFormat = inputTruck.includes('-') 
          ? inputTruck.replace(/-/g, ' ') 
          : inputTruck.replace(/\s+/g, '-');
        
        driverCredential = await DriverCredential.findOne({
          truckNo: alternateFormat,
          isActive: true,
        }).select('+pin');
      }

      if (!driverCredential) {
        // Log failed attempt without revealing if truck exists
        await AuditService.logLogin(
          username,
          false,
          req.ip,
          req.get('user-agent')
        );
        throw new ApiError(401, 'Invalid truck number or inactive driver account.');
      }

      // Verify PIN
      const isPinValid = await driverCredential.comparePin(password);

      if (!isPinValid) {
        // Log failed login attempt
        await AuditService.logLogin(
          username,
          false,
          req.ip,
          req.get('user-agent')
        );
        
        // Detect anomalies
        await AnomalyDetectionService.detectFailedLoginAnomaly(
          username,
          req.ip || 'unknown',
          req.get('user-agent')
        );
        
        throw new ApiError(401, 'Invalid PIN. Please check your credentials and try again.');
      }

      // Update last login
      driverCredential.lastLogin = new Date();
      await driverCredential.save();

      // Use the actual truck number from the credential (database format)
      const actualTruckNo = driverCredential.truckNo;

      // Create driver user object with safe ID (uses underscores instead of spaces)
      // This prevents MongoDB ObjectId casting errors in authentication middleware
      const driverUser = {
        _id: createDriverUserId(actualTruckNo), // e.g., "driver_T991_EFN"
        username: actualTruckNo,
        email: `${actualTruckNo.toLowerCase().replace(/\s+/g, '')}@driver.local`,
        firstName: driverCredential.driverName || 'Driver',
        lastName: actualTruckNo,
        role: 'driver',
        department: 'Transport',
        truckNo: actualTruckNo,
        isActive: true,
        createdAt: driverCredential.createdAt,
        updatedAt: new Date(),
      };

      // Generate tokens
      const payload: JWTPayload = {
        userId: driverUser._id,
        username: driverUser.username,
        role: driverUser.role as any,
      };

      const { accessToken, refreshToken } = generateTokens(payload, accessExpiry, refreshExpiry);

      // Hash and persist the driver's refresh token (Gap 8)
      driverCredential.refreshToken = crypto.createHash('sha256').update(refreshToken).digest('hex');
      await driverCredential.save();

      logger.info(`Driver logged in: ${actualTruckNo}`);

      // Clear failed login attempts on successful login
      AnomalyDetectionService.clearFailedLoginAttempts(
        actualTruckNo,
        req.ip || 'unknown'
      );

      // Log successful driver login
      await AuditService.logLogin(
        driverUser.username,
        true,
        req.ip,
        req.get('user-agent'),
        driverUser._id
      );

      const response: AuthResponse = {
        user: driverUser as any,
        accessToken,
        refreshToken,
      };

      res.status(200).json({
        success: true,
        message: 'Login successful',
        data: {
          ...response,
          sessionTimeoutMinutes: sessionConfig?.systemSettings?.session?.sessionTimeout ?? 30,
        },
      });
      return;
    }

    // Regular user login
    // Find user and include password
    const user = await User.findOne({ username, isDeleted: false }).select('+password');

    if (!user) {
      // Log failed login attempt
      await AuditService.logLogin(
        username,
        false,
        req.ip,
        req.get('user-agent')
      );
      
      // Detect anomalies
      await AnomalyDetectionService.detectFailedLoginAnomaly(
        username,
        req.ip || 'unknown',
        req.get('user-agent')
      );
      
      throw new ApiError(401, 'Invalid username. Please check your credentials and try again.');
    }

    // Check if user is banned
    if (user.isBanned) {
      throw new ApiError(403, `Your account has been banned. Reason: ${user.bannedReason || 'Violation of terms'}. Please contact administrator.`);
    }

    // Check if user is active
    if (!user.isActive) {
      throw new ApiError(403, 'Your account has been deactivated. Please contact administrator.');
    }

    // Session config already loaded above — extract lockout and single-session settings
    const maxAttempts = sessionConfig?.systemSettings?.session?.maxLoginAttempts ?? 5;
    const lockoutMinutes = sessionConfig?.systemSettings?.session?.lockoutDuration ?? 15;
    const allowMultipleSessions = sessionConfig?.systemSettings?.session?.allowMultipleSessions ?? true;

    // Check if account is temporarily locked out (Gap 4)
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      const minutesLeft = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60000);
      throw new ApiError(403, `Account temporarily locked due to too many failed attempts. Try again in ${minutesLeft} minute${minutesLeft === 1 ? '' : 's'}.`);
    }

    // Verify password
    const isPasswordValid = await user.comparePassword(password);

    if (!isPasswordValid) {
      // Increment failed attempt counter; lock if threshold reached (Gap 4)
      user.failedLoginAttempts = (user.failedLoginAttempts ?? 0) + 1;
      if (user.failedLoginAttempts >= maxAttempts) {
        user.lockedUntil = new Date(Date.now() + lockoutMinutes * 60 * 1000);
        user.failedLoginAttempts = 0;
      }
      await user.save();
      
      // Log failed login attempt
      await AuditService.logLogin(
        username,
        false,
        req.ip,
        req.get('user-agent')
      );
      
      // Detect anomalies
      await AnomalyDetectionService.detectFailedLoginAnomaly(
        username,
        req.ip || 'unknown',
        req.get('user-agent')
      );
      
      if (user.lockedUntil && user.lockedUntil > new Date()) {
        throw new ApiError(403, `Too many failed login attempts. Account locked for ${lockoutMinutes} minutes.`);
      }
      throw new ApiError(401, 'Invalid password. Please check your credentials and try again.');
    }

    // Reset failed login tracking on successful authentication (Gap 4)
    user.failedLoginAttempts = 0;
    user.lockedUntil = undefined;

    // Auto-clear stale mustChangePassword flags AFTER password validation.
    // This prevents unauthenticated requests from clearing the flag.
    if (user.mustChangePassword) {
      // ── Expiry enforcement ──────────────────────────────────────────────
      // If the temporary credentials have a hard expiry and it has passed,
      // deactivate the account and refuse login with a clear message.
      if (user.tempPasswordExpiresAt && new Date() > user.tempPasswordExpiresAt) {
        user.isActive = false;
        user.mustChangePassword = false;
        user.tempPasswordExpiresAt = undefined;
        await user.save();
        logger.warn(`[TEMP-CREDS] Expired temporary credentials blocked login for: ${username}`);
        throw new ApiError(
          403,
          'Your temporary password has expired. Please contact your administrator to receive new credentials.',
        );
      }

      // Heal a provably-stale flag (legacy/established account). A genuine pending
      // account — recent reset or a live temp-credential expiry — is left untouched.
      if (healStaleMustChangePassword(user)) {
        await user.save();
        logger.info(`[AUTO-CLEAR] Cleared stale mustChangePassword flag for user: ${username} during login`);
      }
    }
    
    // Clear failed login attempts in anomaly detection cache
    AnomalyDetectionService.clearFailedLoginAttempts(
      username,
      req.ip || 'unknown'
    );

    // Assess login risk score (UEBA)
    const riskResult = await assessLoginRisk(
      user._id.toString(),
      username,
      req.ip || 'unknown',
      req.get('user-agent') || 'unknown',
      user.role
    );
    if (riskResult.blockLogin) {
      logger.warn(`Login blocked for ${username} due to critical risk score: ${riskResult.score}`);
      await AuditService.log({
        userId: user._id.toString(),
        username,
        action: 'LOGIN_BLOCKED',
        resourceType: 'auth',
        details: JSON.stringify({ riskScore: riskResult.score, riskLevel: riskResult.level, factors: riskResult.factors }),
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
      });
      throw new ApiError(403, 'Login blocked due to suspicious activity. Please contact your administrator.');
    }

    // Read global MFA policy once — reused across kill-switch check, method filtering,
    // and the requiresMFASetup branch (avoids three separate DB reads).
    const sysConfig = await SystemConfig.findOne({ configType: 'system_settings', isDeleted: false });
    const mfaPolicy = sysConfig?.securitySettings?.mfa;
    const mfaGlobalEnabled = mfaPolicy?.globalEnabled ?? false;

    // Resolve effective allowed methods for this user: per-user > per-role > global default.
    // Computed once here and reused in both the requiresMFA and requiresMFASetup responses.
    let allowedMethods: string[] = mfaPolicy?.allowedMethods ?? ['totp', 'email'];
    const roleMethodOverrides = (mfaPolicy as any)?.roleMethodOverrides;
    if (roleMethodOverrides?.[user.role]?.length > 0) {
      allowedMethods = roleMethodOverrides[user.role];
    }
    // Fetch MFA records with backupCodes included so hasBackupCodes is accurate below.
    const mfaRecord = await MFA.findOne({ userId: user._id }).select('+backupCodes');
    const userMfaOverride = await UserMFA.findOne({ userId: user._id });
    if (mfaRecord?.allowedMethods && mfaRecord.allowedMethods.length > 0) {
      allowedMethods = mfaRecord.allowedMethods;
    } else if (userMfaOverride?.allowedMethods && userMfaOverride.allowedMethods.length > 0) {
      allowedMethods = userMfaOverride.allowedMethods;
    }

    // Check if MFA is enabled for this user (user has set it up).
    // Apply global kill-switch: if enforcement is globally off, skip MFA challenges even
    // for users who previously configured MFA — prevents the toggle from having no effect.
    const mfaEnabled = mfaGlobalEnabled && await mfaService.isMFAEnabled(user._id.toString());
    // isMFARequired already respects globalEnabled internally.
    const mfaRequired = await mfaService.isMFARequired(user._id.toString());
    const deviceId = req.body.deviceId || req.get('x-device-id');

    if (mfaEnabled) {
      // User has MFA set up — verify it. Reuse the already-fetched mfaRecord.
      const mfaSettings = mfaRecord;
      const isDeviceTrusted = deviceId && typeof (mfaSettings as any)?.isDeviceTrusted === 'function' && (mfaSettings as any).isDeviceTrusted(deviceId);

      if (!isDeviceTrusted) {
        // MFA required - generate temporary session token
        const tempSessionToken = crypto.randomBytes(32).toString('hex');
        const tempSessionExpiry = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

        // Store temp session token in user (or use Redis for production)
        user.refreshToken = crypto.createHash('sha256').update(tempSessionToken).digest('hex');
        await user.save();

        logger.info(`User ${username} requires MFA verification`);

        // Build effective mfaMethods: only include methods the user has fully configured
        // AND that the active allowedMethods policy permits.
        // totpVerified prevents a half-finished TOTP setup from silently failing on the frontend.
        const totpAvailable = !!(mfaSettings?.totpEnabled && (mfaSettings as any)?.totpVerified && allowedMethods.includes('totp'));
        const smsAvailable = !!(mfaSettings?.smsEnabled && allowedMethods.includes('sms'));
        const emailAvailable = !!(mfaSettings?.emailEnabled && allowedMethods.includes('email'));
        // backupCodes are available when the user has remaining codes, regardless of method.
        const backupCodesAvailable = Array.isArray((mfaSettings as any)?.backupCodes) && (mfaSettings as any).backupCodes.length > 0;

        // Compute a safe preferred method — fall back if the stored preferred method is not
        // fully available (e.g. TOTP was disabled or totpVerified is false).
        let preferredMethod: string = mfaSettings?.preferredMethod || 'totp';
        if (preferredMethod === 'totp' && !totpAvailable) {
          preferredMethod = emailAvailable ? 'email' : smsAvailable ? 'sms' : 'totp';
        } else if (preferredMethod === 'email' && !emailAvailable) {
          preferredMethod = totpAvailable ? 'totp' : smsAvailable ? 'sms' : 'email';
        } else if (preferredMethod === 'sms' && !smsAvailable) {
          preferredMethod = totpAvailable ? 'totp' : emailAvailable ? 'email' : 'sms';
        }

        res.status(200).json({
          success: true,
          requiresMFA: true,
          message: 'Please provide your MFA code to complete login',
          data: {
            userId: user._id.toString(),
            tempSessionToken,
            tempSessionExpiry,
            mfaMethods: {
              totp: totpAvailable,
              sms: smsAvailable,
              email: emailAvailable,
              backupCodes: backupCodesAvailable,
            },
            preferredMethod,
          },
        });
        return;
      } else {
        // Device is trusted, update last used
        if (mfaSettings && deviceId) {
          const device = mfaSettings.trustedDevices.find(d => d.deviceId === deviceId);
          if (device) {
            (device as any).lastUsedAt = new Date();
            await mfaSettings.save();
          }
        }
        logger.info(`User ${username} logged in from trusted device, skipping MFA`);
      }
    } else if (mfaRequired) {
      // MFA is required by admin settings but user hasn't set it up yet
      // Generate a temporary token so frontend can redirect to MFA setup
      const tempSessionToken = crypto.randomBytes(32).toString('hex');
      const tempSessionExpiry = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes for setup

      user.refreshToken = crypto.createHash('sha256').update(tempSessionToken).digest('hex');
      await user.save();

      // allowedMethods was already resolved above — no need to re-read sysConfig.
      logger.info(`User ${username} must set up MFA (required by system policy)`);

      res.status(200).json({
        success: true,
        requiresMFASetup: true,
        message: 'MFA setup is required for your account.',
        data: {
          userId: user._id.toString(),
          tempSessionToken,
          tempSessionExpiry,
          allowedMethods,
        },
      });
      return;
    }

    // Issue the authenticated session (tokens, single-session policy, audit,
    // login activity, remember-me cookie, response). Shared with other auth paths.
    await issueSession(user, req, res, {
      message: 'Login successful',
      rememberMe,
      sessionConfig,
      accessExpiry,
      refreshExpiry,
      refreshExpiryDays,
      allowMultipleSessions,
      sessionKillContext: 'new login',
      guardDriverRememberMe: true,
      riskResult,
    });
  } catch (error: any) {
    throw error;
  }
};

/**
 * Verify MFA and complete login
 */
export const verifyMFA = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { userId, tempSessionToken, code, method, trustDevice, deviceName, rememberMe } = req.body;

    if (!userId || !tempSessionToken || !code) {
      throw new ApiError(400, 'User ID, session token, and MFA code are required');
    }

    // Find user and verify temp session token
    const user = await User.findById(userId).select('+refreshToken');
    if (!user) {
      throw new ApiError(404, 'User not found');
    }

    // Verify temp session token
    const hashedTempToken = crypto.createHash('sha256').update(tempSessionToken).digest('hex');
    if (user.refreshToken !== hashedTempToken) {
      throw new ApiError(401, 'Invalid or expired session token');
    }

    // Verify MFA code
    const verificationResult = await mfaService.verifyMFACode(userId, code, method);

    if (!verificationResult.success) {
      // TODO: Add mfa_verification_failed to AuditAction enum
      // await AuditService.log({
      //   userId,
      //   action: 'mfa_verification_failed',
      //   details: `Failed MFA verification attempt`,
      //   ipAddress: req.ip,
      // });
      
      throw new ApiError(401, 'Invalid MFA code');
    }

    // MFA verified successfully
    logger.info(`User ${user.username} passed MFA verification`);

    // Read session config
    const sessionConfig = await SystemConfig.findOne({ configType: 'system_settings' });
    const jwtExpiryHours = sessionConfig?.systemSettings?.session?.jwtExpiry;
    const refreshExpiryDays = sessionConfig?.systemSettings?.session?.refreshTokenExpiry;
    const accessExpiry = jwtExpiryHours ? `${jwtExpiryHours}h` : undefined;
    const refreshExpiry = refreshExpiryDays ? `${refreshExpiryDays}d` : undefined;
    const allowMultipleSessions = sessionConfig?.systemSettings?.session?.allowMultipleSessions ?? true;

    // Trust device if requested
    if (trustDevice) {
      const mfaSettings = await MFA.findOne({ userId });
      if (mfaSettings) {
        const deviceId = req.body.deviceId || crypto.randomUUID();
        const ipAddress = req.ip || 'unknown';
        const userAgent = req.get('user-agent') || 'unknown';
        
        if (typeof (mfaSettings as any).addTrustedDevice === 'function') {
          (mfaSettings as any).addTrustedDevice(
            deviceId,
            ipAddress,
            userAgent,
            deviceName || 'Trusted Device'
          );
          await mfaSettings.save();
        }
        
        logger.info(`Device ${deviceId} added to trusted devices for user ${user.username}`);
      }
    }

    if (!allowMultipleSessions) {
      // Revoke old refresh token in DB so disconnected sessions also lose refresh ability
      user.refreshToken = undefined;
      await user.save();

      emitToUser(user.username, 'session_event', {
        type: 'force_logout',
        message: 'You have been logged out because a new session was started from another location.',
      });
      await AuditService.log({
        userId: user._id.toString(),
        username: user.username,
        action: 'CONCURRENT_SESSION_KILL',
        resourceType: 'auth',
        resourceId: user._id.toString(),
        details: `Existing session terminated by single-session policy — new MFA-verified login from ${req.ip}`,
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
        severity: 'medium',
      });
      logger.info(`Single-session policy: existing session(s) for '${user.username}' were force-logged out and refresh token revoked`);
    }

    // Generate final tokens
    const payload: JWTPayload = {
      userId: user._id.toString(),
      username: user.username,
      role: user.role,
    };

    const { accessToken, refreshToken } = generateTokens(payload, accessExpiry, refreshExpiry);

    // Hash refresh token before storage, update last login
    user.refreshToken = crypto.createHash('sha256').update(refreshToken).digest('hex');
    user.lastLogin = new Date();
    await user.save();

    // Log successful login
    await AuditService.logLogin(
      user.username,
      true,
      req.ip,
      req.get('user-agent'),
      user._id.toString()
    );

    // TODO: Add mfa_verification_success to AuditAction enum
    // await AuditService.log({
    //   userId: user._id.toString(),
    //   action: 'mfa_verification_success',
    //   details: `User completed MFA verification using ${verificationResult.methodUsed}`,
    //   ipAddress: req.ip,
    // });

    const response: AuthResponse = {
      user: user.toJSON(),
      accessToken,
      refreshToken,
    };

    // Record login activity & send notification (fire-and-forget)
    const mfaNotifSettings = sessionConfig?.systemSettings?.notifications;
    const mfaDeviceTracking = mfaNotifSettings?.deviceTracking !== false;
    const mfaLoginNotifs = mfaNotifSettings?.loginNotifications !== false;
    const mfaUA = req.get('user-agent') || '';
    const mfaIP = req.ip || 'unknown';
    const mfaParsed = parseUA(mfaUA);
    if (mfaDeviceTracking) {
      (LoginActivity as any).recordLogin(
        user._id.toString(), user.refreshToken, mfaIP, mfaUA, verificationResult.methodUsed
      ).then((activity: any) => {
        (KnownDevice as any).recordDevice(user._id.toString(), user.username, mfaParsed.browser, mfaParsed.os, mfaParsed.deviceType, mfaIP).catch(() => {});
        if (mfaLoginNotifs) {
          emailService.sendLoginNotification(user.email, user.firstName || user.username, {
            browser: mfaParsed.browser, os: mfaParsed.os, ipAddress: mfaIP,
            time: new Date(), isNewDevice: activity.isNewDevice, deviceType: mfaParsed.deviceType,
          }).catch((e: any) => logger.error('Failed to send login notification email:', e?.message));
        }
      }).catch((e: any) => logger.error('Failed to record login activity:', e?.message));
    }

    // ── Remember Me cookie after MFA verification ──────────────────────
    // Guard: do not persist a session for users who still must change their
    // password — same invariant as the regular login handler. The cookie is
    // set later by firstLoginPassword once the account is fully activated.
    if (rememberMe && !user.mustChangePassword) {
      const rmDays = refreshExpiryDays ?? 30;
      res.cookie('fuel_order_refresh', refreshToken, refreshCookieOptions(rmDays));
    }

    res.status(200).json({
      success: true,
      message: 'MFA verification successful. Login complete.',
      data: {
        ...response,
        rememberMe: !!rememberMe,
        sessionTimeoutMinutes: sessionConfig?.systemSettings?.session?.sessionTimeout ?? 30,
      },
    });
  } catch (error: any) {
    throw error;
  }
};

/**
 * Generate TOTP secret for forced MFA setup during login
 * Uses tempSessionToken instead of JWT auth
 */
export const setupMFAGenerate = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { userId, tempSessionToken } = req.body;

    if (!userId || !tempSessionToken) {
      throw new ApiError(400, 'User ID and session token are required');
    }

    const user = await User.findById(userId).select('+refreshToken');
    if (!user) {
      throw new ApiError(404, 'User not found');
    }

    // Verify temp session token
    const hashedTempToken = crypto.createHash('sha256').update(tempSessionToken).digest('hex');
    if (user.refreshToken !== hashedTempToken) {
      throw new ApiError(401, 'Invalid or expired session token');
    }

    // Check if user already has a TOTP secret (e.g. MFA was disabled then re-enabled)
    const hasExisting = await mfaService.hasExistingTOTPSecret(userId);
    if (hasExisting) {
      res.status(200).json({
        success: true,
        data: {
          alreadyConfigured: true,
        },
      });
      return;
    }

    // Generate TOTP secret
    const totpData = await mfaService.generateTOTPSecret(
      userId,
      user.username,
      user.email
    );

    res.status(200).json({
      success: true,
      data: {
        secret: totpData.secret,
        qrCodeUrl: totpData.qrCodeUrl,
        manualEntryKey: totpData.manualEntryKey,
      },
    });
  } catch (error: any) {
    throw error;
  }
};

/**
 * Verify TOTP code, enable MFA, and complete login for forced MFA setup
 * Uses tempSessionToken instead of JWT auth
 */
export const setupMFAVerify = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { userId, tempSessionToken, secret, code, trustDevice, deviceId, deviceName, rememberMe } = req.body;

    if (!userId || !tempSessionToken || !code) {
      throw new ApiError(400, 'User ID, session token, and verification code are required');
    }

    const user = await User.findById(userId).select('+refreshToken');
    if (!user) {
      throw new ApiError(404, 'User not found');
    }

    // Verify temp session token
    const hashedTempToken = crypto.createHash('sha256').update(tempSessionToken).digest('hex');
    if (user.refreshToken !== hashedTempToken) {
      throw new ApiError(401, 'Invalid or expired session token');
    }

    // If no secret provided, use existing secret from database (re-enable flow)
    let totpSecret = secret;
    if (!totpSecret) {
      const existingMfa = await mfaService.getMFASettings(userId);
      if (existingMfa.totpSecret) {
        totpSecret = existingMfa.totpSecret;
      } else {
        throw new ApiError(400, 'Secret is required. Please generate a new TOTP secret first.');
      }
    }

    // Enable TOTP via MFA service
    const result = await mfaService.enableTOTP(userId, totpSecret, code);

    if (!result.success) {
      throw new ApiError(400, 'Invalid verification code. Please try again.');
    }

    // Trust device if requested
    if (trustDevice && deviceId) {
      const mfaSettings = await MFA.findOne({ userId });
      if (mfaSettings && typeof (mfaSettings as any).addTrustedDevice === 'function') {
        (mfaSettings as any).addTrustedDevice(
          deviceId,
          req.ip || 'unknown',
          req.get('user-agent') || 'unknown',
          deviceName || 'Trusted Device'
        );
        await mfaSettings.save();
        logger.info(`Device ${deviceId} trusted during TOTP MFA setup for user ${user.username}`);
      }
    }

    // Auto-clear stale mustChangePassword — user already proved they know
    // their password at the login endpoint before being redirected here.
    // Guard: skip if pendingActivation is still set (email_link / admin-reset
    // account that has not completed first-login setup) to match the same logic
    // used by healStaleMustChangePassword and avoid bypassing ForcePasswordChange.
    if (user.mustChangePassword && !user.pendingActivation) {
      let shouldClear = false;
      if (!user.passwordResetAt) {
        shouldClear = true;
      } else {
        const minutesSincePwdReset = (Date.now() - new Date(user.passwordResetAt).getTime()) / (1000 * 60);
        if (minutesSincePwdReset > 5) {
          shouldClear = true;
        }
      }
      if (shouldClear) {
        user.mustChangePassword = false;
        user.passwordResetAt = undefined;
        logger.info(`[AUTO-CLEAR] Cleared stale mustChangePassword for ${user.username} during TOTP MFA setup`);
      }
    }

    logger.info(`User ${user.username} completed mandatory MFA setup`);

    // Read session config
    const sessionConfig = await SystemConfig.findOne({ configType: 'system_settings' });
    const jwtExpiryHours = sessionConfig?.systemSettings?.session?.jwtExpiry;
    const refreshExpiryDays = sessionConfig?.systemSettings?.session?.refreshTokenExpiry;
    const accessExpiry = jwtExpiryHours ? `${jwtExpiryHours}h` : undefined;
    const refreshExpiry = refreshExpiryDays ? `${refreshExpiryDays}d` : undefined;
    const allowMultipleSessions = sessionConfig?.systemSettings?.session?.allowMultipleSessions ?? true;

    if (!allowMultipleSessions) {
      // Revoke old refresh token in DB so disconnected sessions also lose refresh ability
      user.refreshToken = undefined;
      await user.save();

      emitToUser(user.username, 'session_event', {
        type: 'force_logout',
        message: 'You have been logged out because a new session was started from another location.',
      });
      await AuditService.log({
        userId: user._id.toString(),
        username: user.username,
        action: 'CONCURRENT_SESSION_KILL',
        resourceType: 'auth',
        resourceId: user._id.toString(),
        details: `Existing session terminated by single-session policy — new TOTP MFA setup login from ${req.ip}`,
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
        severity: 'medium',
      });
    }

    // Generate final tokens — user is now fully authenticated
    const payload: JWTPayload = {
      userId: user._id.toString(),
      username: user.username,
      role: user.role,
    };

    const { accessToken, refreshToken } = generateTokens(payload, accessExpiry, refreshExpiry);

    user.refreshToken = crypto.createHash('sha256').update(refreshToken).digest('hex');
    user.lastLogin = new Date();
    await user.save();

    await AuditService.logLogin(
      user.username,
      true,
      req.ip,
      req.get('user-agent'),
      user._id.toString()
    );

    const response: AuthResponse = {
      user: user.toJSON(),
      accessToken,
      refreshToken,
    };

    // Record login activity & send notification (fire-and-forget)
    const setupNotifSettings = sessionConfig?.systemSettings?.notifications;
    const setupDeviceTracking = setupNotifSettings?.deviceTracking !== false;
    const setupLoginNotifs = setupNotifSettings?.loginNotifications !== false;
    const setupUA = req.get('user-agent') || '';
    const setupIP = req.ip || 'unknown';
    const setupParsed = parseUA(setupUA);
    if (setupDeviceTracking) {
      (LoginActivity as any).recordLogin(
        user._id.toString(), user.refreshToken, setupIP, setupUA, 'totp_setup'
      ).then((activity: any) => {
        (KnownDevice as any).recordDevice(user._id.toString(), user.username, setupParsed.browser, setupParsed.os, setupParsed.deviceType, setupIP).catch(() => {});
        if (setupLoginNotifs) {
          emailService.sendLoginNotification(user.email, user.firstName || user.username, {
            browser: setupParsed.browser, os: setupParsed.os, ipAddress: setupIP,
            time: new Date(), isNewDevice: activity.isNewDevice, deviceType: setupParsed.deviceType,
          }).catch((e: any) => logger.error('Failed to send login notification email:', e?.message));
        }
      }).catch((e: any) => logger.error('Failed to record login activity:', e?.message));
    }

    // ── Remember Me cookie after forced MFA setup ───────────────────────
    // Guard: do not persist a session for users who still must change their
    // password — same invariant as the regular login handler.
    if (rememberMe && !user.mustChangePassword) {
      const rmDaysSetup = refreshExpiryDays ?? 30;
      res.cookie('fuel_order_refresh', refreshToken, refreshCookieOptions(rmDaysSetup));
    }

    res.status(200).json({
      success: true,
      message: 'MFA setup complete. Login successful.',
      data: {
        ...response,
        rememberMe: !!rememberMe,
        backupCodes: result.backupCodes,
        sessionTimeoutMinutes: sessionConfig?.systemSettings?.session?.sessionTimeout ?? 30,
      },
    });
  } catch (error: any) {
    throw error;
  }
};

/**
 * Send email OTP for forced MFA setup during login
 * Uses tempSessionToken instead of JWT auth
 */
export const setupMFAEmailSend = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { userId, tempSessionToken } = req.body;

    if (!userId || !tempSessionToken) {
      throw new ApiError(400, 'User ID and session token are required');
    }

    const user = await User.findById(userId).select('+refreshToken');
    if (!user) {
      throw new ApiError(404, 'User not found');
    }

    // Verify temp session token
    const hashedTempToken = crypto.createHash('sha256').update(tempSessionToken).digest('hex');
    if (user.refreshToken !== hashedTempToken) {
      throw new ApiError(401, 'Invalid or expired session token');
    }

    // Check bypass setting — skip OTP entirely when admin has enabled bypass
    const sysConfig = await SystemConfig.findOne({ configType: 'system_settings', isDeleted: false });
    const bypassEmailVerification = (sysConfig?.systemSettings?.notifications as any)?.bypassEmailVerification === true;

    if (bypassEmailVerification) {
      logger.info(`Email verification bypass active — skipping OTP send for user ${userId}`);
      res.status(200).json({
        success: true,
        message: 'Email verification bypassed by admin settings',
        bypassed: true,
      });
      return;
    }

    // Send email OTP
    try {
      await mfaService.sendEmailOTP(userId, user.email);
    } catch (emailErr: any) {
      logger.error(`Failed to send MFA setup email OTP for user ${userId}: ${emailErr.message}`);
      throw new ApiError(503, 'Failed to send verification code email. Please try again or contact support.');
    }

    res.status(200).json({
      success: true,
      message: 'Verification code sent to your email',
    });
  } catch (error: any) {
    throw error;
  }
};

/**
 * Verify email OTP, enable email MFA, and complete login for forced MFA setup
 * Uses tempSessionToken instead of JWT auth
 */
export const setupMFAEmailVerify = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { userId, tempSessionToken, code, trustDevice, deviceId, deviceName, rememberMe } = req.body;

    if (!userId || !tempSessionToken) {
      throw new ApiError(400, 'User ID and session token are required');
    }

    const user = await User.findById(userId).select('+refreshToken');
    if (!user) {
      throw new ApiError(404, 'User not found');
    }

    // Verify temp session token
    const hashedTempToken = crypto.createHash('sha256').update(tempSessionToken).digest('hex');
    if (user.refreshToken !== hashedTempToken) {
      throw new ApiError(401, 'Invalid or expired session token');
    }

    // Check bypass setting — skip OTP validation when admin has enabled bypass
    const sysConfig = await SystemConfig.findOne({ configType: 'system_settings', isDeleted: false });
    const bypassEmailVerification = (sysConfig?.systemSettings?.notifications as any)?.bypassEmailVerification === true;

    if (!bypassEmailVerification) {
      // Normal flow: require a valid OTP code
      if (!code) {
        throw new ApiError(400, 'Verification code is required');
      }
      const valid = await mfaService.verifyPendingOTP(userId, 'email', code);
      if (!valid) {
        throw new ApiError(400, 'Invalid or expired verification code');
      }
    } else {
      logger.info(`Email verification bypass active — skipping OTP check for user ${userId}`);
    }

    // Enable email MFA
    await mfaService.enableEmailOTP(userId);

    // Trust device if requested
    if (trustDevice && deviceId) {
      const mfaSettings = await MFA.findOne({ userId });
      if (mfaSettings && typeof (mfaSettings as any).addTrustedDevice === 'function') {
        (mfaSettings as any).addTrustedDevice(
          deviceId,
          req.ip || 'unknown',
          req.get('user-agent') || 'unknown',
          deviceName || 'Trusted Device'
        );
        await mfaSettings.save();
        logger.info(`Device ${deviceId} trusted during email MFA setup for user ${user.username}`);
      }
    }

    // Auto-clear stale mustChangePassword — user already proved they know
    // their password at the login endpoint before being redirected here.
    // Guard: skip if pendingActivation is still set (email_link / admin-reset
    // account that has not completed first-login setup) to match the same logic
    // used by healStaleMustChangePassword and avoid bypassing ForcePasswordChange.
    if (user.mustChangePassword && !user.pendingActivation) {
      let shouldClear = false;
      if (!user.passwordResetAt) {
        shouldClear = true;
      } else {
        const minutesSincePwdReset = (Date.now() - new Date(user.passwordResetAt).getTime()) / (1000 * 60);
        if (minutesSincePwdReset > 5) {
          shouldClear = true;
        }
      }
      if (shouldClear) {
        user.mustChangePassword = false;
        user.passwordResetAt = undefined;
        logger.info(`[AUTO-CLEAR] Cleared stale mustChangePassword for ${user.username} during email MFA setup`);
      }
    }

    logger.info(`User ${user.username} completed mandatory MFA setup via email`);

    // Read session config
    const sessionConfig = await SystemConfig.findOne({ configType: 'system_settings' });
    const jwtExpiryHours = sessionConfig?.systemSettings?.session?.jwtExpiry;
    const refreshExpiryDays = sessionConfig?.systemSettings?.session?.refreshTokenExpiry;
    const accessExpiry = jwtExpiryHours ? `${jwtExpiryHours}h` : undefined;
    const refreshExpiry = refreshExpiryDays ? `${refreshExpiryDays}d` : undefined;
    const allowMultipleSessions = sessionConfig?.systemSettings?.session?.allowMultipleSessions ?? true;

    if (!allowMultipleSessions) {
      // Revoke old refresh token in DB so disconnected sessions also lose refresh ability
      user.refreshToken = undefined;
      await user.save();

      emitToUser(user.username, 'session_event', {
        type: 'force_logout',
        message: 'You have been logged out because a new session was started from another location.',
      });
      await AuditService.log({
        userId: user._id.toString(),
        username: user.username,
        action: 'CONCURRENT_SESSION_KILL',
        resourceType: 'auth',
        resourceId: user._id.toString(),
        details: `Existing session terminated by single-session policy — new email MFA setup login from ${req.ip}`,
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
        severity: 'medium',
      });
    }

    // Generate final tokens — user is now fully authenticated
    const payload: JWTPayload = {
      userId: user._id.toString(),
      username: user.username,
      role: user.role,
    };

    const { accessToken, refreshToken } = generateTokens(payload, accessExpiry, refreshExpiry);

    user.refreshToken = crypto.createHash('sha256').update(refreshToken).digest('hex');
    user.lastLogin = new Date();
    await user.save();

    await AuditService.logLogin(
      user.username,
      true,
      req.ip,
      req.get('user-agent'),
      user._id.toString()
    );

    const response: AuthResponse = {
      user: user.toJSON(),
      accessToken,
      refreshToken,
    };

    // Record login activity & send notification (fire-and-forget)
    const emailNotifSettings = sessionConfig?.systemSettings?.notifications;
    const emailDeviceTracking = emailNotifSettings?.deviceTracking !== false;
    const emailLoginNotifs = emailNotifSettings?.loginNotifications !== false;
    const emailUA = req.get('user-agent') || '';
    const emailIP = req.ip || 'unknown';
    const emailParsed = parseUA(emailUA);
    if (emailDeviceTracking) {
      (LoginActivity as any).recordLogin(
        user._id.toString(), user.refreshToken, emailIP, emailUA, 'email_setup'
      ).then((activity: any) => {
        (KnownDevice as any).recordDevice(user._id.toString(), user.username, emailParsed.browser, emailParsed.os, emailParsed.deviceType, emailIP).catch(() => {});
        if (emailLoginNotifs) {
          emailService.sendLoginNotification(user.email, user.firstName || user.username, {
            browser: emailParsed.browser, os: emailParsed.os, ipAddress: emailIP,
            time: new Date(), isNewDevice: activity.isNewDevice, deviceType: emailParsed.deviceType,
          }).catch((e: any) => logger.error('Failed to send login notification email:', e?.message));
        }
      }).catch((e: any) => logger.error('Failed to record login activity:', e?.message));
    }

    // ── Remember Me cookie after email MFA setup ───────────────────────────
    // Guard: do not persist a session for users who still must change their
    // password — same invariant as the regular login handler.
    if (rememberMe && !user.mustChangePassword) {
      const rmDaysEmail = refreshExpiryDays ?? 30;
      res.cookie('fuel_order_refresh', refreshToken, refreshCookieOptions(rmDaysEmail));
    }

    res.status(200).json({
      success: true,
      message: 'Email MFA setup complete. Login successful.',
      data: {
        ...response,
        rememberMe: !!rememberMe,
        sessionTimeoutMinutes: sessionConfig?.systemSettings?.session?.sessionTimeout ?? 30,
      },
    });
  } catch (error: any) {
    throw error;
  }
};

/**
 * Refresh access token
 */
export const refreshToken = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    // Accept token from HttpOnly cookie (remember-me) OR request body (legacy / MFA flows)
    const cookieToken: string | undefined = (req.cookies as any)?.fuel_order_refresh;
    const bodyToken: string | undefined = req.body?.refreshToken;
    const token = cookieToken || bodyToken;
    const usedCookie = !!cookieToken;
    logger.info(`[RememberMe] Refresh attempt: hasCookie=${!!cookieToken}, hasBody=${!!bodyToken}, cookieKeys=${JSON.stringify(Object.keys(req.cookies || {}))}`);

    if (!token) {
      throw new ApiError(400, 'Refresh token is required');
    }

    // Verify refresh token signature and expiry
    const decoded = verifyRefreshToken(token);
    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

    // Read DB session config so the refreshed tokens honour any TTL changes made
    // by the super-admin in the Security tab without a server restart.
    const sessionSysConfig = await SystemConfig.findOne({ configType: 'system_settings' });
    const rtJwtExpiryHours = sessionSysConfig?.systemSettings?.session?.jwtExpiry;
    const rtRefreshExpiryDays = sessionSysConfig?.systemSettings?.session?.refreshTokenExpiry;
    const rtAccessExpiry = rtJwtExpiryHours ? `${rtJwtExpiryHours}h` : undefined;
    // Keep mobile sessions long-lived on rotation too (see login handler).
    const rtIsMobileClient = (req.get('user-agent') || '').includes('FuelOrderMobile');
    const rtRefreshExpiry = rtIsMobileClient
      ? '365d'
      : rtRefreshExpiryDays
      ? `${rtRefreshExpiryDays}d`
      : undefined;

    // Driver refresh token path (Gap 8)
    if (decoded.userId.startsWith('driver_')) {
      const rawTruck = decoded.userId.replace(/^driver_/, '').replace(/_/g, '-');
      const driverCredential = await DriverCredential.findOne({
        $or: [{ truckNo: rawTruck }, { truckNo: rawTruck.replace(/-/g, ' ') }],
        isActive: true,
      }).select('+refreshToken');

      if (!driverCredential) {
        throw new ApiError(401, 'Invalid refresh token');
      }

      if (driverCredential.refreshToken !== hashedToken) {
        // Token reuse detected — revoke driver session (Gap 3)
        driverCredential.refreshToken = undefined;
        await driverCredential.save();
        logger.warn(`Refresh token reuse detected for driver: ${driverCredential.truckNo}`);
        throw new ApiError(401, 'Invalid refresh token');
      }

      const payload: JWTPayload = {
        userId: decoded.userId,
        username: driverCredential.truckNo,
        role: 'driver' as any,
      };
      const tokens = generateTokens(payload, rtAccessExpiry, rtRefreshExpiry);
      driverCredential.refreshToken = crypto.createHash('sha256').update(tokens.refreshToken).digest('hex');
      await driverCredential.save();

      res.status(200).json({
        success: true,
        message: 'Token refreshed successfully',
        data: { accessToken: tokens.accessToken, refreshToken: tokens.refreshToken },
      });
      return;
    }

    // Regular user refresh token path
    const user = await User.findById(decoded.userId).select('+refreshToken');

    if (!user) {
      throw new ApiError(401, 'Invalid refresh token');
    }

    if (user.isDeleted || !user.isActive) {
      throw new ApiError(401, 'Invalid refresh token');
    }

    if (user.refreshToken !== hashedToken) {
      // Token reuse detected — revoke all sessions AND clear any remember-me cookie
      user.refreshToken = undefined;
      await user.save();
      // Clear the compromised cookie so it cannot be retried
      if (usedCookie) {
        res.clearCookie('fuel_order_refresh', { path: '/api' });
      }
      logger.warn(`Refresh token reuse detected for user: ${user.username}`);
      throw new ApiError(401, 'Invalid refresh token');
    }

    // Generate new tokens (rotating refresh token)
    const payload: JWTPayload = {
      userId: user._id.toString(),
      username: user.username,
      role: user.role,
    };

    const tokens = generateTokens(payload, rtAccessExpiry, rtRefreshExpiry);

    // Hash and store the new refresh token (Gap 2)
    user.refreshToken = crypto.createHash('sha256').update(tokens.refreshToken).digest('hex');
    await user.save();

    // ── Rotate the HttpOnly cookie if this request came from one ─────────
    // Each use of the cookie issues a brand-new token and resets the TTL
    // so active users stay logged in without ever touching localStorage.
    const sessionTimeoutMinutes = sessionSysConfig?.systemSettings?.session?.sessionTimeout ?? 30;

    if (usedCookie) {
      const rmDays = rtRefreshExpiryDays ?? 30;
      res.cookie('fuel_order_refresh', tokens.refreshToken, refreshCookieOptions(rmDays));
      // Return only the access token — the new refresh token lives in the cookie
      res.status(200).json({
        success: true,
        message: 'Token refreshed successfully',
        data: { accessToken: tokens.accessToken, sessionTimeoutMinutes },
      });
    } else {
      res.status(200).json({
        success: true,
        message: 'Token refreshed successfully',
        data: { ...tokens, sessionTimeoutMinutes },
      });
    }
  } catch (error: any) {
    if (error.name === 'TokenExpiredError') {
      // Cookie is expired — clear it so browser stops sending it
      res.clearCookie('fuel_order_refresh', { path: '/api' });
      throw new ApiError(401, 'Refresh token expired. Please login again.');
    }
    throw error;
  }
};

/**
 * Logout user
 */
export const logout = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      throw new ApiError(401, 'Not authenticated');
    }

    // Clear refresh token from DB
    await User.findByIdAndUpdate(req.user.userId, { refreshToken: null });

    // Clear the remember-me HttpOnly cookie regardless of whether it was used
    // This ensures logout is complete across all remember-me sessions on this device
    const isProd = process.env.NODE_ENV === 'production';
    res.clearCookie('fuel_order_refresh', {
      httpOnly: true,
      secure: isProd,
      sameSite: isProd ? 'none' : 'lax',
      path: '/api',
    });

    logger.info(`User logged out: ${req.user.username}`);

    // Log logout
    await AuditService.logLogout(
      req.user.userId,
      req.user.username,
      req.ip
    );

    res.status(200).json({
      success: true,
      message: 'Logout successful',
    });
  } catch (error: any) {
    throw error;
  }
};

/**
 * Get current user profile
 */
export const getProfile = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      throw new ApiError(401, 'Not authenticated');
    }

    // ✅ SECURITY: Explicitly exclude sensitive fields from response
    const user = await User.findById(req.user.userId).select('-password -refreshToken -passwordHistory -resetPasswordToken -resetPasswordExpires -failedLoginAttempts -lockedUntil');

    if (!user) {
      throw new ApiError(404, 'User not found');
    }

    // Heal a stale mustChangePassword flag here too. The remember-me restore path
    // (POST /auth/refresh → GET /auth/me) never goes through login(), so /me — the
    // value the frontend's "Set Your Password" gate reads — must heal an established
    // account itself; otherwise a returning user is wrongly forced into first-login
    // setup on a new tab / browser restart. Genuine pending accounts are untouched.
    // The doc was loaded without +password, so save() won't re-hash (pre-save hook
    // guards on isModified('password')).
    if (healStaleMustChangePassword(user)) {
      await user.save();
      logger.info(`[AUTO-CLEAR] Cleared stale mustChangePassword flag for user: ${user.username} during /me`);
    }

    res.status(200).json({
      success: true,
      message: 'Profile retrieved successfully',
      data: user,
    });
  } catch (error: any) {
    throw error;
  }
};

/**
 * Update current user profile
 */
export const updateProfile = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      throw new ApiError(401, 'Not authenticated');
    }

    const { firstName, lastName, email, department, station } = req.body;

    const user = await User.findById(req.user.userId);

    if (!user) {
      throw new ApiError(404, 'User not found');
    }

    // Update allowed fields
    if (firstName) user.firstName = firstName;
    if (lastName) user.lastName = lastName;
    if (email) user.email = email;
    if (department !== undefined) user.department = department;
    if (station !== undefined) user.station = station;

    await user.save();

    logger.info(`User profile updated: ${user.username}`);

    res.status(200).json({
      success: true,
      message: 'Profile updated successfully',
      data: user,
    });
  } catch (error: any) {
    throw error;
  }
};

/**
 * Change password
 */
export const changePassword = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      throw new ApiError(401, 'Not authenticated');
    }

    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      throw new ApiError(400, 'Current password and new password are required');
    }

    const user = await User.findById(req.user.userId).select('+password +passwordHistory');

    if (!user) {
      throw new ApiError(404, 'User not found');
    }

    // Verify current password
    const isPasswordValid = await user.comparePassword(currentPassword);

    if (!isPasswordValid) {
      throw new ApiError(401, 'Current password is incorrect');
    }

    // Enforce admin-configured password policy
    const policy = await getPasswordPolicy();
    const policyError = enforcePasswordPolicy(newPassword, policy);
    if (policyError) {
      throw new ApiError(400, policyError);
    }

    // Check against HaveIBeenPwned breached password database
    const breachCheck = await checkBreachedPassword(newPassword);
    if (breachCheck.breached) {
      throw new ApiError(400, `This password has appeared in ${breachCheck.count.toLocaleString()} data breaches. Please choose a different password.`);
    }

    // Enforce password history: new password must not match recent previous passwords
    if (policy.historyCount > 0) {
      const historyToCheck = [user.password!, ...(user.passwordHistory ?? [])].slice(0, policy.historyCount);
      for (const oldHash of historyToCheck) {
        if (await bcrypt.compare(newPassword, oldHash)) {
          throw new ApiError(400, `Password was recently used. Choose a password not used in the last ${policy.historyCount} change${policy.historyCount === 1 ? '' : 's'}.`);
        }
      }
    }

    // Archive current hash before overwriting
    if (policy.historyCount > 0 && user.password) {
      user.passwordHistory = [user.password, ...(user.passwordHistory ?? [])].slice(0, policy.historyCount);
    }

    // Update password and clear any forced-change flag
    user.password = newPassword;
    user.mustChangePassword = false;
    user.passwordResetAt = undefined;
    user.pendingActivation = false; // Belt-and-suspenders: ensure pending clears on any password change
    await user.save();

    // Drop the cached auth snapshot so the expiry check sees the new state immediately
    invalidateAuthUserCache(user._id);

    logger.info(`Password changed for user: ${user.username}`);

    // Send confirmation email
    await emailService.sendPasswordChangedEmail(user.email, `${user.firstName} ${user.lastName}`);

    res.status(200).json({
      success: true,
      message: 'Password changed successfully',
    });
  } catch (error: any) {
    throw error;
  }
};

/**
 * First-login password set (no current password required)
 * Only works when mustChangePassword === true on the user account.
 */
export const firstLoginPassword = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      throw new ApiError(401, 'Not authenticated');
    }

    const { newPassword, rememberMe } = req.body;

    if (!newPassword || typeof newPassword !== 'string') {
      throw new ApiError(400, 'New password is required');
    }

    const user = await User.findById(req.user.userId).select('+password +passwordHistory');

    if (!user) {
      throw new ApiError(404, 'User not found');
    }

    if (!user.mustChangePassword) {
      // Flag was already cleared (e.g. by auto-clear during login).
      // Instead of blocking with 403, return fresh tokens so the frontend
      // can clear its local state and proceed to the dashboard.
      const sessionConfig = await SystemConfig.findOne({ configType: 'system_settings' });
      const jwtExpiryHours = sessionConfig?.systemSettings?.session?.jwtExpiry;
      const refreshExpiryDays = sessionConfig?.systemSettings?.session?.refreshTokenExpiry;
      const accessExpiry = jwtExpiryHours ? `${jwtExpiryHours}h` : undefined;
      const refreshExpiry = refreshExpiryDays ? `${refreshExpiryDays}d` : undefined;

      const payload: JWTPayload = {
        userId: user._id.toString(),
        username: user.username,
        role: user.role,
      };
      const { accessToken, refreshToken } = generateTokens(payload, accessExpiry, refreshExpiry);
      user.refreshToken = crypto.createHash('sha256').update(refreshToken).digest('hex');
      await user.save();

      // Establish/rotate the Remember Me cookie so the new refresh token is in
      // sync with the DB. Honour either the user's remembered intent or an
      // existing cookie (login no longer sets the cookie for un-activated users,
      // so the intent flag is what carries Remember Me through first-login setup).
      if (rememberMe || (req.cookies as any)?.fuel_order_refresh) {
        const rmDays = refreshExpiryDays ?? 30;
        res.cookie('fuel_order_refresh', refreshToken, refreshCookieOptions(rmDays));
      }

      logger.info(`[FIRST-LOGIN] mustChangePassword already false for ${user.username}, returning fresh tokens`);
      res.status(200).json({
        success: true,
        message: 'Password change is not required. Proceeding to dashboard.',
        data: {
          accessToken,
          refreshToken,
          user: user.toJSON(),
        },
      });
      return;
    }

    // Enforce admin-configured password policy
    const fl_policy = await getPasswordPolicy();
    const fl_policyError = enforcePasswordPolicy(newPassword, fl_policy);
    if (fl_policyError) {
      throw new ApiError(400, fl_policyError);
    }

    // Check against HaveIBeenPwned breached password database
    const fl_breachCheck = await checkBreachedPassword(newPassword);
    if (fl_breachCheck.breached) {
      throw new ApiError(400, `This password has appeared in ${fl_breachCheck.count.toLocaleString()} data breaches. Please choose a different password.`);
    }

    // Enforce password history
    if (fl_policy.historyCount > 0) {
      const historyToCheck = [user.password!, ...(user.passwordHistory ?? [])].slice(0, fl_policy.historyCount);
      for (const oldHash of historyToCheck) {
        if (oldHash && await bcrypt.compare(newPassword, oldHash)) {
          throw new ApiError(400, `Password was recently used. Choose a different password.`);
        }
      }
    }

    // Archive current hash before overwriting
    if (fl_policy.historyCount > 0 && user.password) {
      user.passwordHistory = [user.password, ...(user.passwordHistory ?? [])].slice(0, fl_policy.historyCount);
    }

    user.password = newPassword;
    user.mustChangePassword = false;
    user.passwordResetAt = undefined;
    user.tempPasswordExpiresAt = undefined; // Credentials no longer temporary
    // User has officially activated their account by setting their own password.
    user.pendingActivation = false;

    // Drop the cached auth snapshot so the expiry check sees the new state immediately
    invalidateAuthUserCache(user._id);

    logger.info(`First-login password set for user: ${user.username}`);

    // Send confirmation email (non-blocking)
    emailService.sendPasswordChangedEmail(user.email, `${user.firstName} ${user.lastName}`)
      .catch((emailError: any) => logger.error('Failed to send password-changed email:', emailError));

    // Generate fresh tokens after password change
    const sessionConfig = await SystemConfig.findOne({ configType: 'system_settings' });
    const jwtExpiryHours = sessionConfig?.systemSettings?.session?.jwtExpiry;
    const refreshExpiryDays = sessionConfig?.systemSettings?.session?.refreshTokenExpiry;
    const accessExpiry = jwtExpiryHours ? `${jwtExpiryHours}h` : undefined;
    const refreshExpiry = refreshExpiryDays ? `${refreshExpiryDays}d` : undefined;

    const payload: JWTPayload = {
      userId: user._id.toString(),
      username: user.username,
      role: user.role,
    };

    const { accessToken, refreshToken } = generateTokens(payload, accessExpiry, refreshExpiry);

    // Store hashed refresh token and save everything in a single DB write
    user.refreshToken = crypto.createHash('sha256').update(refreshToken).digest('hex');
    await user.save();

    // Establish the Remember Me cookie now that the user has activated their
    // account by setting their own password. We do this when the user opted into
    // Remember Me (intent flag) OR already had a cookie. login() deliberately does
    // NOT set the cookie for un-activated users, so this is the point at which a
    // persistent session is first created with a refresh token that matches the DB
    // hash just written above. Without it, the next Remember Me attempt would 401.
    const hadRememberMeCookie = !!(req.cookies as any)?.fuel_order_refresh;
    if (rememberMe || hadRememberMeCookie) {
      const rmDays = refreshExpiryDays ?? 30;
      res.cookie('fuel_order_refresh', refreshToken, refreshCookieOptions(rmDays));
    }

    res.status(200).json({
      success: true,
      message: 'Password set successfully. Welcome!',
      data: {
        accessToken,
        refreshToken,
        user: user.toJSON(),
      },
    });
  } catch (error: any) {
    throw error;
  }
};

/**
 * Activate account via magic link (public — no password required)
 * The activation token was generated by createUser and emailed to the user.
 * On success the user receives full auth tokens with mustChangePassword still true
 * so the ForcePasswordChange page is shown automatically.
 */
export const activateAccount = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { token, rememberMe } = req.body;

    if (!token || typeof token !== 'string') {
      throw new ApiError(400, 'Activation token is required');
    }

    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

    const user = await User.findOne({
      activationToken: hashedToken,
      activationTokenExpires: { $gt: new Date() },
      isDeleted: false,
      isActive: true,
    }).select('+activationToken +activationTokenExpires');

    if (!user) {
      throw new ApiError(400, 'Invalid or expired activation link. Please contact your administrator for a new link.');
    }

    // Consume the token so it cannot be reused
    user.activationToken = undefined;
    user.activationTokenExpires = undefined;

    // Read session config for token lifetimes
    const sessionConfig = await SystemConfig.findOne({ configType: 'system_settings' });
    const jwtExpiryHours = sessionConfig?.systemSettings?.session?.jwtExpiry;
    const refreshExpiryDays = sessionConfig?.systemSettings?.session?.refreshTokenExpiry;
    const accessExpiry = jwtExpiryHours ? `${jwtExpiryHours}h` : undefined;
    const refreshExpiry = refreshExpiryDays ? `${refreshExpiryDays}d` : undefined;

    const payload: JWTPayload = {
      userId: user._id.toString(),
      username: user.username,
      role: user.role,
    };

    const { accessToken, refreshToken } = generateTokens(payload, accessExpiry, refreshExpiry);

    user.refreshToken = crypto.createHash('sha256').update(refreshToken).digest('hex');
    user.lastLogin = new Date();
    await user.save();

    logger.info(`Account activated via magic link: ${user.username}`);

    await AuditService.logLogin(
      user.username,
      true,
      req.ip,
      req.get('user-agent'),
      user._id.toString()
    );

    // Do NOT set the remember-me cookie yet — the user still needs to set their
    // password via ForcePasswordChange. The cookie is established by firstLoginPassword
    // once the account is fully activated (same pattern as the regular login flow).
    // We do persist the rememberMe intent so firstLoginPassword can pick it up.

    res.status(200).json({
      success: true,
      message: 'Account activated. Please set your password to continue.',
      data: {
        accessToken,
        refreshToken,
        rememberMe: !!rememberMe,
        user: user.toJSON(),
        sessionTimeoutMinutes: sessionConfig?.systemSettings?.session?.sessionTimeout ?? 30,
      },
    });
  } catch (error: any) {
    throw error;
  }
};

/**
 * Request password reset
 */
export const forgotPassword = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { email } = req.body;

    if (!email) {
      throw new ApiError(400, 'Email is required');
    }

    // Find user by email (with field selection to prevent PII leakage)
    const user = await User.findOne({ email: email.toLowerCase(), isDeleted: false }).select('-password -refreshToken -passwordHistory -resetPasswordToken -resetPasswordExpires');

    // Always return success message for security (don't reveal if email exists)
    const successMessage = 'If an account with that email exists, a password reset link has been sent.';

    if (!user) {
      logger.warn(`Password reset requested for non-existent email: ${email}`);
      // Still return success to prevent email enumeration
      res.status(200).json({
        success: true,
        message: successMessage,
      });
      return;
    }

    // Check if user is active
    if (!user.isActive) {
      logger.warn(`Password reset requested for inactive user: ${email}`);
      res.status(200).json({
        success: true,
        message: successMessage,
      });
      return;
    }

    // Generate reset token
    const resetToken = crypto.randomBytes(32).toString('hex');
    
    // Hash token before saving to database
    const hashedToken = crypto.createHash('sha256').update(resetToken).digest('hex');

    // Set token and expiry (30 minutes)
    user.resetPasswordToken = hashedToken;
    user.resetPasswordExpires = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes
    await user.save();

    // Create reset URL - adjust frontend URL as needed
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    const resetUrl = `${frontendUrl}/reset-password?token=${resetToken}&email=${encodeURIComponent(email)}`;

    // Send email
    try {
      await emailService.sendPasswordResetEmail({
        email: user.email,
        name: `${user.firstName} ${user.lastName}`,
        resetToken,
        resetUrl,
      });

      logger.info(`Password reset email sent to: ${email}`);

      res.status(200).json({
        success: true,
        message: successMessage,
      });
    } catch (emailError) {
      // Clear reset token if email fails
      user.resetPasswordToken = undefined;
      user.resetPasswordExpires = undefined;
      await user.save();

      logger.error('Failed to send password reset email:', emailError);
      throw new ApiError(500, 'Failed to send password reset email. Please try again later.');
    }
  } catch (error: any) {
    throw error;
  }
};

/**
 * Update current user preferences (theme, etc.)
 */
export const updatePreferences = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      throw new ApiError(401, 'Not authenticated');
    }

    const { theme } = req.body;

    if (theme !== undefined && theme !== 'light' && theme !== 'dark') {
      throw new ApiError(400, 'Invalid theme value. Must be "light" or "dark".');
    }

    const update: any = {};
    if (theme !== undefined) update.theme = theme;

    const user = await User.findByIdAndUpdate(
      req.user.userId,
      { $set: update },
      { new: true }
    );

    if (!user) {
      throw new ApiError(404, 'User not found');
    }

    res.status(200).json({
      success: true,
      message: 'Preferences updated successfully',
      data: { theme: user.theme },
    });
  } catch (error: any) {
    throw error;
  }
};

/**
 * Reset password with token
 */
export const resetPassword = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { email, token, newPassword } = req.body;

    if (!email || !token || !newPassword) {
      throw new ApiError(400, 'Email, token, and new password are required');
    }

    // Hash the token to compare with stored hash
    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

    // Find user with valid reset token
    const user = await User.findOne({
      email: email.toLowerCase(),
      resetPasswordToken: hashedToken,
      resetPasswordExpires: { $gt: new Date() }, // Token not expired
      isDeleted: false,
    }).select('+password +resetPasswordToken +resetPasswordExpires +passwordHistory');

    if (!user) {
      throw new ApiError(400, 'Invalid or expired password reset token');
    }

    // Enforce admin-configured password policy
    const rp_policy = await getPasswordPolicy();
    const rp_policyError = enforcePasswordPolicy(newPassword, rp_policy);
    if (rp_policyError) {
      throw new ApiError(400, rp_policyError);
    }

    // Check against HaveIBeenPwned breached password database
    const rp_breachCheck = await checkBreachedPassword(newPassword);
    if (rp_breachCheck.breached) {
      throw new ApiError(400, `This password has appeared in ${rp_breachCheck.count.toLocaleString()} data breaches. Please choose a different password.`);
    }

    // Enforce password history
    if (rp_policy.historyCount > 0) {
      const historyToCheck = [user.password!, ...(user.passwordHistory ?? [])].slice(0, rp_policy.historyCount);
      for (const oldHash of historyToCheck) {
        if (oldHash && await bcrypt.compare(newPassword, oldHash)) {
          throw new ApiError(400, `Password was recently used. Choose a different password.`);
        }
      }
    }

    // Archive current hash before overwriting
    if (rp_policy.historyCount > 0 && user.password) {
      user.passwordHistory = [user.password, ...(user.passwordHistory ?? [])].slice(0, rp_policy.historyCount);
    }

    // Update password
    user.password = newPassword;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;
    
    // Also clear refresh tokens for security
    user.refreshToken = undefined;
    
    await user.save();

    logger.info(`Password reset successful for user: ${user.username}`);

    // Log the password reset action
    await AuditService.logPasswordReset(
      user._id.toString(),
      user.username,
      req.ip
    );

    // Send confirmation email — non-fatal if it fails
    try {
      await emailService.sendPasswordChangedEmail(user.email, `${user.firstName} ${user.lastName}`);
    } catch (emailError) {
      logger.error('Failed to send password-changed confirmation email:', emailError);
    }

    res.status(200).json({
      success: true,
      message: 'Password has been reset successfully. You can now log in with your new password.',
    });
  } catch (error: any) {
    throw error;
  }
};

/**
 * Public endpoint — returns the active password policy so the frontend
 * can display live requirement hints without requiring authentication.
 * No sensitive data is exposed (only policy flags, no user data).
 */
export const getPasswordPolicyPublic = async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const policy = await getPasswordPolicy();
    res.status(200).json({
      success: true,
      data: {
        minLength: policy.minLength,
        requireUppercase: policy.requireUppercase,
        requireLowercase: policy.requireLowercase,
        requireNumbers: policy.requireNumbers,
        requireSpecialChars: policy.requireSpecialChars,
      },
    });
  } catch {
    // Fallback to safe defaults so the UI always renders something
    res.status(200).json({
      success: true,
      data: {
        minLength: 8,
        requireUppercase: false,
        requireLowercase: false,
        requireNumbers: false,
        requireSpecialChars: false,
      },
    });
  }
};

