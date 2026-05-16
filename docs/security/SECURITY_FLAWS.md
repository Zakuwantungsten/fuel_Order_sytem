# Security Flaws — Fuel Order System

> **Identified:** April 22, 2026  
> **Scope:** Backend middleware, authentication, and blocklist service  
> **Status:** All open — not yet fixed

---

## Flaw #1 — IP Spoofing via `X-Forwarded-For` (HIGH)

**Files affected:**
- `backend/src/middleware/ipReputationMiddleware.ts`
- `backend/src/middleware/suspicious404Middleware.ts`
- `backend/src/middleware/uaBlockingMiddleware.ts`
- `backend/src/middleware/attackPatternMiddleware.ts`
- `backend/src/middleware/auth.ts` (8 separate occurrences)

### What's wrong

Every security middleware defines its own `getClientIP()` function that reads the **leftmost** value from the `X-Forwarded-For` header:

```typescript
// Repeated in every security middleware:
const forwarded = req.headers['x-forwarded-for'];
return forwarded.split(',')[0].trim();   // attacker controls this value
```

The `X-Forwarded-For` header is a comma-separated list appended by each proxy in the chain. The leftmost value (`[0]`) is whatever the **client sent** — it is entirely attacker-controlled and untrustworthy.

`server.ts` already sets `app.set('trust proxy', 1)`, which causes Express to populate `req.ip` with the correct client IP (the entry one hop before the trusted proxy). The middleware ignores this and reads the raw header directly.

### Impact

An attacker sets `X-Forwarded-For: 8.8.8.8` and:
- Bypasses every IP blocklist check (blocklist service, IP reputation, IP filter)
- Evades auto-blocking / fail2ban escalation
- Poisons every security event log, audit log, and login activity record with a fake IP
- Bypasses conditional access policies that match on `ip_range`

Rate limiters (`express-rate-limit`) are **not** affected — they correctly use `req.ip`.

### Fix

Replace all custom `getClientIP()` implementations with `req.ip`:

```typescript
// CORRECT — trust proxy is already configured in server.ts
function getClientIP(req: Request): string {
  return req.ip || req.socket.remoteAddress || 'unknown';
}
```

Also replace all inline reads in `auth.ts`:

```typescript
// WRONG (current):
(req.headers['x-forwarded-for'] as string)?.split(',')[0].trim() || req.socket?.remoteAddress

// CORRECT:
req.ip || req.socket?.remoteAddress || 'unknown'
```

---

## Flaw #2 — CSRF Signing Key Derived from JWT Secret (MEDIUM)

**File:** `backend/src/middleware/csrf.ts` — line ~32

### What's wrong

The CSRF token signing key is derived by hashing the JWT secret:

```typescript
const getCsrfSigningKey = (): Buffer => {
  // Comment claims "key separation" — this is NOT true separation:
  return crypto.createHash('sha256').update(config.jwtSecret + ':csrf-v1').digest();
};
```

Additionally, the key is re-derived on every call to `generateCsrfToken()` and `verifyCsrfToken()` — no memoization, so every CSRF operation runs a SHA-256 hash unnecessarily.

### Impact

A single compromised `JWT_SECRET` breaks **both** JWT authentication **and** CSRF protection simultaneously. True key separation means an independent secret so that compromise of one does not affect the other.

### Fix

Add a dedicated `CSRF_SECRET` environment variable and use it directly:

```typescript
// In config/index.ts — add to validateEnv() production requirements:
'CSRF_SECRET'

// In csrf.ts — replace getCsrfSigningKey():
const _csrfKey: Buffer = Buffer.from(config.csrfSecret, 'hex');

const getCsrfSigningKey = (): Buffer => _csrfKey;  // memoized, truly independent
```

---

## Flaw #3 — Permanent Blocks Never Cleared from In-Memory Cache (MEDIUM)

**File:** `backend/src/services/blocklistService.ts` — `syncFromDB()` function

### What's wrong

The `syncFromDB()` function only **adds** entries to the in-memory `blockedIPs` map — it never removes entries that were deactivated in MongoDB:

```typescript
async function syncFromDB(): Promise<void> {
  const activeBlocks = await BlockedIP.find({ isActive: true, ... }).lean();

  for (const block of activeBlocks) {
    const ip = normalizeIP(block.ip);
    if (!blockedIPs.has(ip)) {
      blockedIPs.set(ip, { ... });   // Only adds new entries
    }
    // MISSING: blocks removed/deactivated in DB are never removed from memory
  }
}
```

The `pruneExpired()` function only removes entries where `expiresAt !== null && expiresAt <= now`. Permanent blocks (`expiresAt: null`) that are deactivated in MongoDB — for example, via a direct DB fix or a bug in the `unblock()` path — **persist in the in-memory map for the entire lifetime of the process**.

The `unblock()` method does correctly call `blockedIPs.delete()`, so this flaw only affects cases where deactivation happens outside the normal API path.

