# Passkey (WebAuthn / FIDO2) Implementation Plan

**Status:** Proposed
**Author:** Engineering
**Last updated:** 2026-06-20
**Stack:** Node + Express + TypeScript (backend) · React + Vite (frontend) · MongoDB (Mongoose)

---

## 0. TL;DR

The backend log warning `GET /.well-known/passkey-endpoints 404` is **not an attack**. It is a
browser/password-manager probe that automatically checks whether the site supports passkeys. We can:

1. **Quick win (10 min):** serve `/.well-known/passkey-endpoints` to silence the 404 and stop it
   counting as a fail2ban/auto-blocklist strike.
2. **Full feature (~1.5–2 days):** add passkeys as an **optional, additional** login method that
   slots alongside the existing password + MFA flow — *not* a replacement.

This document covers both.

---

## 1. What passkeys are & why they fit this app

A passkey is a public/private **key pair** created by the user's device (phone/laptop/browser +
biometric). The private key never leaves the device; the server only ever stores the **public key**.
Login = the device signs a server-issued challenge; the server verifies it with the stored public key.

### Benefits relevant to this system

| Benefit | Why it matters here |
| --- | --- |
| No shared secret on the server | Our `User.password` (bcrypt) and `UserMFA` secrets become non-critical for passkey users — nothing phishable to steal from Mongo. |
| Phishing-proof | Keys are bound to the RP domain (`tahfuelorder.dev`); a clone site cannot use them. |
| Built-in 2FA | Possession (device) + inherence (biometric) in a single tap — can satisfy our `mfaRequired` policy without TOTP/SMS/email. |
| Mobile-friendly | The `mobile/` app and mobile web get Face ID / fingerprint / Android biometric for free. |
| Fewer support tickets | No "forgot password" / "reset MFA" churn for passkey users. |

### Honest assessment

This is an **internal fuel-order management system**, not a public consumer product. Passkeys are a
**nice-to-have hardening + UX upgrade**, not urgent. Recommended posture: ship the `.well-known`
quick win now, implement full passkeys as an *opt-in* method later, keep password+MFA as the fallback.

---

## 2. ⚠️ Critical: domain / RP ID configuration (read first)

Per the production topology, the SPA is served from **`www.tahfuelorder.dev`** (Vercel) while the API
is on the **apex** via cloudflared, with a same-origin `/api/v1` rewrite. WebAuthn is **extremely**
sensitive to origin/domain, so this matters more for us than for a typical single-domain app.

Two values must be exactly right:

- **`rpID`** — a *registrable domain* that is equal to or a parent of the page origin's host.
  Set this to **`tahfuelorder.dev`** (the apex). It is a valid suffix of `www.tahfuelorder.dev`,
  so passkeys created on `www` keep working if you ever drop the `www`.
- **`expectedOrigin`** — the **exact** origin in the browser address bar, i.e.
  **`https://www.tahfuelorder.dev`**. If you support both `www` and apex in the browser, pass an
  **array** of allowed origins to the verify functions.

```
rpID            = "tahfuelorder.dev"
expectedOrigin  = ["https://www.tahfuelorder.dev", "https://tahfuelorder.dev"]
rpName          = "TAH Fuel Order"
```

For **local dev**, `rpID = "localhost"` and `expectedOrigin = "http://localhost:5173"` (Vite).
WebAuthn allows `localhost` over plain HTTP; everything else requires HTTPS (which cloudflared gives us).

Put these in env so prod/dev differ cleanly:

```env
# backend .env
WEBAUTHN_RP_ID=tahfuelorder.dev
WEBAUTHN_RP_NAME=TAH Fuel Order
WEBAUTHN_ORIGINS=https://www.tahfuelorder.dev,https://tahfuelorder.dev
# dev override:
# WEBAUTHN_RP_ID=localhost
# WEBAUTHN_ORIGINS=http://localhost:5173
```

> **Gotcha:** if `rpID` doesn't match at registration vs. authentication, or `expectedOrigin`
> doesn't match the address bar, the browser throws a `SecurityError` with a vague message. 90% of
> passkey bugs are this. Verify these first when debugging.

---

## 3. Library choice

Use **`@simplewebauthn`** — it is the de-facto standard, actively maintained, TS-native, and handles
the CBOR/attestation parsing we do not want to hand-roll.

```bash
# backend
cd backend && npm install @simplewebauthn/server

# frontend
cd frontend && npm install @simplewebauthn/browser
```

