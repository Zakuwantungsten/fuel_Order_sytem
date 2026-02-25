import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { FuelStationConfig } from '../models/FuelStationConfig';
import { RouteConfig } from '../models/RouteConfig';
import { SystemConfig } from '../models/SystemConfig';
import { AuditLog } from '../models/AuditLog';

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

// Formula validation helper
function validateFormula(formula: string): { valid: boolean; error?: string } {
  // Allow: numbers, operators (+, -, *, /, parentheses), and variable names
  const validPattern = /^[a-zA-Z0-9\s+\-*/().]+$/;
  
  if (!validPattern.test(formula)) {
    return { valid: false, error: 'Formula contains invalid characters' };
  }
  
  // Check balanced parentheses
  let count = 0;
  for (const char of formula) {
    if (char === '(') count++;
    if (char === ')') count--;
    if (count < 0) return { valid: false, error: 'Unbalanced parentheses' };
  }
  if (count !== 0) return { valid: false, error: 'Unbalanced parentheses' };
  
  return { valid: true };
}

/**
 * Get all fuel station configurations
 * GET /api/system-admin/config/stations
 */
export const getFuelStations = async (req: AuthRequest, res: Response) => {
  try {
    const stations = await FuelStationConfig.find().sort({ stationName: 1 });
    
    res.json({
      success: true,
      data: stations,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch fuel stations',
    });
  }
};

/**
 * Create fuel station configuration
 * POST /api/system-admin/config/stations
 */
export const createFuelStation = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const {
      stationName,
      defaultRate,
      defaultLitersGoing,
      defaultLitersReturning,
      fuelRecordFieldGoing,
      fuelRecordFieldReturning,
      formulaGoing,
      formulaReturning,
    } = req.body;

    // Validate required fields
    if (!stationName || defaultRate == null) {
      res.status(400).json({
        success: false,
        message: 'Station name and rate are required',
      });
      return;
    }

    // At least one default liter value should be provided
    if ((defaultLitersGoing == null || defaultLitersGoing === 0) && 
        (defaultLitersReturning == null || defaultLitersReturning === 0)) {
      res.status(400).json({
        success: false,
        message: 'At least one of defaultLitersGoing or defaultLitersReturning must be greater than 0',
      });
      return;
    }

    // Validate formulas if provided
    if (formulaGoing && formulaGoing.trim() !== '') {
      const validation = validateFormula(formulaGoing);
      if (!validation.valid) {
        res.status(400).json({
          success: false,
          message: `Invalid going formula: ${validation.error}`,
        });
        return;
      }
    }

    if (formulaReturning && formulaReturning.trim() !== '') {
      const validation = validateFormula(formulaReturning);
      if (!validation.valid) {
        res.status(400).json({
          success: false,
          message: `Invalid returning formula: ${validation.error}`,
        });
        return;
      }
    }

    // Check if station already exists
    const existing = await FuelStationConfig.findOne({ stationName });
    if (existing) {
      res.status(400).json({
        success: false,
        message: 'Station with this name already exists',
      });
      return;
    }

    const station = await FuelStationConfig.create({
      stationName,
      defaultRate,
      defaultLitersGoing: defaultLitersGoing != null ? defaultLitersGoing : 0,
      defaultLitersReturning: defaultLitersReturning != null ? defaultLitersReturning : 0,
      fuelRecordFieldGoing: fuelRecordFieldGoing && fuelRecordFieldGoing.trim() !== '' ? fuelRecordFieldGoing : undefined,
      fuelRecordFieldReturning: fuelRecordFieldReturning && fuelRecordFieldReturning.trim() !== '' ? fuelRecordFieldReturning : undefined,
      formulaGoing: formulaGoing && formulaGoing.trim() !== '' ? formulaGoing : undefined,
      formulaReturning: formulaReturning && formulaReturning.trim() !== '' ? formulaReturning : undefined,
      createdBy: req.user?.username || 'system',
    });

    // Audit log
    await AuditLog.create({
      username: req.user?.username || 'system',
      action: 'CREATE',
      resourceType: 'fuel_station_config',
      resourceId: station._id.toString(),
      details: JSON.stringify({ stationName }),
      severity: 'low',
    });

    // Add cache-busting headers to force client refresh
    setCacheBustingHeaders(res);

    res.status(201).json({
      success: true,
      data: station,
      message: 'Fuel station created successfully',
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to create fuel station',
    });
  }
};

