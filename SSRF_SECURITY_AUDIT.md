# SSRF (Server-Side Request Forgery) Security Audit — Fuel Order System

**Date:** February 25, 2026  
**Status:** ⚠️ **CRITICAL GAPS IDENTIFIED**  
**Overall SSRF Security Posture:** **LOW** (Vulnerable to potential SSRF attacks)

---

## Executive Summary

Your system has **NO dedicated SSRF protection implemented**. While the codebase makes minimal outbound HTTP requests (reducing attack surface), there is **no guardrail in place** should developers add features that fetch external URLs, integrate with third-party APIs, or handle webhook callbacks in the future.

**Critical Gaps:**
- ❌ No SSRF protection utility (utils/ssrfGuard.ts)
- ❌ No IP range validation before outbound requests
- ❌ No whitelist mechanism for allowed external domains
- ❌ No DNS resolution validation
- ❌ No Helmet DNS prefetch control configuration
- ❌ No safeguards for user-controlled URL input

---

## Current System Analysis

### ✅ What You're Doing Right

#### 1. **Limited External HTTP Requests**
- **Finding:** System makes minimal outbound requests.
- **Code:** 
  - `backend/src/controllers/fuelRecordController.ts:478` — Hardcoded localhost call only:
    ```typescript
    const response = await axios.post(
      'http://localhost:5000/api/yard-fuel/link-pending',  // ✅ Hardcoded, safe
      { /* ... */ }
    );
    ```
  - `backend/src/controllers/systemConfigController.ts:656` — Parses MongoDB URI from environment config only.

#### 2. **Server-Side Presigned URL Generation (R2/S3)**
- **File:** `backend/src/services/r2Service.ts`
- **Finding:** ✅ Presigned URLs are generated server-side using AWS SDK.
- **Code:**
  ```typescript
  async getSignedDownloadUrl(key: string, expiresIn: number = 3600): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: this.bucketName,
      Key: key,
    });
    const url = await getSignedUrl(this.client!, command, { expiresIn });
    return url;
  }
  ```
- **Status:** ✅ **Safe** — URL generation is server-side; clients cannot provide arbitrary URLs.

#### 3. **Email Configuration Uses Nodemailer**
- **File:** `backend/src/services/emailService.ts`
- **Finding:** Email SMTP host is configured via environment variables or database (not direct user input to HTTP requests).
- **Status:** ✅ **Relatively Safe** — SMTP is not a typical SSRF vector; nodemailer handles connection securely.

#### 4. **No File Upload via External URLs**
- **Finding:** Backup/restore operations use **internal file IDs** (MongoDB `_id`), not external URLs.
- **File:** `backend/src/controllers/backupController.ts:162`
  ```typescript
  export const restoreBackup = async (req: AuthRequest, res: Response) => {
    const { id } = req.params;  // ✅ Internal ID only
    const backup = await Backup.findById(id);  // ✅ Validated from DB
  };
  ```
- **Status:** ✅ **Safe** — No user-controlled URL input.

#### 5. **Strong Role-Based Access Control**
- **Finding:** All sensitive endpoints require `super_admin` or specific roles.
- **Implication:** Reduces attack surface for SSRF (fewer users can trigger external requests).
- **Files:** `backend/src/middleware/auth.ts`, route guards throughout.

#### 6. **Helmet Security Headers**
- **File:** `backend/src/server.ts:30`
- **Finding:** Helmet is enabled globally.
- **Current config:**
  ```typescript
  app.use(helmet());
  if (config.nodeEnv === 'production') {
    app.use(
      helmet.hsts({
        maxAge: 31536000,
        includeSubDomains: true,
        preload: true,
      })
    );
  }
  ```
- **Status:** ✅ **Baseline protection** but **incomplete for SSRF prevention**.

---

## ⚠️ CRITICAL GAPS & VULNERABILITIES

### **Gap 1: No SSRF Protection Utility**
- **Severity:** HIGH
- **Status:** ❌ Missing
- **Risk:** If any developer adds a feature that accepts user-controlled URLs (e.g., "fetch this report from a URL", "download file from link", "webhook integration"), there is **no validation layer**.
- **Attack Scenario:**
  ```typescript
  // Hypothetical vulnerable endpoint (NOT currently in code)
  app.post('/api/reports/fetch-external', async (req, res) => {
    const { reportUrl } = req.body;
    const response = await axios.get(reportUrl);  // ❌ VULNERABLE to SSRF
    // Attacker provides: http://169.254.169.254/latest/meta-data/iam/security-credentials/
    // On AWS EC2, this leaks IAM credentials
  });
  ```

