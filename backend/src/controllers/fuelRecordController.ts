import { Response } from 'express';
import { FuelRecord } from '../models';
import { ApiError } from '../middleware/errorHandler';
import { AuthRequest } from '../middleware/auth';
import { getPaginationParams, createPaginatedResponse, calculateSkip, logger, formatTruckNumber } from '../utils';
import { AuditService } from '../utils/auditService';
import { createMissingConfigNotification, autoResolveNotifications } from './notificationController';

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
 * Get fuel record by DO number (searches both goingDo and returnDo)
 * Returns the fuel record along with the detected direction
 */
export const getFuelRecordByGoingDO = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { doNumber } = req.params;

    // First try to find by goingDo
    let fuelRecord = await FuelRecord.findOne({
      goingDo: doNumber,
      isDeleted: false,
    });

    let direction: 'going' | 'returning' = 'going';

    // If not found as goingDo, try returnDo
    if (!fuelRecord) {
      fuelRecord = await FuelRecord.findOne({
        returnDo: doNumber,
        isDeleted: false,
      });
      direction = 'returning';
    }

    if (!fuelRecord) {
      throw new ApiError(404, 'Fuel record not found');
    }

    // Include direction in the response
    const responseData = {
      ...fuelRecord.toObject(),
      detectedDirection: direction
    };

    res.status(200).json({
      success: true,
      message: 'Fuel record retrieved successfully',
      data: responseData,
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
    // Format truck number to standard format
    if (req.body.truckNo) {
      req.body.truckNo = formatTruckNumber(req.body.truckNo);
    }
    
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

    // Log audit trail
    await AuditService.logCreate(
      req.user?.userId || 'system',
      req.user?.username || 'system',
      'FuelRecord',
      fuelRecord._id.toString(),
      { truckNo: fuelRecord.truckNo, goingDo: fuelRecord.goingDo, from: fuelRecord.from, to: fuelRecord.to },
      req.ip
    );

    // Check if configuration is missing and create notification
    if (fuelRecord.isLocked && fuelRecord.pendingConfigReason) {
      const missingFields: ('totalLiters' | 'extraFuel')[] = [];
      
      if (fuelRecord.pendingConfigReason === 'both') {
        missingFields.push('totalLiters', 'extraFuel');
      } else if (fuelRecord.pendingConfigReason === 'missing_total_liters') {
        missingFields.push('totalLiters');
      } else if (fuelRecord.pendingConfigReason === 'missing_extra_fuel') {
        missingFields.push('extraFuel');
      }

      // Extract truck suffix for notification
      const truckSuffix = fuelRecord.truckNo.split(' ').pop() || '';

      await createMissingConfigNotification(
        fuelRecord._id.toString(),
        missingFields,
        {
          doNumber: fuelRecord.goingDo,
          truckNo: fuelRecord.truckNo,
          destination: fuelRecord.to,
          truckSuffix,
        },
        req.user?.username || 'system'
      );

      logger.info(`Created notification for locked fuel record ${fuelRecord._id} - missing: ${missingFields.join(', ')}`);
    }

    // Auto-link any pending yard fuel entries for this truck
    try {
      const axios = require('axios');
      const response = await axios.post(
        'http://localhost:5000/api/yard-fuel/link-pending',
        {
          fuelRecordId: fuelRecord._id.toString(),
          truckNo: fuelRecord.truckNo,
          doNumber: fuelRecord.goingDo,
          date: fuelRecord.date,
        },
        {
          headers: {
            Authorization: req.headers.authorization,
          },
        }
      );

      if (response.data.data.linkedCount > 0) {
        logger.info(
          `Auto-linked ${response.data.data.linkedCount} pending yard fuel entry(ies) for truck ${fuelRecord.truckNo}`
        );
      }
    } catch (linkError: any) {
      // Don't fail the fuel record creation if linking fails
      logger.warn(`Failed to auto-link pending yard fuel for ${fuelRecord.truckNo}:`, linkError.message);
    }

    res.status(201).json({
      success: true,
      message: fuelRecord.isLocked 
        ? 'Fuel record created but locked - admin notification sent for missing configuration'
        : 'Fuel record created successfully',
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

    // Check if we're filling in missing configuration
    const existingRecord = await FuelRecord.findOne({ _id: id, isDeleted: false });
    if (!existingRecord) {
      throw new ApiError(404, 'Fuel record not found');
    }

    const wasLocked = existingRecord.isLocked;
    const fillingTotalLiters = existingRecord.totalLts === null && req.body.totalLts !== null && req.body.totalLts !== undefined;
    const fillingExtraFuel = existingRecord.extra === null && req.body.extra !== null && req.body.extra !== undefined;

    // Auto-unlock if all required fields are now provided
    if (wasLocked && (fillingTotalLiters || fillingExtraFuel)) {
      const willHaveTotalLts = fillingTotalLiters ? req.body.totalLts : existingRecord.totalLts;
      const willHaveExtra = fillingExtraFuel ? req.body.extra : existingRecord.extra;

      if (willHaveTotalLts !== null && willHaveExtra !== null) {
        req.body.isLocked = false;
        req.body.pendingConfigReason = null;
        
        // Recalculate balance if both values are now set
        req.body.balance = willHaveTotalLts + willHaveExtra;
      }
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

    // Log audit trail
    await AuditService.logUpdate(
      req.user?.userId || 'system',
      req.user?.username || 'system',
      'FuelRecord',
      fuelRecord._id.toString(),
      { truckNo: existingRecord.truckNo, goingDo: existingRecord.goingDo },
      { truckNo: fuelRecord.truckNo, goingDo: fuelRecord.goingDo, isLocked: fuelRecord.isLocked },
      req.ip
    );

    // Auto-resolve notifications if record was unlocked
    if (wasLocked && !fuelRecord.isLocked) {
      await autoResolveNotifications(id, req.user?.username || 'admin');
      logger.info(`Fuel record ${id} unlocked and notifications resolved`);
    }

    res.status(200).json({
      success: true,
      message: wasLocked && !fuelRecord.isLocked 
        ? 'Fuel record updated and unlocked successfully'
        : 'Fuel record updated successfully',
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

    // Log audit trail
    await AuditService.logDelete(
      req.user?.userId || 'system',
      req.user?.username || 'system',
      'FuelRecord',
      fuelRecord._id.toString(),
      { truckNo: fuelRecord.truckNo, goingDo: fuelRecord.goingDo },
      req.ip
    );

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
      totalFuel: fuelRecords.reduce((sum, record) => sum + (record.totalLts || 0), 0),
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
    const DriverAccountEntry = require('../models').DriverAccountEntry;
    const LPOSummary = require('../models').LPOSummary;

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

    // Get all LPO entries for this truck that are related to this journey
    // Use DO numbers as the primary reference since they are unique per journey
    // A journey has a goingDo (IMPORT) and optionally a returnDo (EXPORT)
    // LPOs are linked to the journey via the doSdo field matching either DO number
    
    const lpoQueryConditions: any[] = [
      { doSdo: fuelRecord.goingDo, truckNo: fuelRecord.truckNo }
    ];
    
    // Add returnDo condition if it exists - this covers LPOs created during the return journey
    if (fuelRecord.returnDo && fuelRecord.returnDo.trim() !== '') {
      lpoQueryConditions.push({ doSdo: fuelRecord.returnDo, truckNo: fuelRecord.truckNo });
    }
    
    const lpoEntries = await LPOEntry.find({
      $or: lpoQueryConditions,
      isDeleted: false,
    }).sort({ date: 1 }).lean();

    // Calculate journey date range for CASH/NIL DO entries
    // Journey starts from fuel record date and ends when balance reaches 0 or the last LPO date
    const journeyStartDate = new Date(fuelRecord.date);
    let journeyEndDate: Date;
    
    // Find the last LPO date to determine journey end
    if (lpoEntries.length > 0) {
      const lastLpoDate = new Date(lpoEntries[lpoEntries.length - 1].date);
      // Add buffer of 7 days after last LPO for any additional CASH entries
      journeyEndDate = new Date(lastLpoDate);
      journeyEndDate.setDate(journeyEndDate.getDate() + 7);
    } else {
      // If no LPOs found, use 60 days from start as maximum journey duration
      journeyEndDate = new Date(journeyStartDate);
      journeyEndDate.setDate(journeyEndDate.getDate() + 60);
    }
    
    // Also fetch CASH mode entries with NIL DO for this truck within the journey date range
    // These are additional fuel entries when:
    // 1. A station is out of fuel and driver gets fuel from another station via cash
    // 2. Driver gets extra fuel due to circumstances (theft, etc.)
    // These entries have doSdo = 'NIL' and destinations = 'NIL'
    const cashLpoEntries = await LPOEntry.find({
      truckNo: fuelRecord.truckNo,
      $or: [
        { doSdo: 'NIL' },
        { doSdo: 'nil' },
        { doSdo: '' },
        { destinations: 'NIL' },
        { destinations: 'nil' }
      ],
      date: { 
        $gte: journeyStartDate.toISOString().split('T')[0],
        $lte: journeyEndDate.toISOString().split('T')[0]
      },
      isDeleted: false,
    }).sort({ date: 1 }).lean();

    // Also fetch Driver Account LPO entries from LPO Summary
    // These are created when driver account entries are added
    const driverAccountLPOs = await LPOSummary.find({
      orderOf: 'DRIVER ACCOUNT',
      'entries.truckNo': fuelRecord.truckNo,
      date: { 
        $gte: journeyStartDate.toISOString().split('T')[0],
        $lte: journeyEndDate.toISOString().split('T')[0]
      },
      isDeleted: false,
    }).sort({ date: 1 }).lean();

    // Convert driver account LPO summaries to LPO entry format
    const driverAccountEntryFormat: any[] = [];
    for (const summary of driverAccountLPOs) {
      for (const entry of summary.entries) {
        if (entry.truckNo === fuelRecord.truckNo) {
          driverAccountEntryFormat.push({
            _id: entry._id,
            lpoNo: summary.lpoNo,
            date: summary.date,
            dieselAt: summary.station,
            doSdo: entry.doNo,  // This will be 'NIL'
            truckNo: entry.truckNo,
            ltrs: entry.liters,
            pricePerLtr: entry.rate,
            destinations: entry.dest,  // This will be 'NIL'
            isDriverAccount: true,
            originalDoNo: entry.originalDoNo,  // The reference DO
          });
        }
      }
    }

    // Combine regular LPO entries with CASH/NIL entries
    const allLpoEntries = [...lpoEntries];
    
    // Add CASH entries that aren't already included (check by _id to avoid duplicates)
    const existingIds = new Set(lpoEntries.map((e: any) => e._id?.toString()));
    for (const cashEntry of cashLpoEntries) {
      if (!existingIds.has(cashEntry._id?.toString())) {
        allLpoEntries.push(cashEntry);
      }
    }
    
    // Add driver account entries (with unique check)
    for (const daEntry of driverAccountEntryFormat) {
      if (!existingIds.has(daEntry._id?.toString())) {
        allLpoEntries.push(daEntry);
        existingIds.add(daEntry._id?.toString());
      }
    }
    
    // Sort combined entries by date
    allLpoEntries.sort((a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime());

    // Since we're using the unique DO numbers to fetch LPOs, all results are already 
    // specific to this journey - no additional date filtering needed
    const filteredLPOs = allLpoEntries;

    // Get yard fuel dispenses for this truck related to this journey
    // Use the same logic - DO numbers are the primary reference
    const yardQueryConditions: any[] = [
      { linkedDONumber: fuelRecord.goingDo },
      { truckNo: fuelRecord.truckNo, linkedFuelRecordId: id }
    ];
    
    if (fuelRecord.returnDo && fuelRecord.returnDo.trim() !== '') {
      yardQueryConditions.push({ linkedDONumber: fuelRecord.returnDo });
    }
    
    const yardDispenses = await YardFuelDispense.find({
      $or: yardQueryConditions,
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
      lpoEntries: filteredLPOs.map((lpo: any) => {
        // Determine journey type
        let journeyType: 'going' | 'return' | 'cash' | 'driver_account' | 'related';
        const isNilDo = !lpo.doSdo || lpo.doSdo === 'NIL' || lpo.doSdo === 'nil' || lpo.doSdo === '';
        const isNilDest = !lpo.destinations || lpo.destinations === 'NIL' || lpo.destinations === 'nil' || lpo.destinations === '';
        const isDriverAccount = lpo.isDriverAccount === true;
        
        if (isDriverAccount) {
          journeyType = 'driver_account'; // Driver's account entry
        } else if (isNilDo || isNilDest) {
          journeyType = 'cash'; // Cash mode payment (extra fuel or station out of fuel)
        } else if (lpo.doSdo === fuelRecord.goingDo) {
          journeyType = 'going';
        } else if (lpo.doSdo === fuelRecord.returnDo) {
          journeyType = 'return';
        } else {
          journeyType = 'related';
        }
        
        return {
          ...lpo,
          id: lpo._id,
          journeyType,
          isDriverAccount: lpo.isDriverAccount || false,
          originalDoNo: lpo.originalDoNo,  // Reference DO for driver account entries
        };
      }),
      yardDispenses: yardDispenses.map((dispense: any) => ({
        ...dispense,
        id: dispense._id,
      })),
      summary: {
        totalLPOs: filteredLPOs.length,
        totalYardDispenses: yardDispenses.length,
        totalFuelOrdered: filteredLPOs.reduce((sum: number, lpo: any) => sum + (lpo.ltrs || 0), 0),
        totalYardFuel: yardDispenses.reduce((sum: number, d: any) => sum + (d.liters || 0), 0),
        // Count by journey type
        goingLPOs: filteredLPOs.filter((lpo: any) => lpo.doSdo === fuelRecord.goingDo).length,
        returnLPOs: filteredLPOs.filter((lpo: any) => lpo.doSdo === fuelRecord.returnDo).length,
        cashLPOs: filteredLPOs.filter((lpo: any) => {
          const isNilDo = !lpo.doSdo || lpo.doSdo === 'NIL' || lpo.doSdo === 'nil' || lpo.doSdo === '';
          return isNilDo && !lpo.isDriverAccount;
        }).length,
        driverAccountLPOs: filteredLPOs.filter((lpo: any) => lpo.isDriverAccount === true).length,
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
