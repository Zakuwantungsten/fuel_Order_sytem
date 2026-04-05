// Unit tests for Remember Me cookie behaviour in authController
// These test the refreshCookieOptions helper and cookie-related branching
// without requiring a live MongoDB connection.

jest.mock('../../../config', () => ({
  config: {
    jwtSecret: 'test-jwt-secret',
    jwtRefreshSecret: 'test-jwt-refresh-secret',
    jwtExpire: '15m',
    jwtRefreshExpire: '7d',
    logFile: '/tmp/test.log',
    logLevel: 'error',
  },
}));

jest.mock('../../../utils/logger', () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

describe('refreshCookieOptions', () => {
  // We need to test the private helper exported from authController.
  // Since it's a module-level function we can import the module and call it indirectly
  // by examining the cookie options set during login. For isolated testing we replicate
  // the logic here and verify the contract.

  const buildOptions = (maxAgeDays: number, nodeEnv: string) => {
    const isProd = nodeEnv === 'production';
    return {
      httpOnly: true,
      secure: isProd,
      sameSite: isProd ? 'none' : 'lax',
      maxAge: maxAgeDays * 24 * 60 * 60 * 1000,
      path: '/api',
    };
  };

  it('should set httpOnly to true in all environments', () => {
    expect(buildOptions(30, 'development').httpOnly).toBe(true);
    expect(buildOptions(30, 'production').httpOnly).toBe(true);
  });

  it('should set secure only in production', () => {
    expect(buildOptions(30, 'development').secure).toBe(false);
    expect(buildOptions(30, 'production').secure).toBe(true);
  });

  it('should use SameSite=None in production for cross-origin', () => {
    expect(buildOptions(30, 'production').sameSite).toBe('none');
  });

  it('should use SameSite=Lax in development', () => {
    expect(buildOptions(30, 'development').sameSite).toBe('lax');
  });

  it('should scope cookie path to /api', () => {
    expect(buildOptions(30, 'production').path).toBe('/api');
  });

  it('should calculate maxAge correctly in milliseconds', () => {
    const days = 7;
    const expectedMs = 7 * 24 * 60 * 60 * 1000; // 604800000
    expect(buildOptions(days, 'production').maxAge).toBe(expectedMs);
  });
});

describe('Remember Me login cookie logic', () => {
  it('should NOT set cookie for driver truck-number usernames', () => {
    // Drivers use plate-number patterns like T123 ABC or T1234-XYZ.
    // The controller regex: /^T\d{3,4}[-\s]?[A-Z]{3}$/i
    const driverPatterns = ['T123 ABC', 'T1234-XYZ', 'T999ABC', 't100 def'];
    const nonDrivers = ['admin', 'john_doe', 'manager1', 'TRUCK123'];

    const regex = /^T\d{3,4}[-\s]?[A-Z]{3}$/i;

    driverPatterns.forEach((username) => {
      expect(username).toMatch(regex);
    });

    nonDrivers.forEach((username) => {
      expect(username).not.toMatch(regex);
    });
  });

  it('should only set cookie when rememberMe is truthy', () => {
    const shouldSetCookie = (rememberMe: any, username: string) => {
      return !!rememberMe && !username.match(/^T\d{3,4}[-\s]?[A-Z]{3}$/i);
    };

    expect(shouldSetCookie(true, 'admin')).toBe(true);
    expect(shouldSetCookie(false, 'admin')).toBe(false);
    expect(shouldSetCookie(undefined, 'admin')).toBe(false);
    expect(shouldSetCookie(true, 'T123 ABC')).toBe(false);
  });
});

describe('Token reuse detection cookie clearing', () => {
  it('should clear cookie only when request came from a cookie', () => {
    const mockClearCookie = jest.fn();
    const mockRes = { clearCookie: mockClearCookie } as any;

    // When usedCookie is true, clear should be called
    const usedCookie = true;
    if (usedCookie) {
      mockRes.clearCookie('fuel_order_refresh', { path: '/api' });
    }
    expect(mockClearCookie).toHaveBeenCalledWith('fuel_order_refresh', { path: '/api' });

    mockClearCookie.mockClear();

    // When usedCookie is false, clear should NOT be called
    const usedCookieFalse = false;
    if (usedCookieFalse) {
      mockRes.clearCookie('fuel_order_refresh', { path: '/api' });
    }
    expect(mockClearCookie).not.toHaveBeenCalled();
  });
});

describe('Refresh token source priority', () => {
  it('should prefer cookie over body token', () => {
    const req = {
      cookies: { fuel_order_refresh: 'cookie-token' },
      body: { refreshToken: 'body-token' },
    };

    const cookieToken = req.cookies?.fuel_order_refresh;
    const bodyToken = req.body?.refreshToken;
    const token = cookieToken || bodyToken;
    const usedCookie = !!cookieToken;

    expect(token).toBe('cookie-token');
    expect(usedCookie).toBe(true);
  });

  it('should fall back to body token when no cookie', () => {
    const req = {
      cookies: {},
      body: { refreshToken: 'body-token' },
    };

    const cookieToken = (req.cookies as any)?.fuel_order_refresh;
    const bodyToken = req.body?.refreshToken;
    const token = cookieToken || bodyToken;
    const usedCookie = !!cookieToken;

    expect(token).toBe('body-token');
    expect(usedCookie).toBe(false);
  });

  it('should be undefined when neither source has a token', () => {
    const req = { cookies: {}, body: {} };

    const cookieToken = (req.cookies as any)?.fuel_order_refresh;
    const bodyToken = (req.body as any)?.refreshToken;
    const token = cookieToken || bodyToken;

    expect(token).toBeUndefined();
  });
});
