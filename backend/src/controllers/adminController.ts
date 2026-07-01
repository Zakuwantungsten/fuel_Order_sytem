 import { Response } from 'express';
import ExcelJS from 'exceljs';
import { SystemConfig, User, DeliveryOrder, LPOSummary, FuelRecord, YardFuelDispense, AuditLog } from '../models';
import { DEFAULT_FUEL_AUTOMATION, IFuelAutomationConfig } from '../models/SystemConfig';
import { ApiError } from '../middleware/errorHandler';
import { AuthRequest } from '../middleware/auth';
import { logger } from '../utils';
import { databaseMonitor } from '../utils/databaseMonitor';
import { AuditService } from '../utils/auditService';
import emailService from '../services/emailService';
import { emitToUser, emitMaintenanceEvent, emitSecuritySettingsEvent, emitDataChange } from '../services/websocket';
import { invalidateMaintenanceCache } from '../middleware/maintenance';
import { DEFAULT_START_COLUMNS, SELECTABLE_START_COLUMNS, invalidateJourneyConfigCache } from '../services/journeyService';
import {
  findAffectedUsers,
  getMigrationStats,
  clearStaleMustChangePasswordFlags,
  clearUserMustChangePassword,
} from '../utils/userMigration';

/**
 * Add cache-busting headers to force immediate frontend refresh
 * Call this after configuration updates to ensure all clients get fresh data
 */
function setCacheBustingHeaders(res: Response): void {
  res.set({
    'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
    'Pragma': 'no-cache',
    'Expires': '0',
    'X-Config-Updated': new Date().toISOString(),
  });
}

// Default configurations
const DEFAULT_FUEL_STATIONS = [
  { id: 'lake_ndola', name: 'LAKE NDOLA', location: 'Zambia', pricePerLiter: 1450, isActive: true },
  { id: 'lake_kapiri', name: 'LAKE KAPIRI', location: 'Zambia', pricePerLiter: 1450, isActive: true },
  { id: 'lake_chilabombwe', name: 'LAKE CHILABOMBWE', location: 'Zambia', pricePerLiter: 1450, isActive: true },
  { id: 'cash', name: 'CASH', location: 'Zambia', pricePerLiter: 1450, isActive: true },
  { id: 'tcc', name: 'TCC', location: 'Zambia', pricePerLiter: 1450, isActive: true },
  { id: 'zhanfei', name: 'ZHANFEI', location: 'Zambia', pricePerLiter: 1450, isActive: true },
  { id: 'kamoa', name: 'KAMOA', location: 'Zambia', pricePerLiter: 1450, isActive: true },
  { id: 'comika', name: 'COMIKA', location: 'Zambia', pricePerLiter: 1450, isActive: true },
  { id: 'tunduma_station', name: 'TUNDUMA STATION', location: 'Tanzania', pricePerLiter: 1450, isActive: true },
  { id: 'mbeya_station', name: 'MBEYA STATION', location: 'Tanzania', pricePerLiter: 1450, isActive: true },
  { id: 'moro_station', name: 'MORO STATION', location: 'Tanzania', pricePerLiter: 1450, isActive: true },
  { id: 'tanga_station', name: 'TANGA STATION', location: 'Tanzania', pricePerLiter: 1450, isActive: true },
  { id: 'dar_station', name: 'DAR STATION', location: 'Dar es Salaam', pricePerLiter: 1450, isActive: true },
];

const DEFAULT_ROUTES = [
  { destination: 'LUBUMBASHI', totalLiters: 2100, isActive: true },
  { destination: 'LIKASI', totalLiters: 2200, isActive: true },
  { destination: 'KAMBOVE', totalLiters: 2220, isActive: true },
  { destination: 'FUNGURUME', totalLiters: 2300, isActive: true },
  { destination: 'KINSANFU', totalLiters: 2360, isActive: true },
  { destination: 'LAMIKAL', totalLiters: 2360, isActive: true },
  { destination: 'KOLWEZI', totalLiters: 2400, isActive: true },
  { destination: 'KAMOA', totalLiters: 2440, isActive: true },
  { destination: 'KALONGWE', totalLiters: 2440, isActive: true },
  { destination: 'LUSAKA', totalLiters: 1900, isActive: true },
];

// Truck batches are now managed dynamically via database (admin panel)
// No hardcoded defaults - all managed through SystemConfig

const DEFAULT_STANDARD_ALLOCATIONS = {
  mmsaYard: 0,
  tangaYardToDar: 100,
  darYardStandard: 550,
  darYardKisarawe: 580,
  darGoing: 0,
  moroGoing: 0,
  mbeyaGoing: 450,
  tdmGoing: 0,
  zambiaGoing: 0,
  congoFuel: 0,
  zambiaReturn: 400,
  tundumaReturn: 100,
  mbeyaReturn: 400,
  moroReturnToMombasa: 100,
  darReturn: 0,
  tangaReturnToMombasa: 70,
};

/**
 * Get all fuel stations configuration
 */
export const getFuelStations = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    let config = await SystemConfig.findOne({
      configType: 'fuel_stations',
      isDeleted: false,
    });

    if (!config) {
      // Create default config
      config = await SystemConfig.create({
        configType: 'fuel_stations',
        fuelStations: DEFAULT_FUEL_STATIONS,
        lastUpdatedBy: 'system',
      });
    }

    res.status(200).json({
      success: true,
      message: 'Fuel stations retrieved successfully',
      data: config.fuelStations,
    });
  } catch (error: any) {
    throw error;
  }
};

/**
 * Update fuel station
 */
export const updateFuelStation = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { stationId } = req.params;
    const { pricePerLiter, isActive, name, location } = req.body;

    let config = await SystemConfig.findOne({
      configType: 'fuel_stations',
      isDeleted: false,
    });

    if (!config) {
      config = await SystemConfig.create({
        configType: 'fuel_stations',
        fuelStations: DEFAULT_FUEL_STATIONS,
        lastUpdatedBy: req.user?.username || 'system',
      });
    }

    const stationIndex = config.fuelStations?.findIndex(s => s.id === stationId);
    
    if (stationIndex === undefined || stationIndex === -1) {
      throw new ApiError(404, 'Station not found');
    }

    // Update station fields
    if (config.fuelStations) {
      if (pricePerLiter !== undefined) config.fuelStations[stationIndex].pricePerLiter = pricePerLiter;
      if (isActive !== undefined) config.fuelStations[stationIndex].isActive = isActive;
      if (name !== undefined) config.fuelStations[stationIndex].name = name;
      if (location !== undefined) config.fuelStations[stationIndex].location = location;
    }

    config.lastUpdatedBy = req.user?.username || 'system';
    await config.save();

    logger.info(`Fuel station ${stationId} updated by ${req.user?.username}`);

    await AuditService.log({
      userId: req.user?.userId,
      username: req.user?.username || 'system',
      action: 'UPDATE',
      resourceType: 'FuelStation',
      resourceId: stationId,
      details: `Fuel station "${stationId}" updated by ${req.user?.username}`,
      ipAddress: req.ip,
      severity: 'medium',
    });

    res.status(200).json({
      success: true,
      message: 'Fuel station updated successfully',
      data: config.fuelStations?.[stationIndex],
    });

    emitDataChange('fuel_stations', 'update', config.fuelStations?.[stationIndex] as Record<string, any>);
  } catch (error: any) {
    throw error;
  }
};

/**
 * Add new fuel station
 */
export const addFuelStation = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id, name, location, pricePerLiter, isActive = true } = req.body;

    if (!id || !name || !location || pricePerLiter === undefined) {
      throw new ApiError(400, 'Missing required fields: id, name, location, pricePerLiter');
    }

    let config = await SystemConfig.findOne({
      configType: 'fuel_stations',
      isDeleted: false,
    });

    if (!config) {
      config = await SystemConfig.create({
        configType: 'fuel_stations',
        fuelStations: [],
        lastUpdatedBy: req.user?.username || 'system',
      });
    }

    // Check if station already exists
    const existingStation = config.fuelStations?.find(s => s.id === id);
    if (existingStation) {
      throw new ApiError(400, 'Station with this ID already exists');
    }

    const newStation = { id, name, location, pricePerLiter, isActive };
    config.fuelStations?.push(newStation);
    config.lastUpdatedBy = req.user?.username || 'system';
    await config.save();

    logger.info(`New fuel station ${name} added by ${req.user?.username}`);

    await AuditService.log({
      userId: req.user?.userId,
      username: req.user?.username || 'system',
      action: 'CREATE',
      resourceType: 'FuelStation',
      resourceId: newStation.name,
      details: `New fuel station "${name}" added by ${req.user?.username}`,
      ipAddress: req.ip,
      severity: 'medium',
    });

    res.status(201).json({
      success: true,
      message: 'Fuel station added successfully',
      data: newStation,
    });

    emitDataChange('fuel_stations', 'create');
  } catch (error: any) {
    throw error;
  }
};

/**
 * Bulk update fuel station rates
 */
export const bulkUpdateStationRates = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { updates } = req.body; // Array of { stationId, pricePerLiter }

    if (!Array.isArray(updates) || updates.length === 0) {
      throw new ApiError(400, 'Updates array is required');
    }

    let config = await SystemConfig.findOne({
      configType: 'fuel_stations',
      isDeleted: false,
    });

    if (!config || !config.fuelStations) {
      throw new ApiError(404, 'Fuel stations configuration not found');
    }

    let updatedCount = 0;
    for (const update of updates) {
      const stationIndex = config.fuelStations.findIndex(s => s.id === update.stationId);
      if (stationIndex !== -1) {
        config.fuelStations[stationIndex].pricePerLiter = update.pricePerLiter;
        updatedCount++;
      }
    }

    config.lastUpdatedBy = req.user?.username || 'system';
    await config.save();

    logger.info(`Bulk update: ${updatedCount} fuel stations updated by ${req.user?.username}`);

    await AuditService.log({
      userId: req.user?.userId,
      username: req.user?.username || 'system',
      action: 'BULK_OPERATION',
      resourceType: 'FuelStation',
      resourceId: 'bulk',
      details: `Bulk updated ${updatedCount} fuel station rates by ${req.user?.username}`,
      ipAddress: req.ip,
      severity: 'high',
    });

    res.status(200).json({
      success: true,
      message: `${updatedCount} fuel stations updated successfully`,
      data: config.fuelStations,
    });

    emitDataChange('fuel_stations', 'update');
  } catch (error: any) {
    throw error;
  }
};

/**
 * Get all route configurations
 */
export const getRoutes = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    let config = await SystemConfig.findOne({
      configType: 'routes',
      isDeleted: false,
    });

    if (!config) {
      config = await SystemConfig.create({
        configType: 'routes',
        routes: DEFAULT_ROUTES,
        lastUpdatedBy: 'system',
      });
    }

    res.status(200).json({
      success: true,
      message: 'Routes retrieved successfully',
      data: config.routes,
    });
  } catch (error: any) {
    throw error;
  }
};

/**
 * Update route configuration
 */
export const updateRoute = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { destination } = req.params;
    const { totalLiters, isActive } = req.body;

    let config = await SystemConfig.findOne({
      configType: 'routes',
      isDeleted: false,
    });

    if (!config) {
      config = await SystemConfig.create({
        configType: 'routes',
        routes: DEFAULT_ROUTES,
        lastUpdatedBy: req.user?.username || 'system',
      });
    }

    const routeIndex = config.routes?.findIndex(
      r => r.destination.toUpperCase() === destination.toUpperCase()
    );

    if (routeIndex === undefined || routeIndex === -1) {
      throw new ApiError(404, 'Route not found');
    }

    if (config.routes) {
      if (totalLiters !== undefined) config.routes[routeIndex].totalLiters = totalLiters;
      if (isActive !== undefined) config.routes[routeIndex].isActive = isActive;
    }

    config.lastUpdatedBy = req.user?.username || 'system';
    await config.save();

    logger.info(`Route ${destination} updated by ${req.user?.username}`);

    await AuditService.log({
      userId: req.user?.userId,
      username: req.user?.username || 'system',
      action: 'UPDATE',
      resourceType: 'Route',
      resourceId: destination,
      details: `Route to "${destination}" updated by ${req.user?.username}`,
      ipAddress: req.ip,
      severity: 'medium',
    });

    res.status(200).json({
      success: true,
      message: 'Route updated successfully',
      data: config.routes?.[routeIndex],
    });

    emitDataChange('routes', 'update');
  } catch (error: any) {
    throw error;
  }
};

/**
 * Add new route
 */
export const addRoute = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { destination, totalLiters, isActive = true } = req.body;

    if (!destination || totalLiters === undefined) {
      throw new ApiError(400, 'Missing required fields: destination, totalLiters');
    }

    let config = await SystemConfig.findOne({
      configType: 'routes',
      isDeleted: false,
    });

    if (!config) {
      config = await SystemConfig.create({
        configType: 'routes',
        routes: [],
        lastUpdatedBy: req.user?.username || 'system',
      });
    }

    // Check if route already exists
    const existingRoute = config.routes?.find(
      r => r.destination.toUpperCase() === destination.toUpperCase()
    );
    if (existingRoute) {
      throw new ApiError(400, 'Route to this destination already exists');
    }

    const newRoute = { destination: destination.toUpperCase(), totalLiters, isActive };
    config.routes?.push(newRoute);
    config.lastUpdatedBy = req.user?.username || 'system';
    await config.save();

    logger.info(`New route to ${destination} added by ${req.user?.username}`);

    await AuditService.log({
      userId: req.user?.userId,
      username: req.user?.username || 'system',
      action: 'CREATE',
      resourceType: 'Route',
      resourceId: destination,
      details: `New route to "${destination}" (${totalLiters}L) added by ${req.user?.username}`,
      ipAddress: req.ip,
      severity: 'medium',
    });

    res.status(201).json({
      success: true,
      message: 'Route added successfully',
      data: newRoute,
    });

    emitDataChange('routes', 'create');
  } catch (error: any) {
    throw error;
  }
};

