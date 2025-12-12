import { body, param, query, ValidationChain } from 'express-validator';

/**
 * Validation rules for User operations
 */
export const userValidation = {
  register: [
    body('username')
      .trim()
      .isLength({ min: 3, max: 30 })
      .withMessage('Username must be between 3 and 30 characters')
      .matches(/^[a-zA-Z0-9_]+$/)
      .withMessage('Username can only contain letters, numbers, and underscores'),
    body('email').isEmail().withMessage('Must be a valid email address').normalizeEmail(),
    body('password')
      .isLength({ min: 6 })
      .withMessage('Password must be at least 6 characters long'),
    body('firstName').trim().notEmpty().withMessage('First name is required'),
    body('lastName').trim().notEmpty().withMessage('Last name is required'),
    body('role')
      .optional()
      .isIn([
        'super_admin',
        'admin',
        'manager',
        'supervisor',
        'clerk',
        'driver',
        'viewer',
        'fuel_order_maker',
        'boss',
        'yard_personnel',
        'fuel_attendant',
        'station_manager',
        'payment_manager',
        'dar_yard',
        'tanga_yard',
        'mmsa_yard',
      ])
      .withMessage('Invalid role'),
  ],

  login: [
    body('username').trim().notEmpty().withMessage('Username is required'),
    body('password').notEmpty().withMessage('Password is required'),
  ],

  update: [
    body('email').optional().isEmail().withMessage('Must be a valid email address').normalizeEmail(),
    body('firstName').optional().trim().notEmpty().withMessage('First name cannot be empty'),
    body('lastName').optional().trim().notEmpty().withMessage('Last name cannot be empty'),
  ],

  forgotPassword: [
    body('email')
      .isEmail()
      .withMessage('Must be a valid email address')
      .normalizeEmail()
      .notEmpty()
      .withMessage('Email is required'),
  ],

  resetPassword: [
    body('email')
      .isEmail()
      .withMessage('Must be a valid email address')
      .normalizeEmail()
      .notEmpty()
      .withMessage('Email is required'),
    body('token')
      .trim()
      .notEmpty()
      .withMessage('Reset token is required')
      .isLength({ min: 64, max: 64 })
      .withMessage('Invalid reset token format'),
    body('newPassword')
      .isLength({ min: 6 })
      .withMessage('Password must be at least 6 characters long')
      .notEmpty()
      .withMessage('New password is required'),
  ],
};

/**
 * Validation rules for Delivery Order operations
 */
export const deliveryOrderValidation = {
  create: [
    body('sn').optional().isInt({ min: 1 }).withMessage('Serial number must be a positive integer'),
    body('date').notEmpty().withMessage('Date is required'),
    body('importOrExport')
      .isIn(['IMPORT', 'EXPORT'])
      .withMessage('Must be either IMPORT or EXPORT'),
    body('doType').isIn(['DO', 'SDO']).withMessage('Must be either DO or SDO'),
    body('doNumber').trim().notEmpty().withMessage('DO number is required'),
    body('clientName').trim().notEmpty().withMessage('Client name is required'),
    body('truckNo').trim().notEmpty().withMessage('Truck number is required'),
    body('trailerNo').trim().notEmpty().withMessage('Trailer number is required'),
    body('containerNo').trim().notEmpty().withMessage('Container number is required'),
    body('loadingPoint').trim().notEmpty().withMessage('Loading point is required'),
    body('destination').trim().notEmpty().withMessage('Destination is required'),
    body('haulier').optional().trim(),
    body('tonnages')
      .isFloat({ min: 0 })
      .withMessage('Tonnage must be a non-negative number'),
    body('ratePerTon')
      .isFloat({ min: 0 })
      .withMessage('Rate per ton must be a non-negative number'),
  ],

  update: [
    body('importOrExport')
      .optional()
      .isIn(['IMPORT', 'EXPORT'])
      .withMessage('Must be either IMPORT or EXPORT'),
    body('doType').optional().isIn(['DO', 'SDO']).withMessage('Must be either DO or SDO'),
    body('tonnages')
      .optional()
      .isFloat({ min: 0 })
      .withMessage('Tonnage must be a non-negative number'),
    body('ratePerTon')
      .optional()
      .isFloat({ min: 0 })
      .withMessage('Rate per ton must be a non-negative number'),
  ],
};

