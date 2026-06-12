import { Response } from 'express';
import { User } from '../models';
import { AuditLog } from '../models';
import UserMFA from '../models/UserMFA';
import { MFA } from '../models/MFA';
import { SystemConfig } from '../models';
import { ApiError } from '../middleware/errorHandler';
import { AuthRequest, invalidateAuthUserCache } from '../middleware/auth';
import { getPaginationParams, createPaginatedResponse, calculateSkip, logger, formatTruckNumber, sanitizeRegexInput } from '../utils';
import { AuditService } from '../utils/auditService';
import { emailService } from '../services/emailService';
import crypto from 'crypto';
import { emitToUser, emitDataChange } from '../services/websocket';

/**
 * Get all users with server-side pagination, sorting, and full-text search
 */
export const getAllUsers = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { page, limit, sort, order } = getPaginationParams(req.query);
    const { role, department, station, isActive, isBanned, q } = req.query;

    // Build filter
    const filter: any = { isDeleted: false };

    if (role) {
      filter.role = role;
    }

    if (isActive !== undefined) {
      filter.isActive = isActive === 'true';
    }

    if (isBanned !== undefined) {
      filter.isBanned = isBanned === 'true';
    }

    // Global text search across all identity fields
    if (q && typeof q === 'string' && q.trim()) {
      const escaped = sanitizeRegexInput(q.trim());
      if (escaped) {
        filter.$or = [
          { username:   { $regex: escaped, $options: 'i' } },
          { email:      { $regex: escaped, $options: 'i' } },
          { firstName:  { $regex: escaped, $options: 'i' } },
          { lastName:   { $regex: escaped, $options: 'i' } },
          { department: { $regex: escaped, $options: 'i' } },
          { station:    { $regex: escaped, $options: 'i' } },
          { truckNo:    { $regex: escaped, $options: 'i' } },
        ];
      }
    } else {
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
    }

    const skip = calculateSkip(page, limit);
    const sortOrder = order === 'asc' ? 1 : -1;

    const allowedSorts = ['username', 'firstName', 'lastName', 'email', 'role', 'createdAt', 'lastLogin', 'isActive'];
    const safeSort = allowedSorts.includes(sort) ? sort : 'createdAt';

    const [users, total] = await Promise.all([
      User.find(filter)
        .select('-password -refreshToken -passwordHistory -resetPasswordToken')
        .sort({ [safeSort]: sortOrder })
        .skip(skip)
        .limit(limit)
        .lean(),
      User.countDocuments(filter),
    ]);

    // Batch-fetch MFA records so each row in the table can show real MFA status
    // without needing to open the detail drawer.
    const userIds = users.map((u: any) => u._id);
    const mfaRecords = await MFA.find({ userId: { $in: userIds } })
      .select('userId isEnabled totpEnabled totpVerified smsEnabled emailEnabled')
      .lean();
    const mfaByUser: Record<string, typeof mfaRecords[0]> = {};
    for (const r of mfaRecords) {
      mfaByUser[r.userId.toString()] = r;
    }

    const transformedUsers = users.map((user: any) => {
      const mfa = mfaByUser[user._id.toString()];
      return {
        ...user,
        id: user._id.toString(),
        // Lightweight MFA summary for table display. Fields are intentionally minimal
        // to avoid leaking sensitive config — full details live in GET /users/:id/detail.
        mfaInfo: {
          enabled:      mfa?.isEnabled      ?? false,
          totpEnrolled: (mfa?.totpEnabled && mfa?.totpVerified) ?? false,
          emailEnrolled: mfa?.emailEnabled   ?? false,
          smsEnrolled:   mfa?.smsEnabled     ?? false,
        },
      };
    });

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
    const {
      username, email, firstName, lastName, role,
      department, station, yard, truckNo,
      // provisioningMethod:
      //   'temp_password' (default) — generate random temp password, send via email
      //   'email_link'             — send a one-time activation link, no password needed
      //   'manual'                 — admin supplies the initial password on the spot
      provisioningMethod = 'temp_password',
      customPassword,
    } = req.body;

    // Prevent admins from creating users with equal or higher privilege roles
    if (req.user?.role === 'admin' && (role === 'super_admin' || role === 'admin')) {
      throw new ApiError(403, 'Admins cannot create users with super_admin or admin roles');
    }

    if (provisioningMethod === 'manual' && (!customPassword || typeof customPassword !== 'string' || customPassword.length < 4)) {
      throw new ApiError(400, 'A password of at least 4 characters is required for manual provisioning.');
    }

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

    // Check system-config defaults (shared across all provisioning methods)
    let sendCredentialsEmail = true;
    let credentialsExpiryHours = 24;
    try {
      const sysConfig = await SystemConfig.findOne({ configType: 'system_settings', isDeleted: false });
      const notifSettings = sysConfig?.systemSettings?.notifications as any;
      if (notifSettings?.sendCredentialsEmail === false) sendCredentialsEmail = false;
      if (typeof notifSettings?.credentialsExpiryHours === 'number') {
        credentialsExpiryHours = notifSettings.credentialsExpiryHours;
      }
    } catch {
      // use defaults
    }

    // Determine the initial password and any activation token
    let initialPassword: string;
    let rawActivationToken: string | undefined;
    let hashedActivationToken: string | undefined;
    let activationExpiresAt: Date | undefined;

    if (provisioningMethod === 'email_link') {
      // The initial password is a random placeholder — never exposed, never used.
      // The user authenticates exclusively via the one-time activation link.
      initialPassword = crypto.randomBytes(16).toString('hex');
      rawActivationToken = crypto.randomBytes(32).toString('hex');
      hashedActivationToken = crypto.createHash('sha256').update(rawActivationToken).digest('hex');
      // Activation links expire after the same window as temp passwords (or 48h default)
      const expiryHours = credentialsExpiryHours > 0 ? credentialsExpiryHours : 48;
      activationExpiresAt = new Date(Date.now() + expiryHours * 60 * 60 * 1000);
    } else if (provisioningMethod === 'manual') {
      initialPassword = customPassword as string;
    } else {
      // Default: temp_password
      initialPassword = crypto.randomBytes(8).toString('hex');
    }

    const user = await User.create({
      username,
      email,
      password: initialPassword,
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
      pendingActivation: true,
      createdBy: req.user?.username,
      passwordResetAt: new Date(),
      ...(provisioningMethod === 'email_link'
        ? { activationToken: hashedActivationToken, activationTokenExpires: activationExpiresAt }
        : credentialsExpiryHours > 0
          ? { tempPasswordExpiresAt: new Date(Date.now() + credentialsExpiryHours * 60 * 60 * 1000) }
          : {}),
    });

    // Send the appropriate email based on provisioning method
    let emailSent = false;
    const fullName = `${firstName} ${lastName}`;

    if (provisioningMethod === 'email_link') {
      // Always send the activation link regardless of sendCredentialsEmail toggle —
      // without the link the user cannot activate their account at all.
      try {
        await emailService.sendActivationLinkEmail(
          email,
          fullName,
          username,
          rawActivationToken!,
          activationExpiresAt!
        );
        emailSent = true;
        logger.info(`Activation link email sent to ${email}`);
      } catch (emailError: any) {
        logger.error(`Failed to send activation link email to ${email}:`, emailError);
      }
    } else if (provisioningMethod === 'temp_password' && sendCredentialsEmail) {
      try {
        await emailService.sendWelcomeEmail(
          email,
          fullName,
          username,
          initialPassword,
          credentialsExpiryHours
        );
        emailSent = true;
        logger.info(`Welcome email sent to ${email}`);
      } catch (emailError: any) {
        logger.error(`Failed to send welcome email to ${email}:`, emailError);
      }
    } else {
      logger.info(`No email sent for ${email} (provisioningMethod=${provisioningMethod})`);
    }

    const userResponse = user.toJSON();

    logger.info(`New user created: ${username} by ${req.user?.username} (method: ${provisioningMethod})`);

    await AuditService.logCreate(
      req.user?.userId || 'system',
      req.user?.username || 'system',
      'User',
      user._id.toString(),
      { username, role, department, station, yard, provisioningMethod },
      req.ip
    );

    const message =
      provisioningMethod === 'email_link'
        ? emailSent
          ? 'User created successfully. Activation link sent to their email.'
          : 'User created successfully. Activation link email failed — resend it from the user detail page.'
        : provisioningMethod === 'manual'
          ? 'User created successfully. Share the password with the user manually.'
          : emailSent
            ? 'User created successfully. Welcome email sent with login credentials.'
            : sendCredentialsEmail
              ? 'User created successfully. Welcome email could not be sent — check email configuration.'
              : 'User created successfully. Share the credentials below with the user manually.';

    res.status(201).json({
      success: true,
      message,
      data: userResponse,
      emailSent,
      provisioningMethod,
      // Expose the initial password when it won't arrive via email
      ...((provisioningMethod === 'temp_password' && !emailSent) || provisioningMethod === 'manual'
        ? { temporaryPassword: initialPassword }
        : {}),
    });
    emitDataChange('users', 'create');
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

    // Prevent admins from modifying super_admin or admin accounts, or elevating roles to those levels
    if (req.user?.role === 'admin') {
      if (existingUser.role === 'super_admin' || existingUser.role === 'admin') {
        throw new ApiError(403, 'Admins cannot modify super_admin or admin accounts');
      }
      if (updateData.role && (updateData.role === 'super_admin' || updateData.role === 'admin')) {
        throw new ApiError(403, 'Admins cannot assign super_admin or admin roles');
      }
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
      {
        ...updateData,
        lastModifiedBy: req.user?.username,
        lastModifiedAt: new Date(),
      },
      { new: true, runValidators: true }
    ).select('-password -refreshToken');

    if (!user) {
      throw new ApiError(404, 'User not found');
    }

    invalidateAuthUserCache(id);
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
    emitDataChange('users', 'update');
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

    invalidateAuthUserCache(id);
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
    emitDataChange('users', 'delete');
  } catch (error: any) {
    throw error;
  }
};