Keep major versions of `@simplewebauthn/server` and `@simplewebauthn/browser` in lockstep —
their option payload shapes are matched per major version.

---

## 4. Quick win — serve `/.well-known/passkey-endpoints`

This alone removes the recurring 404 `warn` and prevents it from accruing auto-blocklist strikes
against the office IP.

Add to `backend/src/server.ts` **before** the catch-all/404 handler (near the existing
`/api/health` route around line 118):

```ts
// Passkey discovery endpoint probed by browsers & password managers.
// Returns where users enroll/manage passkeys. Public, unauthenticated, cacheable.
app.get('/.well-known/passkey-endpoints', (_req, res) => {
  res.set('Cache-Control', 'public, max-age=86400');
  res.json({
    enroll: 'https://www.tahfuelorder.dev/settings/security',
    manage: 'https://www.tahfuelorder.dev/settings/security',
  });
});
```

> If passkeys are never implemented, you can alternatively return `204 No Content` here — still
> silences the warn. But returning the JSON is the spec-correct behavior.

Also add `/.well-known/` to the auto-blocklist path allowlist so legitimate well-known probes never
count as strikes (see the auto-blocklist logic; legit 404s currently count as strikes).

---

## 5. Data model

We mirror the existing `UserMFA` pattern (separate collection, `userId` ref, AES-256-GCM helpers).
A user can have **multiple** passkeys (laptop + phone + work desktop), so store an array — either a
sub-document array on `UserMFA`, or a dedicated collection. **Recommended: dedicated collection**
(`Passkey`) so each credential is its own indexed document and revoking one is a single delete.

`backend/src/models/Passkey.ts`:

```ts
import mongoose, { Schema, Document } from 'mongoose';

export interface IPasskey extends Document {
  userId: mongoose.Types.ObjectId;
  credentialID: string;        // base64url — the authenticator's credential id (lookup key)
  publicKey: string;           // base64url-encoded COSE public key
  counter: number;             // signature counter, for clone detection
  transports: string[];        // ['internal','hybrid','usb','nfc','ble']
  deviceType: string;          // 'singleDevice' | 'multiDevice'
  backedUp: boolean;           // synced to a cloud keychain (iCloud / Google)?
  label: string;               // user-facing name, e.g. "Pixel 8" / "Work laptop"
  lastUsedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const PasskeySchema = new Schema<IPasskey>(
  {
    userId:       { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    credentialID: { type: String, required: true, unique: true },
    publicKey:    { type: String, required: true },
    counter:      { type: Number, required: true, default: 0 },
    transports:   { type: [String], default: [] },
    deviceType:   { type: String, default: 'singleDevice' },
    backedUp:     { type: Boolean, default: false },
    label:        { type: String, default: 'Passkey' },
    lastUsedAt:   { type: Date, default: null },
  },
  { timestamps: true }
);

export default mongoose.model<IPasskey>('Passkey', PasskeySchema);
```

We also need to hold the **current challenge** between the two-step ceremonies (options → verify).
Options: (a) a short-lived field on the user/session, or (b) reuse the existing `tempSessionToken`
pattern from the login/MFA flow. **Recommended:** store the challenge server-side keyed by a
short-lived token (same shape as `tempSessionToken`, 5–10 min TTL) so the flow matches the existing
MFA code and survives the cross-origin setup. Do **not** trust a challenge sent back by the client.

> `credentialID` and `publicKey` are not secrets (the public key is public by design), so encryption
> is optional here — unlike `UserMFA.totpSecret`. Keep them plain base64url for simpler lookups.

---

## 6. Backend endpoints

Four new routes, added to `backend/src/routes/authRoutes.ts`, following the existing
`asyncHandler` + rate-limiter + `authenticate` conventions.

| Route | Auth | Purpose |
| --- | --- | --- |
| `POST /auth/passkey/register/options` | `authenticate` | Logged-in user starts enrolling a passkey → returns creation options + challenge |
| `POST /auth/passkey/register/verify`  | `authenticate` | Verify attestation, persist `Passkey` doc |
| `POST /auth/passkey/login/options`    | public (rate-limited) | Begin passwordless login → returns request options + challenge |
| `POST /auth/passkey/login/verify`     | public (rate-limited) | Verify assertion, issue the same JWT + refresh token as a normal login |

Route additions:

