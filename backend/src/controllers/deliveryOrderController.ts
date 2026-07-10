import { Response } from 'express';
import mongoose, { ClientSession } from 'mongoose';
import { matchedData } from 'express-validator';
import { DeliveryOrder, FuelRecord, LPOSummary } from '../models';
import { RouteConfig } from '../models/RouteConfig';
import { ArchivedDeliveryOrder } from '../models/ArchivedData';
import { ApiError } from '../middleware/errorHandler';
import { AuthRequest } from '../middleware/auth';
import { getPaginationParams, createPaginatedResponse, calculateSkip, logger, sanitizeRegexInput, buildFuzzyRegex, normalizeTruckNo } from '../utils';
import { AuditService } from '../utils/auditService';
import { enforceEditLock } from './editLockController';
import { attachLocks } from '../services/lockService';
import AnomalyDetectionService from '../utils/anomalyDetectionService';
import { emitDataChange, BulkChangeMeta } from '../services/websocket';
import { filterDeliveryOrderFields } from '../utils/roleFieldPolicy';
import { getFuelAutomationFlags, resolveDashboardSearchLimits } from '../services/journeyService';
import { addMonthlySummarySheets } from '../utils/monthlySheetGenerator';
import { addDoSummaryTabSheets, parseMonthYearLabel } from '../utils/summaryTabExport';
import unifiedExportService from '../services/unifiedExportService';
import ExcelJS from 'exceljs';
import path from 'path';
import fs from 'fs';
import axios from 'axios';
import { formatDONumber } from '../utils/doNumberFormatter';
import type { CompanyBranding } from '../utils/pdfGenerator';
import {
  matchRouteLiters,
  matchExtraFuel,
  buildImportFuelRecord,
  matchExportRouteLiters,
  buildReturnUpdate,
  type RouteLike,
  type DeliveryOrderLike,
} from '../utils/fuelRecordCalculator';

// Month names for sheet naming
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

/**
 * Load company branding from SystemConfig.
 * Falls back to original hardcoded defaults if not yet configured.
 * If logoUrl is an HTTPS URL (R2), fetches and converts it to a base64 data URL
 * so that pdfGenerator.ts can embed it without file-system access.
 */
const getCompanyBranding = async (): Promise<CompanyBranding> => {
  try {
    const { SystemConfig } = await import('../models/SystemConfig');
    const config = await SystemConfig.findOne({ configType: 'system_settings', isDeleted: false }).lean();
    const g = config?.systemSettings?.general;

    let logoUrl: string = g?.logoUrl || '';

    // If the logo is stored as an external HTTPS URL (e.g. Cloudflare R2),
    // fetch it and convert to base64 data URL so PDFKit can embed it.
    if (logoUrl && logoUrl.startsWith('http')) {
      try {
        const response = await axios.get(logoUrl, {
          responseType: 'arraybuffer',
          timeout: 10000,
        });
        const mimeType = (response.headers['content-type'] as string)?.split(';')[0] || 'image/png';
        const base64 = Buffer.from(response.data as ArrayBuffer).toString('base64');
        logoUrl = `data:${mimeType};base64,${base64}`;
      } catch (fetchErr) {
        logger.warn(`getCompanyBranding: failed to fetch logo from "${logoUrl}", omitting from PDF. ${fetchErr}`);
        logoUrl = '';
      }
    }

    return {
      companyName: g?.companyName || '',
      companyWebsite: g?.companyWebsite || '',
      companyAddress: (g as any)?.companyAddress || '',
      companyEmail: g?.companyEmail || '',
      companyPhone: g?.companyPhone || '',
      logoUrl,
    };
  } catch {
    return {
      companyName: '',
      companyWebsite: '',
      companyAddress: '',
      companyEmail: '',
      companyPhone: '',
      logoUrl: '',
    };
  }
};

/**
 * Emit a `fuel_records` change carrying the affected record's full payload so
 * connected clients patch that single row in place (no disruptive list refetch).
 * Falls back to a payload-less emit (which triggers a list refresh) only when
 * the record can't be loaded.
 */
/**
 * Build a compact bulk-change scope descriptor from a set of just-created rows,
 * so clients can decide whether any of them land in the viewer's current
 * filtered + paginated view (see BulkChangeMeta).
 */
const buildBulkMeta = (
  rows: Array<{ date?: any; importOrExport?: string; doType?: string }>,
): BulkChangeMeta | undefined => {
  if (!rows.length) return undefined;
  const times = rows
    .map(r => new Date(r.date))
    .filter(d => !isNaN(d.getTime()))
    .sort((a, b) => a.getTime() - b.getTime());
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const importOrExport = [...new Set(rows.map(r => r.importOrExport).filter(Boolean))] as string[];
  const doType = [...new Set(rows.map(r => r.doType).filter(Boolean))] as string[];
  return {
    bulk: true,
    count: rows.length,
    dateMin: times.length ? iso(times[0]) : undefined,
    dateMax: times.length ? iso(times[times.length - 1]) : undefined,
    importOrExport: importOrExport.length ? importOrExport : undefined,
    doType: doType.length ? doType : undefined,
  };
};

const emitFuelRecordChange = async (fuelRecordId?: string): Promise<void> => {
  // No id means the DO edit/cancel didn't actually touch a fuel record
  // (e.g. a non-cascading field change, or automation disabled) — so there's
  // nothing for Fuel Records viewers to update and we skip the emit entirely.
  if (!fuelRecordId) return;
  try {
    const rec = await FuelRecord.findById(fuelRecordId).lean();
    emitDataChange('fuel_records', 'update', (rec ?? undefined) as Record<string, any> | undefined);
  } catch {
    // Fall back to a payload-less notify so clients still converge via refetch.
    emitDataChange('fuel_records', 'update');
  }
};

/**
 * Helper: Cascade updates to related fuel records when DO is edited
 * Updates truck number, destination (to/from), loading point, and recalculates totalLts based on new route
 * If route is not found, sets totalLts to null, locks the record, and creates a notification for admin
 * Note: SDO orders are excluded - they don't interact with fuel records
 */