/**
 * Update fuel station configuration
 * PUT /api/system-admin/config/stations/:id
 */
export const updateFuelStation = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const updates = req.body;
    const unsetFields: any = {};

    // Separate fields to unset (empty strings or undefined for optional fields)
    if (updates.fuelRecordFieldGoing === '' || updates.fuelRecordFieldGoing === undefined) {
      unsetFields.fuelRecordFieldGoing = '';
      delete updates.fuelRecordFieldGoing;
    }
    if (updates.fuelRecordFieldReturning === '' || updates.fuelRecordFieldReturning === undefined) {
      unsetFields.fuelRecordFieldReturning = '';
      delete updates.fuelRecordFieldReturning;
    }
    if (updates.formulaGoing === '' || updates.formulaGoing === undefined) {
      unsetFields.formulaGoing = '';
      delete updates.formulaGoing;
    }
    if (updates.formulaReturning === '' || updates.formulaReturning === undefined) {
      unsetFields.formulaReturning = '';
      delete updates.formulaReturning;
    }

    // Validate formulas if provided and not empty
    if (updates.formulaGoing && typeof updates.formulaGoing === 'string' && updates.formulaGoing.trim()) {
      const validation = validateFormula(updates.formulaGoing);
      if (!validation.valid) {
        res.status(400).json({
          success: false,
          message: `Invalid going formula: ${validation.error}`,
        });
        return;
      }
    }

    if (updates.formulaReturning && typeof updates.formulaReturning === 'string' && updates.formulaReturning.trim()) {
      const validation = validateFormula(updates.formulaReturning);
      if (!validation.valid) {
        res.status(400).json({
          success: false,
          message: `Invalid returning formula: ${validation.error}`,
        });
        return;
      }
    }

    // Validate required fields
    if (updates.stationName !== undefined && !updates.stationName) {
      res.status(400).json({
        success: false,
        message: 'Station name is required',
      });
      return;
    }

    if (updates.defaultRate !== undefined && (isNaN(updates.defaultRate) || updates.defaultRate < 0)) {
      res.status(400).json({
        success: false,
        message: 'Valid default rate is required',
      });
      return;
    }

    updates.updatedBy = req.user?.username || 'system';

    // Build update operation
    const updateOperation: any = { $set: updates };
    if (Object.keys(unsetFields).length > 0) {
      updateOperation.$unset = unsetFields;
    }

    const station = await FuelStationConfig.findByIdAndUpdate(
      id,
      updateOperation,
      { new: true, runValidators: true }
    );

    if (!station) {
      res.status(404).json({
        success: false,
        message: 'Fuel station not found',
      });
      return;
    }

    // Audit log
    await AuditLog.create({
      username: req.user?.username || 'system',
      action: 'UPDATE',
      resourceType: 'fuel_station_config',
      resourceId: id,
      details: JSON.stringify({ ...updates, unsetFields: Object.keys(unsetFields) }),
      severity: 'low',
    });

    // Add cache-busting headers to force client refresh
    setCacheBustingHeaders(res);

    res.json({
      success: true,
      data: station,
      message: 'Fuel station updated successfully',
    });
  } catch (error: any) {
    console.error('Error updating fuel station:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to update fuel station',
      error: process.env.NODE_ENV === 'development' ? error.stack : undefined,
    });
  }
};

/**
 * Delete fuel station configuration
 * DELETE /api/system-admin/config/stations/:id
 */
