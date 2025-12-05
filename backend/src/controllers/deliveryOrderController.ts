import { Response } from 'express';
import { DeliveryOrder, FuelRecord, LPOEntry } from '../models';
import { ApiError } from '../middleware/errorHandler';
import { AuthRequest } from '../middleware/auth';
import { getPaginationParams, createPaginatedResponse, calculateSkip, logger } from '../utils';
import { addMonthlySummarySheets } from '../utils/monthlySheetGenerator';
import ExcelJS from 'exceljs';
import path from 'path';
import fs from 'fs';

// Month names for sheet naming
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

/**
 * Helper: Cascade updates to related fuel records when DO is edited
 * Note: SDO orders are excluded - they don't interact with fuel records
 */
const cascadeUpdateToFuelRecord = async (
  originalDO: any,
  updatedData: any,
  username: string
): Promise<{ updated: boolean; fuelRecordId?: string; changes?: string[] }> => {
  const changes: string[] = [];
  
  try {
    // Skip cascade for SDO - they don't interact with fuel records
    if (originalDO.doType === 'SDO') {
      logger.info(`Skipping fuel record cascade for SDO ${originalDO.doNumber}`);
      return { updated: false };
    }
    
    // Find fuel record linked to this DO
    let fuelRecord = null;
    
    if (originalDO.importOrExport === 'IMPORT') {
      // Find fuel record where this DO is the goingDo
      fuelRecord = await FuelRecord.findOne({
        goingDo: originalDO.doNumber,
        isDeleted: false,
      });
    } else if (originalDO.importOrExport === 'EXPORT') {
      // Find fuel record where this DO is the returnDo
      fuelRecord = await FuelRecord.findOne({
        returnDo: originalDO.doNumber,
        isDeleted: false,
      });
    }
    
    if (!fuelRecord) {
      logger.info(`No fuel record found for DO ${originalDO.doNumber}`);
      return { updated: false };
    }
    
    const updates: any = {};
    
    // Track truck number changes
    if (updatedData.truckNo && updatedData.truckNo !== originalDO.truckNo) {
      updates.truckNo = updatedData.truckNo;
      changes.push(`Truck: ${originalDO.truckNo} → ${updatedData.truckNo}`);
    }
    
    // Track destination changes (affects 'to' field for IMPORT, 'from' for EXPORT)
    if (updatedData.destination && updatedData.destination !== originalDO.destination) {
      if (originalDO.importOrExport === 'IMPORT') {
        updates.to = updatedData.destination;
        changes.push(`Destination (to): ${originalDO.destination} → ${updatedData.destination}`);
      } else {
        updates.from = updatedData.destination;
        changes.push(`Destination (from): ${originalDO.destination} → ${updatedData.destination}`);
      }
    }
    
    // Track loading point changes (affects 'from' field for IMPORT, 'to' for EXPORT)
    if (updatedData.loadingPoint && updatedData.loadingPoint !== originalDO.loadingPoint) {
      if (originalDO.importOrExport === 'IMPORT') {
        updates.from = updatedData.loadingPoint;
        changes.push(`Loading Point (from): ${originalDO.loadingPoint} → ${updatedData.loadingPoint}`);
      } else {
        updates.to = updatedData.loadingPoint;
        changes.push(`Loading Point (to): ${originalDO.loadingPoint} → ${updatedData.loadingPoint}`);
      }
    }
    
    // Apply updates if any
    if (Object.keys(updates).length > 0) {
      await FuelRecord.findByIdAndUpdate(fuelRecord._id, updates);
      logger.info(`Fuel record ${fuelRecord._id} updated due to DO changes: ${changes.join(', ')}`);
      return { updated: true, fuelRecordId: fuelRecord._id.toString(), changes };
    }
    
    return { updated: false };
  } catch (error: any) {
    logger.error(`Error cascading update to fuel record: ${error.message}`);
    return { updated: false };
  }
};

/**
 * Helper: Cancel fuel record when DO is cancelled
 * Note: SDO orders are excluded - they don't interact with fuel records
 */
const cascadeCancelFuelRecord = async (
  deliveryOrder: any,
  cancellationReason: string,
  username: string
): Promise<{ cancelled: boolean; fuelRecordId?: string; action?: string }> => {
  try {
    // Skip cascade for SDO - they don't interact with fuel records
    if (deliveryOrder.doType === 'SDO') {
      logger.info(`Skipping fuel record cascade cancel for SDO ${deliveryOrder.doNumber}`);
      return { cancelled: false };
    }
    
    // Find fuel record linked to this DO
    let fuelRecord = null;
    
    if (deliveryOrder.importOrExport === 'IMPORT') {
      // Find fuel record where this DO is the goingDo
      fuelRecord = await FuelRecord.findOne({
        goingDo: deliveryOrder.doNumber,
        isDeleted: false,
        isCancelled: { $ne: true },
      });
      
      if (!fuelRecord) {
        logger.info(`No fuel record found for cancelled IMPORT DO ${deliveryOrder.doNumber}`);
        return { cancelled: false };
      }
      
      // IMPORT DO (going DO) is cancelled - cancel the entire fuel record
      // The going DO is the primary journey, without it the fuel record has no purpose
      await FuelRecord.findByIdAndUpdate(fuelRecord._id, {
        isCancelled: true,
        cancelledAt: new Date(),
        cancellationReason: `Going DO ${deliveryOrder.doNumber} cancelled: ${cancellationReason}`,
        cancelledBy: username,
      });
      
      logger.info(`Fuel record ${fuelRecord._id} fully cancelled due to going DO ${deliveryOrder.doNumber} cancellation. Reason: ${cancellationReason}`);
      
      return { cancelled: true, fuelRecordId: fuelRecord._id.toString(), action: 'fully_cancelled' };
      
    } else if (deliveryOrder.importOrExport === 'EXPORT') {
      // Find fuel record where this DO is the returnDo
      fuelRecord = await FuelRecord.findOne({
        returnDo: deliveryOrder.doNumber,
        isDeleted: false,
        isCancelled: { $ne: true },
      });
      
      if (!fuelRecord) {
        logger.info(`No fuel record found for cancelled EXPORT DO ${deliveryOrder.doNumber}`);
        return { cancelled: false };
      }
      
      // EXPORT DO (return DO) is cancelled
      // The fuel record still has the going DO, so we don't cancel the whole record
      // Instead, we remove the return DO and revert from/to to use going DO values only
      
      // Get the original going journey values (stored when the return DO was added)
      // If not available, we use the current goingDo to look up the original values
      let revertFrom = fuelRecord.originalGoingFrom;
      let revertTo = fuelRecord.originalGoingTo;
      
      // If original values weren't stored, try to get from the going DO
      if (!revertFrom || !revertTo) {
        const goingDO = await DeliveryOrder.findOne({
          doNumber: fuelRecord.goingDo,
          isDeleted: false,
        });
        
        if (goingDO) {
          revertFrom = goingDO.destination; // For IMPORT, from is destination (e.g., Zambia)
          revertTo = goingDO.loadingPoint; // For IMPORT, to is loading point (e.g., Dar)
        } else {
          // Fallback: Keep current from, just remove to extension
          revertFrom = fuelRecord.from;
          revertTo = fuelRecord.to;
        }
      }
      
      // Clear all return fuel allocations
      const updateData: any = {
        returnDo: null, // Remove the return DO
        from: revertFrom,
        to: revertTo,
        // Clear original going values since there's no return DO now
        originalGoingFrom: null,
        originalGoingTo: null,
        // Clear return fuel allocations
        zambiaReturn: 0,
        tundumaReturn: 0,
        mbeyaReturn: 0,
        moroReturn: 0,
        darReturn: 0,
        tangaReturn: 0,
      };
      
      await FuelRecord.findByIdAndUpdate(fuelRecord._id, updateData);
      
      logger.info(`Fuel record ${fuelRecord._id} return DO ${deliveryOrder.doNumber} removed and reverted to going-only journey. From: ${revertFrom}, To: ${revertTo}. Reason: ${cancellationReason}`);
      
      return { cancelled: true, fuelRecordId: fuelRecord._id.toString(), action: 'return_do_removed' };
    }
    
    return { cancelled: false };
  } catch (error: any) {
    logger.error(`Error cascading cancel to fuel record: ${error.message}`);
    return { cancelled: false };
  }
};

/**
 * Helper: Update LPO entries when DO is edited or cancelled
 * Note: This function works for both DO and SDO since LPOs can be linked to either
 */
const cascadeToLPOEntries = async (
  doNumber: string,
  action: 'update' | 'cancel',
  updates?: { truckNo?: string; destination?: string }
): Promise<{ count: number }> => {
  try {
    if (action === 'cancel') {
      // Mark LPO entries as cancelled
      const result = await LPOEntry.updateMany(
        { doSdo: doNumber, isDeleted: false },
        { 
          isDeleted: true, 
          deletedAt: new Date() 
        }
      );
      logger.info(`Cancelled ${result.modifiedCount} LPO entries for DO ${doNumber}`);
      return { count: result.modifiedCount };
    } else if (action === 'update' && updates) {
      // Update LPO entries with new values
      const updateFields: any = {};
      if (updates.truckNo) updateFields.truckNo = updates.truckNo;
      if (updates.destination) updateFields.destinations = updates.destination;
      
      if (Object.keys(updateFields).length > 0) {
        const result = await LPOEntry.updateMany(
          { doSdo: doNumber, isDeleted: false },
          updateFields
        );
        logger.info(`Updated ${result.modifiedCount} LPO entries for DO ${doNumber}`);
        return { count: result.modifiedCount };
      }
    }
    return { count: 0 };
  } catch (error: any) {
    logger.error(`Error cascading to LPO entries: ${error.message}`);
    return { count: 0 };
  }
};

