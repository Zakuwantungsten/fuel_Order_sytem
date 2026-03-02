import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { BreakGlassAccount } from '../models/BreakGlassAccount';
import { AuditService } from '../utils/auditService';

/**
 * Break-Glass Emergency Access Controller
 * Manages emergency admin accounts. Usage triggers critical alerts.
 */

// List all break-glass accounts (passwords never returned)
export const listAccounts = async (_req: Request, res: Response): Promise<void> => {
  try {
    const accounts = await BreakGlassAccount.find()
      .select('-passwordHash')
      .sort({ createdAt: -1 })
      .lean();
    res.json({ success: true, data: accounts });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Create a break-glass account
export const createAccount = async (req: Request, res: Response): Promise<void> => {
  try {
    const currentUser = (req as any).user;
    const { username, password, description, rotationIntervalDays } = req.body;

    if (!username || !password || !description) {
      res.status(400).json({
        success: false,
        message: 'username, password, and description are required',
      });
      return;
    }

    if (password.length < 20) {
      res.status(400).json({
        success: false,
        message: 'Break-glass passwords must be at least 20 characters (store offline securely)',
      });
      return;
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const now = new Date();
    const intervalDays = rotationIntervalDays || 90;

    const account = await BreakGlassAccount.create({
      username,
      passwordHash,
      description,
      isActive: false, // Must be explicitly activated
      createdBy: currentUser._id,
      createdByUsername: currentUser.username,
      lastRotatedAt: now,
      rotationIntervalDays: intervalDays,
      nextRotationDue: new Date(now.getTime() + intervalDays * 24 * 60 * 60 * 1000),
    });

    await AuditService.log({
      action: 'CREATE',
      resourceType: 'break_glass_account',
      resourceId: account._id.toString(),
      username: currentUser.username,
      ipAddress: req.ip || 'unknown',
      userAgent: req.get('User-Agent') || '',
      details: JSON.stringify({ breakGlassUsername: username, description }),
      severity: 'critical',
      outcome: 'SUCCESS',
    });

    // Return account without password
    const { passwordHash: _pw, ...safe } = account.toObject();
    res.status(201).json({ success: true, data: safe });
  } catch (error: any) {
    if (error.code === 11000) {
      res.status(409).json({ success: false, message: 'Break-glass username already exists' });
      return;
    }
    res.status(500).json({ success: false, message: error.message });
  }
};

// Toggle break-glass account active/inactive
export const toggleAccount = async (req: Request, res: Response): Promise<void> => {
  try {
    const currentUser = (req as any).user;
    const { id } = req.params;

    const account = await BreakGlassAccount.findById(id);
    if (!account) {
      res.status(404).json({ success: false, message: 'Account not found' });
      return;
    }

    account.isActive = !account.isActive;
    await account.save();

    await AuditService.log({
      action: 'UPDATE',
      resourceType: 'break_glass_account',
      resourceId: id,
      username: currentUser.username,
      ipAddress: req.ip || 'unknown',
      userAgent: req.get('User-Agent') || '',
      details: JSON.stringify({ 
        breakGlassUsername: account.username, 
        isActive: account.isActive,
        action: account.isActive ? 'activated' : 'deactivated',
      }),
      severity: 'critical',
      outcome: 'SUCCESS',
    });

    res.json({
      success: true,
      message: `Break-glass account ${account.isActive ? 'activated' : 'deactivated'}`,
      data: { isActive: account.isActive },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Rotate break-glass account password
export const rotatePassword = async (req: Request, res: Response): Promise<void> => {
  try {
    const currentUser = (req as any).user;
    const { id } = req.params;
    const { newPassword } = req.body;

    if (!newPassword || newPassword.length < 20) {
      res.status(400).json({
        success: false,
        message: 'New password must be at least 20 characters',
      });
      return;
    }

    const account = await BreakGlassAccount.findById(id);
    if (!account) {
      res.status(404).json({ success: false, message: 'Account not found' });
      return;
    }

    account.passwordHash = await bcrypt.hash(newPassword, 12);
    account.lastRotatedAt = new Date();
    account.nextRotationDue = new Date(Date.now() + account.rotationIntervalDays * 24 * 60 * 60 * 1000);
    await account.save();

    await AuditService.log({
      action: 'UPDATE',
      resourceType: 'break_glass_account',
      resourceId: id,
      username: currentUser.username,
      ipAddress: req.ip || 'unknown',
      userAgent: req.get('User-Agent') || '',
      details: JSON.stringify({ breakGlassUsername: account.username, action: 'password_rotated' }),
      severity: 'critical',
      outcome: 'SUCCESS',
    });

    res.json({
      success: true,
      message: 'Break-glass password rotated. Store the new password offline securely.',
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Delete a break-glass account
export const deleteAccount = async (req: Request, res: Response): Promise<void> => {
  try {
    const currentUser = (req as any).user;
    const { id } = req.params;

    const account = await BreakGlassAccount.findByIdAndDelete(id);
    if (!account) {
      res.status(404).json({ success: false, message: 'Account not found' });
      return;
    }

    await AuditService.log({
      action: 'DELETE',
      resourceType: 'break_glass_account',
      resourceId: id,
      username: currentUser.username,
      ipAddress: req.ip || 'unknown',
      userAgent: req.get('User-Agent') || '',
      details: JSON.stringify({ breakGlassUsername: account.username }),
      severity: 'critical',
      outcome: 'SUCCESS',
    });

    res.json({ success: true, message: 'Break-glass account deleted' });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};
