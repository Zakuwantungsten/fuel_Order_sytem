import { Request, Response } from 'express';
import crypto from 'crypto';
import https from 'https';
import http from 'http';
import { URL } from 'url';
import Webhook, { WEBHOOK_EVENTS } from '../models/Webhook';
import type { AuthRequest } from '../middleware/auth';
import { AuditService } from '../utils/auditService';
import logger from '../utils/logger';
import { isSafeUrl } from '../utils/ssrfGuard';

// URL safety is enforced via isSafeUrl() from ../utils/ssrfGuard, which performs
// real DNS resolution and blocks private/loopback/link-local/metadata targets.
// The previous string/regex denylist here was bypassable with decimal/octal/hex
// IP encodings (e.g. http://2130706433), IPv6 loopback (http://[::1]), and DNS
// rebinding, so it was replaced.

export const listWebhooks = async (req: AuthRequest, res: Response): Promise<void> => {
  const webhooks = await Webhook.find().sort({ createdAt: -1 }).lean();
  // Mask secrets
  const masked = webhooks.map(({ secret: _s, ...w }) => ({ ...w, secret: '••••••••' }));
  res.json({ success: true, data: masked });
};

export const getWebhookEvents = async (_req: Request, res: Response): Promise<void> => {
  res.json({ success: true, data: WEBHOOK_EVENTS });
};

export const createWebhook = async (req: AuthRequest, res: Response): Promise<void> => {
  const { name, url, events, headers } = req.body;
  if (!name || !url || !Array.isArray(events) || events.length === 0) {
    res.status(400).json({ success: false, message: 'name, url, and events are required' });
    return;
  }
  if (!(await isSafeUrl(url))) {
    res.status(400).json({ success: false, message: 'URL must be a public http/https endpoint' });
    return;
  }
  const invalidEvents = events.filter((e: string) => !(WEBHOOK_EVENTS as readonly string[]).includes(e));
  if (invalidEvents.length > 0) {
    res.status(400).json({ success: false, message: `Invalid events: ${invalidEvents.join(', ')}` });
    return;
  }

  const secret = crypto.randomBytes(32).toString('hex');
  const webhook = await Webhook.create({
    name,
    url,
    events,
    secret,
    headers: headers || {},
    createdBy: req.user?.username || 'system',
  });

  await AuditService.log({
    userId: req.user?.userId,
    username: req.user?.username || 'system',
    action: 'CREATE',
    resourceType: 'webhook',
    resourceId: webhook.id,
    details: `Webhook "${name}" created for events: ${events.join(', ')}`,
    severity: 'medium',
    ipAddress: req.ip,
  });

  // Return with visible secret only on creation
  res.status(201).json({ success: true, data: webhook });
};

export const updateWebhook = async (req: AuthRequest, res: Response): Promise<void> => {
  const { id } = req.params;
  const { name, url, events, headers, isEnabled } = req.body;

  if (url && !(await isSafeUrl(url))) {
    res.status(400).json({ success: false, message: 'URL must be a public http/https endpoint' });
    return;
  }

  const webhook = await Webhook.findById(id);
  if (!webhook) {
    res.status(404).json({ success: false, message: 'Webhook not found' });
    return;
  }

  if (name !== undefined) webhook.name = name;
  if (url !== undefined) webhook.url = url;
  if (events !== undefined) webhook.events = events;
  if (headers !== undefined) webhook.headers = headers;
  if (isEnabled !== undefined) webhook.isEnabled = isEnabled;

  await webhook.save();

  await AuditService.log({
    userId: req.user?.userId,
    username: req.user?.username || 'system',
    action: 'UPDATE',
    resourceType: 'webhook',
    resourceId: webhook.id,
    details: `Webhook "${webhook.name}" updated`,
    severity: 'low',
    ipAddress: req.ip,
  });

  res.json({ success: true, data: { ...webhook.toObject(), secret: '••••••••' } });
};

export const deleteWebhook = async (req: AuthRequest, res: Response): Promise<void> => {
  const { id } = req.params;
  const webhook = await Webhook.findByIdAndDelete(id);
  if (!webhook) {
    res.status(404).json({ success: false, message: 'Webhook not found' });
    return;
  }

  await AuditService.log({
    userId: req.user?.userId,
    username: req.user?.username || 'system',
    action: 'DELETE',
    resourceType: 'webhook',
    resourceId: id,
    details: `Webhook "${webhook.name}" deleted`,
    severity: 'medium',
    ipAddress: req.ip,
  });

  res.json({ success: true, message: 'Webhook deleted' });
};

