import express from 'express';
import { asyncHandler } from '../middleware/errorHandler';
import { authenticate, authorize } from '../middleware/auth';
import * as ctrl from '../controllers/visaOverstayController';

const router = express.Router();

const canManage = authorize('super_admin', 'admin', 'clerk', 'boss');

router.use(authenticate);

router.get('/days', canManage, asyncHandler(ctrl.listDays));
router.get('/entries', canManage, asyncHandler(ctrl.listEntries));
router.get('/sheet', canManage, asyncHandler(ctrl.getDaySheet));

router.get('/cases', canManage, asyncHandler(ctrl.listCases));
router.post('/cases', canManage, asyncHandler(ctrl.createCase));
router.post('/cases/bulk', canManage, asyncHandler(ctrl.createCasesBulk));
router.get('/history', canManage, asyncHandler(ctrl.getTruckHistory));
router.put('/cases/:id', canManage, asyncHandler(ctrl.updateCase));
router.post('/cases/:id/wait', canManage, asyncHandler(ctrl.markWaitingDue));
router.post('/cases/:id/to-raw', canManage, asyncHandler(ctrl.markRawInput));
router.post('/cases/:id/add-to-day', canManage, asyncHandler(ctrl.addCaseToDay));
router.post('/cases/:id/cross', canManage, asyncHandler(ctrl.markCrossed));

router.get('/due', canManage, asyncHandler(ctrl.listDueForDate));
router.get('/crossed', canManage, asyncHandler(ctrl.listCrossedOutput));

router.get('/payments', canManage, asyncHandler(ctrl.listPaymentsByDate));
router.post('/payments', canManage, asyncHandler(ctrl.createPayments));
router.post('/payments/build-day', canManage, asyncHandler(ctrl.buildDayPayments));
router.post('/payments/confirm-batch', canManage, asyncHandler(ctrl.confirmPaymentsBatch));
router.put('/payments/:id', canManage, asyncHandler(ctrl.amendPayment));
router.post('/payments/:id/confirm', canManage, asyncHandler(ctrl.confirmPayment));
router.post('/payments/:id/cancel', canManage, asyncHandler(ctrl.cancelPayment));

router.post('/rows/confirm', canManage, asyncHandler(ctrl.confirmRow));
router.post('/rows/remove', canManage, asyncHandler(ctrl.removeRow));
router.post('/rows/assign-visa', canManage, asyncHandler(ctrl.assignVisa));

router.get('/config', canManage, asyncHandler(ctrl.getVisaOverstayConfig));
router.put('/config', canManage, asyncHandler(ctrl.updateVisaOverstayConfig));
router.post('/intake-checks', canManage, asyncHandler(ctrl.checkIntakeDuplicates));

router.get('/build', canManage, asyncHandler(ctrl.listBuildItems));
router.post('/build/confirm-batch', canManage, asyncHandler(ctrl.confirmBuildBatch));
router.post('/build/resolve-batch', canManage, asyncHandler(ctrl.resolveBuildBatch));
router.put('/build/:id', canManage, asyncHandler(ctrl.updateBuildItem));
router.post('/build/:id/resolve', canManage, asyncHandler(ctrl.resolveBuildItem));

router.get('/exports/day-sheet', canManage, asyncHandler(ctrl.exportDaySheet));
router.get('/exports/build', canManage, asyncHandler(ctrl.exportBuildReview));

export default router;