const cascadeUpdateToFuelRecord = async (
  originalDO: any,
  updatedData: any,
  username: string,
  session?: ClientSession
): Promise<{ updated: boolean; fuelRecordId?: string; changes?: string[]; routeNotificationCreated?: boolean }> => {
  const changes: string[] = [];
  const opts = session ? { session } : {};
  
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
      }).session(session || null);
    } else if (originalDO.importOrExport === 'EXPORT') {
      // Find fuel record where this DO is the returnDo
      fuelRecord = await FuelRecord.findOne({
        returnDo: originalDO.doNumber,
        isDeleted: false,
      }).session(session || null);
    }
    
    if (!fuelRecord) {
      logger.info(`No fuel record found for DO ${originalDO.doNumber}`);
      return { updated: false };
    }
    
    const updates: any = {};
    
    // Track truck number changes
    if (updatedData.truckNo && updatedData.truckNo !== originalDO.truckNo) {
      updates.truckNo = updatedData.truckNo;
      changes.push(`Truck: ${originalDO.truckNo} â†’ ${updatedData.truckNo}`);
    }
    
    // Track destination changes (affects 'to' field for IMPORT, 'from' for EXPORT)
    // AND recalculate totalLts based on new route
    if (updatedData.destination && updatedData.destination !== originalDO.destination) {
      if (originalDO.importOrExport === 'IMPORT') {
        updates.to = updatedData.destination;
        changes.push(`Destination (to): ${originalDO.destination} â†’ ${updatedData.destination}`);
        
        // Recalculate totalLts for the new route (from â†’ new destination)
        const newRoute = await RouteConfig.findOne({
          destination: { $regex: new RegExp(`^${updatedData.destination}$`, 'i') },
          isActive: true,
        });
        
        if (newRoute) {
          const oldTotalLts = fuelRecord.totalLts || 0;
          updates.totalLts = newRoute.defaultTotalLiters;
          updates.isLocked = false; // Unlock if route is now found
          updates.pendingConfigReason = null;
          
          // Recalculate balance with new totalLts
          const totalFuel = newRoute.defaultTotalLiters + (fuelRecord.extra || 0);
          const totalCheckpoints = (
            Math.abs(fuelRecord.mmsaYard || 0) +
            Math.abs(fuelRecord.tangaYard || 0) +
            Math.abs(fuelRecord.darYard || 0) +
            Math.abs(fuelRecord.tangaGoing || 0) +
            Math.abs(fuelRecord.darGoing || 0) +
            Math.abs(fuelRecord.moroGoing || 0) +
            Math.abs(fuelRecord.mbeyaGoing || 0) +
            Math.abs(fuelRecord.tdmGoing || 0) +
            Math.abs(fuelRecord.zambiaGoing || 0) +
            Math.abs(fuelRecord.congoFuel || 0) +
            Math.abs(fuelRecord.zambiaReturn || 0) +
            Math.abs(fuelRecord.tundumaReturn || 0) +
            Math.abs(fuelRecord.mbeyaReturn || 0) +
            Math.abs(fuelRecord.moroReturn || 0) +
            Math.abs(fuelRecord.darReturn || 0) +
            Math.abs(fuelRecord.tangaReturn || 0)
          );
          updates.balance = totalFuel - totalCheckpoints;
          
          changes.push(`Total Liters: ${oldTotalLts}L â†’ ${newRoute.defaultTotalLiters}L (route updated)`);
          changes.push(`Balance recalculated: ${updates.balance}L`);
          logger.info(`Recalculated totalLts and balance for IMPORT DO ${originalDO.doNumber}: ${oldTotalLts}L â†’ ${newRoute.defaultTotalLiters}L, balance: ${updates.balance}L`);
        } else {
          // Route not found - set totalLts to null and lock the record
          const oldTotalLts = fuelRecord.totalLts || 0;
          updates.totalLts = null;
          updates.isLocked = true;
          updates.pendingConfigReason = 'missing_total_liters';
          changes.push(`Total Liters: ${oldTotalLts}L â†’ NULL (route not found in database)`);
          logger.warn(`âš ï¸ Route not found for destination "${updatedData.destination}" - fuel record locked, notification will be created`);
          
          // Mark that we need to create notification (will be handled in the main update function)
          (updates as any)._needsRouteNotification = {
            destination: updatedData.destination,
            doNumber: originalDO.doNumber,
            truckNo: fuelRecord.truckNo,
            fuelRecordId: fuelRecord._id.toString(),
            userRole: (updatedData as any).userRole,
            userId: (updatedData as any).userId,
          };
        }
      } else {
        updates.from = updatedData.destination;
        changes.push(`Destination (from): ${originalDO.destination} â†’ ${updatedData.destination}`);
        
        // For EXPORT, recalculate return journey totalLts (new destination â†’ to)
        const returnRoute = await RouteConfig.findOne({
          $or: [
            { origin: { $regex: new RegExp(`^${updatedData.destination}$`, 'i') }, destination: { $regex: new RegExp(`^${fuelRecord.to}$`, 'i') } },
            { destination: { $regex: new RegExp(`^${fuelRecord.to}$`, 'i') } } // Fallback to destination-only match
          ],
          isActive: true,
        });
        
        if (returnRoute) {
          const oldTotalLts = fuelRecord.totalLts || 0;
          updates.totalLts = returnRoute.defaultTotalLiters;
          updates.isLocked = false; // Unlock if route is now found
          updates.pendingConfigReason = null;
          
          // Recalculate balance with new totalLts
          const totalFuel = returnRoute.defaultTotalLiters + (fuelRecord.extra || 0);
          const totalCheckpoints = (
            Math.abs(fuelRecord.mmsaYard || 0) +
            Math.abs(fuelRecord.tangaYard || 0) +
            Math.abs(fuelRecord.darYard || 0) +
            Math.abs(fuelRecord.tangaGoing || 0) +
            Math.abs(fuelRecord.darGoing || 0) +
            Math.abs(fuelRecord.moroGoing || 0) +
            Math.abs(fuelRecord.mbeyaGoing || 0) +
            Math.abs(fuelRecord.tdmGoing || 0) +
            Math.abs(fuelRecord.zambiaGoing || 0) +
            Math.abs(fuelRecord.congoFuel || 0) +
            Math.abs(fuelRecord.zambiaReturn || 0) +
            Math.abs(fuelRecord.tundumaReturn || 0) +
            Math.abs(fuelRecord.mbeyaReturn || 0) +
            Math.abs(fuelRecord.moroReturn || 0) +
            Math.abs(fuelRecord.darReturn || 0) +
            Math.abs(fuelRecord.tangaReturn || 0)
          );
          updates.balance = totalFuel - totalCheckpoints;
          
          changes.push(`Total Liters: ${oldTotalLts}L â†’ ${returnRoute.defaultTotalLiters}L (return route updated)`);
          changes.push(`Balance recalculated: ${updates.balance}L`);
          logger.info(`Recalculated totalLts and balance for EXPORT DO ${originalDO.doNumber}: ${oldTotalLts}L â†’ ${returnRoute.defaultTotalLiters}L, balance: ${updates.balance}L`);
        } else {
          // Return route not found - set totalLts to null and lock the record
          const oldTotalLts = fuelRecord.totalLts || 0;
          updates.totalLts = null;
          updates.isLocked = true;
          updates.pendingConfigReason = 'missing_total_liters';
          changes.push(`Total Liters: ${oldTotalLts}L â†’ NULL (return route not found in database)`);
          logger.warn(`âš ï¸ Return route not found from "${updatedData.destination}" to "${fuelRecord.to}" - fuel record locked, notification will be created`);
          
          // Mark that we need to create notification
          (updates as any)._needsRouteNotification = {
            destination: `${updatedData.destination} â†’ ${fuelRecord.to}`,
            doNumber: originalDO.doNumber,
            truckNo: fuelRecord.truckNo,
            fuelRecordId: fuelRecord._id.toString(),
            userRole: (updatedData as any).userRole,
            userId: (updatedData as any).userId,
          };
        }
      }
    }
    
    // Track loading point changes (affects 'from' field for IMPORT, 'to' for EXPORT)
    // AND recalculate totalLts based on new route if applicable
    if (updatedData.loadingPoint && updatedData.loadingPoint !== originalDO.loadingPoint) {
      if (originalDO.importOrExport === 'IMPORT') {
        updates.from = updatedData.loadingPoint;
        changes.push(`Loading Point (from): ${originalDO.loadingPoint} â†’ ${updatedData.loadingPoint}`);
        
        // Recalculate totalLts for new route (new loading point â†’ destination)
        const newRoute = await RouteConfig.findOne({
          $or: [
            { origin: { $regex: new RegExp(`^${updatedData.loadingPoint}$`, 'i') }, destination: { $regex: new RegExp(`^${fuelRecord.to}$`, 'i') } },
            { destination: { $regex: new RegExp(`^${fuelRecord.to}$`, 'i') } } // Fallback to destination-only match
          ],
          isActive: true,
        });
        
        if (newRoute) {
          const oldTotalLts = fuelRecord.totalLts || 0;
          updates.totalLts = newRoute.defaultTotalLiters;
          updates.isLocked = false; // Unlock if route is now found
          updates.pendingConfigReason = null;
          
          // Recalculate balance with new totalLts
          const totalFuel = newRoute.defaultTotalLiters + (fuelRecord.extra || 0);
          const totalCheckpoints = (
            Math.abs(fuelRecord.mmsaYard || 0) +
            Math.abs(fuelRecord.tangaYard || 0) +
            Math.abs(fuelRecord.darYard || 0) +
            Math.abs(fuelRecord.tangaGoing || 0) +
            Math.abs(fuelRecord.darGoing || 0) +
            Math.abs(fuelRecord.moroGoing || 0) +
            Math.abs(fuelRecord.mbeyaGoing || 0) +
            Math.abs(fuelRecord.tdmGoing || 0) +
            Math.abs(fuelRecord.zambiaGoing || 0) +
            Math.abs(fuelRecord.congoFuel || 0) +
            Math.abs(fuelRecord.zambiaReturn || 0) +
            Math.abs(fuelRecord.tundumaReturn || 0) +
            Math.abs(fuelRecord.mbeyaReturn || 0) +
            Math.abs(fuelRecord.moroReturn || 0) +
            Math.abs(fuelRecord.darReturn || 0) +
            Math.abs(fuelRecord.tangaReturn || 0)
          );
          updates.balance = totalFuel - totalCheckpoints;
          
          changes.push(`Total Liters: ${oldTotalLts}L â†’ ${newRoute.defaultTotalLiters}L (route updated with new origin)`);
          changes.push(`Balance recalculated: ${updates.balance}L`);
          logger.info(`Recalculated totalLts and balance for IMPORT DO ${originalDO.doNumber} with new loading point: ${oldTotalLts}L â†’ ${newRoute.defaultTotalLiters}L, balance: ${updates.balance}L`);
        } else {
          // Route not found - set totalLts to null and lock the record
          const oldTotalLts = fuelRecord.totalLts || 0;
          updates.totalLts = null;
          updates.isLocked = true;
          updates.pendingConfigReason = 'missing_total_liters';
          changes.push(`Total Liters: ${oldTotalLts}L â†’ NULL (route not found in database)`);
          logger.warn(`âš ï¸ Route not found from "${updatedData.loadingPoint}" to "${fuelRecord.to}" - fuel record locked, notification will be created`);
          
          // Mark that we need to create notification
          (updates as any)._needsRouteNotification = {
            destination: `${updatedData.loadingPoint} â†’ ${fuelRecord.to}`,
            doNumber: originalDO.doNumber,
            truckNo: fuelRecord.truckNo,
            fuelRecordId: fuelRecord._id.toString(),
            userRole: (updatedData as any).userRole,
            userId: (updatedData as any).userId,
          };
        }
      } else {
        updates.to = updatedData.loadingPoint;
        changes.push(`Loading Point (to): ${originalDO.loadingPoint} â†’ ${updatedData.loadingPoint}`);
      }
    }
    
    // Apply updates if any
    if (Object.keys(updates).length > 0) {
      // Extract notification metadata before deleting it
      const needsRouteNotification = (updates as any)._needsRouteNotification;
      delete (updates as any)._needsRouteNotification;
      
      // Update fuel record
      await FuelRecord.findByIdAndUpdate(fuelRecord._id, updates, opts);
      logger.info(`Fuel record ${fuelRecord._id} updated due to DO changes: ${changes.join(', ')}`);
      
      // Create notification if route was not found
      if (needsRouteNotification) {
        const { createMissingConfigNotification } = await import('./notificationController');
        await createMissingConfigNotification(
          needsRouteNotification.fuelRecordId,
          ['totalLiters'],
          {
            doNumber: needsRouteNotification.doNumber,
            truckNo: needsRouteNotification.truckNo,
            destination: needsRouteNotification.destination,
          },
          username,
          needsRouteNotification.userRole,
          needsRouteNotification.userId
        );
        logger.info(`ðŸ“¢ Notifications created for missing route: ${needsRouteNotification.destination} (creator: ${username}, role: ${needsRouteNotification.userRole})`);
      }
      
      return { updated: true, fuelRecordId: fuelRecord._id.toString(), changes, routeNotificationCreated: !!needsRouteNotification };
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
  username: string,
  session?: ClientSession
): Promise<{ cancelled: boolean; fuelRecordId?: string; action?: string }> => {
  const opts = session ? { session } : {};
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
      }).session(session || null);
      
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
      }, opts);
      
      logger.info(`Fuel record ${fuelRecord._id} fully cancelled due to going DO ${deliveryOrder.doNumber} cancellation. Reason: ${cancellationReason}`);
      
      return { cancelled: true, fuelRecordId: fuelRecord._id.toString(), action: 'fully_cancelled' };
      
    } else if (deliveryOrder.importOrExport === 'EXPORT') {
      // Find fuel record where this DO is the returnDo
      fuelRecord = await FuelRecord.findOne({
        returnDo: deliveryOrder.doNumber,
        isDeleted: false,
        isCancelled: { $ne: true },
      }).session(session || null);
      
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
        }).session(session || null);
        
        if (goingDO) {
          revertFrom = goingDO.destination; // For IMPORT, from is destination (e.g., Zambia)
          revertTo = goingDO.loadingPoint; // For IMPORT, to is loading point (e.g., Dar)
        } else {
          // Fallback: Keep current from, just remove to extension
          revertFrom = fuelRecord.from;
          revertTo = fuelRecord.to;
        }
      }
      
      // Look up the EXPORT route to find how many liters were added when this DO was linked
      let exportRouteLiters = 0;
      const exportRoute = await RouteConfig.findOne({
        $or: [
          {
            origin: { $regex: new RegExp(`^${deliveryOrder.loadingPoint}$`, 'i') },
            destination: { $regex: new RegExp(`^${deliveryOrder.destination}$`, 'i') },
            routeType: 'EXPORT',
            isActive: true,
          },
          {
            destination: { $regex: new RegExp(`^${deliveryOrder.destination}$`, 'i') },
            routeType: 'EXPORT',
            isActive: true,
          },
        ],
      });

      if (exportRoute) {
        exportRouteLiters = exportRoute.defaultTotalLiters;
      }

      // Deduct the export route liters from totalLts
      const originalTotalLts = fuelRecord.totalLts || 0;
      const newTotalLts = Math.max(0, originalTotalLts - exportRouteLiters);

      // Recalculate balance: (totalLts + extra) - sum of all checkpoint allocations
      const totalFuel = newTotalLts + (fuelRecord.extra || 0);
      const totalCheckpoints = (
        Math.abs(fuelRecord.mmsaYard || 0) +
        Math.abs(fuelRecord.tangaYard || 0) +
        Math.abs(fuelRecord.darYard || 0) +
        Math.abs(fuelRecord.darGoing || 0) +
        Math.abs(fuelRecord.moroGoing || 0) +
        Math.abs(fuelRecord.mbeyaGoing || 0) +
        Math.abs(fuelRecord.tdmGoing || 0) +
        Math.abs(fuelRecord.zambiaGoing || 0) +
        Math.abs(fuelRecord.congoFuel || 0) +
        Math.abs(fuelRecord.zambiaReturn || 0) +
        Math.abs(fuelRecord.tundumaReturn || 0) +
        Math.abs(fuelRecord.mbeyaReturn || 0) +
        Math.abs(fuelRecord.moroReturn || 0) +
        Math.abs(fuelRecord.darReturn || 0) +
        Math.abs(fuelRecord.tangaReturn || 0)
      );
      const newBalance = totalFuel - totalCheckpoints;

      // Clear all return fuel allocations and deduct export fuel
      const updateData: any = {
        returnDo: null, // Remove the return DO
        from: revertFrom,
        to: revertTo,
        // Clear original going values since there's no return DO now
        originalGoingFrom: null,
        originalGoingTo: null,
        // Deduct export route liters from totalLts and recalculate balance
        totalLts: newTotalLts,
        balance: newBalance,
        // Clear return fuel allocations
        zambiaReturn: 0,
        tundumaReturn: 0,
        mbeyaReturn: 0,
        moroReturn: 0,
        darReturn: 0,
        tangaReturn: 0,
      };
      
      await FuelRecord.findByIdAndUpdate(fuelRecord._id, updateData, opts);
      
      logger.info(`Fuel record ${fuelRecord._id} return DO ${deliveryOrder.doNumber} removed and reverted to going-only journey. From: ${revertFrom}, To: ${revertTo}. TotalLts: ${originalTotalLts}L → ${newTotalLts}L (deducted ${exportRouteLiters}L from export route). Balance recalculated: ${newBalance}L. Reason: ${cancellationReason}`);
      
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
  updates?: { truckNo?: string; destination?: string },
  session?: ClientSession
): Promise<{ count: number }> => {
  const opts = session ? { session } : {};
  try {
    if (action === 'cancel') {
      // Mark matching entries as cancelled inside LPOSummary documents
      const result = await LPOSummary.updateMany(
        { isDeleted: false, 'entries.doNo': doNumber, 'entries.isCancelled': { $ne: true } },
        {
          $set: {
            'entries.$[e].isCancelled': true,
            'entries.$[e].cancelledAt': new Date(),
          },
        },
        { arrayFilters: [{ 'e.doNo': doNumber, 'e.isCancelled': { $ne: true } }], ...opts }
      );
      logger.info(`Cancelled LPO entries for DO ${doNumber} in ${result.modifiedCount} LPO document(s)`);
      return { count: result.modifiedCount };
    } else if (action === 'update' && updates) {
      const setFields: any = {};
      if (updates.truckNo) setFields['entries.$[e].truckNo'] = updates.truckNo;
      if (updates.destination) setFields['entries.$[e].dest'] = updates.destination;

      if (Object.keys(setFields).length > 0) {
        const result = await LPOSummary.updateMany(
          { isDeleted: false, 'entries.doNo': doNumber },
          { $set: setFields },
          { arrayFilters: [{ 'e.doNo': doNumber }], ...opts }
        );
        logger.info(`Updated LPO entries for DO ${doNumber} in ${result.modifiedCount} LPO document(s)`);
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
 * Get distinct year-month periods that have delivery order data.
 * Used by the frontend period picker so it doesn't need to load all orders.
 */
export const getAvailablePeriods = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { importOrExport, doType, status } = req.query;
    const filter: any = { isDeleted: false };

    if (req.user?.role === 'driver') {
      filter.truckNo = req.user.username;
    }

    if (status === 'active') {
      filter.isCancelled = { $ne: true };
    } else if (status === 'cancelled') {
      filter.isCancelled = true;
    }

    if (doType && (doType === 'DO' || doType === 'SDO')) {
      filter.doType = doType;
    }

    if (importOrExport && importOrExport !== 'ALL') {
      filter.importOrExport = importOrExport;
    }

    const dates = await DeliveryOrder.distinct('date', filter);
    const seen = new Map<string, { year: number; month: number }>();

    for (const dateStr of dates) {
      if (!dateStr) continue;
      let year: number | null = null;
      let month: number | null = null;

      const iso = (dateStr as string).match(/^(\d{4})-(\d{2})-\d{2}/);
      if (iso) {
        year = parseInt(iso[1]);
        month = parseInt(iso[2]);
      } else {
        const d = new Date(dateStr as string);
        if (!isNaN(d.getTime())) {
          year = d.getFullYear();
          month = d.getMonth() + 1;
        }
      }

      if (year !== null && month !== null) {
        const key = `${year}-${month}`;
        if (!seen.has(key)) seen.set(key, { year, month });
      }
    }

    const periods = Array.from(seen.values()).sort((a, b) =>
      b.year !== a.year ? b.year - a.year : a.month - b.month
    );

    res.json(periods);
  } catch (error) {
    logger.error('Error fetching available periods:', error);
    throw new ApiError(500, 'Failed to fetch available periods');
  }
};

/**
 * Aggregate delivery-order summary metrics server-side for the DO Summary tab.
 * Returns totals + per-client + per-destination breakdowns for the given
 * filters/date-range, spanning BOTH the active and archived collections so
 * historical (e.g. imported) months are included. Cancelled and soft-deleted
 * orders are always excluded — the summary reflects live orders only.
 */
export const getDeliveryOrderSummaryAggregate = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { importOrExport, doType, dateFrom, dateTo } = req.query;

    const match: any = { isDeleted: { $ne: true }, isCancelled: { $ne: true } };

    // Restrict drivers to their own truck's records (least-privilege).
    if (req.user?.role === 'driver') {
      match.truckNo = req.user.username;
    }
    if (doType && (doType === 'DO' || doType === 'SDO')) {
      match.doType = doType;
    }
    if (importOrExport && importOrExport !== 'ALL') {
      match.importOrExport = importOrExport;
    }
    if (dateFrom || dateTo) {
      match.date = {};
      if (dateFrom) match.date.$gte = dateFrom;
      if (dateTo) match.date.$lte = dateTo;
    }

    const revenueExpr = { $multiply: [{ $ifNull: ['$tonnages', 0] }, { $ifNull: ['$ratePerTon', 0] }] };

    const pipeline: any[] = [
      { $match: match },
      // Merge archived DOs matching the same filter so old/imported months count.
      { $unionWith: { coll: ArchivedDeliveryOrder.collection.name, pipeline: [{ $match: match }] } },
      {
        $facet: {
          totals: [
            {
              $group: {
                _id: null,
                totalOrders: { $sum: 1 },
                totalImport: { $sum: { $cond: [{ $eq: ['$importOrExport', 'IMPORT'] }, 1, 0] } },
                totalExport: { $sum: { $cond: [{ $eq: ['$importOrExport', 'EXPORT'] }, 1, 0] } },
                totalTonnage: { $sum: { $ifNull: ['$tonnages', 0] } },
                totalRevenue: { $sum: revenueExpr },
              },
            },
          ],
          byClient: [
            {
              $group: {
                _id: { $ifNull: ['$clientName', 'Unknown'] },
                orders: { $sum: 1 },
                tonnage: { $sum: { $ifNull: ['$tonnages', 0] } },
                revenue: { $sum: revenueExpr },
              },
            },
          ],
          byDestination: [
            {
              $group: {
                _id: { $ifNull: ['$destination', 'Unknown'] },
                orders: { $sum: 1 },
              },
            },
          ],
        },
      },
    ];

    const [result] = await DeliveryOrder.aggregate(pipeline);
    const totalsRow = result?.totals?.[0] || {};

    const byClient: Record<string, { orders: number; tonnage: number; revenue: number }> = {};
    for (const c of result?.byClient || []) {
      byClient[c._id] = { orders: c.orders, tonnage: c.tonnage, revenue: c.revenue };
    }
    const byDestination: Record<string, number> = {};
    for (const d of result?.byDestination || []) {
      byDestination[d._id] = d.orders;
    }

    res.json({
      totalOrders: totalsRow.totalOrders || 0,
      totalImport: totalsRow.totalImport || 0,
      totalExport: totalsRow.totalExport || 0,
      totalTonnage: totalsRow.totalTonnage || 0,
      totalRevenue: totalsRow.totalRevenue || 0,
      byClient,
      byDestination,
    });
  } catch (error) {
    logger.error('Error aggregating delivery order summary:', error);
    throw new ApiError(500, 'Failed to aggregate delivery order summary');
  }
};

