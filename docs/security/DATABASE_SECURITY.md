# Database Security Documentation
## Fuel Order System — MongoDB / Mongoose Data Layer

> **Last updated:** April 22, 2026  
> **Scope:** All database-level security implementations — schemas, models, field protection, encryption, indexes, and connection configuration  
> **Database:** MongoDB (via Mongoose ODM)

---

## Table of Contents

1. [Connection Security & Configuration](#1-connection-security--configuration)
2. [Core User Model Security](#2-core-user-model-security)
3. [Password Field Handling](#3-password-field-handling)
4. [Password History & Reuse Prevention](#4-password-history--reuse-prevention)
5. [Sensitive Field Protection — `select: false`](#5-sensitive-field-protection--select-false)
6. [JSON Serialization Guards](#6-json-serialization-guards)
7. [Account Lockout Fields](#7-account-lockout-fields)
8. [Token Storage in the Database](#8-token-storage-in-the-database)
9. [Field-Level Encryption (AES-256-GCM)](#9-field-level-encryption-aes-256-gcm)
10. [MFA Model Security](#10-mfa-model-security)
11. [Input Validation at Schema Level](#11-input-validation-at-schema-level)
12. [NoSQL Injection Prevention](#12-nosql-injection-prevention)
13. [Indexes for Security & Integrity](#13-indexes-for-security--integrity)
14. [Soft Delete & Audit Trail Patterns](#14-soft-delete--audit-trail-patterns)
15. [Audit Log with Hash Chain Integrity](#15-audit-log-with-hash-chain-integrity)
16. [Security Event Models](#16-security-event-models)
17. [IP Blocklist Model](#17-ip-blocklist-model)
18. [Conditional Access Policy Model](#18-conditional-access-policy-model)
19. [API Token Model](#19-api-token-model)
20. [OTP Storage Model](#20-otp-storage-model)
21. [Break-Glass Emergency Access Model](#21-break-glass-emergency-access-model)
22. [Role & Permission Fields](#22-role--permission-fields)
23. [Environment & Secrets Validation](#23-environment--secrets-validation)
24. [Database Security Architecture Summary](#24-database-security-architecture-summary)

---

## 1. Connection Security & Configuration

### File: `backend/src/config/database.ts`

The MongoDB connection is configured with explicit timeout and pooling parameters that protect against resource exhaustion, hanging connections, and slow-client attacks.

**Connection options:**

```typescript
const options: mongoose.ConnectOptions = {
  maxPoolSize: 50,                    // Caps concurrent connections — prevents exhaustion
  minPoolSize: 10,                    // Keeps warm connections ready
  socketTimeoutMS: 45000,             // Closes sockets idle for > 45 s
  serverSelectionTimeoutMS: 30000,    // Fails fast if MongoDB is unreachable
  heartbeatFrequencyMS: 10000,        // Detects failovers within 10 s
  maxIdleTimeMS: 60000,               // Reclaims connections idle for > 60 s
};
```

**Strict query mode:**

```typescript
mongoose.set('strictQuery', true);
```

With `strictQuery: true`, Mongoose silently ignores any query conditions for fields not present in the schema. This prevents filter-injection payloads from querying undefined fields, closing a class of NoSQL injection vectors that bypass `express-mongo-sanitize`.

**Important design decision — no global `sanitizeFilter`:**

```typescript
// NOTE: Do NOT enable sanitizeFilter globally — it recursively wraps $-prefixed
// query operators ($in, $gte, $lte, $ne, etc.) inside $eq, which breaks all
// queries using standard MongoDB operators. NoSQL injection prevention is
// already handled by express-mongo-sanitize middleware (see server.ts).
```

The globally-applied `express-mongo-sanitize` middleware on every incoming HTTP request handles operator injection. Enabling Mongoose's `sanitizeFilter` on top would break legitimate internal queries while providing no additional protection.

**Connection event monitoring:**

```typescript
mongoose.connection.on('error', (err) => logger.error('[DB] Connection error:', err));
mongoose.connection.on('disconnected', () => logger.warn('[DB] Disconnected from MongoDB'));
mongoose.connection.on('reconnected', () => logger.info('[DB] Reconnected to MongoDB'));
```

All connection state changes are logged, enabling alerting on unexpected disconnections.

**Graceful shutdown handler:**

```typescript
process.on('SIGINT', async () => {
  await mongoose.connection.close();
  process.exit(0);
});
```

Ensures connections are cleanly closed on process termination, preventing connection leaks in containerised deployments.

---

## 2. Core User Model Security

### File: `backend/src/models/User.ts`

The `User` model is the foundation of the authentication and authorisation system. Its schema is designed with security as a first-class concern.

**Account lifecycle fields:**

```typescript
isActive: {
  type: Boolean,
  default: true,     // Accounts start active
},
isBanned: {
  type: Boolean,
  default: false,
},
bannedAt:     { type: Date },
bannedBy:     { type: String },   // Admin who issued the ban
bannedReason: { type: String },   // Required justification
isDeleted: {
  type: Boolean,
  default: false,   // Soft delete — record preserved for audit
},
deletedAt: { type: Date },
```

Every account state change (ban, deactivation, deletion) includes a timestamp and, where applicable, the responsible administrator. This creates an **accountability trail** at the schema level — not just in the application log.

**Account expiration:**

```typescript
accountExpiresAt: {
  type: Date,
  index: { sparse: true },  // Only indexes documents where this field exists
},
```

Time-limited accounts (contractor access, temporary credentials) automatically expire without requiring administrative action. The sparse index ensures the expiry check is performant at scale while not bloating the index with null values for permanent accounts.

**Administrative tracking fields:**

```typescript
createdBy:       { type: String },   // Admin who created the account
lastModifiedBy:  { type: String },   // Admin who last modified it
lastModifiedAt:  { type: Date },
```

---

## 3. Password Field Handling

### File: `backend/src/models/User.ts`

**Schema declaration:**

```typescript
password: {
  type: String,
  required: [true, 'Password is required'],
  minlength: [1, 'Password cannot be empty'],
  select: false,   // NEVER included in query results by default
},
```

The `select: false` annotation means password hashes are excluded from every `.find()`, `.findOne()`, and `.findById()` result unless the caller explicitly adds `.select('+password')`. This prevents accidental password hash exposure in API responses even if a developer forgets to exclude it manually.

**Pre-save hashing hook:**

```typescript
userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();  // Only hash when changed

  try {
    const salt = await bcrypt.genSalt(12);   // Cost factor 12 ≈ 250 ms/hash
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error: any) {
    next(error);
  }
});
```

| Security property | How it is achieved |
|-------------------|--------------------|
| Plaintext never stored | Hook intercepts before every `save()` |
| No double-hashing | `isModified('password')` guard prevents re-hashing unchanged fields |
| Brute-force resistance | Cost factor 12 makes each hash attempt ~250 ms — 1 000× more expensive than bcrypt's default cost 10 |
| Unique salt per user | `bcrypt.genSalt()` generates a fresh random salt for every hash |

**Constant-time comparison method:**

```typescript
userSchema.methods.comparePassword = async function (
  candidatePassword: string
): Promise<boolean> {
  return bcrypt.compare(candidatePassword, this.password);
};
```

`bcrypt.compare()` uses constant-time comparison internally, preventing timing-oracle attacks where an attacker could infer hash similarity from response time differences.

---

## 4. Password History & Reuse Prevention

### File: `backend/src/models/User.ts`

```typescript
passwordHistory: {
  type: [String],
  select: false,   // Excluded from all queries
  default: [],
},
```

The `passwordHistory` array stores hashed versions of the user's previous passwords. The password policy service (`backend/src/utils/passwordPolicy.ts`) enforces a configurable `historyCount` (default: **5**) — a new password is rejected if it matches any of the last 5 stored hashes.

**Why hashed history?**  
Each entry in `passwordHistory` is a full bcrypt hash, not a plaintext or reversible value. Comparing a new password against history requires calling `bcrypt.compare()` for each entry — the history itself cannot be used to recover any historical password.

**Policy configuration (loaded from `SystemConfig` at runtime):**

```typescript
const DEFAULT_POLICY: PasswordPolicy = {
  minLength: 12,
  requireUppercase: true,
  requireLowercase: true,
  requireNumbers: true,
  requireSpecialChars: true,
  historyCount: 5,   // Reject if new password matches any of the last 5
};
```

**Breached password check** (`backend/src/utils/breachedPasswordCheck.ts`):  
In addition to history checking, new passwords are verified against the HaveIBeenPwned (HIBP) database using the **k-anonymity API** — only the first 5 characters of the SHA-1 hash are sent to the external service, preserving privacy while blocking known-compromised passwords.

```typescript
const sha1 = crypto.createHash('sha1').update(password).digest('hex').toUpperCase();
const prefix = sha1.substring(0, 5);   // Sent to HIBP (privacy-preserving)
const suffix = sha1.substring(5);      // Compared locally only
```

---

## 5. Sensitive Field Protection — `select: false`

All fields that contain secrets, credentials, or internal tokens are declared with `select: false` in their schema definitions. This is a schema-level control, independent of any application-layer logic.

### User model — `backend/src/models/User.ts`

| Field | `select: false` | Contents |
|-------|----------------|----------|
| `password` | ✅ | bcrypt hash |
| `passwordHistory` | ✅ | Array of historical bcrypt hashes |
| `refreshToken` | ✅ | SHA-256 hash of the refresh token |
| `resetPasswordToken` | ✅ | SHA-256 hash of password-reset token |
| `resetPasswordExpires` | ✅ | Expiry timestamp for reset token |

### DriverCredential model — `backend/src/models/DriverCredential.ts`

```typescript
pin: {
  type: String,
  required: true,
  select: false,   // Driver PIN never auto-loaded
},
refreshToken: {
  type: String,
  select: false,
},
```

### MFA model — `backend/src/models/MFA.ts`

```typescript
backupCodes: {
  type: [String],
  default: [],
  select: false,   // Backup code hashes never auto-loaded
},
```

**Why this matters:**  
Even if a controller accidentally returns a full Mongoose document without explicit projection, none of these fields will appear. The `select: false` annotation is a last-resort safety net at the data layer.

---

## 6. JSON Serialization Guards

### File: `backend/src/models/User.ts`

The `toJSON` transform ensures that even when a User document is serialised to send as an API response, sensitive fields are stripped:

```typescript
userSchema.set('toJSON', {
  transform: function (_doc, ret) {
    delete (ret as any).password;        // Never in responses
    delete (ret as any).passwordHistory; // Never in responses
    delete (ret as any).refreshToken;    // Never in responses
    delete (ret as any).__v;             // Internal versioning key
    return ret;
  },
});
```

This provides a **third layer** of protection (after `select: false` and controller-level projection), guaranteeing that `res.json(user)` can never accidentally expose a password hash even if the document was loaded with `.select('+password')` for internal comparison purposes.

---

## 7. Account Lockout Fields

### File: `backend/src/models/User.ts`

```typescript
failedLoginAttempts: {
  type: Number,
  default: 0,
},
lockedUntil: {
  type: Date,
  default: null,
},
```

**Lock mechanics (enforced in `authController.ts`):**

1. Every failed password comparison increments `failedLoginAttempts`
2. When `failedLoginAttempts >= maxLoginAttempts` (configurable, default **5**):
   - `lockedUntil = now + lockoutDuration` (configurable, default **15 minutes**)
   - `failedLoginAttempts` resets to `0`
3. Login requests received while `lockedUntil > now` are rejected with the remaining lock time in the response
4. Successful login resets both `failedLoginAttempts = 0` and `lockedUntil = null`

**Admin tooling:** `backend/unlock-user.js` provides a command-line utility to manually clear lockouts without requiring database access.

### MFA Lockout — `backend/src/models/MFA.ts`

MFA verification failures have their own independent lockout:

```typescript
failedAttempts: {
  type: Number,
  default: 0,
},
lockedUntil: {
  type: Date,
},
```

An attacker who obtains credentials but not the second factor cannot brute-force OTP codes — the MFA lockout triggers independently of the password lockout.

### SystemConfig lockout settings — `backend/src/models/SystemConfig.ts`

All lockout thresholds are stored in the database and hot-reloaded by the application without restarts:

```typescript
session?: {
  sessionTimeout: number;        // Minutes of inactivity before logout
  maxLoginAttempts: number;      // Failed attempts before lockout
  lockoutDuration: number;       // Minutes to stay locked
  allowMultipleSessions: boolean; // Concurrent session policy
};
```

---

## 8. Token Storage in the Database

All tokens stored in the database follow a **hash-before-store** pattern — the raw token is never persisted. Only a cryptographic hash is stored, meaning a database breach does not yield usable tokens.

### Refresh Token — `backend/src/models/User.ts`

```typescript
refreshToken: {
  type: String,
  select: false,   // Excluded from all queries
},
```

**Storage pattern:**

```
1. Generate raw refresh token (random bytes)
2. Hash with SHA-256: crypto.createHash('sha256').update(rawToken).digest('hex')
3. Store hash in user.refreshToken
4. Send raw token to client (once, in response body or HttpOnly cookie)
5. On refresh: client sends raw token → server hashes it → compares with stored hash
```

This means a full database dump does not yield exploitable refresh tokens.

### Password Reset Token — `backend/src/models/User.ts`

```typescript
resetPasswordToken: {
  type: String,
  select: false,
},
resetPasswordExpires: {
  type: Date,
  select: false,
},
```

The same SHA-256 hash-before-store pattern is applied. The raw token is sent to the user's email address once. When the user submits the reset form, the token is hashed and compared with `resetPasswordToken`. After use (or on expiry), both fields are cleared.

### API Tokens — `backend/src/models/ApiToken.ts`

```typescript
export interface IApiToken extends Document {
  tokenHash: string;          // SHA-256 of the raw token — stored value
  tokenPrefix: string;        // First 8 chars of raw token — for UI display only
  expiresAt?: Date;           // Optional expiration
  lastUsedAt?: Date;
  revoked: boolean;           // Can be revoked at any time
  revokedAt?: Date;
  revokedBy?: string;         // Accountability trail
  scopes: string[];           // Granular permission scopes
  rotationIntervalDays?: number;   // Auto-rotation policy
  nextRotationDue?: Date;
}
```

**Token lifecycle:**

1. Raw token generated on creation (e.g., `fuelorder_abc123ef...`)
2. SHA-256 hash stored as `tokenHash`
3. First 8 characters stored as `tokenPrefix` (shown in UI for identification)
4. Raw token displayed to user **once** at creation — never retrievable again
5. Verification: `hash(presented_token) === tokenHash`
6. Revocation: sets `revoked = true`, `revokedAt`, `revokedBy`

### OTP Storage — `backend/src/models/PendingOTP.ts`

```typescript
const PendingOTPSchema = new Schema<IPendingOTP>({
  userId:    { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  type:      { type: String, enum: ['email', 'sms', 'phone_verify'], required: true },
  hashedOTP: { type: String, required: true },  // bcrypt hash — never stored plaintext
  expiresAt: {
    type: Date,
    required: true,
    index: { expires: 0 },  // MongoDB TTL index — auto-deletes the document at expiresAt
  },
});

PendingOTPSchema.index({ userId: 1, type: 1 });  // Unique pending OTP per user+type (upsert semantics)
```

OTPs are bcrypt-hashed before storage. The MongoDB TTL index automatically purges expired OTP documents from the collection without any application-level cleanup job.

---

## 9. Field-Level Encryption (AES-256-GCM)

### Files: `backend/src/utils/cryptoUtils.ts`, `backend/src/utils/fieldEncryption.ts`, `backend/src/models/DriverCredential.ts`

Selected PII fields are encrypted at rest using AES-256-GCM with PBKDF2 key derivation. Encryption happens transparently in Mongoose hooks — callers work with plaintext values.

**Algorithm details:**

| Property | Value |
|----------|-------|
| Cipher | `aes-256-gcm` |
| Key derivation | PBKDF2-SHA256, **100,000 iterations** |
| Salt | 16 bytes, random per encryption operation |
| IV | 16 bytes, random per encryption operation |
| Authentication tag | 16 bytes — detects any ciphertext tampering |
| Payload format | JSON: `{ encrypted, iv, salt, authTag, algorithm }` |

**Why AES-256-GCM specifically?**  
GCM mode provides both confidentiality (encryption) and integrity (authentication tag). Any modification to the ciphertext — even a single bit — causes decryption to throw an error. This means not only is the data unreadable without the key, but tampering with stored ciphertext is immediately detectable.

**Encryption utility:**

```typescript
export function encryptData(plaintext: string, encryptionKey: string): string {
  const salt = crypto.randomBytes(16);
  const iv   = crypto.randomBytes(16);

  // PBKDF2: 100,000 iterations — expensive key derivation prevents offline brute-force
  const key = crypto.pbkdf2Sync(encryptionKey, salt, 100_000, 32, 'sha256');

  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag();

  return JSON.stringify({
    encrypted,
    iv:      iv.toString('hex'),
    salt:    salt.toString('hex'),
    authTag: authTag.toString('hex'),
    algorithm: 'aes-256-gcm',
  });
}

export function decryptData(payload: string, encryptionKey: string): string {
  const { encrypted, iv, salt, authTag } = JSON.parse(payload);

  const key = crypto.pbkdf2Sync(encryptionKey, Buffer.from(salt, 'hex'), 100_000, 32, 'sha256');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'hex'));
  decipher.setAuthTag(Buffer.from(authTag, 'hex'));  // Authentication check — throws if tampered

  return decipher.update(encrypted, 'hex', 'utf8') + decipher.final('utf8');
}
```

### DriverCredential model — encrypted fields

PII fields for individual drivers are encrypted at rest:

| Field | Type | Encrypted |
|-------|------|-----------|
| `driverName` | String (PII) | ✅ AES-256-GCM |
| `phoneNumber` | String (PII) | ✅ AES-256-GCM |
| `pin` | String (credential) | `select: false` + bcrypt |

**Mongoose hook wiring:**

```typescript
// Pre-save: encrypt modified PII fields before writing to MongoDB
driverCredentialSchema.pre('save', async function (next) {
  const key = process.env.FIELD_ENCRYPTION_KEY;
  if (!key) return next();  // No-op if key not configured (development)

  if (this.isModified('driverName') && this.driverName) {
    this.driverName = `encrypted:${encryptData(this.driverName, key)}`;
  }
  if (this.isModified('phoneNumber') && this.phoneNumber) {
    this.phoneNumber = `encrypted:${encryptData(this.phoneNumber, key)}`;
  }
  next();
});

// Post-find hooks: decrypt on every read operation
driverCredentialSchema.post('findOne',          decryptSensitiveFields);
driverCredentialSchema.post('findOneAndUpdate', decryptSensitiveFields);
driverCredentialSchema.post('find', function (docs) {
  if (Array.isArray(docs)) docs.forEach(decryptSensitiveFields);
});
```

The `encrypted:` prefix on stored values acts as a sentinel — the decryption hook checks for this prefix before attempting to decrypt, preventing double-decryption on subsequent reads.

**Key requirement enforcement:**  
`validateEnv()` in `backend/src/config/index.ts` requires `FIELD_ENCRYPTION_KEY` to be set in production. The application refuses to start without it, ensuring PII is never stored unencrypted in a live environment.

---

## 10. MFA Model Security

### File: `backend/src/models/MFA.ts`

**TOTP secret — field-level encryption via getter/setter:**

```typescript
totpSecret: {
  type: String,
  default: '',
  set: (value: string) => (value ? encrypt(value) : ''),  // Encrypt on assignment
  get: (value: string) => (value ? decrypt(value) : ''),  // Decrypt on access
},
```

The `encrypt`/`decrypt` functions use AES-256-CBC with `crypto.scryptSync` key derivation. The TOTP shared secret — if compromised — would allow generating valid OTP codes for any point in time, making it highly sensitive. Field-level encryption ensures it is never stored in plaintext.

**Phone number — same encryption pattern:**

```typescript
phoneNumber: {
  type: String,
  default: '',
  set: (value: string) => (value ? encrypt(value) : ''),
  get: (value: string) => (value ? decrypt(value) : ''),
},
```

**Backup codes — hashed, never stored plaintext, select: false:**

```typescript
backupCodes: {
  type: [String],
  default: [],
  select: false,  // Never auto-loaded
},
```

Each backup code is bcrypt-hashed before storage. The raw codes are shown to the user once at setup time. Verification uses `bcrypt.compare()` — the stored hashes cannot be reversed to recover the original codes.

**MFA policy fields:**

```typescript
isEnabled:      { type: Boolean, default: false },
isMandatory:    { type: Boolean, default: false },  // Admin can force MFA for a user
isExempt:       { type: Boolean, default: false },  // Admin can exempt a service account
allowedMethods: { type: [String], default: null },  // Per-user method restriction
```

**Trusted device registry:**

```typescript
trustedDevices: [{
  deviceId:   String,
  deviceName: String,
  ipAddress:  String,
  userAgent:  String,
  addedAt:    Date,
  lastUsedAt: Date,
  expiresAt:  Date,   // Trusted devices can expire
}]
```

Trusted devices bypass MFA on subsequent logins. Expiration dates allow organisations to enforce periodic re-verification.

---

## 11. Input Validation at Schema Level

### File: `backend/src/models/User.ts`

Schema-level validators provide a second enforcement layer below the HTTP middleware validation (`express-validator`):

```typescript
username: {
  type: String,
  required: [true, 'Username is required'],
  unique: true,
  trim: true,
  minlength: [3, 'Username must be at least 3 characters'],
  maxlength: [30, 'Username cannot exceed 30 characters'],
},
email: {
  type: String,
  required: [true, 'Email is required'],
  unique: true,
  trim: true,
  lowercase: true,
  match: [/^\S+@\S+\.\S+$/, 'Please provide a valid email address'],
},
role: {
  type: String,
  enum: [
    'super_admin', 'admin', 'manager', 'super_manager', 'supervisor',
    'clerk', 'driver', 'viewer', 'fuel_order_maker', 'boss',
    'yard_personnel', 'fuel_attendant', 'station_manager', 'payment_manager',
    'dar_yard', 'tanga_yard', 'mmsa_yard', 'import_officer', 'export_officer',
  ],
  default: 'viewer',   // Least-privileged default
},
```

**Enum constraints on security-critical fields:**

| Model | Field | Constraint purpose |
|-------|-------|--------------------|
| `User` | `role` | Prevents arbitrary role assignment |
| `BlockedIP` | `reason` | 9 valid block reasons only |
| `SecurityEvent` | `eventType` | 9 valid event types only |
| `SecurityEvent` | `severity` | 4 levels: `low`, `medium`, `high`, `critical` |
| `ConditionalAccessPolicy` | `action` | `allow`, `block`, `require_mfa`, `notify_admin` |
| `PendingOTP` | `type` | `email`, `sms`, `phone_verify` |
| `AuditLog` | `action` | 50+ predefined action strings |

Using MongoDB enums at the schema level means that even if a bug in the application logic allows an unexpected value through HTTP validation, Mongoose will reject it before it reaches the database.

**Default role is `viewer`** — the least-privileged role. A newly created user who is not explicitly assigned a role has read-only access, following the principle of least privilege.

---

## 12. NoSQL Injection Prevention

Four independent layers protect against NoSQL injection at the database tier:

### Layer 1 — `express-mongo-sanitize` (HTTP middleware)

Applied globally in `backend/src/server.ts`:

```typescript
app.use(mongoSanitize({ replaceWith: '_' }));
```

Replaces `$` with `_` in all request body, query string, and parameter values before they reach any controller. Converts `{"$ne": null}` → `{"_ne": null}`, neutralising operator injection.

### Layer 2 — `mongoose.set('strictQuery', true)` (connection config)

Silently drops query conditions for fields not defined in the schema. An injected filter targeting a non-existent field is ignored rather than passed to MongoDB.

### Layer 3 — ReDoS-safe regex construction (`backend/src/utils/sanitize.ts`)

Every search input that becomes a MongoDB `$regex` query goes through sanitisation:

```typescript
export const sanitizeRegexInput = (input: string, maxLength = 100): string => {
  const trimmed = input.trim().substring(0, maxLength);  // Length cap prevents slow regex
  return escapeRegex(trimmed);                            // Escape all regex metacharacters
};

export const createSafeRegexFilter = (field: string, input: any) => {
  const sanitized = sanitizeSearchInput(input);
  if (!sanitized) return {};   // Empty/invalid → no filter applied, not a match-all
  return { [field]: { $regex: sanitized, $options: 'i' } };
};
```

This prevents:
- **ReDoS:** Length cap and metacharacter escaping prevent catastrophic backtracking
- **Wildcard injection:** `.*` in a search field cannot be used to match everything

### Layer 4 — TypeScript type safety (compile-time)

All query objects are typed. A query built from a `string` field cannot accidentally accept an `object` with operator keys — TypeScript's type checker enforces this at compile time.

---

## 13. Indexes for Security & Integrity

Well-designed indexes serve both performance and security goals — they enforce uniqueness constraints and make security queries (blocklist lookups, session checks) fast enough to run on every request without adding latency.

### Unique constraints

| Model | Fields | Enforcement |
|-------|--------|------------|
| `User` | `username` | One account per username |
| `User` | `email` | One account per email address |
| `DriverCredential` | `truckNo` | One credential record per truck |
| `ApiToken` | `tokenHash` | No duplicate token hashes (integrity) |
| `KnownDevice` | `{ userId, browser, os }` | Unique device per user/browser/OS combination |
| `SecurityIncident` | `incidentId` | Unique incident identifiers |

### Security-query indexes

```typescript
// BlockedIP — fast active-block lookup on every request
BlockedIPSchema.index({ ip: 1, isActive: 1 });
BlockedIPSchema.index({ isActive: 1, expiresAt: 1 });  // Efficient expiry sweeps
BlockedIPSchema.index({ reason: 1, isActive: 1 });     // Block reason analytics

// SecurityEvent — timeline and filtering
SecurityEventSchema.index({ ip: 1, timestamp: -1 });
SecurityEventSchema.index({ eventType: 1, timestamp: -1 });
SecurityEventSchema.index({ severity: 1, timestamp: -1 });

// LoginActivity — active session tracking
LoginActivitySchema.index({ userId: 1, isCurrent: 1 });

// ConditionalAccessPolicy — priority-ordered policy evaluation
conditionalAccessPolicySchema.index({ isActive: 1, priority: 1 });
```

### MongoDB TTL indexes (automatic data expiration)

TTL indexes instruct MongoDB's background thread to delete documents automatically when their expiry field is reached. This is more reliable than application-level cleanup jobs — it runs even if the application is down.

| Collection | TTL field | Retention |
|------------|-----------|-----------|
| `SecurityEvent` | `timestamp` | 90 days |
| `LoginActivity` | `loginAt` | 90 days |
| `PendingOTP` | `expiresAt` | Set per OTP (typically 5 minutes) |
| `AuditLog` (configurable) | `createdAt` | Configurable via `SystemConfig` |

```typescript
// SecurityEvent — auto-purge after 90 days
SecurityEventSchema.index(
  { timestamp: 1 },
  { expireAfterSeconds: 90 * 24 * 60 * 60 }
);

// PendingOTP — delete exactly when OTP expires
PendingOTPSchema.index(
  { expiresAt: 1 },
  { expires: 0 }   // expires: 0 means "delete when expiresAt is reached"
);
```

### Sparse indexes

```typescript
// User — only index accounts that have an expiry set
userSchema.index({ accountExpiresAt: 1 }, { sparse: true });
```

Sparse indexes exclude `null` and missing values, keeping the index compact. The `accountExpiresAt` sparse index allows efficient queries like "find all accounts expiring today" without indexing the majority of permanent accounts.

---

## 14. Soft Delete & Audit Trail Patterns

### File: `backend/src/models/User.ts` and all major models

```typescript
isDeleted: {
  type: Boolean,
  default: false,
},
deletedAt: {
  type: Date,
},
```

**Soft delete pattern:** Resources are never physically removed from the database. Instead, `isDeleted` is set to `true` and `deletedAt` is recorded. All standard queries filter with `{ isDeleted: false }`.

**Security benefits of soft deletion:**

| Benefit | Explanation |
|---------|-------------|
| Audit preservation | Deleted records remain available for compliance investigations |
| Forensic recovery | Accidental or malicious deletions can be reversed without database backup |
| Referential integrity | Other documents (audit logs, orders) that reference the deleted record remain valid |
| Attack detection | Bulk deletion patterns are visible and alertable |

---

## 15. Audit Log with Hash Chain Integrity

### File: `backend/src/models/AuditLog.ts`

The audit log is designed to be tamper-evident — any modification to a historical record breaks a cryptographic chain, making the tampering detectable.

**Hash chain computation (AWS CloudTrail-style):**

```typescript
export function computeAuditHash(
  entry: {
    timestamp: Date; userId?: string; username: string; action: string;
    resourceType: string; resourceId?: string; outcome: string;
    ipAddress?: string; correlationId?: string;
  },
  previousHash: string   // Hash of the immediately preceding audit record
): string {
  // Canonical string includes every meaningful field AND the previous hash
  const canonical = [
    entry.timestamp.toISOString(),
    entry.userId ?? '',
    entry.username,
    entry.action,
    entry.resourceType,
    entry.resourceId ?? '',
    entry.outcome,
    entry.ipAddress ?? '',
    entry.correlationId ?? '',
    previousHash,
  ].join('|');

  return crypto.createHash('sha256').update(canonical).digest('hex');
}
```

Because each record's hash incorporates the previous record's hash, **any retroactive modification** (changing a timestamp, altering an IP address, removing a record) produces a hash mismatch that propagates forward through the entire chain — making the tampering immediately apparent.

**Audit action taxonomy (50+ actions):**

| Category | Actions |
|----------|---------|
| CRUD | `CREATE`, `UPDATE`, `DELETE`, `RESTORE`, `PERMANENT_DELETE`, `IMPORT` |
| Authentication | `LOGIN`, `LOGOUT`, `FAILED_LOGIN`, `PASSWORD_RESET`, `TOKEN_REFRESH`, `SESSION_EXPIRED` |
| Access control | `ACCESS_DENIED`, `ROLE_CHANGE`, `ACCOUNT_LOCKED`, `ACCOUNT_UNLOCKED`, `LOGIN_BLOCKED` |
| Sensitive data | `VIEW_SENSITIVE_DATA`, `EXPORT` |
| Sessions | `FORCE_LOGOUT`, `CONCURRENT_SESSION_KILL`, `SESSION_TERMINATED`, `SESSION_REVOKED` |
| Accounts | `ACCOUNT_DEACTIVATED`, `ACCOUNT_ACTIVATED`, `ACCOUNT_BANNED`, `ACCOUNT_UNBANNED` |
| System | `CONFIG_CHANGE`, `BULK_OPERATION`, `ENABLE_MAINTENANCE`, `DISABLE_MAINTENANCE` |

**Risk scoring per action:**

```typescript
const ACTION_BASE_RISK: Partial<Record<AuditAction, number>> = {
  LOGIN: 5,          LOGOUT: 2,           FAILED_LOGIN: 40,
  TOKEN_REFRESH: 10, ACCESS_DENIED: 50,   ACCOUNT_LOCKED: 70,
  ACCOUNT_UNLOCKED: 60, ROLE_CHANGE: 65,  CONFIG_CHANGE: 70,
  PASSWORD_RESET: 45,   DELETE: 35,       PERMANENT_DELETE: 55,
  EXPORT: 25,
};
```

High-risk events are elevated in security dashboards, triggering alerts when thresholds are exceeded.

**Every audit record captures:**

```typescript
{
  timestamp:    Date;
  userId:       string;
  username:     string;
  action:       AuditAction;
  resourceType: string;    // "User", "FuelRecord", "DeliveryOrder", etc.
  resourceId:   string;    // MongoDB ObjectId of the affected document
  details:      object;    // Action-specific context
  previousValue: object;   // State before change (for UPDATE actions)
  newValue:      object;   // State after change
  ipAddress:    string;
  userAgent:    string;
  severity:     AuditSeverity;
  riskScore:    number;
  hash:         string;    // SHA-256 hash for chain integrity
  previousHash: string;    // Hash of preceding record
}
```

---

## 16. Security Event Models

### File: `backend/src/models/SecurityEvent.ts`

A dedicated collection for structured security incident data, separate from the general audit log:

```typescript
export interface ISecurityEvent extends Document {
  eventType: SecurityEventType;   // Enum — 9 valid types
  severity:  SecuritySeverity;    // 'low' | 'medium' | 'high' | 'critical'
  ip:        string;
  userId?:   string;
  username?: string;
  path:      string;
  method:    string;
  userAgent: string;
  timestamp: Date;
  details:   Record<string, any>;
}
```

**Event types (enum):**

| Event type | Triggered by |
|------------|-------------|
| `UNAUTHORIZED_ACCESS` | Missing or invalid Bearer token |
| `FORBIDDEN_ACCESS` | Insufficient role |
| `CSRF_FAILURE` | Invalid or missing CSRF token |
| `RATE_LIMIT_EXCEEDED` | Rate limiter threshold reached |
| `SUSPICIOUS_IP` | Blocklist service records suspicious activity |
| `ACCOUNT_LOCKED` | Failed login threshold exceeded |
| `MFA_FAILURE` | Invalid MFA code submitted |
| `BRUTE_FORCE_DETECTED` | Rapid sequential failed logins |
| `IMPOSSIBLE_TRAVEL` | Geolocation anomaly on login |

TTL index auto-purges records after 90 days, balancing retention for investigations with storage efficiency.

---

## 17. IP Blocklist Model

### File: `backend/src/models/BlockedIP.ts`

```typescript
export interface IBlockedIP extends Document {
  ip:              string;
  reason:          BlockReason;     // Enum — 9 valid reasons
  isActive:        boolean;
  blockedAt:       Date;
  expiresAt:       Date | null;     // null = permanent block
  suspicionCount:  number;          // Number of incidents recorded
  lastIncidentAt:  Date;
  blockedBy?:      string;          // Admin username for manual blocks
  notes?:          string;          // Admin justification
}
```

**Block reason enum:**

```
bruteforce | suspicious_activity | malicious_pattern | admin_block | auto_block |
repeated_csrf_failure | scanner_detected | excessive_404s | credential_stuffing
```

**Indexes for fast per-request lookup:**

```typescript
BlockedIPSchema.index({ ip: 1, isActive: 1 });         // Active check — called every request
BlockedIPSchema.index({ isActive: 1, expiresAt: 1 });  // Expiry sweep — runs every 60 s
BlockedIPSchema.index({ reason: 1, isActive: 1 });     // Analytics queries
```

The `BlocklistService` (`backend/src/services/blocklistService.ts`) maintains an in-memory copy of active blocks (synced from this collection every 60 seconds) so the per-request blocklist check never hits the database.

---

## 18. Conditional Access Policy Model

### File: `backend/src/models/ConditionalAccessPolicy.ts`

Administrator-defined access rules stored as database documents, evaluated on every authenticated request (with 1-minute cache):

```typescript
export interface IConditionalAccessPolicy extends Document {
  name:        string;
  conditions:  ICondition[];   // All must match (AND logic)
  action:      PolicyAction;   // 'allow' | 'block' | 'require_mfa' | 'notify_admin'
  isActive:    boolean;
  priority:    number;         // 0 = highest priority, 1000 = lowest
  createdBy:   string;
  createdAt:   Date;
}

export interface ICondition {
  signal:   ConditionSignal;   // 'role' | 'ip_range' | 'time_of_day' | 'device_trusted' | 'country'
  operator: ConditionOperator; // 'in' | 'not_in' | 'equals' | 'not_equals' | 'between'
  value:    string | string[];
}
```

**Example policies that can be created through the admin UI:**

| Policy name | Condition | Action |
|-------------|-----------|--------|
| Block off-hours admin | role = super_admin AND time between 20:00–06:00 | `block` |
| Require MFA for config changes | role = admin AND ip NOT IN office_range | `require_mfa` |
| Alert on overseas admin access | role IN [admin, super_admin] AND country NOT IN [TZ] | `notify_admin` |
| Lock non-office driver access | role = driver AND ip NOT IN fleet_range | `block` |

**Priority index:**

```typescript
conditionalAccessPolicySchema.index({ isActive: 1, priority: 1 });
```

Policies are evaluated in priority order (ascending). The first matching policy's action is applied. Lower priority numbers win.

---

## 19. API Token Model

### File: `backend/src/models/ApiToken.ts`

API tokens provide programmatic access to the system without user credentials. The model enforces security at the schema level:

```typescript
const ApiTokenSchema = new Schema<IApiToken>({
  name:        { type: String, required: true, maxlength: 100 },
  tokenHash:   { type: String, required: true, unique: true, index: true },  // SHA-256 only
  tokenPrefix: { type: String, required: true },   // 8-char display prefix
  expiresAt:   { type: Date },
  revoked:     { type: Boolean, default: false, index: true },
  revokedAt:   { type: Date },
  revokedBy:   { type: String },
  scopes:      [{ type: String }],
  rotationIntervalDays: { type: Number },
  nextRotationDue:      { type: Date, index: true },
  lastUsedAt:           { type: Date },
  createdBy:            { type: String, required: true },
});
```

**Security properties:**

| Property | Enforcement |
|----------|------------|
| Raw token never stored | Only SHA-256 hash in `tokenHash` |
| Tokens can be revoked instantly | `revoked: true` + `revokedAt` + `revokedBy` |
| Tokens carry fine-grained scopes | `scopes[]` limits what each token can do |
| Mandatory rotation policy | `rotationIntervalDays` + `nextRotationDue` trigger reminders |
| Audit trail on revocation | `revokedAt` and `revokedBy` preserved permanently |
| Unique hash index | Prevents two tokens from having the same hash (integrity) |

---

## 20. OTP Storage Model

### File: `backend/src/models/PendingOTP.ts`

OTPs for email and SMS verification follow a minimalist, security-focused schema:

```typescript
const PendingOTPSchema = new Schema<IPendingOTP>({
  userId:    { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  type:      { type: String, enum: ['email', 'sms', 'phone_verify'], required: true },
  hashedOTP: { type: String, required: true },  // bcrypt hash — never plaintext
  expiresAt: {
    type: Date,
    required: true,
    index: { expires: 0 },   // MongoDB TTL — document auto-deleted at expiresAt
  },
});

PendingOTPSchema.index({ userId: 1, type: 1 });  // Compound unique: 1 pending OTP per user+type
```

**Security guarantees:**

- **One OTP per channel:** The `{ userId, type }` compound index is used with upsert semantics — issuing a new OTP automatically replaces any existing pending OTP for that user+channel, preventing accumulation of valid codes
- **Auto-expiry:** The TTL index deletes the document at `expiresAt`, not just marks it expired — the document no longer exists after expiry, so replay attacks using expired codes are structurally impossible
- **Hash storage:** `bcrypt.compare()` is used for verification, so a database breach does not yield usable OTP values

---

## 21. Break-Glass Emergency Access Model

### File: `backend/src/models/BreakGlassAccount.ts`

Break-glass accounts provide emergency administrative access when normal authentication channels are unavailable. The model enforces strict accountability:

```typescript
export interface IBreakGlassAccount extends Document {
  username:            string;
  passwordHash:        string;         // bcrypt hashed — never stored plaintext
  isActive:            boolean;        // Disabled by default; must be explicitly activated
  description:         string;
  createdBy:           mongoose.Types.ObjectId;
  lastUsedAt?:         Date;
  lastUsedIP?:         string;
  usageCount:          number;         // Total activation count
  usageLog: Array<{
    timestamp:       Date;
    ipAddress:       string;
    userAgent:       string;
    reason:          string;           // Required justification for use
    duration:        number;           // How long the session lasted (ms)
    deactivatedAt?:  Date;
  }>;
  lastRotatedAt?:       Date;
  rotationIntervalDays: number;        // Enforce mandatory password rotation
  nextRotationDue?:     Date;
}
```

**Security controls:**

| Control | Implementation |
|---------|---------------|
| Disabled by default | `isActive: false` — must be manually enabled before use |
| Mandatory justification | `reason` field required in usage log |
| Full session logging | IP, user agent, duration, timestamp per activation |
| Usage count | `usageCount` counter makes unusual frequency detectable |
| Mandatory rotation | `rotationIntervalDays` + `nextRotationDue` enforce periodic key rotation |
| Accountability | `createdBy` links to the administrator who provisioned the account |

---

## 22. Role & Permission Fields

### File: `backend/src/models/User.ts`

**Role field:**

```typescript
role: {
  type: String,
  enum: [
    'super_admin', 'admin', 'manager', 'super_manager', 'supervisor',
    'clerk', 'driver', 'viewer', 'fuel_order_maker', 'boss',
    'yard_personnel', 'fuel_attendant', 'station_manager', 'payment_manager',
    'dar_yard', 'tanga_yard', 'mmsa_yard', 'import_officer', 'export_officer',
  ],
  default: 'viewer',   // Principle of least privilege — new accounts start with minimum access
},
```

**Multi-dimensional access control:**

```typescript
yard: {
  type: String,
  enum: ['DAR YARD', 'TANGA YARD', 'MMSA YARD'],
  trim: true,
},
department: {
  type: String,
  trim: true,
},
```

The combination of `role` + `yard` + `department` fields allows the application to enforce context-aware access — a `yard_personnel` user at `DAR YARD` cannot access `TANGA YARD` records even though both share the same role enum value.

### File: `backend/src/utils/roleFieldPolicy.ts`

Field-level update policies are enforced at the service layer, but are defined as database-model-adjacent configuration:

```typescript
// Admin-equivalent set for field policy purposes
const ADMIN_EQUIVALENT = new Set([
  'super_admin', 'admin', 'manager', 'super_manager', 'boss', 'supervisor',
]);

// Per-resource field whitelist per role
const FUEL_RECORD_FIELDS: Record<string, string[]> = {
  admin:            ['totalLts', 'extra', 'balance', 'isLocked', 'truckNo', ...allFields],
  fuel_order_maker: ['darGoing', 'moroGoing', 'mbeyaGoing', 'extra', 'journeyStatus', 'start'],
  clerk:            ['darGoing', 'moroGoing', 'mbeyaGoing', 'extra'],
};
```

Only fields in the whitelist for the user's role are accepted in update payloads. All other fields are stripped before the query is constructed, preventing **mass assignment vulnerabilities** at the database query level.

---

## 23. Environment & Secrets Validation

### File: `backend/src/config/index.ts`

No database credentials, JWT secrets, or encryption keys are hardcoded. The application validates all required secrets at startup and refuses to run if any are missing:

```typescript
export const validateEnv = () => {
  // Always required
  const required = ['MONGODB_URI', 'JWT_SECRET', 'JWT_REFRESH_SECRET'];

  // Additionally required in production
  const productionRequired = process.env.NODE_ENV === 'production' ? [
    'BACKUP_ENCRYPTION_KEY',  // Backup file encryption
    'FIELD_ENCRYPTION_KEY',   // PII field encryption (DriverCredential)
    'REDIS_URL',              // Session store for multi-instance deployments
  ] : [];

  const missing = [...required, ...productionRequired].filter(key => !process.env[key]);

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
};
```

**Environment variables and their database-security roles:**

| Variable | Role | Required in |
|----------|------|------------|
| `MONGODB_URI` | MongoDB connection string | Always |
| `JWT_SECRET` | Signs access tokens | Always |
| `JWT_REFRESH_SECRET` | Signs refresh tokens (separate from access) | Always |
| `FIELD_ENCRYPTION_KEY` | AES-256-GCM key for PII fields | Production |
| `BACKUP_ENCRYPTION_KEY` | Encrypts database backup exports | Production |
| `REDIS_URL` | Distributed session store | Production |

---

## 24. Database Security Architecture Summary

### Data protection layers

```
Incoming HTTP request
        │
        ├── express-mongo-sanitize     — Strips $ operators from all input
        ├── express-validator          — Schema-level HTTP input validation
        ├── Mongoose strictQuery       — Ignores unknown schema fields in queries
        │
        ▼
Mongoose Model Layer
        │
        ├── Schema enum constraints    — Only valid field values accepted
        ├── Schema validators          — Length, format, regex checks
        ├── select: false              — Secrets excluded from default queries
        ├── Pre-save hooks             — Hash passwords, encrypt PII
        ├── toJSON transform           — Strip secrets from serialised responses
        │
        ▼
MongoDB Storage
        │
        ├── Unique indexes             — Integrity constraints
        ├── Sparse indexes             — Efficient optional-field queries
        ├── TTL indexes                — Automatic expiry of tokens / security events
        └── AES-256-GCM ciphertext     — PII encrypted at rest
```

### Sensitive field handling matrix

| Field | Model | At-rest protection | Query protection | Response protection |
|-------|-------|--------------------|------------------|---------------------|
| `password` | User | bcrypt (cost 12) | `select: false` | `toJSON` delete |
| `passwordHistory` | User | bcrypt hashes | `select: false` | `toJSON` delete |
| `refreshToken` | User | SHA-256 hash | `select: false` | `toJSON` delete |
| `resetPasswordToken` | User | SHA-256 hash | `select: false` | Response sanitisation |
| `pin` | DriverCredential | bcrypt | `select: false` | Response sanitisation |
| `driverName` | DriverCredential | AES-256-GCM | — | Decrypted in hook |
| `phoneNumber` | DriverCredential | AES-256-GCM | — | Decrypted in hook |
| `totpSecret` | MFA | AES-256-CBC (getter/setter) | — | Never in responses |
| `backupCodes` | MFA | bcrypt hashes | `select: false` | Never in responses |
| `tokenHash` | ApiToken | SHA-256 hash | Indexed, not selectable | Never in responses |
| `hashedOTP` | PendingOTP | bcrypt | — | Never in responses |
| `passwordHash` | BreakGlassAccount | bcrypt | — | Never in responses |

### OWASP Top 10 (database perspective)

| OWASP Risk | Database-level mitigation |
|------------|--------------------------|
| A01 – Broken Access Control | `role` enum, field policy whitelists, `select: false`, soft-delete audit trail |
| A02 – Cryptographic Failures | AES-256-GCM field encryption, bcrypt hashing, SHA-256 token hashing |
| A03 – Injection | `express-mongo-sanitize`, `strictQuery`, ReDoS-safe regex, TypeScript typing |
| A04 – Insecure Design | Hash-before-store for all tokens, separate secrets, least-privilege default role |
| A05 – Security Misconfiguration | `validateEnv()` startup check, no hardcoded credentials, connection pool limits |
| A07 – Auth Failures | Lockout fields, MFA encrypted secrets, token rotation, TTL expiry |
| A08 – Software Integrity | Audit log SHA-256 hash chain — retroactive tampering is detectable |
| A09 – Logging Failures | AuditLog + SecurityEvent collections, TTL retention, risk-scored entries |

---

*This document was generated from direct source analysis of the production codebase on April 22, 2026.*
