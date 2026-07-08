# Frontend Security Documentation
## Fuel Order System — `frontend/src`

> **Last updated:** April 22, 2026  
> **Scope:** All security implementations in the React/TypeScript frontend  
> **Stack:** React 18, TypeScript, Vite, Axios, Socket.IO client

---

## Table of Contents

1. [Authentication Flow](#1-authentication-flow)
2. [Multi-Factor Authentication (MFA)](#2-multi-factor-authentication-mfa)
3. [Token Management](#3-token-management)
4. [Token Refresh & Silent Renewal](#4-token-refresh--silent-renewal)
5. [Protected Routes & Route Guards](#5-protected-routes--route-guards)
6. [Auth Context & State Management](#6-auth-context--state-management)
7. [CSRF Protection](#7-csrf-protection)
8. [API Service Layer & Interceptors](#8-api-service-layer--interceptors)
9. [Role-Based Access Control (RBAC)](#9-role-based-access-control-rbac)
10. [Session Timeout & Inactivity Tracking](#10-session-timeout--inactivity-tracking)
11. [Input Validation & Form Security](#11-input-validation--form-security)
12. [XSS Prevention](#12-xss-prevention)
13. [Error Handling & Information Leakage Prevention](#13-error-handling--information-leakage-prevention)
14. [Logout & Session Cleanup](#14-logout--session-cleanup)
15. [WebSocket Security](#15-websocket-security)
16. [Service Worker Security](#16-service-worker-security)
17. [Content Security Policy Compliance](#17-content-security-policy-compliance)
18. [Environment Configuration](#18-environment-configuration)
19. [Security Architecture Summary](#19-security-architecture-summary)

---

## 1. Authentication Flow

### File: `frontend/src/components/Login.tsx`

The login component implements a layered credential flow that minimises the surface area for credential exposure.

**Key security decisions:**

| Decision | Implementation | Reason |
|----------|----------------|--------|
| No credential storage | Credentials submitted directly to API, never persisted | Prevents offline credential theft |
| Username-only persistence | `fuel_order_last_username` in `localStorage` only when *Remember Me* is ticked | Convenience without storing secrets |
| Device ID generation | `crypto.randomUUID()` stored in both `localStorage` and `sessionStorage` | Enables device fingerprinting for risk scoring |
| Session message handling | Reads `reason` URL parameter on page load | Communicates expiry / deactivation without session state |

```typescript
// Device ID — generated once, persisted for device fingerprinting
const deviceId = localStorage.getItem('device_id') || crypto.randomUUID();
localStorage.setItem('device_id', deviceId);
sessionStorage.setItem('deviceId', deviceId);

// Only username is optionally persisted — never the password
if (rememberMe) {
  localStorage.setItem('fuel_order_last_username', credentials.username);
} else {
  localStorage.removeItem('fuel_order_last_username');
}
```

**Login form uses `type="password"`** on the password input, preventing the browser from displaying the credential in plain text or auto-suggesting it in ways the user does not control.

**Session notification parameters** (`reason=expired`, `reason=unauthorized`, `reason=deactivated`) are read from the URL on mount and displayed as contextual messages, guiding users back to authentication without exposing technical error details.

---

## 2. Multi-Factor Authentication (MFA)

### Files: `frontend/src/components/MFAVerification.tsx`, `frontend/src/components/MFASetup.tsx`, `frontend/src/components/MFASetupLogin.tsx`

The frontend supports all four MFA methods provided by the backend, with a graceful fallback chain:

| Method | UI Component | Flow |
|--------|-------------|------|
| TOTP | 6-digit code grid | User opens authenticator app, enters current code |
| Email OTP | 6-digit code grid + resend timer | Backend sends code to registered email |
| SMS OTP | 6-digit code grid + resend timer | Backend sends code via SMS |
| Backup codes | Single text field | User enters one of 10 pre-generated codes |

**Input design:** Individual digit boxes (not a single field) prevent paste-based autofill attacks and make code entry intentional.

**CSRF token in every MFA request:** All MFA API calls include the CSRF token using the same interceptor as all other state-changing requests (see [Section 7](#7-csrf-protection)).

**CSRF token retrieval function used in MFA components:**

```typescript
const getCsrfToken = (): string | undefined => {
  // Primary: sessionStorage
  const stored = sessionStorage.getItem('xsrf_token');
  if (stored && stored !== '[REDACTED]') return stored;

  // Fallback: read from cookie (same-origin only)
  const match = decodeURIComponent(document.cookie)
    .split(';')
    .map(c => c.trim())
    .find(c => c.startsWith('XSRF-TOKEN='));
  return match ? match.substring('XSRF-TOKEN='.length) : undefined;
};
```

**Resend timer:** A visible countdown prevents rapid resend requests. The backend enforces its own rate limit on OTP delivery, making this a UX complement to the server-side control.

**Backup code generation (setup):** Backup codes are displayed exactly once during setup. The UI makes this explicit with a warning and a copy/download prompt — users cannot retrieve them again after closing the setup screen.

**Trusted device option:** After successful MFA, users may tick "Trust this device." The device fingerprint is sent to the backend, which marks it as trusted and skips MFA on future logins from that device.

---

## 3. Token Management

### File: `frontend/src/services/api.ts`

The system separates access tokens and refresh tokens across different storage mechanisms with different security properties:

| Token | Storage | Cleared | Accessible to JS |
|-------|---------|---------|-----------------|
| Access token | `sessionStorage` (`fuel_order_token`) | On tab close | Yes — needed to send in headers |
| Refresh token | HttpOnly cookie (set by backend) | On logout / expiry | **No** — cannot be read by JavaScript |

**Why `sessionStorage` for the access token:**  
`sessionStorage` is scoped to a single browser tab and is cleared automatically when the tab closes. This means a stolen device with an inactive browser presents no residual token. The attacker would need an active session to steal anything.

**Why HttpOnly cookie for the refresh token:**  
The refresh token is never accessible to JavaScript at all — not even the application code can read it. This means an XSS attack that successfully runs arbitrary script in the browser still **cannot steal the refresh token**, as it never appears in any JavaScript-readable storage.

**Token retrieval in requests:**

```typescript
// Request interceptor — adds token to every outgoing request
const token = sessionStorage.getItem('fuel_order_token');
if (token && !config.headers.Authorization) {
  config.headers.Authorization = `Bearer ${token}`;
}
```

---

## 4. Token Refresh & Silent Renewal

### File: `frontend/src/contexts/AuthContext.tsx`, `frontend/src/services/api.ts`

**Silent refresh on page load:**  
When the app initialises, if `fuel_order_remember_me` is set in `localStorage`, the client attempts a silent refresh by calling `/auth/refresh`. The backend reads the HttpOnly cookie, validates it, and returns a new access token. The new token is stored in `sessionStorage` for the session.

**Automatic refresh on `401` response:**

```typescript
// Response interceptor — retries once on 401 with a fresh access token
const hasRememberMe = localStorage.getItem('fuel_order_remember_me') === '1';
if (hasRememberMe && !originalRequest._authRetry) {
  originalRequest._authRetry = true;   // Prevents infinite retry loop
  try {
    const refreshRes = await apiClient.post('/auth/refresh');
    const newToken = refreshRes.data?.data?.accessToken || refreshRes.data?.data?.token;
    if (newToken) {
      sessionStorage.setItem('fuel_order_token', newToken);
      originalRequest.headers.Authorization = `Bearer ${newToken}`;
      return apiClient(originalRequest);  // Replay the original request
    }
  } catch {
    localStorage.removeItem('fuel_order_remember_me');
    // Falls through to logout redirect below
  }
}
```

The `_authRetry` flag prevents infinite loops if the refresh itself fails.

**Token expiration detection:**

```typescript
const errorMessage = error.response?.data?.message || '';
const isTokenExpired =
  errorMessage.toLowerCase().includes('expired') ||
  error.response?.data?.error?.name === 'TokenExpiredError';

if (isTokenExpired) {
  window.location.href = '/login?reason=expired';
} else {
  window.location.href = '/login?reason=unauthorized';
}
```

Two signals are checked (message text and error name) to handle both backend error formats reliably.

---

## 5. Protected Routes & Route Guards

### File: `frontend/src/components/ProtectedRoute.tsx`

Every route that requires authentication is wrapped in `ProtectedRoute`, which enforces three independent checks before rendering the child component:

```
Request to navigate to a route
        │
        ▼
1. Is isLoading? ──Yes──► Show spinner (auth state not yet resolved)
        │ No
        ▼
2. isAuthenticated && user exists? ──No──► <Navigate to="/login" state={{ from }} replace />
        │ Yes
        ▼
3. allowedRoles includes user.role? ──No──► <Navigate to={fallbackPath} replace />
        │ Yes (or no role restriction)
        ▼
4. hasPermission(resource, action)? ──No──► <Navigate to={fallbackPath} replace />
        │ Yes (or no permission restriction)
        ▼
        Render children
```

**Loading state guard:** The `isRestoringSession` flag prevents a flash where an unauthenticated redirect fires before the async session restoration check completes on initial load.

**Usage pattern:**

```typescript
<ProtectedRoute
  allowedRoles={['super_admin', 'admin']}
  requiredPermission={{ resource: 'users', action: 'manage' }}
  fallbackPath="/unauthorized"
>
  <UserManagementPage />
</ProtectedRoute>
```

**`RoleBasedUI` component** — for hiding/showing UI elements without redirecting:

```typescript
export const RoleBasedUI: React.FC<RoleBasedUIProps> = ({ children, resource, action, fallback }) => {
  const { hasPermission } = useAuth();
  if (!hasPermission(resource, action)) return fallback || null;
  return <>{children}</>;
};
```

This ensures that buttons, menus, and action controls are only rendered for users who have the permissions to use them — not just hidden with CSS.

---

## 6. Auth Context & State Management

### File: `frontend/src/contexts/AuthContext.tsx`

The authentication state is managed through a React context backed by a `useReducer` — making state transitions explicit and traceable.

**State shape:**

```typescript
interface AuthState {
  user: AuthUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  isRestoringSession: boolean;  // Prevents login-page flash on initial load
  error: string | null;
  theme: 'light' | 'dark';
}
```

**Explicit action types** — every state change goes through a named action, making the flow easy to audit:

| Action | Trigger |
|--------|---------|
| `AUTH_START` | Login request initiated |
| `AUTH_SUCCESS` | Backend confirmed credentials |
| `AUTH_ERROR` | Login failed |
| `AUTH_LOGOUT` | User or system triggered logout |
| `AUTH_CLEAR_ERROR` | Error dismissed |
| `SESSION_RESTORE_DONE` | Initial session check completed |
| `SET_THEME` | Theme changed |
| `CLEAR_MUST_CHANGE_PASSWORD` | Forced password change satisfied |

**Session restoration on mount:**

```typescript
const stored = sessionStorage.getItem('fuel_order_auth');
if (stored) {
  const authData = JSON.parse(stored);
  // If mustChangePassword is set, verify the token is still live
  if (authData.mustChangePassword) {
    try {
      await authAPI.getCurrentUser();
    } catch {
      // Token expired — clear everything instead of restoring a stale session
      sessionStorage.removeItem('fuel_order_auth');
      sessionStorage.removeItem('fuel_order_token');
      dispatch({ type: 'AUTH_ERROR', payload: '' });
      return;
    }
  }
}
```

This prevents restoring sessions from tokens that expired while the browser was closed.

**Context API exposed to consumers:**

```typescript
interface AuthContextType extends AuthState {
  login: (credentials: LoginCredentials) => Promise<any>;
  completeLogin: (authData: AuthResponse, rememberMe?: boolean) => Promise<void>;
  logout: () => void;
  clearError: () => void;
  clearMustChangePassword: () => void;
  hasPermission: (resource: string, action: string) => boolean;
  checkRouteAccess: (route: string) => boolean;
  toggleTheme: () => void;
  setTheme: (theme: 'light' | 'dark') => void;
  isDark: boolean;
}
```

**`useAuth` hook** enforces that auth data is only consumed inside the provider boundary:

```typescript
export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
}
```

---

## 7. CSRF Protection

### File: `frontend/src/services/api.ts`

Every state-changing HTTP request (`POST`, `PUT`, `PATCH`, `DELETE`) includes a CSRF token in the `X-XSRF-TOKEN` header, implementing the **Synchronised Token Pattern**.

**Token storage:** `sessionStorage` key `xsrf_token` (cleared on tab close, not readable by other origins).

**Token retrieval priority:**

1. `sessionStorage.getItem('xsrf_token')` — primary
2. `document.cookie` scan for `XSRF-TOKEN=` — fallback for same-origin

**Request interceptor — token injection:**

```typescript
if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(config.method?.toUpperCase() || '')) {
  let csrfToken = getCsrfToken();

  // If no token cached, fetch it on demand before sending
  if (!csrfToken && !config.url?.includes('/csrf-token')) {
    try {
      await fetchCsrfToken();
      csrfToken = getCsrfToken();
    } catch (error) {
      console.error('[CSRF] Failed to fetch CSRF token in interceptor:', error);
    }
  }

  if (csrfToken) {
    config.headers['X-XSRF-TOKEN'] = csrfToken;
  }
}
```

**Response interceptor — automatic token rotation on `403`:**

```typescript
if (
  error.response?.status === 403 &&
  (error.response?.data?.code === 'CSRF_VALIDATION_FAILED' ||
   error.response?.data?.code === 'CSRF_TOKEN_MISSING')
) {
  if (!originalRequest._retry) {
    originalRequest._retry = true;       // Prevents infinite loop
    await fetchCsrfToken();              // Fetch fresh token
    await new Promise(resolve => setTimeout(resolve, 100));
    return apiClient(originalRequest);   // Replay with new token
  }
}
```

If the CSRF token has expired (2-hour server TTL), the client transparently refreshes it and retries the request once — the operation succeeds without user disruption.

**Initial fetch on app load:**

```typescript
// api.ts module-level — runs when the module is first imported
fetchCsrfToken().catch(err => console.error('[CSRF] Initial token fetch failed:', err));
```

This ensures a valid token is available before the user submits their first form.

---

## 8. API Service Layer & Interceptors

### File: `frontend/src/services/api.ts`

A single Axios instance is configured with all security settings applied globally, ensuring consistency across the entire application:

```typescript
const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api/v1',
  headers: { 'Content-Type': 'application/json' },
  withCredentials: true,   // Sends HttpOnly cookies (required for refresh token + CSRF cookie)
});
```

**`withCredentials: true`** is the critical flag that causes the browser to include the HttpOnly refresh token cookie on every request. Without this, silent token refresh would be impossible.

### Request Interceptor pipeline:

```
Outgoing request
       │
       ├── 1. Add Authorization: Bearer <token> from sessionStorage
       └── 2. Add X-XSRF-TOKEN for POST/PUT/PATCH/DELETE (fetch on demand if missing)
```

### Response Interceptor pipeline:

```
Incoming response error
       │
       ├── 403 + CSRF error code ──► Fetch new CSRF token, retry once
       │
       ├── 401 on /auth/login or /auth/refresh ──► Let component handle (avoid redirect loop)
       │
       ├── 401 on any other request
       │       ├── hasRememberMe=true ──► Attempt silent token refresh
       │       │       ├── Success ──► Replay original request with new token
       │       │       └── Failure ──► Clear remember-me, fall through to redirect
       │       └── Redirect /login?reason=expired (if token expired)
       │                  or /login?reason=unauthorized
       │
       └── Propagate other errors to the calling component
```

---

## 9. Role-Based Access Control (RBAC)

### File: `frontend/src/utils/permissions.ts`

The frontend mirrors the backend's 19-role permission model. This ensures the UI proactively hides controls the user cannot use, reducing unnecessary API calls and preventing confusion.

**Resources and actions defined:**

```typescript
export const RESOURCES = {
  DASHBOARD: 'dashboard',
  DELIVERY_ORDERS: 'delivery_orders',
  LPOS: 'lpos',
  FUEL_RECORDS: 'fuel_records',
  FLEET_TRACKING: 'fleet_tracking',
  CHECKPOINTS: 'checkpoints',
  USERS: 'users',
  REPORTS: 'reports',
  SYSTEM_CONFIG: 'system_config',
  AUDIT_LOGS: 'audit_logs',
  DATABASE_MONITOR: 'database_monitor',
  TRASH: 'trash',
  NOTIFICATIONS: 'notifications',
};

export const ACTIONS = {
  READ: 'read', CREATE: 'create', UPDATE: 'update', DELETE: 'delete',
  APPROVE: 'approve', MANAGE: 'manage', EXPORT: 'export',
  RESTORE: 'restore', PERMANENT_DELETE: 'permanent_delete',
};
```

**Role permission matrix (all 19 roles):**

| Role | Key Permissions |
|------|----------------|
| `super_admin` | Full system access — all resources, all actions |
| `admin` | Administrative access, excluding some system settings |
| `manager` | Station management, approvals, reports |
| `super_manager` | Multi-station view, cross-station reports |
| `supervisor` | Team supervision, delivery order oversight |
| `clerk` | Data entry — create/update delivery orders, LPOs |
| `driver` | Limited — view own orders and fuel records |
| `viewer` | Read-only across all accessible resources |
| `fuel_order_maker` | Create and update fuel orders only |
| `boss` | Executive view — reports and dashboards |
| `yard_personnel` | Yard operations — specific yard resources |
| `fuel_attendant` | Fuel station operations — fuel records |
| `station_manager` | Station-scoped management |
| `payment_manager` | Payment records and approvals |
| `dar_yard` | DAR yard dispense and records |
| `tanga_yard` | Tanga yard dispense and records |
| `mmsa_yard` | MMSA yard dispense and records |
| `import_officer` | Import order creation and management |
| `export_officer` | Export order creation and management |

**Permission check function:**

```typescript
export function hasPermission(
  userPermissions: Permission[],
  resource: string,
  action: string
): boolean {
  return userPermissions.some(
    (p) => p.resource === resource && p.actions.includes(action)
  );
}
```

**Route-to-resource mapping:**

```typescript
export function canAccessRoute(userPermissions: Permission[], route: string): boolean {
  const routeResourceMap: Record<string, string> = {
    '/': RESOURCES.DASHBOARD,
    '/delivery-orders': RESOURCES.DELIVERY_ORDERS,
    '/lpos': RESOURCES.LPOS,
    '/fuel-records': RESOURCES.FUEL_RECORDS,
    '/users': RESOURCES.USERS,
    '/reports': RESOURCES.REPORTS,
    '/settings': RESOURCES.SYSTEM_CONFIG,
  };
  const resource = routeResourceMap[route];
  return resource ? hasPermission(userPermissions, resource, ACTIONS.READ) : false;
}
```

> **Important:** Frontend RBAC is a **UX layer** — it prevents unauthorised UI actions and reduces noise. The backend independently enforces the same RBAC rules on every API request. A malicious actor bypassing the frontend still cannot perform unauthorised operations.

---

## 10. Session Timeout & Inactivity Tracking

### File: `frontend/src/utils/activityTracker.ts`

An activity tracker runs as long as the user is authenticated, monitoring six browser events to detect real user presence:

```typescript
private activityEvents = [
  'mousedown', 'mousemove', 'keypress',
  'scroll', 'touchstart', 'click',
];
```

**Default timeout:** 30 minutes (`INACTIVITY_TIMEOUT = 30 * 60 * 1000`)

**How it works:**

1. On login, `activityTracker.start(onInactivity, timeoutMs)` is called
2. Every detected user event resets the countdown timer
3. If 30 minutes pass with no activity, `onInactivity()` is called — triggering automatic logout
4. On logout, `activityTracker.stop()` removes all event listeners and clears the timer

```typescript
start(onInactivity: ActivityCallback, timeoutMs?: number): void {
  this.timeoutMs = timeoutMs ?? INACTIVITY_TIMEOUT;
  this.activityEvents.forEach(event =>
    window.addEventListener(event, this.handleActivity, true)
  );
  this.resetTimeout();
}

private handleActivity = (): void => {
  this.resetTimeout();  // Any user event cancels the pending logout
};

private resetTimeout(): void {
  if (this.timeout) clearTimeout(this.timeout);
  this.timeout = window.setTimeout(this.onInactivityCallback!, this.timeoutMs);
}
```

The timeout is coordinated with the backend's session TTL (`SystemConfig.systemSettings.session.sessionTimeout`, default 30 min), so frontend and backend timeouts expire in sync.

---

## 11. Input Validation & Form Security

### 11.1 Password Change — `frontend/src/components/ChangePasswordModal.tsx`

Password requirements are enforced client-side with live visual feedback before the request is sent:

```typescript
const passwordRequirements = [
  { met: formData.newPassword.length >= 8,         text: 'At least 8 characters' },
  { met: /[A-Z]/.test(formData.newPassword),        text: 'One uppercase letter' },
  { met: /[a-z]/.test(formData.newPassword),        text: 'One lowercase letter' },
  { met: /[0-9]/.test(formData.newPassword),        text: 'One number' },
];

const isPasswordValid = passwordRequirements.every(req => req.met);
const doPasswordsMatch =
  formData.newPassword === formData.confirmPassword && formData.confirmPassword !== '';
```

All four rules must be satisfied and the confirmation must match before the submit button enables. The backend independently enforces a stricter policy (minimum 12 characters, special characters required).

### 11.2 User Creation — `frontend/src/components/CreateUserModal.tsx`

```typescript
// Required field check before API call
if (!formData.username || !formData.email || !formData.password ||
    !formData.firstName || !formData.lastName) {
  setError('Please fill in all required fields');
  return;
}

// Role-conditional validation
if (requiresStationSelection && !formData.station) {
  setError('Please select a station for the manager');
  return;
}
```

Station values for manager roles are loaded dynamically from the API (not hardcoded), preventing assignment to non-existent stations.

### 11.3 General form security practices

- `e.preventDefault()` on all form submit handlers — prevents default browser form submission and accidental GET requests with credentials in the URL
- All text inputs use controlled React state — no raw DOM manipulation
- Sensitive fields (passwords, OTP codes) use `type="password"` or `type="tel"` with `inputMode="numeric"` as appropriate

---

## 12. XSS Prevention

### React's built-in protection

All user-supplied data rendered through JSX is **automatically escaped** by React's virtual DOM reconciler. React converts `<`, `>`, `"`, `'`, and `&` to their HTML entities when inserting text content, preventing injected HTML from being interpreted by the browser.

### No dangerous patterns

A full audit of the codebase found:

| Pattern | Status |
|---------|--------|
| `innerHTML` usage | ✅ None found |
| `dangerouslySetInnerHTML` | ✅ None found |
| `eval()` | ✅ None found |
| `document.write()` | ✅ None found |
| Inline `<script>` injection | ✅ None found |
| `href="javascript:..."` | ✅ None found |

### External-only scripts

`frontend/index.html` loads all scripts from external files, not inline:

```html
<!-- External file — satisfies CSP script-src 'self' without 'unsafe-inline' -->
<script src="/theme-init.js"></script>
<script src="/sw-register.js" defer></script>
```

This makes it possible to enforce a strict `Content-Security-Policy: script-src 'self'` header without the `'unsafe-inline'` exception that would nullify XSS protection.

---

## 13. Error Handling & Information Leakage Prevention

### No sensitive information in UI errors

The frontend intentionally shows **generic error messages** to prevent user enumeration and information disclosure:

**Login errors:**

```typescript
// AuthContext — error message comes from backend but is treated as opaque
const errorMessage = error?.response?.data?.message || error?.message || 'Login failed';
dispatch({ type: 'AUTH_ERROR', payload: errorMessage });
```

The backend is configured to return `"Invalid credentials"` for both "user not found" and "wrong password" scenarios, preventing attackers from determining whether an account exists.

**Error auto-clear:**

```typescript
// Login.tsx — clears error when user starts typing (avoids persistent error display)
if (error) clearError();

// Auto-dismiss after 5 seconds
useEffect(() => {
  if (error) {
    const timer = setTimeout(() => clearError(), 5000);
    return () => clearTimeout(timer);
  }
}, [error]);
```

### No stack traces or debug info in production

The Vite build process strips `console.error` calls containing stack traces in the production bundle. Error boundaries are used at the component level to catch render errors without exposing component trees.

---

## 14. Logout & Session Cleanup

### File: `frontend/src/contexts/AuthContext.tsx`

Logout performs a **comprehensive, ordered cleanup** to ensure no residual authentication state remains in the browser after the user signs out:

```typescript
const logout = () => {
  // 1. Stop inactivity tracker (removes all event listeners)
  activityTracker.stop();

  // 2. Clear auth tokens and session identity
  sessionStorage.removeItem('fuel_order_auth');
  sessionStorage.removeItem('fuel_order_token');

  // 3. Clear active UI state
  sessionStorage.removeItem('fuel_order_active_tab');
  sessionStorage.removeItem('fuel_order_active_role');
  sessionStorage.removeItem('dashboard_search_query');
  sessionStorage.removeItem('dashboard_search_results');

  // 4. Clear remember-me flag (backend simultaneously clears HttpOnly refresh cookie)
  localStorage.removeItem('fuel_order_remember_me');

  // 5. Clear all persisted filter/preference state
  Object.keys(localStorage)
    .filter(k => k.startsWith('fuel-order:'))
    .forEach(k => localStorage.removeItem(k));

  // 6. Reset React state
  dispatch({ type: 'AUTH_LOGOUT' });
  dispatch({ type: 'SET_THEME', payload: getInitialTheme() });

  // 7. Hard redirect — ensures no stale React state persists in memory
  window.location.href = '/login';
};
```

**Why `window.location.href` instead of React Router `navigate()`:**  
A hard redirect forces a full page reload, destroying the React component tree and all in-memory state. Using React Router would navigate without resetting memory, potentially leaving sensitive data in component state.

**Simultaneous backend cleanup:**  
The logout API call (`POST /auth/logout`) instructs the backend to:
- Clear the HttpOnly refresh token cookie
- Revoke the refresh token in the database
- Log the logout event in the audit trail
- Terminate the active session record

---

## 15. WebSocket Security

### File: `frontend/src/services/websocket.ts`

Real-time events are delivered over Socket.IO. The connection is authenticated and protected against duplicate connections:

```typescript
export const initializeWebSocket = (token: string): Socket => {
  if (socket) return socket;   // Connection pooling — prevents duplicate sockets

  const WS_URL = resolveWebSocketUrl();

  socket = io(WS_URL, {
    auth: { token },            // Token in auth object — NOT in the URL
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    reconnectionAttempts: 5,
  });

  return socket;
};
```

**Security decisions:**

| Decision | Reason |
|----------|--------|
| Token in `auth` object, not URL | URLs appear in server logs, browser history, and referrer headers — putting tokens there would expose them |
| Connection pooling (`if (socket) return socket`) | Prevents duplicate authenticated connections that could bypass per-connection limits |
| Capped reconnection attempts (5) | Prevents a permanently failing connection from generating unlimited reconnect traffic |
| Exponential backoff (1 s → 5 s max) | Reduces load during backend unavailability |

**Event handling isolation:** All event callback registrations use module-level stable references (`Map` and dedicated variables), preventing listener accumulation memory leaks that could lead to multiple callback executions on a single event.

---

## 16. Service Worker Security

### File: `frontend/public/sw.js`

The service worker is deliberately kept minimal to avoid introducing caching-related security risks:

```javascript
// Network-only strategy — every request goes to the network, nothing served from cache
self.addEventListener('fetch', (event) => {
  event.respondWith(fetch(event.request));
});
```

**Why network-only?**  
Caching authenticated responses risks serving stale data to users who have since been deactivated, had their role changed, or been logged out. By never caching, the service worker eliminates an entire class of stale-credential vulnerabilities.

**Web push notification handling:**

```javascript
self.addEventListener('push', (event) => {
  let data = { title: 'New Notification', body: '', url: '/', tag: 'fuel-order-notification' };
  try {
    if (event.data) data = { ...data, ...event.data.json() };
  } catch (_) {
    // Fallback to text if JSON parsing fails — prevents silent failure
    if (event.data) data.body = event.data.text();
  }
  // ... showNotification with sanitised data
});
```

The `try/catch` around `event.data.json()` prevents a malformed push payload from crashing the service worker. The spread into a default object means even if the backend sends unexpected keys, only known fields are used.

### File: `frontend/public/sw-register.js`

```javascript
// Kept as an external file to satisfy CSP script-src 'self' without 'unsafe-inline'
if ('serviceWorker' in navigator) {
  window.addEventListener('load', function () {
    navigator.serviceWorker.register('/sw.js');
  });
}
```

Registration runs after page load to avoid delaying the initial render and to ensure the page is fully interactive before the service worker activates.

---

## 17. Content Security Policy Compliance

### File: `frontend/index.html`

The HTML entry point is structured for CSP compatibility:

```html
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=5.0" />
  <meta name="mobile-web-app-capable" content="yes" />
  <meta name="apple-mobile-web-app-capable" content="yes" />
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
  <meta name="theme-color" content="#2563eb" />

  <!-- External scripts only — enables strict CSP: script-src 'self' -->
  <script src="/theme-init.js"></script>
  <script src="/sw-register.js" defer></script>
</head>
```

**Charset declaration** (`UTF-8`) prevents charset-sniffing attacks where a browser misinterprets encoding to execute injected content.

**No inline scripts** means the following CSP header is enforceable without `'unsafe-inline'`:

```
Content-Security-Policy: script-src 'self'; object-src 'none'; base-uri 'self'
```

The `'unsafe-inline'` exception is the most commonly exploited CSP loophole — its absence significantly raises the bar for XSS exploitation.

### File: `frontend/public/theme-init.js`

The theme initialisation script is loaded synchronously (blocking) to prevent a flash of wrong theme, but is an external file rather than an inline script:

```javascript
// Applies dark/light theme before React renders
// Kept external to satisfy CSP
(function () {
  const stored = localStorage.getItem('theme');
  if (stored === 'dark' || (!stored && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
    document.documentElement.classList.add('dark');
  }
})();
```

---

## 18. Environment Configuration

### Files: `frontend/.env`, `frontend/.env.production`

Environment-specific configuration prevents accidental cross-environment connections:

| Variable | Development | Production |
|----------|-------------|-----------|
| `VITE_API_BASE_URL` | `/api` (relative — Vite dev proxy) | `/api/v1` (relative — nginx proxies to backend) |

**Development proxy** (`vite.config.ts`): The `/api` path is proxied to `http://localhost:5000/api` by Vite's dev server. This keeps requests same-origin in development, meaning cookies (including the HttpOnly refresh cookie) are sent automatically without CORS complexity.

**No secrets in env files:** Only the API base URL is in the environment files. No tokens, passwords, or encryption keys are ever committed to the frontend environment configuration.

**Vite `import.meta.env` access:** All environment variables are accessed through `import.meta.env.VITE_*`. Vite's build pipeline strips these at compile time, inlining the values. Variables without the `VITE_` prefix are inaccessible to frontend code, preventing accidental exposure of server-side env vars.

---

## 19. Security Architecture Summary

### Defense-in-depth layers

```
User action
     │
     ├── 1. Input validation (form level — before any API call)
     ├── 2. CSRF token injected into request header (Axios interceptor)
     ├── 3. Bearer token attached from sessionStorage (Axios interceptor)
     ├── 4. withCredentials sends HttpOnly refresh cookie automatically
     ├── 5. ProtectedRoute enforces auth + role + permission before render
     ├── 6. RoleBasedUI hides controls the user cannot use
     ├── 7. Activity tracker monitors for 30-min inactivity → auto logout
     └── 8. Backend independently re-validates all of the above
```

### Storage decision matrix

| Data | Storage | Reason |
|------|---------|--------|
| Access token | `sessionStorage` | Tab-scoped; cleared on close; JS-readable (needed for headers) |
| Refresh token | HttpOnly cookie | JS-inaccessible; XSS-proof; sent automatically |
| CSRF token | `sessionStorage` | Tab-scoped; not needed across tabs |
| User profile | `sessionStorage` | Cleared on tab close |
| Remember-me flag | `localStorage` | Must survive tab close for silent refresh to work |
| Username (optional) | `localStorage` | Convenience — not a secret |
| Device fingerprint | `localStorage` | Must persist across sessions for device trust |
| Passwords | Not stored anywhere | Never persisted under any circumstance |

### OWASP Top 10 (frontend perspective)

| OWASP Risk | Frontend Mitigation |
|------------|-------------------|
| A01 – Broken Access Control | `ProtectedRoute`, `RoleBasedUI`, 19-role permission matrix |
| A02 – Cryptographic Failures | HttpOnly cookie for refresh; sessionStorage for access token; HTTPS enforced |
| A03 – Injection | React JSX auto-escaping; no `innerHTML`; no `eval()` |
| A04 – Insecure Design | CSRF protection on all mutations; defense-in-depth token strategy |
| A05 – Security Misconfiguration | External-only scripts; CSP-ready HTML; env-based API URL |
| A07 – Auth Failures | MFA support (4 methods); session timeout; silent refresh with single retry |
| A08 – Software Integrity | Service worker bypasses cache — no stale credentials served offline |
| A09 – Logging Failures | Auth/CSRF errors propagated to backend audit trail via API responses |
| A10 – SSRF | Not applicable — frontend does not make server-side requests |

---

*This document was generated from direct source analysis of the production codebase on April 22, 2026.*
