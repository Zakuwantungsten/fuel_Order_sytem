import { Response } from 'express';
import { DriverCredential, DeliveryOrder } from '../models';
import { ApiError } from '../middleware/errorHandler';
import { AuthRequest } from '../middleware/auth';
import { getPaginationParams, createPaginatedResponse, calculateSkip, logger } from '../utils';
import { AuditService } from '../utils/auditService';
import { emitDataChange } from '../services/websocket';
import { tryDecryptData } from '../utils/cryptoUtils';

const generatePin = (): string => Math.floor(1000 + Math.random() * 9000).toString();

const decryptIfNeeded = (value?: string): string | undefined => {
  if (!value || typeof value !== 'string') return value;
  if (!value.startsWith('encrypted:')) return value;

  const encryptionKey = process.env.FIELD_ENCRYPTION_KEY;
  if (!encryptionKey) return undefined;

  const decrypted = tryDecryptData(value.substring(10), encryptionKey);
  return decrypted ?? undefined;
};

const normalizeCredentialForList = (credential: any) => {
  const decryptedDriverName = decryptIfNeeded(credential.driverName);
  const driverName = (decryptedDriverName ?? credential.driverName ?? '').toString().trim();
  const phoneNumber = decryptIfNeeded(credential.phoneNumber) ?? credential.phoneNumber;

  const normalized = {
    ...credential,
    driverName,
    phoneNumber,
  };

  // UI rule: if no real name is set, table should show truck number
  if (!normalized.driverName || normalized.driverName.startsWith('encrypted:{')) {
    normalized.driverName = normalized.truckNo;
  }

  return normalized;
};

/**
 * Get all driver credentials
 */
export const getAllDriverCredentials = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { page, limit, sort, order } = getPaginationParams(req.query);
    const { search, status } = req.query;

    // Build filter
    const filter: any = {};

    if (search) {
      filter.truckNo = { $regex: search, $options: 'i' };
    }

    if (status !== undefined) {
      filter.isActive = status === 'active';
    }

    // Get data with pagination
    const skip = calculateSkip(page, limit);
    const sortOrder = order === 'asc' ? 1 : -1;

    const [credentials, total] = await Promise.all([
      DriverCredential.find(filter)
        .select('-pin') // Don't return PIN in list
        .sort({ [sort]: sortOrder })
        .skip(skip)
        .limit(limit)
        .lean(),
      DriverCredential.countDocuments(filter),
    ]);

    const normalizedCredentials = credentials.map(normalizeCredentialForList);

    const response = createPaginatedResponse(normalizedCredentials, page, limit, total);

    res.status(200).json({
      success: true,
      message: 'Driver credentials retrieved successfully',
      data: response,
    });
  } catch (error: any) {
    throw error;
  }
};

/**
 * Create a single driver credential manually
 */
export const createDriverCredential = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { truckNo, driverName, phoneNumber } = req.body;

    if (!truckNo || typeof truckNo !== 'string' || !truckNo.trim()) {
      throw new ApiError(400, 'Truck number is required');
    }

    const normalizedTruckNo = truckNo.trim().toUpperCase();
    const normalizedDriverName = typeof driverName === 'string' ? driverName.trim() : '';
    const normalizedPhoneNumber = typeof phoneNumber === 'string' ? phoneNumber.trim() : '';

    const existing = await DriverCredential.findOne({ truckNo: normalizedTruckNo });
    if (existing) {
      throw new ApiError(409, `Driver credential already exists for truck ${normalizedTruckNo}`);
    }

    const pin = generatePin();
    const credential = await DriverCredential.create({
      truckNo: normalizedTruckNo,
      pin,
      driverName: normalizedDriverName || undefined,
      phoneNumber: normalizedPhoneNumber || undefined,
      isActive: true,
      createdBy: req.user?.username || 'system',
    });

    await AuditService.logCreate(
      req.user?.userId || 'system',
      req.user?.username || 'system',
      'DriverCredential',
      credential._id.toString(),
      { truckNo: normalizedTruckNo },
      req.ip
    );

    res.status(201).json({
      success: true,
      message: `Driver credential created for truck ${normalizedTruckNo}`,
      data: {
        id: credential._id,
        truckNo: normalizedTruckNo,
        driverName: normalizedDriverName || normalizedTruckNo,
        phoneNumber: normalizedPhoneNumber || undefined,
        pin,
        createdAt: credential.createdAt,
      },
    });

    emitDataChange('driver_credentials', 'create');
  } catch (error: any) {
    throw error;
  }
};

