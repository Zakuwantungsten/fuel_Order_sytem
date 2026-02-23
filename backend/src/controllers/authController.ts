import { Response } from 'express';
import { User, DriverCredential, SystemConfig } from '../models';
import { ApiError } from '../middleware/errorHandler';
import { generateTokens, verifyRefreshToken, logger, createDriverUserId } from '../utils';
import { AuditService } from '../utils/auditService';
import { AuthRequest } from '../middleware/auth';
import { LoginRequest, RegisterRequest, AuthResponse, JWTPayload } from '../types';
import * as crypto from 'crypto';
import emailService from '../services/emailService';
import { emitToUser } from '../services/websocket';


/**
 * Register a new user
 */
export const register = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { username, email, password, firstName, lastName, role } = req.body as RegisterRequest;

    // Check if user already exists
    const existingUser = await User.findOne({
      $or: [{ username }, { email }],
    });

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

    // Save refresh token
    user.refreshToken = refreshToken;
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

      const { accessToken, refreshToken } = generateTokens(payload);

      logger.info(`Driver logged in: ${actualTruckNo}`);

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
        data: response,
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

    // Verify password
    const isPasswordValid = await user.comparePassword(password);

    if (!isPasswordValid) {
      // Log failed login attempt
      await AuditService.logLogin(
        username,
        false,
        req.ip,
        req.get('user-agent')
      );
      throw new ApiError(401, 'Invalid password. Please check your credentials and try again.');
    }

    // Enforce single-session policy if configured
    const systemConfig = await SystemConfig.findOne({ configType: 'system_settings' });
    const allowMultipleSessions = systemConfig?.systemSettings?.session?.allowMultipleSessions ?? true;

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

    const { accessToken, refreshToken } = generateTokens(payload);

    // Update refresh token and last login
    user.refreshToken = refreshToken;
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
      data: response,
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

    // Verify refresh token
    const decoded = verifyRefreshToken(token);

    // Find user and verify refresh token matches
    const user = await User.findById(decoded.userId).select('+refreshToken');

    if (!user || user.refreshToken !== token || user.isDeleted || !user.isActive) {
      throw new ApiError(401, 'Invalid refresh token');
    }

    // Generate new tokens
    const payload: JWTPayload = {
      userId: user._id.toString(),
      username: user.username,
      role: user.role,
    };

    const tokens = generateTokens(payload);

    // Update refresh token
    user.refreshToken = tokens.refreshToken;
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

    const user = await User.findById(req.user.userId);

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

    const user = await User.findById(req.user.userId).select('+password');

    if (!user) {
      throw new ApiError(404, 'User not found');
    }

    // Verify current password
    const isPasswordValid = await user.comparePassword(currentPassword);

    if (!isPasswordValid) {
      throw new ApiError(401, 'Current password is incorrect');
    }

    // Update password
    user.password = newPassword;
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
 * Request password reset
 */
export const forgotPassword = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { email } = req.body;

    if (!email) {
      throw new ApiError(400, 'Email is required');
    }

    // Find user by email
    const user = await User.findOne({ email: email.toLowerCase(), isDeleted: false });

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
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
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

    // Validate password length
    if (newPassword.length < 6) {
      throw new ApiError(400, 'Password must be at least 6 characters long');
    }

    // Hash the token to compare with stored hash
    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

    // Find user with valid reset token
    const user = await User.findOne({
      email: email.toLowerCase(),
      resetPasswordToken: hashedToken,
      resetPasswordExpires: { $gt: new Date() }, // Token not expired
      isDeleted: false,
    }).select('+password +resetPasswordToken +resetPasswordExpires');

    if (!user) {
      throw new ApiError(400, 'Invalid or expired password reset token');
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

    // Send confirmation email
    await emailService.sendPasswordChangedEmail(user.email, `${user.firstName} ${user.lastName}`);

    res.status(200).json({
      success: true,
      message: 'Password has been reset successfully. You can now log in with your new password.',
    });
  } catch (error: any) {
    throw error;
  }
};

