/**
 * Firewall Controller
 *
 * Handles all /api/v1/system-admin/firewall/* endpoints.
 *
 * Sections:
 *  - Path Rules  (CRUD)          → /path-rules
 *  - CORS Policy (singleton)     → /cors
 *  - Security Headers (singleton)→ /security-headers
 *  - Honeypot Config (singleton) → /honeypot-config
 *  - Bot Protection (singleton)  → /bot-protection
 *  - Network Zones (CRUD)        → /network-zones
 *  - TLS Policy (singleton)      → /tls
 *  - DDoS Config (singleton)     → /ddos
 *  - Egress Rules (CRUD)         → /egress-rules
 */
import { Response } from 'express';
import mongoose from 'mongoose';
import { AuthRequest } from '../middleware/auth';
import { ApiError } from '../middleware/errorHandler';
import { FirewallPathRule } from '../models/FirewallPathRule';
import { FirewallConfig } from '../models/FirewallConfig';
import { NetworkZone } from '../models/NetworkZone';
import { EgressFilterRule } from '../models/EgressFilterRule';
import AuditService from '../utils/auditService';
import logger from '../utils/logger';

/* ─── helpers ─────────────────────────────────────────────────────────────── */

const VALID_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD'];

const cidrRegex = /^(\d{1,3}\.){3}\d{1,3}(\/\d{1,2})?$/;

/** Upsert + return a singleton config document by key with defaults merged in */
async function getOrCreateConfig<T extends Record<string, unknown>>(
  key: string,
  defaults: T,
): Promise<T> {
  const doc = await FirewallConfig.findOne({ key });
  if (!doc) return defaults;
  return { ...defaults, ...doc.value } as T;
}

async function saveConfig(key: string, value: Record<string, unknown>, updatedBy: string): Promise<void> {
  await FirewallConfig.findOneAndUpdate(
    { key },
    { $set: { value, updatedBy } },
    { upsert: true, new: true },
  );
}

/* ══════════════════════════════════════════════════════════════════
 *  PATH RULES
 * ══════════════════════════════════════════════════════════════════ */

export const getPathRules = async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const rules = await FirewallPathRule.find({}).sort({ isActive: -1, createdAt: -1 });
    res.status(200).json({ success: true, data: rules });
  } catch (err) {
    logger.error('getPathRules error:', err);
    throw new ApiError(500, 'Failed to fetch path rules');
  }
};

export const createPathRule = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { pattern, action, methods, description, isActive } = req.body;
    if (!pattern || typeof pattern !== 'string') throw new ApiError(400, 'URL pattern is required');
    if (!action || !['block', 'allow', 'log'].includes(action)) throw new ApiError(400, 'Action must be block, allow, or log');
    if (methods && !Array.isArray(methods)) throw new ApiError(400, 'methods must be an array');
    if (methods?.some((m: string) => !VALID_METHODS.includes(m))) throw new ApiError(400, 'Invalid HTTP method');

    const rule = await FirewallPathRule.create({
      pattern: pattern.trim(),
      action,
      methods: methods ?? [],
      description: description?.trim() ?? '',
      isActive: isActive !== false,
      createdBy: req.user?.username ?? 'system',
    });

    await AuditService.log({
      action: 'CONFIG_CHANGE',
      resourceType: 'firewall_path_rule',
      resourceId: rule._id.toString(),
      userId: req.user?.userId ?? '',
      username: req.user?.username ?? '',
      details: `Firewall path rule created: ${action.toUpperCase()} ${pattern}`,
      severity: 'medium',
      ipAddress: req.ip,
    });

    res.status(201).json({ success: true, data: rule });
  } catch (err) {
    if (err instanceof ApiError) throw err;
    logger.error('createPathRule error:', err);
    throw new ApiError(500, 'Failed to create path rule');
  }
};

export const updatePathRule = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    if (!id || !mongoose.isValidObjectId(id)) throw new ApiError(400, 'Invalid rule ID');
    const { pattern, action, methods, description, isActive } = req.body;

    if (action && !['block', 'allow', 'log'].includes(action)) throw new ApiError(400, 'Invalid action');
    if (methods && !Array.isArray(methods)) throw new ApiError(400, 'methods must be an array');
    if (methods?.some((m: string) => !VALID_METHODS.includes(m))) throw new ApiError(400, 'Invalid HTTP method');

    const rule = await FirewallPathRule.findById(id);
    if (!rule) throw new ApiError(404, 'Path rule not found');

    if (pattern !== undefined) rule.pattern = pattern.trim();
    if (action !== undefined) rule.action = action;
    if (methods !== undefined) rule.methods = methods;
    if (description !== undefined) rule.description = description.trim();
    if (isActive !== undefined) rule.isActive = isActive;

    await rule.save();

    await AuditService.log({
      action: 'CONFIG_CHANGE',
      resourceType: 'firewall_path_rule',
      resourceId: rule._id.toString(),
      userId: req.user?.userId ?? '',
      username: req.user?.username ?? '',
      details: `Firewall path rule updated: ${rule.action.toUpperCase()} ${rule.pattern}`,
      severity: 'medium',
      ipAddress: req.ip,
    });

    res.status(200).json({ success: true, data: rule });
  } catch (err) {
    if (err instanceof ApiError) throw err;
    logger.error('updatePathRule error:', err);
    throw new ApiError(500, 'Failed to update path rule');
  }
};

