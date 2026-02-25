import { Router } from 'express';
import multer from 'multer';
import { authenticate, authorize } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';
import { validateFileUpload, fileSizeLimit } from '../middleware/fileUploadValidator';
import { previewExcel, importExcel, migrateLPOData } from '../controllers/importController';

const router = Router();

// Memory storage – file never touches disk, buffer goes straight to controller
// ✅ SECURITY: Max 15 MB (consistent across all endpoints)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 }, // 15 MB max
});

// All import routes require authentication and admin-level role
router.use(authenticate);
router.use(authorize('super_admin', 'admin', 'boss'));

/**
 * POST /api/import/preview
 * Parse the Excel file and return sheet metadata (no DB writes).
 * ✅ SECURITY: File validated with magic bytes + UUID rename
 */
router.post(
  '/preview',
  upload.single('excelFile'),
  fileSizeLimit(15 * 1024 * 1024),
  validateFileUpload(['xlsx', 'xls', 'csv']),
  asyncHandler(previewExcel)
);

/**
 * POST /api/import/excel
 * Import data into MongoDB from the uploaded Excel workbook.
 * ✅ SECURITY: File validated with magic bytes + UUID rename
 */
router.post(
  '/excel',
  upload.single('excelFile'),
  fileSizeLimit(15 * 1024 * 1024),
  validateFileUpload(['xlsx', 'xls', 'csv']),
  asyncHandler(importExcel)
);

/**
 * POST /api/import/migrate-lpo-data
 * One-time migration: patch actualDate on existing imported LPOEntries that lack it,
 * and create missing LPOSummary / LPOWorkbook records so the workbook view is populated.
 * Safe to call multiple times (idempotent).
 */
router.post('/migrate-lpo-data', asyncHandler(migrateLPOData));

export default router;
