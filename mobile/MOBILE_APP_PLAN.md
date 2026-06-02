# Fuel Order — Mobile App Implementation Plan (v1)

**Status:** Planning · **Date:** 2026-06-02
**Scope (v1):** Single Expo app for **Drivers, Managers/Super Manager, Yard attendants, Fuel attendants** — **read-only** first.
**Backend:** Reuse the existing live API at `https://fuelordersytem-production.up.railway.app/api/v1` — **no backend rewrite required.**

---

## 1. Feasibility summary

A single role-aware Expo Go app against the existing backend is fully feasible. The backend is already mobile-ready:

| Capability | Evidence | Mobile impact |
|---|---|---|
| JWT returned in **response body** (not cookie-only) | `backend/src/server.ts:216` | Mobile can store & send `Authorization: Bearer` |
| Roles fully defined | `backend/src/models/User.ts:48-70` | All 4 target roles exist |
| Driver login = truck# + PIN, virtual user IDs | `authController.ts:158-268`, `auth.ts:163` | Need a dual-mode login screen |
| Expo push already scaffolded | `expo-server-sdk` dep + `POST/DELETE /notifications/mobile-subscribe` | Push works later with a dev build |
| CORS env-configurable | `config/index.ts:20` | Add app origin if needed |
| Per-role "home view" logic exists in web | `EnhancedDashboard.tsx:191-192` | Mirror it for routing |

**Current mobile/ state:** default Expo scaffold only (Expo SDK 55, RN 0.83, React 19). Clean slate.

---

## 2. Architecture

```
mobile/
├── app/                         # expo-router (file-based routes)
│   ├── _layout.tsx              # Root: AuthProvider + theme + navigation guard
│   ├── index.tsx                # Splash/redirect (decides login vs. role-home)
│   ├── login.tsx                # Dual-mode login (staff vs. driver)
│   └── (app)/                   # Authenticated group (guarded)
│       ├── _layout.tsx          # Reads role → mounts correct stack/tabs
│       ├── driver/              # Driver home + detail screens
│       ├── manager/             # Manager / super_manager LPO screens
│       ├── yard/                # Yard fuel screens
│       └── station/             # Fuel attendant / station screens
├── src/
│   ├── api/
│   │   ├── client.ts            # axios instance + Bearer interceptor + 401 refresh
│   │   └── endpoints.ts         # typed wrappers per resource (read-only subset)
│   ├── auth/
│   │   ├── AuthContext.tsx      # user, token, login(staff|driver), logout, refresh
│   │   └── secureStore.ts       # expo-secure-store get/set/clear token helpers
│   ├── types/                   # shared TS types (port subset from frontend/src/types)
│   ├── components/              # shared UI (Card, DataRow, StatusBadge, EmptyState…)
│   └── theme/                   # colors/spacing mirroring web brand
└── MOBILE_APP_PLAN.md           # this file
```

### Tech choices
- **expo-router** — file-based navigation, clean role gating via route groups.
- **expo-secure-store** — encrypted token storage (no cookies on mobile).
- **axios** — same client style as web (`frontend/src/services/api.ts`), Bearer header instead of CSRF cookie.
- **@tanstack/react-query** (recommended) — caching, pull-to-refresh, loading/error states for read-only data with minimal code.
- **React Context** for auth (mirrors web `AuthContext`).

---

## 3. Authentication design

### Two login modes (one screen, a toggle)
1. **Staff** (manager, super_manager, yard_personnel, dar/tanga/mmsa_yard, fuel_attendant, station_manager): email/username + password → `POST /auth/login`.
2. **Driver**: truck number + PIN → `POST /auth/login` (backend detects driver login). Returns a virtual user (`role: "driver"`, id like `driver_T991_EFN`).

### Flow
```
login → store {accessToken, refreshToken} in SecureStore
      → GET /auth/me  → get role
      → route to (app)/<role-home>
```

### Token handling
- Attach `Authorization: Bearer <accessToken>` on every request via interceptor.
- On `401`: call `POST /auth/refresh` with refresh token once; on failure → clear store → back to login.
- **MFA / forced password change:** out of scope for v1 mobile. If a target user hits `mustChangePassword` or MFA, show a message: "Please finish setup on the web portal, then log in here." (Keeps v1 simple; can add later.)

### CSRF note
Web uses CSRF cookies; mobile uses pure Bearer tokens. Action item: **verify `/auth/login` + read endpoints don't hard-require the CSRF token for Bearer clients.** If they do, we add a small server allowance for token-auth requests (minor, isolated change).

---

## 4. Per-role screens & endpoints (read-only v1)

All endpoints are **GET** unless noted. Paths relative to `/api/v1`. These mirror what each web view already consumes.