/**
 * Get all delivery orders with pagination and filters
 */
export const getAllDeliveryOrders = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { page, limit, sort, order } = getPaginationParams(req.query);
    const { dateFrom, dateTo, clientName, truckNo, importOrExport, destination, doType } = req.query;

    // Build filter
    const filter: any = { isDeleted: false };
    
    // Filter by doType if specified (DO or SDO), otherwise return all
    if (doType && (doType === 'DO' || doType === 'SDO')) {
      filter.doType = doType;
    }

    if (dateFrom || dateTo) {
      filter.date = {};
      if (dateFrom) filter.date.$gte = dateFrom;
      if (dateTo) filter.date.$lte = dateTo;
    }

    if (clientName) {
      filter.clientName = { $regex: clientName, $options: 'i' };
    }

    if (truckNo) {
      filter.truckNo = { $regex: truckNo, $options: 'i' };
    }

    if (importOrExport && importOrExport !== 'ALL') {
      filter.importOrExport = importOrExport;
    }

    if (destination) {
      filter.destination = { $regex: destination, $options: 'i' };
    }

    // Get data with pagination
    const skip = calculateSkip(page, limit);
    const sortOrder = order === 'asc' ? 1 : -1;

    const [deliveryOrders, total] = await Promise.all([
      DeliveryOrder.find(filter)
        .sort({ [sort]: sortOrder })
        .skip(skip)
        .limit(limit)
        .lean(),
      DeliveryOrder.countDocuments(filter),
    ]);

    const response = createPaginatedResponse(deliveryOrders, page, limit, total);

    res.status(200).json({
      success: true,
      message: 'Delivery orders retrieved successfully',
      data: response,
    });
  } catch (error: any) {
    throw error;
  }
};

/**
 * Get single delivery order by ID
 */
export const getDeliveryOrderById = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const deliveryOrder = await DeliveryOrder.findOne({ _id: id, isDeleted: false });

    if (!deliveryOrder) {
      throw new ApiError(404, 'Delivery order not found');
    }

    res.status(200).json({
      success: true,
      message: 'Delivery order retrieved successfully',
      data: deliveryOrder,
    });
  } catch (error: any) {
    throw error;
  }
};

/**
 * Create new delivery order
 */
export const createDeliveryOrder = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    // If sn is not provided, derive it from doNumber
    if (!req.body.sn && req.body.doNumber) {
      req.body.sn = parseInt(req.body.doNumber.replace(/^0+/, '')) || 1;
    }
    
    // Set defaults for new fields if not provided
    if (!req.body.rateType) {
      req.body.rateType = 'per_ton';
    }
    if (!req.body.cargoType && req.body.containerNo) {
      req.body.cargoType = req.body.containerNo?.toLowerCase().includes('container') 
        ? 'container' 
        : 'loosecargo';
    } else if (!req.body.cargoType) {
      req.body.cargoType = 'loosecargo';
    }
    
    // Calculate totalAmount if not provided
    if (!req.body.totalAmount) {
      if (req.body.rateType === 'per_ton') {
        req.body.totalAmount = (req.body.tonnages || 0) * (req.body.ratePerTon || 0);
      } else if (req.body.rateType === 'fixed_total') {
        req.body.totalAmount = req.body.ratePerTon || 0;
      }
    }
    
    const deliveryOrder = await DeliveryOrder.create(req.body);

    logger.info(`Delivery order created: ${deliveryOrder.doNumber} by ${req.user?.username}`);

    res.status(201).json({
      success: true,
      message: 'Delivery order created successfully',
      data: deliveryOrder,
    });
  } catch (error: any) {
    throw error;
  }
};

/**
 * Update delivery order with cascade updates to related records
 */
export const updateDeliveryOrder = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const username = req.user?.username || 'system';

    // Get the original DO first to track changes
    const originalDO = await DeliveryOrder.findOne({ _id: id, isDeleted: false }).lean();

    if (!originalDO) {
      throw new ApiError(404, 'Delivery order not found');
    }

    // Check if DO is cancelled
    if (originalDO.isCancelled) {
      throw new ApiError(400, 'Cannot edit a cancelled delivery order');
    }

    // Track changes for edit history
    const trackableFields = ['truckNo', 'trailerNo', 'loadingPoint', 'destination', 'tonnages', 'ratePerTon', 'driverName', 'clientName', 'containerNo'];
    const changes: { field: string; oldValue: any; newValue: any }[] = [];

    for (const field of trackableFields) {
      if (req.body[field] !== undefined && req.body[field] !== (originalDO as any)[field]) {
        changes.push({
          field,
          oldValue: (originalDO as any)[field],
          newValue: req.body[field],
        });
      }
    }

    // Prepare the update data with edit history
    const updateData = {
      ...req.body,
      lastEditedAt: new Date(),
      lastEditedBy: username,
    };

    // Add to edit history if there are changes
    if (changes.length > 0) {
      updateData.$push = {
        editHistory: {
          editedAt: new Date(),
          editedBy: username,
          changes,
          reason: req.body.editReason || undefined,
        },
      };
      // Remove editReason from the main update
      delete updateData.editReason;
    }

    // Update the delivery order
    const deliveryOrder = await DeliveryOrder.findOneAndUpdate(
      { _id: id, isDeleted: false },
      updateData,
      { new: true, runValidators: true }
    );

    if (!deliveryOrder) {
      throw new ApiError(404, 'Delivery order not found');
    }

    // Cascade updates to related records
    const cascadeResults = {
      fuelRecordUpdated: false,
      fuelRecordChanges: [] as string[],
      lpoEntriesUpdated: 0,
    };

    // Cascade to fuel records if relevant fields changed
    if (changes.some(c => ['truckNo', 'destination', 'loadingPoint'].includes(c.field))) {
      const fuelResult = await cascadeUpdateToFuelRecord(originalDO, req.body, username);
      cascadeResults.fuelRecordUpdated = fuelResult.updated;
      cascadeResults.fuelRecordChanges = fuelResult.changes || [];
    }

    // Cascade to LPO entries if truck or destination changed
    if (changes.some(c => ['truckNo', 'destination'].includes(c.field))) {
      const lpoResult = await cascadeToLPOEntries(originalDO.doNumber, 'update', {
        truckNo: req.body.truckNo,
        destination: req.body.destination,
      });
      cascadeResults.lpoEntriesUpdated = lpoResult.count;
    }

    logger.info(`Delivery order updated: ${deliveryOrder.doNumber} by ${username}. Changes: ${JSON.stringify(changes)}`);

    res.status(200).json({
      success: true,
      message: 'Delivery order updated successfully',
      data: deliveryOrder,
      cascadeResults,
    });
  } catch (error: any) {
    throw error;
  }
};

/**
 * Cancel delivery order (not delete - keeps it in records)
 */
export const cancelDeliveryOrder = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    const username = req.user?.username || 'system';
    const cancellationReason = reason?.trim() || 'Cancelled by user';

    // Get the original DO
    const originalDO = await DeliveryOrder.findOne({ _id: id, isDeleted: false });

    if (!originalDO) {
      throw new ApiError(404, 'Delivery order not found');
    }

    if (originalDO.isCancelled) {
      throw new ApiError(400, 'Delivery order is already cancelled');
    }

    // Update the DO with cancellation status
    const deliveryOrder = await DeliveryOrder.findByIdAndUpdate(
      id,
      {
        status: 'cancelled',
        isCancelled: true,
        cancelledAt: new Date(),
        cancellationReason: cancellationReason,
        cancelledBy: username,
        $push: {
          editHistory: {
            editedAt: new Date(),
            editedBy: username,
            changes: [{ field: 'status', oldValue: 'active', newValue: 'cancelled' }],
            reason: cancellationReason,
          },
        },
      },
      { new: true }
    );

    if (!deliveryOrder) {
      throw new ApiError(404, 'Delivery order not found');
    }

    // Cascade cancellation to related records
    const cascadeResults: {
      fuelRecordCancelled: boolean;
      fuelRecordId: string;
      fuelRecordAction: string;
      lpoEntriesCancelled: number;
    } = {
      fuelRecordCancelled: false,
      fuelRecordId: '',
      fuelRecordAction: '', // 'fully_cancelled' or 'return_do_removed'
      lpoEntriesCancelled: 0,
    };

    // Cancel related fuel record
    const fuelResult = await cascadeCancelFuelRecord(deliveryOrder, cancellationReason, username);
    cascadeResults.fuelRecordCancelled = fuelResult.cancelled;
    cascadeResults.fuelRecordId = fuelResult.fuelRecordId || '';
    cascadeResults.fuelRecordAction = fuelResult.action || '';

    // Cancel related LPO entries
    const lpoResult = await cascadeToLPOEntries(deliveryOrder.doNumber, 'cancel');
    cascadeResults.lpoEntriesCancelled = lpoResult.count;

    // Generate appropriate message based on what happened
    let message = 'Delivery order cancelled successfully';
    if (fuelResult.action === 'fully_cancelled') {
      message += '. Associated fuel record was fully cancelled.';
    } else if (fuelResult.action === 'return_do_removed') {
      message += '. Return DO removed from fuel record (going journey preserved).';
    }

    logger.info(`Delivery order cancelled: ${deliveryOrder.doNumber} by ${username}. Reason: ${reason}. Fuel action: ${fuelResult.action}`);

    res.status(200).json({
      success: true,
      message,
      data: deliveryOrder,
      cascadeResults,
    });
  } catch (error: any) {
    throw error;
  }
};

