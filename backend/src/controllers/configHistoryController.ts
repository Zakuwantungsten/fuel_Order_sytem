import { Response } from 'express';
import type { AuthRequest } from '../middleware/auth';
import { SystemConfig } from '../models';
import SystemConfigSnapshot from '../models/SystemConfigSnapshot';

/**
 * GET /api/system-admin/config-history
 */
export const listSnapshots = async (req: AuthRequest, res: Response): Promise<void> => {
  const page = Math.max(Number(req.query.page) || 1, 1);
  const limit = Math.min(Number(req.query.limit) || 20, 100);
  const skip = (page - 1) * limit;

  const [snapshots, total] = await Promise.all([
    SystemConfigSnapshot.find({})
      .sort({ savedAt: -1 })
      .skip(skip)
      .limit(limit)
      .select('-snapshot')
      .lean(),
    SystemConfigSnapshot.countDocuments(),
  ]);

  res.json({ success: true, data: snapshots, total, page, pages: Math.ceil(total / limit) });
};

/**
 * GET /api/system-admin/config-history/:id
 */
export const getSnapshot = async (req: AuthRequest, res: Response): Promise<void> => {
  const snap = await SystemConfigSnapshot.findById(req.params.id).lean();
  if (!snap) {
    res.status(404).json({ success: false, message: 'Snapshot not found' });
    return;
  }
  res.json({ success: true, data: snap });
};

/**
 * POST /api/system-admin/config-history/snapshot
 * Manually save a snapshot of the current config
 */
export const takeSnapshot = async (req: AuthRequest, res: Response): Promise<void> => {
  const current = await SystemConfig.findOne().lean();
  if (!current) {
    res.status(404).json({ success: false, message: 'No system config found' });
    return;
  }

  const snap = await SystemConfigSnapshot.create({
    savedBy: req.user?.username || 'system',
    changeDescription: req.body.description?.trim() || 'Manual snapshot',
    snapshot: current,
  });

  res.status(201).json({ success: true, data: { _id: snap._id, savedBy: snap.savedBy, savedAt: snap.savedAt } });
};

