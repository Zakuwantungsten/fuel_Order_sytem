# SSRF Protection Implementation Guide

## Quick Start: Apply SSRF Protection to Your System

This guide shows exactly where and how to integrate the SSRF Guard utility into your existing codebase.

---

## Step 1: Using the SSRF Guard Utility

The new `backend/src/utils/ssrfGuard.ts` file contains:

```typescript
export async function isSafeUrl(urlString: string): Promise<boolean>
  // Validates URL against private IP ranges before making HTTP requests
  
export function isWhitelistDomain(urlString: string): boolean
  // Checks if domain is in pre-approved whitelist
  
export function addWhitelistDomain(domain: string): void
  // Registers trusted external domain
  
export function validateExternalUrl(urlParamName: string, paramLocation: 'body' | 'query')
  // Express middleware factory for automatic validation
```

---

## Step 2: Protect Email Configuration Endpoint

**Problem:** `systemConfigController.ts:566` accepts SMTP host from user input without validation.

### Current Code (Vulnerable):
```typescript
export const updateEmailConfiguration = async (req: AuthRequest, res: Response) => {
  const { host, port, secure, user, password, from, fromName } = req.body;

  if (!host || !user || !from) {
    throw new ApiError(400, 'Host, user, and from address are required');
  }

  // ❌ NO VALIDATION OF 'host' — could be 192.168.0.1 or 169.254.169.254
  systemConfig.systemSettings.email = {
    host, port, user, password, from, fromName
  };
  // ...
};
```

### Protected Code:
```typescript
import { isSafeUrl } from '../utils/ssrfGuard';

export const updateEmailConfiguration = async (req: AuthRequest, res: Response) => {
  const { host, port, secure, user, password, from, fromName } = req.body;

  if (!host || !user || !from) {
    throw new ApiError(400, 'Host, user, and from address are required');
  }

  // ✅ VALIDATE SMTP host against SSRF vulnerabilities
  const smtpUrl = `https://${host}:${port || 587}`;
  const isSafeHost = await isSafeUrl(smtpUrl);
  
  if (!isSafeHost) {
    throw new ApiError(400, 
      'SMTP host must be a public domain. Private IPs and AWS metadata endpoints are not allowed.'
    );
  }

  // Now safe to apply configuration
  systemConfig.systemSettings.email = {
    host, port, user, password, from, fromName
  };
  
  systemConfig.lastUpdatedBy = req.user?.username || 'system';
  await systemConfig.save();

  // Reinitialize email service with new config
  const emailService = require('../services/emailService').default;
  await emailService.reinitialize();

  // Audit log
  await AuditService.log({
    action: 'CONFIG_CHANGE',
    resourceType: 'config',
    resourceId: 'email_configuration',
    userId: req.user?.userId || 'system',
    username: req.user?.username || 'system',
    details: `Email configuration updated: Host=${host}, User=${user}, From=${from}`,
    severity: 'high',
    ipAddress: req.ip,
  });

  res.status(200).json({
    success: true,
    message: 'Email configuration updated successfully',
    data: {
      host,
      port,
      secure,
      user,
      password: '***************',
      from,
      fromName,
    },
  });
};
```

---

## Step 3: Setup Helmet DNS Prefetch Control

**File:** `backend/src/server.ts`

### Current Code:
```typescript
// Security middleware
app.use(helmet());
```

### Enhanced Code:
```typescript
// Security middleware
app.use(helmet({
  dnsPrefetchControl: {
    allow: false,  // Prevent browser from prefetching DNS for user-supplied URLs
  },
}));
```

---

## Step 4: Optional — Add Whitelist for External APIs (Future-Proofing)

If your system needs to integrate with external APIs in the future:

### In `backend/src/services/yourService.ts`:
```typescript
import { isSafeUrl, isWhitelistDomain, addWhitelistDomain } from '../utils/ssrfGuard';

class ExternalApiService {
  constructor() {
    // Register trusted external APIs
    addWhitelistDomain('api.github.com');
    addWhitelistDomain('api.stripe.com');
    // ... add others as needed
  }

  async fetchFromExternalAPI(apiUrl: string): Promise<any> {
    // Option 1: Strict whitelist check
    if (!isWhitelistDomain(apiUrl)) {
      throw new Error('API domain not whitelisted');
    }

    // Option 2: General safety check (allows any public domain)
    const isSafe = await isSafeUrl(apiUrl);
    if (!isSafe) {
      throw new Error('URL is not allowed (SSRF protection)');
    }

    const response = await axios.get(apiUrl);
    return response.data;
  }
}
```

---

## Step 5: Optional — Middleware for Protecting URL Parameters

If you have endpoints that accept URLs in request body/query:

### Create `backend/src/middleware/ssrfValidation.ts`:
```typescript
import { validateExternalUrl } from '../utils/ssrfGuard';

/**
 * Middleware factories for different URL parameter names
 */
export const validateReportUrl = validateExternalUrl('reportUrl', 'body');
export const validateWebhookUrl = validateExternalUrl('webhookUrl', 'body');
export const validateCallbackUrl = validateExternalUrl('callbackUrl', 'query');
```

### Apply to Routes:
```typescript
import { validateReportUrl } from '../middleware/ssrfValidation';