/**
 * Get all delivery orders with pagination and filters
 */
export const getAllDeliveryOrders = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    let { page, limit, sort, order } = getPaginationParams(req.query);
    const dashboardLimits = await resolveDashboardSearchLimits('do', req.query);
    if (dashboardLimits) {
      page = dashboardLimits.page;
      limit = dashboardLimits.limit;
    }

    const { dateFrom, dateTo, clientName, truckNo, importOrExport, destination, doType, search, status } = req.query;
    const effectiveDateFrom = dashboardLimits?.dateFrom ?? dateFrom;
    const effectiveDateTo = dashboardLimits?.dateTo ?? dateTo;

    // Build filter
    const filter: any = { isDeleted: false };

    // Restrict drivers to their own truck's records (least-privilege)
    if (req.user?.role === 'driver') {
      filter.truckNo = req.user.username;
    }

    // Filter by status (active / cancelled)
    if (status === 'active') {
      filter.isCancelled = { $ne: true };
    } else if (status === 'cancelled') {
      filter.isCancelled = true;
    }
    // 'all' or undefined = no isCancelled filter

    // Filter by doType if specified (DO or SDO), otherwise return all
    if (doType && (doType === 'DO' || doType === 'SDO')) {
      filter.doType = doType;
    }

    if (effectiveDateFrom || effectiveDateTo) {
      filter.date = {};
      if (effectiveDateFrom) filter.date.$gte = effectiveDateFrom;
      if (effectiveDateTo) filter.date.$lte = effectiveDateTo;
    }

    // Unified search parameter - searches across multiple fields
    if (search) {
      const sanitized = sanitizeRegexInput(search as string);
      // Identifier fields (DO number, truck no) use a whitespace/separator-tolerant
      // prefix match so spacing/format drift ("T598 DTB" vs "T598DTB") still matches.
      const fuzzy = buildFuzzyRegex(search as string);
      if (sanitized || fuzzy) {
        const idRegex = fuzzy || `^${sanitized}`;
        filter.$or = [
          { doNumber: { $regex: idRegex, $options: 'i' } },
          { truckNo: { $regex: idRegex, $options: 'i' } },
          { clientName: { $regex: sanitized, $options: 'i' } },
          { destination: { $regex: sanitized, $options: 'i' } },
          { haulier: { $regex: sanitized, $options: 'i' } }
        ];
      }
    } else {
      // Individual field filters (backward compatibility)
      if (clientName) {
        const sanitized = sanitizeRegexInput(clientName as string);
        if (sanitized) {
          filter.clientName = { $regex: sanitized, $options: 'i' };
        }
      }

      if (truckNo) {
        const sanitized = sanitizeRegexInput(truckNo as string);
        if (sanitized) {
          filter.truckNo = { $regex: sanitized, $options: 'i' };
        }
      }

      if (destination) {
        const sanitized = sanitizeRegexInput(destination as string);
        if (sanitized) {
          filter.destination = { $regex: sanitized, $options: 'i' };
        }
      }
    }

    if (importOrExport && importOrExport !== 'ALL') {
      filter.importOrExport = importOrExport;
    }

    // A date filter used to force the slow "merged" path below, which loads
    // every matching active + archived row into memory and paginates in JS.
    // The DO page filters by the current month by default, so that was the
    // path taken on every load and every page click. Only take it when the
    // archive actually contains matching rows (a cheap indexed count) —
    // otherwise the normal indexed skip/limit query handles the date range.
    let includeArchived = false;
    if (effectiveDateFrom || effectiveDateTo) {
      try {
        const archivedCount = await ArchivedDeliveryOrder.countDocuments({
          ...filter,
          isDeleted: { $ne: true },
        });
        includeArchived = archivedCount > 0;
      } catch (archErr: any) {
        logger.warn(`Archived DO count failed — using active-only path: ${archErr.message}`);
      }
    }
    let deliveryOrders: any[];
    let total: number;

    if (includeArchived) {
      // Use unified export service to get both active and archived data
      const startDate = effectiveDateFrom ? new Date(effectiveDateFrom as string) : undefined;
      const endDate = effectiveDateTo ? new Date(effectiveDateTo as string) : undefined;
      
      const allOrders = await unifiedExportService.getAllDeliveryOrders({
        startDate,
        endDate,
        includeArchived: true,
        filters: { ...filter, isDeleted: { $ne: true } },
      });

      // Apply additional filters (archived data might not have been filtered)
      let filteredOrders = allOrders;
      if (clientName) {
        const regex = new RegExp(sanitizeRegexInput(clientName as string), 'i');
        filteredOrders = filteredOrders.filter(o => regex.test(o.clientName));
      }
      if (truckNo) {
        const regex = new RegExp(sanitizeRegexInput(truckNo as string), 'i');
        filteredOrders = filteredOrders.filter(o => regex.test(o.truckNo));
      }
      if (destination) {
        const regex = new RegExp(sanitizeRegexInput(destination as string), 'i');
        filteredOrders = filteredOrders.filter(o => regex.test(o.destination || ''));
      }
      if (importOrExport && importOrExport !== 'ALL') {
        filteredOrders = filteredOrders.filter(o => o.importOrExport === importOrExport);
      }
      if (doType) {
        filteredOrders = filteredOrders.filter(o => o.doType === doType);
      }

      // Sort
      const sortField = sort || 'date';
      const sortDir = order === 'asc' ? 1 : -1;
      filteredOrders.sort((a, b) => {
        const aVal = a[sortField];
        const bVal = b[sortField];
        if (aVal < bVal) return -sortDir;
        if (aVal > bVal) return sortDir;
        return 0;
      });

      // Paginate in memory
      total = filteredOrders.length;
      const skip = calculateSkip(page, limit);
      deliveryOrders = filteredOrders.slice(skip, skip + limit);
    } else {
      // No date filter - only query active data (normal pagination)
      const skip = calculateSkip(page, limit);
      const sortOrder = order === 'asc' ? 1 : -1;

      [deliveryOrders, total] = await Promise.all([
        DeliveryOrder.find(filter)
          .sort({ [sort]: sortOrder })
          .skip(skip)
          .limit(limit)
          .lean(),
        DeliveryOrder.countDocuments(filter),
      ]);
    }

    // Attach live edit-lock info so the "Editing: …" badge shows on load.
    await attachLocks('delivery_orders', deliveryOrders);

    // Annotate EXPORT DOs with whether they already have a linked fuel record
    // (a fuel record whose returnDo == this DO number). Lets the DO list show a
    // Link button / status only for unlinked EXPORT DOs without an extra call per row.
    try {
      const exportDoNumbers = (deliveryOrders as any[])
        .filter((o) => o.importOrExport === 'EXPORT' && o.doType === 'DO' && o.doNumber)
        .map((o) => o.doNumber);
      if (exportDoNumbers.length > 0) {
        const linkedRecords = await FuelRecord.find({
          returnDo: { $in: exportDoNumbers },
          isDeleted: false,
        })
          .select('returnDo')
          .lean();
        const linkedSet = new Set(linkedRecords.map((r: any) => r.returnDo));
        for (const o of deliveryOrders as any[]) {
          if (o.importOrExport === 'EXPORT' && o.doType === 'DO') {
            o.isLinkedToFuelRecord = linkedSet.has(o.doNumber);
          }
        }
      }
    } catch (linkErr: any) {
      logger.warn(`Export link-status annotation failed: ${linkErr.message}`);
    }

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

// ── Shared fuel-record orchestration (used by single + bulk DO creation) ──────

type LockedFuelNotif = {
  id: string;
  missingFields: Array<'totalLiters' | 'extraFuel'>;
  doNumber: string;
  truckNo: string;
  destination: string;
  truckSuffix: string;
};
type UnlinkedExportNotif = {
  id: string;
  doNumber: string;
  truckNo: string;
  destination: string;
  loadingPoint: string;
};

/** Load active routes + truck-batch config once. Shared by single + bulk paths. */
const loadFuelConfig = async (): Promise<{ routes: RouteLike[]; truckBatches: Record<string, any>; batchDestinationRules: Record<string, any> }> => {
  const { SystemConfig } = await import('../models/SystemConfig');
  const [routeDocs, batchConfig] = await Promise.all([
    RouteConfig.find({ isActive: true }).lean(),
    SystemConfig.findOne({ configType: 'truck_batches', isDeleted: false }).lean(),
  ]);
  return {
    routes: routeDocs as unknown as RouteLike[],
    truckBatches: (batchConfig?.truckBatches as Record<string, any>) || {},
    batchDestinationRules: (batchConfig?.batchDestinationRules as Record<string, any>) || {},
  };
};

/**
 * Build + insert going-journey fuel records for a set of IMPORT delivery orders.
 * Trucks with an existing active journey are queued (with a contiguous queueOrder);
 * records missing route/batch config are locked. Pending yard-fuel entries are
 * auto-linked. Returns the queued count and the locked-record notifications to
 * dispatch (the caller owns notification side-effects). Single create passes a
 * 1-element array — same path as the bulk endpoint, no duplicated logic.
 */
const applyImportFuelRecords = async (
  importDOs: any[],
  routes: RouteLike[],
  truckBatches: Record<string, any>,
  username: string,
  batchDestinationRules: Record<string, any> = {},
): Promise<{ queuedCount: number; lockedNotifs: LockedFuelNotif[]; createdFuelDates: string[]; createdFuelIds: string[] }> => {
  let queuedCount = 0;
  const lockedNotifs: LockedFuelNotif[] = [];
  if (importDOs.length === 0) return { queuedCount, lockedNotifs, createdFuelDates: [], createdFuelIds: [] };

  const importTrucks = [...new Set(importDOs.map((o: any) => o.truckNo))];
  const [activeRecords, queuedRecords] = await Promise.all([
    FuelRecord.find({ truckNo: { $in: importTrucks }, journeyStatus: 'active', isDeleted: false }).select('_id truckNo').lean(),
    FuelRecord.find({ truckNo: { $in: importTrucks }, journeyStatus: 'queued', isDeleted: false }).select('truckNo').lean(),
  ]);

  // Per-truck journey state, seeded from the DB and updated as we build the batch
  const truckState = new Map<string, { activeId: string | null; queuedCount: number }>();
  for (const t of importTrucks) truckState.set(t, { activeId: null, queuedCount: 0 });
  for (const r of activeRecords) {
    const s = truckState.get(r.truckNo)!;
    s.activeId = String(r._id);
  }
  for (const r of queuedRecords) {
    const s = truckState.get(r.truckNo)!;
    s.queuedCount += 1;
  }

  const fuelRecordsToInsert: any[] = [];
  const linkTargets: Array<{ id: string; truckNo: string; doNumber: string; date: string }> = [];

  for (const order of importDOs) {
    const routeMatch = matchRouteLiters(routes, order.destination);
    const totalLiters = routeMatch.matched ? routeMatch.liters : null;

    const batchMatch = matchExtraFuel(order.truckNo, truckBatches, order.destination, batchDestinationRules);
    // Mirror the client: unmatched batch → null extra → record is locked
    const extraFuel = batchMatch.matched ? batchMatch.extraFuel : null;

    const built = buildImportFuelRecord(order as unknown as DeliveryOrderLike, totalLiters, extraFuel);
    const rec = built.fuelRecord;
    const _id = new mongoose.Types.ObjectId();
    rec._id = _id;

    const state = truckState.get(order.truckNo)!;
    if (state.activeId) {
      rec.journeyStatus = 'queued';
      rec.queueOrder = state.queuedCount + 1;
      rec.previousJourneyId = state.activeId;
      state.queuedCount += 1;
      queuedCount += 1;
    } else {
      rec.journeyStatus = 'active';
      rec.activatedAt = new Date();
      state.activeId = String(_id);
    }

    fuelRecordsToInsert.push(rec);
    linkTargets.push({ id: String(_id), truckNo: order.truckNo, doNumber: order.doNumber, date: order.date });

    if (built.isLocked) {
      lockedNotifs.push({
        id: String(_id),
        missingFields: built.missingFields,
        doNumber: order.doNumber,
        truckNo: order.truckNo,
        destination: order.destination,
        truckSuffix: (batchMatch.truckSuffix || '').toUpperCase(),
      });
    }
  }

  try {
    await FuelRecord.insertMany(fuelRecordsToInsert, { ordered: false });
  } catch (err: any) {
    logger.error('Fuel record insert had errors:', err?.message || err);
  }

  // Auto-link any pending yard fuel entries, parallelized
  try {
    const { linkPendingYardFuelDirect } = await import('./yardFuelController');
    await Promise.all(
      linkTargets.map(t =>
        linkPendingYardFuelDirect(t.id, t.truckNo, t.doNumber, t.date, username).catch(e => {
          logger.warn(`Yard-fuel auto-link failed for ${t.truckNo}: ${e?.message || e}`);
          return { linkedCount: 0 };
        })
      )
    );
  } catch (e: any) {
    logger.warn('Yard-fuel auto-link step skipped:', e?.message || e);
  }

  const createdFuelDates = fuelRecordsToInsert
    .map((r: any) => r.date)
    .filter((d: any) => d != null)
    .map((d: any) => String(d));
  const createdFuelIds = fuelRecordsToInsert
    .map((r: any) => r._id)
    .filter((idv: any) => idv != null)
    .map((idv: any) => String(idv));

  return { queuedCount, lockedNotifs, createdFuelDates, createdFuelIds };
};

/**
 * Update the matching going record with return-leg fuel for a set of EXPORT DOs.
 * Each export matches the most recent going record for its truck that has no
 * return DO yet; unmatched exports are returned for notification. Returns the
 * unlinked exports the caller should notify on.
 */