/**
 * Reset user password (Admin only)
 * Supports three provisioning methods:
 *   'temp_password' (default) — generate random temp password, send via email
 *   'email_link'              — send a one-time activation link
 *   'manual'                  — admin supplies a short password in req.body.customPassword
 */
export const resetUserPassword = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const {
      provisioningMethod = 'temp_password',
      customPassword,
    } = req.body;

    if (provisioningMethod === 'manual' && (!customPassword || typeof customPassword !== 'string' || customPassword.length < 4)) {
      throw new ApiError(400, 'A password of at least 4 characters is required for manual provisioning.');
    }

    const user = await User.findOne({ _id: id, isDeleted: false });
    if (!user) {
      throw new ApiError(404, 'User not found');
    }

    // Read configured expiry window
    let credentialsExpiryHours = 24;
    try {
      const sc = await SystemConfig.findOne({ configType: 'system_settings', isDeleted: false });
      const notif = sc?.systemSettings?.notifications as any;
      if (typeof notif?.credentialsExpiryHours === 'number') {
        credentialsExpiryHours = notif.credentialsExpiryHours;
      }
    } catch { /* use default */ }

    // Determine initial credentials
    let initialPassword: string;
    let rawActivationToken: string | undefined;
    let hashedActivationToken: string | undefined;
    let activationExpiresAt: Date | undefined;

    if (provisioningMethod === 'email_link') {
      initialPassword = crypto.randomBytes(16).toString('hex'); // placeholder, never used
      rawActivationToken = crypto.randomBytes(32).toString('hex');
      hashedActivationToken = crypto.createHash('sha256').update(rawActivationToken).digest('hex');
      const expiryHours = credentialsExpiryHours > 0 ? credentialsExpiryHours : 48;
      activationExpiresAt = new Date(Date.now() + expiryHours * 60 * 60 * 1000);
    } else if (provisioningMethod === 'manual') {
      initialPassword = customPassword as string;
    } else {
      initialPassword = crypto.randomBytes(8).toString('hex');
    }

    // Apply the new credentials
    user.password = initialPassword;
    user.mustChangePassword = true;
    user.passwordResetAt = new Date();
    user.refreshToken = undefined;
    // Clear any old activation token
    user.activationToken = undefined;
    user.activationTokenExpires = undefined;

    if (provisioningMethod === 'email_link') {
      user.activationToken = hashedActivationToken;
      user.activationTokenExpires = activationExpiresAt;
      user.tempPasswordExpiresAt = undefined;
    } else if (credentialsExpiryHours > 0) {
      user.tempPasswordExpiresAt = new Date(Date.now() + credentialsExpiryHours * 60 * 60 * 1000);
    } else {
      user.tempPasswordExpiresAt = undefined;
    }

    await user.save();

    invalidateAuthUserCache(user._id);
    logger.info(`Password reset for user: ${user.username} by ${req.user?.username} (method: ${provisioningMethod})`);

    // Kick the user out so they must re-authenticate with the new credentials
    emitToUser(user.username, 'session_event', {
      type: 'password_reset',
      message: 'Your password has been reset by an administrator. Please log in with your new credentials.',
    });

    // Send appropriate email
    let emailSent = false;
    const fullName = `${user.firstName} ${user.lastName}`;

    if (provisioningMethod === 'email_link') {
      try {
        await emailService.sendActivationLinkEmail(
          user.email,
          fullName,
          user.username,
          rawActivationToken!,
          activationExpiresAt!
        );
        emailSent = true;
        logger.info(`Activation link email sent to ${user.email} (password reset)`);
      } catch (emailError: any) {
        logger.error(`Failed to send activation link email to ${user.email}:`, emailError);
      }
    } else if (provisioningMethod === 'temp_password') {
      try {
        await emailService.sendPasswordResetByAdminEmail(
          user.email,
          fullName,
          user.username,
          initialPassword,
          credentialsExpiryHours
        );
        emailSent = true;
        logger.info(`Password reset email sent to ${user.email}`);
      } catch (emailError: any) {
        logger.error(`Failed to send password reset email to ${user.email}:`, emailError);
      }
    } else {
      logger.info(`Manual provisioning — no email sent for ${user.email}`);
    }

    await AuditService.log({
      userId: req.user?.userId,
      username: req.user?.username || 'system',
      action: 'PASSWORD_RESET',
      resourceType: 'User',
      resourceId: user._id.toString(),
      details: `Password reset for user: ${user.username} (method: ${provisioningMethod})${emailSent ? ' (email sent)' : ''}`,
      ipAddress: req.ip,
      severity: 'medium',
    });

    const message =
      provisioningMethod === 'email_link'
        ? emailSent
          ? 'Password reset. Activation link sent to their email.'
          : 'Password reset. Activation link email failed — resend from the user detail page.'
        : provisioningMethod === 'manual'
          ? 'Password reset. Share the new password with the user manually.'
          : emailSent
            ? 'Password reset successfully. New password sent to user\'s email.'
            : 'Password reset successfully, but email notification failed.';

    res.status(200).json({
      success: true,
      message,
      data: {
        emailSent,
        provisioningMethod,
        // Expose the password when the admin needs to share it manually
        ...((provisioningMethod === 'temp_password' && !emailSent) || provisioningMethod === 'manual'
          ? { temporaryPassword: initialPassword }
          : {}),
      },
    });
    emitDataChange('users', 'update');
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

    invalidateAuthUserCache(id);
    logger.info(`User status toggled: ${user.username} (${user.isActive ? 'active' : 'inactive'}) by ${req.user?.username}`);

    // If deactivating, immediately force the user off via WebSocket
    if (!user.isActive) {
      emitToUser(user.username, 'session_event', {
        type: 'account_deactivated',
        message: 'Your account has been deactivated by an administrator.',
      });
    }

    await AuditService.log({
      userId: req.user?.userId,
      username: req.user?.username || 'system',
      action: user.isActive ? 'ACCOUNT_ACTIVATED' : 'ACCOUNT_DEACTIVATED',
      resourceType: 'User',
      resourceId: user._id.toString(),
      details: `User ${user.username} (${user.role}) ${user.isActive ? 'activated' : 'deactivated'} by ${req.user?.username}`,
      ipAddress: req.ip,
      severity: user.isActive ? 'medium' : 'high',
    });

    res.status(200).json({
      success: true,
      message: `User ${user.isActive ? 'activated' : 'deactivated'} successfully`,
      data: user,
    });
    emitDataChange('users', 'update');
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

    invalidateAuthUserCache(id);
    logger.warn(`User banned: ${user.username} by ${req.user?.username}. Reason: ${reason}`);

    // Immediately kick the banned user out via WebSocket
    emitToUser(user.username, 'session_event', {
      type: 'account_banned',
      message: `Your account has been banned by an administrator. Reason: ${reason || 'No reason provided'}.`,
    });

    await AuditService.log({
      userId: req.user?.userId,
      username: req.user?.username || 'system',
      action: 'ACCOUNT_BANNED',
      resourceType: 'User',
      resourceId: user._id.toString(),
      details: `User ${user.username} (${user.role}) banned by ${req.user?.username}. Reason: ${reason || 'No reason provided'}`,
      ipAddress: req.ip,
      severity: 'critical',
    });

    res.status(200).json({
      success: true,
      message: 'User banned successfully',
      data: user,
    });
    emitDataChange('users', 'update');
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

    invalidateAuthUserCache(id);
    logger.info(`User unbanned: ${user.username} by ${req.user?.username}`);

    await AuditService.log({
      userId: req.user?.userId,
      username: req.user?.username || 'system',
      action: 'ACCOUNT_UNBANNED',
      resourceType: 'User',
      resourceId: user._id.toString(),
      details: `User ${user.username} (${user.role}) unbanned by ${req.user?.username}`,
      ipAddress: req.ip,
      severity: 'medium',
    });

    res.status(200).json({
      success: true,
      message: 'User unbanned successfully',
      data: user,
    });
    emitDataChange('users', 'update');
  } catch (error: any) {
    throw error;
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// USER DETAIL — full profile with MFA status + recent sign-in history
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /users/:id/detail
 * Returns extended user profile: base fields + MFA status + last 20 sign-in events
 */
export const getUserDetail = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const user = await User.findOne({ _id: id, isDeleted: false })
      .select('-password -refreshToken -passwordHistory -resetPasswordToken -resetPasswordExpires')
      .lean();

    if (!user) {
      throw new ApiError(404, 'User not found');
    }

    // Fetch MFA status from both models (same merge logic as mfaManagementController)
    const [userMfaRecord, mfaRecord, sysConfig] = await Promise.all([
      UserMFA.findOne({ userId: id })
        .select('isEnabled totpEnabled smsEnabled emailEnabled isMandatory isExempt lastMFAVerification failedMFAAttempts mfaLockedUntil')
        .lean(),
      MFA.findOne({ userId: id })
        // totpVerified is required here: totpEnabled can be true mid-setup before the user
        // confirmed their first code. We only want to show "Enrolled" when both are true.
        .select('isEnabled totpEnabled totpVerified smsEnabled emailEnabled isMandatory isExempt lastVerifiedAt failedAttempts lockedUntil')
        .lean(),
      SystemConfig.findOne({ configType: 'system_settings', isDeleted: false })
        .select('securitySettings.mfa.globalEnabled securitySettings.mfa.requiredRoles')
        .lean(),
    ]);

    const globalEnabled = (sysConfig as any)?.securitySettings?.mfa?.globalEnabled ?? false;
    const requiredRoles: string[] = (sysConfig as any)?.securitySettings?.mfa?.requiredRoles ?? [];

    const isConfigured = mfaRecord?.isEnabled || userMfaRecord?.isEnabled || false;
    // "active" = user has MFA set up AND global enforcement is on
    const isActive = isConfigured && globalEnabled;

    const mfaStatus = {
      enabled:        isConfigured,
      // "active" distinguishes "user has MFA configured in DB" from "MFA is currently
      // being enforced by policy". Useful when global toggle is off but DB data persists.
      active:         isActive,
      // totpEnrolled requires BOTH totpEnabled AND totpVerified. A user who scanned the
      // QR code but never confirmed the 6-digit code will have totpEnabled: true but
      // totpVerified: false — TOTP is not actually usable yet.
      totpEnrolled:   !!(mfaRecord?.totpEnabled && (mfaRecord as any)?.totpVerified),
      // Email and SMS do not have a verification step; their enabled flag is authoritative.
      emailEnrolled:  mfaRecord?.emailEnabled || userMfaRecord?.emailEnabled || false,
      smsEnrolled:    mfaRecord?.smsEnabled   || userMfaRecord?.smsEnabled   || false,
      isMandatory:    (mfaRecord as any)?.isMandatory || userMfaRecord?.isMandatory || false,
      isExempt:       (mfaRecord as any)?.isExempt    || userMfaRecord?.isExempt    || false,
      // Whether system policy (role-based) requires MFA for this user's role
      policyRequired: globalEnabled && requiredRoles.includes((user as any).role),
      lastVerified:   mfaRecord?.lastVerifiedAt ?? userMfaRecord?.lastMFAVerification ?? null,
      failedAttempts: mfaRecord?.failedAttempts ?? userMfaRecord?.failedMFAAttempts ?? 0,
      lockedUntil:    mfaRecord?.lockedUntil ?? userMfaRecord?.mfaLockedUntil ?? null,
    };

    // Fetch up to 50 audit events for this user:
    // – events the user performed themselves (matched by username)
    // – events an admin performed on this user (matched by resourceId + resourceType)
    // TOKEN_REFRESH is excluded as it is too noisy.
    const loginHistory = await (AuditLog as any).find({
      $or: [
        {
          username: (user as any).username,
          action: { $nin: ['TOKEN_REFRESH'] },
        },
        {
          resourceId: id,
          resourceType: 'user',
          action: { $nin: ['TOKEN_REFRESH'] },
        },
      ],
    })
      .select('timestamp action outcome ipAddress userAgent details resourceType resourceId username')
      .sort({ timestamp: -1 })
      .limit(50)
      .lean();

    const transformedUser = {
      ...user,
      id: (user as any)._id.toString(),
    };

    res.status(200).json({
      success: true,
      message: 'User detail retrieved successfully',
      data: {
        user: transformedUser,
        mfaStatus,
        loginHistory,
      },
    });
  } catch (error: any) {
    throw error;
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN NOTES
// ─────────────────────────────────────────────────────────────────────────────

/**
 * PATCH /users/:id/notes
 * Update admin-only notes for a user
 */
export const updateUserNotes = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { notes } = req.body;

    if (typeof notes !== 'string') {
      throw new ApiError(400, 'notes must be a string');
    }

    const trimmed = notes.trim();
    if (trimmed.length > 2000) {
      throw new ApiError(400, 'Notes cannot exceed 2000 characters');
    }

    const user = await User.findOneAndUpdate(
      { _id: id, isDeleted: false },
      {
        notes: trimmed,
        lastModifiedBy: req.user?.username,
        lastModifiedAt: new Date(),
      },
      { new: true }
    ).select('_id username notes lastModifiedBy lastModifiedAt');

    if (!user) {
      throw new ApiError(404, 'User not found');
    }

    await AuditService.log({
      userId:       req.user?.userId,
      username:     req.user?.username || 'system',
      action:       'UPDATE',
      resourceType: 'User',
      resourceId:   user._id.toString(),
      details:      `Admin notes updated for user: ${user.username}`,
      ipAddress:    req.ip,
      severity:     'low',
    });

    res.status(200).json({
      success: true,
      message: 'Notes updated successfully',
      data: user,
    });
  } catch (error: any) {
    throw error;
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// BULK OPERATIONS (extended)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * POST /users/bulk/delete
 * Soft-delete multiple users at once
 */
export const bulkDeleteUsers = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { userIds } = req.body;

    if (!Array.isArray(userIds) || userIds.length === 0) {
      throw new ApiError(400, 'userIds must be a non-empty array');
    }

    if (userIds.length > 200) {
      throw new ApiError(400, 'Cannot delete more than 200 users at once');
    }

    // Prevent self-deletion
    if (userIds.includes(req.user?.userId)) {
      throw new ApiError(400, 'Cannot delete your own account');
    }

    // Protect super_admin accounts
    const protectedUsers = await User.find({
      _id: { $in: userIds },
      role: 'super_admin',
      isDeleted: false,
    }).select('_id username').lean();

    if (protectedUsers.length > 0) {
      const names = protectedUsers.map((u: any) => u.username).join(', ');
      throw new ApiError(403, `Cannot delete super_admin accounts: ${names}`);
    }

    const usersToDelete = await User.find({
      _id: { $in: userIds },
      isDeleted: false,
    }).select('_id username').lean();

    const result = await User.updateMany(
      { _id: { $in: userIds }, isDeleted: false, role: { $ne: 'super_admin' } },
      { isDeleted: true, deletedAt: new Date() }
    );

    for (const deletedId of userIds) invalidateAuthUserCache(deletedId);

    // Notify all affected users via WebSocket
    for (const u of usersToDelete) {
      emitToUser((u as any).username, 'session_event', {
        type: 'account_deleted',
        message: 'Your account has been removed by an administrator.',
      });
    }

    await AuditService.log({
      userId:       req.user?.userId,
      username:     req.user?.username || 'system',
      action:       'BULK_OPERATION',
      resourceType: 'User',
      details:      `Bulk delete: ${result.modifiedCount} users deleted by ${req.user?.username}`,
      ipAddress:    req.ip,
      severity:     'high',
    });

    logger.warn(`Bulk delete: ${result.modifiedCount} users deleted by ${req.user?.username}`);

    res.status(200).json({
      success: true,
      message: `${result.modifiedCount} user(s) deleted successfully`,
      data: { matched: result.matchedCount, deleted: result.modifiedCount },
    });
    emitDataChange('users', 'delete');
  } catch (error: any) {
    throw error;
  }
};

