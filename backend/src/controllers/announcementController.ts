import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { SystemAnnouncement } from '../models/SystemAnnouncement';
import { ApiError } from '../middleware/errorHandler';
import logger from '../utils/logger';
import AuditService from '../utils/auditService';
import { emitAnnouncementEvent } from '../services/websocket';

/**
 * GET /api/v1/announcements/active
 * Returns active, non-expired announcements visible to the requesting user's role.
 * Available to ALL authenticated users.
 */
export const getActiveAnnouncements = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const now = new Date();
    const userRole = req.user?.role || '';

    const announcements = await SystemAnnouncement.find({
      isActive: true,
      showFrom: { $lte: now },
      $and: [
        { $or: [{ showUntil: null }, { showUntil: { $gt: now } }] },
        { $or: [{ targetRoles: { $size: 0 } }, { targetRoles: userRole }] },
      ],
    }).sort({ severity: -1, createdAt: -1 });

    res.status(200).json({
      success: true,
      data: announcements,
    });
  } catch (error) {
    logger.error('Error fetching active announcements:', error);
    throw error;
  }
};

/**
 * GET /api/v1/announcements
 * Returns ALL announcements (active + inactive + expired).
 * Super Admin only.
 */
export const getAllAnnouncements = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const announcements = await SystemAnnouncement.find().sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      data: announcements,
      total: announcements.length,
    });
  } catch (error) {
    logger.error('Error fetching all announcements:', error);
    throw error;
  }
};

/**
 * POST /api/v1/announcements
 * Create a new system announcement.
 * Super Admin only.
 */
export const createAnnouncement = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { title, message, severity, targetRoles, showFrom, showUntil, isDismissible, isActive } =
      req.body;

    if (!title || !message) {
      throw new ApiError(400, 'Title and message are required');
    }

    const announcement = await SystemAnnouncement.create({
      title: title.trim(),
      message: message.trim(),
      severity: severity || 'info',
      targetRoles: targetRoles || [],
      showFrom: showFrom ? new Date(showFrom) : new Date(),
      showUntil: showUntil ? new Date(showUntil) : null,
      isDismissible: isDismissible !== undefined ? isDismissible : true,
      isActive: isActive !== undefined ? isActive : true,
      createdBy: req.user?.username || 'system',
    });

    // Broadcast to all connected clients immediately
    emitAnnouncementEvent('created', announcement.toObject());

    await AuditService.log({
      action: 'CREATE',
      resourceType: 'config',
      resourceId: announcement._id.toString(),
      userId: req.user?.userId || 'system',
      username: req.user?.username || 'system',
      details: `Announcement created: "${announcement.title}" [${announcement.severity}]`,
      severity: 'medium',
      ipAddress: req.ip,
    });

    logger.info(`Announcement created by ${req.user?.username}: "${announcement.title}"`);

    res.status(201).json({
      success: true,
      message: 'Announcement created successfully',
      data: announcement,
    });
  } catch (error) {
    logger.error('Error creating announcement:', error);
    throw error;
  }
};

/**
 * PUT /api/v1/announcements/:id
 * Update an existing announcement.
 * Super Admin only.
 */
export const updateAnnouncement = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { title, message, severity, targetRoles, showFrom, showUntil, isDismissible, isActive } =
      req.body;

    const announcement = await SystemAnnouncement.findById(id);
    if (!announcement) {
      throw new ApiError(404, 'Announcement not found');
    }

    const before = announcement.toObject();

    if (title !== undefined) announcement.title = title.trim();
    if (message !== undefined) announcement.message = message.trim();
    if (severity !== undefined) announcement.severity = severity;
    if (targetRoles !== undefined) announcement.targetRoles = targetRoles;
    if (showFrom !== undefined) announcement.showFrom = new Date(showFrom);
    if (showUntil !== undefined)
      announcement.showUntil = showUntil ? new Date(showUntil) : null;
    if (isDismissible !== undefined) announcement.isDismissible = isDismissible;
    if (isActive !== undefined) announcement.isActive = isActive;

    await announcement.save();

    // Broadcast updated state to all clients
    emitAnnouncementEvent('updated', announcement.toObject());

    await AuditService.log({
      action: 'UPDATE',
      resourceType: 'config',
      resourceId: id,
      userId: req.user?.userId || 'system',
      username: req.user?.username || 'system',
      details: JSON.stringify({ before, after: announcement.toObject() }),
      severity: 'medium',
      ipAddress: req.ip,
    });

    res.status(200).json({
      success: true,
      message: 'Announcement updated successfully',
      data: announcement,
    });
  } catch (error) {
    logger.error('Error updating announcement:', error);
    throw error;
  }
};

/**
 * DELETE /api/v1/announcements/:id
 * Permanently delete an announcement.
 * Super Admin only.
 */
export const deleteAnnouncement = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const announcement = await SystemAnnouncement.findByIdAndDelete(id);
    if (!announcement) {
      throw new ApiError(404, 'Announcement not found');
    }

    // Broadcast deletion so clients remove the banner immediately
    emitAnnouncementEvent('deleted', { _id: id });

    await AuditService.log({
      action: 'DELETE',
      resourceType: 'config',
      resourceId: id,
      userId: req.user?.userId || 'system',
      username: req.user?.username || 'system',
      details: `Announcement deleted: "${announcement.title}"`,
      severity: 'medium',
      ipAddress: req.ip,
    });

    res.status(200).json({
      success: true,
      message: 'Announcement deleted successfully',
    });
  } catch (error) {
    logger.error('Error deleting announcement:', error);
    throw error;
  }
};

/**
 * PATCH /api/v1/announcements/:id/toggle
 * Toggle isActive on an announcement.
 * Super Admin only.
 */
export const toggleAnnouncement = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const announcement = await SystemAnnouncement.findById(id);
    if (!announcement) {
      throw new ApiError(404, 'Announcement not found');
    }

    announcement.isActive = !announcement.isActive;
    await announcement.save();

    emitAnnouncementEvent('updated', announcement.toObject());

    res.status(200).json({
      success: true,
      message: `Announcement ${announcement.isActive ? 'activated' : 'deactivated'} successfully`,
      data: announcement,
    });
  } catch (error) {
    logger.error('Error toggling announcement:', error);
    throw error;
  }
};