const applyExportFuelUpdates = async (
  exportDOs: any[],
  routes: RouteLike[],
): Promise<{ unlinkedExports: UnlinkedExportNotif[]; updatedFuelIds: string[] }> => {
  const unlinkedExports: UnlinkedExportNotif[] = [];
  if (exportDOs.length === 0) return { unlinkedExports, updatedFuelIds: [] };

  const exportTrucks = [...new Set(exportDOs.map((o: any) => o.truckNo))];
  const goingRecords = await FuelRecord.find({
    truckNo: { $in: exportTrucks },
    journeyStatus: 'active',
    isDeleted: false,
    $or: [{ returnDo: { $exists: false } }, { returnDo: null }, { returnDo: '' }],
  })
    .sort({ date: -1 })
    .lean();

  // Most recent unmatched going record per truck
  const recordByTruck = new Map<string, any>();
  for (const r of goingRecords) {
    if (!recordByTruck.has(r.truckNo)) recordByTruck.set(r.truckNo, r);
  }

  const usedRecordIds = new Set<string>();
  const bulkOps: any[] = [];
  for (const order of exportDOs) {
    const match = recordByTruck.get(order.truckNo);
    if (!match || usedRecordIds.has(String(match._id))) {
      unlinkedExports.push({ id: String(order._id), doNumber: order.doNumber, truckNo: order.truckNo, destination: order.destination, loadingPoint: order.loadingPoint });
      continue;
    }
    usedRecordIds.add(String(match._id));
    const routeMatch = matchExportRouteLiters(routes, order.loadingPoint || '', order.destination || '');
    const { update } = buildReturnUpdate(match, order as unknown as DeliveryOrderLike, routeMatch.liters);
    bulkOps.push({ updateOne: { filter: { _id: match._id }, update: { $set: update } } });
  }

  if (bulkOps.length > 0) {
    try {
      await FuelRecord.bulkWrite(bulkOps, { ordered: false });
    } catch (err: any) {
      logger.error('Fuel record update (export) had errors:', err?.message || err);
    }
  }

  return { unlinkedExports, updatedFuelIds: Array.from(usedRecordIds) };
};

/**
 * Create new delivery order
 */
export const createDeliveryOrder = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const username = req.user?.username;
    if (!username) throw new ApiError(401, 'Authentication required');
    const { enforceResourceLock } = await import('./resourceLockController');
    await enforceResourceLock('do_create', username);

    const payload = matchedData(req, { locations: ['body'] }) as any;

    // If sn is not provided, derive it from doNumber
    if (!payload.sn && payload.doNumber) {
      payload.sn = parseInt(payload.doNumber.replace(/^0+/, '')) || 1;
    }
    
    // Set defaults for new fields if not provided
    if (!payload.rateType) {
      payload.rateType = 'per_ton';
    }
    if (!payload.cargoType && payload.containerNo) {
      payload.cargoType = payload.containerNo?.toLowerCase().includes('container') 
        ? 'container' 
        : 'loosecargo';
    } else if (!payload.cargoType) {
      payload.cargoType = 'loosecargo';
    }
    
    // Calculate totalAmount if not provided
    if (!payload.totalAmount) {
      if (payload.rateType === 'per_ton') {
        payload.totalAmount = (payload.tonnages || 0) * (payload.ratePerTon || 0);
      } else if (payload.rateType === 'fixed_total') {
        payload.totalAmount = payload.ratePerTon || 0;
      }
    }
    
    const deliveryOrder = await DeliveryOrder.create(payload);

    logger.info(`Delivery order created: ${deliveryOrder.doNumber} by ${req.user?.username}`);

    // ── Server-side fuel-record side-effects (previously done in the browser) ──
    // IMPORT → create a going-journey fuel record. EXPORT → fill the return leg of
    // the matched going record. SDO → nothing. Each gated by its automation toggle.
    const userId = req.user?.userId || 'system';
    const userRole = req.user?.role;
    const order = deliveryOrder.toObject() as any;
    let fuelAutomationSkipped: string | null = null;
    // Fuel-record side-effect ids captured for a precise realtime broadcast.
    let newFuelId: string | undefined;
    let updatedFuelId: string | undefined;

    if (order.doType === 'DO' && (order.importOrExport === 'IMPORT' || order.importOrExport === 'EXPORT')) {
      const fuelFlags = await getFuelAutomationFlags();
      try {
        if (order.importOrExport === 'IMPORT') {
          if (fuelFlags.doImportCreate) {
            const { routes, truckBatches, batchDestinationRules: bdr } = await loadFuelConfig();
            const { lockedNotifs, createdFuelIds } = await applyImportFuelRecords([order], routes, truckBatches, username, bdr);
            newFuelId = createdFuelIds[0];
            if (lockedNotifs.length > 0) {
              const { createMissingConfigNotification } = await import('./notificationController');
              for (const n of lockedNotifs) {
                await createMissingConfigNotification(n.id, n.missingFields, { doNumber: n.doNumber, truckNo: n.truckNo, destination: n.destination, truckSuffix: n.truckSuffix }, username, userRole, userId)
                  .catch(e => logger.warn(`Missing-config notification failed for ${n.doNumber}: ${e?.message || e}`));
              }
            }
          } else {
            fuelAutomationSkipped = 'doImportCreate';
          }
        } else {
          if (fuelFlags.doExportUpdate) {
            const { routes } = await loadFuelConfig();
            const { unlinkedExports, updatedFuelIds } = await applyExportFuelUpdates([order], routes);
            updatedFuelId = updatedFuelIds[0];
            if (unlinkedExports.length > 0) {
              const { createUnlinkedExportDONotification } = await import('./notificationController');
              for (const u of unlinkedExports) {
                await createUnlinkedExportDONotification(u.id, { doNumber: u.doNumber, truckNo: u.truckNo, destination: u.destination, loadingPoint: u.loadingPoint }, username)
                  .catch(e => logger.warn(`Unlinked-export notification failed for ${u.doNumber}: ${e?.message || e}`));
              }
            }
          } else {
            fuelAutomationSkipped = 'doExportUpdate';
          }
        }
      } catch (e: any) {
        // Fuel side-effects must not fail the DO creation; the DO is already saved.
        logger.error(`Fuel-record side-effect failed for DO ${order.doNumber}: ${e?.message || e}`);
      }

      if (fuelAutomationSkipped) {
        logger.info(`[fuelAutomation] ${fuelAutomationSkipped} OFF — skipping fuel-record side-effect for DO ${order.doNumber}`);
        await AuditService.log({
          userId: req.user?.userId,
          username,
          action: order.importOrExport === 'IMPORT' ? 'CREATE' : 'UPDATE',
          resourceType: 'FuelRecord',
          resourceId: order.doNumber,
          details: `Fuel-record automation SKIPPED for DO ${order.doNumber} — '${fuelAutomationSkipped}' is disabled. Manual fuel-record management required.`,
          ipAddress: req.ip,
          severity: 'high',
        }).catch((err: any) => logger.warn(`Failed to write audit breadcrumb for skipped fuel automation (DO ${order.doNumber}): ${err?.message}`));
      }
    }

    // Log audit trail
    await AuditService.logCreate(
      req.user?.userId || 'system',
      req.user?.username || 'system',
      'DeliveryOrder',
      deliveryOrder._id.toString(),
      { doNumber: deliveryOrder.doNumber, truckNo: deliveryOrder.truckNo, destination: deliveryOrder.destination },
      req.ip
    );

    res.status(201).json({
      success: true,
      message: fuelAutomationSkipped
        ? 'Delivery order created. Note: fuel-record automation is disabled — manage the fuel record manually.'
        : 'Delivery order created successfully',
      data: deliveryOrder,
    });
    emitDataChange('delivery_orders', 'create', deliveryOrder.toObject());
    // IMPORT created a new going fuel record → 'create' so viewers can offer to
    // load it. EXPORT updated an existing record → patch it in place silently.
    if (newFuelId) {
      try {
        const rec = await FuelRecord.findById(newFuelId).lean();
        if (rec) emitDataChange('fuel_records', 'create', rec as Record<string, any>);
      } catch { /* non-fatal */ }
    } else if (updatedFuelId) {
      await emitFuelRecordChange(updatedFuelId);
    }
  } catch (error: any) {
    throw error;
  }
};

/**
 * Bulk-create delivery orders (and their fuel records) in a single request.
 *
 * Replaces the old client-side loop that issued ~4 round-trips per truck
 * (create DO → fetch all fuel records → fetch routes+batches → create fuel record).
 * Everything now happens server-side with shared reads fetched ONCE and writes
 * batched via insertMany/bulkWrite, so a 10–40 truck batch completes in one call.
 *
 * Behaviour parity with the previous flow:
 *  - DO type SDO: created as orders only, no fuel records.
 *  - DO type DO + IMPORT: a going-journey fuel record is created. Trucks that
 *    already have an active journey are queued (mirrors createFuelRecord).
 *    Locked records (missing route/batch config) trigger admin notifications.
 *  - DO type DO + EXPORT: the most recent going record without a return DO is
 *    updated with return-leg fuel; unmatched returns trigger notifications.
 */
export const createBulkDeliveryOrders = async (req: AuthRequest, res: Response): Promise<void> => {
  const username = req.user?.username || 'system';
  const userId = req.user?.userId || 'system';
  const userRole = req.user?.role;

  if (!req.user?.username) throw new ApiError(401, 'Authentication required');
  const { enforceResourceLock } = await import('./resourceLockController');
  await enforceResourceLock('do_create', req.user.username);

  const incoming = Array.isArray(req.body?.orders) ? req.body.orders : null;
  if (!incoming || incoming.length === 0) {
    throw new ApiError(400, 'Please provide a non-empty "orders" array');
  }
  if (incoming.length > 500) {
    throw new ApiError(400, 'Bulk creation is limited to 500 orders per request');
  }

  // ── 1. Normalize payloads (mirror createDeliveryOrder defaults) ────────────
  const failedReasons: Array<{ truck: string; reason: string }> = [];
  const normalized: any[] = [];
  const seenInRequest = new Set<string>();

  for (const raw of incoming) {
    if (!raw || !raw.doNumber) {
      failedReasons.push({ truck: raw?.truckNo || 'UNKNOWN', reason: 'Missing DO number' });
      continue;
    }
    const payload: any = { ...raw };

    if (!payload.sn && payload.doNumber) {
      payload.sn = parseInt(String(payload.doNumber).replace(/^0+/, ''), 10) || 1;
    }
    if (!payload.rateType) payload.rateType = 'per_ton';
    if (!payload.cargoType && payload.containerNo) {
      payload.cargoType = String(payload.containerNo).toLowerCase().includes('container') ? 'container' : 'loosecargo';
    } else if (!payload.cargoType) {
      payload.cargoType = 'loosecargo';
    }
    if (payload.totalAmount == null) {
      payload.totalAmount = payload.rateType === 'per_ton'
        ? (payload.tonnages || 0) * (payload.ratePerTon || 0)
        : (payload.ratePerTon || 0);
    }
    // insertMany skips the save hook that fills tonnages for fixed_total
    if (payload.rateType === 'fixed_total' && payload.tonnages == null) payload.tonnages = 0;

    // Drop client-only / non-writable fields
    delete payload.id;
    delete payload._id;

    if (seenInRequest.has(payload.doNumber)) {
      failedReasons.push({ truck: `${payload.doType}-${payload.doNumber} (${payload.truckNo})`, reason: 'Duplicate DO number within request' });
      continue;
    }
    seenInRequest.add(payload.doNumber);
    normalized.push(payload);
  }

  // ── 2. Reject DO numbers that already exist in the DB ──────────────────────
  if (normalized.length > 0) {
    const existing = await DeliveryOrder.find({ doNumber: { $in: normalized.map(o => o.doNumber) } })
      .select('doNumber')
      .lean();
    const existingSet = new Set(existing.map(e => e.doNumber));
    if (existingSet.size > 0) {
      for (let i = normalized.length - 1; i >= 0; i--) {
        if (existingSet.has(normalized[i].doNumber)) {
          failedReasons.push({ truck: `${normalized[i].doType}-${normalized[i].doNumber} (${normalized[i].truckNo})`, reason: 'DO number already exists' });
          normalized.splice(i, 1);
        }
      }
    }
  }

  if (normalized.length === 0) {
    res.status(400).json({
      success: false,
      message: 'No valid delivery orders to create',
      data: { createdOrders: [], summary: { totalAttempted: incoming.length, successCount: 0, failedCount: failedReasons.length, queuedCount: 0, failedReasons } },
    });
    return;
  }

  // ── 3. Insert the delivery orders (one batch write) ────────────────────────
  let createdDOs: any[] = [];
  try {
    createdDOs = await DeliveryOrder.insertMany(normalized, { ordered: false });
  } catch (err: any) {
    // ordered:false → valid docs still inserted; collect what failed
    createdDOs = err.insertedDocs || [];
    const insertedNumbers = new Set(createdDOs.map((d: any) => d.doNumber));
    const writeErrors = err.writeErrors || err.result?.result?.writeErrors || [];
    for (const we of writeErrors) {
      const failedDoc = we?.err?.op || we?.getOperation?.() || {};
      failedReasons.push({ truck: `${failedDoc.doType || 'DO'}-${failedDoc.doNumber || '?'} (${failedDoc.truckNo || '?'})`, reason: we?.errmsg || 'Insert failed' });
    }
    // Any normalized order not inserted and not already accounted for
    for (const o of normalized) {
      if (!insertedNumbers.has(o.doNumber) && !failedReasons.some(f => f.truck.includes(o.doNumber))) {
        failedReasons.push({ truck: `${o.doType}-${o.doNumber} (${o.truckNo})`, reason: 'Insert failed' });
      }
    }
  }

  // ── 4. Load shared config ONCE (routes + truck batches) ────────────────────
  const importDOs = createdDOs.filter((o: any) => o.doType === 'DO' && o.importOrExport === 'IMPORT');
  const exportDOs = createdDOs.filter((o: any) => o.doType === 'DO' && o.importOrExport === 'EXPORT');

  // Per-operation automation toggles. When OFF, the DOs are still created but the
  // fuel-record build (import) / return-leg update (export) is skipped.
  const fuelFlags = await getFuelAutomationFlags();
  const automationSkips: string[] = [];

  let routes: RouteLike[] = [];
  let truckBatches: Record<string, any> = {};
  let batchDestinationRules: Record<string, any> = {};
  if ((importDOs.length > 0 && fuelFlags.doImportCreate) || (exportDOs.length > 0 && fuelFlags.doExportUpdate)) {
    const { SystemConfig } = await import('../models/SystemConfig');
    const [routeDocs, batchConfig] = await Promise.all([
      RouteConfig.find({ isActive: true }).lean(),
      SystemConfig.findOne({ configType: 'truck_batches', isDeleted: false }).lean(),
    ]);
    routes = routeDocs as unknown as RouteLike[];
    truckBatches = (batchConfig?.truckBatches as Record<string, any>) || {};
    batchDestinationRules = (batchConfig?.batchDestinationRules as Record<string, any>) || {};
  }

  let queuedCount = 0;
  const lockedNotifs: LockedFuelNotif[] = [];
  const unlinkedExports: UnlinkedExportNotif[] = [];
  // Fuel-record side-effects captured for the realtime broadcast: newly-created
  // going records (drive the "new records" pill) and export-updated going
  // records (patched in place on other clients).
  let createdFuelDates: string[] = [];
  let updatedFuelIds: string[] = [];

  // ── 5. IMPORT: build + insert going-journey fuel records (shared helper) ────
  if (importDOs.length > 0 && fuelFlags.doImportCreate) {
    const importResult = await applyImportFuelRecords(importDOs, routes, truckBatches, username, batchDestinationRules);
    queuedCount = importResult.queuedCount;
    lockedNotifs.push(...importResult.lockedNotifs);
    createdFuelDates = importResult.createdFuelDates;
  } else if (importDOs.length > 0) {
    automationSkips.push(`doImportCreate (${importDOs.length} import DO${importDOs.length === 1 ? '' : 's'} — no fuel records created)`);
    logger.info(`[fuelAutomation] doImportCreate OFF — skipping fuel-record creation for ${importDOs.length} import DO(s)`);
  }

  // ── 6. EXPORT: update the matching going records with return-leg fuel ───────
  if (exportDOs.length > 0 && fuelFlags.doExportUpdate) {
    const exportResult = await applyExportFuelUpdates(exportDOs, routes);
    unlinkedExports.push(...exportResult.unlinkedExports);
    updatedFuelIds = exportResult.updatedFuelIds;
  } else if (exportDOs.length > 0) {
    automationSkips.push(`doExportUpdate (${exportDOs.length} export DO${exportDOs.length === 1 ? '' : 's'} — return leg not applied)`);
    logger.info(`[fuelAutomation] doExportUpdate OFF — skipping return-leg fuel update for ${exportDOs.length} export DO(s)`);
  }

  // ── 7. Notifications (parallel; failures are non-fatal) ────────────────────
  try {
    const { createMissingConfigNotification, createUnlinkedExportDONotification, createBulkDOFailureNotification } =
      await import('./notificationController');

    const notifJobs: Array<Promise<any>> = [];

    for (const n of lockedNotifs) {
      notifJobs.push(
        createMissingConfigNotification(n.id, n.missingFields, { doNumber: n.doNumber, truckNo: n.truckNo, destination: n.destination, truckSuffix: n.truckSuffix }, username, userRole, userId)
          .catch(e => logger.warn(`Missing-config notification failed for ${n.doNumber}: ${e?.message || e}`))
      );
    }
    for (const u of unlinkedExports) {
      notifJobs.push(
        createUnlinkedExportDONotification(u.id, { doNumber: u.doNumber, truckNo: u.truckNo, destination: u.destination, loadingPoint: u.loadingPoint }, username)
          .catch(e => logger.warn(`Unlinked-export notification failed for ${u.doNumber}: ${e?.message || e}`))
      );
    }
    await Promise.all(notifJobs);

    if (failedReasons.length > 0) {
      await createBulkDOFailureNotification({
        totalAttempted: incoming.length,
        successCount: createdDOs.length,
        skippedCount: 0,
        failedCount: failedReasons.length,
        failedReasons,
      }, username).catch(e => logger.warn(`Bulk failure notification failed: ${e?.message || e}`));
    }
  } catch (e: any) {
    logger.warn('Bulk notification step skipped:', e?.message || e);
  }

  // ── 8. Single audit entry + one socket broadcast ───────────────────────────
  await AuditService.logBulkOperation(userId, username, 'DeliveryOrder', 'create', createdDOs.length, req.ip);

  // Audit breadcrumb when automation suppressed fuel-record side-effects.
  if (automationSkips.length > 0) {
    await AuditService.log({
      userId,
      username,
      action: 'CREATE',
      resourceType: 'FuelRecord',
      resourceId: 'bulk',
      details: `Fuel-record automation SKIPPED during bulk DO creation: ${automationSkips.join('; ')}. Manual fuel-record management required.`,
      ipAddress: req.ip,
      severity: 'high',
    }).catch((err: any) => logger.warn(`Failed to write audit breadcrumb for skipped bulk DO automation: ${err?.message}`));
  }

  // New DOs → 'create' with scope meta so viewers can show a precise
  // "N new records — click to load" affordance instead of a silent refetch.
  emitDataChange('delivery_orders', 'create', undefined, undefined, buildBulkMeta(createdDOs));

  // New going fuel records (import) → 'create' with date scope meta.
  if (createdFuelDates.length > 0) {
    emitDataChange('fuel_records', 'create', undefined, undefined, buildBulkMeta(createdFuelDates.map(date => ({ date }))));
  }
  // Export return-leg updates hit existing rows → patch them in place silently.
  if (updatedFuelIds.length > 0) {
    try {
      const updatedFuel = await FuelRecord.find({ _id: { $in: updatedFuelIds } }).lean();
      if (updatedFuel.length > 0) emitDataChange('fuel_records', 'update', updatedFuel as any);
    } catch (err: any) {
      logger.warn(`Failed to load export-updated fuel records for realtime patch: ${err?.message || err}`);
      emitDataChange('fuel_records', 'update');
    }
  }

  logger.info(`Bulk DO creation by ${username}: ${createdDOs.length} created, ${queuedCount} queued, ${failedReasons.length} failed, ${unlinkedExports.length} unlinked exports`);

  res.status(201).json({
    success: createdDOs.length > 0,
    message: `Created ${createdDOs.length} delivery order(s)`,
    data: {
      createdOrders: createdDOs,
      summary: {
        totalAttempted: incoming.length,
        successCount: createdDOs.length,
        failedCount: failedReasons.length,
        queuedCount,
        unlinkedExportCount: unlinkedExports.length,
        failedReasons,
        unlinkedExports: unlinkedExports.map(u => ({ truck: `${u.doNumber} (${u.truckNo})`, reason: 'No matching going journey' })),
      },
    },
  });
};

