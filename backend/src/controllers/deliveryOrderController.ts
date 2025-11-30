import { Response } from 'express';
import { DeliveryOrder } from '../models';
import { ApiError } from '../middleware/errorHandler';
import { AuthRequest } from '../middleware/auth';
import { getPaginationParams, createPaginatedResponse, calculateSkip, logger } from '../utils';

/**
 * Get all delivery orders with pagination and filters
 */
export const getAllDeliveryOrders = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { page, limit, sort, order } = getPaginationParams(req.query);
    const { dateFrom, dateTo, clientName, truckNo, importOrExport, destination } = req.query;

    // Build filter
    const filter: any = { isDeleted: false };

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
 * Update delivery order
 */
export const updateDeliveryOrder = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const deliveryOrder = await DeliveryOrder.findOneAndUpdate(
      { _id: id, isDeleted: false },
      req.body,
      { new: true, runValidators: true }
    );

    if (!deliveryOrder) {
      throw new ApiError(404, 'Delivery order not found');
    }

    logger.info(`Delivery order updated: ${deliveryOrder.doNumber} by ${req.user?.username}`);

    res.status(200).json({
      success: true,
      message: 'Delivery order updated successfully',
      data: deliveryOrder,
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
 * Get next DO number
 */
export const getNextDONumber = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const lastDO = await DeliveryOrder.findOne()
      .sort({ sn: -1 })
      .limit(1)
      .lean();

    const nextSN = lastDO ? lastDO.sn + 1 : 1;

    res.status(200).json({
      success: true,
      message: 'Next DO number retrieved successfully',
      data: { nextSN },
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