router.post(
  '/api/reports/fetch-external',
  authenticate,
  validateReportUrl,  // ✅ Validates 'reportUrl' in body
  reportController.fetchExternalReport
);
```

---

## Step 6: Update Existing Code Checklist

### Search for External Requests in Your Codebase

```bash
# Find all axios/fetch calls
grep -r "axios\." backend/src --include="*.ts"
grep -r "fetch(" backend/src --include="*.ts"
grep -r "http\.request" backend/src --include="*.ts"
grep -r "https\.request" backend/src --include="*.ts"
```

### For Each Result, Verify:

- [ ] **Hardcoded URL?** (Safe, no action needed)
  ```typescript
  // ✅ SAFE — hardcoded
  const response = await axios.get('http://localhost:5000/api/data');
  ```

- [ ] **From environment variable?** (Safe if not user-modifiable)
  ```typescript
  // ✅ SAFE — from .env file
  const apiUrl = process.env.INTERNAL_API_URL;
  const response = await axios.get(apiUrl);
  ```

- [ ] **From user input?** (DANGEROUS — apply SSRF guard)
  ```typescript
  // ❌ UNSAFE — user provides URL
  const userUrl = req.body.externalUrl;
  const response = await axios.get(userUrl);
  
  // ✅ SAFE — validate first
  const userUrl = req.body.externalUrl;
  const isSafe = await isSafeUrl(userUrl);
  if (!isSafe) throw new Error('URL not allowed');
  const response = await axios.get(userUrl);
  ```

---

## Step 7: Testing the Implementation

### Run Unit Tests:
```bash
npm test -- backend/src/__tests__/utils/ssrfGuard.test.ts
```

### Manual Testing:

#### Test 1: Email Configuration — Should Reject Private IP
```bash
curl -X POST http://localhost:5000/api/v1/system-config/email \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "host": "192.168.0.1",
    "port": 587,
    "user": "admin@example.com",
    "from": "noreply@example.com"
  }'

# Expected response (400):
# {
#   "success": false,
#   "message": "SMTP host must be a public domain. Private IPs and AWS metadata endpoints are not allowed."
# }
```

#### Test 2: Email Configuration — Should Accept Public Domain
```bash
curl -X POST http://localhost:5000/api/v1/system-config/email \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "host": "smtp.gmail.com",
    "port": 587,
    "user": "admin@gmail.com",
    "from": "noreply@example.com"
  }'

# Expected response (200):
# {
#   "success": true,
#   "message": "Email configuration updated successfully"
# }
```

#### Test 3: AWS Metadata Protection
```bash
# What an attacker would try:
curl -X POST http://localhost:5000/api/v1/system-config/email \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ATTACKER_TOKEN" \
  -d '{
    "host": "169.254.169.254",
    "port": 80,
    "user": "attacker@example.com",
    "from": "attacker@example.com"
  }'

# ✅ Should be blocked with 400 error
```

---

## Step 8: Add to Code Review Checklist

Add this to your code review guidelines:

```markdown
### SSRF Security Checklist for Code Review

- [ ] Does this endpoint accept external URLs/domains from user input?
  - If YES, has `isSafeUrl()` been called to validate?
  - If YES, is it in a try-catch block?
  - If YES, are private IPs properly rejected?

- [ ] Does this code make HTTP requests with user-supplied URLs?
  - If YES, add call to `await isSafeUrl(userUrl)` before request

- [ ] Are there any new API integrations?
  - If YES, is the domain hardcoded or environment-variable based?
  - If NO hardcoding, add to whitelist in documentation

- [ ] Are environment variables for API endpoints validated at startup?
  - If NO, consider calling `isSafeUrl()` during initialization
```

---

## Step 9: Update Developer Documentation

Create `backend/SECURITY.md` with:

```markdown
# Security Guidelines for Developers

## SSRF Prevention

**Never accept external URLs from user input without validation.**

### ✅ DO:
```typescript
import { isSafeUrl } from './utils/ssrfGuard';

const userProvidedUrl = req.body.webhookUrl;
const isSafe = await isSafeUrl(userProvidedUrl);
if (!isSafe) {
  throw new Error('Invalid or unsafe URL');
}
const response = await axios.post(userProvidedUrl, data);
```

### ❌ DON'T:
```typescript
const userProvidedUrl = req.body.webhookUrl;
const response = await axios.post(userProvidedUrl, data);  // ❌ VULNERABLE
```

### Whitelist Approach (Stricter):
```typescript
import { isWhitelistDomain, addWhitelistDomain } from './utils/ssrfGuard';

addWhitelistDomain('api.trusted-partner.com');

const userUrl = req.body.apiUrl;
if (!isWhitelistDomain(userUrl)) {
  throw new Error('API not in approved list');
}
```
```

---

## Deployment Checklist

Before deploying SSRF protection:

- [ ] All unit tests pass: `npm test`
- [ ] Email configuration endpoint tested with private IP (should fail)
- [ ] Email configuration endpoint tested with public domain (should succeed)
- [ ] No SSRF warnings in production logs
- [ ] Helmet DNS prefetch control enabled
- [ ] Code review completed
- [ ] Team trained on SSRF prevention per `SECURITY.md`
- [ ] Audit logs verify no private IPs accepted

---

## Monitoring & Logging

The SSRF guard automatically logs all blocked requests:

```typescript
logger.warn(`[SSRF] Private IP blocked: ${hostname}`);
logger.warn(`[SSRF] URL blocked for security reasons: ${urlString}`);
```

### To Monitor SSRF Blocks in Production:
```bash
# Check logs
tail -f logs/app.log | grep SSRF

# Alert on repeated blocks (potential attack)
grep "[SSRF]" logs/app.log | wc -l
```

---

## References

- **OWASP SSRF Cheat Sheet:** https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html
- **AWS EC2 Metadata:** https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/instance-metadata-service-how-it-works.html
- **DNS Rebinding:** https://en.wikipedia.org/wiki/DNS_rebinding

---

## Support & Questions

If you have questions about SSRF implementation:
1. Review the SSRF_SECURITY_AUDIT.md for detailed findings
2. Check ssrfGuard.test.ts for usage examples
3. Review code examples in this guide