/**
 * Update delivery order with cascade updates to related records
 */
export const updateDeliveryOrder = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const username = req.user?.username || 'system';
    const userRole = req.user?.role || 'user';
    const { clientUpdatedAt, reason, ...rawPayload } = matchedData(req, { locations: ['body'] }) as any;

    // Enforce edit lock — the caller must hold a valid lock to update
    await enforceEditLock(DeliveryOrder, id, username, 'delivery_orders');

    // Strip fields the caller’s role is not allowed to write
    const payload = filterDeliveryOrderFields(rawPayload, userRole) as any;

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
      if (payload[field] !== undefined && payload[field] !== (originalDO as any)[field]) {
        changes.push({
          field,
          oldValue: (originalDO as any)[field],
          newValue: payload[field],
        });
      }
    }

    // Prepare the update data - exclude fields that shouldn't be directly set
    const { editHistory, editReason, _id, __v, createdAt, ...fieldsToUpdate } = payload;
    
    // Build the update object
    const updateData: any = {
      $set: {
        ...fieldsToUpdate,
        lastEditedAt: new Date(),
        lastEditedBy: username,
      },
    };

    // Add to edit history if there are changes
    if (changes.length > 0) {
      updateData.$push = {
        editHistory: {
          editedAt: new Date(),
          editedBy: username,
          changes,
          reason: editReason || undefined,
        },
      };
    }

    // Build version-guarded filter
    const updateFilter: any = { _id: id, isDeleted: false };
    if (clientUpdatedAt) {
      updateFilter.updatedAt = new Date(clientUpdatedAt);
    }

    // Per-operation automation toggle for the DO→fuel-record amendment cascade.
    const fuelAutomationFlags = await getFuelAutomationFlags();
    let amendCascadeSkipped = false;

    // Run the DO update + all cascade operations inside a transaction
    // so partial cascade failures roll back everything
    const session = await mongoose.startSession();
    let deliveryOrder: any;
    const cascadeResults: {
      fuelRecordUpdated: boolean;
      fuelRecordChanges: string[];
      fuelRecordId?: string;
      fuelRecordLocked?: boolean;
      routeNotificationCreated?: boolean;
      lpoEntriesUpdated: number;
    } = {
      fuelRecordUpdated: false,
      fuelRecordChanges: [],
      lpoEntriesUpdated: 0,
    };

    try {
      await session.withTransaction(async () => {
        // Update the delivery order
        deliveryOrder = await DeliveryOrder.findOneAndUpdate(
          updateFilter,
          updateData,
          { new: true, runValidators: true, session }
        );

        if (!deliveryOrder) {
          // Distinguish: version conflict vs deleted
          const stillExists = await DeliveryOrder.exists({ _id: id, isDeleted: false });
          if (stillExists && clientUpdatedAt) {
            const current = await DeliveryOrder.findOne({ _id: id, isDeleted: false })
              .select('updatedAt doNumber truckNo');
            throw new ApiError(409, 'Delivery order was modified by another user since you opened it. Refresh to see the latest version.').withData({ current });
          }
          throw new ApiError(404, 'Delivery order not found');
        }

        // Cascade to fuel records if relevant fields changed — gated by automation toggle.
        if (changes.some(c => ['truckNo', 'destination', 'loadingPoint'].includes(c.field))) {
          if (fuelAutomationFlags.doAmendCascade) {
            const bodyWithRole = { ...payload, userRole, userId: req.user?.userId };
            const fuelResult = await cascadeUpdateToFuelRecord(originalDO, bodyWithRole, username, session);
            cascadeResults.fuelRecordUpdated = fuelResult.updated;
            cascadeResults.fuelRecordChanges = fuelResult.changes || [];
            cascadeResults.fuelRecordId = fuelResult.fuelRecordId;
            cascadeResults.routeNotificationCreated = fuelResult.routeNotificationCreated;
            if (fuelResult.routeNotificationCreated) {
              cascadeResults.fuelRecordLocked = true;
            }
          } else {
            amendCascadeSkipped = true;
            logger.info(`[fuelAutomation] doAmendCascade OFF — skipping fuel-record cascade for DO ${originalDO.doNumber}`);
          }
        }

        // Cascade to LPO entries if truck or destination changed
        if (changes.some(c => ['truckNo', 'destination'].includes(c.field))) {
          const lpoResult = await cascadeToLPOEntries(originalDO.doNumber, 'update', {
            truckNo: payload.truckNo,
            destination: payload.destination,
          }, session);
          cascadeResults.lpoEntriesUpdated = lpoResult.count;
        }
      });
    } finally {
      await session.endSession();
    }

    logger.info(`Delivery order updated: ${deliveryOrder.doNumber} by ${username}. Changes: ${JSON.stringify(changes)}`);

    // Log audit trail
    if (changes.length > 0) {
      await AuditService.logUpdate(
        req.user?.userId || 'system',
        username,
        'DeliveryOrder',
        deliveryOrder._id.toString(),
        { doNumber: originalDO.doNumber, changes: changes.map(c => c.field) },
        { doNumber: deliveryOrder.doNumber, changes },
        req.ip
      );
    }

    // Audit breadcrumb when automation suppressed the amendment cascade.
    if (amendCascadeSkipped) {
      await AuditService.log({
        userId: req.user?.userId,
        username,
        action: 'UPDATE',
        resourceType: 'FuelRecord',
        resourceId: deliveryOrder.doNumber,
        details: `Fuel-record amendment cascade SKIPPED for DO ${deliveryOrder.doNumber} — automation 'doAmendCascade' is disabled. Manual fuel-record adjustment required.`,
        ipAddress: req.ip,
        severity: 'high',
      }).catch((err: any) => logger.warn(`Failed to write audit breadcrumb for skipped amend cascade (DO ${deliveryOrder.doNumber}): ${err?.message}`));
    }

    // Build response message
    let responseMessage = 'Delivery order updated successfully';
    if (cascadeResults.routeNotificationCreated) {
      responseMessage += '. Note: Route configuration not found - fuel record locked and notification created for admin';
    }
    if (amendCascadeSkipped) {
      responseMessage += '. Note: fuel-record automation is disabled — adjust the fuel record manually.';
    }

    res.status(200).json({
      success: true,
      message: responseMessage,
      data: deliveryOrder,
      cascadeResults,
    });
    emitDataChange('delivery_orders', 'update', deliveryOrder.toObject());
    await emitFuelRecordChange(cascadeResults.fuelRecordId);
    emitDataChange('lpo_summaries', 'update');
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

    // Per-operation automation toggle for the DO→fuel-record cancellation cascade.
    const fuelAutomationFlags = await getFuelAutomationFlags();
    let cancelCascadeSkipped = false;

    // Run DO cancellation + all cascade operations inside a transaction
    const session = await mongoose.startSession();
    let deliveryOrder: any;
    const cascadeResults: {
      fuelRecordCancelled: boolean;
      fuelRecordId: string;
      fuelRecordAction: string;
      lpoEntriesCancelled: number;
    } = {
      fuelRecordCancelled: false,
      fuelRecordId: '',
      fuelRecordAction: '',
      lpoEntriesCancelled: 0,
    };
    let fuelAction: string | undefined;

    try {
      await session.withTransaction(async () => {
        // Update the DO with cancellation status
        deliveryOrder = await DeliveryOrder.findByIdAndUpdate(
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
          { new: true, session }
        );

        if (!deliveryOrder) {
          throw new ApiError(404, 'Delivery order not found');
        }

        // Cancel related fuel record — gated by automation toggle.
        if (fuelAutomationFlags.doCancelCascade) {
          const fuelResult = await cascadeCancelFuelRecord(deliveryOrder, cancellationReason, username, session);
          cascadeResults.fuelRecordCancelled = fuelResult.cancelled;
          cascadeResults.fuelRecordId = fuelResult.fuelRecordId || '';
          cascadeResults.fuelRecordAction = fuelResult.action || '';
          fuelAction = fuelResult.action;
        } else {
          cancelCascadeSkipped = true;
          logger.info(`[fuelAutomation] doCancelCascade OFF — skipping fuel-record cancellation for DO ${deliveryOrder.doNumber}`);
        }

        // Cancel related LPO entries
        const lpoResult = await cascadeToLPOEntries(deliveryOrder.doNumber, 'cancel', undefined, session);
        cascadeResults.lpoEntriesCancelled = lpoResult.count;
      });
    } finally {
      await session.endSession();
    }

    // Generate appropriate message based on what happened
    let message = 'Delivery order cancelled successfully';
    if (fuelAction === 'fully_cancelled') {
      message += '. Associated fuel record was fully cancelled.';
    } else if (fuelAction === 'return_do_removed') {
      message += '. Return DO removed from fuel record (going journey preserved).';
    } else if (cancelCascadeSkipped) {
      message += '. Note: fuel-record automation is disabled — the linked fuel record was NOT changed. Adjust it manually.';
    }

    // Audit breadcrumb when automation suppressed the cancellation cascade.
    if (cancelCascadeSkipped) {
      await AuditService.log({
        userId: req.user?.userId,
        username,
        action: 'UPDATE',
        resourceType: 'FuelRecord',
        resourceId: deliveryOrder.doNumber,
        details: `Fuel-record cancellation cascade SKIPPED for DO ${deliveryOrder.doNumber} — automation 'doCancelCascade' is disabled. Manual fuel-record adjustment required.`,
        ipAddress: req.ip,
        severity: 'high',
      }).catch((err: any) => logger.warn(`Failed to write audit breadcrumb for skipped cancel cascade (DO ${deliveryOrder.doNumber}): ${err?.message}`));
    }

    logger.info(`Delivery order cancelled: ${deliveryOrder.doNumber} by ${username}. Reason: ${reason}. Fuel action: ${fuelAction}`);

    await AuditService.log({
      userId: req.user?.userId,
      username: username,
      action: 'UPDATE',
      resourceType: 'DeliveryOrder',
      resourceId: deliveryOrder._id.toString(),
      details: `DO ${deliveryOrder.doNumber} (truck: ${deliveryOrder.truckNo}) cancelled by ${username}. Reason: ${cancellationReason}`,
      ipAddress: req.ip,
      severity: 'high',
    });

    res.status(200).json({
      success: true,
      message,
      data: deliveryOrder,
      cascadeResults,
    });
    emitDataChange('delivery_orders', 'update', deliveryOrder.toObject());
    await emitFuelRecordChange(cascadeResults.fuelRecordId);
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
 * Returns the active journey + queued journeys for queue management
 */