/**
 * Delete route
 */
export const deleteRoute = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { destination } = req.params;

    let config = await SystemConfig.findOne({
      configType: 'routes',
      isDeleted: false,
    });

    if (!config || !config.routes) {
      throw new ApiError(404, 'Routes configuration not found');
    }

    const routeIndex = config.routes.findIndex(
      r => r.destination.toUpperCase() === destination.toUpperCase()
    );

    if (routeIndex === -1) {
      throw new ApiError(404, 'Route not found');
    }

    config.routes.splice(routeIndex, 1);
    config.lastUpdatedBy = req.user?.username || 'system';
    await config.save();

    logger.info(`Route ${destination} deleted by ${req.user?.username}`);

    await AuditService.log({
      userId: req.user?.userId,
      username: req.user?.username || 'system',
      action: 'DELETE',
      resourceType: 'Route',
      resourceId: destination,
      details: `Route to "${destination}" deleted by ${req.user?.username}`,
      ipAddress: req.ip,
      severity: 'medium',
    });

    res.status(200).json({
      success: true,
      message: 'Route deleted successfully',
    });

    emitDataChange('routes', 'delete');
  } catch (error: any) {
    throw error;
  }
};

/**
 * Get truck batches configuration
 */
export const getTruckBatches = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    let config = await SystemConfig.findOne({
      configType: 'truck_batches',
      isDeleted: false,
    });

    if (!config) {
      config = await SystemConfig.create({
        configType: 'truck_batches',
        truckBatches: {}, // Empty - admin must configure via admin panel
        lastUpdatedBy: 'system',
      });
    }

    res.status(200).json({
      success: true,
      message: 'Truck batches retrieved successfully',
      data: {
        truckBatches: config.truckBatches || {},
        batchDestinationRules: config.batchDestinationRules || {},
      },
    });
  } catch (error: any) {
    throw error;
  }
};

/**
 * Add truck to a batch (now supports dynamic batch creation)
 */
export const addTruckToBatch = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { truckSuffix, extraLiters, truckNumber } = req.body;

    if (!truckSuffix || extraLiters === undefined) {
      throw new ApiError(400, 'Missing required fields: truckSuffix, extraLiters');
    }

    if (extraLiters < 0 || extraLiters > 10000) {
      throw new ApiError(400, 'extraLiters must be between 0 and 10000');
    }

    let config = await SystemConfig.findOne({
      configType: 'truck_batches',
      isDeleted: false,
    });

    if (!config) {
      config = await SystemConfig.create({
        configType: 'truck_batches',
        truckBatches: {},
        lastUpdatedBy: req.user?.username || 'system',
      });
    }

    const suffix = truckSuffix.toLowerCase();
    const batchKey = extraLiters.toString();

    // Initialize truckBatches if not exists
    if (!config.truckBatches) {
      config.truckBatches = {};
    }

    // Remove from all batches first (in case of moving)
    Object.keys(config.truckBatches).forEach(key => {
      if (config.truckBatches && Array.isArray(config.truckBatches[key])) {
        config.truckBatches[key] = config.truckBatches[key].filter((t: any) => t.truckSuffix !== suffix);
      }
    });

    // Create batch if doesn't exist
    if (!config.truckBatches[batchKey]) {
      config.truckBatches[batchKey] = [];
    }

    // Add truck to batch
    const newTruck = {
      truckSuffix: suffix,
      extraLiters,
      truckNumber,
      addedBy: req.user?.username || 'system',
      addedAt: new Date(),
    };

    config.truckBatches[batchKey].push(newTruck);
    config.markModified('truckBatches');
    config.lastUpdatedBy = req.user?.username || 'system';
    await config.save();

    logger.info(`Truck ${truckSuffix} added to batch ${extraLiters}L by ${req.user?.username}`);

    // Auto-fill locked fuel records that were waiting for this truck's batch
    const { autoFillFuelRecordsForBatch } = await import('./configController');
    await autoFillFuelRecordsForBatch(suffix, extraLiters, req.user?.username || 'system');

    await AuditService.log({
      userId: req.user?.userId,
      username: req.user?.username || 'system',
      action: 'CREATE',
      resourceType: 'TruckBatch',
      resourceId: truckSuffix,
      details: `Truck "${truckSuffix}" added to ${extraLiters}L batch by ${req.user?.username}`,
      ipAddress: req.ip,
      severity: 'medium',
    });

    // Add cache-busting headers to force client refresh
    setCacheBustingHeaders(res);

    res.status(201).json({
      success: true,
      message: `Truck added to ${extraLiters}L batch successfully`,
      data: { truckBatches: config.truckBatches, batchDestinationRules: config.batchDestinationRules || {} },
    });
    emitDataChange('truck_batches', 'update');
  } catch (error: any) {
    throw error;
  }
};

/**
 * Remove truck from batches (now supports dynamic batches)
 */
export const removeTruckFromBatch = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { truckSuffix } = req.params;

    let config = await SystemConfig.findOne({
      configType: 'truck_batches',
      isDeleted: false,
    });

    if (!config || !config.truckBatches) {
      throw new ApiError(404, 'Truck batches configuration not found');
    }

    const suffix = truckSuffix.toLowerCase();
    let found = false;

    // Remove from all batches dynamically
    Object.keys(config.truckBatches).forEach(key => {
      if (config.truckBatches && Array.isArray(config.truckBatches[key])) {
        const originalLength = config.truckBatches[key].length;
        config.truckBatches[key] = config.truckBatches[key].filter((t: any) => t.truckSuffix !== suffix);
        if (config.truckBatches[key].length < originalLength) {
          found = true;
        }
      }
    });

    if (!found) {
      throw new ApiError(404, 'Truck not found in any batch');
    }

    config.markModified('truckBatches');
    config.lastUpdatedBy = req.user?.username || 'system';
    await config.save();

    logger.info(`Truck ${truckSuffix} removed from batches by ${req.user?.username}`);

    await AuditService.log({
      userId: req.user?.userId,
      username: req.user?.username || 'system',
      action: 'DELETE',
      resourceType: 'TruckBatch',
      resourceId: truckSuffix,
      details: `Truck "${truckSuffix}" removed from all batches by ${req.user?.username}`,
      ipAddress: req.ip,
      severity: 'medium',
    });

    // Add cache-busting headers to force client refresh
    setCacheBustingHeaders(res);

    res.status(200).json({
      success: true,
      message: 'Truck removed from batch successfully',
      data: { truckBatches: config.truckBatches, batchDestinationRules: config.batchDestinationRules || {} },
    });
    emitDataChange('truck_batches', 'update');
  } catch (error: any) {
    throw error;
  }
};

/**
 * Add destination fuel rule for a truck in a batch
 */
export const addDestinationRule = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { truckSuffix, destination, extraLiters } = req.body;

    let config = await SystemConfig.findOne({
      configType: 'truck_batches',
      isDeleted: false,
    });

    if (!config || !config.truckBatches) {
      throw new ApiError(404, 'Truck batches configuration not found');
    }

    const suffix = truckSuffix.toLowerCase();

    // Find truck across all batches dynamically
    let truck: any = null;
    for (const batchKey of Object.keys(config.truckBatches)) {
      if (Array.isArray(config.truckBatches[batchKey])) {
        const foundTruck = config.truckBatches[batchKey].find((t: any) => t.truckSuffix === suffix);
        if (foundTruck) {
          truck = foundTruck;
          break;
        }
      }
    }

    if (!truck) {
      throw new ApiError(404, 'Truck not found in any batch');
    }

    if (!truck.destinationRules) {
      truck.destinationRules = [];
    }
    truck.destinationRules.push({ destination, extraLiters });

    config.markModified('truckBatches');
    config.lastUpdatedBy = req.user?.username || 'system';
    await config.save();

    logger.info(`Destination rule added for truck ${truckSuffix}: ${destination} -> ${extraLiters}L by ${req.user?.username}`);

    await AuditService.log({
      userId: req.user?.userId,
      username: req.user?.username || 'system',
      action: 'CREATE',
      resourceType: 'TruckBatch',
      resourceId: truckSuffix,
      details: `Destination rule added for truck "${truckSuffix}": ${destination} -> ${extraLiters}L by ${req.user?.username}`,
      ipAddress: req.ip,
      severity: 'low',
    });

    // Add cache-busting headers to force client refresh
    setCacheBustingHeaders(res);

    res.status(200).json({
      success: true,
      message: 'Destination rule added successfully',
      data: truck,
    });
    emitDataChange('truck_batches', 'update');
  } catch (error: any) {
    throw error;
  }
};

/**
 * Update destination fuel rule
 */
export const updateDestinationRule = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { truckSuffix, oldDestination, newDestination, extraLiters } = req.body;

    let config = await SystemConfig.findOne({
      configType: 'truck_batches',
      isDeleted: false,
    });

    if (!config || !config.truckBatches) {
      throw new ApiError(404, 'Truck batches configuration not found');
    }

    const suffix = truckSuffix.toLowerCase();
    let found = false;

    // Search all batches dynamically
    for (const batchKey of Object.keys(config.truckBatches)) {
      if (Array.isArray(config.truckBatches[batchKey])) {
        const truck = config.truckBatches[batchKey].find((t: any) => t.truckSuffix === suffix);
        if (truck && truck.destinationRules) {
          const ruleIndex = truck.destinationRules.findIndex((r: any) => r.destination === oldDestination);
          if (ruleIndex !== -1) {
            truck.destinationRules[ruleIndex] = { destination: newDestination || oldDestination, extraLiters };
            found = true;
            break;
          }
        }
      }
    }

    if (!found) {
      throw new ApiError(404, 'Destination rule not found');
    }

    config.markModified('truckBatches');
    config.lastUpdatedBy = req.user?.username || 'system';
    await config.save();

    logger.info(`Destination rule updated for truck ${truckSuffix}: ${oldDestination} -> ${extraLiters}L by ${req.user?.username}`);

    await AuditService.log({
      userId: req.user?.userId,
      username: req.user?.username || 'system',
      action: 'UPDATE',
      resourceType: 'TruckBatch',
      resourceId: truckSuffix,
      details: `Destination rule updated for truck "${truckSuffix}": ${oldDestination} -> ${newDestination || oldDestination} (${extraLiters}L) by ${req.user?.username}`,
      ipAddress: req.ip,
      severity: 'low',
    });

    // Add cache-busting headers to force client refresh
    setCacheBustingHeaders(res);

    res.status(200).json({
      success: true,
      message: 'Destination rule updated successfully',
      data: { truckBatches: config.truckBatches, batchDestinationRules: config.batchDestinationRules || {} },
    });
    emitDataChange('truck_batches', 'update');
  } catch (error: any) {
    throw error;
  }
};

/**
 * Delete destination fuel rule
 */
export const deleteDestinationRule = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { truckSuffix, destination } = req.params;

    let config = await SystemConfig.findOne({
      configType: 'truck_batches',
      isDeleted: false,
    });

    if (!config || !config.truckBatches) {
      throw new ApiError(404, 'Truck batches configuration not found');
    }

    const suffix = truckSuffix.toLowerCase();
    let found = false;

    // Search all batches dynamically
    for (const batchKey of Object.keys(config.truckBatches)) {
      if (Array.isArray(config.truckBatches[batchKey])) {
        const truck = config.truckBatches[batchKey].find((t: any) => t.truckSuffix === suffix);
        if (truck && truck.destinationRules) {
          const originalLength = truck.destinationRules.length;
          truck.destinationRules = truck.destinationRules.filter((r: any) => r.destination !== destination);
          if (truck.destinationRules.length < originalLength) {
            found = true;
            break;
          }
        }
      }
    }

    if (!found) {
      throw new ApiError(404, 'Destination rule not found');
    }

    config.markModified('truckBatches');
    config.lastUpdatedBy = req.user?.username || 'system';
    await config.save();

    logger.info(`Destination rule deleted for truck ${truckSuffix}: ${destination} by ${req.user?.username}`);

    await AuditService.log({
      userId: req.user?.userId,
      username: req.user?.username || 'system',
      action: 'DELETE',
      resourceType: 'TruckBatch',
      resourceId: truckSuffix,
      details: `Destination rule "${destination}" deleted for truck "${truckSuffix}" by ${req.user?.username}`,
      ipAddress: req.ip,
      severity: 'low',
    });

    // Add cache-busting headers to force client refresh
    setCacheBustingHeaders(res);

    res.status(200).json({
      success: true,
      message: 'Destination rule deleted successfully',
      data: { truckBatches: config.truckBatches, batchDestinationRules: config.batchDestinationRules || {} },
    });
    emitDataChange('truck_batches', 'update');
  } catch (error: any) {
    throw error;
  }
};

/**
 * Create a new batch with custom extra liters
 */