export const deleteFuelStation = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const station = await FuelStationConfig.findByIdAndDelete(id);

    if (!station) {
      res.status(404).json({
        success: false,
        message: 'Fuel station not found',
      });
      return;
    }
    // Audit log
    await AuditLog.create({
      username: req.user?.username || 'system',
      action: 'DELETE',
      resourceType: 'fuel_station_config',
      resourceId: id,
      details: JSON.stringify({ stationName: station.stationName }),
      severity: 'medium',
    });

    // Add cache-busting headers to force client refresh
    setCacheBustingHeaders(res);

    res.json({
      success: true,
      message: 'Fuel station deleted successfully',
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to delete fuel station',
    });
  }
};

/**
 * Get all route configurations
 * GET /api/system-admin/config/routes
 * Query params: routeType (optional) - filter by 'IMPORT' or 'EXPORT'
 */
export const getRoutes = async (req: AuthRequest, res: Response) => {
  try {
    const { routeType } = req.query;
    
    // Build filter
    const filter: any = {};
    if (routeType && (routeType === 'IMPORT' || routeType === 'EXPORT')) {
      filter.routeType = routeType;
    }
    
    const routes = await RouteConfig.find(filter).sort({ routeName: 1 });
    
    res.json({
      success: true,
      data: routes,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch routes',
    });
  }
};

/**
 * Find route by destination or alias
 * GET /api/system-admin/config/routes/find/:destination
 */
export const findRouteByDestination = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { destination } = req.params;
    const normalizedDest = destination.trim().toUpperCase();
    
    // Try to find by destination or alias
    const route = await RouteConfig.findOne({
      $or: [
        { destination: normalizedDest },
        { destinationAliases: normalizedDest }
      ],
      isActive: true
    });
    
    if (!route) {
      res.status(404).json({
        success: false,
        message: 'Route not found',
      });
    }
    
    res.json({
      success: true,
      data: route,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to find route',
    });
  }
};

/**
 * Create route configuration
 * POST /api/system-admin/config/routes
 */
export const createRoute = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const {
      routeName,
      origin,
      destination,
      destinationAliases,
      routeType,
      defaultTotalLiters,
      description,
    } = req.body;

    // Validate required fields
    if (!routeName || !destination || defaultTotalLiters == null) {
      res.status(400).json({
        success: false,
        message: 'Route name, destination, and default total liters are required',
      });
      return;
    }

    // Check if route already exists
    const existing = await RouteConfig.findOne({ routeName });
    if (existing) {
      res.status(400).json({
        success: false,
        message: 'Route with this name already exists',
      });
      return;
    }

    const route = await RouteConfig.create({
      routeName,
      origin: origin?.trim().toUpperCase() || undefined,
      destination: destination.trim().toUpperCase(),
      destinationAliases: destinationAliases?.map((alias: string) => alias.trim().toUpperCase()) || [],
      routeType: routeType || 'IMPORT', // Default to IMPORT if not provided
      defaultTotalLiters,
      description,
      createdBy: req.user?.username || 'system',
    });

    // Audit log
    await AuditLog.create({
      username: req.user?.username || 'system',
      action: 'CREATE',
      resourceType: 'route_config',
      resourceId: route._id.toString(),
      details: JSON.stringify({ routeName, destination }),
      severity: 'low',
    });

    // Add cache-busting headers to force client refresh
    setCacheBustingHeaders(res);

    res.status(201).json({
      success: true,
      data: route,
      message: 'Route created successfully',
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to create route',
    });
  }
};

/**
 * Update route configuration
 * PUT /api/system-admin/config/routes/:id
 */
export const updateRoute = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const updates = req.body;

    updates.updatedBy = req.user?.username || 'system';

    const route = await RouteConfig.findByIdAndUpdate(
      id,
      updates,
      { new: true, runValidators: true }
    );

    if (!route) {
      res.status(404).json({
        success: false,
        message: 'Route not found',
      });
      return;
    }

    // Audit log
    await AuditLog.create({
      username: req.user?.username || 'system',
      action: 'UPDATE',
      resourceType: 'route_config',
      resourceId: id,
      details: JSON.stringify(updates),
      severity: 'low',
    });

    // Add cache-busting headers to force client refresh
    setCacheBustingHeaders(res);

    res.json({
      success: true,
      data: route,
      message: 'Route updated successfully',
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to update route',
    });
  }
};

