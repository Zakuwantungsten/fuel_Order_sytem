import { Response } from 'express';
import { YardFuelDispense, FuelRecord } from '../models';
import { ApiError } from '../middleware/errorHandler';
import { AuthRequest } from '../middleware/auth';
import { getPaginationParams, createPaginatedResponse, calculateSkip, logger } from '../utils';

/**
 * Get all yard fuel dispenses with pagination and filters
 */
export const getAllYardFuelDispenses = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { page, limit, sort, order } = getPaginationParams(req.query);
    const { dateFrom, dateTo, truckNo, yard, status } = req.query;

    // Build filter
    const filter: any = { isDeleted: false };

    if (dateFrom || dateTo) {
      filter.date = {};
      if (dateFrom) filter.date.$gte = dateFrom;
      if (dateTo) filter.date.$lte = dateTo;
    }

    if (truckNo) {
      filter.truckNo = { $regex: truckNo, $options: 'i' };
    }

    if (yard) {
      filter.yard = yard;
    }

    if (status) {
      filter.status = status;
    }

    // Get data with pagination
    const skip = calculateSkip(page, limit);
    const sortOrder = order === 'asc' ? 1 : -1;

    const [yardFuelDispenses, total] = await Promise.all([
      YardFuelDispense.find(filter)
        .sort({ [sort]: sortOrder })
        .skip(skip)
        .limit(limit)
        .lean(),
      YardFuelDispense.countDocuments(filter),
    ]);

    const response = createPaginatedResponse(yardFuelDispenses, page, limit, total);

    res.status(200).json({
      success: true,
      message: 'Yard fuel dispenses retrieved successfully',
      data: response,
    });
  } catch (error: any) {
    throw error;
  }
};

/**
 * Get single yard fuel dispense by ID
 */
export const getYardFuelDispenseById = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const yardFuelDispense = await YardFuelDispense.findOne({ _id: id, isDeleted: false });

    if (!yardFuelDispense) {
      throw new ApiError(404, 'Yard fuel dispense not found');
    }

    res.status(200).json({
      success: true,
      message: 'Yard fuel dispense retrieved successfully',
      data: yardFuelDispense,
    });
  } catch (error: any) {
    throw error;
  }
};

/**
 * Create new yard fuel dispense
 */
export const createYardFuelDispense = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    // Auto-detect yard based on user role
    let yard = req.body.yard;
    const userRole = req.user?.role;
    
    if (userRole === 'dar_yard') {
      yard = 'DAR YARD';
    } else if (userRole === 'tanga_yard') {
      yard = 'TANGA YARD';
    } else if (userRole === 'mmsa_yard') {
      yard = 'MMSA YARD';
    }

    const yardFuelDispense = await YardFuelDispense.create({
      ...req.body,
      yard,
      enteredBy: req.user?.username || 'system',
      timestamp: new Date(),
    });

    logger.info(
      `Yard fuel dispense created: ${yardFuelDispense.truckNo} at ${yardFuelDispense.yard} by ${req.user?.username}`
    );

    // Auto-update fuel record if exists
    let linkedInfo = null;
    try {
      const truckNo = yardFuelDispense.truckNo;
      const dispenseDate = yardFuelDispense.date;
      
      // Find matching fuel record (within +/- 2 days)
      const searchDateStart = new Date(dispenseDate);
      searchDateStart.setDate(searchDateStart.getDate() - 2);
      const searchDateEnd = new Date(dispenseDate);
      searchDateEnd.setDate(searchDateEnd.getDate() + 2);
      
      const fuelRecord = await FuelRecord.findOne({
        truckNo: { $regex: new RegExp(`^${truckNo}$`, 'i') },
        date: {
          $gte: searchDateStart.toISOString().split('T')[0],
          $lte: searchDateEnd.toISOString().split('T')[0],
        },
        isDeleted: false,
      }).sort({ date: -1 });

      if (fuelRecord) {
        // Update the appropriate yard column
        let updateField = '';
        if (yard === 'DAR YARD') {
          updateField = 'darYard';
        } else if (yard === 'TANGA YARD') {
          updateField = 'tangaYard';
        } else if (yard === 'MMSA YARD') {
          updateField = 'mmsaYard';
        }

        if (updateField) {
          const currentValue = (fuelRecord as any)[updateField] || 0;
          await FuelRecord.findByIdAndUpdate(fuelRecord._id, {
            [updateField]: currentValue - yardFuelDispense.liters,
          });

          // Update yard fuel dispense status
          await YardFuelDispense.findByIdAndUpdate(yardFuelDispense._id, {
            status: 'linked',
            linkedFuelRecordId: fuelRecord._id.toString(),
            linkedDONumber: fuelRecord.goingDo,
            autoLinked: true,
          });

          linkedInfo = {
            linked: true,
            doNumber: fuelRecord.goingDo,
            fieldUpdated: updateField,
          };

          logger.info(
            `Fuel record auto-updated: ${fuelRecord.goingDo} ${updateField} += ${yardFuelDispense.liters}L`
          );
        }
      } else {
        logger.info(
          `No matching fuel record found for ${truckNo}. Dispense saved as pending.`
        );
      }
    } catch (linkError: any) {
      logger.warn('Failed to auto-link fuel record:', linkError);
      // Continue even if linking fails
    }

    const responseMessage = linkedInfo?.linked
      ? `Fuel recorded and linked to DO ${linkedInfo.doNumber}`
      : 'Fuel recorded successfully. Will be linked when fuel record is created.';

    res.status(201).json({
      success: true,
      message: responseMessage,
      data: {
        ...yardFuelDispense.toObject(),
        linkedInfo,
      },
    });
  } catch (error: any) {
    throw error;
  }
};

