import { User } from '../models';
import { logger } from './index';

/**
 * User Migration Utilities
 * Handles data consistency fixes for the MFA/password management feature rollout
 */

interface MigrationResult {
  success: boolean;
  affectedUsers: number;
  details: string[];
  errors: string[];
}

/**
 * Clear stale mustChangePassword flags for old users
 * This fixes the bug where users created before MFA implementation
 * get stuck in the password change screen
 *
 * @param daysOldThreshold - Only clear flags for users older than this many days (default: 30)
 * @returns Migration result with count of affected users
 */
export async function clearStaleMustChangePasswordFlags(
  daysOldThreshold: number = 30
): Promise<MigrationResult> {
  const result: MigrationResult = {
    success: false,
    affectedUsers: 0,
    details: [],
    errors: [],
  };

  try {
    // Find all users with stale mustChangePassword flags
    // Criteria: mustChangePassword = true, but no passwordResetAt timestamp
    // AND account created before the threshold
    const cutoffDate = new Date(Date.now() - daysOldThreshold * 24 * 60 * 60 * 1000);

    const staleUsers = await User.find({
      mustChangePassword: true,
      passwordResetAt: null,
      createdAt: { $lt: cutoffDate },
    }).select('username email createdAt mustChangePassword');

    if (staleUsers.length === 0) {
      result.details.push(
        `No stale users found (threshold: ${daysOldThreshold} days old)`
      );
      result.success = true;
      return result;
    }

    // Clear the flags
    const updateResult = await User.updateMany(
      {
        mustChangePassword: true,
        passwordResetAt: null,
        createdAt: { $lt: cutoffDate },
      },
      {
        $set: { mustChangePassword: false, passwordResetAt: null },
      }
    );

    result.affectedUsers = updateResult.modifiedCount;

    // Log details
    staleUsers.forEach((user) => {
      const daysOld = (
        (Date.now() - new Date(user.createdAt).getTime()) /
        (1000 * 60 * 60 * 24)
      ).toFixed(0);
      result.details.push(
        `Cleared flag for ${user.username} (${user.email}) - account ${daysOld} days old`
      );
    });

    result.success = true;
    logger.info(
      `[Migration] Cleared stale mustChangePassword flags for ${result.affectedUsers} users`
    );

    return result;
  } catch (error: any) {
    result.success = false;
    result.errors.push(`Migration failed: ${error.message}`);
    logger.error('[Migration] clearStaleMustChangePasswordFlags failed:', error);
    return result;
  }
}

/**
 * Diagnostic: Find all users affected by the stale flag bug
 * Returns details about users who are currently blocked
 *
 * @returns Array of affected users with their account details
 */
export async function findAffectedUsers(): Promise<
  Array<{
    id: string;
    username: string;
    email: string;
    createdAt: Date;
    daysOld: number;
    mustChangePassword: boolean;
    passwordResetAt: Date | null;
  }>
> {
  try {
    const affectedUsers = await User.find({
      mustChangePassword: true,
      passwordResetAt: null,
    }).select(
      'username email createdAt mustChangePassword passwordResetAt isActive'
    );

    return affectedUsers.map((user) => ({
      id: user._id.toString(),
      username: user.username,
      email: user.email,
      createdAt: user.createdAt,
      daysOld: Math.floor(
        (Date.now() - new Date(user.createdAt).getTime()) / (1000 * 60 * 60 * 24)
      ),
      mustChangePassword: user.mustChangePassword || false,
      passwordResetAt: user.passwordResetAt || null,
    }));
  } catch (error: any) {
    logger.error('[Migration] findAffectedUsers failed:', error);
    return [];
  }
}

/**
 * Get migration statistics
 * Useful for monitoring the health of the user database
 *
 * @returns Statistics about password change flags
 */
export async function getMigrationStats(): Promise<{
  totalUsers: number;
  usersWithMustChangePassword: number;
  usersWithStaleFlags: number;
  usersWithProperFlags: number;
}> {
  try {
    const totalUsers = await User.countDocuments({ isDeleted: false });

    const countWithMustChangePassword = await User.countDocuments({
      mustChangePassword: true,
      isDeleted: false,
    });

    const staleFlags = await User.countDocuments({
      mustChangePassword: true,
      passwordResetAt: null,
      isDeleted: false,
    });

    const properFlags = countWithMustChangePassword - staleFlags;

    return {
      totalUsers,
      usersWithMustChangePassword: countWithMustChangePassword,
      usersWithStaleFlags: staleFlags,
      usersWithProperFlags: properFlags,
    };
  } catch (error: any) {
    logger.error('[Migration] getMigrationStats failed:', error);
    return {
      totalUsers: 0,
      usersWithMustChangePassword: 0,
      usersWithStaleFlags: 0,
      usersWithProperFlags: 0,
    };
  }
}

/**
 * Force-clear a specific user's stale flag
 * Use with caution - only for specific user override
 *
 * @param userId - User ID to clear flag for
 * @returns Success/failure result
 */
export async function clearUserMustChangePassword(userId: string): Promise<{
  success: boolean;
  message: string;
}> {
  try {
    const user = await User.findById(userId);
    if (!user) {
      return { success: false, message: 'User not found' };
    }

    user.mustChangePassword = false;
    user.passwordResetAt = undefined;
    await user.save();

    logger.info(`[Migration] Manually cleared mustChangePassword flag for user: ${user.username}`);
    return {
      success: true,
      message: `Cleared flag for ${user.username} (${user.email})`,
    };
  } catch (error: any) {
    logger.error('[Migration] clearUserMustChangePassword failed:', error);
    return { success: false, message: `Error: ${error.message}` };
  }
}
