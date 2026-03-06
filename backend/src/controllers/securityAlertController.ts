/**
 * Security Alert Controller
 *
 * Admin endpoints for the persistent security alert queue.
 * All routes require super_admin authentication.
 */
import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth';
import { securityAlertService } from '../services/securityAlertService';

const VALID_STATUSES = ['new', 'acknowledged', 'investigating', 'resolved', 'false_positive'];
const VALID_SEVERITIES = ['low', 'medium', 'high', 'critical'];

/**
 * GET / — paginated, filterable alert list
 */
export async function getSecurityAlerts(req: AuthRequest, res: Response, _next: NextFunction) {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit as string) || 50));

    const filters: Record<string, any> = {};

    if (req.query.status) {
      const statuses = (req.query.status as string).split(',');
      const valid = statuses.filter(s => VALID_STATUSES.includes(s));
      if (valid.length) filters.status = valid.length === 1 ? valid[0] : valid;
    }
    if (req.query.severity && VALID_SEVERITIES.includes(req.query.severity as string)) {
      filters.severity = req.query.severity;
    }
    if (req.query.type) {
      filters.type = req.query.type;
    }

    const result = await securityAlertService.getAlerts(filters, { page, limit });
    res.json({ success: true, data: result });
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Failed to fetch alerts', error: error.message });
  }
}

/**
 * GET /count — unresolved alert count for badge
 */
export async function getUnresolvedAlertCount(req: AuthRequest, res: Response, _next: NextFunction) {
  try {
    const counts = await securityAlertService.getUnresolvedCount();
    res.json({ success: true, data: counts });
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Failed to fetch alert count', error: error.message });
  }
}

/**
 * PATCH /:id/acknowledge
 */
export async function acknowledgeAlert(req: AuthRequest, res: Response, _next: NextFunction) {
  try {
    const alert = await securityAlertService.acknowledge(req.params.id, req.user?.username || 'unknown');
    if (!alert) return res.status(404).json({ success: false, message: 'Alert not found' });
    return res.json({ success: true, data: alert });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: 'Failed to acknowledge alert', error: error.message });
  }
}

/**
 * PATCH /:id/investigate
 */
export async function investigateAlert(req: AuthRequest, res: Response, _next: NextFunction) {
  try {
    const alert = await securityAlertService.investigate(req.params.id, req.user?.username || 'unknown');
    if (!alert) return res.status(404).json({ success: false, message: 'Alert not found' });
    return res.json({ success: true, data: alert });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: 'Failed to update alert', error: error.message });
  }
}

/**
 * PATCH /:id/resolve
 */
export async function resolveAlert(req: AuthRequest, res: Response, _next: NextFunction) {
  try {
    const alert = await securityAlertService.resolve(req.params.id, req.user?.username || 'unknown');
    if (!alert) return res.status(404).json({ success: false, message: 'Alert not found' });
    return res.json({ success: true, data: alert });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: 'Failed to resolve alert', error: error.message });
  }
}

/**
 * PATCH /:id/false-positive
 */
export async function markFalsePositive(req: AuthRequest, res: Response, _next: NextFunction) {
  try {
    const alert = await securityAlertService.markFalsePositive(req.params.id, req.user?.username || 'unknown');
    if (!alert) return res.status(404).json({ success: false, message: 'Alert not found' });
    return res.json({ success: true, data: alert });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: 'Failed to update alert', error: error.message });
  }
}

/**
 * PATCH /:id/note — add investigation note
 */
export async function addAlertNote(req: AuthRequest, res: Response, _next: NextFunction) {
  try {
    const { text } = req.body;
    if (!text || typeof text !== 'string' || text.trim().length === 0) {
      return res.status(400).json({ success: false, message: 'Note text is required' });
    }
    if (text.length > 2000) {
      return res.status(400).json({ success: false, message: 'Note text must be 2000 characters or less' });
    }

    const alert = await securityAlertService.addNote(
      req.params.id,
      req.user?.userId || '',
      req.user?.username || 'unknown',
      text.trim(),
    );
    if (!alert) return res.status(404).json({ success: false, message: 'Alert not found' });
    return res.json({ success: true, data: alert });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: 'Failed to add note', error: error.message });
  }
}
