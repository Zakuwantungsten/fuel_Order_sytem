import { Router } from 'express';
import { checkMaintenanceMode } from '../middleware/maintenance';
import { apiRateLimiter } from '../middleware/rateLimiters';
import authRoutes from './authRoutes';
import mfaRoutes from './mfaRoutes';
import deliveryOrderRoutes from './deliveryOrderRoutes';
import lpoEntryRoutes from './lpoEntryRoutes';
import lpoSummaryRoutes from './lpoSummaryRoutes';
import fuelRecordRoutes from './fuelRecordRoutes';
import yardFuelRoutes from './yardFuelRoutes';
import dashboardRoutes from './dashboardRoutes';
import userRoutes from './userRoutes';
import adminRoutes from './adminRoutes';
import driverAccountRoutes from './driverAccountRoutes';
import trashRoutes from './trashRoutes';
import backupRoutes from './backupRoutes';
import analyticsRoutes from './analyticsRoutes';
import configRoutes from './configRoutes';
import publicConfigRoutes from './publicConfigRoutes';
import notificationRoutes from './notificationRoutes';
import archivalRoutes from './archivalRoutes';
import systemConfigRoutes from './systemConfigRoutes';
import driverCredentialRoutes from './driverCredentialRoutes';
import checkpointRoutes from './checkpointRoutes';
import fleetTrackingRoutes from './fleetTrackingRoutes';
import importRoutes from './importRoutes';
import announcementRoutes from './announcementRoutes';
import ipRuleRoutes from './ipRuleRoutes';
import sessionRoutes from './sessionRoutes';
import configDiffRoutes from './configDiffRoutes';
import fuelPriceRoutes from './fuelPriceRoutes';
import cronJobRoutes from './cronJobRoutes';
import dataExportRoutes from './dataExportRoutes';
import featureFlagRoutes from './featureFlagRoutes';
import systemHealthRoutes from './systemHealthRoutes';
import webhookRoutes from './webhookRoutes';
import activityHeatmapRoutes from './activityHeatmapRoutes';
import bulkUserRoutes from './bulkUserRoutes';
import storageRoutes from './storageRoutes';
import emailLogRoutes from './emailLogRoutes';
import mfaManagementRoutes from './mfaManagementRoutes';
import apiTokenRoutes from './apiTokenRoutes';
import performanceMetricsRoutes from './performanceMetricsRoutes';
import dbIndexRoutes from './dbIndexRoutes';
import configHistoryRoutes from './configHistoryRoutes';
import customReportRoutes from './customReportRoutes';
import notificationConfigRoutes from './notificationConfigRoutes';
import securityScoreRoutes from './securityScoreRoutes';
import privilegeRoutes from './privilegeRoutes';
import dlpRoutes from './dlpRoutes';
import breakGlassRoutes from './breakGlassRoutes';
import siemRoutes from './siemRoutes';
import threatDetectionRoutes from './threatDetectionRoutes';
import securityBlocklistRoutes from './securityBlocklistRoutes';
import securityEventsRoutes from './securityEventsRoutes';
import securityAlertRoutes from './securityAlertRoutes';
import securityAuditRoutes from './securityAuditRoutes';
import rolePermissionRoutes from './rolePermissionRoutes';
import knownDeviceRoutes from './knownDeviceRoutes';
import geoAccessRoutes from './geoAccessRoutes';
import sessionAnomalyRoutes from './sessionAnomalyRoutes';
import securityIncidentRoutes from './securityIncidentRoutes';
import complianceRoutes from './complianceRoutes';
import conditionalAccessRoutes from './conditionalAccessRoutes';

const router = Router();

// Mount routes
router.use('/auth', authRoutes);
router.use('/mfa', mfaRoutes);

// Standard data endpoints rate limiter (excludes auth routes)
router.use(apiRateLimiter);

router.use('/config', publicConfigRoutes); // Public read-only config for all authenticated users

// --- Maintenance mode gate: blocks all routes below for non-allowed roles ---
router.use(checkMaintenanceMode);

