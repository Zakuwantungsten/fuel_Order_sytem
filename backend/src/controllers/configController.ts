import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { FuelStationConfig } from '../models/FuelStationConfig';
import { RouteConfig } from '../models/RouteConfig';
import { AuditLog } from '../models/AuditLog';

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
export const createFuelStation = async (req: AuthRequest, res: Response) => {
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
    if (!stationName || defaultRate == null || defaultLitersGoing == null || defaultLitersReturning == null) {
      return res.status(400).json({
        success: false,
        message: 'Station name, rate, and default liters are required',
      });
    }

    // Validate formulas if provided
    if (formulaGoing) {
      const validation = validateFormula(formulaGoing);
      if (!validation.valid) {
        return res.status(400).json({
          success: false,
          message: `Invalid going formula: ${validation.error}`,
        });
      }
    }

    if (formulaReturning) {
      const validation = validateFormula(formulaReturning);
      if (!validation.valid) {
        return res.status(400).json({
          success: false,
          message: `Invalid returning formula: ${validation.error}`,
        });
      }
    }

    // Check if station already exists
    const existing = await FuelStationConfig.findOne({ stationName });
    if (existing) {
      return res.status(400).json({
        success: false,
        message: 'Station with this name already exists',
      });
    }

    const station = await FuelStationConfig.create({
      stationName,
      defaultRate,
      defaultLitersGoing,
      defaultLitersReturning,
      fuelRecordFieldGoing,
      fuelRecordFieldReturning,
      formulaGoing,
      formulaReturning,
      createdBy: req.user?.username || 'system',
    });

    // Audit log
    await AuditLog.create({
      user: req.user?.username || 'system',
      action: 'station_created',
      resource: 'fuel_station_config',
      resourceId: station._id.toString(),
      details: { stationName },
    });

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
export const updateFuelStation = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    // Validate formulas if provided
    if (updates.formulaGoing) {
      const validation = validateFormula(updates.formulaGoing);
      if (!validation.valid) {
        return res.status(400).json({
          success: false,
          message: `Invalid going formula: ${validation.error}`,
        });
      }
    }

    if (updates.formulaReturning) {
      const validation = validateFormula(updates.formulaReturning);
      if (!validation.valid) {
        return res.status(400).json({
          success: false,
          message: `Invalid returning formula: ${validation.error}`,
        });
      }
    }

    updates.updatedBy = req.user?.username || 'system';

    const station = await FuelStationConfig.findByIdAndUpdate(
      id,
      updates,
      { new: true, runValidators: true }
    );

    if (!station) {
      return res.status(404).json({
        success: false,
        message: 'Fuel station not found',
      });
    }

    // Audit log
    await AuditLog.create({
      user: req.user?.username || 'system',
      action: 'station_updated',
      resource: 'fuel_station_config',
      resourceId: id,
      details: updates,
    });

    res.json({
      success: true,
      data: station,
      message: 'Fuel station updated successfully',
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to update fuel station',
    });
  }
};

/**
 * Delete fuel station configuration
 * DELETE /api/system-admin/config/stations/:id
 */
export const deleteFuelStation = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    const station = await FuelStationConfig.findByIdAndDelete(id);

    if (!station) {
      return res.status(404).json({
        success: false,
        message: 'Fuel station not found',
      });
    }

    // Audit log
    await AuditLog.create({
      user: req.user?.username || 'system',
      action: 'station_deleted',
      resource: 'fuel_station_config',
      resourceId: id,
      details: { stationName: station.stationName },
    });

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
 */
export const getRoutes = async (req: AuthRequest, res: Response) => {
  try {
    const routes = await RouteConfig.find().sort({ routeName: 1 });
    
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
export const findRouteByDestination = async (req: AuthRequest, res: Response) => {
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
      return res.status(404).json({
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
export const createRoute = async (req: AuthRequest, res: Response) => {
  try {
    const {
      routeName,
      origin,
      destination,
      destinationAliases,
      defaultTotalLiters,
      description,
    } = req.body;

    // Validate required fields
    if (!routeName || !destination || defaultTotalLiters == null) {
      return res.status(400).json({
        success: false,
        message: 'Route name, destination, and default total liters are required',
      });
    }

    // Check if route already exists
    const existing = await RouteConfig.findOne({ routeName });
    if (existing) {
      return res.status(400).json({
        success: false,
        message: 'Route with this name already exists',
      });
    }

    const route = await RouteConfig.create({
      routeName,
      origin: origin?.trim().toUpperCase() || undefined,
      destination: destination.trim().toUpperCase(),
      destinationAliases: destinationAliases?.map((alias: string) => alias.trim().toUpperCase()) || [],
      defaultTotalLiters,
      description,
      createdBy: req.user?.username || 'system',
    });

    // Audit log
    await AuditLog.create({
      user: req.user?.username || 'system',
      action: 'route_created',
      resource: 'route_config',
      resourceId: route._id.toString(),
      details: { routeName, destination },
    });

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
export const updateRoute = async (req: AuthRequest, res: Response) => {
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
      return res.status(404).json({
        success: false,
        message: 'Route not found',
      });
    }

    // Audit log
    await AuditLog.create({
      user: req.user?.username || 'system',
      action: 'route_updated',
      resource: 'route_config',
      resourceId: id,
      details: updates,
    });

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
export const deleteRoute = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    const route = await RouteConfig.findByIdAndDelete(id);

    if (!route) {
      return res.status(404).json({
        success: false,
        message: 'Route not found',
      });
    }

    // Audit log
    await AuditLog.create({
      user: req.user?.username || 'system',
      action: 'route_deleted',
      resource: 'route_config',
      resourceId: id,
      details: { routeName: route.routeName },
    });

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