/**
 * Soft delete delivery order
 */
export const deleteDeliveryOrder = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const deliveryOrder = await DeliveryOrder.findByIdAndUpdate(
      id,
      { isDeleted: true, deletedAt: new Date() },
      { new: true }
    );

    if (!deliveryOrder) {
      throw new ApiError(404, 'Delivery order not found');
    }

    logger.info(`Delivery order deleted: ${deliveryOrder.doNumber} by ${req.user?.username}`);

    res.status(200).json({
      success: true,
      message: 'Delivery order deleted successfully',
    });
  } catch (error: any) {
    throw error;
  }
};

/**
 * Get delivery orders by truck number
 */
export const getDeliveryOrdersByTruck = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { truckNo } = req.params;

    const deliveryOrders = await DeliveryOrder.find({
      truckNo: { $regex: truckNo, $options: 'i' },
      isDeleted: false,
    }).sort({ date: -1 });

    res.status(200).json({
      success: true,
      message: 'Delivery orders retrieved successfully',
      data: deliveryOrders,
    });
  } catch (error: any) {
    throw error;
  }
};

/**
 * Get current journey for a truck
 * Returns the most recent journey (going DO + returning DO if available)
 */
export const getCurrentJourneyByTruck = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { truckNo } = req.params;

    // Get all DOs for this truck, sorted by date descending (most recent first)
    const deliveryOrders = await DeliveryOrder.find({
      truckNo: { $regex: truckNo, $options: 'i' },
      isDeleted: false,
    }).sort({ date: -1 }).lean();

    if (deliveryOrders.length === 0) {
      res.status(200).json({
        success: true,
        message: 'No journey found for this truck',
        data: {
          currentJourney: null,
          journeyPhase: 'none',
          goingDO: null,
          returningDO: null,
        },
      });
      return;
    }

    // Determine current journey based on most recent DO
    const mostRecentDO = deliveryOrders[0];
    let goingDO: any = null;
    let returningDO: any = null;
    let journeyPhase: 'going' | 'returning' | 'none' = 'none';

    if (mostRecentDO.importOrExport === 'IMPORT') {
      // Most recent is IMPORT - driver is on the going leg
      goingDO = mostRecentDO;
      journeyPhase = 'going';
    } else if (mostRecentDO.importOrExport === 'EXPORT') {
      // Most recent is EXPORT - driver is on the returning leg
      returningDO = mostRecentDO;
      journeyPhase = 'returning';
      
      // Find the associated IMPORT (the most recent IMPORT before or on the same date as this EXPORT)
      const mostRecentExportDate = new Date(mostRecentDO.date);
      const associatedImport = deliveryOrders.find((d: any) => {
        if (d.importOrExport !== 'IMPORT') return false;
        const importDate = new Date(d.date);
        // IMPORT should be on or before the EXPORT date
        return importDate <= mostRecentExportDate;
      });
      
      if (associatedImport) {
        goingDO = associatedImport;
      }
    }

    // Get the DO numbers for the current journey
    const journeyDONumbers: string[] = [];
    if (goingDO?.doNumber) journeyDONumbers.push(goingDO.doNumber);
    if (returningDO?.doNumber) journeyDONumbers.push(returningDO.doNumber);

    res.status(200).json({
      success: true,
      message: 'Current journey retrieved successfully',
      data: {
        journeyPhase,
        goingDO,
        returningDO,
        journeyDONumbers,
        allDeliveryOrders: deliveryOrders, // Include all for reference
      },
    });
  } catch (error: any) {
    throw error;
  }
};

/**
 * Get next DO number based on type (DO or SDO)
 * Returns the next sequential number after the highest existing one
 */
export const getNextDONumber = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const doType = (req.query.doType as string) || 'DO';
    
    // Find the last DO/SDO by doNumber (which is stored as padded string like "0001")
    // Filter by doType to get separate sequences for DO and SDO
    const lastDO = await DeliveryOrder.findOne({ 
      doType,
      isDeleted: false 
    })
      .sort({ sn: -1 })
      .limit(1)
      .lean();

    const nextSN = lastDO ? lastDO.sn + 1 : 1;

    res.status(200).json({
      success: true,
      message: `Next ${doType} number retrieved successfully`,
      data: { nextSN, doType },
    });
  } catch (error: any) {
    throw error;
  }
};

/**
 * Get all unique trucks with their latest DO information
 */
export const getAllTrucks = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    // Get all unique truck numbers with their latest DO information
    const trucks = await DeliveryOrder.aggregate([
      { $match: { isDeleted: false } },
      { $sort: { date: -1 } },
      {
        $group: {
          _id: '$truckNo',
          truckNo: { $first: '$truckNo' },
          lastDO: { $first: '$doNumber' },
          lastUpdate: { $first: '$date' },
        },
      },
      { $sort: { truckNo: 1 } },
      {
        $project: {
          _id: 0,
          truckNo: 1,
          lastDO: 1,
          lastUpdate: 1,
        },
      },
    ]);

    res.status(200).json({
      success: true,
      message: 'Trucks retrieved successfully',
      data: { trucks },
    });
  } catch (error: any) {
    throw error;
  }
};

/**
 * Get all DO workbooks (one per year)
 */
export const getAllWorkbooks = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    // Get distinct years from delivery orders (DO type only)
    const years = await DeliveryOrder.distinct('date', { 
      isDeleted: false,
      doType: 'DO'
    });
    
    // Extract unique years from dates (format: YYYY-MM-DD)
    const uniqueYears = [...new Set(
      years
        .map(date => {
          const year = parseInt(date.split('-')[0], 10);
          return isNaN(year) ? null : year;
        })
        .filter(year => year !== null && year >= 2000 && year <= 2100)
    )].sort((a, b) => (b as number) - (a as number));

    // Build workbook data for each year
    const workbooks = await Promise.all(
      uniqueYears.map(async (year) => {
        const yearStart = `${year}-01-01`;
        const yearEnd = `${year}-12-31`;
        
        const count = await DeliveryOrder.countDocuments({
          isDeleted: false,
          doType: 'DO',
          date: { $gte: yearStart, $lte: yearEnd }
        });

        // Count months with data
        const monthsWithData = await DeliveryOrder.aggregate([
          {
            $match: {
              isDeleted: false,
              doType: 'DO',
              date: { $gte: yearStart, $lte: yearEnd }
            }
          },
          {
            $group: {
              _id: { $substr: ['$date', 5, 2] }
            }
          }
        ]);

        return {
          id: year,
          year,
          name: `DELIVERY ORDERS ${year}`,
          sheetCount: monthsWithData.length,
          totalDOs: count,
        };
      })
    );

    res.status(200).json({
      success: true,
      message: 'DO workbooks retrieved successfully',
      data: workbooks,
    });
  } catch (error: any) {
    throw error;
  }
};

/**
 * Get workbook by year with monthly sheets
 */
export const getWorkbookByYear = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const year = parseInt(req.params.year, 10);

    if (isNaN(year)) {
      throw new ApiError(400, 'Invalid year');
    }

    const yearStart = `${year}-01-01`;
    const yearEnd = `${year}-12-31`;

    // Get all DOs for the year - each DO is its own sheet
    const deliveryOrders = await DeliveryOrder.find({
      isDeleted: false,
      doType: 'DO',
      date: { $gte: yearStart, $lte: yearEnd }
    }).sort({ date: 1, doNumber: 1 }).lean();

    // Each DO is a sheet (like LPO workbook)
    const workbook = {
      id: year,
      year,
      name: `DELIVERY ORDERS ${year}`,
      sheetCount: deliveryOrders.length,
      sheets: deliveryOrders.map(order => ({
        ...order,
        workbookId: year,
        isActive: true
      })),
    };

    res.status(200).json({
      success: true,
      message: 'DO workbook retrieved successfully',
      data: workbook,
    });
  } catch (error: any) {
    throw error;
  }
};

/**
 * Get available years for DO workbooks
 */
export const getAvailableYears = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const years = await DeliveryOrder.distinct('date', { 
      isDeleted: false,
      doType: 'DO'
    });
    
    const uniqueYears = [...new Set(
      years
        .map(date => {
          const year = parseInt(date.split('-')[0], 10);
          return isNaN(year) ? null : year;
        })
        .filter(year => year !== null && year >= 2000 && year <= 2100)
    )].sort((a, b) => (b as number) - (a as number));

    res.status(200).json({
      success: true,
      message: 'Available years retrieved successfully',
      data: uniqueYears,
    });
  } catch (error: any) {
    throw error;
  }
};

/**
 * Export DO workbook as Excel file with logo and formatting
 */
