/**
 * Firewall Routes
 * All endpoints are super_admin only.
 * Base path: /api/v1/system-admin/firewall
 */
import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth';
import {
  // Path Rules
  getPathRules,
  createPathRule,
  updatePathRule,
  deletePathRule,
  togglePathRule,
  // CORS
  getCorsConfig,
  saveCorsConfig,
  // Security Headers
  getSecurityHeaders,
  saveSecurityHeaders,
  // Honeypot Config
  getHoneypotConfig,
  saveHoneypotConfig,
  // Bot Protection
  getBotProtection,
  saveBotProtection,
  // Network Zones
  getNetworkZones,
  createNetworkZone,
  updateNetworkZone,
  deleteNetworkZone,
  // TLS Policy
  getTlsPolicy,
  saveTlsPolicy,
  // DDoS Config
  getDdosConfig,
  saveDdosConfig,
  // Egress Rules
  getEgressRules,
  createEgressRule,
  updateEgressRule,
  deleteEgressRule,
  toggleEgressRule,
} from '../controllers/firewallController';

const router = Router();

// All firewall endpoints require super_admin
router.use(authenticate, authorize('super_admin'));

/* ── Path Rules ──────────────────────────────────────────────── */
router.get('/path-rules', getPathRules);
router.post('/path-rules', createPathRule);
router.put('/path-rules/:id', updatePathRule);
router.patch('/path-rules/:id/toggle', togglePathRule);
router.delete('/path-rules/:id', deletePathRule);

/* ── CORS Policy ─────────────────────────────────────────────── */
router.get('/cors', getCorsConfig);
router.put('/cors', saveCorsConfig);

/* ── Security Headers ────────────────────────────────────────── */
router.get('/security-headers', getSecurityHeaders);
router.put('/security-headers', saveSecurityHeaders);

/* ── Honeypot Config (admin-managed trap paths) ───────────────── */
router.get('/honeypot-config', getHoneypotConfig);
router.put('/honeypot-config', saveHoneypotConfig);

/* ── Bot Protection ──────────────────────────────────────────── */
router.get('/bot-protection', getBotProtection);
router.put('/bot-protection', saveBotProtection);

/* ── Network Zones ───────────────────────────────────────────── */
router.get('/network-zones', getNetworkZones);
router.post('/network-zones', createNetworkZone);
router.put('/network-zones/:id', updateNetworkZone);
router.delete('/network-zones/:id', deleteNetworkZone);

/* ── TLS Policy ──────────────────────────────────────────────── */
router.get('/tls', getTlsPolicy);
router.put('/tls', saveTlsPolicy);

/* ── DDoS / Burst Protection ─────────────────────────────────── */
router.get('/ddos', getDdosConfig);
router.put('/ddos', saveDdosConfig);

/* ── Egress Filter Rules ─────────────────────────────────────── */
router.get('/egress-rules', getEgressRules);
router.post('/egress-rules', createEgressRule);
router.put('/egress-rules/:id', updateEgressRule);
router.patch('/egress-rules/:id/toggle', toggleEgressRule);
router.delete('/egress-rules/:id', deleteEgressRule);

export default router;
