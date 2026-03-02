import { Request, Response } from 'express';
import { DLPRule } from '../models/DLPRule';
import { AuditService } from '../utils/auditService';

/**
 * Data Loss Prevention (DLP) Controls Controller
 */

// List all DLP rules
export const listRules = async (req: Request, res: Response): Promise<void> => {
  try {
    const rules = await DLPRule.find().sort({ createdAt: -1 }).lean();
    res.json({ success: true, data: rules });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Create a new DLP rule
export const createRule = async (req: Request, res: Response): Promise<void> => {
  try {
    const currentUser = (req as any).user;
    const { name, description, ruleType, maxRecords, allowedHoursStart, allowedHoursEnd, allowedRoles, blockedRoles, restrictedFields, appliesTo, action } = req.body;

    if (!name || !ruleType || !appliesTo || !appliesTo.length) {
      res.status(400).json({
        success: false,
        message: 'name, ruleType, and appliesTo are required',
      });
      return;
    }

    const rule = await DLPRule.create({
      name,
      description,
      ruleType,
      maxRecords,
      allowedHoursStart,
      allowedHoursEnd,
      allowedRoles,
      blockedRoles,
      restrictedFields,
      appliesTo,
      action: action || 'block',
      createdBy: currentUser._id,
    });

    await AuditService.log({
      action: 'CREATE',
      resourceType: 'dlp_rule',
      resourceId: rule._id.toString(),
      username: currentUser.username,
      ipAddress: req.ip || 'unknown',
      userAgent: req.get('User-Agent') || '',
      details: JSON.stringify({ name, ruleType, appliesTo }),
      severity: 'high',
      outcome: 'SUCCESS',
    });

    res.status(201).json({ success: true, data: rule });
  } catch (error: any) {
    if (error.code === 11000) {
      res.status(409).json({ success: false, message: 'A DLP rule with this name already exists' });
      return;
    }
    res.status(500).json({ success: false, message: error.message });
  }
};

// Update a DLP rule
export const updateRule = async (req: Request, res: Response): Promise<void> => {
  try {
    const currentUser = (req as any).user;
    const { id } = req.params;
    const updates = req.body;

    const rule = await DLPRule.findByIdAndUpdate(
      id,
      { ...updates, updatedBy: currentUser._id },
      { new: true, runValidators: true }
    );

    if (!rule) {
      res.status(404).json({ success: false, message: 'DLP rule not found' });
      return;
    }

    await AuditService.log({
      action: 'UPDATE',
      resourceType: 'dlp_rule',
      resourceId: rule._id.toString(),
      username: currentUser.username,
      ipAddress: req.ip || 'unknown',
      userAgent: req.get('User-Agent') || '',
      details: JSON.stringify({ name: rule.name, updates: Object.keys(updates) }),
      severity: 'high',
      outcome: 'SUCCESS',
    });

    res.json({ success: true, data: rule });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Delete a DLP rule
export const deleteRule = async (req: Request, res: Response): Promise<void> => {
  try {
    const currentUser = (req as any).user;
    const { id } = req.params;

    const rule = await DLPRule.findByIdAndDelete(id);
    if (!rule) {
      res.status(404).json({ success: false, message: 'DLP rule not found' });
      return;
    }

    await AuditService.log({
      action: 'DELETE',
      resourceType: 'dlp_rule',
      resourceId: id,
      username: currentUser.username,
      ipAddress: req.ip || 'unknown',
      userAgent: req.get('User-Agent') || '',
      details: JSON.stringify({ name: rule.name }),
      severity: 'high',
      outcome: 'SUCCESS',
    });

    res.json({ success: true, message: 'DLP rule deleted' });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Toggle rule active/inactive
export const toggleRule = async (req: Request, res: Response): Promise<void> => {
  try {
    const currentUser = (req as any).user;
    const { id } = req.params;

    const rule = await DLPRule.findById(id);
    if (!rule) {
      res.status(404).json({ success: false, message: 'DLP rule not found' });
      return;
    }

    rule.isActive = !rule.isActive;
    rule.updatedBy = currentUser._id;
    await rule.save();

    await AuditService.log({
      action: 'UPDATE',
      resourceType: 'dlp_rule',
      resourceId: id,
      username: currentUser.username,
      ipAddress: req.ip || 'unknown',
      userAgent: req.get('User-Agent') || '',
      details: JSON.stringify({ name: rule.name, isActive: rule.isActive }),
      severity: 'high',
      outcome: 'SUCCESS',
    });

    res.json({ success: true, data: rule });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Get DLP violation stats
export const getStats = async (_req: Request, res: Response): Promise<void> => {
  try {
    const rules = await DLPRule.find().lean();
    const totalRules = rules.length;
    const activeRules = rules.filter(r => r.isActive).length;
    const totalTriggers = rules.reduce((sum, r) => sum + (r.triggerCount || 0), 0);
    const rulesByType = rules.reduce((acc: Record<string, number>, r) => {
      acc[r.ruleType] = (acc[r.ruleType] || 0) + 1;
      return acc;
    }, {});

    res.json({
      success: true,
      data: { totalRules, activeRules, totalTriggers, rulesByType },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};
