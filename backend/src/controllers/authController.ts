import { Response } from 'express';
import bcrypt from 'bcryptjs';
import { User, DriverCredential, SystemConfig } from '../models';
import { MFA } from '../models/MFA';
import UserMFA from '../models/UserMFA';
import LoginActivity from '../models/LoginActivity';
import { KnownDevice } from '../models/KnownDevice';
import { ApiError } from '../middleware/errorHandler';
import { generateTokens, verifyRefreshToken, logger, createDriverUserId } from '../utils';
import { AuditService } from '../utils/auditService';
import AnomalyDetectionService from '../utils/anomalyDetectionService';
import { AuthRequest } from '../middleware/auth';
import { LoginRequest, RegisterRequest, AuthResponse, JWTPayload } from '../types';
import * as crypto from 'crypto';
import emailService from '../services/emailService';
import mfaService from '../services/mfaService';
import { emitToUser } from '../services/websocket';
import { getPasswordPolicy, enforcePasswordPolicy } from '../utils/passwordPolicy';
import { checkBreachedPassword } from '../utils/breachedPasswordCheck';
import { assessLoginRisk } from '../utils/riskScoringService';

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
 * Enhanced with secure driver authentication
 */
export const login = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { username, password } = req.body as LoginRequest;

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
    const refreshExpiry = refreshExpiryDays ? `${refreshExpiryDays}d` : undefined;

    if (isDriverLogin) {
      // Secure driver authentication using DriverCredential model
      // Normalize truck number format - try both space and hyphen formats
      const inputTruck = username.toUpperCase().trim();
      
      // Try to find with the exact format entered
      let driverCredential = await DriverCredential.findOne({
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
      let shouldClear = false;
      let clearReason = '';

      // Rule 1: No passwordResetAt = stale data from before the feature was deployed
      if (!user.passwordResetAt) {
        shouldClear = true;
        clearReason = 'no passwordResetAt set (legacy data)';
      }
      // Rule 2: passwordResetAt is older than 5 minutes — admin reset happened a while ago,
      // and the user is already logging in with working credentials, so the flag is stale.
      else {
        const minutesSincePwdReset = (Date.now() - new Date(user.passwordResetAt).getTime()) / (1000 * 60);
        if (minutesSincePwdReset > 5) {
          shouldClear = true;
          clearReason = `passwordResetAt is ${minutesSincePwdReset.toFixed(0)} min old (stale)`;
        }
      }

      if (shouldClear) {
        user.mustChangePassword = false;
        user.passwordResetAt = undefined;
        await user.save();
        logger.info(`[AUTO-CLEAR] Cleared stale mustChangePassword flag for user: ${username} (reason: ${clearReason})`);
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

    // Check if MFA is enabled for this user (user has set it up)
    const mfaEnabled = await mfaService.isMFAEnabled(user._id.toString());
    // Check if MFA is required by system/admin settings (role-based or per-user mandatory)
    const mfaRequired = await mfaService.isMFARequired(user._id.toString());
    const deviceId = req.body.deviceId || req.get('x-device-id');
    
    if (mfaEnabled) {
      // User has MFA set up — verify it
      const mfaSettings = await MFA.findOne({ userId: user._id });
      const isDeviceTrusted = deviceId && typeof (mfaSettings as any)?.isDeviceTrusted === 'function' && (mfaSettings as any).isDeviceTrusted(deviceId);
      
      if (!isDeviceTrusted) {
        // MFA required - generate temporary session token
        const tempSessionToken = crypto.randomBytes(32).toString('hex');
        const tempSessionExpiry = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes
        
        // Store temp session token in user (or use Redis for production)
        user.refreshToken = crypto.createHash('sha256').update(tempSessionToken).digest('hex');
        await user.save();
        
        logger.info(`User ${username} requires MFA verification`);
        
        res.status(200).json({
          success: true,
          requiresMFA: true,
          message: 'Please provide your MFA code to complete login',
          data: {
            userId: user._id.toString(),
            tempSessionToken,
            tempSessionExpiry,
            mfaMethods: {
              totp: mfaSettings?.totpEnabled || false,
              sms: mfaSettings?.smsEnabled || false,
              email: mfaSettings?.emailEnabled || false,
            },
            preferredMethod: mfaSettings?.preferredMethod || 'totp',
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

      // Read allowed MFA methods: per-user override > per-role override > global default
      const sysConfig = await SystemConfig.findOne({ configType: 'system_settings', isDeleted: false });
      const mfaPolicy = sysConfig?.securitySettings?.mfa;
      let allowedMethods: string[] = mfaPolicy?.allowedMethods ?? ['totp', 'email'];

      // Per-role method override (e.g. admins → TOTP-only)
      const roleOverrides = (mfaPolicy as any)?.roleMethodOverrides;
      if (roleOverrides && roleOverrides[user.role] && Array.isArray(roleOverrides[user.role]) && roleOverrides[user.role].length > 0) {
        allowedMethods = roleOverrides[user.role];
      }

      // Per-user allowed methods override (set by admin in MFA Management) — highest priority
      // Check both MFA model (consolidated) and UserMFA (legacy) — MFA takes precedence
      const mfaRecord = await MFA.findOne({ userId: user._id });
      const userMfaOverride = await UserMFA.findOne({ userId: user._id });
      if (mfaRecord?.allowedMethods && mfaRecord.allowedMethods.length > 0) {
        allowedMethods = mfaRecord.allowedMethods;
      } else if (userMfaOverride?.allowedMethods && userMfaOverride.allowedMethods.length > 0) {
        allowedMethods = userMfaOverride.allowedMethods;
      }

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

    if (!allowMultipleSessions) {
      // Single-session policy: kick any existing session for this user.
      // emitToUser sends to the 'user:<username>' socket room; if nobody is
      // in that room yet (first login) this is a harmless no-op.
      emitToUser(user.username, 'session_event', {
        type: 'force_logout',
        message: 'You have been logged out because a new session was started from another location.',
      });
      logger.info(`Single-session policy: existing session(s) for '${username}' were force-logged out`);
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

    logger.info(`User logged in: ${username}`);

    // Log successful login
    await AuditService.logLogin(
      user.username,
      true,
      req.ip,
      req.get('user-agent'),
      user._id.toString()
    );

    // Log risk score if elevated
    if (riskResult.score > 30) {
      await AuditService.log({
        userId: user._id.toString(),
        username,
        action: 'ELEVATED_RISK_LOGIN',
        resourceType: 'auth',
        details: JSON.stringify({ riskScore: riskResult.score, riskLevel: riskResult.level, factors: riskResult.factors }),
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
      });
    }

    const response: AuthResponse = {
      user: user.toJSON(),
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
        user._id.toString(), user.refreshToken, ip, ua
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

    res.status(200).json({
      success: true,
      message: 'Login successful',
      data: {
        ...response,
        sessionTimeoutMinutes: sessionConfig?.systemSettings?.session?.sessionTimeout ?? 30,
        riskScore: riskResult.score,
        riskLevel: riskResult.level,
      },
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
    const { userId, tempSessionToken, code, method, trustDevice, deviceName } = req.body;

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
      emitToUser(user.username, 'session_event', {
        type: 'force_logout',
        message: 'You have been logged out because a new session was started from another location.',
      });
      logger.info(`Single-session policy: existing session(s) for '${user.username}' were force-logged out`);
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

    res.status(200).json({
      success: true,
      message: 'MFA verification successful. Login complete.',
      data: {
        ...response,
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
    const { userId, tempSessionToken, secret, code, trustDevice, deviceId, deviceName } = req.body;

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
    if (user.mustChangePassword) {
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
      emitToUser(user.username, 'session_event', {
        type: 'force_logout',
        message: 'You have been logged out because a new session was started from another location.',
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

    res.status(200).json({
      success: true,
      message: 'MFA setup complete. Login successful.',
      data: {
        ...response,
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
    const { userId, tempSessionToken, code, trustDevice, deviceId, deviceName } = req.body;

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
    if (user.mustChangePassword) {
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
      emitToUser(user.username, 'session_event', {
        type: 'force_logout',
        message: 'You have been logged out because a new session was started from another location.',
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

    res.status(200).json({
      success: true,
      message: 'Email MFA setup complete. Login successful.',
      data: {
        ...response,
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
    const { refreshToken: token } = req.body;

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
    const rtRefreshExpiry = rtRefreshExpiryDays ? `${rtRefreshExpiryDays}d` : undefined;

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
        data: tokens,
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
      // Token reuse detected — revoke all sessions for this user (Gap 3)
      user.refreshToken = undefined;
      await user.save();
      logger.warn(`Refresh token reuse detected for user: ${user.username}`);
      throw new ApiError(401, 'Invalid refresh token');
    }

    // Generate new tokens
    const payload: JWTPayload = {
      userId: user._id.toString(),
      username: user.username,
      role: user.role,
    };

    const tokens = generateTokens(payload, rtAccessExpiry, rtRefreshExpiry);

    // Hash and store the new refresh token (Gap 2)
    user.refreshToken = crypto.createHash('sha256').update(tokens.refreshToken).digest('hex');
    await user.save();

    res.status(200).json({
      success: true,
      message: 'Token refreshed successfully',
      data: tokens,
    });
  } catch (error: any) {
    if (error.name === 'TokenExpiredError') {
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

    // Clear refresh token
    await User.findByIdAndUpdate(req.user.userId, { refreshToken: null });

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
    await user.save();

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

    const { newPassword } = req.body;

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