export const exportWorkbook = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const year = parseInt(req.params.year, 10);

    if (isNaN(year)) {
      throw new ApiError(400, 'Invalid year');
    }

    const yearStart = `${year}-01-01`;
    const yearEnd = `${year}-12-31`;

    // Get all DOs for the year
    const deliveryOrders = await DeliveryOrder.find({
      isDeleted: false,
      doType: 'DO',
      date: { $gte: yearStart, $lte: yearEnd }
    }).sort({ date: 1, doNumber: 1 }).lean();

    if (deliveryOrders.length === 0) {
      throw new ApiError(404, 'No delivery orders found for this year');
    }

    // Create Excel workbook
    const excelWorkbook = new ExcelJS.Workbook();
    excelWorkbook.creator = 'Fuel Order System';
    excelWorkbook.created = new Date();

    // Load logo image
    let logoId: number | null = null;
    const logoPath = path.join(__dirname, '../../assets/logo.png');
    if (fs.existsSync(logoPath)) {
      logoId = excelWorkbook.addImage({
        filename: logoPath,
        extension: 'png',
      });
    }

    // Create individual sheets for each DO FIRST (like LPO workbook)
    for (const order of deliveryOrders) {
      // Sheet name: DO number (max 31 chars for Excel) - add CANCELLED prefix if cancelled
      const sheetName = order.isCancelled 
        ? `X-${(order.doNumber || 'DO').substring(0, 28)}` 
        : (order.doNumber || 'DO').substring(0, 31);
      const sheet = excelWorkbook.addWorksheet(sheetName);

      // Format date
      const formatDate = (dateString: string) => {
        if (!dateString) return new Date().toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
        const date = new Date(dateString);
        return date.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
      };

      // Set column widths for delivery note format
      sheet.getColumn(1).width = 3;
      sheet.getColumn(2).width = 15;
      sheet.getColumn(3).width = 15;
      sheet.getColumn(4).width = 15;
      sheet.getColumn(5).width = 15;
      sheet.getColumn(6).width = 15;
      sheet.getColumn(7).width = 15;
      sheet.getColumn(8).width = 3;

      // Add logo
      if (logoId !== null) {
        sheet.addImage(logoId, {
          tl: { col: 5, row: 0 },
          ext: { width: 140, height: 70 },
        });
      }

      // Add CANCELLED watermark for cancelled orders
      if (order.isCancelled) {
        sheet.mergeCells('B1:G1');
        sheet.getCell('B1').value = '*** CANCELLED ***';
        sheet.getCell('B1').font = { bold: true, size: 16, color: { argb: 'FFDC2626' } };
        sheet.getCell('B1').alignment = { horizontal: 'center' };
        sheet.getCell('B1').fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFFEE2E2' },
        };
      }

      // Row 1-2: Company name (adjusted for cancelled orders)
      const companyRow = order.isCancelled ? 'B2:D3' : 'B1:D2';
      sheet.mergeCells(companyRow);
      sheet.getCell(order.isCancelled ? 'B2' : 'B1').value = 'TAHMEED';
      sheet.getCell(order.isCancelled ? 'B2' : 'B1').font = { bold: true, size: 24, color: { argb: 'FFE67E22' } };

      // Row 3: Website
      const websiteRow = order.isCancelled ? 4 : 3;
      sheet.getCell(`B${websiteRow}`).value = 'www.tahmeedcoach.co.ke';
      sheet.getCell(`B${websiteRow}`).font = { size: 9 };

      // Row 4: Email
      const emailRow = order.isCancelled ? 5 : 4;
      sheet.getCell(`B${emailRow}`).value = 'Email: info@tahmeedcoach.co.ke';
      sheet.getCell(`B${emailRow}`).font = { size: 9 };

      // Row 5: Tel
      const telRow = order.isCancelled ? 6 : 5;
      sheet.getCell(`B${telRow}`).value = 'Tel: +254 700 000 000';
      sheet.getCell(`B${telRow}`).font = { size: 9 };

      // Row 7: Title
      sheet.mergeCells('B7:G7');
      sheet.getCell('B7').value = 'DELIVERY NOTE GOODS RECEIVED NOTE';
      sheet.getCell('B7').font = { bold: true, size: 14 };
      sheet.getCell('B7').alignment = { horizontal: 'center' };
      sheet.getCell('B7').border = {
        top: { style: 'medium' },
        bottom: { style: 'medium' },
      };

      // Row 9: DO Number and Date
      sheet.mergeCells('B9:D9');
      sheet.getCell('B9').value = `${order.doType || 'DO'} #: ${order.doNumber}`;
      sheet.getCell('B9').font = { bold: true, size: 12 };
      sheet.getCell('D9').font = { color: { argb: 'FFDC3545' } };

      sheet.mergeCells('E9:G9');
      sheet.getCell('E9').value = `Date: ${formatDate(order.date)}`;
      sheet.getCell('E9').font = { bold: true };
      sheet.getCell('E9').alignment = { horizontal: 'right' };

      // Row 11: TO
      sheet.getCell('B11').value = 'TO:';
      sheet.getCell('B11').font = { bold: true };
      sheet.getCell('C11').value = order.clientName;
      sheet.getCell('C11').font = { bold: true };

      // Row 12: Description
      sheet.mergeCells('B12:G12');
      sheet.getCell('B12').value = 'Please receive the under mentioned containers/Packages ex.m.v';
      sheet.getCell('B12').font = { size: 9 };

      // Row 13: MPRO and POL
      sheet.getCell('B13').value = `MPRO NO: ${order.invoiceNos || ''}`;
      sheet.getCell('D13').value = `POL: ${order.loadingPoint}`;

      // Row 14: Arrive
      sheet.getCell('E13').value = `Arrive: ${order.importOrExport === 'IMPORT' ? 'TANGA/DAR' : order.loadingPoint}`;

      // Row 15: Destination
      sheet.getCell('B15').value = 'For Destination:';
      sheet.getCell('B15').font = { bold: true };
      sheet.getCell('C15').value = order.destination;
      sheet.getCell('C15').font = { bold: true };

      // Row 16: Haulier
      sheet.getCell('B16').value = 'Haulier:';
      sheet.getCell('B16').font = { bold: true };
      sheet.getCell('C16').value = order.haulier;
      sheet.getCell('C16').font = { bold: true };

      // Row 15: Lorry No
      sheet.getCell('E15').value = 'Lorry No:';
      sheet.getCell('E15').font = { bold: true };
      sheet.getCell('F15').value = order.truckNo;
      sheet.getCell('F15').font = { bold: true };

      // Row 16: Trailer No
      sheet.getCell('E16').value = 'Trailer No:';
      sheet.getCell('E16').font = { bold: true };
      sheet.getCell('F16').value = order.trailerNo;
      sheet.getCell('F16').font = { bold: true };

      // Row 18: Items Table Header
      const tableHeaderRow = sheet.getRow(18);
      tableHeaderRow.values = ['', 'CONTAINER NO.', 'B/L NO', 'PACKAGES', 'CONTENTS', 'WEIGHT', 'MEASUREMENT', ''];
      // Apply styling only to columns 2-7 (the actual table columns)
      for (let col = 2; col <= 7; col++) {
        const cell = tableHeaderRow.getCell(col);
        cell.font = { bold: true };
        cell.alignment = { horizontal: 'center' };
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFE5E7EB' },
        };
        cell.border = {
          top: { style: 'thin' },
          left: { style: 'thin' },
          bottom: { style: 'thin' },
          right: { style: 'thin' },
        };
      }

      // Row 19: Item Data
      const dataRow = sheet.getRow(19);
      dataRow.values = ['', order.containerNo || 'LOOSE CARGO', '', '', '', `${order.tonnages} TONS`, '', ''];
      // Apply styling only to columns 2-7
      for (let col = 2; col <= 7; col++) {
        const cell = dataRow.getCell(col);
        cell.alignment = { horizontal: 'center' };
        cell.border = {
          top: { style: 'thin' },
          left: { style: 'thin' },
          bottom: { style: 'thin' },
          right: { style: 'thin' },
        };
      }
      dataRow.getCell(2).font = { bold: true };
      dataRow.getCell(6).font = { bold: true };

      // Empty rows for table
      for (let i = 20; i <= 21; i++) {
        const emptyRow = sheet.getRow(i);
        emptyRow.values = ['', '', '', '', '', '', '', ''];
        for (let col = 2; col <= 7; col++) {
          emptyRow.getCell(col).border = {
            top: { style: 'thin' },
            left: { style: 'thin' },
            bottom: { style: 'thin' },
            right: { style: 'thin' },
          };
        }
      }

      // Row 23: Prepared By
      const preparedByUser = (req as AuthRequest).user?.username || '';
      sheet.getCell('B23').value = `Prepared By: ${preparedByUser}`;
      sheet.getCell('B23').font = { bold: true };

      // Row 25: Releasing Clerk
      sheet.getCell('B25').value = 'Releasing Clerks Name';
      sheet.getCell('B25').font = { bold: true };

      // Row 28: Remarks
      sheet.getCell('B28').value = `REMARKS: ${order.cargoType || ''}`;
      sheet.getCell('B28').font = { bold: true };

      // Row 29: Rate
      sheet.mergeCells('B29:G29');
      sheet.getCell('B29').value = `$${order.ratePerTon} PER TON`;
      sheet.getCell('B29').font = { bold: true, size: 14 };
      sheet.getCell('B29').alignment = { horizontal: 'center' };

      // Row 32: Acknowledgment
      sheet.mergeCells('B32:G32');
      sheet.getCell('B32').value = 'Acknowledge receipts of the goods as detailed above';
      sheet.getCell('B32').font = { bold: true };

      // Row 33: Delivers Name
      sheet.getCell('B33').value = 'Delivers Name:';
      sheet.getCell('B33').font = { bold: true };
      sheet.getCell('C33').value = order.driverName || '';
      sheet.getCell('C33').font = { bold: true };

      sheet.getCell('E33').value = 'Date:';
      sheet.getCell('E33').font = { bold: true };
      sheet.getCell('F33').value = formatDate(order.date);
      sheet.getCell('F33').font = { bold: true };

      // Row 35: National ID
      sheet.getCell('B35').value = 'National ID/Passport No. _______________________';

      // Add borders to sections
      for (let row = 9; row <= 35; row++) {
        sheet.getRow(row).getCell(2).border = { left: { style: 'thin' } };
        sheet.getRow(row).getCell(7).border = { right: { style: 'thin' } };
      }
    }

    // Create Summary sheet LAST (so it appears at the end)
    const summarySheet = excelWorkbook.addWorksheet('Summary');
    
    // Add logo to summary sheet
    if (logoId !== null) {
      summarySheet.addImage(logoId, {
        tl: { col: 0, row: 0 },
        ext: { width: 150, height: 75 },
      });
    }

    // Summary header
    summarySheet.mergeCells('C1:H1');
    summarySheet.getCell('C1').value = `DELIVERY ORDERS ${year} - SUMMARY`;
    summarySheet.getCell('C1').font = { bold: true, size: 16 };
    summarySheet.getCell('C1').alignment = { horizontal: 'center' };

    // Summary columns
    summarySheet.columns = [
      { header: '', key: 'logo', width: 20 },
      { header: '', key: 'space', width: 5 },
      { header: 'DO Number', key: 'doNumber', width: 15 },
      { header: 'Date', key: 'date', width: 12 },
      { header: 'Status', key: 'status', width: 12 },
      { header: 'Client', key: 'client', width: 25 },
      { header: 'Truck No', key: 'truckNo', width: 15 },
      { header: 'Destination', key: 'destination', width: 20 },
      { header: 'Tonnage', key: 'tonnage', width: 12 },
      { header: 'Type', key: 'type', width: 10 },
    ];

    // Add header row at row 5
    const summaryHeaderRow = summarySheet.getRow(5);
    summaryHeaderRow.values = ['', '', 'DO Number', 'Date', 'Status', 'Client', 'Truck No', 'Destination', 'Tonnage', 'Type'];
    // Apply styling only to columns 3-10 (the actual data columns)
    for (let col = 3; col <= 10; col++) {
      const cell = summaryHeaderRow.getCell(col);
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.alignment = { horizontal: 'center' };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF4472C4' },
      };
    }

    // Add summary data for each DO
    let summaryRowNum = 6;
    deliveryOrders.forEach((order) => {
      const row = summarySheet.getRow(summaryRowNum);
      const status = order.isCancelled ? 'CANCELLED' : 'ACTIVE';
      row.values = [
        '', '',
        order.doNumber,
        order.date,
        status,
        order.clientName,
        order.truckNo,
        order.destination,
        order.tonnages,
        order.importOrExport,
      ];
      // Apply alignment only to columns 3-10
      for (let col = 3; col <= 10; col++) {
        row.getCell(col).alignment = { horizontal: 'center' };
      }
      // Style cancelled rows
      if (order.isCancelled) {
        row.getCell(5).fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFFEE2E2' }, // Light red background
        };
        row.getCell(5).font = { color: { argb: 'FFDC2626' } }; // Red text
        // Gray out the entire row
        for (let col = 3; col <= 10; col++) {
          if (col !== 5) { // Skip status column
            row.getCell(col).font = { color: { argb: 'FF9CA3AF' } }; // Gray text
          }
        }
      }
      summaryRowNum++;
    });

    // Set response headers
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename=DELIVERY_ORDERS_${year}.xlsx`
    );

    await excelWorkbook.xlsx.write(res);
    res.end();

    logger.info(`DO Workbook exported for year ${year} by ${req.user?.username}`);
  } catch (error: any) {
    throw error;
  }
};

/**
 * Export specific month as Excel
 */
export const exportMonth = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const year = parseInt(req.params.year, 10);
    const month = parseInt(req.params.month, 10);

    if (isNaN(year) || isNaN(month) || month < 1 || month > 12) {
      throw new ApiError(400, 'Invalid year or month');
    }

    const monthStart = `${year}-${month.toString().padStart(2, '0')}-01`;
    const monthEnd = `${year}-${month.toString().padStart(2, '0')}-31`;

    // Get all DOs for the month
    const deliveryOrders = await DeliveryOrder.find({
      isDeleted: false,
      date: { $gte: monthStart, $lte: monthEnd }
    }).sort({ date: 1, sn: 1 }).lean();

    if (deliveryOrders.length === 0) {
      throw new ApiError(404, 'No delivery orders found for this month');
    }

    const monthName = MONTH_NAMES[month - 1];

    // Create Excel workbook
    const excelWorkbook = new ExcelJS.Workbook();
    excelWorkbook.creator = 'Fuel Order System';
    excelWorkbook.created = new Date();

    // Load logo image
    let logoId: number | null = null;
    const logoPath = path.join(__dirname, '../../assets/logo.png');
    if (fs.existsSync(logoPath)) {
      logoId = excelWorkbook.addImage({
        filename: logoPath,
        extension: 'png',
      });
    }

    // Create sheet
    const sheet = excelWorkbook.addWorksheet(monthName);

    // Add logo
    if (logoId !== null) {
      sheet.addImage(logoId, {
        tl: { col: 0, row: 0 },
        ext: { width: 120, height: 60 },
      });
    }

    // Header
    sheet.mergeCells('C1:K1');
    sheet.getCell('C1').value = `DELIVERY ORDERS - ${monthName.toUpperCase()} ${year}`;
    sheet.getCell('C1').font = { bold: true, size: 14 };
    sheet.getCell('C1').alignment = { horizontal: 'center' };

    // Add spacing
    sheet.addRow([]);
    sheet.addRow([]);
    sheet.addRow([]);

    // Column headers - updated to include Status
    const headerRow = sheet.addRow([
      'S/N', 'Date', 'Type', 'Status', 'DO Number', 'Client', 'Truck No', 
      'Trailer No', 'Container', 'Destination', 'Tonnage', 'Rate/Ton', 'Amount'
    ]);
    headerRow.font = { bold: true };
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF4472C4' },
    };
    headerRow.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.alignment = { horizontal: 'center' };
      cell.border = {
        top: { style: 'thin' },
        left: { style: 'thin' },
        bottom: { style: 'thin' },
        right: { style: 'thin' },
      };
    });

    // Set column widths - adjusted for new Status column
    sheet.getColumn(1).width = 6;
    sheet.getColumn(2).width = 12;
    sheet.getColumn(3).width = 10;
    sheet.getColumn(4).width = 12;  // Status
    sheet.getColumn(5).width = 15;
    sheet.getColumn(6).width = 20;
    sheet.getColumn(7).width = 12;
    sheet.getColumn(8).width = 12;
    sheet.getColumn(9).width = 15;
    sheet.getColumn(10).width = 20;
    sheet.getColumn(11).width = 10;
    sheet.getColumn(12).width = 12;
    sheet.getColumn(13).width = 15;

    // Add data
    let rowIndex = 1;
    let totalTonnage = 0;
    let totalAmount = 0;

    for (const entry of deliveryOrders) {
      const amount = (entry.tonnages || 0) * (entry.ratePerTon || 0);
      // Only count active orders in totals
      if (!entry.isCancelled) {
        totalTonnage += entry.tonnages || 0;
        totalAmount += amount;
      }

      const status = entry.isCancelled ? 'CANCELLED' : 'ACTIVE';
      const dataRow = sheet.addRow([
        rowIndex++,
        entry.date,
        entry.importOrExport,
        status,
        entry.doNumber,
        entry.clientName,
        entry.truckNo,
        entry.trailerNo,
        entry.containerNo,
        entry.destination,
        entry.tonnages,
        entry.ratePerTon,
        amount
      ]);

      // Apply base styling
      if (rowIndex % 2 === 0 && !entry.isCancelled) {
        dataRow.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFF2F2F2' },
        };
      }

      // Style cancelled rows
      if (entry.isCancelled) {
        dataRow.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFFEE2E2' }, // Light red background
        };
        dataRow.eachCell((cell) => {
          cell.font = { color: { argb: 'FF9CA3AF' } }; // Gray text
        });
        // Make status cell red text
        dataRow.getCell(4).font = { color: { argb: 'FFDC2626' }, bold: true };
      } else {
        const typeCell = dataRow.getCell(3);
        if (entry.importOrExport === 'IMPORT') {
          typeCell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFDCE6F1' },
          };
        } else {
          typeCell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFD4EDDA' },
          };
        }
      }

      dataRow.eachCell((cell) => {
        cell.border = {
          top: { style: 'thin' },
          left: { style: 'thin' },
          bottom: { style: 'thin' },
          right: { style: 'thin' },
        };
      });
    }

    // Totals row (only counts active orders)
    const totalRow = sheet.addRow([
      '', '', '', '', '', '', '', '', 'TOTAL:', '', totalTonnage, '', totalAmount
    ]);
    totalRow.font = { bold: true };
    totalRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFD9E1F2' },
    };

    // Set response headers
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename=DELIVERY_ORDERS_${monthName}_${year}.xlsx`
    );

    await excelWorkbook.xlsx.write(res);
    res.end();

    logger.info(`DO Month export for ${monthName} ${year} by ${req.user?.username}`);
  } catch (error: any) {
    throw error;
  }
};