export const deletePathRule = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    if (!id || !mongoose.isValidObjectId(id)) throw new ApiError(400, 'Invalid rule ID');
    const rule = await FirewallPathRule.findByIdAndDelete(id);
    if (!rule) throw new ApiError(404, 'Path rule not found');

    await AuditService.log({
      action: 'CONFIG_CHANGE',
      resourceType: 'firewall_path_rule',
      resourceId: id,
      userId: req.user?.userId ?? '',
      username: req.user?.username ?? '',
      details: `Firewall path rule deleted: ${rule.pattern}`,
      severity: 'medium',
      ipAddress: req.ip,
    });

    res.status(200).json({ success: true, message: 'Path rule deleted' });
  } catch (err) {
    if (err instanceof ApiError) throw err;
    logger.error('deletePathRule error:', err);
    throw new ApiError(500, 'Failed to delete path rule');
  }
};

export const togglePathRule = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    if (!id || !mongoose.isValidObjectId(id)) throw new ApiError(400, 'Invalid rule ID');
    const rule = await FirewallPathRule.findById(id);
    if (!rule) throw new ApiError(404, 'Path rule not found');
    rule.isActive = !rule.isActive;
    await rule.save();

    await AuditService.log({
      userId: req.user?.userId,
      username: req.user?.username || 'system',
      action: 'UPDATE',
      resourceType: 'FirewallPathRule',
      resourceId: id,
      details: `Firewall path rule for "${rule.pattern}" ${rule.isActive ? 'enabled' : 'disabled'} by ${req.user?.username}`,
      ipAddress: req.ip,
      severity: 'medium',
    });

    res.status(200).json({ success: true, data: rule });
  } catch (err) {
    if (err instanceof ApiError) throw err;
    logger.error('togglePathRule error:', err);
    throw new ApiError(500, 'Failed to toggle path rule');
  }
};

/* ══════════════════════════════════════════════════════════════════
 *  CORS POLICY
 * ══════════════════════════════════════════════════════════════════ */

const CORS_KEY = 'cors';
const DEFAULT_CORS = {
  enabled: true,
  allowedOrigins: '',
  allowedMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: 'Content-Type, Authorization, X-Requested-With',
  exposeHeaders: '',
  allowCredentials: true,
  maxAge: 86400,
};

export const getCorsConfig = async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const data = await getOrCreateConfig(CORS_KEY, DEFAULT_CORS);
    res.status(200).json({ success: true, data });
  } catch (err) {
    logger.error('getCorsConfig error:', err);
    throw new ApiError(500, 'Failed to fetch CORS config');
  }
};

export const saveCorsConfig = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { enabled, allowedOrigins, allowedMethods, allowedHeaders, exposeHeaders, allowCredentials, maxAge } = req.body;
    const value = {
      enabled: !!enabled,
      allowedOrigins: typeof allowedOrigins === 'string' ? allowedOrigins.trim() : '',
      allowedMethods: Array.isArray(allowedMethods) ? allowedMethods : DEFAULT_CORS.allowedMethods,
      allowedHeaders: typeof allowedHeaders === 'string' ? allowedHeaders.trim() : DEFAULT_CORS.allowedHeaders,
      exposeHeaders: typeof exposeHeaders === 'string' ? exposeHeaders.trim() : '',
      allowCredentials: !!allowCredentials,
      maxAge: typeof maxAge === 'number' ? Math.max(0, Math.min(86400, maxAge)) : DEFAULT_CORS.maxAge,
    };
    await saveConfig(CORS_KEY, value, req.user?.username ?? 'system');

    await AuditService.log({
      action: 'CONFIG_CHANGE',
      resourceType: 'firewall_cors',
      resourceId: CORS_KEY,
      userId: req.user?.userId ?? '',
      username: req.user?.username ?? '',
      details: `CORS policy updated. Enabled: ${value.enabled}`,
      severity: 'medium',
      ipAddress: req.ip,
    });

    res.status(200).json({ success: true, data: value, message: 'CORS policy saved' });
  } catch (err) {
    if (err instanceof ApiError) throw err;
    logger.error('saveCorsConfig error:', err);
    throw new ApiError(500, 'Failed to save CORS config');
  }
};

