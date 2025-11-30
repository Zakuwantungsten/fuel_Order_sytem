import { Response } from 'express';
import { FuelRecord } from '../models';
import { ApiError } from '../middleware/errorHandler';
import { AuthRequest } from '../middleware/auth';
import { getPaginationParams, createPaginatedResponse, calculateSkip, logger } from '../utils';

/**
 * Get all fuel records with pagination and filters
 */
export const getAllFuelRecords = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { page, limit, sort, order } = getPaginationParams(req.query);
    const { dateFrom, dateTo, truckNo, from, to, month } = req.query;

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

    if (from) {
      filter.from = { $regex: from, $options: 'i' };
    }

    if (to) {
      filter.to = { $regex: to, $options: 'i' };
    }

    if (month) {
      filter.month = { $regex: month, $options: 'i' };
    }

    // Get data with pagination
    const skip = calculateSkip(page, limit);
    const sortOrder = order === 'asc' ? 1 : -1;

    const [fuelRecords, total] = await Promise.all([
      FuelRecord.find(filter)
        .sort({ [sort]: sortOrder })
        .skip(skip)
        .limit(limit)
        .lean(),
      FuelRecord.countDocuments(filter),
    ]);

    // Transform _id to id for frontend compatibility
    const transformedRecords = fuelRecords.map((record: any) => ({
      ...record,
      id: record._id,
    }));

    const response = createPaginatedResponse(transformedRecords, page, limit, total);

    res.status(200).json({
      success: true,
      message: 'Fuel records retrieved successfully',
      data: response,
    });
  } catch (error: any) {
    throw error;
  }
};

/**
 * Get single fuel record by ID
 */
export const getFuelRecordById = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const fuelRecord = await FuelRecord.findOne({ _id: id, isDeleted: false });

    if (!fuelRecord) {
      throw new ApiError(404, 'Fuel record not found');
    }

    res.status(200).json({
      success: true,
      message: 'Fuel record retrieved successfully',
      data: fuelRecord,
    });
  } catch (error: any) {
    throw error;
  }
};

/**
 * Get fuel records by truck number
 */
export const getFuelRecordsByTruck = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { truckNo } = req.params;

    const fuelRecords = await FuelRecord.find({
      truckNo: { $regex: truckNo, $options: 'i' },
      isDeleted: false,
    }).sort({ date: -1 });

    res.status(200).json({
      success: true,
      message: 'Fuel records retrieved successfully',
      data: fuelRecords,
    });
  } catch (error: any) {
    throw error;
  }
};

/**
 * Get fuel record by going DO number
 */
export const getFuelRecordByGoingDO = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { doNumber } = req.params;

    const fuelRecord = await FuelRecord.findOne({
      goingDo: doNumber,
      isDeleted: false,
    });

    if (!fuelRecord) {
      throw new ApiError(404, 'Fuel record not found');
    }

    res.status(200).json({
      success: true,
      message: 'Fuel record retrieved successfully',
      data: fuelRecord,
    });
  } catch (error: any) {
    throw error;
  }
};

/**
 * Create new fuel record
 */
export const createFuelRecord = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    // Check if truck already has an open fuel record (without returnDo)
    // This validation only applies when creating a NEW going journey fuel record
    // Export DOs will update existing records, not create new ones
    const existingRecord = await FuelRecord.findOne({
      truckNo: req.body.truckNo,
      returnDo: { $in: [null, '', undefined] },
      isDeleted: false,
    });

    // Only block if trying to create a fuel record for a truck with an incomplete journey
    // Note: Export DOs should update existing records via updateFuelRecord, not create new ones
    if (existingRecord && req.body.goingDo !== existingRecord.goingDo) {
      throw new ApiError(
        409,
        `Truck ${req.body.truckNo} already has an open fuel record (Going DO: ${existingRecord.goingDo}). Complete the return journey first before creating a new record.`
      );
    }

    // Auto-populate month from date if date is provided
    if (req.body.date && !req.body.month) {
      const date = new Date(req.body.date);
      const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 
                          'July', 'August', 'September', 'October', 'November', 'December'];
      req.body.month = `${monthNames[date.getMonth()]} ${date.getFullYear()}`;
    }

    const fuelRecord = await FuelRecord.create(req.body);

    logger.info(`Fuel record created for truck ${fuelRecord.truckNo} by ${req.user?.username}`);

    res.status(201).json({
      success: true,
      message: 'Fuel record created successfully',
      data: fuelRecord,
    });
  } catch (error: any) {
    throw error;
  }
};

