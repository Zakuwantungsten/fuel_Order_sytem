# Fuel Order Management System — Backend Documentation

**Version:** 1.0.0  
**Last Updated:** February 21, 2026  
**Runtime:** Node.js + Express + TypeScript + MongoDB (Mongoose)

---

## Table of Contents

1. [Overview](#1-overview)
2. [Technology Stack](#2-technology-stack)
3. [Project Structure](#3-project-structure)
4. [Architecture](#4-architecture)
5. [Getting Started](#5-getting-started)
6. [Environment Variables](#6-environment-variables)
7. [Server Entry Point](#7-server-entry-point)
8. [Database](#8-database)
9. [Authentication & Security](#9-authentication--security)
10. [Middleware](#10-middleware)
11. [Routes & API Reference](#11-routes--api-reference)
12. [Controllers](#12-controllers)
13. [Data Models (Mongoose Schemas)](#13-data-models-mongoose-schemas)
14. [Services](#14-services)
15. [Utilities](#15-utilities)
16. [Jobs & Schedulers](#16-jobs--schedulers)
17. [Seed Scripts](#17-seed-scripts)
18. [Migration Scripts](#18-migration-scripts)
19. [Logging](#19-logging)
20. [Testing](#20-testing)
21. [Build & Deployment](#21-build--deployment)

---

## 1. Overview

The backend is a RESTful API server built with **Express.js** and **TypeScript**, backed by **MongoDB** via Mongoose. It serves the Fuel Order Management System frontend and handles all business logic for:

- JWT-based authentication with refresh tokens and CSRF protection
- Delivery Order (DO) and Local Purchase Order (LPO) lifecycle management
- Fuel record tracking across a multi-checkpoint journey route (Tanzania → Zambia / DRC)
- Yard fuel dispensing with auto-linking to active fuel records
- Driver authentication via PIN (separate from regular users)
- Role-based authorization across 19 user roles
- Real-time notifications via Socket.IO WebSocket
- Automated monthly data archival (runs on the 1st at 2:00 AM)
- Cloud backup to Cloudflare R2 (S3-compatible)
- Email delivery for password resets and system alerts
- Full audit logging of all CRUD, auth, and configuration events
- Analytics, fleet tracking, and database monitoring

---

## 2. Technology Stack

| Category | Library / Tool | Version |
|---|---|---|
| Runtime | Node.js | ≥ 18 |
| Language | TypeScript | 5.3.3 |
| Framework | Express.js | 4.18.2 |
| Database | MongoDB via Mongoose | 8.0.3 |
| Authentication | jsonwebtoken | 9.0.2 |
| Password Hashing | bcryptjs | 2.4.3 |
| CSRF Protection | Custom (double-submit cookie) | — |
| Real-time | Socket.IO | 4.8.3 |
| Email | Nodemailer | 7.0.11 |
| Cloud Storage | AWS SDK v3 (Cloudflare R2) | 3.943.0 |
| Excel Export | ExcelJS | 4.4.0 |
| PDF Generation | pdfkit | 0.17.2 |
| Compression | archiver | 7.0.1 |
| Job Scheduling | node-cron | 3.0.3 |
| Logging | Winston | 3.11.0 |
| Rate Limiting | express-rate-limit | 7.1.5 |
| Validation | express-validator | 7.0.1 |
| Security Headers | helmet | 7.1.0 |
| HTTP Logging | morgan | 1.10.0 |
| Testing | Jest + Supertest | 29.7.0 |
| Test DB | mongodb-memory-server | 10.0.0 |

---

## 3. Project Structure

```
backend/
├── package.json
├── tsconfig.json
├── jest.config.js
├── nodemon.json
├── logs/                       # Runtime log files (auto-created)
│   ├── app.log
│   ├── error.log
│   ├── exceptions.log
│   └── rejections.log
└── src/
    ├── server.ts               # Application entry point
    ├── config/
    │   ├── index.ts            # Config object + env validation
    │   └── database.ts         # MongoDB connection
    ├── types/
    │   └── index.ts            # All TypeScript interfaces
    ├── middleware/
    │   ├── auth.ts             # JWT authentication + authorization
    │   ├── csrf.ts             # CSRF protection (double-submit cookie)
    │   ├── errorHandler.ts     # Global error handler + ApiError class
    │   ├── validation.ts       # express-validator rule sets
    │   ├── rateLimiters.ts     # Per-route rate limiters
    │   └── index.ts            # Barrel export
    ├── models/
    │   ├── User.ts
    │   ├── DeliveryOrder.ts
    │   ├── LPOEntry.ts
    │   ├── LPOSummary.ts
    │   ├── LPOWorkbook.ts
    │   ├── FuelRecord.ts
    │   ├── YardFuelDispense.ts
    │   ├── DriverAccountEntry.ts
    │   ├── DriverCredential.ts
    │   ├── AuditLog.ts
    │   ├── Notification.ts
    │   ├── SystemConfig.ts
    │   ├── FuelStationConfig.ts
    │   ├── RouteConfig.ts
    │   ├── Backup.ts
    │   ├── BackupSchedule.ts
    │   ├── ArchivedData.ts
    │   ├── Checkpoint.ts
    │   ├── TruckPosition.ts
    │   ├── FleetSnapshot.ts
    │   └── index.ts            # Barrel export
    ├── routes/
    │   ├── index.ts            # Root router — mounts all sub-routers
    │   ├── authRoutes.ts
    │   ├── deliveryOrderRoutes.ts
    │   ├── lpoEntryRoutes.ts
    │   ├── lpoSummaryRoutes.ts
    │   ├── fuelRecordRoutes.ts
    │   ├── yardFuelRoutes.ts
    │   ├── dashboardRoutes.ts
    │   ├── userRoutes.ts
    │   ├── adminRoutes.ts
    │   ├── driverAccountRoutes.ts
    │   ├── driverCredentialRoutes.ts
    │   ├── notificationRoutes.ts
    │   ├── trashRoutes.ts
    │   ├── backupRoutes.ts
    │   ├── analyticsRoutes.ts
    │   ├── configRoutes.ts
    │   ├── publicConfigRoutes.ts
    │   ├── systemConfigRoutes.ts
    │   ├── archivalRoutes.ts
    │   ├── checkpointRoutes.ts
    │   └── fleetTrackingRoutes.ts
    ├── controllers/
    │   ├── authController.ts
    │   ├── userController.ts
    │   ├── deliveryOrderController.ts
    │   ├── lpoEntryController.ts
    │   ├── lpoSummaryController.ts
    │   ├── fuelRecordController.ts
    │   ├── yardFuelController.ts
    │   ├── dashboardController.ts
    │   ├── analyticsController.ts
    │   ├── driverAccountController.ts
    │   ├── driverCredentialController.ts  (implied by routes)
    │   ├── notificationController.ts
    │   ├── systemAdminController.ts
    │   ├── adminController.ts
    │   ├── lpoEntryController.ts
    │   ├── trashController.ts
    │   └── index.ts
    ├── services/
    │   ├── websocket.ts            # Socket.IO server + notification emitters
    │   ├── emailService.ts         # Nodemailer email service
    │   ├── backupService.ts        # Database backup to Cloudflare R2
    │   ├── archivalService.ts      # Monthly data archival logic
    │   ├── r2Service.ts            # Cloudflare R2 (S3) client wrapper
    │   ├── unifiedExportService.ts # Excel/PDF export generation
    │   └── fleetReportParser.ts    # Fleet position data parser
    ├── utils/
    │   ├── jwt.ts                  # Token generation and verification
    │   ├── logger.ts               # Winston logger instance
    │   ├── auditService.ts         # Centralized audit logging service
    │   ├── auditLogger.ts          # Lower-level audit log writer
    │   ├── databaseMonitor.ts      # DB metrics collection
    │   ├── pagination.ts           # Pagination helpers
    │   ├── sanitize.ts             # Input sanitization
    │   ├── validate.ts             # Validation helper wrappers
    │   ├── formatters.ts           # Data formatters
    │   ├── doNumberFormatter.ts    # DO number formatting
    │   ├── truckNumber.ts          # Truck number normalization
    │   ├── pdfGenerator.ts         # PDFKit document generation
    │   ├── monthlySheetGenerator.ts # Monthly sheet Excel generation
    │   └── index.ts                # Barrel export
    ├── jobs/
    │   └── archivalScheduler.ts    # node-cron monthly archival job
    └── scripts/
        ├── seedSuperAdmin.ts
        ├── seedAdmins.ts
        ├── seedAllRoles.ts
        ├── seedUsers.ts
        ├── seedManagerUsers.ts
        ├── seedRoutesAndStations.ts
        ├── seedCheckpoints.ts
        ├── setupDriverCredentials.ts
        ├── clearDatabase.ts
        ├── migrateFuelCalculationLogic.ts
        ├── migrateJourneyStatus.ts
        ├── migrateActualDateForLPOs.ts
        ├── migrateTruckBatchesToDynamic.ts
        ├── relink-pending-yard-fuel.ts
        ├── verifyBalanceCalculation.ts
        ├── verifyCheckpoints.ts
        ├── updateCheckpointCoordinates.ts
        └── testArchival.js
```

---

## 4. Architecture

### 4.1 Request Lifecycle

```
Client Request
  → Rate Limiter (express-rate-limit)
  → Security Headers (helmet)
  → CORS (cors)
  → Cookie Parser (cookie-parser)
  → Body Parser (express.json)
  → HTTP Logger (morgan)
  → CSRF Middleware (provideCsrfToken / csrfProtection)
  → Router (/api/...)
       → Route-level validation (express-validator)
       → Authentication middleware (authenticate)
       → Authorization middleware (authorize)
       → Controller Handler
            → Service / Model operations
            → AuditService.log(...)
            → WebSocket notification (if applicable)
            → JSON Response
  → Error Handler (if exception thrown)
```

### 4.2 Key Design Patterns

- **Async/await** throughout. Controllers use `asyncHandler` wrapper to catch errors.
- **Soft deletes** — most models have `isDeleted: Boolean` and `deletedAt: Date`. Hard deletes only via trash management.
- **Standardized response envelope** — all responses use `{ success: boolean, message: string, data?: any }`.
- **Audit on every mutation** — `AuditService.log*()` is called after every create/update/delete.
- **Role-specific data filtering** — controllers filter results based on `req.user.role` (e.g., yard personnel only see their own yard's data).

---

## 5. Getting Started

### Prerequisites

- Node.js ≥ 18
- MongoDB instance (local or Atlas)
- Cloudflare R2 bucket (optional, for backups)
- SMTP email service (optional, for password reset emails)

### Installation

```bash
cd backend
npm install
```

### Development Server

```bash
npm run dev
```

Uses `nodemon` + `ts-node` for hot reload. Listens on port **5000** by default.

### Production Build

```bash
npm run build   # Compile TypeScript to dist/
npm start       # Run compiled dist/server.js
```

### Seed Initial Super Admin

```bash
npm run seed:super
```

### Seed All Sample Roles

```bash
npm run seed:all
```

### Setup Driver Credentials

```bash
npm run setup-driver-credentials
```

---

## 6. Environment Variables

Create a `.env` file in the `backend/` directory. The following variables are required or optional:

### Required

| Variable | Description |
|---|---|
| `MONGODB_URI` | Full MongoDB connection string |
| `JWT_SECRET` | Secret key for signing access tokens |
| `JWT_REFRESH_SECRET` | Secret key for signing refresh tokens |

### Optional / Defaults

| Variable | Default | Description |
|---|---|---|
| `NODE_ENV` | `development` | `development` or `production` |
| `PORT` | `5000` | HTTP server port |
| `JWT_EXPIRE` | `30m` | Access token TTL |
| `JWT_REFRESH_EXPIRE` | `7d` | Refresh token TTL |
| `CORS_ORIGIN` | `http://localhost:5173,http://localhost:3000` | Comma-separated allowed origins |
| `RATE_LIMIT_WINDOW_MS` | `900000` (15 min) | Rate limit window in milliseconds |
| `RATE_LIMIT_MAX_REQUESTS` | `100` | Max requests per window |
| `LOG_LEVEL` | `info` | Winston log level |
| `LOG_FILE` | `logs/app.log` | Log file path |
| `TZ` | `Africa/Nairobi` | Server timezone |
| `FRONTEND_URL` | `http://localhost:5173` | Frontend URL for password reset links |

### Cloudflare R2 (Backups)

| Variable | Description |
|---|---|
| `R2_ENDPOINT` | R2 endpoint URL |
| `R2_ACCESS_KEY_ID` | R2 access key |
| `R2_SECRET_ACCESS_KEY` | R2 secret key |
| `R2_BUCKET_NAME` | Bucket name (default: `fuel-order-backups`) |

### Email (SMTP)

| Variable | Description |
|---|---|
| `EMAIL_HOST` / `SMTP_HOST` | SMTP server hostname |
| `EMAIL_PORT` / `SMTP_PORT` | SMTP port (default: `587`) |
| `EMAIL_SECURE` / `SMTP_SECURE` | `true` for SSL/TLS |
| `EMAIL_USER` / `SMTP_USER` | SMTP username |
| `EMAIL_PASSWORD` / `SMTP_PASS` | SMTP password |
| `EMAIL_FROM` | Sender email address |
| `EMAIL_FROM_NAME` | Sender name (default: `Fuel Order System`) |

---

## 7. Server Entry Point

**File:** `src/server.ts`

Startup sequence:

1. `validateEnv()` — asserts required env vars are present; exits if missing.
2. Create Express `app` and HTTP `httpServer`.
3. Apply global middleware in order: `helmet`, `cors`, `cookieParser`, `express.json`, `express.urlencoded`, `compression`, `rateLimit`, `morgan`.
4. Register `GET /api/csrf-token` — provides a fresh CSRF token to clients.
5. Apply CSRF middleware to all `/api/` routes (skips GET/HEAD/OPTIONS and login/register/refresh).
6. Mount `routes` at `/api`.
7. Register `GET /` (welcome) and `GET /health` (health check) utility routes.
8. Register `notFound` (404) and `errorHandler` (500) middleware last.
9. `connectDatabase()` — establishes MongoDB connection.
10. `initializeWebSocket(httpServer)` — starts Socket.IO server.
11. `startArchivalScheduler()` — registers the monthly cron job.
12. `httpServer.listen(PORT)`.

### Health Check

```
GET /health
```

Returns:
```json
{
  "success": true,
  "message": "Server is healthy",
  "uptime": 1234.5,
  "timestamp": "2026-02-21T00:00:00.000Z"
}
```

---

## 8. Database

**File:** `src/config/database.ts`

Connects to MongoDB using the Mongoose connection pool:

| Setting | Value |
|---|---|
| `maxPoolSize` | 10 |
| `minPoolSize` | 5 |
| `socketTimeoutMS` | 45000 |
| `serverSelectionTimeoutMS` | 5000 |

Listens to `error`, `disconnected`, and `reconnected` events and logs them via Winston.

Graceful shutdown: registers `process.on('SIGINT')` to close the connection cleanly before exit.

---

## 9. Authentication & Security

### 9.1 JWT Tokens

**File:** `src/utils/jwt.ts`

| Token | Secret | Default TTL |
|---|---|---|
| Access Token | `JWT_SECRET` | 30 minutes |
| Refresh Token | `JWT_REFRESH_SECRET` | 7 days |

Token payload (`JWTPayload`):

```ts
{
  userId: string;
  username: string;
  role: UserRole;
}
```

Functions:
- `generateAccessToken(payload)` → `string`
- `generateRefreshToken(payload)` → `string`
- `generateTokens(payload)` → `{ accessToken, refreshToken }`
- `verifyRefreshToken(token)` → `JWTPayload`

### 9.2 Authentication Middleware

**File:** `src/middleware/auth.ts`

#### `authenticate`

Reads `Authorization: Bearer <token>` from the request header. Verifies the JWT against `JWT_SECRET`. Supports two user types:

1. **Regular users** — verified against the `User` collection (`isActive`, `isDeleted` checks).
2. **Virtual driver users** — userId starts with `driver_` prefix; validated by role only (not stored in `User` collection).

Attaches `req.user = { userId, username, role }` for downstream use.

Returns:
- `401` if no token, invalid token, or expired token.
- `401` if the user no longer exists or is inactive.

#### `authorize(...roles)`

Factory middleware. Returns a handler that checks `req.user.role` against the allowed roles array. Returns `403` if the role is not in the list.

#### `optionalAuth`

Same as `authenticate` but silently continues if no token is present — used for routes that work for both authenticated and anonymous users.

### 9.3 Driver Authentication

Drivers log in using their **truck number as username** and a **PIN as password** (not a standard password). The `login` controller detects the truck number format (`/^T\d{3,4}[-\s]?[A-Z]{3}$/i`) and routes to PIN-based authentication via the `DriverCredential` model.

A virtual user object is constructed and a standard JWT pair is returned. The driver's `userId` uses the format `driver_<truckNo>` (with spaces replaced by underscores) to prevent MongoDB ObjectId casting.

### 9.4 CSRF Protection

**File:** `src/middleware/csrf.ts`

Implements the **Double Submit Cookie Pattern**:

1. **`provideCsrfToken`** — generates a 32-byte random hex token on `GET /api/csrf-token`. Sets it as a readable (non-httpOnly) cookie named `XSRF-TOKEN` with a 1-hour expiry.
2. **`csrfProtection`** — on `POST/PUT/DELETE/PATCH`, reads the cookie and compares it to the `X-XSRF-TOKEN` request header using `crypto.timingSafeEqual()`. Returns `403` on mismatch.

Login, register, and token-refresh endpoints are **exempt** from CSRF validation (they use credentials as the proof of identity).

In production: cookie is set with `secure: true, sameSite: 'strict'`. In development: no `sameSite` or `secure` flag for cross-port localhost compatibility.

### 9.5 Password Security

- Passwords are hashed with **bcrypt** (salt rounds: 10) via a Mongoose `pre('save')` hook.
- Password reset uses a `crypto.randomBytes(32)` token, SHA-256 hashed before storage. Expires in **30 minutes**.
- The raw token is sent only in the reset email URL. Only the hash is stored in the database (prevents plaintext token exposure even if DB is compromised).
- Reset clears the refresh token for additional security.

### 9.6 Security Headers (Helmet)

`helmet()` is applied globally, setting:
- `Content-Security-Policy`
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `Strict-Transport-Security` (in production)
- And other standard security headers.

### 9.7 Rate Limiting

Global rate limiter: **100 requests per 15 minutes** per IP across all `/api/*` routes.

Additional per-route limiters are defined in `src/middleware/rateLimiters.ts` for sensitive endpoints (login, password reset).

---

## 10. Middleware

### `errorHandler.ts`

#### `ApiError`

Custom error class:

```ts
new ApiError(statusCode: number, message: string, isOperational?: boolean)
```

Throw an `ApiError` anywhere in a controller to return a structured error response.

#### `notFound`

Catches all unmatched routes and passes a `404 ApiError` to the error handler.

#### `errorHandler(err, req, res, next)`

Global Express error handler. Handles:

| Error Type | Status Code | Response |
|---|---|---|
| `ApiError` | As specified | Error message |
| Mongoose `ValidationError` | 400 | Joined validation messages |
| Mongoose duplicate key (11000) | 400 | `<field> already exists` |
| Mongoose `CastError` | 400 | `Invalid ID format` |
| `JsonWebTokenError` | 401 | `Invalid token` |
| `TokenExpiredError` | 401 | `Token expired` |
| Other | 500 | `Internal server error` |

In `development` mode, the error stack trace is included in the response.

#### `asyncHandler(fn)`

Higher-order function that wraps an async route handler and forwards any rejected promise to `next(error)`:

```ts
router.get('/example', asyncHandler(async (req, res) => {
  // no try/catch needed
}));
```

### `validation.ts`

Provides `express-validator` rule sets for all major resources:

| Export | Covers |
|---|---|
| `userValidation.register` | Username, email, password, name, role |
| `userValidation.adminCreate` | Same as register but no password field |
| `userValidation.login` | Username and password presence |
| `userValidation.update` | Optional email, name |
| `userValidation.forgotPassword` | Valid email |
| `userValidation.resetPassword` | Email, 64-char token, min-6-char password |
| `deliveryOrderValidation.create` | All required DO fields |
| `deliveryOrderValidation.update` | Optional DO fields |
| `lpoEntryValidation.create` | All required LPO entry fields |
| `lpoEntryValidation.update` | Optional LPO entry fields |
| `lpoSummaryValidation.create` | LPO summary + entries array |
| `fuelRecordValidation.create` | All required fuel record fields |
| `yardFuelValidation.create` | Date, truck, liters, yard |
| `commonValidation.mongoId` | Validates `:id` param as ObjectId |
| `commonValidation.pagination` | `?page` and `?limit` query params |

---

## 11. Routes & API Reference

**Base URL:** `http://localhost:5000/api`

All routes (except auth) require `Authorization: Bearer <token>`.

### 11.1 Auth — `/api/auth`

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/auth/register` | No | Register new user |
| POST | `/auth/login` | No | Login (user or driver) |
| POST | `/auth/refresh` | No | Refresh access token |
| POST | `/auth/logout` | Yes | Logout, clear refresh token |
| GET | `/auth/profile` | Yes | Get current user profile |
| PUT | `/auth/profile` | Yes | Update profile (name, email, department, station) |
| PUT | `/auth/change-password` | Yes | Change own password |
| POST | `/auth/forgot-password` | No | Request password reset email |
| POST | `/auth/reset-password` | No | Reset password with token |

### 11.2 Delivery Orders — `/api/delivery-orders`

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/delivery-orders` | Yes | List all DOs (with filters, pagination) |
| POST | `/delivery-orders` | Yes | Create a new DO |
| GET | `/delivery-orders/:id` | Yes | Get a single DO |
| PUT | `/delivery-orders/:id` | Yes | Update a DO (records edit history) |
| DELETE | `/delivery-orders/:id` | Yes | Soft-delete a DO |
| POST | `/delivery-orders/:id/cancel` | Yes | Cancel a DO with reason |
| POST | `/delivery-orders/bulk` | Yes | Bulk create multiple DOs |
| GET | `/delivery-orders/export` | Yes | Export DOs as Excel |
| GET | `/delivery-orders/workbooks` | Yes | List DO workbooks (by year) |
| GET | `/delivery-orders/workbooks/:year` | Yes | Get all DOs for a year |

### 11.3 LPO Entries — `/api/lpo-entries`

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/lpo-entries` | Yes | List LPO entries (with filters) |
| POST | `/lpo-entries` | Yes | Create an LPO entry |
| GET | `/lpo-entries/:id` | Yes | Get a single LPO entry |
| PUT | `/lpo-entries/:id` | Yes | Update an LPO entry |
| DELETE | `/lpo-entries/:id` | Yes | Soft-delete an LPO entry |
| GET | `/lpo-entries/export` | Yes | Export as Excel/CSV |

### 11.4 LPO Documents — `/api/lpo-documents`

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/lpo-documents` | Yes | List LPO summaries (with filters, pagination) |
| POST | `/lpo-documents` | Yes | Create an LPO summary document |
| GET | `/lpo-documents/:id` | Yes | Get a single LPO document |
| PUT | `/lpo-documents/:id` | Yes | Update an LPO document |
| DELETE | `/lpo-documents/:id` | Yes | Soft-delete an LPO document |
| POST | `/lpo-documents/:id/forward` | Yes | Forward LPO to another station |
| GET | `/lpo-documents/workbooks` | Yes | List LPO workbooks (by year) |
| GET | `/lpo-documents/workbooks/:year` | Yes | Get all LPOs for a year |
| GET | `/lpo-documents/export` | Yes | Export as Excel |

### 11.5 Fuel Records — `/api/fuel-records`

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/fuel-records` | Yes | List fuel records (with filters, pagination) |
| POST | `/fuel-records` | Yes | Create a fuel record |
| GET | `/fuel-records/:id` | Yes | Get a single fuel record |
| PUT | `/fuel-records/:id` | Yes | Update a fuel record (checkpoint fuel) |
| DELETE | `/fuel-records/:id` | Yes | Soft-delete a fuel record |
| PUT | `/fuel-records/:id/journey-status` | Yes | Update journey status |
| GET | `/fuel-records/pending-config` | Yes | Get records with missing config |
| GET | `/fuel-records/export` | Yes | Export as Excel |

### 11.6 Yard Fuel — `/api/yard-fuel`

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/yard-fuel` | Yes | List yard fuel dispenses |
| POST | `/yard-fuel` | Yes | Record yard fuel dispense (auto-links to fuel record) |
| GET | `/yard-fuel/:id` | Yes | Get a single yard fuel record |
| PUT | `/yard-fuel/:id` | Yes | Update yard fuel record |
| DELETE | `/yard-fuel/:id` | Yes | Soft-delete yard fuel record |
| POST | `/yard-fuel/:id/reject` | Yes | Reject a pending yard fuel entry |
| POST | `/yard-fuel/:id/link` | Yes | Manually link to a fuel record |
| GET | `/yard-fuel/pending` | Yes | Get all pending (unlinked) entries |

### 11.7 Dashboard — `/api/dashboard`

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/dashboard/stats` | Yes | Aggregated operational stats |
| GET | `/dashboard/analytics` | Yes | Charts data (revenue, fuel, trucks) |
| GET | `/dashboard/recent-activity` | Yes | Recent audit log activity |

### 11.8 Users — `/api/users`

| Method | Path | Auth | Roles |
|---|---|---|---|
| GET | `/users` | Yes | admin+ |
| POST | `/users` | Yes | admin+ |
| GET | `/users/:id` | Yes | admin+ or self |
| PUT | `/users/:id` | Yes | admin+ |
| DELETE | `/users/:id` | Yes | admin+ |
| PUT | `/users/:id/ban` | Yes | admin+ |
| PUT | `/users/:id/unban` | Yes | admin+ |
| POST | `/users/:id/reset-password` | Yes | admin+ |

### 11.9 Driver Accounts — `/api/driver-accounts`

| Method | Path | Description |
|---|---|---|
| GET | `/driver-accounts` | List driver account entries |
| POST | `/driver-accounts` | Create a driver account entry |
| GET | `/driver-accounts/:id` | Get a single entry |
| PUT | `/driver-accounts/:id` | Update an entry |
| DELETE | `/driver-accounts/:id` | Soft-delete an entry |
| GET | `/driver-accounts/workbook/:year` | Workbook for a year |

### 11.10 Driver Credentials — `/api/driver-credentials`

| Method | Path | Description |
|---|---|---|
| GET | `/driver-credentials` | List all driver credentials |
| POST | `/driver-credentials` | Create driver PIN credential |
| PUT | `/driver-credentials/:id` | Update (reset PIN) |
| DELETE | `/driver-credentials/:id` | Deactivate credential |

### 11.11 Notifications — `/api/notifications`

| Method | Path | Description |
|---|---|---|
| GET | `/notifications` | Get notifications for current user |
| PUT | `/notifications/:id/read` | Mark notification as read |
| PUT | `/notifications/read-all` | Mark all as read |
| DELETE | `/notifications/:id` | Dismiss a notification |

### 11.12 Trash — `/api/trash`

| Method | Path | Description |
|---|---|---|
| GET | `/trash` | List soft-deleted items |
| POST | `/trash/:type/:id/restore` | Restore an item |
| DELETE | `/trash/:type/:id` | Permanently delete an item |
| DELETE | `/trash/empty` | Empty entire trash |

### 11.13 Backup — `/api/backup`

| Method | Path | Description |
|---|---|---|
| POST | `/backup/create` | Trigger manual backup to R2 |
| GET | `/backup/list` | List all backups |
| GET | `/backup/:id/download` | Get presigned download URL |
| DELETE | `/backup/:id` | Delete a backup |
| GET | `/backup/schedules` | List backup schedules |
| POST | `/backup/schedules` | Create a backup schedule |
| PUT | `/backup/schedules/:id` | Update a schedule |
| DELETE | `/backup/schedules/:id` | Delete a schedule |

### 11.14 Analytics — `/api/system-admin/analytics`

| Method | Path | Description |
|---|---|---|
| GET | `/analytics/revenue` | Revenue report by period |
| GET | `/analytics/fuel` | Fuel consumption report |
| GET | `/analytics/user-activity` | User action report |
| GET | `/analytics/system-performance` | DB and system metrics |
| GET | `/analytics/audit-logs` | Filterable audit log list |
| GET | `/analytics/database` | Real-time DB metrics |

### 11.15 System Configuration — `/api/system-admin/config`

Super admin only.

| Method | Path | Description |
|---|---|---|
| GET | `/config` | Get all system settings |
| PUT | `/config` | Update system settings |
| POST | `/config/maintenance/enable` | Enable maintenance mode |
| POST | `/config/maintenance/disable` | Disable maintenance mode |

### 11.16 Public Config — `/api/config`

Authenticated users only (read-only). Returns fuel station configs, route configs, and truck batch settings.

### 11.17 System Config — `/api/system-config`

| Method | Path | Description |
|---|---|---|
| GET | `/system-config` | Get config for admin-level users |
| PUT | `/system-config` | Update config |
| GET | `/system-config/fuel-stations` | List fuel station configs |
| POST | `/system-config/fuel-stations` | Create a fuel station config |
| PUT | `/system-config/fuel-stations/:id` | Update a fuel station config |
| DELETE | `/system-config/fuel-stations/:id` | Delete a fuel station config |
| GET | `/system-config/routes` | List route configs |
| POST | `/system-config/routes` | Create a route config |
| PUT | `/system-config/routes/:id` | Update a route config |
| DELETE | `/system-config/routes/:id` | Delete a route config |
| GET | `/system-config/truck-batches` | List truck batch configs |
| POST | `/system-config/truck-batches` | Add a truck batch |
| PUT | `/system-config/truck-batches/:id` | Update truck batch |
| DELETE | `/system-config/truck-batches/:id` | Remove truck batch |

### 11.18 Archival — `/api/archival`

| Method | Path | Description |
|---|---|---|
| POST | `/archival/run` | Run archival manually (dry-run or real) |
| GET | `/archival/stats` | Get archival statistics |
| GET | `/archival/archived-data` | Browse archived records |

### 11.19 Checkpoints — `/api/checkpoints`

| Method | Path | Description |
|---|---|---|
| GET | `/checkpoints` | List all route checkpoints |
| POST | `/checkpoints` | Create a checkpoint |
| PUT | `/checkpoints/:id` | Update a checkpoint |
| DELETE | `/checkpoints/:id` | Delete a checkpoint |

### 11.20 Fleet Tracking — `/api/fleet-tracking`

| Method | Path | Description |
|---|---|---|
| GET | `/fleet-tracking/positions` | Current truck positions |
| POST | `/fleet-tracking/positions` | Update truck position |
| GET | `/fleet-tracking/snapshots` | Historical fleet snapshots |

### 11.21 Admin — `/api/admin`

Internal admin operations (user banning, bulk actions, system status).

### 11.22 CSRF Token — `/api/csrf-token`

```
GET /api/csrf-token
```

Returns `{ success: true, message: "CSRF token set" }` and sets the `XSRF-TOKEN` cookie. Call this on application startup before any mutating request.

---

## 12. Controllers

All controllers follow the pattern:
- Wrapped with `asyncHandler` to propagate errors.
- Validate `req.user` is set (via `authenticate` middleware).
- Use `ApiError` for domain errors.
- Call `AuditService.log*()` after successful mutations.
- Return `{ success: true, message, data }` with appropriate HTTP status.

### `authController.ts`

| Function | Description |
|---|---|
| `register` | Creates user, generates JWT pair, stores refresh token |
| `login` | Handles both driver (PIN) and regular (password) authentication |
| `refreshToken` | Validates refresh token, issues new JWT pair |
| `logout` | Clears stored refresh token, logs audit event |
| `getProfile` | Returns current user document |
| `updateProfile` | Updates firstName, lastName, email, department, station |
| `changePassword` | Verifies current password, updates hash, sends email |
| `forgotPassword` | Generates hashed reset token, sends email (always returns success) |
| `resetPassword` | Validates token+email+expiry, resets password, clears refresh token |

### `deliveryOrderController.ts`

| Function | Description |
|---|---|
| `createDeliveryOrder` | Creates DO with auto-calculated `totalAmount` |
| `getDeliveryOrders` | Paginated list with filters (date range, type, truck, client) |
| `getDeliveryOrderById` | Single DO by ID |
| `updateDeliveryOrder` | Updates DO, records edit in `editHistory` |
| `deleteDeliveryOrder` | Soft delete |
| `cancelDeliveryOrder` | Marks `isCancelled = true`, sets `cancellationReason` |
| `bulkCreateDeliveryOrders` | Creates multiple DOs in one request |
| `exportDeliveryOrders` | Returns Excel file via `unifiedExportService` |
| `getWorkbooks` | Returns grouped DO counts per year |
| `getWorkbookByYear` | Returns all DOs for a given year |

### `lpoSummaryController.ts`

| Function | Description |
|---|---|
| `createLPOSummary` | Creates LPO with entries; auto-calculates total |
| `getLPOSummaries` | Paginated list with filters |
| `getLPOSummaryById` | Single LPO document |
| `updateLPOSummary` | Updates LPO and entries |
| `deleteLPOSummary` | Soft delete |
| `forwardLPO` | Creates a new LPO at a different station based on an existing one |
| `exportLPOs` | Excel export |
| `getWorkbooks` | LPO workbooks by year |
| `getWorkbookByYear` | All LPOs for a year |

### `fuelRecordController.ts`

| Function | Description |
|---|---|
| `createFuelRecord` | Creates record; handles pending config detection |
| `getFuelRecords` | Paginated list with filters |
| `getFuelRecordById` | Single record |
| `updateFuelRecord` | Updates checkpoint fuel values; recalculates balance |
| `deleteFuelRecord` | Soft delete |
| `updateJourneyStatus` | Transitions journey state machine (queued→active→completed) |
| `getPendingConfigurations` | Records missing `totalLts` or `extra` fuel |
| `exportFuelRecords` | Excel export |

### `yardFuelController.ts`

| Function | Description |
|---|---|
| `recordYardFuel` | Records fuel dispense; attempts auto-linking to active fuel record |
| `getYardFuelDispenses` | Paginated list filtered by yard (role-specific) |
| `rejectYardFuelEntry` | Marks entry as rejected with reason |
| `linkYardFuelManually` | Manually links pending entry to a fuel record |
| `getPendingYardFuel` | Returns unlinked entries needing resolution |

### `authController.ts` → `authRoutes.ts` (Auth)

See Section 11.1.

### `userController.ts`

| Function | Description |
|---|---|
| `createUser` | Admin creates user; auto-generates password and emails it |
| `getUsers` | List users with role filter |
| `getUserById` | Single user |
| `updateUser` | Update user fields (no password changes here) |
| `deleteUser` | Soft delete |
| `banUser` | Sets `isBanned = true`, records reason |
| `unbanUser` | Clears ban fields |
| `adminResetPassword` | Admin forces a new temporary password for a user |

### `notificationController.ts`

Handles in-app notifications (missing fuel, yard alerts, rejections). Filters by `req.user.username` for personal and role-level notifications.

### `analyticsController.ts`

Aggregates data using MongoDB `$aggregate` pipelines for revenue, fuel consumption, user activity, and system performance stats.

### `adminController.ts`

System-level operations for super admins: maintenance mode toggle, bulk data operations, user logs.

### `driverAccountController.ts`

CRUD for driver account fuel entries (cash/mobile payment when LPO station cancelled).

### `dashboardController.ts`

Queries multiple collections in parallel to produce the dashboard stats summary.

---

## 13. Data Models (Mongoose Schemas)

### `User`

**Collection:** `users`

| Field | Type | Description |
|---|---|---|
| `username` | `String` (unique) | Login identifier |
| `email` | `String` (unique) | Email address |
| `password` | `String` (hidden) | bcrypt hash; excluded from default queries |
| `firstName` / `lastName` | `String` | Display name |
| `role` | `String` (enum, 19 values) | User role |
| `department` | `String` | Optional department |
| `station` | `String` | Assigned fuel station |
| `yard` | `String` enum | `DAR YARD`, `TANGA YARD`, `MMSA YARD` |
| `truckNo` | `String` | Driver's assigned truck |
| `currentDO` | `String` | Driver's current DO |
| `isActive` | `Boolean` | Account active flag |
| `isBanned` | `Boolean` | Ban flag |
| `bannedAt, bannedBy, bannedReason` | various | Ban audit fields |
| `lastLogin` | `Date` | Last login timestamp |
| `mustChangePassword` | `Boolean` | Force password change on next login |
| `refreshToken` | `String` (hidden) | Current refresh token hash |
| `resetPasswordToken` | `String` (hidden) | SHA-256 hashed reset token |
| `resetPasswordExpires` | `Date` | Reset token expiry |
| `isDeleted` / `deletedAt` | `Boolean` / `Date` | Soft delete |

**Pre-save hook:** bcrypt hashes the password whenever it is modified.

**Instance method:** `comparePassword(candidate)` → `Promise<boolean>`

**Indexes:** `username` (unique), `email` (unique), `role`, `isDeleted`

---

### `DeliveryOrder`

**Collection:** `deliveryorders`

| Field | Type | Description |
|---|---|---|
| `sn` | `Number` | Serial number |
| `date` | `String` | Date string |
| `importOrExport` | `'IMPORT' \| 'EXPORT'` | Direction |
| `doType` | `'DO' \| 'SDO'` | Order type |
| `doNumber` | `String` (unique) | DO reference number |
| `invoiceNos` | `String` | Invoice number(s) |
| `clientName` | `String` | Client name |
| `truckNo` | `String` | Truck registration |
| `trailerNo` | `String` | Trailer registration |
| `containerNo` | `String` | Container number |
| `borderEntryDRC` | `String` | DRC border entry point |
| `loadingPoint` | `String` | Origin |
| `destination` | `String` | Destination |
| `haulier` | `String` | Transport company |
| `driverName` | `String` | Driver name |
| `tonnages` | `Number` | Cargo weight |
| `ratePerTon` | `Number` | Rate |
| `cargoType` | `'loosecargo' \| 'container'` | Cargo type |
| `rateType` | `'per_ton' \| 'fixed_total'` | Rate calculation type |
| `totalAmount` | `Number` | Auto-computed |
| `status` | `'active' \| 'cancelled'` | DO status |
| `isCancelled, cancelledAt, cancellationReason, cancelledBy` | various | Cancellation tracking |
| `editHistory` | `EditHistorySubdoc[]` | Array of edit records |
| `lastEditedAt, lastEditedBy` | various | Last edit info |
| `isDeleted / deletedAt` | various | Soft delete |

**Pre-save hook:** Computes `totalAmount` from `tonnages × ratePerTon` (or `ratePerTon` directly for `fixed_total`).

**toJSON transform:** Adds `id`, removes `_id` and `__v`. Computes `totalAmount` if not stored.

**Indexes:** `doNumber` (unique), `truckNo`, `date`, `importOrExport`, `isDeleted`, `clientName`, `destination`, `status`, `isCancelled`

---

### `LPOSummary`

**Collection:** `lposummaries`

| Field | Type | Description |
|---|---|---|
| `lpoNo` | `String` (unique) | LPO reference number |
| `date` | `String` | Issue date |
| `year` | `Number` | Auto-extracted from date |
| `station` | `String` | Fuel station name |
| `orderOf` | `String` | Ordering company |
| `entries` | `LPODetail[]` | Array of truck-level line items |
| `total` | `Number` | Auto-computed sum of `amount` fields |
| `forwardedFrom` | sub-object | Source LPO reference if forwarded |
| `createdBy, approvedBy` | `String` | Personnel tracking |
| `isDeleted / deletedAt` | various | Soft delete |

**LPODetail sub-schema fields:**

| Field | Type | Description |
|---|---|---|
| `doNo` | `String` | Associated DO number |
| `truckNo` | `String` | Truck |
| `liters` | `Number` | Fuel quantity |
| `rate` | `Number` | Price per liter |
| `amount` | `Number` | `liters × rate` |
| `dest` | `String` | Destination |
| `sortOrder` | `Number` | Display order |
| `originalLiters, amendedAt` | various | Amendment tracking |
| `isCancelled` | `Boolean` | Entry-level cancellation |
| `isDriverAccount` | `Boolean` | Driver account flag |
| `cancellationPoint` | `CancellationPoint` enum | Where cancelled |
| `goingCheckpoint, returningCheckpoint` | `CancellationPoint` | CASH payment checkpoints |
| `isCustomStation, customStationName, customGoingCheckpoint, customReturnCheckpoint` | various | Custom station handling |

**Pre-save hook:** Recalculates `total` and extracts `year` from `date`.

---

### `FuelRecord`

**Collection:** `fuelrecords`

| Field | Type | Description |
|---|---|---|
| `date` | `String` | Journey date |
| `month` | `String` | Month name (e.g., "January") |
| `truckNo` | `String` | Truck registration |
| `goingDo` | `String` | Going direction DO number |
| `returnDo` | `String` | Returning direction DO number |
| `start` | `String` | Starting location |
| `from` | `String` | Origin |
| `to` | `String` | Destination |
| `totalLts` | `Number\|null` | Total fuel allocation (null = pending) |
| `extra` | `Number\|null` | Extra fuel allocation (null = pending) |
| `journeyStatus` | `'queued'\|'active'\|'completed'\|'cancelled'` | Journey state |
| `queueOrder` | `Number` | Order in queue |
| `activatedAt, completedAt` | `Date` | Timestamps |
| `isLocked` | `Boolean` | Locked when pending config |
| `pendingConfigReason` | enum | What's missing |
| `mmsaYard, tangaYard, darYard` | `Number` | Yard top-up fuel |
| `darGoing, moroGoing, mbeyaGoing, tdmGoing, zambiaGoing, congoFuel` | `Number` | Going checkpoints |
| `zambiaReturn, tundumaReturn, mbeyaReturn, moroReturn, darReturn, tangaReturn` | `Number` | Return checkpoints |
| `balance` | `Number` | Remaining fuel balance |
| `originalGoingFrom, originalGoingTo` | `String` | Pre-EXPORT-change locations |
| `isCancelled, cancelledAt, cancellationReason, cancelledBy` | various | Cancellation |
| `isDeleted / deletedAt` | various | Soft delete |

**Indexes:** `truckNo`, `date`, `goingDo`, `returnDo`, `isDeleted`, `month`, `journeyStatus` + compound indexes for queue management and yard fuel auto-linking.

---

### `YardFuelDispense`

**Collection:** `yardfueldispenses`

| Field | Type | Description |
|---|---|---|
| `date` | `String` | Dispense date |
| `truckNo` | `String` | Truck receiving fuel |
| `liters` | `Number` | Quantity |
| `yard` | `'DAR YARD'\|'TANGA YARD'\|'MMSA YARD'` | Dispensing yard |
| `enteredBy` | `String` | Username |
| `timestamp` | `Date` | Entry timestamp |
| `notes` | `String` | Optional notes |
| `linkedFuelRecordId` | `String` | Auto/manually linked record |
| `linkedDONumber` | `String` | Matched DO number |
| `autoLinked` | `Boolean` | Whether auto-linked |
| `status` | `'pending'\|'linked'\|'manual'` | Link status |
| `rejectionReason, rejectedBy, rejectedAt` | various | Rejection tracking |
| `isDeleted / deletedAt` | various | Soft delete |
| `history` | sub-array | Action history (created/updated/linked/rejected) |

---

### `AuditLog`

**Collection:** `audit_logs`

| Field | Type | Description |
|---|---|---|
| `timestamp` | `Date` | Event time |
| `userId` | `String` | User MongoDB ID |
| `username` | `String` | Username |
| `action` | `AuditAction` enum | Action type |
| `resourceType` | `String` | Resource name (e.g., `delivery_order`) |
| `resourceId` | `String` | Resource ID |
| `previousValue, newValue` | `Mixed` | Before/after state |
| `ipAddress` | `String` | Client IP |
| `userAgent` | `String` | Browser/client info |
| `details` | `String` | Human-readable description |
| `severity` | `'low'\|'medium'\|'high'\|'critical'` | Event severity |

**AuditAction enum values:** `CREATE`, `UPDATE`, `DELETE`, `RESTORE`, `PERMANENT_DELETE`, `LOGIN`, `LOGOUT`, `FAILED_LOGIN`, `PASSWORD_RESET`, `CONFIG_CHANGE`, `BULK_OPERATION`, `EXPORT`, `ENABLE_MAINTENANCE`, `DISABLE_MAINTENANCE`

**Static methods:** `logAction(data)`, `getLogs(options)`

**Indexes:** `timestamp`, `action+timestamp`, `resourceType+resourceId`, `username+timestamp`

---

### `User` — `DriverCredential`

**Collection:** `drivercredentials`

Stores hashed PINs for driver truck-based authentication. Fields:
- `truckNo` — truck registration number (unique)
- `pin` — bcrypt-hashed PIN (excluded from default queries)
- `driverName` — driver's name
- `isActive` — active flag
- `lastLogin` — last login timestamp
- `createdBy, createdAt, updatedAt`

**Instance method:** `comparePin(candidate)` → `Promise<boolean>`

---

### `Notification`

Stores in-app notifications sent to users or roles.

- `type` — `missing_total_liters | missing_extra_fuel | both | yard_fuel_recorded | truck_pending_linking | truck_entry_rejected | info | warning | error`
- `relatedModel` — which collection the notification refers to
- `relatedId` — ID of the related document
- `recipients` — array of usernames or role names
- `isRead`, `readBy` — read tracking
- `status` — `pending | resolved | dismissed`

---

### `SystemConfig`

Stores the entire system configuration as a single document of type `'system'`. Key sub-sections:

| Section | Contents |
|---|---|
| `general` | systemName, timezone, dateFormat, language |
| `session` | Session timeout, JWT expiry, max login attempts |
| `email` | SMTP host, port, credentials |
| `fuelStations` | Array of `IFuelStation` objects |
| `routes` | Array of `IRouteConfig` objects |
| `truckBatches` | Array of `ITruckBatch` objects |
| `standardAllocations` | Default liter allocations per checkpoint |

---

### `FuelStationConfig`

Per-station fuel configuration stored as individual documents:

- `stationName` — e.g., "LAKE CHILABOMBWE"
- `defaultRate` — price per liter
- `defaultLitersGoing, defaultLitersReturning` — default fuel allocations
- `fuelRecordFieldGoing, fuelRecordFieldReturning` — which `FuelRecord` field to update
- `formulaGoing, formulaReturning` — optional formula strings
- `isActive`

---

### `RouteConfig`

- `routeName`, `origin`, `destination`
- `destinationAliases` — array of alternative destination spellings
- `routeType` — `'IMPORT' | 'EXPORT'`
- `defaultTotalLiters` — suggested total fuel for this route
- `description`, `isActive`

---

### `Backup` / `BackupSchedule`

Track backup history and schedules for Cloudflare R2 uploads. See type definitions in [Section 2](#2-technology-stack).

---

### `ArchivedData`

Stores records moved from active collections during monthly archival. Preserves original data and collection name for potential restore.

---

### `Checkpoint` / `TruckPosition` / `FleetSnapshot`

Support fleet tracking features:
- `Checkpoint` — geographic waypoints with coordinates and associated fuel station
- `TruckPosition` — current lat/lng/checkpoint for each truck
- `FleetSnapshot` — periodic snapshots of fleet positions

---

## 14. Services

### `websocket.ts` — Real-time Notifications

Initializes a Socket.IO server on the same HTTP server as Express. Authentication is handled via JWT in the WebSocket handshake.

**Room strategy:**
- `role:<roleName>` — role-based broadcast (e.g., `role:super_admin`)
- `user:<username>` — user-specific messages

**Exported functions:**

| Function | Description |
|---|---|
| `initializeWebSocket(server)` | Initialize Socket.IO and return the instance |
| `emitNotification(recipients, data)` | Send to specific users or roles |
| `emitToAll(event, data)` | Broadcast to all connected clients |
| `getConnectedUsersCount()` | Returns count of unique connected users |
| `isUserConnected(userId)` | Returns boolean |

Notifications are emitted automatically when:
- A yard fuel entry is recorded but cannot auto-link.
- A fuel record has pending configuration.
- A yard fuel entry is rejected.

---

### `emailService.ts` — Email Delivery

Uses Nodemailer. Configuration is loaded dynamically from `SystemConfig` (database) first, falling back to environment variables.

**Key methods:**

| Method | Description |
|---|---|
| `sendPasswordResetEmail(options)` | Sends HTML reset link email |
| `sendPasswordChangedEmail(email, name)` | Confirmation after password change |
| `sendUserCreatedEmail(email, name, password)` | New user welcome with temporary password |
| `sendCriticalAlert(options)` | High-priority system alert to super admins |

Email configuration can be overridden via `SystemConfig.systemSettings.email` at runtime without restarting the server.

---

### `backupService.ts` — Database Backup

Orchestrates MongoDB collection dumps and uploads to Cloudflare R2.

1. Queries all specified collections from MongoDB.
2. Serializes to JSON and compresses with `archiver`.
3. Streams the archive to R2 via `@aws-sdk/lib-storage`.
4. Creates a `Backup` document tracking status, file size, and metadata.

Manual trigger: `POST /api/backup/create`  
Presigned download URL: `GET /api/backup/:id/download`

---

### `archivalService.ts` — Data Archival

Moves old records from active collections to `ArchivedData` to keep the active DB lean.

**Policy:**
- Data older than **6 months** is archived.
- Audit logs older than **12 months** are archived.
- **Delivery Orders are never archived** (by design).
- Runs in batches of 1,000 to avoid memory spikes.

**Triggered by:**
- Automatic cron job (1st of each month at 2:00 AM) via `archivalScheduler.ts`.
- Manual API call `POST /api/archival/run`.
- CLI script `npm run archival:run`.

---

### `r2Service.ts` — Cloudflare R2 Client

Wraps `@aws-sdk/client-s3` for R2-compatible S3 operations. Provides:
- `upload(key, stream, contentType)` — stream upload
- `createPresignedUrl(key, expiresIn)` — temporary download URL
- `deleteObject(key)` — remove from bucket
- `listObjects(prefix)` — list stored backups

---

### `unifiedExportService.ts` — Excel/PDF Export

Uses ExcelJS to generate formatted spreadsheets for:
- Delivery Orders export
- LPO documents export
- Fuel records export
- Monthly summary sheets

Uses PDFKit (via `pdfGenerator.ts`) for print-ready PDF documents.

---

### `fleetReportParser.ts`

Parses fleet position data from external scanner reports and maps checkpoints to truck positions for fleet tracking visualization.

---

## 15. Utilities

### `logger.ts` — Winston Logger

Creates a Winston logger with multiple transports:

| Transport | File | Level | Max Size |
|---|---|---|---|
| File | `logs/error.log` | `error` | 5 MB (5 files) |
| File | `logs/app.log` | All | 5 MB (5 files) |
| File | `logs/exceptions.log` | Uncaught | — |
| File | `logs/rejections.log` | Unhandled | — |
| Console | — | All | — (dev only) |

Format: `YYYY-MM-DD HH:mm:ss [LEVEL]: message { meta }` in development; JSON in production.

---

### `auditService.ts` — Centralized Audit Logging

`AuditService` is a static class with methods for every auditable event:

| Method | Action logged |
|---|---|
| `logLogin(username, success, ip, ua, userId)` | `LOGIN` or `FAILED_LOGIN` |
| `logLogout(userId, username, ip)` | `LOGOUT` |
| `logPasswordReset(userId, username, ip)` | `PASSWORD_RESET` |
| `logCreate(userId, username, resource, id, newValue, ip)` | `CREATE` |
| `logUpdate(userId, username, resource, id, prev, next, ip)` | `UPDATE` |
| `logDelete(userId, username, resource, id, prev, ip)` | `DELETE` |
| `logRestore(userId, username, resource, id, ip)` | `RESTORE` |
| `logPermanentDelete(userId, username, resource, id, prev, ip)` | `PERMANENT_DELETE` |
| `logConfigChange(userId, username, configType, prev, next, ip)` | `CONFIG_CHANGE` |
| `logBulkOperation(userId, username, resource, op, count, ip)` | `BULK_OPERATION` |
| `logExport(userId, username, resource, format, count, ip)` | `EXPORT` |
| `getLogs(options)` | Query audit logs with filters + pagination |
| `getActivitySummary(days)` | Aggregated action counts per day |
| `getRecentCriticalEvents(limit)` | Latest high/critical severity events |

Audit logging **never throws** — failures are caught and logged but do not interrupt the main operation.

---

### `pagination.ts`

```ts
getPaginationParams(query): { page, limit, sort, order }
createPaginatedResponse(data, page, limit, total): PaginatedResponse<T>
calculateSkip(page, limit): number
```

Default: `page=1`, `limit=10`, max `limit=100`.

---

### `jwt.ts`

See [Section 9.1](#91-jwt-tokens).

---

### `databaseMonitor.ts`

Uses Mongoose's `db.admin()` and collection stats commands to collect:
- Connection pool metrics
- Query performance stats
- Storage usage per collection
- Slow query detection

Exposed via `GET /api/system-admin/analytics/database`.

---

### `doNumberFormatter.ts`

Normalizes and formats DO numbers for consistent display and deduplication across import/export data.

---

### `truckNumber.ts`

Normalizes truck numbers between space and hyphen formats (e.g., `T991 EFN` ↔ `T991-EFN`). Also provides `createDriverUserId(truckNo)` to generate safe MongoDB-compatible virtual driver IDs.

---

### `pdfGenerator.ts`

PDFKit-based document generator for formatted print layouts (LPO documents, monthly summaries, delivery notes).

---

### `monthlySheetGenerator.ts`

Generates Excel workbooks for monthly fuel and LPO summaries, separated by station and month.

---

### `sanitize.ts`

Input sanitization helpers used before saving user-supplied text to prevent XSS and injection.

---

### `formatters.ts`

Date, number, and currency formatting helpers consistent with the East African timezone (`Africa/Dar_es_Salaam`).

---

## 16. Jobs & Schedulers

### `archivalScheduler.ts`

**File:** `src/jobs/archivalScheduler.ts`

| Function | Description |
|---|---|
| `startArchivalScheduler()` | Registers the cron job (called at server startup) |
| `stopArchivalScheduler()` | Stops the cron job |
| `runArchivalNow(dryRun)` | Execute archival immediately |

**Cron schedule:** `0 2 1 * *` — runs at **02:00 AM on the 1st of every month**.

**Archival policy:**
- `monthsToKeep: 6` — moves operational data older than 6 months.
- `auditLogMonthsToKeep: 12` — moves audit logs older than 12 months.
- `batchSize: 1000` — processes 1,000 records per batch.
- Delivery Orders are **never archived**.

---

## 17. Seed Scripts

Run with `npm run <script>` (uses `ts-node` directly):

| Script | npm Command | Description |
|---|---|---|
| `seedSuperAdmin.ts` | `npm run seed:super` | Creates the initial `super_admin` user |
| `seedAdmins.ts` | `npm run seed:admins` | Seeds admin-level users |
| `seedAllRoles.ts` | `npm run seed:all` | Seeds sample users for all 19 roles |
| `seedUsers.ts` | — | Seeds a set of sample users |
| `seedManagerUsers.ts` | — | Seeds manager-level users |
| `seedRoutesAndStations.ts` | — | Seeds `FuelStationConfig` and `RouteConfig` |
| `seedCheckpoints.ts` | `npm run seed:checkpoints` | Seeds route checkpoint coordinates |
| `setupDriverCredentials.ts` | `npm run setup-driver-credentials` | Creates PIN credentials for sample trucks |
| `clearDatabase.ts` | `npm run db:clear` | Drops all collections (with confirmation) |
| `clearDatabase.ts --force` | `npm run db:clear:force` | Drops all collections without confirmation |

---

## 18. Migration Scripts

One-time data migration scripts:

| Script | npm Command | Description |
|---|---|---|
| `migrateFuelCalculationLogic.ts` | `npm run migrate:fuel-logic` | Re-calculates balance for existing records |
| `migrateJourneyStatus.ts` | — | Backfills `journeyStatus` field on old records |
| `migrateActualDateForLPOs.ts` | `npm run migrate:lpo-dates` | Extracts actual dates from LPO records |
| `migrateTruckBatchesToDynamic.ts` | — | Migrates static batch configs to dynamic format |
| `relink-pending-yard-fuel.ts` | `npm run relink-yard-fuel` | Re-runs auto-linking for pending yard fuel entries |
| `verifyBalanceCalculation.ts` | `npm run verify:balance` | Validates balance calculation correctness |
| `verifyCheckpoints.ts` | — | Verifies checkpoint data integrity |
| `updateCheckpointCoordinates.ts` | — | Updates GPS coordinates for checkpoints |
| `testArchival.js` | `npm run archival:test` | Dry-run archival to preview what would be archived |
| `testArchival.js --execute` | `npm run archival:run` | Execute archival immediately |
| `testArchival.js --stats-only` | `npm run archival:stats` | Show archival statistics only |

---

## 19. Logging

**Logger:** Winston (`src/utils/logger.ts`)

### Log Files

| File | Content |
|---|---|
| `logs/app.log` | All log levels (info, warn, error, debug) |
| `logs/error.log` | Error-level only |
| `logs/exceptions.log` | Uncaught exceptions |
| `logs/rejections.log` | Unhandled promise rejections |

Files rotate at **5 MB**, keeping the last **5** files.

### Log Levels

`error` → `warn` → `info` → `http` → `verbose` → `debug` → `silly`

Default level: `info` (override with `LOG_LEVEL` env var).

### HTTP Request Logging

- **Development:** `morgan('dev')` — colorized, concise format to console.
- **Production:** `morgan('combined')` — Apache combined format piped to Winston `info`.

### What Gets Logged

- Server startup and shutdown events
- MongoDB connection state changes
- Every HTTP request (via morgan)
- Authentication events (login, logout, failed attempts)
- CSRF token generation and validation
- WebSocket connect/disconnect events
- All audit actions (via `AuditService`)
- Archival job start/progress/completion
- Email send attempts and failures
- Unhandled errors (with stack traces)

---

## 20. Testing

**Test Runner:** Jest  
**Test Database:** `mongodb-memory-server` (in-memory MongoDB)  
**HTTP Testing:** Supertest

### Scripts

```bash
npm test                   # Run all tests
npm run test:watch         # Watch mode
npm run test:coverage      # Coverage report
npm run test:unit          # Unit tests only
npm run test:integration   # Integration tests only
```

### Test Location

Tests live in `src/__tests__/`:

```
src/__tests__/
├── helpers/           # Test utilities, factories, setup
├── unit/              # Unit tests for controllers, utils, services
└── integration/       # Full HTTP integration tests with supertest
```

Coverage reports output to `backend/coverage/`.

### Jest Configuration (`jest.config.js`)

- `preset: 'ts-jest'` — TypeScript support
- `testEnvironment: 'node'`
- `globalSetup` / `globalTeardown` — starts and stops `mongodb-memory-server`

---

## 21. Build & Deployment

### Build

```bash
npm run build
```

Compiles TypeScript to `backend/dist/`. Entry point: `dist/server.js`.

### Linting

```bash
npm run lint
```

ESLint with TypeScript plugin. Checks `src/**/*.ts`.

### Starting in Production

```bash
NODE_ENV=production npm start
```

### Process Management (PM2)

Recommended for production:

```bash
pm2 start dist/server.js --name "fuel-order-api" --env production
pm2 startup
pm2 save
```

### Important Production Notes

1. Set `NODE_ENV=production` — enables strict CSRF cookie settings, JSON-only logging, and disables dev stack traces in error responses.
2. Use a strong, randomly generated `JWT_SECRET` and `JWT_REFRESH_SECRET` (at least 64 bytes).
3. Configure CORS: set `CORS_ORIGIN` to only your frontend domain(s).
4. Configure SMTP credentials for password reset and user creation emails.
5. Configure R2 credentials if automatic backups are required.
6. Ensure the `logs/` directory is writable by the process user.
7. Use a reverse proxy (nginx) with TLS termination in front of the Express server.

### MongoDB Indexes

All indexes are defined in model schemas. Mongoose automatically creates them on startup. For large collections, create indexes manually before deployment to avoid blocking:

```bash
db.fuelrecords.createIndex({ truckNo: 1, journeyStatus: 1, isDeleted: 1 })
db.deliveryorders.createIndex({ doNumber: 1 }, { unique: true })
db.lposummaries.createIndex({ lpoNo: 1 }, { unique: true })
```

---

## Appendix: Key Data Flows

### Yard Fuel Auto-Linking

```
POST /api/yard-fuel
  → yardFuelController.recordYardFuel()
  → Find active FuelRecord where truckNo matches AND journeyStatus = 'active'
  → If found:
      → Update FuelRecord.<yardField> += liters
      → Recalculate balance
      → Set YardFuelDispense.status = 'linked', linkedFuelRecordId
      → Emit WebSocket notification to operations staff
  → If not found:
      → Set YardFuelDispense.status = 'pending'
      → Create Notification for super_admin / admin roles
      → Emit WebSocket notification
```

### LPO Forwarding

```
POST /api/lpo-documents/:id/forward
  Body: { targetStation, defaultLiters, rate, date, orderOf }
  
  → Load source LPO → filter non-cancelled active entries
  → Create new LPOSummary with:
      station = targetStation
      entries = filtered entries with new liters/rate/amount
      forwardedFrom = { lpoId, lpoNo, station }
  → Audit log CREATE action
  → Return new LPO document
```

### Journey Status State Machine

```
FuelRecord created
  → journeyStatus: 'queued'
  
PUT /api/fuel-records/:id/journey-status { status: 'active' }
  → journeyStatus: 'active'
  → activatedAt = now
  → Notifications for pending config resolved if applicable

PUT /api/fuel-records/:id/journey-status { status: 'completed' }
  → journeyStatus: 'completed'
  → completedAt = now
  → Activate next queued record for same truck (if any)

PUT /api/fuel-records/:id/journey-status { status: 'cancelled' }
  → journeyStatus: 'cancelled'
  → isCancelled = true
  → Audit log
```

### Monthly Archival Process

```
node-cron fires on 1st of month at 2:00 AM
  → archivalService.archiveOldData({ monthsToKeep: 6, ... })
  → For each archivable collection:
      → Find documents where createdAt < (now - 6 months)
      → Insert into ArchivedData with original collection name
      → Mark originals as isDeleted = true (or hard delete based on config)
      → Log count and duration
  → Log totals to Winston
  → Creates no backup — only moves within DB
```

### Password Reset Flow

```
POST /api/auth/forgot-password { email }
  → Find user by email (soft-deleted excluded)
  → Generate 32-byte reset token → SHA-256 hash stored in DB
  → Set resetPasswordExpires = now + 30 minutes
  → Send email with raw token in URL
  → Always return 200 (prevents email enumeration)

POST /api/auth/reset-password { email, token, newPassword }
  → Hash provided token → find user where hash matches AND not expired
  → Set new bcrypt password
  → Clear resetPasswordToken, resetPasswordExpires, refreshToken
  → Log PASSWORD_RESET audit event
  → Send password-changed confirmation email
```