/**
 * Delete route configuration
 * DELETE /api/system-admin/config/routes/:id
 */
export const deleteRoute = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const route = await RouteConfig.findByIdAndDelete(id);

    if (!route) {
      res.status(404).json({
        success: false,
        message: 'Route not found',
      });
      return;
    }

    // Audit log
    await AuditLog.create({
      username: req.user?.username || 'system',
      action: 'DELETE',
      resourceType: 'route_config',
      resourceId: id,
      details: JSON.stringify({ routeName: route.routeName }),
      severity: 'medium',
    });

    // Add cache-busting headers to force client refresh
    setCacheBustingHeaders(res);

    res.json({
      success: true,
      message: 'Route deleted successfully',
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to delete route',
    });
  }
};

/**
 * Get available formula variables and fuel record fields
 * GET /api/system-admin/config/formula-variables
 */
export const getFormulaVariables = async (req: AuthRequest, res: Response) => {
  try {
    const variables = [
      { name: 'totalLiters', description: 'Total liters dispensed', type: 'number' },
      { name: 'extraLiters', description: 'Extra liters', type: 'number' },
      { name: 'pricePerLiter', description: 'Price per liter', type: 'number' },
      { name: 'totalAmount', description: 'Total amount paid', type: 'number' },
      { name: 'odometerReading', description: 'Odometer reading', type: 'number' },
      { name: 'previousOdometer', description: 'Previous odometer reading', type: 'number' },
      { name: 'distance', description: 'Distance traveled (calculated)', type: 'number' },
    ];

    const fuelRecordFieldsGoing = [
      { value: 'darGoing', label: 'Dar es Salaam Going' },
      { value: 'moroGoing', label: 'Morogoro Going' },
      { value: 'mbeyaGoing', label: 'Mbeya Going' },
      { value: 'tdmGoing', label: 'Tunduma Going' },
      { value: 'zambiaGoing', label: 'Zambia Going' },
      { value: 'congoFuel', label: 'Congo' },
    ];

    const fuelRecordFieldsReturning = [
      { value: 'zambiaReturn', label: 'Zambia Returning' },
      { value: 'tundumaReturn', label: 'Tunduma Returning' },
      { value: 'mbeyaReturn', label: 'Mbeya Returning' },
      { value: 'moroReturn', label: 'Morogoro Returning' },
      { value: 'darReturn', label: 'Dar es Salaam Returning' },
      { value: 'tangaReturn', label: 'Tanga Returning' },
      { value: 'congoFuel', label: 'Congo' },
    ];

    res.json({
      success: true,
      data: variables,
      fuelRecordFieldsGoing,
      fuelRecordFieldsReturning,
      examples: [
        { formula: 'totalLiters + extraLiters - 900', description: 'Zambia going allocation' },
        { formula: 'totalLiters * 0.95', description: '95% of total liters' },
        { formula: '(totalLiters + extraLiters) / 2', description: 'Average of total and extra' },
        { formula: 'distance / totalLiters * 100', description: 'Fuel efficiency (km per 100L)' },
      ],
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch formula variables',
    });
  }
};

/**
 * Get truck batches configuration (read-only)
 * GET /api/config/truck-batches
 * Public endpoint for all authenticated users
 */
export const getTruckBatches = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    let config = await SystemConfig.findOne({
      configType: 'truck_batches',
      isDeleted: false,
    });

    if (!config) {
      // Return empty batches if not configured yet
      res.status(200).json({
        success: true,
        message: 'Truck batches retrieved successfully',
        data: {},
      });
      return;
    }

    res.status(200).json({
      success: true,
      message: 'Truck batches retrieved successfully',
      data: config.truckBatches || {},
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch truck batches',
    });
  }
};
