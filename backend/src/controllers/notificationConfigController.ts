import { Response } from 'express';
import type { AuthRequest } from '../middleware/auth';
import { SystemConfig } from '../models';
import { AuditService } from '../utils/auditService';
import logger from '../utils/logger';

const DEFAULT_NOTIF_CONFIG = {
  emailEnabled: true,
  emailOnTypes: ['truck_entry_rejected', 'missing_total_liters', 'lpo_created'],
  alertRecipients: ['super_admin', 'admin'],
  digestEnabled: false,
  digestSchedule: 'daily', // 'daily' | 'weekly'
};

export const getNotificationConfig = async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const config = await SystemConfig.findOne().lean();
    const notifConfig = (config as any)?.systemSettings?.notificationCenter || DEFAULT_NOTIF_CONFIG;
    res.json({ success: true, data: notifConfig });
  } catch (error: any) {
    logger.error('Error getting notification config:', error);
    throw error;
  }
};

export const updateNotificationConfig = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { emailEnabled, emailOnTypes, alertRecipients, digestEnabled, digestSchedule } = req.body;

    const VALID_TYPES = [
      'missing_total_liters', 'missing_extra_fuel', 'both', 'unlinked_export_do',
      'yard_fuel_recorded', 'truck_pending_linking', 'truck_entry_rejected', 'lpo_created',
      'info', 'warning', 'error',
    ];
    const VALID_ROLES = ['super_admin', 'admin', 'manager', 'supervisor'];
    const VALID_SCHEDULES = ['daily', 'weekly'];

    const notifConfig = {
      emailEnabled: !!emailEnabled,
      emailOnTypes: (Array.isArray(emailOnTypes) ? emailOnTypes : []).filter((t: string) => VALID_TYPES.includes(t)),
      alertRecipients: (Array.isArray(alertRecipients) ? alertRecipients : []).filter((r: string) => VALID_ROLES.includes(r)),
      digestEnabled: !!digestEnabled,
      digestSchedule: VALID_SCHEDULES.includes(digestSchedule) ? digestSchedule : 'daily',
    };

    let systemConfig = await SystemConfig.findOne();
    if (!systemConfig) systemConfig = new SystemConfig({});
    if (!(systemConfig as any).systemSettings) (systemConfig as any).systemSettings = {};
    (systemConfig as any).systemSettings.notificationCenter = notifConfig;
    systemConfig.markModified('systemSettings');
    systemConfig.lastUpdatedBy = req.user?.username || 'system';
    await systemConfig.save();

    await AuditService.log({
      userId: req.user?.userId,
      username: req.user?.username || 'system',
      action: 'CONFIG_CHANGE',
      resourceType: 'notification_config',
      details: `Notification center config updated`,
      severity: 'low',
      ipAddress: req.ip,
    });

    res.json({ success: true, data: notifConfig, message: 'Notification config saved' });
  } catch (error: any) {
    logger.error('Error updating notification config:', error);
    throw error;
  }
};