/**
 * Update yard fuel dispense
 */
export const updateYardFuelDispense = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const yardFuelDispense = await YardFuelDispense.findOneAndUpdate(
      { _id: id, isDeleted: false },
      req.body,
      { new: true, runValidators: true }
    );

    if (!yardFuelDispense) {
      throw new ApiError(404, 'Yard fuel dispense not found');
    }

    logger.info(
      `Yard fuel dispense updated: ${yardFuelDispense.truckNo} by ${req.user?.username}`
    );

    res.status(200).json({
      success: true,
      message: 'Yard fuel dispense updated successfully',
      data: yardFuelDispense,
    });
  } catch (error: any) {
    throw error;
  }
};

/**
 * Soft delete yard fuel dispense
 */
export const deleteYardFuelDispense = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const yardFuelDispense = await YardFuelDispense.findByIdAndUpdate(
      id,
      { isDeleted: true, deletedAt: new Date() },
      { new: true }
    );

    if (!yardFuelDispense) {
      throw new ApiError(404, 'Yard fuel dispense not found');
    }

    logger.info(
      `Yard fuel dispense deleted: ${yardFuelDispense.truckNo} by ${req.user?.username}`
    );

    res.status(200).json({
      success: true,
      message: 'Yard fuel dispense deleted successfully',
    });
  } catch (error: any) {
    throw error;
  }
};

/**
 * Get yard fuel dispenses by truck number
 */
export const getYardFuelDispensesByTruck = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const { truckNo } = req.params;

    const yardFuelDispenses = await YardFuelDispense.find({
      truckNo: { $regex: truckNo, $options: 'i' },
      isDeleted: false,
    }).sort({ timestamp: -1 });

    res.status(200).json({
      success: true,
      message: 'Yard fuel dispenses retrieved successfully',
      data: yardFuelDispenses,
    });
  } catch (error: any) {
    throw error;
  }
};

/**
 * Get pending yard fuel dispenses (not linked to fuel records)
 */
export const getPendingYardFuelDispenses = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const yardFuelDispenses = await YardFuelDispense.find({
      status: 'pending',
      isDeleted: false,
    }).sort({ timestamp: -1 });

    res.status(200).json({
      success: true,
      message: 'Pending yard fuel dispenses retrieved successfully',
      data: yardFuelDispenses,
    });
  } catch (error: any) {
    throw error;
  }
};

/**
 * Get yard fuel summary by yard
 */
export const getYardFuelSummary = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { yard, dateFrom, dateTo } = req.query;

    const filter: any = { isDeleted: false };

    if (yard) {
      filter.yard = yard;
    }

    if (dateFrom || dateTo) {
      filter.date = {};
      if (dateFrom) filter.date.$gte = dateFrom;
      if (dateTo) filter.date.$lte = dateTo;
    }

    const yardFuelDispenses = await YardFuelDispense.find(filter).lean();

    // Calculate summary
    const summary = {
      totalDispenses: yardFuelDispenses.length,
      totalLiters: yardFuelDispenses.reduce((sum, dispense) => sum + dispense.liters, 0),
      byStatus: {
        pending: yardFuelDispenses.filter((d) => d.status === 'pending').length,
        linked: yardFuelDispenses.filter((d) => d.status === 'linked').length,
        manual: yardFuelDispenses.filter((d) => d.status === 'manual').length,
      },
    };

    res.status(200).json({
      success: true,
      message: 'Yard fuel summary retrieved successfully',
      data: summary,
    });
  } catch (error: any) {
    throw error;
  }
};