/**
 * Get all amended DOs (DOs with edit history)
 */
export const getAmendedDOs = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { startDate, endDate, doNumbers } = req.query;

    // Build query for amended DOs
    const query: any = {
      isDeleted: false,
      'editHistory.0': { $exists: true }, // Has at least one edit history entry
    };

    // Filter by date range if provided
    if (startDate || endDate) {
      query.date = {};
      if (startDate) query.date.$gte = startDate;
      if (endDate) query.date.$lte = endDate;
    }

    // Filter by specific DO numbers if provided
    if (doNumbers) {
      const doList = (doNumbers as string).split(',').map(d => d.trim());
      query.doNumber = { $in: doList };
    }

    const amendedDOs = await DeliveryOrder.find(query)
      .sort({ 'editHistory.0.editedAt': -1, updatedAt: -1 })
      .lean();

    res.status(200).json({
      success: true,
      message: `Found ${amendedDOs.length} amended delivery orders`,
      data: amendedDOs,
      count: amendedDOs.length,
    });
  } catch (error: any) {
    throw error;
  }
};

/**
 * Download amended DOs as PDF
 */
export const downloadAmendedDOsPDF = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { doIds } = req.body;

    if (!doIds || !Array.isArray(doIds) || doIds.length === 0) {
      throw new ApiError(400, 'Please provide an array of DO IDs to download');
    }

    // Fetch the DOs with edit history
    const deliveryOrders = await DeliveryOrder.find({
      _id: { $in: doIds },
      isDeleted: false,
      'editHistory.0': { $exists: true }, // Ensure they have edit history
    }).lean();

    if (deliveryOrders.length === 0) {
      throw new ApiError(404, 'No amended delivery orders found for the provided IDs');
    }

    // Import PDF generator
    const { generateAmendedDOsPDF, generateAmendedDOsFilename } = await import('../utils/pdfGenerator');

    // Generate PDF
    const doc = generateAmendedDOsPDF(deliveryOrders as any, { includeEditHistory: true });

    // Generate filename
    const doNumbers = deliveryOrders.map(d => d.doNumber);
    const filename = generateAmendedDOsFilename(doNumbers);

    // Set response headers for PDF download
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    // Pipe the PDF to response
    doc.pipe(res);
    doc.end();

    logger.info(`Amended DOs PDF downloaded: ${doNumbers.join(', ')} by ${req.user?.username}`);
  } catch (error: any) {
    throw error;
  }
};

