// Mock config FIRST before any imports
jest.mock('../../../config', () => ({
  config: {
    securityPathBlocking: true,
    securityBlockPaths: '',
    logFile: '/tmp/test.log',
    logLevel: 'error',
  },
}));

// Mock logger
jest.mock('../../../utils/logger', () => ({
  __esModule: true,
  default: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

import { Request, Response, NextFunction } from 'express';
import {
  attackPatternMiddleware,
  isBlockedPath,
  getClientIP,
  compileExtraPatterns,
  reloadBlockPatterns,
  DEFAULT_BLOCKED_PATTERNS,
} from '../../../middleware/attackPatternMiddleware';
import { config } from '../../../config';
import logger from '../../../utils/logger';

// Helper to create mock request
const mockRequest = (path: string, overrides: Partial<Request> = {}): Partial<Request> => ({
  path,
  method: 'GET',
  headers: {},
  ip: '127.0.0.1',
  socket: { remoteAddress: '127.0.0.1' } as any,
  ...overrides,
});

// Helper to create mock response
const mockResponse = (): Partial<Response> => {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

describe('Attack Pattern Middleware', () => {
  let next: NextFunction;

  beforeEach(() => {
    next = jest.fn();
    jest.clearAllMocks();
    reloadBlockPatterns();
    // Reset config to defaults
    (config as any).securityPathBlocking = true;
    (config as any).securityBlockPaths = '';
  });

  // ── Blocked Path Detection ────────────────────────────────────────────

  describe('isBlockedPath', () => {
    describe('environment / config file probes', () => {
      const blockedPaths = [
        '/.env',
        '/.env.local',
        '/.env.production',
        '/.env.backup',
        '/.git',
        '/.git/config',
        '/.git/HEAD',
        '/.gitignore',
        '/.github/workflows',
        '/.docker',
        '/.dockerignore',
        '/.aws/credentials',
        '/.ssh/id_rsa',
        '/.htaccess',
        '/.htpasswd',
      ];

      it.each(blockedPaths)('should block %s', (path) => {
        expect(isBlockedPath(path)).toBe(true);
      });
    });

    describe('WordPress / PHP framework probes', () => {
      const blockedPaths = [
        '/wp-login.php',
        '/wp-admin.php',
        '/wp-config.php',
        '/wp-cron.php',
        '/wp-admin',
        '/wp-admin/',
        '/wp-content/uploads',
        '/wp-includes/js',
        '/xmlrpc.php',
        '/administrator',
        '/administrator/',
        '/phpmyadmin',
        '/phpmyadmin/',
        '/pma',
        '/pma/',
        '/adminer',
        '/myadmin',
      ];

      it.each(blockedPaths)('should block %s', (path) => {
        expect(isBlockedPath(path)).toBe(true);
      });
    });

    describe('framework profiler / debug probes', () => {
      const blockedPaths = [
        '/_profiler',
        '/_profiler/latest',
        '/__cve_probe',
        '/__cve_probe/test',
        '/_debug',
        '/_debug/default/view',
        '/debug/',
        '/debug/pprof',
        '/console',
        '/elmah.axd',
        '/trace.axd',
      ];

      it.each(blockedPaths)('should block %s', (path) => {
        expect(isBlockedPath(path)).toBe(true);
      });
    });

    describe('source maps & build artifacts', () => {
      const blockedPaths = [
        '/main.js.map',
        '/app.css.map',
        '/vendor.bundle.js.map',
        '/.vite/deps',
        '/.vite/manifest.json',
        '/env.js',
        '/.nuxt/config',
        '/.next/build-manifest.json',
        '/.svelte-kit/runtime',
      ];

      it.each(blockedPaths)('should block %s', (path) => {
        expect(isBlockedPath(path)).toBe(true);
      });
    });

    describe('common exploit / scanner paths', () => {
      const blockedPaths = [
        '/cgi-bin/test.cgi',
        '/actuator',
        '/actuator/health',
        '/api/swagger',
        '/web.config',
        '/server-status',
        '/server-info',
        '/.DS_Store',
      ];

      it.each(blockedPaths)('should block %s', (path) => {
        expect(isBlockedPath(path)).toBe(true);
      });
    });

    describe('database exposure probes', () => {
      const blockedPaths = [
        '/dump.sql',
        '/database.sql',
        '/backup.sql',
        '/db.sql',
        '/data.sql',
      ];

      it.each(blockedPaths)('should block %s', (path) => {
        expect(isBlockedPath(path)).toBe(true);
      });
    });

    describe('shell / backdoor probes', () => {
      const blockedPaths = [
        '/shell',
        '/cmd.php',
        '/c99.php',
        '/r57.php',
        '/webshell',
      ];

      it.each(blockedPaths)('should block %s', (path) => {
        expect(isBlockedPath(path)).toBe(true);
      });
    });

    describe('config file probes', () => {
      const blockedPaths = [
        '/config.yml',
        '/config.yaml',
        '/docker-compose.yml',
        '/Dockerfile',
        '/package.json',
        '/composer.json',
        '/Gemfile',
        '/tsconfig.json',
      ];

      it.each(blockedPaths)('should block %s', (path) => {
        expect(isBlockedPath(path)).toBe(true);
      });
    });

    describe('legitimate paths that should NOT be blocked', () => {
      const allowedPaths = [
        '/api/v1/auth/login',
        '/api/v1/users',
        '/api/v1/delivery-orders',
        '/api/v1/fuel-records',
        '/api/health',
        '/api/v1/csrf-token',
        '/',
        '/api/v1/admin/stats',
        '/api/v1/security/events',
        '/api/v1/admin/audit-logs',
      ];

      it.each(allowedPaths)('should allow %s', (path) => {
        expect(isBlockedPath(path)).toBe(false);
      });
    });

    it('should be case-insensitive for blocked paths', () => {
      expect(isBlockedPath('/.ENV')).toBe(true);
      expect(isBlockedPath('/.Env.Local')).toBe(true);
      expect(isBlockedPath('/WP-ADMIN')).toBe(true);
      expect(isBlockedPath('/PHPMyAdmin')).toBe(true);
    });
  });

  // ── Extra Patterns from ENV ───────────────────────────────────────────

  describe('compileExtraPatterns', () => {
    it('should return empty array for empty string', () => {
      expect(compileExtraPatterns('')).toEqual([]);
    });

    it('should return empty array for whitespace-only', () => {
      expect(compileExtraPatterns('   ')).toEqual([]);
    });

    it('should compile literal paths as prefix matchers', () => {
      const patterns = compileExtraPatterns('/custom-blocked,/internal');
      expect(patterns).toHaveLength(2);
      expect(patterns[0].test('/custom-blocked')).toBe(true);
      expect(patterns[0].test('/custom-blocked/sub')).toBe(true);
      expect(patterns[1].test('/internal')).toBe(true);
      expect(patterns[1].test('/not-internal')).toBe(false);
    });

    it('should compile regex patterns when wrapped in slashes', () => {
      const patterns = compileExtraPatterns('/\\/secret-\\d+/i');
      expect(patterns).toHaveLength(1);
      expect(patterns[0].test('/secret-123')).toBe(true);
      expect(patterns[0].test('/secret-abc')).toBe(false);
    });

    it('should handle mixed literal and regex patterns', () => {
      const patterns = compileExtraPatterns('/blocked-path,/\\/regex-\\w+/');
      expect(patterns).toHaveLength(2);
    });

    it('should skip invalid regex patterns gracefully', () => {
      const patterns = compileExtraPatterns('/[invalid/');
      expect(patterns).toHaveLength(0);
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Invalid regex')
      );
    });

    it('should trim whitespace from patterns', () => {
      const patterns = compileExtraPatterns('  /path1 , /path2  ');
      expect(patterns).toHaveLength(2);
      expect(patterns[0].test('/path1')).toBe(true);
      expect(patterns[1].test('/path2')).toBe(true);
    });
  });

  describe('extra patterns integration', () => {
    it('should block paths from SECURITY_BLOCK_PATHS env', () => {
      (config as any).securityBlockPaths = '/my-custom-secret,/internal-tool';
      reloadBlockPatterns();

      expect(isBlockedPath('/my-custom-secret')).toBe(true);
      expect(isBlockedPath('/my-custom-secret/data')).toBe(true);
      expect(isBlockedPath('/internal-tool')).toBe(true);
      expect(isBlockedPath('/api/v1/users')).toBe(false);
    });
  });

  // ── getClientIP ───────────────────────────────────────────────────────

  describe('getClientIP', () => {
    it('should extract IP from x-forwarded-for header', () => {
      const req = mockRequest('/test', {
        headers: { 'x-forwarded-for': '203.0.113.50, 70.41.3.18' },
      }) as Request;
      expect(getClientIP(req)).toBe('203.0.113.50');
    });

    it('should fall back to req.ip', () => {
      const req = mockRequest('/test', { ip: '192.168.1.100' }) as Request;
      expect(getClientIP(req)).toBe('192.168.1.100');
    });

    it('should fall back to socket.remoteAddress', () => {
      const req = mockRequest('/test', {
        ip: undefined as any,
        socket: { remoteAddress: '10.0.0.1' } as any,
      }) as Request;
      expect(getClientIP(req)).toBe('10.0.0.1');
    });

    it('should return "unknown" if no IP available', () => {
      const req = mockRequest('/test', {
        ip: undefined as any,
        socket: { remoteAddress: undefined } as any,
      }) as Request;
      expect(getClientIP(req)).toBe('unknown');
    });
  });

  // ── Middleware Integration ────────────────────────────────────────────

  describe('attackPatternMiddleware', () => {
    it('should return 403 for blocked paths', () => {
      const req = mockRequest('/.env') as Request;
      const res = mockResponse() as Response;

      attackPatternMiddleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'Forbidden',
      });
      expect(next).not.toHaveBeenCalled();
    });

    it('should call next() for clean paths', () => {
      const req = mockRequest('/api/v1/auth/login') as Request;
      const res = mockResponse() as Response;

      attackPatternMiddleware(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    it('should log blocked requests with details', () => {
      const req = mockRequest('/wp-login.php', {
        method: 'POST',
        headers: { 'user-agent': 'Mozilla/5.0 Evil Bot' },
        ip: '203.0.113.99',
      }) as Request;
      const res = mockResponse() as Response;

      attackPatternMiddleware(req, res, next);

      expect(logger.warn).toHaveBeenCalledWith(
        'Blocked malicious path probe',
        expect.objectContaining({
          event: 'PATH_BLOCKED',
          method: 'POST',
          path: '/wp-login.php',
          ip: '203.0.113.99',
          userAgent: 'Mozilla/5.0 Evil Bot',
        })
      );
    });

    it('should skip blocking when securityPathBlocking is disabled', () => {
      (config as any).securityPathBlocking = false;

      const req = mockRequest('/.env') as Request;
      const res = mockResponse() as Response;

      attackPatternMiddleware(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    it('should block multiple different attack paths in sequence', () => {
      const attackPaths = ['/.env', '/.git/HEAD', '/wp-login.php', '/phpmyadmin', '/actuator'];
      
      for (const path of attackPaths) {
        const req = mockRequest(path) as Request;
        const res = mockResponse() as Response;
        const n = jest.fn();

        attackPatternMiddleware(req, res, n);

        expect(res.status).toHaveBeenCalledWith(403);
        expect(n).not.toHaveBeenCalled();
      }
    });

    it('should not block API routes that contain blocked substrings', () => {
      // "/api/v1/admin/config" contains "config" but should not be blocked
      const safePaths = [
        '/api/v1/admin/config',
        '/api/v1/admin/database',
        '/api/v1/users/profile',
      ];

      for (const path of safePaths) {
        const req = mockRequest(path) as Request;
        const res = mockResponse() as Response;
        const n = jest.fn();

        attackPatternMiddleware(req, res, n);

        expect(n).toHaveBeenCalled();
        expect(res.status).not.toHaveBeenCalled();
      }
    });

    it('should use "unknown" for missing user-agent', () => {
      const req = mockRequest('/.env', { headers: {} }) as Request;
      const res = mockResponse() as Response;

      attackPatternMiddleware(req, res, next);

      expect(logger.warn).toHaveBeenCalledWith(
        'Blocked malicious path probe',
        expect.objectContaining({
          userAgent: 'unknown',
        })
      );
    });
  });

  // ── Pattern Cache ─────────────────────────────────────────────────────

  describe('reloadBlockPatterns', () => {
    it('should reload patterns after config change', () => {
      // Initially no custom patterns
      expect(isBlockedPath('/custom-path')).toBe(false);

      // Add custom pattern via config
      (config as any).securityBlockPaths = '/custom-path';
      reloadBlockPatterns();

      expect(isBlockedPath('/custom-path')).toBe(true);
    });
  });

  // ── Default Pattern Count ─────────────────────────────────────────────

  describe('DEFAULT_BLOCKED_PATTERNS', () => {
    it('should have a comprehensive set of patterns', () => {
      // Ensure we have a reasonable number of default patterns
      expect(DEFAULT_BLOCKED_PATTERNS.length).toBeGreaterThanOrEqual(40);
    });

    it('should all be valid RegExp instances', () => {
      for (const pattern of DEFAULT_BLOCKED_PATTERNS) {
        expect(pattern).toBeInstanceOf(RegExp);
      }
    });
  });
});