export const createBatch = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { extraLiters } = req.body;

    if (extraLiters === undefined || extraLiters < 0 || extraLiters > 10000) {
      throw new ApiError(400, 'extraLiters must be between 0 and 10000');
    }

    let config = await SystemConfig.findOne({
      configType: 'truck_batches',
      isDeleted: false,
    });

    if (!config) {
      config = await SystemConfig.create({
        configType: 'truck_batches',
        truckBatches: {},
        lastUpdatedBy: req.user?.username || 'system',
      });
    }

    const batchKey = extraLiters.toString();

    if (!config.truckBatches) {
      config.truckBatches = {};
    }

    if (config.truckBatches[batchKey]) {
      throw new ApiError(400, `Batch with ${extraLiters}L already exists`);
    }

    config.truckBatches[batchKey] = [];
    if (!config.batchDestinationRules) config.batchDestinationRules = {};
    config.batchDestinationRules[batchKey] = [];
    config.markModified('truckBatches');
    config.markModified('batchDestinationRules');
    config.lastUpdatedBy = req.user?.username || 'system';
    await config.save();

    logger.info(`New batch created: ${extraLiters}L by ${req.user?.username}`);

    await AuditService.log({
      userId: req.user?.userId,
      username: req.user?.username || 'system',
      action: 'CREATE',
      resourceType: 'TruckBatch',
      resourceId: String(extraLiters),
      details: `New ${extraLiters}L truck batch created by ${req.user?.username}`,
      ipAddress: req.ip,
      severity: 'medium',
    });

    // Add cache-busting headers to force client refresh
    setCacheBustingHeaders(res);

    res.status(201).json({
      success: true,
      message: `Batch ${extraLiters}L created successfully`,
      data: { truckBatches: config.truckBatches, batchDestinationRules: config.batchDestinationRules || {} },
    });
    emitDataChange('truck_batches', 'create');
  } catch (error: any) {
    throw error;
  }
};

/**
 * Update a batch (change extraLiters allocation)
 */
export const updateBatch = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { oldExtraLiters, newExtraLiters } = req.body;

    if (!oldExtraLiters || !newExtraLiters) {
      throw new ApiError(400, 'Missing required fields: oldExtraLiters, newExtraLiters');
    }

    if (newExtraLiters < 0 || newExtraLiters > 10000) {
      throw new ApiError(400, 'newExtraLiters must be between 0 and 10000');
    }

    let config = await SystemConfig.findOne({
      configType: 'truck_batches',
      isDeleted: false,
    });

    if (!config || !config.truckBatches) {
      throw new ApiError(404, 'Truck batches configuration not found');
    }

    const oldKey = oldExtraLiters.toString();
    const newKey = newExtraLiters.toString();

    if (!config.truckBatches[oldKey]) {
      throw new ApiError(404, `Batch ${oldExtraLiters}L not found`);
    }

    if (config.truckBatches[newKey]) {
      throw new ApiError(400, `Batch ${newExtraLiters}L already exists`);
    }

    // Move trucks to new batch and update their extraLiters
    const trucks = config.truckBatches[oldKey];
    trucks.forEach((truck: any) => {
      truck.extraLiters = newExtraLiters;
    });
    config.truckBatches[newKey] = trucks;
    delete config.truckBatches[oldKey];

    // Migrate batch-level destination rules to the new key
    if (!config.batchDestinationRules) config.batchDestinationRules = {};
    config.batchDestinationRules[newKey] = config.batchDestinationRules[oldKey] || [];
    delete config.batchDestinationRules[oldKey];

    config.markModified('truckBatches');
    config.markModified('batchDestinationRules');
    config.lastUpdatedBy = req.user?.username || 'system';
    await config.save();

    logger.info(`Batch updated: ${oldExtraLiters}L → ${newExtraLiters}L by ${req.user?.username}`);

    await AuditService.log({
      userId: req.user?.userId,
      username: req.user?.username || 'system',
      action: 'UPDATE',
      resourceType: 'TruckBatch',
      resourceId: String(oldExtraLiters),
      details: `Truck batch updated from ${oldExtraLiters}L to ${newExtraLiters}L by ${req.user?.username}`,
      ipAddress: req.ip,
      severity: 'medium',
    });

    // Add cache-busting headers to force client refresh
    setCacheBustingHeaders(res);

    res.status(200).json({
      success: true,
      message: `Batch updated from ${oldExtraLiters}L to ${newExtraLiters}L successfully`,
      data: { truckBatches: config.truckBatches, batchDestinationRules: config.batchDestinationRules || {} },
    });
    emitDataChange('truck_batches', 'update');
  } catch (error: any) {
    throw error;
  }
};

/**
 * Delete a batch (only if empty)
 */
export const deleteBatch = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { extraLiters } = req.params;

    if (!extraLiters) {
      throw new ApiError(400, 'extraLiters parameter is required');
    }

    let config = await SystemConfig.findOne({
      configType: 'truck_batches',
      isDeleted: false,
    });

    if (!config || !config.truckBatches) {
      throw new ApiError(404, 'Truck batches configuration not found');
    }

    const batchKey = extraLiters.toString();

    if (!config.truckBatches[batchKey]) {
      throw new ApiError(404, `Batch ${extraLiters}L not found`);
    }

    if (config.truckBatches[batchKey].length > 0) {
      throw new ApiError(400, `Cannot delete batch ${extraLiters}L with ${config.truckBatches[batchKey].length} trucks assigned. Move trucks first.`);
    }

    delete config.truckBatches[batchKey];
    if (config.batchDestinationRules) {
      delete config.batchDestinationRules[batchKey];
      config.markModified('batchDestinationRules');
    }
    config.markModified('truckBatches');
    config.lastUpdatedBy = req.user?.username || 'system';
    await config.save();

    logger.info(`Batch deleted: ${extraLiters}L by ${req.user?.username}`);

    await AuditService.log({
      userId: req.user?.userId,
      username: req.user?.username || 'system',
      action: 'DELETE',
      resourceType: 'TruckBatch',
      resourceId: extraLiters,
      details: `Truck batch ${extraLiters}L deleted by ${req.user?.username}`,
      ipAddress: req.ip,
      severity: 'medium',
    });

    // Add cache-busting headers to force client refresh
    setCacheBustingHeaders(res);

    res.status(200).json({
      success: true,
      message: `Batch ${extraLiters}L deleted successfully`,
      data: { truckBatches: config.truckBatches, batchDestinationRules: config.batchDestinationRules || {} },
    });
    emitDataChange('truck_batches', 'delete');
  } catch (error: any) {
    throw error;
  }
};

/**
 * Add a destination rule at the batch level (applies to all trucks in the batch)
 */
export const addBatchDestinationRule = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { extraLiters, destination, extraLitersOverride } = req.body;

    if (!destination || extraLitersOverride === undefined) {
      throw new ApiError(400, 'Missing required fields: destination, extraLitersOverride');
    }

    let config = await SystemConfig.findOne({ configType: 'truck_batches', isDeleted: false });
    if (!config || !config.truckBatches) {
      throw new ApiError(404, 'Truck batches configuration not found');
    }

    const batchKey = extraLiters.toString();
    if (!config.truckBatches[batchKey]) {
      throw new ApiError(404, `Batch ${extraLiters}L not found`);
    }

    if (!config.batchDestinationRules) config.batchDestinationRules = {};
    if (!config.batchDestinationRules[batchKey]) config.batchDestinationRules[batchKey] = [];

    const existing = config.batchDestinationRules[batchKey].find((r: any) => r.destination === destination);
    if (existing) {
      throw new ApiError(400, `Rule for destination "${destination}" already exists on this batch`);
    }

    config.batchDestinationRules[batchKey].push({ destination, extraLiters: extraLitersOverride });
    config.markModified('batchDestinationRules');
    config.lastUpdatedBy = req.user?.username || 'system';
    await config.save();

    logger.info(`Batch destination rule added: ${extraLiters}L batch, ${destination} -> ${extraLitersOverride}L by ${req.user?.username}`);

    await AuditService.log({
      userId: req.user?.userId,
      username: req.user?.username || 'system',
      action: 'CREATE',
      resourceType: 'TruckBatch',
      resourceId: batchKey,
      details: `Batch destination rule added: ${extraLiters}L batch, "${destination}" -> ${extraLitersOverride}L by ${req.user?.username}`,
      ipAddress: req.ip,
      severity: 'low',
    });

    setCacheBustingHeaders(res);
    res.status(200).json({
      success: true,
      message: 'Batch destination rule added successfully',
      data: { truckBatches: config.truckBatches, batchDestinationRules: config.batchDestinationRules },
    });
    emitDataChange('truck_batches', 'update');
  } catch (error: any) {
    throw error;
  }
};

/**
 * Update a batch-level destination rule
 */
export const updateBatchDestinationRule = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { extraLiters, oldDestination, newDestination, extraLitersOverride } = req.body;

    if (!oldDestination || extraLitersOverride === undefined) {
      throw new ApiError(400, 'Missing required fields: oldDestination, extraLitersOverride');
    }

    let config = await SystemConfig.findOne({ configType: 'truck_batches', isDeleted: false });
    if (!config || !config.batchDestinationRules) {
      throw new ApiError(404, 'Truck batches configuration not found');
    }

    const batchKey = extraLiters.toString();
    const rules = config.batchDestinationRules[batchKey];
    if (!rules) throw new ApiError(404, `No batch rules for ${extraLiters}L batch`);

    const ruleIndex = rules.findIndex((r: any) => r.destination === oldDestination);
    if (ruleIndex === -1) throw new ApiError(404, `Rule for "${oldDestination}" not found`);

    rules[ruleIndex] = { destination: newDestination || oldDestination, extraLiters: extraLitersOverride };
    config.markModified('batchDestinationRules');
    config.lastUpdatedBy = req.user?.username || 'system';
    await config.save();

    logger.info(`Batch destination rule updated: ${extraLiters}L batch, "${oldDestination}" -> "${newDestination || oldDestination}" ${extraLitersOverride}L by ${req.user?.username}`);

    await AuditService.log({
      userId: req.user?.userId,
      username: req.user?.username || 'system',
      action: 'UPDATE',
      resourceType: 'TruckBatch',
      resourceId: batchKey,
      details: `Batch destination rule updated: ${extraLiters}L batch, "${oldDestination}" -> "${newDestination || oldDestination}" (${extraLitersOverride}L) by ${req.user?.username}`,
      ipAddress: req.ip,
      severity: 'low',
    });

    setCacheBustingHeaders(res);
    res.status(200).json({
      success: true,
      message: 'Batch destination rule updated successfully',
      data: { truckBatches: config.truckBatches, batchDestinationRules: config.batchDestinationRules },
    });
    emitDataChange('truck_batches', 'update');
  } catch (error: any) {
    throw error;
  }
};

/**
 * Delete a batch-level destination rule
 */
export const deleteBatchDestinationRule = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { extraLiters, destination } = req.params;

    let config = await SystemConfig.findOne({ configType: 'truck_batches', isDeleted: false });
    if (!config || !config.batchDestinationRules) {
      throw new ApiError(404, 'Truck batches configuration not found');
    }

    const batchKey = extraLiters;
    const rules = config.batchDestinationRules[batchKey];
    if (!rules) throw new ApiError(404, `No batch rules for ${extraLiters}L batch`);

    const originalLength = rules.length;
    config.batchDestinationRules[batchKey] = rules.filter((r: any) => r.destination !== destination);
    if (config.batchDestinationRules[batchKey].length === originalLength) {
      throw new ApiError(404, `Rule for "${destination}" not found`);
    }

    config.markModified('batchDestinationRules');
    config.lastUpdatedBy = req.user?.username || 'system';
    await config.save();

    logger.info(`Batch destination rule deleted: ${extraLiters}L batch, "${destination}" by ${req.user?.username}`);

    await AuditService.log({
      userId: req.user?.userId,
      username: req.user?.username || 'system',
      action: 'DELETE',
      resourceType: 'TruckBatch',
      resourceId: batchKey,
      details: `Batch destination rule deleted: ${extraLiters}L batch, "${destination}" by ${req.user?.username}`,
      ipAddress: req.ip,
      severity: 'low',
    });

    setCacheBustingHeaders(res);
    res.status(200).json({
      success: true,
      message: 'Batch destination rule deleted successfully',
      data: { truckBatches: config.truckBatches, batchDestinationRules: config.batchDestinationRules },
    });
    emitDataChange('truck_batches', 'update');
  } catch (error: any) {
    throw error;
  }
};

/**
 * Get standard allocations
 */
export const getStandardAllocations = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    let config = await SystemConfig.findOne({
      configType: 'standard_allocations',
      isDeleted: false,
    });

    if (!config) {
      config = await SystemConfig.create({
        configType: 'standard_allocations',
        standardAllocations: DEFAULT_STANDARD_ALLOCATIONS,
        lastUpdatedBy: 'system',
      });
    }

    res.status(200).json({
      success: true,
      message: 'Standard allocations retrieved successfully',
      data: config.standardAllocations,
    });
  } catch (error: any) {
    throw error;
  }
};

/**
 * Update standard allocations
 */
export const updateStandardAllocations = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const updates = req.body;

    let config = await SystemConfig.findOne({
      configType: 'standard_allocations',
      isDeleted: false,
    });

    if (!config) {
      config = await SystemConfig.create({
        configType: 'standard_allocations',
        standardAllocations: DEFAULT_STANDARD_ALLOCATIONS,
        lastUpdatedBy: req.user?.username || 'system',
      });
    }

    // Update only provided fields
    if (config.standardAllocations) {
      Object.keys(updates).forEach(key => {
        if (key in config.standardAllocations! && typeof updates[key] === 'number') {
          (config.standardAllocations as any)[key] = updates[key];
        }
      });
    }

    config.lastUpdatedBy = req.user?.username || 'system';
    await config.save();

    logger.info(`Standard allocations updated by ${req.user?.username}`);

    await AuditService.log({
      userId: req.user?.userId,
      username: req.user?.username || 'system',
      action: 'UPDATE',
      resourceType: 'Config',
      resourceId: 'standard_allocations',
      details: `Standard fuel allocations updated by ${req.user?.username}`,
      ipAddress: req.ip,
      severity: 'high',
    });

    // Emit real-time update so all clients refresh
    emitDataChange('standard_allocations', 'update');

    // Force cache bust
    setCacheBustingHeaders(res);

    res.status(200).json({
      success: true,
      message: 'Standard allocations updated successfully',
      data: config.standardAllocations,
    });
  } catch (error: any) {
    throw error;
  }
};

