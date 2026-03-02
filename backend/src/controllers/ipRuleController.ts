import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { IPRule } from '../models/IPRule';
import { ApiError } from '../middleware/errorHandler';
import { isValidIPv4, evaluateIP, refreshIPRuleCache } from '../middleware/ipFilter';
import logger from '../utils/logger';
import AuditService from '../utils/auditService';

/**
 * GET /api/v1/system-admin/ip-rules
 * Returns all IP rules (super_admin only)
 */
export const getRules = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const rules = await IPRule.find({}).sort({ type: 1, isActive: -1, createdAt: -1 });
    res.status(200).json({ success: true, data: rules });
  } catch (err) {
    logger.error('getRules error:', err);
    throw new ApiError(500, 'Failed to fetch IP rules');
  }
};

/**
 * POST /api/v1/system-admin/ip-rules
 * Create a new IP rule (super_admin only)
 */
export const createRule = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { ip, type, description, isActive } = req.body;

    if (!ip || typeof ip !== 'string') {
      throw new ApiError(400, 'IP address or CIDR is required');
    }
    if (!isValidIPv4(ip.trim())) {
      throw new ApiError(400, 'Invalid IP address or CIDR notation (IPv4 only, e.g. 192.168.1.1 or 10.0.0.0/8)');
    }
    if (!type || !['allow', 'block'].includes(type)) {
      throw new ApiError(400, 'Type must be "allow" or "block"');
    }

    const rule = await IPRule.create({
      ip: ip.trim(),
      type,
      description: description?.trim() || '',
      isActive: isActive !== false,
      createdBy: req.user?.username || 'system',
    });

    await refreshIPRuleCache();

    await AuditService.log({
      action: 'CONFIG_CHANGE',
      resourceType: 'ip_rule',
      resourceId: rule._id.toString(),
      userId: req.user?.userId || '',
      username: req.user?.username || '',
      details: `IP rule created: ${rule.type.toUpperCase()} ${rule.ip}`,
      severity: 'high',
      ipAddress: req.ip,
    });

    logger.info(`IP rule created: ${type} ${ip} by ${req.user?.username}`);
    res.status(201).json({ success: true, data: rule });
  } catch (err) {
    if (err instanceof ApiError) throw err;
    logger.error('createRule error:', err);
    throw new ApiError(500, 'Failed to create IP rule');
  }
};

/**
 * PUT /api/v1/system-admin/ip-rules/:id
 * Update an existing IP rule (super_admin only)
 */
export const updateRule = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { ip, type, description, isActive } = req.body;

    const rule = await IPRule.findById(id);
    if (!rule) throw new ApiError(404, 'IP rule not found');

    if (ip !== undefined) {
      if (!isValidIPv4(ip.trim())) {
        throw new ApiError(400, 'Invalid IP address or CIDR notation');
      }
      rule.ip = ip.trim();
    }
    if (type !== undefined) {
      if (!['allow', 'block'].includes(type)) throw new ApiError(400, 'Type must be "allow" or "block"');
      rule.type = type;
    }
    if (description !== undefined) rule.description = description.trim();
    if (isActive !== undefined) rule.isActive = Boolean(isActive);

    await rule.save();
    await refreshIPRuleCache();

    await AuditService.log({
      action: 'CONFIG_CHANGE',
      resourceType: 'ip_rule',
      resourceId: id,
      userId: req.user?.userId || '',
      username: req.user?.username || '',
      details: `IP rule updated: ${rule.type.toUpperCase()} ${rule.ip} (active: ${rule.isActive})`,
      severity: 'high',
      ipAddress: req.ip,
    });

    res.status(200).json({ success: true, data: rule });
  } catch (err) {
    if (err instanceof ApiError) throw err;
    logger.error('updateRule error:', err);
    throw new ApiError(500, 'Failed to update IP rule');
  }
};

/**
 * DELETE /api/v1/system-admin/ip-rules/:id
 * Delete an IP rule (super_admin only)
 */
export const deleteRule = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const rule = await IPRule.findByIdAndDelete(id);
    if (!rule) throw new ApiError(404, 'IP rule not found');

    await refreshIPRuleCache();

    await AuditService.log({
      action: 'DELETE',
      resourceType: 'ip_rule',
      resourceId: id,
      userId: req.user?.userId || '',
      username: req.user?.username || '',
      details: `IP rule deleted: ${rule.type.toUpperCase()} ${rule.ip}`,
      severity: 'high',
      ipAddress: req.ip,
    });

    res.status(200).json({ success: true, message: 'IP rule deleted' });
  } catch (err) {
    if (err instanceof ApiError) throw err;
    logger.error('deleteRule error:', err);
    throw new ApiError(500, 'Failed to delete IP rule');
  }
};

/**
 * PATCH /api/v1/system-admin/ip-rules/:id/toggle
 * Toggle active state of an IP rule (super_admin only)
 */
export const toggleRule = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const rule = await IPRule.findById(id);
    if (!rule) throw new ApiError(404, 'IP rule not found');

    rule.isActive = !rule.isActive;
    await rule.save();
    await refreshIPRuleCache();

    res.status(200).json({ success: true, data: rule });
  } catch (err) {
    if (err instanceof ApiError) throw err;
    logger.error('toggleRule error:', err);
    throw new ApiError(500, 'Failed to toggle IP rule');
  }
};

/**
 * POST /api/v1/system-admin/ip-rules/test
 * Test what verdict an IP would receive (super_admin only)
 */
export const testIP = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { ip } = req.body;
    if (!ip || typeof ip !== 'string') {
      throw new ApiError(400, 'IP address is required');
    }
    if (!isValidIPv4(ip.trim())) {
      throw new ApiError(400, 'Invalid IPv4 address');
    }

    const result = await evaluateIP(ip.trim());
    res.status(200).json({ success: true, data: { ip: ip.trim(), ...result } });
  } catch (err) {
    if (err instanceof ApiError) throw err;
    logger.error('testIP error:', err);
    throw new ApiError(500, 'Failed to test IP');
  }
};