/**
 * Get summary of recent amendments
 */
export const getAmendmentsSummary = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { days = 30 } = req.query;
    const daysNum = parseInt(days as string) || 30;

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysNum);

    // Find DOs with recent amendments
    const amendedDOs = await DeliveryOrder.find({
      isDeleted: false,
      'editHistory.editedAt': { $gte: cutoffDate },
    })
      .select('doNumber truckNo importOrExport date editHistory isCancelled status')
      .sort({ 'editHistory.editedAt': -1 })
      .lean();

    // Process to get summary
    const summary = amendedDOs.map(order => {
      const latestEdit = order.editHistory && order.editHistory.length > 0
        ? order.editHistory[order.editHistory.length - 1]
        : null;

      return {
        id: order._id,
        doNumber: order.doNumber,
        truckNo: order.truckNo,
        importOrExport: order.importOrExport,
        date: order.date,
        status: order.status,
        isCancelled: order.isCancelled,
        totalAmendments: order.editHistory?.length || 0,
        lastAmendedAt: latestEdit?.editedAt,
        lastAmendedBy: latestEdit?.editedBy,
        lastAmendmentReason: latestEdit?.reason,
        fieldsChanged: latestEdit?.changes?.map((c: any) => c.field) || [],
      };
    });

    res.status(200).json({
      success: true,
      message: `Found ${summary.length} amended DOs in the last ${daysNum} days`,
      data: summary,
      count: summary.length,
      periodDays: daysNum,
    });
  } catch (error: any) {
    throw error;
  }
};

// ==================== SDO-SPECIFIC ENDPOINTS ====================

/**
 * Get all SDO workbooks (one per year)
 * SDOs are tracked separately from DOs
 */
export const getAllSDOWorkbooks = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    // Get distinct years from SDO orders only
    const years = await DeliveryOrder.distinct('date', { 
      isDeleted: false,
      doType: 'SDO'
    });
    
    // Extract unique years from dates (format: YYYY-MM-DD)
    const uniqueYears = [...new Set(
      years
        .map(date => {
          const year = parseInt(date.split('-')[0], 10);
          return isNaN(year) ? null : year;
        })
        .filter(year => year !== null && year >= 2000 && year <= 2100)
    )].sort((a, b) => (b as number) - (a as number));

    // Build workbook data for each year
    const workbooks = await Promise.all(
      uniqueYears.map(async (year) => {
        const yearStart = `${year}-01-01`;
        const yearEnd = `${year}-12-31`;
        
        const count = await DeliveryOrder.countDocuments({
          isDeleted: false,
          doType: 'SDO',
          date: { $gte: yearStart, $lte: yearEnd }
        });

        // Count months with data
        const monthsWithData = await DeliveryOrder.aggregate([
          {
            $match: {
              isDeleted: false,
              doType: 'SDO',
              date: { $gte: yearStart, $lte: yearEnd }
            }
          },
          {
            $group: {
              _id: { $substr: ['$date', 5, 2] }
            }
          }
        ]);

        return {
          id: year,
          year,
          name: `SDO ${year}`,
          sheetCount: monthsWithData.length,
          totalSDOs: count,
        };
      })
    );

    res.status(200).json({
      success: true,
      message: 'SDO workbooks retrieved successfully',
      data: workbooks,
    });
  } catch (error: any) {
    throw error;
  }
};

/**
 * Get SDO workbook by year
 */
export const getSDOWorkbookByYear = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const year = parseInt(req.params.year, 10);

    if (isNaN(year)) {
      throw new ApiError(400, 'Invalid year');
    }

    const yearStart = `${year}-01-01`;
    const yearEnd = `${year}-12-31`;

    // Get all SDOs for the year - each SDO is its own sheet
    const sdoOrders = await DeliveryOrder.find({
      isDeleted: false,
      doType: 'SDO',
      date: { $gte: yearStart, $lte: yearEnd }
    }).sort({ date: 1, doNumber: 1 }).lean();

    // Each SDO is a sheet
    const workbook = {
      id: year,
      year,
      name: `SDO ${year}`,
      sheetCount: sdoOrders.length,
      sheets: sdoOrders.map(order => ({
        ...order,
        workbookId: year,
        isActive: true
      })),
    };

    res.status(200).json({
      success: true,
      message: 'SDO workbook retrieved successfully',
      data: workbook,
    });
  } catch (error: any) {
    throw error;
  }
};

/**
 * Get available years for SDO workbooks
 */
export const getAvailableSDOYears = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const years = await DeliveryOrder.distinct('date', { 
      isDeleted: false,
      doType: 'SDO'
    });
    
    const uniqueYears = [...new Set(
      years
        .map(date => {
          const year = parseInt(date.split('-')[0], 10);
          return isNaN(year) ? null : year;
        })
        .filter(year => year !== null && year >= 2000 && year <= 2100)
    )].sort((a, b) => (b as number) - (a as number));

    res.status(200).json({
      success: true,
      message: 'Available SDO years retrieved successfully',
      data: uniqueYears,
    });
  } catch (error: any) {
    throw error;
  }
};

/**
 * Export SDO workbook as Excel file with logo and formatting
 */
