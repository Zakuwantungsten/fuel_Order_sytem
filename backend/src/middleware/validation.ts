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
      .isLength({ min: 1 })
      .withMessage('Password is required'),
    body('firstName').trim().notEmpty().withMessage('First name is required'),
    body('lastName').trim().notEmpty().withMessage('Last name is required'),
    body('role')
      .optional()
      .isIn([
        'super_admin',
        'admin',
        'manager',
        'super_manager',
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
        'import_officer',
        'export_officer',
        'dar_yard',
        'tanga_yard',
        'mmsa_yard',
      ])
      .withMessage('Invalid role'),
  ],

  // Admin creates user - password is auto-generated and emailed
  adminCreate: [
    body('username')
      .trim()
      .isLength({ min: 3, max: 30 })
      .withMessage('Username must be between 3 and 30 characters')
      .matches(/^[a-zA-Z0-9_]+$/)
      .withMessage('Username can only contain letters, numbers, and underscores'),
    body('email').isEmail().withMessage('Must be a valid email address').normalizeEmail(),
    body('firstName').trim().notEmpty().withMessage('First name is required'),
    body('lastName').trim().notEmpty().withMessage('Last name is required'),
    body('role')
      .optional()
      .isIn([
        'super_admin',
        'admin',
        'manager',
        'super_manager',
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
        'import_officer',
        'export_officer',
        'dar_yard',
        'tanga_yard',
        'mmsa_yard',
      ])
      .withMessage('Invalid role'),
    body('station').optional().trim(),
    body('yard').optional().isIn(['DAR YARD', 'TANGA YARD', 'MMSA YARD']).withMessage('Invalid yard'),
  ],

  login: [
    body('username').trim().notEmpty().withMessage('Username is required'),
    body('password').notEmpty().withMessage('Password is required'),
    body('deviceId').optional().trim(),
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
    body('invoiceNos').optional().trim(),
    body('clientName').trim().notEmpty().withMessage('Client name is required'),
    body('truckNo').trim().notEmpty().withMessage('Truck number is required'),
    body('trailerNo').trim().notEmpty().withMessage('Trailer number is required'),
    body('containerNo').trim().notEmpty().withMessage('Container number is required'),
    body('borderEntryDRC').optional().trim(),
    body('loadingPoint').trim().notEmpty().withMessage('Loading point is required'),
    body('destination').trim().notEmpty().withMessage('Destination is required'),
    body('haulier').optional().trim(),
    body('driverName').optional().trim(),
    body('tonnages')
      .isFloat({ min: 0 })
      .withMessage('Tonnage must be a non-negative number'),
    body('ratePerTon')
      .isFloat({ min: 0 })
      .withMessage('Rate per ton must be a non-negative number'),
    body('rate').optional().trim(),
    body('cargoType').optional().isIn(['loosecargo', 'container']).withMessage('Invalid cargo type'),
    body('rateType').optional().isIn(['per_ton', 'fixed_total']).withMessage('Invalid rate type'),
    body('totalAmount').optional().isFloat({ min: 0 }).withMessage('Total amount must be a non-negative number'),
  ],

  update: [
    body('importOrExport')
      .optional()
      .isIn(['IMPORT', 'EXPORT'])
      .withMessage('Must be either IMPORT or EXPORT'),
    body('doType').optional().isIn(['DO', 'SDO']).withMessage('Must be either DO or SDO'),
    body('doNumber').optional().trim().notEmpty().withMessage('DO number cannot be empty'),
    body('invoiceNos').optional().trim(),
    body('clientName').optional().trim().notEmpty().withMessage('Client name cannot be empty'),
    body('truckNo').optional().trim().notEmpty().withMessage('Truck number cannot be empty'),
    body('trailerNo').optional().trim().notEmpty().withMessage('Trailer number cannot be empty'),
    body('containerNo').optional().trim().notEmpty().withMessage('Container number cannot be empty'),
    body('borderEntryDRC').optional().trim(),
    body('loadingPoint').optional().trim().notEmpty().withMessage('Loading point cannot be empty'),
    body('destination').optional().trim().notEmpty().withMessage('Destination cannot be empty'),
    body('haulier').optional().trim(),
    body('driverName').optional().trim(),
    body('tonnages')
      .optional()
      .isFloat({ min: 0 })
      .withMessage('Tonnage must be a non-negative number'),
    body('ratePerTon')
      .optional()
      .isFloat({ min: 0 })
      .withMessage('Rate per ton must be a non-negative number'),
    body('rate').optional().trim(),
    body('cargoType').optional().isIn(['loosecargo', 'container']).withMessage('Invalid cargo type'),
    body('rateType').optional().isIn(['per_ton', 'fixed_total']).withMessage('Invalid rate type'),
    body('totalAmount').optional().isFloat({ min: 0 }).withMessage('Total amount must be a non-negative number'),
    body('editReason').optional().trim(),
  ],
};