/**
 * Update fuel record
 */
export const updateFuelRecord = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    // Auto-populate month from date if date is provided
    if (req.body.date && !req.body.month) {
      const date = new Date(req.body.date);
      const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 
                          'July', 'August', 'September', 'October', 'November', 'December'];
      req.body.month = `${monthNames[date.getMonth()]} ${date.getFullYear()}`;
    }

    const fuelRecord = await FuelRecord.findOneAndUpdate(
      { _id: id, isDeleted: false },
      req.body,
      { new: true, runValidators: true }
    );

    if (!fuelRecord) {
      throw new ApiError(404, 'Fuel record not found');
    }

    logger.info(`Fuel record updated for truck ${fuelRecord.truckNo} by ${req.user?.username}`);

    res.status(200).json({
      success: true,
      message: 'Fuel record updated successfully',
      data: fuelRecord,
    });
  } catch (error: any) {
    throw error;
  }
};

/**
 * Soft delete fuel record
 */
export const deleteFuelRecord = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const fuelRecord = await FuelRecord.findByIdAndUpdate(
      id,
      { isDeleted: true, deletedAt: new Date() },
      { new: true }
    );

    if (!fuelRecord) {
      throw new ApiError(404, 'Fuel record not found');
    }

    logger.info(`Fuel record deleted for truck ${fuelRecord.truckNo} by ${req.user?.username}`);

    res.status(200).json({
      success: true,
      message: 'Fuel record deleted successfully',
    });
  } catch (error: any) {
    throw error;
  }
};

/**
 * Get monthly fuel summary
 */
export const getMonthlyFuelSummary = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { month, year } = req.query;

    const filter: any = { isDeleted: false };
    
    if (month) {
      filter.month = { $regex: month, $options: 'i' };
    }

    const fuelRecords = await FuelRecord.find(filter).lean();

    // Calculate summary
    const summary = {
      totalRecords: fuelRecords.length,
      totalFuel: fuelRecords.reduce((sum, record) => sum + record.totalLts, 0),
      totalBalance: fuelRecords.reduce((sum, record) => sum + record.balance, 0),
      yardTotals: {
        mmsa: fuelRecords.reduce((sum, record) => sum + (record.mmsaYard || 0), 0),
        tanga: fuelRecords.reduce((sum, record) => sum + (record.tangaYard || 0), 0),
        dar: fuelRecords.reduce((sum, record) => sum + (record.darYard || 0), 0),
      },
    };

    res.status(200).json({
      success: true,
      message: 'Monthly fuel summary retrieved successfully',
      data: summary,
    });
  } catch (error: any) {
    throw error;
  }
};

/**
 * Get comprehensive details for a fuel record including all LPOs, delivery orders, and fuel allocations
 */