/* ══════════════════════════════════════════════════════════════════
 *  SECURITY HEADERS
 * ══════════════════════════════════════════════════════════════════ */

const HEADERS_KEY = 'security_headers';
const DEFAULT_HEADERS = {
  hstsEnabled: true,
  hstsMaxAge: 31536000,
  hstsIncludeSubdomains: true,
  hstsPreload: false,
  xFrameOptions: 'DENY',
  xContentTypeOptions: true,
  referrerPolicy: 'strict-origin-when-cross-origin',
  cspEnabled: false,
  cspDirectives: "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:;",
  permissionsPolicyEnabled: false,
  permissionsPolicy: 'camera=(), microphone=(), geolocation=()',
};

export const getSecurityHeaders = async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const data = await getOrCreateConfig(HEADERS_KEY, DEFAULT_HEADERS);
    res.status(200).json({ success: true, data });
  } catch (err) {
    logger.error('getSecurityHeaders error:', err);
    throw new ApiError(500, 'Failed to fetch security headers config');
  }
};

export const saveSecurityHeaders = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const merged = { ...DEFAULT_HEADERS, ...req.body };
    const value: Record<string, unknown> = {
      hstsEnabled: !!merged.hstsEnabled,
      hstsMaxAge: typeof merged.hstsMaxAge === 'number' ? merged.hstsMaxAge : 31536000,
      hstsIncludeSubdomains: !!merged.hstsIncludeSubdomains,
      hstsPreload: !!merged.hstsPreload,
      xFrameOptions: ['DENY', 'SAMEORIGIN', 'disabled'].includes(merged.xFrameOptions) ? merged.xFrameOptions : 'DENY',
      xContentTypeOptions: !!merged.xContentTypeOptions,
      referrerPolicy: typeof merged.referrerPolicy === 'string' ? merged.referrerPolicy : DEFAULT_HEADERS.referrerPolicy,
      cspEnabled: !!merged.cspEnabled,
      cspDirectives: typeof merged.cspDirectives === 'string' ? merged.cspDirectives.trim() : DEFAULT_HEADERS.cspDirectives,
      permissionsPolicyEnabled: !!merged.permissionsPolicyEnabled,
      permissionsPolicy: typeof merged.permissionsPolicy === 'string' ? merged.permissionsPolicy.trim() : DEFAULT_HEADERS.permissionsPolicy,
    };
    await saveConfig(HEADERS_KEY, value, req.user?.username ?? 'system');

    await AuditService.log({
      action: 'CONFIG_CHANGE',
      resourceType: 'firewall_security_headers',
      resourceId: HEADERS_KEY,
      userId: req.user?.userId ?? '',
      username: req.user?.username ?? '',
      details: `Security headers config updated`,
      severity: 'medium',
      ipAddress: req.ip,
    });

    res.status(200).json({ success: true, data: value, message: 'Security headers saved' });
  } catch (err) {
    if (err instanceof ApiError) throw err;
    logger.error('saveSecurityHeaders error:', err);
    throw new ApiError(500, 'Failed to save security headers');
  }
};

/* ══════════════════════════════════════════════════════════════════
 *  HONEYPOT CONFIG (admin-managed list of trap paths)
 * ══════════════════════════════════════════════════════════════════ */

const HONEYPOT_CONFIG_KEY = 'honeypot_config';
const DEFAULT_HONEYPOT_CONFIG = {
  enabled: true,
  paths: [] as { path: string; action: 'block' | 'alert' | 'log'; description: string; isActive: boolean }[],
  autoBlockOnHit: true,
  autoBlockDurationMs: 3600000,
};

export const getHoneypotConfig = async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const data = await getOrCreateConfig(HONEYPOT_CONFIG_KEY, DEFAULT_HONEYPOT_CONFIG);
    res.status(200).json({ success: true, data });
  } catch (err) {
    logger.error('getHoneypotConfig error:', err);
    throw new ApiError(500, 'Failed to fetch honeypot config');
  }
};

