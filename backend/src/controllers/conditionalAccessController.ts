/**
 * Conditional Access Policy Controller
 *
 * CRUD + toggle for conditional access policies.
 * Policies are compound rules: conditions → action.
 */
import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth';
import { ConditionalAccessPolicy } from '../models/ConditionalAccessPolicy';

const VALID_SIGNALS = ['role', 'ip_range', 'time_of_day', 'device_trusted', 'country'];
const VALID_OPERATORS = ['in', 'not_in', 'equals', 'not_equals', 'between', 'not_between'];
const VALID_ACTIONS = ['allow', 'block', 'require_mfa', 'notify_admin'];

function validateConditions(conditions: any[]): string | null {
  if (!Array.isArray(conditions) || conditions.length === 0) return 'At least one condition is required';
  for (const c of conditions) {
    if (!c.signal || !VALID_SIGNALS.includes(c.signal)) return `Invalid signal: ${c.signal}`;
    if (!c.operator || !VALID_OPERATORS.includes(c.operator)) return `Invalid operator: ${c.operator}`;
    if (c.value === undefined || c.value === null) return 'Condition value is required';
  }
  return null;
}

/**
 * GET / — list all policies
 */
export async function getPolicies(req: AuthRequest, res: Response, _next: NextFunction) {
  try {
    const filter: Record<string, any> = {};
    if (req.query.active === 'true') filter.isActive = true;
    if (req.query.active === 'false') filter.isActive = false;

    const policies = await ConditionalAccessPolicy.find(filter)
      .sort({ priority: 1, createdAt: -1 })
      .lean();

    return res.json({ success: true, data: policies });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: 'Failed to fetch policies', error: error.message });
  }
}

/**
 * GET /:id — single policy
 */
export async function getPolicyById(req: AuthRequest, res: Response, _next: NextFunction) {
  try {
    const policy = await ConditionalAccessPolicy.findById(req.params.id).lean();
    if (!policy) return res.status(404).json({ success: false, message: 'Policy not found' });
    return res.json({ success: true, data: policy });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: 'Failed to fetch policy', error: error.message });
  }
}

/**
 * POST / — create policy
 */
export async function createPolicy(req: AuthRequest, res: Response, _next: NextFunction) {
  try {
    const { name, description, conditions, action, priority } = req.body;

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return res.status(400).json({ success: false, message: 'Policy name is required' });
    }
    if (!action || !VALID_ACTIONS.includes(action)) {
      return res.status(400).json({ success: false, message: 'Invalid action' });
    }
    const condErr = validateConditions(conditions);
    if (condErr) return res.status(400).json({ success: false, message: condErr });

    const policy = await ConditionalAccessPolicy.create({
      name: name.trim().slice(0, 200),
      description: description?.trim().slice(0, 1000) || '',
      conditions,
      action,
      priority: typeof priority === 'number' ? Math.max(0, Math.min(1000, priority)) : 100,
      isActive: true,
      createdBy: req.user?.username || 'unknown',
    });

    return res.status(201).json({ success: true, data: policy });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: 'Failed to create policy', error: error.message });
  }
}

/**
 * PUT /:id — update policy
 */
export async function updatePolicy(req: AuthRequest, res: Response, _next: NextFunction) {
  try {
    const { name, description, conditions, action, priority } = req.body;
    const update: Record<string, any> = { updatedBy: req.user?.username || 'unknown' };

    if (name !== undefined) {
      if (typeof name !== 'string' || name.trim().length === 0) {
        return res.status(400).json({ success: false, message: 'Policy name cannot be empty' });
      }
      update.name = name.trim().slice(0, 200);
    }
    if (description !== undefined) update.description = (description || '').trim().slice(0, 1000);
    if (conditions !== undefined) {
      const condErr = validateConditions(conditions);
      if (condErr) return res.status(400).json({ success: false, message: condErr });
      update.conditions = conditions;
    }
    if (action !== undefined) {
      if (!VALID_ACTIONS.includes(action)) return res.status(400).json({ success: false, message: 'Invalid action' });
      update.action = action;
    }
    if (typeof priority === 'number') update.priority = Math.max(0, Math.min(1000, priority));

    const policy = await ConditionalAccessPolicy.findByIdAndUpdate(req.params.id, update, { new: true }).lean();
    if (!policy) return res.status(404).json({ success: false, message: 'Policy not found' });
    return res.json({ success: true, data: policy });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: 'Failed to update policy', error: error.message });
  }
}

/**
 * PATCH /:id/toggle — activate / deactivate
 */
export async function togglePolicy(req: AuthRequest, res: Response, _next: NextFunction) {
  try {
    const policy = await ConditionalAccessPolicy.findById(req.params.id);
    if (!policy) return res.status(404).json({ success: false, message: 'Policy not found' });

    policy.isActive = !policy.isActive;
    policy.updatedBy = req.user?.username || 'unknown';
    await policy.save();

    return res.json({ success: true, data: policy });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: 'Failed to toggle policy', error: error.message });
  }
}

/**
 * DELETE /:id — remove policy
 */
export async function deletePolicy(req: AuthRequest, res: Response, _next: NextFunction) {
  try {
    const policy = await ConditionalAccessPolicy.findByIdAndDelete(req.params.id).lean();
    if (!policy) return res.status(404).json({ success: false, message: 'Policy not found' });
    return res.json({ success: true, message: 'Policy deleted' });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: 'Failed to delete policy', error: error.message });
  }
}