/**
 * Get single driver credential (with PIN for viewing)
 */
export const getDriverCredentialById = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const credential = await DriverCredential.findById(id).select('+pin');

    if (!credential) {
      throw new ApiError(404, 'Driver credential not found');
    }

    // Log PIN view for audit
    await AuditService.log({
      userId: req.user?.userId || 'system',
      username: req.user?.username || 'system',
      action: 'EXPORT',
      resourceType: 'DriverCredential',
      resourceId: credential._id.toString(),
      details: `Viewed PIN for truck ${credential.truckNo}`,
      ipAddress: req.ip,
      severity: 'medium',
    });

    logger.warn(`PIN viewed for truck ${credential.truckNo} by ${req.user?.username}`);

    // Don't send the actual hashed PIN, just confirmation
    const response = {
      ...credential.toJSON(),
      pin: undefined, // Remove hashed PIN from response
      hasPIN: true,
    };

    res.status(200).json({
      success: true,
      message: 'Driver credential retrieved successfully',
      data: response,
    });
  } catch (error: any) {
    throw error;
  }
};

/**
 * Scan delivery orders for new trucks and generate credentials
 */
export const scanAndGenerateCredentials = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    // Get all unique truck numbers from delivery orders
    const trucks = await DeliveryOrder.aggregate([
      { $match: { isDeleted: false } },
      {
        $group: {
          _id: { $toUpper: '$truckNo' },
          truckNo: { $first: '$truckNo' },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    const newCredentials = [];
    const existingTrucks = [];

    for (const truck of trucks) {
      const truckNo = truck._id;

      // Check if credential already exists
      const existing = await DriverCredential.findOne({ truckNo });
      
      if (existing) {
        existingTrucks.push(truckNo);
        continue;
      }

      // Generate a random 4-digit PIN
      const pin = generatePin();

      // Create driver credential
      const credential = await DriverCredential.create({
        truckNo: truckNo,
        pin: pin,
        driverName: undefined,
        isActive: true,
        createdBy: req.user?.username || 'system',
      });

      newCredentials.push({
        id: credential._id,
        truckNo: truckNo,
        pin: pin, // Return plaintext PIN only once
        createdAt: credential.createdAt,
      });

      // Log credential creation
      await AuditService.logCreate(
        req.user?.userId || 'system',
        req.user?.username || 'system',
        'DriverCredential',
        credential._id.toString(),
        { truckNo: truckNo },
        req.ip
      );

      logger.info(`Driver credential created for truck ${truckNo} by ${req.user?.username}`);
    }

    res.status(201).json({
      success: true,
      message: `Scan complete. Found ${trucks.length} trucks, created ${newCredentials.length} new credentials.`,
      data: {
        totalTrucks: trucks.length,
        newCredentials: newCredentials,
        existingCount: existingTrucks.length,
        newCount: newCredentials.length,
      },
    });
    emitDataChange('driver_credentials', 'create');
  } catch (error: any) {
    throw error;
  }
};

/**
 * Reset driver PIN (for when driver is replaced)
 */
export const resetDriverPIN = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const credential = await DriverCredential.findById(id);

    if (!credential) {
      throw new ApiError(404, 'Driver credential not found');
    }

    // Generate new PIN
    const newPIN = Math.floor(1000 + Math.random() * 9000).toString();

    // Update credential
    credential.pin = newPIN; // Will be hashed by pre-save hook
    credential.lastLogin = undefined; // Reset last login
    await credential.save();

    // Log PIN reset
    await AuditService.log({
      userId: req.user?.userId || 'system',
      username: req.user?.username || 'system',
      action: 'UPDATE',
      resourceType: 'DriverCredential',
      resourceId: credential._id.toString(),
      details: `PIN reset for truck ${credential.truckNo}`,
      ipAddress: req.ip,
      severity: 'high',
    });

    logger.warn(`PIN reset for truck ${credential.truckNo} by ${req.user?.username}`);

    res.status(200).json({
      success: true,
      message: 'Driver PIN reset successfully',
      data: {
        truckNo: credential.truckNo,
        newPIN: newPIN, // Return new PIN only once
        resetAt: new Date(),
        resetBy: req.user?.username,
      },
    });
    emitDataChange('driver_credentials', 'update');
  } catch (error: any) {
    throw error;
  }
};