/**
 * Get journey configuration (start columns that trigger journey promotion).
 */
export const getJourneyConfig = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    let config = await SystemConfig.findOne({
      configType: 'journey_config',
      isDeleted: false,
    });

    if (!config) {
      config = await SystemConfig.create({
        configType: 'journey_config',
        journeyConfig: { startColumns: DEFAULT_START_COLUMNS, superManagerStations: [] },
        lastUpdatedBy: 'system',
      });
    }

    res.status(200).json({
      success: true,
      message: 'Journey configuration retrieved successfully',
      data: {
        startColumns: config.journeyConfig?.startColumns || DEFAULT_START_COLUMNS,
        selectableColumns: SELECTABLE_START_COLUMNS,
        superManagerStations: config.journeyConfig?.superManagerStations || [],
        superManagerNotifyCustomZambia: config.journeyConfig?.superManagerNotifyCustomZambia !== false,
        managerLpoLookbackDays: config.journeyConfig?.managerLpoLookbackDays ?? 0,
        autoDownloadDOPdf: config.journeyConfig?.autoDownloadDOPdf ?? true,
        autoDownloadLPOPdf: config.journeyConfig?.autoDownloadLPOPdf ?? true,
        fuelAutomation: { ...DEFAULT_FUEL_AUTOMATION, ...(config.journeyConfig?.fuelAutomation || {}) },
        cashLpoLookbackDays: config.journeyConfig?.cashLpoLookbackDays ?? 40,
        lpoTruckLookupMonths: config.journeyConfig?.lpoTruckLookupMonths ?? 4,
        searchConfig: {
          doMonths: config.journeyConfig?.searchConfig?.doMonths ?? 4,
          doMaxResults: config.journeyConfig?.searchConfig?.doMaxResults ?? 6,
          lpoMonths: config.journeyConfig?.searchConfig?.lpoMonths ?? 1,
          lpoMaxResults: config.journeyConfig?.searchConfig?.lpoMaxResults ?? 50,
          fuelMaxResults: config.journeyConfig?.searchConfig?.fuelMaxResults ?? 3,
        },
      },
    });
  } catch (error: any) {
    throw error;
  }
};

/**
 * Update journey configuration. Accepts a partial body: `startColumns` (which
 * fuel columns mark a journey as started) and/or `superManagerStations` (the
 * stations a super_manager may view). Unspecified fields are preserved.
 */
export const updateJourneyConfig = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { startColumns, superManagerStations, superManagerNotifyCustomZambia, managerLpoLookbackDays, autoDownloadDOPdf, autoDownloadLPOPdf, fuelAutomation, cashLpoLookbackDays, lpoTruckLookupMonths, searchConfig } = req.body;

    const hasStartColumns = startColumns !== undefined;
    const hasSmStations = superManagerStations !== undefined;
    const hasSmNotifyCustomZambia = superManagerNotifyCustomZambia !== undefined;
    const hasManagerLookback = managerLpoLookbackDays !== undefined;
    const hasAutoDownloadDO = autoDownloadDOPdf !== undefined;
    const hasAutoDownloadLPO = autoDownloadLPOPdf !== undefined;
    const hasFuelAutomation = fuelAutomation !== undefined;
    const hasCashLpoLookbackDays = cashLpoLookbackDays !== undefined;
    const hasLpoTruckLookupMonths = lpoTruckLookupMonths !== undefined;
    const hasSearchConfig = searchConfig !== undefined;

    if (!hasStartColumns && !hasSmStations && !hasSmNotifyCustomZambia && !hasManagerLookback && !hasAutoDownloadDO && !hasAutoDownloadLPO && !hasFuelAutomation && !hasCashLpoLookbackDays && !hasLpoTruckLookupMonths && !hasSearchConfig) {
      throw new ApiError(400, 'Provide at least one field to update');
    }

    // Validate fuel-automation: must be a flat object of known boolean keys only.
    const FUEL_AUTOMATION_KEYS = Object.keys(DEFAULT_FUEL_AUTOMATION) as (keyof IFuelAutomationConfig)[];
    if (hasFuelAutomation) {
      if (typeof fuelAutomation !== 'object' || fuelAutomation === null || Array.isArray(fuelAutomation)) {
        throw new ApiError(400, 'fuelAutomation must be an object');
      }
      for (const key of Object.keys(fuelAutomation)) {
        if (!FUEL_AUTOMATION_KEYS.includes(key as keyof IFuelAutomationConfig)) {
          throw new ApiError(400, `Unknown fuelAutomation key: ${key}`);
        }
        if (typeof fuelAutomation[key] !== 'boolean') {
          throw new ApiError(400, `fuelAutomation.${key} must be a boolean`);
        }
      }
    }

    if (hasSmNotifyCustomZambia && typeof superManagerNotifyCustomZambia !== 'boolean') {
      throw new ApiError(400, 'superManagerNotifyCustomZambia must be a boolean');
    }

    if (hasStartColumns) {
      if (!Array.isArray(startColumns) || startColumns.length === 0) {
        throw new ApiError(400, 'startColumns must be a non-empty array');
      }
      const invalid = startColumns.filter((c: string) => !SELECTABLE_START_COLUMNS.includes(c));
      if (invalid.length > 0) {
        throw new ApiError(400, `Invalid start columns: ${invalid.join(', ')}`);
      }
    }

    if (hasSmStations) {
      if (!Array.isArray(superManagerStations) || superManagerStations.some((s: any) => typeof s !== 'string')) {
        throw new ApiError(400, 'superManagerStations must be an array of station names');
      }
    }

    if (hasManagerLookback) {
      const parsed = Number(managerLpoLookbackDays);
      if (!Number.isInteger(parsed) || parsed < 0 || parsed > 3650) {
        throw new ApiError(400, 'managerLpoLookbackDays must be an integer between 0 (unlimited) and 3650');
      }
    }

    if (hasAutoDownloadDO && typeof autoDownloadDOPdf !== 'boolean') {
      throw new ApiError(400, 'autoDownloadDOPdf must be a boolean');
    }

    if (hasAutoDownloadLPO && typeof autoDownloadLPOPdf !== 'boolean') {
      throw new ApiError(400, 'autoDownloadLPOPdf must be a boolean');
    }

    if (hasCashLpoLookbackDays) {
      const parsed = Number(cashLpoLookbackDays);
      if (!Number.isInteger(parsed) || parsed < 1 || parsed > 365) {
        throw new ApiError(400, 'cashLpoLookbackDays must be an integer between 1 and 365');
      }
    }

    if (hasLpoTruckLookupMonths) {
      const parsed = Number(lpoTruckLookupMonths);
      if (!Number.isInteger(parsed) || parsed < 1 || parsed > 24) {
        throw new ApiError(400, 'lpoTruckLookupMonths must be an integer between 1 and 24');
      }
    }

    if (hasSearchConfig) {
      if (typeof searchConfig !== 'object' || searchConfig === null || Array.isArray(searchConfig)) {
        throw new ApiError(400, 'searchConfig must be an object');
      }
      const SEARCH_CONFIG_LIMITS: Record<string, [number, number]> = {
        doMonths: [1, 24],
        doMaxResults: [1, 100],
        lpoMonths: [1, 24],
        lpoMaxResults: [1, 500],
        fuelMaxResults: [1, 100],
      };
      for (const key of Object.keys(searchConfig)) {
        if (!SEARCH_CONFIG_LIMITS[key]) {
          throw new ApiError(400, `Unknown searchConfig key: ${key}`);
        }
        const val = Number(searchConfig[key]);
        const [min, max] = SEARCH_CONFIG_LIMITS[key];
        if (!Number.isInteger(val) || val < min || val > max) {
          throw new ApiError(400, `searchConfig.${key} must be an integer between ${min} and ${max}`);
        }
      }
    }

    let config = await SystemConfig.findOne({
      configType: 'journey_config',
      isDeleted: false,
    });

    // Merge onto the existing config so partial updates don't wipe other fields.
    const existing = config?.journeyConfig || { startColumns: DEFAULT_START_COLUMNS, superManagerStations: [] };
    const nextJourneyConfig = {
      startColumns: hasStartColumns ? startColumns : (existing.startColumns || DEFAULT_START_COLUMNS),
      superManagerStations: hasSmStations
        ? superManagerStations.map((s: string) => s.trim()).filter(Boolean)
        : (existing.superManagerStations || []),
      superManagerNotifyCustomZambia: hasSmNotifyCustomZambia
        ? superManagerNotifyCustomZambia
        : (existing.superManagerNotifyCustomZambia !== false),
      managerLpoLookbackDays: hasManagerLookback ? Number(managerLpoLookbackDays) : (existing.managerLpoLookbackDays ?? 0),
      autoDownloadDOPdf: hasAutoDownloadDO ? autoDownloadDOPdf : (existing.autoDownloadDOPdf ?? true),
      autoDownloadLPOPdf: hasAutoDownloadLPO ? autoDownloadLPOPdf : (existing.autoDownloadLPOPdf ?? true),
      // Merge: defaults < stored < incoming partial. Only known keys survive validation above.
      fuelAutomation: {
        ...DEFAULT_FUEL_AUTOMATION,
        ...(existing.fuelAutomation || {}),
        ...(hasFuelAutomation ? fuelAutomation : {}),
      },
      cashLpoLookbackDays: hasCashLpoLookbackDays ? Number(cashLpoLookbackDays) : (existing.cashLpoLookbackDays ?? 40),
      lpoTruckLookupMonths: hasLpoTruckLookupMonths ? Number(lpoTruckLookupMonths) : (existing.lpoTruckLookupMonths ?? 4),
      searchConfig: {
        doMonths: hasSearchConfig && searchConfig.doMonths !== undefined ? Number(searchConfig.doMonths) : (existing.searchConfig?.doMonths ?? 4),
        doMaxResults: hasSearchConfig && searchConfig.doMaxResults !== undefined ? Number(searchConfig.doMaxResults) : (existing.searchConfig?.doMaxResults ?? 6),
        lpoMonths: hasSearchConfig && searchConfig.lpoMonths !== undefined ? Number(searchConfig.lpoMonths) : (existing.searchConfig?.lpoMonths ?? 1),
        lpoMaxResults: hasSearchConfig && searchConfig.lpoMaxResults !== undefined ? Number(searchConfig.lpoMaxResults) : (existing.searchConfig?.lpoMaxResults ?? 50),
        fuelMaxResults: hasSearchConfig && searchConfig.fuelMaxResults !== undefined ? Number(searchConfig.fuelMaxResults) : (existing.searchConfig?.fuelMaxResults ?? 3),
      },
    };

    if (!config) {
      config = await SystemConfig.create({
        configType: 'journey_config',
        journeyConfig: nextJourneyConfig,
        lastUpdatedBy: req.user?.username || 'system',
      });
    } else {
      config.journeyConfig = nextJourneyConfig;
      config.lastUpdatedBy = req.user?.username || 'system';
      await config.save();
    }

    // Drop the in-memory cache so the new columns take effect immediately
    invalidateJourneyConfigCache();

    const detailParts: string[] = [];
    if (hasStartColumns) detailParts.push(`start columns [${nextJourneyConfig.startColumns.join(', ')}]`);
    if (hasSmStations) detailParts.push(`super-manager stations [${nextJourneyConfig.superManagerStations.join(', ')}]`);
    if (hasSmNotifyCustomZambia) detailParts.push(`superManagerNotifyCustomZambia=${nextJourneyConfig.superManagerNotifyCustomZambia}`);
    if (hasManagerLookback) detailParts.push(`managerLpoLookbackDays=${nextJourneyConfig.managerLpoLookbackDays}`);
    if (hasAutoDownloadDO) detailParts.push(`autoDownloadDOPdf=${nextJourneyConfig.autoDownloadDOPdf}`);
    if (hasAutoDownloadLPO) detailParts.push(`autoDownloadLPOPdf=${nextJourneyConfig.autoDownloadLPOPdf}`);
    if (hasFuelAutomation) {
      const changed = Object.keys(fuelAutomation).map((k) => `${k}=${fuelAutomation[k]}`).join(', ');
      detailParts.push(`fuelAutomation {${changed}}`);
    }
    if (hasCashLpoLookbackDays) detailParts.push(`cashLpoLookbackDays=${nextJourneyConfig.cashLpoLookbackDays}`);
    if (hasLpoTruckLookupMonths) detailParts.push(`lpoTruckLookupMonths=${nextJourneyConfig.lpoTruckLookupMonths}`);
    if (hasSearchConfig) {
      const changed = Object.keys(searchConfig).map((k) => `${k}=${searchConfig[k]}`).join(', ');
      detailParts.push(`searchConfig {${changed}}`);
    }
    logger.info(`Journey config updated by ${req.user?.username}: ${detailParts.join('; ')}`);

    await AuditService.log({
      userId: req.user?.userId,
      username: req.user?.username || 'system',
      action: 'UPDATE',
      resourceType: 'Config',
      resourceId: 'journey_config',
      details: `Journey config updated: ${detailParts.join('; ')}`,
      ipAddress: req.ip,
      severity: 'high',
    });

    // Real-time: notify all clients so the Config tab reflects the change live
    emitDataChange('journey_config', 'update');

    setCacheBustingHeaders(res);

    res.status(200).json({
      success: true,
      message: 'Journey configuration updated successfully',
      data: {
        startColumns: nextJourneyConfig.startColumns,
        selectableColumns: SELECTABLE_START_COLUMNS,
        superManagerStations: nextJourneyConfig.superManagerStations,
        superManagerNotifyCustomZambia: nextJourneyConfig.superManagerNotifyCustomZambia,
        managerLpoLookbackDays: nextJourneyConfig.managerLpoLookbackDays,
        autoDownloadDOPdf: nextJourneyConfig.autoDownloadDOPdf,
        autoDownloadLPOPdf: nextJourneyConfig.autoDownloadLPOPdf,
        fuelAutomation: nextJourneyConfig.fuelAutomation,
        cashLpoLookbackDays: nextJourneyConfig.cashLpoLookbackDays,
        lpoTruckLookupMonths: nextJourneyConfig.lpoTruckLookupMonths,
        searchConfig: nextJourneyConfig.searchConfig,
      },
    });
  } catch (error: any) {
    throw error;
  }
};

