import express from 'express';
import { authenticate, authorize } from '../middleware/auth';
import * as systemConfigController from '../controllers/systemConfigController';

const router = express.Router();

// All routes require authentication and super_admin role
router.use(authenticate, authorize('super_admin'));

/**
 * System Settings Routes
 */

// Get all system settings
router.get('/settings', systemConfigController.getSystemSettings);

// Update specific setting categories
router.put('/settings/general', systemConfigController.updateGeneralSettings);
router.put('/settings/security', systemConfigController.updateSecuritySettings);
router.put('/settings/data-retention', systemConfigController.updateDataRetentionSettings);
router.put('/settings/notifications', systemConfigController.updateNotificationSettings);
router.put('/settings/maintenance', systemConfigController.updateMaintenanceMode);

/**
 * External Integration Configuration Routes
 */

// Cloudflare R2 Configuration
router.get('/r2', systemConfigController.getR2Configuration);
router.post('/r2/test', systemConfigController.testR2Connection);

// Email Configuration
router.get('/email', systemConfigController.getEmailConfiguration);
router.put('/email', systemConfigController.updateEmailConfiguration);

// Database Configuration
router.get('/database', systemConfigController.getDatabaseConfiguration);

/**
 * Performance & Monitoring Routes
 */

// Profiling settings
router.get('/profiling', systemConfigController.getProfilingSettings);
router.put('/profiling', systemConfigController.updateProfilingSettings);

/**
 * Critical System Access Routes
 */

// Environment variables (highly restricted)
router.get('/environment', systemConfigController.getEnvironmentVariables);

export default router;