export const saveHoneypotConfig = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { enabled, paths, autoBlockOnHit, autoBlockDurationMs } = req.body;
    if (paths !== undefined && !Array.isArray(paths)) throw new ApiError(400, 'paths must be an array');
    const cleanPaths = (Array.isArray(paths) ? paths : []).map((p: Record<string, unknown>) => ({
      path: typeof p.path === 'string' ? p.path.trim() : '',
      action: ['block', 'alert', 'log'].includes(p.action as string) ? p.action : 'block',
      description: typeof p.description === 'string' ? p.description.trim() : '',
      isActive: p.isActive !== false,
    })).filter((p: { path: string }) => p.path.length > 0);

    const value = {
      enabled: !!enabled,
      paths: cleanPaths,
      autoBlockOnHit: !!autoBlockOnHit,
      autoBlockDurationMs: typeof autoBlockDurationMs === 'number' ? autoBlockDurationMs : 3600000,
    };
    await saveConfig(HONEYPOT_CONFIG_KEY, value, req.user?.username ?? 'system');

    await AuditService.log({
      action: 'CONFIG_CHANGE',
      resourceType: 'firewall_honeypot',
      resourceId: HONEYPOT_CONFIG_KEY,
      userId: req.user?.userId ?? '',
      username: req.user?.username ?? '',
      details: `Honeypot config updated. ${cleanPaths.length} trap paths configured.`,
      severity: 'medium',
      ipAddress: req.ip,
    });

    res.status(200).json({ success: true, data: value, message: 'Honeypot config saved' });
  } catch (err) {
    if (err instanceof ApiError) throw err;
    logger.error('saveHoneypotConfig error:', err);
    throw new ApiError(500, 'Failed to save honeypot config');
  }
};

/* ══════════════════════════════════════════════════════════════════
 *  HONEYPOT PATHS — per-item CRUD  (used by FirewallTab UI)
 *  Routes: GET /honeypots · POST /honeypots
 *          PUT /honeypots/:id · DELETE /honeypots/:id
 * ══════════════════════════════════════════════════════════════════ */

type HoneypotEntry = {
  id: string;
  path: string;
  action: 'block' | 'alert' | 'log';
  description: string;
  isActive: boolean;
};

/** Auto-assigns stable IDs to any paths that were seeded without one, then returns the array. */
async function loadHoneypotPaths(): Promise<{ doc: InstanceType<typeof FirewallConfig> | null; paths: HoneypotEntry[] }> {
  const doc = await FirewallConfig.findOne({ key: HONEYPOT_CONFIG_KEY });
  if (!doc) return { doc: null, paths: [] };

  const config = doc.value as Record<string, unknown>;
  const raw: Record<string, unknown>[] = Array.isArray(config.paths) ? (config.paths as Record<string, unknown>[]) : [];

  let dirty = false;
  const paths: HoneypotEntry[] = raw.map((p) => {
    if (!p.id) {
      dirty = true;
      return { ...p, id: new mongoose.Types.ObjectId().toHexString() } as HoneypotEntry;
    }
    return p as HoneypotEntry;
  });

  if (dirty) {
    doc.value = { ...config, paths };
    doc.markModified('value');
    await doc.save();
  }

  return { doc, paths };
}

export const listHoneypots = async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { paths } = await loadHoneypotPaths();
    res.status(200).json({ success: true, data: paths });
  } catch (err) {
    logger.error('listHoneypots error:', err);
    throw new ApiError(500, 'Failed to fetch honeypot paths');
  }
};

export const addHoneypot = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { path: pathVal, action = 'block', description = '', isActive = true } = req.body as Record<string, unknown>;

    if (typeof pathVal !== 'string' || !pathVal.trim()) throw new ApiError(400, 'Path is required');
    if (!['block', 'alert', 'log'].includes(action as string)) throw new ApiError(400, 'Invalid action');

    const { doc, paths } = await loadHoneypotPaths();
    if (!doc) throw new ApiError(500, 'Honeypot config not initialised — restart the server to seed defaults');

    const newEntry: HoneypotEntry = {
      id: new mongoose.Types.ObjectId().toHexString(),
      path: pathVal.trim(),
      action: action as HoneypotEntry['action'],
      description: typeof description === 'string' ? description.trim() : '',
      isActive: isActive !== false,
    };

    const config = doc.value as Record<string, unknown>;
    doc.value = { ...config, paths: [...paths, newEntry] };
    doc.markModified('value');
    await doc.save();

    res.status(201).json({ success: true, data: newEntry });
  } catch (err) {
    if (err instanceof ApiError) throw err;
    logger.error('addHoneypot error:', err);
    throw new ApiError(500, 'Failed to add honeypot path');
  }
};

