import { Response } from 'express';
import { matchedData } from 'express-validator';
import { Checkpoint } from '../models';
import { ApiError } from '../middleware/errorHandler';
import { AuthRequest } from '../middleware/auth';
import { logger } from '../utils';
import { AuditService } from '../utils/auditService';

/**
 * Get all checkpoints (ordered by sequence)
 * GET /api/checkpoints
 * Access: All authenticated users
 */
export const getAllCheckpoints = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { includeInactive } = matchedData(req, { locations: ['query'] }) as { includeInactive?: boolean };

    const query: any = { isDeleted: false };
    if (!includeInactive) {
      query.isActive = true;
    }

    const checkpoints = await Checkpoint.find(query).sort({ order: 1 });

    res.status(200).json({
      success: true,
      message: `Found ${checkpoints.length} checkpoints`,
      data: checkpoints,
    });
  } catch (error: any) {
    throw error;
  }
};

/**
 * Get single checkpoint by ID
 * GET /api/checkpoints/:id
 * Access: All authenticated users
 */
export const getCheckpointById = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const checkpoint = await Checkpoint.findOne({ _id: id, isDeleted: false });
    if (!checkpoint) {
      throw new ApiError(404, 'Checkpoint not found');
    }

    res.status(200).json({
      success: true,
      data: checkpoint,
    });
  } catch (error: any) {
    throw error;
  }
};

/**
 * Create new checkpoint
 * POST /api/checkpoints
 * Access: Admin only
 */
export const createCheckpoint = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = req.user;
    if (!user || !['super_admin', 'admin', 'fuel_order_maker'].includes(user.role)) {
      throw new ApiError(403, 'Only administrators and fuel order makers can create checkpoints');
    }

    const {
      name,
      displayName,
      order,
      region,
      country,
      coordinates,
      routeSegment,
      isActive = true,
      isMajor = false,
      alternativeNames = [],
      fuelAvailable = false,
      borderCrossing = false,
      estimatedDistanceFromStart = 0,
      insertAfter, // Optional: insert after specific checkpoint
    } = matchedData(req, { locations: ['body'] }) as any;

    // Validate required fields
    if (!name || !displayName || !region || !country) {
      throw new ApiError(400, 'Name, displayName, region, and country are required');
    }

    // Check if checkpoint already exists
    const existing = await Checkpoint.findOne({ 
      name: name.toUpperCase(), 
      isDeleted: false 
    });
    if (existing) {
      throw new ApiError(400, `Checkpoint ${name} already exists`);
    }

    let finalOrder = order;

    // If insertAfter is provided, find that checkpoint and insert after it
    if (insertAfter) {
      const afterCheckpoint = await Checkpoint.findOne({ 
        name: insertAfter.toUpperCase(), 
        isDeleted: false 
      });
      if (!afterCheckpoint) {
        throw new ApiError(404, `Checkpoint ${insertAfter} not found`);
      }

      finalOrder = afterCheckpoint.order + 1;

      // Shift all checkpoints after this one
      await Checkpoint.updateMany(
        { order: { $gte: finalOrder }, isDeleted: false },
        { $inc: { order: 1 } }
      );
    } else if (!order) {
      // If no order specified, add at the end
      const lastCheckpoint = await Checkpoint.findOne({ isDeleted: false })
        .sort({ order: -1 });
      finalOrder = lastCheckpoint ? lastCheckpoint.order + 1 : 1;
    }

    const checkpoint = await Checkpoint.create({
      name: name.toUpperCase(),
      displayName,
      order: finalOrder,
      region,
      country,
      coordinates,
      routeSegment,
      isActive,
      isMajor,
      alternativeNames,
      fuelAvailable,
      borderCrossing,
      estimatedDistanceFromStart,
      createdBy: user.username,
    });

    // Audit log
    await AuditService.log({
      action: 'CREATE_CHECKPOINT',
      userId: user.userId,
      username: user.username,
      resourceType: 'checkpoint',
      details: JSON.stringify({
        checkpointId: checkpoint._id,
        name: checkpoint.name,
        order: checkpoint.order,
      }),
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

    logger.info(`Checkpoint ${checkpoint.name} created by ${user.username} at position ${finalOrder}`);

    res.status(201).json({
      success: true,
      message: 'Checkpoint created successfully',
      data: checkpoint,
    });
  } catch (error: any) {
    throw error;
  }
};

/**
 * Update checkpoint
 * PUT /api/checkpoints/:id
 * Access: Admin only
 */