/**
 * Get all configuration (combined)
 */
export const getAllConfig = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const [fuelStationsConfig, routesConfig, truckBatchesConfig, allocationsConfig] = await Promise.all([
      SystemConfig.findOne({ configType: 'fuel_stations', isDeleted: false }),
      SystemConfig.findOne({ configType: 'routes', isDeleted: false }),
      SystemConfig.findOne({ configType: 'truck_batches', isDeleted: false }),
      SystemConfig.findOne({ configType: 'standard_allocations', isDeleted: false }),
    ]);

    res.status(200).json({
      success: true,
      message: 'All configurations retrieved successfully',
      data: {
        fuelStations: fuelStationsConfig?.fuelStations || DEFAULT_FUEL_STATIONS,
        routes: routesConfig?.routes || DEFAULT_ROUTES,
        truckBatches: truckBatchesConfig?.truckBatches || {}, // Empty if not configured
        standardAllocations: allocationsConfig?.standardAllocations || DEFAULT_STANDARD_ALLOCATIONS,
      },
    });
  } catch (error: any) {
    throw error;
  }
};

/**
 * Reset configuration to defaults
 */
export const resetConfig = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { configType } = req.params;

    if (!['fuel_stations', 'routes', 'truck_batches', 'standard_allocations', 'all'].includes(configType)) {
      throw new ApiError(400, 'Invalid configuration type');
    }

    if (configType === 'all') {
      await SystemConfig.updateMany(
        { isDeleted: false },
        { isDeleted: true, deletedAt: new Date() }
      );
    } else {
      await SystemConfig.updateOne(
        { configType, isDeleted: false },
        { isDeleted: true, deletedAt: new Date() }
      );
    }

    logger.info(`Configuration ${configType} reset to defaults by ${req.user?.username}`);

    await AuditService.log({
      userId: req.user?.userId,
      username: req.user?.username || 'system',
      action: 'DELETE',
      resourceType: 'Config',
      resourceId: configType,
      details: `Configuration "${configType}" reset to defaults by ${req.user?.username}`,
      ipAddress: req.ip,
      severity: configType === 'all' ? 'critical' : 'high',
    });

    res.status(200).json({
      success: true,
      message: `Configuration reset to defaults successfully`,
    });
  } catch (error: any) {
    throw error;
  }
};

// =============================================
// System Admin Functionality (Merged from systemAdminController)
// =============================================

/**
 * Get database metrics
 */
export const getDatabaseMetrics = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const metrics = await databaseMonitor.collectMetrics();
    const status = await databaseMonitor.getStatus();

    res.status(200).json({
      success: true,
      data: {
        ...metrics,
        status: status.status,
        details: status.details,
      },
    });
  } catch (error: any) {
    logger.error('Error getting database metrics:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

/**
 * Get database health check
 */
export const getDatabaseHealth = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const isHealthy = await databaseMonitor.healthCheck();
    const status = await databaseMonitor.getStatus();

    res.status(200).json({
      success: true,
      data: {
        healthy: isHealthy,
        status: status.status,
        details: status.details,
        timestamp: new Date(),
      },
    });
  } catch (error: any) {
    logger.error('Error checking database health:', error);
    // ✅ SECURITY: Do not echo error.message — Mongoose connection errors can
    // contain internal hostnames / private IPs (info-leakage, OWASP A05).
    res.status(500).json({ success: false, message: 'Database health check failed' });
  }
};

/**
 * Get audit logs
 */