export const updateHoneypot = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { path: pathVal, action, description, isActive } = req.body as Record<string, unknown>;

    if (pathVal !== undefined && (typeof pathVal !== 'string' || !pathVal.trim())) {
      throw new ApiError(400, 'Path cannot be empty');
    }
    if (action !== undefined && !['block', 'alert', 'log'].includes(action as string)) {
      throw new ApiError(400, 'Invalid action');
    }

    const { doc, paths } = await loadHoneypotPaths();
    if (!doc) throw new ApiError(404, 'Honeypot config not found');

    const idx = paths.findIndex((p) => p.id === id);
    if (idx === -1) throw new ApiError(404, 'Honeypot path not found');

    paths[idx] = {
      ...paths[idx],
      ...(pathVal !== undefined ? { path: (pathVal as string).trim() } : {}),
      ...(action !== undefined ? { action: action as HoneypotEntry['action'] } : {}),
      ...(description !== undefined ? { description: (description as string).trim() } : {}),
      ...(isActive !== undefined ? { isActive: !!isActive } : {}),
    };

    const config = doc.value as Record<string, unknown>;
    doc.value = { ...config, paths };
    doc.markModified('value');
    await doc.save();

    res.status(200).json({ success: true, data: paths[idx] });
  } catch (err) {
    if (err instanceof ApiError) throw err;
    logger.error('updateHoneypot error:', err);
    throw new ApiError(500, 'Failed to update honeypot path');
  }
};

export const deleteHoneypot = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { doc, paths } = await loadHoneypotPaths();
    if (!doc) throw new ApiError(404, 'Honeypot config not found');

    const filtered = paths.filter((p) => p.id !== id);
    if (filtered.length === paths.length) throw new ApiError(404, 'Honeypot path not found');

    const config = doc.value as Record<string, unknown>;
    doc.value = { ...config, paths: filtered };
    doc.markModified('value');
    await doc.save();

    res.status(200).json({ success: true, message: 'Honeypot path removed' });
  } catch (err) {
    if (err instanceof ApiError) throw err;
    logger.error('deleteHoneypot error:', err);
    throw new ApiError(500, 'Failed to delete honeypot path');
  }
};

/* ══════════════════════════════════════════════════════════════════
 *  BOT PROTECTION
 * ══════════════════════════════════════════════════════════════════ */

const BOT_KEY = 'bot_protection';
const DEFAULT_BOT = {
  enabled: true,
  action: 'block',
  botScoreThreshold: 70,
  blockEmptyUA: false,
  challengeMode: false,
  userAgentBlocklist: [
    'masscan', 'zgrab', 'nmap', 'nikto', 'sqlmap', 'dirbuster',
    'curl/7.', 'python-requests', 'go-http-client', 'libwww-perl',
  ],
  userAgentAllowlist: [
    'Googlebot', 'Bingbot', 'Slurp', 'DuckDuckBot', 'Baiduspider',
    'YandexBot', 'facebot', 'Twitterbot', 'LinkedInBot',
  ],
};

export const getBotProtection = async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const data = await getOrCreateConfig(BOT_KEY, DEFAULT_BOT);
    res.status(200).json({ success: true, data });
  } catch (err) {
    logger.error('getBotProtection error:', err);
    throw new ApiError(500, 'Failed to fetch bot protection config');
  }
};

export const saveBotProtection = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { enabled, action, botScoreThreshold, blockEmptyUA, challengeMode, userAgentBlocklist, userAgentAllowlist } = req.body;
    if (action && !['block', 'challenge', 'log'].includes(action)) throw new ApiError(400, 'Invalid action');
    const value = {
      enabled: !!enabled,
      action: action ?? 'block',
      botScoreThreshold: typeof botScoreThreshold === 'number' ? Math.max(0, Math.min(100, botScoreThreshold)) : 70,
      blockEmptyUA: !!blockEmptyUA,
      challengeMode: !!challengeMode,
      userAgentBlocklist: Array.isArray(userAgentBlocklist) ? userAgentBlocklist.map(String) : DEFAULT_BOT.userAgentBlocklist,
      userAgentAllowlist: Array.isArray(userAgentAllowlist) ? userAgentAllowlist.map(String) : DEFAULT_BOT.userAgentAllowlist,
    };
    await saveConfig(BOT_KEY, value, req.user?.username ?? 'system');

    await AuditService.log({
      action: 'CONFIG_CHANGE',
      resourceType: 'firewall_bot_protection',
      resourceId: BOT_KEY,
      userId: req.user?.userId ?? '',
      username: req.user?.username ?? '',
      details: `Bot protection config updated. Enabled: ${value.enabled}, action: ${value.action}`,
      severity: 'medium',
      ipAddress: req.ip,
    });

    res.status(200).json({ success: true, data: value, message: 'Bot protection config saved' });
  } catch (err) {
    if (err instanceof ApiError) throw err;
    logger.error('saveBotProtection error:', err);
    throw new ApiError(500, 'Failed to save bot protection config');
  }
};

/* ══════════════════════════════════════════════════════════════════
 *  NETWORK ZONES
 * ══════════════════════════════════════════════════════════════════ */

export const getNetworkZones = async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const zones = await NetworkZone.find({}).sort({ isBuiltIn: -1, isActive: -1, name: 1 });
    res.status(200).json({ success: true, data: zones });
  } catch (err) {
    logger.error('getNetworkZones error:', err);
    throw new ApiError(500, 'Failed to fetch network zones');
  }
};

