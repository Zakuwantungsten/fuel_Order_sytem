import { Response } from 'express';
import { User } from '../models';
import { ApiError } from '../middleware/errorHandler';
import { AuthRequest } from '../middleware/auth';
import { getPaginationParams, createPaginatedResponse, calculateSkip, logger, formatTruckNumber } from '../utils';
import crypto from 'crypto';

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
      filter.department = { $regex: department, $options: 'i' };
    }

    if (station) {
      filter.station = { $regex: station, $options: 'i' };
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

    const response = createPaginatedResponse(users, page, limit, total);

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

    const user = await User.findOne({ _id: id, isDeleted: false }).select('-password -refreshToken');

    if (!user) {
      throw new ApiError(404, 'User not found');
    }

    res.status(200).json({
      success: true,
      message: 'User retrieved successfully',
      data: user,
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
    const { username, email, password, firstName, lastName, role, department, station, truckNo } = req.body;

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

    // Create new user
    const user = await User.create({
      username,
      email,
      password,
      firstName,
      lastName,
      role: role || 'viewer',
      department,
      station,
      truckNo: formattedTruckNo,
      isActive: true,
      isDeleted: false,
    });

    // Remove sensitive data
    const userResponse = user.toJSON();

    logger.info(`New user created: ${username} by ${req.user?.username}`);

    res.status(201).json({
      success: true,
      message: 'User created successfully',
      data: userResponse,
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

    res.status(200).json({
      success: true,
      message: 'User updated successfully',
      data: user,
    });
  } catch (error: any) {
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

    // Update password
    user.password = temporaryPassword;
    await user.save();

    logger.info(`Password reset for user: ${user.username} by ${req.user?.username}`);

    res.status(200).json({
      success: true,
      message: 'Password reset successfully',
      data: { temporaryPassword },
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

    res.status(200).json({
      success: true,
      message: `User ${user.isActive ? 'activated' : 'deactivated'} successfully`,
      data: user,
    });
  } catch (error: any) {
    throw error;
  }
};
