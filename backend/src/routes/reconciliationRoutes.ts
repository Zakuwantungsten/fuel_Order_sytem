import { Router } from 'express';
import multer from 'multer';
import { authenticate, authorize } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';
import { validateFileUpload, fileSizeLimit } from '../middleware/fileUploadValidator';
import { exportRateLimiter } from '../middleware/rateLimiters';
import * as reconciliationController from '../controllers/reconciliationController';

const router = Router();

const RECON_ROLES = [
  'super_admin',
  'admin',
  'manager',
  'super_manager',
  'supervisor',
  'fuel_order_maker',
  'boss',
  'payment_manager',
] as const;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
});

router.use(authenticate);
router.use(authorize(...RECON_ROLES));

router.get('/', asyncHandler(reconciliationController.listSessions));
router.get('/pending', asyncHandler(reconciliationController.getPendingEntries));
router.get('/stations-in-range', asyncHandler(reconciliationController.getStationsInRange));
router.get(
  '/template',
  exportRateLimiter,
  asyncHandler(reconciliationController.downloadTemplate)
);

router.post('/', asyncHandler(reconciliationController.createSession));
router.get('/:id', asyncHandler(reconciliationController.getSession));
router.get('/:id/lines/filter-options', asyncHandler(reconciliationController.getSessionLineFilterOptions));
router.get('/:id/lines', asyncHandler(reconciliationController.getSessionLines));
router.get(
  '/:id/statement-rows/filter-options',
  asyncHandler(reconciliationController.getStatementRowFilterOptions)
);
router.get('/:id/statement-rows', asyncHandler(reconciliationController.getStatementRows));
router.get('/:id/match-candidates', asyncHandler(reconciliationController.getMatchCandidates));
router.get('/:id/variance-details', asyncHandler(reconciliationController.getVarianceDetails));
router.patch('/:id', asyncHandler(reconciliationController.updateSession));
router.post('/:id/load-lpo', asyncHandler(reconciliationController.loadLpoLines));
router.post(
  '/:id/validate-statement',
  upload.single('statementFile'),
  fileSizeLimit(15 * 1024 * 1024),
  validateFileUpload(['xlsx']),
  asyncHandler(reconciliationController.validateStatementUpload)
);
router.post(
  '/:id/upload-statement',
  upload.single('statementFile'),
  fileSizeLimit(15 * 1024 * 1024),
  validateFileUpload(['xlsx']),
  asyncHandler(reconciliationController.uploadStatement)
);
router.post('/:id/match', asyncHandler(reconciliationController.runMatch));
router.post('/:id/reopen', asyncHandler(reconciliationController.reopenSession));
router.post('/:id/add-stations', asyncHandler(reconciliationController.addStations));
router.post('/:id/update-stations', asyncHandler(reconciliationController.updateSessionStations));
router.post('/:id/save-draft', asyncHandler(reconciliationController.saveDraft));
router.patch('/:id/lines/:lineId', asyncHandler(reconciliationController.updateLine));
router.post('/:id/manual-match', asyncHandler(reconciliationController.manualMatch));
router.post('/:id/complete', asyncHandler(reconciliationController.completeSession));
router.post('/:id/drop', asyncHandler(reconciliationController.dropSession));
router.get(
  '/:id/export',
  exportRateLimiter,
  asyncHandler(reconciliationController.exportSession)
);
router.delete('/:id', asyncHandler(reconciliationController.deleteSession));

export default router;