export const getAuditLogs = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const {
      action,
      resourceType,
      username,
      severity,
      startDate,
      endDate,
      page = 1,
      limit = 50,
    } = req.query;

    const result = await AuditService.getLogs({
      action: action as any,
      resourceType: resourceType as string,
      username: username as string,
      severity: severity as any,
      startDate: startDate ? new Date(startDate as string) : undefined,
      endDate: endDate ? new Date(endDate as string) : undefined,
      page: Number(page),
      limit: Number(limit),
    });

    res.status(200).json({
      success: true,
      data: result.logs,
      pagination: result.pagination,
    });
  } catch (error: any) {
    logger.error('Error getting audit logs:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

/**
 * Get activity summary for dashboard
 */
export const getActivitySummary = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { days = 7 } = req.query;
    const summary = await AuditService.getActivitySummary(Number(days));

    res.status(200).json({
      success: true,
      data: summary,
    });
  } catch (error: any) {
    logger.error('Error getting activity summary:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

/**
 * Get recent critical events
 */
export const getCriticalEvents = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { limit = 10 } = req.query;
    const events = await AuditService.getRecentCriticalEvents(Number(limit));

    res.status(200).json({
      success: true,
      data: events,
    });
  } catch (error: any) {
    logger.error('Error getting critical events:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

/**
 * GET /audit-logs/stats
 * Real-time stat cards for the audit dashboard header.
 * Equivalent to Google Cloud Monitoring / Datadog audit dashboards.
 */
export const getAuditStats = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const stats = await AuditService.getStatsSummary();
    res.status(200).json({ success: true, data: stats });
  } catch (error: any) {
    logger.error('Error getting audit stats:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

/**
 * GET /audit-logs/verify-integrity
 * Walk the log chain and verify every SHA-256 hash.
 * Equivalent to `aws cloudtrail validate-logs`.
 * Only super_admin can run this — the check itself is logged as VERIFY_INTEGRITY.
 */
export const verifyAuditIntegrity = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { startDate, endDate, limit = 5000 } = req.query;

    const report = await AuditService.verifyIntegrity({
      startDate: startDate ? new Date(startDate as string) : undefined,
      endDate:   endDate   ? new Date(endDate   as string) : undefined,
      limit:     Number(limit),
    });

    // Log the fact that an integrity check was performed (audit the auditors)
    await AuditService.log({
      userId:       req.user?.userId,
      username:     req.user?.username ?? 'unknown',
      action:       'VERIFY_INTEGRITY',
      resourceType: 'audit_logs',
      correlationId: (req as any).requestId,
      ipAddress:
        (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
        req.socket?.remoteAddress || 'unknown',
      details: `Integrity check: ${report.totalChecked} entries, score ${report.integrityScore}/100`,
      severity: report.integrityScore < 100 ? 'critical' : 'low',
    });

    res.status(200).json({ success: true, data: report });
  } catch (error: any) {
    logger.error('Error verifying audit integrity:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

/**
 * GET /audit-logs/export
 * Download logs as CSV — fixes the non-functional Export button in the UI.
 * Like AWS CloudTrail S3 export / Azure Log Analytics export.
 */
export const exportAuditLogs = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { action, resourceType, username, severity, outcome, startDate, endDate } = req.query;

    const result = await AuditService.getLogs({
      action:       action       as any,
      resourceType: resourceType as string,
      username:     username     as string,
      severity:     severity     as any,
      outcome:      outcome      as any,
      startDate:    startDate ? new Date(startDate as string) : undefined,
      endDate:      endDate   ? new Date(endDate   as string) : undefined,
      limit:        10000, // max export size
      page:         1,
    });

    // ── Build styled XLSX ──────────────────────────────────────────────────
    const workbook  = new ExcelJS.Workbook();
    workbook.creator = 'Fuel Order System';
    workbook.created = new Date();

    const sheet = workbook.addWorksheet('Audit Logs', {
      views: [{ state: 'frozen', ySplit: 1 }],   // freeze header row
    });

    // Column definitions with widths
    sheet.columns = [
      { header: 'Timestamp',      key: 'timestamp',     width: 22 },
      { header: 'Username',       key: 'username',      width: 20 },
      { header: 'User ID',        key: 'userId',        width: 28 },
      { header: 'Action',         key: 'action',        width: 22 },
      { header: 'Resource Type',  key: 'resourceType',  width: 18 },
      { header: 'Resource ID',    key: 'resourceId',    width: 28 },
      { header: 'Outcome',        key: 'outcome',       width: 12 },
      { header: 'Severity',       key: 'severity',      width: 12 },
      { header: 'Risk Score',     key: 'riskScore',     width: 12 },
      { header: 'IP Address',     key: 'ipAddress',     width: 16 },
      { header: 'Correlation ID', key: 'correlationId', width: 38 },
      { header: 'Details',        key: 'details',       width: 50 },
      { header: 'SHA-256 Hash',   key: 'hash',          width: 70 },
    ];

    // Style the header row
    const headerRow = sheet.getRow(1);
    headerRow.eachCell((cell) => {
      cell.font       = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
      cell.fill       = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A5F' } };
      cell.alignment  = { vertical: 'middle', horizontal: 'center', wrapText: false };
      cell.border     = {
        bottom: { style: 'medium', color: { argb: 'FF2E6DA4' } },
      };
    });
    headerRow.height = 22;

    // Row fill colours keyed by severity / outcome
    const SEVERITY_FILL: Record<string, string> = {
      critical: 'FFFFF0F0',  // light red
      high:     'FFFFF5E6',  // light orange
      medium:   'FFFFFFF0',  // light yellow
      low:      'FFF0FFF0',  // light green
    };
    const OUTCOME_FONT_COLOR: Record<string, string> = {
      FAILURE: 'FFC0392B',
      PARTIAL: 'FFD35400',
      SUCCESS: 'FF1E8449',
    };

    result.logs.forEach((log: any, idx: number) => {
      const row = sheet.addRow({
        timestamp:     new Date(log.timestamp).toISOString(),
        username:      log.username      || '',
        userId:        log.userId        || '',
        action:        log.action        || '',
        resourceType:  log.resourceType  || '',
        resourceId:    log.resourceId    || '',
        outcome:       log.outcome       || 'SUCCESS',
        severity:      log.severity      || '',
        riskScore:     log.riskScore     ?? 0,
        ipAddress:     log.ipAddress     || '',
        correlationId: log.correlationId || '',
        details:       log.details       || '',
        hash:          log.hash          || '',
      });

      // Alternating base fill → overridden by severity
      const baseFill = SEVERITY_FILL[(log.severity || '').toLowerCase()]
                       ?? (idx % 2 === 0 ? 'FFFAFAFA' : 'FFFFFFFF');

      row.eachCell((cell, colNumber) => {
        cell.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: baseFill } };
        cell.alignment = { vertical: 'middle', wrapText: false };
        cell.font      = { size: 10 };
      });

      // Colour-code the Outcome cell (column 7)
      const outcomeCell = row.getCell(7);
      const outcomeColor = OUTCOME_FONT_COLOR[(log.outcome || 'SUCCESS').toUpperCase()] ?? 'FF000000';
      outcomeCell.font = { bold: true, size: 10, color: { argb: outcomeColor } };

      // Highlight critical rows with a left border accent
      if ((log.severity || '').toLowerCase() === 'critical') {
        row.eachCell((cell) => {
          cell.border = { left: { style: 'medium', color: { argb: 'FFCC0000' } } };
        });
      }

      row.commit();
    });

    // Log the export action
    await AuditService.logExport(
      req.user!.userId, req.user!.username,
      'audit_logs', 'XLSX', result.logs.length,
      (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.socket?.remoteAddress,
      (req as any).requestId
    );

    const filename = `audit-logs-${Date.now()}.xlsx`;
    res.setHeader('Content-Type',        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    await workbook.xlsx.write(res);
    res.end();
  } catch (error: any) {
    logger.error('Error exporting audit logs:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

/**
 * Get system statistics
 */
export const getSystemStats = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const [
      userStats,
      doStats,
      lpoStats,
      fuelRecordStats,
      yardStats,
      driverAccountStats,
    ] = await Promise.all([
      // User stats
      User.aggregate([
        {
          $facet: {
            total: [{ $match: { isDeleted: false } }, { $count: 'count' }],
            active: [{ $match: { isDeleted: false, isActive: true } }, { $count: 'count' }],
            byRole: [
              { $match: { isDeleted: false } },
              { $group: { _id: '$role', count: { $sum: 1 } } },
            ],
            deleted: [{ $match: { isDeleted: true } }, { $count: 'count' }],
          },
        },
      ]),
      // Delivery Order stats
      DeliveryOrder.aggregate([
        {
          $facet: {
            total: [{ $match: { isDeleted: false } }, { $count: 'count' }],
            active: [{ $match: { isDeleted: false, isCancelled: false } }, { $count: 'count' }],
            cancelled: [{ $match: { isDeleted: false, isCancelled: true } }, { $count: 'count' }],
            deleted: [{ $match: { isDeleted: true } }, { $count: 'count' }],
            today: [
              {
                $match: {
                  isDeleted: false,
                  createdAt: { $gte: new Date(new Date().setHours(0, 0, 0, 0)) },
                },
              },
              { $count: 'count' },
            ],
          },
        },
      ]),
      // LPO stats — aggregated from LPOSummary.entries
      LPOSummary.aggregate([
        {
          $facet: {
            total:   [{ $match: { isDeleted: false } }, { $unwind: '$entries' }, { $count: 'count' }],
            deleted: [{ $match: { isDeleted: true } },  { $unwind: '$entries' }, { $count: 'count' }],
            today:   [
              { $match: { isDeleted: false, createdAt: { $gte: new Date(new Date().setHours(0, 0, 0, 0)) } } },
              { $unwind: '$entries' },
              { $count: 'count' },
            ],
          },
        },
      ]),
      // Fuel Record stats
      FuelRecord.aggregate([
        {
          $facet: {
            total: [{ $match: { isDeleted: false } }, { $count: 'count' }],
            deleted: [{ $match: { isDeleted: true } }, { $count: 'count' }],
            today: [
              {
                $match: {
                  isDeleted: false,
                  createdAt: { $gte: new Date(new Date().setHours(0, 0, 0, 0)) },
                },
              },
              { $count: 'count' },
            ],
          },
        },
      ]),
      // Yard dispense stats
      YardFuelDispense.aggregate([
        {
          $facet: {
            total: [{ $match: { isDeleted: false } }, { $count: 'count' }],
            byYard: [
              { $match: { isDeleted: false } },
              { $group: { _id: '$yard', count: { $sum: 1 } } },
            ],
            deleted: [{ $match: { isDeleted: true } }, { $count: 'count' }],
          },
        },
      ]),
      // Driver account stats (import on demand to avoid circular dependency)
      (async () => {
        try {
          const { DriverAccountEntry } = await import('../models');
          return DriverAccountEntry.aggregate([
            {
              $facet: {
                total: [{ $match: { isDeleted: false } }, { $count: 'count' }],
                pending: [{ $match: { isDeleted: false, status: 'pending' } }, { $count: 'count' }],
                settled: [{ $match: { isDeleted: false, status: 'settled' } }, { $count: 'count' }],
              },
            },
          ]);
        } catch {
          return [{ total: [{ count: 0 }], pending: [{ count: 0 }], settled: [{ count: 0 }] }];
        }
      })(),
    ]);

    const extractCount = (arr: any[]) => arr[0]?.count || 0;

    res.status(200).json({
      success: true,
      data: {
        users: {
          total: extractCount(userStats[0].total),
          active: extractCount(userStats[0].active),
          deleted: extractCount(userStats[0].deleted),
          byRole: userStats[0].byRole,
        },
        deliveryOrders: {
          total: extractCount(doStats[0].total),
          active: extractCount(doStats[0].active),
          cancelled: extractCount(doStats[0].cancelled),
          deleted: extractCount(doStats[0].deleted),
          today: extractCount(doStats[0].today),
        },
        lpoEntries: {
          total: extractCount(lpoStats[0].total),
          deleted: extractCount(lpoStats[0].deleted),
          today: extractCount(lpoStats[0].today),
        },
        fuelRecords: {
          total: extractCount(fuelRecordStats[0].total),
          deleted: extractCount(fuelRecordStats[0].deleted),
          today: extractCount(fuelRecordStats[0].today),
        },
        yardDispenses: {
          total: extractCount(yardStats[0].total),
          deleted: extractCount(yardStats[0].deleted),
          byYard: yardStats[0].byYard,
        },
        driverAccounts: {
          total: extractCount(driverAccountStats[0].total),
          pending: extractCount(driverAccountStats[0].pending),
          settled: extractCount(driverAccountStats[0].settled),
        },
      },
    });
  } catch (error: any) {
    logger.error('Error getting system stats:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

/**
 * Get active sessions (users currently logged in)
 */
export const getActiveSessions = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    // Get users with refresh tokens and recent login
    const activeSessions = await User.find({
      isDeleted: false,
      isActive: true,
      refreshToken: { $ne: null, $exists: true },
      lastLogin: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }, // Last 24 hours
    })
      .select('username email role lastLogin')
      .lean();

    res.status(200).json({
      success: true,
      data: activeSessions,
    });
  } catch (error: any) {
    logger.error('Error getting active sessions:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

/**
 * Force logout a user (Super Admin only)
 */
export const forceLogout = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { userId } = req.params;

    if (req.user?.role !== 'super_admin') {
      res.status(403).json({
        success: false,
        message: 'Only Super Admin can force logout users',
      });
      return;
    }

    const user = await User.findById(userId);
    if (!user) {
      res.status(404).json({ success: false, message: 'User not found' });
      return;
    }

    // Clear refresh token
    user.refreshToken = undefined;
    await user.save();

    // Immediately kick the user off via WebSocket – no page refresh needed
    emitToUser(user.username, 'session_event', {
      type: 'force_logout',
      message: 'You have been logged out by an administrator.',
    });

    // Log the action
    await AuditService.log({
      userId: req.user.userId,
      username: req.user.username,
      action: 'FORCE_LOGOUT',
      resourceType: 'user_session',
      resourceId: userId,
      details: `Force logged out user ${user.username} (${user.role})`,
      severity: 'high',
      ipAddress: req.ip,
    });

    res.status(200).json({
      success: true,
      message: `User ${user.username} has been logged out`,
    });
  } catch (error: any) {
    logger.error('Error forcing logout:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

/**
 * Enable database profiling (Super Admin only)
 */
export const enableProfiling = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (req.user?.role !== 'super_admin') {
      res.status(403).json({
        success: false,
        message: 'Only Super Admin can enable database profiling',
      });
      return;
    }

    const { level = 1, slowMs = 500 } = req.body;
    const success = await databaseMonitor.enableProfiling(level, slowMs);

    if (success) {
      await AuditService.logConfigChange(
        req.user.userId,
        req.user.username,
        'database_profiling',
        null,
        { level, slowMs },
        req.ip
      );
    }

    res.status(200).json({
      success,
      message: success ? 'Database profiling enabled' : 'Failed to enable profiling',
    });
  } catch (error: any) {
    logger.error('Error enabling profiling:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

/**
 * Get recent system activity feed
 */
export const getActivityFeed = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { limit = 20 } = req.query;

    const result = await AuditService.getLogs({
      limit: Number(limit),
    });

    res.status(200).json({
      success: true,
      data: result.logs,
    });
  } catch (error: any) {
    logger.error('Error getting activity feed:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

/**
 * Test email configuration
 */
export const testEmailConfig = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const isConnected = await emailService.testConnection();
    
    if (isConnected) {
      res.status(200).json({
        success: true,
        message: 'Email service is configured and working',
      });
    } else {
      res.status(400).json({
        success: false,
        message: 'Email service is not configured or connection failed. Check SMTP credentials.',
      });
    }
  } catch (error: any) {
    logger.error('Error testing email config:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

/**
 * Send test email
 */
export const sendTestEmail = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { recipient } = req.body;
    
    const emailRecipient = recipient || 'admin@example.com';
    
    await emailService.sendNotification(
      emailRecipient,
      'Test Email from Fuel Order System',
      '<p>This is a test email to verify email notifications are working correctly.</p><p>If you received this, the email service is configured properly.</p>'
    );

    await AuditService.log({
      userId: req.user?.userId,
      username: req.user?.username || 'system',
      action: 'UPDATE',
      resourceType: 'EmailService',
      resourceId: 'test',
      details: `Test email sent to "${emailRecipient}" by ${req.user?.username}`,
      ipAddress: req.ip,
      severity: 'low',
    });

    res.status(200).json({
      success: true,
      message: 'Test email sent successfully',
    });
  } catch (error: any) {
    logger.error('Error sending test email:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

/**
 * Send daily summary email
 */
export const sendDailySummary = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    await emailService.sendDailySummary();

    await AuditService.log({
      userId: req.user?.userId,
      username: req.user?.username || 'system',
      action: 'UPDATE',
      resourceType: 'EmailService',
      resourceId: 'daily_summary',
      details: `Daily summary email manually triggered by ${req.user?.username}`,
      ipAddress: req.ip,
      severity: 'low',
    });

    res.status(200).json({
      success: true,
      message: 'Daily summary email sent successfully',
    });
  } catch (error: any) {
    logger.error('Error sending daily summary:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

/**
 * Send weekly summary email
 */
export const sendWeeklySummary = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    await emailService.sendWeeklySummary();

    await AuditService.log({
      userId: req.user?.userId,
      username: req.user?.username || 'system',
      action: 'UPDATE',
      resourceType: 'EmailService',
      resourceId: 'weekly_summary',
      details: `Weekly summary email manually triggered by ${req.user?.username}`,
      ipAddress: req.ip,
      severity: 'low',
    });

    res.status(200).json({
      success: true,
      message: 'Weekly summary email sent successfully',
    });
  } catch (error: any) {
    logger.error('Error sending weekly summary:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

/**
 * Get recent activity from audit logs
 */
export const getRecentActivity = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 10, 100);

    const recentLogs = await AuditLog.find({})
      .sort({ timestamp: -1 })
      .limit(limit)
      .select('timestamp username action resourceType resourceId details')
      .lean();

    const formattedActivity = recentLogs.map(log => {
      let description = '';
      let icon = 'activity';
      const details = typeof log.details === 'string' ? {} : log.details || {};
      
      switch (log.action) {
        case 'CREATE':
          if (log.resourceType === 'User') {
            description = `New user registered: ${(details as any).username || 'Unknown'}`;
            icon = 'user';
          } else {
            description = `New ${log.resourceType.toLowerCase()} created`;
            icon = 'plus';
          }
          break;
        case 'UPDATE':
          if (log.resourceType === 'Config') {
            description = `Config updated: ${(details as any).configKey || 'System settings'}`;
            icon = 'edit';
          } else {
            description = `${log.resourceType} updated`;
            icon = 'edit';
          }
          break;
        case 'DELETE':
          description = `${(details as any).count || 1} ${log.resourceType.toLowerCase()} items moved to trash`;
          icon = 'trash';
          break;
        case 'RESTORE':
          description = `${log.resourceType} restored from trash`;
          icon = 'refresh';
          break;
        case 'PERMANENT_DELETE':
          description = `${log.resourceType} permanently deleted`;
          icon = 'trash';
          break;
        case 'LOGIN':
          description = `${log.username} logged in`;
          icon = 'user';
          break;
        case 'LOGOUT':
          description = `${log.username} logged out`;
          icon = 'user';
          break;
        case 'FAILED_LOGIN':
          description = `Failed login attempt for ${log.username}`;
          icon = 'alert';
          break;
        case 'BULK_OPERATION':
          description = `Bulk operation completed: ${(details as any).operation || 'Unknown'}`;
          icon = 'database';
          break;
        case 'EXPORT':
          description = `Data exported: ${log.resourceType}`;
          icon = 'download';
          break;
        default:
          description = `${log.action} on ${log.resourceType}`;
          icon = 'activity';
      }

      const timeDiff = Date.now() - new Date(log.timestamp).getTime();
      let timeAgo = '';
      const minutes = Math.floor(timeDiff / 60000);
      const hours = Math.floor(timeDiff / 3600000);
      const days = Math.floor(timeDiff / 86400000);

      if (minutes < 1) {
        timeAgo = 'Just now';
      } else if (minutes < 60) {
        timeAgo = `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
      } else if (hours < 24) {
        timeAgo = `${hours} hour${hours > 1 ? 's' : ''} ago`;
      } else {
        timeAgo = `${days} day${days > 1 ? 's' : ''} ago`;
      }

      return {
        id: String(log._id),
        description,
        icon,
        timestamp: log.timestamp,
        timeAgo,
        username: log.username,
        action: log.action,
        resourceType: log.resourceType,
      };
    });

    res.status(200).json({
      success: true,
      data: formattedActivity,
    });
  } catch (error: any) {
    logger.error('Error getting recent activity:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

/**
 * Get system settings
 */
export const getSystemSettings = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    let config = await SystemConfig.findOne({
      configType: 'system_settings',
      isDeleted: false,
    });

    if (!config) {
      // Create default system settings
      config = await SystemConfig.create({
        configType: 'system_settings',
        systemSettings: {
          general: {
            systemName: 'Fuel Order Management System',
            timezone: 'Africa/Nairobi',
            dateFormat: 'DD/MM/YYYY',
            language: 'en',
          },
          session: {
            sessionTimeout: 30,
            jwtExpiry: 24,
            refreshTokenExpiry: 7,
            maxLoginAttempts: 5,
            lockoutDuration: 15,
            allowMultipleSessions: true,
          },
          data: {
            archivalEnabled: true,
            archivalMonths: 6,
            auditLogRetention: 12,
            trashRetention: 90,
            autoCleanupEnabled: false,
            backupFrequency: 'daily',
            backupRetention: 30,
          },
          notifications: {
            emailNotifications: true,
            criticalAlerts: true,
            dailySummary: false,
            weeklyReport: true,
            slowQueryThreshold: 500,
            storageWarningThreshold: 80,
          },
          maintenance: {
            enabled: false,
            message: 'System is under maintenance. Please check back later.',
            allowedRoles: ['super_admin'],
          },
        },
        lastUpdatedBy: req.user?.username || 'system',
      });
    }

    res.status(200).json({
      success: true,
      message: 'System settings retrieved successfully',
      data: config.systemSettings,
    });
  } catch (error: any) {
    logger.error('Error getting system settings:', error);
    throw error;
  }
};

/**
 * Update system settings
 */
export const updateSystemSettings = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { section, settings } = req.body;

    if (!section || !settings) {
      throw new ApiError(400, 'Section and settings are required');
    }

    const validSections = ['general', 'session', 'data', 'notifications', 'maintenance'];
    if (!validSections.includes(section)) {
      throw new ApiError(400, 'Invalid section type');
    }

    let config = await SystemConfig.findOne({
      configType: 'system_settings',
      isDeleted: false,
    });

    if (!config) {
      // Create default config first
      config = await SystemConfig.create({
        configType: 'system_settings',
        systemSettings: {},
        lastUpdatedBy: req.user?.username || 'system',
      });
    }

    // Update specific section
    if (!config.systemSettings) {
      config.systemSettings = {};
    }

    config.systemSettings[section as keyof typeof config.systemSettings] = settings;
    config.markModified('systemSettings');
    config.lastUpdatedBy = req.user?.username || 'system';

    await config.save();

    // Log the change
    await AuditService.log({
      userId: req.user?.userId,
      username: req.user?.username || 'system',
      action: 'UPDATE',
      resourceType: 'system_settings',
      resourceId: config.id,
      details: `Updated ${section} settings`,
      severity: 'medium',
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

    logger.info(`System settings updated: ${section} by ${req.user?.username}`);

    res.status(200).json({
      success: true,
      message: `${section} settings updated successfully`,
      data: config.systemSettings,
    });
  } catch (error: any) {
    logger.error('Error updating system settings:', error);
    throw error;
  }
};

/**
 * Toggle maintenance mode
 */
export const toggleMaintenanceMode = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    let config = await SystemConfig.findOne({
      configType: 'system_settings',
      isDeleted: false,
    });

    if (!config || !config.systemSettings) {
      throw new ApiError(404, 'System settings not found');
    }

    const currentState = config.systemSettings.maintenance?.enabled || false;
    const newState = !currentState;

    if (!config.systemSettings.maintenance) {
      config.systemSettings.maintenance = {
        enabled: newState,
        message: 'System is under maintenance. Please check back later.',
        allowedRoles: ['super_admin'],
      };
    } else {
      config.systemSettings.maintenance.enabled = newState;
    }

    config.markModified('systemSettings');
    config.lastUpdatedBy = req.user?.username || 'system';
    await config.save();

    // Invalidate cache + broadcast to all clients in real time
    invalidateMaintenanceCache();
    emitMaintenanceEvent(
      newState,
      config.systemSettings.maintenance.message,
      config.systemSettings.maintenance.allowedRoles
    );

    // Log critical action
    await AuditService.log({
      userId: req.user?.userId,
      username: req.user?.username || 'system',
      action: newState ? 'ENABLE_MAINTENANCE' : 'DISABLE_MAINTENANCE',
      resourceType: 'system_settings',
      resourceId: config.id,
      details: `Maintenance mode ${newState ? 'enabled' : 'disabled'}`,
      severity: 'critical',
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

    logger.warn(`Maintenance mode ${newState ? 'ENABLED' : 'DISABLED'} by ${req.user?.username}`);

    res.status(200).json({
      success: true,
      message: `Maintenance mode ${newState ? 'enabled' : 'disabled'} successfully`,
      data: {
        enabled: newState,
        message: config.systemSettings.maintenance.message,
        allowedRoles: config.systemSettings.maintenance.allowedRoles,
      },
    });
  } catch (error: any) {
    logger.error('Error toggling maintenance mode:', error);
    throw error;
  }
};

/**
 * Check if system is in maintenance mode
 */
export const getMaintenanceStatus = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const config = await SystemConfig.findOne({
      configType: 'system_settings',
      isDeleted: false,
    });

    const maintenanceMode = config?.systemSettings?.maintenance || {
      enabled: false,
      message: 'System is under maintenance. Please check back later.',
      allowedRoles: ['super_admin'],
    };

    res.status(200).json({
      success: true,
      data: maintenanceMode,
    });
  } catch (error: any) {
    logger.error('Error getting maintenance status:', error);
    throw error;
  }
};

/**
 * Get security settings (session policy + password policy)
 * Reads from the unified system_settings document so both SecurityTab
 * and SystemConfigDashboard always see the same values.
 */
export const getSecuritySettings = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const config = await SystemConfig.findOne({ configType: 'system_settings', isDeleted: false });

    const session = config?.systemSettings?.session || {
      sessionTimeout: 30,
      jwtExpiry: 24,
      refreshTokenExpiry: 7,
      maxLoginAttempts: 5,
      lockoutDuration: 15,
      allowMultipleSessions: true,
    };

    const password = config?.securitySettings?.password || {
      minLength: 12,
      requireUppercase: true,
      requireLowercase: true,
      requireNumbers: true,
      requireSpecialChars: true,
      historyCount: 5,
      expirationDays: 0,
      expirationWarningDays: 7,
      expirationGraceDays: 3,
      expirationExemptRoles: [],
    };

    const mfa = config?.securitySettings?.mfa || {
      globalEnabled: false,
      requiredRoles: [],
      allowedMethods: ['totp', 'email'],
    };

    const notifications = config?.systemSettings?.notifications || {
      loginNotifications: true,
      newDeviceAlerts: true,
      deviceTracking: true,
    };

    // Prevent browsers and CDN edge nodes from serving a stale cached response
    // after a PUT update. This endpoint returns user-specific configuration data.
    setCacheBustingHeaders(res);
    res.status(200).json({
      success: true,
      message: 'Security settings retrieved successfully',
      data: { session, password, mfa, notifications },
    });
  } catch (error: any) {
    logger.error('Error getting security settings:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

/**
 * Update security settings (password policy or session settings)
 */
export const updateSecuritySettings = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { type, settings } = req.body;

    if (!type || !settings) {
      throw new ApiError(400, 'Type and settings are required');
    }

    const validTypes = ['password', 'session', 'mfa', 'notifications'];
    if (!validTypes.includes(type)) {
      throw new ApiError(400, 'Invalid security settings type');
    }

    // Verify the document exists first
    const existing = await SystemConfig.findOne({ configType: 'system_settings', isDeleted: false });
    if (!existing) {
      throw new ApiError(404, 'System configuration not found. Open System Configuration to initialize it.');
    }

    // Build a $set patch using dot-notation paths. This bypasses Mongoose change
    // tracking entirely and writes atomically straight to MongoDB, which is the
    // only reliable way to update nested paths on documents that may have been
    // created before securitySettings was added to the schema.
    const setFields: Record<string, any> = { lastUpdatedBy: req.user?.username || 'system' };

    if (type === 'session') {
      const { sessionTimeout, jwtExpiry, refreshTokenExpiry, maxLoginAttempts, lockoutDuration, allowMultipleSessions } = settings;
      if (sessionTimeout !== undefined) setFields['systemSettings.session.sessionTimeout'] = sessionTimeout;
      if (jwtExpiry !== undefined) setFields['systemSettings.session.jwtExpiry'] = jwtExpiry;
      if (refreshTokenExpiry !== undefined) setFields['systemSettings.session.refreshTokenExpiry'] = refreshTokenExpiry;
      if (maxLoginAttempts !== undefined) setFields['systemSettings.session.maxLoginAttempts'] = maxLoginAttempts;
      if (lockoutDuration !== undefined) setFields['systemSettings.session.lockoutDuration'] = lockoutDuration;
      if (allowMultipleSessions !== undefined) setFields['systemSettings.session.allowMultipleSessions'] = allowMultipleSessions;
    } else if (type === 'password') {
      if (settings.minLength !== undefined) setFields['securitySettings.password.minLength'] = settings.minLength;
      if (settings.requireUppercase !== undefined) setFields['securitySettings.password.requireUppercase'] = settings.requireUppercase;
      if (settings.requireLowercase !== undefined) setFields['securitySettings.password.requireLowercase'] = settings.requireLowercase;
      if (settings.requireNumbers !== undefined) setFields['securitySettings.password.requireNumbers'] = settings.requireNumbers;
      if (settings.requireSpecialChars !== undefined) setFields['securitySettings.password.requireSpecialChars'] = settings.requireSpecialChars;
      if (settings.historyCount !== undefined) setFields['securitySettings.password.historyCount'] = settings.historyCount;
      if (settings.expirationDays !== undefined) setFields['securitySettings.password.expirationDays'] = settings.expirationDays;
      if (settings.expirationWarningDays !== undefined) setFields['securitySettings.password.expirationWarningDays'] = settings.expirationWarningDays;
      if (settings.expirationGraceDays !== undefined) setFields['securitySettings.password.expirationGraceDays'] = settings.expirationGraceDays;
      if (Array.isArray(settings.expirationExemptRoles)) setFields['securitySettings.password.expirationExemptRoles'] = settings.expirationExemptRoles;
    } else if (type === 'mfa') {
      if (settings.globalEnabled !== undefined) setFields['securitySettings.mfa.globalEnabled'] = settings.globalEnabled;
      if (Array.isArray(settings.requiredRoles)) setFields['securitySettings.mfa.requiredRoles'] = settings.requiredRoles;
      if (Array.isArray(settings.allowedMethods)) setFields['securitySettings.mfa.allowedMethods'] = settings.allowedMethods;
      if (settings.roleMethodOverrides && typeof settings.roleMethodOverrides === 'object') {
        setFields['securitySettings.mfa.roleMethodOverrides'] = settings.roleMethodOverrides;
      }
    } else if (type === 'notifications') {
      if (settings.loginNotifications !== undefined) setFields['systemSettings.notifications.loginNotifications'] = settings.loginNotifications;
      if (settings.newDeviceAlerts !== undefined) setFields['systemSettings.notifications.newDeviceAlerts'] = settings.newDeviceAlerts;
      if (settings.deviceTracking !== undefined) setFields['systemSettings.notifications.deviceTracking'] = settings.deviceTracking;
    }

    // findOneAndUpdate with $set + { new: true } returns the post-update document,
    // so the response always reflects exactly what is now stored in MongoDB.
    const config = await SystemConfig.findOneAndUpdate(
      { configType: 'system_settings', isDeleted: false },
      { $set: setFields },
      { new: true, runValidators: true }
    );

    if (!config) {
      throw new ApiError(500, 'Failed to update security settings');
    }

    // Broadcast to all open super_admin tabs immediately
    if (type === 'session') {
      emitSecuritySettingsEvent({ session: config.systemSettings?.session as any });
    } else if (type === 'password') {
      emitSecuritySettingsEvent({ password: config.securitySettings?.password as any });
    } else if (type === 'mfa') {
      emitSecuritySettingsEvent({ mfa: config.securitySettings?.mfa as any });
    }

    // Log the change
    await AuditService.log({
      userId: req.user?.userId,
      username: req.user?.username || 'system',
      action: 'UPDATE',
      resourceType: 'security_settings',
      resourceId: config.id,
      details: `Updated ${type} security settings`,
      severity: 'high',
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

    logger.info(`Security settings updated: ${type} by ${req.user?.username}`);

    res.status(200).json({
      success: true,
      message: `${type} security settings updated successfully`,
      data: config.securitySettings,
    });
  } catch (error: any) {
    logger.error('Error updating security settings:', error);
    throw error;
  }
};

// =============================================
// User Authentication Migration (Fix old users)
// =============================================

/**
 * Get migration statistics for old users with stale password change flags
 * Super admin only - shows how many users are affected by the mustChangePassword bug
 */
export const getMigrationStatistics = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const stats = await getMigrationStats();

    res.status(200).json({
      success: true,
      message: 'Migration statistics retrieved successfully',
      data: stats,
    });
  } catch (error: any) {
    logger.error('Error getting migration statistics:', error);
    throw error;
  }
};

/**
 * Get list of affected users with stale password change flags
 * Super admin only - returns detailed info about affected users
 */
export const getAffectedUsers = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const affectedUsers = await findAffectedUsers();

    res.status(200).json({
      success: true,
      message: `Found ${affectedUsers.length} affected users`,
      data: {
        count: affectedUsers.length,
        users: affectedUsers,
      },
    });
  } catch (error: any) {
    logger.error('Error getting affected users:', error);
    throw error;
  }
};

/**
 * Run migration to fix stale password change flags
 * Super admin only - clears flags for users older than 30 days with no passwordResetAt
 */
export const runUserMigration = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { daysOld = 30 } = req.body;

    if (daysOld < 1 || daysOld > 365) {
      throw new ApiError(400, 'daysOld must be between 1 and 365');
    }

    logger.info(`Starting user migration (threshold: ${daysOld} days) initiated by ${req.user?.username}`);

    const result = await clearStaleMustChangePasswordFlags(daysOld);

    // Log to audit trail
    if (result.success && result.affectedUsers > 0) {
      await AuditService.log({
        userId: req.user?.userId?.toString() || 'system',
        username: req.user?.username || 'system',
        action: 'user_migration_executed',
        resourceType: 'User',
        details: `Cleared stale mustChangePassword flags for ${result.affectedUsers} users (threshold: ${daysOld} days)`,
        ipAddress: req.ip,
      });
    }

    res.status(200).json({
      success: result.success,
      message: result.success
        ? `Migration completed: ${result.affectedUsers} users fixed`
        : 'Migration failed',
      data: {
        affectedUsers: result.affectedUsers,
        details: result.details,
        errors: result.errors,
      },
    });
  } catch (error: any) {
    logger.error('Error running user migration:', error);
    throw error;
  }
};

/**
 * Clear mustChangePassword flag for a specific user
 * Super admin only - use with caution
 */
export const clearUserPasswordChangeFlag = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { userId } = req.params;

    if (!userId) {
      throw new ApiError(400, 'User ID is required');
    }

    const result = await clearUserMustChangePassword(userId);

    if (!result.success) {
      throw new ApiError(400, result.message);
    }

    // Log to audit trail
    await AuditService.log({
      userId: req.user?.userId?.toString() || 'system',
      username: req.user?.username || 'system',
      action: 'user_flag_cleared',
      resourceType: 'User',
      resourceId: userId,
      details: `Cleared mustChangePassword flag: ${result.message}`,
      ipAddress: req.ip,
    });

    logger.info(
      `User password change flag cleared by ${req.user?.username} for user ${userId}`
    );

    res.status(200).json({
      success: true,
      message: result.message,
    });
  } catch (error: any) {
    logger.error('Error clearing user password change flag:', error);
    throw error;
  }
};

/**
 * GET /admin/overview-stats
 * Single aggregated endpoint for the SuperAdmin Overview dashboard.
 * Collects platform health, security signals, financial KPIs, pending items,
 * backup status, role distribution, and recent activity in one round-trip.
 * Restricted to super_admin role.
 */
export const getOverviewStats = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const now          = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const sixtyDaysAgo  = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);
    const today         = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    // Lazy-import Backup model (not part of the barrel export)
    let BackupModel: any = null;
    try {
      const m = await import('../models/Backup');
      BackupModel = m.default;
    } catch { /* model unavailable */ }

    const [
      userFacet,
      doFacet,
      lpoFacet,
      fuelFacet,
      yardFacet,
      driverPendingArr,
      auditStatsResult,
      criticalEvents,
      activeSessionCount,
      pendingYardCount,
      currentRevenueArr,
      currentFuelArr,
      prevRevenueArr,
      prevFuelArr,
      lastBackup,
      dbHealthy,
      dbStatusResult,
      maintenanceCfg,
      recentLogs,
    ] = await Promise.all([
      // ── User facet
      User.aggregate([{
        $facet: {
          total:  [{ $match: { isDeleted: false } },                          { $count: 'count' }],
          active: [{ $match: { isDeleted: false, isActive: true  } },         { $count: 'count' }],
          locked: [{ $match: { isDeleted: false, isActive: false } },         { $count: 'count' }],
          byRole: [
            { $match: { isDeleted: false } },
            { $group: { _id: '$role', count: { $sum: 1 } } },
            { $sort:  { count: -1 } },
          ],
        },
      }]),

      // ── Delivery Order facet
      DeliveryOrder.aggregate([{
        $facet: {
          total: [{ $match: { isDeleted: false } },                                         { $count: 'count' }],
          today: [{ $match: { isDeleted: false, createdAt: { $gte: today } } },             { $count: 'count' }],
        },
      }]),

      // ── LPO facet — aggregated from LPOSummary.entries
      LPOSummary.aggregate([{
        $facet: {
          total: [{ $match: { isDeleted: false } },                                         { $unwind: '$entries' }, { $count: 'count' }],
          today: [{ $match: { isDeleted: false, createdAt: { $gte: today } } },             { $unwind: '$entries' }, { $count: 'count' }],
        },
      }]),

      // ── Fuel Record facet
      FuelRecord.aggregate([{
        $facet: {
          total:       [{ $match: { isDeleted: false } },                                                                                      { $count: 'count' }],
          today:       [{ $match: { isDeleted: false, createdAt: { $gte: today } } },                                                          { $count: 'count' }],
          activeTrips: [{ $match: { isDeleted: false, isCancelled: { $ne: true }, journeyStatus: { $in: ['active', 'queued'] } } }, { $count: 'count' }],
        },
      }]),

      // ── Yard Fuel facet
      YardFuelDispense.aggregate([{
        $facet: {
          total: [{ $match: { isDeleted: false } },                                         { $count: 'count' }],
          today: [{ $match: { isDeleted: false, createdAt: { $gte: today } } },             { $count: 'count' }],
        },
      }]),

      // ── Pending driver accounts
      (async () => {
        try {
          const { DriverAccountEntry } = await import('../models');
          return DriverAccountEntry.aggregate([{
            $facet: {
              pending: [{ $match: { isDeleted: false, status: 'pending' } }, { $count: 'count' }],
            },
          }]);
        } catch {
          return [{ pending: [] }];
        }
      })(),

      // ── Audit security signals
      AuditService.getStatsSummary(),

      // ── Last 5 critical/high audit events
      AuditService.getRecentCriticalEvents(5),

      // ── Active sessions (last-login within 24 h with a live refresh token)
      User.countDocuments({
        isDeleted:    false,
        isActive:     true,
        refreshToken: { $ne: null, $exists: true },
        lastLogin:    { $gte: new Date(now.getTime() - 24 * 60 * 60 * 1000) },
      }),

      // ── Pending yard fuel dispenses
      YardFuelDispense.countDocuments({ isDeleted: false, status: 'pending' }),

      // ── Current 30-day LPO revenue
      LPOSummary.aggregate([
        { $match: { isDeleted: false, createdAt: { $gte: thirtyDaysAgo } } },
        { $unwind: '$entries' },
        { $group: { _id: null, total: { $sum: { $multiply: ['$entries.liters', '$entries.rate'] } } } },
      ]),

      // ── Current 30-day fuel liters dispensed
      FuelRecord.aggregate([
        { $match: { isDeleted: false, isCancelled: { $ne: true }, createdAt: { $gte: thirtyDaysAgo } } },
        { $group: { _id: null, total: { $sum: '$totalLts' } } },
      ]),

      // ── Previous 30-day LPO revenue (for period-over-period trend)
      LPOSummary.aggregate([
        { $match: { isDeleted: false, createdAt: { $gte: sixtyDaysAgo, $lt: thirtyDaysAgo } } },
        { $unwind: '$entries' },
        { $group: { _id: null, total: { $sum: { $multiply: ['$entries.liters', '$entries.rate'] } } } },
      ]),

      // ── Previous 30-day fuel liters
      FuelRecord.aggregate([
        { $match: { isDeleted: false, isCancelled: { $ne: true }, createdAt: { $gte: sixtyDaysAgo, $lt: thirtyDaysAgo } } },
        { $group: { _id: null, total: { $sum: '$totalLts' } } },
      ]),

      // ── Last completed backup
      BackupModel
        ? BackupModel.findOne({ status: 'completed' }).sort({ createdAt: -1 }).lean()
        : Promise.resolve(null),

      // ── Database health
      databaseMonitor.healthCheck(),
      databaseMonitor.getStatus(),

      // ── Maintenance mode setting
      SystemConfig.findOne({ configType: 'system_settings', isDeleted: false })
        .select('systemSettings')
        .lean(),

      // ── Recent audit log entries for activity feed
      AuditLog.find({})
        .sort({ timestamp: -1 })
        .limit(8)
        .select('timestamp username action resourceType severity outcome')
        .lean(),
    ]);

    // ── Helper: extract count from a $facet sub-pipeline
    const fc = (facetArr: any[], key: string): number =>
      facetArr?.[0]?.[key]?.[0]?.count ?? 0;

    // ── Financial KPIs
    const currentRevenue = (currentRevenueArr as any[])?.[0]?.total ?? 0;
    const prevRevenue    = (prevRevenueArr    as any[])?.[0]?.total ?? 0;
    const currentFuel    = (currentFuelArr    as any[])?.[0]?.total ?? 0;
    const prevFuel       = (prevFuelArr       as any[])?.[0]?.total ?? 0;
    const pctChange = (curr: number, prev: number): number =>
      prev > 0 ? parseFloat((((curr - prev) / prev) * 100).toFixed(1)) : 0;

    // ── Backup freshness
    const backupAgeHours: number | null = lastBackup
      ? Math.floor((now.getTime() - new Date((lastBackup as any).createdAt).getTime()) / 3_600_000)
      : null;

    // ── Maintenance mode
    const maintenanceModeOn =
      ((maintenanceCfg as any)?.systemSettings?.maintenance?.enabled) === true;

    // ── Composite health score (0–100)
    let healthScore = 0;
    type HealthStatus = 'healthy' | 'degraded' | 'critical';
    const healthComponents: { name: string; status: HealthStatus; detail: string }[] = [];

    // Database (30 pts)
    if (dbHealthy) {
      healthScore += 30;
      healthComponents.push({ name: 'Database', status: 'healthy', detail: (dbStatusResult as any)?.status ?? 'connected' });
    } else {
      healthComponents.push({ name: 'Database', status: 'critical', detail: (dbStatusResult as any)?.status ?? 'unavailable' });
    }

    // Backup (25 pts)
    if (backupAgeHours === null) {
      healthComponents.push({ name: 'Backup', status: 'critical', detail: 'No backup on record' });
    } else if (backupAgeHours <= 24) {
      healthScore += 25;
      healthComponents.push({ name: 'Backup', status: 'healthy', detail: `${backupAgeHours}h ago` });
    } else if (backupAgeHours <= 72) {
      healthScore += 12;
      healthComponents.push({ name: 'Backup', status: 'degraded', detail: `${backupAgeHours}h ago` });
    } else {
      healthComponents.push({ name: 'Backup', status: 'critical', detail: `${Math.floor(backupAgeHours / 24)} days ago` });
    }

    // Security (25 pts)
    const auditS = auditStatsResult as {
      todayFailedLogins: number; todayCritical: number; todayAccessDenied: number;
      highRiskCount: number; last24hFailures: number;
    };
    const secDeduct = Math.min(25, auditS.todayCritical * 6 + auditS.todayFailedLogins * 2);
    healthScore += Math.max(0, 25 - secDeduct);
    if (auditS.todayCritical > 0) {
      healthComponents.push({ name: 'Security', status: 'critical', detail: `${auditS.todayCritical} critical events today` });
    } else if (auditS.todayFailedLogins > 5) {
      healthComponents.push({ name: 'Security', status: 'degraded', detail: `${auditS.todayFailedLogins} failed logins today` });
    } else {
      healthComponents.push({ name: 'Security', status: 'healthy', detail: 'No active threats detected' });
    }

    // Maintenance (20 pts)
    if (!maintenanceModeOn) {
      healthScore += 20;
      healthComponents.push({ name: 'Maintenance', status: 'healthy', detail: 'System operational' });
    } else {
      healthComponents.push({ name: 'Maintenance', status: 'degraded', detail: 'Maintenance mode active' });
    }

    const pendingDriverAccounts = fc(driverPendingArr as any[], 'pending');
    const totalPending          = pendingDriverAccounts + (pendingYardCount as number);

    // ── Format recent activity
    const nowMs = Date.now();
    const formatActivity = (log: any) => {
      const ms   = nowMs - new Date(log.timestamp).getTime();
      const mins = Math.floor(ms / 60_000);
      const hrs  = Math.floor(ms / 3_600_000);
      const days = Math.floor(ms / 86_400_000);
      const timeAgo =
        mins < 1  ? 'Just now' :
        mins < 60 ? `${mins}m ago` :
        hrs  < 24 ? `${hrs}h ago` :
                    `${days}d ago`;

      const actionLabels: Record<string, string> = {
        CREATE:           'Created',
        UPDATE:           'Updated',
        DELETE:           'Deleted',
        RESTORE:          'Restored',
        PERMANENT_DELETE: 'Purged',
        LOGIN:            'Login',
        LOGOUT:           'Logout',
        FAILED_LOGIN:     'Failed Login',
        ACCESS_DENIED:    'Access Denied',
        EXPORT:           'Export',
        BULK_OPERATION:   'Bulk Op',
      };

      return {
        id:           String(log._id),
        action:       log.action as string,
        actionLabel:  actionLabels[log.action] ?? log.action,
        username:     log.username as string,
        resourceType: log.resourceType as string,
        severity:     (log.severity as string) ?? 'low',
        outcome:      (log.outcome  as string) ?? 'SUCCESS',
        timestamp:    log.timestamp as Date,
        timeAgo,
      };
    };

    res.status(200).json({
      success: true,
      data: {
        healthScore:      Math.min(100, healthScore),
        healthComponents,
        maintenanceMode:  maintenanceModeOn,
        system: {
          users: {
            total:  fc(userFacet, 'total'),
            active: fc(userFacet, 'active'),
            locked: fc(userFacet, 'locked'),
            byRole: (userFacet?.[0]?.byRole ?? []) as { _id: string; count: number }[],
          },
          deliveryOrders: { total: fc(doFacet,   'total'), today: fc(doFacet,   'today') },
          lpoEntries:     { total: fc(lpoFacet,  'total'), today: fc(lpoFacet,  'today') },
          fuelRecords:    {
            total:       fc(fuelFacet, 'total'),
            today:       fc(fuelFacet, 'today'),
            activeTrips: fc(fuelFacet, 'activeTrips'),
          },
          yardDispenses:  { total: fc(yardFacet, 'total'), today: fc(yardFacet, 'today') },
        },
        security: {
          failedLoginsToday:   auditS.todayFailedLogins,
          criticalEventsToday: auditS.todayCritical,
          accessDeniedToday:   auditS.todayAccessDenied,
          highRiskEventCount:  auditS.highRiskCount,
          last24hFailures:     auditS.last24hFailures,
          lockedAccounts:      fc(userFacet, 'locked'),
          recentCriticalEvents: (criticalEvents as any[]).map(e => ({
            id:           String(e._id),
            action:       e.action,
            username:     e.username,
            resourceType: e.resourceType,
            severity:     e.severity,
            timestamp:    e.timestamp,
          })),
        },
        sessions:   { activeLast24h: activeSessionCount as number },
        financials: {
          revenue30d:    currentRevenue,
          revenueTrend:  pctChange(currentRevenue, prevRevenue),
          fuelLiters30d: currentFuel,
          fuelTrend:     pctChange(currentFuel, prevFuel),
        },
        pending: {
          total:          totalPending,
          driverAccounts: pendingDriverAccounts,
          yardDispenses:  pendingYardCount as number,
        },
        backup: lastBackup ? {
          status:    (lastBackup as any).status,
          createdAt: (lastBackup as any).createdAt,
          fileSize:  (lastBackup as any).fileSize,
          type:      (lastBackup as any).type,
          ageHours:  backupAgeHours,
        } : null,
        database: {
          healthy: dbHealthy as boolean,
          status:  (dbStatusResult as any)?.status ?? 'unknown',
        },
        recentActivity: (recentLogs as any[]).map(formatActivity),
      },
    });
  } catch (error: any) {
    logger.error('Error getting overview stats:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};