**Implementation:** Create `backend/src/utils/ssrfGuard.ts`

```typescript
import { URL } from 'url';
import dns from 'dns/promises';

const PRIVATE_RANGES = [
  /^10\./,                        // 10.0.0.0/8
  /^192\.168\./,                  // 192.168.0.0/16
  /^172\.(1[6-9]|2\d|3[01])\./,  // 172.16.0.0/12
  /^127\./,                       // 127.0.0.0/8 (loopback)
  /^169\.254\./,                  // 169.254.0.0/16 (AWS metadata)
  /^::1$/,                        // IPv6 loopback
  /^fc00:/,                       // IPv6 private
  /^fe80:/,                       // IPv6 link-local
];

/**
 * Validates URL for SSRF vulnerabilities
 * @param urlString User-provided URL
 * @returns true if URL is safe, false if it's a private/internal IP
 */
export async function isSafeUrl(urlString: string): Promise<boolean> {
  try {
    const url = new URL(urlString);

    // Only allow HTTPS in production
    if (process.env.NODE_ENV === 'production' && url.protocol !== 'https:') {
      return false;
    }

    // Resolve hostname to IP addresses
    const addresses = await dns.resolve(url.hostname);

    // Check each IP against private ranges
    const isPrivate = addresses.some(ip =>
      PRIVATE_RANGES.some(pattern => pattern.test(ip))
    );

    return !isPrivate;
  } catch (error) {
    // DNS resolution error or invalid URL — fail closed
    return false;
  }
}

/**
 * Whitelist of allowed external domains (if needed)
 */
const ALLOWED_DOMAINS = new Set([
  // Example: 'api.trusted-partner.com',
]);

/**
 * Validates URL against whitelist (optional stricter policy)
 */
export function isWhitelistDomain(urlString: string): boolean {
  const url = new URL(urlString);
  return ALLOWED_DOMAINS.has(url.hostname);
}
```

---

### **Gap 2: No IP Range Blocking Mechanism**
- **Severity:** CRITICAL (on cloud deployments like AWS)
- **Status:** ❌ Missing
- **Risk:** On AWS EC2, the metadata endpoint at `169.254.169.254/latest/meta-data/` is reachable via HTTP and returns IAM credentials if your backend makes unvalidated outbound requests.
- **Attack Example:**
  ```bash
  curl http://169.254.169.254/latest/meta-data/iam/security-credentials/
  # Returns AWS role credentials that can be used to:
  # - Access S3 buckets
  # - Access RDS databases
  # - Assume other IAM roles
  # - Modify security groups
  ```

**Must Implement:** Use the `ssrfGuard.ts` utility to validate all outbound URLs.

---

### **Gap 3: No Whitelist Mechanism for External APIs**
- **Severity:** MEDIUM-HIGH
- **Status:** ❌ Missing
- **Risk:** If future features add integrations with external services (fuel price feeds, map tile servers, third-party analytics), there's no mechanism to restrict to known-good domains.
- **Example Vulnerable Code (hypothetical):**
  ```typescript
  // ❌ DO NOT DO THIS
  async function fetchFuelPrices(externalApiUrl: string) {
    const response = await axios.get(externalApiUrl);
    return response.data;
  }
  
  // Attacker could pass: http://192.168.0.1/admin (internal admin panel)
  ```

**Solution:** Build a `WHITELIST_DOMAINS` set in `ssrfGuard.ts` and validate before making requests.

---

### **Gap 4: No DNS Resolution Validation**
- **Severity:** MEDIUM
- **Status:** ❌ Missing
- **Risk:** DNS spoofing or DNS rebinding attacks could redirect a "safe" domain to a private IP.
- **Attack Example:**
  ```
  1. Attacker controls domain "attacker.com"
  2. Initially, attacker.com → 104.21.0.0 (public)
  3. Code validates attacker.com, approves it
  4. Attacker quickly changes DNS: attacker.com → 169.254.169.254
  5. Code fetches from attacker.com → lands on AWS metadata
  ```