/**
 * POST /users/bulk/reset-passwords
 * Force-reset passwords for multiple users
 */
export const bulkResetPasswords = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { userIds } = req.body;

    if (!Array.isArray(userIds) || userIds.length === 0) {
      throw new ApiError(400, 'userIds must be a non-empty array');
    }

    if (userIds.length > 100) {
      throw new ApiError(400, 'Cannot reset more than 100 passwords at once');
    }

    const users = await User.find({
      _id: { $in: userIds },
      isDeleted: false,
    }).select('_id username email firstName lastName');

    if (users.length === 0) {
      throw new ApiError(404, 'No users found');
    }

    let successCount = 0;
    let failCount = 0;

    for (const user of users) {
      try {
        const temporaryPassword = crypto.randomBytes(8).toString('hex');
        user.password = temporaryPassword;
        user.mustChangePassword = true;
        user.passwordResetAt = new Date();
        (user as any).refreshToken = undefined;
        await user.save();
        invalidateAuthUserCache(user._id);

        emitToUser(user.username, 'session_event', {
          type: 'password_reset',
          message: 'Your password has been reset by an administrator. Please log in with your new credentials.',
        });

        try {
          await emailService.sendPasswordResetByAdminEmail(
            user.email,
            `${user.firstName} ${user.lastName}`,
            user.username,
            temporaryPassword
          );
        } catch {
          // Email failure should not abort the loop
        }

        successCount++;
      } catch {
        failCount++;
      }
    }

    await AuditService.log({
      userId:       req.user?.userId,
      username:     req.user?.username || 'system',
      action:       'BULK_OPERATION',
      resourceType: 'User',
      details:      `Bulk password reset: ${successCount} succeeded, ${failCount} failed`,
      ipAddress:    req.ip,
      severity:     'high',
    });

    res.status(200).json({
      success: true,
      message: `Password reset for ${successCount} user(s) successfully${failCount > 0 ? `. ${failCount} failed.` : '.'}`,
      data: { success: successCount, failed: failCount },
    });
    emitDataChange('users', 'update');
  } catch (error: any) {
    throw error;
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// CSV EXPORT
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /users/export
 * Export all matching users as a CSV file
 */
export const exportUsers = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { role, isActive, q } = req.query;

    const filter: any = { isDeleted: false };

    if (role) filter.role = role;
    if (isActive !== undefined) filter.isActive = isActive === 'true';

    if (q && typeof q === 'string' && q.trim()) {
      const escaped = sanitizeRegexInput(q.trim());
      if (escaped) {
        filter.$or = [
          { username:   { $regex: escaped, $options: 'i' } },
          { email:      { $regex: escaped, $options: 'i' } },
          { firstName:  { $regex: escaped, $options: 'i' } },
          { lastName:   { $regex: escaped, $options: 'i' } },
        ];
      }
    }

    const users = await User.find(filter)
      .select('username email firstName lastName role department station yard truckNo isActive isBanned pendingActivation createdBy createdAt lastLogin accountExpiresAt')
      .sort({ createdAt: -1 })
      .lean();

    const COLUMNS = [
      'username', 'email', 'firstName', 'lastName', 'role',
      'department', 'station', 'yard', 'truckNo',
      'isActive', 'isBanned', 'pendingActivation',
      'createdBy', 'createdAt', 'lastLogin', 'accountExpiresAt',
    ];

    const escape = (val: any): string => {
      if (val === null || val === undefined) return '';
      const str = val instanceof Date ? val.toISOString() : String(val);
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    const lines: string[] = [COLUMNS.join(',')];
    for (const user of users) {
      lines.push(COLUMNS.map(col => escape((user as any)[col])).join(','));
    }

    const csv = lines.join('\r\n');

    await AuditService.log({
      userId:       req.user?.userId,
      username:     req.user?.username || 'system',
      action:       'EXPORT',
      resourceType: 'User',
      details:      `Exported ${users.length} users as CSV`,
      ipAddress:    req.ip,
      severity:     'medium',
    });

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="users_${Date.now()}.csv"`);
    res.status(200).send(csv);
  } catch (error: any) {
    throw error;
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// CSV IMPORT
// ─────────────────────────────────────────────────────────────────────────────

const VALID_ROLES = [
  'super_admin', 'admin', 'manager', 'super_manager', 'supervisor', 'clerk',
  'driver', 'viewer', 'fuel_order_maker', 'boss', 'yard_personnel',
  'fuel_attendant', 'station_manager', 'payment_manager',
  'dar_yard', 'tanga_yard', 'mmsa_yard', 'import_officer', 'export_officer',
] as const;

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

/**
 * POST /users/import
 * Import users from a CSV file (text/plain or application/octet-stream body)
 * Required columns: username, email, firstName, lastName, role
 * Optional columns: department, station, yard, truckNo, accountExpiresAt
 */
export const importUsers = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    // Only super_admin can import
    if (req.user?.role !== 'super_admin') {
      throw new ApiError(403, 'Only super admins can import users');
    }

    const rawBody = req.body as string;
    if (!rawBody || typeof rawBody !== 'string') {
      throw new ApiError(400, 'Request body must be CSV text (Content-Type: text/plain)');
    }

    const lines = rawBody.split(/\r?\n/).filter(l => l.trim());
    if (lines.length < 2) {
      throw new ApiError(400, 'CSV must contain a header row and at least one data row');
    }

    if (lines.length > 201) {
      throw new ApiError(400, 'Cannot import more than 200 users at once');
    }

    const headers = parseCSVLine(lines[0]).map(h => h.toLowerCase());
    const required = ['username', 'email', 'firstname', 'lastname', 'role'];
    const missing = required.filter(col => !headers.includes(col));
    if (missing.length > 0) {
      throw new ApiError(400, `CSV is missing required columns: ${missing.join(', ')}`);
    }

    const idx = (name: string) => headers.indexOf(name);

    const results = { created: 0, skipped: 0, errors: [] as { row: number; reason: string }[] };

    for (let i = 1; i < lines.length; i++) {
      const row = parseCSVLine(lines[i]);
      const rowNum = i + 1;

      const username   = row[idx('username')]  || '';
      const email      = row[idx('email')]     || '';
      const firstName  = row[idx('firstname')] || '';
      const lastName   = row[idx('lastname')]  || '';
      const role       = (row[idx('role')] || 'viewer').toLowerCase().trim() as any;
      const department = idx('department') >= 0 ? row[idx('department')] || undefined : undefined;
      const station    = idx('station')    >= 0 ? row[idx('station')]    || undefined : undefined;
      const yard       = idx('yard')       >= 0 ? row[idx('yard')]       || undefined : undefined;
      const truckNo    = idx('truckno')    >= 0 ? row[idx('truckno')]    || undefined : undefined;
      const expiresRaw = idx('accountexpiresAt') >= 0 ? row[idx('accountexpiresAt')] : undefined;

      if (!username || !email || !firstName || !lastName) {
        results.errors.push({ row: rowNum, reason: 'Missing required field (username, email, firstName, lastName)' });
        results.skipped++;
        continue;
      }

      if (!/^\S+@\S+\.\S+$/.test(email)) {
        results.errors.push({ row: rowNum, reason: `Invalid email: ${email}` });
        results.skipped++;
        continue;
      }

      if (!VALID_ROLES.includes(role)) {
        results.errors.push({ row: rowNum, reason: `Invalid role: ${role}` });
        results.skipped++;
        continue;
      }

      // Super admin import cannot create other super_admins
      if (role === 'super_admin') {
        results.errors.push({ row: rowNum, reason: 'Cannot import super_admin accounts' });
        results.skipped++;
        continue;
      }

      const existing = await User.findOne({ $or: [{ username }, { email }], isDeleted: false }).lean();
      if (existing) {
        results.errors.push({ row: rowNum, reason: `Username or email already exists: ${username} / ${email}` });
        results.skipped++;
        continue;
      }

      const temporaryPassword = crypto.randomBytes(8).toString('hex');

      const createData: any = {
        username, email, password: temporaryPassword, firstName, lastName, role,
        isActive: true, isDeleted: false, mustChangePassword: true,
        passwordResetAt: new Date(), pendingActivation: true,
        createdBy: req.user?.username,
      };

      if (department) createData.department = department;
      if (station)    createData.station    = station;
      if (yard)       createData.yard       = yard;
      if (truckNo)    createData.truckNo    = formatTruckNumber(truckNo);

      if (expiresRaw) {
        const d = new Date(expiresRaw);
        if (!isNaN(d.getTime())) createData.accountExpiresAt = d;
      }

      try {
        await User.create(createData);

        try {
          await emailService.sendWelcomeEmail(email, `${firstName} ${lastName}`, username, temporaryPassword);
        } catch { /* email failure is non-blocking */ }

        results.created++;
      } catch {
        results.errors.push({ row: rowNum, reason: 'Database error creating user' });
        results.skipped++;
      }
    }

    await AuditService.log({
      userId:       req.user?.userId,
      username:     req.user?.username || 'system',
      action:       'IMPORT',
      resourceType: 'User',
      details:      `CSV import: ${results.created} created, ${results.skipped} skipped`,
      ipAddress:    req.ip,
      severity:     'high',
    });

    if (results.created > 0) {
      emitDataChange('users', 'create');
    }

    res.status(200).json({
      success: true,
      message: `Import complete: ${results.created} user(s) created, ${results.skipped} row(s) skipped.`,
      data: results,
    });
  } catch (error: any) {
    throw error;
  }
};