export const createNetworkZone = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { name, description, cidrs, color, isActive } = req.body;
    if (!name || typeof name !== 'string') throw new ApiError(400, 'Zone name is required');
    if (!Array.isArray(cidrs) || cidrs.length === 0) throw new ApiError(400, 'At least one CIDR or IP is required');
    if (cidrs.some((c: string) => !cidrRegex.test(c))) throw new ApiError(400, 'One or more CIDRs are invalid');

    const exists = await NetworkZone.findOne({ name: name.trim() });
    if (exists) throw new ApiError(409, 'A zone with this name already exists');

    const zone = await NetworkZone.create({
      name: name.trim(),
      description: description?.trim() ?? '',
      cidrs,
      color: color ?? '#6366f1',
      isBuiltIn: false,
      isActive: isActive !== false,
      createdBy: req.user?.username ?? 'system',
    });

    await AuditService.log({
      action: 'CONFIG_CHANGE',
      resourceType: 'network_zone',
      resourceId: zone._id.toString(),
      userId: req.user?.userId ?? '',
      username: req.user?.username ?? '',
      details: `Network zone created: ${zone.name} (${cidrs.length} CIDR(s))`,
      severity: 'medium',
      ipAddress: req.ip,
    });

    res.status(201).json({ success: true, data: zone });
  } catch (err) {
    if (err instanceof ApiError) throw err;
    logger.error('createNetworkZone error:', err);
    throw new ApiError(500, 'Failed to create network zone');
  }
};

export const updateNetworkZone = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { name, description, cidrs, color, isActive } = req.body;
    const zone = await NetworkZone.findById(id);
    if (!zone) throw new ApiError(404, 'Network zone not found');
    if (zone.isBuiltIn) throw new ApiError(403, 'Built-in zones cannot be modified');
    if (cidrs !== undefined) {
      if (!Array.isArray(cidrs) || cidrs.length === 0) throw new ApiError(400, 'At least one CIDR is required');
      if (cidrs.some((c: string) => !cidrRegex.test(c))) throw new ApiError(400, 'One or more CIDRs are invalid');
    }
    if (name !== undefined) zone.name = name.trim();
    if (description !== undefined) zone.description = description.trim();
    if (cidrs !== undefined) zone.cidrs = cidrs;
    if (color !== undefined) zone.color = color;
    if (isActive !== undefined) zone.isActive = isActive;
    await zone.save();

    await AuditService.log({
      action: 'CONFIG_CHANGE',
      resourceType: 'network_zone',
      resourceId: id,
      userId: req.user?.userId ?? '',
      username: req.user?.username ?? '',
      details: `Network zone updated: ${zone.name}`,
      severity: 'medium',
      ipAddress: req.ip,
    });

    res.status(200).json({ success: true, data: zone });
  } catch (err) {
    if (err instanceof ApiError) throw err;
    logger.error('updateNetworkZone error:', err);
    throw new ApiError(500, 'Failed to update network zone');
  }
};

export const deleteNetworkZone = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const zone = await NetworkZone.findById(id);
    if (!zone) throw new ApiError(404, 'Network zone not found');
    if (zone.isBuiltIn) throw new ApiError(403, 'Built-in zones cannot be deleted');
    await zone.deleteOne();

    await AuditService.log({
      action: 'CONFIG_CHANGE',
      resourceType: 'network_zone',
      resourceId: id,
      userId: req.user?.userId ?? '',
      username: req.user?.username ?? '',
      details: `Network zone deleted: ${zone.name}`,
      severity: 'medium',
      ipAddress: req.ip,
    });

    res.status(200).json({ success: true, message: 'Network zone deleted' });
  } catch (err) {
    if (err instanceof ApiError) throw err;
    logger.error('deleteNetworkZone error:', err);
    throw new ApiError(500, 'Failed to delete network zone');
  }
};

/* ══════════════════════════════════════════════════════════════════
 *  TLS POLICY
 * ══════════════════════════════════════════════════════════════════ */

const TLS_KEY = 'tls_policy';
const DEFAULT_TLS = {
  minVersion: 'TLS1.2',
  cipherPreset: 'modern',
  rejectSelfSigned: true,
  hstsPreloadEnabled: false,
  ocspStaplingEnabled: false,
};

export const getTlsPolicy = async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const data = await getOrCreateConfig(TLS_KEY, DEFAULT_TLS);
    res.status(200).json({ success: true, data });
  } catch (err) {
    logger.error('getTlsPolicy error:', err);
    throw new ApiError(500, 'Failed to fetch TLS policy');
  }
};