**Solution:** Validate DNS resolution at request time (implemented in `ssrfGuard.ts` above) + short DNS TTLs in validation code.

---

### **Gap 5: No Helmet DNS Prefetch Control**
- **Severity:** LOW (but part of defense-in-depth)
- **Status:** ❌ Not configured
- **Fix:** Add to `backend/src/server.ts`:
  ```typescript
  app.use(helmet.dnsPrefetchControl({ allow: false }));
  ```
- **Effect:** Prevents browser from prefetching DNS for user-supplied URLs, reducing timing attack surface.

---

### **Gap 6: Email Host Validation Not Implemented**
- **Severity:** MEDIUM
- **Status:** ⚠️ Partial gap
- **Risk:** `updateEmailConfiguration` accepts a `host` parameter but doesn't validate it for SSRF.
  - **File:** `backend/src/controllers/systemConfigController.ts:566`
  - **Code:**
    ```typescript
    const { host, port, secure, user, password, from, fromName } = req.body;
    if (!host || !user || !from) {
      throw new ApiError(400, 'Host, user, and from address are required');
    }
    // ❌ No validation of 'host' against private ranges
    ```
- **Risk:** A super_admin (compromised or malicious) could configure SMTP to:
  - `169.254.169.254` → reach AWS metadata
  - `192.168.0.1` → reach internal network resources
  - `127.0.0.1` → cause infinite loop or DoS

**Fix:** Validate email host before applying it.

---

## Summary Table: SSRF Security Posture

| Component | Status | Finding | Risk |
|-----------|--------|---------|------|
| **Outbound HTTP Requests** | ✅ Limited | Only localhost calls | LOW |
| **R2/S3 Presigned URLs** | ✅ Server-Side | Generated securely | LOW |
| **Backup/Restore URLs** | ✅ Internal IDs | No external URLs | LOW |
| **SSRF Protection Utility** | ❌ Missing | No `ssrfGuard.ts` | **HIGH** |
| **IP Range Blocking** | ❌ Missing | No private IP validation | **CRITICAL** |
| **Whitelist Mechanism** | ❌ Missing | No domain whitelist | **MEDIUM-HIGH** |
| **DNS Validation** | ❌ Missing | No DNS resolution checks | **MEDIUM** |
| **Email Host Validation** | ❌ Missing | Can configure private IPs | **MEDIUM** |
| **Helmet DNS Control** | ❌ Not Set | Basic helmet only | LOW |
| **HTTPS Enforcement** | ✅ Yes | Only HTTPS in production | LOW |

---

## Recommended Implementation Priority

### **PRIORITY 1 (Immediate - CRITICAL)**

#### 1.1 Create SSRF Guard Utility
**File:** `backend/src/utils/ssrfGuard.ts`
- Implement IP range validation
- DNS resolution check
- Return `isSafeUrl(url: string): Promise<boolean>`

#### 1.2 Validate Email SMTP Host
**File:** `backend/src/controllers/systemConfigController.ts`
- Before saving email config, validate host with `isSafeUrl()`
- Reject private IP addresses

#### 1.3 Add Helmet DNS Prefetch Control
**File:** `backend/src/server.ts`
- Enable `helmet.dnsPrefetchControl({ allow: false })`

---

### **PRIORITY 2 (Short-term - HIGH)**

#### 2.1 Build Domain Whitelist
**File:** `backend/src/utils/ssrfGuard.ts`
- Document all external APIs your system currently uses or will use
- Create `WHITELIST_DOMAINS` set
- Add validation function: `isWhitelistDomain(url: string): boolean`

#### 2.2 Create SSRF Validation Middleware
**File:** `backend/src/middleware/ssrfValidation.ts`
- Middleware to validate request body/query URLs
- Apply to any endpoint that accepts external URLs

#### 2.3 Audit All API Integrations
- Search codebase for any fetch/axios calls
- Document each one
- Verify each uses hardcoded URLs or validated inputs

---

### **PRIORITY 3 (Medium-term - MEDIUM)**

#### 3.1 Implement Webhook Handler (if needed in future)
- Never accept plain URL input from user
- Only accept pre-registered webhook endpoints
- Validate with `isSafeUrl()` before making callback requests