export const getCurrentJourneyByTruck = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { truckNo } = req.params;

    // Normalize truck number - remove spaces and hyphens for flexible matching
    const normalizedInput = truckNo.replace(/[\s-]/g, '').toUpperCase();
    
    // Get all fuel records for this truck (active + queued)
    const { FuelRecord } = require('../models');
    const fuelRecords = await FuelRecord.find({
      isDeleted: false,
    }).sort({ date: -1 }).lean();
    
    // Filter to match truck number flexibly
    const truckRecords = fuelRecords.filter((record: any) => {
      const normalizedRecordTruck = record.truckNo.replace(/[\s-]/g, '').toUpperCase();
      return normalizedRecordTruck === normalizedInput;
    });

    // Find active journey
    const activeJourney = truckRecords.find((r: any) => r.journeyStatus === 'active');
    
    // Find queued journeys
    const queuedJourneys = truckRecords
      .filter((r: any) => r.journeyStatus === 'queued')
      .sort((a: any, b: any) => (a.queueOrder || 0) - (b.queueOrder || 0));

    // Get all DOs for this truck for backwards compatibility
    const allOrders = await DeliveryOrder.find({
      isDeleted: false,
    }).sort({ date: -1 }).lean();
    
    const deliveryOrders = allOrders.filter((order: any) => {
      const normalizedOrderTruck = order.truckNo.replace(/[\s-]/g, '').toUpperCase();
      return normalizedOrderTruck === normalizedInput;
    });

    if (deliveryOrders.length === 0 && !activeJourney) {
      res.status(200).json({
        success: true,
        message: 'No journey found for this truck',
        data: {
          currentJourney: null,
          journeyPhase: 'none',
          goingDO: null,
          returningDO: null,
          activeFuelRecord: null,
          queuedJourneys: [],
          hasQueue: false,
        },
      });
      return;
    }

    // Determine current journey based on most recent DO (for backwards compatibility)
    const mostRecentDO = deliveryOrders[0];
    let goingDO: any = null;
    let returningDO: any = null;
    let journeyPhase: 'going' | 'returning' | 'none' = 'none';

    if (mostRecentDO) {
      if (mostRecentDO.importOrExport === 'IMPORT') {
        goingDO = mostRecentDO;
        journeyPhase = 'going';
      } else if (mostRecentDO.importOrExport === 'EXPORT') {
        returningDO = mostRecentDO;
        journeyPhase = 'returning';
        
        const mostRecentExportDate = new Date(mostRecentDO.date);
        const associatedImport = deliveryOrders.find((d: any) => {
          if (d.importOrExport !== 'IMPORT') return false;
          const importDate = new Date(d.date);
          return importDate <= mostRecentExportDate;
        });
        
        if (associatedImport) {
          goingDO = associatedImport;
        }
      }
    }

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
        allDeliveryOrders: deliveryOrders,
        // New queue management fields
        activeFuelRecord: activeJourney,
        queuedJourneys: queuedJourneys,
        hasQueue: queuedJourneys.length > 0,
        queueInfo: queuedJourneys.length > 0 ? {
          count: queuedJourneys.length,
          nextUp: queuedJourneys[0],
        } : null,
      },
    });
  } catch (error: any) {
    throw error;
  }
};

/**
 * Get next DO number based on type (DO or SDO)
 * Returns the next DO number in XXXX/YY format (e.g., 0001/26, 0002/26)
 * Handles year rollover - resets to 0001 when year changes
 */