```ts
import { authRateLimiter, mfaSetupRateLimiter } from '../middleware/rateLimiters';

// Passkey enrollment (must be logged in)
router.post('/passkey/register/options', authenticate, mfaSetupRateLimiter,
  asyncHandler(authController.passkeyRegisterOptions));
router.post('/passkey/register/verify',  authenticate, mfaSetupRateLimiter,
  asyncHandler(authController.passkeyRegisterVerify));

// Passwordless login (public)
router.post('/passkey/login/options', authRateLimiter,
  asyncHandler(authController.passkeyLoginOptions));
router.post('/passkey/login/verify',  authRateLimiter,
  asyncHandler(authController.passkeyLoginVerify));
```

### 6.1 Register — options

```ts
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from '@simplewebauthn/server';

const rpID    = process.env.WEBAUTHN_RP_ID!;
const rpName  = process.env.WEBAUTHN_RP_NAME || 'TAH Fuel Order';
const origins = (process.env.WEBAUTHN_ORIGINS || '').split(',').map(s => s.trim());

export const passkeyRegisterOptions = async (req: AuthRequest, res: Response) => {
  const user = req.user!; // from authenticate middleware
  const existing = await Passkey.find({ userId: user._id });

  const options = await generateRegistrationOptions({
    rpName,
    rpID,
    userName: user.username,
    userDisplayName: `${user.firstName} ${user.lastName}`,
    attestationType: 'none',
    excludeCredentials: existing.map(p => ({
      id: p.credentialID,
      transports: p.transports as any,
    })),
    authenticatorSelection: {
      residentKey: 'preferred',
      userVerification: 'preferred', // biometric/PIN when available
    },
  });

  // Persist challenge server-side, keyed to this user, 10-min TTL.
  await saveChallenge(user._id, options.challenge);

  res.json({ success: true, data: options });
};
```

### 6.2 Register — verify

```ts
export const passkeyRegisterVerify = async (req: AuthRequest, res: Response) => {
  const user = req.user!;
  const expectedChallenge = await getChallenge(user._id);

  const verification = await verifyRegistrationResponse({
    response: req.body,                 // the attestation from the browser
    expectedChallenge,
    expectedOrigin: origins,
    expectedRPID: rpID,
    requireUserVerification: false,
  });

  if (!verification.verified || !verification.registrationInfo) {
    res.status(400).json({ success: false, message: 'Passkey verification failed' });
    return;
  }

  const { credential, credentialDeviceType, credentialBackedUp } =
    verification.registrationInfo;

  await Passkey.create({
    userId: user._id,
    credentialID: credential.id,
    publicKey: Buffer.from(credential.publicKey).toString('base64url'),
    counter: credential.counter,
    transports: credential.transports || [],
    deviceType: credentialDeviceType,
    backedUp: credentialBackedUp,
    label: req.body.label || 'Passkey',
  });

  await clearChallenge(user._id);
  res.json({ success: true, message: 'Passkey registered' });
};
```

### 6.3 Login — options

Support both **usernameless** (resident key / discoverable) and username-first flows. For an internal
app, username-first is simplest and avoids enumeration concerns:

```ts
export const passkeyLoginOptions = async (req: Request, res: Response) => {
  const { username } = req.body;
  const user = await User.findOne({ username, isDeleted: false, isActive: true });

  // Always return options even if user/passkeys missing, to avoid user enumeration.
  const creds = user ? await Passkey.find({ userId: user._id }) : [];

  const options = await generateAuthenticationOptions({
    rpID,
    userVerification: 'preferred',
    allowCredentials: creds.map(c => ({
      id: c.credentialID,
      transports: c.transports as any,
    })),
  });

  // Key the challenge by a short-lived token returned to the client (mirrors tempSessionToken).
  const challengeToken = await saveLoginChallenge(user?._id ?? null, options.challenge);

  res.json({ success: true, data: { options, challengeToken } });
};
```

### 6.4 Login — verify (issues the real session)

