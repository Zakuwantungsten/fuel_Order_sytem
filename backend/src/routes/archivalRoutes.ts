import express from 'express';
import {
  runArchival,
  getArchivalStats,
  queryArchivedData,
  restoreArchivedData,
  getArchivalHistory,
  exportUnifiedData,
} from '../controllers/archivalController';
import { authenticate, authorize } from '../middleware/auth';
import { exportRateLimiter } from '../middleware/rateLimiters';

const router = express.Router();

/**
 * @route POST /api/archival/run
 * @desc Run archival process (move old data to archive collections)
 * @access Super Admin only
 */
router.post('/run', authenticate, authorize('super_admin'), runArchival);

/**
 * @route GET /api/archival/stats
 * @desc Get archival statistics (active vs archived record counts)
 * @access Admin, Super Admin
 */
router.get('/stats', authenticate, authorize('admin', 'super_admin'), getArchivalStats);

/**
 * @route POST /api/archival/query
 * @desc Query archived data for reference/reports
 * @access Admin, Super Admin, Manager, Super Manager
 */
router.post(
  '/query',
  authenticate,
  authorize('admin', 'super_admin', 'manager', 'super_manager'),
  queryArchivedData
);

/**
 * @route POST /api/archival/restore
 * @desc Restore archived data back to active collections (emergency rollback)
 * @access Super Admin only
 */
router.post('/restore', authenticate, authorize('super_admin'), restoreArchivedData);

/**
 * @route GET /api/archival/history
 * @desc Get archival execution history
 * @access Admin, Super Admin
 */
router.get('/history', authenticate, authorize('admin', 'super_admin'), getArchivalHistory);

/**
 * @route POST /api/archival/export
 * @desc Export unified data (active + archived) to Excel
 * @access Super Admin only
 */
router.post('/export', exportRateLimiter, authenticate, authorize('super_admin'), exportUnifiedData);

export default router;