export const updateCheckpoint = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = req.user;
    if (!user || !['super_admin', 'admin', 'fuel_order_maker'].includes(user.role)) {
      throw new ApiError(403, 'Only administrators and fuel order makers can update checkpoints');
    }

    const { id } = req.params;
    const updates = matchedData(req, { locations: ['body'] }) as any;

    const checkpoint = await Checkpoint.findOne({ _id: id, isDeleted: false });
    if (!checkpoint) {
      throw new ApiError(404, 'Checkpoint not found');
    }

    // Don't allow changing name or order directly (use reorder endpoint)
    delete updates.name;
    delete updates.order;
    delete updates.createdBy;
    delete updates.isDeleted;

    Object.assign(checkpoint, updates);
    await checkpoint.save();

    // Audit log
    await AuditService.log({
      action: 'UPDATE_CHECKPOINT',
      userId: user.userId,
      username: user.username,
      resourceType: 'checkpoint',
      details: JSON.stringify({
        checkpointId: checkpoint._id,
        name: checkpoint.name,
        updates,
      }),
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

    logger.info(`Checkpoint ${checkpoint.name} updated by ${user.username}`);

    res.status(200).json({
      success: true,
      message: 'Checkpoint updated successfully',
      data: checkpoint,
    });
  } catch (error: any) {
    throw error;
  }
};

/**
 * Delete checkpoint (soft delete)
 * DELETE /api/checkpoints/:id
 * Access: Admin only
 */
export const deleteCheckpoint = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = req.user;
    if (!user || !['super_admin', 'admin'].includes(user.role)) {
      throw new ApiError(403, 'Only administrators can delete checkpoints');
    }

    const { id } = req.params;

    const checkpoint = await Checkpoint.findOne({ _id: id, isDeleted: false });
    if (!checkpoint) {
      throw new ApiError(404, 'Checkpoint not found');
    }

    // Soft delete
    checkpoint.isDeleted = true;
    checkpoint.isActive = false;
    await checkpoint.save();

    // Reorder remaining checkpoints
    await Checkpoint.updateMany(
      { order: { $gt: checkpoint.order }, isDeleted: false },
      { $inc: { order: -1 } }
    );

    // Audit log
    await AuditService.log({
      action: 'DELETE_CHECKPOINT',
      userId: user.userId,
      username: user.username,
      resourceType: 'checkpoint',
      details: JSON.stringify({
        checkpointId: checkpoint._id,
        name: checkpoint.name,
        order: checkpoint.order,
      }),
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

    logger.info(`Checkpoint ${checkpoint.name} deleted by ${user.username}`);

    res.status(200).json({
      success: true,
      message: 'Checkpoint deleted successfully',
    });
  } catch (error: any) {
    throw error;
  }
};

/**
 * Reorder checkpoints in bulk
 * PUT /api/checkpoints/reorder
 * Access: Admin only
 */
export const reorderCheckpoints = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = req.user;
    if (!user || !['super_admin', 'admin', 'fuel_order_maker'].includes(user.role)) {
      throw new ApiError(403, 'Only administrators and fuel order makers can reorder checkpoints');
    }

    const { checkpoints } = matchedData(req, { locations: ['body'] }) as { checkpoints?: Array<{ id: string; order: number }> };

    if (!Array.isArray(checkpoints) || checkpoints.length === 0) {
      throw new ApiError(400, 'Checkpoints array is required');
    }

    // Validate all checkpoints exist
    const checkpointIds = checkpoints.map(c => c.id);
    const existingCheckpoints = await Checkpoint.find({
      _id: { $in: checkpointIds },
      isDeleted: false,
    });

    if (existingCheckpoints.length !== checkpoints.length) {
      throw new ApiError(400, 'Some checkpoints not found');
    }

    // Update orders
    const updatePromises = checkpoints.map(({ id, order }) =>
      Checkpoint.updateOne({ _id: id }, { $set: { order } })
    );

    await Promise.all(updatePromises);

    // Audit log
    await AuditService.log({
      action: 'REORDER_CHECKPOINTS',
      userId: user.userId,
      username: user.username,
      resourceType: 'checkpoint',
      details: JSON.stringify({
        checkpointCount: checkpoints.length,
        reordering: checkpoints,
      }),
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

    logger.info(`${checkpoints.length} checkpoints reordered by ${user.username}`);

    res.status(200).json({
      success: true,
      message: 'Checkpoints reordered successfully',
      data: { updated: checkpoints.length },
    });
  } catch (error: any) {
    throw error;
  }
};

/**
 * Seed initial checkpoints from the provided array
 * POST /api/checkpoints/seed
 * Access: Super Admin only
 */