#### 3.2 Add Request Timeout & Size Limits
```typescript
const axiosInstance = axios.create({
  timeout: 5000,           // 5 second timeout
  maxContentLength: 1048576, // 1MB max response
  maxRedirects: 3,          // Limit redirects
});
```

#### 3.3 Log All External Requests
- Log every outbound HTTP request with:
  - URL
  - User who triggered it
  - Response status/size
  - Timestamp

---

## Code Examples: Implementation Guide

### Example 1: Protect an External URL Parameter

**Before (Vulnerable):**
```typescript
app.post('/api/reports/fetch', async (req: AuthRequest, res: Response) => {
  const { reportUrl } = req.body;
  try {
    const response = await axios.get(reportUrl);  // ❌ UNSAFE
    res.json({ success: true, data: response.data });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});
```

**After (Protected):**
```typescript
import { isSafeUrl } from '../utils/ssrfGuard';

app.post('/api/reports/fetch', async (req: AuthRequest, res: Response) => {
  const { reportUrl } = req.body;
  
  try {
    // Validate URL for SSRF vulnerabilities
    const isSafe = await isSafeUrl(reportUrl);
    if (!isSafe) {
      return res.status(400).json({
        success: false,
        message: 'URL is not allowed (private IP or invalid domain)',
      });
    }

    const response = await axios.get(reportUrl);
    res.json({ success: true, data: response.data });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});
```

### Example 2: Protect Email Configuration

**Before:**
```typescript
// No validation
systemConfig.systemSettings.email = { host, port, user, password, from };
await systemConfig.save();
```

**After:**
```typescript
import { isSafeUrl } from '../utils/ssrfGuard';

// Validate SMTP host
const smtpUrl = `http://${host}:${port || 587}`;
const isSafe = await isSafeUrl(smtpUrl);
if (!isSafe) {
  throw new ApiError(400, 'SMTP host is not allowed (must be public domain)');
}

systemConfig.systemSettings.email = { host, port, user, password, from };
await systemConfig.save();
```

---

## Testing & Validation

### Manual Testing Checklist

```typescript
// Test 1: Private IP should be rejected
await isSafeUrl('http://192.168.0.1/admin');  // → false ✅

// Test 2: AWS metadata should be rejected
await isSafeUrl('http://169.254.169.254/latest/meta-data/');  // → false ✅

// Test 3: Loopback should be rejected
await isSafeUrl('http://127.0.0.1:5000/api');  // → false ✅

// Test 4: Public HTTPS should be allowed
await isSafeUrl('https://api.github.com/repos');  // → true ✅

// Test 5: Public HTTP (prod) should be rejected
// (only in production; dev allows HTTP for localhost)
await isSafeUrl('http://example.com');  // → false (in prod) ✅

// Test 6: DNS rebinding attack should be caught
// (attacker changes DNS mid-request)
// → timeout or additional validation required
```

### Unit Tests to Add
- `backend/src/__tests__/utils/ssrfGuard.test.ts`

---

## References & Further Reading

- **OWASP SSRF Prevention Cheat Sheet:** https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html
- **AWS Metadata Service Security:** https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/instance-metadata-service-how-it-works.html
- **DNS Rebinding Attacks:** https://en.wikipedia.org/wiki/DNS_rebinding
- **Electron Security Vulnerabilities:** https://www.blackhat.com/ (common SSRF vectors)

---

## Action Items

- [ ] Create `backend/src/utils/ssrfGuard.ts` with `isSafeUrl()` function
- [ ] Add SSRF validation to email configuration endpoint
- [ ] Configure Helmet DNS prefetch control
- [ ] Search codebase for all `axios` / `fetch` / `http.request` calls
- [ ] Document all current external API integrations
- [ ] Create domain whitelist (if needed)
- [ ] Add unit tests for SSRF guard utility
- [ ] Update code review checklist: **"Does this endpoint accept external URLs? If yes, is `isSafeUrl()` called?"**
- [ ] Update developer documentation with SSRF prevention guidelines

---

**Report Prepared By:** Security Audit Tool  
**Status:** Actionable — Ready for implementation  
**Next Review:** After implementing PRIORITY 1 items