export const getNextDONumber = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const doType = (req.query.doType as string) || 'DO';
    const currentYear = new Date().getFullYear();
    const yearSuffix = currentYear.toString().slice(-2);

    // Derive the next number from the sequential value embedded in `doNumber`, NOT from
    // the `sn` column. Imported DOs carry their spreadsheet's row-serial in `sn`, which
    // bears no relation to their actual DO number (e.g. doNumber 2198/26 with sn 54), so
    // ranking by `sn` would silently ignore high imported numbers.
    //
    // Scope to the current year so the sequence resets at year rollover — doNumber format
    // is XXXX/YY, so filtering on the suffix isolates this year's DOs. The numeric prefix
    // (the part before "/") is parsed in-DB and the max is taken.
    const computeMaxSequential = async (): Promise<number> => {
      const agg = await DeliveryOrder.aggregate([
        { $match: { doType, isDeleted: false, doNumber: { $regex: `/${yearSuffix}$` } } },
        {
          $group: {
            _id: null,
            maxSeq: {
              $max: {
                $convert: {
                  input: { $arrayElemAt: [{ $split: ['$doNumber', '/'] }, 0] },
                  to: 'int',
                  onError: 0,
                  onNull: 0,
                },
              },
            },
          },
        },
      ]);
      return agg[0]?.maxSeq ?? 0;
    };

    let nextSN = (await computeMaxSequential()) + 1;
    let nextDONumber = formatDONumber(nextSN, currentYear);

    // Race-condition safety check: if the candidate already exists, recompute the true max.
    const exists = await DeliveryOrder.exists({ doNumber: nextDONumber, doType, isDeleted: false });
    if (exists) {
      nextSN = (await computeMaxSequential()) + 1;
      nextDONumber = formatDONumber(nextSN, currentYear);
    }

    res.status(200).json({
      success: true,
      message: `Next ${doType} number retrieved successfully`,
      data: {
        nextSN,
        nextDONumber,
        doType
      },
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

    // Get all DOs for the year - INCLUDING ARCHIVED DATA
    const startDate = new Date(year, 0, 1);
    const endDate = new Date(year, 11, 31, 23, 59, 59);
    
    const allDeliveryOrders = await unifiedExportService.getAllDeliveryOrders({
      startDate,
      endDate,
      includeArchived: true,
      filters: { doType: 'DO' },
    });

    const deliveryOrders = allDeliveryOrders.sort((a, b) => {
      const dateCompare = a.date.localeCompare(b.date);
      if (dateCompare !== 0) return dateCompare;
      return (a.doNumber || '').localeCompare(b.doNumber || '');
    });

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
 * Get available years for DO workbooks (INCLUDING ARCHIVED DATA)
 */
export const getAvailableYears = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    // Get years from active data
    const activeYears = await DeliveryOrder.distinct('date', { 
      isDeleted: false,
      doType: 'DO'
    });
    
    // Get years from archived data
    const archivedDates = await ArchivedDeliveryOrder.distinct('date', {
      doType: 'DO'
    });
    
    // Combine and extract years
    const allYears = [...activeYears, ...archivedDates];
    
    const uniqueYears = [...new Set(
      allYears
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

    // Get all DOs for the year - INCLUDING ARCHIVED DATA
    const startDate = new Date(year, 0, 1);
    const endDate = new Date(year, 11, 31, 23, 59, 59);
    
    const allDeliveryOrders = await unifiedExportService.getAllDeliveryOrders({
      startDate,
      endDate,
      includeArchived: true,
      filters: { doType: 'DO' },
    });

    const deliveryOrders = allDeliveryOrders.sort((a, b) => {
      const dateCompare = a.date.localeCompare(b.date);
      if (dateCompare !== 0) return dateCompare;
      return (a.doNumber || '').localeCompare(b.doNumber || '');
    });

    if (deliveryOrders.length === 0) {
      throw new ApiError(404, 'No delivery orders found for this year');
    }

    // Create Excel workbook
    const excelWorkbook = new ExcelJS.Workbook();
    excelWorkbook.creator = 'Fuel Order System';
    excelWorkbook.created = new Date();

    // Load company branding (logo + text) from DB settings
    const branding = await getCompanyBranding();

    // Add logo to workbook if configured
    let logoId: number | null = null;
    if (branding.logoUrl && branding.logoUrl.startsWith('data:')) {
      try {
        const base64 = branding.logoUrl.split(',')[1];
        const mimeMatch = branding.logoUrl.match(/data:image\/([a-z]+);/);
        const ext = (mimeMatch?.[1] === 'jpeg' ? 'jpeg' : mimeMatch?.[1] || 'png') as 'png' | 'jpeg';
        if (base64) {
          logoId = excelWorkbook.addImage({
            base64: base64,
            extension: ext,
          });
        }
      } catch {
        // Logo decode failed — continue without logo
      }
    }

    // Create individual sheets for each DO FIRST (like LPO workbook)
    for (const order of deliveryOrders) {
      // Sheet name: DO number (max 31 chars for Excel) - add CANCELLED prefix if cancelled
      // Sanitize sheet name by replacing invalid characters: * ? : \ / [ ]
      const sanitizedDoNumber = (order.doNumber || 'DO').replace(/[\/\\*?:\[\]]/g, '-');
      const sheetName = order.isCancelled 
        ? `X-${sanitizedDoNumber.substring(0, 28)}` 
        : sanitizedDoNumber.substring(0, 31);
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
      sheet.getCell(order.isCancelled ? 'B2' : 'B1').value = branding.companyName;
      sheet.getCell(order.isCancelled ? 'B2' : 'B1').font = { bold: true, size: 24, color: { argb: 'FFE67E22' } };

      // Row 3: Website
      const websiteRow = order.isCancelled ? 4 : 3;
      sheet.getCell(`B${websiteRow}`).value = branding.companyWebsite;
      sheet.getCell(`B${websiteRow}`).font = { size: 9 };

      // Row 4: Email
      const emailRow = order.isCancelled ? 5 : 4;
      sheet.getCell(`B${emailRow}`).value = `Email: ${branding.companyEmail}`;
      sheet.getCell(`B${emailRow}`).font = { size: 9 };

      // Row 5: Tel
      const telRow = order.isCancelled ? 6 : 5;
      sheet.getCell(`B${telRow}`).value = `Tel: ${branding.companyPhone}`;
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
      sheet.getCell('B29').value = order.rateType === 'fixed_total'
        ? `$${(order.totalAmount ?? order.ratePerTon ?? 0).toLocaleString()} FIXED TOTAL`
        : `$${order.ratePerTon} PER TON`;
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

    // Log export to audit trail
    try {
      await AuditService.logExport(
        req.user?.userId || 'unknown',
        req.user?.username || 'system',
        'delivery_orders',
        'xlsx',
        deliveryOrders.length,
        req.ip || 'unknown'
      );

      // Detect export anomalies (large exports or off-hours)
      await AnomalyDetectionService.detectExportAnomaly(
        req.user?.username || 'system',
        deliveryOrders.length,
        'xlsx',
        req.ip || 'unknown',
        req.get('user-agent') || 'unknown'
      );
    } catch (logError: any) {
      logger.error(`Error logging export: ${logError.message}`);
    }

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
      const amount = entry.rateType === 'fixed_total' ? (entry.totalAmount ?? entry.ratePerTon ?? 0) : (entry.tonnages || 0) * (entry.ratePerTon || 0);
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

    // Log export to audit trail
    try {
      await AuditService.logExport(
        req.user?.userId || 'unknown',
        req.user?.username || 'system',
        'delivery_orders',
        'xlsx',
        deliveryOrders.length,
        req.ip || 'unknown'
      );

      // Detect export anomalies (large exports or off-hours)
      await AnomalyDetectionService.detectExportAnomaly(
        req.user?.username || 'system',
        deliveryOrders.length,
        'xlsx',
        req.ip || 'unknown',
        req.get('user-agent') || 'unknown'
      );
    } catch (logError: any) {
      logger.error(`Error logging export: ${logError.message}`);
    }

    res.end();

    logger.info(`DO Month export for ${monthName} ${year} by ${req.user?.username}`);
  } catch (error: any) {
    throw error;
  }
};

/**
 * Get all amended DOs (DOs with edit history OR cancelled status)
 */
export const getAmendedDOs = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { startDate, endDate, doNumbers } = req.query;

    // Build query for amended DOs - include both edited DOs and cancelled DOs
    const query: any = {
      isDeleted: false,
      $or: [
        { 'editHistory.0': { $exists: true } }, // Has at least one edit history entry
        { isCancelled: true }, // OR is cancelled
      ],
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
      message: `Found ${amendedDOs.length} amended/cancelled delivery orders`,
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

    // Load company branding from DB
    const branding = await getCompanyBranding();

    // Generate PDF
    const doc = generateAmendedDOsPDF(deliveryOrders as any, { includeEditHistory: true }, branding);

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
 * Download bulk DOs as PDF (clean design with pdfkit)
 */
export const downloadBulkDOsPDF = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { doNumbers } = req.body;

    if (!doNumbers || !Array.isArray(doNumbers) || doNumbers.length === 0) {
      throw new ApiError(400, 'Please provide an array of DO numbers to download');
    }

    // Fetch the DOs by their DO numbers
    const deliveryOrders = await DeliveryOrder.find({
      doNumber: { $in: doNumbers },
      isDeleted: false,
    })
      .sort({ doNumber: 1 }) // Sort by DO number for consistent order
      .lean();

    if (deliveryOrders.length === 0) {
      throw new ApiError(404, 'No delivery orders found for the provided DO numbers');
    }

    // Import PDF generator
    const { generateBulkDOsPDF, generateBulkDOsFilename } = await import('../utils/pdfGenerator');

    // Load company branding from DB
    const branding = await getCompanyBranding();

    // Generate PDF with username
    const username = req.user?.username || 'system';
    const doc = generateBulkDOsPDF(deliveryOrders as any, username, branding);

    // Generate filename
    const firstDO = deliveryOrders[0].doNumber;
    const lastDO = deliveryOrders[deliveryOrders.length - 1].doNumber;
    const doType = deliveryOrders[0].doType || 'DO';
    const filename = generateBulkDOsFilename(firstDO, lastDO, doType);

    // Set response headers for PDF download
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    // Pipe the PDF to response
    doc.pipe(res);
    doc.end();

    logger.info(`Bulk DOs PDF downloaded: ${doNumbers.join(', ')} by ${req.user?.username}`);
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

    // Get all SDOs for the year - INCLUDING ARCHIVED DATA
    const startDate = new Date(year, 0, 1);
    const endDate = new Date(year, 11, 31, 23, 59, 59);
    
    const allSDOOrders = await unifiedExportService.getAllDeliveryOrders({
      startDate,
      endDate,
      includeArchived: true,
      filters: { doType: 'SDO' },
    });

    const sdoOrders = allSDOOrders.sort((a, b) => {
      const dateCompare = a.date.localeCompare(b.date);
      if (dateCompare !== 0) return dateCompare;
      return (a.doNumber || '').localeCompare(b.doNumber || '');
    });

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
 * Get available years for SDO workbooks (INCLUDING ARCHIVED DATA)
 */
export const getAvailableSDOYears = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    // Get years from active data
    const activeYears = await DeliveryOrder.distinct('date', { 
      isDeleted: false,
      doType: 'SDO'
    });
    
    // Get years from archived data
    const archivedDates = await ArchivedDeliveryOrder.distinct('date', {
      doType: 'SDO'
    });
    
    // Combine and extract years
    const allYears = [...activeYears, ...archivedDates];
    
    const uniqueYears = [...new Set(
      allYears
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

    // Get all SDOs for the year - INCLUDING ARCHIVED DATA
    const startDate = new Date(year, 0, 1);
    const endDate = new Date(year, 11, 31, 23, 59, 59);
    
    const allSDOOrders = await unifiedExportService.getAllDeliveryOrders({
      startDate,
      endDate,
      includeArchived: true,
      filters: { doType: 'SDO' },
    });

    const sdoOrders = allSDOOrders.sort((a, b) => {
      const dateCompare = a.date.localeCompare(b.date);
      if (dateCompare !== 0) return dateCompare;
      return (a.doNumber || '').localeCompare(b.doNumber || '');
    });

    if (sdoOrders.length === 0) {
      throw new ApiError(404, 'No SDO orders found for this year');
    }

    // Create Excel workbook
    const excelWorkbook = new ExcelJS.Workbook();
    excelWorkbook.creator = 'Fuel Order System';
    excelWorkbook.created = new Date();

    // Load company branding (logo + text) from DB settings
    const branding = await getCompanyBranding();

    // Add logo to workbook if configured
    let logoId: number | null = null;
    if (branding.logoUrl && branding.logoUrl.startsWith('data:')) {
      try {
        const base64 = branding.logoUrl.split(',')[1];
        const mimeMatch = branding.logoUrl.match(/data:image\/([a-z]+);/);
        const ext = (mimeMatch?.[1] === 'jpeg' ? 'jpeg' : mimeMatch?.[1] || 'png') as 'png' | 'jpeg';
        if (base64) {
          logoId = excelWorkbook.addImage({
            base64: base64,
            extension: ext,
          });
        }
      } catch {
        // Logo decode failed — continue without logo
      }
    }

    // Create individual sheets for each SDO FIRST
    for (const order of sdoOrders) {
      // Sheet name: SDO number (max 31 chars for Excel) - add CANCELLED prefix if cancelled
      // Sanitize sheet name by replacing invalid characters: * ? : \ / [ ]
      const sanitizedDoNumber = (order.doNumber || 'SDO').replace(/[\/\\*?:\[\]]/g, '-');
      const sheetName = order.isCancelled 
        ? `X-${sanitizedDoNumber.substring(0, 28)}` 
        : sanitizedDoNumber.substring(0, 31);
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
      sheet.getCell(order.isCancelled ? 'B2' : 'B1').value = branding.companyName;
      sheet.getCell(order.isCancelled ? 'B2' : 'B1').font = { bold: true, size: 24, color: { argb: 'FFE67E22' } };

      // Row 3: Website
      const websiteRow = order.isCancelled ? 4 : 3;
      sheet.getCell(`B${websiteRow}`).value = branding.companyWebsite;
      sheet.getCell(`B${websiteRow}`).font = { size: 9 };

      // Row 4: Email
      const emailRow = order.isCancelled ? 5 : 4;
      sheet.getCell(`B${emailRow}`).value = `Email: ${branding.companyEmail}`;
      sheet.getCell(`B${emailRow}`).font = { size: 9 };

      // Row 5: Tel
      const telRow = order.isCancelled ? 6 : 5;
      sheet.getCell(`B${telRow}`).value = `Tel: ${branding.companyPhone}`;
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
      sheet.getCell('B29').value = order.rateType === 'fixed_total'
        ? `$${(order.totalAmount ?? order.ratePerTon ?? 0).toLocaleString()} FIXED TOTAL`
        : `$${order.ratePerTon} PER TON`;
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

    // Log export to audit trail
    try {
      await AuditService.logExport(
        req.user?.userId || 'unknown',
        req.user?.username || 'system',
        'store_delivery_orders',
        'xlsx',
        sdoOrders.length,
        req.ip || 'unknown'
      );

      // Detect export anomalies (large exports or off-hours)
      await AnomalyDetectionService.detectExportAnomaly(
        req.user?.username || 'system',
        sdoOrders.length,
        'xlsx',
        req.ip || 'unknown',
        req.get('user-agent') || 'unknown'
      );
    } catch (logError: any) {
      logger.error(`Error logging export: ${logError.message}`);
    }

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

    // Log export to audit trail
    try {
      await AuditService.logExport(
        req.user?.userId || 'unknown',
        req.user?.username || 'system',
        'store_delivery_orders',
        'xlsx',
        sdoOrders.length,
        req.ip || 'unknown'
      );

      // Detect export anomalies (large exports or off-hours)
      await AnomalyDetectionService.detectExportAnomaly(
        req.user?.username || 'system',
        sdoOrders.length,
        'xlsx',
        req.ip || 'unknown',
        req.get('user-agent') || 'unknown'
      );
    } catch (logError: any) {
      logger.error(`Error logging export: ${logError.message}`);
    }

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

    // Get all DOs for the year - INCLUDING ARCHIVED DATA
    const startDate = new Date(year, 0, 1);
    const endDate = new Date(year, 11, 31, 23, 59, 59);
    
    const allDeliveryOrders = await unifiedExportService.getAllDeliveryOrders({
      startDate,
      endDate,
      includeArchived: true,
      filters: { doType: 'DO' },
    });

    const deliveryOrders = allDeliveryOrders.sort((a, b) => {
      const dateCompare = a.date.localeCompare(b.date);
      if (dateCompare !== 0) return dateCompare;
      return (a.doNumber || '').localeCompare(b.doNumber || '');
    });

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

    // Log export to audit trail
    try {
      await AuditService.logExport(
        req.user?.userId || 'unknown',
        req.user?.username || 'system',
        'delivery_orders',
        'xlsx',
        deliveryOrders.length,
        req.ip || 'unknown'
      );

      // Detect export anomalies (large exports or off-hours)
      await AnomalyDetectionService.detectExportAnomaly(
        req.user?.username || 'system',
        deliveryOrders.length,
        'xlsx',
        req.ip || 'unknown',
        req.get('user-agent') || 'unknown'
      );
    } catch (logError: any) {
      logger.error(`Error logging export: ${logError.message}`);
    }

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
 * Export Monthly Summary tab Excel (server-side).
 * Query: months=Jan-2026,Feb-2026&doType=DO|SDO|ALL&importOrExport=ALL|IMPORT|EXPORT
 * Includes cancelled rows (struck through). One sheet per selected month label.
 */
export const exportSummaryTab = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const monthsRaw = String(req.query.months || '').trim();
    if (!monthsRaw) {
      throw new ApiError(400, 'months query param is required (e.g. Jan-2026,Feb-2026)');
    }

    const doTypeRaw = String(req.query.doType || 'ALL').toUpperCase();
    const importOrExport = String(req.query.importOrExport || 'ALL').toUpperCase();

    if (!['DO', 'SDO', 'ALL'].includes(doTypeRaw)) {
      throw new ApiError(400, 'doType must be DO, SDO, or ALL');
    }
    if (!['ALL', 'IMPORT', 'EXPORT'].includes(importOrExport)) {
      throw new ApiError(400, 'importOrExport must be ALL, IMPORT, or EXPORT');
    }

    const monthLabels = monthsRaw.split(',').map((m) => m.trim()).filter(Boolean);
    const parsed = monthLabels.map(parseMonthYearLabel);
    if (parsed.some((p) => !p)) {
      throw new ApiError(400, 'Invalid month label. Use format Mon-YYYY (e.g. Jan-2026)');
    }
    const ranges = parsed as NonNullable<(typeof parsed)[number]>[];

    let minFrom = ranges[0].dateFrom;
    let maxTo = ranges[0].dateTo;
    for (const r of ranges) {
      if (r.dateFrom < minFrom) minFrom = r.dateFrom;
      if (r.dateTo > maxTo) maxTo = r.dateTo;
    }

    const filters: Record<string, unknown> = {};
    if (doTypeRaw === 'DO' || doTypeRaw === 'SDO') filters.doType = doTypeRaw;
    if (importOrExport !== 'ALL') filters.importOrExport = importOrExport;

    const allOrders = await unifiedExportService.getAllDeliveryOrders({
      startDate: new Date(`${minFrom}T00:00:00.000Z`),
      endDate: new Date(`${maxTo}T23:59:59.999Z`),
      includeArchived: true,
      filters,
    });

    const ordersBySheet = new Map<string, any[]>();
    for (const r of ranges) {
      ordersBySheet.set(r.sheetName, []);
    }

    for (const order of allOrders) {
      const dateStr = String(order.date || '').substring(0, 10);
      for (const r of ranges) {
        if (dateStr >= r.dateFrom && dateStr <= r.dateTo) {
          ordersBySheet.get(r.sheetName)!.push(order);
          break;
        }
      }
    }

    // Stable sort within each sheet
    for (const [key, list] of ordersBySheet) {
      list.sort((a, b) => {
        const dateCompare = String(a.date || '').localeCompare(String(b.date || ''));
        if (dateCompare !== 0) return dateCompare;
        return String(a.doNumber || '').localeCompare(String(b.doNumber || ''));
      });
      ordersBySheet.set(key, list);
    }

    const totalRows = [...ordersBySheet.values()].reduce((n, list) => n + list.length, 0);
    if (totalRows === 0) {
      throw new ApiError(404, 'No delivery orders found for the selected months');
    }

    const excelWorkbook = new ExcelJS.Workbook();
    excelWorkbook.creator = 'Fuel Order System';
    excelWorkbook.created = new Date();

    const doNumberHeader = doTypeRaw === 'SDO' ? 'SDO No.' : 'D.O No.';
    addDoSummaryTabSheets(excelWorkbook, ordersBySheet, monthLabels, doNumberHeader);

    const orderTypeLabel = doTypeRaw === 'SDO' ? 'SDO' : doTypeRaw === 'ALL' ? 'All_Orders' : 'DO';
    const monthsLabel =
      monthLabels.length === 1
        ? monthLabels[0].replace('-', '_')
        : `${monthLabels.length}_Months`;
    const filename = `${orderTypeLabel}_Summary_${monthsLabel}.xlsx`;

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    await excelWorkbook.xlsx.write(res);

    try {
      await AuditService.logExport(
        req.user?.userId || 'unknown',
        req.user?.username || 'system',
        'delivery_orders_summary',
        'xlsx',
        totalRows,
        req.ip || 'unknown'
      );
      await AnomalyDetectionService.detectExportAnomaly(
        req.user?.username || 'system',
        totalRows,
        'xlsx',
        req.ip || 'unknown',
        req.get('user-agent') || 'unknown'
      );
    } catch (logError: any) {
      logger.error(`Error logging summary export: ${logError.message}`);
    }

    res.end();
    logger.info(`DO summary tab exported (${monthLabels.join(',')}) by ${req.user?.username}`);
  } catch (error: any) {
    if (error instanceof ApiError) {
      if (!res.headersSent) {
        res.status(error.statusCode).json({ error: error.message });
      }
    } else {
      logger.error('Error exporting DO summary tab:', error);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Failed to export summary' });
      }
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

    // Get all SDOs for the year - INCLUDING ARCHIVED DATA
    const startDate = new Date(year, 0, 1);
    const endDate = new Date(year, 11, 31, 23, 59, 59);
    
    const allSDOOrders = await unifiedExportService.getAllDeliveryOrders({
      startDate,
      endDate,
      includeArchived: true,
      filters: { doType: 'SDO' },
    });

    const sdoOrders = allSDOOrders.filter((order: any) => !order.isDeleted)
      .sort((a, b) => {
        const dateCompare = a.date.localeCompare(b.date);
        if (dateCompare !== 0) return dateCompare;
        return (a.doNumber || '').localeCompare(b.doNumber || '');
      });

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

    // Log export to audit trail
    try {
      await AuditService.logExport(
        req.user?.userId || 'unknown',
        req.user?.username || 'system',
        'store_delivery_orders',
        'xlsx',
        sdoOrders.length,
        req.ip || 'unknown'
      );

      // Detect export anomalies (large exports or off-hours)
      await AnomalyDetectionService.detectExportAnomaly(
        req.user?.username || 'system',
        sdoOrders.length,
        'xlsx',
        req.ip || 'unknown',
        req.get('user-agent') || 'unknown'
      );
    } catch (logError: any) {
      logger.error(`Error logging export: ${logError.message}`);
    }

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

/**
 * Re-link an EXPORT DO to a fuel record after truck number correction
 * This is called after editing a DO's truck number to find and link it to the correct fuel record
 */
export const relinkExportDOToFuelRecord = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const username = req.user?.username || 'system';

    // Get the delivery order
    const deliveryOrder = await DeliveryOrder.findOne({ _id: id, isDeleted: false });

    if (!deliveryOrder) {
      throw new ApiError(404, 'Delivery order not found');
    }

    // Only EXPORT DOs can be re-linked
    if (deliveryOrder.importOrExport !== 'EXPORT') {
      throw new ApiError(400, 'Only EXPORT (return) DOs can be re-linked to fuel records');
    }

    // Skip SDOs - they don't interact with fuel records
    if (deliveryOrder.doType === 'SDO') {
      throw new ApiError(400, 'SDO orders do not have fuel records');
    }

    // Check if already linked to a fuel record
    const existingLink = await FuelRecord.findOne({
      returnDo: deliveryOrder.doNumber,
      isDeleted: false,
    });

    if (existingLink) {
      res.status(200).json({
        success: true,
        message: 'DO is already linked to a fuel record',
        data: {
          deliveryOrder,
          fuelRecord: existingLink,
          wasAlreadyLinked: true,
        },
      });
      return;
    }

    // Find the active going journey for this truck (one without a return DO yet)
    const matchingFuelRecord = await FuelRecord.findOne({
      truckNo: deliveryOrder.truckNo,
      journeyStatus: 'active',
      returnDo: { $in: [null, '', undefined] },
      isDeleted: false,
    }).sort({ date: -1 });

    if (!matchingFuelRecord) {
      res.status(200).json({
        success: false,
        message: `No matching fuel record found for truck ${deliveryOrder.truckNo}. The truck may not have a going journey recorded yet.`,
        data: {
          deliveryOrder,
          fuelRecord: null,
          suggestion: 'Check that the truck number is correct and that an IMPORT DO exists for this truck.',
        },
      });
      return;
    }

    // Link the DO to the fuel record
    // Store original going journey locations before changing
    const originalGoingFrom = matchingFuelRecord.originalGoingFrom || matchingFuelRecord.from;
    const originalGoingTo = matchingFuelRecord.originalGoingTo || matchingFuelRecord.to;

    // Find the EXPORT route to get the fuel liters for the return journey
    // Try to match route with origin (loading point) and destination
    let exportRoute = await RouteConfig.findOne({
      $or: [
        {
          origin: { $regex: new RegExp(`^${deliveryOrder.loadingPoint}$`, 'i') },
          destination: { $regex: new RegExp(`^${deliveryOrder.destination}$`, 'i') },
          routeType: 'EXPORT',
          isActive: true,
        },
        {
          destination: { $regex: new RegExp(`^${deliveryOrder.destination}$`, 'i') },
          routeType: 'EXPORT',
          isActive: true,
        },
      ],
    });

    // Calculate new totalLts by ADDING export route liters to existing totalLts
    const originalTotalLts = matchingFuelRecord.totalLts || 0;
    let newTotalLts = originalTotalLts;
    let exportRouteLiters = 0;

    if (exportRoute) {
      exportRouteLiters = exportRoute.defaultTotalLiters;
      newTotalLts = originalTotalLts + exportRouteLiters;
      logger.info(`Adding EXPORT route fuel: ${originalTotalLts}L + ${exportRouteLiters}L = ${newTotalLts}L`);
    } else {
      logger.warn(`âš ï¸ EXPORT route not found for ${deliveryOrder.loadingPoint} â†’ ${deliveryOrder.destination}. Total liters will not be updated.`);
    }

    // Update the fuel record with return DO info
    const updateData: any = {
      returnDo: deliveryOrder.doNumber,
      originalGoingFrom: originalGoingFrom,
      originalGoingTo: originalGoingTo,
      // Update from/to for return journey
      from: deliveryOrder.loadingPoint, // Return journey: load from EXPORT loadingPoint (POL)
      to: deliveryOrder.destination, // Return journey: going to EXPORT destination
    };

    // Only update totalLts if export route was found
    if (exportRoute) {
      updateData.totalLts = newTotalLts;
      updateData.balance = (matchingFuelRecord.balance || 0) + exportRouteLiters; // Also update balance
    }

    await FuelRecord.findByIdAndUpdate(matchingFuelRecord._id, updateData);

    // Resolve any pending unlinked DO notifications
    const { resolveUnlinkedDONotification } = await import('./notificationController');
    await resolveUnlinkedDONotification(id, username);

    logger.info(`Re-linked EXPORT DO ${deliveryOrder.doNumber} to fuel record ${matchingFuelRecord._id} by ${username}${exportRoute ? `, added ${exportRouteLiters}L from export route` : ''}`);

    // Fetch the updated fuel record
    const updatedFuelRecord = await FuelRecord.findById(matchingFuelRecord._id);

    res.status(200).json({
      success: true,
      message: `Successfully linked DO-${deliveryOrder.doNumber} to fuel record for truck ${deliveryOrder.truckNo}${exportRoute ? `. Added ${exportRouteLiters}L from export route (${originalTotalLts}L â†’ ${newTotalLts}L)` : ''}`,
      data: {
        deliveryOrder,
        fuelRecord: updatedFuelRecord,
        wasAlreadyLinked: false,
        previousGoingJourney: {
          from: originalGoingFrom,
          to: originalGoingTo,
        },
        fuelUpdates: exportRoute ? {
          originalTotalLts,
          exportRouteLiters,
          newTotalLts,
        } : null,
      },
    });
    emitDataChange('fuel_records', 'update');
  } catch (error: any) {
    throw error;
  }
};

// ── Manual EXPORT-DO linking (preview + confirm) ────────────────────────────
// Used when the `doExportUpdate` automation is turned off (e.g. imported data
// that isn't structured like system-generated records). Mirrors the DAR/Tanga
// yard "link to fuel record" UX: the user previews the going record(s) found for
// the truck, chooses one, and links — reusing the same buildReturnUpdate logic
// as the automatic path so the going leg is preserved (originalGoing* snapshot).

/**
 * Find candidate going fuel records for an EXPORT DO's truck.
 * Unlike the auto path (relinkExportDOToFuelRecord / applyExportFuelUpdates), this
 * does NOT require journeyStatus 'active' — imported records land as 'completed'.
 * We match any non-cancelled, non-deleted record for the truck that does not yet
 * have a return DO. Truck matching is whitespace/hyphen-tolerant so imports like
 * "T790-EEU" still match "T790 EEU". Most-recent first, capped at 50.
 */
const findExportLinkCandidates = async (truckNo: string): Promise<any[]> => {
  const normalized = normalizeTruckNo(truckNo);
  if (!normalized) return [];
  const m = normalized.match(/^(T?\d+)([A-Z]+)$/);
  const pattern = m ? `^${m[1]}[\\s-]*${m[2]}$` : `^${normalized}$`;
  return FuelRecord.find({
    truckNo: { $regex: new RegExp(pattern, 'i') },
    isDeleted: false,
    isCancelled: { $ne: true },
    $or: [{ returnDo: { $exists: false } }, { returnDo: null }, { returnDo: '' }],
  })
    .sort({ date: -1 })
    .limit(50)
    .lean();
};

/**
 * Preview the going fuel record(s) an EXPORT DO can be linked to, so the UI can
 * show a list view and let the user choose + inspect before committing. Dry run —
 * performs no writes.
 */
export const previewExportLinkCandidates = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const deliveryOrder = await DeliveryOrder.findOne({ _id: id, isDeleted: false });
    if (!deliveryOrder) {
      throw new ApiError(404, 'Delivery order not found');
    }
    if (deliveryOrder.importOrExport !== 'EXPORT') {
      throw new ApiError(400, 'Only EXPORT (return) DOs can be linked to fuel records');
    }
    if (deliveryOrder.doType === 'SDO') {
      throw new ApiError(400, 'SDO orders do not have fuel records');
    }

    // Already linked? Surface the existing record so the UI can show status.
    const existingLink = await FuelRecord.findOne({
      returnDo: deliveryOrder.doNumber,
      isDeleted: false,
    }).lean();

    // Export route liters that would be added on link (same for every candidate).
    const { routes } = await loadFuelConfig();
    const routeMatch = matchExportRouteLiters(
      routes,
      deliveryOrder.loadingPoint || '',
      deliveryOrder.destination || ''
    );
    const exportRouteLiters = routeMatch.matched ? routeMatch.liters : 0;

    const rawCandidates = existingLink ? [] : await findExportLinkCandidates(deliveryOrder.truckNo);
    const candidates = rawCandidates.map((fr: any) => ({
      fuelRecordId: String(fr._id),
      date: fr.date,
      goingDo: fr.goingDo,
      journeyStatus: fr.journeyStatus,
      // Going leg (prefer the preserved snapshot, though it should be empty here
      // since these records have no return DO yet).
      goingFrom: fr.originalGoingFrom || fr.from,
      goingTo: fr.originalGoingTo || fr.to,
      totalLts: fr.totalLts ?? 0,
      extra: fr.extra ?? 0,
      balance: fr.balance ?? 0,
      fuelRecord: fr,
    }));

    res.status(200).json({
      success: true,
      message: existingLink
        ? 'DO is already linked to a fuel record'
        : `${candidates.length} candidate fuel record(s) found for truck ${deliveryOrder.truckNo}`,
      data: {
        deliveryOrder,
        alreadyLinked: !!existingLink,
        alreadyLinkedRecord: existingLink || null,
        candidates,
        exportRouteLiters,
        routeMatched: routeMatch.matched,
      },
    });
  } catch (error: any) {
    throw error;
  }
};

/**
 * Link an EXPORT DO to a specific, user-chosen fuel record. Reuses buildReturnUpdate
 * so the going leg is snapshotted into originalGoingFrom/To and the return leg + export
 * route liters are applied exactly as the automatic path does.
 */
export const confirmExportLink = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { fuelRecordId } = req.body;
    const username = req.user?.username || 'system';

    if (!fuelRecordId) {
      throw new ApiError(400, 'fuelRecordId is required');
    }

    const deliveryOrder = await DeliveryOrder.findOne({ _id: id, isDeleted: false });
    if (!deliveryOrder) {
      throw new ApiError(404, 'Delivery order not found');
    }
    if (deliveryOrder.importOrExport !== 'EXPORT') {
      throw new ApiError(400, 'Only EXPORT (return) DOs can be linked to fuel records');
    }
    if (deliveryOrder.doType === 'SDO') {
      throw new ApiError(400, 'SDO orders do not have fuel records');
    }

    // Guard against double-linking the DO to a second record.
    const existingLink = await FuelRecord.findOne({
      returnDo: deliveryOrder.doNumber,
      isDeleted: false,
    }).lean();
    if (existingLink) {
      res.status(200).json({
        success: true,
        message: 'DO is already linked to a fuel record',
        data: { deliveryOrder, fuelRecord: existingLink, wasAlreadyLinked: true },
      });
      return;
    }

    const fuelRecord = await FuelRecord.findOne({
      _id: fuelRecordId,
      isDeleted: false,
      isCancelled: { $ne: true },
    });
    if (!fuelRecord) {
      throw new ApiError(404, 'Selected fuel record not found or is cancelled');
    }
    if (fuelRecord.returnDo && String(fuelRecord.returnDo).trim() !== '') {
      throw new ApiError(400, `Selected fuel record already has a return DO (${fuelRecord.returnDo})`);
    }

    // Compute export route liters and build the return update (preserves going leg).
    const { routes } = await loadFuelConfig();
    const routeMatch = matchExportRouteLiters(
      routes,
      deliveryOrder.loadingPoint || '',
      deliveryOrder.destination || ''
    );
    const exportRouteLiters = routeMatch.matched ? routeMatch.liters : 0;
    if (!routeMatch.matched) {
      logger.warn(
        `EXPORT route not found for ${deliveryOrder.loadingPoint} → ${deliveryOrder.destination}. Linking without adding liters.`
      );
    }

    const { update, info } = buildReturnUpdate(
      fuelRecord.toObject(),
      deliveryOrder as unknown as DeliveryOrderLike,
      exportRouteLiters
    );

    const updatedFuelRecord = await FuelRecord.findByIdAndUpdate(fuelRecord._id, update, { new: true });

    // Resolve any pending unlinked-DO notification for this DO.
    try {
      const { resolveUnlinkedDONotification } = await import('./notificationController');
      await resolveUnlinkedDONotification(id, username);
    } catch (notifErr: any) {
      logger.warn(`Failed to resolve unlinked-DO notification for ${id}: ${notifErr?.message}`);
    }

    await AuditService.log({
      userId: req.user?.userId,
      username,
      action: 'UPDATE',
      resourceType: 'FuelRecord',
      resourceId: String(fuelRecord._id),
      details: `EXPORT DO ${deliveryOrder.doNumber} (truck: ${deliveryOrder.truckNo}) manually linked to fuel record ${fuelRecord._id} by ${username}${routeMatch.matched ? `, added ${exportRouteLiters}L from export route (${info.originalTotalLiters}L → ${info.newTotalLiters}L)` : ' (no export route matched — liters unchanged)'}`,
      ipAddress: req.ip,
      severity: 'medium',
    }).catch((err: any) => logger.warn(`Failed to write audit for manual export link (DO ${deliveryOrder.doNumber}): ${err?.message}`));

    logger.info(
      `Manually linked EXPORT DO ${deliveryOrder.doNumber} to fuel record ${fuelRecord._id} by ${username}${routeMatch.matched ? `, added ${exportRouteLiters}L` : ''}`
    );

    emitDataChange('fuel_records', 'update');

    res.status(200).json({
      success: true,
      message: `Successfully linked DO-${deliveryOrder.doNumber} to fuel record for truck ${deliveryOrder.truckNo}${routeMatch.matched ? `. Added ${exportRouteLiters}L from export route (${info.originalTotalLiters}L → ${info.newTotalLiters}L)` : ''}`,
      data: {
        deliveryOrder,
        fuelRecord: updatedFuelRecord,
        wasAlreadyLinked: false,
        previousGoingJourney: { from: update.originalGoingFrom, to: update.originalGoingTo },
        fuelUpdates: routeMatch.matched
          ? { originalTotalLts: info.originalTotalLiters, exportRouteLiters, newTotalLts: info.newTotalLiters }
          : null,
      },
    });
  } catch (error: any) {
    throw error;
  }
};

/**
 * Create notification for unlinked EXPORT DO
 * Called from frontend when no fuel record match is found during DO creation
 */
export const createUnlinkedExportNotification = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { deliveryOrderId, doNumber, truckNo, destination, loadingPoint } = req.body;
    const username = req.user?.username || 'system';

    if (!deliveryOrderId || !doNumber || !truckNo) {
      throw new ApiError(400, 'Missing required fields: deliveryOrderId, doNumber, truckNo');
    }

    const { createUnlinkedExportDONotification } = await import('./notificationController');
    await createUnlinkedExportDONotification(
      deliveryOrderId,
      {
        doNumber,
        truckNo,
        destination,
        loadingPoint,
      },
      username
    );

    res.status(201).json({
      success: true,
      message: 'Notification created for unlinked EXPORT DO',
    });
  } catch (error: any) {
    throw error;
  }
};

