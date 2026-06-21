import { Router } from 'express';
import { asyncHandler } from '../middleware/errorHandler';
import { authenticate, authorize } from '../middleware/auth';
import { commonValidation } from '../middleware/validation';
import { validate } from '../utils/validate';
import { createEditLockHandlers } from '../controllers/editLockController';
import { DarLPODocument } from '../models/DarLPODocument';
import * as darLPOController from '../controllers/darLPOController';

const router = Router();

const WRITE_ROLES = ['super_admin', 'admin', 'manager', 'supervisor', 'dar_yard'] as const;

router.use(authenticate);

// Read routes — all authenticated users
router.get('/next-number',       asyncHandler(darLPOController.getNextDarLPONumber));
router.get('/years',             asyncHandler(darLPOController.getDarAvailableYears));
router.get('/filter-options',    asyncHandler(darLPOController.getDarFilterOptions));
router.get('/workbooks/:year/:month/pdf', asyncHandler(darLPOController.downloadDarMonthPDF));
router.get('/workbooks/:year',   asyncHandler(darLPOController.getDarWorkbookByYear));
router.get('/lpo/:lpoNo',        asyncHandler(darLPOController.getDarLPOByLPONo));
router.get('/:id/pdf', commonValidation.mongoId, validate, asyncHandler(darLPOController.downloadDarLPOPDF));
router.get('/:id', commonValidation.mongoId, validate, asyncHandler(darLPOController.getDarLPOById));
router.get('/',                  asyncHandler(darLPOController.getAllDarLPOs));

// Write routes — yard + management roles
router.post('/',
  authorize(...WRITE_ROLES),
  asyncHandler(darLPOController.createDarLPO)
);

router.put('/:id',
  commonValidation.mongoId,
  authorize(...WRITE_ROLES),
  validate,
  asyncHandler(darLPOController.updateDarLPO)
);

router.post('/cancel-entry',
  authorize(...WRITE_ROLES),
  asyncHandler(darLPOController.cancelEntryInDarLPO)
);

router.post('/amend-entry',
  authorize(...WRITE_ROLES),
  asyncHandler(darLPOController.amendEntryInDarLPO)
);

router.post('/manual-link',
  authorize(...WRITE_ROLES),
  asyncHandler(darLPOController.manualLinkDarEntry)
);

router.post('/preview-manual-link',
  authorize(...WRITE_ROLES),
  asyncHandler(darLPOController.previewManualLinkDarEntry)
);

router.post('/:id/preview-bulk-link',
  commonValidation.mongoId,
  authorize(...WRITE_ROLES),
  validate,
  asyncHandler(darLPOController.previewBulkAutoLinkDarEntries)
);

router.post('/:id/bulk-link',
  commonValidation.mongoId,
  authorize(...WRITE_ROLES),
  validate,
  asyncHandler(darLPOController.bulkAutoLinkDarEntries)
);

router.post('/:id/cancel-all',
  commonValidation.mongoId,
  authorize(...WRITE_ROLES),
  validate,
  asyncHandler(darLPOController.cancelAllEntriesInDarLPO)
);

// Edit lock routes
const darLPOLock = createEditLockHandlers(DarLPODocument, 'dar_lpo_documents');
router.post('/:id/lock',
  commonValidation.mongoId,
  authorize(...WRITE_ROLES),
  validate,
  asyncHandler(darLPOLock.acquireEditLock)
);
router.delete('/:id/lock',
  commonValidation.mongoId,
  authorize(...WRITE_ROLES),
  validate,
  asyncHandler(darLPOLock.releaseEditLock)
);

export default router;
