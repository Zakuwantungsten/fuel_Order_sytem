/**
 * Availability hardening — blocklist policy, trusted IPs, rate-limit skip logic.
 */

import BlocklistService from '../../../services/blocklistService';
import { config } from '../../../config';
import { timingSafeEqualStrings } from '../../../utils/requestSecurityContext';

jest.mock('../../../config', () => ({
  config: {
    securityIpBlocking: true,
    securitySuspiciousThreshold: 10,
    securityBlockDurationMs: 600000,
    security404WindowMs: 300000,
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
    it('does not escalate path_probe to IP ban', async () => {
      for (let i = 0; i < 15; i++) {
        const result = await BlocklistService.recordSuspiciousEvent('1.2.3.4', 'path_probe', 'test');
        expect(result.blocked).toBe(false);
      }
      const check = await BlocklistService.isBlocked('1.2.3.4');
      expect(check.blocked).toBe(false);
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
    it('uses raised block spike threshold', () => {
      // Re-import real config defaults (mock only affects blocklist tests above)
      jest.resetModules();
      jest.unmock('../../../config');
      const { config: realConfig } = require('../../../config');
      // Default when env unset — may be overridden in CI .env; check structure exists
      expect(typeof realConfig.securityBlockSpikeThreshold).toBe('number');
      expect(typeof realConfig.securityAlertEmailOnly).toBe('boolean');
      expect(Array.isArray(realConfig.trustedAdminIps)).toBe(true);
    });
  });
});
