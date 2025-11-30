import { Response } from 'express';
import { User } from '../models';
import { ApiError } from '../middleware/errorHandler';
import { generateTokens, verifyRefreshToken, logger } from '../utils';
import { AuthRequest } from '../middleware/auth';
import { LoginRequest, RegisterRequest, AuthResponse, JWTPayload } from '../types';

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
 * Login user
 */
export const login = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { username, password } = req.body as LoginRequest;

    // Check if this might be a driver login (username = truck number)
    // If username and password are the same, check if it's a valid truck
    if (username === password) {
      // Try to find truck in delivery orders (company fleet)
      const { DeliveryOrder } = require('../models');
      const trucks = await DeliveryOrder.aggregate([
        { $match: { isDeleted: false } },
        {
          $group: {
            _id: { $toUpper: '$truckNo' },
            truckNo: { $first: '$truckNo' },
          },
        },
      ]);

      const truckExists = trucks.some(
        (t: any) => t._id === username.toUpperCase()
      );

      if (truckExists) {
        // Create a driver user object for this truck
        const driverUser = {
          _id: `driver_${username.toUpperCase()}`,
          username: username.toUpperCase(),
          email: `${username.toLowerCase()}@driver.local`,
          firstName: 'Driver',
          lastName: username.toUpperCase(),
          role: 'driver',
          department: 'Transport',
          truckNo: username.toUpperCase(),
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        // Generate tokens
        const payload: JWTPayload = {
          userId: driverUser._id.toString(),
          username: driverUser.username,
          role: driverUser.role as any,
        };

        const { accessToken, refreshToken } = generateTokens(payload);

        logger.info(`Driver logged in: ${username}`);

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
    }

    // Regular user login
    // Find user and include password
    const user = await User.findOne({ username, isDeleted: false }).select('+password');

    if (!user) {
      throw new ApiError(401, 'Invalid username or password');
    }

    // Check if user is active
    if (!user.isActive) {
      throw new ApiError(403, 'Your account has been deactivated. Please contact administrator.');
    }

    // Verify password
    const isPasswordValid = await user.comparePassword(password);

    if (!isPasswordValid) {
      throw new ApiError(401, 'Invalid username or password');
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

    res.status(200).json({
      success: true,
      message: 'Password changed successfully',
    });
  } catch (error: any) {
    throw error;
  }
};