export const testWebhook = async (req: AuthRequest, res: Response): Promise<void> => {
  const { id } = req.params;
  const webhook = await Webhook.findById(id);
  if (!webhook) {
    res.status(404).json({ success: false, message: 'Webhook not found' });
    return;
  }

  const result = await dispatchWebhookPayload(webhook.url, 'webhook.test', { message: 'Test ping from system admin' }, webhook.secret, webhook.headers as Record<string, string> || {});

  // Record in logs (keep last 50)
  webhook.logs.unshift({
    timestamp: new Date(),
    event: 'webhook.test',
    statusCode: result.statusCode,
    success: result.success,
    error: result.error,
    durationMs: result.durationMs,
  });
  if (webhook.logs.length > 50) webhook.logs = webhook.logs.slice(0, 50);
  webhook.lastTriggeredAt = new Date();
  webhook.lastStatus = result.success ? 'success' : 'error';
  webhook.lastStatusCode = result.statusCode;
  await webhook.save();

  res.json({ success: true, data: result });
};

export const regenerateSecret = async (req: AuthRequest, res: Response): Promise<void> => {
  const { id } = req.params;
  const webhook = await Webhook.findById(id);
  if (!webhook) {
    res.status(404).json({ success: false, message: 'Webhook not found' });
    return;
  }

  webhook.secret = crypto.randomBytes(32).toString('hex');
  await webhook.save();

  await AuditService.log({
    userId: req.user?.userId,
    username: req.user?.username || 'system',
    action: 'UPDATE',
    resourceType: 'webhook',
    resourceId: id,
    details: `Secret regenerated for webhook "${webhook.name}"`,
    severity: 'high',
    ipAddress: req.ip,
  });

  res.json({ success: true, data: { secret: webhook.secret } });
};

// Utility: dispatch a webhook payload to a URL
export async function dispatchWebhookPayload(
  url: string,
  event: string,
  payload: Record<string, unknown>,
  secret: string,
  headers: Record<string, string> = {}
): Promise<{ success: boolean; statusCode: number; durationMs: number; error?: string }> {
  const start0 = Date.now();
  // SECURITY (SSRF): re-resolve and validate the target at dispatch time, not only
  // when the webhook was saved. This closes the DNS-rebinding window where a hostname
  // that resolved to a public IP at save time later points at an internal/metadata IP.
  if (!(await isSafeUrl(url))) {
    logger.warn(`Webhook dispatch blocked by SSRF guard: ${url}`);
    return { success: false, statusCode: 0, durationMs: Date.now() - start0, error: 'Blocked: URL resolves to a private/disallowed address' };
  }

  const body = JSON.stringify({ event, payload, timestamp: new Date().toISOString() });
  const sig = crypto.createHmac('sha256', secret).update(body).digest('hex');

  const parsedUrl = new URL(url);
  const options = {
    hostname: parsedUrl.hostname,
    port: parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80),
    path: parsedUrl.pathname + parsedUrl.search,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(body),
      'X-Webhook-Signature': `sha256=${sig}`,
      'X-Webhook-Event': event,
      ...headers,
    },
    timeout: 10_000,
  };

  const start = Date.now();
  return new Promise((resolve) => {
    const mod = parsedUrl.protocol === 'https:' ? https : http;
    const req = mod.request(options, (res) => {
      res.resume(); // drain response
      resolve({
        success: res.statusCode !== undefined && res.statusCode >= 200 && res.statusCode < 300,
        statusCode: res.statusCode ?? 0,
        durationMs: Date.now() - start,
      });
    });
    req.on('error', (err) => {
      logger.error('Webhook dispatch error:', err.message);
      resolve({ success: false, statusCode: 0, durationMs: Date.now() - start, error: err.message });
    });
    req.on('timeout', () => {
      req.destroy();
      resolve({ success: false, statusCode: 0, durationMs: Date.now() - start, error: 'Timeout' });
    });
    req.write(body);
    req.end();
  });
}