export const saveTlsPolicy = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { minVersion, cipherPreset, rejectSelfSigned, hstsPreloadEnabled, ocspStaplingEnabled } = req.body;
    if (minVersion && !['TLS1.0', 'TLS1.1', 'TLS1.2', 'TLS1.3'].includes(minVersion)) throw new ApiError(400, 'Invalid TLS version');
    if (cipherPreset && !['modern', 'intermediate', 'legacy'].includes(cipherPreset)) throw new ApiError(400, 'Invalid cipher preset');
    const value = {
      minVersion: minVersion ?? 'TLS1.2',
      cipherPreset: cipherPreset ?? 'modern',
      rejectSelfSigned: !!rejectSelfSigned,
      hstsPreloadEnabled: !!hstsPreloadEnabled,
      ocspStaplingEnabled: !!ocspStaplingEnabled,
    };
    await saveConfig(TLS_KEY, value, req.user?.username ?? 'system');

    await AuditService.log({
      action: 'CONFIG_CHANGE',
      resourceType: 'firewall_tls_policy',
      resourceId: TLS_KEY,
      userId: req.user?.userId ?? '',
      username: req.user?.username ?? '',
      details: `TLS policy updated. Min version: ${value.minVersion}, cipher preset: ${value.cipherPreset}`,
      severity: 'high',
      ipAddress: req.ip,
    });

    res.status(200).json({ success: true, data: value, message: 'TLS policy saved' });
  } catch (err) {
    if (err instanceof ApiError) throw err;
    logger.error('saveTlsPolicy error:', err);
    throw new ApiError(500, 'Failed to save TLS policy');
  }
};

/* ══════════════════════════════════════════════════════════════════
 *  DDOS / BURST PROTECTION
 * ══════════════════════════════════════════════════════════════════ */

const DDOS_KEY = 'ddos';
const DEFAULT_DDOS = {
  enabled: true,
  maxRequestsPerWindow: 500,
  windowMs: 60000,
  burstLimit: 100,
  blockDurationMs: 300000,
  perIPThreshold: 80,
  slowlorisTimeoutMs: 5000,
  maxPayloadSizeMB: 10,
  trustProxy: true,
};

export const getDdosConfig = async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const data = await getOrCreateConfig(DDOS_KEY, DEFAULT_DDOS);
    res.status(200).json({ success: true, data });
  } catch (err) {
    logger.error('getDdosConfig error:', err);
    throw new ApiError(500, 'Failed to fetch DDoS config');
  }
};

export const saveDdosConfig = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const merged = { ...DEFAULT_DDOS, ...req.body };
    const value = {
      enabled: !!merged.enabled,
      maxRequestsPerWindow: typeof merged.maxRequestsPerWindow === 'number' ? Math.max(1, merged.maxRequestsPerWindow) : 500,
      windowMs: typeof merged.windowMs === 'number' ? Math.max(1000, merged.windowMs) : 60000,
      burstLimit: typeof merged.burstLimit === 'number' ? Math.max(1, merged.burstLimit) : 100,
      blockDurationMs: typeof merged.blockDurationMs === 'number' ? Math.max(1000, merged.blockDurationMs) : 300000,
      perIPThreshold: typeof merged.perIPThreshold === 'number' ? Math.max(1, Math.min(100, merged.perIPThreshold)) : 80,
      slowlorisTimeoutMs: typeof merged.slowlorisTimeoutMs === 'number' ? merged.slowlorisTimeoutMs : 5000,
      maxPayloadSizeMB: typeof merged.maxPayloadSizeMB === 'number' ? Math.max(1, Math.min(100, merged.maxPayloadSizeMB)) : 10,
      trustProxy: !!merged.trustProxy,
    };
    await saveConfig(DDOS_KEY, value, req.user?.username ?? 'system');

    await AuditService.log({
      action: 'CONFIG_CHANGE',
      resourceType: 'firewall_ddos',
      resourceId: DDOS_KEY,
      userId: req.user?.userId ?? '',
      username: req.user?.username ?? '',
      details: `DDoS/burst protection config updated. Enabled: ${value.enabled}`,
      severity: 'high',
      ipAddress: req.ip,
    });

    res.status(200).json({ success: true, data: value, message: 'DDoS config saved' });
  } catch (err) {
    if (err instanceof ApiError) throw err;
    logger.error('saveDdosConfig error:', err);
    throw new ApiError(500, 'Failed to save DDoS config');
  }
};

/* ══════════════════════════════════════════════════════════════════
 *  EGRESS FILTER RULES
 * ══════════════════════════════════════════════════════════════════ */

export const getEgressRules = async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const rules = await EgressFilterRule.find({}).sort({ type: 1, isActive: -1, createdAt: -1 });
    res.status(200).json({ success: true, data: rules });
  } catch (err) {
    logger.error('getEgressRules error:', err);
    throw new ApiError(500, 'Failed to fetch egress rules');
  }
};

