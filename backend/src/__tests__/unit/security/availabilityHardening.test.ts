/**
 * Availability hardening — blocklist policy, trusted IPs, rate-limit skip logic.
 */

import BlocklistService from '../../../services/blocklistService';
import { timingSafeEqualStrings } from '../../../utils/requestSecurityContext';

jest.mock('../../../config', () => ({
  config: {
    securityIpBlocking: true,
    securitySuspiciousThreshold: 10,
    securityBlockDurationMs: 600000,
    security404WindowMs: 300000,
    securityScannerTempBanMs: 24 * 60 * 60 * 1000,
    trustedAdminIps: ['203.0.113.10/32'],
    jwtSecret: 'test-jwt-secret-for-unit-tests-only',
    logFile: 'logs/app.log',
    logLevel: 'error',
  },
}));

jest.mock('../../../models/BlockedIP');
jest.mock('../../../models/IPRule');
jest.mock('../../../services/securityAlertService', () => ({
  securityAlertService: {
    alertIPBlocked: jest.fn().mockResolvedValue(undefined),
    send: jest.fn().mockResolvedValue(undefined),
  },
}));

describe('Availability hardening', () => {
  beforeEach(() => {
    BlocklistService._clearMemory();
  });

  describe('BlocklistService', () => {
    it('does not escalate suspicious_404 strikes via recordSuspiciousEvent', async () => {
      for (let i = 0; i < 15; i++) {
        const result = await BlocklistService.recordSuspiciousEvent('1.2.3.4', 'suspicious_404', 'test');
        expect(result.blocked).toBe(false);
      }
      const check = await BlocklistService.isBlocked('1.2.3.4');
      expect(check.blocked).toBe(false);
    });

    it('permanently blocks on first honeypot hit via blockScanner', async () => {
      const { BlockedIP } = require('../../../models/BlockedIP');
      BlockedIP.updateMany = jest.fn().mockResolvedValue({});
      BlockedIP.create = jest.fn().mockResolvedValue({});

      const result = await BlocklistService.blockScanner(
        '34.24.177.197',
        'honeypot',
        'Hit honeypot: /wp-admin',
        null,
      );
      expect(result.blocked).toBe(true);

      const check = BlocklistService.isBlockedSync('34.24.177.197');
      expect(check.blocked).toBe(true);
      expect(check.reason).toBe('honeypot');
      expect(check.retryAfterMs).toBeUndefined();
    });

    it('permanently blocks on first path_probe via blockScanner', async () => {
      const { BlockedIP } = require('../../../models/BlockedIP');
      BlockedIP.updateMany = jest.fn().mockResolvedValue({});
      BlockedIP.create = jest.fn().mockResolvedValue({});

      const result = await BlocklistService.blockScanner(
        '93.123.109.105',
        'path_probe',
        'Path: /.env',
        null,
      );
      expect(result.blocked).toBe(true);
      expect(BlocklistService.isBlockedSync('93.123.109.105').blocked).toBe(true);
    });

    it('applies temporary then permanent ban for suspicious_404 via blockScanner', async () => {
      const { BlockedIP } = require('../../../models/BlockedIP');
      BlockedIP.updateMany = jest.fn().mockResolvedValue({});
      BlockedIP.create = jest.fn().mockResolvedValue({});

      const tempMs = 24 * 60 * 60 * 1000;
      await BlocklistService.blockScanner('10.0.0.1', 'suspicious_404', 'offense 1', tempMs);
      const first = BlocklistService.isBlockedSync('10.0.0.1');
      expect(first.blocked).toBe(true);
      expect(first.retryAfterMs).toBeGreaterThan(0);

      await BlocklistService.blockScanner('10.0.0.1', 'suspicious_404', 'offense 2', null);
      const second = BlocklistService.isBlockedSync('10.0.0.1');
      expect(second.blocked).toBe(true);
      expect(second.retryAfterMs).toBeUndefined();
    });

    it('applies temporary then permanent ban for ua_blocked via blockScanner', async () => {
      const { BlockedIP } = require('../../../models/BlockedIP');
      BlockedIP.updateMany = jest.fn().mockResolvedValue({});
      BlockedIP.create = jest.fn().mockResolvedValue({});

      const tempMs = 24 * 60 * 60 * 1000;
      await BlocklistService.blockScanner('10.0.0.2', 'ua_blocked', 'hit 1', tempMs);
      expect(BlocklistService.isBlockedSync('10.0.0.2').retryAfterMs).toBeGreaterThan(0);

      await BlocklistService.blockScanner('10.0.0.2', 'ua_blocked', 'hit 2', null);
      expect(BlocklistService.isBlockedSync('10.0.0.2').retryAfterMs).toBeUndefined();
    });

    it('blockScanner skips TRUSTED_ADMIN_IPS', async () => {
      const result = await BlocklistService.blockScanner(
        '203.0.113.10',
        'honeypot',
        'should not ban',
        null,
      );
      expect(result.blocked).toBe(false);
      expect(BlocklistService.isBlockedSync('203.0.113.10').blocked).toBe(false);
    });

    it('escalates auth_failure to IP ban at threshold', async () => {
      const { BlockedIP } = require('../../../models/BlockedIP');
      BlockedIP.updateMany = jest.fn().mockResolvedValue({});
      BlockedIP.create = jest.fn().mockResolvedValue({});

      for (let i = 0; i < 10; i++) {
        await BlocklistService.recordSuspiciousEvent('5.6.7.8', 'auth_failure', 'bad login');
      }

      const check = BlocklistService.isBlockedSync('5.6.7.8');
      expect(check.blocked).toBe(true);
    });

    it('exempts TRUSTED_ADMIN_IPS from auto-escalation', async () => {
      for (let i = 0; i < 15; i++) {
        const result = await BlocklistService.recordSuspiciousEvent(
          '203.0.113.10',
          'auth_failure',
          'test'
        );
        expect(result.blocked).toBe(false);
      }
      expect(BlocklistService.isBlockedSync('203.0.113.10').blocked).toBe(false);
    });

    it('isBlockedSync reflects in-memory block', async () => {
      const { BlockedIP } = require('../../../models/BlockedIP');
      BlockedIP.updateMany = jest.fn().mockResolvedValue({});
      BlockedIP.create = jest.fn().mockResolvedValue({});

      await BlocklistService.block('9.9.9.9', 60000, 'brute_force', 'test');
      expect(BlocklistService.isBlockedSync('9.9.9.9').blocked).toBe(true);
    });

    it('flushMemoryBlocks clears in-memory state', async () => {
      const { BlockedIP } = require('../../../models/BlockedIP');
      BlockedIP.updateMany = jest.fn().mockResolvedValue({});
      BlockedIP.create = jest.fn().mockResolvedValue({});

      await BlocklistService.block('9.9.9.9', 60000, 'brute_force', 'test');
      BlocklistService.flushMemoryBlocks();
      expect(BlocklistService.isBlockedSync('9.9.9.9').blocked).toBe(false);
    });
  });

  describe('timingSafeEqualStrings', () => {
    it('matches equal strings', () => {
      expect(timingSafeEqualStrings('abc', 'abc')).toBe(true);
    });

    it('rejects different strings', () => {
      expect(timingSafeEqualStrings('abc', 'abd')).toBe(false);
    });
  });

  describe('config defaults', () => {
    it('uses raised block spike threshold and phase-2 404 default', () => {
      jest.resetModules();
      jest.unmock('../../../config');
      const { config: realConfig } = require('../../../config');
      expect(typeof realConfig.securityBlockSpikeThreshold).toBe('number');
      expect(typeof realConfig.securityAlertEmailOnly).toBe('boolean');
      expect(Array.isArray(realConfig.trustedAdminIps)).toBe(true);
      expect(realConfig.security404CountThreshold).toBe(10);
      expect(realConfig.securityScannerTempBanMs).toBe(24 * 60 * 60 * 1000);
    });
  });
});