export const exportSDOWorkbook = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const year = parseInt(req.params.year, 10);

    if (isNaN(year)) {
      throw new ApiError(400, 'Invalid year');
    }

    const yearStart = `${year}-01-01`;
    const yearEnd = `${year}-12-31`;

    // Get all SDOs for the year
    const sdoOrders = await DeliveryOrder.find({
      isDeleted: false,
      doType: 'SDO',
      date: { $gte: yearStart, $lte: yearEnd }
    }).sort({ date: 1, doNumber: 1 }).lean();

    if (sdoOrders.length === 0) {
      throw new ApiError(404, 'No SDO orders found for this year');
    }

    // Create Excel workbook
    const excelWorkbook = new ExcelJS.Workbook();
    excelWorkbook.creator = 'Fuel Order System';
    excelWorkbook.created = new Date();

    // Load logo image
    let logoId: number | null = null;
    const logoPath = path.join(__dirname, '../../assets/logo.png');
    if (fs.existsSync(logoPath)) {
      logoId = excelWorkbook.addImage({
        filename: logoPath,
        extension: 'png',
      });
    }

    // Create individual sheets for each SDO FIRST
    for (const order of sdoOrders) {
      // Sheet name: SDO number (max 31 chars for Excel) - add CANCELLED prefix if cancelled
      const sheetName = order.isCancelled 
        ? `X-${(order.doNumber || 'SDO').substring(0, 28)}` 
        : (order.doNumber || 'SDO').substring(0, 31);
      const sheet = excelWorkbook.addWorksheet(sheetName);

      // Format date
      const formatDate = (dateString: string) => {
        if (!dateString) return new Date().toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
        const date = new Date(dateString);
        return date.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
      };

      // Set column widths for delivery note format
      sheet.getColumn(1).width = 3;
      sheet.getColumn(2).width = 15;
      sheet.getColumn(3).width = 15;
      sheet.getColumn(4).width = 15;
      sheet.getColumn(5).width = 15;
      sheet.getColumn(6).width = 15;
      sheet.getColumn(7).width = 15;
      sheet.getColumn(8).width = 3;

      // Add logo
      if (logoId !== null) {
        sheet.addImage(logoId, {
          tl: { col: 5, row: 0 },
          ext: { width: 140, height: 70 },
        });
      }

      // Add CANCELLED watermark for cancelled orders
      if (order.isCancelled) {
        sheet.mergeCells('B1:G1');
        sheet.getCell('B1').value = '*** CANCELLED ***';
        sheet.getCell('B1').font = { bold: true, size: 16, color: { argb: 'FFDC2626' } };
        sheet.getCell('B1').alignment = { horizontal: 'center' };
        sheet.getCell('B1').fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFFEE2E2' },
        };
      }

      // Row 1-2: Company name (adjusted for cancelled orders)
      const companyRow = order.isCancelled ? 'B2:D3' : 'B1:D2';
      sheet.mergeCells(companyRow);
      sheet.getCell(order.isCancelled ? 'B2' : 'B1').value = 'TAHMEED';
      sheet.getCell(order.isCancelled ? 'B2' : 'B1').font = { bold: true, size: 24, color: { argb: 'FFE67E22' } };

      // Row 3: Website
      const websiteRow = order.isCancelled ? 4 : 3;
      sheet.getCell(`B${websiteRow}`).value = 'www.tahmeedcoach.co.ke';
      sheet.getCell(`B${websiteRow}`).font = { size: 9 };

      // Row 4: Email
      const emailRow = order.isCancelled ? 5 : 4;
      sheet.getCell(`B${emailRow}`).value = 'Email: info@tahmeedcoach.co.ke';
      sheet.getCell(`B${emailRow}`).font = { size: 9 };

      // Row 5: Tel
      const telRow = order.isCancelled ? 6 : 5;
      sheet.getCell(`B${telRow}`).value = 'Tel: +254 700 000 000';
      sheet.getCell(`B${telRow}`).font = { size: 9 };

      // Row 7: Title
      sheet.mergeCells('B7:G7');
      sheet.getCell('B7').value = 'SPECIAL DELIVERY NOTE GOODS RECEIVED NOTE';
      sheet.getCell('B7').font = { bold: true, size: 14 };
      sheet.getCell('B7').alignment = { horizontal: 'center' };
      sheet.getCell('B7').border = {
        top: { style: 'medium' },
        bottom: { style: 'medium' },
      };

      // Row 9: SDO Number and Date
      sheet.mergeCells('B9:D9');
      sheet.getCell('B9').value = `SDO #: ${order.doNumber}`;
      sheet.getCell('B9').font = { bold: true, size: 12 };
      sheet.getCell('D9').font = { color: { argb: 'FFDC3545' } };

      sheet.mergeCells('E9:G9');
      sheet.getCell('E9').value = `Date: ${formatDate(order.date)}`;
      sheet.getCell('E9').font = { bold: true };
      sheet.getCell('E9').alignment = { horizontal: 'right' };

      // Row 11: TO
      sheet.getCell('B11').value = 'TO:';
      sheet.getCell('B11').font = { bold: true };
      sheet.getCell('C11').value = order.clientName;
      sheet.getCell('C11').font = { bold: true };

      // Row 12: Description
      sheet.mergeCells('B12:G12');
      sheet.getCell('B12').value = 'Please receive the under mentioned containers/Packages ex.m.v';
      sheet.getCell('B12').font = { size: 9 };

      // Row 13: MPRO and POL
      sheet.getCell('B13').value = `MPRO NO: ${order.invoiceNos || ''}`;
      sheet.getCell('D13').value = `POL: ${order.loadingPoint}`;

      // Row 14: Arrive
      sheet.getCell('E13').value = `Arrive: ${order.importOrExport === 'IMPORT' ? 'TANGA/DAR' : order.loadingPoint}`;

      // Row 15: Destination
      sheet.getCell('B15').value = 'For Destination:';
      sheet.getCell('B15').font = { bold: true };
      sheet.getCell('C15').value = order.destination;
      sheet.getCell('C15').font = { bold: true };

      // Row 16: Haulier
      sheet.getCell('B16').value = 'Haulier:';
      sheet.getCell('B16').font = { bold: true };
      sheet.getCell('C16').value = order.haulier;
      sheet.getCell('C16').font = { bold: true };

      // Row 15: Lorry No
      sheet.getCell('E15').value = 'Lorry No:';
      sheet.getCell('E15').font = { bold: true };
      sheet.getCell('F15').value = order.truckNo;
      sheet.getCell('F15').font = { bold: true };

      // Row 16: Trailer No
      sheet.getCell('E16').value = 'Trailer No:';
      sheet.getCell('E16').font = { bold: true };
      sheet.getCell('F16').value = order.trailerNo;
      sheet.getCell('F16').font = { bold: true };

      // Row 18: Items Table Header
      const tableHeaderRow = sheet.getRow(18);
      tableHeaderRow.values = ['', 'CONTAINER NO.', 'B/L NO', 'PACKAGES', 'CONTENTS', 'WEIGHT', 'MEASUREMENT', ''];
      // Apply styling only to columns 2-7 (the actual table columns)
      for (let col = 2; col <= 7; col++) {
        const cell = tableHeaderRow.getCell(col);
        cell.font = { bold: true };
        cell.alignment = { horizontal: 'center' };
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFE5E7EB' },
        };
        cell.border = {
          top: { style: 'thin' },
          left: { style: 'thin' },
          bottom: { style: 'thin' },
          right: { style: 'thin' },
        };
      }

      // Row 19: Item Data
      const dataRow = sheet.getRow(19);
      dataRow.values = ['', order.containerNo || 'LOOSE CARGO', '', '', '', `${order.tonnages} TONS`, '', ''];
      // Apply styling only to columns 2-7
      for (let col = 2; col <= 7; col++) {
        const cell = dataRow.getCell(col);
        cell.alignment = { horizontal: 'center' };
        cell.border = {
          top: { style: 'thin' },
          left: { style: 'thin' },
          bottom: { style: 'thin' },
          right: { style: 'thin' },
        };
      }
      dataRow.getCell(2).font = { bold: true };
      dataRow.getCell(6).font = { bold: true };

      // Empty rows for table
      for (let i = 20; i <= 21; i++) {
        const emptyRow = sheet.getRow(i);
        emptyRow.values = ['', '', '', '', '', '', '', ''];
        for (let col = 2; col <= 7; col++) {
          emptyRow.getCell(col).border = {
            top: { style: 'thin' },
            left: { style: 'thin' },
            bottom: { style: 'thin' },
            right: { style: 'thin' },
          };
        }
      }

      // Row 23: Prepared By
      const preparedByUser = (req as AuthRequest).user?.username || '';
      sheet.getCell('B23').value = `Prepared By: ${preparedByUser}`;
      sheet.getCell('B23').font = { bold: true };

      // Row 25: Releasing Clerk
      sheet.getCell('B25').value = 'Releasing Clerks Name';
      sheet.getCell('B25').font = { bold: true };

      // Row 28: Remarks
      sheet.getCell('B28').value = `REMARKS: ${order.cargoType || ''}`;
      sheet.getCell('B28').font = { bold: true };

      // Row 29: Rate
      sheet.mergeCells('B29:G29');
      sheet.getCell('B29').value = `$${order.ratePerTon} PER TON`;
      sheet.getCell('B29').font = { bold: true, size: 14 };
      sheet.getCell('B29').alignment = { horizontal: 'center' };

      // Row 32: Acknowledgment
      sheet.mergeCells('B32:G32');
      sheet.getCell('B32').value = 'Acknowledge receipts of the goods as detailed above';
      sheet.getCell('B32').font = { bold: true };

      // Row 33: Delivers Name
      sheet.getCell('B33').value = 'Delivers Name:';
      sheet.getCell('B33').font = { bold: true };
      sheet.getCell('C33').value = order.driverName || '';
      sheet.getCell('C33').font = { bold: true };

      sheet.getCell('E33').value = 'Date:';
      sheet.getCell('E33').font = { bold: true };
      sheet.getCell('F33').value = formatDate(order.date);
      sheet.getCell('F33').font = { bold: true };

      // Row 35: National ID
      sheet.getCell('B35').value = 'National ID/Passport No. _______________________';

      // Add borders to sections
      for (let row = 9; row <= 35; row++) {
        sheet.getRow(row).getCell(2).border = { left: { style: 'thin' } };
        sheet.getRow(row).getCell(7).border = { right: { style: 'thin' } };
      }
    }

    // Create Summary sheet LAST (so it appears at the end)
    const summarySheet = excelWorkbook.addWorksheet('Summary');
    
    // Add logo to summary sheet
    if (logoId !== null) {
      summarySheet.addImage(logoId, {
        tl: { col: 0, row: 0 },
        ext: { width: 150, height: 75 },
      });
    }

    // Summary header
    summarySheet.mergeCells('C1:H1');
    summarySheet.getCell('C1').value = `SDO ${year} - SUMMARY`;
    summarySheet.getCell('C1').font = { bold: true, size: 16 };
    summarySheet.getCell('C1').alignment = { horizontal: 'center' };

    // Summary columns
    summarySheet.columns = [
      { header: '', key: 'logo', width: 20 },
      { header: '', key: 'space', width: 5 },
      { header: 'SDO Number', key: 'sdoNumber', width: 15 },
      { header: 'Date', key: 'date', width: 12 },
      { header: 'Status', key: 'status', width: 12 },
      { header: 'Client', key: 'client', width: 25 },
      { header: 'Truck No', key: 'truckNo', width: 15 },
      { header: 'Destination', key: 'destination', width: 20 },
      { header: 'Tonnage', key: 'tonnage', width: 12 },
      { header: 'Type', key: 'type', width: 10 },
    ];

    // Add header row at row 5
    const summaryHeaderRow = summarySheet.getRow(5);
    summaryHeaderRow.values = ['', '', 'SDO Number', 'Date', 'Status', 'Client', 'Truck No', 'Destination', 'Tonnage', 'Type'];
    // Apply styling only to columns 3-10 (the actual data columns)
    for (let col = 3; col <= 10; col++) {
      const cell = summaryHeaderRow.getCell(col);
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.alignment = { horizontal: 'center' };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF4472C4' },
      };
    }

    // Add summary data for each SDO
    let summaryRowNum = 6;
    sdoOrders.forEach((order) => {
      const row = summarySheet.getRow(summaryRowNum);
      const status = order.isCancelled ? 'CANCELLED' : 'ACTIVE';
      row.values = [
        '', '',
        order.doNumber,
        order.date,
        status,
        order.clientName,
        order.truckNo,
        order.destination,
        order.tonnages,
        order.importOrExport,
      ];
      // Apply alignment only to columns 3-10
      for (let col = 3; col <= 10; col++) {
        row.getCell(col).alignment = { horizontal: 'center' };
      }
      // Highlight cancelled rows
      if (order.isCancelled) {
        for (let col = 3; col <= 10; col++) {
          row.getCell(col).fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFFEE2E2' },
          };
        }
      }
      summaryRowNum++;
    });

    // Set response headers for download
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="SDO_${year}.xlsx"`
    );

    // Write to response
    await excelWorkbook.xlsx.write(res);
    res.end();

    logger.info(`SDO workbook exported for year ${year} by ${req.user?.username}`);
  } catch (error: any) {
    throw error;
  }
};

/**
 * Export specific month from SDO workbook
 */
export const exportSDOMonth = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const year = parseInt(req.params.year, 10);
    const month = parseInt(req.params.month, 10);

    if (isNaN(year) || isNaN(month) || month < 1 || month > 12) {
      throw new ApiError(400, 'Invalid year or month');
    }

    const monthStr = month.toString().padStart(2, '0');
    const monthStart = `${year}-${monthStr}-01`;
    const monthEnd = `${year}-${monthStr}-31`;

    // Get all SDOs for the month
    const sdoOrders = await DeliveryOrder.find({
      isDeleted: false,
      doType: 'SDO',
      date: { $gte: monthStart, $lte: monthEnd }
    }).sort({ date: 1, doNumber: 1 }).lean();

    if (sdoOrders.length === 0) {
      throw new ApiError(404, `No SDO orders found for ${MONTH_NAMES[month - 1]} ${year}`);
    }

    // Create Excel workbook
    const excelWorkbook = new ExcelJS.Workbook();
    excelWorkbook.creator = 'Fuel Order System';
    excelWorkbook.created = new Date();

    // Load logo image
    let logoId: number | null = null;
    const logoPath = path.join(__dirname, '../../assets/logo.png');
    if (fs.existsSync(logoPath)) {
      logoId = excelWorkbook.addImage({
        filename: logoPath,
        extension: 'png',
      });
    }

    // Create single sheet for month
    const sheet = excelWorkbook.addWorksheet(MONTH_NAMES[month - 1]);

    // Add logo
    if (logoId !== null) {
      sheet.addImage(logoId, {
        tl: { col: 0, row: 0 },
        ext: { width: 150, height: 75 },
      });
    }

    // Header
    sheet.mergeCells('C1:H1');
    sheet.getCell('C1').value = `SDO ${MONTH_NAMES[month - 1]} ${year}`;
    sheet.getCell('C1').font = { bold: true, size: 16 };
    sheet.getCell('C1').alignment = { horizontal: 'center' };

    // Columns
    sheet.columns = [
      { header: '', key: 'logo', width: 20 },
      { header: '', key: 'space', width: 5 },
      { header: 'SDO Number', key: 'sdoNumber', width: 15 },
      { header: 'Date', key: 'date', width: 12 },
      { header: 'Status', key: 'status', width: 12 },
      { header: 'Client', key: 'client', width: 25 },
      { header: 'Truck No', key: 'truckNo', width: 15 },
      { header: 'Destination', key: 'destination', width: 20 },
      { header: 'Tonnage', key: 'tonnage', width: 12 },
      { header: 'Type', key: 'type', width: 10 },
    ];

    // Add header row at row 5
    const headerRow = sheet.getRow(5);
    headerRow.values = ['', '', 'SDO Number', 'Date', 'Status', 'Client', 'Truck No', 'Destination', 'Tonnage', 'Type'];
    for (let col = 3; col <= 10; col++) {
      const cell = headerRow.getCell(col);
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.alignment = { horizontal: 'center' };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF4472C4' },
      };
    }

    // Add data rows
    let rowNum = 6;
    sdoOrders.forEach((order) => {
      const row = sheet.getRow(rowNum);
      const status = order.isCancelled ? 'CANCELLED' : 'ACTIVE';
      row.values = [
        '', '',
        order.doNumber,
        order.date,
        status,
        order.clientName,
        order.truckNo,
        order.destination,
        order.tonnages,
        order.importOrExport,
      ];
      for (let col = 3; col <= 10; col++) {
        row.getCell(col).alignment = { horizontal: 'center' };
      }
      if (order.isCancelled) {
        for (let col = 3; col <= 10; col++) {
          row.getCell(col).fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFFEE2E2' },
          };
        }
      }
      rowNum++;
    });

    // Set response headers
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="SDO_${MONTH_NAMES[month - 1]}_${year}.xlsx"`
    );

    // Write to response
    await excelWorkbook.xlsx.write(res);
    res.end();

    logger.info(`SDO month ${MONTH_NAMES[month - 1]} ${year} exported by ${req.user?.username}`);
  } catch (error: any) {
    throw error;
  }
};