### 4.1 Driver  (mirrors `DriverPortal.tsx`)
- **Home:** driver's own delivery orders / journey + fuel summary.
- Endpoints:
  - `GET /auth/me`
  - `GET /delivery-orders` (filtered to driver's truck by backend) / `GET /delivery-orders/journey/:doNumber`
  - `GET /fuel-records/do/:doNumber`, `GET /fuel-records/:id/details`
  - `GET /driver-accounts/summary` (driver's account view)
  - `GET /notifications`, `GET /notifications/count`

### 4.2 Manager / Super Manager  (mirrors `ManagerView.tsx`)
- **Home:** LPO list for assigned station; `super_manager` sees all stations.
- Endpoints:
  - `GET /lpo-documents/entries` (+ `/entries/filters`)
  - `GET /lpo-documents`, `GET /lpo-documents/lpo/:lpoNo`
  - `GET /lpo-documents/workbooks`, `/workbooks/:year`
  - `GET /dashboard/stats` (scoped by role)
  - `GET /notifications`, `/notifications/count`

### 4.3 Yard attendant  (mirrors `YardFuel.tsx` / `YardFuelSimple.tsx`)
- **Home:** yard fuel dispenses + pending list for their yard.
- Endpoints:
  - `GET /yard-fuel`, `GET /yard-fuel/:id`
  - `GET /yard-fuel/pending`
  - `GET /yard-fuel/history/rejections`
  - `GET /config/yard-fuel-time-limit`
  - `GET /notifications`, `/notifications/count`

### 4.4 Fuel attendant / Station  (mirrors `StationView.tsx`)
- **Home:** station fuel records / LPO view for their station.
- Endpoints:
  - `GET /fuel-records`, `GET /fuel-records/:id/details`, `/fuel-records/available-periods`
  - `GET /lpo-documents/entries` (scoped to station)
  - `GET /dashboard/stats`
  - `GET /notifications`, `/notifications/count`

> Backend already scopes results by the authenticated user's role/station/yard, so the app mostly *renders* what each endpoint returns rather than re-implementing access rules.

---

## 5. Shared UI building blocks
- `AppHeader` (title + role badge + logout)
- `Card`, `DataRow`, `StatusBadge` (reuse web's journey/LPO status semantics)
- `LoadingState`, `EmptyState`, `ErrorState`
- Pull-to-refresh on every list (react-query `refetch`)
- Light theme first (web defaults to light); dark mode optional later.

---

## 6. Build milestones

| # | Milestone | Deliverable | Verifiable by |
|---|---|---|---|
| **M0** | Foundation | expo-router, axios client, AuthContext, SecureStore, env config | App boots in Expo Go |
| **M1** | Auth | Dual-mode login, `/auth/me`, token refresh, logout, role redirect | Real driver + real staff log in against live API |
| **M2** | Driver read-only | Driver home + DO/fuel detail screens | Driver sees own DOs/fuel |
| **M3** | Manager read-only | LPO list/detail (+ super_manager all-stations) | Manager sees LPOs |
| **M4** | Yard read-only | Yard fuel + pending screens | Yard user sees dispenses |
| **M5** | Station read-only | Station fuel/LPO screens | Attendant sees records |
| **M6** | Polish | Pull-to-refresh, errors, empty states, role badge, app icon/splash | Manual pass per role |
| **M7** (later) | Push + dev build | `expo-notifications` → `/notifications/mobile-subscribe`, EAS dev build | Test notification arrives |
| **M8** (later) | Write actions | Per-role create/update flows | Phase 2 — separate plan |

---

## 7. Backend touch-ups (small, isolated — not rewrites)
1. **CORS:** add the app's dev origin / confirm mobile requests pass (`CORS_ORIGIN` env).
2. **CSRF:** confirm Bearer-token requests on `/auth/login` + GET endpoints aren't blocked by CSRF middleware; add a token-auth bypass if needed.
3. **(M7) Push:** nothing to build — endpoints already exist; just call them from the app.

---

## 8. Dependencies to add to `mobile/package.json`
```
expo-router, expo-secure-store, expo-notifications (M7),
axios, @tanstack/react-query,
react-native-safe-area-context, react-native-screens
```
(Most install via `npx expo install` to match SDK 55.)

---

## 9. Testing strategy
- **Dev:** Expo Go on a physical phone pointed at the **live Railway API** (real data, real roles).
- **Accounts:** use existing one-per-role test logins (1 driver truck#+PIN, 1 manager, 1 super_manager, 1 yard, 1 fuel attendant).
- **Per milestone:** manual login + read smoke test for that role.
- Push (M7) requires an EAS **development build** (free) — Expo Go can't receive remote push reliably.

---

## 10. Open questions for you
1. Do you have a **test login per role** I can use against the live API (esp. a driver truck#+PIN)?
2. Should the app point at the **live Railway backend** during development, or a separate staging/local backend?
3. App identity: name shown on the phone ("Fuel Order"?), icon/splash — use existing `trailer.png` / horse icon, or new art?
4. Confirm MFA/forced-password-change users can be deferred to the web portal for v1.
