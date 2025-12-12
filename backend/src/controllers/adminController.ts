import { Response } from 'express';
import { SystemConfig, User, DeliveryOrder, LPOEntry, FuelRecord, YardFuelDispense, AuditLog } from '../models';
import { ApiError } from '../middleware/errorHandler';
import { AuthRequest } from '../middleware/auth';
import { logger } from '../utils';
import { databaseMonitor } from '../utils/databaseMonitor';
import { AuditService } from '../utils/auditService';
import emailService from '../services/emailService';

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

const DEFAULT_TRUCK_BATCHES = {
  batch_100: [
    { truckSuffix: 'dnh', extraLiters: 100, addedBy: 'system', addedAt: new Date() },
    { truckSuffix: 'dny', extraLiters: 100, addedBy: 'system', addedAt: new Date() },
    { truckSuffix: 'dpn', extraLiters: 100, addedBy: 'system', addedAt: new Date() },
    { truckSuffix: 'dre', extraLiters: 100, addedBy: 'system', addedAt: new Date() },
    { truckSuffix: 'drf', extraLiters: 100, addedBy: 'system', addedAt: new Date() },
    { truckSuffix: 'dnw', extraLiters: 100, addedBy: 'system', addedAt: new Date() },
    { truckSuffix: 'dxy', extraLiters: 100, addedBy: 'system', addedAt: new Date() },
    { truckSuffix: 'eaf', extraLiters: 100, addedBy: 'system', addedAt: new Date() },
    { truckSuffix: 'dtb', extraLiters: 100, addedBy: 'system', addedAt: new Date() },
  ],
  batch_80: [
    { truckSuffix: 'dvk', extraLiters: 80, addedBy: 'system', addedAt: new Date() },
    { truckSuffix: 'dvl', extraLiters: 80, addedBy: 'system', addedAt: new Date() },
    { truckSuffix: 'dwk', extraLiters: 80, addedBy: 'system', addedAt: new Date() },
  ],
  batch_60: [
    { truckSuffix: 'dyy', extraLiters: 60, addedBy: 'system', addedAt: new Date() },
    { truckSuffix: 'dzy', extraLiters: 60, addedBy: 'system', addedAt: new Date() },
    { truckSuffix: 'eag', extraLiters: 60, addedBy: 'system', addedAt: new Date() },
    { truckSuffix: 'ecq', extraLiters: 60, addedBy: 'system', addedAt: new Date() },
    { truckSuffix: 'edd', extraLiters: 60, addedBy: 'system', addedAt: new Date() },
    { truckSuffix: 'egj', extraLiters: 60, addedBy: 'system', addedAt: new Date() },
    { truckSuffix: 'ehj', extraLiters: 60, addedBy: 'system', addedAt: new Date() },
    { truckSuffix: 'ehe', extraLiters: 60, addedBy: 'system', addedAt: new Date() },
    { truckSuffix: 'ely', extraLiters: 60, addedBy: 'system', addedAt: new Date() },
    { truckSuffix: 'elv', extraLiters: 60, addedBy: 'system', addedAt: new Date() },
    { truckSuffix: 'eeq', extraLiters: 60, addedBy: 'system', addedAt: new Date() },
    { truckSuffix: 'eng', extraLiters: 60, addedBy: 'system', addedAt: new Date() },
    { truckSuffix: 'efp', extraLiters: 60, addedBy: 'system', addedAt: new Date() },
    { truckSuffix: 'efn', extraLiters: 60, addedBy: 'system', addedAt: new Date() },
    { truckSuffix: 'ekt', extraLiters: 60, addedBy: 'system', addedAt: new Date() },
    { truckSuffix: 'eks', extraLiters: 60, addedBy: 'system', addedAt: new Date() },
  ],
};

const DEFAULT_STANDARD_ALLOCATIONS = {
  tangaYardToDar: 100,
  darYardStandard: 550,
  darYardKisarawe: 580,
  mbeyaGoing: 450,
  tundumaReturn: 100,
  mbeyaReturn: 400,
  moroReturnToMombasa: 100,
  tangaReturnToMombasa: 70,
};