/**
 * Deactivate driver credential
 */
export const deactivateDriverCredential = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    const credential = await DriverCredential.findById(id);

    if (!credential) {
      throw new ApiError(404, 'Driver credential not found');
    }

    credential.isActive = false;
    await credential.save();

    // Log deactivation
    await AuditService.logDelete(
      req.user?.userId || 'system',
      req.user?.username || 'system',
      'DriverCredential',
      credential._id.toString(),
      { truckNo: credential.truckNo, isActive: true },
      req.ip
    );

    logger.info(`Driver credential deactivated for truck ${credential.truckNo} by ${req.user?.username}`);

    res.status(200).json({
      success: true,
      message: 'Driver credential deactivated successfully',
      data: credential,
    });
    emitDataChange('driver_credentials', 'update');
  } catch (error: any) {
    throw error;
  }
};

/**
 * Reactivate driver credential
 */
export const reactivateDriverCredential = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const credential = await DriverCredential.findById(id);

    if (!credential) {
      throw new ApiError(404, 'Driver credential not found');
    }

    credential.isActive = true;
    await credential.save();

    // Log reactivation
    await AuditService.logRestore(
      req.user?.userId || 'system',
      req.user?.username || 'system',
      'DriverCredential',
      credential._id.toString(),
      req.ip
    );

    logger.info(`Driver credential reactivated for truck ${credential.truckNo} by ${req.user?.username}`);

    res.status(200).json({
      success: true,
      message: 'Driver credential reactivated successfully',
      data: credential,
    });
    emitDataChange('driver_credentials', 'update');
  } catch (error: any) {
    throw error;
  }
};

/**
 * Export driver credentials
 */
export const exportDriverCredentials = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { format = 'json' } = req.query;

    const credentials = await DriverCredential.find({ isActive: true })
      .select('-pin') // Never export hashed PINs
      .sort({ truckNo: 1 })
      .lean();

    const normalizedCredentials = credentials.map(normalizeCredentialForList);

    // Log export action
    await AuditService.logExport(
      req.user?.userId || 'system',
      req.user?.username || 'system',
      'DriverCredential',
      format as string,
      normalizedCredentials.length,
      req.ip
    );

    logger.warn(`Driver credentials exported (${normalizedCredentials.length} records) by ${req.user?.username}`);

    if (format === 'csv') {
      // CSV format
      const csv = [
        'Truck Number,Driver Name,Created Date,Last Login,Status',
        ...normalizedCredentials.map(c => 
          `${c.truckNo},"${c.driverName || 'Not set'}",${c.createdAt},${c.lastLogin || 'Never'},${c.isActive ? 'Active' : 'Inactive'}`
        )
      ].join('\n');

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename=driver_credentials_${new Date().toISOString().split('T')[0]}.csv`);
      res.send(csv);
    } else {
      // JSON format
      res.status(200).json({
        success: true,
        message: 'Driver credentials exported successfully',
        data: {
          credentials: normalizedCredentials,
          exportedAt: new Date(),
          exportedBy: req.user?.username,
          totalCount: normalizedCredentials.length,
        },
      });
    }
  } catch (error: any) {
    throw error;
  }
};

/**
 * Get driver credentials statistics
 */
export const getDriverCredentialsStats = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const [totalDrivers, activeDrivers, inactiveDrivers, recentLogins] = await Promise.all([
      DriverCredential.countDocuments(),
      DriverCredential.countDocuments({ isActive: true }),
      DriverCredential.countDocuments({ isActive: false }),
      DriverCredential.countDocuments({
        lastLogin: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }
      }),
    ]);

    res.status(200).json({
      success: true,
      message: 'Statistics retrieved successfully',
      data: {
        totalDrivers,
        activeDrivers,
        inactiveDrivers,
        recentLogins,
        loginRate: totalDrivers > 0 ? ((recentLogins / totalDrivers) * 100).toFixed(1) : '0',
      },
    });
  } catch (error: any) {
    throw error;
  }
};