```ts
export const passkeyLoginVerify = async (req: Request, res: Response) => {
  const { challengeToken, response } = req.body;
  const { userId, expectedChallenge } = await getLoginChallenge(challengeToken);

  const passkey = await Passkey.findOne({ credentialID: response.id });
  if (!passkey) {
    res.status(400).json({ success: false, message: 'Unknown passkey' });
    return;
  }

  const verification = await verifyAuthenticationResponse({
    response,
    expectedChallenge,
    expectedOrigin: origins,
    expectedRPID: rpID,
    credential: {
      id: passkey.credentialID,
      publicKey: Buffer.from(passkey.publicKey, 'base64url'),
      counter: passkey.counter,
      transports: passkey.transports as any,
    },
    requireUserVerification: false,
  });

  if (!verification.verified) {
    res.status(401).json({ success: false, message: 'Authentication failed' });
    return;
  }

  // Clone-detection: persist the new counter.
  passkey.counter = verification.authenticationInfo.newCounter;
  passkey.lastUsedAt = new Date();
  await passkey.save();

  // ⇩ Reuse the EXACT same token issuance the password login uses, so downstream
  //    middleware, refresh flow, and the frontend AuthContext behave identically.
  const user = await User.findById(passkey.userId);
  // issueTokens(user, res) → access JWT + refresh token (factor this out of login()).
  return issueSession(user!, req, res); // sets refreshToken, returns { token, user }
};
```

> **Refactor note:** the current `login()` in `authController.ts` builds the JWT + refresh token
> inline (around the success branch after the MFA checks, ~line 600+). Extract that into a reusable
> `issueSession(user, req, res)` helper so both password-login and passkey-login produce identical
> sessions. This is the single most important integration step.

### 6.5 Management endpoints (optional but recommended)

```ts
router.get('/passkey',           authenticate, asyncHandler(authController.listPasskeys));
router.delete('/passkey/:id',    authenticate, asyncHandler(authController.deletePasskey));
router.patch('/passkey/:id',     authenticate, asyncHandler(authController.renamePasskey));
```

---

## 7. Server.ts wiring (don't forget)

The `server.ts` public-path allowlist around **line 257** explicitly lists which `/auth/*` paths skip
auth/CSRF-style gating. Add the two **public** passkey login paths there:

```ts
if (
  req.path === '/auth/login' ||
  /* …existing… */
  req.path === '/auth/passkey/login/options' ||
  req.path === '/auth/passkey/login/verify' ||
  req.path === '/mfa/send-otp'
) { /* … */ }
```

The two `register` paths require an authenticated session, so they must **not** be added to the
public allowlist.

Routes are mounted under `apiBasePath = '/api/v1'` (with legacy `/api`), so the final URLs are
`POST /api/v1/auth/passkey/...`.

---

## 8. Frontend

### 8.1 API helpers

Add to the auth API module (used by `AuthContext.tsx`):

```ts
import { startRegistration, startAuthentication } from '@simplewebauthn/browser';

export async function enrollPasskey(label: string) {
  const { data } = await api.post('/auth/passkey/register/options');
  const attResp = await startRegistration({ optionsJSON: data.data }); // browser/biometric prompt
  await api.post('/auth/passkey/register/verify', { ...attResp, label });
}

export async function loginWithPasskey(username: string) {
  const { data } = await api.post('/auth/passkey/login/options', { username });
  const authResp = await startAuthentication({ optionsJSON: data.data.options });
  const res = await api.post('/auth/passkey/login/verify', {
    challengeToken: data.data.challengeToken,
    response: authResp,
  });
  return res.data; // { token, user } — feed into AuthContext exactly like password login
}
```

### 8.2 UI touch points

| File | Change |
| --- | --- |
| `components/Login.tsx` | Add a **"Sign in with passkey"** button below the password form. On click → `loginWithPasskey(username)` → on success call the same context setter the password path uses. |
| `contexts/AuthContext.tsx` | No new state needed — passkey login returns the same `{ token, user }` shape; reuse the existing `setSession`/login success handler. |
| New: `components/SecuritySettings.tsx` (or extend existing settings) | "Passkeys" section: list registered passkeys (label, device type, last used), "Add passkey" button → `enrollPasskey`, delete/rename actions. This is the `/settings/security` page referenced in the `.well-known` doc. |
| `MFASetupLogin.tsx` | Optional: offer "register a passkey instead" during forced-MFA setup, since a passkey satisfies 2FA. |

### 8.3 Capability detection

Hide the passkey button when unsupported:

```ts
const supported =
  typeof window.PublicKeyCredential !== 'undefined';
// optionally: await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()
```

---

## 9. How passkeys interact with existing MFA

A successful passkey assertion with `userVerification` already proves possession + biometric — i.e.
it **is** multi-factor. Recommended policy:

- If a user logs in with a passkey, **skip** the `requiresMFA` / `requiresMFASetup` branches in
  `login()` — the passkey already satisfies the MFA requirement.
