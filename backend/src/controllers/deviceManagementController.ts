/**
 * Device Management Controller
 * 
 * List, trust, and block known devices.
 * Also supports syncing device inventory from LoginActivity data.
 */
import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth';
import { KnownDevice } from '../models/KnownDevice';
import { LoginActivity } from '../models/LoginActivity';

/**
 * GET /system-admin/known-devices
 * Paginated list of known devices with optional filters.
 */
export async function getKnownDevices(req: AuthRequest, res: Response, _next: NextFunction) {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 50));
    const skip = (page - 1) * limit;

    const filter: Record<string, any> = {};
    if (req.query.userId) filter.userId = req.query.userId;
    if (req.query.trusted === 'true') filter.trusted = true;
    if (req.query.trusted === 'false') filter.trusted = false;
    if (req.query.blocked === 'true') filter.blocked = true;
    if (req.query.search) {
      const s = req.query.search as string;
      filter.$or = [
        { username: { $regex: s, $options: 'i' } },
        { browser: { $regex: s, $options: 'i' } },
        { os: { $regex: s, $options: 'i' } },
        { lastIP: { $regex: s, $options: 'i' } },
      ];
    }

    const [devices, total] = await Promise.all([
      KnownDevice.find(filter).sort({ lastSeen: -1 }).skip(skip).limit(limit).lean(),
      KnownDevice.countDocuments(filter),
    ]);

    return res.json({
      success: true,
      data: {
        devices,
        total,
        page,
        limit,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: 'Failed to fetch devices', error: error.message });
  }
}

/**
 * GET /system-admin/known-devices/stats
 * Quick stats for the device management panel.
 */
export async function getDeviceStats(_req: AuthRequest, res: Response, _next: NextFunction) {
  try {
    const [total, trusted, blocked, newDevices] = await Promise.all([
      KnownDevice.countDocuments(),
      KnownDevice.countDocuments({ trusted: true }),
      KnownDevice.countDocuments({ blocked: true }),
      KnownDevice.countDocuments({
        firstSeen: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
      }),
    ]);

    // Device type breakdown
    const deviceTypes = await KnownDevice.aggregate([
      { $group: { _id: '$deviceType', count: { $sum: 1 } } },
    ]);

    return res.json({
      success: true,
      data: {
        total,
        trusted,
        blocked,
        newDevices,
        deviceTypes: Object.fromEntries(deviceTypes.map(d => [d._id, d.count])),
      },
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: 'Failed to fetch device stats', error: error.message });
  }
}

/**
 * PATCH /system-admin/known-devices/:id/trust
 */
export async function trustDevice(req: AuthRequest, res: Response, _next: NextFunction) {
  try {
    const device = await KnownDevice.findByIdAndUpdate(
      req.params.id,
      { trusted: true, blocked: false },
      { new: true },
    );
    if (!device) return res.status(404).json({ success: false, message: 'Device not found' });
    return res.json({ success: true, data: device });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: 'Failed to trust device', error: error.message });
  }
}

/**
 * PATCH /system-admin/known-devices/:id/block
 */
export async function blockDevice(req: AuthRequest, res: Response, _next: NextFunction) {
  try {
    const device = await KnownDevice.findByIdAndUpdate(
      req.params.id,
      { blocked: true, trusted: false },
      { new: true },
    );
    if (!device) return res.status(404).json({ success: false, message: 'Device not found' });
    return res.json({ success: true, data: device });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: 'Failed to block device', error: error.message });
  }
}

/**
 * PATCH /system-admin/known-devices/:id/untrust
 */
export async function untrustDevice(req: AuthRequest, res: Response, _next: NextFunction) {
  try {
    const device = await KnownDevice.findByIdAndUpdate(
      req.params.id,
      { trusted: false },
      { new: true },
    );
    if (!device) return res.status(404).json({ success: false, message: 'Device not found' });
    return res.json({ success: true, data: device });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: 'Failed to update device', error: error.message });
  }
}

/**
 * DELETE /system-admin/known-devices/:id
 */
export async function removeDevice(req: AuthRequest, res: Response, _next: NextFunction) {
  try {
    const device = await KnownDevice.findByIdAndDelete(req.params.id);
    if (!device) return res.status(404).json({ success: false, message: 'Device not found' });
    return res.json({ success: true, message: 'Device removed' });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: 'Failed to remove device', error: error.message });
  }
}

/**
 * POST /system-admin/known-devices/sync
 * Backfill device inventory from existing LoginActivity records.
 * Safe to run multiple times — uses upsert.
 */
export async function syncDevicesFromLoginActivity(_req: AuthRequest, res: Response, _next: NextFunction) {
  try {
    const pipeline = [
      {
        $group: {
          _id: { userId: '$userId', browser: '$browser', os: '$os' },
          deviceType: { $first: '$deviceType' },
          firstSeen: { $min: '$loginAt' },
          lastSeen: { $max: '$loginAt' },
          lastIP: { $last: '$ipAddress' },
          sessionCount: { $sum: 1 },
        },
      },
    ];

    const devices = await LoginActivity.aggregate(pipeline);

    // Resolve usernames
    const User = (await import('../models/User')).User;
    const userIds = [...new Set(devices.map(d => d._id.userId.toString()))];
    const users = await User.find({ _id: { $in: userIds } }).select('_id username').lean();
    const userMap = new Map(users.map(u => [u._id.toString(), u.username]));

    let synced = 0;
    for (const d of devices) {
      const username = userMap.get(d._id.userId.toString()) || 'unknown';
      await KnownDevice.findOneAndUpdate(
        { userId: d._id.userId, browser: d._id.browser, os: d._id.os },
        {
          $set: { lastSeen: d.lastSeen, lastIP: d.lastIP, deviceType: d.deviceType, username },
          $max: { sessionCount: d.sessionCount },
          $setOnInsert: { firstSeen: d.firstSeen, trusted: false, blocked: false },
        },
        { upsert: true },
      );
      synced++;
    }

    return res.json({ success: true, data: { synced } });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: 'Sync failed', error: error.message });
  }
}