/**
 * Get admin dashboard statistics
 */
export const getAdminStats = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const [
      totalUsers,
      activeUsers,
      totalDOs,
      totalLPOs,
      totalFuelRecords,
      totalYardDispenses,
      recentUsers,
    ] = await Promise.all([
      User.countDocuments({ isDeleted: false }),
      User.countDocuments({ isDeleted: false, isActive: true }),
      DeliveryOrder.countDocuments({ isDeleted: false }),
      LPOEntry.countDocuments({ isDeleted: false }),
      FuelRecord.countDocuments({ isDeleted: false }),
      YardFuelDispense.countDocuments({ isDeleted: false }),
      User.find({ isDeleted: false })
        .sort({ createdAt: -1 })
        .limit(5)
        .select('-password -refreshToken')
        .lean(),
    ]);

    // Get user role distribution
    const roleDistribution = await User.aggregate([
      { $match: { isDeleted: false } },
      { $group: { _id: '$role', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]);

    res.status(200).json({
      success: true,
      message: 'Admin statistics retrieved successfully',
      data: {
        users: {
          total: totalUsers,
          active: activeUsers,
          inactive: totalUsers - activeUsers,
        },
        records: {
          deliveryOrders: totalDOs,
          lpos: totalLPOs,
          fuelRecords: totalFuelRecords,
          yardDispenses: totalYardDispenses,
        },
        roleDistribution: roleDistribution.map(r => ({
          role: r._id,
          count: r.count,
        })),
        recentUsers,
      },
    });
  } catch (error: any) {
    throw error;
  }
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

    res.status(200).json({
      success: true,
      message: 'Fuel station updated successfully',
      data: config.fuelStations?.[stationIndex],
    });
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

    res.status(201).json({
      success: true,
      message: 'Fuel station added successfully',
      data: newStation,
    });
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

    res.status(200).json({
      success: true,
      message: `${updatedCount} fuel stations updated successfully`,
      data: config.fuelStations,
    });
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

    res.status(200).json({
      success: true,
      message: 'Route updated successfully',
      data: config.routes?.[routeIndex],
    });
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

    res.status(201).json({
      success: true,
      message: 'Route added successfully',
      data: newRoute,
    });
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

    res.status(200).json({
      success: true,
      message: 'Route deleted successfully',
    });
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
        truckBatches: DEFAULT_TRUCK_BATCHES,
        lastUpdatedBy: 'system',
      });
    }

    res.status(200).json({
      success: true,
      message: 'Truck batches retrieved successfully',
      data: config.truckBatches,
    });
  } catch (error: any) {
    throw error;
  }
};

/**
 * Add truck to a batch
 */
export const addTruckToBatch = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { truckSuffix, extraLiters, truckNumber } = req.body;

    if (!truckSuffix || !extraLiters) {
      throw new ApiError(400, 'Missing required fields: truckSuffix, extraLiters');
    }

    if (![60, 80, 100].includes(extraLiters)) {
      throw new ApiError(400, 'extraLiters must be 60, 80, or 100');
    }

    let config = await SystemConfig.findOne({
      configType: 'truck_batches',
      isDeleted: false,
    });

    if (!config) {
      config = await SystemConfig.create({
        configType: 'truck_batches',
        truckBatches: { batch_100: [], batch_80: [], batch_60: [] },
        lastUpdatedBy: req.user?.username || 'system',
      });
    }

    const suffix = truckSuffix.toLowerCase();

    // Remove from all batches first (in case of moving)
    if (config.truckBatches) {
      config.truckBatches.batch_100 = config.truckBatches.batch_100.filter(t => t.truckSuffix !== suffix);
      config.truckBatches.batch_80 = config.truckBatches.batch_80.filter(t => t.truckSuffix !== suffix);
      config.truckBatches.batch_60 = config.truckBatches.batch_60.filter(t => t.truckSuffix !== suffix);

      // Add to appropriate batch
      const newTruck = {
        truckSuffix: suffix,
        extraLiters,
        truckNumber,
        addedBy: req.user?.username || 'system',
        addedAt: new Date(),
      };

      if (extraLiters === 100) {
        config.truckBatches.batch_100.push(newTruck);
      } else if (extraLiters === 80) {
        config.truckBatches.batch_80.push(newTruck);
      } else {
        config.truckBatches.batch_60.push(newTruck);
      }
    }

    config.lastUpdatedBy = req.user?.username || 'system';
    await config.save();

    logger.info(`Truck ${truckSuffix} added to batch ${extraLiters} by ${req.user?.username}`);

    res.status(201).json({
      success: true,
      message: `Truck added to ${extraLiters}L batch successfully`,
      data: config.truckBatches,
    });
  } catch (error: any) {
    throw error;
  }
};