router.use('/delivery-orders', deliveryOrderRoutes);
router.use('/lpo-entries', lpoEntryRoutes);
router.use('/lpo-documents', lpoSummaryRoutes);
router.use('/fuel-records', fuelRecordRoutes);
router.use('/yard-fuel', yardFuelRoutes);
router.use('/dashboard', dashboardRoutes);
router.use('/users', userRoutes);
router.use('/admin', adminRoutes);
router.use('/driver-accounts', driverAccountRoutes);
router.use('/notifications', notificationRoutes);
router.use('/trash', trashRoutes);
router.use('/backup', backupRoutes);
router.use('/system-admin/analytics', analyticsRoutes); // Super admin analytics
router.use('/system-config', configRoutes);
router.use('/system-admin/config', systemConfigRoutes); // Super admin only system configuration
router.use('/archival', archivalRoutes);
router.use('/driver-credentials', driverCredentialRoutes); // Driver credential management
router.use('/checkpoints', checkpointRoutes); // Checkpoint management for fleet tracking
router.use('/fleet-tracking', fleetTrackingRoutes); // Fleet position tracking and visualization
router.use('/import', importRoutes); // Excel data import (admin only)
router.use('/announcements', announcementRoutes); // System announcements (banners)
router.use('/system-admin/ip-rules', ipRuleRoutes); // IP allowlist / blocklist
router.use('/system-admin/sessions', sessionRoutes); // Active session management
router.use('/system-admin/config-diff', configDiffRoutes); // Config change diff view
router.use('/system-admin/fuel-prices', fuelPriceRoutes); // Fuel price history & scheduling
router.use('/system-admin/cron-jobs', cronJobRoutes); // Cron job manager
router.use('/system-admin/data-export', dataExportRoutes); // Data export center
router.use('/system-admin/feature-flags', featureFlagRoutes); // Feature flags
router.use('/system-admin/system-health', systemHealthRoutes); // System health monitor
router.use('/system-admin/webhooks', webhookRoutes); // Webhook manager
router.use('/system-admin/activity-heatmap', activityHeatmapRoutes); // User activity heatmap
router.use('/system-admin/bulk-users', bulkUserRoutes); // Bulk user management
router.use('/system-admin/storage', storageRoutes); // Storage manager
router.use('/system-admin/email-logs', emailLogRoutes); // Email log viewer
router.use('/system-admin/mfa-management', mfaManagementRoutes); // 2FA management
router.use('/system-admin/api-tokens', apiTokenRoutes); // API token manager
router.use('/system-admin/performance-metrics', performanceMetricsRoutes); // Performance metrics
router.use('/system-admin/db-indexes', dbIndexRoutes); // DB index explorer
router.use('/system-admin/config-history', configHistoryRoutes); // Config version history
router.use('/system-admin/custom-report', customReportRoutes); // Custom report builder
router.use('/system-admin/notification-config', notificationConfigRoutes); // Notification center config
router.use('/system-admin/security-score', securityScoreRoutes); // Security posture dashboard
router.use('/system-admin/privilege-elevation', privilegeRoutes); // JIT privilege elevation
router.use('/system-admin/dlp', dlpRoutes); // Data loss prevention controls
router.use('/system-admin/break-glass', breakGlassRoutes); // Break-glass emergency access
router.use('/system-admin/siem', siemRoutes); // SIEM export / audit event streaming
router.use('/system-admin/threat-detection', threatDetectionRoutes); // UEBA threat detection
router.use('/system-admin/security-blocklist', securityBlocklistRoutes); // IP reputation / auto-blocklist
router.use('/system-admin/security-events', securityEventsRoutes); // Security event log viewer
router.use('/system-admin/security-alerts', securityAlertRoutes); // Security alert queue
router.use('/system-admin/security-audit-log', securityAuditRoutes); // Security change audit log
router.use('/system-admin/role-permissions', rolePermissionRoutes); // Role permission matrix
router.use('/system-admin/known-devices', knownDeviceRoutes); // Device trust & management
router.use('/system-admin/geo-access', geoAccessRoutes); // Geographic access map
router.use('/system-admin/session-anomalies', sessionAnomalyRoutes); // Session anomaly detection
router.use('/system-admin/incidents', securityIncidentRoutes); // Security incident workflow
router.use('/system-admin/compliance', complianceRoutes); // Compliance & regulatory dashboard
router.use('/system-admin/conditional-access', conditionalAccessRoutes); // Conditional access policies

export default router;