- Treat "has ≥1 passkey" as equivalent to "MFA configured" for the admin `mfaRequired` policy, OR
  record the passkey login as a satisfied MFA verification (set `lastMFAVerification`).
- Keep password+MFA fully working for users who haven't enrolled a passkey.

Decide this explicitly with whoever owns the security policy before shipping.

---

## 10. Testing checklist

- [ ] Local dev: `rpID=localhost`, register + login a platform passkey on `http://localhost:5173`.
- [ ] Staging/prod: register on `https://www.tahfuelorder.dev`, confirm `rpID=tahfuelorder.dev` works.
- [ ] Cross-device: enroll on laptop, log in on phone via hybrid (QR) flow.
- [ ] Mobile app / mobile web: Face ID / Android biometric prompt appears and verifies.
- [ ] Clone detection: counter increments and persists across logins.
- [ ] Revocation: delete a passkey → that credential can no longer authenticate.
- [ ] Multiple passkeys per user: laptop + phone both work; `excludeCredentials` prevents dupes.
- [ ] Fallback: password + MFA still works for non-passkey users.
- [ ] `excludeCredentials` / `allowCredentials` populated → no duplicate registration, correct creds offered.
- [ ] Unit tests mirroring `__tests__/integration/auth.test.ts` for the 4 new endpoints.
- [ ] `/.well-known/passkey-endpoints` returns 200 and the 404 warn is gone from logs.

---

## 11. Effort estimate

| Task | Estimate |
| --- | --- |
| `.well-known/passkey-endpoints` route + blocklist allowlist | 10–20 min |
| `npm install` + env config (`WEBAUTHN_*`) for dev & prod | 30 min |
| `Passkey` model + challenge storage helper | 1–2 h |
| 4 core endpoints + `issueSession` refactor | 4–6 h |
| Management endpoints (list/delete/rename) | 1–2 h |
| Frontend: login button + AuthContext wiring | 2–3 h |
| Frontend: security settings / enrollment UI | 2–3 h |
| MFA policy integration | 1–2 h |
| Cross-device + mobile testing | 2–3 h |
| **Total** | **~1.5–2 days** |

---

## 12. Rollout sequence (recommended)

1. **Day 0:** ship the `.well-known` quick win (silences the log noise immediately).
2. **Phase 1:** backend model + 4 endpoints + `issueSession` refactor, behind no UI.
3. **Phase 2:** security-settings enrollment UI → let admins/yourself enroll & dogfood.
4. **Phase 3:** add the "Sign in with passkey" button to `Login.tsx`.
5. **Phase 4:** decide & implement the MFA-equivalence policy; document for users.

Keep password + MFA as the permanent fallback. Do **not** make passkeys mandatory.

---

## 13. References

- WebAuthn spec — https://www.w3.org/TR/webauthn-2/
- SimpleWebAuthn docs — https://simplewebauthn.dev/
- `.well-known` URI registry — https://www.iana.org/assignments/well-known-uris/
- Passkeys overview — https://passkeys.dev/

---

## 14. Implementation Phases (tracked)

Work is divided into 5 self-contained phases. Each phase is shippable on its own and must be
reported and approved before the next begins.

### Phase 1 — Quick win: silence the `.well-known` 404  ✅ **DONE (awaiting review)**
*Goal: stop the recurring `GET /.well-known/passkey-endpoints 404` warn and stop it (and similar
browser probes) from accruing auto-blocklist strikes against the office IP. No auth changes.*

- [x] Add `GET /.well-known/passkey-endpoints` route in `server.ts` (returns 200 JSON, cacheable).
- [x] Exempt `/.well-known/` probes from the `suspicious404Middleware` strike counter.
- [x] Verify it compiles (`tsc --noEmit` clean). Runtime 200 to confirm after deploy.

**Risk:** none — additive, public, no impact on existing auth.

### Phase 2 — Backend foundation (no UI, no live endpoints)  ✅ **DONE (awaiting review)**
*Goal: groundwork that changes no behavior yet.*

- [x] `npm install @simplewebauthn/server` + `WEBAUTHN_*` env vars (dev + prod) in `config/index.ts` + `.env`.
- [x] `Passkey` model (`backend/src/models/Passkey.ts`) + registered in `models/index.ts`.
- [x] Challenge storage: `PasskeyChallenge` model (TTL) + `passkeyChallengeService` (mirrors `tempSessionToken`, single-use).
- [x] Refactored `login()` token issuance into reusable `issueSession(user, req, res, opts)` in `authController.ts`.
- [x] `tsc --noEmit` clean; `authRememberMe` unit suite (12) passes (driver-guard behavior preserved).

