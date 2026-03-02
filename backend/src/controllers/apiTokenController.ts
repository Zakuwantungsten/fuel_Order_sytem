import { Response } from 'express';
import crypto from 'crypto';
import type { AuthRequest } from '../middleware/auth';
import ApiToken from '../models/ApiToken';
import { AuditService } from '../utils/auditService';

const AVAILABLE_SCOPES = ['read:orders', 'read:fuel', 'read:users', 'read:analytics', 'write:fuel'];

export const listTokens = async (req: AuthRequest, res: Response): Promise<void> => {
  const tokens = await ApiToken.find({}).sort({ createdAt: -1 }).select('-tokenHash').lean();
  res.json({ success: true, data: tokens, scopes: AVAILABLE_SCOPES });
};

export const createToken = async (req: AuthRequest, res: Response): Promise<void> => {
  const { name, description, expiresInDays, scopes } = req.body;
  if (!name?.trim()) {
    res.status(400).json({ success: false, message: 'name is required' });
    return;
  }

  // Validate scopes
  const validScopes = (Array.isArray(scopes) ? scopes : []).filter((s: string) => AVAILABLE_SCOPES.includes(s));

  // Generate token: format "foa_<random 40 hex chars>"
  const rawToken = `foa_${crypto.randomBytes(20).toString('hex')}`;
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
  const tokenPrefix = rawToken.slice(0, 12);

  const expiresAt = expiresInDays && Number(expiresInDays) > 0
    ? new Date(Date.now() + Number(expiresInDays) * 86_400_000)
    : undefined;

  const token = await ApiToken.create({
    name: name.trim(),
    description: description?.trim(),
    tokenHash,
    tokenPrefix,
    createdBy: req.user?.username || 'system',
    expiresAt,
    scopes: validScopes,
  });

  await AuditService.log({
    userId: req.user?.userId,
    username: req.user?.username || 'system',
    action: 'CREATE',
    resourceType: 'api_token',
    resourceId: token._id.toString(),
    details: `API token "${name}" created with scopes: ${validScopes.join(', ') || 'none'}`,
    severity: 'high',
    ipAddress: req.ip,
  });

  // Return the raw token ONCE — never again
  res.status(201).json({
    success: true,
    data: { ...token.toObject(), rawToken },
    message: 'Token created. Copy the token now — it will not be shown again.',
  });
};

export const revokeToken = async (req: AuthRequest, res: Response): Promise<void> => {
  const { id } = req.params;
  const token = await ApiToken.findById(id);
  if (!token) {
    res.status(404).json({ success: false, message: 'Token not found' });
    return;
  }
  token.revoked = true;
  token.revokedAt = new Date();
  token.revokedBy = req.user?.username || 'system';
  await token.save();

  await AuditService.log({
    userId: req.user?.userId,
    username: req.user?.username || 'system',
    action: 'DELETE',
    resourceType: 'api_token',
    resourceId: id,
    details: `API token "${token.name}" revoked`,
    severity: 'high',
    ipAddress: req.ip,
  });

  res.json({ success: true, message: 'Token revoked' });
};

