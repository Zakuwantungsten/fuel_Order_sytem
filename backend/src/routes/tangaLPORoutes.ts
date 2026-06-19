import { Router } from 'express';
import { asyncHandler } from '../middleware/errorHandler';
import { authenticate, authorize } from '../middleware/auth';
import { commonValidation } from '../middleware/validation';
import { validate } from '../utils/validate';
import { createEditLockHandlers } from '../controllers/editLockController';
import { TangaLPODocument } from '../models/TangaLPODocument';
import * as tangaLPOController from '../controllers/tangaLPOController';

const router = Router();

const WRITE_ROLES = ['super_admin', 'admin', 'manager', 'supervisor', 'tanga_yard'] as const;

router.use(authenticate);

// Read routes — all authenticated users
router.get('/next-number',       asyncHandler(tangaLPOController.getNextTangaLPONumber));
router.get('/years',             asyncHandler(tangaLPOController.getTangaAvailableYears));
router.get('/workbooks/:year',   asyncHandler(tangaLPOController.getTangaWorkbookByYear));
router.get('/lpo/:lpoNo',        asyncHandler(tangaLPOController.getTangaLPOByLPONo));
router.get('/:id', commonValidation.mongoId, validate, asyncHandler(tangaLPOController.getTangaLPOById));
router.get('/',                  asyncHandler(tangaLPOController.getAllTangaLPOs));

// Write routes — yard + management roles
router.post('/',
  authorize(...WRITE_ROLES),
  asyncHandler(tangaLPOController.createTangaLPO)
);

router.put('/:id',
  commonValidation.mongoId,
  authorize(...WRITE_ROLES),
  validate,
  asyncHandler(tangaLPOController.updateTangaLPO)
);

router.post('/cancel-entry',
  authorize(...WRITE_ROLES),
  asyncHandler(tangaLPOController.cancelEntryInTangaLPO)
);

router.post('/amend-entry',
  authorize(...WRITE_ROLES),
  asyncHandler(tangaLPOController.amendEntryInTangaLPO)
);

router.post('/manual-link',
  authorize(...WRITE_ROLES),
  asyncHandler(tangaLPOController.manualLinkTangaEntry)
);

router.post('/preview-manual-link',
  authorize(...WRITE_ROLES),
  asyncHandler(tangaLPOController.previewManualLinkTangaEntry)
);

router.post('/:id/preview-bulk-link',
  commonValidation.mongoId,
  authorize(...WRITE_ROLES),
  validate,
  asyncHandler(tangaLPOController.previewBulkAutoLinkTangaEntries)
);

router.post('/:id/bulk-link',
  commonValidation.mongoId,
  authorize(...WRITE_ROLES),
  validate,
  asyncHandler(tangaLPOController.bulkAutoLinkTangaEntries)
);

router.post('/:id/cancel-all',
  commonValidation.mongoId,
  authorize(...WRITE_ROLES),
  validate,
  asyncHandler(tangaLPOController.cancelAllEntriesInTangaLPO)
);

// Edit lock routes
const tangaLPOLock = createEditLockHandlers(TangaLPODocument, 'tanga_lpo_documents');
router.post('/:id/lock',
  commonValidation.mongoId,
  authorize(...WRITE_ROLES),
  validate,
  asyncHandler(tangaLPOLock.acquireEditLock)
);
router.delete('/:id/lock',
  commonValidation.mongoId,
  authorize(...WRITE_ROLES),
  validate,
  asyncHandler(tangaLPOLock.releaseEditLock)
);

export default router;
