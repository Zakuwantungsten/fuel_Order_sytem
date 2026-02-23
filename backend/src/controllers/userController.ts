import { Response } from 'express';
import { User } from '../models';
import { ApiError } from '../middleware/errorHandler';
import { AuthRequest } from '../middleware/auth';
import { getPaginationParams, createPaginatedResponse, calculateSkip, logger, formatTruckNumber, sanitizeRegexInput } from '../utils';
import { AuditService } from '../utils/auditService';
import { emailService } from '../services/emailService';
import crypto from 'crypto';
import { emitToUser } from '../services/websocket';

/**
 * Get all users with pagination and filters
 */
export const getAllUsers = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { page, limit, sort, order } = getPaginationParams(req.query);
    const { role, department, station, isActive } = req.query;

    // Build filter
    const filter: any = { isDeleted: false };

    if (role) {
      filter.role = role;
    }

    if (department) {
      const sanitized = sanitizeRegexInput(department as string);
      if (sanitized) {
        filter.department = { $regex: sanitized, $options: 'i' };
      }
    }

    if (station) {
      const sanitized = sanitizeRegexInput(station as string);
      if (sanitized) {
        filter.station = { $regex: sanitized, $options: 'i' };
      }
    }

    if (isActive !== undefined) {
      filter.isActive = isActive === 'true';
    }

    // Get data with pagination
    const skip = calculateSkip(page, limit);
    const sortOrder = order === 'asc' ? 1 : -1;

    const [users, total] = await Promise.all([
      User.find(filter)
        .select('-password -refreshToken')
        .sort({ [sort]: sortOrder })
        .skip(skip)
        .limit(limit)
        .lean(),
      User.countDocuments(filter),
    ]);

    // Transform _id to id for frontend compatibility
    const transformedUsers = users.map((user: any) => ({
      ...user,
      id: user._id.toString(),
    }));

    const response = createPaginatedResponse(transformedUsers, page, limit, total);

    res.status(200).json({
      success: true,
      message: 'Users retrieved successfully',
      data: response,
    });
  } catch (error: any) {
    throw error;
  }
};

/**
 * Get single user by ID
 */
export const getUserById = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const user = await User.findOne({ _id: id, isDeleted: false }).select('-password -refreshToken').lean();

    if (!user) {
      throw new ApiError(404, 'User not found');
    }

    // Transform _id to id for frontend compatibility
    const transformedUser = {
      ...user,
      id: user._id.toString(),
    };

    res.status(200).json({
      success: true,
      message: 'User retrieved successfully',
      data: transformedUser,
    });
  } catch (error: any) {
    throw error;
  }
};

/**
 * Create new user (Admin only)
 */
export const createUser = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { username, email, firstName, lastName, role, department, station, yard, truckNo } = req.body;

    // Format truck number to standard format
    const formattedTruckNo = truckNo ? formatTruckNumber(truckNo) : undefined;

    // Check if user already exists
    const existingUser = await User.findOne({
      $or: [{ username }, { email }],
      isDeleted: false,
    });

    if (existingUser) {
      if (existingUser.username === username) {
        throw new ApiError(400, 'Username already exists');
      }
      if (existingUser.email === email) {
        throw new ApiError(400, 'Email already exists');
      }
    }

    // Generate secure temporary password
    const temporaryPassword = crypto.randomBytes(8).toString('hex'); // 16 character password

    // Create new user
    const user = await User.create({
      username,
      email,
      password: temporaryPassword,
      firstName,
      lastName,
      role: role || 'viewer',
      department,
      station,
      yard,
      truckNo: formattedTruckNo,
      isActive: true,
      isDeleted: false,
      mustChangePassword: true,
      passwordResetAt: new Date(),
    });

    // Send welcome email with credentials
    try {
      await emailService.sendWelcomeEmail(
        email,
        `${firstName} ${lastName}`,
        username,
        temporaryPassword
      );
      logger.info(`Welcome email sent to ${email}`);
    } catch (emailError: any) {
      logger.error(`Failed to send welcome email to ${email}:`, emailError);
      // Don't fail user creation if email fails, but log it
    }

    // Remove sensitive data
    const userResponse = user.toJSON();

    logger.info(`New user created: ${username} by ${req.user?.username}`);

    // Log audit trail
    await AuditService.logCreate(
      req.user?.userId || 'system',
      req.user?.username || 'system',
      'User',
      user._id.toString(),
      { username, role, department, station, yard },
      req.ip
    );

    res.status(201).json({
      success: true,
      message: 'User created successfully. Welcome email sent with login credentials.',
      data: userResponse,
      emailSent: true,
    });
  } catch (error: any) {
    throw error;
  }
};