/**
 * Create notification for bulk DO creation failures/skips
 * Called from frontend after bulk DO creation completes with issues
 */
export const createBulkDOFailureNotification = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { 
      totalAttempted, 
      successCount, 
      skippedCount, 
      failedCount,
      skippedReasons,
      failedReasons 
    } = req.body;
    const username = req.user?.username || 'system';

    if (totalAttempted === undefined || successCount === undefined || 
        skippedCount === undefined || failedCount === undefined) {
      throw new ApiError(400, 'Missing required fields: totalAttempted, successCount, skippedCount, failedCount');
    }

    const { createBulkDOFailureNotification } = await import('./notificationController');
    await createBulkDOFailureNotification(
      {
        totalAttempted,
        successCount,
        skippedCount,
        failedCount,
        skippedReasons,
        failedReasons,
      },
      username
    );

    res.status(201).json({
      success: true,
      message: 'Notification created for bulk DO creation issues',
    });
  } catch (error: any) {
    throw error;
  }
};

/**
 * Download single DO as PDF
 */
export const downloadSingleDOPDF = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    // Find the delivery order
    const deliveryOrder = await DeliveryOrder.findOne({
      _id: id,
      isDeleted: false,
    }).lean();

    if (!deliveryOrder) {
      throw new ApiError(404, 'Delivery order not found');
    }

    // Import PDF generator
    const { generateBulkDOsPDF } = await import('../utils/pdfGenerator');

    // Load company branding from DB
    const branding = await getCompanyBranding();

    // Generate PDF with username (using the bulk function with single DO)
    const username = req.user?.username || 'system';
    const doc = generateBulkDOsPDF([deliveryOrder as any], username, branding);

    // Generate filename
    const doType = deliveryOrder.doType || 'DO';
    const timestamp = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const filename = `${doType}_${deliveryOrder.doNumber}_${timestamp}.pdf`;

    // Set response headers for PDF download
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    // Pipe the PDF to response
    doc.pipe(res);
    doc.end();

    logger.info(`Single DO PDF downloaded: ${deliveryOrder.doNumber} by ${req.user?.username}`);
  } catch (error: any) {
    throw error;
  }
};