### Impact

An IP that was legitimately unblocked directly in MongoDB (emergency DB fix, migration script, or any path other than `BlocklistService.unblock()`) remains blocked in-memory. The only remediation is a process restart or calling `BlocklistService.forceSync()` manually.

### Fix

Replace the merge-only sync with a **replace** strategy — rebuild the in-memory map from the DB state on every sync:

```typescript
async function syncFromDB(): Promise<void> {
  try {
    const now = new Date();
    const activeBlocks = await BlockedIP.find({
      isActive: true,
      $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }],
    }).lean();

    // Rebuild map from DB state (removes entries that were deactivated in DB)
    const newMap = new Map<string, BlockRecord>();
    for (const block of activeBlocks) {
      const ip = normalizeIP(block.ip);
      newMap.set(ip, {
        expiresAt: block.expiresAt ? block.expiresAt.getTime() : null,
        reason: block.reason,
        blockedAt: block.blockedAt.getTime(),
      });
    }

    // Preserve memory-only blocks not yet persisted (in-flight blocks)
    for (const [ip, record] of blockedIPs) {
      if (!newMap.has(ip)) {
        newMap.set(ip, record);
      }
    }

    // Atomic swap
    blockedIPs.clear();
    for (const [ip, record] of newMap) {
      blockedIPs.set(ip, record);
    }

    _lastDbSync = Date.now();
  } catch (err) {
    logger.error('BlocklistService: Failed to sync from DB', err);
  }
}
```

---

## Flaw #4 — `/.well-known/security.txt` Is Incorrectly Blocked (LOW)

**File:** `backend/src/middleware/attackPatternMiddleware.ts` — line ~46

### What's wrong

The `DEFAULT_BLOCKED_PATTERNS` array contains this entry:

```typescript
/\/\.well-known\/security\.txt/,   // Except this is legitimate — removed below
```

The comment says "removed below" but the pattern is **never removed**. It remains active in the final patterns array, blocking `GET /.well-known/security.txt` with a `403 Forbidden`.

### Impact

`/.well-known/security.txt` is defined in **IETF RFC 9116** as the standard location for security researchers to find a responsible disclosure contact and bug bounty policy. Blocking it:
- Prevents legitimate researchers from reporting vulnerabilities
- May cause automated security scanners to flag the site as non-compliant
- Provides no security benefit (the endpoint contains only contact information, not sensitive data)

### Fix

Remove the pattern from `DEFAULT_BLOCKED_PATTERNS`:

```typescript
// DELETE this line:
/\/\.well-known\/security\.txt/,
```

Optionally add an explicit route that serves a `security.txt` file:

```
Contact: mailto:security@yourorg.com
Expires: 2027-01-01T00:00:00.000Z
```

---

## Flaw #5 — Unknown Policy Signals Default to `match = true` (LOW)

**File:** `backend/src/middleware/auth.ts` — `evaluatePolicies()` function

### What's wrong

The `switch` statement evaluating conditional access policy conditions has a `default` branch that silently marks unknown signals as **matched**:

```typescript
switch (cond.signal) {
  case 'role':        { /* ... */ break; }
  case 'ip_range':    { /* ... */ break; }
  case 'time_of_day': { /* ... */ break; }
  default:
    match = true;   // Unknown signal = always matches
}
```

### Impact

If a policy is created in the admin UI using a `ConditionSignal` that was added to the schema but not yet implemented in this `switch` (e.g. `device_trusted`, `country` — both defined in the type but not in the switch), the condition silently evaluates to `true`. Depending on the policy's `action`:
- `block` — could lock out legitimate users
- `require_mfa` — could trigger unexpected MFA challenges
- `notify_admin` — generates spurious security alerts

The fail-open comment on the outer `try/catch` ("fail-open: don't block on policy eval errors") does not protect against this — no error is thrown, only a wrong result is returned.

### Fix

Default to `false` and log an explicit warning so missing implementations are caught in development:

```typescript
default:
  logger.warn(`evaluatePolicies: unrecognised condition signal "${cond.signal}" — skipping condition`);
  match = false;   // Unknown = does NOT match (safe default)
```

---

## Summary

| # | Flaw | File(s) | Severity | Fix complexity |
|---|------|---------|----------|---------------|
| 1 | IP spoofing via `X-Forwarded-For[0]` | 5 middleware files + `auth.ts` | **High** | Low — replace all `getClientIP()` with `req.ip` |
| 2 | CSRF key derived from JWT secret | `csrf.ts` | **Medium** | Low — add `CSRF_SECRET` env var |
| 3 | Permanent blocks not cleared from memory cache | `blocklistService.ts` | **Medium** | Medium — replace merge-only sync with replace strategy |
| 4 | `/.well-known/security.txt` blocked | `attackPatternMiddleware.ts` | Low | Trivial — remove one regex |
| 5 | Unknown policy signal defaults to `match = true` | `auth.ts` | Low | Trivial — change default branch |