/**
 * Export yearly monthly summaries workbook for DO - only monthly summary sheets
 */
export const exportYearlyMonthlySummaries = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const year = parseInt(req.params.year, 10);

    if (isNaN(year)) {
      throw new ApiError(400, 'Invalid year');
    }

    const yearStart = `${year}-01-01`;
    const yearEnd = `${year}-12-31`;

    // Get all DOs for the year
    const deliveryOrders = await DeliveryOrder.find({
      isDeleted: false,
      doType: 'DO',
      date: { $gte: yearStart, $lte: yearEnd }
    }).sort({ date: 1, doNumber: 1 }).lean();

    if (deliveryOrders.length === 0) {
      throw new ApiError(404, 'No delivery orders found for this year');
    }

    // Create Excel workbook
    const excelWorkbook = new ExcelJS.Workbook();
    excelWorkbook.creator = 'Fuel Order System';
    excelWorkbook.created = new Date();

    // Add monthly summary sheets
    addMonthlySummarySheets(excelWorkbook, deliveryOrders, year, 'DO');

    // Send file to client
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename=DO_Monthly_Summaries_${year}.xlsx`
    );

    await excelWorkbook.xlsx.write(res);
    res.end();

    logger.info(`DO monthly summaries ${year} exported by ${req.user?.username}`);
  } catch (error: any) {
    if (error instanceof ApiError) {
      res.status(error.statusCode).json({ error: error.message });
    } else {
      logger.error('Error exporting DO monthly summaries:', error);
      res.status(500).json({ error: 'Failed to export monthly summaries' });
    }
  }
};

/**
 * Export yearly monthly summaries workbook for SDO - only monthly summary sheets
 */
export const exportSDOYearlyMonthlySummaries = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const year = parseInt(req.params.year, 10);

    if (isNaN(year)) {
      throw new ApiError(400, 'Invalid year');
    }

    const yearStart = `${year}-01-01`;
    const yearEnd = `${year}-12-31`;

    // Get all SDOs for the year
    const sdoOrders = await DeliveryOrder.find({
      isDeleted: false,
      doType: 'SDO',
      date: { $gte: yearStart, $lte: yearEnd }
    }).sort({ date: 1, doNumber: 1 }).lean();

    if (sdoOrders.length === 0) {
      throw new ApiError(404, 'No SDO orders found for this year');
    }

    // Create Excel workbook
    const excelWorkbook = new ExcelJS.Workbook();
    excelWorkbook.creator = 'Fuel Order System';
    excelWorkbook.created = new Date();

    // Add monthly summary sheets
    addMonthlySummarySheets(excelWorkbook, sdoOrders, year, 'SDO');

    // Send file to client
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename=SDO_Monthly_Summaries_${year}.xlsx`
    );

    await excelWorkbook.xlsx.write(res);
    res.end();

    logger.info(`SDO monthly summaries ${year} exported by ${req.user?.username}`);
  } catch (error: any) {
    if (error instanceof ApiError) {
      res.status(error.statusCode).json({ error: error.message });
    } else {
      logger.error('Error exporting SDO monthly summaries:', error);
      res.status(500).json({ error: 'Failed to export monthly summaries' });
    }
  }
};