/**
 * Remove truck from batches
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

    // Remove from all batches
    const originalLen100 = config.truckBatches.batch_100.length;
    const originalLen80 = config.truckBatches.batch_80.length;
    const originalLen60 = config.truckBatches.batch_60.length;

    config.truckBatches.batch_100 = config.truckBatches.batch_100.filter(t => t.truckSuffix !== suffix);
    config.truckBatches.batch_80 = config.truckBatches.batch_80.filter(t => t.truckSuffix !== suffix);
    config.truckBatches.batch_60 = config.truckBatches.batch_60.filter(t => t.truckSuffix !== suffix);

    found = (
      config.truckBatches.batch_100.length < originalLen100 ||
      config.truckBatches.batch_80.length < originalLen80 ||
      config.truckBatches.batch_60.length < originalLen60
    );

    if (!found) {
      throw new ApiError(404, 'Truck not found in any batch');
    }

    config.lastUpdatedBy = req.user?.username || 'system';
    await config.save();

    logger.info(`Truck ${truckSuffix} removed from batches by ${req.user?.username}`);

    res.status(200).json({
      success: true,
      message: 'Truck removed from batch successfully',
      data: config.truckBatches,
    });
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

    // Find which batch the truck belongs to
    let truck = config.truckBatches.batch_100.find(t => t.truckSuffix === suffix);
    if (truck) {
      if (!truck.destinationRules) truck.destinationRules = [];
      truck.destinationRules.push({ destination, extraLiters });
    } else {
      truck = config.truckBatches.batch_80.find(t => t.truckSuffix === suffix);
      if (truck) {
        if (!truck.destinationRules) truck.destinationRules = [];
        truck.destinationRules.push({ destination, extraLiters });
      } else {
        truck = config.truckBatches.batch_60.find(t => t.truckSuffix === suffix);
        if (truck) {
          if (!truck.destinationRules) truck.destinationRules = [];
          truck.destinationRules.push({ destination, extraLiters });
        } else {
          throw new ApiError(404, 'Truck not found in any batch');
        }
      }
    }

    config.lastUpdatedBy = req.user?.username || 'system';
    await config.save();

    logger.info(`Destination rule added for truck ${truckSuffix}: ${destination} -> ${extraLiters}L by ${req.user?.username}`);

    res.status(200).json({
      success: true,
      message: 'Destination rule added successfully',
      data: truck,
    });
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

    // Search all batches
    const batches = [config.truckBatches.batch_100, config.truckBatches.batch_80, config.truckBatches.batch_60];
    
    for (const batch of batches) {
      const truck = batch.find(t => t.truckSuffix === suffix);
      if (truck && truck.destinationRules) {
        const ruleIndex = truck.destinationRules.findIndex(r => r.destination === oldDestination);
        if (ruleIndex !== -1) {
          truck.destinationRules[ruleIndex] = { destination: newDestination || oldDestination, extraLiters };
          found = true;
          break;
        }
      }
    }

    if (!found) {
      throw new ApiError(404, 'Destination rule not found');
    }

    config.lastUpdatedBy = req.user?.username || 'system';
    await config.save();

    logger.info(`Destination rule updated for truck ${truckSuffix}: ${oldDestination} -> ${extraLiters}L by ${req.user?.username}`);

    res.status(200).json({
      success: true,
      message: 'Destination rule updated successfully',
      data: config.truckBatches,
    });
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

    // Search all batches
    const batches = [config.truckBatches.batch_100, config.truckBatches.batch_80, config.truckBatches.batch_60];
    
    for (const batch of batches) {
      const truck = batch.find(t => t.truckSuffix === suffix);
      if (truck && truck.destinationRules) {
        const originalLength = truck.destinationRules.length;
        truck.destinationRules = truck.destinationRules.filter(r => r.destination !== destination);
        if (truck.destinationRules.length < originalLength) {
          found = true;
          break;
        }
      }
    }

    if (!found) {
      throw new ApiError(404, 'Destination rule not found');
    }

    config.lastUpdatedBy = req.user?.username || 'system';
    await config.save();

    logger.info(`Destination rule deleted for truck ${truckSuffix}: ${destination} by ${req.user?.username}`);

    res.status(200).json({
      success: true,
      message: 'Destination rule deleted successfully',
      data: config.truckBatches,
    });
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
        truckBatches: truckBatchesConfig?.truckBatches || DEFAULT_TRUCK_BATCHES,
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
    res.status(500).json({ success: false, message: error.message });
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
    res.status(500).json({ success: false, message: error.message });
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
    res.status(500).json({ success: false, message: error.message });
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
    res.status(500).json({ success: false, message: error.message });
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
    res.status(500).json({ success: false, message: error.message });
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
      // LPO stats
      LPOEntry.aggregate([
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
    res.status(500).json({ success: false, message: error.message });
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
    res.status(500).json({ success: false, message: error.message });
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

    // Log the action
    await AuditService.log({
      userId: req.user.userId,
      username: req.user.username,
      action: 'LOGOUT',
      resourceType: 'user_session',
      resourceId: userId,
      details: `Force logged out user ${user.username}`,
      severity: 'medium',
      ipAddress: req.ip,
    });

    res.status(200).json({
      success: true,
      message: `User ${user.username} has been logged out`,
    });
  } catch (error: any) {
    logger.error('Error forcing logout:', error);
    res.status(500).json({ success: false, message: error.message });
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
    res.status(500).json({ success: false, message: error.message });
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
    res.status(500).json({ success: false, message: error.message });
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
    res.status(500).json({ success: false, message: error.message });
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

    res.status(200).json({
      success: true,
      message: 'Test email sent successfully',
    });
  } catch (error: any) {
    logger.error('Error sending test email:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Send daily summary email
 */