/**
 * Validation rules for LPO Entry operations
 */
export const lpoEntryValidation = {
  create: [
    body('sn').isInt({ min: 1 }).withMessage('Serial number must be a positive integer'),
    body('date').notEmpty().withMessage('Date is required'),
    body('actualDate').optional().isISO8601().toDate().withMessage('Actual date must be a valid date'),
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
    body('isDriverAccount').optional().isBoolean().withMessage('isDriverAccount must be a boolean'),
    body('referenceDo').optional().trim(),
    body('paymentMode').optional().isIn(['STATION', 'CASH', 'DRIVER_ACCOUNT']).withMessage('Invalid payment mode'),
    body('currency').optional().isIn(['USD', 'TZS']).withMessage('Invalid currency'),
  ],

  update: [
    body('sn').optional().isInt({ min: 1 }).withMessage('Serial number must be a positive integer'),
    body('date').optional().trim().notEmpty().withMessage('Date cannot be empty'),
    body('actualDate').optional().isISO8601().toDate().withMessage('Actual date must be a valid date'),
    body('lpoNo').optional().trim().notEmpty().withMessage('LPO number cannot be empty'),
    body('dieselAt').optional().trim().notEmpty().withMessage('Diesel station cannot be empty'),
    body('doSdo').optional().trim().notEmpty().withMessage('DO/SDO number cannot be empty'),
    body('truckNo').optional().trim().notEmpty().withMessage('Truck number cannot be empty'),
    body('ltrs')
      .optional()
      .isFloat({ min: 0 })
      .withMessage('Liters must be a non-negative number'),
    body('pricePerLtr')
      .optional()
      .isFloat({ min: 0 })
      .withMessage('Price per liter must be a non-negative number'),
    body('destinations').optional().trim().notEmpty().withMessage('Destination cannot be empty'),
    body('isDriverAccount').optional().isBoolean().withMessage('isDriverAccount must be a boolean'),
    body('referenceDo').optional().trim(),
    body('paymentMode').optional().isIn(['STATION', 'CASH', 'DRIVER_ACCOUNT']).withMessage('Invalid payment mode'),
    body('currency').optional().isIn(['USD', 'TZS']).withMessage('Invalid currency'),
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

  update: [
    body('date').optional().isString().trim().notEmpty().withMessage('Date cannot be empty'),
    body('month').optional().isString().trim(),
    body('truckNo').optional().isString().trim(),
    body('goingDo').optional().isString().trim(),
    body('returnDo').optional().isString().trim(),
    body('start').optional().isString().trim(),
    body('from').optional().isString().trim(),
    body('to').optional().isString().trim(),
    body('totalLts').optional({ nullable: true }).isFloat({ min: 0 }).withMessage('Total liters must be a non-negative number'),
    body('extra').optional({ nullable: true }).isFloat({ min: 0 }).withMessage('Extra fuel must be a non-negative number'),
    body('journeyStatus').optional().isIn(['queued', 'active', 'completed', 'cancelled']).withMessage('Invalid journey status'),
    body('queueOrder').optional().isInt({ min: 1 }).withMessage('Queue order must be a positive integer'),
    body('mmsaYard').optional().isFloat({ min: 0 }).withMessage('MMSA yard fuel must be non-negative'),
    body('tangaYard').optional().isFloat({ min: 0 }).withMessage('Tanga yard fuel must be non-negative'),
    body('darYard').optional().isFloat({ min: 0 }).withMessage('Dar yard fuel must be non-negative'),
    body('darGoing').optional().isFloat({ min: 0 }).withMessage('Dar going fuel must be non-negative'),
    body('moroGoing').optional().isFloat({ min: 0 }).withMessage('Moro going fuel must be non-negative'),
    body('mbeyaGoing').optional().isFloat({ min: 0 }).withMessage('Mbeya going fuel must be non-negative'),
    body('tdmGoing').optional().isFloat({ min: 0 }).withMessage('TDM going fuel must be non-negative'),
    body('zambiaGoing').optional().isFloat({ min: 0 }).withMessage('Zambia going fuel must be non-negative'),
    body('congoFuel').optional().isFloat({ min: 0 }).withMessage('Congo fuel must be non-negative'),
    body('zambiaReturn').optional().isFloat({ min: 0 }).withMessage('Zambia return fuel must be non-negative'),
    body('tundumaReturn').optional().isFloat({ min: 0 }).withMessage('Tunduma return fuel must be non-negative'),
    body('mbeyaReturn').optional().isFloat({ min: 0 }).withMessage('Mbeya return fuel must be non-negative'),
    body('moroReturn').optional().isFloat({ min: 0 }).withMessage('Moro return fuel must be non-negative'),
    body('darReturn').optional().isFloat({ min: 0 }).withMessage('Dar return fuel must be non-negative'),
    body('tangaReturn').optional().isFloat({ min: 0 }).withMessage('Tanga return fuel must be non-negative'),
    body('balance').optional().isFloat().withMessage('Balance must be a number'),
    body('originalGoingFrom').optional().isString().trim(),
    body('originalGoingTo').optional().isString().trim(),
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
 * Validation rules for Checkpoint operations
 */
export const checkpointValidation = {
  list: [
    query('includeInactive').optional().isBoolean().withMessage('includeInactive must be a boolean').toBoolean(),
  ],
  create: [
    body('name').trim().notEmpty().withMessage('Name is required'),
    body('displayName').trim().notEmpty().withMessage('Display name is required'),
    body('order').optional().isInt({ min: 1 }).withMessage('Order must be a positive integer'),
    body('region')
      .trim()
      .isIn([
        'KENYA',
        'TANZANIA_COASTAL',
        'TANZANIA_INTERIOR',
        'TANZANIA_BORDER',
        'ZAMBIA_NORTH',
        'ZAMBIA_CENTRAL',
        'ZAMBIA_COPPERBELT',
        'ZAMBIA_BORDER',
        'DRC',
      ])
      .withMessage('Invalid region'),
    body('country').trim().isIn(['KE', 'TZ', 'ZM', 'CD']).withMessage('Invalid country'),
    body('coordinates').optional().isObject().withMessage('Coordinates must be an object'),
    body('routeSegment')
      .optional()
      .isIn(['COASTAL', 'INTERIOR', 'BORDER', 'TRANSIT', 'DESTINATION'])
      .withMessage('Invalid route segment'),
    body('isActive').optional().isBoolean().withMessage('isActive must be a boolean'),
    body('isMajor').optional().isBoolean().withMessage('isMajor must be a boolean'),
    body('alternativeNames').optional().isArray().withMessage('alternativeNames must be an array'),
    body('alternativeNames.*').optional().isString().trim(),
    body('fuelAvailable').optional().isBoolean().withMessage('fuelAvailable must be a boolean'),
    body('borderCrossing').optional().isBoolean().withMessage('borderCrossing must be a boolean'),
    body('estimatedDistanceFromStart').optional().isFloat({ min: 0 }).withMessage('Estimated distance must be non-negative'),
    body('insertAfter').optional().isString().trim(),
  ],
  update: [
    body('displayName').optional().trim().notEmpty().withMessage('Display name cannot be empty'),
    body('region')
      .optional()
      .trim()
      .isIn([
        'KENYA',
        'TANZANIA_COASTAL',
        'TANZANIA_INTERIOR',
        'TANZANIA_BORDER',
        'ZAMBIA_NORTH',
        'ZAMBIA_CENTRAL',
        'ZAMBIA_COPPERBELT',
        'ZAMBIA_BORDER',
        'DRC',
      ])
      .withMessage('Invalid region'),
    body('country').optional().trim().isIn(['KE', 'TZ', 'ZM', 'CD']).withMessage('Invalid country'),
    body('coordinates').optional().isObject().withMessage('Coordinates must be an object'),
    body('routeSegment')
      .optional()
      .isIn(['COASTAL', 'INTERIOR', 'BORDER', 'TRANSIT', 'DESTINATION'])
      .withMessage('Invalid route segment'),
    body('isActive').optional().isBoolean().withMessage('isActive must be a boolean'),
    body('isMajor').optional().isBoolean().withMessage('isMajor must be a boolean'),
    body('alternativeNames').optional().isArray().withMessage('alternativeNames must be an array'),
    body('alternativeNames.*').optional().isString().trim(),
    body('fuelAvailable').optional().isBoolean().withMessage('fuelAvailable must be a boolean'),
    body('borderCrossing').optional().isBoolean().withMessage('borderCrossing must be a boolean'),
    body('estimatedDistanceFromStart').optional().isFloat({ min: 0 }).withMessage('Estimated distance must be non-negative'),
  ],
  reorder: [
    body('checkpoints').isArray({ min: 1 }).withMessage('checkpoints must be a non-empty array'),
    body('checkpoints.*.id').isMongoId().withMessage('Checkpoint id must be a valid Mongo ID'),
    body('checkpoints.*.order').isInt({ min: 1 }).withMessage('Order must be a positive integer'),
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
      .isInt({ min: 1, max: 10000 })
      .withMessage('Limit must be between 1 and 10000'),
  ],
};