export const getFuelRecordDetails = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    // Get the fuel record
    const fuelRecord = await FuelRecord.findOne({ _id: id, isDeleted: false }).lean();

    if (!fuelRecord) {
      throw new ApiError(404, 'Fuel record not found');
    }

    // Import models we need
    const DeliveryOrder = require('../models').DeliveryOrder;
    const LPOEntry = require('../models').LPOEntry;
    const YardFuelDispense = require('../models').YardFuelDispense;

    // Get the going delivery order
    const goingDO = await DeliveryOrder.findOne({
      doNumber: fuelRecord.goingDo,
      isDeleted: false,
    }).lean();

    // Get the return delivery order (if exists)
    let returnDO = null;
    if (fuelRecord.returnDo) {
      returnDO = await DeliveryOrder.findOne({
        doNumber: fuelRecord.returnDo,
        isDeleted: false,
      }).lean();
    }

    // Get all LPO entries for this truck and either DO
    const lpoEntries = await LPOEntry.find({
      $or: [
        { doSdo: fuelRecord.goingDo },
        { doSdo: fuelRecord.returnDo },
        { truckNo: fuelRecord.truckNo }
      ],
      isDeleted: false,
    }).sort({ date: 1 }).lean();

    // Filter LPOs to only include those within the journey date range
    const journeyStartDate = new Date(fuelRecord.date);
    const filteredLPOs = lpoEntries.filter((lpo: any) => {
      const lpoDate = new Date(lpo.date);
      return lpoDate >= journeyStartDate;
    });

    // Get yard fuel dispenses for this truck
    const yardDispenses = await YardFuelDispense.find({
      $or: [
        { linkedDONumber: fuelRecord.goingDo },
        { linkedDONumber: fuelRecord.returnDo },
        { truckNo: fuelRecord.truckNo, linkedFuelRecordId: id }
      ],
      isDeleted: false,
    }).sort({ date: 1 }).lean();

    // Calculate fuel allocation summary
    const goingFuelAllocations = {
      tangaYard: fuelRecord.tangaYard || 0,
      darYard: fuelRecord.darYard || 0,
      darGoing: fuelRecord.darGoing || 0,
      moroGoing: fuelRecord.moroGoing || 0,
      mbeyaGoing: fuelRecord.mbeyaGoing || 0,
      tdmGoing: fuelRecord.tdmGoing || 0,
      zambiaGoing: fuelRecord.zambiaGoing || 0,
      congoFuel: fuelRecord.congoFuel || 0,
    };

    const returnFuelAllocations = {
      zambiaReturn: fuelRecord.zambiaReturn || 0,
      tundumaReturn: fuelRecord.tundumaReturn || 0,
      mbeyaReturn: fuelRecord.mbeyaReturn || 0,
      moroReturn: fuelRecord.moroReturn || 0,
      darReturn: fuelRecord.darReturn || 0,
      tangaReturn: fuelRecord.tangaReturn || 0,
    };

    // Compile comprehensive response
    const details = {
      fuelRecord: {
        ...fuelRecord,
        id: fuelRecord._id,
      },
      journeyInfo: {
        // Going journey info (original if EXPORT changed it)
        goingJourney: {
          from: fuelRecord.originalGoingFrom || fuelRecord.from,
          to: fuelRecord.originalGoingTo || fuelRecord.to,
          doNumber: fuelRecord.goingDo,
          start: fuelRecord.start,
          deliveryOrder: goingDO ? {
            ...goingDO,
            id: goingDO._id,
          } : null,
        },
        // Return journey info (if exists)
        returnJourney: fuelRecord.returnDo ? {
          from: fuelRecord.from, // Current from is the return journey from
          to: fuelRecord.to, // Current to is the return journey to
          doNumber: fuelRecord.returnDo,
          deliveryOrder: returnDO ? {
            ...returnDO,
            id: returnDO._id,
          } : null,
        } : null,
        // Current status
        isOnReturnJourney: !!fuelRecord.returnDo,
        hasDestinationChanged: !!(fuelRecord.originalGoingFrom || fuelRecord.originalGoingTo),
      },
      fuelAllocations: {
        total: fuelRecord.totalLts,
        extra: fuelRecord.extra || 0,
        balance: fuelRecord.balance,
        going: goingFuelAllocations,
        return: returnFuelAllocations,
        totalGoingFuel: Object.values(goingFuelAllocations).reduce((a, b) => a + Math.abs(b), 0),
        totalReturnFuel: Object.values(returnFuelAllocations).reduce((a, b) => a + Math.abs(b), 0),
      },
      lpoEntries: filteredLPOs.map((lpo: any) => ({
        ...lpo,
        id: lpo._id,
        journeyType: lpo.doSdo === fuelRecord.goingDo ? 'going' : 
                     lpo.doSdo === fuelRecord.returnDo ? 'return' : 'related',
      })),
      yardDispenses: yardDispenses.map((dispense: any) => ({
        ...dispense,
        id: dispense._id,
      })),
      summary: {
        totalLPOs: filteredLPOs.length,
        totalYardDispenses: yardDispenses.length,
        totalFuelOrdered: filteredLPOs.reduce((sum: number, lpo: any) => sum + (lpo.ltrs || 0), 0),
        totalYardFuel: yardDispenses.reduce((sum: number, d: any) => sum + (d.liters || 0), 0),
      },
    };

    res.status(200).json({
      success: true,
      message: 'Fuel record details retrieved successfully',
      data: details,
    });
  } catch (error: any) {
    throw error;
  }
};