export const sendDailySummary = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    await emailService.sendDailySummary();

    res.status(200).json({
      success: true,
      message: 'Daily summary email sent successfully',
    });
  } catch (error: any) {
    logger.error('Error sending daily summary:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Send weekly summary email
 */
export const sendWeeklySummary = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    await emailService.sendWeeklySummary();

    res.status(200).json({
      success: true,
      message: 'Weekly summary email sent successfully',
    });
  } catch (error: any) {
    logger.error('Error sending weekly summary:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Get recent activity from audit logs
 */
export const getRecentActivity = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const limit = parseInt(req.query.limit as string) || 10;

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
        id: log._id,
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
    res.status(500).json({ success: false, message: error.message });
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

    config.lastUpdatedBy = req.user?.username || 'system';
    await config.save();

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
 * Update security settings (password policy or session settings)
 */
export const updateSecuritySettings = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { type, settings } = req.body;

    if (!type || !settings) {
      throw new ApiError(400, 'Type and settings are required');
    }

    const validTypes = ['password', 'session'];
    if (!validTypes.includes(type)) {
      throw new ApiError(400, 'Invalid security settings type');
    }

    let config = await SystemConfig.findOne({
      configType: 'security_settings',
      isDeleted: false,
    });

    if (!config) {
      // Create default security config
      config = await SystemConfig.create({
        configType: 'security_settings',
        securitySettings: {},
        lastUpdatedBy: req.user?.username || 'system',
      });
    }

    // Update specific security setting type
    if (!config.securitySettings) {
      config.securitySettings = {};
    }

    config.securitySettings[type as keyof typeof config.securitySettings] = settings;
    config.lastUpdatedBy = req.user?.username || 'system';

    await config.save();

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