/**
 * Validation rules for LPO Entry operations
 */
export const lpoEntryValidation = {
  create: [
    body('sn').isInt({ min: 1 }).withMessage('Serial number must be a positive integer'),
    body('date').notEmpty().withMessage('Date is required'),
    body('lpoNo').trim().notEmpty().withMessage('LPO number is required'),
    body('dieselAt').trim().notEmpty().withMessage('Diesel station is required'),
    body('doSdo').trim().notEmpty().withMessage('DO/SDO number is required'),
    body('truckNo').trim().notEmpty().withMessage('Truck number is required'),
    body('ltrs')
      .isFloat({ min: 0 })
      .withMessage('Liters must be a non-negative number'),
    body('pricePerLtr')
      .isFloat({ min: 0 })
      .withMessage('Price per liter must be a non-negative number'),
    body('destinations').trim().notEmpty().withMessage('Destination is required'),
  ],

  update: [
    body('ltrs')
      .optional()
      .isFloat({ min: 0 })
      .withMessage('Liters must be a non-negative number'),
    body('pricePerLtr')
      .optional()
      .isFloat({ min: 0 })
      .withMessage('Price per liter must be a non-negative number'),
  ],
};

/**
 * Validation rules for LPO Summary operations
 */
export const lpoSummaryValidation = {
  create: [
    body('lpoNo').trim().notEmpty().withMessage('LPO number is required'),
    body('date').notEmpty().withMessage('Date is required'),
    body('station').trim().notEmpty().withMessage('Station is required'),
    body('orderOf').trim().notEmpty().withMessage('Order of is required'),
    body('entries').isArray({ min: 1 }).withMessage('At least one entry is required'),
    body('entries.*.doNo').trim().notEmpty().withMessage('DO number is required'),
    body('entries.*.truckNo').trim().notEmpty().withMessage('Truck number is required'),
    body('entries.*.liters')
      .isFloat({ min: 0 })
      .withMessage('Liters must be a non-negative number'),
    body('entries.*.rate')
      .isFloat({ min: 0 })
      .withMessage('Rate must be a non-negative number'),
    body('entries.*.dest').trim().notEmpty().withMessage('Destination is required'),
  ],
};

/**
 * Validation rules for Fuel Record operations
 */
export const fuelRecordValidation = {
  create: [
    body('date').notEmpty().withMessage('Date is required'),
    body('truckNo').trim().notEmpty().withMessage('Truck number is required'),
    body('goingDo').trim().notEmpty().withMessage('Going DO is required'),
    body('start').trim().notEmpty().withMessage('Start location is required'),
    body('from').trim().notEmpty().withMessage('From location is required'),
    body('to').trim().notEmpty().withMessage('To location is required'),
    body('totalLts')
      .optional({ nullable: true })
      .isFloat({ min: 0 })
      .withMessage('Total liters must be a non-negative number'),
    body('extra')
      .optional({ nullable: true })
      .isFloat({ min: 0 })
      .withMessage('Extra fuel must be a non-negative number'),
    body('balance').isNumeric().withMessage('Balance must be a number'),
  ],
};

/**
 * Validation rules for Yard Fuel operations
 */
export const yardFuelValidation = {
  create: [
    body('date').notEmpty().withMessage('Date is required'),
    body('truckNo').trim().notEmpty().withMessage('Truck number is required'),
    body('liters')
      .isFloat({ min: 0.01 })
      .withMessage('Liters must be greater than 0'),
    body('yard')
      .optional()
      .isIn(['DAR YARD', 'TANGA YARD', 'MMSA YARD'])
      .withMessage('Invalid yard'),
    body('notes')
      .optional()
      .trim(),
  ],
};

/**
 * Common validation rules
 */
export const commonValidation = {
  mongoId: param('id').isMongoId().withMessage('Invalid ID format'),
  
  pagination: [
    query('page')
      .optional()
      .isInt({ min: 1 })
      .withMessage('Page must be a positive integer'),
    query('limit')
      .optional()
      .isInt({ min: 1, max: 100 })
      .withMessage('Limit must be between 1 and 100'),
  ],
};