/**
 * Update user
 */
export const updateUser = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { password, refreshToken, ...updateData } = req.body;

    // Check if user exists
    const existingUser = await User.findOne({ _id: id, isDeleted: false });
    if (!existingUser) {
      throw new ApiError(404, 'User not found');
    }

    // Check for duplicate email if email is being updated
    if (updateData.email && updateData.email !== existingUser.email) {
      const emailExists = await User.findOne({
        email: updateData.email,
        isDeleted: false,
        _id: { $ne: id }, // Exclude current user
      });

      if (emailExists) {
        throw new ApiError(400, 'Email already exists');
      }
    }

    // Prevent updating password and refreshToken through this endpoint
    const user = await User.findOneAndUpdate(
      { _id: id, isDeleted: false },
      updateData,
      { new: true, runValidators: true }
    ).select('-password -refreshToken');

    if (!user) {
      throw new ApiError(404, 'User not found');
    }

    logger.info(`User updated: ${user.username} by ${req.user?.username}`);

    // Notify the affected user via WebSocket so their session reflects changes immediately
    const roleOrPermissionChanged = 'role' in updateData || 'station' in updateData || 'isActive' in updateData;
    emitToUser(existingUser.username, 'session_event', {
      type: 'account_updated',
      message: roleOrPermissionChanged
        ? 'Your account has been updated by an administrator. Please log in again to apply the changes.'
        : 'Your account details have been updated by an administrator. Please log in again.',
      requiresRelogin: true,
    });

    // Log audit trail
    await AuditService.logUpdate(
      req.user?.userId || 'system',
      req.user?.username || 'system',
      'User',
      user._id.toString(),
      {},
      { username: user.username, role: user.role },
      req.ip
    );

    res.status(200).json({
      success: true,
      message: 'User updated successfully',
      data: user,
    });
  } catch (error: any) {
    // Handle MongoDB duplicate key error
    if (error.code === 11000) {
      const field = Object.keys(error.keyPattern || {})[0];
      throw new ApiError(400, `${field} already exists`);
    }
    throw error;
  }
};

/**
 * Soft delete user
 */
export const deleteUser = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    // Prevent self-deletion
    if (req.user?.userId === id) {
      throw new ApiError(400, 'Cannot delete your own account');
    }

    const user = await User.findByIdAndUpdate(
      id,
      { isDeleted: true, deletedAt: new Date() },
      { new: true }
    ).select('-password -refreshToken');

    if (!user) {
      throw new ApiError(404, 'User not found');
    }

    logger.info(`User deleted: ${user.username} by ${req.user?.username}`);

    // Immediately kick the deleted user out via WebSocket
    emitToUser(user.username, 'session_event', {
      type: 'account_deleted',
      message: 'Your account has been removed by an administrator.',
    });

    // Log audit trail
    await AuditService.logDelete(
      req.user?.userId || 'system',
      req.user?.username || 'system',
      'User',
      user._id.toString(),
      { username: user.username, role: user.role },
      req.ip
    );

    res.status(200).json({
      success: true,
      message: 'User deleted successfully',
      data: user,
    });
  } catch (error: any) {
    throw error;
  }
};

/**
 * Reset user password (Admin only)
 */
