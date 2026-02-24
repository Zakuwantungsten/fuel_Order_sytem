import { Router } from 'express';
import multer from 'multer';
import { authenticate, authorize } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';
import { previewExcel, importExcel, migrateLPOData } from '../controllers/importController';

const router = Router();

// Memory storage – file never touches disk, buffer goes straight to controller
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 }, // 25 MB
  fileFilter(_req, file, cb) {
    const allowedMimes = [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
      'application/vnd.ms-excel', // .xls
      'text/csv',
      'application/csv',
      'text/comma-separated-values',
      'application/octet-stream', // some browsers send CSV with this MIME
    ];
    if (allowedMimes.includes(file.mimetype) || file.originalname.match(/\.(xlsx|xls|csv)$/i)) {
      cb(null, true);
    } else {
      cb(new Error('Only Excel (.xlsx / .xls) or CSV (.csv) files are accepted.'));
    }
  },
});

// All import routes require authentication and admin-level role
router.use(authenticate);
router.use(authorize('super_admin', 'admin', 'boss'));

/**
 * POST /api/import/preview
 * Parse the Excel file and return sheet metadata (no DB writes).
 */
router.post('/preview', upload.single('excelFile'), asyncHandler(previewExcel));

/**
 * POST /api/import/excel
 * Import data into MongoDB from the uploaded Excel workbook.
 */
router.post('/excel', upload.single('excelFile'), asyncHandler(importExcel));

/**
 * POST /api/import/migrate-lpo-data
 * One-time migration: patch actualDate on existing imported LPOEntries that lack it,
 * and create missing LPOSummary / LPOWorkbook records so the workbook view is populated.
 * Safe to call multiple times (idempotent).
 */
router.post('/migrate-lpo-data', asyncHandler(migrateLPOData));

export default router;