export const seedCheckpoints = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = req.user;
    if (!user || user.role !== 'super_admin') {
      throw new ApiError(403, 'Only super administrators can seed checkpoints');
    }

    // Check if checkpoints already exist
    const existingCount = await Checkpoint.countDocuments({ isDeleted: false });
    if (existingCount > 0) {
      throw new ApiError(400, `Cannot seed: ${existingCount} checkpoints already exist. Delete them first or use force=true.`);
    }

    const initialCheckpoints = [
      { name: 'TAVETA KENYA', region: 'KENYA', country: 'KE', isMajor: false, borderCrossing: true },
      { name: 'BONJE', region: 'TANZANIA_COASTAL', country: 'TZ', isMajor: false },
      { name: 'MOMBASA', region: 'KENYA', country: 'KE', isMajor: true, fuelAvailable: true },
      { name: 'HOROHORO', region: 'TANZANIA_COASTAL', country: 'TZ', isMajor: false },
      { name: 'TANGA', region: 'TANZANIA_COASTAL', country: 'TZ', isMajor: true, fuelAvailable: true },
      { name: 'KANGE', region: 'TANZANIA_COASTAL', country: 'TZ', isMajor: false },
      { name: 'PONGWE', region: 'TANZANIA_COASTAL', country: 'TZ', isMajor: false },
      { name: 'MUHEZA', region: 'TANZANIA_COASTAL', country: 'TZ', isMajor: false },
      { name: 'SEGERA', region: 'TANZANIA_COASTAL', country: 'TZ', isMajor: false },
      { name: 'MANGA', region: 'TANZANIA_COASTAL', country: 'TZ', isMajor: false },
      { name: 'MSATA', region: 'TANZANIA_COASTAL', country: 'TZ', isMajor: false },
      { name: 'MKATA', region: 'TANZANIA_COASTAL', country: 'TZ', isMajor: false },
      { name: 'DSM TAHMEED YARD', region: 'TANZANIA_COASTAL', country: 'TZ', isMajor: true, alternativeNames: ['DSM YARD', 'TAHMEED YARD'] },
      { name: 'DSM', region: 'TANZANIA_COASTAL', country: 'TZ', isMajor: true, fuelAvailable: true, alternativeNames: ['DAR', 'DAR ES SALAAM', 'DARUSSALAAM'] },
      { name: 'KIMARA', region: 'TANZANIA_INTERIOR', country: 'TZ', isMajor: false },
      { name: 'VIGWAZA', region: 'TANZANIA_INTERIOR', country: 'TZ', isMajor: false },
      { name: 'KIBAHA', region: 'TANZANIA_INTERIOR', country: 'TZ', isMajor: false },
      { name: 'MLANDIZI', region: 'TANZANIA_INTERIOR', country: 'TZ', isMajor: false },
      { name: 'MDAULA', region: 'TANZANIA_INTERIOR', country: 'TZ', isMajor: false },
      { name: 'CHALINZE', region: 'TANZANIA_INTERIOR', country: 'TZ', isMajor: false },
      { name: 'MISUGUSUGU', region: 'TANZANIA_INTERIOR', country: 'TZ', isMajor: false },
      { name: 'MIKESE', region: 'TANZANIA_INTERIOR', country: 'TZ', isMajor: false },
      { name: 'MOROGORO', region: 'TANZANIA_INTERIOR', country: 'TZ', isMajor: true, fuelAvailable: true, alternativeNames: ['MORO'] },
      { name: 'DOMA', region: 'TANZANIA_INTERIOR', country: 'TZ', isMajor: false },
      { name: 'MIKUMI', region: 'TANZANIA_INTERIOR', country: 'TZ', isMajor: false },
      { name: 'MBUYUNI', region: 'TANZANIA_INTERIOR', country: 'TZ', isMajor: false },
      { name: 'ILULA', region: 'TANZANIA_INTERIOR', country: 'TZ', isMajor: false },
      { name: 'IRINGA', region: 'TANZANIA_INTERIOR', country: 'TZ', isMajor: false },
      { name: 'IFUNDA', region: 'TANZANIA_INTERIOR', country: 'TZ', isMajor: false },
      { name: 'MAFINGA', region: 'TANZANIA_INTERIOR', country: 'TZ', isMajor: false },
      { name: 'MAKAMBAKO', region: 'TANZANIA_INTERIOR', country: 'TZ', isMajor: false },
      { name: 'IGAWA', region: 'TANZANIA_INTERIOR', country: 'TZ', isMajor: false },
      { name: 'IGURUSI', region: 'TANZANIA_INTERIOR', country: 'TZ', isMajor: false },
      { name: 'MBEYA', region: 'TANZANIA_INTERIOR', country: 'TZ', isMajor: true, fuelAvailable: true },
      { name: 'SONGWE', region: 'TANZANIA_BORDER', country: 'TZ', isMajor: false },
      { name: 'TUNDUMA', region: 'TANZANIA_BORDER', country: 'TZ', isMajor: true, fuelAvailable: true, borderCrossing: true, alternativeNames: ['TDM'] },
      { name: 'NAKONDE', region: 'ZAMBIA_NORTH', country: 'ZM', isMajor: true, borderCrossing: true },
      { name: 'MKASI', region: 'ZAMBIA_NORTH', country: 'ZM', isMajor: false },
      { name: 'ISOKA', region: 'ZAMBIA_NORTH', country: 'ZM', isMajor: false },
      { name: 'CHINSALI', region: 'ZAMBIA_NORTH', country: 'ZM', isMajor: false },
      { name: 'SHIWANGAMU', region: 'ZAMBIA_NORTH', country: 'ZM', isMajor: false },
      { name: 'MPIKA', region: 'ZAMBIA_CENTRAL', country: 'ZM', isMajor: false },
      { name: 'KALONJE', region: 'ZAMBIA_CENTRAL', country: 'ZM', isMajor: false },
      { name: 'MUNUNGA', region: 'ZAMBIA_CENTRAL', country: 'ZM', isMajor: false },
      { name: 'SERENJE', region: 'ZAMBIA_CENTRAL', country: 'ZM', isMajor: false },
      { name: 'MKUSHI', region: 'ZAMBIA_CENTRAL', country: 'ZM', isMajor: false },
      { name: 'KAPIRI MPOSHI', region: 'ZAMBIA_CENTRAL', country: 'ZM', isMajor: true, fuelAvailable: true, alternativeNames: ['KAPIRI', 'KPM'] },
      { name: 'NDOLA', region: 'ZAMBIA_COPPERBELT', country: 'ZM', isMajor: true, fuelAvailable: true },
      { name: 'KITWE', region: 'ZAMBIA_COPPERBELT', country: 'ZM', isMajor: true, fuelAvailable: true },
      { name: 'CHINGOLA', region: 'ZAMBIA_COPPERBELT', country: 'ZM', isMajor: false },
      { name: 'CHAMBISHI', region: 'ZAMBIA_COPPERBELT', country: 'ZM', isMajor: false },
      { name: 'CHILILABOMBWE', region: 'ZAMBIA_COPPERBELT', country: 'ZM', isMajor: true, fuelAvailable: true },
      { name: 'PETRODA', region: 'ZAMBIA_BORDER', country: 'ZM', isMajor: false },
      { name: 'KONKOLA', region: 'ZAMBIA_BORDER', country: 'ZM', isMajor: false },
      { name: 'KASUMBALESA ZMB', region: 'ZAMBIA_BORDER', country: 'ZM', isMajor: true, borderCrossing: true, alternativeNames: ['KASUMBALESA', 'KASUMBALESA-ZMB'] },
      { name: 'SAKANIA', region: 'DRC', country: 'CD', isMajor: false, borderCrossing: true },
      { name: 'KASUMBALESA DRC', region: 'DRC', country: 'CD', isMajor: true, borderCrossing: true, alternativeNames: ['KASUMBALESA-DRC'] },
      { name: 'WHISKY', region: 'DRC', country: 'CD', isMajor: false, alternativeNames: ['WHISKEY'] },
      { name: 'WHISKEY', region: 'DRC', country: 'CD', isMajor: false, alternativeNames: ['WHISKY'] },
      { name: 'KANYAKA', region: 'DRC', country: 'CD', isMajor: false },
      { name: 'LUMATU', region: 'DRC', country: 'CD', isMajor: false },
      { name: 'LUBUMBASHI', region: 'DRC', country: 'CD', isMajor: true },
      { name: 'LIKASI', region: 'DRC', country: 'CD', isMajor: true },
      { name: 'FUNGURUME', region: 'DRC', country: 'CD', isMajor: true },
      { name: 'KOLWEZI', region: 'DRC', country: 'CD', isMajor: true },
    ];

    const checkpointsToCreate = initialCheckpoints.map((cp, index) => ({
      name: cp.name,
      displayName: cp.name.split(' ').map(w => w.charAt(0) + w.slice(1).toLowerCase()).join(' '),
      order: index + 1,
      region: cp.region,
      country: cp.country,
      isActive: true,
      isMajor: cp.isMajor || false,
      alternativeNames: cp.alternativeNames || [],
      fuelAvailable: cp.fuelAvailable || false,
      borderCrossing: cp.borderCrossing || false,
      estimatedDistanceFromStart: index * 50, // Rough estimate, can be updated later
      createdBy: user.username,
    }));

    const created = await Checkpoint.insertMany(checkpointsToCreate);

    // Audit log
    await AuditService.log({
      action: 'SEED_CHECKPOINTS',
      userId: user.userId,
      username: user.username,
      resourceType: 'checkpoint',
      details: JSON.stringify({
        checkpointCount: created.length,
      }),
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

    logger.info(`${created.length} checkpoints seeded by ${user.username}`);

    res.status(201).json({
      success: true,
      message: `${created.length} checkpoints seeded successfully`,
      data: { checkpoints: created },
    });
  } catch (error: any) {
    throw error;
  }
};