export const resetUserPassword = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const user = await User.findOne({ _id: id, isDeleted: false });

    if (!user) {
      throw new ApiError(404, 'User not found');
    }

    // Generate temporary password
    const temporaryPassword = crypto.randomBytes(8).toString('hex');

    // Update password, clear refresh token and flag for password change
    user.password = temporaryPassword;
    user.mustChangePassword = true;
    user.passwordResetAt = new Date();
    user.refreshToken = undefined;
    await user.save();

    logger.info(`Password reset for user: ${user.username} by ${req.user?.username}`);

    // Immediately kick the user out so they must re-login with the new password
    emitToUser(user.username, 'session_event', {
      type: 'password_reset',
      message: 'Your password has been reset by an administrator. Please log in with your new credentials.',
    });

    // Send password reset email
    let emailSent = false;
    try {
      await emailService.sendPasswordResetByAdminEmail(
        user.email,
        `${user.firstName} ${user.lastName}`,
        user.username,
        temporaryPassword
      );
      emailSent = true;
      logger.info(`Password reset email sent to ${user.email}`);
    } catch (emailError: any) {
      logger.error(`Failed to send password reset email to ${user.email}:`, emailError);
      // Don't fail the operation if email fails
    }

    // Log audit trail
    await AuditService.log({
      userId: req.user?.userId,
      username: req.user?.username || 'system',
      action: 'PASSWORD_RESET',
      resourceType: 'User',
      resourceId: user._id.toString(),
      details: `Password reset for user: ${user.username}${emailSent ? ' (email sent)' : ' (email failed)'}`,
      ipAddress: req.ip,
      severity: 'medium',
    });

    res.status(200).json({
      success: true,
      message: emailSent 
        ? 'Password reset successfully. New password sent to user\'s email.'
        : 'Password reset successfully, but email notification failed.',
      data: { 
        temporaryPassword: emailSent ? undefined : temporaryPassword, // Only return password if email failed
        emailSent 
      },
    });
  } catch (error: any) {
    throw error;
  }
};

/**
 * Toggle user active status
 */
export const toggleUserStatus = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    // Prevent self-deactivation
    if (req.user?.userId === id) {
      throw new ApiError(400, 'Cannot change your own status');
    }

    const user = await User.findOne({ _id: id, isDeleted: false }).select('-password -refreshToken');

    if (!user) {
      throw new ApiError(404, 'User not found');
    }

    // Toggle status
    user.isActive = !user.isActive;
    await user.save();

    logger.info(`User status toggled: ${user.username} (${user.isActive ? 'active' : 'inactive'}) by ${req.user?.username}`);

    // If deactivating, immediately force the user off via WebSocket
    if (!user.isActive) {
      emitToUser(user.username, 'session_event', {
        type: 'account_deactivated',
        message: 'Your account has been deactivated by an administrator.',
      });
    }

    res.status(200).json({
      success: true,
      message: `User ${user.isActive ? 'activated' : 'deactivated'} successfully`,
      data: user,
    });
  } catch (error: any) {
    throw error;
  }
};

/**
 * Ban user (Super Admin only)
 */
export const banUser = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    // Prevent self-ban
    if (req.user?.userId === id) {
      throw new ApiError(400, 'Cannot ban your own account');
    }

    const user = await User.findOne({ _id: id, isDeleted: false }).select('-password -refreshToken');

    if (!user) {
      throw new ApiError(404, 'User not found');
    }

    if (user.isBanned) {
      throw new ApiError(400, 'User is already banned');
    }

    // Ban user
    user.isBanned = true;
    user.bannedAt = new Date();
    user.bannedBy = req.user?.username || 'system';
    user.bannedReason = reason || 'No reason provided';
    user.isActive = false; // Also deactivate when banned
    user.refreshToken = undefined; // Clear refresh token to force logout
    await user.save();

    logger.warn(`User banned: ${user.username} by ${req.user?.username}. Reason: ${reason}`);

    // Immediately kick the banned user out via WebSocket
    emitToUser(user.username, 'session_event', {
      type: 'account_banned',
      message: `Your account has been banned by an administrator. Reason: ${reason || 'No reason provided'}.`,
    });

    res.status(200).json({
      success: true,
      message: 'User banned successfully',
      data: user,
    });
  } catch (error: any) {
    throw error;
  }
};

/**
 * Unban user (Super Admin only)
 */
export const unbanUser = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const user = await User.findOne({ _id: id, isDeleted: false }).select('-password -refreshToken');

    if (!user) {
      throw new ApiError(404, 'User not found');
    }

    if (!user.isBanned) {
      throw new ApiError(400, 'User is not banned');
    }

    // Unban user
    user.isBanned = false;
    user.bannedAt = undefined;
    user.bannedBy = undefined;
    user.bannedReason = undefined;
    user.isActive = true; // Reactivate when unbanned
    await user.save();

    logger.info(`User unbanned: ${user.username} by ${req.user?.username}`);

    res.status(200).json({
      success: true,
      message: 'User unbanned successfully',
      data: user,
    });
  } catch (error: any) {
    throw error;
  }
};
