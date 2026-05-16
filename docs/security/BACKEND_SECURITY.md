# Backend Security Documentation
## Fuel Order System — `backend/src`

> **Last updated:** April 22, 2026  
> **Scope:** All security implementations in the Express/Node.js backend  
> **Architecture:** Defense-in-depth — multiple independent layers each enforce their own controls

---

## Table of Contents

1. [Authentication & JWT Token Management](#1-authentication--jwt-token-management)
2. [Authorization & Role-Based Access Control](#2-authorization--role-based-access-control)
3. [Session Management](#3-session-management)
4. [Token Refresh & Rotation](#4-token-refresh--rotation)
5. [CSRF Protection](#5-csrf-protection)
6. [Rate Limiting](#6-rate-limiting)
7. [Input Validation & Sanitization](#7-input-validation--sanitization)
8. [Password Security](#8-password-security)
9. [Multi-Factor Authentication (MFA)](#9-multi-factor-authentication-mfa)
10. [IP Filtering & Blocklist Service](#10-ip-filtering--blocklist-service)
11. [Attack Pattern Detection](#11-attack-pattern-detection)
12. [File Upload Security](#12-file-upload-security)
13. [Response Sanitization & Data Leakage Prevention](#13-response-sanitization--data-leakage-prevention)
14. [Risk Scoring & Adaptive Authentication](#14-risk-scoring--adaptive-authentication)
15. [Security Event Logging & Audit Trail](#15-security-event-logging--audit-trail)
16. [HTTP Security Headers](#16-http-security-headers)
17. [Environment & Secrets Management](#17-environment--secrets-management)
18. [Conditional Access Policies](#18-conditional-access-policies)
19. [Cryptographic Utilities](#19-cryptographic-utilities)
20. [Security Architecture Summary](#20-security-architecture-summary)

---

## 1. Authentication & JWT Token Management

### File: `backend/src/utils/jwt.ts`

The system uses a **dual-token strategy** — short-lived access tokens for API requests and longer-lived refresh tokens for session persistence. Both use separate signing secrets, making compromise of one secret insufficient to forge the other.

| Token Type | Default TTL | Secret | Purpose |
|------------|-------------|--------|---------|
| Access Token | 15 minutes (`JWT_EXPIRE`) | `JWT_SECRET` | Authorise API calls |
| Refresh Token | 7 days (`JWT_REFRESH_EXPIRE`) | `JWT_REFRESH_SECRET` | Obtain new access tokens |

**Token Generation:**

```typescript
// Access token — short-lived, used per-request
export const generateAccessToken = (payload: JWTPayload, expiresIn?: string): string => {
  const options: SignOptions = { expiresIn: expiresIn ?? config.jwtExpire };
  return jwt.sign(payload, config.jwtSecret, options);
};

// Refresh token — separate secret, longer life
export const generateRefreshToken = (payload: JWTPayload, expiresIn?: string): string => {
  const options: SignOptions = { expiresIn: expiresIn ?? config.jwtRefreshExpire };
  return jwt.sign(payload, config.jwtRefreshSecret, options);
};
```

**Startup validation:** `validateEnv()` in `backend/src/config/index.ts` throws a hard error and aborts startup if `JWT_SECRET` or `JWT_REFRESH_SECRET` are absent. There are **no fallback values** for secrets.

---

### File: `backend/src/middleware/auth.ts` — `authenticate` middleware

The authentication middleware (450+ lines) is the primary request gatekeeper. Every protected route passes through it.

**Processing order:**

1. **Bearer token extraction** — rejects any request without `Authorization: Bearer <token>` with `401`
2. **JWT signature verification** — `jwt.verify(token, config.jwtSecret)` catches expired and tampered tokens
3. **Token blocklist check** — checks `blocklistService` to catch forcibly-revoked tokens
4. **User existence check** — loads user from MongoDB; rejects if `!user.isActive || user.isDeleted`
5. **MongoDB ObjectId safety** — validates ObjectId format before any DB lookup; driver users use the `driver_` prefix to avoid casting errors
6. **Session termination check** — checks `activeSessionTracker.isTerminated(userId)` for force-logged-out sessions
7. **Conditional access policy evaluation** — applies admin-configured IP/role/time policies (see [Section 18](#18-conditional-access-policies))
8. **Password expiration enforcement** — blocks requests if password has exceeded the grace period (see [Section 8](#8-password-security))

All failures are logged via `SecurityEventLogger.logUnauthorized()` with client IP and User-Agent before the `401` is returned, creating a tamper-evident trail.

```typescript
// Core authenticate flow (simplified)
export const authenticate = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    SecurityEventLogger.logUnauthorized({ ip, userAgent, path: req.path }).catch(() => {});
    return res.status(401).json({ success: false, message: 'No token provided.' });
  }

  const token = authHeader.substring(7);
  const decoded = jwt.verify(token, config.jwtSecret) as JWTPayload;
  // ... further checks follow
  req.user = { userId: decoded.userId, username: decoded.username, role: decoded.role };
  next();
};
```

---

## 2. Authorization & Role-Based Access Control

### File: `backend/src/middleware/auth.ts` — `authorize` middleware

The `authorize` middleware is applied to individual routes to enforce role-based access after authentication succeeds. It supports **19 named roles**:

| Role | Description |
|------|-------------|
| `super_admin` | Unrestricted system access |
| `admin` | Administrative access |
| `manager` | Department / station manager |
| `super_manager` | Multi-station senior manager |
| `supervisor` | Team supervision |
| `clerk` | Data entry |
| `driver` | Truck driver (limited access) |
| `viewer` | Read-only (default role) |
| `fuel_order_maker` | Fuel order specialist |
| `boss` | Executive overview |
| `yard_personnel` | Yard operations |
| `fuel_attendant` | Fuel station attendant |
| `station_manager` | Station operations manager |
| `payment_manager` | Payment operations |
| `dar_yard` | DAR yard dispenser |
| `tanga_yard` | Tanga yard dispenser |
| `mmsa_yard` | MMSA yard dispenser |
| `import_officer` | Import order specialist |
| `export_officer` | Export order specialist |

**Route protection pattern:**

```typescript
router.delete('/users/:id',
  authenticate,
  authorize('super_admin', 'admin'),   // Only admins can delete users
  userController.deleteUser
);
```

Every role mismatch is logged as a `FORBIDDEN` security event (compliant with PCI-DSS 10.2.3) before the `403` is returned.

### File: `backend/src/utils/roleFieldPolicy.ts`

**Field-level access control** prevents mass-assignment attacks. Each resource (FuelRecord, LPOEntry, DeliveryOrder) defines an explicit whitelist of fields that each role is permitted to modify. Fields outside the whitelist are silently stripped from update payloads before they reach the database.

```typescript
const FUEL_RECORD_FIELDS: Record<string, string[]> = {
  admin:           ['totalLts', 'extra', 'balance', 'isLocked', 'truckNo', ...],
  fuel_order_maker: ['darGoing', 'moroGoing', 'mbeyaGoing', 'extra', 'journeyStatus'],
  clerk:           ['darGoing', 'moroGoing', 'mbeyaGoing', 'extra'],
};

export function filterFuelRecordFields(updates: Record<string, any>, role: string) {
  return filterByPolicy(updates, role, FUEL_RECORD_FIELDS);
}
```

---

## 3. Session Management

### File: `backend/src/utils/activeSessionTracker.ts`

An in-memory session tracker runs alongside the JWT layer to support **real-time session termination** — something stateless JWTs cannot provide on their own.

| Feature | Detail |
|---------|--------|
| **Active session map** | `Map<userId, { username, role, ip, requestCount, firstSeen, lastSeen }>` |
| **Terminated set** | Force-terminated user IDs; checked on every request |
| **Session TTL** | Configurable from `SystemConfig.systemSettings.session.sessionTimeout` (default 30 min), hot-reloaded every 60 s |
| **IP tracking** | Updated on each request; enables impossible-travel detection |
| **Bulk termination** | `terminateAll(exceptUserId)` lets admins log out all active users |

```typescript
// Session forced logout — blocks next request
tracker.terminate(userId);

// Check at start of every authenticated request
if (tracker.isTerminated(userId)) {
  return res.status(401).json({ success: false, message: 'Session terminated.' });
}
```

---

## 4. Token Refresh & Rotation

### File: `backend/src/controllers/authController.ts`

The refresh flow enforces **single-use refresh tokens** via cryptographic hashing to prevent token reuse attacks.

**Secure refresh sequence:**

1. Client sends refresh token via `Authorization` header (or HttpOnly cookie for browser sessions)
2. Server fetches user record, selecting the hidden `+refreshToken` field
3. Incoming token is SHA-256-hashed and compared with the stored hash using constant-time comparison
4. If mismatched → `401` (and logs the anomaly)
5. **Old token revoked** (`user.refreshToken = undefined`) and saved to DB *before* new tokens are issued
6. New access and refresh tokens are generated
7. New refresh token is SHA-256-hashed and stored in DB
8. New refresh token is returned in an **HttpOnly, Secure, SameSite cookie** for browser clients

```typescript
// Hash comparison prevents stored-value leakage attacks
const hashedIncoming = crypto.createHash('sha256').update(tempToken).digest('hex');
if (user.refreshToken !== hashedIncoming) {
  return res.status(401).json({ success: false, message: 'Invalid refresh token.' });
}

// Revoke before re-issuing (prevents replay)
user.refreshToken = undefined;
await user.save();

const { accessToken, refreshToken } = generateTokens(payload);
user.refreshToken = crypto.createHash('sha256').update(refreshToken).digest('hex');
await user.save();
```

**Cookie attributes for browser sessions:**

| Attribute | Value | Purpose |
|-----------|-------|---------|
| `HttpOnly` | `true` | JavaScript cannot read — stops XSS token theft |
| `Secure` | `true` | HTTPS only — never sent over plain HTTP |
| `SameSite` | `none` (cross-origin) or `lax` (same-origin) | Controls cross-site sending |
| `Path` | `/api` | Scoped to API base path only |
| `MaxAge` | Refresh token TTL (default 30 days) | Browser persistence |

---

## 5. CSRF Protection

### File: `backend/src/middleware/csrf.ts` (300+ lines)

All state-changing requests (`POST`, `PUT`, `PATCH`, `DELETE`) require a valid CSRF token. The implementation is **stateless** — tokens are HMAC-signed and carry their own expiry, requiring no server-side state.

**Token structure:** `base64url(timestamp.nonce.hmac)`

**Generation:**

```typescript
const generateCsrfToken = (): string => {
  const nonce = crypto.randomBytes(CSRF_TOKEN_LENGTH).toString('hex');
  const timestamp = Date.now().toString();
  const payload = `${timestamp}.${nonce}`;

  const hmac = crypto.createHmac('sha256', getCsrfSigningKey())
    .update(payload)
    .digest('hex');

  return Buffer.from(`${payload}.${hmac}`).toString('base64url');
};
```

**Verification logic:**

1. Decode the base64url token and split into `timestamp`, `nonce`, and `hmac`
2. Reject if timestamp is older than 2 hours (`CSRF_TOKEN_MAX_AGE_MS`)
3. Recompute expected HMAC from `timestamp.nonce`
4. Compare with provided HMAC using **`crypto.timingSafeEqual()`** — prevents timing-oracle attacks
5. Reject on any mismatch with error code `CSRF_VALIDATION_FAILED`

**Dual validation strategy:**

- **Primary:** Client sends token in `X-XSRF-TOKEN` header (supports cross-origin setups)
- **Fallback:** Double-submit cookie comparison for backward compatibility

**Cookie for CSRF token:**

| Attribute | Value |
|-----------|-------|
| `HttpOnly` | `true` |
| `Secure` | `true` |
| `SameSite` | `strict` |
| `MaxAge` | 2 hours |

**Token distribution:** `GET /api/csrf-token` returns the token in the response body so cross-origin front-end clients (e.g., Firebase-hosted SPA calling Railway API) can obtain it without needing to read the cookie directly.

All CSRF failures are logged via `SecurityEventLogger.logCSRFFailure()` with IP, method, path, and User-Agent.

---

## 6. Rate Limiting

### File: `backend/src/middleware/rateLimiters.ts`

Endpoint-specific rate limiters using `express-rate-limit`:

| Endpoint | Window | Limit | Notes |
|----------|--------|-------|-------|
| Auth (login) | 1 min | 5 req | `skipSuccessfulRequests: true` |
| Driver auth | 15 min | 3 req | Tighter — simplified driver flow |
| MFA setup | 1 min | 15 req | Lenient — post-login setup |
| Password reset | 1 hr | 3 req | Prevents email/phone enumeration |
| Registration | 1 hr | 5 req | Stops account creation spam |
| Export / download | 1 min | 5 req | Prevents bulk data exfiltration |
| General API | 1 min | 500 req | Global fallback |

`skipSuccessfulRequests: true` on the auth limiter means **only failed login attempts** consume quota, avoiding accidental lockout of legitimate users.

All limiters return standardised `429 Too Many Requests` with a human-readable `Retry-After` header.

---

## 7. Input Validation & Sanitization

### 7.1 Express Validator — `backend/src/middleware/validation.ts`

All user-supplied registration and mutation payloads are validated before reaching controllers:

```typescript
export const userValidation = {
  register: [
    body('username')
      .trim()
      .isLength({ min: 3, max: 30 })
      .matches(/^[a-zA-Z0-9_]+$/)   // Whitelist — no special chars
      .withMessage('Username can only contain letters, numbers, underscores'),
    body('email').isEmail().normalizeEmail(),
    body('password').isLength({ min: 1 }).withMessage('Password is required'),
    body('role').optional().isIn([...ALL_VALID_ROLES]).withMessage('Invalid role'),
  ],
};
```

### 7.2 MongoDB Injection Prevention — `backend/src/server.ts`

`express-mongo-sanitize` strips MongoDB operator characters (`$`, `.`) from all request inputs, neutralising injections like `{"$ne": null}` or `{"$where": "..."}`:

```typescript
app.use(mongoSanitize({ replaceWith: '_' }));
```

### 7.3 ReDoS Prevention — `backend/src/utils/sanitize.ts`

Search inputs that are used in MongoDB `$regex` queries are first sanitised to escape regex metacharacters, and then length-capped to prevent catastrophic backtracking:

```typescript
export const sanitizeRegexInput = (input: string, maxLength = 100): string => {
  const trimmed = input.trim().substring(0, maxLength);  // Length cap
  return escapeRegex(trimmed);                           // Escape metacharacters
};

export const createSafeRegexFilter = (field: string, input: any) => {
  const sanitized = sanitizeSearchInput(input);
  if (!sanitized) return {};
  return { [field]: { $regex: sanitized, $options: 'i' } };
};
```

### 7.4 User-Agent Blocking — `backend/src/middleware/uaBlockingMiddleware.ts`

Known malicious user agents (scanners, `sqlmap`, `nuclei`, aggressive crawlers) are blocked at the middleware layer, returning `403` before any business logic is reached. The blocklist is configurable via `SECURITY_UA_BLOCKING` environment variable.

---

## 8. Password Security

### 8.1 Hashing — `backend/src/models/User.ts`

Passwords are hashed with **bcrypt** at cost factor **12** (approximately 250 ms per operation) inside a Mongoose pre-save hook, ensuring plaintext is never persisted:

```typescript
userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  const salt = await bcrypt.genSalt(12);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});
```

The `password` field carries `select: false` — it is **never included** in query results unless explicitly requested with `.select('+password')`.

### 8.2 Password Policy — `backend/src/utils/passwordPolicy.ts`

Policy is loaded from `SystemConfig` in the database, hot-reloaded every 60 seconds, and enforced on registration, reset, and change flows:

| Setting | Default |
|---------|---------|
| `minLength` | 12 characters |
| `requireUppercase` | true |
| `requireLowercase` | true |
| `requireNumbers` | true |
| `requireSpecialChars` | true |
| `historyCount` | 5 (cannot reuse last 5 passwords) |

### 8.3 Breached Password Detection — `backend/src/utils/breachedPasswordCheck.ts`

New passwords are checked against the **HaveIBeenPwned** database using the **k-anonymity model**: only the first 5 characters of the SHA-1 hash are sent to the API, ensuring the full password is never transmitted:

```typescript
const sha1 = crypto.createHash('sha1').update(password).digest('hex').toUpperCase();
const prefix = sha1.substring(0, 5);  // Sent to HIBP
const suffix = sha1.substring(5);     // Compared locally

// Fail-open if HIBP unreachable (does not block registration)
if (breachResult.breached) {
  throw new ApiError(400,
    `This password has appeared in ${breachResult.count.toLocaleString()} data breaches.`
  );
}
```

### 8.4 Account Lockout — `backend/src/controllers/authController.ts`

Failed login attempts increment `user.failedLoginAttempts`. On reaching the configurable threshold (default **5 attempts**), `user.lockedUntil` is set to `now + lockoutDuration` (default **15 minutes**). The counter resets automatically on successful login.

| Setting | Source | Default |
|---------|--------|---------|
| `maxLoginAttempts` | `SystemConfig` | 5 |
| `lockoutDuration` | `SystemConfig` | 15 min |

Admin can unlock accounts immediately using `backend/unlock-user.js`.

### 8.5 Temporary Password Expiry

Admin-generated temporary passwords have a hard expiry stored in `user.tempPasswordExpiresAt`. On expiry, the account is **automatically deactivated** (`isActive = false`) until the admin re-enables it, preventing indefinite use of temporary credentials.

### 8.6 Password Expiration Enforcement — `backend/src/middleware/auth.ts`

The auth middleware reads `SystemConfig.securitySettings.password.expirationDays`. If the user's `passwordResetAt` field shows the password is older than `expirationDays + expirationGraceDays`, requests are blocked with `403 Password expired`. Response headers communicate remaining grace:

| Header | Meaning |
|--------|---------|
| `X-Password-Grace-Remaining` | Days left in grace period |
| `X-Password-Expiry-Warning` | Days until hard expiry |

Expiration checks are skipped for `/auth/` and `/users/change-password` routes so users can still log in and change their password.

---

## 9. Multi-Factor Authentication (MFA)

### Files: `backend/src/services/mfaService.ts`, `backend/src/models/MFA.ts`

Four MFA methods are supported, each with independent token storage and expiry:

| Method | Algorithm | Delivery | TTL |
|--------|-----------|----------|-----|
| TOTP | HMAC-SHA1 (speakeasy) | Authenticator app | 30-second windows ± 2 step tolerance |
| Email OTP | 6-digit random, bcrypt-hashed | SMTP | 5 minutes |
| SMS OTP | 6-digit random, bcrypt-hashed | Twilio/SMS provider | 5 minutes |
| Backup codes | 10 × 8-char hex, bcrypt-hashed | Shown at setup only | Single-use, permanent until consumed |

**OTP storage pattern:** OTPs are **never stored as plaintext**. They are hashed with bcrypt before persistence in the `PendingOTP` collection. A MongoDB TTL index automatically purges expired OTPs.

**TOTP secrets** in the `MFA` model use Mongoose getter/setter encryption (AES-256-CBC with `scryptSync` key derivation) — the secret is encrypted at the field level before hitting the database.

**Backup code generation:**

```typescript
// 10 × cryptographically random 8-char codes formatted as XXXX-XXXX
const code = crypto.randomBytes(4).toString('hex').toUpperCase().match(/.{1,4}/g)?.join('-');
const hashedCode = await bcrypt.hash(code.replace(/[-\s]/g, ''), 10);
```

**Step-up MFA on elevated risk:** The risk scoring engine (Section 14) can force MFA for medium-risk logins and block critical-risk ones entirely, independent of whether the user has globally enabled MFA.

**Trusted device bypass:** Once a device is verified and marked as trusted (fingerprint stored in `KnownDevice` model), it bypasses MFA on subsequent logins from that device.

---

## 10. IP Filtering & Blocklist Service

### 10.1 Blocklist Service — `backend/src/services/blocklistService.ts` (540+ lines)

A dual-layer (in-memory + MongoDB) IP blocklist provides fast lookups without sacrificing durability:

| Layer | Purpose |
|-------|---------|
| In-memory `Map<ip, BlockRecord>` | Sub-millisecond lookup on every request |
| `BlockedIP` MongoDB collection | Persistence across restarts, cross-process sharing |
| Auto-sync | DB → memory every 60 s; expired blocks pruned every 60 s |

**Block reasons (enum):** `bruteforce`, `suspicious_activity`, `malicious_pattern`, `admin_block`, `auto_block`, `repeated_csrf_failure`, `scanner_detected`, `excessive_404s`, `credential_stuffing`

**Key methods:**

```typescript
BlocklistService.isBlocked(ip)                    // Called per-request in ipReputationMiddleware
BlocklistService.block(ip, reason, durationMs)    // Auto-triggered by attack detectors
BlocklistService.recordSuspiciousEvent(ip, ...)   // Increments suspicion counter
BlocklistService.unblock(ip)                      // Admin-initiated unblock
```

### 10.2 IP Filter Middleware — `backend/src/middleware/ipFilter.ts`

Supports explicit allow/deny rules with **CIDR range matching**:

```typescript
function matchesRule(ip: string, ruleIP: string): boolean {
  if (!ruleIP.includes('/')) return ip === ruleIP;
  const [network, prefixStr] = ruleIP.split('/');
  const prefix = parseInt(prefixStr, 10);
  const mask = prefix === 0 ? 0 : ((0xffffffff << (32 - prefix)) >>> 0);
  return (ipToInt(network) & mask) === (ipToInt(ip) & mask);
}
```

Loopback addresses (`127.0.0.1`, `::1`) are always allowed. Rules are cached in memory with a 60-second TTL.

### 10.3 Suspicious 404 Rate Limiting — `backend/src/middleware/suspicious404Middleware.ts`

Tracks 404 responses per IP using a sliding window. When a configured threshold is exceeded (default **30 hits in 5 minutes**):

1. Records a suspicious event on `BlocklistService`
2. Sends a security alert via `securityAlertService` (email / Slack)
3. Auto-blocks the IP if the global suspicion threshold is also exceeded

### 10.4 Geolocation & Impossible Travel — `backend/src/utils/geolocationService.ts`

- Detects logins from new countries (+20 risk points)
- Detects impossible travel — calculates whether the user could physically travel between the last known location and new location within the elapsed time (+40 risk points)
- Results feed into the risk scoring engine (Section 14)

---

## 11. Attack Pattern Detection

### File: `backend/src/middleware/attackPatternMiddleware.ts` (150+ lines)

Every incoming path is matched against a list of 30+ malicious probe patterns. Matches return `403 Forbidden` — **not 404** — to avoid revealing whether the resource exists.

**Default blocked patterns:**

```
/.env, /.git, /.docker, /.aws, /.ssh         — Credential / config file probes
/.htaccess, /.htpasswd                        — Apache config files
/wp-admin, /wp-login.php, /xmlrpc.php        — WordPress scanners
/phpmyadmin, /adminer, /pma                  — Database administration tools
/actuator, /_profiler                         — Framework debug endpoints
/shell, /webshell, /cmd.php                  — Backdoor probes
/cgi-bin/                                     — Legacy CGI scanners
*.sql, *.sql.gz, *.bak                        — Database dump probes
/config.yml, /tsconfig.json                   — Build artifact probes
*.map                                         — Source map exposure
```

Custom patterns can be injected at runtime via the `SECURITY_BLOCK_PATHS` environment variable (supports regex syntax).

All blocked requests are logged with the offending path and source IP.

---

## 12. File Upload Security

### File: `backend/src/middleware/fileUploadValidator.ts`

File uploads are validated at three independent levels to prevent malicious uploads:

**1. Extension whitelist:** Only `.xlsx`, `.xls`, `.csv`, `.pdf`, `.jpg`, `.png` are accepted.

**2. MIME type validation:** Checked against a strict whitelist of allowed MIME types per extension.

**3. Magic byte verification:** The first bytes of each uploaded file are compared against the known binary signatures for the claimed format, catching file-type spoofing attacks:

```typescript
const MAGIC_BYTES = {
  xlsx: [0x50, 0x4b, 0x03, 0x04],  // PK.. (ZIP-based format)
  xls:  [0xd0, 0xcf, 0x11, 0xe0],  // D0CF (OLE compound document)
  pdf:  [0x25, 0x50, 0x44, 0x46],  // %PDF
};
```

**4. File size limits:** 100 MB maximum for Excel files; configurable for other types.

**5. Filename sanitisation:** Path traversal sequences (`../`, `..\`) and special characters are stripped. Filenames are additionally renamed to UUIDs on disk to prevent any residual path traversal:

```typescript
function sanitizeFilename(filename: string): string {
  let sanitized = filename.replace(/\.\.\//g, '').replace(/\.\.\\/g, '');
  sanitized = sanitized.replace(/[^a-zA-Z0-9._-]/g, '');
  sanitized = sanitized.replace(/^[\s.]+|[\s.]+$/g, '');
  return sanitized.substring(0, 100);
}
```

---

## 13. Response Sanitization & Data Leakage Prevention

### File: `backend/src/middleware/responseSanitization.ts`

A response-interceptor middleware wraps `res.json()` globally to scrub sensitive fields from all outgoing JSON payloads before they reach the client:

```typescript
res.json = function (body: any): Response {
  const sanitized = sanitizeObject(JSON.parse(JSON.stringify(body)));
  return originalJson.call(this, sanitized);
};
```

Auth token routes (`/auth/login`, `/auth/refresh`, `/csrf-token`) are explicitly exempt so tokens can be returned in their intended flows.

### File: `backend/src/utils/loggerSanitizer.ts`

All log outputs are recursively sanitised before writing, ensuring credentials never appear in log files or monitoring systems:

```typescript
const SENSITIVE_KEYS = [
  'password', 'pin', 'token', 'accesstoken', 'refreshtoken',
  'secret', 'apikey', 'authorization', 'bearer', 'cookie',
  'resetpasswordtoken', 'credentials', 'jwtSecret', 'r2secretaccesskey',
  // ... 20+ more
];
// Any matching key has its value replaced with '[REDACTED]'
```

---

## 14. Risk Scoring & Adaptive Authentication

### File: `backend/src/utils/riskScoringService.ts`

Every login attempt receives a dynamic risk score (0–100) computed from contextual signals. The outcome of the assessment controls the authentication response:

| Score Range | Level | Action |
|-------------|-------|--------|
| 0 – 30 | Low | Frictionless login |
| 31 – 60 | Medium | Require MFA (if enrolled) |
| 61 – 80 | High | Force MFA / email verification |
| 81 – 100 | Critical | Block login + alert admin |

**Risk weight table:**

| Signal | Weight |
|--------|--------|
| New IP (not seen in 30 days) | +8 |
| New device fingerprint | +10 |
| New country | +20 |
| Impossible travel | +40 |
| Off-hours login (20:00–06:00, weekends) | +5 |
| Failed login attempts in last hour | +3 per attempt |
| 30+ day absence | +10 |
| Known-bad IP (threat intel) | +30 |
| Admin/privileged account | +10 |

Risk assessments are stored in the audit trail alongside login events, creating a forensic record of every security decision.

---

## 15. Security Event Logging & Audit Trail

### 15.1 Security Event Logger — `backend/src/services/securityLogService.ts`

Dedicated security event model persists every noteworthy security occurrence:

**Event types (enum):** `UNAUTHORIZED_ACCESS`, `FORBIDDEN_ACCESS`, `CSRF_FAILURE`, `RATE_LIMIT_EXCEEDED`, `SUSPICIOUS_IP`, `ACCOUNT_LOCKED`, `MFA_FAILURE`, `BRUTE_FORCE_DETECTED`

**Severity levels:** `low`, `medium`, `high`, `critical`

All records include: `ip`, `userId`, `username`, `path`, `method`, `userAgent`, `timestamp`, `details`.

MongoDB TTL index auto-purges records older than 90 days.

### 15.2 Audit Log with Hash Chain — `backend/src/models/AuditLog.ts`

A comprehensive audit log tracks **every significant action** in the system. The log uses a **SHA-256 hash chain** (similar to AWS CloudTrail) to make it tamper-evident:

```typescript
export function computeAuditHash(entry, previousHash: string): string {
  const canonical = [
    entry.timestamp.toISOString(),
    entry.userId, entry.username, entry.action,
    entry.resourceType, entry.resourceId,
    entry.outcome, entry.ipAddress, entry.correlationId,
    previousHash,   // Links to the previous entry
  ].join('|');
  return createHash('sha256').update(canonical).digest('hex');
}
```

Any modification to a historical record breaks the hash chain, making tampering detectable.

**Audited action categories (50+ distinct actions):**

| Category | Actions |
|----------|---------|
| CRUD | `CREATE`, `UPDATE`, `DELETE`, `RESTORE`, `PERMANENT_DELETE`, `IMPORT` |
| Auth | `LOGIN`, `LOGOUT`, `FAILED_LOGIN`, `PASSWORD_RESET`, `TOKEN_REFRESH`, `SESSION_EXPIRED` |
| Access | `ACCESS_DENIED`, `ROLE_CHANGE`, `ACCOUNT_LOCKED`, `LOGIN_BLOCKED` |
| Data | `VIEW_SENSITIVE_DATA`, `EXPORT` |
| Sessions | `FORCE_LOGOUT`, `CONCURRENT_SESSION_KILL`, `SESSION_TERMINATED` |
| Accounts | `ACCOUNT_DEACTIVATED`, `ACCOUNT_ACTIVATED`, `ACCOUNT_BANNED` |
| System | `CONFIG_CHANGE`, `BULK_OPERATION`, `ENABLE_MAINTENANCE` |

**Risk scoring per action:** Each action carries a base risk score. High-risk events (`FAILED_LOGIN`: 40, `ACCESS_DENIED`: 50, `ROLE_CHANGE`: 65, `CONFIG_CHANGE`: 70) are elevated in monitoring dashboards.

---

## 16. HTTP Security Headers

### File: `backend/src/server.ts`

`helmet` is applied globally and configured to set the following headers on every response:

| Header | Value | Purpose |
|--------|-------|---------|
| `Content-Security-Policy` | Restrictive policy | Prevents XSS and data injection |
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains` | Enforces HTTPS for 1 year |
| `X-Frame-Options` | `DENY` | Prevents clickjacking via iframes |
| `X-Content-Type-Options` | `nosniff` | Prevents MIME-type sniffing |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | Controls referrer leakage |
| `X-XSS-Protection` | `0` (browser XSS filter disabled; CSP is used instead) | Modern XSS protection approach |
| `Permissions-Policy` | Restrictive | Disables powerful browser features |

**CORS configuration** restricts cross-origin requests to explicitly whitelisted origins using the `ALLOWED_ORIGINS` environment variable.

---

## 17. Environment & Secrets Management

### File: `backend/src/config/index.ts`

All secrets are loaded exclusively from environment variables with **no hardcoded fallbacks**. The `validateEnv()` function is called at startup and throws immediately if any required variable is absent:

```typescript
const required = ['MONGODB_URI', 'JWT_SECRET', 'JWT_REFRESH_SECRET'];

const productionRequired = process.env.NODE_ENV === 'production' ? [
  'BACKUP_ENCRYPTION_KEY',
  'FIELD_ENCRYPTION_KEY',
  'REDIS_URL',
] : [];

const missing = [...required, ...productionRequired].filter(key => !process.env[key]);
if (missing.length > 0) {
  throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
}
```

The application **refuses to start** rather than run in an insecure state. In production, encryption keys for field-level encryption and backup encryption are also mandatory.

---

## 18. Conditional Access Policies

### File: `backend/src/models/ConditionalAccessPolicy.ts`

Administrators can define dynamic access rules through the database — no code deployment required. Policies are evaluated in the `authenticate` middleware (cached with a 1-minute TTL) and can:

| Signal | Operators | Example use |
|--------|-----------|-------------|
| `role` | `in`, `not_in`, `equals`, `not_equals` | Block all `driver` roles from /api/admin/... |
| `ip_range` | CIDR matching | Allow only office IP range for admin actions |
| `time_of_day` | `between` | Block all logins outside 06:00–20:00 |
| `device_trusted` | `equals` | Require trusted device for super_admin |
| `country` | `in`, `not_in` | Block logins from specific countries |

**Policy actions:** `allow`, `block`, `require_mfa`, `notify_admin`

All conditions within a policy use **AND logic** — all signals must match for the policy action to trigger. Policies are prioritised numerically (lower number = higher priority).

---

## 19. Cryptographic Utilities

### File: `backend/src/utils/cryptoUtils.ts`

Utility functions for field-level encryption across all sensitive models:

**Algorithm:** `aes-256-gcm`  
**Key derivation:** PBKDF2-SHA256, **100,000 iterations**, 16-byte random salt per encryption  
**IV:** 16 bytes, random per encryption  
**Authentication tag:** 16 bytes — detects any ciphertext tampering  

```typescript
export function encryptData(plaintext: string, encryptionKey: string): string {
  const salt = crypto.randomBytes(16);
  const iv = crypto.randomBytes(16);
  const key = crypto.pbkdf2Sync(encryptionKey, salt, 100_000, 32, 'sha256');
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag();
  return JSON.stringify({ encrypted, iv: iv.toString('hex'), salt: salt.toString('hex'), authTag: authTag.toString('hex'), algorithm: 'aes-256-gcm' });
}

// Decryption verifies the auth tag — any tampered ciphertext throws
export function decryptData(encryptedPayload: string, encryptionKey: string): string {
  const { encrypted, iv, salt, authTag } = JSON.parse(encryptedPayload);
  const key = crypto.pbkdf2Sync(encryptionKey, Buffer.from(salt, 'hex'), 100_000, 32, 'sha256');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'hex'));
  decipher.setAuthTag(Buffer.from(authTag, 'hex'));  // Tamper detection
  return decipher.update(encrypted, 'hex', 'utf8') + decipher.final('utf8');
}
```

Used for: driver PII fields (`driverName`, `phoneNumber`), TOTP secrets, MFA phone numbers.

---

## 20. Security Architecture Summary

### Middleware Stack Order

The security middleware stack is applied in this deliberate order to ensure early rejection of malicious requests:

```
Request
   │
   ├── 1. helmet()                    — HTTP security headers
   ├── 2. cors()                      — Cross-origin policy
   ├── 3. express-mongo-sanitize      — NoSQL injection prevention
   ├── 4. attackPatternMiddleware     — Probe/scanner blocking (403 fast-fail)
   ├── 5. uaBlockingMiddleware        — Malicious user-agent blocking
   ├── 6. ipFilterMiddleware          — Allow/deny IP rules
   ├── 7. ipReputationMiddleware      — Blocklist check
   ├── 8. authRateLimiter / rateLimit — Per-endpoint rate limiting
   ├── 9. csrfMiddleware              — CSRF token validation (state-changing only)
   ├── 10. authenticate               — JWT verification + session check
   ├── 11. authorize(roles...)        — RBAC enforcement
   ├── 12. validation.*               — Input validation (express-validator)
   └── Controller                     — Business logic
```

### OWASP Top 10 Coverage

| OWASP Risk | Mitigation in this codebase |
|------------|----------------------------|
| A01 – Broken Access Control | RBAC (`authorize`), field-level policies, protected route patterns |
| A02 – Cryptographic Failures | AES-256-GCM field encryption, bcrypt hashing, SHA-256 token hashing |
| A03 – Injection | `express-mongo-sanitize`, parameterised queries, ReDoS-safe regex |
| A04 – Insecure Design | Defense-in-depth, risk scoring, conditional access policies |
| A05 – Security Misconfiguration | Startup `validateEnv()`, helmet headers, attack pattern blocking |
| A06 – Vulnerable Components | Validated library usage (bcrypt, speakeasy, jsonwebtoken) |
| A07 – Auth Failures | Dual-token, token rotation, account lockout, MFA, breached password check |
| A08 – Software Integrity | Audit hash chain, file upload magic-byte verification |
| A09 – Logging Failures | SecurityEventLogger, AuditLog, log sanitisation, TTL retention |
| A10 – SSRF | Geolocation only calls trusted APIs; file uploads validated by magic bytes not URLs |

---

*This document was generated from direct source analysis of the production codebase on April 22, 2026.*
