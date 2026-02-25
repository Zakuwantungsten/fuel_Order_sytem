import { Response } from 'express';
import bcrypt from 'bcryptjs';
import { User, DriverCredential, SystemConfig } from '../models';
import { ApiError } from '../middleware/errorHandler';
import { generateTokens, verifyRefreshToken, logger, createDriverUserId } from '../utils';
import { AuditService } from '../utils/auditService';
import AnomalyDetectionService from '../utils/anomalyDetectionService';
import { AuthRequest } from '../middleware/auth';
import { LoginRequest, RegisterRequest, AuthResponse, JWTPayload } from '../types';
import * as crypto from 'crypto';
import emailService from '../services/emailService';
import { emitToUser } from '../services/websocket';
import { getPasswordPolicy, enforcePasswordPolicy } from '../utils/passwordPolicy';


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

    // Auto-clear stale mustChangePassword for users created before this feature was deployed.
    // A stale flag has no passwordResetAt (the new tracking field). Users with a proper
    // forced-change requirement DO have passwordResetAt set, so they are unaffected.
    if (user.mustChangePassword && !user.passwordResetAt) {
      user.mustChangePassword = false;
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
    
    // Clear failed login attempts in anomaly detection cache
    AnomalyDetectionService.clearFailedLoginAttempts(
      username,
      req.ip || 'unknown'
    );

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

    const response: AuthResponse = {
      user: user.toJSON(),
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
      throw new ApiError(403, 'Password change is not required for this account');
    }

    // Enforce admin-configured password policy
    const fl_policy = await getPasswordPolicy();
    const fl_policyError = enforcePasswordPolicy(newPassword, fl_policy);
    if (fl_policyError) {
      throw new ApiError(400, fl_policyError);
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
    await user.save();

    logger.info(`First-login password set for user: ${user.username}`);

    // Send confirmation email
    try {
      await emailService.sendPasswordChangedEmail(user.email, `${user.firstName} ${user.lastName}`);
    } catch (emailError) {
      logger.error('Failed to send password-changed email:', emailError);
    }

    res.status(200).json({
      success: true,
      message: 'Password set successfully. Welcome!',
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

