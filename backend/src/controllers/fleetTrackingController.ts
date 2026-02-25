import { Response } from 'express';
import { FleetSnapshot, TruckPosition, Checkpoint, DeliveryOrder, FuelRecord } from '../models';
import { ApiError } from '../middleware/errorHandler';
import { AuthRequest } from '../middleware/auth';
import { logger } from '../utils';
import { AuditService } from '../utils/auditService';
import { fleetReportParser } from '../services/fleetReportParser';
import multer from 'multer';
import path from 'path';
import { validateFileUpload, fileSizeLimit } from '../middleware/fileUploadValidator';

// Configure multer for file upload
// ✅ SECURITY: Max 15MB (consistent with import routes)
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 15 * 1024 * 1024 }, // 15MB max
}).single('file');

/**
 * Upload and parse fleet report
 * POST /api/fleet-tracking/upload
 * Access: fuel_order_maker, admin, super_admin
 * ✅ SECURITY: File validated with magic bytes + UUID rename + size limit
 */
export const uploadFleetReport = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = req.user;
    if (!user || !['fuel_order_maker', 'admin', 'super_admin'].includes(user.role)) {
      throw new ApiError(403, 'Only fuel order makers and administrators can upload fleet reports');
    }

    // Handle file upload
    await new Promise<void>((resolve, reject) => {
      upload(req, res, (err: any) => {
        if (err) reject(err);
        else resolve();
      });
    });

    // Apply file size limit
    if (req.file && req.file.size > 15 * 1024 * 1024) {
      throw new ApiError(413, 'File too large. Maximum size is 15MB');
    }

    // Validate file (magic bytes, structure, etc.)
    await new Promise<void>((resolve, reject) => {
      validateFileUpload(['xlsx', 'xls', 'csv'])(req, res, (err?: any) => {
        if (err) reject(err);
        else resolve();
      });
    });

    const file = req.file;
    if (!file) {
      throw new ApiError(400, 'No file uploaded');
    }

    // ✅ Use safe filename instead of original
    const safeFilename = (file as any).safeFilename || file.originalname;

    // Initialize parser (loads checkpoints)
    await fleetReportParser.initialize();

    // Parse the file
    logger.info(`Parsing ${safeFilename} as Excel/CSV file...`);
    const parsedData = await fleetReportParser.parseExcelFile(file.buffer, safeFilename);
    logger.info(`Parse complete: Type=${parsedData.reportType}, Groups=${parsedData.fleetGroups.length}, Trucks=${parsedData.totalTrucks}`);

    // Create snapshot
    const snapshot = await FleetSnapshot.create({
      timestamp: new Date(),
      reportDate: parsedData.reportDate,
      reportType: parsedData.reportType,
      uploadedBy: user.username,
      fileName: safeFilename, // ✅ Use safe filename
      fileSize: file.size,
      processedAt: new Date(),
      fleetGroups: parsedData.fleetGroups,
      totalTrucks: parsedData.totalTrucks,
      goingTrucks: parsedData.goingTrucks,
      returningTrucks: parsedData.returningTrucks,
      checkpointDistribution: parsedData.checkpointDistribution,
    });

    // Create individual truck position records for easier querying
    // No per-truck DO/FuelRecord lookups needed — trucks are displayed on map regardless of records
    const truckPositions = [];
    for (const group of parsedData.fleetGroups) {
      for (const truck of group.trucks) {
        truckPositions.push({
          ...truck,
          fleetGroup: group.name,
          fleetGroupId: snapshot._id,
          reportDate: parsedData.reportDate,
          snapshotId: snapshot._id,
        });
      }
    }

    if (truckPositions.length > 0) {
      await TruckPosition.insertMany(truckPositions);
    }

    // TODO: Add audit logging once UPLOAD_FLEET_REPORT action is added to AuditLog enum
    // await AuditService.log({ ... });

    if (parsedData.totalTrucks === 0) {
      logger.warn(`⚠️ WARNING: Fleet report processed but found 0 trucks! File: ${file.originalname}`);
      logger.warn('This usually means the CSV/Excel format does not match expected structure.');
    } else {
      logger.info(
        `✅ Fleet report processed: ${parsedData.totalTrucks} trucks in ${parsedData.fleetGroups.length} groups`
      );
    }

    res.status(201).json({
      success: true,
      message: parsedData.totalTrucks > 0 
        ? `Fleet report uploaded successfully: ${parsedData.totalTrucks} trucks processed` 
        : 'Fleet report uploaded but no trucks found. Please check file format.',
      data: {
        snapshotId: snapshot._id,
        reportDate: parsedData.reportDate,
        reportType: parsedData.reportType,
        totalTrucks: parsedData.totalTrucks,
        goingTrucks: parsedData.goingTrucks,
        returningTrucks: parsedData.returningTrucks,
        fleetGroups: parsedData.fleetGroups.length,
        checkpointDistribution: Object.fromEntries(parsedData.checkpointDistribution),
      },
    });
  } catch (error: any) {
    throw error;
  }
};

/**
 * Get all fleet snapshots
 * GET /api/fleet-tracking/snapshots
 * Access: fuel_order_maker, admin, super_admin
 */