**Risk:** low — the `issueSession` refactor touches the live login path; behavior preserved (unit tests green).
**Note:** `verifyMFA()` / `setupMFAVerify()` still have their own inline issuance — candidates to migrate
onto `issueSession` later, but left untouched to keep this phase's blast radius small.

### Phase 3 — Backend endpoints  ✅ **DONE (awaiting review)**
*Goal: passkeys work end-to-end via API (testable with curl / REST client).*

- [x] 4 core endpoints (register options/verify, login options/verify) in `passkeyController.ts`.
- [x] Management endpoints (list / delete / rename).
- [x] Routes added to `authRoutes.ts`; controller exported from `controllers/index.ts`.
- [x] Wired the two public passkey login paths into the `server.ts` CSRF-skip allowlist (register paths stay protected).
- [x] Unit tests (`passkeyController.test.ts`, 12) — challenge validation, counter persistence, dup/enumeration guards, issueSession delegation. `tsc` clean; full auth+passkey suite green (24).

**Note:** built against `@simplewebauthn/server` **v13** (registrationInfo.credential / base64url id shape).
Endpoints are live but no UI calls them yet — that's Phase 4.

### Phase 4 — Frontend  ✅ **DONE (awaiting review)**
*Goal: users can enroll and log in with passkeys.*

- [x] `@simplewebauthn/browser` installed; `passkeyAPI` transport in `api.ts`; `passkeyService.ts` helpers (`enrollPasskey`, `loginWithPasskey`, `isPasskeySupported`, `describePasskeyError`).
- [x] "Sign in with a passkey" button in `Login.tsx` (both mobile + desktop layouts) → reuses existing `completeLogin` from `AuthContext`.
- [x] `PasskeySettings.tsx` enrollment/management UI mounted in the existing security modal (`EnhancedDashboard.tsx`) below MFA settings.
- [x] Capability detection hides the button/UI when WebAuthn is unsupported.
- [x] Broadened the api 401 interceptor so passkey-login failures surface inline instead of redirecting.
- [x] `tsc` clean for all passkey files (only a pre-existing unrelated `LPOSheetView` error remains); `api` unit tests pass.

**Note:** `Login.test.tsx` has 13 pre-existing failures (stale vs. the dual mobile/desktop layout — verified
identical on committed code with my changes stashed). Not caused by this work.

### Phase 5 — Policy, testing, rollout  🟡 **CODE DONE — manual testing/rollout handed off**
*Goal: define how passkeys satisfy MFA, then harden and roll out.*

**Decision (2026-06-20):** *"Passkey counts as MFA."* A user with ≥1 registered passkey is treated
as having satisfied the MFA requirement and is NOT forced to set up TOTP/email on password login.
The global MFA kill-switch still wins; a passkey overrides role-based and per-user-mandatory requirements.

- [x] MFA-equivalence policy: `mfaService.isMFARequired` returns false when the user has a passkey
      (single source of truth — honored by both `login()`'s forced-setup branch and the MFA status endpoint).
- [x] Passkey logins recorded as MFA-satisfied (`UserMFA.lastMFAVerification`, best-effort) for audit.
- [x] Unit test added (`securitySettings.test.ts`) verifying the exemption against a real test DB; `tsc` clean; 65 tests green.

**Manual verification (needs real devices + a deploy — cannot be done from here):**
- [ ] Set prod env: `WEBAUTHN_RP_ID=tahfuelorder.dev`, `WEBAUTHN_ORIGINS=https://www.tahfuelorder.dev,https://tahfuelorder.dev`.
- [ ] Local dev (`rpID=localhost`): enroll + log in a platform passkey on `http://localhost:5173`.
- [ ] Enroll on laptop, log in on phone via hybrid (QR) flow.
- [ ] Mobile (Face ID / Android biometric) prompt appears and verifies.
- [ ] Clone detection: counter increments across logins (verify in DB).
- [ ] Revocation: delete a passkey → it can no longer authenticate.
- [ ] Multiple passkeys per user; `excludeCredentials` blocks duplicate registration.
- [ ] Fallback: password + (TOTP/email) MFA still works for non-passkey users.

**Rollout sequence (see §12):** ship `.well-known` (done) → dogfood enrollment in security settings →
expose the login button (done, behind capability check) → confirm the MFA-equivalence policy in production.