export const createEgressRule = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { type, target, targetType, port, protocol, description, isActive } = req.body;
    if (!target || typeof target !== 'string') throw new ApiError(400, 'Target is required');
    if (!['allow', 'block'].includes(type)) throw new ApiError(400, 'Type must be allow or block');
    if (!['domain', 'ip', 'cidr'].includes(targetType)) throw new ApiError(400, 'Invalid target type');
    if (targetType === 'cidr' && !cidrRegex.test(target)) throw new ApiError(400, 'Invalid CIDR notation');
    if (port !== undefined && port !== null && (typeof port !== 'number' || port < 0 || port > 65535)) {
      throw new ApiError(400, 'Port must be 0–65535');
    }

    const rule = await EgressFilterRule.create({
      type,
      target: target.trim(),
      targetType,
      port: port ?? null,
      protocol: protocol ?? 'any',
      description: description?.trim() ?? '',
      isActive: isActive !== false,
      createdBy: req.user?.username ?? 'system',
    });

    await AuditService.log({
      action: 'CONFIG_CHANGE',
      resourceType: 'egress_filter_rule',
      resourceId: rule._id.toString(),
      userId: req.user?.userId ?? '',
      username: req.user?.username ?? '',
      details: `Egress rule created: ${type.toUpperCase()} ${target}`,
      severity: 'medium',
      ipAddress: req.ip,
    });

    res.status(201).json({ success: true, data: rule });
  } catch (err) {
    if (err instanceof ApiError) throw err;
    logger.error('createEgressRule error:', err);
    throw new ApiError(500, 'Failed to create egress rule');
  }
};

export const updateEgressRule = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { type, target, targetType, port, protocol, description, isActive } = req.body;
    const rule = await EgressFilterRule.findById(id);
    if (!rule) throw new ApiError(404, 'Egress rule not found');
    if (type !== undefined && !['allow', 'block'].includes(type)) throw new ApiError(400, 'Invalid type');
    if (targetType !== undefined && !['domain', 'ip', 'cidr'].includes(targetType)) throw new ApiError(400, 'Invalid target type');

    if (type !== undefined) rule.type = type;
    if (target !== undefined) rule.target = target.trim();
    if (targetType !== undefined) rule.targetType = targetType;
    if (port !== undefined) rule.port = port;
    if (protocol !== undefined) rule.protocol = protocol;
    if (description !== undefined) rule.description = description.trim();
    if (isActive !== undefined) rule.isActive = isActive;
    await rule.save();

    await AuditService.log({
      action: 'CONFIG_CHANGE',
      resourceType: 'egress_filter_rule',
      resourceId: id,
      userId: req.user?.userId ?? '',
      username: req.user?.username ?? '',
      details: `Egress rule updated: ${rule.type.toUpperCase()} ${rule.target}`,
      severity: 'medium',
      ipAddress: req.ip,
    });

    res.status(200).json({ success: true, data: rule });
  } catch (err) {
    if (err instanceof ApiError) throw err;
    logger.error('updateEgressRule error:', err);
    throw new ApiError(500, 'Failed to update egress rule');
  }
};

export const deleteEgressRule = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const rule = await EgressFilterRule.findByIdAndDelete(id);
    if (!rule) throw new ApiError(404, 'Egress rule not found');

    await AuditService.log({
      action: 'CONFIG_CHANGE',
      resourceType: 'egress_filter_rule',
      resourceId: id,
      userId: req.user?.userId ?? '',
      username: req.user?.username ?? '',
      details: `Egress rule deleted: ${rule.target}`,
      severity: 'medium',
      ipAddress: req.ip,
    });

    res.status(200).json({ success: true, message: 'Egress rule deleted' });
  } catch (err) {
    if (err instanceof ApiError) throw err;
    logger.error('deleteEgressRule error:', err);
    throw new ApiError(500, 'Failed to delete egress rule');
  }
};

export const toggleEgressRule = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const rule = await EgressFilterRule.findById(id);
    if (!rule) throw new ApiError(404, 'Egress rule not found');
    rule.isActive = !rule.isActive;
    await rule.save();

    await AuditService.log({
      userId: req.user?.userId,
      username: req.user?.username || 'system',
      action: 'UPDATE',
      resourceType: 'EgressFilterRule',
      resourceId: id,
      details: `Egress filter rule ${rule.isActive ? 'enabled' : 'disabled'} by ${req.user?.username}`,
      ipAddress: req.ip,
      severity: 'medium',
    });

    res.status(200).json({ success: true, data: rule });
  } catch (err) {
    if (err instanceof ApiError) throw err;
    logger.error('toggleEgressRule error:', err);
    throw new ApiError(500, 'Failed to toggle egress rule');
  }
};