export const getAllSnapshots = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = req.user;
    if (!user || !['fuel_order_maker', 'admin', 'super_admin'].includes(user.role)) {
      throw new ApiError(403, 'Unauthorized');
    }

    const { limit = 20, skip = 0 } = req.query;

    const snapshots = await FleetSnapshot.find({ isDeleted: false })
      .sort({ timestamp: -1 })
      .limit(Number(limit))
      .skip(Number(skip))
      .select('-fleetGroups'); // Exclude detailed data for list view

    const total = await FleetSnapshot.countDocuments({ isDeleted: false });

    res.status(200).json({
      success: true,
      data: snapshots,
      pagination: {
        total,
        limit: Number(limit),
        skip: Number(skip),
        hasMore: Number(skip) + snapshots.length < total,
      },
    });
  } catch (error: any) {
    throw error;
  }
};

/**
 * Get latest fleet snapshot
 * GET /api/fleet-tracking/latest
 * Access: fuel_order_maker, admin, super_admin
 */
export const getLatestSnapshot = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = req.user;
    if (!user || !['fuel_order_maker', 'admin', 'super_admin'].includes(user.role)) {
      throw new ApiError(403, 'Unauthorized');
    }

    const snapshot = await FleetSnapshot.findOne({ isDeleted: false }).sort({ timestamp: -1 });

    if (!snapshot) {
      throw new ApiError(404, 'No fleet snapshots found');
    }

    res.status(200).json({
      success: true,
      data: snapshot,
    });
  } catch (error: any) {
    throw error;
  }
};

/**
 * Get truck positions with filters
 * GET /api/fleet-tracking/positions
 * Access: fuel_order_maker, admin, super_admin
 */
export const getTruckPositions = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = req.user;
    if (!user || !['fuel_order_maker', 'admin', 'super_admin'].includes(user.role)) {
      throw new ApiError(403, 'Unauthorized');
    }

    const { snapshotId, checkpoint, direction, fleetGroup, search } = req.query;

    // If no snapshotId, use latest
    let targetSnapshotId = snapshotId;
    if (!targetSnapshotId) {
      const latestSnapshot = await FleetSnapshot.findOne({ isDeleted: false }).sort({ timestamp: -1 });
      if (!latestSnapshot) {
        throw new ApiError(404, 'No fleet snapshots found');
      }
      targetSnapshotId = latestSnapshot._id.toString();
    }

    // Build query
    const query: any = { snapshotId: targetSnapshotId };

    if (checkpoint) {
      query.currentCheckpoint = checkpoint.toString().toUpperCase();
    }

    if (direction) {
      query.direction = direction.toString().toUpperCase();
    }

    if (fleetGroup) {
      query.fleetGroup = new RegExp(fleetGroup.toString(), 'i');
    }

    if (search) {
      query.truckNo = new RegExp(search.toString(), 'i');
    }

    const positions = await TruckPosition.find(query).sort({ checkpointOrder: 1, truckNo: 1 });

    // Get snapshot info
    const snapshot = await FleetSnapshot.findById(targetSnapshotId).select(
      'timestamp reportDate reportType totalTrucks goingTrucks returningTrucks'
    );

    res.status(200).json({
      success: true,
      data: {
        snapshot,
        positions,
        summary: {
          totalTrucks: positions.length,
          goingTrucks: positions.filter(p => p.direction === 'GOING').length,
          returningTrucks: positions.filter(p => p.direction === 'RETURNING').length,
        },
      },
    });
  } catch (error: any) {
    throw error;
  }
};

/**
 * Get trucks at a specific checkpoint
 * GET /api/fleet-tracking/checkpoint/:name
 * Access: fuel_order_maker, admin, super_admin
 */
export const getTrucksAtCheckpoint = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = req.user;
    if (!user || !['fuel_order_maker', 'admin', 'super_admin'].includes(user.role)) {
      throw new ApiError(403, 'Unauthorized');
    }

    const { name } = req.params;
    const { snapshotId } = req.query;

    // If no snapshotId, use latest
    let targetSnapshotId = snapshotId;
    if (!targetSnapshotId) {
      const latestSnapshot = await FleetSnapshot.findOne({ isDeleted: false }).sort({ timestamp: -1 });
      if (!latestSnapshot) {
        throw new ApiError(404, 'No fleet snapshots found');
      }
      targetSnapshotId = latestSnapshot._id.toString();
    }

    const trucks = await TruckPosition.find({
      snapshotId: targetSnapshotId,
      currentCheckpoint: name.toUpperCase(),
    }).sort({ direction: 1, truckNo: 1 });

    const goingTrucks = trucks.filter(t => t.direction === 'GOING');
    const returningTrucks = trucks.filter(t => t.direction === 'RETURNING');

    res.status(200).json({
      success: true,
      data: {
        checkpoint: name.toUpperCase(),
        totalTrucks: trucks.length,
        goingTrucks: goingTrucks,
        returningTrucks: returningTrucks,
        summary: {
          going: goingTrucks.length,
          returning: returningTrucks.length,
        },
      },
    });
  } catch (error: any) {
    throw error;
  }
};

