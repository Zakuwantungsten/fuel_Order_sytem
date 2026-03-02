import { Request, Response } from 'express';
import { PrivilegeRequest } from '../models/PrivilegeRequest';
import { User } from '../models';
import { AuditService } from '../utils/auditService';
import { UserRole } from '../types';

/**
 * JIT Privilege Elevation Controller
 * Implements 4-eyes approval workflow for temporary privilege escalation.
 */

// Create a new privilege elevation request
export const createRequest = async (req: Request, res: Response): Promise<void> => {
  try {
    const currentUser = (req as any).user;
    const { targetRole, reason, durationMinutes } = req.body;

    if (!targetRole || !reason || !durationMinutes) {
      res.status(400).json({
        success: false,
        message: 'targetRole, reason, and durationMinutes are required',
      });
      return;
    }

    // Cannot request your own role or lower
    if (targetRole === currentUser.role) {
      res.status(400).json({
        success: false,
        message: 'Cannot request elevation to your current role',
      });
      return;
    }

    // Check for existing pending/active requests
    const existing = await PrivilegeRequest.findOne({
      requestedBy: currentUser._id,
      status: { $in: ['pending', 'active'] },
    });
    if (existing) {
      res.status(409).json({
        success: false,
        message: 'You already have a pending or active elevation request',
      });
      return;
    }

    const request = await PrivilegeRequest.create({
      requestedBy: currentUser._id,
      requestedByUsername: currentUser.username,
      targetRole,
      currentRole: currentUser.role,
      reason,
      durationMinutes: Math.min(Math.max(durationMinutes, 15), 480),
      status: 'pending',
    });

    await AuditService.log({
      action: 'CREATE',
      resourceType: 'privilege_request',
      resourceId: request._id.toString(),
      username: currentUser.username,
      ipAddress: req.ip || 'unknown',
      userAgent: req.get('User-Agent') || '',
      details: JSON.stringify({ targetRole, durationMinutes, reason }),
      severity: 'high',
      outcome: 'SUCCESS',
    });

    res.status(201).json({ success: true, data: request });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// List all privilege requests (super_admin only)
export const listRequests = async (req: Request, res: Response): Promise<void> => {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    const filter: any = {};
    if (status) filter.status = status;

    const skip = (Number(page) - 1) * Number(limit);
    const [requests, total] = await Promise.all([
      PrivilegeRequest.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit))
        .lean(),
      PrivilegeRequest.countDocuments(filter),
    ]);

    res.json({
      success: true,
      data: requests,
      pagination: { total, page: Number(page), limit: Number(limit) },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Approve a privilege request (4-eyes: different super_admin must approve)
export const approveRequest = async (req: Request, res: Response): Promise<void> => {
  try {
    const currentUser = (req as any).user;
    const { id } = req.params;

    const request = await PrivilegeRequest.findById(id);
    if (!request) {
      res.status(404).json({ success: false, message: 'Request not found' });
      return;
    }
    if (request.status !== 'pending') {
      res.status(400).json({ success: false, message: `Cannot approve a ${request.status} request` });
      return;
    }
    // 4-eyes: approver must be different from requester
    if (request.requestedBy.toString() === currentUser._id.toString()) {
      res.status(403).json({
        success: false,
        message: 'Cannot approve your own elevation request (4-eyes principle)',
      });
      return;
    }

    // Activate the elevation
    const now = new Date();
    const expiresAt = new Date(now.getTime() + request.durationMinutes * 60 * 1000);

    // Store original role and upgrade user
    const targetUser = await User.findById(request.requestedBy);
    if (!targetUser) {
      res.status(404).json({ success: false, message: 'Requesting user not found' });
      return;
    }

    request.status = 'active';
    request.approvedBy = currentUser._id;
    request.approvedByUsername = currentUser.username;
    request.approvedAt = now;
    request.activatedAt = now;
    request.expiresAt = expiresAt;
    request.originalRole = targetUser.role;
    await request.save();

    // Temporarily upgrade the user's role
    targetUser.role = request.targetRole as UserRole;
    await targetUser.save();

    await AuditService.log({
      action: 'ROLE_CHANGE',
      resourceType: 'privilege_request',
      resourceId: request._id.toString(),
      username: currentUser.username,
      ipAddress: req.ip || 'unknown',
      userAgent: req.get('User-Agent') || '',
      details: JSON.stringify({
        action: 'approve_elevation',
        targetUser: request.requestedByUsername,
        fromRole: request.currentRole,
        toRole: request.targetRole,
        expiresAt: expiresAt.toISOString(),
        durationMinutes: request.durationMinutes,
      }),
      severity: 'critical',
      outcome: 'SUCCESS',
    });

    res.json({
      success: true,
      message: `Elevation approved. ${request.requestedByUsername} now has ${request.targetRole} access until ${expiresAt.toISOString()}`,
      data: request,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Deny a privilege request
export const denyRequest = async (req: Request, res: Response): Promise<void> => {
  try {
    const currentUser = (req as any).user;
    const { id } = req.params;
    const { reason } = req.body;

    const request = await PrivilegeRequest.findById(id);
    if (!request) {
      res.status(404).json({ success: false, message: 'Request not found' });
      return;
    }
    if (request.status !== 'pending') {
      res.status(400).json({ success: false, message: `Cannot deny a ${request.status} request` });
      return;
    }

    request.status = 'denied';
    request.deniedBy = currentUser._id;
    request.deniedByUsername = currentUser.username;
    request.deniedAt = new Date();
    request.denialReason = reason || 'No reason provided';
    await request.save();

    await AuditService.log({
      action: 'UPDATE',
      resourceType: 'privilege_request',
      resourceId: request._id.toString(),
      username: currentUser.username,
      ipAddress: req.ip || 'unknown',
      userAgent: req.get('User-Agent') || '',
      details: JSON.stringify({ action: 'deny_elevation', targetUser: request.requestedByUsername, reason }),
      severity: 'high',
      outcome: 'SUCCESS',
    });

    res.json({ success: true, message: 'Elevation request denied', data: request });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Revoke an active elevation (immediately revert role)
export const revokeElevation = async (req: Request, res: Response): Promise<void> => {
  try {
    const currentUser = (req as any).user;
    const { id } = req.params;
    const { reason } = req.body;

    const request = await PrivilegeRequest.findById(id);
    if (!request) {
      res.status(404).json({ success: false, message: 'Request not found' });
      return;
    }
    if (request.status !== 'active') {
      res.status(400).json({ success: false, message: 'Can only revoke active elevations' });
      return;
    }

    // Revert user role
    const targetUser = await User.findById(request.requestedBy);
    if (targetUser && request.originalRole) {
      targetUser.role = request.originalRole as UserRole;
      await targetUser.save();
    }

    request.status = 'revoked';
    request.revokedBy = currentUser._id;
    request.revokedAt = new Date();
    request.revokeReason = reason || 'Manually revoked';
    await request.save();

    await AuditService.log({
      action: 'ROLE_CHANGE',
      resourceType: 'privilege_request',
      resourceId: request._id.toString(),
      username: currentUser.username,
      ipAddress: req.ip || 'unknown',
      userAgent: req.get('User-Agent') || '',
      details: JSON.stringify({
        action: 'revoke_elevation',
        targetUser: request.requestedByUsername,
        revertedTo: request.originalRole,
        reason,
      }),
      severity: 'critical',
      outcome: 'SUCCESS',
    });

    res.json({
      success: true,
      message: `Elevation revoked. ${request.requestedByUsername} reverted to ${request.originalRole}`,
      data: request,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Get my requests (for non-admin users)
export const getMyRequests = async (req: Request, res: Response): Promise<void> => {
  try {
    const currentUser = (req as any).user;
    const requests = await PrivilegeRequest.find({ requestedBy: currentUser._id })
      .sort({ createdAt: -1 })
      .limit(20)
      .lean();
    res.json({ success: true, data: requests });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};