/**
 * Get formatted truck list for copying (KEY FEATURE!)
 * GET /api/fleet-tracking/checkpoint/:name/copy
 * Access: fuel_order_maker, admin, super_admin
 * 
 * Returns truck numbers in various formats for easy copying to LPO
 */
export const getCopyableTruckList = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = req.user;
    if (!user || !['fuel_order_maker', 'admin', 'super_admin'].includes(user.role)) {
      throw new ApiError(403, 'Unauthorized');
    }

    const { name } = req.params;
    const { snapshotId, direction, format = 'comma' } = req.query;

    // If no snapshotId, use latest
    let targetSnapshotId = snapshotId;
    if (!targetSnapshotId) {
      const latestSnapshot = await FleetSnapshot.findOne({ isDeleted: false }).sort({ timestamp: -1 });
      if (!latestSnapshot) {
        throw new ApiError(404, 'No fleet snapshots found');
      }
      targetSnapshotId = latestSnapshot._id.toString();
    }

    const query: any = {
      snapshotId: targetSnapshotId,
      currentCheckpoint: name.toUpperCase(),
    };

    if (direction) {
      query.direction = direction.toString().toUpperCase();
    }

    const trucks = await TruckPosition.find(query).sort({ truckNo: 1 });

    const truckNumbers = trucks.map(t => t.truckNo);

    // Format options
    let formattedText = '';
    switch (format) {
      case 'comma':
        formattedText = truckNumbers.join(', ');
        break;
      case 'line':
        formattedText = truckNumbers.join('\n');
        break;
      case 'array':
        formattedText = JSON.stringify(truckNumbers);
        break;
      case 'detailed':
        formattedText = trucks.map(t => `${t.truckNo} (${t.direction}, ${t.status})`).join('\n');
        break;
      default:
        formattedText = truckNumbers.join(', ');
    }

    res.status(200).json({
      success: true,
      data: {
        checkpoint: name.toUpperCase(),
        direction: direction || 'ALL',
        count: trucks.length,
        truckNumbers,
        formattedText,
        format,
      },
    });
  } catch (error: any) {
    throw error;
  }
};

/**
 * Delete fleet snapshot
 * DELETE /api/fleet-tracking/snapshots/:id
 * Access: fuel_order_maker, admin, super_admin
 */
export const deleteSnapshot = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = req.user;
    if (!user || !['fuel_order_maker', 'admin', 'super_admin'].includes(user.role)) {
      throw new ApiError(403, 'Only fuel order makers and administrators can delete snapshots');
    }

    const { id } = req.params;

    const snapshot = await FleetSnapshot.findById(id);
    if (!snapshot) {
      throw new ApiError(404, 'Snapshot not found');
    }

    snapshot.isDeleted = true;
    snapshot.deletedAt = new Date();
    await snapshot.save();

    // Also delete associated truck positions
    await TruckPosition.deleteMany({ snapshotId: id });

    // TODO: Add audit logging for fleet snapshot deletion
    // await AuditService.log({
    //   action: 'DELETE',
    //   resourceType: 'FLEET_SNAPSHOT',
    //   resourceId: id,
    //   userId: user.id,
    //   username: user.username,
    //   details: JSON.stringify({ fileName: snapshot.fileName }),
    //   ipAddress: req.ip,
    //   userAgent: req.get('user-agent'),
    // });

    logger.info(`Fleet snapshot ${id} deleted by ${user.username}`);

    res.status(200).json({
      success: true,
      message: 'Fleet snapshot deleted successfully',
    });
  } catch (error: any) {
    throw error;
  }
};

/**
 * Get checkpoint distribution statistics
 * GET /api/fleet-tracking/stats/distribution
 * Access: fuel_order_maker, admin, super_admin
 */
export const getCheckpointDistribution = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = req.user;
    if (!user || !['fuel_order_maker', 'admin', 'super_admin'].includes(user.role)) {
      throw new ApiError(403, 'Unauthorized');
    }

    const { snapshotId } = req.query;

    // If no snapshotId, use latest
    let targetSnapshotId = snapshotId;
    if (!targetSnapshotId) {
      const latestSnapshot = await FleetSnapshot.findOne({ isDeleted: false }).sort({ timestamp: -1 });
      if (!latestSnapshot) {
        throw new ApiError(404, 'No fleet snapshots found');
      }
      targetSnapshotId = latestSnapshot._id.toString();
    }

    // Get all checkpoints with trucks
    const distribution = await TruckPosition.aggregate([
      { $match: { snapshotId: targetSnapshotId } },
      {
        $group: {
          _id: '$currentCheckpoint',
          total: { $sum: 1 },
          going: {
            $sum: { $cond: [{ $eq: ['$direction', 'GOING'] }, 1, 0] },
          },
          returning: {
            $sum: { $cond: [{ $eq: ['$direction', 'RETURNING'] }, 1, 0] },
          },
          checkpointOrder: { $first: '$checkpointOrder' },
        },
      },
      { $sort: { checkpointOrder: 1 } },
    ]);

    res.status(200).json({
      success: true,
      data: distribution,
    });
  } catch (error: any) {
    throw error;
  }
};
